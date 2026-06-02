// Cognito Custom Auth: DefineAuthChallenge trigger.
//
// The "controller" for the OTP flow. Cognito invokes us with the session
// history; we decide what to do next:
//   - No challenges yet → issue CUSTOM_CHALLENGE so CreateAuthChallenge runs
//   - Last response was correct → issue tokens, done
//   - Three wrong tries → fail authentication
//   - Otherwise → issue another CUSTOM_CHALLENGE (let them retry)

export const handler = async (event) => {
  const session = event.request.session ?? []

  if (session.length === 0) {
    event.response.issueTokens = false
    event.response.failAuthentication = false
    event.response.challengeName = 'CUSTOM_CHALLENGE'
    return event
  }

  const last = session[session.length - 1]
  if (last.challengeName === 'CUSTOM_CHALLENGE' && last.challengeResult === true) {
    event.response.issueTokens = true
    event.response.failAuthentication = false
    return event
  }

  // Allow up to 3 attempts. Each attempt is one entry in session.
  if (session.length >= 3) {
    event.response.issueTokens = false
    event.response.failAuthentication = true
    return event
  }

  event.response.issueTokens = false
  event.response.failAuthentication = false
  event.response.challengeName = 'CUSTOM_CHALLENGE'
  return event
}
