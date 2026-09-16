import rulesConfig from "./rules.json";
import { PolicyDecision, RecommendedAction } from "../schema";

interface PolicyRule {
  id: string;
  match: { environment?: string; action_type?: string };
  decision: { action_allowed: boolean; requires_approval: boolean };
  reason: string;
}

function matchesField(pattern: string | undefined, value: string): boolean {
  if (!pattern) return true;
  if (pattern === "*") return true;
  if (pattern.includes("|")) return pattern.split("|").includes(value);
  if (pattern.startsWith("*") && pattern.endsWith("*")) {
    return value.includes(pattern.slice(1, -1));
  }
  return pattern === value;
}

/**
 * The LLM never decides whether it's allowed to act (section 15). This is a
 * small, explicit, auditable rule table — separate from model safety,
 * separate from human approval, separate from execution.
 */
export class PolicyEngine {
  private rules: PolicyRule[] = rulesConfig.rules as PolicyRule[];
  private defaultDecision = rulesConfig.default_decision;

  evaluate(environment: string, action: RecommendedAction): PolicyDecision {
    for (const rule of this.rules) {
      if (matchesField(rule.match.environment, environment) && matchesField(rule.match.action_type, action.type)) {
        return {
          action_allowed: rule.decision.action_allowed,
          requires_approval: rule.decision.requires_approval,
          reason: rule.reason,
          matched_rule: rule.id,
          evaluated_at: new Date().toISOString(),
        };
      }
    }
    return {
      ...this.defaultDecision,
      matched_rule: "default",
      evaluated_at: new Date().toISOString(),
    };
  }
}
