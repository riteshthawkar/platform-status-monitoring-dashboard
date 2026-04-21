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
  payload: unknown
): MonitoringValidationResult {
  const errors: string[] = [];

  if (!isObject(payload)) {
    return { ok: false, errors: ["Response body must be a JSON object"] };
  }

  validateCommonFields(payload, errors);

  if (endpoint === "/health/detailed") {
    validateDetailedFields(payload, errors);
  }

  if (endpoint === "/health/journey") {
    validateJourneyFields(payload, errors);
  }

  return { ok: errors.length === 0, errors };
}

function validateCommonFields(payload: Record<string, unknown>, errors: string[]) {
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
}

function validateDetailedFields(payload: Record<string, unknown>, errors: string[]) {
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
  }
}

function validateJourneyFields(payload: Record<string, unknown>, errors: string[]) {
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
}

function isObject(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isIsoTimestamp(value: string): boolean {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return false;
  return /\d{4}-\d{2}-\d{2}T/.test(value);
}
