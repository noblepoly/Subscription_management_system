import pytest
from app.utils.security import generate_token

class TestAPIContractsAndHealth:
    def test_health_check_endpoint(self, client):
        """Verify existing /api/health endpoint returns 200 with service information."""
        res = client.get("/api/health")
        assert res.status_code == 200
        data = res.get_json()
        assert data["status"] == "healthy"
        assert "Brightloop" in data["service"]
        assert data["version"] == "1.0.0"

    def test_auth_register_contract(self, client):
        """Verified implemented by Member 1: POST /api/auth/register."""
        payload = {
            "email": "api.contract.customer@brightloop.io",
            "password": "SecurePass#2026",
            "full_name": "API Contract Customer",
            "company_name": "Contract Test LLC",
            "phone": "+1-555-0199"
        }
        res = client.post("/api/auth/register", json=payload)
        assert res.status_code in (200, 201)
        data = res.get_json()
        assert data.get("success") is True
        user_info = data.get("user") or data.get("data", {}).get("user")
        assert user_info["role"] == "CUSTOMER"

    def test_auth_login_contract(self, client, seeded_db):
        """Verified implemented by Member 1: POST /api/auth/login."""
        admin = seeded_db["admin"]
        payload = {
            "email": admin.email,
            "password": "AdminPass@2026"
        }
        res = client.post("/api/auth/login", json=payload)
        assert res.status_code == 200
        data = res.get_json()
        assert data.get("success") is True
        assert "token" in data or "token" in data.get("data", {})

    def test_product_catalog_contract(self, client):
        """Verified implemented by Member 1: GET /api/products."""
        res = client.get("/api/products")
        assert res.status_code == 200
        data = res.get_json()
        assert data.get("success") is True
        products = data.get("products") or data.get("data", {}).get("products")
        assert isinstance(products, list)

    def test_subscription_plans_contract(self, client):
        """Verified implemented by Member 1: GET /api/plans."""
        res = client.get("/api/plans")
        assert res.status_code == 200
        data = res.get_json()
        assert data.get("success") is True
        plans = data.get("plans") or data.get("data", {}).get("plans")
        assert isinstance(plans, list)

    def test_tax_rates_contract(self, client):
        """Verified implemented by Member 1: GET /api/taxes."""
        res = client.get("/api/taxes")
        assert res.status_code == 200
        data = res.get_json()
        assert data.get("success") is True
        taxes = data.get("taxes") or data.get("data", {}).get("taxes")
        assert isinstance(taxes, list)

    def test_discounts_contract(self, client):
        """Verified implemented by Member 1: GET /api/discounts."""
        res = client.get("/api/discounts")
        assert res.status_code == 200
        data = res.get_json()
        assert data.get("success") is True
        discounts = data.get("discounts") or data.get("data", {}).get("discounts")
        assert isinstance(discounts, list)

    # =========================================================================
    # CONTRACTS IMPLEMENTED (REST Route Blueprints)
    # =========================================================================

    def test_subscriptions_contract(self, client):
        res = client.get("/api/subscriptions")
        assert res.status_code in (200, 401)

    def test_invoices_contract(self, client):
        res = client.get("/api/invoices")
        assert res.status_code in (200, 401)

    def test_payments_contract(self, client):
        res = client.get("/api/payments")
        assert res.status_code in (200, 401)

    def test_dashboard_analytics_contract(self, client):
        res = client.get("/api/dashboard/stats")
        assert res.status_code in (200, 401)
