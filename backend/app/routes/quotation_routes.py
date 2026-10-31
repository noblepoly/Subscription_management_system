import uuid
from datetime import datetime, timezone, date, timedelta
from decimal import Decimal, InvalidOperation
from flask import Blueprint, request, jsonify, g
from app.db import db_session
from app.models.quotation import QuotationTemplate, QuotationTemplateItem
from app.models.subscription import Subscription, SubscriptionItem
from app.models.plan import SubscriptionPlan
from app.models.product import Product, ProductVariant
from app.models.user import User
from app.models.tax_discount import TaxRate, Discount
from app.utils.security import login_required, role_required
from app.utils.financial import quantize_money, compute_totals

quotation_bp = Blueprint("quotations", __name__, url_prefix="/api/quotations")

@quotation_bp.route("", methods=["GET"])
@login_required
def list_quotations():
    """
    List quotation templates with their items.
    """
    query = QuotationTemplate.query
    include_inactive = request.args.get("include_inactive", "false").lower() == "true"
    if not include_inactive:
        query = query.filter(QuotationTemplate.is_active == True)

    search = request.args.get("search", "").strip()
    if search:
        search_pattern = f"%{search}%"
        query = query.filter(
            (QuotationTemplate.name.ilike(search_pattern)) |
            (QuotationTemplate.description.ilike(search_pattern))
        )

    quotations = query.order_by(QuotationTemplate.created_at.desc()).all()
    serialized = [q.to_dict() for q in quotations]

    return jsonify({
        "success": True,
        "total": len(serialized),
        "quotations": serialized,
        "data": {
            "total": len(serialized),
            "quotations": serialized
        }
    }), 200


@quotation_bp.route("/<uuid:quotation_id>", methods=["GET"])
@login_required
def get_quotation(quotation_id):
    """Get single quotation details."""
    quot = QuotationTemplate.query.filter_by(id=quotation_id).first()
    if not quot:
        return jsonify({
            "success": False,
            "error": "Quotation not found.",
            "code": "QUOTATION_NOT_FOUND"
        }), 404

    return jsonify({
        "success": True,
        "quotation": quot.to_dict(),
        "data": {
            "quotation": quot.to_dict()
        }
    }), 200


@quotation_bp.route("", methods=["POST"])
@role_required(["ADMIN", "STAFF"])
def create_quotation():
    """Create a new quotation template with items."""
    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    description = (data.get("description") or "").strip() or None
    plan_id_raw = data.get("plan_id")
    validity_days = int(data.get("default_validity_days") or 30)
    terms = (data.get("terms_and_conditions") or "").strip() or None
    items_data = data.get("items", [])

    if not name:
        return jsonify({
            "success": False,
            "error": "Quotation name is required.",
            "code": "MISSING_NAME"
        }), 400

    plan_id = None
    if plan_id_raw:
        try:
            plan_id = uuid.UUID(str(plan_id_raw))
        except (ValueError, TypeError):
            return jsonify({"success": False, "error": "Invalid plan ID.", "code": "INVALID_PLAN_ID"}), 400

    try:
        new_quot = QuotationTemplate(
            id=uuid.uuid4(),
            name=name,
            description=description,
            plan_id=plan_id,
            default_validity_days=validity_days,
            terms_and_conditions=terms,
            is_active=True,
            created_by=g.current_user.id
        )
        db_session.add(new_quot)
        db_session.flush()

        for it in items_data:
            prod_id = uuid.UUID(str(it["product_id"]))
            var_id = uuid.UUID(str(it["variant_id"])) if it.get("variant_id") else None
            qty = int(it.get("quantity") or 1)
            override_price = None
            if it.get("override_unit_price") is not None:
                override_price = quantize_money(it["override_unit_price"])

            q_item = QuotationTemplateItem(
                id=uuid.uuid4(),
                template_id=new_quot.id,
                product_id=prod_id,
                variant_id=var_id,
                quantity=qty,
                override_unit_price=override_price
            )
            db_session.add(q_item)

        db_session.commit()
        return jsonify({
            "success": True,
            "message": "Quotation created successfully.",
            "quotation": new_quot.to_dict(),
            "data": {
                "quotation": new_quot.to_dict()
            }
        }), 201

    except Exception as e:
        db_session.rollback()
        return jsonify({"success": False, "error": str(e), "code": "SERVER_ERROR"}), 500


@quotation_bp.route("/<uuid:quotation_id>", methods=["PUT"])
@role_required(["ADMIN", "STAFF"])
def update_quotation(quotation_id):
    """Update quotation template and its items."""
    quot = QuotationTemplate.query.filter_by(id=quotation_id).first()
    if not quot:
        return jsonify({"success": False, "error": "Quotation not found.", "code": "QUOTATION_NOT_FOUND"}), 404

    data = request.get_json() or {}
    if "name" in data and data["name"].strip():
        quot.name = data["name"].strip()
    if "description" in data:
        quot.description = data["description"].strip() if data["description"] else None
    if "default_validity_days" in data:
        quot.default_validity_days = int(data["default_validity_days"])
    if "terms_and_conditions" in data:
        quot.terms_and_conditions = data["terms_and_conditions"].strip() if data["terms_and_conditions"] else None
    if "plan_id" in data:
        quot.plan_id = uuid.UUID(str(data["plan_id"])) if data["plan_id"] else None
    if "is_active" in data:
        quot.is_active = bool(data["is_active"])

    if "items" in data:
        # Replace items
        QuotationTemplateItem.query.filter_by(template_id=quot.id).delete()
        for it in data["items"]:
            prod_id = uuid.UUID(str(it["product_id"]))
            var_id = uuid.UUID(str(it["variant_id"])) if it.get("variant_id") else None
            qty = int(it.get("quantity") or 1)
            override_price = quantize_money(it["override_unit_price"]) if it.get("override_unit_price") is not None else None
            q_item = QuotationTemplateItem(
                id=uuid.uuid4(),
                template_id=quot.id,
                product_id=prod_id,
                variant_id=var_id,
                quantity=qty,
                override_unit_price=override_price
            )
            db_session.add(q_item)

    try:
        db_session.commit()
        return jsonify({
            "success": True,
            "message": "Quotation updated successfully.",
            "quotation": quot.to_dict(),
            "data": {
                "quotation": quot.to_dict()
            }
        }), 200
    except Exception as e:
        db_session.rollback()
        return jsonify({"success": False, "error": str(e), "code": "SERVER_ERROR"}), 500


@quotation_bp.route("/<uuid:quotation_id>/convert", methods=["POST"])
@role_required(["ADMIN", "STAFF"])
def convert_quotation_to_subscription(quotation_id):
    """
    Convert quotation into an active/confirmed subscription for a customer.
    """
    quot = QuotationTemplate.query.filter_by(id=quotation_id).first()
    if not quot:
        return jsonify({"success": False, "error": "Quotation not found.", "code": "QUOTATION_NOT_FOUND"}), 404

    data = request.get_json() or {}
    customer_id_raw = data.get("customer_id")
    if not customer_id_raw:
        return jsonify({"success": False, "error": "customer_id is required.", "code": "MISSING_CUSTOMER"}), 400

    try:
        customer_id = uuid.UUID(str(customer_id_raw))
        customer = User.query.filter_by(id=customer_id, role="CUSTOMER").first()
        if not customer:
            return jsonify({"success": False, "error": "Customer account not found.", "code": "CUSTOMER_NOT_FOUND"}), 404

        plan_id = quot.plan_id
        if not plan_id:
            first_plan = SubscriptionPlan.query.filter_by(is_active=True).first()
            if not first_plan:
                return jsonify({"success": False, "error": "No active subscription plan found.", "code": "NO_PLAN"}), 400
            plan_id = first_plan.id

        plan = SubscriptionPlan.query.get(plan_id)

        # Count total subscriptions to generate sub number
        sub_count = Subscription.query.count() + 1
        sub_number = f"SUB-{date.today().year}-{sub_count:05d}"

        # Calculate subtotal from quotation items
        subtotal = Decimal("0.00")
        items_to_create = []

        for qi in quot.items:
            unit_price = qi.override_unit_price if qi.override_unit_price is not None else (qi.product.sales_price if qi.product else Decimal("0.00"))
            additional_price = qi.variant.additional_price if qi.variant else Decimal("0.00")
            line_tot = quantize_money((unit_price + additional_price) * Decimal(str(qi.quantity)))
            subtotal += line_tot

            items_to_create.append({
                "product_id": qi.product_id,
                "variant_id": qi.variant_id,
                "quantity": qi.quantity,
                "unit_price": unit_price,
                "additional_price": additional_price,
                "line_total": line_tot
            })

        # Apply default tax if active
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
            template_id=quot.id,
            tax_rate_id=tax.id if tax else None,
            status="CONFIRMED", # Converted goes to CONFIRMED
            quotation_valid_until=date.today() + timedelta(days=quot.default_validity_days),
            start_date=now,
            next_billing_date=now + timedelta(days=30),
            subtotal=subtotal,
            discount_amount=Decimal("0.00"),
            tax_amount=tax_amount,
            recurring_total=recurring_total,
            notes=f"Converted from quotation: {quot.name}",
            created_by=g.current_user.id
        )
        db_session.add(sub)
        db_session.flush()

        for it in items_to_create:
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
            "message": f"Quotation converted to subscription {sub_number} successfully.",
            "subscription": sub.to_dict(),
            "data": {
                "subscription": sub.to_dict()
            }
        }), 201

    except Exception as e:
        db_session.rollback()
        return jsonify({"success": False, "error": str(e), "code": "SERVER_ERROR"}), 500
