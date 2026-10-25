/* Single source of truth for game logic. Imported by BOTH the React client
   and the Durable Object. The server is authoritative; the client uses these
   for display only. */
import { MASCOTS, defaultTeamNames } from "./teamNames.js";

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
/* Not coming is the commissioner's live roster edit for an invited player
   who will not make the weekend (state.out[id]). It takes them off the
   weekend entirely: no board row, no check-in spot, no draws, no counts.
   Their claim, profile, photo and answers stay untouched, so taking the
   mark back restores them exactly. Refused once they have a record. */
const isOut = (state, id) => !!state?.out?.[id];
/* the weekend's roster: the invited players minus anyone marked Not coming */
const rosterOf = state => state?.out && Object.keys(state.out).length
  ? ROSTER.filter(player => !isOut(state, player)) : ROSTER;
/* `state` is optional for old callers; with it, Not coming is honored */
const isActivePlayer = (id, state) => ROSTER.includes(id) && !isOut(state, id);
/* Away is a reversible commissioner mark for someone not at the venue right
   now. It only removes them from new draws, contest sides and poker seats;
   their chips, claims and profile are untouched. */
const isAway = (state, id) => !!state?.away?.[id];
/* Arrivals (Oct 4): Friday starts with people still on the road. Once the
   door opens (state.arrivals.open: the first check-in, or the commissioner),
   a roster player who has not checked in is on the way: out of new draws,
   contest sides, in-app games and poker seats, exactly like Away, until they
   scan the TV's check-in code (or the commissioner marks them). They can
   still bet and duel. Before the door opens nobody is on the way, so a
   quiet day strands no one. */
const arrivalsOpen = state => state?.arrivals?.open === true;
const hasArrived = (state, id) => !!state?.arrivals?.at?.[id];
const isOnTheWay = (state, id) => arrivalsOpen(state) && !hasArrived(state, id);
/* not here for anything drawn, seated or played right now */
const isAbsent = (state, id) => isAway(state, id) || isOnTheWay(state, id);
/* Whether check-in is open: the TV carries its code and a guest's scan is
   accepted. The door open, or Friday at the house with the door never
   touched. A weekend already under way with the door never opened counts
   everyone here (one late scan must not take the other twelve out of the
   draws), and a door the commissioner closed stays closed; either way the
   commissioner can still open it. */
const canCheckIn = (state, now = Date.now()) => arrivalsOpen(state)
  || (!state?.arrivals && !state?.live && now >= Date.parse(EDITION.arriveFrom));
/* The TV's check-in code (worker/tournament.js keeps it private and sends
   it only to TV sockets; the QR is `${origin}/?arrive=<code>`): eight
   characters from an alphabet with no 0/O or 1/I */
const ARRIVE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const isArriveCode = code => typeof code === "string" && /^[A-HJ-NP-Z2-9]{8}$/.test(code);
const presentPlayers = state => rosterOf(state).filter(player => !isAbsent(state, player));

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

/* The ladder (Oct 14, x1.5): 1st takes the event value, 2nd half, 3rd a
   quarter rounded to 100s. The keys are the legal event values. An event may
   carry its own `pays` table instead (5v5 pays winners only; Rage Cage pays
   1st and 2nd the same). */
const AWARDS = { 600:[600,300,200], 1200:[1200,600,300], 1800:[1800,900,500], 2400:[2400,1200,600] };
const AWARD_VALUES = Object.freeze(Object.keys(AWARDS).map(Number).sort((a, b) => a - b));
/* The ladder before Oct 14, as its stored event values and award amounts map
   onto this one: a custom event or value edit stored before then moves once,
   on hydration (migrateAwardLadder, marked by state.awardLadder). */
const AWARD_LADDER = 2;
const OLD_LADDER_VALUES = Object.freeze({ 400:600, 800:1200, 1200:1800, 1600:2400 });
const OLD_LADDER_AMOUNTS = Object.freeze({ 100:200, 200:300, 300:500, 400:600, 600:900, 800:1200, 1200:1800, 1600:2400 });
const ladderAmount = n => OLD_LADDER_AMOUNTS[n] ?? Math.round(Number(n) * 1.5 / PT) * PT;
function migrateAwardLadder(state) {
  if (!state || typeof state !== "object" || state.awardLadder === AWARD_LADDER) return state;
  const move = ev => {
    if (!ev || typeof ev !== "object") return;
    if (ev.value !== undefined && OLD_LADDER_VALUES[ev.value]) ev.value = OLD_LADDER_VALUES[ev.value];
    if (Array.isArray(ev.pays)) ev.pays = ev.pays.map(n => Number.isFinite(Number(n)) && n > 0 ? ladderAmount(n) : n);
  };
  for (const edit of Object.values(state.eventEdits || {})) move(edit);
  for (const ev of Array.isArray(state.customEvents) ? state.customEvents : []) move(ev);
  state.awardLadder = AWARD_LADDER;
  return state;
}
const awardTable = ev => Array.isArray(ev?.pays) && ev.pays.length === 3 ? ev.pays : AWARDS[ev?.value] || [0, 0, 0];

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
  { id:"fri", label:"Friday Night",       tag:"600 CHIPS" },
  { id:"sam", label:"Saturday Morning",   tag:"1200 CHIPS" },
  { id:"sap", label:"Saturday Afternoon", tag:"1800 CHIPS" },
  { id:"san", label:"Saturday Night",     tag:"2400 CHIPS" },
  { id:"fin", label:"The Finale",         tag:"POKER" },
];

/* events reference a GAMES entry by `game` for the how-to; `variant` picks the
   tab inside a multi-variant game like basketball */
const RAW_BUILTIN_EVENTS = [
  /* ── Friday night · 600 ── */
  { id:"putt", n:1, session:"fri", value:600, name:"Long Putt", kind:"solo", sport:"golf", game:"putting",
    desc:"Three attempts from one spot. Closest wins. A sunk putt beats everything. Ties: sudden death." },
  { id:"die", n:2, session:"fri", value:600, name:"Beer Die Doubles", kind:"pairs", sport:"die", game:"die",
    teamCfg:{ teams:6, size:2, bracket:6 },
    desc:"Single elimination doubles. Toss the die over the line, they catch off the bounce. Sinking it in a cup wins the game." },
  { id:"where", n:3, session:"fri", value:600, name:"Where and When", kind:"solo", game:"where",
    desc:"Photos from Brandon's past. Pin where each was taken and guess the date and hour. Highest total wins." },
  /* everyone sings the song they picked; the room votes each one, Build
     Battle's Super Ass to Legendary (shared/karaoke.js, docs/KARAOKE.md) */
  { id:"karaoke", n:4, session:"fri", value:600, name:"Karaoke", kind:"solo", game:"karaoke",
    desc:"Sing the song you picked while the room votes, Super Ass to Legendary. Best average wins." },
  /* ── Saturday morning · 1200 ── */
  /* everyone plays: captains draft two sides of seven and six. Winners only. */
  { id:"bball5", n:5, session:"sam", value:1200, name:"5v5 Full Court", kind:"team", sport:"bball", game:"basketball", variant:"5v5",
    teamCfg:{ teams:2, size:6 }, pays:[1200, 0, 0],
    participation:{ type:"all", allowSitOut:true, overflowRoles:[] },
    desc:"Captains draft two sides, seven and six. Full court, twos and threes on the clock. Ahead at the horn wins." },
  { id:"pickleball", n:6, session:"sam", value:1200, name:"Pickleball Doubles", kind:"pairs", sport:"pickleball", game:"pickleball",
    teamCfg:{ teams:6, size:2, bracket:6 },
    desc:"Single elimination doubles. No volleys in the kitchen. Games to 11, win by 2." },
  /* a bracket of everyone present: entrants are teams of one, seeded by the
     draw, and the top seeds take the byes */
  { id:"bball1", n:7, session:"sam", value:1200, name:"1v1 Basketball", kind:"solo", sport:"bball", game:"basketball", variant:"1v1",
    teamCfg:{ teams:13, size:1, bracket:13 },
    desc:"Single elimination, everyone in. Ones to 5, make it take it, win by 1." },
  /* ── Saturday afternoon · 1800 ── */
  { id:"volley", n:8, session:"sap", value:1800, name:"Sand Volleyball", kind:"team", sport:"volley", game:"volleyball",
    teamCfg:{ teams:4, size:3, bracket:4 },
    desc:"Four teams of three, single elimination. Best of three sets to 15, cap 17. Rotate servers." },
  { id:"8ball", n:9, session:"sap", value:1800, name:"8-Ball Doubles", kind:"pairs", sport:"pool", game:"8ball",
    teamCfg:{ teams:6, size:2, bracket:6 },
    desc:"Single elimination. One rack per matchup, alternating shots. Ball-in-hand on scratches." },
  { id:"pong", n:10, session:"sap", value:1800, name:"Beer Pong Doubles", kind:"pairs", sport:"pong", game:"pong",
    teamCfg:{ teams:6, size:2, bracket:6 },
    desc:"Single elimination. Six cups, one re-rack. Bounce counts two, can be swatted. Redemption in semis and final." },
  /* ── Saturday night · 2400 ── */
  { id:"trivia", n:11, session:"san", value:2400, name:"Trivia", kind:"solo", game:"trivia",
    desc:"Everyone plays on their phone. Most points wins." },
  { id:"ragecage", n:12, session:"san", value:2400, name:"Rage Cage", kind:"solo", sport:"cage", game:"ragecage",
    pays:[2400, 2400, 600],
    desc:"Everyone circles the cups, two balls in play. Get stacked on and you are out. The last two go head to head." },
  /* Float (Oct 25, float/PROTOCOL.md): Beerio Kart's slot, played on the
     phones and the TV. Beerio Kart stays a built-in, shelved by default
     while it has nothing on it (shared/float.js floatSlate), one Restore
     away if Float cannot run */
  { id:"float", n:13, session:"san", value:2400, name:"Float", kind:"solo", game:"float",
    desc:"Everyone paddles a floatie down the river on their phone. The field is cut every round until three race the final. Finish your drink before you leave the water." },
  { id:"beerio", n:14, session:"san", value:2400, name:"Beerio Kart", kind:"solo", sport:"kart", game:"beerio",
    stageCfg:{ kind:"heats", nGroups:4, advance:1 },
    desc:"Heats of four, then a final. Crack a beer at the line, pull over to drink, finish it before you cross. Highest total wins." },
  /* ── The Finale · poker. No value: the result carries chip stacks that
     BECOME the standings, it never pays awards. ── */
  { id:"poker", n:15, session:"fin", name:"Championship Poker", kind:"solo", finale:true, game:"poker",
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
    win:"Closest of three attempts wins. Ties go to sudden death." } },
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
  beerio: { name:"Beerio Kart", howto:{ players:"Heats of four", gear:["Switch","Four controllers","A beer each"],
    objective:"Win the race, but finish your beer to count.",
    steps:["Open a beer at the start line.","Pull over to drink, no sipping while you steer.","Finish the beer before the finish line, or wait there until it is gone."],
    win:"Best finishes advance to the final. Highest total wins." } },
  ragecage: { name:"Rage Cage", howto:{ players:"Everyone, last standing", gear:["A cup per player","Center cup","Two balls"],
    objective:"Sink your ball and pass it on before you get stacked.",
    steps:["One cup each in a circle, the center cup filled by everyone. Two balls start on opposite sides.",
      "Bounce into your cup. Make it on the first try and pass to anyone; otherwise pass left.",
      "Make yours while the player to your left is still shooting and stack on them. Stacked players drink and are out.",
      "The last two go head to head. The loser drinks the center cup."],
    win:"Last one standing takes 1st, the final loser 2nd, the third-to-last out 3rd. 1st and 2nd pay the same." } },
  where: { name:"Where and When", howto:{ players:"Solo", gear:["Your phone", "The TV"],
    objective:"Place each photo: where it was taken, and when.",
    steps:["A photo from Brandon's past goes up on the TV and your phone.",
      "Drop a pin where it was taken and pick the date and hour. You can change it until the reveal.",
      "60 seconds a photo.",
      "Each photo scores up to 5,000 for where and 5,000 for when. 10 miles off is about 4,700; a month off about 3,900."],
    win:"Highest total wins. A tie goes to more points for where, then to the faster guesses." } },
  trivia: { name:"Trivia", howto:{ players:"Solo", gear:["Your phone", "The TV"],
    objective:"Most points after every round.",
    steps:["A question goes up on the TV and every phone.",
      "Pick your answer. You can change it until you lock it in.",
      "A right answer scores 500, plus up to 500 the sooner you lock.",
      "Closest number: the nearest guess scores 1,000, the next 500. Exact scores 250 more."],
    win:"Most points wins. A tie goes to whoever locked their scoring answers faster." } },
  karaoke: { name:"Karaoke", howto:{ players:"Solo", gear:["Your phone", "The TV"],
    objective:"The room's favorite performance of the night.",
    steps:["Pick a karaoke song in your profile. When Karaoke starts you have two minutes to keep it or change it.",
      "When you're up, your song plays on the TV. Sing it.",
      "Everyone else votes, Super Ass to Legendary. A vote can change until it closes.",
      "With six or more votes, your highest and lowest are dropped."],
    win:"Highest average wins. A tie goes to more Legendary votes, then Amazing, and down." } },
  float: { name:"Float", howto:{ players:"Everyone", gear:["Your phone", "The TV", "A drink each"],
    objective:"Win the final.",
    steps:["Pick your critter and floatie in your profile's Locker.",
      "Hold your phone sideways and paddle with both thumbs. One paddle alone turns you.",
      "Each round, finish your drink before you leave the water. Arrive without it and you wait at the takeout.",
      "Each round is one leg of the river. The slowest are cut until three race the final.",
      "Riders who are cut throw water balloons at the riders still racing."],
    win:"First across in the final wins. 2nd and 3rd are the final's next two." } },
  poker: { name:"Poker", howto:{ players:"Everyone, one table", gear:["Cards","Chips","The clock"],
    objective:"Finish with the biggest stack.",
    steps:["Whatever you have Saturday night is the stack you start the finale with.","No-limit hold'em. Blinds rise on the clock.","Bust and you are out.","When the last level ends, count your stack."],
    win:"Chip leader takes the championship. Final chip counts are the final standings, and elimination order ranks the busts." } },
};

const SLOT_META = [
  { label:"1st", team:"Winners",    color:"var(--accent)" },
  { label:"2nd", team:"Runners-up", color:"var(--silver)" },
  { label:"3rd", team:"3rd place",  color:"var(--bronze)" },
];

const OUTRIGHT_MULT = 2; // a wide field's winner pays 2:1; everything else pays even
/* A ticket keeps the payout it was placed at. Outright tickets written before
   two-sided events paid even carry no mult and stay 2:1; every other ticket
   written before underdog odds carries none and stays 1:1. */
const wagerMult = w => Number.isInteger(w?.mult) && w.mult >= 1 ? w.mult
  : w?.kind === "outright" ? OUTRIGHT_MULT : 1;

/* ── comebacks (v3.1) ──
   Underdog odds: a two-sided contest whose sides sit UNDERDOG_GAP apart
   (the gap in average chips per player, times the smaller side's size)
   pays the lower side's
   winning tickets UNDERDOG_MULT, fixed when its betting opens.
   Byes to the bottom: a bracket's byes go to the lowest-ranked teams. */
const UNDERDOG_GAP = 10 * PT;
const UNDERDOG_MULT = 2;

/* ── the pool (Oct 13) ──
   Every contest opened since is a pool: its tickets carry `pool:1` and the
   bank seeds each side when the market opens (eventOps[ev].pools[contestId],
   POOL_SEED a side, split by the sides' average chips so the stronger side
   opens shorter). A side's price is the whole pool over what rides on it,
   to a tenth, never under POOL_MIN or over POOL_CAP. Betting closes at Lock
   and start, so that is the price a ticket settles at; a void moves it like
   any record. A winning ticket takes stake x (price - 1), to the nearest
   chip and never less than one; a losing one loses its stake. Derived from
   the tickets every time, never stored. */
const POOL_SEED = PT;
const POOL_CAP = 10;
const POOL_MIN = 1.1;
/* a decided contest whose winner was priced this long is an upset */
const UPSET_PRICE = 3;
const poolPrice = (total, onSide) => !(onSide > 0) ? POOL_CAP
  : Math.min(POOL_CAP, Math.max(POOL_MIN, Math.floor(total * 10 / onSide + 1e-9) / 10));
const poolNet = (stake, price) => Math.max(PT, Math.round(stake * (price - 1) / PT + 1e-9) * PT);
const sideId = key => key === null || key === undefined ? null : String(key);
/* the bank's opening stake per side, from the standings at open */
function poolSeed(state, contest, rows = computeStandings(state)) {
  const sides = contest?.sides || [];
  if (!sides.length) return {};
  const pts = Object.fromEntries(rows.map(row => [row.player, row.pts]));
  const weight = sides.map(side => {
    const counted = (side.players || []).filter(p => pts[p] !== undefined);
    const avg = counted.length ? counted.reduce((sum, p) => sum + pts[p], 0) / counted.length : START;
    return Math.max(PT, avg);
  });
  const sum = weight.reduce((a, b) => a + b, 0);
  return Object.fromEntries(sides.map((side, i) =>
    [sideId(side.key), Math.round(POOL_SEED * sides.length * weight[i] / sum * 100) / 100]));
}
/* one contest's pool: the seed, every live pool ticket, each side's price.
   `wagers` narrows the tickets read (poolBook hands each pool its own). */
function poolOf(state, eventId, contestId, wagers = state.wagers || []) {
  const seed = state.eventOps?.[eventId]?.pools?.[contestId]?.seed || {};
  const sides = {};
  const side = key => (sides[key] ||= { seed:Number(seed[key]) || 0, stake:0, bettors:0 });
  Object.keys(seed).forEach(side);
  for (const w of wagers) {
    if (!w.pool || w.contestId !== contestId || w.eventId !== eventId || w.status === "void") continue;
    const key = sideId(wagerSide(state, w));
    if (key === null) continue;
    side(key).stake += Number(w.stake) || 0;
    side(key).bettors += 1;
  }
  const total = Object.values(sides).reduce((sum, s) => sum + s.seed + s.stake, 0);
  for (const s of Object.values(sides)) s.price = poolPrice(total, s.seed + s.stake);
  return { contestId, eventId, total, sides,
    price:key => sides[sideId(key)]?.price ?? poolPrice(total, 0) };
}
/* every pool on the board at once, so standings price each pool one time:
   one pass sorts the tickets by contest (in board order), then each pool
   reads only its own, the same tickets in the same order as poolOf */
function poolBook(state) {
  const byContest = new Map();
  for (const w of state.wagers || []) {
    if (!w.pool || !w.contestId) continue;
    const group = byContest.get(w.contestId);
    if (group) group.wagers.push(w);
    else byContest.set(w.contestId, { eventId:w.eventId, wagers:[w] });
  }
  const book = new Map();
  for (const [contestId, { eventId, wagers }] of byContest) book.set(contestId, poolOf(state, eventId, contestId, wagers));
  return book;
}
function winDelta(state, w, book) {
  if (!w.pool) return wagerMult(w) * w.stake;
  const pool = book?.get(w.contestId) || poolOf(state, w.eventId, w.contestId);
  return poolNet(w.stake, pool.price(wagerSide(state, w)));
}

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
   is the unique claim. The ink on each color is computed for contrast
   (src/features/identity/chipInk.js). */
const CHIP_GRAY = "#6B6558";
const CHIP_COLORS = [
  { hex:"#C05B33" }, { hex:"#D97742" }, { hex:"#E39A3B" }, { hex:"#D89C2F" },
  { hex:"#C9B25A" }, { hex:"#A8A03F" }, { hex:"#77804C" }, { hex:"#4E6E39" },
  { hex:"#6E9450" }, { hex:"#3F7D5C" }, { hex:"#557B72" }, { hex:"#2F7E83" },
  { hex:"#4F93A3" }, { hex:"#3B6E9C" }, { hex:"#5E7291" }, { hex:"#6D6FA8" },
  { hex:"#7C5CA6" }, { hex:"#8A4F62" }, { hex:"#A6527C" }, { hex:"#B23B5E" },
  { hex:"#B23B2E" }, { hex:"#8E3B2F" }, { hex:"#7A5C43" }, { hex:"#A9663F" },
  { hex:"#B37A4A" }, { hex:"#8C6A54" }, { hex:"#6F6546" }, { hex:"#4E4A3C" },
  { hex:"#9AA1A8" }, { hex:"#B9AF9B" },
  { hex:"#D1C0A0" }, { hex:"#E3D7BD" },
];
const CHIP_SKINS = ["ticks", "plain", "dash", "quad", "dots", "ring",
  "saw", "flame", "star", "bolt", "wave", "crown"];

/* this edition's hard dates, in one place: every surface reads these instead
   of spelling the weekend out again and getting it wrong */
const EDITION = { name:"Scottsdale", year:2026, label:"Scottsdale · 2026",
  long:"October 30 to November 1, 2026", short:"Oct 30 to Nov 1",
  /* guests may check themselves in from midnight Friday at the house
     (Arizona keeps MST all year, UTC-7), or once the commissioner opens the door */
  arriveFrom:"2026-10-30T07:00:00Z" };

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

const EMPTY_STATE = { v:9, awardLadder:AWARD_LADDER, live:false, results:{}, wagers:[], wagerOps:{}, adjustments:[], seeds:{}, draws:{}, brackets:{},
  stages:{}, drafts:{}, duels:[], poker:null, profiles:{}, customEvents:[], shelved:{}, away:{}, out:{}, arrivals:null, onDeck:null, frozen:false,
  onboardEpoch:0, eventEdits:{}, eventOrder:[], eventOps:{}, showControl:{ active:null, history:[] },
  logistics:{ ...LOGISTICS }, prompts:{ ballots:[], responses:{} }, jerseysLocked:false,
  geoRounds:[], geo:null, triviaRounds:[], triviaFormat:"rounds", trivia:null, karaoke:null,
  /* Float (shared/float.js): the Cup Lock and start opened, and the mark
     that the slate's default (Beerio Kart standing by) is applied */
  float:null, floatSlate:0,
  /* the TV's gags (src/features/gags): the commissioner's switch, and the
     QA console's test */
  gagsOff:false, gagTest:null,
  /* QA's simulated room (shared/qaSim.js): { on, me, includeMe, seed, at } */
  qaSim:null, updatedAt:0 };
const RESET_PROGRESS_CONFIRMATION = "RESET_GAME_PROGRESS";
const RESET_PROGRESS_PRESERVED_KEYS = Object.freeze([
  "profiles",
  "seeds",
  "logistics",
  "onboardEpoch",
  "customEvents",
  "eventEdits",
  "eventOrder",
  /* D6: ballots are guest answers, not game progress */
  "prompts",
  /* the jersey order is placed once, whatever the games do */
  "jerseysLocked",
  /* who is not coming is the roster, not game progress */
  "out",
  /* Where and When's authored photos and answers are configuration; the
     game played on them (state.geo) is progress */
  "geoRounds",
  /* Trivia's set list (bank picks and the commissioner's own questions) is
     configuration; the game played on it (state.trivia) is progress */
  "triviaRounds",
  /* and which format it plays (Rounds or the Board) */
  "triviaFormat",
  /* the TV's Gags switch is a setting; a QA test gag (gagTest) is progress */
  "gagsOff",
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
  /* everyone plays (the full court): the sides split whoever is present,
     one apart at most ("7 v 6") */
  if (participationForEvent(ev).type === "all") {
    if (count < cfg.teams) return null;
    const split = Array.from({ length:cfg.teams }, (_, i) => Math.floor(count / cfg.teams) + (i < count % cfg.teams ? 1 : 0));
    return { teams:cfg.teams, size:split[0], bracket:null, reduced:count < cfg.teams * cfg.size, split };
  }
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
const shapeLabel = fit => !fit ? "" : fit.split && new Set(fit.split).size > 1 ? fit.split.join(" v ")
  : fit.size === 1 ? `${fit.teams} players` : `${fit.teams} teams of ${fit.size}`;
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

  /* The shape fits whoever is PLAYING (Oct 4, Brandon): the commissioner
     may put people on crew or sit them out, down to the shape ten players
     make (MIN_PLAYING); a smaller room plays everyone it can seat. */
  const floor = Math.min(MIN_PLAYING, activeUnique.length);
  const strict = policy.type === "strict-teams" && !!ev?.teamCfg;
  const fit = strict ? teamFit(ev, players.length) : null;
  const floorFit = strict ? teamFit(ev, floor) : null;
  const minPlaying = strict ? (floorFit ? floorFit.teams * floorFit.size : floor) : floor;
  const capacity = strict ? (fit ? fit.teams * fit.size : ev.teamCfg.teams * ev.teamCfg.size) : eventCapacity(ev);
  if (policy.type === "all") {
    if (players.length < floor)
      return { ok:false, code:"all-required", error:`${floor} need to play`,
        selectedCount:players.length, activeCount:activeUnique.length, required:floor };
  } else if (strict) {
    if (players.length < minPlaying)
      return { ok:false, code:"roster-short", error:`${minPlaying} need to play`,
        selectedCount:players.length, activeCount:activeUnique.length, required:minPlaying };
    if (!fit)
      return { ok:false, code:"roster-short", error:`This event needs ${2 * ev.teamCfg.size} players`,
        selectedCount:players.length, activeCount:activeUnique.length, required:2 * ev.teamCfg.size };
    if (players.length !== capacity)
      return { ok:false, code:"wrong-count", error:`${players.length} can't make even teams of ${fit.size}`,
        selectedCount:players.length, activeCount:activeUnique.length, required:capacity,
        overflow:players.length - capacity };
  } else if (policy.type === "fixed") {
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
/* Sitting out by choice (tired, a drink in hand): the commissioner takes
   people out of one event's pool in the crew check. The event's shape fits
   whoever is left, crew is still the overflow that shape cannot seat (and
   still earns the 3rd-place award), and a sit-out earns nothing. At least
   MIN_PLAYING stay in; a room already that small sits nobody out. */
const MIN_PLAYING = 10;
function eventPool(state, sitOut = []) {
  const present = presentPlayers(state);
  const out = [...new Set(Array.isArray(sitOut) ? sitOut : [])].filter(player => present.includes(player));
  if (!out.length) return { ok:true, pool:present, out:[] };
  if (present.length - out.length < MIN_PLAYING)
    return { ok:false, error:`${MIN_PLAYING} need to play`, pool:present, out:[] };
  return { ok:true, pool:present.filter(player => !out.includes(player)), out };
}
/* The commissioner's one-tap default: everyone present plays, and the
   overflow goes to whoever has sat out least so crew duty rotates. Ties go
   to whoever sat out longest ago, then the end of the roster. `sitOut`
   takes people out of the pool first (eventPool). */
/* who should take crew next among `players`: whoever has sat out least,
   ties to whoever sat out longest ago, then the end of the roster */
function crewRotation(state, ev, players) {
  const counts = {}, last = {};
  const tally = (roles, at) => (Array.isArray(roles) ? roles : []).forEach(item => {
    if (!item?.player) return;
    counts[item.player] = (counts[item.player] || 0) + 1;
    last[item.player] = Math.max(last[item.player] || 0, Number(at) || 0);
  });
  Object.entries(state.draws || {}).forEach(([id, draw]) => { if (id !== ev?.id) tally(draw?.roles, draw?.ts); });
  Object.entries(state.stages || {}).forEach(([id, stage]) => { if (id !== ev?.id) tally(stage?.roles, stage?.ts); });
  return [...players].sort((a, b) => (counts[a] || 0) - (counts[b] || 0)
    || (last[a] || 0) - (last[b] || 0) || ROSTER.indexOf(b) - ROSTER.indexOf(a));
}
function suggestParticipants(state, ev, { sitOut = [] } = {}) {
  if (!ev) return null;
  const out = Array.isArray(sitOut) ? sitOut : [];
  const present = presentPlayers(state).filter(player => !out.includes(player));
  if (!ev.teamCfg) return ev.stageCfg?.kind === "heats" ? { players:present, roles:[], fit:null } : null;
  const fit = teamFit(ev, present.length);
  if (!fit) return null;
  /* everyone plays (the 7 v 6 full court): no crew */
  if (participationForEvent(ev).type === "all") return { players:present, roles:[], fit };
  const crew = crewRotation(state, ev, present).slice(0, present.length - fit.teams * fit.size);
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

/* the desert mascots: once every team's name, now one flavor of the
   suggestions (shared/teamNames.js). A draw still shuffles them, unused, so a
   seeded rehearsal's random stream (worker/qa.js) runs as it always has. */
const TEAM_NAMES = MASCOTS.map(mascot => `The ${mascot}`);

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
function resolveWager(state, w, events, book = null) {
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
    return { status: won ? "won" : "lost", delta: won ? winDelta(state, w, book) : -w.stake };
  }
  if (w.kind === "match") {
    const draw = state.draws[w.eventId];
    if (!draw || draw.id !== w.drawId) return { status:"void", delta:0 };
    const br = state.brackets[w.eventId];
    const match = br?.rounds?.[w.match[0]]?.[w.match[1]];
    if (!match) return { status:"void", delta:0 };
    if (match.winner === null || match.winner === undefined) return { status:"pending", delta:0 };
    const won = match.winner === w.teamIdx;
    return { status: won ? "won" : "lost", delta: won ? winDelta(state, w, book) : -w.stake };
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
      return { status: won ? "won" : "lost", delta: won ? winDelta(state, w, book) : -w.stake };
    }
    const g = st.groups[w.group];
    if (!g) return { status:"void", delta:0 };
    if (w.kind === "heat") {
      if (g.winner === null || g.winner === undefined) return { status:"pending", delta:0 };
      const won = g.winner === w.pickKey;
      return { status:won ? "won" : "lost", delta:won ? winDelta(state, w, book) : -w.stake };
    }
    if ((g.through || []).length < st.advance) return { status:"pending", delta:0 };
    const won = g.through.includes(w.pickKey);
    return { status: won ? "won" : "lost", delta: won ? winDelta(state, w, book) : -w.stake };
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
   conversion: 2,200 points is 2,200 in front of you. The chips are
   Brandon's own case (a Slowplay set, Oct 14): its 1s stay in the case and
   the 5s are the smallest chip in play, so counts move in 5s. */
const CHIP_MIN = 5;        // smallest chip in play; counts move in 5s
const CHIP_SET = Object.freeze({ 1:100, 5:150, 25:100, 100:100, 500:50, 1000:50 });
/* kept back in the bank for change and color-ups, never dealt */
const CHIP_RESERVE = Object.freeze({ 1:100, 5:10, 25:10, 100:10, 500:4, 1000:3 });
const POKER_CONFIG = Object.freeze({
  minimumStack:BUYIN_FLOOR,
  stackQuantum:PT,
  countQuantum:CHIP_MIN,
  maxStack:null,
  rounding:"exact",
  denominations:Object.freeze([1000, 500, 100, 25, 5]),
  chipSet:CHIP_SET,
  reserve:CHIP_RESERVE,
  /* the working layer leaves this many of a chip per seat in the case for
     the bulk to fall back on */
  layerHold:Object.freeze({ 100:4, 500:1 }),
  /* the exchange pass trades small chips onto stacks of this much and up */
  exchangeFrom:2000,
});
/* blind schedule (Oct 14): ten 12-minute levels, two hours. The 5s race
   off after level 2 and the 25s after level 5; the level that follows
   carries the note (raceOffText). */
const POKER_LEVELS = [
  { sb:10, bb:20, mins:12 }, { sb:25, bb:50, mins:12 }, { sb:50, bb:100, mins:12, raceOff:5 },
  { sb:100, bb:200, mins:12 }, { sb:150, bb:300, mins:12 }, { sb:200, bb:400, mins:12, raceOff:25 },
  { sb:300, bb:600, mins:12 }, { sb:500, bb:1000, mins:12 }, { sb:800, bb:1600, mins:12 },
  { sb:1000, bb:2000, mins:12 },
];
const pokerLevels = () => POKER_LEVELS.map(l => ({ ...l }));
const raceOffText = level => level?.raceOff ? `Race off the ${level.raceOff}s` : null;
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
/* the seats a deal is asked for, as [player, stack]: { player:stack },
   [{ player, stack }], or bare stacks (seat-1, seat-2, ...) */
const dealEntries = stacks => Array.isArray(stacks)
  ? stacks.map((item, index) => typeof item === "number" ? [`seat-${index + 1}`, item] : [item?.player, item?.stack])
  : Object.entries(stacks || {});
/* One deal from the case with `reserve` held back in the bank (Oct 14).
   Pure in the seats' stacks (ties by player id), so every screen derives
   the same chips. Every seat's odd tail first (a stack in 5s takes its tail
   in 5s and 25s), then the same working layer for every seat, smallest
   chip first (5s, 25s, 100s, 500s; a short stack gets as much as it holds,
   each step closing on a round value), the bulk in 1000s (falling back to
   smaller chips only if the 1000s run out), then an exchange pass: the
   small chips still in the case replace a bigger chip on the biggest
   stacks, round the table, so the set is used evenly whatever the board
   comes to. { ok, seats:{ player:[{ v, n }] }, inventory, left:{ v:n } };
   ok is false when what the case puts out cannot cover the stacks. */
function caseDeal(stacks, set, reserve) {
  const denoms = POKER_CONFIG.denominations;
  const small = [...denoms].sort((a, b) => a - b);
  const up = d => small[small.indexOf(d) + 1] || d;
  const left = Object.fromEntries(denoms.map(d =>
    [d, Math.max(0, (Number(set?.[d]) || 0) - (Number(reserve?.[d]) || 0))]));
  const seats = dealEntries(stacks).map(([player, stack]) => ({ player:String(player), stack:Number(stack), rest:Number(stack), chips:{} }))
    .sort((a, b) => a.stack - b.stack || (a.player < b.player ? -1 : a.player > b.player ? 1 : 0));
  const result = ok => ({
    ok,
    seats:Object.fromEntries(seats.map(seat => [seat.player,
      denoms.filter(d => seat.chips[d] > 0).map(v => ({ v, n:seat.chips[v] }))])),
    inventory:denoms.map(v => ({ v, n:seats.reduce((sum, seat) => sum + (seat.chips[v] || 0), 0) }))
      .filter(item => item.n > 0),
    left:{ ...left },
  });
  if (seats.some(seat => !Number.isInteger(seat.stack) || seat.stack < 0 || seat.stack % CHIP_MIN !== 0))
    return { ...result(false), seats:{}, inventory:[] };
  const n = seats.length;
  if (!n) return result(true);
  const give = (seat, d, k) => {
    if (k > 0) { seat.chips[d] = (seat.chips[d] || 0) + k; seat.rest -= d * k; left[d] -= k; }
  };
  const fits = (seat, d, k) => Math.max(0, Math.min(k, left[d], Math.floor(seat.rest / d)));
  /* the largest count <= k that leaves the seat's rest a multiple of mod */
  const aligned = (seat, d, k, mod) => { while (k > 0 && (seat.rest - d * k) % mod) k--; return k; };
  const tails = small.filter(d => d < PT);
  const layer = small.filter(d => d < denoms[0]);
  for (const seat of seats)
    for (const d of tails) give(seat, d, fits(seat, d, Math.floor((seat.rest % up(d)) / d)));
  const hold = POKER_CONFIG.layerHold;
  const target = Object.fromEntries(layer.map(d => [d, Math.max(0, Math.floor((left[d] - (hold[d] || 0) * n) / n))]));
  for (const seat of seats) {
    for (const d of layer)
      give(seat, d, d < PT ? aligned(seat, d, fits(seat, d, target[d]), up(d)) : fits(seat, d, target[d]));
    for (const d of denoms) give(seat, d, fits(seat, d, Infinity));
  }
  /* biggest first: 1000s for 500s, 500s for 100s, 100s for 25s, 25s for 5s */
  for (const big of denoms) {
    const smaller = small[small.indexOf(big) - 1];
    if (!smaller) continue;
    const k = big / smaller;
    for (let moved = true; moved;) {
      moved = false;
      for (const seat of [...seats].reverse()) {
        if (left[smaller] < k || !(seat.chips[big] > 0) || seat.stack < POKER_CONFIG.exchangeFrom) continue;
        seat.chips[big] -= 1; seat.rest += big; left[big] += 1;
        give(seat, smaller, k);
        moved = true;
      }
    }
  }
  return result(seats.every(seat => seat.rest === 0) && denoms.every(d => left[d] >= 0));
}
/* the chips a deal takes past the case less the reserve: the bank's, lent */
const lentChips = (inventory, set, reserve) => inventory
  .map(({ v, n }) => ({ v, n:n - Math.max(0, (Number(set?.[v]) || 0) - (Number(reserve?.[v]) || 0)) }))
  .filter(item => item.n > 0);
/* The table's deal, which pokerSetup stores. A legal board is never
   refused. The bank keeps its reserve whenever the rest of the case covers
   the stacks, so every board that dealt before deals exactly as it did.
   When it cannot (Oct 23), the bank lends its reserve one chip at a time,
   its 1000s first, then the 500s, 100s, 25s and 5s, and the first deal that
   covers the stacks is the table's: the 5s, 25s and 100s that make change
   and pay the race-offs stay in the bank unless nothing else covers
   (`lent`, the reserve's chips in the deal). When the whole case cannot
   cover the board, it deals everything the case holds, smaller stacks
   first, and `short` is what each seat still needs, made up by hand: the
   biggest stacks, together exactly what the board holds past the case.
   { ok, seats, inventory, left, lent?, short? }; ok is false only for a
   stack the chips cannot make (below 0 or off the 5s), which deals nothing. */
function pokerDeal(stacks, { set = POKER_CONFIG.chipSet, reserve = POKER_CONFIG.reserve } = {}) {
  const deal = caseDeal(stacks, set, reserve);
  if (deal.ok || !Object.keys(deal.seats).length) return deal;
  const denoms = POKER_CONFIG.denominations;
  const entries = dealEntries(stacks);
  const total = entries.reduce((sum, [, stack]) => sum + Number(stack), 0);
  const count = (from, d) => Math.max(0, Number(from?.[d]) || 0);
  const held = Object.fromEntries(denoms.map(d => [d, Math.min(count(set, d), count(reserve, d))]));
  let room = denoms.reduce((sum, d) => sum + d * (count(set, d) - held[d]), 0);
  const withLent = dealt => {
    const lent = lentChips(dealt.inventory, set, reserve);
    return lent.length ? { ...dealt, lent } : dealt;
  };
  for (const d of denoms) {
    while (held[d] > 0) {
      held[d] -= 1;
      room += d;
      /* a case worth less than the board cannot cover it: lend on */
      if (room < total) continue;
      const covered = caseDeal(stacks, set, held);
      if (covered.ok) return withLent(covered);
    }
  }
  const whole = caseDeal(stacks, set, held);
  const stackOf = Object.fromEntries(entries.map(([player, stack]) => [String(player), Number(stack)]));
  const short = Object.fromEntries(Object.entries(whole.seats)
    .map(([player, chips]) => [player, stackOf[player] - chips.reduce((sum, chip) => sum + chip.v * chip.n, 0)])
    .filter(([, need]) => need > 0));
  return { ...withLent(whole), ok:true, short };
}
/* a table's deal: the one pokerSetup stored, else the same deal derived
   from its starting stacks (a table set before the deal was stored). The
   bank's lent chips and the seats' shorts ride along when there are any. */
function pokerTableDeal(poker) {
  const deal = poker?.deal?.seats ? poker.deal : pokerDeal(poker?.startingStacks || {});
  return { seats:deal.seats, inventory:deal.inventory || [],
    ...(Array.isArray(deal.lent) && deal.lent.length ? { lent:deal.lent } : {}),
    ...(deal.short && typeof deal.short === "object" && Object.keys(deal.short).length ? { short:deal.short } : {}) };
}
const pokerSeatChips = (poker, player) => pokerTableDeal(poker).seats[player] || [];
/* what the case could not deal a seat, made up by hand at the table */
const pokerSeatShort = (poker, player) => Math.max(0, Number(pokerTableDeal(poker).short?.[player]) || 0);

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
    return { player, before:legalBefore, stack, grant:stack - legalBefore };
  });
  /* the case never refuses a legal board: past it the bank lends, and past
     the whole case each seat's short is made up by hand */
  const deal = errors.length ? null : pokerDeal(rows.map(row => ({ player:row.player, stack:row.stack })));
  const seats = deal?.seats || {};
  const lent = deal?.lent?.length ? { lent:deal.lent } : {};
  const short = deal?.short || {};
  return {
    ok:errors.length === 0,
    errors,
    rows:rows.map(row => ({ ...row, denominations:seats[row.player] || [],
      ...(short[row.player] > 0 ? { short:short[row.player] } : {}) })),
    total:rows.reduce((sum, row) => sum + row.stack, 0),
    minimumCount:rows.filter(row => row.grant > 0).length,
    inventory:deal?.inventory || [],
    ...lent,
    deal:{ seats, inventory:deal?.inventory || [], ...lent, ...(deal?.short ? { short:deal.short } : {}) },
  };
}
/* the tray: how many of each chip the whole table is dealt, from a table
   (its stored deal) or from the stacks themselves */
function pokerInventory(source) {
  if (source && typeof source === "object" && !Array.isArray(source) && ("startingStacks" in source || "deal" in source))
    return pokerTableDeal(source).inventory;
  return pokerDeal(source).inventory;
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
/* The live showdown (Oct 4). Once a duel is accepted both duelists face off
   on their phones and tap Ready (duelReady). When the second one is ready
   the server stamps `armedAt` and a random `fireAt`, DUEL_FIRE_MIN_MS plus
   up to DUEL_FIRE_SPAN_MS later; every phone flashes DRAW at fireAt on the
   server clock and the TV plays it for the room. Each phone still times its
   own reaction from its own painted flash and submits its run (playDuel).
   Settlement is unchanged: resolveDuel reads the two runs. A duel nobody
   readied within DUEL_READY_MS of its acceptance falls back to each side
   drawing on their own, so a duel never deadlocks; so does a duelist who
   missed the flash (DUEL_LATE_MS past fireAt without a run). Duels without
   `consent` or `acceptedAt` predate the showdown and are drawn alone. */
const DUEL_READY_MS = 2 * 60 * 1000;
const DUEL_FIRE_MIN_MS = 2000;
const DUEL_FIRE_SPAN_MS = 3000;
const DUEL_LATE_MS = 1500;
const duelReadyUntil = duel => duel?.consent && Number(duel.acceptedAt) ? Number(duel.acceptedAt) + DUEL_READY_MS : null;
/* how a live duel is drawn: "stance" (waiting for both to ready), "showdown"
   (both ready, fireAt stamped) or "solo" (each draws alone); null otherwise */
function duelMode(duel, now = Date.now()) {
  if (duelPhase(duel, now) !== "live") return null;
  if (Number(duel.fireAt)) return "showdown";
  const until = duelReadyUntil(duel);
  if (!until || Object.keys(duel.runs || {}).length) return "solo";
  return now < until ? "stance" : "solo";
}
/* the one random draw instant, from the moment both are ready */
const duelFireAt = (armedAt, random = Math.random()) =>
  Number(armedAt) + DUEL_FIRE_MIN_MS + Math.floor(Math.max(0, Math.min(0.9999, Number(random) || 0)) * DUEL_FIRE_SPAN_MS);
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

/* Each place pays its award (awardTable) to every player in it: a team's
   players each take the full amount. A bracket has no 3rd-place game, so
   both semifinal losers take the full 3rd-place award. Event crew (a draw's
   players left off every team) take the 3rd-place award too. Value-less
   events (the poker finale) pay nothing. */
function resultAwards(state, ev, res) {
  const table = awardTable(ev);
  const draw = state.draws?.[ev?.id];
  const out = [];
  const thirdEach = table[2] || 0;
  (res?.slots || []).forEach((players, place) => {
    const each = table[place] || 0;
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
function awardPlan(ev, draw = null, count = ROSTER.length) {
  const table = awardTable(ev);
  const crew = draw ? (draw.roles || []).length > 0
    : Number.isInteger(eventCapacity(ev)) && eventCapacity(ev) < count;
  const rows = table.map((pts, place) => ({ place, pts }));
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

/* -- Underdog odds --
   A two-sided contest's gap is the difference in its sides' average chips
   per player times the smaller side's size: a 1v1 needs 1,000 chips between
   them, a pair 1,000 combined, a 7 v 6 compares at six players. UNDERDOG_GAP
   or more, the lower side is the underdog and its winning tickets pay
   UNDERDOG_MULT. Stored at market open (eventOps[ev].odds[contestId]) and on
   each ticket, so later standings never move it. */
function oddsFor(state, contest, rows = computeStandings(state)) {
  if (!contest || contest.sides?.length !== 2 || pokerLive(state) || stacksPosted(state)) return null;
  const pts = Object.fromEntries(rows.map(row => [row.player, row.pts]));
  const counted = contest.sides.map(side => (side.players || []).filter(player => pts[player] !== undefined));
  if (counted.some(players => !players.length)) return null;
  const strength = counted.map(players => players.reduce((sum, player) => sum + pts[player], 0) / players.length);
  const gap = Math.abs(strength[0] - strength[1]) * Math.min(counted[0].length, counted[1].length);
  if (gap < UNDERDOG_GAP) return { underdog:null, gap:Math.round(gap) };
  const low = strength[0] < strength[1] ? 0 : 1;
  return { underdog:contest.sides[low].key, mult:UNDERDOG_MULT, gap:Math.round(gap) };
}

function computeStandings(state) {
  const pts = {}, wins = {}, betNet = {}, duelNet = {}, awardPts = {};
  /* one row per player on the weekend's roster: Not coming leaves no row */
  const roster = rosterOf(state);
  roster.forEach(p => { pts[p] = START; wins[p] = 0; betNet[p] = 0; duelNet[p] = 0; awardPts[p] = 0; });
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
  const book = poolBook(state);
  (state.wagers || []).forEach(w => {
    const r = resolveWager(state, w, evs, book);
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
    roster.forEach(p => { pts[p] = stacksRes.stacks[p] ?? 0; });
    rulings.forEach(a => {
      if (postCountRulingApplies(a, stacksRes) && pts[a.player] !== undefined) pts[a.player] += a.delta;
    });
    const seats = (Array.isArray(stacksRes.seats) ? stacksRes.seats
      : Array.isArray(state.poker?.seats) ? state.poker.seats : roster).filter(p => pts[p] !== undefined);
    const top = seats.length ? Math.max(...seats.map(p => pts[p])) : 0;
    leaders = new Set(top > 0 ? seats.filter(p => pts[p] === top) : []);
  }
  const lead = p => leaders?.has(p) ? 1 : 0;
  const outRank = p => {
    const i = (stacksRes?.outs || []).indexOf(p);
    return i >= 0 ? i : stacksRes?.stacks?.[p] === 0 ? -1 : Infinity;
  };
  const rows = roster.map(p => ({ player:p, pts:pts[p], wins:wins[p], betNet:betNet[p], duelNet:duelNet[p], awardPts:awardPts[p] }))
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
  if ((fit.size || 0) >= 3) shuffle(TEAM_NAMES);
  /* two draws in one millisecond must not share an id: tickets key on it */
  const id = `d${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  /* a team of three or more opens with its first suggestion as its name */
  const names = defaultTeamNames(state, ev, id, groups.map(players => ({ players })));
  return { id, method:"balanced", ts:Date.now(),
    teams: groups.map((players, i) => names[i] ? { players, name:names[i] } : { players }) };
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
/* The slots that sit out the first round (their first match comes later). */
function bracketByeSlots(br) {
  const first = new Set();
  (br?.rounds?.[0] || []).forEach(match => [match.a, match.b]
    .forEach(slot => { if (slot?.t !== undefined) first.add(slot.t); }));
  const out = [];
  for (let t = 0; t < (br?.size || 0); t++) if (!first.has(t)) out.push(t);
  return out;
}
/* a stable tie-break from the draw's own id, so a seeding replays */
const seedHash = text => {
  let h = 2166136261;
  for (const ch of String(text)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h;
};
/* Byes to the bottom: the bracket's bye slots go to the lowest-ranked teams
   (average chips per player, ties broken by a hash of the drawn teams), lowest first into
   the earliest slot; every other team keeps its draw order. A board where
   every team is level (before the weekend) keeps the draw order as drawn.
   Returns seeds[slot] = draw team index. */
function bracketSeeds(state, draw, br) {
  const teams = draw?.teams || [];
  const identity = teams.map((_, index) => index);
  const byes = bracketByeSlots(br);
  if (!byes.length || teams.length !== br?.size) return identity;
  const pts = Object.fromEntries(computeStandings(state).map(row => [row.player, row.pts]));
  const average = team => (team.players || []).reduce((sum, player) => sum + (pts[player] ?? START), 0)
    / Math.max(1, (team.players || []).length);
  const strength = teams.map(average);
  if (strength.every(value => value === strength[0])) return identity;
  const tieKey = index => seedHash((teams[index].players || []).join("|"));
  const ranked = [...identity].sort((a, b) => strength[a] - strength[b]
    || tieKey(a) - tieKey(b) || a - b);
  const bottom = ranked.slice(0, byes.length);
  const rest = identity.filter(index => !bottom.includes(index));
  return identity.map(slot => byes.includes(slot) ? bottom[byes.indexOf(slot)] : rest.shift());
}
/* The bracket a draw plays, seeded so its byes go to the bottom. The seed
   order rides on the bracket (seeds[slot] = team) and the teams that sit
   out the first round on byes, so the draw replays exactly. */
function seedBracket(state, draw, n = draw?.teams?.length) {
  const br = makeBracket(n);
  if (!br) return null;
  const byeSlots = bracketByeSlots(br);
  const seeds = bracketSeeds(state, draw, br);
  const remap = slot => slot && slot.t !== undefined ? { ...slot, t:seeds[slot.t] } : slot;
  br.rounds = br.rounds.map(round => round.map(match => ({ ...match, a:remap(match.a), b:remap(match.b) })));
  br.seeds = seeds;
  if (byeSlots.length) br.byes = byeSlots.map(slot => seeds[slot]);
  return br;
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
        /* named as the bracket names it: "Final", "Semifinal 1", "Round 1 Match 3" */
        label:bracketMatchName(br, r, m),
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
  const nextAction = phase === "betting-open" ? lifecycleAction("lock-betting", "Lock and start")
    : phase === "betting-locked" ? lifecycleAction("start-event", "Start")
      : phase === "awaiting-result" ? lifecycleAction("post-result", "Post result")
        : phase === "scheduled" ? lifecycleAction("open-betting", "Open betting")
        : target.kind === "ffa" ? lifecycleAction("enter-result", "Enter result")
          : lifecycleAction("record-contest-winner", "Record winner");
  const odds = op.odds?.[target.id];
  const pooled = !!op.pools?.[target.id];
  return { ...target, ...(pooled ? { pool:true } : {}), eventId:ev.id, revision:same ? Number(stored.revision || 0) : Number(op.contestRevision || 0),
    phase, legacy, players:[...new Set(target.sides.flatMap(side => side.players))], nextAction,
    ...(odds && odds.underdog !== null && odds.underdog !== undefined ? { odds } : {}) };
}
/* Any contest with exactly two sides is a matchup, whatever its format: it
   pays even and a competitor may back only their own side. Only a wider
   free-for-all pays 2:1 and leaves every side open to everyone. */
const wideField = contest => contest?.kind === "ffa" && contest.sides.length > 2;
/* A wide field pays 2:1 on every side. A two-sided contest pays 1:1, except
   its underdog's side when the contest carries odds. */
const contestMult = (contest, sideKey) => wideField(contest) ? OUTRIGHT_MULT
  : contest?.odds && Number.isInteger(contest.odds.mult) && sideKey !== undefined && sideKey !== null
    && contest.odds.underdog === sideKey ? contest.odds.mult : 1;
/* each side's payout, for one payout line per side */
const contestSideMults = contest => Object.fromEntries((contest?.sides || [])
  .map(side => [side.key, contestMult(contest, side.key)]));
/* A pooled contest's sides in board order: the bank's seed, what rides on
   each, its price now (the price it settles at once betting locks). */
function contestPool(state, contest) {
  if (!contest?.pool) return null;
  const pool = poolOf(state, contest.eventId, contest.id);
  const sides = contest.sides.map(side => {
    const s = pool.sides[sideId(side.key)] || { seed:0, stake:0, bettors:0 };
    return { key:side.key, seed:s.seed, stake:s.stake, bettors:s.bettors, price:pool.price(side.key) };
  });
  const prices = sides.map(s => s.price);
  return { total:pool.total, sides, price:pool.price, staked:sides.reduce((sum, s) => sum + s.stake, 0),
    favorite:sides.length ? sides[prices.indexOf(Math.min(...prices))].key : null,
    longshot:sides.length ? sides[prices.indexOf(Math.max(...prices))].key : null };
}
/* The price a decided contest's winner was paid at, and whether that is an
   upset. Legacy contests answer from their stored underdog odds. */
function contestUpset(state, eventId, contestId, winnerKey) {
  const op = state.eventOps?.[eventId] || {};
  if (op.pools?.[contestId]) {
    const price = poolOf(state, eventId, contestId).price(winnerKey);
    return { price, upset:price >= UPSET_PRICE };
  }
  const odds = op.odds?.[contestId];
  const upset = !!odds && odds.underdog !== null && odds.underdog !== undefined
    && String(odds.underdog) === String(winnerKey);
  return { price:upset ? (odds.mult || UNDERDOG_MULT) + 1 : null, upset };
}
/* What a ticket pays back per chip: its pool's price now (its settled
   price once its contest is decided), or a legacy ticket's fixed payout. */
function wagerPrice(state, w) {
  if (!w) return null;
  if (!w.pool) return wagerMult(w) + 1;
  return poolOf(state, w.eventId, w.contestId).price(wagerSide(state, w));
}
/* "3.4×" */
const priceText = price => `${(Math.round(Number(price) * 10) / 10).toFixed(1)}×`;
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
    return response("The draw changed. Check the board and tap again");
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
  const seated = rows.filter(row => !isAbsent(state, row.player));
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
    away:rows.filter(row => isAbsent(state, row.player)).map(row => ({ player:row.player, pts:row.pts })),
    rows:distribution.rows.map(row => ({ player:row.player, before:row.before, stack:row.stack,
      grant:row.grant, denominations:row.denominations, ...(row.short > 0 ? { short:row.short } : {}) })),
    inventory:distribution.inventory,
    ...(distribution.lent ? { lent:distribution.lent } : {}),
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
      /* one pool book for the scan: every render asks this until the
         table is dealt, and an unpriced pool ticket re-reads every wager */
      const book = poolBook(state);
      const pendingWagers = (state.wagers || []).filter(w =>
        resolveWager(state, w, events, book).status === "pending").length;
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
  isOut, rosterOf, MIN_PLAYING, eventPool, crewRotation, arrivalsOpen, hasArrived, isOnTheWay, isAbsent, canCheckIn,
  ARRIVE_CODE_ALPHABET, isArriveCode,
  AWARDS, AWARD_VALUES, AWARD_LADDER, OLD_LADDER_VALUES, migrateAwardLadder, awardTable, PT, START, MAX_RISK, BUYIN_FLOOR, maxRisk, SPORTS, RATINGS, SESSIONS, BUILTIN_EVENTS, SLOT_META,
  OUTRIGHT_MULT, DUEL_STAKE, DUEL_GAMES, EMPTY_STATE, EDITION, LOGISTICS, SIZES, TEAM_NAMES, GAMES,
  RESET_PROGRESS_CONFIRMATION, RESET_PROGRESS_PRESERVED_KEYS,
  OVERFLOW_ROLES, OVERFLOW_ROLE_META, overflowRoleMeta, participationForEvent, eventCapacity, validateEventParticipants,
  teamFit, shapeLabel, suggestParticipants,
  normalizeOverflowRoles, defaultQaParticipants, coalescePendingReveals,
  AIRLINES, cleanLeg, cleanLogistics, legTime, legText,
  CHIP_GRAY, CHIP_COLORS, CHIP_SKINS, CHIP_MIN, CHIP_SET, CHIP_RESERVE, POKER_CONFIG, POKER_LEVELS, raceOffText,
  allEventsOf, disp, shuffle, snakeTeam, draftTurn, teamLabel, stageFinalists, stageEntrantView,
  resolveWager, wagerMult, wagerBoardEvent, resolveDuel, pokerLive,
  DUEL_LAPSE_MS, DUEL_DAILY_LIMIT, duelAccepted, duelLapsed, duelLapsesAt, duelPhase, duelOpen,
  DUEL_READY_MS, DUEL_FIRE_MIN_MS, DUEL_FIRE_SPAN_MS, DUEL_LATE_MS, duelReadyUntil, duelMode, duelFireAt,
  duelReserve, duelRoom, duelBetween, duelsSentToday, redactDuelsForViewer, stacksPosted, pokerLevels, pokerClock, pokerClockAnchor,
  pokerDeal, pokerTableDeal, pokerSeatChips, pokerSeatShort, pokerDistribution, pokerInventory,
  resultAwards, awardPlan, postCountRuling, postCountRulingApplies,
  computeStandings, atRisk, drawTeams, splitIntoGroups,
  enforceExposure, refundTotals, voidWagerRecords,
  contestStackOf, contestEntryLabel, applyContestCorrection, contestCorrectionAvailability, contestCorrections,
  correctionText, announcementTakeBack, lockerRoomAvailability, pokerSetupPreview,
  playerStrength, strengthMap, refineTeams,
  makeBracket, ROUND_NAMES, MAX_BRACKET, bracketRoundName, bracketMatchName, resolveSlot, qaBracketMatchWager, bracketChampion, bracketMatchOpen, bracketOrder,
  EVENT_PHASES, EVENT_PHASE_LABELS, eventOpOf, resultReadiness,
  resolveEventLifecycle, resolveWeekendOperation, resolveCurrentContest, contestBetEligibility, wagerMatchesContest, contestUndoAvailability,
  contestMult, contestSideMults, wagerSide, contestSideOf,
  refundText, eventInPlay,
  UNDERDOG_GAP, UNDERDOG_MULT, oddsFor,
  POOL_SEED, POOL_CAP, POOL_MIN, UPSET_PRICE, poolPrice, poolNet, poolSeed, poolOf, poolBook, contestPool, contestUpset, priceText, wagerPrice,
  bracketByeSlots, bracketSeeds, seedBracket,
};
