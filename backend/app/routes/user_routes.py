import uuid
from flask import Blueprint, request, jsonify, g
from app.db import db_session
from app.models.user import User
from app.utils.validation import validate_password, validate_email
from app.utils.security import role_required

user_bp = Blueprint("users", __name__, url_prefix="/api/users")

@user_bp.route("/staff", methods=["POST"])
@role_required(["ADMIN"])
def create_staff_user():
    """
    ADMIN only endpoint to provision internal STAFF accounts.
    - Validates email uniqueness
    - Enforces strict password validation
    - Automatically sets role to STAFF
    """
    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    full_name = (data.get("full_name") or "").strip()
    phone = (data.get("phone") or "").strip() or None
    company_name = (data.get("company_name") or "").strip() or "Brightloop Internal Staff"

    if not email or not validate_email(email):
        return jsonify({
            "success": False,
            "error": "A valid email address is required.",
            "code": "INVALID_EMAIL"
        }), 400

    if not full_name:
        return jsonify({
            "success": False,
            "error": "Full name is required.",
            "code": "MISSING_FULL_NAME"
        }), 400

    valid_pwd, pwd_error = validate_password(password)
    if not valid_pwd:
        return jsonify({
            "success": False,
            "error": pwd_error,
            "code": "INVALID_PASSWORD"
        }), 400

    existing_user = User.query.filter_by(email=email).first()
    if existing_user:
        return jsonify({
            "success": False,
            "error": "A user with this email already exists.",
            "code": "EMAIL_ALREADY_EXISTS"
        }), 409

    try:
        staff_user = User(
            id=uuid.uuid4(),
            email=email,
            full_name=full_name,
            company_name=company_name,
            phone=phone,
            role="STAFF",
            is_active=True
        )
        staff_user.set_password(password)

        db_session.add(staff_user)
        db_session.commit()

        return jsonify({
            "success": True,
            "message": "Staff account created successfully.",
            "data": {
                "user": staff_user.to_dict()
            }
        }), 201

    except Exception as e:
        db_session.rollback()
        return jsonify({
            "success": False,
            "error": f"Failed to create staff account: {str(e)}",
            "code": "SERVER_ERROR"
        }), 500


@user_bp.route("", methods=["GET"])
@role_required(["ADMIN", "STAFF"])
def list_users():
    """
    ADMIN and STAFF endpoint to view and filter users (e.g. customers).
    Query parameters:
    - role: 'ADMIN', 'STAFF', 'CUSTOMER'
    - is_active: 'true', 'false'
    - search: keyword matching email, full_name, or company_name
    """
    query = User.query

    # Filter by role
    role_filter = request.args.get("role")
    if role_filter:
        query = query.filter(User.role == role_filter.upper())

    # Filter by is_active
    is_active_filter = request.args.get("is_active")
    if is_active_filter is not None:
        if is_active_filter.lower() in ("true", "1"):
            query = query.filter(User.is_active == True)
        elif is_active_filter.lower() in ("false", "0"):
            query = query.filter(User.is_active == False)

    # Search keyword
    search_keyword = request.args.get("search", "").strip()
    if search_keyword:
        search_pattern = f"%{search_keyword}%"
        query = query.filter(
            (User.email.ilike(search_pattern)) |
            (User.full_name.ilike(search_pattern)) |
            (User.company_name.ilike(search_pattern))
        )

    users = query.order_by(User.created_at.desc()).all()

    return jsonify({
        "success": True,
        "data": {
            "total": len(users),
            "users": [u.to_dict() for u in users]
        }
    }), 200
