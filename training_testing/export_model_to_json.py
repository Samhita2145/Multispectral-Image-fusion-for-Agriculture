"""
Exports the trained .joblib models into JSON files that the frontend's
pure-JS inference engine (frontend/js/ml/rice-model.js) can load with
fetch() and run entirely in the browser — no backend / no Python required
at runtime. Exports BOTH models used by the frontend:

  - feature_fusion_gb_model.joblib + feature_scaler.joblib
      -> frontend/js/ml/model-data.json (32 features, needs real NIR)
  - feature_rgb_only_gb_model.joblib + feature_rgb_only_scaler.joblib
      -> frontend/js/ml/model-data-rgb-only.json (18 features, RGB-only —
         this is the one live photo uploads actually use; see
         frontend/js/ml/README.md for why)

If feature_rgb_only_gb_model.joblib doesn't exist yet, see
train_rgb_only_model.py to train it first (reproduces the notebook's
RGB_ONLY_IDX ablation with the exact same split/hyperparameters).

Run this again any time either model is retrained:
    python export_model_to_json.py

Requires: joblib, numpy, scikit-learn (same versions used to train/save
the models, to avoid pickle version-mismatch warnings).
"""

import json
import os
import warnings

import joblib
import numpy as np

warnings.filterwarnings("ignore")


def export_tree(decision_tree):
    tree = decision_tree.tree_
    values = tree.value.reshape(tree.node_count)
    return {
        "f": tree.feature.tolist(),                              # split feature index (-2 = leaf)
        "t": [round(float(x), 6) for x in tree.threshold],       # split threshold
        "l": tree.children_left.tolist(),                        # left child index (-1 = none)
        "r": tree.children_right.tolist(),                       # right child index (-1 = none)
        "v": [round(float(x), 8) for x in values],                # leaf/node regression value
    }


def export_one(model_path, scaler_path, feature_names, model_summary, output_path):
    model = joblib.load(model_path)
    scaler = joblib.load(scaler_path)
    classes = json.load(open("classes.json"))

    trees = [
        [export_tree(model.estimators_[i][k]) for k in range(model.n_classes_)]
        for i in range(model.n_estimators_)
    ]

    out = {
        "meta": {
            "n_estimators": int(model.n_estimators_),
            "n_classes": int(model.n_classes_),
            "learning_rate": float(model.learning_rate),
            "class_prior": [float(x) for x in model.init_.class_prior_],
            "classes": classes,
            "feature_names": feature_names,
        },
        "scaler": {
            "mean": [float(x) for x in scaler.mean_],
            "scale": [float(x) for x in scaler.scale_],
        },
        "model_summary": model_summary,
        "trees": trees,
    }

    with open(output_path, "w") as f:
        json.dump(out, f, separators=(",", ":"))

    print(f"Wrote {output_path} ({sum(len(r) for r in trees)} trees)")


def main():
    with open("feature_names.json") as f:
        feature_names = json.load(f)
    with open("model_summary.json") as f:
        model_summary = json.load(f)

    # Full RGB + Pseudo-NIR fusion model (32 features)
    export_one(
        "feature_fusion_gb_model.joblib",
        "feature_scaler.joblib",
        feature_names,
        model_summary,
        "../frontend/js/ml/model-data.json",
    )

    # RGB-only model (18 features) — used by default for live uploads
    if os.path.exists("feature_rgb_only_gb_model.joblib"):
        RGB_ONLY_IDX = list(range(0, 12)) + list(range(20, 26))
        rgb_only_feature_names = [feature_names[i] for i in RGB_ONLY_IDX]
        rgb_only_summary = {
            "test_accuracy": 0.8313043478260869,
            "cv_mean_accuracy": 0.8116,
            "note": "RGB-only variant, no NIR/NDVI features (see train_rgb_only_model.py)",
        }
        export_one(
            "feature_rgb_only_gb_model.joblib",
            "feature_rgb_only_scaler.joblib",
            rgb_only_feature_names,
            rgb_only_summary,
            "../frontend/js/ml/model-data-rgb-only.json",
        )
    else:
        print(
            "feature_rgb_only_gb_model.joblib not found — run "
            "train_rgb_only_model.py first if you need to regenerate it."
        )


if __name__ == "__main__":
    main()
