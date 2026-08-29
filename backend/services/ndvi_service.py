"""
NDVI statistics + heatmap generation.

Uses the exact NDVI formula from the training notebook / predict_sample.py:
    NDVI = (NIR - Red) / (NIR + Red + 1e-6)   (on 0-1 normalized channels)

When a real Pseudo-NIR / NIR band is supplied, that band is used.
When only RGB is available, a Pseudo-NIR grayscale band is derived with the
same pixel mapping already used by the frontend Image Analysis / Image Fusion
previews (upload.js / fusion.js) so NDVI Mean/Min/Max can still be shown —
classification continues to use the RGB-only model path unchanged.
"""
from __future__ import annotations

import base64

import cv2
import numpy as np

from services.feature_service import compute_ndvi


def rgb_to_pseudo_nir_gray(rgb: np.ndarray) -> np.ndarray:
    """Derive a single-channel Pseudo-NIR band from RGB using the existing
    frontend preview formula (upload.js / fusion.js), then convert to
    grayscale the same way a colour Pseudo-NIR upload would be decoded.

    Frontend per-pixel mapping (uint8 RGB in → false-colour out):
        R' = min(255, G * 1.35 + 20)
        G' = min(255, R * 0.6)
        B' = min(255, 255 - B * 0.7)
    """
    if rgb.ndim != 3 or rgb.shape[2] < 3:
        raise ValueError("rgb_to_pseudo_nir_gray expects an (H,W,3) RGB image")
    r = rgb[:, :, 0].astype(np.float32)
    g = rgb[:, :, 1].astype(np.float32)
    b = rgb[:, :, 2].astype(np.float32)
    pr = np.clip(g * 1.35 + 20.0, 0, 255)
    pg = np.clip(r * 0.6, 0, 255)
    pb = np.clip(255.0 - b * 0.7, 0, 255)
    pseudo_rgb = np.stack([pr, pg, pb], axis=2).astype(np.uint8)
    return cv2.cvtColor(pseudo_rgb, cv2.COLOR_RGB2GRAY)


def ndvi_stats(rgb: np.ndarray, nir: np.ndarray) -> dict:
    ndvi = compute_ndvi(rgb, nir)
    return {
        "minimum": round(float(np.min(ndvi)), 4),
        "maximum": round(float(np.max(ndvi)), 4),
        "mean": round(float(np.mean(ndvi)), 4),
        "std": round(float(np.std(ndvi)), 4),
        "median": round(float(np.median(ndvi)), 4),
    }


def ndvi_heatmap_png_bytes(rgb: np.ndarray, nir: np.ndarray) -> bytes:
    """Render the NDVI map as a red-yellow-green heatmap PNG, matching the
    colour convention used in the training notebook (cmap='RdYlGn')."""
    ndvi = compute_ndvi(rgb, nir)
    # Normalize -1..1 -> 0..255, then apply an RdYlGn-like colormap.
    norm = np.clip((ndvi + 1.0) / 2.0, 0.0, 1.0)
    norm_u8 = (norm * 255).astype(np.uint8)
    # OpenCV doesn't ship RdYlGn; JET-based diverging isn't quite right, so
    # build a simple red->yellow->green LUT manually.
    lut = _rdylgn_lut()
    heatmap = lut[norm_u8]
    heatmap_bgr = cv2.cvtColor(heatmap, cv2.COLOR_RGB2BGR)
    success, buf = cv2.imencode(".png", heatmap_bgr)
    if not success:
        raise RuntimeError("Failed to encode NDVI heatmap")
    return buf.tobytes()


def _rdylgn_lut() -> np.ndarray:
    """256x3 uint8 lookup table approximating matplotlib's RdYlGn colormap
    (red at 0 -> yellow at 0.5 -> green at 1)."""
    stops = np.array(
        [
            [0.0, (165, 0, 38)],
            [0.1, (215, 48, 39)],
            [0.2, (244, 109, 67)],
            [0.3, (253, 174, 97)],
            [0.4, (254, 224, 139)],
            [0.5, (255, 255, 191)],
            [0.6, (217, 239, 139)],
            [0.7, (166, 217, 106)],
            [0.8, (102, 189, 99)],
            [0.9, (26, 152, 80)],
            [1.0, (0, 104, 55)],
        ],
        dtype=object,
    )
    positions = np.array([s[0] for s in stops], dtype=np.float32)
    colors = np.array([s[1] for s in stops], dtype=np.float32)
    xs = np.linspace(0, 1, 256, dtype=np.float32)
    lut = np.zeros((256, 3), dtype=np.uint8)
    for ch in range(3):
        lut[:, ch] = np.interp(xs, positions, colors[:, ch]).astype(np.uint8)
    return lut


def png_bytes_to_base64(png_bytes: bytes) -> str:
    return "data:image/png;base64," + base64.b64encode(png_bytes).decode("ascii")
