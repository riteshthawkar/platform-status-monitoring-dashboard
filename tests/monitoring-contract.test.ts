import test from "node:test";
import assert from "node:assert/strict";

import {
  MONITORING_CONTRACT_VERSION,
  getRequiredEndpointsForProfile,
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
