import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CloudflareAccessVerifier } from "../../src/security/cloudflareAccess.js";

describe("Cloudflare Access JWT", () => {
  let issuer: string;
  let privateKey: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];
  let verifier: CloudflareAccessVerifier;
  const audience = "test-audience";
  const jwksServer = createServer();

  beforeAll(async () => {
    const pair = await generateKeyPair("RS256", { extractable: true });
    privateKey = pair.privateKey;
    const jwk = await exportJWK(pair.publicKey);
    Object.assign(jwk, { kid: "test-key", alg: "RS256", use: "sig" });
    jwksServer.on("request", (_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ keys: [jwk] }));
    });
    await new Promise<void>((resolve) => jwksServer.listen(0, "127.0.0.1", resolve));
    issuer = `http://127.0.0.1:${(jwksServer.address() as AddressInfo).port}`;
    verifier = new CloudflareAccessVerifier(issuer, audience);
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => jwksServer.close(() => resolve()));
  });

  it("accepts a valid signature, issuer, audience, and expiration", async () => {
    const token = await makeToken(audience);
    const auth = await verifier.verify(requestWithToken(token));
    expect(auth.clientId).toBe("user-1");
    expect(auth.expiresAt).toBeTypeOf("number");
  });

  it("rejects a missing assertion", async () => {
    await expect(verifier.verify({ headers: {} } as IncomingMessage)).rejects.toThrow(
      "Missing Cloudflare Access JWT",
    );
  });

  it("rejects a wrong audience", async () => {
    await expect(verifier.verify(requestWithToken(await makeToken("wrong")))).rejects.toThrow(
      "Invalid Cloudflare Access JWT",
    );
  });

  it("rejects a wrong issuer", async () => {
    await expect(
      verifier.verify(requestWithToken(await makeToken(audience, "https://wrong.example"))),
    ).rejects.toThrow("Invalid Cloudflare Access JWT");
  });

  it("rejects an expired token", async () => {
    await expect(
      verifier.verify(requestWithToken(await makeToken(audience, issuer, "0s"))),
    ).rejects.toThrow("Invalid Cloudflare Access JWT");
  });

  it("rejects a signed token with no expiration claim", async () => {
    const token = await new SignJWT({ email: "user@example.com" })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setSubject("user-1")
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt()
      .sign(privateKey);

    await expect(verifier.verify(requestWithToken(token))).rejects.toThrow(
      "Invalid Cloudflare Access JWT",
    );
  });

  it("rejects an invalid signature", async () => {
    const otherPair = await generateKeyPair("RS256");
    const token = await new SignJWT({ email: "user@example.com" })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setSubject("user-1")
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(otherPair.privateKey);
    await expect(verifier.verify(requestWithToken(token))).rejects.toThrow(
      "Invalid Cloudflare Access JWT",
    );
  });

  async function makeToken(
    aud: string,
    tokenIssuer = issuer,
    expiration: string | number | Date = "5m",
  ): Promise<string> {
    return new SignJWT({ email: "user@example.com" })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setSubject("user-1")
      .setIssuer(tokenIssuer)
      .setAudience(aud)
      .setIssuedAt()
      .setExpirationTime(expiration)
      .sign(privateKey);
  }
});

function requestWithToken(token: string): IncomingMessage {
  return { headers: { "cf-access-jwt-assertion": token } } as unknown as IncomingMessage;
}
