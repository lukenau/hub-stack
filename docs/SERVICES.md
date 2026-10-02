# Services: every optional subservice you can wire into the hub

hub-stack is the hub server and app. It bundles **none** of the services below.
The code that talks to each one ships in this repo; the service itself is yours
to run or skip. Every knob is blank by default, blank is the supported "off"
state, and the hub starts fine with all of them unset. Panels that depend on a
service you have not configured degrade (a 503 or an empty card) rather than
crash.

Each service below lists what it unlocks, the exact environment variables the
server reads, what you need to get, and a block you can paste into `.env`
(gitignored; never put secrets in a tracked file). Restart with
`./install.sh --restart` after changing `.env`, and check `./install.sh --status`.

The split between these two pages: this page covers what the **server** itself
wires through environment variables. Tools the **agent** you run alongside it
can reach (mail, calendar, search, packages, storage, health, browser
automation, payments, secrets, and the general pattern for adding any tool via
a CLI, an MCP server, or an API key) are covered separately in
**[CONNECTORS.md](CONNECTORS.md)**.

A note that applies to everything below, including the CLI tools: credentials
for any of these live outside the repo. They sit in your `.env` (gitignored),
in your password vault, with the provider, or in your own shell environment,
and none of them are ever committed here.

## Start with nothing

The minimum viable install is the hub with every service knob left blank:

```ini
# .env, server basics only
HUB_PUBLIC_BASE=http://127.0.0.1:8090
```

That gives you a private dashboard (health, files, calendar if you point
`HUB_CALENDAR` at a file later) and the chat shell. Chat has no agent behind it
until you configure the agent runtime, so it holds your sessions and history
without answering. This is a real, supported way to run the hub, not a broken
one: reads work, writes are gated by the passkey ceremony, and every missing
service is an honest empty panel.

## Agent runtime

### Hermes agent gateway

The agent that answers chat, holds your memory, and reports spend and model
usage. Without it the hub is a dashboard plus chat shell; with it, chat gets an
assistant and the memory and vitals panels come alive.

```ini
HERMES_API_BASE=https://your-gateway-host:port
HERMES_API_KEY=
HERMES_AGENT_ID=hermes
HERMES_AGENT_NAME=Xavier
```

Requires: a running Hermes agent gateway reachable at `HERMES_API_BASE` from
the hub container. `HERMES_API_KEY` authenticates the hub to it. The id and
name are labels the hub shows for the agent.

### hub-bridge sidecar

A privileged helper intended to run read-only agent CLI commands (skills list,
spend reads) on the hub's behalf, keeping the docker socket and any privileged
access out of the hub-api container itself. **This sidecar is not included in
this repository** — only `server/app.py`'s client code that POSTs argv to it
exists here. The hub sends its argv to `/run` (reads) and `/run-write`
(writes) on the URL below; whatever enforces a read-only allowlist on those
endpoints lives in `services/hub-bridge`'s own source, which you must supply
and run yourself. Treat the allowlist as a claim about a sibling service, not
something this repo lets you verify.

```ini
HUB_BRIDGE_URL=http://hub-bridge:port
HUB_BRIDGE_TIMEOUT_S=35
```

Requires: the bridge sidecar running where the hub can reach it (same compose
network in the reference deployment). `HUB_BRIDGE_TIMEOUT_S` is the hub's client
timeout; the default sits just above the bridge's own 30 second exec timeout.
Empty `HUB_BRIDGE_URL` disables every bridge-backed endpoint.

### Cloud browser card

Shows the assistant's cloud browser sessions on a phone-shaped card: running
sessions with an embeddable live view, plus recent sessions with replay links.

```ini
BROWSERBASE_API_KEY=
```

Requires: an account and API key with the cloud-browser provider. Without the key the
browser card hides itself (a 404, not an error surface).

## Model access

### OpenRouter inference key

One key, any model. Model-backed features and the spend card (credits and
[OpenRouter](https://openrouter.ai)'s own daily and monthly meters) read from this key. Leave it blank
and the hub runs without model-backed features.

```ini
OPENROUTER_API_KEY=sk-or-...
```

Requires: an OpenRouter account and key from openrouter.ai. Usage is billed to
your account at cost; the hub never proxies it.

### OpenRouter management key

Per-model, per-day activity from OpenRouter's activity endpoint, which answers
only to a management key. This catches spend that never reaches session
records. Without it the spend card shows credits alone.

```ini
OPENROUTER_MGMT_KEY=
```

Requires: a management key from your OpenRouter dashboard (a separate key type
from the inference key above).

## Capture and input

### Murmur (voice capture bridge)

Voice capture status and control on the Murmur page: pendant, bridge, and
pipeline state, plus gated actions (drain, pause) that the bridge picks up.

```ini
MURMUR_BRIDGE_TOKEN=
MURMUR_BRIDGE_TOKEN_FILE=/data/hub/murmur-bridge-token
MURMUR_BRIDGE_STATUS=/data/hub/murmur-bridge-status.json
MURMUR_COMMANDS=/data/hub/murmur-commands.json
MURMUR_DERIVED=/data/hub/log/murmur.json
```

Requires: your Murmur bridge (not bundled). The hub has no network path to the
bridge; integration is file and bearer token based. Your bridge daemon POSTs
its status snapshot to the hub (authenticated with the bearer token set in
`MURMUR_BRIDGE_TOKEN` or stored at `MURMUR_BRIDGE_TOKEN_FILE`), polls
`MURMUR_COMMANDS` for gated actions you click in the hub, and a host cron
derives the combined status file read at `MURMUR_DERIVED`. All paths have
working defaults; set the token (or provision the token file) to switch the
bridge endpoints on.

### iMessage (MCP)

Compose and send iMessage drafts from the hub. Drafts are queued, expire in
about 15 minutes, and only send after an explicit, token-verified send that the
human approves on the Mac side.

```ini
IMESSAGE_MCP_URL=http://your-mac-host:8400/mcp
IMESSAGE_MCP_TOKEN=
IMESSAGE_QUEUE_DIR=/data/hub/queue/imessage-drafts
```

Requires: an iMessage MCP server running on your Mac. The token comes from
`IMESSAGE_MCP_TOKEN` or, failing that, from the file
`/data/hub/secrets/imessage-token` (that file's path itself is overridable with
`IMESSAGE_TOKEN_FILE`). Without a token, send endpoints report the integration
as unconfigured.

## Household

### Home Assistant

Propose and apply smart-home actions from the hub, with a per-action WebAuthn
ceremony (Face ID) and a challenge bound to the proposal being approved. The
hub stays in dry-run, logging what it would apply, until you flip the switch.

```ini
HA_LIVE_APPLY=false
```

Requires: your own [Home Assistant](https://www.home-assistant.io) server. Point the hub at it via
`home-assistant.json` next to the server (copy `server/home-assistant.json.example`
as the starting shape). Set `HA_LIVE_APPLY=true` only when you are ready for
verified writes to reach Home Assistant; `false`, `1`/`0`, and `yes`/`no` are
also accepted spellings.

### Weather widget data

The app's weather widget draws JSON in a fixed shape. This repo does not bundle
a weather provider; it includes an example connector,
`scripts/weatherkit.py`, which calls [Apple WeatherKit](https://developer.apple.com/weatherkit/) and prints exactly the
JSON the widget expects. As a free alternative with no key, [Open-Meteo](https://open-meteo.com) serves
the same kind of forecast data and a short script can reshape its output the
same way.

No hub env vars are involved: the connector is something you run (from cron or
a briefing job) wherever you like, and its output reaches the hub the same way
the other dashboard feeds below do.

## Machine control

### Terminal (ttyd)

A working shell in the hub, proxied to a host ttyd that listens on a unix
domain socket only. The proxy forwards HTTP and websocket traffic only after a
verified WebAuthn assertion issues a short-lived session cookie.

```ini
HUB_TTYD_SOCK=/data/hub/ttyd.sock
HUB_TTYD_BASE=/terminal
```

Requires: ttyd running on the host with its unix socket where the hub container
can open it (default expectation is under the shared hub data dir) and started
with `--base-path` matching `HUB_TTYD_BASE`. Empty `HUB_TTYD_SOCK` disables the
terminal surface entirely.

### hub-tmuxd

Spawn and kill [tmux](https://github.com/tmux/tmux) sessions from the hub, dispatched only through the WebAuthn
write gate. Reads are plain GETs; every spawn and kill needs the passkey
ceremony.

```ini
HUB_TMUXD_SOCK=/data/hub/tmuxd.sock
```

Requires: hub-tmuxd running on the host with the same unix-socket isolation
story as ttyd. The default path is baked in so no container recreation is
needed.

### Browser automation (browse CLI)

Drive a real browser from the command line or from an agent: your own local
Chrome, or a remote cloud-browser session when you supply a key. Local mode keeps
all browsing on your own machine; nothing about it leaves your box.

```ini
# Only needed for remote cloud-browser mode; local mode uses no key at all.
BROWSERBASE_API_KEY=
```

Requires: Node and npm. Install with `npm install -g browse`. Out of the box
it drives a local Chrome on your machine, which keeps every page, cookie, and
login on hardware you control. If you also want cloud sessions, set
`BROWSERBASE_API_KEY` (the same variable the hub's cloud-browser card reads, see
Agent runtime above) and point browse at the cloud provider; that mode sends browsing
to the provider, so use it only when you want it. Entirely optional: the hub
never calls browse itself.

## Payments

### Lobster Cash (agent payments)

Gives an agent a wallet plus scoped card permissions for online purchases, so
spending happens under limits you set rather than an open card. A third-party
product from [Crossmint](https://www.crossmint.com); you bring your own account, and it is entirely
optional.

No hub `.env` values are involved: the hub never calls [Lobster Cash](https://lobster.cash). Install
the CLI (`npm install -g @crossmint/lobster-cli`, binary `lobstercash`), create
your Crossmint account, and configure wallets and card scopes there. Your
payment credentials stay with Crossmint and never enter this repo; if you use
it, the purchases it makes are between you, your agent, and the merchant.

## Notifications

### Push notifications (Expo)

The hub can push to your phone (approvals, automations). A device registers its
[Expo](https://expo.dev) push token through a WebAuthn-gated endpoint, and the challenge is bound
to the token so a captured proof cannot redirect your notifications.

```ini
HUB_PUSH_TOKENS=/data/hub/data/push_tokens.json
```

Requires: an APNs key you supply for delivery, and the app registering its
token. The token file path has a working default; registered tokens are never
returned by the listing.

### Discord approvals

Approval requests appear as buttons in a [Discord](https://discord.com) channel you control, delivered
over an outbound gateway websocket (no inbound interactions URL, so nothing is
exposed publicly). Only the configured approver's press counts, and each draft
is separately protected by an HMAC.

```ini
HUB_APPROVALS_CHANNEL=
HUB_APPROVER_DISCORD_ID=
```

Requires: a Discord bot invited to your server, with its token in the file
`/data/hub/secrets/discord-approvals-token` (that path is overridable with
`HUB_DISCORD_APPROVALS_TOKEN`). Set the channel id and your Discord user id in
the two variables above. Dormant until the token file exists.

## Storage and paths

### File browser roots

A read-only, multi-root file browser in the hub. Four allowlisted roots with
traversal and symlink escape rejection; dotfiles and credential-bearing files
are never served.

```ini
# Replace the whole root registry wholesale (one "id:label:/abs/path" per root):
HUB_FS_ROOTS=sites:Sites:/data/sites;code_ai:code/ai:/data/code/ai
# Or, without HUB_FS_ROOTS, move roots one at a time from their Mac defaults:
HUB_FS_SITES=
HUB_FS_CODE_AI=
HUB_FS_HUB_CONFIG=
HUB_FS_LAUNCH_AGENTS=
```

Requires: nothing. The defaults point at Mac-style home paths, so on a Linux or
container deployment set `HUB_FS_ROOTS` (or the per-root variables) to the
directories you actually want browsable. `HUB_FS_ROOTS`, when set, replaces the
per-root variables entirely.

### Chat store

Chat history, sessions, and uploaded media live in files you can relocate.
Self-contained; nothing external is required.

```ini
HUB_CHAT_DB=/data/hub/chat/chat.db
HUB_CHAT_SESSIONS_FILE=/data/hub/chat/sessions.json
HUB_CHAT_MEDIA_DIR=/data/hub/chat/media
```

Requires: nothing. The defaults are fine; set these only when you want the
store somewhere else (a mounted volume, for example).

### Dashboard feeds

Several panels are filesystem-as-API: something on your side writes a file, the
hub serves it, and a missing or stale file degrades that panel honestly.

```ini
HUB_CALENDAR=/data/hub/calendar.json
HUB_FINANCE_SNAPSHOT=/data/sites/finance/snapshot.json
HUB_BRIEFING_RULES=/data/hub/data/briefing_rules.json
HUB_DECISIONS_DIR=/data/hub/decisions
HUB_INBOX_DIR=/data/hub-inbox
```

- `HUB_CALENDAR`: a calendar snapshot file the hub's calendar card reads; a
  sync request file sits next to it for host-side refresh.
- `HUB_FINANCE_SNAPSHOT`: a snapshot file the app can display; the hub only
  serves it and never talks to any provider itself.
- `HUB_BRIEFING_RULES`: the briefing rules file the hub reads and writes when
  you edit them in the app.
- `HUB_DECISIONS_DIR`: one JSON file per decision; agents write cards, you
  answer through the WebAuthn gate, and every answer appends to an
  append-only ledger in the same directory.
- `HUB_INBOX_DIR`: cards any agent can drop as JSON files, shown on the feed.

All five have working defaults and need no configuration to run standalone.

## Security

### Passkeys (WebAuthn)

The Face ID / touch ceremony that authorizes every write, terminal session, and
gated action. Self-contained; this is what makes a network-reachable hub safe
to write to.

```ini
HUB_RP_ID=your-hub-hostname
HUB_RP_NAME=Hub
HUB_PASSKEYS=/path/to/passkeys.json
```

Requires: nothing external. Set `HUB_RP_ID` to the hostname your app actually
uses (the default is `localhost`, which only works for local testing);
passkeys are bound to it. The passkey store path has a working default.

### Device keys and enrolment

Write-capable device keys held in the phone's Secure Enclave, trusted only
after you mint a one-time, single-use, expiring enrolment code.

```ini
HUB_DEVICEKEYS=/path/to/devicekeys.json
HUB_ENROLL_CODE_TTL_S=120
HUB_ENROLL_CODE_MAX_ATTEMPTS=5
```

Requires: nothing external. The TTL (seconds a minted code lives) and the
attempt limit have working defaults; raise the TTL only if your testers keep
letting codes expire. Reads are not authenticated by any of this; the network
boundary is, so keep the hub off the public internet. See `SECURITY.md`.

### Platform key

A bearer key gating the hub's platform API (`/api/platform/hub`), which is how
the agent side calls into the hub. Only the key file's path is configurable;
the key value is never read from an environment variable.

```ini
HUB_PLATFORM_KEY_FILE=/data/hub-platform/HUB_PLATFORM_KEY
```

Requires: provisioning the key file itself (mode 0640, readable by the hub
process). Unprovisioned, platform endpoints report the key as missing rather
than accepting unauthenticated calls.

### 1Password (op CLI)

Keep API keys and credentials in your [1Password](https://1password.com) vault and inject them at run
time instead of writing them into `.env`. Anything the hub needs can be
rendered into the environment when a process starts, so the secret on disk is
your vault, not a copy of it.

```ini
# Consumed by the op CLI, not by hub-api. Keep it in the shell environment
# where you run op (or your systemd/launchd unit), rather than the hub's .env.
OP_SERVICE_ACCOUNT_TOKEN=
```

Requires: a 1Password account with a service account, and the `op` CLI
installed where you run your jobs. Create the service account in your
1Password settings, scope its vault access to the few items it actually needs,
and export `OP_SERVICE_ACCOUNT_TOKEN` in that environment. The token authorizes
vault reads, so treat it like the secrets it unlocks; it lives in your
environment and your vault, never in this repo. Entirely optional: `.env`
remains fully supported if you prefer flat files.

## Observability

### OpenTelemetry export

The server is built on FastAPI, whose automatic telemetry can export traces,
metrics, and logs to any OTLP collector. Set an endpoint and export begins at
startup; remove it and nothing is sent anywhere.

```ini
OTEL_EXPORTER_OTLP_ENDPOINT=http://your-collector:4318
OTEL_SDK_DISABLED=false
```

Requires: an OTLP/HTTP collector of your choice. The endpoint must be an
absolute HTTP or HTTPS URL; signal-specific endpoints
(`OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` and friends) override it per signal.
Set `OTEL_SDK_DISABLED=true` to force telemetry off regardless.

## Adding services later

Every service above is additive and independent. You can wire them in one at a
time, in any order, long after the first install: put the values in `.env`,
restart with `./install.sh --restart`, and confirm with `./install.sh --status`
and the relevant panel. Nothing else in the hub changes when you add or remove
one, and removing a service (blank the knobs, restart) returns those panels to
their honest empty state.
