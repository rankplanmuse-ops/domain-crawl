import { useState } from "react";
import { Search, Sparkles, Globe, Info } from "lucide-react";
import { DomainEndingSelector } from "@/components/DomainEndingSelector";
import { DomainResults } from "@/components/DomainResults";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface DomainResult {
  domain: string;
  price: string;
  type: "available" | "premium" | "auction";
  registrar?: string;
  reasoning?: string;
  renewPrice?: string;
  trustScore?: number;
}

interface AnalysisResult {
  competition?: string;
  recommendation?: string;
}

const Index = () => {
  const [query, setQuery] = useState("");
  const [selectedEndings, setSelectedEndings] = useState([".com", ".io", ".co", ".app"]);
  const [isLoading, setIsLoading] = useState(false);
  const [availableDomains, setAvailableDomains] = useState<DomainResult[]>([]);
  const [premiumDomains, setPremiumDomains] = useState<DomainResult[]>([]);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const { toast } = useToast();

  const handleSearch = async () => {
    if (!query.trim()) {
      toast({
        title: "Enter a name or idea",
        description: "Please enter a brand name, business idea, or keywords to search.",
        variant: "destructive",
      });
      return;
    }

    if (selectedEndings.length === 0) {
      toast({
        title: "Select domain endings",
        description: "Please select at least one domain ending.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setHasSearched(true);
    setShowMore(false);
    setAnalysis(null);

    try {
      const { data, error } = await supabase.functions.invoke("suggest-domains", {
        body: { query, endings: selectedEndings },
      });

      if (error) {
        throw error;
      }

      if (data.error) {
        toast({
          title: "Error",
          description: data.error,
          variant: "destructive",
        });
        return;
      }

      setAvailableDomains(data.available || []);
      setPremiumDomains(data.premium || []);
      setAnalysis(data.analysis || null);
    } catch (error) {
      console.error("Error searching domains:", error);
      toast({
        title: "Search failed",
        description: "Failed to get domain suggestions. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-12 sm:py-20">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-6">
            <Globe className="w-4 h-4" />
            <span className="text-sm font-medium">Domain Research Tool</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold text-foreground mb-4">
            Find Your Perfect
            <span className="gradient-primary bg-clip-text text-transparent"> Domain</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto">
            AI-powered domain suggestions based on competition, recognizability, and availability.
          </p>
        </div>

        {/* Search Section */}
        <div className="space-y-6 mb-12">
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Enter your brand name, business idea, or keywords..."
              className="w-full px-6 py-4 pr-32 rounded-2xl bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all duration-200"
            />
            <button
              onClick={handleSearch}
              disabled={isLoading}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium flex items-center gap-2 transition-all duration-200 hover:opacity-90 disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              <span className="hidden sm:inline">Research</span>
              <Search className="w-4 h-4 sm:hidden" />
            </button>
          </div>

          {/* Domain Ending Selector */}
          <div className="p-6 rounded-2xl bg-card border border-border">
            <h3 className="text-sm font-medium text-muted-foreground mb-4">
              Domain Type Preference
            </h3>
            <DomainEndingSelector
              selectedEndings={selectedEndings}
              onEndingsChange={setSelectedEndings}
            />
          </div>
        </div>

        {/* AI Analysis */}
        {analysis && !isLoading && (
          <div className="mb-8 p-5 rounded-2xl bg-card border border-border">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Info className="w-5 h-5 text-primary" />
              </div>
              <div className="space-y-2">
                {analysis.competition && (
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">Competition:</span> {analysis.competition}
                  </p>
                )}
                {analysis.recommendation && (
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">Recommendation:</span> {analysis.recommendation}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Results */}
        {hasSearched && (
          <DomainResults
            availableDomains={availableDomains}
            premiumDomains={premiumDomains}
            isLoading={isLoading}
            onMoreResearch={() => setShowMore(true)}
            showMore={showMore}
          />
        )}

        {/* Empty State */}
        {!hasSearched && (
          <div className="text-center py-16">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-muted flex items-center justify-center">
              <Search className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground">
              Enter a brand name or business idea to get started
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Index;
