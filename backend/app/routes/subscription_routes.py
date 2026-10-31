import uuid
from datetime import datetime, timezone, date, timedelta
from decimal import Decimal
from flask import Blueprint, request, jsonify, g
from app.db import db_session
from app.models.subscription import Subscription, SubscriptionItem
from app.models.plan import SubscriptionPlan
from app.models.product import Product, ProductVariant
from app.models.user import User
from app.models.tax_discount import TaxRate, Discount
from app.utils.security import login_required, role_required
from app.utils.financial import quantize_money, compute_totals

subscription_bp = Blueprint("subscriptions", __name__, url_prefix="/api/subscriptions")

@subscription_bp.route("", methods=["GET"])
@login_required
def list_subscriptions():
    """
    List subscriptions.
    - If user is CUSTOMER: strictly scoped to g.current_user.id
    - If user is ADMIN or STAFF: can view all or filter by customer_id or status
    """
    query = Subscription.query

    # Enforce customer isolation
    if g.current_user.role == "CUSTOMER":
        query = query.filter(Subscription.customer_id == g.current_user.id)
    else:
        cust_id = request.args.get("customer_id")
        if cust_id:
            try:
                query = query.filter(Subscription.customer_id == uuid.UUID(str(cust_id)))
            except (ValueError, TypeError):
                pass

    status = request.args.get("status")
    if status and status.upper() != "ALL":
        query = query.filter(Subscription.status == status.upper())

    search = request.args.get("search", "").strip()
    if search:
        search_pattern = f"%{search}%"
        query = query.filter(Subscription.subscription_number.ilike(search_pattern))

    subs = query.order_by(Subscription.created_at.desc()).all()
    serialized = [s.to_dict() for s in subs]

    return jsonify({
        "success": True,
        "total": len(serialized),
        "subscriptions": serialized,
        "data": {
            "total": len(serialized),
            "subscriptions": serialized
        }
    }), 200


@subscription_bp.route("/<uuid:subscription_id>", methods=["GET"])
@login_required
def get_subscription(subscription_id):
    """
    Get full subscription details including plan and itemized products.
    Enforces customer ownership verification.
    """
    sub = Subscription.query.filter_by(id=subscription_id).first()
    if not sub:
        return jsonify({
            "success": False,
            "error": "Subscription not found.",
            "code": "SUBSCRIPTION_NOT_FOUND"
        }), 404

    # Security: Customer can only view their own subscription
    if g.current_user.role == "CUSTOMER" and sub.customer_id != g.current_user.id:
        return jsonify({
            "success": False,
            "error": "Access denied.",
            "code": "FORBIDDEN"
        }), 403

    return jsonify({
        "success": True,
        "subscription": sub.to_dict(),
        "data": {
            "subscription": sub.to_dict()
        }
    }), 200


@subscription_bp.route("", methods=["POST"])
@role_required(["ADMIN", "STAFF"])
def create_subscription():
    """
    Create a new subscription with items and pricing calculations.
    """
    data = request.get_json() or {}
    customer_id_raw = data.get("customer_id")
    plan_id_raw = data.get("plan_id")
    items_data = data.get("items", [])
    notes = (data.get("notes") or "").strip() or None
    initial_status = (data.get("status") or "CONFIRMED").upper()

    if not customer_id_raw or not plan_id_raw:
        return jsonify({
            "success": False,
            "error": "customer_id and plan_id are required.",
            "code": "MISSING_REQUIRED_FIELDS"
        }), 400

    try:
        customer_id = uuid.UUID(str(customer_id_raw))
        plan_id = uuid.UUID(str(plan_id_raw))

        customer = User.query.filter_by(id=customer_id).first()
        plan = SubscriptionPlan.query.filter_by(id=plan_id).first()
        if not customer:
            return jsonify({"success": False, "error": "Customer not found.", "code": "CUSTOMER_NOT_FOUND"}), 404
        if not plan:
            return jsonify({"success": False, "error": "Plan not found.", "code": "PLAN_NOT_FOUND"}), 404

        sub_count = Subscription.query.count() + 1
        sub_number = f"SUB-{date.today().year}-{sub_count:05d}"

        subtotal = Decimal("0.00")
        items_to_add = []

        for it in items_data:
            prod_id = uuid.UUID(str(it["product_id"]))
            var_id = uuid.UUID(str(it["variant_id"])) if it.get("variant_id") else None
            qty = int(it.get("quantity") or 1)

            prod = Product.query.get(prod_id)
            var = ProductVariant.query.get(var_id) if var_id else None

            unit_price = quantize_money(it.get("unit_price") or (prod.sales_price if prod else 0))
            additional_price = quantize_money(it.get("additional_price") or (var.additional_price if var else 0))
            line_total = quantize_money((unit_price + additional_price) * Decimal(str(qty)))
            subtotal += line_total

            items_to_add.append({
                "product_id": prod_id,
                "variant_id": var_id,
                "quantity": qty,
                "unit_price": unit_price,
                "additional_price": additional_price,
                "line_total": line_total
            })

        tax = TaxRate.query.filter_by(is_active=True).first()
        tax_rate_val = Decimal(str(tax.rate_percentage)) if tax else Decimal("0.000")
        tax_amount = quantize_money((subtotal * tax_rate_val) / Decimal("100.0"))
        recurring_total = subtotal + tax_amount

        now = datetime.now(timezone.utc)
        sub = Subscription(
            id=uuid.uuid4(),
            subscription_number=sub_number,
            customer_id=customer.id,
            plan_id=plan.id,
            tax_rate_id=tax.id if tax else None,
            status=initial_status,
            start_date=now,
            next_billing_date=now + timedelta(days=30),
            subtotal=subtotal,
            discount_amount=Decimal("0.00"),
            tax_amount=tax_amount,
            recurring_total=recurring_total,
            notes=notes,
            created_by=g.current_user.id
        )
        db_session.add(sub)
        db_session.flush()

        for it in items_to_add:
            s_item = SubscriptionItem(
                id=uuid.uuid4(),
                subscription_id=sub.id,
                product_id=it["product_id"],
                variant_id=it["variant_id"],
                quantity=it["quantity"],
                unit_price=it["unit_price"],
                additional_price=it["additional_price"],
                line_total=it["line_total"]
            )
            db_session.add(s_item)

        db_session.commit()
        return jsonify({
            "success": True,
            "message": "Subscription created successfully.",
            "subscription": sub.to_dict(),
            "data": {
                "subscription": sub.to_dict()
            }
        }), 201

    except Exception as e:
        db_session.rollback()
        return jsonify({"success": False, "error": str(e), "code": "SERVER_ERROR"}), 500


@subscription_bp.route("/<uuid:subscription_id>/status", methods=["POST"])
@role_required(["ADMIN", "STAFF"])
def update_subscription_status(subscription_id):
    """
    Execute lifecycle transitions on a subscription.
    Actions: 'ACTIVATE', 'PAUSE', 'RESUME', 'CLOSE', 'CANCEL', 'RENEW'
    """
    sub = Subscription.query.filter_by(id=subscription_id).first()
    if not sub:
        return jsonify({"success": False, "error": "Subscription not found.", "code": "SUBSCRIPTION_NOT_FOUND"}), 404

    data = request.get_json() or {}
    action = (data.get("action") or "").strip().upper()
    closure_reason = (data.get("closure_reason") or "").strip() or None

    now = datetime.now(timezone.utc)

    if action == "ACTIVATE":
        if sub.status not in ("CONFIRMED", "PAUSED", "DRAFT"):
            return jsonify({"success": False, "error": f"Cannot activate from status {sub.status}", "code": "INVALID_TRANSITION"}), 400
        sub.status = "ACTIVE"
        sub.start_date = sub.start_date or now
        sub.paused_at = None

    elif action == "PAUSE":
        if sub.status != "ACTIVE":
            return jsonify({"success": False, "error": "Only ACTIVE subscriptions can be paused.", "code": "INVALID_TRANSITION"}), 400
        sub.status = "PAUSED"
        sub.paused_at = now

    elif action == "RESUME":
        if sub.status != "PAUSED":
            return jsonify({"success": False, "error": "Only PAUSED subscriptions can be resumed.", "code": "INVALID_TRANSITION"}), 400
        sub.status = "ACTIVE"
        sub.paused_at = None

    elif action == "CLOSE":
        if sub.status not in ("ACTIVE", "PAUSED"):
            return jsonify({"success": False, "error": f"Cannot close subscription from status {sub.status}", "code": "INVALID_TRANSITION"}), 400
        sub.status = "CLOSED"
        sub.closed_at = now
        sub.closure_reason = closure_reason or "Closed by staff request"

    elif action == "CANCEL":
        if sub.status in ("CLOSED", "CANCELLED"):
            return jsonify({"success": False, "error": "Subscription is already terminated.", "code": "TERMINAL_STATE"}), 400
        sub.status = "CANCELLED"
        sub.closed_at = now
        sub.closure_reason = closure_reason or "Cancelled"

    elif action == "RENEW":
        sub.status = "ACTIVE"
        sub.expiry_date = now + timedelta(days=365)
        sub.next_billing_date = now + timedelta(days=30)
        sub.paused_at = None

    else:
        return jsonify({"success": False, "error": f"Unknown lifecycle action: {action}", "code": "INVALID_ACTION"}), 400

    try:
        db_session.commit()
        return jsonify({
            "success": True,
            "message": f"Subscription {sub.subscription_number} status updated to {sub.status}.",
            "subscription": sub.to_dict(),
            "data": {
                "subscription": sub.to_dict()
            }
        }), 200
    except Exception as e:
        db_session.rollback()
        return jsonify({"success": False, "error": str(e), "code": "SERVER_ERROR"}), 500
