"""
Job functions — the actual work performed by scheduled tasks.

Each job is a standalone function that the TaskQueue schedules.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select

from coffee_export.database.base import SessionLocal, now_addis_iso
from coffee_export.database.models import Lead, LotReservation, SampleRequest
from coffee_export.events import (
    AGENT_COMPLETED,
    AGENT_FAILED,
    AGENT_STARTED,
    BUDGET_RESET,
    DAILY_SYNC_GENERATED,
    EventBus,
)
from coffee_export.state import StateManager
from coffee_export.utils.logging import get_logger

log = get_logger(__name__)

ADDIS_TZ = timezone(timedelta(hours=3))
NURTURE_COOLDOWN_DAYS = 42
GHOST_COOLDOWN_DAYS = 60
EVENT_CLEANUP_DAYS = 90


def _log_job_start(job_name: str) -> None:
    log.info(f"Job started: {job_name}")
    try:
        with EventBus() as bus:
            bus.publish(
                AGENT_STARTED,
                entity_type="job",
                entity_id=job_name,
                payload={"job": job_name},
                published_by="TaskQueue",
            )
    except Exception:
        pass


def _log_job_end(job_name: str, result: dict[str, Any]) -> None:
    status = result.get("status", "unknown")
    if status == "success":
        log.info(f"Job completed: {job_name} ({status})")
    else:
        log.error(f"Job failed: {job_name} ({status})")

    event_type = AGENT_COMPLETED if status == "success" else AGENT_FAILED
    try:
        with EventBus() as bus:
            bus.publish(
                event_type,
                entity_type="job",
                entity_id=job_name,
                payload=result,
                published_by="TaskQueue",
            )
    except Exception:
        pass


def daily_sync() -> dict[str, Any]:
    _log_job_start("daily_sync")
    result: dict[str, Any] = {"job": "daily_sync"}
    try:
        with StateManager() as sm:
            snapshot = sm.get_kpi_snapshot()
            result["snapshot"] = snapshot

        from coffee_export.config import LOGS_DIR

        date_str = datetime.now(ADDIS_TZ).strftime("%Y-%m-%d")
        report_path = LOGS_DIR / f"daily_sync_{date_str}.md"
        report = _format_daily_sync(snapshot)
        report_path.write_text(report, encoding="utf-8")
        result["report_path"] = str(report_path)

        with EventBus() as bus:
            bus.publish(
                DAILY_SYNC_GENERATED,
                entity_type="system",
                entity_id=date_str,
                payload={"date": date_str, "file": str(report_path)},
                published_by="TaskQueue",
            )
        log.info(f"Daily sync generated: {report_path}")
        result["status"] = "success"
    except Exception as e:
        log.error(f"daily_sync failed: {e}", exc_info=True)
        result["status"] = "failed"
        result["error"] = str(e)
    _log_job_end("daily_sync", result)
    return result


def weekly_budget_reset() -> dict[str, Any]:
    _log_job_start("weekly_budget_reset")
    result: dict[str, Any] = {"job": "weekly_budget_reset"}
    try:
        now = datetime.now(ADDIS_TZ)
        monday = now - timedelta(days=now.weekday())
        week_start = monday.strftime("%Y-%m-%d")
        with EventBus() as bus:
            bus.publish(
                BUDGET_RESET,
                entity_type="budget",
                entity_id=week_start,
                payload={"week_start": week_start},
                published_by="TaskQueue",
            )
        log.info(f"Weekly budget reset for week starting {week_start}")
        result["week_start"] = week_start
        result["status"] = "success"
    except Exception as e:
        log.error(f"weekly_budget_reset failed: {e}", exc_info=True)
        result["status"] = "failed"
        result["error"] = str(e)
    _log_job_end("weekly_budget_reset", result)
    return result


def process_waitlist() -> dict[str, Any]:
    _log_job_start("process_waitlist")
    result: dict[str, Any] = {"job": "process_waitlist"}
    try:
        with StateManager() as sm:
            fulfilled = sm.process_waitlist()
            result["fulfilled_count"] = len(fulfilled)
            result["fulfilled_lead_ids"] = fulfilled
        log.info(f"Processed waitlist: {len(fulfilled)} leads fulfilled")
        result["status"] = "success"
    except Exception as e:
        log.error(f"process_waitlist failed: {e}", exc_info=True)
        result["status"] = "failed"
        result["error"] = str(e)
    _log_job_end("process_waitlist", result)
    return result


def expire_reservations() -> dict[str, Any]:
    _log_job_start("expire_reservations")
    result: dict[str, Any] = {"job": "expire_reservations"}
    try:
        from sqlalchemy import update as sa_update

        now = now_addis_iso()
        with SessionLocal() as session:
            count_result = session.execute(
                sa_update(LotReservation)
                .where(
                    LotReservation.status == "active",
                    LotReservation.reserved_until_ts <= now,
                )
                .values(status="expired")
            )
            session.commit()
            expired_count = count_result.rowcount
        result["expired_count"] = expired_count
        log.info(f"Expired {expired_count} lot reservations")
        result["status"] = "success"
    except Exception as e:
        log.error(f"expire_reservations failed: {e}", exc_info=True)
        result["status"] = "failed"
        result["error"] = str(e)
    _log_job_end("expire_reservations", result)
    return result


def cleanup_old_events() -> dict[str, Any]:
    _log_job_start("cleanup_old_events")
    result: dict[str, Any] = {"job": "cleanup_old_events"}
    try:
        with EventBus() as bus:
            deleted = bus.cleanup_old_events(days=EVENT_CLEANUP_DAYS)
        result["deleted_count"] = deleted
        log.info(f"Cleaned up {deleted} old events (>{EVENT_CLEANUP_DAYS} days)")
        result["status"] = "success"
    except Exception as e:
        log.error(f"cleanup_old_events failed: {e}", exc_info=True)
        result["status"] = "failed"
        result["error"] = str(e)
    _log_job_end("cleanup_old_events", result)
    return result


def nurture_reactivation() -> dict[str, Any]:
    _log_job_start("nurture_reactivation")
    result: dict[str, Any] = {"job": "nurture_reactivation"}
    try:
        cutoff = (datetime.now(ADDIS_TZ) - timedelta(days=NURTURE_COOLDOWN_DAYS)).isoformat()
        reactivated: list[str] = []
        with SessionLocal() as session:
            leads = (
                session.execute(
                    select(Lead).where(
                        Lead.current_state == "NURTURE",
                        Lead.updated_ts < cutoff,
                        Lead.deleted_ts.is_(None),
                    )
                )
                .scalars()
                .all()
            )
            now = now_addis_iso()
            for lead in leads:
                lead.current_state = "IN_SEQUENCE"
                lead.current_agent = "Agent 3"
                lead.sequence_step = 0
                lead.last_touch_ts = now
                lead.updated_ts = now
                reactivated.append(lead.lead_id)
            session.commit()
        result["reactivated_count"] = len(reactivated)
        result["reactivated_lead_ids"] = reactivated
        log.info(f"Reactivated {len(reactivated)} leads from NURTURE → IN_SEQUENCE")
        result["status"] = "success"
    except Exception as e:
        log.error(f"nurture_reactivation failed: {e}", exc_info=True)
        result["status"] = "failed"
        result["error"] = str(e)
    _log_job_end("nurture_reactivation", result)
    return result


def ghost_to_nurture() -> dict[str, Any]:
    _log_job_start("ghost_to_nurture")
    result: dict[str, Any] = {"job": "ghost_to_nurture"}
    try:
        cutoff = (datetime.now(ADDIS_TZ) - timedelta(days=GHOST_COOLDOWN_DAYS)).isoformat()
        moved: list[str] = []
        with SessionLocal() as session:
            leads = (
                session.execute(
                    select(Lead).where(
                        Lead.current_state == "GHOSTED",
                        Lead.updated_ts < cutoff,
                        Lead.deleted_ts.is_(None),
                    )
                )
                .scalars()
                .all()
            )
            now = now_addis_iso()
            for lead in leads:
                lead.current_state = "NURTURE"
                lead.current_agent = "Agent 3"
                lead.last_touch_ts = now
                lead.updated_ts = now
                moved.append(lead.lead_id)
            session.commit()
        result["moved_count"] = len(moved)
        result["moved_lead_ids"] = moved
        log.info(f"Moved {len(moved)} leads from GHOSTED → NURTURE")
        result["status"] = "success"
    except Exception as e:
        log.error(f"ghost_to_nurture failed: {e}", exc_info=True)
        result["status"] = "failed"
        result["error"] = str(e)
    _log_job_end("ghost_to_nurture", result)
    return result


def sample_reminder_check() -> dict[str, Any]:
    _log_job_start("sample_reminder_check")
    result: dict[str, Any] = {"job": "sample_reminder_check"}
    try:
        now = datetime.now(ADDIS_TZ)
        reminders_due: list[dict[str, Any]] = []
        with SessionLocal() as session:
            samples = (
                session.execute(
                    select(SampleRequest).where(
                        SampleRequest.status == "feedback_due",
                        SampleRequest.delivered_ts.is_not(None),
                    )
                )
                .scalars()
                .all()
            )
            for sample in samples:
                if not sample.delivered_ts:
                    continue
                delivered = datetime.fromisoformat(sample.delivered_ts)
                days_since = (now - delivered).days
                reminder_day = None
                if days_since == 7:
                    reminder_day = 7
                elif days_since == 10:
                    reminder_day = 10
                elif days_since == 14:
                    reminder_day = 14
                elif days_since == 18:
                    reminder_day = 18
                if reminder_day:
                    reminders_due.append(
                        {
                            "sample_request_id": sample.sample_request_id,
                            "lead_id": sample.lead_id,
                            "days_since_delivery": days_since,
                            "reminder_day": reminder_day,
                        }
                    )
        result["reminders_due"] = reminders_due
        result["reminder_count"] = len(reminders_due)
        log.info(f"Found {len(reminders_due)} sample reminders due")
        result["status"] = "success"
    except Exception as e:
        log.error(f"sample_reminder_check failed: {e}", exc_info=True)
        result["status"] = "failed"
        result["error"] = str(e)
    _log_job_end("sample_reminder_check", result)
    return result


def send_sample_reminder(sample_request_id: str, reminder_day: int) -> dict[str, Any]:
    _log_job_start("send_sample_reminder")
    result: dict[str, Any] = {
        "job": "send_sample_reminder",
        "sample_request_id": sample_request_id,
        "reminder_day": reminder_day,
    }
    try:
        log.info(f"Sample reminder: {sample_request_id} Day +{reminder_day}")
        result["status"] = "success"
        result["message"] = f"Reminder logged for Day +{reminder_day}"
    except Exception as e:
        log.error(f"send_sample_reminder failed: {e}", exc_info=True)
        result["status"] = "failed"
        result["error"] = str(e)
    _log_job_end("send_sample_reminder", result)
    return result


def reactivate_lead(lead_id: str) -> dict[str, Any]:
    _log_job_start("reactivate_lead")
    result: dict[str, Any] = {"job": "reactivate_lead", "lead_id": lead_id}
    try:
        with StateManager() as sm:
            lead = sm.get_lead(lead_id)
            if lead and lead["current_state"] == "NURTURE":
                sm.update_lead_state(
                    lead_id,
                    "IN_SEQUENCE",
                    agent="TaskQueue",
                    notes="Reactivated from nurture by scheduled job",
                    current_agent="Agent 3",
                )
                result["status"] = "success"
                result["message"] = f"Lead {lead_id} reactivated"
            else:
                result["status"] = "skipped"
                result["message"] = (
                    f"Lead {lead_id} not in NURTURE "
                    f"(state={lead['current_state'] if lead else 'not found'})"
                )
    except Exception as e:
        log.error(f"reactivate_lead failed: {e}", exc_info=True)
        result["status"] = "failed"
        result["error"] = str(e)
    _log_job_end("reactivate_lead", result)
    return result


def _format_daily_sync(snapshot: dict[str, Any]) -> str:
    lines = [
        f"# Daily Sync — {snapshot['generated_ts'][:10]}",
        "",
        f"Generated: {snapshot['generated_ts']}",
        "",
        "## Pipeline Snapshot",
        "",
        f"- **Total leads**: {snapshot['leads']['total']}",
        f"- **Blocked leads**: {snapshot['leads']['blocked_count']}",
        "",
        "### Leads by state",
        "",
    ]
    for state, count in sorted(snapshot["leads"]["by_state"].items()):
        lines.append(f"- {state}: {count}")
    lines.extend(
        [
            "",
            "## Inventory",
            "",
            f"- **Total lots**: {snapshot['lots']['total']}",
            f"- **Total stock**: {snapshot['lots']['total_stock_bags']} bags",
            "",
            "### EUDR completeness (active lots)",
            "",
        ]
    )
    for status, count in sorted(snapshot["lots"]["eudr_completeness"].items()):
        lines.append(f"- {status}: {count}")
    lines.extend(
        [
            "",
            "## Samples",
            "",
            f"- **Active reservations**: {snapshot['samples']['active_reservations']}",
            f"- **Waitlist depth**: {snapshot['samples']['waitlist_depth']}",
            "",
            "## Feedback",
            "",
            f"- **Total logged**: {snapshot['feedback']['total_logged']}",
        ]
    )
    if snapshot["feedback"]["multi_rejection_lots"]:
        lines.append("")
        lines.append("### Lots needing QA review (≥2 rejections)")
        for lot in snapshot["feedback"]["multi_rejection_lots"]:
            lines.append(f"- {lot['lot_id']}: {lot['n']} rejections")
    return "\n".join(lines) + "\n"
