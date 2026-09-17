import { DiagnosisResult, PolicyDecision } from "../schema";
import { PolicyEngine } from "../policy/engine";

/**
 * The Mitigation Agent never decides for itself whether it's allowed to act —
 * that's the Policy Engine's job (section 15). This class is a thin, testable
 * seam between "here's what Diagnosis recommends" and "here's what policy
 * says about it".
 */
export class MitigationAgent {
  constructor(private policyEngine: PolicyEngine) {}

  evaluate(environment: string, diagnosis: DiagnosisResult): PolicyDecision {
    return this.policyEngine.evaluate(environment, diagnosis.recommended_action);
  }
}
