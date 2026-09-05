import type {
  AgentExecutionResult,
  AgentRequest,
  SynthesisExecutionResult,
  SynthesisRequest,
} from "../../src/delegation/types.js";
import type { SubAgentProvider } from "../../src/providers/provider.js";

export interface FakeProviderOptions {
  delayMs?: number;
  synthesisDelayMs?: number;
  failingRoles?: string[];
  synthesisFails?: boolean;
}

export class FakeProvider implements SubAgentProvider {
  readonly requests: AgentRequest[] = [];
  readonly windows: { role: string; start: number; end: number }[] = [];
  synthesisRequests: SynthesisRequest[] = [];

  constructor(private readonly options: FakeProviderOptions = {}) {}

  async execute(request: AgentRequest, signal: AbortSignal): Promise<AgentExecutionResult> {
    this.requests.push(structuredClone(request));
    const window = { role: request.role, start: Date.now(), end: 0 };
    this.windows.push(window);
    await abortableDelay(this.options.delayMs ?? 0, signal);
    window.end = Date.now();
    if (this.options.failingRoles?.includes(request.role)) throw new Error(`failed: ${request.role}`);

    const webUsed = request.web !== "disabled";
    return {
      result: {
        role: request.role,
        answer: `${request.role}: ${request.objective}`,
        findings: [
          {
            statement: `finding from ${request.role}`,
            basis: webUsed ? "web_source" : "inference",
            sourceUrls: webUsed ? ["https://example.com/source"] : [],
            confidence: 0.8,
          },
        ],
        risks: [`risk from ${request.role}`],
        alternatives: [],
        unknowns: [],
        recommendation: `recommendation from ${request.role}`,
        confidence: 0.8,
      },
      webUsed,
      sources: webUsed ? [{ url: "https://example.com/source" }] : [],
      usage: {
        inputTokens: 10,
        outputTokens: 20,
        reasoningTokens: 5,
        webSearchCalls: webUsed ? 1 : 0,
      },
    };
  }

  async synthesize(
    request: SynthesisRequest,
    signal: AbortSignal,
  ): Promise<SynthesisExecutionResult> {
    this.synthesisRequests.push(structuredClone(request));
    await abortableDelay(this.options.synthesisDelayMs ?? this.options.delayMs ?? 0, signal);
    if (this.options.synthesisFails) throw new Error("synthesis failed");
    return {
      result: {
        answer: "synthesized answer",
        consensus: ["consensus"],
        disagreements: [],
        keyFindings: request.workers.flatMap((worker) =>
          worker.findings.map(({ statement, sourceUrls, confidence }) => ({
            statement,
            sourceUrls,
            confidence,
          })),
        ),
        risks: request.workers.flatMap((worker) => worker.risks),
        alternatives: [],
        unknowns: [],
        recommendation: "synthesized recommendation",
        confidence: 0.85,
      },
      usage: { inputTokens: 30, outputTokens: 40, reasoningTokens: 10, webSearchCalls: 0 },
    };
  }
}

function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason instanceof Error ? signal.reason : new Error("aborted"));
      },
      { once: true },
    );
  });
}
