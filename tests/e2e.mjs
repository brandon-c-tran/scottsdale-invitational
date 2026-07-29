/* Two-window full-loop verification against the local dev server.
   Window A = Brandon (claims, unlocks GM, runs the draw, advances bracket, posts result).
   Window B = Evan (claims, places wagers).
   Mirrors exactly what src/App.jsx dispatches; asserts both windows receive
   the same authoritative broadcasts and that wagers settle simultaneously. */

import { ROSTER, resolveWager, computeStandings, allEventsOf, resolveSlot, bracketChampion, CHIP_COLORS,
  RESET_PROGRESS_CONFIRMATION }
  from "../shared/core.js";

const BASE = process.env.WS_BASE || "ws://localhost:5173/ws";
const target = new URL(BASE);
const productionHost = target.hostname === "fielddayseries.com"
  || target.hostname.endsWith(".fielddayseries.com");
const localHost = ["localhost", "127.0.0.1", "::1"].includes(target.hostname);
if (productionHost)
  throw new Error("E2E refuses to run against the production domain");
if (!localHost && process.env.FIELD_DAY_E2E_TARGET !== "staging")
  throw new Error("Non-local E2E requires FIELD_DAY_E2E_TARGET=staging");

const log = (...a) => console.log(...a);
let failures = 0;
const assert = (cond, msg) => {
  if (cond) log("  PASS:", msg);
  else { failures++; console.error("  FAIL:", msg); }
};

function makeWindow(name) {
  const deviceId = crypto.randomUUID();
  const ws = new WebSocket(BASE);
  const win = {
    name, deviceId, ws, gmToken: null, state: null, version: 0, you: null,
    environment: null, capabilities: null,
    aid: 0, pending: new Map(), broadcasts: [],
    send(obj) { ws.send(JSON.stringify({ ...obj, deviceId, gmToken: win.gmToken })); },
    dispatch(type, payload, options = {}) {
      return new Promise(resolve => {
        const actionId = options.actionId || "a" + (++win.aid) + "-" + name;
        const t = setTimeout(() => { win.pending.delete(actionId); resolve({ ok: false, error: "timeout" }); }, 6000);
        win.pending.set(actionId, { resolve, t });
        win.send({ actionId, type, payload });
      });
    },
    waitVersion(v, ms = 4000) {
      return new Promise((resolve, reject) => {
        if (win.version >= v) return resolve();
        const iv = setInterval(() => { if (win.version >= v) { clearInterval(iv); clearTimeout(to); resolve(); } }, 10);
        const to = setTimeout(() => { clearInterval(iv); reject(new Error(`${name} never reached version ${v} (at ${win.version})`)); }, ms);
      });
    },
  };
  ws.onmessage = e => {
    const msg = JSON.parse(e.data);
    if (msg.type === "state") {
      if (msg.version >= win.version) {
        win.state = msg.state; win.version = msg.version;
        if (msg.you !== undefined) win.you = msg.you;
        win.environment = msg.environment || "production";
        win.capabilities = msg.capabilities || {};
        win.broadcasts.push({ version: msg.version, lastAction: msg.lastAction || null, at: Date.now() });
      }
    } else if (msg.type === "ack") {
      const p = win.pending.get(msg.actionId);
      if (p) { win.pending.delete(msg.actionId); clearTimeout(p.t); p.resolve(msg); }
    }
  };
  const open = new Promise((res, rej) => {
    ws.onopen = () => { win.send({ type: "hello" }); res(); };
    ws.onerror = err => rej(new Error("ws error: " + err?.message));
  });
  return { win, open };
}

const A = makeWindow("A(Brandon)");
const B = makeWindow("B(Evan)");
await Promise.all([A.open, B.open]);
const a = A.win, b = B.win;
await a.waitVersion(0); await new Promise(r => setTimeout(r, 300));
assert(a.state && b.state, "both windows received initial state on hello");
assert(a.environment === "local" && a.capabilities?.qa && a.capabilities?.progressReset
  && a.capabilities?.restore,
  "local server is visibly isolated and enables rehearsal, reset, and recovery capabilities");

/* ── onboarding: claim different players ── */
let r = await a.dispatch("claim", { player: "Brandon" });
assert(r.ok, "window A claims Brandon");
r = await b.dispatch("claim", { player: "Evan" });
assert(r.ok, "window B claims Evan");
r = await a.dispatch("saveProfile", { player: "Brandon", display: "Brandon" });
assert(r.ok, "A saves profile");
r = await b.dispatch("saveProfile", { player: "Evan", display: "Evan" });
assert(r.ok, "B saves profile");
r = await b.dispatch("saveProfile", { player: "Brandon", display: "Hijack" });
assert(!r.ok, "B cannot edit Brandon's profile (rejected: " + r.error + ")");
r = await b.dispatch("saveSeeds", { player: "Evan", ratings: { pool: 3 } });
assert(r.ok, "B seals scouting report");

/* ── GM unlock ── */
r = await b.dispatch("runDraw", { evId: "8ball", players: null });
assert(!r.ok, "non-GM cannot run a draw (rejected: " + r.error + ")");
r = await a.dispatch("gmUnlock", { pin: "9999" });
assert(!r.ok, "wrong pin rejected");
r = await a.dispatch("gmUnlock", { pin: "1016" });
assert(r.ok && r.extra?.gmToken, "GM unlock with 1016 mints token");
a.gmToken = r.extra.gmToken;

/* clean slate so the run is deterministic */
r = await a.dispatch("resetTournament", { confirm:RESET_PROGRESS_CONFIRMATION });
assert(r.ok && r.extra?.backupKey?.startsWith("m1:pre-reset:"),
  "GM resets tournament for a clean run with an internal backup");
await b.waitVersion(a.version);

/* ── draw 8-Ball ── */
r = await a.dispatch("runDraw", { evId: "8ball", players: ROSTER });
assert(!r.ok && /exactly 12/i.test(r.error),
  "GM cannot silently squeeze 13 players into a 12-seat format (rejected: " + r.error + ")");
/* Evan sits out the draw so his wagers are never against his own team */
r = await a.dispatch("runDraw", {
  evId: "8ball",
  players: ROSTER.filter(p => p !== "Evan"),
  roles: [{ player:"Evan", role:"scorekeeper" }],
});
assert(r.ok, "GM draws 8-Ball teams");
await b.waitVersion(a.version);
const draw = b.state.draws["8ball"];
assert(draw && draw.teams.length === 6, "draw produced 6 teams (window B sees it)");
assert(draw.teams.flatMap(t => t.players).length === 12, "all 12 entrants placed");
assert(draw.roles?.length === 1 && draw.roles[0].player === "Evan" && draw.roles[0].role === "scorekeeper",
  "excluded player has an explicit operational role");
const br0 = b.state.brackets["8ball"];
assert(br0 && br0.size === 6, "6-team bracket created");

/* ── open betting ── */
r = await a.dispatch("setOnDeck", { id: "8ball" });
assert(r.ok, "GM opens betting (on deck)");
await b.waitVersion(a.version);
assert(b.state.onDeck === "8ball", "window B sees betting open");

/* ── wagers from both windows ── */
const t0 = draw.teams[0];
const retrySafeWager = { kind: "outright", eventId: "8ball", evName: "8-Ball Doubles",
  pickTeam: true, pickPlayers: [...t0.players], drawId: draw.id, stake: 300 };
r = await b.dispatch("placeWager", { wager: retrySafeWager }, { actionId:"wager-idempotency-e2e" });
assert(r.ok, "Evan places outright wager (300 on team 0)");
r = await b.dispatch("placeWager", { wager: retrySafeWager }, { actionId:"wager-idempotency-e2e" });
assert(r.ok && r.extra?.unchanged, "transport retry is acknowledged without a duplicate wager");
await b.waitVersion(a.version);
let evanOutright = b.state.wagers.filter(w => w.player === "Evan" && w.kind === "outright");
assert(evanOutright.length === 1 && evanOutright[0].stake === 300,
  "same request id leaves exactly one 300-point wager");
r = await b.dispatch("placeWager", { wager: { ...retrySafeWager, stake: 100 } });
assert(r.ok && r.extra?.aggregated, "a deliberate second chip aggregates into the existing wager");
await b.waitVersion(a.version);
evanOutright = b.state.wagers.filter(w => w.player === "Evan" && w.kind === "outright");
assert(evanOutright.length === 1 && evanOutright[0].stake === 400 && evanOutright[0].chips?.length === 2,
  "one persisted line carries both intentional chips");
r = await b.dispatch("placeWager", { wager: { ...retrySafeWager, stake: 200 } });
assert(!r.ok, "Evan's next 200 rejected, 500 cap at 1000 points (rejected: " + r.error + ")");
r = await b.dispatch("placeWager", { wager: { kind: "outright", eventId: "8ball", evName: "8-Ball Doubles",
  pickTeam: true, pickPlayers: [...t0.players], drawId: "stale-draw-id", stake: 200 } });
assert(!r.ok && /draw changed/i.test(r.error), "stale drawId is rejected before the cap response (" + r.error + ")");

const m00 = br0.rounds[0][0];
const aIdx = m00.a.t, bIdx = m00.b.t;
r = await b.dispatch("placeWager", { wager: { kind: "match", eventId: "8ball", evName: "8-Ball Doubles",
  teamIdx: aIdx, pickPlayers: [...draw.teams[aIdx].players], pickTeam: true, drawId: draw.id,
  match: [0, 0], matchName: "Play-in", stake: 100 } });
assert(r.ok, "Evan places matchup wager (100 on play-in)");
await b.waitVersion(a.version);
assert(b.state.wagers.length === 2, "both open wagers visible in window B");

/* lock betting and start the competition */
r = await a.dispatch("setOnDeck", { id: null });
assert(r.ok, "GM locks betting for 8-Ball");
r = await a.dispatch("startEvent", { evId: "8ball" });
assert(r.ok, "GM starts 8-Ball");
await b.waitVersion(a.version);

/* ── advance the bracket ── */
r = await a.dispatch("pickBracketWinner", { evId: "8ball", r: 0, m: 0, teamIdx: aIdx });
assert(r.ok, "GM advances play-in match 1 winner");
await b.waitVersion(a.version);
{
  const events = allEventsOf(b.state);
  const mw = b.state.wagers.find(w => w.kind === "match");
  const res = resolveWager(b.state, mw, events);
  assert(res.status === "won" && res.delta === 100, "the matchup wager settled WON +100 on window B immediately");
  const resA = resolveWager(a.state, a.state.wagers.find(w => w.kind === "match"), allEventsOf(a.state));
  assert(resA.status === res.status, "both windows agree on matchup settlement");
}
/* finish the bracket: play-in m1, semis, final. Champion = team 0 so Evan's outright wins. */
const m01 = br0.rounds[0][1];
r = await a.dispatch("pickBracketWinner", { evId: "8ball", r: 0, m: 1, teamIdx: m01.a.t });
assert(r.ok, "GM advances play-in match 2");
await b.waitVersion(a.version);
const brB = () => b.state.brackets["8ball"];
const semi0 = brB().rounds[1][0]; // a: t0
r = await a.dispatch("pickBracketWinner", { evId: "8ball", r: 1, m: 0, teamIdx: 0 });
assert(r.ok, "GM advances semifinal 1 (team 0)");
r = await a.dispatch("pickBracketWinner", { evId: "8ball", r: 1, m: 1, teamIdx: 1 });
assert(r.ok, "GM advances semifinal 2 (team 1)");
r = await a.dispatch("pickBracketWinner", { evId: "8ball", r: 2, m: 0, teamIdx: 0 });
assert(r.ok, "GM picks final winner (team 0)");
await b.waitVersion(a.version);
assert(bracketChampion(brB()) === 0, "bracket champion is team 0 on window B");

/* wager placed on an already-decided matchup must be rejected */
r = await b.dispatch("placeWager", { wager: { kind: "match", eventId: "8ball", evName: "8-Ball Doubles",
  teamIdx: 0, pickPlayers: [...t0.players], pickTeam: true, drawId: draw.id, match: [2, 0],
  matchName: "Final", stake: 200 } });
assert(!r.ok, "wager on decided matchup rejected (" + r.error + ")");

/* ── post the result ── */
const runnerTeam = 1;
r = await a.dispatch("beginResultEntry", { evId: "8ball" });
assert(r.ok, "GM opens official result entry");
const vBefore = a.version;
r = await a.dispatch("saveResult", { evId: "8ball", slots: [[...draw.teams[0].players], [...draw.teams[runnerTeam].players], []] });
assert(r.ok, "GM posts official result");
await Promise.all([a.waitVersion(vBefore + 1), b.waitVersion(vBefore + 1)]);

/* ── confirm settlement on both screens ── */
for (const [label, win] of [["A", a], ["B", b]]) {
  const events = allEventsOf(win.state);
  const ow = win.state.wagers.find(w => w.kind === "outright");
  const res = resolveWager(win.state, ow, events);
  assert(res.status === "won" && res.delta === 800, `window ${label}: Evan's outright settled WON +800 (2:1 on stake 400)`);
  assert(win.state.onDeck === null, `window ${label}: betting closed automatically on result`);
}
const sA = computeStandings(a.state), sB = computeStandings(b.state);
assert(JSON.stringify(sA) === JSON.stringify(sB), "standings identical on both windows");
const evanRow = sB.find(x => x.player === "Evan");
assert(evanRow.pts === 1900 && evanRow.betNet === 900, `Evan at 1900 pts (1000 start +800 outright +100 matchup), got ${evanRow.pts}`);
const lastA = a.broadcasts.at(-1), lastB = b.broadcasts.at(-1);
assert(lastA.version === lastB.version && lastA.lastAction === "saveResult" && lastB.lastAction === "saveResult",
  `both windows received the saveResult broadcast at version ${lastA.version}, ${Math.abs(lastA.at - lastB.at)}ms apart`);

/* betting stays closed after result */
r = await b.dispatch("placeWager", { wager: { kind: "outright", eventId: "8ball", evName: "8-Ball Doubles",
  pickTeam: true, pickPlayers: [...t0.players], drawId: draw.id, stake: 200 } });
assert(!r.ok, "no wagers after result posted (" + r.error + ")");

/* ── the poker finale: setup gate, freeze, stacks become standings ── */
r = await b.dispatch("pokerSetup", {});
assert(!r.ok, "non-GM cannot set the table (rejected: " + r.error + ")");
r = await a.dispatch("setOnDeck", { id: "putt" });
assert(r.ok, "GM opens betting on Long Putt");
r = await b.dispatch("placeWager", { wager: { kind: "outright", eventId: "putt", evName: "Long Putt",
  pick: "Khoa", pickPlayers: ["Khoa"], pickTeam: false, stake: 200 } });
assert(r.ok, "Evan places a chip on Long Putt");
r = await a.dispatch("pokerSetup", {});
assert(!r.ok, "pending wager blocks the table (rejected: " + r.error + ")");
r = await b.dispatch("retractWager", { id: b.state.wagers.find(w => w.player === "Evan" && w.eventId === "putt").id });
assert(r.ok, "Evan pulls the chip back");
/* scaling cap: half the stack scales with the stack */
r = await a.dispatch("adjust", { player: "Evan", delta: 3000, reason: "cap test" });
assert(r.ok, "GM ruling puts Evan deep in points");
await b.waitVersion(a.version);
r = await b.dispatch("placeWager", { wager: { kind: "outright", eventId: "putt", evName: "Long Putt",
  pick: "Khoa", pickPlayers: ["Khoa"], pickTeam: false, stake: 800 } });
assert(r.ok, "800 fits under Evan's scaled cap");
r = await b.dispatch("placeWager", { wager: { kind: "outright", eventId: "putt", evName: "Long Putt",
  pick: "Khoa", pickPlayers: ["Khoa"], pickTeam: false, stake: 1700 } });
assert(!r.ok && /Max \d+ at risk/.test(r.error), "exposure past the scaled cap rejected (" + r.error + ")");
r = await b.dispatch("retractWager", { id: b.state.wagers.find(w => w.player === "Evan" && w.stake === 800).id });
assert(r.ok, "Evan pulls the 800 back");

/* chip colors are first come first serve. Profiles deliberately survive resets,
   so release the color first: this run must not depend on who held it last */
for (const [p, pr] of Object.entries(a.state.profiles || {}))
  if (pr?.color === CHIP_COLORS[0].hex && p !== "Brandon")
    await a.dispatch("pickChip", { player: p, color: null });
r = await a.dispatch("pickChip", { player: "Brandon", color: CHIP_COLORS[0].hex, skin: "ticks" });
assert(r.ok, "Brandon claims the first color (" + (r.error || "ok") + ")");
r = await a.dispatch("pickChip", { player: "Khoa", color: CHIP_COLORS[0].hex, skin: "dots" });
assert(!r.ok, "the same color is gone (rejected: " + r.error + ")");

/* duels are a weekend thing: everyone sits on 1,000 until the board goes live */
{
  let r0 = await b.dispatch("sendDuel", { to: "Khoa", game: "quickdraw" });
  assert(!r0.ok, "no duels before the weekend starts (rejected: " + r0.error + ")");
  r0 = await a.dispatch("setLive", { on: true });
  assert(r0.ok, "GM starts the weekend");
  await b.waitVersion(a.version);
}

/* a duel settles into the standings, zero sum */
{
  const before = computeStandings(a.state);
  const pts0 = Object.fromEntries(before.map(x => [x.player, x.pts]));
  r = await b.dispatch("sendDuel", { to: "Khoa", game: "quickdraw" });
  assert(r.ok, "Evan challenges Khoa");
  await b.waitVersion(a.version);
  const duel = b.state.duels.find(d => d.from === "Evan" && d.to === "Khoa" && d.status === "open");
  r = await b.dispatch("playDuel", { id: duel.id, ms: 150 });
  assert(r.ok, "Evan draws in 150ms");
  r = await a.dispatch("claim", { player: "Khoa" });
  assert(r.ok, "window A speaks for Khoa");
  r = await a.dispatch("playDuel", { id: duel.id, ms: 400 });
  assert(r.ok, "Khoa answers in 400ms");
  r = await a.dispatch("claim", { player: "Brandon" });
  assert(r.ok, "window A back to Brandon");
  await b.waitVersion(a.version);
  const after = computeStandings(b.state);
  const pts1 = Object.fromEntries(after.map(x => [x.player, x.pts]));
  assert(pts1["Evan"] === pts0["Evan"] + 100 && pts1["Khoa"] === pts0["Khoa"] - 100,
    "quick draw settled 100 across, zero sum");
}

/* the challenger names the ante, and it is bounded by the same cap as wagers */
{
  let r = await b.dispatch("sendDuel", { to: "Khoa", game: "quickdraw", stake: 250 });
  assert(!r.ok && /100s/.test(r.error), "off-quantum ante rejected (" + r.error + ")");
  r = await b.dispatch("sendDuel", { to: "Khoa", game: "quickdraw", stake: 99900 });
  assert(!r.ok && /at risk|cover/.test(r.error), "ante past the cap rejected (" + r.error + ")");
  const before = computeStandings(b.state);
  const pts0 = Object.fromEntries(before.map(x => [x.player, x.pts]));
  r = await b.dispatch("sendDuel", { to: "Khoa", game: "quickdraw", stake: 300 });
  assert(r.ok, "Evan challenges Khoa for 300");
  await a.waitVersion(b.version);
  const duel = b.state.duels.find(d => d.from === "Evan" && d.to === "Khoa" && d.status === "open");
  assert(duel.stake === 300, "the duel carries the chosen ante");
  r = await b.dispatch("playDuel", { id: duel.id, ms: 200 });
  assert(r.ok, "Evan runs 200ms");
  r = await a.dispatch("claim", { player: "Khoa" });
  r = await a.dispatch("playDuel", { id: duel.id, ms: 500 });
  assert(r.ok, "Khoa runs 500ms");
  await b.waitVersion(a.version);
  const pts1 = Object.fromEntries(computeStandings(b.state).map(x => [x.player, x.pts]));
  assert(pts1["Evan"] === pts0["Evan"] + 300 && pts1["Khoa"] === pts0["Khoa"] - 300,
    "the 300 ante settled 300 across, zero sum");
  r = await a.dispatch("claim", { player: "Brandon" });
  assert(r.ok, "window A back to Brandon");
  await b.waitVersion(a.version);
}

/* the buy-in floor: a short stack is staked to 600 at setup */
{
  const chinh = computeStandings(a.state).find(x => x.player === "Chinh").pts;
  r = await a.dispatch("adjust", { player: "Chinh", delta: 400 - chinh, reason: "floor test" });
  assert(r.ok, "GM ruling drops Chinh to 400");
}

r = await a.dispatch("setOnDeck", { id: null });
assert(r.ok, "betting closed");
const prePokerRows = computeStandings(a.state).map(row => ({ player:row.player, pts:row.pts }));
r = await a.dispatch("pokerSetup", {});
assert(r.ok, "table set");
await b.waitVersion(a.version);
const setupVersion = a.version;
r = await a.dispatch("pokerSetup", {});
assert(r.ok && r.extra?.unchanged && a.version === setupVersion,
  "retrying table setup does not duplicate minimum grants or advance state");
{
  const stake = b.state.adjustments.find(x => x.reason === "Minimum stack");
  assert(stake?.player === "Chinh" && stake.delta === 200, "minimum-stack ruling brought Chinh to 600");
  assert(computeStandings(b.state).find(x => x.player === "Chinh").pts === 600, "Chinh sits with 600");
}
await b.waitVersion(a.version);
const pokerTotal = b.state.poker.total;
assert(pokerTotal === computeStandings(b.state).reduce((s, x) => s + x.pts, 0),
  "buy-in total matches the board");
r = await a.dispatch("setOnDeck", { id: "poker" });
assert(!r.ok, "no betting on the finale (rejected: " + r.error + ")");
r = await a.dispatch("adjust", { player: "Evan", delta: 100, reason: "late ruling" });
assert(!r.ok && /cancel the poker table/i.test(r.error),
  "the dealt board is locked before cards start (rejected: " + r.error + ")");
r = await a.dispatch("pokerStart", {});
assert(r.ok, "shuffle up and deal");
const startVersion = a.version;
r = await a.dispatch("pokerStart", {});
assert(r.ok && r.extra?.unchanged && a.version === startVersion,
  "retrying poker start is a no-op");
r = await b.dispatch("placeWager", { wager: { kind: "outright", eventId: "putt", evName: "Long Putt",
  pick: "Khoa", pickPlayers: ["Khoa"], pickTeam: false, stake: 200 } });
assert(!r.ok, "wagers frozen while cards are live (rejected: " + r.error + ")");
r = await b.dispatch("sendDuel", { to: "Khoa", game: "quickdraw" });
assert(!r.ok, "duels frozen while cards are live (rejected: " + r.error + ")");
r = await a.dispatch("adjust", { player: "Evan", delta: 20, reason: "x" });
assert(!r.ok, "rulings frozen while cards are live (rejected: " + r.error + ")");
r = await a.dispatch("pokerBust", { player: "Evan" });
assert(r.ok, "Evan busts");
r = await a.dispatch("pokerBust", { player: "Evan" });
assert(!r.ok, "double bust rejected");
r = await b.dispatch("pokerCount", { player: "Evan", count: 1000 });
assert(!r.ok, "busted player cannot count (rejected: " + r.error + ")");
r = await a.dispatch("pokerResult", {});
assert(!r.ok, "post blocked before everyone counts (rejected: " + r.error + ")");
for (const p of ROSTER) {
  if (p === "Evan") continue;
  r = await a.dispatch("pokerCount", { player: p, count: p === "Brandon" ? pokerTotal : 0 });
  assert(r.ok, `count in for ${p}`);
  if (p === "Brandon") {
    const countVersion = a.version;
    r = await a.dispatch("pokerCount", { player: p, count: pokerTotal });
    assert(r.ok && r.extra?.unchanged && a.version === countVersion,
      "retrying the same chip count is a no-op");
  }
}
r = await a.dispatch("pokerResult", {});
assert(r.ok, "final counts posted");
await b.waitVersion(a.version);
const resultVersion = a.version;
r = await a.dispatch("pokerResult", {});
assert(r.ok && r.extra?.unchanged && r.extra?.revision === 1 && a.version === resultVersion,
  "retrying the final post does not create another revision");
for (const [label, win] of [["A", a], ["B", b]]) {
  const rows = computeStandings(win.state);
  assert(rows[0].player === "Brandon" && rows[0].pts === pokerTotal,
    `window ${label}: chip leader tops the board with the whole ${pokerTotal}`);
  assert(rows.find(x => x.player === "Evan").pts === 0, `window ${label}: busted Evan at 0`);
}
r = await a.dispatch("clearResult", {
  evId: "poker",
  confirmClear: true,
  correctionReason: "E2E verifies that finale results remain reversible",
});
assert(r.ok, "clearResult re-arms the table");
await b.waitVersion(a.version);
assert(computeStandings(b.state)[0].pts !== pokerTotal, "board restored pre-poker");
r = await a.dispatch("pokerCancel", {});
assert(r.ok, "cleared finale can be canceled");
await b.waitVersion(a.version);
assert(JSON.stringify(computeStandings(b.state).map(row => ({ player:row.player, pts:row.pts })))
    === JSON.stringify(prePokerRows),
  "cancel removes only this table's minimum grants and restores the exact prior board");
const cancelVersion = a.version;
r = await a.dispatch("pokerCancel", {});
assert(r.ok && r.extra?.unchanged && a.version === cancelVersion,
  "retrying poker cancel is a no-op");

/* Phone and TV reconnects receive the same full authoritative version/state. */
{
  const hello = deviceId => {
    const socket = new WebSocket(BASE);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("no hello reply")), 3000);
      socket.onopen = () => socket.send(JSON.stringify({ type:"hello", deviceId }));
      socket.onmessage = event => {
        const message = JSON.parse(event.data);
        if (message.type !== "state") return;
        clearTimeout(timer);
        resolve({ message, socket });
      };
    });
  };
  const phone = await hello(b.deviceId);
  assert(phone.message.you === "Evan", "phone reconnect remembers Evan's device claim");
  assert(phone.message.version === b.version
      && JSON.stringify(phone.message.state.results) === JSON.stringify(b.state.results),
    "phone reconnect reconstructs the current authoritative board");
  phone.socket.close();

  const tv = await hello(`tv-${crypto.randomUUID()}`);
  assert(tv.message.you === null || tv.message.you === undefined,
    "TV reconnect remains unclaimed and read-only");
  assert(tv.message.environment === "local" && tv.message.version === b.version
      && JSON.stringify(tv.message.state) === JSON.stringify(b.state),
    "TV reconnect receives the same complete state and environment");
  tv.socket.close();
}

/* clean up: reset so the real weekend state is not polluted */
r = await a.dispatch("resetTournament", { confirm:RESET_PROGRESS_CONFIRMATION });
assert(r.ok, "cleanup reset");

log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} FAILURES`);
const closeSocket = ws => new Promise(resolve => {
  if (ws.readyState === WebSocket.CLOSED) return resolve();
  ws.addEventListener("close", resolve, { once:true });
  ws.close();
  setTimeout(resolve, 500);
});
await Promise.all([closeSocket(a.ws), closeSocket(b.ws)]);
process.exitCode = failures === 0 ? 0 : 1;
