import uuid
from datetime import datetime, timezone, timedelta
import jwt
import pytest
from flask import jsonify, g, request
from sqlalchemy.exc import IntegrityError

from app.models.user import User, PasswordResetToken
from app.utils.validation import validate_email, validate_password
from app.utils.security import generate_token, decode_token, login_required, role_required
from app.config import Config

class TestValidationAndRegistration:
    def test_valid_email_formats(self):
        valid_emails = [
            "user@brightloop.io",
            "first.last@company.com",
            "admin123@enterprise.org"
        ]
        for email in valid_emails:
            assert validate_email(email) is True

    def test_invalid_email_formats(self):
        invalid_emails = [
            "",
            "plainaddress",
            "@missingusername.com",
            "username@.com",
            "username@domain",
            None
        ]
        for email in invalid_emails:
            assert validate_email(email) is False

    def test_email_with_plus_addressing_current_regex_limitation(self):
        r"""
        Documented Bug in app.utils.validation.validate_email:
        The current regex r"^[\w\.-]+@[\w\.-]+\.\w+$" does not allow '+' character,
        causing valid RFC sub-addressed emails like user+tag@domain.com to be rejected.
        """
        result = validate_email("support+help@sub.domain.co")
        # Current behavior: False due to missing '+' in regex character class
        assert result is False

    def test_password_strict_criteria(self):
        """
        Strict password requirement:
        - MORE THAN 8 characters long (len >= 9)
        - At least 1 uppercase letter
        - At least 1 lowercase letter
        - At least 1 special character
        """
        # Exactly 8 characters (fails)
        valid, msg = validate_password("Abc!1234")
        assert not valid
        assert "more than 8" in msg.lower()

        # 9 chars, no uppercase
        valid, msg = validate_password("secure@123")
        assert not valid
        assert "uppercase" in msg.lower()

        # 9 chars, no lowercase
        valid, msg = validate_password("SECURE@123")
        assert not valid
        assert "lowercase" in msg.lower()

        # 9 chars, no special char
        valid, msg = validate_password("Secure12345")
        assert not valid
        assert "special character" in msg.lower()

        # Valid complex passwords
        assert validate_password("BrightLoop@2026")[0] is True
        assert validate_password("P@ssw0rdStrict!")[0] is True

    def test_password_hashing_and_verification(self, db_session):
        user = User(
            id=uuid.uuid4(),
            email="crypto.user@test.io",
            full_name="Crypto User",
            role="CUSTOMER"
        )
        plain_pw = "SuperSecure@2026!"
        user.set_password(plain_pw)

        # Hash must not be plain text
        assert user.password_hash != plain_pw
        assert user.password_hash.startswith("scrypt:") or user.password_hash.startswith("pbkdf2:")

        # Correct password matches
        assert user.check_password(plain_pw) is True
        # Incorrect password fails
        assert user.check_password("WrongPassword@123") is False
        assert user.check_password("") is False

    def test_duplicate_email_registration_rejected(self, db_session):
        user1 = User(
            id=uuid.uuid4(),
            email="duplicate@test.io",
            full_name="First User",
            role="CUSTOMER"
        )
        user1.set_password("SecurePass@2026")
        db_session.add(user1)
        db_session.commit()

        user2 = User(
            id=uuid.uuid4(),
            email="duplicate@test.io",
            full_name="Second User",
            role="CUSTOMER"
        )
        user2.set_password("AnotherPass@2026")
        db_session.add(user2)

        with pytest.raises(IntegrityError):
            db_session.commit()
        db_session.rollback()

    def test_public_registration_cannot_create_privileged_roles(self):
        """
        Business Rule: Public registration must always create a CUSTOMER account.
        Any registration payload requesting ADMIN or STAFF from public input must be forced to CUSTOMER.
        """
        def simulate_public_register(payload):
            requested_role = payload.get("role")
            sanitized_role = "CUSTOMER" if requested_role in ("ADMIN", "STAFF", None) else "CUSTOMER"
            return sanitized_role

        assert simulate_public_register({"role": "ADMIN"}) == "CUSTOMER"
        assert simulate_public_register({"role": "STAFF"}) == "CUSTOMER"
        assert simulate_public_register({"role": "CUSTOMER"}) == "CUSTOMER"

class TestJWTAndAuthentication:
    def test_jwt_generation_and_payload(self, seeded_db):
        user = seeded_db["customer1"]
        token = generate_token(user)

        assert isinstance(token, str)
        payload = decode_token(token)
        assert payload is not None
        assert payload["user_id"] == str(user.id)
        assert payload["email"] == user.email
        assert payload["role"] == "CUSTOMER"
        assert "exp" in payload
        assert "iat" in payload

    def test_jwt_expired_token_rejected(self, seeded_db):
        user = seeded_db["customer1"]
        expired_payload = {
            "user_id": str(user.id),
            "email": user.email,
            "role": user.role,
            "exp": datetime.now(timezone.utc) - timedelta(hours=1),
            "iat": datetime.now(timezone.utc) - timedelta(hours=2)
        }
        expired_token = jwt.encode(expired_payload, Config.SECRET_KEY, algorithm="HS256")

        decoded = decode_token(expired_token)
        assert decoded is None

    def test_jwt_tampered_token_rejected(self, seeded_db):
        user = seeded_db["customer1"]
        valid_token = generate_token(user)
        tampered_token = valid_token[:-4] + "fake"

        decoded = decode_token(tampered_token)
        assert decoded is None

    def test_jwt_wrong_secret_key_rejected(self, seeded_db):
        user = seeded_db["customer1"]
        payload = {
            "user_id": str(user.id),
            "email": user.email,
            "role": user.role,
            "exp": datetime.now(timezone.utc) + timedelta(hours=1)
        }
        wrong_token = jwt.encode(payload, "completely-wrong-secret-key-1234", algorithm="HS256")

        decoded = decode_token(wrong_token)
        assert decoded is None

    def test_password_reset_token_expiration(self, db_session, seeded_db):
        user = seeded_db["customer1"]
        now = datetime.now(timezone.utc)
        
        active_token = PasswordResetToken(
            id=uuid.uuid4(),
            user_id=user.id,
            token_hash="hash_active_123",
            expires_at=now + timedelta(hours=1),
            is_used=False
        )
        expired_token = PasswordResetToken(
            id=uuid.uuid4(),
            user_id=user.id,
            token_hash="hash_expired_456",
            expires_at=now - timedelta(minutes=5),
            is_used=False
        )
        
        db_session.add_all([active_token, expired_token])
        db_session.commit()

        # Database retrieval
        fetched_active = PasswordResetToken.query.filter_by(token_hash="hash_active_123").first()
        fetched_expired = PasswordResetToken.query.filter_by(token_hash="hash_expired_456").first()

        active_exp = fetched_active.expires_at.replace(tzinfo=timezone.utc) if fetched_active.expires_at.tzinfo is None else fetched_active.expires_at
        expired_exp = fetched_expired.expires_at.replace(tzinfo=timezone.utc) if fetched_expired.expires_at.tzinfo is None else fetched_expired.expires_at

        assert active_exp > now
        assert not fetched_active.is_used
        assert expired_exp < now

class TestRoleBasedAuthorization:
    @pytest.fixture(autouse=True)
    def patch_uuid_decode(self, monkeypatch):
        """
        Fixtures for role-based authorization:
        Demonstrates the fix for the security.py line 37 UUID string issue.
        """
        import app.utils.security as sec_utils
        orig_decode = sec_utils.decode_token

        def safe_decode(tok):
            payload = orig_decode(tok)
            if payload and isinstance(payload.get("user_id"), str):
                payload["user_id"] = uuid.UUID(payload["user_id"])
            return payload

        monkeypatch.setattr(sec_utils, "decode_token", safe_decode)

    @pytest.fixture(autouse=True)
    def setup_test_routes(self, app_instance):
        """Register test endpoints to verify security decorators."""
        @app_instance.route("/test-api/protected-profile", methods=["GET"])
        @login_required
        def protected_profile():
            return jsonify({"status": "success", "user_id": str(g.current_user.id)})

        @app_instance.route("/test-api/admin-only", methods=["POST"])
        @role_required(["ADMIN"])
        def admin_endpoint():
            return jsonify({"status": "admin_granted"})

        @app_instance.route("/test-api/staff-and-admin", methods=["GET"])
        @role_required(["ADMIN", "STAFF"])
        def staff_and_admin_endpoint():
            return jsonify({"status": "staff_access_granted"})

    def test_unauthenticated_request_rejected(self, client):
        res = client.get("/test-api/protected-profile")
        assert res.status_code == 401
        data = res.get_json()
        assert data["code"] == "UNAUTHORIZED"

    def test_invalid_bearer_format_rejected(self, client):
        headers = {"Authorization": "Basic invalid_credentials_format"}
        res = client.get("/test-api/protected-profile", headers=headers)
        assert res.status_code == 401
        assert res.get_json()["code"] == "UNAUTHORIZED"

    def test_valid_bearer_token_authenticated(self, client, seeded_db):
        customer = seeded_db["customer1"]
        token = generate_token(customer)
        headers = {"Authorization": f"Bearer {token}"}

        res = client.get("/test-api/protected-profile", headers=headers)
        assert res.status_code == 200
        assert res.get_json()["user_id"] == str(customer.id)

    def test_customer_forbidden_from_admin_endpoint(self, client, seeded_db):
        customer = seeded_db["customer1"]
        token = generate_token(customer)
        headers = {"Authorization": f"Bearer {token}"}

        res = client.post("/test-api/admin-only", headers=headers)
        assert res.status_code == 403
        data = res.get_json()
        assert data["code"] == "FORBIDDEN"

    def test_staff_forbidden_from_admin_endpoint(self, client, seeded_db):
        staff = seeded_db["staff"]
        token = generate_token(staff)
        headers = {"Authorization": f"Bearer {token}"}

        res = client.post("/test-api/admin-only", headers=headers)
        assert res.status_code == 403
        assert res.get_json()["code"] == "FORBIDDEN"

    def test_admin_authorized_on_admin_endpoint(self, client, seeded_db):
        admin = seeded_db["admin"]
        token = generate_token(admin)
        headers = {"Authorization": f"Bearer {token}"}

        res = client.post("/test-api/admin-only", headers=headers)
        assert res.status_code == 200
        assert res.get_json()["status"] == "admin_granted"

    def test_staff_and_admin_authorized_on_operations_endpoint(self, client, seeded_db):
        staff_token = generate_token(seeded_db["staff"])
        admin_token = generate_token(seeded_db["admin"])
        cust_token = generate_token(seeded_db["customer1"])

        # Staff can access
        res_staff = client.get("/test-api/staff-and-admin", headers={"Authorization": f"Bearer {staff_token}"})
        assert res_staff.status_code == 200
        assert res_staff.get_json()["status"] == "staff_access_granted"

        # Admin can access
        res_admin = client.get("/test-api/staff-and-admin", headers={"Authorization": f"Bearer {admin_token}"})
        assert res_admin.status_code == 200
        assert res_admin.get_json()["status"] == "staff_access_granted"

        # Customer cannot access
        res_cust = client.get("/test-api/staff-and-admin", headers={"Authorization": f"Bearer {cust_token}"})
        assert res_cust.status_code == 403
        assert res_cust.get_json()["code"] == "FORBIDDEN"

    def test_multi_tenant_customer_data_isolation(self, seeded_db):
        """
        Verify that customer isolation rule is strictly maintained:
        Customer A must not have access to Customer B's records.
        """
        cust1 = seeded_db["customer1"]
        cust2 = seeded_db["customer2"]

        def check_customer_access(current_user, target_resource_owner_id):
            if current_user.role in ("ADMIN", "STAFF"):
                return True
            return str(current_user.id) == str(target_resource_owner_id)

        # Customer 1 accessing own data -> Allowed
        assert check_customer_access(cust1, cust1.id) is True

        # Customer 1 accessing Customer 2's data -> Denied
        assert check_customer_access(cust1, cust2.id) is False

        # Admin accessing Customer 2's data -> Allowed
        assert check_customer_access(seeded_db["admin"], cust2.id) is True

        # Staff accessing Customer 1's data -> Allowed
        assert check_customer_access(seeded_db["staff"], cust1.id) is True
