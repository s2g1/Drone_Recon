#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { ArgusStack } from '../lib/argus-stack.js';

const app = new cdk.App();

new ArgusStack(app, 'ArgusStack', {
  env: {
    account: process.env['CDK_DEFAULT_ACCOUNT'],
    region: process.env['CDK_DEFAULT_REGION'] ?? 'us-east-1',
  },
  description: 'ARGUS Live Demo - ECS Fargate deployment with ALB and ECR',
});

app.synth();
