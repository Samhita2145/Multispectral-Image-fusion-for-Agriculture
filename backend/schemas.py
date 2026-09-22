import re
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, EmailStr, field_validator

PASSWORD_MIN_LEN = 8


class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 2:
            raise ValueError("Name must be at least 2 characters long")
        return v

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < PASSWORD_MIN_LEN:
            raise ValueError(f"Password must be at least {PASSWORD_MIN_LEN} characters long")
        if not re.search(r"[A-Za-z]", v) or not re.search(r"[0-9]", v):
            raise ValueError("Password must contain at least one letter and one number")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserResponse"


class UserResponse(BaseModel):
    id: int
    name: str
    email: str
    created_at: datetime

    class Config:
        from_attributes = True


class NDVIResponse(BaseModel):
    minimum: Optional[float] = None
    maximum: Optional[float] = None
    mean: Optional[float] = None
    std: Optional[float] = None
    median: Optional[float] = None
    heatmap_url: Optional[str] = None
    available: bool = False
    note: Optional[str] = None


class PredictionResponse(BaseModel):
    prediction_id: int
    predicted_class: str
    confidence: float
    probabilities: Dict[str, float]
    ndvi: NDVIResponse
    model_used: str
    features: Dict[str, float]
    created_at: datetime


class HistoryItem(BaseModel):
    id: int
    predicted_class: str
    confidence: float
    model_used: str
    ndvi_mean: Optional[float] = None
    created_at: datetime
    rgb_image_url: Optional[str] = None

    class Config:
        from_attributes = True


class ReportResponse(BaseModel):
    id: int
    prediction_id: int
    created_at: datetime
    download_url: str

    class Config:
        from_attributes = True


class DashboardStats(BaseModel):
    total_analyses: int
    disease_counts: Dict[str, int]
    recent_predictions: list
    average_confidence: float


class ChatMessage(BaseModel):
    role: str  # 'user', 'assistant', 'bot', 'system'
    content: str


class ChatRequest(BaseModel):
    message: str
    history: Optional[List[ChatMessage]] = None
    context: Optional[Dict[str, Any]] = None

    @field_validator("message")
    @classmethod
    def message_not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Message cannot be empty")
        return v


class ChatResponse(BaseModel):
    reply: str
    provider: Optional[str] = None
    model: Optional[str] = None


TokenResponse.model_rebuild()


class AdminUserItem(BaseModel):
    id: int
    name: str
    email: str
    created_at: datetime
    prediction_count: int

    class Config:
        from_attributes = True


class AdminDashboardStats(BaseModel):
    total_users: int
    total_predictions: int
    total_reports: int
    average_confidence: float
    disease_counts: Dict[str, int]
    recent_predictions: list


class AdminDiseaseAnalytics(BaseModel):
    disease_counts: Dict[str, int]
    confidence_stats: Dict[str, float]
    predictions_by_month: Dict[str, int]
