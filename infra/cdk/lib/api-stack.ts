import { Stack, StackProps, Duration } from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as events from "aws-cdk-lib/aws-events";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";
import path from "path";

export interface ApiStackProps extends StackProps {
  incidentsTable: dynamodb.Table;
  eventBus: events.EventBus;
  approvalCallbackFn: lambdaNode.NodejsFunction;
}

const LAMBDA_DIR = path.join(__dirname, "..", "lambda");

/**
 * Public entry point: API Gateway REST API. A Cognito User Pool is
 * provisioned here for Phase 2/3 (real auth on every route) but is NOT wired
 * into any route yet — the MVP intentionally ships without auth on the demo
 * API, and that gap is called out rather than hidden (see docs/architecture.md).
 */
export class ApiStack extends Stack {
  public readonly api: apigateway.RestApi;
  public readonly userPool: cognito.UserPool;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const commonEnv = { TABLE_NAME: props.incidentsTable.tableName, EVENT_BUS_NAME: props.eventBus.eventBusName };
    const nodeJsFnDefaults: Partial<lambdaNode.NodejsFunctionProps> = {
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: Duration.seconds(15),
      memorySize: 256,
      bundling: { minify: true, sourceMap: true },
    };

    const ingestFn = new lambdaNode.NodejsFunction(this, "IngestFn", {
      ...nodeJsFnDefaults,
      entry: path.join(LAMBDA_DIR, "ingest.ts"),
      environment: commonEnv,
    });
    const listIncidentsFn = new lambdaNode.NodejsFunction(this, "ListIncidentsFn", {
      ...nodeJsFnDefaults,
      entry: path.join(LAMBDA_DIR, "listIncidents.ts"),
      environment: commonEnv,
    });
    const getIncidentFn = new lambdaNode.NodejsFunction(this, "GetIncidentFn", {
      ...nodeJsFnDefaults,
      entry: path.join(LAMBDA_DIR, "getIncident.ts"),
      environment: commonEnv,
    });
    const getSimilarFn = new lambdaNode.NodejsFunction(this, "GetSimilarIncidentsFn", {
      ...nodeJsFnDefaults,
      entry: path.join(LAMBDA_DIR, "getSimilarIncidents.ts"),
      environment: commonEnv,
    });

    props.incidentsTable.grantReadWriteData(ingestFn);
    props.incidentsTable.grantReadData(listIncidentsFn);
    props.incidentsTable.grantReadData(getIncidentFn);
    props.incidentsTable.grantReadData(getSimilarFn);
    props.eventBus.grantPutEventsTo(ingestFn);

    this.api = new apigateway.RestApi(this, "VajraApi", {
      restApiName: "vajra-ai-api",
      deployOptions: { stageName: "prod", tracingEnabled: true },
    });

    const events_ = this.api.root.addResource("events");
    events_.addMethod("POST", new apigateway.LambdaIntegration(ingestFn));

    const incidents = this.api.root.addResource("incidents");
    incidents.addMethod("GET", new apigateway.LambdaIntegration(listIncidentsFn));

    const incident = incidents.addResource("{id}");
    incident.addMethod("GET", new apigateway.LambdaIntegration(getIncidentFn));
    incident.addResource("similar").addMethod("GET", new apigateway.LambdaIntegration(getSimilarFn));
    incident.addResource("approve").addMethod("POST", new apigateway.LambdaIntegration(props.approvalCallbackFn));
    incident.addResource("reject").addMethod("POST", new apigateway.LambdaIntegration(props.approvalCallbackFn));

    this.userPool = new cognito.UserPool(this, "VajraUserPool", {
      userPoolName: "vajra-ai-users",
      selfSignUpEnabled: false,
      mfa: cognito.Mfa.OPTIONAL,
      passwordPolicy: { minLength: 12, requireDigits: true, requireSymbols: true, requireUppercase: true },
    });
  }
}
