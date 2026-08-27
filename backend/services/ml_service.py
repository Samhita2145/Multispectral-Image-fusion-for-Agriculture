"""
ML service: loads the trained artifacts once at import time (i.e. at
FastAPI startup, since this module is imported during app startup) and
exposes clean predict_fusion() / predict_rgb_only() functions.

Pipeline (matches predict_sample.py / the training notebook exactly):
    image bytes -> decode -> resize/cover-crop to 128x128
    -> extract_features() -> feature_scaler.transform() -> model.predict_proba()

Do NOT retrain, refit the scaler, or change feature order here.
"""
from __future__ import annotations

import os

import joblib
import numpy as np

from services.feature_service import (
    CLASSES,
    FEATURE_NAMES,
    RGB_ONLY_FEATURE_NAMES,
    TARGET_SIZE,
    extract_fusion_features,
    extract_rgb_only_features,
    resize_cover,
)

ARTIFACTS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "ml_artifacts")

_fusion_model = None
_fusion_scaler = None
_rgb_only_model = None
_rgb_only_scaler = None


def load_models() -> None:
    """Load all model artifacts once. Safe to call multiple times."""
    global _fusion_model, _fusion_scaler, _rgb_only_model, _rgb_only_scaler
    if _fusion_model is None:
        _fusion_model = joblib.load(os.path.join(ARTIFACTS_DIR, "feature_fusion_gb_model.joblib"))
    if _fusion_scaler is None:
        _fusion_scaler = joblib.load(os.path.join(ARTIFACTS_DIR, "feature_scaler.joblib"))
    if _rgb_only_model is None:
        _rgb_only_model = joblib.load(os.path.join(ARTIFACTS_DIR, "feature_rgb_only_gb_model.joblib"))
    if _rgb_only_scaler is None:
        _rgb_only_scaler = joblib.load(os.path.join(ARTIFACTS_DIR, "feature_rgb_only_scaler.joblib"))


def _probs_to_response(probs: np.ndarray) -> dict:
    predicted_idx = int(np.argmax(probs))
    return {
        "predicted_class": CLASSES[predicted_idx],
        "confidence": round(float(probs[predicted_idx]) * 100, 2),
        "probabilities": {
            CLASSES[i]: round(float(p) * 100, 2) for i, p in enumerate(probs)
        },
    }


def predict_fusion(rgb: np.ndarray, nir: np.ndarray) -> dict:
    """rgb: (H,W,3) RGB uint8. nir: (H,W) grayscale uint8. Both will be
    resized/cropped to TARGET_SIZE x TARGET_SIZE first, matching training."""
    load_models()
    rgb_r = resize_cover(rgb, TARGET_SIZE)
    nir_r = resize_cover(nir, TARGET_SIZE)
    if nir_r.ndim == 3:
        nir_r = nir_r[:, :, 0]

    features = extract_fusion_features(rgb_r, nir_r)
    features_scaled = _fusion_scaler.transform(features)
    probs = _fusion_model.predict_proba(features_scaled)[0]

    result = _probs_to_response(probs)
    result["model_used"] = "fusion"
    result["features"] = {name: round(float(val), 6) for name, val in zip(FEATURE_NAMES, features[0])}
    result["_rgb_resized"] = rgb_r
    result["_nir_resized"] = nir_r
    return result


def predict_rgb_only(rgb: np.ndarray) -> dict:
    load_models()
    rgb_r = resize_cover(rgb, TARGET_SIZE)

    features = extract_rgb_only_features(rgb_r)
    features_scaled = _rgb_only_scaler.transform(features)
    probs = _rgb_only_model.predict_proba(features_scaled)[0]

    result = _probs_to_response(probs)
    result["model_used"] = "rgb_only"
    result["features"] = {name: round(float(val), 6) for name, val in zip(RGB_ONLY_FEATURE_NAMES, features[0])}
    result["_rgb_resized"] = rgb_r
    return result
