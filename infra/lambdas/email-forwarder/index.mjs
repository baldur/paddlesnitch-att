// SES-triggered email forwarder.
//
// Picks up inbound emails that landed via the SES receipt rule, reads
// the raw MIME from S3, and re-sends it to FORWARD_TO via SES so the
// recipient (the human running the inbox) gets the actual message
// content in their normal Gmail.
//
// DKIM rules require the `From:` address to be a verified identity in
// our SES account. We therefore rewrite From to noreply@paddlesnitch.com
// and set Reply-To to the original sender so replies from FORWARD_TO go
// back to the right person.
//
// Subject is prefixed with [paddlesnitch] for easy filtering on the
// receiving side.

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { SESClient, SendRawEmailCommand } from '@aws-sdk/client-ses'

const s3 = new S3Client({})
const ses = new SESClient({})

// Env vars are read at handler entry (NOT module load) so importing this
// file from a test environment doesn't throw. Each invocation reads the
// fresh values; Lambda caches them across warm invocations naturally.
function cfg() {
  const BUCKET = process.env.INBOUND_BUCKET
  const FORWARD_TO = process.env.FORWARD_TO
  if (!BUCKET) throw new Error('INBOUND_BUCKET env var is required')
  if (!FORWARD_TO) throw new Error('FORWARD_TO env var is required')
  return {
    BUCKET,
    PREFIX: process.env.INBOUND_PREFIX ?? 'inbound-email/privacy/',
    FROM: process.env.FROM_EMAIL ?? 'noreply@paddlesnitch.com',
    FORWARD_TO,
    SUBJECT_PREFIX: process.env.SUBJECT_PREFIX ?? '[paddlesnitch]',
  }
}

async function bodyToString(stream) {
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

// Tiny MIME header parser. We don't need full RFC 5322 — just enough to
// pull out From / Subject / Message-ID and split headers from body.
function parseHeaders(raw) {
  // Headers end at the first blank line. Folded headers (continuation
  // lines that start with whitespace) are unfolded into a single value.
  const sep = raw.indexOf('\r\n\r\n')
  const headerBlock = sep === -1 ? raw : raw.slice(0, sep)
  const lines = headerBlock.split('\r\n')
  const headers = {}
  let current = null
  for (const line of lines) {
    if (/^\s/.test(line) && current) {
      // Continuation of the previous header.
      headers[current] += ' ' + line.trim()
      continue
    }
    const colon = line.indexOf(':')
    if (colon === -1) continue
    const name = line.slice(0, colon).trim().toLowerCase()
    const value = line.slice(colon + 1).trim()
    headers[name] = headers[name] ? `${headers[name]}, ${value}` : value
    current = name
  }
  return headers
}

// Builds a fresh MIME message instead of attempting to surgically edit
// the original — that's easier to get right than trying to preserve
// every header through the rewrite. The original raw content is
// included as a quoted block at the bottom so nothing is lost.
//
// `opts` lets the test pass overrides without setting process.env; in
// the handler we read defaults from cfg().
function buildForwardedMime(
  { headers, rawBody, originalRaw },
  opts = {},
) {
  const FROM = opts.FROM ?? process.env.FROM_EMAIL ?? 'noreply@paddlesnitch.com'
  const FORWARD_TO = opts.FORWARD_TO ?? process.env.FORWARD_TO ?? 'unknown@example.com'
  const SUBJECT_PREFIX = opts.SUBJECT_PREFIX ?? process.env.SUBJECT_PREFIX ?? '[paddlesnitch]'

  const originalFrom = headers.from ?? 'unknown sender'
  const originalSubject = headers.subject ?? '(no subject)'
  const originalDate = headers.date ?? new Date().toUTCString()
  const replyTo = headers['reply-to'] ?? headers.from ?? ''

  // The body we want to forward is whatever came after the header
  // block. We pass it through as-is — Content-Type from the original
  // is intentionally dropped so Gmail renders it as plain text and we
  // don't have to handle multipart boundaries here.
  const bodyText = [
    `Forwarded from ${originalFrom}`,
    `Date: ${originalDate}`,
    `Subject: ${originalSubject}`,
    '',
    '-----------------------------------------------------',
    '',
    rawBody.trim(),
    '',
    '-----------------------------------------------------',
    '(Forwarded by paddlesnitch.com privacy@ alias.)',
  ].join('\r\n')

  const lines = [
    `From: ${FROM}`,
    `To: ${FORWARD_TO}`,
    replyTo ? `Reply-To: ${replyTo}` : null,
    `Subject: ${SUBJECT_PREFIX} ${originalSubject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    bodyText,
  ].filter(Boolean)
  return lines.join('\r\n')
}

export const handler = async (event) => {
  const { BUCKET, PREFIX, FROM, FORWARD_TO, SUBJECT_PREFIX } = cfg()
  // SES delivers a payload with one or more receipt records. For each,
  // pull the messageId, find the matching S3 object, and forward.
  for (const record of event.Records ?? []) {
    const messageId = record.ses?.mail?.messageId
    if (!messageId) {
      console.warn('[email-forwarder] no messageId on record, skipping')
      continue
    }
    const key = `${PREFIX}${messageId}`
    console.log(`[email-forwarder] forwarding ${key} -> ${FORWARD_TO}`)
    let raw
    try {
      const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }))
      raw = await bodyToString(obj.Body)
    } catch (err) {
      console.error('[email-forwarder] could not read S3 object', err)
      continue
    }
    const headers = parseHeaders(raw)
    const sep = raw.indexOf('\r\n\r\n')
    const rawBody = sep === -1 ? '' : raw.slice(sep + 4)
    const rewrittenMime = buildForwardedMime(
      { headers, rawBody, originalRaw: raw },
      { FROM, FORWARD_TO, SUBJECT_PREFIX },
    )

    try {
      await ses.send(new SendRawEmailCommand({
        RawMessage: { Data: Buffer.from(rewrittenMime, 'utf8') },
        Source: FROM,
        Destinations: [FORWARD_TO],
      }))
    } catch (err) {
      console.error('[email-forwarder] SES send failed', err)
      // Don't rethrow — keep processing the remaining records. The
      // raw email is still in S3 if a human needs to dig it out.
    }
  }
  return { ok: true }
}

// Exported for unit tests; not used in the runtime path.
export const __test__ = { parseHeaders, buildForwardedMime }
