# hub-stack

![Xavier: a personal AI agent you host yourself](assets/img/xavier-banner.svg)

**Self-host a private AI hub: one server you own, plus the app that talks to it.**

hub-stack is the server + client pair behind a personal AI hub. You run the
server on a box you control (a VPS, a home server, or a Mac), and the app —
web, iPhone, or Android — connects to it over your own network or a private
mesh (Tailscale). Nothing is exposed to the public internet, and no third
party sits between you and your data.

By **Luke Nau** — [GitHub](https://github.com/lukenau) · [LinkedIn](https://www.linkedin.com/in/lukenau).

The hub's agent is **Xavier**: the assistant the app is built around, and the
name on the app's home screen.

**Bring your own model.** hub-stack talks to [OpenRouter](https://openrouter.ai),
so you point it at one key and pick whichever frontier model you want — Claude,
GPT, Gemini, Llama, whatever fits the task — with no per-provider wiring. Your
key, your spend, your choice.

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
  Server URL for your app build:  http://<this-machine>:8090
  (see docs/CONNECT-APP.md to lock this down with TLS / Tailscale)
```

Next, point a build at that URL and pair the device. A source build takes its
server address from `expo.extra.apiBase` in `app/app.json` — there is no field
in the app for it — and pairing is a six-character code you mint behind Face ID.
Details: **[docs/SETUP.md](docs/SETUP.md)** and
**[docs/CONNECT-APP.md](docs/CONNECT-APP.md)**.

---

## Pick your host

| Where you run it | Guide | Best for |
|---|---|---|
| **VPS** (Hetzner, DigitalOcean, Fly…) | [docs/INSTALL-VPS.md](docs/INSTALL-VPS.md) | always-on, reachable anywhere |
| **Home server / NAS** | [docs/INSTALL-HOME-SERVER.md](docs/INSTALL-HOME-SERVER.md) | keeping data at home |
| **Mac** | [docs/INSTALL-MAC.md](docs/INSTALL-MAC.md) | trying it locally |

Each guide has annotated screenshots. Everyone should read
**[docs/CONNECT-APP.md](docs/CONNECT-APP.md)** afterward to secure the
connection (TLS and/or a private mesh) and pair the app. For the network side —
Tailscale, Headscale, WireGuard, Cloudflare Tunnel, or LAN-only — see
**[docs/MESH.md](docs/MESH.md)**.

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

## Integrations — what's included, what isn't

This repo is the **hub server + app**. It includes the code that talks to
several optional services but bundles **none of them** — the agent gateway
(Hermes), the memory provider, Murmur, iMessage, and OpenRouter all live
outside this repo. The hub runs standalone; panels whose service is unset
degrade instead of crashing. Full breakdown: **[docs/INTEGRATIONS.md](docs/INTEGRATIONS.md)**; per-service catalogue with env vars and `.env` blocks: **[docs/SERVICES.md](docs/SERVICES.md)**; agent-side tool connectors: **[docs/CONNECTORS.md](docs/CONNECTORS.md)**.

---

## Privacy — plainly

- **Your data never leaves your machine.** Everything the hub knows lives in
  `${HUB_DATA_DIR:-./data}` on the box you installed it on. There is no hub-stack
  cloud, no account to create, and no server of ours in the loop.
- **No telemetry, no analytics, no phone-home.** The server sends nothing to us
  and nothing to anyone else. The app contains no analytics SDK (no
  Sentry/Amplitude/Segment/PostHog). There is no "usage" reporting to disable.
- **The app talks only to the server it was built for.** The address comes from
  `expo.extra.apiBase`. An unconfigured build carries a placeholder
  (`https://hub.example.com`) that leads nowhere; there is no hidden fallback to
  anyone else's server, and no in-app field that could redirect it.
- **Loopback by default.** The server binds `127.0.0.1` — unreachable from the
  network until *you* add TLS or a private mesh. It never opens an inbound port
  to the internet on its own.
- **Outbound calls only when you opt in.** Nothing is called out to unless you
  configure an integration (e.g. `OPENROUTER_API_KEY`, a Home Assistant URL) or
  you enable app OTA updates, which check the builder's EAS project. Blank =
  off.
- **No secrets in the repo.** `.env` is gitignored; credentials live there and
  nowhere else, and the publish gate (`scripts/hub-stack-gate.sh`) scans for
  committed keys.

If it is not your machine and not a service you switched on, hub-stack is not
talking to it.

---

## Security model

- The server binds to **loopback only** by default; nothing is reachable from
  the internet until *you* put a reverse proxy or mesh in front of it.
- **Reachability is the access boundary.** There is no login and no per-request
  token: anything that can reach the port can read what the server exposes.
  Writes additionally hit a Face ID device-key gate. Read
  [SECURITY.md](SECURITY.md) before exposing it — `HUB_API_TOKEN` in `.env` is
  reserved and **not enforced**.
- No telemetry, no phoning home, no hosted service.
- See [SECURITY.md](SECURITY.md) for the threat model and how to report issues.

## How this compares to hosted personal agents

A hosted agent is the obvious alternative. If you have seen Meta's **Muse**,
this is the same idea with one thing moved: the machine is yours instead of
theirs, and the model is whichever you choose instead of whichever they pick.
hub-stack is the software to be that machine, running on hardware you already
own, under a license that lets you read and change every line.

The difference that matters is custody, not features. With a hosted agent your
files, calendar, mail and transcript history live on someone else's computer,
under their terms, and leave with their product. Here they never leave your
network unless you point them somewhere. The trade is real and worth stating: a
hosted product is less work to start and is someone else's problem to keep
running. If you want zero setup, use one.

Full comparison, with sources and dated checks:
**[docs/COMPARISON.md](docs/COMPARISON.md)**.

---

## What it costs

Nothing here is a subscription, and there is no tier to unlock. The software is
MIT and runs on hardware you already have. What you actually pay is the parts
you plug into it. Figures below were checked against each vendor's own page on
**2026-10-01**; every one is optional except a model key.

| Thing | Cost | Shape |
|---|---|---|
| A machine to run it on | Free if you have one; a small VPS is €5.99/mo at Hetzner (CAX11) or $6–12/mo at DigitalOcean | Monthly, or one-time for hardware (~$150–350 for a ready-to-run home box) |
| Electricity, home server | ~$0.70–3.50/mo for a 5–25 W box | Utility |
| [OpenRouter](https://openrouter.ai) | Pay per token, plus a 5.5% fee on credit top-ups. Free models exist (25+, 50 requests/day). No published average spend | Per token, prepaid |
| [Tailscale](https://tailscale.com) | Free for personal use (6 users, unlimited devices). Paid from $8/user/mo | Free tier |
| [Cloudflare Tunnel](https://www.cloudflare.com) | Free (Zero Trust free plan) | Free |
| [Apple Developer Program](https://developer.apple.com/programs/) | $99/year — required only if you want the app on an iPhone via TestFlight or the App Store. Includes WeatherKit | Annual |
| [Browser Use](https://browser-use.com) | Free tier, then paid by usage | Optional |

**The short version:** if you already have a computer to leave on, the cheapest
sane setup is **$1–4/month**, essentially just electricity. A typical setup with
a small VPS and light paid model use runs **$20–35/month**. The only line you
cannot avoid if you want a phone app is Apple's $99/year.

Two honest blanks: OpenRouter publishes no average personal spend, so none is
quoted here, and hardware prices move with the market, so they are ranges.

---

## License

MIT for this project's own code — see [LICENSE](LICENSE). Third-party
components (bundled xterm.js, JetBrains Mono, and others) are listed with their
licenses in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

## Author

Built by **Luke Nau** — [GitHub](https://github.com/lukenau) · [LinkedIn](https://www.linkedin.com/in/lukenau).

Discussion, bug reports, and pull requests are welcome. Contributions are
accepted under the Developer Certificate of Origin, so sign your commits
(`git commit -s`). See [CONTRIBUTING.md](CONTRIBUTING.md).
