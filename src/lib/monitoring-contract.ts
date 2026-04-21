export const MONITORING_CONTRACT_VERSION = "monitoring-contract/v1" as const;

export type MonitoringStatus = "healthy" | "degraded" | "unhealthy" | "unknown";

export type MonitoringEndpoint =
  | "/health/live"
  | "/health/ready"
  | "/health/detailed"
  | "/health/journey"
  | "/health/startup";

export type MonitoringProfile = "generic" | "llm" | "rag" | "agent-platform";

export interface MonitoringValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export interface MonitoringValidationOptions {
  probeMode?: boolean;
  requireRelease?: boolean;
}

const VALID_STATUSES = new Set<MonitoringStatus>([
  "healthy",
  "degraded",
  "unhealthy",
  "unknown",
]);

const PROFILE_ENDPOINTS: Record<MonitoringProfile, MonitoringEndpoint[]> = {
  generic: ["/health/live", "/health/ready", "/health/detailed"],
  llm: ["/health/live", "/health/ready", "/health/detailed", "/health/journey"],
  rag: ["/health/live", "/health/ready", "/health/detailed", "/health/journey"],
  "agent-platform": ["/health/live", "/health/ready", "/health/detailed", "/health/journey"],
};

export function getRequiredEndpointsForProfile(profile: MonitoringProfile): MonitoringEndpoint[] {
  return PROFILE_ENDPOINTS[profile];
}

export function validateMonitoringPayload(
  endpoint: MonitoringEndpoint,
  payload: unknown,
  options?: MonitoringValidationOptions
): MonitoringValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isObject(payload)) {
    return { ok: false, errors: ["Response body must be a JSON object"], warnings };
  }

  validateCommonFields(payload, errors, warnings, options);

  if (endpoint === "/health/detailed") {
    validateDetailedFields(payload, errors, warnings);
  }

  if (endpoint === "/health/journey") {
    validateJourneyFields(payload, errors, warnings, options);
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function validateMonitoringHttpConsistency(
  endpoint: MonitoringEndpoint,
  httpStatus: number,
  reportedStatus: string | null
): MonitoringValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (![200, 503].includes(httpStatus)) {
    errors.push(`unexpected HTTP status ${httpStatus}; expected 200 or 503`);
  }

  const nonHealthy = reportedStatus === "degraded" || reportedStatus === "unhealthy";
  const isCriticalEndpoint = endpoint === "/health/ready" || endpoint === "/health/journey";

  if (httpStatus === 200 && reportedStatus === "unhealthy" && isCriticalEndpoint) {
    errors.push(`${endpoint} reports "unhealthy" but returned HTTP 200; expected 503 for critical endpoint`);
  }

  if (httpStatus === 503 && reportedStatus === "healthy") {
    warnings.push(`HTTP 503 with payload status "healthy" indicates inconsistent health signaling`);
  }

  if (httpStatus === 200 && nonHealthy && endpoint === "/health/live") {
    warnings.push(`/health/live returned 200 with status "${reportedStatus}"`);
  }

  return { ok: errors.length === 0, errors, warnings };
}

function validateCommonFields(
  payload: Record<string, unknown>,
  errors: string[],
  warnings: string[],
  options?: MonitoringValidationOptions
) {
  if (payload.version !== MONITORING_CONTRACT_VERSION) {
    errors.push(`version must equal "${MONITORING_CONTRACT_VERSION}"`);
  }

  if (!isObject(payload.service)) {
    errors.push("service must be an object");
  } else {
    if (!isNonEmptyString(payload.service.id)) {
      errors.push("service.id must be a non-empty string");
    }
    if (!isNonEmptyString(payload.service.name)) {
      errors.push("service.name must be a non-empty string");
    }
  }

  if (!isNonEmptyString(payload.status) || !VALID_STATUSES.has(payload.status as MonitoringStatus)) {
    errors.push("status must be one of healthy|degraded|unhealthy|unknown");
  }

  if (!isNonEmptyString(payload.timestamp) || !isIsoTimestamp(payload.timestamp)) {
    errors.push("timestamp must be an ISO-8601 date-time string");
  }

  if (payload.summary !== undefined && typeof payload.summary !== "string") {
    errors.push("summary must be a string when present");
  }

  validateRelease(payload, errors, warnings, options);
}

function validateDetailedFields(payload: Record<string, unknown>, errors: string[], warnings: string[]) {
  if (!isObject(payload.checks)) {
    errors.push("checks must be an object");
    return;
  }

  const checkEntries = Object.entries(payload.checks);
  if (checkEntries.length === 0) {
    errors.push("checks must contain at least one component");
    return;
  }

  for (const [checkName, checkValue] of checkEntries) {
    if (!isObject(checkValue)) {
      errors.push(`checks.${checkName} must be an object`);
      continue;
    }
    if (!isNonEmptyString(checkValue.status) || !VALID_STATUSES.has(checkValue.status as MonitoringStatus)) {
      errors.push(`checks.${checkName}.status must be one of healthy|degraded|unhealthy|unknown`);
    }
    if (checkValue.latencyMs !== undefined && (!isNumber(checkValue.latencyMs) || checkValue.latencyMs < 0)) {
      errors.push(`checks.${checkName}.latencyMs must be a non-negative number when present`);
    }
  }

  const statusRanks: Record<MonitoringStatus, number> = {
    healthy: 0,
    degraded: 1,
    unknown: 2,
    unhealthy: 3,
  };
  const worstCheckStatus = checkEntries
    .map(([, checkValue]) => (isObject(checkValue) && isNonEmptyString(checkValue.status) ? checkValue.status : null))
    .filter((status): status is MonitoringStatus => !!status && VALID_STATUSES.has(status as MonitoringStatus))
    .sort((a, b) => statusRanks[b] - statusRanks[a])[0];

  if (isNonEmptyString(payload.status) && worstCheckStatus) {
    const top = payload.status as MonitoringStatus;
    if (statusRanks[top] < statusRanks[worstCheckStatus]) {
      warnings.push(`top-level status "${top}" is healthier than worst check status "${worstCheckStatus}"`);
    }
  }
}

function validateJourneyFields(
  payload: Record<string, unknown>,
  errors: string[],
  warnings: string[],
  options?: MonitoringValidationOptions
) {
  if (!isObject(payload.journey)) {
    errors.push("journey must be an object");
    return;
  }

  if (!isNonEmptyString(payload.journey.name)) {
    errors.push("journey.name must be a non-empty string");
  }

  if (!isNonEmptyString(payload.journey.status) || !VALID_STATUSES.has(payload.journey.status as MonitoringStatus)) {
    errors.push("journey.status must be one of healthy|degraded|unhealthy|unknown");
  }

  if (payload.journey.durationMs !== undefined && (!isNumber(payload.journey.durationMs) || payload.journey.durationMs < 0)) {
    errors.push("journey.durationMs must be a non-negative number when present");
  }

  if (payload.journey.sideEffects !== undefined) {
    const validSideEffects = new Set(["none", "low", "unknown"]);
    if (!isNonEmptyString(payload.journey.sideEffects) || !validSideEffects.has(payload.journey.sideEffects)) {
      errors.push("journey.sideEffects must be one of none|low|unknown when present");
    }
  }

  if (options?.probeMode === true) {
    if (payload.journey.probeModeSupported !== true) {
      errors.push("journey.probeModeSupported must be true when probe mode validation is enabled");
    }
    if (payload.journey.sideEffects === "low") {
      warnings.push("journey.sideEffects is low in probe mode; consider sideEffects=none");
    }
  }
}

function validateRelease(
  payload: Record<string, unknown>,
  errors: string[],
  warnings: string[],
  options?: MonitoringValidationOptions
) {
  if (payload.release === undefined) {
    if (options?.requireRelease) {
      warnings.push("release metadata is missing (recommended for deployment traceability)");
    }
    return;
  }

  if (!isObject(payload.release)) {
    errors.push("release must be an object when present");
    return;
  }

  if (!isNonEmptyString(payload.release.version)) {
    errors.push("release.version must be a non-empty string");
  }

  if (payload.release.commitSha !== undefined && !isNonEmptyString(payload.release.commitSha)) {
    errors.push("release.commitSha must be a non-empty string when present");
  }

  if (payload.release.deployedAt !== undefined) {
    if (!isNonEmptyString(payload.release.deployedAt) || !isIsoTimestamp(payload.release.deployedAt)) {
      errors.push("release.deployedAt must be an ISO-8601 date-time string when present");
    }
  } else {
    warnings.push("release.deployedAt is missing; release timing will be less traceable");
  }
}

function isObject(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isIsoTimestamp(value: string): boolean {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return false;
  return /\d{4}-\d{2}-\d{2}T/.test(value);
}
