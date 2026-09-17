import { PolicyEngine } from "../src/policy/engine";
import { RecommendedAction } from "../src/schema";

const rollbackProd: RecommendedAction = {
  type: "rollback_deployment",
  target: { service: "checkout-service", environment: "production", version: "1.4.82" },
  rationale: "test",
};

const restartQa: RecommendedAction = {
  type: "restart_service",
  target: { service: "checkout-service", environment: "qa" },
  rationale: "test",
};

describe("PolicyEngine", () => {
  const engine = new PolicyEngine();

  it("requires approval for a production rollback", () => {
    const decision = engine.evaluate("production", rollbackProd);
    expect(decision.action_allowed).toBe(true);
    expect(decision.requires_approval).toBe(true);
    expect(decision.matched_rule).toBe("prod-rollback-requires-approval");
  });

  it("auto-approves a qa restart", () => {
    const decision = engine.evaluate("qa", restartQa);
    expect(decision.action_allowed).toBe(true);
    expect(decision.requires_approval).toBe(false);
  });

  it("blocks destructive actions regardless of environment", () => {
    const destructive = { ...rollbackProd, type: "delete_database" } as unknown as RecommendedAction;
    const decision = engine.evaluate("production", destructive);
    expect(decision.action_allowed).toBe(false);
    expect(decision.matched_rule).toBe("block-destructive-actions");
  });
});
