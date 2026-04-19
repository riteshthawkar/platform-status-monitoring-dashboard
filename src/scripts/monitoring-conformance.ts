#!/usr/bin/env tsx

import {
  type MonitoringEndpoint,
  type MonitoringProfile,
  getRequiredEndpointsForProfile,
  validateMonitoringPayload,
} from "../lib/monitoring-contract";

interface CliOptions {
  baseUrl: string;
  profile: MonitoringProfile;
  timeoutMs: number;
  requireHealthy: boolean;
  probeMode: boolean;
}

interface EndpointResult {
  endpoint: MonitoringEndpoint;
  ok: boolean;
  httpStatus: number | null;
  durationMs: number;
  errors: string[];
  warnings: string[];
  reportedStatus: string | null;
}

const options = parseArgs(process.argv.slice(2));

async function main() {
  const endpoints = getRequiredEndpointsForProfile(options.profile);
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

  if (failed.length > 0) {
    process.exit(1);
  }
}

async function checkEndpoint(options: CliOptions, endpoint: MonitoringEndpoint): Promise<EndpointResult> {
  const url = new URL(endpoint, options.baseUrl).toString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...(options.probeMode ? { "x-health-probe": "true" } : {}),
      },
      signal: controller.signal,
    });

    const durationMs = Date.now() - startedAt;
    const errors: string[] = [];
    const warnings: string[] = [];

    if (![200, 503].includes(response.status)) {
      errors.push(`unexpected HTTP status ${response.status}; expected 200 or 503`);
    }

    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      errors.push("response body is not valid JSON");
    }

    let reportedStatus: string | null = null;
    if (body && typeof body === "object" && "status" in body && typeof (body as { status?: unknown }).status === "string") {
      reportedStatus = (body as { status: string }).status;
    }

    if (body !== null) {
      const validation = validateMonitoringPayload(endpoint, body);
      if (!validation.ok) {
        errors.push(...validation.errors);
      }
    }

    if (response.status === 503) {
      warnings.push(`${endpoint} returned HTTP 503`);
    }

    if (options.requireHealthy && reportedStatus !== "healthy") {
      errors.push(`reported status is "${reportedStatus ?? "unknown"}"; expected "healthy"`);
    }

    return {
      endpoint,
      ok: errors.length === 0,
      httpStatus: response.status,
      durationMs,
      errors,
      warnings,
      reportedStatus,
    };
  } catch (error) {
    return {
      endpoint,
      ok: false,
      httpStatus: null,
      durationMs: Date.now() - startedAt,
      errors: [error instanceof Error ? error.message : String(error)],
      warnings: [],
      reportedStatus: null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function printEndpointResult(result: EndpointResult) {
  const status = result.ok ? "PASS" : "FAIL";
  const reported = result.reportedStatus ? ` status=${result.reportedStatus}` : "";
  const http = result.httpStatus === null ? "http=ERR" : `http=${result.httpStatus}`;
  console.log(`${status} ${result.endpoint} ${http}${reported} duration=${result.durationMs}ms`);
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

  const timeoutMsRaw = args.get("--timeout-ms") || "10000";
  const timeoutMs = Number.parseInt(timeoutMsRaw, 10);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    printUsageAndExit(`Invalid --timeout-ms value "${timeoutMsRaw}"`);
  }

  const requireHealthy = parseBoolean(args.get("--require-healthy"), false);
  const probeMode = parseBoolean(args.get("--probe-mode"), true);

  return {
    baseUrl: normalizeBaseUrl(baseUrl),
    profile,
    timeoutMs,
    requireHealthy,
    probeMode,
  };
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
  console.error("    [--timeout-ms 10000] [--require-healthy false] [--probe-mode true]");
  process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
