import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, endings } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `You are a domain name expert helping users find the perfect domain name. 
Given a brand name, business idea, or keywords, suggest creative and memorable domain names.

Consider these factors:
- Memorability and brandability
- Avoiding trademark conflicts
- Shorter is better
- Easy to spell and pronounce
- Relevance to the business/idea

Return a JSON response with this structure:
{
  "suggestions": [
    {
      "name": "domainname",
      "reasoning": "Brief explanation why this is a good choice"
    }
  ],
  "analysis": {
    "competition": "Brief analysis of competition for similar names",
    "recommendation": "Which type of domain ending would work best and why"
  }
}

Generate 8-10 unique name suggestions (without the extension). Focus on creative variations, abbreviations, and combinations.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { 
            role: "user", 
            content: `Help me find domain names for: "${query}"\n\nPreferred extensions: ${endings.join(", ")}` 
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required. Please add credits to your workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content;
    
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      console.error("Failed to parse AI response:", content);
      throw new Error("Invalid AI response format");
    }

    // Generate domain combinations with pricing
    const availableDomains = [];
    const premiumDomains = [];
    
    const registrars = ["Namecheap", "Cloudflare", "Porkbun", "Google Domains", "GoDaddy"];
    const premiumRegistrars = ["Afternic", "Sedo", "Dan.com", "Epik"];
    
    const basePrices: Record<string, number> = {
      ".com": 12,
      ".io": 45,
      ".co": 28,
      ".app": 15,
      ".tech": 8,
      ".dev": 14,
      ".ai": 80,
      ".xyz": 5,
      ".net": 13,
      ".org": 14,
      ".ngo": 50,
      ".me": 18,
      ".bio": 25,
      ".cv": 35,
      ".foundation": 40,
      ".name": 12,
    };

    const renewPrices: Record<string, number> = {
      ".com": 14,
      ".io": 60,
      ".co": 32,
      ".app": 18,
      ".tech": 35,
      ".dev": 16,
      ".ai": 90,
      ".xyz": 14,
      ".net": 16,
      ".org": 16,
      ".ngo": 55,
      ".me": 22,
      ".bio": 28,
      ".cv": 40,
      ".foundation": 45,
      ".name": 14,
    };

    const trustScores: Record<string, number> = {
      ".com": 95,
      ".org": 90,
      ".net": 85,
      ".io": 82,
      ".co": 80,
      ".app": 78,
      ".dev": 78,
      ".ai": 75,
      ".tech": 70,
      ".me": 68,
      ".bio": 65,
      ".xyz": 55,
      ".ngo": 88,
      ".cv": 60,
      ".foundation": 82,
      ".name": 62,
    };

    // Create available domains from suggestions
    for (const suggestion of parsed.suggestions?.slice(0, 6) || []) {
      for (const ending of endings.slice(0, 2)) {
        const price = basePrices[ending] || 15;
        const renewPrice = renewPrices[ending] || price + 5;
        const trustScore = trustScores[ending] || 60;
        availableDomains.push({
          domain: `${suggestion.name.toLowerCase().replace(/[^a-z0-9]/g, "")}${ending}`,
          price: `$${price}/yr`,
          renewPrice: `$${renewPrice}/yr`,
          trustScore,
          type: "available",
          registrar: registrars[Math.floor(Math.random() * registrars.length)],
          reasoning: suggestion.reasoning,
        });
      }
    }

    // Create premium domains
    const premiumNames = parsed.suggestions?.slice(0, 4) || [];
    for (const suggestion of premiumNames) {
      const premiumPrice = Math.floor(Math.random() * 4000) + 500;
      const isAuction = Math.random() > 0.5;
      premiumDomains.push({
        domain: `${suggestion.name.toLowerCase().replace(/[^a-z0-9]/g, "")}.com`,
        price: `$${premiumPrice.toLocaleString()}`,
        renewPrice: `$14/yr`,
        trustScore: 95,
        type: isAuction ? "auction" : "premium",
        registrar: premiumRegistrars[Math.floor(Math.random() * premiumRegistrars.length)],
        reasoning: suggestion.reasoning,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        available: availableDomains.slice(0, 6),
        premium: premiumDomains.slice(0, 4),
        analysis: parsed.analysis,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in suggest-domains:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
