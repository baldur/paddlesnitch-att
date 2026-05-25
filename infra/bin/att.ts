import * as cdk from 'aws-cdk-lib'
import { AttStack } from '../lib/att-stack'

const app = new cdk.App()

new AttStack(app, 'AttStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'eu-west-1',
  },
})
