"""
Agent Runner — lifecycle management for all 7 agents.

Provides BaseAgent (abstract base class) and AgentRunner (executes agents
with batch processing, retries, timeout, event publishing).

USAGE
-----
    from coffee_export.agents import BaseAgent, AgentRunner

    class MyAgent(BaseAgent):
        agent_id = "Agent 3"

        def get_leads_to_process(self):
            return self.sm.list_leads(state="ENRICHED", agent="Agent 3")

        def process_lead(self, lead):
            self.sm.update_lead_state(lead["lead_id"], "QUALIFIED", ...)
            return {"action": "qualified"}

    runner = AgentRunner(MyAgent())
    result = runner.run()
    print(f"Processed {result['processed']} leads, {result['failed']} failed")
"""

from __future__ import annotations

import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

from coffee_export.config import settings
from coffee_export.events import AGENT_COMPLETED, AGENT_FAILED, AGENT_STARTED, EventBus
from coffee_export.state import StateManager
from coffee_export.utils.logging import get_logger

log = get_logger(__name__)

ADDIS_TZ = timezone(timedelta(hours=3))
MAX_RETRIES: int = 3
RETRY_DELAY_SECONDS: float = 1.0
DEFAULT_LEAD_TIMEOUT: int = 120


@dataclass
class LeadResult:
    """Result of processing a single lead."""

    lead_id: str
    success: bool
    action: str = ""
    error: str = ""
    retries: int = 0
    duration_seconds: float = 0.0
    details: dict[str, Any] = field(default_factory=dict)


@dataclass
class BatchResult:
    """Result of running a full batch of leads."""

    agent_id: str
    started_ts: str
    completed_ts: str
    total: int = 0
    processed: int = 0
    failed: int = 0
    skipped: int = 0
    duration_seconds: float = 0.0
    lead_results: list[LeadResult] = field(default_factory=list)

    @property
    def success_rate(self) -> float:
        if self.total == 0:
            return 0.0
        return (self.processed / self.total) * 100

    def summary(self) -> str:
        return (
            f"{self.agent_id}: {self.processed}/{self.total} processed "
            f"({self.success_rate:.0f}%), {self.failed} failed, "
            f"{self.skipped} skipped, {self.duration_seconds:.1f}s"
        )


class BaseAgent(ABC):
    """Abstract base class all agents inherit from."""

    agent_id: str = "BaseAgent"
    description: str = ""

    def __init__(self) -> None:
        self.sm = StateManager()
        self.bus = EventBus()
        self._should_stop = False

    def __enter__(self) -> BaseAgent:
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.close()

    def close(self) -> None:
        self.sm.close()
        self.bus.close()

    def stop(self) -> None:
        self._should_stop = True

    @property
    def should_stop(self) -> bool:
        return self._should_stop

    @abstractmethod
    def get_leads_to_process(self) -> list[dict[str, Any]]: ...

    @abstractmethod
    def process_lead(self, lead: dict[str, Any]) -> dict[str, Any]: ...

    def on_batch_start(self) -> None:
        return None

    def on_batch_complete(self, result: BatchResult) -> None:
        return None

    def on_lead_error(self, lead: dict[str, Any], error: str) -> None:
        log.error(f"{self.agent_id} lead {lead.get('lead_id', '?')} failed: {error}")
        return None


class AgentRunner:
    """Executes an agent with lifecycle management."""

    def __init__(
        self,
        agent: BaseAgent,
        max_retries: int = MAX_RETRIES,
        lead_timeout: int = DEFAULT_LEAD_TIMEOUT,
        batch_size: int | None = None,
    ) -> None:
        self.agent = agent
        self.max_retries = max_retries
        self.lead_timeout = lead_timeout
        self.batch_size = batch_size or settings.AGENT_BATCH_SIZE

    def run(self) -> BatchResult:
        started_ts = datetime.now(ADDIS_TZ).isoformat(timespec="seconds")
        start_time = time.time()

        self._publish_event(
            AGENT_STARTED,
            {"agent_id": self.agent.agent_id, "batch_size": self.batch_size},
        )
        log.info(f"{self.agent.agent_id} starting batch (max {self.batch_size} leads)")

        try:
            leads = self.agent.get_leads_to_process()
        except Exception as e:
            log.error(f"{self.agent.agent_id} failed to get leads: {e}", exc_info=True)
            self._publish_event(
                AGENT_FAILED,
                {
                    "agent_id": self.agent.agent_id,
                    "error": f"Failed to get leads: {e}",
                },
            )
            return BatchResult(
                agent_id=self.agent.agent_id,
                started_ts=started_ts,
                completed_ts=datetime.now(ADDIS_TZ).isoformat(timespec="seconds"),
                total=0,
                duration_seconds=time.time() - start_time,
            )

        leads = leads[: self.batch_size]
        total = len(leads)

        if total == 0:
            log.info(f"{self.agent.agent_id} no leads to process")
            result = BatchResult(
                agent_id=self.agent.agent_id,
                started_ts=started_ts,
                completed_ts=datetime.now(ADDIS_TZ).isoformat(timespec="seconds"),
                total=0,
                duration_seconds=time.time() - start_time,
            )
            self._publish_event(
                AGENT_COMPLETED,
                {
                    "agent_id": self.agent.agent_id,
                    "total": 0,
                    "processed": 0,
                },
            )
            return result

        try:
            self.agent.on_batch_start()
        except Exception as e:
            log.warning(f"{self.agent.agent_id} on_batch_start failed: {e}")

        lead_results: list[LeadResult] = []
        processed = 0
        failed = 0
        skipped = 0

        for i, lead in enumerate(leads, 1):
            if self.agent.should_stop:
                log.info(f"{self.agent.agent_id} graceful shutdown requested")
                break

            lead_id = lead.get("lead_id", f"unknown_{i}")
            log.debug(f"{self.agent.agent_id} processing lead {i}/{total}: {lead_id}")

            lead_result = self._process_lead_with_retries(lead)
            lead_results.append(lead_result)

            if lead_result.success:
                if lead_result.action == "skipped":
                    skipped += 1
                else:
                    processed += 1
            else:
                failed += 1
                try:
                    self.agent.on_lead_error(lead, lead_result.error)
                except Exception as e:
                    log.warning(f"{self.agent.agent_id} on_lead_error failed: {e}")

        completed_ts = datetime.now(ADDIS_TZ).isoformat(timespec="seconds")
        duration = time.time() - start_time

        result = BatchResult(
            agent_id=self.agent.agent_id,
            started_ts=started_ts,
            completed_ts=completed_ts,
            total=total,
            processed=processed,
            failed=failed,
            skipped=skipped,
            duration_seconds=duration,
            lead_results=lead_results,
        )

        try:
            self.agent.on_batch_complete(result)
        except Exception as e:
            log.warning(f"{self.agent.agent_id} on_batch_complete failed: {e}")

        self._publish_event(
            AGENT_COMPLETED,
            {
                "agent_id": self.agent.agent_id,
                "total": result.total,
                "processed": result.processed,
                "failed": result.failed,
                "skipped": result.skipped,
                "duration_seconds": round(duration, 2),
            },
        )

        log.info(result.summary())
        return result

    def _process_lead_with_retries(self, lead: dict[str, Any]) -> LeadResult:
        lead_id = lead.get("lead_id", "unknown")
        start_time = time.time()

        for attempt in range(1, self.max_retries + 1):
            try:
                result_dict = self.agent.process_lead(lead)
                duration = time.time() - start_time
                log.debug(
                    f"{self.agent.agent_id} lead {lead_id} succeeded "
                    f"(attempt {attempt}, {duration:.1f}s)"
                )
                return LeadResult(
                    lead_id=lead_id,
                    success=True,
                    action=result_dict.get("action", "processed"),
                    retries=attempt - 1,
                    duration_seconds=duration,
                    details=result_dict,
                )
            except Exception as e:
                duration = time.time() - start_time
                error_msg = f"{type(e).__name__}: {e}"
                log.warning(
                    f"{self.agent.agent_id} lead {lead_id} failed "
                    f"(attempt {attempt}/{self.max_retries}): {error_msg}"
                )
                if attempt < self.max_retries:
                    time.sleep(RETRY_DELAY_SECONDS)
                    continue
                log.error(
                    f"{self.agent.agent_id} lead {lead_id} failed after "
                    f"{self.max_retries} attempts: {error_msg}",
                    exc_info=True,
                )
                return LeadResult(
                    lead_id=lead_id,
                    success=False,
                    error=error_msg,
                    retries=attempt - 1,
                    duration_seconds=duration,
                )

        return LeadResult(
            lead_id=lead_id,
            success=False,
            error="Unknown failure",
            duration_seconds=time.time() - start_time,
        )

    def _publish_event(self, event_type: str, payload: dict[str, Any]) -> None:
        try:
            self.agent.bus.publish(
                event_type=event_type,
                entity_type="agent",
                entity_id=self.agent.agent_id,
                payload=payload,
                published_by="AgentRunner",
            )
        except Exception as e:
            log.warning(f"Failed to publish {event_type}: {e}")


def run_agent(agent: BaseAgent, **kwargs) -> BatchResult:
    """Convenience function to run a single agent."""
    runner = AgentRunner(agent, **kwargs)
    return runner.run()
