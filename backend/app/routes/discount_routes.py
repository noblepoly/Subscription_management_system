import uuid
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from flask import Blueprint, request, jsonify
from sqlalchemy.exc import IntegrityError
from app.db import db_session
from app.models.tax_discount import Discount
from app.models.product import Product
from app.utils.security import role_required
from app.utils.financial import quantize_money

discount_bp = Blueprint("discounts", __name__, url_prefix="/api/discounts")

def parse_date(date_str):
    if not date_str:
        return None
    if isinstance(date_str, date):
        return date_str
    try:
        return datetime.strptime(date_str[:10], "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None

@discount_bp.route("", methods=["GET"])
def list_discounts():
    """
    List discounts.
    Query parameters:
    - scope: 'SUBSCRIPTION', 'PRODUCT'
    - is_active: 'true', 'false'
    - search: code or description search
    """
    query = Discount.query

    scope = request.args.get("scope")
    if scope and scope.upper() in ("SUBSCRIPTION", "PRODUCT"):
        query = query.filter(Discount.scope == scope.upper())

    is_active = request.args.get("is_active")
    if is_active is not None:
        if is_active.lower() in ("true", "1"):
            query = query.filter(Discount.is_active == True)
        elif is_active.lower() in ("false", "0"):
            query = query.filter(Discount.is_active == False)

    search = request.args.get("search", "").strip()
    if search:
        search_pattern = f"%{search}%"
        query = query.filter(
            (Discount.code.ilike(search_pattern)) |
            (Discount.description.ilike(search_pattern))
        )

    discounts = query.order_by(Discount.created_at.desc()).all()
    serialized = [d.to_dict() for d in discounts]

    return jsonify({
        "success": True,
        "total": len(serialized),
        "discounts": serialized,
        "data": {
            "total": len(serialized),
            "discounts": serialized
        }
    }), 200


@discount_bp.route("/<uuid:discount_id>", methods=["GET"])
def get_discount(discount_id):
    """Get single discount details."""
    discount = Discount.query.filter_by(id=discount_id).first()
    if not discount:
        return jsonify({"success": False, "error": "Discount not found.", "code": "DISCOUNT_NOT_FOUND"}), 404

    return jsonify({
        "success": True,
        "discount": discount.to_dict(),
        "data": {
            "discount": discount.to_dict()
        }
    }), 200


@discount_bp.route("/validate", methods=["POST"])
def validate_discount_code():
    """
    Public / Quotation validation endpoint:
    Evaluates discount code against current cart / quote total and products.
    Body:
    - code: string
    - subtotal: decimal/float
    - quantity: integer
    - product_ids: list of strings/uuids
    """
    data = request.get_json() or {}
    code = (data.get("code") or "").strip().upper()
    subtotal = quantize_money(data.get("subtotal", 0.00))
    total_qty = int(data.get("quantity", 1) or 1)
    product_ids = data.get("product_ids", [])

    if not code:
        return jsonify({"success": False, "error": "Discount code is required.", "code": "MISSING_CODE"}), 400

    discount = Discount.query.filter_by(code=code).first()
    if not discount:
        return jsonify({"success": False, "error": "Invalid discount code.", "code": "CODE_NOT_FOUND"}), 404

    eligible, reason = discount.is_eligible(subtotal, total_qty, date.today(), product_ids)
    if not eligible:
        return jsonify({
            "success": False,
            "eligible": False,
            "error": reason,
            "code": "DISCOUNT_INELIGIBLE"
        }), 400

    # Calculate preview discount amount
    if discount.discount_type == "PERCENTAGE":
        calc_discount = quantize_money((subtotal * discount.discount_value) / Decimal("100.0"))
    else:
        calc_discount = min(subtotal, quantize_money(discount.discount_value))

    return jsonify({
        "success": True,
        "eligible": True,
        "calculated_discount": float(calc_discount),
        "discount": discount.to_dict(),
        "data": {
            "eligible": True,
            "calculated_discount": float(calc_discount),
            "discount": discount.to_dict()
        }
    }), 200


@discount_bp.route("", methods=["POST"])
@role_required(["ADMIN"])
def create_discount():
    """ADMIN only: Create discount coupon."""
    data = request.get_json() or {}
    code = (data.get("code") or "").strip().upper()
    description = (data.get("description") or "").strip() or None
    discount_type = (data.get("discount_type") or "PERCENTAGE").strip().upper()
    discount_val_raw = data.get("discount_value")
    scope = (data.get("scope") or "SUBSCRIPTION").strip().upper()
    min_purchase_raw = data.get("min_purchase_amount", 0.00)
    min_quantity = int(data.get("min_quantity", 1) or 1)
    start_date = parse_date(data.get("start_date")) or date.today()
    end_date = parse_date(data.get("end_date"))
    usage_limit = data.get("usage_limit")
    if usage_limit is not None:
        usage_limit = int(usage_limit)
    applicable_product_ids = data.get("applicable_product_ids", [])

    if not code:
        return jsonify({"success": False, "error": "Discount code is required.", "code": "MISSING_CODE"}), 400

    if discount_type not in ("PERCENTAGE", "FIXED"):
        return jsonify({"success": False, "error": "discount_type must be PERCENTAGE or FIXED.", "code": "INVALID_TYPE"}), 400

    if scope not in ("SUBSCRIPTION", "PRODUCT"):
        return jsonify({"success": False, "error": "scope must be SUBSCRIPTION or PRODUCT.", "code": "INVALID_SCOPE"}), 400

    try:
        discount_value = quantize_money(discount_val_raw)
        if discount_value <= Decimal("0.00"):
            raise ValueError()
        if discount_type == "PERCENTAGE" and discount_value > Decimal("100.00"):
            return jsonify({"success": False, "error": "Percentage discount cannot exceed 100%.", "code": "INVALID_VALUE"}), 400
    except Exception:
        return jsonify({"success": False, "error": "discount_value must be a positive number.", "code": "INVALID_VALUE"}), 400

    try:
        min_purchase = quantize_money(min_purchase_raw)
        if min_purchase < Decimal("0.00"):
            raise ValueError()
    except Exception:
        return jsonify({"success": False, "error": "min_purchase_amount must be non-negative.", "code": "INVALID_AMOUNT"}), 400

    if end_date and end_date < start_date:
        return jsonify({"success": False, "error": "end_date must be after start_date.", "code": "INVALID_DATE_RANGE"}), 400

    existing = Discount.query.filter_by(code=code).first()
    if existing:
        return jsonify({"success": False, "error": f"Discount code '{code}' already exists.", "code": "DUPLICATE_CODE"}), 409

    try:
        discount = Discount(
            id=uuid.uuid4(),
            code=code,
            description=description,
            discount_type=discount_type,
            discount_value=discount_value,
            scope=scope,
            min_purchase_amount=min_purchase,
            min_quantity=max(1, min_quantity),
            start_date=start_date,
            end_date=end_date,
            usage_limit=usage_limit,
            times_used=0,
            is_active=True
        )

        if scope == "PRODUCT" and applicable_product_ids:
            products = Product.query.filter(Product.id.in_([uuid.UUID(str(pid)) for pid in applicable_product_ids])).all()
            discount.applicable_products = products

        db_session.add(discount)
        db_session.commit()

        return jsonify({
            "success": True,
            "message": "Discount created successfully.",
            "discount": discount.to_dict(),
            "data": {
                "discount": discount.to_dict()
            }
        }), 201

    except Exception as e:
        db_session.rollback()
        return jsonify({"success": False, "error": f"Failed to create discount: {str(e)}", "code": "SERVER_ERROR"}), 500


@discount_bp.route("/<uuid:discount_id>", methods=["PUT"])
@role_required(["ADMIN"])
def update_discount(discount_id):
    """ADMIN only: Update discount attributes."""
    discount = Discount.query.filter_by(id=discount_id).first()
    if not discount:
        return jsonify({"success": False, "error": "Discount not found.", "code": "DISCOUNT_NOT_FOUND"}), 404

    data = request.get_json() or {}

    if "description" in data:
        discount.description = data["description"]
    if "discount_value" in data:
        try:
            val = quantize_money(data["discount_value"])
            if val <= Decimal("0.00"):
                raise ValueError()
            discount.discount_value = val
        except Exception:
            return jsonify({"success": False, "error": "Invalid discount_value.", "code": "INVALID_VALUE"}), 400

    if "min_purchase_amount" in data:
        try:
            discount.min_purchase_amount = quantize_money(data["min_purchase_amount"])
        except Exception:
            return jsonify({"success": False, "error": "Invalid min_purchase_amount.", "code": "INVALID_AMOUNT"}), 400

    if "min_quantity" in data:
        discount.min_quantity = max(1, int(data["min_quantity"]))
    if "start_date" in data:
        discount.start_date = parse_date(data["start_date"]) or discount.start_date
    if "end_date" in data:
        discount.end_date = parse_date(data["end_date"])
    if "usage_limit" in data:
        discount.usage_limit = int(data["usage_limit"]) if data["usage_limit"] is not None else None
    if "is_active" in data:
        discount.is_active = bool(data["is_active"])

    if "applicable_product_ids" in data:
        pids = data["applicable_product_ids"]
        products = Product.query.filter(Product.id.in_([uuid.UUID(str(pid)) for pid in pids])).all()
        discount.applicable_products = products

    try:
        db_session.commit()
        return jsonify({
            "success": True,
            "message": "Discount updated successfully.",
            "discount": discount.to_dict(),
            "data": {
                "discount": discount.to_dict()
            }
        }), 200
    except Exception as e:
        db_session.rollback()
        return jsonify({"success": False, "error": str(e), "code": "SERVER_ERROR"}), 500


@discount_bp.route("/<uuid:discount_id>", methods=["DELETE"])
@role_required(["ADMIN"])
def delete_discount(discount_id):
    """ADMIN only: Soft delete/deactivate discount."""
    discount = Discount.query.filter_by(id=discount_id).first()
    if not discount:
        return jsonify({"success": False, "error": "Discount not found.", "code": "DISCOUNT_NOT_FOUND"}), 404

    try:
        discount.is_active = False
        db_session.commit()
        return jsonify({"success": True, "message": "Discount deactivated successfully."}), 200
    except Exception as e:
        db_session.rollback()
        return jsonify({"success": False, "error": str(e), "code": "SERVER_ERROR"}), 500
