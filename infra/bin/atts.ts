import * as cdk from 'aws-cdk-lib'
import { AttsStack } from '../lib/atts-stack'

const app = new cdk.App()

new AttsStack(app, 'AttsStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'eu-west-1',
  },
})
