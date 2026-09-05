import { z } from "zod";

export const FindingSchema = z
  .object({
    statement: z.string().min(1),
    basis: z.enum(["provided_context", "web_source", "inference"]),
    // OpenAI Structured Outputs does not accept JSON Schema's `uri` format.
    // URLs are normalized and validated against actual tool sources afterwards.
    sourceUrls: z.array(z.string()),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export const WorkerResultSchema = z
  .object({
    role: z.string().min(1),
    answer: z.string().min(1),
    findings: z.array(FindingSchema),
    risks: z.array(z.string()),
    alternatives: z.array(z.string()),
    unknowns: z.array(z.string()),
    recommendation: z.string().nullable(),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export const SynthesisResultSchema = z
  .object({
    answer: z.string().min(1),
    consensus: z.array(z.string()),
    disagreements: z.array(
      z
        .object({
          topic: z.string().min(1),
          positions: z.array(z.string().min(1)),
        })
        .strict(),
    ),
    keyFindings: z.array(
      z
        .object({
          statement: z.string().min(1),
          sourceUrls: z.array(z.string()),
          confidence: z.number().min(0).max(1),
        })
        .strict(),
    ),
    risks: z.array(z.string()),
    alternatives: z.array(z.string()),
    unknowns: z.array(z.string()),
    recommendation: z.string().nullable(),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export type Finding = z.infer<typeof FindingSchema>;
export type WorkerResult = z.infer<typeof WorkerResultSchema>;
export type SynthesisResult = z.infer<typeof SynthesisResultSchema>;
