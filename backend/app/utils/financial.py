from decimal import Decimal, ROUND_HALF_UP

TWO_PLACES = Decimal("0.01")

def quantize_money(amount: Decimal | float | int | str) -> Decimal:
    """Rounds all currency values to 2 decimal places using ROUND_HALF_UP."""
    if amount is None:
        return Decimal("0.00")
    if not isinstance(amount, Decimal):
        amount = Decimal(str(amount))
    return amount.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)

def calculate_mrr(amount: Decimal | float | int | str, interval: str, interval_count: int = 1) -> Decimal:
    """
    Calculates normalized Monthly Recurring Revenue (MRR) taking into account interval_count.
    Examples:
    - ₹3,000 billed every 3 months => interval='MONTHLY', interval_count=3 => MRR = ₹1,000.00
    - ₹12,000 billed every 1 year => interval='YEARLY', interval_count=1 => MRR = ₹1,000.00
    - ₹700 billed every 1 week => interval='WEEKLY', interval_count=1 => MRR = ₹700 * 52 / 12 = ₹3,033.33
    - ₹100 billed every 1 day => interval='DAILY', interval_count=1 => MRR = ₹100 * 30 = ₹3,000.00
    """
    amt = quantize_money(amount)
    count = max(1, interval_count or 1)
    interval_upper = (interval or "MONTHLY").upper()

    if interval_upper == "MONTHLY":
        mrr = amt / Decimal(str(count))
    elif interval_upper == "YEARLY":
        mrr = amt / (Decimal("12.0") * Decimal(str(count)))
    elif interval_upper == "WEEKLY":
        # Average 52 weeks / 12 months = 4.33333 weeks per month
        weekly_amt = amt / Decimal(str(count))
        mrr = (weekly_amt * Decimal("52.0")) / Decimal("12.0")
    elif interval_upper == "DAILY":
        daily_amt = amt / Decimal(str(count))
        mrr = daily_amt * Decimal("30.0")
    else:
        mrr = amt / Decimal(str(count))

    return quantize_money(mrr)

def calculate_arr(mrr: Decimal | float | int | str) -> Decimal:
    """Annual Recurring Revenue is MRR * 12."""
    return quantize_money(quantize_money(mrr) * Decimal("12.0"))

def compute_line_item(unit_price: Decimal | float, additional_price: Decimal | float, quantity: int) -> Decimal:
    price = quantize_money(unit_price) + quantize_money(additional_price)
    return quantize_money(price * Decimal(str(quantity)))

def compute_totals(items, discount_obj=None, tax_rate_obj=None):
    """
    Calculates subtotal, discount, taxable base, tax and final recurring total.
    Returns: (subtotal, discount_amount, taxable_base, tax_amount, total)
    """
    subtotal = Decimal("0.00")
    for item in items:
        unit = quantize_money(item.get("unit_price", 0.00))
        add = quantize_money(item.get("additional_price", 0.00))
        qty = int(item.get("quantity", 1))
        subtotal += quantize_money((unit + add) * Decimal(str(qty)))

    discount_amount = Decimal("0.00")
    if discount_obj and discount_obj.is_active:
        if discount_obj.discount_type == "PERCENTAGE":
            discount_amount = quantize_money((subtotal * quantize_money(discount_obj.discount_value)) / Decimal("100.0"))
        else: # FIXED
            discount_amount = min(subtotal, quantize_money(discount_obj.discount_value))

    taxable_base = max(Decimal("0.00"), subtotal - discount_amount)
    
    tax_amount = Decimal("0.00")
    if tax_rate_obj and tax_rate_obj.is_active:
        rate = Decimal(str(tax_rate_obj.rate_percentage))
        tax_amount = quantize_money((taxable_base * rate) / Decimal("100.0"))

    total = taxable_base + tax_amount
    return subtotal, discount_amount, taxable_base, tax_amount, total
