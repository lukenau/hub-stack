# Murmur: BLE capture bridge

Murmur is a BLE audio-recorder pipeline in two parts: a wearable recorder that
records continuously to its own flash, and a bridge daemon this repository ships
at [`services/murmur-bridge/`](../services/murmur-bridge/). The daemon bonds to
the recorder over Bluetooth, drains the recorded audio off its flash, and
uploads it to a transcription backend you run. The recorder is hardware you
supply; the daemon is the part this repository ships. Nothing else in the hub
depends on either.

## Interfaces

End to end, in order:

1. **Recorder.** A wearable BLE audio recorder writes audio to its on-board
   flash as pages. The buffer holds roughly 35 hours of VAD-gated speech (Opus,
   16 kHz mono) before it begins overwriting pages that have not yet been
   drained. The recorder is hardware you supply; this repository ships no
   firmware and no hardware.
2. **Bridge daemon.** A service on an always-on machine within BLE range of the
   recorder. It bonds over Bluetooth LE, reads flash pages off the device,
   decodes the Opus frames in each page, and writes them to a local staging
   directory as WAV (16 kHz, mono). It uploads each staged file to the
   transcription backend over your network, queues locally while the recorder is
   out of range, and deletes a flash page on the recorder only after the backend
   has acknowledged receipt of that page's audio — so the ~35-hour buffer is the
   gap tolerance, not a data-loss window. The daemon is in this repo at
   [`services/murmur-bridge/`](../services/murmur-bridge/) (its README carries
   the install and configuration detail).
3. **Transcription backend.** A self-hosted service you run. It receives the
   uploaded audio, transcribes it, diarizes it, and recognizes enrolled
   speakers, producing conversations. (The author runs
   [Chronicle](https://github.com/SimpleOpenSoftware/chronicle), MIT.)
4. **Extraction.** A model call per conversation pulls out memories and
   summaries. This is the only stage that calls a model provider.
5. **Canonical store.** Speaker-tagged transcript day files on your disk (the
   primary record — every index above it is rebuildable), a rotating audio
   store, and a memory index the agent reads from. The ETL script
   (`services/murmur-bridge/murmur/etl/murmur_to_supermemory.py`) mirrors the
   backend's conversations into the memory store and appends the per-day file.

## Requirements

- **A recorder.** A BLE wearable audio recorder whose wire protocol matches the
  schemas vendored at
  `services/murmur-bridge/murmur/bridge/proto/` and identified over the air by
  its GATT characteristics. The bridge does not support arbitrary BLE recorders;
  it speaks one pendant protocol (vendored from `MAkcanca/pendant-cli` — see
  [THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md)).
- **An always-on machine with Bluetooth** that can stay in BLE range of the
  recorder. A Raspberry Pi on the same network as the hub server is the typical
  host.
- **A transcription backend** (self-hosted), plus a model-provider key for the
  extraction stage if you want memory extraction.
- **Hub configuration**, if you want the hub's Murmur page: the environment
  variables in [SERVICES.md](SERVICES.md#murmur-voice-capture-bridge), with the
  bridge bearer token provisioned.

## Configuration surface

The bridge daemon reads a TOML config (see
`services/murmur-bridge/config.example.toml`; default path
`/etc/murmur/config.toml`): `mac`, `base_url`, `api_key`, `store_dir`,
`status_path`, `status_remote`, `commands_path`, `commands_remote`,
`status_interval_s`. With `status_remote`/`commands_remote` omitted it runs
drain-only; the ETL and companion scripts take their paths and secrets from
environment variables (see their docstrings).

The hub reads these environment variables (all paths have working defaults; the
token is what switches the bridge endpoints on):

```ini
MURMUR_BRIDGE_TOKEN=
MURMUR_BRIDGE_TOKEN_FILE=/data/hub/murmur-bridge-token
MURMUR_BRIDGE_STATUS=/data/hub/murmur-bridge-status.json
MURMUR_COMMANDS=/data/hub/murmur-commands.json
MURMUR_DERIVED=/data/hub/log/murmur.json
```

The hub has no network path to the bridge. Integration is by file and bearer
token: the bridge daemon POSTs its status snapshot to `/api/murmur/bridge/status`
(authenticated with the token set in `MURMUR_BRIDGE_TOKEN` or stored at
`MURMUR_BRIDGE_TOKEN_FILE`), polls `/api/murmur/bridge/commands` for gated
actions you click in the hub, and a host cron derives the combined status file
read at `MURMUR_DERIVED` (the derive script is host-side and not part of this
repository).

The Murmur page is served only when a bridge token is provisioned — the app asks
`GET /api/murmur/configured`, which reports the same token. With no token the
page does not appear and no other part of the hub changes. Every other
integration is independent of it.

## What the hub shows

The Murmur page is one capture-chain strip — **Pendant → Bridge → Pipeline →
Memory** — with a status dot per stage and one fact line each. Below the strip,
four read-only cards:

- **Pendant** — recording state (recording, paused, disconnected, never bonded),
  battery, how much of the flash buffer is used (scaled off the documented
  ~35-hour capacity), and three gated actions: drain now, pause capture, resume
  capture. They go through the same challenge, sign, apply write gate as every
  other write in the hub.
- **Bridge** — host, up/down, last heartbeat, queued audio, last upload, and
  the last error if the bridge reported one.
- **Pipeline** — whether the transcription backend is up, conversations
  processed today, end-to-end pace relative to realtime (including
  summarization), the last conversation, and a link out to the backend's own
  dashboard when one is configured on your server.
- **Memory** — the last sync to your memory store, memories produced today,
  and the size of today's transcript day file.

The page is served from a derived status snapshot written by a host cron, not
from a live connection to anything; if the snapshot has not reported recently
the page says so rather than showing stale numbers as current.

## Limits

- **Range matters.** The bridge drains the recorder over Bluetooth, so the
  recorder has to come within range often enough that the buffer never fills.
  With a ~35-hour buffer, being out of range for a day is fine; being out for
  two is not.
- **Speaker tagging needs enrolment.** The backend recognizes speakers you have
  enrolled voice samples for; unenrolled voices still transcribe, they just do
  not get a stable name.
- **The egress is derived text, not audio.** Raw audio stays inside your
  boundary through the entire chain. What crosses it is transcript and summary
  text on the way to your model provider and, if you use one, your memory
  provider.
- **The recorder needs charging and periodic proximity to the bridge.** That is
  an ongoing operational cost, not a one-time setup step.