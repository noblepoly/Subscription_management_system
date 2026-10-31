import uuid
from datetime import datetime, timezone, date
from sqlalchemy import Column, String, Boolean, DateTime, Date, Integer, Numeric, Text, ForeignKey, Table
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.db import Base

class TaxRate(Base):
    __tablename__ = "tax_rates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(80), nullable=False) # e.g. "GST 18%", "Standard VAT 10%"
    rate_percentage = Column(Numeric(6, 3), nullable=False, default=0.000)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "id": str(self.id),
            "name": self.name,
            "rate_percentage": float(self.rate_percentage),
            "is_active": self.is_active
        }

discount_products = Table(
    "discount_products",
    Base.metadata,
    Column("discount_id", UUID(as_uuid=True), ForeignKey("discounts.id", ondelete="CASCADE"), primary_key=True),
    Column("product_id", UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), primary_key=True)
)

class Discount(Base):
    __tablename__ = "discounts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code = Column(String(50), unique=True, nullable=False, index=True)
    description = Column(String(200), nullable=True)
    discount_type = Column(String(20), nullable=False, default="PERCENTAGE") # PERCENTAGE, FIXED
    discount_value = Column(Numeric(12, 2), nullable=False)
    scope = Column(String(20), nullable=False, default="SUBSCRIPTION") # SUBSCRIPTION, PRODUCT
    min_purchase_amount = Column(Numeric(12, 2), nullable=False, default=0.00)
    min_quantity = Column(Integer, nullable=False, default=1)
    start_date = Column(Date, nullable=False, default=date.today)
    end_date = Column(Date, nullable=True)
    usage_limit = Column(Integer, nullable=True) # None = unlimited
    times_used = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    applicable_products = relationship("Product", secondary=discount_products, backref="discounts")

    def is_eligible(self, subtotal, total_quantity, target_date=None, product_ids=None):
        target_date = target_date or date.today()
        if not self.is_active:
            return False, "Discount is inactive."
        if target_date < self.start_date:
            return False, f"Discount not active until {self.start_date}."
        if self.end_date and target_date > self.end_date:
            return False, f"Discount expired on {self.end_date}."
        if self.usage_limit is not None and self.times_used >= self.usage_limit:
            return False, "Discount usage limit reached."
        if subtotal < self.min_purchase_amount:
            return False, f"Minimum purchase of ${self.min_purchase_amount:.2f} required."
        if total_quantity < self.min_quantity:
            return False, f"Minimum quantity of {self.min_quantity} required."
        if self.scope == "PRODUCT" and self.applicable_products:
            eligible_ids = {str(p.id) for p in self.applicable_products}
            if not product_ids or not set(product_ids).intersection(eligible_ids):
                return False, "Discount does not apply to the selected products."
        return True, "Eligible"

    def to_dict(self):
        return {
            "id": str(self.id),
            "code": self.code,
            "description": self.description,
            "discount_type": self.discount_type,
            "discount_value": float(self.discount_value),
            "scope": self.scope,
            "min_purchase_amount": float(self.min_purchase_amount),
            "min_quantity": self.min_quantity,
            "start_date": self.start_date.isoformat() if self.start_date else None,
            "end_date": self.end_date.isoformat() if self.end_date else None,
            "usage_limit": self.usage_limit,
            "times_used": self.times_used,
            "is_active": self.is_active,
            "applicable_product_ids": [str(p.id) for p in self.applicable_products]
        }
