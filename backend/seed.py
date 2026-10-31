import sys
import os
import uuid
from datetime import datetime, timezone, date, timedelta
from decimal import Decimal

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from app.db import db_session, engine, Base
from app.models.user import User
from app.models.product import Product, ProductVariant
from app.models.plan import SubscriptionPlan
from app.models.tax_discount import TaxRate, Discount
from app.models.quotation import QuotationTemplate, QuotationTemplateItem
from app.models.subscription import Subscription, SubscriptionItem
from app.models.invoice import Invoice, InvoiceItem
from app.models.payment import Payment

def seed_database():
    print("Beginning database seeding...")
    
    # 1. Users
    if User.query.count() == 0:
        admin = User(
            id=uuid.uuid4(),
            email="admin@brightloop.io",
            full_name="Alex Mercer (Admin)",
            company_name="Brightloop Systems Inc.",
            role="ADMIN"
        )
        admin.set_password("BrightLoop@2026!")

        staff = User(
            id=uuid.uuid4(),
            email="staff@brightloop.io",
            full_name="Samantha Ray (Staff)",
            company_name="Brightloop Support",
            role="STAFF"
        )
        staff.set_password("BrightStaff@2026!")

        customer1 = User(
            id=uuid.uuid4(),
            email="sarah.connor@cyberdyne.io",
            full_name="Sarah Connor",
            company_name="Cyberdyne Systems",
            billing_address="100 Tech Blvd, Silicon Valley, CA",
            role="CUSTOMER"
        )
        customer1.set_password("Customer@2026!")

        customer2 = User(
            id=uuid.uuid4(),
            email="john.doe@startup.io",
            full_name="John Doe",
            company_name="Startup Dynamics",
            billing_address="45 Innovation Way, Austin, TX",
            role="CUSTOMER"
        )
        customer2.set_password("Customer@2026!")

        db_session.add_all([admin, staff, customer1, customer2])
        db_session.flush()
        print("  [OK] Created Admin, Staff, and Customer users")
    else:
        admin = User.query.filter_by(role="ADMIN").first()
        staff = User.query.filter_by(role="STAFF").first()
        customer1 = User.query.filter_by(role="CUSTOMER").first()

    # 2. Tax Rates
    if TaxRate.query.count() == 0:
        tax_gst = TaxRate(name="GST 18%", rate_percentage=Decimal("18.000"))
        tax_vat = TaxRate(name="Standard VAT 10%", rate_percentage=Decimal("10.000"))
        tax_zero = TaxRate(name="Zero Tax (Export)", rate_percentage=Decimal("0.000"))
        db_session.add_all([tax_gst, tax_vat, tax_zero])
        db_session.flush()
        print("  [OK] Created Tax rates")
    else:
        tax_gst = TaxRate.query.filter_by(name="GST 18%").first()

    # 3. Discounts
    if Discount.query.count() == 0:
        disc_welcome = Discount(
            code="WELCOME10",
            description="10% discount on initial setup",
            discount_type="PERCENTAGE",
            discount_value=Decimal("10.00"),
            min_purchase_amount=Decimal("50.00"),
            min_quantity=1,
            start_date=date.today() - timedelta(days=30),
            end_date=date.today() + timedelta(days=60),
            usage_limit=100
        )
        disc_flat = Discount(
            code="FLAT50",
            description="$50 off enterprise orders",
            discount_type="FIXED",
            discount_value=Decimal("50.00"),
            min_purchase_amount=Decimal("200.00"),
            min_quantity=1,
            start_date=date.today() - timedelta(days=30),
            end_date=date.today() + timedelta(days=90),
            usage_limit=50
        )
        disc_expired = Discount(
            code="EXPIRED20",
            description="Expired promotional code",
            discount_type="PERCENTAGE",
            discount_value=Decimal("20.00"),
            start_date=date.today() - timedelta(days=60),
            end_date=date.today() - timedelta(days=5),
            usage_limit=10
        )
        db_session.add_all([disc_welcome, disc_flat, disc_expired])
        db_session.flush()
        print("  [OK] Created Discounts (Percentage, Fixed, and Expired)")
    else:
        disc_welcome = Discount.query.filter_by(code="WELCOME10").first()

    # 4. Products & Variants
    if Product.query.count() == 0:
        prod_crm = Product(
            name="Brightloop Cloud CRM",
            product_type="SOFTWARE",
            sales_price=Decimal("99.00"),
            cost_price=Decimal("20.00"),
            description="Core subscription management and CRM suite."
        )
        db_session.add(prod_crm)
        db_session.flush()

        v_basic = ProductVariant(product_id=prod_crm.id, variant_name="Starter (5 Users)", sku="CRM-STARTER", additional_price=Decimal("0.00"))
        v_pro = ProductVariant(product_id=prod_crm.id, variant_name="Professional (25 Users)", sku="CRM-PRO", additional_price=Decimal("50.00"))
        v_ent = ProductVariant(product_id=prod_crm.id, variant_name="Enterprise (Unlimited)", sku="CRM-ENT", additional_price=Decimal("150.00"))
        db_session.add_all([v_basic, v_pro, v_ent])

        prod_support = Product(
            name="24/7 Priority Support SLA",
            product_type="SERVICE",
            sales_price=Decimal("49.00"),
            cost_price=Decimal("10.00"),
            description="Dedicated technical account manager with 15-minute SLA."
        )
        db_session.add(prod_support)

        prod_hardware = Product(
            name="Secure IoT Telemetry Gateway",
            product_type="PHYSICAL",
            sales_price=Decimal("299.00"),
            cost_price=Decimal("150.00"),
            description="Industrial gateway device for on-premise telemetry."
        )
        db_session.add(prod_hardware)
        db_session.flush()
        print("  [OK] Created Products and Variants")
    else:
        prod_crm = Product.query.first()
        v_pro = ProductVariant.query.first()

    # 5. Subscription Plans
    if SubscriptionPlan.query.count() == 0:
        plan_monthly = SubscriptionPlan(
            name="Standard Monthly Plan",
            billing_interval="MONTHLY",
            interval_count=1,
            minimum_quantity=1,
            base_price=Decimal("99.00"),
            available_from=date.today() - timedelta(days=60)
        )
        plan_quarterly = SubscriptionPlan(
            name="Quarterly Growth Plan",
            billing_interval="MONTHLY",
            interval_count=3,
            minimum_quantity=1,
            base_price=Decimal("270.00"),
            available_from=date.today() - timedelta(days=60)
        )
        plan_annual = SubscriptionPlan(
            name="Enterprise Annual Plan",
            billing_interval="YEARLY",
            interval_count=1,
            minimum_quantity=1,
            base_price=Decimal("999.00"),
            available_from=date.today() - timedelta(days=60)
        )
        db_session.add_all([plan_monthly, plan_quarterly, plan_annual])
        db_session.flush()
        print("  [OK] Created Monthly, Quarterly (3-Month), and Annual Plans")
    else:
        plan_monthly = SubscriptionPlan.query.first()

    # 6. Quotation Templates
    if QuotationTemplate.query.count() == 0:
        template = QuotationTemplate(
            name="SaaS Starter Package",
            description="Includes Cloud CRM Pro license plus standard support.",
            plan_id=plan_monthly.id,
            default_validity_days=30,
            terms_and_conditions="Standard 30-day trial with automatic recurring billing upon confirmation.",
            created_by=admin.id
        )
        db_session.add(template)
        db_session.flush()

        t_item1 = QuotationTemplateItem(template_id=template.id, product_id=prod_crm.id, variant_id=v_pro.id, quantity=1)
        db_session.add(t_item1)
        db_session.flush()
        print("  [OK] Created Quotation Templates")

    db_session.commit()
    print("Database seeding completed successfully!")

if __name__ == "__main__":
    seed_database()
