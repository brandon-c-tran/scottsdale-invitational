/* A song's synced lyrics from LRCLIB (docs/KARAOKE.md "Lyrics"): free, no
   key, asked with a User-Agent that says who we are (LRCLIB's one request
   of its clients). ONE search a song (/api/search by track and artist);
   the answer kept is the record whose length is within LYRICS_MATCH_MS of
   Spotify's (the same recording, so the times line up with an instrumental
   of the same length), whose name is the song's, and that has synced
   lyrics, parsed to lines (shared/karaokeLyrics.js). The Durable Object
   keeps it privately as private:lyrics:<trackId>, a miss asked again after
   a day; a failure is never kept.

   Pure but for the injected fetch: no cloudflare:* or node:* imports. */
import { songTitle } from "../shared/audio.js";
import { cleanLyrics, parseLrc } from "../shared/karaokeLyrics.js";

const API = "https://lrclib.net/api";
export const LYRICS_USER_AGENT = "FieldDay/1.0 (https://fielddayseries.com)";
const CALL_MS = 6000;
/* the record's length against Spotify's */
export const LYRICS_MATCH_MS = 3000;
/* a found answer is kept 30 days, a miss a day */
export const LYRICS_KEEP_MS = 30 * 24 * 60 * 60 * 1000;
export const LYRICS_MISS_MS = 24 * 60 * 60 * 1000;
export const lyricsKey = trackId => `private:lyrics:${trackId}`;

export class LyricsError extends Error {
  constructor(message, { status = 0 } = {}) {
    super(message);
    this.name = "LyricsError";
    this.status = status;
  }
}

const plain = value => String(value || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/['‘’`]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
/* the song's name as LRCLIB lists it: no release suffix, no featured artists */
export const lyricsSongName = name => String(songTitle(name) || name || "")
  .replace(/\s*[([]\s*(?:feat\.?|ft\.?|featuring|with)\s[^)\]]*[)\]]/gi, "")
  .replace(/\s+-\s+(?:feat\.?|ft\.?|featuring)\s.*$/i, "").trim();

/* LRCLIB's records for a search, best first: synced, not marked
   instrumental, the same length (within LYRICS_MATCH_MS), the song's own
   name; nearest length first. The first one's lines, or null. */
export function chooseLyrics(records, { name = "", durationMs = 0 } = {}) {
  const want = plain(lyricsSongName(name));
  const target = Number(durationMs) || 0;
  const rows = (Array.isArray(records) ? records : [])
    .filter(record => record && !record.instrumental && typeof record.syncedLyrics === "string" && record.syncedLyrics.trim())
    .map(record => ({ record, off:target ? Math.abs(Number(record.duration) * 1000 - target) : 0,
      named:!want || plain(lyricsSongName(record.trackName || record.name)) === want }))
    .filter(row => Number.isFinite(row.off) && row.off <= LYRICS_MATCH_MS)
    .sort((a, b) => Number(b.named) - Number(a.named) || a.off - b.off);
  for (const row of rows) {
    const lines = cleanLyrics(parseLrc(row.record.syncedLyrics));
    if (lines) return { lines, id:Number(row.record.id) || null };
  }
  return null;
}

/* One search: { lines, id } or null when LRCLIB has no synced lyrics for
   this recording. Throws a LyricsError when LRCLIB did not answer. */
export async function findLyrics({ name = "", artists = [], artist = "", durationMs = 0 } = {}, fetchImpl = fetch) {
  const track = lyricsSongName(name);
  const first = String((Array.isArray(artists) ? artists[0] : "") || artist || "").trim();
  if (!track) return null;
  const url = new URL(`${API}/search`);
  url.searchParams.set("track_name", track.slice(0, 200));
  if (first) url.searchParams.set("artist_name", first.slice(0, 200));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALL_MS);
  try {
    let response;
    try {
      response = await fetchImpl(url, { signal:controller.signal,
        headers:{ "User-Agent":LYRICS_USER_AGENT, "Lrclib-Client":LYRICS_USER_AGENT, Accept:"application/json" } });
    } catch { throw new LyricsError(controller.signal.aborted ? "LRCLIB timed out" : "LRCLIB unreachable"); }
    if (response.status === 404) return null;
    if (!response.ok) throw new LyricsError(`LRCLIB ${response.status}`, { status:response.status });
    let records;
    try { records = await response.json(); } catch { throw new LyricsError("LRCLIB answered garbage"); }
    return chooseLyrics(records, { name, durationMs });
  } finally { clearTimeout(timer); }
}

/* a kept answer still answers: 30 days with lines, a day without */
export const lyricsFresh = (saved, now = Date.now()) => !!saved && Number.isFinite(Number(saved.at))
  && now - Number(saved.at) <= (Array.isArray(saved.lines) && saved.lines.length ? LYRICS_KEEP_MS : LYRICS_MISS_MS);
