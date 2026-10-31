import uuid
from datetime import datetime, timezone, date, timedelta
from decimal import Decimal, InvalidOperation
from flask import Blueprint, request, jsonify, g
from sqlalchemy.exc import IntegrityError
import app.db
from app.db import db_session
from app.models.subscription import Subscription, SubscriptionItem
from app.models.plan import SubscriptionPlan
from app.models.tax_discount import TaxRate, Discount
from app.models.product import Product, ProductVariant
from app.models.user import User
from app.utils.security import login_required, role_required
from app.utils.financial import quantize_money, compute_totals
from app.services.billing_engine import compute_next_billing_date

subscription_bp = Blueprint("subscriptions", __name__, url_prefix="/api/subscriptions")

@subscription_bp.route("", methods=["GET"])
@login_required
def list_subscriptions():
    """
    List subscriptions with role-based scoping and filtering.
    Customers can only view their own subscriptions.
    Staff and Admin can view all or filter by customer_id.
    """
    query = Subscription.query

    # Enforce customer data isolation
    if g.current_user.role == "CUSTOMER":
        query = query.filter(Subscription.customer_id == g.current_user.id)
    else:
        cust_id = request.args.get("customer_id") or request.args.get("customerId")
        if cust_id:
            try:
                cust_uuid = uuid.UUID(cust_id)
                query = query.filter(Subscription.customer_id == cust_uuid)
            except ValueError:
                return jsonify({
                    "success": False,
                    "error": "Invalid customer_id format.",
                    "code": "INVALID_CUSTOMER_ID"
                }), 400

    status = (request.args.get("status") or "").strip().upper()
    if status and status != "ALL":
        query = query.filter(Subscription.status == status)

    search = (request.args.get("search") or "").strip()
    if search:
        search_pattern = f"%{search}%"
        query = query.join(Subscription.customer).filter(
            (Subscription.subscription_number.ilike(search_pattern)) |
            (User.full_name.ilike(search_pattern)) |
            (User.email.ilike(search_pattern))
        )

    subscriptions = query.order_by(Subscription.created_at.desc()).all()
    serialized = [s.to_dict() for s in subscriptions]

    return jsonify({
        "success": True,
        "total": len(serialized),
        "subscriptions": serialized,
        "data": {
            "total": len(serialized),
            "subscriptions": serialized
        }
    }), 200


@subscription_bp.route("/<uuid:sub_id>", methods=["GET"])
@login_required
def get_subscription(sub_id):
    """Get single subscription details with customer access check."""
    sub = Subscription.query.filter_by(id=sub_id).first()
    if not sub:
        return jsonify({
            "success": False,
            "error": "Subscription not found.",
            "code": "SUBSCRIPTION_NOT_FOUND"
        }), 404

    # Scoping check
    if g.current_user.role == "CUSTOMER" and sub.customer_id != g.current_user.id:
        return jsonify({
            "success": False,
            "error": "Access denied to customer subscription.",
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
@login_required
def create_subscription():
    """
    Create a new subscription with line items and financial totals.
    Customers can only create subscriptions for themselves.
    Staff and Admins can create subscriptions for any customer.
    """
    data = request.get_json() or {}

    # Target customer
    if g.current_user.role == "CUSTOMER":
        target_customer_id = g.current_user.id
    else:
        cust_id_raw = data.get("customer_id") or data.get("customerId")
        if not cust_id_raw:
            return jsonify({
                "success": False,
                "error": "customer_id is required.",
                "code": "MISSING_CUSTOMER_ID"
            }), 400
        try:
            target_customer_id = uuid.UUID(str(cust_id_raw))
        except ValueError:
            return jsonify({
                "success": False,
                "error": "Invalid customer_id format.",
                "code": "INVALID_CUSTOMER_ID"
            }), 400

    target_customer = User.query.filter_by(id=target_customer_id).first()
    if not target_customer:
        return jsonify({
            "success": False,
            "error": "Customer not found.",
            "code": "CUSTOMER_NOT_FOUND"
        }), 404

    # Plan
    plan_id_raw = data.get("plan_id") or data.get("planId")
    if not plan_id_raw:
        return jsonify({
            "success": False,
            "error": "plan_id is required.",
            "code": "MISSING_PLAN_ID"
        }), 400
    try:
        plan_id = uuid.UUID(str(plan_id_raw))
    except ValueError:
        return jsonify({
            "success": False,
            "error": "Invalid plan_id format.",
            "code": "INVALID_PLAN_ID"
        }), 400

    plan = SubscriptionPlan.query.filter_by(id=plan_id).first()
    if not plan or not plan.is_active:
        return jsonify({
            "success": False,
            "error": "Subscription plan not found or inactive.",
            "code": "PLAN_NOT_FOUND"
        }), 404

    # Discount & Tax Rate optional references
    discount_obj = None
    discount_id_raw = data.get("discount_id")
    if discount_id_raw:
        try:
            discount_obj = Discount.query.filter_by(id=uuid.UUID(str(discount_id_raw))).first()
        except ValueError:
            pass

    tax_rate_obj = None
    tax_rate_id_raw = data.get("tax_rate_id")
    if tax_rate_id_raw:
        try:
            tax_rate_obj = TaxRate.query.filter_by(id=uuid.UUID(str(tax_rate_id_raw))).first()
        except ValueError:
            pass

    # Status
    status = (data.get("status") or "CONFIRMED").upper()
    if status not in ("DRAFT", "QUOTATION", "CONFIRMED", "ACTIVE"):
        status = "CONFIRMED"

    # Start date & billing schedule
    start_date = None
    if data.get("start_date"):
        try:
            start_date = datetime.fromisoformat(str(data["start_date"]).replace("Z", "+00:00"))
        except ValueError:
            start_date = datetime.now(timezone.utc)
    else:
        start_date = datetime.now(timezone.utc)

    # Next billing date
    start_d = start_date.date() if hasattr(start_date, "date") else date.today()
    next_billing_d = compute_next_billing_date(start_d, plan.billing_interval, plan.interval_count)
    next_billing_date = datetime.combine(next_billing_d, datetime.min.time(), tzinfo=timezone.utc)

    # Expiry date
    expiry_date = None
    if data.get("expiry_date"):
        try:
            expiry_date = datetime.fromisoformat(str(data["expiry_date"]).replace("Z", "+00:00"))
        except ValueError:
            expiry_date = None

    # Generate unique subscription number
    sub_count = Subscription.query.count() + 1
    sub_number = f"SUB-{date.today().year}-{sub_count:05d}"
    while Subscription.query.filter_by(subscription_number=sub_number).first():
        sub_count += 1
        sub_number = f"SUB-{date.today().year}-{sub_count:05d}"

    # Build line items
    raw_items = data.get("items", [])
    processed_items = []
    
    if raw_items:
        for it in raw_items:
            prod_id_raw = it.get("product_id")
            if not prod_id_raw:
                continue
            try:
                prod_id = uuid.UUID(str(prod_id_raw))
            except ValueError:
                continue
            prod = Product.query.filter_by(id=prod_id).first()
            if not prod:
                continue
            
            variant_id = None
            add_price = Decimal("0.00")
            if it.get("variant_id"):
                try:
                    var_id = uuid.UUID(str(it["variant_id"]))
                    var = ProductVariant.query.filter_by(id=var_id).first()
                    if var:
                        variant_id = var.id
                        add_price = quantize_money(var.additional_price)
                except ValueError:
                    pass

            qty = int(it.get("quantity", 1))
            unit_price = quantize_money(it.get("unit_price", prod.sales_price))
            additional_price = quantize_money(it.get("additional_price", add_price))
            line_total = quantize_money((unit_price + additional_price) * Decimal(str(qty)))

            processed_items.append({
                "product_id": prod.id,
                "variant_id": variant_id,
                "quantity": qty,
                "unit_price": unit_price,
                "additional_price": additional_price,
                "line_total": line_total
            })

    # If no items explicitly supplied, fallback to plan base price as single item or service item
    if not processed_items:
        first_prod = Product.query.filter_by(is_active=True).first()
        if first_prod:
            unit_price = quantize_money(plan.base_price)
            processed_items.append({
                "product_id": first_prod.id,
                "variant_id": None,
                "quantity": 1,
                "unit_price": unit_price,
                "additional_price": Decimal("0.00"),
                "line_total": unit_price
            })

    subtotal, discount_amount, taxable_base, tax_amount, recurring_total = compute_totals(
        processed_items,
        discount_obj=discount_obj,
        tax_rate_obj=tax_rate_obj
    )

    subscription = Subscription(
        id=uuid.uuid4(),
        subscription_number=sub_number,
        customer_id=target_customer.id,
        plan_id=plan.id,
        discount_id=discount_obj.id if discount_obj else None,
        tax_rate_id=tax_rate_obj.id if tax_rate_obj else None,
        status=status,
        start_date=start_date,
        expiry_date=expiry_date,
        next_billing_date=next_billing_date,
        subtotal=subtotal,
        discount_amount=discount_amount,
        tax_amount=tax_amount,
        recurring_total=recurring_total,
        notes=(data.get("notes") or "").strip() or None,
        created_by=g.current_user.id
    )
    app.db.db_session.add(subscription)
    app.db.db_session.flush()

    for pit in processed_items:
        sub_item = SubscriptionItem(
            id=uuid.uuid4(),
            subscription_id=subscription.id,
            product_id=pit["product_id"],
            variant_id=pit["variant_id"],
            quantity=pit["quantity"],
            unit_price=pit["unit_price"],
            additional_price=pit["additional_price"],
            line_total=pit["line_total"]
        )
        app.db.db_session.add(sub_item)

    try:
        app.db.db_session.commit()
    except Exception as e:
        app.db.db_session.rollback()
        return jsonify({
            "success": False,
            "error": "Database error creating subscription.",
            "code": "DB_ERROR",
            "details": str(e)
        }), 500

    return jsonify({
        "success": True,
        "subscription": subscription.to_dict(),
        "data": {
            "subscription": subscription.to_dict()
        }
    }), 201


@subscription_bp.route("/<uuid:sub_id>/status", methods=["POST"])
@login_required
def update_subscription_status(sub_id):
    """
    Perform a lifecycle status transition on a subscription.
    Supported actions: CONFIRM, ACTIVATE, PAUSE, RESUME, CLOSE, RENEW, CANCEL
    """
    sub = Subscription.query.filter_by(id=sub_id).first()
    if not sub:
        return jsonify({
            "success": False,
            "error": "Subscription not found.",
            "code": "SUBSCRIPTION_NOT_FOUND"
        }), 404

    # Customer access scoping: customer can only modify their own subscription
    if g.current_user.role == "CUSTOMER":
        if sub.customer_id != g.current_user.id:
            return jsonify({
                "success": False,
                "error": "Access denied.",
                "code": "FORBIDDEN"
            }), 403

    data = request.get_json() or {}
    action = (data.get("action") or "").upper().strip()
    closure_reason = (data.get("closure_reason") or "").strip() or None

    now = datetime.now(timezone.utc)

    if action == "CONFIRM":
        if sub.status not in ("DRAFT", "QUOTATION"):
            return jsonify({"success": False, "error": f"Cannot confirm from {sub.status}", "code": "INVALID_TRANSITION"}), 400
        sub.status = "CONFIRMED"

    elif action == "ACTIVATE":
        if sub.status not in ("CONFIRMED", "PAUSED"):
            return jsonify({"success": False, "error": f"Cannot activate from {sub.status}", "code": "INVALID_TRANSITION"}), 400
        sub.status = "ACTIVE"
        if not sub.start_date:
            sub.start_date = now
        sub.paused_at = None

    elif action == "PAUSE":
        if sub.status != "ACTIVE":
            return jsonify({"success": False, "error": f"Cannot pause from {sub.status}", "code": "INVALID_TRANSITION"}), 400
        sub.status = "PAUSED"
        sub.paused_at = now

    elif action == "RESUME":
        if sub.status != "PAUSED":
            return jsonify({"success": False, "error": f"Cannot resume from {sub.status}", "code": "INVALID_TRANSITION"}), 400
        sub.status = "ACTIVE"
        sub.paused_at = None

    elif action == "CLOSE":
        if sub.status in ("CLOSED", "CANCELLED"):
            return jsonify({"success": False, "error": f"Subscription is already in terminal state {sub.status}", "code": "TERMINAL_STATE"}), 400
        sub.status = "CLOSED"
        sub.closed_at = now
        sub.closure_reason = closure_reason or "Closed per request"

    elif action == "RENEW":
        sub.status = "ACTIVE"
        sub.paused_at = None
        sub.closed_at = None
        sub.closure_reason = None
        sub.expiry_date = now + timedelta(days=365)

    elif action == "CANCEL":
        if sub.status in ("CLOSED", "CANCELLED"):
            return jsonify({"success": False, "error": f"Subscription is already {sub.status}", "code": "TERMINAL_STATE"}), 400
        sub.status = "CANCELLED"
        sub.closed_at = now
        sub.closure_reason = closure_reason or "Cancelled by user"

    else:
        return jsonify({
            "success": False,
            "error": f"Invalid lifecycle action: {action}",
            "code": "INVALID_ACTION"
        }), 400

    try:
        app.db.db_session.commit()
    except Exception as e:
        app.db.db_session.rollback()
        return jsonify({
            "success": False,
            "error": "Database error updating subscription status.",
            "code": "DB_ERROR"
        }), 500

    return jsonify({
        "success": True,
        "subscription": sub.to_dict(),
        "data": {
            "subscription": sub.to_dict()
        }
    }), 200
