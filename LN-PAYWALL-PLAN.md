# Name Genie: Lightning paywall plan

Written 2026-11-17. Status: PLAN ONLY, nothing built. Supersedes the
unapproved 2026-11-13 sketch (first search free, then a day pass) with a
fuller design. Goal: cap the metered API cost of name generation and stop
abuse, not revenue for its own sake.

## Where things stand

- Generation is the only metered piece: the legacy Lovable edge function
  (Gemini on Lovable's AI gateway, pennies per search). Its price and
  registrar claims are dropped client-side; availability is verified free
  via RDAP, capped at 24 names per search.
- The repo v2 generator cannot deploy: it needs LOVABLE_API_KEY as a server
  secret inside a Lovable-owned Supabase project.
- The site is a static GitHub Pages build (repo public again as of
  2026-11-17, "for now"). A static site cannot hold a secret, verify a
  payment, or enforce a quota. Every option below therefore adds ONE small
  server piece; the site itself stays static.

## The gate: a Cloudflare Worker in front of generation

Recommended home for the paywall logic: a single Cloudflare Worker on the
existing Cloudflare account. Host-agnostic, so it survives the planned move
off GitHub Pages and the later addition to Rankplan tools.

- The browser calls the Worker, never the generation API directly. The
  generation key (Lovable gateway today, Gemini free tier if we switch)
  lives in the Worker as a secret.
- The Worker checks an access token before proxying a generation call:
  - No token: one free search per day per IP (plus a signed anonymous
    cookie so refreshes do not double-charge the quota).
  - Valid pass token: unlimited searches until expiry.
- RDAP checks stay client-side and free, but the names they check only
  exist after a generation call, so the gate covers them in practice.
- Per-IP rate limit at the Worker (for example 10 generations/minute) as
  a blunt anti-abuse floor under both tiers.

## The pass

- One product only: a 24-hour day pass. No accounts, no subscriptions.
- Price: 1,000 sats (decision point: 500 / 1,000 / 2,100).
- Flow: the app asks the Worker for an invoice, the Worker creates one
  through the in-house Spark wallet stack (invoice + settlement check),
  shows QR + copyable invoice, polls until settled, then issues a signed
  pass token (JWT/macaroon with a 24h expiry) that the browser stores in
  localStorage.
- Token is bearer-only: losing it means buying again. Acceptable at this
  price; a "restore by invoice ID" lookup is a cheap v2 nicety.

## Enforcement summary

| Piece | Free tier | Day pass |
| --- | --- | --- |
| Generations | 1 per day per IP | Unlimited for 24h |
| RDAP checks | Follow the generation | Follow the generation |
| Rate limit | 10/min per IP | 10/min per IP |

## Rollout

1. Proxy first, paywall second: move generation behind the Worker with
   logging only. This alone fixes key custody and gives real per-search
   cost numbers, which set the pass price honestly.
2. Turn on the free quota + day pass once the cost per search is known.
3. When the app moves to its real host and joins Rankplan tools, the
   Worker and pass move with it unchanged.

## Open decisions for the user

1. Free quota: 1 search/day (recommended) or more?
2. Pass price: 500, 1,000 or 2,100 sats?
3. Generation backend: stay on the Lovable gateway (metered, works today)
   or switch to the Gemini free tier behind the same Worker (near-zero
   cost, needs the switch work from the 2026-11-14 shortlist)?

## Out of scope

- Porkbun live pricing (needs a Porkbun account; config-gated today).
- Accounts, subscriptions, or a weekly/monthly pass.
- Gating anything except generation.
