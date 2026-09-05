import { randomUUID } from "node:crypto";
import type { SubAgentProvider } from "../providers/provider.js";
import type { DelegateInput, ParallelDelegateInput, ParallelDepth } from "../schemas/input.js";
import type { DelegationResult } from "../schemas/result.js";
import type { WorkerResult } from "../schemas/worker.js";
import { Semaphore } from "../infra/concurrency.js";
import { deadlineSignal, isTimeoutOrAbort } from "../infra/deadline.js";
import { TokenBucketRateLimiter } from "../infra/rateLimit.js";
import { dedupeSources } from "../infra/sourceValidation.js";
import { resolveMode, resolveWebPolicy } from "./modes.js";
import { rolesFor, singleRole, type WorkerRole } from "./roles.js";
import type { AgentExecutionResult, Source, Usage } from "./types.js";

export interface OrchestratorConfig {
  maxOpenAiConcurrency: number;
  maxOpenAiQueue: number;
  maxOpenAiCallsPerMinute: number;
  delegateTimeoutMs: number;
  parallelDelegateTimeoutMs: number;
  workerPhaseTimeoutMs: number;
  synthesisTimeoutMs: number;
}

interface UsageTotal extends Usage {
  llmRequests: number;
}

export class DelegationOrchestrator {
  private readonly semaphore: Semaphore;
  private readonly rateLimiter: TokenBucketRateLimiter;

  constructor(
    private readonly provider: SubAgentProvider,
    private readonly config: OrchestratorConfig,
  ) {
    this.semaphore = new Semaphore(config.maxOpenAiConcurrency, config.maxOpenAiQueue);
    this.rateLimiter = new TokenBucketRateLimiter(config.maxOpenAiCallsPerMinute);
  }

  async delegate(input: DelegateInput, callerSignal: AbortSignal): Promise<DelegationResult> {
    callerSignal.throwIfAborted();
    this.rateLimiter.consume(1);
    const startedAt = Date.now();
    const signal = deadlineSignal(callerSignal, this.config.delegateTimeoutMs);
    const mode = resolveMode(input.mode);
    const web = resolveWebPolicy(mode, input.web);
    const depth = input.depth ?? "standard";
    const role = singleRole(mode);
    const usage = emptyUsage();
    usage.llmRequests += 1;

    const execution = await this.limitedExecute(
      {
        objective: input.objective,
        ...(input.context !== undefined ? { context: input.context } : {}),
        questions: input.questions ?? [],
        constraints: input.constraints ?? [],
        mode,
        web,
        depth,
        role: role.name,
        roleInstruction: role.instruction,
      },
      signal,
    );
    addUsage(usage, execution.usage);

    const result: DelegationResult = {
      requestId: randomUUID(),
      mode,
      execution: "single",
      webPolicy: web,
      webUsed: execution.webUsed,
      status: "success",
      answer: execution.result.answer,
      findings: execution.result.findings.map(({ statement, sourceUrls, confidence }) => ({
        statement,
        sourceUrls,
        confidence,
      })),
      risks: execution.result.risks,
      alternatives: execution.result.alternatives,
      unknowns: execution.result.unknowns,
      ...(execution.result.recommendation !== null
        ? { recommendation: execution.result.recommendation }
        : {}),
      confidence: execution.result.confidence,
      sources: execution.sources,
      usage: finalUsage(usage, 1),
    };
    void startedAt;
    return result;
  }

  async parallelDelegate(
    input: ParallelDelegateInput,
    callerSignal: AbortSignal,
  ): Promise<DelegationResult> {
    callerSignal.throwIfAborted();
    this.rateLimiter.consume(4);
    const requestId = randomUUID();
    const startedAt = Date.now();
    const overallSignal = deadlineSignal(callerSignal, this.config.parallelDelegateTimeoutMs);
    const workerSignal = deadlineSignal(overallSignal, this.config.workerPhaseTimeoutMs);
    const mode = resolveMode(input.mode);
    const web = resolveWebPolicy(mode, input.web);
    const depth: ParallelDepth = input.depth ?? "standard";
    const roles = rolesFor(mode);
    const usage = emptyUsage();
    usage.llmRequests += roles.length;

    const settled = await Promise.allSettled(
      roles.map((role) =>
        this.limitedExecute(
          {
            objective: input.objective,
            ...(input.context !== undefined ? { context: input.context } : {}),
            questions: input.questions ?? [],
            constraints: input.constraints ?? [],
            mode,
            web,
            depth,
            role: role.name,
            roleInstruction: role.instruction,
          },
          workerSignal,
        ),
      ),
    );

    const successes: { role: WorkerRole; execution: AgentExecutionResult }[] = [];
    const workers: NonNullable<DelegationResult["workers"]> = [];
    settled.forEach((outcome, index) => {
      const role = roles[index];
      if (role === undefined) return;
      if (outcome.status === "fulfilled") {
        successes.push({ role, execution: outcome.value });
        addUsage(usage, outcome.value.usage);
        workers.push({
          role: role.name,
          status: "success",
          summary: outcome.value.result.answer,
          confidence: outcome.value.result.confidence,
        });
      } else {
        workers.push({
          role: role.name,
          status: isTimeoutOrAbort(outcome.reason) ? "timeout" : "failed",
        });
      }
    });

    callerSignal.throwIfAborted();

    if (successes.length < 2) {
      throw new Error(`Parallel delegation failed: ${successes.length} of 3 workers succeeded`);
    }

    const allSources = dedupeSources(successes.flatMap(({ execution }) => execution.sources));
    const webUsed = successes.some(({ execution }) => execution.webUsed);
    const remainingMs = this.config.parallelDelegateTimeoutMs - (Date.now() - startedAt);
    if (remainingMs <= 1_000 || overallSignal.aborted) {
      return fallbackResult(requestId, mode, web, successes, workers, allSources, usage, webUsed);
    }

    usage.llmRequests += 1;
    try {
      const synthesis = await this.limitedSynthesis(
        {
          objective: input.objective,
          questions: input.questions ?? [],
          constraints: input.constraints ?? [],
          mode,
          depth,
          workers: successes.map(({ execution }) => execution.result),
        },
        deadlineSignal(overallSignal, Math.min(this.config.synthesisTimeoutMs, remainingMs)),
      );
      addUsage(usage, synthesis.usage);
      return {
        requestId,
        mode,
        execution: "parallel",
        webPolicy: web,
        webUsed,
        status: successes.length === 3 ? "success" : "degraded",
        answer: synthesis.result.answer,
        consensus: synthesis.result.consensus,
        disagreements: synthesis.result.disagreements,
        findings: synthesis.result.keyFindings,
        risks: synthesis.result.risks,
        alternatives: synthesis.result.alternatives,
        unknowns: synthesis.result.unknowns,
        ...(synthesis.result.recommendation !== null
          ? { recommendation: synthesis.result.recommendation }
          : {}),
        confidence: synthesis.result.confidence,
        workers,
        sources: allSources,
        usage: finalUsage(usage, successes.length),
      };
    } catch {
      callerSignal.throwIfAborted();
      return fallbackResult(requestId, mode, web, successes, workers, allSources, usage, webUsed);
    }
  }

  private async limitedExecute(
    request: Parameters<SubAgentProvider["execute"]>[0],
    signal: AbortSignal,
  ): Promise<AgentExecutionResult> {
    const release = await this.semaphore.acquire(signal);
    try {
      return await this.provider.execute(request, signal);
    } finally {
      release();
    }
  }

  private async limitedSynthesis(
    request: Parameters<SubAgentProvider["synthesize"]>[0],
    signal: AbortSignal,
  ) {
    const release = await this.semaphore.acquire(signal);
    try {
      return await this.provider.synthesize(request, signal);
    } finally {
      release();
    }
  }
}

function fallbackResult(
  requestId: string,
  mode: DelegationResult["mode"],
  web: DelegationResult["webPolicy"],
  successes: { role: WorkerRole; execution: AgentExecutionResult }[],
  workers: NonNullable<DelegationResult["workers"]>,
  sources: Source[],
  usage: UsageTotal,
  webUsed: boolean,
): DelegationResult {
  const ranked = [...successes].sort(
    (a, b) => b.execution.result.confidence - a.execution.result.confidence,
  );
  const best = ranked[0];
  if (best === undefined) throw new Error("No successful worker available for fallback");
  const results = successes.map(({ execution }) => execution.result);
  return {
    requestId,
    mode,
    execution: "parallel",
    webPolicy: web,
    webUsed,
    status: "degraded",
    answer: best.execution.result.answer,
    consensus: [],
    disagreements: [],
    findings: uniqueFindings(results),
    risks: uniqueStrings(results.flatMap((result) => result.risks)),
    alternatives: uniqueStrings(results.flatMap((result) => result.alternatives)),
    unknowns: uniqueStrings([
      "Synthesis did not complete; the answer is the highest-confidence worker result.",
      ...results.flatMap((result) => result.unknowns),
    ]),
    ...(best.execution.result.recommendation !== null
      ? { recommendation: best.execution.result.recommendation }
      : {}),
    confidence:
      results.reduce((total, result) => total + result.confidence, 0) / results.length,
    workers,
    sources,
    usage: finalUsage(usage, successes.length),
  };
}

function uniqueFindings(results: WorkerResult[]): DelegationResult["findings"] {
  const seen = new Set<string>();
  return results
    .flatMap((result) => result.findings)
    .filter((finding) => {
      if (seen.has(finding.statement)) return false;
      seen.add(finding.statement);
      return true;
    })
    .map(({ statement, sourceUrls, confidence }) => ({ statement, sourceUrls, confidence }));
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function emptyUsage(): UsageTotal {
  return { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, webSearchCalls: 0, llmRequests: 0 };
}

function addUsage(total: UsageTotal, usage: Usage): void {
  total.inputTokens += usage.inputTokens;
  total.outputTokens += usage.outputTokens;
  total.reasoningTokens += usage.reasoningTokens;
  total.webSearchCalls += usage.webSearchCalls;
}

function finalUsage(total: UsageTotal, workerCount: number): DelegationResult["usage"] {
  return {
    workerCount,
    llmRequests: total.llmRequests,
    webSearchCalls: total.webSearchCalls,
    inputTokens: total.inputTokens,
    outputTokens: total.outputTokens,
    reasoningTokens: total.reasoningTokens,
  };
}
