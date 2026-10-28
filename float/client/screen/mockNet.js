/* The screen's stand-in room (`?mock=1`): a whole Cup scripted from the
   shared charts (float/shared/chart.js), speaking float/GROOVE.md's
   messages exactly, over the net API's shape (float/PROTOCOL.md "Net"):
   { send, on, close, serverNow, rtt, status, onStatus }. Nothing goes over
   the network.

     ?mock=1               a lobby that fills with the roster's phones; Start runs the Cup
     &n=13                 how many phones join (0 to 16)
     &auto=1               start on its own once they are in
     &shot=<moment>        jump straight to a moment (MOCK_SHOTS)
     &freeze=1             and stop the clock there (screenshots)
     &seed=3               another room
     &drinking=0           a room with drinking off

   The Cup is a pure timeline (scriptCup): every message the room would
   send, stamped on the mock's clock, computed once when the Cup starts.
   The connection emits what is due as its clock runs; a shot moves the
   clock to the moment and replays that phase's messages. Riders tap every
   cue with a raw offset drawn from their skill (a sharp one within about
   30 ms, a weak one about 90 ms and an occasional miss), the room judges
   them with its calibration (the median of the people's practice taps),
   misses land MISS_AFTER_MS late, Done comes 4 to 14 s into the break
   (one straggler into the second half), and the crowd cheers. */
import {
  BEATS_PER_BAR, CALIBRATION, MISS_AFTER_MS, POINTS, SONG_LEAD_MS, SONG_MS, SONG_TAIL_MS,
  calibrate, chartOf, cueTime, judgeHit, scoreOf, songForRound,
} from "../../shared/chart.js";
import { CRITTERS, CRITTER_IDS, cleanLook, defaultLook, HAT_IDS, POSE_IDS, SHADE_IDS } from "../../shared/looks.js";
import { FLOATIE_IDS } from "../../shared/floaties.js";
import { PALETTE } from "../../shared/protocol.js";
import { cutSchedule } from "./model/cupShape.js";

/* the phases' lengths (ms) */
export const MOCK_TIMES = Object.freeze({ INTRO:7000, CUT:17000, LAST_CUT:8000, PODIUM:15000, FEEDBACK:24000, JOIN:280 });

const NAMES = ["Brandon", "Evan", "Eyob", "Sahil", "Khoa", "Chinh", "Adi", "Chiang", "Richard", "Allan", "Henry", "Ben", "Jeremy",
  "Marco", "Dev", "Theo"];
const COLORS = ["#ff5a4e", "#ffc93c", "#3dc6e0", "#8bd450", "#b57cf0", "#ff8a3d", "#2f8cff", "#ff6fae", "#20c39a",
  "#e8455f", "#6c6cf5", "#c6d63a", "#14a8a8", "#f29e4c", "#9e6bd8", "#7fb8ff"];

/* a phone from the roster: one critter each, the groom crowned */
export function mockRider(k) {
  const name = NAMES[k % NAMES.length];
  const groom = name === "Brandon";
  const hats = HAT_IDS.filter(id => id !== "crown");
  const look = cleanLook({
    ...defaultLook(name, FLOATIE_IDS),
    critter:CRITTER_IDS[k % CRITTER_IDS.length],
    hat:groom ? "crown" : hats[(k * 5 + 1) % hats.length],
    shades:SHADE_IDS[(k * 3) % SHADE_IDS.length],
    pose:POSE_IDS[k % POSE_IDS.length],
  }, { groom, floatieIds:FLOATIE_IDS, seed:name });
  return { name, color:COLORS[k % COLORS.length], look, drinks:k % 7 !== 5, number:k + 1, ...(groom ? { groom:true } : {}) };
}

/* ── a seeded hash: the same Cup every time for a seed ── */
const hash01 = (...parts) => {
  let h = 2166136261;
  for (const part of parts) {
    h ^= Math.imul((part | 0) + 0x9e3779b9, 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 15), 0xc2b2ae35);
    h ^= h >>> 13;
  }
  h = Math.imul(h ^ (h >>> 16), 0x27d4eb2f);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
};
const gauss = (...parts) => {
  const u = Math.max(1e-6, hash01(...parts, 1)), v = hash01(...parts, 2);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
/* spread skills, sharpest first, shuffled by the seed */
export function mockSkills(n, seed = 3) {
  const list = Array.from({ length:n }, (_, k) => 0.95 - (0.68 * k) / Math.max(1, n - 1));
  return list.map((skill, k) => ({ skill, key:hash01(seed, k, 77) })).sort((a, b) => a.key - b.key).map(item => item.skill);
}

const BOT_NAMES = CRITTERS.map(c => c.name);

/* the room's entrant record (float/PROTOCOL.md `room.entrants`) */
const entrantOf = (rider, extra = {}) => ({
  device:rider.device ?? null, name:rider.name, color:rider.color, look:rider.look, bot:!!rider.bot,
  connected:rider.connected !== false, ready:!!rider.ready,
  ...(rider.pid ? { pid:rider.pid } : {}), ...(rider.number !== undefined ? { number:rider.number } : {}),
  ...(rider.groom ? { groom:true } : {}), ...extra,
});

/* ── the Cup as a timeline ── */

/* Every message the room sends a screen from `startAt` (the host's Start)
   to the lobby after the feedback: [{ s, msg }] in order, plus the marks
   (when each phase begins) the shots jump to. `riders` are the entrants
   (each { name, color, look, bot, drinks, skill, device }). */
export function scriptCup({ riders = [], startAt = 0, seed = 3, drinking = true, mode = "party", code = "mock", cupId = "mock-cup" } = {}) {
  const out = [];
  const n = riders.length;
  const schedule = cutSchedule(n);
  const rounds = schedule.length;
  const marks = { start:startAt, intro:startAt, songs:[], cuts:[], podium:null, feedback:null, lobby:null };
  const entrants = riders.map(rider => entrantOf(rider, { ready:false }));
  const cupTotals = new Array(n).fill(0);
  const eliminated = [];
  let field = riders.map((_, i) => i);
  let offset = 0;
  let history = [];
  const base = { t:"room", mode, code, drinking, rounds, cupId, entrants };
  const room = (s, fields) => out.push({ s, msg:{ ...base, ...fields, s } });
  const ev = (s, fields) => out.push({ s, msg:{ t:"ev", ...fields, s } });

  /* intro */
  let t = startAt;
  room(t, { phase:"intro", round:0, field:[...field], out:[], startAt:t, endsAt:t + MOCK_TIMES.INTRO, song:songForRound(0, rounds),
    cut:rounds > 1 ? schedule[1] : null, lastRound:rounds <= 1, standings:[], podium:null });
  t += MOCK_TIMES.INTRO;

  for (let round = 0; round < rounds; round += 1) {
    const songId = songForRound(round, rounds);
    const chart = chartOf(songId);
    const songAt = t + SONG_LEAD_MS;
    const endsAt = songAt + SONG_MS + SONG_TAIL_MS;
    const last = round === rounds - 1;
    const next = last ? null : schedule[round + 1];
    const drink = chart.sections.find(s => s.kind === "drink");
    const drinkFrom = cueTime(songAt, drink.from, chart.beatMs);
    const playFrom = cueTime(songAt, chart.sections.find(s => s.kind === "play").from, chart.beatMs);
    marks.songs.push({ round, song:songId, startAt:t, songAt, endsAt });

    /* who drinks, and when each taps Done */
    const doneAt = new Map();
    const drinkers = field.filter(i => drinking && riders[i].drinks !== false);
    const slow = drinkers.length >= 4 ? drinkers[Math.floor(hash01(seed, round, 404) * drinkers.length)] : null;
    for (const i of field) {
      if (!drinkers.includes(i)) doneAt.set(i, drinkFrom);
      else if (i === slow) doneAt.set(i, drinkFrom + 17500 + hash01(seed, round, i, 5) * 3500);
      else doneAt.set(i, drinkFrom + 4000 + hash01(seed, round, i, 6) * 10000);
    }

    /* every rider's every tap, judged as the room would */
    const judged = new Map(field.map(i => [i, {}]));
    const samples = [];
    const offsets = [];
    const events = [];
    let practiceOffset = offset;
    for (const cue of chart.cues) {
      const at = cueTime(songAt, cue.beat, chart.beatMs);
      /* the room's offset: recomputed through practice (at most once a beat), fixed from the first play bar */
      if (at < playFrom) {
        const value = calibrate(samples.filter(x => x.s <= at).map(x => x.r));
        if (value !== null && value !== practiceOffset) {
          practiceOffset = value;
          const beatAt = songAt + Math.ceil((at - songAt) / chart.beatMs) * chart.beatMs;
          offsets.push({ s:beatAt, offset:value });
        }
      }
      const roomOffset = at < playFrom ? practiceOffset : offset;
      for (const i of field) {
        const rider = riders[i];
        const skill = rider.skill ?? 0.6;
        const drinkingNow = at >= drinkFrom && at < doneAt.get(i);
        const missed = drinkingNow || hash01(seed, round, i, cue.id, 1) < 0.012 + (1 - skill) * 0.085;
        const bias = 38 + gauss(seed, i, 9) * 14;
        const r = Math.round(bias + gauss(seed, round, i, cue.id) * (20 + (1 - skill) * 105));
        const call = missed ? null : judgeHit(chart, cue.id, r, roomOffset);
        if (!call) {
          judged.get(i)[cue.id] = "miss";
          events.push({ s:at + roomOffset + MISS_AFTER_MS, i, c:cue.id, q:"miss" });
        } else {
          judged.get(i)[cue.id] = call.q;
          const lag = 70 + Math.round(hash01(seed, round, i, cue.id, 3) * 90);
          events.push({ s:at + r + lag, i, c:cue.id, q:call.q, d:call.d });
          if (!cue.scored && !rider.bot && Math.abs(r) <= CALIBRATION.RANGE) samples.push({ s:at + r + lag, r });
        }
      }
    }
    if (calibrate(samples.map(x => x.r)) !== null) offset = practiceOffset;

    /* the scores the room sends: this song so far, the Cup before it, Done */
    const scoresAt = s => field.map(i => {
      const sofar = {};
      for (const e of events) if (e.i === i && e.s <= s) sofar[e.c] = e.q;
      const beat = (s - songAt) / chart.beatMs;
      const score = scoreOf(chart, sofar, { upTo:beat });
      return { i, pts:score.pts, pct:score.pct, live:score.live, n:score.n, cup:Math.round(cupTotals[i] * 10) / 10,
        done:s >= (doneAt.get(i) ?? Infinity) };
    });
    const songRoom = (s, extra = {}) => room(s, { phase:"song", round, field:[...field], out:[...eliminated], startAt:t, endsAt,
      song:songId, chartId:songId, songAt, offset:s < playFrom ? (offsets.filter(o => o.s <= s).pop()?.offset ?? offset) : offset,
      scores:scoresAt(s), cut:next, lastRound:last, standings:[], podium:null, history, ...extra });

    songRoom(t, { chart });
    for (let s = t + 4000; s < endsAt; s += 4000) songRoom(s);
    for (const o of offsets) songRoom(o.s);
    for (const e of events) ev(e.s, { e:"hit", i:e.i, c:e.c, q:e.q, ...(e.q === "miss" ? {} : { d:e.d }) });
    for (const i of field) if (drinkers.includes(i)) ev(doneAt.get(i), { e:"done", i });
    /* the crowd on the bank cheers now and then, and all together on the last cue */
    const lastCue = cueTime(songAt, chart.cues[chart.cues.length - 1].beat, chart.beatMs);
    eliminated.forEach((i, k) => {
      for (let s = songAt + 1500 + hash01(seed, round, i, 11) * 4000; s < endsAt - 1000; s += 2600 + hash01(seed, round, i, Math.floor(s)) * 5200) {
        ev(Math.round(s), { e:"cheer", i });
      }
      ev(lastCue + 120 + k * 60, { e:"cheer", i });
    });

    /* the cut: this song's percents, the bottom out, ties broken by the Cup */
    const final = scoresAt(endsAt);
    const ranked = [...final].sort((a, b) => b.pct - a.pct || cupTotals[b.i] - cupTotals[a.i] || a.i - b.i);
    for (const row of final) cupTotals[row.i] += row.pct;
    const goes = last ? ranked.map(row => row.i) : ranked.slice(0, next).map(row => row.i);
    const gone = last ? [] : ranked.slice(next).map(row => row.i);
    history = [...history, { round, song:songId, field:[...field], out:[...gone], results:ranked.map(row => ({ i:row.i, pct:row.pct })) }];
    t = endsAt;
    const cutMs = last ? MOCK_TIMES.LAST_CUT : MOCK_TIMES.CUT;
    marks.cuts.push({ round, startAt:t, endsAt:t + cutMs });
    eliminated.push(...gone.slice().reverse());
    room(t, { phase:"cut", round, field:[...field], out:[...eliminated], startAt:t, endsAt:t + cutMs, song:songId, chartId:songId,
      songAt, offset, scores:final, cut:next, lastRound:last, standings:[], podium:null, history });
    gone.slice().reverse().forEach((i, k) => ev(t + 2400 + k * 420, { e:"out", i }));
    field = goes;
    t += cutMs;
  }

  /* the podium: the final's order, then everyone else from the last cut out */
  const finalOrder = history[history.length - 1].results.map(row => row.i);
  const standings = [...finalOrder, ...eliminated.slice().reverse()];
  marks.podium = t;
  room(t, { phase:"podium", round:rounds - 1, field:[...field], out:[...eliminated], startAt:t, endsAt:t + MOCK_TIMES.PODIUM,
    podium:finalOrder.slice(0, 3), standings, final:standings, cut:null, lastRound:true, history });
  t += MOCK_TIMES.PODIUM;
  marks.feedback = t;
  room(t, { phase:"feedback", round:rounds - 1, field:[...field], out:[...eliminated], startAt:t, endsAt:t + MOCK_TIMES.FEEDBACK,
    podium:finalOrder.slice(0, 3), standings, final:standings, cut:null, lastRound:true, history });
  t += MOCK_TIMES.FEEDBACK;
  marks.lobby = t;
  room(t, { phase:"lobby", round:0, field:[], out:[], startAt:null, endsAt:null, standings:[], podium:null, cut:null, lastRound:false });

  out.sort((a, b) => a.s - b.s);
  return { msgs:out, marks, rounds };
}

/* ── the moments a shot opens on ── */
/* when, from the Cup's marks (song moments by beat) */
const songBeat = (round, beat) => marks => {
  const song = marks.songs[Math.min(round, marks.songs.length - 1)];
  return song ? song.songAt + beat * 500 : null;
};
const SHOTS = {
  lobby:{ lobby:true },
  /* a Field Day Cup reserved by the Tournament, waiting for its start */
  fdlobby:{ lobby:true, fieldday:true },
  intro:{ at:m => m.intro + 2600 },
  card:{ at:m => m.songs[0].startAt + 1300 },
  count:{ at:songBeat(0, 5.2) },
  practice:{ at:songBeat(0, 15.35) },
  go:{ at:songBeat(0, 24.25) },
  play:{ at:songBeat(0, 39.3) },
  hey:{ at:songBeat(0, 47.25) },
  drink:{ at:songBeat(0, 66) },
  late:{ at:songBeat(0, 92.3) },
  outro:{ at:songBeat(0, 120.35) },
  cut:{ at:m => m.cuts[0].startAt + 4200 },
  cutout:{ at:m => m.cuts[0].startAt + 8600 },
  cutnext:{ at:m => m.cuts[0].startAt + 13800 },
  rock:{ at:songBeat(1, 42.3) },
  spin:{ at:songBeat(2, 34.6) },
  sign:{ at:songBeat(3, 13.5) },
  final:{ at:songBeat(3, 101.3) },
  drop:{ at:songBeat(3, 120.45) },
  finalcut:{ at:m => m.cuts[m.cuts.length - 1].startAt + 3500 },
  podium:{ at:m => m.podium + 5400 },
  feedback:{ at:m => m.feedback + 2500 },
};
export const MOCK_SHOTS = Object.freeze(Object.keys(SHOTS));
export const mockShotAt = (shot, marks) => SHOTS[shot]?.at?.(marks) ?? null;

export function connectFloat({ room = "mock", role = "screen", hello = {}, options = {} } = {}) {
  void role;
  const params = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
  const opt = key => options[key] ?? params.get(key);
  const phones = Math.max(0, Math.min(16, Number(opt("n") ?? 13) || 0));
  const seed = Number(opt("seed")) || 3;
  const shot = opt("shot");
  const freeze = String(opt("freeze") || "") === "1";
  const auto = String(opt("auto") || "") === "1";
  const drinkingParam = String(opt("drinking") ?? "1") !== "0";
  const code = /^[a-z0-9-]{1,32}$/.test(room) ? room : "mock";
  const plan = shot && SHOTS[shot] ? SHOTS[shot] : null;

  const listeners = new Map();
  const statusFns = new Set();
  let status = "connecting";
  let closed = false;
  const clock = { t:Date.UTC(2026, 9, 31, 3, 0, 0) + seed * 1000 };
  const emit = msg => {
    const fns = listeners.get(msg.t);
    if (fns) [...fns].forEach(fn => { try { fn(msg); } catch (error) { console.error(error); } });
  };
  const setStatus = next => { status = next; statusFns.forEach(fn => fn(next)); };

  /* the lobby: phones join, some get ready; a Field Day room is reserved */
  const lobby = {
    mode:plan?.fieldday ? "fieldday" : "party",
    drinking:drinkingParam,
    startPlanned:plan?.fieldday ? clock.t + 47000 : null,
    riders:[],
  };
  const skills = mockSkills(16, seed);
  const addPhone = k => {
    const base = mockRider(k);
    /* the groom plays well enough to wear his crown on the podium */
    const rider = { ...base, device:`mock-phone-${k}`, bot:false, skill:base.groom ? 0.97 : skills[k], connected:true, ready:false };
    if (lobby.mode === "fieldday") { rider.pid = `p${k + 1}`; rider.connected = k % 4 !== 2; }
    lobby.riders.push(rider);
  };
  const lobbyRoom = () => ({ t:"room", s:clock.t, phase:"lobby", mode:lobby.mode, code, drinking:lobby.drinking, round:0, rounds:0,
    field:[], out:[], startAt:null, endsAt:null, startPlanned:lobby.startPlanned, cupId:null,
    entrants:lobby.riders.map(rider => entrantOf(rider)), standings:[], podium:null, cut:null, lastRound:false });

  /* the Cup, once started */
  let cup = null;
  let cursor = 0;
  const start = ({ bots = 0, drinking = lobby.drinking } = {}) => {
    if (cup) return;
    const taken = new Set(lobby.riders.map(r => r.name));
    const names = BOT_NAMES.filter(name => !taken.has(name));
    const botSkills = mockSkills(Math.max(1, bots), seed + 11);
    for (let k = 0; k < bots && lobby.riders.length < 16; k += 1) {
      const name = names[k % names.length] || `Bot ${k + 1}`;
      const critter = CRITTERS.find(c => c.name === name)?.id || CRITTER_IDS[k % CRITTER_IDS.length];
      const used = new Set(lobby.riders.map(r => r.color));
      lobby.riders.push({ name, color:PALETTE.find(c => !used.has(c)) || PALETTE[k % PALETTE.length], bot:true, skill:botSkills[k],
        look:cleanLook({ ...defaultLook(name, FLOATIE_IDS), critter }, { floatieIds:FLOATIE_IDS, seed:name }), device:null, drinks:true });
    }
    lobby.drinking = drinking !== false;
    cup = scriptCup({ riders:lobby.riders, startAt:clock.t + 200, seed, drinking:lobby.drinking, mode:lobby.mode, code });
    cursor = 0;
  };
  const toLobby = () => { cup = null; cursor = 0; lobby.riders.forEach(r => { r.ready = false; }); emit(lobbyRoom()); };

  /* everything due by the clock, in order */
  const pump = () => {
    if (!cup) return;
    while (cursor < cup.msgs.length && cup.msgs[cursor].s <= clock.t) {
      const { msg } = cup.msgs[cursor++];
      emit(msg);
      if (msg.t === "room" && msg.phase === "lobby") { cup = null; cursor = 0; lobby.riders = lobby.riders.filter(r => !r.bot); emit(lobbyRoom()); return; }
    }
  };

  /* a shot: the Cup started, the clock at the moment, this phase replayed */
  const jump = () => {
    for (let k = 0; k < phones; k += 1) addPhone(k);
    lobby.riders.forEach((r, k) => { r.ready = k % 5 !== 3; });
    if (!plan || plan.lobby) return;
    start({ bots:phones ? 0 : 12 });
    const at = mockShotAt(shot, cup.marks);
    if (!Number.isFinite(at)) return;
    clock.t = at;
    /* from the first message of the phase it lands in: that phase replays */
    let phaseFrom = 0, key = null;
    for (let k = 0; k < cup.msgs.length && cup.msgs[k].s <= at; k += 1) {
      const m = cup.msgs[k].msg;
      if (m.t !== "room") continue;
      const next = `${m.phase}:${m.round}`;
      if (next !== key) { phaseFrom = k; key = next; }
    }
    cursor = phaseFrom;
  };

  let timer = null, openTimer = null, phoneTimer = null, debugTimer = null;
  let realBase = 0, mockBase = 0, openedAt = 0;
  const open = () => {
    if (closed) return;
    setStatus("open");
    emit({ t:"welcome", s:clock.t, you:{ device:hello.device || "mock-screen", role:"screen" } });
    if (cup) pump();
    else emit(lobbyRoom());
    realBase = performance.now(); mockBase = clock.t; openedAt = clock.t;
    /* live: the phones not yet in join one by one */
    if (!plan && !freeze) {
      let k = lobby.riders.length;
      phoneTimer = setInterval(() => {
        if (closed || cup || k >= phones) { clearInterval(phoneTimer); return; }
        addPhone(k);
        if (k % 5 !== 3) setTimeout(() => { const r = lobby.riders[k]; if (r && !cup) { r.ready = true; emit(lobbyRoom()); } }, 900 + (k % 3) * 500);
        k += 1;
        emit(lobbyRoom());
      }, MOCK_TIMES.JOIN);
    }
    debugTimer = setInterval(() => {
      if (closed) return;
      const rtt = {};
      lobby.riders.forEach((r, k) => { if (!r.bot && r.device) rtt[r.device] = Math.round(60 + 80 * hash01(seed, k, Math.floor(clock.t / 2000))); });
      emit({ t:"debug", s:clock.t, rtt });
    }, 2000);
    if (!freeze) timer = setInterval(() => {
      if (closed) return;
      const target = mockBase + (performance.now() - realBase);
      /* a tab that slept: carry on from here, never replay the gap at speed */
      if (target - clock.t > 2000) { mockBase = clock.t; realBase = performance.now(); return; }
      clock.t = target;
      pump();
      if (auto && !cup && lobby.riders.length >= phones && clock.t > openedAt + 3500) { start({ bots:phones ? 0 : 12 }); }
    }, 16);
  };
  jump();
  openTimer = setTimeout(open, 0);

  return {
    send(msg) {
      if (closed || !msg || typeof msg !== "object") return false;
      if (msg.t === "ping") { emit({ t:"pong", s:clock.t, c:msg.c }); return true; }
      if (msg.t === "host") {
        if (lobby.mode === "fieldday") return true;
        if (msg.cmd === "start" && !cup) { start({ bots:Math.max(0, Math.min(16, Number(msg.bots) || 0)), drinking:msg.drinking !== false }); pump(); }
        else if (msg.cmd === "lobby") toLobby();
        else if (msg.cmd === "kick" && !cup) { lobby.riders = lobby.riders.filter(r => r.device !== msg.device); emit(lobbyRoom()); }
      }
      return true;
    },
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
      return () => listeners.get(type)?.delete(fn);
    },
    close() {
      closed = true;
      clearTimeout(openTimer); clearInterval(timer); clearInterval(phoneTimer); clearInterval(debugTimer);
      setStatus("closed");
      listeners.clear(); statusFns.clear();
    },
    serverNow:() => clock.t,
    rtt:() => 0,
    status:() => status,
    onStatus(fn) { statusFns.add(fn); return () => statusFns.delete(fn); },
    mock:true,
  };
}

export default connectFloat;
