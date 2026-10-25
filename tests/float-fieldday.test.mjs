/* Float in Field Day (float/PROTOCOL.md "Field Day", shared/float.js,
   worker/float.js): the built-in in Beerio Kart's place with Beerio
   standing by, a rider's look, the Cup Lock and start opens and the
   Tournament posts to the room, the room's result through the real result
   writes (idempotent by cupId), its stats and feedback kept privately, the
   pill, QA's solo Float, and /internal/* reachable only server to server. */
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import Module from "node:module";
import { build } from "esbuild";

import {
  BUILTIN_EVENTS, EMPTY_STATE, GAMES, RESET_PROGRESS_CONFIRMATION, ROSTER, allEventsOf, computeStandings,
  presentPlayers, resolveCurrentContest, resolveEventLifecycle,
} from "../shared/core.js";
import {
  FLOAT_EVENT, FLOAT_GROOM, FLOAT_SOLO_BOTS, FLOAT_STANDBY, FLOAT_START_LEAD_MS, cleanFloatFeedback, cleanFloatLook,
  floatBeat, floatCupBody, floatLive, floatLookOf, floatOn, floatPlays, floatRider, floatRoom, floatSlate, floatSlots,
} from "../shared/float.js";
import { CRITTER_IDS, HAT_IDS, defaultLook } from "../float/shared/looks.js";
import { FLOATIE_IDS } from "../float/shared/floaties.js";
import { introScene } from "../src/features/intro/introTiming.js";
import { STEP_SETS } from "../src/features/rules/gameSteps.js";
import { setupTodo } from "../shared/guestSetup.js";
import { parseQaTarget, qaSoloTargets } from "../shared/qa.js";
import { resolveDirector } from "../shared/show.js";
import { directorPill } from "../src/features/director/directorPill.js";
import { hydrateStoredState } from "../worker/state.js";
import { publicState } from "../worker/publicState.js";
import { applyAction } from "./support/confirmed-start.mjs";
import { Tournament } from "../worker/tournament.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const [me, evan, khoa] = ROSTER;
let serial = 0;
const GM = { isGm:true, qa:true, progressReset:true, environment:"local", showControl:false };
const gm = (extra = {}) => ({ ...GM, player:me, deviceId:"gm", actionId:`f${++serial}`, ...extra });
const as = player => ({ isGm:false, player, deviceId:`d-${player}`, actionId:`p${++serial}` });
const ROOM = { internal:"float", isGm:true, auto:true, player:null, deviceId:"float" };
const room = cupId => ({ ...ROOM, actionId:`float:${cupId}:result` });
const act = (state, type, payload, ctx = gm()) => {
  const result = applyAction(state, type, payload, ctx);
  assert.equal(result.ok, true, `${type}: ${result.error}`);
  return result;
};
const refuse = (state, type, payload, ctx = gm()) => {
  const before = JSON.stringify(state);
  const result = applyAction(state, type, payload, ctx);
  assert.equal(result.ok, false, `${type} should be refused`);
  assert.equal(JSON.stringify(state), before, `${type}: a refusal changes nothing`);
  return result;
};
const floatEv = state => allEventsOf(state).find(ev => ev.id === FLOAT_EVENT);
const refs = (state, evId = FLOAT_EVENT) => {
  const contest = resolveCurrentContest(state, allEventsOf(state).find(ev => ev.id === evId));
  return contest ? { contestId:contest.id, contestRevision:contest.revision } : {};
};
/* Float announced, then locked and started: the Cup opens with the capability */
function started({ float = true, state = structuredClone(EMPTY_STATE) } = {}) {
  act(state, "announceEvent", { evId:FLOAT_EVENT });
  act(state, "lockAndStart", { evId:FLOAT_EVENT, ...refs(state) }, gm({ float }));
  return state;
}

/* ── the slate ── */

test("Float is a built-in in Beerio Kart's place: Saturday night, 2400, solo, before Beerio, with its how-to and registry", () => {
  const ev = BUILTIN_EVENTS.find(item => item.id === FLOAT_EVENT);
  assert.deepEqual([ev.n, ev.session, ev.value, ev.kind, ev.game, ev.name], [13, "san", 2400, "solo", "float", "Float"]);
  assert.ok(!ev.teamCfg && !ev.stageCfg && !ev.finale);
  assert.doesNotMatch(ev.desc, /—|!/);
  const ids = BUILTIN_EVENTS.map(item => item.id);
  assert.equal(ids.indexOf("float") + 1, ids.indexOf("beerio"), "Beerio Kart one step later");
  assert.equal(BUILTIN_EVENTS.find(item => item.id === "beerio").n, 14);
  assert.ok(ids.indexOf("beerio") < ids.indexOf("poker"), "the finale stays last");
  assert.ok(GAMES.float.howto.steps.length >= 3 && GAMES.float.howto.win);
  for (const line of [GAMES.float.howto.objective, ...GAMES.float.howto.steps, GAMES.float.howto.win]) assert.doesNotMatch(line, /—|!/);
  assert.equal(introScene(ev), "float");
  assert.ok(STEP_SETS.float);
  assert.equal(floatRoom(FLOAT_EVENT), "fd-float");
  assert.match(floatRoom("Weird Id!"), /^[a-z0-9-]{1,32}$/);
});

test("a fresh server shelves Beerio Kart for Float once; a restore stays restored; a reset of that board shelves it again", () => {
  const fresh = hydrateStoredState(undefined);
  assert.equal(fresh.shelved.beerio, true, "Beerio Kart stands by");
  assert.ok(!fresh.shelved.float);
  assert.equal(fresh.floatSlate, 1);
  /* the commissioner restores Beerio: a reload keeps it restored */
  act(fresh, "shelve", { id:FLOAT_STANDBY, on:false });
  assert.ok(!fresh.shelved.beerio);
  assert.ok(!hydrateStoredState(fresh).shelved.beerio, "restored stays restored");
  /* a game-progress reset of a board that had the default has it again */
  act(fresh, "resetTournament", { confirm:RESET_PROGRESS_CONFIRMATION });
  assert.equal(fresh.shelved.beerio, true);
  assert.equal(fresh.floatSlate, 1);
  /* a board that never had it (every EMPTY_STATE a test builds) is left alone */
  const plain = structuredClone(EMPTY_STATE);
  act(plain, "resetTournament", { confirm:RESET_PROGRESS_CONFIRMATION });
  assert.deepEqual(plain.shelved, {});
  assert.equal(plain.floatSlate, 0);
});

test("the default never shelves a Beerio Kart that has anything on it, nor when Float itself is skipped", () => {
  const played = structuredClone(EMPTY_STATE);
  played.eventOps = { beerio:{ announcedAt:5, bettingOpenedAt:5 } };
  played.onDeck = "beerio";
  const loaded = hydrateStoredState(played);
  assert.ok(!loaded.shelved.beerio);
  assert.equal(loaded.floatSlate, 1, "considered once, never again");
  const bet = { ...structuredClone(EMPTY_STATE), wagers:[{ id:"w1", eventId:"beerio", player:evan, stake:100, status:"pending" }] };
  assert.ok(!hydrateStoredState(bet).shelved.beerio);
  const skipped = { ...structuredClone(EMPTY_STATE), shelved:{ float:true } };
  assert.deepEqual(hydrateStoredState(skipped).shelved, { float:true });
  /* floatSlate is idempotent */
  const once = floatSlate(structuredClone(EMPTY_STATE));
  assert.deepEqual(floatSlate(structuredClone(once)), once);
});

test("a QA rewind of a board with the default puts Beerio Kart back on standby", () => {
  const state = hydrateStoredState(undefined);
  act(state, "shelve", { id:FLOAT_STANDBY, on:false });
  act(state, "qaAdvance", { target:"event:putt:done", seed:3, confirm:RESET_PROGRESS_CONFIRMATION });
  act(state, "qaAdvance", { target:"locker", seed:3, confirm:RESET_PROGRESS_CONFIRMATION });
  assert.equal(state.shelved.beerio, true, "the rewind is a reset");
});

test("a slate saved before Float gets it in Beerio Kart's place, else after Saturday night's last, else before the finale", () => {
  const ids = allEventsOf(structuredClone(EMPTY_STATE)).map(ev => ev.id);
  const before = ids.filter(id => id !== FLOAT_EVENT);
  const stored = (order, extra = {}) => ({ ...structuredClone(EMPTY_STATE), eventOrder:order, ...extra });
  const loaded = hydrateStoredState(stored(before));
  assert.equal(loaded.eventOrder.indexOf("float"), before.indexOf("beerio"));
  assert.equal(loaded.eventOrder.indexOf("beerio"), loaded.eventOrder.indexOf("float") + 1);
  assert.deepEqual(hydrateStoredState(loaded).eventOrder, loaded.eventOrder, "placed once");
  const order = allEventsOf(loaded).map(ev => ev.id);
  assert.ok(order.indexOf("float") < order.indexOf("poker"), "never after the finale");
  /* Beerio left out of the order (skipped when the slate was saved) */
  const noBeerio = before.filter(id => id !== "beerio");
  const night = hydrateStoredState(stored(noBeerio, { shelved:{ beerio:true } })).eventOrder;
  assert.equal(night.indexOf("float"), noBeerio.indexOf("ragecage") + 1, "after the night's last");
  /* no Saturday night event at all: just before the finale */
  const short = ["putt", "die", "poker"];
  assert.deepEqual(hydrateStoredState(stored(short)).eventOrder, ["putt", "die", "karaoke", "float", "poker"],
    "Karaoke after Friday's last, Float before the finale");
  /* skipped, already placed, no saved order: left alone */
  assert.deepEqual(hydrateStoredState(stored(before, { shelved:{ float:true } })).eventOrder, before);
  assert.deepEqual(hydrateStoredState(stored([])).eventOrder, []);
});

/* ── looks ── */

test("a look is made legal for its rider: unknown ids fall back to their default, the crown is the groom's alone", () => {
  assert.equal(FLOAT_GROOM, "Brandon");
  const crown = { critter:"otter", floatie:"shark", hat:"crown", shades:"hearts", pose:"flex" };
  assert.equal(cleanFloatLook(crown, FLOAT_GROOM).hat, "crown");
  assert.equal(cleanFloatLook(crown, evan).hat, "none");
  const junk = cleanFloatLook({ critter:"dragon", floatie:"yacht", hat:"x", shades:7, pose:null }, evan);
  const fallback = defaultLook(evan, FLOATIE_IDS);
  assert.deepEqual(junk, { ...fallback, hat:fallback.hat, shades:fallback.shades });
  assert.ok(CRITTER_IDS.includes(junk.critter) && FLOATIE_IDS.includes(junk.floatie) && HAT_IDS.includes(junk.hat));
  assert.deepEqual(floatLookOf({}, khoa), defaultLook(khoa, FLOATIE_IDS), "no saved look: the rider's default");
});

test("floatLook: a guest saves their own look, legal, public on every card; nobody saves another's", () => {
  const state = structuredClone(EMPTY_STATE);
  const look = { critter:"capybara", floatie:"donut", hat:"crown", shades:"aviators", pose:"chug" };
  const saved = act(state, "floatLook", { look }, as(evan));
  assert.deepEqual(state.profiles[evan].float, { ...look, hat:"none" });
  assert.deepEqual(saved.extra.look, state.profiles[evan].float);
  assert.equal(act(state, "floatLook", { look }, as(evan)).extra.unchanged, true, "the same look again changes nothing");
  assert.equal(refuse(state, "floatLook", { player:khoa, look }, as(evan)).error, "Not your profile");
  assert.equal(refuse(state, "floatLook", { look:"capybara" }, as(evan)).error, "Pick a look");
  act(state, "floatLook", { player:FLOAT_GROOM, look }, gm());
  assert.equal(state.profiles[FLOAT_GROOM].float.hat, "crown", "the groom wears it");
  /* public: every card and the TV draw it */
  const frame = publicState(state, { player:khoa });
  assert.deepEqual(frame.profiles[evan].float, state.profiles[evan].float);
  /* it rides along at a dealt poker table, like any profile answer */
  state.poker = { id:"poker", seats:[...ROSTER], outs:[], counts:{} };
  act(state, "floatLook", { look:{ ...look, pose:"flex" } }, as(evan));
});

test("Home's list asks for a floatie before the weekend, only with Float on", () => {
  const state = structuredClone(EMPTY_STATE);
  state.profiles[evan] = { display:"Evan", color:"#C05B33", photoV:1, venmo:"evan", drinking:true };
  assert.ok(!setupTodo(state, evan).some(item => item.id === "floatie"), "off: nothing new on the list");
  const item = setupTodo(state, evan, { float:true }).find(row => row.id === "floatie");
  assert.deepEqual(item, { id:"floatie", section:"locker", label:"Pick your floatie" });
  state.profiles[evan].float = { critter:"otter", floatie:"donut", hat:"none", shades:"none", pose:"flex" };
  assert.ok(!setupTodo(state, evan, { float:true }).some(row => row.id === "floatie"));
});

test("a rider is their name, chip, photo path, look, the drink rule and the groom's crown", () => {
  const state = structuredClone(EMPTY_STATE);
  state.profiles[me] = { display:"Brandon the Very Long Name", color:"#3B6E9C", skin:"flame", num:23, photoV:7, drinking:true };
  state.profiles[evan] = { display:"Evan", drinking:false, skin:"nope" };
  const brandon = floatRider(state, me);
  assert.deepEqual(brandon, { pid:me, name:"Brandon the Very", color:"#3b6e9c", skin:"flame", number:23,
    photo:"/api/photo/Brandon?v=7", look:defaultLook(me, FLOATIE_IDS), drinks:true, groom:true });
  const e = floatRider(state, evan);
  assert.equal(e.drinks, false, "only a guest who said no skips the drink");
  assert.equal(e.skin, "ticks");
  assert.equal(e.number, ROSTER.indexOf(evan) + 1, "the roster number until one is saved");
  assert.equal(e.photo, null);
  assert.match(e.color, /^#[0-9a-f]{6}$/);
  assert.equal(floatRider(state, khoa).drinks, true, "no answer drinks");
});

/* ── the Cup ── */

test("Lock and start opens the Cup in the same write, only with the float capability", () => {
  const off = started({ float:false });
  assert.equal(off.float, null, "no room: Float is a free-for-all entered by hand");
  assert.equal(resolveEventLifecycle(off, floatEv(off)).phase, "in-progress");

  const before = Date.now();
  const state = started();
  const cup = state.float;
  assert.equal(cup.evId, FLOAT_EVENT);
  assert.equal(cup.room, "fd-float");
  assert.match(cup.cupId, /^[a-z0-9]{6,40}$/);
  assert.deepEqual(cup.players, presentPlayers(state), "every present roster player rides");
  assert.ok(cup.startAt >= before + FLOAT_START_LEAD_MS && cup.startAt <= Date.now() + FLOAT_START_LEAD_MS);
  assert.ok(floatLive(state) && floatOn(state) && floatPlays(state, evan));
  /* a retried Lock and start keeps the same Cup */
  act(state, "lockAndStart", { evId:FLOAT_EVENT, ...refs(state) }, gm({ float:true }));
  assert.equal(state.float.cupId, cup.cupId);
  assert.equal(act(state, "floatStart", { evId:FLOAT_EVENT }, gm({ float:true })).extra.unchanged, true);
  /* the body the Tournament posts */
  const body = floatCupBody(state);
  assert.deepEqual(Object.keys(body).sort(), ["bots", "cupId", "drinking", "entrants", "evId", "mode", "startAt"]);
  assert.deepEqual([body.mode, body.drinking, body.bots, body.evId, body.cupId], ["fieldday", true, 0, FLOAT_EVENT, cup.cupId]);
  assert.deepEqual(body.entrants.map(entrant => entrant.pid), cup.players);
  assert.ok(body.entrants.every(entrant => entrant.look && entrant.color && entrant.name));
  assert.deepEqual(body.entrants.filter(entrant => entrant.groom).map(entrant => entrant.pid), [FLOAT_GROOM]);
  /* a guest cannot start one */
  assert.equal(refuse(state, "floatStart", { evId:FLOAT_EVENT, restart:true }, as(evan)).error, "Commissioner only");
  /* nor anyone without the room */
  assert.equal(refuse(state, "floatStart", { evId:FLOAT_EVENT, restart:true }, gm()).error, "Float is unavailable");
});

test("away and on-the-way players do not ride", () => {
  const state = structuredClone(EMPTY_STATE);
  state.away = { [khoa]:true };
  started({ state });
  assert.ok(!state.float.players.includes(khoa));
  assert.equal(state.float.players.length, ROSTER.length - 1);
});

test("the room's result posts through the real result writes: 1st to 3rd, payouts, once a cup", () => {
  const state = started();
  const { cupId } = state.float;
  const order = [khoa, "bot:3", evan, ROSTER[5], me, khoa];
  assert.deepEqual(floatSlots(order, state), [[khoa], [evan], [ROSTER[5]]], "players only, each once, the first three");
  const posted = act(state, "floatFinish", { evId:FLOAT_EVENT, cupId, order }, room(cupId));
  assert.equal(posted.extra.posted, true);
  assert.deepEqual(state.results.float.slots, [[khoa], [evan], [ROSTER[5]]]);
  assert.equal(resolveEventLifecycle(state, floatEv(state)).phase, "complete");
  const rows = Object.fromEntries(computeStandings(state).map(row => [row.player, row.pts]));
  assert.deepEqual([rows[khoa], rows[evan], rows[ROSTER[5]], rows[me]], [1000 + 2400, 1000 + 1200, 1000 + 600, 1000]);
  assert.equal(state.float.finishedAt > 0, true);
  assert.ok(!floatLive(state), "the TV and the phones leave the river");
  /* the same post again: acknowledged, nothing moves */
  const again = applyAction(state, "floatFinish", { evId:FLOAT_EVENT, cupId, order:[me] }, room(cupId));
  assert.equal(again.ok, true);
  assert.equal(again.extra.unchanged, true);
  assert.deepEqual(state.results.float.slots, [[khoa], [evan], [ROSTER[5]]]);
});

test("the result path is the room's alone; a stale cup, a skipped event or an empty order is refused", () => {
  const state = started();
  const { cupId } = state.float;
  const order = [evan, khoa, me];
  /* a commissioner's socket never carries the room's context */
  assert.equal(refuse(state, "floatFinish", { evId:FLOAT_EVENT, cupId, order }, gm({ float:true })).error, "Commissioner only");
  assert.equal(refuse(state, "floatFinish", { evId:FLOAT_EVENT, cupId, order }, { ...room(cupId), isGm:false }).error,
    "Commissioner only");
  assert.equal(refuse(state, "floatFinish", { evId:FLOAT_EVENT, cupId:"cupnotthisone", order }, room("x")).error, "That cup is over");
  assert.equal(refuse(state, "floatFinish", { evId:FLOAT_EVENT, cupId, order:["bot:1"] }, room(cupId)).error,
    "No rider on the roster finished");
  /* a restart makes a new cup: the old one's result is stale */
  act(state, "floatStart", { evId:FLOAT_EVENT, restart:true }, gm({ float:true }));
  assert.notEqual(state.float.cupId, cupId);
  assert.equal(refuse(state, "floatFinish", { evId:FLOAT_EVENT, cupId, order }, room(cupId)).error, "That cup is over");
});

test("a result entered by hand first stands: the room's later post marks the cup done and changes no result", () => {
  const state = started();
  const { cupId } = state.float;
  act(state, "beginResultEntry", { evId:FLOAT_EVENT });
  assert.ok(floatLive(state), "result entry open: the river still runs on the TV");
  act(state, "saveResult", { evId:FLOAT_EVENT, slots:[[me], [evan], [khoa]] });
  const late = act(state, "floatFinish", { evId:FLOAT_EVENT, cupId, order:[khoa, evan, me] }, room(cupId));
  assert.equal(late.extra.posted, false);
  assert.deepEqual(state.results.float.slots, [[me], [evan], [khoa]]);
  assert.ok(state.float.finishedAt);
});

test("clearing the result, skipping Float, taking it back or a reset ends its Cup", () => {
  const cleared = started();
  act(cleared, "floatFinish", { evId:FLOAT_EVENT, cupId:cleared.float.cupId, order:[evan, khoa, me] }, room(cleared.float.cupId));
  act(cleared, "clearResult", { evId:FLOAT_EVENT, confirmClear:true, correctionReason:"Wrong order" });
  assert.equal(cleared.float, null, "a cleared result is entered by hand");
  assert.equal(floatBeat(cleared, floatEv(cleared), { float:true }), null, "the pill does not restart the race");

  const skipped = started();
  act(skipped, "shelve", { id:FLOAT_EVENT, on:true });
  assert.equal(skipped.float, null);

  const announced = structuredClone(EMPTY_STATE);
  act(announced, "announceEvent", { evId:FLOAT_EVENT });
  announced.float = { evId:FLOAT_EVENT, room:"fd-float", cupId:"cupstale01", players:[me], startAt:1, startedAt:1 };
  act(announced, "takeBackAnnouncement", { evId:FLOAT_EVENT });
  assert.equal(announced.float, null);

  const reset = started();
  act(reset, "resetTournament", { confirm:RESET_PROGRESS_CONFIRMATION });
  assert.equal(reset.float, null);
});

test("a Cup the room never took: the pill says so and starts a new one", () => {
  const state = started();
  const { cupId } = state.float;
  assert.equal(refuse(state, "floatCupFailed", { cupId, error:"x" }, gm()).error, "Commissioner only");
  act(state, "floatCupFailed", { cupId, error:"Room is full" }, { ...ROOM, actionId:`float:${cupId}:failed` });
  assert.deepEqual(state.float.error.text, "Room is full");
  assert.ok(floatLive(state) && !floatOn(state), "still Float's turn, off the TV");
  const beat = floatBeat(state, floatEv(state), { float:true });
  assert.deepEqual([beat.type, beat.label, beat.restart, beat.note], ["float-start", "Start Float again", true, "Didn't start: Room is full"]);
  act(state, "floatStart", { evId:FLOAT_EVENT, restart:true }, gm({ float:true }));
  assert.notEqual(state.float.cupId, cupId);
  assert.equal(state.float.error, undefined);
});

/* ── the pill ── */

test("the pill: Start Float with the room, the result by hand while the Cup runs, Restart in the tray", () => {
  const off = started({ float:false });
  const events = allEventsOf(off);
  assert.equal(resolveDirector(off, events, { float:false }).nextAction.type, "enter-result", "no room: entered by hand");
  const owed = resolveDirector(off, events, { float:true }).nextAction;
  assert.deepEqual([owed.type, owed.label], ["float-start", "Start Float"]);
  assert.deepEqual(directorPill(off, events, resolveDirector(off, events, { float:true }), { me }).run,
    { write:"floatStart", payload:{ evId:FLOAT_EVENT } });

  const live = started();
  const director = resolveDirector(live, allEventsOf(live), { float:true });
  assert.deepEqual([director.nextAction.type, director.nextAction.label], ["float-live", "Enter result"]);
  const pill = directorPill(live, allEventsOf(live), director, { me });
  assert.deepEqual(pill.run, { open:"resultEntry", evId:FLOAT_EVENT });
  assert.ok(pill.lines.includes("Float posts its own result"));
  const restart = pill.extras.find(extra => extra.label === "Restart Float");
  assert.equal(restart.kind, "skip");
  assert.deepEqual(restart.run.payload, { evId:FLOAT_EVENT, restart:true });
  assert.match(restart.run.confirm, /^Float starts over\./);
  for (const text of [...pill.lines, pill.label, restart.label, restart.run.confirm]) assert.doesNotMatch(text, /—|!/);
});

/* ── QA ── */

test("Play solo: Float for the commissioner's own player and the room's bots, only with the room", () => {
  const state = structuredClone(EMPTY_STATE);
  assert.ok(!qaSoloTargets(state).some(item => item.game === "float"), "the sheet offers it only with the capability");
  const target = qaSoloTargets(state, allEventsOf(state), { float:true }).find(item => item.game === "float");
  assert.deepEqual([target.key, target.ready, target.evId], ["solo:float", true, FLOAT_EVENT]);
  assert.equal(parseQaTarget(state, "solo:float").evId, FLOAT_EVENT);
  const without = applyAction(state, "qaAdvance", { target:"solo:float", seed:3 }, gm());
  assert.equal(without.error, "Float is unavailable");
  act(state, "qaAdvance", { target:"solo:float", seed:3 }, gm({ float:true }));
  assert.deepEqual(state.float.players, [me]);
  assert.equal(state.float.solo, true);
  const body = floatCupBody(state);
  assert.equal(body.bots, FLOAT_SOLO_BOTS);
  assert.deepEqual(body.entrants.map(entrant => entrant.pid), [me]);
  /* its result posts the commissioner's player first */
  act(state, "floatFinish", { evId:FLOAT_EVENT, cupId:state.float.cupId, order:[me] }, room(state.float.cupId));
  assert.deepEqual(state.results.float.slots, [[me]]);
});

test("QA jumps play Float as a free-for-all and never open a river, even on a server with the room", () => {
  const state = structuredClone(EMPTY_STATE);
  act(state, "qaAdvance", { target:"event:float:done", seed:5 }, gm({ float:true }));
  assert.ok(state.results.float?.slots?.[0]?.length, "posted like any free-for-all");
  assert.equal(state.float, null, "no Cup was opened");
  act(state, "qaAdvance", { target:"session:san", seed:5, confirm:RESET_PROGRESS_CONFIRMATION }, gm({ float:true }));
  assert.equal(state.float, null);
});

/* ── feedback ── */

test("a feedback card keeps fun 1 to 5, again yes or no and up to 200 characters; anything else is dropped", () => {
  const card = cleanFloatFeedback({ cupId:"cup1", pid:evan, answers:{ fun:4, again:true, better:"  More   rapids​ " } }, 9);
  assert.deepEqual(card, { cupId:"cup1", pid:evan, fun:4, again:true, better:"More rapids", at:9 });
  assert.equal(cleanFloatFeedback({ cupId:"cup1", pid:"Nobody", answers:{ fun:9, again:"yes", better:"x".repeat(400) } }, 1).better.length, 200);
  assert.equal(cleanFloatFeedback({ cupId:"cup1", pid:"Nobody", answers:{ fun:2 } }, 1).pid, null);
  assert.equal(cleanFloatFeedback({ cupId:"cup1", answers:{} }), null, "an empty card");
  assert.equal(cleanFloatFeedback({ answers:{ fun:3 } }), null, "no cup");
  assert.equal(cleanFloatFeedback(null), null);
});

/* ── the Durable Object ── */

const memoryContext = () => {
  const entries = new Map();
  const sockets = [];
  const storage = {
    async get(key) { return structuredClone(entries.get(key)); },
    async put(key, value) {
      if (typeof key === "object") for (const [k, v] of Object.entries(key)) entries.set(k, structuredClone(v));
      else entries.set(key, structuredClone(value));
    },
    async delete(key) { for (const item of Array.isArray(key) ? key : [key]) entries.delete(item); },
    async list({ prefix = "" } = {}) {
      return new Map([...entries].filter(([key]) => key.startsWith(prefix)).map(([k, v]) => [k, structuredClone(v)]));
    },
    async transaction(fn) { return fn(storage); },
    async setAlarm(at) { entries.set("__alarm", at); },
  };
  return { entries, sockets, context:{ blockConcurrencyWhile() {}, getWebSockets:() => sockets, storage } };
};
const socketFor = memory => {
  let attachment = null;
  const ws = { frames:[],
    send(frame) { ws.frames.push(JSON.parse(frame)); },
    serializeAttachment(value) { attachment = structuredClone(value); },
    deserializeAttachment() { return attachment; }, close() {} };
  memory.sockets.push(ws);
  return ws;
};
/* the FLOAT binding: one room per name, every POST /internal/cup recorded */
function fakeFloat(answer = () => ({ status:200, body:{ ok:true } })) {
  const calls = [];
  return { calls, binding:{
    idFromName:name => ({ name }),
    get:id => ({ async fetch(url, init) {
      const body = JSON.parse(init.body);
      calls.push({ room:id.name, url:String(url), method:init.method, body });
      const reply = answer(calls.length, body);
      if (reply.throws) throw new Error(reply.throws);
      return new Response(JSON.stringify(reply.body ?? {}), { status:reply.status ?? 200, headers:{ "Content-Type":"application/json" } });
    } }),
  } };
}
const GM_TOKEN = "gm-token-for-float";
let seq = 0;
async function objectWith({ float = fakeFloat(), env = {}, memory = memoryContext() } = {}) {
  const tournament = new Tournament(memory.context, { APP_ENV:"local", QA_ENABLED:"true", PROGRESS_RESET_ENABLED:"true",
    M2_SHOW_CONTROL_ENABLED:"true", ...(float ? { FLOAT:float.binding } : {}), ...env });
  await tournament.hydrateFromStorage();
  tournament.gmToken = GM_TOKEN;
  const gmSocket = socketFor(memory), guest = socketFor(memory);
  const say = async (ws, deviceId, type, payload = {}, { asGm = false } = {}) => {
    const actionId = `fl${++seq}`;
    await tournament.webSocketMessage(ws, JSON.stringify({ actionId, type, payload, deviceId,
      ...(asGm ? { gmToken:GM_TOKEN } : {}) }));
    return ws.frames.find(frame => frame.type === "ack" && frame.actionId === actionId);
  };
  await say(gmSocket, "device-gm", "hello", {}, { asGm:true });
  await say(gmSocket, "device-gm", "claim", { player:me });
  await say(guest, "device-guest", "hello");
  await say(guest, "device-guest", "claim", { player:evan });
  const asGm = (type, payload) => say(gmSocket, "device-gm", type, payload, { asGm:true });
  const lockStart = async () => {
    assert.equal((await asGm("announceEvent", { evId:FLOAT_EVENT, startWeekend:true })).ok, true);
    const ack = await asGm("lockAndStart", { evId:FLOAT_EVENT, ...refs(tournament.state) });
    assert.equal(ack.ok, true, ack.error);
    await tournament.floatPosting?.work;
  };
  const internal = (path, body) => tournament.fetch(new Request(`https://float.internal${path}`, { method:"POST",
    headers:{ "Content-Type":"application/json" }, body:JSON.stringify(body) }));
  return { memory, tournament, float, gmSocket, guest, say, asGm, lockStart, internal };
}

test("the Tournament: the capability, and Lock and start posts the Cup to its room once, server to server", async () => {
  const plain = await objectWith({ float:null });
  assert.equal(plain.tournament.capabilities.float, undefined, "no binding: not listed");
  const { tournament, float, memory, lockStart, gmSocket } = await objectWith();
  assert.equal(tournament.capabilities.float, true);
  assert.equal(gmSocket.frames.find(frame => frame.type === "state").capabilities.float, true, "the phones learn it");
  await lockStart();
  const cup = tournament.state.float;
  assert.ok(cup?.cupId);
  assert.equal(float.calls.length, 1);
  const [call] = float.calls;
  assert.deepEqual([call.room, call.url, call.method], ["fd-float", "https://float.internal/internal/cup", "POST"]);
  assert.deepEqual(call.body, floatCupBody(tournament.state));
  assert.equal(call.body.entrants.length, presentPlayers(tournament.state).length);
  assert.ok(memory.entries.get(`private:float:cup:${cup.cupId}`)?.sentAt, "kept privately");
  /* later writes, and a woken object, never post it again */
  await tournament.queueFloatCup();
  const woken = new Tournament(memory.context, { APP_ENV:"local", FLOAT:float.binding });
  await woken.hydrateFromStorage();
  await woken.floatPosting?.work;
  assert.equal(float.calls.length, 1);
  assert.ok(![...memory.entries.keys()].some(key => key.startsWith("private:float:") && !key.startsWith("private:float:cup:")));
});

test("a room that does not answer is tried again on the alarm; a room that refuses the Cup tells the commissioner", async () => {
  let down = true;
  const flaky = fakeFloat(n => down ? { throws:"room asleep" } : { status:200, body:{ ok:true } });
  const one = await objectWith({ float:flaky });
  const quiet = console.error;
  console.error = () => {};
  try {
    await one.lockStart();
    assert.equal(flaky.calls.length, 1);
    assert.ok(one.tournament.floatRetryAt > Date.now(), "a retry is set");
    assert.equal(one.memory.entries.get("__alarm"), one.tournament.floatRetryAt, "on the alarm");
    down = false;
    one.tournament.floatRetryAt = Date.now() - 1;
    await one.tournament.alarm();
    assert.equal(flaky.calls.length, 2);
    assert.ok(one.memory.entries.get(`private:float:cup:${one.tournament.state.float.cupId}`)?.sentAt);
    assert.equal(one.tournament.state.float.error, undefined);

    const refusing = fakeFloat(() => ({ status:409, body:{ ok:false, error:"A race is running" } }));
    const two = await objectWith({ float:refusing });
    await two.lockStart();
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(refusing.calls.length, 1, "a refusal is not retried");
    assert.deepEqual(two.tournament.state.float.error.text, "A race is running");
    const pill = resolveDirector(two.tournament.state, allEventsOf(two.tournament.state), { float:true }).nextAction;
    assert.equal(pill.label, "Start Float again");
    /* the commissioner's Start Float again: a new cup, posted at once */
    const restart = await two.asGm("floatStart", { evId:FLOAT_EVENT, restart:true });
    assert.equal(restart.ok, true);
    await two.tournament.floatPosting?.work;
    assert.equal(refusing.calls.length, 2);
    assert.notEqual(refusing.calls[1].body.cupId, refusing.calls[0].body.cupId);
  } finally { console.error = quiet; }
});

test("POST /internal/float/result posts the result once, keeps the stats privately, and answers a stale cup 409", async () => {
  const { tournament, memory, lockStart, internal } = await objectWith();
  await lockStart();
  const { cupId } = tournament.state.float;
  const stats = { rounds:[{ leg:0, riders:{ [evan]:{ time:71.2, flips:1 } } }] };
  const res = await internal("/internal/float/result", { evId:FLOAT_EVENT, cupId, order:[evan, "bot:1", khoa, me],
    rounds:[{ leg:0 }], stats });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok:true, posted:true });
  assert.deepEqual(tournament.state.results.float.slots, [[evan], [khoa], [me]]);
  assert.equal(tournament.state.showControl.active?.kind, "winner", "the winner scene plays, as for any result");
  assert.deepEqual(memory.entries.get(`private:float:stats:${cupId}`).stats, stats);
  const again = await internal("/internal/float/result", { evId:FLOAT_EVENT, cupId, order:[me] });
  assert.equal(again.status, 200);
  assert.equal((await again.json()).unchanged, true);
  const quiet = console.error;
  console.error = () => {};
  try {
    const stale = await internal("/internal/float/result", { evId:FLOAT_EVENT, cupId:"cupotherone", order:[me] });
    assert.equal(stale.status, 409);
    const broken = await internal("/internal/float/result", { evId:FLOAT_EVENT, cupId });
    assert.equal(broken.status, 400);
  } finally { console.error = quiet; }
  /* the private keys never reach a snapshot */
  const snapshot = await tournament.createSnapshot();
  assert.ok(!snapshot.entries.some(entry => entry.key.startsWith("private:")));
  /* the newest twenty cups' stats are kept, never more */
  console.error = () => {};
  try {
    for (let n = 0; n < 21; n++) await internal("/internal/float/result", { evId:FLOAT_EVENT, cupId:`cupold${n}`, order:[me] });
  } finally { console.error = quiet; }
  const kept = [...memory.entries.keys()].filter(key => key.startsWith("private:float:stats:"));
  assert.equal(kept.length, 20);
  assert.ok(!kept.includes(`private:float:stats:${cupId}`) && !kept.includes("private:float:stats:cupold0"), "the oldest go first");
  assert.ok(kept.includes("private:float:stats:cupold20"));
});

test("POST /internal/float/feedback keeps one card a rider a cup; the commissioner reads them, a guest cannot", async () => {
  const { gmSocket, guest, say, asGm, internal, memory } = await objectWith();
  for (const body of [
    { cupId:"cup1", pid:evan, answers:{ fun:3, again:false } },
    { cupId:"cup1", pid:evan, answers:{ fun:5, again:true, better:"Longer river" } },
    { cupId:"cup1", pid:khoa, answers:{ fun:4 } },
  ]) assert.equal((await internal("/internal/float/feedback", body)).status, 200);
  assert.equal((await internal("/internal/float/feedback", { cupId:"cup1", answers:{} })).status, 400);
  const kept = memory.entries.get("private:float:feedback");
  assert.deepEqual(kept.map(card => [card.pid, card.fun]), [[khoa, 4], [evan, 5]], "a retry replaces, newest first");
  const read = await asGm("floatFeedback");
  assert.equal(read.ok, true);
  assert.deepEqual(read.extra.feedback, kept);
  const denied = await say(guest, "device-guest", "floatFeedback");
  assert.equal(denied.ok, false);
  assert.ok(!gmSocket.frames.some(frame => frame.type === "state" && JSON.stringify(frame).includes("Longer river")),
    "never in a frame");
});

/* ── the public router ── */

test("/internal/* is reachable only server to server: the public router hands it to the assets", async () => {
  const compiled = await build({
    stdin:{ contents:`export { default } from "./worker/index.js";`, resolveDir:root, loader:"js" },
    bundle:true, platform:"node", format:"cjs", write:false, logLevel:"silent",
    plugins:[{ name:"router-only", setup(build) {
      build.onResolve({ filter:/(^|[\\/])(tournament|room)\.js$/ }, args => ({ path:args.path, namespace:"stub" }));
      build.onLoad({ filter:/.*/, namespace:"stub" }, () => ({ loader:"js",
        contents:"export class Tournament {} export class FloatRoom {}" }));
    } }],
  });
  const mod = new Module(fileURLToPath(new URL("float-router.cjs", import.meta.url)));
  mod.filename = mod.id; mod.paths = Module._nodeModulePaths(root);
  mod._compile(compiled.outputFiles[0].text, mod.filename);
  const router = mod.exports.default;
  const seen = [];
  const binding = name => ({ idFromName:id => ({ id }), get:() => ({ fetch:async req => { seen.push([name, new URL(req.url).pathname]);
    return new Response(name); } }) });
  const env = { TOURNAMENT:binding("tournament"), FLOAT:binding("float"),
    ASSETS:{ fetch:async req => { seen.push(["assets", new URL(req.url).pathname]); return new Response("assets"); } } };
  for (const path of ["/internal/float/result", "/internal/float/feedback", "/internal/cup", "/float/internal/cup",
    "/api/../internal/float/result"]) {
    seen.length = 0;
    await router.fetch(new Request(`https://fielddayseries.com${path}`, { method:"POST", body:"{}" }), env);
    assert.deepEqual(seen.map(([name]) => name), ["assets"], `${path} goes to the assets`);
  }
  seen.length = 0;
  await router.fetch(new Request("https://fielddayseries.com/float/ws?room=fd-float"), env);
  assert.deepEqual(seen, [["float", "/float/ws"]], "the room's only public door is its socket");
  seen.length = 0;
  await router.fetch(new Request("https://fielddayseries.com/api/photo/Evan"), env);
  assert.deepEqual(seen, [["tournament", "/api/photo/Evan"]]);
});
