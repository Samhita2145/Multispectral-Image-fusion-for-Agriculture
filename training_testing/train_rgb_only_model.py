"""
Trains the RGB-only Gradient Boosting model that frontend/js/ml/rice-model.js
uses by default for live photo uploads (no NIR/NDVI features — see
frontend/js/ml/README.md for why).

This reproduces the ablation the training notebook already evaluates
(RGB_ONLY_IDX / evaluate_feature_subset() in
Rice_Fusion_NDVI_Feature_Training.ipynb) but never saved to disk — same
70/15/15 split, same random_state=42, same hyperparameters as the main
fusion model. Verified to reproduce the notebook's reported 83.13% test
accuracy to the decimal.

Run once (or any time X_features.npy / y_labels.npy change):
    python train_rgb_only_model.py
Then re-export to JSON for the frontend:
    python export_model_to_json.py
"""

import warnings

import joblib
import numpy as np
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.metrics import accuracy_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

warnings.filterwarnings("ignore")

# Same indices as RGB_ONLY_IDX in the training notebook: R/G/B/H/S/V mean+std
# (0-11) and RGB_contrast..RGB_ASM GLCM texture (20-25). Excludes everything
# NIR/NDVI-derived (12-19, 26-31).
RGB_ONLY_IDX = list(range(0, 12)) + list(range(20, 26))


def main():
    X = np.load("X_features.npy")
    y = np.load("y_labels.npy")

    # Identical split to the main fusion model's training cell.
    X_train, X_temp, y_train, y_temp = train_test_split(
        X, y, test_size=0.30, random_state=42, stratify=y
    )
    X_val, X_test, y_val, y_test = train_test_split(
        X_temp, y_temp, test_size=0.50, random_state=42, stratify=y_temp
    )

    scaler = StandardScaler().fit(X_train[:, RGB_ONLY_IDX])
    X_train_s = scaler.transform(X_train[:, RGB_ONLY_IDX])
    X_test_s = scaler.transform(X_test[:, RGB_ONLY_IDX])

    model = GradientBoostingClassifier(
        n_estimators=150, max_depth=3, learning_rate=0.1, random_state=42
    )
    model.fit(X_train_s, y_train)

    pred = model.predict(X_test_s)
    acc = accuracy_score(y_test, pred)
    print(f"RGB-only test accuracy: {acc * 100:.2f}%  (notebook reported 83.13%)")

    joblib.dump(model, "feature_rgb_only_gb_model.joblib")
    joblib.dump(scaler, "feature_rgb_only_scaler.joblib")
    print("Saved feature_rgb_only_gb_model.joblib + feature_rgb_only_scaler.joblib")


if __name__ == "__main__":
    main()
