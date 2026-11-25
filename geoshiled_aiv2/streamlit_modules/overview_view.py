"""Overview Command Center View for Streamlit (6 KPIs, 3D Tamil Nadu Map / 2D 5x5 Grid Toggle, 24h Live Trends)."""

from __future__ import annotations

from typing import Any, Dict, List

import streamlit as st

from streamlit_modules.api_client import evaluate_5x5_grid
from streamlit_modules.charts import (
    RISK_SYMBOLS,
    build_5x5_heatmap_figure,
    build_live_trends_24h_figure,
    build_tamilnadu_3d_deck,
)


def render_overview_view(
    districts: List[Dict[str, Any]],
    live_baseline_districts: List[Dict[str, Any]],
    weather_meta: Dict[str, Any],
    simulator_inputs: Dict[str, float],
    is_simulated_override: bool,
    simulation_scope: str,
) -> None:
    st.markdown("### Command Overview — Tamil Nadu 3D Map & 5×5 Basin Heatmap")
    st.caption(
        f"{weather_meta.get('provider_label', 'Live Weather + scikit-learn')} · "
        "Prototype flood-risk model trained on synthetic demonstration data (not connected to official IMD/MOSDAC feeds)."
    )

    col_toggle, col_scope, col_revert = st.columns([2, 2, 1.2])
    with col_toggle:
        map_mode = st.radio(
            "Spatial Visualization Mode",
            options=["3D Tamil Nadu Map (16 Districts)", "2D 5×5 Basin Heatmap"],
            horizontal=True,
            key="overview_map_mode",
        )
    with col_scope:
        if is_simulated_override:
            next_scope = st.radio(
                "3D Simulation Scope",
                options=["statewide", "selected"],
                format_func=lambda s: "All 16 Districts" if s == "statewide" else "Selected District Only",
                horizontal=True,
                index=0 if simulation_scope == "statewide" else 1,
                key="overview_scope_radio",
            )
            st.session_state["simulation_scope"] = next_scope
    with col_revert:
        if is_simulated_override:
            if st.button("Revert to Live Weather", use_container_width=True, key="overview_revert_btn"):
                st.session_state["has_simulator_override"] = False
                st.session_state["mitigated_districts"] = {}
                st.rerun()

    grid_cells = evaluate_5x5_grid(
        simulator_inputs,
        st.session_state.get("mitigated_cells", {}),
    )

    is_3d = map_mode.startswith("3D")
    if is_3d:
        total_nodes = len(districts)
        avg_rain = sum(d["inputs"]["rainfall"] for d in districts) / total_nodes
        avg_risk = sum(d["risk_probability"] for d in districts) / total_nodes
        high_nodes = sum(1 for d in districts if d["risk_category"] in ("High", "Very High"))
        very_high_nodes = sum(1 for d in districts if d["risk_category"] == "Very High")
        sel_dist = next(
            (d for d in districts if d["id"] == st.session_state["selected_district_id"]),
            districts[0],
        )
        future_rain = [
            pt["rainfall_mm"] for pt in sel_dist.get("hourly_series", []) if pt.get("phase") == "forecast"
        ]
        forecast_peak = max(future_rain) if future_rain else avg_rain
    else:
        total_nodes = len(grid_cells)
        avg_rain = sum(c["inputs"]["rainfall"] for c in grid_cells) / total_nodes
        avg_risk = sum(c["risk_probability"] for c in grid_cells) / total_nodes
        high_nodes = sum(1 for c in grid_cells if c["risk_category"] in ("High", "Very High"))
        very_high_nodes = sum(1 for c in grid_cells if c["risk_category"] == "Very High")
        forecast_peak = max(c["inputs"]["rainfall"] for c in grid_cells)

    if very_high_nodes >= 3 or avg_risk >= 0.68:
        status_text = "✖ Severe Watch"
    elif high_nodes >= 4 or avg_risk >= 0.50:
        status_text = "▲ Elevated Watch"
    elif high_nodes >= 1 or avg_risk >= 0.30:
        status_text = "◆ Moderate Stress"
    else:
        status_text = "● Nominal Watch"

    # 6 Dynamic Command KPIs
    k1, k2, k3, k4, k5, k6 = st.columns(6)
    k1.metric("Monitored Nodes", f"{total_nodes}", "16 TN Districts" if is_3d else "5×5 Grid")
    k2.metric("Avg Rainfall", f"{avg_rain:.1f} mm/h")
    k3.metric("Mean Flood Risk", f"{avg_risk * 100:.1f}%")
    k4.metric("High-Risk Nodes", f"{high_nodes} / {total_nodes}", f"{very_high_nodes} Very High")
    k5.metric("24h Peak Forecast", f"{forecast_peak:.1f} mm/h")
    k6.metric("Scenario Status", status_text, "Simulated" if is_simulated_override else "Live Feed")

    st.divider()

    selected_id = st.session_state["selected_district_id"]
    selected_dist = next((d for d in districts if d["id"] == selected_id), districts[0])
    live_baseline_dist = next(
        (d for d in live_baseline_districts if d["id"] == selected_id),
        live_baseline_districts[0],
    )

    if is_3d:
        left, right = st.columns([1.45, 1.0], gap="large")
        with left:
            st.markdown("#### Interactive 3D Tamil Nadu Hydrological Map")
            st.caption("Hover towers for live telemetry · Heights and flood rings scale live with sliders")
            deck = build_tamilnadu_3d_deck(districts, selected_dist["id"])
            st.pydeck_chart(deck, use_container_width=True, height=460)

        with right:
            st.markdown("#### District Telemetry Inspector")
            dist_names = {d["id"]: f"{d['name']} ({d['code']}) — {d['risk_probability']*100:.0f}%" for d in districts}
            picked_id = st.selectbox(
                "Select Tamil Nadu District",
                options=[d["id"] for d in districts],
                index=[d["id"] for d in districts].index(selected_dist["id"]),
                format_func=lambda x: dist_names[x],
                key="overview_dist_select",
            )
            if picked_id != st.session_state["selected_district_id"]:
                st.session_state["selected_district_id"] = picked_id
                st.rerun()

            sym = RISK_SYMBOLS.get(selected_dist["risk_category"], "●")
            st.metric(
                label=f"{selected_dist['name']} · {selected_dist['region']}",
                value=f"{selected_dist['risk_probability'] * 100:.1f}%",
                delta=f"{sym} {selected_dist['risk_category']} Risk",
            )
            st.caption(selected_dist["basin_note"])

            m1, m2, m3 = st.columns(3)
            m1.metric("Rainfall", f"{selected_dist['inputs']['rainfall']:.1f} mm/h")
            m2.metric("Soil Sat.", f"{selected_dist['inputs']['soil_saturation']:.2f}")
            m3.metric("Drainage", f"{selected_dist['inputs']['drainage_risk']:.2f}")

            m4, m5, m6 = st.columns(3)
            m4.metric("Slope", f"{selected_dist['inputs']['slope']:.1f}°")
            m5.metric("Elevation", f"{selected_dist['elevation_meters']} m")
            m6.metric("Temp / RH", f"{selected_dist['temperature_c']}°C · {selected_dist['humidity_pct']}%")

            b1, b2 = st.columns(2)
            with b1:
                if st.button("Load into Simulator", use_container_width=True, key="load_dist_sim_btn"):
                    st.session_state["inputs"] = dict(selected_dist["inputs"])
                    st.session_state["active_tab_hint"] = "Loaded district into simulator sliders!"
                    st.toast(f"Loaded {selected_dist['name']} inputs into simulator sliders.")
                    st.rerun()
            with b2:
                mit_map = dict(st.session_state.get("mitigated_districts", {}))
                is_mit = bool(mit_map.get(selected_dist["id"], False))
                if st.button(
                    "Undo Pump Relief" if is_mit else "Test Pump Relief (-0.28)",
                    use_container_width=True,
                    key="toggle_dist_mit_btn",
                ):
                    mit_map[selected_dist["id"]] = not is_mit
                    st.session_state["mitigated_districts"] = mit_map
                    st.rerun()
    else:
        left, right = st.columns([1.45, 1.0], gap="large")
        with left:
            st.markdown("#### Interactive 5×5 Catchment Flood-Risk Heatmap")
            st.caption("Synthetic 25-sector micro-catchment grid scored by the classical scikit-learn model")
            st.plotly_chart(build_5x5_heatmap_figure(grid_cells), use_container_width=True)

        with right:
            st.markdown("#### 5×5 Sector Inspector")
            cell_lookup = {c["id"]: c for c in grid_cells}
            picked_cell_id = st.selectbox(
                "Inspect Grid Cell",
                options=[c["id"] for c in grid_cells],
                index=12,
                format_func=lambda cid: f"{cid} · {cell_lookup[cid]['name']} ({cell_lookup[cid]['risk_probability']*100:.0f}%)",
                key="overview_cell_select",
            )
            cell = cell_lookup[picked_cell_id]
            sym = RISK_SYMBOLS.get(cell["risk_category"], "●")
            st.metric(
                label=f"Sector {cell['id']} · {cell['zone']}",
                value=f"{cell['risk_probability'] * 100:.1f}%",
                delta=f"{sym} {cell['risk_category']} Risk",
            )
            c1, c2, c3 = st.columns(3)
            c1.metric("Rainfall", f"{cell['inputs']['rainfall']} mm/h")
            c2.metric("Slope", f"{cell['inputs']['slope']}°")
            c3.metric("Elevation", f"{int(cell['inputs']['elevation'])}/100")

            c4, c5 = st.columns(2)
            c4.metric("Soil Sat.", f"{cell['inputs']['soil_saturation']:.2f}")
            c5.metric("Drainage Risk", f"{cell['inputs']['drainage_risk']:.2f}")

            b1, b2 = st.columns(2)
            with b1:
                if st.button("Load Cell to Simulator", use_container_width=True, key="load_cell_sim"):
                    st.session_state["inputs"] = dict(cell["inputs"])
                    st.session_state["has_simulator_override"] = True
                    st.rerun()
            with b2:
                cell_mit = dict(st.session_state.get("mitigated_cells", {}))
                is_c_mit = bool(cell_mit.get(cell["id"], False))
                if st.button(
                    "Undo Mitigation" if is_c_mit else "Test Pump Relief",
                    use_container_width=True,
                    key="toggle_cell_mit",
                ):
                    cell_mit[cell["id"]] = not is_c_mit
                    st.session_state["mitigated_cells"] = cell_mit
                    st.rerun()

    st.divider()

    # Embedded 24-Hour Live Trends Chart inside Overview Dashboard
    t_head, t_win = st.columns([2.2, 1.0])
    with t_head:
        st.markdown(f"#### Live Trends — {selected_dist['name']} 24-Hour Rainfall & Flood-Risk")
    with t_win:
        win_mode = st.radio(
            "24h Window",
            options=["next-24h", "rolling-24h"],
            format_func=lambda w: "Next 24h" if w == "next-24h" else "-6h to +17h",
            horizontal=True,
            label_visibility="collapsed",
            key="overview_trends_win",
        )

    fig_trends, trend_stats = build_live_trends_24h_figure(
        selected_district=selected_dist,
        live_baseline_district=live_baseline_dist,
        simulator_inputs=simulator_inputs,
        is_simulated_active=is_simulated_override,
        window_mode=win_mode,
    )
    tk1, tk2, tk3, tk4 = st.columns(4)
    tk1.metric("24h Peak Rain", f"{trend_stats['peak_rain']:.1f} mm/h")
    tk2.metric("24h Peak Risk", f"{trend_stats['peak_risk']:.1f}%")
    tk3.metric("Hours ≥ 65% Risk", f"{int(trend_stats['high_risk_hours'])} / 24 hrs")
    tk4.metric(
        "Now vs. Live Baseline",
        f"{trend_stats['now_delta']:+.1f}%" if is_simulated_override else "Live Synced",
    )
    st.plotly_chart(fig_trends, use_container_width=True)
