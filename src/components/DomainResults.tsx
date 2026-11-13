import { useState, useMemo } from "react";
import { DomainCard } from "./DomainCard";
import { Loader2, ChevronDown, ArrowUpDown } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface DomainResult {
  domain: string;
  price: string;
  type: "available" | "premium" | "auction";
  registrar?: string;
  renewPrice?: string;
  trustScore?: number;
}

type SortOption = "name" | "price" | "renewPrice" | "trustScore";

interface DomainResultsProps {
  availableDomains: DomainResult[];
  premiumDomains: DomainResult[];
  isLoading: boolean;
  onMoreResearch: () => void;
  showMore: boolean;
}

const parsePrice = (price: string): number => {
  const num = parseFloat(price.replace(/[^0-9.]/g, ""));
  return isNaN(num) ? 0 : num;
};

export function DomainResults({
  availableDomains,
  premiumDomains,
  isLoading,
  onMoreResearch,
  showMore,
}: DomainResultsProps) {
  const [sortBy, setSortBy] = useState<SortOption>("trustScore");

  const sortDomains = (domains: DomainResult[]): DomainResult[] => {
    return [...domains].sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.domain.localeCompare(b.domain);
        case "price":
          return parsePrice(a.price) - parsePrice(b.price);
        case "renewPrice":
          return parsePrice(a.renewPrice || a.price) - parsePrice(b.renewPrice || b.price);
        case "trustScore":
          return (b.trustScore || 0) - (a.trustScore || 0);
        default:
          return 0;
      }
    });
  };

  const sortedAvailable = useMemo(() => sortDomains(availableDomains), [availableDomains, sortBy]);
  const sortedPremium = useMemo(() => sortDomains(premiumDomains), [premiumDomains, sortBy]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
        <p className="text-muted-foreground">Researching domains...</p>
      </div>
    );
  }

  if (availableDomains.length === 0 && premiumDomains.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Sort Controls */}
      <div className="flex items-center justify-end gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ArrowUpDown className="w-4 h-4" />
          <span>Sort by:</span>
        </div>
        <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortOption)}>
          <SelectTrigger className="w-40 bg-card border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="trustScore">Trust Score</SelectItem>
            <SelectItem value="price">Price</SelectItem>
            <SelectItem value="renewPrice">Renew Price</SelectItem>
            <SelectItem value="name">Name</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {sortedAvailable.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-available animate-pulse" />
            <h2 className="text-lg font-semibold text-foreground">
              Best Available Domains
            </h2>
          </div>
          <div className="grid gap-3">
            {sortedAvailable.slice(0, showMore ? undefined : 3).map((domain) => (
              <DomainCard key={domain.domain} {...domain} />
            ))}
          </div>
        </div>
      )}

      {sortedPremium.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            <h2 className="text-lg font-semibold text-foreground">
              Premium & Auction Domains
            </h2>
          </div>
          <div className="grid gap-3">
            {sortedPremium.slice(0, showMore ? undefined : 3).map((domain) => (
              <DomainCard key={domain.domain} {...domain} />
            ))}
          </div>
        </div>
      )}

      {(sortedAvailable.length > 3 || sortedPremium.length > 3) && !showMore && (
        <button
          onClick={onMoreResearch}
          className="w-full py-3 rounded-xl border border-border bg-secondary/50 text-secondary-foreground font-medium transition-all duration-200 hover:bg-secondary flex items-center justify-center gap-2"
        >
          <span>More Research</span>
          <ChevronDown className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
