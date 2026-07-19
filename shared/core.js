/* Single source of truth for game logic. Imported by BOTH the React client
   and the Durable Object. The server is authoritative; the client uses these
   for display only. */

const GM_PIN = "1016";
const STATE_KEY = "si-state-v5";

const ROSTER = ["Brandon","Evan","Eyob","Sahil","Khoa","Chinh","Adi","Chiang","Richard","Allan","Henry","Ben","Jeremy"];

const AWARDS = { 1:[1,0,0], 2:[2,1,0], 3:[3,2,1], 4:[4,2,1], 6:[6,3,1] };

const SPORTS = [
  { id:"bball",  label:"Basketball" },
  { id:"volley", label:"Volleyball" },
  { id:"spike",  label:"Spikeball" },
  { id:"golf",   label:"Putting" },
  { id:"pool",   label:"Pool" },
  { id:"kart",   label:"Mario Kart" },
];
const RATINGS = [
  { v:4,   label:"Elite" },
  { v:3,   label:"Solid" },
  { v:1.5, label:"Rough" },
  { v:2,   label:"No idea" },
  { v:1,   label:"Never played" },
];

const SESSIONS = [
  { id:"fri", label:"Friday Night",       tag:"1 PT" },
  { id:"sam", label:"Saturday Morning",   tag:"2 PTS" },
  { id:"sap", label:"Saturday Afternoon", tag:"3 PTS" },
  { id:"san", label:"Saturday Night",     tag:"4 PTS" },
  { id:"fin", label:"The Finale",         tag:"6 · 3 · 1" },
];

const BUILTIN_EVENTS = [
  { id:"putt", n:1, session:"fri", value:1, name:"Long Putt", loc:"The Green", kind:"solo", sport:"golf",
    desc:"Three attempts from one long spot. Closest to the cup wins. A sunk putt beats everything. Ties: sudden-death putt." },
  { id:"8ball", n:2, session:"fri", value:1, name:"8-Ball Doubles", loc:"Garage", kind:"pairs", sport:"pool",
    teamCfg:{ teams:6, size:2, bracket:6 },
    desc:"Pairs, single elimination. One rack per matchup, alternating shots. Ball-in-hand on scratches." },
  { id:"kart", n:3, session:"fri", value:1, name:"Mario Kart GP", loc:"Living Room", kind:"solo", sport:"kart",
    desc:"Heats of four, four races each, in-game points. Top finishers run a four-race final. Highest total wins." },
  { id:"pong", n:4, session:"fri", value:1, name:"Beer Pong Doubles", loc:"Patio", kind:"pairs",
    teamCfg:{ teams:6, size:2, bracket:6 },
    desc:"Pairs, single elimination. Six cups, one re-rack. Bounce counts two but can be swatted. Redemption in semis and final. Rack cups hold water." },
  { id:"bball", n:5, session:"sam", value:2, name:"3v3 Basketball", loc:"Sport Court", kind:"team", sport:"bball",
    teamCfg:{ teams:4, size:3, bracket:4 },
    desc:"Four teams. Half court, to 7 by 1s and 2s, win by 1. Call your own fouls. No hard contact." },
  { id:"spike", n:6, session:"sam", value:2, name:"Spikeball Doubles", loc:"Back Turf", kind:"pairs", sport:"spike",
    teamCfg:{ teams:6, size:2 },
    desc:"Pairs, two pools, pool winners meet in the final. First to 11, win by 2, cap 15." },
  { id:"volley", n:7, session:"sap", value:3, name:"Sand Volleyball", loc:"Sand Court", kind:"team", sport:"volley",
    teamCfg:{ teams:2, size:6 },
    desc:"Two teams. Best 2 of 3 sets to 15, win by 2, cap 17. Rotate servers. Sport court is the weather backup." },
  { id:"nine", n:8, session:"sap", value:3, name:"Nine-Hole Putting", loc:"The Green", kind:"solo", sport:"golf",
    desc:"Nine holes built around the green. Lowest total strokes wins. Max 5 per hole." },
  { id:"relay", n:9, session:"sap", value:3, name:"Four-Station Relay", loc:"Full Yard", kind:"team",
    teamCfg:{ teams:3, size:4 },
    desc:"Cornhole, free throw, target serve, pressure putt. Clear your station or take the penalty. First full team home wins." },
  { id:"flip", n:10, session:"san", value:4, name:"Flip Cup", loc:"Patio", kind:"team",
    teamCfg:{ teams:2, size:6 },
    desc:"Two teams, best of 3. Standard pour or NA equivalent, flip clean, next teammate goes." },
  { id:"karaoke", n:11, session:"san", value:4, name:"Karaoke", loc:"Living Room", kind:"team",
    teamCfg:{ teams:4, size:3 },
    desc:"Trios, one song each, ten minutes to prep. Secret ballot on commitment, entertainment, crowd response. Beerio Kart is the swap." },
  { id:"finale", n:12, session:"fin", value:6, name:"Jackbox Finale", loc:"Living Room", kind:"solo", finale:true,
    desc:"Quiplash, then Fibbage. Placements combine into one finish order. Pays 6 / 3 / 1, individual only. Championship tie: one pressure putt on the green." },
];

const SLOT_META = [
  { label:"1st", team:"Winners",    color:"var(--gold)" },
  { label:"2nd", team:"Runners-up", color:"#BDB2A0" },
  { label:"3rd", team:"3rd place",  color:"#C07A4B" },
];

const DRAW_METHODS = [
  { id:"random",   name:"Blind Draw",    desc:"Names out of a hat." },
  { id:"balanced", name:"Balanced Draw", desc:"Sealed seeds spread the talent.", needsSport:true },
  { id:"seeded",   name:"Buddy System",  desc:"Top seeds paired with bottom seeds.", pairsOnly:true, needsSport:true },
];

const OUTRIGHT_MULT = 2; // winner pays 2:1; everything else pays even

const EMPTY_STATE = { v:5, results:{}, wagers:[], adjustments:[], seeds:{}, draws:{}, brackets:{},
  stages:{}, profiles:{}, customEvents:[], shelved:{}, onDeck:null, frozen:false, onboardEpoch:0, updatedAt:0 };

/* ─────────── helpers ─────────── */
const allEventsOf = state => [...BUILTIN_EVENTS, ...(state.customEvents || [])];
const disp = (state, p) => state.profiles?.[p]?.display || p;
const shuffle = arr => { const a = [...arr]; for (let i = a.length-1; i > 0; i--) { const j = Math.floor(Math.random()*(i+1)); [a[i],a[j]] = [a[j],a[i]]; } return a; };

function teamLabel(state, t) {
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

function computeStandings(state) {
  const pts = {}, wins = {}, betNet = {};
  ROSTER.forEach(p => { pts[p] = 5; wins[p] = 0; betNet[p] = 0; });
  const evs = allEventsOf(state);
  Object.entries(state.results || {}).forEach(([eid, res]) => {
    const ev = evs.find(e => e.id === eid); if (!ev || !res) return;
    const table = AWARDS[ev.value];
    (res.slots || []).forEach((players, i) => (players || []).forEach(p => {
      if (pts[p] === undefined) return;
      pts[p] += table[i] || 0;
      if (i === 0) wins[p] += 1;
    }));
  });
  (state.wagers || []).forEach(w => {
    const r = resolveWager(state, w, evs);
    if (r.status === "won" || r.status === "lost") {
      if (pts[w.player] !== undefined) { pts[w.player] += r.delta; betNet[w.player] += r.delta; }
    }
  });
  (state.adjustments || []).forEach(a => { if (pts[a.player] !== undefined) pts[a.player] += a.delta; });
  const rows = ROSTER.map(p => ({ player:p, pts:pts[p], wins:wins[p], betNet:betNet[p] }))
    .sort((x,y) => y.pts - x.pts || y.wins - x.wins || x.player.localeCompare(y.player));
  let rank = 0, prev = null;
  rows.forEach((r,i) => { if (r.pts !== prev) { rank = i+1; prev = r.pts; } r.rank = rank; });
  return rows;
}
function atRisk(state, p, events) {
  return (state.wagers || [])
    .filter(w => w.player === p && resolveWager(state, w, events).status === "pending")
    .reduce((s,w) => s + w.stake, 0);
}

function drawTeams(ev, method, seeds, players) {
  const cfg = ev.teamCfg; if (!cfg) return null;
  const skill = p => (seeds[p]?.[ev.sport] ?? 2) + (Math.random()*0.6 - 0.3);
  let groups;
  if (method === "seeded") {
    const s = [...players].sort((a,b) => skill(b) - skill(a));
    groups = [];
    let lo = s.length - 1, hi = 0;
    while (hi < lo) { groups.push([s[hi], s[lo]]); hi++; lo--; }
    if (hi === lo && groups.length) groups[groups.length-1].push(s[hi]);
    else if (hi === lo) groups.push([s[hi]]);
  } else {
    const nTeams = Math.min(cfg.teams, players.length);
    groups = Array.from({length:nTeams}, () => []);
    if (method === "random") {
      shuffle(players).forEach((p,i) => groups[i % nTeams].push(p));
    } else {
      const s = [...players].sort((a,b) => skill(b) - skill(a));
      s.forEach((p,i) => {
        const round = Math.floor(i / nTeams);
        const idx = round % 2 === 0 ? i % nTeams : nTeams - 1 - (i % nTeams);
        groups[idx].push(p);
      });
      groups = groups.map(g => shuffle(g));
    }
  }
  return { id:"d"+Date.now(), method, ts:Date.now(), teams: groups.map(players => ({ players })) };
}

function splitIntoGroups(keys, nGroups, method, skillOf) {
  const groups = Array.from({length:nGroups}, () => []);
  if (method === "balanced" && skillOf) {
    const s = [...keys].sort((a,b) => skillOf(b) - skillOf(a));
    s.forEach((k,i) => {
      const round = Math.floor(i / nGroups);
      const idx = round % 2 === 0 ? i % nGroups : nGroups - 1 - (i % nGroups);
      groups[idx].push(k);
    });
    return groups.map(g => shuffle(g));
  }
  shuffle(keys).forEach((k,i) => groups[i % nGroups].push(k));
  return groups;
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
  DRAW_METHODS, OUTRIGHT_MULT, EMPTY_STATE,
  allEventsOf, disp, shuffle, teamLabel, stageFinalists, stageEntrantView,
  resolveWager, computeStandings, atRisk, drawTeams, splitIntoGroups,
  makeBracket, ROUND_NAMES, resolveSlot, bracketChampion,
};
