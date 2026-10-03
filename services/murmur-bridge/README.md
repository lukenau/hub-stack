# Murmur pendant bridge

A BLE bridge for a wearable audio pendant: it connects to the device over
Bluetooth, streams the audio it records off its flash storage, and uploads it
to a transcription backend (Chronicle) which turns it into speaker-tagged
transcripts. A small companion script then mirrors those transcripts into a
memory store and a canonical day-file directory.

The pendant records continuously into a ~35-hour flash buffer; the bridge drains
that buffer before it overwrites (deleting a flash page only once the backend
has acknowledged its audio), and resumes from the last acknowledged page after a
restart.

## Layout

- `murmur/bridge/` — the daemon. BLE framing, Opus frame extraction, drain
  state machine, Chronicle upload client, and the status-push / command-pull
  sync with the hub server (rsync, optional).
- `murmur/bridge/proto/` and `murmur/bridge/gen/` — the pendant's protobuf
  schemas, vendored, and the Python bindings generated from them. See
  [THIRD-PARTY-NOTICES.md](../../THIRD-PARTY-NOTICES.md) for the upstream
  sources this code vendors and ports from.
- `murmur/etl/murmur_to_supermemory.py` — deterministic Chronicle → Supermemory
  mirror: republishes edited conversations, deletes dropped ones, and appends
  the canonical per-day transcript file.
- `murmur/tests/` — the test suite (pytest, plus `responses` for HTTP mocks).
- `config.example.toml` — annotated example configuration.
- `murmur-bridge.service` — systemd unit template.
- `requirements.txt` — runtime dependencies (install in a venv).

## Hardware requirement

You need the pendant the protocol targets: a BLE audio recorder whose wire
protocol matches the vendored schemas (identified over the air by its GATT
characteristics). The bridge runs on any Linux box with Bluetooth — a
Raspberry Pi on the same network as the hub server is the typical host, since
the pendant needs to stay in BLE range.

## Configuration

Copy `config.example.toml` and fill in:

- `mac` — the pendant's Bluetooth MAC address.
- `base_url` / `api_key` — your Chronicle instance's URL and a `chrn_` API key
  minted with `POST /api/api-keys` (never a JWT login token — see the comments
  in the example file for why).
- `store_dir` — local staging directory for drained WAV files.
- `status_remote` / `commands_remote` — optional rsync remotes for status push
  and remote command pull. Omit both to run drain-only. If you use them,
  authorize the bridge host under a dedicated, sudo-less unix user with a
  forced `rrsync` command — the example file explains the risk.

Defaults read from `/etc/murmur/config.toml`; the ETL and companion scripts
take their paths and secrets from environment variables (see their
docstrings).

## Running

As a service:

```bash
sudo cp murmur-bridge.service /etc/systemd/system/
sudo systemctl edit --force --full murmur-bridge   # adjust install paths
sudo systemctl enable --now murmur-bridge
```

Run the tests from this directory:

```bash
python -m venv .venv && .venv/bin/pip install -r requirements.txt pytest responses
PYTHONPATH=. .venv/bin/python -m pytest murmur/tests
```

## Provenance

The protobuf schemas in `murmur/bridge/proto/` are vendored from an MIT
upstream, and the flash-page drain semantics are ported from another MIT
project; exact sources, licences and what was taken from each are recorded in
[THIRD-PARTY-NOTICES.md](../../THIRD-PARTY-NOTICES.md).
