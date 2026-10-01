"""HA action endpoints — per-action WebAuthn + dry-run apply.

Wiring per ADR 012 + ADR 011 amendment:
- POST /api/ha/challenge — returns a fresh WebAuthn challenge scoped to a
  specific proposal (challenge binds to the proposal's stable hash so
  the assertion can't be replayed against a different proposal).
- POST /api/ha/apply — verifies the assertion, then:
    * Day-1: appends a line to HA_WOULD_APPLY_LOG and returns dry_run_ok
    * Phase 2 (HA_LIVE_APPLY=true): proxies to HA's service-call API
      and returns applied status.

The propose side (POST /api/ha/propose) isn't implemented here — that
requires LLM plan-mode + HA MCP dry-run and stays Phase 2. The middleware
in app.py returns 405 for it with the generic "Phase 2" message.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import secrets
import time
from pathlib import Path
from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/ha", tags=["ha"])

LOG_DIR = Path(os.environ.get("HUB_LOG_DIR", "/var/log/hub"))
HA_WOULD_APPLY_LOG = LOG_DIR / "ha-would-apply.jsonl"
PASSKEYS_JSON = Path(os.environ.get("HUB_PASSKEYS", str(Path(__file__).parent / "passkeys.json")))
HA_LIVE_APPLY = os.environ.get("HA_LIVE_APPLY", "").lower() in ("true", "1", "yes")

CHALLENGE_TTL_SECONDS = 30.0


class _ChallengeCache:
    """In-process cache of challenge -> (proposal_hash, expires_at).

    Single-user hub so a dict is sufficient. TTL of 30s matches the
    typical Face-ID ceremony window; expired entries pruned on write.
    """

    def __init__(self) -> None:
        self._store: dict[str, tuple[str, float]] = {}

    def _gc(self) -> None:
        now = time.monotonic()
        for c, (_, exp) in list(self._store.items()):
            if exp < now:
                del self._store[c]

    def put(self, challenge: str, proposal_hash: str) -> None:
        self._gc()
        self._store[challenge] = (proposal_hash, time.monotonic() + CHALLENGE_TTL_SECONDS)

    def take(self, challenge: str) -> str | None:
        self._gc()
        entry = self._store.pop(challenge, None)
        if entry is None:
            return None
        proposal_hash, _ = entry
        return proposal_hash


_cache = _ChallengeCache()


class ProposedChange(BaseModel):
    entity_id: str
    entity_label: str
    entity_icon: str
    kind: Literal["brightness", "color", "on_off", "climate", "media"]
    brightness: dict[str, Any] | None = None
    color: dict[str, Any] | None = None
    on_off: dict[str, Any] | None = None
    climate: dict[str, Any] | None = None
    media: dict[str, Any] | None = None


class Proposal(BaseModel):
    id: str
    source: Literal["pill", "scene", "ask"]
    request_text: str
    agent: Literal["concierge", "scout", "raw"]
    model: str
    changes: list[ProposedChange]
    created_at: str
    service_call_count: int


class ChallengeRequest(BaseModel):
    proposal: Proposal


class AssertionPayload(BaseModel):
    id: str
    raw_id: str
    client_data_json: str
    authenticator_data: str
    signature: str
    user_handle: str | None = None


class ApplyRequest(BaseModel):
    proposal: Proposal
    assertion: AssertionPayload


class AllowedCredential(BaseModel):
    id: str
    type: Literal["public-key"] = "public-key"


class ChallengeResponse(BaseModel):
    challenge: str
    rp_id: str
    user_verification: Literal["required", "preferred"] = "required"
    allowed_credentials: list[AllowedCredential]
    timeout_ms: int = Field(default=60_000)


def _canonical_json(value: Any) -> bytes:
    return json.dumps(value, separators=(",", ":"), sort_keys=True).encode("utf-8")


def _proposal_hash(proposal: Proposal) -> str:
    return hashlib.sha256(_canonical_json(proposal.model_dump())).hexdigest()


def _load_passkeys() -> list[dict[str, Any]]:
    if not PASSKEYS_JSON.exists():
        return []
    try:
        return json.loads(PASSKEYS_JSON.read_text())
    except json.JSONDecodeError:
        return []


def _rp_id_from_env() -> str:
    """Best-effort RP ID — the hub's tailnet hostname. Falls back to localhost.
    Phase 2 enrolment flow should seed this explicitly."""
    return os.environ.get("HUB_RP_ID", "localhost")


@router.post("/challenge", response_model=ChallengeResponse)
def ha_challenge(req: ChallengeRequest) -> ChallengeResponse:
    passkeys = _load_passkeys()
    if not passkeys:
        raise HTTPException(
            status_code=412,
            detail={"code": "no_passkey", "detail": "No passkey registered. Enrol via Settings before using HA actions."},
        )
    challenge_b64u = secrets.token_urlsafe(32)
    phash = _proposal_hash(req.proposal)
    _cache.put(challenge_b64u, phash)
    return ChallengeResponse(
        challenge=challenge_b64u,
        rp_id=_rp_id_from_env(),
        user_verification="required",
        allowed_credentials=[AllowedCredential(id=p["credential_id"]) for p in passkeys if "credential_id" in p],
    )


def _verify_assertion(assertion: AssertionPayload, challenge: str, passkeys: list[dict[str, Any]]) -> bool:
    """WebAuthn verification. Uses the `webauthn` library's
    verify_authentication_response when installed; otherwise returns False
    so the endpoint fails closed.

    Phase 2 fill-in: pass origin + rp_id from env; store sign_count back
    to passkeys.json to catch cloned authenticators.
    """
    try:
        from webauthn import verify_authentication_response  # type: ignore
        from webauthn.helpers.structs import AuthenticationCredential  # type: ignore
    except ImportError:
        # Distinguish a broken image dependency from a bad assertion in the logs.
        logging.warning("webauthn library unavailable — assertion verification fails closed")
        return False

    cred_entry = next((p for p in passkeys if p.get("credential_id") == assertion.id), None)
    if cred_entry is None:
        return False

    try:
        verify_authentication_response(
            credential=AuthenticationCredential.parse_raw(
                json.dumps(
                    {
                        "id": assertion.id,
                        "rawId": assertion.raw_id,
                        "response": {
                            "clientDataJSON": assertion.client_data_json,
                            "authenticatorData": assertion.authenticator_data,
                            "signature": assertion.signature,
                            "userHandle": assertion.user_handle,
                        },
                        "type": "public-key",
                    }
                )
            ),
            expected_challenge=challenge.encode("utf-8"),
            expected_rp_id=_rp_id_from_env(),
            expected_origin=os.environ.get("HUB_ORIGIN", f"https://{_rp_id_from_env()}"),
            credential_public_key=cred_entry["public_key"],
            credential_current_sign_count=cred_entry.get("sign_count", 0),
            require_user_verification=True,
        )
        return True
    except Exception:
        return False


def _log_would_apply(proposal: Proposal, credential_id: str) -> None:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    entry = {
        "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "proposal_id": proposal.id,
        "request_text": proposal.request_text,
        "agent": proposal.agent,
        "model": proposal.model,
        "service_call_count": proposal.service_call_count,
        "changes": [
            {
                "entity_id": c.entity_id,
                "entity_label": c.entity_label,
                "kind": c.kind,
            }
            for c in proposal.changes
        ],
        "credential_id": credential_id,
        "dry_run": True,
    }
    with HA_WOULD_APPLY_LOG.open("a") as f:
        f.write(json.dumps(entry) + "\n")


def _live_apply(proposal: Proposal) -> dict[str, Any]:
    """Phase 2: proxy to HA's service-call API. Day-1 never reaches here
    unless HA_LIVE_APPLY=true AND ~/.hub/home-assistant.json has a token."""
    # Phase 2 implementation sketch (not yet invoked Day-1):
    #   - Read HA URL + long-lived token from ~/.hub/home-assistant.json
    #   - For each change, map (entity_icon, kind, values) to (domain, service, data)
    #   - POST https://home.<tailnet>.example.com/api/services/<domain>/<service>
    #     with Authorization: Bearer <token>
    #   - Collect results; partial-success handling
    # Until that's written, treat HA_LIVE_APPLY=true as a loaded gun: raise.
    raise HTTPException(
        status_code=501,
        detail={"code": "phase_2_pending", "detail": "HA_LIVE_APPLY=true but live-apply module not wired yet."},
    )


@router.post("/apply")
def ha_apply(req: ApplyRequest) -> dict[str, Any]:
    passkeys = _load_passkeys()
    if not passkeys:
        raise HTTPException(
            status_code=412,
            detail={"code": "no_passkey", "detail": "No passkey registered."},
        )

    # Find the challenge that was issued for this specific proposal
    expected_hash = _proposal_hash(req.proposal)
    # We received an assertion; the client signed the challenge bytes. We
    # need to derive the challenge from clientDataJSON. For minimum viable
    # wiring, accept any still-cached challenge whose proposal_hash matches.
    matched_challenge: str | None = None
    for challenge, (phash, _exp) in list(_cache._store.items()):
        if phash == expected_hash:
            matched_challenge = challenge
            break

    if matched_challenge is None:
        raise HTTPException(
            status_code=412,
            detail={"code": "challenge_expired", "detail": "No active challenge for this proposal — tap Approve again."},
        )

    if not _verify_assertion(req.assertion, matched_challenge, passkeys):
        raise HTTPException(
            status_code=403,
            detail={"code": "assertion_invalid", "detail": "Passkey verification failed."},
        )

    # Consume the challenge on success
    _cache.take(matched_challenge)

    started = time.monotonic()
    if HA_LIVE_APPLY:
        outcome = _live_apply(req.proposal)
        return {
            "status": "applied",
            "applied_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "duration_ms": int((time.monotonic() - started) * 1000),
            "outcome": outcome,
        }

    _log_would_apply(req.proposal, req.assertion.id)
    return {
        "status": "dry_run_ok",
        "applied_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "duration_ms": int((time.monotonic() - started) * 1000),
        "would_apply": f"{req.proposal.service_call_count} service calls logged to {HA_WOULD_APPLY_LOG}",
    }
