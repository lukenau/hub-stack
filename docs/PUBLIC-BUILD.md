# Public-safe and personal builds

The app currently has personal features baked in: an Ops section with a live
terminal, Money, spend data, Oura. (Trading was personal-only and has been
removed from this repo entirely — it is not a feature you need to strip, and
a build that still contains traces of it means something regressed.) If you
hand a build to beta testers, you probably do not want any of that inside
it. This guide
shows how to produce two iOS builds from the same codebase:

- **A. Personal build** — everything, for you.
- **B. Public-safe build** — the same app with personal features stripped,
  for TestFlight beta testers.

Both come from one repo, one branch, one set of source files.

---

## 1. The mechanism

Two ways to do this exist:

| Approach | How it works | Downside |
|---|---|---|
| Two EAS build profiles only | Each profile sets a different `ios.bundleIdentifier` | Only changes native identity. The JS bundle is identical, so personal screens still ship, just under another bundle id. |
| `app.config.js` + `APP_VARIANT` env var | One env var selects bundle id, app name, EAS project id, and a runtime feature flag, all together | One extra file. |

**Use the `app.config.js` approach.** The reason: a build-profile-only split
changes what the binary is called but not what it contains. You need the JS
bundle itself to differ, and the flag has to reach both the native config
(bundle id, name, project id) and the runtime code (which tabs and routes
exist). A single `APP_VARIANT` variable, set by the EAS profile, drives both
from one place, so the two builds cannot drift apart.

### How two apps install side by side

iOS identifies an app by its bundle identifier, not its name. The personal
build keeps `com.example.hub`; the public-safe build uses
`com.example.hub.beta`. Different bundle ids mean both can be installed on
the same device at once, with separate icons, separate storage, separate
pairing. The app name ("AGENT HUB" vs "AGENT HUB BETA") is cosmetic and only
affects what shows under the icon.

### Two EAS projects or one?

You need two bundle ids either way, which means two app records in App Store
Connect either way. The open question is Expo-side:

| Option | Pros | Cons |
|---|---|---|
| **Two EAS projects** (recommended) | Separate dashboards and build lists; separate OTA update channels and runtime versions; a public-safe update can never be rolled out to your personal build by mistake | Two projects to init; two project ids to track |
| One EAS project, two bundle ids | One dashboard, one project id | Both variants share update channels and build history; easy to push a JS update built with the wrong flag to the wrong audience; the `extra.eas.projectId` value is the same, so the config flag is the only thing telling variants apart |

Recommendation: **two EAS projects.** The whole point of the public-safe
build is that mistakes in it do not reach your data. Keeping the projects
separate puts that principle in the tooling too.

---

## 2. Exact file changes

### 2.1 Create `app/app.config.js`

`app.json` stays in the repo as the base config. `app.config.js` imports it
and overrides per variant, so nothing in `app.json` is duplicated:

```js
// app/app.config.js
const base = require('./app.json').expo;

// The variant table is the single source of truth for what differs
// between the two builds. Fill in the two real project ids after
// running `eas init` for each (section 4).
const VARIANTS = {
  personal: {
    name: 'AGENT HUB',
    bundleIdentifier: 'com.example.hub',
    easProjectId: 'REPLACE_WITH_PERSONAL_EAS_PROJECT_ID',
  },
  beta: {
    name: 'AGENT HUB BETA',
    bundleIdentifier: 'com.example.hub.beta',
    easProjectId: 'REPLACE_WITH_BETA_EAS_PROJECT_ID',
  },
};

const variant = VARIANTS[process.env.APP_VARIANT ?? 'personal'];
if (!variant) {
  throw new Error(`Unknown APP_VARIANT: ${process.env.APP_VARIANT}`);
}

module.exports = {
  expo: {
    ...base,
    name: variant.name,
    owner: 'REPLACE_WITH_EXPO_OWNER',
    ios: {
      ...base.ios,
      bundleIdentifier: variant.bundleIdentifier,
    },
    extra: {
      ...base.extra,
      eas: { projectId: variant.easProjectId },
      // Read at runtime by src/lib/features.ts.
      variant: process.env.APP_VARIANT ?? 'personal',
    },
  },
};
```

Notes:

- `process.env.APP_VARIANT` is read at config-eval time, which happens on
  your machine and on EAS servers. Setting it in the EAS profile (section
  2.3) means one command picks the whole variant.
- The runtime code does not read `process.env` directly (Metro inlines env
  vars unreliably across contexts). It reads the value baked into
  `extra.variant` via `expo-constants`.

### 2.2 Add a feature flag module

Create `app/src/lib/features.ts`:

```ts
import Constants from 'expo-constants';

/** 'personal' keeps everything; 'beta' strips personal surfaces. */
export const APP_VARIANT =
  (Constants.expoConfig?.extra as { variant?: string } | undefined)?.variant === 'beta'
    ? 'beta'
    : 'personal';

export const PERSONAL_FEATURES_ENABLED = APP_VARIANT === 'personal';
```

### 2.3 Extend `app/eas.json` with two new profiles

Add profiles that inject the variant. Keep the existing `development` and
`production` profiles untouched:

```json
{
  "build": {
    "personal": {
      "distribution": "store",
      "autoIncrement": true,
      "channel": "production",
      "env": { "APP_VARIANT": "personal" }
    },
    "beta": {
      "distribution": "store",
      "autoIncrement": true,
      "channel": "beta",
      "env": { "APP_VARIANT": "beta" }
    }
  }
}
```

### 2.4 Gate the personal routes

The tab bar is defined in `app/app/_layout.tsx` as `NativeTabs.Trigger`
entries for `(home)`, `ops`, `chat`, and `automations`. Wrap the personal
triggers in the flag:

```tsx
import { PERSONAL_FEATURES_ENABLED } from '../src/lib/features';

// Inside <NativeTabs>:
{PERSONAL_FEATURES_ENABLED ? (
  <NativeTabs.Trigger name="ops">
    {/* ...existing icon and label... */}
  </NativeTabs.Trigger>
) : null}
{PERSONAL_FEATURES_ENABLED ? (
  <NativeTabs.Trigger name="chat">
    {/* ...existing icon and label... */}
  </NativeTabs.Trigger>
) : null}
```

But hiding the tab is not enough. expo-router registers every file under
`app/` as a reachable route, so deep links and `router.push` calls can still
navigate to them. Guard the route files themselves. Create
`app/app/(personal-redirect).tsx` once and add the guard at the top of each
personal screen (`app/ops/index.tsx`,
`app/ops/terminal.tsx`, `app/ops/cost.tsx`, `app/ops/files.tsx`,
`app/ops/murmur.tsx`, `app/ops/feed.tsx`, and, if you consider them
personal, `app/(home)/finance.tsx`, `app/(home)/oura.tsx`,
`app/(home)/decisions.tsx`):

```tsx
import { Redirect } from 'expo-router';
import { PERSONAL_FEATURES_ENABLED } from '../../src/lib/features';

export default function MurmurScreen() {
  if (!PERSONAL_FEATURES_ENABLED) {
    return <Redirect href="/" />;
  }
  // ...existing screen...
}
```

Also gate the entry points that navigate to personal routes:

- `app/src/components/home/Header.tsx` pushes `/ops/terminal` from the
  terminal button in the header. Conditionally render that button (or make
  it render nothing) when the flag is off.
- `app/(home)/index.tsx` renders `MoneyEntryCard`, `OuraRow`, `SpendCard`,
  and the spend polls. Wrap those in the flag so a beta build neither shows
  them nor polls their endpoints.

Two ways to keep this maintainable:

- **Per-screen guard + conditional entries (recommended to start).** Small
  diff, easy to review, and `Redirect` makes any missed entry point land on
  Home instead of an error.
- **Build-time exclusion.** For a harder guarantee, make the personal route
  files vanish from the bundle: in `metro.config.js`, when
  `process.env.APP_VARIANT === 'beta'`, use the resolver to alias each
  personal route path to a one-line stub that returns the redirect above.
  The screen code then is not in the JS bundle at all. Do this only if the
  per-screen guard is not enough for you; it is more setup and easier to
  get subtly wrong.

Note that even with per-screen guards, the code of personal screens is still
inside the beta JS bundle. Section 5 covers what that means and how to
check it.

### 2.5 Keep the ASC and EAS ids separate

Each variant gets its own App Store Connect app record and its own submit
configuration. Add a submit block per profile in `app/eas.json`:

```json
{
  "submit": {
    "personal": {
      "ios": {
        "ascApiKeyPath": "./secrets/AuthKey.p8",
        "ascApiKeyId": "REPLACE_WITH_KEY_ID",
        "ascApiKeyIssuerId": "REPLACE_WITH_ISSUER_ID",
        "ascAppId": "REPLACE_WITH_PERSONAL_APP_ID",
        "groups": []
      }
    },
    "beta": {
      "ios": {
        "ascApiKeyPath": "./secrets/AuthKey.p8",
        "ascApiKeyId": "REPLACE_WITH_KEY_ID",
        "ascApiKeyIssuerId": "REPLACE_WITH_ISSUER_ID",
        "ascAppId": "REPLACE_WITH_BETA_APP_ID",
        "groups": ["beta"]
      }
    }
  }
}
```

Keep the placeholder values in the committed `eas.json` and pass the real
values at submit time with `eas submit` flags (section 4). The repo's
publish gate blocks real ASC/EAS identifiers in config files, so real ids
belong in your local shell or CI secrets, not in version control.

The same `.p8` API key can submit both apps; the `ascAppId` is what selects
the app record.

---

## 3. App Store Connect

### 3.1 Create the app records

One per bundle id, in [App Store Connect](https://appstoreconnect.apple.com)
under Apps → the "+" button:

1. Personal: name "AGENT HUB", primary language, bundle id
   `com.example.hub`, SKU of your choice.
2. Public-safe: name "AGENT HUB BETA" (names must be unique in App Store
   Connect), bundle id `com.example.hub.beta`.

You need the bundle ids registered in your Apple Developer account first
(identifiers section) before they appear in this picker.

Note: both apps can live in the App Store eventually, or the beta app can
stay TestFlight-only. A build uploaded to TestFlight is usable by testers
regardless of whether you ever finish the full App Store review for it.

### 3.2 Submit each variant

```
eas submit --profile personal --platform ios --latest
eas submit --profile beta --platform ios --latest
```

Each submits the newest build of that profile's project to its own
`ascAppId` record from section 2.5.

### 3.3 TestFlight: internal vs external

| | Internal testers | External testers |
|---|---|---|
| Who | Up to 100 people who are App Store Connect users on your team (with a role) | Up to 10,000 people, email or public link, no ASC account needed |
| Apple review | No review; available within minutes of processing | Needs Beta App Review on the first build of each version; usually fast, but add a day |
| Good for | You and immediate collaborators | Actual beta testers you hand the public-safe build to |

Invite internal testers: Users and Access → People (give them a role), then
in the app record's TestFlight tab add them to the internal group.

Invite external testers: in the app record's TestFlight tab, create a group
(for example "beta", matching the `groups` value in the submit config,
which auto-distributes to that group), add testers by email, or enable the
public link. For external testing, fill in the short Test Information form
(what the app does, a contact); then the first build goes to Beta App
Review. Testers get an email invite, install the TestFlight app, and the
build appears.

### 3.4 What testers need to use the app

The app is pointed at a server at build time (`expo.extra.apiBase`) and
pairs with a one-time enrolment code (see CONNECT-APP.md). A tester
pointing at your server sees your data, so for the public-safe build either
point testers at a demo server with nothing personal in it, or accept that
they pair to their own hub.

---

## 4. Command checklist

One-time setup:

```bash
cd hub-stack/app
npm install
npm install -g eas-cli
eas login

# Create the two EAS projects and note the project ids it prints:
APP_VARIANT=personal eas init   # paste id into VARIANTS.personal in app.config.js
APP_VARIANT=beta eas init       # paste id into VARIANTS.beta in app.config.js
```

Check what each variant produces before building (cheap and catches
config mistakes):

```bash
APP_VARIANT=personal npx expo config --type public | grep -E 'name|bundleIdentifier|projectId'
APP_VARIANT=beta      npx expo config --type public | grep -E 'name|bundleIdentifier|projectId'
```

Personal build and submit:

```bash
APP_VARIANT=personal eas build --profile personal --platform ios
eas submit --profile personal --platform ios --latest \
  --asc-api-key-path ./secrets/AuthKey.p8 \
  --asc-api-key-id "$ASC_KEY_ID" \
  --asc-api-key-issuer-id "$ASC_ISSUER_ID" \
  --asc-app-id "$PERSONAL_ASC_APP_ID"
```

Public-safe build and submit:

```bash
APP_VARIANT=beta eas build --profile beta --platform ios
eas submit --profile beta --platform ios --latest \
  --asc-api-key-path ./secrets/AuthKey.p8 \
  --asc-api-key-id "$ASC_KEY_ID" \
  --asc-api-key-issuer-id "$ASC_ISSUER_ID" \
  --asc-app-id "$BETA_ASC_APP_ID"
```

Then in App Store Connect: add the build to a TestFlight group and invite
testers (section 3.3). External groups need the Test Information form and,
once per version, Beta App Review.

Before any build that leaves your machine, run the repo checks:

```bash
cd hub-stack/app && npm run check
/srv/hub-data/scripts/hub-stack-gate.sh workspace/hub-stack
```

---

## 5. Caveats: what can still leak into a "safe" build

Feature-gating hides screens; it does not guarantee nothing personal is in
the binary. Before handing the beta build out, check these:

- **JS bundle strings.** The Hermes bundle is minified, but string
  literals survive: route names, error messages, accessibility labels,
  any hardcoded path or name. A beta build that still contains strings
  like "murmur" or a personal hostname tells a curious tester those
  features exist. Code inside `if (!PERSONAL_FEATURES_ENABLED)` branches is
  minified but still present; the metro-alias approach in section 2.4 is
  the only way to actually remove it.
- **Assets.** Icons and fonts are fine, but any image or asset that exists
  only for a personal feature ships in the binary even if never shown.
- **Source maps.** EAS uploads source maps of your build to Expo's
  servers, and `npx expo export` writes `.map` files locally. Do not share
  source maps of the beta build; they reconstruct the original source,
  comments included.
- **Build logs and metadata.** Nothing personal by default, but keep real
  ASC ids and tokens out of committed files entirely (the publish gate
  enforces this for the repo; keep it true for the build too).

How to check the actual beta bundle:

```bash
# Export the JS bundle exactly as a build would contain it:
APP_VARIANT=beta npx expo export --platform ios

# Grep it for anything personal (same spirit as the publish gate, but
# against the compiled output, not the source). Substitute your own
# server hostname and name for the placeholders — the literals must
# never appear in this repo:
grep -rIiE 'terminal|murmur|YOUR_SERVER_HOSTNAME|YOUR_NAME' dist/_expo/static/js/ | head

# Or extract it from the built .ipa if you have it:
unzip -o hub.ipa -d /tmp/ipa
grep -c 'murmur' /tmp/ipa/Payload/*.app/main.jsbundle
```

`hub-stack-gate.sh` scans the repo's source files for work content,
personal identifiers, hostnames, and secrets. It does not scan built
bundles, so run both: the gate for the repo, the grep above for the beta
artifact. If either finds the string you meant to strip, fix the gating,
rebuild, and re-check before distributing.
