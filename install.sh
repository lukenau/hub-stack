#!/usr/bin/env bash
# hub-stack one-command bootstrap.
#
#   ./install.sh              check prerequisites, configure, build, start
#   ./install.sh --start      start an existing install
#   ./install.sh --stop       stop the server (keeps data)
#   ./install.sh --restart    stop + start
#   ./install.sh --update     git pull, rebuild, restart
#   ./install.sh --logs       follow server logs
#   ./install.sh --status     show container state + health
#   ./install.sh --url        print the URL to point the app at
#   ./install.sh --token      print the API token (for the app's first setup)
#   ./install.sh --uninstall  stop and DELETE all data (asks first)
#   ./install.sh --help       this text
#
# Everything runs locally. The server binds to loopback by default; nothing is
# exposed to the internet unless you deliberately put a proxy or private mesh in
# front of it (see docs/CONNECT-APP.md).
set -euo pipefail
cd "$(dirname "$0")"

BOLD=$'\033[1m'; DIM=$'\033[2m'; CYAN=$'\033[1;36m'; GREEN=$'\033[1;32m'
RED=$'\033[1;31m'; YELLOW=$'\033[1;33m'; RESET=$'\033[0m'
say()  { printf '%s\n' "${CYAN}$*${RESET}"; }
ok()   { printf '%s\n' "${GREEN}✔ $*${RESET}"; }
warn() { printf '%s\n' "${YELLOW}! $*${RESET}" >&2; }
die()  { printf '%s\n' "${RED}✘ $*${RESET}" >&2; exit 1; }

usage() { sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0; }

PORT="${HUB_PORT:-8090}"

need_docker() {
  command -v docker >/dev/null 2>&1 \
    || die "Docker not found. Install it: https://docs.docker.com/engine/install/"
  docker compose version >/dev/null 2>&1 \
    || die "Docker Compose v2 not found (need the 'docker compose' plugin, not 'docker-compose')."
  docker info >/dev/null 2>&1 \
    || die "Cannot reach the Docker daemon. Start it (e.g. 'sudo systemctl start docker') or add your user to the 'docker' group."
}

port_busy() {
  # Best-effort: lsof, else ss, else /dev/tcp probe. Never fails the install on
  # a missing tool — just reports "unknown".
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1
  elif command -v ss >/dev/null 2>&1; then
    ss -ltn 2>/dev/null | grep -q ":$PORT "
  else
    (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null
  fi
}

print_url() {
  local ip=""
  ip=$(hostname -I 2>/dev/null | awk '{print $1}') || true
  [ -n "$ip" ] || ip=$(ipconfig getifaddr en0 2>/dev/null) || true
  printf '%s\n' "http://${ip:-THIS-MACHINE}:${PORT}"
}

token_value() { sed -n 's/^HUB_API_TOKEN=//p' .env 2>/dev/null | head -1; }

wait_healthy() {
  say "Waiting for the server to become healthy…"
  local i
  for i in $(seq 1 45); do
    if curl -fsS "http://127.0.0.1:${PORT}/api/healthz" >/dev/null 2>&1; then
      ok "hub-api is up  →  http://127.0.0.1:${PORT}"
      return 0
    fi
    sleep 2
  done
  warn "Server did not report healthy in 90s. Recent logs:"
  docker compose logs --tail=40 || true
  die "Startup failed. Full logs: ./install.sh --logs"
}

write_env() {
  if [ -f .env ]; then ok "Using existing .env"; return 0; fi
  [ -f .env.example ] || die ".env.example is missing — is this a complete clone?"
  cp .env.example .env

  local token
  if command -v openssl >/dev/null 2>&1; then
    token=$(openssl rand -hex 32)
  else
    token=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
  fi

  # Portable in-place edit (GNU sed vs BSD/macOS sed).
  local sed_inplace=(-i)
  sed --version >/dev/null 2>&1 || sed_inplace=(-i '')

  sed "${sed_inplace[@]}" "s|^HUB_API_TOKEN=.*|HUB_API_TOKEN=${token}|" .env
  # Seed a sensible timezone so schedules/calendar read correctly.
  local tz; tz=$(cat /etc/timezone 2>/dev/null || true)
  [ -n "$tz" ] || tz=$(date +%Z 2>/dev/null || true)
  [ -n "$tz" ] && sed "${sed_inplace[@]}" "s|^HUB_TZ=.*|HUB_TZ=${tz}|" .env || true

  chmod 600 .env
  ok "Created .env with a fresh 256-bit API token (mode 600)"
}

case "${1:-}" in
  -h|--help) usage ;;
  --token)   [ -f .env ] || die "No .env yet — run ./install.sh first."; token_value; exit 0 ;;
  --url)     print_url; exit 0 ;;
  --stop)    need_docker; docker compose down; ok "hub-api stopped (your data is untouched)"; exit 0 ;;
  --logs)    need_docker; exec docker compose logs -f --tail=100 ;;
  --status)  need_docker; docker compose ps; exit 0 ;;
  --restart) need_docker; docker compose restart; ok "hub-api restarted"; exit 0 ;;
  --uninstall)
    need_docker
    warn "This deletes the server AND all data under ${HUB_DATA_DIR:-./data}."
    printf 'Type "delete" to confirm: '
    read -r reply
    [ "$reply" = "delete" ] || die "Cancelled — nothing was deleted."
    docker compose down -v || true
    rm -rf "${HUB_DATA_DIR:-./data}"
    ok "Uninstalled. .env was kept (delete it yourself if you want a clean slate)."
    exit 0 ;;
  --update)
    need_docker
    say "Pulling the latest source…"
    git pull --ff-only || warn "git pull failed (dirty tree or no upstream) — continuing with local source."
    docker compose up -d --build
    wait_healthy
    ok "Updated and restarted"
    exit 0 ;;
  ""|--start) ;;
  *) die "Unknown option: $1 (try --help)" ;;
esac

# ---- install ---------------------------------------------------------------
say "hub-stack installer"
echo "${DIM}A private AI hub you run yourself. Nothing here phones home.${RESET}"
echo

say "1/4  Checking prerequisites"
need_docker
command -v curl >/dev/null 2>&1 || warn "curl not found — health checks will be skipped."
ok "Docker + Compose v2 ready"

say "2/4  Configuring"
if [ -f .env ] && [ -n "$(token_value)" ]; then
  ok "Existing .env with a token found"
else
  write_env
fi

say "3/4  Building the server (first run takes a minute)"
if port_busy; then
  warn "Port ${PORT} already has a listener — if this is not a previous hub-stack, the build will fail to bind. Set HUB_PORT to change it."
fi
docker compose up -d --build

say "4/4  Health check"
wait_healthy

cat <<EOF

$(ok "Done.")

  Point the app at:   http://127.0.0.1:${PORT}   (this machine)
                      $(print_url)   (from another device on your network)

  API token:          in .env as HUB_API_TOKEN   (./install.sh --token to print it)
                      The app asks for it once, on first setup.

  Next:               docs/CONNECT-APP.md — put TLS or a private mesh in front
                      before exposing this to any other device.

  Privacy:            the server is bound to loopback by default; it makes no
                      outbound calls and has no telemetry. Your data stays in
                      ${HUB_DATA_DIR:-./data} on this machine.
EOF
