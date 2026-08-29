import json
import os
from typing import Union

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from database.database import get_db
from models.prediction import Prediction
from models.user import User
from schemas import NDVIResponse, PredictionResponse
from security import get_current_user
from services import ml_service
from services.feature_service import bytes_to_gray, bytes_to_rgb
from services.leaf_validator import NOT_A_RICE_LEAF_MESSAGE, is_probably_rice_leaf
from services.ndvi_service import (
    ndvi_heatmap_png_bytes,
    ndvi_stats,
    rgb_to_pseudo_nir_gray,
)
from utils import UPLOADS_DIR, read_and_validate_image, safe_filename, user_upload_subdir

router = APIRouter(prefix="/api", tags=["prediction"])


@router.post(
    "/predict",
    response_model=PredictionResponse,
    summary="Classify a rice leaf image",
    description=(
        "Runs the trained Gradient Boosting fusion pipeline (feature_fusion_gb_model.joblib) on an RGB image. "
        "If a Pseudo-NIR image is also supplied, full RGB+Pseudo-NIR fusion features and real NDVI statistics "
        "are computed. If only the RGB image is supplied (the current frontend's default flow), the "
        "RGB-only model variant (feature_rgb_only_gb_model.joblib) is used for classification, and NDVI "
        "Mean/Min/Max (+ heatmap) are still computed via the existing NDVI formula using Pseudo-NIR "
        "derived with the same RGB→Pseudo-NIR mapping as the Image Analysis / Fusion preview."
    ),
)
async def predict(
    rgb_image: UploadFile = File(..., description="RGB leaf photo (required)"),
    nir_image: Union[UploadFile, str, None] = File(
        None,
        description="Pseudo-NIR / NIR image, same subject (optional)",
    ),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rgb_bytes = await read_and_validate_image(rgb_image, "rgb_image")

    try:
        rgb = bytes_to_rgb(rgb_bytes)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    # --- Rice-leaf validation gate ---
    # Runs BEFORE disease classification. The classifier below only knows
    # its six trained rice-leaf classes and has no "not a rice leaf" output,
    # so without this check an unrelated photo would still get a confident
    # (but meaningless) disease prediction. This does not change the
    # classification model, labels, or prediction logic for valid images --
    # it only decides whether to call them at all. See services/
    # leaf_validator.py for how the check works and its calibration.
    is_valid_leaf, _leaf_diagnostics = is_probably_rice_leaf(rgb)
    if not is_valid_leaf:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=NOT_A_RICE_LEAF_MESSAGE,
        )

    nir = None
    nir_bytes = None

    # NIR is optional.
    # Swagger may send an empty string when no NIR file is selected,
    # so only process it when it is actually an UploadFile.
    if isinstance(nir_image, UploadFile) and nir_image.filename:
        nir_bytes = await read_and_validate_image(nir_image, "nir_image")

        try:
            nir = bytes_to_gray(nir_bytes)
        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e),
            )

    upload_dir = user_upload_subdir(current_user.id)

    rgb_filename = safe_filename(rgb_image.filename)
    rgb_path = os.path.join(upload_dir, rgb_filename)

    with open(rgb_path, "wb") as f:
        f.write(rgb_bytes)

    nir_path = None

    if nir is not None:
        nir_filename = safe_filename(nir_image.filename)
        nir_path = os.path.join(upload_dir, nir_filename)

        with open(nir_path, "wb") as f:
            f.write(nir_bytes)

    try:
        if nir is not None:
            result = ml_service.predict_fusion(rgb, nir)
        else:
            result = ml_service.predict_rgb_only(rgb)

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Prediction failed: {e}",
        )

    ndvi_response = NDVIResponse(available=False)
    ndvi_heatmap_path = None
    ndvi_min = ndvi_max = ndvi_mean = None

    # NDVI uses the existing compute_ndvi / ndvi_stats path only.
    # Classification above is unchanged: fusion when a real NIR was uploaded,
    # otherwise RGB-only. For RGB-only uploads, Pseudo-NIR is derived with the
    # same frontend preview formula so Mean/Min/Max + heatmap can still be shown.
    rgb_resized = result.pop("_rgb_resized", None)
    nir_resized = result.pop("_nir_resized", None)
    ndvi_note = None

    if nir_resized is None and rgb_resized is not None:
        nir_resized = rgb_to_pseudo_nir_gray(rgb_resized)
        ndvi_note = (
            "NDVI computed using Pseudo-NIR derived from the uploaded RGB "
            "(same mapping as the Image Analysis / Fusion preview)."
        )

    if rgb_resized is not None and nir_resized is not None:
        stats = ndvi_stats(rgb_resized, nir_resized)

        ndvi_min = stats["minimum"]
        ndvi_max = stats["maximum"]
        ndvi_mean = stats["mean"]

        heatmap_bytes = ndvi_heatmap_png_bytes(
            rgb_resized,
            nir_resized,
        )

        heatmap_filename = safe_filename("ndvi_heatmap.png")
        ndvi_heatmap_path = os.path.join(
            upload_dir,
            heatmap_filename,
        )

        with open(ndvi_heatmap_path, "wb") as f:
            f.write(heatmap_bytes)

        ndvi_response = NDVIResponse(
            minimum=stats["minimum"],
            maximum=stats["maximum"],
            mean=stats["mean"],
            std=stats["std"],
            median=stats["median"],
            heatmap_url=(
                f"/api/predictions/files/"
                f"{current_user.id}/{heatmap_filename}"
            ),
            available=True,
            note=ndvi_note,
        )

    prediction = Prediction(
        user_id=current_user.id,
        predicted_class=result["predicted_class"],
        confidence=result["confidence"],
        class_probabilities=json.dumps(result["probabilities"]),
        model_used=result["model_used"],
        rgb_image_path=rgb_path,
        nir_image_path=nir_path,
        ndvi_heatmap_path=ndvi_heatmap_path,
        ndvi_min=ndvi_min,
        ndvi_max=ndvi_max,
        ndvi_mean=ndvi_mean,
    )

    db.add(prediction)
    db.commit()
    db.refresh(prediction)

    return PredictionResponse(
        prediction_id=prediction.id,
        predicted_class=result["predicted_class"],
        confidence=result["confidence"],
        probabilities=result["probabilities"],
        ndvi=ndvi_response,
        model_used=result["model_used"],
        features=result["features"],
        created_at=prediction.created_at,
    )


@router.get(
    "/predictions/files/{user_id}/{filename}",
    summary="Fetch an uploaded/generated image (RGB, NIR, or NDVI heatmap) for a prediction",
)
def get_prediction_file(
    user_id: int,
    filename: str,
    current_user: User = Depends(get_current_user),
):
    from fastapi.responses import FileResponse

    if current_user.id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You may only access your own files",
        )

    # filename comes from our own safe_filename() (uuid hex + known ext)
    # but re-validate defensively against path traversal.
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid filename",
        )

    path = os.path.join(
        UPLOADS_DIR,
        str(user_id),
        filename,
    )

    path = os.path.abspath(path)

    if (
        not path.startswith(os.path.abspath(UPLOADS_DIR))
        or not os.path.isfile(path)
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found",
        )

    return FileResponse(path)