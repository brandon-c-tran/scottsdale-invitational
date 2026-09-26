// Reproduce commissioner races in memory, or on the dedicated 5183 runtime.
// Never targets the usual dev server, the UI audit, staging, or production.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  EMPTY_STATE, BUILTIN_EVENTS, ROSTER, RESET_PROGRESS_CONFIRMATION, defaultQaParticipants,
  draftTurn, resolveCurrentContest, contestUndoAvailability, resolveWager, allEventsOf, computeStandings, bracketChampion,
} from "../shared/core.js";
import { applyAction } from "../worker/actions.js";

const mode = process.argv.includes("--ws") ? "ws" : "memory";
const endpoint = "ws://127.0.0.1:5183/ws";
const actors = { a:{ player:ROSTER[0], isGm:true }, b:{ player:ROSTER[1], isGm:true },
  c:{ player:ROSTER[2], isGm:true }, guest:{ player:ROSTER[12], isGm:false }, tv:{ player:null, isGm:false } };
const event = id => BUILTIN_EVENTS.find(ev => ev.id === id);
const ref = (state, evId) => {
  const contest = resolveCurrentContest(state, event(evId));
  return { contestId:contest.id, contestRevision:contest.revision };
};
const draftRef = state => {
  const { draftId, pickIndex, draftRevision } = draftTurn(state.drafts.bball);
  return { draftId, pickIndex, draftRevision };
};
const trace = [], results = [];
let sequence = 0;
const cleanAck = ack => ({ ok:ack.ok, ...(ack.error ? { error:ack.error } : {}), version:ack.version,
  ...(ack.extra?.unchanged ? { unchanged:true } : {}) });
const record = (actor, type, payload, ack) => { trace.push({ actor, type, payload, ack:cleanAck(ack) }); return ack; };

function memory() {
  let state = structuredClone(EMPTY_STATE), version = 0;
  return { get state() { return state; }, get version() { return version; },
    async reset() { state = structuredClone(EMPTY_STATE); version = 0; },
    async send(actor, type, payload = {}, options = {}) {
      const next = structuredClone(state), ctx = { ...actors[actor], deviceId:`audit-${actor}`,
        actionId:options.actionId || `audit-${++sequence}`, progressReset:true, showControl:true };
      const ack = applyAction(next, type, payload, ctx);
      if (ack.ok && !ack.extra?.unchanged) { state = next; version++; }
      return record(actor, type, payload, { ...ack, version });
    },
    stateFor() { return state; }, async sync() {}, async close() {},
  };
}

async function websocket() {
  const clients = [];
  function connect(name) {
    const ws = new WebSocket(endpoint), pending = new Map();
    const client = { name, ws, deviceId:`commissioner-audit-${name}-${crypto.randomUUID()}`, token:null,
      state:null, version:-1, snapshots:[], environment:null, capabilities:{},
      send(type, payload = {}, options = {}) {
        const actionId = options.actionId || `audit-${++sequence}`;
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => { pending.delete(actionId); reject(new Error(`${name}: ${type} timed out`)); }, 5000);
          pending.set(actionId, { resolve, timer });
          ws.send(JSON.stringify({ type, payload, actionId, deviceId:client.deviceId, gmToken:client.token }));
        });
      },
      async waitVersion(version) {
        const deadline = Date.now() + 5000;
        while (client.version < version) {
          if (Date.now() > deadline) throw new Error(`${name} did not receive version ${version}; current ${client.version}`);
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      },
    };
    const opened = new Promise((resolve, reject) => {
      ws.onopen = () => { ws.send(JSON.stringify({ type:"hello", deviceId:client.deviceId })); resolve(); };
      ws.onerror = () => reject(new Error(`Cannot connect isolated audit socket ${name}`));
    });
    ws.onmessage = ({ data }) => {
      const message = JSON.parse(data);
      if (message.type === "state") {
        client.snapshots.push({ version:message.version, action:message.lastAction });
        if (message.version >= client.version) {
          client.state = message.state; client.version = message.version;
          client.environment = message.environment; client.capabilities = message.capabilities;
        }
      } else if (message.type === "ack") {
        const request = pending.get(message.actionId);
        if (request) { pending.delete(message.actionId); clearTimeout(request.timer); request.resolve(message); }
      }
    };
    clients.push(client);
    return { client, opened };
  }
  const connections = ["a", "b", "c", "guest", "tv"].map(connect);
  await Promise.all(connections.map(({ opened }) => opened));
  await Promise.all(clients.map(client => client.waitVersion(0)));
  for (const client of clients) {
    assert.equal(client.environment, "local", "This script requires the dedicated local environment");
    assert.equal(client.capabilities.progressReset, true);
    if (client.name === "tv") continue;
    assert.equal((await client.send("claim", { player:actors[client.name].player })).ok, true);
    if (actors[client.name].isGm) {
      const unlock = await client.send("gmUnlock", { pin:"2468" });
      assert.equal(unlock.ok, true, "Test-only commissioner unlock must succeed");
      client.token = unlock.extra.gmToken;
    }
  }
  const byName = Object.fromEntries(clients.map(client => [client.name, client]));
  return { get state() { return byName.a.state; }, get version() { return byName.a.version; },
    stateFor(actor) { return byName[actor].state; },
    async send(actor, type, payload = {}, options = {}) {
      return record(actor, type, payload, await byName[actor].send(type, payload, options));
    },
    async reset() {
      const result = await byName.a.send("resetTournament", { confirm:RESET_PROGRESS_CONFIRMATION });
      assert.equal(result.ok, true, result.error); await this.sync(result.version);
      assert.equal(this.state.live, false); assert.equal(this.state.onDeck, null);
    },
    async sync(version = Math.max(...clients.map(client => client.version))) {
      await Promise.all(clients.map(client => client.waitVersion(version)));
      for (const client of clients) {
        assert.equal(client.version, byName.a.version, `${client.name} version converges`);
        assert.deepEqual(client.state, byName.a.state, `${client.name}, including TV, sees the same state`);
      }
    },
    async close() { clients.forEach(client => client.ws.close()); },
  };
}

const api = mode === "ws" ? await websocket() : memory();
async function send(actor, type, payload = {}, options) {
  const ack = await api.send(actor, type, payload, options);
  if (ack.version !== undefined) await api.sync(ack.version);
  return ack;
}
async function good(actor, type, payload = {}, options) {
  const ack = await send(actor, type, payload, options);
  assert.equal(ack.ok, true, `${type}: ${ack.error}`); return ack;
}
async function race(commands) {
  const acks = await Promise.all(commands.map(([actor, type, payload, options]) => api.send(actor, type, payload, options)));
  await api.sync(Math.max(...acks.map(ack => ack.version ?? api.version)));
  return acks;
}
async function check(id, title, run) {
  await api.reset(); const start = trace.length;
  try {
    const details = await run();
    results.push({ id, title, status:"verified", ...details, trace:trace.slice(start) });
    console.log(`${id} ${details?.finding ? "FINDING" : "PASS"}: ${title}`);
  } catch (error) {
    results.push({ id, title, status:"audit-failed", error:error.message, trace:trace.slice(start) });
    console.error(`${id} AUDIT FAILED: ${error.message}`);
  }
}
async function open(evId = "putt") {
  const ev = event(evId);
  return good("a", ev.teamCfg ? "announceAndDraw" : "announceEvent",
    { evId, ...(ev.teamCfg ? { players:defaultQaParticipants(ev) } : {}) });
}
async function resultReady() {
  await open(); await good("a", "lockAndStart", { evId:"putt", ...ref(api.state, "putt") });
  await good("a", "beginResultEntry", { evId:"putt" });
}
async function firstResult() { await resultReady(); await good("a", "saveResult", { evId:"putt", slots:[[ROSTER[3]]] }); }
async function draft() {
  const ev = event("bball"), players = defaultQaParticipants(ev);
  await good("a", "startDraft", { evId:ev.id, players, captains:players.slice(0, 4) });
}
async function table() { await good("a", "pokerSetup"); await good("a", "pokerStart"); }
async function playAllMarkets(evId) {
  let played = 0, current;
  while ((current = resolveCurrentContest(api.state, event(evId)))) {
    assert.ok(played < 20 && current.kind !== "ffa", "Finite sequenced competition");
    const side = current.sides.find(side => side.players.includes(ROSTER[12])) || current.sides[0];
    const wager = { eventId:evId, stake:100, ...ref(api.state, evId),
      ...(current.kind === "match" ? { kind:"match", match:current.match, teamIdx:side.key, drawId:current.drawId }
        : { kind:current.kind === "heat" ? "heat" : "stage", group:current.group,
          final:current.kind === "stage-final", stagesId:current.stagesId, pickKey:side.key,
          ...(current.drawId ? { drawId:current.drawId } : {}) }) };
    const placed = await good("guest", "placeWager", { wager });
    const ticketId = placed.extra.wagerId;
    assert.ok(ticketId, "The acknowledgement identifies the ticket just placed");
    await good("abc"[played % 3], "lockAndStart", { evId, ...ref(api.state, evId) });
    const qualifiers = current.kind === "heat" ? [side.key, ...current.sides.filter(item => item.key !== side.key)
      .slice(0, api.state.stages[evId].advance - 1).map(item => item.key)] : undefined;
    await good("abc"[(played + 1) % 3], "recordContestWinner", { evId, ...ref(api.state, evId), winner:side.key,
      ...(qualifiers ? { qualifiers } : {}) });
    const settled = resolveWager(api.state, api.state.wagers.find(ticket => ticket.id === ticketId), allEventsOf(api.state));
    assert.equal(settled.status, "won"); assert.equal(settled.delta, 100); played++;
  }
  const st = api.state.stages[evId], draw = api.state.draws[evId];
  const winners = st ? st.entrantType === "team" ? draw.teams[st.finalWinner].players : [st.finalWinner]
    : draw.teams[bracketChampion(api.state.brackets[evId])].players;
  await good("c", "saveResult", { evId, slots:[winners] });
  assert.equal(api.state.results[evId].revision, 1);
  const tickets = api.state.wagers.filter(ticket => ticket.eventId === evId);
  assert.equal(tickets.length, played);
  assert.ok(tickets.every(ticket => resolveWager(api.state, ticket, allEventsOf(api.state)).status === "won"));
  return { played, settledWinningTickets:played, winners };
}

try {
  await check("C01", "Three commissioners announce the same market from one snapshot", async () => {
    const old = ref(api.state, "putt");
    const acks = await race(["a", "b", "c"].map(actor => [actor, "announceEvent", { evId:"putt", ...old }]));
    assert.equal(acks.filter(ack => ack.ok).length, 1);
    assert.equal(api.state.onDeck, "putt"); assert.equal(ref(api.state, "putt").contestRevision, 1);
    return { accepted:1, rejected:2, errors:acks.filter(ack => !ack.ok).map(ack => ack.error) };
  });
  await check("C02", "Different simultaneous announcements keep one current market", async () => {
    const acks = await race(["putt", "nine", "ragecage"].map((evId, index) => ["abc"[index], "announceEvent", { evId }]));
    assert.equal(acks.filter(ack => ack.ok).length, 1);
    assert.equal(Object.values(api.state.eventOps).filter(op => op.contest?.phase === "betting-open").length, 1);
    return { accepted:1, current:api.state.onDeck };
  });
  await check("C03", "Three lock/start taps only start the current matchup once", async () => {
    await open("bball"); const payload = { evId:"bball", ...ref(api.state, "bball") }, before = api.version;
    const acks = await race(["a", "b", "c"].map(actor => [actor, "lockAndStart", payload]));
    assert.ok(acks.every(ack => ack.ok)); assert.equal(acks.filter(ack => ack.extra?.unchanged).length, 2);
    assert.equal(api.version, before + 1); assert.equal(api.state.onDeck, null);
    return { accepted:3, writes:1 };
  });
  await check("C04", "A chip racing the lock is either kept before lock or rejected", async () => {
    await open(); const current = ref(api.state, "putt");
    const wager = { kind:"outright", eventId:"putt", pick:ROSTER[3], stake:100, ...current };
    const acks = await race([["guest", "placeWager", { wager }], ["b", "lockAndStart", { evId:"putt", ...current }]]);
    assert.equal(acks[1].ok, true); assert.equal(api.state.wagers.length, acks[0].ok ? 1 : 0);
    const late = await send("guest", "placeWager", { wager });
    assert.equal(late.ok, false); assert.equal(api.state.onDeck, null);
    return { racingChipAccepted:acks[0].ok, lateChipError:late.error };
  });
  await check("C05", "Competing matchup winners cannot skip or overwrite the next matchup", async () => {
    await open("bball"); await good("a", "lockAndStart", { evId:"bball", ...ref(api.state, "bball") });
    const current = resolveCurrentContest(api.state, event("bball"));
    const commands = ["a", "b", "c"].map((actor, index) => [actor, "recordContestWinner",
      { evId:"bball", ...ref(api.state, "bball"), winner:current.sides[index % 2].key }, { actionId:`winner-${++sequence}` }]);
    const acks = await race(commands), winnerIndex = acks.findIndex(ack => ack.ok);
    assert.equal(acks.filter(ack => ack.ok).length, 1);
    const next = resolveCurrentContest(api.state, event("bball"));
    assert.equal(next.revision, current.revision + 1); assert.notEqual(next.id, current.id);
    const before = structuredClone(api.state), [actor, type, payload, options] = commands[winnerIndex];
    assert.equal((await good(actor, type, payload, options)).extra.unchanged, true);
    assert.deepEqual(api.state, before);
    return { accepted:1, rejected:2, nextRevision:next.revision };
  });
  await check("C06", "Two corrections of the previous matchup restore it only once", async () => {
    await open("bball"); await good("a", "lockAndStart", { evId:"bball", ...ref(api.state, "bball") });
    const current = resolveCurrentContest(api.state, event("bball"));
    await good("a", "recordContestWinner", { evId:"bball", ...ref(api.state, "bball"), winner:current.sides[0].key });
    const undo = contestUndoAvailability(api.state, event("bball"));
    const acks = await race(["a", "b", "c"].map(actor => [actor, "undoLastContest",
      { evId:"bball", contestId:undo.contestId, contestRevision:undo.contestRevision }]));
    assert.equal(acks.filter(ack => ack.ok).length, 1);
    const restored = resolveCurrentContest(api.state, event("bball"));
    assert.equal(restored.id, current.id); assert.equal(restored.phase, "in-progress"); assert.equal(api.state.onDeck, null);
    return { accepted:1, restoredLocked:true };
  });
  await check("C07", "Three commissioners cannot make three draft picks from one turn", async () => {
    await draft(); const draftId = api.state.drafts.bball.id, old = draftRef(api.state), available = [...api.state.drafts.bball.pool];
    const acks = await race(["a", "b", "c"].map((actor, index) => [actor, "pickDraftPlayer",
      { evId:"bball", ...old, player:available[index] }]));
    assert.equal(acks.filter(ack => ack.ok).length, 1); assert.equal(api.state.drafts.bball.picks.length, 1);
    assert.equal(api.state.drafts.bball.id, draftId);
    const undo = { evId:"bball", ...draftRef(api.state) };
    const undos = await race(["a", "b", "c"].map(actor => [actor, "undoDraftPick", undo]));
    assert.equal(undos.filter(ack => ack.ok).length, 1); assert.equal(api.state.drafts.bball.picks.length, 0);
    assert.equal(draftRef(api.state).draftRevision, 2);
    assert.equal((await send("a", "pickDraftPlayer", { evId:"bball", ...old, player:available[0] })).ok, false);
    return { picksAccepted:1, undosAccepted:1, staleAfterUndoRejected:true };
  });
  await check("C08", "Concurrent finalization preserves one exact drafted draw", async () => {
    await draft();
    while (api.state.drafts.bball.pool.length) await good("a", "pickDraftPlayer",
      { evId:"bball", ...draftRef(api.state), player:api.state.drafts.bball.pool[0] });
    const expected = api.state.drafts.bball.teams.map(team => team.players), payload = { evId:"bball", ...draftRef(api.state) };
    const before = api.version, acks = await race(["a", "b", "c"].map(actor => [actor, "finalizeDraft", payload]));
    assert.ok(acks.every(ack => ack.ok)); assert.equal(api.version, before + 1);
    assert.deepEqual(api.state.draws.bball.teams.map(team => team.players), expected);
    assert.equal(api.state.live, false);
    return { accepted:3, writes:1, draftId:payload.draftId, drawId:api.state.draws.bball.id };
  });
  await check("C09", "Conflicting first official results require an explicit correction", async () => {
    await resultReady();
    const acks = await race(["a", "b", "c"].map((actor, index) => [actor, "saveResult", { evId:"putt", slots:[[ROSTER[index + 3]]] }]));
    assert.equal(acks.filter(ack => ack.ok).length, 1); assert.equal(api.state.results.putt.revision, 1);
    return { accepted:1, rejected:2, winner:api.state.results.putt.slots[0] };
  });
  await check("C10", "A stale confirmed correction overwrites a newer result", async () => {
    await firstResult(); const viewedRevision = api.state.results.putt.revision;
    await good("a", "saveResult", { evId:"putt", slots:[[ROSTER[4]]], confirmOverwrite:true, correctionReason:"A corrects the score" });
    const newerWinner = api.state.results.putt.slots[0][0];
    await good("b", "saveResult", { evId:"putt", slots:[[ROSTER[5]]], confirmOverwrite:true, correctionReason:"B confirms from the original result" });
    assert.equal(api.state.results.putt.slots[0][0], ROSTER[5]); assert.equal(api.state.results.putt.revision, 3);
    return { finding:true, severity:"P1", viewedRevision, overwrittenRevision:2, newerWinner,
      finalWinner:ROSTER[5], finalRevision:3, correctionHistory:api.state.eventOps.putt.corrections.length };
  });
  await check("C11", "A stale clear confirmation deletes a newer official result", async () => {
    await firstResult();
    await good("a", "saveResult", { evId:"putt", slots:[[ROSTER[4]]], confirmOverwrite:true, correctionReason:"Verified score" });
    await good("c", "clearResult", { evId:"putt", confirmClear:true, correctionReason:"Clear the original result I reviewed" });
    assert.equal(api.state.results.putt, undefined);
    return { finding:true, severity:"P1", reviewedRevision:1, clearedRevision:2, officialResultMissing:true };
  });
  await check("C12", "Corrections and clear can still change a frozen board", async () => {
    await firstResult(); await good("a", "setFrozen", { f:true });
    await good("b", "saveResult", { evId:"putt", slots:[[ROSTER[4]]], confirmOverwrite:true, correctionReason:"Late correction" });
    const newLeader = computeStandings(api.state)[0].player;
    await good("c", "clearResult", { evId:"putt", confirmClear:true, correctionReason:"Late clear" });
    assert.equal(api.state.frozen, true); assert.equal(api.state.results.putt, undefined);
    return { finding:true, severity:"P2", frozenStayedTrue:true, changedLeader:newLeader, resultThenCleared:true };
  });
  await check("C13", "Three poker setup/start requests do not duplicate the table", async () => {
    let acks = await race(["a", "b", "c"].map(actor => [actor, "pokerSetup", {}]));
    assert.ok(acks.every(ack => ack.ok)); assert.equal(acks.filter(ack => ack.extra?.unchanged).length, 2);
    const version = api.version;
    acks = await race(["a", "b", "c"].map(actor => [actor, "pokerStart", {}]));
    assert.ok(acks.every(ack => ack.ok)); assert.equal(api.version, version + 1);
    return { setupWrites:1, startWrites:1 };
  });
  await check("C14", "Parallel counts for different people preserve all three submissions", async () => {
    await table(); const players = ROSTER.slice(3, 6);
    const acks = await race(["a", "b", "c"].map((actor, index) => [actor, "pokerCount", { player:players[index], count:1000 + index * 25 }]));
    assert.ok(acks.every(ack => ack.ok));
    players.forEach((player, index) => assert.equal(api.state.poker.counts[player], 1000 + index * 25));
    return { counts:players.map(player => ({ player, count:api.state.poker.counts[player] })) };
  });
  await check("C15", "A stale count editor silently replaces another commissioner's count", async () => {
    await table(); const player = ROSTER[3];
    await good("a", "pokerCount", { player, count:1200 });
    await good("b", "pokerCount", { player, count:2200 });
    await good("c", "pokerCount", { player, count:1300 });
    assert.equal(api.state.poker.counts[player], 1300);
    return { finding:true, severity:"P2", player, initiallyViewed:1200, newerCount:2200, staleEditorSaved:1300 };
  });
  await check("C16", "A stale cancel command erases a replacement poker table", async () => {
    await table(); await good("b", "pokerCancel");
    await table(); await good("b", "pokerCount", { player:ROSTER[3], count:2200 });
    await good("a", "pokerCancel");
    assert.equal(api.state.poker, null);
    return { finding:true, severity:"P1", replacementTableWasStarted:true, replacementCountLost:2200, tableNow:null };
  });
  await check("C17", "Three simultaneous final poker posts publish one result", async () => {
    await table();
    for (const player of ROSTER) await good("a", "pokerCount", { player, count:1000 });
    const version = api.version, acks = await race(["a", "b", "c"].map(actor => [actor, "pokerResult", {}]));
    assert.ok(acks.every(ack => ack.ok)); assert.equal(api.version, version + 1);
    assert.equal(api.state.results.poker.revision, 1);
    assert.equal((await send("guest", "pokerCount", { player:ROSTER[12], count:2000 })).ok, false);
    return { accepted:3, writes:1, lateCountRejected:true };
  });
  await check("C18", "A duel play and decline cannot both change the same duel", async () => {
    await open(); await good("a", "sendDuel", { to:ROSTER[12], stake:100 });
    const id = api.state.duels[0].id;
    const acks = await race([["guest", "playDuel", { id, ms:200 }], ["b", "declineDuel", { id }]]);
    assert.equal(acks.filter(ack => ack.ok).length, 1);
    const duel = api.state.duels[0];
    assert.ok(duel.status === "declined" ? !Object.keys(duel.runs).length : !!duel.runs[ROSTER[12]]);
    await good("c", "voidDuel", { id });
    assert.equal((await send("a", "playDuel", { id, ms:150 })).ok, false);
    return { racingActionsAccepted:1, voided:true, playAfterVoidRejected:true };
  });
  await check("C19", "Concurrent wagers and duel antes cannot exceed shared exposure", async () => {
    await open(); const current = ref(api.state, "putt"), player = ROSTER[12];
    const acks = await race([["a", "sendDuel", { to:player, stake:300 }],
      ["b", "sendDuel", { to:player, stake:300 }],
      ["guest", "placeWager", { wager:{ kind:"outright", eventId:"putt", pick:ROSTER[5], stake:300, ...current } }]]);
    assert.equal(acks.filter(ack => ack.ok).length, 1);
    const wagerRisk = api.state.wagers.filter(w => w.player === player).reduce((sum, wager) => sum + wager.stake, 0);
    const anteRisk = api.state.duels.filter(duel => duel.to === player).reduce((sum, duel) => sum + duel.stake, 0);
    assert.equal(wagerRisk + anteRisk, 300);
    return { accepted:1, exposure:300, cap:500 };
  });
  await check("C20", "Guest authority cannot invoke commissioner mutations", async () => {
    for (const [type, payload] of [["announceEvent", { evId:"putt" }], ["pokerSetup", {}],
      ["setFrozen", { f:true }], ["saveResult", { evId:"putt", slots:[[ROSTER[0]]] }],
      ["startDraft", { evId:"bball", players:defaultQaParticipants(event("bball")), captains:ROSTER.slice(0, 4) }]]) {
      const ack = await send("guest", type, payload); assert.equal(ack.ok, false); assert.match(ack.error, /Commissioner only/);
    }
    assert.equal(api.state.live, false); assert.equal(api.state.frozen, false);
    return { rejected:5 };
  });
  await check("C21", "Complete bracket, current-market bets, and final event result converge across roles", async () => {
    await open("bball"); const result = await playAllMarkets("bball");
    assert.equal(result.played, 3); assert.equal(api.state.onDeck, null);
    return { gameFamily:"four-team bracket", ...result };
  });
  await check("C22", "Three two-through heats plus their final settle winner bets correctly", async () => {
    await good("a", "runStages", { evId:"pingpong", cfg:{ kind:"heats", nGroups:3, advance:2, players:[...ROSTER] } });
    assert.equal(api.state.live, false); await open("pingpong");
    const result = await playAllMarkets("pingpong"); assert.equal(result.played, 4);
    assert.ok(api.state.stages.pingpong.groups.every(group => group.through.length === 2 && group.through.includes(group.winner)));
    return { gameFamily:"solo heats and final", ...result };
  });
  await check("C23", "Team pools and their final preserve the full winning teams", async () => {
    await open("spike"); const result = await playAllMarkets("spike");
    assert.equal(result.played, 3); assert.equal(result.winners.length, 2);
    return { gameFamily:"team pools and final", ...result };
  });
  await check("C24", "FFA, direct teams, duel settlement, and earned chips reach the poker champion", async () => {
    await open(); const player = ROSTER[12];
    await good("guest", "placeWager", { wager:{ kind:"outright", eventId:"putt", pick:player, stake:100, ...ref(api.state, "putt") } });
    await good("a", "sendDuel", { to:player, stake:100 });
    const duelId = api.state.duels[0].id;
    await race([["a", "playDuel", { id:duelId, ms:220 }], ["guest", "playDuel", { id:duelId, ms:180 }]]);
    assert.ok(api.state.duels[0].runs[player] && api.state.duels[0].runs[ROSTER[0]]);
    await good("b", "lockAndStart", { evId:"putt", ...ref(api.state, "putt") });
    await good("b", "beginResultEntry", { evId:"putt" });
    await good("c", "saveResult", { evId:"putt", slots:[[player]] });
    const puttBet = api.state.wagers.find(wager => wager.eventId === "putt");
    assert.equal(resolveWager(api.state, puttBet, allEventsOf(api.state)).delta, 200);
    await open("volley"); const winningTeam = api.state.draws.volley.teams[0].players;
    await good("guest", "placeWager", { wager:{ kind:"outright", eventId:"volley", pickTeam:true,
      pickPlayers:winningTeam, drawId:api.state.draws.volley.id, stake:100, ...ref(api.state, "volley") } });
    await good("a", "lockAndStart", { evId:"volley", ...ref(api.state, "volley") });
    await good("a", "beginResultEntry", { evId:"volley" });
    await good("b", "saveResult", { evId:"volley", slots:[winningTeam] });
    const earned = computeStandings(api.state).find(row => row.player === player).pts;
    assert.equal(earned, 1900);
    await table(); assert.equal(api.state.poker.startingStacks[player], earned);
    const total = api.state.poker.total;
    for (const seat of ROSTER.filter(seat => seat !== player)) await good("c", "pokerBust", { player:seat });
    await good("guest", "pokerCount", { player, count:total });
    await good("b", "pokerResult"); await good("a", "setFrozen", { f:true });
    assert.equal(computeStandings(api.state)[0].player, player);
    assert.equal(computeStandings(api.state)[0].pts, total); assert.equal(api.state.frozen, true);
    assert.equal((await send("c", "pokerCancel")).ok, false);
    return { gameFamilies:["FFA", "direct team contest", "Quick Draw", "poker finale"], earnedStartingStack:earned, champion:player, finalStack:total };
  });
  await check("C25", "Guest and unclaimed TV cannot invoke any audited commissioner action", async () => {
    const commands = ["announceEvent", "announceAndDraw", "setOnDeck", "startEvent", "lockAndStart", "recordContestWinner",
      "undoLastContest", "beginResultEntry", "saveResult", "clearResult", "runDraw", "clearDraw", "runStages", "clearStages",
      "startDraft", "undoDraftPick", "finalizeDraft", "cancelDraft", "pokerSetup", "pokerStart", "pokerResult", "pokerCancel",
      "setFrozen", "adjust", "voidDuel", "startShowScene", "advanceShowScene", "endShowScene"];
    for (const actor of ["guest", "tv"]) for (const type of commands) {
      const ack = await send(actor, type, { evId:"putt", id:"putt", isGm:true, player:ROSTER[0] });
      assert.equal(ack.ok, false, `${actor}:${type}`); assert.match(ack.error, /Commissioner only/);
    }
    assert.equal(api.state.live, false);
    return { commissionerActions:commands.length, roles:2, rejections:commands.length * 2 };
  });
  await check("C26", "Unclaimed TV cannot write player data or impersonate a player", async () => {
    const before = structuredClone({ profiles:api.state.profiles, seeds:api.state.seeds });
    for (const [type, payload] of [["saveProfile", { player:ROSTER[0], display:"Impersonated" }],
      ["saveSeeds", { player:ROSTER[0], ratings:{ pool:3 } }], ["sendDuel", { to:ROSTER[1], stake:100 }],
      ["playDuel", { id:"fake", ms:200 }]]) assert.equal((await send("tv", type, payload)).ok, false);
    assert.deepEqual({ profiles:api.state.profiles, seeds:api.state.seeds }, before);
    return { playerActionsRejected:4 };
  });
  await check("C27", "Unclaimed TV receives a player's private ratings and flight response", async () => {
    const player = ROSTER[12];
    await good("guest", "saveSeeds", { player, ratings:{ pool:3, golf:2 } });
    await good("guest", "saveProfile", { player, display:"Audit guest", flightsBooked:true,
      flightIn:{ air:"AA", num:"123", time:"12:00" } });
    const anonymous = api.stateFor("tv");
    assert.deepEqual(anonymous.seeds[player], { pool:3, golf:2 });
    assert.equal(anonymous.profiles[player].flightIn.num, "123");
    return { finding:true, severity:"P1", crossReference:"TV audit public snapshot privacy finding",
      unclaimedConnectionReceived:["seeds[player].pool", "seeds[player].golf", "profiles[player].flightIn", "profiles[player].flightsBooked"] };
  });
} finally {
  await api.close();
  const output = resolve(import.meta.dirname, "..", "docs", `audit-commissioner-concurrency-2026-09-07-${mode}.json`);
  writeFileSync(output, JSON.stringify({ date:new Date().toISOString(), mode, endpoint:mode === "ws" ? endpoint : null,
    passed:results.filter(result => result.status === "verified" && !result.finding).length,
    findings:results.filter(result => result.finding).length,
    errors:results.filter(result => result.status === "audit-failed").length, results }, null, 2));
  console.log(`Evidence: ${output}`);
  if (results.some(result => result.status === "audit-failed")) process.exitCode = 1;
}
