/* Single source of truth for game logic. Imported by BOTH the React client
   and the Durable Object. The server is authoritative; the client uses these
   for display only. */

const GM_PIN = "1016";

const ROSTER = ["Brandon","Evan","Eyob","Sahil","Khoa","Chinh","Adi","Chiang","Richard","Allan","Henry","Ben","Jeremy"];

/* the chip quantum: every point value in the economy is a multiple of PT and
   one rendered BankChip is worth PT points. The board is denominated in
   TOURNAMENT CHIPS from check-in, so the poker finale needs no conversion:
   the number you carried all weekend is the stack you are dealt. */
const PT = 100;
const START = 10 * PT;      // everyone opens the weekend with 1,000
const MAX_RISK = 5 * PT;    // wager exposure floor: nobody is capped below 500
const BUYIN_FLOOR = 6 * PT; // finale minimum: nobody sits down under 600
/* at most HALF your stack may be at risk at once, floored to 100s and never
   below MAX_RISK. The rack meter draws this rather than stating it */
const maxRisk = pts => Math.max(MAX_RISK, Math.floor(pts / 2 / PT) * PT);

const AWARDS = { 400:[400,0,0], 800:[800,400,0], 1200:[1200,800,400], 1600:[1600,800,400] };

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
  { id:"fri", label:"Friday Night",       tag:"400 PTS" },
  { id:"sam", label:"Saturday Morning",   tag:"800 PTS" },
  { id:"sap", label:"Saturday Afternoon", tag:"1200 PTS" },
  { id:"san", label:"Saturday Night",     tag:"1600 PTS" },
  { id:"fin", label:"The Finale",         tag:"POKER" },
];

/* events reference a GAMES entry by `game` for the how-to; `variant` picks the
   tab inside a multi-variant game like basketball */
const BUILTIN_EVENTS = [
  /* ── Friday night · 400 pts ── */
  { id:"putt", n:1, session:"fri", value:400, name:"Long Putt", kind:"solo", sport:"golf", game:"putting",
    desc:"Three attempts from one spot. Closest wins. A sunk putt beats everything. Ties: sudden death." },
  { id:"8ball", n:2, session:"fri", value:400, name:"8-Ball Doubles", kind:"pairs", sport:"pool", game:"8ball",
    teamCfg:{ teams:6, size:2, bracket:6 },
    desc:"Single elimination. One rack per matchup, alternating shots. Ball-in-hand on scratches." },
  { id:"pong", n:3, session:"fri", value:400, name:"Beer Pong Doubles", kind:"pairs", sport:"pong", game:"pong",
    teamCfg:{ teams:6, size:2, bracket:6 },
    desc:"Single elimination. Six cups, one re-rack. Bounce counts two, can be swatted. Redemption in semis and final." },
  { id:"die", n:4, session:"fri", value:400, name:"Beer Die", kind:"pairs", sport:"die", game:"die",
    teamCfg:{ teams:6, size:2, bracket:6 },
    desc:"Single elimination doubles. Toss the die over the line, they catch off the bounce. Sink it in a cup for the instant kill." },
  /* ── Saturday morning · 800 pts ── */
  { id:"bball", n:5, session:"sam", value:800, name:"3v3 Basketball", kind:"team", sport:"bball", game:"basketball", variant:"3v3",
    teamCfg:{ teams:4, size:3, bracket:4 },
    desc:"Half court to 7 by 1s and 2s, win by 1. Call your own fouls." },
  { id:"spike", n:6, session:"sam", value:800, name:"Spikeball Doubles", kind:"pairs", sport:"spike", game:"spikeball",
    teamCfg:{ teams:6, size:2 },
    desc:"Two pools, winners meet in the final. To 11, win by 2, cap 15." },
  { id:"pingpong", n:7, session:"sam", value:800, name:"Ping Pong", kind:"solo", sport:"pingpong", game:"pingpong",
    desc:"Round-robin heats, then a final. Games to 11, win by 2, serve switches every two." },
  { id:"foosball", n:8, session:"sam", value:800, name:"Foosball", kind:"pairs", sport:"foosball", game:"foosball",
    teamCfg:{ teams:6, size:2, bracket:6 },
    desc:"Single elimination doubles. Split the rods, no spinning, first to 10 goals." },
  /* ── Saturday afternoon · 1200 pts ── */
  { id:"volley", n:9, session:"sap", value:1200, name:"Sand Volleyball", kind:"team", sport:"volley", game:"volleyball",
    teamCfg:{ teams:2, size:6 },
    desc:"Best 2 of 3 sets to 15, win by 2, cap 17. Rotate servers." },
  { id:"nine", n:10, session:"sap", value:1200, name:"Nine-Hole Putting", kind:"solo", sport:"golf", game:"putting",
    desc:"Nine holes, lowest total strokes. Max 5 per hole." },
  { id:"bball1", n:11, session:"sap", value:1200, name:"1v1 Basketball", kind:"solo", sport:"bball", game:"basketball", variant:"1v1",
    desc:"Round-robin heats, then a final. Ones to 5, make it take it, win by 1." },
  { id:"pickleball", n:12, session:"sap", value:1200, name:"Pickleball", kind:"pairs", sport:"pickleball", game:"pickleball",
    teamCfg:{ teams:6, size:2, bracket:6 },
    desc:"Single elimination doubles. Serve deep, stay out of the kitchen, rally it out. Games to 11, win by 2." },
  /* ── Saturday night · 1600 pts ── */
  { id:"flip", n:13, session:"san", value:1600, name:"Flip Cup", kind:"team", sport:"flip", game:"flipcup",
    teamCfg:{ teams:2, size:6 },
    desc:"Best of 3. Flip clean, next teammate goes." },
  { id:"beerio", n:14, session:"san", value:1600, name:"Beerio Kart", kind:"solo", sport:"kart", game:"beerio",
    desc:"Heats of four, then a final. Crack a beer at the line, pull over to drink, finish it before you cross. Highest total wins." },
  { id:"bball5", n:15, session:"san", value:1600, name:"5v5 Full Court", kind:"team", sport:"bball", game:"basketball", variant:"5v5",
    teamCfg:{ teams:2, size:5 },
    desc:"Full court, five a side. Twos and threes on the clock. Ahead at the horn wins." },
  { id:"ragecage", n:16, session:"san", value:1600, name:"Rage Cage", kind:"solo", sport:"cage", game:"ragecage",
    desc:"Everyone circles the cups, two balls in play. Sink and stack, get stacked on and you are out. Last one standing wins." },
  { id:"gauntlet", n:17, session:"san", value:1600, name:"The Gauntlet", kind:"solo", game:"gauntlet",
    desc:"One timed circuit: pressure putt, flip your cup, pong shot, die toss, center cup. Fastest clean runs take it." },
  /* ── The Finale · poker. No value: the result carries chip stacks that
     BECOME the standings, it never pays awards. ── */
  { id:"poker", n:18, session:"fin", name:"Championship Poker", kind:"solo", finale:true, game:"poker",
    desc:"Your points are your stack, dealt out in chips. No-limit hold'em, blinds on the clock. Final chip counts are the final standings." },
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
  poker: { name:"Poker", howto:{ players:"Everyone, one table", gear:["Cards","Chips","The clock"],
    objective:"Finish with the biggest stack. Your points buy you in.",
    steps:["Your points are your chips, dealt from the buy-in sheet.","No-limit hold'em. Blinds rise on the clock, shown on the TV.","Bust and you are out.","When the last level ends, count your stack.","Final chip counts are the final standings."],
    win:"Chip leader takes the championship. Elimination order settles the busts.",
    house:"No wagers, duels, or rulings while cards are live." } },
  gauntlet: { name:"The Gauntlet", howto:{ players:"Solo, on the clock", gear:["Putter","Cups","Pong ball","One die"],
    objective:"Clear five stations faster than everyone else.",
    steps:["Sink the pressure putt.","Flip your cup clean.","Hit a pong shot.","Land a die on the table.","Finish at the center cup. Miss a station, run it back."],
    win:"Fastest clean run takes 1st. The clock settles ties.",
    house:"One runner at a time. Someone times each run." } },
};

const SLOT_META = [
  { label:"1st", team:"Winners",    color:"var(--accent)" },
  { label:"2nd", team:"Runners-up", color:"var(--silver)" },
  { label:"3rd", team:"3rd place",  color:"var(--bronze)" },
];

const OUTRIGHT_MULT = 2; // winner pays 2:1; everything else pays even

/* head-to-head phone duels: challenge anyone, both play a 5-second minigame on
   your own phone, the pot settles itself. The challenger names the ante
   and both sides put up the same; DUEL_STAKE is only the default. */
const DUEL_STAKE = PT;
const DUEL_GAMES = {
  quickdraw: { name:"Quick Draw", desc:"The screen flashes after a random wait. Tap it. Fastest tap wins, tapping early is a foul." },
};

const SIZES = ["S", "M", "L", "XL", "XXL"];

/* ─────────── travel ───────────
   Everyone lands Friday and leaves Sunday, and the flight code already says
   where you came from, so a leg is only { air, num, time }: carrier, number,
   and 24h "HH:MM" off the native picker. Legacy free text survives as { note }. */
const AIRLINES = ["WN", "AA", "UA", "DL", "AS", "B6", "NK", "F9"];
/* one validator, used by the server on save and the client for display */
function cleanLeg(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "string") return v.trim() ? { note: v.trim().slice(0, 90) } : null;
  if (typeof v !== "object") return undefined;          // undefined = reject
  const out = {};
  const air = String(v.air || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3);
  const num = String(v.num ?? "").replace(/\D/g, "").slice(0, 4);
  if (air) out.air = air;
  if (num) out.num = num;
  if (typeof v.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v.time)) out.time = v.time;
  if (typeof v.note === "string" && v.note.trim()) out.note = v.note.trim().slice(0, 90);
  return Object.keys(out).length ? out : null;
}
/* 24h "20:37" reads back as "8:37p": nobody wants to parse a clock */
function legTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
/* the plain-text rendering, for anywhere a strip will not fit */
function legText(leg, dir) {
  if (!leg) return "";
  if (leg.note) return leg.note;
  const code = [leg.air, leg.num].filter(Boolean).join(" ");
  const t = legTime(leg.time);
  return [code, t && `${dir === "out" ? "leaves Sun" : "lands Fri"} ${t}`].filter(Boolean).join(", ");
}

/* chip identity: everyone starts gray; colors are claimed first come first
   serve and lock when the weekend goes live. Skins repeat freely; the color
   is the unique claim. light:true colors take ink initials/text. */
const CHIP_GRAY = "#6B6558";
const CHIP_COLORS = [
  { hex:"#C05B33" }, { hex:"#D97742" }, { hex:"#E39A3B", light:true }, { hex:"#D89C2F", light:true },
  { hex:"#C9B25A", light:true }, { hex:"#A8A03F", light:true }, { hex:"#77804C" }, { hex:"#4E6E39" },
  { hex:"#6E9450" }, { hex:"#3F7D5C" }, { hex:"#557B72" }, { hex:"#2F7E83" },
  { hex:"#4F93A3" }, { hex:"#3B6E9C" }, { hex:"#5E7291" }, { hex:"#6D6FA8" },
  { hex:"#7C5CA6" }, { hex:"#8A4F62" }, { hex:"#A6527C" }, { hex:"#B23B5E" },
  { hex:"#B23B2E" }, { hex:"#8E3B2F" }, { hex:"#7A5C43" }, { hex:"#A9663F" },
  { hex:"#B37A4A" }, { hex:"#8C6A54" }, { hex:"#6F6546" }, { hex:"#4E4A3C" },
  { hex:"#9AA1A8", light:true }, { hex:"#B9AF9B", light:true },
];
const CHIP_SKINS = ["ticks", "plain", "dash", "quad", "dots", "ring",
  "saw", "flame", "star", "bolt", "wave", "crown"];

/* this edition's hard dates, in one place: every surface reads these instead
   of spelling the weekend out again and getting it wrong */
const EDITION = { long:"October 30 to November 1, 2026", short:"Oct 30 to Nov 1" };

/* the weekend sheet ships with the real booking already in it, so nobody has
   to type it and the invite is correct the moment it goes out. GM can edit
   every line from the locker room. */
const LOGISTICS = {
  v: 2,
  venue: "10848 North Aberdeen Road, Scottsdale, AZ",
  venueNote: "",
  airport: "PHX",
  airportName: "Phoenix Sky Harbor",
  checkIn: "Fri Oct 30, 4:00 PM",
  checkOut: "Sun Nov 1, 10:00 AM",
  hostIn: { air:"WN", num:"4663", time:"08:40" },
  hostOut: { air:"UA", num:"1885", time:"20:37" },
};

/* stored logistics shadows the booking above, so a line written before the
   real one shipped, or blanked by a stray save, would outlive every reset and
   every deploy. Applied on load AND on save: a sheet stamped with an older
   edition than `v` was written against a booking we no longer have, so it is
   replaced whole, once; at the current edition a blank falls back to what
   shipped (except venueNote, which ships blank and so can be cleared), a key
   that no longer exists is dropped, and a leg is whatever cleanLeg says it is.
   The GM can change any line; they just cannot leave us with no address. Bump
   `v` when the real booking changes, never for a wording tweak */
function cleanLogistics(stored) {
  const out = { ...LOGISTICS };
  if (stored?.v === LOGISTICS.v)
    for (const k of Object.keys(LOGISTICS)) {
      const v = stored[k];
      if (v !== undefined && v !== null) out[k] = v;
    }
  for (const k of ["hostIn", "hostOut"]) {
    const leg = cleanLeg(out[k]);
    if (leg) out[k] = leg; else delete out[k];
  }
  for (const k of Object.keys(out))
    if (typeof out[k] === "string") out[k] = out[k].trim() || LOGISTICS[k];
  out.v = LOGISTICS.v;
  return out;
}

const EMPTY_STATE = { v:5, live:false, results:{}, wagers:[], adjustments:[], seeds:{}, draws:{}, brackets:{},
  stages:{}, drafts:{}, duels:[], poker:null, profiles:{}, customEvents:[], shelved:{}, onDeck:null, frozen:false,
  onboardEpoch:0, eventEdits:{}, eventOrder:[], logistics:{ ...LOGISTICS }, updatedAt:0 };

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

/* ─────────── the poker finale ───────────
   Physical cards and chips; the app runs the table. state.poker is the
   table (buy-in snapshot, blind schedule, eliminations). The clock is
   DERIVED from startedAt, no server ticks. The result carries final chip
   stacks that become the standings verbatim. */
const pokerLive = state => {
  const pk = state.poker;
  return !!(pk && pk.startedAt && !state.results[pk.id]);
};
/* once counts are posted the stacks ARE the standings; wagers and duels
   placed after that would settle into nothing, so the book stays closed */
const stacksPosted = state =>
  Object.values(state.results || {}).some(r => r?.stacks);
/* the board is already denominated in chips, so the buy-in is not a
   conversion: 2,200 points is 2,200 in front of you. Real tournament
   denominations, so any standard set works. */
const CHIP_MIN = 25;       // smallest denomination; counts move in 25s
/* blind schedule: seven levels, about an hour 45; median stack ~40 BB deep */
const POKER_LEVELS = [
  { sb:25, bb:50, mins:15 }, { sb:50, bb:100, mins:15 }, { sb:100, bb:200, mins:15 },
  { sb:150, bb:300, mins:15 }, { sb:250, bb:500, mins:15 }, { sb:400, bb:800, mins:15 },
  { sb:600, bb:1200, mins:15 },
];
const pokerLevels = () => POKER_LEVELS.map(l => ({ ...l }));
/* pure clock walk; clients tick a 1s interval and re-derive */
function pokerClock(poker, now) {
  const levels = poker.levels || POKER_LEVELS;
  if (!poker.startedAt) return { idx:0, ...levels[0], msLeft:levels[0].mins * 60000, running:false };
  let elapsed = now - poker.startedAt;
  let idx = 0;
  while (idx < levels.length - 1 && elapsed >= levels[idx].mins * 60000) {
    elapsed -= levels[idx].mins * 60000; idx++;
  }
  idx = Math.max(0, Math.min(levels.length - 1, idx + (poker.levelOffset || 0)));
  const msLeft = Math.max(0, levels[idx].mins * 60000 - elapsed);
  return { idx, ...levels[idx], msLeft, running:true, last: idx === levels.length - 1 };
}
/* physical dealing breakdown for a buy-in of pts: a blind pack of eight 25s
   for posting, the rest greedy in 1000/500/100. Exact because every board
   value is a PT multiple and PT is 100. */
function pokerDenoms(pts) {
  let chips = pts;
  const stack = [];
  if (chips >= 400) { stack.push({ v: 25, n: 8 }); chips -= 200; }
  else if (chips > 0) { stack.push({ v: 25, n: chips / 25 }); chips = 0; }
  for (const v of [1000, 500, 100]) {
    const n = Math.floor(chips / v);
    if (n) { stack.push({ v, n }); chips -= n * v; }
  }
  return stack.sort((a, b) => b.v - a.v);
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
  ROSTER.forEach(p => { pts[p] = START; wins[p] = 0; betNet[p] = 0; duelNet[p] = 0; awardPts[p] = 0; });
  const evs = allEventsOf(state);
  Object.entries(state.results || {}).forEach(([eid, res]) => {
    const ev = evs.find(e => e.id === eid); if (!ev || !res) return;
    /* value-less events (the poker finale) award nothing here; slots[0] still
       counts as a win so the chip leader carries one */
    const table = AWARDS[ev.value] || [0, 0, 0];
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
  /* poker finale override: final chip stacks BECOME the totals. Only rulings
     made after the count applies on top; everything earlier is already in
     the physical chips. Elimination order (embedded in the result) breaks
     ties among busted players: later bust ranks higher. */
  let stacksRes = null;
  Object.values(state.results || {}).forEach(res => { if (res?.stacks) stacksRes = res; });
  if (stacksRes) {
    ROSTER.forEach(p => { pts[p] = stacksRes.stacks[p] ?? 0; });
    (state.adjustments || []).forEach(a => {
      if (a.ts > stacksRes.ts && pts[a.player] !== undefined) pts[a.player] += a.delta;
    });
  }
  const outRank = p => {
    const i = (stacksRes?.outs || []).indexOf(p);
    return i < 0 ? Infinity : i;
  };
  const rows = ROSTER.map(p => ({ player:p, pts:pts[p], wins:wins[p], betNet:betNet[p], duelNet:duelNet[p], awardPts:awardPts[p] }))
    .sort((x,y) => y.pts - x.pts
      || (stacksRes ? outRank(y.player) - outRank(x.player) : 0)
      || y.wins - x.wins || x.player.localeCompare(y.player));
  let rank = 0, prev = null;
  rows.forEach((r,i) => { if (r.pts !== prev || (stacksRes && r.pts === 0)) { rank = i+1; prev = r.pts; } r.rank = rank; });
  return rows;
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
  GM_PIN, ROSTER, AWARDS, PT, START, MAX_RISK, BUYIN_FLOOR, maxRisk, SPORTS, RATINGS, SESSIONS, BUILTIN_EVENTS, SLOT_META,
  OUTRIGHT_MULT, DUEL_STAKE, DUEL_GAMES, EMPTY_STATE, EDITION, LOGISTICS, SIZES, TEAM_NAMES, GAMES,
  AIRLINES, cleanLeg, cleanLogistics, legTime, legText,
  CHIP_GRAY, CHIP_COLORS, CHIP_SKINS, CHIP_MIN,
  allEventsOf, disp, shuffle, snakeTeam, teamLabel, stageFinalists, stageEntrantView,
  resolveWager, resolveDuel, pokerLive, stacksPosted, pokerLevels, pokerClock, pokerDenoms,
  computeStandings, atRisk, drawTeams, splitIntoGroups,
  playerStrength, strengthMap, refineTeams,
  makeBracket, ROUND_NAMES, resolveSlot, bracketChampion,
};
