// Email templates for club invitations. Kept separate from email.ts so
// the SES wiring stays generic and the wording is easy to grep when
// product wants to tweak it.

import type { ClubMetadata } from './types'

type Args = {
  club: ClubMetadata
  inviterName: string
  baseUrl: string
  role: 'admin' | 'member'
}

// Sign-up invite — recipient does not yet have an account. The
// `?next=/att/clubs/{clubId}` query param tells the auth page where to
// send them once they've signed up; the signup handler converts the
// pending invite to a real membership automatically (see
// applyPendingInvitations in src/lib/pending-invitations.ts), so by the
// time they hit the club page they're already a member.
export function pendingInviteEmail({ club, inviterName, baseUrl, role }: Args) {
  const signupUrl = new URL('/att/auth', baseUrl)
  signupUrl.searchParams.set('next', `/att/clubs/${club.id}`)
  signupUrl.searchParams.set('signup', '1')

  const subject = `${inviterName} invited you to join ${club.name} on paddlesnitch`
  const text = [
    `${inviterName} has invited you to join ${club.name} on paddlesnitch.com${role === 'admin' ? ' as an admin' : ''}.`,
    '',
    'paddlesnitch is a GPS-verified time-trial service for kayak and rowing crews. Clubs use it to run regular sprints and longer head-races without a stopwatch.',
    '',
    'Create your account here:',
    signupUrl.toString(),
    '',
    'Once signed up you\'ll join the club automatically. The invitation expires in 30 days.',
    '',
    'If you don\'t know the person who invited you, you can safely ignore this email — your address won\'t be added to anything.',
  ].join('\n')

  return { subject, text }
}

// Already-an-account invite. Link straight to the club page; the proxy
// will bounce them through sign-in if their session has lapsed.
export function existingAccountInviteEmail({ club, inviterName, baseUrl, role }: Args) {
  const url = new URL(`/att/clubs/${club.id}`, baseUrl).toString()
  const subject = `${inviterName} invited you to join ${club.name} on paddlesnitch`
  const text = [
    `${inviterName} has invited you to join ${club.name} on paddlesnitch.com${role === 'admin' ? ' as an admin' : ''}.`,
    '',
    'Open the club to accept:',
    url,
    '',
    'The invitation expires in 30 days.',
  ].join('\n')

  return { subject, text }
}
