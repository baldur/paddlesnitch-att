// The official Strava-branded sign-in / connect button. Strava's brand
// guidelines require their exact button artwork for any auth/connect action —
// so we render the supplied image as-is (never restyle it) and just wrap it in
// the link that kicks off the relevant OAuth flow. Swap the placeholder SVGs in
// public/strava/ for the official downloads to be fully compliant (#107).
export default function StravaButton({
  variant,
  href,
  className,
}: {
  // 'login' → "Sign in with Strava" (account creation / sign-in)
  // 'connect' → "Connect with Strava" (linking Strava to an existing account)
  variant: 'login' | 'connect'
  href: string
  className?: string
}) {
  const src = variant === 'login' ? '/strava/sign-in-with-strava.svg' : '/strava/connect-with-strava.svg'
  const label = variant === 'login' ? 'Sign in with Strava' : 'Connect with Strava'
  return (
    <a href={href} aria-label={label} className={`inline-block ${className ?? ''}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- brand asset served
          as-is from public/; next/image would restyle/optimise it, which Strava's
          guidelines forbid. */}
      <img src={src} alt={label} width={193} height={48} />
    </a>
  )
}
