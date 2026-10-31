import os
import sys
import uuid
import unittest
from decimal import Decimal
from datetime import date, timedelta

# Ensure backend root is on python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Use a local test SQLite DB for automated test isolation
test_db_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "test_catalog.db"))
os.environ["DATABASE_URL"] = f"sqlite:///{test_db_path}"

from app import create_app
from app.db import engine, db_session, Base
from app.models.user import User
from app.models.product import Product, ProductVariant
from app.models.plan import SubscriptionPlan
from app.models.tax_discount import TaxRate, Discount
from app.utils.security import generate_token

class TestCatalogAndPricingAPI(unittest.TestCase):

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
        # Create fresh Admin, Staff, and Customer users for RBAC testing
        db_session.query(ProductVariant).delete()
        db_session.query(Product).delete()
        db_session.query(SubscriptionPlan).delete()
        db_session.query(TaxRate).delete()
        db_session.query(Discount).delete()
        db_session.query(User).delete()
        db_session.commit()

        self.admin = User(id=uuid.uuid4(), email="admin@catalog.io", full_name="Admin User", role="ADMIN")
        self.admin.set_password("AdminSecurePass#2026")
        self.staff = User(id=uuid.uuid4(), email="staff@catalog.io", full_name="Staff User", role="STAFF")
        self.staff.set_password("StaffSecurePass#2026")
        self.customer = User(id=uuid.uuid4(), email="customer@catalog.io", full_name="Customer User", role="CUSTOMER")
        self.customer.set_password("CustomerSecurePass#2026")

        db_session.add_all([self.admin, self.staff, self.customer])
        db_session.commit()

        self.admin_token = generate_token(self.admin)
        self.staff_token = generate_token(self.staff)
        self.customer_token = generate_token(self.customer)

        self.admin_headers = {"Authorization": f"Bearer {self.admin_token}"}
        self.staff_headers = {"Authorization": f"Bearer {self.staff_token}"}
        self.customer_headers = {"Authorization": f"Bearer {self.customer_token}"}

    # =========================================================================
    # 1. PRODUCTS CRUD TESTS
    # =========================================================================
    def test_01_create_product_admin_only(self):
        payload = {
            "name": "Cloud CRM Platform",
            "product_type": "SOFTWARE",
            "sales_price": 99.99,
            "cost_price": 25.00,
            "description": "Multi-tenant enterprise CRM",
            "variants": [
                {"variant_name": "Standard Tier", "sku": "CRM-STD", "additional_price": 0.00},
                {"variant_name": "Pro Tier", "sku": "CRM-PRO", "additional_price": 49.00}
            ]
        }
        # Customer cannot create product -> 403
        res_cust = self.client.post("/api/products", json=payload, headers=self.customer_headers)
        self.assertEqual(res_cust.status_code, 403)

        # Staff cannot create product -> 403
        res_staff = self.client.post("/api/products", json=payload, headers=self.staff_headers)
        self.assertEqual(res_staff.status_code, 403)

        # Admin creates product -> 201
        res_admin = self.client.post("/api/products", json=payload, headers=self.admin_headers)
        self.assertEqual(res_admin.status_code, 201)
        data = res_admin.get_json()
        self.assertTrue(data["success"])
        self.assertEqual(data["product"]["name"], "Cloud CRM Platform")
        self.assertEqual(len(data["product"]["variants"]), 2)

    def test_02_product_validation(self):
        # Negative price rejected
        res = self.client.post("/api/products", json={"name": "Bad Product", "sales_price": -10.0}, headers=self.admin_headers)
        self.assertEqual(res.status_code, 400)

        # Invalid product_type rejected
        res2 = self.client.post("/api/products", json={"name": "Bad Type", "product_type": "UNKNOWN"}, headers=self.admin_headers)
        self.assertEqual(res2.status_code, 400)

    def test_03_list_and_search_products(self):
        p1 = Product(id=uuid.uuid4(), name="Database Monitoring", product_type="SOFTWARE", sales_price=Decimal("150.00"))
        p2 = Product(id=uuid.uuid4(), name="Network Telemetry", product_type="SERVICE", sales_price=Decimal("80.00"))
        db_session.add_all([p1, p2])
        db_session.commit()

        # Public listing
        res = self.client.get("/api/products")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.get_json()["products"]), 2)

        # Search filter
        res_search = self.client.get("/api/products?search=Monitoring")
        self.assertEqual(len(res_search.get_json()["products"]), 1)
        self.assertEqual(res_search.get_json()["products"][0]["name"], "Database Monitoring")

        # Type filter
        res_type = self.client.get("/api/products?product_type=SERVICE")
        self.assertEqual(len(res_type.get_json()["products"]), 1)
        self.assertEqual(res_type.get_json()["products"][0]["name"], "Network Telemetry")

    # =========================================================================
    # 2. PRODUCT VARIANTS CRUD TESTS
    # =========================================================================
    def test_04_product_variant_crud_and_uniqueness(self):
        prod_id = uuid.uuid4()
        prod = Product(id=prod_id, name="API Gateway", product_type="SOFTWARE", sales_price=Decimal("50.00"))
        db_session.add(prod)
        db_session.commit()

        # 1. Add variant (Admin)
        res_v1 = self.client.post(
            f"/api/products/{prod_id}/variants",
            json={"variant_name": "High Availability", "sku": "GW-HA", "additional_price": 30.00},
            headers=self.admin_headers
        )
        self.assertEqual(res_v1.status_code, 201)
        variant_id = res_v1.get_json()["variant"]["id"]

        # 2. Duplicate variant name on same product rejected -> 409
        res_dup = self.client.post(
            f"/api/products/{prod_id}/variants",
            json={"variant_name": "High Availability", "sku": "GW-HA-2", "additional_price": 40.00},
            headers=self.admin_headers
        )
        self.assertEqual(res_dup.status_code, 409)

        # 3. Update variant
        res_update = self.client.put(
            f"/api/products/{prod_id}/variants/{variant_id}",
            json={"additional_price": 35.00},
            headers=self.admin_headers
        )
        self.assertEqual(res_update.status_code, 200)
        self.assertEqual(res_update.get_json()["variant"]["additional_price"], 35.0)

        # 4. Delete variant
        res_del = self.client.delete(f"/api/products/{prod_id}/variants/{variant_id}", headers=self.admin_headers)
        self.assertEqual(res_del.status_code, 200)

    # =========================================================================
    # 3. SUBSCRIPTION PLANS CRUD TESTS
    # =========================================================================
    def test_05_subscription_plans_crud(self):
        today = date.today()
        plan_payload = {
            "name": "Quarterly Pro Tier",
            "billing_interval": "MONTHLY",
            "interval_count": 3, # 3-month plan
            "minimum_quantity": 2,
            "base_price": 270.00,
            "available_from": today.isoformat(),
            "available_to": (today + timedelta(days=90)).isoformat(),
            "auto_close": True,
            "auto_close_days": 365
        }
        # Non-admin rejected
        res_unauth = self.client.post("/api/plans", json=plan_payload, headers=self.staff_headers)
        self.assertEqual(res_unauth.status_code, 403)

        # Admin created
        res_create = self.client.post("/api/plans", json=plan_payload, headers=self.admin_headers)
        self.assertEqual(res_create.status_code, 201)
        plan_id = res_create.get_json()["plan"]["id"]
        self.assertEqual(res_create.get_json()["plan"]["interval_count"], 3)
        self.assertEqual(res_create.get_json()["plan"]["minimum_quantity"], 2)

        # Query plans
        res_list = self.client.get("/api/plans?billing_interval=MONTHLY")
        self.assertEqual(res_list.status_code, 200)
        self.assertEqual(len(res_list.get_json()["plans"]), 1)

        # Update plan
        res_upd = self.client.put(f"/api/plans/{plan_id}", json={"base_price": 299.00}, headers=self.admin_headers)
        self.assertEqual(res_upd.status_code, 200)
        self.assertEqual(res_upd.get_json()["plan"]["base_price"], 299.0)

    # =========================================================================
    # 4. TAX RATES CRUD TESTS
    # =========================================================================
    def test_06_tax_rates_crud(self):
        # Admin creates GST 18%
        res = self.client.post("/api/taxes", json={"name": "GST 18%", "rate_percentage": 18.0}, headers=self.admin_headers)
        self.assertEqual(res.status_code, 201)
        tax_id = res.get_json()["tax"]["id"]

        # Validate range (> 100 rejected)
        res_invalid = self.client.post("/api/taxes", json={"name": "Over 100", "rate_percentage": 105.0}, headers=self.admin_headers)
        self.assertEqual(res_invalid.status_code, 400)

        # List taxes
        res_list = self.client.get("/api/taxes")
        self.assertEqual(res_list.status_code, 200)
        self.assertEqual(len(res_list.get_json()["taxes"]), 1)

        # Update tax
        res_upd = self.client.put(f"/api/taxes/{tax_id}", json={"rate_percentage": 12.0}, headers=self.admin_headers)
        self.assertEqual(res_upd.status_code, 200)
        self.assertEqual(res_upd.get_json()["tax"]["rate_percentage"], 12.0)

    # =========================================================================
    # 5. DISCOUNTS CRUD & REAL-TIME VALIDATION TESTS
    # =========================================================================
    def test_07_discounts_crud_and_validation(self):
        today = date.today()
        disc_payload = {
            "code": "PROMO20",
            "description": "20% off summer promo",
            "discount_type": "PERCENTAGE",
            "discount_value": 20.0,
            "scope": "SUBSCRIPTION",
            "min_purchase_amount": 100.0,
            "min_quantity": 1,
            "start_date": (today - timedelta(days=2)).isoformat(),
            "end_date": (today + timedelta(days=30)).isoformat(),
            "usage_limit": 50
        }
        # Admin creates discount
        res = self.client.post("/api/discounts", json=disc_payload, headers=self.admin_headers)
        self.assertEqual(res.status_code, 201)
        disc_id = res.get_json()["discount"]["id"]

        # Duplicate code rejected -> 409
        res_dup = self.client.post("/api/discounts", json=disc_payload, headers=self.admin_headers)
        self.assertEqual(res_dup.status_code, 409)

        # Real-time discount validation endpoint
        # 1. Eligible order ($200 purchase with min $100 requirement)
        res_val = self.client.post("/api/discounts/validate", json={
            "code": "PROMO20",
            "subtotal": 200.0,
            "quantity": 1
        })
        self.assertEqual(res_val.status_code, 200)
        val_data = res_val.get_json()
        self.assertTrue(val_data["eligible"])
        self.assertEqual(val_data["calculated_discount"], 40.0) # 20% of 200 = 40.0

        # 2. Ineligible order ($50 purchase under $100 min) -> 400
        res_inelig = self.client.post("/api/discounts/validate", json={
            "code": "PROMO20",
            "subtotal": 50.0,
            "quantity": 1
        })
        self.assertEqual(res_inelig.status_code, 400)
        self.assertFalse(res_inelig.get_json()["eligible"])

        # Soft delete discount
        res_del = self.client.delete(f"/api/discounts/{disc_id}", headers=self.admin_headers)
        self.assertEqual(res_del.status_code, 200)

if __name__ == "__main__":
    unittest.main()
