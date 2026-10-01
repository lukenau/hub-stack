# hub-stack

**Self-host a private AI hub: one server you own, plus the app that talks to it.**

hub-stack is the server + client pair behind a personal AI hub. You run the
server on a box you control (a VPS, a home server, or a Mac), and the app —
web, iPhone, or Android — connects to it over your own network or a private
mesh (Tailscale). Nothing is exposed to the public internet, and no third
party sits between you and your data.

```
┌────────────────────┐        HTTPS (your network / private mesh)      ┌──────────────────┐
│   Hub app          │  ───────────────────────────────────────────▶  │   hub-api        │
│  (web / iOS /      │  ◀───────────────────────────────────────────  │  (this repo,     │
│   Android)         │              JSON over HTTP(S)                 │   FastAPI)       │
└────────────────────┘                                                └──────────────────┘
                                                                              │
                                                              local services / files / HA
```

---

## Quick start (5 minutes)

**You need:** a machine that stays on (VPS, home server, or Mac) with
[Docker](https://docs.docker.com/engine/install/) and Docker Compose v2.

```bash
git clone https://github.com/lukenau/hub-stack.git
cd hub-stack
./install.sh
```

`install.sh` creates `.env`, generates a random API token, builds the server,
starts it, and prints the URL to point the app at. That's it.

```
✔ hub-api is up  →  http://127.0.0.1:8090
  Point the app at:  http://<this-machine>:8090
  (see docs/CONNECT-APP.md to lock this down with TLS / Tailscale)
```

Then open the app and enter that URL. Details: **[docs/SETUP.md](docs/SETUP.md)**.

---

## Pick your host

| Where you run it | Guide | Best for |
|---|---|---|
| **VPS** (Hetzner, DigitalOcean, Fly…) | [docs/INSTALL-VPS.md](docs/INSTALL-VPS.md) | always-on, reachable anywhere |
| **Home server / NAS** | [docs/INSTALL-HOME-SERVER.md](docs/INSTALL-HOME-SERVER.md) | keeping data at home |
| **Mac** | [docs/INSTALL-MAC.md](docs/INSTALL-MAC.md) | trying it locally |

Each guide has annotated screenshots. Everyone should read
**[docs/CONNECT-APP.md](docs/CONNECT-APP.md)** afterward to secure the
connection (TLS and/or a private mesh) and pair the app.

---

## What's in the box

```
hub-stack/
├── install.sh              one-command bootstrap
├── docker-compose.yml      the server
├── .env.example            every setting, documented
├── server/                 hub-api — the FastAPI service (the "hub")
├── app/                    the Hub client (web + iOS + Android, Expo/React Native)
├── docs/                   setup, per-host installs, connect-the-app, troubleshooting
└── assets/img/             diagrams and install screenshots
```

---

## Security model

- The server binds to **loopback only** by default; nothing is reachable from
  the internet until *you* put a reverse proxy or mesh in front of it.
- Auth is a bearer token held by the app; optional WebAuthn/device-key
  enforcement for sensitive routes.
- No telemetry, no phoning home, no hosted service.
- See [SECURITY.md](SECURITY.md) for the threat model and how to report issues.

## License

MIT for this project's own code — see [LICENSE](LICENSE). Third-party
components (bundled xterm.js, JetBrains Mono, and others) are listed with their
licenses in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
