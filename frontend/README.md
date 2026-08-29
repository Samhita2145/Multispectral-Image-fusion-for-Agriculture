# Multispectral Image Fusion For Agriculture

A full frontend prototype for the Final Year Major Project — RGB + Pseudo-NIR
image fusion for early rice leaf disease detection. Every module is a
working static page with real interactions on dummy data; the dashboard
(`index.html`) matches Slide 18 of the project review deck pixel-for-pixel
and was left untouched.

## Project structure

```
Multispectral-Image-Fusion/
│
├── index.html                # Dashboard (unchanged — matches Slide 18)
├── login.html                 # Login / auth (dummy session, Google button)
├── image-analysis.html        # Upload → RGB/NIR/Fusion preview → prediction
├── dataset.html                # Dataset Explorer (6 classes, search, pagination)
├── disease-detection.html      # Diagnosis: confidence ring, severity, accordion
├── fusion.html                  # Interactive before/after fusion compare slider
├── reports.html                  # Report list, Chart.js summary, printable PDF
├── history.html                   # Past analyses — cards/timeline, search, delete
├── about.html                      # Overview, objectives, workflow, team
│
├── css/
│   ├── style.css              # Design tokens + dashboard styles (unchanged)
│   ├── modules.css             # Shared components: buttons, cards, forms, modals...
│   ├── login.css / fusion.css / reports.css / history.css / about.css
│   ├── animations.css
│   └── responsive.css
│
├── js/
│   ├── app.js                 # Shared: nav highlighting, toasts, modals, counters
│   ├── main.js                 # Dashboard action-card navigation
│   ├── upload.js / dataset.js / detection.js / fusion.js / reports.js / history.js / login.js
│
├── assets/
│   ├── logo.png
│   ├── farm.png
│   └── dataset/                # Empty class folders — ready for real dataset photos
│       ├── healthy/
│       ├── bacterial-leaf-blight/
│       ├── brown-spot/
│       ├── leaf-blast/
│       ├── leaf-scald/
│       └── sheath-blight/
│
└── README.md
```

## Getting started

No build step required — everything is static.

```bash
cd Multispectral-Image-Fusion
python3 -m http.server 8080
```
then visit `http://localhost:8080`.

(Opening `index.html` directly by double-click also works, though a
local server is recommended so `fetch`/relative-asset behavior matches
a real deployment.)

## What's real vs. simulated

- **Spectral previews** (Image Analysis / Image Fusion): generated live
  on `<canvas>` from whatever photo you upload — not real sensor data,
  but a deterministic, visually-representative simulation clearly
  derived from the uploaded image.
- **Predictions & confidence** (Image Analysis / Disease Detection): REAL —
  driven by `js/ml/rice-model.js`, a pure-JS port of the actual trained
  model (`training_testing/feature_fusion_gb_model.joblib`, 85.74% test
  accuracy). No backend: the model's 900 decision trees are exported to
  `js/ml/model-data.json` and evaluated in the browser. See
  `js/ml/README.md` for exactly what's real vs. approximated (short
  version: the classifier itself is exact; the Pseudo-NIR band synthesized
  from a live photo upload is a reasonable heuristic, not the original
  sensor-derived data the model was trained on).
- **Severity / treatment / symptoms copy**: curated reference text keyed
  to the real predicted class name (`DISEASE_CLASSES` in `js/upload.js`,
  `DETECTION_DATA` in `js/detection.js`) — not model output, since the
  model only classifies disease type, not severity or treatment.
- **Dataset Explorer**: uses colored placeholder tiles (no real photos
  were provided). See the comment at the top of `js/dataset.js` for how
  to drop real images into `assets/dataset/<class>/` and switch it over.
- **"Download PDF"** (Reports page): uses the browser's native
  print-to-PDF via a print-scoped stylesheet — works fully offline,
  no external PDF library needed.
- **History / Reports data**: seeded into `sessionStorage` so deletes
  and newly generated reports persist for the session (resets on new tab).
- **Login**: any email/password combination "succeeds" — there's no
  backend yet.

## Design tokens

All spacing, radii, and brand colors are defined as CSS custom properties
at the top of `css/style.css`; every new page reuses them via `css/modules.css`
so the whole site shares one visual language.

| Token | Value |
|---|---|
| `--color-primary` | `#2E7D32` |
| `--color-secondary` | `#4CAF50` |
| `--color-light` | `#A5D6A7` |
| `--color-bg` | `#F5F9F6` |

## Notes

- Layout is desktop-first; `css/responsive.css` + per-page responsive
  rules layer in tablet (`≤1024px`, `≤768px`) and mobile (`≤480px`).
- Chart.js is loaded via CDN on the Reports page; if there's no internet
  connection it automatically falls back to a lightweight CSS bar chart.
- No CSS or JS frameworks are used — everything is handwritten, per the
  original spec (HTML5 / CSS3 / vanilla JS / Chart.js only).
