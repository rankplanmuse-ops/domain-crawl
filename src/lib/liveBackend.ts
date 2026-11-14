import type { AnalysisResult, DomainResult } from "./domainTypes";

/**
 * Adapter for the live suggest-domains backend.
 * The deployed function is the original Lovable build: it returns
 * { success, available[], premium[], analysis } where each item carries
 * a domain, a reasoning blurb and a model score, plus price and
 * registrar claims that are NOT verified and must never reach the UI.
 * This adapter keeps only the names, the reasoning and the score, and
 * drops every price, registrar and availability claim; the real status
 * for each name comes from the client-side RDAP pass in rdap.ts.
 */

interface LegacyItem {
  domain?: string;
  reasoning?: string;
  trustScore?: number;
}

export interface LegacyResponse {
  success?: boolean;
  available?: LegacyItem[];
  premium?: LegacyItem[];
  analysis?: AnalysisResult;
  error?: string;
}

export interface AdaptedSearch {
  results: DomainResult[];
  /** Domains the backend listed as premium/aftermarket candidates. */
  aftermarketDomains: Set<string>;
  analysis: AnalysisResult | null;
}

export function adaptLegacyResponse(data: LegacyResponse): AdaptedSearch {
  const byDomain = new Map<string, DomainResult>();
  const aftermarketDomains = new Set<string>();

  const addItems = (items: LegacyItem[] | undefined, premium: boolean) => {
    for (const item of items ?? []) {
      const domain = item.domain?.trim().toLowerCase();
      if (!domain || !domain.includes(".")) continue;
      if (premium) aftermarketDomains.add(domain);
      const existing = byDomain.get(domain);
      if (existing) {
        if (!existing.reasoning && item.reasoning) {
          existing.reasoning = item.reasoning;
        }
        if (typeof item.trustScore === "number") {
          existing.modelLikelihood = Math.max(
            existing.modelLikelihood ?? 0,
            item.trustScore / 100
          );
        }
        continue;
      }
      const firstDot = domain.indexOf(".");
      byDomain.set(domain, {
        domain,
        name: domain.slice(0, firstDot),
        tld: domain.slice(firstDot),
        bucket: "registerable",
        construction: "other",
        reasoning: item.reasoning,
        modelLikelihood:
          typeof item.trustScore === "number"
            ? item.trustScore / 100
            : undefined,
        status: "unchecked",
        statusDetail: "Waiting for the registry check.",
        nameservers: [],
        parked: "none",
        parkedSignals: [],
        priceCheckUrl: `https://porkbun.com/checkout/search?q=${encodeURIComponent(domain)}`,
      });
    }
  };

  addItems(data.available, false);
  addItems(data.premium, true);

  return {
    results: [...byDomain.values()],
    aftermarketDomains,
    analysis: data.analysis ?? null,
  };
}
