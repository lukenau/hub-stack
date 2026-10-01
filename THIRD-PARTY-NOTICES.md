# Third-party notices

hub-stack's own code is MIT (see [LICENSE](LICENSE)). It bundles or embeds the
following third-party components. Reproduce these notices when redistributing.

## xterm.js (MIT)

`app/src/terminal/xtermBundle.gen.ts` embeds a generated bundle of
**@xterm/xterm** and **@xterm/addon-fit** (xtermjs/xterm.js), plus the xterm
stylesheet.

```
Copyright (c) 2017-2019 The xterm.js authors
Copyright (c) 2014-2016 SourceLair
Copyright (c) 2012-2013 Christopher Jeffrey
Licensed under the MIT License.
```

## JetBrains Mono (SIL Open Font License 1.1)

The UI monospace font ("HubMono") is **JetBrains Mono**, instanced to static
weights and renamed; it is embedded as base64 in the same terminal bundle.
The font is unmodified in licensing terms (rename only, no Reserved Font Name
declared by upstream).

```
Copyright 2020 The JetBrains Mono Project Authors (https://github.com/JetBrains/JetBrainsMono)
Licensed under the SIL Open Font License, Version 1.1. Full text: assets/fonts/OFL-JetBrainsMono.txt
```

## Onest (SIL Open Font License 1.1)

The UI sans font is **Onest**, under OFL-1.1 — full text in
`assets/fonts/OFL-Onest.txt`.

## Docs conventions (MIT)

The `> **For agentic workers:**` plan-header format used in some docs is
derived from **obra/superpowers** (MIT, © 2025 Jesse Vincent).
