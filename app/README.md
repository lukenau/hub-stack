# Hub — native iPhone app

## What it is

An exact, feature-for-feature port of the Hub PWA (`apps/hub`) to a native iPhone app built
with Expo. Content parity is exact; chrome is native iOS. See
`docs/superpowers/specs/2026-09-09-hub-app-native-port-design.md` for the design spec and
`apps/hub-app/docs/PARITY-INVENTORY.md` / `apps/hub-app/docs/RESEARCH.md` for the normative
parity contract and verified technical research behind the port.

## Toolchain

Node 22 is installed user-local at `~/.local/node22` (the host's system Node is 18, used by
`apps/hub`; don't let the two mix). Source the project's env script before running anything
here:

```bash
cd apps/hub-app
source scripts/env.sh    # PATH, EXPO_NO_TELEMETRY=1, CI=1
npm run typecheck        # tsc --noEmit
npm test                 # jest (jest-expo preset)
```

## Stack

Expo SDK 57, RN 0.86.3, React 19.2.3, TypeScript, expo-router. Install native modules only via
`npx expo install <pkg>` so SDK pins resolve correctly.

## Toolchain quirks

`expo-router@57.0.20` pulls in a web-only peer chain (`@expo/ui` → `vaul` → `@radix-ui/*`) that
resolves to `react-dom@19.2.8`, which wants `react@^19.2.8` — conflicting with this project's
pinned `react@19.2.3` (the version `react-native@0.86.3` actually needs). We only target iOS, so
that web chain is irrelevant, but a plain `npm install`/`npm ci` still fails closed on the
conflict. `.npmrc` sets `legacy-peer-deps=true` so every npm/npx invocation in this directory
(including future `npx expo install <pkg>` calls) resolves it automatically — no per-command flag
needed.

## Dev loop (Metro over the tailnet)

The phone cannot reach this box's loopback, so Metro has to be published on the tailnet and
told to advertise that URL instead of `localhost`. Three parts, in order:

```bash
cd apps/hub-app
source scripts/env.sh

# 1. Publish Metro's port on the tailnet. CHANGES LIVE TAILNET ROUTING —
#    the user runs this, or you run it only with his explicit go-ahead.
tailscale serve --bg --https=8448 http://127.0.0.1:8082

# 2. Tell Metro to hand out the tailnet URL in the bundle it serves.
export EXPO_PACKAGER_PROXY_URL=https://hub.example.com:8448

# 3. Start Metro bound to loopback; tailscale serve is the only way in.
npx expo start --dev-client --port 8082 --localhost
```

Tear the route down with `tailscale serve --https=8448 off` when you are done. Leaving it up
is not dangerous (tailnet-only, never `funnel`) but it is one more live route to reason about.

Pick the port deliberately and **run `tailscale serve status` first**: 8443 through 8447 were
all claimed as of 2026-09-11. The plan for this task originally named 8447 and it had been
taken by the time the task ran, which is exactly why you check rather than copy a port out of
a doc.

`--dev-client` and not `--go`: this app uses native modules (Secure Enclave keys, the terminal
socket) that Expo Go does not contain. You need a development build installed on the phone.

## Shipping

```bash
source scripts/env.sh
unset CI                             # SEE BELOW — required for the first interactive build
npx eas-cli build --platform ios --profile production
npx eas-cli submit --platform ios --id <build-id>
```

There is no bump step and no build number in `app.json`: `eas.json` sets
`appVersionSource: "remote"` with `autoIncrement: true`, so EAS owns the build number and
increments it server-side on every build. (`hub-server/deploy/hub-api-bump.sh` is a different
thing entirely — it versions the hub-api container, not this app.)

Four traps, all of which cost a real session:

- **`CI=1` defeats every interactive prompt.** `scripts/env.sh` exports it, and EAS treats
  `CI=1` as non-interactive *regardless of whether a TTY is attached*. A first build that needs
  credential setup fails with "Distribution Certificate is not validated for non-interactive
  builds" even inside tmux. `unset CI` for that build. Piping through `tee` also removes the
  TTY, so don't.
- **`--auto-submit` does not reliably create the submission.** It has silently produced a
  submission that never appears in the EAS workflow view. Cancel any stuck one with
  `eas submit:cancel` and re-run `eas submit --platform ios --id <build-id>` explicitly.
- **Never re-run a submit whose wait died.** Query with `eas submit:list` instead — submits are
  not idempotent.
- **`EXPO_TOKEN` lives in `/opt/murmur/.env`**, not `/opt/hub-data/.env`. Whoever holds it
  can push arbitrary executable JS to the phone over OTA; EAS Update code signing is not
  available on this plan (it needs Enterprise, and it nearly bricked Murmur's OTA channel when
  tried — see `murmur/PIPELINE.md`).

ASC App ID is `6811085935`; `eas.json` carries it for both profiles.

### OTA vs. a new build

`app.json` sets `runtimeVersion: {policy: "fingerprint"}`. A JS-only change can ship over the
air to an existing build **only while the fingerprint still matches that build's**. Check
BEFORE publishing, never after — an update published against a fingerprint no build carries is
orphaned and reaches nobody:

```bash
npx expo-updates fingerprint:generate --platform ios
```

Use exactly that command. `npx @expo/fingerprint .` runs platform-agnostic and returns a
different hash that looks like a mismatch and is not one.

## Testing

`npm test` runs `npm run check` then jest. `npm run check` is five generated-artifact gates:
theme parity against the PWA, `tokens.gen.ts`, the vendored xterm bundle, a ban on raw colour
literals outside `src/theme/`, and `check-shared-parity.mjs`, which asserts the files copied
verbatim from the PWA are still byte-identical.

One jest trap worth knowing: mounting a component with a running `Animated.loop` (the skeleton
card's pulse, the refresh spinner) and not unmounting it **hangs the entire run**, not just
that test. Every test that mounts one needs an `unmount()` in `afterEach`.

## Status

Feature-complete against the port plan and shipped to TestFlight (build 6). Two deliberate,
owner-requested deviations from PWA parity are in place and marked as such in the source: the
background wash is painted the Murmur way (`src/components/shell/Ground.tsx`) and page headers
are sticky (`src/components/shell/Screen.tsx`). Do not revert either in a parity sweep.

## Native fingerprint traps

`modules/paste-control/ios/` is a **fingerprint source hashed by file content** — expo's
`sourcer/Expo.js` registers each autolinked pod dir as `{type: 'dir'}` and `hash/Hash.js`
recurses it. So a comment-only edit to `PasteControlView.swift` moves the runtime hash and
an OTA published from that tree stops matching the installed build. `eas.json` and
`.easignore` are hashed the same way. Never touch any of them between a native build and
the OTA meant to reach it; bundle such edits with the next build.

Two notes that belong with the paste-control code but cannot live inside it, for the reason
above:

- `UIPasteControl.target` is `(any UIPasteConfigurationSupporting)?`, **not** `UIResponder?`.
  Assigning the view works only because `UIResponder` conforms to that protocol.
- `UIPasteControl(configuration:)` takes the configuration alone; the target is a property.
  `UIPasteControl(configuration:target:)` does not exist and cost build 13.

A TestFlight group is set per submission (`eas submit --groups "Team (Expo)"`), not in
`eas.json` — the group in that file is unused, and editing it would move the fingerprint.
