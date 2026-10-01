# Security

## Model

hub-stack is designed to be private by default:

- **Loopback by default.** The server publishes on `127.0.0.1` only. Nothing is
  reachable from the internet until you put a reverse proxy or a private mesh
  (e.g. Tailscale) in front of it.
- **Token auth.** The app authenticates with a bearer token (`HUB_API_TOKEN`)
  generated at install time. Rotate it by editing `.env` and restarting.
- **No telemetry.** The server does not call home or report usage anywhere.
- **Sensitive routes** can additionally require WebAuthn / a device key.

## Your responsibilities

- Do **not** set `HUB_BIND=0.0.0.0` without TLS and an authenticating proxy.
- Keep `.env` out of version control (it is gitignored) and back it up securely.
- Treat the token like a password.

## Reporting a vulnerability

Open a private security advisory on the repository, or email the maintainer.
Please do not open a public issue for an unexploited vulnerability.
