import { ExternalLink, ShoppingCart, Gavel, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

interface DomainCardProps {
  domain: string;
  price: string;
  type: "available" | "premium" | "auction";
  registrar?: string;
  renewPrice?: string;
  trustScore?: number;
}

export function DomainCard({ domain, price, type, registrar, renewPrice, trustScore }: DomainCardProps) {
  const isAvailable = type === "available";
  const isPremium = type === "premium" || type === "auction";

  return (
    <div
      className={cn(
        "group relative p-4 rounded-xl border transition-all duration-300 hover:scale-[1.02]",
        isAvailable && "bg-card border-available/30 hover:border-available/60 hover:glow-primary",
        isPremium && "bg-card border-accent/30 hover:border-accent/60 hover:glow-premium"
      )}
    >
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-lg font-semibold text-foreground">
              {domain}
            </span>
            {type === "auction" && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-accent/20 text-accent">
                <Gavel className="w-3 h-3" />
                Auction
              </span>
            )}
            {type === "premium" && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-accent/20 text-accent">
                Premium
              </span>
            )}
            {trustScore !== undefined && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-primary/20 text-primary">
                <Shield className="w-3 h-3" />
                {trustScore}%
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {registrar && (
              <p className="text-xs text-muted-foreground">{registrar}</p>
            )}
            {renewPrice && (
              <p className="text-xs text-muted-foreground">Renew: {renewPrice}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span
            className={cn(
              "font-semibold",
              isAvailable && "text-available",
              isPremium && "text-accent"
            )}
          >
            {price}
          </span>
          <button
            className={cn(
              "p-2 rounded-lg transition-all duration-200",
              isAvailable && "bg-available text-available-foreground hover:bg-available/90",
              isPremium && "bg-accent text-accent-foreground hover:bg-accent/90"
            )}
          >
            {isPremium ? (
              <ExternalLink className="w-4 h-4" />
            ) : (
              <ShoppingCart className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
