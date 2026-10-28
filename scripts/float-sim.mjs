/* Float's bench (float/GROOVE.md): a whole Groove Cup through the real room
   (float/worker/room.js FloatRoom, the Cup, the songs, the bots) on a fake
   clock, over fake sockets, ticked every 100 ms as the Durable Object ticks
   itself. It prints the timeline (every phase, the calibration, Last Call
   and who drinks) and each round's ranking and cut, then the final order
   and, for a Field Day Cup, the body the room posts to the Tournament.

     node scripts/float-sim.mjs [--seed 3] [--bots 13] [--phones 0] [--lag 120]
       [--late 0] [--dry 0] [--drinking 1] [--fieldday] [--cups 1] [--quiet]

   --bots      computer riders (the field, with --phones on top)
   --phones    pretend phones: each taps every cue through the real protocol
               (matchTap on its own estimate of the server clock, hit {c, r}),
               a little early or late, taps Done in the break, and grabs at
               Last Call (sloppier: a grab is harder than a beat)
   --lag       the TV's sound delay (ms) the pretend phones answer to: the
               room's calibration should find it in practice
   --late      of the phones, how many never tap Done (their play B is misses)
   --dry       of the phones, how many skip the drink (done without tapping)
   --drinking  0 turns the room's drinking off
   --fieldday  the Tournament reserves the Cup (the phones by player id) and
               the result is posted to a fake Tournament, printed at the end
   --cups      run this many Cups and print where each skill finished

   Deterministic: the same flags print the same numbers. */
import { pathToFileURL } from "node:url";
import { FloatRoom } from "../float/worker/room.js";
import { cueTime, matchTap, SONGS } from "../float/shared/chart.js";
import { rand01 } from "../float/shared/groove.js";

const args = process.argv.slice(2);
const option = (name, fallback) => { const at = args.indexOf(name); return at >= 0 && args[at + 1] !== undefined ? args[at + 1] : fallback; };
const flag = name => args.includes(name);
const SEED = Number(option("--seed", 3));
const BOTS = Number(option("--bots", 13));
const PHONES = Number(option("--phones", 0));
const LAG = Number(option("--lag", 120));
const LATE = Number(option("--late", 0));
const DRY = Number(option("--dry", 0));
const DRINKING = option("--drinking", "1") !== "0";
const FIELDDAY = flag("--fieldday");
const CUPS = Number(option("--cups", 1));
const QUIET = flag("--quiet") || CUPS > 1;
const TICK = 100;

/* ---- the harness: a memory ctx, fake sockets, a fake clock ---- */
export class FakeSocket {
  constructor(onMessage = null) { this.sent = []; this.listeners = {}; this.readyState = 1; this.onMessage = onMessage; }
  send(text) {
    if (this.readyState !== 1) throw new Error("closed");
    const msg = JSON.parse(text);
    this.sent.push(msg);
    if (this.onMessage) this.onMessage(msg);
  }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  accept() {}
  close() { this.readyState = 3; for (const fn of this.listeners.close || []) fn({}); }
}
export function memoryCtx() {
  const entries = new Map();
  const storage = {
    alarm:null,
    async get(key) { return structuredClone(entries.get(key)); },
    async put(key, value) { entries.set(key, structuredClone(value)); },
    async delete(key) { entries.delete(key); },
    async setAlarm(at) { storage.alarm = at; },
    async deleteAlarm() { storage.alarm = null; },
  };
  return { entries, storage, ctx:{ storage, blockConcurrencyWhile:fn => fn() } };
}

const LOOK = { critter:"otter", floatie:"classic", hat:"none", shades:"none", pose:"flex" };
const say = (room, ws, message) => room.onMessage(ws, JSON.stringify(message));

/* a pretend phone: it taps every cue it hears, `lean` ms late (plus the TV's
   lag it answers to) with a spread, stamps the tap on the server clock and
   sends hit { c, r }; in the break it taps Done after a few seconds; at Last
   Call it grabs the same way, with three times the spread */
function phone(room, clock, k, { pid = null, drinks = true, late = false } = {}) {
  const device = `phone-${k}`;
  const state = { songAt:null, chart:null, offset:0, taken:new Set(), song:null, done:false, i:-1, plan:[] };
  const ws = new FakeSocket(msg => {
    if (msg.t === "welcome") state.i = msg.you.entrant ?? -1;
    if (msg.t !== "room") return;
    if (msg.chart) state.chart = msg.chart;
    state.offset = msg.offset;
    if ((msg.phase === "song" || msg.phase === "lastcall") && msg.songAt !== state.songAt) {
      state.songAt = msg.songAt;
      state.taken = new Set();
      state.done = msg.phase === "lastcall";
      /* this phone's taps for the whole song (or Last Call), planned once */
      const grabs = msg.phase === "lastcall" ? 3 : 1;
      state.plan = (state.chart?.cues || []).map(cue => {
        const lean = 25 * (rand01(SEED, k, 77) * 2 - 1);
        const spread = (30 + 40 * rand01(SEED, k, 78)) * grabs;
        const u = rand01(SEED, k, cue.id, msg.round, 1), v = rand01(SEED, k, cue.id, msg.round, 2);
        const jitter = Math.sqrt(-2 * Math.log(1 - u)) * Math.cos(2 * Math.PI * v) * spread;
        return { at:cueTime(msg.songAt, cue.beat) + LAG + lean + jitter, sent:false };
      });
    }
    state.phase = msg.phase;
  });
  room.attach(ws, new URL("https://float.sim/float/ws?room=sim"));
  say(room, ws, { t:"hello", role:"controller", device, rider:{ name:pid || `Phone ${k + 1}`, color:"#336699", look:LOOK, drinks, ...(pid ? { pid } : {}) } });
  let pingAt = 0;
  return {
    ws, device, state,
    step(now) {
      if (now - pingAt >= 2000) { pingAt = now; say(room, ws, { t:"ping", c:now, rtt:80 }); }
      if ((state.phase !== "song" && state.phase !== "lastcall") || !state.chart) return;
      const drinkFrom = cueTime(state.songAt, 56), drinkTo = cueTime(state.songAt, 88);
      if (!state.done && drinks && !late && now >= drinkFrom + 3000 + 6000 * rand01(SEED, k, 90)) { state.done = true; say(room, ws, { t:"drink" }); }
      if (!state.done && !drinks && now >= drinkFrom) state.done = true;
      for (const tap of state.plan) {
        if (tap.sent || tap.at > now) continue;
        tap.sent = true;
        if (state.phase === "song" && now >= drinkTo - 50 && !state.done && drinks) continue;
        /* the phone judges its tap where it lands, as controller/rhythm.js does */
        const match = matchTap(state.chart, state.songAt, tap.at, { offset:state.offset, taken:state.taken });
        if (!match) continue;
        state.taken.add(match.cue.id);
        say(room, ws, { t:"hit", c:match.cue.id, r:match.r });
      }
    },
  };
}

/* the fake Tournament's binding: every post recorded */
function tournament() {
  const calls = [];
  return { calls, env:{ TOURNAMENT:{ idFromName:name => name, get:() => ({ fetch:async (url, init) => {
    calls.push({ url:String(url), body:JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok:true }), { status:200 });
  } }) } } };
}

const fmt = ms => `${(ms / 1000).toFixed(1).padStart(6)} s`;
const pad = (v, n) => String(v).padStart(n);

export async function runCup({ seed = SEED, bots = BOTS, phones = PHONES, fieldday = FIELDDAY, drinking = DRINKING,
  late = LATE, dry = DRY, quiet = QUIET } = {}) {
  const mem = memoryCtx();
  const clock = { t:Date.UTC(2026, 9, 31, 4, 0, 0) + seed * 7919, now:() => clock.t };
  const fd = tournament();
  let serial = 0;
  const room = new FloatRoom(mem.ctx, fd.env, { clock, timers:false, ids:prefix => `${prefix}sim${seed}x${(serial += 1)}` });
  await room.ready;
  const log = quiet ? () => {} : (...line) => console.log(...line);
  const t0 = clock.t;
  const screen = new FakeSocket();
  room.attach(screen, new URL("https://float.sim/float/ws?room=sim"));
  say(room, screen, { t:"hello", role:"screen", device:"tv" });
  const pids = Array.from({ length:phones }, (_, k) => `P${k + 1}`);
  const drinksOf = k => !(k >= late && k < late + dry);
  if (fieldday) {
    const entrants = pids.map((pid, k) => ({ pid, name:pid, color:"#aa3300", look:LOOK, drinks:drinksOf(k) }));
    await room.fetch(new Request("https://fd.internal/internal/cup?room=fd-float", { method:"POST",
      body:JSON.stringify({ evId:"float", cupId:`sim-${seed}`, mode:"fieldday", drinking, startAt:clock.t + 3000, bots:Math.max(bots, phones), entrants }) }));
  }
  const pretend = pids.map((pid, k) => phone(room, clock, k, { pid:fieldday ? pid : null, drinks:drinksOf(k), late:k < late }));
  if (!fieldday) say(room, screen, { t:"host", cmd:"start", bots, drinking });
  /* the timeline: every phase, the offset's moves, Last Call and who drinks */
  let phase = null, offset = null, round = -1, drinks = null;
  const nameOf = i => room.cup?.entrants[i]?.name ?? i;
  const rounds = [];
  const watch = msg => {
    if (msg.t !== "room") return;
    if (msg.phase !== phase || msg.round !== round) {
      phase = msg.phase; round = msg.round;
      const extra = phase === "song" ? `${SONGS.find(song => song.id === msg.song)?.name}, beat 0 at ${fmt(msg.songAt - t0)}, field ${msg.field.length}, offset ${msg.offset}`
        : phase === "cut" ? `${msg.out.length} out so far, ${((msg.endsAt - msg.startAt) / 1000).toFixed(0)} s`
        : phase === "lastcall" ? `Last Call, beat 0 at ${fmt(msg.songAt - t0)}, ${msg.lastCall.totals.length} at the bar, offset ${msg.offset}` : "";
      log(`${fmt(clock.t - t0)}  ${phase.padEnd(8)} round ${msg.round + 1}  ${extra}`);
      drinks = null;
    }
    if (msg.phase === "lastcall" && msg.lastCall?.worst && drinks === null) {
      drinks = msg.lastCall.worst;
      const ms = i => msg.lastCall.totals.find(row => row.i === i).ms;
      log(`${fmt(clock.t - t0)}    who drinks: ${drinks.map(i => `${nameOf(i)} (${(ms(i) / 1000).toFixed(2)} s)`).join(", ")}`);
    }
    if (msg.offset !== offset) {
      if (offset !== null && phase === "song") log(`${fmt(clock.t - t0)}    offset ${offset} -> ${msg.offset} ms`);
      offset = msg.offset;
    }
  };
  const seen = screen.sent.length;
  screen.sent.slice(0, seen).forEach(watch);
  screen.onMessage = watch;
  const end = clock.t + 30 * 60 * 1000;
  let last = "";
  while (clock.t < end) {
    clock.t += TICK;
    for (const p of pretend) p.step(clock.t);
    room.tick();
    await null;
    const cup = room.cup;
    if (cup.phase === "cut" && last !== `cut${cup.round}`) {
      last = `cut${cup.round}`;
      rounds.push(cup.history.at(-1));
    }
    if (cup.phase === "feedback") break;
  }
  await room.flushOutbox();
  const cup = room.cup;
  const name = i => cup.entrants[i]?.name ?? i;
  if (!quiet) {
    for (const item of cup.history) {
      const song = SONGS.find(s => s.id === item.song)?.name;
      log(`\nRound ${item.round + 1}: ${song}, ${item.field.length} riders, offset ${item.offset} ms from ${item.samples} practice taps`);
      log("   place  rider            skill    pct   perfects  misses  bot/stand-in  done in   out");
      for (const row of item.results) {
        const entrant = cup.entrants[row.i];
        const stats = item.stats[row.i];
        log(`   ${pad(row.place, 5)}  ${String(name(row.i)).padEnd(16)} ${pad(entrant.bot ? entrant.skill.toFixed(2) : "phone", 5)}  ${pad(row.pct.toFixed(1), 5)}  ${pad(row.perfects, 8)}  ${pad(row.misses, 6)}  ${pad(stats.botShare.toFixed(2), 12)}  ${pad(stats.doneMs === null ? "-" : `${(stats.doneMs / 1000).toFixed(1)} s`, 7)}  ${row.out ? "out" : ""}`);
      }
      if (item.lastCall) {
        const sorted = item.lastCall.totals.slice().sort((a, b) => a.ms - b.ms);
        const grabsOf = row => [0, 1, 2].map(c => row.grabs[c] === null || row.grabs[c] === undefined ? "miss" : `${row.grabs[c] > 0 ? "+" : ""}${row.grabs[c]}`).join(" ");
        log(`   Last Call: ${item.lastCall.players.length} at the bar; who drinks: ${item.lastCall.worst.map(name).join(", ")}`);
        for (const row of sorted) log(`      ${String(name(row.i)).padEnd(16)} ${pad((row.ms / 1000).toFixed(2), 5)} s   ${grabsOf(row)}${item.lastCall.worst.includes(row.i) ? "   drinks" : ""}`);
      }
    }
    log(`\nFinal: ${cup.final.map((i, k) => `${k + 1}. ${name(i)}`).join("  ")}`);
    const posted = fd.calls.find(call => call.url.endsWith("/internal/float/result"));
    if (posted) log("\nPosted to the Tournament:", JSON.stringify({ ...posted.body, rounds:`${posted.body.rounds.length} rounds`,
      stats:{ rounds:posted.body.stats.rounds.map(item => ({ round:item.round, song:item.song, offset:item.offset, samples:item.samples,
        lastCall:item.lastCall?.worst ?? null })),
        botShare:posted.body.stats.botShare } }));
    const evs = screen.sent.filter(msg => msg.t === "ev");
    log(`\nThe screen heard ${screen.sent.filter(msg => msg.t === "room").length} room messages and ${evs.length} events (${evs.filter(e => e.e === "hit").length} hits and misses, ${evs.filter(e => e.e === "done").length} done, ${evs.filter(e => e.e === "out").length} out).`);
  }
  return { cup, room, screen, fd, rounds };
}

/* run from the command line (importing the file only lends its harness) */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (CUPS <= 1) await runCup();
  else {
    const buckets = new Map();
    let bestWins = 0;
    for (let k = 0; k < CUPS; k += 1) {
      const { cup } = await runCup({ seed:SEED * 1000 + k, quiet:true });
      const bots = cup.entrants.map((entrant, i) => ({ entrant, i })).filter(item => item.entrant.bot);
      const best = bots.reduce((top, item) => item.entrant.skill > top.entrant.skill ? item : top, bots[0]);
      if (cup.final[0] === best?.i) bestWins += 1;
      cup.final.forEach((i, place) => {
        const entrant = cup.entrants[i];
        const key = entrant.bot ? (Math.round(entrant.skill * 10) / 10).toFixed(1) : "phone";
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(place + 1);
      });
    }
    const mean = list => list.reduce((a, b) => a + b, 0) / list.length;
    console.log(`${CUPS} Cups: mean final place by skill`);
    for (const key of [...buckets.keys()].sort().reverse())
      console.log(`   ${key.padEnd(6)} mean place ${mean(buckets.get(key)).toFixed(2)}   wins ${(100 * buckets.get(key).filter(p => p === 1).length / buckets.get(key).length).toFixed(1)}%`);
    console.log(`   the sharpest bot wins ${(100 * bestWins / CUPS).toFixed(1)}% of Cups`);
  }
}
