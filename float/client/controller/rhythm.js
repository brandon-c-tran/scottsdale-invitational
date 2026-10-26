/* The beat on the phone (float/PROTOCOL.md "The beat"): the glue between a
   touch and float/shared/beat.js. Pure, so the stamping and judging are
   tested without a browser.

   - A stroke is judged at the moment the thumb lands (or, for a pull that
     begins later, when the pull begins), mapped from the touch event's own
     time onto the room's clock: serverNow - (perfNow - event time).
   - The gun is the room's in `countdown` and `race` (gunAt: startAt); on
     the grid it is the band's predictedGun (the grid's end plus the
     count-in), so practice before the gun is on the very beats the music
     plays, and the 3-2-1 lands on them.
   - Only the first stroke in a beat can be on it: lastBeat is the beat of
     the last stroke of any judgement (the room's reading, sim.js), so an
     early stroke in beat k makes the rest of beat k too fast. A touch is
     peeked at when it lands (shown at once) and committed when it turns
     out to be a stroke, so a thumb that only rests never claims a beat.
   - The streak shown: the phone's own count from the instant of a stroke,
     until a `me` the room sent `settle` after it (its own stamp `s`: time
     for the stroke to have reached the room, so a frame that was only slow
     to arrive is never taken for one that counted it) says the truth; the
     next stroke counts on from that. Until the room has said a streak at
     all (an older room), the phone's own count stands. In practice there
     is no room: the phone's own count.
   - The room's word on the call restamps it when it puts the stroke on the
     other side of the beat (on it or off it): the only way the same stroke
     can be called otherwise (a stamp the room could not believe, a beat
     already stroked), so a word about some other stroke never moves it.
   - A beat with no stroke, after a stroked beat, drops the streak a level
     (to that level's floor), once per gap, judged BEAT.MISS_GRACE_MS after
     that beat as the room does: a drink or a pause costs groove, not
     everything. */
import { BEAT_MS, LEVELS, judge, judgeStroke, levelFloor, levelName, levelOf } from "../../shared/beat.js";
import { BEAT } from "../../shared/tuning.js";
import { predictedGun } from "../sound/music.js";
import { gunAt } from "./controllerModel.js";

export const MAX_LEVEL = LEVELS[LEVELS.length - 1].level;
/* a `me` the room sent this long after a stroke has counted it (no round trip known yet) */
export const SETTLE_MS = 220;
/* a gun that moves this far is another race's */
export const GUN_SLACK = BEAT_MS / 4;
export const QUALITIES = Object.freeze(["perfect", "good", "early", "late", "fast"]);

/* a touch's own time (performance clock) on the room's clock */
export const serverStamp = (eventAt, { perfNow, serverNow }) =>
  Number.isFinite(eventAt) && Number.isFinite(perfNow) && Number.isFinite(serverNow) ? serverNow - (perfNow - eventAt) : serverNow;

const num = v => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

/* the beat grid's zero for this room: the gun, or on the grid where it will be */
export function beatGun(room) {
  if (!room) return null;
  if (room.phase === "race" || room.phase === "countdown") return gunAt(room);
  if (room.phase === "grid") return predictedGun(room);
  return null;
}

/* the beat is live in a race (strokes sent and counted), practice before the gun (shown, never sent) */
export const beatMode = phase => phase === "race" ? "live" : phase === "grid" || phase === "countdown" ? "practice" : null;

/* how long after a stroke a `me` the room sends has counted it: the way there, and room to spare */
export const settleFor = rtt => Number.isFinite(rtt) && rtt > 0 ? Math.max(100, Math.min(600, Math.round(rtt / 2) + 80)) : SETTLE_MS;
const ON_BEAT = new Set(["perfect", "good"]);

/* a missed beat: one level down, to that level's floor */
export const dropLevel = streak => levelFloor(Math.max(0, levelOf(streak) - 1));
/* the beat after beat k counts as missed from this server time on (sim.js checkMisses) */
export const missedAt = (k, gun) => gun + (k + 1) * BEAT_MS + BEAT.MISS_GRACE_MS;

/* the streak as the meter draws it: the level, its name, how far toward the next */
export function meterOf(streak, level = null) {
  const s = Math.max(0, Math.floor(Number(streak) || 0));
  const lv = Number.isInteger(level) ? Math.max(0, Math.min(MAX_LEVEL, level)) : levelOf(s);
  const top = lv >= MAX_LEVEL;
  const floor = levelFloor(lv), next = top ? floor : LEVELS[lv + 1].at;
  return { streak:s, level:lv, name:levelName(lv), top, fill:top ? 1 : Math.max(0, Math.min(1, (s - floor) / (next - floor))) };
}

/* the meter's three steps (Rhythm, Groove, Locked in), each filling from the step before */
export function meterSteps(streak) {
  const s = Math.max(0, Number(streak) || 0);
  return LEVELS.slice(1).map((step, k) => {
    const from = LEVELS[k].at;
    return { level:step.level, name:step.name, fill:Math.max(0, Math.min(1, (s - from) / (step.at - from))) };
  });
}

export function createRhythm({ settle = SETTLE_MS } = {}) {
  let mode = "live";
  let settleMs = settle;
  /* the beat of the last stroke, of any judgement: a further stroke in it is too fast, a gap after it drops a level */
  let lastBeat = null;
  /* the gun the beats are counted from: a new one is a new race */
  let gunUsed = null;
  let local = { streak:0, at:-Infinity, final:null, checked:true };
  let room = { known:false, streak:0, level:null, q:null, at:-Infinity };
  let version = 0;
  const listeners = new Set();
  const changed = () => {
    version += 1;
    for (const fn of [...listeners]) { try { fn(); } catch {} }
  };

  /* the phone's own count at `now` (server ms): a gap since the last stroked beat drops it a level */
  const ownAt = (now, gun) => {
    if (lastBeat === null || !Number.isFinite(gun) || !Number.isFinite(now)) return local.streak;
    return now >= missedAt(lastBeat, gun) ? dropLevel(local.streak) : local.streak;
  };
  /* the room's count has caught up with the last stroke */
  const settled = () => mode === "live" && room.known && room.at >= local.at + settleMs;
  const shown = (now, gun) => settled() ? { streak:room.streak, level:room.level } : { streak:ownAt(now, gun), level:null };

  const api = {
    /* practice before the gun or a live race; a change starts the count over */
    setMode(next) {
      const want = next === "practice" ? "practice" : "live";
      if (want === mode) return false;
      mode = want;
      api.reset();
      return true;
    },
    mode:() => mode,
    setSettle(ms) { if (Number.isFinite(ms) && ms > 0) settleMs = ms; },
    /* Beats are numbered from a gun: one that moves by GUN_SLACK or more
       (a new race, a resumed one) starts the count over; the grid's
       predicted gun and the countdown's own differ by a tick and do not. */
    track(gun) {
      if (!Number.isFinite(gun)) return false;
      const moved = gunUsed !== null && Math.abs(gun - gunUsed) >= GUN_SLACK;
      if (moved) api.reset();
      gunUsed = gun;
      return moved;
    },
    /* how a touch at server time t lands, without claiming the beat */
    peek(t, gun) {
      if (!Number.isFinite(gun) || !Number.isFinite(t)) return null;
      api.track(gun);
      return judgeStroke(t, gun, { lastBeat });
    },
    /* A peeked touch became a stroke at server time `now`: judged again
       against the beat as it stands (a stroke that fired first may have
       claimed it), and counted. heard: the room hears it (never in
       practice, where nothing is sent), so its word on it is awaited. */
    commit(j, now, { heard = mode === "live" } = {}) {
      if (!j || !Number.isInteger(j.k) || !Number.isFinite(j.d)) return null;
      const final = { k:j.k, d:j.d, ...judge(j.k, j.d, { lastBeat }) };
      const fromRoom = settled();
      let base = fromRoom ? room.streak : local.streak;
      if (!fromRoom && lastBeat !== null && j.k > lastBeat + 1) base = dropLevel(base);
      lastBeat = lastBeat === null ? j.k : Math.max(lastBeat, j.k);
      local = { streak:final.onBeat ? base + 1 : 0, at:Number.isFinite(now) ? now : local.at, final, checked:!heard };
      changed();
      return final;
    },
    /* both at once: a stroke at server time t */
    judge(t, gun, options) {
      return api.commit(api.peek(t, gun), t, options);
    },
    /* The room's `me` (sent at its own stamp `s`, else taken as sent at
       `now`): the truth the count gives way to. Returns the room's word on
       the last stroke when it is the first `me` sent after the room had it
       and puts it on the other side of the beat, else null. */
    room(me, now) {
      if (!me || typeof me !== "object" || mode !== "live") return null;
      const streak = num(me.streak), level = num(me.level), q = QUALITIES.includes(me.q) ? me.q : null;
      if (streak === null && level === null && q === null) return null;
      const sent = num(me.s) ?? now;
      if (sent < room.at) return null;
      const before = shown(now, null);
      room = { known:room.known || streak !== null, streak:streak !== null ? Math.max(0, Math.floor(streak)) : room.streak,
        level:level !== null ? Math.max(0, Math.min(MAX_LEVEL, Math.floor(level))) : streak !== null ? null : room.level,
        q:q ?? room.q, at:sent };
      let word = null;
      if (local.final && !local.checked && sent >= local.at + settleMs && q !== null) {
        local.checked = true;
        if (ON_BEAT.has(q) !== local.final.onBeat) word = q;
      }
      const after = shown(now, null);
      if (word || after.streak !== before.streak || after.level !== before.level) changed();
      return word;
    },
    /* what the meter draws at server time `now` */
    meter(now, gun) {
      const s = shown(now, gun);
      return meterOf(s.streak, s.level);
    },
    /* when the meter changes by itself (a missed beat in the phone's own count), or null */
    dueAt(now, gun) {
      if (settled() || lastBeat === null || !Number.isFinite(gun)) return null;
      const at = missedAt(lastBeat, gun);
      return at > now && dropLevel(local.streak) !== local.streak ? at : null;
    },
    roomQ:() => room.q,
    lastBeat:() => lastBeat,
    reset() {
      lastBeat = null;
      local = { streak:0, at:-Infinity, final:null, checked:true };
      room = { known:false, streak:0, level:null, q:null, at:-Infinity };
      changed();
    },
    subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    version:() => version,
  };
  return api;
}

/* the stamp a judgement draws: its words and its weight */
export const STAMPS = Object.freeze({
  perfect:{ text:"Perfect", tone:"gold" },
  good:{ text:"Good", tone:"white" },
  early:{ text:"Early", tone:"red" },
  late:{ text:"Late", tone:"red" },
  fast:{ text:"Too fast", tone:"red" },
});
export const stampOfQ = q => STAMPS[q] || STAMPS.late;
/* the stroke sound's power by judgement (the landing has no pull yet) */
export const POWER_OF = Object.freeze({ perfect:1, good:0.85, early:0.6, late:0.6, fast:0.5 });

/* the next beat at or after t (server ms) */
export const nextBeatAt = (t, gun, beatMs = BEAT_MS) =>
  Number.isFinite(t) && Number.isFinite(gun) ? gun + Math.ceil((t - gun) / beatMs) * beatMs : null;
