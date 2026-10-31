import uuid
from datetime import date, timedelta
from decimal import Decimal
import pytest
from sqlalchemy.exc import IntegrityError

from app.models.product import Product, ProductVariant
from app.models.plan import SubscriptionPlan

class TestProductCatalog:
    def test_product_creation_and_attributes(self, db_session):
        prod = Product(
            id=uuid.uuid4(),
            name="Brightloop Monitoring Agent",
            product_type="SOFTWARE",
            sales_price=Decimal("150.00"),
            cost_price=Decimal("35.00"),
            description="Autonomous infrastructure monitoring service",
            notes="Requires Python 3.10 runtime"
        )
        db_session.add(prod)
        db_session.commit()

        fetched = Product.query.filter_by(id=prod.id).first()
        assert fetched is not None
        assert fetched.name == "Brightloop Monitoring Agent"
        assert fetched.product_type == "SOFTWARE"
        assert fetched.sales_price == Decimal("150.00")
        assert fetched.cost_price == Decimal("35.00")
        assert fetched.is_active is True
        
        data = fetched.to_dict()
        assert data["id"] == str(prod.id)
        assert data["sales_price"] == 150.0
        assert data["cost_price"] == 35.0
        assert data["variants"] == []

    def test_product_variant_association_and_pricing(self, db_session):
        prod = Product(
            id=uuid.uuid4(),
            name="Cloud Storage Bucket",
            product_type="SOFTWARE",
            sales_price=Decimal("20.00"),
            cost_price=Decimal("5.00")
        )
        db_session.add(prod)
        db_session.flush()

        v1 = ProductVariant(
            id=uuid.uuid4(),
            product_id=prod.id,
            variant_name="100 GB Tier",
            sku="STOR-100G",
            additional_price=Decimal("0.00")
        )
        v2 = ProductVariant(
            id=uuid.uuid4(),
            product_id=prod.id,
            variant_name="1 TB Tier",
            sku="STOR-1TB",
            additional_price=Decimal("80.00")
        )
        db_session.add_all([v1, v2])
        db_session.commit()

        fetched_prod = Product.query.filter_by(id=prod.id).first()
        assert len(fetched_prod.variants) == 2
        var_names = {v.variant_name for v in fetched_prod.variants}
        assert var_names == {"100 GB Tier", "1 TB Tier"}

        # Total price calculation with variant
        total_price_v2 = fetched_prod.sales_price + v2.additional_price
        assert total_price_v2 == Decimal("100.00")

    def test_duplicate_variant_name_for_same_product_rejected(self, db_session):
        """
        Database Constraint: UniqueConstraint('product_id', 'variant_name', name='uq_product_variant')
        Adding duplicate variant names for the SAME product must raise an IntegrityError.
        """
        prod = Product(
            id=uuid.uuid4(),
            name="Database Engine",
            product_type="SOFTWARE",
            sales_price=Decimal("50.00")
        )
        db_session.add(prod)
        db_session.flush()

        v1 = ProductVariant(
            id=uuid.uuid4(),
            product_id=prod.id,
            variant_name="High Availability",
            sku="DB-HA-1",
            additional_price=Decimal("100.00")
        )
        v2 = ProductVariant(
            id=uuid.uuid4(),
            product_id=prod.id,
            variant_name="High Availability", # Duplicate name
            sku="DB-HA-2",
            additional_price=Decimal("120.00")
        )
        db_session.add(v1)
        db_session.commit()

        db_session.add(v2)
        with pytest.raises(IntegrityError):
            db_session.commit()
        db_session.rollback()

    def test_same_variant_name_for_different_products_allowed(self, db_session):
        prod1 = Product(id=uuid.uuid4(), name="Software A", sales_price=Decimal("50.00"))
        prod2 = Product(id=uuid.uuid4(), name="Software B", sales_price=Decimal("75.00"))
        db_session.add_all([prod1, prod2])
        db_session.flush()

        v1 = ProductVariant(product_id=prod1.id, variant_name="Enterprise", sku="PROD1-ENT")
        v2 = ProductVariant(product_id=prod2.id, variant_name="Enterprise", sku="PROD2-ENT")
        db_session.add_all([v1, v2])
        db_session.commit()

        assert ProductVariant.query.filter_by(variant_name="Enterprise").count() == 2

    def test_product_variant_cascade_delete(self, db_session):
        """Deleting a Product must cascade and delete its associated variants."""
        prod = Product(id=uuid.uuid4(), name="Legacy Platform", sales_price=Decimal("99.00"))
        db_session.add(prod)
        db_session.flush()

        v = ProductVariant(product_id=prod.id, variant_name="Old Variant", sku="LEGACY-1")
        db_session.add(v)
        db_session.commit()

        variant_id = v.id
        db_session.delete(prod)
        db_session.commit()

        assert Product.query.filter_by(id=prod.id).first() is None
        assert ProductVariant.query.filter_by(id=variant_id).first() is None

class TestSubscriptionPlans:
    def test_plan_intervals_supported(self, db_session):
        """
        Billing intervals must support DAILY, WEEKLY, MONTHLY, and YEARLY cycles.
        """
        valid_intervals = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]
        plans = []
        for interval in valid_intervals:
            plan = SubscriptionPlan(
                id=uuid.uuid4(),
                name=f"{interval} Plan",
                billing_interval=interval,
                interval_count=1,
                minimum_quantity=1,
                base_price=Decimal("50.00")
            )
            plans.append(plan)
        db_session.add_all(plans)
        db_session.commit()

        for interval in valid_intervals:
            p = SubscriptionPlan.query.filter_by(billing_interval=interval).first()
            assert p is not None
            assert p.billing_interval == interval

    def test_plan_multi_interval_quarterly(self, db_session):
        """
        Quarterly plan: interval='MONTHLY' with interval_count=3.
        """
        plan = SubscriptionPlan(
            id=uuid.uuid4(),
            name="Quarterly SaaS Plan",
            billing_interval="MONTHLY",
            interval_count=3,
            minimum_quantity=1,
            base_price=Decimal("300.00")
        )
        db_session.add(plan)
        db_session.commit()

        fetched = SubscriptionPlan.query.filter_by(id=plan.id).first()
        assert fetched.interval_count == 3
        assert fetched.billing_interval == "MONTHLY"

    def test_plan_availability_date_ranges(self, db_session):
        today = date.today()
        # Active plan
        active_plan = SubscriptionPlan(
            id=uuid.uuid4(),
            name="Current Plan",
            billing_interval="MONTHLY",
            available_from=today - timedelta(days=15),
            available_to=today + timedelta(days=30),
            base_price=Decimal("99.00")
        )
        # Expired plan
        expired_plan = SubscriptionPlan(
            id=uuid.uuid4(),
            name="Expired Plan",
            billing_interval="MONTHLY",
            available_from=today - timedelta(days=60),
            available_to=today - timedelta(days=1),
            base_price=Decimal("89.00")
        )
        # Future plan
        future_plan = SubscriptionPlan(
            id=uuid.uuid4(),
            name="Future Release Plan",
            billing_interval="MONTHLY",
            available_from=today + timedelta(days=10),
            available_to=today + timedelta(days=90),
            base_price=Decimal("120.00")
        )
        db_session.add_all([active_plan, expired_plan, future_plan])
        db_session.commit()

        def is_plan_currently_available(p, target_date=None):
            d = target_date or date.today()
            if not p.is_active:
                return False
            if p.available_from and d < p.available_from:
                return False
            if p.available_to and d > p.available_to:
                return False
            return True

        assert is_plan_currently_available(active_plan) is True
        assert is_plan_currently_available(expired_plan) is False
        assert is_plan_currently_available(future_plan) is False

    def test_plan_minimum_quantity_and_auto_close(self, db_session):
        plan = SubscriptionPlan(
            id=uuid.uuid4(),
            name="Volume License Plan",
            billing_interval="YEARLY",
            interval_count=1,
            minimum_quantity=5, # Minimum 5 licenses required
            base_price=Decimal("500.00"),
            auto_close=True,
            auto_close_days=365
        )
        db_session.add(plan)
        db_session.commit()

        fetched = SubscriptionPlan.query.filter_by(id=plan.id).first()
        assert fetched.minimum_quantity == 5
        assert fetched.auto_close is True
        assert fetched.auto_close_days == 365

        data = fetched.to_dict()
        assert data["minimum_quantity"] == 5
        assert data["auto_close"] is True
