"""
Live Weather Integration Service (OpenWeatherMap Primary + Open-Meteo & Synthetic Fallback)
===========================================================================================
Reads `OPENWEATHER_API_KEY` strictly from server-side environment variables
(`os.getenv("OPENWEATHER_API_KEY")`). Never exposes API keys in responses,
client bundles, or exception strings.

All 16 Tamil Nadu districts are scored in real time with the classical
scikit-learn flood-risk model (`backend.train_model.predict_batch`).
"""

from __future__ import annotations

import math
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

import requests
from dotenv import load_dotenv

from backend.districts import TAMIL_NADU_DISTRICTS
from backend.train_model import clamp, predict_batch

load_dotenv()

OWM_CURRENT_URL = "https://api.openweathermap.org/data/2.5/weather"
OWM_FORECAST_URL = "https://api.openweathermap.org/data/2.5/forecast"
OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"

CACHE_TTL_SECONDS = 600  # 10-minute server-side TTL cache for OpenWeatherMap free tier
_WEATHER_CACHE: Optional[Tuple[float, Dict[str, Any]]] = None


def _sanitize_error(message: str) -> str:
    """Strip any accidental API key query params before returning status notes."""
    return re.sub(r"appid=[^&\s]+", "appid=[REDACTED]", message)


def _format_hour_label(offset: int) -> str:
    if offset == 0:
        return "Now"
    return f"+{offset}h" if offset > 0 else f"{offset}h"


def _interpolate_owm_hourly_24h(
    current_rain: float,
    forecast_list: List[Dict[str, Any]],
    district: Dict[str, Any],
    base_soil: float,
) -> List[Dict[str, Any]]:
    """
    Convert OpenWeatherMap's 3-hour forecast blocks into a smooth 30-hour
    (-6h to +23h) hourly series for Live Trends & 24-hour dashboard charts.
    """
    now_utc = datetime.now(timezone.utc)
    # Extract 3-hourly rain rates (mm/hr = 3h volume / 3) from OWM forecast
    slot_rates: List[Tuple[float, float]] = [(0.0, current_rain)]
    for entry in forecast_list[:10]:
        dt_val = entry.get("dt")
        if not isinstance(dt_val, (int, float)):
            continue
        hr_diff = (dt_val - now_utc.timestamp()) / 3600.0
        rain_3h = 0.0
        rain_obj = entry.get("rain")
        if isinstance(rain_obj, dict):
            rain_3h = float(rain_obj.get("3h", rain_obj.get("1h", 0.0)) or 0.0)
        slot_rates.append((hr_diff, clamp(rain_3h / 3.0, 0.0, 180.0)))

    slot_rates.sort(key=lambda pair: pair[0])

    hourly_rows: List[Dict[str, Any]] = []
    feature_rows: List[Dict[str, float]] = []
    rolling_soil = clamp(base_soil - 0.04, 0.10, 0.98)

    for h in range(-6, 24):
        if h < 0:
            # Gentle synthetic ramp leading into current observation
            hr_rain = round(clamp(current_rain * (0.72 + ((h + 6) / 6.0) * 0.28), 0.0, 180.0), 1)
            phase = "observed"
        elif h == 0:
            hr_rain = round(clamp(current_rain, 0.0, 180.0), 1)
            phase = "observed"
        else:
            # Piecewise linear interpolation between 3-hour OpenWeatherMap slots
            interp = current_rain
            for idx in range(len(slot_rates) - 1):
                t0, v0 = slot_rates[idx]
                t1, v1 = slot_rates[idx + 1]
                if t0 <= h <= t1 and t1 > t0:
                    w = (h - t0) / (t1 - t0)
                    interp = v0 + (v1 - v0) * w
                    break
            else:
                interp = slot_rates[-1][1]
            hr_rain = round(clamp(interp, 0.0, 180.0), 1)
            phase = "forecast"

        rolling_soil = clamp(rolling_soil + hr_rain * 0.0006 - 0.004, 0.10, 0.99)
        ts = (now_utc + timedelta(hours=h)).isoformat()

        hourly_rows.append(
            {
                "time_iso": ts,
                "hour_offset": h,
                "label": _format_hour_label(h),
                "phase": phase,
                "rainfall_mm": hr_rain,
                "soil_saturation": round(rolling_soil, 2),
            }
        )
        feature_rows.append(
            {
                "rainfall": hr_rain,
                "slope": district["base_slope"],
                "soil_saturation": round(rolling_soil, 2),
                "drainage_risk": district["base_drainage_risk"],
                "elevation": district["relative_elevation"],
            }
        )

    preds = predict_batch(feature_rows)
    for row, pred in zip(hourly_rows, preds):
        row["estimated_risk"] = pred["risk_probability"]
        row["risk_pct"] = round(pred["risk_probability"] * 100.0, 1)

    return hourly_rows


def _fetch_single_owm_district(
    session: requests.Session, district: Dict[str, Any], api_key: str
) -> Dict[str, Any]:
    params = {
        "lat": district["lat"],
        "lon": district["lon"],
        "appid": api_key,
        "units": "metric",
    }
    cur_resp = session.get(OWM_CURRENT_URL, params=params, timeout=8.0)
    cur_resp.raise_for_status()
    cur = cur_resp.json()

    fc_list: List[Dict[str, Any]] = []
    try:
        fc_resp = session.get(OWM_FORECAST_URL, params={**params, "cnt": 9}, timeout=8.0)
        if fc_resp.status_code == 200:
            fc_list = fc_resp.json().get("list", [])
    except Exception:
        fc_list = []

    rain_obj = cur.get("rain") or {}
    current_rain = float(
        rain_obj.get("1h", (rain_obj.get("3h", 0.0) or 0.0) / 3.0) or 0.0
    )
    current_rain = round(clamp(current_rain, 0.0, 180.0), 1)

    main_obj = cur.get("main") or {}
    temp_c = round(float(main_obj.get("temp", 29.0)), 1)
    humidity_pct = int(round(float(main_obj.get("humidity", 72))))
    wind_ms = round(float((cur.get("wind") or {}).get("speed", 3.0)), 1)
    weather_desc = (
        (cur.get("weather") or [{}])[0].get("description", "observed").title()
    )

    # Estimate soil saturation nudged by live humidity & precipitation
    soil_sat = round(
        clamp(
            district["base_soil_saturation"]
            + (humidity_pct - 70) * 0.0025
            + min(current_rain * 0.003, 0.16),
            0.12,
            0.98,
        ),
        2,
    )

    inputs = {
        "rainfall": current_rain,
        "slope": district["base_slope"],
        "soil_saturation": soil_sat,
        "drainage_risk": district["base_drainage_risk"],
        "elevation": district["relative_elevation"],
    }

    hourly_series = _interpolate_owm_hourly_24h(current_rain, fc_list, district, soil_sat)

    return {
        **district,
        "weather_source": "openweathermap-live",
        "weather_description": weather_desc,
        "temperature_c": temp_c,
        "humidity_pct": humidity_pct,
        "wind_speed_ms": wind_ms,
        "observed_rainfall_mm": current_rain,
        "inputs": inputs,
        "hourly_series": hourly_series,
    }


def _fetch_openweathermap_all(api_key: str) -> List[Dict[str, Any]]:
    with requests.Session() as session:
        with ThreadPoolExecutor(max_workers=6) as pool:
            futures = [
                pool.submit(_fetch_single_owm_district, session, dist, api_key)
                for dist in TAMIL_NADU_DISTRICTS
            ]
            raw_districts = [f.result() for f in futures]

    preds = predict_batch([d["inputs"] for d in raw_districts])
    for d, pred in zip(raw_districts, preds):
        d["risk_probability"] = pred["risk_probability"]
        d["risk_category"] = pred["risk_category"]
    return raw_districts


def _fetch_open_meteo_fallback() -> List[Dict[str, Any]]:
    """Keyless Open-Meteo live fallback when OPENWEATHER_API_KEY is not configured."""
    lats = ",".join(f"{d['lat']:.4f}" for d in TAMIL_NADU_DISTRICTS)
    lons = ",".join(f"{d['lon']:.4f}" for d in TAMIL_NADU_DISTRICTS)

    resp = requests.get(
        OPEN_METEO_URL,
        params={
            "latitude": lats,
            "longitude": lons,
            "current": "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m",
            "hourly": "precipitation,soil_moisture_0_to_7cm",
            "past_hours": 6,
            "forecast_hours": 24,
            "timezone": "Asia/Kolkata",
        },
        timeout=8.0,
    )
    resp.raise_for_status()
    payload = resp.json()

    items = payload if isinstance(payload, list) else [payload]
    if len(items) != len(TAMIL_NADU_DISTRICTS):
        raise ValueError("Incomplete Open-Meteo multi-district response")

    raw_districts: List[Dict[str, Any]] = []
    for dist, item in zip(TAMIL_NADU_DISTRICTS, items):
        cur = item.get("current") or {}
        hourly = item.get("hourly") or {}
        times = hourly.get("time") or []
        precips = hourly.get("precipitation") or []
        soils = hourly.get("soil_moisture_0_to_7cm") or []

        now_idx = min(6, max(0, len(times) - 1))
        obs_rain = round(clamp(float(cur.get("precipitation", 0.0) or 0.0), 0.0, 180.0), 1)
        raw_soil = soils[now_idx] if now_idx < len(soils) else None
        soil_sat = (
            round(clamp(float(raw_soil) / 0.48, 0.12, 0.98), 2)
            if isinstance(raw_soil, (int, float))
            else dist["base_soil_saturation"]
        )

        inputs = {
            "rainfall": obs_rain,
            "slope": dist["base_slope"],
            "soil_saturation": soil_sat,
            "drainage_risk": dist["base_drainage_risk"],
            "elevation": dist["relative_elevation"],
        }

        hourly_rows: List[Dict[str, Any]] = []
        feat_rows: List[Dict[str, float]] = []
        for idx in range(max(0, now_idx - 6), min(len(times), now_idx + 24)):
            offset = idx - now_idx
            hr_rain = round(clamp(float(precips[idx] or 0.0), 0.0, 180.0), 1)
            hr_soil_raw = soils[idx] if idx < len(soils) else None
            hr_soil = (
                round(clamp(float(hr_soil_raw) / 0.48, 0.12, 0.98), 2)
                if isinstance(hr_soil_raw, (int, float))
                else soil_sat
            )
            hourly_rows.append(
                {
                    "time_iso": times[idx],
                    "hour_offset": offset,
                    "label": _format_hour_label(offset),
                    "phase": "observed" if offset <= 0 else "forecast",
                    "rainfall_mm": hr_rain,
                    "soil_saturation": hr_soil,
                }
            )
            feat_rows.append(
                {
                    "rainfall": hr_rain,
                    "slope": dist["base_slope"],
                    "soil_saturation": hr_soil,
                    "drainage_risk": dist["base_drainage_risk"],
                    "elevation": dist["relative_elevation"],
                }
            )

        hr_preds = predict_batch(feat_rows)
        for row, pred in zip(hourly_rows, hr_preds):
            row["estimated_risk"] = pred["risk_probability"]
            row["risk_pct"] = round(pred["risk_probability"] * 100.0, 1)

        raw_districts.append(
            {
                **dist,
                "weather_source": "open-meteo-fallback",
                "weather_description": "Live Open-Meteo Telemetry",
                "temperature_c": round(float(cur.get("temperature_2m", 29.0) or 29.0), 1),
                "humidity_pct": int(round(float(cur.get("relative_humidity_2m", 74) or 74))),
                "wind_speed_ms": round(float(cur.get("wind_speed_10m", 10.0) or 10.0) / 3.6, 1),
                "observed_rainfall_mm": obs_rain,
                "inputs": inputs,
                "hourly_series": hourly_rows,
            }
        )

    preds = predict_batch([d["inputs"] for d in raw_districts])
    for d, pred in zip(raw_districts, preds):
        d["risk_probability"] = pred["risk_probability"]
        d["risk_category"] = pred["risk_category"]
    return raw_districts


def build_synthetic_tamilnadu_districts(
    base_inputs: Optional[Dict[str, float]] = None,
    source_tag: str = "synthetic-fallback",
) -> List[Dict[str, Any]]:
    """Deterministic synthetic Tamil Nadu 16-district dataset scored via classical scikit-learn."""
    ref = base_inputs or {
        "rainfall": 52.0,
        "slope": 11.0,
        "soil_saturation": 0.68,
        "drainage_risk": 0.66,
        "elevation": 28.0,
    }
    now_utc = datetime.now(timezone.utc)
    slope_shift = (ref["slope"] - 15.0) * 0.25
    sat_shift = ref["soil_saturation"] - 0.65
    drain_shift = ref["drainage_risk"] - 0.60

    raw_districts: List[Dict[str, Any]] = []
    for idx, dist in enumerate(TAMIL_NADU_DISTRICTS):
        rain = round(clamp(ref["rainfall"] * dist["monsoon_multiplier"], 0.0, 180.0), 1)
        soil = round(clamp(dist["base_soil_saturation"] + sat_shift * 0.65, 0.08, 0.99), 2)
        drain = round(clamp(dist["base_drainage_risk"] + drain_shift * 0.65, 0.08, 0.99), 2)
        slope = round(clamp(dist["base_slope"] + slope_shift, 0.5, 45.0), 1)
        elev = dist["relative_elevation"]

        inputs = {
            "rainfall": rain,
            "slope": slope,
            "soil_saturation": soil,
            "drainage_risk": drain,
            "elevation": elev,
        }

        hourly_rows: List[Dict[str, Any]] = []
        feat_rows: List[Dict[str, float]] = []
        rolling_soil = clamp(soil - 0.08, 0.10, 0.97)
        for h in range(-6, 24):
            wave = math.sin((h + 6 + idx * 1.1) * 0.29) * 0.22 + math.cos((h + idx * 0.6) * 0.42) * 0.10
            trend = 0.68 + ((h + 6) / 6.0) * 0.32 if h <= 0 else 1.04 - (h / 24.0) * 0.22
            hr_rain = round(clamp(rain * (trend + wave), 0.2, 180.0), 1)
            rolling_soil = clamp(rolling_soil + hr_rain * 0.0005 - 0.006, 0.10, 0.99)
            hourly_rows.append(
                {
                    "time_iso": (now_utc + timedelta(hours=h)).isoformat(),
                    "hour_offset": h,
                    "label": _format_hour_label(h),
                    "phase": "observed" if h <= 0 else "forecast",
                    "rainfall_mm": hr_rain,
                    "soil_saturation": round(rolling_soil, 2),
                }
            )
            feat_rows.append({**inputs, "rainfall": hr_rain, "soil_saturation": round(rolling_soil, 2)})

        hr_preds = predict_batch(feat_rows)
        for row, pred in zip(hourly_rows, hr_preds):
            row["estimated_risk"] = pred["risk_probability"]
            row["risk_pct"] = round(pred["risk_probability"] * 100.0, 1)

        raw_districts.append(
            {
                **dist,
                "weather_source": source_tag,
                "weather_description": "Synthetic Monsoon Simulation",
                "temperature_c": round(29.5 - dist["elevation_meters"] * 0.0055 - rain * 0.02, 1),
                "humidity_pct": int(round(clamp(68 + rain * 0.22 + soil * 14, 52, 99))),
                "wind_speed_ms": round(clamp(3.2 + rain * 0.05, 1.5, 18.0), 1),
                "observed_rainfall_mm": rain,
                "inputs": inputs,
                "hourly_series": hourly_rows,
            }
        )

    preds = predict_batch([d["inputs"] for d in raw_districts])
    for d, pred in zip(raw_districts, preds):
        d["risk_probability"] = pred["risk_probability"]
        d["risk_category"] = pred["risk_category"]
    return raw_districts


def get_tamilnadu_live_weather(
    force_refresh: bool = False,
    api_key_override: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Fetch live weather + classical scikit-learn flood-risk predictions for all
    16 Tamil Nadu districts.
    Priority:
      1. OpenWeatherMap API (when OPENWEATHER_API_KEY env var is configured)
      2. Open-Meteo keyless live API (automatic fallback)
      3. Clearly labeled synthetic Tamil Nadu monsoon dataset (offline fallback)
    """
    global _WEATHER_CACHE
    now_ts = time.time()

    if not force_refresh and _WEATHER_CACHE is not None:
        cached_at, cached_payload = _WEATHER_CACHE
        if now_ts - cached_at < CACHE_TTL_SECONDS:
            return cached_payload

    api_key = (api_key_override or os.getenv("OPENWEATHER_API_KEY") or "").strip()
    synced_iso = datetime.now(timezone.utc).isoformat()
    owm_note: Optional[str] = None

    if api_key and api_key != "MY_OPENWEATHER_API_KEY":
        try:
            districts = _fetch_openweathermap_all(api_key)
            payload = {
                "source": "openweathermap-live",
                "provider_label": "OpenWeatherMap Live API + scikit-learn Risk Model",
                "openweather_configured": True,
                "synced_at_utc": synced_iso,
                "note": None,
                "districts": districts,
            }
            _WEATHER_CACHE = (now_ts, payload)
            return payload
        except Exception as exc:
            owm_note = f"OpenWeatherMap fetch failed ({_sanitize_error(str(exc))}); fell back automatically."

    # Secondary keyless live fallback: Open-Meteo
    try:
        districts = _fetch_open_meteo_fallback()
        note = owm_note or (
            "OPENWEATHER_API_KEY is not set in server environment — using keyless Open-Meteo live weather."
        )
        payload = {
            "source": "open-meteo-fallback",
            "provider_label": "Open-Meteo Live Fallback + scikit-learn Risk Model",
            "openweather_configured": bool(api_key and api_key != "MY_OPENWEATHER_API_KEY"),
            "synced_at_utc": synced_iso,
            "note": note,
            "districts": districts,
        }
        _WEATHER_CACHE = (now_ts, payload)
        return payload
    except Exception as exc:
        fallback_note = _sanitize_error(str(exc))
        districts = build_synthetic_tamilnadu_districts(source_tag="synthetic-fallback")
        payload = {
            "source": "synthetic-fallback",
            "provider_label": "Synthetic Tamil Nadu Demonstration Fallback + scikit-learn",
            "openweather_configured": bool(api_key and api_key != "MY_OPENWEATHER_API_KEY"),
            "synced_at_utc": synced_iso,
            "note": f"Live weather APIs unavailable ({fallback_note}) — displaying synthetic fallback dataset.",
            "districts": districts,
        }
        _WEATHER_CACHE = (now_ts, payload)
        return payload
