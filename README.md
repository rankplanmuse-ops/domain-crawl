# Domain Crawl

Domain Crawl is a domain-name suggestion tool. Enter a keyword, choose the domain endings (TLDs) you want to consider, and get suggested domain names generated through the Supabase `suggest-domains` edge function.

## Stack

- Vite
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- Supabase, including the `suggest-domains` edge function in `supabase/functions/suggest-domains`

## V2: live availability checks and generator settings

V2 separates name generation from availability truth. The language model proposes
names, then the `suggest-domains` edge function checks the top candidates against
live registry data. It does not invent availability, registrar prices, or premium
prices.

### Three-layer checking design

1. **Layer 1, registry RDAP, active now:** the function resolves the registry RDAP
   endpoint for each TLD from the IANA bootstrap at
   `https://data.iana.org/rdap/dns.json`, with Verisign used for `.com` and `.net`.
   It checks at most 24 candidates per request in small parallel batches. HTTP 404
   means the registry returned no domain record. HTTP 200 means the name is
   registered, and the response can provide the registrar, registration year, and
   nameservers. TLDs without a listed RDAP service are marked unchecked, and
   throttling or network failures are marked unknown instead of available.
2. **Layer 2, Porkbun confirmation, optional:** when `PORKBUN_API_KEY` and
   `PORKBUN_SECRET_KEY` are set as Supabase edge function secrets, registry-clear
   names can be confirmed through Porkbun. Porkbun supplies the real first-year
   price and premium flag used by the result card. Without those keys, the app still
   works on Layer 1 and shows a registrar price-check link instead of a price.
3. **Layer 3, aftermarket pricing, future work:** Sedo partner access and the
   GoDaddy route into Afternic are the planned sources for firm for-sale prices on
   registered names. Until one of those routes is configured, Domain Crawl does not
   quote an aftermarket price.

### Status taxonomy

- **Available:** the registry returned no record. On `.com` and `.net`, the card
  uses the registry-clear label without a registry premium warning.
- **Premium price possible:** the registry returned no record on a TLD where
  registry premium or reserved pricing can apply. The card says "Registry clear,
  premium price possible, confirm at registrar."
- **Premium:** Porkbun confirmed a registry premium name and returned a price.
- **Registered:** RDAP returned a live domain record.
- **Parked, likely or possible:** a registered name has nameserver patterns
  associated with services such as Sedo Parking, Bodis, ParkingCrew, or Afternic.
  This is a signal from nameservers, not proof that the domain is for sale.
- **Unchecked or unknown:** RDAP coverage or the registry response did not support
  a definitive classification.

### Generator V2

The search form now passes Tone (Serious, Balanced, Playful), Style (Structured,
Balanced, Inventive), construction toggles (Real words, Compounds, Blends,
Invented, Abbreviations), and name length (Short, Medium, Any) to the generator.
The prompt uses measured `.com` priors: 3-letter and 4-letter names and effectively
all one-word dictionary names are registered, pronounceable 5-letter names are
about 85 percent registered, and realistic free names are concentrated in 6+ letter
invented names, blends, and two-word compounds. Short and one-word `.com` ideas are
returned in a separate aftermarket group, with a model likelihood estimate shown
beside the live RDAP result.

The API research behind this design is in
[Domain availability, aftermarket and parked-domain APIs](research/availability-apis-2026-11-13.md).

## Run locally

Install dependencies:

```sh
npm install
```

Start the development server:

```sh
npm run dev
```

Build for production:

```sh
npm run build
```

Run tests:

```sh
npm test
```

## Environment

The `.env` file holds the Supabase project URL and publishable (anon) key used by the browser client. These are client-side public values for this app; do not put service-role keys or other private secrets in `.env`.

Optional Layer 2 keys belong in the Supabase edge function environment, never in
the browser `.env` file:

```text
PORKBUN_API_KEY
PORKBUN_SECRET_KEY
```

No Porkbun account or keys are required for the RDAP-only mode.
