/* Public audio metadata only. Provider credentials and playback sessions live
   in private Worker storage and never enter tournament state or snapshots. */

const SPOTIFY_TRACK_ID = /^[A-Za-z0-9]{22}$/;
const SPOTIFY_TRACK_URI = /^spotify:track:([A-Za-z0-9]{22})$/;
const SPOTIFY_IMAGE_HOSTS = new Set(["i.scdn.co"]);
const MAX_TRACK_DURATION_MS = 12 * 60 * 60 * 1000;

const cleanText = (value, max) => {
  if (typeof value !== "string") return null;
  const text = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().replace(/\s+/g, " ");
  return text && text.length <= max ? text : null;
};

function cleanSpotifyImageUrl(value) {
  if (value === null || value === undefined || value === "") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && SPOTIFY_IMAGE_HOSTS.has(url.hostname)
      ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function validateSpotifyTrack(value) {
  if (value === null) return { ok:true, track:null };
  if (!value || typeof value !== "object" || Array.isArray(value))
    return { ok:false, error:"Choose a Spotify track" };
  if (value.provider !== "spotify")
    return { ok:false, error:"Unsupported audio provider" };

  const trackId = typeof value.trackId === "string" ? value.trackId : "";
  const uriMatch = typeof value.uri === "string" ? value.uri.match(SPOTIFY_TRACK_URI) : null;
  if (!SPOTIFY_TRACK_ID.test(trackId) || uriMatch?.[1] !== trackId)
    return { ok:false, error:"Invalid Spotify track" };

  const name = cleanText(value.name, 120);
  const artists = Array.isArray(value.artists)
    ? value.artists.slice(0, 5).map(artist => cleanText(artist, 100))
    : [];
  if (!name || !artists.length || artists.some(artist => !artist))
    return { ok:false, error:"Track metadata is incomplete" };

  const durationMs = Math.floor(Number(value.durationMs));
  if (!Number.isFinite(durationMs) || durationMs < 1000 || durationMs > MAX_TRACK_DURATION_MS)
    return { ok:false, error:"Invalid track duration" };
  const imageUrl = cleanSpotifyImageUrl(value.imageUrl);
  if (imageUrl === undefined) return { ok:false, error:"Invalid track image" };
  const requestedStart = Math.max(0, Math.floor(Number(value.startMs) || 0));
  const startMs = Math.min(requestedStart, Math.max(0, durationMs - 1000));

  return {
    ok:true,
    track:{
      provider:"spotify",
      trackId,
      uri:`spotify:track:${trackId}`,
      url:`https://open.spotify.com/track/${trackId}`,
      name,
      artists,
      durationMs,
      imageUrl,
      explicit:value.explicit === true,
      startMs,
    },
  };
}

export {
  MAX_TRACK_DURATION_MS,
  SPOTIFY_TRACK_ID,
  SPOTIFY_TRACK_URI,
  cleanSpotifyImageUrl,
  validateSpotifyTrack,
};
