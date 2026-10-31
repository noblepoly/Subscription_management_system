import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import pytest
from sqlalchemy.exc import IntegrityError

from app.models.invoice import Invoice, InvoiceItem
from app.models.subscription import Subscription, SubscriptionItem
from app.models.product import Product, ProductVariant
from app.models.plan import SubscriptionPlan
from app.services.billing_engine import (
    compute_next_billing_date,
    generate_invoice_for_period,
    run_recurring_billing_cycle
)

class TestBillingDateCalculations:
    def test_daily_and_weekly_intervals(self):
        start = date(2026, 3, 1)
        # Daily
        assert compute_next_billing_date(start, "DAILY", interval_count=1) == date(2026, 3, 2)
        assert compute_next_billing_date(start, "DAILY", interval_count=5) == date(2026, 3, 6)

        # Weekly
        assert compute_next_billing_date(start, "WEEKLY", interval_count=1) == date(2026, 3, 8)
        assert compute_next_billing_date(start, "WEEKLY", interval_count=2) == date(2026, 3, 15)

    def test_monthly_and_quarterly_intervals(self):
        start = date(2026, 1, 15)
        # Monthly (1 month)
        assert compute_next_billing_date(start, "MONTHLY", interval_count=1) == date(2026, 2, 15)
        # Quarterly (3 months)
        assert compute_next_billing_date(start, "MONTHLY", interval_count=3) == date(2026, 4, 15)
        # Semi-annual (6 months)
        assert compute_next_billing_date(start, "MONTHLY", interval_count=6) == date(2026, 7, 15)

    def test_month_end_date_clipping(self):
        """
        Month-end dates must clip safely to valid days:
        - Jan 31 -> Feb 28 (non-leap year 2026)
        - Mar 31 -> Apr 30
        - May 31 -> Jun 30
        - Aug 31 -> Sep 30
        - Oct 31 -> Nov 30
        """
        assert compute_next_billing_date(date(2026, 1, 31), "MONTHLY", 1) == date(2026, 2, 28)
        assert compute_next_billing_date(date(2026, 3, 31), "MONTHLY", 1) == date(2026, 4, 30)
        assert compute_next_billing_date(date(2026, 5, 31), "MONTHLY", 1) == date(2026, 6, 30)
        assert compute_next_billing_date(date(2026, 8, 31), "MONTHLY", 1) == date(2026, 9, 30)
        assert compute_next_billing_date(date(2026, 10, 31), "MONTHLY", 1) == date(2026, 11, 30)

    def test_yearly_intervals(self):
        start = date(2026, 4, 1)
        assert compute_next_billing_date(start, "YEARLY", interval_count=1) == date(2027, 4, 1)
        assert compute_next_billing_date(start, "YEARLY", interval_count=3) == date(2029, 4, 1)

class TestInvoiceGenerationAndDuplicatePrevention:
    @pytest.fixture
    def active_subscription(self, seeded_db, db_session):
        customer = seeded_db["customer1"]
        plan = seeded_db["plan_monthly"]
        prod = seeded_db["prod_software"]
        variant = seeded_db["var_pro"]
        tax = seeded_db["tax_gst"]
        discount = seeded_db["disc_fixed"]

        sub = Subscription(
            id=uuid.uuid4(),
            subscription_number=f"SUB-INV-{uuid.uuid4().hex[:6].upper()}",
            customer_id=customer.id,
            plan_id=plan.id,
            discount_id=discount.id,
            tax_rate_id=tax.id,
            status="ACTIVE",
            start_date=datetime.now(timezone.utc) - timedelta(days=30),
            next_billing_date=datetime.now(timezone.utc) - timedelta(days=1),
            subtotal=Decimal("120.00"),
            discount_amount=Decimal("30.00"),
            tax_amount=Decimal("16.20"),
            recurring_total=Decimal("106.20")
        )
        db_session.add(sub)
        db_session.flush()

        item = SubscriptionItem(
            id=uuid.uuid4(),
            subscription_id=sub.id,
            product_id=prod.id,
            variant_id=variant.id,
            quantity=1,
            unit_price=prod.sales_price, # 100.00
            additional_price=variant.additional_price, # 20.00
            line_total=Decimal("120.00")
        )
        db_session.add(item)
        db_session.commit()
        return sub

    def test_generate_invoice_for_period(self, active_subscription, db_session):
        start_date = date(2026, 2, 1)
        end_date = date(2026, 3, 1)

        invoice = generate_invoice_for_period(active_subscription, start_date, end_date, due_days=14)
        db_session.commit()

        assert invoice is not None
        assert invoice.subscription_id == active_subscription.id
        assert invoice.customer_id == active_subscription.customer_id
        assert invoice.billing_period_start == start_date
        assert invoice.billing_period_end == end_date
        assert invoice.due_date == start_date + timedelta(days=14)
        assert invoice.subtotal == active_subscription.subtotal
        assert invoice.discount_amount == active_subscription.discount_amount
        assert invoice.tax_amount == active_subscription.tax_amount
        assert invoice.total_amount == active_subscription.recurring_total
        assert invoice.balance_due == active_subscription.recurring_total
        assert invoice.amount_paid == Decimal("0.00")
        assert len(invoice.items) == 1

    def test_duplicate_invoice_prevention_via_engine(self, active_subscription, db_session):
        """Calling generate_invoice_for_period twice for the same period returns None."""
        start_date = date(2026, 3, 1)
        end_date = date(2026, 4, 1)

        inv1 = generate_invoice_for_period(active_subscription, start_date, end_date)
        db_session.commit()
        assert inv1 is not None

        # Second attempt for identical period must return None
        inv2 = generate_invoice_for_period(active_subscription, start_date, end_date)
        assert inv2 is None

    def test_duplicate_invoice_unique_constraint_enforced(self, active_subscription, db_session):
        """Database constraint uq_subscription_billing_period blocks direct duplicate insertion."""
        start_date = date(2026, 4, 1)
        end_date = date(2026, 5, 1)

        inv1 = Invoice(
            id=uuid.uuid4(),
            invoice_number=f"INV-UQ-1-{uuid.uuid4().hex[:4]}",
            subscription_id=active_subscription.id,
            customer_id=active_subscription.customer_id,
            billing_period_start=start_date,
            billing_period_end=end_date,
            due_date=start_date + timedelta(days=14),
            total_amount=Decimal("100.00"),
            balance_due=Decimal("100.00")
        )
        db_session.add(inv1)
        db_session.commit()

        inv2 = Invoice(
            id=uuid.uuid4(),
            invoice_number=f"INV-UQ-2-{uuid.uuid4().hex[:4]}",
            subscription_id=active_subscription.id,
            customer_id=active_subscription.customer_id,
            billing_period_start=start_date, # Duplicate period
            billing_period_end=end_date,
            due_date=start_date + timedelta(days=14),
            total_amount=Decimal("100.00"),
            balance_due=Decimal("100.00")
        )
        db_session.add(inv2)
        with pytest.raises(IntegrityError):
            db_session.commit()
        db_session.rollback()

    def test_historical_pricing_snapshots_are_immutable(self, active_subscription, seeded_db, db_session):
        """
        Refinement 1: InvoiceItem must store historical pricing snapshots.
        Modifying the Product sales price or ProductVariant additional price later
        must NEVER alter historical InvoiceItem records.
        """
        start_date = date(2026, 5, 1)
        end_date = date(2026, 6, 1)

        invoice = generate_invoice_for_period(active_subscription, start_date, end_date)
        db_session.commit()

        item_snapshot = invoice.items[0]
        original_unit_price = item_snapshot.applied_unit_price
        original_additional_price = item_snapshot.applied_additional_price
        original_line_total = item_snapshot.line_total

        # Mutate the parent Product and Variant prices
        prod = seeded_db["prod_software"]
        variant = seeded_db["var_pro"]
        prod.sales_price = Decimal("250.00") # Changed from 100.00 to 250.00
        variant.additional_price = Decimal("75.00") # Changed from 20.00 to 75.00
        db_session.commit()

        # Re-fetch invoice line item from database
        fetched_item = InvoiceItem.query.filter_by(id=item_snapshot.id).first()
        assert fetched_item.applied_unit_price == original_unit_price
        assert fetched_item.applied_additional_price == original_additional_price
        assert fetched_item.line_total == original_line_total
        assert fetched_item.applied_unit_price == Decimal("100.00")
        assert fetched_item.applied_additional_price == Decimal("20.00")

class TestRecurringBillingCycle:
    def test_recurring_billing_run_processes_due_subscriptions(self, seeded_db, db_session):
        customer = seeded_db["customer1"]
        plan = seeded_db["plan_monthly"]
        prod = seeded_db["prod_software"]

        due_date = datetime.now(timezone.utc) - timedelta(days=1)
        sub = Subscription(
            id=uuid.uuid4(),
            subscription_number=f"SUB-DUE-{uuid.uuid4().hex[:6].upper()}",
            customer_id=customer.id,
            plan_id=plan.id,
            status="ACTIVE",
            next_billing_date=due_date,
            subtotal=Decimal("100.00"),
            recurring_total=Decimal("100.00")
        )
        db_session.add(sub)
        db_session.flush()

        item = SubscriptionItem(
            id=uuid.uuid4(),
            subscription_id=sub.id,
            product_id=prod.id,
            quantity=1,
            unit_price=Decimal("100.00"),
            additional_price=Decimal("0.00"),
            line_total=Decimal("100.00")
        )
        db_session.add(item)
        db_session.commit()

        # Run recurring cycle for today
        results = run_recurring_billing_cycle(target_date=date.today())

        assert results["invoices_generated"] >= 1
        assert results["processed_subscriptions"] >= 1

        # Verify next billing date was advanced
        updated_sub = Subscription.query.filter_by(id=sub.id).first()
        assert updated_sub.last_billed_date is not None
        next_billing_dt = updated_sub.next_billing_date.replace(tzinfo=timezone.utc) if updated_sub.next_billing_date.tzinfo is None else updated_sub.next_billing_date
        assert next_billing_dt > due_date

    def test_recurring_billing_skips_paused_and_closed(self, seeded_db, db_session):
        customer = seeded_db["customer1"]
        plan = seeded_db["plan_monthly"]
        past_date = datetime.now(timezone.utc) - timedelta(days=5)

        # Paused subscription
        paused_sub = Subscription(
            id=uuid.uuid4(),
            subscription_number="SUB-SKIP-PAUSED",
            customer_id=customer.id,
            plan_id=plan.id,
            status="PAUSED",
            next_billing_date=past_date
        )
        # Closed subscription
        closed_sub = Subscription(
            id=uuid.uuid4(),
            subscription_number="SUB-SKIP-CLOSED",
            customer_id=customer.id,
            plan_id=plan.id,
            status="CLOSED",
            next_billing_date=past_date
        )
        db_session.add_all([paused_sub, closed_sub])
        db_session.commit()

        results = run_recurring_billing_cycle(target_date=date.today())
        # Neither paused nor closed should have generated an invoice
        invoices = Invoice.query.filter(
            Invoice.subscription_id.in_([paused_sub.id, closed_sub.id])
        ).all()
        assert len(invoices) == 0

    def test_expired_subscription_auto_close_on_cycle(self, seeded_db, db_session):
        customer = seeded_db["customer1"]
        plan = seeded_db["plan_yearly"] # auto_close = True
        yesterday = datetime.now(timezone.utc) - timedelta(days=1)

        sub = Subscription(
            id=uuid.uuid4(),
            subscription_number="SUB-EXPIRE-AUTOCLOSE",
            customer_id=customer.id,
            plan_id=plan.id,
            status="ACTIVE",
            expiry_date=yesterday,
            next_billing_date=yesterday
        )
        db_session.add(sub)
        db_session.commit()

        run_recurring_billing_cycle(target_date=date.today())

        closed_sub = Subscription.query.filter_by(id=sub.id).first()
        assert closed_sub.status == "CLOSED"
        assert "expiration" in closed_sub.closure_reason.lower()

class TestInvoiceStatusTransitions:
    def test_status_transitions_on_payment(self, seeded_db, db_session):
        customer = seeded_db["customer1"]
        sub = seeded_db["plan_monthly"]

        inv = Invoice(
            id=uuid.uuid4(),
            invoice_number=f"INV-STAT-{uuid.uuid4().hex[:4]}",
            subscription_id=uuid.uuid4(),
            customer_id=customer.id,
            status="CONFIRMED",
            billing_period_start=date.today(),
            billing_period_end=date.today() + timedelta(days=30),
            due_date=date.today() + timedelta(days=14),
            total_amount=Decimal("500.00"),
            amount_paid=Decimal("0.00"),
            balance_due=Decimal("500.00")
        )
        # 1. Unpaid before due date
        assert inv.get_effective_status() == "CONFIRMED"
        assert inv.is_overdue is False

        # 2. Partial payment before due date
        inv.amount_paid = Decimal("200.00")
        inv.balance_due = Decimal("300.00")
        assert inv.get_effective_status() == "PARTIALLY_PAID"
        assert inv.is_overdue is False

        # 3. Due date passes with outstanding balance -> OVERDUE
        inv.due_date = date.today() - timedelta(days=1)
        assert inv.is_overdue is True
        assert inv.get_effective_status() == "OVERDUE"

        # 4. Full payment clears balance -> PAID (even past due date)
        inv.amount_paid = Decimal("500.00")
        inv.balance_due = Decimal("0.00")
        assert inv.is_overdue is False
        assert inv.get_effective_status() == "PAID"

        # 5. Cancelled invoice remains CANCELLED
        inv.status = "CANCELLED"
        assert inv.get_effective_status() == "CANCELLED"
