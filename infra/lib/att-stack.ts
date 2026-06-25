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
import * as ses from 'aws-cdk-lib/aws-ses'
import * as sesActions from 'aws-cdk-lib/aws-ses-actions'
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
      // We keep old builds' content-hashed assets across deploys (prune:false on
      // DeployAssets) so in-flight HTML never 404/403s mid-deploy. This rule
      // sweeps the orphaned old hashes so they don't accumulate forever. Active
      // assets are re-uploaded every deploy (LastModified refreshed), so only
      // genuinely-unreferenced hashes age out — 90 days is far longer than any
      // cached HTML could still point at them.
      lifecycleRules: [{
        id: 'expire-orphaned-hashed-assets',
        prefix: '_assets/_next/static/',
        expiration: cdk.Duration.days(90),
      }],
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
    // SES SendEmail authorises against multiple resources at once. We need
    // to grant on all of them:
    //   - identity/*  — both the FROM (paddlesnitch.com) AND the recipient
    //     (every user's email) get checked in SANDBOX mode. The recipient
    //     check goes away in production, but the FROM check stays.
    //   - configuration-set/*  — Virtual Deliverability Manager auto-attaches
    //     the account's default config set to every send, and SES checks
    //     IAM against it. Without permission, sends fail even with the
    //     identity permission in place.
    createAuth.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ses:SendEmail'],
      resources: [
        `arn:aws:ses:eu-west-1:${this.account}:identity/*`,
        `arn:aws:ses:eu-west-1:${this.account}:configuration-set/*`,
      ],
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
        // GitHub PAT used by the feedback widget to file issues. CFN can't
        // resolve SSM SecureString parameters at synth time, so we pass the
        // parameter NAME here and the route fetches+decrypts at runtime.
        // Must exist as an SSM SecureString at /att/github-issues-token.
        // Fine-grained scope: Issues: read/write on baldur/paddlesnitch-att.
        GITHUB_ISSUES_TOKEN_PARAM: '/att/github-issues-token',
        GITHUB_REPO: 'baldur/paddlesnitch-att',
        // Strava API credentials. Both halves live in SSM so deploys never
        // need GitHub-side variables or secrets — the Lambda fetches them at
        // runtime via fetchSsmParam() in src/lib/strava.ts. Client ID is a
        // plain String (it's public); the secret is a SecureString.
        STRAVA_CLIENT_ID_PARAM: '/att/strava-client-id',
        STRAVA_CLIENT_SECRET_PARAM: '/att/strava-client-secret',
      },
    })

    dataBucket.grantReadWrite(serverFn)

    serverFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ses:SendEmail'],
      resources: [`arn:aws:ses:eu-west-1:${this.account}:identity/paddlesnitch.com`],
    }))

    // Runtime-fetched SSM SecureStrings. CFN can't resolve SecureString
    // values at synth, so the Lambda decrypts them on first use and caches.
    // Scope is narrow — one explicit ARN per parameter.
    serverFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ssm:GetParameter'],
      resources: [
        `arn:aws:ssm:${this.region}:${this.account}:parameter/att/github-issues-token`,
        `arn:aws:ssm:${this.region}:${this.account}:parameter/att/strava-client-id`,
        `arn:aws:ssm:${this.region}:${this.account}:parameter/att/strava-client-secret`,
      ],
    }))
    // kms:Decrypt is required to actually decrypt SecureString values. Without
    // it, GetParameter(WithDecryption=true) returns the encrypted ciphertext
    // blob silently, which is what bit us with the Strava client secret —
    // Strava saw the ~240-char encrypted base64 as "the secret" and rejected
    // it as Application/invalid. Restrict the grant to the SSM-service KMS
    // context so the role can only decrypt parameters fetched through SSM.
    serverFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['kms:Decrypt'],
      resources: [`arn:aws:kms:${this.region}:${this.account}:key/*`],
      conditions: {
        StringEquals: { 'kms:ViaService': `ssm.${this.region}.amazonaws.com` },
      },
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

    // OpenNext v4 assets go under _assets/ in S3.
    // prune:false is the fix for mid-deploy 403s on CSS/JS: BucketDeployment
    // defaults to deleting any destination object not in the new build, which
    // removes the PREVIOUS build's hashed assets. Because a deploy isn't atomic
    // (the server Lambda begins serving HTML with new asset hashes while old
    // cached HTML still references old hashes), pruning leaves a window where a
    // requested /_next/static/<hash> is gone from S3 and the OAC origin returns
    // 403. Next.js assets are content-hashed + immutable, so old and new coexist
    // safely; the bucket lifecycle rule above expires the orphans later.
    new s3deploy.BucketDeployment(this, 'DeployAssets', {
      sources: [
        s3deploy.Source.asset(path.join(__dirname, '../../.open-next/assets')),
      ],
      destinationBucket: assetsBucket,
      destinationKeyPrefix: '_assets',
      prune: false,
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
    // Inbound email — privacy@paddlesnitch.com forwarder
    // ---------------------------------------------------------------------------
    // SES receives mail addressed to privacy@paddlesnitch.com, stores the
    // raw MIME under inbound-email/privacy/{messageId} in the data bucket,
    // and invokes a Lambda that re-sends the message to the human inbox.
    //
    // NOTE: SES allows ONE active receipt rule set per region. After the
    // first deploy that creates the rule set, run:
    //   aws ses set-active-receipt-rule-set --rule-set-name <name> --region eu-west-1
    // The rule set name is exported below as ReceiptRuleSetName.
    // We could automate this via an AwsCustomResource, but that risks
    // clobbering an active rule set someone set manually in the future,
    // so we keep activation as a one-time human step.

    const inboundEmailBucket = dataBucket
    const inboundEmailPrefix = 'inbound-email/privacy/'

    // SES needs PutObject on the prefix to deliver mail to S3. The bucket
    // policy must explicitly allow the SES service principal scoped to
    // this account + region; without the SourceAccount + SourceArn
    // conditions, the action would 403.
    inboundEmailBucket.addToResourcePolicy(new iam.PolicyStatement({
      sid: 'AllowSesInboundPut',
      effect: iam.Effect.ALLOW,
      principals: [new iam.ServicePrincipal('ses.amazonaws.com')],
      actions: ['s3:PutObject'],
      resources: [`${inboundEmailBucket.bucketArn}/${inboundEmailPrefix}*`],
      conditions: {
        StringEquals: {
          'AWS:SourceAccount': this.account,
        },
        StringLike: {
          'AWS:SourceArn': `arn:aws:ses:${this.region}:${this.account}:receipt-rule-set/*`,
        },
      },
    }))

    const forwarderFn = new lambda.Function(this, 'EmailForwarderFn', {
      functionName: 'att-email-forwarder',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambdas/email-forwarder')),
      timeout: cdk.Duration.seconds(20),
      memorySize: 256,
      environment: {
        INBOUND_BUCKET: inboundEmailBucket.bucketName,
        INBOUND_PREFIX: inboundEmailPrefix,
        FROM_EMAIL: 'noreply@paddlesnitch.com',
        // Hard-coded for now — the only privacy contact today. When we
        // need more sophisticated routing (per-team aliases, on-call
        // rotation) this becomes a Parameter Store lookup.
        FORWARD_TO: 'baldur.gudbjornsson@gmail.com',
        SUBJECT_PREFIX: '[paddlesnitch]',
      },
    })

    forwarderFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject'],
      resources: [`${inboundEmailBucket.bucketArn}/${inboundEmailPrefix}*`],
    }))
    forwarderFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ses:SendRawEmail'],
      resources: [`arn:aws:ses:${this.region}:${this.account}:identity/paddlesnitch.com`],
    }))

    const ruleSet = new ses.ReceiptRuleSet(this, 'InboundRules', {
      receiptRuleSetName: 'paddlesnitch-inbound',
    })

    ruleSet.addRule('PrivacyAlias', {
      recipients: ['privacy@paddlesnitch.com'],
      scanEnabled: true,    // spam / virus marker headers added to S3 object
      tlsPolicy: ses.TlsPolicy.OPTIONAL,
      actions: [
        new sesActions.S3({
          bucket: inboundEmailBucket,
          objectKeyPrefix: inboundEmailPrefix,
        }),
        new sesActions.Lambda({
          function: forwarderFn,
          invocationType: sesActions.LambdaInvocationType.EVENT,
        }),
      ],
    })

    // MX record so the world knows where to send paddlesnitch.com mail.
    // priority 10 is conventional for a single MX target.
    new route53.MxRecord(this, 'InboundMx', {
      zone: hostedZone,
      recordName: 'paddlesnitch.com.',
      values: [{ priority: 10, hostName: `inbound-smtp.${this.region}.amazonaws.com` }],
      ttl: cdk.Duration.minutes(30),
    })

    new cdk.CfnOutput(this, 'ReceiptRuleSetName', {
      value: ruleSet.receiptRuleSetName,
      description: 'Run `aws ses set-active-receipt-rule-set --rule-set-name <this> --region eu-west-1` once to activate.',
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
