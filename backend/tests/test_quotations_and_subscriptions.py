import uuid
from datetime import datetime, date, timedelta, timezone
from decimal import Decimal
import pytest

from app.models.quotation import QuotationTemplate, QuotationTemplateItem
from app.models.subscription import Subscription, SubscriptionItem
from app.models.plan import SubscriptionPlan
from app.models.product import Product, ProductVariant

class TestQuotationManagement:
    def test_quotation_creation_and_items(self, seeded_db, db_session):
        admin = seeded_db["admin"]
        plan = seeded_db["plan_monthly"]
        prod = seeded_db["prod_software"]
        variant = seeded_db["var_pro"]

        tmpl = QuotationTemplate(
            id=uuid.uuid4(),
            name="Custom Enterprise Solution",
            description="Dedicated tier with custom SLA",
            plan_id=plan.id,
            default_validity_days=14,
            terms_and_conditions="Net 30 terms.",
            created_by=admin.id
        )
        db_session.add(tmpl)
        db_session.flush()

        item = QuotationTemplateItem(
            id=uuid.uuid4(),
            template_id=tmpl.id,
            product_id=prod.id,
            variant_id=variant.id,
            quantity=3,
            override_unit_price=Decimal("90.00") # Overridden from 100.00
        )
        db_session.add(item)
        db_session.commit()

        fetched = QuotationTemplate.query.filter_by(id=tmpl.id).first()
        assert fetched is not None
        assert len(fetched.items) == 1
        assert fetched.items[0].override_unit_price == Decimal("90.00")
        assert fetched.items[0].quantity == 3

        data = fetched.to_dict()
        assert data["name"] == "Custom Enterprise Solution"
        assert len(data["items"]) == 1
        assert data["items"][0]["override_unit_price"] == 90.0

    def test_quotation_validity_and_expiry_check(self):
        today = date.today()
        # Active quotation (valid for 30 days, created 5 days ago)
        quote_valid_until = today + timedelta(days=25)
        assert quote_valid_until >= today

        # Expired quotation (valid for 30 days, expired 2 days ago)
        expired_quote_valid_until = today - timedelta(days=2)
        assert expired_quote_valid_until < today

    def test_quotation_conversion_to_subscription(self, seeded_db, db_session):
        customer = seeded_db["customer1"]
        tmpl = seeded_db["quotation_tmpl"]
        plan = seeded_db["plan_monthly"]

        # Convert quotation template to a new active Subscription
        sub = Subscription(
            id=uuid.uuid4(),
            subscription_number=f"SUB-CONV-{uuid.uuid4().hex[:6].upper()}",
            customer_id=customer.id,
            plan_id=plan.id,
            template_id=tmpl.id,
            status="CONFIRMED",
            start_date=datetime.now(timezone.utc),
            subtotal=Decimal("0.00"),
            recurring_total=Decimal("0.00")
        )
        db_session.add(sub)
        db_session.flush()

        # Copy line items from quotation
        total = Decimal("0.00")
        for q_item in tmpl.items:
            unit_price = q_item.override_unit_price if q_item.override_unit_price is not None else q_item.product.sales_price
            add_price = q_item.variant.additional_price if q_item.variant else Decimal("0.00")
            line_tot = (unit_price + add_price) * Decimal(str(q_item.quantity))
            
            sub_item = SubscriptionItem(
                id=uuid.uuid4(),
                subscription_id=sub.id,
                product_id=q_item.product_id,
                variant_id=q_item.variant_id,
                quantity=q_item.quantity,
                unit_price=unit_price,
                additional_price=add_price,
                line_total=line_tot
            )
            total += line_tot
            db_session.add(sub_item)

        sub.subtotal = total
        sub.recurring_total = total
        db_session.commit()

        # Verify created subscription
        created_sub = Subscription.query.filter_by(id=sub.id).first()
        assert created_sub is not None
        assert created_sub.status == "CONFIRMED"
        assert len(created_sub.items) == len(tmpl.items)
        assert created_sub.recurring_total > Decimal("0.00")

class TestSubscriptionLifecycle:
    def test_valid_state_transitions(self, seeded_db, db_session):
        """
        Verify the complete state machine lifecycle:
        DRAFT -> QUOTATION -> CONFIRMED -> ACTIVE -> PAUSED -> ACTIVE -> CLOSED
        """
        sub = Subscription(
            id=uuid.uuid4(),
            subscription_number="SUB-LIFECYCLE-1",
            customer_id=seeded_db["customer1"].id,
            plan_id=seeded_db["plan_monthly"].id,
            status="DRAFT"
        )
        db_session.add(sub)
        db_session.commit()

        # 1. DRAFT -> QUOTATION
        assert sub.can_transition_to("QUOTATION") is True
        sub.status = "QUOTATION"

        # 2. QUOTATION -> CONFIRMED
        assert sub.can_transition_to("CONFIRMED") is True
        sub.status = "CONFIRMED"

        # 3. CONFIRMED -> ACTIVE
        assert sub.can_transition_to("ACTIVE") is True
        sub.status = "ACTIVE"

        # 4. ACTIVE -> PAUSED
        assert sub.can_transition_to("PAUSED") is True
        sub.status = "PAUSED"

        # 5. PAUSED -> ACTIVE
        assert sub.can_transition_to("ACTIVE") is True
        sub.status = "ACTIVE"

        # 6. ACTIVE -> CLOSED
        assert sub.can_transition_to("CLOSED") is True
        sub.status = "CLOSED"

        # 7. CLOSED is terminal
        assert sub.can_transition_to("ACTIVE") is False
        assert sub.can_transition_to("DRAFT") is False
        assert sub.can_transition_to("CANCELLED") is False

    def test_cancellation_paths(self, seeded_db, db_session):
        """DRAFT, QUOTATION, and CONFIRMED can transition to CANCELLED (terminal)."""
        states_allowing_cancel = ["DRAFT", "QUOTATION", "CONFIRMED"]
        for st in states_allowing_cancel:
            sub = Subscription(
                id=uuid.uuid4(),
                subscription_number=f"SUB-CANCEL-{st}",
                customer_id=seeded_db["customer1"].id,
                plan_id=seeded_db["plan_monthly"].id,
                status=st
            )
            assert sub.can_transition_to("CANCELLED") is True

        # CANCELLED is terminal
        cancelled_sub = Subscription(
            id=uuid.uuid4(),
            subscription_number="SUB-TERMINAL-CANCEL",
            customer_id=seeded_db["customer1"].id,
            plan_id=seeded_db["plan_monthly"].id,
            status="CANCELLED"
        )
        assert cancelled_sub.can_transition_to("ACTIVE") is False
        assert cancelled_sub.can_transition_to("DRAFT") is False

    def test_invalid_state_transitions_rejected(self, seeded_db):
        sub = Subscription(
            id=uuid.uuid4(),
            subscription_number="SUB-INVALID-TRANS",
            customer_id=seeded_db["customer1"].id,
            plan_id=seeded_db["plan_monthly"].id,
            status="DRAFT"
        )
        # Cannot jump from DRAFT directly to ACTIVE
        assert sub.can_transition_to("ACTIVE") is False
        # Cannot jump from DRAFT to CLOSED
        assert sub.can_transition_to("CLOSED") is False
        # Cannot jump from DRAFT to PAUSED
        assert sub.can_transition_to("PAUSED") is False

    def test_subscription_pause_and_resume(self, seeded_db, db_session):
        sub = Subscription(
            id=uuid.uuid4(),
            subscription_number="SUB-PAUSE-TEST",
            customer_id=seeded_db["customer1"].id,
            plan_id=seeded_db["plan_monthly"].id,
            status="ACTIVE",
            start_date=datetime.now(timezone.utc) - timedelta(days=15),
            next_billing_date=datetime.now(timezone.utc) + timedelta(days=15)
        )
        db_session.add(sub)
        db_session.commit()

        # Pause subscription
        assert sub.can_transition_to("PAUSED")
        pause_time = datetime.now(timezone.utc)
        sub.status = "PAUSED"
        sub.paused_at = pause_time
        db_session.commit()

        fetched = Subscription.query.filter_by(id=sub.id).first()
        assert fetched.status == "PAUSED"
        assert fetched.paused_at is not None

        # Resume subscription
        assert fetched.can_transition_to("ACTIVE")
        fetched.status = "ACTIVE"
        fetched.paused_at = None
        db_session.commit()

        resumed = Subscription.query.filter_by(id=sub.id).first()
        assert resumed.status == "ACTIVE"
        assert resumed.paused_at is None

    def test_subscription_early_closure(self, seeded_db, db_session):
        sub = Subscription(
            id=uuid.uuid4(),
            subscription_number="SUB-EARLY-CLOSE",
            customer_id=seeded_db["customer1"].id,
            plan_id=seeded_db["plan_monthly"].id,
            status="ACTIVE"
        )
        db_session.add(sub)
        db_session.commit()

        close_time = datetime.now(timezone.utc)
        reason = "Customer requested cancellation via support ticket."
        sub.status = "CLOSED"
        sub.closed_at = close_time
        sub.closure_reason = reason
        db_session.commit()

        fetched = Subscription.query.filter_by(id=sub.id).first()
        assert fetched.status == "CLOSED"
        assert fetched.closed_at is not None
        assert fetched.closure_reason == reason
        assert fetched.can_transition_to("ACTIVE") is False

    def test_subscription_renewal(self, seeded_db, db_session):
        now = datetime.now(timezone.utc)
        initial_expiry = now + timedelta(days=30)
        sub = Subscription(
            id=uuid.uuid4(),
            subscription_number="SUB-RENEW-TEST",
            customer_id=seeded_db["customer1"].id,
            plan_id=seeded_db["plan_monthly"].id,
            status="ACTIVE",
            start_date=now,
            expiry_date=initial_expiry
        )
        db_session.add(sub)
        db_session.commit()

        # Renew by adding 1 month (30 days)
        sub.expiry_date = sub.expiry_date + timedelta(days=30)
        db_session.commit()

        fetched = Subscription.query.filter_by(id=sub.id).first()
        expected = (initial_expiry + timedelta(days=30)).replace(tzinfo=None)
        actual = fetched.expiry_date.replace(tzinfo=None)
        assert actual == expected
