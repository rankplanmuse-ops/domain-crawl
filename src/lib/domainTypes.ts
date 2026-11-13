export type Tone = "serious" | "balanced" | "playful";
export type Style = "structured" | "balanced" | "inventive";
export type NameLength = "short" | "medium" | "any";
export type Construction =
  | "real-word"
  | "compound"
  | "blend"
  | "invented"
  | "abbreviation"
  | "other";

export interface GeneratorSettings {
  tone: Tone;
  style: Style;
  constructions: Construction[];
  length: NameLength;
}

export type DomainStatus =
  | "available"
  | "registered"
  | "premium"
  | "premium-possible"
  | "unchecked"
  | "unknown";

export type ParkedConfidence = "likely" | "possible" | "none";
export type CandidateBucket = "registerable" | "aftermarket";

export interface DomainPrice {
  amount: number;
  renewalAmount?: number;
  currency: "USD";
  period: "first-year";
  source: "Porkbun";
  premium: boolean;
}

export interface DomainResult {
  domain: string;
  name: string;
  tld: string;
  bucket: CandidateBucket;
  construction: Construction;
  reasoning?: string;
  modelLikelihood?: number;
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

export interface AnalysisResult {
  competition?: string;
  recommendation?: string;
}

export interface SuggestDomainsResponse {
  success: boolean;
  results: DomainResult[];
  analysis: AnalysisResult | null;
  settings: GeneratorSettings;
  layers: {
    rdap: boolean;
    porkbun: boolean;
  };
  error?: string;
}
