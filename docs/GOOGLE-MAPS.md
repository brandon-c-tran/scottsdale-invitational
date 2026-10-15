# Where and When on Google Maps

Where and When draws Google's own map (dark Backglass style, a Map /
Satellite switch on the phones) once the Worker has a Google Maps browser
key. Without the key it keeps the MapLibre map it has today, so nothing
breaks before this is done. A key Google refuses also falls back to
MapLibre for that session.

## One time, about 10 minutes

1. Open https://console.cloud.google.com and create a project (any name,
   e.g. "Field Day").
2. Billing: Google requires a billing account on the project. Our use (13
   phones and a TV loading the map during one game) stays well inside the
   free monthly allowance for Dynamic Maps. Optional: Billing > Budgets and
   alerts, a $5 budget with an email alert.
3. APIs and Services > Library: enable **Maps JavaScript API**. Nothing else
   (place search stays on the free Photon service, no Places API).
4. APIs and Services > Credentials > Create credentials > API key. Then edit
   the key:
   - Application restrictions: **Websites** (HTTP referrers), add
     - `https://fielddayseries.com/*`
     - `https://scottsdale-invitational-staging.btran-backdrop.workers.dev/*`
     - `http://localhost:*/*`
   - API restrictions: **Restrict key**, select only **Maps JavaScript API**.
   - Save. Restrictions can take a few minutes to apply.
5. Give the key to the Worker, production and staging:

   ```
   npx wrangler secret put GOOGLE_MAPS_KEY
   npx wrangler secret put GOOGLE_MAPS_KEY --env staging
   ```

   Paste the key at each prompt. A secret takes effect at once; no deploy is
   needed for it, but the build that reads it (this change) must be deployed.

For local dev, put `GOOGLE_MAPS_KEY=...` in `.dev.vars` (never committed).

## Check it

Open the app on staging, start a Where and When game from the QA console and
open the guess map on a phone: the map is dark, with Map and Satellite at the
top right. The commissioner's Where and When desk shows the same map.

If the map is MapLibre's (light, OpenStreetMap credit), the key is missing or
Google refused it. The browser console says why: usually a referrer not in
the list or the API not enabled.

## Notes

- The key is a browser key: every page that draws the map carries it, which
  is how Google's browser keys work. The referrer and API restrictions are
  what protect it. It is never in the source or the repo.
- Remove the secret (`npx wrangler secret delete GOOGLE_MAPS_KEY`) to go back
  to MapLibre.
