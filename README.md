# VAJRA AI
### Virtual Autonomous Journey for Reliability & Availability

VAJRA AI is an AI-native incident control plane for production operations: it connects observability, organizational knowledge, reasoning, policy, and operational actions into one closed-loop reliability workflow.

> **Origin:** this project started as a prototype for the AI for Bharat Hackathon (shortlisted to round 2). This repository is a from-scratch rebuild of that prototype into a real, runnable Phase 1 MVP — see [docs/architecture.md](docs/architecture.md) for what's implemented vs. what's roadmap.

VAJRA does **not** try to replace Dynatrace, Datadog, Grafana, Kubernetes, AWS, Jenkins, ArgoCD, ServiceNow, or Jira. It sits above them:

```
DETECT -> CORRELATE -> COLLECT CONTEXT -> DIAGNOSE -> RECOMMEND -> POLICY CHECK
   -> HUMAN APPROVAL OR AUTOMATION -> EXECUTE -> VERIFY -> STORE INCIDENT MEMORY
```

## What's actually built (Phase 1 MVP)

A complete, locally runnable, end-to-end incident journey for a production `checkout-service` scenario:

1. An alert (or five correlated alerts) comes in.
2. Deterministic correlation groups them into one incident — not one investigation per alert.
3. A Diagnosis Agent runs a real tool-use loop (mock reasoner by default; a real Amazon Bedrock Converse API loop if you configure AWS credentials) against mock observability/deployment providers, producing a structured diagnosis with cited evidence, contradicting evidence, and honestly-labeled confidence.
4. A Policy Engine — not the model — decides whether the recommended action is auto-allowed or needs human approval.
5. If approval is required, the Incident Detail page shows an Approve/Reject panel.
6. On approval, an Execution layer re-validates the action and dispatches it (simulated ArgoCD rollback).
7. A Verification Agent re-checks metrics before declaring the incident resolved.
8. The incident is persisted and searchable for similarity against future incidents.

AWS infrastructure-as-code for the same pipeline (API Gateway, EventBridge, SQS, Step Functions, DynamoDB, Bedrock IAM, Cognito, CloudWatch alarms) is written in `infra/cdk` and `cdk synth`-verified, but **not deployed** — see [docs/architecture.md](docs/architecture.md) for the known gaps in that path (mock providers don't share state across Lambda invocations; no auth wired up yet).

What's *not* built yet — real Dynatrace/Slack/ServiceNow integrations, digital twin simulation, predictive ML, RBAC/multi-tenant — is listed explicitly in [docs/architecture.md](docs/architecture.md) rather than silently missing.

## Repository layout

```
packages/core/        pipeline domain logic (schema, agents, policy, providers, reasoning) — no transport dependency
services/api-local/   Express server for local dev
infra/cdk/             AWS CDK app (written, not deployed)
apps/web/              React UI
data/                  service catalog, runbooks, demo scenario
```

## Running locally

Requires Node.js 20+.

```bash
npm install
npm run dev
```

This starts, concurrently:
- `packages/core` in TypeScript watch mode
- the API on `http://localhost:4000`
- the React app on `http://localhost:3000`

Open `http://localhost:3000`, click **Run Demo Scenario**, and watch the incident move through the pipeline. When it reaches `AWAITING_APPROVAL`, click **Approve rollback** and watch it resolve.

By default everything runs against mock providers and a mock reasoner — no AWS account or credentials needed. To use a real Amazon Bedrock model for diagnosis instead:

```bash
# services/api-local/.env — copy from .env.example
VAJRA_BEDROCK_MODE=aws
VAJRA_BEDROCK_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0
AWS_REGION=us-east-1
```

(and make sure your environment has AWS credentials with `bedrock:InvokeModel` on that model).

## Tests

```bash
npm test
```

Runs `packages/core`'s unit tests (correlation, policy, mock-reasoner diagnosis) and `services/api-local`'s end-to-end test, which drives the full demo scenario through HTTP and asserts the incident reaches `RESOLVED`.

## AWS deployment (infra/cdk)

This is written and `cdk synth`-verified but has **not been deployed**. To deploy it yourself:

```bash
cd infra/cdk
npm run build -w ../../packages/core   # core must be built first — Lambda bundling imports its dist output
export VAJRA_BEDROCK_MODEL_ARN=arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-5-sonnet-20241022-v2:0
npx cdk bootstrap   # first time only, per account/region
npx cdk deploy --all
```

Review [docs/architecture.md](docs/architecture.md)'s "Known, deliberate gap" section before treating this as production-ready — it isn't yet (no auth on the API, mock providers instead of real integrations).

## Technology stack

- **Frontend:** React, Material UI
- **Backend:** Node.js/TypeScript (Express locally; the same code runs as AWS Lambda handlers)
- **AI layer:** Amazon Bedrock (Claude), via a swappable `Reasoner` interface
- **Infrastructure (designed, not deployed):** API Gateway, EventBridge, SQS, Step Functions, DynamoDB, S3, Cognito, CloudWatch, IAM, Secrets Manager, CDK

## Author

Shobhit Verma
Technology Leader | Builder of VAJRA AI

## License

© Shobhit Verma (TheJugaadSRE)
