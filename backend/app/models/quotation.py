import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Boolean, DateTime, Integer, Numeric, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.db import Base

class QuotationTemplate(Base):
    __tablename__ = "quotation_templates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(150), nullable=False)
    description = Column(Text, nullable=True)
    plan_id = Column(UUID(as_uuid=True), ForeignKey("subscription_plans.id", ondelete="SET NULL"), nullable=True)
    default_validity_days = Column(Integer, nullable=False, default=30)
    terms_and_conditions = Column(Text, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    plan = relationship("SubscriptionPlan")
    creator = relationship("User", foreign_keys=[created_by])
    items = relationship("QuotationTemplateItem", back_populates="template", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": str(self.id),
            "name": self.name,
            "description": self.description,
            "plan_id": str(self.plan_id) if self.plan_id else None,
            "plan": self.plan.to_dict() if self.plan else None,
            "default_validity_days": self.default_validity_days,
            "terms_and_conditions": self.terms_and_conditions,
            "is_active": self.is_active,
            "items": [item.to_dict() for item in self.items]
        }

class QuotationTemplateItem(Base):
    __tablename__ = "quotation_template_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    template_id = Column(UUID(as_uuid=True), ForeignKey("quotation_templates.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    variant_id = Column(UUID(as_uuid=True), ForeignKey("product_variants.id", ondelete="SET NULL"), nullable=True)
    quantity = Column(Integer, nullable=False, default=1)
    override_unit_price = Column(Numeric(12, 2), nullable=True)

    template = relationship("QuotationTemplate", back_populates="items")
    product = relationship("Product")
    variant = relationship("ProductVariant")

    def to_dict(self):
        return {
            "id": str(self.id),
            "product_id": str(self.product_id),
            "product_name": self.product.name if self.product else None,
            "variant_id": str(self.variant_id) if self.variant_id else None,
            "variant_name": self.variant.variant_name if self.variant else None,
            "quantity": self.quantity,
            "override_unit_price": float(self.override_unit_price) if self.override_unit_price is not None else None
        }
