/* Google's Maps JavaScript API, loaded by a script tag the first time a
   Where and When map is about to show (never in the app's bundle, no npm
   package). The key is a browser key restricted by HTTP referrer
   (docs/GOOGLE-MAPS.md); it reaches the page on the state frame
   (capabilities.googleMaps + mapsKey), never from the source. A key Google
   refuses (gm_authFailure), a script that fails or one that never answers
   marks Google failed for this session (googleState.js): every map falls
   back to MapLibre. Imported only by GeoMap's dynamic import. */
import { failGoogle, googleFailed } from "./googleState.js";

const CALLBACK = "__fdGoogleMapsReady";
const TIMEOUT_MS = 15000;
let loading = null;

export const googleScriptUrl = (key, callback = CALLBACK) =>
  `https://maps.googleapis.com/maps/api/js?${new URLSearchParams({ key, v:"weekly", loading:"async", callback })}`;

export function loadGoogleMaps(key, { timeout = TIMEOUT_MS } = {}) {
  if (googleFailed()) return Promise.reject(new Error("Google Maps is unavailable"));
  if (typeof window === "undefined" || !key) return Promise.reject(new Error("No Google Maps key"));
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const give = error => { failGoogle(); reject(error); };
    const timer = setTimeout(() => give(new Error("Google Maps did not load")), timeout);
    /* Google calls this when the key is refused (a referrer it does not
       allow, the API not enabled, billing off) */
    window.gm_authFailure = () => { clearTimeout(timer); give(new Error("Google refused the key")); };
    window[CALLBACK] = () => {
      const maps = window.google?.maps;
      const need = maps?.importLibrary ? Promise.all([maps.importLibrary("maps"), maps.importLibrary("core")]) : Promise.resolve();
      need.then(() => { clearTimeout(timer); if (!googleFailed()) resolve(window.google.maps); },
        error => { clearTimeout(timer); give(error); });
    };
    const script = document.createElement("script");
    script.src = googleScriptUrl(key);
    script.async = true;
    script.onerror = () => { clearTimeout(timer); give(new Error("Google Maps did not load")); };
    document.head.append(script);
  });
  loading.catch(() => {});
  return loading;
}
