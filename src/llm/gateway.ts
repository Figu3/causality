/**
 * The one module that talks to a language model. OpenAI-compatible chat completions, so it works
 * against the NUC llm-router (cheaptokens-fed Venice key), Venice directly, or anything else with
 * the same shape. Every call is logged by the caller. Failures never throw into the game: they
 * return null and the game falls back to templates.
 */
export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
}

export interface LlmResult {
  text: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
}

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): LlmConfig | null {
  const baseUrl = env.LLM_BASE_URL;
  if (!baseUrl) return null;
  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    apiKey: env.LLM_API_KEY ?? "none",
    model: env.LLM_MODEL ?? "router",
    timeoutMs: Number(env.LLM_TIMEOUT_MS ?? 20_000),
  };
}

export type Fetch = typeof fetch;

export async function chat(
  cfg: LlmConfig,
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  opts: { maxTokens: number; temperature?: number; json?: boolean },
  fetchImpl: Fetch = fetch,
): Promise<LlmResult | null> {
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
  try {
    const body: Record<string, unknown> = {
      model: cfg.model,
      messages,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature ?? 0.7,
    };
    if (opts.json) body.response_format = { type: "json_object" };
    const res = await fetchImpl(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      model?: string;
      choices?: { message?: { content?: string | null } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const text = data.choices?.[0]?.message?.content ?? "";
    if (!text.trim()) return null;
    return {
      text,
      model: data.model ?? cfg.model,
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
      latencyMs: Date.now() - started,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Pull the first JSON object out of a model reply that may wrap it in prose or fences. */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}
