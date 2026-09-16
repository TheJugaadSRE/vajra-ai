# VAJRA AI — Architecture (Phase 1 MVP)

VAJRA AI is an AI-native incident control plane, not a chatbot wrapped around an alert. It sits above existing observability/ITSM/infra tooling and runs a closed loop:

```
DETECT -> CORRELATE -> COLLECT CONTEXT -> DIAGNOSE -> RECOMMEND -> POLICY CHECK
   -> HUMAN APPROVAL OR AUTOMATION -> EXECUTE -> VERIFY -> STORE INCIDENT MEMORY
```

This document describes what's actually implemented today (Phase 1) and what's deliberately deferred.

## Repository layout

```
packages/core/        pure TypeScript domain logic (schema, agents, policy, providers, reasoning)
services/api-local/   Express server for local dev — thin transport around packages/core
infra/cdk/            AWS CDK app: the same pipeline expressed as Lambda + Step Functions (written, not deployed)
apps/web/             React UI (dashboard + incident detail)
data/                 service catalog, runbooks, and the checkout-service demo scenario
```

`packages/core` has no Express or CDK dependency — it's imported by both the local server and the Lambda handlers, so there is exactly one implementation of the pipeline, not two that can drift.

## Component responsibilities

| Component | File(s) | Responsibility |
|---|---|---|
| Ingestion/normalization | `packages/core/src/ingestion/normalize.ts` | External alert shape -> internal `Event` schema |
| Correlation Engine | `packages/core/src/correlation/engine.ts` | Deterministic time-window + service-key matching. AI is *not* used here — see "why" below |
| Incident Manager | `packages/core/src/incidents/manager.ts` | Dedupe/correlate events into incidents, own the timeline |
| Detection Agent | `packages/core/src/agents/detectionAgent.ts` | Thin wrapper around correlation — deliberately deterministic |
| Diagnosis Agent | `packages/core/src/agents/diagnosisAgent.ts` + `reasoning/` | Drives a tool-use loop (mock or real Bedrock) to produce a structured, schema-validated `DiagnosisResult` |
| Tools | `packages/core/src/tools/registry.ts` | `get_metrics`, `query_logs`, `get_recent_deployments`, `get_service_dependencies`, `get_runbook`, `get_similar_incidents`, `get_service_owner`, `get_oncall` — real calls against providers, never fabricated |
| Policy Engine | `packages/core/src/policy/engine.ts` + `rules.json` | The only thing that decides whether an action is allowed / needs approval. The model never decides this |
| Mitigation Agent | `packages/core/src/agents/mitigationAgent.ts` | Bridges Diagnosis's recommendation to the Policy Engine's decision |
| Approval workflow | `packages/core/src/workflow/approval.ts` | Small explicit state machine: PENDING -> APPROVED/REJECTED, exactly once |
| Execution / Tool Gateway | `packages/core/src/execution/` | Re-validates target/policy/approval before dispatching to a `DeploymentProvider` — never trusts the model's action blindly |
| Verification Agent | `packages/core/src/agents/verificationAgent.ts` | Compares before/after metrics; never assumes a remediation worked just because it ran |
| Incident memory | `packages/core/src/memory/` | `JsonFileIncidentStore` (local) / `DynamoIncidentStore` (AWS) — same interface, naive tag-overlap similarity search |
| Orchestrator | `packages/core/src/orchestrator.ts` | The one place that wires the whole pipeline together for local dev |

## Why deterministic correlation, not AI, for detection

Spinning up an AI investigation per alert doesn't scale and isn't necessary: 50 alerts from one bad deploy are the same incident, and "same service, same environment, still open, within 15 minutes" catches that without any model call. AI is reserved for the step that actually needs judgment: diagnosis.

## The Reasoner interface

`packages/core/src/reasoning/types.ts` defines one interface with two implementations:

- **MockReasoner** — runs the *same real tools* against the (mock) providers in a fixed order, then applies a small heuristic to turn the gathered evidence into a hypothesis. Every fact it cites came from an actual tool call. This is what runs by default (`VAJRA_BEDROCK_MODE=mock`), so the full pipeline works with zero AWS credentials.
- **BedrockReasoner** — a real Amazon Bedrock Converse API tool-use loop (`VAJRA_BEDROCK_MODE=aws`). The model calls the same tools, and its final answer must be submitted through a `submit_diagnosis` tool whose input is validated against the `DiagnosisResult` zod schema before anything downstream trusts it.

## Structured diagnosis, not prose

`DiagnosisResult` explicitly separates:
- `model_confidence` (the model's self-report — not a calibrated probability)
- `evidence_coverage` (how much evidence was actually gathered)
- `supporting_evidence` / `contradicting_evidence` / `missing_evidence`
- `recommended_action` + `risk` + `human_approval_required`

The UI (Incident Detail page) renders these as distinct labeled sections rather than a single paragraph.

## Policy, approval, execution — three separate concerns

1. **Policy** (`policy/rules.json`) is a static, auditable rule table: environment × action type -> allowed / requires approval / blocked. Production rollbacks always require approval; destructive actions (anything matching `*delete*`) are always blocked; non-prod actions auto-approve.
2. **Approval** is a real state machine, not a boolean flag — modeled locally as an `ApprovalRecord` and in AWS as a Step Functions `waitForTaskToken` state that can stay parked for up to 24 hours.
3. **Execution** independently re-validates the action's target service/environment against the incident, re-checks the policy decision, and re-checks that approval was actually granted, before calling into a `DeploymentProvider`. It does not trust the diagnosis blindly.

## AWS architecture (infra/cdk — written, not deployed in this session)

```
API Gateway -> ingestLambda -> EventBridge (vajra-incidents) -> SQS (+DLQ) -> orchestrateLambda (Detection+Diagnosis)
   -> Step Functions:
        Choice(policy) -> [blocked -> Escalate]
                        -> [requires approval -> WaitForApproval (waitForTaskToken)] -> Execute -> Verify -> StoreMemory
                        -> [auto-allowed -> Execute -> Verify -> StoreMemory]
   -> DynamoDB (single table, PK=incident_id)
```

Also provisioned: S3 (knowledge/eval assets), Secrets Manager placeholders (Dynatrace/Jira keys, unused until Phase 2), an SNS topic for approval notifications, CloudWatch alarms on Lambda errors and state-machine failures, and a Cognito User Pool.

**Known, deliberate gap:** the AWS Lambda handlers still use the same in-memory `MockObservabilityProvider`/`MockDeploymentProvider` as local dev. Its "degraded/recovered" health state lives in a single process's memory, so it does not survive across separate Lambda invocations — a real deployment replaces these with `DynatraceObservabilityProvider`/`ArgoCDDeploymentProvider` (Phase 2), which don't have this limitation. This is called out rather than silently papered over.

**Also not wired up yet:** the Cognito User Pool exists in the stack but no API route requires authentication. The local demo API has no auth at all. Do not expose either as-is to an untrusted network.

## Provider adapters

Every external system is behind an interface with a `Mock*` implementation today and `NotImplemented` stub classes for Phase 2:

```
ObservabilityProvider  -> MockObservabilityProvider | DynatraceObservabilityProvider | CloudWatchObservabilityProvider
DeploymentProvider     -> MockDeploymentProvider     | ArgoCDDeploymentProvider | JenkinsDeploymentProvider | KubernetesDeploymentProvider
TicketingProvider      -> MockTicketingProvider       | JiraTicketingProvider | ServiceNowTicketingProvider
```

Implementing Phase 2 for any one of these means writing one class, not touching agents/policy/execution/UI.

## What's explicitly NOT built (roadmap, not silently missing)

- Real Dynatrace/CloudWatch/Jira/ServiceNow/Slack/Teams/Kubernetes/ArgoCD integrations (Phase 2)
- Vector-based knowledge retrieval / Bedrock Knowledge Bases (Phase 2) — today's knowledge base is local JSON/Markdown with keyword lookup
- Digital Twin simulation, Predictive Failure forecasting, Security/Bot behavioral ML — the dashboard's "Roadmap Preview" panel shows what these *would* look like with clearly synthetic, static data; they are not live models
- RBAC, multi-tenant isolation, real authentication (Phase 3)
- Evaluation framework against a historical incident corpus (Phase 3)
- AgentCore Gateway/MCP tool connectivity (Phase 3) — the current tool layer is a plain in-process registry, which is the right scope for one process talking to mock providers
