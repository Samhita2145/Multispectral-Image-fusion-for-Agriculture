# Rice Disease Fusion Project — Combined Package

This package brings together the two pieces you built separately so they live
in one project root, ready for a backend to be wired in between them.

```
Rice_Disease_Fusion_Project/
├── frontend/           ← the web UI (static HTML/CSS/JS)
└── training_testing/   ← the trained model, feature-extraction code, notebook, data
```

Both halves were verified independently before packaging (see "What was
checked" below). Nothing inside either folder was changed except removing a
few stray/empty/cache files (`test_one.py` was 0 bytes, `.ipynb_checkpoints`,
`.virtual_documents`, empty `anaconda_projects/`).

---

## 1. `frontend/`

A static multi-page site — no build step, no framework, no bundler. Open
`frontend/index.html` directly in a browser, or serve the folder:

```bash
cd frontend
python3 -m http.server 8000
# visit http://localhost:8000
```

Pages: `index.html`, `login.html`, `about.html`, `dataset.html`,
`disease-detection.html`, `fusion.html`, `history.html`,
`image-analysis.html`, `reports.html`.

**Current state:** every page runs entirely on **mock/simulated data** —
`detection.js`, `fusion.js`, `upload.js`, `reports.js`, `history.js`,
`dataset.js` all generate fake results client-side with `setTimeout()` calls
standing in for a real API round-trip. There is no `fetch()` to any backend
yet anywhere in the JS (I checked — the only network call in the whole
frontend is the Chart.js CDN `<script>` tag on `reports.html`), which matches
what you said: backend integration comes next.

**Good news for that next step:** the 6 disease classes hardcoded in
`js/detection.js` (`DETECTION_DATA`) already match the model's 6 output
classes in `training_testing/classes.json` — Bacterial Leaf Blight, Brown
Spot, Healthy Rice Leaf, Leaf Blast, Leaf scald, Sheath Blight — just in a
different order. That means `disease-detection.html` is effectively already
shaped to receive real predictions from this model.

## 2. `training_testing/`

The trained fusion model (RGB + Pseudo-NIR → NDVI + color/texture features →
Gradient Boosting classifier) plus everything needed to reproduce or reuse
it.

| File | What it is |
|---|---|
| `Rice_Fusion_NDVI_Feature_Training.ipynb` | Full pipeline, already executed with saved outputs (fusion visualizations, NDVI heatmaps, feature table, model comparison, confusion matrix). |
| `feature_fusion_gb_model.joblib` | Final trained `GradientBoostingClassifier`. |
| `feature_scaler.joblib` | `StandardScaler` — **must** be applied to features before calling the model. |
| `feature_names.json` | Ordered list of the 32 features the model expects. |
| `classes.json` | The 6 class labels, in prediction-index order. |
| `model_summary.json` | Test accuracy 85.74%, 5-fold CV accuracy 82.45% (± 1.35%) — quote the CV number as the honest generalization estimate. |
| `predict_sample.py` | Reference script: load model + scaler, extract the same 32 features from an RGB + Pseudo-NIR pair, predict. |
| `Preprocessed/RGB/`, `Preprocessed/Pseudo_NIR/` | The 128×128 training images, kept so the notebook can be re-run standalone. |
| `X_features.npy`, `y_labels.npy` | Cached extracted feature matrix / labels used for training. |

**Verified working**, right now, in this environment:

```bash
cd training_testing
python3 predict_sample.py
```
```
Predicted class: Leaf scald
Confidence: 69.37%

All class probabilities:
  Leaf scald                69.37%
  Leaf Blast                10.48%
  Bacterial Leaf Blight      8.62%
  Sheath Blight              7.15%
  Brown Spot                 3.48%
  Healthy Rice Leaf          0.90%
```
This actually ran the real model against a real sample image and returned a
real (if imperfect — the model is ~85% accurate, not 100%) prediction, so the
`.joblib` files, the scaler, and the feature-extraction code all check out as
functional together.

One thing to fix when you set up the backend environment: `joblib.load()`
currently prints `InconsistentVersionWarning` because the model was pickled
with scikit-learn 1.7.2 and this environment has 1.8.0. It still loads and
predicts correctly, but for production pin `scikit-learn==1.7.2` (or
whatever exact version is in your original training environment) to avoid
relying on sklearn's backward-compatibility, which isn't guaranteed forever.

---

## What was checked before packaging

- **Frontend:** served all 9 HTML pages over a local HTTP server and
  confirmed every one returns 200 and every `<link>`/`<script>` reference
  (CSS, JS, the one CDN script) resolves to a real file — no broken paths.
- **Model:** ran `predict_sample.py` end-to-end against the packaged model,
  scaler, and a real preprocessed image pair; it loaded successfully and
  produced a valid prediction with class probabilities.
- **Class alignment:** cross-checked `frontend/js/detection.js`'s hardcoded
  disease list against `training_testing/classes.json` — same 6 diseases.
- Removed empty/cache/junk files so the package only contains things that
  are actually used (`test_one.py` was empty; Jupyter/Anaconda cache dirs
  were removed).

## What's *not* done yet (by design — you said backend comes later)

There is no backend in this package. When you build it, the natural shape
is:

1. An API endpoint (e.g. `POST /predict`) that accepts an image upload from
   `disease-detection.html` / `image-analysis.html`.
2. Server-side: derive the RGB + Pseudo-NIR pair the same way the training
   data was prepared, run `extract_features()` (copy from
   `predict_sample.py`), apply `feature_scaler.joblib`, then
   `feature_fusion_gb_model.joblib.predict_proba()`.
3. Return `{class, confidence, all_probabilities}` as JSON.
4. Replace the `setTimeout()`-based mock logic in `js/detection.js` (and
   similarly `js/fusion.js`, `js/upload.js`) with a real `fetch('/predict', ...)`
   call, mapping the returned class name onto the existing
   `DETECTION_DATA` entries for symptoms/treatment/prevention text (which
   can stay as-is, since they're static agronomic reference info, not model
   output).
