"""
Task Queue — APScheduler wrapper for recurring and one-off jobs.

USAGE
-----
    from coffee_export.tasks import TaskQueue

    queue = TaskQueue()
    queue.start()           # registers 8 recurring jobs
    queue.list_jobs()       # see all scheduled jobs
    queue.run_job_now("daily_sync")  # trigger immediately
    queue.shutdown()
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.date import DateTrigger

from coffee_export.config import settings
from coffee_export.tasks import jobs
from coffee_export.utils.logging import get_logger

log = get_logger(__name__)

ADDIS_TZ = timezone(timedelta(hours=3))


class TaskQueue:
    """APScheduler wrapper for recurring and one-off jobs."""

    def __init__(self) -> None:
        self.scheduler = BackgroundScheduler(
            timezone=settings.TASK_QUEUE_TIMEZONE,
            job_defaults={
                "coalesce": True,
                "max_instances": 1,
                "misfire_grace_time": 300,
            },
        )
        self._started = False
        log.debug("TaskQueue initialized")

    def start(self) -> None:
        if self._started:
            log.warning("TaskQueue already started")
            return
        self._register_recurring_jobs()
        self.scheduler.start()
        self._started = True
        log.info(f"TaskQueue started — {len(self.scheduler.get_jobs())} jobs scheduled")

    def shutdown(self, wait: bool = True) -> None:
        if not self._started:
            return
        self.scheduler.shutdown(wait=wait)
        self._started = False
        log.info("TaskQueue shut down")

    def __enter__(self) -> TaskQueue:
        self.start()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.shutdown()

    def _register_recurring_jobs(self) -> None:
        self.scheduler.add_job(
            func=jobs.daily_sync,
            trigger=CronTrigger(hour=8, minute=0, timezone=ADDIS_TZ),
            id="daily_sync",
            name="Daily sync dashboard",
            replace_existing=True,
        )
        self.scheduler.add_job(
            func=jobs.cleanup_old_events,
            trigger=CronTrigger(hour=2, minute=0, timezone=ADDIS_TZ),
            id="cleanup_old_events",
            name="Cleanup consumed events >90 days",
            replace_existing=True,
        )
        self.scheduler.add_job(
            func=jobs.nurture_reactivation,
            trigger=CronTrigger(hour=3, minute=0, timezone=ADDIS_TZ),
            id="nurture_reactivation",
            name="Reactivate leads from nurture",
            replace_existing=True,
        )
        self.scheduler.add_job(
            func=jobs.ghost_to_nurture,
            trigger=CronTrigger(hour=3, minute=30, timezone=ADDIS_TZ),
            id="ghost_to_nurture",
            name="Move ghosted leads to nurture",
            replace_existing=True,
        )
        self.scheduler.add_job(
            func=jobs.sample_reminder_check,
            trigger=CronTrigger(hour=6, minute=0, timezone=ADDIS_TZ),
            id="sample_reminder_check",
            name="Check for samples due for reminders",
            replace_existing=True,
        )
        self.scheduler.add_job(
            func=jobs.expire_reservations,
            trigger=CronTrigger(minute=0, timezone=ADDIS_TZ),
            id="expire_reservations",
            name="Expire old lot reservations",
            replace_existing=True,
        )
        self.scheduler.add_job(
            func=jobs.weekly_budget_reset,
            trigger=CronTrigger(day_of_week="mon", hour=0, minute=1, timezone=ADDIS_TZ),
            id="weekly_budget_reset",
            name="Reset sample budget for new week",
            replace_existing=True,
        )
        self.scheduler.add_job(
            func=jobs.process_waitlist,
            trigger=CronTrigger(day_of_week="mon", hour=0, minute=2, timezone=ADDIS_TZ),
            id="process_waitlist",
            name="Process sample waitlist (tier-ordered)",
            replace_existing=True,
        )

    def schedule_oneoff(
        self,
        func: Any,
        run_date: str | datetime,
        job_id: str | None = None,
        kwargs: dict[str, Any] | None = None,
    ) -> str:
        if isinstance(run_date, str):
            run_date = datetime.fromisoformat(run_date)
        if job_id is None:
            job_id = f"oneoff_{datetime.now(ADDIS_TZ).strftime('%Y%m%d%H%M%S')}"
        self.scheduler.add_job(
            func=func,
            trigger=DateTrigger(run_date=run_date, timezone=ADDIS_TZ),
            id=job_id,
            kwargs=kwargs or {},
            replace_existing=True,
        )
        log.info(f"Scheduled one-off job: {job_id} at {run_date.isoformat()}")
        return job_id

    def schedule_sample_reminder(
        self, sample_request_id: str, reminder_day: int, run_date: str | None = None
    ) -> str:
        if run_date is None:
            run_date_dt = datetime.now(ADDIS_TZ) + timedelta(days=reminder_day)
            run_date = run_date_dt.isoformat()
        job_id = f"reminder_{sample_request_id}_day{reminder_day}"
        return self.schedule_oneoff(
            func=jobs.send_sample_reminder,
            run_date=run_date,
            job_id=job_id,
            kwargs={"sample_request_id": sample_request_id, "reminder_day": reminder_day},
        )

    def schedule_lead_reactivation(self, lead_id: str, days_from_now: int = 42) -> str:
        run_date = datetime.now(ADDIS_TZ) + timedelta(days=days_from_now)
        job_id = f"reactivate_{lead_id}"
        return self.schedule_oneoff(
            func=jobs.reactivate_lead,
            run_date=run_date,
            job_id=job_id,
            kwargs={"lead_id": lead_id},
        )

    def list_jobs(self) -> list[dict[str, Any]]:
        jobs_list = []
        for job in self.scheduler.get_jobs():
            next_run = job.next_run_time
            jobs_list.append(
                {
                    "id": job.id,
                    "name": job.name,
                    "func": str(job.func),
                    "trigger": str(job.trigger),
                    "next_run_time": next_run.isoformat() if next_run else None,
                }
            )
        return jobs_list

    def get_job(self, job_id: str) -> dict[str, Any] | None:
        job = self.scheduler.get_job(job_id)
        if not job:
            return None
        next_run = job.next_run_time
        return {
            "id": job.id,
            "name": job.name,
            "func": str(job.func),
            "trigger": str(job.trigger),
            "next_run_time": next_run.isoformat() if next_run else None,
        }

    def remove_job(self, job_id: str) -> bool:
        try:
            self.scheduler.remove_job(job_id)
            log.info(f"Removed job: {job_id}")
            return True
        except Exception:
            return False

    def pause_job(self, job_id: str) -> bool:
        try:
            self.scheduler.pause_job(job_id)
            return True
        except Exception:
            return False

    def resume_job(self, job_id: str) -> bool:
        try:
            self.scheduler.resume_job(job_id)
            return True
        except Exception:
            return False

    def run_job_now(self, job_id: str) -> dict[str, Any] | None:
        job = self.scheduler.get_job(job_id)
        if not job:
            return None
        func_ref = job.func
        if callable(func_ref):
            return func_ref(**(job.kwargs or {}))
        return None
