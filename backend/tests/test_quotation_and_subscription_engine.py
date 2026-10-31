import uuid
from decimal import Decimal
from datetime import date, datetime, timedelta, timezone
import pytest
from sqlalchemy.exc import IntegrityError

from app.models.quotation import QuotationTemplate, QuotationTemplateItem
from app.models.subscription import Subscription, SubscriptionItem
from app.models.invoice import Invoice, InvoiceItem
from app.models.payment import Payment
from app.models.plan import SubscriptionPlan
from app.models.product import Product, ProductVariant
from app.models.tax_discount import TaxRate, Discount
from app.services.billing_engine import (
    compute_next_billing_date,
    generate_invoice_for_period,
    run_recurring_billing_cycle
)
from app.utils.financial import quantize_money, compute_totals

class TestQuotationCalculationsAndConversion:
    def test_quotation_multi_item_calculation(self, seeded_db, db_session):
        """
        Verify multi-item quotation calculation with base prices,
        variant additional prices, quantity multipliers, and tax rates.
        """
        admin = seeded_db["admin"]
        plan = seeded_db["plan_monthly"] # $100 base
        prod1 = seeded_db["prod_software"] # $100 base
        var1 = seeded_db["var_pro"] # +$20
        prod2 = seeded_db["prod_addon"] # $50 base
        tax = seeded_db["tax_gst"] # 18%

        tmpl = QuotationTemplate(
            id=uuid.uuid4(),
            name="Enterprise Custom Quote",
            plan_id=plan.id,
            default_validity_days=30,
            created_by=admin.id
        )
        db_session.add(tmpl)
        db_session.flush()

        # Item 1: 2x (100 + 20) = $240
        item1 = QuotationTemplateItem(
            id=uuid.uuid4(),
            template_id=tmpl.id,
            product_id=prod1.id,
            variant_id=var1.id,
            quantity=2
        )
        # Item 2: 1x $40 (overridden from $50)
        item2 = QuotationTemplateItem(
            id=uuid.uuid4(),
            template_id=tmpl.id,
            product_id=prod2.id,
            quantity=1,
            override_unit_price=Decimal("40.00")
        )
        db_session.add_all([item1, item2])
        db_session.commit()

        # Compute line totals
        calc_items = [
            {"unit_price": prod1.sales_price, "additional_price": var1.additional_price, "quantity": item1.quantity},
            {"unit_price": Decimal("40.00"), "additional_price": Decimal("0.00"), "quantity": item2.quantity}
        ]
        subtotal, disc_amt, taxable, tax_amt, total = compute_totals(calc_items, None, tax)

        assert subtotal == Decimal("280.00")
        assert disc_amt == Decimal("0.00")
        assert taxable == Decimal("280.00")
        assert tax_amt == Decimal("50.40") # 18% of 280
        assert total == Decimal("330.40")

    def test_convert_quotation_to_active_subscription_with_snapshots(self, seeded_db, db_session):
        customer = seeded_db["customer1"]
        admin = seeded_db["admin"]
        tmpl = seeded_db["quotation_tmpl"]
        tax = seeded_db["tax_gst"]

        # Instantiate Subscription from quotation template
        sub = Subscription(
            id=uuid.uuid4(),
            subscription_number=f"SUB-QUOTE-CONV-{uuid.uuid4().hex[:6].upper()}",
            customer_id=customer.id,
            plan_id=tmpl.plan_id,
            template_id=tmpl.id,
            tax_rate_id=tax.id,
            status="CONFIRMED",
            start_date=datetime.now(timezone.utc),
            next_billing_date=datetime.now(timezone.utc)
        )
        db_session.add(sub)
        db_session.flush()

        subtotal = Decimal("0.00")
        for q_item in tmpl.items:
            u_price = q_item.override_unit_price if q_item.override_unit_price is not None else q_item.product.sales_price
            add_price = q_item.variant.additional_price if q_item.variant else Decimal("0.00")
            line_tot = (u_price + add_price) * Decimal(str(q_item.quantity))
            subtotal += line_tot

            s_item = SubscriptionItem(
                id=uuid.uuid4(),
                subscription_id=sub.id,
                product_id=q_item.product_id,
                variant_id=q_item.variant_id,
                quantity=q_item.quantity,
                unit_price=u_price,
                additional_price=add_price,
                line_total=line_tot
            )
            db_session.add(s_item)

        tax_amt = quantize_money((subtotal * Decimal(str(tax.rate_percentage))) / Decimal("100.0"))
        sub.subtotal = subtotal
        sub.tax_amount = tax_amt
        sub.recurring_total = subtotal + tax_amt
        sub.status = "ACTIVE"
        db_session.commit()

        # Verify converted active subscription
        active_sub = Subscription.query.filter_by(id=sub.id).first()
        assert active_sub.status == "ACTIVE"
        assert active_sub.subtotal > Decimal("0.00")
        assert active_sub.recurring_total == active_sub.subtotal + active_sub.tax_amount
        assert len(active_sub.items) == len(tmpl.items)

class TestSubscriptionLifecycleEdgeCases:
    def test_cannot_transition_from_closed_terminal_state(self, seeded_db, db_session):
        customer = seeded_db["customer1"]
        plan = seeded_db["plan_monthly"]

        sub = Subscription(
            id=uuid.uuid4(),
            subscription_number="SUB-TERMINAL-CLOSED",
            customer_id=customer.id,
            plan_id=plan.id,
            status="CLOSED",
            closed_at=datetime.now(timezone.utc),
            closure_reason="Customer voluntary termination"
        )
        db_session.add(sub)
        db_session.commit()

        # Terminal state: CLOSED cannot transition to any state
        assert sub.can_transition_to("ACTIVE") is False
        assert sub.can_transition_to("PAUSED") is False
        assert sub.can_transition_to("DRAFT") is False
        assert sub.can_transition_to("QUOTATION") is False
        assert sub.can_transition_to("CONFIRMED") is False

    def test_pause_and_resume_preserves_billing_schedule(self, seeded_db, db_session):
        customer = seeded_db["customer1"]
        plan = seeded_db["plan_monthly"]
        target_billing_date = datetime.now(timezone.utc) + timedelta(days=20)

        sub = Subscription(
            id=uuid.uuid4(),
            subscription_number="SUB-PAUSE-RESUME",
            customer_id=customer.id,
            plan_id=plan.id,
            status="ACTIVE",
            start_date=datetime.now(timezone.utc),
            next_billing_date=target_billing_date
        )
        db_session.add(sub)
        db_session.commit()

        # Pause
        sub.status = "PAUSED"
        sub.paused_at = datetime.now(timezone.utc)
        db_session.commit()

        # Resume
        sub.status = "ACTIVE"
        sub.paused_at = None
        db_session.commit()

        resumed = Subscription.query.filter_by(id=sub.id).first()
        assert resumed.status == "ACTIVE"
        assert resumed.paused_at is None
        # Billing schedule retained
        diff = abs((resumed.next_billing_date.replace(tzinfo=timezone.utc) - target_billing_date).total_seconds())
        assert diff < 5

class TestRecurringBillingAndDuplicatePrevention:
    def test_recurring_cycle_prevents_duplicate_invoices(self, seeded_db, db_session):
        customer = seeded_db["customer1"]
        plan = seeded_db["plan_monthly"]
        prod = seeded_db["prod_software"]

        due_date = datetime.now(timezone.utc) - timedelta(days=2)
        sub = Subscription(
            id=uuid.uuid4(),
            subscription_number="SUB-DUP-CYCLE-1",
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

        # Run cycle once
        run1 = run_recurring_billing_cycle(target_date=date.today())
        assert run1["invoices_generated"] >= 1

        # Run cycle immediately again on same target date
        run2 = run_recurring_billing_cycle(target_date=date.today())
        # The subscription's next_billing_date has advanced, so 0 duplicate invoices generated
        assert run2["invoices_generated"] == 0

    def test_concurrency_safe_unique_constraint(self, seeded_db, db_session):
        customer = seeded_db["customer1"]
        plan = seeded_db["plan_monthly"]

        sub = Subscription(
            id=uuid.uuid4(),
            subscription_number="SUB-CONCUR-LOCK",
            customer_id=customer.id,
            plan_id=plan.id,
            status="ACTIVE"
        )
        db_session.add(sub)
        db_session.flush()

        p_start = date(2026, 6, 1)
        p_end = date(2026, 7, 1)

        inv1 = Invoice(
            id=uuid.uuid4(),
            invoice_number="INV-C-1",
            subscription_id=sub.id,
            customer_id=customer.id,
            billing_period_start=p_start,
            billing_period_end=p_end,
            due_date=p_start + timedelta(days=14),
            total_amount=Decimal("100.00"),
            balance_due=Decimal("100.00")
        )
        db_session.add(inv1)
        db_session.commit()

        # Concurrent attempt with identical period
        inv2 = Invoice(
            id=uuid.uuid4(),
            invoice_number="INV-C-2",
            subscription_id=sub.id,
            customer_id=customer.id,
            billing_period_start=p_start,
            billing_period_end=p_end,
            due_date=p_start + timedelta(days=14),
            total_amount=Decimal("100.00"),
            balance_due=Decimal("100.00")
        )
        db_session.add(inv2)
        with pytest.raises(IntegrityError):
            db_session.commit()
        db_session.rollback()

class TestPaymentVerificationWorkflows:
    def test_offline_payment_verification_by_staff(self, seeded_db, db_session):
        customer = seeded_db["customer1"]
        staff = seeded_db["staff"]
        plan = seeded_db["plan_monthly"]

        sub = Subscription(
            id=uuid.uuid4(),
            subscription_number="SUB-PAY-VERIFY",
            customer_id=customer.id,
            plan_id=plan.id,
            status="ACTIVE"
        )
        db_session.add(sub)
        db_session.flush()

        inv = Invoice(
            id=uuid.uuid4(),
            invoice_number="INV-VERIFY-1",
            subscription_id=sub.id,
            customer_id=customer.id,
            status="CONFIRMED",
            billing_period_start=date.today(),
            billing_period_end=date.today() + timedelta(days=30),
            due_date=date.today() + timedelta(days=14),
            total_amount=Decimal("800.00"),
            amount_paid=Decimal("0.00"),
            balance_due=Decimal("800.00")
        )
        db_session.add(inv)
        db_session.commit()

        # Step 1: Customer submits offline cheque -> PENDING_VERIFICATION
        payment = Payment(
            id=uuid.uuid4(),
            payment_number="PAY-OFFLINE-CHK",
            invoice_id=inv.id,
            customer_id=customer.id,
            recorded_by=None,
            amount=Decimal("800.00"),
            payment_method="CHEQUE",
            payment_status="PENDING_VERIFICATION",
            transaction_reference="CHK-459812",
            notes="Cheque submitted at bank counter"
        )
        db_session.add(payment)
        db_session.commit()

        # Invoice remains unpaid while payment is pending verification
        assert inv.amount_paid == Decimal("0.00")
        assert inv.balance_due == Decimal("800.00")
        assert inv.get_effective_status() == "CONFIRMED"

        # Step 2: Staff verifies payment -> CONFIRMED
        payment.payment_status = "CONFIRMED"
        payment.recorded_by = staff.id
        inv.amount_paid += payment.amount
        inv.balance_due -= payment.amount
        db_session.commit()

        # Invoice is now fully PAID
        assert inv.amount_paid == Decimal("800.00")
        assert inv.balance_due == Decimal("0.00")
        assert inv.get_effective_status() == "PAID"
        assert payment.recorded_by == staff.id
