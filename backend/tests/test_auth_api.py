import os
import sys
import unittest
import uuid

# Ensure backend root is on python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Use a local test SQLite DB for automated test isolation
test_db_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "test_auth.db"))
os.environ["DATABASE_URL"] = f"sqlite:///{test_db_path}"

from app import create_app
from app.db import engine, db_session, Base
from app.models.user import User, PasswordResetToken
from app.utils.security import generate_token

class TestAuthAPI(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)
        cls.app = create_app()
        cls.client = cls.app.test_client()

    @classmethod
    def tearDownClass(cls):
        db_session.remove()
        Base.metadata.drop_all(bind=engine)
        if os.path.exists(test_db_path):
            try:
                os.remove(test_db_path)
            except Exception:
                pass

    def setUp(self):
        # Clean users between test runs
        db_session.query(PasswordResetToken).delete()
        db_session.query(User).delete()
        db_session.commit()

    def test_01_customer_registration_success(self):
        """Test public registration with valid inputs."""
        payload = {
            "email": "customer@acme.com",
            "password": "ValidPassword@2026",
            "full_name": "Alice Customer",
            "company_name": "Acme Corp",
            "phone": "+1-555-0100"
        }
        res = self.client.post("/api/auth/register", json=payload)
        self.assertEqual(res.status_code, 201)
        data = res.get_json()
        self.assertTrue(data["success"])
        self.assertIn("token", data["data"])
        self.assertEqual(data["data"]["user"]["role"], "CUSTOMER")
        self.assertEqual(data["data"]["user"]["email"], "customer@acme.com")

    def test_02_registration_privilege_escalation_prevented(self):
        """Test that public registration CANNOT create ADMIN accounts."""
        payload = {
            "email": "hacker@test.com",
            "password": "HackerPass!2026",
            "full_name": "Malicious User",
            "role": "ADMIN" # Attempting to escalate role
        }
        res = self.client.post("/api/auth/register", json=payload)
        self.assertEqual(res.status_code, 201)
        data = res.get_json()
        # Role must be strictly forced to CUSTOMER
        self.assertEqual(data["data"]["user"]["role"], "CUSTOMER")
        
        db_user = User.query.filter_by(email="hacker@test.com").first()
        self.assertEqual(db_user.role, "CUSTOMER")

    def test_03_registration_short_password_rejected(self):
        """Rule: Password must be MORE THAN 8 characters."""
        payload = {
            "email": "short@test.com",
            "password": "Abc!1234", # Exactly 8 characters
            "full_name": "Short Password"
        }
        res = self.client.post("/api/auth/register", json=payload)
        self.assertEqual(res.status_code, 400)
        data = res.get_json()
        self.assertFalse(data["success"])
        self.assertEqual(data["code"], "INVALID_PASSWORD")

    def test_04_registration_duplicate_email_rejected(self):
        """Duplicate emails must return 409 Conflict."""
        payload = {
            "email": "duplicate@test.com",
            "password": "ValidPass#2026",
            "full_name": "First User"
        }
        self.client.post("/api/auth/register", json=payload)
        
        # Second registration with identical email
        res2 = self.client.post("/api/auth/register", json=payload)
        self.assertEqual(res2.status_code, 409)
        data2 = res2.get_json()
        self.assertEqual(data2["code"], "EMAIL_ALREADY_EXISTS")

    def test_05_login_success_and_failure(self):
        """Test login authentication and JWT token issuance."""
        user = User(
            id=uuid.uuid4(),
            email="login@test.com",
            full_name="Login User",
            role="CUSTOMER"
        )
        user.set_password("LoginPassword$2026")
        db_session.add(user)
        db_session.commit()

        # 1. Correct credentials
        res = self.client.post("/api/auth/login", json={
            "email": "login@test.com",
            "password": "LoginPassword$2026"
        })
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data["success"])
        self.assertIn("token", data["data"])
        self.assertEqual(data["data"]["user"]["email"], "login@test.com")

        # 2. Incorrect password
        res_fail = self.client.post("/api/auth/login", json={
            "email": "login@test.com",
            "password": "WrongPassword$2026"
        })
        self.assertEqual(res_fail.status_code, 401)
        self.assertEqual(res_fail.get_json()["code"], "INVALID_CREDENTIALS")

    def test_06_get_me_endpoint(self):
        """Test GET /api/auth/me with valid and invalid JWT."""
        user = User(
            id=uuid.uuid4(),
            email="me@test.com",
            full_name="Me User",
            role="CUSTOMER"
        )
        user.set_password("SecurePass%2026")
        db_session.add(user)
        db_session.commit()

        token = generate_token(user)

        # 1. Without token -> 401
        res_unauth = self.client.get("/api/auth/me")
        self.assertEqual(res_unauth.status_code, 401)

        # 2. With valid token -> 200
        res_auth = self.client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(res_auth.status_code, 200)
        data = res_auth.get_json()
        self.assertEqual(data["data"]["user"]["email"], "me@test.com")

    def test_07_forgot_and_reset_password_flow(self):
        """Test forgot-password generation and reset-password execution."""
        user = User(
            id=uuid.uuid4(),
            email="reset@test.com",
            full_name="Reset User",
            role="CUSTOMER"
        )
        user.set_password("OldPassword#2026")
        db_session.add(user)
        db_session.commit()

        # 1. Request forgot password
        res_forgot = self.client.post("/api/auth/forgot-password", json={"email": "reset@test.com"})
        self.assertEqual(res_forgot.status_code, 200)
        data_forgot = res_forgot.get_json()
        raw_token = data_forgot.get("dev_reset_token")
        self.assertIsNotNone(raw_token)

        # 2. Reset password using the token
        res_reset = self.client.post("/api/auth/reset-password", json={
            "token": raw_token,
            "new_password": "BrandNewPassword^2026"
        })
        self.assertEqual(res_reset.status_code, 200)

        # 3. Verify user can log in with new password
        res_new_login = self.client.post("/api/auth/login", json={
            "email": "reset@test.com",
            "password": "BrandNewPassword^2026"
        })
        self.assertEqual(res_new_login.status_code, 200)

        # 4. Attempt to reuse token (Single-use enforcement)
        res_reuse = self.client.post("/api/auth/reset-password", json={
            "token": raw_token,
            "new_password": "AnotherNewPassword&2026"
        })
        self.assertEqual(res_reuse.status_code, 400)
        self.assertEqual(res_reuse.get_json()["code"], "TOKEN_ALREADY_USED")

    def test_08_staff_creation_by_admin_only(self):
        """Test that ONLY ADMIN can create STAFF accounts."""
        admin = User(
            id=uuid.uuid4(),
            email="admin@test.com",
            full_name="Admin Boss",
            role="ADMIN"
        )
        admin.set_password("AdminPass*2026")

        customer = User(
            id=uuid.uuid4(),
            email="cust@test.com",
            full_name="Customer User",
            role="CUSTOMER"
        )
        customer.set_password("CustPass*2026")

        db_session.add_all([admin, customer])
        db_session.commit()

        admin_token = generate_token(admin)
        customer_token = generate_token(customer)

        staff_payload = {
            "email": "newstaff@brightloop.io",
            "password": "StaffPassword(2026)",
            "full_name": "New Support Staff"
        }

        # 1. Customer attempts to create staff -> 403 Forbidden
        res_cust = self.client.post(
            "/api/users/staff",
            json=staff_payload,
            headers={"Authorization": f"Bearer {customer_token}"}
        )
        self.assertEqual(res_cust.status_code, 403)

        # 2. Admin creates staff -> 201 Created
        res_admin = self.client.post(
            "/api/users/staff",
            json=staff_payload,
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        self.assertEqual(res_admin.status_code, 201)
        data = res_admin.get_json()
        self.assertEqual(data["data"]["user"]["role"], "STAFF")

    def test_09_list_users_filtering_admin_only(self):
        """Test GET /api/users with role and search filters."""
        admin = User(
            id=uuid.uuid4(),
            email="superadmin@test.com",
            full_name="Super Admin",
            role="ADMIN"
        )
        admin.set_password("AdminSecret)2026")
        db_session.add(admin)
        db_session.commit()

        token = generate_token(admin)

        res = self.client.get("/api/users?role=ADMIN", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data["success"])
        self.assertGreaterEqual(data["data"]["total"], 1)

if __name__ == "__main__":
    unittest.main()
