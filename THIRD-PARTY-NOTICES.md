# Third-party notices

hub-stack's own code is MIT (see [LICENSE](LICENSE)). It depends on or bundles
the following third-party components. Reproduce these notices when
redistributing.

This file covers three groups:

1. Bundled and embedded assets (fonts, the xterm.js bundle, doc conventions).
2. The npm dependency set of the app in `app/` (declared dependencies plus
   everything installed under `app/node_modules`).
3. The Python dependency set of the server in `server/`.

## Summary

- There are no GPL, AGPL, or LGPL components anywhere in the dependency tree.
- Every npm package is under a permissive license (MIT, ISC, BSD-2, BSD-3,
  Apache-2.0, 0BSD, Unlicense, BlueOak-1.0.0, PSF, or CC0-1.0), with three
  exceptions called out below: lightningcss (MPL-2.0), caniuse-lite (CC-BY-4.0),
  and node-forge (dual BSD-3-Clause OR GPL-2.0).
- Every Python package is under a permissive license except certifi (MPL-2.0),
  which is called out below.

## Bundled and embedded assets

### xterm.js (MIT)

`app/src/terminal/xtermBundle.gen.ts` embeds a generated bundle of
**@xterm/xterm** (`^6.0.0`) and **@xterm/addon-fit** (`^0.11.0`)
(xtermjs/xterm.js), plus the xterm stylesheet. Those are the ranges the bundle
was vendored from; the generated constants record the exact installed version,
and a test in `app/src/terminal` pins the two together.

```
Copyright (c) 2017-2019 The xterm.js authors
Copyright (c) 2014-2016 SourceLair
Copyright (c) 2012-2013 Christopher Jeffrey
Licensed under the MIT License.
```

### JetBrains Mono (SIL Open Font License 1.1)

The UI monospace font ("HubMono") is **JetBrains Mono**, instanced to static
weights and renamed; it is embedded as base64 in the same terminal bundle.
The font is unmodified in licensing terms (rename only, no Reserved Font Name
declared by upstream).

```
Copyright 2020 The JetBrains Mono Project Authors (https://github.com/JetBrains/JetBrainsMono)
Licensed under the SIL Open Font License, Version 1.1. Full text: assets/fonts/OFL-JetBrainsMono.txt
```

### Onest (SIL Open Font License 1.1)

The UI sans font ("HubOnest") is **Onest**, copyright The Onest Project
Authors (https://github.com/simpals/onest), under OFL-1.1. Full license text
is in `assets/fonts/OFL-Onest.txt`.

The font is pulled from npm as `@fontsource-variable/onest` and instanced to
static weights by `app/scripts/instance-fonts.py`. Instancing is a
modification of the font data; OFL-1.1 permits this. If a Reserved Font Name
were ever declared by upstream, the renamed "HubOnest" build would need to
drop the RFN name, so check the upstream license file when updating the
package.

### Docs conventions (MIT)

The `> **For agentic workers:**` plan-header format used in some docs is
derived from **obra/superpowers** (MIT, © 2025 Jesse Vincent).

## npm dependencies (`app/`)

Counts below were captured by enumerating every top-level
`app/node_modules/*/package.json` in October 2026. Regenerate after any
dependency change (see the end of this section).

- 40 packages are declared in `app/package.json` (38 in `dependencies`, 2 in
  `devDependencies`). All are MIT except TypeScript (Apache-2.0).
- 725 packages are installed at the top level of `app/node_modules` when both
  direct and transitive dependencies are included.
- License distribution across those 725 packages: MIT 607, ISC 32, BSD-3-Clause
  20, Apache-2.0 14, BSD-2-Clause 9, BlueOak-1.0.0 5, MPL-2.0 3, Unlicense 2,
  0BSD 2, and one package each for MIT AND Apache-2.0, Python-2.0, CC-BY-4.0,
  MIT OR Apache-2.0, BSD-3-Clause OR GPL-2.0, and MIT OR CC0-1.0. One package
  (`exit@0.1.2`) has a null `license` field but ships a `LICENSE-MIT` file.

You do not need to reproduce a per-package notice for ordinary redistribution
of the app: app store builds ship bundled JavaScript, not `node_modules`. The
full license texts are present in `app/node_modules` and in each package's
metadata; keep them if you distribute the repository or a server image that
includes it.

### Declared dependencies

| Package | Version | License |
| --- | --- | --- |
| @react-native-async-storage/async-storage | 2.2.0 | MIT |
| @react-native-community/netinfo | 12.0.1 | MIT |
| @react-native/jest-preset | 0.86.3 | MIT |
| @sbaiahmed1/react-native-biometrics | 0.16.1 | MIT |
| @shopify/react-native-skia | 2.6.2 | MIT |
| @tanstack/query-async-storage-persister | 5.102.8 | MIT |
| @tanstack/react-query | 5.102.8 | MIT |
| @tanstack/react-query-persist-client | 5.102.8 | MIT |
| @types/jest | 29.5.14 | MIT |
| @types/react | 19.2.18 | MIT |
| babel-preset-expo | 57.0.11 | MIT |
| expo | 57.0.21 | MIT |
| expo-clipboard | 57.0.2 | MIT |
| expo-constants | 57.0.19 | MIT |
| expo-dev-client | 57.0.18 | MIT |
| expo-font | 57.0.3 | MIT |
| expo-glass-effect | 57.0.2 | MIT |
| expo-haptics | 57.0.2 | MIT |
| expo-image-picker | 57.0.19 | MIT |
| expo-linking | 57.0.9 | MIT |
| expo-notifications | 57.0.20 | MIT |
| expo-router | 57.0.20 | MIT |
| expo-splash-screen | 57.0.8 | MIT |
| expo-status-bar | 57.0.1 | MIT |
| expo-symbols | 57.0.2 | MIT |
| expo-updates | 57.0.22 | MIT |
| expo-web-browser | 57.0.2 | MIT |
| jest | 29.7.0 | MIT |
| jest-expo | 57.0.5 | MIT |
| react | 19.2.3 | MIT |
| react-native | 0.86.3 | MIT |
| react-native-gesture-handler | 2.32.0 | MIT |
| react-native-keyboard-controller | 1.21.9 | MIT |
| react-native-reanimated | 4.5.1 | MIT |
| react-native-safe-area-context | 5.7.0 | MIT |
| react-native-screens | 4.26.2 | MIT |
| react-native-webview | 13.16.1 | MIT |
| react-native-worklets | 0.10.1 | MIT |
| typescript | 6.0.3 | Apache-2.0 |
| zustand | 5.0.15 | MIT |

Versions are the ones resolved in `app/node_modules` at capture time and may
differ from the ranges in `app/package.json`.

### Exceptions to the permissive-default picture

These are the only npm packages whose license needs individual attention. None
of them prevents redistribution; each just needs the notice reproduced.

**lightningcss (MPL-2.0)** and its native binaries
(`lightningcss-linux-x64-gnu`, `lightningcss-linux-x64-musl`). MPL-2.0 is
weak, file-level copyleft: if you modify the library's own source files, those
modifications must stay MPL-2.0, but the rest of the app is unaffected.
Attribution is sufficient for ordinary use and redistribution.

**caniuse-lite (CC-BY-4.0)**. Browser compatibility data used by the Babel and
browserslist toolchain. CC-BY-4.0 requires attribution when the data is
redistributed; it is a build-time toolchain input, not app runtime code.

**node-forge 1.4.0 (BSD-3-Clause OR GPL-2.0)**. Dual licensed; this project
elects the BSD-3-Clause option, which keeps the tree free of copyleft. It
appears only in the development chain (it is a dependency of dev tooling, not
of the shipped app), so the election is conservative even so.

Also note, for completeness rather than concern:

- `exit@0.1.2` reports a null `license` field but contains a `LICENSE-MIT`
  file naming "Cowboy" Ben Alman; treat it as MIT.
- `type-fest@0.7.1` is (MIT OR CC0-1.0); either option is permissive.
- `@expo-google-fonts/material-symbols` is (MIT AND Apache-2.0); both apply.

### Regenerating the npm enumeration

From `app/`, after `npm install`, list license frequencies with:

```
for d in node_modules/*/ node_modules/@*/*/; do
  node -p "require('./${d%/}/package.json').license ?? 'UNKNOWN'"
done | sort | uniq -c | sort -rn
```

or use any license-report tool (for example `license-checker`) against
`app/package.json`.

## Python server dependencies (`server/`)

Counts below were captured from
`server/.venv/lib/python3.13/site-packages/*/.dist-info/METADATA` in October
2026: 37 installed distributions. "Runtime" means required by
`server/requirements.txt`, by the packages it pins (including the
`uvicorn[standard]` extras), or by a direct import in `server/` code.
"Dev/test" means present in the virtualenv but only reachable from pytest and
related tooling. The whole virtualenv ships in the server image, so all of
these are distributed even when they are dev/test only.

| Package | Version | License | Role |
| --- | --- | --- | --- |
| PyYAML | 6.0.3 | MIT | runtime |
| Pygments | 2.21.0 | BSD-2-Clause | dev/test |
| annotated-doc | 0.0.5 | MIT | runtime |
| annotated-types | 0.8.0 | MIT | runtime |
| anyio | 4.15.1 | MIT | runtime |
| cbor2 | 5.9.0 | MIT | runtime |
| certifi | 2026.7.22 | MPL-2.0 | dev/test (see below) |
| cffi | 2.1.1 | MIT-0 | runtime |
| click | 8.5.0 | BSD-3-Clause | runtime |
| cryptography | 50.0.2 | Apache-2.0 OR BSD-3-Clause | runtime |
| fastapi | 0.142.2 | MIT | runtime |
| h11 | 0.16.0 | MIT | runtime |
| httpcore | 1.0.9 | BSD-3-Clause | dev/test |
| httptools | 0.8.0 | MIT | runtime |
| httpx | 0.28.1 | BSD-3-Clause | dev/test |
| idna | 3.20 | BSD-3-Clause | runtime |
| iniconfig | 2.3.0 | MIT | dev/test |
| opentelemetry-api | 1.45.0 | Apache-2.0 | runtime |
| packaging | 26.3 | Apache-2.0 OR BSD-2-Clause | dev/test |
| pluggy | 1.6.0 | MIT | dev/test |
| pyOpenSSL | 26.4.0 | Apache-2.0 | runtime |
| pyasn1 | 0.6.4 | BSD-2-Clause | runtime |
| pyasn1_modules | 0.4.2 | BSD | runtime |
| pycparser | 3.0 | BSD-3-Clause | runtime |
| pydantic | 2.13.5 | MIT | runtime |
| pydantic_core | 2.46.5 | MIT | runtime |
| pytest | 8.4.2 | MIT | dev/test |
| python-dotenv | 1.2.4 | BSD-3-Clause | runtime |
| starlette | 1.7.0 | BSD-3-Clause | runtime |
| typing-inspection | 0.4.4 | MIT | runtime |
| typing_extensions | 4.16.0 | PSF-2.0 | runtime |
| tzdata | 2026.4 | Apache-2.0 | runtime |
| uvicorn | 0.54.0 | BSD-3-Clause | runtime |
| uvloop | 0.23.0 | MIT | runtime |
| watchfiles | 1.3.0 | MIT | runtime |
| webauthn | 2.8.0 | BSD-3-Clause | runtime |
| websockets | 17.1 | BSD-3-Clause | runtime |

### certifi is MPL-2.0

**certifi** (the CA certificate bundle used by the HTTP stack) is licensed
under the Mozilla Public License 2.0. MPL-2.0 is weak, file-level copyleft:
modifications to certifi's own files must stay MPL-2.0, and the license notice
must be preserved, but linking or bundling it does not affect the license of
the rest of the server. Attribution is sufficient. This is called out here
because the server image is distributed and certifi ships inside it.

### Dual licenses (permissive options taken)

- **cryptography**: Apache-2.0 OR BSD-3-Clause; the BSD-3-Clause option is
  elected for notice purposes.
- **packaging**: Apache-2.0 OR BSD-2-Clause; either option is permissive.
- **cffi**: MIT-0 (a MIT variant with no attribution requirement).

No Python package in the tree is GPL, AGPL, or LGPL.
