import { describe, expect, it } from "vitest";
import { normalizeUrl, validateWorkerSources } from "../../src/infra/sourceValidation.js";

describe("source validation", () => {
  it("normalizes only the required URL components", () => {
    expect(normalizeUrl("HTTPS://Example.COM:443/path?q=1#fragment")).toBe(
      "https://example.com/path?q=1",
    );
  });

  it("removes URLs not present in actual web search sources", () => {
    const result = validateWorkerSources(
      {
        role: "Researcher",
        answer: "answer",
        findings: [
          {
            statement: "claim",
            basis: "web_source",
            sourceUrls: ["https://example.com/real", "https://fake.invalid/claim"],
            confidence: 0.8,
          },
        ],
        risks: [],
        alternatives: [],
        unknowns: [],
        recommendation: null,
        confidence: 0.8,
      },
      [{ url: "https://example.com/real" }],
    );
    expect(result.findings[0]?.sourceUrls).toEqual(["https://example.com/real"]);
  });
});
