import * as path from 'path';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cdk from 'aws-cdk-lib'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront'
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as cognito from 'aws-cdk-lib/aws-cognito'
import * as acm from 'aws-cdk-lib/aws-certificatemanager'
import * as route53 from 'aws-cdk-lib/aws-route53'
import * as route53targets from 'aws-cdk-lib/aws-route53-targets'
import { Construct } from 'constructs'

export class AttStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    // ---------------------------------------------------------------------------
    // GitHub Actions OIDC — allows CI to deploy without stored AWS keys
    // ---------------------------------------------------------------------------
    const githubProvider = new iam.OpenIdConnectProvider(this, 'GithubOidc', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
    })

    const deployRole = new iam.Role(this, 'GithubDeployRole', {
      roleName: 'att-github-deploy',
      assumedBy: new iam.WebIdentityPrincipal(githubProvider.openIdConnectProviderArn, {
        StringLike: {
          'token.actions.githubusercontent.com:sub': 'repo:baldur/paddlesnitch-att:ref:refs/heads/main',
        },
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
        },
      }),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'),
      ],
      maxSessionDuration: cdk.Duration.hours(1),
    })

    // ---------------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------------

    const dataBucket = new s3.Bucket(this, 'DataBucket', {
      bucketName: 'paddlesnitch-data-prod',
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      versioned: false,
    })

    const assetsBucket = new s3.Bucket(this, 'AssetsBucket', {
      bucketName: 'paddlesnitch-assets-prod',
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    })

    // ---------------------------------------------------------------------------
    // Cognito User Pool — identity store for all users
    // ---------------------------------------------------------------------------
    // NOTE on schema: Cognito does NOT allow modifying a user pool's Schema
    // after creation. Declaring `standardAttributes` here on the already-deployed
    // pool causes UPDATE_FAILED with "Invalid AttributeDataType input". `email`
    // and `name` are already standard Cognito attributes available by default —
    // the signUp call passes them in UserAttributes and Cognito stores them.
    // If we ever need to require/extend attributes, the only safe path is to
    // create a new pool.
    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'paddlesnitch-users',
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      // autoVerify explicitly disabled. The signUp handler immediately calls
      // AdminConfirmSignUp + AdminUpdateUserAttributes (email_verified=true),
      // so the user is confirmed and recovery-ready without Cognito sending
      // a spam-looking verification email from its default sender.
      // CDK defaults autoVerify to true when signInAliases.email is set, so
      // we must override explicitly.
      autoVerify: { email: false, phone: false },
      passwordPolicy: {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      // Send all Cognito-originated emails (password reset code, OTP code,
      // any future verification) from noreply@paddlesnitch.com via SES.
      // DKIM, MAIL FROM (mail.paddlesnitch.com), and DMARC are all aligned —
      // recipients see legitimate transactional mail.
      email: cognito.UserPoolEmail.withSES({
        fromEmail: 'noreply@paddlesnitch.com',
        fromName: 'paddlesnitch.com',
        sesRegion: 'eu-west-1',
        sesVerifiedDomain: 'paddlesnitch.com',
        replyTo: 'privacy@paddlesnitch.com',
      }),
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    })

    // Custom Auth Lambda triggers for OTP / passwordless sign-in.
    // Source lives in infra/lambdas/cognito-auth/ — same .mjs files run
    // both here and in the dev lambda-emulator.
    const lambdaDir = path.join(__dirname, '../lambdas/cognito-auth')
    const defineAuth = new lambda.Function(this, 'DefineAuthChallenge', {
      functionName: 'att-cognito-define-auth-challenge',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'define-auth-challenge.handler',
      code: lambda.Code.fromAsset(lambdaDir),
      timeout: cdk.Duration.seconds(5),
    })
    const createAuth = new lambda.Function(this, 'CreateAuthChallenge', {
      functionName: 'att-cognito-create-auth-challenge',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'create-auth-challenge.handler',
      code: lambda.Code.fromAsset(lambdaDir),
      timeout: cdk.Duration.seconds(10),
      environment: {
        FROM_EMAIL: 'noreply@paddlesnitch.com',
      },
    })
    // Resource is `identity/*` rather than the specific paddlesnitch.com
    // identity ARN because, in SES SANDBOX MODE, SendEmail authorises the
    // principal against BOTH the FROM identity and the recipient identity.
    // Limiting to a single identity blows up on any recipient that isn't
    // paddlesnitch.com (i.e. every real user). The wildcard is scoped to
    // this account, which is the right blast radius — and once SES drops
    // out of sandbox the recipient-identity check goes away anyway.
    createAuth.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ses:SendEmail'],
      resources: [`arn:aws:ses:eu-west-1:${this.account}:identity/*`],
    }))
    const verifyAuth = new lambda.Function(this, 'VerifyAuthChallenge', {
      functionName: 'att-cognito-verify-auth-challenge',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'verify-auth-challenge.handler',
      code: lambda.Code.fromAsset(lambdaDir),
      timeout: cdk.Duration.seconds(5),
    })

    // Attach Cognito triggers. addTrigger() also grants Cognito the
    // lambda:InvokeFunction permission on each.
    userPool.addTrigger(cognito.UserPoolOperation.DEFINE_AUTH_CHALLENGE, defineAuth)
    userPool.addTrigger(cognito.UserPoolOperation.CREATE_AUTH_CHALLENGE, createAuth)
    userPool.addTrigger(cognito.UserPoolOperation.VERIFY_AUTH_CHALLENGE_RESPONSE, verifyAuth)

    const userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool,
      userPoolClientName: 'paddlesnitch-web',
      authFlows: {
        userPassword: true,
        adminUserPassword: true,
        custom: true,
      },
      generateSecret: false,
      idTokenValidity: cdk.Duration.hours(24),
      accessTokenValidity: cdk.Duration.hours(24),
      refreshTokenValidity: cdk.Duration.days(30),
      enableTokenRevocation: true,
      preventUserExistenceErrors: true,
    })

    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId })
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId })

    // ---------------------------------------------------------------------------
    // Compute — OpenNext v4 outputs to server-functions/default
    // ---------------------------------------------------------------------------

    const serverFn = new lambda.Function(this, 'ServerFn', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(
        path.join(__dirname, '../../.open-next/server-functions/default')
      ),
      memorySize: 1024,
      timeout: cdk.Duration.seconds(30),
      environment: {
        DATA_BUCKET: dataBucket.bucketName,
        NODE_ENV: 'production',
        NEXT_PUBLIC_BASE_URL: 'https://paddlesnitch.com',
        COGNITO_USER_POOL_ID: userPool.userPoolId,
        COGNITO_CLIENT_ID: userPoolClient.userPoolClientId,
        COGNITO_REGION: this.region,
      },
    })

    dataBucket.grantReadWrite(serverFn)

    serverFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ses:SendEmail'],
      resources: [`arn:aws:ses:eu-west-1:${this.account}:identity/paddlesnitch.com`],
    }))

    // Cognito admin operations the app calls (sign-up confirmation +
    // mark-email-verified at signup so password reset works, token
    // revocation, GDPR Art. 17 erasure)
    serverFn.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'cognito-idp:AdminConfirmSignUp',
        'cognito-idp:AdminGetUser',
        'cognito-idp:AdminUpdateUserAttributes',
        'cognito-idp:AdminDeleteUser',
        'cognito-idp:RevokeToken',
      ],
      resources: [userPool.userPoolArn],
    }))

    const serverUrl = serverFn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
    })

    const imageOptFn = new lambda.Function(this, 'ImageOptFn', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(
        path.join(__dirname, '../../.open-next/image-optimization-function')
      ),
      memorySize: 1536,
      timeout: cdk.Duration.seconds(25),
      environment: {
        BUCKET_NAME: assetsBucket.bucketName,
        BUCKET_KEY_PREFIX: '_assets',
      },
    })

    assetsBucket.grantRead(imageOptFn)

    const imageOptUrl = imageOptFn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
    })

    // ---------------------------------------------------------------------------
    // CloudFront — behaviors match OpenNext v4 output manifest
    // Assets are deployed under _assets/ prefix; origin path translates back
    // ---------------------------------------------------------------------------
    const serverOrigin = new origins.HttpOrigin(
      cdk.Fn.select(2, cdk.Fn.split('/', serverUrl.url))
    )

    const imageOptOrigin = new origins.HttpOrigin(
      cdk.Fn.select(2, cdk.Fn.split('/', imageOptUrl.url))
    )

    // S3 origin with /_assets prefix — CloudFront prepends this when fetching
    const assetsOrigin = origins.S3BucketOrigin.withOriginAccessControl(assetsBucket, {
      originPath: '/_assets',
    })

    const certificate = acm.Certificate.fromCertificateArn(this, 'Certificate',
      'arn:aws:acm:us-east-1:423220633280:certificate/3c7ad0c4-5bd2-4959-907b-971417a0ff08'
    )

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      domainNames: ['paddlesnitch.com', 'www.paddlesnitch.com'],
      certificate,
      defaultBehavior: {
        origin: serverOrigin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      },
      additionalBehaviors: {
        // Image optimizer — must be before /_next/* to take precedence
        '/_next/image*': {
          origin: imageOptOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        },
        // All other _next assets (JS, CSS, fonts) served from S3
        '/_next/*': {
          origin: assetsOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        },
      },
    })

    // OpenNext v4 assets go under _assets/ in S3
    new s3deploy.BucketDeployment(this, 'DeployAssets', {
      sources: [
        s3deploy.Source.asset(path.join(__dirname, '../../.open-next/assets')),
      ],
      destinationBucket: assetsBucket,
      destinationKeyPrefix: '_assets',
      distribution,
      distributionPaths: ['/_next/*'],
    })

    // ---------------------------------------------------------------------------
    // DNS — www alias pointing to same CloudFront distribution
    // (apex A record was created manually in Route53; www was missing)
    // ---------------------------------------------------------------------------
    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'Zone', {
      hostedZoneId: 'Z08692883MHJE285KA9DQ',
      zoneName: 'paddlesnitch.com',
    })

    new route53.ARecord(this, 'WwwAlias', {
      zone: hostedZone,
      recordName: 'www',
      target: route53.RecordTarget.fromAlias(new route53targets.CloudFrontTarget(distribution)),
    })

    // ---------------------------------------------------------------------------
    // Outputs
    // ---------------------------------------------------------------------------
    new cdk.CfnOutput(this, 'CloudFrontUrl', {
      value: `https://${distribution.distributionDomainName}`,
    })
    new cdk.CfnOutput(this, 'DataBucketName', {
      value: dataBucket.bucketName,
    })
    new cdk.CfnOutput(this, 'AssetsBucketName', {
      value: assetsBucket.bucketName,
    })
    new cdk.CfnOutput(this, 'GithubDeployRoleArn', {
      value: deployRole.roleArn,
      description: 'Paste into GitHub Actions workflow as AWS_ROLE_ARN',
    })
  }
}
