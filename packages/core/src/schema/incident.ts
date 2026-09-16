import { z } from "zod";
import { SeveritySchema } from "./event";
import { DiagnosisResultSchema } from "./diagnosis";
import {
  ApprovalRecordSchema,
  ExecutionRecordSchema,
  PolicyDecisionSchema,
  VerificationResultSchema,
} from "./workflow";

export const IncidentStatusSchema = z.enum([
  "OPEN",
  "INVESTIGATING",
  "AWAITING_APPROVAL",
  "REMEDIATING",
  "VERIFYING",
  "RESOLVED",
  "ESCALATED",
  "CLOSED",
]);
export type IncidentStatus = z.infer<typeof IncidentStatusSchema>;

export const TimelineEntrySchema = z.object({
  timestamp: z.string(),
  stage: z.string(),
  actor: z.enum(["system", "agent", "human"]),
  message: z.string(),
  data: z.record(z.unknown()).optional(),
});
export type TimelineEntry = z.infer<typeof TimelineEntrySchema>;

export const IncidentSchema = z.object({
  incident_id: z.string(),
  title: z.string(),
  service: z.string(),
  environment: z.string(),
  severity: SeveritySchema,
  status: IncidentStatusSchema,
  symptoms: z.array(z.string()),
  correlated_event_ids: z.array(z.string()),
  created_at: z.string(),
  updated_at: z.string(),
  timeline: z.array(TimelineEntrySchema),
  diagnosis: DiagnosisResultSchema.nullable(),
  policy_decision: PolicyDecisionSchema.nullable(),
  approval: ApprovalRecordSchema.nullable(),
  execution: ExecutionRecordSchema.nullable(),
  verification: VerificationResultSchema.nullable(),
});
export type Incident = z.infer<typeof IncidentSchema>;
