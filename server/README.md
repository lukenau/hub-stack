# `server/` — hub-api

The FastAPI backend of hub-stack. It serves the app's read surface, streams chat
and terminal traffic, and puts a real authentication gate in front of every write:
a WebAuthn (Face ID / Touch ID) passkey, or a Secure-Enclave device key paired to
a phone. Reads are meant to be reached only over a private network; writes are
cryptographically gated on top of that.

It is one piece of the repo. Run and configure it from the repository root with
`./install.sh` and `docker compose`; the sections below describe the service
itself.

## How it runs

- **Container, one worker.** `docker-compose.yml` builds this directory and runs
  `uvicorn app:app`. The container listens on **8090** and, by default, the host
  publishes it on `127.0.0.1:8090` — loopback only, so nothing is reachable off
  the machine until you add a mesh or a TLS reverse proxy (see
  [../docs/CONNECT-APP.md](../docs/CONNECT-APP.md)).
- **Single worker is load-bearing.** The WebAuthn challenge cache is in-process,
  so a challenge minted by one worker must be verified by the same one. Do not
  raise the worker count.
- **Non-root.** The container runs as `HUB_UID` (default `1000`) and writes its
  database, uploads and key stores under the mounted data dir (`/data`).

Point the app at the host URL that `install.sh` prints; see
[../docs/SETUP.md](../docs/SETUP.md) for the full configuration table.

## Configuration

Everything is environment-driven from `.env` (copied from `.env.example` by
`install.sh`). The keys that matter most here:

- `HUB_ORIGIN` — **required for passkeys.** The exact origin a browser uses to
  reach the hub (`https://hub.example.com`, or `http://localhost:8090` for a
  local-only install). WebAuthn binds credentials to it, so it must match the
  browser's address bar. If it is blank the server refuses passkey setup with an
  error naming this variable, rather than failing inside the browser with no
  explanation. A comma-separated list is accepted; the first entry is the one
  WebAuthn uses.
- `HUB_RP_ID` — the relying-party hostname passkeys are scoped to. Derived from
  `HUB_ORIGIN`'s hostname when left blank; set it only when it must differ (for
  example `hub.example.com` for `https://hub.example.com`).
- `HUB_PUBLIC_BASE` — the URL the server advertises to clients (used in
  notification links).
- `HUB_BIND` / `HUB_PORT` — host-side publish address and port.
- `HUB_DATA_DIR` — the host directory persisted into the container at `/data`.
- `HUB_BRIDGE_URL` — base URL of the CLI-bridge sidecar, the only component with
  Docker-socket access (used for agent/config/cron reads and writes). Empty
  disables those surfaces.
- `HUB_TTYD_SOCK` / `HUB_TMUXD_SOCK` — host unix sockets for the terminal and
  tmux backends. Unix sockets, not TCP ports: reachable only by a process that
  can open the socket file.

## Files

| File | Purpose |
|---|---|
| `app.py` | FastAPI app — read endpoints, the WebAuthn/device-key gate, chat, terminal and static-page routes |
| `webauthn_gate.py` | the passkey gate: registration + assertion verification and the shared challenge cache |
| `devicekeys.py` | the native-app second verifier: Secure-Enclave device keys and their enrolment codes |
| `ha_actions.py` | Home Assistant proposal → challenge → apply router (dry-run until `HA_LIVE_APPLY=true`) |
| `files.py` | read-only multi-root file browser |
| `hub_calendar.py` | calendar read surface |
| `pair_local.py` / `pair_cli.py` | local (unix-socket) pairing-code minting for `./install.sh --pair` |
| `chat/` | chat session, approval, automation and websocket routers |
| `Dockerfile` | container image for this service |
| `requirements.txt` / `requirements-dev.txt` | runtime and test dependencies |
| `run_tests.sh` | runs the suite the way it is designed to run (one process per test file) |

Runtime stores (`passkeys.json`, `devicekeys.json`) are created in the data dir at
enrolment time and are never committed.

## Endpoints

Read endpoints (no credential; reached over your private network):

| Endpoint | Reads from |
|---|---|
| `/api/health`, `/api/healthz` | health feed / in-process liveness |
| `/api/agents` | agent roster, live from the gateway when available |
| `/api/backups`, `/api/audit`, `/api/activity` | cache files written by your own cron jobs |
| `/api/schedules` | schedule cache |
| `/api/skills` | the bridge's `hermes skills list` |
| `/api/my-pages`, `/my-pages/*` | self-hosted pages under the configured root |
| `/api/files/{roots,browse,read}` | allowlisted filesystem roots (traversal-guarded, 256 KB read cap) |
| `/api/finance` | a snapshot file, if one is written |
| `/api/calendar` | calendar source |
| `/api/passkey/status`, `/api/devicekey/status` | enrolment state only, never credential material |

Gated POST endpoints (each requires a live WebAuthn assertion or device-key proof):

| Endpoint | Gate |
|---|---|
| `/api/passkey/register/{options,verify}` | enrol a platform authenticator |
| `/api/action/{challenge,apply}` | structured writes: `config.set`, `cron.*`, pairing, gateway restart, tmux, murmur, device-key administration |
| `/api/terminal/{challenge,session,logout}` | unlock the terminal (sets a cookie the `/terminal` proxy requires) |
| `/api/ha/{challenge,apply}` | Home Assistant actions |
| `/api/config/topics/*`, `/api/decisions/*`, `/api/briefing/*`, `/api/push/*` | the remaining gated surfaces |

## Auth posture

- **Reads:** private-network boundary (device trust), not per-request auth.
- **Writes:** the network boundary **plus** a per-action WebAuthn passkey
  challenge, or a paired device key. Unknown credentials are rejected and every
  anomaly fails closed. The origin a passkey is bound to is set explicitly
  (`HUB_ORIGIN`); it is never derived from the request, so a caller cannot choose
  what the credential is bound to.
- **No shell parameterization.** The one subprocess allowed is a fixed-argument
  status probe; structured writes are mapped to argv server-side and re-validated
  by the bridge.

Details on the model and its limits: [../SECURITY.md](../SECURITY.md).

## Tests

```bash
./run_tests.sh
```

Each `test_*.py` runs in its own process on purpose: the chat tests set their
environment at module scope before importing `app`, so a single shared `pytest`
invocation would let one module's environment leak into another.
