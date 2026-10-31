import pytest

class TestAPIContractsAndHealth:
    def test_health_check_endpoint(self, client):
        """Verify existing /api/health endpoint returns 200 with service information."""
        res = client.get("/api/health")
        assert res.status_code == 200
        data = res.get_json()
        assert data["status"] == "healthy"
        assert "Brightloop" in data["service"]
        assert data["version"] == "1.0.0"

    @pytest.mark.xfail(reason="Waiting for Member 1 to implement auth blueprint (/api/auth/register)")
    def test_auth_register_contract(self, client):
        payload = {
            "email": "new.customer@brightloop.io",
            "password": "SecurePass@2026",
            "full_name": "New Customer"
        }
        res = client.post("/api/auth/register", json=payload)
        assert res.status_code in (200, 201)
        data = res.get_json()
        assert "user" in data
        assert data["user"]["role"] == "CUSTOMER"

    @pytest.mark.xfail(reason="Waiting for Member 1 to implement auth blueprint (/api/auth/login)")
    def test_auth_login_contract(self, client):
        payload = {
            "email": "admin@test.brightloop.io",
            "password": "AdminPass@2026"
        }
        res = client.post("/api/auth/login", json=payload)
        assert res.status_code == 200
        data = res.get_json()
        assert "token" in data
        assert "user" in data

    @pytest.mark.xfail(reason="Waiting for Member 1 to implement catalog blueprint (/api/products)")
    def test_product_catalog_contract(self, client):
        res = client.get("/api/products")
        assert res.status_code == 200
        data = res.get_json()
        assert isinstance(data, list) or "products" in data

    @pytest.mark.xfail(reason="Waiting for Member 1 to implement plans blueprint (/api/plans)")
    def test_subscription_plans_contract(self, client):
        res = client.get("/api/plans")
        assert res.status_code == 200
        data = res.get_json()
        assert isinstance(data, list) or "plans" in data

    @pytest.mark.xfail(reason="Waiting for Member 1 to implement subscriptions blueprint (/api/subscriptions)")
    def test_subscriptions_contract(self, client):
        res = client.get("/api/subscriptions")
        assert res.status_code in (200, 401)

    @pytest.mark.xfail(reason="Waiting for Member 1 to implement invoices blueprint (/api/invoices)")
    def test_invoices_contract(self, client):
        res = client.get("/api/invoices")
        assert res.status_code in (200, 401)

    @pytest.mark.xfail(reason="Waiting for Member 1 to implement payments blueprint (/api/payments)")
    def test_payments_contract(self, client):
        res = client.get("/api/payments")
        assert res.status_code in (200, 401)

    @pytest.mark.xfail(reason="Waiting for Member 1 to implement dashboard analytics blueprint (/api/dashboard/stats)")
    def test_dashboard_analytics_contract(self, client):
        res = client.get("/api/dashboard/stats")
        assert res.status_code in (200, 401)
