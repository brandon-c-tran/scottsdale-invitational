/* Two-window full-loop verification against the local dev server.
   Window A = Brandon (claims, unlocks GM, runs the draw, advances bracket, posts result).
   Window B = Evan (claims, places wagers).
   Mirrors exactly what src/App.jsx dispatches; asserts both windows receive
   the same authoritative broadcasts and that wagers settle simultaneously. */

import { resolveWager, computeStandings, allEventsOf, resolveSlot, bracketChampion }
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
r = await b.dispatch("runDraw", { evId: "8ball", method: "random", players: null });
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
r = await a.dispatch("runDraw", { evId: "8ball", method: "random", players: ROSTER.filter(p => p !== "Evan") });
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
  pickTeam: true, pickPlayers: [...t0.players], drawId: draw.id, stake: 2 } });
assert(r.ok, "Evan places outright wager (2 on team 0)");
r = await b.dispatch("placeWager", { wager: { kind: "outright", eventId: "8ball", evName: "8-Ball Doubles",
  pickTeam: true, pickPlayers: [...t0.players], drawId: draw.id, stake: 2 } });
assert(!r.ok, "Evan's second 2-stake rejected, max 3 at risk (rejected: " + r.error + ")");
r = await b.dispatch("placeWager", { wager: { kind: "outright", eventId: "8ball", evName: "8-Ball Doubles",
  pickTeam: true, pickPlayers: [...t0.players], drawId: "stale-draw-id", stake: 1 } });
assert(!r.ok, "stale drawId rejected (" + r.error + ")");

const m00 = br0.rounds[0][0];
const aIdx = m00.a.t, bIdx = m00.b.t;
r = await b.dispatch("placeWager", { wager: { kind: "match", eventId: "8ball", evName: "8-Ball Doubles",
  teamIdx: aIdx, pickPlayers: [...draw.teams[aIdx].players], pickTeam: true, drawId: draw.id,
  match: [0, 0], matchName: "Play-in", stake: 1 } });
assert(r.ok, "Evan places matchup wager (1 on play-in)");
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
  assert(res.status === "won" && res.delta === 1, "the matchup wager settled WON +1 on window B immediately");
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
  matchName: "Final", stake: 1 } });
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
  assert(res.status === "won" && res.delta === 4, `window ${label}: Evan's outright settled WON +4 (2:1 on stake 2)`);
  assert(win.state.onDeck === null, `window ${label}: betting closed automatically on result`);
}
const sA = computeStandings(a.state), sB = computeStandings(b.state);
assert(JSON.stringify(sA) === JSON.stringify(sB), "standings identical on both windows");
const evanRow = sB.find(x => x.player === "Evan");
assert(evanRow.pts === 10 && evanRow.betNet === 5, `Evan at 10 pts (5 start +4 outright +1 matchup), got ${evanRow.pts}`);
const lastA = a.broadcasts.at(-1), lastB = b.broadcasts.at(-1);
assert(lastA.version === lastB.version && lastA.lastAction === "saveResult" && lastB.lastAction === "saveResult",
  `both windows received the saveResult broadcast at version ${lastA.version}, ${Math.abs(lastA.at - lastB.at)}ms apart`);

/* betting stays closed after result */
r = await b.dispatch("placeWager", { wager: { kind: "outright", eventId: "8ball", evName: "8-Ball Doubles",
  pickTeam: true, pickPlayers: [...t0.players], drawId: draw.id, stake: 1 } });
assert(!r.ok, "no wagers after result posted (" + r.error + ")");

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
