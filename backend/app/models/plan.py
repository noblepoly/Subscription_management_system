import uuid
from datetime import datetime, timezone, date
from sqlalchemy import Column, String, Boolean, DateTime, Date, Integer, Numeric
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.db import Base

class SubscriptionPlan(Base):
    __tablename__ = "subscription_plans"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(120), nullable=False)
    billing_interval = Column(String(20), nullable=False, default="MONTHLY") # DAILY, WEEKLY, MONTHLY, YEARLY
    interval_count = Column(Integer, nullable=False, default=1) # e.g. 3 for quarterly (every 3 months)
    minimum_quantity = Column(Integer, nullable=False, default=1)
    base_price = Column(Numeric(12, 2), nullable=False, default=0.00)
    available_from = Column(Date, nullable=False, default=date.today)
    available_to = Column(Date, nullable=True)
    auto_close = Column(Boolean, nullable=False, default=False)
    auto_close_days = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    subscriptions = relationship("Subscription", back_populates="plan")

    def to_dict(self):
        return {
            "id": str(self.id),
            "name": self.name,
            "billing_interval": self.billing_interval,
            "interval_count": self.interval_count,
            "minimum_quantity": self.minimum_quantity,
            "base_price": float(self.base_price),
            "available_from": self.available_from.isoformat() if self.available_from else None,
            "available_to": self.available_to.isoformat() if self.available_to else None,
            "auto_close": self.auto_close,
            "auto_close_days": self.auto_close_days,
            "is_active": self.is_active
        }
