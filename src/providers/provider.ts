import type {
  AgentExecutionResult,
  AgentRequest,
  SynthesisExecutionResult,
  SynthesisRequest,
} from "../delegation/types.js";

export interface SubAgentProvider {
  execute(request: AgentRequest, signal: AbortSignal): Promise<AgentExecutionResult>;
  synthesize(
    request: SynthesisRequest,
    signal: AbortSignal,
  ): Promise<SynthesisExecutionResult>;
}
