"""
RainGuard AI / GeoShield AI — FastAPI Backend
=============================================
Run locally:
    uvicorn backend.main:app --reload --port 8000

Environment variables (set in `.env` or deployment secrets):
    OPENWEATHER_API_KEY  - OpenWeatherMap API key (kept strictly server-side)
    ALLOWED_ORIGINS      - Comma-separated CORS origins (defaults to localhost:3000 & 8501)
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from backend.train_model import (
    compute_scenario_envelope,
    compute_sensitivity,
    evaluate_5x5_grid,
    load_or_train_model,
    predict_batch,
    predict_single,
    run_monte_carlo_sklearn,
    train_and_save_model,
)
from backend.weather_service import get_tamilnadu_live_weather

load_dotenv()


def _get_allowed_origins() -> List[str]:
    raw = os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000,http://localhost:8501,http://127.0.0.1:8501",
    )
    origins = [origin.strip() for origin in raw.split(",") if origin.strip()]
    return origins or ["http://localhost:3000", "http://localhost:8501"]


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Ensure classical scikit-learn model is trained/loaded cleanly on server boot
    load_or_train_model()
    yield


app = FastAPI(
    title="RainGuard AI — Flood-Risk Intelligence API",
    description=(
        "FastAPI backend serving classical scikit-learn flood-risk predictions, "
        "vectorized Monte Carlo sensitivity runs, and server-side OpenWeatherMap "
        "telemetry across 16 Tamil Nadu districts (SIH 2026 Prototype)."
    ),
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_get_allowed_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Accept"],
)


class FloodInput(BaseModel):
    rainfall: float = Field(..., ge=0.0, le=180.0, description="Rainfall intensity (mm/hour)")
    slope: float = Field(..., ge=0.0, le=45.0, description="Terrain slope (degrees)")
    soil_saturation: float = Field(..., ge=0.0, le=1.0, description="Soil saturation index (0-1)")
    drainage_risk: float = Field(..., ge=0.0, le=1.0, description="Drainage congestion index (0-1)")
    elevation: float = Field(..., ge=0.0, le=100.0, description="Relative elevation (0-100)")


class FloodPredictionResponse(BaseModel):
    risk_probability: float
    risk_category: str
    model_type: str
    feature_importances: Dict[str, float]
    trained_on_synthetic_data: bool


class BatchPredictRequest(BaseModel):
    items: List[FloodInput] = Field(..., min_length=1, max_length=100)


class MonteCarloRequest(BaseModel):
    rainfall: float = Field(..., ge=0.0, le=180.0)
    slope: float = Field(..., ge=0.0, le=45.0)
    soil_saturation: float = Field(..., ge=0.0, le=1.0)
    drainage_risk: float = Field(..., ge=0.0, le=1.0)
    elevation: float = Field(..., ge=0.0, le=100.0)
    iterations: int = Field(2500, ge=1000, le=10000)
    rainfall_uncertainty_pct: float = Field(20.0, ge=2.0, le=60.0)
    terrain_uncertainty_pct: float = Field(15.0, ge=2.0, le=50.0)
    drainage_uncertainty_pct: float = Field(15.0, ge=2.0, le=50.0)
    high_risk_threshold: float = Field(0.65, ge=0.30, le=0.95)
    seed: int = Field(202604, ge=1, le=9999999)


@app.get("/health")
def health() -> Dict[str, Any]:
    _, meta = load_or_train_model()
    owm_ready = bool((os.getenv("OPENWEATHER_API_KEY") or "").strip())
    return {
        "status": "ok",
        "model_loaded": True,
        "model_name": meta["model_name"],
        "openweather_configured": owm_ready,
        "prototype_notice": "Synthetic training data; not connected to official IMD/MOSDAC feeds.",
    }


@app.get("/model/info")
def model_info() -> Dict[str, Any]:
    _, meta = load_or_train_model()
    return meta


@app.post("/model/retrain")
def model_retrain(
    n_samples: int = Query(4500, ge=1000, le=10000),
    seed: int = Query(2026, ge=1, le=999999),
) -> Dict[str, Any]:
    _, meta = train_and_save_model(n_samples=n_samples, seed=seed)
    return {"status": "retrained", "metadata": meta}


@app.post("/predict", response_model=FloodPredictionResponse)
def predict(data: FloodInput) -> Dict[str, Any]:
    return predict_single(data.model_dump())


@app.post("/predict/batch")
def predict_many(req: BatchPredictRequest) -> Dict[str, Any]:
    rows = [item.model_dump() for item in req.items]
    return {"predictions": predict_batch(rows)}


@app.post("/simulate/details")
def simulate_details(data: FloodInput) -> Dict[str, Any]:
    payload = data.model_dump()
    return {
        "prediction": predict_single(payload),
        "envelope": compute_scenario_envelope(payload),
        "sensitivity": compute_sensitivity(payload),
        "grid_5x5": evaluate_5x5_grid(payload),
    }


@app.post("/simulate/montecarlo")
def simulate_montecarlo(req: MonteCarloRequest) -> Dict[str, Any]:
    return run_monte_carlo_sklearn(
        inputs={
            "rainfall": req.rainfall,
            "slope": req.slope,
            "soil_saturation": req.soil_saturation,
            "drainage_risk": req.drainage_risk,
            "elevation": req.elevation,
        },
        iterations=req.iterations,
        rainfall_uncertainty_pct=req.rainfall_uncertainty_pct,
        terrain_uncertainty_pct=req.terrain_uncertainty_pct,
        drainage_uncertainty_pct=req.drainage_uncertainty_pct,
        high_risk_threshold=req.high_risk_threshold,
        seed=req.seed,
    )


@app.get("/weather/tamilnadu")
def weather_tamilnadu(
    refresh: bool = Query(False, description="Bypass 10-minute server cache"),
) -> Dict[str, Any]:
    return get_tamilnadu_live_weather(force_refresh=refresh)
