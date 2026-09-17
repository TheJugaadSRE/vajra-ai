import { Stack, StackProps, Duration } from "aws-cdk-lib";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambdaEventSources from "aws-cdk-lib/aws-lambda-event-sources";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from "aws-cdk-lib/aws-stepfunctions-tasks";
import * as sns from "aws-cdk-lib/aws-sns";
import * as iam from "aws-cdk-lib/aws-iam";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";
import path from "path";

export interface OrchestrationStackProps extends StackProps {
  incidentsTable: dynamodb.Table;
  predictionsTable: dynamodb.Table;
  bedrockModelArn: string;
}

const LAMBDA_DIR = path.join(__dirname, "..", "lambda");

/**
 * The closed loop, in AWS-native primitives: EventBridge decouples ingestion
 * from diagnosis; SQS+DLQ gives diagnosis backpressure/retry; Step Functions
 * is the durable state machine for policy -> approval -> execute -> verify,
 * using `waitForTaskToken` so a human can approve minutes or hours later
 * without holding a Lambda (or a human) open the whole time.
 */
export class OrchestrationStack extends Stack {
  public readonly eventBus: events.EventBus;
  public readonly stateMachine: sfn.StateMachine;
  public readonly approvalTopic: sns.Topic;
  public readonly approvalCallbackFn: lambdaNode.NodejsFunction;

  constructor(scope: Construct, id: string, props: OrchestrationStackProps) {
    super(scope, id, props);

    const commonEnv = {
      TABLE_NAME: props.incidentsTable.tableName,
      VAJRA_BEDROCK_MODE: "aws",
    };
    const nodeJsFnDefaults: Partial<lambdaNode.NodejsFunctionProps> = {
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: Duration.seconds(30),
      memorySize: 512,
      bundling: { minify: true, sourceMap: true },
    };

    this.eventBus = new events.EventBus(this, "IncidentEventBus", { eventBusName: "vajra-incidents" });

    const dlq = new sqs.Queue(this, "OrchestrationDLQ", { retentionPeriod: Duration.days(14) });
    const orchestrationQueue = new sqs.Queue(this, "OrchestrationQueue", {
      visibilityTimeout: Duration.seconds(60),
      deadLetterQueue: { queue: dlq, maxReceiveCount: 3 },
    });

    new events.Rule(this, "IncidentCorrelatedRule", {
      eventBus: this.eventBus,
      eventPattern: { source: ["vajra.ingestion"], detailType: ["IncidentCorrelated"] },
      targets: [new targets.SqsQueue(orchestrationQueue)],
    });

    this.approvalTopic = new sns.Topic(this, "ApprovalNotificationTopic", {
      displayName: "VAJRA incidents awaiting human approval",
    });

    const requestApprovalFn = new lambdaNode.NodejsFunction(this, "RequestApprovalFn", {
      ...nodeJsFnDefaults,
      entry: path.join(LAMBDA_DIR, "requestApproval.ts"),
      environment: commonEnv,
    });
    const executeFn = new lambdaNode.NodejsFunction(this, "ExecuteFn", {
      ...nodeJsFnDefaults,
      entry: path.join(LAMBDA_DIR, "execute.ts"),
      environment: commonEnv,
    });
    const verifyFn = new lambdaNode.NodejsFunction(this, "VerifyFn", {
      ...nodeJsFnDefaults,
      entry: path.join(LAMBDA_DIR, "verify.ts"),
      environment: commonEnv,
    });
    const storeMemoryFn = new lambdaNode.NodejsFunction(this, "StoreMemoryFn", {
      ...nodeJsFnDefaults,
      entry: path.join(LAMBDA_DIR, "storeMemory.ts"),
      environment: commonEnv,
    });
    const escalateFn = new lambdaNode.NodejsFunction(this, "EscalateFn", {
      ...nodeJsFnDefaults,
      entry: path.join(LAMBDA_DIR, "escalate.ts"),
      environment: commonEnv,
    });
    this.approvalCallbackFn = new lambdaNode.NodejsFunction(this, "ApprovalCallbackFn", {
      ...nodeJsFnDefaults,
      entry: path.join(LAMBDA_DIR, "approvalCallback.ts"),
      environment: commonEnv,
    });

    for (const fn of [requestApprovalFn, executeFn, verifyFn, storeMemoryFn, escalateFn, this.approvalCallbackFn]) {
      props.incidentsTable.grantReadWriteData(fn);
    }
    requestApprovalFn.addEnvironment("SNS_TOPIC_ARN", this.approvalTopic.topicArn);
    this.approvalTopic.grantPublish(requestApprovalFn);

    // --- Step Functions definition ---
    const waitForApproval = new tasks.LambdaInvoke(this, "WaitForApproval", {
      lambdaFunction: requestApprovalFn,
      integrationPattern: sfn.IntegrationPattern.WAIT_FOR_TASK_TOKEN,
      payload: sfn.TaskInput.fromObject({
        incident_id: sfn.JsonPath.stringAt("$.incident_id"),
        token: sfn.JsonPath.taskToken,
      }),
      timeout: Duration.hours(24),
      resultPath: sfn.JsonPath.DISCARD,
    });

    const executeStep = new tasks.LambdaInvoke(this, "Execute", {
      lambdaFunction: executeFn,
      payload: sfn.TaskInput.fromObject({ incident_id: sfn.JsonPath.stringAt("$.incident_id") }),
      outputPath: "$.Payload",
    });

    const verifyStep = new tasks.LambdaInvoke(this, "Verify", {
      lambdaFunction: verifyFn,
      payload: sfn.TaskInput.fromObject({ incident_id: sfn.JsonPath.stringAt("$.incident_id") }),
      outputPath: "$.Payload",
    });

    const storeMemoryStep = new tasks.LambdaInvoke(this, "StoreMemory", {
      lambdaFunction: storeMemoryFn,
      payload: sfn.TaskInput.fromObject({
        incident_id: sfn.JsonPath.stringAt("$.incident_id"),
        recovered: sfn.JsonPath.stringAt("$.recovered"),
      }),
      resultPath: sfn.JsonPath.DISCARD,
    });

    // Reached from three different entry points (policy-blocked, approval-rejected,
    // execution-failed-Catch) whose inputs don't share a common "reason" field shape,
    // so this step deliberately only forwards incident_id — escalate.ts lambda supplies
    // a sensible default message when none is given.
    const escalateStep = new tasks.LambdaInvoke(this, "Escalate", {
      lambdaFunction: escalateFn,
      payload: sfn.TaskInput.fromObject({
        incident_id: sfn.JsonPath.stringAt("$.incident_id"),
      }),
      resultPath: sfn.JsonPath.DISCARD,
    });

    const executeThenVerify = executeStep.next(verifyStep).next(storeMemoryStep);
    executeStep.addCatch(escalateStep, { resultPath: "$.error" });

    const approvalThenExecute = waitForApproval.next(executeThenVerify);
    waitForApproval.addCatch(escalateStep, { resultPath: "$.error" }); // rejection -> SendTaskFailure -> here

    const requiresApprovalChoice = new sfn.Choice(this, "RequiresApproval?")
      .when(sfn.Condition.booleanEquals("$.action_allowed", false), escalateStep)
      .when(sfn.Condition.booleanEquals("$.requires_approval", true), approvalThenExecute)
      .otherwise(executeThenVerify);

    this.stateMachine = new sfn.StateMachine(this, "IncidentRemediationStateMachine", {
      stateMachineName: "vajra-incident-remediation",
      definitionBody: sfn.DefinitionBody.fromChainable(requiresApprovalChoice),
      timeout: Duration.hours(25),
    });

    const orchestrateFn = new lambdaNode.NodejsFunction(this, "OrchestrateFn", {
      ...nodeJsFnDefaults,
      entry: path.join(LAMBDA_DIR, "orchestrate.ts"),
      timeout: Duration.seconds(60),
      environment: { ...commonEnv, STATE_MACHINE_ARN: this.stateMachine.stateMachineArn },
    });
    props.incidentsTable.grantReadWriteData(orchestrateFn);
    this.stateMachine.grantStartExecution(orchestrateFn);
    orchestrateFn.addEventSource(new lambdaEventSources.SqsEventSource(orchestrationQueue, { batchSize: 5 }));
    orchestrateFn.addToRolePolicy(
      new iam.PolicyStatement({ actions: ["bedrock:InvokeModel"], resources: [props.bedrockModelArn] })
    );

    this.approvalCallbackFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["states:SendTaskSuccess", "states:SendTaskFailure"],
        resources: [this.stateMachine.stateMachineArn],
      })
    );

    // Representative platform self-observability (section 22) — not exhaustive.
    new cloudwatch.Alarm(this, "OrchestrateErrorsAlarm", {
      metric: orchestrateFn.metricErrors({ period: Duration.minutes(5) }),
      threshold: 3,
      evaluationPeriods: 1,
      alarmDescription: "VAJRA orchestrator Lambda is erroring on incident diagnosis",
    });
    new cloudwatch.Alarm(this, "StateMachineFailuresAlarm", {
      metric: this.stateMachine.metricFailed({ period: Duration.minutes(5) }),
      threshold: 1,
      evaluationPeriods: 1,
      alarmDescription: "VAJRA incident remediation state machine failed",
    });

    // --- Predictive Failure Engine: scheduled forecast, see lambda/predict.ts ---
    const predictFn = new lambdaNode.NodejsFunction(this, "PredictFn", {
      ...nodeJsFnDefaults,
      entry: path.join(LAMBDA_DIR, "predict.ts"),
      environment: { PREDICTIONS_TABLE_NAME: props.predictionsTable.tableName },
    });
    props.predictionsTable.grantReadWriteData(predictFn);

    new events.Rule(this, "PredictiveScanSchedule", {
      schedule: events.Schedule.rate(Duration.minutes(5)),
      targets: [new targets.LambdaFunction(predictFn)],
    });
  }
}
