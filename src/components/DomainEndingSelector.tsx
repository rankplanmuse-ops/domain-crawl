import { useState } from "react";
import { cn } from "@/lib/utils";
import { DOMAIN_PRESETS, COMMON_TLDS, ALL_TLDS, type PresetKey } from "@/data/tlds";

interface DomainEndingSelectorProps {
  selectedEndings: string[];
  onEndingsChange: (endings: string[]) => void;
}

export function DomainEndingSelector({
  selectedEndings,
  onEndingsChange,
}: DomainEndingSelectorProps) {
  const [activePreset, setActivePreset] = useState<PresetKey | null>("commercial");

  const handlePresetClick = (preset: PresetKey) => {
    setActivePreset(preset);
    onEndingsChange([...DOMAIN_PRESETS[preset]]);
  };

  const handleEndingToggle = (ending: string) => {
    setActivePreset(null);
    if (selectedEndings.includes(ending)) {
      onEndingsChange(selectedEndings.filter((e) => e !== ending));
    } else {
      onEndingsChange([...selectedEndings, ending]);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(DOMAIN_PRESETS) as PresetKey[]).map((preset) => (
          <button
            key={preset}
            onClick={() => handlePresetClick(preset)}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 capitalize",
              activePreset === preset
                ? "bg-primary text-primary-foreground glow-primary"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            )}
          >
            {preset === "ngo" ? "NGO" : preset === "full" ? "Full" : preset}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {COMMON_TLDS.map((ending) => (
          <button
            key={ending}
            onClick={() => handleEndingToggle(ending)}
            className={cn(
              "px-3 py-1.5 rounded-md text-sm font-mono transition-all duration-200",
              selectedEndings.includes(ending)
                ? "bg-primary/20 text-primary border border-primary/50"
                : "bg-muted text-muted-foreground hover:bg-muted/80 border border-transparent"
            )}
          >
            {ending}
          </button>
        ))}
        <span className={cn(
          "px-3 py-1.5 rounded-md text-sm font-mono transition-all duration-200",
          activePreset === "full"
            ? "text-primary"
            : "text-muted-foreground"
        )}>
          +{ALL_TLDS.length - COMMON_TLDS.length}
        </span>
      </div>
    </div>
  );
}
