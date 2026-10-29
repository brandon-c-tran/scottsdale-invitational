/* The phone's own sound in the Groove (float/GROOVE.md "Sound (the
   Groove)", "The phone"), on the you bus: only what is yours, and never
   music (the TV is the band).

     taps     the controller calls these inside its own touch handler, so
              they land with the thumb:
                floatTapSound(q, kind)   your tap: q a quality from chart.js
                                         (Perfect and Nice crisp, OK plain,
                                         Early or Late a muffled slap), or
                                         null for a tap that matched no cue
                                         (a soft dull tick); kind the cue's,
                                         for its tint; Last Call's one tap
                                         (kind "zero") the same whatever q
                floatDoneSound()         your Done in the chug-off
                floatCheerSound()        a cheer from the bank (once out)
     moments  from a fresh room message: your grade's jingle on the cut's
              stamp (room.show; Superb, OK, Try again); Through or Out at
              the cut on the show's beats (Out on your own, Through after
              the last; nothing for the chug-off's pair); the chug-off's
              winner Safe as the room names them, the loser Out with their
              exit; Last Call's Gulp or Safe on the countdown's verdictAt;
              your place on the podium on its beat (PODIUM_BEATS); the
              room's `done` for you when this phone did not tap it

   Silent: a catch-up (the first room message on a connection), anything
   stale or while the page is hidden, anyone else's moments. Pure apart
   from the runner, the taps and the hook. */
import { useEffect, useRef } from "react";
import { installSoundUnlock, playSound, unlockSound } from "../../../src/lib/sound.js";
import { serverNow } from "../../../src/lib/serverClock.js";
import { gradeOf } from "../../shared/chart.js";
import { CHUGOFF_BEATS, CUT_BEATS, PODIUM_BEATS, chartFor, cutBeats } from "./groove.js";

export const PHONE_FRESH_MS = 1500;
export const PHONE_EV_FRESH_MS = 1000;
/* two taps closer than this are one sound (a double touch) */
export const TAP_GAP_MS = 35;
/* a Done tap this recent stands for the room's echo of it */
export const TAP_ECHO_MS = 2500;
export const CHEER_GAP_MS = 250;
export const TAP_QUALITIES = Object.freeze(["perfect", "nice", "ok", "early", "late"]);
export const TAP_KINDS = Object.freeze(["paddle", "hey", "hop", "spin", "drop", "echo", "zero", "grab"]);

/* the controller's taps (wall clock), shared by the tap functions and the runner */
const taps = { tap:-Infinity, done:-Infinity, cheer:-Infinity };
export const lastGrooveTaps = () => ({ ...taps });

/* ── the taps: call these inside the controller's own touch handlers ── */
export function floatTapSound(q = null, kind = null) {
  try {
    unlockSound();
    const t = Date.now();
    if (t - taps.tap < TAP_GAP_MS) return null;
    taps.tap = t;
    const opts = {};
    /* Last Call's one tap sounds the same however close it was: the reveal tells */
    if (TAP_QUALITIES.includes(q) && kind !== "zero") opts.q = q;
    if (TAP_KINDS.includes(kind)) opts.kind = kind;
    return playSound("floatYouTap", { bus:"you", opts });
  } catch { return null; }
}
export function floatDoneSound() {
  try { unlockSound(); taps.done = Date.now(); return playSound("floatYouDone", { bus:"you" }); } catch { return null; }
}
export function floatCheerSound() {
  try {
    unlockSound();
    const t = Date.now();
    if (t - taps.cheer < CHEER_GAP_MS) return null;
    taps.cheer = t;
    return playSound("floatYouCheer", { bus:"you" });
  } catch { return null; }
}
/* the race's taps (the parked 3D controller's names), on the Groove's sounds:
   a stroke is a paddle tap judged on its beat, a drink is Done, a balloon a cheer */
const STROKE_Q = Object.freeze({ perfect:"perfect", good:"nice", early:"early", late:"late", fast:"early" });
export const floatStrokeSound = (side, power, q = null) => floatTapSound(STROKE_Q[q] ?? null, "paddle");
export const floatDrinkSound = () => floatDoneSound();
export const floatThrowSound = () => floatCheerSound();
export const GROOVE_TAPS = Object.freeze({ tap:floatTapSound, done:floatDoneSound, cheer:floatCheerSound,
  stroke:floatStrokeSound, drink:floatDrinkSound, throw:floatThrowSound });

/* ── the moments ── */
const num = v => { const n = Number(v); return v !== null && v !== undefined && v !== "" && Number.isFinite(n) ? n : null; };
const idx = v => typeof v === "number" && Number.isInteger(v) ? v : v && typeof v === "object" && Number.isInteger(Number(v.i)) ? Number(v.i) : null;
const list = v => (Array.isArray(v) ? v : []).map(idx).filter(i => i !== null);
export const GRADE_IDS = Object.freeze(["superb", "ok", "tryagain"]);
function phoneView(msg) {
  if (!msg || typeof msg !== "object") return null;
  const bar = msg.lastCall && typeof msg.lastCall === "object" ? msg.lastCall : null;
  const sh = msg.show && typeof msg.show === "object" ? msg.show : null;
  const c = msg.chugoff && typeof msg.chugoff === "object" ? msg.chugoff : null;
  const phase = String(msg.phase || "");
  return { phase, s:num(msg.s), round:Math.max(0, Math.floor(num(msg.round) ?? 0)), songAt:num(msg.songAt),
    startAt:num(msg.startAt), field:list(msg.field), out:list(msg.out), podium:list(msg.podium),
    chart:phase === "lastcall" ? chartFor(msg) : null,
    results:(Array.isArray(msg.results) ? msg.results : []).filter(r => r && Number.isInteger(Number(r.i))),
    show:sh ? { grades:num(sh.grades), line:num(sh.line), outs:(Array.isArray(sh.outs) ? sh.outs : []).map(o => ({ i:idx(o), at:num(o?.at) }))
      .filter(o => o.i !== null && o.at !== null), bubble:list(sh.bubble) } : null,
    chugoff:c ? { a:idx(c.a), b:idx(c.b), goAt:num(c.goAt), winner:idx(c.winner), by:typeof c.by === "string" ? c.by : null } : null,
    bar:bar ? { players:(Array.isArray(bar.totals) ? bar.totals : []).map(row => idx(row)).filter(i => i !== null),
      worst:Array.isArray(bar.worst) ? list(bar.worst) : null } : null };
}
export function initialPhone({ me = null, open = true } = {}) {
  return { open, live:false, me:idx(me), view:null, phaseAt:null, played:null, sang:null, graded:null, grade:null, kept:null,
    outsBefore:null, field:null };
}
export function phoneStatus(mem, status) {
  const open = status === "open";
  if (open && !mem.open) return { ...mem, open:true, live:false };
  if (!open && mem.open) return { ...mem, open:false, live:false };
  return mem;
}
/* your grade for this cut: the room's word for you (me.feedback), else your row's (its grade, or its percent) */
function gradeIn(m, v) {
  if (GRADE_IDS.includes(m.grade)) return m.grade;
  const row = v?.results?.find(r => Number(r.i) === m.me);
  if (!row) return null;
  if (GRADE_IDS.includes(row.grade)) return row.grade;
  return Number.isFinite(Number(row.pct)) ? gradeOf(Number(row.pct)) : null;
}
/* the jingle for your grade, once a cut, on the show's stamp (or at once, when the grade comes later) */
function gradeCue(m, v, now) {
  if (v?.phase !== "cut" || m.graded === `cut:${v.round}:${m.phaseAt}` || !Number.isInteger(m.me)) return null;
  if (!(m.field || v.field).includes(m.me) && !v.results.some(r => Number(r.i) === m.me)) return null;
  const grade = gradeIn(m, v);
  if (!grade) return null;
  m.graded = `cut:${v.round}:${m.phaseAt}`;
  const at = v.show?.grades ?? m.phaseAt + CUT_BEATS.grades;
  return { id:"floatYouGrade", at:Math.max(at, now + 60), opts:{ grade } };
}

/* One message through the phone's sound: the memory and the cues it owes,
   { id, at (Float's server ms, or null for now), opts }. ctx: now (Float's
   server ms), visible, me (the controller's own index), taps
   (lastGrooveTaps()), wall (Date.now()). */
export function phoneStep(mem, msg, ctx = {}) {
  const m = { ...(mem || initialPhone()) };
  const now = Number(ctx.now) || Date.now(), wall = Number(ctx.wall) || Date.now(), visible = ctx.visible !== false;
  const tapped = ctx.taps || taps;
  if (Number.isInteger(ctx.me)) m.me = ctx.me;
  const cues = [];
  switch (msg?.t) {
    case "welcome": {
      const mine = idx(msg.you?.entrant);
      return { mem:{ ...m, live:false, me:Number.isInteger(ctx.me) ? ctx.me : mine ?? m.me }, cues };
    }
    case "me": {
      if (Number.isInteger(Number(msg.i)) && !Number.isInteger(ctx.me)) m.me = Number(msg.i);
      /* your grade (the cut's feedback): its jingle, when the cut came first */
      const grade = msg.feedback && typeof msg.feedback === "object" ? msg.feedback.grade : null;
      if (GRADE_IDS.includes(grade)) {
        m.grade = grade;
        if (m.live && visible) { const c = gradeCue(m, m.view, now); if (c) cues.push(c); }
      }
      return { mem:m, cues };
    }
    case "room": {
      const v = phoneView(msg);
      if (!v) return { mem:m, cues };
      const s = v.s ?? now, prev = m.view;
      const fresh = m.live && visible && now - s <= PHONE_FRESH_MS;
      const moved = !prev || prev.phase !== v.phase || prev.round !== v.round;
      m.view = v; m.live = true;
      if (moved) m.phaseAt = Number.isFinite(v.startAt) && Math.abs(v.startAt - s) < 10000 ? v.startAt : s;
      if (v.phase === "song" && moved) { m.outsBefore = [...v.out]; m.field = [...v.field]; m.grade = null; }
      const me = m.me;
      /* Last Call: who drinks, on the countdown's verdict (nothing of anyone's before its reveal) */
      if (fresh && v.phase === "lastcall" && v.bar?.worst && Number.isInteger(me) && v.bar.players.includes(me)
        && m.played !== `bar:${v.songAt}` && prev && !(prev.phase === "lastcall" && prev.bar?.worst)) {
        m.played = `bar:${v.songAt}`;
        const verdict = v.chart?.countdown?.verdictAt;
        const at = Number.isFinite(v.songAt) && Number.isFinite(verdict) ? v.songAt + verdict + 120 : null;
        cues.push({ id:v.bar.worst.includes(me) ? "floatYouGulp" : "floatYouSafe", at:at !== null && at > now ? at : null });
      }
      if (fresh && v.phase === "cut") { const c = gradeCue(m, v, now); if (c) cues.push(c); }
      /* the chug-off settled: the winner keeps the spot as the room names it, the loser is out with the exit */
      const c = v.chugoff;
      if (fresh && v.phase === "chugoff" && c && Number.isInteger(c.winner) && Number.isInteger(me) && (me === c.a || me === c.b)
        && m.kept !== `chug:${c.goAt}`) {
        m.kept = `chug:${c.goAt}`;
        cues.push(me === c.winner ? { id:"floatYouSafe", at:null } : { id:"floatYouOut", at:s + CHUGOFF_BEATS.exit });
      }
      if (!fresh || !moved || !prev || !Number.isInteger(me)) return { mem:m, cues };
      /* the final's cut names nobody: your place sounds on the podium instead */
      const final = msg.rounds > 0 && v.round >= msg.rounds - 1;
      const pair = new Set([...(v.show?.bubble || []), c?.a, c?.b].filter(Number.isInteger));
      if (v.phase === "cut" && !final && prev.phase === "song" && (m.field || prev.field).includes(me) && !pair.has(me) && m.played !== `cut:${v.round}`) {
        const before = new Set(m.outsBefore || prev.out), outs = v.out.filter(i => !before.has(i) && !pair.has(i));
        const line = v.show?.line ?? m.phaseAt + cutBeats(0, 0).line;
        const own = (i, k) => v.show?.outs?.find(o => o.i === i)?.at ?? line + CUT_BEATS.after + k * CUT_BEATS.gap;
        const k = outs.indexOf(me);
        const last = outs.length ? Math.max(...outs.map(own)) : line;
        m.played = `cut:${v.round}`;
        cues.push(k >= 0 ? { id:"floatYouOut", at:own(me, k) + 60 } : { id:"floatYouSafe", at:last + 600 });
      }
      if (v.phase === "podium" && m.played !== `podium:${m.phaseAt}`) {
        const place = v.podium.indexOf(me) + 1;
        if (place >= 1 && place <= 3) {
          m.played = `podium:${m.phaseAt}`;
          cues.push({ id:"floatYouPlace", at:m.phaseAt + PODIUM_BEATS[["first", "second", "third"][place - 1]], opts:{ place } });
        }
      }
      return { mem:m, cues };
    }
    case "ev": {
      const s = Number(msg.s);
      const fresh = m.live && visible && Number.isFinite(s) && now - s <= PHONE_EV_FRESH_MS;
      if (!fresh || !Number.isInteger(m.me) || Number(msg.i) !== m.me) return { mem:m, cues };
      /* your Done in the chug-off, when this phone did not tap it (another tab, a stand-in) */
      const goAt = m.view?.chugoff?.goAt ?? m.view?.startAt;
      if (msg.e === "done" && m.view?.phase === "chugoff" && wall - tapped.done > TAP_ECHO_MS && m.sang !== `done:${goAt}`) {
        m.sang = `done:${goAt}`;
        cues.push({ id:"floatYouDone", at:null });
      }
      return { mem:m, cues };
    }
    default: return { mem:m, cues };
  }
}

/* ── the runner and the hook ── */
const pageVisible = () => { try { return globalThis.document?.visibilityState !== "hidden"; } catch { return true; } };
const floatNow = net => () => { try { const n = Number(net?.serverNow?.()); return Number.isFinite(n) && n > 0 ? n : Date.now(); } catch { return Date.now(); } };

/* Runs the phone's sound for one connection. `play(id, at, options)` sounds
   a cue (at a Float server instant, or now when at is null; default:
   playSound on the you bus at that instant on the engine's clock). */
export function createGroovePhoneSound(net, { me = null, play = null, visible = pageVisible } = {}) {
  if (!net || typeof net.on !== "function") return { stop() {}, setMe() {}, memory:() => null };
  const now = floatNow(net);
  const cue = play || ((id, at, options) => playSound(id, { bus:"you", ...options,
    ...(Number.isFinite(at) ? { at:Number(at) - now() + serverNow() } : {}) }));
  let own = idx(me);
  let status = "open";
  try { status = typeof net.status === "function" ? net.status() : "open"; } catch {}
  let mem = initialPhone({ me:own, open:status !== "closed" && status !== "connecting" });
  const offs = ["welcome", "me", "room", "ev"].map(type => {
    try {
      return net.on(type, msg => {
        try {
          const r = phoneStep(mem, { ...msg, t:type }, { now:now(), visible:visible(), me:own, taps:lastGrooveTaps(), wall:Date.now() });
          mem = r.mem;
          for (const c of r.cues) { try { cue(c.id, c.at, { opts:c.opts || {} }); } catch {} }
        } catch {}
      });
    } catch { return null; }
  });
  let offStatus = null;
  try { offStatus = net.onStatus?.(next => { mem = phoneStatus(mem, next); }) ?? null; } catch {}
  return {
    stop() { offs.forEach(off => { try { off?.(); } catch {} }); try { offStatus?.(); } catch {} },
    setMe(value) { own = idx(value); },
    memory:() => mem,
  };
}

/* The phone's sound for a connection: the global unlock (the first touch
   anywhere) and the runner. `me` is your entrant (an index, or the `me`
   message); the hook learns it from the room too. Returns the taps. */
export function useFloatControllerSound(net, { me = null } = {}) {
  const runner = useRef(null);
  const own = idx(me);
  useEffect(() => {
    try { installSoundUnlock(); } catch {}
    if (!net) return undefined;
    const r = createGroovePhoneSound(net, { me:own });
    runner.current = r;
    return () => { r.stop(); runner.current = null; };
  }, [net]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { runner.current?.setMe(own); }, [own]);
  return GROOVE_TAPS;
}
