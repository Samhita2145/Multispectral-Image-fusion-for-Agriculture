import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from database.database import get_db
from models.prediction import Prediction
from models.report import Report
from models.user import User
from security import get_current_user
from services.report_service import generate_report_pdf
from utils import user_reports_subdir

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.post(
    "/{prediction_id}",
    summary="Generate a PDF report for a prediction",
    status_code=status.HTTP_201_CREATED,
)
def create_report(
    prediction_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    prediction = db.query(Prediction).filter(Prediction.id == prediction_id).first()
    if not prediction:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prediction not found")
    if prediction.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You may only report on your own predictions")

    reports_dir = user_reports_subdir(current_user.id)
    filename = f"{uuid.uuid4().hex}.pdf"
    output_path = os.path.join(reports_dir, filename)

    generate_report_pdf(
        output_path,
        user_name=current_user.name,
        user_email=current_user.email,
        prediction=prediction,
    )

    report = Report(user_id=current_user.id, prediction_id=prediction_id, report_path=output_path)
    db.add(report)
    db.commit()
    db.refresh(report)

    return {
        "id": report.id,
        "prediction_id": prediction_id,
        "created_at": report.created_at.isoformat(),
        "download_url": f"/api/reports/{report.id}/download",
    }


@router.get(
    "",
    summary="List the current user's generated reports",
)
def list_reports(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    reports = (
        db.query(Report).filter(Report.user_id == current_user.id).order_by(Report.created_at.desc()).all()
    )
    items = []
    for r in reports:
        rgb_url = None
        pred = r.prediction
        if pred and pred.rgb_image_path and os.path.isfile(pred.rgb_image_path):
            rgb_url = f"/api/predictions/files/{pred.user_id}/{os.path.basename(pred.rgb_image_path)}"
        items.append(
            {
                "id": r.id,
                "prediction_id": r.prediction_id,
                "created_at": r.created_at.isoformat(),
                "predicted_class": pred.predicted_class if pred else None,
                "confidence": pred.confidence if pred else None,
                "download_url": f"/api/reports/{r.id}/download",
                "rgb_image_url": rgb_url,
            }
        )
    return items


@router.get(
    "/{report_id}/download",
    summary="Download a report PDF",
)
def download_report(
    report_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    if report.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You may only access your own reports")
    if not os.path.isfile(report.report_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report file is missing on disk")

    return FileResponse(
        report.report_path,
        media_type="application/pdf",
        filename=f"analysis-report-{report.prediction_id}.pdf",
    )
