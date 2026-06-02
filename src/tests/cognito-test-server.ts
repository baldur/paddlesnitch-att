import { spawn, ChildProcess } from 'child_process'
import { mkdtemp, rm, mkdir, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { createRequire } from 'module'
import {
  CognitoIdentityProviderClient,
  CreateUserPoolCommand,
  CreateUserPoolClientCommand,
} from '@aws-sdk/client-cognito-identity-provider'

const require = createRequire(import.meta.url)

export type TestPoolHandle = {
  endpoint: string
  userPoolId: string
  clientId: string
  dataDir: string
  proc: ChildProcess
}

async function waitForReady(proc: ChildProcess, port: number, timeoutMs = 10000): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => {
      reject(new Error(`cognito-local did not become ready on :${port} within ${timeoutMs}ms`))
    }, timeoutMs)
    let buffer = ''
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString()
      if (buffer.includes('Cognito Local running on')) {
        clearTimeout(t)
        proc.stdout?.off('data', onData)
        resolve()
      }
    }
    proc.stdout?.on('data', onData)
    proc.on('error', err => { clearTimeout(t); reject(err) })
    proc.on('exit', code => { clearTimeout(t); reject(new Error(`cognito-local exited (${code}); output: ${buffer}`)) })
  })
}

export async function startCognito(port: number): Promise<TestPoolHandle> {
  const dataDir = await mkdtemp(join(tmpdir(), 'cognito-test-'))
  const endpoint = `http://localhost:${port}`

  // Override IssuerDomain so JWTs claim the test port, matching what aws-jwt-verify expects.
  await mkdir(join(dataDir, '.cognito'), { recursive: true })
  await writeFile(
    join(dataDir, '.cognito', 'config.json'),
    JSON.stringify({ TokenConfig: { IssuerDomain: endpoint } })
  )

  const proc = spawn(
    'node',
    [require.resolve('cognito-local/lib/bin/start.js')],
    {
      env: { ...process.env, COGNITO_LOCAL_DEVMODE: '1', PORT: String(port) },
      cwd: dataDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  )

  await waitForReady(proc, port)

  const client = new CognitoIdentityProviderClient({
    endpoint,
    region: 'eu-west-1',
    credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
  })

  const pool = await client.send(new CreateUserPoolCommand({
    PoolName: 'atts-test',
    AutoVerifiedAttributes: ['email'],
    UsernameAttributes: ['email'],
    // Schema intentionally omitted — let cognito-local use Cognito's default
    // attribute set (including email_verified). With an explicit Schema, the
    // AdminUpdateUserAttributes call to set email_verified=true at signup
    // fails because the attribute isn't declared.
  }))
  const userPoolId = pool.UserPool!.Id!

  const poolClient = await client.send(new CreateUserPoolClientCommand({
    UserPoolId: userPoolId,
    ClientName: 'atts-web-test',
    GenerateSecret: false,
    ExplicitAuthFlows: [
      'ALLOW_USER_PASSWORD_AUTH',
      'ALLOW_ADMIN_USER_PASSWORD_AUTH',
      'ALLOW_REFRESH_TOKEN_AUTH',
    ],
  }))
  const clientId = poolClient.UserPoolClient!.ClientId!

  return { endpoint, userPoolId, clientId, dataDir, proc }
}

export async function stopCognito(handle: TestPoolHandle): Promise<void> {
  handle.proc.kill('SIGTERM')
  await new Promise(r => setTimeout(r, 200))
  if (!handle.proc.killed) handle.proc.kill('SIGKILL')
  await rm(handle.dataDir, { recursive: true, force: true })
}

// Reads the most recent ConfirmationCode stored on a user in cognito-local's
// db. Used in tests to simulate "user gets the email and types the code in" —
// real Cognito never returns the code over the API, but cognito-local persists
// it as a user attribute so tests can grab it.
//
// Returns null if the user has no pending confirmation.
export async function readResetCode(handle: TestPoolHandle, email: string): Promise<string | null> {
  const { readFile } = await import('fs/promises')
  const dbPath = join(handle.dataDir, '.cognito', 'db', `${handle.userPoolId}.json`)
  let raw: string
  try { raw = await readFile(dbPath, 'utf8') } catch { return null }
  const db = JSON.parse(raw) as {
    Users?: Record<string, { Attributes?: Array<{ Name: string; Value: string }>; ConfirmationCode?: string }>
  }
  const users = db.Users ?? {}
  for (const u of Object.values(users)) {
    const userEmail = u.Attributes?.find(a => a.Name === 'email')?.Value
    if (userEmail === email && u.ConfirmationCode) return u.ConfirmationCode
  }
  return null
}
