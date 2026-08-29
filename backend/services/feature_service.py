"""
Feature extraction service.

CRITICAL: The functions in this file are a byte-for-byte port of the feature
extraction code in `training_testing/predict_sample.py` and the
`Rice_Fusion_NDVI_Feature_Training.ipynb` notebook. Do NOT change the maths
here — any change will make backend predictions diverge from the trained
model's expectations.

Two feature sets are supported, both already produced by the original
training pipeline (see notebook cell 9, `RGB_ONLY_IDX`):

  * Fusion features (32-dim)  -> feature_fusion_gb_model.joblib
    Requires an RGB image AND a Pseudo-NIR (single channel) image of the
    same size.

  * RGB-only features (18-dim) -> feature_rgb_only_gb_model.joblib
    A strict subset of the fusion feature vector (indices 0-11 and 20-25,
    i.e. RGB/HSV colour stats + RGB GLCM texture). This is the exact
    subset the original notebook used to train/evaluate its "RGB-only"
    comparison model (`RGB_ONLY_IDX` in the notebook), so this is not a
    new/invented pipeline -- it reuses an already-trained artifact that
    ships in this repository.

Why two paths: the existing frontend upload UI only submits a single leaf
photo. Without a captured/paired Pseudo-NIR band there is no faithful way
to reproduce the original Pseudo-NIR generation step (that preprocessing
script isn't included in this repository -- only its already-generated
output under training_testing/Preprocessed/Pseudo_NIR/). Rather than
fabricating a fake NIR band and silently feeding the fusion model
unreliable input, the backend uses the real RGB-only model in that case.
If the caller supplies a genuine second (Pseudo-NIR) image, the full
fusion pipeline is used instead.
"""
from __future__ import annotations

import json
import os

import cv2
import numpy as np
from scipy import stats as sstats
from skimage.feature import graycomatrix, graycoprops

ARTIFACTS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "ml_artifacts")

with open(os.path.join(ARTIFACTS_DIR, "feature_names.json")) as f:
    FEATURE_NAMES: list[str] = json.load(f)

with open(os.path.join(ARTIFACTS_DIR, "classes.json")) as f:
    CLASSES: list[str] = json.load(f)

# Exact copy of the notebook's RGB_ONLY_IDX (cell 9):
#   list(range(0, 12)) + list(range(20, 26))
RGB_ONLY_IDX = list(range(0, 12)) + list(range(20, 26))
RGB_ONLY_FEATURE_NAMES = [FEATURE_NAMES[i] for i in RGB_ONLY_IDX]

TARGET_SIZE = 128  # the resolution the model was trained on


# ---------------------------------------------------------------
# Exact port of predict_sample.py / notebook cell 9
# ---------------------------------------------------------------
def glcm_features(gray_img: np.ndarray, levels: int = 32) -> list:
    q = (gray_img.astype(np.float32) / 255.0 * (levels - 1)).astype(np.uint8)
    glcm = graycomatrix(
        q,
        distances=[1],
        angles=[0, np.pi / 4, np.pi / 2, 3 * np.pi / 4],
        levels=levels,
        symmetric=True,
        normed=True,
    )
    feats = []
    for prop in ["contrast", "dissimilarity", "homogeneity", "energy", "correlation", "ASM"]:
        feats.append(graycoprops(glcm, prop).mean())
    return feats


def compute_ndvi(rgb: np.ndarray, nir: np.ndarray) -> np.ndarray:
    """Exact copy of the notebook's compute_ndvi()."""
    rgb_f = rgb.astype(np.float32) / 255.0
    nir_f = nir.astype(np.float32) / 255.0
    red = rgb_f[:, :, 0]
    ndvi = (nir_f - red) / (nir_f + red + 1e-6)
    return ndvi


def extract_fusion_features(rgb: np.ndarray, nir: np.ndarray) -> np.ndarray:
    """Exact copy of predict_sample.py's extract_features(). rgb is RGB order
    (H,W,3) uint8, nir is (H,W) uint8 grayscale. Returns (1, 32) float32."""
    rgb_f = rgb.astype(np.float32) / 255.0
    nir_f = nir.astype(np.float32) / 255.0
    red = rgb_f[:, :, 0]
    ndvi = (nir_f - red) / (nir_f + red + 1e-6)

    feats = []
    for c in range(3):
        ch = rgb_f[:, :, c]
        feats += [ch.mean(), ch.std()]

    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV).astype(np.float32) / 255.0
    for c in range(3):
        ch = hsv[:, :, c]
        feats += [ch.mean(), ch.std()]

    feats += [nir_f.mean(), nir_f.std()]
    feats += [
        ndvi.mean(),
        ndvi.std(),
        float(np.min(ndvi)),
        float(np.max(ndvi)),
        float(np.median(ndvi)),
        float(sstats.skew(ndvi.ravel())),
    ]

    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    feats += glcm_features(gray)
    feats += glcm_features(nir)

    return np.array(feats, dtype=np.float32).reshape(1, -1)


def extract_rgb_only_features(rgb: np.ndarray) -> np.ndarray:
    """Computes only the RGB/HSV colour-stat + RGB-GLCM-texture features
    (i.e. the RGB_ONLY_IDX subset of extract_fusion_features), without
    requiring a NIR band at all. Returns (1, 18) float32, in the same
    order as RGB_ONLY_FEATURE_NAMES / the rgb-only scaler & model expect."""
    rgb_f = rgb.astype(np.float32) / 255.0

    feats = []
    for c in range(3):
        ch = rgb_f[:, :, c]
        feats += [ch.mean(), ch.std()]

    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV).astype(np.float32) / 255.0
    for c in range(3):
        ch = hsv[:, :, c]
        feats += [ch.mean(), ch.std()]

    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    feats += glcm_features(gray)

    return np.array(feats, dtype=np.float32).reshape(1, -1)


# ---------------------------------------------------------------
# Preprocessing helpers
# ---------------------------------------------------------------
def resize_cover(img: np.ndarray, size: int = TARGET_SIZE) -> np.ndarray:
    """Cover-fit resize + center-crop to size x size, matching the frontend's
    canvas-based preprocessing (see frontend/js/upload.js / detection.js:
    draw at scale=max(size/w, size/h), centered)."""
    h, w = img.shape[:2]
    scale = max(size / w, size / h)
    new_w, new_h = int(round(w * scale)), int(round(h * scale))
    resized = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_AREA)
    x0 = max(0, (new_w - size) // 2)
    y0 = max(0, (new_h - size) // 2)
    cropped = resized[y0 : y0 + size, x0 : x0 + size]
    # Guard against off-by-one rounding
    if cropped.shape[0] != size or cropped.shape[1] != size:
        cropped = cv2.resize(cropped, (size, size), interpolation=cv2.INTER_AREA)
    return cropped


def bytes_to_rgb(image_bytes: bytes) -> np.ndarray:
    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if bgr is None:
        raise ValueError("Could not decode image data. Is this a valid image file?")
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    return rgb


def bytes_to_gray(image_bytes: bytes) -> np.ndarray:
    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    gray = cv2.imdecode(arr, cv2.IMREAD_GRAYSCALE)
    if gray is None:
        raise ValueError("Could not decode NIR image data. Is this a valid image file?")
    return gray
