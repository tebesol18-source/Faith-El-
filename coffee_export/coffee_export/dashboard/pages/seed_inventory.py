"""
Seed Inventory page — populate test lots so the full pipeline works.

Without lots in inventory, Agent 4 can't recommend samples and the
pipeline stalls. This page lets operators quickly seed test data.
"""

from __future__ import annotations

import streamlit as st

from coffee_export.database.base import now_addis_iso
from coffee_export.database.models import Coop, WashingStation
from coffee_export.state import StateManager

SEED_LOTS = [
    {
        "lot_id": "LOT-25-0001",
        "region": "Yirgacheffe",
        "washing_station_name": "Konga Station",
        "coop_name": "Yirgacheffe Union",
        "process": "Washed",
        "screen_size": 14,
        "cupping_score": 87.5,
        "crop_year": "25/26",
        "stock_bags_remaining": 45,
        "certifications": "organic",
        "eudr_data_status": "complete",
        "eudr_gps_lat": 6.1627,
        "eudr_gps_lon": 38.1964,
        "eudr_farmgate_price_etb_per_kg": 28.5,
        "eudr_deforestation_attestation": "signed",
    },
    {
        "lot_id": "LOT-25-0002",
        "region": "Yirgacheffe",
        "washing_station_name": "Idido Station",
        "coop_name": "Yirgacheffe Union",
        "process": "Natural",
        "screen_size": 14,
        "cupping_score": 88.2,
        "crop_year": "25/26",
        "stock_bags_remaining": 30,
        "certifications": "",
        "eudr_data_status": "complete",
        "eudr_gps_lat": 6.1750,
        "eudr_gps_lon": 38.2100,
        "eudr_farmgate_price_etb_per_kg": 29.0,
        "eudr_deforestation_attestation": "signed",
    },
    {
        "lot_id": "LOT-25-0003",
        "region": "Guji",
        "washing_station_name": "Hambela Station",
        "coop_name": "Hambela Co-op",
        "process": "Washed",
        "screen_size": 15,
        "cupping_score": 86.8,
        "crop_year": "25/26",
        "stock_bags_remaining": 60,
        "certifications": "organic;FT",
        "eudr_data_status": "complete",
        "eudr_gps_lat": 5.9847,
        "eudr_gps_lon": 38.2856,
        "eudr_farmgate_price_etb_per_kg": 27.5,
        "eudr_deforestation_attestation": "signed",
    },
    {
        "lot_id": "LOT-25-0004",
        "region": "Sidamo",
        "washing_station_name": "Bensa Station",
        "coop_name": "Bensa Co-op",
        "process": "Washed",
        "screen_size": 14,
        "cupping_score": 84.5,
        "crop_year": "25/26",
        "stock_bags_remaining": 80,
        "certifications": "",
        "eudr_data_status": "complete",
        "eudr_gps_lat": 6.3500,
        "eudr_gps_lon": 38.4500,
        "eudr_farmgate_price_etb_per_kg": 24.0,
        "eudr_deforestation_attestation": "signed",
    },
    {
        "lot_id": "LOT-25-0005",
        "region": "Guji",
        "washing_station_name": "Uraga Station",
        "coop_name": "Uraga Co-op",
        "process": "Natural",
        "screen_size": 14,
        "cupping_score": 88.0,
        "crop_year": "25/26",
        "stock_bags_remaining": 25,
        "certifications": "",
        "eudr_data_status": "partial",
        "eudr_gps_lat": 5.95,
        "eudr_gps_lon": 38.30,
        "eudr_farmgate_price_etb_per_kg": 0,
        "eudr_deforestation_attestation": "",
    },
]


def render() -> None:
    st.title("🌱 Seed Inventory")
    st.caption("Populate test lots so the full pipeline can run end-to-end")

    # Check current inventory
    with StateManager() as sm:
        lots = sm.list_lots(status="active")

    if lots:
        st.success(f"✅ Inventory has {len(lots)} active lot(s). The pipeline is ready.")
        st.dataframe(
            [
                {
                    "Lot ID": l.get("lot_id", ""),
                    "Region": l.get("region", ""),
                    "Process": l.get("process", ""),
                    "Score": l.get("cupping_score", ""),
                    "Stock": l.get("stock_bags_remaining", ""),
                    "EUDR": l.get("eudr_data_status", ""),
                }
                for l in lots
            ],
            use_container_width=True,
            hide_index=True,
        )
        st.divider()

    st.subheader("📋 Seed Data")
    st.markdown(f"""
    Click the button below to seed {len(SEED_LOTS)} test lots across:
    - **Yirgacheffe** (2 lots — Washed + Natural)
    - **Guji** (2 lots — Washed + Natural)
    - **Sidamo** (1 lot — Washed)

    Each lot includes:
    - Cupping scores (84–88+)
    - EUDR data (GPS, farmgate price, deforestation attestation)
    - Certifications (organic, Fairtrade)
    - Stock levels (25–80 bags)

    This gives Agent 4 lots to recommend when buyers are qualified.
    """)

    if st.button("🌱 Seed Test Lots", type="primary", use_container_width=True):
        _seed_lots()

    st.divider()

    # Pipeline explanation
    st.subheader("🔗 How This Connects the Pipeline")
    st.markdown("""
    ```
    1. 📥 Import Leads → Agent 2 enriches buyers
    2. 🌱 Seed Inventory → Agent 1 has lots to confirm
    3. 🤖 Run Agent 3 → outreach sequences start
    4. Agent 3 qualifies buyers → publishes LEAD_QUALIFIED
    5. Agent 4 recommends lots (from this inventory) → sends samples
    6. Agent 1 confirms lots (validates stock + EUDR)
    7. Agent 4 records cupping → makes decision
    8. Agent 5 creates contract → Agent 6 ships → Agent 7 manages relationship
    ```

    **Without seeded inventory, Agent 4 has no lots to recommend and the pipeline stalls.**
    """)


def _seed_lots() -> None:
    """Seed the inventory with test lots."""
    with StateManager() as sm:
        now = now_addis_iso()

        # Create coops and stations (idempotent)
        coops_stations = [
            (
                "COOP-001",
                "Yirgacheffe Union",
                "Yirgacheffe",
                "ST-001",
                "Konga Station",
                6.1627,
                38.1964,
            ),
            (
                "COOP-002",
                "Yirgacheffe Union",
                "Yirgacheffe",
                "ST-002",
                "Idido Station",
                6.1750,
                38.2100,
            ),
            ("COOP-003", "Hambela Co-op", "Guji", "ST-003", "Hambela Station", 5.9847, 38.2856),
            ("COOP-004", "Bensa Co-op", "Sidamo", "ST-004", "Bensa Station", 6.3500, 38.4500),
            ("COOP-005", "Uraga Co-op", "Guji", "ST-005", "Uraga Station", 5.9500, 38.3000),
        ]

        for coop_id, coop_name, region, station_id, station_name, lat, lon in coops_stations:
            from sqlalchemy import select as sa_select

            existing = sm.session.execute(
                sa_select(Coop).where(Coop.coop_id == coop_id)
            ).scalar_one_or_none()
            if not existing:
                sm.session.add(
                    Coop(
                        coop_id=coop_id,
                        name=coop_name,
                        region=region,
                        created_ts=now,
                        updated_ts=now,
                    )
                )

            existing_st = sm.session.execute(
                sa_select(WashingStation).where(WashingStation.station_id == station_id)
            ).scalar_one_or_none()
            if not existing_st:
                sm.session.add(
                    WashingStation(
                        station_id=station_id,
                        coop_id=coop_id,
                        name=station_name,
                        region=region,
                        gps_lat=lat,
                        gps_lon=lon,
                        created_ts=now,
                        updated_ts=now,
                    )
                )
        sm._commit()

        # Map lots to stations
        station_map = {
            "LOT-25-0001": ("ST-001", "COOP-001"),
            "LOT-25-0002": ("ST-002", "COOP-001"),
            "LOT-25-0003": ("ST-003", "COOP-003"),
            "LOT-25-0004": ("ST-004", "COOP-004"),
            "LOT-25-0005": ("ST-005", "COOP-005"),
        }

        added = 0
        skipped = 0
        for lot_data in SEED_LOTS:
            lot_id = lot_data["lot_id"]
            station_id, coop_id = station_map.get(lot_id, ("ST-001", "COOP-001"))

            # Check if lot already exists
            existing_lot = sm.get_lot(lot_id)
            if existing_lot:
                skipped += 1
                continue

            lot_data["station_id"] = station_id
            lot_data["coop_id"] = coop_id
            lot_data["status"] = "active"

            try:
                sm.add_lot(lot_data)
                added += 1
            except Exception as e:
                st.warning(f"Failed to add lot {lot_id}: {e}")

    st.success(f"✅ Seeded {added} lot(s), skipped {skipped} (already exist).")
    st.rerun()
