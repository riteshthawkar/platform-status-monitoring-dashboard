import test from "node:test";
import assert from "node:assert/strict";

import {
  MONITORING_CONTRACT_VERSION,
  getRequiredEndpointsForProfile,
  validateMonitoringHttpConsistency,
  validateMonitoringPayload,
} from "../src/lib/monitoring-contract";

function buildBasePayload() {
  return {
    version: MONITORING_CONTRACT_VERSION,
    service: {
      id: "sample-service",
      name: "Sample Service",
      type: "generic",
      environment: "production",
    },
    status: "healthy",
    timestamp: "2026-04-19T10:30:00Z",
  };
}

test("validateMonitoringPayload accepts valid /health/live payload", () => {
  const payload = buildBasePayload();
  const result = validateMonitoringPayload("/health/live", payload);
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
});

test("validateMonitoringPayload rejects /health/detailed without checks", () => {
  const payload = buildBasePayload();
  const result = validateMonitoringPayload("/health/detailed", payload);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /checks must be an object/i);
});

test("validateMonitoringPayload rejects /health/journey without journey object", () => {
  const payload = buildBasePayload();
  const result = validateMonitoringPayload("/health/journey", payload);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /journey must be an object/i);
});

test("validateMonitoringPayload rejects invalid status", () => {
  const payload = {
    ...buildBasePayload(),
    status: "green",
  };
  const result = validateMonitoringPayload("/health/live", payload);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /status must be one of/i);
});

test("getRequiredEndpointsForProfile includes journey for rag profile", () => {
  const endpoints = getRequiredEndpointsForProfile("rag");
  assert.ok(endpoints.includes("/health/journey"));
  assert.deepEqual(endpoints.slice(0, 3), ["/health/live", "/health/ready", "/health/detailed"]);
});

test("validateMonitoringPayload enforces probeModeSupported for journey in probe mode", () => {
  const payload = {
    ...buildBasePayload(),
    journey: {
      name: "LLM response",
      status: "healthy",
      probeModeSupported: false,
    },
  };
  const result = validateMonitoringPayload("/health/journey", payload, { probeMode: true });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /probeModeSupported/i);
});

test("validateMonitoringPayload validates release fields when present", () => {
  const payload = {
    ...buildBasePayload(),
    release: {
      version: "v1.2.0",
      commitSha: "",
    },
  };
  const result = validateMonitoringPayload("/health/live", payload);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /release\.commitSha/i);
});

test("validateMonitoringHttpConsistency rejects unhealthy+200 for ready endpoint", () => {
  const result = validateMonitoringHttpConsistency("/health/ready", 200, "unhealthy");
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /expected 503/i);
});

test("validateMonitoringHttpConsistency warns on 503 with healthy payload", () => {
  const result = validateMonitoringHttpConsistency("/health/detailed", 503, "healthy");
  assert.equal(result.ok, true);
  assert.match(result.warnings.join(" "), /inconsistent health signaling/i);
});
