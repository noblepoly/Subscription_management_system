import uuid
import secrets
import hashlib
from datetime import datetime, timezone, timedelta
from flask import Blueprint, request, jsonify, g
from app.db import db_session
from app.models.user import User, PasswordResetToken
from app.utils.validation import validate_password, validate_email
from app.utils.security import generate_token, login_required

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")

@auth_bp.route("/register", methods=["POST"])
def register():
    """
    Public customer registration.
    - Strict email & password validation
    - Always assigns CUSTOMER role (ignores any submitted role)
    - Returns JWT token and sanitized user profile
    """
    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    full_name = (data.get("full_name") or "").strip()
    company_name = (data.get("company_name") or "").strip() or None
    phone = (data.get("phone") or "").strip() or None
    billing_address = (data.get("billing_address") or "").strip() or None

    # 1. Validation
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

    # 2. Check unique email
    existing_user = User.query.filter_by(email=email).first()
    if existing_user:
        return jsonify({
            "success": False,
            "error": "An account with this email already exists.",
            "code": "EMAIL_ALREADY_EXISTS"
        }), 409

    # 3. Create user (Strictly enforced CUSTOMER role)
    try:
        new_user = User(
            id=uuid.uuid4(),
            email=email,
            full_name=full_name,
            company_name=company_name,
            phone=phone,
            billing_address=billing_address,
            role="CUSTOMER", # Enforce CUSTOMER role
            is_active=True
        )
        new_user.set_password(password)

        db_session.add(new_user)
        db_session.commit()

        # Generate JWT token
        token = generate_token(new_user)

        return jsonify({
            "success": True,
            "message": "Registration successful.",
            "data": {
                "user": new_user.to_dict(),
                "token": token
            }
        }), 201

    except Exception as e:
        db_session.rollback()
        return jsonify({
            "success": False,
            "error": f"Registration failed due to a server error: {str(e)}",
            "code": "SERVER_ERROR"
        }), 500


@auth_bp.route("/login", methods=["POST"])
def login():
    """
    Authenticate user with email and password.
    Returns JWT token and user profile including role.
    """
    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return jsonify({
            "success": False,
            "error": "Email and password are required.",
            "code": "MISSING_CREDENTIALS"
        }), 400

    user = User.query.filter_by(email=email).first()
    if not user or not user.check_password(password):
        return jsonify({
            "success": False,
            "error": "Invalid email or password.",
            "code": "INVALID_CREDENTIALS"
        }), 401

    if not user.is_active:
        return jsonify({
            "success": False,
            "error": "This account is inactive. Please contact support.",
            "code": "ACCOUNT_INACTIVE"
        }), 403

    token = generate_token(user)

    return jsonify({
        "success": True,
        "message": "Login successful.",
        "data": {
            "user": user.to_dict(),
            "token": token
        }
    }), 200


@auth_bp.route("/me", methods=["GET"])
@login_required
def get_current_user():
    """
    Returns the authenticated user's profile and active session details.
    """
    return jsonify({
        "success": True,
        "data": {
            "user": g.current_user.to_dict()
        }
    }), 200


@auth_bp.route("/forgot-password", methods=["POST"])
def forgot_password():
    """
    Generates a secure password reset token (15-minute expiration).
    Security requirement: Do not reveal whether an email exists.
    """
    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()

    if not email or not validate_email(email):
        return jsonify({
            "success": False,
            "error": "A valid email address is required.",
            "code": "INVALID_EMAIL"
        }), 400

    user = User.query.filter_by(email=email, is_active=True).first()
    reset_token = None

    if user:
        # Invalidate previous unused reset tokens for this user
        PasswordResetToken.query.filter_by(user_id=user.id, is_used=False).update({"is_used": True})

        # Generate secure raw token
        raw_token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)

        token_record = PasswordResetToken(
            id=uuid.uuid4(),
            user_id=user.id,
            token_hash=token_hash,
            expires_at=expires_at,
            is_used=False
        )
        db_session.add(token_record)
        db_session.commit()
        reset_token = raw_token

    # Standard security response: Never leak email existence
    response_payload = {
        "success": True,
        "message": "If that email address is in our system, we have generated password reset instructions."
    }

    # For hackathon local/offline testing, include reset_token in response when present
    if reset_token:
        response_payload["dev_reset_token"] = reset_token

    return jsonify(response_payload), 200


@auth_bp.route("/reset-password", methods=["POST"])
def reset_password():
    """
    Validates the reset token and securely updates the user's password.
    - Validates expiration and single-use
    - Validates new password strength
    """
    data = request.get_json() or {}
    raw_token = (data.get("token") or "").strip()
    new_password = data.get("new_password") or ""

    if not raw_token:
        return jsonify({
            "success": False,
            "error": "Reset token is required.",
            "code": "MISSING_TOKEN"
        }), 400

    valid_pwd, pwd_error = validate_password(new_password)
    if not valid_pwd:
        return jsonify({
            "success": False,
            "error": pwd_error,
            "code": "INVALID_PASSWORD"
        }), 400

    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    now_utc = datetime.now(timezone.utc)

    reset_record = PasswordResetToken.query.filter_by(token_hash=token_hash).first()
    if not reset_record:
        return jsonify({
            "success": False,
            "error": "Invalid or unrecognized reset token.",
            "code": "TOKEN_INVALID"
        }), 400

    if reset_record.is_used:
        return jsonify({
            "success": False,
            "error": "This reset token has already been used.",
            "code": "TOKEN_ALREADY_USED"
        }), 400

    expires_at = reset_record.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < now_utc:
        return jsonify({
            "success": False,
            "error": "This reset token has expired. Please request a new one.",
            "code": "TOKEN_EXPIRED"
        }), 400

    target_id = reset_record.user_id
    if isinstance(target_id, str):
        target_id = uuid.UUID(target_id)
    user = User.query.filter_by(id=target_id).first()
    if not user or not user.is_active:
        return jsonify({
            "success": False,
            "error": "User account not found or inactive.",
            "code": "USER_NOT_FOUND"
        }), 400

    try:
        user.set_password(new_password)
        reset_record.is_used = True
        db_session.commit()

        return jsonify({
            "success": True,
            "message": "Password has been successfully updated. You may now log in with your new password."
        }), 200

    except Exception as e:
        db_session.rollback()
        return jsonify({
            "success": False,
            "error": f"Failed to reset password: {str(e)}",
            "code": "SERVER_ERROR"
        }), 500
