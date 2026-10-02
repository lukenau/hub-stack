# Privacy

This page describes what the software in this repository does with data. It is
written about the code, so you can check every claim against the source. It is
not a privacy policy for any service, because this project does not operate a
service. See the end of the page for what that means if you offer one.

## What leaves your machine

Nothing by default. The server has no telemetry, no analytics, and no
phone-home. It does not report usage, crashes, versions, or anything else to
the project or to anyone else. There is no account system and no hub-stack
cloud. The app contains no analytics or crash-reporting SDK of any kind: its
dependencies are the app framework and user-interface libraries only, and you
can confirm that in `app/package.json`. The app talks only to the server URL
it was built with; the built-in default is a placeholder
(`https://hub.example.com`) that leads nowhere, and there is no hidden
fallback to any other server.

Outbound connections exist only where you configure them. Each one is a
feature you switch on by setting a key or an address. Blank means off. The
paths that genuinely exist in the code:

| You enable | What goes out | Where |
|---|---|---|
| An agent gateway (`HERMES_API_BASE`) | Your prompts and messages, to reach the model backend that gateway uses | An address you choose |
| An OpenRouter key (`OPENROUTER_API_KEY`, `OPENROUTER_MGMT_KEY`) | The key itself, to read account and spend data | `openrouter.ai` |
| Push notifications | An Expo push token, and notification payloads when something happens | `exp.host`, Expo's push service |
| A Discord approvals bot (token file) | Draft message text you asked to review, posted to a Discord channel you control | `discord.com` |
| A Telegram token file | The same, over a retired path kept only for older installs | `api.telegram.org` |
| A voice bridge (`MURMUR_BRIDGE_URL`) or an iMessage MCP (`IMESSAGE_MCP_URL`) | Whatever that bridge handles | Addresses you choose, typically your own machines |

If you enable the agent gateway and it calls a model provider, your prompts
reach that provider. That choice belongs to the gateway configuration, not to
hub-stack; check what your gateway points at if that matters to you.

In the reference setup the gateway is Hermes, and Hermes passes your prompts on
to the model provider it is configured with, which is commonly OpenRouter. So
the practical answer is that your prompts do leave your machine and do reach
that provider on the way to a model. What does not happen is hub-stack itself
sending your prompts to OpenRouter through the `OPENROUTER_API_KEY` in the table
above: that key is used only for account and spend lookups.

A note on distributed app builds: if you install a build someone else made,
that person chose the server URL baked into it, and can also enable over-the-air
updates, which make the app check their project for new code. If you build the
app yourself from this repository, neither of those points at anyone else.

## What is stored, and where

Everything the server knows lives in one directory on the machine running it:
`HUB_DATA_DIR` (default `./data`, mounted at `/data` in the container). There
is no copy anywhere else. The main things in it:

- Chat history in a SQLite database at `/data/hub/chat/chat.db`, with image
  attachments in a `media/` directory next to it.
- Device keys (the public halves of the keys that authorize writes) and
  passkeys, in JSON files under `/data/hub`.
- Push tokens, if you enabled push, in `/data/hub/data/push_tokens.json`.
- Server secrets: tokens and keys the server needs, under `/data/hub/secrets`.
- Uploaded and inbox files (`HUB_INBOX_DIR`, default `/data/hub-inbox`), brief
  and briefing data, finance snapshots, decisions, and JSON-lines logs, in
  their own subdirectories under `/data`.
- Your `.env` file with any API keys, next to the data directory, readable
  only by you.

On the phone, the app keeps settings and cached server data in the platform's
standard local storage. Nothing about you is stored by the project anywhere
else, because there is no one else to store it.

## Who is responsible

If you run this on your own machine for yourself, you are the only person
whose data is involved. There is no service provider in the middle, no
account, and nobody to notify, request deletion from, or sue. Your obligations
are the ordinary ones of running your own computer.

If you run it where other people can reach it, for example for beta testers,
family, or friends, the picture changes. You now hold data about people who
are not you: their messages, their device keys, their push tokens, whatever
the features they use touch. You are the operator of that system. The
software will not do this part for you; these are your duties, not the
project's. In practice:

- Tell each person what the server stores about them and where, and who you
  are. The list above is a starting point.
- Let them see what you hold and have it deleted. Removing a device key on
  the Security page, deleting their chat threads, and clearing their push
  token cover most of it; deleting their rows and files from the data
  directory covers the rest.
- Keep the network closed. The server has no per-request authentication:
  anyone who can reach the port can read everything it exposes. This is the
  access model documented in [SECURITY.md](../SECURITY.md), and it is your
  job to keep uninvited people out of reach.
- Do not quietly widen the circle. A small group of people you know is a
  different situation from an open signup, and different rules can start to
  apply to you. Privacy laws vary by country and by what you are doing; if
  you are hosting for others at any scale, or for money, get advice for your
  own situation.

## How long data is kept

The software does not expire anything on its own. Chat history, logs, files,
and tokens sit in the data directory until you or a user delete them, or
until you delete the directory. The only short-lived data is built-in and
harmless: device enrolment codes and sign-in challenges expire in seconds or
minutes. If you operate for other people, retention is whatever you decide it
is, so decide it and tell them. Deleting a user means deleting their data
from the data directory; the server will not resurrect it, and there is no
backup unless you made one.

## What this page is not

This is a description of a codebase, written by the people who maintain it.
It is not a privacy policy, and the project is not a company operating a
service. If you offer hub-stack to other people, as a beta, a favor, or a
product, you are the one holding their data, and you need your own policy and
your own answers. Nothing on this page transfers that job to the project.
