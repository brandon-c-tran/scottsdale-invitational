import test, { mock } from "node:test";
import assert from "node:assert/strict";

/* Transport fixes: per-viewer projection, device binding, the separate wager
   ledger key, ack-before-broadcast, returning guests, build ids, liveness and
   uncertain dispatches. Everything runs in memory: no socket leaves the
   process and no remote environment is touched.

   The build id is a define in real builds; here a global stands in for it
   before any module that reads it is loaded, so client and Worker agree. */
globalThis.__FD_BUILD_ID__ = "build-test";

/* Client module globals, installed before the client connects at import. */
const reloads = [];
const listeners = { window:{}, document:{} };
const storageArea = () => {
  const values = new Map();
  return {
    values,
    getItem:key => values.has(key) ? values.get(key) : null,
    setItem:(key, value) => values.set(key, String(value)),
    removeItem:key => values.delete(key),
  };
};
class FakeWebSocket {
  static instances = [];
  constructor(url) { this.url = url; this.readyState = 0; this.sent = []; FakeWebSocket.instances.push(this); }
  send(frame) { this.sent.push(JSON.parse(frame)); }
  close() { const was = this.readyState; this.readyState = 3; if (was !== 3) this.onclose?.(); }
  open() { this.readyState = 1; this.onopen?.(); }
  receive(message) { this.onmessage?.({ data:JSON.stringify(message) }); }
}
mock.timers.enable({ apis:["setTimeout", "setInterval", "Date"], now:1_800_000_000_000 });
globalThis.window = {
  location:{ pathname:"/", search:"", protocol:"http:", host:"test.local", reload() { reloads.push(Date.now()); } },
  addEventListener(type, fn) { (listeners.window[type] ||= []).push(fn); },
};
globalThis.location = globalThis.window.location;
globalThis.document = {
  hidden:false,
  addEventListener(type, fn) { (listeners.document[type] ||= []).push(fn); },
};
globalThis.localStorage = storageArea();
globalThis.sessionStorage = storageArea();
globalThis.WebSocket = FakeWebSocket;

const core = await import("../shared/core.js");
const {
  AWARDS, BUILTIN_EVENTS, CHIP_COLORS, CHIP_SKINS, EMPTY_STATE, PT, RATINGS, ROSTER, SPORTS,
  bracketChampion, contestBetEligibility, defaultQaParticipants, resolveCurrentContest,
  resolveEventLifecycle, resolveSlot, stageEntrantView, stageFinalists,
} = core;
const { applyAction, confirmStart } = await import("./support/confirmed-start.mjs");
const { Tournament } = await import("../worker/tournament.js");
const { publicState, createStateSerializer } = await import("../worker/publicState.js");
const { splitStoredState, hydrateStoredState } = await import("../worker/state.js");
const { buildSnapshot, validateSnapshot } = await import("../worker/snapshot.js");
const { handleClientError, resetClientErrorLimits } = await import("../worker/clientError.js");
const { checkInComplete } = await import("../shared/checkin.js");
const { BUILD_ID, buildsDiffer } = await import("../shared/build.js");
const { returningAfterClaim, returningFromHello } = await import("../src/features/check-in/returning.js");
const client = await import("../src/lib/client.js");

/* ── Durable Object harness ── */
const memoryContext = () => {
  const entries = new Map();
  const writes = [];
  const sockets = [];
  const storage = {
    async get(key) { return structuredClone(entries.get(key)); },
    async put(key, value) {
      if (typeof key === "object") {
        writes.push(Object.keys(key));
        for (const [entryKey, entryValue] of Object.entries(key)) entries.set(entryKey, structuredClone(entryValue));
      } else {
        writes.push([key]);
        entries.set(key, structuredClone(value));
      }
    },
    async delete(key) { for (const item of Array.isArray(key) ? key : [key]) entries.delete(item); },
    async list({ prefix = "" } = {}) {
      return new Map([...entries].filter(([key]) => key.startsWith(prefix)).map(([k, v]) => [k, structuredClone(v)]));
    },
    async transaction(fn) { return fn(storage); },
  };
  return { entries, writes, sockets, log:[], context:{ blockConcurrencyWhile() {}, getWebSockets:() => sockets, storage } };
};

const serverSocket = memory => {
  let attachment = null;
  const ws = {
    raw:[],
    frames:[],
    send(frame) { ws.raw.push(frame); ws.frames.push(JSON.parse(frame)); memory.log.push([ws, JSON.parse(frame)]); },
    serializeAttachment(value) { attachment = structuredClone(value); },
    deserializeAttachment() { return attachment; },
    close() {},
  };
  memory.sockets.push(ws);
  return ws;
};

const GM_TOKEN = "gm-token-for-transport-tests";
async function tournamentWith(memory) {
  const tournament = new Tournament(memory.context, { APP_ENV:"local" });
  await tournament.hydrateFromStorage();
  tournament.gmToken = GM_TOKEN;
  return tournament;
}
let actionSeq = 0;
const say = (tournament, ws, deviceId, message, { gm = false } = {}) => {
  const actionId = message.actionId || `t${++actionSeq}`;
  return tournament.webSocketMessage(ws, JSON.stringify({
    actionId, ...message, ...(message.type ? { payload:confirmStart(message.type, message.payload) } : {}),
    deviceId, ...(gm ? { gmToken:GM_TOKEN } : {}),
  })).then(() => actionId);
};
const ackFor = (ws, actionId) => ws.frames.find(frame => frame.type === "ack" && frame.actionId === actionId);
const lastState = ws => ws.frames.filter(frame => frame.type === "state").at(-1);

const [HOST, ALEX, BLAKE, CASEY] = ROSTER;
const devices = {
  gm:"device-gm-7f1c2a9e-0000-4000-8000-000000000001",
  alex:"device-alex-7f1c2a9e-0000-4000-8000-000000000002",
  blake:"device-blake-7f1c2a9e-0000-4000-8000-000000000003",
  tv:"device-tv-7f1c2a9e-0000-4000-8000-000000000004",
  guest:"device-guest-7f1c2a9e-0000-4000-8000-000000000005",
  returning:"device-new-browser-7f1c2a9e-0000-4000-8000-000000000006",
};
const flight = { air:"AA", num:"1234", time:"13:05" };
const ratings = Object.fromEntries(SPORTS.map(sport => [sport.id, RATINGS[1].v]));
const putt = BUILTIN_EVENTS.find(event => event.id === "putt");

async function weekendScene() {
  const memory = memoryContext();
  const tournament = await tournamentWith(memory);
  const sockets = {
    gm:serverSocket(memory), alex:serverSocket(memory), blake:serverSocket(memory),
    tv:serverSocket(memory), guest:serverSocket(memory),
  };
  await say(tournament, sockets.gm, devices.gm, { type:"hello", payload:{ nonce:1 } }, { gm:true });
  await say(tournament, sockets.alex, devices.alex, { type:"hello", payload:{ nonce:1 } });
  await say(tournament, sockets.blake, devices.blake, { type:"hello", payload:{ nonce:1 } });
  await say(tournament, sockets.tv, devices.tv, { type:"hello", payload:{ view:"tv", nonce:1 } }, { gm:true });
  await say(tournament, sockets.guest, devices.guest, { type:"hello", payload:{ nonce:1 } });
  await say(tournament, sockets.gm, devices.gm, { type:"claim", payload:{ player:HOST } }, { gm:true });
  await say(tournament, sockets.alex, devices.alex, { type:"claim", payload:{ player:ALEX } });
  await say(tournament, sockets.blake, devices.blake, { type:"claim", payload:{ player:BLAKE } });
  for (const [player, key] of [[ALEX, "alex"], [BLAKE, "blake"]]) {
    await say(tournament, sockets[key], devices[key], { type:"saveProfile", payload:{
      player, display:`${player} Card`, size:"L", flightsBooked:true, flightIn:flight, flightOut:flight } });
    await say(tournament, sockets[key], devices[key], { type:"saveSeeds", payload:{ player, ratings } });
  }
  await say(tournament, sockets.alex, devices.alex, { type:"pickChip",
    payload:{ player:ALEX, color:CHIP_COLORS[0].hex, skin:CHIP_SKINS[0] } });
  await say(tournament, sockets.gm, devices.gm, { type:"announceEvent", payload:{ evId:putt.id } }, { gm:true });
  const contest = resolveCurrentContest(tournament.state, putt);
  const side = contest.sides.find(item => contestBetEligibility(contest, ALEX, item.key));
  const wager = { kind:"outright", eventId:putt.id, contestId:contest.id, contestRevision:contest.revision,
    stake:PT, pick:side.players[0] };
  const wagerAction = await say(tournament, sockets.alex, devices.alex, { type:"placeWager", payload:{ wager } });
  await say(tournament, sockets.gm, devices.gm, { type:"lockAndStart",
    payload:{ evId:putt.id, contestId:contest.id, contestRevision:contest.revision } }, { gm:true });
  return { memory, tournament, sockets, wager, wagerAction };
}

test("every connection receives only its own projection and no device ids", async () => {
  const { tournament, sockets, wagerAction } = await weekendScene();
  assert.equal(ackFor(sockets.alex, wagerAction).ok, true);
  const raw = Object.values(sockets).flatMap(ws => ws.raw);
  assert.ok(raw.length > 20);
  for (const frame of raw) {
    for (const id of Object.values(devices)) assert.equal(frame.includes(id), false, `device id leaked: ${id}`);
    assert.equal(frame.includes("requestKey"), false);
    assert.equal(frame.includes("wagerOps"), false);
    assert.equal(frame.includes("contestCommands"), false);
    assert.equal(frame.includes("draftCommands"), false);
  }
  /* the stored authority still has everything the actions need */
  assert.ok(Object.keys(tournament.state.wagerOps).length > 0);
  assert.ok(Object.keys(tournament.state.eventOps[putt.id].contestCommands || {}).length > 0);

  const guest = lastState(sockets.guest), tv = lastState(sockets.tv);
  const alex = lastState(sockets.alex), gm = lastState(sockets.gm);
  for (const view of [guest, tv]) {
    assert.equal(view.you, null);
    assert.deepEqual(view.state.seeds, {});
    for (const player of [ALEX, BLAKE]) {
      assert.equal(view.state.profiles[player].display, `${player} Card`);
      for (const field of ["size", "flightIn", "flightOut", "flightsBooked"])
        assert.equal(field in view.state.profiles[player], false, `${field} public`);
    }
  }
  assert.equal(alex.you, ALEX);
  assert.deepEqual(Object.keys(alex.state.seeds), [ALEX]);
  assert.equal(alex.state.profiles[ALEX].size, "L");
  assert.deepEqual(alex.state.profiles[ALEX].flightIn, flight);
  assert.equal("size" in alex.state.profiles[BLAKE], false);
  assert.equal(alex.state.profiles[ALEX].color, CHIP_COLORS[0].hex);
  assert.equal(gm.you, HOST);
  assert.deepEqual(Object.keys(gm.state.seeds).sort(), [ALEX, BLAKE].sort());
  assert.equal(gm.state.profiles[BLAKE].size, "L");
  /* chips keep what the board draws */
  for (const view of [guest, alex, gm]) {
    const chips = view.state.wagers.flatMap(wager => wager.chips || []);
    assert.ok(chips.length > 0);
    for (const chip of chips) assert.deepEqual(Object.keys(chip).sort(), ["stake", "ts"]);
  }
  /* public logistics and every frame's build/boot */
  assert.ok(guest.state.logistics.hostIn?.time);
  for (const view of [guest, tv, alex, gm]) {
    assert.equal(view.build, BUILD_ID);
    assert.equal(view.boot, tournament.bootId);
  }
  /* the projection and the per-viewer serializer agree */
  const serialize = createStateSerializer(tournament.state);
  assert.deepEqual(JSON.parse(serialize({ isGm:false, player:ALEX })), publicState(tournament.state, { player:ALEX }));
  assert.deepEqual(publicState(tournament.state, { isGm:true }).seeds, tournament.state.seeds);
  assert.equal(tournament.state.wagers[0].chips[0].requestKey.includes(devices.alex), true);
});

test("the actor's ack goes out before the broadcast to everyone else", async () => {
  const { memory, sockets, wagerAction } = await weekendScene();
  const at = (socket, match) => memory.log.findIndex(([ws, frame]) => ws === socket && match(frame));
  const actorState = at(sockets.alex, frame => frame.type === "state" && frame.applied?.includes(wagerAction));
  const ack = at(sockets.alex, frame => frame.type === "ack" && frame.actionId === wagerAction);
  const others = [sockets.gm, sockets.blake, sockets.tv, sockets.guest].map(socket =>
    at(socket, frame => frame.type === "state" && frame.lastAction === "placeWager"));
  /* the actor sees its own board first, so a resolved dispatch has its state */
  assert.ok(actorState >= 0 && ack > actorState);
  for (const index of others) assert.ok(index > ack, "broadcast follows the ack");
  assert.equal(sockets.alex.frames.filter(frame => frame.type === "state"
    && frame.lastAction === "placeWager").length, 1, "the actor is not sent the board twice");
  assert.equal(lastState(sockets.blake).applied.includes(wagerAction), false);
});

test("a socket stays bound to the device that said hello", async () => {
  const { tournament, sockets, memory } = await weekendScene();
  const before = structuredClone(tournament.state);
  const version = tournament.version;
  const frames = sockets.alex.frames.length;
  /* Blake's device id sent over Alex's socket is refused, not re-bound */
  const spoof = await say(tournament, sockets.alex, devices.blake, { type:"saveProfile",
    payload:{ player:BLAKE, display:"Spoofed" } });
  assert.equal(ackFor(sockets.alex, spoof).ok, false);
  assert.match(ackFor(sockets.alex, spoof).error, /another device/);
  await say(tournament, sockets.alex, devices.blake, { type:"hello", payload:{ nonce:9 } });
  assert.equal(sockets.alex.frames.length, frames + 1, "only the refusal ack");
  assert.deepEqual(tournament.state, before);
  assert.equal(tournament.version, version);
  /* the binding survives hibernation: a new instance reads the attachment */
  const revived = await tournamentWith(memory);
  const again = await say(revived, sockets.alex, devices.blake, { type:"saveProfile",
    payload:{ player:BLAKE, display:"Spoofed" } });
  assert.equal(ackFor(sockets.alex, again).ok, false);
  /* a later message without a device id still acts as the bound device */
  const own = await revived.webSocketMessage(sockets.alex, JSON.stringify({ actionId:"no-id",
    type:"saveProfile", payload:{ player:ALEX, display:"Alex Two" } })).then(() => "no-id");
  assert.equal(ackFor(sockets.alex, own).ok, true);
  assert.equal(revived.state.profiles[ALEX].display, "Alex Two");
});

test("a returning guest in a cleared browser claims straight to Home", async () => {
  const { memory, tournament } = await weekendScene();
  /* cleared localStorage: a brand new device id and no check-in marker */
  const fresh = serverSocket(memory);
  await say(tournament, fresh, devices.returning, { type:"hello", payload:{ nonce:1 } });
  assert.equal(lastState(fresh).you, null);
  assert.deepEqual(lastState(fresh).state.seeds, {});
  const claim = await say(tournament, fresh, devices.returning, { type:"claim", payload:{ player:ALEX } });
  const ack = ackFor(fresh, claim);
  assert.equal(ack.ok, true);
  assert.equal(ack.extra.checkedIn, true);
  /* the refreshed view (own ratings) lands before the ack */
  const ackIndex = fresh.frames.indexOf(ack);
  const view = fresh.frames.slice(0, ackIndex).filter(frame => frame.type === "state").at(-1);
  assert.equal(view.you, ALEX);
  assert.deepEqual(view.state.seeds[ALEX], ratings);
  assert.equal(returningAfterClaim({ localMarker:null, result:ack }), true);
  /* replay ("") and an epoch rerun ("yes") are deliberate: never skipped */
  assert.equal(returningAfterClaim({ localMarker:"", result:ack }), false);
  assert.equal(returningAfterClaim({ localMarker:"yes", result:ack }), false);

  /* Blake never picked a chip color: check-in continues */
  const other = serverSocket(memory);
  await say(tournament, other, "device-blake-new-browser-00000000000000", { type:"hello" });
  const blakeClaim = await say(tournament, other, "device-blake-new-browser-00000000000000",
    { type:"claim", payload:{ player:BLAKE } });
  assert.equal(ackFor(other, blakeClaim).extra.checkedIn, false);
  assert.equal(returningAfterClaim({ localMarker:null, result:ackFor(other, blakeClaim) }), false);

  /* a hello on a device the server already knows, marker cleared */
  const reopened = serverSocket(memory);
  await say(tournament, reopened, devices.returning, { type:"hello", payload:{ nonce:2 } });
  const hello = lastState(reopened);
  assert.equal(hello.hello, 2);
  const input = { localMarker:null, step:0, you:hello.you, state:hello.state };
  assert.equal(returningFromHello(input), ALEX);
  assert.equal(returningFromHello({ ...input, step:-1 }), null, "the install gate still comes first");
  assert.equal(returningFromHello({ ...input, step:3 }), null);
  assert.equal(returningFromHello({ ...input, localMarker:"" }), null);
  assert.equal(checkInComplete(hello.state, BLAKE), false);
});

test("the wager ledger lives under its own key and retries survive a restart", async () => {
  const { memory, tournament, sockets, wager, wagerAction } = await weekendScene();
  const storedState = memory.entries.get("state");
  assert.equal("wagerOps" in storedState, false);
  assert.ok(Object.keys(memory.entries.get("wagerOps")).length >= 1);
  assert.deepEqual(memory.entries.get("wagerOps"), tournament.state.wagerOps);
  /* unchanged ledgers are not rewritten */
  const lastWrite = memory.writes.at(-1);
  assert.equal(lastWrite.includes("wagerOps"), false, "lockAndStart left the ledger alone");

  const revived = await tournamentWith(memory);
  assert.deepEqual(revived.state.wagerOps, tournament.state.wagerOps);
  const stake = revived.state.wagers[0].stake;
  const version = revived.version;
  await say(revived, sockets.alex, devices.alex, { actionId:wagerAction, type:"placeWager", payload:{ wager } });
  const retry = sockets.alex.frames.filter(frame => frame.type === "ack" && frame.actionId === wagerAction).at(-1);
  assert.equal(retry.ok, true);
  assert.equal(retry.extra.unchanged, true);
  assert.equal(revived.state.wagers[0].stake, stake);
  assert.equal(revived.version, version);
});

test("a state that still embeds its ledger migrates on the next write", async () => {
  const memory = memoryContext();
  const legacyOps = { "request:legacy-device:a1":{ actor:ALEX, type:"place", fingerprint:"[]", at:5 } };
  memory.entries.set("state", { ...structuredClone(EMPTY_STATE), wagerOps:legacyOps });
  memory.entries.set("version", 4);
  memory.entries.set("claims", {});
  const tournament = await tournamentWith(memory);
  assert.deepEqual(tournament.state.wagerOps, legacyOps);
  const next = structuredClone(tournament.state);
  next.frozen = true;
  await tournament.persistAndBroadcast("setFrozen", next);
  assert.equal("wagerOps" in memory.entries.get("state"), false);
  assert.deepEqual(memory.entries.get("wagerOps"), legacyOps);
  assert.deepEqual(memory.writes.at(-1).sort(), ["state", "version", "wagerOps"].sort());

  /* a rolled-back build may have written newer embedded records: keep both */
  const merged = hydrateStoredState({ ...structuredClone(EMPTY_STATE), wagerOps:{ b:{ at:2 } } }, { a:{ at:1 } });
  assert.deepEqual(Object.keys(merged.wagerOps).sort(), ["a", "b"]);
  const capped = hydrateStoredState(EMPTY_STATE, Object.fromEntries(
    Array.from({ length:2100 }, (_, index) => [`k${index}`, { at:index }])));
  assert.equal(Object.keys(capped.wagerOps).length, 2048);
  assert.equal("k0" in capped.wagerOps, false);
});

test("snapshots carry the ledger key and restore it", async () => {
  const { tournament } = await weekendScene();
  const snapshot = await tournament.createSnapshot();
  assert.ok(snapshot.entries.some(entry => entry.key === "wagerOps"));
  assert.equal("wagerOps" in snapshot.entries.find(entry => entry.key === "state").value, false);
  const checked = validateSnapshot(snapshot);
  assert.equal(checked.ok, true, checked.errors.join(", "));

  const broken = structuredClone(snapshot);
  broken.entries.find(entry => entry.key === "wagerOps").value = [];
  assert.match(validateSnapshot(broken).errors.join(" "), /Wager ledger/);

  const target = await tournamentWith(memoryContext());
  await target.restoreValidatedSnapshot(snapshot, checked);
  assert.deepEqual(target.state.wagerOps, tournament.state.wagerOps);
  assert.deepEqual(target.state.wagers, tournament.state.wagers);

  /* a fresh object that never wrote exports its in-memory state split */
  const fresh = new Tournament(memoryContext().context, { APP_ENV:"local" });
  fresh.state = structuredClone(tournament.state);
  fresh.version = 3;
  fresh.claims = {};
  const exported = await fresh.createSnapshot();
  assert.equal("wagerOps" in exported.entries.find(entry => entry.key === "state").value, false);
  assert.deepEqual(exported.entries.find(entry => entry.key === "wagerOps").value, tournament.state.wagerOps);

  /* an old snapshot with an embedded ledger still validates and restores */
  const legacy = buildSnapshot(new Map([
    ["state", { ...structuredClone(EMPTY_STATE), wagerOps:{ "request:x:y":{ at:1 } } }],
    ["version", 2], ["claims", {}],
  ]), { environment:"local", applicationVersion:"test" });
  const legacyChecked = validateSnapshot(legacy);
  assert.equal(legacyChecked.ok, true);
  const restored = await tournamentWith(memoryContext());
  await restored.restoreValidatedSnapshot(legacy, legacyChecked);
  assert.deepEqual(Object.keys(restored.state.wagerOps), ["request:x:y"]);
});

test("a busy weekend keeps every stored value well under the 2 MB limit", t => {
  let seed = 7;
  t.mock.method(Math, "random", () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 2 ** 32; });
  const gm = { isGm:true, player:HOST, showControl:true };
  const deviceFor = Object.fromEntries(ROSTER.map((player, index) =>
    [player, `rehearsal-device-${index}-7f1c2a9e-0000-4000-8000-00000000000${index % 10}`]));
  let aid = 0;
  const state = structuredClone(EMPTY_STATE);
  const act = (type, payload = {}, ctx = gm) => {
    const result = applyAction(state, type, payload,
      { ...ctx, deviceId:ctx.deviceId || "rehearsal-gm-device", actionId:`r${++aid}` });
    if (!result.ok) throw new Error(`${type}: ${result.error}`);
    return result;
  };
  const tryAct = (type, payload, ctx) => applyAction(state, type, payload, { ...ctx, actionId:`r${++aid}` });
  for (const player of ROSTER) act("saveProfile", { player, display:`${player} Longname`,
    num:10 + ROSTER.indexOf(player), size:"L", flightsBooked:true, flightIn:flight, flightOut:flight });
  const configure = event => {
    if (event.teamCfg) {
      const players = defaultQaParticipants(event, ROSTER);
      const chosen = new Set(players);
      act("runDraw", { evId:event.id, players,
        roles:ROSTER.filter(player => !chosen.has(player)).map(player => ({ player, role:"scorekeeper" })) });
    }
    if (["pingpong", "bball1", "beerio"].includes(event.id))
      act("runStages", { evId:event.id, cfg:{ kind:"heats", nGroups:3, advance:1, players:[...ROSTER] } });
    else if (event.id === "spike") act("runStages", { evId:event.id, cfg:{ kind:"pools", nGroups:2, advance:1 } });
  };
  const wagerFor = (event, contest, side) => {
    const base = { eventId:event.id, contestId:contest.id, contestRevision:contest.revision, stake:PT };
    if (contest.kind === "match") return { ...base, kind:"match", drawId:contest.drawId, match:[...contest.match],
      matchName:contest.label, teamIdx:side.key, pickPlayers:side.players, pickTeam:true, pick:"x" };
    if (contest.kind === "ffa") return side.players.length > 1
      ? { ...base, kind:"outright", pickTeam:true, pickPlayers:side.players, drawId:contest.drawId, pick:"t" }
      : { ...base, kind:"outright", pick:side.players[0] };
    if (contest.kind === "heat") return { ...base, kind:"heat", stagesId:contest.stagesId, group:contest.group,
      groupName:contest.label, pickKey:side.key, pick:"x" };
    return { ...base, kind:"stage", final:true, stagesId:contest.stagesId, pickKey:side.key, pick:"x" };
  };
  const bets = event => {
    const contest = resolveCurrentContest(state, event);
    if (!contest || contest.phase !== "betting-open") return;
    for (const player of ROSTER) {
      const sides = contest.sides.filter(side => contestBetEligibility(contest, player, side.key));
      if (!sides.length) continue;
      const side = sides[ROSTER.indexOf(player) % sides.length];
      const ctx = { player, deviceId:deviceFor[player] };
      for (let tap = 0; tap < 3; tap++) tryAct("placeWager", { wager:wagerFor(event, contest, side) }, ctx);
      const placed = tryAct("placeWager", { wager:wagerFor(event, contest, side) }, ctx);
      if (placed.ok) tryAct("retractWager", { id:placed.extra.wagerId, contestId:contest.id,
        contestRevision:contest.revision }, ctx);
    }
  };
  for (const event of BUILTIN_EVENTS.filter(item => !item.finale)) {
    configure(event);
    act("announceEvent", { evId:event.id });
    bets(event);
    const ref = () => { const c = resolveCurrentContest(state, event); return { contestId:c.id, contestRevision:c.revision }; };
    act("lockAndStart", { evId:event.id, ...ref() });
    let contest, guard = 0;
    while ((contest = resolveCurrentContest(state, event)) && contest.kind !== "ffa" && guard++ < 40) {
      if (contest.phase === "betting-open") { bets(event); act("lockAndStart", { evId:event.id, ...ref() }); }
      const qualifiers = contest.kind === "heat"
        ? contest.sides.slice(0, state.stages[event.id].advance).map(side => side.key) : undefined;
      act("recordContestWinner", { evId:event.id, winner:contest.sides[0].key, ...ref(),
        ...(qualifiers ? { qualifiers } : {}) });
    }
    if (resolveEventLifecycle(state, event).phase !== "result-entry") act("beginResultEntry", { evId:event.id });
    const wanted = Math.max(1, (AWARDS[event.value] || [0]).filter(value => value > 0).length);
    const stages = state.stages[event.id], draw = state.draws[event.id], bracket = state.brackets[event.id];
    let slots;
    if (stages) {
      const finalists = stageFinalists(stages);
      slots = [stages.finalWinner, ...finalists.filter(key => key !== stages.finalWinner)].slice(0, wanted)
        .map(key => [...stageEntrantView(state, stages, key).players]);
    } else if (draw && bracket) {
      const champion = bracketChampion(bracket);
      const final = bracket.rounds.at(-1)[0];
      const sides = [resolveSlot(bracket, final.a), resolveSlot(bracket, final.b)];
      slots = [champion, sides.find(side => side !== champion), ...draw.teams.map((_, index) => index)]
        .filter((value, index, all) => value != null && all.indexOf(value) === index)
        .slice(0, wanted).map(index => [...draw.teams[index].players]);
    } else if (draw) slots = draw.teams.slice(0, wanted).map(team => [...team.players]);
    else slots = ROSTER.slice(0, wanted).map(player => [player]);
    act("saveResult", { evId:event.id, slots });
    if (state.showControl.active) act("advanceShowScene", { id:state.showControl.active.id });
  }
  for (let index = 0; index < 30; index++)
    act("adjust", { player:ROSTER[index % 13], delta:100, reason:`Ruling number ${index}` });

  const fullBytes = JSON.stringify(state).length;
  const { state:stored, wagerOps } = splitStoredState(state);
  const storedBytes = JSON.stringify(stored).length;
  const ledgerBytes = JSON.stringify(wagerOps).length;
  const publicBytes = JSON.stringify(publicState(state, { player:ALEX })).length;
  t.diagnostic(`bytes: full ${fullBytes}, stored state ${storedBytes}, ledger ${ledgerBytes}, player frame ${publicBytes}`);
  assert.ok(state.wagers.length > 300, `a busy board (${state.wagers.length} wagers)`);
  assert.ok(storedBytes < 1.5 * 1024 * 1024, `state ${storedBytes} bytes`);
  assert.ok(ledgerBytes < 1.5 * 1024 * 1024, `ledger ${ledgerBytes} bytes`);
  assert.ok(storedBytes < fullBytes * 0.7, `split saves space (${storedBytes} of ${fullBytes})`);
  assert.ok(publicBytes < storedBytes, `public ${publicBytes} bytes`);
  const frame = JSON.stringify(publicState(state, { isGm:true }));
  for (const id of Object.values(deviceFor)) assert.equal(frame.includes(id), false);
});

test("an oversized state is logged once a minute", t => {
  const warnings = [];
  t.mock.method(console, "warn", message => warnings.push(JSON.parse(message)));
  const tournament = new Tournament({ blockConcurrencyWhile() {} }, { APP_ENV:"local" });
  const big = { blob:"x".repeat(1.6 * 1024 * 1024) };
  tournament.warnIfLarge(big, "{}");
  tournament.warnIfLarge(big, "{}");
  tournament.warnIfLarge({ small:true }, "{}");
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].event, "state-size");
  assert.ok(warnings[0].stateBytes > 1.5 * 1024 * 1024);
});

test("client error reports are logged, bounded and rate limited", async () => {
  resetClientErrorLimits();
  const logged = [];
  const post = (body, headers = {}) => handleClientError(new Request("https://field.day/api/client-error", {
    method:"POST", headers:{ "Content-Type":"application/json", "CF-Connecting-IP":"10.0.0.1", ...headers },
    body:typeof body === "string" ? body : JSON.stringify(body),
  }), { log:line => logged.push(JSON.parse(line)) });
  const first = await post({ message:"boom", componentStack:"in App", tv:true, stack:"x".repeat(9000) });
  assert.equal(first.status, 204);
  assert.equal(logged[0].message, "boom");
  assert.equal(logged[0].tv, true);
  assert.equal(logged[0].stack.length, 4000);
  assert.equal((await post("{broken")).status, 400);
  assert.equal((await post("x".repeat(20000))).status, 413);
  for (let index = 0; index < 5; index++) await post({ message:`again ${index}` });
  assert.equal((await post({ message:"flood" })).status, 429);
  assert.equal((await post({ message:"other device" }, { "CF-Connecting-IP":"10.0.0.2" })).status, 204);
  const get = await handleClientError(new Request("https://field.day/api/client-error"));
  assert.equal(get.status, 405);
});

test("build ids compare only when both sides know theirs", () => {
  assert.equal(BUILD_ID, "build-test");
  assert.equal(buildsDiffer("a", "b"), true);
  assert.equal(buildsDiffer("a", "a"), false);
  assert.equal(buildsDiffer("dev", "b"), false);
  assert.equal(buildsDiffer("a", undefined), false);
});

/* ── client transport ── */
const snap = () => client.getTournamentSnapshot();
const socketAt = index => FakeWebSocket.instances[index];
const current = () => FakeWebSocket.instances.at(-1);
const stateFrame = (extra = {}) => ({ type:"state", version:1, state:EMPTY_STATE, environment:"local",
  capabilities:{}, build:"build-test", boot:"boot-1", applied:[], you:null, ...extra });
const lastHello = ws => ws.sent.filter(message => message.type === "hello").at(-1);

test("the header is live only after a fresh state lands on an open socket", () => {
  const ws = socketAt(0);
  assert.equal(snap().connected, false);
  ws.open();
  const hello = lastHello(ws);
  assert.equal(hello.payload.view, "app");
  assert.equal(hello.deviceId, client.getDeviceId());
  assert.equal(snap().socketOpen, true);
  assert.equal(snap().connected, false, "open is not enough");
  ws.receive(stateFrame({ hello:hello.payload.nonce, you:ALEX }));
  assert.equal(snap().connected, true);
  assert.equal(snap().ready, true);
  assert.equal(snap().you, ALEX);
  assert.equal(snap().updateReady, false);
});

test("a ping answered keeps the socket; a ping unanswered for 10s replaces it", () => {
  const ws = current();
  mock.timers.tick(25000);
  assert.equal(ws.sent.at(-1).type, "ping");
  ws.receive({ type:"pong" });
  mock.timers.tick(10000);
  assert.equal(current(), ws);
  mock.timers.tick(15000);
  assert.equal(ws.sent.at(-1).type, "ping");
  mock.timers.tick(10000);
  assert.equal(snap().connected, false);
  assert.equal(snap().stale, true);
  mock.timers.tick(500);
  const next = current();
  assert.notEqual(next, ws);
  next.open();
  assert.equal(snap().connected, false, "Reconnecting until a state arrives");
  next.receive(stateFrame({ hello:lastHello(next).payload.nonce }));
  assert.equal(snap().connected, true);
  assert.equal(snap().stale, false);
});

test("coming back to the foreground probes; no state in 2.5s replaces the socket", () => {
  const ws = current();
  document.hidden = true;
  listeners.document.visibilitychange.forEach(fn => fn());
  document.hidden = false;
  listeners.document.visibilitychange.forEach(fn => fn());
  const probe = lastHello(ws);
  mock.timers.tick(1000);
  ws.receive(stateFrame({ hello:probe.payload.nonce }));
  mock.timers.tick(2000);
  assert.equal(current(), ws, "answered in time");

  listeners.window.online.forEach(fn => fn());
  assert.equal(lastHello(ws).payload.nonce, probe.payload.nonce + 1);
  mock.timers.tick(2500);
  assert.equal(ws.readyState, 3, "the silent socket is dropped");
  assert.equal(snap().connected, false);
  mock.timers.tick(500);
  assert.notEqual(current(), ws);
  const next = current();
  next.open();
  const opened = lastHello(next).payload.nonce;
  next.receive(stateFrame({ hello:opened }));
  listeners.window.pageshow.forEach(fn => fn());
  assert.equal(lastHello(next).payload.nonce, opened + 1);
  next.receive(stateFrame({ hello:lastHello(next).payload.nonce }));
  assert.equal(snap().connected, true);
});

test("a dispatch fails at once when its socket closes and settles from the next state", async () => {
  const ws = current();
  const pending = client.dispatch("placeWager", { wager:{} });
  const sent = ws.sent.at(-1);
  assert.equal(sent.type, "placeWager");
  ws.close();
  const result = await pending;
  assert.equal(result.ok, false);
  assert.equal(result.uncertain, true);
  assert.match(result.error, /Connection lost/);
  assert.equal(snap().connected, false);
  mock.timers.tick(500);
  const next = current();
  assert.notEqual(next, ws);
  next.open();
  next.receive(stateFrame({ hello:lastHello(next).payload.nonce, applied:[sent.actionId] }));
  assert.deepEqual(await result.settled, { ok:true, late:true, actionId:sent.actionId });
});

test("a timed-out dispatch checks with a hello and reports what really happened", async () => {
  const ws = current();
  const first = client.dispatch("adjust", { player:ALEX, delta:100 });
  const firstSent = ws.sent.at(-1);
  mock.timers.tick(6000);
  const missing = await first;
  assert.equal(missing.error, "No response, try again");
  assert.equal(missing.uncertain, true);
  const probe = lastHello(ws);
  ws.receive(stateFrame({ hello:probe.payload.nonce, applied:[] }));
  assert.deepEqual(await missing.settled, { ok:false, error:"Not saved, try again", actionId:firstSent.actionId });

  const second = client.dispatch("adjust", { player:ALEX, delta:100 });
  const secondSent = ws.sent.at(-1);
  mock.timers.tick(6000);
  const late = await second;
  ws.receive({ type:"ack", actionId:secondSent.actionId, ok:true, version:9 });
  const settled = await late.settled;
  assert.equal(settled.ok, true);
  assert.equal(settled.late, true);
  ws.receive(stateFrame({ hello:lastHello(ws).payload.nonce }));

  const ordinary = client.dispatch("adjust", { player:ALEX, delta:100 });
  ws.receive({ type:"ack", actionId:ws.sent.at(-1).actionId, ok:true });
  assert.deepEqual(Object.keys(await ordinary).sort(), ["actionId", "ok", "type"].sort());
});

test("a phone with a newer build waiting shows Update ready and reloads on its next foreground", () => {
  const ws = current();
  const device = localStorage.getItem("si-device");
  ws.receive(stateFrame({ build:"build-next" }));
  assert.equal(snap().updateReady, true);
  assert.equal(reloads.length, 0, "never mid-use");
  document.hidden = true;
  listeners.document.visibilitychange.forEach(fn => fn());
  mock.timers.tick(20000);
  document.hidden = false;
  listeners.document.visibilitychange.forEach(fn => fn());
  assert.equal(reloads.length, 0, "a quick glance away does not reload");
  ws.receive(stateFrame({ hello:lastHello(ws).payload.nonce, build:"build-next" }));
  document.hidden = true;
  listeners.document.visibilitychange.forEach(fn => fn());
  mock.timers.tick(31000);
  document.hidden = false;
  listeners.document.visibilitychange.forEach(fn => fn());
  assert.equal(reloads.length, 1);
  assert.equal(localStorage.getItem("si-device"), device, "reload never clears storage");
  assert.equal(sessionStorage.getItem("fd-update-reload"), "build-next|1");
});

test("the TV reloads for a new build once no ceremony is playing", () => {
  const ws = current();
  ws.receive(stateFrame({ build:"build-test" }));
  assert.equal(snap().updateReady, false);
  window.location.pathname = "/tv";
  window.__FD_CEREMONY__ = true;
  const before = reloads.length;
  ws.receive(stateFrame({ build:"build-tv" }));
  assert.equal(snap().updateReady, true);
  mock.timers.tick(5000);
  assert.equal(reloads.length, before, "waits out the ceremony");
  window.__FD_CEREMONY__ = false;
  mock.timers.tick(5000);
  assert.equal(reloads.length, before + 1);
  window.location.pathname = "/";
});

test("C10: the client learns its commissioner view from its own hello and follows a revocation", () => {
  const ws = current();
  if (ws.readyState !== 1) ws.open();
  client.setGmToken("token-c10");
  assert.equal(snap().gm, null, "unknown until the server answers the new token");
  const hello = lastHello(ws);
  ws.receive(stateFrame({ gm:false, hello:hello.payload.nonce - 1 }));
  assert.equal(snap().gm, null, "an older hello was answered for another token");
  ws.receive(stateFrame({ gm:false }));
  assert.equal(snap().gm, null, "a broadcast before the answer says nothing");
  ws.receive(stateFrame({ gm:true, hello:hello.payload.nonce }));
  assert.equal(snap().gm, true);
  ws.receive(stateFrame({ gm:false }));
  assert.equal(snap().gm, false, "a revocation lands on the next frame");
  client.setGmToken(null);
});

test("uploads, sheets and the rest of the transport keep their shapes", () => {
  assert.equal(typeof client.reportClientError, "function");
  assert.equal(typeof client.reloadForUpdate, "function");
  assert.equal(typeof client.useTournament, "function");
  mock.timers.reset();
});

test("a revoked commissioner device loses the commissioner view at once", async () => {
  const { tournament, sockets } = await weekendScene();
  tournament.gmTokens = { second:{ token:"second-commissioner-token", player:BLAKE, createdAt:1 } };
  await tournament.webSocketMessage(sockets.blake, JSON.stringify({
    type:"hello", payload:{ nonce:2 }, deviceId:devices.blake, gmToken:"second-commissioner-token" }));
  assert.deepEqual(Object.keys(lastState(sockets.blake).state.seeds).sort(), [ALEX, BLAKE].sort());
  await say(tournament, sockets.gm, devices.gm, { type:"gmRevoke", payload:{ id:"second" } }, { gm:true });
  assert.deepEqual(Object.keys(lastState(sockets.blake).state.seeds), [BLAKE]);
  assert.deepEqual(Object.keys(lastState(sockets.gm).state.seeds).sort(), [ALEX, BLAKE].sort(), "the revoker keeps the view");
});
