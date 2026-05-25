import * as path from 'path';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cdk from 'aws-cdk-lib'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront'
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins'
import { Construct } from 'constructs'

export class AttStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    // Private bucket for ATT data: users, sessions, traces, leaderboard JSON
    const dataBucket = new s3.Bucket(this, 'DataBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      versioned: false,
    })

    // Private bucket for Next.js static assets — served via CloudFront OAC
    const assetsBucket = new s3.Bucket(this, 'AssetsBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    })

    // Server Lambda — runs the Next.js app via OpenNext
    // Requires `npm run build:open-next` at repo root before `cdk deploy`
    const serverFn = new lambda.Function(this, 'ServerFn', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(
        path.join(__dirname, '../../.open-next/server-function')
      ),
      memorySize: 1024,
      timeout: cdk.Duration.seconds(30),
      environment: {
        DATA_BUCKET: dataBucket.bucketName,
        NODE_ENV: 'production',
        NEXT_PUBLIC_BASE_URL: 'https://paddlesnitch.com',
        PASSWORD_HASH_KEY: process.env.PASSWORD_HASH_KEY ?? (() => { throw new Error('PASSWORD_HASH_KEY env var must be set before cdk deploy') })(),
      },
    })

    dataBucket.grantReadWrite(serverFn)

    const serverUrl = serverFn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
    })

    // Image optimisation Lambda — handles Next.js /api/image requests
    const imageOptFn = new lambda.Function(this, 'ImageOptFn', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(
        path.join(__dirname, '../../.open-next/image-optimization-function')
      ),
      memorySize: 1536,
      timeout: cdk.Duration.seconds(25),
    })

    const imageOptUrl = imageOptFn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
    })

    // CloudFront distribution
    // Default: server Lambda; static assets served from S3 for cache efficiency
    const serverOrigin = new origins.HttpOrigin(
      cdk.Fn.select(2, cdk.Fn.split('/', serverUrl.url))
    )

    const imageOptOrigin = new origins.HttpOrigin(
      cdk.Fn.select(2, cdk.Fn.split('/', imageOptUrl.url))
    )

    const assetsOrigin = origins.S3BucketOrigin.withOriginAccessControl(assetsBucket)

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: serverOrigin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      },
      additionalBehaviors: {
        '/_next/static/*': {
          origin: assetsOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        },
        '/assets/*': {
          origin: assetsOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        },
        '/api/image*': {
          origin: imageOptOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        },
      },
    })

    new s3deploy.BucketDeployment(this, 'DeployAssets', {
      sources: [
        s3deploy.Source.asset(path.join(__dirname, '../../.open-next/assets')),
      ],
      destinationBucket: assetsBucket,
      distribution,
      distributionPaths: ['/_next/static/*', '/assets/*'],
    })

    new cdk.CfnOutput(this, 'CloudFrontUrl', {
      value: `https://${distribution.distributionDomainName}`,
    })
    new cdk.CfnOutput(this, 'DataBucketName', {
      value: dataBucket.bucketName,
    })
    new cdk.CfnOutput(this, 'AssetsBucketName', {
      value: assetsBucket.bucketName,
    })
  }
}
