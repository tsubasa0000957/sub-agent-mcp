import type { Config } from "../../src/infra/config.js";

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    nodeEnv: "test",
    port: 0,
    model: "fake-model",
    authMode: "dev",
    allowedHosts: ["127.0.0.1", "localhost"],
    allowedOrigins: ["127.0.0.1", "localhost"],
    openAiApiKey: "test-key",
    maxOpenAiConcurrency: 6,
    maxOpenAiQueue: 24,
    maxOpenAiCallsPerMinute: 12,
    maxContextChars: 200_000,
    maxTotalInputChars: 250_000,
    delegateTimeoutMs: 2_000,
    parallelDelegateTimeoutMs: 2_000,
    workerPhaseTimeoutMs: 1_000,
    synthesisTimeoutMs: 500,
    logLevel: "error",
    ...overrides,
  };
}
