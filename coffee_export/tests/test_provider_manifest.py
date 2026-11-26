"""
Provider manifest tests — TryComp Phase 2 (§12.2 / §3 G / §10).

Proves the honesty contract with an INJECTED env mapping (the real
os.environ is never touched):

  * empty env → nothing configured, ai_chat_available/web_search_available
    return None, capability_unavailable payloads are the honest answer
  * each AI provider is detected via the SAME env keys the AIGateway
    reads (GLM preferred first); ollama counts only with an EXPLICIT
    OLLAMA_BASE_URL (the localhost default is not a capability, and no
    reachability is probed)
  * web_search providers detected in preference order
  * SECRETS NEVER LEAK: with sentinel values in the env, no snapshot,
    capability dict or repr contains a VALUE — env var NAMES only
    (test-pinned so it cannot regress silently)
  * the manifest never mutates os.environ; the `mock` provider is
    excluded from the manifest (a test double is not a production
    capability)
"""

from __future__ import annotations

from coffee_export.research.providers import (
    AI_PROVIDER_ENV_KEYS,
    MANIFEST_ENV_VAR_NAMES,
    ProviderManifest,
    capability_unavailable_payload,
)

SENTINEL = "sk-SECRET-VALUE-DO-NOT-LEAK-9f8e7d"


def test_empty_env_nothing_configured() -> None:
    manifest = ProviderManifest(env={})
    assert manifest.ai_chat_available() is None
    assert manifest.web_search_available() is None
    snapshot = manifest.snapshot()
    assert snapshot["summary"]["ai_chat_configured"] is False
    assert snapshot["summary"]["web_search_configured"] is False
    assert all(c["configured"] is False for c in snapshot["ai_chat"])
    assert all(c["configured"] is False for c in snapshot["web_search"])


def test_each_ai_provider_detected() -> None:
    for name, env_var in AI_PROVIDER_ENV_KEYS:
        manifest = ProviderManifest(env={env_var: SENTINEL})
        available = manifest.ai_chat_available()
        assert available is not None
        assert available.name == name
        assert available.configured is True
        assert available.env_var == env_var


def test_ai_chat_preference_order_glm_first() -> None:
    env = {name: SENTINEL for _, name in AI_PROVIDER_ENV_KEYS}
    manifest = ProviderManifest(env=env)
    assert manifest.ai_chat_available().name == "glm"


def test_ollama_needs_explicit_base_url() -> None:
    assert ProviderManifest(env={}).ai_chat_available() is None
    manifest = ProviderManifest(env={"OLLAMA_BASE_URL": "http://gpu-box:11434"})
    assert manifest.ai_chat_available().name == "ollama"


def test_web_search_detection_and_order() -> None:
    assert ProviderManifest(env={}).web_search_available() is None
    manifest = ProviderManifest(env={"SERPAPI_API_KEY": SENTINEL})
    assert manifest.web_search_available().name == "serpapi"
    manifest = ProviderManifest(env={"SERPAPI_API_KEY": SENTINEL, "BRAVE_SEARCH_API_KEY": SENTINEL})
    assert manifest.web_search_available().name == "brave"


def test_no_secrets_leak_anywhere() -> None:
    env = {
        "GLM_API_KEY": SENTINEL,
        "OPENAI_API_KEY": SENTINEL,
        "ANTHROPIC_API_KEY": SENTINEL,
        "GOOGLE_API_KEY": SENTINEL,
        "DASHSCOPE_API_KEY": SENTINEL,
        "OLLAMA_BASE_URL": SENTINEL,
        "TAVILY_API_KEY": SENTINEL,
        "BRAVE_SEARCH_API_KEY": SENTINEL,
        "SERPAPI_API_KEY": SENTINEL,
    }
    manifest = ProviderManifest(env=env)
    rendered = repr(manifest.snapshot())
    for capability in (*manifest.ai_chat_providers(), *manifest.web_search_providers()):
        rendered += repr(capability.to_dict()) + repr(capability)
    assert SENTINEL not in rendered
    assert SENTINEL not in repr(manifest)
    # env var NAMES are present (useful, safe)
    assert "GLM_API_KEY" in rendered


def test_manifest_never_mutates_os_environ() -> None:
    import os

    before = dict(os.environ)
    manifest = ProviderManifest(env={"GLM_API_KEY": SENTINEL})
    manifest.snapshot()
    manifest.ai_chat_available()
    assert "GLM_API_KEY" not in os.environ  # injected, not exported
    assert dict(os.environ) == before


def test_mock_provider_excluded() -> None:
    manifest = ProviderManifest(env={})
    snapshot = manifest.snapshot()
    names = {c["name"] for c in snapshot["ai_chat"]}
    assert "mock" not in names  # a test double is not a production capability


def test_capability_unavailable_payload_shape() -> None:
    payload = capability_unavailable_payload("web_search", "no provider configured")
    assert payload["status"] == "capability_unavailable"
    assert payload["capability"] == "web_search"
    assert payload["reason"] == "no provider configured"
    assert payload["user_agent"].startswith("faithel-research")


def test_manifest_env_var_names_are_names_only() -> None:
    # every declared env var is a NAME string — the manifest vocabulary
    # is public, values never are
    for name in MANIFEST_ENV_VAR_NAMES:
        assert isinstance(name, str) and name.isupper() and SENTINEL not in name
