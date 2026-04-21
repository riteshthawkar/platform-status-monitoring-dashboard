import { ProbeTier, ServiceConfig } from "@/types";

export interface ProbePolicyConfig {
  enforceTokenBudget: boolean;
  forceTokenProbes: boolean;
  dailyTokenBudget: number;
  perServiceDailyTokenBudget: number;
  emergencyTokenReserve: number;
  generationHealthyIntervalSeconds: number;
  syntheticHealthyIntervalSeconds: number;
  incidentTokenIntervalSeconds: number;
  postDeployWindowMinutes: number;
  postDeployTokenIntervalSeconds: number;
}

export interface ProbeIntervalContext {
  hasActiveIncident: boolean;
  hasRecentDeployment: boolean;
  isCriticalService: boolean;
}

export interface ProbeBudgetUsage {
  totalEstimatedTokens: number;
  serviceEstimatedTokens: number;
}

export interface ProbeBudgetDecision {
  allowed: boolean;
  reason: string | null;
  projectedTotalTokens: number;
  projectedServiceTokens: number;
  usedEmergencyReserve: boolean;
}

const DEFAULT_POLICY: ProbePolicyConfig = {
  enforceTokenBudget: true,
  forceTokenProbes: false,
  dailyTokenBudget: 200_000,
  perServiceDailyTokenBudget: 60_000,
  emergencyTokenReserve: 40_000,
  generationHealthyIntervalSeconds: 900, // 15 min
  syntheticHealthyIntervalSeconds: 1800, // 30 min
  incidentTokenIntervalSeconds: 120, // 2 min
  postDeployWindowMinutes: 20,
  postDeployTokenIntervalSeconds: 300, // 5 min
};

function parseIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBoolEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (!raw) return fallback;
  if (raw === "1" || raw.toLowerCase() === "true") return true;
  if (raw === "0" || raw.toLowerCase() === "false") return false;
  return fallback;
}

export function getProbePolicyConfig(): ProbePolicyConfig {
  return {
    enforceTokenBudget: parseBoolEnv("MONITOR_TOKEN_BUDGET_ENFORCED", DEFAULT_POLICY.enforceTokenBudget),
    forceTokenProbes: parseBoolEnv("MONITOR_FORCE_TOKEN_PROBES", DEFAULT_POLICY.forceTokenProbes),
    dailyTokenBudget: parseIntEnv("MONITOR_TOKEN_BUDGET_DAILY", DEFAULT_POLICY.dailyTokenBudget),
    perServiceDailyTokenBudget: parseIntEnv(
      "MONITOR_TOKEN_BUDGET_PER_SERVICE_DAILY",
      DEFAULT_POLICY.perServiceDailyTokenBudget
    ),
    emergencyTokenReserve: parseIntEnv("MONITOR_TOKEN_BUDGET_EMERGENCY_DAILY", DEFAULT_POLICY.emergencyTokenReserve),
    generationHealthyIntervalSeconds: parseIntEnv(
      "MONITOR_TOKEN_PROBE_GENERATION_INTERVAL_SECONDS",
      DEFAULT_POLICY.generationHealthyIntervalSeconds
    ),
    syntheticHealthyIntervalSeconds: parseIntEnv(
      "MONITOR_TOKEN_PROBE_SYNTHETIC_INTERVAL_SECONDS",
      DEFAULT_POLICY.syntheticHealthyIntervalSeconds
    ),
    incidentTokenIntervalSeconds: parseIntEnv(
      "MONITOR_TOKEN_PROBE_INCIDENT_INTERVAL_SECONDS",
      DEFAULT_POLICY.incidentTokenIntervalSeconds
    ),
    postDeployWindowMinutes: parseIntEnv(
      "MONITOR_TOKEN_PROBE_DEPLOYMENT_WINDOW_MINUTES",
      DEFAULT_POLICY.postDeployWindowMinutes
    ),
    postDeployTokenIntervalSeconds: parseIntEnv(
      "MONITOR_TOKEN_PROBE_DEPLOYMENT_INTERVAL_SECONDS",
      DEFAULT_POLICY.postDeployTokenIntervalSeconds
    ),
  };
}

function hasTag(service: ServiceConfig, tag: string): boolean {
  return !!service.tags?.some((candidate) => candidate.toLowerCase() === tag.toLowerCase());
}

export function getProbeTier(service: ServiceConfig): ProbeTier {
  if (service.probeTier) return service.probeTier;

  const url = service.url.toLowerCase();
  const id = service.id.toLowerCase();

  if (hasTag(service, "synthetic") || id.includes("telegram-chat") || url.includes("/telegram-chat")) {
    return "llm_synthetic";
  }

  if (id.includes("generation-health") || url.includes("/health/generation")) {
    return "llm_generation";
  }

  if (hasTag(service, "llm")) {
    return "llm_preflight";
  }

  return "core";
}

export function isTokenMeteredProbe(service: ServiceConfig): boolean {
  const tier = getProbeTier(service);
  return tier === "llm_generation" || tier === "llm_synthetic";
}

export function estimateProbeTokens(service: ServiceConfig): number {
  if (typeof service.tokenCostEstimate === "number" && service.tokenCostEstimate > 0) {
    return Math.max(1, Math.round(service.tokenCostEstimate));
  }

  const tier = getProbeTier(service);
  if (tier === "llm_generation") {
    return 220;
  }

  if (tier === "llm_synthetic") {
    const requestBodyTokens = service.body ? Math.ceil(service.body.length / 4) : 140;
    const minResponseTokens = service.jsonMinLength ? Math.ceil(service.jsonMinLength / 4) : 20;
    const completionTokens = Math.max(minResponseTokens + 120, 180);
    return requestBodyTokens + completionTokens + 32;
  }

  return 0;
}

export function getAdaptiveIntervalSeconds(
  service: ServiceConfig,
  context: ProbeIntervalContext,
  config: ProbePolicyConfig = getProbePolicyConfig()
): number {
  const baseInterval = Math.max(service.checkIntervalSeconds || 120, 30);
  const tier = getProbeTier(service);

  let intervalSeconds = baseInterval;

  if (tier === "llm_generation") {
    intervalSeconds = Math.max(intervalSeconds, config.generationHealthyIntervalSeconds);
  }

  if (tier === "llm_synthetic") {
    intervalSeconds = Math.max(intervalSeconds, config.syntheticHealthyIntervalSeconds);
  }

  if (context.hasRecentDeployment && isTokenMeteredProbe(service)) {
    intervalSeconds = Math.min(intervalSeconds, Math.max(config.postDeployTokenIntervalSeconds, 60));
  }

  if (context.hasActiveIncident && isTokenMeteredProbe(service)) {
    intervalSeconds = Math.min(intervalSeconds, Math.max(config.incidentTokenIntervalSeconds, 60));
  }

  if (context.hasActiveIncident && context.isCriticalService && tier === "core") {
    intervalSeconds = Math.min(intervalSeconds, Math.max(Math.floor(baseInterval / 2), 30));
  }

  return intervalSeconds;
}

export function decideTokenProbeBudget(
  usage: ProbeBudgetUsage,
  service: ServiceConfig,
  estimatedTokens: number,
  hasActiveIncident: boolean,
  config: ProbePolicyConfig = getProbePolicyConfig()
): ProbeBudgetDecision {
  const projectedTotalTokens = usage.totalEstimatedTokens + estimatedTokens;
  const projectedServiceTokens = usage.serviceEstimatedTokens + estimatedTokens;

  if (!isTokenMeteredProbe(service) || estimatedTokens <= 0) {
    return {
      allowed: true,
      reason: null,
      projectedTotalTokens,
      projectedServiceTokens,
      usedEmergencyReserve: false,
    };
  }

  if (!config.enforceTokenBudget || config.forceTokenProbes) {
    return {
      allowed: true,
      reason: null,
      projectedTotalTokens,
      projectedServiceTokens,
      usedEmergencyReserve: false,
    };
  }

  const normalGlobalCap = config.dailyTokenBudget;
  const normalServiceCap = config.perServiceDailyTokenBudget;

  if (!hasActiveIncident) {
    if (projectedServiceTokens > normalServiceCap) {
      return {
        allowed: false,
        reason: `Per-service token budget reached (${normalServiceCap}/day)`,
        projectedTotalTokens,
        projectedServiceTokens,
        usedEmergencyReserve: false,
      };
    }

    if (projectedTotalTokens > normalGlobalCap) {
      return {
        allowed: false,
        reason: `Global token budget reached (${normalGlobalCap}/day)`,
        projectedTotalTokens,
        projectedServiceTokens,
        usedEmergencyReserve: false,
      };
    }

    return {
      allowed: true,
      reason: null,
      projectedTotalTokens,
      projectedServiceTokens,
      usedEmergencyReserve: false,
    };
  }

  const emergencyGlobalCap = normalGlobalCap + config.emergencyTokenReserve;
  const emergencyServiceCap = normalServiceCap + Math.max(Math.floor(config.emergencyTokenReserve / 2), estimatedTokens);

  if (projectedServiceTokens > emergencyServiceCap) {
    return {
      allowed: false,
      reason: `Incident probe cap reached for service (${emergencyServiceCap}/day incl. emergency reserve)`,
      projectedTotalTokens,
      projectedServiceTokens,
      usedEmergencyReserve: projectedServiceTokens > normalServiceCap,
    };
  }

  if (projectedTotalTokens > emergencyGlobalCap) {
    return {
      allowed: false,
      reason: `Incident probe cap reached globally (${emergencyGlobalCap}/day incl. emergency reserve)`,
      projectedTotalTokens,
      projectedServiceTokens,
      usedEmergencyReserve: projectedTotalTokens > normalGlobalCap,
    };
  }

  return {
    allowed: true,
    reason: null,
    projectedTotalTokens,
    projectedServiceTokens,
    usedEmergencyReserve: projectedServiceTokens > normalServiceCap || projectedTotalTokens > normalGlobalCap,
  };
}

