# Release checklist

Items to complete before submitting a build to TestFlight or the App Store.
This captures the findings of the October 2026 compliance review so nothing is
forgotten before a TestFlight build. None of this is legal advice; it is an
operational checklist, not a legal opinion.

## 1. Bundle identifier

Confirm the bundle identifier in `app/app.json` (`expo.ios.bundleIdentifier`).
It ships as the placeholder `me.example.xavier` and is overridden from the
environment by `app/app.config.js` (`IOS_BUNDLE_IDENTIFIER`) — see
[PUBLISH-APP.md](PUBLISH-APP.md). App Store Connect rejects an id you do not
control, so make sure the build you upload carries a reverse-domain you own.
Keep it stable for the life of the app: changing it later creates a new app
identity, breaking TestFlight groups, purchases, and push configuration.

## 2. EAS project id and submit credentials

- `app.json` ships `expo.extra.eas.projectId`; `app/app.config.js` overrides it
  from `EAS_PROJECT_ID`. Publishing under your own Expo account means running
  `eas init` and using the id it produces for that account.
- The Expo owner likewise ships unset (`EXPO_OWNER`); EAS uses the account you
  log in with, unless the project belongs to an organisation.
- `app/eas.json` has placeholders for `ascAppId`, `ascApiKeyPath`,
  `ascApiKeyId`, and `ascApiKeyIssuerId`. Fill these with real values at submit
  time only. Never commit the API key file or the key/issuer/app id values to
  the repository.

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

**Run, 2026-10-02.** Checked the USPTO register (its search API, then filtered
locally), EUIPO (data API) and UKIPO, with TMview for cross-register coverage;
domains by registry WHOIS/RDAP. The full record, with serial numbers and
sources, is in [TRADEMARK.md](TRADEMARK.md).

- **United States — usable but weak.** No **live** US registration for plain
  "XAVIER" in Class 9 or Class 42; every plain-"XAVIER"-in-software application
  found was dead or abandoned. The nearest live filings are Marvin AI's
  "XAVIER AI" (Classes 9/42, filed and **under opposition**) and NVIDIA's
  "JETSON AGX XAVIER" (Class 9).
- **EU and UK — materially exposed.** NVIDIA owns plain "XAVIER" as a
  **registered** mark in **Classes 9 and 42**, in both the EU (EUIPO 017662933)
  and the UK (UK00917662933), and BGRP S.r.l. holds a second EU registration
  covering Class 42 (018718599). "XAVIER AI" is also applied for in the EU and
  opposed.
- **Domains.** `xavier.app` is registered (a parked lander) and
  `getxavier.com` redirects to Dext; `xavierhq.com` was free at registry level.
  So the obvious handles are gone.
- **Read.** Fine as the name of a private, non-commercial self-hosted project,
  but **not realistically ownable**, and a poor bet for anything commercial or
  marketed in the EU/UK. Keep a fallback name in mind; screened candidates with
  available handles are **Custos** and **Famulus** (`-hq.com` free at registry
  level), with **Penates** as a third.

Apple enforces name uniqueness on the App Store and can force a rename after
launch regardless of trademark rights, so hold a fallback before submitting
metadata.

## 6. Keep the store listing clean

Do **not** put "Muse", any other company's trademark, or the comparison from
[COMPARISON.md](COMPARISON.md) into the app name, subtitle, keywords, or
screenshots — App Store Review Guideline **2.3.7** bars another company's
trademark in metadata. The comparison belongs in the repository and in prose.
As it stands `app.json` sets the display name "Xavier" and ships no keywords or
subtitle, so the metadata is clean — keep it that way.

## 7. App Store Connect — DSA trader status

The EU Digital Services Act makes App Store Connect show a **trader-status**
banner that applies **account-wide**, not per app. Left unaddressed it leads to
the app's removal from the EU storefront. It is a legal declaration about the
account holder, so it has to be answered in App Store Connect by the account
holder; it cannot be set from the repository.

## 8. Legal disclaimer

Nothing in this checklist is legal advice. It records practical pre-submission
steps from a compliance review. Consult a lawyer for questions about
licensing, trademarks, or export compliance — in particular before any
commercial or EU/UK use of the name (section 5).
