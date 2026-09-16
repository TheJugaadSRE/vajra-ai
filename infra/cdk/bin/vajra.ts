#!/usr/bin/env node
import { App } from "aws-cdk-lib";
import { DataStack } from "../lib/data-stack";
import { OrchestrationStack } from "../lib/orchestration-stack";
import { ApiStack } from "../lib/api-stack";

const app = new App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? "us-east-1",
};

// Set VAJRA_BEDROCK_MODEL_ARN before synth/deploy to scope IAM tightly to one
// model (section 15: least privilege, no wildcard Bedrock access).
const bedrockModelArn =
  process.env.VAJRA_BEDROCK_MODEL_ARN ??
  `arn:aws:bedrock:${env.region}::foundation-model/anthropic.claude-3-5-sonnet-20241022-v2:0`;

const dataStack = new DataStack(app, "VajraDataStack", { env });

const orchestrationStack = new OrchestrationStack(app, "VajraOrchestrationStack", {
  env,
  incidentsTable: dataStack.incidentsTable,
  bedrockModelArn,
});

new ApiStack(app, "VajraApiStack", {
  env,
  incidentsTable: dataStack.incidentsTable,
  eventBus: orchestrationStack.eventBus,
  approvalCallbackFn: orchestrationStack.approvalCallbackFn,
});
