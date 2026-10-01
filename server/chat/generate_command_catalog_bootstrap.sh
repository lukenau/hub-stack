#!/usr/bin/env bash
# generate_command_catalog_bootstrap.sh — regenerate command_catalog_bootstrap.json
# from the LIVE example-gateway registries (VERDICT-V2 §4.6.2, task brief "Two things"
# #2). Read-only against the container: pipes generate_command_catalog_bootstrap.py
# in over stdin as `docker exec -u 1001:1001 example-gateway python3 -`, never writes,
# restarts, recreates or composes anything in the container. Not wired to cron and not
# run by hub-api — this is a by-hand tool for whoever refreshes the seed later.
#
# This is a bootstrap SEED, not the drift-prone static catalog v1 rejected (VERDICT-V2
# §4.6.2/§4.6.7): the real catalog is meant to come from the gateway's own live push to
# POST /api/platform/hub/commands (chat/platform.py) once that plugin-side push exists.
# The first successful live push permanently supersedes this file for every reader —
# see chat/routes.py's GET /api/chat/commands, which only ever falls back to this file
# when nothing has been pushed yet.
#
# Usage: bash generate_command_catalog_bootstrap.sh   (from anywhere; paths below are
# relative to this script's own location, not $PWD)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENUMERATOR="$SCRIPT_DIR/generate_command_catalog_bootstrap.py"
OUT="$SCRIPT_DIR/command_catalog_bootstrap.json"
CONTAINER=example-gateway

command -v docker >/dev/null || { echo "docker not found" >&2; exit 1; }
docker ps --format '{{.Names}}' | grep -qx "$CONTAINER" || {
  echo "container '$CONTAINER' is not running" >&2
  exit 1
}

GATEWAY_VERSION=$(docker exec -u 1001:1001 "$CONTAINER" python3 -c \
  'from hermes_cli import __version__; print(__version__)' 2>/dev/null || echo unknown)

ENTRIES_TMP="$(mktemp)"
trap 'rm -f "$ENTRIES_TMP"' EXIT

docker exec -i -u 1001:1001 "$CONTAINER" python3 - < "$ENUMERATOR" > "$ENTRIES_TMP" 2>/tmp/gen-command-catalog-bootstrap.stderr \
  || { echo "enumerator failed inside $CONTAINER — see /tmp/gen-command-catalog-bootstrap.stderr" >&2; exit 1; }

python3 - "$OUT" "$GATEWAY_VERSION" "$ENTRIES_TMP" <<'PY'
import datetime
import json
import sys

out_path, gateway_version, entries_path = sys.argv[1], sys.argv[2], sys.argv[3]
with open(entries_path) as f:
    entries = json.load(f)

for e in entries:
    if not e.get("name") or not e.get("category") or not e.get("busy_policy"):
        raise SystemExit(f"malformed entry, refusing to write: {e!r}")

payload = {
    "_bootstrap_notice": (
        "GENERATED day-one seed for GET /api/chat/commands (VERDICT-V2 SS4.6.2) - "
        "produced by generate_command_catalog_bootstrap.sh reading the live gateway "
        "registries, never hand-authored. Superseded permanently by the first live "
        "POST /api/platform/hub/commands push (chat/platform.py) - see that route's "
        "docstring and chat/routes.py's GET handler for the fallback rule. Do not "
        "hand-edit; regenerate with this same script."
    ),
    "_generated_at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "_source_gateway_version": f"hermes-agent v{gateway_version}",
    "version": 0,
    "commands": entries,
}

tmp = out_path + ".tmp"
with open(tmp, "w") as f:
    json.dump(payload, f, indent=2)
    f.write("\n")
import os

os.replace(tmp, out_path)
print(f"wrote {len(entries)} entries to {out_path} (gateway v{gateway_version})")
PY
