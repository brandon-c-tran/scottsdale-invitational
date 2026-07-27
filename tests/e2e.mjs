/* Two-window full-loop verification against the local dev server.
   Window A = Brandon (claims, unlocks GM, runs the draw, advances bracket, posts result).
   Window B = Evan (claims, places wagers).
   Mirrors exactly what src/App.jsx dispatches; asserts both windows receive
   the same authoritative broadcasts and that wagers settle simultaneously. */

import { resolveWager, computeStandings, allEventsOf, resolveSlot, bracketChampion, CHIP_COLORS }
  from "../shared/core.js";

const BASE = process.env.WS_BASE || "ws://localhost:5173/ws";
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
    aid: 0, pending: new Map(), broadcasts: [],
    send(obj) { ws.send(JSON.stringify({ ...obj, deviceId, gmToken: win.gmToken })); },
    dispatch(type, payload) {
      return new Promise(resolve => {
        const actionId = "a" + (++win.aid) + "-" + name;
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
r = await a.dispatch("resetTournament", {});
assert(r.ok, "GM resets tournament for a clean run");
await b.waitVersion(a.version);

/* ── draw 8-Ball ── */
const ROSTER = ["Brandon","Evan","Eyob","Sahil","Khoa","Chinh","Adi","Chiang","Richard","Allan","Henry","Ben","Jeremy"];
/* Evan sits out the draw so his wagers are never against his own team */
r = await a.dispatch("runDraw", { evId: "8ball", players: ROSTER.filter(p => p !== "Evan") });
assert(r.ok, "GM draws 8-Ball teams");
await b.waitVersion(a.version);
const draw = b.state.draws["8ball"];
assert(draw && draw.teams.length === 6, "draw produced 6 teams (window B sees it)");
assert(draw.teams.flatMap(t => t.players).length === 12, "all 12 entrants placed");
const br0 = b.state.brackets["8ball"];
assert(br0 && br0.size === 6, "6-team bracket created");

/* ── open betting ── */
r = await a.dispatch("setOnDeck", { id: "8ball" });
assert(r.ok, "GM opens betting (on deck)");
await b.waitVersion(a.version);
assert(b.state.onDeck === "8ball", "window B sees betting open");

/* ── wagers from both windows ── */
const t0 = draw.teams[0];
r = await b.dispatch("placeWager", { wager: { kind: "outright", eventId: "8ball", evName: "8-Ball Doubles",
  pickTeam: true, pickPlayers: [...t0.players], drawId: draw.id, stake: 400 } });
assert(r.ok, "Evan places outright wager (400 on team 0)");
r = await b.dispatch("placeWager", { wager: { kind: "outright", eventId: "8ball", evName: "8-Ball Doubles",
  pickTeam: true, pickPlayers: [...t0.players], drawId: draw.id, stake: 400 } });
assert(!r.ok, "Evan's second 400 rejected, 500 cap at 1000 points (rejected: " + r.error + ")");
r = await b.dispatch("placeWager", { wager: { kind: "outright", eventId: "8ball", evName: "8-Ball Doubles",
  pickTeam: true, pickPlayers: [...t0.players], drawId: "stale-draw-id", stake: 200 } });
assert(!r.ok, "stale drawId rejected (" + r.error + ")");

const m00 = br0.rounds[0][0];
const aIdx = m00.a.t, bIdx = m00.b.t;
r = await b.dispatch("placeWager", { wager: { kind: "match", eventId: "8ball", evName: "8-Ball Doubles",
  teamIdx: aIdx, pickPlayers: [...draw.teams[aIdx].players], pickTeam: true, drawId: draw.id,
  match: [0, 0], matchName: "Play-in", stake: 100 } });
assert(r.ok, "Evan places matchup wager (100 on play-in)");
await b.waitVersion(a.version);
assert(b.state.wagers.length === 2, "both open wagers visible in window B");

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

/* a duel settles into the standings, zero sum */
{
  const before = computeStandings(a.state);
  const pts0 = Object.fromEntries(before.map(x => [x.player, x.pts]));
  r = await b.dispatch("sendDuel", { to: "Khoa", game: "quickdraw" });
  assert(r.ok, "Evan calls out Khoa");
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

/* the buy-in floor: a short stack is staked to 600 at setup */
{
  const chinh = computeStandings(a.state).find(x => x.player === "Chinh").pts;
  r = await a.dispatch("adjust", { player: "Chinh", delta: 400 - chinh, reason: "floor test" });
  assert(r.ok, "GM ruling drops Chinh to 400");
}

r = await a.dispatch("setOnDeck", { id: null });
assert(r.ok, "betting closed");
r = await a.dispatch("pokerSetup", {});
assert(r.ok, "table set");
await b.waitVersion(a.version);
{
  const stake = b.state.adjustments.find(x => x.reason === "Table stakes");
  assert(stake?.player === "Chinh" && stake.delta === 200, "table stakes ruling staked Chinh to 600");
  assert(computeStandings(b.state).find(x => x.player === "Chinh").pts === 600, "Chinh sits with 600");
}
await b.waitVersion(a.version);
const pokerTotal = b.state.poker.total;
assert(pokerTotal === computeStandings(b.state).reduce((s, x) => s + x.pts, 0),
  "buy-in total matches the board");
r = await a.dispatch("setOnDeck", { id: "poker" });
assert(!r.ok, "no betting on the finale (rejected: " + r.error + ")");
r = await a.dispatch("pokerStart", {});
assert(r.ok, "shuffle up and deal");
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
}
r = await a.dispatch("pokerResult", {});
assert(r.ok, "final counts posted");
await b.waitVersion(a.version);
for (const [label, win] of [["A", a], ["B", b]]) {
  const rows = computeStandings(win.state);
  assert(rows[0].player === "Brandon" && rows[0].pts === pokerTotal,
    `window ${label}: chip leader tops the board with the whole ${pokerTotal}`);
  assert(rows.find(x => x.player === "Evan").pts === 0, `window ${label}: busted Evan at 0`);
}
r = await a.dispatch("clearResult", { evId: "poker" });
assert(r.ok, "clearResult re-arms the table");
await b.waitVersion(a.version);
assert(computeStandings(b.state)[0].pts !== pokerTotal, "board restored pre-poker");

/* reconnect check: fresh hello returns claim identity */
{
  const ws2 = new WebSocket(BASE);
  const you = await new Promise((res, rej) => {
    ws2.onopen = () => ws2.send(JSON.stringify({ type: "hello", deviceId: b.deviceId }));
    ws2.onmessage = e => { const m = JSON.parse(e.data); if (m.type === "state") res(m.you); };
    setTimeout(() => rej(new Error("no hello reply")), 3000);
  });
  assert(you === "Evan", "reconnect: server remembers Evan's device claim");
  ws2.close();
}

/* clean up: reset so the real weekend state is not polluted */
r = await a.dispatch("resetTournament", {});
assert(r.ok, "cleanup reset");

log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} FAILURES`);
a.ws.close(); b.ws.close();
process.exit(failures === 0 ? 0 : 1);
