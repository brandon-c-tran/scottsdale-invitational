/* The TV's sound in the Groove (float/GROOVE.md "Sound (the Groove)"), on
   the room bus. Every cue is on Float's server clock (the connection's
   serverNow) and turned into the engine's clock as it is cued.

     the song    from the room's songAt, bar by bar on a rolling window
                 (groove.js songSlots: the band, the host's calls and
                 narration, the answers, the counts), so a TV that joins
                 mid-song hears the song from its next bar line; the music
                 is the game, so reduced motion keeps it. Last Call's
                 countdown rides the same window (its chart's own events).
     moments     from a fresh room message: the Cup opening (intro), the
                 round card's sting and the host's title, the cut's show
                 (CUT_BEATS: every grade stamped at once, a sting per award,
                 the drumroll, then per rider out a sting and their song's
                 slapstick exit), the chug-off (CHUGOFF_BEATS: the call, the
                 first one's rule, three two one, "Chug!" on goAt, the
                 winner's stamp as the first Done lands, the loser's exit),
                 the podium's fanfare (PODIUM_BEATS); in the lobby a pop as a
                 rider joins and a chime as one is ready
     the room    from a fresh `ev`: a quiet flub for each judged miss in a
                 song (q "miss"), panned to the rider's place in the field
                 and through a density rule (none in a blackout bar); a
                 rocket's hit bursts a beat after its launch (ROCKET_BURST_MS,
                 sized by the judgement, panned to the rider) and its miss
                 fizzles; a glass as a chug-off's
                 contender taps Done; a party horn as someone out cheers
     the beds    the lobby's loop, on the server's own bar grid (every
                 screen in a room on the same bar), in the lobby, after the
                 cut's show and after the podium's fanfare; the chug-off's
                 chant from goAt until the first Done

   Silence rules (Field Day's): the first room message on a connection (a
   load, a reconnect) is a catch-up and sounds no moment; nor does anything
   stamped longer ago than its window, or anything while the page is
   hidden. Pure apart from the runner and the hook. */
import { useEffect } from "react";
import { cueAt, installSoundUnlock, preloadClips, primeSound, registerClips, setSoundRoom, setSoundSurface, soundSurface }
  from "../../../src/lib/sound.js";
import { serverNow } from "../../../src/lib/serverClock.js";
import { CHUGOFF } from "../../shared/chart.js";
import { BAR_MS, BEAT_MS, BURST_SIZE, CHUGOFF_BEATS, CUT_BEATS, GROOVE_LATE_MS, GROOVE_LEAD_MS, GROOVE_PRE_MS, PODIUM_BEATS, ROCKET_BURST_MS, TITLE_BEATS, barLine,
  chartFor, chugoffPlan, cutBeats, darkBars, eventAt, lobbyBar, lobbySection, songSlots } from "./groove.js";
import { VOICE } from "./voices.js";

export const ROOM_FRESH_MS = 1500;
export const EV_FRESH_MS = 700;
/* the beds stop once the connection has been down this long */
export const CLOSED_GRACE_MS = 3000;
/* the loop comes back this long after the cut's show ends (its last exit),
   into the podium (after the fanfare) and the Cup's opening (after its fanfare) */
export const CUT_LOOP_MS = 1200, PODIUM_LOOP_MS = 8000, INTRO_LOOP_MS = 4000;
/* misses: one flub each `gap` at most, `grains` inside a `window`, the rest of the window one bigger flub */
export const FLUB = Object.freeze({ gap:40, window:220, grains:3 });
export const DONE_GAP_MS = 90, CHEER_GAP_MS = 260;
/* the chant runs this many bars at most (the chug-off's window) */
export const CHANT_BARS = Math.ceil(CHUGOFF.WINDOW_MS / BAR_MS);
/* the Cup's phases */
export const PHASES = Object.freeze(["lobby", "intro", "song", "cut", "chugoff", "lastcall", "podium", "feedback"]);

const num = v => { const n = Number(v); return v !== null && v !== undefined && v !== "" && Number.isFinite(n) ? n : null; };
const idx = v => typeof v === "number" && Number.isInteger(v) ? v : v && typeof v === "object" && Number.isInteger(Number(v.i)) ? Number(v.i) : null;
const list = v => (Array.isArray(v) ? v : []).map(idx).filter(i => i !== null);

/* the chug-off as the room has it: { a, b, goAt, winner, by, first, done:[i] } or null */
export function chugView(c) {
  if (!c || typeof c !== "object") return null;
  const done = c.doneAt && typeof c.doneAt === "object" ? Object.entries(c.doneAt).filter(([, ms]) => Number.isFinite(Number(ms)))
    .sort((x, y) => Number(x[1]) - Number(y[1])).map(([i]) => Number(i)).filter(Number.isInteger) : [];
  return { a:idx(c.a), b:idx(c.b), goAt:num(c.goAt), winner:idx(c.winner), by:typeof c.by === "string" ? c.by : null,
    first:typeof c.first === "boolean" ? c.first : null, done };
}

/* the cut's show as the room sends it (cup.js cutShowOf): its beats in server ms */
export function showView(sh) {
  if (!sh || typeof sh !== "object") return null;
  return { grades:num(sh.grades), awards:(Array.isArray(sh.awards) ? sh.awards : []).map(num), line:num(sh.line),
    outs:(Array.isArray(sh.outs) ? sh.outs : []).map(o => ({ i:idx(o), at:num(o?.at) })).filter(o => o.i !== null && o.at !== null),
    bubble:list(sh.bubble) };
}

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
    awards:(Array.isArray(msg.awards) ? msg.awards : []).map(a => ({ id:String(a?.id ?? ""), i:idx(a) })).filter(a => a.id),
    chugoff:chugView(msg.chugoff), show:showView(msg.show),
  };
}

export function initialScreen({ open = true } = {}) {
  return { open, closedAt:0, live:false, view:null, phaseAt:null, outsBefore:null, cutAt:null, gone:null, lastSong:null, awarded:null, chug:null,
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
/* the final's round (its cut names nobody) */
const lastRound = v => v.rounds > 0 && v.round >= v.rounds - 1;
export const fieldPan = (field, i) => {
  const k = field.indexOf(i), n = field.length;
  return k < 0 || n < 2 ? 0 : Math.round((-0.6 + 1.2 * k / (n - 1)) * 100) / 100;
};
/* the chug-off's two (kept out of the cut's stings and exits: the chug-off decides them) */
const bubble = v => new Set([v.chugoff?.a, v.chugoff?.b, ...(v.show?.bubble || [])].filter(Number.isInteger));
/* this cut's new outs (the chug-off's pair aside) */
const newOuts = (m, v) => v.out.filter(i => !(m.outsBefore || []).includes(i) && !bubble(v).has(i));
/* the cut line: the room's show's, else the engine's beats for this many awards */
const cutLine = (m, v, start) => v.show ? v.show.line : start + cutBeats(0, v.awards.length).line;
/* a rider out's beat: the show's, else the k-th after the line */
function outAt(m, v, i, k, start) {
  const own = v.show?.outs?.find(o => o.i === i);
  if (own) return own.at;
  const line = cutLine(m, v, start);
  return (Number.isFinite(line) ? line : start + cutBeats(0, 0).line) + CUT_BEATS.after + k * CUT_BEATS.gap;
}

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
  /* who was out before this song: the cut's new outs are the rest; the song, for its exits */
  if (v.phase === "song" && moved) { m.outsBefore = [...v.out]; m.gone = null; m.cutAt = null; m.awarded = null; }
  if (v.phase === "song" && v.chart?.id) m.lastSong = v.chart.id;
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
  /* the chug-off: its two, its go, and whether the room has named the winner */
  if (v.phase === "chugoff") {
    const c = v.chugoff, goAt = c?.goAt ?? (m.chug?.goAt ?? (m.phaseAt ?? s) + CHUGOFF.INTRO_MS);
    if (moved || !m.chug) m.chug = { goAt, a:c?.a ?? null, b:c?.b ?? null, decided:false, at:null };
    else m.chug = { ...m.chug, goAt, a:c?.a ?? m.chug.a, b:c?.b ?? m.chug.b };
  } else m.chug = null;
  if (fresh && moved && prev) cues.push(...phaseCues(m, prev, v, s));
  /* the cut's awards and outs as the room names them (a later message may add some) */
  if (fresh && v.phase === "cut" && (prev?.phase === "song" || prev?.phase === "cut")) cues.push(...awardCues(m, v, s));
  if (fresh && v.phase === "cut" && !lastRound(v)) cues.push(...outCues(m, v, s));
  /* the chug-off's winner, named by the room (when no Done told us first) */
  if (v.phase === "chugoff" && m.chug && !m.chug.decided && (Number.isInteger(v.chugoff?.winner) || v.chugoff?.done?.length)) {
    m.chug = { ...m.chug, decided:true, at:s };
    if (fresh) cues.push(...keepCues(m, s));
  }
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
      /* every rider's grade at once: one stamp for the room (each phone its own jingle) */
      const cues = [{ id:"floatGrades", at:notBefore(v.show?.grades ?? start + CUT_BEATS.grades, s) - GROOVE_PRE_MS, key:keyOf(m, "grades", v.round, start) }];
      /* the drumroll into the cut line (the cut after the final names nobody: the podium's own roll follows) */
      const line = cutLine(m, v, start);
      if (!lastRound(v) && Number.isFinite(line)) {
        const from = notBefore(line - CUT_BEATS.roll, s);
        if (line - from >= 300) cues.push({ id:"floatRoll", at:from - GROOVE_PRE_MS, opts:{ ms:line - from }, key:keyOf(m, "roll", v.round, start) });
      }
      return cues;
    }
    case "chugoff": {
      const c = m.chug;
      if (!c || !Number.isFinite(c.goAt)) return [];
      const first = v.chugoff?.first ?? v.round === 0;
      const plan = chugoffPlan(c.goAt - start, { first });
      const say = (line, ms, part) => ({ id:"floatVoice", at:notBefore(start + ms, s) - GROOVE_PRE_MS, opts:{ line }, key:keyOf(m, "chug", part, c.goAt) });
      const cues = [say("chugoff", plan.call, "call")];
      if (plan.explain !== null) cues.push(say("chug-explain", plan.explain, "explain"));
      plan.count.forEach((ms, k) => cues.push(say(["three", "two", "one"][k], ms, `count${k}`)));
      if (plan.roll !== null) cues.push({ id:"floatRoll", at:notBefore(start + plan.roll, s) - GROOVE_PRE_MS, opts:{ ms:Math.max(300, plan.chug - plan.roll) },
        key:keyOf(m, "chug", "roll", c.goAt) });
      cues.push(say("chug", plan.chug, "go"));
      cues.push({ id:"floatChugGo", at:notBefore(c.goAt, s) - GROOVE_PRE_MS, key:keyOf(m, "chug", "gohit", c.goAt) });
      return cues;
    }
    case "podium":
      return [{ id:"floatFanfare", at:notBefore(start + PODIUM_BEATS.roll, s) - GROOVE_PRE_MS, key:keyOf(m, "fanfare", start) }];
    default: return [];
  }
}
/* the cut's awards: a sting a card, on the cut's beats */
function awardCues(m, v, s) {
  const cutAt = m.cutAt ?? m.phaseAt ?? s, done = new Set(m.awarded || []);
  const cues = [];
  v.awards.slice(0, 3).forEach((a, k) => {
    if (done.has(k)) return;
    done.add(k);
    cues.push({ id:"floatAward", at:notBefore(v.show?.awards?.[k] ?? cutAt + CUT_BEATS.awards + k * CUT_BEATS.award, s) - GROOVE_PRE_MS,
      pan:Number.isInteger(a.i) ? fieldPan(v.field.length ? v.field : v.out, a.i) * 0.5 : 0, opts:{ k, award:a.id }, key:keyOf(m, "award", v.round, k) });
  });
  m.awarded = [...done];
  return cues;
}
/* a rider out in this cut: their sting on the cut's beats (a step lower each), then their song's exit */
function goneCues(m, v, i, k, at) {
  const pan = fieldPan(v.field.length ? v.field : v.out, i);
  return [{ id:"floatGone", at:at - GROOVE_PRE_MS, pan, opts:{ step:k }, key:keyOf(m, "gone", v.round, i) },
    { id:"floatExit", at:at + CUT_BEATS.exit - GROOVE_PRE_MS, pan, opts:{ song:m.lastSong || v.song || "paddle", k }, key:keyOf(m, "exit", v.round, i) }];
}
function outCues(m, v, s) {
  if (!m.gone) m.gone = new Map();
  const before = new Set(m.outsBefore || []), skip = bubble(v);
  const cues = [];
  for (const i of v.out) {
    if (before.has(i) || m.gone.has(i) || skip.has(i)) continue;
    const k = m.gone.size;
    const at = notBefore(outAt(m, v, i, k, m.cutAt ?? s), s);
    m.gone.set(i, at);
    cues.push(...goneCues(m, v, i, k, at));
  }
  return cues;
}
/* the chug-off decided: the winner's stamp, then the loser's exit */
function keepCues(m, at) {
  const c = m.chug;
  return [{ id:"floatKeep", at:at + 30, key:keyOf(m, "keep", c.goAt) },
    { id:"floatExit", at:at + CHUGOFF_BEATS.exit - GROOVE_PRE_MS, opts:{ song:m.lastSong || "paddle", k:0 }, key:keyOf(m, "chugexit", c.goAt) }];
}

/* ── the room's moments ── */
function evStep(mem, msg, { now, visible }) {
  const s = Number(msg.s);
  const fresh = mem.live && visible && Number.isFinite(s) && now - s <= EV_FRESH_MS;
  const i = Number(msg.i), v = mem.view;
  if (!fresh || !v || !Number.isInteger(i)) return { mem, cues:[] };
  const m = { ...mem };
  switch (msg.e) {
    case "hit": {
      if (v.phase !== "song") return { mem:m, cues:[] };
      const cue = Number.isInteger(Number(msg.c)) ? v.chart?.cues?.[Number(msg.c)] : null;
      /* Fireworks: every hit's firework bursts a beat after its rocket, panned to the rider; a miss fizzles */
      if (cue?.kind === "rocket") return { mem:m, cues:[rocketCue(m, v, i, cue, msg, s)] };
      if (msg.q !== "miss") return { mem:m, cues:[] };
      /* a blackout bar: the room hears nothing but the phones' own taps */
      if (cue && darkBars(v.chart).has(Math.floor(cue.beat / 4))) return { mem:m, cues:[] };
      const f = flubStep(m.flub, s);
      m.flub = f.memory;
      if (!f.play) return { mem:m, cues:[] };
      return { mem:m, cues:[{ id:"floatFlub", at:f.at, pan:fieldPan(v.field, i), opts:{ n:f.n } }] };
    }
    case "done": {
      /* a chug-off's contender done: a glass on the counter; the first is the winner's stamp */
      const c = m.chug;
      if (v.phase !== "chugoff" || !c || (Number.isInteger(c.a) && Number.isInteger(c.b) && i !== c.a && i !== c.b)) return { mem:m, cues:[] };
      const cues = [];
      if (now - m.lastDone >= DONE_GAP_MS) { m.lastDone = now; cues.push({ id:"floatDone", at:s + 20, pan:i === c.b ? 0.3 : -0.3, opts:{ step:i } }); }
      if (!c.decided) { m.chug = { ...c, decided:true, at:s }; cues.push(...keepCues(m, s)); }
      return { mem:m, cues };
    }
    case "cheer": {
      if (s - m.lastCheer < CHEER_GAP_MS) return { mem:m, cues:[] };
      m.lastCheer = s;
      return { mem:m, cues:[{ id:"floatCheer", at:s + 20, pan:entrantPan(i, v.entrants.length) * 0.8, opts:{ step:i % 3 } }] };
    }
    case "out": {
      if (v.phase !== "cut" && v.phase !== "song") return { mem:m, cues:[] };
      if (!m.gone) m.gone = new Map();
      if (m.gone.has(i) || bubble(v).has(i)) return { mem:m, cues:[] };
      const k = m.gone.size, cutAt = m.cutAt ?? s;
      const at = Math.max(s + 60, outAt(m, v, i, k, cutAt));
      m.gone = new Map(m.gone).set(i, at);
      return { mem:m, cues:goneCues(m, v, i, k, at) };
    }
    default: return { mem:m, cues:[] };
  }
}
/* a rider's rocket: its burst ROCKET_BURST_MS after its beat (or as the hit lands, if later), sized by the judgement; a miss's fizzle as the room calls it */
function rocketCue(m, v, i, cue, msg, s) {
  const pan = fieldPan(v.field, i);
  if (msg.q === "miss") return { id:"floatFizzle", at:s + 20, pan, opts:{ pan }, key:keyOf(m, "rocket", v.songAt, cue.id, i) };
  const due = Number.isFinite(v.songAt) ? v.songAt + cue.beat * BEAT_MS + ROCKET_BURST_MS : s;
  return { id:"floatBurst", at:Math.max(due, s + 20), pan, opts:{ pan, q:msg.q, size:BURST_SIZE[msg.q] ?? 0.3 }, key:keyOf(m, "rocket", v.songAt, cue.id, i) };
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

/* ── the beds: the song, the chant and the loop ── */
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
    case "cut": {
      if (lastRound(v)) return null;
      /* the loop comes back once the show's last exit has played */
      const outs = newOuts(mem, v), line = cutLine(mem, v, start);
      const last = outs.length ? Math.max(...outs.map((i, k) => outAt(mem, v, i, k, start))) : Number.isFinite(line) ? line : start;
      return { key:`cut:${v.round}:${start}:${outs.length}`, kind:"lobby", from:barLine(last + CUT_BEATS.gap + CUT_LOOP_MS), cut:true };
    }
    /* the chant from goAt until the first Done */
    case "chugoff": {
      const c = mem.chug;
      if (!c || c.decided || !Number.isFinite(c.goAt)) return null;
      return { key:`chant:${c.goAt}`, kind:"chant", goAt:c.goAt };
    }
    case "podium": return { key:`podium:${start}`, kind:"lobby", from:barLine(start + PODIUM_LOOP_MS), cut:false };
    default: return null;
  }
}
/* The next things a bed lays: a song's slot is its bar (every event of the
   bar laid together); the chant's a bar from goAt; the loop's a bar of the
   server's grid. */
export function bedSlot(track, index) {
  if (track.kind === "song") {
    const slots = songSlots(track.chart);
    if (index < 0 || index >= slots.length) return null;
    return { start:track.songAt + index * BAR_MS - GROOVE_PRE_MS,
      cues:slots[index].map(ev => ({ id:ev.id, at:eventAt(track.songAt, ev.beat), opts:ev.opts })) };
  }
  if (track.kind === "chant") {
    if (index < 0 || index >= CHANT_BARS) return null;
    const at = track.goAt + index * BAR_MS - GROOVE_PRE_MS;
    return { start:at, cues:[{ id:"floatChant", at, opts:{ bar:index } }] };
  }
  const at = index * BAR_MS;
  return { start:at - GROOVE_PRE_MS, cues:[{ id:"floatLobby", at:at - GROOVE_PRE_MS, opts:{ bar:lobbyBar(at), section:lobbySection(at), cut:!!track.cut } }] };
}
/* A bed's cue goes on the audio clock this far ahead of its time (sound.js
   `ahead`), all of a bar's in one go: one mapping of the room's clock onto
   the audio clock for the band, the calls and the answers together, and a
   bar is built (a few ms) well before it plays, so a stalled page never
   drops or drags it. */
export const BED_AHEAD_MS = GROOVE_LEAD_MS + 400;
/* the first slot a track lays from `now` (the next one not yet begun) */
export function firstSlot(track, now) {
  if (track.kind === "song") return Math.max(0, Math.ceil((now + 40 + GROOVE_PRE_MS - track.songAt) / BAR_MS));
  if (track.kind === "chant") return Math.max(0, Math.ceil((now + 40 + GROOVE_PRE_MS - track.goAt) / BAR_MS));
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
  const bed = { key:null, track:null, next:0, handles:[], queue:[] };
  const cancelBed = () => { for (const h of bed.handles) { try { h.handle?.cancel?.(); } catch {} } bed.handles = []; bed.queue = []; };
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
        bed.queue.push(...slot.cues);
      }
      for (const c of bed.queue.splice(0)) {
        if (c.at < t - GROOVE_LATE_MS) continue;
        bed.handles.push({ at:c.at, handle:cue(c.id, c.at, { opts:c.opts || {}, lateMs:GROOVE_LATE_MS, ahead:BED_AHEAD_MS }) });
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

/* the voices: the clips named by the manifest, fetched and decoded once */
export function loadGrooveVoice() {
  try {
    registerClips(VOICE.clips, { base:VOICE.base });
    return preloadClips(VOICE.clips.map(c => c.id));
  } catch { return Promise.resolve(0); }
}

/* The TV's sound on its page: the TV's surface (the room bus), the context
   made at once (a kiosk TV runs it; anything else waits for the first
   click, useFloatSoundUnlockNeeded), the global unlock, the voices, and the
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
      loadGrooveVoice();
    } catch {}
    const runner = createGrooveScreenSound(net, options);
    return () => runner.stop();
  }, [net]); // eslint-disable-line react-hooks/exhaustive-deps
}
