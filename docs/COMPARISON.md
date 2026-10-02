# How this compares to hosted personal agents

hub-stack is a **self-hosted** personal agent: the server runs on hardware you
control, the app is yours to build, and the model is whatever you point it at.

The best-known hosted example right now is Meta's **Muse**, launched 8 September
2026. It is a useful reference point because the feature shape is so close to
this one, and the difference is almost entirely about custody.

Nothing here is affiliated with, endorsed by, or sponsored by Meta. Product
names are used descriptively to compare, and they are checked against
[the sources listed below](#sources). If you are the owner of a product named
here and something is wrong or out of date, open an issue.

## The short version

| | hub-stack (this project) | Meta Muse |
|---|---|---|
| Where it runs | Your machine, your network | Meta's cloud (a per-user VM in Meta data centres) |
| Who can operate it | You | Meta |
| Model choice | Any model through your own OpenRouter key, or local weights | Meta's Muse Spark model |
| Source | MIT, readable and forkable | Closed |
| Self-hosting | The point of the project | Not offered |
| Reaching your own machine | Terminal, files, and tmux sessions on your host over your private mesh | A cloud browser; no local terminal or filesystem control |
| Cost shape | Your hardware, plus whatever your model usage costs | Free tier, with paid subscription plans for heavier use |

Read that table as a statement about architecture, not about quality. A hosted
product with a large team behind it will beat a solo project on polish, support,
and the number of services it can reach on day one. What you gain here is that
nobody else holds the data.

## Why custody is the whole argument

Both designs put an agent on a dedicated machine with a terminal, a filesystem,
and connectors to your accounts. The difference is who else can reach that
machine.

- **Hosted:** the operator states a policy about who at the company can look at
  your data, and that policy is enforced by people and process, not cryptography.
  Muse says plainly that it "does not prevent Meta from accessing data when
  necessary to support, secure or operate the service." A confidential mode with
  a key only you hold is announced but not yet generally available.
- **Self-hosted:** there is no policy question. The data is on a disk you own,
  behind a network only your devices are on. The honest trade is that you are the
  operator: patches, backups, and mistakes are yours.

Neither is wrong. They are different answers to "how much do I trust the
operator."

## Things this project does not have

Stated plainly, because a comparison that only lists advantages is marketing:

- No hosted option, no support contract, no SLA. If it breaks, that is you.
- One maintainer. If they stop, the project stops with them.
- iOS only, today.
- Fewer ready-made connectors than a funded product. See
  [SERVICES.md](SERVICES.md) for what exists and what you bring yourself.
- No mobile onboarding wizard for a non-technical user. Setup involves a
  terminal.

## Sources

Verified 2026-10-01:

- Meta, "Introducing Muse" — <https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/>
- Meta AI Research, "How We Built Safety Into Muse" — <https://research.meta.ai/blog/security-and-safety-for-ai-agents-our-approach-with-muse>
- Meta, "How We Designed Muse" — <https://introducing.muse.ai/>

If any of the above changes, this page is wrong and should be corrected.

## A practical note on naming

Product names belong to their owners. This page uses them nominatively, to
refer to the products themselves. Do not copy this comparison into app store
listings or metadata: Apple's App Store Review Guidelines (2.3.7) prohibit
using another company's trademark in your app's name, subtitle, or metadata.
Keep it in the repository and in prose.
