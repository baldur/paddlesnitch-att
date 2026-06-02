// Cognito Custom Auth: CreateAuthChallenge trigger.
//
// Generates the 6-digit code, stashes it in privateChallengeParameters (only
// the server sees this), and emails it to the user via SES. Real Cognito
// users never see the code over the API; they only get it in the email.
//
// In local dev (LOCAL_DEV=true), we skip the SES call and log the code so
// the developer can grab it from the cognito-local console / db file.

import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'

function generateCode() {
  // 6 digits, padded with leading zeros if needed. Math.random is fine here —
  // Cognito's session id is the unguessable thing; the code is just one of
  // 10**6 possibilities verified server-side.
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')
}

async function sendCode(email, code) {
  // Read env vars at call-time, not module-load-time, so tests can flip
  // LOCAL_DEV in beforeEach without re-importing.
  const FROM_EMAIL = process.env.FROM_EMAIL ?? 'noreply@paddlesnitch.com'
  const LOCAL_DEV = process.env.LOCAL_DEV === 'true'

  if (LOCAL_DEV) {
    // In dev, log it AND write it to a known path so the test harness can
    // pick it up. Tests and the dev console both want visibility.
    console.log(`[create-auth-challenge] OTP for ${email}: ${code}`)
    const dir = process.env.LOCAL_OTP_DIR
    if (dir) {
      const fs = await import('fs/promises')
      const path = await import('path')
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(path.join(dir, encodeURIComponent(email)), code, 'utf8')
    }
    return
  }
  const ses = new SESClient({ region: process.env.AWS_REGION ?? 'eu-west-1' })
  await ses.send(new SendEmailCommand({
    Source: FROM_EMAIL,
    Destination: { ToAddresses: [email] },
    Message: {
      Subject: { Data: 'Your paddlesnitch.com sign-in code' },
      Body: {
        Text: {
          Data: [
            `Your one-time sign-in code is: ${code}`,
            '',
            'This code expires in 5 minutes. If you did not request this, you can safely ignore this email — no one can sign in without the code.',
            '',
            'paddlesnitch.com — GPS-verified time trials for kayak & rowing.',
          ].join('\n'),
        },
      },
    },
  }))
}

export const handler = async (event) => {
  const email = event.request.userAttributes.email
  if (!email) {
    throw new Error('CreateAuthChallenge: user has no email attribute')
  }

  const code = generateCode()
  await sendCode(email, code)

  event.response.publicChallengeParameters = { email }
  event.response.privateChallengeParameters = { otp: code }
  // challengeMetadata is exposed back to DefineAuthChallenge so it can see
  // which round this is, if needed. Not used right now.
  event.response.challengeMetadata = 'OTP_EMAIL'
  return event
}
