"""
Inventory page — lot inventory with EUDR status and stock levels.
"""

from __future__ import annotations

import streamlit as st

from coffee_export.dashboard.utils import eudr_badge, format_ts, get_lots, kpi_card


def render() -> None:
    st.title("📦 Inventory")
    st.caption("Coffee lots — stock levels, EUDR compliance, QA status")

    # ── Filters ──
    col1, col2, col3, col4 = st.columns(4)

    with col1:
        region_filter = st.selectbox(
            "Region",
            options=["All", "Yirgacheffe", "Sidamo", "Guji", "Limu", "Jimma", "Harrar"],
        )
    with col2:
        process_filter = st.selectbox(
            "Process", options=["All", "Washed", "Natural", "Honey", "Anaerobic"]
        )
    with col3:
        status_filter = st.selectbox(
            "Status", options=["All", "active", "committed", "depleted", "hold"]
        )
    with col4:
        eudr_filter = st.selectbox("EUDR", options=["All", "complete", "partial", "missing"])

    region = None if region_filter == "All" else region_filter
    process = None if process_filter == "All" else process_filter
    status = None if status_filter == "All" else status_filter
    eudr = None if eudr_filter == "All" else eudr_filter

    lots = get_lots(region=region, process=process, status=status, eudr=eudr)

    # ── Summary Cards ──
    st.subheader(f"Results: {len(lots)} lot(s)")

    if lots:
        total_stock = sum(lot.get("stock_bags_remaining", 0) for lot in lots)
        complete_eudr = sum(1 for lot in lots if lot.get("eudr_data_status") == "complete")
        on_hold = sum(1 for lot in lots if lot.get("status") == "hold")

        col1, col2, col3 = st.columns(3)
        kpi_card(col1, "Total Stock", f"{total_stock} bags")
        kpi_card(col2, "EUDR Complete", f"{complete_eudr}/{len(lots)}")
        kpi_card(col3, "On Hold", on_hold)

    if not lots:
        st.info("No lots match the current filters.")
        return

    # ── Lot Table ──
    display_data = []
    for lot in lots:
        score = lot.get("cupping_score")
        score_display = f"{score:.1f}" if score else "—"

        display_data.append(
            {
                "Lot ID": lot.get("lot_id", ""),
                "Region": lot.get("region", ""),
                "Washing Station": lot.get("washing_station_name", ""),
                "Process": lot.get("process", ""),
                "Screen": lot.get("screen_size", "—"),
                "Score": score_display,
                "Stock (bags)": lot.get("stock_bags_remaining", 0),
                "EUDR": eudr_badge(lot.get("eudr_data_status", "missing")),
                "Crop Year": lot.get("crop_year", ""),
                "Status": lot.get("status", ""),
                "Updated": format_ts(lot.get("last_updated_ts")),
            }
        )

    st.dataframe(display_data, use_container_width=True, hide_index=True)

    # ── Lot Detail ──
    st.subheader("Lot Detail")
    lot_ids = [lot["lot_id"] for lot in lots]
    selected_id = st.selectbox("Select a lot to view details", options=lot_ids)

    if selected_id:
        selected_lot = next(lot for lot in lots if lot["lot_id"] == selected_id)

        col1, col2 = st.columns(2)
        with col1:
            st.write("**Lot ID:**", selected_lot.get("lot_id"))
            st.write("**Region:**", selected_lot.get("region"))
            st.write("**Washing Station:**", selected_lot.get("washing_station_name"))
            st.write("**Coop:**", selected_lot.get("coop_name"))
            st.write("**Process:**", selected_lot.get("process"))
            st.write("**Screen Size:**", selected_lot.get("screen_size"))
            st.write("**Crop Year:**", selected_lot.get("crop_year"))

        with col2:
            st.write("**Cupping Score:**", selected_lot.get("cupping_score"))
            st.write("**Q-Grader:**", selected_lot.get("q_grader_name", "—"))
            st.write("**Defects:**", selected_lot.get("defect_count_sca", "—"))
            st.write("**Moisture:**", f"{selected_lot.get('moisture_pct', '—')}%")
            st.write("**Stock:**", f"{selected_lot.get('stock_bags_remaining', 0)} bags")
            st.write("**EUDR:**", eudr_badge(selected_lot.get("eudr_data_status", "missing")))
            st.write("**Status:**", selected_lot.get("status"))

        # EUDR details
        st.write("**EUDR Details**")
        eudr_col1, eudr_col2, eudr_col3 = st.columns(3)
        eudr_col1.write("GPS Lat:", selected_lot.get("eudr_gps_lat", "—"))
        eudr_col2.write("GPS Lon:", selected_lot.get("eudr_gps_lon", "—"))
        eudr_col3.write(
            "Farmgate Price:", f"{selected_lot.get('eudr_farmgate_price_etb_per_kg', '—')} ETB/kg"
        )

        # Certifications
        certs = selected_lot.get("certifications", "")
        if certs:
            st.write("**Certifications:**", certs.replace(";", ", "))
