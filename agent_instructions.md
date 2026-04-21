# Agent Instructions: Monitoring Contract Implementation

Use this file when a coding agent is tasked with implementing the monitoring
framework in any service repository (API, web app, worker, LLM app, RAG app,
or multi-service platform).

Scope:
- implement health endpoints
- implement probe-safe behavior
- implement deployment metadata visibility
- implement conformance checks in CI

Out of scope:
- `.env` value setup
- secret management policy
- infrastructure provisioning

Canonical references in this repository:
- `monitoring-contract/monitoring-contract-v1.md`
- `monitoring-contract/schemas/*.json`
- `src/lib/monitoring-contract.ts`
- `src/scripts/monitoring-conformance.ts`
- `monitoring-contract/templates/github-actions-monitoring-conformance.yml`

## 1. Determine Service Profile

Classify target service as one of:
- `generic`
- `llm`
- `rag`
- `agent-platform`

Required endpoints by profile:
- `generic`: `/health/live`, `/health/ready`, `/health/detailed`
- `llm`: generic + `/health/journey`
- `rag`: generic + `/health/journey`
- `agent-platform`: generic + `/health/journey`

## 2. Add Contract-Compliant Endpoints

Implement endpoints as `GET` routes.

Required response fields for all endpoints:
- `version` = `"monitoring-contract/v1"`
- `service.id`
- `service.name`
- `status` (`healthy|degraded|unhealthy|unknown`)
- `timestamp` (ISO datetime)

Recommended fields:
- `summary`
- `service.type`
- `service.environment`
- `release.version`
- `release.commitSha`
- `release.deployedAt`

Endpoint intent:
- `/health/live`: process alive check only (cheap, fast)
- `/health/ready`: whether service should receive traffic now
- `/health/detailed`: dependency/component breakdown in `checks`
- `/health/journey`: critical business/user path validation

## 3. Implement `checks` for `/health/detailed`

`/health/detailed` must include:
- `checks` object
- at least one check entry

Each check entry should include:
- `status` (required)
- optional `latencyMs`, `message`, `error`, `details`

Example check keys by service type:
- generic: `database`, `cache`, `queue`, `upstream_api`
- llm/rag: `openai`, `embedding`, `vector_store`, `retrieval`, `generation`
- agent-platform: `core_backend`, `indexing_backend`, `database`, `llm`

## 4. Implement Probe Mode (Mandatory)

Honor request header:
- `x-health-probe: true`

When probe mode is true:
- do not persist user artifacts
- do not emit analytics events
- do not create notifications
- return explicit failure status for fatal path errors

If normal user routes intentionally mask errors for UX, probe mode must still
surface failure clearly (HTTP `503` + `status=unhealthy` or `degraded`).

## 5. HTTP Status Rules

Use these semantics:
- `200`: endpoint executed and service state evaluated
- `503`: evaluated but not ready/critical path failed
- `500`: endpoint itself failed to evaluate checks

Do not return `200` with fake success for fatal critical-path failures.

## 6. LLM/RAG-Specific Rules

Never hard-code model aliases in request handlers.

Model and provider configuration must be externally configurable and
discoverable via health output.

`/health/journey` for LLM/RAG should validate:
- model availability
- provider auth failure detection
- retrieval and reranking dependencies (for RAG)
- final generation path

## 7. Deployment Metadata Exposure

Expose deployment metadata in health responses (prefer `/health/detailed`):
- `release.version`
- `release.commitSha`
- `release.deployedAt`

If easy in stack, also expose:
- `release.deployedBy`
- `release.notes`

Goal: dashboard can correlate incidents with releases without repo scraping.

## 8. Add Conformance Runner

Add a script command in target repo equivalent to:
- `monitoring:conformance`

Use the runner pattern from:
- `src/scripts/monitoring-conformance.ts`

Conformance must validate:
- required endpoints exist
- payload fields are contract-valid
- status taxonomy is valid
- `checks` exists for `/health/detailed`
- `journey` exists for journey-required profiles
- HTTP/status consistency on critical endpoints
- timestamp freshness and latency budgets where configured

## 9. Add CI Gate

Add workflow based on:
- `monitoring-contract/templates/github-actions-monitoring-conformance.yml`

CI must run on pull requests and fail on contract violations.

Set base URL and profile via CI variables/secrets in the target repo.

## 10. Logging Requirements

Add structured logs around health evaluations:
- `timestamp`
- `level`
- `endpoint`
- `request_id` (if available)
- dependency failure reason
- probe mode marker when header present

This is required for debuggability when checks fail intermittently.

## 11. Test Requirements

Add at least these tests in target repo:
- valid contract payload test for each implemented endpoint
- invalid/missing field rejection test for conformance helper
- probe-mode side-effect suppression test
- journey failure returns non-success status test

## 12. Migration Strategy for Existing Services

If service already has legacy health endpoints:
1. keep existing endpoints temporarily
2. add contract endpoints in parallel
3. migrate monitor/dashboard to contract endpoints
4. enable CI conformance as required check
5. retire legacy checks only after stable rollout

## 13. Acceptance Criteria (Done Definition)

Implementation is complete only if all are true:
- profile classification documented
- required endpoints implemented and deployed
- payloads validate against contract
- probe mode works and is side-effect free
- fatal journey failures are monitor-visible
- conformance runner added
- CI conformance check added
- deployment metadata exposed
- tests cover contract + probe + failure semantics

## 14. Agent Output Template

When agent submits work, include:
- profile chosen
- endpoints added/updated
- exact files changed
- probe behavior summary
- conformance command used
- CI workflow file added/updated
- test results summary
- known limitations or follow-ups

Keep output concise, verifiable, and file-referenced.
