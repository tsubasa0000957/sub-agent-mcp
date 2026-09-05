import { readFileSync } from "node:fs";
import { z } from "zod";

const PositiveInt = z.coerce.number().int().positive();
const ParallelWorkerCount = 3;
const ParallelCallCount = 4;

const RawConfigSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(0).max(65_535).default(3000),
    SUB_AGENT_MODEL: z.string().min(1).default("gpt-5.6-luna"),
    AUTH_MODE: z.enum(["dev", "cloudflare"]).default("dev"),
    ALLOWED_HOSTS: z.string().default("localhost,127.0.0.1,[::1]"),
    ALLOWED_ORIGINS: z.string().default("localhost,127.0.0.1,[::1]"),
    CLOUDFLARE_TEAM_DOMAIN: z.string().optional(),
    CLOUDFLARE_ACCESS_AUD: z.string().optional(),
    OPENAI_API_KEY_FILE: z.string().optional(),
    OPENAI_API_KEY: z.string().optional(),
    MAX_OPENAI_CONCURRENCY: z.coerce.number().int().min(ParallelWorkerCount).default(6),
    MAX_OPENAI_QUEUE: z.coerce.number().int().nonnegative().default(24),
    MAX_OPENAI_CALLS_PER_MINUTE: PositiveInt.min(ParallelCallCount).default(12),
    MAX_CONTEXT_CHARS: PositiveInt.default(200_000),
    MAX_TOTAL_INPUT_CHARS: PositiveInt.default(250_000),
    DELEGATE_TIMEOUT_MS: PositiveInt.default(90_000),
    PARALLEL_DELEGATE_TIMEOUT_MS: PositiveInt.default(110_000),
    WORKER_PHASE_TIMEOUT_MS: PositiveInt.default(75_000),
    SYNTHESIS_TIMEOUT_MS: PositiveInt.default(25_000),
    LOG_LEVEL: z.enum(["info", "error"]).default("info"),
  })
  .passthrough();

export interface Config {
  nodeEnv: "development" | "test" | "production";
  port: number;
  model: string;
  authMode: "dev" | "cloudflare";
  allowedHosts: string[];
  allowedOrigins: string[];
  cloudflareTeamDomain?: string;
  cloudflareAccessAud?: string;
  openAiApiKey: string;
  maxOpenAiConcurrency: number;
  maxOpenAiQueue: number;
  maxOpenAiCallsPerMinute: number;
  maxContextChars: number;
  maxTotalInputChars: number;
  delegateTimeoutMs: number;
  parallelDelegateTimeoutMs: number;
  workerPhaseTimeoutMs: number;
  synthesisTimeoutMs: number;
  logLevel: "info" | "error";
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const raw = RawConfigSchema.parse(env);
  const openAiApiKey = readSecret(raw.OPENAI_API_KEY_FILE, raw.OPENAI_API_KEY);
  if (openAiApiKey === undefined || openAiApiKey.length === 0) {
    throw new Error("OPENAI_API_KEY_FILE or OPENAI_API_KEY is required");
  }

  if (raw.AUTH_MODE === "cloudflare") {
    if (!raw.CLOUDFLARE_TEAM_DOMAIN || !raw.CLOUDFLARE_ACCESS_AUD) {
      throw new Error("Cloudflare auth requires CLOUDFLARE_TEAM_DOMAIN and CLOUDFLARE_ACCESS_AUD");
    }
  }

  if (raw.NODE_ENV === "production" && raw.AUTH_MODE !== "cloudflare") {
    throw new Error("Production requires AUTH_MODE=cloudflare");
  }

  const config: Config = {
    nodeEnv: raw.NODE_ENV,
    port: raw.PORT,
    model: raw.SUB_AGENT_MODEL,
    authMode: raw.AUTH_MODE,
    allowedHosts: csvHostnames(raw.ALLOWED_HOSTS),
    allowedOrigins: csvHostnames(raw.ALLOWED_ORIGINS),
    openAiApiKey,
    maxOpenAiConcurrency: raw.MAX_OPENAI_CONCURRENCY,
    maxOpenAiQueue: raw.MAX_OPENAI_QUEUE,
    maxOpenAiCallsPerMinute: raw.MAX_OPENAI_CALLS_PER_MINUTE,
    maxContextChars: raw.MAX_CONTEXT_CHARS,
    maxTotalInputChars: raw.MAX_TOTAL_INPUT_CHARS,
    delegateTimeoutMs: raw.DELEGATE_TIMEOUT_MS,
    parallelDelegateTimeoutMs: raw.PARALLEL_DELEGATE_TIMEOUT_MS,
    workerPhaseTimeoutMs: raw.WORKER_PHASE_TIMEOUT_MS,
    synthesisTimeoutMs: raw.SYNTHESIS_TIMEOUT_MS,
    logLevel: raw.LOG_LEVEL,
    ...(raw.CLOUDFLARE_TEAM_DOMAIN
      ? { cloudflareTeamDomain: raw.CLOUDFLARE_TEAM_DOMAIN.replace(/\/$/, "") }
      : {}),
    ...(raw.CLOUDFLARE_ACCESS_AUD ? { cloudflareAccessAud: raw.CLOUDFLARE_ACCESS_AUD } : {}),
  };

  if (config.allowedHosts.length === 0) throw new Error("ALLOWED_HOSTS must not be empty");
  return config;
}

function readSecret(file: string | undefined, inline: string | undefined): string | undefined {
  if (file !== undefined && file.length > 0) return readFileSync(file, "utf8").trim();
  return inline?.trim();
}

function csvHostnames(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      try {
        return new URL(item).hostname;
      } catch {
        return item;
      }
    });
}
