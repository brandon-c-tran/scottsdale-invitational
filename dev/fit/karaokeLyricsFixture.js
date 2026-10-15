/* Stand-in lyrics for the fit audit and the tests (docs/KARAOKE.md
   "Lyrics"): lines written for the audit, never a real song's words, timed
   the way LRCLIB's synced lyrics are (ms from the song's start). A short
   intro before the first line, a break, a long line that takes two lines
   on the TV, and a one-word line. Nothing here reaches LRCLIB. */
import { cleanLyrics } from "../../shared/karaokeLyrics.js";

const LINES = [
  [6000, "Lights come up across the desert floor"],
  [10200, "Thirteen voices and a borrowed microphone"],
  [14600, "Hold it steady till the chorus lands"],
  [18800, ""],
  [24000, "Everybody sing it like you mean it"],
  [28200, "Every word up on the glass tonight"],
  [32600, "One more round before the night is over"],
  [37000, "Turn it up and let the whole room hear it"],
  [41400, "Nobody leaves until the final note is gone"],
  [48000, "We were never meant to sing this quietly, so sing it louder than the band"],
  [54500, "Hold the high note"],
  [58000, "Then bring it home"],
  [62000, ""],
];
/* the same verse again and again to the end of a long song */
export const KARAOKE_FIT_LYRICS = Object.freeze(cleanLyrics([0, 64000, 128000, 192000, 256000].flatMap(from =>
  LINES.map(([t, text]) => ({ t:from + t, text }))).filter(line => line.t < 300000)));
/* the instrumental a stand-in song plays over (a stand-in id; nothing loads it) */
export const fitInstrumental = (song, id) => ({ id, title:`${String(song?.name || "").split(" - ")[0]} (Official Instrumental)`,
  channel:(song?.artists || [])[0] || "YouTube", seconds:Math.round((Number(song?.durationMs) || 240000) / 1000) });
