# Connect the app

The hub app (web, iOS, Android) needs two things: the **server URL** and the
**API token**. This guide also covers how to make the server reachable in a
safe way — and the one setting you should never change carelessly.

![Connect the app](assets/img/connect-app.svg)

---

## Step 1 — Make the server reachable

By default the server publishes on `127.0.0.1` only: nothing outside the
machine it runs on can connect. That's deliberate. Pick **one** way to open
it up:

### Option A — Tailscale (recommended)

Encrypted private mesh, nothing exposed to the public internet, works from
home and away.

1. Install Tailscale on the server and on every device that will run the app.
2. On the server, forward to the loopback-published hub:

   ```bash
   sudo tailscale serve --bg --http=80 http://127.0.0.1:8090
   ```

3. In `.env`, set:

   ```ini
   HUB_PUBLIC_BASE=http://<your-server-tailnet-name>
   HUB_ORIGIN=http://<your-server-tailnet-name>
   ```

4. `docker compose up -d` to apply.

Your server URL is then `http://<your-server-tailnet-name>`.

### Option B — TLS reverse proxy (public domain)

For a real domain with certificates (Caddy shown; nginx works the same way):

1. Keep `HUB_BIND=127.0.0.1` — the proxy connects to loopback, so the raw
   port is never exposed.
2. Caddyfile:

   ```caddy
   hub.example.com {
       reverse_proxy 127.0.0.1:8090
   }
   ```

3. Point DNS at the server, open `80`/`443` in the firewall.
4. In `.env`:

   ```ini
   HUB_PUBLIC_BASE=https://hub.example.com
   HUB_ORIGIN=https://hub.example.com
   ```

5. `docker compose up -d` to apply.

Your server URL is `https://hub.example.com`.

### Option C — LAN-only direct access (simplest, least secure)

Only for a trusted home network:

```ini
HUB_BIND=0.0.0.0
HUB_PUBLIC_BASE=http://192.168.1.50:8090    # server's LAN IP
HUB_ORIGIN=http://192.168.1.50:8090
```

Then `docker compose up -d`. Connections are plain HTTP inside your LAN;
the bearer token is the only barrier. Do not do this on a shared or guest
network.

> ⚠️ **Do not bind `0.0.0.0` without a proxy or mesh in front.** The only
> protection on a directly-exposed port is the bearer token, and traffic
> is unencrypted. Never port-forward the hub port to the internet. If a
> machine on the network is untrusted (public Wi-Fi, shared VPS), use
> Option A or B.

---

## Step 2 — Get the token

```bash
cd hub-stack
grep HUB_API_TOKEN .env
```

It was generated automatically at first install. Treat it like a password.

## Step 3 — Pair the app

1. Open the Hub app.
2. When prompted (or in Settings → Server), enter:
   - **Server URL** — exactly the `HUB_PUBLIC_BASE` value from above,
     including the scheme (`http://` or `https://`) and port if non-default.
   - **Token** — paste the `HUB_API_TOKEN` value.
3. Save. The app stores the token locally and sends it as
   `Authorization: Bearer <token>` on every request.

**Success looks like:** the app's home screen loads live data instead of an
empty/error state.

### Running the app from source (for development)

```bash
cd app
npm install
npm run web     # http://localhost:8081
npm run ios     # needs macOS + Xcode
npm run android # needs Android SDK / emulator or device
```

The default `HUB_ORIGIN=http://localhost:8081` already allows the web dev
server. On the web app's server screen, enter your server URL and token.

---

## Verify the connection

From any machine that should be able to reach the hub:

```bash
curl -fsS http://<your-server-url>/api/healthz
# → {"status":"ok"}
```

If that fails, the problem is network reachability, not the app — see
[TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## Rotating the token

1. Edit `.env`, replace the `HUB_API_TOKEN` value (e.g.
   `openssl rand -hex 32`).
2. `docker compose up -d` to apply.
3. Update the token in every paired app.

Old tokens stop working immediately after the restart.
