import { z } from "zod";

const FinalFindingSchema = z
  .object({
    statement: z.string(),
    sourceUrls: z.array(z.url()),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export const DelegationResultSchema = z
  .object({
    requestId: z.string(),
    mode: z.enum(["reason", "review", "research"]),
    execution: z.enum(["single", "parallel"]),
    webPolicy: z.enum(["disabled", "auto", "required"]),
    webUsed: z.boolean(),
    status: z.enum(["success", "degraded"]),
    answer: z.string(),
    consensus: z.array(z.string()).optional(),
    disagreements: z
      .array(z.object({ topic: z.string(), positions: z.array(z.string()) }).strict())
      .optional(),
    findings: z.array(FinalFindingSchema),
    risks: z.array(z.string()),
    alternatives: z.array(z.string()),
    unknowns: z.array(z.string()),
    recommendation: z.string().optional(),
    confidence: z.number().min(0).max(1),
    workers: z
      .array(
        z
          .object({
            role: z.string(),
            status: z.enum(["success", "failed", "timeout"]),
            summary: z.string().optional(),
            confidence: z.number().min(0).max(1).optional(),
          })
          .strict(),
      )
      .optional(),
    sources: z.array(z.object({ title: z.string().optional(), url: z.url() }).strict()),
    usage: z
      .object({
        workerCount: z.number().int().nonnegative(),
        llmRequests: z.number().int().nonnegative(),
        webSearchCalls: z.number().int().nonnegative(),
        inputTokens: z.number().int().nonnegative(),
        outputTokens: z.number().int().nonnegative(),
        reasoningTokens: z.number().int().nonnegative().optional(),
      })
      .strict(),
  })
  .strict();

export type DelegationResult = z.infer<typeof DelegationResultSchema>;
