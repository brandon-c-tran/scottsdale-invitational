/* D7 "The weekend, kept" and D8 "Table view". Pure models on real states
   reached through the QA fast-forward (the real reducers), then the actual
   components rendered with React external. No transport or storage. */
import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EMPTY_STATE, ROSTER, START, allEventsOf, computeStandings, pokerClock } from "../shared/core.js";
import { applyAction } from "../worker/actions.js";
import { chipHistory } from "../src/features/results/lastCard.js";
import { KEPT_SECTION, keepsakeModel, keepsakeOpen, keptAwards, keptPlates, leadPath } from "../src/features/results/keepsake.js";
import { TICK_SLOP_MS, blindsSize, createWakeLock, mmss, nextTickDelay, tableViewAvailable, tableViewKeepsOpen,
  tableViewModel, tableViewSeat, wakeLockSupported } from "../src/features/poker/tableView.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const load = async (name, contents) => {
  const compiled = await build({
    stdin:{ contents, resolveDir:root, loader:"jsx" },
    bundle:true, platform:"node", format:"cjs", external:["react", "react-dom"],
    loader:{ ".css":"empty" }, write:false, logLevel:"silent",
  });
  const mod = new Module(fileURLToPath(new URL(name, import.meta.url)));
  mod.filename = mod.id;
  mod.paths = Module._nodeModulePaths(root);
  mod._compile(compiled.outputFiles[0].text, mod.filename);
  return mod.exports;
};
const ui = await load("keepsake-table.cjs", `
  export { Keepsake } from "./src/features/results/Keepsake.jsx";
  export { Guide } from "./src/features/weekend/Guide.jsx";
  export { TableView, TableViewEntry } from "./src/features/poker/TableView.jsx";
  export { shareCardImages } from "./src/features/results/cardImage.js";
  export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";
`);

const LOCAL = { isGm:true, qa:true, progressReset:true, environment:"local" };
function reach(target) {
  const state = structuredClone(EMPTY_STATE);
  const result = applyAction(state, "qaAdvance", { target, seed:7 }, LOCAL);
  assert.equal(result.ok, true, `${target}: ${result.error}`);
  return state;
}
const CROWNED = reach("crowned");
const LIVE = reach("poker:live");
/* layout effects are the browser's; the server render only warns about them */
const render = (state, element) => {
  const error = console.error;
  console.error = (...args) => { if (!String(args[0]).includes("useLayoutEffect does nothing on the server")) error(...args); };
  try {
    return renderToStaticMarkup(React.createElement(ui.PlayerIdentityProvider, { profiles:state.profiles }, element));
  } finally { console.error = error; }
};

/* ─────────── D7 ─────────── */

test("the edition section exists only once the board is frozen", () => {
  assert.equal(keepsakeOpen(LIVE), false);
  assert.equal(keepsakeModel(LIVE), null);
  assert.equal(keepsakeOpen(CROWNED), true);
  assert.equal(KEPT_SECTION, "kept");
});

test("one plate per slate event, in order, with its official final order", () => {
  const events = allEventsOf(CROWNED);
  const plates = keptPlates(CROWNED, events);
  const slate = events.filter(ev => !ev.finale && !CROWNED.shelved?.[ev.id]);
  assert.deepEqual(plates.map(plate => plate.eventId), slate.map(ev => ev.id));
  for (const plate of plates) {
    const slots = CROWNED.results[plate.eventId]?.slots || [];
    assert.equal(plate.posted, !!slots[0]?.length, plate.eventId);
    assert.deepEqual(plate.winners, slots[0] || []);
    assert.deepEqual(plate.places.map(place => place.players), slots.filter(list => list?.length));
    assert.equal(plate.bracket, !!(CROWNED.brackets?.[plate.eventId] && CROWNED.draws?.[plate.eventId]?.teams), plate.eventId);
  }
  assert.ok(plates.some(plate => plate.bracket), "the brackets are there to open");
  /* a bracket's shared 3rd names both semifinal teams */
  const shared = plates.flatMap(plate => plate.places).find(place => place.place === 2 && place.players.length === 4);
  if (shared) assert.match(shared.team || "", / · /);
});

test("a correction after the crown restamps the plate, because the plate reads the result", () => {
  const state = structuredClone(CROWNED);
  const events = allEventsOf(state);
  const plate = keptPlates(state, events).find(item => item.posted && item.winners.length === 1);
  const other = ROSTER.find(player => player !== plate.winners[0]);
  state.results[plate.eventId] = { ...state.results[plate.eventId], slots:[[other], [], []] };
  assert.deepEqual(keptPlates(state, events).find(item => item.eventId === plate.eventId).winners, [other]);
  state.shelved = { ...(state.shelved || {}), [plate.eventId]:true };
  assert.equal(keptPlates(state, events).some(item => item.eventId === plate.eventId), false, "a skipped event has no plate");
});

test("every player's last card, in standings order, each ending on the board's number", () => {
  const standings = computeStandings(CROWNED);
  const model = keepsakeModel(CROWNED);
  assert.equal(model.cards.length, ROSTER.length);
  assert.deepEqual(model.cards.map(card => card.player), standings.map(row => row.player));
  for (const card of model.cards) {
    const row = standings.find(item => item.player === card.player);
    assert.equal(card.pts, row.pts);
    assert.equal(card.history[card.history.length - 1].pts, row.pts, `${card.player}'s card ends on the board`);
    assert.equal(card.history[0].pts, START);
  }
  assert.deepEqual(model.champions.map(champ => champ.player), standings.filter(row => row.rank === 1).map(row => row.player));
  assert.equal(model.title, "Scottsdale · 2026");
  assert.equal(model.posted, model.plates.filter(plate => plate.posted).length);
});

test("the lead replays every player's history on one timeline and ends on the champion", () => {
  const events = allEventsOf(CROWNED);
  const standings = computeStandings(CROWNED);
  const lead = leadPath(CROWNED, events, standings);
  assert.equal(lead.steps[0].pts, START);
  assert.equal(lead.steps[0].leader, null, "nobody leads at 1,000 each");
  const last = lead.steps[lead.steps.length - 1];
  const top = standings.filter(row => row.rank === 1);
  assert.equal(last.pts, top[0].pts);
  assert.deepEqual([...last.leaders].sort(), top.map(row => row.player).sort());
  /* every step's number really is the top of the board at that moment */
  const histories = new Map(standings.map(row => [row.player, chipHistory(CROWNED, row.player, events)]));
  for (const step of lead.steps.slice(1)) {
    const at = player => { let pts = START; for (const item of histories.get(player)) if (!item.start && item.at <= step.at) pts = item.pts; return pts; };
    const max = Math.max(...standings.map(row => at(row.player)));
    assert.equal(step.pts, max);
    assert.ok(step.leaders.includes(step.leader));
  }
  for (const change of lead.changes) assert.equal(lead.steps[change.index].leader, change.player);
  assert.equal(lead.leadChanges, Math.max(0, lead.changes.length - 1));
  assert.ok(lead.steps.every((step, i) => !i || step.at >= lead.steps[i - 1].at), "time only moves forward");
});

test("a tie keeps whoever led into it", () => {
  const state = { ...structuredClone(EMPTY_STATE), live:true, frozen:true };
  const [a, b] = ROSTER;
  state.adjustments = [
    { id:"r1", player:a, delta:500, ts:1000 },
    { id:"r2", player:b, delta:500, ts:5000 },
    { id:"r3", player:b, delta:100, ts:9000 },
  ];
  const lead = leadPath(state, allEventsOf(state), computeStandings(state));
  assert.deepEqual(lead.steps.map(step => [step.leader, step.pts, step.tied]),
    [[null, START, true], [a, 1500, false], [a, 1500, true], [b, 1600, false]]);
  assert.deepEqual(lead.changes.map(change => change.player), [a, b]);
  assert.equal(lead.leadChanges, 1);
});

test("awards show once the TV reveals them, from the real ballot, never with voters", () => {
  assert.deepEqual(keptAwards(CROWNED), []);
  const state = structuredClone(EMPTY_STATE);
  let n = 0;
  const gm = () => ({ isGm:true, player:null, deviceId:"gm", actionId:`k${++n}` });
  const guest = player => ({ isGm:false, player, deviceId:`d-${player}`, actionId:`k${++n}` });
  const act = (type, payload, ctx = gm()) => { const r = applyAction(state, type, payload, ctx); assert.equal(r.ok, true, r.error); };
  act("promptPublish", { ballot:{ id:"bkeepsake1", kind:"awards", questions:[
    { id:"qfraud", title:"Fraud of the weekend", nominees:null, allowSelf:false },
    { id:"qclutch", title:"Most clutch", nominees:null, allowSelf:false },
  ] } });
  for (const player of ROSTER) {
    act("promptRespond", { id:"bkeepsake1", questionId:"qfraud", choice:player === ROSTER[0] ? ROSTER[1] : ROSTER[0] }, guest(player));
    act("promptRespond", { id:"bkeepsake1", questionId:"qclutch", choice:player === ROSTER[2] ? ROSTER[1] : ROSTER[2] }, guest(player));
  }
  act("promptClose", { id:"bkeepsake1" });
  assert.deepEqual(keptAwards(state), [], "nothing before the reveal");
  act("promptReveal", { id:"bkeepsake1", step:1 });
  const awards = keptAwards(state);
  assert.deepEqual(awards.map(award => [award.title, award.winners, award.tie]), [["Fraud of the weekend", [ROSTER[0]], false]],
    "only the revealed award, with its winner");
  assert.equal(awards[0].totals[ROSTER[0]], ROSTER.length - 1);
  assert.ok(!JSON.stringify(awards).includes("responses"), "voters are never read");
});

test("Weekend leads with the edition once frozen; Save all cards is the commissioner's", () => {
  const events = allEventsOf(CROWNED);
  const standings = computeStandings(CROWNED);
  const guide = (state, extra = {}) => render(state, React.createElement(ui.Guide, { state, events, standings, me:ROSTER[1],
    onPlayer:() => {}, onBracket:() => {}, ...extra }));
  const before = guide(LIVE);
  assert.ok(!before.includes("Scottsdale · 2026</button>"), "no edition tab before the crown");
  assert.match(before, /aria-selected="true"[^>]*>Trip</);
  const after = guide(CROWNED);
  assert.match(after, /aria-selected="true"[^>]*>Scottsdale · 2026</, "the edition opens first once frozen");
  assert.equal((after.match(/class="fd-kept-card"/g) || []).length, ROSTER.length);
  assert.ok(after.includes("Last cards") && after.includes("The lead") && after.includes("Events"));
  assert.ok(!after.includes("fd-kept-save-all"));
  assert.ok(guide(CROWNED, { gm:true }).includes("fd-kept-save-all"));
  assert.match(guide(CROWNED, { section:"trip" }), /aria-selected="true"[^>]*>Trip</, "a chosen section is kept");
  assert.match(guide(LIVE, { section:"kept" }), /aria-selected="true"[^>]*>Trip</, "a stale choice falls back");
  /* the photo slot renders only what it is given */
  const photos = render(CROWNED, React.createElement(ui.Keepsake, { state:CROWNED, events, standings, me:ROSTER[1],
    photos:React.createElement("div", { className:"photo-grid-slot" }) }));
  assert.ok(photos.includes("photo-grid-slot") && photos.includes(">Photos<"));
  const text = after.replace(/<[^>]+>/g, " ");
  assert.ok(!/—|!/.test(text), "no em dashes or exclamation marks");
});

test("Save all cards: one sheet with every file, else one at a time, else press and hold", async () => {
  const blobs = [new Blob(["a"]), new Blob(["b"])];
  const names = ["a.png", "b.png"];
  const shared = [];
  const all = { canShare:({ files }) => files.length > 0, share:async ({ files }) => { shared.push(files.length); } };
  assert.equal(await ui.shareCardImages(blobs, names, all), "shared");
  assert.deepEqual(shared, [2]);
  const single = { canShare:({ files }) => files.length === 1, share:async () => {} };
  assert.equal(await ui.shareCardImages(blobs, names, single), "each");
  assert.equal(await ui.shareCardImages(blobs, names, {}), "preview");
  assert.equal(await ui.shareCardImages([], names, all), "preview");
  const cancel = { canShare:() => true, share:async () => { const error = new Error("x"); error.name = "AbortError"; throw error; } };
  assert.equal(await ui.shareCardImages(blobs, names, cancel), "cancelled");
  /* a sheet that refuses (the tap's activation ran out) falls back to one at a time */
  const refused = { canShare:() => true, share:async () => { throw new Error("NotAllowedError"); } };
  assert.equal(await ui.shareCardImages(blobs, names, refused), "each");
});

/* ─────────── D8 ─────────── */

const seatedOf = state => (state.poker.seats || ROSTER).filter(player => !state.poker.outs.some(out => out.player === player));

test("Table view is offered to a seated player still in, never to the away, unseated or a guest", () => {
  const seated = seatedOf(LIVE);
  const me = seated[0];
  assert.equal(tableViewSeat(LIVE, me), "seated");
  assert.equal(tableViewAvailable(LIVE, me), true);
  assert.equal(tableViewSeat(LIVE, null), "guest");
  const out = LIVE.poker.outs[0]?.player;
  if (out) {
    assert.equal(tableViewSeat(LIVE, out), "out");
    assert.equal(tableViewAvailable(LIVE, out), false);
    assert.equal(tableViewKeepsOpen(LIVE, out), true, "an open view stays up through a bust");
  }
  const away = structuredClone(LIVE);
  away.away = { [me]:true };
  assert.equal(tableViewSeat(away, me), "away");
  assert.equal(tableViewKeepsOpen(away, me), false);
  const unseated = structuredClone(LIVE);
  unseated.poker.seats = seated.filter(player => player !== me);
  assert.equal(tableViewSeat(unseated, me), "unseated");
  const dealt = structuredClone(LIVE);
  delete dealt.poker.startedAt;
  assert.equal(tableViewSeat(dealt, me), "none", "not before cards are live");
  assert.equal(tableViewSeat(CROWNED, me), "none", "not once the counts post");
  assert.equal(tableViewSeat(EMPTY_STATE, me), "none");
});

test("the view reads the blind clock at a server instant and turns on the stored level start", () => {
  const state = structuredClone(LIVE);
  const me = seatedOf(state)[0];
  const pk = state.poker;
  pk.levelIdx = 1; pk.levelStartedAt = 1_000_000; pk.pausedAt = null;
  const minutes = pk.levels[1].mins * 60000;
  const at = tableViewModel(state, me, 1_000_000 + 30_500);
  assert.equal(at.levelNumber, 2);
  assert.equal(at.blinds, `${pk.levels[1].sb} / ${pk.levels[1].bb}`);
  assert.equal(at.next, `${pk.levels[2].sb} / ${pk.levels[2].bb}`);
  assert.equal(at.clock, mmss(minutes - 30_500));
  assert.equal(at.stack, pk.startingStacks[me]);
  assert.equal(at.denoms.reduce((sum, chip) => sum + chip.v * chip.n, 0), pk.startingStacks[me], "the tray deals the stack exactly");
  const clk = pokerClock(pk, 1_000_000 + minutes);
  assert.equal(tableViewModel(state, me, 1_000_000 + minutes - 1).level, 1);
  assert.equal(tableViewModel(state, me, 1_000_000 + minutes).level, clk.idx, "the same instant as every other screen");
  assert.equal(tableViewModel(state, me, 1_000_000 + minutes).level, 2);
  pk.pausedAt = 1_000_000 + 60_000;
  const paused = tableViewModel(state, me, 1_000_000 + 600_000);
  assert.equal(paused.paused, true);
  assert.equal(paused.clock, mmss(minutes - 60_000), "a pause holds the remaining time");
  pk.pausedAt = null; pk.levelIdx = pk.levels.length - 1;
  const last = tableViewModel(state, me, 1_000_000 + 10 * 60 * 60000);
  assert.equal(last.next, null);
  assert.equal(last.final, true);
  assert.equal(last.clock, "Final level");
  assert.equal(last.late, false);
});

test("ticks land on the server second, so the level turns on the boundary itself", () => {
  const state = structuredClone(LIVE);
  const me = seatedOf(state)[0];
  const pk = state.poker;
  pk.levelIdx = 0; pk.levelStartedAt = 7_000_123; pk.pausedAt = null;
  const boundary = pk.levelStartedAt + pk.levels[0].mins * 60000;
  let now = boundary - 3_456;
  const seen = [];
  for (let i = 0; i < 5; i++) {
    const model = tableViewModel(state, me, now);
    seen.push([model.level, model.clock]);
    now += nextTickDelay(model);
  }
  assert.deepEqual(seen.map(item => item[1]).slice(0, 4), ["0:04", "0:03", "0:02", "0:01"]);
  assert.equal(seen[4][0], 1, "the tick after 0:01 is the new level");
  assert.ok(now - nextTickDelay(tableViewModel(state, me, now)) >= boundary);
  /* the tick that turned it arrived within the slop of the boundary */
  let t = boundary - 2_500;
  while (tableViewModel(state, me, t).level === 0) t += nextTickDelay(tableViewModel(state, me, t));
  assert.ok(t - boundary >= 0 && t - boundary <= TICK_SLOP_MS, `turned ${t - boundary}ms after the boundary`);
  assert.equal(nextTickDelay({ paused:true, msLeft:5 }), 1000);
  assert.equal(nextTickDelay(null), 1000);
});

test("blinds fill the width without overflowing it", () => {
  assert.equal(blindsSize("25 / 50", 350), 123);
  /* six figures, two spaces, the slash and the comma */
  assert.ok(blindsSize("600 / 1,200", 350) * (6 * 0.5 + 2 * 0.24 + 0.36 + 0.22) <= 350);
  assert.equal(blindsSize("1", 350), 136, "capped");
  assert.equal(blindsSize("600 / 1,200", 120), 56, "floored");
});

test("the wake lock is asked for only where it exists, again on return, and released on exit", async () => {
  const flush = () => new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(wakeLockSupported(null), false);
  assert.equal(wakeLockSupported({}), false);
  const unsupported = createWakeLock({ nav:{}, doc:null });
  assert.equal(unsupported.supported, false);
  assert.equal(await unsupported.start(), false);

  const listeners = {};
  const doc = { visibilityState:"visible",
    addEventListener:(type, fn) => { listeners[type] = fn; }, removeEventListener:type => { delete listeners[type]; } };
  const requests = [];
  const sentinels = [];
  const nav = { wakeLock:{ request:async type => {
    requests.push(type);
    const handlers = {};
    const sentinel = { released:false, addEventListener:(name, fn) => { handlers[name] = fn; },
      release:async () => { sentinel.released = true; handlers.release?.(); } };
    sentinels.push(sentinel);
    return sentinel;
  } } };
  const lock = createWakeLock({ nav, doc });
  assert.equal(lock.supported, true);
  await lock.start();
  assert.deepEqual(requests, ["screen"]);
  assert.equal(lock.held(), true);
  await lock.start();
  assert.equal(requests.length, 1, "one lock at a time");
  /* the system drops it when the page hides; it comes back with the page */
  await sentinels[0].release();
  assert.equal(lock.held(), false);
  doc.visibilityState = "hidden"; listeners.visibilitychange?.();
  await flush();
  assert.equal(requests.length, 1, "never asked for while hidden");
  doc.visibilityState = "visible"; listeners.visibilitychange?.();
  await flush(); await flush();
  assert.equal(requests.length, 2);
  assert.equal(lock.held(), true);
  await lock.release();
  assert.equal(sentinels[1].released, true);
  assert.equal(lock.held(), false);
  assert.equal(listeners.visibilitychange, undefined, "exit stops listening");

  /* released while the request is still in flight: the late lock is let go */
  const slow = { wakeLock:{ request:() => new Promise(resolve => setTimeout(() => resolve(nav.wakeLock.request("screen")), 5)) } };
  const late = createWakeLock({ nav:slow, doc:{ visibilityState:"visible", addEventListener() {}, removeEventListener() {} } });
  const pending = late.start();
  await late.release();
  await pending;
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(sentinels[sentinels.length - 1].released, true);
  assert.equal(late.held(), false);
  /* a refused request never throws */
  const refused = createWakeLock({ nav:{ wakeLock:{ request:async () => { throw new Error("NotAllowedError"); } } }, doc:null });
  assert.equal(await refused.start(), false);
});

test("the table view renders the level, blinds, clock and dealt stack; the entry only for a seat", () => {
  const state = structuredClone(LIVE);
  const me = seatedOf(state)[0];
  const pk = state.poker;
  pk.levelIdx = 2; pk.levelStartedAt = 5_000_000; pk.pausedAt = null;
  const html = render(state, React.createElement(ui.TableView, { state, me, now:5_000_000 + 61_000, width:390 }));
  assert.match(html, /Level 3 of 7/);
  assert.ok(html.includes(`${pk.levels[2].sb} / ${pk.levels[2].bb}`));
  assert.ok(html.includes(mmss(pk.levels[2].mins * 60000 - 61_000)));
  assert.ok(html.includes(pk.startingStacks[me].toLocaleString("en-US")));
  assert.match(html, />Exit</);
  assert.match(html, /role="dialog"/);
  const text = html.replace(/<[^>]+>/g, " ");
  assert.ok(!/—|!/.test(text));
  const entry = player => render(state, React.createElement(ui.TableViewEntry, { state, me:player }));
  assert.match(entry(me), /Table view/);
  assert.equal(entry(null), "");
  const away = structuredClone(state); away.away = { [me]:true };
  assert.equal(render(away, React.createElement(ui.TableViewEntry, { state:away, me })), "");
});
