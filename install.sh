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
#   ./install.sh --pair       mint a one-time device enrolment code (local)
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

usage() { awk 'NR==1{next} /^#/{sub(/^# ?/,""); print; next} {exit}' "$0"; exit 0; }

# Portable in-place edit (GNU sed vs BSD/macOS sed). Used for .env edits only.
sed_inplace=(-i)
sed --version >/dev/null 2>&1 || sed_inplace=(-i '')

# Read one KEY= value from .env (no shell sourcing: values are untrusted text).
read_env_value() {
  [ -f .env ] || return 0
  sed -n "s/^$1=//p" .env | tail -n1
}

# Set KEY=value in .env, replacing an existing line or appending one.
set_env() {
  local key="$1" val="$2"
  [ -f .env ] || return 0
  if grep -qE "^${key}=" .env; then
    sed "${sed_inplace[@]}" "s|^${key}=.*|${key}=${val}|" .env
  else
    printf '%s=%s\n' "$key" "$val" >>.env
  fi
}

# Host-side port the server is published on. Precedence: shell env > .env > 8090.
# Exporting it keeps docker-compose (which also reads .env, but lets the shell
# win) and this script on the SAME port — the compose publish uses ${HUB_PORT}.
PORT="${HUB_PORT:-}"
[ -n "$PORT" ] || PORT="$(read_env_value HUB_PORT)"
PORT="${PORT:-8090}"
export HUB_PORT="$PORT"

need_docker() {
  command -v docker >/dev/null 2>&1 \
    || die "Docker not found. Install it: https://docs.docker.com/engine/install/"
  docker compose version >/dev/null 2>&1 \
    || die "Docker Compose v2 not found (need the 'docker compose' plugin, not 'docker-compose')."
  docker info >/dev/null 2>&1 \
    || die "Cannot reach the Docker daemon. Start it (e.g. 'sudo systemctl start docker') or add your user to the 'docker' group."
}

port_busy() {
  # Best-effort probe for something already listening on $PORT. bash's /dev/tcp
  # is the portable first choice; external tools are fallbacks only. BusyBox
  # `lsof` (Alpine/NAS) ignores the -iTCP/-sTCP filters and exits 0 on a free
  # port, so it is never trusted.
  if (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null; then
    return 0
  fi
  if command -v ss >/dev/null 2>&1; then
    ss -ltn 2>/dev/null | grep -q "[:.]$PORT "
    return
  fi
  if command -v lsof >/dev/null 2>&1 && ! lsof -v 2>&1 | grep -qi busybox; then
    lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1
    return
  fi
  return 1  # can't tell → assume free, never block the install
}

print_url() {
  local ip=""
  ip=$(hostname -I 2>/dev/null | awk '{print $1}') || true
  [ -n "$ip" ] || ip=$(ipconfig getifaddr en0 2>/dev/null) || true
  printf '%s\n' "http://${ip:-THIS-MACHINE}:${PORT}"
}

probe_health() {
  # 0 = the server answered /api/healthz on the host port.
  if command -v curl >/dev/null 2>&1; then
    curl -fsS "http://127.0.0.1:${PORT}/api/healthz" >/dev/null 2>&1
    return
  fi
  # No curl on the host: ask the container itself. It ships Python and serves
  # this same endpoint for its own compose healthcheck. The in-container port is
  # always 8090 (docker-compose pins HUB_API_PORT); only the host side varies.
  docker compose exec -T hub-api python -c \
    "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8090/api/healthz', timeout=3)" \
    >/dev/null 2>&1
}

wait_healthy() {
  say "Waiting for the server to become healthy…"
  local i
  for i in $(seq 1 45); do
    if probe_health; then
      ok "hub-api is up  →  http://127.0.0.1:${PORT}"
      return 0
    fi
    sleep 2
  done
  warn "Server did not report healthy in 90s. Recent logs:"
  docker compose logs --tail=40 || true
  die "Startup failed. Full logs: ./install.sh --logs"
}

prepare_data_dir() {
  # Create the bind-mount source and make it writable by the container user.
  # Docker would otherwise create a missing ./data as root:root 755, while the
  # container runs non-root — writes fail with EACCES later, after a "Done."
  local data_dir want_uid
  data_dir="${HUB_DATA_DIR:-./data}"
  mkdir -p "$data_dir" || die "Could not create the data directory: $data_dir"

  if [ "$(id -u)" -eq 0 ]; then
    want_uid="${HUB_UID:-1000}"
    chown -R "$want_uid" "$data_dir" \
      || die "Could not give $data_dir to uid ${want_uid} (chown failed)."
  else
    # A normal user cannot hand the dir to another uid, so make the container
    # uid match the directory owner instead. Persist it so later runs agree.
    want_uid="$(id -u)"
    if [ "${HUB_UID:-}" != "$want_uid" ]; then
      set_env HUB_UID "$want_uid"
      export HUB_UID="$want_uid"
    fi
  fi
  ok "Data directory ready: $data_dir (uid ${want_uid})"
}

write_env() {
  if [ -f .env ]; then ok "Using existing .env"; return 0; fi
  [ -f .env.example ] || die ".env.example is missing — is this a complete clone?"
  cp .env.example .env

  # Seed a sensible timezone so schedules/calendar read correctly.
  local tz; tz=$(cat /etc/timezone 2>/dev/null || true)
  [ -n "$tz" ] || tz=$(date +%Z 2>/dev/null || true)
  [ -n "$tz" ] && sed "${sed_inplace[@]}" "s|^HUB_TZ=.*|HUB_TZ=${tz}|" .env || true

  chmod 600 .env
  ok "Created .env (mode 600)"
}

case "${1:-}" in
  -h|--help) usage ;;
  --url)     print_url; exit 0 ;;
  --stop)    need_docker; docker compose down; ok "hub-api stopped (your data is untouched)"; exit 0 ;;
  --logs)    need_docker; exec docker compose logs -f --tail=100 ;;
  --status)  need_docker; docker compose ps; exit 0 ;;
  --restart) need_docker; docker compose restart; ok "hub-api restarted"; exit 0 ;;
  --pair)
    # Mint an enrolment code locally, inside the running server. No browser and
    # no network: the code is generated over a unix socket in the data dir.
    need_docker
    docker compose exec -T hub-api python3 /opt/hub-api/pair_cli.py \
      || die "Could not mint a code. Is the hub running? Start it with ./install.sh"
    exit 0 ;;
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
    prepare_data_dir
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
if ! command -v curl >/dev/null 2>&1; then
  echo "${DIM}  (no curl on this host — using the container's built-in health probe)${RESET}"
fi
ok "Docker + Compose v2 ready"

say "2/4  Configuring"
if [ -f .env ]; then
  ok "Existing .env found"
else
  write_env
fi
# Keep the persisted port in step with what compose will actually publish.
set_env HUB_PORT "$PORT"

say "3/4  Building the server (first run takes a minute)"
prepare_data_dir
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

  Pair the app:       run  ./install.sh --pair  on this machine to mint a
                      one-time 6-character enrolment code, then enter it in the
                      app's Config → Security → Pair this iPhone. No token, no
                      login, nothing sent over the network.
                      See docs/CONNECT-APP.md.

  Next:               docs/CONNECT-APP.md — put TLS or a private mesh in front
                      before exposing this to any other device.

  Privacy:            the server is bound to loopback by default; it makes no
                      outbound calls and has no telemetry. Your data stays in
                      ${HUB_DATA_DIR:-./data} on this machine.
EOF
