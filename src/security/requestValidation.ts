import type { IncomingMessage, ServerResponse } from "node:http";
import { hostHeaderValidation, originValidation } from "@modelcontextprotocol/node";

export interface RequestGuards {
  validate(req: IncomingMessage, res: ServerResponse): boolean;
}

export function createRequestGuards(
  allowedHosts: string[],
  allowedOriginHostnames: string[],
): RequestGuards {
  const host = hostHeaderValidation(allowedHosts);
  const origin = originValidation(allowedOriginHostnames);
  return {
    validate(req, res) {
      return host(req, res) && origin(req, res);
    },
  };
}
