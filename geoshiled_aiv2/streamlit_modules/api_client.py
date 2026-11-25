"""
Unified Bridge connecting Streamlit UI to:
  1. Live FastAPI Backend (`POST /predict`, `GET /weather/tamilnadu`, `GET /model/info`, `POST /simulate/montecarlo`)
  2. In-Process Classical scikit-learn + OpenWeatherMap Backend (zero-config fallback for Streamlit Community Cloud)

Reads `OPENWEATHER_API_KEY` and `FASTAPI_URL` strictly from `st.secrets` or server environment variables.
"""

from __future__ import annotations

import os
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

import requests
import streamlit as st

from backend.districts import TAMIL_NADU_DISTRICTS
from backend.train_model import (
    clamp,
    compute_scenario_envelope,
    compute_sensitivity,
    evaluate_5x5_grid,
    generate_experimental_forecast,
    load_or_train_model,
    predict_batch,
    predict_single,
    run_monte_carlo_sklearn,
)
from backend.weather_service import (
    build_synthetic_tamilnadu_districts,
    get_tamilnadu_live_weather,
)


def get_secret_or_env(key: str, default: str = "") -> str:
    """Safely read server-side secret from Streamlit secrets or environment variables."""
    try:
        if key in st.secrets:
            val = st.secrets[key]
            if isinstance(val, str) and val.strip():
                return val.strip()
    except Exception:
        pass
    return (os.getenv(key) or default).strip()


def is_safe_backend_url(raw_url: str) -> bool:
    """Validate backend base URL scheme (http/https only)."""
    try:
        parsed = urlparse(raw_url.strip())
        return parsed.scheme in ("http", "https") and bool(parsed.netloc)
    except Exception:
        return False


@st.cache_resource(show_spinner="Training classical scikit-learn flood-risk model...")
def get_local_model_metadata() -> Dict[str, Any]:
    _, meta = load_or_train_model()
    return meta


@st.cache_data(ttl=600, show_spinner="Syncing Tamil Nadu weather telemetry...")
def fetch_cached_weather_local(refresh_token: int) -> Dict[str, Any]:
    _ = refresh_token  # cache key invalidation token
    api_key = get_secret_or_env("OPENWEATHER_API_KEY", "")
    return get_tamilnadu_live_weather(force_refresh=(refresh_token > 0), api_key_override=api_key)


def check_fastapi_health(base_url: str) -> Tuple[bool, Optional[Dict[str, Any]], Optional[str]]:
    if not is_safe_backend_url(base_url):
        return False, None, "Invalid FastAPI URL scheme"
    try:
        resp = requests.get(f"{base_url.rstrip('/')}/health", timeout=2.5)
        if resp.ok:
            return True, resp.json(), None
        return False, None, f"HTTP {resp.status_code}"
    except Exception as exc:
        return False, None, str(exc)


def fetch_model_info(use_fastapi: bool, base_url: str) -> Dict[str, Any]:
    if use_fastapi and is_safe_backend_url(base_url):
        try:
            resp = requests.get(f"{base_url.rstrip('/')}/model/info", timeout=3.0)
            if resp.ok:
                return resp.json()
        except Exception:
            pass
    return get_local_model_metadata()


def fetch_tamilnadu_weather(
    use_fastapi: bool,
    base_url: str,
    refresh_token: int = 0,
) -> Dict[str, Any]:
    if use_fastapi and is_safe_backend_url(base_url):
        try:
            resp = requests.get(
                f"{base_url.rstrip('/')}/weather/tamilnadu",
                params={"refresh": str(refresh_token > 0).lower()},
                timeout=8.0,
            )
            if resp.ok:
                data = resp.json()
                data["transport"] = "fastapi-backend"
                return data
        except Exception:
            pass

    data = fetch_cached_weather_local(refresh_token)
    data = {**data, "transport": "in-process-sklearn"}
    return data


def predict_via_backend(
    inputs: Dict[str, float],
    use_fastapi: bool,
    base_url: str,
) -> Dict[str, Any]:
    if use_fastapi and is_safe_backend_url(base_url):
        try:
            resp = requests.post(
                f"{base_url.rstrip('/')}/predict",
                json=inputs,
                timeout=3.5,
            )
            if resp.ok:
                body = resp.json()
                body["transport"] = "fastapi-backend"
                body["fallback_note"] = None
                return body
            raise RuntimeError(f"HTTP {resp.status_code}")
        except Exception as exc:
            local = predict_single(inputs)
            local["transport"] = "fallback-local-sklearn"
            local["fallback_note"] = (
                f"FastAPI unreachable ({exc}); computed locally with bundled scikit-learn model."
            )
            return local

    local = predict_single(inputs)
    local["transport"] = "in-process-sklearn"
    local["fallback_note"] = None
    return local


def run_montecarlo_via_backend(
    inputs: Dict[str, float],
    iterations: int,
    rain_unc: float,
    terrain_unc: float,
    drain_unc: float,
    threshold: float,
    seed: int,
    use_fastapi: bool,
    base_url: str,
) -> Dict[str, Any]:
    if use_fastapi and is_safe_backend_url(base_url):
        try:
            resp = requests.post(
                f"{base_url.rstrip('/')}/simulate/montecarlo",
                json={
                    **inputs,
                    "iterations": iterations,
                    "rainfall_uncertainty_pct": rain_unc,
                    "terrain_uncertainty_pct": terrain_unc,
                    "drainage_uncertainty_pct": drain_unc,
                    "high_risk_threshold": threshold,
                    "seed": seed,
                },
                timeout=6.0,
            )
            if resp.ok:
                out = resp.json()
                out["transport"] = "fastapi-backend"
                return out
        except Exception:
            pass

    out = run_monte_carlo_sklearn(
        inputs=inputs,
        iterations=iterations,
        rainfall_uncertainty_pct=rain_unc,
        terrain_uncertainty_pct=terrain_unc,
        drainage_uncertainty_pct=drain_unc,
        high_risk_threshold=threshold,
        seed=seed,
    )
    out["transport"] = "in-process-sklearn"
    return out


def build_active_districts(
    live_districts: List[Dict[str, Any]],
    simulator_inputs: Dict[str, float],
    selected_district_id: str,
    is_simulated_override: bool,
    simulation_scope: str,
    mitigated_ids: Dict[str, bool],
) -> List[Dict[str, Any]]:
    """
    Compute the live active 16-district list so moving ANY slider immediately
    reflects on the 3D Tamil Nadu map (either statewide or selected district only).
    """
    if not is_simulated_override:
        base_list = [dict(d) for d in live_districts]
    elif simulation_scope == "selected":
        base_list = []
        for dist in live_districts:
            if dist["id"] != selected_district_id:
                base_list.append(dict(dist))
            else:
                pred = predict_single(simulator_inputs)
                updated = dict(dist)
                updated["weather_source"] = "simulated-scenario"
                updated["observed_rainfall_mm"] = simulator_inputs["rainfall"]
                updated["inputs"] = dict(simulator_inputs)
                updated["risk_probability"] = pred["risk_probability"]
                updated["risk_category"] = pred["risk_category"]
                base_list.append(updated)
    else:
        raw_by_id = {d["id"]: d for d in live_districts}
        sim_all = build_synthetic_tamilnadu_districts(simulator_inputs, source_tag="simulated-scenario")
        base_list = []
        for dist in sim_all:
            raw = raw_by_id.get(dist["id"])
            if raw:
                dist["temperature_c"] = raw["temperature_c"]
                dist["humidity_pct"] = raw["humidity_pct"]
                dist["hourly_series"] = raw["hourly_series"]
            if dist["id"] == selected_district_id:
                pred = predict_single(simulator_inputs)
                dist["inputs"] = dict(simulator_inputs)
                dist["observed_rainfall_mm"] = simulator_inputs["rainfall"]
                dist["risk_probability"] = pred["risk_probability"]
                dist["risk_category"] = pred["risk_category"]
            base_list.append(dist)

    # Apply optional drainage pump relief test overrides
    if any(mitigated_ids.values()):
        mitigated_inputs = []
        mitigated_indices = []
        for idx, dist in enumerate(base_list):
            if mitigated_ids.get(dist["id"]):
                new_in = dict(dist["inputs"])
                new_in["drainage_risk"] = round(clamp(new_in["drainage_risk"] - 0.28, 0.05, 0.99), 2)
                dist["inputs"] = new_in
                mitigated_inputs.append(new_in)
                mitigated_indices.append(idx)
        if mitigated_inputs:
            preds = predict_batch(mitigated_inputs)
            for idx, pred in zip(mitigated_indices, preds):
                base_list[idx]["risk_probability"] = pred["risk_probability"]
                base_list[idx]["risk_category"] = pred["risk_category"]

    return base_list


__all__ = [
    "TAMIL_NADU_DISTRICTS",
    "build_active_districts",
    "check_fastapi_health",
    "compute_scenario_envelope",
    "compute_sensitivity",
    "evaluate_5x5_grid",
    "fetch_model_info",
    "fetch_tamilnadu_weather",
    "generate_experimental_forecast",
    "get_secret_or_env",
    "predict_via_backend",
    "run_montecarlo_via_backend",
]
