import uuid
from decimal import Decimal, InvalidOperation
from flask import Blueprint, request, jsonify
from sqlalchemy.exc import IntegrityError
from app.db import db_session
from app.models.tax_discount import TaxRate
from app.utils.security import role_required
from app.utils.financial import quantize_money

tax_bp = Blueprint("taxes", __name__, url_prefix="/api/taxes")

@tax_bp.route("", methods=["GET"])
def list_taxes():
    """List tax rates."""
    include_inactive = request.args.get("include_inactive", "false").lower() == "true"
    query = TaxRate.query
    if not include_inactive:
        query = query.filter(TaxRate.is_active == True)

    taxes = query.order_by(TaxRate.rate_percentage.asc()).all()
    serialized = [t.to_dict() for t in taxes]

    return jsonify({
        "success": True,
        "total": len(serialized),
        "taxes": serialized,
        "data": {
            "total": len(serialized),
            "taxes": serialized
        }
    }), 200


@tax_bp.route("/<uuid:tax_id>", methods=["GET"])
def get_tax(tax_id):
    """Get single tax rate details."""
    tax = TaxRate.query.filter_by(id=tax_id).first()
    if not tax:
        return jsonify({"success": False, "error": "Tax rate not found.", "code": "TAX_NOT_FOUND"}), 404

    return jsonify({
        "success": True,
        "tax": tax.to_dict(),
        "data": {
            "tax": tax.to_dict()
        }
    }), 200


@tax_bp.route("", methods=["POST"])
@role_required(["ADMIN"])
def create_tax():
    """ADMIN only: Create tax rate."""
    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    rate_raw = data.get("rate_percentage")

    if not name:
        return jsonify({"success": False, "error": "Tax name is required.", "code": "MISSING_NAME"}), 400

    try:
        rate = Decimal(str(rate_raw))
        if rate < Decimal("0.000") or rate > Decimal("100.000"):
            raise ValueError()
    except Exception:
        return jsonify({
            "success": False,
            "error": "rate_percentage must be between 0.000 and 100.000.",
            "code": "INVALID_RATE"
        }), 400

    try:
        tax = TaxRate(
            id=uuid.uuid4(),
            name=name,
            rate_percentage=rate,
            is_active=True
        )
        db_session.add(tax)
        db_session.commit()

        return jsonify({
            "success": True,
            "message": "Tax rate created successfully.",
            "tax": tax.to_dict(),
            "data": {
                "tax": tax.to_dict()
            }
        }), 201

    except Exception as e:
        db_session.rollback()
        return jsonify({"success": False, "error": f"Failed to create tax: {str(e)}", "code": "SERVER_ERROR"}), 500


@tax_bp.route("/<uuid:tax_id>", methods=["PUT"])
@role_required(["ADMIN"])
def update_tax(tax_id):
    """ADMIN only: Update tax rate."""
    tax = TaxRate.query.filter_by(id=tax_id).first()
    if not tax:
        return jsonify({"success": False, "error": "Tax rate not found.", "code": "TAX_NOT_FOUND"}), 404

    data = request.get_json() or {}

    if "name" in data:
        name = (data["name"] or "").strip()
        if not name:
            return jsonify({"success": False, "error": "Tax name cannot be empty.", "code": "INVALID_NAME"}), 400
        tax.name = name

    if "rate_percentage" in data:
        try:
            rate = Decimal(str(data["rate_percentage"]))
            if rate < Decimal("0.000") or rate > Decimal("100.000"):
                raise ValueError()
            tax.rate_percentage = rate
        except Exception:
            return jsonify({"success": False, "error": "Invalid rate_percentage.", "code": "INVALID_RATE"}), 400

    if "is_active" in data:
        tax.is_active = bool(data["is_active"])

    try:
        db_session.commit()
        return jsonify({
            "success": True,
            "message": "Tax rate updated successfully.",
            "tax": tax.to_dict(),
            "data": {
                "tax": tax.to_dict()
            }
        }), 200
    except Exception as e:
        db_session.rollback()
        return jsonify({"success": False, "error": str(e), "code": "SERVER_ERROR"}), 500


@tax_bp.route("/<uuid:tax_id>", methods=["DELETE"])
@role_required(["ADMIN"])
def delete_tax(tax_id):
    """ADMIN only: Soft delete/deactivate tax rate."""
    tax = TaxRate.query.filter_by(id=tax_id).first()
    if not tax:
        return jsonify({"success": False, "error": "Tax rate not found.", "code": "TAX_NOT_FOUND"}), 404

    try:
        tax.is_active = False
        db_session.commit()
        return jsonify({"success": True, "message": "Tax rate deactivated successfully."}), 200
    except Exception as e:
        db_session.rollback()
        return jsonify({"success": False, "error": str(e), "code": "SERVER_ERROR"}), 500
