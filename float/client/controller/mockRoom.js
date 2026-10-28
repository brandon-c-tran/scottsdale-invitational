/* A pretend room for the phone (float/GROOVE.md "What the room sends"): the
   interface of connectFloat, answering one controller with welcome, room,
   me and ev frames through a whole Cup of songs, about 60 ms each way.

   /float/play?mock=1                      a whole Cup against twelve bots: you
                                           play every song, the cut is real
   /float/play?mock=1&at=<scene>           one moment, set up and running on
   /float/play?mock=1&at=<scene>&freeze=1  the same moment held still (the room's
                                           clock stops; taps still land on it)

   It speaks the contract from chart.js: the song phase (startAt, songAt =
   startAt + SONG_LEAD_MS, endsAt), the chart in full with the welcome and
   when the song changes (chartId otherwise), the room's one offset (the
   median of YOUR practice taps, recomputed once a beat in practice, fixed
   from the first play bar, the last song's when there are fewer than four),
   `me` after each of your hits and at phase changes, `ev hit` for your hits
   (judgeHit) and your misses (MISS_AFTER_MS after a cue you never tapped),
   your cues missed while Done is owed after the drink break, `ev done`,
   `scores` every 4 s, the cut (13, 9, 6, 3 by percent, a tie to the Cup
   total), the podium, the card, `cheer` echoed. The bots play by a drawn
   percent: the phone only reads their place. When the engine's FloatRoom
   speaks the Groove, the tab runs it instead (as the screen's mockNet.js).
   `window.__floatMock` (with expose) carries what the controller sent and
   go(scene) for the headless check. */
import { CALIBRATION, MISS_AFTER_MS, SONG_LEAD_MS, SONG_MS, SONG_TAIL_MS, calibrate, chartOf, cueTime, drinkSection, judgeHit,
  scoreOf, songForRound } from "../../shared/chart.js";
import { CRITTER_IDS, POSE_IDS } from "../../shared/looks.js";
import { FLOATIE_IDS } from "../../shared/floaties.js";

export const MOCK_SCENES = Object.freeze(["lobby", "lobby-ready", "lobby-fieldday", "intro", "card", "count", "practice", "hey",
  "play", "play-late", "play-miss", "drink", "drink-done", "drink-dry", "drink-late", "outro", "after", "rock", "spin", "drop",
  "cut", "cut-out", "cut-final", "crowd", "podium", "podium-win", "podium-out", "feedback", "watch"]);

/* the Cup's clock around the songs */
export const MOCK_TIMING = Object.freeze({ INTRO_MS:6000, CUT_MS:12000, CUT_LAST_MS:7000, PODIUM_MS:12000, FEEDBACK_MS:45000,
  SCORES_MS:4000, TICK_MS:40 });
/* a frozen scene's clock: the same instant every time */
export const MOCK_EPOCH = Date.UTC(2026, 9, 31, 4, 0, 0);

const T = MOCK_TIMING;
const BOT_NAMES = ["Mara", "Theo", "Jun", "Rosa", "Dev", "Ines", "Kofi", "Lena", "Omar", "Pia", "Sol", "Wes"];
const BOT_COLORS = ["#ff9f1c", "#ffd23f", "#29bf12", "#00b3b3", "#2e86ab", "#9b5de5", "#ff7aa2", "#d81159", "#c0d461", "#7353ba",
  "#3d5a80", "#8fd694"];
const ME = 0;

/* the field for every round (cup.js cutSchedule): 13 -> 13, 9, 6, 3 */
export function mockFields(n, rounds = 4) {
  const riders = Math.max(0, n | 0);
  if (riders <= 3) return new Array(rounds).fill(riders);
  const cuts = rounds - 1, total = riders - 3;
  const schedule = [riders];
  for (let k = 0; k < cuts; k += 1) schedule.push(schedule[k] - (Math.floor(total / cuts) + (k < total % cuts ? 1 : 0)));
  return schedule;
}

function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0; return (s >>> 8) / 16777216; };
}
const r1 = v => Math.round(v * 10) / 10;

export function createMockRoom({ hello = null, scene = null, freeze = false, timers = globalThis, now:clockNow = () => Date.now(),
  lag = 60, expose = false, bots = 12 } = {}) {
  const later = (fn, ms) => timers.setTimeout(fn, ms);
  const listeners = new Map(), statusFns = new Set(), sent = [];
  const device = "mock-phone";
  const rand = seeded(20261030);
  let frozenAt = freeze ? MOCK_EPOCH : null;
  const now = () => frozenAt ?? clockNow();
  let status = "connecting", closed = false, phaseTimer = null, songTimer = null, held = false;
  let cup = null, song = null, feedback = null, cups = 0, chartSentFor = null, lastOffset = 0;

  const setStatus = next => {
    if (next === status) return;
    status = next;
    for (const fn of [...statusFns]) { try { fn(next); } catch {} }
  };
  const emit = msg => { for (const key of [msg.t, "*"]) for (const fn of [...(listeners.get(key) || [])]) { try { fn(msg); } catch {} } };
  /* to the phone, stamped now, landing `lag` later */
  const deliver = msg => {
    if (closed) return;
    const frame = { ...msg, s:msg.s ?? now() };
    later(() => { if (!closed && status === "open") emit(frame); }, lag);
  };
  const rider = () => {
    let extra = null;
    try { extra = typeof hello === "function" ? hello() : hello; } catch {}
    return extra?.rider || {};
  };

  function freshCup({ mode = "party" } = {}) {
    const me = rider();
    cups += 1;
    const entrants = [{ device, name:me.name || "You", color:me.color || "#e4572e", look:me.look || { critter:"capybara",
      floatie:"donut", hat:"none", shades:"none", pose:"flex" }, bot:false, connected:true, ready:false, drinks:me.drinks !== false,
      ...(me.pid ? { pid:me.pid } : {}), ...(me.photo ? { photo:me.photo } : {}), ...(me.number != null ? { number:me.number } : {}),
      ...(me.groom ? { groom:true } : {}) }];
    for (let k = 0; k < bots; k++) {
      entrants.push({ device:`bot-${k}`, name:BOT_NAMES[k % BOT_NAMES.length], color:BOT_COLORS[k % BOT_COLORS.length],
        look:{ critter:CRITTER_IDS[(k * 5 + 3) % CRITTER_IDS.length], floatie:FLOATIE_IDS[(k * 3 + 1) % FLOATIE_IDS.length],
          hat:"none", shades:"none", pose:POSE_IDS[k % POSE_IDS.length] }, bot:true, connected:true, ready:k % 3 !== 0, drinks:true,
        skill:0.15 + 0.8 * ((k * 7) % 12) / 11 });
    }
    return { id:`c-mock${cups}`, phase:"lobby", mode, code:"brkt", drinking:true, round:0, rounds:4, schedule:mockFields(entrants.length),
      field:[], out:[], startAt:null, endsAt:null, entrants, standings:[], podium:null, final:null, done:false, cupPts:{}, history:[] };
  }

  const isLast = () => cup.round >= cup.rounds - 1;
  const cutOf = () => isLast() ? null : cup.schedule[cup.round + 1];

  /* ── the song ── */
  /* a bot's percent this song: its skill, and a little luck */
  const botPct = (i, round) => {
    const skill = cup.entrants[i]?.skill ?? 0.5;
    const luck = seeded(i * 7919 + round * 104729 + cups)();
    return r1(Math.max(5, Math.min(99, 48 + 46 * skill + (luck - 0.5) * 14)));
  };
  const myScore = (upTo = Infinity) => scoreOf(song.chart, Object.fromEntries([...song.mine].map(([c, v]) => [c, v.q])), { upTo });
  const beatNow = () => song ? (now() - song.songAt) / song.chart.beatMs : -Infinity;
  /* the field's scores: this song so far (live: the share of what has been played) */
  function scoresOf() {
    if (!song) return [];
    if (song.cutScores) return song.cutScores.map(item => ({ ...item }));
    const progress = Math.max(0, Math.min(1, beatNow() / song.chart.beats));
    return song.field.map(i => {
      if (i === ME) {
        const s = myScore(beatNow());
        return { i, pts:s.pts, pct:s.pct, live:s.live, n:s.n, cup:r1(cup.cupPts[i] || 0), done:song.done.has(i) };
      }
      const pct = song.botPct.get(i);
      return { i, pts:Math.round(pct * song.max / 100 * progress), pct:r1(pct * progress), live:pct, n:0, cup:r1(cup.cupPts[i] || 0),
        done:song.done.has(i) };
    });
  }
  const liveOrder = () => scoresOf().sort((a, b) => b.live - a.live || b.cup - a.cup || a.i - b.i);
  function meFrame(extra = {}) {
    if (!song || !song.field.includes(ME)) return;
    const s = myScore(beatNow());
    const order = liveOrder();
    const last = song.lastMine;
    deliver({ t:"me", i:ME, pts:s.pts, pct:s.pct, place:order.findIndex(r => r.i === ME) + 1, of:order.length, cut:cutOf(),
      done:song.done.has(ME), ...(last ? { c:last.c, q:last.q, ...(last.d !== null ? { d:last.d } : {}) } : {}), ...extra });
  }

  function roomFrame() {
    const frame = { t:"room", phase:cup.phase, mode:cup.mode, code:cup.code, cupId:cup.id, drinking:cup.drinking, round:cup.round,
      rounds:cup.rounds, field:[...cup.field], out:[...cup.out], startAt:cup.startAt, endsAt:cup.endsAt, cut:cutOf(), lastRound:isLast(),
      entrants:cup.entrants.map(({ skill, ...e }) => ({ ...e, botDriven:!!e.bot })), standings:cup.standings,
      podium:cup.podium ? [...cup.podium] : null, final:cup.final ? [...cup.final] : null,
      history:cup.history.map(item => ({ ...item })) };
    if (song) {
      Object.assign(frame, { song:song.chart.id, songAt:song.songAt, offset:song.offset, scores:scoresOf() });
      if (chartSentFor !== song.chart.id) { frame.chart = song.chart; chartSentFor = song.chart.id; } else frame.chartId = song.chart.id;
    }
    return frame;
  }
  const sendRoom = () => deliver(roomFrame());
  const event = (e, i, extra = {}) => deliver({ t:"ev", e, i, ...extra });

  /* the round's song, its beat 0 at songAt (nothing sent) */
  function newSong(songAt) {
    const chart = chartOf(songForRound(cup.round, cup.rounds));
    cup.phase = "song";
    cup.startAt = songAt - SONG_LEAD_MS;
    cup.endsAt = songAt + SONG_MS + SONG_TAIL_MS;
    song = { chart, songAt, offset:lastOffset, fixed:false, samples:[], field:[...cup.field], mine:new Map(), lastMine:null,
      done:new Set(), botPct:new Map(cup.field.filter(i => i !== ME).map(i => [i, botPct(i, cup.round)])),
      max:chart.cues.filter(cue => cue.scored).length * 100, beatSent:-Infinity, scoresAt:now(), doneBots:new Map() };
    for (const i of song.field) if (i !== ME) song.doneBots.set(i, 4000 + rand() * 10000);
    if (cup.drinking === false || cup.entrants[ME]?.drinks === false) song.done.add(ME);
    clearSong();
    songTimer = timers.setInterval(stepSong, T.TICK_MS);
  }
  function startSong() {
    newSong(now() + SONG_LEAD_MS);
    sendRoom();
    meFrame();
  }
  const clearSong = () => { if (songTimer) timers.clearInterval(songTimer); songTimer = null; };
  const owesDone = i => cup.drinking !== false && cup.entrants[i]?.drinks !== false && !song.done.has(i);

  function stepSong() {
    if (!song || cup.phase !== "song") return;
    const t = now(), beat = beatNow();
    const drink = drinkSection(song.chart);
    /* calibration: once a beat in practice, fixed from the first play bar */
    const practice = song.chart.sections.find(section => section.kind === "practice");
    if (!song.fixed && beat >= practice.to) song.fixed = true;
    if (!song.fixed && Math.floor(beat) > song.beatSent) {
      song.beatSent = Math.floor(beat);
      const offset = calibrate(song.samples) ?? lastOffset;
      if (offset !== song.offset) { song.offset = offset; sendRoom(); }
    }
    /* your misses: a cue you never tapped, MISS_AFTER_MS after it */
    for (const cue of song.chart.cues) {
      if (song.mine.has(cue.id)) continue;
      if (t < cueTime(song.songAt, cue.beat) + song.offset + MISS_AFTER_MS) break;
      if (!song.field.includes(ME)) break;
      song.mine.set(cue.id, { q:"miss", d:null });
      song.lastMine = { c:cue.id, q:"miss", d:null };
      event("hit", ME, { c:cue.id, q:"miss" });
      meFrame();
    }
    /* the bots tap Done 4 to 14 s into the break */
    if (drink && beat >= drink.from) {
      const into = t - cueTime(song.songAt, drink.from);
      for (const [i, at] of song.doneBots) if (into >= at && !song.done.has(i)) { song.done.add(i); event("done", i); }
    }
    if (t - song.scoresAt >= T.SCORES_MS) { song.scoresAt = t; sendRoom(); }
    if (!held && t >= cup.endsAt) endSong();
  }

  /* the song is over: its order by percent (a tie to the Cup total), the cut */
  function endSong() {
    clearSong();
    finishSong(scoresOf().map(s => ({ ...s, pct:s.i === ME ? myScore().pct : song.botPct.get(s.i) })));
  }
  function finishSong(scores) {
    const order = [...scores].sort((a, b) => b.pct - a.pct || b.cup - a.cup || a.i - b.i);
    const last = isLast();
    const through = last ? order.length : Math.min(order.length, cutOf());
    for (const s of order) cup.cupPts[s.i] = (cup.cupPts[s.i] || 0) + s.pct;
    const eliminated = order.slice(through).map(s => s.i);
    cup.out.push(...eliminated.slice().reverse());
    cup.history.push({ round:cup.round, song:song.chart.id, field:[...song.field], out:eliminated,
      results:order.map((s, k) => ({ i:s.i, place:k + 1, pct:s.pct })) });
    cup.field = order.slice(0, through).map(s => s.i);
    if (last) { cup.final = [...cup.field, ...[...cup.out].reverse()]; cup.podium = cup.field.slice(0, 3); cup.done = true; }
    cup.standings = (cup.final || [...cup.field, ...[...cup.out].reverse()]).map((i, k) => ({ i, place:k + 1 }));
    song.cutScores = order.map(s => ({ ...s, live:s.pct }));
    phase("cut", last ? T.CUT_LAST_MS : T.CUT_MS, () => {
      song = null;
      if (cup.done) { phase("podium", T.PODIUM_MS, () => phase("feedback", T.FEEDBACK_MS, toLobby)); return; }
      cup.round += 1;
      startSong();
    });
    for (const i of eliminated.slice().reverse()) event("out", i);
    const mine = order.findIndex(s => s.i === ME);
    if (mine >= 0) deliver({ t:"me", i:ME, pts:Math.round(order[mine].pct * song.max / 100), pct:order[mine].pct, place:mine + 1,
      of:order.length, cut:cutOf(), done:song.done.has(ME) });
  }

  const clearTimer = () => { if (phaseTimer) timers.clearTimeout(phaseTimer); phaseTimer = null; };
  function phase(name, ms, next) {
    clearTimer();
    cup.phase = name;
    cup.startAt = now();
    cup.endsAt = ms ? now() + ms : null;
    sendRoom();
    if (next && ms && !held) phaseTimer = later(next, ms);
  }
  function startCup() {
    cup.round = 0; cup.out = []; cup.history = []; cup.podium = null; cup.final = null; cup.done = false; cup.cupPts = {};
    cup.schedule = mockFields(cup.entrants.length);
    cup.field = cup.entrants.map((e, i) => i);
    cup.standings = [];
    phase("intro", T.INTRO_MS, startSong);
  }
  function toLobby() {
    clearTimer(); clearSong();
    song = null;
    const keep = cup.entrants;
    cup = freshCup({ mode:cup.mode });
    cup.entrants = keep.map(e => ({ ...e, ready:false }));
    sendRoom();
  }

  /* ── what the phone sends ── */
  function receive(msg) {
    sent.push(msg);
    const t = now();
    switch (msg.t) {
      case "hello":
        if (!cup) { cup = freshCup(); if (scene) go(scene, { quiet:true }); }
        deliver({ t:"welcome", you:{ device, role:"controller", ...(cup.entrants.some(e => e.device === device) ? { entrant:ME } : {}) } });
        chartSentFor = null;
        sendRoom();
        if (song) meFrame();
        return;
      case "ping": deliver({ t:"pong", c:msg.c }); return;
      case "ready":
        if (cup.phase !== "lobby" || cup.mode !== "party") return;
        cup.entrants[ME].ready = msg.on === true;
        sendRoom();
        if (msg.on && !held) {
          later(() => { cup.entrants.forEach(e => { if (e.bot) e.ready = true; }); sendRoom(); }, 700);
          clearTimer();
          phaseTimer = later(() => { if (cup.phase === "lobby" && cup.entrants[ME].ready) startCup(); }, 1800);
        }
        return;
      case "look":
        if (cup.phase !== "lobby") return;
        cup.entrants[ME].look = { ...cup.entrants[ME].look, ...(msg.look || {}) };
        sendRoom();
        return;
      case "hit": {
        if (!song || cup.phase !== "song" || !song.field.includes(ME)) return;
        const cue = Number.isInteger(msg.c) ? song.chart.cues[msg.c] : null;
        if (!cue || song.mine.has(cue.id)) return;
        /* Done owed after the break: the cue is the room's miss when it comes due */
        const drink = drinkSection(song.chart);
        if (drink && cue.beat >= drink.from && owesDone(ME)) return;
        const verdict = judgeHit(song.chart, msg.c, Number(msg.r), song.offset);
        if (!verdict) return;
        if (!cue.scored && Math.abs(Number(msg.r)) <= CALIBRATION.RANGE && !song.fixed) song.samples.push(Number(msg.r));
        song.mine.set(cue.id, { q:verdict.q, d:verdict.d });
        song.lastMine = { c:cue.id, q:verdict.q, d:verdict.d };
        event("hit", ME, { c:cue.id, q:verdict.q, d:verdict.d });
        meFrame();
        return;
      }
      case "drink": {
        if (!song || cup.phase !== "song" || song.done.has(ME)) return;
        const drink = drinkSection(song.chart);
        if (!drink || t < cueTime(song.songAt, drink.from) - 500) return;
        song.done.add(ME);
        event("done", ME);
        meFrame();
        return;
      }
      case "cheer":
        if (cup.out.includes(ME)) event("cheer", ME);
        return;
      case "feedback":
        if (!cup.done && cup.phase !== "feedback") return;
        feedback = msg.answers || null;
        if (!held && cup.phase === "feedback") later(toLobby, 1500);
        return;
      default:
    }
  }

  /* ── scenes: one moment, set up ── */
  /* a song at `beat` (or ms before beat 0 when negative ms is given), you
     having played every cue before it as `q` (except those in `missed`) */
  function songAtBeat(round, beat, { q = "nice", d = 40, missed = [], done = null, offset = 18 } = {}) {
    cup.round = round;
    lastOffset = offset;
    newSong(now() - beat * chartOf(songForRound(round, cup.rounds)).beatMs);
    song.offset = offset;
    const practice = song.chart.sections.find(section => section.kind === "practice");
    song.fixed = beat >= practice.to;
    const drink = drinkSection(song.chart);
    if (done === true || (done === null && drink && beat >= drink.to)) song.done.add(ME);
    if (done === false) song.done.delete(ME);
    const owed = !song.done.has(ME);
    for (const cue of song.chart.cues) {
      if (cue.beat >= beat - 0.6) break;
      const miss = missed.includes(cue.id) || (owed && drink && cue.beat >= drink.from);
      song.mine.set(cue.id, miss ? { q:"miss", d:null } : { q, d });
    }
  }
  /* rounds already played: round k ends with leaders[k] first, the rest of its field after */
  function played(leaders) {
    cup.field = cup.entrants.map((e, i) => i);
    leaders.forEach((first, k) => {
      cup.round = k;
      const order = [...first.filter(i => cup.field.includes(i)), ...cup.field.filter(i => !first.includes(i))];
      const through = k >= cup.rounds - 1 ? order.length : cup.schedule[k + 1];
      const out = order.slice(through);
      order.forEach((i, n) => { cup.cupPts[i] = (cup.cupPts[i] || 0) + 92 - n * 3; });
      cup.out.push(...out.slice().reverse());
      cup.history.push({ round:k, song:songForRound(k, cup.rounds), field:[...cup.field], out,
        results:order.map((i, n) => ({ i, place:n + 1, pct:92 - n * 3 })) });
      cup.field = order.slice(0, through);
      if (k >= cup.rounds - 1) { cup.final = [...cup.field, ...[...cup.out].reverse()]; cup.podium = cup.field.slice(0, 3); cup.done = true; }
    });
    cup.standings = (cup.final || [...cup.field, ...[...cup.out].reverse()]).map((i, n) => ({ i, place:n + 1 }));
  }
  /* the cut just after round `round`, its field in `order` (percents falling from 94) */
  function cutAfter(round, before, order) {
    played(before);
    cup.round = round;
    lastOffset = 18;
    newSong(now() - SONG_MS - 3000);
    clearSong();
    song.fixed = true;
    song.done = new Set(song.field);
    const field = [...order.filter(i => song.field.includes(i)), ...song.field.filter(i => !order.includes(i))];
    finishSong(field.map((i, n) => ({ i, pct:r1(94 - n * 4.5), cup:r1(cup.cupPts[i] || 0), pts:0, live:0, n:0, done:true })));
    clearTimer();
  }

  function go(name, { quiet = false } = {}) {
    if (!MOCK_SCENES.includes(name)) return false;
    held = true;
    if (frozenAt !== null) frozenAt = MOCK_EPOCH;
    clearTimer(); clearSong();
    song = null;
    chartSentFor = null;
    cup = freshCup({ mode:name === "lobby-fieldday" ? "fieldday" : "party" });
    const all = cup.entrants.map((e, i) => i);
    const out9 = [3, 2, 5, 1, 7, 8, 6, 4, 9, 10, 11, 12, ME];
    switch (name) {
      case "lobby": break;
      case "lobby-ready": cup.entrants[ME].ready = true; break;
      case "lobby-fieldday": cup.entrants[ME].pid = "mock"; break;
      case "intro": cup.field = [...all]; cup.phase = "intro"; cup.startAt = now() - 2000; cup.endsAt = cup.startAt + T.INTRO_MS; break;
      case "card": cup.field = [...all]; songAtBeat(0, -1.2 * 2); break;
      case "count": cup.field = [...all]; songAtBeat(0, 5.1); break;
      /* a practice tap now lands 70 ms late: Nice! */
      case "practice": cup.field = [...all]; songAtBeat(0, 12 + (70 + 18) / 500); break;
      /* Ready: the host's call, two beats before your Hey! */
      case "hey": cup.field = [...all]; songAtBeat(0, 13.2); break;
      /* a tap now: 20 ms early, Perfect */
      case "play": cup.field = [...all]; songAtBeat(0, 30 + (-20 + 18) / 500); break;
      case "play-late": cup.field = [...all]; songAtBeat(0, 30 + (190 + 18) / 500); break;
      case "play-miss": cup.field = [...all]; songAtBeat(0, 31.9, { missed:[] });
        later(() => { if (!song) return; const cue = song.chart.cues.find(c => c.beat === 30); if (!cue) return;
          song.mine.set(cue.id, { q:"miss", d:null }); song.lastMine = { c:cue.id, q:"miss", d:null }; event("hit", ME, { c:cue.id, q:"miss" }); meFrame(); }, 400);
        break;
      case "drink": cup.field = [...all]; songAtBeat(0, 60.3, { done:false }); break;
      case "drink-done": cup.field = [...all]; songAtBeat(0, 66.2, { done:true }); break;
      case "drink-dry": cup.field = [...all]; cup.entrants[ME].drinks = false; songAtBeat(0, 62.4); break;
      case "drink-late": cup.field = [...all]; songAtBeat(0, 89.4, { done:false }); break;
      case "outro": cup.field = [...all]; songAtBeat(0, 120.2); break;
      case "after": cup.field = [...all]; songAtBeat(0, 128.6); break;
      case "rock": played([[ME, 3, 2, 5, 1, 7, 8, 6, 4]]); songAtBeat(1, 9.2, { offset:-12 }); break;
      case "spin": played([[ME, 3, 2, 5, 1, 7, 8, 6, 4], [3, ME, 5, 2, 1, 7]]); songAtBeat(2, 10.6, { offset:-12 }); break;
      case "drop": played([[ME, 3, 2, 5, 1, 7, 8, 6, 4], [3, ME, 5, 2, 1, 7], [ME, 3, 5]]); songAtBeat(3, 118.1, { offset:-12 }); break;
      case "cut": cutAfter(0, [], [3, 2, 5, ME, 1, 7, 8, 6, 4]); break;
      case "cut-out": cutAfter(0, [], out9); break;
      case "cut-final": cutAfter(3, [[ME, 3, 5, 2, 1, 7, 8, 6, 4], [ME, 3, 5, 2, 1, 7], [3, ME, 5]], [ME, 3, 5]); break;
      case "crowd": played([out9]); songAtBeat(1, 34.2); break;
      case "podium": case "podium-win": case "podium-out": {
        const top = name === "podium-win" ? [ME, 3, 5] : name === "podium" ? [3, ME, 5] : [3, 5, 2];
        const lead = name === "podium-out" ? [3, 5, 2, 1, 7, 8, ME, 6, 4, 9] : [...top, 2, 1, 7, 8, 6, 4];
        played([lead, lead, lead, top]);
        cup.phase = "podium"; cup.startAt = now() - 2000; cup.endsAt = cup.startAt + T.PODIUM_MS;
        break;
      }
      case "feedback": played([[3, ME, 5], [3, ME, 5], [3, ME, 5], [3, ME, 5]]); cup.phase = "feedback"; cup.startAt = now() - 1000;
        cup.endsAt = cup.startAt + T.FEEDBACK_MS; break;
      case "watch": cup.entrants[ME].device = "someone-else"; played([[3, 2, 5, 1]]); songAtBeat(1, 40.2); break;
      default:
    }
    if (status === "open" && !quiet) {
      const member = cup.entrants.some(e => e.device === device);
      deliver({ t:"welcome", you:{ device, role:"controller", ...(member ? { entrant:ME } : {}) } });
      chartSentFor = null;
      sendRoom();
      if (song && cup.phase === "song") meFrame();
    }
    return true;
  }

  /* open shortly after creation, like a socket */
  later(() => { if (!closed) setStatus("open"); }, 80);

  const net = {
    device,
    room:"mock",
    send(msg) {
      if (closed || status !== "open" || !msg || typeof msg !== "object") return false;
      later(() => { if (!closed) receive(JSON.parse(JSON.stringify(msg))); }, lag);
      return true;
    },
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
      return () => listeners.get(type)?.delete(fn);
    },
    close() {
      if (closed) return;
      closed = true;
      clearTimer(); clearSong();
      setStatus("closed");
    },
    serverNow:() => now(),
    rtt:() => lag * 2,
    status:() => status,
    onStatus(fn) { statusFns.add(fn); return () => statusFns.delete(fn); },
    mock:{ sent, scenes:MOCK_SCENES, go:name => go(name), cup:() => cup, song:() => song, feedback:() => feedback, serial:++mockSerial,
      status:() => status, closed:() => closed,
      /* let a held scene run on as a live Cup */
      run() { held = false; frozenAt = null; if (cup.phase === "song" && !songTimer) songTimer = timers.setInterval(stepSong, T.TICK_MS); },
      /* move a frozen clock */
      at(ms) { if (frozenAt !== null) frozenAt = MOCK_EPOCH + ms; },
      /* drop the connection for a moment, as a sleeping phone would */
      blip(ms = 1500) { setStatus("connecting"); later(() => { if (!closed) setStatus("open"); }, ms); } },
  };
  /* the controller sends hello on open, as connectFloat does */
  statusFns.add(next => { if (next === "open") receive({ t:"hello", role:"controller", device, rider:rider() }); });
  net.mock.net = net;
  if (expose && typeof window !== "undefined") {
    window.__floatMock = net.mock;
    window.__floatMocks = [...(window.__floatMocks || []), net.mock];
  }
  return net;
}
let mockSerial = 0;
