import { nanoid } from 'nanoid'
import { putJson, getJson, deleteObject } from './storage'

type MagicToken = { email: string; createdAt: string; expiresAt: string }

export async function createMagicToken(email: string): Promise<string> {
  const token = nanoid(32)
  const now = new Date()
  const expiresAt = new Date(now.getTime() + 15 * 60 * 1000) // 15 min
  await putJson(`magic-tokens/${token}.json`, {
    email,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  })
  return token
}

export async function verifyMagicToken(token: string): Promise<string | null> {
  const data = await getJson<MagicToken>(`magic-tokens/${token}.json`)
  if (!data) return null
  if (new Date() > new Date(data.expiresAt)) {
    await deleteObject(`magic-tokens/${token}.json`)
    return null
  }
  await deleteObject(`magic-tokens/${token}.json`) // single use
  return data.email
}
