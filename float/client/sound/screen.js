/* The screen's sound (float/PROTOCOL.md "Sound"): the river, the band and
   every moment, on the room bus. Three kinds of cue, every one on Float's
   server clock (the connection's serverNow), turned into the engine's
   clock as it is cued:

     state   a fresh room message's step: a leg's title as the grid comes
             up, the Cup's intro, 3, 2, 1 and the gun (the numbers on the
             countdown's last three seconds), the button as the round ends,
             each rider out (a floatie letting go, a step lower each, spaced
             after the button), the podium's fanfare, its places and the
             winner's pose; in the lobby a pump as a rider joins and a bell
             as one is ready.
     moment  a fresh `ev` (at its stamp plus the screen's draw delay):
             bumps (through a density rule: a pile-up is one bigger bump),
             flips, balloons and their splashes, a bell as each rider is in
             at the bar (rung three times for the first), a clink as a
             drink is finished; and from fresh snapshots, the field's
             paddles (each stroke while the field is small, a few dips a
             beat over the river's churn when it is big) and The Drop (the
             rush over the lip, the landing).
     beds    the band and the river, laid a bar at a time on a rolling
             window (music.js, river.js): whatever stands now, from the next
             bar line, so a screen that loads mid-race hears what is ahead.

   Silence rules: the first room message on a connection (a load, a
   reconnect) is a catch-up and sounds nothing; so does anything stamped
   longer ago than its window, anything while the page is hidden, and a
   snapshot after a gap. Reduced motion: no beds and no paddles; each
   sequence plays its one summary sound. Pure apart from the runner and the
   hook at the bottom. */
import { useEffect } from "react";
import { cueAt, installSoundUnlock, primeSound, setSoundRoom, setSoundSurface, soundSurface } from "../../../src/lib/sound.js";
import { serverNow } from "../../../src/lib/serverClock.js";
import { COUNTDOWN_MS, FLAG, INTERP_MS, courseInfo, cupView, gunTime, has, legOf, panAcross, rowOf } from "./cup.js";
import { BAR_MS, MUSIC_LEAD_MS, barAt, barCue, firstBar, musicTrack } from "./music.js";
import { RIVER_LEAD_MS, RIVER_STEP_MS, riverCue, riverTrack } from "./river.js";

/* how old a message may be when it lands and still sound */
export const ROOM_FRESH_MS = 1500;
export const EV_FRESH_MS = 700;
export const SNAP_FRESH_MS = 500;
/* snapshots further apart than this are a gap: the next one only records */
export const SNAP_GAP_MS = 400;
/* the beds stop once the connection has been down this long */
export const CLOSED_GRACE_MS = 3000;
/* the outs: the first this long after the button, the rest this far apart */
export const OUT_AFTER_MS = 650, OUT_GAP_MS = 380;
/* the podium's beats, ms from its start: the fanfare's hit (3rd), its
   middle stab (2nd), the big chord (1st), then the winner's pose. The
   screen reveals each place on these. */
export const PODIUM_BEATS = Object.freeze({ third:1450, second:2200, first:2700, pose:3400 });
/* the countdown's numbers, ms before the gun */
export const COUNT_BEATS = Object.freeze([3000, 2000, 1000]);
/* density: bumps, flips, clinks and later landings */
export const BUMP = Object.freeze({ gap:110, crowd:3, window:400 });
export const FLIP_GAP_MS = 250, CLINK_GAP_MS = 90, IMPACT_GAP_MS = 600, FALL_GAP_MS = 700;
/* the paddles: each stroke heard below this rate (strokes a second), above it a dip every PADDLE_GAP_MS */
export const PADDLE_SOLO_RATE = 9, PADDLE_GAP_MS = 110;

export function initialScreen({ open = true } = {}) {
  return { open, closedAt:0, live:false, view:null, course:null, gun:null, phaseAt:null, titled:null, cutAt:null,
    buttonAt:null, outs:null, firstIn:null, arrivals:null, peakTense:null, landed:null, pack:null,
    drops:null, paddle:{ last:-Infinity, rate:0, at:0 }, bump:{ last:-Infinity, recent:[], crowdUntil:-Infinity },
    lastFlip:-Infinity, lastClink:-Infinity, lobby:null };
}

/* the connection's status: the first room after it opens is a catch-up */
export function screenStatus(mem, status, now = 0) {
  const open = status === "open";
  if (open && !mem.open) return { ...mem, open:true, live:false, pack:null };
  if (!open && mem.open) return { ...mem, open:false, closedAt:now, live:false, pack:null };
  return mem;
}
/* still connected, or dropped too recently to stop the beds */
export const connected = (mem, now) => !!mem && (mem.open || now - (mem.closedAt || 0) < CLOSED_GRACE_MS);

const keyOf = (mem, ...parts) => ["float", mem.view?.code || "room", ...parts].join(":");
const phaseStart = (v, s) => Number.isFinite(v.startAt) && Number.isFinite(s) && Math.abs(v.startAt - s) < 10000 ? v.startAt : s;

/* One message through the screen's sound. Returns the memory to keep and
   the cues it owes, { id, at (Float's server ms), pan, opts, key, open }. */
export function screenStep(mem, msg, ctx = {}) {
  const m = mem || initialScreen();
  const now = Number(ctx.now) || Date.now(), visible = ctx.visible !== false, reduced = !!ctx.reduced;
  switch (msg?.t) {
    case "welcome": return { mem:{ ...m, live:false, pack:null }, cues:[] };
    case "room": return roomStep(m, msg, { now, visible, reduced });
    case "snap": return snapStep(m, msg, { now, visible, reduced });
    case "ev": return evStep(m, msg, { now, visible, reduced });
    default: return { mem:m, cues:[] };
  }
}

/* ── the room ── */
function roomStep(mem, msg, { now, visible, reduced }) {
  const v = cupView(msg);
  if (!v) return { mem, cues:[] };
  const s = Number.isFinite(v.s) ? v.s : now;
  const prev = mem.view;
  const fresh = mem.live && visible && now - s <= ROOM_FRESH_MS;
  const m = { ...mem, live:true, view:v };
  if (msg.course && typeof msg.course === "object") m.course = courseInfo(msg.course);
  const moved = !prev || prev.phase !== v.phase || prev.round !== v.round;
  if (moved) {
    m.phaseAt = phaseStart(v, s);
    if (v.phase !== prev?.phase || v.round !== prev?.round) m.titled = null;
  }
  if (v.phase === "countdown" || v.phase === "race") {
    const at = gunTime(v, m.gun?.round === v.round ? m.gun : null);
    if (Number.isFinite(at)) m.gun = { round:v.round, at };
  }
  if (v.phase === "cut" && moved && !Number.isFinite(m.cutAt)) m.cutAt = s;
  if (v.phase !== "cut" && moved) m.cutAt = v.phase === "race" || v.phase === "countdown" || v.phase === "grid" ? null : m.cutAt;
  const cues = [];
  /* the lobby: who joined and who is ready (recorded always, sounded fresh) */
  if (v.phase === "lobby") {
    const before = m.lobby || { devices:new Set(), ready:new Set() };
    const devices = new Set(v.entrants.map(e => e.device)), ready = new Set(v.entrants.filter(e => e.ready).map(e => e.device));
    if (fresh && prev?.phase === "lobby") {
      v.entrants.filter(e => !before.devices.has(e.device)).slice(0, 4).forEach((e, k) =>
        cues.push({ id:"floatJoin", at:s + 60 + k * 140, pan:entrantPan(e.i, v.entrants.length), key:keyOf(m, "join", e.device, s) }));
      v.entrants.filter(e => e.ready && !before.ready.has(e.device) && before.devices.has(e.device)).slice(0, 4).forEach((e, k) =>
        cues.push({ id:"floatReady", at:s + 60 + k * 120, pan:entrantPan(e.i, v.entrants.length), key:keyOf(m, "ready", e.device, s) }));
    }
    m.lobby = { devices, ready };
  } else m.lobby = null;
  if (fresh && moved && prev) cues.push(...phaseCues(m, prev, v, s, now, reduced));
  return { mem:m, cues };
}

const entrantPan = (i, n) => n > 1 ? Math.round((-0.6 + 1.2 * i / (n - 1)) * 100) / 100 : 0;
/* the button: once a round, whether the cut or its first out says so first */
export const BUTTON_HOLD_MS = 4000;
const buttonRang = (m, s) => Number.isFinite(m.buttonAt) && Math.abs(s - m.buttonAt) < BUTTON_HOLD_MS;
function button(m, s) { m.buttonAt = s; return { id:"floatButton", at:s + 30, key:keyOf(m, "button", s) }; }

/* what a change of phase owes the room */
function phaseCues(m, prev, v, s, now, reduced) {
  const cues = [];
  const round = v.round;
  switch (v.phase) {
    case "intro":
      cues.push({ id:"floatIntro", at:s + 60, opts:reduced ? { summary:true } : {}, key:keyOf(m, "intro", s) });
      m.titled = `intro:${round}`;
      break;
    case "grid":
      cues.push({ id:"floatTitle", at:s + 60, opts:{ leg:Math.min(3, v.leg), final:v.final, ...(reduced ? { summary:true } : {}) },
        key:keyOf(m, "title", round, s) });
      m.titled = `grid:${round}`;
      break;
    case "countdown": {
      const gun = m.gun?.round === round ? m.gun.at : null;
      if (!Number.isFinite(gun)) break;
      const start = Number.isFinite(m.phaseAt) ? m.phaseAt : s;
      if (!reduced) COUNT_BEATS.forEach((ms, k) => {
        const at = gun - ms;
        if (at >= start - 120 && at > now - 250) cues.push({ id:"floatCount", at, opts:{ n:3 - k, final:v.final }, key:keyOf(m, "count", round, 3 - k) });
      });
      cues.push({ id:"floatGo", at:gun, opts:{ final:v.final }, key:keyOf(m, "go", round) });
      break;
    }
    case "race": {
      /* straight from the grid (a resumed race): the gun, if it is still to come */
      const gun = m.gun?.round === round ? m.gun.at : null;
      if (prev.phase !== "countdown" && Number.isFinite(gun) && gun > now - 250) cues.push({ id:"floatGo", at:gun, opts:{ final:v.final }, key:keyOf(m, "go", round) });
      break;
    }
    case "cut":
      if (!buttonRang(m, s)) { cues.push(button(m, s)); m.cutAt = s; }
      break;
    case "podium": {
      const at = s + 60;
      /* the final's race stops on the button, then the fanfare */
      if (prev.phase === "race" && !buttonRang(m, s)) cues.push(button(m, s));
      if (reduced) { cues.push({ id:"floatPodium", at, opts:{ summary:true }, open:true, key:keyOf(m, "podium", s) }); break; }
      cues.push({ id:"floatPodium", at, open:true, key:keyOf(m, "podium", s) });
      [[3, PODIUM_BEATS.third], [2, PODIUM_BEATS.second], [1, PODIUM_BEATS.first]].forEach(([place, ms]) => {
        if (v.podium.length >= place || !v.podium.length) cues.push({ id:"floatStamp", at:at + ms, opts:{ place }, open:true, key:keyOf(m, "stamp", place, s) });
      });
      const winner = v.entrants[v.podium[0]];
      cues.push({ id:"floatWinner", at:at + PODIUM_BEATS.pose, opts:{ pose:winner?.pose || "" }, open:true, key:keyOf(m, "winner", s) });
      break;
    }
    default: break;
  }
  return cues;
}

/* ── the moments ── */
function evStep(mem, msg, { now, visible, reduced }) {
  const s = Number(msg.s);
  if (!mem.live || !visible || !Number.isFinite(s) || now - s > EV_FRESH_MS) return { mem:noteEv(mem, msg), cues:[] };
  const m = { ...mem };
  const at = s + INTERP_MS, i = Number(msg.i), j = msg.j === undefined || msg.j === null ? null : Number(msg.j);
  const round = m.view?.round ?? 0;
  const pan = who => riderPan(m, who, msg);
  const cues = [];
  switch (msg.e) {
    case "bump": {
      const b = bumpStep(m.bump, at);
      m.bump = b.memory;
      if (b.kind === "bump") cues.push({ id:j === null ? "floatScrape" : "floatBump", at:b.at, pan:pan(i) });
      else if (b.kind === "pile") cues.push({ id:"floatBump", at:b.at, pan:pan(i), opts:{ big:true } });
      break;
    }
    case "flip":
      if (at - m.lastFlip >= FLIP_GAP_MS) { m.lastFlip = at; cues.push({ id:"floatFlip", at, pan:pan(i), opts:reduced ? { summary:true } : {}, key:keyOf(m, "flip", i, s) }); }
      break;
    case "balloon":
      if (!reduced) cues.push({ id:"floatLob", at, pan:pan(j ?? i), opts:{ ms:1200 }, key:keyOf(m, "lob", i, j, s) });
      break;
    case "splash":
      cues.push({ id:"floatSplat", at, pan:pan(j ?? i), opts:reduced ? { summary:true } : {}, key:keyOf(m, "splat", j ?? i, s) });
      break;
    case "arrive": {
      /* the round's first bell rings three times (the cap's clock may already know from a snapshot) */
      if (!(m.firstIn?.round === round)) m.firstIn = { round, at:s };
      const n = m.arrivals?.round === round ? m.arrivals.n : 0;
      m.arrivals = { round, n:n + 1 };
      cues.push({ id:"floatBell", at, pan:pan(i), opts:n === 0 ? { first:true } : { step:n }, key:keyOf(m, "in", round, i) });
      break;
    }
    case "drink": {
      const rider = m.view?.entrants?.[i];
      if (m.view?.drinking === false || rider?.drinks === false || at - m.lastClink < CLINK_GAP_MS) break;
      m.lastClink = at;
      cues.push({ id:"floatClink", at, pan:pan(i), opts:{ step:i }, key:keyOf(m, "drink", round, i) });
      break;
    }
    case "out": {
      /* the round ends on the button, whichever of the cut and its outs lands first */
      if (!buttonRang(m, s) && m.view?.phase !== "podium") { cues.push(button(m, s)); m.cutAt = s; }
      /* one cut's outs: those within a few seconds of each other, a step lower each */
      const seq = m.outs && s - m.outs.lastS < 5000 ? m.outs : { n:0, next:-Infinity, lastS:s };
      if (reduced && seq.n > 0) { m.outs = { ...seq, lastS:s }; break; }
      const after = Number.isFinite(m.cutAt) && s - m.cutAt < 3000 ? m.cutAt + OUT_AFTER_MS : -Infinity;
      const when = Math.max(at, seq.next, after);
      m.outs = { n:seq.n + 1, next:when + OUT_GAP_MS, lastS:s };
      cues.push({ id:"floatOut", at:when, pan:pan(i), opts:{ step:seq.n }, key:keyOf(m, "out", round, i) });
      break;
    }
    default: break;
  }
  return { mem:m, cues };
}
/* what an event teaches even when it is too old to sound: who is in */
function noteEv(mem, msg) {
  if (msg?.e !== "arrive" || !mem.view) return mem;
  const round = mem.view.round, n = mem.arrivals?.round === round ? mem.arrivals.n : 0;
  return { ...mem, firstIn:mem.firstIn?.round === round ? mem.firstIn : { round, at:Number(msg.s) || 0 }, arrivals:{ round, n:n + 1 } };
}
/* the bumps' density rule: one each BUMP.gap at most; a third inside the
   window is a pile-up, and the pile-up swallows the rest of its window */
export function bumpStep(memory, at) {
  const mem = memory || { last:-Infinity, recent:[], crowdUntil:-Infinity };
  const recent = [...mem.recent.filter(x => at - x <= BUMP.window), at];
  if (at < mem.crowdUntil) return { memory:{ ...mem, recent }, kind:"skip", at };
  if (recent.length >= BUMP.crowd) return { memory:{ last:at, recent, crowdUntil:at + BUMP.window }, kind:"pile", at:Math.max(at, mem.last + BUMP.gap) };
  if (at - mem.last >= BUMP.gap) return { memory:{ ...mem, last:at, recent }, kind:"bump", at };
  return { memory:{ ...mem, recent }, kind:"skip", at };
}
/* where a rider is across the river (their snapshot, else the event's own x, y) */
function riderPan(mem, i, msg) {
  if (!Number.isFinite(i)) return 0;
  const r = mem.pack?.riders?.[i];
  const leg = legOf(mem.course, mem.view?.leg ?? 0);
  const x = Number.isFinite(Number(msg?.x)) ? Number(msg.x) : r?.x, y = Number.isFinite(Number(msg?.y)) ? Number(msg.y) : r?.y;
  return panAcross(mem.course, x, y, (leg?.base ?? 0) + (r?.p ?? 0));
}

/* ── the snapshots: the pack, its paddles, The Drop ── */
const tenseOf = f => f >= 0.97 ? 5 : f >= 0.935 ? 4 : f >= 0.9 ? 3 : f >= 0.86 ? 2 : f >= 0.82 ? 1 : 0;
function snapStep(mem, msg, { now, visible, reduced }) {
  const s = Number(msg.s);
  const rows = (Array.isArray(msg.k) ? msg.k : []).map(rowOf).filter(r => r && Number.isInteger(r.i));
  if (!Number.isFinite(s) || !rows.length) return { mem, cues:[] };
  const v = mem.view, prev = mem.pack;
  const contiguous = !!prev && s > prev.s && s - prev.s <= SNAP_GAP_MS;
  const fresh = mem.live && visible && contiguous && now - s <= SNAP_FRESH_MS && v?.phase === "race";
  const m = { ...mem };
  const round = v?.round ?? 0;
  const leg = legOf(m.course, v?.leg ?? 0), base = leg?.base ?? 0;
  const field = new Set(v?.field?.length ? v.field : rows.map(r => r.i));
  const riders = {};
  for (const r of rows) riders[r.i] = { p:r.p, f:r.f, x:r.x, y:r.y };
  const mine = rows.filter(r => field.has(r.i));
  const racing = mine.filter(r => !has(r.f, FLAG.ARRIVED));
  const pool = racing.length ? racing : mine;
  const ps = pool.map(r => r.p).sort((a, b) => b - a);
  const leaderP = ps[0] ?? 0, focusP = ps.length ? ps.slice(0, 3).reduce((a, b) => a + b, 0) / Math.min(3, ps.length) : 0;
  const leaderFrac = leg && racing.length ? leaderP / leg.len : 0;
  let speed = prev?.speed ?? 2;
  if (contiguous && Number.isFinite(prev.leaderP) && prev.round === round) {
    const inst = (leaderP - prev.leaderP) / ((s - prev.s) / 1000);
    if (Number.isFinite(inst) && inst >= 0 && inst < 12) speed = speed * 0.85 + inst * 0.15;
  }
  m.pack = { s, round, riders, leaderP, leaderS:base + leaderP, leaderFrac, focusS:base + focusP, speed };
  /* the leader's tense never falls back before anyone is in */
  if (v?.phase === "race" && !(m.firstIn?.round === round)) {
    const level = Math.max(tenseOf(leaderFrac), m.peakTense?.round === round ? m.peakTense.level : 0);
    m.peakTense = { round, level };
  }
  if (v?.phase === "race" && !(m.firstIn?.round === round) && mine.some(r => has(r.f, FLAG.ARRIVED) && !(prev?.riders?.[r.i] && has(prev.riders[r.i].f, FLAG.ARRIVED))))
    m.firstIn = { round, at:s };
  const cues = [];
  if (!contiguous || v?.phase !== "race") return { mem:m, cues };
  const at = s + INTERP_MS;
  /* the paddles: rising stroke bits, never from a swimmer */
  const edges = [];
  for (const r of racing) {
    const was = prev.riders[r.i];
    if (!was || has(r.f, FLAG.SWIM)) continue;
    const n = (has(r.f, FLAG.STROKE_L) && !has(was.f, FLAG.STROKE_L) ? 1 : 0) + (has(r.f, FLAG.STROKE_R) && !has(was.f, FLAG.STROKE_R) ? 1 : 0);
    for (let k = 0; k < n; k++) edges.push(r);
  }
  const dt = Math.max(0.02, (s - prev.s) / 1000);
  const rate = m.paddle.rate + (edges.length / dt - m.paddle.rate) * Math.min(1, dt / 0.8);
  m.paddle = { ...m.paddle, rate, at:s };
  if (fresh && !reduced && edges.length) {
    const solo = rate < PADDLE_SOLO_RATE;
    if (solo || at - m.paddle.last >= PADDLE_GAP_MS) {
      const take = solo ? edges.slice(0, 3) : edges.slice(0, 1);
      cues.push({ id:"floatPaddles", at, opts:{ n:edges.length, grains:take.length,
        offsets:take.map((_, k) => Math.round(k * 40 / Math.max(1, take.length - 1 || 1))),
        pans:take.map(r => panAcross(m.course, r.x, r.y, base + r.p)) } });
      m.paddle = { ...m.paddle, last:at };
    }
  }
  /* The Drop: over the lip and down, the first of the round in full, the rest smaller and spaced */
  const falls = (m.course?.falls || []).filter(f => !leg || (f.top >= leg.base - 1 && f.top <= leg.end + 1));
  if (falls.length) {
    const drops = m.drops?.round === round ? { ...m.drops, over:new Set(m.drops.over), down:new Set(m.drops.down) }
      : { round, over:new Set(), down:new Set(), lastFall:-Infinity, lastImpact:-Infinity };
    for (const r of mine) {
      const was = prev.riders[r.i];
      if (!was) continue;
      const s0 = base + was.p, s1 = base + r.p;
      for (const fall of falls) {
        if (s0 < fall.top && s1 >= fall.top && !drops.over.has(r.i)) {
          drops.over.add(r.i);
          if (fresh && !reduced && at - drops.lastFall >= FALL_GAP_MS) {
            drops.lastFall = at;
            const ms = Math.max(300, Math.min(1200, ((fall.bottom - fall.top) / Math.max(1, speed)) * 1000 + 400));
            cues.push({ id:"floatFall", at, pan:panAcross(m.course, r.x, r.y, s1), opts:{ ms }, key:keyOf(m, "fall", round, r.i) });
          }
        }
        if (s0 < fall.bottom && s1 >= fall.bottom && !drops.down.has(r.i)) {
          const first = drops.down.size === 0;
          drops.down.add(r.i);
          if (first) m.landed = { round, at:s };
          if (fresh && (first || at - drops.lastImpact >= IMPACT_GAP_MS)) {
            drops.lastImpact = at;
            cues.push({ id:"floatImpact", at, pan:panAcross(m.course, r.x, r.y, s1), opts:first ? {} : { small:true }, key:keyOf(m, "land", round, r.i) });
          }
        }
      }
    }
    m.drops = drops;
  }
  return { mem:m, cues };
}

/* ── the runner: the step on a live connection, the beds on a rolling window ── */
const reducedMotion = () => { try { return !!globalThis.window?.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches; } catch { return false; } };
const pageVisible = () => { try { return globalThis.document?.visibilityState !== "hidden"; } catch { return true; } };
/* Float's server clock (the connection's), else this device's */
export const floatClock = net => () => {
  try { const n = Number(net?.serverNow?.()); return Number.isFinite(n) && n > 0 ? n : Date.now(); } catch { return Date.now(); }
};
/* a Float server instant on the engine's clock: both read now */
export const toEngine = (at, floatNow, engineNow) => Number(at) - Number(floatNow) + Number(engineNow);

function bed() { return { key:null, track:null, next:0, handles:[], last:null }; }
function cancelBed(b) { for (const h of b.handles) { try { h.handle?.cancel?.(); } catch {} } b.handles = []; }

/* Runs the screen's sound for one connection. `play(id, at, options)`
   sounds a cue at a Float server instant (default: cueAt on the room bus,
   at that instant on the engine's clock) and returns its handle. */
export function createFloatScreenSound(net, { play = null, reduced = reducedMotion, visible = pageVisible, tickMs = 125,
  setInterval:every = globalThis.setInterval, clearInterval:stopEvery = globalThis.clearInterval } = {}) {
  if (!net || typeof net.on !== "function") return { stop() {}, memory:() => null };
  const now = floatClock(net);
  const cue = play || ((id, at, options) => cueAt(id, toEngine(at, now(), serverNow()), options));
  let status = "open";
  try { status = typeof net.status === "function" ? net.status() : "open"; } catch {}
  let mem = initialScreen({ open:status !== "closed" && status !== "connecting" });
  const beds = { music:bed(), river:bed() };
  const ctx = () => ({ now:now(), visible:visible(), reduced:reduced() });
  const sound = cues => { for (const c of cues) { try { cue(c.id, c.at, { pan:c.pan || 0, opts:c.opts || {}, key:c.key ?? null, open:!!c.open }); } catch {} } };
  const lay = () => {
    try {
      const c = ctx();
      const up = c.visible && connected(mem, c.now);
      syncBed(beds.music, up ? musicTrack(mem, c) : null, c.now, MUSIC_LEAD_MS, (track, i) => barCue(track, i, mem), barAt, firstBar);
      syncBed(beds.river, up ? riverTrack(mem, c) : null, c.now, RIVER_LEAD_MS, (track, i) => {
        const r = riverCue(i, mem, beds.river.last);
        beds.river.last = r.opts.to;
        return r;
      }, (track, i) => i * RIVER_STEP_MS, (track, t) => Math.ceil((t + 60) / RIVER_STEP_MS));
    } catch {}
  };
  function syncBed(b, track, t, lead, cueOf, startOf, first) {
    if ((track?.key ?? null) !== b.key) {
      cancelBed(b);
      Object.assign(b, { key:track?.key ?? null, track, next:track ? first(track, t) : 0, last:null });
    }
    if (!track) return;
    /* back from a stall (a hidden page, a slow tab): on from the next bar line */
    if (startOf(b.track, b.next) < t - 1000) b.next = first(b.track, t);
    for (let guard = 0; guard < 8 && startOf(b.track, b.next) < t + lead; guard++, b.next++) {
      const at = startOf(b.track, b.next);
      if (at < t - 120) continue;
      const c = cueOf(b.track, b.next);
      b.handles.push({ at:c.at, handle:cue(c.id, c.at, { opts:c.opts || {} }) });
    }
    b.handles = b.handles.filter(h => h.at > t - 8000);
  }
  const offs = ["welcome", "room", "snap", "ev"].map(type => {
    try { return net.on(type, msg => {
      try { const r = screenStep(mem, { ...msg, t:type }, ctx()); mem = r.mem; sound(r.cues); lay(); } catch {}
    }); } catch { return null; }
  });
  let offStatus = null;
  try { offStatus = net.onStatus?.(next => { mem = screenStatus(mem, next, now()); lay(); }) ?? null; } catch {}
  const timer = every(lay, tickMs);
  return {
    stop() {
      stopEvery(timer);
      offs.forEach(off => { try { off?.(); } catch {} });
      try { offStatus?.(); } catch {}
      cancelBed(beds.music); cancelBed(beds.river);
    },
    memory:() => mem,
    beds:() => beds,
    tick:lay,
  };
}

/* The screen's sound on its page: the TV's surface (the room bus), the
   context made at once (a kiosk TV runs it; anything else waits for the
   first click, useFloatSoundUnlockNeeded), the global unlock, and the
   runner for the connection. On Float's own page the room's reverb is the
   night's; inside Field Day's TV the weekend's own stays. */
export function useFloatScreenSound(net, options = {}) {
  useEffect(() => {
    if (!net) return undefined;
    try {
      const own = soundSurface() !== "tv";
      setSoundSurface("tv");
      if (own) setSoundRoom("san");
      primeSound();
      installSoundUnlock();
    } catch {}
    const runner = createFloatScreenSound(net, options);
    return () => runner.stop();
  }, [net]); // eslint-disable-line react-hooks/exhaustive-deps
}

export { BAR_MS, COUNTDOWN_MS };
