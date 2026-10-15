/* The karaoke song picker (KaraokeSongPicker.jsx), as data: a pasted
   link's video id, a video's picture and length, the song a Use saves, and
   what a preview that will not play says. Pure. docs/KARAOKE.md is the
   contract; shared/karaoke.js keeps the song (cleanKaraokeTrack). */
import { KARAOKE_ALTS_MAX, isYouTubeId, karaokeSongWay, karaokeThumb, karaokeWay } from "../../../shared/karaoke.js";
import { songClock } from "../music/winSongModel.js";

export const KARAOKE_CREDIT = "Songs from Spotify. Videos from YouTube.";
/* the Spotify search's own line: its covers play Deezer's clips unless the
   picker is muted, when they are still */
export const searchCredit = clips => clips ? "Songs from Spotify. Previews from Deezer." : "Songs from Spotify.";
export const SAVE_FAILED = "Your song didn't save. Tap Use again.";
export const LOOKUP_FAILED = "Couldn't find videos. Try again.";
export const NOT_A_LINK = "That isn't a YouTube link";

/* A pasted link's video id, or null: watch?v=, youtu.be/, /shorts/,
   /embed/, /live/, /v/ on youtube.com, m., music. and youtube-nocookie.com,
   or a bare id. */
const HOSTS = /^(?:www\.|m\.|music\.)?(?:youtube\.com|youtube-nocookie\.com)$/i;
export function youTubeIdFrom(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  if (isYouTubeId(raw)) return raw;
  let url;
  try { url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`); } catch { return null; }
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);
  let id = null;
  if (host === "youtu.be" || host === "www.youtu.be") id = parts[0] || null;
  else if (HOSTS.test(host)) {
    if (parts[0] === "watch") id = url.searchParams.get("v");
    else if (["shorts", "embed", "live", "v"].includes(parts[0])) id = parts[1] || null;
  }
  return isYouTubeId(id) ? id : null;
}

/* a video as the profile keeps it: nothing else rides along */
export const videoFields = video => ({ id:video.id, title:video.title || "", channel:video.channel || "",
  seconds:Number(video.seconds) || 0 });
/* its picture: derived from the id (YouTube's own thumbnail, never stored);
   the fit audit's stand-ins carry their own */
export const thumbOf = video => video?.thumb || karaokeThumb(video?.id);
export const videoLength = seconds => songClock((Number(seconds) || 0) * 1000);

/* the candidates on screen: a pasted video first, then the search's, once each */
export function videoChoices(found, pasted = null) {
  const out = [];
  for (const video of [pasted, ...(found || [])])
    if (video && isYouTubeId(video.id) && !out.some(other => other.id === video.id)) out.push(video);
  return out;
}

/* What Use saves (karaokeSong { track }): the Spotify song, the video, and
   the other candidates as its alternates for the TV's Next video. `lyrics`
   is the lookup's word on synced lyrics (the server keeps its own). */
export function karaokeChoice(track, video, candidates = [], { lyrics } = {}) {
  const { startMs, lyrics:_lyrics, lyricsOffset, ...spotify } = track || {};
  return { ...spotify, video:videoFields(video),
    alts:(candidates || []).filter(other => other?.id && other.id !== video.id).slice(0, KARAOKE_ALTS_MAX).map(videoFields),
    ...(typeof lyrics === "boolean" ? { lyrics } : {}) };
}

/* how a candidate would play (docs/KARAOKE.md "Lyrics"): an instrumental
   when the song has synced lyrics is "lyrics", anything else "video" */
export const candidateWay = (video, lyrics, name = "") => karaokeWay(video, lyrics === true, name);
/* how a saved song will play: the frame's word in a pick window, else the song's own */
export const savedWay = (song, way = null) => way || (song?.video ? karaokeSongWay(song) : null);

/* the song a frame carries and the one just saved are the same song */
export const sameSong = (a, b) => !!a && !!b && a.trackId === b.trackId && a.video?.id === b.video?.id;

/* YouTube's player errors, as the guest reads them (src/lib/youtube.js YT_ERRORS) */
export function previewProblem(code) {
  if (code === 100) return "That video is gone. Try another.";
  if (code === 101 || code === 150) return "That video only plays on YouTube. Try another.";
  if (code === 2) return "That video can't play here. Try another.";
  return "That video didn't load. Try again.";
}
