import { describe, expect, it } from "vitest";
import { resolveMode, resolveWebPolicy } from "../../src/delegation/modes.js";
import { rolesFor } from "../../src/delegation/roles.js";

describe("mode defaults", () => {
  it("defaults to reason without web", () => {
    const mode = resolveMode(undefined);
    expect(mode).toBe("reason");
    expect(resolveWebPolicy(mode, undefined)).toBe("disabled");
  });

  it("requires web for research by default", () => {
    expect(resolveWebPolicy("research", undefined)).toBe("required");
  });

  it("honors an explicit web policy", () => {
    expect(resolveWebPolicy("review", "auto")).toBe("auto");
  });
});

describe("mode roles", () => {
  it.each([
    ["reason", ["Primary Solver", "Alternative Solver", "Critical Analyst"]],
    ["review", ["Correctness Reviewer", "Architecture Reviewer", "Adversarial Reviewer"]],
    ["research", ["Primary Sources", "Implementation Reality", "Adversarial Research"]],
  ] as const)("assigns three distinct roles for %s", (mode, expected) => {
    expect(rolesFor(mode).map((role) => role.name)).toEqual(expected);
  });
});
