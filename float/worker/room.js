/* FloatRoom: one Durable Object per Float room (float/PROTOCOL.md "The
   room", "Field Day"). The room is the race's only authority: phones send
   strokes, screens draw what the room sends, the room runs the Cup
   (float/shared/cup.js) and the river (sim.js) and paddles for bots.

   Sockets: plain ws.accept(), not hibernation. While a race runs the 30 Hz
   setInterval blocks hibernation anyway; every client pings every 2 s and
   each pong must carry the server's clock, so an idle lobby would wake the
   object constantly too; and per-socket state (device, role, rider, round
   trip) is simplest in memory. Nothing that matters lives only in memory:
   the Cup is saved at every phase change, the race every second, and one
   alarm (the next phase deadline, a scheduled Field Day start, a pending
   post to the Tournament, or a race watchdog) brings a restarted room back,
   which resumes a race from its last save after a 3 s countdown.

   The 30 Hz loop runs only from `grid` to the end of `race`; between races a
   single timeout (and the alarm behind it) moves the phases on, and a lobby
   holds no timer at all.

   Testing: new FloatRoom(ctx, env, { clock, timers:false }) takes a fake
   clock; tick(), alarm(), wake(), attach(ws, url) and onMessage(ws, text)
   are public so a test can drive a whole Cup in accelerated time. */
import { COURSE, COURSE_ID, legLength } from "../shared/course.js";
import { ROLES, HOST_CMDS, FLAG, cleanDevice, cleanRider, cleanAnswers, cleanPid, ROOM_ID } from "../shared/protocol.js";
import { SIM_HZ, SNAP_HZ, ME_HZ, PERSIST_MS, DEBUG_MS, MAX_CATCHUP_TICKS, MAX_RIDERS, TIMING } from "../shared/tuning.js";
import { applyInput, throwBalloon, rows, flagsOf, progressOf, riderOf, seedOf } from "../shared/sim.js";
import { cleanLook } from "../shared/looks.js";
import { FLOATIE_IDS } from "../shared/floaties.js";
import * as Cup from "../shared/cup.js";

const TICK_MS = 1000 / SIM_HZ;
/* a controller silent this long is away (a bot paddles for it) */
const STALE_MS = 5000;
/* inputs a socket may send: strokes a second, and everything a second */
const STROKES_PER_S = 10;
const MESSAGES_PER_S = 60;
/* what a screen sees while riders sit on the grid */
const GRID_SNAP_MS = 200;
/* retries for posts to the Tournament: then hourly, for a day */
const BACKOFF_MS = [1000, 5000, 30000, 120000, 600000];
const RETRY_FOR_MS = 24 * 3600 * 1000;
const realClock = {
  now:() => Date.now(),
  setInterval:(fn, ms) => setInterval(fn, ms),
  clearInterval:id => clearInterval(id),
  setTimeout:(fn, ms) => setTimeout(fn, ms),
  clearTimeout:id => clearTimeout(id),
};
const randomId = prefix => {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return `${prefix}${[...bytes].map(b => b.toString(16).padStart(2, "0")).join("")}`;
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers:{ "Content-Type":"application/json" } });

export class FloatRoom {
  constructor(ctx, env, options = {}) {
    this.ctx = ctx;
    this.env = env || {};
    this.clock = options.clock || realClock;
    this.timers = options.timers !== false;
    this.sockets = new Map();
    this.cup = null;
    this.race = null;
    this.outbox = [];
    this.loop = null;
    this.timer = null;
    this.raceZero = 0;
    this.lastSnap = -1;
    this.lastGridSnap = 0;
    this.lastMe = -1;
    this.lastSave = 0;
    this.lastDebug = 0;
    this.lastDriven = "";
    this.rtt = {};
    this.code = "";
    this.kickedDevices = new Set();
    const load = () => this.load();
    this.ready = ctx?.blockConcurrencyWhile ? Promise.resolve(ctx.blockConcurrencyWhile(load)) : load();
  }

  now() { return this.clock.now(); }
  get storage() { return this.ctx.storage; }

  /* ---------------------------------------------------------------- storage */

  async load() {
    const [cup, race, outbox] = await Promise.all([this.storage.get("cup"), this.storage.get("race"), this.storage.get("outbox")]);
    this.cup = cup || null;
    this.race = race || null;
    this.outbox = Array.isArray(outbox) ? outbox : [];
    if (this.cup) this.code = this.cup.code || "";
    this.restore();
  }

  /* a room that wakes up mid-Cup: a race resumes after a short countdown,
     anything else carries on from its saved deadline */
  restore() {
    const cup = this.cup;
    if (!cup) return;
    const now = this.now();
    if (cup.phase === "race" || (cup.phase === "countdown" && cup.resume)) {
      if (!this.race || this.race.leg !== Cup.legOf(cup)) this.race = Cup.raceFor(cup, COURSE);
      Cup.resumeCountdown(cup, now, this.race.t);
      this.saveCup();
    } else if ((cup.phase === "grid" || cup.phase === "countdown") && (!this.race || this.race.leg !== Cup.legOf(cup))) {
      this.race = Cup.raceFor(cup, COURSE);
    }
    this.schedule();
  }

  saveCup() { this.persist(this.storage.put("cup", this.cup)); }
  saveRace() {
    this.lastSave = this.now();
    if (this.race) this.persist(this.storage.put("race", this.race));
  }
  saveOutbox() { this.persist(this.storage.put("outbox", this.outbox)); }
  /* storage writes are not awaited on the hot path; the output gate holds
     messages until they land, and an error is logged, never thrown */
  persist(promise) { Promise.resolve(promise).catch(error => console.error("float: storage", error?.message || error)); }

  /* ---------------------------------------------------------------- sockets */

  async fetch(req) {
    await this.ready;
    const url = new URL(req.url);
    if (url.pathname === "/internal/cup" && req.method === "POST") return this.internalCup(req, url);
    if (req.headers.get("Upgrade") !== "websocket") return new Response("Expected a WebSocket", { status:426 });
    const pair = new WebSocketPair();
    const ws = pair[1];
    ws.accept();
    this.attach(ws, url);
    return new Response(null, { status:101, webSocket:pair[0] });
  }

  attach(ws, url) {
    const room = url?.searchParams?.get("room");
    if (!this.code && room && ROOM_ID.test(room)) this.code = room;
    this.sockets.set(ws, { role:null, device:null, rider:null, seen:this.now(), window:0, count:0, strokes:0 });
    ws.addEventListener("message", event => {
      /* a handler may be async (feedback awaits storage): never let it float */
      Promise.resolve(this.onMessage(ws, event.data)).catch(error => console.error("float: message", error?.message || error));
    });
    ws.addEventListener("close", () => this.drop(ws));
    ws.addEventListener("error", () => this.drop(ws));
  }

  drop(ws) {
    const meta = this.sockets.get(ws);
    if (!meta) return;
    this.sockets.delete(ws);
    if (meta.role === "controller" && this.cup && this.entrantIndex(meta.device) >= 0) this.broadcastRoom();
  }

  send(ws, message, s = this.now()) {
    try { ws.send(JSON.stringify({ ...message, s })); } catch { /* a closing socket */ }
  }
  each(role, fn) { for (const [ws, meta] of this.sockets) if (!role || meta.role === role) fn(ws, meta); }
  broadcast(message, role = null) {
    const text = JSON.stringify({ ...message, s:message.s ?? this.now() });
    this.each(role, ws => { try { ws.send(text); } catch { /* closing */ } });
  }

  onMessage(ws, data) {
    const meta = this.sockets.get(ws);
    if (!meta || typeof data !== "string" || data.length > 4096) return;
    const now = this.now();
    /* a flood is dropped, never queued */
    if (now - meta.window >= 1000) { meta.window = now; meta.count = 0; meta.strokes = 0; }
    if ((meta.count += 1) > MESSAGES_PER_S) return;
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    if (!msg || typeof msg !== "object") return;
    meta.seen = now;
    if (msg.t === "hello") return this.onHello(ws, meta, msg);
    if (msg.t === "ping") return this.onPing(ws, meta, msg);
    if (!meta.role || !this.cup) return;
    if (meta.role === "screen") {
      if (msg.t === "host") this.onHost(meta, msg);
      return;
    }
    const i = this.entrantIndex(meta.device);
    if (msg.t === "feedback") return this.onFeedback(meta, i, msg);
    if (i < 0) return;
    if (msg.t === "stroke") {
      if ((meta.strokes += 1) > STROKES_PER_S) return;
      return this.input(i, { t:"stroke", side:msg.side, p:msg.p });
    }
    if (msg.t === "hands") return this.input(i, { t:"hands", n:msg.n });
    if (msg.t === "drink") return this.onDrink(i);
    if (msg.t === "balloon") return this.onBalloon(i, msg);
    if (msg.t === "look") return this.onLook(meta, i, msg);
    if (msg.t === "ready") return this.onReady(i, msg);
  }

  /* hello: a screen, or a controller with its rider. A controller takes back
     its entrant: by Field Day player id first, then by device. In a party
     lobby a new phone gets a new entrant; mid-Cup it watches. */
  onHello(ws, meta, msg) {
    if (!ROLES.includes(msg.role)) return;
    meta.role = msg.role;
    meta.device = cleanDevice(msg.device) || randomId("d-");
    if (!this.cup) this.newCup();
    let i = -1;
    if (meta.role === "controller") {
      meta.rider = msg.rider ? cleanRider(msg.rider, { seed:meta.device }) : null;
      this.kickedDevices.delete(meta.device);
      i = this.claim(meta);
    }
    this.send(ws, { t:"welcome", you:{ device:meta.device, role:meta.role, ...(i >= 0 ? { entrant:i } : {}) } });
    this.send(ws, this.roomMessage(true, meta.role === "controller" ? meta.device : null));
    if (meta.role === "screen" && this.clip && this.cup.phase === "cut") this.send(ws, this.clip);
    if (meta.role === "controller") this.broadcastRoom(ws);
    this.schedule();
  }

  claim(meta) {
    const cup = this.cup;
    const rider = meta.rider;
    const pid = rider?.pid ? cleanPid(rider.pid) : null;
    let i = pid ? cup.entrants.findIndex(entrant => entrant.pid === pid) : -1;
    if (i < 0) i = this.entrantIndex(meta.device);
    if (i >= 0) {
      const entrant = cup.entrants[i];
      entrant.device = meta.device;
      /* the phone's look counts in the lobby (its floatie choice included) */
      if (rider && cup.phase === "lobby") {
        entrant.look = cleanLook(rider.look, { groom:entrant.groom === true, floatieIds:FLOATIE_IDS, seed:meta.device });
        if (!entrant.pid) {
          entrant.name = rider.name;
          if (rider.color) entrant.color = rider.color;
          entrant.drinks = rider.drinks;
          for (const key of ["photo", "number", "skin", "groom"]) if (rider[key] !== undefined) entrant[key] = rider[key];
        }
      }
      this.saveCup();
      return i;
    }
    if (rider && cup.phase === "lobby" && cup.mode === "party" && cup.entrants.length < MAX_RIDERS) {
      cup.entrants.push(Cup.makeEntrant(cup, rider, { device:meta.device }));
      this.saveCup();
      return cup.entrants.length - 1;
    }
    return -1;
  }

  entrantIndex(device) {
    if (!device || !this.cup) return -1;
    return this.cup.entrants.findIndex(entrant => entrant.device === device);
  }

  onPing(ws, meta, msg) {
    const rtt = Number(msg.rtt);
    if (meta.device && Number.isFinite(rtt) && rtt >= 0 && rtt < 60000) {
      this.rtt[meta.device] = Math.round(rtt);
      if (meta.role === "controller") (meta.samples ||= []).push(Math.round(rtt));
      if (meta.samples?.length > 400) meta.samples.splice(0, 200);
    }
    this.send(ws, { t:"pong", c:msg.c });
  }

  /* a controller is live when it has spoken lately */
  live(device, now = this.now()) {
    if (!device) return false;
    for (const meta of this.sockets.values())
      if (meta.role === "controller" && meta.device === device && now - meta.seen < STALE_MS) return true;
    return false;
  }

  /* who paddles for entrant i: a bot entrant, a kicked one, or anyone whose
     phone is away right now (taken back the moment it speaks again) */
  botDriven(i, now = this.now()) {
    const entrant = this.cup?.entrants[i];
    if (!entrant) return false;
    return entrant.bot || entrant.kicked === true || !this.live(entrant.device, now);
  }

  /* ---------------------------------------------------------------- the room message */

  /* The room as a socket sees it. A rider's drinking answer is private (in
     Field Day only they and the commissioner see it): `drinks` goes only to
     the entrant whose device this is (`forDevice`), never to screens or
     other phones. Out riders carry `drank` (their beach drink). */
  roomMessage(withCourse = false, forDevice = null) {
    const cup = this.cup;
    const now = this.now();
    const entrants = cup.entrants.map((entrant, i) => {
      const item = { device:entrant.device, name:entrant.name, color:entrant.color, look:entrant.look, bot:entrant.bot === true,
        connected:entrant.bot ? true : this.live(entrant.device, now), ready:entrant.ready === true,
        botDriven:this.botDriven(i, now) };
      if (forDevice && entrant.device === forDevice) item.drinks = entrant.drinks !== false;
      if (cup.beach[i] && cup.out.includes(i)) item.drank = cup.beach[i].drank === true;
      for (const key of ["pid", "photo", "number", "skin", "groom"]) if (entrant[key] !== undefined) item[key] = entrant[key];
      return item;
    });
    const live = cup.phase === "race" && this.race;
    return {
      t:"room", phase:cup.phase, mode:cup.mode, code:cup.code || this.code, cupId:cup.id, drinking:cup.drinking,
      round:cup.round, rounds:cup.rounds, leg:Cup.legOf(cup), field:cup.field, out:cup.out,
      startAt:cup.startAt, endsAt:cup.endsAt, swapUntil:cup.swapUntil ?? null, resume:cup.resume === true,
      /* a Field Day Cup's start, while it waits in the lobby */
      startPlanned:cup.phase === "lobby" && cup.startPlanned ? cup.startPlanned : null,
      cut:Cup.cutOf(cup), len:legLength(COURSE, Cup.legOf(cup)),
      /* this is the final round (`final`, below, is the Cup's final order once known) */
      lastRound:cup.phase !== "lobby" && Cup.isLastRound(cup),
      entrants,
      ...(withCourse ? { course:COURSE } : { courseId:COURSE_ID }),
      results:live ? Cup.resultsOf(this.race) : cup.results, standings:cup.standings, podium:cup.podium,
      final:cup.final, history:cup.history.map(({ round, leg, field, results, out }) => ({ round, leg, field, results, out })),
    };
  }
  /* one text for screens and phones without an entrant; each rider's phone
     its own copy, with only its own drinking answer */
  broadcastRoom(except = null) {
    if (!this.cup) return;
    const s = this.now();
    const base = this.roomMessage(false);
    const text = JSON.stringify({ ...base, s });
    this.each(null, (ws, meta) => {
      if (ws === except) return;
      const k = meta.role === "controller" ? this.entrantIndex(meta.device) : -1;
      let out = text;
      if (k >= 0) {
        const own = { ...base.entrants[k], drinks:this.cup.entrants[k].drinks !== false };
        out = JSON.stringify({ ...base, entrants:base.entrants.map((item, j) => j === k ? own : item), s });
      }
      try { ws.send(out); } catch { /* closing */ }
    });
  }

  /* ---------------------------------------------------------------- the Cup */

  newCup({ mode = "party", drinking = true, id = randomId("c-"), evId = null } = {}) {
    this.stopLoop();
    this.race = null;
    this.cup = Cup.createCup({ id, mode, code:this.code, drinking, seed:seedOf(`${id}:${this.now()}`), evId });
    this.saveCup();
    return this.cup;
  }

  onHost(meta, msg) {
    const cup = this.cup;
    if (!HOST_CMDS.includes(msg.cmd)) return;
    /* a Field Day cup belongs to the Tournament until it is done */
    const fieldDayLive = cup.mode === "fieldday" && !cup.done && (cup.phase !== "lobby" || cup.startPlanned);
    if (msg.cmd === "start") {
      if (cup.phase !== "lobby" || fieldDayLive) return;
      if (cup.mode === "fieldday") { cup.mode = "party"; cup.id = randomId("c-"); }
      const bots = Math.max(0, Math.min(MAX_RIDERS, Number(msg.bots) | 0));
      if (bots) Cup.addBots(cup, bots, seedOf(`${cup.id}:${this.now()}`));
      if (!cup.entrants.length) return;
      cup.drinking = msg.drinking !== false;
      this.startCup();
    } else if (msg.cmd === "lobby") {
      if (fieldDayLive || cup.phase === "lobby") return;
      this.toLobby();
    } else if (msg.cmd === "kick") {
      const device = cleanDevice(msg.device);
      const i = this.entrantIndex(device);
      if (i < 0 || fieldDayLive && cup.entrants[i].pid) return;
      /* in the lobby the entrant goes; mid-Cup indexes are fixed, so a bot
         paddles for it instead */
      if (cup.phase === "lobby") {
        cup.entrants.splice(i, 1);
        /* it stays out of later lobbies until that phone says hello again */
        this.kickedDevices.add(device);
      }
      else cup.entrants[i].kicked = true;
      this.saveCup();
      this.broadcastRoom();
    }
  }

  startCup() {
    const now = this.now();
    this.race = null;
    Cup.startCup(this.cup, now);
    this.cup.startPlanned = null;
    this.saveCup();
    this.broadcastRoom();
    this.schedule();
  }

  toLobby() {
    this.postResultOnce();
    this.stopLoop();
    this.race = null;
    Cup.toLobby(this.cup, this.now(), { keepBots:this.cup.mode === "fieldday" && !this.cup.done });
    /* phones that watched the last Cup join the next one */
    if (this.cup.mode === "party")
      for (const meta of this.sockets.values())
        if (meta.role === "controller" && meta.rider && this.entrantIndex(meta.device) < 0 && !this.kickedDevices.has(meta.device)
          && this.cup.entrants.length < MAX_RIDERS)
          this.cup.entrants.push(Cup.makeEntrant(this.cup, meta.rider, { device:meta.device }));
    this.persist(this.storage.delete("race"));
    this.saveCup();
    this.broadcastRoom();
    this.schedule();
  }

  /* the next timed thing: a phase's end, a Field Day start, a post to retry */
  schedule() {
    if (!this.cup) return;
    const cup = this.cup;
    const now = this.now();
    const looping = ["grid", "countdown", "race"].includes(cup.phase);
    if (looping) this.startLoop(); else this.stopLoop();
    let next = null;
    const take = at => { if (Number.isFinite(at)) next = next === null ? at : Math.min(next, at); };
    if (!looping && cup.phase !== "lobby") take(cup.endsAt);
    if (cup.phase === "lobby" && cup.startPlanned) take(cup.startPlanned);
    for (const item of this.outbox) if (!item.failed) take(item.nextAt);
    if (this.timers) {
      if (this.timer !== null) this.clock.clearTimeout(this.timer);
      this.timer = next === null ? null : this.clock.setTimeout(() => { this.timer = null; this.wake(); }, Math.max(0, next - now));
    }
    /* the watchdog: a running race checks in every few seconds */
    let alarm = next;
    if (looping) alarm = Math.min(alarm ?? Infinity, now + 5000);
    if (alarm !== null && Number.isFinite(alarm)) this.persist(this.storage.setAlarm?.(Math.max(now + 50, alarm)));
    else this.persist(this.storage.deleteAlarm?.());
  }

  async alarm() {
    await this.ready;
    this.wake();
    await this.flushOutbox();
    this.schedule();
  }

  /* move the Cup on if its time has come (the loop does this while racing) */
  wake() {
    const cup = this.cup;
    if (!cup) return;
    const now = this.now();
    if (cup.phase === "lobby" && cup.startPlanned && now >= cup.startPlanned) {
      this.startCup();
      return;
    }
    if (["grid", "countdown", "race"].includes(cup.phase)) { if (!this.loop || !this.timers) this.tick(); return; }
    if (cup.phase === "lobby" || cup.endsAt === null || now < cup.endsAt) { this.flushOutbox(); this.schedule(); return; }
    if (cup.phase === "feedback") { this.toLobby(); return; }
    const phase = Cup.advance(cup, now);
    if (phase === "grid") this.enterGrid();
    if (phase === "feedback") this.postResultOnce();
    this.saveCup();
    this.broadcastRoom();
    this.flushOutbox();
    this.schedule();
  }

  enterGrid() {
    this.race = Cup.raceFor(this.cup, COURSE);
    this.race.bots = {};
    this.frames = [];
    this.clip = null;
    this.lastSnap = -1;
    this.lastGridSnap = 0;
    this.lastMe = -1;
    this.saveRace();
  }

  startLoop() {
    if (this.loop !== null || !this.timers) return;
    /* half a tick: timers run late now and then, and a callback that owes
       two ticks sends one snap; at twice the rate every tick gets its own
       callback and the screens see a steady 20 Hz */
    this.loop = this.clock.setInterval(() => this.tick(), TICK_MS / 2);
  }
  stopLoop() {
    if (this.loop === null) return;
    this.clock.clearInterval(this.loop);
    this.loop = null;
  }

  /* the 30 Hz loop: grid and countdown deadlines, then the race */
  tick() {
    const cup = this.cup;
    if (!cup) return;
    const now = this.now();
    if (cup.phase === "grid" && now >= cup.endsAt) {
      Cup.advance(cup, now);
      this.saveCup();
      this.broadcastRoom();
    }
    if (cup.phase === "countdown" && now >= cup.endsAt) {
      Cup.advance(cup, now);
      if (!this.race) this.enterGrid();
      this.race.bots ||= {};
      this.raceZero = cup.startAt;
      this.lastSnap = Math.floor(this.race.tick * SNAP_PER_TICK);
      this.lastMe = this.race.tick;
      this.saveCup();
      this.saveRace();
      this.broadcastRoom();
      this.schedule();
    }
    if (cup.phase === "grid" || cup.phase === "countdown") {
      if (this.race && now - this.lastGridSnap >= GRID_SNAP_MS) {
        this.lastGridSnap = now;
        this.broadcast({ t:"snap", s:now, k:rows(this.race) }, "screen");
      }
      return;
    }
    if (cup.phase !== "race" || !this.race) return;
    const owed = Math.floor((now - this.raceZero) / TICK_MS);
    let steps = 0;
    while (this.race.tick < owed && steps < MAX_CATCHUP_TICKS && cup.phase === "race") {
      this.step(now);
      steps += 1;
    }
    if (cup.phase !== "race") return;
    /* fell too far behind (a long pause): the race clock slips, nothing jumps */
    if (this.race.tick < owed) {
      this.raceZero = now - this.race.tick * TICK_MS;
      cup.startAt = this.raceZero;
      cup.endsAt = this.capAt();
    }
    const at = Math.round(this.raceZero + this.race.tick * TICK_MS);
    const snapIndex = Math.floor(this.race.tick * SNAP_PER_TICK);
    if (snapIndex > this.lastSnap) {
      this.lastSnap = snapIndex;
      const k = rows(this.race);
      this.broadcast({ t:"snap", s:at, k }, "screen");
      this.recordReplay(at, k);
    }
    if (this.race.tick - this.lastMe >= SIM_HZ / ME_HZ) {
      this.lastMe = this.race.tick;
      this.sendMe(at);
    }
    if (now - this.lastSave >= PERSIST_MS) {
      this.saveRace();
      this.schedule();
    }
    if (now - this.lastDebug >= DEBUG_MS) {
      this.lastDebug = now;
      this.broadcast({ t:"debug", s:now, rtt:{ ...this.rtt } }, "screen");
      const driven = this.cup.entrants.map((_, i) => this.botDriven(i, now) ? 1 : 0).join("");
      if (driven !== this.lastDriven) { this.lastDriven = driven; this.broadcastRoom(); }
    }
  }

  /* one race tick: bots think, the river moves, the Cup reads the result */
  step(now) {
    const cup = this.cup, race = this.race;
    const events = Cup.raceTick(cup, race, { now, driven:i => this.botDriven(i, now), course:COURSE });
    const tickAt = Math.round(this.raceZero + race.tick * TICK_MS);
    let changed = false;
    for (const event of events) {
      if (event.e === "arrive" || event.e === "drink") changed = true;
      this.broadcast({ t:"ev", s:tickAt, ...event });
    }
    const ends = this.capAt();
    if (ends !== cup.endsAt) { cup.endsAt = ends; changed = true; }
    const status = Cup.roundStatus(cup, race);
    if (status.over) return this.endRound(now);
    if (changed) this.broadcastRoom();
  }

  endRound(now) {
    const cup = this.cup, race = this.race;
    this.sendMe(Math.round(this.raceZero + race.tick * TICK_MS));
    const { eliminated, last } = Cup.finishRound(cup, race, now);
    for (const [index, item] of cup.history.entries())
      if (index === cup.history.length - 1) item.rtt = this.rttSamples();
    for (const i of eliminated.slice().reverse()) this.broadcast({ t:"ev", e:"out", i });
    if (this.clip) this.broadcast(this.clip, "screen");
    this.stopLoop();
    this.saveCup();
    this.persist(this.storage.put(`stats:${cup.id}`, cup.history.map(({ round, leg, stats, balloons, rtt }) => ({ round, leg, stats, balloons, rtt }))));
    this.broadcastRoom();
    void last;
    this.schedule();
  }

  /* A Field Day Cup's result goes to the Tournament once its podium has
     played: the Tournament's winner scene takes the TV when the result
     posts. Leaving a finished Cup early (back to the lobby) posts it too. */
  postResultOnce() {
    const cup = this.cup;
    if (!cup?.done || cup.mode !== "fieldday" || !cup.evId || cup.resultQueued) return;
    cup.resultQueued = true;
    this.queueResult();
    this.saveCup();
  }

  /* when this race must end: CAP_MS after its first finisher, never past HARD_CAP_MS */
  capAt() {
    const cup = this.cup, race = this.race;
    const hard = cup.startAt + TIMING.HARD_CAP_MS;
    return race?.firstFinish === null || race?.firstFinish === undefined ? hard
      : Math.min(hard, Math.round(cup.startAt + race.firstFinish * 1000 + TIMING.CAP_MS));
  }

  /* The Drop's instant replay: the last REPLAY_KEEP_MS of snapshot rows
     ride along; on the leg with the falls, REPLAY_AFTER_MS after the moment
     (the first flip at the lip, else the first rider over) the clip around
     it is frozen, and screens get it as { t:"replay", leg, at, k:[[s, rows], ...] }
     when the race ends (and on joining during the cut). Not saved: a
     restarted room just has no replay. */
  recordReplay(at, k) {
    const race = this.race;
    if (!race || !COURSE.zones.some(zone => zone.k === "drop" && zone.s0 > race.grid && zone.s0 < race.finish)) return;
    (this.frames ||= []).push([at, k]);
    while (this.frames.length && this.frames[0][0] < at - REPLAY_KEEP_MS) this.frames.shift();
    const moment = race.dropFlipAt ?? race.overAt;
    if (this.clip || moment === null) return;
    const momentAt = Math.round(this.raceZero + moment * 1000);
    if (at < momentAt + REPLAY_AFTER_MS) return;
    this.clip = { t:"replay", leg:race.leg, at:momentAt, i:race.dropFlipI ?? null,
      k:this.frames.filter(([s]) => s >= momentAt - (REPLAY_MS - REPLAY_AFTER_MS) && s <= momentAt + REPLAY_AFTER_MS) };
  }

  /* round trips this round, per phone: median, worst, count */
  rttSamples() {
    const out = {};
    for (const meta of this.sockets.values()) {
      if (meta.role !== "controller" || !meta.samples?.length) continue;
      const sorted = meta.samples.slice().sort((a, b) => a - b);
      out[meta.device] = { median:sorted[sorted.length >> 1], max:sorted[sorted.length - 1], n:sorted.length };
      meta.samples = [];
    }
    return out;
  }

  /* `me`: a racer's own place, progress, stamina and flags, and for every
     phone the race's order (entrant indexes by current place). A rider out
     on the beach gets { i, out:true, order, of, cut, ball, f }: `ball` is
     the server time their next balloon is ready (null until they drink),
     and `f` carries DRANK once they have. */
  sendMe(at) {
    const race = this.race;
    if (!race) return;
    const order = Cup.placeRiders(race.riders).map(rider => rider.i);
    const place = {};
    order.forEach((i, k) => { place[i] = k + 1; });
    const cut = Cup.cutOf(this.cup);
    for (const [ws, meta] of this.sockets) {
      if (meta.role !== "controller") continue;
      const i = this.entrantIndex(meta.device);
      if (i < 0) continue;
      const rider = riderOf(race, i);
      if (rider) {
        this.send(ws, { t:"me", i, place:place[i], of:race.riders.length, prog:Math.round(progressOf(race, rider) * 10) / 10,
          len:race.len, stam:Math.round(rider.stam * 100) / 100, f:flagsOf(rider, race.t), cut, order }, at);
        continue;
      }
      const spot = this.cup.beach[i];
      if (!spot || !this.cup.out.includes(i)) continue;
      this.send(ws, { t:"me", i, out:true, order, of:race.riders.length, cut, ball:spot.drank ? spot.next : null,
        f:spot.drank ? FLAG.DRANK : 0 }, at);
    }
  }

  /* ---------------------------------------------------------------- phone messages */

  input(i, input) {
    if (!this.race || this.cup.entrants[i]?.kicked) return;
    const phase = this.cup.phase;
    /* thumbs count from the grid on, so a phone held through the countdown
       is right at the gun; strokes only once the race is on */
    if (phase === "race" || (input.t === "hands" && (phase === "grid" || phase === "countdown"))) applyInput(this.race, i, input);
  }

  onDrink(i) {
    const cup = this.cup;
    /* out: the drink on the beach earns the balloons */
    if (cup.beach[i] && !cup.field.includes(i)) {
      if (Cup.beachDrink(cup, i, this.now())) { this.broadcast({ t:"ev", e:"drink", i }); this.saveCup(); this.broadcastRoom(); }
      return;
    }
    if (cup.phase !== "race" || !this.race) return;
    if (applyInput(this.race, i, { t:"drink" })) {
      const events = this.race.events.splice(0);
      for (const event of events) this.broadcast({ t:"ev", ...event });
      this.broadcastRoom();
    }
  }

  onBalloon(i, msg) {
    const at = Number(msg.at);
    if (!Number.isInteger(at)) return;
    const now = this.now();
    if (!Cup.canThrow(this.cup, this.race, i, at, now)) return;
    if (throwBalloon(this.race, i, at)) {
      Cup.noteThrow(this.cup, i, now);
      for (const event of this.race.events.splice(0)) this.broadcast({ t:"ev", ...event });
    }
  }

  onLook(meta, i, msg) {
    const cup = this.cup;
    const entrant = cup.entrants[i];
    const now = this.now();
    if (cup.phase === "lobby") {
      entrant.look = cleanLook(msg.look, { groom:entrant.groom === true, floatieIds:FLOATIE_IDS, seed:meta.device });
    } else if (Cup.canSwap(cup, i, now)) {
      const floatie = FLOATIE_IDS.includes(msg.look?.floatie) ? msg.look.floatie : entrant.look.floatie;
      if (floatie === entrant.look.floatie) return;
      entrant.look = { ...entrant.look, floatie };
      Cup.noteSwap(cup, i);
    } else return;
    this.saveCup();
    this.broadcastRoom();
  }

  onReady(i, msg) {
    if (this.cup.phase !== "lobby") return;
    this.cup.entrants[i].ready = msg.on === true;
    this.saveCup();
    this.broadcastRoom();
  }

  async onFeedback(meta, i, msg) {
    const cup = this.cup;
    if (!cup.done && cup.phase !== "feedback") return;
    const answers = cleanAnswers(msg.answers);
    if (!answers) return;
    const key = `feedback:${cup.id}`;
    const all = (await this.storage.get(key)) || {};
    if (all[meta.device]) return;
    const pid = i >= 0 ? cup.entrants[i]?.pid : null;
    all[meta.device] = { at:this.now(), ...(i >= 0 ? { i } : {}), ...(pid ? { pid } : {}), answers };
    await this.storage.put(key, all);
    if (cup.mode === "fieldday" && pid) this.queue(`feedback:${cup.id}:${pid}`, "/internal/float/feedback", { cupId:cup.id, pid, answers });
    /* everyone here answered: the card is done */
    if (cup.phase === "feedback") {
      const humans = [...this.sockets.values()].filter(item => item.role === "controller" && this.entrantIndex(item.device) >= 0);
      if (humans.length && humans.every(item => all[item.device])) this.toLobby();
    }
  }

  /* ---------------------------------------------------------------- Field Day */

  /* POST /internal/cup from the Tournament (never from the public router):
     { evId, cupId, mode:"fieldday", drinking, startAt, bots, entrants:[rider + pid] } */
  async internalCup(req, url) {
    let body;
    try { body = await req.json(); } catch { return json({ ok:false, error:"bad json" }, 400); }
    const cupId = typeof body?.cupId === "string" && /^[A-Za-z0-9_.:-]{1,64}$/.test(body.cupId) ? body.cupId : null;
    const evId = typeof body?.evId === "string" && body.evId.length <= 64 ? body.evId : null;
    if (!cupId || !evId || !Array.isArray(body.entrants)) return json({ ok:false, error:"cupId, evId and entrants are required" }, 400);
    const room = url.searchParams.get("room");
    if (!this.code) this.code = room && ROOM_ID.test(room) ? room : `fd-${evId}`.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 32);
    /* the same cup again: already reserved or running */
    if (this.cup?.id === cupId && this.cup.mode === "fieldday")
      return json({ ok:true, cupId, room:this.code, phase:this.cup.phase, already:true });
    const cup = this.newCup({ mode:"fieldday", drinking:body.drinking !== false, id:cupId, evId });
    const seen = new Set();
    for (const raw of body.entrants.slice(0, MAX_RIDERS)) {
      const rider = cleanRider(raw, { seed:String(raw?.pid ?? "") });
      if (!rider.pid || seen.has(rider.pid)) continue;
      seen.add(rider.pid);
      cup.entrants.push(Cup.makeEntrant(cup, rider, { device:null }));
    }
    const fill = Math.max(0, Math.min(MAX_RIDERS, Number(body.bots) | 0) - cup.entrants.length);
    if (fill) Cup.addBots(cup, fill, seedOf(cupId));
    const now = this.now();
    const startAt = Number(body.startAt);
    cup.startPlanned = Number.isFinite(startAt) && startAt > now + TIMING.START_SOON_MS ? startAt : now + TIMING.START_SOON_MS;
    /* phones already here with a player id take their entrants */
    for (const meta of this.sockets.values()) if (meta.role === "controller" && meta.rider?.pid) this.claim(meta);
    this.saveCup();
    this.broadcastRoom();
    this.schedule();
    return json({ ok:true, cupId, room:this.code, startAt:cup.startPlanned, entrants:cup.entrants.length });
  }

  /* the result, once, to the Tournament: real players only, in order */
  queueResult() {
    const cup = this.cup;
    const order = cup.final.filter(i => cup.entrants[i]?.pid && !cup.entrants[i].bot).map(i => cup.entrants[i].pid);
    const name = i => cup.entrants[i]?.pid || cup.entrants[i]?.name || String(i);
    const rounds = cup.history.map(item => ({
      round:item.round, leg:COURSE.legs[item.leg]?.id, field:item.field.map(name), out:item.out.map(name),
      results:item.results.map(result => ({ who:name(result.i), pid:cup.entrants[result.i]?.pid ?? null, bot:cup.entrants[result.i]?.bot === true,
        place:result.place, time:result.time, drinkAt:result.drinkAt, arriveAt:result.arriveAt })),
    }));
    /* how much of their races a bot paddled for each rider (0 to 1), over the Cup */
    const paddled = {};
    for (const item of cup.history)
      for (const [i, value] of Object.entries(item.stats)) {
        const who = (paddled[name(Number(i))] ||= { ticks:0, botTicks:0 });
        who.ticks += value.ticks || 0;
        who.botTicks += value.botTicks || 0;
      }
    const stats = { rounds:cup.history.map(item => ({ round:item.round, leg:COURSE.legs[item.leg]?.id,
      riders:Object.fromEntries(Object.entries(item.stats).map(([i, value]) => [name(Number(i)), value])),
      balloons:Object.fromEntries(Object.entries(item.balloons || {}).map(([i, value]) => [name(Number(i)), value])),
      rtt:item.rtt || {} })),
      botShare:Object.fromEntries(Object.entries(paddled).map(([who, value]) => [who, Cup.botShareOf(value)])) };
    this.queue(`result:${cup.id}`, "/internal/float/result", { evId:cup.evId, cupId:cup.id, order, rounds, stats });
  }

  queue(id, path, body) {
    if (this.outbox.some(item => item.id === id)) return;
    const now = this.now();
    this.outbox.push({ id, path, body, tries:0, nextAt:now, firstAt:now, done:false });
    this.saveOutbox();
    this.flushOutbox();
    this.schedule();
  }

  /* post what is due; failures back off (1 s, 5 s, 30 s, 2 min, 10 min, then
     hourly) and give up after a day. A sent item stays, marked done, so the
     same cup never posts twice. */
  async flushOutbox() {
    if (this.flushing) return this.flushing;
    const due = this.outbox.filter(item => !item.done && !item.failed && item.nextAt <= this.now());
    if (!due.length) return;
    this.flushing = (async () => {
      for (const item of due) {
        let ok = false;
        try {
          const binding = this.env.TOURNAMENT;
          if (!binding) throw new Error("no TOURNAMENT binding");
          const stub = binding.get(binding.idFromName("main"));
          const response = await stub.fetch(`https://fd.internal${item.path}`, { method:"POST",
            headers:{ "Content-Type":"application/json" }, body:JSON.stringify(item.body) });
          ok = response.ok;
          if (!ok) item.error = `HTTP ${response.status}`;
        } catch (error) {
          item.error = String(error?.message || error).slice(0, 200);
        }
        const now = this.now();
        item.tries += 1;
        if (ok) { item.done = true; item.sentAt = now; delete item.error; }
        else if (now - item.firstAt > RETRY_FOR_MS) item.failed = true;
        else item.nextAt = now + (BACKOFF_MS[item.tries - 1] ?? 3600000);
      }
      /* keep the record small: the last 40 */
      if (this.outbox.length > 40) this.outbox = this.outbox.slice(-40);
      this.saveOutbox();
      this.schedule();
    })();
    try { await this.flushing; } finally { this.flushing = null; }
  }
}

/* The Drop's replay: 10 s, the moment 4 s from its end */
const REPLAY_MS = 10000;
const REPLAY_AFTER_MS = 4000;
const REPLAY_KEEP_MS = 12000;
/* snaps go out on two of every three ticks: 20 Hz from a 30 Hz race */
const SNAP_PER_TICK = SNAP_HZ / SIM_HZ;
