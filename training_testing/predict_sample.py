"""
Example: load the trained fusion model and classify one RGB + Pseudo-NIR
image pair.

Run from inside this folder:
    python predict_sample.py

To classify your own image, change RGB_PATH and NIR_PATH below to point to
your own preprocessed (128x128) RGB and Pseudo-NIR image pair.
"""

import json
import cv2
import numpy as np
import joblib
from scipy import stats as sstats
from skimage.feature import graycomatrix, graycoprops

# ---------------------------------------------------------------
# 1. Load the trained model, scaler, feature names, and class names
# ---------------------------------------------------------------
model = joblib.load("feature_fusion_gb_model.joblib")
scaler = joblib.load("feature_scaler.joblib")

with open("feature_names.json") as f:
    FEATURE_NAMES = json.load(f)

with open("classes.json") as f:
    classes = json.load(f)


# ---------------------------------------------------------------
# 2. Same feature extraction used during training
# ---------------------------------------------------------------
def glcm_features(gray_img, levels=32):
    q = (gray_img.astype(np.float32) / 255.0 * (levels - 1)).astype(np.uint8)
    glcm = graycomatrix(q, distances=[1], angles=[0, np.pi/4, np.pi/2, 3*np.pi/4],
                         levels=levels, symmetric=True, normed=True)
    feats = []
    for prop in ["contrast", "dissimilarity", "homogeneity", "energy", "correlation", "ASM"]:
        feats.append(graycoprops(glcm, prop).mean())
    return feats


def extract_features(rgb, nir):
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
    feats += [ndvi.mean(), ndvi.std(), float(np.min(ndvi)), float(np.max(ndvi)),
               float(np.median(ndvi)), float(sstats.skew(ndvi.ravel()))]

    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    feats += glcm_features(gray)
    feats += glcm_features(nir)

    return np.array(feats, dtype=np.float32).reshape(1, -1)


# ---------------------------------------------------------------
# 3. Load one RGB + Pseudo-NIR image pair and predict
#    (change these two paths to classify your own image)
# ---------------------------------------------------------------
RGB_PATH = "Preprocessed/RGB/Sheath Blight/Sheath_Blight_0201.jpg"
NIR_PATH = "Preprocessed/Pseudo_NIR/Sheath Blight/Sheath_Blight_0201.jpg"

rgb = cv2.imread(RGB_PATH)
rgb = cv2.cvtColor(rgb, cv2.COLOR_BGR2RGB)
nir = cv2.imread(NIR_PATH, cv2.IMREAD_GRAYSCALE)

if rgb is None or nir is None:
    raise FileNotFoundError("Could not read the sample RGB/Pseudo-NIR image pair.")

features = extract_features(rgb, nir)
features_scaled = scaler.transform(features)

probs = model.predict_proba(features_scaled)[0]
predicted_idx = np.argmax(probs)

print("Predicted class:", classes[predicted_idx])
print(f"Confidence: {probs[predicted_idx]*100:.2f}%")
print("\nAll class probabilities:")
for c, p in sorted(zip(classes, probs), key=lambda x: -x[1]):
    print(f"  {c:25s} {p*100:5.2f}%")
