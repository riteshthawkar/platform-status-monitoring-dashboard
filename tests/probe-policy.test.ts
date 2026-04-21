import test from "node:test";
import assert from "node:assert/strict";

import type { ServiceConfig } from "../src/types";
import {
  decideTokenProbeBudget,
  estimateProbeTokens,
  getAdaptiveIntervalSeconds,
  getProbeTier,
  isTokenMeteredProbe,
  type ProbePolicyConfig,
} from "../src/lib/probe-policy";

const TEST_POLICY: ProbePolicyConfig = {
  enforceTokenBudget: true,
  forceTokenProbes: false,
  dailyTokenBudget: 1000,
  perServiceDailyTokenBudget: 400,
  emergencyTokenReserve: 200,
  generationHealthyIntervalSeconds: 900,
  syntheticHealthyIntervalSeconds: 1800,
  incidentTokenIntervalSeconds: 120,
  postDeployWindowMinutes: 20,
  postDeployTokenIntervalSeconds: 300,
};

function service(overrides: Partial<ServiceConfig> = {}): ServiceConfig {
  return {
    id: "svc",
    name: "Service",
    description: "probe",
    category: "chatbot_backend",
    group: "demo",
    url: "https://example.com/health",
    checkType: "json_query",
    checkIntervalSeconds: 60,
    timeoutMs: 15000,
    expectedStatusCode: 200,
    method: "GET",
    enabled: true,
    ...overrides,
  };
}

test("getProbeTier infers synthetic and generation checks", () => {
  assert.equal(
    getProbeTier(service({ id: "a-telegram-chat", url: "https://example.com/telegram-chat" })),
    "llm_synthetic"
  );
  assert.equal(
    getProbeTier(service({ id: "a-generation-health", url: "https://example.com/health/generation" })),
    "llm_generation"
  );
  assert.equal(
    getProbeTier(service({ id: "plain", tags: ["llm"] })),
    "llm_preflight"
  );
  assert.equal(
    getProbeTier(service({ id: "plain-core" })),
    "core"
  );
});

test("estimateProbeTokens uses explicit overrides and defaults", () => {
  assert.equal(estimateProbeTokens(service({ probeTier: "llm_generation", tokenCostEstimate: 333 })), 333);
  assert.equal(estimateProbeTokens(service({ probeTier: "llm_generation" })), 220);
  assert.equal(
    estimateProbeTokens(
      service({
        probeTier: "llm_synthetic",
        method: "POST",
        body: JSON.stringify({ question: "hello world" }),
        jsonMinLength: 40,
      })
    ) > 0,
    true
  );
  assert.equal(isTokenMeteredProbe(service({ probeTier: "core" })), false);
  assert.equal(isTokenMeteredProbe(service({ probeTier: "llm_synthetic" })), true);
});

test("getAdaptiveIntervalSeconds slows healthy token probes and accelerates incidents", () => {
  const synthetic = service({
    id: "synthetic",
    probeTier: "llm_synthetic",
    checkIntervalSeconds: 300,
  });

  const healthy = getAdaptiveIntervalSeconds(
    synthetic,
    { hasActiveIncident: false, hasRecentDeployment: false, isCriticalService: true },
    TEST_POLICY
  );
  assert.equal(healthy, 1800);

  const duringIncident = getAdaptiveIntervalSeconds(
    synthetic,
    { hasActiveIncident: true, hasRecentDeployment: false, isCriticalService: true },
    TEST_POLICY
  );
  assert.equal(duringIncident, 120);

  const justDeployed = getAdaptiveIntervalSeconds(
    synthetic,
    { hasActiveIncident: false, hasRecentDeployment: true, isCriticalService: true },
    TEST_POLICY
  );
  assert.equal(justDeployed, 300);
});

test("decideTokenProbeBudget enforces normal and emergency caps", () => {
  const synthetic = service({
    id: "budget-synthetic",
    probeTier: "llm_synthetic",
    tokenCostEstimate: 150,
  });

  const blockedNormal = decideTokenProbeBudget(
    { totalEstimatedTokens: 980, serviceEstimatedTokens: 300 },
    synthetic,
    150,
    false,
    TEST_POLICY
  );
  assert.equal(blockedNormal.allowed, false);
  assert.match(blockedNormal.reason ?? "", /(global|per-service) token budget/i);

  const allowedEmergency = decideTokenProbeBudget(
    { totalEstimatedTokens: 980, serviceEstimatedTokens: 300 },
    synthetic,
    150,
    true,
    TEST_POLICY
  );
  assert.equal(allowedEmergency.allowed, true);
  assert.equal(allowedEmergency.usedEmergencyReserve, true);

  const blockedEmergency = decideTokenProbeBudget(
    { totalEstimatedTokens: 1_150, serviceEstimatedTokens: 550 },
    synthetic,
    150,
    true,
    TEST_POLICY
  );
  assert.equal(blockedEmergency.allowed, false);
  assert.match(blockedEmergency.reason ?? "", /incident probe cap/i);
});
