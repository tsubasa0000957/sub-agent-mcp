import { afterEach, describe, expect, it } from "vitest";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { DelegationOrchestrator } from "../../src/delegation/orchestrator.js";
import { createHttpServer, listen } from "../../src/mcp/http.js";
import { DevAccessVerifier } from "../../src/security/cloudflareAccess.js";
import { FakeProvider } from "../fixtures/fakeProvider.js";
import { testConfig } from "../fixtures/testConfig.js";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

describe("MCP Streamable HTTP", () => {
  it("lists and calls both delegation tools with the official client", async () => {
    const config = testConfig();
    const provider = new FakeProvider();
    const server = createHttpServer({
      config,
      orchestrator: new DelegationOrchestrator(provider, config),
      accessVerifier: new DevAccessVerifier(),
    });
    const port = await listen(server, 0);
    const client = new Client({ name: "integration-test", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`));
    await client.connect(transport);
    cleanups.push(async () => {
      await client.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual(["delegate", "parallel_delegate"]);
    expect(tools.every((tool) => tool.description && tool.outputSchema)).toBe(true);

    const result = await client.callTool({
      name: "delegate",
      arguments: { objective: "give a second opinion" },
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({ execution: "single", status: "success" });

    const parallel = await client.callTool({
      name: "parallel_delegate",
      arguments: { objective: "review independently", mode: "review", web: "disabled" },
    });
    expect(parallel.isError).not.toBe(true);
    expect(parallel.structuredContent).toMatchObject({ execution: "parallel", status: "success" });
  });

  it("accepts a 2025 stateless Streamable HTTP initialization request", async () => {
    const config = testConfig();
    const server = createHttpServer({
      config,
      orchestrator: new DelegationOrchestrator(new FakeProvider(), config),
      accessVerifier: new DevAccessVerifier(),
    });
    const port = await listen(server, 0);
    cleanups.push(() => new Promise<void>((resolve) => server.close(() => resolve())));

    const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "legacy-test", version: "1.0.0" },
        },
      }),
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('"protocolVersion"');
  });

  it("rejects an oversized HTTP body before MCP processing", async () => {
    const config = testConfig();
    const server = createHttpServer({
      config,
      orchestrator: new DelegationOrchestrator(new FakeProvider(), config),
      accessVerifier: new DevAccessVerifier(),
    });
    const port = await listen(server, 0);
    cleanups.push(() => new Promise<void>((resolve) => server.close(() => resolve())));

    const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "x".repeat(1024 * 1024 + 1),
    });

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({
      error: { code: -32_000, message: "Request body too large" },
    });
  });

  it("returns a retryable MCP tool error when the global call budget is exhausted", async () => {
    const config = testConfig({ maxOpenAiCallsPerMinute: 4 });
    const server = createHttpServer({
      config,
      orchestrator: new DelegationOrchestrator(new FakeProvider(), config),
      accessVerifier: new DevAccessVerifier(),
    });
    const port = await listen(server, 0);
    const client = new Client({ name: "rate-limit-test", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`));
    await client.connect(transport);
    cleanups.push(async () => {
      await client.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    await client.callTool({ name: "parallel_delegate", arguments: { objective: "first" } });
    const rejected = await client.callTool({
      name: "delegate",
      arguments: { objective: "over budget" },
    });

    expect(rejected.isError).toBe(true);
    expect(JSON.stringify(rejected.content)).toContain("retry later");
  });
});
