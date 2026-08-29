from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from database.database import Base


class Prediction(Base):
    __tablename__ = "predictions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    predicted_class = Column(String(100), nullable=False)
    confidence = Column(Float, nullable=False)
    class_probabilities = Column(Text, nullable=False)  # JSON-encoded dict

    model_used = Column(String(20), nullable=False, default="rgb_only")  # "fusion" | "rgb_only"

    rgb_image_path = Column(String(500), nullable=True)
    nir_image_path = Column(String(500), nullable=True)
    ndvi_heatmap_path = Column(String(500), nullable=True)

    ndvi_min = Column(Float, nullable=True)
    ndvi_max = Column(Float, nullable=True)
    ndvi_mean = Column(Float, nullable=True)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)

    user = relationship("User", back_populates="predictions")
    reports = relationship("Report", back_populates="prediction", cascade="all, delete-orphan")
