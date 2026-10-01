# DEPLOY — iMessage compose/send rearchitecture (Track 2, 2026-08-02)

Same-origin compose flow replacing the dead `:8590` compose server. New in
`app.py`: `POST /api/imessage/draft`, `GET /api/imessage/approve/{id}`,
`POST /api/imessage/send/{id}`, plus a path-scoped CSP relaxation for
`/my-pages/*/imessage/*.html` only. Template/renderer/dequeue-script already
updated on disk (they are host-mounted — no deploy step needed for those).
Backups of every changed file: `/opt/hub-data/backups/2026-08-02/`.

Protocol facts baked into the code (probed live 2026-08-02, imessage MCP v3.4.4):
session handshake REQUIRED (`initialize` → `Mcp-Session-Id` header → `notifications/initialized`
→ `tools/call`; a bare call gets 400 "Missing session ID"); SSE-wrapped JSON responses;
`draft_imessage{to, text}` where `to` = contact name / exact phone / email / group-chat
name (NOT numeric chat_id — the form now posts `contact` for this); `send_draft{draft_id:int}`;
drafts expire ~15 min; `send_draft` returns "pending" until the human approves on the Mac side.

## 1. Deploy hub-api (the only container step)

```bash
cd /home/agent/ai/services/hub-api
docker cp app.py hub-api:/opt/hub-api/app.py && docker restart hub-api
# sanity: container came back
sleep 3 && curl -s http://127.0.0.1:8090/api/healthz || curl -s http://127.0.0.1:8090/healthz
```

Already done host-side (no action needed, listed for the record):
- `/opt/hub-data/hub/secrets/imessage-token` created (0600) from the
  `IMESSAGE_MCP_TOKEN` line of `/opt/hub-data/.env` — hub-api reads it at
  `/data/hub/secrets/imessage-token` via its rw `/opt/hub-data/hub` mount.
- `/opt/hub-data/hub/queue/imessage-drafts/` created (asleep-Mac queue).
- `compose-hmac` secret self-generates on first approval-link mint (0600).

## 2. Env var at next hub-api container RECREATE (not now)

When the hub-api container is next recreated (compose file / run script), add:

```
IMESSAGE_MCP_TOKEN=<value from /opt/hub-data/.env>
```

Until then the secret-file fallback carries it — no restart dependency.
Optional overrides (defaults are correct today): `IMESSAGE_MCP_URL`
(`http://mac.internal.example:8400/mcp`), `HUB_PUBLIC_BASE`
(`https://hub.example.com`), `IMESSAGE_TOKEN_FILE`,
`IMESSAGE_QUEUE_DIR`, `COMPOSE_HMAC_FILE`.

## 3. Dequeue cron (drains the asleep-Mac queue, zero LLM cost)

`/opt/hub-data/scripts/imessage-draft-dequeue.py` is rewritten: queue dir
`/srv/hub-data/hub/queue/imessage-drafts`, full MCP session handshake, token from
env → `/srv/hub-data/hub/secrets/imessage-token` → `/srv/hub-data/.env` (no hardcoded
token). Register it as a no-agent Hermes cron (runs in-container; exact flag
spelling per `hermes cron add --help`):

```bash
docker exec example-gateway hermes cron add \
  --name "imessage-draft-dequeue" \
  --schedule "*/5 * * * *" \
  --no-agent --script /srv/hub-data/scripts/imessage-draft-dequeue.py \
  --deliver local
```

Empty queue → silent exit 0. Mac asleep → leaves files, retries next tick.
Tool-rejected drafts get renamed `*.failed` (no infinite retry).

## 4. Kill + archive the old :8590 compose server

The old `imessage_compose_server.py` process still runs inside example-gateway
(hardcoded bearer token, unreachable port, false "Sent ✓" UX). Kill it and
archive the script:

```bash
docker exec example-gateway pkill -f imessage_compose_server.py || true
docker exec example-gateway sh -c 'pgrep -af imessage_compose_server || echo "gone"'
mkdir -p /opt/hub-data/backups/archive-pre-2026-08
mv /opt/hub-data/scripts/imessage_compose_server.py \
   /opt/hub-data/backups/archive-pre-2026-08/imessage_compose_server.py
```

Also check nothing respawns it (it is not in the host crontab; if a Hermes cron
or supervisor entry references it, remove via `hermes cron edit`).

## 5. Telegram "Approvals" notification (optional, activates later)

After a successful draft, hub-api best-effort POSTs to the Telegram Bot API and
**skips silently** unless BOTH files exist (hub-api deliberately does not get
`TELEGRAM_BOT_TOKEN` in its env). When the user creates the "Hermes Ops" forum
group with the Approvals topic (the user-ask L2), populate:

```bash
umask 177
grep '^TELEGRAM_BOT_TOKEN=' /opt/hub-data/.env | cut -d= -f2 \
  > /opt/hub-data/hub/secrets/telegram-bot-token
cat > /opt/hub-data/hub/secrets/approvals-topic.json <<'EOF'
{"chat_id": -100XXXXXXXXXX, "message_thread_id": NN}
EOF
chmod 600 /opt/hub-data/hub/secrets/telegram-bot-token /opt/hub-data/hub/secrets/approvals-topic.json
```

(`chat_id` = the forum group id; `message_thread_id` = the Approvals topic id.)
No hub-api restart needed — files are read per-request. The notification carries
the draft preview + the HMAC approval link.

## 6. End-to-end verification checklist

Mac AWAKE path (the user-ask L6 window):
1. Open a briefing iMessage sub-page (`/my-pages/briefing-<date>/imessage/<chat>.html`).
   Check response header: CSP must be `sandbox allow-forms allow-same-origin; … form-action 'self'`
   (`curl -sI` it); the briefing index and all other my-pages must still show the
   old locked CSP (`sandbox; … script-src 'none'`).
2. Type a message → Send → expect "Draft created on your Mac" page with a
   draft_id and a "Review & approve" link. Verify the draft notice appears on
   the Mac (Messages self-chat / Telegram).
3. Follow the approve link (GET) — confirm NOTHING sends yet (Telegram prefetch
   safety): page only shows a Send button.
4. POST Send within 15 min. If the Mac-side approval hasn't been given, expect
   the truthful "Pending approval" page; approve on Mac, retry → "Message sent".
5. Confirm the message actually arrived on the recipient phone (ground truth,
   not the page).

Mac ASLEEP path:
6. With the Mac asleep, submit a compose → expect "Queued — your Mac is asleep"
   page and a JSON file in `/opt/hub-data/hub/queue/imessage-drafts/`.
7. Wake the Mac → within 5 min the dequeue cron drafts it (queue file gone,
   draft notice on Mac); approve there as usual.

Failure honesty:
8. Bogus approval token → 403 "Invalid approval link"; empty text → 400; >2000
   chars → 400.
9. Grep `docker logs hub-api` for tracebacks after the test pass.

Orphaned drafts note: the 22 pre-existing drafts (Jul 27–Aug 2) all exceeded the
15-min expiry long ago — nothing to triage server-side; recommend discard-all.
