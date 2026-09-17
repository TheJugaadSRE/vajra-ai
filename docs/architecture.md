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
| Tools | `packages/core/src/tools/registry.ts` | `get_metrics`, `query_logs`, `get_recent_deployments`, `get_service_dependencies`, `get_runbook`, `get_similar_incidents`, `get_service_owner`, `get_oncall`, `get_traffic_pattern`, `get_threat_intel` — real calls against providers, never fabricated |
| Digital Twin simulation | `packages/core/src/simulation/digitalTwin.ts` | A deterministic heuristic projection of predicted error rate/latency/cost for each candidate action, computed right after diagnosis and shown before approval — explicitly labeled as a heuristic model, not a trained model or a live topology replica |
| Predictive Failure Engine | `packages/core/src/prediction/` | Fits a linear trend to recent metric history per watched metric/service and forecasts a threshold breach — statistical trend extrapolation, not a trained model (see dedicated section below) |
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

**Predictive Failure Engine, separately:** an EventBridge Schedule Rule runs `predict.ts` every 5 minutes; it hydrates `PredictiveEngine` from a dedicated `vajra-predictions` DynamoDB table (kept separate from `vajra-incidents` — the incident store's `Scan`-based `list()`/`findSimilar()` assume every item is an Incident, so mixing Prediction items into the same table would silently corrupt those reads), re-scans, and writes the results back. `GET /predictions` (`listPredictions.ts`) reads that table. Promoting a prediction into an incident (investigate/dismiss) is **not** wired up in AWS yet — that needs the same hydrate-then-persist pattern applied to a request-driven Lambda instead of a scheduled one, which hasn't been built. `predict.ts`'s watch list also comes from a `WATCHED_SERVICES` env var rather than the knowledge service catalog, for the reason below.

**Known, deliberate gap:** the AWS Lambda handlers still use the same in-memory `MockObservabilityProvider`/`MockDeploymentProvider`/`MockSecurityProvider` as local dev. Their mutable state (health, blocked-traffic, etc.) lives in a single process's memory, so it does not survive across separate Lambda invocations — a real deployment replaces these with real providers (Phase 2), which don't have this limitation. This is called out rather than silently papered over.

**Also a known gap:** `KnowledgeStore`'s local JSON/Markdown files under `data/` are not bundled into any Lambda's deployment package — esbuild only bundles the JS/TS reachable from each entry file, not arbitrary asset directories. The S3 "knowledge/eval assets" bucket is provisioned but nothing uploads to it or reads from it yet. Any Lambda that calls `KnowledgeStore.getServiceCatalogEntry()`/`getRunbook()`/`listServiceNames()` (e.g. `orchestrate.ts`) would fail at runtime today; `predict.ts` sidesteps this with an env-var watch list specifically because of this gap.

**Also not wired up yet:** the Cognito User Pool exists in the stack but no API route requires authentication. The local demo API has no auth at all. Do not expose either as-is to an untrusted network.

## Provider adapters

Every external system is behind an interface with a `Mock*` implementation today and `NotImplemented` stub classes for Phase 2:

```
ObservabilityProvider  -> MockObservabilityProvider | DynatraceObservabilityProvider | CloudWatchObservabilityProvider
DeploymentProvider     -> MockDeploymentProvider     | ArgoCDDeploymentProvider | JenkinsDeploymentProvider | KubernetesDeploymentProvider
SecurityProvider       -> MockSecurityProvider        | CloudflareSecurityProvider | AwsWafSecurityProvider
TicketingProvider      -> MockTicketingProvider       | JiraTicketingProvider | ServiceNowTicketingProvider
```

Implementing Phase 2 for any one of these means writing one class, not touching agents/policy/execution/UI.

## The second demo scenario: bot traffic, auto-remediated

`data/scenarios/bot-attack-incident.json` drives a second incident type through the *same* pipeline, chosen specifically to exercise the other branch of the Policy Engine: `block_traffic` is a low-risk, reversible action (`policy/rules.json`'s `block-traffic-auto-allowed` rule), so this incident runs DETECT through RESOLVED with **no human approval step at all** — a useful contrast against the checkout-service rollback scenario, which always requires approval in production. `MockReasoner` branches into a security-specific investigation (`get_traffic_pattern`, `get_threat_intel`) whenever an incident's symptoms match `/bot|ddos|scraping|suspicious traffic|traffic spike/i`; everything else about the pipeline (correlation, structured diagnosis, execution re-validation, verification) is identical to the deployment-regression path.

The dashboard's traffic chart, threat-intel list, and revenue-protection panel are fed by real endpoints (`GET /api/security/traffic`, `GET /api/business-impact`) backed by these mock providers — they are live, not the earlier "synthetic Roadmap Preview" placeholder, though "live" here still means "live against a mock," not a real WAF/Dynatrace/Cloudflare integration.

## The third scenario: catching a failure before it happens

Unlike the other two (both reactive — an alert already fired), the Predictive Failure Engine runs on metric *history*, not a live symptom:

1. `MockObservabilityProvider.getMetricHistory()` returns a synthetic time series — flat/stable for every service/metric except `payment-service`'s `db_connection_pool_available`, which drains roughly linearly (one of `payment-service`'s documented `known_failure_modes`).
2. `packages/core/src/prediction/forecast.ts` fits an ordinary-least-squares line to that history and projects when it would cross a threshold (5 connections remaining). `confidence` is derived only from R² (how well the line fits) — it is not a probability of a real-world outage.
3. `PredictiveEngine.scan()` (`packages/core/src/prediction/predictiveEngine.ts`) runs this per watched metric/service and surfaces a `Prediction` (status `WARNING`) when the forecast breach falls within a 90-minute horizon. `GET /api/predictions` triggers a scan on demand in local dev; the AWS design (below) runs it on a 5-minute schedule instead.
4. Clicking **Investigate now** doesn't create a separate "prediction remediation" path — it synthesizes an alert (`eventType: "PREDICTED_FAILURE"`) and feeds it into the *exact same* `ingestRawAlert` pipeline as a real alert, reusing every downstream piece (diagnosis, policy, approval, execution, verification) unchanged. `MockReasoner` recognizes the `"trending toward"` symptom text and investigates differently from a live incident: it treats the forecast itself as the (hypothesis-kind) supporting evidence, honestly logs currently-healthy metrics as *contradicting* evidence, and recommends a proactive `restart_service` — which still requires approval in production under the same `prod-restart-tier1-requires-approval` policy rule the deployment-rollback scenario uses, no new rule needed.
5. Because nothing was actually broken yet, `VerificationAgent` had to change: it now checks whether post-remediation metrics are within absolute healthy thresholds (`http_5xx_rate <= 5%`, `p99_latency <= 1000ms`) rather than "did they improve by 50%" — a proactive fix correctly reports `RECOVERED` even though before/after metrics are identical (they were already healthy).
6. A `Prediction` that's been promoted stays `INVESTIGATING` (linked to its incident) across rescans rather than being re-flagged as a fresh warning; an engineer can also `DISMISS` one they've judged not worth acting on.

## What's explicitly NOT built (roadmap, not silently missing)

- Real Dynatrace/CloudWatch/Jira/ServiceNow/Slack/Teams/Kubernetes/ArgoCD/Cloudflare/AWS WAF integrations (Phase 2)
- Vector-based knowledge retrieval / Bedrock Knowledge Bases (Phase 2) — today's knowledge base is local JSON/Markdown with keyword lookup
- Real behavioral/ML-based bot detection and any trained-model forecasting — the Digital Twin simulation and Predictive Failure Engine described above are both deterministic heuristics/statistics against mock data, not trained models
- RBAC, multi-tenant isolation, real authentication (Phase 3)
- Evaluation framework against a historical incident corpus (Phase 3)
- AgentCore Gateway/MCP tool connectivity (Phase 3) — the current tool layer is a plain in-process registry, which is the right scope for one process talking to mock providers
- Promoting a prediction into an incident (investigate/dismiss) via the deployed AWS API — only the scheduled forecast + read endpoint are wired up there (see below); local dev has the full read/write flow
