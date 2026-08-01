"""
Import Leads page — drag & drop CSV upload with automatic Agent 2 enrichment.

This page connects the pipeline: upload CSV → Agent 2 enriches → leads appear
on the Leads page → Agent 3 can start outreach → Agent 4 sends samples → etc.
"""

from __future__ import annotations

import io

import pandas as pd
import streamlit as st

from coffee_export.state import StateManager


def render() -> None:
    st.title("📥 Import Leads")
    st.caption("Upload a CSV file — Agent 2 will automatically enrich and import each lead")

    # ── Download Template ──
    st.subheader("📋 CSV Template")
    st.markdown("""
    Your CSV file must have at least a **company_name** column. Optional columns improve enrichment quality.
    """)

    template_data = {
        "company_name": ["Falcon Coffees", "Sucafina", "Royal Coffee"],
        "headquarters": ["Lewes, United Kingdom", "Geneva, Switzerland", "Oakland, CA, USA"],
        "website": ["falconcoffees.com", "sucafina.com", "royalcoffee.com"],
        "notes": [
            "Major global green coffee importer committed to supply chain transparency.",
            "One of the world's largest coffee merchants, FCL volumes, ICC contracts.",
            "Industry giant in specialty green imports with long-standing Ethiopian relationships.",
        ],
        "data_confidence": ["High", "High", "High"],
        "general_email": ["info@falconcoffees.com", "info@sucafina.com", "info@royalcoffee.com"],
        "decision_maker_1_name": ["Konrad Brits", "Nicolas Tamari", "Max Nicholas-Fulmer"],
        "decision_maker_1_title": ["CEO & Founder", "CEO", "CEO"],
        "decision_maker_1_linkedin": [
            "https://linkedin.com/in/konrad-brits",
            "",
            "https://linkedin.com/in/max-nicholas-fulmer",
        ],
        "decision_maker_1_email": ["", "", ""],
        "decision_maker_2_name": ["Mike Wheeler", "", "Bob Fulmer"],
        "decision_maker_2_title": ["Green Coffee Buyer", "", "Co-founder"],
        "decision_maker_2_linkedin": ["https://linkedin.com/in/mike-wheeler", "", ""],
        "decision_maker_2_email": ["", "", ""],
        "phone": ["+44 1273 605050", "", "+1-510-652-4256"],
    }

    template_df = pd.DataFrame(template_data)
    csv_buffer = io.StringIO()
    template_df.to_csv(csv_buffer, index=False)

    st.download_button(
        label="⬇ Download CSV Template",
        data=csv_buffer.getvalue(),
        file_name="leads_template.csv",
        mime="text/csv",
    )

    st.divider()

    # ── File Upload (drag & drop) ──
    st.subheader("📂 Upload CSV File")
    st.markdown("Drag and drop your CSV file below, or click to browse.")

    uploaded_file = st.file_uploader(
        "Choose a CSV file",
        type=["csv"],
        label_visibility="collapsed",
    )

    if uploaded_file is not None:
        _process_upload(uploaded_file)

    st.divider()

    # ── Pipeline Status ──
    st.subheader("🔗 Pipeline Status")
    st.markdown("""
    After import, leads flow through the 7-agent pipeline:

    ```
    CSV Upload → Agent 2 (Enrich) → Agent 3 (Outreach) → Agent 4 (Sample)
                                      ↑                      ↓
    Agent 7 (Relationship) ← Agent 6 (Logistics) ← Agent 5 (Contract)
    ```
    """)

    # Show current pipeline state
    with StateManager() as sm:
        snapshot = sm.get_kpi_snapshot()

    col1, col2, col3, col4, col5 = st.columns(5)
    col1.metric("Total Leads", snapshot["leads"]["total"])
    col2.metric("Enriched", snapshot["leads"]["by_state"].get("ENRICHED", 0))
    col3.metric("In Sequence", snapshot["leads"]["by_state"].get("IN_SEQUENCE", 0))
    col4.metric("Qualified", snapshot["leads"]["by_state"].get("QUALIFIED", 0))
    col5.metric("Contracted", snapshot["leads"]["by_state"].get("CONTRACTED", 0))

    if snapshot["leads"]["total"] == 0:
        st.info("👆 Upload a CSV file above to populate the pipeline.")
    else:
        st.success(
            f"✅ Pipeline has {snapshot['leads']['total']} leads. Visit the Leads page to see them."
        )


def _process_upload(uploaded_file) -> None:
    """Process the uploaded CSV file: parse, preview, enrich, import."""
    try:
        # Read the CSV
        df = pd.read_csv(uploaded_file)

        st.success(f"✅ File loaded: {len(df)} rows, {len(df.columns)} columns")

        # Validate required columns
        if "company_name" not in df.columns:
            st.error("❌ The CSV file must have a 'company_name' column.")
            st.info("Download the template above to see the required format.")
            return

        # Show preview
        st.subheader("📋 Data Preview")
        st.dataframe(df.head(10), use_container_width=True, hide_index=True)

        # Import options
        st.subheader("⚙️ Import Options")
        col1, col2 = st.columns(2)
        with col1:
            use_llm = st.checkbox(
                "Use LLM-powered enrichment (requires API key)",
                value=False,
                help="If checked, Agent 2 will use the AI Gateway for intelligent classification. Falls back to keyword-based if no API key.",
            )
        with col2:
            skip_existing = st.checkbox(
                "Skip leads that already exist",
                value=True,
                help="If checked, leads with the same company name + country will be skipped.",
            )

        # Confirm button
        st.divider()
        if st.button("🚀 Import & Enrich Leads", type="primary", use_container_width=True):
            _run_import(df, use_llm, skip_existing)

    except pd.errors.EmptyDataError:
        st.error("❌ The CSV file is empty.")
    except Exception as e:
        st.error(f"❌ Error reading CSV: {e}")


def _run_import(df: pd.DataFrame, use_llm: bool, skip_existing: bool) -> None:
    """Run the actual import + enrichment."""
    from coffee_export.agents.agent2_enrichment import Agent2

    total = len(df)
    progress_bar = st.progress(0, text=f"Importing 0/{total} leads...")

    imported = 0
    skipped = 0
    disqualified = 0
    errors = 0
    results: list[dict] = []

    with Agent2() as agent:
        for i, row in df.iterrows():
            raw = row.to_dict()
            # Clean NaN values
            raw = {k: ("" if pd.isna(v) else str(v)) for k, v in raw.items()}

            company_name = raw.get("company_name", "").strip()
            if not company_name:
                skipped += 1
                progress_bar.progress(
                    (i + 1) / total,
                    text=f"Importing {i + 1}/{total} leads... (skipped: empty company name)",
                )
                continue

            # Check if already exists
            if skip_existing:
                country = ""
                hq = raw.get("headquarters", "")
                if hq:
                    parts = [p.strip() for p in str(hq).split(",")]
                    country = parts[-1] if parts else ""
                existing = agent.sm.get_lead_by_company(company_name, country)
                if existing:
                    skipped += 1
                    progress_bar.progress(
                        (i + 1) / total,
                        text=f"Importing {i + 1}/{total} leads... (skipped: {company_name} already exists)",
                    )
                    continue

            # Enrich the lead
            try:
                result = agent.enrich_lead_with_llm(raw) if use_llm else agent.enrich_lead(raw)

                if result.get("action") == "created":
                    imported += 1
                    results.append(
                        {
                            "Company": company_name,
                            "Status": "✅ Imported",
                            "Segment": result.get("segment", ""),
                            "VP": result.get("vp", ""),
                            "Tier": result.get("tier", ""),
                            "Lead ID": result.get("lead_id", ""),
                            "LLM": "✓" if result.get("llm_used") else "—",
                        }
                    )
                elif result.get("action") == "disqualified":
                    disqualified += 1
                    results.append(
                        {
                            "Company": company_name,
                            "Status": "🚫 Disqualified",
                            "Segment": "—",
                            "VP": "—",
                            "Tier": "—",
                            "Lead ID": "—",
                            "LLM": "—",
                        }
                    )
                else:
                    skipped += 1
                    results.append(
                        {
                            "Company": company_name,
                            "Status": "⏭ Skipped",
                            "Segment": "—",
                            "VP": "—",
                            "Tier": "—",
                            "Lead ID": "—",
                            "LLM": "—",
                        }
                    )

            except Exception as e:
                errors += 1
                results.append(
                    {
                        "Company": company_name,
                        "Status": f"❌ Error: {str(e)[:50]}",
                        "Segment": "—",
                        "VP": "—",
                        "Tier": "—",
                        "Lead ID": "—",
                        "LLM": "—",
                    }
                )

            progress_bar.progress(
                (i + 1) / total,
                text=f"Importing {i + 1}/{total} leads... ({imported} imported, {skipped} skipped, {disqualified} disqualified)",
            )

    # Final summary
    progress_bar.empty()

    st.divider()

    # Results summary
    col1, col2, col3, col4 = st.columns(4)
    col1.metric("✅ Imported", imported)
    col2.metric("⏭ Skipped", skipped)
    col3.metric("🚫 Disqualified", disqualified)
    col4.metric("❌ Errors", errors)

    # Results table
    if results:
        st.subheader("📋 Import Results")
        st.dataframe(pd.DataFrame(results), use_container_width=True, hide_index=True)

    # Success message with next steps
    if imported > 0:
        st.success(f"""
        ✅ **{imported} leads imported and enriched!**

        The pipeline is now connected:
        1. 📊 **Overview** page — metrics updated with new leads
        2. 👥 **Leads** page — browse and filter imported leads
        3. 🤖 **Agent Controls** page — click "Run Now" on Agent 3 to start outreach
        4. 🔔 **Notifications** page — new qualified buyers will appear here

        Leads are in **ENRICHED** state, ready for Agent 3 to start outreach sequences.
        """)

        # Quick action buttons
        col1, col2 = st.columns(2)
        with col1:
            if st.button("👥 View Leads", use_container_width=True):
                st.switch_page("coffee_export/dashboard/app.py")
        with col2:
            if st.button("🤖 Run Agent 3 (Start Outreach)", use_container_width=True):
                st.info("Go to the Agent Controls page and click 'Run Now' next to Agent 3.")
