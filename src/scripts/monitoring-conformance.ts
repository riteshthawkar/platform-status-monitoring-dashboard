#!/usr/bin/env tsx

import { writeFile } from "node:fs/promises";
import {
  type MonitoringEndpoint,
  type MonitoringProfile,
  getRequiredEndpointsForProfile,
  validateMonitoringHttpConsistency,
  validateMonitoringPayload,
} from "../lib/monitoring-contract";

interface CliOptions {
  baseUrl: string;
  profile: MonitoringProfile;
  timeoutMs: number;
  requireHealthy: boolean;
  probeMode: boolean;
  retries: number;
  retryDelayMs: number;
  maxLatencyMs: number | null;
  enforceLatency: boolean;
  maxAgeSeconds: number | null;
  requireRelease: boolean;
  outputJsonPath: string | null;
  authBearerToken: string | null;
  authHeaderName: string | null;
  authHeaderValue: string | null;
  endpointsOverride: MonitoringEndpoint[] | null;
}

interface EndpointResult {
  endpoint: MonitoringEndpoint;
  ok: boolean;
  httpStatus: number | null;
  durationMs: number;
  errors: string[];
  warnings: string[];
  reportedStatus: string | null;
  attempts: number;
}

const options = parseArgs(process.argv.slice(2));

async function main() {
  const endpoints = options.endpointsOverride ?? getRequiredEndpointsForProfile(options.profile);
  const results: EndpointResult[] = [];

  console.log(`\nMonitoring conformance check`);
  console.log(`baseUrl=${options.baseUrl}`);
  console.log(`profile=${options.profile}`);
  console.log(`requiredHealthy=${String(options.requireHealthy)}`);
  console.log(`probeMode=${String(options.probeMode)}\n`);

  for (const endpoint of endpoints) {
    const result = await checkEndpoint(options, endpoint);
    results.push(result);
    printEndpointResult(result);
  }

  const failed = results.filter((result) => !result.ok);
  const warnings = results.flatMap((result) => result.warnings).length;

  console.log("\nSummary");
  console.log(`checked=${results.length}`);
  console.log(`failed=${failed.length}`);
  console.log(`warnings=${warnings}`);

  if (options.outputJsonPath) {
    const report = {
      generatedAt: new Date().toISOString(),
      baseUrl: options.baseUrl,
      profile: options.profile,
      checkedEndpoints: endpoints,
      failedEndpoints: failed.map((result) => result.endpoint),
      results,
    };
    await writeFile(options.outputJsonPath, JSON.stringify(report, null, 2), "utf-8");
    console.log(`report=${options.outputJsonPath}`);
  }

  if (failed.length > 0) {
    process.exit(1);
  }
}

async function checkEndpoint(options: CliOptions, endpoint: MonitoringEndpoint): Promise<EndpointResult> {
  const url = new URL(endpoint, options.baseUrl).toString();
  const errors: string[] = [];
  const warnings: string[] = [];
  let lastError: string | null = null;
  let attempts = 0;
  let lastDurationMs = 0;
  let lastHttpStatus: number | null = null;
  let reportedStatus: string | null = null;

  for (let attempt = 1; attempt <= options.retries + 1; attempt += 1) {
    attempts = attempt;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
    const startedAt = Date.now();

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: buildHeaders(options),
        signal: controller.signal,
      });
      lastDurationMs = Date.now() - startedAt;
      lastHttpStatus = response.status;

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.toLowerCase().includes("application/json")) {
        errors.push(`content-type must include application/json; received "${contentType ?? "missing"}"`);
      }

      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        errors.push("response body is not valid JSON");
      }

      if (body && typeof body === "object" && "status" in body && typeof (body as { status?: unknown }).status === "string") {
        reportedStatus = (body as { status: string }).status;
      }

      const statusValidation = validateMonitoringHttpConsistency(endpoint, response.status, reportedStatus);
      errors.push(...statusValidation.errors);
      warnings.push(...statusValidation.warnings);

      if (body !== null) {
        const payloadValidation = validateMonitoringPayload(endpoint, body, {
          probeMode: options.probeMode,
          requireRelease: options.requireRelease,
        });
        errors.push(...payloadValidation.errors);
        warnings.push(...payloadValidation.warnings);
      }

      if (options.maxLatencyMs !== null && lastDurationMs > options.maxLatencyMs) {
        const msg = `${endpoint} latency ${lastDurationMs}ms exceeds max-latency-ms ${options.maxLatencyMs}ms`;
        if (options.enforceLatency) {
          errors.push(msg);
        } else {
          warnings.push(msg);
        }
      }

      if (options.maxAgeSeconds !== null && body && typeof body === "object" && "timestamp" in body) {
        const ts = (body as { timestamp?: unknown }).timestamp;
        const freshnessError = validateTimestampAge(ts, options.maxAgeSeconds);
        if (freshnessError) {
          errors.push(freshnessError);
        }
      }

      if (options.requireHealthy && reportedStatus !== "healthy") {
        errors.push(`reported status is "${reportedStatus ?? "unknown"}"; expected "healthy"`);
      }

      if (errors.length === 0) {
        return {
          endpoint,
          ok: true,
          httpStatus: lastHttpStatus,
          durationMs: lastDurationMs,
          errors,
          warnings,
          reportedStatus,
          attempts,
        };
      }

      lastError = errors.join("; ");
      if (attempt <= options.retries) {
        await delay(options.retryDelayMs);
        errors.length = 0;
        warnings.length = 0;
      }
    } catch (error) {
      lastDurationMs = Date.now() - startedAt;
      lastHttpStatus = null;
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt <= options.retries) {
        await delay(options.retryDelayMs);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  if (lastError) {
    errors.push(lastError);
  }

  return {
    endpoint,
    ok: false,
    httpStatus: lastHttpStatus,
    durationMs: lastDurationMs,
    errors,
    warnings,
    reportedStatus,
    attempts,
  };
}

function printEndpointResult(result: EndpointResult) {
  const status = result.ok ? "PASS" : "FAIL";
  const reported = result.reportedStatus ? ` status=${result.reportedStatus}` : "";
  const http = result.httpStatus === null ? "http=ERR" : `http=${result.httpStatus}`;
  const retried = result.attempts > 1 ? ` attempts=${result.attempts}` : "";
  console.log(`${status} ${result.endpoint} ${http}${reported} duration=${result.durationMs}ms${retried}`);
  for (const warning of result.warnings) {
    console.log(`  WARN: ${warning}`);
  }
  for (const error of result.errors) {
    console.log(`  ERROR: ${error}`);
  }
}

function parseArgs(argv: string[]): CliOptions {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const [key, inline] = token.split("=", 2);
    if (inline !== undefined) {
      args.set(key, inline);
      continue;
    }
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args.set(key, next);
      i += 1;
      continue;
    }
    args.set(key, "true");
  }

  const baseUrl = args.get("--base-url");
  if (!baseUrl) {
    printUsageAndExit("Missing required --base-url");
  }

  const profile = (args.get("--profile") || "generic") as MonitoringProfile;
  if (!["generic", "llm", "rag", "agent-platform"].includes(profile)) {
    printUsageAndExit(`Invalid --profile value "${profile}"`);
  }

  const timeoutMs = parsePositiveInteger(args.get("--timeout-ms"), 10000, "--timeout-ms");
  const retries = parsePositiveInteger(args.get("--retries"), 2, "--retries");
  const retryDelayMs = parsePositiveInteger(args.get("--retry-delay-ms"), 300, "--retry-delay-ms");

  const requireHealthy = parseBoolean(args.get("--require-healthy"), false);
  const probeMode = parseBoolean(args.get("--probe-mode"), true);
  const enforceLatency = parseBoolean(args.get("--enforce-latency"), false);
  const requireRelease = parseBoolean(args.get("--require-release"), false);

  const maxLatencyMs = parseOptionalPositiveInteger(args.get("--max-latency-ms"), "--max-latency-ms");
  const maxAgeSeconds = parseOptionalPositiveInteger(args.get("--max-age-seconds"), "--max-age-seconds");
  const outputJsonPath = args.get("--output-json") || null;
  const authBearerToken = args.get("--auth-bearer-token") || null;
  const authHeaderName = args.get("--auth-header-name") || null;
  const authHeaderValue = args.get("--auth-header-value") || null;
  const endpointsOverride = parseEndpoints(args.get("--endpoints"));

  if ((authHeaderName && !authHeaderValue) || (!authHeaderName && authHeaderValue)) {
    printUsageAndExit("Both --auth-header-name and --auth-header-value must be provided together");
  }

  return {
    baseUrl: normalizeBaseUrl(baseUrl),
    profile,
    timeoutMs,
    requireHealthy,
    probeMode,
    retries,
    retryDelayMs,
    maxLatencyMs,
    enforceLatency,
    maxAgeSeconds,
    requireRelease,
    outputJsonPath,
    authBearerToken,
    authHeaderName,
    authHeaderValue,
    endpointsOverride,
  };
}

function buildHeaders(options: CliOptions): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (options.probeMode) {
    headers["x-health-probe"] = "true";
  }

  if (options.authBearerToken) {
    headers.Authorization = `Bearer ${options.authBearerToken}`;
  }

  if (options.authHeaderName && options.authHeaderValue) {
    headers[options.authHeaderName] = options.authHeaderValue;
  }

  return headers;
}

function parsePositiveInteger(raw: string | undefined, fallback: number, name: string): number {
  const value = raw ?? String(fallback);
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    printUsageAndExit(`Invalid ${name} value "${value}"`);
  }
  return parsed;
}

function parseOptionalPositiveInteger(raw: string | undefined, name: string): number | null {
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    printUsageAndExit(`Invalid ${name} value "${raw}"`);
  }
  return parsed;
}

function parseEndpoints(raw: string | undefined): MonitoringEndpoint[] | null {
  if (!raw) return null;
  const valid = new Set<MonitoringEndpoint>([
    "/health/live",
    "/health/ready",
    "/health/detailed",
    "/health/journey",
    "/health/startup",
  ]);
  const parsed = raw
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);

  if (parsed.length === 0) {
    printUsageAndExit("--endpoints must contain at least one endpoint");
  }

  const endpoints: MonitoringEndpoint[] = [];
  for (const endpoint of parsed) {
    if (!valid.has(endpoint as MonitoringEndpoint)) {
      printUsageAndExit(`Invalid endpoint "${endpoint}" in --endpoints`);
    }
    endpoints.push(endpoint as MonitoringEndpoint);
  }

  return endpoints;
}

function validateTimestampAge(value: unknown, maxAgeSeconds: number): string | null {
  if (typeof value !== "string") {
    return "timestamp must be present for age validation";
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return "timestamp is invalid for age validation";
  }
  const ageSeconds = Math.floor((Date.now() - parsed) / 1000);
  if (ageSeconds > maxAgeSeconds) {
    return `timestamp age ${ageSeconds}s exceeds max-age-seconds ${maxAgeSeconds}s`;
  }
  return null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (!trimmed) {
    printUsageAndExit("Invalid empty --base-url");
  }
  try {
    const normalized = new URL(trimmed);
    return normalized.toString();
  } catch {
    printUsageAndExit(`Invalid --base-url value "${baseUrl}"`);
  }
}

function printUsageAndExit(message: string): never {
  console.error(`\n${message}\n`);
  console.error("Usage:");
  console.error("  tsx src/scripts/monitoring-conformance.ts --base-url <url> [--profile generic|llm|rag|agent-platform]");
  console.error("    [--endpoints /health/live,/health/ready,/health/detailed]");
  console.error("    [--timeout-ms 10000] [--retries 2] [--retry-delay-ms 300]");
  console.error("    [--require-healthy false] [--probe-mode true] [--require-release false]");
  console.error("    [--max-latency-ms 1500] [--enforce-latency false] [--max-age-seconds 300]");
  console.error("    [--auth-bearer-token <token>]");
  console.error("    [--auth-header-name X-Key --auth-header-value value]");
  console.error("    [--output-json ./conformance-report.json]");
  process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
