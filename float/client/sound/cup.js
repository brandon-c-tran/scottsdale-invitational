/* What Float's sound reads from the room (float/PROTOCOL.md "The Cup", "The
   course data"). Pure: no DOM, no Web Audio, no engine. Everything the
   screen's and the phone's sound decide is decided from these shapes, so
   the tests can drive them with synthetic message streams.

   The contract leaves two timings to read: `startAt` and `endsAt` on the
   room. gunTime() takes the race's gun from whichever of them is ahead of
   the countdown message (a countdown names the gun as its end, or the
   race's start), and remembers it for the round. */
import { FLAG } from "../../shared/protocol.js";

/* the screen draws the race this far behind serverNow (shared/tuning.js
   INTERP_MS), so a moment in the world sounds this much after its stamp */
export const INTERP_MS = 100;
/* a restarted room resumes with a 3 s countdown; the numbers are its last three seconds */
export const COUNTDOWN_MS = 3000;
/* a round's cap: 30 s after its first finisher */
export const CAP_MS = 30000;

export { FLAG };

/* the Cup's phases (PROTOCOL.md), and the stale names in shared/protocol.js mapped onto them */
const PHASE = Object.freeze({ lobby:"lobby", intro:"intro", grid:"grid", countdown:"countdown", race:"race", cut:"cut",
  results:"cut", podium:"podium", feedback:"feedback" });
export const phaseOf = name => PHASE[name] || "other";

const num = value => { const n = Number(value); return value !== null && value !== undefined && value !== "" && Number.isFinite(n) ? n : null; };
/* an entrant index, from a bare index or an object carrying `i` */
export const indexOf = value => typeof value === "number" && Number.isInteger(value) ? value
  : value && typeof value === "object" && Number.isInteger(Number(value.i)) ? Number(value.i) : null;
const indexes = list => (Array.isArray(list) ? list : []).map(indexOf).filter(i => i !== null);

/* one room message, reduced to what can sound */
export function cupView(msg) {
  if (!msg || typeof msg !== "object") return null;
  const round = Math.max(0, Math.floor(num(msg.round) ?? 0)), rounds = Math.max(0, Math.floor(num(msg.rounds) ?? 0));
  const entrants = Array.isArray(msg.entrants) ? msg.entrants : [];
  return {
    phase:phaseOf(msg.phase), s:num(msg.s), code:String(msg.code ?? ""), mode:msg.mode === "fieldday" ? "fieldday" : "party",
    round, rounds, leg:Math.max(0, Math.floor(num(msg.leg) ?? round)),
    /* the last round is the final (with three riders or fewer every round is raced, and the last decides) */
    final:rounds > 0 && round >= rounds - 1,
    field:indexes(msg.field), out:indexes(msg.out), podium:indexes(msg.podium),
    startAt:num(msg.startAt), endsAt:num(msg.endsAt), drinking:msg.drinking !== false,
    entrants:entrants.map((e, i) => ({ i, device:String(e?.device ?? `#${i}`), ready:!!e?.ready, bot:!!e?.bot,
      drinks:e?.drinks !== false, pose:String(e?.look?.pose ?? "") })),
  };
}

/* The race's gun for a countdown or race view: the first of startAt and
   endsAt more than half a second ahead of the countdown's message (a
   countdown's own start is never that far ahead), else its end, else three
   seconds on. A race's gun is its startAt. `memo` ({ round, at }) keeps the
   round's gun once known, so a later message about something else in the
   countdown cannot move it. */
export function gunTime(view, memo = null) {
  if (!view) return null;
  if (memo && memo.round === view.round && Number.isFinite(memo.at)) {
    if (view.phase === "race" && Number.isFinite(view.startAt) && Math.abs(view.startAt - memo.at) > 250) return view.startAt;
    return memo.at;
  }
  const s = view.s ?? 0;
  if (view.phase === "race") return view.startAt ?? s;
  if (view.phase !== "countdown") return null;
  const ahead = [view.startAt, view.endsAt].filter(at => Number.isFinite(at) && at > s + 500);
  if (ahead.length) return Math.min(...ahead);
  if (Number.isFinite(view.endsAt)) return view.endsAt;
  return (view.startAt ?? s) + COUNTDOWN_MS;
}

/* ── the river ── */
/* the zones' sound by kind; anything else is a pool */
export const ZONES = Object.freeze(["pool", "riffle", "narrows", "eddy", "whirlpool", "split", "drop", "bar"]);

/* The course reduced to what the sound reads: each leg's start line, takeout
   and length, the zones in order, where each waterfall's lip and foot are,
   and the centreline for a rider's place across the river. */
export function courseInfo(course) {
  if (!course || typeof course !== "object") return null;
  const line = (Array.isArray(course.line) ? course.line : []).filter(p => Array.isArray(p) && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1])))
    .map(p => [Number(p[0]), Number(p[1]), Math.max(1, Number(p[2]) || 10)]);
  const S = [0];
  for (let k = 1; k < line.length; k++) S.push(S[k - 1] + Math.hypot(line[k][0] - line[k - 1][0], line[k][1] - line[k - 1][1]));
  const legs = (Array.isArray(course.legs) ? course.legs : []).map((leg, i) => {
    const s0 = num(leg?.s0) ?? 0, s1 = num(leg?.s1) ?? s0;
    const base = num(leg?.grid) ?? s0, end = num(leg?.finish) ?? s1;
    return { i, id:String(leg?.id ?? i), name:String(leg?.name ?? ""), s0, s1, base, end, len:Math.max(1, end - base) };
  });
  const zones = (Array.isArray(course.zones) ? course.zones : [])
    .map(z => ({ k:ZONES.includes(z?.k) ? z.k : "pool", s0:num(z?.s0), s1:num(z?.s1) }))
    .filter(z => z.s0 !== null && z.s1 !== null && z.s1 > z.s0).sort((a, b) => a.s0 - b.s0);
  return { id:String(course.id ?? ""), line, S, length:S[S.length - 1] || 0, legs, zones, falls:fallsOf(course.elev, zones) };
}

/* The waterfalls: where the water surface drops steeply (elev), lip and
   foot; else the last fifth of each drop zone. */
export function fallsOf(elev, zones = []) {
  const pts = (Array.isArray(elev) ? elev : []).map(p => [Number(p?.[0]), Number(p?.[1])]).filter(p => p.every(Number.isFinite)).sort((a, b) => a[0] - b[0]);
  const falls = [];
  let run = null;
  for (let k = 1; k < pts.length; k++) {
    const ds = pts[k][0] - pts[k - 1][0], dz = pts[k][1] - pts[k - 1][1];
    const steep = ds > 0 && dz / ds < -0.25;
    if (steep && !run) run = { top:pts[k - 1][0], z0:pts[k - 1][1], bottom:pts[k][0], z1:pts[k][1] };
    else if (steep) Object.assign(run, { bottom:pts[k][0], z1:pts[k][1] });
    else if (run) { if (run.z0 - run.z1 >= 1.5) falls.push({ top:run.top, bottom:run.bottom }); run = null; }
  }
  if (run && run.z0 - run.z1 >= 1.5) falls.push({ top:run.top, bottom:run.bottom });
  if (falls.length) return falls;
  return zones.filter(z => z.k === "drop").map(z => ({ top:z.s1 - Math.max(2, (z.s1 - z.s0) * 0.2), bottom:z.s1 }));
}

export const legOf = (info, leg) => info?.legs?.[leg] || info?.legs?.find(l => l.i === leg) || null;
/* a rider's distance along the whole river, from their progress along the leg */
export const riverS = (info, leg, p) => (legOf(info, leg)?.base ?? 0) + (Number(p) || 0);
export function zoneAt(info, s) {
  if (!info || !Number.isFinite(s)) return "pool";
  const z = info.zones.find(zone => s >= zone.s0 && s < zone.s1);
  return z ? z.k : "pool";
}
/* how near the next waterfall's lip is, 0 (far) to 1 (at it), falling away again past its foot */
export function roarAt(info, s, { reach = 140, after = 60 } = {}) {
  if (!info?.falls?.length || !Number.isFinite(s)) return 0;
  let best = 0;
  for (const fall of info.falls) {
    if (s < fall.top) best = Math.max(best, 1 - (fall.top - s) / reach);
    else if (s <= fall.bottom) best = 1;
    else best = Math.max(best, 1 - (s - fall.bottom) / after);
  }
  return Math.max(0, Math.min(1, best));
}
/* A rider's place across the river as a pan: the right bank looking
   downstream to the right (the screen looks down the river behind the
   pack), at most `width`. 0 without a course. */
export function panAcross(info, x, y, s, width = 0.6) {
  if (!info || info.line.length < 2 || !Number.isFinite(Number(x)) || !Number.isFinite(Number(y)) || !Number.isFinite(s)) return 0;
  const { line, S } = info;
  let lo = 0, hi = S.length - 1;
  const at = Math.max(0, Math.min(S[hi], s));
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (S[mid] <= at) lo = mid; else hi = mid; }
  const span = Math.max(1e-6, S[hi] - S[lo]), k = (at - S[lo]) / span;
  const cx = line[lo][0] + (line[hi][0] - line[lo][0]) * k, cy = line[lo][1] + (line[hi][1] - line[lo][1]) * k;
  const w = line[lo][2] + (line[hi][2] - line[lo][2]) * k;
  const tx = (line[hi][0] - line[lo][0]) / span, ty = (line[hi][1] - line[lo][1]) / span;
  /* the cross product is positive to the left of the flow */
  const left = tx * (Number(y) - cy) - ty * (Number(x) - cx);
  return Math.round(Math.max(-1, Math.min(1, -left / Math.max(1, w / 2))) * width * 100) / 100;
}

/* ── the field ── */
/* one snapshot row ([i, x, y, a, f, p]) */
export const rowOf = row => Array.isArray(row) ? { i:Number(row[0]), x:Number(row[1]), y:Number(row[2]), a:Number(row[3]), f:Number(row[4]) | 0, p:Number(row[5]) || 0 } : null;
export const has = (flags, bit) => (Number(flags) & bit) === bit;
