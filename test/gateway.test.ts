import { describe, expect, it } from "vitest";
import { chat, configFromEnv, roleConfigsFromEnv } from "../src/llm/gateway.js";

describe("per-role model config", () => {
  const env = { LLM_BASE_URL: "http://r/v1/", LLM_MODEL: "mistral", LLM_NARRATOR_MODEL: "deep", LLM_CHRONICLER_BASE_URL: "https://api.anthropic.com/v1", LLM_CHRONICLER_API_KEY: "k", LLM_CHRONICLER_MODEL: "sonnet", LLM_CHRONICLER_VENICE_PARAMS: "0" };
  it("roles inherit the shared values and override them individually", () => {
    const c = roleConfigsFromEnv(env);
    expect(c.referee).toMatchObject({ baseUrl: "http://r/v1", model: "mistral", veniceParams: true });
    expect(c.narrator).toMatchObject({ baseUrl: "http://r/v1", model: "deep", veniceParams: true });
    expect(c.chronicler).toMatchObject({ baseUrl: "https://api.anthropic.com/v1", model: "sonnet", apiKey: "k", veniceParams: false, provider: "openai" });
  });
  it("a claude- model selects the Anthropic provider and needs a key, not a base url", () => {
    expect(configFromEnv("narrator", { LLM_NARRATOR_MODEL: "claude-haiku-4-5" })).toBeNull();
    const c = configFromEnv("narrator", { LLM_NARRATOR_MODEL: "claude-haiku-4-5", ANTHROPIC_API_KEY: "k" });
    expect(c).toMatchObject({ provider: "anthropic", model: "claude-haiku-4-5", apiKey: "k" });
    expect(configFromEnv("chronicler", { LLM_CHRONICLER_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "k" })?.model).toBe("claude-opus-5");
    expect(configFromEnv("referee", { LLM_BASE_URL: "http://r", LLM_MODEL: "mistral", ANTHROPIC_API_KEY: "k" })?.provider).toBe("openai");
  });
  it("the Anthropic path sends system separately and reads text blocks; a refusal yields null", async () => {
    let body: Record<string, unknown> = {};
    const fake = (async (_url: unknown, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ id: "m", type: "message", role: "assistant", model: "claude-haiku-4-5", stop_reason: "end_turn", content: [{ type: "text", text: "Stone answers stone." }], usage: { input_tokens: 12, output_tokens: 4 } }), { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    const cfg = { provider: "anthropic" as const, baseUrl: "", apiKey: "k", model: "claude-haiku-4-5", timeoutMs: 5000, veniceParams: false };
    const r = await chat(cfg, [{ role: "system", content: "Narrate." }, { role: "user", content: "Go." }], { maxTokens: 100, temperature: 0.8 }, fake);
    expect(r?.text).toBe("Stone answers stone.");
    expect(body.system).toBe("Narrate.");
    expect(body.messages).toEqual([{ role: "user", content: "Go." }]);
    expect(body.model).toBe("claude-haiku-4-5");
    const refusing = (async () => new Response(JSON.stringify({ id: "m", type: "message", role: "assistant", model: "claude-haiku-4-5", stop_reason: "refusal", stop_details: { type: "refusal", category: null }, content: [], usage: { input_tokens: 1, output_tokens: 0 } }), { status: 200, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
    expect(await chat(cfg, [{ role: "user", content: "Go." }], { maxTokens: 10 }, refusing)).toBeNull();
  });
  it("no base url means no model for that role", () => {
    expect(configFromEnv("referee", {})).toBeNull();
    expect(configFromEnv("narrator", { LLM_NARRATOR_BASE_URL: "http://x" })?.model).toBe("router");
  });
});

import { countdownText } from "../src/adapters/telegram.js";
describe("countdown text", () => {
  it("formats hours, minutes and done", () => {
    expect(countdownText("forage", 1000 + 2 * 3_600_000, 1000)).toBe("Forage: 2h 00m left.");
    expect(countdownText("vigil", 1000 + 7 * 60_000, 1000)).toBe("Keep vigil: 7m left.");
    expect(countdownText("lodge", 1000, 2000)).toContain("done");
  });
});
