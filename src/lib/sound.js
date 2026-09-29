/* The sound engine (A1). One lazy AudioContext for the whole app; every
   sound in Field Day goes through playSound() here, and nothing else in the
   app touches Web Audio (tests/sound-engine.test.mjs checks that).

   THE RULES
   1. The TV is the room's voice; a phone speaks only to its owner. Three
      buses: `room` sounds only on the TV surface, `you` and `gm` only on a
      phone (gm is the commissioner's own phone; its callers are
      commissioner-only).
   2. Sound rides motion. A sound plays only where its motion plays: never on
      a first load, reconnect, foreground catch-up or correction. Remote
      moments check the frame gate (freshFrameNow); taps are always the
      user's own. A server-anchored cue that is already late is dropped, so a
      TV that joins mid-sequence is silent.
   3. Hush: while a walkout plays (state.showControl.audio.walkout, until its
      `until`) and while Quick Draw is armed (armed until the reaction is
      captured), nothing plays, and anything already ringing fades out over
      150 ms. A sound can never pass for GO.
   4. Never block input or a write on audio. Every call is synchronous,
      cheap, and swallows its own failures.
   5. Unlock and resume inside the user's own taps (unlockSound(), called
      beside tapTick(), plus one global first-touch listener), and again on
      visibilitychange. iOS: the session is "ambient" (mixes with the guest's
      own music, obeys the silent switch), set before the context exists.
      An "interrupted" or suspended context just waits for the next tap.
   6. The device toggle "Sound" (localStorage si-sound, on by default) is the
      only opt-out. Reduced motion does not mute; the caller plays the
      sequence's one summary sound instead.

   API
     playSound(id, { bus, at, delayMs, pan, key, lateMs, opts })  -> handle|null
     cueAt(id, serverTime, options)        a sound on the room's clock
     roomChipsLanded(landings)             TV board chips, through the density rule
     unlockSound(), installSoundUnlock(), primeSound()
     setSoundSurface("tv"|"phone"), setSoundRoom(phase),
     setWalkout(walkout), setQuickDrawHush(on)
     soundOptedOut(), setSoundOptOut(off), soundAvailable()
     useSoundSystem({ state, tv, phase }), useSoundUnlockNeeded()
   Presentation only: nothing here reads or writes tournament state except
   the presentational walkout record it is handed. */

import { useEffect, useState } from "react";
import { makeEngine, setRoom, setListen, playRecipe, isSound, limitChips, roomKeyFor } from "./soundKit.js";
import { serverNow } from "./serverClock.js";
import { currentFrame } from "./frameGate.js";

export const SOUND_KEY = "si-sound";
/* TV master 70%, phone 60% (phones are an arm's length away) */
export const MASTER_VOLUME = Object.freeze({ tv:0.7, phone:0.6 });
export const BUSES = Object.freeze({ room:"tv", you:"phone", gm:"phone" });
/* a cue this late (ms past its server time) is not played at all */
export const LATE_MS = 300;
/* cues further out than this wait on a timer, so hush and the toggle are
   checked again right before they are scheduled on the audio clock */
export const LOOKAHEAD_MS = 250;
export const HUSH_RAMP_S = 0.15;
/* a remote moment counts as fresh this long after its frame (motion.js
   FRESH_WINDOW_MS; kept literal here so this module never imports React code) */
export const SOUND_FRESH_MS = 1500;

/* A5: the TV laptop's launch shortcut. Chrome in kiosk mode with the
   autoplay flag keeps Web Audio running across the TV's own reloads. */
export const TV_KIOSK_COMMAND = "chrome --kiosk --autoplay-policy=no-user-gesture-required https://fielddayseries.com/tv";
export const tvKioskCommand = (origin = "https://fielddayseries.com") =>
  `chrome --kiosk --autoplay-policy=no-user-gesture-required ${String(origin).replace(/\/+$/, "")}/tv`;

/* ── pure rules ── */
const storage = () => { try { return globalThis.localStorage || null; } catch { return null; } };
export const soundOptedOut = () => { try { return storage()?.getItem(SOUND_KEY) === "off"; } catch { return false; } };
export const setSoundOptOut = off => {
  try { off ? storage()?.setItem(SOUND_KEY, "off") : storage()?.removeItem(SOUND_KEY); } catch {}
  if (off) hushAll();
  notify();
};

/* which surface a bus speaks on */
export const busAllowed = (bus, surface) => !!BUSES[bus] && BUSES[bus] === (surface === "tv" ? "tv" : "phone");

/* The walkout contract (A6, written only by the Worker): silent while
   `walkout && serverNow() < walkout.until`. */
export function walkoutActive(walkout, now = serverNow()) {
  if (!walkout || typeof walkout !== "object") return false;
  const until = Number(walkout.until);
  return Number.isFinite(until) && now < until;
}
export function hushReason({ walkout = null, quickDraw = false, now = serverNow() } = {}) {
  if (walkoutActive(walkout, now)) return "walkout";
  if (quickDraw) return "quickDraw";
  return null;
}

/* Where a server-anchored cue lands on the audio clock: `at` is server ms,
   `now` the server clock, `currentTime` and `outputLatency` the context's
   (seconds). Scheduled early by the output latency, so a Bluetooth speaker
   still lands on the frame. Null when it is already too late to play. */
export function scheduleTime({ at, now, currentTime = 0, outputLatency = 0, lateMs = LATE_MS }) {
  const target = Number(at);
  if (!Number.isFinite(target)) return null;
  const ahead = target - Number(now);
  if (ahead < -lateMs) return null;
  const latency = Math.max(0, Number(outputLatency) || 0);
  return Math.max(currentTime + 0.005, currentTime + ahead / 1000 - latency);
}

/* The commissioner's "saved" (S25) is a courtesy: when this phone's own
   moment sounded for the same write (You're playing lands with the ack of
   the winner tap that seated him), the ack stays quiet instead of stacking
   on it. A failure (S26) always sounds. */
export const GM_YIELD_MS = 400;
export const ackYields = (id, lastYouAt, target) => id === "S25" && Number.isFinite(Number(lastYouAt))
  && Number(lastYouAt) > 0 && Math.abs(Number(target) - Number(lastYouAt)) <= GM_YIELD_MS;

/* A remote moment may sound only on a fresh frame that arrived just now. */
export function freshFrameNow(frame = currentFrame(), now = Date.now()) {
  return !!frame?.fresh && now - (Number(frame.at) || 0) <= SOUND_FRESH_MS;
}

/* ── the live engine ── */
const engine = {
  ctx:null, E:null, surface:"phone", room:"fri", walkout:null, quickDraw:false, hushed:false,
  resuming:false, unlockedOnce:false, keys:[], chips:null, timers:new Set(), walkoutTimer:null, lastYouAt:0,
  factory:null, installed:false,
};
const listeners = new Set();
function notify() { for (const fn of [...listeners]) { try { fn(); } catch {} } }
export const subscribeSound = fn => { listeners.add(fn); return () => listeners.delete(fn); };

const contextClass = () => engine.factory
  || (typeof globalThis !== "undefined" && (globalThis.AudioContext || globalThis.webkitAudioContext)) || null;
export const soundAvailable = () => !!contextClass();

function context(create) {
  if (engine.ctx || !create) return engine.ctx;
  const AC = contextClass();
  if (!AC) return null;
  try {
    /* iOS: mix with other audio and obey the ring/silent switch; must be set
       before the context exists. The TV is a laptop and keeps the default. */
    if (engine.surface !== "tv" && globalThis.navigator?.audioSession) globalThis.navigator.audioSession.type = "ambient";
  } catch {}
  try {
    const ctx = new AC({ latencyHint:"interactive" });
    engine.ctx = ctx;
    engine.E = makeEngine(ctx, { room:engine.room, listen:engine.surface === "tv" ? "tv" : "phone",
      volume:MASTER_VOLUME[engine.surface === "tv" ? "tv" : "phone"] });
    ctx.onstatechange = () => { if (ctx.state === "running") engine.resuming = false; notify(); };
    applyHush(true);
    notify();
  } catch { engine.ctx = null; engine.E = null; }
  return engine.ctx;
}
const running = ctx => !!ctx && (ctx.state === "running" || engine.resuming);

function resume(ctx) {
  if (!ctx || ctx.state === "running" || ctx.state === "closed") return;
  engine.resuming = true;
  try {
    const p = ctx.resume();
    if (p?.then) p.then(() => { engine.resuming = false; notify(); }, () => { engine.resuming = false; notify(); });
  } catch { engine.resuming = false; }
}

/* Call synchronously inside the user's own tap (beside tapTick). Creates the
   context on the first one and resumes a suspended or interrupted one. */
export function unlockSound() {
  if (soundOptedOut()) return false;
  const ctx = context(true);
  if (!ctx) return false;
  resume(ctx);
  /* the old iOS unlock: one silent sample started inside the gesture */
  if (!engine.unlockedOnce) {
    engine.unlockedOnce = true;
    try {
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate || 44100);
      src.connect(ctx.destination);
      src.start(0);
    } catch {}
  }
  return true;
}

/* The TV creates its context at once: with the kiosk autoplay flag it runs,
   otherwise it waits suspended and the canvas shows "Click for sound". */
export function primeSound() {
  if (soundOptedOut()) return null;
  const ctx = context(true);
  if (ctx && ctx.state !== "running") resume(ctx);
  return ctx;
}

/* one set of global listeners: the first touch anywhere unlocks, and a
   return to the foreground resumes */
export function installSoundUnlock(win = typeof window !== "undefined" ? window : null) {
  if (engine.installed || !win?.addEventListener) return false;
  engine.installed = true;
  const onGesture = () => { if (!soundOptedOut() && (engine.ctx || engine.surface !== "tv")) unlockSound(); };
  ["touchend", "click", "keydown"].forEach(type => win.addEventListener(type, onGesture, { capture:true, passive:true }));
  const doc = win.document;
  doc?.addEventListener?.("visibilitychange", () => { if (!doc.hidden && engine.ctx) resume(engine.ctx); });
  return true;
}

export function setSoundSurface(surface) {
  const next = surface === "tv" ? "tv" : "phone";
  if (engine.surface === next) return;
  engine.surface = next;
  if (engine.E) {
    setListen(engine.E, next);
    try { engine.E.master.gain.value = MASTER_VOLUME[next]; } catch {}
  }
  notify();
}
export const soundSurface = () => engine.surface;

export function setSoundRoom(phase) {
  const key = roomKeyFor(phase);
  if (engine.room === key) return;
  engine.room = key;
  if (engine.E) { try { setRoom(engine.E, key); } catch {} }
}

/* ── the hush gate ── */
export function isHushed(now = serverNow()) {
  return !!hushReason({ walkout:engine.walkout, quickDraw:engine.quickDraw, now });
}
function applyHush(immediate = false) {
  const hushed = isHushed();
  engine.hushed = hushed;
  const E = engine.E;
  if (!E) return;
  try {
    const g = E.hush.gain, t = E.ctx.currentTime;
    g.cancelScheduledValues(t);
    if (immediate) g.setValueAtTime(hushed ? 0 : 1, t);
    else { g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(hushed ? 0 : 1, t + HUSH_RAMP_S); }
  } catch {}
}
function hushAll() {
  for (const timer of engine.timers) clearTimeout(timer);
  engine.timers.clear();
}
/* the presentational walkout record from state.showControl.audio */
export function setWalkout(walkout) {
  const next = walkout && typeof walkout === "object" && Number.isFinite(Number(walkout.until))
    ? { player:walkout.player ?? null, until:Number(walkout.until), startedAt:Number(walkout.startedAt) || 0 } : null;
  const same = (engine.walkout?.until ?? null) === (next?.until ?? null) && (engine.walkout?.player ?? null) === (next?.player ?? null);
  engine.walkout = next;
  if (same) return;
  clearTimeout(engine.walkoutTimer);
  applyHush();
  if (next && walkoutActive(next)) {
    /* reopen the gate when `until` passes, even if nothing else changes */
    engine.walkoutTimer = setTimeout(() => applyHush(), Math.min(10 * 60 * 1000, Math.max(0, next.until - serverNow()) + 20));
  }
}
/* Quick Draw: closed from armed until the reaction is captured */
export function setQuickDrawHush(on) {
  if (engine.quickDraw === !!on) return;
  engine.quickDraw = !!on;
  applyHush();
}

/* ── playing ── */
const KEY_MEMORY = 200;
function seenKey(key) {
  if (key === null || key === undefined) return false;
  const k = String(key);
  if (engine.keys.includes(k)) return true;
  engine.keys.push(k);
  if (engine.keys.length > KEY_MEMORY) engine.keys.shift();
  return false;
}

/* Play kit sound `id`.
     bus      room | you | gm (default you)
     at       a server time to land on (cueAt); default now + delayMs
     pan      -1..1, stereo place by canvas x (TV only)
     key      play once per key per session (several screens may notice the
              same moment)
     lateMs   drop the cue when it is this late
     opts     recipe options (a part's length, a crowd's size)
   Returns { cancel } or null when nothing will play. Never throws. */
export function playSound(id, { bus = "you", at = null, delayMs = 0, pan = 0, key = null, lateMs = LATE_MS, opts = {} } = {}) {
  try {
    if (!isSound(id) || soundOptedOut() || !busAllowed(bus, engine.surface)) return null;
    const ctx = context(false);
    if (!running(ctx) || !engine.E) return null;
    const now = serverNow();
    const target = at === null || at === undefined ? now + Math.max(0, Number(delayMs) || 0) : Number(at);
    if (!Number.isFinite(target) || target - now < -lateMs) return null;
    if (isHushed(Math.max(now, target))) return null;
    if (bus === "gm" && ackYields(id, engine.lastYouAt, target)) return null;
    if (seenKey(key)) return null;
    if (bus === "you") engine.lastYouAt = target;
    const fire = () => {
      if (soundOptedOut() || !busAllowed(bus, engine.surface) || isHushed(target) || !engine.E) return;
      const c = engine.ctx;
      const when = scheduleTime({ at:target, now:serverNow(), currentTime:c.currentTime,
        outputLatency:c.outputLatency || c.baseLatency || 0, lateMs });
      if (when === null) return;
      playRecipe(engine.E, id, when, { pan, ...opts });
      /* rehearsal instrumentation: a page that defines the array gets a log */
      try { globalThis.__FD_SOUND_LOG__?.push?.({ id, bus, at:target, when, currentTime:c.currentTime, pan }); } catch {}
    };
    const wait = target - now - LOOKAHEAD_MS;
    if (wait <= 0) { fire(); return { cancel() {} }; }
    let timer = null;
    timer = setTimeout(() => { engine.timers.delete(timer); fire(); }, wait);
    engine.timers.add(timer);
    return { cancel() { clearTimeout(timer); engine.timers.delete(timer); } };
  } catch { return null; }
}
/* a sound on the room's clock (server ms) */
export const cueAt = (id, serverTime, options = {}) => playSound(id, { bus:"room", ...options, at:serverTime });

/* TV board chips landing: [{ at (server ms), pan }] through the density
   rule: a crowd is one riffle, otherwise one clack per 120 ms at most. */
export function roomChipsLanded(landings) {
  if (!Array.isArray(landings) || !landings.length || !busAllowed("room", engine.surface)) return [];
  const { memory, plan } = limitChips(engine.chips, landings);
  engine.chips = memory;
  for (const item of plan) {
    if (item.kind === "clack") playSound("S5", { bus:"room", at:item.at, pan:item.pan });
    else if (item.kind === "riffle") playSound("crowd", { bus:"room", at:item.at, pan:item.pan * 0.6, opts:{ n:item.n } });
  }
  return plan;
}

/* ── React ── */

/* App-level wiring, once: the surface, the weekend's room, the walkout
   hush, the global unlock, and the TV's context. */
export function useSoundSystem({ state, tv = false, phase = "fri" } = {}) {
  const walkout = state?.showControl?.audio?.walkout || null;
  useEffect(() => { setSoundSurface(tv ? "tv" : "phone"); if (tv) primeSound(); }, [tv]);
  useEffect(() => { installSoundUnlock(); }, []);
  useEffect(() => { setSoundRoom(phase); }, [phase]);
  useEffect(() => { setWalkout(walkout); }, [walkout?.until, walkout?.player]); // eslint-disable-line react-hooks/exhaustive-deps
}

/* The TV still needs a click for sound: its context exists and is not
   running, and Sound is on. */
export const soundUnlockNeeded = () => engine.surface === "tv" && !soundOptedOut()
  && !!engine.ctx && engine.ctx.state !== "running" && engine.ctx.state !== "closed";
export function useSoundUnlockNeeded() {
  const [needed, setNeeded] = useState(soundUnlockNeeded);
  useEffect(() => {
    const update = () => setNeeded(soundUnlockNeeded());
    update();
    return subscribeSound(update);
  }, []);
  return needed;
}
export function useSoundEnabled() {
  const [on, setOn] = useState(() => !soundOptedOut());
  useEffect(() => subscribeSound(() => setOn(!soundOptedOut())), []);
  return on;
}

/* ── tests and the preview ── */
export function __resetSoundEngine({ factory = null } = {}) {
  hushAll();
  clearTimeout(engine.walkoutTimer);
  try { engine.ctx?.close?.(); } catch {}
  Object.assign(engine, { ctx:null, E:null, surface:"phone", room:"fri", walkout:null, quickDraw:false, hushed:false,
    resuming:false, unlockedOnce:false, keys:[], chips:null, timers:new Set(), walkoutTimer:null, lastYouAt:0, factory });
}
export const __soundEngine = () => engine;
