# Domain availability, aftermarket and parked-domain APIs

Research for Domain Crawl (Rankplan), 2026-11-13. Purpose: replace guesswork in the
name-suggestion flow with (a) an authoritative availability check, (b) real price and
premium truth, and (c) a for-sale check on names that are already taken.

Method note: discovery ran through web search (the Qwant web UI returns 403 to
automated fetching and duck.ai chat is not machine-readable, so neither could be
scraped directly). Every load-bearing claim below was then verified against the
provider's own documentation or pricing pages where those are public; items that rest
on reputable third-party testing are marked "(third-party tested, Aug-Oct 2026)".

## TL;DR recommendation

Three layers, in order of cost per check:

1. **Free authoritative screen: registry RDAP.** One HTTPS GET per candidate. 404 means
   "no registry record" (candidate available), 200 means registered. Costs nothing, no
   account, no key. Coverage: the IANA bootstrap lists an RDAP server for roughly 1,200
   of ~1,440 TLDs. Use it to kill 90% of bad suggestions before spending a cent.
2. **Price and premium truth: one registrar API.** Porkbun or NameSilo (both free with
   an account, no IP allowlist, both return availability + price + premium flag in
   batch). This is the only layer that can distinguish "available at $11" from
   "available at $4,800 because the registry priced it premium" or "reserved, not
   sellable at all".
3. **Aftermarket check, only for taken names the user actually likes:** Sedo partner
   API (partner ID + sign key, commission model) for Sedo inventory, plus the
   GoDaddy/Afternic route below; parked/for-sale lander detection from the nameservers
   RDAP already returned (free) as the cheap first signal.

Name generation should also bake in availability priors (section 6): every 3- and
4-letter .com and effectively every one-word dictionary .com is registered, so the
generator should score those as "aftermarket only" and push creative effort toward
6+ letter invented names, blends and two-word compounds, where free names actually
exist.

## 1. Authoritative availability: RDAP

RDAP (Registration Data Access Protocol, RFC 7480/9082/9083) is the ICANN-mandated
successor to WHOIS. Since 28 January 2025 gTLD registries are no longer required to
run WHOIS at all; RDAP is the protocol they must support.

How it works:

- IANA publishes a bootstrap file, `https://data.iana.org/rdap/dns.json`, mapping each
  TLD to its registry's RDAP base URL (RFC 9224). On 29 Oct 2026 it covered 1,203 TLDs.
- `GET {base}domain/{fqdn}` returns JSON. Verisign runs .com/.net at
  `https://rdap.verisign.com/com/v1/domain/example.com` (its .cc/.name and IDN TLDs
  are on `tld-rdap.verisign.com`).
- `https://rdap.org/domain/{fqdn}` is a free bootstrap redirector: it reads the IANA
  file and 302-redirects to the authoritative server. Handy, but for production use
  the IANA file directly; a handful of TLDs (.io, .co, .me, .us) are absent from the
  IANA bootstrap even though the registries run RDAP (.io/.sh/.ac via Identity
  Digital, .us via rdap.nic.us), and .co still needs a port-43 WHOIS fallback
  (whois.registry.co).

Reading the answer:

- **HTTP 200** = registered. The JSON gives creation/expiry dates, EPP statuses,
  nameservers and the sponsoring registrar. Nameservers matter beyond availability:
  they are your free parked/for-sale signal (section 4).
- **HTTP 404** = no record in the registry. Per RFC 7480 section 5.3 that is the
  specified answer for "this domain does not exist". Read it as "candidate available",
  never as "buyable at standard price" (see caveats).
- **429 / 5xx / timeout** = unknown. Registries throttle; treat anything that is not
  200 or 404 as "unknown, retry later", never as available.

Caveats that make RDAP alone insufficient:

- **Premium names return 404.** Registries keep premium and reserved lists outside
  the registered-names database. A new-gTLD name can 404 at the registry and still
  cost four figures, or be reserved and not sellable at any price. Documented case:
  `read.page` returned RDAP 404 and $1,091/yr at a registrar while `inert.page` on
  the same TLD was standard price (third-party tested 2026). Only a registrar check
  (layer 2) resolves this.
- **.com is a special case:** Verisign runs no registry premium tier for .com, so a
  "premium .com" is by definition an aftermarket listing, i.e. a registered name
  (RDAP 200). Premium tiers are a new-gTLD phenomenon (.app, .page, .io, .ai and the
  Identity Digital / Radix portfolios).
- **Client-side traps that fake a 404:** querying a subdomain (www.example.com),
  mismatching the path TLD and the domain TLD, or sending a trailing dot all return
  404 from Verisign for names that exist. Strip to the registrable domain first.
- **Rate limits are per registry and mostly unpublished.** Verisign and others
  answer 429 under load. A 590-name study against Verisign ran at roughly one request
  per 1.1 seconds to stay polite. Cache results (registrations change slowly),
  parallelise across TLDs rather than within one registry, and back off on 429.
- **ccTLD coverage is patchy:** ICANN rules do not bind ccTLDs; a minority still offer
  only port-43 WHOIS. For those, fall back to WHOIS or a commercial API (section 5).

What RDAP returns, in matrix terms: registered yes/no (authoritative), registrar,
dates, EPP status, nameservers. Price: no. Premium: no. For sale: no. Parked: only
indirectly, via nameserver patterns.

## 2. Registrar availability APIs (price and premium truth)

All five are free to call; you pay only when a domain is actually registered. All
checks must run server-side (for Domain Crawl: inside a Supabase edge function), since
the keys cannot ship in a browser bundle.

### Porkbun (recommended first choice)

- Endpoint: `POST https://api.porkbun.com/api/json/v3/domain/checkDomain/{domain}`;
  response has `avail` (yes/no), registration/renewal/transfer `price`, and a `type`
  field that flags premium names, with extended premium pricing details.
- `GET /pricing/get` is unauthenticated and returns every TLD's prices; good for
  pre-scoring suggestions before any availability call.
- Access: free Porkbun account, API key + secret key from the account panel. No IP
  allowlist, no reseller programme, no minimum spend. Easiest onboarding of the set.
- Rate limits: the single check endpoint is documented at roughly 1 check per 10
  seconds per account (historical figure in Porkbun's docs and client libraries);
  a newer batch check (up to 25 domains per call) runs on a separate, much more
  generous budget (about 200 domains/minute per Porkbun's MCP release notes,
  Oct 2026). Design for the slow figure, enjoy the fast one. Verify the current
  limit in the docs at build time, because Porkbun has been actively changing this
  API through 2026.
- TLD coverage: several hundred TLDs (everything Porkbun sells).

### Cloudflare Registrar API (beta, strong second)

- Endpoints (verified on Cloudflare's own docs, 2026-11-13):
  `GET /client/v4/accounts/{id}/registrar/domain-search?q=` for candidate generation
  (cached, non-authoritative), and `POST .../registrar/domain-check` for the truth:
  it queries the registry directly, accepts up to 20 domains per request, and returns
  `registrable`, `tier` (standard vs premium), exact registration and renewal pricing,
  and a `reason` when false (`domain_unavailable`, `domain_premium`, extension not
  supported, and similar). Premium domains return the exact registry-set price and
  registration requires echoing it back as a fee acknowledgement.
- Access: free Cloudflare account + API token with Registrar permissions + a billing
  profile (needed because the same API can register). Registrations are at wholesale
  cost, no markup.
- Caveats: still beta (first release). Only a subset of Cloudflare's 400+ dashboard
  TLDs is exposed through the API so far, and search results are scoped to that
  subset. The search endpoint over-reports (it showed a premium .xyz as registrable
  at $0.85 that domain-check then rejected as premium; third-party tested), which is
  exactly the failure mode layer 2 exists to catch.

### Namecheap

- Command: `namecheap.domains.check`, up to 50 domains per call, XML responses.
  Returns `Available`, `IsPremiumName`, `PremiumRegistrationPrice`,
  `PremiumRenewalPrice` and the ICANN fee. This is the richest premium detail of the
  registrar set, including aftermarket "PremiumDNS-style" resale listings surfaced as
  premium names in some cases.
- Access: free API, but gated. Production requires one of: 20+ domains in the
  account, $50+ account balance, or $50+ spent in the last 2 years. Sandbox is open
  to anyone.
- **IP allowlist is mandatory:** at least one static IPv4 must be whitelisted in the
  account before any call succeeds. That is a real deployment constraint for Domain
  Crawl, because Supabase edge functions do not offer a guaranteed static egress IP;
  plan a small proxy with a fixed IP if Namecheap is chosen.
- Rate limits (official FAQ): 50/min, 700/hour, 8,000/day per key.

### Dynadot

- API3: `GET https://api.dynadot.com/api3.json?key=...&command=search&domain0=...`
  with `show_price=1` returning availability plus premium details and price. Regular
  accounts may send 1 domain per search command; Bulk and Super Bulk account tiers
  raise that to 100 per command. A newer RESTful v2 API exists but is still flagged
  beta by Dynadot, and API3 is marked "scheduled for retirement" with no date.
- Bonus relevant to layer 3: Dynadot runs its own marketplace, and single-name search
  keeps a taken name's marketplace `price_list` in the response (third-party tested),
  so one Dynadot call can answer availability, price/premium and "for sale on
  Dynadot" at once. There is also a `suggestion_search` command.
- Access: free Dynadot account, API key from the control panel. No IP allowlist
  documented. 800+ TLDs in the catalogue.

### NameSilo (recommended co-first choice)

- Operation: `checkRegisterAvailability` (GET, XML or JSON), comma-separated batch;
  results split into available / unavailable / invalid, and each available name
  carries `price` and a `premium` attribute. `getPrices` returns per-TLD
  registration/renewal/transfer prices.
- Access: free NameSilo account, single API key, no approval process, no IP
  allowlist, no per-call fee. Sandbox (OTE) available on request.
- Constraint: automated or repetitive traffic must use the `/apibatch` host variant;
  hammering the standard `/api` endpoint can trigger limiting or suspension
  (official batch policy). No fixed public rate number; stay conservative
  (one in-flight request, tens per minute).

### GoDaddy (the Afternic back door, but gated)

- `GET /v1/domains/available` returns availability and price, and for names listed on
  the Afternic network it returns them as purchasable at the listing price; that is
  currently the only API route into Afternic prices (section 3). The newer v3
  `check-availability` separates `inventory: "REGISTRY"` from premium inventory, but
  premium/aftermarket names are explicitly not purchasable through the v3 API
  (third-party tested).
- Access problem: production access to the availability API requires an account with
  **50+ domains**. OTE sandbox is open. A PAT (personal access token) is the modern
  auth route.
- GoDaddy also launched a Domain Valuation API (Oct 2026): GoValue estimate, a
  suggested Afternic list price, wholesale value and sales probabilities, gated
  behind a paid GoValue subscription. Interesting for a future "what is this taken
  name worth" feature, not needed for availability.

## 3. For-sale and brokerage status

First, what the plumbing cannot tell you:

- **RDAP** says a name is registered and who the registrar is. Nothing in RDAP or
  WHOIS says "for sale" or at what price. The only hint is indirect: nameservers
  pointing at a marketplace lander (section 4).
- **EPP** (the registrar-to-registry protocol) is not public at all; its check
  command returns a bare avail boolean to accredited registrars and does not expose
  marketplace data.
- For-sale status lives in exactly three places: marketplace databases, registrar
  premium feeds (which syndicate those databases), and the lander page on the domain
  itself.

### Afternic (owned by GoDaddy; where Dan.com's inventory went)

- Dan.com was shut down on 27 June 2025 and its listings and sellers were migrated
  to Afternic. Do not build on Dan.
- Afternic has **no public self-serve lookup API** for "is this arbitrary domain
  listed, and at what price". Its APIs are partner/reseller integrations for listing
  management. Practical routes in:
  1. GoDaddy Domains API availability check (above): Afternic network listings
     surface as purchasable with price. Gated at 50+ domains on the account.
  2. Registrar partner programmes: partner registrars (GoDaddy, Network Solutions,
     Tucows, Dynadot, Namecheap, IONOS and others) show Afternic listings in their
     own search results, which is why a Dynadot or Namecheap "premium" result is
     often an Afternic listing in disguise.
  3. The public listing page `afternic.com/domains/{domain}` shows the price in a
     browser; it is a web page, not an API, and scraping it is a terms and
     reliability risk. Do not build the product on it.
- Nameserver tell: domains using Afternic sale landers sit on Afternic nameservers
  (ns1/ns2.afternic.com and similar), which RDAP shows you for free.

### Sedo

- Sedo does have a real partner API: SOAP/XML at api.sedo.com (partnerid + signkey),
  with `DomainSearch` returning listings and prices across its ~19-23M domain
  inventory, plus a SedoMLS programme that lets registrar partners embed Sedo
  inventory (including auctions and brokerage for unlisted names) in their own
  search results and earn commission.
- Access: partner agreement with Sedo; there is no public price list for API access,
  the economics are commission on completed sales. This is the cleanest legitimate
  "check Sedo for a price" route, and the one aggregators use under the hood.

### Atom (formerly Squadhelp) and HugeDomains

- Atom is now a curated brandable marketplace and an ICANN-accredited registrar. It
  has a Registrar API (docs at apidocs.atom.com) but access is switched on per
  account on request, and its marketplace is curated brandables, not general
  inventory. Relevant later if Domain Crawl wants a "premium brandable" shelf;
  not a general for-sale oracle.
- HugeDomains has no API. Its catalogue is only on hugedomains.com; its names are
  detectable heuristically because they resolve to HugeDomains landers (redirect or
  nameserver patterns), never with an API-grade price.

### Aggregators

- RobotDomainSearch offers an aftermarket lookup API (`GET /v1/aftermarket/{domain}`)
  fanning out to Sedo and Dynadot Marketplace, free during beta (60 req/min, no key).
  Useful as a prototype shortcut; it is a small third party reselling access you
  could have directly, so treat it as a stopgap, not infrastructure.

## 4. Parked detection

"Parked" means the name is registered but serves only a placeholder: ad parking, a
for-sale lander, or a registrar holding page. It matters to Domain Crawl for two
reasons: a parked taken name is far more likely to be buyable than a name running a
real business, and parked status is a quality signal for the taken-name report.

Signals, strongest first:

1. **Nameservers.** The single most reliable cheap signal, and free from the RDAP
   response you already fetched:
   - `ns1.sedoparking.com` / Sedo: parked at Sedo (often also for sale there)
   - `ns1.bodis.com`: Bodis parking
   - `ns1.parkingcrew.net`: ParkingCrew (also the classic "lapsed and grabbed" tell)
   - `ns1.afternic.com`: Afternic lander (parked and/or for sale)
   - dan.com / HugeDomains / registrar default parking nameservers similar
   A maintained list of parking-provider nameserver and CNAME patterns (22+ services)
   is the standard approach used by link-checking tools.
2. **DNS shape:** no MX, wildcard A records pointing at known parking IPs, or CNAMEs
   into parking networks (e.g. parkingcrew.net, sedoparking.com, bodis.com).
3. **HTTP fingerprint:** fetch the homepage and match lander boilerplate ("This
   domain is for sale", "Buy this domain", parking-network ad frames, known
   placeholder asset URLs such as cdn.domainmarket.com or forsale.spaceship-cdn.com,
   redirects into hugedomains.com / sedo.com listing pages). A 200 proves nothing by
   itself; parked landers return 200. Read the body.
4. **No web presence at all:** registered, delegated nameservers, but nothing
   listening. That is "dormant", not provably parked.

APIs that return a parked verdict:

- **APIVoid Parked Domain API**: real-time parked check (their own examples name
  SedoParking and ParkingCrew); credit-based paid API with a small free allowance.
- **Fastly Domain Research API (formerly Domainr)**: its status vocabulary literally
  includes `parked`, alongside `marketed` and `priced` for for-sale names (section 5).
- **DomainTools / SecurityTrails**: both sell domain-profile data with hosting and
  DNS history that can support parked classification, but neither offers a simple
  self-serve "parked: true" flag comparable to APIVoid; they are enterprise data
  contracts. Treat any claim of a one-call parked flag from them as unverified.
- **DIY**: nameserver match plus one HTTP fetch gets you most of the value for free,
  which is why the commercial flags are niche products.

Reliability, stated plainly: nameserver-based detection is high-precision (a domain
on ns1.parkingcrew.net is parked, full stop) but incomplete, because owners park on
custom nameservers and behind Cloudflare; content fingerprinting catches more and
adds false positives (coming-soon pages, one-page sites, expired SSL errors). Report
parked as a confidence (parked / likely parked / dormant / live site), never as a
bare boolean, and never infer "for sale" from parked alone unless the lander or a
marketplace listing confirms it.

## 5. Commercial all-in-one APIs

These sell convenience (one key, normalised JSON, broad TLD coverage) rather than
better truth: underneath, they query the same registries and WHOIS/RDAP sources, and
none of them returns aftermarket prices. Independent testing (Oct 2026) caught
WhoisXML's WHOIS API marking three live, registered ccTLD domains as "AVAILABLE" when
its WHOIS data was missing, which is the standing warning for this whole category:
a commercial "available" answer is a cached opinion, a registrar check is a quote.

### WhoisXML API, Domain Availability API

- Returns: domainAvailability (AVAILABLE / UNAVAILABLE), plus a DNS/Whois availability
  mode choice; JSON or XML. No price, no premium, no for-sale, no parked.
- Access: account + API key. First 100 lookups free on signup, no card. Hard throttle
  of 30 requests/second.
- Cost: paid tiers are sold as subscriptions and credit packs; per-credit pricing sits
  behind their pricing calculator (their WHOIS API starts at $30/mo for 2,000
  requests, and the newer universal WXA.ONE pool starts at $129/mo). Budget "tens of
  dollars per month at pilot scale, hundreds at volume", and get a live quote before
  committing.
- Coverage: 7,596+ TLDs claimed across their products.

### WhoAPI, Domain Availability API

- Returns: registered or not (their `domain` availability call), JSON or XML. No
  price/premium/for-sale.
- Pricing is published and simple (verified on whoapi.com): new clients get 10,000
  free Domain API requests; then Freelancers $23/mo (40,000 req), Startups $49/mo
  (200,000), Business $99/mo (1,000,000), Enterprise $399/mo (5,000,000).
- Coverage: top gTLDs and ccTLDs, 500M+ domains checkable. At $23 for 40k checks this
  is the cheapest way to buy bulk screening if RDAP rate limits ever bite; it is
  still screening, not price truth.

### WhoisJSON (worth knowing as the budget option)

- One key for WHOIS, DNS, SSL and availability across 1,500+ TLDs; free tier 1,000
  requests/month with no card; paid plans from about $10/mo (vendor-published
  comparison). Availability is boolean only.

### Domainr, now Fastly Domain Research API

- Status check: **the legacy Domainr API is deprecated.** Domainr joined Fastly in
  2023 and the product is now the Fastly Domain Research API; the old docs remain
  online for migration, and the old endpoint still answers (401 without a key).
  Low-volume access continues via RapidAPI (free tier), high-volume via Fastly
  accounts.
- Why it still matters: its status vocabulary is the richest in the industry, far
  beyond available/taken: `undelegated` (unregistered), `premium` (registry premium),
  `marketed`, `priced` and `parked` (aftermarket signals), `reserved`, `disallowed`,
  `tld`. It does **not** quote registration prices. If Domain Crawl ever wants a
  one-call "why is this name not simply available" label, this is the taxonomy to
  copy, whoever supplies it.
- Related: DNSimple has a Domain Research status endpoint in private beta, sold as a
  paid subscription aimed at high-volume lookups; a sign the category is
  consolidating into registrar platforms.

### Verisign DomainScope: dead

- DomainScope (Verisign's old discovery tool over .com/.net/.tv/.cc, which did have
  APIs) was shut down on 17 July 2020. Its successor is Verisign NameStudio, a name
  suggestion engine sold to registrars and resellers, not a self-serve API a project
  like Domain Crawl can sign up for. Do not plan around either.

## 6. AI name generation (short section)

There is no dominant "name generation API" to buy. The market splits into consumer
generators with no real API (Namelix by Brandmark is the quality benchmark: a model
trained on brand-name patterns, style picker, randomness slider, inline domain checks,
but no public API), registrar suggestion endpoints, and DIY LLM prompting.

Style taxonomies worth stealing, from Namelix and Looka: brandable/invented
(Spotify), evocative (RedBull), compound (FedEx), real words (Apple), alternate
spelling (Lyft), short phrase (Dollar Shave Club), non-English roots (Audi), rhyming.
For Domain Crawl's settings UI this maps cleanly to: **Tone** (serious / neutral /
playful), **Construction** (real word / two-word compound / blend or portmanteau /
invented), **Length** (short / medium / any), plus the industry and keywords.

Registrar suggestion endpoints that pair generation with live availability:
GoDaddy `GET /v1/domains/suggest`, Dynadot `suggestion_search`, Cloudflare
`domain-search` (cached; confirm with domain-check), and Atom's AI search on its own
inventory. Useful as a baseline or fallback, generic by design.

The pattern that beats them, and the fix for "rather generic ideas": an LLM system
prompt that (1) takes a structured brief (industry, audience, tone slider, forbidden
words, must-evokes / must-avoid associations), (2) generates per construction class
in separate passes so compounds do not crowd out invented names, (3) applies hard
filters (length, pronounceability, no digits/hyphens unless requested, negative
connotations), and (4) ranks by availability probability before any API call:

Availability priors for .com, measured against Verisign's registry in a seeded random
study (Oct 2026, n=590, ~1 req/1.1s): all sampled 3-letter and 4-letter names were
registered (100 of 100 and 150 of 150); random 5-letter strings were 68% unregistered
but pronounceable 5-letter patterns only ~15% unregistered. Combined with the
long-standing fact that effectively every one-word dictionary .com is taken, the
generator should: treat 1-word and <=4-letter .com ideas as aftermarket candidates
(route to layer 3, show them as "buyable, not registerable"), spend generation budget
on 6+ letter invented names, blends and two-word compounds, and show the user a
"chance this is free" hint per name. Checking fewer, better candidates also keeps
RDAP and registrar call volume (and rate-limit risk) down.

## Master matrix

| Option | Registered? | Price | Premium flag | For sale + price | Parked | Access route | Cost | Rate limits | TLD coverage |
|---|---|---|---|---|---|---|---|---|---|
| Registry RDAP (IANA bootstrap) | Yes, authoritative | No | No | No | NS hint only | None, open HTTPS | Free | Per registry, unpublished; 429 under load; ~1 req/s polite rate for Verisign | ~1,200 of ~1,440 TLDs; ccTLD gaps, port-43 WHOIS fallback |
| Porkbun checkDomain | Yes (registrar truth) | Yes, reg/renew/transfer | Yes, type + premium pricing | Only Porkbun marketplace names | No | Free account, key + secret, no IP allowlist | Free calls | ~1 check/10s single; batch 25/call, ~200/min (verify at build) | Several hundred |
| Cloudflare domain-check (beta) | Yes, queries registry live | Yes, reg + renewal | Yes, tier field | No | No | Free account + API token + billing profile | Free calls, at-cost registration | 20 domains/request; beta | Subset of 400+ dashboard TLDs |
| Namecheap domains.check | Yes | Premium price only in check; full pricing via getPricing | Yes, IsPremiumName + both prices | Sometimes, resale listings surface as premium | No | Free API after gate (20 domains / $50 balance / $50 spend) | Free calls | 50/min, 700/hr, 8,000/day; 50 domains/call | All Namecheap TLDs (~1,000+) |
| Dynadot search (API3) | Yes | Yes with show_price | Yes, premium details | Yes, Dynadot Marketplace price_list on taken names | No | Free account, API key | Free calls | 1 domain/command regular; 100 bulk tiers | 800+ |
| NameSilo checkRegisterAvailability | Yes | Yes per available name | Yes, premium attribute | No | No | Free account, single key, batch host required | Free calls | No published number; stay conservative | All NameSilo TLDs |
| GoDaddy domains/available (v1) | Yes | Yes | Yes | **Yes, Afternic network price** | No | Account with 50+ domains; PAT | Free calls | Per account plan | GoDaddy catalogue |
| Sedo partner API (DomainSearch) | n/a | n/a | n/a | **Yes, Sedo inventory + price** | Parking data for own portfolio | Partner agreement (partnerid + signkey) | Commission on sales | Per agreement | ~19-23M listed names |
| Afternic direct | n/a | n/a | n/a | Listings exist but **no public lookup API** | Lander NS tell | Partner/reseller programmes only | n/a | n/a | Network-wide via partners |
| Atom Registrar API | Yes (own registrar) | Yes | Curated listings | Own marketplace only | No | API enabled per account on request | Free calls | Undisclosed | 539 TLDs; curated brandables |
| WhoisXML Domain Availability | Yes (cached opinion) | No | No | No | No | Account + key, 100 free | Subscriptions/credits from ~$30/mo class | 30 req/s | 7,596+ claimed |
| WhoAPI Domain Availability | Yes | No | No | No | No | Account + key, 10,000 free to start | $23/mo 40k, $49 200k, $99 1M, $399 5M | Per plan | Top gTLDs + ccTLDs |
| WhoisJSON availability | Yes | No | No | No | No | Account + key, 1,000 free/mo | From ~$10/mo | 20-900 req/min by plan | 1,500+ |
| Fastly Domain Research (ex-Domainr) | Yes, rich status set | No | Yes, `premium` status | Signal only (`marketed`, `priced`), no firm price | **Yes, `parked` status** | RapidAPI free tier, or Fastly account | Free tier, then contract | Per plan | Broad, zone-file based |
| APIVoid Parked Domain API | n/a | No | No | No | **Yes, dedicated flag** | Account + key | Credit-based, small free allowance | Per plan | Any resolvable domain |
| DIY parked check (NS + HTTP fetch) | n/a | No | No | Lander text often names the price/venue | Yes, confidence-graded | None | Free | Self-imposed politeness | Any domain with DNS |

## Recommended build for Domain Crawl

Concrete three-layer design, sized for the current Supabase edge function setup:

- **Layer 0, generate with priors (in the suggest-domains prompt):** add Tone and
  Construction settings; score and label candidates with the section 6 priors;
  demote 1-word and <=4-letter .com to a separate "aftermarket" bucket so the UI
  never presents them as registerable.
- **Layer 1, RDAP screen (new edge function, free):** cache the IANA bootstrap file
  daily; one GET per candidate; states: `registered`, `candidate_available`,
  `unknown` (429/5xx/timeout, retried once with backoff); keep the nameserver list
  from 200 responses for layer 3. Supplement the bootstrap for .io/.us; WHOIS
  fallback or "uncheckable" label for the remaining ccTLDs.
- **Layer 2, registrar confirmation (survivors only):** Porkbun batch check as
  primary (no allowlist, premium flag, real prices, free), NameSilo `/apibatch` as
  failover. Show first-year **and** renewal price; label premium clearly with both.
  If Namecheap is ever adopted for its richer premium data, budget for a fixed-IP
  proxy first.
- **Layer 3, taken-name report (only on user click, to respect rate limits and
  partner terms):** from data already in hand, show the RDAP registrar and creation
  date, the parked classification (nameserver match, then one HTTP fetch for lander
  text), and for-sale status: Sedo via partner API when the partnership exists,
  Dynadot Marketplace price where present, and an outbound "check on Afternic /
  GoDaddy" link rather than a scraped price until the account qualifies for the
  GoDaddy availability API (50+ domains).
- **What not to do:** do not present the current suggestion engine's guesses, a
  WHOIS-cache API's boolean, or a DNS NXDOMAIN as "available". NXDOMAIN proves
  nothing (undelegated registered names exist), a 404 from RDAP means "no record",
  and only layer 2 produces a price a client can act on.

Estimated running cost at pilot scale: $0/month (RDAP + Porkbun/NameSilo free tiers),
rising to about $23/mo (WhoAPI) only if RDAP throttling ever forces a paid screening
layer, plus a Sedo partner agreement (commission-only) when the aftermarket shelf
launches.

Sources consulted (provider docs first): IANA RDAP bootstrap and RFC 7480/9224;
rdap.org; Verisign RDAP behaviour notes; Cloudflare Registrar API docs
(developers.cloudflare.com/registrar/registrar-api/); Porkbun API v3 documentation;
Namecheap API FAQ and method docs; Dynadot API command list; NameSilo API reference;
GoDaddy developer docs (availability gating, Domain Valuation API changelog, Oct
2026); Sedo API docs (api.sedo.com) and SedoMLS Platinum pages; Atom registrar and
marketplace pages; WhoisXML Domain Availability docs and pricing; WhoAPI pricing
pages; Fastly/Domainr API docs (deprecated notice); Verisign DomainScope shutdown
notice (2020). Third-party live testing by the registrar-client project and others
(Aug-Oct 2026) is marked as such where relied on.
