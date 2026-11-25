"""Experimental Rainfall Forecasting View for Streamlit."""

from __future__ import annotations

from typing import Dict

import plotly.graph_objects as go
import streamlit as st
from plotly.subplots import make_subplots

from streamlit_modules.api_client import generate_experimental_forecast


def render_forecast_view(simulator_inputs: Dict[str, float]) -> None:
    st.markdown("### Experimental Rainfall Forecasting Module")
    st.caption(
        "EXPERIMENTAL PROTOTYPE ESTIMATES ONLY — Illustrative hourly rainfall trajectories "
        "paired with classical scikit-learn risk estimates. Not connected to live IMD, MOSDAC, or NWP radar models."
    )

    c1, c2 = st.columns([1.2, 1.8])
    with c1:
        horizon = st.slider(
            "Forecast Horizon (Hours Ahead)",
            min_value=6,
            max_value=48,
            value=int(st.session_state.get("forecast_horizon", 24)),
            step=6,
            key="fc_horizon_slider",
        )
        st.session_state["forecast_horizon"] = horizon
    with c2:
        pattern = st.radio(
            "Synthetic Storm Pattern",
            options=["double-peak", "cloudburst", "sustained", "tapering"],
            format_func=lambda p: {
                "double-peak": "Double-Peak Monsoon",
                "cloudburst": "Cloudburst Surge",
                "sustained": "Sustained Band",
                "tapering": "Tapering Showers",
            }[p],
            horizontal=True,
            key="fc_pattern_radio",
        )

    points = generate_experimental_forecast(
        base_inputs=simulator_inputs,
        horizon_hours=horizon,
        storm_pattern=pattern,
    )

    future_pts = [p for p in points if p["phase"] == "forecast"]
    peak_rain = max((p["rainfall_mm"] for p in future_pts), default=0.0)
    total_rain = sum(p["rainfall_mm"] for p in future_pts)
    peak_risk = max((p["risk_pct"] for p in future_pts), default=0.0)
    hours_high = sum(1 for p in future_pts if p["risk_pct"] >= 65.0)

    m1, m2, m3, m4 = st.columns(4)
    m1.metric("Peak Forecast Rain", f"{peak_rain:.1f} mm/h")
    m2.metric(f"Cumulative ({horizon}h)", f"{total_rain:.1f} mm")
    m3.metric("Peak Forecast Risk", f"{peak_risk:.1f}%")
    m4.metric("Hours ≥ 65% Risk", f"{hours_high} / {horizon} hrs")

    labels = [p["label"] for p in points]
    hist_rain = [p["historical_rainfall"] for p in points]
    pred_rain = [p["predicted_rainfall"] for p in points]
    risk_pct = [p["risk_pct"] for p in points]

    fig = make_subplots(specs=[[{"secondary_y": True}]])
    fig.add_trace(
        go.Bar(
            x=labels,
            y=hist_rain,
            name="Recent Historical Rain (Synthetic)",
            marker_color="rgba(250, 204, 21, 0.78)",
        ),
        secondary_y=False,
    )
    fig.add_trace(
        go.Scatter(
            x=labels,
            y=pred_rain,
            name="Experimental Forecast Trend (mm/hr)",
            mode="lines+markers",
            line=dict(color="#FDE047", width=2.6, dash="dash"),
            marker=dict(size=5),
        ),
        secondary_y=False,
    )
    fig.add_trace(
        go.Scatter(
            x=labels,
            y=risk_pct,
            name="Modeled Flood-Risk Probability (%)",
            mode="lines",
            line=dict(color="#C4B5FD", width=2.5),
            fill="tozeroy",
            fillcolor="rgba(196, 181, 253, 0.12)",
        ),
        secondary_y=True,
    )
    fig.add_vline(x="Now", line_dash="dash", line_color="#FACC15", line_width=1.4)

    fig.update_layout(
        paper_bgcolor="#1F1B0B",
        plot_bgcolor="#161307",
        font=dict(color="#FBF7E8"),
        height=390,
        hovermode="x unified",
        margin=dict(l=12, r=12, t=34, b=12),
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="left", x=0),
    )
    fig.update_yaxes(
        title_text="Rainfall (mm/hr)",
        title_font=dict(color="#FACC15"),
        tickfont=dict(color="#FACC15"),
        gridcolor="#2B2510",
        secondary_y=False,
    )
    fig.update_yaxes(
        title_text="Flood Risk (%)",
        title_font=dict(color="#C4B5FD"),
        tickfont=dict(color="#C4B5FD"),
        range=[0, 100],
        showgrid=False,
        secondary_y=True,
    )

    st.plotly_chart(fig, use_container_width=True)
