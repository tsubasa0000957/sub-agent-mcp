import OpenAI from "openai";
import { describe, expect, it } from "vitest";
import { OpenAIProvider } from "../../src/providers/openai.js";
import type { AgentRequest } from "../../src/delegation/types.js";

const baseRequest: AgentRequest = {
  objective: "check policy",
  questions: [],
  constraints: [],
  mode: "reason",
  web: "disabled",
  depth: "quick",
  role: "Independent Solver",
  roleInstruction: "Solve independently.",
};

describe("OpenAIProvider request policy", () => {
  it("omits web tools and conversational state when web is disabled", async () => {
    const { client, requests } = mockClient(workerResponse([]));
    await new OpenAIProvider("test-model", "test-key", client).execute(
      baseRequest,
      new AbortController().signal,
    );

    expect(requests[0]).toMatchObject({ model: "test-model", store: false });
    expect(requests[0]).not.toHaveProperty("tools");
    expect(requests[0]).not.toHaveProperty("conversation");
    expect(requests[0]).not.toHaveProperty("previous_response_id");
  });

  it("allows optional web search in auto mode", async () => {
    const { client, requests } = mockClient(workerResponse([]));
    await new OpenAIProvider("test-model", "test-key", client).execute(
      { ...baseRequest, web: "auto" },
      new AbortController().signal,
    );

    expect(requests[0]).toMatchObject({
      tools: [{ type: "web_search" }],
      tool_choice: "auto",
    });
  });

  it("requires a completed web call and validates model URLs against tool sources", async () => {
    const output = [
      {
        type: "web_search_call",
        status: "completed",
        action: { sources: [{ url: "https://example.com/real" }] },
      },
    ];
    const response = workerResponse(output);
    response.output_parsed.findings[0]!.sourceUrls = [
      "https://example.com/real",
      "https://fake.invalid/result",
    ];
    const { client, requests } = mockClient(response);
    const result = await new OpenAIProvider("test-model", "test-key", client).execute(
      { ...baseRequest, web: "required" },
      new AbortController().signal,
    );

    expect(requests[0]).toMatchObject({ tool_choice: "required" });
    expect(result.result.findings[0]?.sourceUrls).toEqual(["https://example.com/real"]);
    expect(result.webUsed).toBe(true);
  });

  it("rejects required web mode when no web call completed", async () => {
    const { client } = mockClient(workerResponse([]));
    await expect(
      new OpenAIProvider("test-model", "test-key", client).execute(
        { ...baseRequest, web: "required" },
        new AbortController().signal,
      ),
    ).rejects.toThrow("Required web search was not completed");
  });
});

function workerResponse(output: unknown[]) {
  return {
    status: "completed" as const,
    output,
    output_parsed: {
      role: "Independent Solver",
      answer: "answer",
      findings: [
        {
          statement: "finding",
          basis: "web_source" as const,
          sourceUrls: [] as string[],
          confidence: 0.8,
        },
      ],
      risks: [],
      alternatives: [],
      unknowns: [],
      recommendation: null,
      confidence: 0.8,
    },
    usage: undefined,
  };
}

function mockClient(response: ReturnType<typeof workerResponse>) {
  const requests: Record<string, unknown>[] = [];
  const client = {
    responses: {
      parse: async (request: Record<string, unknown>) => {
        requests.push(request);
        return response;
      },
    },
  } as unknown as OpenAI;
  return { client, requests };
}
