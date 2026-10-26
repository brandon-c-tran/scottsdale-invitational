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
    }
    if (phase === "countdown" || phase === "race") {
      /* the countdown names its gun as startAt; a race's startAt is the gun */
      if (Number.isFinite(msg.startAt) && (state.gunRound !== round || phase === "race")) { state.gun = msg.startAt; state.gunRound = round; }
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
      ];
      const offStatus = net.onStatus?.(next => { state.status = next; notify(); });
      state.status = net.status?.() || "connecting";
      return () => { offs.forEach(off => off?.()); offStatus?.(); };
    },
    onRoom, onSnap, onEv, takeEvents,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    /* ms since this phase began, on the server clock */
    phaseElapsed:() => (Number.isFinite(state.phaseStart) ? serverNow() - state.phaseStart : 0),
  };
}
