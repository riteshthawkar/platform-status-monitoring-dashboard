# Monitoring Contract v1

This document defines a generalized health-reporting framework that all services
can implement, regardless of language or framework.

The dashboard contract is simple:
- services own endpoint implementation and correctness
- dashboard owns polling, parsing, scoring, alerting, and trend reporting

Contract version string:
- `monitoring-contract/v1`

## Required Endpoints

All services must expose:
- `GET /health/live`
- `GET /health/ready`
- `GET /health/detailed`

Conditionally required:
- `GET /health/journey` for any service that has a business-critical runtime
  journey (LLM generation, payment auth, retrieval+generation, workflow runs).
- `GET /health/startup` for slow-starting services where startup readiness is
  materially different from steady-state readiness.

## Status Taxonomy

Allowed status values:
- `healthy`
- `degraded`
- `unhealthy`
- `unknown`

Meaning:
- `healthy`: service/journey is meeting expected behavior.
- `degraded`: serving but with impairment (latency, partial dependency issues).
- `unhealthy`: not serving correctly for intended traffic.
- `unknown`: insufficient signal (cold start, missing data, probe disabled).

## Common Response Shape

All endpoints should return this top-level structure:

```json
{
  "version": "monitoring-contract/v1",
  "service": {
    "id": "lawa-rag",
    "name": "LAWA RAG",
    "type": "rag",
    "environment": "production"
  },
  "status": "healthy",
  "timestamp": "2026-04-19T10:30:00Z",
  "summary": "Ready for production traffic",
  "release": {
    "version": "v1.8.3",
    "commitSha": "7a48fb5",
    "deployedAt": "2026-04-19T09:55:00Z"
  }
}
```

Required top-level fields:
- `version`
- `service.id`
- `service.name`
- `status`
- `timestamp`

Recommended fields:
- `service.type`
- `service.environment`
- `summary`
- `release.*`

## `/health/live`

Purpose:
- process liveness only.

Guidance:
- avoid expensive dependency checks.
- should return quickly and consistently.
- intended for host/container liveness probes.

## `/health/ready`

Purpose:
- whether the service should receive production traffic now.

Guidance:
- can include dependency checks that directly affect serving readiness.
- return `unhealthy` if service should be removed from load balancing.

## `/health/detailed`

Purpose:
- full component-level state for monitoring and incident diagnosis.

Additional required field:
- `checks` (object)

Each check entry:

```json
"database": {
  "status": "healthy",
  "latencyMs": 12,
  "message": "Connection pool healthy"
}
```

Check object fields:
- required: `status`
- optional: `latencyMs`, `message`, `error`, `details`

## `/health/journey`

Purpose:
- validate a real business path, not just infrastructure.

Examples:
- LLM generation pipeline
- authentication exchange
- payment authorization
- retrieval + response composition

Additional required field:
- `journey` (object with at least `name` and `status`)

Recommended `journey` fields:
- `name`
- `status`
- `probeModeSupported` (boolean)
- `sideEffects` (`none`, `low`, `unknown`)
- `durationMs`

## Probe Mode

Synthetic monitoring requests should send:
- `x-health-probe: true`

When probe mode is enabled:
- do not persist user analytics
- do not persist chat history/business events unless explicitly needed
- do not trigger user-facing notifications
- do return explicit failures for fatal path breaks

## HTTP Status Guidance

- `200`: endpoint successfully evaluated contract payload.
- `503`: endpoint evaluated payload and determined not ready / journey failed.
- `500`: endpoint itself failed to run checks.

Important:
- avoid returning `200` with a fake success shape when a critical path is
  actually broken.

## Conformance Rules

A service is contract-conformant when:
1. required endpoints exist for its profile,
2. each endpoint returns valid contract JSON,
3. status values use only contract taxonomy,
4. timestamps are valid ISO timestamps,
5. detailed endpoint has at least one check,
6. journey endpoint is implemented for journey-critical services.

Profiles:
- `generic`: requires live + ready + detailed
- `llm`: requires live + ready + detailed + journey
- `rag`: requires live + ready + detailed + journey
- `agent-platform`: requires live + ready + detailed + journey

## Backwards-Compatible Rollout

Recommended rollout for existing services:
1. add endpoint wrappers with contract payloads,
2. keep old health endpoints temporarily,
3. run conformance in CI as warning,
4. promote conformance to required check,
5. remove legacy endpoint assumptions from monitors.

