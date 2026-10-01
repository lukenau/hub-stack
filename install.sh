#!/usr/bin/env bash
# hub-stack one-command bootstrap.
#   ./install.sh            install / start
#   ./install.sh --update   pull + rebuild + restart
#   ./install.sh --stop     stop the server
#   ./install.sh --logs     follow logs
set -euo pipefail
cd "$(dirname "$0")"

say() { printf '\033[1;36m%s\033[0m\n' "$*"; }
ok()  { printf '\033[1;32m✔ %s\033[0m\n' "$*"; }
die() { printf '\033[1;31m✘ %s\033[0m\n' "$*" >&2; exit 1; }

# 1. prerequisites ----------------------------------------------------------
command -v docker >/dev/null 2>&1 || die "Docker not found. Install it first: https://docs.docker.com/engine/install/"
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 not found (need 'docker compose')."
docker info >/dev/null 2>&1 || die "Docker daemon not reachable. Is it running? (try: sudo systemctl start docker)"

case "${1:-}" in
  --stop)  docker compose down; ok "hub-api stopped"; exit 0 ;;
  --logs)  exec docker compose logs -f --tail=100 ;;
  --update) say "Updating…"; git pull --ff-only 2>/dev/null || true
            docker compose up -d --build; ok "Updated and restarted"; exit 0 ;;
  ""|--start) ;;
  *) die "Unknown option: $1 (use --start|--update|--stop|--logs)" ;;
esac

# 2. config -----------------------------------------------------------------
if [ ! -f .env ]; then
  cp .env.example .env
  # generate a random API token (portable: openssl preferred, else /dev/urandom)
  if command -v openssl >/dev/null 2>&1; then
    TOKEN=$(openssl rand -hex 32)
  else
    TOKEN=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
  fi
  # portable in-place edit (GNU + BSD sed)
  if sed --version >/dev/null 2>&1; then
    sed -i "s|^HUB_API_TOKEN=.*|HUB_API_TOKEN=${TOKEN}|" .env
  else
    sed -i '' "s|^HUB_API_TOKEN=.*|HUB_API_TOKEN=${TOKEN}|" .env
  fi
  ok "Created .env with a fresh API token"
else
  ok "Using existing .env"
fi

# 3. build + start ----------------------------------------------------------
say "Building the server (first run takes a minute)…"
docker compose up -d --build

# 4. wait for health --------------------------------------------------------
say "Waiting for the server to become healthy…"
for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${HUB_PORT:-8090}/api/healthz" >/dev/null 2>&1; then
    ok "hub-api is up  →  http://127.0.0.1:${HUB_PORT:-8090}"
    break
  fi
  sleep 2
  [ "$i" = 30 ] && die "Server did not become healthy. Run: ./install.sh --logs"
done

HOST_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
echo
say "Next steps"
echo "  • Point the app at:  http://${HOST_IP:-127.0.0.1}:${HUB_PORT:-8090}"
echo "  • Lock it down (TLS / private mesh) and pair the app: docs/CONNECT-APP.md"
echo "  • Token lives in .env (HUB_API_TOKEN) — the app asks for it once."
