// Unit tests for the Cognito Custom Auth Lambda triggers.
//
// The handlers are pure functions (modulo the SES call in CreateAuthChallenge,
// which we route through LOCAL_DEV mode to a no-op). Calling them directly
// gives us confidence about the state machine and the verification logic
// without needing cognito-local to support CUSTOM_AUTH.
import { describe, it, expect, beforeEach } from 'vitest'
import { handler as defineAuth } from '../../infra/lambdas/cognito-auth/define-auth-challenge.mjs'
import { handler as createAuth } from '../../infra/lambdas/cognito-auth/create-auth-challenge.mjs'
import { handler as verifyAuth } from '../../infra/lambdas/cognito-auth/verify-auth-challenge.mjs'

beforeEach(() => {
  process.env.LOCAL_DEV = 'true'
  delete process.env.LOCAL_OTP_DIR
})

type SessionEntry = { challengeName: string; challengeResult: boolean }
type ChallengeEvent = {
  request: {
    session: SessionEntry[]
    userAttributes: Record<string, string>
    privateChallengeParameters: Record<string, string>
    challengeAnswer: string
  }
  response: Record<string, unknown>
}
function blank(): ChallengeEvent {
  return {
    request: { session: [], userAttributes: { email: 'alice@example.com' }, privateChallengeParameters: {}, challengeAnswer: '' },
    response: {},
  }
}

describe('DefineAuthChallenge', () => {
  it('issues CUSTOM_CHALLENGE on first call (empty session)', async () => {
    const event = blank()
    const out = await defineAuth(event)
    expect(out.response.issueTokens).toBe(false)
    expect(out.response.failAuthentication).toBe(false)
    expect(out.response.challengeName).toBe('CUSTOM_CHALLENGE')
  })

  it('issues tokens when the last challenge was answered correctly', async () => {
    const event = blank()
    event.request.session = [{ challengeName: 'CUSTOM_CHALLENGE', challengeResult: true }]
    const out = await defineAuth(event)
    expect(out.response.issueTokens).toBe(true)
    expect(out.response.failAuthentication).toBe(false)
  })

  it('fails after 3 wrong answers', async () => {
    const event = blank()
    event.request.session = [
      { challengeName: 'CUSTOM_CHALLENGE', challengeResult: false },
      { challengeName: 'CUSTOM_CHALLENGE', challengeResult: false },
      { challengeName: 'CUSTOM_CHALLENGE', challengeResult: false },
    ]
    const out = await defineAuth(event)
    expect(out.response.issueTokens).toBe(false)
    expect(out.response.failAuthentication).toBe(true)
  })

  it('issues another challenge after a single wrong answer (retry allowed)', async () => {
    const event = blank()
    event.request.session = [{ challengeName: 'CUSTOM_CHALLENGE', challengeResult: false }]
    const out = await defineAuth(event)
    expect(out.response.challengeName).toBe('CUSTOM_CHALLENGE')
    expect(out.response.failAuthentication).toBe(false)
  })
})

describe('CreateAuthChallenge', () => {
  it('generates a 6-digit code and exposes only the email publicly', async () => {
    const event = blank()
    const out = await createAuth(event)
    const priv = out.response.privateChallengeParameters as { otp: string }
    expect(priv.otp).toMatch(/^\d{6}$/)
    expect(out.response.publicChallengeParameters).toEqual({ email: 'alice@example.com' })
  })

  it('throws when user has no email attribute', async () => {
    const event = blank()
    event.request.userAttributes = {}
    await expect(createAuth(event)).rejects.toThrow(/email/i)
  })
})

describe('VerifyAuthChallengeResponse', () => {
  it('accepts a matching answer', async () => {
    const event = blank()
    event.request.privateChallengeParameters = { otp: '123456' }
    event.request.challengeAnswer = '123456'
    const out = await verifyAuth(event)
    expect(out.response.answerCorrect).toBe(true)
  })

  it('rejects a non-matching answer', async () => {
    const event = blank()
    event.request.privateChallengeParameters = { otp: '123456' }
    event.request.challengeAnswer = '654321'
    const out = await verifyAuth(event)
    expect(out.response.answerCorrect).toBe(false)
  })

  it('trims whitespace from the submitted answer', async () => {
    const event = blank()
    event.request.privateChallengeParameters = { otp: '123456' }
    event.request.challengeAnswer = ' 123456 '
    const out = await verifyAuth(event)
    expect(out.response.answerCorrect).toBe(true)
  })

  it('rejects when the expected code is missing', async () => {
    const event = blank()
    event.request.challengeAnswer = '123456'
    const out = await verifyAuth(event)
    expect(out.response.answerCorrect).toBe(false)
  })
})
