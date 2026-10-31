import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import pytest

from app.models.tax_discount import TaxRate, Discount
from app.models.product import Product
from app.models.invoice import Invoice
from app.models.subscription import Subscription
from app.models.payment import Payment
from app.utils.financial import (
    quantize_money,
    calculate_mrr,
    calculate_arr,
    compute_line_item,
    compute_totals
)

class TestDiscountsAndTaxation:
    def test_fixed_discount_calculation(self):
        # Normal fixed discount
        items = [{"unit_price": Decimal("100.00"), "quantity": 2}]
        class MockFixedDiscount:
            is_active = True
            discount_type = "FIXED"
            discount_value = Decimal("30.00")
            
        subtotal, disc_amt, taxable, tax, total = compute_totals(items, MockFixedDiscount, None)
        assert subtotal == Decimal("200.00")
        assert disc_amt == Decimal("30.00")
        assert taxable == Decimal("170.00")
        assert total == Decimal("170.00")

    def test_fixed_discount_capped_at_subtotal(self):
        """Fixed discount cannot exceed subtotal (taxable base cannot be negative)."""
        items = [{"unit_price": Decimal("25.00"), "quantity": 1}]
        class MockExcessiveDiscount:
            is_active = True
            discount_type = "FIXED"
            discount_value = Decimal("50.00") # Discount ($50) exceeds subtotal ($25)
            
        subtotal, disc_amt, taxable, tax, total = compute_totals(items, MockExcessiveDiscount, None)
        assert subtotal == Decimal("25.00")
        assert disc_amt == Decimal("25.00") # Capped at subtotal
        assert taxable == Decimal("0.00")
        assert total == Decimal("0.00")

    def test_percentage_discount_calculation(self):
        items = [
            {"unit_price": Decimal("75.00"), "quantity": 2}, # 150.00
            {"unit_price": Decimal("50.00"), "quantity": 1}  #  50.00
        ]
        class MockPercentDiscount:
            is_active = True
            discount_type = "PERCENTAGE"
            discount_value = Decimal("15.00") # 15% off 200.00 = 30.00
            
        subtotal, disc_amt, taxable, tax, total = compute_totals(items, MockPercentDiscount, None)
        assert subtotal == Decimal("200.00")
        assert disc_amt == Decimal("30.00")
        assert taxable == Decimal("170.00")

    def test_tax_calculation_applied_to_discounted_base(self):
        """Taxes must apply to the net taxable base (subtotal - discount)."""
        items = [{"unit_price": Decimal("100.00"), "quantity": 1}]
        class MockDiscount:
            is_active = True
            discount_type = "PERCENTAGE"
            discount_value = Decimal("20.00") # $20 discount, taxable = $80

        class MockGSTTax:
            is_active = True
            rate_percentage = Decimal("18.000") # 18% GST on $80 = $14.40

        subtotal, disc_amt, taxable, tax, total = compute_totals(items, MockDiscount, MockGSTTax)
        assert subtotal == Decimal("100.00")
        assert disc_amt == Decimal("20.00")
        assert taxable == Decimal("80.00")
        assert tax == Decimal("14.40")
        assert total == Decimal("94.40")

    def test_discount_eligibility_criteria(self, db_session):
        today = date.today()
        prod_a = Product(id=uuid.uuid4(), name="Design Tool", sales_price=Decimal("100.00"))
        prod_b = Product(id=uuid.uuid4(), name="Analytics Tool", sales_price=Decimal("150.00"))
        db_session.add_all([prod_a, prod_b])
        db_session.flush()

        # Product-scoped discount
        scoped_disc = Discount(
            id=uuid.uuid4(),
            code="DESIGNOFF",
            discount_type="PERCENTAGE",
            discount_value=Decimal("10.00"),
            scope="PRODUCT",
            min_purchase_amount=Decimal("50.00"),
            min_quantity=2,
            start_date=today - timedelta(days=5),
            end_date=today + timedelta(days=30),
            usage_limit=10,
            times_used=0
        )
        scoped_disc.applicable_products.append(prod_a)
        db_session.add(scoped_disc)
        db_session.commit()

        # 1. Eligible scenario: meets minimum amount, quantity, and product match
        ok, msg = scoped_disc.is_eligible(
            subtotal=Decimal("200.00"),
            total_quantity=2,
            target_date=today,
            product_ids=[str(prod_a.id)]
        )
        assert ok is True

        # 2. Minimum amount not met
        ok, msg = scoped_disc.is_eligible(
            subtotal=Decimal("40.00"),
            total_quantity=2,
            target_date=today,
            product_ids=[str(prod_a.id)]
        )
        assert ok is False
        assert "minimum purchase" in msg.lower()

        # 3. Minimum quantity not met
        ok, msg = scoped_disc.is_eligible(
            subtotal=Decimal("100.00"),
            total_quantity=1,
            target_date=today,
            product_ids=[str(prod_a.id)]
        )
        assert ok is False
        assert "minimum quantity" in msg.lower()

        # 4. Wrong product in cart (Product B instead of Product A)
        ok, msg = scoped_disc.is_eligible(
            subtotal=Decimal("300.00"),
            total_quantity=2,
            target_date=today,
            product_ids=[str(prod_b.id)]
        )
        assert ok is False
        assert "selected products" in msg.lower()

        # 5. Usage limit reached
        scoped_disc.times_used = 10
        ok, msg = scoped_disc.is_eligible(
            subtotal=Decimal("200.00"),
            total_quantity=2,
            target_date=today,
            product_ids=[str(prod_a.id)]
        )
        assert ok is False
        assert "usage limit" in msg.lower()

class TestPaymentsAndLedgerReconciliation:
    @pytest.fixture
    def test_invoice(self, seeded_db, db_session):
        customer = seeded_db["customer1"]
        plan = seeded_db["plan_monthly"]

        sub = Subscription(
            id=uuid.uuid4(),
            subscription_number=f"SUB-PAY-{uuid.uuid4().hex[:6].upper()}",
            customer_id=customer.id,
            plan_id=plan.id,
            status="ACTIVE",
            subtotal=Decimal("1000.00"),
            recurring_total=Decimal("1000.00")
        )
        db_session.add(sub)
        db_session.flush()

        inv = Invoice(
            id=uuid.uuid4(),
            invoice_number=f"INV-PAY-{uuid.uuid4().hex[:6].upper()}",
            subscription_id=sub.id,
            customer_id=customer.id,
            status="CONFIRMED",
            billing_period_start=date.today(),
            billing_period_end=date.today() + timedelta(days=30),
            due_date=date.today() + timedelta(days=14),
            total_amount=Decimal("1000.00"),
            amount_paid=Decimal("0.00"),
            balance_due=Decimal("1000.00")
        )
        db_session.add(inv)
        db_session.commit()
        return inv

    def test_single_full_payment(self, test_invoice, seeded_db, db_session):
        staff = seeded_db["staff"]
        payment = Payment(
            id=uuid.uuid4(),
            payment_number=f"PAY-{uuid.uuid4().hex[:6].upper()}",
            invoice_id=test_invoice.id,
            customer_id=test_invoice.customer_id,
            recorded_by=staff.id,
            amount=Decimal("1000.00"),
            payment_method="BANK_TRANSFER",
            payment_status="CONFIRMED",
            transaction_reference="NEFT-TXN-987654"
        )
        db_session.add(payment)
        
        # Apply payment to invoice
        test_invoice.amount_paid += payment.amount
        test_invoice.balance_due -= payment.amount
        db_session.commit()

        assert test_invoice.amount_paid == Decimal("1000.00")
        assert test_invoice.balance_due == Decimal("0.00")
        assert test_invoice.get_effective_status() == "PAID"

    def test_multiple_partial_payments(self, test_invoice, seeded_db, db_session):
        staff = seeded_db["staff"]

        # First partial payment: $400
        pay1 = Payment(
            id=uuid.uuid4(),
            payment_number="PAY-PART-1",
            invoice_id=test_invoice.id,
            customer_id=test_invoice.customer_id,
            recorded_by=staff.id,
            amount=Decimal("400.00"),
            payment_method="CHEQUE",
            payment_status="CONFIRMED"
        )
        test_invoice.amount_paid += pay1.amount
        test_invoice.balance_due -= pay1.amount
        db_session.add(pay1)
        db_session.commit()

        assert test_invoice.amount_paid == Decimal("400.00")
        assert test_invoice.balance_due == Decimal("600.00")
        assert test_invoice.get_effective_status() == "PARTIALLY_PAID"

        # Second partial payment: $350
        pay2 = Payment(
            id=uuid.uuid4(),
            payment_number="PAY-PART-2",
            invoice_id=test_invoice.id,
            customer_id=test_invoice.customer_id,
            recorded_by=staff.id,
            amount=Decimal("350.00"),
            payment_method="CASH",
            payment_status="CONFIRMED"
        )
        test_invoice.amount_paid += pay2.amount
        test_invoice.balance_due -= pay2.amount
        db_session.add(pay2)
        db_session.commit()

        assert test_invoice.amount_paid == Decimal("750.00")
        assert test_invoice.balance_due == Decimal("250.00")
        assert test_invoice.get_effective_status() == "PARTIALLY_PAID"

        # Final payment: $250
        pay3 = Payment(
            id=uuid.uuid4(),
            payment_number="PAY-PART-3",
            invoice_id=test_invoice.id,
            customer_id=test_invoice.customer_id,
            recorded_by=staff.id,
            amount=Decimal("250.00"),
            payment_method="BANK_TRANSFER",
            payment_status="CONFIRMED"
        )
        test_invoice.amount_paid += pay3.amount
        test_invoice.balance_due -= pay3.amount
        db_session.add(pay3)
        db_session.commit()

        assert test_invoice.amount_paid == Decimal("1000.00")
        assert test_invoice.balance_due == Decimal("0.00")
        assert test_invoice.get_effective_status() == "PAID"
        assert len(test_invoice.payments) == 3

    def test_offline_payment_pending_verification(self, test_invoice, db_session):
        """Staff/Admin must verify offline payments; unverified payments are PENDING_VERIFICATION."""
        payment = Payment(
            id=uuid.uuid4(),
            payment_number="PAY-PENDING-1",
            invoice_id=test_invoice.id,
            customer_id=test_invoice.customer_id,
            recorded_by=None,
            amount=Decimal("500.00"),
            payment_method="CHEQUE",
            payment_status="PENDING_VERIFICATION",
            notes="Cheque deposited, pending clearance"
        )
        db_session.add(payment)
        db_session.commit()

        fetched_pay = Payment.query.filter_by(id=payment.id).first()
        assert fetched_pay.payment_status == "PENDING_VERIFICATION"

    def test_simulated_online_payment_labeling(self, test_invoice, db_session):
        """Simulated online mock payments must be clearly identified."""
        payment = Payment(
            id=uuid.uuid4(),
            payment_number="PAY-SIM-1",
            invoice_id=test_invoice.id,
            customer_id=test_invoice.customer_id,
            amount=Decimal("1000.00"),
            payment_method="ONLINE_MOCK_SIMULATED",
            payment_status="CONFIRMED",
            transaction_reference="SIM-GATEWAY-AUTH-SUCCESS",
            notes="Mock online simulated checkout"
        )
        db_session.add(payment)
        db_session.commit()

        data = payment.to_dict()
        assert data["payment_method"] == "ONLINE_MOCK_SIMULATED"
        assert "simulation" in data["recorder_name"].lower()

class TestMRRAndARRFormulas:
    def test_mrr_calculation_all_intervals(self):
        # Monthly standard
        assert calculate_mrr(Decimal("150.00"), "MONTHLY", 1) == Decimal("150.00")

        # Quarterly growth (3 months)
        assert calculate_mrr(Decimal("3000.00"), "MONTHLY", 3) == Decimal("1000.00")

        # Semi-annual (6 months)
        assert calculate_mrr(Decimal("6000.00"), "MONTHLY", 6) == Decimal("1000.00")

        # Yearly standard
        assert calculate_mrr(Decimal("12000.00"), "YEARLY", 1) == Decimal("1000.00")

        # Daily plan (e.g. ₹100/day * 30 days = ₹3000 MRR)
        assert calculate_mrr(Decimal("100.00"), "DAILY", 1) == Decimal("3000.00")

        # Weekly plan (e.g. ₹700/week * 52 / 12 = ₹3033.33 MRR)
        assert calculate_mrr(Decimal("700.00"), "WEEKLY", 1) == Decimal("3033.33")

    def test_arr_derived_from_mrr(self):
        mrr = calculate_mrr(Decimal("1000.00"), "MONTHLY", 1)
        arr = calculate_arr(mrr)
        assert arr == Decimal("12000.00")
