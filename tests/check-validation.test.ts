import test from "node:test";
import assert from "node:assert/strict";

import type { ServiceConfig } from "../src/types";
import { validateJsonResponse } from "../src/lib/check-validation";

function buildService(overrides: Partial<ServiceConfig> = {}): ServiceConfig {
  return {
    id: "synthetic-chat",
    name: "Synthetic Chat Probe",
    description: "Synthetic generation health check",
    category: "chatbot_backend",
    group: "test",
    url: "https://example.com/telegram-chat",
    checkType: "json_query",
    checkIntervalSeconds: 300,
    timeoutMs: 45000,
    expectedStatusCode: 200,
    jsonPath: "response",
    method: "POST",
    enabled: true,
    ...overrides,
  };
}

test("validateJsonResponse accepts long synthetic response payloads", () => {
  const service = buildService({
    jsonMinLength: 40,
    jsonFailureKeywords: ["response generation failed"],
  });

  const result = validateJsonResponse(service, {
    response:
      "MBZUAI offers several graduate programs in artificial intelligence and related research areas.",
  });

  assert.equal(result.status, "operational");
  assert.equal(result.errorMessage, null);
});

test("validateJsonResponse rejects known generation failure phrases", () => {
  const service = buildService({
    jsonFailureKeywords: ["response generation failed", "please try again later"],
  });

  const result = validateJsonResponse(service, {
    response: "Response generation failed. Please try again later.",
  });

  assert.equal(result.status, "degraded");
  assert.match(result.errorMessage ?? "", /failure keyword/i);
});

test("validateJsonResponse rejects short responses for synthetic probes", () => {
  const service = buildService({
    jsonMinLength: 20,
  });

  const result = validateJsonResponse(service, {
    response: "Too short",
  });

  assert.equal(result.status, "degraded");
  assert.match(result.errorMessage ?? "", /shorter than 20/i);
});

test("validateJsonResponse preserves exact-match checks for existing health endpoints", () => {
  const service = buildService({
    method: "GET",
    url: "https://example.com/health",
    jsonPath: "status",
    jsonExpectedValue: "healthy",
  });

  const result = validateJsonResponse(service, {
    status: "healthy",
  });

  assert.equal(result.status, "operational");
  assert.equal(result.errorMessage, null);
});
