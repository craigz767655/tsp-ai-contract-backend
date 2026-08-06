// ─────────────────────────────────────────────────────────────────────────────
// Aria — TSP AI Contract's AI engine.
//
// Ported from the POC's proven analysis service and hardened for reliability:
//   • per-call timeout (AbortController) so a hung provider can't stall a request
//   • one automatic retry per provider on transient failure
//   • OpenAI primary, Gemini fallback
//   • strict JSON output + defensive normalisation (never trust raw model output)
//   • NO silent stub fallback — if all providers fail, the error surfaces
// ─────────────────────────────────────────────────────────────────────────────
import { env, hasAnyAiProvider } from "../lib/env";

const TIMEOUT_MS = 60_000;

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    // single retry on transient failure (network blip, 429, 5xx, timeout)
    return await fn();
  }
}

async function callOpenAIJSON(system: string, user: string): Promise<any> {
  const res = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.openaiKey}`,
    },
    body: JSON.stringify({
      model: env.openaiModel,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.2,
    }),
  });
  if (!res.ok) throw new Error(`openai_${res.status}`);
  const data: any = await res.json();
  return JSON.parse(data.choices?.[0]?.message?.content || "{}");
}

async function callGeminiJSON(system: string, user: string): Promise<any> {
  const res = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${env.geminiModel}:generateContent?key=${env.geminiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${system}\n\nINPUT:\n${user}\n\nReturn ONLY valid JSON.` }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
      }),
    },
  );
  if (!res.ok) throw new Error(`gemini_${res.status}`);
  const data: any = await res.json();
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  return JSON.parse(raw.replace(/^```json\s*|```$/g, "").trim());
}

async function aiJSON(system: string, user: string): Promise<{ data: any; model: string }> {
  if (!hasAnyAiProvider()) throw new Error("NO_API_KEY");
  const errs: string[] = [];
  if (env.openaiKey) {
    try { return { data: await withRetry(() => callOpenAIJSON(system, user)), model: env.openaiModel }; }
    catch (e: any) { errs.push(`openai:${e.message}`); }
  }
  if (env.geminiKey) {
    try { return { data: await withRetry(() => callGeminiJSON(system, user)), model: env.geminiModel }; }
    catch (e: any) { errs.push(`gemini:${e.message}`); }
  }
  throw new Error(`ALL_PROVIDERS_FAILED: ${errs.join("; ")}`);
}

export const CLAUSE_TYPES = [
  "Liability", "Indemnity", "Termination", "IP", "Confidentiality", "SLA",
  "Payment", "GoverningLaw", "Acceptance", "ChangeRequest", "Cybersecurity", "Other",
] as const;

export type ExtractedClause = {
  clauseType: string;
  heading?: string;
  text: string;
  severity: "info" | "low" | "medium" | "high" | "critical";
  riskScore: number;
  aiSummary?: string;
};

export type ContractAnalysis = {
  executiveSummary: string;
  riskScore: number;
  clauses: ExtractedClause[];
  missingClauses: { clauseType: string; reason: string; severity: string }[];
  redlines: { original: string; suggested: string; reason: string; severity: string }[];
  modelUsed: string;
};

const ANALYSIS_SYSTEM = `You are Aria, an enterprise legal/procurement AI reviewing a contract for a professional-services firm that negotiates MSAs and SOWs. Identify clauses, score risk, flag missing critical clauses, and propose redlines. Allowed clauseType values: ${CLAUSE_TYPES.join(", ")}. Severity values: info|low|medium|high|critical. riskScore is integer 0-100.

Return JSON with this exact shape:
{
  "executiveSummary": "2-4 sentence plain-English summary",
  "riskScore": 0-100,
  "clauses": [{"clauseType":"...","heading":"...","text":"verbatim excerpt","severity":"...","riskScore":0-100,"aiSummary":"one sentence"}],
  "missingClauses": [{"clauseType":"...","reason":"why this matters","severity":"..."}],
  "redlines": [{"original":"existing language","suggested":"recommended replacement","reason":"why","severity":"..."}]
}

Focus on: limitation of liability, indemnification, IP ownership, termination, payment terms, SLAs, acceptance criteria, change governance, cybersecurity, governing law.`;

export async function analyzeContract(text: string): Promise<ContractAnalysis> {
  const truncated = text.length > 30_000 ? text.slice(0, 30_000) + "\n…[truncated]" : text;
  const { data, model } = await aiJSON(ANALYSIS_SYSTEM, truncated);
  return normalize(data, model);
}

function normalize(o: any, model: string): ContractAnalysis {
  const clamp = (n: any) => Math.max(0, Math.min(100, parseInt(n) || 0));
  const sev = (s: any) => (["info", "low", "medium", "high", "critical"].includes(s) ? s : "medium");
  const ct = (s: any) => ((CLAUSE_TYPES as readonly string[]).includes(s) ? s : "Other");
  return {
    executiveSummary: String(o.executiveSummary || ""),
    riskScore: clamp(o.riskScore),
    modelUsed: model,
    clauses: Array.isArray(o.clauses) ? o.clauses.map((c: any) => ({
      clauseType: ct(c.clauseType),
      heading: c.heading ? String(c.heading) : undefined,
      text: String(c.text || ""),
      severity: sev(c.severity) as any,
      riskScore: clamp(c.riskScore),
      aiSummary: c.aiSummary ? String(c.aiSummary) : undefined,
    })) : [],
    missingClauses: Array.isArray(o.missingClauses) ? o.missingClauses.map((m: any) => ({
      clauseType: ct(m.clauseType), reason: String(m.reason || ""), severity: sev(m.severity),
    })) : [],
    redlines: Array.isArray(o.redlines) ? o.redlines.map((r: any) => ({
      original: String(r.original || ""),
      suggested: String(r.suggested || ""),
      reason: String(r.reason || ""),
      severity: sev(r.severity),
    })) : [],
  };
}

// Aria chat — grounded Q&A over an optional contract context.
export async function ariaChat(question: string, contextText?: string): Promise<string> {
  const system = `You are Aria, a legal-contract assistant for a professional-services firm. Answer clearly and practically for MSA/SOW work. This is informational, not legal advice.`;
  const user = contextText
    ? `CONTRACT CONTEXT:\n${contextText.slice(0, 20_000)}\n\nQUESTION: ${question}\n\nReturn JSON: {"answer":"..."}`
    : `QUESTION: ${question}\n\nReturn JSON: {"answer":"..."}`;
  const { data } = await aiJSON(system, user);
  return String(data.answer || "");
}
