#!/usr/bin/env bash
# hub-stack-gate.sh — publish gate for the public export.
# Scans a repo directory for work content, personal identifiers and secrets.
# Exit 0 = clean (safe to publish). Exit 1 = blockers found.
# Usage: hub-stack-gate.sh [repo_dir]
#        hub-stack-gate.sh --self-test
set -uo pipefail

# --- guarded markers, assembled at runtime -----------------------------------
# The work/vendor markers this gate must catch are work content themselves: a
# public hygiene tool that prints the names it guards leaks exactly what it
# protects. Each marker is therefore assembled from fragments at runtime and is
# never spelled whole in this file — or in its history, which is public too.
# Never write a marker whole below; split it across a seam. The rules still
# receive the real string, so they fire exactly as before.
_frag() { local out="" p; for p in "$@"; do out="$out$p"; done; printf '%s' "$out"; }
_EMP=$(_frag carg urus)                  # the maintainer's employer
_W1=$(_frag product _data _analytics)    # employer work repo
_W2=$(_frag dbt - central)               # employer work repo
_W3=$(_frag magn ite)                    # employer brand
_W4=$(_frag snow plow)                   # employer brand
_J1=$(_frag A N)                         # work Jira project keys
_J2=$(_frag R R)
_J3=$(_frag CN AI)

_SELF=$(cd "$(dirname "$0")" && pwd)/$(basename "$0")

# --- self-test ---------------------------------------------------------------
# Plants one probe per rule in a throwaway tree and asserts the gate fires on
# every one: a rule that never fires is dead weight that silently stops
# protecting the export. Every probe is built from the same runtime fragments,
# so the self-test plants no marker literal either.
# Usage: hub-stack-gate.sh --self-test
if [ "${1:-}" = "--self-test" ]; then
  _probe=$(mktemp -d) && _clean=$(mktemp -d) || exit 1
  trap 'rm -rf "$_probe" "$_clean"' EXIT
  {
    printf '%s\n'    "$_EMP"
    printf '%s-1234\n' "$_J1"
    printf 'nope@%s.com\n' "$_EMP"
    printf 'agent-cloud\n'
    printf '100.81.32.15\n'
    printf '(617) 555-1234\n'
    printf '123 Main Street\n'
    printf 'someone@gmail.com\n'
    printf 'sk-ant-%s\n' 'aaaaaaaaaaaaaaaaaaaa'
    printf '%s\n' '-----BEGIN RSA PRIVATE KEY-----'
    printf 'AIza%s\n' 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    printf '"ascAppId": "123456789"\n'
    printf '/opt/agent-data/\n'
    printf 'x code-ai/hub-server/\n'
  } > "$_probe/probe.txt"
  printf 'REPLACE=1\n' > "$_probe/.env"
  printf 'clean tree, nothing to report\n' > "$_clean/ok.txt"
  _labels=(
    "work: employer/org markers" "work: Jira ids" "work: colleague emails"
    "work: internal hostnames" "host: tailnet/ts.net" "pii: phone number"
    "pii: street address" "pii: personal email" "secrets: tokens/keys"
    "secrets: PEM private key" "secrets: slack/google"
    "ident: ASC/EAS account ids" "host: private estate paths"
    "host: private repo/layout refs" "secrets: committed .env file"
  )
  _out=$(bash "$_SELF" "$_probe" 2>&1); _rc=$?; _bad=0
  [ "$_rc" -eq 1 ] || { echo "self-test: dirty tree did not block (exit $_rc)"; _bad=1; }
  for _l in "${_labels[@]}"; do
    if ! printf '%s\n' "$_out" | grep -qF "FAIL  [$_l]"; then
      echo "self-test: rule did not fire: $_l"; _bad=1
    fi
  done
  bash "$_SELF" "$_clean" >/dev/null 2>&1 || { echo "self-test: clean tree was blocked"; _bad=1; }
  if [ "$_bad" -eq 0 ]; then echo "GATE SELF-TEST: PASS (${#_labels[@]} rules fire)"; exit 0
  else echo "GATE SELF-TEST: FAIL"; exit 1; fi
fi

REPO="${1:-.}"
cd "$REPO" || { echo "no such dir: $REPO"; exit 1; }

EXCLUDES=(--exclude-dir=.git --exclude-dir=node_modules --exclude-dir=dist
          --exclude-dir=.venv --exclude-dir=.pytest_cache --exclude-dir=__pycache__
          --exclude-dir=.build --exclude-dir=.expo
          --exclude=hub-stack-gate.sh)   # the guard quotes these patterns itself
fails=0

_report() { # label, hits
  local label="$1" out="$2"
  if [ -n "$out" ]; then
    local n; n=$(printf '%s\n' "$out" | wc -l | tr -d ' ')
    echo "FAIL  [$label] $n hit(s):"
    printf '%s\n' "$out" | head -5 | cut -c1-160 | sed 's/^/        /'
    fails=$((fails+1))
  else
    echo "ok    [$label]"
  fi
}

# Case-INsensitive scan (prose-style terms: names, orgs, hosts).
scan() { # label, pattern
  local out; out=$(grep -rIniE "$2" "${EXCLUDES[@]}" . 2>/dev/null | grep -v 'grep -rIn')
  _report "$1" "$out"
}

# Case-SENSITIVE scan. Secrets/tokens are case-significant: running these with
# -i widens classes like [0-9A-Z] to all alphanumerics and matches random
# base64 (the vendored font/xterm bundle), which is a false positive.
scan_cs() { # label, pattern
  local out; out=$(grep -rInE "$2" "${EXCLUDES[@]}" . 2>/dev/null)
  _report "$1" "$out"
}

echo "== hub-stack publish gate =="
scan    "work: employer/org markers" "${_EMP}|${_W1}|${_W2}|${_W3}|${_W4}"
scan    "work: Jira ids"            "\\b(${_J1}|${_J2}|${_J3})-[0-9]{3,6}\\b"
scan    "work: colleague emails"    "[A-Za-z0-9._%+-]+@${_EMP}\\.com"
# The author's real deployment hostnames, not the placeholders the public
# export substitutes into their place: `agent-cloud` (the VPS) becomes
# `example-host`, `lukes-macbook-pro` becomes `example-mac`. Matching the
# placeholders was backwards — it made the gate fail on its own clean tree
# (services/murmur-bridge/config.example.toml, .../test_bridge_status.py).
scan    "work: internal hostnames"  'agent-cloud|lukes-macbook|lukenau-|hermes-gateway|tail7fbd48'
scan    "host: tailnet/ts.net"      '100\.(64|71|81)\.[0-9]|\.[a-z0-9]+\.ts\.net'

# The author's name is INTENTIONAL branding here (LICENSE, README, package
# metadata, docs) — Luke Nau is the owner and publisher, so the name is allowed.
# What must never ship is personal CONTACT information.
scan    "pii: phone number"   '\b(\+1[ .-]?)?\(?[2-9][0-9]{2}\)?[ .-][0-9]{3}[ .-][0-9]{4}\b'
scan    "pii: street address" '\b[0-9]{1,5} [A-Z][A-Za-z]+ (Street|Avenue|Ave|Road|Drive|Lane|Boulevard|Blvd)\b'
scan    "pii: personal email" '[A-Za-z0-9._%+-]+@(gmail|icloud|outlook|yahoo|hotmail|proton|protonmail)\.[A-Za-z]{2,}'

# Secrets are case-sensitive; the CI hygiene guard quotes these patterns, and a
# PEM header must start its own line (otherwise random base64 matches).
scan_cs "secrets: tokens/keys"      'sk-ant-[A-Za-z0-9_-]{20}|sk-proj-[A-Za-z0-9_-]{20}|ghp_[A-Za-z0-9]{30}|github_pat_[A-Za-z0-9_]{20}|AKIA[0-9A-Z]{16}|xox[bap]-[A-Za-z0-9-]{10}'
scan_cs "secrets: PEM private key"  '^-----BEGIN [A-Z ]*PRIVATE KEY-----$'
scan_cs "secrets: slack/google"     'xapp-[0-9A-Za-z-]{10}|AIza[0-9A-Za-z_-]{35}'
# App Store Connect / EAS identifiers must be placeholders, never real.
# projectId is excluded on purpose: an EAS project id ships inside the built
# app bundle (expo-constants exposes it), so it is public by construction and
# app.json needs the real one for any build to work. Submission credentials
# (ascAppId, key id, issuer id) stay covered.
scan_cs "ident: ASC/EAS account ids" '"(ascAppId|ascApiKeyId|ascApiKeyIssuerId)": *"[0-9a-zA-Z][0-9a-zA-Z-]{5,}"'
# Host filesystem layout of the author's private deployment, scrubbed from the
# public export: the estate root as seen on the host and inside the gateway
# container, plus the service dirs beneath it. Those strings leaked into the
# tree before the scrubber ran — match any of them.
scan    "host: private estate paths" '/opt/(agent-data|data|murmur|hermes)/'
# ...and the same estate named from other roots. The `/opt/...` rule above only
# catches paths written from the host/container root, so a reference that used a
# different mount or a bare repo name slipped through. Two spellings are covered:
#   * the author's private monorepo, `code-ai` (container mount `/data/code-ai`,
#     Mac checkout `~/code/ai`) — both hyphen and underscore ids, and the
#     `code/ai` dir form;
#   * `hub-server/` — the private monorepo's server directory, named in comments
#     as though it lived under this tree.
# Only the PATH-SHAPED `hub-server/` is matched on purpose. Bare `hub-server` is
# NOT flagged: a bare name cannot be told apart from a component name, and while
# no component here is called that (this product's server is `hub-api` — see
# docker-compose.yml), the trailing slash is what makes a string a layout path.
# A bare `/data/...` path is likewise NOT flagged: `/data` is this product's own
# container mount root (docker-compose.yml `${HUB_DATA_DIR:-./data}:/data`), so
# `/data/hub/...`, `/data/sites` and `/data/finance` are the product's layout,
# not the author's — only `/data/code-ai` and `/data/code/ai`, reached through
# the `code-ai`/`code/ai` alternatives, are private.
scan    "host: private repo/layout refs" '(^|[^A-Za-z0-9_-])(code-ai|code_ai|code/ai)|(^|[^A-Za-z0-9_-])hub-server/'
# .env files must never ship with real values
scan_env() {
  local out; out=$(find . -name '.env' -not -path './.git/*' -not -path './node_modules/*' 2>/dev/null | sed 's/^/        /')
  _report "secrets: committed .env file" "$out"
}
scan_env

echo
if [ "$fails" -eq 0 ]; then echo "GATE: PASS — safe to publish"; exit 0
else echo "GATE: BLOCKED — $fails categor(y|ies) with hits"; exit 1; fi
