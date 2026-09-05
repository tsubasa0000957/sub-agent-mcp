import { describe, expect, it, vi } from "vitest";
import { DelegationOrchestrator } from "../../src/delegation/orchestrator.js";
import { FakeProvider } from "../fixtures/fakeProvider.js";

const config = {
  maxOpenAiConcurrency: 6,
  maxOpenAiQueue: 24,
  maxOpenAiCallsPerMinute: 12,
  delegateTimeoutMs: 2_000,
  parallelDelegateTimeoutMs: 2_000,
  workerPhaseTimeoutMs: 1_000,
  synthesisTimeoutMs: 500,
};

describe("DelegationOrchestrator", () => {
  it("keeps parallel workers isolated and overlaps execution windows", async () => {
    const provider = new FakeProvider({ delayMs: 40 });
    const orchestrator = new DelegationOrchestrator(provider, config);
    const result = await orchestrator.parallelDelegate(
      { objective: "review this", context: "only supplied context", mode: "review" },
      new AbortController().signal,
    );

    expect(result.status).toBe("success");
    expect(provider.requests).toHaveLength(3);
    expect(new Set(provider.requests.map((request) => request.role)).size).toBe(3);
    expect(provider.requests.every((request) => request.context === "only supplied context")).toBe(true);
    const latestStart = Math.max(...provider.windows.map((window) => window.start));
    const earliestEnd = Math.min(...provider.windows.map((window) => window.end));
    expect(latestStart).toBeLessThan(earliestEnd);
    expect(provider.synthesisRequests[0]?.workers).toHaveLength(3);
  });

  it("degrades with one failed worker", async () => {
    const provider = new FakeProvider({ failingRoles: ["Adversarial Reviewer"] });
    const result = await new DelegationOrchestrator(provider, config).parallelDelegate(
      { objective: "review", mode: "review" },
      new AbortController().signal,
    );
    expect(result.status).toBe("degraded");
    expect(result.workers?.filter((worker) => worker.status === "failed")).toHaveLength(1);
  });

  it("fails with two failed workers", async () => {
    const provider = new FakeProvider({
      failingRoles: ["Correctness Reviewer", "Architecture Reviewer"],
    });
    await expect(
      new DelegationOrchestrator(provider, config).parallelDelegate(
        { objective: "review", mode: "review" },
        new AbortController().signal,
      ),
    ).rejects.toThrow("1 of 3 workers succeeded");
  });

  it("uses deterministic degraded output when synthesis fails", async () => {
    const provider = new FakeProvider({ synthesisFails: true });
    const result = await new DelegationOrchestrator(provider, config).parallelDelegate(
      { objective: "solve" },
      new AbortController().signal,
    );
    expect(result.status).toBe("degraded");
    expect(result.unknowns[0]).toContain("Synthesis did not complete");
  });

  it("does not leak one worker result into another worker input", async () => {
    const provider = new FakeProvider();
    await new DelegationOrchestrator(provider, config).parallelDelegate(
      { objective: "solve", questions: ["q"], constraints: ["c"] },
      new AbortController().signal,
    );
    for (const request of provider.requests) {
      expect(JSON.stringify(request)).not.toContain("finding from");
      expect(request.questions).toEqual(["q"]);
      expect(request.constraints).toEqual(["c"]);
    }
  });

  it("propagates a caller abort during synthesis instead of returning a fallback", async () => {
    const provider = new FakeProvider({ synthesisDelayMs: 10_000 });
    const controller = new AbortController();
    const delegation = new DelegationOrchestrator(provider, config).parallelDelegate(
      { objective: "solve" },
      controller.signal,
    );
    const rejection = expect(delegation).rejects.toMatchObject({ name: "AbortError" });

    await vi.waitFor(() => expect(provider.synthesisRequests).toHaveLength(1));
    controller.abort(new DOMException("caller disconnected", "AbortError"));

    await rejection;
  });

  it("rejects work that exceeds the global logical OpenAI call budget", async () => {
    const provider = new FakeProvider();
    const limited = new DelegationOrchestrator(provider, {
      ...config,
      maxOpenAiCallsPerMinute: 4,
    });
    await limited.parallelDelegate({ objective: "review" }, new AbortController().signal);

    await expect(
      limited.delegate({ objective: "one more" }, new AbortController().signal),
    ).rejects.toMatchObject({ name: "RateLimitExceededError" });
    expect(provider.requests).toHaveLength(3);
  });
});
