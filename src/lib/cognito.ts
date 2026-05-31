import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  AdminConfirmSignUpCommand,
  InitiateAuthCommand,
  RevokeTokenCommand,
  UsernameExistsException,
  NotAuthorizedException,
  UserNotFoundException,
  InvalidPasswordException,
} from '@aws-sdk/client-cognito-identity-provider'
import { JwtRsaVerifier } from 'aws-jwt-verify'
import { SimpleJwksCache } from 'aws-jwt-verify/jwk'
import type { AuthUser } from './types'

const REGION = process.env.COGNITO_REGION ?? 'eu-west-1'
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID ?? ''
const CLIENT_ID = process.env.COGNITO_CLIENT_ID ?? ''
const ENDPOINT = process.env.COGNITO_ENDPOINT

function makeClient(): CognitoIdentityProviderClient {
  return new CognitoIdentityProviderClient({
    region: REGION,
    ...(ENDPOINT ? {
      endpoint: ENDPOINT,
      credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
    } : {}),
  })
}

// Tiny fetcher that supports http:// (for cognito-local) AND https:// (for real Cognito).
// aws-jwt-verify's default fetcher rejects http://, so we wrap native fetch instead.
class HttpJwksFetcher {
  async fetch(uri: string): Promise<ArrayBuffer> {
    const res = await fetch(uri)
    if (!res.ok) throw new Error(`JWKS fetch failed (${res.status}) for ${uri}`)
    return res.arrayBuffer()
  }
}

// JWT verifier is lazily created (and cached) so tests can swap env vars.
// Uses generic JwtRsaVerifier so cognito-local's custom issuer (http://localhost:9229/<poolId>)
// works alongside real AWS Cognito (https://cognito-idp.<region>.amazonaws.com/<poolId>).
let _verifier: ReturnType<typeof JwtRsaVerifier.create> | null = null
function getVerifier() {
  if (_verifier) return _verifier
  const issuer = ENDPOINT
    ? `${ENDPOINT}/${USER_POOL_ID}`
    : `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}`
  _verifier = JwtRsaVerifier.create(
    {
      issuer,
      audience: CLIENT_ID,
      jwksUri: `${issuer}/.well-known/jwks.json`,
    },
    { jwksCache: new SimpleJwksCache({ fetcher: new HttpJwksFetcher() }) }
  )
  return _verifier
}

export type TokenPair = {
  idToken: string
  refreshToken: string
}

export type CognitoError =
  | 'email_exists'
  | 'invalid_credentials'
  | 'invalid_password'
  | 'user_not_found'
  | 'unknown'

function classify(err: unknown): CognitoError {
  if (err instanceof UsernameExistsException) return 'email_exists'
  if (err instanceof InvalidPasswordException) return 'invalid_password'
  if (err instanceof NotAuthorizedException) return 'invalid_credentials'
  if (err instanceof UserNotFoundException) return 'invalid_credentials'
  return 'unknown'
}

export async function signUp(
  email: string,
  displayName: string,
  password: string
): Promise<{ sub: string } | { error: CognitoError }> {
  const client = makeClient()
  try {
    const res = await client.send(new SignUpCommand({
      ClientId: CLIENT_ID,
      Username: email,
      Password: password,
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'name', Value: displayName },
      ],
    }))
    // Auto-confirm so the user can sign in immediately. v1 has no email verification.
    await client.send(new AdminConfirmSignUpCommand({
      UserPoolId: USER_POOL_ID,
      Username: email,
    }))
    return { sub: res.UserSub! }
  } catch (err) {
    return { error: classify(err) }
  }
}

export async function signIn(
  email: string,
  password: string
): Promise<TokenPair | { error: CognitoError }> {
  const client = makeClient()
  try {
    const res = await client.send(new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: CLIENT_ID,
      AuthParameters: { USERNAME: email, PASSWORD: password },
    }))
    const auth = res.AuthenticationResult
    if (!auth?.IdToken || !auth?.RefreshToken) {
      return { error: 'unknown' }
    }
    return { idToken: auth.IdToken, refreshToken: auth.RefreshToken }
  } catch (err) {
    return { error: classify(err) }
  }
}

export async function refresh(
  refreshToken: string
): Promise<{ idToken: string } | { error: CognitoError }> {
  const client = makeClient()
  try {
    const res = await client.send(new InitiateAuthCommand({
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      ClientId: CLIENT_ID,
      AuthParameters: { REFRESH_TOKEN: refreshToken },
    }))
    const idToken = res.AuthenticationResult?.IdToken
    if (!idToken) return { error: 'invalid_credentials' }
    return { idToken }
  } catch (err) {
    return { error: classify(err) }
  }
}

export async function revoke(refreshToken: string): Promise<void> {
  const client = makeClient()
  try {
    await client.send(new RevokeTokenCommand({
      ClientId: CLIENT_ID,
      Token: refreshToken,
    }))
  } catch {
    // Best effort — revocation failures shouldn't block logout.
  }
}

export async function verifyIdToken(idToken: string): Promise<AuthUser | null> {
  try {
    const claims = await getVerifier().verify(idToken)
    if (claims.token_use !== 'id') return null
    const email = typeof claims.email === 'string' ? claims.email : ''
    // Real Cognito sends `name` in the ID token when standard attributes are configured;
    // cognito-local does not. Fall back to email's local part so dev still has a name.
    const name = typeof claims.name === 'string' && claims.name
      ? claims.name
      : email.split('@')[0]
    return {
      id: String(claims.sub),
      email,
      displayName: name,
    }
  } catch {
    return null
  }
}
