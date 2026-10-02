# Connectors

A hub is only as useful as what it can reach. There are two layers, and it is
worth knowing which is which before you start wiring things up.

- **Hub-native** — things the server itself wires up through environment
  variables. These are listed in [SERVICES.md](SERVICES.md) with the exact
  variables, and none of them are bundled.
- **Agent-side** — tools and accounts the *agent* you run alongside the hub can
  use. The hub displays the result; the agent does the reaching. This page is
  the pattern for those.

The distinction matters because the hub alone is a dashboard and a chat shell.
Everything that makes it feel alive comes from the agent on the other side of it.

## What this project has actually been running on

This is the honest list of what a working setup looks like, so you can see the
shape of a real one rather than a feature grid. Every row is optional except
model access.

| Connector | What it gives you | How it is reached | Notes |
|---|---|---|---|
| [OpenRouter](https://openrouter.ai) | Any frontier model through one key | An API key | The one thing you must have. See [SERVICES.md](SERVICES.md) |
| [Supermemory](https://supermemory.ai) | The agent remembers facts, preferences and history across sessions | The memory API, SDK, or MCP | Memory lives outside the model, so it survives a model change |
| [Exa](https://exa.ai) | Web search that returns real sources rather than a guess | An API key | Search quality shapes every answer downstream |
| [Superhuman Mail](https://superhuman.com) | Email and calendar in one surface | An MCP server over your own account | Bring your own subscription |
| [Google Workspace](https://workspace.google.com) | Gmail, Calendar, Drive, Docs, Sheets | The `gws` CLI over OAuth | Your own Google account |
| [Apple Messages](https://support.apple.com/guide/messages/welcome/mac) | Read and send iMessage from the agent | A collector running on a Mac plus an MCP endpoint (`IMESSAGE_MCP_URL`) | The Mac must be awake |
| [Home Assistant](https://www.home-assistant.io) | Lights, climate, scenes, sensors | The Home Assistant API; writes are gated | Dry-run until you opt in (`HA_LIVE_APPLY`) |
| [Murmur](MURMUR.md) | Xavier's wearable capture sub-product: the BLE passthrough that drains a flash-recording wearable into searchable, speaker-tagged transcripts | A wearable recorder plus a local bridge service (`MURMUR_BRIDGE_URL`) | Sub-product of Xavier; optional hardware |
| [Oura](https://ouraring.com) | Sleep, readiness, recovery | The Oura API | Your own ring and token |
| [AfterShip](https://www.aftership.com) | Package tracking and returns | An API key | Reads tracking numbers from mail and chat |
| [Box](https://www.box.com) | Cloud files and sharing | The Box API | Alternative to local file roots |
| [tmux](https://github.com/tmux/tmux) | Run commands and coding sessions on your machine | A tmux daemon on your host, over your private network | Writes are Face ID gated |
| [Browser Use](https://browser-use.com) | Drives a real browser for tasks a page needs | The Browser Use API, or local Chrome for anything you would rather keep on your own machine | Optional; local mode keeps browsing on your own hardware |
| [Lobster Cash](https://lobster.cash) | Let the agent buy something within limits | The `lobstercash` CLI, maintained by [Crossmint](https://www.crossmint.com) | Scoped virtual cards and a wallet; credentials stay with the provider |
| [1Password](https://1password.com) | Keep keys out of your files | The `op` CLI with a service account token | Preferred over `.env` for anything you care about |
| [Discord](https://discord.com) | Talk to the agent where you already are | A bot token | The hub app is the primary surface; this is an extra |
| [Telegram](https://telegram.org) | The same, on a different messenger | A bot token | Optional |
| [Expo](https://expo.dev) | Builds and updates for the phone app | The Expo CLI and a project | Needed only if you ship your own app builds |
| [Apple WeatherKit](https://developer.apple.com/weatherkit/) | Forecasts that match the Weather app | A developer membership and a key | Included with an Apple Developer membership |
| [Open-Meteo](https://open-meteo.com) | Forecasts with no account at all | Nothing, it is open | The free alternative to WeatherKit |
| [Tailscale](https://tailscale.com) | A private network so your phone can reach the server | The Tailscale client, or [Headscale](https://github.com/juanfont/headscale) for your own control plane | See [MESH.md](MESH.md) |
| [Cloudflare](https://www.cloudflare.com) | An alternative path in, with TLS | A Cloudflare account and a tunnel | See [MESH.md](MESH.md) |
| [Docker](https://www.docker.com) | Runs the server | `docker compose up` | The only hard dependency for the server |

## The pattern for adding one

Most connectors are one of three shapes:

1. **A CLI on the host.** Install it, give it credentials, and let the agent
   call it. The terminal surface then works with it for free.
2. **An MCP server.** A standard way to expose tools to an agent. Point your
   agent at the server's URL and it gains those tools.
3. **An API key.** The simplest case: an env var on the server or a token in
   your vault, and the agent can call the API directly.

If it has an API or a CLI, it can be wired up. The agent can usually write the
connector itself.

## Building something that belongs on this page

If you maintain a service an agent would want to reach, and it has an API or a
CLI, this project is meant to work with it. Open an issue with a link and a
sentence about what it would unlock. Being reachable is the point of a hub, so
this list is meant to grow.

## Where credentials live

None of them live in this repository, and none of them pass through the
maintainer.

- **Preferred:** a password manager with a CLI and a scoped service account, so
  the secret is injected at run time and never written to disk in plain text.
- **Acceptable:** a `.env` file on the server that is gitignored and readable
  only by the account running the hub.
- **Never:** committed to the repo, pasted into chat, or embedded in the app.

If you are handing a build to someone else, remember that a build-time server
address is baked into the app: see [CONNECT-APP.md](CONNECT-APP.md) and
[SECURITY.md](../SECURITY.md) for what that does and does not protect.

## What is not here, on purpose

Tooling tied to the maintainer's day job is excluded from this project by
policy. If you are adapting this for work use, keep that boundary deliberately:
the value of a personal hub is that it is yours, and mixing an employer's data
into it is how a personal project becomes someone else's problem.

## A note on names

Products and companies named on this page belong to their owners. They are
listed descriptively, to say what this project has been used with. No
affiliation or endorsement is implied in either direction, and nothing here
should be copied into app store metadata.
