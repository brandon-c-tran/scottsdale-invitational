/* The TV's sound in the Groove (float/GROOVE.md "Sound (the Groove)"), on
   the room bus. Every cue is on Float's server clock (the connection's
   serverNow) and turned into the engine's clock as it is cued.

     the song    from the room's songAt, bar by bar on a rolling window
                 (groove.js songSlots: the band, the host's calls, the
                 answers, the counts), so a TV that joins mid-song hears
                 the song from its next bar line; the music is the game,
                 so reduced motion keeps it
     moments     from a fresh room message: the Cup opening (intro), the
                 round card's sting and the host's title, the cut's
                 drumroll and a sting per rider out (CUT_BEATS), the
                 podium's fanfare (PODIUM_BEATS); in the lobby a pop as a
                 rider joins and a chime as one is ready
     the room    from a fresh `ev`: a quiet flub for each judged miss
                 (q "miss"), panned to the rider's place in the field and
                 through a density rule; a glass as a rider taps Done in
                 the drink break; a party horn as someone out cheers
     the loop    the lobby's, on the server's own bar grid (every screen in
                 a room on the same bar), in the lobby, after the cut's
                 stings and after the podium's fanfare

   Silence rules (Field Day's): the first room message on a connection (a
   load, a reconnect) is a catch-up and sounds no moment; nor does anything
   stamped longer ago than its window, or anything while the page is
   hidden. A rider who has not tapped Done is chugging, so their misses
   after the break do not flub. Pure apart from the runner and the hook. */
import { useEffect } from "react";
import { cueAt, installSoundUnlock, preloadClips, primeSound, registerClips, setSoundRoom, setSoundSurface, soundSurface }
  from "../../../src/lib/sound.js";
import { serverNow } from "../../../src/lib/serverClock.js";
import { BAR_MS, BEAT_MS, CUT_BEATS, GROOVE_LATE_MS, GROOVE_LEAD_MS, GROOVE_PRE_MS, LAST_CALL_BEATS, PODIUM_BEATS, TITLE_BEATS, barLine,
  chartFor, drinkBeats, eventAt, lobbyBar, songSlots } from "./groove.js";
import { VOICE } from "./voices.js";

export const ROOM_FRESH_MS = 1500;
export const EV_FRESH_MS = 700;
/* the beds stop once the connection has been down this long */
export const CLOSED_GRACE_MS = 3000;
/* the loop comes back this long into the cut (after the stings), the
   podium (after the fanfare) and the Cup's opening (after its fanfare) */
export const CUT_LOOP_MS = 6000, PODIUM_LOOP_MS = 8000, INTRO_LOOP_MS = 4000;
/* misses: one flub each `gap` at most, `grains` inside a `window`, the rest of the window one bigger flub */
export const FLUB = Object.freeze({ gap:40, window:220, grains:3 });
export const DONE_GAP_MS = 90, CHEER_GAP_MS = 260;
/* the Cup's phases */
export const PHASES = Object.freeze(["lobby", "intro", "song", "cut", "lastcall", "podium", "feedback"]);

const num = v => { const n = Number(v); return v !== null && v !== undefined && v !== "" && Number.isFinite(n) ? n : null; };
const idx = v => typeof v === "number" && Number.isInteger(v) ? v : v && typeof v === "object" && Number.isInteger(Number(v.i)) ? Number(v.i) : null;
const list = v => (Array.isArray(v) ? v : []).map(idx).filter(i => i !== null);

/* one room message, reduced to what can sound */
export function grooveView(msg) {
  if (!msg || typeof msg !== "object") return null;
  const phase = PHASES.includes(msg.phase) ? msg.phase : "other";
  const entrants = Array.isArray(msg.entrants) ? msg.entrants : [];
  return {
    phase, s:num(msg.s), code:String(msg.code ?? ""), round:Math.max(0, Math.floor(num(msg.round) ?? 0)), rounds:Math.max(0, Math.floor(num(msg.rounds) ?? 0)),
    song:typeof msg.song === "string" ? msg.song : null, songAt:num(msg.songAt), startAt:num(msg.startAt), endsAt:num(msg.endsAt),
    chart:phase === "song" || phase === "lastcall" ? chartFor(msg) : null, field:list(msg.field), out:list(msg.out), podium:list(msg.podium),
    drinking:msg.drinking !== false,
    entrants:entrants.map((e, i) => ({ i, device:String(e?.device ?? `#${i}`), ready:!!e?.ready, bot:!!e?.bot, drinks:e?.drinks !== false })),
    scores:Array.isArray(msg.scores) ? msg.scores : null,
  };
}

export function initialScreen({ open = true } = {}) {
  return { open, closedAt:0, live:false, view:null, phaseAt:null, outsBefore:null, cutAt:null, gone:null, done:null,
    flub:{ last:-Infinity, start:-Infinity, n:0 }, lastDone:-Infinity, lastCheer:-Infinity, lobby:null };
}
/* the connection's status: the first room after it opens is a catch-up */
export function screenStatus(mem, status, now = 0) {
  const open = status === "open";
  if (open && !mem.open) return { ...mem, open:true, live:false };
  if (!open && mem.open) return { ...mem, open:false, closedAt:now, live:false };
  return mem;
}
export const connected = (mem, now) => !!mem && (mem.open || now - (mem.closedAt || 0) < CLOSED_GRACE_MS);

const keyOf = (mem, ...parts) => ["float", mem.view?.code || "room", ...parts].join(":");
/* a phase's start: its startAt when it is near the message, else the message */
const phaseStart = (v, s) => Number.isFinite(v.startAt) && Number.isFinite(s) && Math.abs(v.startAt - s) < 10000 ? v.startAt : s;
/* a cue never laid behind the message it came on */
const notBefore = (at, s) => Math.max(at, s + 60);
export const fieldPan = (field, i) => {
  const k = field.indexOf(i), n = field.length;
  return k < 0 || n < 2 ? 0 : Math.round((-0.6 + 1.2 * k / (n - 1)) * 100) / 100;
};

/* One message through the TV's sound: the memory to keep and the cues it
   owes, { id, at (Float's server ms), pan, opts, key, lateMs }. */
export function screenStep(mem, msg, ctx = {}) {
  const m = mem || initialScreen();
  const now = Number(ctx.now) || Date.now(), visible = ctx.visible !== false;
  switch (msg?.t) {
    case "welcome": return { mem:{ ...m, live:false }, cues:[] };
    case "room": return roomStep(m, msg, { now, visible });
    case "ev": return evStep(m, msg, { now, visible });
    default: return { mem:m, cues:[] };
  }
}

function roomStep(mem, msg, { now, visible }) {
  const v = grooveView(msg);
  if (!v) return { mem, cues:[] };
  const s = Number.isFinite(v.s) ? v.s : now;
  const prev = mem.view;
  const fresh = mem.live && visible && now - s <= ROOM_FRESH_MS;
  const m = { ...mem, live:true, view:v };
  const moved = !prev || prev.phase !== v.phase || prev.round !== v.round || (v.phase === "song" && prev.songAt !== v.songAt);
  if (moved) m.phaseAt = phaseStart(v, s);
  /* who was out before this song: the cut's new outs are the rest */
  if (v.phase === "song" && moved) { m.outsBefore = [...v.out]; m.done = new Set(); m.gone = null; m.cutAt = null; }
  if (v.phase === "song") {
    /* the room's own word on who has tapped Done */
    const done = new Set(m.done || []);
    for (const row of v.scores || []) if (row && row.done && Number.isInteger(Number(row.i))) done.add(Number(row.i));
    m.done = done;
  }
  /* the cut's own start (its outs may have come a moment before, as `ev out`: they stay stung once) */
  if (v.phase === "cut" && moved) { m.cutAt = m.phaseAt; if (!m.gone) m.gone = new Map(); }
  const cues = [];
  /* the lobby: who joined and who is ready (recorded always, sounded fresh) */
  if (v.phase === "lobby") {
    const before = m.lobby || { devices:new Set(), ready:new Set() };
    const devices = new Set(v.entrants.map(e => e.device)), ready = new Set(v.entrants.filter(e => e.ready).map(e => e.device));
    if (fresh && prev?.phase === "lobby") {
      v.entrants.filter(e => !before.devices.has(e.device)).slice(0, 4).forEach((e, k) =>
        cues.push({ id:"floatHello", at:s + 60 + k * 140, pan:entrantPan(e.i, v.entrants.length), key:keyOf(m, "hello", e.device, s) }));
      v.entrants.filter(e => e.ready && !before.ready.has(e.device) && before.devices.has(e.device)).slice(0, 4).forEach((e, k) =>
        cues.push({ id:"floatSet", at:s + 60 + k * 120, pan:entrantPan(e.i, v.entrants.length), key:keyOf(m, "set", e.device, s) }));
    }
    m.lobby = { devices, ready };
  } else m.lobby = null;
  if (fresh && moved && prev) cues.push(...phaseCues(m, prev, v, s));
  /* the cut's outs as the room names them (a later message may add some) */
  if (fresh && v.phase === "cut") cues.push(...outCues(m, v, s));
  return { mem:m, cues };
}
const entrantPan = (i, n) => n > 1 ? Math.round((-0.6 + 1.2 * i / (n - 1)) * 100) / 100 : 0;

/* what a change of phase owes the room */
function phaseCues(m, prev, v, s) {
  const start = m.phaseAt ?? s;
  switch (v.phase) {
    case "intro":
      return [{ id:"floatOpen", at:notBefore(start + 200, s) - GROOVE_PRE_MS, key:keyOf(m, "open", start) }];
    case "song": {
      if (!Number.isFinite(v.songAt) || !v.chart) return [];
      const cues = [];
      const sting = v.songAt + TITLE_BEATS.sting, title = v.songAt + TITLE_BEATS.title;
      /* the round card: its sting's hit a beat after it goes up, the host's title a beat later */
      if (sting - GROOVE_PRE_MS >= s - 100) cues.push({ id:"floatSting", at:sting - GROOVE_PRE_MS, opts:{ song:v.chart.id }, key:keyOf(m, "sting", v.songAt) });
      if (title - GROOVE_PRE_MS >= s - 100) cues.push({ id:"floatVoice", at:title - GROOVE_PRE_MS, opts:{ line:`title-${v.chart.id}` }, key:keyOf(m, "title", v.songAt) });
      return cues;
    }
    case "cut": {
      if (prev.phase !== "song") return [];
      return [{ id:"floatRoll", at:notBefore(start + CUT_BEATS.roll, s) - GROOVE_PRE_MS, opts:{ ms:CUT_BEATS.reveal - CUT_BEATS.roll },
        key:keyOf(m, "roll", v.round, start) }];
    }
    case "podium":
      return [{ id:"floatFanfare", at:notBefore(start + PODIUM_BEATS.roll, s) - GROOVE_PRE_MS, key:keyOf(m, "fanfare", start) }];
    case "lastcall": {
      /* the bar: the bartender's bell rung, then "Last call!" (the band comes in on songAt) */
      if (!Number.isFinite(v.songAt)) return [];
      const bell = v.songAt + LAST_CALL_BEATS.bell * BEAT_MS, call = v.songAt + LAST_CALL_BEATS.call * BEAT_MS;
      const cues = [];
      if (bell >= s - 100) cues.push({ id:"floatBell", at:bell, opts:{ first:true }, key:keyOf(m, "bell", v.songAt) });
      if (call - GROOVE_PRE_MS >= s - 100) cues.push({ id:"floatVoice", at:call - GROOVE_PRE_MS, opts:{ line:"lastcall" }, key:keyOf(m, "lastcall", v.songAt) });
      return cues;
    }
    default: return [];
  }
}
/* each rider newly out in this cut, a sting each on the cut's beats, a step lower each */
function outCues(m, v, s) {
  if (!m.gone) m.gone = new Map();
  const before = new Set(m.outsBefore || []);
  const cues = [];
  for (const i of v.out) {
    if (before.has(i) || m.gone.has(i)) continue;
    const k = m.gone.size;
    const at = notBefore((m.cutAt ?? s) + CUT_BEATS.reveal + k * CUT_BEATS.gap, s);
    m.gone.set(i, at);
    cues.push({ id:"floatGone", at:at - GROOVE_PRE_MS, pan:fieldPan(v.field.length ? v.field : v.out, i), opts:{ step:k }, key:keyOf(m, "gone", v.round, i) });
  }
  return cues;
}

/* ── the room's moments ── */
function evStep(mem, msg, { now, visible }) {
  const s = Number(msg.s);
  const fresh = mem.live && visible && Number.isFinite(s) && now - s <= EV_FRESH_MS;
  const i = Number(msg.i), v = mem.view;
  /* the room's word on Done is kept whatever its age */
  if (msg.e === "done" && Number.isInteger(i)) {
    const m = { ...mem, done:new Set([...(mem.done || []), i]) };
    if (!fresh || !v || v.phase !== "song" || now - m.lastDone < DONE_GAP_MS) return { mem:m, cues:[] };
    m.lastDone = now;
    return { mem:m, cues:[{ id:"floatDone", at:s + 20, pan:fieldPan(v.field, i), opts:{ step:i } }] };
  }
  if (!fresh || !v || !Number.isInteger(i)) return { mem, cues:[] };
  const m = { ...mem };
  switch (msg.e) {
    case "hit": {
      if (msg.q !== "miss" || (v.phase !== "song" && v.phase !== "lastcall")) return { mem:m, cues:[] };
      /* a rider still chugging after the break is not flubbing */
      const chart = v.chart, cue = chart?.cues?.[Number(msg.c)], drink = drinkBeats(chart);
      const rider = v.entrants[i];
      const drinks = v.drinking && rider?.drinks !== false;
      if (cue && drink && drinks && cue.beat >= drink.to && !(m.done || new Set()).has(i)) return { mem:m, cues:[] };
      const f = flubStep(m.flub, s);
      m.flub = f.memory;
      if (!f.play) return { mem:m, cues:[] };
      return { mem:m, cues:[{ id:"floatFlub", at:f.at, pan:fieldPan(v.field, i), opts:{ n:f.n } }] };
    }
    case "cheer": {
      if (s - m.lastCheer < CHEER_GAP_MS) return { mem:m, cues:[] };
      m.lastCheer = s;
      return { mem:m, cues:[{ id:"floatCheer", at:s + 20, pan:entrantPan(i, v.entrants.length) * 0.8, opts:{ step:i % 3 } }] };
    }
    case "out": {
      if (v.phase !== "cut" && v.phase !== "song") return { mem:m, cues:[] };
      if (!m.gone) m.gone = new Map();
      if (m.gone.has(i)) return { mem:m, cues:[] };
      const k = m.gone.size, cutAt = m.cutAt ?? s;
      const at = Math.max(s + 60, cutAt + CUT_BEATS.reveal + k * CUT_BEATS.gap);
      m.gone = new Map(m.gone).set(i, at);
      return { mem:m, cues:[{ id:"floatGone", at:at - GROOVE_PRE_MS, pan:fieldPan(v.field, i), opts:{ step:k }, key:keyOf(m, "gone", v.round, i) }] };
    }
    default: return { mem:m, cues:[] };
  }
}
/* the misses' density rule: a flub each FLUB.gap at most, FLUB.grains of
   them inside FLUB.window; past that the window is full */
export function flubStep(memory, at) {
  const mem = memory || { last:-Infinity, start:-Infinity, n:0 };
  if (at - mem.start > FLUB.window) return { memory:{ last:at, start:at, n:1 }, play:true, at, n:1 };
  if (mem.n >= FLUB.grains) return { memory:{ ...mem, n:mem.n + 1 }, play:false, at, n:mem.n + 1 };
  const when = Math.max(at, mem.last + FLUB.gap);
  return { memory:{ ...mem, last:when, n:mem.n + 1 }, play:true, at:when, n:mem.n + 1 };
}

/* ── the beds: the song and the loop ── */
/* the bed for where the Cup is (null: none); key changes when it must start over */
export function grooveTrack(mem) {
  const v = mem?.view;
  if (!v) return null;
  const start = mem.phaseAt ?? v.s ?? 0;
  switch (v.phase) {
    case "song": case "lastcall":
      if (!Number.isFinite(v.songAt) || !v.chart) return null;
      return { key:`song:${v.round}:${v.chart.id}:${v.songAt}`, kind:"song", songAt:v.songAt, chart:v.chart };
    case "lobby": case "feedback": return { key:"lobby", kind:"lobby", from:-Infinity, cut:false };
    /* the Cup opening: its fanfare alone, then the loop (light) up to the first round card */
    case "intro": return { key:`intro:${start}`, kind:"lobby", from:barLine(start + INTRO_LOOP_MS), cut:true };
    case "cut": return { key:`cut:${v.round}:${start}`, kind:"lobby", from:barLine(start + CUT_LOOP_MS), cut:true };
    case "podium": return { key:`podium:${start}`, kind:"lobby", from:barLine(start + PODIUM_LOOP_MS), cut:false };
    default: return null;
  }
}
/* The next things a bed lays, from slot `next` while they start before
   `until`: [{ next, cues:[{ id, at, opts }] }]. A song's slot is its bar
   (every event of the bar laid together); the loop's is a bar of the
   server's grid. */
export function bedSlot(track, index) {
  if (track.kind === "song") {
    const slots = songSlots(track.chart);
    if (index < 0 || index >= slots.length) return null;
    return { start:track.songAt + index * BAR_MS - GROOVE_PRE_MS, cues:slots[index].map(ev => ({ id:ev.id, at:eventAt(track.songAt, ev.beat), opts:ev.opts })) };
  }
  const at = index * BAR_MS;
  return { start:at - GROOVE_PRE_MS, cues:[{ id:"floatLobby", at:at - GROOVE_PRE_MS, opts:{ bar:lobbyBar(at), cut:!!track.cut } }] };
}
/* the first slot a track lays from `now` (the next one not yet begun) */
export function firstSlot(track, now) {
  if (track.kind === "song") return Math.max(0, Math.ceil((now + 40 + GROOVE_PRE_MS - track.songAt) / BAR_MS));
  const from = Math.max(Number.isFinite(track.from) ? track.from : -Infinity, now + 40 + GROOVE_PRE_MS);
  return Math.ceil(from / BAR_MS);
}

/* ── the runner and the hook ── */
const pageVisible = () => { try { return globalThis.document?.visibilityState !== "hidden"; } catch { return true; } };
/* Float's server clock (the connection's), else this device's */
export const floatClock = net => () => {
  try { const n = Number(net?.serverNow?.()); return Number.isFinite(n) && n > 0 ? n : Date.now(); } catch { return Date.now(); }
};
/* a Float server instant on the engine's clock: both read now */
export const toEngine = (at, floatNow, engineNow) => Number(at) - Number(floatNow) + Number(engineNow);

/* Runs the TV's sound for one connection. `play(id, at, options)` sounds a
   cue at a Float server instant (default: cueAt on the room bus at that
   instant on the engine's clock) and returns its handle. */
export function createGrooveScreenSound(net, { play = null, visible = pageVisible, tickMs = 125,
  setInterval:every = globalThis.setInterval, clearInterval:stopEvery = globalThis.clearInterval } = {}) {
  if (!net || typeof net.on !== "function") return { stop() {}, memory:() => null, tick() {} };
  const now = floatClock(net);
  const cue = play || ((id, at, options) => cueAt(id, toEngine(at, now(), serverNow()), options));
  let status = "open";
  try { status = typeof net.status === "function" ? net.status() : "open"; } catch {}
  let mem = initialScreen({ open:status !== "closed" && status !== "connecting" });
  const bed = { key:null, track:null, next:0, handles:[] };
  const cancelBed = () => { for (const h of bed.handles) { try { h.handle?.cancel?.(); } catch {} } bed.handles = []; };
  const sound = cues => { for (const c of cues) { try { cue(c.id, c.at, { pan:c.pan || 0, opts:c.opts || {}, key:c.key ?? null, ...(c.lateMs ? { lateMs:c.lateMs } : {}) }); } catch {} } };
  const lay = () => {
    try {
      const t = now();
      const track = visible() && connected(mem, t) ? grooveTrack(mem) : null;
      if ((track?.key ?? null) !== bed.key) {
        cancelBed();
        Object.assign(bed, { key:track?.key ?? null, track, next:track ? firstSlot(track, t) : 0 });
      }
      if (!track) return;
      /* back from a stall (a hidden page, a slow tab): on from the next slot */
      const at = bedSlot(bed.track, bed.next);
      if (at && at.start < t - 1000) bed.next = firstSlot(bed.track, t);
      for (let guard = 0; guard < 4; guard++) {
        const slot = bedSlot(bed.track, bed.next);
        if (!slot || slot.start >= t + GROOVE_LEAD_MS) break;
        bed.next++;
        if (slot.start < t - 40) continue;
        for (const c of slot.cues) bed.handles.push({ at:c.at, handle:cue(c.id, c.at, { opts:c.opts || {}, lateMs:GROOVE_LATE_MS }) });
      }
      bed.handles = bed.handles.filter(h => h.at > t - 8000);
    } catch {}
  };
  const offs = ["welcome", "room", "ev"].map(type => {
    try { return net.on(type, msg => {
      try { const r = screenStep(mem, { ...msg, t:type }, { now:now(), visible:visible() }); mem = r.mem; sound(r.cues); lay(); } catch {}
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
      cancelBed();
    },
    memory:() => mem,
    bed:() => bed,
    tick:lay,
  };
}

/* the host's voice: the clips named by the manifest, fetched and decoded once */
export function loadGrooveVoice() {
  try {
    registerClips(VOICE.clips, { base:VOICE.base });
    return preloadClips(VOICE.clips.map(c => c.id));
  } catch { return Promise.resolve(0); }
}

/* The TV's sound on its page: the TV's surface (the room bus), the context
   made at once (a kiosk TV runs it; anything else waits for the first
   click, useFloatSoundUnlockNeeded), the global unlock, the host's voice,
   and the runner for the connection. On Float's own page the room's
   reverb is the night's; inside Field Day's TV the weekend's own stays. */
export function useFloatScreenSound(net, options = {}) {
  useEffect(() => {
    if (!net) return undefined;
    try {
      const own = soundSurface() !== "tv";
      setSoundSurface("tv");
      if (own) setSoundRoom("san");
      primeSound();
      installSoundUnlock();
      loadGrooveVoice();
    } catch {}
    const runner = createGrooveScreenSound(net, options);
    return () => runner.stop();
  }, [net]); // eslint-disable-line react-hooks/exhaustive-deps
}
