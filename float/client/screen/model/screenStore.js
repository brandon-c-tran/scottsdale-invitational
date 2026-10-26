/* What the screen knows about its room, kept outside React: the last room
   message, the prepared course, the snapshot buffer and the moments. The
   world reads it every frame; the HUD re-renders when `version` moves (room
   changes) and at a few hertz for the race order. Pure apart from
   performance.now() for local animation clocks. */
import { prepareCourse } from "./courseGeom.js";
import { createSnapBuffer, INTERP_MS } from "./snapBuffer.js";
import { indexList } from "./cupShape.js";

/* the Cup's phases (PROTOCOL.md); shared/protocol.js's older names map onto them */
const PHASE = { lobby:"lobby", intro:"intro", grid:"grid", countdown:"countdown", race:"race", cut:"cut", results:"cut",
  podium:"podium", feedback:"feedback" };
export const phaseOf = name => PHASE[name] || "lobby";

const nowLocal = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

export function createScreenStore() {
  const buffer = createSnapBuffer({ keepMs:30000 });
  const listeners = new Set();
  const courses = new Map();
  const state = {
    net:null,
    status:"connecting",
    you:null,
    room:null,
    geo:null,
    phase:"connecting",
    phaseKey:"",
    prevPhase:null,
    /* the server instant this phase began (its first room message), and the local clock then */
    phaseSince:null,
    phaseStart:null,
    phaseLocal:0,
    gun:null,
    gunRound:-1,
    raceField:[],
    raceRound:-1,
    raceLeg:0,
    arrivals:[],
    events:[],
    log:[],
    rtt:{},
    replay:null,
    version:0,
  };

  const notify = () => { state.version++; listeners.forEach(fn => { try { fn(state); } catch (error) { console.error(error); } }); };
  const serverNow = () => {
    try { return state.net ? state.net.serverNow() : Date.now(); } catch { return Date.now(); }
  };

  function setCourse(course) {
    if (!course || typeof course !== "object" || !Array.isArray(course.line)) return;
    const id = course.id || "course";
    if (courses.has(id) && courses.get(id).course === course) { state.geo = courses.get(id); return; }
    try {
      const geo = prepareCourse(course);
      courses.set(id, geo);
      state.geo = geo;
    } catch (error) { console.error("Float course", error); }
  }

  function onRoom(msg) {
    if (!msg || typeof msg !== "object") return;
    if (msg.course) setCourse(msg.course);
    else if (msg.courseId && courses.has(msg.courseId)) state.geo = courses.get(msg.courseId);
    const phase = phaseOf(msg.phase);
    const round = msg.round | 0;
    const key = `${phase}:${round}`;
    if (key !== state.phaseKey) {
      state.prevPhase = state.phase;
      state.phaseKey = key;
      state.phase = phase;
      state.phaseSince = Number.isFinite(msg.s) ? msg.s : serverNow();
      /* when the phase really began: its startAt (a screen that joins late
         is past it); a countdown's startAt is its gun, so not there */
      state.phaseStart = phase !== "countdown" && Number.isFinite(msg.startAt) ? Math.min(msg.startAt, state.phaseSince) : state.phaseSince;
      state.phaseLocal = nowLocal();
      /* a new round's grid: the last race's rows are history */
      if (phase === "grid" || (phase === "countdown" && state.raceRound !== round) || (phase === "race" && state.raceRound !== round)) {
        if (state.raceRound !== round) { state.arrivals = []; buffer.clear(); }
      }
      if (phase === "lobby" || phase === "intro") { state.arrivals = []; buffer.clear(); state.raceRound = -1; }
      /* a replay belongs to the cut right after its race */
      if (phase !== "cut") state.replay = null;
    }
    if (phase === "countdown" || phase === "race") {
      /* the countdown names its gun as startAt; a race's startAt is the gun; a
         race resumed after the room restarted counts down again to a new one */
      if (Number.isFinite(msg.startAt)) { state.gun = msg.startAt; state.gunRound = round; }
    }
    if (phase === "grid" || phase === "countdown" || phase === "race") {
      state.raceField = indexList(msg.field);
      state.raceRound = round;
      state.raceLeg = msg.leg | 0;
    }
    /* arrivals the moments missed (a screen that joined late) come from the results */
    for (const row of Array.isArray(msg.results) ? msg.results : []) {
      if (Number.isInteger(row?.i) && !state.arrivals.includes(row.i) && (phase === "race" || phase === "cut")) state.arrivals.push(row.i);
    }
    state.room = msg;
    notify();
  }

  function onSnap(msg) { buffer.push(msg); }

  function onEv(msg) {
    if (!msg || typeof msg !== "object") return;
    state.events.push(msg);
    if (state.events.length > 200) state.events.splice(0, state.events.length - 200);
    state.log.push(msg);
    const cutoff = (Number(msg.s) || serverNow()) - 30000;
    while (state.log.length && (Number(state.log[0].s) || 0) < cutoff) state.log.shift();
    if (msg.e === "arrive" && Number.isInteger(msg.i) && !state.arrivals.includes(msg.i)) state.arrivals.push(msg.i);
  }

  function onDebug(msg) { if (msg?.rtt && typeof msg.rtt === "object") state.rtt = msg.rtt; }

  /* The Drop's instant replay (float/PROTOCOL.md "As built": replay): the
     clip's rows in their own buffer, played in the cut that follows */
  function onReplay(msg) {
    if (!msg || !Array.isArray(msg.k) || !msg.k.length || !Number.isFinite(msg.at)) return;
    const buffer = createSnapBuffer({ keepMs:60000 });
    for (const frame of msg.k) if (Array.isArray(frame) && Array.isArray(frame[1])) buffer.push({ s:frame[0], k:frame[1] });
    state.replay = { leg:msg.leg | 0, at:msg.at, i:Number.isInteger(msg.i) ? msg.i : null, buffer, from:buffer.oldest(), to:buffer.newest(),
      round:state.room?.round ?? null };
    notify();
  }

  /* the world's queue: moments now due at the draw time */
  function takeEvents(drawAt) {
    const due = [];
    let k = 0;
    while (k < state.events.length) {
      const e = state.events[k];
      const at = Number(e.s);
      if (!Number.isFinite(at) || at <= drawAt) { due.push(e); state.events.splice(k, 1); }
      else k++;
    }
    return due;
  }

  return {
    state,
    buffer,
    serverNow,
    drawTime:() => serverNow() - INTERP_MS,
    sample:(at, out) => buffer.sample(at, out),
    attach(net) {
      state.net = net;
      if (!net) return () => {};
      const offs = [
        net.on("welcome", msg => { state.you = msg?.you || null; if (msg?.course) setCourse(msg.course); notify(); }),
        net.on("room", onRoom),
        net.on("snap", onSnap),
        net.on("ev", onEv),
        net.on("debug", onDebug),
        net.on("replay", onReplay),
      ];
      const offStatus = net.onStatus?.(next => { state.status = next; notify(); });
      state.status = net.status?.() || "connecting";
      return () => { offs.forEach(off => off?.()); offStatus?.(); };
    },
    onRoom, onSnap, onEv, takeEvents,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    /* when the replay plays, on the server clock, and where in the clip:
       it opens just into the cut, from a little before the moment, slowed */
    replayWindow() {
      const r = state.replay;
      if (!r || state.phase !== "cut" || !Number.isFinite(state.phaseStart)) return null;
      const clipFrom = Math.max(r.from, r.at - 2600), clipTo = Math.min(r.to, r.at + 1700);
      const rate = 0.7;
      const from = state.phaseStart + 400;
      return { from, to:from + (clipTo - clipFrom) / rate, clipFrom, clipTo, rate, i:r.i, at:r.at, leg:r.leg };
    },
    onReplay,
    /* ms since this phase began, on the server clock */
    phaseElapsed:() => (Number.isFinite(state.phaseStart) ? serverNow() - state.phaseStart : 0),
  };
}
