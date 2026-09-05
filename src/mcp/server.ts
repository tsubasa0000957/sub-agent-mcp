import { McpServer } from "@modelcontextprotocol/server";
import type { DelegationOrchestrator } from "../delegation/orchestrator.js";
import { errorCode, logger } from "../infra/logging.js";
import { createDelegateInputSchema, createParallelDelegateInputSchema } from "../schemas/input.js";
import { DelegationResultSchema, type DelegationResult } from "../schemas/result.js";

export interface McpServerDependencies {
  orchestrator: DelegationOrchestrator;
  maxContextChars: number;
  maxTotalInputChars: number;
  requestSignal?: AbortSignal;
}

export function createSubAgentMcpServer(deps: McpServerDependencies): McpServer {
  const server = new McpServer({ name: "sub-agent-mcp", version: "1.0.0" });
  const delegateInput = createDelegateInputSchema(
    deps.maxContextChars,
    deps.maxTotalInputChars,
  );
  const parallelInput = createParallelDelegateInputSchema(
    deps.maxContextChars,
    deps.maxTotalInputChars,
  );

  server.registerTool(
    "delegate",
    {
      title: "Delegate to an independent sub-agent",
      description:
        "Runs one isolated reasoning, review, or research sub-agent. Web access is optional and controlled by the web policy.",
      inputSchema: delegateInput,
      outputSchema: DelegationResultSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input, ctx) => {
      const startedAt = Date.now();
      try {
        const result = await deps.orchestrator.delegate(
          input,
          combinedSignal(ctx.mcpReq.signal, deps.requestSignal),
        );
        logger.info("delegate.completed", {
          requestId: result.requestId,
          mode: result.mode,
          webPolicy: result.webPolicy,
          webUsed: result.webUsed,
          status: result.status,
          durationMs: Date.now() - startedAt,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          reasoningTokens: result.usage.reasoningTokens,
          webSearchCalls: result.usage.webSearchCalls,
        });
        return toolResult(result);
      } catch (error) {
        logger.error("delegate.failed", {
          durationMs: Date.now() - startedAt,
          errorCode: errorCode(error),
        });
        throw error;
      }
    },
  );

  server.registerTool(
    "parallel_delegate",
    {
      title: "Delegate to three independent sub-agents",
      description:
        "Runs three isolated workers concurrently and synthesizes their results. Workers never see one another's responses.",
      inputSchema: parallelInput,
      outputSchema: DelegationResultSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input, ctx) => {
      const startedAt = Date.now();
      try {
        const result = await deps.orchestrator.parallelDelegate(
          input,
          combinedSignal(ctx.mcpReq.signal, deps.requestSignal),
        );
        logger.info("parallel_delegate.completed", {
          requestId: result.requestId,
          mode: result.mode,
          webPolicy: result.webPolicy,
          webUsed: result.webUsed,
          status: result.status,
          durationMs: Date.now() - startedAt,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          reasoningTokens: result.usage.reasoningTokens,
          webSearchCalls: result.usage.webSearchCalls,
        });
        return toolResult(result);
      } catch (error) {
        logger.error("parallel_delegate.failed", {
          durationMs: Date.now() - startedAt,
          errorCode: errorCode(error),
        });
        throw error;
      }
    },
  );

  return server;
}

function toolResult(result: DelegationResult) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result) }],
    structuredContent: result,
  };
}

function combinedSignal(primary: AbortSignal, secondary: AbortSignal | undefined): AbortSignal {
  return secondary === undefined ? primary : AbortSignal.any([primary, secondary]);
}
