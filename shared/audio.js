/* Public audio metadata only. Provider credentials and playback sessions live
   in private Worker storage and never enter tournament state or snapshots. */

const SPOTIFY_TRACK_ID = /^[A-Za-z0-9]{22}$/;
const SPOTIFY_TRACK_URI = /^spotify:track:([A-Za-z0-9]{22})$/;
const SPOTIFY_IMAGE_HOSTS = new Set(["i.scdn.co"]);
const ISRC = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/;
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
  /* the recording's ISRC finds its on-phone preview clip */
  const isrc = typeof value.isrc === "string" && ISRC.test(value.isrc.toUpperCase()) ? value.isrc.toUpperCase() : null;

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
      ...(isrc ? { isrc } : {}),
    },
  };
}

/* ── the walkout silence contract (Spotify Developer Policy III.7) ──
   state.showControl.audio = { walkout:{ player, trackId, startedAt, until } | null }
   in server ms. Only the Worker writes it: when a cue's play succeeds, and
   again when it confirms or loses the song on the speaker. It is cleared on
   pause/stop, when Spotify reports the song is no longer playing, and by an
   alarm once `until` passes. Presentation only: it never gates an official
   write. Every phone and TV keeps Field Day's own sounds silent while
   `walkout && serverNow() < walkout.until`. `player` is null for a track
   played from Audio Director search; `trackId` is null only for a resume
   whose track could not be read. `auto` marks a win song the Worker started
   itself (worker/winSong.js): its `until` never moves later, and the alarm
   stops the speaker there, which is how a 30-second clip ends. */
const WALKOUT_MAX_MS = 4 * 60 * 1000;
/* a win song plays this long from its start point (worker/winSong.js) */
const WIN_SONG_CLIP_MS = 30 * 1000;
const WALKOUT_MIN_MS = 5000;
/* a confirmation moves `until` only when the song drifted this far */
const WALKOUT_DRIFT_MS = 5000;

const finiteMs = value => Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;

/* how long a song started at `positionMs` still plays, bounded both ways */
function walkoutRemainingMs({ durationMs, positionMs = 0 } = {}) {
  const duration = Math.floor(Number(durationMs));
  if (!Number.isFinite(duration) || duration < 1000 || duration > MAX_TRACK_DURATION_MS)
    return WALKOUT_MAX_MS;
  const position = Math.max(0, Math.floor(Number(positionMs) || 0));
  return Math.max(WALKOUT_MIN_MS, Math.min(WALKOUT_MAX_MS, duration - position));
}

/* The one validator for a stored or proposed record. `players`, when given,
   is the set of legal player ids. Anything malformed reads as no walkout. */
function cleanWalkout(value, { players = null } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const player = value.player === null || value.player === undefined ? null
    : typeof value.player === "string" && value.player.length <= 40
      && (!players || players.includes(value.player)) ? value.player : undefined;
  if (player === undefined) return null;
  const trackId = value.trackId === null || value.trackId === undefined ? null
    : SPOTIFY_TRACK_ID.test(value.trackId) ? value.trackId : undefined;
  if (trackId === undefined) return null;
  const startedAt = finiteMs(value.startedAt);
  const until = finiteMs(value.until);
  if (startedAt === null || until === null || until <= startedAt) return null;
  const bit = typeof value.bit === "string" && GAG_ID.test(value.bit) ? value.bit : null;
  const audibleAt = finiteMs(value.audibleAt);
  return { player, trackId, startedAt, until, ...(value.auto === true ? { auto:true } : {}), ...(bit ? { bit } : {}),
    ...(bit && audibleAt !== null ? { audibleAt } : {}) };
}

/* `clipMs` ends the record early (a win song's clip); never past the song.
   `bit` and `audibleAt`: a win song timed to a bit's beat (shared/bitMusic.js). */
function buildWalkout({ player = null, trackId = null, startedAt, durationMs, positionMs = 0, clipMs = null, auto = false, bit = null,
  audibleAt = null }, options) {
  const start = finiteMs(startedAt);
  if (start === null) return null;
  const remaining = walkoutRemainingMs({ durationMs, positionMs });
  const clip = finiteMs(clipMs);
  return cleanWalkout({ player, trackId, startedAt:start, auto, bit, audibleAt,
    until:start + (clip ? Math.max(WALKOUT_MIN_MS, Math.min(remaining, clip)) : remaining) }, options);
}

/* the stored record, live or not */
const walkoutOf = state => cleanWalkout(state?.showControl?.audio?.walkout);

/* the record while the song is still expected to play, else null */
function walkoutLive(state, now) {
  const walkout = walkoutOf(state);
  return walkout && now < walkout.until ? walkout : null;
}

/* What a fresh read of the speaker means for the stored record: the same
   song still playing keeps it (moving `until` to the song's real end when it
   drifted), anything else clears it. Returns the next record, or null. */
function reconcileWalkout(walkout, playback, now) {
  if (!walkout) return null;
  const track = playback?.track;
  if (!playback?.playing || !track?.trackId) return null;
  if (walkout.trackId && walkout.trackId !== track.trackId) return null;
  const remaining = Math.max(0, Number(track.durationMs) - Number(playback.progressMs || 0));
  if (!Number.isFinite(remaining) || remaining <= 0) return null;
  const target = now + Math.min(remaining, WALKOUT_MAX_MS);
  const capped = remaining > WALKOUT_MAX_MS;
  const until = capped
    ? (walkout.until - now < WALKOUT_MAX_MS / 2 ? target : walkout.until)
    : (Math.abs(target - walkout.until) > WALKOUT_DRIFT_MS ? target : walkout.until);
  /* a win song's end is the clip's, earlier only if the song ends first */
  const end = walkout.auto ? Math.min(until, walkout.until) : until;
  return { ...walkout, trackId:track.trackId, until:Math.max(end, walkout.startedAt + 1) };
}

const sameWalkout = (left, right) => (!left && !right) || (!!left && !!right
  && left.player === right.player && left.trackId === right.trackId
  && left.startedAt === right.startedAt && left.until === right.until && !!left.auto === !!right.auto
  && (left.bit || null) === (right.bit || null) && (left.audibleAt ?? null) === (right.audibleAt ?? null));

/* ── a win song on a bit's beat (Oct 14, shared/bitMusic.js) ──
   state.showControl.audio.cue = { gag, player, at } while the Worker means
   to play a write's win song on its moment's beat: written as soon as it
   decides (so a music bit holds its wind-up for the song), cleared when the
   walkout that plays it is stamped (walkout.bit carries the moment on) or
   when it does not play (a miss, a take-back). `at` is when the room should
   hear it. Presentation only, like the walkout. */
const GAG_ID = /^[A-Za-z0-9_:.@-]{1,200}$/;
function cleanSongCue(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const gag = typeof value.gag === "string" && GAG_ID.test(value.gag) ? value.gag : null;
  const at = finiteMs(value.at);
  const player = typeof value.player === "string" && value.player.length <= 40 ? value.player : null;
  return gag && at !== null ? { gag, player, at } : null;
}
const songCueOf = state => cleanSongCue(state?.showControl?.audio?.cue);

/* state.showControl.audio.songs: the win songs that actually played, newest
   last, { player, startedAt, until } with `until` cut short when one was
   stopped early. A loss's bit may cut a song still playing (needle
   scratch); the record says which moments had one, so every screen and a
   reload pick the same bit. Cleared with the progress (a reset). */
const SONG_LOG_MAX = 80;
function cleanSongLog(value) {
  if (!Array.isArray(value)) return [];
  return value.map(item => {
    const startedAt = finiteMs(item?.startedAt), until = finiteMs(item?.until);
    if (startedAt === null || until === null || until <= startedAt) return null;
    const player = typeof item.player === "string" && item.player.length <= 40 ? item.player : null;
    return { player, startedAt, until };
  }).filter(Boolean).slice(-SONG_LOG_MAX);
}
const songLogOf = state => cleanSongLog(state?.showControl?.audio?.songs);
/* the log after a walkout starts (`walkout`) or stops early at `at` */
function logSong(log, walkout) {
  const list = cleanSongLog(log);
  if (!walkout) return list;
  if (list.some(item => item.startedAt === walkout.startedAt && item.player === (walkout.player ?? null))) return list;
  return [...list, { player:walkout.player ?? null, startedAt:walkout.startedAt, until:walkout.until }].slice(-SONG_LOG_MAX);
}
function logSongStop(log, walkout, at) {
  const stop = finiteMs(at);
  return cleanSongLog(log).map(item => walkout && stop !== null && item.startedAt === walkout.startedAt && stop < item.until
    ? { ...item, until:Math.max(item.startedAt + 1, stop) } : item);
}
/* a song playing from at or before `at` through at least `at + runway` */
const songPlayingAt = (log, at, runway = 0) => cleanSongLog(log).some(item => item.startedAt <= Number(at) && item.until > Number(at) + runway);

/* a song's name as the room knows it: a release's suffix ("- Single
   Version", "- Remastered 2011", "(Radio Edit)") is not part of it. Home's
   song line and the karaoke video search (worker/karaokeVideos.js) read it */
const SONG_SUFFIX = /\s*(?:-\s+[^-]*\b(?:version|remaster(?:ed)?|edit|mix|mono|stereo|live|single|radio|explicit|clean)\b[^-]*|[([][^)\]]*\b(?:version|remaster(?:ed)?|edit|mix|mono|stereo|live|radio|explicit|clean)\b[^)\]]*[)\]])\s*$/i;
const songTitle = name => {
  const full = String(name || "").trim();
  const short = full.replace(SONG_SUFFIX, "").trim();
  return short || full;
};

export {
  GAG_ID,
  SONG_LOG_MAX,
  cleanSongCue,
  cleanSongLog,
  logSong,
  logSongStop,
  songCueOf,
  songLogOf,
  songPlayingAt,
  MAX_TRACK_DURATION_MS,
  SONG_SUFFIX,
  SPOTIFY_TRACK_ID,
  SPOTIFY_TRACK_URI,
  WALKOUT_DRIFT_MS,
  WALKOUT_MAX_MS,
  WALKOUT_MIN_MS,
  WIN_SONG_CLIP_MS,
  buildWalkout,
  cleanSpotifyImageUrl,
  cleanWalkout,
  reconcileWalkout,
  sameWalkout,
  songTitle,
  validateSpotifyTrack,
  walkoutLive,
  walkoutOf,
  walkoutRemainingMs,
};
