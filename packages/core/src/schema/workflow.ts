import { z } from "zod";

export const PolicyDecisionSchema = z.object({
  action_allowed: z.boolean(),
  requires_approval: z.boolean(),
  reason: z.string(),
  matched_rule: z.string(),
  evaluated_at: z.string(),
});
export type PolicyDecision = z.infer<typeof PolicyDecisionSchema>;

export const ApprovalRecordSchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]),
  requested_at: z.string(),
  decided_at: z.string().nullable(),
  decided_by: z.string().nullable(),
  comment: z.string().nullable(),
});
export type ApprovalRecord = z.infer<typeof ApprovalRecordSchema>;

export const ExecutionRecordSchema = z.object({
  action: z.string(),
  status: z.enum(["PENDING", "SUCCEEDED", "FAILED"]),
  started_at: z.string(),
  finished_at: z.string().nullable(),
  result: z.string().nullable(),
});
export type ExecutionRecord = z.infer<typeof ExecutionRecordSchema>;

export const VerificationResultSchema = z.object({
  status: z.enum(["RECOVERED", "NOT_RECOVERED", "INCONCLUSIVE"]),
  metrics_before: z.record(z.number()),
  metrics_after: z.record(z.number()),
  checked_at: z.string(),
});
export type VerificationResult = z.infer<typeof VerificationResultSchema>;
