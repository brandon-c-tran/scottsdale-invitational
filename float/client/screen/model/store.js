/* What the screen knows about its room, kept outside React (float/GROOVE.md
   "What the room sends"): the last room message, the song's chart and beat
   0, every rider's judgements from `ev hit` (so the flotilla moves between
   the room's 4-second `scores`), who has tapped Done, the crowd's cheers.
   The frame driver reads it every frame; React re-renders only when a room
   message lands (`version`). */
import { POINTS, SONG_LEAD_MS } from "../../../shared/chart.js";
import { PHASES } from "../../../shared/protocol.js";
import { actionKind, chartFor, songStart } from "./song.js";
import { indexList } from "./cupShape.js";

export const phaseOf = name => (PHASES.includes(name) ? name : "lobby");

export function createScreenStore() {
  const listeners = new Set();
  const charts = new Map();
  const state = {
    net:null,
    status:"connecting",
    you:null,
    room:null,
    phase:"connecting",
    phaseKey:"",
    /* the server instant this phase began (its startAt, or its first message) */
    phaseSince:null,
    phaseStart:null,
    round:0,
    /* the song: its chart, beat 0, the field that plays it */
    chart:null,
    songKey:"",
    songAt:null,
    songField:[],
    offset:0,
    /* the room's last `scores`, by rider, and when they were sent */
    scores:new Map(),
    scoresAt:-Infinity,
    /* this song's judgements: i -> Map(cue id -> { q, d, at, scored }) */
    judged:new Map(),
    /* each rider's latest judged hit: { c, q, d, at, kind, scored } */
    last:new Map(),
    /* when each rider tapped Done in this song's drink break */
    done:new Map(),
    /* the crowd: when each last cheered, and the outs in order */
    cheers:new Map(),
    outs:[],
    /* Last Call's totals and who drinks (the room's lastCall), in its phase,
       and when `worst` first arrived */
    lastCall:null,
    lastCallAt:null,
    /* the chug-off (room.chugoff), the room's ranking and when it came */
    chugoff:null,
    chugoffDecidedAt:null,
    results:[],
    resultsAt:-Infinity,
    rtt:{},
    version:0,
  };

  const notify = () => { state.version += 1; listeners.forEach(fn => { try { fn(state); } catch (error) { console.error(error); } }); };
  const serverNow = () => {
    try { return state.net ? state.net.serverNow() : Date.now(); } catch { return Date.now(); }
  };

  function resetSong() {
    state.judged = new Map();
    state.last = new Map();
    state.done = new Map();
    state.scores = new Map();
    state.scoresAt = -Infinity;
  }

  function takeScores(msg) {
    if (!Array.isArray(msg.scores)) return;
    const at = Number.isFinite(msg.s) ? msg.s : serverNow();
    const next = new Map();
    for (const row of msg.scores) {
      if (!Number.isInteger(row?.i)) continue;
      next.set(row.i, row);
      if (row.done && !state.done.has(row.i)) state.done.set(row.i, at);
      if (row.done === false && state.done.has(row.i) && state.phase === "song") state.done.delete(row.i);
    }
    state.scores = next;
    state.scoresAt = at;
  }

  function onRoom(msg) {
    if (!msg || typeof msg !== "object") return;
    const phase = phaseOf(msg.phase);
    const round = msg.round | 0;
    const key = `${phase}:${round}`;
    const s = Number.isFinite(msg.s) ? msg.s : serverNow();
    if (key !== state.phaseKey) {
      state.phaseKey = key;
      state.phase = phase;
      state.phaseSince = s;
      state.phaseStart = Number.isFinite(msg.startAt) ? Math.min(msg.startAt, s) : s;
      if (phase === "lobby") { resetSong(); state.chart = null; state.songKey = ""; state.songAt = null; state.outs = []; state.cheers = new Map(); }
      /* a chug-off's Dones are its own */
      if (phase === "chugoff") state.done = new Map();
    }
    state.round = round;
    const chart = chartFor(msg, charts);
    if (phase === "song" || phase === "lastcall") {
      const songKey = `${phase}:${round}:${chart?.id || msg.song || ""}`;
      if (songKey !== state.songKey) {
        state.songKey = songKey;
        resetSong();
        state.songField = indexList(msg.field);
      }
      if (chart) state.chart = chart;
      const at = songStart(msg);
      if (at !== null) state.songAt = at;
      else if (state.songAt === null && Number.isFinite(state.phaseStart)) state.songAt = state.phaseStart + SONG_LEAD_MS;
      if (!state.songField.length) state.songField = indexList(msg.field);
    } else if (chart && (phase === "cut" || !state.chart)) state.chart = chart;
    if (Number.isFinite(msg.offset)) state.offset = msg.offset;
    takeScores(msg);
    state.lastCall = phase === "lastcall" && msg.lastCall && typeof msg.lastCall === "object" ? msg.lastCall : null;
    state.chugoff = (phase === "chugoff" || phase === "cut") && msg.chugoff && typeof msg.chugoff === "object" ? msg.chugoff : null;
    /* when the screen first heard the chug-off decided (a score or a forfeit has no Done to time it by) */
    if (phase !== "chugoff" || !Number.isInteger(state.chugoff?.winner)) state.chugoffDecidedAt = null;
    else if (state.chugoffDecidedAt === null) state.chugoffDecidedAt = s;
    /* the room's live ranking in a song, and when it was made (the strip moves it by the hits since) */
    if (phase === "song" && Array.isArray(msg.results)) { state.results = msg.results; state.resultsAt = s; }
    else if (phase !== "song") { state.results = Array.isArray(msg.results) ? msg.results : []; state.resultsAt = s; }
    /* when the room first named who drinks (the verdict waits for the sound's sting too) */
    if (!Array.isArray(state.lastCall?.worst)) state.lastCallAt = null;
    else if (state.lastCallAt === null) state.lastCallAt = s;
    const outs = indexList(msg.out);
    if (outs.length || phase === "lobby" || phase === "intro") state.outs = outs;
    state.room = msg;
    notify();
  }

  function onEv(msg) {
    if (!msg || typeof msg !== "object" || !Number.isInteger(msg.i)) return;
    const now = serverNow();
    const at = Number.isFinite(msg.s) ? Math.min(msg.s, now) : now;
    if (msg.e === "hit") {
      const cue = Number.isInteger(msg.c) ? state.chart?.cues?.[msg.c] : null;
      if (!cue || typeof msg.q !== "string") return;
      let mine = state.judged.get(msg.i);
      if (!mine) state.judged.set(msg.i, mine = new Map());
      /* one judgement per cue per player: the first */
      if (mine.has(msg.c)) return;
      const d = Number.isFinite(msg.d) ? msg.d : null;
      mine.set(msg.c, { q:msg.q, d, at, scored:!!cue.scored });
      state.last.set(msg.i, { c:msg.c, q:msg.q, d, at, kind:actionKind(state.chart, cue), scored:!!cue.scored });
    } else if (msg.e === "done") {
      if (!state.done.has(msg.i)) state.done.set(msg.i, at);
    } else if (msg.e === "cheer") {
      state.cheers.set(msg.i, at);
    } else if (msg.e === "out") {
      if (!state.outs.includes(msg.i)) state.outs = [...state.outs, msg.i];
    }
  }

  function onDebug(msg) { if (msg?.rtt && typeof msg.rtt === "object") state.rtt = msg.rtt; }

  /* a rider's live score (0 to 100, or null before a judgement): the room's
     last word for them plus whatever was judged since */
  function liveOf(i) {
    const mine = state.judged.get(i);
    let pts = 0, n = 0, extraPts = 0, extraN = 0;
    if (mine) for (const j of mine.values()) {
      if (!j.scored) continue;
      const p = POINTS[j.q] || 0;
      pts += p; n += 1;
      if (j.at > state.scoresAt) { extraPts += p; extraN += 1; }
    }
    const row = state.scores.get(i);
    if (row && Number.isFinite(row.pts) && Number.isFinite(row.n) && row.n >= n - extraN && row.n > 0) {
      const total = row.n + extraN;
      return total ? (row.pts + extraPts) / total : null;
    }
    return n ? pts / n : (row && Number.isFinite(row.live) && row.n ? row.live : null);
  }

  return {
    state,
    serverNow,
    liveOf,
    attach(net) {
      state.net = net;
      if (!net) return () => {};
      const offs = [
        net.on("welcome", msg => {
          state.you = msg?.you || null;
          if (msg?.chart) chartFor({ chart:msg.chart }, charts);
          notify();
        }),
        net.on("room", onRoom),
        net.on("ev", onEv),
        net.on("debug", onDebug),
      ];
      const offStatus = net.onStatus?.(next => { state.status = next; notify(); });
      state.status = net.status?.() || "connecting";
      return () => { offs.forEach(off => off?.()); offStatus?.(); };
    },
    onRoom, onEv, onDebug,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    /* ms since this phase began, on the server clock */
    phaseElapsed:() => (Number.isFinite(state.phaseStart) ? serverNow() - state.phaseStart : 0),
  };
}
