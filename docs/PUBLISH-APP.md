# Publish the app — Expo project and App Store Connect record

The one-time setup that turns this source tree into an installable TestFlight
build. Do it on a machine that holds your own Apple and Expo credentials; this
repo ships no credentials of any kind.

## Names and identifiers (decided)

| Thing | Value | Where |
|---|---|---|
| Display name (home screen) | **Xavier** | `app/app.json` → `expo.name` |
| App Store name | **Xavier: Private AI Hub** | set in App Store Connect |
| Slug / EAS project | **xavier** | `app/app.json` → `expo.slug` |
| Bundle identifier (example) | **me.example.xavier** | `app/app.json` → `expo.ios.bundleIdentifier` |

The bundle identifier follows reverse-DNS on a domain or handle you control —
`me.example.xavier` above is an example, not a value to copy. Pick your own
before the first upload; it is **permanent after that** — Apple will not let
you reuse or rename it.

---

## 1. Create the Expo project

```bash
cd app
npx eas-cli login              # Expo account; or export EXPO_TOKEN=... first
npx eas-cli init               # creates the project, writes expo.extra.eas.projectId
```

`eas init` writes a real `projectId` into `app.json` and offers to create
`extra.eas.projectId`. Commit it — a placeholder `projectId` blocks every build.

Then set the owner so the project belongs to the right account:

```json
"owner": "<your-expo-username>"
```

## 2. Apple Developer — App ID

In <https://developer.apple.com/account/resources/identifiers>:

1. **+** → App IDs → App.
2. Bundle ID (explicit): the one you picked above (e.g. `me.example.xavier`).
3. Capabilities: enable **Push Notifications** (the hub sends push) and leave
   the rest default. Face ID needs no capability; it uses the standard
   `NSFaceIDUsageDescription` already in `app.json`.

## 3. App Store Connect — the app record

In <https://appstoreconnect.apple.com> → My Apps → **+** → New App:

- **Platform**: iOS
- **Name**: `Xavier: Private AI Hub` (must be unique across the App Store; if it
  is taken, try `Xavier Hub`, then `Xavier: AI Hub`)
- **Primary language**: English (U.S.)
- **Bundle ID**: pick the one from step 2
- **SKU**: `xavier-hub` (internal, your choice)

Copy the **Apple ID** it assigns (a number like `6811085935`) — that is the
`ascAppId` for submitting.

## 4. Wire the credentials into `eas.json`

`app/eas.json` ships with placeholders so nothing secret is committed. Fill the
submit block in locally (never commit it):

```json
"ios": {
  "ascApiKeyPath": "./secrets/AuthKey.p8",
  "ascApiKeyId": "<your key id>",
  "ascApiKeyIssuerId": "<your issuer id>",
  "ascAppId": "<the Apple ID from step 3>",
  "groups": ["beta"]
}
```

Generate the key at App Store Connect → Users and Access → Integrations →
App Store Connect API → **+**, role *App Manager*. Download the `.p8` once; put
it in `app/secrets/` and confirm `.gitignore` covers that directory.

## 5. Build and submit

```bash
cd app
npx eas-cli build  --platform ios --profile production
npx eas-cli submit --platform ios --profile production --latest
```

The first build you hand to an **external** TestFlight group goes through Beta
App Review (expect a day or two). **Internal** testers (up to 100 on your App
Store Connect team) need no review.

## 6. Testers

See [`BETA.md`](BETA.md). In short: add them to a TestFlight group, send the
code, they install and pair with the 6-character enrolment code. Builds expire
after 90 days, so keep a refresh cadence.

---

## Wall you will hit, in order

1. **`projectId` for the wrong account** → `eas init` (step 1) rewrites
   `expo.extra.eas.projectId` for your own Expo account.
2. **Bundle ID you do not control** → step 2; App Store Connect rejects an id
   outside a reverse-domain you own, and it is permanent after the first upload.
3. **Missing compliance answer** → already handled: `usesNonExemptEncryption:
   false` in `app.json` is correct for OS-provided crypto used for auth. See
   [RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md).
4. **Name already taken** → have a fallback ready (step 3).

## What cannot be done from a server

Creating the Expo project and the App Store Connect record both require signing
in to those accounts. From a headless box with no saved credentials this is a
two-step manual login (or a vaulted login the operator approves). Everything
above that does not need a login is already in place.
