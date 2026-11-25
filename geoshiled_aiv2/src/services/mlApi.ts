import { buildDemoPrediction, clamp, classifyRisk, evaluateFloodRisk } from '../engine/floodModel';
import { BackendConfig, FloodInputs, PredictionResult, RiskCategory } from '../types/flood';

export interface FastApiPredictRequest {
  rainfall: number;
  slope: number;
  soil_saturation: number;
  drainage_risk: number;
  elevation: number;
}

export interface FastApiPredictResponse {
  risk_probability: number;
  risk_category: RiskCategory;
}

export const DEFAULT_FASTAPI_URL = 'http://localhost:8000/predict';

export function formatPredictPayload(inputs: FloodInputs): FastApiPredictRequest {
  return {
    rainfall: Number(inputs.rainfall.toFixed(1)),
    slope: Number(inputs.slope.toFixed(1)),
    soil_saturation: Number(inputs.soil_saturation.toFixed(2)),
    drainage_risk: Number(inputs.drainage_risk.toFixed(2)),
    elevation: Number(inputs.elevation.toFixed(0)),
  };
}

function isValidRiskCategory(value: unknown): value is RiskCategory {
  return value === 'Low' || value === 'Moderate' || value === 'High' || value === 'Very High';
}

/**
 * Calls the configured Python FastAPI `/predict` endpoint when enabled,
 * with strict timeout, response schema validation, and automatic fallback
 * to the local synthetic demo engine if the backend is unreachable.
 */
export async function predictFloodRisk(
  inputs: FloodInputs,
  config: BackendConfig
): Promise<PredictionResult> {
  if (config.mode === 'demo') {
    return buildDemoPrediction(inputs);
  }

  const endpoint = config.endpointUrl.trim() || DEFAULT_FASTAPI_URL;
  const payload = formatPredictPayload(inputs);
  const startedAt = performance.now();
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 3500);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    window.clearTimeout(timeoutId);
    const latencyMs = Number((performance.now() - startedAt).toFixed(0));

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from ${endpoint}`);
    }

    const data: unknown = await response.json();
    if (
      typeof data !== 'object' ||
      data === null ||
      typeof (data as Record<string, unknown>).risk_probability !== 'number'
    ) {
      throw new Error('Unexpected JSON schema from /predict endpoint');
    }

    const rawProb = clamp((data as FastApiPredictResponse).risk_probability, 0, 1);
    const rawCat = (data as FastApiPredictResponse).risk_category;
    const category = isValidRiskCategory(rawCat) ? rawCat : classifyRisk(rawProb);
    const localBreakdown = evaluateFloodRisk(inputs);

    return {
      risk_probability: Number(rawProb.toFixed(4)),
      risk_category: category,
      source: 'fastapi-backend',
      latencyMs,
      contributions: localBreakdown.contributions,
    };
  } catch (err) {
    window.clearTimeout(timeoutId);
    const demoFallback = buildDemoPrediction(inputs);
    const reason =
      err instanceof DOMException && err.name === 'AbortError'
        ? 'Request timed out (3.5s) — switched to synthetic demo engine'
        : err instanceof Error
          ? `${err.message} — switched to synthetic demo engine`
          : 'FastAPI backend unreachable — switched to synthetic demo engine';

    return {
      ...demoFallback,
      source: 'fallback-demo',
      fallbackReason: reason,
    };
  }
}

export const FASTAPI_REFERENCE_CODE = `# RainGuard AI — Classical scikit-learn + OpenWeatherMap FastAPI Backend
# Full source files included in /backend/main.py, /backend/train_model.py & /backend/weather_service.py
#
# 1. Install Python dependencies:
#    pip install -r requirements.txt
# 2. (Optional) Configure OpenWeatherMap key in .env:
#    OPENWEATHER_API_KEY=your_openweathermap_key
# 3. Train classical scikit-learn model (also auto-trains on first boot):
#    python -m backend.train_model
# 4. Run FastAPI backend:
#    uvicorn backend.main:app --reload --port 8000
# 5. Run Streamlit app (or deploy streamlit_app.py to Streamlit Community Cloud):
#    streamlit run streamlit_app.py

from fastapi import FastAPI
from pydantic import BaseModel, Field
from backend.train_model import load_or_train_model, predict_single, run_monte_carlo_sklearn
from backend.weather_service import get_tamilnadu_live_weather

app = FastAPI(title="RainGuard AI — Flood-Risk Intelligence API")

class FloodInput(BaseModel):
    rainfall: float = Field(..., ge=0, le=180)
    slope: float = Field(..., ge=0, le=45)
    soil_saturation: float = Field(..., ge=0, le=1)
    drainage_risk: float = Field(..., ge=0, le=1)
    elevation: float = Field(..., ge=0, le=100)

@app.post("/predict")
def predict(data: FloodInput):
    return predict_single(data.model_dump())

@app.get("/weather/tamilnadu")
def weather_tamilnadu(refresh: bool = False):
    return get_tamilnadu_live_weather(force_refresh=refresh)

@app.get("/model/info")
def model_info():
    _, meta = load_or_train_model()
    return meta
`;

