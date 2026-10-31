import uuid
from decimal import Decimal
from datetime import date, timedelta
import pytest

from app.utils.security import generate_token
from app.models.product import Product, ProductVariant
from app.models.plan import SubscriptionPlan
from app.models.tax_discount import TaxRate, Discount

class TestProductAndVariantAPIRobustness:
    def test_create_product_missing_name_rejected(self, client, seeded_db):
        admin_token = generate_token(seeded_db["admin"])
        headers = {"Authorization": f"Bearer {admin_token}"}

        payload = {
            "name": "",
            "product_type": "SOFTWARE",
            "sales_price": "99.00"
        }
        res = client.post("/api/products", json=payload, headers=headers)
        assert res.status_code == 400
        assert res.get_json()["code"] == "MISSING_PRODUCT_NAME"

    def test_create_product_invalid_type_rejected(self, client, seeded_db):
        admin_token = generate_token(seeded_db["admin"])
        headers = {"Authorization": f"Bearer {admin_token}"}

        payload = {
            "name": "Invalid Product",
            "product_type": "UNSUPPORTED_TYPE",
            "sales_price": "99.00"
        }
        res = client.post("/api/products", json=payload, headers=headers)
        assert res.status_code == 400
        assert res.get_json()["code"] == "INVALID_PRODUCT_TYPE"

    def test_create_product_negative_sales_price_rejected(self, client, seeded_db):
        admin_token = generate_token(seeded_db["admin"])
        headers = {"Authorization": f"Bearer {admin_token}"}

        payload = {
            "name": "Negative Price Item",
            "product_type": "SOFTWARE",
            "sales_price": "-25.00"
        }
        res = client.post("/api/products", json=payload, headers=headers)
        assert res.status_code == 400
        assert res.get_json()["code"] == "INVALID_PRICE"

    def test_customer_forbidden_from_creating_product(self, client, seeded_db):
        cust_token = generate_token(seeded_db["customer1"])
        headers = {"Authorization": f"Bearer {cust_token}"}

        payload = {
            "name": "Unauthorized Software",
            "product_type": "SOFTWARE",
            "sales_price": "99.00"
        }
        res = client.post("/api/products", json=payload, headers=headers)
        assert res.status_code == 403

    def test_staff_forbidden_from_creating_product(self, client, seeded_db):
        staff_token = generate_token(seeded_db["staff"])
        headers = {"Authorization": f"Bearer {staff_token}"}

        payload = {
            "name": "Staff Created Software",
            "product_type": "SOFTWARE",
            "sales_price": "99.00"
        }
        res = client.post("/api/products", json=payload, headers=headers)
        assert res.status_code == 403

    def test_duplicate_variant_name_via_api_rejected(self, client, seeded_db):
        admin_token = generate_token(seeded_db["admin"])
        headers = {"Authorization": f"Bearer {admin_token}"}
        prod = seeded_db["prod_software"]

        # Add initial variant
        v_payload = {
            "variant_name": "Premium Tier",
            "additional_price": "40.00",
            "sku": "VAR-PREM-1"
        }
        res1 = client.post(f"/api/products/{prod.id}/variants", json=v_payload, headers=headers)
        assert res1.status_code == 201

        # Attempt duplicate variant name for the same product
        res2 = client.post(f"/api/products/{prod.id}/variants", json=v_payload, headers=headers)
        assert res2.status_code in (400, 409)
        assert "DUPLICATE" in res2.get_json()["code"]

class TestPlanAPIRobustness:
    def test_create_plan_invalid_interval_rejected(self, client, seeded_db):
        admin_token = generate_token(seeded_db["admin"])
        headers = {"Authorization": f"Bearer {admin_token}"}

        payload = {
            "name": "Hourly Flex Plan",
            "billing_interval": "HOURLY", # Invalid
            "base_price": "10.00"
        }
        res = client.post("/api/plans", json=payload, headers=headers)
        assert res.status_code == 400
        assert res.get_json()["code"] == "INVALID_INTERVAL"

    def test_create_plan_negative_base_price_rejected(self, client, seeded_db):
        admin_token = generate_token(seeded_db["admin"])
        headers = {"Authorization": f"Bearer {admin_token}"}

        payload = {
            "name": "Invalid Price Plan",
            "billing_interval": "MONTHLY",
            "base_price": "-50.00"
        }
        res = client.post("/api/plans", json=payload, headers=headers)
        assert res.status_code == 400
        assert res.get_json()["code"] == "INVALID_PRICE"

    def test_plan_date_range_inversion_rejected(self, client, seeded_db):
        admin_token = generate_token(seeded_db["admin"])
        headers = {"Authorization": f"Bearer {admin_token}"}

        payload = {
            "name": "Backwards Date Plan",
            "billing_interval": "MONTHLY",
            "base_price": "100.00",
            "available_from": "2026-12-31",
            "available_to": "2026-01-01" # Earlier than available_from
        }
        res = client.post("/api/plans", json=payload, headers=headers)
        assert res.status_code == 400
        assert res.get_json()["code"] == "INVALID_DATE_RANGE"

class TestDiscountAndTaxAPIRobustness:
    def test_create_tax_negative_rate_rejected(self, client, seeded_db):
        admin_token = generate_token(seeded_db["admin"])
        headers = {"Authorization": f"Bearer {admin_token}"}

        payload = {"name": "Negative Tax", "rate_percentage": "-5.0"}
        res = client.post("/api/taxes", json=payload, headers=headers)
        assert res.status_code == 400
        assert res.get_json()["code"] == "INVALID_RATE"

    def test_create_tax_excessive_rate_rejected(self, client, seeded_db):
        admin_token = generate_token(seeded_db["admin"])
        headers = {"Authorization": f"Bearer {admin_token}"}

        payload = {"name": "Excessive Tax", "rate_percentage": "105.0"}
        res = client.post("/api/taxes", json=payload, headers=headers)
        assert res.status_code == 400
        assert res.get_json()["code"] == "INVALID_RATE"

    def test_create_discount_duplicate_code_rejected(self, client, seeded_db):
        admin_token = generate_token(seeded_db["admin"])
        headers = {"Authorization": f"Bearer {admin_token}"}

        payload = {
            "code": "UNIQUECODE",
            "discount_type": "PERCENTAGE",
            "discount_value": "15.00"
        }
        res1 = client.post("/api/discounts", json=payload, headers=headers)
        assert res1.status_code == 201

        res2 = client.post("/api/discounts", json=payload, headers=headers)
        assert res2.status_code == 409
        assert res2.get_json()["code"] == "DUPLICATE_CODE"

    def test_discount_validation_endpoint_eligible(self, client, seeded_db):
        disc = seeded_db["disc_percentage"] # SAVE20: 20% off, min spend 50.00

        payload = {
            "code": disc.code,
            "subtotal": "100.00",
            "quantity": 2
        }
        res = client.post("/api/discounts/validate", json=payload)
        assert res.status_code == 200
        data = res.get_json()
        assert data["eligible"] is True
        assert data["calculated_discount"] == 20.0

    def test_discount_validation_endpoint_minimum_purchase_unmet(self, client, seeded_db):
        disc = seeded_db["disc_fixed"] # FIXED30: $30 off, min spend $100

        payload = {
            "code": disc.code,
            "subtotal": "60.00", # Below minimum purchase threshold ($100)
            "quantity": 1
        }
        res = client.post("/api/discounts/validate", json=payload)
        assert res.status_code == 400
        data = res.get_json()
        assert data["eligible"] is False
        assert "minimum purchase" in data["error"].lower()

    def test_discount_validation_endpoint_product_scope(self, client, seeded_db):
        scoped_disc = seeded_db["disc_product_scoped"] # SOFTWARE10: applies to prod_software only
        prod_software = seeded_db["prod_software"]
        prod_addon = seeded_db["prod_addon"]

        # Ineligible cart: only prod_addon
        res_bad = client.post("/api/discounts/validate", json={
            "code": scoped_disc.code,
            "subtotal": "150.00",
            "quantity": 1,
            "product_ids": [str(prod_addon.id)]
        })
        assert res_bad.status_code == 400
        assert res_bad.get_json()["eligible"] is False

        # Eligible cart: includes prod_software
        res_good = client.post("/api/discounts/validate", json={
            "code": scoped_disc.code,
            "subtotal": "150.00",
            "quantity": 1,
            "product_ids": [str(prod_software.id)]
        })
        assert res_good.status_code == 200
        assert res_good.get_json()["eligible"] is True

class TestUserAndRolePermissionsQA:
    def test_staff_cannot_create_staff_users(self, client, seeded_db):
        """Only ADMIN can create STAFF accounts."""
        staff_token = generate_token(seeded_db["staff"])
        headers = {"Authorization": f"Bearer {staff_token}"}

        payload = {
            "email": "new.staff@brightloop.io",
            "password": "StaffPassword#2026",
            "full_name": "New Staff Member"
        }
        res = client.post("/api/users/staff", json=payload, headers=headers)
        assert res.status_code == 403

    def test_customer_cannot_list_all_users(self, client, seeded_db):
        """Only ADMIN can list all system users."""
        cust_token = generate_token(seeded_db["customer1"])
        headers = {"Authorization": f"Bearer {cust_token}"}

        res = client.get("/api/users", headers=headers)
        assert res.status_code == 403

    def test_admin_can_list_all_users_with_role_filter(self, client, seeded_db):
        admin_token = generate_token(seeded_db["admin"])
        headers = {"Authorization": f"Bearer {admin_token}"}

        res = client.get("/api/users?role=CUSTOMER", headers=headers)
        assert res.status_code == 200
        data = res.get_json()
        users_list = data.get("users") or data.get("data", {}).get("users", [])
        assert len(users_list) >= 2
        assert all(u["role"] == "CUSTOMER" for u in users_list)
