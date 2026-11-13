import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_RDAP_CHECKS = 24;
const MAX_PORKBUN_CHECKS = 10;
const RDAP_BATCH_SIZE = 4;
const BOOTSTRAP_URL = "https://data.iana.org/rdap/dns.json";
const BOOTSTRAP_CACHE_MS = 24 * 60 * 60 * 1000;

type Tone = "serious" | "balanced" | "playful";
type Style = "structured" | "balanced" | "inventive";
type NameLength = "short" | "medium" | "any";
type Construction =
  | "real-word"
  | "compound"
  | "blend"
  | "invented"
  | "abbreviation"
  | "other";
type Bucket = "registerable" | "aftermarket";
type DomainStatus =
  | "available"
  | "registered"
  | "premium"
  | "premium-possible"
  | "unchecked"
  | "unknown";
type ParkedConfidence = "likely" | "possible" | "none";

interface GeneratorSettings {
  tone: Tone;
  style: Style;
  constructions: Construction[];
  length: NameLength;
}

interface Suggestion {
  name: string;
  construction: Construction;
  bucket: Bucket;
  reasoning?: string;
  modelLikelihood?: number;
}

interface DomainPrice {
  amount: number;
  renewalAmount?: number;
  currency: "USD";
  period: "first-year";
  source: "Porkbun";
  premium: boolean;
}

interface DomainCandidate extends Suggestion {
  domain: string;
  tld: string;
  status: DomainStatus;
  statusDetail: string;
  registrar?: string;
  registeredYear?: number;
  nameservers: string[];
  parked: ParkedConfidence;
  parkedSignals: string[];
  price?: DomainPrice;
  priceCheckUrl: string;
}

interface RdapOutcome {
  status: DomainStatus;
  statusDetail: string;
  registrar?: string;
  registeredYear?: number;
  nameservers: string[];
  parked: ParkedConfidence;
  parkedSignals: string[];
}

interface PorkbunOutcome {
  available: boolean;
  premium: boolean;
  price?: DomainPrice;
}

const DEFAULT_SETTINGS: GeneratorSettings = {
  tone: "balanced",
  style: "balanced",
  constructions: ["real-word", "compound", "blend", "invented"],
  length: "any",
};

const CONSTRUCTIONS: Construction[] = [
  "real-word",
  "compound",
  "blend",
  "invented",
  "abbreviation",
];

const STANDARD_PRICE_TLDS = new Set([".com", ".net"]);

const PARKING_PROVIDERS: Array<{ pattern: string; label: string }> = [
  { pattern: "sedoparking.com", label: "Sedo parking nameserver" },
  { pattern: "bodis.com", label: "Bodis parking nameserver" },
  { pattern: "parkingcrew.net", label: "ParkingCrew nameserver" },
  { pattern: "afternic.com", label: "Afternic lander nameserver" },
  { pattern: "dan.com", label: "Dan.com lander nameserver" },
  { pattern: "hugedomains.com", label: "HugeDomains lander nameserver" },
  { pattern: "above.com", label: "Above.com parking nameserver" },
  { pattern: "parklogic.com", label: "ParkLogic nameserver" },
  { pattern: "cashparking.com", label: "CashParking nameserver" },
];

let bootstrapCache:
  | { expiresAt: number; endpoints: Map<string, string> }
  | undefined;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sanitizeSettings(input: unknown): GeneratorSettings {
  if (!isRecord(input)) return DEFAULT_SETTINGS;

  const tone: Tone =
    input.tone === "serious" || input.tone === "playful"
      ? input.tone
      : "balanced";
  const style: Style =
    input.style === "structured" || input.style === "inventive"
      ? input.style
      : "balanced";
  const length: NameLength =
    input.length === "short" || input.length === "medium"
      ? input.length
      : "any";

  const requested = Array.isArray(input.constructions)
    ? input.constructions.filter(
        (item): item is Construction =>
          typeof item === "string" &&
          CONSTRUCTIONS.includes(item as Construction),
      )
    : [];
  const constructions = [...new Set(requested)];

  return {
    tone,
    style,
    constructions: constructions.length > 0 ? constructions : [...DEFAULT_SETTINGS.constructions],
    length,
  };
}

function sanitizeEndings(input: unknown): string[] {
  if (!Array.isArray(input)) return [".com"];
  const endings = input
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().toLowerCase())
    .map((item) => (item.startsWith(".") ? item : `.${item}`))
    .filter((item) => /^\.[a-z0-9-]+$/.test(item));
  return [...new Set(endings)].slice(0, 8);
}

function normalizeConstruction(input: unknown): Construction {
  if (typeof input !== "string") return "other";
  const value = input.toLowerCase();
  if (value.includes("real")) return "real-word";
  if (value.includes("compound") || value.includes("two-word")) return "compound";
  if (value.includes("blend") || value.includes("portmanteau")) return "blend";
  if (value.includes("invent")) return "invented";
  if (value.includes("abbrev") || value.includes("acronym")) return "abbreviation";
  return "other";
}

function cleanLabel(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const label = input
    .toLowerCase()
    .trim()
    .replace(/^\.+|\.+$/g, "")
    .split(".")[0]
    .replace(/[^a-z0-9]+/g, "");
  if (label.length < 3 || label.length > 32) return null;
  return label;
}

function inferBucket(
  input: unknown,
  name: string,
  construction: Construction,
): Bucket {
  if (input === "aftermarket" || input === "registerable") return input;
  if (name.length <= 5) return "aftermarket";
  if (construction === "real-word" && name.length <= 8) return "aftermarket";
  return "registerable";
}

function parseSuggestions(parsed: unknown): Suggestion[] {
  if (!isRecord(parsed) || !Array.isArray(parsed.suggestions)) return [];

  const unique = new Map<string, Suggestion>();
  for (const raw of parsed.suggestions) {
    if (!isRecord(raw)) continue;
    const name = cleanLabel(raw.name);
    if (!name || unique.has(name)) continue;

    const construction = normalizeConstruction(
      raw.construction ?? raw.constructionTag ?? raw.type,
    );
    const bucket = inferBucket(raw.bucket ?? raw.group, name, construction);
    const rawLikelihood =
      typeof raw.likelihood === "number"
        ? raw.likelihood
        : typeof raw.availabilityLikelihood === "number"
          ? raw.availabilityLikelihood
          : typeof raw.availabilityEstimate === "number"
            ? raw.availabilityEstimate
            : undefined;

    unique.set(name, {
      name,
      construction,
      bucket,
      reasoning:
        typeof raw.reasoning === "string"
          ? raw.reasoning
          : typeof raw.rationale === "string"
            ? raw.rationale
            : undefined,
      modelLikelihood:
        rawLikelihood === undefined
          ? undefined
          : clamp(Math.round(rawLikelihood), 0, 100),
    });
  }

  return [...unique.values()];
}

function priceCheckUrl(domain: string): string {
  return `https://porkbun.com/checkout/search?q=${encodeURIComponent(domain)}`;
}

function buildCandidates(
  suggestions: Suggestion[],
  endings: string[],
): DomainCandidate[] {
  const byDomain = new Map<string, DomainCandidate>();
  const registerable = suggestions
    .filter((item) => item.bucket === "registerable")
    .sort((a, b) => (b.modelLikelihood ?? 0) - (a.modelLikelihood ?? 0));
  const aftermarket = suggestions
    .filter((item) => item.bucket === "aftermarket")
    .sort((a, b) => (b.modelLikelihood ?? 0) - (a.modelLikelihood ?? 0));

  const addCandidate = (suggestion: Suggestion, tld: string) => {
    const domain = `${suggestion.name}${tld}`;
    const existing = byDomain.get(domain);
    if (existing) {
      if (suggestion.bucket === "aftermarket") existing.bucket = "aftermarket";
      return false;
    }
    byDomain.set(domain, {
      ...suggestion,
      domain,
      tld,
      status: "unknown",
      statusDetail: "Registry check has not completed.",
      nameservers: [],
      parked: "none",
      parkedSignals: [],
      priceCheckUrl: priceCheckUrl(domain),
    });
    return true;
  };

  const aftermarketReserve = Math.min(aftermarket.length, 4);
  const registerableLimit = MAX_RDAP_CHECKS - aftermarketReserve;
  let registerableCount = 0;

  for (const suggestion of registerable) {
    for (const ending of endings) {
      if (registerableCount >= registerableLimit) break;
      if (addCandidate(suggestion, ending)) registerableCount += 1;
    }
    if (registerableCount >= registerableLimit) break;
  }

  for (const suggestion of aftermarket) {
    if (byDomain.size >= MAX_RDAP_CHECKS) break;
    addCandidate(suggestion, ".com");
  }

  return [...byDomain.values()].slice(0, MAX_RDAP_CHECKS);
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function getRdapEndpoints(): Promise<Map<string, string>> {
  if (bootstrapCache && bootstrapCache.expiresAt > Date.now()) {
    return bootstrapCache.endpoints;
  }

  const endpoints = new Map<string, string>();
  endpoints.set(".com", "https://rdap.verisign.com/com/v1/");
  endpoints.set(".net", "https://rdap.verisign.com/net/v1/");

  try {
    const response = await fetchWithTimeout(
      BOOTSTRAP_URL,
      { headers: { Accept: "application/json" } },
      8000,
    );
    if (response.ok) {
      const bootstrap: unknown = await response.json();
      if (isRecord(bootstrap) && Array.isArray(bootstrap.services)) {
        for (const service of bootstrap.services) {
          if (!Array.isArray(service) || service.length < 2) continue;
          const tlds = Array.isArray(service[0]) ? service[0] : [];
          const urls = Array.isArray(service[1]) ? service[1] : [];
          const httpsUrl = urls.find(
            (url): url is string =>
              typeof url === "string" && url.startsWith("https://"),
          );
          const fallbackUrl = urls.find(
            (url): url is string => typeof url === "string",
          );
          const baseUrl = httpsUrl ?? fallbackUrl;
          if (!baseUrl) continue;
          for (const tld of tlds) {
            if (typeof tld !== "string") continue;
            const normalized = `.${tld.toLowerCase()}`;
            if (!endpoints.has(normalized)) endpoints.set(normalized, baseUrl);
          }
        }
      }
    }
  } catch (error) {
    console.error("Failed to load the IANA RDAP bootstrap:", error);
  }

  bootstrapCache = {
    expiresAt: Date.now() + BOOTSTRAP_CACHE_MS,
    endpoints,
  };
  return endpoints;
}

function extractRegistrar(entities: unknown): string | undefined {
  if (!Array.isArray(entities)) return undefined;

  for (const entity of entities) {
    if (!isRecord(entity)) continue;
    const roles = Array.isArray(entity.roles) ? entity.roles : [];
    if (roles.includes("registrar")) {
      const vcard = Array.isArray(entity.vcardArray) ? entity.vcardArray[1] : undefined;
      if (Array.isArray(vcard)) {
        for (const property of vcard) {
          if (
            Array.isArray(property) &&
            property[0] === "fn" &&
            typeof property[3] === "string"
          ) {
            return property[3];
          }
        }
      }
      if (typeof entity.handle === "string") return entity.handle;
    }
    const nested = extractRegistrar(entity.entities);
    if (nested) return nested;
  }
  return undefined;
}

function extractRegisteredYear(events: unknown): number | undefined {
  if (!Array.isArray(events)) return undefined;
  for (const event of events) {
    if (!isRecord(event)) continue;
    const action = typeof event.eventAction === "string" ? event.eventAction : "";
    if (!/regist|creat/i.test(action)) continue;
    if (typeof event.eventDate !== "string") continue;
    const year = Number.parseInt(event.eventDate.slice(0, 4), 10);
    if (Number.isFinite(year)) return year;
  }
  return undefined;
}

function classifyParked(nameservers: string[]): {
  parked: ParkedConfidence;
  parkedSignals: string[];
} {
  const signals: string[] = [];
  let likely = false;

  for (const nameserver of nameservers) {
    const host = nameserver.toLowerCase().replace(/\.$/, "");
    for (const provider of PARKING_PROVIDERS) {
      if (host === provider.pattern || host.endsWith(`.${provider.pattern}`)) {
        likely = true;
        signals.push(provider.label);
      }
    }
  }

  if (likely) return { parked: "likely", parkedSignals: [...new Set(signals)] };

  const possibleSignals = nameservers.filter((nameserver) => {
    const host = nameserver.toLowerCase();
    return /parking|parked|for-sale|forsale/.test(host);
  });
  if (possibleSignals.length > 0) {
    return {
      parked: "possible",
      parkedSignals: ["Nameserver name suggests a parking service"],
    };
  }

  return { parked: "none", parkedSignals: [] };
}

async function checkRdap(
  candidate: DomainCandidate,
  endpoints: Map<string, string>,
): Promise<RdapOutcome> {
  const baseUrl = endpoints.get(candidate.tld);
  if (!baseUrl) {
    return {
      status: "unchecked",
      statusDetail: "No public RDAP endpoint is listed for this TLD.",
      nameservers: [],
      parked: "none",
      parkedSignals: [],
    };
  }

  const url = `${baseUrl.replace(/\/?$/, "/")}domain/${encodeURIComponent(candidate.domain)}`;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetchWithTimeout(
        url,
        {
          headers: {
            Accept: "application/rdap+json, application/json",
            "User-Agent": "DomainCrawl/2.0",
          },
        },
        8000,
      );

      if (response.status === 404) {
        if (STANDARD_PRICE_TLDS.has(candidate.tld)) {
          return {
            status: "available",
            statusDetail:
              "No registry record was returned. Confirm final eligibility at a registrar before purchase.",
            nameservers: [],
            parked: "none",
            parkedSignals: [],
          };
        }
        return {
          status: "premium-possible",
          statusDetail:
            "Registry clear, premium price possible, confirm at registrar.",
          nameservers: [],
          parked: "none",
          parkedSignals: [],
        };
      }

      if (response.status === 200) {
        const data: unknown = await response.json();
        const record = isRecord(data) ? data : {};
        const rawNameservers = Array.isArray(record.nameservers)
          ? record.nameservers
          : [];
        const nameservers = rawNameservers
          .map((item) => {
            if (!isRecord(item)) return undefined;
            return typeof item.ldhName === "string"
              ? item.ldhName.toLowerCase()
              : typeof item.unicodeName === "string"
                ? item.unicodeName.toLowerCase()
                : undefined;
          })
          .filter((item): item is string => Boolean(item));
        const parked = classifyParked(nameservers);
        return {
          status: "registered",
          statusDetail: "The registry returned an active domain record.",
          registrar: extractRegistrar(record.entities),
          registeredYear: extractRegisteredYear(record.events),
          nameservers,
          ...parked,
        };
      }

      if (
        (response.status === 429 || response.status >= 500) &&
        attempt === 0
      ) {
        await delay(400);
        continue;
      }

      return {
        status: "unknown",
        statusDetail:
          response.status === 429
            ? "The registry rate limit was reached, so this name was not classified."
            : `The registry returned HTTP ${response.status}, so this name was not classified.`,
        nameservers: [],
        parked: "none",
        parkedSignals: [],
      };
    } catch (error) {
      if (attempt === 0) {
        await delay(400);
        continue;
      }
      return {
        status: "unknown",
        statusDetail:
          error instanceof Error && error.name === "AbortError"
            ? "The registry check timed out, so this name was not classified."
            : "The registry check failed, so this name was not classified.",
        nameservers: [],
        parked: "none",
        parkedSignals: [],
      };
    }
  }

  return {
    status: "unknown",
    statusDetail: "The registry check did not complete.",
    nameservers: [],
    parked: "none",
    parkedSignals: [],
  };
}

async function runInBatches<T>(
  items: T[],
  batchSize: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  for (let index = 0; index < items.length; index += batchSize) {
    await Promise.all(items.slice(index, index + batchSize).map(worker));
  }
}

function parseMoney(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const parsed = Number.parseFloat(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function checkPorkbun(
  candidate: DomainCandidate,
  apiKey: string,
  secretKey: string,
): Promise<PorkbunOutcome | null> {
  try {
    const response = await fetchWithTimeout(
      `https://api.porkbun.com/api/json/v3/domain/checkDomain/${encodeURIComponent(candidate.domain)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey,
          "X-Secret-API-Key": secretKey,
        },
        body: JSON.stringify({}),
      },
      10000,
    );
    if (!response.ok) return null;
    const data: unknown = await response.json();
    if (!isRecord(data) || data.status !== "SUCCESS" || !isRecord(data.response)) {
      return null;
    }

    const result = data.response;
    const available = result.avail === "yes" || result.avail === true;
    const premium =
      result.premium === "yes" ||
      result.premium === true ||
      (typeof result.type === "string" &&
        result.type.toLowerCase().includes("premium"));
    const amount = parseMoney(result.price);
    const renewalRecord =
      isRecord(result.additional) && isRecord(result.additional.renewal)
        ? result.additional.renewal
        : undefined;
    const renewalAmount = parseMoney(renewalRecord?.price);

    return {
      available,
      premium,
      price:
        available && amount !== undefined
          ? {
              amount,
              renewalAmount,
              currency: "USD",
              period: "first-year",
              source: "Porkbun",
              premium,
            }
          : undefined,
    };
  } catch (error) {
    console.error(`Porkbun check failed for ${candidate.domain}:`, error);
    return null;
  }
}

async function applyRegistrarChecks(candidates: DomainCandidate[]): Promise<boolean> {
  const apiKey = Deno.env.get("PORKBUN_API_KEY");
  const secretKey = Deno.env.get("PORKBUN_SECRET_KEY");
  if (!apiKey || !secretKey) return false;

  const clearCandidates = candidates
    .filter(
      (candidate) =>
        candidate.status === "available" ||
        candidate.status === "premium-possible",
    )
    .sort((a, b) => (b.modelLikelihood ?? 0) - (a.modelLikelihood ?? 0))
    .slice(0, MAX_PORKBUN_CHECKS);

  for (let index = 0; index < clearCandidates.length; index += 1) {
    const candidate = clearCandidates[index];
    const outcome = await checkPorkbun(candidate, apiKey, secretKey);
    if (outcome) {
      candidate.price = outcome.price;
      if (outcome.available) {
        candidate.status = outcome.premium ? "premium" : "available";
        candidate.statusDetail = outcome.premium
          ? "Porkbun confirmed this registry premium name and returned its first-year price."
          : "Porkbun confirmed availability and returned its first-year price.";
      } else {
        candidate.statusDetail =
          "The registry has no record, but Porkbun did not confirm that this name can be registered.";
      }
    }
    if (index < clearCandidates.length - 1) await delay(1100);
  }

  return true;
}

function buildSystemPrompt(settings: GeneratorSettings): string {
  const constructionText = settings.constructions.join(", ");
  return `You are a senior naming strategist and domain analyst. Generate names for a business brief, then separate realistic registration candidates from aftermarket inspiration.

Measured availability priors you must apply:
- On .com, effectively all 3-letter and 4-letter names are registered.
- Effectively all single dictionary words on .com are registered.
- Pronounceable 5-letter .com names are about 85 percent registered.
- Free .com names are concentrated in 6+ letter invented names, blends, and two-word compounds.
- Newer TLDs can have registry premium or reserved names even when the registry has no registration record. Never promise a standard price.

Generation rules:
- Return exactly 16 unique labels without a TLD: 12 registerable candidates and 4 aftermarket candidates.
- Registerable candidates must favor 6+ letter invented names, blends, and clean two-word compounds that could plausibly be unregistered.
- Aftermarket candidates may be short, one-word, or highly desirable dictionary names. Treat them as likely registered inspiration, not registration candidates.
- Respect these settings: tone is ${settings.tone}; style is ${settings.style}; allowed construction types are ${constructionText}; length preference is ${settings.length}.
- Use only the allowed construction types. If abbreviations are not allowed, do not return acronym-style names.
- Keep labels to letters only in the JSON output, with no spaces, hyphens, digits, or TLD.
- Avoid names that are obvious trademarks, celebrity names, or confusing imitations of major brands.
- For each name, include construction, bucket, one concise rationale, and likelihood. Likelihood is your estimated percentage chance, from 0 to 100, that the label is unregistered on the user's first preferred ending. Give aftermarket names a likelihood from 0 to 10.
- Analysis must be brief and practical. Do not claim that any name is available. Live registry checks happen after generation.

Return JSON only in this shape:
{
  "suggestions": [
    {
      "name": "examplelabel",
      "construction": "invented",
      "bucket": "registerable",
      "reasoning": "One concise sentence.",
      "likelihood": 70
    }
  ],
  "analysis": {
    "competition": "Brief naming landscape note.",
    "recommendation": "Brief ending and naming recommendation."
  }
}

Construction values must be one of: real-word, compound, blend, invented, abbreviation. Bucket values must be registerable or aftermarket.`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: unknown = await req.json();
    if (!isRecord(body)) throw new Error("Request body must be a JSON object");

    const query = typeof body.query === "string" ? body.query.trim() : "";
    if (!query) throw new Error("A search query is required");

    const endings = sanitizeEndings(body.endings);
    const settings = sanitizeSettings(body.settings);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: buildSystemPrompt(settings) },
          {
            role: "user",
            content: `Business brief: "${query}"\nPreferred endings, in priority order: ${endings.join(", ")}\nTone: ${settings.tone}\nStyle: ${settings.style}\nAllowed constructions: ${settings.constructions.join(", ")}\nLength preference: ${settings.length}`,
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return jsonResponse(
          { error: "Rate limit exceeded. Please try again later." },
          429,
        );
      }
      if (response.status === 402) {
        return jsonResponse(
          { error: "Payment required. Please add credits to your workspace." },
          402,
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResponse: unknown = await response.json();
    const content =
      isRecord(aiResponse) &&
      Array.isArray(aiResponse.choices) &&
      isRecord(aiResponse.choices[0]) &&
      isRecord(aiResponse.choices[0].message)
        ? aiResponse.choices[0].message.content
        : undefined;

    let parsed: unknown;
    try {
      parsed = typeof content === "string" ? JSON.parse(content) : null;
    } catch {
      console.error("Failed to parse AI response:", content);
      throw new Error("Invalid AI response format");
    }

    const suggestions = parseSuggestions(parsed);
    if (suggestions.length === 0) {
      throw new Error("The generator returned no usable names");
    }

    const candidates = buildCandidates(suggestions, endings);
    const endpoints = await getRdapEndpoints();
    await runInBatches(candidates, RDAP_BATCH_SIZE, async (candidate) => {
      const outcome = await checkRdap(candidate, endpoints);
      candidate.status = outcome.status;
      candidate.statusDetail = outcome.statusDetail;
      candidate.registrar = outcome.registrar;
      candidate.registeredYear = outcome.registeredYear;
      candidate.nameservers = outcome.nameservers;
      candidate.parked = outcome.parked;
      candidate.parkedSignals = outcome.parkedSignals;
    });

    const porkbunActive = await applyRegistrarChecks(candidates);
    const analysis =
      isRecord(parsed) && isRecord(parsed.analysis)
        ? {
            competition:
              typeof parsed.analysis.competition === "string"
                ? parsed.analysis.competition
                : undefined,
            recommendation:
              typeof parsed.analysis.recommendation === "string"
                ? parsed.analysis.recommendation
                : undefined,
          }
        : null;

    return jsonResponse({
      success: true,
      results: candidates,
      analysis,
      settings,
      layers: {
        rdap: true,
        porkbun: porkbunActive,
      },
    });
  } catch (error) {
    console.error("Error in suggest-domains:", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});
