import {
  Building2,
  CalendarDays,
  ExternalLink,
  Server,
  Tag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  Construction,
  DomainResult,
  DomainStatus,
} from "@/lib/domainTypes";

const STATUS_LABELS: Record<DomainStatus, string> = {
  available: "Available, registry clear",
  registered: "Registered",
  premium: "Premium, Porkbun confirmed",
  "premium-possible": "Premium price possible",
  unchecked: "Unchecked",
  unknown: "Check unavailable",
};

const CONSTRUCTION_LABELS: Record<Construction, string> = {
  "real-word": "Real word",
  compound: "Compound",
  blend: "Blend",
  invented: "Invented",
  abbreviation: "Abbreviation",
  other: "Name idea",
};

function statusClasses(status: DomainStatus): string {
  switch (status) {
    case "available":
      return "border-available/30 hover:border-available/60";
    case "premium":
    case "premium-possible":
      return "border-premium/40 hover:border-premium/70";
    case "registered":
      return "border-unavailable/30 hover:border-unavailable/50";
    default:
      return "border-border hover:border-muted-foreground/50";
  }
}

function badgeClasses(status: DomainStatus): string {
  switch (status) {
    case "available":
      return "bg-available/15 text-available";
    case "premium":
    case "premium-possible":
      return "bg-premium/15 text-premium";
    case "registered":
      return "bg-unavailable/15 text-unavailable";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function DomainCard(props: DomainResult) {
  const {
    domain,
    status,
    statusDetail,
    construction,
    reasoning,
    modelLikelihood,
    registrar,
    registeredYear,
    nameservers,
    parked,
    parkedSignals,
    price,
    priceCheckUrl,
  } = props;

  return (
    <article
      className={cn(
        "group relative rounded-xl border bg-card p-4 transition-all duration-300 hover:scale-[1.01]",
        statusClasses(status),
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="break-all font-mono text-lg font-semibold text-foreground">
              {domain}
            </h3>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-medium",
                badgeClasses(status),
              )}
            >
              {STATUS_LABELS[status]}
            </span>
            {parked !== "none" && (
              <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                Parked: {parked}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
              <Tag className="h-3 w-3" />
              {CONSTRUCTION_LABELS[construction]}
            </span>
            {modelLikelihood !== undefined && (
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-primary">
                Model estimate: {modelLikelihood}% free
              </span>
            )}
            {price?.premium && (
              <span className="rounded-full bg-premium/15 px-2 py-0.5 text-premium">
                Registry premium
              </span>
            )}
          </div>

          {reasoning && (
            <p className="text-sm leading-6 text-foreground/90">{reasoning}</p>
          )}
          <p className="text-sm leading-6 text-muted-foreground">{statusDetail}</p>

          {(registrar || registeredYear || nameservers.length > 0) && (
            <div className="space-y-1 text-xs text-muted-foreground">
              {registrar && (
                <p className="flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5" />
                  Registrar: {registrar}
                </p>
              )}
              {registeredYear && (
                <p className="flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5" />
                  Registered in {registeredYear}
                </p>
              )}
              {nameservers.length > 0 && (
                <p className="flex items-start gap-1.5">
                  <Server className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span className="break-all">
                    Nameservers: {nameservers.slice(0, 2).join(", ")}
                    {nameservers.length > 2 ? `, +${nameservers.length - 2} more` : ""}
                  </span>
                </p>
              )}
              {parkedSignals.length > 0 && (
                <p>Parking signal: {parkedSignals.join(", ")}</p>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end">
          {price ? (
            <div className="text-right">
              <p className="font-semibold text-foreground">
                ${price.amount.toFixed(2)} first year
              </p>
              <p className="text-xs text-muted-foreground">Price from Porkbun</p>
              {price.renewalAmount !== undefined && (
                <p className="text-xs text-muted-foreground">
                  Renewal: ${price.renewalAmount.toFixed(2)}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No live price loaded</p>
          )}
          <a
            href={priceCheckUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
          >
            Check price
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>
    </article>
  );
}
