import { z } from "zod";

export const ModeSchema = z.enum(["reason", "review", "research"]);
export const WebPolicySchema = z.enum(["disabled", "auto", "required"]);
export const DelegateDepthSchema = z.enum(["quick", "standard", "deep"]);
export const ParallelDepthSchema = z.enum(["standard", "deep"]);

const boundedStrings = z.array(z.string().trim().min(1).max(20_000)).max(20);

export function createDelegateInputSchema(maxContextChars: number, maxTotalInputChars: number) {
  return z
    .object({
      objective: z.string().trim().min(1).max(50_000),
      context: z.string().max(maxContextChars).optional(),
      questions: boundedStrings.optional(),
      constraints: boundedStrings.optional(),
      mode: ModeSchema.optional(),
      web: WebPolicySchema.optional(),
      depth: DelegateDepthSchema.optional(),
    })
    .strict()
    .superRefine((input, ctx) => enforceTotalInputLimit(input, maxTotalInputChars, ctx));
}

export function createParallelDelegateInputSchema(maxContextChars: number, maxTotalInputChars: number) {
  return z
    .object({
      objective: z.string().trim().min(1).max(50_000),
      context: z.string().max(maxContextChars).optional(),
      questions: boundedStrings.optional(),
      constraints: boundedStrings.optional(),
      mode: ModeSchema.optional(),
      web: WebPolicySchema.optional(),
      depth: ParallelDepthSchema.optional(),
    })
    .strict()
    .superRefine((input, ctx) => enforceTotalInputLimit(input, maxTotalInputChars, ctx));
}

function enforceTotalInputLimit(
  input: {
    objective: string;
    context?: string | undefined;
    questions?: string[] | undefined;
    constraints?: string[] | undefined;
  },
  maxTotalInputChars: number,
  ctx: z.RefinementCtx,
): void {
  const textFields = [
    input.objective,
    input.context,
    ...(input.questions ?? []),
    ...(input.constraints ?? []),
  ];
  const total = textFields.reduce(
    (sum, value) => sum + (typeof value === "string" ? value.length : 0),
    0,
  );
  if (total > maxTotalInputChars) {
    ctx.addIssue({
      code: "custom",
      message: `Combined tool input exceeds ${maxTotalInputChars} characters`,
    });
  }
}

export type Mode = z.infer<typeof ModeSchema>;
export type WebPolicy = z.infer<typeof WebPolicySchema>;
export type DelegateDepth = z.infer<typeof DelegateDepthSchema>;
export type ParallelDepth = z.infer<typeof ParallelDepthSchema>;
export type DelegateInput = z.infer<ReturnType<typeof createDelegateInputSchema>>;
export type ParallelDelegateInput = z.infer<ReturnType<typeof createParallelDelegateInputSchema>>;
