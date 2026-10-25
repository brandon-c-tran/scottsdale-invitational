/* Trivia's rounds in the room's voice (TV only, the room bus). Three kinds
   of cue, all on the server clock:

     state  a fresh frame's step (roomSound.js roomCues calls triviaCues):
            the lean-in sting as a question goes up (openedAt), a slap as
            each player locks in (panned to their place in the room), the
            reveal, and the scores.
     clock  what the question owes while it stands (useTriviaRoomClock,
            from useRoomSound): the bed a bar at a time (triviaBed, two
            seconds a bar, the last bar ending on closesAt, its last bars
            tense), a tick each of the last five seconds (triviaTick,
            climbing, with the ring's red seconds) and the knock at zero
            (S8). A name that tune question keeps the bed out while its
            clip plays (the first TRIVIA_CLIP_MS); the bed comes in on the
            bar line after it. Laid when the question stands on this TV and
            cancelled when it moves on; a bar already ringing fades out (a
            cut recipe), so an early reveal (everyone locked in) stops the
            bed clean. A TV that joins late hears only what is still ahead.
     reveal the TV's own reveal (TVTrivia.jsx, tv-trivia.css), from the
            frame that shows it: the right answer stamping, the counts
            rising, the faces of everyone who had it landing, the points
            flying onto the scorers' rows and the board settling. Then the
            scores between rounds (a chip as each row rises, the motif),
            or the final podium (a place stamping as each step rises; the
            posted result rings S14 after, never this).

   Reduced motion: no bed; the reveal is the answer's stamp alone, the
   scores their motif, the podium its 1st. Loads, reconnects and
   corrections sound nothing (roomStep's fresh gate). Pure apart from the
   hook. */
import { useEffect } from "react";
import { cueAt } from "../../lib/sound.js";
import { serverNow } from "../../lib/serverClock.js";
import { TRIVIA_CLIP_MS } from "../../../shared/trivia.js";
import { nearestGuesses, triviaView } from "../trivia/triviaModel.js";

/* one bar of the bed (soundKit GEO_BAR_S): 120 a minute in four, so every
   whole second back from closesAt is a beat */
export const TRIVIA_BAR_MS = 2000;
/* the ticks: the last five seconds, when the ring turns red */
export const TRIVIA_TICKS = 5;
/* how many of the question's last bars go tense: three of a 20 s
   question's ten, five of a closest number's fifteen (the last always 5) */
export const triviaTenseBars = bars => Math.max(0, Math.min(5, Math.round(bars * 0.3)));
/* where the bed may start: a tune's clip has the first ten seconds alone */
export const triviaBedFrom = snap => (Number(snap?.startsAt) || 0) + (snap?.format === "tune" ? TRIVIA_CLIP_MS : 0);

/* The TV's reveal and scores, from tv-trivia.css: each element's delay
   (ms from the frame that shows it), its step a row and its length.
     stamp   li.is-right, .tv-trivia-answer: tv-trivia-stamp-in after .2s
     tally   .tv-trivia-tally: rise calc(.7s + var(--i) * 90ms), .45s
     face    .tv-trivia-faces > span: land calc(1s + var(--i) * 70ms), .4s
     plus    .tv-trivia-row-plus: fly calc(1.2s + var(--row) * 60ms), .7s
     row     .tv-trivia-row: rise calc(var(--row) * 90ms), .45s
     step    .tv-trivia-step: rise .6s, 3rd .2s, 2nd .6s, 1st 1.1s */
export const TRIVIA_TV = Object.freeze({
  stamp:200,
  tally:Object.freeze({ at:700, step:90, ms:450 }),
  face:Object.freeze({ at:1000, step:70, ms:400, max:7 }),
  plus:Object.freeze({ at:1200, step:60, ms:700, rows:8, near:7 }),
  row:Object.freeze({ at:0, step:90, ms:450 }),
  step:Object.freeze({ ms:600, 3:200, 2:600, 1:1100 }),
});
/* when a moving element reads as arrived: the rise and fly curve
   (cubic-bezier(.2,.8,.2,1)) is 80% of the way 27.5% in, the land curve
   (--ease-land) 90% of the way 40% in */
export const RISE_HIT = 0.275, LAND_HIT = 0.4;
const rise = ms => Math.round(ms * RISE_HIT), land = ms => Math.round(ms * LAND_HIT);
/* the right answer's stamp: the stamp-in's delay and its first, fastest tenth */
export const TRIVIA_STAMP_HIT_MS = TRIVIA_TV.stamp + 50;
/* The reveal's CSS runs from the frame that shows it, which is this TV's
   fresh frame: the instant it arrived (never before the write, and never
   long after it, since a frame that late is not fresh) */
export const TRIVIA_SEEN_MS = 1500;
export const seenAt = (at, now) => at > 0 ? Math.min(Math.max(Number(now) || at, at), at + TRIVIA_SEEN_MS) : Number(now) || 0;

/* a player's place in the room, left to right */
const panOf = (order, player) => order.length > 1
  ? Math.round((-0.7 + 1.4 * Math.max(0, order.indexOf(player)) / (order.length - 1)) * 100) / 100 : 0;

/* what the reveal draws, as counts and rows: the options' tallies, the
   faces on the right answer (TVTrivia Faces: seven, or six and +N) and
   the rows whose points fly (the board's top eight with points from this
   question; a closest number's seven nearest that scored) */
function revealShape(view) {
  const { question } = view;
  if (question.format === "number") {
    const near = nearestGuesses(view).slice(0, TRIVIA_TV.plus.near);
    return { options:0, faces:0, points:near.map((lane, i) => lane.score.points > 0 ? i : -1).filter(i => i >= 0) };
  }
  const who = view.chose[question.answer] || [];
  const max = TRIVIA_TV.face.max;
  return { options:question.options?.length || 0, faces:who.length > max ? max - 1 : who.length,
    points:view.standings.slice(0, TRIVIA_TV.plus.rows).map((row, i) => row.last > 0 ? i : -1).filter(i => i >= 0) };
}

/* Trivia, reduced to what can sound (null once the result posts: the
   result rings S14) */
export function triviaSnapshot(state) {
  const game = state?.trivia;
  if (!game?.questions?.length || state.results?.[game.eventId]) return null;
  const view = triviaView(state, null, 0);
  if (!view) return null;
  const picks = game.picks?.[view.question.id] || {};
  return { id:view.question.id || null, phase:game.phase, format:view.question.format || "choice",
    openedAt:view.openedAt, startsAt:view.startsAt, closesAt:view.closesAt, revealedAt:view.revealedAt,
    boardAt:Number(game.boardAt) || 0, last:!!view.last, rows:view.standings.length,
    locked:Object.keys(picks).filter(key => picks[key]?.locked).sort().join(","),
    players:Array.isArray(game.players) ? game.players.join(",") : "",
    reveal:view.revealed && game.phase === "reveal" ? revealShape(view) : null };
}

/* The reveal from `anchor`, the instant this TV showed it: the answer
   stamps, the counts rise, the faces land, the points fly and the board
   settles. Reduced motion: the stamp alone, at once. */
export function triviaRevealCues({ anchor, reveal, reduced = false }) {
  if (!Number.isFinite(Number(anchor)) || !reveal) return [];
  const t0 = Number(anchor);
  if (reduced) return [{ id:"triviaAnswer", at:t0 }];
  const { tally, face, plus } = TRIVIA_TV;
  const cues = [{ id:"triviaAnswer", at:t0 + TRIVIA_STAMP_HIT_MS }];
  if (reveal.options > 0) cues.push({ id:"triviaTally", at:t0 + tally.at + rise(tally.ms),
    opts:{ offsets:Array.from({ length:reveal.options }, (_, i) => i * tally.step) } });
  if (reveal.faces > 0) cues.push({ id:"triviaFaces", at:t0 + face.at + land(face.ms), opts:{ n:reveal.faces, gap:face.step } });
  const rows = reveal.points || [];
  if (rows.length) cues.push({ id:"triviaPoints", at:t0 + plus.at + rows[0] * plus.step + rise(plus.ms),
    opts:{ offsets:rows.map(i => (i - rows[0]) * plus.step) } });
  return cues;
}

/* The scores from `anchor`: between rounds a chip as each row rises, then
   the motif; at the end each podium step stamps as it rises (3rd, 2nd,
   1st). Reduced motion: the motif, or the 1st, at once. */
export function triviaBoardCues({ anchor, rows = 0, last = false, reduced = false }) {
  if (!Number.isFinite(Number(anchor))) return [];
  const t0 = Number(anchor);
  const n = Math.max(0, Math.floor(Number(rows) || 0));
  if (last) {
    if (!n) return [];
    if (reduced) return [{ id:"podium", at:t0, opts:{ place:1 } }];
    const { step } = TRIVIA_TV;
    return [3, 2, 1].filter(place => place <= n).map(place => ({ id:"podium", at:t0 + step[place] + rise(step.ms), opts:{ place } }));
  }
  if (reduced || !n) return [{ id:"triviaScores", at:t0, opts:{ summary:true } }];
  const { row } = TRIVIA_TV;
  return [{ id:"triviaScores", at:t0 + row.at + rise(row.ms), opts:{ offsets:Array.from({ length:n }, (_, i) => i * row.step) } }];
}

/* the cues one fresh Trivia step owes the room */
export function triviaCues(prev, next, { now = serverNow(), reduced = false } = {}) {
  const t = next?.trivia, was = prev?.trivia;
  if (!t?.id) return [];
  const cues = [];
  const key = `trivia:${t.id}`;
  if (was?.id !== t.id && t.phase === "question") cues.push({ id:reduced ? "S3" : "sting", at:t.openedAt || now, key:`${key}:open` });
  if (was?.id === t.id && t.phase === "question") {
    const before = new Set((was.locked || "").split(",").filter(Boolean));
    const fresh = (t.locked || "").split(",").filter(Boolean).filter(player => !before.has(player));
    const order = (t.players || "").split(",").filter(Boolean);
    /* each lock slaps from where that player sits in the room, left to right */
    fresh.forEach((player, i) => cues.push({ id:"S18", at:now + i * 90, pan:panOf(order, player), key:`${key}:lock:${player}` }));
  }
  if (t.phase === "reveal" && t.reveal && t.revealedAt && (was?.id !== t.id || was.phase === "question"))
    triviaRevealCues({ anchor:seenAt(t.revealedAt, now), reveal:t.reveal, reduced })
      .forEach(cue => cues.push({ ...cue, key:`${key}:reveal:${cue.id}` }));
  if (t.phase === "board" && was?.phase !== "board" && t.boardAt)
    triviaBoardCues({ anchor:seenAt(t.boardAt, now), rows:t.rows, last:t.last, reduced })
      .forEach((cue, i) => cues.push({ ...cue, key:`${key}:board:${i}` }));
  return cues;
}

/* What the question owes the room from `now` while it stands: the bed's
   bars (none under reduced motion, none while a tune's clip plays), the
   last five seconds' ticks and the knock at zero. The bars are laid back
   from closesAt so the last one ends on the knock; the turn's last bar is
   its fourth chord, leaning home as the knock lands. */
export function triviaClockCues(snap, now, { reduced = false } = {}) {
  if (!snap || snap.phase !== "question" || !(snap.closesAt > 0) || !(snap.startsAt > 0)) return [];
  const { closesAt, startsAt } = snap;
  const cues = [];
  const ahead = at => at > now - 200;
  if (!reduced) {
    const bars = Math.max(0, Math.floor((closesAt - startsAt) / TRIVIA_BAR_MS));
    const tenseBars = triviaTenseBars(bars);
    const from = triviaBedFrom(snap);
    for (let i = 0; i < bars; i++) {
      const at = closesAt - (bars - i) * TRIVIA_BAR_MS;
      if (at < from || !ahead(at)) continue;
      const left = bars - i;
      const tense = left <= tenseBars ? 6 - left : 0;
      const turn = (((i - (bars - 1)) % 4) + 4 + 3) % 4;
      cues.push({ id:"triviaBed", at, opts:{ bar:turn, tense, last:i === bars - 1 } });
    }
  }
  for (let s = TRIVIA_TICKS; s >= 1; s--) {
    const at = closesAt - s * 1000;
    if (at > startsAt && ahead(at)) cues.push({ id:"triviaTick", at, opts:{ s } });
  }
  if (ahead(closesAt)) cues.push({ id:"S8", at:closesAt });
  return cues;
}

const reducedNow = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

/* the question's clock cues: laid when it stands on this TV, cancelled
   when it moves on (a bar ringing fades out). The handle, not a key, keeps
   each one single (a key outlives a cancel). */
export function useTriviaRoomClock(snap) {
  const stand = snap?.phase === "question" && snap.closesAt ? `${snap.id}:${snap.startsAt}:${snap.closesAt}` : null;
  useEffect(() => {
    if (!stand) return undefined;
    const handles = triviaClockCues(snap, serverNow(), { reduced:reducedNow() })
      .map(cue => cueAt(cue.id, cue.at, { pan:cue.pan || 0, opts:cue.opts || {} }));
    return () => handles.forEach(handle => handle?.cancel?.());
  }, [stand]); // eslint-disable-line react-hooks/exhaustive-deps
}
