"""Responder Intelligence & Preparedness Action Panel (Prototype — Never Sends Real Alerts)."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List

import pandas as pd
import streamlit as st

from backend.districts import INITIAL_CHECKLIST
from streamlit_modules.api_client import evaluate_5x5_grid
from streamlit_modules.charts import RISK_SYMBOLS


def render_responder_view(
    districts: List[Dict[str, Any]],
    simulator_inputs: Dict[str, float],
) -> None:
    st.markdown("### Responder Intelligence & Preparedness Desk")
    st.warning(
        "PROTOTYPE TRAINING & SIMULATION AID ONLY — Never transmits real alerts, never dispatches "
        "emergency units, and does not issue official evacuation instructions."
    )

    sorted_districts = sorted(districts, key=lambda d: d["risk_probability"], reverse=True)
    top_risk = sorted_districts[0]
    high_districts = [d for d in sorted_districts if d["risk_category"] in ("High", "Very High")]
    grid_cells = evaluate_5x5_grid(simulator_inputs, st.session_state.get("mitigated_cells", {}))
    high_cells = sorted(
        [c for c in grid_cells if c["risk_category"] in ("High", "Very High")],
        key=lambda c: c["risk_probability"],
        reverse=True,
    )

    sym = RISK_SYMBOLS.get(top_risk["risk_category"], "●")

    s1, s2, s3, s4 = st.columns(4)
    s1.metric("Peak District Risk", f"{top_risk['risk_probability']*100:.1f}%", top_risk["name"])
    s2.metric("Highest Risk Tier", f"{sym} {top_risk['risk_category']}")
    s3.metric("Elevated TN Districts", f"{len(high_districts)} / {len(districts)}")
    s4.metric("Elevated 5×5 Sectors", f"{len(high_cells)} / 25")

    st.divider()

    left, right = st.columns([1.15, 1.0], gap="large")

    with left:
        st.markdown("#### Potentially Vulnerable Tamil Nadu Locations")
        vuln_df = pd.DataFrame(
            [
                {
                    "District": f"{d['name']} ({d['code']})",
                    "Region": d["region"],
                    "Risk %": round(d["risk_probability"] * 100.0, 1),
                    "Category": f"{RISK_SYMBOLS.get(d['risk_category'], '')} {d['risk_category']}",
                    "Rain (mm/h)": d["inputs"]["rainfall"],
                    "Drainage": d["inputs"]["drainage_risk"],
                    "Basin Focus": d["basin_note"],
                }
                for d in sorted_districts[:8]
            ]
        )
        st.dataframe(vuln_df, use_container_width=True, hide_index=True)

        st.markdown("#### Resource-Readiness Checklist (Interactive)")
        if "checklist" not in st.session_state:
            st.session_state["checklist"] = [dict(item) for item in INITIAL_CHECKLIST]

        checklist = st.session_state["checklist"]
        completed_count = 0
        for item in checklist:
            checked = st.checkbox(
                f"[{item['category']} · {item['priority']}] {item['label']}",
                value=bool(item["completed"]),
                key=f"resp_{item['id']}",
            )
            item["completed"] = checked
            if checked:
                completed_count += 1

        st.progress(completed_count / max(1, len(checklist)))
        st.caption(f"Readiness verification progress: {completed_count} / {len(checklist)} items checked")

        with st.form("add_checklist_form", clear_on_submit=True):
            c_in, c_cat, c_btn = st.columns([2.2, 1.0, 0.8])
            new_label = c_in.text_input("Add readiness action", placeholder="e.g., Inspect Adyar bridge gauge")
            new_cat = c_cat.selectbox("Category", ["Drainage", "Logistics", "Comms", "Shelters"])
            submitted = c_btn.form_submit_button("Add")
            if submitted and new_label.strip():
                checklist.append(
                    {
                        "id": f"chk-custom-{len(checklist) + 1}",
                        "label": new_label.strip(),
                        "category": new_cat,
                        "priority": "Standard",
                        "completed": False,
                    }
                )
                st.rerun()

    with right:
        st.markdown("#### Incident Summary")
        top_names = ", ".join(d["name"] for d in (high_districts[:4] or sorted_districts[:3]))
        st.info(
            f"**Simulated Assessment ({datetime.now().strftime('%Y-%m-%d %H:%M')})**\n\n"
            f"- **Highest modeled stress**: {top_risk['name']} ({top_risk['risk_probability']*100:.1f}%, "
            f"{top_risk['risk_category']} Risk) at {top_risk['inputs']['rainfall']:.1f} mm/hr.\n"
            f"- **Focus districts**: {top_names}.\n"
            f"- **Primary driver**: Combined rainfall intensity ({simulator_inputs['rainfall']:.1f} mm/hr), "
            f"soil saturation ({simulator_inputs['soil_saturation']:.2f}), and drainage risk "
            f"({simulator_inputs['drainage_risk']:.2f})."
        )

        st.markdown("#### Draft Emergency Alert (Review-Only Prototype)")
        alert_audience = st.selectbox(
            "Target Briefing Audience",
            ["District Control Room Briefing", "Municipal Drainage Crew Advisory", "Public Awareness Draft"],
            key="resp_audience",
        )

        draft_text = (
            f"[PROTOTYPE DRAFT — NOT AN OFFICIAL ALERT OR EVACUATION ORDER]\n"
            f"Audience: {alert_audience}\n"
            f"Scenario Tier: {top_risk['risk_category']} Flood-Risk Model Estimate "
            f"(Peak {top_risk['risk_probability']*100:.1f}%)\n"
            f"Monitored Focus Areas: {top_names}\n"
            f"Modeled Conditions: Rainfall {simulator_inputs['rainfall']:.1f} mm/hr | "
            f"Soil Saturation {simulator_inputs['soil_saturation']:.2f} | "
            f"Drainage Risk {simulator_inputs['drainage_risk']:.2f}\n\n"
            f"Suggested Internal Readiness Note:\n"
            f"Review pump staging, clear storm-water culverts in low-lying pockets, and await "
            f"verified advisories from official state disaster management authorities before taking action."
        )

        edited_draft = st.text_area(
            "Draft Alert Text (Editable for review; never transmitted)",
            value=draft_text,
            height=230,
            key="resp_draft_box",
        )
        st.download_button(
            label="Download Draft Briefing (.txt)",
            data=edited_draft,
            file_name="rainguard_prototype_briefing.txt",
            mime="text/plain",
            use_container_width=True,
        )
