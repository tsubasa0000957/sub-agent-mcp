import type { Source } from "../delegation/types.js";
import type { SynthesisResult, WorkerResult } from "../schemas/worker.js";

export function normalizeUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();
    url.hash = "";
    if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) {
      url.port = "";
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

export function dedupeSources(sources: Source[]): Source[] {
  const seen = new Map<string, Source>();
  for (const source of sources) {
    const normalized = normalizeUrl(source.url);
    if (normalized === undefined) continue;
    const prior = seen.get(normalized);
    seen.set(normalized, source.title || prior === undefined ? { ...source, url: normalized } : prior);
  }
  return [...seen.values()];
}

export function validateWorkerSources(result: WorkerResult, actualSources: Source[]): WorkerResult {
  const actual = new Set(
    actualSources.map((source) => normalizeUrl(source.url)).filter((url): url is string => url !== undefined),
  );

  return {
    ...result,
    findings: result.findings.map((finding) => ({
      ...finding,
      sourceUrls: finding.sourceUrls
        .map(normalizeUrl)
        .filter((url): url is string => url !== undefined && actual.has(url)),
    })),
  };
}

export function validateSynthesisSources(
  result: SynthesisResult,
  actualSources: Source[],
): SynthesisResult {
  const actual = new Set(
    actualSources.map((source) => normalizeUrl(source.url)).filter((url): url is string => url !== undefined),
  );

  return {
    ...result,
    keyFindings: result.keyFindings.map((finding) => ({
      ...finding,
      sourceUrls: finding.sourceUrls
        .map(normalizeUrl)
        .filter((url): url is string => url !== undefined && actual.has(url)),
    })),
  };
}
