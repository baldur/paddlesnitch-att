# Strava brand assets

Strava's [brand guidelines](https://developers.strava.com/guidelines/) require
apps to use **Strava's official button and logo artwork** — you may not recreate
or recolour the marks. The files in this folder are **non-official placeholders**
so the UI renders and reviews correctly; **before submitting for Strava app
approval, replace each one with the official download** from the guidelines page.
The filenames below are what the code references, so it's a straight swap.

| File here (placeholder) | Replace with official asset | Used for |
|---|---|---|
| `connect-with-strava.svg` | "Connect with Strava" button (orange) | account + upload "connect" |
| `sign-in-with-strava.svg` | "Sign in with Strava" button (orange) | `/att/auth` sign-in |
| `powered-by-strava.svg` | "Powered by Strava" logo, horizontal (orange on light) | attribution on any view built from Strava data |

The official assets are provided by Strava as SVG/PNG on the guidelines page and
in the brand-assets bundle. Keep the "Connect/Sign in with Strava" wording, the
orange `#FC4C02`, and the required clear space exactly as supplied.

Compliance rules the code already follows (so a swap is all that's left):
- Branded button artwork for every sign-in / connect action (not custom text).
- "Powered by Strava" attribution wherever Strava data is displayed
  (the account activity picker, the upload Strava tab, and leaderboard rows that
  came from a Strava import).
- "View on Strava" links back to the source activity
  (`https://www.strava.com/activities/{id}`) on Strava-imported data.
- Marks are shown as-is via `<img>` — never recoloured or altered in code.
