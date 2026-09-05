import type {
  DelegateDepth,
  Mode,
  ParallelDepth,
  WebPolicy,
} from "../schemas/input.js";
import type { SynthesisResult, WorkerResult } from "../schemas/worker.js";

export interface AgentRequest {
  objective: string;
  context?: string;
  questions: string[];
  constraints: string[];
  mode: Mode;
  web: WebPolicy;
  depth: DelegateDepth | ParallelDepth;
  role: string;
  roleInstruction: string;
}

export interface Source {
  url: string;
  title?: string;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  webSearchCalls: number;
}

export interface AgentExecutionResult {
  result: WorkerResult;
  webUsed: boolean;
  sources: Source[];
  usage: Usage;
}

export interface SynthesisRequest {
  objective: string;
  questions: string[];
  constraints: string[];
  mode: Mode;
  depth: ParallelDepth;
  workers: WorkerResult[];
}

export interface SynthesisExecutionResult {
  result: SynthesisResult;
  usage: Usage;
}
