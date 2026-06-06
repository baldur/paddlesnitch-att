import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'

// Customer feedback endpoint. Posts a new issue to the GitHub repo with the
// `customer-reported` and `triage` labels. The submitter doesn't need a
// GitHub account; we authenticate to GitHub server-side with a fine-grained
// PAT held in the GITHUB_ISSUES_TOKEN env var (sourced from SSM in CDK).
//
// Capturing context is deliberate: every report gets URL, user agent,
// viewport, signed-in user (if any), and a timestamp. Saves us from
// "can you reproduce" pings.

const MIN_DESCRIPTION_CHARS = 10
const MAX_DESCRIPTION_CHARS = 5000

type FeedbackBody = {
  description?: unknown
  email?: unknown
  url?: unknown
  userAgent?: unknown
  viewport?: unknown
}

function asString(value: unknown, max?: number): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  return max ? trimmed.slice(0, max) : trimmed
}

export async function POST(req: NextRequest) {
  // Env read at call-time, not module-load, so tests can flip the value
  // in beforeEach without re-importing.
  const token = process.env.GITHUB_ISSUES_TOKEN
  const repo = process.env.GITHUB_REPO ?? 'baldur/paddlesnitch-att'
  if (!token) {
    // No token configured (e.g. local dev without secrets). Don't 500 the
    // user — surface a clear status so the widget can tell them.
    return NextResponse.json(
      { error: 'Feedback endpoint not configured on this environment.' },
      { status: 503 },
    )
  }

  const body = (await req.json().catch(() => ({}))) as FeedbackBody
  const description = asString(body.description, MAX_DESCRIPTION_CHARS)
  if (description.length < MIN_DESCRIPTION_CHARS) {
    return NextResponse.json(
      { error: `Please write at least ${MIN_DESCRIPTION_CHARS} characters describing what went wrong.` },
      { status: 400 },
    )
  }
  const submitterEmail = asString(body.email, 200)
  const url = asString(body.url, 500)
  const userAgent = asString(body.userAgent, 500)
  const viewport = asString(body.viewport, 50)

  // Pull signed-in user if there is one — better than relying on the client
  // to tell us, and the auth cookie's already on the request.
  const user = await getAuthUser()

  // First non-empty line becomes the title, capped.
  const firstLine = description.split('\n')[0].trim().slice(0, 80)
  const title = `[customer] ${firstLine}`

  const reporter = user
    ? `${user.displayName} <${user.email}> (account ${user.id})`
    : submitterEmail
      ? `${submitterEmail} (no account)`
      : 'anonymous'

  const issueBody = [
    description,
    '',
    '---',
    '**Auto-captured context:**',
    `- Page: ${url || '(unknown)'}`,
    `- Reporter: ${reporter}`,
    `- Viewport: ${viewport || '(unknown)'}`,
    `- User agent: ${userAgent || '(unknown)'}`,
    `- Reported at: ${new Date().toISOString()}`,
  ].join('\n')

  const ghRes = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title,
      body: issueBody,
      labels: ['customer-reported', 'triage'],
    }),
  })

  if (!ghRes.ok) {
    // Don't leak GitHub error details to the customer — they can't act on it.
    return NextResponse.json(
      { error: 'Sorry, we could not file your report. Please try again later.' },
      { status: 502 },
    )
  }

  const issue = (await ghRes.json()) as { number: number; html_url: string }
  return NextResponse.json({ ok: true, issueNumber: issue.number, url: issue.html_url })
}
