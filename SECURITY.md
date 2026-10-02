# Security

Read this before you expose the server to anything but `localhost`.

## The model, honestly

hub-stack's access control is **the network boundary, not a login**. The server
ships with no user accounts and no per-request authentication. What actually
protects it:

| Layer | What it does | What it does not do |
|---|---|---|
| **Loopback bind** (`HUB_BIND=127.0.0.1`) | Only the machine it runs on can reach the port | Nothing, once you bind wider |
| **Private mesh / TLS proxy** | Encrypts and gates reachability to your devices | Does not identify individual users |
| **Device key (Secure Enclave) + Face ID** | Authorises specific **write** actions | Does not gate reads |
| **Terminal lock** | Locks the terminal route behind Face ID | Does not gate the rest of the API |

**Consequence:** any client that can reach the port can read everything the
server exposes — calendar, files, chat, briefs. Treat reachability as authority.

> **`HUB_API_TOKEN` in `.env` is reserved and NOT enforced by the server today.**
> Older docs and `.env.example` described it as a required bearer token. That is
> not true in this codebase: nothing reads it and the API does not check it. Do
> not rely on it to protect an exposed port. It is kept only so installs remain
> compatible if enforcement is added later.

## Therefore

- **Keep `HUB_BIND=127.0.0.1`.** This is the default and the single most
  important setting.
- **Reach it over a mesh, not the internet.** Tailscale / Headscale / WireGuard
  — see [MESH.md](docs/MESH.md). `serve`, never `funnel`.
- If you must expose a port, put a proxy in front that terminates TLS **and**
  authenticates (Cloudflare Access, oauth2-proxy, mutual TLS). The server will
  not do it for you.
- Anyone reachable can read. Only *writes* hit the Face ID device-key gate, and
  only for the actions that implement it.

## Writes

Sensitive write actions require a **device key**: a P-256 signature from a key
enrolled in the phone's Secure Enclave. A new device is never self-asserted —
it is enrolled with a single-use, time-limited code minted behind a passkey
assertion on an already-trusted device (`server/devicekeys.py`). With no
enrolled signer, the server refuses the apply with a 412 before any proof is
even checked (`server/app.py`) — that refusal is what this repo can attest to;
whether a given client would even attempt the call first is client behavior
outside this codebase.

Honest limitation, stated in that module too: a valid signature proves
possession of the Enclave key, not that Face ID actually matched. Normally the
OS only lets the Enclave sign after a live Face ID match, but that's an
OS-level guarantee this server has no way to verify. An attacker with a
jailbroken handset and an unlocked Enclave is inside this gate.

## No telemetry

The server does not call home or report usage. See the Privacy section of the
[README](README.md).

## Secrets

- Real credentials belong in `.env` only, which is gitignored, and `install.sh`
  creates it `chmod 600`.
- `scripts/hub-stack-gate.sh` scans for committed keys, tokens, PEM blocks,
  account ids and personal contact data. Run it before any push.
- Keys the server mints at runtime (device keys, compose tokens, bridge tokens)
  are written to the data directory, never the repo.

## Your responsibilities

- Do **not** set `HUB_BIND=0.0.0.0` without TLS and an authenticating proxy.
- Keep `.env` out of version control (it is gitignored) and back it up securely.
- Treat the server's reachability as its password.

## Supported versions

hub-stack is pre-1.0 and moves quickly. There are no release branches: the
only supported version is the latest commit on the default branch. If you
are running anything older, update first, then report the problem if it
survives.

## Reporting a vulnerability

The preferred channel is GitHub's private vulnerability reporting on this
repository, if it is enabled. Otherwise open a private security advisory on
the repository, or contact the maintainer, **Luke Nau**
([@lukenau](https://github.com/lukenau)). Please do not open a public issue
for an unexploited vulnerability.

One person maintains this project, so handling is best effort: there is no
SLA and no committed response time, and a fix may take a while. Reports are
read and taken seriously, but patience is part of the deal.

If you research this project in good faith, the maintainer will not pursue
legal action over vulnerabilities disclosed responsibly. That courtesy does
not extend to accessing other people's data or degrading the service: do
neither.
