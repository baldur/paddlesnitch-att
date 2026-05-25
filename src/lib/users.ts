import { getJson, putJson, listKeys } from './storage'
import { createHmac } from 'crypto'
import { nanoid } from 'nanoid'

export type StoredUser = {
  id: string
  email: string
  displayName: string
  passwordHash: string
  createdAt: string
}

function hashPassword(password: string): string {
  return createHmac('sha256', 'tt-local-auth').update(password).digest('hex')
}

export async function createUser(
  email: string,
  displayName: string,
  password: string
): Promise<StoredUser | { error: string }> {
  const existing = await findUserByEmail(email)
  if (existing) return { error: 'Email already in use' }

  const user: StoredUser = {
    id: nanoid(),
    email: email.toLowerCase().trim(),
    displayName: displayName.trim(),
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
  }
  await putJson(`users/${user.id}.json`, user)
  return user
}

export async function findUserByEmail(email: string): Promise<StoredUser | null> {
  const normalised = email.toLowerCase().trim()
  const keys = await listKeys('users/')
  for (const key of keys.filter(k => k.endsWith('.json'))) {
    const user = await getJson<StoredUser>(key)
    if (user?.email === normalised) return user
  }
  return null
}

export async function findUserById(id: string): Promise<StoredUser | null> {
  return getJson<StoredUser>(`users/${id}.json`)
}

export async function verifyPassword(
  email: string,
  password: string
): Promise<StoredUser | null> {
  const user = await findUserByEmail(email)
  if (!user) return null
  if (user.passwordHash !== hashPassword(password)) return null
  return user
}
