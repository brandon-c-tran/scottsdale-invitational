/* On-phone preview clips for the Win song picker. Spotify is the catalog and
   the room speaker, but it no longer hands out preview audio, and its
   embedded player cannot be started from our own button on an iPhone.
   Deezer's public API returns a 30-second MP3 clip for a recording, found by
   its ISRC (exact), else by title and artist. The clip URL is signed and
   expires in about 15 minutes, so answers are kept for 10. No credentials;
   the phone plays the clip straight from Deezer's CDN. */

const DEEZER = "https://api.deezer.com";
const PREVIEW_HOSTS = /^https:\/\/cdn[a-z0-9-]*\.dzcdn\.net\//;
export const PREVIEW_TTL_MS = 10 * 60 * 1000;
const PREVIEW_CACHE_MAX = 300;

const cleanTerm = value => String(value || "").replace(/["\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);

async function deezerJson(path, fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetchImpl(`${DEEZER}${path}`, { signal:controller.signal, headers:{ Accept:"application/json" } });
    if (!response.ok) return null;
    const body = await response.json();
    return body && !body.error ? body : null;
  } catch { return null; } finally { clearTimeout(timer); }
}

const clipOf = track => typeof track?.preview === "string" && PREVIEW_HOSTS.test(track.preview) ? track.preview : null;

/* { url } for a playable clip, or null. `isrc` is exact; the title and
   artist search is the fallback for songs saved before ISRCs were kept. */
export async function findPreview({ isrc = null, name = "", artist = "" }, fetchImpl = fetch) {
  if (isrc) {
    const url = clipOf(await deezerJson(`/2.0/track/isrc:${encodeURIComponent(isrc)}`, fetchImpl));
    if (url) return { url };
  }
  const title = cleanTerm(name), by = cleanTerm(artist);
  if (!title) return null;
  const query = by ? `track:"${title}" artist:"${by}"` : title;
  const found = await deezerJson(`/search?q=${encodeURIComponent(query)}&limit=1`, fetchImpl);
  const url = clipOf(found?.data?.[0]);
  return url ? { url } : null;
}

/* a small time-boxed memory of answers, misses included */
export function previewCache(now = () => Date.now()) {
  const entries = new Map();
  return {
    get(key) {
      const hit = entries.get(key);
      if (!hit) return undefined;
      if (now() - hit.at > PREVIEW_TTL_MS) { entries.delete(key); return undefined; }
      return hit.value;
    },
    set(key, value) {
      entries.set(key, { at:now(), value });
      if (entries.size > PREVIEW_CACHE_MAX) entries.delete(entries.keys().next().value);
    },
  };
}
