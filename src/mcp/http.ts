import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { createMcpHandler, type AuthInfo } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import type { DelegationOrchestrator } from "../delegation/orchestrator.js";
import type { Config } from "../infra/config.js";
import { errorCode, logger } from "../infra/logging.js";
import type { AccessVerifier } from "../security/cloudflareAccess.js";
import { createRequestGuards } from "../security/requestValidation.js";
import { createSubAgentMcpServer } from "./server.js";

const MAX_BODY_BYTES = 1024 * 1024;

export interface HttpDependencies {
  config: Config;
  orchestrator: DelegationOrchestrator;
  accessVerifier: AccessVerifier;
}

export function createHttpServer(deps: HttpDependencies): Server {
  const guards = createRequestGuards(deps.config.allowedHosts, deps.config.allowedOrigins);
  const handler = createMcpHandler(
    ({ requestInfo }) =>
      createSubAgentMcpServer({
        orchestrator: deps.orchestrator,
        maxContextChars: deps.config.maxContextChars,
        maxTotalInputChars: deps.config.maxTotalInputChars,
        ...(requestInfo ? { requestSignal: requestInfo.signal } : {}),
      }),
    { legacy: "stateless", keepAliveMs: 15_000, onerror: reportHandlerError },
  );
  const nodeHandler = toNodeHandler(handler, { onerror: reportHandlerError });

  const server = createServer(async (req, res) => {
    try {
      const path = requestPath(req);
      if (path === "/healthz") {
        handleHealth(req, res);
        return;
      }
      if (path !== "/mcp") {
        jsonResponse(res, 404, { error: "Not found" });
        return;
      }
      if (!guards.validate(req, res)) return;

      let auth: AuthInfo;
      try {
        auth = await deps.accessVerifier.verify(req);
      } catch {
        jsonResponse(res, 403, { error: "Forbidden" });
        return;
      }
      (req as IncomingMessage & { auth?: AuthInfo }).auth = auth;

      if (req.method === "POST") {
        const body = await readJsonBody(req, MAX_BODY_BYTES);
        if (body.kind === "error") {
          jsonResponse(res, body.status, {
            jsonrpc: "2.0",
            error: { code: body.code, message: body.message },
            id: null,
          });
          return;
        }
        await nodeHandler(asNodeRequest(req), res, body.value);
        return;
      }
      await nodeHandler(asNodeRequest(req), res);
    } catch (error) {
      logger.error("http.request_failed", {
        errorCode: errorCode(error),
      });
      if (!res.headersSent) jsonResponse(res, 500, { error: "Internal server error" });
      else res.end();
    }
  });

  server.on("close", () => void handler.close());
  return server;
}

export async function listen(server: Server, port: number): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "0.0.0.0", () => {
      server.off("error", reject);
      resolve();
    });
  });
  return (server.address() as AddressInfo).port;
}

function requestPath(req: IncomingMessage): string {
  return new URL(req.url ?? "/", "http://localhost").pathname;
}

function handleHealth(req: IncomingMessage, res: ServerResponse): void {
  if (req.method !== "GET") {
    res.writeHead(405, { Allow: "GET", "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }
  jsonResponse(res, 200, { status: "ok" }, { "Cache-Control": "no-store" });
}

type BodyResult =
  | { kind: "ok"; value: unknown }
  | { kind: "error"; status: number; code: number; message: string };

async function readJsonBody(req: IncomingMessage, maxBytes: number): Promise<BodyResult> {
  const declared = Number(req.headers["content-length"] ?? 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { kind: "error", status: 413, code: -32_000, message: "Request body too large" };
  }

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    size += buffer.length;
    if (size > maxBytes) {
      return { kind: "error", status: 413, code: -32_000, message: "Request body too large" };
    }
    chunks.push(buffer);
  }
  try {
    return { kind: "ok", value: JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown };
  } catch {
    return { kind: "error", status: 400, code: -32_700, message: "Parse error" };
  }
}

function jsonResponse(
  res: ServerResponse,
  status: number,
  body: unknown,
  extraHeaders: Record<string, string> = {},
): void {
  res.writeHead(status, { "Content-Type": "application/json", ...extraHeaders });
  res.end(JSON.stringify(body));
}

function reportHandlerError(error: Error): void {
  logger.error("mcp.handler_error", { errorCode: errorCode(error) });
}

function asNodeRequest(req: IncomingMessage): Parameters<ReturnType<typeof toNodeHandler>>[0] {
  return req as unknown as Parameters<ReturnType<typeof toNodeHandler>>[0];
}
