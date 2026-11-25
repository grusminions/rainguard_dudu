"""
Shared Visualization Builders for Streamlit (Dark Yellow + Yellow/Lavender Command Palette):
  - PyDeck Interactive 3D Tamil Nadu Hydrological Map (extruded district risk towers + flood aura rings)
  - Plotly 24-Hour Live Trends Dual-Axis Chart (hourly rainfall bars + flood-risk area/line)
  - Plotly 2D 5x5 Flood-Risk Heatmap
"""

from __future__ import annotations

import math
from typing import Any, Dict, List

import pandas as pd
import plotly.graph_objects as go
import pydeck as pdk
from plotly.subplots import make_subplots

from backend.districts import GRID_COL_LABELS, GRID_ROW_LABELS
from backend.train_model import clamp, predict_batch

RISK_COLORS_HEX = {
    "Low": "#86EFAC",
    "Moderate": "#FDE047",
    "High": "#FDBA74",
    "Very High": "#FCA5A5",
}

RISK_COLORS_RGBA = {
    "Low": [134, 239, 172, 225],
    "Moderate": [253, 224, 71, 235],
    "High": [253, 186, 116, 240],
    "Very High": [248, 113, 113, 250],
}

RISK_SYMBOLS = {
    "Low": "●",
    "Moderate": "◆",
    "High": "▲",
    "Very High": "✖",
}


def build_tamilnadu_3d_deck(
    districts: List[Dict[str, Any]],
    selected_district_id: str,
) -> pdk.Deck:
    """
    Build an interactive 3D PyDeck topographic column + inundation aura map across
    all 16 Tamil Nadu districts. Reacts immediately to every slider adjustment.
    """
    rows = []
    for d in districts:
        risk_prob = float(d["risk_probability"])
        risk_pct = round(risk_prob * 100.0, 1)
        is_selected = d["id"] == selected_district_id
        rgba = list(RISK_COLORS_RGBA.get(d["risk_category"], [250, 204, 21, 230]))
        aura_rgba = [rgba[0], rgba[1], rgba[2], 95 if is_selected else 55]

        rows.append(
            {
                "id": d["id"],
                "code": d["code"],
                "name": d["name"],
                "region": d["region"],
                "lat": d["lat"],
                "lon": d["lon"],
                "risk_pct": risk_pct,
                "risk_category": d["risk_category"],
                "symbol": RISK_SYMBOLS.get(d["risk_category"], "●"),
                "rainfall": round(float(d["inputs"]["rainfall"]), 1),
                "soil": round(float(d["inputs"]["soil_saturation"]), 2),
                "drainage": round(float(d["inputs"]["drainage_risk"]), 2),
                "temp_c": d.get("temperature_c", 29.0),
                "humidity": d.get("humidity_pct", 74),
                "column_height": int(14000 + risk_prob * 115000),
                "aura_radius": int(16000 + risk_prob * 28000 + float(d["inputs"]["rainfall"]) * 90),
                "color": rgba,
                "aura_color": aura_rgba,
                "stroke_color": [250, 204, 21, 255] if is_selected else [196, 181, 253, 120],
                "label": f"{d['code']} {int(round(risk_pct))}%",
            }
        )

    df = pd.DataFrame(rows)

    aura_layer = pdk.Layer(
        "ScatterplotLayer",
        data=df,
        get_position="[lon, lat]",
        get_radius="aura_radius",
        get_fill_color="aura_color",
        get_line_color="stroke_color",
        stroked=True,
        line_width_min_pixels=2,
        pickable=False,
    )

    tower_layer = pdk.Layer(
        "ColumnLayer",
        data=df,
        get_position="[lon, lat]",
        get_elevation="column_height",
        elevation_scale=1,
        radius=11500,
        get_fill_color="color",
        pickable=True,
        auto_highlight=True,
        extruded=True,
    )

    text_layer = pdk.Layer(
        "TextLayer",
        data=df,
        get_position="[lon, lat]",
        get_text="label",
        get_size=13,
        get_color=[251, 247, 232, 245],
        get_alignment_baseline="'bottom'",
        get_pixel_offset=[0, -14],
    )

    view_state = pdk.ViewState(
        latitude=10.85,
        longitude=78.45,
        zoom=6.1,
        pitch=48,
        bearing=-14,
    )

    tooltip = {
        "html": (
            "<div style='font-family:monospace;font-size:12px;background:#161307;"
            "color:#FBF7E8;border:1px solid #524824;padding:8px 10px;border-radius:6px;'>"
            "<div style='color:#C4B5FD;'><b>{name}</b> ({code}) · {region}</div>"
            "<div style='margin-top:4px;color:#FACC15;'>Flood Risk: <b>{symbol} {risk_pct}% ({risk_category})</b></div>"
            "<div>Rainfall: <b>{rainfall} mm/hr</b> · Soil: {soil} · Drain: {drainage}</div>"
            "<div style='color:#C8BE9C;'>Temp: {temp_c}°C · Humidity: {humidity}%</div>"
            "</div>"
        ),
        "style": {"backgroundColor": "transparent", "border": "none", "padding": "0"},
    }

    return pdk.Deck(
        layers=[aura_layer, tower_layer, text_layer],
        initial_view_state=view_state,
        map_style="dark",
        tooltip=tooltip,
    )


def build_live_trends_24h_figure(
    selected_district: Dict[str, Any],
    live_baseline_district: Dict[str, Any],
    simulator_inputs: Dict[str, float],
    is_simulated_active: bool,
    window_mode: str = "next-24h",
) -> tuple[go.Figure, Dict[str, float]]:
    """
    Build the 24-Hour 'Live Trends' dual-axis Plotly chart visualizing hourly rainfall
    intensity (mm/hr bars) and classical scikit-learn flood-risk probability (% area/line),
    updating in real time as simulator sliders are adjusted.
    """
    series = live_baseline_district.get("hourly_series") or []
    now_idx = next((i for i, p in enumerate(series) if p.get("hour_offset") == 0), 0)

    if window_mode == "rolling-24h":
        start = max(0, min(now_idx - 6, max(0, len(series) - 24)))
    else:
        start = min(now_idx, max(0, len(series) - 24))
    window_pts = series[start : start + 24]

    base_now_rain = float(live_baseline_district["inputs"]["rainfall"])
    target_inputs = simulator_inputs if is_simulated_active else selected_district["inputs"]

    labels: List[str] = []
    live_rain: List[float] = []
    live_risk: List[float] = []
    active_rain: List[float] = []
    feature_rows: List[Dict[str, float]] = []

    for pt in window_pts:
        h = int(pt.get("hour_offset", 0))
        labels.append(str(pt.get("label", f"{h}h")))
        l_rain = float(pt.get("rainfall_mm", 0.0))
        l_risk = round(float(pt.get("estimated_risk", 0.1)) * 100.0, 1)
        live_rain.append(l_rain)
        live_risk.append(l_risk)

        if not is_simulated_active:
            sim_rain = l_rain
            sim_soil = float(pt.get("soil_saturation", target_inputs["soil_saturation"]))
        else:
            if h == 0:
                sim_rain = round(clamp(target_inputs["rainfall"], 0.0, 180.0), 1)
            elif base_now_rain > 2.0:
                factor = clamp(l_rain / base_now_rain, 0.30, 1.90)
                sim_rain = round(clamp(target_inputs["rainfall"] * factor, 0.0, 180.0), 1)
            else:
                storm_wave = 0.76 + math.cos(h * 0.24) * 0.24 + math.sin((h + 5) * 0.41) * 0.10
                sim_rain = round(clamp(target_inputs["rainfall"] * storm_wave + l_rain * 0.5, 0.0, 180.0), 1)

            soil_delta = (
                float(pt.get("soil_saturation", target_inputs["soil_saturation"]))
                - float(live_baseline_district["inputs"]["soil_saturation"])
            ) * 0.55
            sim_soil = round(
                clamp(
                    target_inputs["soil_saturation"]
                    + soil_delta
                    + (sim_rain - target_inputs["rainfall"]) * 0.0008,
                    0.05,
                    0.99,
                ),
                2,
            )

        active_rain.append(sim_rain)
        feature_rows.append(
            {
                **target_inputs,
                "rainfall": sim_rain,
                "soil_saturation": sim_soil,
            }
        )

    if is_simulated_active and feature_rows:
        preds = predict_batch(feature_rows)
        active_risk = [round(p["risk_probability"] * 100.0, 1) for p in preds]
    else:
        active_risk = list(live_risk)

    fig = make_subplots(specs=[[{"secondary_y": True}]])

    fig.add_trace(
        go.Bar(
            x=labels,
            y=active_rain,
            name="Simulated Rain (mm/hr)" if is_simulated_active else "Hourly Rain (mm/hr)",
            marker_color="rgba(250, 204, 21, 0.64)",
            marker_line_color="#FACC15",
            marker_line_width=0.6,
            hovertemplate="%{x}<br>Rainfall: <b>%{y:.1f} mm/hr</b><extra></extra>",
        ),
        secondary_y=False,
    )

    if is_simulated_active:
        fig.add_trace(
            go.Scatter(
                x=labels,
                y=live_risk,
                name="Live Baseline Risk (%)",
                mode="lines",
                line=dict(color="#968D6D", width=1.8, dash="dash"),
                hovertemplate="%{x}<br>Live Baseline Risk: <b>%{y:.1f}%</b><extra></extra>",
            ),
            secondary_y=True,
        )

    fig.add_trace(
        go.Scatter(
            x=labels,
            y=active_risk,
            name="Simulated Flood Risk (%)" if is_simulated_active else "Estimated Flood Risk (%)",
            mode="lines",
            line=dict(color="#C4B5FD", width=2.8),
            fill="tozeroy",
            fillcolor="rgba(196, 181, 253, 0.14)",
            hovertemplate="%{x}<br>Flood Risk: <b>%{y:.1f}%</b><extra></extra>",
        ),
        secondary_y=True,
    )

    fig.add_hline(
        y=65,
        line_dash="dot",
        line_color="rgba(252, 165, 165, 0.55)",
        annotation_text="65% High-Risk Threshold",
        annotation_font_color="#FCA5A5",
        annotation_font_size=11,
        secondary_y=True,
    )

    if "Now" in labels:
        fig.add_vline(
            x="Now",
            line_dash="dash",
            line_color="#FACC15",
            line_width=1.2,
        )

    fig.update_layout(
        paper_bgcolor="#1F1B0B",
        plot_bgcolor="#161307",
        font=dict(color="#FBF7E8", size=12),
        height=320,
        margin=dict(l=12, r=12, t=34, b=16),
        hovermode="x unified",
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="left", x=0),
        xaxis=dict(gridcolor="#2A2410", tickfont=dict(color="#C8BE9C")),
    )
    fig.update_yaxes(
        title_text="Rainfall (mm/hr)",
        title_font=dict(color="#FACC15"),
        tickfont=dict(color="#FACC15"),
        gridcolor="#2B2510",
        rangemode="tozero",
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

    now_pos = labels.index("Now") if "Now" in labels else 0
    metrics = {
        "peak_rain": max(active_rain) if active_rain else 0.0,
        "peak_risk": max(active_risk) if active_risk else 0.0,
        "high_risk_hours": float(sum(1 for r in active_risk if r >= 65.0)),
        "now_delta": round(active_risk[now_pos] - live_risk[now_pos], 1) if active_risk else 0.0,
    }
    return fig, metrics


def build_5x5_heatmap_figure(grid_cells: List[Dict[str, Any]]) -> go.Figure:
    """Build an interactive 2D 5x5 Flood-Risk Heatmap with distinct risk-tier color bands."""
    z = [[0.0] * 5 for _ in range(5)]
    text = [[""] * 5 for _ in range(5)]
    custom = [[""] * 5 for _ in range(5)]

    for cell in grid_cells:
        r, c = int(cell["row"]), int(cell["col"])
        pct = round(float(cell["risk_probability"]) * 100.0, 1)
        sym = RISK_SYMBOLS.get(cell["risk_category"], "●")
        mit_tag = " [MIT]" if cell.get("mitigated") else ""
        z[r][c] = pct
        text[r][c] = f"<b>{cell['id']}</b> {sym}<br>{int(round(pct))}%{mit_tag}"
        custom[r][c] = (
            f"<b>{cell['id']} · {cell['name']}</b> ({cell['zone']})<br>"
            f"Risk: {sym} {pct:.1f}% ({cell['risk_category']})<br>"
            f"Rain: {cell['inputs']['rainfall']} mm/hr · Slope: {cell['inputs']['slope']}°<br>"
            f"Soil: {cell['inputs']['soil_saturation']} · Drain: {cell['inputs']['drainage_risk']} · Elev: {cell['inputs']['elevation']}"
        )

    colorscale = [
        [0.00, "#1C3B24"],
        [0.29, "#245430"],
        [0.30, "#5C4D14"],
        [0.54, "#856E16"],
        [0.55, "#7C3F14"],
        [0.74, "#A64E15"],
        [0.75, "#7F1D1D"],
        [1.00, "#B91C1C"],
    ]

    fig = go.Figure(
        data=go.Heatmap(
            z=z,
            x=GRID_COL_LABELS,
            y=GRID_ROW_LABELS,
            zmin=0,
            zmax=100,
            colorscale=colorscale,
            text=text,
            texttemplate="%{text}",
            textfont=dict(size=12, color="#FBF7E8"),
            customdata=custom,
            hovertemplate="%{customdata}<extra></extra>",
            xgap=4,
            ygap=4,
            colorbar=dict(
                title="Risk %",
                tickvals=[15, 42, 65, 88],
                ticktext=["Low", "Moderate", "High", "Very High"],
                tickfont=dict(color="#C8BE9C"),
            ),
        )
    )
    fig.update_layout(
        paper_bgcolor="#1F1B0B",
        plot_bgcolor="#161307",
        font=dict(color="#FBF7E8"),
        height=430,
        margin=dict(l=10, r=10, t=14, b=10),
        yaxis=dict(autorange="reversed"),
    )
    return fig
