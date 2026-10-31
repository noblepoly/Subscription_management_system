import uuid
from datetime import datetime, timezone, timedelta, date
from decimal import Decimal, InvalidOperation
from flask import Blueprint, request, jsonify, g
from sqlalchemy.exc import IntegrityError

from app.db import db_session
from app.models.quotation import QuotationTemplate, QuotationTemplateItem
from app.models.subscription import Subscription, SubscriptionItem
from app.models.plan import SubscriptionPlan
from app.models.product import Product, ProductVariant
from app.models.user import User
from app.models.tax_discount import TaxRate, Discount
from app.utils.security import role_required, login_required
from app.utils.financial import quantize_money, compute_totals

quotation_bp = Blueprint("quotations", __name__, url_prefix="/api/quotations")

@quotation_bp.route("/<uuid:quotation_id>", methods=["PUT"])
@role_required(["ADMIN", "STAFF"])
def update_quotation(quotation_id):
    """Update a quotation template and optionally replace its items."""
    quot = QuotationTemplate.query.filter_by(id=quotation_id).first()

    if not quot:
        return jsonify({
            "success": False,
            "error": "Quotation not found",
            "code": "QUOTATION_NOT_FOUND"
        }), 404

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "A valid JSON object is required"}), 400

    # Validate and prepare scalar fields before changing the model.
    updates = {}

    if "name" in data:
        name = data["name"]
        if not isinstance(name, str) or not name.strip():
            return jsonify({"error": "Quotation name is required"}), 400
        if len(name.strip()) > 150:
            return jsonify({"error": "Quotation name cannot exceed 150 characters"}), 400
        updates["name"] = name.strip()

    for field in ("description", "terms_and_conditions"):
        if field in data:
            value = data[field]
            if value is not None and not isinstance(value, str):
                return jsonify({"error": f"{field} must be a string or null"}), 400
            updates[field] = value.strip() or None if value else None

    if "default_validity_days" in data:
        try:
            validity = int(data["default_validity_days"])
            if isinstance(data["default_validity_days"], bool) or validity < 1:
                raise ValueError
            updates["default_validity_days"] = validity
        except (ValueError, TypeError, OverflowError):
            return jsonify({"error": "default_validity_days must be an integer of at least 1"}), 400

    if "is_active" in data:
        if not isinstance(data["is_active"], bool):
            return jsonify({"error": "is_active must be true or false"}), 400
        updates["is_active"] = data["is_active"]

    if "plan_id" in data:
        if data["plan_id"]:
            try:
                plan_id = uuid.UUID(str(data["plan_id"]))
            except (ValueError, TypeError, AttributeError):
                return jsonify({"error": "Invalid plan_id UUID"}), 400

            plan = SubscriptionPlan.query.filter_by(id=plan_id).first()
            if not plan:
                return jsonify({"error": "Referenced subscription plan does not exist"}), 400

            updates["plan_id"] = plan_id
        else:
            updates["plan_id"] = None

    # Validate all replacement items before touching existing items.
    prepared_items = None

    if "items" in data:
        items_data = data["items"]

        if not isinstance(items_data, list):
            return jsonify({"error": "items must be a list"}), 400

        prepared_items = []

        for idx, item in enumerate(items_data):
            if not isinstance(item, dict):
                return jsonify({"error": f"Item at index {idx} must be an object"}), 400

            try:
                product_id = uuid.UUID(str(item.get("product_id")))
            except (ValueError, TypeError, AttributeError):
                return jsonify({"error": f"Item at index {idx} has invalid product_id"}), 400

            product = Product.query.filter_by(id=product_id).first()
            if not product:
                return jsonify({"error": f"Product at index {idx} does not exist"}), 400

            variant_id = None
            if item.get("variant_id"):
                try:
                    variant_id = uuid.UUID(str(item["variant_id"]))
                except (ValueError, TypeError, AttributeError):
                    return jsonify({"error": f"Item at index {idx} has invalid variant_id"}), 400

                variant = ProductVariant.query.filter_by(
                    id=variant_id, product_id=product_id
                ).first()

                if not variant:
                    return jsonify({
                        "error": f"Variant at index {idx} does not belong to the selected product"
                    }), 400

            try:
                raw_qty = item.get("quantity", 1)
                if isinstance(raw_qty, bool):
                    raise ValueError
                quantity = int(raw_qty)
                if quantity < 1 or str(quantity) != str(raw_qty).strip():
                    raise ValueError
            except (ValueError, TypeError, AttributeError, OverflowError):
                return jsonify({"error": f"Item at index {idx} quantity must be a positive integer"}), 400

            override_price = None
            if item.get("override_unit_price") is not None:
                try:
                    override_price = quantize_money(item["override_unit_price"])
                    if override_price < Decimal("0.00"):
                        raise ValueError
                except (InvalidOperation, ValueError, TypeError):
                    return jsonify({"error": f"Item at index {idx} has an invalid or negative price"}), 400

            prepared_items.append({
                "id": uuid.uuid4(),
                "template_id": quot.id,
                "product_id": product_id,
                "variant_id": variant_id,
                "quantity": quantity,
                "override_unit_price": override_price
            })

    # Apply validated changes in one transaction.
    try:
        for field, value in updates.items():
            setattr(quot, field, value)

        if prepared_items is not None:
            QuotationTemplateItem.query.filter_by(
                template_id=quot.id
            ).delete(synchronize_session=False)

            for item_data in prepared_items:
                db_session.add(QuotationTemplateItem(**item_data))

        db_session.commit()

        return jsonify({
            "success": True,
            "message": "Quotation updated successfully",
            "quotation": quot.to_dict(),
            "data": {"quotation": quot.to_dict()}
        }), 200

    except Exception:
        db_session.rollback()
        return jsonify({
            "success": False,
            "error": "Failed to update quotation",
            "code": "UPDATE_FAILED"
        }), 500

@quotation_bp.route("", methods=["GET"])
@login_required
def list_quotations():
    """
    List quotation templates with associated line items.
    Query parameters:
    - search: search keyword matching quotation name or description
    - is_active: filter by active status ('true'/'false')
    - plan_id: filter by subscription plan
    """
    query = QuotationTemplate.query

    # Search filter
    search = request.args.get("search", "").strip()
    if search:
        search_pattern = f"%{search}%"
        query = query.filter(
            (QuotationTemplate.name.ilike(search_pattern)) |
            (QuotationTemplate.description.ilike(search_pattern))
        )

    # Active filter
    is_active_arg = request.args.get("is_active")
    if is_active_arg is not None:
        val = is_active_arg.lower() == "true"
        query = query.filter(QuotationTemplate.is_active == val)
    elif g.current_user.role == "CUSTOMER":
        # Customers only see active quotation templates
        query = query.filter(QuotationTemplate.is_active == True)

    # Plan filter
    plan_id_arg = request.args.get("plan_id")
    if plan_id_arg:
        try:
            pid = uuid.UUID(str(plan_id_arg))
            query = query.filter(QuotationTemplate.plan_id == pid)
        except ValueError:
            return jsonify({"error": "Invalid plan_id UUID format"}), 400

    quotations = query.order_by(QuotationTemplate.created_at.desc()).all()
    serialized = [q.to_dict() for q in quotations]
    return jsonify(serialized), 200


@quotation_bp.route("/<uuid:quotation_id>", methods=["GET"])
@login_required
def get_quotation(quotation_id):
    """Retrieve details of a single quotation template."""
    quotation = QuotationTemplate.query.filter_by(id=quotation_id).first()
    if not quotation:
        return jsonify({"error": "Quotation template not found"}), 404

    if g.current_user.role == "CUSTOMER" and not quotation.is_active:
        return jsonify({"error": "Quotation template is inactive"}), 404

    return jsonify(quotation.to_dict()), 200


@quotation_bp.route("", methods=["POST"])
@role_required(["ADMIN", "STAFF"])
def create_quotation():
    """
    Create a new quotation template with optional line items.
    Accessible only to ADMIN and STAFF.
    """
    data = request.get_json(silent=True) or {}

    name = data.get("name", "").strip()
    if not name:
        return jsonify({"error": "Quotation name is required"}), 400
    if len(name) > 150:
        return jsonify({"error": "Quotation name cannot exceed 150 characters"}), 400

    plan_id = None
    if data.get("plan_id"):
        try:
            plan_id = uuid.UUID(str(data["plan_id"]))
            plan = SubscriptionPlan.query.filter_by(id=plan_id).first()
            if not plan:
                return jsonify({"error": "Referenced subscription plan does not exist"}), 400
        except ValueError:
            return jsonify({"error": "Invalid plan_id UUID format"}), 400

    validity_days = 30
    if "default_validity_days" in data:
        try:
            validity_days = int(data["default_validity_days"])
            if validity_days < 1:
                return jsonify({"error": "default_validity_days must be at least 1"}), 400
        except (ValueError, TypeError):
            return jsonify({"error": "default_validity_days must be an integer"}), 400

    template = QuotationTemplate(
        id=uuid.uuid4(),
        name=name,
        description=data.get("description", "").strip() or None,
        plan_id=plan_id,
        default_validity_days=validity_days,
        terms_and_conditions=data.get("terms_and_conditions", "").strip() or None,
        is_active=data.get("is_active", True),
        created_by=g.current_user.id
    )
    db_session.add(template)
    db_session.flush()

    # Process items
    items_data = data.get("items", [])
    if not isinstance(items_data, list):
        return jsonify({"error": "items must be a list"}), 400

    for idx, item in enumerate(items_data):
        prod_id_raw = item.get("product_id")
        if not prod_id_raw:
            db_session.rollback()
            return jsonify({"error": f"Item at index {idx} is missing product_id"}), 400

        try:
            prod_uuid = uuid.UUID(str(prod_id_raw))
        except ValueError:
            db_session.rollback()
            return jsonify({"error": f"Item at index {idx} has invalid product_id UUID"}), 400

        product = Product.query.filter_by(id=prod_uuid).first()
        if not product:
            db_session.rollback()
            return jsonify({"error": f"Product with ID {prod_uuid} does not exist"}), 400

        variant_uuid = None
        if item.get("variant_id"):
            try:
                variant_uuid = uuid.UUID(str(item["variant_id"]))
                variant = ProductVariant.query.filter_by(id=variant_uuid, product_id=prod_uuid).first()
                if not variant:
                    db_session.rollback()
                    return jsonify({"error": f"Variant {variant_uuid} does not belong to product {prod_uuid}"}), 400
            except ValueError:
                db_session.rollback()
                return jsonify({"error": f"Item at index {idx} has invalid variant_id UUID"}), 400

        try:
            qty = int(item.get("quantity", 1))
            if qty < 1:
                db_session.rollback()
                return jsonify({"error": f"Item at index {idx} quantity must be >= 1"}), 400
        except (ValueError, TypeError):
            db_session.rollback()
            return jsonify({"error": f"Item at index {idx} quantity must be an integer"}), 400

        override_price = None
        if item.get("override_unit_price") is not None:
            try:
                override_price = quantize_money(item["override_unit_price"])
                if override_price < Decimal("0.00"):
                    db_session.rollback()
                    return jsonify({"error": f"Item at index {idx} override_unit_price cannot be negative"}), 400
            except (InvalidOperation, ValueError, TypeError):
                db_session.rollback()
                return jsonify({"error": f"Item at index {idx} has invalid override_unit_price"}), 400

        q_item = QuotationTemplateItem(
            id=uuid.uuid4(),
            template_id=template.id,
            product_id=prod_uuid,
            variant_id=variant_uuid,
            quantity=qty,
            override_unit_price=override_price
        )
        db_session.add(q_item)

    try:
        db_session.commit()
    except Exception as e:
        db_session.rollback()
        return jsonify({"error": f"Database error creating quotation template: {str(e)}"}), 500

    return jsonify(template.to_dict()), 201


@quotation_bp.route("/<uuid:quotation_id>/convert", methods=["POST"])
@login_required
def convert_quotation_to_subscription(quotation_id):
    """
    Converts an accepted quotation template into a confirmed Subscription.
    - Customers can convert for themselves.
    - Admins/Staff can convert on behalf of any customer.
    Copies all line items, applies valid pricing, and sets initial status to CONFIRMED.
    """
    template = QuotationTemplate.query.filter_by(id=quotation_id).first()
    if not template:
        return jsonify({"error": "Quotation template not found"}), 404

    if not template.is_active:
        return jsonify({"error": "Cannot convert an inactive quotation template"}), 400

    if not template.plan_id:
        return jsonify({"error": "Quotation template is not attached to a subscription plan"}), 400

    plan = SubscriptionPlan.query.filter_by(id=template.plan_id).first()
    if not plan or not plan.is_active:
        return jsonify({"error": "Attached subscription plan is inactive or invalid"}), 400

    data = request.get_json(silent=True) or {}

    # Determine customer
    if g.current_user.role == "CUSTOMER":
        customer_id = g.current_user.id
    else:
        cust_id_raw = data.get("customer_id")
        if not cust_id_raw:
            return jsonify({"error": "customer_id is required"}), 400
        try:
            customer_id = uuid.UUID(str(cust_id_raw))
        except ValueError:
            return jsonify({"error": "Invalid customer_id UUID format"}), 400

    customer = User.query.filter_by(id=customer_id).first()
    if not customer:
        return jsonify({"error": "Customer not found"}), 404
    if not customer.is_active:
        return jsonify({"error": "Customer account is deactivated"}), 400

    # Optional discount and tax rate
    discount_id = None
    discount = None
    if data.get("discount_id"):
        try:
            discount_id = uuid.UUID(str(data["discount_id"]))
            discount = Discount.query.filter_by(id=discount_id).first()
        except ValueError:
            return jsonify({"error": "Invalid discount_id UUID"}), 400

    tax_rate_id = None
    tax_rate = None
    if data.get("tax_rate_id"):
        try:
            tax_rate_id = uuid.UUID(str(data["tax_rate_id"]))
            tax_rate = TaxRate.query.filter_by(id=tax_rate_id).first()
        except ValueError:
            return jsonify({"error": "Invalid tax_rate_id UUID"}), 400
    elif plan.tax_rate_id:
        tax_rate_id = plan.tax_rate_id
        tax_rate = TaxRate.query.filter_by(id=tax_rate_id).first()

    # Generate sequential subscription number
    sub_count = Subscription.query.count() + 1
    sub_number = f"SUB-{date.today().year}-{sub_count:05d}"

    now_dt = datetime.now(timezone.utc)
    valid_until = date.today() + timedelta(days=template.default_validity_days or 30)

    subscription = Subscription(
        id=uuid.uuid4(),
        subscription_number=sub_number,
        customer_id=customer_id,
        plan_id=plan.id,
        template_id=template.id,
        discount_id=discount_id,
        tax_rate_id=tax_rate_id,
        status="CONFIRMED", # Ready for activation / invoicing
        quotation_valid_until=valid_until,
        start_date=now_dt,
        notes=data.get("notes") or f"Converted from quotation template: {template.name}",
        created_by=g.current_user.id
    )
    db_session.add(subscription)
    db_session.flush()

    # Copy line items
    items_calc = []
    total_subtotal = Decimal("0.00")

    for q_item in template.items:
        unit_price = q_item.override_unit_price if q_item.override_unit_price is not None else q_item.product.sales_price
        add_price = q_item.variant.additional_price if q_item.variant else Decimal("0.00")
        qty = q_item.quantity
        line_total = quantize_money((quantize_money(unit_price) + quantize_money(add_price)) * Decimal(str(qty)))

        sub_item = SubscriptionItem(
            id=uuid.uuid4(),
            subscription_id=subscription.id,
            product_id=q_item.product_id,
            variant_id=q_item.variant_id,
            quantity=qty,
            unit_price=quantize_money(unit_price),
            additional_price=quantize_money(add_price),
            line_total=line_total
        )
        db_session.add(sub_item)
        total_subtotal += line_total
        items_calc.append({
            "unit_price": unit_price,
            "additional_price": add_price,
            "quantity": qty
        })

    subtotal, discount_amount, taxable, tax_amount, recurring_total = compute_totals(
        items_calc, discount_obj=discount, tax_rate_obj=tax_rate
    )

    subscription.subtotal = subtotal
    subscription.discount_amount = discount_amount
    subscription.tax_amount = tax_amount
    subscription.recurring_total = recurring_total

    try:
        db_session.commit()
    except Exception as e:
        db_session.rollback()
        return jsonify({"error": f"Failed to convert quotation: {str(e)}"}), 500

    sub_dict = subscription.to_dict()
    response_data = {
        **sub_dict,
        "subscription": sub_dict,
        "message": "Quotation converted to subscription successfully"
    }
    return jsonify(response_data), 201
