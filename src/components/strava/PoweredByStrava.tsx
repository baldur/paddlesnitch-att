// "Powered by Strava" attribution. Strava's brand guidelines require this logo
// on any view built from Strava data (the activity picker, the upload Strava
// tab, and leaderboard rows imported from Strava). Rendered as the supplied
// image, never restyled. Swap the placeholder in public/strava/ for the
// official asset (#107).
export default function PoweredByStrava({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- brand asset served
    // as-is from public/; must not be restyled/optimised (Strava guidelines).
    <img
      src="/strava/powered-by-strava.svg"
      alt="Powered by Strava"
      width={140}
      height={20}
      className={className}
    />
  )
}
