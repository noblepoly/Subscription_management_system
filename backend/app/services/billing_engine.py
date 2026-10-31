import uuid
from datetime import datetime, timezone, date, timedelta
from decimal import Decimal
from dateutil.relativedelta import relativedelta
from app.db import db_session
from app.models.subscription import Subscription
from app.models.invoice import Invoice, InvoiceItem
from app.utils.financial import quantize_money

def compute_next_billing_date(start_date: date, billing_interval: str, interval_count: int = 1) -> date:
    """
    Computes exact subsequent billing date with month-end clipping (e.g. Jan 31 -> Feb 28).
    Supports interval_count (e.g. 3 for quarterly).
    """
    interval_upper = (billing_interval or "MONTHLY").upper()
    count = max(1, interval_count or 1)
    
    if interval_upper == "DAILY":
        return start_date + timedelta(days=count)
    elif interval_upper == "WEEKLY":
        return start_date + timedelta(weeks=count)
    elif interval_upper == "MONTHLY":
        return start_date + relativedelta(months=count)
    elif interval_upper == "YEARLY":
        return start_date + relativedelta(years=count)
    else:
        return start_date + relativedelta(months=count)

def generate_invoice_for_period(subscription: Subscription, period_start: date, period_end: date, due_days: int = 14) -> Invoice | None:
    """
    Creates an itemized invoice snapshot for a specific billing period.
    Strictly enforces non-duplication via unique constraint and DB query.
    """
    existing = Invoice.query.filter_by(
        subscription_id=subscription.id,
        billing_period_start=period_start,
        billing_period_end=period_end
    ).first()
    
    if existing:
        return None # Duplicate prevented

    inv_count = Invoice.query.count() + 1
    invoice_number = f"INV-{date.today().year}-{inv_count:05d}"
    due_date = period_start + timedelta(days=due_days)

    invoice = Invoice(
        id=uuid.uuid4(),
        invoice_number=invoice_number,
        subscription_id=subscription.id,
        customer_id=subscription.customer_id,
        status="CONFIRMED", # Ready for payment
        billing_period_start=period_start,
        billing_period_end=period_end,
        invoice_date=date.today(),
        due_date=due_date,
        subtotal=subscription.subtotal,
        discount_amount=subscription.discount_amount,
        tax_amount=subscription.tax_amount,
        total_amount=subscription.recurring_total,
        amount_paid=Decimal("0.00"),
        balance_due=subscription.recurring_total,
        notes=f"Recurring billing for {subscription.subscription_number} ({period_start} to {period_end})"
    )
    db_session.add(invoice)
    db_session.flush()

    # Capture immutable snapshots for line items (Refinement 1)
    tax_rate_val = Decimal(str(subscription.tax_rate.rate_percentage)) if subscription.tax_rate else Decimal("0.000")
    
    for sub_item in subscription.items:
        # Proportionate discount allocation
        line_discount = Decimal("0.00")
        if subscription.subtotal > Decimal("0.00") and subscription.discount_amount > Decimal("0.00"):
            ratio = sub_item.line_total / subscription.subtotal
            line_discount = quantize_money(subscription.discount_amount * ratio)
            
        taxable_line = max(Decimal("0.00"), sub_item.line_total - line_discount)
        line_tax = quantize_money((taxable_line * tax_rate_val) / Decimal("100.0"))

        item_snapshot = InvoiceItem(
            id=uuid.uuid4(),
            invoice_id=invoice.id,
            product_name=sub_item.product.name if sub_item.product else "Service Item",
            variant_name=sub_item.variant.variant_name if sub_item.variant else None,
            quantity=sub_item.quantity,
            applied_unit_price=sub_item.unit_price,
            applied_additional_price=sub_item.additional_price,
            discount_allocation=line_discount,
            tax_rate=tax_rate_val,
            tax_amount=line_tax,
            line_total=sub_item.line_total
        )
        db_session.add(item_snapshot)

    return invoice

def run_recurring_billing_cycle(target_date: date = None) -> dict:
    """
    Executes the automated recurring billing run:
    - Finds active subscriptions due on or before target_date
    - Avoids paused or expired subscriptions
    - Generates invoices with concurrency safety
    - Advances next_billing_date
    """
    target_date = target_date or date.today()
    target_dt = datetime.combine(target_date, datetime.max.time(), tzinfo=timezone.utc)
    
    # Query subscriptions ready for billing
    due_subscriptions = Subscription.query.filter(
        Subscription.status == "ACTIVE",
        Subscription.next_billing_date <= target_dt
    ).all()

    invoices_created = []
    skipped_count = 0

    for sub in due_subscriptions:
        # Check expiration
        if sub.expiry_date and sub.expiry_date.date() < target_date:
            if sub.plan and sub.plan.auto_close:
                sub.status = "CLOSED"
                sub.closed_at = datetime.now(timezone.utc)
                sub.closure_reason = "Plan term reached expiration date."
            continue

        period_start = sub.next_billing_date.date() if sub.next_billing_date else target_date
        interval = sub.plan.billing_interval if sub.plan else "MONTHLY"
        interval_count = sub.plan.interval_count if sub.plan else 1
        period_end = compute_next_billing_date(period_start, interval, interval_count)

        invoice = generate_invoice_for_period(sub, period_start, period_end)
        if invoice:
            invoices_created.append(invoice.invoice_number)
            sub.last_billed_date = datetime.now(timezone.utc)
            # Advance next billing date
            next_dt = datetime.combine(period_end, datetime.min.time(), tzinfo=timezone.utc)
            sub.next_billing_date = next_dt
        else:
            skipped_count += 1

    try:
        db_session.commit()
    except Exception as e:
        db_session.rollback()
        raise e

    return {
        "target_date": target_date.isoformat(),
        "processed_subscriptions": len(due_subscriptions),
        "invoices_generated": len(invoices_created),
        "invoice_numbers": invoices_created,
        "skipped_duplicate_or_held": skipped_count
    }
