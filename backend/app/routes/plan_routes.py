import uuid
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from flask import Blueprint, request, jsonify
from sqlalchemy.exc import IntegrityError
from app.db import db_session
from app.models.plan import SubscriptionPlan
from app.utils.security import role_required
from app.utils.financial import quantize_money

plan_bp = Blueprint("plans", __name__, url_prefix="/api/plans")

VALID_INTERVALS = {"DAILY", "WEEKLY", "MONTHLY", "YEARLY"}

def parse_date(date_str):
    if not date_str:
        return None
    if isinstance(date_str, date):
        return date_str
    try:
        return datetime.strptime(date_str[:10], "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None

@plan_bp.route("", methods=["GET"])
def list_plans():
    """
    List subscription plans.
    Query parameters:
    - billing_interval: filter by DAILY, WEEKLY, MONTHLY, YEARLY
    - include_inactive: 'true' (show expired/inactive plans)
    """
    query = SubscriptionPlan.query

    interval = request.args.get("billing_interval")
    if interval and interval.upper() in VALID_INTERVALS:
        query = query.filter(SubscriptionPlan.billing_interval == interval.upper())

    include_inactive = request.args.get("include_inactive", "false").lower() == "true"
    if not include_inactive:
        today = date.today()
        query = query.filter(
            SubscriptionPlan.is_active == True,
            SubscriptionPlan.available_from <= today,
            (SubscriptionPlan.available_to == None) | (SubscriptionPlan.available_to >= today)
        )

    plans = query.order_by(SubscriptionPlan.base_price.asc()).all()
    serialized = [p.to_dict() for p in plans]

    return jsonify({
        "success": True,
        "total": len(serialized),
        "plans": serialized,
        "data": {
            "total": len(serialized),
            "plans": serialized
        }
    }), 200


@plan_bp.route("/<uuid:plan_id>", methods=["GET"])
def get_plan(plan_id):
    """Get single plan details."""
    plan = SubscriptionPlan.query.filter_by(id=plan_id).first()
    if not plan:
        return jsonify({"success": False, "error": "Subscription plan not found.", "code": "PLAN_NOT_FOUND"}), 404

    return jsonify({
        "success": True,
        "plan": plan.to_dict(),
        "data": {
            "plan": plan.to_dict()
        }
    }), 200


@plan_bp.route("", methods=["POST"])
@role_required(["ADMIN"])
def create_plan():
    """ADMIN only: Create a new subscription plan."""
    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    billing_interval = (data.get("billing_interval") or "MONTHLY").strip().upper()
    interval_count = int(data.get("interval_count", 1) or 1)
    minimum_quantity = int(data.get("minimum_quantity", 1) or 1)
    base_price_raw = data.get("base_price", 0.00)
    available_from = parse_date(data.get("available_from")) or date.today()
    available_to = parse_date(data.get("available_to"))
    auto_close = bool(data.get("auto_close", False))
    auto_close_days = int(data.get("auto_close_days", 0) or 0)

    if not name:
        return jsonify({"success": False, "error": "Plan name is required.", "code": "MISSING_PLAN_NAME"}), 400

    if billing_interval not in VALID_INTERVALS:
        return jsonify({
            "success": False,
            "error": f"Invalid billing_interval. Must be one of: {', '.join(sorted(VALID_INTERVALS))}",
            "code": "INVALID_INTERVAL"
        }), 400

    if interval_count < 1:
        return jsonify({"success": False, "error": "interval_count must be at least 1.", "code": "INVALID_COUNT"}), 400

    if minimum_quantity < 1:
        return jsonify({"success": False, "error": "minimum_quantity must be at least 1.", "code": "INVALID_QUANTITY"}), 400

    try:
        base_price = quantize_money(base_price_raw)
        if base_price < Decimal("0.00"):
            raise ValueError()
    except Exception:
        return jsonify({"success": False, "error": "base_price must be a non-negative monetary number.", "code": "INVALID_PRICE"}), 400

    if available_to and available_to < available_from:
        return jsonify({"success": False, "error": "available_to must be after available_from.", "code": "INVALID_DATE_RANGE"}), 400

    try:
        plan = SubscriptionPlan(
            id=uuid.uuid4(),
            name=name,
            billing_interval=billing_interval,
            interval_count=interval_count,
            minimum_quantity=minimum_quantity,
            base_price=base_price,
            available_from=available_from,
            available_to=available_to,
            auto_close=auto_close,
            auto_close_days=auto_close_days,
            is_active=True
        )
        db_session.add(plan)
        db_session.commit()

        return jsonify({
            "success": True,
            "message": "Subscription plan created successfully.",
            "plan": plan.to_dict(),
            "data": {
                "plan": plan.to_dict()
            }
        }), 201

    except Exception as e:
        db_session.rollback()
        return jsonify({"success": False, "error": f"Failed to create plan: {str(e)}", "code": "SERVER_ERROR"}), 500


@plan_bp.route("/<uuid:plan_id>", methods=["PUT"])
@role_required(["ADMIN"])
def update_plan(plan_id):
    """ADMIN only: Update plan attributes."""
    plan = SubscriptionPlan.query.filter_by(id=plan_id).first()
    if not plan:
        return jsonify({"success": False, "error": "Subscription plan not found.", "code": "PLAN_NOT_FOUND"}), 404

    data = request.get_json() or {}

    if "name" in data:
        name = (data["name"] or "").strip()
        if not name:
            return jsonify({"success": False, "error": "Plan name cannot be empty.", "code": "INVALID_NAME"}), 400
        plan.name = name

    if "billing_interval" in data:
        interval = (data["billing_interval"] or "").strip().upper()
        if interval not in VALID_INTERVALS:
            return jsonify({"success": False, "error": "Invalid billing_interval.", "code": "INVALID_INTERVAL"}), 400
        plan.billing_interval = interval

    if "interval_count" in data:
        plan.interval_count = max(1, int(data["interval_count"]))
    if "minimum_quantity" in data:
        plan.minimum_quantity = max(1, int(data["minimum_quantity"]))

    if "base_price" in data:
        try:
            bp = quantize_money(data["base_price"])
            if bp < Decimal("0.00"):
                raise ValueError()
            plan.base_price = bp
        except Exception:
            return jsonify({"success": False, "error": "Invalid base_price.", "code": "INVALID_PRICE"}), 400

    if "available_from" in data:
        plan.available_from = parse_date(data["available_from"]) or plan.available_from
    if "available_to" in data:
        plan.available_to = parse_date(data["available_to"])
    if "auto_close" in data:
        plan.auto_close = bool(data["auto_close"])
    if "auto_close_days" in data:
        plan.auto_close_days = max(0, int(data["auto_close_days"]))
    if "is_active" in data:
        plan.is_active = bool(data["is_active"])

    try:
        db_session.commit()
        return jsonify({
            "success": True,
            "message": "Subscription plan updated successfully.",
            "plan": plan.to_dict(),
            "data": {
                "plan": plan.to_dict()
            }
        }), 200
    except Exception as e:
        db_session.rollback()
        return jsonify({"success": False, "error": str(e), "code": "SERVER_ERROR"}), 500


@plan_bp.route("/<uuid:plan_id>", methods=["DELETE"])
@role_required(["ADMIN"])
def delete_plan(plan_id):
    """ADMIN only: Soft delete/deactivate plan."""
    plan = SubscriptionPlan.query.filter_by(id=plan_id).first()
    if not plan:
        return jsonify({"success": False, "error": "Subscription plan not found.", "code": "PLAN_NOT_FOUND"}), 404

    permanent = request.args.get("permanent", "false").lower() == "true"
    try:
        if permanent:
            db_session.delete(plan)
        else:
            plan.is_active = False
        db_session.commit()
        return jsonify({
            "success": True,
            "message": "Subscription plan deleted successfully." if permanent else "Subscription plan deactivated successfully."
        }), 200
    except IntegrityError:
        db_session.rollback()
        plan.is_active = False
        db_session.commit()
        return jsonify({
            "success": True,
            "message": "Plan is referenced by existing subscriptions; deactivated instead."
        }), 200
