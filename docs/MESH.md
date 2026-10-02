# Reach your hub from your phone — mesh and tunnel options

The server binds to `127.0.0.1` by default: reachable only from the machine it
runs on. To use the app from a phone or another computer you need a path to it.
**A private mesh is the recommended path** — it gets you an encrypted, stable
HTTPS URL without opening a port to the internet or buying a domain.

> iOS will not talk to a plain `http://` host that is not `localhost` (App
> Transport Security). Whatever you choose must give the app an **`https://`
> URL**. `tailscale serve` does this for free with a trusted certificate.

| Option | Exposed to internet | TLS | Needs a domain | Effort |
|---|---|---|---|---|
| **Tailscale** (recommended) | No | Yes (automatic) | No | Low |
| Headscale (self-hosted Tailscale) | No | Yes (you manage certs) | Usually no | High |
| WireGuard (raw) | No | No (plain UDP) | No | Medium |
| Cloudflare Tunnel | Only via your CF account + Access | Yes | Yes | Medium |
| LAN only | No | No | No | Trivial |
| Public reverse proxy | **Yes** | Yes | Yes | Medium |

---

## Tailscale (recommended)

One command on the server and one on the phone; both end up on the same private
network with an HTTPS name.

### 1. Server

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up                      # sign in with the same account as the phone
```

### 2. Publish the hub over the tailnet

```bash
sudo tailscale serve --bg --https=443 http://127.0.0.1:8090
tailscale serve status                 # confirm, and read your URL
```

`serve` keeps the server itself on loopback and puts an authenticated HTTPS
proxy in front of it. The URL looks like:

```
https://<machine>.<your-tailnet>.ts.net/
```

Plain `--http=80` is simpler but gives an `http://` URL that **iOS will refuse**;
use `--https`, which provisions a real certificate.

### 3. Phone

1. Install the Tailscale app and sign in to the **same tailnet**.
2. Open the Hub app → **Settings → Server** → enter
   `https://<machine>.<your-tailnet>.ts.net` and your token.
3. Pair the device (see [BETA.md](BETA.md) if someone else is joining).

### Notes

- **Never use `tailscale funnel`.** Funnel exposes the service to the *public*
  internet. `serve` is tailnet-only; that is the whole point.
- **MagicDNS vs a corporate VPN.** If the phone also runs a work VPN, the
  `.ts.net` name may not resolve. Fix: `tailscale set --accept-dns=false` and
  add an entry to your phone's DNS, or reach the hub by its tailnet IP
  (`100.x.y.z`) instead of the name.
- **Keep the URL stable.** The name is tied to the server's machine name; do not
  rename it casually or every paired app needs re-pointing.
- **The hub container does not need Tailscale.** Only the *host* publishes it;
  the container keeps talking to `127.0.0.1:8090`.

---

## Headscale (self-hosted control plane)

If you want a mesh without Tailscale's coordination server, Headscale is an
open-source reimplementation of it. You run the control plane, and the clients
are normal Tailscale clients pointed at it:

```bash
tailscale up --login-server https://headscale.example.com
```

Tradeoff: you now operate the control plane, TLS for it, and node registration.
Use it if "no third party in the path" is a hard requirement and you are willing
to run the service.

---

## WireGuard (raw)

The lowest-level mesh. Gives you an encrypted interface between the server and
the phone, but **no built-in HTTPS, DNS, or NAT traversal**, and managing iOS
configs by hand is fiddly. Only worth it if you are already running WireGuard
for other reasons:

```bash
# after bringing up wg0 with the phone as a peer:
# reach the hub at the server's wg0 address (e.g. 10.0.0.1):
#   http://10.0.0.1:8090   -> plain HTTP, so put TLS on top or bind + proxy
```

---

## Cloudflare Tunnel

Public-ish but authenticated: Cloudflare terminates TLS on a hostname you own
and can gate access with Cloudflare Access. Good if you want a normal domain and
per-user auth; heavier than a mesh, and traffic still transits Cloudflare.

```bash
cloudflared tunnel --url http://127.0.0.1:8090
```

Set `HUB_ORIGIN` to the tunnel hostname and keep `HUB_BIND=127.0.0.1`.

---

## LAN only

Simplest, no extra software: keep the phone on the same network and point the
app at the server's LAN address. Requires `HUB_BIND=0.0.0.0` (or a LAN-visible
bind), which means **any device on your LAN can reach it** — fine on a trusted
home network, not on café Wi-Fi.

---

## Public reverse proxy (only if you must)

If you genuinely need a public URL, put nginx/Caddy in front with TLS **and**
authentication, keep the server bound to loopback, and set `HUB_ORIGIN`
correctly. Read [SECURITY.md](../SECURITY.md) first: you are now exposing a
service that can read your calendar, files, and terminal sessions.
