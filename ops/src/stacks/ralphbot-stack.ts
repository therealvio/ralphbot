import { AppExtensionProps } from "../app"
import { Construct } from "constructs"
import { Stack, StackProps } from "aws-cdk-lib"
import { aws_ecr as ecr } from "aws-cdk-lib"
import { aws_ecs as ecs } from "aws-cdk-lib"
import { aws_iam as iam } from "aws-cdk-lib"
import { aws_logs as logs } from "aws-cdk-lib"
import { aws_secretsmanager as secretsmanager } from "aws-cdk-lib"
import { aws_ssm as ssm } from "aws-cdk-lib"

export class RalphbotStack extends Stack {
  constructor(
    scope: Construct,
    id: string,
    props?: StackProps,
    extendedProps?: AppExtensionProps
  ) {
    super(scope, id, props)

    const repositoryRef = ecr.Repository.fromRepositoryArn(
      this,
      "ralphbotECRRepositoryRef",
      `arn:aws:ecr:${props?.env?.region}:${props?.env?.account}:repository/ralphbot/master`
    )

    const ralphbotImage = ecs.ContainerImage.fromEcrRepository(
      repositoryRef,
      extendedProps?.version
    )

    const cluster = new ecs.Cluster(this, "Cluster")
    const taskDefinition = new ecs.FargateTaskDefinition(
      this,
      "TaskDefinition",
      {
        cpu: 256,
        memoryLimitMiB: 512,
      }
    )

    const botToken = secretsmanager.Secret.fromSecretNameV2(
      this,
      "botTokenFromName",
      "ralphbot/token"
    )
    const secretArnSuffix = ssm.StringParameter.valueForStringParameter(
      this,
      "/ralphbot/token/arn-suffix"
    )

    taskDefinition.addToExecutionRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret",
        ],
        resources: [`${botToken.secretArn}-${secretArnSuffix}`],
      })
    )

    taskDefinition.addContainer("ralphbotContainer", {
      image: ralphbotImage,
      secrets: {
        BOT_TOKEN: ecs.Secret.fromSecretsManager(botToken, "token"),
      },
      logging: ecs.LogDriver.awsLogs({
        streamPrefix: "ralphbot",
        logRetention: logs.RetentionDays.ONE_WEEK,
      }),
    })
    new ecs.FargateService(this, "Service", {
      cluster,
      taskDefinition,
      circuitBreaker: { rollback: true },
    })
  }
}
