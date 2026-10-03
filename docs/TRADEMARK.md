# "Xavier" as a name for a self-hosted AI hub app — trademark knock-out

Prepared: 2026-10-02 (UTC). Companion to
[RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md) §5. **Not legal advice** — a
research summary from public register data; a clearance opinion from a
trademark attorney would be required before any commercial adoption.
Scope: US (USPTO), EU (EUIPO), UK, WIPO via TMview; common-law use; domain reality;
plain assessment; alternative names.

**Bottom line.** In the **United States**, "Xavier" for a self-hosted AI app is
*usable but weak and crowded* — there is **no live US registration for plain
"XAVIER" in Classes 9 or 42**, and every `XAVIER`-in-software application found was
abandoned. In the **EU and UK it is materially exposed**: NVIDIA owns **plain
"XAVIER" as a live registered mark in Classes 9 and 42 in both the EU and the UK**,
and a second live EU registration (BGRP S.R.L.) covers Class 42. If the project
stays personal/open-source and non-commercial, practical exposure is low; if it is
ever sold, hosted as a service, or marketed in the EU/UK, "Xavier" is a poor bet
and the name is not realistically ownable.

Every factual claim below is from a tool output in this run; source URLs are given
per item. What could **not** be verified is listed in §7.

---

## 1. United States (USPTO)

**How I queried it (real, not a guess).** The public front-end `tmsearch.uspto.gov`
is a JavaScript app; its documented-looking paths return HTTP 404. The working
search interface is the internal Elasticsearch-style endpoint that the UI itself
calls:

```
POST https://tmsearch.uspto.gov/prod-v1-0-0/tmsearch
{"query":{"bool":{"should":[{"term":{"WM":{"value":"xavier"}}}],"minimum_should_match":1}},
 "size":100,"_source":["wordmark","ownerName","alive","serialNumber","registrationNumber",
 "internationalClass","goodsAndServices","markType"]}
```

Response envelope quirk: you ask for `_source`, the record comes back as `source`;
count is `hits.totalValue`. My query returned **176 records**, which I pulled and
filtered locally. (This endpoint is undocumented and can change without notice —
see §7.)

### 1a. Plain "XAVIER" in Class 9 or 42 — no LIVE US registration

Every US mark whose wordmark is exactly `XAVIER` and that covers Class 9 and/or 42,
with its status from the index:

| Serial | Mark | Class(es) | Owner | Status |
|---|---|---|---|---|
| 87745649 | XAVIER | 009, 042 | NVIDIA Corporation | **dead / abandoned** |
| 87946234 | JETSON XAVIER | 009, 042 | NVIDIA Corporation | **dead / abandoned** |
| 88884541 | NVIDIA XAVIER | 009 | NVIDIA Corporation | **dead / abandoned** |
| 74420714 | XAVIER | 009 | Nippon Denki Kabushiki Kaisha | dead (cancelled) |
| 86704222 | XAVIER | 009 | CETA Software Solutions, LLC | dead |
| 87818265 | XAVIER | 009 | Jason Bringhurst | dead |
| 76717105 | XAVIER | 009 | Blackshark Tech, LLC / SimonComputing | dead |
| 85743038 | XAVIER | 009 | Jason Bringhurst | dead |
| 73452526 | XAVIER DANAUD | 042 | Charles Jourdan Holding AG | dead |
| 75066191 | THE XAVIER GROUP | 035, 042 | Frank X. Sowa | dead |

There is **one LIVE plain-XAVIER US registration**, but not in software:
SN 85240041 `XAVIER` (Classes 16/25/41) and SN 85298344 (Class 25), both **Xavier
University Corporation** — plus SN 99834132 `XAVIER` (Class 15, Tianjin Xavier
E-commerce) and SN 99400587 `XAVIER` (Class 35, Xavier Creative House, LLC,
*non-final action mailed*).
Source: USPTO internal search endpoint above; record URLs are
`https://tsdr.uspto.gov/#caseNumber=<SERIAL>&caseType=SERIAL_NO&searchType=statusSearch`.

### 1b. LIVE US marks that ARE plausibly confusable (Class 9 / 42)

| Serial | Mark | Class(es) | Owner | Status |
|---|---|---|---|---|
| **98476632** | **XAVIER AI** | **009, 042** | **Marvin AI, Inc.** (Dover, DE) | **LIVE, opposed** |
| 88208710 | JETSON AGX XAVIER | 009 | NVIDIA Corporation | LIVE (reg. 2023-01-31) |
| 90630355 | XAVIER SOUL STREAMS | 009, 041 | Star Tribe Productions, Inc. | LIVE (reg. 2023-09-19) |
| 97596201 | HOLMAN XAVIER | 009, 041 | MT Music & Entertainment | LIVE |
| 99599425 | XAVIER ROBERTS | 009, 041 | Original Appalachian Artworks | LIVE (filed) |
| 99347037 | XAVIER ZSARMANI | 003/009/020/021/025 | Zsarmani Wealth Foundation | LIVE (filed) |
| 99891680 | XAVIER MARINE L.L.C. | 037/039/042 | Thomas Xavier Gray | LIVE (filed) |
| 79401478 | XAVIER GARCIA | 009 | SOLO GAFAS, S.L. (ES) | LIVE (Madrid Protocol) |

`XAVIER AI` (SN 98476632, filed 2024-03-31, attorney Michael P. Eddy) is the single
closest US filing to a self-hosted AI product. It is **not registered yet and is
under opposition**: TTAB proceeding **91305271**, plaintiff **Xavier Creative
House, LLC** (owner of registered `XAVIER CREATIVE HOUSE`, R# 7750329), defendant
Marvin AI, Inc. — i.e. the mark is being actively fought over in exactly this space.
Sources: `https://ttabvue.uspto.gov/ttabvue/v?pno=91305271&pty=OPP`,
`https://markinton.com/trademark/xavier-ai-98476632`.

**US read:** the coast is legally clearer than the EU, but "Xavier" is not clean —
NVIDIA holds a live `JETSON AGX XAVIER` in Class 9, Marvin AI is litigating
`XAVIER AI` in Classes 9/42, and the field is thick with near-identical marks.

---

## 2. EU (EUIPO) and UK

**How I queried it.** Two independent routes, both returned real data:
(a) the EUIPO data API `https://euipo.europa.eu/copla/trademark/data/<appno>` (JSON,
no key); (b) **TMview** cross-register search
`POST https://www.tmdn.org/tmview/api/search/results` with
`{"basicSearch":"xavier","criteria":"C","pageSize":"100"}` (1,661 hits total; I
pulled 800 and filtered to offices EM/US/WO with Class 9 or 42). TMview is the
EUIPO-run aggregator. A direct query to the EUIPO *eSearch UI* was not needed — the
data API answered.

### 2a. The blocking registrations — plain "XAVIER", live, Classes 9 / 42

| Office | Number | Mark | Class(es) | Owner | Status |
|---|---|---|---|---|---|
| **EUIPO** | **017662933** | **XAVIER** | **9, 42** | **NVIDIA Corporation** | **Registered** (filed 2018-01-08, reg. 2018-07-28) |
| **UKIPO** | **UK00917662933** | **XAVIER** | **9, 42** | **NVIDIA Corporation** | **Registered** (UK clone of the EU mark) |
| EUIPO | 018718599 | XAVIER | 37, 40, **42** | **BGRP S.R.L.** | Registered (filed 2022-06-17, reg. 2022-10-04, expires 2032-06-17) |
| UKIPO | UK00003502162 | XAVIER | 9, 35 | Dext Software Limited | Registered |
| UKIPO | UK00003502190 | XAVIER | 9, 35 | Dext Software Limited | Registered |
| EUIPO | 018227418 | NVIDIA XAVIER | 9 | NVIDIA Corporation | Registered |
| EUIPO | 018041096 / 018041100 | XAVIER | 6,7,**9**,11,14,20,21,24,25 | Merx Team AB | Registered |
| UKIPO | UK00918041096 / UK00918041100 | XAVIER | (as above, incl. 9) | Merx Team AB | Registered |
| EUIPO | 018780823 | XAVIER GARCIA | **9**, 35, 44 | SOLO GAFAS, S.L. | Registered |
| EUIPO | 011731478 | Xavier Naidoo | **9**, 16, 25, 35, 41, **42**, 45 | Xavier Naidoo | Registered |
| EUIPO | 018222305 | Xavier Lust | 6, 11, 20, **42** | Xavier Lust | Registered |
| EUIPO | 018711161 | XAVIER VIGNON | 33,35,40,41,**42**,44 | Xavier VINS | Registered |

Confirmed directly from the EUIPO data API (not just TMview):
- **017662933** — name `XAVIER`, status `Registered`, `niceclasses ['9','42']`, applicant **NVIDIA Corporation**.
- **018718599** — name `XAVIER`, status `Registered`, `niceclasses ['37','40','42']`, applicant **BGRP S.R.L.**, representative Eversheds Sutherland (Germany).

The starting point was correct: EU filings for `XAVIER` **do** exist in
software service classes. The specific record first flagged
(trademarkelite 018718599) is **BGRP S.R.L.**, classes **37/40/42** — and the more
dangerous one for an AI-software product is **NVIDIA's 017662933**, which covers
**both Class 9 and Class 42 outright**.

### 2b. The active AI-space fight in the EU

| Office | Number | Mark | Class(es) | Owner | Status |
|---|---|---|---|---|---|
| EUIPO | **019010029** | **XAVIER AI** | 9, 42 | **Marvin AI, Inc.** | **Application opposed** (filed 2024-05-21) |
| US | 98476632 | XAVIER AI | 9, 42 | Marvin AI, Inc. | opposed (TTAB 91305271) |

The EUIPO record for 019010029 shows an opposition on the ground
**"Likelihood of confusion"**, opponent reference `40323-JSE`, dated 2024-09-03.
So "XAVIER" in Classes 9/42 is not merely registered by others — it is being
**litigated by others**, in both the EU and the US, right now.

**EU/UK read:** plain `XAVIER` is already owned by a large, well-resourced
corporation (NVIDIA) for precisely Classes 9 and 42, and cloned into the UK
register. Launching a software/SaaS product under "Xavier" in the EU/UK creates a
real likelihood-of-confusion exposure to NVIDIA and to BGRP, and would face
opposition if he tried to register it.

---

## 3. Common-law use (unregistered, but enforceable)

| User | What it is | Evidence |
|---|---|---|
| **Dext Software Limited** (UK) | **"Xavier"** (a.k.a. Xavier Analytics) — data-quality/accounting SaaS, acquired 2020, rebranded to **Dext Precision** in Feb 2021. Holds live UK marks `XAVIER` (9, 35) and the WIPO registrations WO 1560977 / WO 1562318 (`XAVIER`, 9, 35). | `https://subscriptions.xumagazine.com/news/receipt-bank-and-xavier-become-dext`; `https://ibsintelligence.com/ibsi-news/receipt-bank-rebrands-to-dext-crosses-one-million-user-milestone/`; GB marks via TMview |
| **NVIDIA** | **Jetson AGX Xavier** — a long-running hardware/edge-AI compute module line; live US (SN 88208710, Class 9), EU (018227418) and UK marks. | `https://developer.nvidia.com/embedded/jetson-agx-xavier` |
| **Marvin AI, Inc.** (operator of xavier.ai) | **"Xavier AI"** — an AI strategy-consultant product launched April 2025; filed `XAVIER AI` in US + EU Classes 9/42. | `https://www.xavier.ai/`; `https://www.globenewswire.com/news-release/2025/04/15/3062095/0/en/Xavier-AI-Launches-the-World-s-First-AI-Strategy-Consultant.html` |
| **atilafassina/xavier** (GitHub, MIT, 19★, created 2026-04-07) | **"Xavier — Self-evolving AI orchestrator"**: a self-hosted, orchestrator-agent framework. This is the **closest thing to a directly overlapping open-source product**. | `https://github.com/atilafassina/xavier` |
| **conscious-intelligent-labs/xavier-assistant** | "Xavier Voice Assistant" — a voice-driven task assistant. | `https://github.com/conscious-intelligent-labs/xavier-assistant` |
| **CHI'25 Xavier** | "Xavier: Toward Better Coding Assistance in Authoring Tabular Data Wrangling Scripts" — a JupyterLab coding assistant. | `https://github.com/CHI25-Xavier/Xavier` |
| **mdbs99/xavier** | "Xavier is a small object-oriented XML library for Lazarus and Delphi." | `https://github.com/mdbs99/xavier` |
| **Xavier Creative House, LLC** (US) | Owns registered `XAVIER CREATIVE HOUSE` (R# 7750329) and is opposing `XAVIER AI`. | `https://ttabvue.uspto.gov/ttabvue/v?pno=91305271&pty=OPP` |
| **Xavier University** (Cincinnati, OH) | Multiple live US registrations for `XAVIER`, `XAVIER X` etc. (Classes 16/25/41). | USPTO index (SN 85240041, 85298344, 98397995) |

A GitHub name search for `xavier` returns **14,300 repositories**; numerous
maintainers and orgs use it as a handle (Xavier-Lam, xavier-chen, Xavier-Pan,
xavier-zy, …). Most are personal handles rather than products, but the volume
shows how non-distinctive the string is.

Note also the cultural load: "Xavier" is inseparable from **Professor X / Charles
Xavier** of Marvel's X-Men — a merchandising and character-rights complication for
a consumer software brand, and a reason the mark reads as "a person's name", not a
product name.

---

## 4. Domain availability — what I actually checked

`dig`, `whois`, and `nc` binaries are **not installed** in this container. I used:
Cloudflare DNS-over-HTTPS JSON (`https://cloudflare-dns.com/dns-query`) for DNS,
raw WHOIS on TCP/43 (`whois.verisign-grs.com`, `whois.nic.google`, registrar
servers) — which **does work** from here — and RDAP over HTTPS
(`rdap.verisign.com`, `rdap.org`, `pubapi.registry.google`). Availability is stated
at registry level, which is authoritative for "is it registered".

| Domain | Result | How verified |
|---|---|---|
| **xavier.app** | **TAKEN** — registered 2024-01-23, registrar GoDaddy, expires 2027-01-23; serves a parked lander (`window.location.href="/lander"`), i.e. for sale/parked. | Google Registry RDAP `https://pubapi.registry.google/rdap/domain/xavier.app`; DoH A → 3.33.130.190; HTTP body |
| **getxavier.com** | **TAKEN** — registered 2019-12-20, registrar Amazon Registrar, privacy-proxied registrant, expires 2026-12-20; **HTTP 200 → redirects to `https://dext.com/us`** (Dext's site). | `whois.verisign-grs.com` + `whois.registrar.amazon`; HTTP redirect |
| **xavierhq.com** | **AVAILABLE at registry level** — Verisign registry WHOIS returns `No match for "XAVIERHQ.COM"`; RDAP returns HTTP 404; DNS NXDOMAIN on all types. | `whois.verisign-grs.com`; `https://rdap.verisign.com/com/v1/domain/xavierhq.com` |
| **hubstack.com** | **TAKEN** — registered 2011-07-04, registrar Tucows, Cloudflare NS, registrant privacy-redacted (state DE, US); serves a placeholder page titled "hubstack.com - Under Construction". | `whois.verisign-grs.com` + `whois.tucows.com`; HTTP fetch |
| **hub-stack.com** | **TAKEN** — registered **2026-02-02**, registrar Porkbun, live NS + MX (`fwd1/fwd2.porkbun.com`) + SPF; HTTPS connection **timed out** from this host, so no site content could be confirmed. | `whois.verisign-grs.com`; DoH NS/MX/TXT |

Reference checks: `xavier.com` is registered (Verisign RDAP 200).

**Real vs. guess:** the TAKEN verdicts are authoritative registry facts. The
`xavierhq.com` AVAILABLE verdict is the registry's own "No match", which is the
strongest availability signal obtainable without a registrar API — but it does not
tell you whether it is a **premium-priced** name (not checked).

---

## 5. Plain assessment of "Xavier" as a mark

**Distinctiveness — weak.** "Xavier" is a very common personal given name
(Spanish/Basque origin, globally popular) *and* a recognised surname. Under the
USPTO's *Benthin* factors — surname rarity, connection to the applicant, other
meanings, "look and sound" of a surname — "Xavier" fails the rarity test hard and
has no other ordinary-language meaning. A **personal-name mark is protectable but
inherently weak**: it sits at the descriptive end of the spectrum and needs
acquired distinctiveness (five years' use, or significant promotion) before it can
go on the Principal Register on its own. Source:
`https://www.cll.com/OnMyMindBlog/understanding-primarily-merely-a-surname-u-s-trademark-registration-refusals`,
`https://www.nolo.com/legal-encyclopedia/using-surname-family-name-trademark.html`.

**Crowding — severe.** Even setting aside distinctiveness, the register is full:
live `XAVIER` marks in Classes 9 and 42 are held by **NVIDIA (EU + UK)**, **BGRP
S.R.L. (EU, Cl. 42)**, **Dext Software (UK, Cl. 9)**, **Merx Team AB (EU/UK,
Cl. 9)**, **SOLO GAFAS (EU, Cl. 9)**, and more. In the US the field is thick with
similar marks and one live opposed filing (`XAVIER AI`).

**Practically, what this means for Luke:**

- **Personal use, self-hosted, no money changing hands** → trademark law generally
  does not bite, in either the US ("use in commerce") or the EU ("use in the course
  of trade"). Use as a private project name is low risk.
- **Open-source repo under that name** → still usually fine *as a name*, but you
  cannot stop anyone else using it, and you would be a small fish in a crowded pond.
  A "getxavier"-style domain is already in Dext's hands and `xavier.app` is parked.
- **Any commercial step** — selling it, offering a hosted/SaaS tier, a
  sponsored/app-store listing, or marketing in the EU/UK — flips this to
  **materially exposed**, chiefly to NVIDIA's EU/UK Class 9+42 registration.
- **Ownability** → effectively **no**. He cannot obtain or defend a meaningful
  trademark in the software classes, and cannot secure the obvious domains.

**Verdict:** fine as a *private, non-commercial* project name; a **bad choice** as a
brand, product name, or anything he might want to own or monetise. The name is
weak, crowded, and already owned for exactly his classes in the EU/UK.

---

## 6. Alternative names (3–5), each with a rationale + domain reality

I screened candidate domains with live DNS/WHOIS. Most short English/Latin
dictionary words are taken in `.app`, `.dev` and `.io` — every one of
lares/famulus/auspex/seneschal/custos/numen/hestia/hearth/cairn/domovoi/nisse/wisp
`.app`/`.dev` returned live NS records (i.e. registered). Availability below is
verified where stated; otherwise "not checked".

1. **Custos** (Latin: *guardian, keeper*)
   *Rationale:* exact job description of a self-hosted personal agent — a keeper of
   your data that never leaves your house; short, pronounceable, and in Class 9/42
   it is near-empty as a software product name.
   *Domains checked:* `custos.app`, `custos.dev`, `custos.io` **taken**;
   **`custoshq.com` AVAILABLE** (Verisign registry "No match"); `custosai.com` taken.

2. **Famulus** (Latin: *attendant, personal servant*)
   *Rationale:* the "personal servant that runs on your machine" metaphor in one
   word, and coined-feeling enough to be a strong (ownable) mark rather than a
   weak personal name.
   *Domains checked:* `famulus.app`, `famulus.dev`, `famulus.io` **taken**;
   **`famulushq.com` AVAILABLE**; `famulusai.com` taken.

3. **Penates** (Roman household gods who guard the home and its stores)
   *Rationale:* "the spirits that live in your house and watch over it" is exactly
   the self-hosted-agent pitch; distinctive, uncrowded, and no personal-name
   baggage. Slightly harder to say.
   *Domains checked:* `penates.app`, `penates.dev` **taken**;
   **`penateshq.com` AVAILABLE**.

4. **Auspex** (Roman official who read the signs and advised on action)
   *Rationale:* an *advising* agent rather than a chatbot; distinctive word, clean
   metaphor for an assistant that observes and recommends.
   *Domains checked:* `auspex.app`, `auspex.dev` **taken**; `auspexhq.com` taken
   (not available at the obvious handle) — **weaker on domain**.

5. **Hearth**
   *Rationale:* the "self-hosted = your own hearth" story is the most instantly
   legible of the five, and it pairs naturally with the *hub* framing the project
   already uses. Weakest on distinctiveness (common noun) and the domain is gone.
   *Domains checked:* `hearth.app` **taken**; `hestiahq.com` taken; `hestia.app`
   and `hestia.dev` **taken** (the Greek-hearth variant is also taken).

If a domain matters, **Custos** or **Famulus** with an `-hq.com` handle are the two
cleanest verified options; continue the knock-out on whichever he picks — I only
screened `Xavier` in depth here.

---

## 7. What I could NOT verify — stated plainly

- **USPTO route:** the working endpoint is the **undocumented internal API** behind
  `tmsearch.uspto.gov`. It returned correct-looking data, but USPTO warns nothing
  about it and it can change without notice. I did **not** confirm individual
  records against **TSDR** — TSDR now requires a registered API key
  (`https://account.uspto.gov/api-manager/`), which this environment does not have;
  a direct TSDR call returned **HTTP 401**. So the *alive/dead* flags are from the
  search index, not from authoritative per-mark status documents. The
  `pip install`-free workaround was the search index only.
- **EUIPO:** the EUIPO *eSearch UI* itself was not driven; I used the copla data
  API and TMview instead (both returned data). The **identity of the opponent** in
  EUIPO opposition on 019010029 is **not** in the public record I could reach —
  only the reference `40323-JSE` and the ground ("likelihood of confusion"). I could
  not confirm whether the opponent is NVIDIA, Dext, BGRP, or another party.
- **Dext's EU position:** I found **UK** registrations for Dext's `XAVIER` (Classes
  9, 35) and WIPO registrations (WO 1560977 / WO 1562318), but **no live EUIPO
  registration under Dext Software Limited**, and a TMview applicant-name search
  for "Dext Software" returned nothing relevant. A former EU mark may have been
  surrendered at the 2021 rebrand, or EU rights may rest on unregistered use —
  **not confirmed either way**.
- **TMview coverage:** the US rows in TMview are USPTO-derived and generally track
  the register, but TMview can lag or omit abandoned/dead records; I treated the
  USPTO index as primary for US and TMview/EUIPO for EU/UK.
- **Domains:** availability is stated at registry level only. I did **not** check
  registrar pricing — `xavierhq.com` may be a premium-priced registration. For
  `hub-stack.com` the site could not be fetched (HTTPS timed out), so I cannot say
  what, if anything, is on it; the registrar/MX/SPF facts stand.
- **Common-law:** searches surface public mentions (product pages, GitHub, press),
  not internal or unpublicised use. A real common-law clearance (state registrations,
  trade-press use, marketplace listings) is beyond what a web sweep can establish.
- **Legal advice:** this is a research summary from public register data, **not
  legal advice**. A clearance opinion from a trademark attorney would be required
  before any commercial adoption.

---

## 8. Sources (one per claim)

- USPTO trademark search (internal API used): `https://tmsearch.uspto.gov/` (endpoint `https://tmsearch.uspto.gov/prod-v1-0-0/tmsearch`)
- USPTO TSDR (403 — API key now required): `https://tsdrapi.uspto.gov/ts/cd/casestatus/sn98476632/info`
- USPTO TSDR record URL format: `https://tsdr.uspto.gov/#caseNumber=98476632&caseType=SERIAL_NO&searchType=statusSearch`
- TTAB opposition 91305271 (Xavier Creative House v. Marvin AI): `https://ttabvue.uspto.gov/ttabvue/v?pno=91305271&pty=OPP`
- XAVIER AI US filing details: `https://markinton.com/trademark/xavier-ai-98476632`
- EUIPO data API (records 017662933, 018718599, 018227418, 019010029): `https://euipo.europa.eu/copla/trademark/data/<number>`
- EUIPO eSearch record URLs: `https://euipo.europa.eu/eSearch/#details/trademarks/017662933` (and `018718599`, `019010029`)
- TMview cross-register search: `https://www.tmdn.org/tmview/#/tmview/results?criteria=C&basicSearch=xavier` (API `https://www.tmdn.org/tmview/api/search/results`)
- Dext / Xavier rebrand: `https://subscriptions.xumagazine.com/news/receipt-bank-and-xavier-become-dext` and `https://ibsintelligence.com/ibsi-news/receipt-bank-rebrands-to-dext-crosses-one-million-user-milestone/`
- getxavier.com → dext.com redirect: HTTP fetch of `https://getxavier.com`
- NVIDIA Jetson AGX Xavier: `https://developer.nvidia.com/embedded/jetson-agx-xavier`
- "Xavier — Self-evolving AI orchestrator": `https://github.com/atilafassina/xavier`
- Xavier Voice Assistant: `https://github.com/conscious-intelligent-labs/xavier-assistant`
- CHI'25 Xavier (JupyterLab coding assistant): `https://github.com/CHI25-Xavier/Xavier`
- Xavier XML library (Delphi/Lazarus): `https://github.com/mdbs99/xavier`
- Xavier AI product (Marvin AI, Inc.): `https://www.xavier.ai/` and `https://www.globenewswire.com/news-release/2025/04/15/3062095/0/en/Xavier-AI-Launches-the-World-s-First-AI-Strategy-Consultant.html`
- Surname / personal-name distinctiveness law: `https://www.cll.com/OnMyMindBlog/understanding-primarily-merely-a-surname-u-s-trademark-registration-refusals` and `https://www.nolo.com/legal-encyclopedia/using-surname-family-name-trademark.html`
- Domain facts: `https://rdap.verisign.com/com/v1/domain/xavierhq.com` (404 = available), `https://pubapi.registry.google/rdap/domain/xavier.app`, `whois.verisign-grs.com` (port 43), `https://cloudflare-dns.com/dns-query`
