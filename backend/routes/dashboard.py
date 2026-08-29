from collections import Counter

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database.database import get_db
from models.prediction import Prediction
from models.user import User
from security import get_current_user

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get(
    "/stats",
    summary="Get the current authenticated user's dashboard statistics",
    description="Returns totals, disease-class breakdown, and the most recent analyses for the logged-in "
    "user only -- no data from other users is exposed.",
)
def dashboard_stats(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    predictions = (
        db.query(Prediction)
        .filter(Prediction.user_id == current_user.id)
        .order_by(Prediction.created_at.desc())
        .all()
    )

    total = len(predictions)
    disease_counts = Counter(p.predicted_class for p in predictions)
    avg_confidence = round(sum(p.confidence for p in predictions) / total, 2) if total else 0.0

    recent = [
        {
            "id": p.id,
            "predicted_class": p.predicted_class,
            "confidence": p.confidence,
            "created_at": p.created_at.isoformat(),
        }
        for p in predictions[:5]
    ]

    return {
        "total_analyses": total,
        "disease_counts": dict(disease_counts),
        "recent_predictions": recent,
        "average_confidence": avg_confidence,
    }
