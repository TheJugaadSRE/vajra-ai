import { Stack, StackProps, RemovalPolicy, Duration } from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

/**
 * Storage layer: one DynamoDB table for incident memory (single-table design,
 * PK = incident_id), one S3 bucket for knowledge/eval assets, and Secrets
 * Manager placeholders for the Phase 2 integrations (Dynatrace/Jira/etc. API
 * keys) so the shape exists even though nothing reads them yet.
 */
export class DataStack extends Stack {
  public readonly incidentsTable: dynamodb.Table;
  public readonly predictionsTable: dynamodb.Table;
  public readonly knowledgeBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    this.incidentsTable = new dynamodb.Table(this, "IncidentsTable", {
      tableName: "vajra-incidents",
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // Separate from incidentsTable rather than sharing a single-table design with
    // it: DynamoIncidentStore.list()/findSimilar() Scan the whole table assuming
    // every item is an Incident, so mixing Prediction items in would silently
    // corrupt those reads.
    this.predictionsTable = new dynamodb.Table(this, "PredictionsTable", {
      tableName: "vajra-predictions",
      partitionKey: { name: "prediction_id", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    this.knowledgeBucket = new s3.Bucket(this, "KnowledgeBucket", {
      bucketName: undefined, // let CDK generate a unique name
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true,
      lifecycleRules: [{ noncurrentVersionExpiration: Duration.days(90) }],
    });

    // Placeholders for Phase 2 integration credentials — nothing reads these yet.
    new secretsmanager.Secret(this, "DynatraceApiKey", { description: "Dynatrace API token (Phase 2)" });
    new secretsmanager.Secret(this, "JiraApiKey", { description: "Jira/ServiceNow API token (Phase 2)" });
  }
}
