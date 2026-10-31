import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Boolean, DateTime, Text, Numeric, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.db import Base

class Product(Base):
    __tablename__ = "products"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(150), nullable=False)
    product_type = Column(String(50), nullable=False, default="SOFTWARE") # SOFTWARE, SERVICE, PHYSICAL, CONSUMABLE
    sales_price = Column(Numeric(12, 2), nullable=False, default=0.00)
    cost_price = Column(Numeric(12, 2), nullable=False, default=0.00)
    description = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    variants = relationship("ProductVariant", back_populates="product", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": str(self.id),
            "name": self.name,
            "product_type": self.product_type,
            "sales_price": float(self.sales_price),
            "cost_price": float(self.cost_price),
            "description": self.description,
            "notes": self.notes,
            "is_active": self.is_active,
            "variants": [v.to_dict() for v in self.variants if v.is_active],
            "created_at": self.created_at.isoformat() if self.created_at else None
        }

class ProductVariant(Base):
    __tablename__ = "product_variants"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    variant_name = Column(String(100), nullable=False)
    sku = Column(String(64), unique=True, nullable=True)
    additional_price = Column(Numeric(12, 2), nullable=False, default=0.00)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint('product_id', 'variant_name', name='uq_product_variant'),
    )

    product = relationship("Product", back_populates="variants")

    def to_dict(self):
        return {
            "id": str(self.id),
            "product_id": str(self.product_id),
            "variant_name": self.variant_name,
            "sku": self.sku,
            "additional_price": float(self.additional_price),
            "is_active": self.is_active
        }
