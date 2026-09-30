/* The Win song picker's snippet preview: the song's album upload on
   YouTube, so a phone can play exactly the 30 seconds the room will hear.
   Spotify plays nothing on a phone and the preview-clip services give a
   fixed 30 seconds; YouTube's embedded player plays the whole song and
   starts and stops where it is told.

   Only an upload whose length matches Spotify's within MATCH_MS is used,
   preferring YouTube's auto-generated album uploads ("Artist - Topic"),
   so a start point means the same moment in both. A music video with an
   intro would shift every timestamp, so no close match means no snippet.
   One search costs 101 of the API key's 10,000 daily units; the Durable
   Object keeps every answer, so each song is looked up once. */

const API = "https://www.googleapis.com/youtube/v3";
export const SNIPPET_MATCH_MS = 3000;

/* ISO 8601 "PT3M42S" -> milliseconds */
export function isoDurationMs(text) {
  const match = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(String(text || ""));
  if (!match) return null;
  const [, d = 0, h = 0, m = 0, s = 0] = match.map(value => Number(value) || 0);
  return (((d * 24 + h) * 60 + m) * 60 + s) * 1000;
}

/* the best embeddable upload for this song, or null */
export function chooseUpload(videos, durationMs) {
  const target = Number(durationMs) || 0;
  const scored = (videos || [])
    .map(video => ({ video, length:isoDurationMs(video?.contentDetails?.duration) }))
    .filter(({ video, length }) => video?.id && video?.status?.embeddable !== false && length !== null
      && Math.abs(length - target) <= SNIPPET_MATCH_MS)
    .map(({ video, length }) => ({ videoId:video.id, durationMs:length,
      topic:/ - Topic$/.test(video?.snippet?.channelTitle || ""), off:Math.abs(length - target) }));
  scored.sort((a, b) => Number(b.topic) - Number(a.topic) || a.off - b.off);
  const best = scored[0];
  return best ? { videoId:best.videoId, durationMs:best.durationMs, topic:best.topic } : null;
}

async function youtubeJson(path, params, key, fetchImpl) {
  const url = new URL(`${API}/${path}`);
  for (const [name, value] of Object.entries({ ...params, key })) url.searchParams.set(name, value);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetchImpl(url, { signal:controller.signal });
    if (!response.ok) throw new Error(`YouTube ${response.status}`);
    return await response.json();
  } finally { clearTimeout(timer); }
}

/* search, then read the candidates' lengths and whether they may be embedded */
export async function findAlbumUpload({ name, artist, durationMs }, key, fetchImpl = fetch) {
  const q = `${artist || ""} ${name || ""}`.replace(/\s+/g, " ").trim().slice(0, 150);
  if (!q) return null;
  const found = await youtubeJson("search", { part:"snippet", type:"video", videoCategoryId:"10", maxResults:"8", q },
    key, fetchImpl);
  const ids = (found?.items || []).map(item => item?.id?.videoId).filter(id => /^[\w-]{11}$/.test(id || ""));
  if (!ids.length) return null;
  const details = await youtubeJson("videos", { part:"contentDetails,snippet,status", id:ids.join(",") }, key, fetchImpl);
  return chooseUpload(details?.items, durationMs);
}
