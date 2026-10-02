#!/usr/bin/env bash
# hub-stack-gate.sh — publish gate for the public export.
# Scans a repo directory for work content, personal identifiers and secrets.
# Exit 0 = clean (safe to publish). Exit 1 = blockers found.
# Usage: hub-stack-gate.sh [repo_dir]
set -uo pipefail
REPO="${1:-workspace/hub-stack}"
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
scan    "work: employer/employer"   'employer|analytics-repo|dbt-repo|vendor-a|vendor-b'
scan    "work: Jira ids"            '\b(AN|RR|CNAI)-[0-9]{3,6}\b'
scan    "work: colleague emails"    '[A-Za-z0-9._%+-]+@employer\.com'
scan    "work: internal hostnames"  'example-host|example-mac|lukenau-'
scan    "host: tailnet/ts.net"      '100\.(64|81)\.[0-9]|\.[a-z0-9]+\.ts\.net'

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
# Host filesystem layout of the author's private deployment.
scan    "host: private estate paths" '/opt/(agent-data|murmur|hermes)/'
# .env files must never ship with real values
scan_env() {
  local out; out=$(find . -name '.env' -not -path './.git/*' -not -path './node_modules/*' 2>/dev/null | sed 's/^/        /')
  _report "secrets: committed .env file" "$out"
}
scan_env

echo
if [ "$fails" -eq 0 ]; then echo "GATE: PASS — safe to publish"; exit 0
else echo "GATE: BLOCKED — $fails categor(y|ies) with hits"; exit 1; fi
