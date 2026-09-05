import { afterEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { DelegationOrchestrator } from "../../src/delegation/orchestrator.js";
import { createHttpServer, listen } from "../../src/mcp/http.js";
import type { AccessVerifier } from "../../src/security/cloudflareAccess.js";
import { FakeProvider } from "../fixtures/fakeProvider.js";
import { testConfig } from "../fixtures/testConfig.js";

const servers: ReturnType<typeof createHttpServer>[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe("health endpoint", () => {
  it("returns 200 before host and auth validation", async () => {
    const denyingVerifier: AccessVerifier = { verify: async () => Promise.reject(new Error("deny")) };
    const provider = new FakeProvider();
    const config = testConfig({
      authMode: "cloudflare",
      allowedHosts: ["subagent.full-ranges.com"],
    });
    const server = createHttpServer({
      config,
      orchestrator: new DelegationOrchestrator(provider, config),
      accessVerifier: denyingVerifier,
    });
    servers.push(server);
    const port = await listen(server, 0);
    expect((server.address() as AddressInfo).port).toBe(port);

    const response = await fetch(`http://127.0.0.1:${port}/healthz`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("rejects non-GET health requests", async () => {
    const provider = new FakeProvider();
    const config = testConfig();
    const server = createHttpServer({
      config,
      orchestrator: new DelegationOrchestrator(provider, config),
      accessVerifier: { verify: async () => ({ token: "x", clientId: "x", scopes: [] }) },
    });
    servers.push(server);
    const port = await listen(server, 0);
    const response = await fetch(`http://127.0.0.1:${port}/healthz`, { method: "POST" });
    expect(response.status).toBe(405);
  });
});
