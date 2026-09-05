export interface Logger {
  info(event: string, data?: Record<string, unknown>): void;
  error(event: string, data?: Record<string, unknown>): void;
}

const SAFE_ERROR_CODE = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;

export function errorCode(error: unknown): string {
  const name = error instanceof Error ? error.name : "UnknownError";
  return SAFE_ERROR_CODE.test(name) ? name : "Error";
}

function write(level: "info" | "error", event: string, data: Record<string, unknown> = {}): void {
  const entry = JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...data });
  (level === "error" ? process.stderr : process.stdout).write(`${entry}\n`);
}

export const logger: Logger = {
  info: (event, data) => write("info", event, data),
  error: (event, data) => write("error", event, data),
};
