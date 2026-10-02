# Features

What hub-stack lets you do, and the one-line mechanism behind each claim. Everything
here is verified against the code in this repo. Capabilities that depend on a service
you run yourself are marked as such; anything not yet built is listed under Roadmap at
the end.

## Chat with your assistant, in a native app

- **Talk to Xavier, your assistant, from your phone.** You type (or attach a photo),
  the message goes to your own server, and the reply streams back into a native iOS
  app built on Expo and React Native (`app/app/chat/`).
- **Real threads, not a toy transcript.** Threads are durable and server-side
  (`server/chat/store.py`): pin, rename, archive, unread cursors, and a
  "what needs me" inbox across every thread (`GET /api/chat/attention`).
- **Stay in control of a running turn.** While the assistant is working you can queue,
  steer, or redirect the next message, or stop the turn outright (`chatSend` mode
  parameter and `POST /chat/threads/{id}/stop`).
- **The assistant can ask before acting.** A clarify widget parks the turn on a
  question; your answer is delivered back to the agent as the tool's own result
  (`POST /api/chat/clarify/{id}`).
- **Approvals where it matters.** Actions that require a human decision arrive as
  approval cards, and your yes/no batch is a Face ID gated write
  (`server/chat/approval.py`, `chatApprovalApply`).
- **Attachments and voice capture plumbing.** Photos upload as media ids before the
  message that carries them (`POST /chat/threads/{id}/media`); a Murmur voice-capture
  bridge can feed its transcripts into the hub when you run one (external service,
  [MURMUR.md](MURMUR.md)).

## Rich custom widgets in chat

A reply is not limited to plain text. The assistant can emit structured `widget` parts
that the app draws as native UI (`app/src/components/chat/widgets/`). The widget kinds
implemented and verified are:

| Widget | What it renders |
|---|---|
| `card` | A titled card with labeled rows |
| `metric` | A single number with a delta and tone |
| `chart` | A bar or line chart drawn natively |
| `table` | Column-aligned tabular data |
| `progress` | A labeled progress bar |
| `checklist` | A tickable list; ticking persists into the widget so every client reads the same state (`POST /chat/threads/{id}/checklist`) |
| `calendar` | A date grid for schedules and ranges |
| `weather` | Conditions, temperature bars, and forecast strips |
| `form` | A fillable form with text, number, and textarea fields |
| `link` | A tappable link card |
| `button_row` | A row of buttons. These render disabled today because the reply route they would call does not exist yet |
| `poll` | A poll. Also renders disabled for the same reason |
| `clarify` | An inline question you answer in place; the thread resumes with your answer |

Widgets the current build cannot draw are not silently dropped: the transcript shows a
one-line "could not draw this" notice (`parseWidget` returning null), so a message never
disappears into a hole.

## Terminal on your own machine, from your phone

- **A real terminal over your mesh.** The Terminal tab unlocks with Face ID, mints a
  short-lived cookie, and opens a streaming terminal (xterm.js in a WebView over a
  ttyd WebSocket proxied by your server). The ttyd backend binds a unix-domain socket
  reachable only by your server process, so there is no extra port open
  (`server/app.py`, terminal proxy; `app/src/terminal/`). Sessions reconnect with
  backoff, re-lock when they expire, and can pause/resume output with flow control.
- **Launch and attach to tmux sessions on your own machine.** The Claude shells
  picker (`app/src/terminal/SessionPicker.tsx`) lists tmux sessions on your hosts,
  and lets you spawn a new session, kill one, or resume a past session. Spawn and kill
  are Face ID gated writes (`tmux.spawn` / `tmux.kill`) that your server validates and
  dispatches to the host's tmux manager (`server/app.py`, `_validate_tmux_request`).
  Multi-host is supported: one host is the server box itself, others (such as a Mac)
  are reachable over your mesh, and an asleep host degrades to a warning line instead
  of breaking the list.
- **Resume past Claude Code sessions.** The picker can list recent Claude Code
  transcripts per host (`GET /api/tmux/history`) and relaunch one by its session id
  and working directory. The server verifies the session id is a Claude Code id and
  the daemon checks the directory against a per-host allowlist, so a resume cannot
  point anywhere on disk.
- **Runbooks instead of memorized commands.** The key bar offers grouped one-tap
  commands for assistant health, cron jobs, containers, disk, tmux, and Mac-over-SSH
  tasks (`app/src/terminal/Runbooks.tsx`). Tapping a runbook fills the composer for
  your review; nothing executes on tap.
- **What a spawn actually does.** `tmux.spawn` creates a `claude-*` tmux session on
  the target host through the host's tmux manager and hands back the attach command,
  which the terminal offers as a tap that fills the composer. The tmux manager itself
  (hub-tmuxd) is not bundled in this repo; it is a service you run on the host, in the
  same spirit as every other integration (see `docs/INTEGRATIONS.md`).

## Automations

- **See every scheduled job and what it last said.** The Automations tab lists your
  scheduled jobs grouped into "needs you", new, earlier, and quiet, with a per-run
  timeline (`app/app/automations/`, `server/chat/automations.py`).
- **Runs that repeat themselves get folded.** Jobs whose latest runs failed the same
  way cluster into one row, so ten identical failures read as one problem.
- **Control noise per job.** Set a job to push, stay quiet, or mute, snooze it, or
  mark runs read, individually or all at once (`automationPrefs`,
  `automationsReadAll`).
- **Opening a run opens a thread.** A run's output can be continued as a chat
  conversation; opening it makes sure the thread under it exists.

## Daily brief

- **One page for your morning.** The brief tab renders a generated daily brief
  (`GET /api/brief`) with per-item actions.
- **Swipe-level control without Face ID.** Dismiss, snooze, or undo an item, mark an
  item useful, or attach a note. These writes are gated by a per-item token the brief
  generator mints, because a background app cannot present Face ID for a swipe;
  the server rejects a wrong or stale token (`server/app.py`, briefing routes).
- **Standing rules you can edit.** Tell the brief what to always include; adding or
  removing a rule is a Face ID gated write (`briefingRules`, `addBriefingRule`).
- **A morning push.** Register the phone for the brief's notification; the
  registration itself is device-key gated so a proof cannot be replayed to register a
  different device (`registerPushDevice`).

## Calendar

- **Your week at a glance, read-only.** The calendar tab reads a synced snapshot for
  any date range (`GET /api/calendar`, from `server/hub_calendar.py`).
- **Ask for a fresh sync.** A sync request is idempotent, so a repeat while one is
  pending changes nothing.

## Home Assistant control, behind a write gate

- **Switch your lights and devices from the chat of your own hub.** The hub talks to
  your Home Assistant server (`server/ha_actions.py`).
- **Every change requires Face ID.** Applying an HA change goes through the same
  challenge, sign, apply gate as every other write: a challenge is issued, your
  phone's Secure Enclave key signs it, and only then is it applied.
- **Dry-run until you say so.** Applies stay in dry-run mode until you set
  `HA_LIVE_APPLY=true` and provide a Home Assistant token, so a misconfigured hub
  cannot touch your home.
- **Home Assistant itself is not bundled.** You run the server; the hub holds the
  integration code.

## Files

- **Browse and read files on your server.** The Files surface lists multiple
  configured roots and lets you browse and read within them
  (`GET /api/files/roots|browse|read`, traversal-guarded in `server/files.py`).

## Always-on voice capture, optionally (Murmur)

- **Your day becomes a searchable transcript, on your own machine.** A wearable
  audio recorder buffers speech to its own flash, a daemon on your network
  drains it over Bluetooth, and a transcription backend you run produces
  speaker-tagged transcript day files and a memory index the agent can read
  (`docs/MURMUR.md`).
- **Custody is the feature.** The audio leaves hardware you own and lands on a
  machine you run; the only traffic that leaves your boundary is derived text
  (model calls for extraction, and a hosted memory provider if you use one).
- **Strictly optional.** Without a configured capture bridge the Murmur page
  does not appear, and nothing else in the hub changes. Most self-hosters will
  not have the hardware, and that is the supported default.
- **Status and control in the app.** One capture-chain strip (pendant, bridge,
  pipeline, memory) with a status dot per stage, plus drain/pause/resume
  actions through the same challenge, sign, apply write gate as every other
  write in the hub (`app/app/ops/murmur.tsx`, `server/app.py` murmur routes).

## Push notifications

- **The hub reaches you when something matters.** Chat replies, automation alerts,
  and the morning brief can arrive as push notifications through Expo's push service
  (`server/chat/notify.py`, `server/chat/push.py`), delivered to your device token.
- **Push respects presence.** The app reports whether you are looking at it, and the
  server uses that (with its own staleness rule) to decide whether a finished reply
  also needs a push.
- **An APNs key is yours to supply.** The push code is bundled; the Apple key is an
  external credential, like every other integration.

## Memory and status, glanceable

- **Memory status at a glance.** The Config area shows what the assistant remembers
  and how much memory is in use (`GET /api/memory`), when you run the agent gateway
  that owns it.
- **System health, backups, costs, and spend.** The Ops area surfaces health checks,
  restic backup status, cron run logs and costs, OpenRouter credit balance, spend
  summaries and timeseries, and a doctor report. Each panel degrades to an empty or
  503 state when the service behind it is not configured, instead of erroring.
- **A Decision Inbox.** Pending decisions the assistant has parked arrive as cards;
  answering one is a Face ID gated write (`answerDecision`).

## Privacy and self-hosting

- **Your server, your data, no third party in between.** hub-stack is the server plus
  the app. You run the server on a box you control over a private network or mesh;
  nothing is exposed to the public internet.
- **Reads are protected by the network boundary, and that is stated plainly.** The
  server has no per-request authentication: a device that can reach it can read it.
  Access control is your network (for example, a tailnet).
- **Writes fail closed.** Every state-changing call goes through a challenge, sign,
  apply gate: the phone signs with a key held in its Secure Enclave, enrolled through
  a one-time code minted by a human completing a Face ID ceremony. With no signer
  registered, the server refuses the apply with a 412 before any proof is even
  checked — that's what this repo's server code can attest to; a signature only
  proves possession of the Enclave key, not that Face ID itself matched. A leaked
  server token alone cannot enrol a writing device or authorize a write.
- **The server is deliberately thin and unprivileged.** It holds no docker socket;
  instead of calling the agent gateway directly it posts argv to a separate bridge
  sidecar (`services/hub-bridge`, not included in this repository) that is described
  as enforcing a read-only allowlist. That enforcement lives in code this repo
  doesn't ship, so it isn't something you can audit here (`docs/INTEGRATIONS.md`).
- **Degrades, never fakes.** Panels backed by services you have not configured show
  an honest empty state rather than invented data.

## Bring your own model

- **One OpenRouter key, any model.** hub-stack bundles no model provider and no paid
  tier. Put your OpenRouter key in `.env` and the hub uses whatever model you point
  it at (`OPENROUTER_API_KEY`; see `docs/INTEGRATIONS.md`).
- **Your key, your spend, at cost.** Inference is billed to your own OpenRouter
  account. The hub never proxies your usage through anyone else and never marks it up.
- **Switch models by changing a value, not a vendor.** Leave the key blank and the
  hub runs without model-backed features, which is the supported off state.

## How the commercial model is meant to work

> This section describes the owner's stated intent and plan, not a shipping feature.
> It is here so prospective users know what a subscription would and would not pay for.

The plan is that a subscription would pay for the app and the management layer only:
keeping the client current across platforms, managed upgrades, and conveniences of a
maintained product. It would not pay for intelligence. Actual model operations run on
your own OpenRouter key, billed by OpenRouter at cost to your own account, so
inference is never resold and never marked up. Because the model access is yours, you
can walk away at any time: cancel the subscription, keep self-hosting the server, and
bring your own key forward unchanged.

## Roadmap (not implemented in this repo)

- **Starting a brand new Claude Code session directly from the app.** What exists
  today is the tmux layer above: spawning and killing tmux sessions on your hosts,
  and resuming a past Claude Code session from its transcript id and an allowlisted
  working directory. A flow that starts a fresh, unresumed Claude Code coding session
  from a button in the app is not wired; the closest shipped path is the tmux runbook
  that fills the composer with a `tmux new-window` command for you to review and run.
- **Interactive `button_row` and `poll` replies.** Both widgets render, but disabled:
  the routes that would carry a button press or a vote back to the agent do not exist
  yet (see the comments in `app/src/components/chat/widgets/index.tsx`).
- **Home Assistant live applies by default.** Applies are dry-run until you
  explicitly set `HA_LIVE_APPLY=true` and supply a token; live control is code-complete
  but opt-in.
