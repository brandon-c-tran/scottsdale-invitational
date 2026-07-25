/* Single source of truth for game logic. Imported by BOTH the React client
   and the Durable Object. The server is authoritative; the client uses these
   for display only. */

const GM_PIN = "1016";
const STATE_KEY = "si-state-v5";

const ROSTER = ["Brandon","Evan","Eyob","Sahil","Khoa","Chinh","Adi","Chiang","Richard","Allan","Henry","Ben","Jeremy"];

const AWARDS = { 1:[1,0,0], 2:[2,1,0], 3:[3,2,1], 4:[4,2,1], 6:[6,3,1] };

/* rated skills, grouped for onboarding; ids are referenced by event.sport for balanced draws */
const SPORTS = [
  { id:"bball",      label:"Basketball",  group:"sport" },
  { id:"volley",     label:"Volleyball",  group:"sport" },
  { id:"spike",      label:"Spikeball",   group:"sport" },
  { id:"golf",       label:"Putting",     group:"sport" },
  { id:"pool",       label:"Pool",        group:"sport" },
  { id:"pingpong",   label:"Ping Pong",   group:"sport" },
  { id:"foosball",   label:"Foosball",    group:"sport" },
  { id:"pickleball", label:"Pickleball",  group:"sport" },
  { id:"kart",       label:"Mario Kart",  group:"drink" },
  { id:"pong",       label:"Beer Pong",   group:"drink" },
  { id:"die",        label:"Beer Die",    group:"drink" },
  { id:"flip",       label:"Flip Cup",    group:"drink" },
  { id:"cage",       label:"Rage Cage",   group:"drink" },
];
/* worst first so meters fill left to right */
const RATINGS = [
  { v:1,   label:"Never played" },
  { v:1.5, label:"Rough" },
  { v:2,   label:"Average" },
  { v:3,   label:"Solid" },
  { v:4,   label:"Elite" },
];

const SESSIONS = [
  { id:"fri", label:"Friday Night",       tag:"1 PT" },
  { id:"sam", label:"Saturday Morning",   tag:"2 PTS" },
  { id:"sap", label:"Saturday Afternoon", tag:"3 PTS" },
  { id:"san", label:"Saturday Night",     tag:"4 PTS" },
  { id:"fin", label:"The Finale",         tag:"6 / 3 / 1" },
];

/* events reference a GAMES entry by `game` for the how-to; `variant` picks the
   tab inside a multi-variant game like basketball */
const BUILTIN_EVENTS = [
  /* ── Friday night · 1 pt ── */
  { id:"putt", n:1, session:"fri", value:1, name:"Long Putt", kind:"solo", sport:"golf", game:"putting",
    desc:"Three attempts from one spot. Closest wins. A sunk putt beats everything. Ties: sudden death." },
  { id:"8ball", n:2, session:"fri", value:1, name:"8-Ball Doubles", kind:"pairs", sport:"pool", game:"8ball",
    teamCfg:{ teams:6, size:2, bracket:6 },
    desc:"Single elimination. One rack per matchup, alternating shots. Ball-in-hand on scratches." },
  { id:"pong", n:3, session:"fri", value:1, name:"Beer Pong Doubles", kind:"pairs", sport:"pong", game:"pong",
    teamCfg:{ teams:6, size:2, bracket:6 },
    desc:"Single elimination. Six cups, one re-rack. Bounce counts two, can be swatted. Redemption in semis and final." },
  { id:"die", n:4, session:"fri", value:1, name:"Beer Die", kind:"pairs", sport:"die", game:"die",
    teamCfg:{ teams:6, size:2, bracket:6 },
    desc:"Single elimination doubles. Toss the die over the line, they catch off the bounce. Sink it in a cup for the instant kill." },
  /* ── Saturday morning · 2 pts ── */
  { id:"bball", n:5, session:"sam", value:2, name:"3v3 Basketball", kind:"team", sport:"bball", game:"basketball", variant:"3v3",
    teamCfg:{ teams:4, size:3, bracket:4 },
    desc:"Half court to 7 by 1s and 2s, win by 1. Call your own fouls." },
  { id:"spike", n:6, session:"sam", value:2, name:"Spikeball Doubles", kind:"pairs", sport:"spike", game:"spikeball",
    teamCfg:{ teams:6, size:2 },
    desc:"Two pools, winners meet in the final. To 11, win by 2, cap 15." },
  { id:"pingpong", n:7, session:"sam", value:2, name:"Ping Pong", kind:"solo", sport:"pingpong", game:"pingpong",
    desc:"Round-robin heats, then a final. Games to 11, win by 2, serve switches every two." },
  { id:"foosball", n:8, session:"sam", value:2, name:"Foosball", kind:"pairs", sport:"foosball", game:"foosball",
    teamCfg:{ teams:6, size:2, bracket:6 },
    desc:"Single elimination doubles. Split the rods, no spinning, first to 10 goals." },
  /* ── Saturday afternoon · 3 pts ── */
  { id:"volley", n:9, session:"sap", value:3, name:"Sand Volleyball", kind:"team", sport:"volley", game:"volleyball",
    teamCfg:{ teams:2, size:6 },
    desc:"Best 2 of 3 sets to 15, win by 2, cap 17. Rotate servers." },
  { id:"nine", n:10, session:"sap", value:3, name:"Nine-Hole Putting", kind:"solo", sport:"golf", game:"putting",
    desc:"Nine holes, lowest total strokes. Max 5 per hole." },
  { id:"bball1", n:11, session:"sap", value:3, name:"1v1 Basketball", kind:"solo", sport:"bball", game:"basketball", variant:"1v1",
    desc:"Round-robin heats, then a final. Ones to 5, make it take it, win by 1." },
  { id:"pickleball", n:12, session:"sap", value:3, name:"Pickleball", kind:"pairs", sport:"pickleball", game:"pickleball",
    teamCfg:{ teams:6, size:2, bracket:6 },
    desc:"Single elimination doubles. Serve deep, stay out of the kitchen, rally it out. Games to 11, win by 2." },
  /* ── Saturday night · 4 pts ── */
  { id:"flip", n:13, session:"san", value:4, name:"Flip Cup", kind:"team", sport:"flip", game:"flipcup",
    teamCfg:{ teams:2, size:6 },
    desc:"Best of 3. Flip clean, next teammate goes." },
  { id:"beerio", n:14, session:"san", value:4, name:"Beerio Kart", kind:"solo", sport:"kart", game:"beerio",
    desc:"Heats of four, then a final. Crack a beer at the line, pull over to drink, finish it before you cross. Highest total wins." },
  { id:"bball5", n:15, session:"san", value:4, name:"5v5 Full Court", kind:"team", sport:"bball", game:"basketball", variant:"5v5",
    teamCfg:{ teams:2, size:5 },
    desc:"Full court, five a side. Twos and threes on the clock. Ahead at the horn wins." },
  { id:"ragecage", n:16, session:"san", value:4, name:"Rage Cage", kind:"solo", sport:"cage", game:"ragecage",
    desc:"Everyone circles the cups, two balls in play. Sink and stack, get stacked on and you are out. Last one standing wins." },
  /* ── The Finale · 6 / 3 / 1 ── */
  { id:"gauntlet", n:17, session:"fin", value:6, name:"The Gauntlet", kind:"solo", finale:true, game:"gauntlet",
    desc:"One timed circuit: pressure putt, flip your cup, pong shot, die toss, center cup. Fastest clean runs take it." },
];

/* the games library: one how-to per game, shared across events */
const GAMES = {
  putting: { name:"Putting", howto:{ players:"Solo", gear:["Putter","One ball"],
    objective:"Sink it, or finish closest to the pin.",
    steps:["Set up at the marked spot.","Putt for the hole, distance counts.","Closest ball beats a miss, a make beats everything.","Lowest strokes or closest putt wins, by event."],
    win:"Long Putt: closest of three attempts. Nine-Hole: fewest total strokes. Ties go to sudden death." } },
  "8ball": { name:"8-Ball", howto:{ players:"Pairs", gear:["Pool table","Full rack","Two cues"],
    objective:"Clear your group, then sink the 8.",
    steps:["Break, then split stripes and solids.","Partners alternate shots.","Clear your group of seven. A scratch is ball in hand for them.","Call and sink the 8 to win."],
    win:"First pair to legally pot the 8 takes the rack." } },
  pong: { name:"Beer Pong", howto:{ players:"Pairs", gear:["Table","Ten cups","Two balls"],
    objective:"Sink every cup on the far end first.",
    steps:["Rack six, one re-rack on request.","Both partners throw each turn.","Bounces count two and can be swatted.","Clear their last cup to win."],
    win:"First pair to sink all their cups wins.", house:"Redemption throw in the semis and final." } },
  die: { name:"Beer Die", howto:{ players:"Pairs", gear:["Table","One die","Four cups","A pour"],
    objective:"Land the die in their cup, or make them flub the catch.",
    steps:["Sit across the table, cups on your two corners.","Toss the die up past head height and onto the far end.","It has to bounce off the table, no darting it, no skying it.","They catch it one-handed off the bounce, or you score.","Sink it in a cup for the instant kill."],
    win:"First pair to the set score wins. Sinking the die ends it on the spot.",
    house:"Call your own height on the toss. A plunk means chug." } },
  basketball: { name:"Basketball", variants:[
    { id:"1v1", label:"1v1", howto:{ players:"Solo, heats then a final", gear:["Half court","One ball"],
      objective:"Beat your man to five.",
      steps:["Check the ball up top.","Everything counts one.","Make it, take it.","Call your own fouls.","First to five, win by one."],
      win:"First to five wins the game. Best record in your heat moves on." } },
    { id:"3v3", label:"3v3", howto:{ players:"Teams of three", gear:["Half court","One ball"],
      objective:"Outscore them to seven.",
      steps:["Check the ball up top.","Score by ones and twos.","Take it back past the arc on a turnover.","Call your own fouls.","First to seven, win by one."],
      win:"First team to seven wins." } },
    { id:"5v5", label:"5v5", howto:{ players:"Two teams of five", gear:["Full court","One ball","A clock"],
      objective:"Be ahead when the horn sounds.",
      steps:["Tip off to start.","Twos inside the arc, threes beyond it.","Clear past half on a change of possession.","Call your own fouls.","Two halves, running clock."],
      win:"Ahead at the horn wins.", house:"No hard contact." } },
  ]},
  spikeball: { name:"Spikeball", howto:{ players:"Pairs", gear:["Spikeball net","One ball"],
    objective:"Force them to miss the net.",
    steps:["Serve to the returner.","Three touches to hit the net back.","Move any direction after the serve.","A miss or bad hit ends the point."],
    win:"To eleven, win by two, cap fifteen." } },
  pingpong: { name:"Ping Pong", howto:{ players:"Solo", gear:["Table","Paddles","One ball"],
    objective:"Win points until eleven.",
    steps:["Rally for serve, then serve two and hand it over.","Serve must clear the net and bounce once each side.","Let it bounce once on your side before returning.","Games to eleven, win by two."],
    win:"Games to eleven, win by two. Best in the final takes it." } },
  foosball: { name:"Foosball", howto:{ players:"Pairs", gear:["Foosball table","One ball"],
    objective:"Score on their goal, defend yours.",
    steps:["Split the rods with your partner.","Serve through the side hole.","Pass and shoot. A full spin wipes the goal.","Dead ball resets to the serve.","Ball in their goal scores."],
    win:"First pair to ten goals wins." } },
  volleyball: { name:"Volleyball", howto:{ players:"Two teams", gear:["Sand court","Net","One ball"],
    objective:"Ground the ball on their side.",
    steps:["Serve from behind the line.","Three touches a side, clean contact only.","Rotate on every side-out.","Win the rally, win the point."],
    win:"Best two of three sets to fifteen, win by two, cap seventeen." } },
  pickleball: { name:"Pickleball", howto:{ players:"Pairs", gear:["Court","Paddles","One ball"],
    objective:"Win the rally without faulting in the kitchen.",
    steps:["Serve underhand, cross court, past the kitchen.","Let it bounce once each side before volleying.","Stay out of the kitchen on volleys.","Only the serving side scores."],
    win:"Games to eleven, win by two." } },
  flipcup: { name:"Flip Cup", howto:{ players:"Two teams", gear:["Cups","A table","A pour each"],
    objective:"Finish the line and flip clean before they do.",
    steps:["Line up across the table.","Drink it all, then set the cup on the edge.","Flip it upright with one finger.","Land it, the next teammate goes."],
    win:"First team down the line wins the round. Best of three." } },
  beerio: { name:"Beerio Kart", howto:{ players:"Heats of four", gear:["Switch","Four controllers","A beer each"],
    objective:"Win the race, but finish your beer to count.",
    steps:["Draw into a heat of four.","Crack a beer at the start line.","Pull over to drink, no sipping while you steer.","Finish the beer before the line, or sit there until it is gone."],
    win:"Best finishes advance to the final. Highest total wins." } },
  ragecage: { name:"Rage Cage", howto:{ players:"Solo, last standing", gear:["Ring of cups","Center cup","Two balls"],
    objective:"Never get caught holding a ball. Empty the ring before you.",
    steps:["Everyone circles the cups, two balls in play.","Bounce a ball into your cup, then pass it on.","Make it in one, stack your cup on the player to your left.","Get stacked on and you are out.","Sink the center cup to end it. Last player standing wins."],
    win:"Last one standing takes 1st. Elimination order sets 2nd and 3rd." } },
  gauntlet: { name:"The Gauntlet", howto:{ players:"Solo, on the clock", gear:["Putter","Cups","Pong ball","One die"],
    objective:"Clear five stations faster than everyone else.",
    steps:["Sink the pressure putt.","Flip your cup clean.","Hit a pong shot.","Land a die on the table.","Finish at the center cup. Miss a station, run it back."],
    win:"Fastest clean run takes 1st. The clock settles ties.",
    house:"One runner at a time. The room keeps time." } },
};

const SLOT_META = [
  { label:"1st", team:"Winners",    color:"var(--gold)" },
  { label:"2nd", team:"Runners-up", color:"#BDB2A0" },
  { label:"3rd", team:"3rd place",  color:"#C07A4B" },
];

const DRAW_METHODS = [
  { id:"balanced", name:"Balanced Draw",  desc:"Sealed ratings plus the live board, refined until the sides are even." },
  { id:"draft",    name:"Captains Draft", desc:"Captains pick in turn, live on every phone.", teamOnly:true },
];

const OUTRIGHT_MULT = 2; // winner pays 2:1; everything else pays even

/* head-to-head phone duels: challenge anyone, both play a 5-second minigame on
   your own phone, the pot settles itself. Both ante DUEL_STAKE. */
const DUEL_STAKE = 1;
const DUEL_GAMES = {
  quickdraw: { name:"Quick Draw", desc:"Hold steady. Tap when the screen flashes. Jump early and you forfeit." },
};

const SIZES = ["S", "M", "L", "XL", "XXL"];

const EMPTY_STATE = { v:5, live:false, results:{}, wagers:[], adjustments:[], seeds:{}, draws:{}, brackets:{},
  stages:{}, drafts:{}, duels:[], profiles:{}, customEvents:[], shelved:{}, onDeck:null, frozen:false, onboardEpoch:0,
  eventEdits:{}, eventOrder:[], updatedAt:0 };

/* ─────────── helpers ─────────── */
/* built-ins can be edited (name, desc, value, session) via state.eventEdits and
   reordered via state.eventOrder; results and wagers key off ids so both are safe */
function allEventsOf(state) {
  const evs = [
    ...BUILTIN_EVENTS.map(e => ({ ...e, ...(state.eventEdits?.[e.id] || {}) })),
    ...(state.customEvents || []),
  ];
  const ord = state.eventOrder || [];
  if (ord.length) {
    const idx = id => { const i = ord.indexOf(id); return i < 0 ? 999 : i; };
    evs.sort((a, b) => idx(a.id) - idx(b.id) || (a.n || 99) - (b.n || 99));
  }
  return evs;
}
const disp = (state, p) => state.profiles?.[p]?.display || p;
const shuffle = arr => { const a = [...arr]; for (let i = a.length-1; i > 0; i--) { const j = Math.floor(Math.random()*(i+1)); [a[i],a[j]] = [a[j],a[i]]; } return a; };
/* snake draft order: pick #k (0-indexed) over T teams -> which team is on the clock */
const snakeTeam = (k, T) => { const r = Math.floor(k / T), p = k % T; return r % 2 === 0 ? p : T - 1 - p; };

/* mascot bank for teams of 3+; assigned at draw time, stable for the event */
const TEAM_NAMES = ["The Sidewinders","The Javelinas","The Roadrunners","The Coyotes","The Scorpions",
  "The Gila Monsters","The Jackrabbits","The Rattlers","The Dust Devils","The Bobcats","The Vultures","The Quail"];

function teamLabel(state, t) {
  if (t.name) return t.name;
  const names = t.players.map(p => disp(state, p));
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `Team ${names[0]}`;
}

/* stages: heats (solo) and pools (teams). groups produce advancers; the
   final's winner can prefill the official result. */
function stageFinalists(st) {
  if (!st) return null;
  return st.groups.every(g => (g.through || []).length >= st.advance)
    ? st.groups.flatMap(g => g.through) : null;
}
function stageEntrantView(state, st, key) {
  if (st.entrantType === "team") {
    const draw = state.draws[st.eventId];
    const t = draw?.teams?.[key];
    return t ? { players:t.players, name:teamLabel(state, t) } : { players:[], name:"?" };
  }
  return { players:[key], name: disp(state, key) };
}

/* wager resolution is DERIVED from official state, never written. */
function resolveWager(state, w, events) {
  if (w.status === "void") return { status:"void", delta:0 };
  const ev = events.find(e => e.id === w.eventId);
  if (!ev) return { status:"void", delta:0 };
  if (w.kind === "outright") {
    if (w.pickTeam) {
      const draw = state.draws[w.eventId];
      if (!draw || draw.id !== w.drawId) return { status:"void", delta:0 };
    }
    const res = state.results[w.eventId];
    if (!res || !res.slots?.[0]) return { status:"pending", delta:0 };
    const winners = res.slots[0];
    const won = w.pickTeam
      ? w.pickPlayers.every(p => winners.includes(p))
      : winners.includes(w.pick);
    return { status: won ? "won" : "lost", delta: won ? OUTRIGHT_MULT * w.stake : -w.stake };
  }
  if (w.kind === "match") {
    const draw = state.draws[w.eventId];
    if (!draw || draw.id !== w.drawId) return { status:"void", delta:0 };
    const br = state.brackets[w.eventId];
    const match = br?.rounds?.[w.match[0]]?.[w.match[1]];
    if (!match) return { status:"void", delta:0 };
    if (match.winner === null || match.winner === undefined) return { status:"pending", delta:0 };
    const won = match.winner === w.teamIdx;
    return { status: won ? "won" : "lost", delta: won ? w.stake : -w.stake };
  }
  if (w.kind === "stage") {
    const st = state.stages[w.eventId];
    if (!st || st.id !== w.stagesId) return { status:"void", delta:0 };
    if (st.entrantType === "team") {
      const draw = state.draws[w.eventId];
      if (!draw || draw.id !== st.drawId) return { status:"void", delta:0 };
    }
    if (w.final) {
      if (st.finalWinner === null || st.finalWinner === undefined) return { status:"pending", delta:0 };
      const won = st.finalWinner === w.pickKey;
      return { status: won ? "won" : "lost", delta: won ? w.stake : -w.stake };
    }
    const g = st.groups[w.group];
    if (!g) return { status:"void", delta:0 };
    if ((g.through || []).length < st.advance) return { status:"pending", delta:0 };
    const won = g.through.includes(w.pickKey);
    return { status: won ? "won" : "lost", delta: won ? w.stake : -w.stake };
  }
  return { status:"void", delta:0 };
}

/* duel outcome is DERIVED from the two stored runs, never written. A foul
   loses to a clean draw; two fouls or identical times push, chips go back. */
function resolveDuel(duel) {
  if (duel.status !== "open") return { settled:false, status:duel.status };
  const a = duel.runs?.[duel.from], b = duel.runs?.[duel.to];
  if (!a || !b) return { settled:false, status:"open" };
  const score = r => (r.foul ? Infinity : r.ms);
  if (score(a) === score(b)) return { settled:true, push:true };
  const winner = score(a) < score(b) ? duel.from : duel.to;
  return { settled:true, push:false, winner, loser: winner === duel.from ? duel.to : duel.from };
}

function computeStandings(state) {
  const pts = {}, wins = {}, betNet = {}, duelNet = {}, awardPts = {};
  ROSTER.forEach(p => { pts[p] = 5; wins[p] = 0; betNet[p] = 0; duelNet[p] = 0; awardPts[p] = 0; });
  const evs = allEventsOf(state);
  Object.entries(state.results || {}).forEach(([eid, res]) => {
    const ev = evs.find(e => e.id === eid); if (!ev || !res) return;
    const table = AWARDS[ev.value];
    (res.slots || []).forEach((players, i) => (players || []).forEach(p => {
      if (pts[p] === undefined) return;
      pts[p] += table[i] || 0;
      awardPts[p] += table[i] || 0;
      if (i === 0) wins[p] += 1;
    }));
  });
  (state.wagers || []).forEach(w => {
    const r = resolveWager(state, w, evs);
    if (r.status === "won" || r.status === "lost") {
      if (pts[w.player] !== undefined) { pts[w.player] += r.delta; betNet[w.player] += r.delta; }
    }
  });
  (state.duels || []).forEach(d => {
    const r = resolveDuel(d);
    if (!r.settled || r.push) return;
    if (pts[r.winner] !== undefined) { pts[r.winner] += d.stake; duelNet[r.winner] += d.stake; }
    if (pts[r.loser] !== undefined) { pts[r.loser] -= d.stake; duelNet[r.loser] -= d.stake; }
  });
  (state.adjustments || []).forEach(a => { if (pts[a.player] !== undefined) pts[a.player] += a.delta; });
  const rows = ROSTER.map(p => ({ player:p, pts:pts[p], wins:wins[p], betNet:betNet[p], duelNet:duelNet[p], awardPts:awardPts[p] }))
    .sort((x,y) => y.pts - x.pts || y.wins - x.wins || x.player.localeCompare(y.player));
  let rank = 0, prev = null;
  rows.forEach((r,i) => { if (r.pts !== prev) { rank = i+1; prev = r.pts; } r.rank = rank; });
  return rows;
}
/* championship scenarios going into the finale: who is still mathematically
   alive and the weakest finale finish that keeps them alive. Awards only;
   open wagers are ignored (they cannot be bounded). Ties count as alive
   because a championship tie goes to the pressure putt. */
function computeScenarios(state) {
  const evs = allEventsOf(state);
  const finale = evs.find(e => e.finale && !state.shelved?.[e.id]);
  if (!finale || state.results[finale.id] || state.frozen) return null;
  const table = AWARDS[finale.value] || [6, 3, 1];
  const rows = computeStandings(state);
  const options = [0, table[2] || 0, table[1] || 0, table[0] || 0];
  const NEED = ["any finish", "3rd or better", "2nd or better", "the win"];
  const alive = [];
  rows.forEach(r => {
    for (let i = 0; i < options.length; i++) {
      const mine = r.pts + options[i];
      const rem = table.filter(v => v > 0);
      if (i > 0) rem.splice(rem.indexOf(options[i]), 1);
      const remD = [...rem].sort((a, b) => b - a);
      const others = rows.filter(x => x.player !== r.player).map(x => x.pts).sort((a, b) => a - b);
      if (others.every((v, j) => v + (j < remD.length ? remD[j] : 0) <= mine)) {
        alive.push({ player: r.player, pts: r.pts, needIdx: i, need: NEED[i] });
        break;
      }
    }
  });
  return { finaleId: finale.id, finaleName: finale.name, alive, total: rows.length };
}

function atRisk(state, p, events) {
  return (state.wagers || [])
    .filter(w => w.player === p && resolveWager(state, w, events).status === "pending")
    .reduce((s,w) => s + w.stake, 0);
}

/* ─────────── the balanced draw ───────────
   The only way teams get made (captains draft aside). Live strength per
   player: the sealed survey is the baseline and the actual weekend bends it,
   so a Friday draw leans on the survey and a Sunday draw leans on results.
   Every part is normalized to the current field, weights sum to 1:
     0.35 sport survey + 0.15 overall survey + 0.35 event points + 0.15 wins */
function playerStrength(state, p, sport, rows) {
  rows = rows || computeStandings(state);
  const norm = (x, lo, hi) => (hi > lo ? (x - lo) / (hi - lo) : 0.5);
  const sv = state.seeds?.[p] || {};
  const vals = Object.values(sv);
  const overall = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 2;
  const r = rows.find(x => x.player === p);
  const aps = rows.map(x => x.awardPts), ws = rows.map(x => x.wins);
  return 0.35 * norm(sv[sport] ?? 2, 1, 4)
       + 0.15 * norm(overall, 1, 4)
       + 0.35 * norm(r?.awardPts ?? 0, Math.min(...aps), Math.max(...aps))
       + 0.15 * norm(r?.wins ?? 0, Math.min(...ws), Math.max(...ws));
}
/* strengths get a small jitter so back-to-back draws differ and nobody can
   reverse-engineer their sealed rating off team composition */
const JITTER = 0.05;
function strengthMap(state, players, sport, rows) {
  rows = rows || computeStandings(state);
  const m = {};
  players.forEach(p => { m[p] = playerStrength(state, p, sport, rows) + (Math.random() * 2 - 1) * JITTER; });
  return m;
}
/* snake-seed, then recursively swap players across teams while any single
   swap tightens the spread of team averages. First improving swap recurses;
   no improving swap means a local optimum, done. Depth-capped for safety. */
function refineTeams(groups, strengthOf, depth = 0) {
  const avg = g => g.reduce((s, k) => s + strengthOf(k), 0) / g.length;
  const spread = gs => { const a = gs.map(avg); return Math.max(...a) - Math.min(...a); };
  if (depth > 60) return groups;
  const best = spread(groups);
  for (let i = 0; i < groups.length; i++)
    for (let j = i + 1; j < groups.length; j++)
      for (let a = 0; a < groups[i].length; a++)
        for (let b = 0; b < groups[j].length; b++) {
          const gi = [...groups[i]], gj = [...groups[j]];
          [gi[a], gj[b]] = [gj[b], gi[a]];
          const next = groups.map((g, k) => (k === i ? gi : k === j ? gj : g));
          if (spread(next) + 1e-9 < best) return refineTeams(next, strengthOf, depth + 1);
        }
  return groups;
}
function seedSnake(keys, nGroups, strengthOf) {
  const groups = Array.from({ length: nGroups }, () => []);
  [...keys].sort((a, b) => strengthOf(b) - strengthOf(a)).forEach((k, i) => {
    const round = Math.floor(i / nGroups);
    groups[round % 2 === 0 ? i % nGroups : nGroups - 1 - (i % nGroups)].push(k);
  });
  return groups;
}

function drawTeams(ev, state, players) {
  const cfg = ev.teamCfg; if (!cfg) return null;
  const s = strengthMap(state, players, ev.sport);
  const nTeams = Math.min(cfg.teams, players.length);
  const groups = refineTeams(seedSnake(players, nTeams, p => s[p]), p => s[p]).map(g => shuffle(g));
  const mascots = (cfg.size || 0) >= 3 ? shuffle(TEAM_NAMES) : null;
  return { id:"d"+Date.now(), method:"balanced", ts:Date.now(),
    teams: groups.map((players, i) => mascots ? { players, name: mascots[i % mascots.length] } : { players }) };
}

function splitIntoGroups(keys, nGroups, strengthOf) {
  return refineTeams(seedSnake(keys, nGroups, strengthOf), strengthOf).map(g => shuffle(g));
}

function makeBracket(n) {
  if (n === 4) return { size:4, rounds:[
    [ {a:{t:0},b:{t:3},winner:null}, {a:{t:1},b:{t:2},winner:null} ],
    [ {a:{w:[0,0]},b:{w:[0,1]},winner:null} ],
  ]};
  if (n === 6) return { size:6, rounds:[
    [ {a:{t:3},b:{t:4},winner:null}, {a:{t:2},b:{t:5},winner:null} ],
    [ {a:{t:0},b:{w:[0,0]},winner:null}, {a:{t:1},b:{w:[0,1]},winner:null} ],
    [ {a:{w:[1,0]},b:{w:[1,1]},winner:null} ],
  ]};
  return null;
}
const ROUND_NAMES = { 4:["Semifinals","Final"], 6:["Play-in","Semifinals","Final"] };
function resolveSlot(br, slot) {
  if (!slot) return null;
  if (slot.t !== undefined) return slot.t;
  const src = br.rounds[slot.w[0]]?.[slot.w[1]];
  return src && src.winner !== null && src.winner !== undefined ? src.winner : null;
}
const bracketChampion = br => {
  const last = br.rounds[br.rounds.length-1][0];
  return last.winner ?? null;
};

export {
  GM_PIN, ROSTER, AWARDS, SPORTS, RATINGS, SESSIONS, BUILTIN_EVENTS, SLOT_META,
  DRAW_METHODS, OUTRIGHT_MULT, DUEL_STAKE, DUEL_GAMES, EMPTY_STATE, SIZES, TEAM_NAMES, GAMES,
  allEventsOf, disp, shuffle, snakeTeam, teamLabel, stageFinalists, stageEntrantView,
  resolveWager, resolveDuel, computeStandings, computeScenarios, atRisk, drawTeams, splitIntoGroups,
  playerStrength, strengthMap, refineTeams,
  makeBracket, ROUND_NAMES, resolveSlot, bracketChampion,
};
