# Runbook: rollback-checkout-v3

**Service:** checkout-service
**Trigger:** HTTP 5xx spike and/or latency increase within 15 minutes of a deployment.

## Steps

1. Confirm the deployment timestamp against the incident start time via `get_recent_deployments`.
2. Confirm no infrastructure-level cause (CPU, memory, DB health) via `get_metrics`.
3. If the deployment is the most likely cause, roll back to the previous stable version via ArgoCD.
4. Verify recovery: error rate back under 1%, p99 latency back under 500ms, for 5 consecutive minutes.
5. If not recovered within 10 minutes, escalate to the Checkout Platform Team on-call and treat rollback as ruled out.

## Known past incidents

- INC-9812: same symptoms, same root cause (connection pool exhaustion after deploy), resolved by rollback in 6 minutes.
