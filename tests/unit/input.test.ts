import { describe, expect, it } from "vitest";
import {
  createDelegateInputSchema,
  createParallelDelegateInputSchema,
} from "../../src/schemas/input.js";

describe("tool input limits", () => {
  it.each([createDelegateInputSchema, createParallelDelegateInputSchema])(
    "rejects combined text over the aggregate limit",
    (createSchema) => {
      const parsed = createSchema(100, 120).safeParse({
        objective: "o".repeat(30),
        context: "c".repeat(100),
      });

      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.issues[0]?.message).toContain("120");
      }
    },
  );
});
