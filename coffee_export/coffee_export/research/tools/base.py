"""
Research tool contracts (TryComp Phase 2, §12.3 / §3 F).

Every research tool is a typed, org-scoped, registry-registered callable:

  * INPUT_SCHEMA / OUTPUT_SCHEMA — declarative field contracts
    ({field: {"type": ..., "required": ...}}) validated by
    validate_input/validate_output BEFORE and AFTER execution: a tool
    never sees unvalidated input and a caller never sees an output that
    breaks the declared contract;
  * execute(tool_input, ctx) → ToolResult — the only execution surface.
    Tools return honest outcomes (ok / error / capability_unavailable /
    blocked_policy) or raise ToolCapabilityUnavailableError for capability
    gates (converted by the registry). No tool ever fabricates a result,
    a cost or a capability (§10);
  * ToolContext — the org scope (organization_id), the session the call
    belongs to, the injectable DB engine and the provider manifest.
    Tools never read a global tenant — the context IS the scope.

No arbitrary code execution exists anywhere in this package: tools are
registered classes with fixed schemas, not loaded plugins (rejected list
§3: no TryComp-style dynamic skill loading).
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.engine import Engine

from coffee_export.research.providers import ProviderManifest

#: Declared schema types. "any" accepts any JSON value.
SCHEMA_TYPES: tuple[str, ...] = (
    "str",
    "int",
    "float",
    "bool",
    "dict",
    "list",
    "any",
)


class ToolInputError(ValueError):
    """Invalid tool input — missing/required or wrong-typed field, or a
    semantically invalid value rejected by the tool itself (e.g. a
    non-http(s) URL). Recorded honestly as an error tool-call row."""


class ToolCapabilityUnavailableError(Exception):
    """A tool cannot run because the capability it needs is not actually
    available (§10). NEVER faked: the payload explains what is missing.

    The registry converts this into a ToolResult with status
    capability_unavailable; the engine records it as such.
    """

    def __init__(self, kind: str, reason: str) -> None:
        self.kind = kind
        self.reason = reason
        super().__init__(f"capability_unavailable: {kind}: {reason}")

    @property
    def payload(self) -> dict:
        from coffee_export.research.providers import capability_unavailable_payload

        return capability_unavailable_payload(self.kind, self.reason)


class ToolNotFoundError(KeyError):
    """No tool registered under this name (registry lookup failure)."""


@dataclass(frozen=True)
class ToolContext:
    """The org-scoped execution context handed to every tool.

    organization_id and session_id pin the tenant and the session the
    call belongs to; `engine` is the injectable DB engine (None only for
    tools that need no database — DB-requiring tools refuse loudly);
    `manifest` is the provider manifest (None → the tool may construct a
    default one from os.environ, read-only).
    """

    organization_id: str
    session_id: str
    engine: Engine | None = None
    manifest: ProviderManifest | None = None

    def require_engine(self) -> Engine:
        """For DB-requiring tools: refuse loudly instead of None-crashing."""
        if self.engine is None:
            raise ToolInputError("this tool requires a database engine in the tool context")
        return self.engine

    def manifest_or_default(self) -> ProviderManifest:
        return self.manifest if self.manifest is not None else ProviderManifest()


@dataclass(frozen=True)
class ToolResult:
    """The honest outcome of one tool invocation.

    status: ok | error | capability_unavailable | blocked_policy.
    output is the structured result (None for error rows); cost_usd is
    the cost a provider REPORTED (never invented — None = not reported);
    error_message carries the failure reason for error rows.
    """

    status: str
    output: dict | None = None
    error_message: str | None = None
    cost_usd: float | None = None

    @classmethod
    def ok(cls, output: dict, *, cost_usd: float | None = None) -> ToolResult:
        return cls(status="ok", output=output, cost_usd=cost_usd)

    @classmethod
    def error(cls, message: str) -> ToolResult:
        return cls(status="error", error_message=message)

    @classmethod
    def blocked_policy(cls, output: dict) -> ToolResult:
        """Refused by policy (robots.txt, allowlists) — not an error, not
        an unavailable capability: a deliberate, auditable refusal."""
        return cls(status="blocked_policy", output=output)


class ResearchTool:
    """Base class for research tools (abstract — subclass and register).

    Subclasses declare name, description, input_schema, output_schema
    and implement execute(tool_input, ctx) -> ToolResult. Schemas use
    {field: {"type": <SCHEMA_TYPES entry>, "required": bool}}; extra
    input fields are REJECTED (tight contracts, no silent tolerance).
    """

    name: str = ""
    description: str = ""
    input_schema: dict[str, dict] = {}
    output_schema: dict[str, dict] = {}

    def execute(self, tool_input: dict, ctx: ToolContext) -> ToolResult:  # noqa: ARG002
        raise NotImplementedError("research tools must implement execute()")


# ──────────────────────────────────────────────────────────────
# Schema validation
# ──────────────────────────────────────────────────────────────


def _type_matches(value: object, expected: str) -> bool:
    if expected == "any":
        return True
    if expected == "bool":
        return isinstance(value, bool)
    if expected == "int":
        return isinstance(value, int) and not isinstance(value, bool)
    if expected == "float":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if expected == "str":
        return isinstance(value, str)
    if expected == "dict":
        return isinstance(value, dict)
    if expected == "list":
        return isinstance(value, list)
    return False


def validate_input(schema: dict[str, dict], tool_input: object, *, tool_name: str) -> dict:
    """Validate a tool input against its schema; returns the input dict.

    Raises ToolInputError on: non-dict input, unknown fields, missing
    required fields, wrong-typed fields, empty required strings.
    """
    if not isinstance(tool_input, dict):
        raise ToolInputError(
            f"{tool_name}: input must be an object, got {type(tool_input).__name__}"
        )
    for field in tool_input:
        if field not in schema:
            raise ToolInputError(f"{tool_name}: unknown input field {field!r}")
    for field, spec in schema.items():
        expected = spec.get("type", "any")
        if expected not in SCHEMA_TYPES:
            raise ValueError(
                f"{tool_name}: schema field {field!r} declares unknown type {expected!r}"
            )
        present = field in tool_input
        if spec.get("required", False) and not present:
            raise ToolInputError(f"{tool_name}: required input field {field!r} is missing")
        if present:
            value = tool_input[field]
            if not _type_matches(value, expected):
                raise ToolInputError(
                    f"{tool_name}: input field {field!r} must be {expected}, "
                    f"got {type(value).__name__}"
                )
            if expected == "str" and spec.get("required", False) and not str(value).strip():
                raise ToolInputError(f"{tool_name}: input field {field!r} must be non-empty")
    return tool_input


def validate_output(schema: dict[str, dict], output: object, *, tool_name: str) -> dict:
    """Validate a tool's declared output contract (status 'ok' results).

    Same rules as validate_input; output must be an object carrying every
    required field with the declared type. A violation is a tool bug —
    the registry records it as an honest error row instead of returning a
    contract-breaking output.
    """
    return validate_input(schema, output, tool_name=tool_name)
