/**
 * The one module that talks to a language model. OpenAI-compatible chat completions, so it works
 * against the NUC llm-router (cheaptokens-fed Venice key), Venice directly, or anything else with
 * the same shape. Every call is logged by the caller. Failures never throw into the game: they
 * return null and the game falls back to templates.
 */
import Anthropic, { type ClientOptions } from "@anthropic-ai/sdk";

export type Provider = "openai" | "anthropic";

export interface LlmConfig {
  provider: Provider;
  /** OpenAI-compatible endpoints only; ignored for Anthropic (the SDK knows its own base URL) */
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  /** Venice-backed endpoints prepend ~1,500 tokens of their own system prompt unless told not to. */
  veniceParams: boolean;
}

export interface LlmResult {
  text: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
}

export type Role = "referee" | "narrator" | "chronicler";

/**
 * One config per role. `LLM_<ROLE>_*` overrides the shared `LLM_*` values, so the referee can
 * stay on a cheap classifier while the narrator and chronicler use stronger models, on the same
 * endpoint or a different one.
 */
export function configFromEnv(role: Role = "referee", env: NodeJS.ProcessEnv = process.env): LlmConfig | null {
  const R = role.toUpperCase();
  const pick = (k: string): string | undefined => env[`LLM_${R}_${k}`] ?? env[`LLM_${k}`];
  const model = pick("MODEL");
  const explicit = pick("PROVIDER");
  const provider: Provider = explicit === "anthropic" || (!explicit && model?.startsWith("claude-")) ? "anthropic" : "openai";
  const baseUrl = pick("BASE_URL");
  if (provider === "openai" && !baseUrl) return null;
  if (provider === "anthropic" && !(pick("API_KEY") ?? env.ANTHROPIC_API_KEY)) return null;
  return {
    provider,
    baseUrl: (baseUrl ?? "").replace(/\/+$/, ""),
    apiKey: pick("API_KEY") ?? env.ANTHROPIC_API_KEY ?? "none",
    model: model ?? (provider === "anthropic" ? "claude-opus-5" : "router"),
    timeoutMs: Number(pick("TIMEOUT_MS") ?? 20_000),
    veniceParams: (pick("VENICE_PARAMS") ?? "1") !== "0",
  };
}

export interface RoleConfigs {
  referee: LlmConfig | null;
  narrator: LlmConfig | null;
  chronicler: LlmConfig | null;
}
export function roleConfigsFromEnv(env: NodeJS.ProcessEnv = process.env): RoleConfigs {
  return { referee: configFromEnv("referee", env), narrator: configFromEnv("narrator", env), chronicler: configFromEnv("chronicler", env) };
}

export type Fetch = typeof fetch;

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export async function chat(
  cfg: LlmConfig,
  messages: ChatMessage[],
  opts: { maxTokens: number; temperature?: number; json?: boolean },
  fetchImpl: Fetch = fetch,
): Promise<LlmResult | null> {
  if (cfg.provider === "anthropic") return chatAnthropic(cfg, messages, opts, fetchImpl);
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
    if (cfg.veniceParams) body.venice_parameters = { include_venice_system_prompt: false };
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

/** Claude through the official SDK. Same contract: text or null, never a throw into the game. */
async function chatAnthropic(cfg: LlmConfig, messages: ChatMessage[], opts: { maxTokens: number; temperature?: number }, fetchImpl: Fetch): Promise<LlmResult | null> {
  const started = Date.now();
  const client = new Anthropic({ apiKey: cfg.apiKey, timeout: cfg.timeoutMs, maxRetries: 1, fetch: fetchImpl as unknown as ClientOptions["fetch"] });
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const turns: Anthropic.MessageParam[] = messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  try {
    const res = await client.messages.create({
      model: cfg.model,
      max_tokens: opts.maxTokens,
      ...(system ? { system } : {}),
      ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
      messages: turns,
    });
    if (res.stop_reason === "refusal") return null;
    const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
    if (!text.trim()) return null;
    return { text, model: res.model, promptTokens: res.usage.input_tokens, completionTokens: res.usage.output_tokens, latencyMs: Date.now() - started };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) console.error("anthropic: invalid API key");
    else if (err instanceof Anthropic.RateLimitError) console.error("anthropic: rate limited");
    else if (err instanceof Anthropic.APIError) console.error(`anthropic: ${err.status} ${err.message}`);
    else console.error("anthropic:", err);
    return null;
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
