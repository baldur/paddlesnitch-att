import { readFile } from 'fs/promises'
import { join } from 'path'

// Reads the OTP code the lambda-emulator wrote for a particular email after
// a Custom Auth challenge was created. Retries a few times to dodge the
// race between "API returned the session" and "lambda finished writing file."
export async function readOtpCode(email: string): Promise<string | null> {
  const dir = process.env.LOCAL_OTP_DIR
  if (!dir) return null
  const filename = join(dir, encodeURIComponent(email))
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const raw = await readFile(filename, 'utf8')
      if (raw.trim()) return raw.trim()
    } catch {}
    await new Promise(r => setTimeout(r, 25))
  }
  return null
}

// Reads the most recent ConfirmationCode stored for a user in the test
// cognito-local db. Real Cognito never returns codes; cognito-local stores
// them on the user record so tests can simulate "user got the email."
//
// Relies on COGNITO_LOCAL_DB_DIR being set by global-setup.ts.
export async function readConfirmationCode(email: string): Promise<string | null> {
  const dbDir = process.env.COGNITO_LOCAL_DB_DIR
  const poolId = process.env.COGNITO_USER_POOL_ID
  if (!dbDir || !poolId) return null

  const dbPath = join(dbDir, '.cognito', 'db', `${poolId}.json`)
  // Retry on read/parse failure — cognito-local can be mid-write when we
  // peek (file truncated + rewritten as separate ops).
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const raw = await readFile(dbPath, 'utf8')
      if (!raw.trim()) throw new Error('empty')
      const db = JSON.parse(raw) as {
        Users?: Record<string, { Attributes?: Array<{ Name: string; Value: string }>; ConfirmationCode?: string }>
      }
      for (const u of Object.values(db.Users ?? {})) {
        const userEmail = u.Attributes?.find(a => a.Name === 'email')?.Value
        if (userEmail === email && u.ConfirmationCode) return u.ConfirmationCode
      }
      return null
    } catch {
      await new Promise(r => setTimeout(r, 25))
    }
  }
  return null
}
