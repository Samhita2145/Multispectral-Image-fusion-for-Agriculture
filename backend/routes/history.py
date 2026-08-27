import json
import os
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from database.database import get_db
from models.prediction import Prediction
from models.user import User
from security import get_current_user

router = APIRouter(prefix="/api/history", tags=["history"])


def _serialize(p: Prediction) -> dict:
    rgb_url = None
    if p.rgb_image_path and os.path.isfile(p.rgb_image_path):
        rgb_url = f"/api/predictions/files/{p.user_id}/{os.path.basename(p.rgb_image_path)}"
    return {
        "id": p.id,
        "predicted_class": p.predicted_class,
        "confidence": p.confidence,
        "probabilities": json.loads(p.class_probabilities),
        "model_used": p.model_used,
        "ndvi_mean": p.ndvi_mean,
        "ndvi_min": p.ndvi_min,
        "ndvi_max": p.ndvi_max,
        "created_at": p.created_at.isoformat(),
        "rgb_image_url": rgb_url,
    }


@router.get(
    "",
    summary="List the current user's prediction history",
    description="Returns the authenticated user's own predictions only, newest first, with pagination.",
)
def get_history(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Prediction).filter(Prediction.user_id == current_user.id).order_by(Prediction.created_at.desc())
    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [_serialize(p) for p in items],
    }


@router.get(
    "/{prediction_id}",
    summary="Get a single prediction from the user's history",
)
def get_history_item(
    prediction_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    p = db.query(Prediction).filter(Prediction.id == prediction_id).first()
    if not p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prediction not found")
    if p.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You may only access your own predictions")
    return _serialize(p)


@router.delete(
    "/{prediction_id}",
    summary="Delete a prediction from the user's history",
)
def delete_history_item(
    prediction_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    p = db.query(Prediction).filter(Prediction.id == prediction_id).first()
    if not p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prediction not found")
    if p.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You may only access your own predictions")
    db.delete(p)
    db.commit()
    return {"message": "Deleted"}
