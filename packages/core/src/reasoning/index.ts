export * from "./types";
export * from "./mock";
export * from "./bedrock";

import { Reasoner } from "./types";
import { MockReasoner } from "./mock";
import { BedrockReasoner } from "./bedrock";

/** VAJRA_BEDROCK_MODE=aws|mock (default mock, so the pipeline runs with zero AWS credentials). */
export function createReasoner(): Reasoner {
  const mode = process.env.VAJRA_BEDROCK_MODE ?? "mock";
  return mode === "aws" ? new BedrockReasoner() : new MockReasoner();
}
