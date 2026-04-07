import test from "node:test";
import assert from "node:assert/strict";

import { getStatusForUnexpectedHttpStatus } from "@/lib/health-checker";

test("treats 5xx responses as down", () => {
  assert.equal(getStatusForUnexpectedHttpStatus(500), "down");
  assert.equal(getStatusForUnexpectedHttpStatus(503), "down");
});

test("treats 4xx responses as degraded", () => {
  assert.equal(getStatusForUnexpectedHttpStatus(400), "degraded");
  assert.equal(getStatusForUnexpectedHttpStatus(429), "degraded");
});
