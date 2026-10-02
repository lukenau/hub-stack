# Integrations: what ships here vs what you must already run

hub-stack is the **hub server + app**. It contains the code that *talks to*
several optional services, but it bundles **none** of them. Everything external
is yours to run (or skip it; the hub works standalone without it).

`hub-api` starts fine with every integration unset. Panels that depend on a
service you have not configured degrade (a 503 or an empty card) rather than
crash. One of them, Murmur (optional always-on voice capture), has its own
page: [MURMUR.md](MURMUR.md).

## The full catalogue

Every optional subservice (the agent runtime, model access, capture and
input, household, machine control, payments, notifications, storage and paths,
security, and observability) is documented in **[SERVICES.md](SERVICES.md)**, with the
exact environment variables the server reads, what each service requires, and
a copy-pasteable `.env` block per service.

The short version: the agent gateway (`HERMES_API_BASE`) is the big one. hub-api
is deliberately a *thin, unprivileged* service: it holds no docker socket and
posts argv to a separate bridge sidecar (`services/hub-bridge`) instead of
reaching the agent directly. That bridge is **not included in this repository**
— only the hub-side code that calls it is — so its allowlist enforcement is not
something this repo lets you audit; see the bridge note in
[SERVICES.md](SERVICES.md#hub-bridge-sidecar). Without the agent gateway, treat
hub-stack as a private dashboard + chat shell rather than a full agent, and that
standalone mode is a supported configuration, not a degraded one (see "Start
with nothing" in SERVICES.md).

## Configuring any integration

1. Put the value in `.env` (never in a tracked file; `.env` is gitignored).
2. Restart: `./install.sh --restart`.
3. Confirm: `./install.sh --status`, then hit the relevant panel in the app.

Leave a knob blank to disable that integration entirely. A blank value is the
supported "off" state; it is not an error.
