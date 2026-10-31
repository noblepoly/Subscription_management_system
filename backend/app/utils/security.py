import jwt
from datetime import datetime, timezone, timedelta
from functools import wraps
from flask import request, jsonify, g
from app.config import Config
from app.models.user import User

def generate_token(user: User) -> str:
    payload = {
        "user_id": str(user.id),
        "email": user.email,
        "role": user.role,
        "full_name": user.full_name,
        "exp": datetime.now(timezone.utc) + timedelta(hours=Config.JWT_EXPIRATION_HOURS),
        "iat": datetime.now(timezone.utc)
    }
    return jwt.encode(payload, Config.SECRET_KEY, algorithm="HS256")

def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, Config.SECRET_KEY, algorithms=["HS256"])
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            return jsonify({"error": "Authorization token required", "code": "UNAUTHORIZED"}), 401
        
        token = auth_header.split(" ")[1]
        payload = decode_token(token)
        if not payload:
            return jsonify({"error": "Invalid or expired token", "code": "TOKEN_INVALID"}), 401
        
        user = User.query.filter_by(id=payload["user_id"], is_active=True).first()
        if not user:
            return jsonify({"error": "User account inactive or not found", "code": "USER_NOT_FOUND"}), 401
        
        g.current_user = user
        return f(*args, **kwargs)
    return decorated_function

def role_required(allowed_roles: list[str]):
    def decorator(f):
        @wraps(f)
        @login_required
        def decorated_function(*args, **kwargs):
            if g.current_user.role not in allowed_roles:
                return jsonify({
                    "error": f"Access denied. Requires one of the following roles: {', '.join(allowed_roles)}",
                    "code": "FORBIDDEN"
                }), 403
            return f(*args, **kwargs)
        return decorated_function
    return decorator
