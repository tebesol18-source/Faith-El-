"""
AI Monitoring page — LLM usage, costs, provider status, cache hit rate.
"""

from __future__ import annotations

import streamlit as st

from coffee_export.dashboard.utils import format_ts


def render() -> None:
    st.title("🤖 AI Monitoring")
    st.caption("LLM usage, costs, provider status, and cache performance")

    # ── Provider Status ──
    st.subheader("📡 Provider Status")
    from coffee_export.ai import AIGateway

    gateway = AIGateway()
    col_count = len(gateway.providers)
    cols = st.columns(min(col_count, 4))

    for i, (name, provider) in enumerate(gateway.providers.items()):
        col = cols[i % 4]
        status = "✅ Available" if provider.available else "❌ No API Key"
        col.metric(
            name.capitalize(),
            provider.default_model,
            status,
        )

    st.divider()

    # ── Usage Stats ──
    st.subheader("📊 Usage Statistics")

    hours = st.selectbox(
        "Time range", options=[1, 6, 24, 72, 168], index=2, format_func=lambda h: f"Last {h}h"
    )
    stats = gateway.get_usage_stats(hours=hours)

    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Total Calls", stats["total_calls"])
    col2.metric("Total Tokens", f"{stats['total_tokens']:,}")
    col3.metric("Total Cost", f"${stats['total_cost']:.4f}")
    col4.metric("Cache Hits", stats["cached_calls"])

    # Cache hit rate
    if stats["total_calls"] > 0:
        cache_rate = (stats["cached_calls"] / stats["total_calls"]) * 100
        st.metric("Cache Hit Rate", f"{cache_rate:.1f}%")
        st.progress(cache_rate / 100)

    # ── By Provider Breakdown ──
    st.subheader("📈 By Provider")
    if stats["by_provider"]:
        display_data = []
        for p in stats["by_provider"]:
            display_data.append(
                {
                    "Provider": p["provider"].capitalize(),
                    "Model": p["model"],
                    "Calls": p["calls"],
                    "Tokens": f"{p['tokens']:,}",
                    "Cost": f"${p['cost']:.6f}",
                    "Avg Latency": f"{p['avg_latency_ms']}ms",
                }
            )
        st.dataframe(display_data, use_container_width=True, hide_index=True)
    else:
        st.info("No AI calls logged yet.")

    st.divider()

    # ── Task-Based API ──
    st.subheader("🎯 Task-Based Model Selection")
    st.markdown("""
    The gateway auto-selects the best provider for each task type:

    | Task | Preferred Provider | Why |
    |------|-------------------|-----|
    | Classification | GLM | Cost-effective, good accuracy |
    | Extraction | Qwen | Good for structured output |
    | Email Writing | OpenAI (GPT-4o) | Best for creative writing |
    | Contract Review | Claude | Best for analysis and reasoning |
    | NPS Analysis | GLM | Cost-effective for analysis |
    | Recommendation | Claude | Nuanced relationship advice |

    If the preferred provider is unavailable, the gateway falls back to
    the next in the chain: GLM → OpenAI → Claude → Gemini → Qwen → Ollama → Mock
    """)

    st.divider()

    # ── Prompt Templates ──
    st.subheader("📝 Prompt Templates")
    from coffee_export.ai.templates import list_templates

    templates = list_templates()
    if templates:
        display_data = []
        for t in templates:
            display_data.append(
                {
                    "Template": t["name"],
                    "Title": t["title"],
                    "Variables": ", ".join(t["variables"]),
                }
            )
        st.dataframe(display_data, use_container_width=True, hide_index=True)

        # Show template content
        template_names = [t["name"] for t in templates]
        selected = st.selectbox("View template content", options=template_names)
        if selected:
            from coffee_export.ai.templates import PROMPTS_DIR

            content = (PROMPTS_DIR / f"{selected}.md").read_text(encoding="utf-8")
            st.code(content, language="markdown")
    else:
        st.info("No prompt templates found.")

    st.divider()

    # ── Recent AI Calls ──
    st.subheader("📋 Recent AI Calls")
    from sqlalchemy import select

    from coffee_export.database.base import SessionLocal
    from coffee_export.database.models import AICallLog

    with SessionLocal() as session:
        recent_calls = (
            session.execute(select(AICallLog).order_by(AICallLog.called_ts.desc()).limit(20))
            .scalars()
            .all()
        )

    if recent_calls:
        display_data = []
        for call in recent_calls:
            status = "✅" if call.success else "❌"
            cached = "💾" if call.cached else ""
            display_data.append(
                {
                    "": f"{status}{cached}",
                    "Agent": call.agent_id,
                    "Provider": call.provider.capitalize(),
                    "Model": call.model,
                    "Task": call.task_type,
                    "Tokens": call.total_tokens or 0,
                    "Cost": f"${call.cost_usd or 0:.6f}",
                    "Latency": f"{call.latency_ms or 0}ms",
                    "Time": format_ts(call.called_ts),
                }
            )
        st.dataframe(display_data, use_container_width=True, hide_index=True)
    else:
        st.info("No AI calls logged yet.")

    st.caption(f"Last updated: {format_ts(stats.get('hours', 'N/A'))}h range")
