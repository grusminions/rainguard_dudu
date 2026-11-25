"""Monte Carlo Uncertainty Simulation View (1,000 - 10,000 vectorized scikit-learn runs)."""

from __future__ import annotations

from typing import Dict

import plotly.graph_objects as go
import streamlit as st

from streamlit_modules.api_client import run_montecarlo_via_backend
from streamlit_modules.charts import RISK_COLORS_HEX


def render_montecarlo_view(
    simulator_inputs: Dict[str, float],
    use_fastapi: bool,
    fastapi_url: str,
) -> None:
    st.markdown("### Monte Carlo Flood-Risk Simulation (1,000+ Vectorized scikit-learn Runs)")
    st.caption(
        "Uncalibrated synthetic sensitivity percentiles — demonstrates how uncertainty in rainfall, "
        "terrain slope/elevation, and drainage affects modeled risk. Not a statistically validated confidence interval."
    )

    c1, c2, c3, c4, c5 = st.columns([1.2, 1.0, 1.0, 1.0, 0.9])
    with c1:
        iterations = st.select_slider(
            "Scenarios",
            options=[1000, 2500, 5000, 10000],
            value=int(st.session_state.get("mc_iterations", 2500)),
            key="mc_iter_slider",
        )
        st.session_state["mc_iterations"] = iterations
    with c2:
        rain_unc = st.slider("Rainfall ±%", 5, 50, 20, step=5, key="mc_rain_unc")
    with c3:
        terrain_unc = st.slider("Terrain ±%", 5, 40, 15, step=5, key="mc_terrain_unc")
    with c4:
        drain_unc = st.slider("Drainage ±%", 5, 40, 15, step=5, key="mc_drain_unc")
    with c5:
        threshold = st.slider("High-Risk Cut", 0.45, 0.90, 0.65, step=0.05, key="mc_thresh")

    b_col, info_col = st.columns([1, 3])
    with b_col:
        if st.button("Rerun Simulation (New Seed)", use_container_width=True, key="mc_rerun_btn"):
            prev = int(st.session_state.get("mc_seed", 202604))
            st.session_state["mc_seed"] = ((prev * 1664525 + 1013904223) % 900000) + 100000
            st.rerun()

    seed = int(st.session_state.get("mc_seed", 202604))
    res = run_montecarlo_via_backend(
        inputs=simulator_inputs,
        iterations=iterations,
        rain_unc=float(rain_unc),
        terrain_unc=float(terrain_unc),
        drain_unc=float(drain_unc),
        threshold=float(threshold),
        seed=seed,
        use_fastapi=use_fastapi,
        base_url=fastapi_url,
    )

    with info_col:
        st.caption(
            f"Engine: {res.get('model_type', 'scikit-learn')} · Transport: {res.get('transport', 'local')} · Seed: {seed}"
        )

    k1, k2, k3, k4, k5 = st.columns(5)
    k1.metric("10th Percentile (P10)", f"{res['p10'] * 100:.1f}%")
    k2.metric("Median (P50)", f"{res['median'] * 100:.1f}%")
    k3.metric("Mean Risk", f"{res['mean'] * 100:.1f}%")
    k4.metric("90th Percentile (P90)", f"{res['p90'] * 100:.1f}%")
    k5.metric(
        f"Exceeding ≥{int(round(threshold * 100))}%",
        f"{res['exceeding_threshold_pct']:.1f}%",
        f"{res['iterations']:,} runs",
    )

    hist = res["histogram"]
    fig = go.Figure(
        data=[
            go.Bar(
                x=[b["range_label"] for b in hist],
                y=[b["percent"] for b in hist],
                marker_color=[RISK_COLORS_HEX.get(b["category"], "#FACC15") for b in hist],
                hovertemplate="Bin %{x}<br>Frequency: <b>%{y:.2f}%</b><extra></extra>",
            )
        ]
    )
    fig.update_layout(
        paper_bgcolor="#1F1B0B",
        plot_bgcolor="#161307",
        font=dict(color="#FBF7E8"),
        height=370,
        xaxis_title="Modeled Flood-Risk Probability Bin",
        yaxis_title="% of Simulated Scenarios",
        margin=dict(l=12, r=12, t=24, b=12),
    )
    st.plotly_chart(fig, use_container_width=True)
