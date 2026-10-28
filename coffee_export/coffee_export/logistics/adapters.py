"""
Logistics provider adapter layer (Logistics Command Center).

WHY THIS EXISTS
---------------
The UI must be able to say, truthfully, whether a logistics action can be
executed INSIDE Faith-El or must happen OUTSIDE (on the provider's official
channel). Every provider today is "external": Faith-El has NO logistics API
integrations, and pretending otherwise was the core failure of the old
autonomous AI booking workflow.

THE CONTRACT
------------
``LogisticsProviderAdapter`` is the seam where a REAL integration will plug
in later:

    adapter = get_adapter(provider_row)
    result = adapter.get_availability(container_type="20GP", quantity=2)

  * ``AdapterResult.status == "not_connected"`` — the ONLY honest answer
    today. The UI must fall back to manual/external flows (official URLs,
    tel:/mailto:, "Record external booking"). NO adapter method fakes data.
  * ``AdapterResult.status == "connected"`` — reserved for a future real
    integration. When that day comes, the UI keeps its shape: it already
    branches on this status, so no redesign is needed.

Implementing a fake "connected" adapter to make a demo look better is a
violation of the module contract (see docs/logistics-command-center.md).
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any


@dataclass
class AdapterResult:
    """Uniform response for every adapter capability."""

    status: str  # "connected" | "not_connected"
    data: dict[str, Any] | None = None
    message: str = ""

    @property
    def connected(self) -> bool:
        return self.status == "connected"


NOT_CONNECTED = "not_connected"


def _not_connected(provider_name: str, capability: str) -> AdapterResult:
    return AdapterResult(
        status=NOT_CONNECTED,
        message=(
            f"No API integration with {provider_name} — the '{capability}' "
            "action must be completed on the provider's official channel "
            "and recorded in Faith-El afterwards."
        ),
    )


@dataclass
class LogisticsProviderAdapter(ABC):
    """Abstract capability interface for an external logistics provider.

    Every method defaults to NOT_CONNECTED — a subclass only overrides the
    capabilities its real integration genuinely supports. There is
    deliberately NO default implementation that returns data: an
    unimplemented capability must answer "not connected", never invent
    availability, quotes, bookings or tracking events.
    """

    provider_id: int | None = None
    provider_name: str = "unknown provider"

    # ── Capabilities ────────────────────────────────────────────────────
    @abstractmethod
    def get_availability(
        self, container_type: str, quantity: int, **kwargs: Any
    ) -> AdapterResult:
        """Check empty-container availability (only a REAL integration)."""

    @abstractmethod
    def get_quote(self, **kwargs: Any) -> AdapterResult:
        """Request a quotation (only a REAL integration)."""

    @abstractmethod
    def create_booking(self, **kwargs: Any) -> AdapterResult:
        """Place a booking (only a REAL integration)."""

    @abstractmethod
    def get_booking(self, booking_reference: str) -> AdapterResult:
        """Fetch a booking's live status (only a REAL integration)."""

    @abstractmethod
    def get_tracking(self, reference: str) -> AdapterResult:
        """Fetch tracking milestones (only a REAL integration)."""

    @abstractmethod
    def cancel_booking(self, booking_reference: str) -> AdapterResult:
        """Cancel a booking (only a REAL integration)."""


class ExternalProviderAdapter(LogisticsProviderAdapter):
    """The adapter every provider gets TODAY: nothing is automated.

    All capabilities answer NOT_CONNECTED with an honest message. The UI
    uses this to decide between an in-app action and an external one
    (official URL / tel: / mailto: / manual record).
    """

    def get_availability(
        self, container_type: str, quantity: int, **kwargs: Any
    ) -> AdapterResult:
        return _not_connected(self.provider_name, "check availability")

    def get_quote(self, **kwargs: Any) -> AdapterResult:
        return _not_connected(self.provider_name, "request a quote")

    def create_booking(self, **kwargs: Any) -> AdapterResult:
        return _not_connected(self.provider_name, "book")

    def get_booking(self, booking_reference: str) -> AdapterResult:
        return _not_connected(self.provider_name, "fetch booking status")

    def get_tracking(self, reference: str) -> AdapterResult:
        return _not_connected(self.provider_name, "track")

    def cancel_booking(self, booking_reference: str) -> AdapterResult:
        return _not_connected(self.provider_name, "cancel the booking")


def get_adapter(provider: Any) -> LogisticsProviderAdapter:
    """Return the adapter for a provider row.

    Today this ALWAYS returns an ExternalProviderAdapter — the DB flag
    ``integration_status`` is "external" for every provider, and no real
    integration exists. When a genuine integration is built, register it
    here keyed by (integration_status, provider identity); the flag lives
    in the DB precisely so this switch needs no UI change.
    """
    return ExternalProviderAdapter(
        provider_id=getattr(provider, "id", None),
        provider_name=str(getattr(provider, "name", "unknown provider")),
    )
