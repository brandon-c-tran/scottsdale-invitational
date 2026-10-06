/* The TV teaches the two comebacks the room cannot read off the board the
   first time each appears (H10): an underdog's 2:1 in the face-off that
   opens its market, then its lamp flashing on the board; a bracket's byes
   with a key beside the final once the first face-off lifts. Each window is
   on the server clock, anchored where the face-off is (faceOffStart), so
   every TV agrees and a late TV joins mid-window; each kind teaches once per
   TV (its window's key in this device's storage), so a reload inside the
   window keeps it and every later window stays quiet. Pure but the hook. */
import { useEffect } from "react";
import { FACEOFF_TIMING as F, faceOffStart } from "./faceOff.js";

/* after the face-off lifts, the board keeps teaching this long */
export const UNDERDOG_TEACH_MS = 8000;
export const BYE_TEACH_MS = 10000;
const STORE = { underdog:"si-tv-taught-underdog", bye:"si-tv-taught-bye" };

/* a two-sided contest whose market opened with an underdog: the face-off's
   start (faceAt), and the board's window after it lifts */
export function underdogTeachWindow(state, ev, contest) {
  if (!ev || !contest?.odds || contest.odds.underdog === null || contest.odds.underdog === undefined) return null;
  if (contest.phase !== "betting-open" || contest.sides?.length !== 2) return null;
  const faceAt = faceOffStart(state, ev);
  if (!faceAt) return null;
  return { id:`${ev.id}:${contest.id}`, faceAt, start:faceAt + F.settle, end:faceAt + F.total + UNDERDOG_TEACH_MS };
}

/* a team that enters after round one: a bye (v3.1, the bottom of the board) */
export const bracketHasByes = br => (br?.rounds || []).some((round, r) => r > 0
  && round.some(match => match?.a?.t !== undefined || match?.b?.t !== undefined));

/* the live bracket's byes, once the current contest's face-off has lifted */
export function byeTeachWindow(state, ev) {
  const br = state?.brackets?.[ev?.id], draw = state?.draws?.[ev?.id];
  if (!br || !draw || !bracketHasByes(br)) return null;
  const faceAt = faceOffStart(state, ev);
  if (!faceAt) return null;
  const start = faceAt + F.total;
  return { id:`${ev.id}:${draw.id || "draw"}`, start, end:start + BYE_TEACH_MS };
}

const keyOf = win => `${win.id}@${win.end}`;
const read = kind => { try { return localStorage.getItem(STORE[kind]); } catch { return null; } };
const write = (kind, value) => { try { localStorage.setItem(STORE[kind], value); } catch {} };

/* Whether this TV may teach `win` (never taught, or taught in this very
   window) at `now`: `due` until the window ends (the face-off reads it),
   `active` inside it (the board reads it). */
export function teachState(win, now, stored) {
  if (!win) return null;
  const key = keyOf(win);
  const allowed = (!stored || stored === key) && now < win.end;
  if (!allowed) return null;
  return { ...win, key, active:now >= win.start };
}

export function useTeach(kind, win, now) {
  const teach = teachState(win, now, read(kind));
  const claim = teach && now >= (teach.faceAt ?? teach.start) ? teach.key : null;
  useEffect(() => { if (claim && read(kind) !== claim) write(kind, claim); }, [kind, claim]);
  return teach;
}
