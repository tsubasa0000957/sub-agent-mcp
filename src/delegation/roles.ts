import type { Mode } from "../schemas/input.js";

export interface WorkerRole {
  name: string;
  instruction: string;
}

const ROLES: Record<Mode, WorkerRole[]> = {
  reason: [
    {
      name: "Primary Solver",
      instruction: "Construct the strongest direct solution independently.",
    },
    {
      name: "Alternative Solver",
      instruction: "Use materially different assumptions or an alternative approach.",
    },
    {
      name: "Critical Analyst",
      instruction: "Challenge the framing, assumptions, weak points, and failure conditions.",
    },
  ],
  review: [
    {
      name: "Correctness Reviewer",
      instruction: "Prioritize specification fit, logical consistency, boundary cases, and bugs.",
    },
    {
      name: "Architecture Reviewer",
      instruction: "Prioritize maintainability, separation of concerns, complexity, and technical debt.",
    },
    {
      name: "Adversarial Reviewer",
      instruction: "Prioritize security, races, abuse cases, hidden assumptions, and operations.",
    },
  ],
  research: [
    {
      name: "Primary Sources",
      instruction: "Prefer official specifications, documentation, repositories, and release notes.",
    },
    {
      name: "Implementation Reality",
      instruction: "Investigate real implementations, issue trackers, migrations, and known limits.",
    },
    {
      name: "Adversarial Research",
      instruction: "Seek contradictory evidence, breaking changes, security concerns, and alternatives.",
    },
  ],
};

export function rolesFor(mode: Mode): WorkerRole[] {
  return ROLES[mode].map((role) => ({ ...role }));
}

export function singleRole(mode: Mode): WorkerRole {
  return {
    name: mode === "research" ? "Researcher" : mode === "review" ? "Reviewer" : "Independent Solver",
    instruction:
      mode === "research"
        ? "Research the objective independently and distinguish evidence from inference."
        : mode === "review"
          ? "Review the supplied material independently and identify concrete risks and corrections."
          : "Solve the objective independently and present a defensible recommendation.",
  };
}
