/* The commissioner's Karaoke desk (KaraokeDesk.jsx), as data: every roster
   player's song as the commissioner's frame has it (karaokeTrack is private
   to its owner and the commissioner) and the desk's last video check
   (GET /api/admin/karaoke/check, which stores nothing). A row's lamp:
   "ready" when the check said the song's video plays, "partial" when a song
   is picked but not checked since it was saved or the check said it will
   not play, "missing" with no song. The singer on now is marked. Pure. */
import { rosterOf } from "../../../shared/core.js";
import { hasKaraokeSong, karaokeArtists, karaokeSinger, karaokeTrackOf } from "../../../shared/karaoke.js";

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
      video:Number.isInteger(result.video) ? result.video : null, id };
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
    return {
      singing:singer === player,
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
