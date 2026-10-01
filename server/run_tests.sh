#!/usr/bin/env bash
# Run the hub-api test suite the way it is designed to run.
#
# The chat tests set their environment at module scope and then import `app`,
# so each file must run in its OWN process (see requirements-dev.txt). Running
# them under a single `pytest` invocation lets an earlier module's env win.
set -euo pipefail
cd "$(dirname "$0")"

fail=0
for f in test_*.py; do
  printf '\n== %s\n' "$f"
  if ! python3 -m pytest "$f" -q; then
    fail=1
  fi
done
exit "$fail"
