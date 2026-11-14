import type { DomainResult, ParkedConfidence } from "./domainTypes";

/**
 * Client-side RDAP availability checks.
 * rdap.org redirects to the authoritative registry server for the TLD
 * and returns CORS headers, so a static site can run these checks in
 * the browser: HTTP 404 means the registry has no record (the name is
 * registerable), HTTP 200 means a live registration exists. Checks run
 * in small batches to respect registry rate limits.
 */

const PARKING_NS_DOMAINS = [
  "sedoparking.com",
  "dan.com",
  "afternic.com",
  "bodis.com",
  "parkingcrew.net",
  "above.com",
  "parklogic.com",
  "hugedomains.com",
  "atom.com",
  "saw.com",
  "efty.com",
  "uniregistrymarket.link",
];

export interface RdapOutcome {
  status: "available" | "registered" | "unknown";
  nameservers: string[];
  registrar?: string;
  registeredYear?: number;
  parked: ParkedConfidence;
  parkedSignals: string[];
}

interface RdapNameserver {
  ldhName?: string;
}

interface RdapEvent {
  eventAction?: string;
  eventDate?: string;
}

interface RdapEntity {
  roles?: string[];
  vcardArray?: [string, Array<[string, unknown, string, string]>];
}

interface RdapResponse {
  nameservers?: RdapNameserver[];
  events?: RdapEvent[];
  entities?: RdapEntity[];
}

function assessParked(nameservers: string[]): {
  parked: ParkedConfidence;
  parkedSignals: string[];
} {
  const signals: string[] = [];
  let likely = false;
  let possible = false;
  for (const ns of nameservers) {
    const host = ns.toLowerCase();
    const match = PARKING_NS_DOMAINS.find(
      (p) => host === p || host.endsWith(`.${p}`)
    );
    if (match) {
      likely = true;
      signals.push(`Nameserver ${host} belongs to parking provider ${match}.`);
    } else if (host.includes("park")) {
      possible = true;
      signals.push(`Nameserver ${host} looks like a parking host.`);
    }
  }
  return {
    parked: likely ? "likely" : possible ? "possible" : "none",
    parkedSignals: signals,
  };
}

function extractRegistrar(entities?: RdapEntity[]): string | undefined {
  const registrar = entities?.find((e) => e.roles?.includes("registrar"));
  const props = registrar?.vcardArray?.[1];
  const fn = props?.find((p) => p[0] === "fn");
  return typeof fn?.[3] === "string" ? fn[3] : undefined;
}

export async function checkDomainRdap(domain: string): Promise<RdapOutcome> {
  const empty: RdapOutcome = {
    status: "unknown",
    nameservers: [],
    parked: "none",
    parkedSignals: [],
  };
  try {
    const res = await fetch(
      `https://rdap.org/domain/${encodeURIComponent(domain)}`,
      { headers: { Accept: "application/rdap+json" } }
    );
    if (res.status === 404) {
      return { ...empty, status: "available" };
    }
    if (!res.ok) return empty;
    const json = (await res.json()) as RdapResponse;
    const nameservers = (json.nameservers ?? [])
      .map((n) => n.ldhName)
      .filter((n): n is string => typeof n === "string");
    const registration = json.events?.find(
      (e) => e.eventAction === "registration"
    );
    const year = registration?.eventDate
      ? Number(registration.eventDate.slice(0, 4))
      : undefined;
    const { parked, parkedSignals } = assessParked(nameservers);
    return {
      status: "registered",
      nameservers,
      registrar: extractRegistrar(json.entities),
      registeredYear: Number.isFinite(year) ? year : undefined,
      parked,
      parkedSignals,
    };
  } catch {
    return empty;
  }
}

/**
 * Run RDAP checks over adapted results in batches of 4 and merge the
 * outcomes. Names the generator listed as aftermarket candidates flip
 * to the aftermarket bucket when the registry confirms they are taken.
 */
export async function applyRdapChecks(
  results: DomainResult[],
  aftermarketDomains: Set<string>
): Promise<DomainResult[]> {
  const merged = new Map<string, DomainResult>(
    results.map((r) => [r.domain, r])
  );
  const queue = results.slice(0, 24);
  for (let i = 0; i < queue.length; i += 4) {
    const batch = queue.slice(i, i + 4);
    const outcomes = await Promise.all(
      batch.map((r) => checkDomainRdap(r.domain))
    );
    batch.forEach((result, idx) => {
      const outcome = outcomes[idx];
      const base = merged.get(result.domain);
      if (!base) return;
      if (outcome.status === "available") {
        merged.set(result.domain, {
          ...base,
          status: "available",
          statusDetail:
            "Registry RDAP returned no record for this name, so it can be registered at standard prices unless the registry reserves it.",
          bucket: "registerable",
        });
      } else if (outcome.status === "registered") {
        merged.set(result.domain, {
          ...base,
          status: "registered",
          statusDetail: outcome.registeredYear
            ? `Registry RDAP returned a live record, first registered in ${outcome.registeredYear}.`
            : "Registry RDAP returned a live record for this name.",
          nameservers: outcome.nameservers,
          registrar: outcome.registrar,
          registeredYear: outcome.registeredYear,
          parked: outcome.parked,
          parkedSignals: outcome.parkedSignals,
          bucket: aftermarketDomains.has(result.domain)
            ? "aftermarket"
            : base.bucket,
        });
      } else {
        merged.set(result.domain, {
          ...base,
          status: "unknown",
          statusDetail:
            "RDAP did not return a definitive answer for this name.",
        });
      }
    });
  }
  return results.map((r) => merged.get(r.domain) ?? r);
}
