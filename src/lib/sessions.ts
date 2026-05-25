import { getJson, putJson, deleteObject } from './storage'
import { nanoid } from 'nanoid'

export const SESSION_COOKIE = 'tt_session'

type StoredSession = {
  userId: string
  createdAt: string
}

export async function createSession(userId: string): Promise<string> {
  const token = nanoid(32)
  await putJson(`sessions/${token}.json`, {
    userId,
    createdAt: new Date().toISOString(),
  })
  return token
}

export async function getSession(token: string): Promise<StoredSession | null> {
  if (!token) return null
  return getJson<StoredSession>(`sessions/${token}.json`)
}

export async function deleteSession(token: string): Promise<void> {
  await deleteObject(`sessions/${token}.json`)
}
