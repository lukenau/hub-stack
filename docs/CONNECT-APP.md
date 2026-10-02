# Connect the app

The app needs one thing: a **reachable server**. This guide covers how to
make the server reachable in a safe way — the security step that actually
matters.

> **How the app authenticates (read this).** There is no login and no token to
> type in. The app talks to whatever URL it was built with, and *reachability is
> the access boundary* — so the mesh/TLS step below is the security step, not an
> optional extra. Writes are separately gated by a Face ID device key. See
> [SECURITY.md](../SECURITY.md).

![Connect the app](../assets/img/connect-app.svg)

---

## Step 1 — Make the server reachable

By default the server publishes on `127.0.0.1` only: nothing outside the
machine it runs on can connect. That's deliberate. Pick **one** way to open
it up:

### Option A — Tailscale (recommended)

> Full step-by-step, plus Headscale / WireGuard / Cloudflare Tunnel / LAN-only
> alternatives: **[MESH.md](MESH.md)**.

Encrypted private mesh, nothing exposed to the public internet, works from
home and away.

1. Install Tailscale on the server and on every device that will run the app.
2. On the server, forward to the loopback-published hub:

   ```bash
   sudo tailscale serve --bg --https=443 http://127.0.0.1:8090
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

Then `docker compose up -d`. Connections are plain HTTP inside your LAN, and
the server has no per-request authentication — any device on the LAN can read
everything the server exposes. Do not do this on a shared or guest network.

> ⚠️ **Do not bind `0.0.0.0` without a proxy or mesh in front.** A
> directly-exposed port has no authentication at all: anyone who can reach
> it reads everything, and the traffic is unencrypted. The only thing that
> limits what a client can *do* is the device-key write gate, which a
> stranger simply doesn't have. Never port-forward the hub port to the
> internet. If a machine on the network is untrusted (public Wi-Fi, shared
> VPS), use Option A or B.

---

## Step 2 — Pair the app

There is no server URL to type and no token to paste: the app has no fields
for either. It talks to the URL it was **built with** — `expo.extra.apiBase`
in `app/app.json`, defaulting to the `https://hub.example.com` placeholder in
`app/src/lib/api.ts`. To point a build at your server, set `extra.apiBase`
before building (see [PUBLIC-BUILD.md](PUBLIC-BUILD.md)); the shipped build
for a beta already has the right URL baked in.

Pairing the device is the one in-app step, and it is what lets this phone
*write*:

1. Open the Hub app.
2. Go to **Config → Security → Pair this iPhone** and enter the 6-character
   enrolment code minted from your Hub PWA's **Config → Security** page
   (behind your own Face ID / passkey prompt).
3. The app generates a Secure Enclave key, posts the public half to
   `/api/devicekey/register`, and the device is trusted. From then on, Face
   ID authorises writes on this device.

Reads need no pairing at all — as soon as the build can reach the server,
the home screen loads live data. Pairing only turns on writes.

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
server. The web build uses the same build-time URL as the native app — set
`extra.apiBase` in `app/app.json` to your server before `npm run web`; there
is no in-app server field.

---

## Verify the connection

From any machine that should be able to reach the hub:

```bash
curl -fsS http://<your-server-url>/api/healthz
# → {"status":"ok"}
```

If that fails, the problem is network reachability, not the app — see
[TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## Unpairing a device

To revoke a phone's ability to *write*, remove its device key on the Hub
PWA's **Config → Security** page — the paired key stops being trusted
immediately. That does not revoke *reads*: reads are not authenticated, so
also remove the device from the network that reaches the server (its
tailnet membership, mesh credentials, or LAN access) — see
[SECURITY.md](../SECURITY.md).
