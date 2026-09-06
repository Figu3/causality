import { describe, expect, it } from "vitest";
import { configFromEnv, roleConfigsFromEnv } from "../src/llm/gateway.js";

describe("per-role model config", () => {
  const env = { LLM_BASE_URL: "http://r/v1/", LLM_MODEL: "mistral", LLM_NARRATOR_MODEL: "deep", LLM_CHRONICLER_BASE_URL: "https://api.anthropic.com/v1", LLM_CHRONICLER_API_KEY: "k", LLM_CHRONICLER_MODEL: "sonnet", LLM_CHRONICLER_VENICE_PARAMS: "0" };
  it("roles inherit the shared values and override them individually", () => {
    const c = roleConfigsFromEnv(env);
    expect(c.referee).toMatchObject({ baseUrl: "http://r/v1", model: "mistral", veniceParams: true });
    expect(c.narrator).toMatchObject({ baseUrl: "http://r/v1", model: "deep", veniceParams: true });
    expect(c.chronicler).toMatchObject({ baseUrl: "https://api.anthropic.com/v1", model: "sonnet", apiKey: "k", veniceParams: false });
  });
  it("no base url means no model for that role", () => {
    expect(configFromEnv("referee", {})).toBeNull();
    expect(configFromEnv("narrator", { LLM_NARRATOR_BASE_URL: "http://x" })?.model).toBe("router");
  });
});
