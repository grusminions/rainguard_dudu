"""
Classical scikit-learn Flood-Risk ML Training & Inference Engine
================================================================
Trains a classical scikit-learn RandomForestClassifier (benchmarked against
GradientBoostingClassifier) on a clearly labeled SYNTHETIC hydrological dataset
covering rainfall intensity, terrain slope, soil saturation, drainage risk,
and relative elevation.

IMPORTANT HONESTY DISCLOSURE:
- Training data is synthetically generated from hydrological stress heuristics
  for Smart India Hackathon 2026 demonstration purposes.
- Holdout accuracy / ROC-AUC metrics evaluate fit on synthetic test data only
  and do NOT claim validated real-world flood forecasting accuracy.
"""

from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import joblib
import numpy as np
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.metrics import accuracy_score, brier_score_loss, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from backend.districts import GRID_SECTORS

ARTIFACTS_DIR = Path(__file__).resolve().parent / "artifacts"
MODEL_PATH = ARTIFACTS_DIR / "flood_risk_model.joblib"
METADATA_PATH = ARTIFACTS_DIR / "model_metadata.json"

FEATURE_NAMES = [
    "rainfall",
    "slope",
    "soil_saturation",
    "drainage_risk",
    "elevation",
]

FEATURE_LABELS = {
    "rainfall": "Rainfall Intensity (mm/hr)",
    "slope": "Terrain Slope (deg)",
    "soil_saturation": "Soil Saturation (0-1)",
    "drainage_risk": "Drainage Risk (0-1)",
    "elevation": "Relative Elevation (0-100)",
}

_CACHED_MODEL: Optional[Pipeline] = None
_CACHED_METADATA: Optional[Dict[str, Any]] = None


def clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, float(value)))


def classify_risk(probability: float) -> str:
    if probability >= 0.75:
        return "Very High"
    if probability >= 0.55:
        return "High"
    if probability >= 0.30:
        return "Moderate"
    return "Low"


def _synthetic_hydrological_probability(
    rainfall: np.ndarray,
    slope: np.ndarray,
    soil_saturation: np.ndarray,
    drainage_risk: np.ndarray,
    elevation: np.ndarray,
) -> np.ndarray:
    """
    Vectorized nonlinear synthetic flood-risk generator used ONLY to synthesize
    realistic labeled training samples for the classical scikit-learn models.
    """
    rain_norm = np.clip(rainfall / 110.0, 0.0, 1.45)
    rain_score = np.power(rain_norm, 1.08) * 2.25

    soil_score = (0.45 * soil_saturation + 0.85 * np.square(soil_saturation)) * 1.15
    drain_score = (0.55 * drainage_risk + 0.65 * np.power(drainage_risk, 1.7)) * 1.25
    elev_score = np.power(1.0 - np.clip(elevation, 0.0, 100.0) / 100.0, 1.25) * 1.25

    flat_waterlog = np.maximum(0.0, (8.0 - slope) / 8.0) * 0.48
    steep_flash = np.maximum(0.0, (slope - 12.0) / 33.0) * 0.68
    slope_score = (flat_waterlog + steep_flash + 0.12) * (
        0.4 + 0.6 * np.minimum(rainfall / 80.0, 1.0)
    )

    synergy = np.minimum(rainfall / 90.0, 1.2) * soil_saturation * drainage_risk * 0.85
    logit = rain_score + soil_score + drain_score + elev_score + slope_score + synergy - 3.38
    return np.clip(1.0 / (1.0 + np.exp(-logit)), 0.02, 0.99)


def generate_synthetic_dataset(
    n_samples: int = 4500, seed: int = 2026
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Generate a balanced synthetic demonstration dataset spanning dry pre-monsoon,
    coastal waterlogging, delta saturation, and Western Ghats flash-runoff regimes.
    """
    rng = np.random.default_rng(seed)

    # Mix uniform coverage with realistic skewed monsoon bursts
    n_uniform = n_samples // 2
    n_monsoon = n_samples - n_uniform

    rain_u = rng.uniform(0.0, 180.0, size=n_uniform)
    rain_m = np.clip(rng.gamma(shape=2.1, scale=32.0, size=n_monsoon), 0.0, 180.0)
    rainfall = np.concatenate([rain_u, rain_m])

    slope = np.concatenate(
        [
            rng.uniform(0.0, 45.0, size=n_uniform),
            np.clip(rng.exponential(scale=9.5, size=n_monsoon), 0.5, 45.0),
        ]
    )
    soil = np.clip(rng.beta(a=2.1, b=1.7, size=n_samples), 0.0, 1.0)
    drainage = np.clip(rng.beta(a=2.0, b=1.8, size=n_samples), 0.0, 1.0)
    elevation = np.clip(rng.uniform(0.0, 100.0, size=n_samples), 0.0, 100.0)

    # Shuffle rows deterministically
    order = rng.permutation(n_samples)
    X = np.column_stack([rainfall, slope, soil, drainage, elevation])[order]

    true_prob = _synthetic_hydrological_probability(
        X[:, 0], X[:, 1], X[:, 2], X[:, 3], X[:, 4]
    )
    # Draw stochastic binary flood event labels with realistic observation noise
    noisy_prob = np.clip(true_prob + rng.normal(0.0, 0.035, size=n_samples), 0.01, 0.99)
    y = (rng.random(n_samples) < noisy_prob).astype(int)
    return X, y, true_prob


def train_and_save_model(
    n_samples: int = 4500, seed: int = 2026
) -> Tuple[Pipeline, Dict[str, Any]]:
    """
    Train classical scikit-learn pipelines (RandomForestClassifier & GradientBoostingClassifier)
    on synthetic hydrological data, persist the best calibrated model via joblib, and save metadata.
    """
    global _CACHED_MODEL, _CACHED_METADATA

    X, y, _ = generate_synthetic_dataset(n_samples=n_samples, seed=seed)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, random_state=seed, stratify=y
    )

    rf_pipeline = Pipeline(
        steps=[
            ("scaler", StandardScaler()),
            (
                "clf",
                RandomForestClassifier(
                    n_estimators=160,
                    max_depth=12,
                    min_samples_leaf=6,
                    random_state=seed,
                    n_jobs=-1,
                ),
            ),
        ]
    )
    rf_pipeline.fit(X_train, y_train)
    rf_probs = rf_pipeline.predict_proba(X_test)[:, 1]
    rf_preds = (rf_probs >= 0.5).astype(int)

    gb_pipeline = Pipeline(
        steps=[
            ("scaler", StandardScaler()),
            (
                "clf",
                GradientBoostingClassifier(
                    n_estimators=120,
                    learning_rate=0.07,
                    max_depth=4,
                    random_state=seed,
                ),
            ),
        ]
    )
    gb_pipeline.fit(X_train, y_train)
    gb_probs = gb_pipeline.predict_proba(X_test)[:, 1]
    gb_preds = (gb_probs >= 0.5).astype(int)

    rf_brier = float(brier_score_loss(y_test, rf_probs))
    gb_brier = float(brier_score_loss(y_test, gb_probs))

    # Select whichever classical model has lower Brier score (better probability calibration)
    if gb_brier <= rf_brier:
        chosen_pipeline = gb_pipeline
        chosen_name = "GradientBoostingClassifier (scikit-learn)"
        chosen_probs = gb_probs
        chosen_preds = gb_preds
        chosen_brier = gb_brier
    else:
        chosen_pipeline = rf_pipeline
        chosen_name = "RandomForestClassifier (scikit-learn)"
        chosen_probs = rf_probs
        chosen_preds = rf_preds
        chosen_brier = rf_brier

    clf = chosen_pipeline.named_steps["clf"]
    raw_importances = getattr(clf, "feature_importances_", np.ones(len(FEATURE_NAMES)) / len(FEATURE_NAMES))
    importance_map = {
        name: round(float(val), 4) for name, val in zip(FEATURE_NAMES, raw_importances)
    }

    metadata: Dict[str, Any] = {
        "model_name": chosen_name,
        "library": "scikit-learn",
        "trained_on_synthetic_data": True,
        "n_samples": int(n_samples),
        "train_split": int(len(X_train)),
        "test_split": int(len(X_test)),
        "feature_names": FEATURE_NAMES,
        "feature_importances": importance_map,
        "synthetic_holdout_metrics": {
            "accuracy": round(float(accuracy_score(y_test, chosen_preds)), 4),
            "roc_auc": round(float(roc_auc_score(y_test, chosen_probs)), 4),
            "brier_score": round(chosen_brier, 4),
            "benchmark_rf_brier": round(rf_brier, 4),
            "benchmark_gb_brier": round(gb_brier, 4),
        },
        "trained_at_utc": datetime.now(timezone.utc).isoformat(),
        "honesty_disclaimer": (
            "Prototype classical scikit-learn model trained on synthetic demonstration data. "
            "Not calibrated on official IMD/MOSDAC flood observations."
        ),
    }

    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(chosen_pipeline, MODEL_PATH)
    METADATA_PATH.write_text(json.dumps(metadata, indent=2), encoding="utf-8")

    _CACHED_MODEL = chosen_pipeline
    _CACHED_METADATA = metadata
    return chosen_pipeline, metadata


def load_or_train_model(force_retrain: bool = False) -> Tuple[Pipeline, Dict[str, Any]]:
    """Load persisted scikit-learn pipeline from disk, or train automatically on first run."""
    global _CACHED_MODEL, _CACHED_METADATA

    if not force_retrain and _CACHED_MODEL is not None and _CACHED_METADATA is not None:
        return _CACHED_MODEL, _CACHED_METADATA

    if not force_retrain and MODEL_PATH.exists() and METADATA_PATH.exists():
        try:
            model = joblib.load(MODEL_PATH)
            metadata = json.loads(METADATA_PATH.read_text(encoding="utf-8"))
            _CACHED_MODEL = model
            _CACHED_METADATA = metadata
            return model, metadata
        except Exception:
            pass

    return train_and_save_model()


def _normalize_feature_row(inputs: Dict[str, float]) -> np.ndarray:
    return np.array(
        [
            [
                clamp(inputs.get("rainfall", 0.0), 0.0, 180.0),
                clamp(inputs.get("slope", 10.0), 0.0, 45.0),
                clamp(inputs.get("soil_saturation", 0.5), 0.0, 1.0),
                clamp(inputs.get("drainage_risk", 0.5), 0.0, 1.0),
                clamp(inputs.get("elevation", 30.0), 0.0, 100.0),
            ]
        ],
        dtype=float,
    )


def predict_single(inputs: Dict[str, float]) -> Dict[str, Any]:
    """Run classical scikit-learn predict_proba on a single 5-feature dictionary."""
    model, metadata = load_or_train_model()
    row = _normalize_feature_row(inputs)
    prob = float(clamp(model.predict_proba(row)[0, 1], 0.01, 0.99))
    category = classify_risk(prob)
    return {
        "risk_probability": round(prob, 4),
        "risk_category": category,
        "model_type": metadata["model_name"],
        "feature_importances": metadata["feature_importances"],
        "trained_on_synthetic_data": True,
    }


def predict_batch(items: List[Dict[str, float]]) -> List[Dict[str, Any]]:
    """Vectorized batch inference via classical scikit-learn."""
    if not items:
        return []
    model, metadata = load_or_train_model()
    matrix = np.vstack([_normalize_feature_row(item) for item in items])
    probs = np.clip(model.predict_proba(matrix)[:, 1], 0.01, 0.99)
    results: List[Dict[str, Any]] = []
    for p in probs:
        pf = float(p)
        results.append(
            {
                "risk_probability": round(pf, 4),
                "risk_category": classify_risk(pf),
                "model_type": metadata["model_name"],
            }
        )
    return results


def compute_scenario_envelope(inputs: Dict[str, float]) -> Dict[str, Any]:
    """Best-case, expected, and worst-case envelopes using the trained scikit-learn model."""
    best_inputs = {
        "rainfall": round(clamp(inputs["rainfall"] * 0.75, 0.0, 180.0), 1),
        "slope": inputs["slope"],
        "soil_saturation": round(clamp(inputs["soil_saturation"] - 0.12, 0.05, 0.99), 2),
        "drainage_risk": round(clamp(inputs["drainage_risk"] - 0.15, 0.05, 0.99), 2),
        "elevation": round(clamp(inputs["elevation"] + 8.0, 0.0, 100.0), 1),
    }
    worst_inputs = {
        "rainfall": round(clamp(inputs["rainfall"] * 1.28, 0.0, 180.0), 1),
        "slope": inputs["slope"],
        "soil_saturation": round(clamp(inputs["soil_saturation"] + 0.12, 0.05, 0.99), 2),
        "drainage_risk": round(clamp(inputs["drainage_risk"] + 0.14, 0.05, 0.99), 2),
        "elevation": round(clamp(inputs["elevation"] - 8.0, 0.0, 100.0), 1),
    }
    preds = predict_batch([best_inputs, inputs, worst_inputs])
    return {
        "best_case": {"inputs": best_inputs, **preds[0]},
        "expected": {"inputs": inputs, **preds[1]},
        "worst_case": {"inputs": worst_inputs, **preds[2]},
    }


def compute_sensitivity(inputs: Dict[str, float]) -> List[Dict[str, Any]]:
    """One-at-a-time feature perturbation sensitivity around active simulator inputs."""
    base_prob = predict_single(inputs)["risk_probability"]
    deltas = {
        "rainfall": (clamp(inputs["rainfall"] * 0.70, 0.0, 180.0), clamp(inputs["rainfall"] * 1.30 + 8.0, 0.0, 180.0)),
        "slope": (clamp(inputs["slope"] - 8.0, 0.0, 45.0), clamp(inputs["slope"] + 8.0, 0.0, 45.0)),
        "soil_saturation": (clamp(inputs["soil_saturation"] - 0.18, 0.0, 1.0), clamp(inputs["soil_saturation"] + 0.18, 0.0, 1.0)),
        "drainage_risk": (clamp(inputs["drainage_risk"] - 0.18, 0.0, 1.0), clamp(inputs["drainage_risk"] + 0.18, 0.0, 1.0)),
        "elevation": (clamp(inputs["elevation"] - 18.0, 0.0, 100.0), clamp(inputs["elevation"] + 18.0, 0.0, 100.0)),
    }
    rows: List[Dict[str, Any]] = []
    for key in FEATURE_NAMES:
        lo_val, hi_val = deltas[key]
        p_lo = predict_single({**inputs, key: lo_val})["risk_probability"]
        p_hi = predict_single({**inputs, key: hi_val})["risk_probability"]
        rows.append(
            {
                "key": key,
                "parameter": FEATURE_LABELS[key],
                "low_prob": round(min(p_lo, p_hi), 4),
                "high_prob": round(max(p_lo, p_hi), 4),
                "base_prob": round(base_prob, 4),
                "span": round(abs(p_hi - p_lo), 4),
            }
        )
    rows.sort(key=lambda r: r["span"], reverse=True)
    return rows


def run_monte_carlo_sklearn(
    inputs: Dict[str, float],
    iterations: int = 2500,
    rainfall_uncertainty_pct: float = 20.0,
    terrain_uncertainty_pct: float = 15.0,
    drainage_uncertainty_pct: float = 15.0,
    high_risk_threshold: float = 0.65,
    seed: int = 202604,
) -> Dict[str, Any]:
    """
    Vectorized Monte Carlo simulation executing 1,000 to 10,000 scenarios
    through the trained scikit-learn classifier.
    Note: Percentiles reflect synthetic input sensitivity, NOT statistically validated CIs.
    """
    model, metadata = load_or_train_model()
    n = int(clamp(iterations, 1000, 10000))
    rng = np.random.default_rng(int(seed))

    rain_sigma = max(2.5, inputs["rainfall"] * (rainfall_uncertainty_pct / 100.0) * 0.55)
    slope_sigma = max(1.0, inputs["slope"] * (terrain_uncertainty_pct / 100.0) * 0.55)
    elev_sigma = max(2.0, 100.0 * (terrain_uncertainty_pct / 100.0) * 0.22)
    soil_sigma = max(0.03, (drainage_uncertainty_pct / 100.0) * 0.42)
    drain_sigma = max(0.03, (drainage_uncertainty_pct / 100.0) * 0.48)

    rain_samples = np.clip(rng.normal(inputs["rainfall"], rain_sigma, size=n), 0.0, 180.0)
    slope_samples = np.clip(rng.normal(inputs["slope"], slope_sigma, size=n), 0.0, 45.0)
    soil_samples = np.clip(rng.normal(inputs["soil_saturation"], soil_sigma, size=n), 0.0, 1.0)
    drain_samples = np.clip(rng.normal(inputs["drainage_risk"], drain_sigma, size=n), 0.0, 1.0)
    elev_samples = np.clip(rng.normal(inputs["elevation"], elev_sigma, size=n), 0.0, 100.0)

    X_mc = np.column_stack([rain_samples, slope_samples, soil_samples, drain_samples, elev_samples])
    probs = np.clip(model.predict_proba(X_mc)[:, 1], 0.01, 0.99)

    p10, median, p90 = np.percentile(probs, [10, 50, 90])
    mean_prob = float(np.mean(probs))
    exceeding_pct = float(np.mean(probs >= high_risk_threshold) * 100.0)

    # 20-bin histogram (0%..100% in 5% steps)
    counts, edges = np.histogram(probs, bins=20, range=(0.0, 1.0))
    histogram = []
    for i in range(20):
        lo_pct = int(round(edges[i] * 100))
        hi_pct = int(round(edges[i + 1] * 100))
        mid = (edges[i] + edges[i + 1]) / 2.0
        histogram.append(
            {
                "range_label": f"{lo_pct}-{hi_pct}%",
                "mid_pct": round(mid * 100.0, 1),
                "count": int(counts[i]),
                "percent": round(float(counts[i]) / n * 100.0, 2),
                "category": classify_risk(mid),
            }
        )

    return {
        "iterations": n,
        "seed": int(seed),
        "model_type": metadata["model_name"],
        "high_risk_threshold": round(float(high_risk_threshold), 2),
        "p10": round(float(p10), 4),
        "median": round(float(median), 4),
        "mean": round(mean_prob, 4),
        "p90": round(float(p90), 4),
        "exceeding_threshold_pct": round(exceeding_pct, 1),
        "histogram": histogram,
        "disclaimer": (
            "Uncalibrated synthetic Monte Carlo percentiles — represents model sensitivity "
            "to input uncertainty rather than a statistically validated confidence interval."
        ),
    }


def evaluate_5x5_grid(
    base_inputs: Dict[str, float],
    mitigated_ids: Optional[Dict[str, bool]] = None,
) -> List[Dict[str, Any]]:
    """Evaluate all 25 synthetic catchment cells via vectorized scikit-learn inference."""
    mitigated_ids = mitigated_ids or {}
    cell_inputs_list: List[Dict[str, float]] = []
    for sector in GRID_SECTORS:
        drain_val = clamp(base_inputs["drainage_risk"] + sector["drain_off"], 0.05, 0.99)
        if mitigated_ids.get(sector["id"]):
            drain_val = clamp(drain_val - 0.28, 0.05, 0.99)
        cell_inputs_list.append(
            {
                "rainfall": round(clamp(base_inputs["rainfall"] * sector["rain_mult"], 0.0, 180.0), 1),
                "slope": round(clamp(base_inputs["slope"] + sector["slope_off"], 0.5, 45.0), 1),
                "soil_saturation": round(clamp(base_inputs["soil_saturation"] + sector["soil_off"], 0.05, 0.99), 2),
                "drainage_risk": round(drain_val, 2),
                "elevation": round(clamp(base_inputs["elevation"] + sector["elev_off"], 0.0, 100.0), 0),
            }
        )

    preds = predict_batch(cell_inputs_list)
    enriched: List[Dict[str, Any]] = []
    for sector, c_in, pred in zip(GRID_SECTORS, cell_inputs_list, preds):
        enriched.append(
            {
                **sector,
                "inputs": c_in,
                "risk_probability": pred["risk_probability"],
                "risk_category": pred["risk_category"],
                "mitigated": bool(mitigated_ids.get(sector["id"], False)),
            }
        )
    return enriched


def generate_experimental_forecast(
    base_inputs: Dict[str, float],
    horizon_hours: int = 24,
    storm_pattern: str = "double-peak",
) -> List[Dict[str, Any]]:
    """
    Generate a clearly labeled EXPERIMENTAL hourly rainfall forecast (-12h to +horizon_hours)
    paired with classical scikit-learn risk estimates for every hour.
    """
    horizon = int(clamp(horizon_hours, 6, 48))
    base_rain = clamp(base_inputs["rainfall"], 0.0, 180.0)
    points_meta: List[Dict[str, Any]] = []
    feature_rows: List[Dict[str, float]] = []

    rolling_soil = clamp(base_inputs["soil_saturation"] - 0.08, 0.10, 0.98)

    for h in range(-12, horizon + 1):
        if h <= 0:
            # Historical synthetic recent trajectory ramping toward current rainfall
            ramp = 0.52 + ((h + 12) / 12.0) * 0.48
            ripple = math.sin((h + 12) * 0.65) * 0.08
            rain = clamp(base_rain * (ramp + ripple), 0.0, 180.0)
            phase = "historical"
        else:
            frac = h / max(1, horizon)
            if storm_pattern == "cloudburst":
                burst = math.exp(-(((h - 4.0) / 3.4) ** 2)) * 0.65
                decay = max(0.28, 1.0 - frac * 0.62)
                rain = clamp(base_rain * (decay + burst), 0.0, 180.0)
            elif storm_pattern == "sustained":
                wave = math.sin(h * 0.38) * 0.12
                rain = clamp(base_rain * (0.96 + wave - frac * 0.12), 0.0, 180.0)
            elif storm_pattern == "tapering":
                rain = clamp(base_rain * max(0.15, math.exp(-frac * 1.65)), 0.0, 180.0)
            else:
                # double-peak NE monsoon band
                peak1 = math.exp(-(((h - 5.0) / 4.2) ** 2)) * 0.34
                peak2 = math.exp(-(((h - 15.0) / 5.0) ** 2)) * 0.28
                base_curve = max(0.35, 0.92 - frac * 0.35)
                rain = clamp(base_rain * (base_curve + peak1 + peak2), 0.0, 180.0)
            phase = "forecast"

        rolling_soil = clamp(rolling_soil + rain * 0.00055 - 0.006, 0.08, 0.99)
        label = "Now" if h == 0 else (f"+{h}h" if h > 0 else f"{h}h")
        points_meta.append(
            {
                "hour_offset": h,
                "label": label,
                "phase": phase,
                "historical_rainfall": round(rain, 1) if phase == "historical" else None,
                "predicted_rainfall": round(rain, 1) if h >= 0 else None,
                "rainfall_mm": round(rain, 1),
            }
        )
        feature_rows.append(
            {
                **base_inputs,
                "rainfall": round(rain, 1),
                "soil_saturation": round(rolling_soil, 2),
            }
        )

    preds = predict_batch(feature_rows)
    for meta, pred in zip(points_meta, preds):
        meta["estimated_risk"] = pred["risk_probability"]
        meta["risk_pct"] = round(pred["risk_probability"] * 100.0, 1)
        meta["risk_category"] = pred["risk_category"]

    return points_meta


if __name__ == "__main__":
    _, meta = train_and_save_model()
    print("Trained classical scikit-learn flood-risk model successfully:")
    print(json.dumps(meta, indent=2))
