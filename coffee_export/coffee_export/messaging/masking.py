"""
Buyer identity masking — crypto + redaction primitives.

Phase 4 goal: the exporter's platform NEVER stores, logs, emits, or sends to
an LLM a buyer's real email address in a retrievable form. Real addresses
live ONLY in the buyer_masks registry, encrypted at rest, and are decrypted
transiently at the provider boundary (the SMTP ``To:`` header). Everything
else — threads, messages, events, audit rows, API payloads, AI prompts,
logs — carries the platform alias (``buyer.<12hex>@<inbound domain>``).

Design (keyed lookups, deterministic):
    BUYER_MASK_SECRET (env, untracked)
      ├─ HKDF info="faith-el-buyer-mask-lookup-v1" → lookup key
      │     lookup_key = HMAC-SHA256(lookup_key, "{org_id}:{email}")
      │     → deterministic: the same (org, email) always resolves to the
      │       same registry row without storing the email in the index.
      ├─ HKDF info="faith-el-buyer-mask-aead-v1" → AES-256-GCM key
      │     real_email_encrypted = AESGCM(nonce ‖ ct ‖ tag, AAD=org_id)
      │     → confidentiality + tamper detection + cross-tenant binding
      │       (a ciphertext row from org A cannot be decrypted as org B).
      └─ HKDF info="faith-el-buyer-mask-alias-v1" → alias key
            alias local part = "buyer." + HMAC-SHA256(alias_key, ...)[:12]
            → deterministic alias per (org, email); collisions get a short
              random suffix (astronomically unlikely at 48 bits).

Fail-closed policy: without BUYER_MASK_SECRET no mask can be created or
resolved, so the gateway REFUSES sends that need masking rather than
degrading to plaintext storage. (Re-configuring the secret later without
re-encrypting makes existing rows unresolvable — rotation procedure is
documented in docs/buyer-masking.md.)

Honest limitations (documented, not hidden):
  * The real address must appear in the SMTP transport layer (Resend sees
    it). Masking is a platform/UI/storage guarantee, not cryptography at
    the mail provider.
  * A buyer's own mail client shows them their own address; quoted /
    forwarded content can carry third-party addresses we have no registry
    entry for. The redaction engine replaces every REGISTERED real address
    it finds in stored text; unknown third-party addresses remain.

Architecture compliance: pure utility module — no DB access, no StateManager
dependency (registry persistence lives in StateManager).
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import re
import secrets
from typing import Callable, Iterable

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

BUYER_MASK_SECRET_ENV = "BUYER_MASK_SECRET"

# HKDF derivation labels (changing any of these changes every lookup key /
# ciphertext / alias — treat as fixed protocol constants).
_HKDF_LOOKUP_INFO = b"faith-el-buyer-mask-lookup-v1"
_HKDF_AEAD_INFO = b"faith-el-buyer-mask-aead-v1"
_HKDF_ALIAS_INFO = b"faith-el-buyer-mask-alias-v1"
_HKDF_SALT = b"faith-el-buyer-mask-hkdf-salt-v1"

# Encrypted-blob format tag (so a future v2 can coexist).
_BLOB_PREFIX = "v1:"

# Email-token extraction (addresses inside bodies, quoted headers,
# signatures, forwarded chains).
_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")

# Entity-encoded addresses (HTML bodies): 'konrad&#64;roastery&#46;example' or
# 'konrad&#x40;roastery.example'. SR-1 hardening — the plain regex misses
# these, letting an entity-encoded REGISTERED address survive redaction.
_ENTITY_AT = r"(?:&#0*64;|&#x0*40;)"
_ENTITY_DOT = r"(?:&#0*46;|&#x0*2e;|\.)"
_ENTITY_EMAIL_RE = re.compile(
    r"[A-Za-z0-9._%+\-]+" + _ENTITY_AT + r"(?:[A-Za-z0-9\-]+" + _ENTITY_DOT + r")+[A-Za-z]{2,}",
    re.IGNORECASE,
)


def _decode_numeric_entities(token: str) -> str:
    """Decode HTML numeric entities (&#64; / &#x40;) in a token."""

    def _repl(m: re.Match[str]) -> str:
        body = m.group(0)[2:-1]  # strip the 2-char '&#' prefix and ';' suffix
        try:
            if body[:1] in ("x", "X"):
                return chr(int(body[1:], 16))
            return chr(int(body))
        except ValueError:
            return m.group(0)

    return re.sub(r"&#x?[0-9a-fA-F]+;", _repl, token)


def mask_secret() -> str:
    """The configured BUYER_MASK_SECRET, or '' when unset."""
    return os.environ.get(BUYER_MASK_SECRET_ENV, "").strip()


def masking_enabled() -> bool:
    """True when BUYER_MASK_SECRET is configured (masking can operate)."""
    return bool(mask_secret())


class MaskingUnavailableError(RuntimeError):
    """Raised when masking is required but BUYER_MASK_SECRET is unset."""


def _require_secret() -> bytes:
    secret = mask_secret()
    if not secret:
        raise MaskingUnavailableError(
            f"{BUYER_MASK_SECRET_ENV} is not set — buyer masking cannot "
            "operate (fail closed). Set it in the bridge environment; see "
            "docs/buyer-masking.md."
        )
    return secret.encode("utf-8")


# ──────────────────────────────────────────────────────────────────────
# Key derivation (HKDF-SHA256, three independent subkeys)
# ──────────────────────────────────────────────────────────────────────


def _hkdf(secret: bytes, info: bytes) -> bytes:
    """RFC 5869 HKDF-Expand only (fixed 32-byte output).

    Using extract+expand properly:
        PRK  = HMAC-SHA256(salt, secret)
        OKM  = HMAC-SHA256(PRK, info || 0x01)[:32]
    """
    prk = hmac.new(_HKDF_SALT, secret, hashlib.sha256).digest()
    return hmac.new(prk, info + b"\x01", hashlib.sha256).digest()[:32]


def _lookup_key() -> bytes:
    return _hkdf(_require_secret(), _HKDF_LOOKUP_INFO)


def _aead_key() -> bytes:
    return _hkdf(_require_secret(), _HKDF_AEAD_INFO)


def _alias_key() -> bytes:
    return _hkdf(_require_secret(), _HKDF_ALIAS_INFO)


# ──────────────────────────────────────────────────────────────────────
# Email normalization + deterministic lookup key
# ──────────────────────────────────────────────────────────────────────


def normalize_email(email: str) -> str:
    """Canonical form for registry identity: strip + lowercase.

    Deliberately does NOT strip '+' suffixes — user+tag@ and user@ can be
    different mailboxes; treating them as one identity would merge two
    buyers' masks.
    """
    return (email or "").strip().lower()


def is_platform_alias(address: str, inbound_domain: str) -> bool:
    """True when the address is on OUR platform domain (i.e. an alias).

    Used by the gateway to distinguish 'client passed an alias' from
    'client passed a real address'. Case-insensitive on the domain.
    """
    addr = (address or "").strip().lower()
    domain = (inbound_domain or "").strip().lower()
    if not addr or not domain:
        return False
    return addr.endswith(f"@{domain}")


def lookup_key(organization_id: str, real_email: str) -> str:
    """Deterministic, secret-keyed registry index for (org, email).

    Same input → same key, always. Different org → different key (the same
    real-world buyer tracked by two tenants gets two independent masks).
    """
    msg = f"{organization_id}:{normalize_email(real_email)}".encode("utf-8")
    return hmac.new(_lookup_key(), msg, hashlib.sha256).hexdigest()


# ──────────────────────────────────────────────────────────────────────
# Alias generation (deterministic, collision-suffixed)
# ──────────────────────────────────────────────────────────────────────


def alias_local_part(organization_id: str, real_email: str) -> str:
    """Deterministic alias local part: 'buyer.' + 12 hex chars.

    Derived from its own key stream so the public alias reveals nothing
    about the (secret) lookup key value.
    """
    msg = f"{organization_id}:{normalize_email(real_email)}".encode("utf-8")
    digest = hmac.new(_alias_key(), msg, hashlib.sha256).hexdigest()
    return f"buyer.{digest[:12]}"


def random_alias_suffix() -> str:
    """Short random suffix for the (astronomically unlikely) alias collision."""
    return secrets.token_hex(3)


def alias_address(
    organization_id: str,
    real_email: str,
    inbound_domain: str,
    suffix: str = "",
) -> str:
    """Full alias: buyer.<12hex>[<suffix>]@<inbound domain>."""
    domain = (inbound_domain or "").strip().lower() or "faithelexport.com"
    return f"{alias_local_part(organization_id, real_email)}{suffix}@{domain}"


# ──────────────────────────────────────────────────────────────────────
# Real-address encryption (AES-256-GCM, org-bound AAD)
# ──────────────────────────────────────────────────────────────────────


def encrypt_email(organization_id: str, real_email: str) -> str:
    """Encrypt a real buyer address for at-rest storage.

    AAD binds the ciphertext to the tenant: a blob copied into another
    org's row fails to decrypt (GCM auth error), so cross-tenant ciphertext
    swapping is detected rather than silently returning the wrong buyer.
    """
    key = _aead_key()
    nonce = secrets.token_bytes(12)
    aad = organization_id.encode("utf-8")
    ct = AESGCM(key).encrypt(nonce, normalize_email(real_email).encode("utf-8"), aad)
    return _BLOB_PREFIX + base64.b64encode(nonce + ct).decode("ascii")


def decrypt_email(organization_id: str, blob: str) -> str:
    """Decrypt a registry blob. Raises on wrong org / tampering / wrong secret."""
    if not blob or not blob.startswith(_BLOB_PREFIX):
        raise ValueError("malformed buyer-mask blob (missing v1: prefix)")
    raw = base64.b64decode(blob[len(_BLOB_PREFIX):])
    if len(raw) < 13:  # 12-byte nonce + at least 1 byte ct + 16-byte tag
        raise ValueError("malformed buyer-mask blob (truncated)")
    nonce, ct = raw[:12], raw[12:]
    key = _aead_key()
    aad = organization_id.encode("utf-8")
    plain = AESGCM(key).decrypt(nonce, ct, aad)  # raises InvalidTag on any tamper
    return plain.decode("utf-8")


# ──────────────────────────────────────────────────────────────────────
# Redaction engine (quoted / forwarded / signature content)
# ──────────────────────────────────────────────────────────────────────


def extract_emails(text: str) -> set[str]:
    """All email-looking tokens in a text (normalized lowercase)."""
    if not text:
        return set()
    return {normalize_email(m) for m in _EMAIL_RE.findall(text)}


def redact_text(
    text: str,
    resolver: Callable[[str], str | None],
) -> str:
    """Replace every REGISTERED real address in ``text`` with its alias.

    ``resolver(email)`` returns the alias for a registered buyer address or
    None for unknown/third-party addresses (which are left untouched — we
    only redact identities we are custodians of). REGISTERED means any
    registry row, ACTIVE or REVOKED — revocation blocks messaging, not
    redaction hygiene (SR-1).

    Case-insensitive: 'Konrad@TestBuyer.example' and 'konrad@testbuyer.example'
    both match the normalized registry identity. HTML-entity-encoded
    addresses ('konrad&#64;roastery&#46;example', 'konrad&#x40;roastery.example')
    are decoded for the lookup and the whole encoded span is replaced with
    the alias (SR-1 hardening).
    """
    if not text:
        return text

    # Build replacement map from the tokens actually present in the text.
    replacements: dict[str, str] = {}
    for token in extract_emails(text):
        alias = resolver(token)
        if alias:
            replacements[token] = alias

    def _sub(match: re.Match[str]) -> str:
        return replacements.get(normalize_email(match.group(0)), match.group(0))

    out = _EMAIL_RE.sub(_sub, text) if replacements else text

    # Second pass: entity-encoded spans (function replacement → no escape
    # processing; unknown addresses keep their original span untouched).
    if _ENTITY_EMAIL_RE.search(out):

        def _esub(match: re.Match[str]) -> str:
            decoded = normalize_email(_decode_numeric_entities(match.group(0)))
            alias = resolver(decoded)
            return alias if alias else match.group(0)

        out = _ENTITY_EMAIL_RE.sub(_esub, out)

    return out


def strip_cc_bcc(payload: dict) -> dict:
    """Remove CC/BCC keys from a webhook payload copy (inbound policy).

    Policy (docs/buyer-masking.md): the platform stores no CC/BCC recipient
    lists — every CC'd address would be visible to all recipients and would
    bypass masking. Returns a shallow-copied dict with cc/bcc keys removed
    at every mapping level.
    """
    if isinstance(payload, dict):
        return {
            k: strip_cc_bcc(v)
            for k, v in payload.items()
            if k.lower() not in ("cc", "bcc")
        }
    if isinstance(payload, list):
        return [strip_cc_bcc(v) for v in payload]
    return payload


def scan_for_registered_emails(
    texts: Iterable[str],
    resolver: Callable[[str], str | None],
) -> list[str]:
    """Return the registered real addresses found across ``texts``.

    Used by tests as the inverse assertion helper: after redaction, calling
    this over every stored field must return [] (no real address remains).
    """
    found: list[str] = []
    seen: set[str] = set()
    for text in texts:
        for token in extract_emails(text or ""):
            if token not in seen and resolver(token):
                seen.add(token)
                found.append(token)
    return found
