import { useState } from "react";
import { Globe, Info, Search, SlidersHorizontal, Sparkles } from "lucide-react";
import { DomainEndingSelector } from "@/components/DomainEndingSelector";
import { DomainResults } from "@/components/DomainResults";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { adaptLegacyResponse, type LegacyResponse } from "@/lib/liveBackend";
import { applyRdapChecks } from "@/lib/rdap";
import { cn } from "@/lib/utils";
import type {
  AnalysisResult,
  Construction,
  DomainResult,
  GeneratorSettings,
  NameLength,
  Style,
  SuggestDomainsResponse,
  Tone,
} from "@/lib/domainTypes";

const TONE_OPTIONS: Array<{ value: Tone; label: string }> = [
  { value: "serious", label: "Serious" },
  { value: "balanced", label: "Balanced" },
  { value: "playful", label: "Playful" },
];

const STYLE_OPTIONS: Array<{ value: Style; label: string }> = [
  { value: "structured", label: "Structured" },
  { value: "balanced", label: "Balanced" },
  { value: "inventive", label: "Inventive" },
];

const LENGTH_OPTIONS: Array<{ value: NameLength; label: string }> = [
  { value: "short", label: "Short" },
  { value: "medium", label: "Medium" },
  { value: "any", label: "Any length" },
];

const CONSTRUCTION_OPTIONS: Array<{ value: Construction; label: string }> = [
  { value: "real-word", label: "Real words" },
  { value: "compound", label: "Compounds" },
  { value: "blend", label: "Blends" },
  { value: "invented", label: "Invented" },
  { value: "abbreviation", label: "Abbreviations" },
];

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}

function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: SegmentedProps<T>) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-lg px-3 py-2 text-sm font-medium transition-all",
              value === option.value
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const Index = () => {
  const [query, setQuery] = useState("");
  const [selectedEndings, setSelectedEndings] = useState([
    ".com",
    ".io",
    ".co",
    ".app",
  ]);
  const [settings, setSettings] = useState<GeneratorSettings>({
    tone: "balanced",
    style: "balanced",
    constructions: ["real-word", "compound", "blend", "invented"],
    length: "any",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<DomainResult[]>([]);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [layers, setLayers] = useState<SuggestDomainsResponse["layers"] | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const { toast } = useToast();

  const toggleConstruction = (construction: Construction) => {
    setSettings((current) => {
      const selected = current.constructions.includes(construction);
      if (selected && current.constructions.length === 1) return current;
      return {
        ...current,
        constructions: selected
          ? current.constructions.filter((item) => item !== construction)
          : [...current.constructions, construction],
      };
    });
  };

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

    if (settings.constructions.length === 0) {
      toast({
        title: "Select a name type",
        description: "Please select at least one construction type.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setHasSearched(true);
    setAnalysis(null);
    setLayers(null);
    setResults([]);

    try {
      const { data, error } = await supabase.functions.invoke("suggest-domains", {
        body: { query, endings: selectedEndings, settings },
      });

      if (error) throw error;

      const response = data as LegacyResponse;
      if (response.error) {
        toast({
          title: "Error",
          description: response.error,
          variant: "destructive",
        });
        return;
      }

      // The live backend returns name ideas with unverified price and
      // registrar claims. The adapter keeps only names and reasoning;
      // every status shown comes from the RDAP pass below.
      const adapted = adaptLegacyResponse(response);
      setAnalysis(adapted.analysis);
      setLayers({ rdap: true, porkbun: false });
      const checked = await applyRdapChecks(
        adapted.results,
        adapted.aftermarketDomains
      );
      setResults(checked);
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
      <div className="mx-auto max-w-3xl px-4 py-12 sm:py-20">
        <div className="mb-12 text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-primary">
            <Globe className="h-4 w-4" />
            <span className="text-sm font-medium">Domain Research Tool</span>
          </div>
          <h1 className="mb-4 text-4xl font-bold text-foreground sm:text-5xl">
            Find Your Perfect
            <span className="gradient-primary bg-clip-text text-transparent"> Domain</span>
          </h1>
          <p className="mx-auto max-w-xl text-lg text-muted-foreground">
            AI name generation with live registry checks, parked-domain signals, and
            realistic availability odds.
          </p>
        </div>

        <div className="mb-12 space-y-6">
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && handleSearch()}
              placeholder="Enter your brand name, business idea, or keywords..."
              className="w-full rounded-2xl border border-border bg-card px-6 py-4 pr-32 text-foreground transition-all duration-200 placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <button
              onClick={handleSearch}
              disabled={isLoading}
              className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-2 rounded-xl bg-primary px-5 py-2.5 font-medium text-primary-foreground transition-all duration-200 hover:opacity-90 disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" />
              <span className="hidden sm:inline">Research</span>
              <Search className="h-4 w-4 sm:hidden" />
            </button>
          </div>

          <div className="space-y-6 rounded-2xl border border-border bg-card p-6">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-medium text-foreground">Generator settings</h3>
              </div>
              <p className="text-sm leading-6 text-muted-foreground">
                The generator favors 6+ letter invented names, blends, and compounds for
                .com. Short and one-word .com ideas are separated as aftermarket
                inspiration because comparable names are almost always registered.
              </p>
            </div>

            <div className="grid gap-6 sm:grid-cols-3">
              <SegmentedControl
                label="Tone"
                value={settings.tone}
                options={TONE_OPTIONS}
                onChange={(tone) => setSettings((current) => ({ ...current, tone }))}
              />
              <SegmentedControl
                label="Style"
                value={settings.style}
                options={STYLE_OPTIONS}
                onChange={(style) => setSettings((current) => ({ ...current, style }))}
              />
              <SegmentedControl
                label="Name length"
                value={settings.length}
                options={LENGTH_OPTIONS}
                onChange={(length) => setSettings((current) => ({ ...current, length }))}
              />
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Construction types
              </p>
              <div className="flex flex-wrap gap-2">
                {CONSTRUCTION_OPTIONS.map((option) => {
                  const selected = settings.constructions.includes(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => toggleConstruction(option.value)}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-sm font-medium transition-all",
                        selected
                          ? "border-primary/50 bg-primary/20 text-primary"
                          : "border-transparent bg-muted text-muted-foreground hover:bg-muted/80",
                      )}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6">
            <h3 className="mb-2 text-sm font-medium text-muted-foreground">
              Domain Type Preference
            </h3>
            <p className="mb-4 text-sm text-muted-foreground">
              Endings are checked in priority order, up to eight per search.
            </p>
            <DomainEndingSelector
              selectedEndings={selectedEndings}
              onEndingsChange={setSelectedEndings}
            />
          </div>
        </div>

        {layers && !isLoading && (
          <div className="mb-8 rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Checks used:</span>{" "}
            Layer 1, registry RDAP, is active. Layer 2, Porkbun price and premium
            confirmation, is {layers.porkbun ? "active" : "not configured"}.
          </div>
        )}

        {analysis && !isLoading && (
          <div className="mb-8 rounded-2xl border border-border bg-card p-5">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <Info className="h-5 w-5 text-primary" />
              </div>
              <div className="space-y-2">
                {analysis.competition && (
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">Competition:</span>{" "}
                    {analysis.competition}
                  </p>
                )}
                {analysis.recommendation && (
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">Recommendation:</span>{" "}
                    {analysis.recommendation}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {hasSearched && <DomainResults results={results} isLoading={isLoading} />}

        {!hasSearched && (
          <div className="py-16 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
              <Search className="h-8 w-8 text-muted-foreground" />
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
