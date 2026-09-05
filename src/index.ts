import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { DelegationOrchestrator } from "./delegation/orchestrator.js";
import { loadConfig } from "./infra/config.js";
import { errorCode, logger } from "./infra/logging.js";
import { createHttpServer, listen } from "./mcp/http.js";
import { OpenAIProvider } from "./providers/openai.js";
import { CloudflareAccessVerifier, DevAccessVerifier } from "./security/cloudflareAccess.js";

if (existsSync(".env")) loadEnvFile(".env");

const config = loadConfig();
const provider = new OpenAIProvider(config.model, config.openAiApiKey);
const orchestrator = new DelegationOrchestrator(provider, config);
const accessVerifier =
  config.authMode === "cloudflare"
    ? new CloudflareAccessVerifier(config.cloudflareTeamDomain!, config.cloudflareAccessAud!)
    : new DevAccessVerifier();
const server = createHttpServer({ config, orchestrator, accessVerifier });
const port = await listen(server, config.port);

logger.info("server.started", {
  port,
  authMode: config.authMode,
  model: config.model,
  nodeEnv: config.nodeEnv,
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    logger.info("server.stopping", { signal });
    server.close((error) => {
      if (error) {
        logger.error("server.stop_failed", { errorCode: errorCode(error) });
        process.exitCode = 1;
      }
    });
  });
}
