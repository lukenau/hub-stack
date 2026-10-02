# Beta access — how someone gets added

The beta is the **app**, distributed through TestFlight. There is no shared
server and no invitation onto anyone else's machine: each tester runs their own
`hub-api` and pairs their own device.

---

## What a tester needs

Three things, in this order:

1. **The app** — via TestFlight (see below).
2. **Their own server** — they run `hub-api` themselves (`install.sh`), so they
   are the owner of their own box. Point them at [`SETUP.md`](SETUP.md).
3. **An enrolment code** — a one-time, 6-character code that pairs *their* device
   key to *their* server, minted by them from their own Hub PWA.

Because the server is theirs, so is the data: nothing a tester does reaches
anyone else.

---

## Why there is a code at all

Writes on a hub are gated by a device key held in the phone's Secure Enclave. A
device key is never self-asserted: it is only trusted once a human completes a
passkey (Face ID) ceremony. On their own server, the tester is that human, so
they mint their own code.

This is deliberate: it means someone who can merely *reach* a server — which is
enough to read everything on it — still cannot enrol a new device that can
*write*.

---

## Pairing a device

1. Open the Hub PWA → **Config → Security** → *Pair this iPhone* (the
   `devicekey.enroll_code` action) and complete the Face ID / passkey prompt.
2. Read the 6-character code it shows. It is single-use and expires
   (`HUB_ENROLL_CODE_TTL_S`); only one code is ever live, so mint one at a time.
3. In the app: **Config → Security → Pair this iPhone**, and enter the code. The
   app generates a Secure Enclave key, posts the public half to
   `/api/devicekey/register`, and the device is trusted.
4. Face ID now authorises writes on that device.

Revoke a device by removing its key on the **Security** page. Because reads are
not authenticated, that removes its ability to *act*, not to *read* — cut network
access to revoke reads.

> **There is no token to send and no login screen.** The server has no
> per-request authentication: a device that can reach it can read it. The
> enrolment code only authorises *writes* on that device. See
> [SECURITY.md](../SECURITY.md).

### Gotchas

- **Codes expire and are single-use.** A stale code fails with the same generic
  error as a wrong one. Mint a fresh code rather than retrying.
- **One live code at a time.** Onboarding several devices is a serial operation
  unless you raise that limit in the server.
- **The URL must be reachable from the phone.** A `127.0.0.1` URL is only right
  when the server and the phone are the same machine; otherwise use a tailnet
  name or an HTTPS host.

---

## Build-time server URL

The app resolves its server from build config (`expo.extra.apiBase`), not from an
in-app setting, so a build can only reach a server it was made for. A tester
running their own hub needs a build pointed at their host — see
[`PUBLIC-BUILD.md`](PUBLIC-BUILD.md).

---

## TestFlight

| | Internal testers | External testers |
|---|---|---|
| Who | Up to 100 people on your App Store Connect team | Anyone with the public link |
| Apple review | Not required | Required for the first build of each version |
| Setup | Add their Apple ID to the team | Create a group, add emails, submit for review |

For a small beta, **internal** is the fast path. For a wider one, use **external**
with a public TestFlight link and expect a review pass first. Submitting is an
EAS command:

```bash
cd app
npx eas submit --profile production --platform ios
```

Testers redeem the invite in the TestFlight app, then follow the pairing steps
above. Apple build expiry is the clock: a TestFlight build stops working after 90
days, so plan a refresh build before then.

---

## What a tester can actually reach

The app is only as capable as the server behind it. Out of the box a self-hosted
server serves reads (health, calendar, brief, files) and the chat/terminal
surfaces; some agent features expect a gateway process behind them (see
`HERMES_API_BASE` and `MURMUR_BRIDGE_URL` in `.env.example`). If those are unset,
those panels degrade rather than crash. Tell testers which panels are expected to
be empty so they do not report it as a bug.

---

## Does anything go to whoever distributed the app?

No. Verified in this repo:

- The app's default server is a placeholder (`https://hub.example.com` in
  `app/src/lib/api.ts`); there is no fallback to any author's server. The app
  talks only to the server you point it at — the address you enter under
  **Config → Server address**, or the build-time `expo.extra.apiBase` if you
  never set one.
- The app contains no analytics or telemetry SDK (no Sentry/Amplitude/Segment/
  PostHog, no Expo analytics).
- The EAS `projectId` is a real project id (it ships inside every build, so it is
  public by construction), and no OTA `updates.url` is set, so a self-built app
  does not fetch JavaScript from anyone else's EAS account.

Two honest caveats about the *distribution*, not the data:

1. **iOS distribution is tied to whoever builds the beta.** If testers install
   your TestFlight build, the app record, the tester list, and the Apple Developer
   relationship are yours. Data still does not flow to you, but the distribution
   does.
2. **If you ship a build with OTA updates enabled**, `expo-updates` makes each
   installed app check your EAS project for new bundles. That is a small metadata
   path (install/update pings) and it means you can push JS to their devices. For
   a build you hand to self-hosters, either leave `updates.url` unset or point it
   at your own infrastructure, and say so.
