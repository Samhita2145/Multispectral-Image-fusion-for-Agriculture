"""
Rice-leaf image validation gate.

The trained Gradient Boosting classifier (feature_fusion_gb_model.joblib /
feature_rgb_only_gb_model.joblib) only ever knows about its six trained
classes (Healthy, Bacterial Leaf Blight, Brown Spot, Leaf Blast, Leaf Scald,
Sheath Blight). It has no "not a rice leaf" / background class, so if you
hand it a photo of anything else, softmax will still confidently pick one of
the six -- it has no way to say "none of the above". That's the bug this
module fixes: a pre-check that runs BEFORE the image reaches the classifier,
so obviously non-rice-leaf images are rejected with a clear message instead
of getting a fabricated disease prediction.

This is a heuristic gate, not a trained OOD/rejection model (adding one
would mean retraining or shipping a new model artifact, which the task
explicitly avoids). It combines two independent, cheap-to-compute signals,
both requiring the image to pass for a positive ("is a rice leaf") result:

  1. Statistical outlier score -- reuses the REAL fitted StandardScaler
     that ships with this project (ml_artifacts/feature_rgb_only_scaler.
     joblib, fit on the actual training images) to z-score the same
     18-dim RGB/HSV/GLCM-texture feature vector the classifier itself
     consumes, then averages the squared z-scores. This measures "how far
     outside the range of the training photos does this image's feature
     vector fall" in the model's own terms, rather than an arbitrary rule
     invented separately from the model.
  2. Green-fraction check -- the fraction of pixels where the green
     channel is not clearly dominated by red or blue (G >= R-5 and
     G >= B-5). This catches a real gap in signal #1: a portrait's skin
     tones and warm-toned clothing/background can still land inside the
     statistical range the training photos occupy (skin tones are, after
     all, a fairly "normal" natural color), even though almost none of the
     image is actually leaf-colored. The two signals cover each other's
     blind spots.

Both thresholds were calibrated against every real image shipped in this
repository (3,829 files under training_testing/Preprocessed/RGB + 72 files
under frontend/assets/dataset -- 3,901 total, spanning all 6 classes
including heavily necrotic/discolored diseased leaves): with the thresholds
below, zero of those genuine rice-leaf photos are rejected, with margin to
spare (true max outlier score in the dataset: 13.01; true min green
fraction: 0.319). See the calibration notes below.

Known limitation (documented, not hidden): this is a statistical/color
heuristic, not a semantic "is this a rice leaf" classifier, so a
close-up, well-textured photo of a different green/brown plant, grass, or
soil can still pass. It substantially reduces the reported failure mode
(unrelated photos -- people, documents, objects, screenshots, plain
backgrounds, vehicles, etc. -- being forced into a rice-disease prediction),
including portrait photos specifically, which a naive color-only check
misses (verified during development).
"""
from __future__ import annotations

import os

import joblib
import numpy as np

from services.feature_service import TARGET_SIZE, extract_rgb_only_features, resize_cover

ARTIFACTS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "ml_artifacts")

# Calibrated against 3,901 real rice-leaf images in this repo (0 false
# rejections at these thresholds, with margin -- see module docstring).
OUTLIER_SCORE_THRESHOLD = 14.0     # true dataset max was 13.01
GREEN_FRACTION_THRESHOLD = 0.30    # true dataset min was 0.319

_rgb_only_scaler = None


def _load_scaler():
    """Lazily loads the same fitted RGB-only StandardScaler the classifier
    itself uses (services/ml_service.py loads the identical file), so the
    outlier score is computed in the model's own feature space rather than
    against separately-invented statistics."""
    global _rgb_only_scaler
    if _rgb_only_scaler is None:
        _rgb_only_scaler = joblib.load(os.path.join(ARTIFACTS_DIR, "feature_rgb_only_scaler.joblib"))
    return _rgb_only_scaler


def _outlier_score(rgb_128: np.ndarray) -> float:
    """Mean squared z-score of the 18-dim RGB-only feature vector, using the
    real trained scaler. Real training photos score ~0-13; unrelated photos
    (random noise, flat/solid colors, screenshots, documents) scored in the
    hundreds to low thousands in testing -- see calibration in the module
    docstring."""
    scaler = _load_scaler()
    features = extract_rgb_only_features(rgb_128)
    scaled = scaler.transform(features)[0]
    return float(np.mean(scaled ** 2))


def _green_fraction(rgb_128: np.ndarray) -> float:
    """Fraction of pixels where green is not clearly dominated by red or
    blue. Catches portraits/skin-tone photos and other warm-toned non-leaf
    images that can otherwise land inside the "normal" statistical range
    the outlier score alone checks."""
    r = rgb_128[:, :, 0].astype(np.int32)
    g = rgb_128[:, :, 1].astype(np.int32)
    b = rgb_128[:, :, 2].astype(np.int32)
    mask = (g >= r - 5) & (g >= b - 5)
    return float(mask.mean())


def is_probably_rice_leaf(rgb: np.ndarray) -> tuple[bool, dict]:
    """Validates whether `rgb` (H,W,3 uint8, RGB order -- the same array
    produced by feature_service.bytes_to_rgb) looks like a rice leaf photo,
    using the same 128x128 center-crop the classifier itself is fed so this
    check reflects exactly what the model would see.

    Rejects if EITHER signal says this doesn't look like a leaf photo --
    they catch different failure modes (see module docstring).

    Returns (is_valid, diagnostics). `diagnostics` is only for logging/
    debugging -- callers should not need to inspect it to route the
    response.
    """
    resized = resize_cover(rgb, TARGET_SIZE)

    score = _outlier_score(resized)
    green_frac = _green_fraction(resized)

    passes_outlier_check = score < OUTLIER_SCORE_THRESHOLD
    passes_green_check = green_frac >= GREEN_FRACTION_THRESHOLD

    is_valid = bool(passes_outlier_check and passes_green_check)

    diagnostics = {
        "outlier_score": round(score, 3),
        "green_fraction": round(green_frac, 4),
        "passes_outlier_check": passes_outlier_check,
        "passes_green_check": passes_green_check,
    }
    return is_valid, diagnostics


NOT_A_RICE_LEAF_MESSAGE = "Invalid image. Please upload a valid rice leaf image for disease detection."
