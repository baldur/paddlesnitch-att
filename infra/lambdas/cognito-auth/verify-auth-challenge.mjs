// Cognito Custom Auth: VerifyAuthChallengeResponse trigger.
//
// Cognito hands us the user's submitted answer and the server-side expected
// code (from privateChallengeParameters set by CreateAuthChallenge). We just
// compare.

export const handler = async (event) => {
  const expected = event.request.privateChallengeParameters?.otp
  const submitted = event.request.challengeAnswer

  event.response.answerCorrect = typeof expected === 'string'
    && typeof submitted === 'string'
    && expected === submitted.trim()
  return event
}
