import uuid
from decimal import Decimal
from datetime import date, datetime, timedelta, timezone
import pytest
from sqlalchemy.schema import CreateTable
from sqlalchemy.dialects import postgresql
from sqlalchemy.exc import IntegrityError

from app.db import Base
import app.models
from app.models.user import User, PasswordResetToken
from app.models.product import Product, ProductVariant
from app.models.plan import SubscriptionPlan
from app.models.tax_discount import TaxRate, Discount, discount_products
from app.models.quotation import QuotationTemplate, QuotationTemplateItem
from app.models.subscription import Subscription, SubscriptionItem
from app.models.invoice import Invoice, InvoiceItem
from app.models.payment import Payment

class TestPostgreSQLSchemaAndDDLVerification:
    """
    Verifies that all 15 relational tables generate valid PostgreSQL DDL
    with required data types, primary keys, foreign keys, cascade rules, and indexes.
    """
    EXPECTED_TABLES = {
        "users",
        "password_reset_tokens",
        "products",
        "product_variants",
        "subscription_plans",
        "tax_rates",
        "discount_products",
        "discounts",
        "quotation_templates",
        "quotation_template_items",
        "subscriptions",
        "subscription_items",
        "invoices",
        "invoice_items",
        "payments"
    }

    def test_all_15_tables_present_in_metadata(self):
        registered_tables = set(Base.metadata.tables.keys())
        assert self.EXPECTED_TABLES.issubset(registered_tables), (
            f"Missing tables: {self.EXPECTED_TABLES - registered_tables}"
        )

    def test_postgresql_ddl_compilation_all_tables(self):
        """Verifies PostgreSQL dialect compiles DDL without syntax errors for all tables."""
        pg_dialect = postgresql.dialect()
        for tbl_name in self.EXPECTED_TABLES:
            table = Base.metadata.tables[tbl_name]
            ddl_string = str(CreateTable(table).compile(dialect=pg_dialect))
            assert f"CREATE TABLE {tbl_name}" in ddl_string
            assert "UUID" in ddl_string or "id" in ddl_string

    def test_primary_keys_configured_for_all_tables(self):
        for tbl_name in self.EXPECTED_TABLES:
            table = Base.metadata.tables[tbl_name]
            pks = [c.name for c in table.primary_key]
            if tbl_name == "discount_products":
                # Composite junction PK
                assert set(pks) == {"discount_id", "product_id"}
            else:
                assert pks == ["id"], f"Table {tbl_name} primary key mismatch: {pks}"

    def test_composite_unique_constraints(self):
        """Verify business-critical composite unique constraints."""
        # 1. Product Variant: unique (product_id, variant_name)
        pv_table = Base.metadata.tables["product_variants"]
        pv_uq_names = [c.name for c in pv_table.constraints if hasattr(c, 'columns')]
        assert "uq_product_variant" in pv_uq_names

        # 2. Invoicing: unique (subscription_id, billing_period_start, billing_period_end)
        inv_table = Base.metadata.tables["invoices"]
        inv_uq_names = [c.name for c in inv_table.constraints if hasattr(c, 'columns')]
        assert "uq_subscription_billing_period" in inv_uq_names

    def test_foreign_key_cascade_and_restrict_rules(self):
        """
        Verify referential integrity rules:
        - RESTRICT on financial records (Invoices, Subscriptions, Payments)
        - CASCADE on parent-child components (Variants, Items, Reset Tokens)
        - SET NULL on optional links (Templates, Creators, Tax Rates, Discounts)
        """
        # User -> Reset Tokens (CASCADE)
        prt_fk = Base.metadata.tables["password_reset_tokens"].foreign_keys
        prt_fk_action = {fk.parent.name: fk.ondelete for fk in prt_fk}
        assert prt_fk_action.get("user_id") == "CASCADE"

        # Product -> Variants (CASCADE)
        pv_fk = Base.metadata.tables["product_variants"].foreign_keys
        pv_fk_action = {fk.parent.name: fk.ondelete for fk in pv_fk}
        assert pv_fk_action.get("product_id") == "CASCADE"

        # Subscriptions -> User (customer_id RESTRICT, created_by SET NULL)
        sub_fk = Base.metadata.tables["subscriptions"].foreign_keys
        sub_fk_action = {fk.parent.name: fk.ondelete for fk in sub_fk}
        assert sub_fk_action.get("customer_id") == "RESTRICT"
        assert sub_fk_action.get("created_by") == "SET NULL"

        # Invoices -> User/Subscription (RESTRICT - cannot delete with financial invoices)
        inv_fk = Base.metadata.tables["invoices"].foreign_keys
        inv_fk_action = {fk.parent.name: fk.ondelete for fk in inv_fk}
        assert inv_fk_action.get("customer_id") == "RESTRICT"
        assert inv_fk_action.get("subscription_id") == "RESTRICT"

        # Invoice -> InvoiceItem (CASCADE)
        ii_fk = Base.metadata.tables["invoice_items"].foreign_keys
        ii_fk_action = {fk.parent.name: fk.ondelete for fk in ii_fk}
        assert ii_fk_action.get("invoice_id") == "CASCADE"

    def test_indexes_on_query_critical_columns(self):
        """Verify performance indexes on high-traffic filter columns."""
        users_table = Base.metadata.tables["users"]
        user_idx_cols = {c.name for idx in users_table.indexes for c in idx.columns}
        assert "email" in user_idx_cols
        assert "role" in user_idx_cols

        subs_table = Base.metadata.tables["subscriptions"]
        sub_idx_cols = {c.name for idx in subs_table.indexes for c in idx.columns}
        assert "subscription_number" in sub_idx_cols
        assert "customer_id" in sub_idx_cols
        assert "status" in sub_idx_cols
        assert "next_billing_date" in sub_idx_cols

        inv_table = Base.metadata.tables["invoices"]
        inv_idx_cols = {c.name for idx in inv_table.indexes for c in idx.columns}
        assert "invoice_number" in inv_idx_cols
        assert "customer_id" in inv_idx_cols
        assert "due_date" in inv_idx_cols
        assert "status" in inv_idx_cols

class TestReferentialIntegrityAndForeignKeys:
    def test_foreign_key_blocks_orphan_invoice(self, db_session):
        """Creating an invoice with non-existent customer or subscription must fail."""
        orphan_inv = Invoice(
            id=uuid.uuid4(),
            invoice_number="INV-ORPHAN-001",
            subscription_id=uuid.uuid4(), # Invalid FK
            customer_id=uuid.uuid4(),     # Invalid FK
            billing_period_start=date.today(),
            billing_period_end=date.today() + timedelta(days=30),
            due_date=date.today() + timedelta(days=14),
            total_amount=Decimal("100.00"),
            balance_due=Decimal("100.00")
        )
        db_session.add(orphan_inv)
        with pytest.raises(IntegrityError):
            db_session.commit()
        db_session.rollback()

    def test_restrict_blocks_customer_deletion_with_invoices(self, seeded_db, db_session):
        """Deleting a customer who has invoices must be blocked by RESTRICT constraint."""
        customer = seeded_db["customer1"]
        plan = seeded_db["plan_monthly"]

        sub = Subscription(
            id=uuid.uuid4(),
            subscription_number=f"SUB-RESTRICT-{uuid.uuid4().hex[:6]}",
            customer_id=customer.id,
            plan_id=plan.id,
            status="ACTIVE"
        )
        db_session.add(sub)
        db_session.flush()

        inv = Invoice(
            id=uuid.uuid4(),
            invoice_number=f"INV-RESTRICT-{uuid.uuid4().hex[:6]}",
            subscription_id=sub.id,
            customer_id=customer.id,
            billing_period_start=date.today(),
            billing_period_end=date.today() + timedelta(days=30),
            due_date=date.today() + timedelta(days=14),
            total_amount=Decimal("100.00"),
            balance_due=Decimal("100.00")
        )
        db_session.add(inv)
        db_session.commit()

        # Attempt to delete customer
        db_session.delete(customer)
        with pytest.raises(IntegrityError):
            db_session.commit()
        db_session.rollback()

    def test_seed_data_relations_integrity(self, seeded_db):
        """Verify all seeded models establish proper bidirectional relationships."""
        admin = seeded_db["admin"]
        plan = seeded_db["plan_monthly"]
        prod = seeded_db["prod_software"]
        tmpl = seeded_db["quotation_tmpl"]

        # User -> Quotation Template
        assert tmpl.created_by == admin.id
        assert tmpl.creator.id == admin.id

        # Quotation Template -> Plan
        assert tmpl.plan_id == plan.id
        assert tmpl.plan.id == plan.id

        # Product -> Variants
        assert len(prod.variants) >= 2
        for v in prod.variants:
            assert v.product.id == prod.id

        # Discount -> Applicable Products
        scoped_disc = seeded_db["disc_product_scoped"]
        assert prod in scoped_disc.applicable_products
