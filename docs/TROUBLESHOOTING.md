# Troubleshooting

Quick diagnosis path: check the installer output → check `docker compose ps`
→ check logs (`./install.sh --logs`) → match a symptom below.

![Troubleshooting](assets/img/troubleshooting.svg)

---

## Installer fails at the prerequisite checks

| Message | Fix |
|---|---|
| `Docker not found` | Install Docker Engine: <https://docs.docker.com/engine/install/> (Mac: install and launch Docker Desktop). |
| `Docker Compose v2 not found (need 'docker compose')` | Old `docker-compose` (v1) is installed but not the v2 plugin. Install the `docker-compose-plugin` package, or upgrade Docker. Verify with `docker compose version`. |
| `Docker daemon not reachable` | The daemon isn't running: `sudo systemctl start docker` (Linux) or launch Docker Desktop (Mac). On a NAS, enable the Docker service. |

## `Server did not become healthy`

The build succeeded but the container never answered `/api/healthz` within
60 s.

1. Look at the logs: `./install.sh --logs`
2. `docker compose ps` — is the container `Up (healthy)`, restarting, or exited?
3. Common causes:
   - **Port 8090 already in use** by another service:

     ```bash
     sudo ss -ltnp | grep 8090     # Linux
     lsof -i :8090                 # macOS
     ```

     Stop the other service, or change the **left-hand** `8090` in the
     `ports:` line of `docker-compose.yml` (e.g. `8091:8090`) — then also
     update `HUB_PUBLIC_BASE`.
   - **`.env` is missing `HUB_API_TOKEN`** or it's blank — the server
     refuses to start. Re-run `./install.sh` (it only creates `.env` if
     absent, so either fill the token in or delete `.env` to regenerate).
   - **First build was slow** — on a small VPS the image build can take a
     few minutes; the 60 s health wait may time out even though the
     container comes up right after. Re-run `./install.sh --logs` or
     `curl http://127.0.0.1:8090/api/healthz` a minute later.

## Permission problems on the data directory

The container runs as a non-root user (uid from the `HUB_UID` build arg,
default `1000`). If `docker compose logs` shows `EACCES` / `Permission
denied` writes under `/data`, the host data dir is owned by a different uid:

```bash
sudo chown -R 1000:1000 ./data
```

Or set `HUB_UID` in `.env` to the owner's uid and rebuild:
`docker compose up -d --build`.

## The app can't connect

Work through in order:

1. **Is the server actually reachable from that device?**

   ```bash
   curl -fsS http://<server-url>/api/healthz
   ```

   - Works from the server itself but not from your phone → the hub is
     loopback-only (the default). You need Tailscale, a reverse proxy, or
     `HUB_BIND=0.0.0.0` — see [CONNECT-APP.md](CONNECT-APP.md). Do **not**
     just bind `0.0.0.0` on an internet-facing machine.
   - Fails everywhere → the container is down; see above.

2. **401 / unauthorized responses** — the token in the app doesn't match
   `HUB_API_TOKEN` in `.env`. If you rotated the token, update every paired
   app.

3. **CORS / origin errors in the web app** — the origin the app runs from
   isn't in `HUB_ORIGIN`. Add it (comma-separated list) and
   `docker compose up -d`.

4. **URL mistakes** — the server URL must include the scheme and port:
   `https://hub.example.com`, not `hub.example.com`; `http://192.168.1.50:8090`,
   not just the IP.

## Server unreachable after a reboot

- `docker compose ps` — the container should auto-start
  (`restart: unless-stopped`) once the Docker daemon is up. If it shows
  `Exited`, start it: `docker compose up -d`.
- Mac: Docker Desktop must launch at login, and the Mac must not sleep
  (see [INSTALL-MAC.md](INSTALL-MAC.md)).

## Lost / resetting everything

- **Logs**: `./install.sh --logs` (or `docker compose logs -f hub-api`).
- **Restart fresh without losing data**: `./install.sh --stop && ./install.sh`.
- **Full reset (deletes your data and token)**:

  ```bash
  ./install.sh --stop
  sudo rm -rf data .env
  ./install.sh
  ```

## Still stuck

Open a [GitHub issue](https://github.com/<your-username>/hub-stack/issues)
with: the exact command, the full installer output, `docker compose ps`, and
the last ~50 lines of `./install.sh --logs`. Redact the API token.
