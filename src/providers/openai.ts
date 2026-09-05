import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { ResponseFunctionWebSearch } from "openai/resources/responses/responses";
import { z } from "zod";
import { synthesisInput, synthesisInstructions, workerInput, workerInstructions } from "../delegation/prompts.js";
import type {
  AgentExecutionResult,
  AgentRequest,
  Source,
  SynthesisExecutionResult,
  SynthesisRequest,
  Usage,
} from "../delegation/types.js";
import { dedupeSources, validateSynthesisSources, validateWorkerSources } from "../infra/sourceValidation.js";
import { SynthesisResultSchema, WorkerResultSchema } from "../schemas/worker.js";
import type { SubAgentProvider } from "./provider.js";

const DEPTH = {
  quick: { effort: "low", maxOutputTokens: 4_000, maxToolCalls: 2 },
  standard: { effort: "medium", maxOutputTokens: 6_000, maxToolCalls: 4 },
  deep: { effort: "high", maxOutputTokens: 10_000, maxToolCalls: 8 },
} as const;

export class OpenAIProvider implements SubAgentProvider {
  private readonly client: OpenAI;

  constructor(
    private readonly model: string,
    apiKey: string,
    client?: OpenAI,
  ) {
    this.client = client ?? new OpenAI({ apiKey, maxRetries: 2 });
  }

  async execute(request: AgentRequest, signal: AbortSignal): Promise<AgentExecutionResult> {
    const budget = DEPTH[request.depth];
    const webEnabled = request.web !== "disabled";
    const response = await this.client.responses.parse(
      {
        model: this.model,
        instructions: workerInstructions(request),
        input: workerInput(request),
        store: false,
        reasoning: { effort: budget.effort },
        max_output_tokens: budget.maxOutputTokens,
        text: { format: zodTextFormat(WorkerResultSchema, "worker_result") },
        ...(webEnabled
          ? {
              tools: [{ type: "web_search" as const }],
              tool_choice: request.web === "required" ? ("required" as const) : ("auto" as const),
              max_tool_calls: budget.maxToolCalls,
              include: ["web_search_call.action.sources" as const],
            }
          : {}),
      },
      { signal },
    );

    if (response.status !== "completed") {
      throw new Error(`OpenAI response did not complete: ${response.status}`);
    }
    const parsed = response.output_parsed;
    if (parsed === null) throw new Error("OpenAI response contained no structured worker result");

    const webCalls = response.output.filter(
      (item): item is ResponseFunctionWebSearch => item.type === "web_search_call",
    );
    const completedWebCalls = webCalls.filter((item) => item.status === "completed");
    if (request.web === "required" && completedWebCalls.length === 0) {
      throw new Error("Required web search was not completed");
    }

    const sources = extractSources(response.output);
    const result = validateWorkerSources(WorkerResultSchema.parse(parsed), sources);
    return {
      result,
      webUsed: completedWebCalls.length > 0,
      sources,
      usage: usageFrom(response.usage, completedWebCalls.length),
    };
  }

  async synthesize(
    request: SynthesisRequest,
    signal: AbortSignal,
  ): Promise<SynthesisExecutionResult> {
    const budget = DEPTH[request.depth];
    const response = await this.client.responses.parse(
      {
        model: this.model,
        instructions: synthesisInstructions(),
        input: synthesisInput(request),
        store: false,
        reasoning: { effort: budget.effort },
        max_output_tokens: budget.maxOutputTokens,
        text: { format: zodTextFormat(SynthesisResultSchema, "synthesis_result") },
      },
      { signal },
    );

    if (response.status !== "completed" || response.output_parsed === null) {
      throw new Error(`OpenAI synthesis did not complete: ${response.status}`);
    }
    return {
      result: validateSynthesisSources(
        SynthesisResultSchema.parse(response.output_parsed),
        request.workers.flatMap((worker) =>
          worker.findings.flatMap((finding) => finding.sourceUrls.map((url) => ({ url }))),
        ),
      ),
      usage: usageFrom(response.usage, 0),
    };
  }
}

function extractSources(output: unknown[]): Source[] {
  const sources: Source[] = [];
  for (const item of output) {
    if (!isRecord(item)) continue;
    if (item.type === "web_search_call" && isRecord(item.action)) {
      const action = item.action;
      if (Array.isArray(action.sources)) {
        for (const source of action.sources) {
          if (isRecord(source) && typeof source.url === "string") sources.push({ url: source.url });
        }
      }
      if (typeof action.url === "string") sources.push({ url: action.url });
    }
    if (item.type === "message" && Array.isArray(item.content)) {
      for (const content of item.content) {
        if (!isRecord(content) || !Array.isArray(content.annotations)) continue;
        for (const annotation of content.annotations) {
          if (!isRecord(annotation) || annotation.type !== "url_citation" || typeof annotation.url !== "string") {
            continue;
          }
          sources.push({
            url: annotation.url,
            ...(typeof annotation.title === "string" ? { title: annotation.title } : {}),
          });
        }
      }
    }
  }
  return dedupeSources(sources);
}

function usageFrom(
  usage: {
    input_tokens: number;
    output_tokens: number;
    output_tokens_details: { reasoning_tokens: number };
  } | undefined,
  webSearchCalls: number,
): Usage {
  if (usage === undefined) {
    return { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, webSearchCalls };
  }
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    reasoningTokens: usage.output_tokens_details.reasoning_tokens,
    webSearchCalls,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// Compile-time guard: strict schemas must remain object-shaped for both APIs.
void z.object;
