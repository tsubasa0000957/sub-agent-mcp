import type { Mode, WebPolicy } from "../schemas/input.js";

export function resolveMode(mode: Mode | undefined): Mode {
  return mode ?? "reason";
}

export function resolveWebPolicy(mode: Mode, web: WebPolicy | undefined): WebPolicy {
  if (web !== undefined) return web;
  return mode === "research" ? "required" : "disabled";
}
