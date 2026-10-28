/* The scripted stand-in room (`?mock=1&script=1`): a whole Cup computed
   ahead from the shared charts (float/shared/chart.js), speaking
   float/GROOVE.md's messages (v2: the narrated practice with the host's
   demos, the breakdown, the cut's show, the chug-off, the countdown Last
   Call), with no engine behind it. The connection emits what is due as its
   clock runs; a shot moves the clock to the moment and replays that phase's
   messages. Riders tap every played cue with a raw offset drawn from their
   skill (a sharp one within about 30 ms, a weak one about 90 ms and an
   occasional miss); nobody taps a demo; the room judges them with its
   calibration (the median of the people's practice taps), misses land
   MISS_AFTER_MS late, and the crowd cheers. */
import {
  CALIBRATION, CHUGOFF, LAST_CALL, MISS_AFTER_MS, SONG_LEAD_MS, SONG_MS, SONG_TAIL_MS,
  awardsOf, calibrate, chartOf, cueTime, gradeOf, judgeHit, lastCallId, lastCallWorst, qualityOf, scoreOf, songForRound,
} from "../../../shared/chart.js";
import { CRITTERS, CRITTER_IDS, cleanLook, defaultLook } from "../../../shared/looks.js";
import { FLOATIE_IDS } from "../../../shared/floaties.js";
import { PALETTE } from "../../../shared/protocol.js";
import { cutSchedule } from "../model/cupShape.js";
import { SHOTS, gauss, hash01, mockRider, mockSkills, shotTime } from "./shared.js";

/* the phases' lengths (ms), as the engine has them (float/shared/cup.js
   CUP_TIMING): the cut's show 15 s (the final's, with nobody out, 9 s) */
export const SCRIPT_TIMES = Object.freeze({ INTRO:8000, CUT:15000, CUT_BEFORE_LAST_CALL:12000, LAST_CUT:7000, LAST_CALL_LEAD:3000, PODIUM:15000, FEEDBACK:45000, JOIN:280 });
/* the cut's show beats (ms from its start; cup.js CUT_SHOW) */
export const SCRIPT_SHOW = Object.freeze({ GRADES_MS:400, AWARDS_MS:2400, AWARD_GAP_MS:1200, OUTS_AFTER_LINE_MS:800, OUT_GAP_MS:1400, END_MS:1200 });

const BOT_NAMES = CRITTERS.map(c => c.name);

/* the room's entrant record (float/PROTOCOL.md `room.entrants`) */
const entrantOf = (rider, extra = {}) => ({
  device:rider.device ?? null, name:rider.name, color:rider.color, look:rider.look, bot:!!rider.bot,
  connected:rider.connected !== false, ready:!!rider.ready,
  ...(rider.pid ? { pid:rider.pid } : {}), ...(rider.photo ? { photo:rider.photo } : {}), ...(rider.number !== undefined ? { number:rider.number } : {}),
  ...(rider.groom ? { groom:true } : {}), ...extra,
});

/* the song's ranking: by percent, ties by the Cup before it, then Perfects, then field order (the engine's compareRows) */
const rankRows = rows => rows.slice().sort((a, b) => b.pct - a.pct || b.cup - a.cup || b.perfects - a.perfects || a.k - b.k)
  .map(({ k, ...row }, n) => ({ ...row, place:n + 1 }));

/* The cut's beats (cup.js cutShowOf): the grades, the awards a card apart,
   the cut line, the riders out from the bottom (`outs`, already in that
   order), spread over what the cut has left */
export function showOf(startAt, endsAt, awards = 0, outs = [], bubble = null) {
  const S = SCRIPT_SHOW;
  const awardAt = Array.from({ length:awards }, (_, k) => startAt + S.AWARDS_MS + k * S.AWARD_GAP_MS);
  if (!outs.length) return { grades:startAt + S.GRADES_MS, awards:awardAt, line:bubble ? startAt + S.AWARDS_MS + awards * S.AWARD_GAP_MS : null, outs:[], bubble };
  const line = startAt + S.AWARDS_MS + awards * S.AWARD_GAP_MS;
  const from = line + S.OUTS_AFTER_LINE_MS;
  const gap = Math.max(0, Math.min(S.OUT_GAP_MS, (endsAt - S.END_MS - from) / outs.length));
  return { grades:startAt + S.GRADES_MS, awards:awardAt, line, outs:outs.map((i, k) => ({ i, at:Math.round(from + k * gap) })), bubble };
}

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
  const marks = { start:startAt, intro:startAt, songs:[], cuts:[], chugoffs:[], lastcalls:[], podium:null, feedback:null, lobby:null };
  const entrants = riders.map(rider => entrantOf(rider, { ready:false }));
  const cupTotals = new Array(n).fill(0);
  const eliminated = [];
  let field = riders.map((_, i) => i);
  let offset = 0;
  let history = [];
  const base = { t:"room", mode, code, drinking, rounds, cupId, entrants };
  const room = (s, fields) => out.push({ s, msg:{ ...base, ...fields, s } });
  const ev = (s, fields) => out.push({ s, msg:{ t:"ev", ...fields, s } });
  const cheersIn = (from, to, round) => eliminated.forEach(i => {
    for (let s = from + 1500 + hash01(seed, round, i, 11) * 4000; s < to - 1000; s += 2600 + hash01(seed, round, i, Math.floor(s)) * 5200) ev(Math.round(s), { e:"cheer", i });
  });

  /* intro */
  let t = startAt;
  room(t, { phase:"intro", round:0, field:[...field], out:[], startAt:t, endsAt:t + SCRIPT_TIMES.INTRO, song:songForRound(0, rounds),
    cut:rounds > 1 ? schedule[1] : null, lastRound:rounds <= 1, standings:[], podium:null });
  t += SCRIPT_TIMES.INTRO;
  let chugoffs = 0, lastCalls = 0;

  for (let round = 0; round < rounds; round += 1) {
    const songId = songForRound(round, rounds);
    const chart = chartOf(songId);
    const songAt = t + SONG_LEAD_MS;
    const endsAt = songAt + SONG_MS + SONG_TAIL_MS;
    const last = round === rounds - 1;
    const next = last ? null : schedule[round + 1];
    const playFrom = cueTime(songAt, chart.sections.find(s => s.kind === "play").from, chart.beatMs);
    marks.songs.push({ round, song:songId, startAt:t, songAt, endsAt });

    /* every rider's every played cue (never a demo), judged as the room would */
    const hits = new Map(field.map(i => [i, {}]));
    const samples = [];
    const offsets = [];
    const events = [];
    let practiceOffset = offset;
    for (const cue of chart.cues) {
      if (cue.demo) continue;
      const at = cueTime(songAt, cue.beat, chart.beatMs);
      /* the room's offset: recomputed through practice (at most once a beat), fixed from the first play bar */
      if (at < playFrom) {
        const value = calibrate(samples.filter(x => x.s <= at).map(x => x.r));
        if (value !== null && value !== practiceOffset) {
          practiceOffset = value;
          offsets.push({ s:songAt + Math.ceil((at - songAt) / chart.beatMs) * chart.beatMs, offset:value });
        }
      }
      const roomOffset = at < playFrom ? practiceOffset : offset;
      for (const i of field) {
        const rider = riders[i];
        const skill = rider.skill ?? 0.6;
        const missed = hash01(seed, round, i, cue.id, 1) < 0.012 + (1 - skill) * 0.085;
        const bias = 38 + gauss(seed, i, 9) * 14;
        const r = Math.round(bias + gauss(seed, round, i, cue.id) * (20 + (1 - skill) * 105));
        const call = missed ? null : judgeHit(chart, cue.id, r, roomOffset);
        if (!call) {
          hits.get(i)[cue.id] = { q:"miss", d:null };
          events.push({ s:at + roomOffset + MISS_AFTER_MS, i, c:cue.id, q:"miss" });
        } else {
          hits.get(i)[cue.id] = { q:call.q, d:call.d };
          const lag = 70 + Math.round(hash01(seed, round, i, cue.id, 3) * 90);
          events.push({ s:at + r + lag, i, c:cue.id, q:call.q, d:call.d });
          if (!cue.scored && !rider.bot && Math.abs(r) <= CALIBRATION.RANGE) samples.push({ s:at + r + lag, r });
        }
      }
    }
    if (calibrate(samples.map(x => x.r)) !== null) offset = practiceOffset;
    events.sort((a, b) => a.s - b.s);

    /* the scores and the live ranking the room sends: this song so far */
    const scoresAt = s => field.map(i => {
      const sofar = {};
      for (const e of events) if (e.i === i && e.s <= s) sofar[e.c] = e.q;
      const score = scoreOf(chart, sofar, { upTo:(s - songAt) / chart.beatMs });
      return { i, pts:score.pts, pct:score.pct, live:score.live, n:score.n, cup:Math.round(cupTotals[i] * 10) / 10, done:false };
    });
    const countBy = (i, s, q) => events.filter(e => e.i === i && e.s <= s && e.q === q && chart.cues[e.c].scored).length;
    const resultsAt = s => rankRows(scoresAt(s).map(row => ({ i:row.i, k:field.indexOf(row.i), pts:row.pts, pct:row.pct,
      perfects:countBy(row.i, s, "perfect"), misses:countBy(row.i, s, "miss"), cup:row.cup })));
    const songRoom = (s, extra = {}) => room(s, { phase:"song", round, field:[...field], out:[...eliminated], startAt:t, endsAt,
      song:songId, chartId:songId, songAt, offset:s < playFrom ? (offsets.filter(o => o.s <= s).pop()?.offset ?? offset) : offset,
      scores:scoresAt(s), results:resultsAt(s), cut:next, lastRound:last, standings:[], podium:null, history, ...extra });

    songRoom(t, { chart });
    for (let s = t + 4000; s < endsAt; s += 4000) songRoom(s);
    for (const o of offsets) songRoom(o.s);
    for (const e of events) ev(e.s, { e:"hit", i:e.i, c:e.c, q:e.q, ...(e.q === "miss" ? {} : { d:e.d }) });
    /* the crowd on the bank cheers now and then, and all together on the last cue */
    const lastCue = cueTime(songAt, chart.cues[chart.cues.length - 1].beat, chart.beatMs);
    cheersIn(songAt, endsAt, round);
    eliminated.forEach((i, k) => ev(lastCue + 120 + k * 60, { e:"cheer", i }));

    /* the cut: this song's percents, grades and awards; the bottom out */
    const ranked = resultsAt(Infinity);
    const finalScores = scoresAt(Infinity);
    for (const row of ranked) cupTotals[row.i] += row.pct;
    const goesAll = last ? ranked.map(row => row.i) : ranked.slice(0, next).map(row => row.i);
    const goneAll = last ? [] : ranked.slice(next).map(row => row.i);
    /* with drinking, the last one through and the first one out race for the spot (the engine's bubble) */
    const chugoffNext = drinking && !last && goneAll.length > 0 && goesAll.length > 0;
    const pair = chugoffNext ? [goesAll[goesAll.length - 1], goneAll[0]] : null;
    const goes = goesAll.filter(i => !pair?.includes(i));
    const gone = goneAll.filter(i => !pair?.includes(i));
    const results = ranked.map(row => ({ ...row, grade:gradeOf(row.pct), out:gone.includes(row.i), ...(pair?.includes(row.i) ? { bubble:true } : {}) }));
    const awards = awardsOf(chart, field.map(i => ({ i, hits:hits.get(i) }))).slice(0, 3);
    history = [...history, { round, song:songId, field:[...field], out:[...gone], results }];
    t = endsAt;
    const cutMs = last ? SCRIPT_TIMES.LAST_CUT : drinking ? SCRIPT_TIMES.CUT_BEFORE_LAST_CALL : SCRIPT_TIMES.CUT;
    const show = showOf(t, t + cutMs, awards.length, gone.slice().reverse(), pair);
    marks.cuts.push({ round, startAt:t, endsAt:t + cutMs, show });
    eliminated.push(...gone.slice().reverse());
    room(t, { phase:"cut", round, field:goes, out:[...eliminated], startAt:t, endsAt:t + cutMs, song:songId, chartId:songId,
      songAt, offset, scores:finalScores, results, awards, show, cut:next, lastRound:last, standings:[], podium:null, history });
    show.outs.forEach(({ i, at }) => ev(at, { e:"out", i }));
    field = goes;
    t += cutMs;

    /* the chug-off: the last one through against the first one out */
    if (pair) {
      const [a, b] = pair;
      const goAt = t + CHUGOFF.INTRO_MS;
      const doneMs = i => Math.round(4000 + hash01(seed, round, i, 404) * 8000);
      const doneAt = { [a]:doneMs(a), [b]:doneMs(b) };
      const winner = doneAt[a] <= doneAt[b] ? a : b;
      const loser = winner === a ? b : a;
      const winAt = goAt + doneAt[winner];
      const chugEnds = winAt + CHUGOFF.REVEAL_MS + CHUGOFF.EXIT_MS;
      marks.chugoffs.push({ round, startAt:t, goAt, winAt, endsAt:chugEnds, a, b, winner, first:chugoffs === 0 });
      const chugStart = t;
      const chugRoom = (s, chugoff, extra = {}) => room(s, { phase:"chugoff", round, field:[...field], out:[...eliminated], startAt:chugStart,
        endsAt:extra.endsAt ?? goAt + CHUGOFF.WINDOW_MS + CHUGOFF.REVEAL_MS + CHUGOFF.EXIT_MS, song:songId, cut:next, lastRound:false,
        standings:[], podium:null, history, chugoff });
      chugRoom(t, { round, a, b, goAt, doneAt:{}, winner:null, loser:null, by:null, decidedAt:null });
      ev(winAt, { e:"done", i:winner });
      field = [...field, winner];
      eliminated.push(loser);
      const decided = { round, a, b, goAt, doneAt:{ [winner]:doneAt[winner] }, winner, loser, by:"chug", decidedAt:winAt };
      chugRoom(winAt, decided, { endsAt:chugEnds });
      ev(winAt, { e:"out", i:loser });
      if (goAt + doneAt[loser] < chugEnds) {
        ev(goAt + doneAt[loser], { e:"done", i:loser });
        chugRoom(goAt + doneAt[loser], { ...decided, doneAt }, { endsAt:chugEnds });
      }
      chugoffs += 1;
      t = chugEnds;
    }

    /* Last Call: everyone at the bar, one tap on zero */
    if (drinking && !last) {
      const id = lastCallId(round);
      const lc = chartOf(id);
      const cd = lc.countdown;
      const barAt = t + SCRIPT_TIMES.LAST_CALL_LEAD;
      const lcEnds = barAt + lc.ms + SONG_TAIL_MS;
      const players = [...field, ...eliminated.slice().reverse()];
      marks.lastcalls.push({ round, startAt:t, songAt:barAt, endsAt:lcEnds, id, first:lastCalls === 0 });
      const taps = players.map(i => {
        const skill = riders[i].skill ?? 0.6;
        const none = hash01(seed, round, i, 77) < 0.04;
        const d = none ? null : Math.round(gauss(seed, round, i, 78) * (150 + (1 - skill) * 700) + (hash01(seed, round, i, 79) < 0.1 ? 1000 : 0));
        return { i, d };
      });
      const totals = taps.map(({ i, d }) => ({ i, ms:d === null ? LAST_CALL.MISS_MS : Math.abs(d), d }));
      const worst = lastCallWorst(totals);
      const deadline = barAt + cd.zeroAt + LAST_CALL.WINDOW + 250;
      const lcRoom = (s, lastCall, extra = {}) => room(s, { phase:"lastcall", round, field:[...field], out:[...eliminated], startAt:t, endsAt:lcEnds,
        song:id, chartId:id, songAt:barAt, offset, lastCall, cut:next, lastRound:false, standings:[], podium:null, history, ...extra });
      lcRoom(t, { totals:players.map(i => ({ i, ms:0, d:null })), worst:null }, { chart:lc });
      taps.forEach(({ i, d }) => {
        if (d === null) ev(deadline, { e:"hit", i, c:0, q:"miss" });
        else ev(barAt + cd.zeroAt + d + 90, { e:"hit", i, c:0, q:qualityOf(d), d });
      });
      lcRoom(deadline, { totals, worst });
      lastCalls += 1;
      t = lcEnds;
    }
  }

  /* the podium: the final's order, then everyone else from the last cut out */
  const finalOrder = history[history.length - 1].results.map(row => row.i);
  const standings = [...finalOrder, ...eliminated.slice().reverse()];
  marks.podium = t;
  room(t, { phase:"podium", round:rounds - 1, field:[...field], out:[...eliminated], startAt:t, endsAt:t + SCRIPT_TIMES.PODIUM,
    podium:finalOrder.slice(0, 3), standings, final:standings, cut:null, lastRound:true, history });
  t += SCRIPT_TIMES.PODIUM;
  marks.feedback = t;
  room(t, { phase:"feedback", round:rounds - 1, field:[...field], out:[...eliminated], startAt:t, endsAt:t + SCRIPT_TIMES.FEEDBACK,
    podium:finalOrder.slice(0, 3), standings, final:standings, cut:null, lastRound:true, history });
  t += SCRIPT_TIMES.FEEDBACK;
  marks.lobby = t;
  room(t, { phase:"lobby", round:0, field:[], out:[], startAt:null, endsAt:null, standings:[], podium:null, cut:null, lastRound:false });

  out.sort((a, b) => a.s - b.s);
  return { msgs:out, marks, rounds };
}

/* the marks as the shots read them: "phase:round" -> { startAt, songAt, ... } */
export function seenOf(marks) {
  const seen = { intro:{ startAt:marks.intro } };
  for (const song of marks.songs) seen[`song:${song.round}`] = { startAt:song.startAt, songAt:song.songAt };
  for (const cut of marks.cuts) seen[`cut:${cut.round}`] = { startAt:cut.startAt, show:cut.show };
  for (const c of marks.chugoffs) seen[`chugoff:${c.round}`] = { startAt:c.startAt, goAt:c.goAt, winAt:c.winAt };
  for (const l of marks.lastcalls) seen[`lastcall:${l.round}`] = { startAt:l.startAt, songAt:l.songAt, id:l.id };
  if (marks.podium !== null) seen.podium = { startAt:marks.podium };
  if (marks.feedback !== null) seen.feedback = { startAt:marks.feedback };
  return seen;
}

export function connectScripted({ room = "mock", role = "screen", hello = {}, options = {} } = {}) {
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
    const at = shotTime(shot, seenOf(cup.marks), cup.rounds);
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
      }, SCRIPT_TIMES.JOIN);
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

export default connectScripted;
