import uuid
from datetime import datetime, timezone, date
from sqlalchemy import Column, String, DateTime, Date, Integer, Numeric, Text, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.db import Base

class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    invoice_number = Column(String(50), unique=True, nullable=False, index=True)
    subscription_id = Column(UUID(as_uuid=True), ForeignKey("subscriptions.id", ondelete="RESTRICT"), nullable=False)
    customer_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    
    # Statuses: DRAFT, CONFIRMED, PARTIALLY_PAID, PAID, OVERDUE, CANCELLED
    status = Column(String(20), nullable=False, default="DRAFT", index=True)
    billing_period_start = Column(Date, nullable=False)
    billing_period_end = Column(Date, nullable=False)
    invoice_date = Column(Date, nullable=False, default=date.today)
    due_date = Column(Date, nullable=False, index=True)
    
    subtotal = Column(Numeric(12, 2), nullable=False, default=0.00)
    discount_amount = Column(Numeric(12, 2), nullable=False, default=0.00)
    tax_amount = Column(Numeric(12, 2), nullable=False, default=0.00)
    total_amount = Column(Numeric(12, 2), nullable=False, default=0.00)
    amount_paid = Column(Numeric(12, 2), nullable=False, default=0.00)
    balance_due = Column(Numeric(12, 2), nullable=False, default=0.00)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint('subscription_id', 'billing_period_start', 'billing_period_end', name='uq_subscription_billing_period'),
    )

    subscription = relationship("Subscription", back_populates="invoices")
    customer = relationship("User", foreign_keys=[customer_id], back_populates="invoices")
    items = relationship("InvoiceItem", back_populates="invoice", cascade="all, delete-orphan")
    payments = relationship("Payment", back_populates="invoice")

    @property
    def is_overdue(self) -> bool:
        if self.status in ("PAID", "CANCELLED", "DRAFT"):
            return False
        return self.balance_due > 0 and date.today() > self.due_date

    def get_effective_status(self) -> str:
        if self.status == "CANCELLED":
            return "CANCELLED"
        if self.balance_due <= 0:
            return "PAID"
        if self.is_overdue:
            return "OVERDUE"
        if self.amount_paid > 0:
            return "PARTIALLY_PAID"
        return self.status

    def to_dict(self):
        eff_status = self.get_effective_status()
        return {
            "id": str(self.id),
            "invoice_number": self.invoice_number,
            "subscription_id": str(self.subscription_id),
            "subscription_number": self.subscription.subscription_number if self.subscription else None,
            "customer_id": str(self.customer_id),
            "customer_name": self.customer.full_name if self.customer else None,
            "customer_email": self.customer.email if self.customer else None,
            "status": eff_status,
            "raw_status": self.status,
            "is_overdue": self.is_overdue,
            "billing_period_start": self.billing_period_start.isoformat() if self.billing_period_start else None,
            "billing_period_end": self.billing_period_end.isoformat() if self.billing_period_end else None,
            "invoice_date": self.invoice_date.isoformat() if self.invoice_date else None,
            "due_date": self.due_date.isoformat() if self.due_date else None,
            "subtotal": float(self.subtotal),
            "discount_amount": float(self.discount_amount),
            "tax_amount": float(self.tax_amount),
            "total_amount": float(self.total_amount),
            "amount_paid": float(self.amount_paid),
            "balance_due": float(self.balance_due),
            "notes": self.notes,
            "items": [item.to_dict() for item in self.items],
            "payments": [p.to_dict() for p in self.payments],
            "created_at": self.created_at.isoformat() if self.created_at else None
        }

class InvoiceItem(Base):
    __tablename__ = "invoice_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    invoice_id = Column(UUID(as_uuid=True), ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False, index=True)
    product_name = Column(String(150), nullable=False)
    variant_name = Column(String(100), nullable=True)
    quantity = Column(Integer, nullable=False, default=1)
    
    # Financial snapshots for full immutability (Refinement 1)
    applied_unit_price = Column(Numeric(12, 2), nullable=False)
    applied_additional_price = Column(Numeric(12, 2), nullable=False, default=0.00)
    discount_allocation = Column(Numeric(12, 2), nullable=False, default=0.00)
    tax_rate = Column(Numeric(6, 3), nullable=False, default=0.000)
    tax_amount = Column(Numeric(12, 2), nullable=False, default=0.00)
    line_total = Column(Numeric(12, 2), nullable=False)

    invoice = relationship("Invoice", back_populates="items")

    def to_dict(self):
        return {
            "id": str(self.id),
            "invoice_id": str(self.invoice_id),
            "product_name": self.product_name,
            "variant_name": self.variant_name,
            "quantity": self.quantity,
            "applied_unit_price": float(self.applied_unit_price),
            "applied_additional_price": float(self.applied_additional_price),
            "discount_allocation": float(self.discount_allocation),
            "tax_rate": float(self.tax_rate),
            "tax_amount": float(self.tax_amount),
            "line_total": float(self.line_total)
        }
