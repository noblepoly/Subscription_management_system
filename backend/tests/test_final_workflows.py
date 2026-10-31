import uuid
from decimal import Decimal
from datetime import datetime, timezone, date, timedelta
import pytest
from app.utils.security import generate_token
from app.models.subscription import Subscription, SubscriptionItem
from app.models.invoice import Invoice
from app.models.payment import Payment

class TestSubscriptionWorkflowAPIs:
    def test_customer_create_and_list_own_subscription(self, client, seeded_db):
        cust = seeded_db["customer1"]
        plan = seeded_db["plan_monthly"]
        prod = seeded_db["prod_software"]
        token = generate_token(cust)
        headers = {"Authorization": f"Bearer {token}"}

        payload = {
            "plan_id": str(plan.id),
            "status": "CONFIRMED",
            "items": [
                {
                    "product_id": str(prod.id),
                    "quantity": 2,
                    "unit_price": 99.00
                }
            ],
            "notes": "Testing customer subscription creation"
        }
        res = client.post("/api/subscriptions", json=payload, headers=headers)
        assert res.status_code == 201
        data = res.get_json()
        assert data["success"] is True
        sub = data["subscription"]
        assert sub["customer_id"] == str(cust.id)
        assert sub["status"] == "CONFIRMED"
        assert sub["subtotal"] == 198.00

        # Customer listing subscriptions only returns their own
        res_list = client.get("/api/subscriptions", headers=headers)
        assert res_list.status_code == 200
        list_data = res_list.get_json()
        assert list_data["success"] is True
        assert all(s["customer_id"] == str(cust.id) for s in list_data["subscriptions"])

    def test_customer_data_isolation_between_customers(self, client, seeded_db, db_session):
        cust1 = seeded_db["customer1"]
        cust2 = seeded_db["customer2"]
        plan = seeded_db["plan_monthly"]

        # Create subscription for cust1
        sub1 = Subscription(
            id=uuid.uuid4(),
            subscription_number=f"SUB-ISO-{uuid.uuid4().hex[:6]}",
            customer_id=cust1.id,
            plan_id=plan.id,
            status="ACTIVE",
            recurring_total=Decimal("99.00")
        )
        db_session.add(sub1)
        db_session.commit()

        # Customer 2 should not see Customer 1's subscription in list
        token2 = generate_token(cust2)
        headers2 = {"Authorization": f"Bearer {token2}"}
        res = client.get("/api/subscriptions", headers=headers2)
        assert res.status_code == 200
        sub_ids = [s["id"] for s in res.get_json()["subscriptions"]]
        assert str(sub1.id) not in sub_ids

        # Customer 2 cannot access Customer 1's subscription directly
        res_direct = client.get(f"/api/subscriptions/{sub1.id}", headers=headers2)
        assert res_direct.status_code == 403

    def test_subscription_status_transitions(self, client, seeded_db, db_session):
        cust = seeded_db["customer1"]
        plan = seeded_db["plan_monthly"]
        token = generate_token(cust)
        headers = {"Authorization": f"Bearer {token}"}

        sub = Subscription(
            id=uuid.uuid4(),
            subscription_number=f"SUB-TRANS-{uuid.uuid4().hex[:6]}",
            customer_id=cust.id,
            plan_id=plan.id,
            status="CONFIRMED",
            recurring_total=Decimal("99.00")
        )
        db_session.add(sub)
        db_session.commit()

        # Activate
        res_act = client.post(f"/api/subscriptions/{sub.id}/status", json={"action": "ACTIVATE"}, headers=headers)
        assert res_act.status_code == 200
        assert res_act.get_json()["subscription"]["status"] == "ACTIVE"

        # Pause
        res_pause = client.post(f"/api/subscriptions/{sub.id}/status", json={"action": "PAUSE"}, headers=headers)
        assert res_pause.status_code == 200
        assert res_pause.get_json()["subscription"]["status"] == "PAUSED"

        # Resume
        res_res = client.post(f"/api/subscriptions/{sub.id}/status", json={"action": "RESUME"}, headers=headers)
        assert res_res.status_code == 200
        assert res_res.get_json()["subscription"]["status"] == "ACTIVE"

        # Close
        res_close = client.post(f"/api/subscriptions/{sub.id}/status", json={"action": "CLOSE", "closure_reason": "Testing close"}, headers=headers)
        assert res_close.status_code == 200
        assert res_close.get_json()["subscription"]["status"] == "CLOSED"

        # Cannot pause from CLOSED
        res_invalid = client.post(f"/api/subscriptions/{sub.id}/status", json={"action": "PAUSE"}, headers=headers)
        assert res_invalid.status_code == 400


class TestInvoiceAndBillingWorkflowAPIs:
    def test_run_billing_cycle_endpoint_permissions_and_execution(self, client, seeded_db, db_session):
        admin = seeded_db["admin"]
        staff = seeded_db["staff"]
        cust = seeded_db["customer1"]
        plan = seeded_db["plan_monthly"]

        # Active subscription due for billing
        sub = Subscription(
            id=uuid.uuid4(),
            subscription_number=f"SUB-BILL-{uuid.uuid4().hex[:6]}",
            customer_id=cust.id,
            plan_id=plan.id,
            status="ACTIVE",
            recurring_total=Decimal("99.00"),
            next_billing_date=datetime.now(timezone.utc) - timedelta(days=1)
        )
        db_session.add(sub)
        db_session.commit()

        # Customer forbidden from running billing
        cust_token = generate_token(cust)
        res_cust = client.post("/api/invoices/run-billing", headers={"Authorization": f"Bearer {cust_cust}" if (cust_cust := cust_token) else None})
        assert res_cust.status_code == 403

        # Staff can run billing
        staff_token = generate_token(staff)
        res_staff = client.post("/api/invoices/run-billing", headers={"Authorization": f"Bearer {staff_token}"})
        assert res_staff.status_code == 200
        data = res_staff.get_json()
        assert data["success"] is True
        assert data["result"]["invoices_generated"] >= 1

        # Running again does not create duplicate invoices
        res_repeat = client.post("/api/invoices/run-billing", headers={"Authorization": f"Bearer {staff_token}"})
        assert res_repeat.status_code == 200
        assert res_repeat.get_json()["result"]["invoices_generated"] == 0

    def test_customer_invoice_scoping(self, client, seeded_db, db_session):
        cust1 = seeded_db["customer1"]
        cust2 = seeded_db["customer2"]
        plan = seeded_db["plan_monthly"]

        sub = Subscription(
            id=uuid.uuid4(),
            subscription_number=f"SUB-INV-{uuid.uuid4().hex[:6]}",
            customer_id=cust1.id,
            plan_id=plan.id,
            status="ACTIVE",
            recurring_total=Decimal("99.00")
        )
        inv = Invoice(
            id=uuid.uuid4(),
            invoice_number=f"INV-SCOPE-{uuid.uuid4().hex[:6]}",
            subscription_id=sub.id,
            customer_id=cust1.id,
            status="CONFIRMED",
            billing_period_start=date.today(),
            billing_period_end=date.today() + timedelta(days=30),
            invoice_date=date.today(),
            due_date=date.today() + timedelta(days=14),
            total_amount=Decimal("99.00"),
            amount_paid=Decimal("0.00"),
            balance_due=Decimal("99.00")
        )
        db_session.add_all([sub, inv])
        db_session.commit()

        # Customer 2 cannot access Customer 1's invoice
        token2 = generate_token(cust2)
        res = client.get(f"/api/invoices/{inv.id}", headers={"Authorization": f"Bearer {token2}"})
        assert res.status_code == 403

        # Customer 1 can access it
        token1 = generate_token(cust1)
        res_ok = client.get(f"/api/invoices/{inv.id}", headers={"Authorization": f"Bearer {token1}"})
        assert res_ok.status_code == 200
        assert res_ok.get_json()["invoice"]["invoice_number"] == inv.invoice_number


class TestPaymentWorkflowAPIs:
    def test_offline_payment_pending_verification_then_staff_verify(self, client, seeded_db, db_session):
        cust = seeded_db["customer1"]
        staff = seeded_db["staff"]
        plan = seeded_db["plan_monthly"]

        sub = Subscription(
            id=uuid.uuid4(),
            subscription_number=f"SUB-PAY-{uuid.uuid4().hex[:6]}",
            customer_id=cust.id,
            plan_id=plan.id,
            status="ACTIVE",
            recurring_total=Decimal("100.00")
        )
        inv = Invoice(
            id=uuid.uuid4(),
            invoice_number=f"INV-PAY-{uuid.uuid4().hex[:6]}",
            subscription_id=sub.id,
            customer_id=cust.id,
            status="CONFIRMED",
            billing_period_start=date.today(),
            billing_period_end=date.today() + timedelta(days=30),
            invoice_date=date.today(),
            due_date=date.today() + timedelta(days=14),
            total_amount=Decimal("100.00"),
            amount_paid=Decimal("0.00"),
            balance_due=Decimal("100.00")
        )
        db_session.add_all([sub, inv])
        db_session.commit()

        # Customer submits bank transfer payment
        cust_token = generate_token(cust)
        cust_headers = {"Authorization": f"Bearer {cust_token}"}
        pay_payload = {
            "invoice_id": str(inv.id),
            "amount": 60.00,
            "payment_method": "BANK_TRANSFER",
            "notes": "Bank transfer slip uploaded"
        }
        res_pay = client.post("/api/payments", json=pay_payload, headers=cust_headers)
        assert res_pay.status_code == 201
        pay_data = res_pay.get_json()["payment"]
        # Must be PENDING_VERIFICATION because submitted by customer
        assert pay_data["payment_status"] == "PENDING_VERIFICATION"
        payment_id = pay_data["id"]

        # Invoice balance is NOT yet reduced because payment is pending verification
        db_session.refresh(inv)
        assert inv.balance_due == Decimal("100.00")

        # Customer cannot self-verify
        res_self_ver = client.post(f"/api/payments/{payment_id}/verify", headers=cust_headers)
        assert res_self_ver.status_code == 403

        # Staff verifies payment
        staff_token = generate_token(staff)
        res_ver = client.post(f"/api/payments/{payment_id}/verify", headers={"Authorization": f"Bearer {staff_token}"})
        assert res_ver.status_code == 200
        assert res_ver.get_json()["payment"]["payment_status"] == "CONFIRMED"

        # Now invoice balance is updated
        db_session.refresh(inv)
        assert inv.amount_paid == Decimal("60.00")
        assert inv.balance_due == Decimal("40.00")
        assert inv.status == "PARTIALLY_PAID"

    def test_online_simulated_payment_auto_confirms(self, client, seeded_db, db_session):
        cust = seeded_db["customer1"]
        plan = seeded_db["plan_monthly"]

        sub = Subscription(
            id=uuid.uuid4(),
            subscription_number=f"SUB-SIM-{uuid.uuid4().hex[:6]}",
            customer_id=cust.id,
            plan_id=plan.id,
            status="ACTIVE",
            recurring_total=Decimal("50.00")
        )
        inv = Invoice(
            id=uuid.uuid4(),
            invoice_number=f"INV-SIM-{uuid.uuid4().hex[:6]}",
            subscription_id=sub.id,
            customer_id=cust.id,
            status="CONFIRMED",
            billing_period_start=date.today(),
            billing_period_end=date.today() + timedelta(days=30),
            invoice_date=date.today(),
            due_date=date.today() + timedelta(days=14),
            total_amount=Decimal("50.00"),
            amount_paid=Decimal("0.00"),
            balance_due=Decimal("50.00")
        )
        db_session.add_all([sub, inv])
        db_session.commit()

        token = generate_token(cust)
        res = client.post(
            "/api/payments",
            json={
                "invoice_id": str(inv.id),
                "amount": 50.00,
                "payment_method": "ONLINE_MOCK_SIMULATED"
            },
            headers={"Authorization": f"Bearer {token}"}
        )
        assert res.status_code == 201
        assert res.get_json()["payment"]["payment_status"] == "CONFIRMED"

        db_session.refresh(inv)
        assert inv.balance_due == Decimal("0.00")
        assert inv.status == "PAID"

    def test_overpayment_rejected(self, client, seeded_db, db_session):
        cust = seeded_db["customer1"]
        plan = seeded_db["plan_monthly"]

        sub = Subscription(
            id=uuid.uuid4(),
            subscription_number=f"SUB-OVER-{uuid.uuid4().hex[:6]}",
            customer_id=cust.id,
            plan_id=plan.id,
            status="ACTIVE",
            recurring_total=Decimal("50.00")
        )
        inv = Invoice(
            id=uuid.uuid4(),
            invoice_number=f"INV-OVER-{uuid.uuid4().hex[:6]}",
            subscription_id=sub.id,
            customer_id=cust.id,
            status="CONFIRMED",
            billing_period_start=date.today(),
            billing_period_end=date.today() + timedelta(days=30),
            invoice_date=date.today(),
            due_date=date.today() + timedelta(days=14),
            total_amount=Decimal("50.00"),
            amount_paid=Decimal("0.00"),
            balance_due=Decimal("50.00")
        )
        db_session.add_all([sub, inv])
        db_session.commit()

        token = generate_token(cust)
        res = client.post(
            "/api/payments",
            json={
                "invoice_id": str(inv.id),
                "amount": 100.00,
                "payment_method": "ONLINE_MOCK_SIMULATED"
            },
            headers={"Authorization": f"Bearer {token}"}
        )
        assert res.status_code == 400
        assert res.get_json()["code"] == "AMOUNT_EXCEEDS_BALANCE"


class TestDashboardStatsAPI:
    def test_dashboard_stats_endpoint(self, client, seeded_db, db_session):
        admin = seeded_db["admin"]
        cust = seeded_db["customer1"]
        plan = seeded_db["plan_monthly"]

        sub = Subscription(
            id=uuid.uuid4(),
            subscription_number=f"SUB-DASH-{uuid.uuid4().hex[:6]}",
            customer_id=cust.id,
            plan_id=plan.id,
            status="ACTIVE",
            recurring_total=Decimal("120.00")
        )
        inv = Invoice(
            id=uuid.uuid4(),
            invoice_number=f"INV-DASH-{uuid.uuid4().hex[:6]}",
            subscription_id=sub.id,
            customer_id=cust.id,
            status="CONFIRMED",
            billing_period_start=date.today(),
            billing_period_end=date.today() + timedelta(days=30),
            invoice_date=date.today(),
            due_date=date.today() + timedelta(days=14),
            total_amount=Decimal("120.00"),
            amount_paid=Decimal("0.00"),
            balance_due=Decimal("120.00")
        )
        db_session.add_all([sub, inv])
        db_session.commit()

        admin_token = generate_token(admin)
        res = client.get("/api/dashboard/stats", headers={"Authorization": f"Bearer {admin_token}"})
        assert res.status_code == 200
        data = res.get_json()
        assert data["success"] is True
        assert data["active_subscriptions"] >= 1
        assert data["mrr"] >= 120.00
        assert data["arr"] >= 1440.00
        assert data["outstanding_amount"] >= 120.00
