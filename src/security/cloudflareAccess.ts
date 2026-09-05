import type { IncomingMessage } from "node:http";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { AuthInfo } from "@modelcontextprotocol/server";

export interface AccessVerifier {
  verify(req: IncomingMessage): Promise<AuthInfo>;
}

export class CloudflareAccessVerifier implements AccessVerifier {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(
    private readonly teamDomain: string,
    private readonly audience: string,
  ) {
    this.jwks = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
  }

  async verify(req: IncomingMessage): Promise<AuthInfo> {
    const header = req.headers["cf-access-jwt-assertion"];
    const token = Array.isArray(header) ? header[0] : header;
    if (!token) throw new AccessDeniedError("Missing Cloudflare Access JWT");

    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: this.teamDomain,
        audience: this.audience,
        algorithms: ["RS256"],
        requiredClaims: ["exp"],
      });
      return authInfo(token, payload);
    } catch {
      throw new AccessDeniedError("Invalid Cloudflare Access JWT");
    }
  }
}

export class DevAccessVerifier implements AccessVerifier {
  async verify(req: IncomingMessage): Promise<AuthInfo> {
    if (!isLoopback(req.socket.remoteAddress)) {
      throw new AccessDeniedError("Development authentication is restricted to localhost");
    }
    return { token: "development", clientId: "local-development", scopes: [] };
  }
}

export class AccessDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccessDeniedError";
  }
}

function authInfo(token: string, payload: JWTPayload): AuthInfo {
  const scope = typeof payload.scope === "string" ? payload.scope.split(/\s+/).filter(Boolean) : [];
  const clientId =
    typeof payload.sub === "string"
      ? payload.sub
      : typeof payload.email === "string"
        ? payload.email
        : "cloudflare-access-user";
  return {
    token,
    clientId,
    scopes: scope,
    ...(typeof payload.exp === "number" ? { expiresAt: payload.exp } : {}),
    extra: { subject: payload.sub, email: payload.email },
  };
}

function isLoopback(address: string | undefined): boolean {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}
