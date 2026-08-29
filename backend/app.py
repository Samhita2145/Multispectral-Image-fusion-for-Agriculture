import os
from dotenv import load_dotenv

ENV_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), ".env"))
if os.path.exists(ENV_PATH):
    load_dotenv(ENV_PATH)
else:
    load_dotenv()


from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database.database import init_db
from routes import auth, chat, dashboard, history, prediction, reports
from services import ml_service

app = FastAPI(
    title="Multispectral Image Fusion for Agriculture API",
    description=(
        "Backend for the Multispectral Image Fusion for Agriculture project. Serves the trained "
        "Gradient Boosting rice-leaf-disease classifier (feature_fusion_gb_model.joblib / "
        "feature_rgb_only_gb_model.joblib), user authentication, prediction history, PDF report "
        "generation, dashboard statistics, and AI Agri Assistant chatbot."
    ),
    version="1.0.0",
)

# ---------------------------------------------------------------
# CORS -- allow the static frontend (served separately, e.g. via
# `python -m http.server` or VS Code Live Server) to call this API.
# Configure allowed origins via the FRONTEND_ORIGINS env var
# (comma-separated), defaulting to common local dev ports/origins.
# ---------------------------------------------------------------
default_origins = "http://localhost:5500,http://127.0.0.1:5500,http://localhost:8080,http://127.0.0.1:8080,http://localhost:3000,http://127.0.0.1:3000,null"
origins = [o.strip() for o in os.getenv("FRONTEND_ORIGINS", default_origins).split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    init_db()
    # Load ML artifacts once at startup so the first prediction request
    # isn't slowed down by a cold joblib.load().
    ml_service.load_models()


app.include_router(auth.router)
app.include_router(prediction.router)
app.include_router(history.router)
app.include_router(reports.router)
app.include_router(dashboard.router)
app.include_router(chat.router)


@app.get("/", tags=["health"], summary="Health check")
@app.get("/api/health", tags=["health"], summary="Health check")
def root():
    return {"status": "ok", "service": "Multispectral Image Fusion for Agriculture API"}

