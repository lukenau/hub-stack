# Murmur: always-on voice capture, without giving up the audio

Murmur is hub-stack's optional always-on memory pipeline. A small wearable
audio recorder buffers what it hears onto its own flash storage, a daemon on
your network drains it, and a transcription backend you run turns it into
speaker-tagged transcripts and a memory index your assistant can search.

The reason it exists is custody, not convenience. Consumer capture devices
ship your audio to their vendor's cloud and keep it under their terms. Here
the recording leaves hardware you own and lands on a machine you run, and
that is the whole path. The only things that leave your boundary afterwards
are derived text: model calls for summarization and, if you use a hosted
memory provider, the memories built from them.

**This is optional, and it is not the default experience.** Most self-hosters
have no wearable and will not get one, and nothing in the hub depends on it.
Without a configured capture bridge the Murmur page simply does not appear
and the rest of the hub works exactly as before. Every other integration is
independent of it.

## The pipeline, end to end

1. **Capture.** A wearable BLE audio recorder records continuously to its
   on-board flash buffer (Opus, 16 kHz mono, roughly 35 hours of VAD-gated speech).
   The author runs a BLE pendant; any recorder of that class works at this
   boundary, the pipeline does not care which one.
2. **Bridge daemon.** A small service on an always-on machine in your house
   bonds to the recorder over Bluetooth, drains the flash buffer when the
   device is in range, and ships the audio to the transcription backend over
   your private network. It queues while you are out and only deletes a flash
   page once the backend has acknowledged receipt of its audio — the 35-hour
   buffer is the gap-safety, not a data-loss risk.
3. **Transcription backend.** A self-hosted service (the author runs
   [Chronicle](https://github.com/SimpleOpenSoftware/chronicle), MIT) receives
   the audio, transcribes it, diarizes it, and recognizes enrolled speakers,
   producing conversations.
4. **Extraction.** A model pass over each conversation pulls out memories and
   summaries. This is the one step that calls a model provider.
5. **Canonical store.** Speaker-tagged transcript day files on your disk
   (the primary record — every index above it is rebuildable), a rotating
   audio store, and a memory index the agent reads from.

## What you have to run

- **The recorder** — any BLE wearable that records to on-board flash. The
  author uses a BLE pendant.
- **The bridge daemon** — the piece that drains the recorder and ships audio
  onward. It is in this repo at
  [`services/murmur-bridge/`](../services/murmur-bridge/) (see its README).
- **A transcription backend** — self-hosted, plus a model key for the
  extraction step if you want memory extraction.
- **Hub configuration** — the environment variables in
  [SERVICES.md](SERVICES.md#murmur-voice-capture-bridge). The hub itself has
  no network path to the bridge; integration is by status file, command file,
  and a bearer token.

## What the hub shows

The Murmur page is one capture-chain strip — **Pendant → Bridge → Pipeline →
Memory** — with a status dot per stage and one fact line each, so a broken
link in the chain reads as the one dim stage among three healthy ones. Below
the strip, four read-only cards:

- **Pendant** — recording state (recording, paused, disconnected, never
  bonded), how much of the flash buffer is unsynced (an estimate, scaled off
  the documented ~35-hour capacity), and three gated actions: drain now,
  pause capture, resume capture. They go through the same challenge, sign,
  apply write gate as every other write in the hub.
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

## Honest limits

- **Range matters.** The bridge drains the recorder over Bluetooth, so the
  recorder has to come within range often enough that the buffer never
  fills. With a ~35-hour buffer, being out of range for a day is fine; being
  out for two is not.
- **Speaker tagging needs enrollment.** The backend recognizes speakers you
  have enrolled voice samples for; unenrolled voices still transcribe, they
  just do not get a stable name.
- **The egress is derived text, not audio.** Raw audio stays inside your
  boundary through the entire chain. What crosses it is transcript and
  summary text on the way to your model provider and, if you use one, your
  memory provider. Choose those providers accordingly.
- **It is hardware you have to keep charged and in range.** That is a real
  ongoing cost, and it is the main reason this stays an optional capability
  rather than a default one.
