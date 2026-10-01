# Install on a Mac

Run the hub on a Mac — best for trying it locally, or as an always-on mini
server (e.g. a Mac mini that never sleeps).

![Mac install](assets/img/install-mac.svg)

## Prerequisites

- macOS 13+ (Intel or Apple Silicon).
- **Docker Desktop** ([download](https://www.docker.com/products/docker-desktop/))
  or [OrbStack](https://orbstack.dev/). Docker Compose v2 ships with both —
  verify with `docker compose version`.
- Docker Desktop must be **running** (whale in the menu bar) whenever the
  hub should be up.

## Steps

1. **Install Docker Desktop** and launch it once so the daemon starts.

   ```bash
   docker compose version   # must print a v2.x version
   ```

2. **Clone the repo**

   ```bash
   git clone https://github.com/<your-username>/hub-stack.git
   cd hub-stack
   ```

3. **Run the installer**

   ```bash
   ./install.sh
   ```

   The script handles BSD/macOS differences itself (it uses `sed -i ''`
   and falls back to `/dev/urandom` if `openssl` is missing). First run
   builds the image and waits for health.

   **Success looks like:**

   ```
   ✔ Created .env with a fresh API token
   ✔ hub-api is up  →  http://127.0.0.1:8090
   ```

   Note: macOS has no `hostname -I`, so the installer prints the loopback
   URL `http://127.0.0.1:8090`. That's the right URL for use *on the Mac
   itself*; to reach the hub from other devices, see
   [CONNECT-APP.md](CONNECT-APP.md).

4. **Verify**

   ```bash
   curl -fsS http://127.0.0.1:8090/api/healthz
   # → {"status":"ok"}
   grep HUB_API_TOKEN .env
   ```

5. **Reach it from other devices** — the Mac binds loopback by default,
   so other devices can't connect yet. Recommended: install
   [Tailscale](https://tailscale.com/download/mac) on the Mac and forward:

   ```bash
   sudo tailscale serve --bg --http=80 http://127.0.0.1:8090
   ```

   Or put a TLS reverse proxy in front for a real domain — both covered in
   [CONNECT-APP.md](CONNECT-APP.md). If you want plain LAN access from
   other machines instead, set `HUB_BIND=0.0.0.0` in `.env` and
   `docker compose up -d` — and read the security warning there first.

6. **Finish `.env`**

   ```ini
   HUB_USER_NAME=Your Name
   HUB_USER_HANDLE=you
   HUB_TZ=America/Los_Angeles
   ```

   ```bash
   docker compose up -d    # recreate with the new env
   ```

7. **Pair the app** — server URL + token, per [CONNECT-APP.md](CONNECT-APP.md).

## Keeping the Mac awake

A sleeping Mac is a down hub. For a "try it locally" setup that's fine —
start Docker Desktop and `./install.sh` when you need it. For an
always-on hub (Mac mini):

- System Settings → Displays → **Prevent automatic sleeping when the
  display is off** (or `sudo pmset -a sleep 0 disksleep 0`).
- Keep Docker Desktop set to start at login.

## Keeping it up to date

```bash
cd hub-stack
./install.sh --update
```

## Troubleshooting

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md). Mac-specific notes:

- `Docker daemon not reachable` → Docker Desktop isn't running. Launch it
  and wait for the whale icon, then retry.
- Port 8090 already in use → something else on the Mac claims it; change
  the left-hand `8090` in `docker-compose.yml` or stop the other service.
