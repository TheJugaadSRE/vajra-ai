import { ApprovalRecord } from "../schema";

export class InvalidApprovalTransitionError extends Error {}

export function requestApproval(): ApprovalRecord {
  return { status: "PENDING", requested_at: new Date().toISOString(), decided_at: null, decided_by: null, comment: null };
}

/**
 * The approval record is a small, explicit state machine — PENDING is the
 * only state that can transition, and only once. This mirrors the AWS design
 * 1:1 (a Step Functions `waitForTaskToken` that resolves exactly once) so the
 * local demo and the deployed architecture behave identically.
 */
export function decideApproval(current: ApprovalRecord, decision: "APPROVED" | "REJECTED", decidedBy: string, comment?: string): ApprovalRecord {
  if (current.status !== "PENDING") {
    throw new InvalidApprovalTransitionError(`Approval already decided: ${current.status}`);
  }
  return {
    ...current,
    status: decision,
    decided_at: new Date().toISOString(),
    decided_by: decidedBy,
    comment: comment ?? null,
  };
}
