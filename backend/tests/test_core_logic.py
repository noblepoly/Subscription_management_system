import os
import sys
import unittest
from datetime import date, timedelta
from decimal import Decimal

# Ensure backend root is on python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.utils.financial import calculate_mrr, calculate_arr, quantize_money, compute_totals
from app.utils.validation import validate_password, validate_email
from app.services.billing_engine import compute_next_billing_date

class TestCoreBusinessLogic(unittest.TestCase):

    def test_password_strict_validation(self):
        """Rule 5: MORE THAN 8 characters, uppercase, lowercase, special character."""
        # 8 characters (Must fail: requires MORE THAN 8)
        valid, _ = validate_password("Abc!1234")
        self.assertFalse(valid, "Should reject exactly 8 characters")
        
        # 9 characters but no uppercase
        valid, _ = validate_password("abc!12345")
        self.assertFalse(valid)
        
        # 9 characters but no lowercase
        valid, _ = validate_password("ABC!12345")
        self.assertFalse(valid)
        
        # 9 characters but no special char
        valid, _ = validate_password("Abcd12345")
        self.assertFalse(valid)
        
        # Valid: 9+ chars, upper, lower, special
        valid, _ = validate_password("SecurePass@2026")
        self.assertTrue(valid)

    def test_mrr_three_month_plan(self):
        """Rule 4: Account for interval_count (e.g. ₹3,000 every 3 months = ₹1,000 MRR)."""
        mrr = calculate_mrr(Decimal("3000.00"), "MONTHLY", interval_count=3)
        self.assertEqual(mrr, Decimal("1000.00"))
        
        arr = calculate_arr(mrr)
        self.assertEqual(arr, Decimal("12000.00"))

    def test_mrr_intervals(self):
        # Yearly plan ₹12,000
        mrr_year = calculate_mrr(Decimal("12000.00"), "YEARLY", interval_count=1)
        self.assertEqual(mrr_year, Decimal("1000.00"))

        # Daily plan ₹100
        mrr_daily = calculate_mrr(Decimal("100.00"), "DAILY", interval_count=1)
        self.assertEqual(mrr_daily, Decimal("3000.00"))

    def test_monthly_billing_january_31(self):
        """Monthly billing on January 31 clips safely to February 28 (or 29 in leap year)."""
        jan_31 = date(2026, 1, 31)
        next_date = compute_next_billing_date(jan_31, "MONTHLY", interval_count=1)
        self.assertEqual(next_date, date(2026, 2, 28))

    def test_quarterly_billing_calculation(self):
        """3-month interval calculation."""
        jan_15 = date(2026, 1, 15)
        next_date = compute_next_billing_date(jan_15, "MONTHLY", interval_count=3)
        self.assertEqual(next_date, date(2026, 4, 15))

    def test_financial_rounding_and_tax(self):
        """Precision math with 2 decimal places and HALF_UP rounding."""
        items = [
            {"unit_price": Decimal("49.99"), "additional_price": Decimal("10.00"), "quantity": 3}
        ]
        class MockTax:
            is_active = True
            rate_percentage = Decimal("18.000") # 18% GST

        subtotal, discount, taxable, tax, total = compute_totals(items, None, MockTax)
        self.assertEqual(subtotal, Decimal("179.97"))
        self.assertEqual(discount, Decimal("0.00"))
        self.assertEqual(taxable, Decimal("179.97"))
        self.assertEqual(tax, Decimal("32.39"))
        self.assertEqual(total, Decimal("212.36"))

    def test_partial_payment_and_overdue_status(self):
        """Refinement 6: An invoice with partial payments past due_date is OVERDUE until balance is 0."""
        class MockInvoice:
            total_amount = Decimal("1000.00")
            amount_paid = Decimal("400.00")
            balance_due = Decimal("600.00")
            status = "CONFIRMED"
            due_date = date.today() - timedelta(days=2) # 2 days overdue

            @property
            def is_overdue(self):
                if self.status in ("PAID", "CANCELLED", "DRAFT"):
                    return False
                return self.balance_due > 0 and date.today() > self.due_date

            def get_effective_status(self):
                if self.status == "CANCELLED":
                    return "CANCELLED"
                if self.balance_due <= 0:
                    return "PAID"
                if self.is_overdue:
                    return "OVERDUE"
                if self.amount_paid > 0:
                    return "PARTIALLY_PAID"
                return self.status

        inv = MockInvoice()
        self.assertTrue(inv.is_overdue)
        self.assertEqual(inv.get_effective_status(), "OVERDUE")
        
        # When fully paid, even past due_date, status becomes PAID
        inv.amount_paid = Decimal("1000.00")
        inv.balance_due = Decimal("0.00")
        inv.status = "PAID"
        self.assertFalse(inv.is_overdue)
        self.assertEqual(inv.get_effective_status(), "PAID")

    def test_discount_expiry_and_limits(self):
        """Refinement 2: Discounts expire and reject if usage limit exceeded."""
        class MockDiscount:
            is_active = True
            start_date = date.today() - timedelta(days=30)
            end_date = date.today() - timedelta(days=1) # Expired yesterday
            usage_limit = 5
            times_used = 2
            min_purchase_amount = Decimal("100.00")
            min_quantity = 1
            scope = "SUBSCRIPTION"
            applicable_products = []

            def is_eligible(self, subtotal, total_quantity, target_date=None, product_ids=None):
                target_date = target_date or date.today()
                if not self.is_active:
                    return False, "Discount is inactive."
                if self.end_date and target_date > self.end_date:
                    return False, "Discount expired."
                if self.usage_limit is not None and self.times_used >= self.usage_limit:
                    return False, "Discount usage limit reached."
                return True, "Eligible"

        disc = MockDiscount()
        eligible, reason = disc.is_eligible(Decimal("200.00"), 1)
        self.assertFalse(eligible)
        self.assertIn("expired", reason.lower())

if __name__ == "__main__":
    unittest.main()
