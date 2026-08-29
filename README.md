# Multispectral Image Fusion for Agriculture

Rice leaf disease detection from RGB (+ optional Pseudo-NIR) leaf photos,
using a trained Gradient Boosting classifier, with a static frontend and a
FastAPI backend.

```
├── frontend/            static HTML/CSS/JS UI (unchanged design/layout)
├── backend/              FastAPI backend (new)
└── training_testing/     original notebook, trained model artifacts, predict_sample.py
```

## Project overview

- **Frontend**: a multi-page static site (no build step). Pages: Dashboard,
  Image Analysis, Dataset Explorer, Disease Detection, Image Fusion,
  Reports, History, About, Login.
- **Backend**: FastAPI + SQLite. Handles user accounts (JWT auth), runs the
  real trained scikit-learn model on uploaded images, stores prediction
  history per user, generates PDF reports (ReportLab), and serves basic
  dashboard stats.
- **Model**: `training_testing/feature_fusion_gb_model.joblib` (Gradient
  Boosting, RGB + Pseudo-NIR fusion features, 85.74% test accuracy /
  82.45% ± 1.34% 5-fold CV) and `feature_rgb_only_gb_model.joblib` (RGB-only
  variant, 83.13% test accuracy). Neither model was retrained, and the
  scaler/feature order/feature extraction math are byte-for-byte copies of
  `predict_sample.py` — see `backend/services/feature_service.py`'s module
  docstring for the full explanation and verification notes.

### Why two models, and how prediction actually works

The existing frontend upload UI only ever submits **one** photo — there is
no second "Pseudo-NIR" file input anywhere in the original design. The
fusion model needs a genuine Pseudo-NIR band, and the script that generated
the Pseudo-NIR images used for training isn't included in this repository
(only the pre-generated output images under `training_testing/Preprocessed/`
are). Rather than fabricate a fake NIR band from the single RGB photo (which
would silently produce misleading predictions and fabricated NDVI numbers),
the backend does this:

- If you upload **only an RGB photo** (the default flow on every page): the
  backend uses the **RGB-only model** (`feature_rgb_only_gb_model.joblib`),
  which is a real trained artifact already in this repo, using the exact
  `RGB_ONLY_IDX` feature subset from the training notebook. NDVI is reported
  as `"available": false` with an explanatory note — it is not invented.
- If you also attach a **Pseudo-NIR image** (a small optional "Add
  Pseudo-NIR" control was added to the Disease Detection page, and
  `/api/predict` accepts an optional `nir_image` field): the backend uses
  the full **fusion model**, computes real NDVI statistics, and generates an
  NDVI heatmap — exactly the pipeline in `predict_sample.py`.

This was a deliberate design decision, not an oversight — see the summary
message that accompanied this delivery for more detail.

---

## Backend setup

### Requirements
- Python 3.10+ (developed against 3.12)

### Install & run

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate
# macOS/Linux
source venv/bin/activate

pip install -r requirements.txt

cp .env.example .env
# then edit .env and set a real JWT_SECRET_KEY, e.g.:
#   python -c "import secrets; print(secrets.token_hex(32))"

uvicorn app:app --reload
```

The API is now at `http://127.0.0.1:8000`. Interactive docs (Swagger UI) at
`http://127.0.0.1:8000/docs`.

The SQLite database (`backend/app.db`) and its tables (`users`,
`predictions`, `reports`) are created automatically on first startup —
nothing to run manually.

### Environment variables (`backend/.env`, see `.env.example`)

| Variable | Purpose | Default |
|---|---|---|
| `JWT_SECRET_KEY` | Signs JWT auth tokens. **Set a real random value.** | random per-process value if unset (dev-only fallback) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | JWT session lifetime | `1440` (24h) |
| `DATABASE_URL` | SQLAlchemy DB URL | `sqlite:///./app.db` |
| `FRONTEND_ORIGINS` | Comma-separated CORS allow-list | common local dev ports + `null` (for `file://`) |
| `GEMINI_API_KEY` | Google Gemini API key (recommended) | unset |
| `OPENAI_API_KEY` | OpenAI API key | unset |
| `ANTHROPIC_API_KEY` | Anthropic Claude API key | unset |
| `GROQ_API_KEY` | Groq API key | unset |
| `LLM_MODEL` | Custom model name override | provider default |

---

## Frontend setup

No build step. Two ways to run it:

**Option A — open directly:**
Open `frontend/login.html` (or any page) directly in a browser
(`file://...`). The backend's default CORS config allows the `null` origin
that browsers send for `file://` pages.

**Option B — serve it (recommended):**
```bash
cd frontend
python3 -m http.server 5500
# visit http://localhost:5500/login.html
```

By default the frontend talks to the backend at `http://127.0.0.1:8000`. To
point it elsewhere, add this **before** the other `<script>` tags on a page:
```html
<script>window.API_BASE_URL = 'https://your-backend-host';</script>
```

### Frontend behavior notes
- **Chatbot (Agri Assistant)** is AI/LLM-backed (`POST /api/chat`), answering
  questions on rice diseases, symptoms, treatment, prevention, rice agronomy,
  multispectral imaging, NDVI, and grounded prediction results.
- **Auth** is real: register/login/logout hit the backend and store a
  JWT in `localStorage` (`js/api.js`). Pages other than `login.html` /
  `about.html` / `dataset.html` redirect to `login.html` if not
  authenticated (`js/app.js`'s `enforceAuthGuard`).
- **Disease Detection** and **Image Analysis** pages call
  `POST /api/predict` with the uploaded image(s) and render the real
  model's class, confidence, probabilities, and (when a Pseudo-NIR image is
  attached) NDVI stats + heatmap.
- **History** calls `GET /api/history` — each user only ever sees their own
  predictions.
- **Reports** lists real backend-generated PDF reports (`GET /api/reports`)
  and downloads the actual PDF (`GET /api/reports/{id}/download`).
  "Generate Report" creates a report for your most recent analysis.
- **Image Fusion** page's client-side preview slider (canvas pixel-math
  simulation) is unchanged — it's a visual-only demo and was never wired to
  the model. Its "Fusion Information" panel now shows the real model type
  and accuracy instead of the placeholder text it had before, plus a link
  to run a real diagnosis.
- **Dashboard** (`index.html`) has no data placeholders in the original
  design (it's a hero banner only), so nothing was added there beyond the
  auth guard; `GET /api/dashboard/stats` is implemented and ready if you
  want to surface it later.

---

## API documentation

Full interactive docs (with request/response schemas) are auto-generated by
FastAPI at `/docs` once the backend is running. Summary:

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | — | Create account, returns JWT |
| POST | `/api/auth/login` | — | Log in, returns JWT |
| POST | `/api/auth/logout` | ✓ | Stateless logout (client discards token) |
| GET | `/api/auth/me` | ✓ | Current user info |
| POST | `/api/predict` | ✓ | Classify an RGB (+ optional Pseudo-NIR) image |
| GET | `/api/predictions/files/{user_id}/{filename}` | ✓ | Fetch a stored uploaded/generated image |
| GET | `/api/history` | ✓ | Paginated prediction history (own predictions only) |
| GET | `/api/history/{id}` | ✓ | Single prediction |
| DELETE | `/api/history/{id}` | ✓ | Delete a prediction |
| POST | `/api/reports/{prediction_id}` | ✓ | Generate a PDF report for a prediction |
| GET | `/api/reports` | ✓ | List own reports |
| GET | `/api/reports/{id}/download` | ✓ | Download a report PDF |
| GET | `/api/dashboard/stats` | ✓ | Own usage stats |
| POST | `/api/chat` | Optional | Agri Assistant AI chatbot |
| GET | `/api/health` | — | Backend health check |

All `✓` routes require `Authorization: Bearer <token>`.


## ML model information

- Type: `GradientBoostingClassifier` (scikit-learn), `n_estimators=150,
  max_depth=3, learning_rate=0.1`.
- Feature set (32-dim, fusion): RGB mean/std, HSV mean/std, NIR mean/std,
  NDVI mean/std/min/max/median/skew, GLCM texture (contrast, dissimilarity,
  homogeneity, energy, correlation, ASM) on both the RGB-grayscale and NIR
  images.
- RGB-only variant (18-dim): the RGB/HSV stats + RGB GLCM texture subset of
  the above (`RGB_ONLY_IDX` in the training notebook).
- Test accuracy: fusion 85.74%, RGB-only 83.13%. 5-fold CV (fusion):
  82.45% ± 1.34% — the more conservative number to quote.
- Classes (in model output order): Bacterial Leaf Blight, Brown Spot,
  Healthy Rice Leaf, Leaf Blast, Leaf scald, Sheath Blight.

## Prediction workflow

1. Frontend uploads image(s) via `multipart/form-data` to `POST /api/predict`.
2. Backend decodes, resizes/cover-crops to 128×128 (matching training),
   extracts the 32 (or 18) features, scales with the matching
   `StandardScaler`, and calls `predict_proba` on the matching Gradient
   Boosting model.
3. Result + (if applicable) NDVI stats/heatmap are saved to the
   `predictions` table for the logged-in user and returned as JSON.

## Report generation

`POST /api/reports/{prediction_id}` renders a PDF (ReportLab) containing the
project name, date, user, stored RGB/NIR/NDVI-heatmap images (when
available), predicted class, confidence, full probability table, NDVI stats
(when available), model info (accuracy/CV), and a disclaimer that the result
is AI-generated and not a definitive expert diagnosis. The PDF is saved
under `backend/generated_reports/<user_id>/` and referenced by a `reports`
DB row; `GET /api/reports/{id}/download` streams it back, ownership-checked.

## Git workflow

```bash
git status
git add .
git commit -m "Complete backend integration"
git push -u origin backend-integration
```

Push to a feature branch (e.g. `backend-integration`), not directly to
`main`.
