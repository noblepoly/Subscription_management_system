import uuid
from datetime import datetime, timezone, date
from sqlalchemy import Column, String, DateTime, Date, Integer, Numeric, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.db import Base

class Subscription(Base):
    __tablename__ = "subscriptions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    subscription_number = Column(String(50), unique=True, nullable=False, index=True)
    customer_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    plan_id = Column(UUID(as_uuid=True), ForeignKey("subscription_plans.id", ondelete="RESTRICT"), nullable=False)
    template_id = Column(UUID(as_uuid=True), ForeignKey("quotation_templates.id", ondelete="SET NULL"), nullable=True)
    discount_id = Column(UUID(as_uuid=True), ForeignKey("discounts.id", ondelete="SET NULL"), nullable=True)
    tax_rate_id = Column(UUID(as_uuid=True), ForeignKey("tax_rates.id", ondelete="SET NULL"), nullable=True)
    
    # Statuses: DRAFT, QUOTATION, CONFIRMED, ACTIVE, PAUSED, CLOSED, CANCELLED
    status = Column(String(20), nullable=False, default="DRAFT", index=True)
    quotation_valid_until = Column(Date, nullable=True)
    start_date = Column(DateTime(timezone=True), nullable=True)
    expiry_date = Column(DateTime(timezone=True), nullable=True)
    next_billing_date = Column(DateTime(timezone=True), nullable=True, index=True)
    last_billed_date = Column(DateTime(timezone=True), nullable=True)
    paused_at = Column(DateTime(timezone=True), nullable=True)
    closed_at = Column(DateTime(timezone=True), nullable=True)
    closure_reason = Column(Text, nullable=True)
    
    subtotal = Column(Numeric(12, 2), nullable=False, default=0.00)
    discount_amount = Column(Numeric(12, 2), nullable=False, default=0.00)
    tax_amount = Column(Numeric(12, 2), nullable=False, default=0.00)
    recurring_total = Column(Numeric(12, 2), nullable=False, default=0.00)
    notes = Column(Text, nullable=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    customer = relationship("User", foreign_keys=[customer_id], back_populates="subscriptions")
    creator = relationship("User", foreign_keys=[created_by])
    plan = relationship("SubscriptionPlan", back_populates="subscriptions")
    discount = relationship("Discount")
    tax_rate = relationship("TaxRate")
    items = relationship("SubscriptionItem", back_populates="subscription", cascade="all, delete-orphan")
    invoices = relationship("Invoice", back_populates="subscription")

    VALID_TRANSITIONS = {
        "DRAFT": ["QUOTATION", "CANCELLED"],
        "QUOTATION": ["CONFIRMED", "CANCELLED"],
        "CONFIRMED": ["ACTIVE", "CANCELLED"],
        "ACTIVE": ["PAUSED", "CLOSED"],
        "PAUSED": ["ACTIVE", "CLOSED"],
        "CLOSED": [], # Terminal
        "CANCELLED": [] # Terminal
    }

    def can_transition_to(self, new_status: str) -> bool:
        return new_status in self.VALID_TRANSITIONS.get(self.status, [])

    def to_dict(self):
        return {
            "id": str(self.id),
            "subscription_number": self.subscription_number,
            "customer_id": str(self.customer_id),
            "customer_name": self.customer.full_name if self.customer else None,
            "customer_email": self.customer.email if self.customer else None,
            "plan_id": str(self.plan_id),
            "plan_name": self.plan.name if self.plan else None,
            "billing_interval": self.plan.billing_interval if self.plan else None,
            "interval_count": self.plan.interval_count if self.plan else 1,
            "status": self.status,
            "quotation_valid_until": self.quotation_valid_until.isoformat() if self.quotation_valid_until else None,
            "start_date": self.start_date.isoformat() if self.start_date else None,
            "expiry_date": self.expiry_date.isoformat() if self.expiry_date else None,
            "next_billing_date": self.next_billing_date.isoformat() if self.next_billing_date else None,
            "last_billed_date": self.last_billed_date.isoformat() if self.last_billed_date else None,
            "paused_at": self.paused_at.isoformat() if self.paused_at else None,
            "closed_at": self.closed_at.isoformat() if self.closed_at else None,
            "closure_reason": self.closure_reason,
            "subtotal": float(self.subtotal),
            "discount_amount": float(self.discount_amount),
            "tax_amount": float(self.tax_amount),
            "recurring_total": float(self.recurring_total),
            "notes": self.notes,
            "items": [item.to_dict() for item in self.items],
            "created_at": self.created_at.isoformat() if self.created_at else None
        }

class SubscriptionItem(Base):
    __tablename__ = "subscription_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    subscription_id = Column(UUID(as_uuid=True), ForeignKey("subscriptions.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id", ondelete="RESTRICT"), nullable=False)
    variant_id = Column(UUID(as_uuid=True), ForeignKey("product_variants.id", ondelete="SET NULL"), nullable=True)
    quantity = Column(Integer, nullable=False, default=1)
    unit_price = Column(Numeric(12, 2), nullable=False)
    additional_price = Column(Numeric(12, 2), nullable=False, default=0.00)
    line_total = Column(Numeric(12, 2), nullable=False)

    subscription = relationship("Subscription", back_populates="items")
    product = relationship("Product")
    variant = relationship("ProductVariant")

    def to_dict(self):
        return {
            "id": str(self.id),
            "subscription_id": str(self.subscription_id),
            "product_id": str(self.product_id),
            "product_name": self.product.name if self.product else None,
            "variant_id": str(self.variant_id) if self.variant_id else None,
            "variant_name": self.variant.variant_name if self.variant else None,
            "quantity": self.quantity,
            "unit_price": float(self.unit_price),
            "additional_price": float(self.additional_price),
            "line_total": float(self.line_total)
        }
