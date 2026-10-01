# Install on a home server / NAS

Run the hub on a box in your home — a mini PC, an always-on desktop, or a
NAS that supports Docker (Synology, QNAP, TrueNAS). Best when you want your
data at home.

![Home server install](assets/img/install-home-server.svg)

## Prerequisites

- Any Linux machine (or NAS) with [Docker Engine](https://docs.docker.com/engine/install/)
  and Docker Compose v2. On a NAS, use its built-in Container/Docker manager
  or SSH in.
- The box stays powered on (disable sleep).
- You know its LAN IP — make it predictable (DHCP reservation in your
  router, or a static IP), so the app URL doesn't change.

## Steps

1. **Install Docker + Compose v2** (skip on a NAS that already has it)

   ```bash
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker "$USER"   # log out and back in afterwards
   docker compose version            # must print a v2.x version
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

   **Success looks like:**

   ```
   ✔ Created .env with a fresh API token
   ✔ hub-api is up  →  http://127.0.0.1:8090
   ```

4. **Verify**

   ```bash
   curl -fsS http://127.0.0.1:8090/api/healthz
   # → {"status":"ok"}
   grep HUB_API_TOKEN .env
   ```

5. **Decide how other devices reach it**

   **Option A — Tailscale (recommended).** Keeps the server loopback-only;
   nothing on your LAN or the internet can hit it directly.

   ```bash
   curl -fsSL https://tailscale.com/install.sh | sh
   sudo tailscale up
   sudo tailscale serve --bg --http=80 http://127.0.0.1:8090
   ```

   The app then uses `http://<server-tailnet-name>` (HTTPS if you use
   `--https` instead of `--http`). Works from home **and** away.

   **Option B — LAN-only direct access.** Convenient, but any device on
   your network (guests, IoT gear) can reach the port — token auth is then
   the only barrier. If you accept that:

   ```ini
   HUB_BIND=0.0.0.0
   HUB_PUBLIC_BASE=http://192.168.1.50:8090    # your server's LAN IP
   ```

   Plain HTTP over LAN is unencrypted; if that bothers you, use Option A
   or put a TLS reverse proxy in front (see
   [CONNECT-APP.md](CONNECT-APP.md)). **Never port-forward 8090 to the
   internet** — put Tailscale or a TLS proxy with auth in front instead.

   **Option C — loopback only.** You only ever use the hub from the server
   itself. Change nothing; the defaults already do this.

6. **Finish `.env`**

   ```ini
   HUB_USER_NAME=Your Name
   HUB_USER_HANDLE=you
   HUB_TZ=America/New_York
   ```

   ```bash
   docker compose up -d    # recreate with the new env
   ```

7. **Pair the app** — server URL + token, per [CONNECT-APP.md](CONNECT-APP.md).

## Autostart

`docker-compose.yml` sets `restart: unless-stopped`, so the hub comes back
after reboots as long as the Docker daemon starts at boot (it does by
default on systemd installs; enable it on NAS images if needed:

`sudo systemctl enable docker`).

## Keeping it up to date

```bash
cd hub-stack
./install.sh --update
```

## Troubleshooting

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md). Home-server-specific notes:

- App can't connect from your phone on the same Wi-Fi → you're on
  Option C; either switch to Tailscale or set `HUB_BIND=0.0.0.0`
  deliberately.
- IP changed after a router reboot → set a DHCP reservation.
- NAS won't bind the port → check the NAS firewall and whether port 8090
  is already used by a NAS service (change the left-hand `8090` in
  `docker-compose.yml`).
