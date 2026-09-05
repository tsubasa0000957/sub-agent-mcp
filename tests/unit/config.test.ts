import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/infra/config.js";

describe("configuration", () => {
  it("fails closed when Cloudflare configuration is incomplete", () => {
    expect(() =>
      loadConfig({ AUTH_MODE: "cloudflare", OPENAI_API_KEY: "test-key" }),
    ).toThrow("Cloudflare auth requires");
  });

  it("prefers the supplied inline key when no key file is configured", () => {
    const config = loadConfig({ OPENAI_API_KEY: "test-key", AUTH_MODE: "dev" });
    expect(config.openAiApiKey).toBe("test-key");
  });

  it("rejects development authentication in production", () => {
    expect(() =>
      loadConfig({ NODE_ENV: "production", AUTH_MODE: "dev", OPENAI_API_KEY: "test-key" }),
    ).toThrow("Production requires AUTH_MODE=cloudflare");
  });

  it("requires enough OpenAI concurrency for three actual parallel workers", () => {
    expect(() =>
      loadConfig({
        AUTH_MODE: "dev",
        OPENAI_API_KEY: "test-key",
        MAX_OPENAI_CONCURRENCY: "2",
      }),
    ).toThrow();
  });
});
