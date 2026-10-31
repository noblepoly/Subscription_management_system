import uuid
from decimal import Decimal, InvalidOperation
from flask import Blueprint, request, jsonify, g
from sqlalchemy.exc import IntegrityError
from app.db import db_session
from app.models.product import Product, ProductVariant
from app.utils.security import role_required, login_required
from app.utils.financial import quantize_money

product_bp = Blueprint("products", __name__, url_prefix="/api/products")

VALID_PRODUCT_TYPES = {"SOFTWARE", "SERVICE", "PHYSICAL", "CONSUMABLE"}

@product_bp.route("", methods=["GET"])
def list_products():
    """
    List products with variants.
    Query parameters:
    - search: search keyword matching product name or description
    - product_type: filter by SOFTWARE, SERVICE, PHYSICAL, CONSUMABLE
    - include_inactive: 'true' (restricted to ADMIN/STAFF)
    """
    query = Product.query

    # Type filter
    ptype = request.args.get("product_type")
    if ptype and ptype.upper() in VALID_PRODUCT_TYPES:
        query = query.filter(Product.product_type == ptype.upper())

    # Search filter
    search = request.args.get("search", "").strip()
    if search:
        search_pattern = f"%{search}%"
        query = query.filter(
            (Product.name.ilike(search_pattern)) |
            (Product.description.ilike(search_pattern))
        )

    # Active filter
    include_inactive = request.args.get("include_inactive", "false").lower() == "true"
    if not include_inactive:
        query = query.filter(Product.is_active == True)

    products = query.order_by(Product.name.asc()).all()
    serialized = [p.to_dict() for p in products]

    return jsonify({
        "success": True,
        "total": len(serialized),
        "products": serialized,
        "data": {
            "total": len(serialized),
            "products": serialized
        }
    }), 200


@product_bp.route("/<uuid:product_id>", methods=["GET"])
def get_product(product_id):
    """Get single product details with its variants."""
    product = Product.query.filter_by(id=product_id).first()
    if not product:
        return jsonify({
            "success": False,
            "error": "Product not found.",
            "code": "PRODUCT_NOT_FOUND"
        }), 404

    return jsonify({
        "success": True,
        "product": product.to_dict(),
        "data": {
            "product": product.to_dict()
        }
    }), 200


@product_bp.route("", methods=["POST"])
@role_required(["ADMIN"])
def create_product():
    """
    ADMIN only: Create a new product with optional initial variants.
    """
    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    product_type = (data.get("product_type") or "SOFTWARE").strip().upper()
    sales_price_raw = data.get("sales_price")
    cost_price_raw = data.get("cost_price", 0.00)
    description = (data.get("description") or "").strip() or None
    notes = (data.get("notes") or "").strip() or None
    variants_data = data.get("variants", [])

    if not name:
        return jsonify({
            "success": False,
            "error": "Product name is required.",
            "code": "MISSING_PRODUCT_NAME"
        }), 400

    if product_type not in VALID_PRODUCT_TYPES:
        return jsonify({
            "success": False,
            "error": f"Invalid product_type. Must be one of: {', '.join(sorted(VALID_PRODUCT_TYPES))}",
            "code": "INVALID_PRODUCT_TYPE"
        }), 400

    try:
        sales_price = quantize_money(sales_price_raw)
        cost_price = quantize_money(cost_price_raw)
        if sales_price < Decimal("0.00") or cost_price < Decimal("0.00"):
            raise ValueError()
    except (InvalidOperation, ValueError, TypeError):
        return jsonify({
            "success": False,
            "error": "Sales price and cost price must be non-negative monetary numbers.",
            "code": "INVALID_PRICE"
        }), 400

    try:
        product = Product(
            id=uuid.uuid4(),
            name=name,
            product_type=product_type,
            sales_price=sales_price,
            cost_price=cost_price,
            description=description,
            notes=notes,
            is_active=True
        )
        db_session.add(product)
        db_session.flush()

        # Add optional initial variants
        for v_data in variants_data:
            v_name = (v_data.get("variant_name") or "").strip()
            if not v_name:
                continue
            v_add_price = quantize_money(v_data.get("additional_price", 0.00))
            v_sku = (v_data.get("sku") or "").strip() or None
            variant = ProductVariant(
                id=uuid.uuid4(),
                product_id=product.id,
                variant_name=v_name,
                sku=v_sku,
                additional_price=v_add_price,
                is_active=True
            )
            db_session.add(variant)

        db_session.commit()

        return jsonify({
            "success": True,
            "message": "Product created successfully.",
            "product": product.to_dict(),
            "data": {
                "product": product.to_dict()
            }
        }), 201

    except IntegrityError:
        db_session.rollback()
        return jsonify({
            "success": False,
            "error": "A product variant with that name or SKU already exists.",
            "code": "DUPLICATE_ENTRY"
        }), 409
    except Exception as e:
        db_session.rollback()
        return jsonify({
            "success": False,
            "error": f"Failed to create product: {str(e)}",
            "code": "SERVER_ERROR"
        }), 500


@product_bp.route("/<uuid:product_id>", methods=["PUT"])
@role_required(["ADMIN"])
def update_product(product_id):
    """ADMIN only: Update product details."""
    product = Product.query.filter_by(id=product_id).first()
    if not product:
        return jsonify({
            "success": False,
            "error": "Product not found.",
            "code": "PRODUCT_NOT_FOUND"
        }), 404

    data = request.get_json() or {}

    if "name" in data:
        name = (data["name"] or "").strip()
        if not name:
            return jsonify({"success": False, "error": "Product name cannot be empty.", "code": "INVALID_NAME"}), 400
        product.name = name

    if "product_type" in data:
        ptype = (data["product_type"] or "").strip().upper()
        if ptype not in VALID_PRODUCT_TYPES:
            return jsonify({"success": False, "error": "Invalid product_type.", "code": "INVALID_PRODUCT_TYPE"}), 400
        product.product_type = ptype

    if "sales_price" in data:
        try:
            sp = quantize_money(data["sales_price"])
            if sp < Decimal("0.00"):
                raise ValueError()
            product.sales_price = sp
        except Exception:
            return jsonify({"success": False, "error": "Invalid sales_price.", "code": "INVALID_PRICE"}), 400

    if "cost_price" in data:
        try:
            cp = quantize_money(data["cost_price"])
            if cp < Decimal("0.00"):
                raise ValueError()
            product.cost_price = cp
        except Exception:
            return jsonify({"success": False, "error": "Invalid cost_price.", "code": "INVALID_PRICE"}), 400

    if "description" in data:
        product.description = data["description"]
    if "notes" in data:
        product.notes = data["notes"]
    if "is_active" in data:
        product.is_active = bool(data["is_active"])

    try:
        db_session.commit()
        return jsonify({
            "success": True,
            "message": "Product updated successfully.",
            "product": product.to_dict(),
            "data": {
                "product": product.to_dict()
            }
        }), 200
    except Exception as e:
        db_session.rollback()
        return jsonify({"success": False, "error": str(e), "code": "SERVER_ERROR"}), 500


@product_bp.route("/<uuid:product_id>", methods=["DELETE"])
@role_required(["ADMIN"])
def delete_product(product_id):
    """ADMIN only: Soft delete or toggle active state."""
    product = Product.query.filter_by(id=product_id).first()
    if not product:
        return jsonify({"success": False, "error": "Product not found.", "code": "PRODUCT_NOT_FOUND"}), 404

    permanent = request.args.get("permanent", "false").lower() == "true"
    try:
        if permanent:
            db_session.delete(product)
        else:
            product.is_active = False
        db_session.commit()
        return jsonify({
            "success": True,
            "message": "Product deleted successfully." if permanent else "Product deactivated successfully."
        }), 200
    except IntegrityError:
        db_session.rollback()
        # Fallback to soft delete if referenced by subscriptions or quotes
        product.is_active = False
        db_session.commit()
        return jsonify({
            "success": True,
            "message": "Product is referenced in existing orders; deactivated instead of permanently deleted."
        }), 200


# =============================================================================
# PRODUCT VARIANTS SUB-RESOURCE
# =============================================================================

@product_bp.route("/<uuid:product_id>/variants", methods=["POST"])
@role_required(["ADMIN"])
def create_product_variant(product_id):
    """ADMIN only: Add variant to an existing product."""
    product = Product.query.filter_by(id=product_id).first()
    if not product:
        return jsonify({"success": False, "error": "Product not found.", "code": "PRODUCT_NOT_FOUND"}), 404

    data = request.get_json() or {}
    variant_name = (data.get("variant_name") or "").strip()
    sku = (data.get("sku") or "").strip() or None
    add_price_raw = data.get("additional_price", 0.00)

    if not variant_name:
        return jsonify({"success": False, "error": "variant_name is required.", "code": "MISSING_VARIANT_NAME"}), 400

    try:
        additional_price = quantize_money(add_price_raw)
        if additional_price < Decimal("0.00"):
            raise ValueError()
    except Exception:
        return jsonify({"success": False, "error": "additional_price must be non-negative.", "code": "INVALID_PRICE"}), 400

    # Check for existing duplicate variant on same product
    existing = ProductVariant.query.filter_by(product_id=product.id, variant_name=variant_name).first()
    if existing:
        return jsonify({
            "success": False,
            "error": f"Variant '{variant_name}' already exists for this product.",
            "code": "DUPLICATE_VARIANT"
        }), 409

    try:
        variant = ProductVariant(
            id=uuid.uuid4(),
            product_id=product.id,
            variant_name=variant_name,
            sku=sku,
            additional_price=additional_price,
            is_active=True
        )
        db_session.add(variant)
        db_session.commit()

        return jsonify({
            "success": True,
            "message": "Variant created successfully.",
            "variant": variant.to_dict(),
            "data": {
                "variant": variant.to_dict()
            }
        }), 201

    except IntegrityError:
        db_session.rollback()
        return jsonify({"success": False, "error": "Variant with this name or SKU already exists.", "code": "DUPLICATE_ENTRY"}), 409


@product_bp.route("/<uuid:product_id>/variants/<uuid:variant_id>", methods=["PUT"])
@role_required(["ADMIN"])
def update_product_variant(product_id, variant_id):
    """ADMIN only: Update variant details."""
    variant = ProductVariant.query.filter_by(id=variant_id, product_id=product_id).first()
    if not variant:
        return jsonify({"success": False, "error": "Variant not found.", "code": "VARIANT_NOT_FOUND"}), 404

    data = request.get_json() or {}
    if "variant_name" in data:
        v_name = (data["variant_name"] or "").strip()
        if not v_name:
            return jsonify({"success": False, "error": "variant_name cannot be empty.", "code": "INVALID_NAME"}), 400
        variant.variant_name = v_name

    if "sku" in data:
        variant.sku = (data["sku"] or "").strip() or None

    if "additional_price" in data:
        try:
            ap = quantize_money(data["additional_price"])
            if ap < Decimal("0.00"):
                raise ValueError()
            variant.additional_price = ap
        except Exception:
            return jsonify({"success": False, "error": "Invalid additional_price.", "code": "INVALID_PRICE"}), 400

    if "is_active" in data:
        variant.is_active = bool(data["is_active"])

    try:
        db_session.commit()
        return jsonify({
            "success": True,
            "message": "Variant updated successfully.",
            "variant": variant.to_dict(),
            "data": {
                "variant": variant.to_dict()
            }
        }), 200
    except IntegrityError:
        db_session.rollback()
        return jsonify({"success": False, "error": "Variant name or SKU already in use.", "code": "DUPLICATE_ENTRY"}), 409


@product_bp.route("/<uuid:product_id>/variants/<uuid:variant_id>", methods=["DELETE"])
@role_required(["ADMIN"])
def delete_product_variant(product_id, variant_id):
    """ADMIN only: Delete variant."""
    variant = ProductVariant.query.filter_by(id=variant_id, product_id=product_id).first()
    if not variant:
        return jsonify({"success": False, "error": "Variant not found.", "code": "VARIANT_NOT_FOUND"}), 404

    try:
        db_session.delete(variant)
        db_session.commit()
        return jsonify({"success": True, "message": "Variant deleted successfully."}), 200
    except IntegrityError:
        db_session.rollback()
        variant.is_active = False
        db_session.commit()
        return jsonify({"success": True, "message": "Variant deactivated because it is used in orders."}), 200
