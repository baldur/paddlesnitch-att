import path from 'path'
import fs from 'fs/promises'

// Both helpers read env vars at call time so tests can set DATA_DIR / USE_LOCAL_STORAGE in beforeEach
function localRoot() {
  return process.env.DATA_DIR ?? path.join(process.cwd(), '.local-data')
}
function isDev() {
  return process.env.NODE_ENV === 'development' || process.env.USE_LOCAL_STORAGE === 'true'
}

// In dev: filesystem under .local-data/
// In prod: S3 (same interface, different backing)

export async function getObject(key: string): Promise<Buffer | null> {
  if (isDev()) {
    const filePath = path.join(localRoot(), key)
    try {
      return await fs.readFile(filePath)
    } catch {
      return null
    }
  }
  const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3')
  const s3 = new S3Client({})
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: process.env.DATA_BUCKET!, Key: key }))
    const chunks: Uint8Array[] = []
    for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk)
    }
    return Buffer.concat(chunks)
  } catch {
    return null
  }
}

export async function putObject(key: string, body: Buffer | string): Promise<void> {
  if (isDev()) {
    const filePath = path.join(localRoot(), key)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, body)
    return
  }
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3')
  const s3 = new S3Client({})
  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.DATA_BUCKET!,
      Key: key,
      Body: body,
      ContentType: typeof body === 'string' ? 'application/json' : 'application/octet-stream',
    })
  )
}

export async function listKeys(prefix: string): Promise<string[]> {
  if (isDev()) {
    const dir = path.join(localRoot(), prefix)
    try {
      return (await fs.readdir(dir, { recursive: true }))
        .filter(f => !f.includes('/') || true) // include nested
        .map(f => path.join(prefix, f).replace(/\\/g, '/'))
    } catch {
      return []
    }
  }
  const { S3Client, ListObjectsV2Command } = await import('@aws-sdk/client-s3')
  const s3 = new S3Client({})
  const res = await s3.send(
    new ListObjectsV2Command({ Bucket: process.env.DATA_BUCKET!, Prefix: prefix })
  )
  return (res.Contents ?? []).map(o => o.Key!).filter(Boolean)
}

export async function deleteObject(key: string): Promise<void> {
  if (isDev()) {
    const filePath = path.join(localRoot(), key)
    try {
      await fs.unlink(filePath)
    } catch {
      // ignore — already gone
    }
    return
  }
  const { S3Client, DeleteObjectCommand } = await import('@aws-sdk/client-s3')
  const s3 = new S3Client({})
  await s3.send(new DeleteObjectCommand({ Bucket: process.env.DATA_BUCKET!, Key: key }))
}

export async function getJson<T>(key: string): Promise<T | null> {
  const buf = await getObject(key)
  if (!buf) return null
  return JSON.parse(buf.toString('utf8')) as T
}

export async function putJson(key: string, value: unknown): Promise<void> {
  await putObject(key, JSON.stringify(value, null, 2))
}
