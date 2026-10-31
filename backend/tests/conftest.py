import os
import sys

# Guarantee isolated SQLite testing environment before any app modules are loaded
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, scoped_session
from sqlalchemy.pool import StaticPool

# Ensure backend root is on sys.path
BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app import create_app
from app.db import Base
import app.db
import app.services.billing_engine
from app.models.user import User, PasswordResetToken
from app.models.product import Product, ProductVariant
from app.models.plan import SubscriptionPlan
from app.models.tax_discount import TaxRate, Discount
from app.models.quotation import QuotationTemplate, QuotationTemplateItem
from app.models.subscription import Subscription, SubscriptionItem
from app.models.invoice import Invoice, InvoiceItem
from app.models.payment import Payment

@pytest.fixture(scope="session")
def engine():
    """
    Creates an isolated in-memory SQLite database engine with foreign key enforcement.
    Uses StaticPool so all connections share the same in-memory instance.
    """
    test_engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool
    )

    @event.listens_for(test_engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    return test_engine

@pytest.fixture(scope="function")
def db_session(engine):
    """
    Creates fresh database schema and provides an isolated transaction session
    for each test function, ensuring complete isolation and zero development DB pollution.
    """
    # Create all tables
    Base.metadata.create_all(bind=engine)
    session_factory = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = scoped_session(session_factory)

    # Patch application scoped sessions and Base.query to test session
    orig_db_session = app.db.db_session
    orig_engine = app.db.engine
    orig_billing_session = app.services.billing_engine.db_session

    app.db.db_session = session
    app.db.engine = engine
    app.services.billing_engine.db_session = session
    Base.query = session.query_property()

    yield session

    session.close()
    session.remove()
    Base.metadata.drop_all(bind=engine)

    # Restore originals
    app.db.db_session = orig_db_session
    app.db.engine = orig_engine
    app.services.billing_engine.db_session = orig_billing_session
    Base.query = orig_db_session.query_property()

@pytest.fixture(scope="function")
def app_instance(db_session):
    """Flask application instance configured for testing."""
    app = create_app()
    app.config.update({
        "TESTING": True,
        "SECRET_KEY": "test-jwt-secret-key-brightloop-quality",
        "JWT_EXPIRATION_HOURS": 24
    })
    return app

@pytest.fixture(scope="function")
def client(app_instance):
    """Flask test client for HTTP requests."""
    return app_instance.test_client()

@pytest.fixture(scope="function")
def seeded_db(db_session):
    """
    Seeds a representative set of users, products, variants, plans,
    taxes, discounts, and quotations for integration and business rule testing.
    """
    # 1. Users
    admin = User(
        id=uuid.uuid4(),
        email="admin@test.brightloop.io",
        full_name="Admin User",
        company_name="Brightloop Systems",
        role="ADMIN"
    )
    admin.set_password("AdminPass@2026")

    staff = User(
        id=uuid.uuid4(),
        email="staff@test.brightloop.io",
        full_name="Staff User",
        company_name="Brightloop Operations",
        role="STAFF"
    )
    staff.set_password("StaffPass@2026")

    customer1 = User(
        id=uuid.uuid4(),
        email="customer1@client.io",
        full_name="Customer One",
        company_name="Client Corp",
        role="CUSTOMER"
    )
    customer1.set_password("CustomerPass@2026")

    customer2 = User(
        id=uuid.uuid4(),
        email="customer2@startup.io",
        full_name="Customer Two",
        company_name="Startup Inc",
        role="CUSTOMER"
    )
    customer2.set_password("CustomerPass@2026")

    db_session.add_all([admin, staff, customer1, customer2])
    db_session.flush()

    # 2. Tax Rates
    tax_gst = TaxRate(id=uuid.uuid4(), name="GST 18%", rate_percentage=Decimal("18.000"), is_active=True)
    tax_vat = TaxRate(id=uuid.uuid4(), name="VAT 10%", rate_percentage=Decimal("10.000"), is_active=True)
    tax_zero = TaxRate(id=uuid.uuid4(), name="Zero Tax", rate_percentage=Decimal("0.000"), is_active=True)
    db_session.add_all([tax_gst, tax_vat, tax_zero])
    db_session.flush()

    # 3. Products & Variants
    prod_software = Product(
        id=uuid.uuid4(),
        name="Brightloop Cloud Platform",
        product_type="SOFTWARE",
        sales_price=Decimal("100.00"),
        cost_price=Decimal("25.00"),
        description="Core cloud subscription"
    )
    prod_addon = Product(
        id=uuid.uuid4(),
        name="Dedicated Support SLA",
        product_type="SERVICE",
        sales_price=Decimal("50.00"),
        cost_price=Decimal("15.00"),
        description="24/7 dedicated support"
    )
    db_session.add_all([prod_software, prod_addon])
    db_session.flush()

    var_pro = ProductVariant(
        id=uuid.uuid4(),
        product_id=prod_software.id,
        variant_name="Pro License (25 seats)",
        sku="BL-PRO-25",
        additional_price=Decimal("20.00")
    )
    var_ent = ProductVariant(
        id=uuid.uuid4(),
        product_id=prod_software.id,
        variant_name="Enterprise License (Unlimited)",
        sku="BL-ENT-UNL",
        additional_price=Decimal("100.00")
    )
    db_session.add_all([var_pro, var_ent])
    db_session.flush()

    # 4. Subscription Plans
    plan_monthly = SubscriptionPlan(
        id=uuid.uuid4(),
        name="Monthly Standard",
        billing_interval="MONTHLY",
        interval_count=1,
        minimum_quantity=1,
        base_price=Decimal("100.00"),
        available_from=date.today() - timedelta(days=30)
    )
    plan_quarterly = SubscriptionPlan(
        id=uuid.uuid4(),
        name="Quarterly Growth",
        billing_interval="MONTHLY",
        interval_count=3,
        minimum_quantity=1,
        base_price=Decimal("280.00"),
        available_from=date.today() - timedelta(days=30)
    )
    plan_yearly = SubscriptionPlan(
        id=uuid.uuid4(),
        name="Annual Enterprise",
        billing_interval="YEARLY",
        interval_count=1,
        minimum_quantity=1,
        base_price=Decimal("1000.00"),
        available_from=date.today() - timedelta(days=30),
        auto_close=True,
        auto_close_days=365
    )
    db_session.add_all([plan_monthly, plan_quarterly, plan_yearly])
    db_session.flush()

    # 5. Discounts
    disc_percentage = Discount(
        id=uuid.uuid4(),
        code="SAVE20",
        description="20% off general discount",
        discount_type="PERCENTAGE",
        discount_value=Decimal("20.00"),
        min_purchase_amount=Decimal("50.00"),
        min_quantity=1,
        start_date=date.today() - timedelta(days=10),
        end_date=date.today() + timedelta(days=60),
        usage_limit=50
    )
    disc_fixed = Discount(
        id=uuid.uuid4(),
        code="FIXED30",
        description="$30 off orders above $100",
        discount_type="FIXED",
        discount_value=Decimal("30.00"),
        min_purchase_amount=Decimal("100.00"),
        min_quantity=1,
        start_date=date.today() - timedelta(days=10),
        end_date=date.today() + timedelta(days=60),
        usage_limit=100
    )
    disc_product_scoped = Discount(
        id=uuid.uuid4(),
        code="SOFTWARE10",
        description="10% off cloud software only",
        discount_type="PERCENTAGE",
        discount_value=Decimal("10.00"),
        scope="PRODUCT",
        min_purchase_amount=Decimal("0.00"),
        min_quantity=1,
        start_date=date.today() - timedelta(days=10),
        end_date=date.today() + timedelta(days=60)
    )
    disc_product_scoped.applicable_products.append(prod_software)

    db_session.add_all([disc_percentage, disc_fixed, disc_product_scoped])
    db_session.flush()

    # 6. Quotation Template
    quotation_tmpl = QuotationTemplate(
        id=uuid.uuid4(),
        name="Standard Cloud SaaS Quote",
        description="Standard template with cloud platform Pro and SLA",
        plan_id=plan_monthly.id,
        default_validity_days=30,
        terms_and_conditions="Payment due upon billing generation.",
        created_by=admin.id
    )
    db_session.add(quotation_tmpl)
    db_session.flush()

    q_item1 = QuotationTemplateItem(
        id=uuid.uuid4(),
        template_id=quotation_tmpl.id,
        product_id=prod_software.id,
        variant_id=var_pro.id,
        quantity=1,
        override_unit_price=None
    )
    q_item2 = QuotationTemplateItem(
        id=uuid.uuid4(),
        template_id=quotation_tmpl.id,
        product_id=prod_addon.id,
        variant_id=None,
        quantity=1,
        override_unit_price=Decimal("45.00")
    )
    db_session.add_all([q_item1, q_item2])
    db_session.commit()

    return {
        "admin": admin,
        "staff": staff,
        "customer1": customer1,
        "customer2": customer2,
        "tax_gst": tax_gst,
        "tax_vat": tax_vat,
        "tax_zero": tax_zero,
        "prod_software": prod_software,
        "prod_addon": prod_addon,
        "var_pro": var_pro,
        "var_ent": var_ent,
        "plan_monthly": plan_monthly,
        "plan_quarterly": plan_quarterly,
        "plan_yearly": plan_yearly,
        "disc_percentage": disc_percentage,
        "disc_fixed": disc_fixed,
        "disc_product_scoped": disc_product_scoped,
        "quotation_tmpl": quotation_tmpl
    }
