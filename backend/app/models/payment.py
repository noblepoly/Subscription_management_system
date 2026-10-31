import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, Numeric, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.db import Base

class Payment(Base):
    __tablename__ = "payments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    payment_number = Column(String(50), unique=True, nullable=False, index=True)
    invoice_id = Column(UUID(as_uuid=True), ForeignKey("invoices.id", ondelete="RESTRICT"), nullable=False, index=True)
    customer_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    recorded_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    amount = Column(Numeric(12, 2), nullable=False)
    payment_method = Column(String(50), nullable=False, default="BANK_TRANSFER") # BANK_TRANSFER, CASH, CHEQUE, ONLINE_MOCK_SIMULATED
    payment_status = Column(String(30), nullable=False, default="CONFIRMED") # CONFIRMED, PENDING_VERIFICATION
    transaction_reference = Column(String(120), nullable=True)
    payment_date = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    invoice = relationship("Invoice", back_populates="payments")
    customer = relationship("User", foreign_keys=[customer_id], back_populates="payments")
    recorder = relationship("User", foreign_keys=[recorded_by])

    def to_dict(self):
        return {
            "id": str(self.id),
            "payment_number": self.payment_number,
            "invoice_id": str(self.invoice_id),
            "invoice_number": self.invoice.invoice_number if self.invoice else None,
            "customer_id": str(self.customer_id),
            "customer_name": self.customer.full_name if self.customer else None,
            "recorded_by": str(self.recorded_by) if self.recorded_by else None,
            "recorder_name": self.recorder.full_name if self.recorder else "System / Online Simulation",
            "amount": float(self.amount),
            "payment_method": self.payment_method,
            "payment_status": self.payment_status,
            "transaction_reference": self.transaction_reference,
            "payment_date": self.payment_date.isoformat() if self.payment_date else None,
            "notes": self.notes
        }
