from collections import Counter
import json
import os
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from database.database import get_db
from models.user import User
from models.prediction import Prediction
from models.report import Report
from schemas import (
    LoginRequest, TokenResponse, UserResponse,
    AdminUserItem, AdminDashboardStats, AdminDiseaseAnalytics
)
from security import oauth2_scheme, decode_access_token, verify_password, create_access_token

router = APIRouter(prefix="/api/admin", tags=["admin"])

def get_current_admin(
    credentials: HTTPAuthorizationCredentials = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    forbidden_exception = HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Admin privileges required"
    )

    if not credentials:
        raise credentials_exception

    token = credentials.credentials
    payload = decode_access_token(token)

    if payload is None:
        raise credentials_exception

    user_id = payload.get("sub")
    role = payload.get("role")

    if user_id is None or role != "admin":
        raise forbidden_exception

    try:
        user_id = int(user_id)
    except (TypeError, ValueError):
        raise credentials_exception

    user = db.query(User).filter(User.id == user_id).first()

    if user is None or not getattr(user, "is_admin", False):
        raise forbidden_exception

    return user

@router.post("/login", response_model=TokenResponse)
def admin_login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email.lower()).first()
    if not user or not verify_password(payload.password, user.password_hash) or not getattr(user, "is_admin", False):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid admin credentials")

    token = create_access_token({"sub": str(user.id), "role": "admin"})
    return TokenResponse(access_token=token, user=UserResponse.model_validate(user))

@router.post("/logout")
def admin_logout(current_admin: User = Depends(get_current_admin)):
    return {"message": "Admin logged out successfully"}

@router.get("/me", response_model=UserResponse)
def admin_me(current_admin: User = Depends(get_current_admin)):
    return UserResponse.model_validate(current_admin)

@router.get("/dashboard/stats", response_model=AdminDashboardStats)
def dashboard_stats(current_admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    total_users = db.query(User).count()
    total_predictions = db.query(Prediction).count()
    total_reports = db.query(Report).count()
    
    predictions = db.query(Prediction).order_by(Prediction.created_at.desc()).all()
    disease_counts = Counter(p.predicted_class for p in predictions)
    avg_confidence = round(sum(p.confidence for p in predictions) / len(predictions), 2) if predictions else 0.0
    
    recent = [
        {
            "id": p.id,
            "user_email": p.user.email if p.user else "Unknown",
            "predicted_class": p.predicted_class,
            "confidence": p.confidence,
            "created_at": p.created_at.isoformat(),
        }
        for p in predictions[:5]
    ]
    
    return AdminDashboardStats(
        total_users=total_users,
        total_predictions=total_predictions,
        total_reports=total_reports,
        average_confidence=avg_confidence,
        disease_counts=dict(disease_counts),
        recent_predictions=recent
    )

@router.get("/users")
def get_users(q: str = Query(None), current_admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    query = db.query(User)
    if q:
        search = f"%{q}%"
        query = query.filter(User.name.ilike(search) | User.email.ilike(search))
    
    users = query.order_by(User.created_at.desc()).all()
    
    result = []
    for user in users:
        result.append(AdminUserItem(
            id=user.id,
            name=user.name,
            email=user.email,
            created_at=user.created_at,
            prediction_count=len(user.predictions)
        ))
    return result

@router.get("/disease-analytics", response_model=AdminDiseaseAnalytics)
def disease_analytics(current_admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    predictions = db.query(Prediction).all()
    disease_counts = Counter(p.predicted_class for p in predictions)
    
    confidence_sum = Counter()
    confidence_count = Counter()
    
    trends = Counter()
    
    for p in predictions:
        confidence_sum[p.predicted_class] += p.confidence
        confidence_count[p.predicted_class] += 1
        month_key = p.created_at.strftime("%Y-%m")
        trends[month_key] += 1
        
    confidence_stats = {
        cls: round(confidence_sum[cls] / confidence_count[cls], 2)
        for cls in confidence_count
    }
    
    return AdminDiseaseAnalytics(
        disease_counts=dict(disease_counts),
        confidence_stats=confidence_stats,
        predictions_by_month=dict(trends)
    )


@router.get("/predictions")
def get_predictions(
    q: str = Query(None),
    model_used: str = Query(None),
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    query = db.query(Prediction).join(User).order_by(Prediction.created_at.desc())
    if q:
        search = f"%{q}%"
        query = query.filter(
            User.name.ilike(search)
            | User.email.ilike(search)
            | Prediction.predicted_class.ilike(search)
        )
    if model_used:
        query = query.filter(Prediction.model_used == model_used)

    return [
        {
            "id": prediction.id,
            "user_name": prediction.user.name if prediction.user else "Unknown",
            "user_email": prediction.user.email if prediction.user else "Unknown",
            "predicted_class": prediction.predicted_class,
            "confidence": prediction.confidence,
            "model_used": prediction.model_used,
            "ndvi_mean": prediction.ndvi_mean,
            "created_at": prediction.created_at.isoformat(),
        }
        for prediction in query.all()
    ]


def _load_model_summary():
    summary_path = Path(__file__).resolve().parents[1] / "ml_artifacts" / "model_summary.json"
    if not summary_path.is_file():
        return None
    try:
        with summary_path.open(encoding="utf-8") as summary_file:
            return json.load(summary_file)
    except (OSError, json.JSONDecodeError):
        return None


@router.get("/model-performance")
def model_performance(current_admin: User = Depends(get_current_admin)):
    summary = _load_model_summary()
    if not summary:
        return {"available": False, "message": "Performance metrics not available"}

    metrics = {}
    metric_labels = {
        "test_accuracy": "Test accuracy",
        "cv_mean_accuracy": "Cross-validation accuracy",
        "cv_std_accuracy": "Cross-validation standard deviation",
        "rgb_only_test_accuracy": "RGB-only test accuracy",
    }
    for key, label in metric_labels.items():
        value = summary.get(key)
        if isinstance(value, (int, float)):
            metrics[key] = {"label": label, "value": value}

    return {
        "available": bool(metrics),
        "model": summary.get("final_model", "Not available"),
        "feature_set": summary.get("feature_set", "Not available"),
        "n_features": summary.get("n_features", "Not available"),
        "metrics": metrics,
        "message": None if metrics else "Performance metrics not available",
    }


def _dataset_class_counts(dataset_root: Path):
    if not dataset_root.is_dir():
        return None, None
    class_counts = {}
    total = 0
    for class_dir in sorted(path for path in dataset_root.iterdir() if path.is_dir()):
        count = sum(1 for path in class_dir.rglob("*") if path.is_file())
        class_counts[class_dir.name] = count
        total += count
    return class_counts, total


@router.get("/dataset-stats")
def dataset_stats(current_admin: User = Depends(get_current_admin)):
    project_root = Path(__file__).resolve().parents[2]
    class_counts, total_images = _dataset_class_counts(
        project_root / "training_testing" / "Preprocessed" / "RGB"
    )
    summary = _load_model_summary() or {}
    return {
        "available": class_counts is not None,
        "dataset_path": "training_testing/Preprocessed/RGB" if class_counts is not None else "Not available",
        "total_images": total_images if total_images is not None else "Not available",
        "class_counts": class_counts if class_counts is not None else {},
        "classes": list(class_counts) if class_counts is not None else [],
        "train_size": summary.get("train_size", "Not available"),
        "val_size": summary.get("val_size", "Not available"),
        "test_size": summary.get("test_size", "Not available"),
    }


@router.get("/reports")
def get_reports(
    q: str = Query(None),
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    query = (
        db.query(Report)
        .join(User)
        .outerjoin(Prediction)
        .order_by(Report.created_at.desc())
    )
    if q:
        search = f"%{q}%"
        query = query.filter(
            User.name.ilike(search)
            | User.email.ilike(search)
            | Prediction.predicted_class.ilike(search)
        )

    return [
        {
            "id": report.id,
            "prediction_id": report.prediction_id,
            "user_name": report.user.name if report.user else "Unknown",
            "user_email": report.user.email if report.user else "Unknown",
            "predicted_class": report.prediction.predicted_class if report.prediction else "Not available",
            "confidence": report.prediction.confidence if report.prediction else None,
            "created_at": report.created_at.isoformat(),
            "status": "Available" if os.path.isfile(report.report_path) else "File missing",
            "type": "PDF" if report.report_path.lower().endswith(".pdf") else "Report",
        }
        for report in query.all()
    ]
