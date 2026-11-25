"""Interactive Flood-Risk Simulator View (Live 3D Tamil Nadu Map Reflection + Classical scikit-learn + 24h Live Trends)."""

from __future__ import annotations

import json
from typing import Any, Dict, List

import plotly.graph_objects as go
import streamlit as st

from streamlit_modules.api_client import (
    compute_scenario_envelope,
    compute_sensitivity,
    predict_via_backend,
    run_montecarlo_via_backend,
)
from streamlit_modules.charts import (
    RISK_COLORS_HEX,
    RISK_SYMBOLS,
    build_live_trends_24h_figure,
    build_tamilnadu_3d_deck,
)


def render_simulator_view(
    districts: List[Dict[str, Any]],
    live_baseline_districts: List[Dict[str, Any]],
    simulator_inputs: Dict[str, float],
    is_simulated_override: bool,
    simulation_scope: str,
    use_fastapi: bool,
    fastapi_url: str,
) -> None:
    st.markdown("### Flood-Risk Simulator & Live 3D Tamil Nadu Map Response")
    st.caption(
        "Powered by classical scikit-learn (`POST /predict` or bundled pipeline). "
        "Moving any slider updates the 3D Tamil Nadu map, inundation rings, and 24-hour Live Trends immediately."
    )

    selected_id = st.session_state["selected_district_id"]
    selected_dist = next((d for d in districts if d["id"] == selected_id), districts[0])
    live_baseline_dist = next(
        (d for d in live_baseline_districts if d["id"] == selected_id),
        live_baseline_districts[0],
    )

    # Top Action Row: Load live district baseline + scope toggle + revert to live
    r1, r2, r3 = st.columns([1.7, 1.5, 1.0])
    with r1:
        picked_baseline_id = st.selectbox(
            "Target Tamil Nadu District Baseline",
            options=[d["id"] for d in live_baseline_districts],
            index=[d["id"] for d in live_baseline_districts].index(live_baseline_dist["id"]),
            format_func=lambda did: next(
                f"{d['name']} ({d['code']}) · Live {d['inputs']['rainfall']:.1f} mm/h"
                for d in live_baseline_districts
                if d["id"] == did
            ),
            key="sim_baseline_picker",
        )
        if picked_baseline_id != selected_id:
            target = next(d for d in live_baseline_districts if d["id"] == picked_baseline_id)
            st.session_state["selected_district_id"] = target["id"]
            st.session_state["inputs"] = dict(target["inputs"])
            st.session_state["has_simulator_override"] = False
            st.rerun()

    with r2:
        next_scope = st.radio(
            "3D Map Reflection Scope",
            options=["statewide", "selected"],
            format_func=lambda s: "All 16 Districts" if s == "statewide" else f"{selected_dist['name']} Only",
            horizontal=True,
            index=0 if simulation_scope == "statewide" else 1,
            key="sim_scope_radio",
        )
        if next_scope != simulation_scope:
            st.session_state["simulation_scope"] = next_scope
            st.rerun()

    with r3:
        st.write("")
        if st.button("Revert to Live Weather", use_container_width=True, key="sim_revert_btn"):
            st.session_state["inputs"] = dict(live_baseline_dist["inputs"])
            st.session_state["has_simulator_override"] = False
            st.session_state["mitigated_districts"] = {}
            st.rerun()

    # Main Split: 5 Sliders (Left) + Live Synchronized 3D Tamil Nadu Map (Right)
    col_sliders, col_map = st.columns([1.0, 1.45], gap="large")

    with col_sliders:
        st.markdown("#### Hydrological Input Parameters")
        new_rain = st.slider(
            "Rainfall Intensity (mm/hour)",
            min_value=0.0,
            max_value=180.0,
            value=float(simulator_inputs["rainfall"]),
            step=1.0,
            key="sim_rain_slider",
        )
        new_slope = st.slider(
            "Terrain Slope (degrees)",
            min_value=0.0,
            max_value=45.0,
            value=float(simulator_inputs["slope"]),
            step=0.5,
            key="sim_slope_slider",
        )
        new_soil = st.slider(
            "Soil Saturation (0–1)",
            min_value=0.0,
            max_value=1.0,
            value=float(simulator_inputs["soil_saturation"]),
            step=0.01,
            key="sim_soil_slider",
        )
        new_drain = st.slider(
            "Drainage Risk (0–1)",
            min_value=0.0,
            max_value=1.0,
            value=float(simulator_inputs["drainage_risk"]),
            step=0.01,
            key="sim_drain_slider",
        )
        new_elev = st.slider(
            "Relative Elevation (0–100)",
            min_value=0.0,
            max_value=100.0,
            value=float(simulator_inputs["elevation"]),
            step=1.0,
            key="sim_elev_slider",
        )

        updated_inputs = {
            "rainfall": round(float(new_rain), 1),
            "slope": round(float(new_slope), 1),
            "soil_saturation": round(float(new_soil), 2),
            "drainage_risk": round(float(new_drain), 2),
            "elevation": round(float(new_elev), 0),
        }
        if updated_inputs != simulator_inputs:
            st.session_state["inputs"] = updated_inputs
            st.session_state["has_simulator_override"] = True
            st.rerun()

        prediction = predict_via_backend(simulator_inputs, use_fastapi, fastapi_url)
        sym = RISK_SYMBOLS.get(prediction["risk_category"], "●")

        st.divider()
        st.metric(
            label=f"Estimated Flood Risk ({prediction.get('model_type', 'scikit-learn')})",
            value=f"{prediction['risk_probability'] * 100:.1f}%",
            delta=f"{sym} {prediction['risk_category']} Risk · {prediction.get('transport', 'local')}",
        )
        st.progress(min(1.0, max(0.0, float(prediction["risk_probability"]))))
        if prediction.get("fallback_note"):
            st.warning(prediction["fallback_note"])

    with col_map:
        st.markdown("#### Live 3D Tamil Nadu Map (Real-Time Slider Reflection)")
        st.caption(
            f"Mode: {'Simulated Live' if is_simulated_override else 'Live Weather'} · "
            f"Scope: {'All 16 Districts' if simulation_scope == 'statewide' else selected_dist['name']}"
        )
        deck = build_tamilnadu_3d_deck(districts, selected_dist["id"])
        st.pydeck_chart(deck, use_container_width=True, height=440)

        delta_pct = round(
            (selected_dist["risk_probability"] - live_baseline_dist["risk_probability"]) * 100.0,
            1,
        )
        d1, d2, d3 = st.columns(3)
        d1.metric("Live Baseline Risk", f"{live_baseline_dist['risk_probability']*100:.1f}%")
        d2.metric("Active 3D Map Risk", f"{selected_dist['risk_probability']*100:.1f}%")
        d3.metric("Simulated Delta", f"{delta_pct:+.1f}%")

    st.divider()

    # Scenario Envelope + Embedded Monte Carlo Preview
    envelope = compute_scenario_envelope(simulator_inputs)
    mc_preview = run_montecarlo_via_backend(
        inputs=simulator_inputs,
        iterations=1500,
        rain_unc=20.0,
        terrain_unc=15.0,
        drain_unc=15.0,
        threshold=0.65,
        seed=int(st.session_state.get("mc_seed", 202604)),
        use_fastapi=use_fastapi,
        base_url=fastapi_url,
    )

    e_col, mc_col = st.columns([1.0, 1.35], gap="large")
    with e_col:
        st.markdown("#### Scenario Risk Envelope")
        st.metric(
            "Best-Case Scenario",
            f"{envelope['best_case']['risk_probability']*100:.1f}%",
            f"{envelope['best_case']['risk_category']} · Rain {envelope['best_case']['inputs']['rainfall']} mm/h",
        )
        st.metric(
            "Expected Scenario",
            f"{envelope['expected']['risk_probability']*100:.1f}%",
            f"{envelope['expected']['risk_category']} · Current Sliders",
        )
        st.metric(
            "Worst-Case Scenario",
            f"{envelope['worst_case']['risk_probability']*100:.1f}%",
            f"{envelope['worst_case']['risk_category']} · Rain {envelope['worst_case']['inputs']['rainfall']} mm/h",
        )

    with mc_col:
        st.markdown(f"#### Sensitivity Distribution ({mc_preview['iterations']:,} scikit-learn runs)")
        st.caption(mc_preview["disclaimer"])
        hist = mc_preview["histogram"]
        fig_mc = go.Figure(
            data=[
                go.Bar(
                    x=[b["range_label"] for b in hist],
                    y=[b["percent"] for b in hist],
                    marker_color=[RISK_COLORS_HEX.get(b["category"], "#FACC15") for b in hist],
                )
            ]
        )
        fig_mc.update_layout(
            paper_bgcolor="#1F1B0B",
            plot_bgcolor="#161307",
            font=dict(color="#FBF7E8"),
            height=240,
            margin=dict(l=8, r=8, t=12, b=8),
            yaxis_title="% of Runs",
        )
        st.plotly_chart(fig_mc, use_container_width=True)
        p1, p2, p3, p4 = st.columns(4)
        p1.metric("P10", f"{mc_preview['p10']*100:.1f}%")
        p2.metric("Median", f"{mc_preview['median']*100:.1f}%")
        p3.metric("P90", f"{mc_preview['p90']*100:.1f}%")
        p4.metric("≥65% Runs", f"{mc_preview['exceeding_threshold_pct']:.1f}%")

    st.divider()

    # Embedded 24-Hour Live Trends Chart inside Simulator
    st.markdown(f"#### Live Trends — {selected_dist['name']} 24-Hour Simulated vs. Live Baseline")
    fig_trends, trend_stats = build_live_trends_24h_figure(
        selected_district=selected_dist,
        live_baseline_district=live_baseline_dist,
        simulator_inputs=simulator_inputs,
        is_simulated_active=True,
        window_mode="next-24h",
    )
    tk1, tk2, tk3, tk4 = st.columns(4)
    tk1.metric("24h Peak Simulated Rain", f"{trend_stats['peak_rain']:.1f} mm/h")
    tk2.metric("24h Peak Simulated Risk", f"{trend_stats['peak_risk']:.1f}%")
    tk3.metric("Hours ≥ 65% Risk", f"{int(trend_stats['high_risk_hours'])} / 24 hrs")
    tk4.metric("Now vs. Live Baseline", f"{trend_stats['now_delta']:+.1f}%")
    st.plotly_chart(fig_trends, use_container_width=True)

    st.divider()

    # Sensitivity + FastAPI /predict JSON Inspector
    sens_col, api_col = st.columns([1.0, 1.15], gap="large")
    with sens_col:
        st.markdown("#### Feature Perturbation Sensitivity")
        sens_rows = compute_sensitivity(simulator_inputs)
        fig_s = go.Figure()
        for row in reversed(sens_rows):
            fig_s.add_trace(
                go.Bar(
                    y=[row["parameter"]],
                    x=[round((row["high_prob"] - row["low_prob"]) * 100.0, 1)],
                    base=round(row["low_prob"] * 100.0, 1),
                    orientation="h",
                    marker_color="#C4B5FD",
                    showlegend=False,
                    hovertemplate=(
                        f"<b>{row['parameter']}</b><br>"
                        f"Range: {row['low_prob']*100:.1f}% – {row['high_prob']*100:.1f}%<extra></extra>"
                    ),
                )
            )
        fig_s.add_vline(
            x=prediction["risk_probability"] * 100.0,
            line_color="#FACC15",
            line_width=2,
        )
        fig_s.update_layout(
            paper_bgcolor="#1F1B0B",
            plot_bgcolor="#161307",
            font=dict(color="#FBF7E8"),
            height=240,
            xaxis=dict(range=[0, 100], title="Flood Risk Range (%)"),
            margin=dict(l=8, r=8, t=12, b=8),
        )
        st.plotly_chart(fig_s, use_container_width=True)

    with api_col:
        st.markdown("#### FastAPI `POST /predict` Live Contract")
        j1, j2 = st.columns(2)
        with j1:
            st.caption("Request Payload")
            st.code(json.dumps(simulator_inputs, indent=2), language="json")
        with j2:
            st.caption("Response Payload")
            response_preview = {
                "risk_probability": round(float(prediction["risk_probability"]), 2),
                "risk_category": prediction["risk_category"],
                "model_type": prediction.get("model_type", "scikit-learn"),
            }
            st.code(json.dumps(response_preview, indent=2), language="json")
