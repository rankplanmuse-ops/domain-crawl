import { useMemo } from "react";
import { Loader2 } from "lucide-react";
import { DomainCard } from "./DomainCard";
import type { DomainResult } from "@/lib/domainTypes";

interface DomainResultsProps {
  results: DomainResult[];
  isLoading: boolean;
}

type GroupKey = "available" | "parked" | "registered" | "aftermarket" | "unconfirmed";

interface ResultGroup {
  key: GroupKey;
  title: string;
  description: string;
  domains: DomainResult[];
}

function groupFor(domain: DomainResult): GroupKey {
  if (domain.bucket === "aftermarket") return "aftermarket";
  if (domain.status === "registered" && domain.parked !== "none") return "parked";
  if (
    domain.status === "available" ||
    domain.status === "premium" ||
    domain.status === "premium-possible"
  ) {
    return "available";
  }
  if (domain.status === "registered") return "registered";
  return "unconfirmed";
}

const GROUP_COPY: Record<GroupKey, { title: string; description: string }> = {
  available: {
    title: "Available, registry clear",
    description:
      "No registry record was returned. Some TLDs can still apply premium or reserved pricing, so confirm the final price at a registrar.",
  },
  parked: {
    title: "Parked",
    description:
      "Registered names whose nameservers point to a parking or sale lander pattern. Treat this as a signal, not proof that the owner will sell.",
  },
  registered: {
    title: "Registered",
    description: "The registry returned a live domain record for these names.",
  },
  aftermarket: {
    title: "Aftermarket ideas",
    description:
      "Short, one-word, or dictionary-led ideas are shown as purchase or inspiration candidates because comparable .com names are almost always registered.",
  },
  unconfirmed: {
    title: "Status not confirmed",
    description:
      "RDAP did not produce a definitive answer for these names, or the TLD has no public RDAP endpoint in the IANA bootstrap.",
  },
};

const GROUP_ORDER: GroupKey[] = [
  "available",
  "parked",
  "registered",
  "aftermarket",
  "unconfirmed",
];

export function DomainResults({ results, isLoading }: DomainResultsProps) {
  const groups = useMemo<ResultGroup[]>(() => {
    const grouped = new Map<GroupKey, DomainResult[]>();
    for (const group of GROUP_ORDER) grouped.set(group, []);

    for (const result of results) {
      grouped.get(groupFor(result))?.push(result);
    }

    return GROUP_ORDER.map((key) => ({
      key,
      ...GROUP_COPY[key],
      domains: [...(grouped.get(key) ?? [])].sort((a, b) => {
        const likelihood = (b.modelLikelihood ?? 0) - (a.modelLikelihood ?? 0);
        return likelihood !== 0 ? likelihood : a.domain.localeCompare(b.domain);
      }),
    })).filter((group) => group.domains.length > 0);
  }, [results]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center space-y-4 py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <div className="space-y-1 text-center">
          <p className="text-muted-foreground">Generating names and checking registry records...</p>
          <p className="text-sm text-muted-foreground">
            RDAP checks run in small batches to respect registry limits.
          </p>
        </div>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-center text-muted-foreground">
        No usable names came back. Try a clearer brief or broaden the generator settings.
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="font-semibold text-foreground">Live status summary</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Statuses come from registry RDAP records. Prices appear only when the optional
          Porkbun layer is configured and returns a quote.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {groups.map((group) => (
            <span
              key={group.key}
              className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground"
            >
              {group.title}: {group.domains.length}
            </span>
          ))}
        </div>
      </div>

      {groups.map((group) => (
        <section key={group.key} className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{group.title}</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {group.description}
            </p>
          </div>
          <div className="grid gap-3">
            {group.domains.map((domain) => (
              <DomainCard key={domain.domain} {...domain} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
