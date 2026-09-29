/* Single source of truth for game logic. Imported by BOTH the React client
   and the Durable Object. The server is authoritative; the client uses these
   for display only. */

/* Names are the shipped M0 storage keys, so Scottsdale keeps them as stable
   ids. The record shape separates identity from display and attendance without
   rewriting claims, profiles, photos, bets, or results. */
const ROSTER_CONFIG = [
  { id:"Brandon", name:"Brandon", status:"confirmed" },
  { id:"Evan", name:"Evan", status:"confirmed" },
  { id:"Eyob", name:"Eyob", status:"confirmed" },
  { id:"Sahil", name:"Sahil", status:"confirmed" },
  { id:"Khoa", name:"Khoa", status:"confirmed" },
  { id:"Chinh", name:"Chinh", status:"confirmed" },
  { id:"Adi", name:"Adi", status:"confirmed" },
  { id:"Chiang", name:"Chiang", status:"confirmed" },
  { id:"Richard", name:"Richard", status:"confirmed" },
  { id:"Allan", name:"Allan", status:"confirmed" },
  { id:"Henry", name:"Henry", status:"confirmed" },
  { id:"Ben", name:"Ben", status:"confirmed" },
  { id:"Jeremy", name:"Jeremy", status:"confirmed" },
];
const ROSTER_STATUSES = ["confirmed", "pending", "out"];
const rosterPlayers = (config = ROSTER_CONFIG, statuses = ["confirmed"]) => {
  const allowed = new Set(statuses);
  return config.filter(player => allowed.has(player.status)).map(player => player.id);
};
const ALL_PLAYERS = rosterPlayers(ROSTER_CONFIG, ROSTER_STATUSES);
const ROSTER = rosterPlayers();
const rosterRecord = id => ROSTER_CONFIG.find(player => player.id === id) || null;
const isActivePlayer = id => ROSTER.includes(id);
/* Away is a reversible commissioner mark for someone not at the venue right
   now. It only removes them from new draws, contest sides and poker seats;
   their chips, claims and profile are untouched. */
const isAway = (state, id) => !!state?.away?.[id];
const presentPlayers = state => ROSTER.filter(player => !isAway(state, player));

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
  { id:"fri", label:"Friday Night",       tag:"400 CHIPS" },
  { id:"sam", label:"Saturday Morning",   tag:"800 CHIPS" },
  { id:"sap", label:"Saturday Afternoon", tag:"1200 CHIPS" },
  { id:"san", label:"Saturday Night",     tag:"1600 CHIPS" },
  { id:"fin", label:"The Finale",         tag:"POKER" },
];

/* events reference a GAMES entry by `game` for the how-to; `variant` picks the
   tab inside a multi-variant game like basketball */
const RAW_BUILTIN_EVENTS = [
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
    desc:"Single elimination doubles. Toss the die over the line, they catch off the bounce. Sinking it in a cup wins the game." },
  /* ── Saturday morning · 800 pts ── */
  { id:"bball", n:5, session:"sam", value:800, name:"3v3 Basketball", kind:"team", sport:"bball", game:"basketball", variant:"3v3",
    teamCfg:{ teams:4, size:3, bracket:4 },
    desc:"Half court to 7 by 1s and 2s, win by 1. Call your own fouls." },
  { id:"spike", n:6, session:"sam", value:800, name:"Spikeball Doubles", kind:"pairs", sport:"spike", game:"spikeball",
    teamCfg:{ teams:6, size:2 },
    stageCfg:{ kind:"pools", nGroups:2, advance:1 },
    desc:"Two pools, winners meet in the final. To 11, win by 2, cap 15." },
  { id:"pingpong", n:7, session:"sam", value:800, name:"Ping Pong", kind:"solo", sport:"pingpong", game:"pingpong",
    stageCfg:{ kind:"heats", nGroups:3, advance:1 },
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
  /* a bracket of everyone present: entrants are teams of one, seeded by the
     draw, and the top seeds take the byes */
  { id:"bball1", n:11, session:"sap", value:1200, name:"1v1 Basketball", kind:"solo", sport:"bball", game:"basketball", variant:"1v1",
    teamCfg:{ teams:13, size:1, bracket:13 },
    desc:"Single elimination, everyone in. Ones to 5, make it take it, win by 1." },
  { id:"pickleball", n:12, session:"sap", value:1200, name:"Pickleball", kind:"pairs", sport:"pickleball", game:"pickleball",
    teamCfg:{ teams:6, size:2, bracket:6 },
    desc:"Single elimination doubles. No volleys in the kitchen. Games to 11, win by 2." },
  /* ── Saturday night · 1600 pts ── */
  { id:"flip", n:13, session:"san", value:1600, name:"Flip Cup", kind:"team", sport:"flip", game:"flipcup",
    teamCfg:{ teams:2, size:6 },
    desc:"Best of 3. Flip clean, next teammate goes." },
  { id:"beerio", n:14, session:"san", value:1600, name:"Beerio Kart", kind:"solo", sport:"kart", game:"beerio",
    stageCfg:{ kind:"heats", nGroups:4, advance:1 },
    desc:"Heats of four, then a final. Crack a beer at the line, pull over to drink, finish it before you cross. Highest total wins." },
  { id:"bball5", n:15, session:"san", value:1600, name:"5v5 Full Court", kind:"team", sport:"bball", game:"basketball", variant:"5v5",
    teamCfg:{ teams:2, size:5 },
    desc:"Full court, five a side. Twos and threes on the clock. Ahead at the horn wins." },
  { id:"ragecage", n:16, session:"san", value:1600, name:"Rage Cage", kind:"solo", sport:"cage", game:"ragecage",
    desc:"Everyone circles the cups, two balls in play. Sink and stack, get stacked on and you are out. Last one standing wins." },
  { id:"gauntlet", n:17, session:"san", value:1600, name:"The Gauntlet", kind:"solo", game:"gauntlet",
    desc:"One timed circuit: pressure putt, flip your cup, pong shot, die toss, center cup. Fastest clean run wins." },
  /* ── The Finale · poker. No value: the result carries chip stacks that
     BECOME the standings, it never pays awards. ── */
  { id:"poker", n:18, session:"fin", name:"Championship Poker", kind:"solo", finale:true, game:"poker",
    desc:"Whatever you have Saturday night is the stack you start the finale with. No-limit hold'em, blinds on the clock. Final chip counts are the final standings." },
];

const OVERFLOW_ROLES = ["referee", "scorekeeper", "photographer", "on-deck", "sit-out"];
const OVERFLOW_ROLE_META = Object.freeze({
  referee: Object.freeze({
    label:"Event official",
    short:"Official",
    detail:"Calls rules and settles close plays.",
  }),
  scorekeeper: Object.freeze({
    label:"Scorekeeper",
    short:"Score",
    detail:"Tracks the score and reports the finish.",
  }),
  photographer: Object.freeze({
    label:"Photographer",
    short:"Camera",
    detail:"Captures the matchup and the winner.",
  }),
  "on-deck": Object.freeze({
    label:"On-deck lead",
    short:"Next up",
    detail:"Gets the next matchup ready.",
  }),
  "sit-out": Object.freeze({
    label:"Event host",
    short:"Host",
    detail:"Resets the station between games.",
  }),
});
const overflowRoleMeta = role => OVERFLOW_ROLE_META[role] || OVERFLOW_ROLE_META["sit-out"];
const participationForEvent = ev => {
  if (ev?.participation) return ev.participation;
  if (ev?.teamCfg) return {
    type: "strict-teams",
    teams: ev.teamCfg.teams,
    size: ev.teamCfg.size,
    allowSitOut: true,
    overflowRoles: OVERFLOW_ROLES,
  };
  return { type:"all", allowSitOut:false, overflowRoles:[] };
};
const BUILTIN_EVENTS = RAW_BUILTIN_EVENTS.map(ev => ({
  ...ev,
  participation: participationForEvent(ev),
}));

/* the games library: one how-to per game, shared across events */
const GAMES = {
  putting: { name:"Putting", howto:{ players:"Solo", gear:["Putter","One ball"],
    objective:"Sink it, or finish closest to the pin.",
    steps:["Putt from the marked spot.","A make beats any miss. Otherwise the closest ball wins."],
    win:"Long Putt: closest of three attempts. Nine-Hole: fewest total strokes. Ties go to sudden death." } },
  "8ball": { name:"8-Ball", howto:{ players:"Pairs", gear:["Pool table","Full rack","Two cues"],
    objective:"Clear your group, then sink the 8.",
    steps:["Break, then split stripes and solids.","Partners alternate shots.","A scratch gives the other pair ball in hand.","Call the 8 before you shoot it."],
    win:"First pair to legally sink the 8 wins." } },
  pong: { name:"Beer Pong", howto:{ players:"Pairs", gear:["Table","Ten cups","Two balls"],
    objective:"Sink every cup on the far end first.",
    steps:["Rack six, one re-rack on request.","Both partners throw each turn.","Bounces count two and can be swatted."],
    win:"First pair to sink all their cups wins.", house:"Redemption throw in the semis and final." } },
  die: { name:"Beer Die", howto:{ players:"Pairs", gear:["Table","One die","Four cups","A pour"],
    objective:"Land the die in their cup, or make them miss the catch.",
    steps:["Sit across the table, cups on your two corners.","Toss the die up past head height and onto the far end.","It has to bounce off the table. No darting it, no skying it.","They catch it one-handed off the bounce, or you score."],
    win:"First pair to the set score wins. Sinking the die in a cup ends it on the spot.",
    house:"Call your own height on the toss. A plunk means chug." } },
  basketball: { name:"Basketball", variants:[
    { id:"1v1", label:"1v1", howto:{ players:"Solo, single elimination", gear:["Half court","One ball"],
      objective:"Score five before your opponent.",
      steps:["Check the ball up top.","Everything counts one.","Make it, take it.","Call your own fouls."],
      win:"First to five wins the game. Win the final to take the event." } },
    { id:"3v3", label:"3v3", howto:{ players:"Teams of three", gear:["Half court","One ball"],
      objective:"Score seven before the other team.",
      steps:["Check the ball up top.","Score by ones and twos.","Take it back past the arc on a turnover.","Call your own fouls."],
      win:"First team to seven wins." } },
    { id:"5v5", label:"5v5", howto:{ players:"Two teams of five", gear:["Full court","One ball","A clock"],
      objective:"Be ahead when time runs out.",
      steps:["Tip off to start.","Twos inside the arc, threes beyond it.","Clear past half on a change of possession.","Call your own fouls.","Two halves, running clock."],
      win:"Ahead at the horn wins.", house:"No hard contact." } },
  ]},
  spikeball: { name:"Spikeball", howto:{ players:"Pairs", gear:["Spikeball net","One ball"],
    objective:"Force them to miss the net.",
    steps:["Serve to the returner.","Three touches to hit the net back.","Move any direction after the serve.","A miss or bad hit ends the point."],
    win:"To eleven, win by two, cap fifteen." } },
  pingpong: { name:"Ping Pong", howto:{ players:"Solo", gear:["Table","Paddles","One ball"],
    objective:"Win points until eleven.",
    steps:["Rally for serve, then serve two and hand it over.","Serve must clear the net and bounce once each side.","Let it bounce once on your side before returning."],
    win:"Games to eleven, win by two. The winner of the final takes the event." } },
  foosball: { name:"Foosball", howto:{ players:"Pairs", gear:["Foosball table","One ball"],
    objective:"Score on their goal, defend yours.",
    steps:["Split the rods with your partner.","Serve through the side hole.","No spinning. A goal off a full spin does not count.","A dead ball goes back to the serve."],
    win:"First pair to ten goals wins." } },
  volleyball: { name:"Volleyball", howto:{ players:"Two teams", gear:["Sand court","Net","One ball"],
    objective:"Ground the ball on their side.",
    steps:["Serve from behind the line.","Three touches a side, clean contact only.","Rotate on every side-out.","Every rally scores a point."],
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
    steps:["Open a beer at the start line.","Pull over to drink, no sipping while you steer.","Finish the beer before the finish line, or wait there until it is gone."],
    win:"Best finishes advance to the final. Highest total wins." } },
  ragecage: { name:"Rage Cage", howto:{ players:"Solo, last standing", gear:["Ring of cups","Center cup","Two balls"],
    objective:"Sink your ball and pass it on before you get stacked.",
    steps:["Everyone circles the cups, two balls in play.","Bounce a ball into your cup, then pass it on.","Make it in one, stack your cup on the player to your left.","Get stacked on and you are out.","Sink the center cup to end it."],
    win:"Last one standing takes 1st. Elimination order sets 2nd and 3rd." } },
  poker: { name:"Poker", howto:{ players:"Everyone, one table", gear:["Cards","Chips","The clock"],
    objective:"Finish with the biggest stack.",
    steps:["Whatever you have Saturday night is the stack you start the finale with.","No-limit hold'em. Blinds rise on the clock.","Bust and you are out.","When the last level ends, count your stack."],
    win:"Chip leader takes the championship. Final chip counts are the final standings, and elimination order ranks the busts." } },
  gauntlet: { name:"The Gauntlet", howto:{ players:"Solo, on the clock", gear:["Putter","Cups","Pong ball","One die"],
    objective:"Clear five stations faster than everyone else.",
    steps:["Sink the pressure putt.","Flip your cup clean.","Hit a pong shot.","Land a die on the table.","Finish at the center cup. Miss a station, run it back."],
    win:"Fastest clean run takes 1st.",
    house:"One runner at a time. Someone times each run." } },
};

const SLOT_META = [
  { label:"1st", team:"Winners",    color:"var(--accent)" },
  { label:"2nd", team:"Runners-up", color:"var(--silver)" },
  { label:"3rd", team:"3rd place",  color:"var(--bronze)" },
];

const OUTRIGHT_MULT = 2; // a wide field's winner pays 2:1; everything else pays even
/* A ticket keeps the payout it was placed at. Outright tickets written before
   two-sided events paid even carry no mult and stay 2:1. */
const wagerMult = w => w?.kind === "outright" ? (Number.isInteger(w.mult) ? w.mult : OUTRIGHT_MULT) : 1;

/* head-to-head phone duels: challenge one player or anyone, the other side
   accepts, both play a 5-second minigame on their own phone, the pot settles
   itself. The challenger names the ante and both sides put up the same;
   DUEL_STAKE is only the default. The offer lifecycle lives by resolveDuel. */
const DUEL_STAKE = PT;
const DUEL_GAMES = {
  quickdraw: { name:"Quick Draw", desc:"Tap when the screen flashes. Fastest tap wins. Tapping early is a foul." },
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
  { hex:"#D1C0A0", light:true }, { hex:"#E3D7BD", light:true },
];
const CHIP_SKINS = ["ticks", "plain", "dash", "quad", "dots", "ring",
  "saw", "flame", "star", "bolt", "wave", "crown"];

/* this edition's hard dates, in one place: every surface reads these instead
   of spelling the weekend out again and getting it wrong */
const EDITION = { name:"Scottsdale", year:2026, label:"Scottsdale · 2026",
  long:"October 30 to November 1, 2026", short:"Oct 30 to Nov 1" };

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

const EMPTY_STATE = { v:9, live:false, results:{}, wagers:[], wagerOps:{}, adjustments:[], seeds:{}, draws:{}, brackets:{},
  stages:{}, drafts:{}, duels:[], poker:null, profiles:{}, customEvents:[], shelved:{}, away:{}, onDeck:null, frozen:false,
  onboardEpoch:0, eventEdits:{}, eventOrder:[], eventOps:{}, showControl:{ active:null, history:[] },
  logistics:{ ...LOGISTICS }, updatedAt:0 };
const RESET_PROGRESS_CONFIRMATION = "RESET_GAME_PROGRESS";
const RESET_PROGRESS_PRESERVED_KEYS = Object.freeze([
  "profiles",
  "seeds",
  "logistics",
  "onboardEpoch",
  "customEvents",
  "eventEdits",
  "eventOrder",
]);

/* ─────────── helpers ─────────── */
/* built-ins can be edited (name, desc, value, session) via state.eventEdits and
   reordered via state.eventOrder; results and wagers key off ids so both are safe */
function allEventsOf(state) {
  const evs = [
    ...BUILTIN_EVENTS.map(e => {
      const event = { ...e, ...(state.eventEdits?.[e.id] || {}) };
      return { ...event, participation:participationForEvent(event) };
    }),
    ...(state.customEvents || []).map(event => ({
      ...event,
      participation:participationForEvent(event),
    })),
  ];
  const ord = state.eventOrder || [];
  if (ord.length) {
    const idx = id => { const i = ord.indexOf(id); return i < 0 ? 999 : i; };
    evs.sort((a, b) => idx(a.id) - idx(b.id) || (a.n || 99) - (b.n || 99));
  }
  return evs;
}
/* The shape a team event actually plays with the people present. A full
   room plays the configured format with any extras on crew. A short room
   keeps pairs as pairs and brackets as brackets with fewer teams (5 teams
   seed a play-in into a 4-team bracket), while two-sided team games keep
   both sides and shrink them evenly. Remainders go to crew. */
function teamFit(ev, count = ROSTER.length) {
  const cfg = ev?.teamCfg;
  if (!cfg || !Number.isInteger(cfg.teams) || !Number.isInteger(cfg.size)
      || cfg.teams < 2 || cfg.size < 1) return null;
  if (count >= cfg.teams * cfg.size)
    return { teams:cfg.teams, size:cfg.size, bracket:cfg.bracket || null, reduced:false };
  if (cfg.bracket || ev.kind === "pairs" || ev.stageCfg) {
    const teams = Math.floor(count / cfg.size);
    return teams >= 2 ? { teams, size:cfg.size, bracket:cfg.bracket ? teams : null, reduced:true } : null;
  }
  const size = Math.floor(count / cfg.teams);
  return size >= 1 ? { teams:cfg.teams, size, bracket:null, reduced:true } : null;
}
/* the format line a commissioner reads: "6 teams of 2", or "13 players"
   when every entrant is one person */
const shapeLabel = fit => !fit ? "" : fit.size === 1 ? `${fit.teams} players` : `${fit.teams} teams of ${fit.size}`;
function eventCapacity(ev, count) {
  const policy = participationForEvent(ev);
  if (policy.type === "strict-teams") {
    if (count !== undefined && ev?.teamCfg) {
      const fit = teamFit(ev, count);
      return fit ? fit.teams * fit.size : null;
    }
    return Number.isInteger(policy.teams) && Number.isInteger(policy.size)
      ? policy.teams * policy.size : null;
  }
  if (policy.type === "fixed") return Number.isInteger(policy.entrants) ? policy.entrants : null;
  return null;
}
function validateEventParticipants(ev, selected, active = ROSTER) {
  const policy = participationForEvent(ev);
  const activeUnique = [...new Set(active)];
  const activeSet = new Set(activeUnique);
  if (!Array.isArray(selected))
    return { ok:false, code:"selection-required", error:"Choose who is playing" };
  const players = [...new Set(selected)];
  if (players.length !== selected.length)
    return { ok:false, code:"duplicate-player", error:"A player is selected twice" };
  if (players.some(player => !activeSet.has(player)))
    return { ok:false, code:"inactive-player", error:"Only confirmed players can participate" };

  const fit = policy.type === "strict-teams" && ev?.teamCfg ? teamFit(ev, activeUnique.length) : null;
  const capacity = policy.type === "strict-teams" && ev?.teamCfg
    ? (fit ? fit.teams * fit.size : ev.teamCfg.teams * ev.teamCfg.size)
    : eventCapacity(ev);
  if (policy.type === "all") {
    if (players.length !== activeUnique.length || activeUnique.some(player => !players.includes(player)))
      return { ok:false, code:"all-required", error:`All ${activeUnique.length} confirmed players are required`,
        selectedCount:players.length, activeCount:activeUnique.length, required:activeUnique.length };
  } else if (policy.type === "strict-teams" || policy.type === "fixed") {
    if (!capacity || capacity < 1)
      return { ok:false, code:"bad-policy", error:"Event participation is not configured" };
    if (ev?.teamCfg && !fit)
      return { ok:false, code:"roster-short", error:`This event needs ${2 * ev.teamCfg.size} players; ${activeUnique.length} present`,
        selectedCount:players.length, activeCount:activeUnique.length, required:2 * ev.teamCfg.size };
    if (activeUnique.length < capacity)
      return { ok:false, code:"roster-short", error:`This event needs ${capacity} players; ${activeUnique.length} confirmed`,
        selectedCount:players.length, activeCount:activeUnique.length, required:capacity };
    if (players.length !== capacity) {
      const overflow = Math.max(0, activeUnique.length - capacity);
      return { ok:false, code:"wrong-count",
        error:`Select exactly ${capacity} players${overflow ? ` and assign ${overflow} overflow ${overflow === 1 ? "role" : "roles"}` : ""}`,
        selectedCount:players.length, activeCount:activeUnique.length, required:capacity, overflow };
    }
  } else if (policy.type === "selection") {
    const min = Number.isInteger(policy.min) ? policy.min : 1;
    const max = Number.isInteger(policy.max) ? policy.max : activeUnique.length;
    if (players.length < min || players.length > max)
      return { ok:false, code:"outside-range", error:`Select ${min} to ${max} players`,
        selectedCount:players.length, activeCount:activeUnique.length };
  } else if (policy.type === "approximate-teams") {
    const min = Number.isInteger(policy.min) ? policy.min : 2;
    if (players.length < min)
      return { ok:false, code:"roster-short", error:`Select at least ${min} players`,
        selectedCount:players.length, activeCount:activeUnique.length };
  } else {
    return { ok:false, code:"bad-policy", error:"Unknown participation policy" };
  }

  const overflow = activeUnique.filter(player => !players.includes(player));
  if (overflow.length && !policy.allowSitOut)
    return { ok:false, code:"overflow-not-allowed", error:"Every confirmed player must participate" };
  return {
    ok:true,
    players,
    overflow,
    capacity,
    fit,
    selectedCount:players.length,
    activeCount:activeUnique.length,
    policy,
  };
}
/* The commissioner's one-tap default: everyone present plays, and the
   overflow goes to whoever has sat out least so crew duty rotates. Ties go
   to whoever sat out longest ago, then the end of the roster. */
function suggestParticipants(state, ev) {
  if (!ev) return null;
  const present = presentPlayers(state);
  if (!ev.teamCfg) return ev.stageCfg?.kind === "heats" ? { players:present, roles:[], fit:null } : null;
  const fit = teamFit(ev, present.length);
  if (!fit) return null;
  const counts = {}, last = {};
  const tally = (roles, at) => (Array.isArray(roles) ? roles : []).forEach(item => {
    if (!item?.player) return;
    counts[item.player] = (counts[item.player] || 0) + 1;
    last[item.player] = Math.max(last[item.player] || 0, Number(at) || 0);
  });
  Object.entries(state.draws || {}).forEach(([id, draw]) => { if (id !== ev.id) tally(draw?.roles, draw?.ts); });
  Object.entries(state.stages || {}).forEach(([id, stage]) => { if (id !== ev.id) tally(stage?.roles, stage?.ts); });
  const order = [...present].sort((a, b) => (counts[a] || 0) - (counts[b] || 0)
    || (last[a] || 0) - (last[b] || 0) || ROSTER.indexOf(b) - ROSTER.indexOf(a));
  const crew = order.slice(0, present.length - fit.teams * fit.size);
  return {
    players:present.filter(player => !crew.includes(player)),
    roles:crew.map((player, index) => ({ player, role:OVERFLOW_ROLES[index % OVERFLOW_ROLES.length] })),
    fit,
  };
}
function normalizeOverflowRoles(selected, active = ROSTER, roles = [], ev = null) {
  const policy = participationForEvent(ev || {});
  const allowed = new Set(policy.overflowRoles?.length ? policy.overflowRoles : OVERFLOW_ROLES);
  const supplied = new Map((Array.isArray(roles) ? roles : []).map(item => [item?.player, item?.role]));
  return active.filter(player => !selected.includes(player)).map(player => ({
    player,
    role: allowed.has(supplied.get(player)) ? supplied.get(player) : "sit-out",
  }));
}
function defaultQaParticipants(ev, active = ROSTER) {
  const capacity = eventCapacity(ev);
  return capacity ? [...active].slice(0, capacity) : [...active];
}
function coalescePendingReveals(draws = {}, stages = {}, seenIds = [], preferredEvId = null) {
  const seen = new Set(Array.isArray(seenIds) ? seenIds : []);
  let order = 0;
  const entries = [];
  const add = (kind, map) => Object.entries(map || {}).forEach(([evId, item]) => {
    if (!item?.id || seen.has(item.id)) return;
    const idTime = Number(String(item.id).replace(/^\D+/, "")) || 0;
    entries.push({ kind, evId, item, at:Number(item.ts) || idTime, order:order++ });
  });
  add("draw", draws);
  add("stage", stages);
  const queue = entries.sort((a, b) =>
    Number(b.evId === preferredEvId) - Number(a.evId === preferredEvId)
    || b.at - a.at || b.order - a.order);
  return {
    latest:queue[0] || null,
    staleIds:queue.slice(1).map(entry => entry.item.id),
  };
}
const disp = (state, p) => state.profiles?.[p]?.display || p;
const shuffle = arr => { const a = [...arr]; for (let i = a.length-1; i > 0; i--) { const j = Math.floor(Math.random()*(i+1)); [a[i],a[j]] = [a[j],a[i]]; } return a; };
/* snake draft order: pick #k (0-indexed) over T teams -> which team is on the clock */
const snakeTeam = (k, T) => { const r = Math.floor(k / T), p = k % T; return r % 2 === 0 ? p : T - 1 - p; };
/* The draft's visible turn and write references travel together. Revision
   also advances on undo, when the same pick index can be reached again. */
function draftTurn(draft) {
  if (!draft?.id || !Array.isArray(draft.teams) || !draft.teams.length
      || !Array.isArray(draft.picks) || !Array.isArray(draft.pool)) return null;
  const pickIndex = draft.picks.length, remaining = draft.pool.length;
  const complete = remaining === 0;
  const teamIndex = complete ? null : snakeTeam(pickIndex, draft.teams.length);
  return { draftId:draft.id, pickIndex, draftRevision:Number(draft.revision || 0),
    teamIndex, captain:teamIndex === null ? null : draft.teams[teamIndex].captain,
    round:Math.floor(pickIndex / draft.teams.length) + 1,
    totalPicks:pickIndex + remaining, remaining, complete };
}

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
  /* a shelved event returns its chips; restoring it restores the tickets */
  if (state.shelved?.[w.eventId]) return { status:"void", delta:0 };
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
    return { status: won ? "won" : "lost", delta: won ? wagerMult(w) * w.stake : -w.stake };
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
  if (w.kind === "stage" || w.kind === "heat") {
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
    if (w.kind === "heat") {
      if (g.winner === null || g.winner === undefined) return { status:"pending", delta:0 };
      const won = g.winner === w.pickKey;
      return { status:won ? "won" : "lost", delta:won ? w.stake : -w.stake };
    }
    if ((g.through || []).length < st.advance) return { status:"pending", delta:0 };
    const won = g.through.includes(w.pickKey);
    return { status: won ? "won" : "lost", delta: won ? w.stake : -w.stake };
  }
  return { status:"void", delta:0 };
}

/* The betting market and its board have different lifetimes. Closing the
   market stops new chips, but the board remains the event's betting context
   through play and result entry, even when nobody placed a wager. The board
   clears only when the event result is posted. Pending wagers remain a
   fallback for state created before event operations tracked betting locks. */
function wagerBoardEvent(state, events = allEventsOf(state)) {
  const open = events.find(ev => ev.id === state.onDeck && !state.results?.[ev.id]);
  if (open) return open;

  const pending = (state.wagers || []).filter(w =>
    resolveWager(state, w, events).status === "pending");
  const pendingIds = new Set(pending.map(({ eventId }) => eventId));
  const activityAt = ev => Math.max(
    Number(state.eventOps?.[ev.id]?.resultEntryAt || 0),
    Number(state.eventOps?.[ev.id]?.bettingLockedAt || 0),
    Number(state.eventOps?.[ev.id]?.startedAt || 0),
    Number(state.eventOps?.[ev.id]?.bettingOpenedAt || 0),
    ...pending.filter(w => w.eventId === ev.id)
      .map(w => Number(w.updatedAt || w.ts || 0)),
  );
  return events
    .filter(ev => !state.results?.[ev.id]
      && !state.shelved?.[ev.id]
      && ((["betting-locked", "in-progress", "result-entry"]
          .includes(resolveEventLifecycle(state, ev).phase)
          && state.eventOps?.[ev.id]?.bettingLockedAt)
        || pendingIds.has(ev.id)))
    .sort((a, b) => activityAt(b) - activityAt(a))[0] || null;
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
const POKER_CONFIG = Object.freeze({
  minimumStack:BUYIN_FLOOR,
  stackQuantum:PT,
  countQuantum:CHIP_MIN,
  maxStack:null,
  rounding:"exact",
  denominations:Object.freeze([1000, 500, 100, 25]),
  blindPack:Object.freeze({ denomination:25, count:8, minimumStack:400 }),
  /* small chips to play with before any 1000 is dealt */
  workingLayer:Object.freeze([Object.freeze({ v:100, n:10 }), Object.freeze({ v:500, n:2 })]),
});
/* blind schedule: seven levels, about an hour 45; median stack ~40 BB deep */
const POKER_LEVELS = [
  { sb:25, bb:50, mins:15 }, { sb:50, bb:100, mins:15 }, { sb:100, bb:200, mins:15 },
  { sb:150, bb:300, mins:15 }, { sb:250, bb:500, mins:15 }, { sb:400, bb:800, mins:15 },
  { sb:600, bb:1200, mins:15 },
];
const pokerLevels = () => POKER_LEVELS.map(l => ({ ...l }));
/* pure clock walk; clients tick a 1s interval and re-derive from a
   server-anchored now. The current level carries its own start and an
   optional pause, so a nudge starts the new level fresh and a pause holds
   the remaining time exactly. Tables started before those fields existed
   keep deriving from startedAt plus levelOffset. The last level has no end:
   it counts down once and then reads as the final level, never 0:00. */
function pokerClock(poker, now) {
  const levels = poker.levels || POKER_LEVELS;
  const lastIdx = levels.length - 1;
  if (!poker.startedAt) return { idx:0, ...levels[0], msLeft:levels[0].mins * 60000,
    running:false, paused:false, last:lastIdx === 0, final:false };
  const paused = Number.isFinite(poker.pausedAt) && poker.pausedAt > 0;
  const at = paused ? poker.pausedAt : now;
  let idx, elapsed;
  if (Number.isInteger(poker.levelIdx) && Number.isFinite(poker.levelStartedAt)) {
    idx = Math.max(0, Math.min(lastIdx, poker.levelIdx));
    elapsed = Math.max(0, at - poker.levelStartedAt);
    while (idx < lastIdx && elapsed >= levels[idx].mins * 60000) {
      elapsed -= levels[idx].mins * 60000; idx++;
    }
  } else {
    elapsed = Math.max(0, at - poker.startedAt);
    idx = 0;
    while (idx < lastIdx && elapsed >= levels[idx].mins * 60000) {
      elapsed -= levels[idx].mins * 60000; idx++;
    }
    const shifted = Math.max(0, Math.min(lastIdx, idx + (poker.levelOffset || 0)));
    /* a legacy nudge moved the level but not its clock: never report a
       shifted level as already expired */
    if (shifted !== idx) elapsed = Math.min(elapsed, levels[shifted].mins * 60000 - 1000);
    idx = shifted;
  }
  const msLeft = Math.max(0, levels[idx].mins * 60000 - elapsed);
  const last = idx === lastIdx;
  return { idx, ...levels[idx], msLeft, elapsed, running:!paused, paused, last,
    final:last && msLeft === 0 };
}
/* the level a clock write starts from: the derived clock at the server's now */
function pokerClockAnchor(poker, now) {
  const clk = pokerClock(poker, now);
  const levels = poker.levels || POKER_LEVELS;
  return { idx:clk.idx, levelStartedAt:now - (levels[clk.idx].mins * 60000 - clk.msLeft) };
}
/* Physical dealing breakdown: reserve eight 25s for blinds when practical,
   then a working layer (up to ten 100s and two 500s) so nobody opens with a
   stack of 1000s they cannot bet with, then greedily. The final 25 pass keeps
   post-finale counts exact too. */
function pokerDenoms(pts) {
  const value = Number(pts);
  if (!Number.isInteger(value) || value < 0 || value % POKER_CONFIG.countQuantum !== 0)
    return [];
  if (value === 0) return [];
  if (value < POKER_CONFIG.blindPack.minimumStack)
    return [{ v:POKER_CONFIG.blindPack.denomination,
      n:value / POKER_CONFIG.blindPack.denomination }];

  let chips = value;
  const counts = new Map();
  const add = (v, n) => {
    if (n > 0) counts.set(v, (counts.get(v) || 0) + n);
  };
  const pack = POKER_CONFIG.blindPack;
  add(pack.denomination, pack.count);
  chips -= pack.denomination * pack.count;
  for (const { v, n:most } of POKER_CONFIG.workingLayer) {
    const n = Math.min(most, Math.floor(chips / v));
    add(v, n);
    chips -= n * v;
  }
  for (const v of POKER_CONFIG.denominations.filter(v => v !== pack.denomination)) {
    const n = Math.floor(chips / v);
    add(v, n);
    chips -= n * v;
  }
  add(pack.denomination, chips / pack.denomination);
  return POKER_CONFIG.denominations
    .filter(v => counts.has(v))
    .map(v => ({ v, n:counts.get(v) }));
}

/* Pure finale audit used by setup and deterministic 12/13/14-player
   rehearsals. Weekend points are already exact 100-chip units; M1 does not
   silently round or cap them. The only adjustment is the configured minimum. */
function pokerDistribution(entries) {
  const source = Array.isArray(entries) ? entries : [];
  const seen = new Set();
  const errors = [];
  const rows = source.map((entry, index) => {
    const player = typeof entry?.player === "string" && entry.player
      ? entry.player : `seat-${index + 1}`;
    const before = Number(entry?.pts);
    if (seen.has(player)) errors.push(`Duplicate poker seat: ${player}`);
    seen.add(player);
    if (!Number.isInteger(before))
      errors.push(`Invalid stack for ${player}`);
    else if (before % POKER_CONFIG.stackQuantum !== 0)
      errors.push(`${player}'s stack must be exact ${POKER_CONFIG.stackQuantum}s`);
    /* a correction can leave a balance under zero; it deals as zero, so the
       minimum stack covers it and the grant brings the board up to the stack */
    const legalBefore = Number.isInteger(before) ? before : 0;
    const uncapped = Math.max(POKER_CONFIG.minimumStack, legalBefore);
    const stack = POKER_CONFIG.maxStack === null
      ? uncapped : Math.min(POKER_CONFIG.maxStack, uncapped);
    const denominations = pokerDenoms(stack);
    if (denominations.reduce((sum, chip) => sum + chip.v * chip.n, 0) !== stack)
      errors.push(`Cannot deal ${player}'s stack exactly`);
    return {
      player,
      before:legalBefore,
      stack,
      grant:stack - legalBefore,
      denominations,
    };
  });
  return {
    ok:errors.length === 0,
    errors,
    rows,
    total:rows.reduce((sum, row) => sum + row.stack, 0),
    minimumCount:rows.filter(row => row.grant > 0).length,
    inventory:pokerInventory(rows.map(row => row.stack)),
  };
}
/* the tray: how many of each chip the whole table is dealt */
function pokerInventory(stacks) {
  const totals = new Map();
  (Array.isArray(stacks) ? stacks : Object.values(stacks || {})).forEach(stack =>
    pokerDenoms(stack).forEach(({ v, n }) => totals.set(v, (totals.get(v) || 0) + n)));
  return POKER_CONFIG.denominations.filter(v => totals.has(v)).map(v => ({ v, n:totals.get(v) }));
}

/* ─────────── duels: challenges are offers ───────────
   A challenge written with `consent:true` is an offer. It reserves only the
   challenger's ante until the recipient accepts (or, for an open challenge,
   until the first eligible player takes it). An unaccepted offer lapses
   DUEL_LAPSE_MS after `ts`; a lapsed offer reserves nothing and reads as void,
   so no timer is needed. Records without `consent` predate the offer model:
   both antes were reserved at send, so they read as accepted and settle
   exactly as before. */
const DUEL_LAPSE_MS = 10 * 60 * 1000;
const duelAccepted = duel => !!duel && (!duel.consent || !!duel.acceptedAt);
const duelLapsed = (duel, now = Date.now()) => !!duel && duel.status === "open"
  && !duelAccepted(duel) && now - Number(duel.ts || 0) >= DUEL_LAPSE_MS;
const duelLapsesAt = duel => duel?.consent ? Number(duel.ts || 0) + DUEL_LAPSE_MS : null;

/* duel outcome is DERIVED from the two stored runs, never written. A foul
   loses to a clean draw; two fouls or identical times push, chips go back. */
function resolveDuel(duel) {
  if (duel.status !== "open") return { settled:false, status:duel.status };
  if (!duelAccepted(duel)) return { settled:false, status:"open" };
  const a = duel.runs?.[duel.from], b = duel.runs?.[duel.to];
  if (!a || !b) return { settled:false, status:"open" };
  const score = r => (r.foul ? Infinity : r.ms);
  if (score(a) === score(b)) return { settled:true, push:true };
  const winner = score(a) < score(b) ? duel.from : duel.to;
  return { settled:true, push:false, winner, loser: winner === duel.from ? duel.to : duel.from };
}
/* one lifecycle every surface reads:
   offered | lapsed | live | settled | declined | withdrawn | void */
function duelPhase(duel, now = Date.now()) {
  if (!duel) return null;
  if (duel.status !== "open")
    return duel.status === "declined" || duel.status === "withdrawn" ? duel.status : "void";
  if (resolveDuel(duel).settled) return "settled";
  if (!duelAccepted(duel)) return duelLapsed(duel, now) ? "lapsed" : "offered";
  return "live";
}
/* offered or live: the duels that still need someone */
const duelOpen = (duel, now = Date.now()) => {
  const phase = duelPhase(duel, now);
  return phase === "offered" || phase === "live";
};
/* chips a player's duels hold back: every accepted, unsettled duel they sit
   in, plus the challenger's own ante on an offer still waiting for an answer */
function duelReserve(state, player, now = Date.now()) {
  if (!player) return 0;
  return (state?.duels || []).reduce((sum, duel) => {
    const phase = duelPhase(duel, now);
    const stake = Number(duel.stake) || 0;
    if (phase === "live" && (duel.from === player || duel.to === player)) return sum + stake;
    if (phase === "offered" && duel.from === player) return sum + stake;
    return sum;
  }, 0);
}
/* what a player can still put up: the same cap and balance a wager uses */
function duelRoom(state, player, { events, rows, now = Date.now() } = {}) {
  const standings = rows || computeStandings(state);
  const pts = standings.find(row => row.player === player)?.pts ?? 0;
  const exposure = atRisk(state, player, events || allEventsOf(state)) + duelReserve(state, player, now);
  const cap = maxRisk(pts);
  return { pts, cap, exposure, capRoom:cap - exposure, balanceRoom:pts - exposure,
    room:Math.min(cap - exposure, pts - exposure) };
}
/* the offered or live duel two players already share, if any */
const duelBetween = (state, a, b, now = Date.now()) => (state?.duels || []).find(duel =>
  duelOpen(duel, now) && duel.to && ((duel.from === a && duel.to === b) || (duel.from === b && duel.to === a)))
  || null;
/* three challenges a day. Declined, withdrawn and lapsed offers do not count. */
const DUEL_DAILY_LIMIT = 3;
const duelsSentToday = (state, player, now = Date.now()) => (state?.duels || []).filter(duel =>
  duel.from === player && Number(duel.ts || 0) > now - 24 * 60 * 60 * 1000
  && !["declined", "withdrawn", "lapsed"].includes(duelPhase(duel, now))).length;
/* Fairness: until a duel settles, a viewer may see only their own run. Other
   runs keep the fact that someone drew and lose the time and foul. Pure; the
   broadcast projection applies it per connection. */
function redactDuelsForViewer(duels, viewerPlayer) {
  if (!Array.isArray(duels)) return duels;
  return duels.map(duel => {
    if (!duel || typeof duel !== "object" || !duel.runs || typeof duel.runs !== "object") return duel;
    if (resolveDuel(duel).settled) return duel;
    let changed = false;
    const runs = {};
    for (const [player, run] of Object.entries(duel.runs)) {
      if (player === viewerPlayer || !run) runs[player] = run;
      else { runs[player] = { played:true }; changed = true; }
    }
    return changed ? { ...duel, runs } : duel;
  });
}

/* Each place pays AWARDS per player. A bracket has no 3rd-place game, so the
   two semifinal losers split 3rd: each side's share is floored to 100s, and an
   award that cannot split evenly in 100s rounds down rather than invent chips.
   Event crew (a draw's players left off every team) earn what a 3rd-place
   player actually gets: the split share when the bracket splits 3rd, the
   3rd-place award otherwise. Value-less events (the poker finale) pay nothing. */
const splitThird = (each, sides) => sides > 1 ? Math.floor(each / sides / PT) * PT : each;
function resultAwards(state, ev, res) {
  const table = AWARDS[ev?.value] || [0, 0, 0];
  const draw = state.draws?.[ev?.id];
  const bracket = !!state.brackets?.[ev?.id] && !!draw?.teams;
  const out = [];
  let thirdEach = table[2] || 0;
  (res?.slots || []).forEach((players, place) => {
    let each = table[place] || 0;
    if (place === 2 && bracket)
      each = splitThird(each, new Set((players || []).map(p =>
        draw.teams.findIndex(team => team.players?.includes(p)))).size);
    if (place === 2 && (players || []).length) thirdEach = each;
    (players || []).forEach(player => out.push({ player, place, pts:each }));
  });
  if (!res?.stacks && thirdEach > 0) {
    const placed = new Set(out.map(award => award.player));
    (draw?.roles || []).forEach(({ player }) => {
      if (player && !placed.has(player)) out.push({ player, place:"crew", pts:thirdEach });
    });
  }
  return out;
}
/* what an event pays before anyone plays it, for the event sheet */
function awardPlan(ev, draw = null) {
  const table = AWARDS[ev?.value] || [0, 0, 0];
  const crew = draw ? (draw.roles || []).length > 0
    : Number.isInteger(eventCapacity(ev)) && eventCapacity(ev) < ROSTER.length;
  const rows = table.map((pts, place) => ({ place,
    pts:place === 2 && ev?.teamCfg?.bracket ? splitThird(pts, 2) : pts,
    split:place === 2 && !!ev?.teamCfg?.bracket }));
  return [
    ...rows,
    ...(crew ? [{ place:"crew", pts:rows[2].pts }] : []),
  ].filter(row => row.pts > 0);
}
/* a ruling made after the finale counts corrects that count: it carries the
   poker result revision, applies only on top of those posted stacks, and never
   leaks into the pre-poker board. A recount posts a new revision, and rulings
   made on an earlier count stop applying (they stay in the ledger, labelled
   with their count). Older rulings without a revision fall back to time. */
const postCountRuling = (a, stacksRes = null) => a.pokerRevision !== undefined
  || !!stacksRes && a.ts > stacksRes.ts;
const postCountRulingApplies = (a, stacksRes) => !!stacksRes && (a.pokerRevision !== undefined
  ? Number(a.pokerRevision) === Number(stacksRes.revision || 1)
  : a.ts > stacksRes.ts);

function computeStandings(state) {
  const pts = {}, wins = {}, betNet = {}, duelNet = {}, awardPts = {};
  ROSTER.forEach(p => { pts[p] = START; wins[p] = 0; betNet[p] = 0; duelNet[p] = 0; awardPts[p] = 0; });
  const evs = allEventsOf(state);
  Object.entries(state.results || {}).forEach(([eid, res]) => {
    const ev = evs.find(e => e.id === eid); if (!ev || !res) return;
    /* slots[0] counts as a win even at the finale, so the chip leader carries one */
    resultAwards(state, ev, res).forEach(({ player, place, pts:award }) => {
      if (pts[player] === undefined) return;
      pts[player] += award;
      awardPts[player] += award;
      if (place === 0) wins[player] += 1;
    });
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
  const rulings = (state.adjustments || []).filter(a => !a.removedAt);
  rulings.forEach(a => {
    if (pts[a.player] !== undefined && !postCountRuling(a)) pts[a.player] += a.delta;
  });
  /* poker finale override: final chip stacks BECOME the totals. Only rulings
     made on the count apply on top; everything earlier is already in the
     physical chips. Elimination order (embedded in the result) breaks ties
     among busted players: later bust ranks higher, and a 0 that never busted
     (older results) ranks below every bust. */
  let stacksRes = null;
  Object.values(state.results || {}).forEach(res => { if (res?.stacks) stacksRes = res; });
  /* The champion is the chip leader among the SEATS. A player marked away
     was never dealt in: their carried total stays on the board, but it can
     never outrank the table, so rank 1 is always someone who played. */
  let leaders = null;
  if (stacksRes) {
    ROSTER.forEach(p => { pts[p] = stacksRes.stacks[p] ?? 0; });
    rulings.forEach(a => {
      if (postCountRulingApplies(a, stacksRes) && pts[a.player] !== undefined) pts[a.player] += a.delta;
    });
    const seats = (Array.isArray(stacksRes.seats) ? stacksRes.seats
      : Array.isArray(state.poker?.seats) ? state.poker.seats : ROSTER).filter(p => pts[p] !== undefined);
    const top = seats.length ? Math.max(...seats.map(p => pts[p])) : 0;
    leaders = new Set(top > 0 ? seats.filter(p => pts[p] === top) : []);
  }
  const lead = p => leaders?.has(p) ? 1 : 0;
  const outRank = p => {
    const i = (stacksRes?.outs || []).indexOf(p);
    return i >= 0 ? i : stacksRes?.stacks?.[p] === 0 ? -1 : Infinity;
  };
  const rows = ROSTER.map(p => ({ player:p, pts:pts[p], wins:wins[p], betNet:betNet[p], duelNet:duelNet[p], awardPts:awardPts[p] }))
    .sort((x,y) => lead(y.player) - lead(x.player) || y.pts - x.pts
      || (stacksRes ? outRank(y.player) - outRank(x.player) : 0)
      || y.wins - x.wins || x.player.localeCompare(y.player));
  let rank = 0, prev = null;
  rows.forEach((r,i) => {
    const key = `${lead(r.player)}:${r.pts}`;
    if (key !== prev || (stacksRes && r.pts === 0)) { rank = i+1; prev = key; }
    r.rank = rank;
  });
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

function drawTeams(ev, state, players, active = presentPlayers(state)) {
  const cfg = ev.teamCfg; if (!cfg) return null;
  const compatibility = validateEventParticipants(ev, players, active);
  if (!compatibility.ok) return null;
  const fit = compatibility.fit || cfg;
  const s = strengthMap(state, players, ev.sport);
  const nTeams = fit.teams;
  const groups = refineTeams(seedSnake(players, nTeams, p => s[p]), p => s[p]).map(g => shuffle(g));
  if (participationForEvent(ev).type === "strict-teams"
      && groups.some(group => group.length !== fit.size)) return null;
  const mascots = (fit.size || 0) >= 3 ? shuffle(TEAM_NAMES) : null;
  /* two draws in one millisecond must not share an id: tickets key on it */
  return { id:`d${Date.now()}-${Math.random().toString(36).slice(2, 10)}`, method:"balanced", ts:Date.now(),
    teams: groups.map((players, i) => mascots ? { players, name: mascots[i % mascots.length] } : { players }) };
}

function splitIntoGroups(keys, nGroups, strengthOf) {
  return refineTeams(seedSnake(keys, nGroups, strengthOf), strengthOf).map(g => shuffle(g));
}

function makeBracket(n) {
  if (n === 2) return { size:2, rounds:[
    [ {a:{t:0},b:{t:1},winner:null} ],
  ]};
  if (n === 3) return { size:3, rounds:[
    [ {a:{t:1},b:{t:2},winner:null} ],
    [ {a:{t:0},b:{w:[0,0]},winner:null} ],
  ]};
  if (n === 5) return { size:5, rounds:[
    [ {a:{t:3},b:{t:4},winner:null} ],
    [ {a:{t:0},b:{w:[0,0]},winner:null}, {a:{t:1},b:{t:2},winner:null} ],
    [ {a:{w:[1,0]},b:{w:[1,1]},winner:null} ],
  ]};
  if (n === 4) return { size:4, rounds:[
    [ {a:{t:0},b:{t:3},winner:null}, {a:{t:1},b:{t:2},winner:null} ],
    [ {a:{w:[0,0]},b:{w:[0,1]},winner:null} ],
  ]};
  if (n === 6) return { size:6, rounds:[
    [ {a:{t:3},b:{t:4},winner:null}, {a:{t:2},b:{t:5},winner:null} ],
    [ {a:{t:0},b:{w:[0,0]},winner:null}, {a:{t:1},b:{w:[0,1]},winner:null} ],
    [ {a:{w:[1,0]},b:{w:[1,1]},winner:null} ],
  ]};
  if (Number.isInteger(n) && n >= 7 && n <= MAX_BRACKET) return seededBracket(n);
  return null;
}
/* 2 to 6 keep the hand-drawn shapes above: stored brackets depend on them. */
const MAX_BRACKET = 16;
/* seeds 1..P in standard bracket order: 1 meets P in the first round, and
   the top two seeds can meet only in the final */
function seedOrder(P) {
  let order = [1];
  while (order.length < P) {
    const n = order.length * 2;
    order = order.flatMap(seed => [seed, n + 1 - seed]);
  }
  return order;
}
/* A single-elimination bracket of n entrants (draw index = seed - 1) in the
   next power of two. A seed whose first opponent does not exist takes a bye
   and enters the next round directly, as a {t} slot, the way the 5 and 6
   shapes seat their byes. Round 1 holds only the matches actually played. */
function seededBracket(n) {
  let P = 2;
  while (P < n) P *= 2;
  const order = seedOrder(P);
  const rounds = [[]];
  let entries = [];
  for (let i = 0; i < P; i += 2) {
    const [hi, lo] = [order[i], order[i + 1]];
    if (lo > n) { entries.push({ t:hi - 1 }); continue; }
    rounds[0].push({ a:{ t:hi - 1 }, b:{ t:lo - 1 }, winner:null });
    entries.push({ w:[0, rounds[0].length - 1] });
  }
  for (let r = 1; entries.length > 1; r++) {
    rounds[r] = [];
    const next = [];
    for (let i = 0; i < entries.length; i += 2) {
      rounds[r].push({ a:entries[i], b:entries[i + 1], winner:null });
      next.push({ w:[r, rounds[r].length - 1] });
    }
    entries = next;
  }
  return { size:n, rounds };
}
const ROUND_NAMES = { 2:["Final"], 3:["Semifinal","Final"], 4:["Semifinals","Final"],
  5:["Play-in","Semifinals","Final"], 6:["Play-in","Semifinals","Final"],
  7:["Quarterfinals","Semifinals","Final"], 8:["Quarterfinals","Semifinals","Final"] };
for (let n = 9; n <= MAX_BRACKET; n++) ROUND_NAMES[n] = ["Round 1","Quarterfinals","Semifinals","Final"];
/* A round's name, and one match's short name: "Semifinal 2", "Final",
   "Round 1 Match 3" (a numbered round keeps "Match" so it reads). */
const bracketRoundName = (size, r) => ROUND_NAMES[size]?.[r] || `Round ${r + 1}`;
function bracketMatchName(bracket, r, m) {
  const name = bracketRoundName(bracket?.size, r);
  if ((bracket?.rounds?.[r]?.length || 1) <= 1) return name;
  return /\d$/.test(name) ? `${name} Match ${m + 1}` : `${name.replace(/s$/, "")} ${m + 1}`;
}
function resolveSlot(br, slot) {
  if (!slot) return null;
  if (slot.t !== undefined) return slot.t;
  const src = br.rounds[slot.w[0]]?.[slot.w[1]];
  return src && src.winner !== null && src.winner !== undefined ? src.winner : null;
}
/* The commissioner may play a different seated matchup first while its
   market is still empty. The choice rides on the bracket so every reader of
   what plays now agrees, and it lapses once that matchup is decided. */
function bracketMatchOpen(br, r, m) {
  const match = br?.rounds?.[r]?.[m];
  if (!match || match.winner !== null && match.winner !== undefined) return false;
  return resolveSlot(br, match.a) !== null && resolveSlot(br, match.b) !== null;
}
function bracketOrder(br) {
  const order = [];
  (br?.rounds || []).forEach((round, r) => round.forEach((_, m) => order.push([r, m])));
  const next = Array.isArray(br?.next) ? br.next : null;
  if (next && bracketMatchOpen(br, next[0], next[1]))
    return [[next[0], next[1]], ...order.filter(([r, m]) => r !== next[0] || m !== next[1])];
  return order;
}
/* The QA path uses the same current matchup and eligibility as real chips. */
function qaBracketMatchWager(state, ev, player, ordinal = 0, stake = PT) {
  const draw = state.draws?.[ev?.id];
  const contest = resolveCurrentContest(state, ev);
  if (!draw || contest?.kind !== "match") return null;
  const sides = contest.sides.filter(side => contestBetEligibility(contest, player, side.key));
  if (!sides.length) return null;
  const index = Math.abs(Math.trunc(Number(ordinal) || 0));
  const teamIdx = sides[index % sides.length].key;
  return {
    kind:"match",
    eventId:ev.id,
    evName:ev.name,
    drawId:draw.id,
    match:[...contest.match],
    matchName:contest.label,
    contestId:contest.id, contestRevision:contest.revision,
    teamIdx,
    pickPlayers:[...draw.teams[teamIdx].players],
    pickTeam:true,
    stake,
  };
}
const bracketChampion = br => {
  const last = br.rounds[br.rounds.length-1][0];
  return last.winner ?? null;
};

/* ─────────── event lifecycle ───────────
   Facts that already exist (draws, brackets, stages, results, poker) remain
   authoritative. eventOps only records distinctions those facts cannot
   express: market locked, play started, and result entry opened. */
const EVENT_PHASES = [
  "scheduled", "setup", "draw-pending", "draw-revealed", "betting-open",
  "betting-locked", "in-progress", "result-entry", "complete", "shelved",
];
const EVENT_PHASE_LABELS = {
  scheduled:"Scheduled",
  setup:"Setup",
  "draw-pending":"Draw pending",
  "draw-revealed":"Draw revealed",
  "betting-open":"Betting open",
  "betting-locked":"Betting locked",
  "in-progress":"In progress",
  "result-entry":"Result entry",
  complete:"Complete",
  shelved:"Shelved",
};
const eventOpOf = (state, evId) => state.eventOps?.[evId] || {};
const bracketStarted = br => !!br?.rounds?.some(round =>
  round.some(match => match.winner !== null && match.winner !== undefined));
const stagesStarted = st => !!st && (
  st.finalWinner !== null && st.finalWinner !== undefined
  || st.groups?.some(group => (group.through || []).length > 0)
);
const needsStageSetup = (state, ev) => !!ev.stageCfg && !state.stages?.[ev.id]
  && !(!state.eventOps?.[ev.id]?.contest && (state.onDeck === ev.id
    || state.eventOps?.[ev.id]?.startedAt || state.eventOps?.[ev.id]?.bettingOpenedAt
    || state.eventOps?.[ev.id]?.bettingLockedAt || state.eventOps?.[ev.id]?.resultEntryAt));
/* A contest is one wagerable decision. Only the first seated, unresolved
   matchup/group is current. Old snapshots derive their phase without adding
   a market or guessing a winner from historical advancement selections. */
function contestTarget(state, ev) {
  if (!ev || state.results?.[ev.id] || state.shelved?.[ev.id]
      || ev.finale || (state.drafts?.[ev.id] && !state.draws?.[ev.id])) return null;
  const draw = state.draws?.[ev.id];
  if (ev.teamCfg && !draw) return null;
  const br = state.brackets?.[ev.id];
  if (ev.teamCfg?.bracket && !br) return null;
  if (br) {
    for (const [r, m] of bracketOrder(br)) {
      const match = br.rounds[r][m];
      if (match.winner !== null && match.winner !== undefined) continue;
      const keys = [resolveSlot(br, match.a), resolveSlot(br, match.b)];
      if (keys.some(key => key === null || key === undefined || !draw?.teams?.[key])) continue;
      return { id:`match:${ev.id}:${draw.id}:${r}:${m}`, kind:"match", match:[r,m], drawId:draw.id,
        label:`${ROUND_NAMES[draw.teams.length]?.[r] || `Round ${r + 1}`} · Match ${m + 1}`,
        sides:keys.map(key => ({ key, players:[...draw.teams[key].players] })) };
    }
    return null;
  }
  const st = state.stages?.[ev.id];
  if (needsStageSetup(state, ev)) return null;
  if (st) {
    if (st.entrantType === "team" && (!draw || st.drawId !== draw.id)) return null;
    const sides = keys => keys.map(key => ({ key, players:stageEntrantView(state, st, key).players }));
    const group = st.groups.findIndex(g => (g.through || []).length < st.advance
      || (st.contestVersion === 1 && (g.winner === null || g.winner === undefined)));
    if (group >= 0) return { id:`heat:${ev.id}:${st.id}:${group}`, kind:"heat", group,
      stagesId:st.id, drawId:st.drawId || null, label:st.groups[group].name, sides:sides(st.groups[group].entrants) };
    const finalists = stageFinalists(st);
    if (!finalists || st.finalWinner !== null && st.finalWinner !== undefined) return null;
    return { id:`final:${ev.id}:${st.id}`, kind:"stage-final", stagesId:st.id, drawId:st.drawId || null,
      label:"Final", sides:sides(finalists) };
  }
  return { id:`ffa:${ev.id}:${draw?.id || "solo"}`, kind:"ffa", drawId:draw?.id || null, label:ev.name,
    sides:draw ? draw.teams.map((team, key) => ({ key, players:[...team.players] }))
      : presentPlayers(state).map(key => ({ key, players:[key] })) };
}
function resolveCurrentContest(state, ev) {
  const target = contestTarget(state, ev);
  if (!target) return null;
  const op = eventOpOf(state, ev.id);
  const stored = op.contest;
  const same = stored?.id === target.id;
  const legacy = !stored;
  let phase;
  if (same) phase = stored.phase;
  else if (stored || op.resultEntryAt) phase = "awaiting-result";
  else if (op.startedAt || bracketStarted(state.brackets?.[ev.id]) || stagesStarted(state.stages?.[ev.id]))
    phase = "in-progress";
  else if (state.onDeck === ev.id) phase = "betting-open";
  else phase = op.bettingLockedAt ? "betting-locked" : "scheduled";
  const nextAction = phase === "betting-open" ? lifecycleAction("lock-betting", "Lock bets and start")
    : phase === "betting-locked" ? lifecycleAction("start-event", "Start")
      : phase === "awaiting-result" ? lifecycleAction("post-result", "Post result")
        : phase === "scheduled" ? lifecycleAction("open-betting", "Open betting")
        : target.kind === "ffa" ? lifecycleAction("enter-result", "Enter result")
          : lifecycleAction("record-contest-winner", "Record winner");
  return { ...target, eventId:ev.id, revision:same ? Number(stored.revision || 0) : Number(op.contestRevision || 0),
    phase, legacy, players:[...new Set(target.sides.flatMap(side => side.players))], nextAction };
}
/* Any contest with exactly two sides is a matchup, whatever its format: it
   pays even and a competitor may back only their own side. Only a wider
   free-for-all pays 2:1 and leaves every side open to everyone. */
const wideField = contest => contest?.kind === "ffa" && contest.sides.length > 2;
const contestMult = contest => wideField(contest) ? OUTRIGHT_MULT : 1;
function contestBetEligibility(contest, player, sideKey) {
  const side = contest?.sides.find(item => item.key === sideKey);
  if (!side || !isActivePlayer(player)) return false;
  if (wideField(contest)) return true;
  return !contest.players.includes(player) || side.players.includes(player);
}
/* the side a ticket backs, in the contest's own side keys */
function wagerSide(state, w) {
  if (w.kind === "match") return w.teamIdx;
  if (w.kind !== "outright") return w.pickKey;
  if (!w.pickTeam) return w.pick;
  if (Number.isInteger(w.teamIdx)) return w.teamIdx;
  const teams = state.draws?.[w.eventId]?.teams || [];
  const want = [...(w.pickPlayers || [])].sort().join("|");
  const index = teams.findIndex(team => [...team.players].sort().join("|") === want);
  return index < 0 ? null : index;
}
/* Outside a wide field a bettor holds one side per contest, so no ticket pair
   can cover both outcomes. Returns the side this player already backs. */
function contestSideOf(state, contest, player, events = allEventsOf(state)) {
  if (!contest || wideField(contest)) return null;
  const held = (state.wagers || []).find(w => w.player === player && wagerMatchesContest(w, contest)
    && resolveWager(state, w, events).status === "pending");
  return held ? wagerSide(state, held) : null;
}
/* Shared canonical target check keeps legacy pending tickets readable while
   preventing an old outright/advance ticket from becoming a new contest bet. */
function wagerMatchesContest(wager, contest) {
  if (!contest || wager.eventId !== contest.eventId) return false;
  if (wager.contestId && wager.contestId !== contest.id) return false;
  if (contest.kind === "ffa") return wager.kind === "outright"
    && (!contest.drawId || wager.pickTeam && wager.drawId === contest.drawId);
  if (contest.kind === "match") return wager.kind === "match" && wager.drawId === contest.drawId
    && wager.match?.[0] === contest.match[0] && wager.match?.[1] === contest.match[1];
  return wager.stagesId === contest.stagesId && (contest.kind === "heat"
    ? wager.kind === "heat" && !wager.final && wager.group === contest.group
    : wager.kind === "stage" && wager.final === true);
}
/* ─────────── exposure after a correction ───────────
   A correction, undo, void or ruling can shrink a stack under chips it
   already has riding. In the same write, void each player's newest pending
   chips and duel antes until exposure fits min(maxRisk, balance) again.
   Tickets keep their record; settlement stays derived. Mutates the state it
   is given and returns what went, so a preview can run it on a clone. */
function enforceExposure(state, now = Date.now()) {
  if (pokerLive(state) || stacksPosted(state)) return [];
  const events = allEventsOf(state);
  const rows = computeStandings(state);
  const voided = [];
  for (const { player, pts } of rows) {
    const limit = Math.max(0, Math.min(maxRisk(pts), pts));
    const items = [];
    for (const w of (state.wagers || []).filter(w => w.player === player
        && resolveWager(state, w, events).status === "pending")) {
      const chips = Array.isArray(w.chips) && w.chips.length ? w.chips : null;
      if (!chips) items.push({ w, stake:w.stake, ts:w.updatedAt || w.ts || 0, order:0 });
      else chips.forEach((chip, index) => items.push({ w, chip, stake:Number(chip.stake) || 0,
        ts:chip.ts || w.ts || 0, order:index }));
    }
    /* only antes a duel actually holds count: accepted duels for both sides,
       a waiting offer for its sender (the same rule as duelReserve) */
    for (const d of state.duels || []) {
      const phase = duelPhase(d, now);
      if ((phase === "live" && (d.from === player || d.to === player)) || (phase === "offered" && d.from === player))
        items.push({ d, stake:d.stake, ts:d.acceptedAt || d.ts || 0, order:0 });
    }
    let exposure = items.reduce((sum, item) => sum + item.stake, 0);
    items.sort((a, b) => b.ts - a.ts || b.order - a.order);
    for (const item of items) {
      if (exposure <= limit) break;
      if (item.d) {
        if (!(item.d.status === "open" && !resolveDuel(item.d).settled)) continue;
        item.d.status = "void";
        Object.assign(item.d, { voidedAt:now, voidedBy:"exposure" });
        voided.push({ type:"duel", id:item.d.id, players:[item.d.from, item.d.to], stake:item.d.stake });
      } else if (item.chip && item.w.chips.length > 1 && item.w.chips.at(-1) === item.chip) {
        item.w.chips.pop();
        item.w.stake = Math.max(0, item.w.stake - item.stake);
        item.w.updatedAt = now;
        item.w.voidedChips = [...(item.w.voidedChips || []), { ...item.chip, voidedAt:now }];
        voided.push({ type:"chip", id:item.w.id, player, eventId:item.w.eventId, stake:item.stake });
      } else {
        if (item.w.status === "void") continue;
        item.w.status = "void";
        Object.assign(item.w, { voidedAt:now, voidedBy:"exposure" });
        voided.push({ type:"wager", id:item.w.id, player, eventId:item.w.eventId, stake:item.w.stake });
        exposure -= item.w.stake - item.stake;
      }
      exposure -= item.stake;
    }
  }
  return voided;
}
/* chips per player, summed: [{ player, stake }] in first-seen order */
function refundTotals(items = []) {
  const totals = new Map();
  items.forEach(item => { if (item?.player) totals.set(item.player, (totals.get(item.player) || 0) + Number(item.stake || 0)); });
  return [...totals].map(([player, stake]) => ({ player, stake }));
}
/* mark wagers void in place, keeping what they were */
function voidWagerRecords(state, ids, reason, now = Date.now()) {
  const wanted = new Set(ids);
  const events = allEventsOf(state);
  const voided = [];
  (state.wagers || []).forEach(wager => {
    if (!wanted.has(wager.id) || wager.status === "void") return;
    const was = resolveWager(state, wager, events).status;
    wager.status = "void";
    wager.voidReason = reason;
    wager.voidedAt = now;
    if (was === "won" || was === "lost") wager.voidedFrom = was;
    voided.push({ id:wager.id, player:wager.player, stake:Number(wager.stake || 0) });
  });
  return voided;
}

/* ─────────── recorded contests and their correction ───────────
   Every recorded bracket match, heat and stage final is pushed onto the
   event's contest stack with what it replaced, so any earlier contest can
   be corrected. Correcting one rewinds it and every contest recorded after
   it in the same write. Legacy state carries only lastContest. */
function contestStackOf(state, evId) {
  const op = eventOpOf(state, evId);
  if (Array.isArray(op.contestStack)) return op.contestStack;
  return op.lastContest ? [op.lastContest] : [];
}
/* the short name a commissioner reads: "Play-in 1", "Semifinal 2", "Final", "Heat 3" */
function contestEntryLabel(state, ev, entry) {
  if (!entry) return "";
  if (typeof entry.short === "string" && entry.short) return entry.short;
  if (entry.kind === "match" && Array.isArray(entry.match)) {
    const [r, m] = entry.match;
    const br = state.brackets?.[ev?.id];
    const size = state.draws?.[ev?.id]?.teams?.length || br?.size;
    return bracketMatchName({ size, rounds:br?.rounds }, r, m);
  }
  if (entry.kind === "heat") return state.stages?.[ev?.id]?.groups?.[entry.group]?.name || `Heat ${Number(entry.group) + 1}`;
  return "Final";
}
const contestOfEntry = (evId, entry) => ({ id:entry.id, eventId:evId, kind:entry.kind, match:entry.match,
  group:entry.group, stagesId:entry.stagesId, drawId:entry.drawId });
function restoreContestEntry(state, evId, entry) {
  if (entry.kind === "match") {
    const match = state.brackets?.[evId]?.rounds?.[entry.match[0]]?.[entry.match[1]];
    if (match) match.winner = entry.previousWinner ?? null;
  } else if (entry.kind === "heat") {
    const group = state.stages?.[evId]?.groups?.[entry.group];
    if (group) { group.winner = entry.previousWinner ?? null; group.through = [...(entry.previousThrough || [])]; }
  } else if (state.stages?.[evId]) state.stages[evId].finalWinner = entry.previousWinner ?? null;
}
/* The correction itself, used by the server write AND by the preview, which
   runs it on a clone: one implementation, so the confirm names exactly what
   the write does. Returns what moved. */
function applyContestCorrection(state, ev, contestId, now = Date.now()) {
  const stack = [...contestStackOf(state, ev.id)];
  const index = stack.findIndex(entry => entry.id === contestId);
  if (index < 0) return null;
  const target = stack[index], later = stack.slice(index + 1);
  const events = allEventsOf(state);
  const ids = new Set();
  /* the next market is undecided by definition: its chips go back */
  const current = resolveCurrentContest(state, ev);
  if (current) (state.wagers || []).forEach(wager => {
    if (wagerMatchesContest(wager, current) && resolveWager(state, wager, events).status === "pending") ids.add(wager.id);
  });
  /* contests recorded after the corrected one are replayed from scratch, so
     every ticket on them goes back, settled or not */
  later.forEach(entry => {
    const contest = contestOfEntry(ev.id, entry);
    (state.wagers || []).forEach(wager => {
      if (wager.status !== "void" && wagerMatchesContest(wager, contest)) ids.add(wager.id);
    });
  });
  [...stack.slice(index)].reverse().forEach(entry => restoreContestEntry(state, ev.id, entry));
  const returned = voidWagerRecords(state, [...ids], "Previous result corrected", now);
  const op = state.eventOps[ev.id];
  if (target.kind === "match" && state.brackets?.[ev.id])
    state.brackets[ev.id].next = [target.match[0], target.match[1]];
  op.contestRevision = Number(op.contestRevision || 0) + 1;
  op.contest = { id:target.id, revision:op.contestRevision, phase:"in-progress" };
  op.bettingLockedAt = now;
  delete op.resultEntryAt;
  op.contestStack = stack.slice(0, index);
  if (op.contestStack.length) op.lastContest = op.contestStack.at(-1); else delete op.lastContest;
  if (state.onDeck === ev.id) state.onDeck = null;
  /* the undone winnings return to pending; anything they were already
     backing elsewhere has to fit the restored balance */
  const exposure = enforceExposure(state, now);
  return {
    contestId:target.id,
    contestRevision:op.contestRevision,
    label:contestEntryLabel(state, ev, target),
    rewinds:later.map(entry => contestEntryLabel(state, ev, entry)),
    voidIds:returned.map(item => item.id),
    refunds:refundTotals([...returned, ...exposure.filter(item => item.type !== "duel")]),
    voidDuels:exposure.filter(item => item.type === "duel")
      .map(item => ({ id:item.id, players:item.players, stake:item.stake })),
    voided:exposure,
  };
}
/* Whether a recorded contest can be corrected now, and exactly what the
   correction moves: rewound contests, returned chips, voided duels. With no
   contestId it answers for the most recent one (the undo). */
function contestCorrectionAvailability(state, ev, contestId = null, now = Date.now()) {
  const op = eventOpOf(state, ev?.id);
  const stack = ev ? contestStackOf(state, ev.id) : [];
  const entry = contestId ? stack.find(item => item.id === contestId) : stack.at(-1);
  const short = entry ? contestEntryLabel(state, ev, entry) : "";
  const response = (blocker, preview = {}) => ({ enabled:!blocker, blocker:blocker || null,
    contestId:entry?.id || null, contestRevision:Number(op.contestRevision || 0),
    label:entry ? `Correct ${short}` : null, contest:short || null,
    rewinds:[], voidIds:[], refunds:[], voidDuels:[], voided:[], ...preview });
  if (!ev || !entry) return response("No previous contest to correct");
  if (state.frozen) return response("The board is frozen");
  if (state.results?.[ev.id]) return response("The event result is already posted");
  if (state.poker || stacksPosted(state)) return response("The finale is underway");
  if (state.onDeck && state.onDeck !== ev.id) return response("Close the current betting market first");
  const rewound = stack.slice(stack.indexOf(entry));
  if (rewound.some(item => item.drawId && state.draws?.[ev.id]?.id !== item.drawId
      || item.stagesId && state.stages?.[ev.id]?.id !== item.stagesId))
    return response("Draw changed, refresh and try again");
  /* The next contest is undecided by definition, so a mis-tapped winner can
     be taken back whether its market is open, locked or already playing.
     Everything the write moves is named up front. */
  const preview = structuredClone(state);
  const moved = applyContestCorrection(preview, allEventsOf(preview).find(item => item.id === ev.id), entry.id, now);
  if (!moved) return response("No previous contest to correct");
  const { contestId:_id, contestRevision:_revision, label:_label, ...rest } = moved;
  return response(null, rest);
}
const contestUndoAvailability = (state, ev, now = Date.now()) => contestCorrectionAvailability(state, ev, null, now);
/* every recorded contest, newest first, each with its own availability */
const contestCorrections = (state, ev, now = Date.now()) => ev
  ? [...contestStackOf(state, ev.id)].reverse().map(entry => contestCorrectionAvailability(state, ev, entry.id, now)) : [];
/* One line a confirm can say out loud: "Returns Evan 200, Khoa 100". */
const refundText = (state, refunds = []) => refunds.length
  ? `Returns ${refunds.map(item => `${disp(state, item.player)} ${item.stake}`).join(", ")}` : "";
const duelPairText = (state, players = []) => players.filter(Boolean).map(player => disp(state, player)).join(" vs ");
/* The whole confirm for a correction: "Rewinds Semifinal 1. Returns Evan
   200. Voids Jeremy vs Ben duel." Empty when nothing else moves. */
function correctionText(state, moved = {}) {
  const duels = (moved.voidDuels || []).map(duel => duelPairText(state, duel.players));
  return [
    moved.rewinds?.length ? `Rewinds ${moved.rewinds.join(", ")}` : "",
    refundText(state, moved.refunds || []),
    duels.length ? `Voids ${duels.join(", ")} duel${duels.length === 1 ? "" : "s"}` : "",
  ].filter(Boolean).map(line => `${line}.`).join(" ");
}

/* ─────────── taking an announcement back ───────────
   A mis-announced event goes back to unannounced while nothing has been
   played: its chips return, its stored contest and betting stamps clear,
   and nothing is on deck. Preparation (a draw or heats) stays. */
function announcementTakeBack(state, ev) {
  const op = eventOpOf(state, ev?.id);
  const response = (blocker, extra = {}) => ({ enabled:!blocker, blocker:blocker || null,
    eventId:ev?.id || null, refunds:[], voidIds:[], ...extra });
  if (!ev) return response("No such event");
  const announced = state.onDeck === ev.id || !!op.contest || !!op.bettingOpenedAt || !!op.bettingLockedAt;
  if (!announced) return response("Not announced");
  if (state.frozen) return response("The board is frozen");
  if (state.results?.[ev.id]) return response("Result already posted");
  if (op.startedAt || op.resultEntryAt || contestStackOf(state, ev.id).length
      || bracketStarted(state.brackets?.[ev.id]) || stagesStarted(state.stages?.[ev.id]))
    return response("The event has already started");
  const events = allEventsOf(state);
  const pending = (state.wagers || []).filter(wager => wager.eventId === ev.id
    && resolveWager(state, wager, events).status === "pending");
  return response(null, { voidIds:pending.map(wager => wager.id), refunds:refundTotals(pending) });
}

/* ─────────── back to the locker room ───────────
   Starting the weekend is one confirmed tap on the first real game. It can
   be taken back only while nothing has happened: no result, no bet, no duel,
   no game started, no poker table. */
function lockerRoomAvailability(state) {
  const response = blocker => ({ enabled:!blocker, blocker:blocker || null });
  if (!state.live) return response("The weekend has not started");
  if (state.frozen) return response("The board is frozen");
  if (Object.keys(state.results || {}).length) return response("A result is posted");
  if (state.poker) return response("The poker table is set");
  const events = allEventsOf(state);
  const started = events.find(ev => state.eventOps?.[ev.id]?.startedAt || contestStackOf(state, ev.id).length);
  if (started) return response(`${started.name} has started`);
  if ((state.wagers || []).some(wager => wager.status !== "void")) return response("Bets have been placed");
  if ((state.duels || []).some(duel => ["offered", "live", "settled"].includes(duelPhase(duel))))
    return response("Duels have been sent");
  return response(null);
}

/* ─────────── the finale, before it is dealt ───────────
   Side-effect free: what pokerSetup would deal right now. Seats are the
   players present; away players carry their board total and are not dealt.
   Unplayed duels are voided by the setup (and restored by a cancel). */
function pokerSetupPreview(state) {
  const events = allEventsOf(state);
  const ev = events.find(item => item.finale) || null;
  const rows = computeStandings(state);
  const seated = rows.filter(row => !isAway(state, row.player));
  const distribution = pokerDistribution(seated);
  const blockers = [];
  if (!ev) blockers.push("No poker finale scheduled");
  else {
    if (state.frozen) blockers.push("The board is frozen");
    if (state.shelved?.[ev.id]) blockers.push("The finale is shelved");
    if (state.results?.[ev.id]) blockers.push("Result already posted");
  }
  if ((state.wagers || []).some(w => resolveWager(state, w, events).status === "pending"))
    blockers.push("Settle or void the open wagers first");
  if (seated.length < 2) blockers.push("Seat at least two players");
  if (!distribution.ok) blockers.push(distribution.errors[0] || "Invalid poker stacks");
  const voidDuels = (state.duels || []).filter(duel => duel.status === "open" && !resolveDuel(duel).settled)
    .map(duel => ({ id:duel.id, players:[duel.from, duel.to].filter(Boolean), stake:Number(duel.stake || 0),
      label:duel.to ? duelPairText(state, [duel.from, duel.to]) : `${disp(state, duel.from)} open challenge` }));
  return {
    ok:blockers.length === 0,
    blockers,
    eventId:ev?.id || null,
    seats:seated.map(row => row.player),
    away:rows.filter(row => isAway(state, row.player)).map(row => ({ player:row.player, pts:row.pts })),
    rows:distribution.rows.map(row => ({ player:row.player, before:row.before, stack:row.stack,
      grant:row.grant, denominations:row.denominations })),
    inventory:distribution.inventory,
    voidDuels,
    total:distribution.total,
    minimumCount:distribution.minimumCount,
  };
}
function resultReadiness(state, ev) {
  const blockers = [];
  if (state.drafts?.[ev.id] && !state.draws?.[ev.id])
    blockers.push("Finish or cancel the captains draft");
  if (ev.teamCfg && !state.draws?.[ev.id])
    blockers.push("Set the teams first");
  const bracket = state.brackets?.[ev.id];
  if (bracket && bracketChampion(bracket) === null)
    blockers.push("Complete the bracket");
  const stages = state.stages?.[ev.id];
  if (needsStageSetup(state, ev)) blockers.push(`Set up ${ev.stageCfg.kind} first`);
  if (ev.teamCfg?.bracket && !bracket) blockers.push("Set up the bracket first");
  if (stages && (!stageFinalists(stages)
      || stages.finalWinner === null || stages.finalWinner === undefined))
    blockers.push(`Complete the ${stages.kind === "heats" ? "heats" : "pools"} and final`);
  return { ok:blockers.length === 0, blockers };
}
const lifecycleAction = (type, label, blockers = []) => ({
  type,
  label,
  enabled:blockers.length === 0,
  blockers,
});
function resolveEventLifecycle(state, ev) {
  if (!ev) return {
    phase:"scheduled",
    label:EVENT_PHASE_LABELS.scheduled,
    blockers:["Event not found"],
    nextAction:null,
  };
  const result = state.results?.[ev.id];
  const op = eventOpOf(state, ev.id);
  const finish = resultReadiness(state, ev);
  const response = (phase, nextAction = null, blockers = []) => ({
    eventId:ev.id,
    phase,
    label:EVENT_PHASE_LABELS[phase],
    blockers,
    nextAction,
    revision:Number(op.revision || result?.revision || 0),
  });

  if (state.shelved?.[ev.id]) return response("shelved");
  if (result) return response("complete");

  if (ev.finale) {
    if (!state.poker) {
      /* the board must be still before stacks are dealt; name what moves */
      const blockers = [];
      const events = allEventsOf(state);
      const pendingWagers = (state.wagers || []).filter(w =>
        resolveWager(state, w, events).status === "pending").length;
      if (pendingWagers)
        blockers.push(`Settle ${pendingWagers} open bet${pendingWagers === 1 ? "" : "s"} first`);
      /* unplayed duels never block the finale (pokerSetup voids them), and a
         negative balance deals as 0 through the minimum-stack grant */
      return response("setup",
        lifecycleAction("setup-poker", "Set up the poker table", blockers), blockers);
    }
    if (op.resultEntryAt)
      return response("result-entry", lifecycleAction("post-poker-result", "Post the final chip counts"));
    if (!state.poker.startedAt)
      return response("setup", lifecycleAction("start-poker", "Start the poker table"));
    return response("in-progress", lifecycleAction("run-poker", "Run the poker table"));
  }

  const draw = state.draws?.[ev.id];
  const draft = state.drafts?.[ev.id];
  if (draft && !draw)
    return response("draw-pending", lifecycleAction("continue-draft", `Continue the ${ev.name} draft`));
  if (ev.teamCfg && !draw)
    return response("draw-pending", lifecycleAction("prepare-draw", `Choose players and draw ${ev.name}`));
  if (needsStageSetup(state, ev))
    return response("setup", lifecycleAction("prepare-stages", `Set up ${ev.stageCfg.kind}`));
  if (op.contest) {
    if (op.resultEntryAt)
      return response("result-entry", lifecycleAction("post-result", `Post the ${ev.name} result`, finish.blockers), finish.blockers);
    const contest = resolveCurrentContest(state, ev);
    if (contest) return response(contest.phase === "awaiting-result" ? "result-entry" : contest.phase,
      contest.nextAction, contest.phase === "in-progress" ? finish.blockers : []);
    return response("in-progress", lifecycleAction("enter-result", `Enter the ${ev.name} result`, finish.blockers), finish.blockers);
  }
  const competitionStarted = !!op.startedAt
    || bracketStarted(state.brackets?.[ev.id])
    || stagesStarted(state.stages?.[ev.id]);
  if (state.onDeck === ev.id && !competitionStarted)
    return response("betting-open", lifecycleAction("lock-betting", `Lock betting on ${ev.name}`));
  if (op.resultEntryAt)
    return response("result-entry",
      lifecycleAction("post-result", `Post the ${ev.name} result`, finish.blockers),
      finish.blockers);

  if (competitionStarted) {
    let action;
    if (resolveCurrentContest(state, ev)?.kind !== "ffa" && !finish.ok)
      action = lifecycleAction("record-contest-winner", "Record winner");
    else action = lifecycleAction("enter-result", `Enter the ${ev.name} result`);
    return response("in-progress", action, finish.blockers);
  }
  if (op.bettingLockedAt)
    return response("betting-locked", lifecycleAction("start-event", `Start ${ev.name}`));
  if (draw)
    return response("draw-revealed", lifecycleAction("open-betting", `Open betting on ${ev.name}`));
  return response("setup", lifecycleAction("open-betting", `Open betting on ${ev.name}`));
}
/* An event is in play once its competition has started and until its
   result posts: a locked market, a contest being played, or result entry. */
function eventInPlay(state, ev) {
  if (!ev || state.results?.[ev.id] || state.shelved?.[ev.id]) return false;
  if (ev.finale) return state.poker?.id === ev.id && !!state.poker.startedAt;
  const phase = resolveEventLifecycle(state, ev).phase;
  if (phase === "in-progress" || phase === "result-entry") return true;
  return phase === "betting-locked" && !!state.eventOps?.[ev.id]?.bettingLockedAt;
}
function resolveWeekendOperation(state, events = allEventsOf(state)) {
  const crown = {
    event:null,
    lifecycle:null,
    nextAction:state.frozen ? null : lifecycleAction("crown-champion", "Crown the champion"),
  };
  /* once the final counts are the standings, nothing else can be announced */
  if (stacksPosted(state)) return crown;
  const open = events.filter(ev => !state.results?.[ev.id] && !state.shelved?.[ev.id]);
  if (!open.length) return crown;

  const activity = ev => {
    const op = eventOpOf(state, ev.id);
    return Math.max(op.resultEntryAt || 0, op.startedAt || 0, op.bettingLockedAt || 0, op.bettingOpenedAt || 0);
  };
  /* Precedence: the dealt poker table, the one open market, anything being
     played, a running captains draft, then slate order. Preparing a later
     event (a draw, a draft) never outranks play. */
  let event = state.poker && !state.results?.[state.poker.id]
    ? open.find(ev => ev.id === state.poker.id) : null;
  if (!event) event = open.find(ev => ev.id === state.onDeck);
  if (!event) event = open.filter(ev => eventInPlay(state, ev))
    .sort((a, b) => activity(b) - activity(a))[0];
  if (!event) event = open.filter(ev => state.drafts?.[ev.id] && !state.draws?.[ev.id])
    .sort((a, b) => Number(state.drafts[b.id].ts || 0) - Number(state.drafts[a.id].ts || 0))[0];
  if (!event) event = open[0];
  const lifecycle = resolveEventLifecycle(state, event);
  return { event, lifecycle, nextAction:lifecycle.nextAction };
}

export {
  ROSTER_CONFIG, ROSTER_STATUSES, ALL_PLAYERS, ROSTER, rosterPlayers, rosterRecord, isActivePlayer, isAway, presentPlayers,
  AWARDS, PT, START, MAX_RISK, BUYIN_FLOOR, maxRisk, SPORTS, RATINGS, SESSIONS, BUILTIN_EVENTS, SLOT_META,
  OUTRIGHT_MULT, DUEL_STAKE, DUEL_GAMES, EMPTY_STATE, EDITION, LOGISTICS, SIZES, TEAM_NAMES, GAMES,
  RESET_PROGRESS_CONFIRMATION, RESET_PROGRESS_PRESERVED_KEYS,
  OVERFLOW_ROLES, OVERFLOW_ROLE_META, overflowRoleMeta, participationForEvent, eventCapacity, validateEventParticipants,
  teamFit, shapeLabel, suggestParticipants,
  normalizeOverflowRoles, defaultQaParticipants, coalescePendingReveals,
  AIRLINES, cleanLeg, cleanLogistics, legTime, legText,
  CHIP_GRAY, CHIP_COLORS, CHIP_SKINS, CHIP_MIN, POKER_CONFIG,
  allEventsOf, disp, shuffle, snakeTeam, draftTurn, teamLabel, stageFinalists, stageEntrantView,
  resolveWager, wagerMult, wagerBoardEvent, resolveDuel, pokerLive,
  DUEL_LAPSE_MS, DUEL_DAILY_LIMIT, duelAccepted, duelLapsed, duelLapsesAt, duelPhase, duelOpen,
  duelReserve, duelRoom, duelBetween, duelsSentToday, redactDuelsForViewer, stacksPosted, pokerLevels, pokerClock, pokerClockAnchor, pokerDenoms,
  pokerDistribution, pokerInventory,
  resultAwards, awardPlan, postCountRuling, postCountRulingApplies,
  computeStandings, atRisk, drawTeams, splitIntoGroups,
  enforceExposure, refundTotals, voidWagerRecords,
  contestStackOf, contestEntryLabel, applyContestCorrection, contestCorrectionAvailability, contestCorrections,
  correctionText, announcementTakeBack, lockerRoomAvailability, pokerSetupPreview,
  playerStrength, strengthMap, refineTeams,
  makeBracket, ROUND_NAMES, MAX_BRACKET, bracketRoundName, bracketMatchName, resolveSlot, qaBracketMatchWager, bracketChampion, bracketMatchOpen, bracketOrder,
  EVENT_PHASES, EVENT_PHASE_LABELS, eventOpOf, resultReadiness,
  resolveEventLifecycle, resolveWeekendOperation, resolveCurrentContest, contestBetEligibility, wagerMatchesContest, contestUndoAvailability,
  contestMult, wagerSide, contestSideOf,
  refundText, eventInPlay,
};
