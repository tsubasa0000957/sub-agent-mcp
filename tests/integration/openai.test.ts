import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { describe, expect, it } from "vitest";
import { DelegationOrchestrator } from "../../src/delegation/orchestrator.js";
import { loadConfig } from "../../src/infra/config.js";
import { OpenAIProvider } from "../../src/providers/openai.js";

if (existsSync(".env")) loadEnvFile(".env");

const run = process.env.RUN_OPENAI_INTEGRATION === "1" ? describe : describe.skip;

run("OpenAI integration", () => {
  it(
    "executes a structured, web-disabled delegation",
    async () => {
      const config = loadConfig();
      const orchestrator = new DelegationOrchestrator(
        new OpenAIProvider(config.model, config.openAiApiKey),
        config,
      );
      const result = await orchestrator.delegate(
        {
          objective: "Return one concise reason why independent review is useful.",
          mode: "reason",
          web: "disabled",
          depth: "quick",
        },
        new AbortController().signal,
      );
      expect(result.status).toBe("success");
      expect(result.webUsed).toBe(false);
      expect(result.answer.length).toBeGreaterThan(0);
      expect(result.usage.inputTokens).toBeGreaterThan(0);
    },
    100_000,
  );

  it(
    "executes required web search and returns validated sources",
    async () => {
      const config = loadConfig();
      const orchestrator = new DelegationOrchestrator(
        new OpenAIProvider(config.model, config.openAiApiKey),
        config,
      );
      const result = await orchestrator.delegate(
        {
          objective: "Find the official OpenAI documentation page for the Responses API web search tool.",
          mode: "research",
          web: "required",
          depth: "quick",
          constraints: ["Use an official OpenAI source."],
        },
        new AbortController().signal,
      );
      expect(result.status).toBe("success");
      expect(result.webUsed).toBe(true);
      expect(result.usage.webSearchCalls).toBeGreaterThan(0);
      expect(result.sources.length).toBeGreaterThan(0);
    },
    100_000,
  );

  it(
    "executes three isolated review workers and synthesis",
    async () => {
      const config = loadConfig();
      const orchestrator = new DelegationOrchestrator(
        new OpenAIProvider(config.model, config.openAiApiKey),
        config,
      );
      const result = await orchestrator.parallelDelegate(
        {
          objective: "Review whether a small stateless HTTP service should expose its application port publicly.",
          context: "The service is reached through a Cloudflare Tunnel container on the same private Docker network.",
          mode: "review",
          web: "disabled",
          depth: "standard",
        },
        new AbortController().signal,
      );
      expect(result.execution).toBe("parallel");
      expect(result.webUsed).toBe(false);
      expect(result.workers).toHaveLength(3);
      expect(result.workers?.filter((worker) => worker.status === "success")).toHaveLength(3);
      expect(result.usage.llmRequests).toBe(4);
    },
    115_000,
  );
});
