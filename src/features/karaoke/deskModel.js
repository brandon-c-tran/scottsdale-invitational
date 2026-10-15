/* The commissioner's Karaoke desk (KaraokeDesk.jsx), as data: every roster
   player's song as the commissioner's frame has it (karaokeTrack is private
   to its owner and the commissioner) and the desk's last video check
   (GET /api/admin/karaoke/check, which stores nothing). A row's lamp:
   "ready" when the check said the song's video plays, "partial" when a song
   is picked but not checked since it was saved or the check said it will
   not play, "missing" with no song. A row also says how the song will
   play ("lyrics" or "video": the check's word, else the profile's) and,
   for a song sung with our lyrics, its nudge (the game's copy while a game
   holds it, so a nudge mid-song moves what the room sees). Pure. */
import { rosterOf } from "../../../shared/core.js";
import {
  hasKaraokeSong, karaokeArtists, karaokeSinger, karaokeSongWay, karaokeTrackOf, karaokeTurnWay,
} from "../../../shared/karaoke.js";
import { LYRICS_NUDGE_MAX_MS, LYRICS_NUDGE_STEP_MS, cleanLyricsOffset } from "../../../shared/karaokeLyrics.js";

/* the nudge as the desk letters it: "0.5 s earlier", "0.25 s later", "0 s" */
export function nudgeText(ms) {
  const value = cleanLyricsOffset(ms);
  if (!value) return "0 s";
  return `${Math.abs(value) / 1000} s ${value > 0 ? "earlier" : "later"}`;
}
/* the offset a tap writes: a step earlier (+) or later (-), within the max */
export const nudged = (ms, earlier) => Math.max(-LYRICS_NUDGE_MAX_MS, Math.min(LYRICS_NUDGE_MAX_MS,
  cleanLyricsOffset(ms) + (earlier ? LYRICS_NUDGE_STEP_MS : -LYRICS_NUDGE_STEP_MS)));

/* why a video will not play, as the commissioner reads it (the check's codes) */
export const KARAOKE_PROBLEMS = Object.freeze({
  removed:"Video gone", private:"Private video", processing:"Still processing", embedding:"YouTube only",
  age:"Age restricted", region:"Blocked in the US", live:"Live stream", length:"Wrong length", invalid:"Not a video",
});
export const karaokeProblem = code => KARAOKE_PROBLEMS[code] || "Will not play";

/* roster players with a song, for the menu's value and the Ready check */
export const karaokeSongCount = state => rosterOf(state).filter(player => hasKaraokeSong(state, player)).length;

/* the check's answer kept against the video it checked, so a song changed
   since reads as unchecked again: { [player]:{ ok, code, video, id } } */
export function karaokeChecked(state, results) {
  const out = {};
  for (const player of rosterOf(state)) {
    const id = karaokeTrackOf(state, player)?.video?.id;
    const result = results?.[player];
    if (id && result && typeof result === "object") out[player] = { ok:!!result.ok, code:result.code || null,
      video:Number.isInteger(result.video) ? result.video : null, id,
      ...(result.way === "lyrics" || result.way === "video" ? { way:result.way } : {}) };
  }
  return out;
}

export function karaokeDeskRows(state, checks = {}) {
  const game = state?.karaoke?.id ? state.karaoke : null;
  const singer = karaokeSinger(game);
  return rosterOf(state).map(player => {
    const track = karaokeTrackOf(state, player);
    const id = track?.video?.id || null;
    const check = id && checks?.[player]?.id === id ? checks[player] : null;
    /* the song the room plays: the game's copy once the frame carries it */
    const copy = game?.songs?.[player] || null;
    const playing = copy?.trackId ? copy : track;
    return {
      singing:singer === player,
      /* the singer on now plays the way their turn does; anyone else the check's way, else their song's */
      way:singer === player && copy ? karaokeTurnWay(game, player)
        : check?.way || (playing?.video ? karaokeSongWay(playing, copy?.trackId ? game.lyrics?.[copy.trackId] : undefined) : null),
      trackId:playing?.trackId || null,
      offset:cleanLyricsOffset(playing?.lyricsOffset),
      player,
      lamp:!id ? "missing" : check?.ok ? "ready" : "partial",
      song:id ? { name:track.name || "", artists:karaokeArtists(track) } : null,
      checked:!!check,
      /* a saved video that failed while an alternate plays is fine: the
         game promotes the alternate at its window's check */
      problem:check && !check.ok ? karaokeProblem(check.code) : null,
    };
  });
}
