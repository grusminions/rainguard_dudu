"""
RainGuard AI / GeoShield AI — Streamlit Command Center (Smart India Hackathon 2026)
===================================================================================
Ready to run locally OR publish directly to Streamlit Community Cloud!

Run locally (with FastAPI backend):
    Terminal 1: uvicorn backend.main:app --reload --port 8000
    Terminal 2: streamlit run streamlit_app.py

Deploy to Streamlit Community Cloud:
    Main file path: streamlit_app.py
    Optional Secret in Streamlit Cloud Settings -> Secrets:
        OPENWEATHER_API_KEY = "your_openweather_api_key"
        FASTAPI_URL = "https://your-fastapi-host.example.com"  # optional; runs bundled scikit-learn automatically if omitted
"""

from __future__ import annotations

import sys
from pathlib import Path

_APP_ROOT = str(Path(__file__).resolve().parent)
if _APP_ROOT not in sys.path:
    sys.path.insert(0, _APP_ROOT)

import streamlit as st

from backend.districts import SCENARIO_PRESETS
from streamlit_modules.api_client import (
    build_active_districts,
    check_fastapi_health,
    fetch_model_info,
    fetch_tamilnadu_weather,
    get_secret_or_env,
)
from streamlit_modules.forecast_view import render_forecast_view
from streamlit_modules.montecarlo_view import render_montecarlo_view
from streamlit_modules.overview_view import render_overview_view
from streamlit_modules.responder_view import render_responder_view
from streamlit_modules.simulator_view import render_simulator_view

st.set_page_config(
    page_title="RainGuard AI · Flood-Risk Intelligence Command",
    page_icon="⚡",
    layout="wide",
    initial_sidebar_state="expanded",
)

# Dark Yellow (#161307 / #1F1B0B) + Yellow (#FACC15) + Lavender (#C4B5FD) Command Styling
st.markdown(
    """
    <style>
      .stApp {
        background-color: #161307;
        color: #FBF7E8;
      }
      section[data-testid="stSidebar"] {
        background-color: #1A1609;
        border-right: 1px solid #3C351A;
      }
      div[data-testid="stMetric"] {
        background-color: #1F1B0B;
        border: 1px solid #3C351A;
        border-radius: 8px;
        padding: 12px 14px;
      }
      div[data-testid="stMetricLabel"] {
        color: #C8BE9C !important;
        font-size: 0.78rem !important;
      }
      div[data-testid="stMetricValue"] {
        color: #FACC15 !important;
      }
      .stTabs [data-baseweb="tab-list"] {
        gap: 8px;
        border-bottom: 1px solid #3C351A;
      }
      .stTabs [data-baseweb="tab"] {
        background-color: #1F1B0B;
        border: 1px solid #3C351A;
        border-radius: 6px 6px 0 0;
        color: #C8BE9C;
        padding: 8px 16px;
      }
      .stTabs [aria-selected="true"] {
        background-color: #2B2510 !important;
        border-color: #FACC15 !important;
        color: #FACC15 !important;
      }
      div.stButton > button {
        border: 1px solid #524824;
        background-color: #26210E;
        color: #FBF7E8;
      }
      div.stButton > button:hover {
        border-color: #FACC15;
        color: #FACC15;
      }
    </style>
    """,
    unsafe_allow_html=True,
)


def _init_session_state() -> None:
    default_preset = SCENARIO_PRESETS[0]
    defaults = {
        "inputs": dict(default_preset["inputs"]),
        "selected_district_id": "chennai",
        "has_simulator_override": False,
        "simulation_scope": "statewide",
        "mitigated_districts": {},
        "mitigated_cells": {},
        "weather_refresh_token": 0,
        "mc_seed": 202604,
        "mc_iterations": 2500,
        "forecast_horizon": 24,
        "use_fastapi": False,
        "fastapi_url": get_secret_or_env("FASTAPI_URL", "http://localhost:8000"),
    }
    for key, val in defaults.items():
        if key not in st.session_state:
            st.session_state[key] = val


def main() -> None:
    _init_session_state()

    # Sidebar: Presets, Global Sliders, FastAPI / scikit-learn / OpenWeatherMap Controls
    with st.sidebar:
        st.markdown("## RainGuard AI")
        st.caption("Smart India Hackathon 2026 · Flood-Risk Intelligence Prototype")

        st.markdown("#### Quick Scenario Presets")
        preset_cols = st.columns(2)
        for idx, preset in enumerate(SCENARIO_PRESETS):
            with preset_cols[idx % 2]:
                if st.button(preset["name"], use_container_width=True, key=f"preset_{preset['id']}"):
                    st.session_state["inputs"] = dict(preset["inputs"])
                    st.session_state["has_simulator_override"] = True
                    st.session_state["mitigated_districts"] = {}
                    st.session_state["mitigated_cells"] = {}
                    st.rerun()

        st.divider()
        st.markdown("#### Live Hydrological Controls")
        st.caption("Adjusting any slider reflects live on the 3D Tamil Nadu map & Live Trends")

        cur = st.session_state["inputs"]
        sb_rain = st.slider("Rainfall (mm/hr)", 0.0, 180.0, float(cur["rainfall"]), 1.0, key="sb_rain")
        sb_slope = st.slider("Slope (degrees)", 0.0, 45.0, float(cur["slope"]), 0.5, key="sb_slope")
        sb_soil = st.slider("Soil Saturation", 0.0, 1.0, float(cur["soil_saturation"]), 0.01, key="sb_soil")
        sb_drain = st.slider("Drainage Risk", 0.0, 1.0, float(cur["drainage_risk"]), 0.01, key="sb_drain")
        sb_elev = st.slider("Elevation (0–100)", 0.0, 100.0, float(cur["elevation"]), 1.0, key="sb_elev")

        sb_next = {
            "rainfall": round(float(sb_rain), 1),
            "slope": round(float(sb_slope), 1),
            "soil_saturation": round(float(sb_soil), 2),
            "drainage_risk": round(float(sb_drain), 2),
            "elevation": round(float(sb_elev), 0),
        }
        if sb_next != cur:
            st.session_state["inputs"] = sb_next
            st.session_state["has_simulator_override"] = True
            st.rerun()

        st.divider()
        st.markdown("#### Backend & Weather Connection")
        use_fastapi = st.toggle(
            "Connect to External FastAPI Server",
            value=bool(st.session_state["use_fastapi"]),
            help="When off (or on Streamlit Cloud standalone), runs the exact same classical scikit-learn model & OpenWeatherMap service in-process.",
            key="sb_use_fastapi",
        )
        st.session_state["use_fastapi"] = use_fastapi

        fastapi_url = st.text_input(
            "FastAPI Base URL",
            value=str(st.session_state["fastapi_url"]),
            disabled=not use_fastapi,
            key="sb_fastapi_url",
        )
        st.session_state["fastapi_url"] = fastapi_url

        if use_fastapi:
            ok, health_body, err = check_fastapi_health(fastapi_url)
            if ok and health_body:
                st.success(f"FastAPI online · {health_body.get('model_name', 'scikit-learn')}")
            else:
                st.warning(f"FastAPI offline ({err}) — using bundled scikit-learn fallback.")

        if st.button("Sync Live Weather Now", use_container_width=True, key="sb_refresh_weather"):
            st.session_state["weather_refresh_token"] = int(st.session_state["weather_refresh_token"]) + 1
            st.rerun()

        # Classical scikit-learn model summary card
        model_info = fetch_model_info(use_fastapi, fastapi_url)
        with st.expander("Classical scikit-learn Model Info", expanded=False):
            st.markdown(f"**Model**: `{model_info.get('model_name')}`")
            st.markdown(f"**Training Samples**: `{model_info.get('n_samples', 4500):,}` (synthetic)")
            m = model_info.get("synthetic_holdout_metrics", {})
            st.markdown(
                f"**Synthetic Holdout**: Acc `{m.get('accuracy', 0)*100:.1f}%` · "
                f"AUC `{m.get('roc_auc', 0):.3f}` · Brier `{m.get('brier_score', 0):.3f}`"
            )
            st.caption(model_info.get("honesty_disclaimer", ""))

    # Load live weather (OpenWeatherMap when OPENWEATHER_API_KEY is set -> Open-Meteo -> Synthetic)
    weather_payload = fetch_tamilnadu_weather(
        use_fastapi=bool(st.session_state["use_fastapi"]),
        base_url=str(st.session_state["fastapi_url"]),
        refresh_token=int(st.session_state["weather_refresh_token"]),
    )
    live_baseline_districts = weather_payload["districts"]

    active_districts = build_active_districts(
        live_districts=live_baseline_districts,
        simulator_inputs=st.session_state["inputs"],
        selected_district_id=st.session_state["selected_district_id"],
        is_simulated_override=bool(st.session_state["has_simulator_override"]),
        simulation_scope=str(st.session_state["simulation_scope"]),
        mitigated_ids=st.session_state.get("mitigated_districts", {}),
    )

    # Top Header Banner
    st.markdown("## RainGuard AI — Flood-Risk Intelligence & Simulation Platform")
    owm_status = (
        "OpenWeatherMap Live API"
        if weather_payload.get("source") == "openweathermap-live"
        else "Open-Meteo Live Fallback (set OPENWEATHER_API_KEY in secrets/env for OpenWeatherMap)"
        if weather_payload.get("source") == "open-meteo-fallback"
        else "Synthetic Tamil Nadu Monsoon Fallback"
    )
    st.caption(
        f"Weather Provider: {owm_status} · ML Engine: Classical scikit-learn · "
        f"Mode: {'Simulator Override Live on 3D Map' if st.session_state['has_simulator_override'] else 'Live Weather Feed'}"
    )

    tab_overview, tab_forecast, tab_sim, tab_mc, tab_responder = st.tabs(
        [
            "Overview & 3D Map",
            "Rainfall Forecast",
            "Flood-Risk Simulator",
            "Monte Carlo (1,000+)",
            "Responder Desk",
        ]
    )

    with tab_overview:
        render_overview_view(
            districts=active_districts,
            live_baseline_districts=live_baseline_districts,
            weather_meta=weather_payload,
            simulator_inputs=st.session_state["inputs"],
            is_simulated_override=bool(st.session_state["has_simulator_override"]),
            simulation_scope=str(st.session_state["simulation_scope"]),
        )

    with tab_forecast:
        render_forecast_view(simulator_inputs=st.session_state["inputs"])

    with tab_sim:
        render_simulator_view(
            districts=active_districts,
            live_baseline_districts=live_baseline_districts,
            simulator_inputs=st.session_state["inputs"],
            is_simulated_override=bool(st.session_state["has_simulator_override"]),
            simulation_scope=str(st.session_state["simulation_scope"]),
            use_fastapi=bool(st.session_state["use_fastapi"]),
            fastapi_url=str(st.session_state["fastapi_url"]),
        )

    with tab_mc:
        render_montecarlo_view(
            simulator_inputs=st.session_state["inputs"],
            use_fastapi=bool(st.session_state["use_fastapi"]),
            fastapi_url=str(st.session_state["fastapi_url"]),
        )

    with tab_responder:
        render_responder_view(
            districts=active_districts,
            simulator_inputs=st.session_state["inputs"],
        )

    st.divider()
    st.caption(
        "RainGuard AI · Smart India Hackathon 2026 Prototype · Classical scikit-learn model trained on synthetic demonstration data. "
        "Not connected to live IMD, MOSDAC, NWP, AWS, ESP32, or satellite agency feeds. Does not transmit alerts or issue official evacuation orders."
    )


if __name__ == "__main__":
    main()
