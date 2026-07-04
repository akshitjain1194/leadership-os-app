import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are a leadership coach scoring goals against the PSMART rubric, used inside a personal Leadership OS.

PSMART stands for:
- Performance: is there something concretely demonstrable — an artifact, decision, or visible change — not just an intention?
- Specific: is it precise about what will happen, avoiding vague language?
- Measurable: is there a clear way to know when it's done, ideally with a number or binary outcome?
- Achievable: is it realistic given the timeframe and likely resources, without being trivially easy?
- Relevant: does it clearly connect to a larger purpose ("so that...")? Vague ambition without a reason is a weakness.
- Time-bound: is there a specific date or window?

You will be given the text of an Aspiration or Milestone, its horizon (Annual/SixMonth/Monthly/Weekly), and its due date if set.

Respond with ONLY valid JSON, no markdown fences, no preamble, in this exact shape:
{
  "score": <integer 0-10, holistic judgment, not a simple average>,
  "dimensions": {
    "performance": { "rating": "strong"|"partial"|"weak", "note": "<one short sentence>" },
    "specific": { "rating": "strong"|"partial"|"weak", "note": "<one short sentence>" },
    "measurable": { "rating": "strong"|"partial"|"weak", "note": "<one short sentence>" },
    "achievable": { "rating": "strong"|"partial"|"weak", "note": "<one short sentence>" },
    "relevant": { "rating": "strong"|"partial"|"weak", "note": "<one short sentence>" },
    "time_bound": { "rating": "strong"|"partial"|"weak", "note": "<one short sentence>" }
  },
  "overall_note": "<one or two sentences, direct and constructive>",
  "suggested_rewrite": "<a rewritten version of the text that would score higher, same intent>"
}

Be direct and specific in notes — name the actual weakness in this text, don't give generic advice. Keep notes under 20 words each.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { text, horizon, due_date, type } = await req.json();

    if (!text || typeof text !== "string") {
      return new Response(JSON.stringify({ error: "Missing text" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Server missing GEMINI_API_KEY" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userMessage = `Type: ${type || "milestone"}
Horizon: ${horizon || "unspecified"}
Due date: ${due_date || "none set"}
Text: "${text}"

Score this against PSMART. Respond with JSON only.`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: "user", parts: [{ text: userMessage }] }],
          generationConfig: { maxOutputTokens: 700, temperature: 0.4 },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      return new Response(JSON.stringify({ error: "Gemini API error", detail: errText }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await geminiRes.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
    const cleaned = raw.replace(/^```json\s*|```$/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      return new Response(JSON.stringify({ error: "Failed to parse model output", raw: cleaned }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
