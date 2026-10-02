# Release checklist

Items to complete before submitting a build to TestFlight or the App Store.
This captures the findings of the October 2026 compliance review so nothing is
forgotten before a TestFlight build. None of this is legal advice; it is an
operational checklist, not a legal opinion.

## 1. Bundle identifier

Confirm the bundle identifier in `app/app.json` (`expo.ios.bundleIdentifier`).
App Store Connect rejects an id you do not control, so if it is not a
reverse-domain you own, replace it now (for example `tld.domain.xavier`).
Keep it stable for the life of the app: changing it later creates a new app
identity, breaking TestFlight groups, purchases, and push configuration.

## 2. EAS project id and submit credentials

- `app.json` currently carries an `expo.extra.eas.projectId`. If you are
  publishing under your own Expo account, run `eas init` and commit the id it
  produces for that account.
- `app/eas.json` has placeholders for `ascApiKeyPath`, `ascApiKeyId`,
  `ascApiKeyIssuerId`, and `ascAppId`. Fill these with real values at submit
  time only. Never commit the API key file or the key id values to the
  repository.

## 3. Export compliance (`usesNonExemptEncryption`)

`usesNonExemptEncryption: false` in `app.json` is correct for this app: its
cryptography is Apple-OS-provided (HTTPS/TLS, Secure Enclave P-256 for the
device keys, Face ID for local authentication) and is used for
authentication, not for app-level payload encryption. Keep the setting as is.
Revisit it if app-level payload encryption is ever added.

## 4. TestFlight mechanics

- Internal testers (up to 100 App Store Connect users) need no review and can
  test as soon as the build finishes processing.
- The first build distributed to an external group goes through Beta App
  Review; after that, subsequent builds are usually approved quickly.
- Builds expire 90 days after upload and must be replaced for testing to
  continue.
- You may not compensate testers in any form for external TestFlight testing.

## 5. Trademark knock-out search

Run a knock-out search on the app name in the USPTO (TESS / the current USPTO
search system) and EUIPO before committing to it. Apple enforces name
uniqueness on the App Store and can force a rename after launch, so have a
fallback name ready. The app has been renamed to 'Xavier', which is far more
distinctive than the earlier 'Hub' / 'AGENT HUB' and reduces, but does not
eliminate, collision risk.

## 6. Legal disclaimer

Nothing in this checklist is legal advice. It records practical pre-submission
steps from a compliance review. Consult a lawyer for questions about
licensing, trademarks, or export compliance.
