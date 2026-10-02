# Beta access — how someone gets added

Two ways a person ends up using a hub-stack app, and what each one requires from
you.

---

## Model A — they self-host (no invitation needed)

They run their own `hub-api` (`install.sh`), so **they are the owner** of their
own server and mint their own pairing code. You give them nothing but the app.
This is the default for a public repo: no invitation, no shared server, no
support burden, and nobody's data touches your box.

→ Point them at [`SETUP.md`](SETUP.md) and [`CONNECT-APP.md`](CONNECT-APP.md).

---

## Model B — they connect to *your* server (the invited beta)

This is the "added to my beta" case: one server (yours), several testers. Each
tester needs three things, in this order:

1. **The app** — via TestFlight (see below).
2. **Your server URL** — the address they reach you at (a tailnet name or an
   HTTPS host you control).
3. **An enrolment code** — a one-time, 6-character code that pairs *their*
   device key to your server.

### Why there is a code at all

Writes on a hub are gated by a device key held in the phone's Secure Enclave.
A device key is never self-asserted: it is only trusted once a human completes a
passkey (Face ID) ceremony. On your server, **you** are that human, so **you**
mint the code and hand it over. This is deliberate: it means someone who can
merely *reach* the server — which is enough to read everything — still cannot
enrol a new device that can *write*.

### Per tester, you do

1. Open your Hub PWA → **Config → Security** → *Pair this iPhone* (the
   `devicekey.enroll_code` action) and complete the Face ID / passkey prompt.
2. Read the 6-character code it shows. It is single-use and expires
   (`HUB_ENROLL_CODE_TTL_S`); only one code is ever live, so mint and hand over one
   tester at a time.
3. Send the tester the **6-character code** out of band, and make sure they are
   on your network (the same tailnet, or whatever makes your server reachable).

> **There is no token to send and no login screen.** The server has no
> per-request authentication: a device that can reach it can read it. The
> enrolment code only authorises *writes* on that device. This is why the
> network step matters — see [SECURITY.md](../SECURITY.md).

### The tester does

1. Install the app from TestFlight.
2. Make sure the app can reach your server — the build is pointed at a server
   URL, so use the build you published for your hub (see the note below).
3. **Config → Security → Pair this iPhone**: enter the 6-character code. The
   app generates a Secure Enclave key, posts the public half to
   `/api/devicekey/register`, and the device is trusted.
4. Face ID now authorises writes on that device.

> **Build-time server URL.** The app resolves its server from build config
> (`expo.extra.apiBase`), not from an in-app setting. A tester can only reach a
> server the build was made for. For testers running their **own** hub, they need
> a build pointed at their host (see [PUBLIC-BUILD.md](PUBLIC-BUILD.md)); for
> testers on **your** hub, ship a build with your hub's URL.

Revoke a tester by removing their device key on the **Security** page. Because
reads are not authenticated, that removes their ability to *act*, not to *read*
— cut their network access (remove them from the tailnet, or rotate the mesh
credentials) to revoke reads.

### Gotchas

- **Codes expire and are single-use.** A stale code fails with the same generic
  error as a wrong one. Mint a fresh code rather than retrying.
- **One live code at a time.** Onboarding several testers is a serial operation
  unless you raise that limit in the server.
- **The URL must be reachable from the phone.** A `127.0.0.1` URL is only right
  when the server and the phone are the same machine; otherwise use the tailnet
  name or your HTTPS host.

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

## What the tester can actually reach

The app is only as capable as the server behind it. Out of the box a self-hosted
server serves reads (health, calendar, brief, files) and the chat/terminal
surfaces; some agent features expect a gateway process behind them (see
`HERMES_API_BASE` and `MURMUR_BRIDGE_URL` in `.env.example`). If those are unset,
those panels degrade rather than crash. Tell your testers which panels are
expected to be empty so they do not report it as a bug.

---

## Does anything go to the server owner?

For a tester on *your* server: everything goes to you, by design — it is your box.

For a tester running their **own** server (Model A) while using an app build you
distributed: **no hub data reaches you.** Verified in this repo:

- The app's default server is a placeholder (`https://hub.example.com` in
  `app/src/lib/api.ts`); there is no fallback to the author's server. The app
  talks only to the URL built into it (`expo.extra.apiBase`) — nothing is
  entered or changed in-app.
- The app contains no analytics or telemetry SDK (no Sentry/Amplitude/Segment/
  PostHog, no Expo analytics).
- The EAS `projectId` is a real project id (it ships inside every build, so it
  is public by construction), and no OTA `updates.url` is set, so a self-built
  app does not fetch JavaScript from anyone else's EAS account.

Two honest caveats about the *distribution*, not the data:

1. **iOS distribution is tied to whoever builds the beta.** If testers install
   your TestFlight build, the app record, the tester list, and the Apple
   Developer relationship are yours. Data still does not flow to you, but the
   distribution does.
2. **If you ship a build with OTA updates enabled**, `expo-updates` makes each
   installed app check your EAS project for new bundles. That is a small metadata
   path (install/update pings) and it means you can push JS to their devices. For
   a build you hand to self-hosters, either leave `updates.url` unset or point it
   at your own infrastructure, and say so.

