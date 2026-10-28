/* FloatRoom: one Durable Object per Float room (float/GROOVE.md "Judging",
   "What the room sends"; float/PROTOCOL.md "The room", "Field Day"). The
   room is the Groove's only authority: phones send their taps stamped on
   the server clock, the room judges them with its one calibration offset,
   calls the misses, plays the bots and the stand-ins, runs the Cup
   (float/shared/cup.js) and its songs (float/shared/groove.js), and screens
   draw what it sends.

   Sockets: plain ws.accept(), not hibernation. Every client pings every 2 s
   and each pong must carry the server's clock, so an idle lobby would wake
   the object constantly anyway; per-socket state (device, role, rider, round
   trip) is simplest in memory. Nothing that matters lives only in memory:
   the Cup is saved at every phase change and, in a song, every 2 s without
   holding the room's messages (allowUnconfirmed); one alarm (the next phase
   deadline, a scheduled Field Day start, a post to retry, or a song's
   watchdog) brings a restarted room back, and a song in progress carries on
   by the clock (songAt is in the save).

   Timers: a light 100 ms interval runs only while something is played, a
   song or Last Call (bots' and stand-ins' taps, misses, the calibration's
   beat, scores every 4 s, Last Call's totals as they grow, the save every
   2 s); otherwise a single timeout (and the alarm behind it) moves the
   phases on, and a lobby holds no timer at all.

   Driving it without timers (the tests, scripts/float-sim.mjs, the screen's
   and the phone's mocks):
     const room = new FloatRoom(ctx, env, { clock, timers:false });
     await room.ready;
   ctx is { storage:{ get, put, delete, setAlarm, deleteAlarm },
   blockConcurrencyWhile? }, env may be {} (env.TOURNAMENT for Field Day's
   posts), clock is { now }, and options.ids (prefix -> string, optional)
   makes the ids a Cup is seeded by repeatable (a bench, a mock's shots). Sockets are anything with send(text),
   addEventListener("message" | "close" | "error", fn) and close():
   room.attach(ws, url) then room.onMessage(ws, text) for each frame. Call
   room.tick() as often as you like, in ANY phase (every 100 ms is the
   room's own rate): it does whatever is due by clock.now(), phase changes
   included. wake() is tick() plus the outbox and the timers (what the
   alarm runs). room.cup is the Cup (plain JSON). */
import { ROLES, HOST_CMDS, cleanDevice, cleanRider, cleanAnswers, cleanPid, ROOM_ID } from "../shared/protocol.js";
import { cleanLook } from "../shared/looks.js";
import { FLOATIE_IDS } from "../shared/floaties.js";
import { chartOf, lastCallId } from "../shared/chart.js";
import { GROOVE, applyHit, seedOf } from "../shared/groove.js";
import * as Cup from "../shared/cup.js";

const { MAX_RIDERS, CUP_TIMING } = Cup;
/* inputs a socket may send: hits a second, and everything a second */
const HITS_PER_S = 16;
const MESSAGES_PER_S = 60;
/* an out rider's cheers: one in this long */
const CHEER_MS = 300;
/* the screens' round-trip readout */
const DEBUG_MS = 2000;
/* who a stand-in plays is looked at this often in a song */
const DRIVEN_MS = 1000;
/* Last Call's totals go out as they grow, at most this often (who drinks at once) */
const BAR_ROOM_MS = 500;
/* the phases something is played in (a song, a chug-off, Last Call): the
   light timer runs, saves never hold a message */
const PLAYING = new Set(["song", "chugoff", "lastcall"]);
/* what Last Call's totals were when the room last went out: who has tapped (or missed), who drinks */
const barKey = lastCall => lastCall
  ? `${lastCall.totals.filter(row => row.d !== null || row.ms > 0).map(row => row.i).join(",")}:${lastCall.worst ? lastCall.worst.join(",") : "-"}` : "";
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
/* an event as it goes on the wire: { t:"ev", e, i, c?, q?, d? } (its `at` stays in the room) */
const wire = ({ at, ...event }) => ({ t:"ev", ...event });

export class FloatRoom {
  constructor(ctx, env, options = {}) {
    this.ctx = ctx;
    this.env = env || {};
    this.clock = options.clock || realClock;
    this.timers = options.timers !== false;
    /* where new ids come from (a cup's id seeds its bots): random, unless a
       bench or a mock wants the same Cup every time */
    this.ids = typeof options.ids === "function" ? options.ids : randomId;
    this.sockets = new Map();
    this.cup = null;
    this.outbox = [];
    this.loop = null;
    this.timer = null;
    /* when each device last spoke (a phone gone STALE_MS is played by a stand-in) */
    this.heard = new Map();
    this.cheers = new Map();
    this.lastScores = 0;
    this.lastSave = 0;
    this.lastDebug = 0;
    this.lastDrivenAt = 0;
    this.lastDriven = "";
    this.lastBarKey = "";
    this.rtt = {};
    this.code = "";
    this.kickedDevices = new Set();
    this.alarmAt = null;
    /* a device never heard from counts as heard when the room came up, so a
       restarted room gives every phone STALE_MS to come back */
    this.bornAt = this.now();
    const load = () => this.load();
    this.ready = ctx?.blockConcurrencyWhile ? Promise.resolve(ctx.blockConcurrencyWhile(load)) : load();
  }

  now() { return this.clock.now(); }
  get storage() { return this.ctx.storage; }

  /* ---------------------------------------------------------------- storage */

  async load() {
    const [cup, outbox] = await Promise.all([this.storage.get("cup"), this.storage.get("outbox")]);
    if (cup) {
      this.cup = Cup.migrate(cup, this.now());
      /* the parked river's checkpoint is no use to a song */
      if (this.cup !== cup) { this.persist(this.storage.delete("race")); this.saveCup(); }
    }
    this.outbox = Array.isArray(outbox) ? outbox : [];
    if (this.cup) this.code = this.cup.code || "";
    this.restore();
  }

  /* a room that wakes up mid-Cup carries on by the clock: a song from its
     songAt (judged to its last save), anything else from its saved deadline */
  restore() {
    const cup = this.cup;
    if (!cup) return;
    this.bornAt = this.now();
    Cup.playingOf(cup);
    this.schedule();
  }

  /* A Durable Object holds every outgoing message until a write it made is
     on disk (the output gate). In a song the room's saves are only for
     recovery, so they never hold a hit: those writes go unconfirmed (a crash
     loses at most the last 2 s of judgements). A phase change's save is
     confirmed. */
  saveCup(quiet = PLAYING.has(this.cup?.phase)) {
    if (!this.cup) return;
    this.lastSave = this.now();
    this.persist(this.storage.put("cup", this.cup, quiet ? { allowUnconfirmed:true } : undefined));
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
    this.sockets.set(ws, { role:null, device:null, rider:null, seen:this.now(), window:0, count:0, hits:0, chartId:null });
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
    if (now - meta.window >= 1000) { meta.window = now; meta.count = 0; meta.hits = 0; }
    if ((meta.count += 1) > MESSAGES_PER_S) return;
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    if (!msg || typeof msg !== "object") return;
    meta.seen = now;
    if (meta.device) this.heard.set(meta.device, now);
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
    if (msg.t === "hit") {
      if ((meta.hits += 1) > HITS_PER_S) return;
      return this.onHit(i, msg);
    }
    if (msg.t === "drink") return this.onDrink(i);
    if (msg.t === "cheer") return this.onCheer(i);
    if (msg.t === "look") return this.onLook(meta, i, msg);
    if (msg.t === "ready") return this.onReady(i, msg);
  }

  /* hello: a screen, or a controller with its rider. A controller takes back
     its entrant: by Field Day player id first, then by device. In a party
     lobby a new phone gets a new entrant; mid-Cup it watches. */
  onHello(ws, meta, msg) {
    if (!ROLES.includes(msg.role)) return;
    meta.role = msg.role;
    meta.device = cleanDevice(msg.device) || this.ids("d-");
    this.heard.set(meta.device, this.now());
    if (!this.cup) this.newCup();
    let i = -1;
    if (meta.role === "controller") {
      meta.rider = msg.rider ? cleanRider(msg.rider, { seed:meta.device }) : null;
      this.kickedDevices.delete(meta.device);
      i = this.claim(meta);
    }
    this.send(ws, { t:"welcome", you:{ device:meta.device, role:meta.role, ...(i >= 0 ? { entrant:i } : {}) } });
    this.sendRoom(ws, meta);
    if (i >= 0 && this.cup.phase !== "lobby") this.send(ws, { t:"me", ...Cup.meOf(this.cup, i, this.now()) });
    if (meta.role === "controller") this.broadcastRoom(ws);
    this.schedule();
  }

  claim(meta) {
    const cup = this.cup;
    const rider = meta.rider;
    const pid = rider?.pid ? cleanPid(rider.pid) : null;
    let i = pid ? cup.entrants.findIndex(entrant => entrant.pid === pid) : -1;
    if (i < 0) i = this.entrantIndex(meta.device);
    /* a bot's device id is public (room.entrants): a phone never takes a bot */
    if (i >= 0 && cup.entrants[i].bot) return -1;
    if (i >= 0) {
      const entrant = cup.entrants[i];
      entrant.device = meta.device;
      /* the phone's look counts in the lobby */
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
    const now = this.now();
    const rtt = Number(msg.rtt);
    if (meta.device && Number.isFinite(rtt) && rtt >= 0 && rtt < 60000) {
      this.rtt[meta.device] = Math.round(rtt);
      if (meta.role === "controller") (meta.samples ||= []).push(Math.round(rtt));
      if (meta.samples?.length > 400) meta.samples.splice(0, 200);
    }
    this.send(ws, { t:"pong", c:msg.c });
    /* a screen's readout of the phones' round trips; in a song the room's timer sends it */
    if (meta.role === "screen" && !PLAYING.has(this.cup?.phase) && now - (meta.debugAt || 0) >= DEBUG_MS) {
      meta.debugAt = now;
      this.send(ws, { t:"debug", rtt:{ ...this.rtt } });
    }
  }

  /* a controller is live when it has spoken lately (the lamp on its name) */
  live(device, now = this.now()) {
    if (!device) return false;
    for (const meta of this.sockets.values())
      if (meta.role === "controller" && meta.device === device && now - meta.seen < GROOVE.STALE_MS) return true;
    return false;
  }

  /* when a device last spoke: never, counts as when the room came up */
  lastHeard(device) { return (device && this.heard.get(device)) ?? this.bornAt; }

  /* who plays entrant i at time t: a bot entrant, a kicked one, or a stand-in
     for a phone gone STALE_MS (taken back the moment it speaks again) */
  driven(i, t = this.now()) {
    const entrant = this.cup?.entrants[i];
    if (!entrant) return false;
    if (entrant.bot || entrant.kicked === true) return true;
    return t - this.lastHeard(entrant.device) >= GROOVE.STALE_MS;
  }

  /* ---------------------------------------------------------------- the room message */

  /* The room as a socket sees it (float/GROOVE.md "What the room sends"). A
     rider's drinking answer is private (in Field Day only they and the
     commissioner see it): `drinks` goes only to the entrant whose device
     this is (`forDevice`), never to screens or other phones. The chart
     rides separately (sendRoom, broadcastRoom): in full to a socket that
     has not had this song's, else only its id. */
  roomMessage(forDevice = null) {
    const cup = this.cup;
    const now = this.now();
    const entrants = cup.entrants.map((entrant, i) => {
      const item = { device:entrant.device, name:entrant.name, color:entrant.color, look:entrant.look, bot:entrant.bot === true,
        connected:entrant.bot ? true : this.live(entrant.device, now), ready:entrant.ready === true,
        botDriven:this.driven(i, now) };
      if (forDevice && entrant.device === forDevice) item.drinks = entrant.drinks !== false;
      for (const key of ["pid", "photo", "number", "skin", "groom"]) if (entrant[key] !== undefined) item[key] = entrant[key];
      return item;
    });
    const lobby = cup.phase === "lobby";
    const bar = cup.phase === "lastcall";
    /* in Last Call the song is its countdown's chart (lastcall-lights, -slow, -ticks) */
    const song = bar ? cup.bar?.id ?? lastCallId(cup.round) : ["intro", "song", "cut"].includes(cup.phase) ? cup.songId : null;
    const songAt = bar ? cup.bar?.songAt ?? null : song && cup.phase !== "intro" ? cup.songAt : null;
    return {
      t:"room", phase:cup.phase, mode:cup.mode, code:cup.code || this.code, cupId:cup.id, drinking:cup.drinking,
      round:cup.round, rounds:cup.rounds, field:cup.field, out:cup.out,
      startAt:cup.startAt, endsAt:cup.endsAt,
      /* a Field Day Cup's start, while it waits in the lobby */
      startPlanned:lobby && cup.startPlanned ? cup.startPlanned : null,
      cut:lobby ? null : Cup.cutOf(cup),
      /* this is the final round (`final`, below, is the Cup's final order once known) */
      lastRound:!lobby && Cup.isLastRound(cup),
      entrants,
      song, songAt, chartId:song,
      offset:Cup.offsetOf(cup),
      /* Last Call's totals and who drinks, in its phase (else null) */
      lastCall:Cup.lastCallSummary(cup, now),
      /* the chug-off for the spot, in its phase (else null) */
      chugoff:Cup.chugoffSummary(cup),
      /* the cut's show: the song's awards and the beats it lands on (else null) */
      awards:Cup.awardsSummary(cup), show:Cup.cutShowOf(cup),
      scores:Cup.scoresOf(cup, now), results:Cup.resultsOf(cup),
      standings:cup.standings, podium:cup.podium, final:cup.final,
      history:cup.history.map(({ round, song:id, field, results, out }) => ({ round, song:id, field, results, out })),
    };
  }

  /* one socket's copy: its own drinking answer, and the chart if it has not had this song's */
  roomFor(base, meta, k) {
    const message = { ...base };
    if (k >= 0) message.entrants = base.entrants.map((item, j) => j === k ? { ...item, drinks:this.cup.entrants[k].drinks !== false } : item);
    if (base.song && meta.chartId !== base.song) {
      message.chart = chartOf(base.song);
      meta.chartId = base.song;
    }
    return message;
  }

  sendRoom(ws, meta) {
    const k = meta.role === "controller" ? this.entrantIndex(meta.device) : -1;
    this.send(ws, this.roomFor(this.roomMessage(), meta, k));
  }

  /* everyone's room: one text for screens and phones without an entrant that
     have the chart; a rider's phone, or a socket owed the chart, its own */
  broadcastRoom(except = null) {
    if (!this.cup) return;
    const s = this.now();
    this.lastScores = s;
    const base = this.roomMessage();
    this.lastBarKey = barKey(base.lastCall);
    let shared = null;
    this.each(null, (ws, meta) => {
      if (ws === except) return;
      const k = meta.role === "controller" ? this.entrantIndex(meta.device) : -1;
      let text;
      if (k < 0 && (!base.song || meta.chartId === base.song)) text = shared ||= JSON.stringify({ ...base, s });
      else text = JSON.stringify({ ...this.roomFor(base, meta, k), s });
      try { ws.send(text); } catch { /* closing */ }
    });
  }

  /* each rider's phone its own `me` */
  sendMe(i, now = this.now()) {
    if (!this.cup || this.cup.phase === "lobby") return;
    let message = null;
    this.each("controller", (ws, meta) => {
      if (this.entrantIndex(meta.device) !== i) return;
      message ||= { t:"me", ...Cup.meOf(this.cup, i, now) };
      this.send(ws, message, now);
    });
  }
  sendMeAll(now = this.now()) {
    if (!this.cup || this.cup.phase === "lobby") return;
    const seen = new Set();
    this.each("controller", (_, meta) => {
      const i = this.entrantIndex(meta.device);
      if (i >= 0 && !seen.has(i)) { seen.add(i); this.sendMe(i, now); }
    });
  }

  /* the song's events out: every hit, miss and Done to everyone; `me` to the riders they touched */
  sendEvents(events) {
    if (!events?.length) return;
    const now = this.now();
    const touched = new Set();
    for (const event of events) {
      this.broadcast(wire(event));
      if (event.i !== undefined) touched.add(event.i);
    }
    for (const i of touched) this.sendMe(i, now);
  }

  /* ---------------------------------------------------------------- the Cup */

  newCup({ mode = "party", drinking = true, id = this.ids("c-"), evId = null } = {}) {
    this.stopLoop();
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
      if (cup.mode === "fieldday") { cup.mode = "party"; cup.id = this.ids("c-"); }
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
      /* in the lobby the entrant goes; mid-Cup indexes are fixed, so a
         stand-in plays for it instead */
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
    const cup = this.cup;
    const now = this.now();
    /* a planned start keeps its moment when the room is on time */
    const at = cup.startPlanned && now - cup.startPlanned < CUP_TIMING.LATE_MS ? Math.min(now, cup.startPlanned) : now;
    Cup.startCup(cup, at);
    cup.startPlanned = null;
    this.cheers.clear();
    this.saveCup(false);
    this.broadcastRoom();
    this.sendMeAll();
    this.schedule();
  }

  toLobby() {
    this.postResultOnce();
    this.stopLoop();
    Cup.toLobby(this.cup, this.now(), { keepBots:this.cup.mode === "fieldday" && !this.cup.done });
    this.joinWatchers();
    this.saveCup(false);
    this.broadcastRoom();
    this.schedule();
  }

  /* phones that watched the last Cup join the next one */
  joinWatchers() {
    const cup = this.cup;
    if (cup.mode !== "party") return;
    for (const meta of this.sockets.values())
      if (meta.role === "controller" && meta.rider && this.entrantIndex(meta.device) < 0 && !this.kickedDevices.has(meta.device)
        && cup.entrants.length < MAX_RIDERS)
        cup.entrants.push(Cup.makeEntrant(cup, meta.rider, { device:meta.device }));
  }

  /* the next timed thing: a phase's end, a Field Day start, a post to retry */
  schedule() {
    if (!this.cup) return;
    const cup = this.cup;
    const now = this.now();
    const playing = PLAYING.has(cup.phase);
    if (playing) this.startLoop(); else this.stopLoop();
    let next = null;
    const take = at => { if (Number.isFinite(at)) next = next === null ? at : Math.min(next, at); };
    if (cup.phase !== "lobby") take(cup.endsAt);
    if (cup.phase === "lobby" && cup.startPlanned) take(cup.startPlanned);
    for (const item of this.outbox) if (!item.done && !item.failed) take(item.nextAt);
    if (this.timers) {
      if (this.timer !== null) this.clock.clearTimeout(this.timer);
      this.timer = next === null ? null : this.clock.setTimeout(() => { this.timer = null; this.wake(); }, Math.max(0, next - now));
    }
    /* the watchdog: a song checks in every few seconds. Rewritten only when
       it moves by more than a second or is about to fire (each write would
       hold the room's messages), and never holding them in a song */
    let alarm = next;
    if (playing) alarm = Math.min(alarm ?? Infinity, now + 5000);
    const quiet = playing ? { allowUnconfirmed:true } : undefined;
    if (alarm !== null && Number.isFinite(alarm)) {
      const at = Math.max(now + 50, alarm);
      const set = this.alarmAt;
      const stale = set == null || Math.abs(at - set) > 1000 || set - now < 1500;
      if (stale) { this.alarmAt = at; this.persist(this.storage.setAlarm?.(at, quiet)); }
    } else if (this.alarmAt != null) {
      this.alarmAt = null;
      this.persist(this.storage.deleteAlarm?.(quiet));
    }
  }

  async alarm() {
    /* the alarm that woke us is spent: the next schedule writes a fresh one */
    this.alarmAt = null;
    await this.ready;
    this.wake();
    await this.flushOutbox();
    this.schedule();
  }

  /* whatever is due, then the outbox and the timers */
  wake() {
    if (!this.cup) return;
    this.tick();
    this.flushOutbox();
    this.schedule();
  }

  startLoop() {
    if (this.loop !== null || !this.timers) return;
    this.loop = this.clock.setInterval(() => this.tick(), GROOVE.TICK_MS);
  }
  stopLoop() {
    if (this.loop === null) return;
    this.clock.clearInterval(this.loop);
    this.loop = null;
  }

  /* Everything due by now, in any phase: a Field Day start, the song's (or
     Last Call's) taps, misses and Done, phase changes; while something is
     played the room's scores every 4 s, Last Call's totals as they grow,
     the save every 2 s, the stand-ins' lamp and the screens' readout. */
  tick() {
    const cup = this.cup;
    if (!cup) return;
    const now = this.now();
    if (cup.phase === "lobby") {
      if (cup.startPlanned && now >= cup.startPlanned) this.startCup();
      return;
    }
    const out = Cup.tick(cup, now, { driven:(i, t) => this.driven(i, t) });
    this.sendEvents(out.events);
    if (out.phases.length) return this.phaseChanged(out);
    if (out.decided) return this.chugoffSettled(out.decided);
    if (!PLAYING.has(cup.phase)) return;
    if (out.offset || now - this.lastScores >= GROOVE.SCORES_MS || this.lastCallDue(now)) this.broadcastRoom();
    else if (now - this.lastDrivenAt >= DRIVEN_MS) {
      this.lastDrivenAt = now;
      const driven = cup.entrants.map((_, i) => this.driven(i, now) ? 1 : 0).join("");
      if (driven !== this.lastDriven) { this.lastDriven = driven; this.broadcastRoom(); }
    }
    /* the judgements every 2 s, and the watchdog with them */
    if (now - this.lastSave >= GROOVE.SAVE_MS) { this.saveCup(true); this.schedule(); }
    if (now - this.lastDebug >= DEBUG_MS) {
      this.lastDebug = now;
      this.broadcast({ t:"debug", rtt:{ ...this.rtt } }, "screen");
    }
  }

  /* Last Call's totals changed since the room last went out: due now if who
     drinks is known, else at most every BAR_ROOM_MS */
  lastCallDue(now) {
    const summary = Cup.lastCallSummary(this.cup, now);
    if (!summary || barKey(summary) === this.lastBarKey) return false;
    return summary.worst !== null || now - this.lastScores >= BAR_ROOM_MS;
  }

  /* the Cup moved on: the cut's outs, a chug-off settled, who drank at Last
     Call, the result once the podium has played, the lobby's phones; then the
     save, the room, everyone's `me` */
  phaseChanged(out) {
    const cup = this.cup;
    for (const phase of out.phases) {
      if (phase === "cut") {
        const item = cup.history.at(-1);
        if (item) item.rtt = this.rttSamples();
      }
      if (phase === "feedback") this.postResultOnce();
      if (phase === "lobby") { this.stopLoop(); this.joinWatchers(); }
    }
    if (out.phases.includes("cut") || out.lastCall || out.chugoff) this.saveStats();
    /* who went out: the round's worst first, then a chug-off's loser */
    for (const i of out.eliminated.slice().reverse()) this.broadcast({ t:"ev", e:"out", i });
    if (out.decided) this.broadcast({ t:"ev", e:"out", i:out.decided.loser });
    this.saveCup(false);
    this.broadcastRoom();
    this.sendMeAll();
    this.flushOutbox();
    this.schedule();
  }

  /* A chug-off settled (a Done, or its window closed) inside its phase: the
     loser is out; the room, everyone's `me`, the save; the phase is shorter now */
  chugoffSettled(decided) {
    this.broadcast({ t:"ev", e:"out", i:decided.loser });
    this.saveCup(false);
    this.broadcastRoom();
    this.sendMeAll();
    this.schedule();
  }

  /* each round's record, kept in the room's storage too */
  saveStats() {
    const cup = this.cup;
    this.persist(this.storage.put(`stats:${cup.id}`, cup.history.map(({ round, song, offset, samples, stats, rtt, awards, chugoff, lastCall }) =>
      ({ round, song, offset, samples, stats, rtt, awards:awards ?? [], chugoff:chugoff ?? null, lastCall:lastCall ?? null }))));
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

  /* ---------------------------------------------------------------- phone messages */

  /* hit { c, r }: a tap on cue c (a song's, or Last Call's grab), r its raw
     offset (the tap's server time minus the cue's), judged by the room with
     its own offset */
  onHit(i, msg) {
    const cup = this.cup;
    if (!PLAYING.has(cup.phase) || cup.entrants[i]?.kicked) return;
    /* what was due first (a miss called, the offset's beat) */
    this.tick();
    const playing = PLAYING.has(cup.phase) ? Cup.playingOf(cup) : null;
    if (!playing) return;
    const event = applyHit(cup, playing, i, { c:msg.c, r:msg.r }, this.now());
    if (event) this.sendEvents([event]);
  }

  /* drink: a chug-off contender's Done (from the go to the window's close);
     the first keeps the spot */
  onDrink(i) {
    const cup = this.cup;
    if (cup.phase !== "chugoff" || cup.entrants[i]?.kicked) return;
    /* what was due first (a bot's Done, the window's close) */
    this.tick();
    if (cup.phase !== "chugoff") return;
    const done = Cup.chugDone(cup, i, this.now());
    if (!done) return;
    this.sendEvents(done.events);
    if (done.decided) this.chugoffSettled(done.decided);
    else this.broadcastRoom();
  }

  /* cheer: a rider out of the Cup cheers from the bank; at a chug-off everyone but the two */
  onCheer(i) {
    const cup = this.cup;
    /* the crowd at a chug-off: everyone but the two racing */
    const crowd = cup.phase === "chugoff" && cup.chugoff && i !== cup.chugoff.a && i !== cup.chugoff.b;
    if (!crowd && (!cup.out.includes(i) || !["song", "cut", "podium"].includes(cup.phase))) return;
    const now = this.now();
    if (now - (this.cheers.get(i) ?? -Infinity) < CHEER_MS) return;
    this.cheers.set(i, now);
    this.broadcast({ t:"ev", e:"cheer", i });
  }

  /* the look changes in the lobby (the floatie is the tube's design now) */
  onLook(meta, i, msg) {
    const cup = this.cup;
    if (cup.phase !== "lobby") return;
    const entrant = cup.entrants[i];
    entrant.look = cleanLook(msg.look, { groom:entrant.groom === true, floatieIds:FLOATIE_IDS, seed:meta.device });
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
    cup.startPlanned = Number.isFinite(startAt) && startAt > now + CUP_TIMING.START_SOON_MS ? startAt : now + CUP_TIMING.START_SOON_MS;
    /* phones already here with a player id take their entrants */
    for (const meta of this.sockets.values()) if (meta.role === "controller" && meta.rider?.pid) this.claim(meta);
    this.saveCup(false);
    this.broadcastRoom();
    this.schedule();
    return json({ ok:true, cupId, room:this.code, startAt:cup.startPlanned, entrants:cup.entrants.length });
  }

  /* The result, once, to the Tournament: real players only, in order.
     { evId, cupId, order:[pid, ...], rounds:[{ round, song, field, out,
     results:[{ who, pid, bot, place, pct, pts, perfects, misses, cup, grade, out }] }],
     stats:{ rounds:[{ round, song, offset, samples, riders:{ [who]:{ pct,
     pts, perfects, nice, ok, early, late, misses, hits, botShare, doneMs } },
     awards:[{ id, who, value }], rtt, chugoff:{ a, b, winner, loser, by,
     doneAt:{ [who]: ms after the go } } or null, lastCall:{ trick,
     worst:[who], excused:[who], totals:{ [who]: ms }, taps:{ [who]: d or
     null } } or null }],
     botShare:{ [who]: 0 to 1 } } } */
  queueResult() {
    const cup = this.cup;
    const order = cup.final.filter(i => cup.entrants[i]?.pid && !cup.entrants[i].bot).map(i => cup.entrants[i].pid);
    const name = i => cup.entrants[i]?.pid || cup.entrants[i]?.name || String(i);
    const rounds = cup.history.map(item => ({
      round:item.round, song:item.song, field:item.field.map(name), out:item.out.map(name),
      results:item.results.map(result => ({ who:name(result.i), pid:cup.entrants[result.i]?.pid ?? null, bot:cup.entrants[result.i]?.bot === true,
        place:result.place, pct:result.pct, pts:result.pts, perfects:result.perfects, misses:result.misses, cup:result.cup,
        grade:result.grade ?? null, out:result.out === true })),
    }));
    /* how much of their songs a bot or stand-in played for each rider (0 to 1), over the Cup */
    const played = {};
    for (const item of cup.history)
      for (const [i, value] of Object.entries(item.stats || {})) {
        const who = (played[name(Number(i))] ||= { rounds:0, share:0 });
        who.rounds += 1;
        who.share += value.botShare || 0;
      }
    const stats = { rounds:cup.history.map(item => ({ round:item.round, song:item.song, offset:item.offset, samples:item.samples,
      riders:Object.fromEntries(Object.entries(item.stats || {}).map(([i, value]) => [name(Number(i)), value])),
      rtt:item.rtt || {},
      awards:(item.awards || []).map(award => ({ id:award.id, who:name(award.i), value:award.value })),
      /* the chug-off for this round's spot */
      chugoff:item.chugoff ? { a:name(item.chugoff.a), b:name(item.chugoff.b), winner:name(item.chugoff.winner),
        loser:name(item.chugoff.loser), by:item.chugoff.by,
        doneAt:Object.fromEntries(Object.entries(item.chugoff.doneAt || {}).map(([i, ms]) => [name(Number(i)), ms])) } : null,
      /* who drank at the Last Call after this round */
      lastCall:item.lastCall ? { trick:item.lastCall.trick ?? null, worst:item.lastCall.worst.map(name),
        excused:(item.lastCall.excused || []).map(name),
        totals:Object.fromEntries(item.lastCall.totals.map(row => [name(row.i), row.ms])),
        taps:Object.fromEntries(item.lastCall.totals.map(row => [name(row.i), row.d ?? null])) } : null })),
      botShare:Object.fromEntries(Object.entries(played).map(([who, value]) =>
        [who, value.rounds ? Math.round((value.share / value.rounds) * 100) / 100 : 0])) };
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
