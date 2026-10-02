# Contributing

Thanks for helping improve hub-stack. Keep changes small, testable, and
consistent with the existing style: the docs and code aim to be practical
and terse — no marketing voice.

## Project layout

```
hub-stack/
├── install.sh              one-command bootstrap (bash, POSIX-friendly)
├── docker-compose.yml      the server service definition
├── .env.example            every setting, documented — keep in sync with code
├── server/                 hub-api (FastAPI, Python 3.12)
├── app/                    Hub client (Expo / React Native, TypeScript)
├── docs/                   user-facing documentation
└── assets/img/             diagrams and screenshots used by docs
```

## Development setup

**Server** (Docker path — what the installer uses):

```bash
git clone https://github.com/<your-username>/hub-stack.git
cd hub-stack
./install.sh
curl -fsS http://127.0.0.1:8090/api/healthz
```

Iterate with rebuilds:

```bash
docker compose up -d --build   # rebuild + restart after server/ changes
docker compose logs -f hub-api # watch logs
```

**App** (needs Node 20+; iOS builds need macOS + Xcode):

```bash
cd app
npm install
npm run web        # or ios / android
npm run typecheck  # tsc --noEmit
npm test
```

Native modules must be installed with `npx expo install <pkg>` so SDK pins
resolve correctly.

## Ground rules

- **`.env` and `data/` never get committed.** They are gitignored; keep it
  that way. Never paste tokens, logs, or IPs containing real credentials
  into issues or PRs — redact first.
- **`.env.example` is the source of truth for configuration.** If you add
  or rename an env var, update `.env.example` and any doc that references
  it in the same PR.
- **Server changes must keep the security posture**: loopback-by-default
  publishing, the Face ID device-key write gate, the explicit POST allowlist, and the
  single-worker constraint (the WebAuthn challenge cache is in-process).
  A PR that weakens any of these needs a very good reason.
- **Docs are part of the product.** If a change alters behavior a user
  can observe (ports, env vars, endpoints, install steps), update the
  relevant page under `docs/`.
- **Bash portability matters** for `install.sh`: it must work on GNU and
  BSD/macOS `sed`. Test on both if you touch it.

## Sending a change

1. Fork, create a branch, make the change.
2. Verify: server boots (`./install.sh`), healthz returns 200, and — for
   app changes — `npm run typecheck` and `npm test` pass.
3. Open a PR with a short description of what changed and why, plus the
   verification you ran.

## Reporting bugs

Open a GitHub issue with: exact command(s), full output, `docker compose
ps`, and the last ~50 log lines (`./install.sh --logs`). Redact tokens and
personal details.

## Reporting security issues

Please do **not** open a public issue for a vulnerability. Follow the
responsible-disclosure process in [SECURITY.md](../SECURITY.md).

## License

By contributing you agree that your contributions are licensed under the
MIT license covering this project (see [LICENSE](../LICENSE)). Third-party
component licenses are tracked in
[THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md).
