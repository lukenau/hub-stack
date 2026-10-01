# Setup

This is the main setup guide. It covers the one-command quickstart that works
on any host, what `install.sh` actually does, and every configuration option.
For host-specific detail (VPS, home server, Mac) see the dedicated guides.

---

## Quickstart (5 minutes)

**You need:** a machine that stays on, with [Docker Engine](https://docs.docker.com/engine/install/)
and Docker Compose v2 (`docker compose version` must work).

```bash
git clone https://github.com/<your-username>/hub-stack.git
cd hub-stack
./install.sh
```

Success looks like this:

```
✔ Created .env with a fresh API token
✔ hub-api is up  →  http://127.0.0.1:8090
```

Then point the app at the server and enter the token — see
[CONNECT-APP.md](CONNECT-APP.md). The token is in `.env` under `HUB_API_TOKEN`.

![Quickstart](assets/img/quickstart.svg)

---

## What `install.sh` does

In order:

1. **Checks prerequisites** — Docker present, Docker Compose v2 present,
   Docker daemon reachable. Any miss exits with a plain-English error.
2. **Creates `.env`** from `.env.example` (only if it doesn't exist) and
   generates a random 64-hex-char `HUB_API_TOKEN` (via `openssl`, falling
   back to `/dev/urandom`). An existing `.env` is kept untouched.
3. **Builds and starts** the server with `docker compose up -d --build`.
4. **Waits for health** — polls `http://127.0.0.1:8090/api/healthz` every
   2 s for up to 60 s, then points you at the logs if it never came up.
5. **Prints next steps** — the URL for the app and a pointer to CONNECT-APP.md.

Other modes:

| Command | Effect |
|---|---|
| `./install.sh` / `--start` | Install or start (steps above) |
| `./install.sh --update` | `git pull --ff-only`, rebuild, restart |
| `./install.sh --stop` | `docker compose down` |
| `./install.sh --logs` | Follow container logs (last 100 lines) |

---

## Configuration

All settings live in `.env` (copied from `.env.example`). Every option is
commented there. The important ones:

### Server / network

| Variable | Default | Meaning |
|---|---|---|
| `HUB_BIND` | `127.0.0.1` | Host-side publish address. `127.0.0.1` = reachable from this machine only. Set `0.0.0.0` **only** when a reverse proxy or private mesh is in front — see [CONNECT-APP.md](CONNECT-APP.md). |
| `HUB_API_HOST` / `HUB_API_PORT` | `0.0.0.0` / `8090` | Listen address inside the container. Leave as-is. |
| `HUB_DATA_DIR` | `./data` | Host directory persisted into the container at `/data` (db, uploads, keys). |

The published host **port** is fixed at `8090` in `docker-compose.yml`
(`"${HUB_BIND:-127.0.0.1}:8090:8090"`). To use a different host port, change
the left-hand `8090` there.

### Identity / pairing

| Variable | Default | Meaning |
|---|---|---|
| `HUB_API_TOKEN` | *auto-generated* | **Required.** Bearer token the app presents. Leave blank and the server refuses to start. Treat it like a password. |
| `HUB_ORIGIN` | `http://localhost:8081` | Origins allowed to call the API (comma-separated). The default matches the app's web dev server. |
| `HUB_PUBLIC_BASE` | `http://127.0.0.1:8090` | Base URL the server advertises to clients. Set this to whatever URL the app will actually use. |
| `HUB_USER_NAME` / `HUB_USER_HANDLE` | `Your Name` / `you` | Display identity shown in the app. |
| `HUB_TZ` | `UTC` | Timezone for anything time-formatted. |

### Optional integrations

All blank by default — the hub runs standalone without any of them:

- `HERMES_API_BASE` / `HERMES_API_KEY` — point the hub at a Hermes gateway.
- `MURMUR_BRIDGE_URL` / `MURMUR_BRIDGE_TOKEN` — voice-transcription bridge.
- `HA_LIVE_APPLY` — `false` (dry-run) or `true` (live) for Home Assistant
  actions.
- `OPENROUTER_API_KEY` — LLM access.

After editing `.env`, restart to pick up changes:

```bash
docker compose up -d     # recreates the container with the new env
```

---

## Verify it's working

```bash
curl -fsS http://127.0.0.1:8090/api/healthz
# → {"status":"ok"}
```

Anything else (activity, files, home automation state…) requires the
`HUB_API_TOKEN` bearer token.

## Updating

```bash
./install.sh --update
```

Pulls the latest code (fast-forward only), rebuilds the image, and restarts.
Data in `HUB_DATA_DIR` survives all of this.

## Uninstalling

```bash
./install.sh --stop     # stop the server
sudo rm -rf data .env   # remove secrets and data (careful: irreversible)
```

---

## Where to next

- Pick your host: [INSTALL-VPS.md](INSTALL-VPS.md) ·
  [INSTALL-HOME-SERVER.md](INSTALL-HOME-SERVER.md) ·
  [INSTALL-MAC.md](INSTALL-MAC.md)
- Secure the connection and pair the app: [CONNECT-APP.md](CONNECT-APP.md)
- How it all fits together: [ARCHITECTURE.md](ARCHITECTURE.md)
- Something broken: [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
