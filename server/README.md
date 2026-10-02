# services/hub-api/

## Plain English

The hub-api is a tiny FastAPI service on the Mac Studio that the hub PWA talks to. It serves read-only JSON endpoints for health, agents, backups, audit, activity, schedules, skills, Home Assistant state, my-pages, a liveness probe (`/api/healthz`), and a multi-root file browser (`/api/files/{roots,browse,read}`). It also gates the Terminal iframe (`/api/terminal/{challenge,session,logout}`) + HA action flow (`/api/ha/{challenge,apply}`) via WebAuthn. No POST action verbs Day-1 beyond those two WebAuthn-gated flows — per-action Face ID ships with ADR 011 from the start.

Runs as a launchd user agent bound to `127.0.0.1:8787`. Exposed over Tailscale via `tailscale serve --set-path=/api http://127.0.0.1:8787` on the same hostname as the hub, so the PWA fetches `/api/*` without a cross-origin hop.

## Files

| File | Purpose |
|---|---|
| `app.py` | FastAPI app — read-only GETs + WebAuthn endpoints + middleware allowlist |
| `ha_actions.py` | HA proposal challenge + apply router (dry-run Day-1, live when `HA_LIVE_APPLY=true`) |
| `files.py` | Multi-root read-only file browser (`sites`, `code`, `hub_config`, `launch_agents`) |
| `requirements.txt` | pinned pip deps (fastapi, uvicorn, webauthn) |
| `launchd/com.example.hub-api.plist.tmpl` | envsubst-rendered by `scripts/render-plists.sh` |
| `passkeys.json` | registered platform authenticator credentials (gitignored, populated at Phase 9.5 enrolment) |

## Run

```bash
# Day-1 bootstrap: pipx install deps
pipx install 'fastapi[standard]' --include-deps
pipx inject fastapi 'webauthn>=2.5'

# Render + load launchd plist
./scripts/render-plists.sh
launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.example.hub-api.plist

# Smoke test
curl -sf http://127.0.0.1:8787/api/health | jq '.services[0]'
```

## Data sources (read-only)

| Endpoint | Reads from | Transform |
|---|---|---|
| `/api/health` | `/var/log/hub/healthcheck.jsonl` | tail last 20, aggregate by service |
| `/api/agents` | `openclaw status --json` (subprocess, fixed single arg) | merge with static roster from `~/.hub/agents.json` |
| `/api/backups` | `/var/log/hub/restic-snapshots.json` (written by restic-backup.sh post-run) | read + format |
| `/api/audit` | `/var/log/hub/access-report.json` (written by access-report.sh) + `log-activity.sh` JSONL | compose snapshot |
| `/api/activity` | `/var/log/hub/tool-calls.jsonl` (written by `.claude/hooks/log-activity.sh`) | tail last 50, newest-first |
| `/api/schedules` | `~/Library/LaunchAgents/*.plist` (plistlib read) | label + interval/calendar + run_at_load |
| `/api/skills` | `~/.hub/skills.json` (manual seed) | pass-through, empty on absence |
| `/api/home-assistant` | `~/.hub/home-assistant.json` (seeded after HA setup; see `home-assistant.json.example`) | strips any `token` field before returning |
| `/api/my-pages` | `~/.hub/my-pages.json` + directory scan of `~/Sites/my-pages/` | curated + unlisted slug list |
| `/api/healthz` | in-process | liveness probe — `{"status": "ok"}` |
| `/api/terminal/challenge` | stdlib `secrets` | returns base64-url challenge |
| `/api/terminal/session` | `passkeys.json` | verifies assertion; sets `hub_term_session` cookie |
| `/api/terminal/logout` | — | clears `hub_term_session` cookie |
| `/api/ha/challenge` | `passkeys.json` + in-memory challenge cache (30s TTL) | returns a challenge bound to the proposal's sha256 hash |
| `/api/ha/apply` | cached challenge + `passkeys.json` | verifies assertion; Day-1 appends dry-run log; Phase 2 (`HA_LIVE_APPLY=true`) proxies to HA `/api/services/...` |
| `/api/files/roots` | static root registry (overridable via `HUB_FS_*` env) | lists configured roots + existence flags |
| `/api/files/browse` | filesystem (`Path.iterdir`) | listing capped at 500 entries; traversal-guarded via resolved-path `relative_to` check |
| `/api/files/read` | filesystem (`Path.read_bytes` + utf-8 decode) | 256 KB cap; 413 on oversize, 415 on binary |

## Auth posture

- **Reads:** tailnet-only (device trust).
- **Writes:** tailnet + **WebAuthn platform authenticator (Face ID) challenge per call**. The ADR 011 "zero POST action verbs" lock was amended to allow `/api/ha/*` since Day-1 because the HA apply endpoint is gated by the same WebAuthn primitive as the Terminal session and returns dry-run logs until `HA_LIVE_APPLY=true` flips it to live. See `.meta/decisions/011-hub-ia-security.md` amendment.
- **No shell parameterization ever.** Commands are fixed-arg.

## HA actions — Day-1 dry-run vs Phase 2 live-apply

Day-1 flow (no HA physically reachable yet):
1. Client POSTs `/api/ha/challenge` with a proposal → server returns a challenge bound to `sha256(canonical_json(proposal))`.
2. Client runs `navigator.credentials.get(...)` → iOS Face ID.
3. Client POSTs `/api/ha/apply` with `{proposal, assertion}` → server verifies, appends `/var/log/hub/ha-would-apply.jsonl`, returns `{status: "dry_run_ok"}`.

Phase 2 flip (after HA is configured + responsive):
1. Seed `~/.hub/home-assistant.json` with a long-lived HA access token (add a `"token"` field — `GET /api/home-assistant` strips this before returning so it never leaks).
2. `launchctl setenv HA_LIVE_APPLY true` → reload `com.example.hub-api` plist.
3. Same `/api/ha/apply` path now calls `ha_actions._live_apply` which proxies to HA's service-call API.

Implementation status of the live-apply function: scaffolded but intentionally raises 501 until the service-call mapping (change.kind → HA domain/service) is written. Writing that mapping is the one remaining Phase 2 coding task.

Inspect dry-run activity with:

```bash
tail -f /var/log/hub/ha-would-apply.jsonl
```

## Seeding `~/.hub/home-assistant.json`

Copy `home-assistant.json.example` → `~/.hub/home-assistant.json`, edit for your tailnet, hit `GET /api/home-assistant` to confirm the Hub reads it. See Phase 11.5 of `MAC_STUDIO_ARRIVAL.md`.
