# Xavier — native app (Expo / React Native)

The client half of hub-stack. **Xavier** is both the app's name (what shows on
the home screen) and the assistant it is built around; **hub-stack** / "hub" is
the product family — the repo and the `hub-api` server. It pairs with a hub-api
server you run yourself and
gives you a native iOS app for the hub: chat, brief, calendar, and the ops views
your server exposes.

## Develop

```bash
cd app
npm install
npm run typecheck     # tsc --noEmit
npm test              # npm run check, then jest (jest-expo preset)
npx expo start        # dev client / Expo Go
```

Point the app at your server in **Settings → Server** (base URL + API token printed
by `install.sh`), then pair the device. See
[`../docs/CONNECT-APP.md`](../docs/CONNECT-APP.md).

## Build & ship

`eas.json` holds the EAS build/submit profiles. **App Store Connect credentials and
identifiers are placeholders** — fill in your own Apple team key, key id, issuer id
and app id before submitting.

```bash
npx eas build  --profile production --platform ios
npx eas submit --profile production --platform ios
```

For a build with personal features stripped out (a "public-safe" variant you can
hand to beta testers while keeping the personal build for yourself), see
[`../docs/PUBLIC-BUILD.md`](../docs/PUBLIC-BUILD.md).

## Layout

| Path | What |
|---|---|
| `app/` | Expo Router routes (home, chat, calendar, automations, ops…) |
| `src/` | components, lib, chat rendering, theme |
| `modules/` | local native modules (e.g. `paste-control`) |
| `assets/` | icons, fonts |
