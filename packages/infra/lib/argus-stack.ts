import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import { Construct } from 'constructs';

export class ArgusStack extends cdk.Stack {
  public readonly cluster: ecs.Cluster;
  public readonly service: ecs.FargateService;
  public readonly repository: ecr.Repository;
  public readonly vpc: ec2.Vpc;
  public readonly alb: elbv2.ApplicationLoadBalancer;
  public readonly bucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Feature flag: storageMode controls local filesystem vs S3 storage
    // Usage: cdk deploy -c storageMode=s3  (or storageMode=local)
    const storageMode = this.node.tryGetContext('storageMode') as string || 'local';
    const isS3Mode = storageMode === 's3';

    // VPC with public subnets for ALB
    this.vpc = new ec2.Vpc(this, 'ArgusVpc', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
      ],
    });

    // ECR repository for Docker image
    this.repository = new ecr.Repository(this, 'ArgusRepository', {
      repositoryName: 'argus-live-demo',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      emptyOnDelete: true,
      lifecycleRules: [
        {
          maxImageCount: 5,
          description: 'Keep only 5 most recent images',
        },
      ],
    });

    // S3 bucket for video uploads and composite output with 24h lifecycle
    this.bucket = new s3.Bucket(this, 'ArgusBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      lifecycleRules: [
        {
          expiration: cdk.Duration.days(1),
        },
      ],
    });

    // ECS Cluster
    this.cluster = new ecs.Cluster(this, 'ArgusCluster', {
      vpc: this.vpc,
      clusterName: 'argus-cluster',
    });

    // Task definition: 2 vCPU, 4GB RAM, node:20-alpine + ffmpeg
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'ArgusTaskDef', {
      memoryLimitMiB: 4096,
      cpu: 2048,
    });

    // Container environment: base config + storage mode flags
    const containerEnvironment: Record<string, string> = {
      NODE_ENV: 'production',
      HTTP_PORT: '3000',
      HTTPS_PORT: '3443',
      AWS_STORAGE_ENABLED: isS3Mode ? 'true' : 'false',
    };

    // Add S3 bucket name when in S3 storage mode
    if (isS3Mode) {
      containerEnvironment.S3_BUCKET_NAME = this.bucket.bucketName;
    }

    taskDefinition.addContainer('ArgusContainer', {
      image: ecs.ContainerImage.fromEcrRepository(this.repository, 'latest'),
      memoryLimitMiB: 4096,
      cpu: 2048,
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'argus',
      }),
      portMappings: [
        { containerPort: 3000, protocol: ecs.Protocol.TCP },
        { containerPort: 3443, protocol: ecs.Protocol.TCP },
      ],
      environment: containerEnvironment,
    });

    // Application Load Balancer
    this.alb = new elbv2.ApplicationLoadBalancer(this, 'ArgusAlb', {
      vpc: this.vpc,
      internetFacing: true,
      loadBalancerName: 'argus-alb',
    });

    // Fargate service
    this.service = new ecs.FargateService(this, 'ArgusService', {
      cluster: this.cluster,
      taskDefinition,
      desiredCount: 1,
      assignPublicIp: true,
      serviceName: 'argus-service',
    });

    // ALB target group with sticky sessions for WebSocket routing
    const targetGroup = new elbv2.ApplicationTargetGroup(this, 'ArgusTargetGroup', {
      vpc: this.vpc,
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        path: '/healthz',
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
      },
      stickinessCookieDuration: cdk.Duration.hours(1),
    });

    targetGroup.addTarget(this.service);

    // HTTP listener
    this.alb.addListener('HttpListener', {
      port: 80,
      defaultTargetGroups: [targetGroup],
    });

    // Stack outputs
    new cdk.CfnOutput(this, 'AlbDnsName', {
      value: this.alb.loadBalancerDnsName,
      description: 'ALB DNS name for ARGUS system',
    });

    new cdk.CfnOutput(this, 'EcrRepositoryUri', {
      value: this.repository.repositoryUri,
      description: 'ECR repository URI for Docker image push',
    });

    new cdk.CfnOutput(this, 'ClusterArn', {
      value: this.cluster.clusterArn,
      description: 'ECS cluster ARN',
    });

    // Origin Access Identity for S3 bucket
    const originAccessIdentity = new cloudfront.OriginAccessIdentity(this, 'ArgusOAI', {
      comment: 'OAI for ARGUS S3 bucket',
    });

    this.bucket.grantRead(originAccessIdentity);

    // CloudFront distribution serving SPA assets and proxying uploads to ALB
    this.distribution = new cloudfront.Distribution(this, 'ArgusDistribution', {
      defaultBehavior: {
        origin: new origins.S3Origin(this.bucket, {
          originAccessIdentity,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
      ],
      additionalBehaviors: {
        '/upload/*': {
          origin: new origins.HttpOrigin(this.alb.loadBalancerDnsName, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        },
      },
    });

    // Stack outputs for S3 and CloudFront
    new cdk.CfnOutput(this, 'BucketName', {
      value: this.bucket.bucketName,
      description: 'S3 bucket name for video uploads and composite output',
    });

    new cdk.CfnOutput(this, 'DistributionDomainName', {
      value: this.distribution.distributionDomainName,
      description: 'CloudFront distribution domain name',
    });
  }
}
