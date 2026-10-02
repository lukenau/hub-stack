# Changelog

All notable changes to hub-stack are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

This project does not publish version tags yet, so the entry below is named for
its date rather than a version number. (The app build declares its own `1.0.0`
version in `app/app.json`, but the repository has no matching tag.)

## 2026-10-02 — first public release (no version tag)

The first cut of the public repository, through commit `c945524`. Everything
listed under **Added** ships in this release. The **Changed**, **Fixed** and
**Removed** entries record corrections made in the repository's own public
history before this cut, not changes against an earlier release — there is no
earlier release to compare against.

### Added

- The self-hostable hub server (FastAPI) and its companion app for web, iPhone and Android (Expo / React Native), in one MIT-licensed repository.
- A one-command installer (`./install.sh`) that checks prerequisites, creates `.env` with mode 600, builds and starts the server, waits for a health check, and prints the URL to point the app at. Subcommands cover start, stop, restart, update, logs, status, URL, uninstall and help.
- Device pairing with a one-time six-character enrolment code minted from the Hub PWA behind Face ID — no pasted token, no login.
- A write gate on every state-changing call: the server issues a challenge, the phone signs it with a key held in its Secure Enclave, and the change is applied only after verification. With no signer registered the server refuses with a 412 before any proof is checked.
- Chat with the assistant in the native app: durable server-side threads with pin, rename, archive and unread cursors, a cross-thread "what needs me" inbox, streamed replies, and the ability to queue, steer, redirect or stop a running turn.
- Approval cards for actions that need a human decision, applied as a Face ID gated batch.
- A clarify widget that parks a turn on a question and resumes the thread with your answer.
- Photo attachments, uploaded as media ids before the message that carries them.
- Rich chat widgets drawn natively: card, metric, chart, table, progress, checklist, calendar, weather, form, link and clarify. `button_row` and `poll` render but are disabled, because the reply routes they would call do not exist yet. A widget the current build cannot draw shows a one-line notice instead of vanishing from the transcript.
- A checklist widget whose tick state is persisted server-side, so every client reads back the same state.
- A terminal on your own machine from your phone: xterm.js over a ttyd unix-domain socket, unlocked with Face ID, with reconnect/backoff, expiry re-lock and pause/resume flow control.
- A tmux session picker to list, spawn, kill and resume Claude Code sessions across hosts; spawn and kill go through the write gate, and a resume is restricted to a per-host directory allowlist.
- Terminal runbooks: grouped one-tap command sets that fill the composer for review; nothing executes on tap.
- An Automations view listing scheduled jobs grouped into needs-you, new, earlier and quiet, with per-run timelines, folding of repeated identical failures, per-job push/quiet/mute and snooze preferences, and the option to continue a run's output as a chat thread.
- A daily brief page with per-item dismiss, snooze, undo, useful and note actions gated by a per-item token, editable standing rules, and a morning push registration bound to the device key.
- A read-only calendar view over a synced snapshot, with an idempotent "sync now" request.
- Home Assistant control from the hub, behind the same write gate, staying in dry-run until `HA_LIVE_APPLY=true` and a Home Assistant token are supplied.
- A multi-root file browser with traversal and symlink-escape rejection that never serves dotfiles or credential-bearing files.
- Murmur, Xavier's wearable-capture sub-product: a bridge daemon (`services/murmur-bridge/`) that bonds to a BLE recorder over Bluetooth, drains its flash buffer, and ships the audio to a transcription backend you run; plus a status-and-control page in the app (pendant / bridge / pipeline / memory) with gated drain, pause and resume. Optional and absent unless a bridge token is configured.
- Push notifications through Expo for chat replies, automation alerts and the morning brief, sent only when the app reports you are not already looking at it.
- An Ops area showing health checks, restic backup status, cron run logs and costs, OpenRouter credit balance, spend summaries and a doctor report — each panel degrading to an honest empty state when its service is unconfigured.
- A memory-status panel, and a Decision Inbox where parked decisions are answered through the write gate.
- Bring-your-own-model: point the hub at a single OpenRouter key and choose any model. An optional management key adds per-model daily activity. Inference is billed to your own account at cost, and a blank key is a supported off state.
- Optional integrations, all blank by default: the hub-bridge sidecar client, the iMessage MCP draft queue, Discord approval buttons, the 1Password `op` CLI pattern, OpenTelemetry export to any OTLP collector, and an example Apple WeatherKit connector (`scripts/weatherkit.py`).
- README architecture and request-flow diagrams, plus a screenshot set rebuilt from the app's own captures.
- A full documentation set covering setup, connecting the app, mesh networking, services, features, Murmur, privacy, security, comparisons, app publishing and troubleshooting.
- Continuous integration: a test workflow, a DCO sign-off check, and a publish gate that scans the tree for private or owner-specific content.
- A pass of chat improvements ported from the personal Hub app. The weather card is now composed from its sections (day and hour counts, labels, and a per-day hourly chart). The photo picker takes several pictures at once, up to the four a message holds. Message images render uncropped and open in a full-screen viewer. File parts are drawn from the downloaded bytes (text, markdown, frame and image) with a preview sheet that keeps Share in the header. A timeline widget (a timestamped event log) joins the widget set. Finished tool calls fold on completion, and a thinking block collapses with an animation instead of snapping from its streaming tail to a one-line label. Chat text now sizes itself: the stale pinned height that left a gap above the timestamp — and made the page bounce while a long reply streamed — is gone. (`94c5e08`)
- The chat port adds three runtime dependencies — `expo-document-picker`, `expo-file-system` and `expo-sharing` — and extends the iOS paste module so a pasted file is read and handed over as base64 alongside the pasted picture it already accepted. (`94c5e08`)

### Changed

- The installer no longer generates or asks for an `HUB_API_TOKEN`; pairing is a one-time enrolment code. `HUB_API_TOKEN` remains in `.env.example` only as a documented reserved placeholder that the server does not read. (`20fa991`, `81b4d93`, `5d16636`)
- Documentation and the shown installer output now match the installer's real behaviour: it prints `Created .env (mode 600)`, the stated prerequisites are Docker, Compose v2 and bash (curl optional), and the `--token` flag is gone. (`81b4d93`, `20fa991`)
- The README and connection docs describe the app's real connection model: a source build takes its server address from `expo.extra.apiBase` at build time, and the app can also be pointed at a server URL at runtime. (`8d1c80f`, `7e5a2ef`)
- Security documentation now states plainly that reads are protected only by the network boundary (the server has no per-request authentication), and that the hub-bridge read-only allowlist lives in a sidecar this repository does not ship. (`251437b`, `8e0bb51`)
- The product is branded Xavier throughout the app and README, with the character art and icons copied from the real app and verified byte-identical per file rather than redrawn. (`8e0bb51`, `8d1c80f`, `c10f8ac`)
- Murmur is presented as a sub-product of Xavier led by the BLE passthrough, rather than as a standalone capability. (`be03bca`, `0dbc989`)
- The Murmur surface in the app appears only once the server reports a bridge token is provisioned (`GET /api/murmur/configured`), instead of inferring it from a derived status file. (`9d44bb3`)
- The public app ships without the owner's trading tab and personal ops runbooks, and its tooling no longer assumes a private monorepo directory. (`8d1c80f`)
- The app's build identity is no longer the author's: `app/app.json` carries a placeholder bundle id and no Expo owner, `app/app.config.js` overrides them (and the EAS project id) from `EXPO_OWNER`, `IOS_BUNDLE_IDENTIFIER` and `EAS_PROJECT_ID` at build time, and `app/eas.json` ships a placeholder `ascAppId`. The fork checklist is in `docs/PUBLISH-APP.md`. (`7989e0e`)

### Fixed

- The installer's first-install defects, all of which fired on a normal cold start: `./data` is now created and owned before `docker compose up`, so the non-root container can write it (Docker used to create it `root:root` 755, and the first write failed with `EACCES` after the script had already printed "Done"); a host without `curl` falls back to the same in-container `/api/healthz` probe compose uses instead of spinning for 90 seconds and reporting a healthy server as failed; `HUB_PORT` is actually honoured (compose publishes `${HUB_PORT:-8090}` and the script resolves shell env, then `.env`, then 8090, and exports it); the `HUB_TZ` seed uses the script's own `sed_inplace` helper rather than a bare `sed` that dumped all of `.env` to stdout and left the value unmodified; and the port-in-use check probes `/dev/tcp` instead of trusting BusyBox `lsof`, which ignores the TCP filters and exits 0 on a free port. `--help` now prints only the header comment. (`b1ebfad`)
- Home Assistant applies now use the primary WebAuthn gate, so the authenticator's sign counter is persisted and cloned-authenticator detection applies to `/api/ha/apply` like every other privileged surface. (`44ad156`)
- The publish gate defaults to the current directory (and CI passes the repo root), so it no longer dies on a hard-coded local path before it scans anything. (`0e54dc5`)
- CI's hygiene job runs the maintained publish-gate script instead of a drifted inline copy that had failed every run since it was added. (`08572ab`)
- Hub-server tests run one process per file, so module-scope environment setup in one test cannot leak into another. (`9aa6649`)
- App test tooling no longer requires the non-public PWA directory, so `npm run check` and `npm test` pass on a fresh clone; genuinely broken tests were repaired, and a misleading `window.dispatchEvent` failure caused by the test renderer is gone. (`8d1c80f`)
- Private-architecture strings on the Ops, System and Config screens were replaced with generic operator descriptions. (`567d005`, `ba0243f`)
- The Backups card no longer asserts one deployment's schedule and repository policy to every user; the schedule and append-only flag render only when the server's backup status file reports them. (`7989e0e`)
- Backup test fixtures use obviously-fictional values instead of a repository name and size that may be the author's real ones. (`7989e0e`)
- The slash-command bootstrap seed no longer carries any deployment's real command registry: `server/chat/command_catalog_bootstrap.json` is now a small, hand-authored, generic sample of the catalogue wire format, replacing a generated dump of a live gateway's private skill, plugin and alias registrations. (`92286cf`)
- The server's own module docstring no longer names an internal deployment: the optional liveness probe is described generically, so the publish gate's internal-hostname scan is clean instead of matching a bare prose component name. (`9e5dfc7`)

### Removed

- Hard-coded personal Discord ids: the approvals channel and approver defaults are now empty (dormant until configured), and the automation category map uses synthetic placeholder ids. (`fc81b01`)
- An Android `RECORD_AUDIO` permission that had no code path behind it. (`8d1c80f`)
- The composed README banner and its SVG source, replaced by the real app icon and character images. (`c10f8ac`)
- The TestFlight group from `app/eas.json` (a group belongs to a deployment and is supplied at submit time with `--groups`). (`5c5694c`)
- The two bootstrap-generation scripts (`server/chat/generate_command_catalog_bootstrap.py` and `.sh`), which read a running gateway's registries and wrote them straight into the repo — tooling that existed only to refresh one deployment's seed, with no product role now that the seed is a generic placeholder. (`92286cf`)

---

For what each release contains and how to configure it, see
[README.md](README.md), [docs/FEATURES.md](docs/FEATURES.md) and
[docs/SERVICES.md](docs/SERVICES.md).
