/* The fit audit's states (scripts/fit-audit.mjs, npm run audit:fit): every
   TV scene and phone view the weekend can put on a screen, built in memory
   by the real reducers (qaAdvance and the real actions), never by hand.
   Real data shapes: thirteen players, a long name ("Squilliam"), a lowercase
   two-word one ("j vo"), photos for nine and none for four, teams of seven,
   a thirteen-player bracket, a crowned champion with every result posted.

   Pure: each build returns { state, now?, at?, moment?, nobets? } and never
   touches a clock beyond what the reducers stamp. Shared by the browser
   harnesses (dev/fit-tv.jsx, dev/fit-phone.jsx) and tests/fit-audit.test.mjs. */
import {
  EMPTY_STATE, ROSTER, RESET_PROGRESS_CONFIRMATION, allEventsOf, computeStandings, draftTurn, presentPlayers, resolveCurrentContest,
  resolveWager,
} from "../../shared/core.js";
import { applyAction as apply } from "../../worker/actions.js";

/* display names the audit stresses: a long one, a lowercase pair, a
   surname. Applied after the fill, so qaAdvance never sees them as touched */
export const FIT_NAMES = Object.freeze({ Richard:"Squilliam", Jeremy:"j vo", Henry:"Henry Nguyen" });
/* players with a saved photo; the rest (Allan, Henry, Ben, Jeremy) show
   initials, the case a photo chip has to handle */
export const FIT_PHOTOS = Object.freeze(ROSTER.slice(0, 9));
/* the phone's viewer: a long name with a photo; the commissioner is Brandon */
export const FIT_GUEST = "Richard";
export const FIT_GM = "Brandon";

let seq = 0;
const OPENING = new Set(["announceEvent", "announceAndDraw", "setOnDeck", "startEvent", "lockAndStart", "pokerStart"]);
const gmCtx = () => ({ isGm:true, qa:true, progressReset:true, environment:"local", player:FIT_GM, deviceId:"fit-gm",
  actionId:`fit-${++seq}`, showControl:false });
const playerCtx = player => ({ isGm:false, player, deviceId:`fit-${player}`, actionId:`fit-${++seq}` });

export function act(state, type, payload = {}, ctx = gmCtx()) {
  const body = OPENING.has(type) && payload && typeof payload === "object" && !("startWeekend" in payload)
    ? { ...payload, startWeekend:true } : payload;
  const result = apply(state, type, body, ctx);
  if (!result.ok) throw new Error(`${type}: ${result.error}`);
  return result;
}
const qa = (state, target) => act(state, "qaAdvance", { target, seed:7, confirm:RESET_PROGRESS_CONFIRMATION,
  confirmPokerLive:true });

/* names and photos on top of the reducers' fill */
export function dress(state, now = Date.now()) {
  /* the Durable Object stamps every write; the reducers alone do not */
  if (!Number(state.updatedAt)) state.updatedAt = now;
  for (const player of ROSTER) {
    const profile = state.profiles[player] || (state.profiles[player] = {});
    if (FIT_NAMES[player]) profile.display = FIT_NAMES[player];
    if (FIT_PHOTOS.includes(player)) profile.photoV = 1;
    else delete profile.photoV;
  }
  return state;
}

/* guests' photos (D11 records only; the audit serves stand-in images) */
export function withPhotos(state, n) {
  state.moments = Array.from({ length:n }, (_, i) => ({ id:`mfit${String(i).padStart(8, "0")}`, by:ROSTER[i % ROSTER.length],
    at:1_800_000_000_000 - i * 60000, takenAt:1_800_000_000_000 - i * 60000, w:1600, h:1200 }));
  return state;
}

export function fresh(target = "locker") {
  const state = structuredClone(EMPTY_STATE);
  qa(state, target);
  return state;
}

const eventOf = (state, id) => allEventsOf(state).find(ev => ev.id === id);
/* drop every pending bet: the owner's "no bets on this match" board */
export function withoutBets(state) {
  const events = allEventsOf(state);
  state.wagers = (state.wagers || []).filter(w => resolveWager(state, w, events).status !== "pending");
  return state;
}
/* away players leave draws, so a bracket of N is everyone but 13 - N */
const awayAllBut = (state, keep) => {
  ROSTER.slice(keep).forEach(player => act(state, "setAway", { player, away:true }));
  return state;
};

function draft() {
  const state = fresh("session:fri");
  const pool = presentPlayers(state);
  act(state, "startDraft", { evId:"bball5", captains:["Evan", "Richard"], players:pool });
  for (let i = 0; i < 5; i++) {
    const d = state.drafts.bball5;
    const turn = draftTurn(d);
    act(state, "pickDraftPlayer", { evId:"bball5", player:d.pool[0], draftId:turn.draftId, pickIndex:turn.pickIndex,
      draftRevision:turn.draftRevision });
  }
  return state;
}

/* a bracket of `keep` players, open on its first match */
function bracketOf(keep, { steps = 0, bets = true } = {}) {
  const state = fresh("session:fri");
  awayAllBut(state, keep);
  qa(state, "event:bball1:open");
  for (let i = 0; i < steps; i++) qa(state, "step");
  return bets ? state : withoutBets(state);
}

/* A result posted the way the commissioner posts it (no QA jump, which
   marks its scene as already seen): lock and start, then the free-for-all's
   entry or the match's winner tap, which posts the result in the same
   write. The TV's result moment plays from that write. */
function posted(target, evId) {
  return postedOn(fresh(target), evId);
}
function postedOn(state, evId) {
  const ev = eventOf(state, evId);
  const contest = resolveCurrentContest(state, ev);
  const ref = { evId, contestId:contest.id, contestRevision:contest.revision };
  act(state, "lockAndStart", ref);
  if (contest.kind === "ffa") {
    act(state, "beginResultEntry", { evId });
    const players = side => side.players || state.draws?.[evId]?.teams?.[side.key]?.players || [side.key];
    const sides = contest.sides.map(players);
    const slots = sides.length > 3 ? [sides[8 % sides.length], sides[5 % sides.length], sides[10 % sides.length]] : sides.slice(0, 3);
    act(state, "saveResult", { evId, slots });
  } else {
    const live = resolveCurrentContest(state, ev);
    act(state, "recordContestWinner", { evId, contestId:live.id, contestRevision:live.revision, winner:live.sides[0].key,
      postResult:true });
  }
  /* QA's own writes run a few ms ahead of the wall clock: the result is the
     newest write, as it is in the room */
  const res = state.results[evId];
  const last = Math.max(0, ...Object.values(state.eventOps?.[evId] || {}).filter(v => typeof v === "number" && v > 1e12));
  if (res && last >= Number(res.ts)) res.ts = res.confirmedAt = last + 1;
  return state;
}


/* a late-weekend spread on the towers: the board ruled to these balances,
   highest first in roster order (the commissioner screenshot's 9,200 board,
   and a Saturday night with a 15,000 leader and a player below zero) */
export const SPREAD_9200 = Object.freeze([9200, 8500, 7400, 6000, 5700, 5500, 3600, 3300, 3200, 2600, 2500, 1200, 300]);
export const SPREAD_15000 = Object.freeze([15000, 12800, 11000, 9600, 8200, 7000, 5400, 4800, 3500, 2600, 1500, 300, -300]);
export const SPREAD_2000 = Object.freeze([2000, 1800, 1700, 1500, 1400, 1200, 1100, 1000, 900, 800, 600, 300, 0]);
function spread(state, values) {
  const now = Object.fromEntries(computeStandings(state).map(row => [row.player, row.pts]));
  ROSTER.forEach((player, i) => {
    const delta = (values[i] ?? 1000) - (now[player] ?? 1000);
    if (delta) act(state, "adjust", { player, delta, reason:"fit" });
  });
  return state;
}
function spreadPosted(target, evId, values) {
  const state = fresh(target);
  spread(state, values);
  return postedOn(state, evId);
}

/* the result as the newest write, as it is in the room (QA's jumps stamp ahead) */
function newest(state, evId) {
  const res = state.results[evId];
  const stamps = [];
  const walk = node => { if (!node || typeof node !== "object") return;
    for (const v of Object.values(node)) { if (typeof v === "number" && v > 1e12) stamps.push(v); else walk(v); } };
  walk(state.eventOps); walk(state.draws); walk(state.brackets); walk(state.stages);
  if (res) res.ts = res.confirmedAt = Math.max(Number(res.ts) || 0, ...stamps) + 1;
  return state;
}

/* A free-for-all posted with ties (1st is always one): two share 2nd,
   four share 3rd (a counted tie) */
function postedTie(evId = "putt") {
  const state = fresh(`event:${evId}:open`);
  const ev = eventOf(state, evId);
  const contest = resolveCurrentContest(state, ev);
  act(state, "lockAndStart", { evId, contestId:contest.id, contestRevision:contest.revision });
  act(state, "beginResultEntry", { evId });
  const p = contest.sides.map(side => (side.players || [side.key])[0]);
  act(state, "saveResult", { evId, slots:[[p[8]], [p[2], p[5]], [p[10], p[0], p[3], p[4]]] });
  const res = state.results[evId];
  const last = Math.max(0, ...Object.values(state.eventOps?.[evId] || {}).filter(v => typeof v === "number" && v > 1e12));
  if (res && last >= Number(res.ts)) res.ts = res.confirmedAt = last + 1;
  return state;
}

/* A bracket played to its final the way the commissioner plays it, the
   side holding `player` winning every match it is in (the long pair
   "Henry Nguyen & Squilliam" takes Beer Die) */
function bracketWonBy(evId, player) {
  const state = fresh(`event:${evId}:open`);
  const ev = eventOf(state, evId);
  for (let i = 0; i < 16 && !state.results[evId]; i++) {
    const contest = resolveCurrentContest(state, ev);
    if (!contest) break;
    try { act(state, "lockAndStart", { evId, contestId:contest.id, contestRevision:contest.revision }); } catch {}
    const live = resolveCurrentContest(state, ev);
    const side = live.sides.find(item => (item.players || []).includes(player)) || live.sides[0];
    act(state, "recordContestWinner", { evId, contestId:live.id, contestRevision:live.revision, winner:side.key, postResult:true });
  }
  /* QA's jumps stamp a few ms ahead of the wall clock: the final is the newest write, as in the room */
  const res = state.results[evId];
  if (res) res.ts = res.confirmedAt = latestPostedAt(state) + 1;
  return state;
}

/* A matchup's felts with a set number of bettors a side (Pickleball's
   Play-in 1, the viewer on the left side): competitors back their own side,
   spectators fill the rest, stakes of every size */
const STAKES = [500, 300, 200, 100, 800, 400, 100, 200, 600, 300];
function matchupBets(a, b) {
  const state = withoutBets(fresh("event:pickleball:open"));
  const ev = eventOf(state, "pickleball");
  const contest = resolveCurrentContest(state, ev);
  const [left, right] = contest.sides;
  const crowd = presentPlayers(state).filter(p => !left.players.includes(p) && !right.players.includes(p));
  const leftPool = [...left.players, ...crowd], rightPool = [...right.players, ...crowd.slice().reverse()];
  const used = new Set();
  const place = (side, pool, n) => {
    let k = 0;
    for (const player of pool) {
      if (k >= n) break;
      if (used.has(player)) continue;
      used.add(player);
      const stake = STAKES[(used.size + k) % STAKES.length];
      const wager = amount => ({ wager:{ eventId:ev.id, evName:ev.name, contestId:contest.id, contestRevision:contest.revision,
        pickPlayers:[...side.players], kind:"match", pickTeam:true, drawId:contest.drawId, match:[...contest.match],
        teamIdx:side.key, matchName:contest.label, stake:amount } });
      /* a short stack bets what its cap allows */
      try { act(state, "placeWager", wager(stake), playerCtx(player)); }
      catch { act(state, "placeWager", wager(100), playerCtx(player)); }
      k++;
    }
  };
  place(left, leftPool, a);
  place(right, rightPool, b);
  return state;
}

/* Team names at their longest (features/teams): every team renamed by the
   commissioner to a 24-character name, one of them a single long word */
export const LONG_TEAM_NAMES = Object.freeze(["Les Quizerables Reunited", "Periwinkle Twinkle Stars",
  "Unstoppableones Club", "Smarty Pints and Friends", "Dink Responsibly Please", "Kitchen Nightmares Crew"]);
export function longNames(state, evId) {
  const draw = state.draws[evId];
  draw.teams.forEach((team, index) => act(state, "nameTeam", { evId, drawId:draw.id, team:index,
    name:LONG_TEAM_NAMES[index % LONG_TEAM_NAMES.length] }));
  return state;
}

/* Where and When: three rounds, the room guessing, a reveal, the end */
export const GEO_ROUNDS = Object.freeze([
  { id:"gfitround1", photo:{ id:"gfitphoto1", w:1600, h:1200 }, lat:37.8199, lng:-122.4783, place:"Golden Gate Bridge",
    when:"2019-07-04T21", caption:"Fourth of July" },
  { id:"gfitround2", photo:{ id:"gfitphoto2", w:1200, h:1600 }, lat:40.758, lng:-73.9855, place:"Times Square",
    when:"2021-12-31T23" },
  { id:"gfitround3", photo:{ id:"gfitphoto3", w:1600, h:900 }, lat:36.1147, lng:-115.1728, place:"Las Vegas",
    when:"2023-03-18T02" },
]);
function geo(stage) {
  const state = fresh("event:die:done");
  GEO_ROUNDS.forEach(round => act(state, "geoSaveRound", structuredClone(round)));
  act(state, "announceEvent", { evId:"where" });
  const contest = resolveCurrentContest(state, eventOf(state, "where"));
  act(state, "lockAndStart", { evId:"where", contestId:contest.id, contestRevision:contest.revision });
  act(state, "geoStart", { evId:"where" });
  const players = ROSTER.filter(p => p !== FIT_GM);
  const rounds = stage === "final" ? GEO_ROUNDS : GEO_ROUNDS.slice(0, 1);
  rounds.forEach((round, r) => {
    players.forEach((player, i) => {
      if (stage === "guess" && i % 3 === 2) return;
      act(state, "geoGuess", { roundId:round.id, lat:round.lat + (i - 6) * 0.9, lng:round.lng + (i % 5) * 1.3,
        when:round.when.replace(/T\d\d$/, `T${String((i * 5) % 24).padStart(2, "0")}`), done:i % 2 === 0 }, playerCtx(player));
    });
    if (stage === "guess") return;
    act(state, "geoReveal", { roundId:round.id });
    if (r < rounds.length - 1 || stage === "final") act(state, "geoNext", { roundId:round.id });
  });
  return state;
}

/* Trivia: a bank round (a choice and a closest number) and the
   commissioner's own (a long question, a picture, a tune), played by the
   four drawn teams through the real pick writes. `stage` stops the game at
   a moment: "question" (the first, two teams locked, the guest's team
   picked by a teammate), "picture", "tune", "number", "reveal" (the first
   revealed), "number-reveal", "board" (after the bank round), "final". */
export const TRIVIA_FIT_ROUNDS = Object.freeze([
  { id:"tfitbank01", source:"bank", category:"geography", picks:["geography-06", "geography-13"] },
  { id:"tfitgroom1", source:"custom", name:"The groom", questions:[
    { id:"qfitlong01", format:"choice", text:"Which of these did Brandon order the first time he took everyone to the diner after the fantasy draft in 2019?",
      options:["Chicken and waffles", "A patty melt with extra pickles", "Two breakfasts", "Nothing, he left early"], answer:1 },
    { id:"qfitpic001", format:"picture", text:"Where was this taken?", photo:{ id:"pfitphoto01", w:1600, h:1200 },
      options:["Lake Tahoe", "Big Sur", "Zion", "Sedona"], answer:3 },
    { id:"qfittune01", format:"tune", text:"", options:[{ title:"Mr. Brightside", artist:"The Killers" },
      { title:"Take Me Out", artist:"Franz Ferdinand" }, { title:"Somebody Told Me", artist:"The Killers" },
      { title:"The Middle", artist:"Jimmy Eat World" }], answer:0 },
  ] },
]);
const TRIVIA_STOPS = { question:0, number:1, reveal:0, "number-reveal":1, board:1, long:2, picture:3, tune:4, final:4 };
export function triviaStage(stage = "question") {
  const state = fresh("event:trivia:open");
  TRIVIA_FIT_ROUNDS.forEach(round => act(state, "triviaSaveRound", { round:structuredClone(round) }));
  const contest = resolveCurrentContest(state, eventOf(state, "trivia"));
  act(state, "lockAndStart", { evId:"trivia", contestId:contest.id, contestRevision:contest.revision });
  act(state, "triviaStart", { evId:"trivia" });
  const stop = TRIVIA_STOPS[stage] ?? 0;
  /* everyone answers alone: most of the room right, the rest spread over
     the other answers, each lock a beat after the last (so speed differs) */
  const answer = (q, last) => {
    const time = state.trivia.times[q.id];
    state.trivia.players.forEach((player, i) => {
      const right = i % 3 !== 1;
      const payload = q.format === "number" ? { value:Math.round(q.answer * (1 + (i - 6) * 0.017)) }
        : { choice:right ? q.answer : (q.answer + 1 + (i % 3)) % 4 };
      /* the live question: a few still thinking, the guest's own pick open */
      if (last && i % 4 === 3 && player !== FIT_GUEST) return;
      const lock = !last || player !== FIT_GUEST;
      act(state, "triviaPick", { questionId:q.id, ...payload, lock }, playerCtx(player));
      if (lock) state.trivia.picks[q.id][player].lockedAt = time.startsAt + 900 + i * 1100;
    });
  };
  for (let i = 0; i <= stop; i++) {
    const q = state.trivia.questions[state.trivia.index];
    const last = i === stop;
    answer(q, last && !["reveal", "number-reveal", "board", "final"].includes(stage));
    if (last && !["reveal", "number-reveal", "board", "final"].includes(stage)) break;
    act(state, "triviaReveal", { questionId:q.id });
    if (last && stage !== "board" && stage !== "final") break;
    if (state.trivia.index === state.trivia.questions.length - 1 || (stage === "board" && last)) {
      act(state, "triviaBoard", { questionId:q.id });
      break;
    }
    if (state.trivia.rounds.some(round => round.first + round.count - 1 === state.trivia.index))
      act(state, "triviaBoard", { questionId:q.id });
    act(state, "triviaNext", { questionId:q.id });
  }
  return state;
}

/* the awards reveal, its first award turning on a crowned board */
function awards() {
  const state = fresh("crowned");
  const ballot = { id:"bfitawards", kind:"awards", questions:[
    { id:"qfraud", title:"Fraud of the weekend", nominees:null, allowSelf:false },
    { id:"qclutch", title:"Most clutch", nominees:["Evan", "Richard", "Jeremy"], allowSelf:false },
  ] };
  act(state, "promptPublish", { ballot });
  ROSTER.forEach((player, i) => {
    act(state, "promptRespond", { id:ballot.id, questionId:"qfraud", choice:player === "Richard" ? "Evan" : "Richard" },
      playerCtx(player));
    act(state, "promptRespond", { id:ballot.id, questionId:"qclutch", choice:["Evan", "Richard", "Jeremy"].find(p => p !== player
      && (i % 2 ? p !== "Evan" : true)) }, playerCtx(player));
  });
  act(state, "promptClose", { id:ballot.id });
  act(state, "promptReveal", { id:ballot.id, step:1 });
  return state;
}

/* v3.1 comebacks: Beer Die's first match opened with one side 1,000+
   ahead, so the board carries an underdog paying 2:1. The draw is real; the market is taken back, the
   leader is ruled up, and betting reopens so the odds are fixed then. */
export function comebackBoard({ bets = true } = {}) {
  const state = fresh("event:putt:done");
  act(state, "announceAndDraw", { evId:"die" });
  const ev = eventOf(state, "die");
  const side = resolveCurrentContest(state, ev).sides[0];
  act(state, "takeBackAnnouncement", { evId:"die" });
  side.players.forEach((player, i) => act(state, "adjust", { player, delta:i ? 900 : 1500, reason:"fit" }));
  act(state, "announceEvent", { evId:"die" });
  const contest = resolveCurrentContest(state, ev);
  if (bets) contest.sides.forEach((item, k) => ROSTER.filter(player => !contest.players.includes(player)).slice(k * 3, k * 3 + 3)
    .forEach((player, i) => act(state, "placeWager", { wager:{ kind:"match", eventId:"die", evName:ev.name, stake:STAKES[i] || 100,
      contestId:contest.id, contestRevision:contest.revision, match:contest.match, teamIdx:item.key, drawId:contest.drawId } },
    playerCtx(player))));
  return state;
}
/* Long Putt's free-for-all with the room betting (Brandon's staging board,
   Oct 4): all thirteen back someone, a spot with six backers (one a tower
   past ten chips), others with four, two and one, and the rest empty, so a
   spot's total, its stacks, their amounts and names all compete for room */
export function ffaCrowd() {
  const state = withoutBets(fresh("event:putt:open"));
  const ev = eventOf(state, "putt");
  ["Brandon", "Evan", "Khoa"].forEach(player => act(state, "adjust", { player, delta:3000, reason:"fit" }));
  const contest = resolveCurrentContest(state, ev);
  const sideOf = player => contest.sides.find(side => side.players.includes(player)) || contest.sides[0];
  /* [bettor, the player backed, stake] */
  const plan = [
    ["Brandon", "Richard", 1500], ["Adi", "Richard", 300], ["Ben", "Richard", 200], ["Chinh", "Richard", 500],
    ["Henry", "Richard", 100], ["Allan", "Richard", 300],
    ["Evan", "Khoa", 2000], ["Jeremy", "Khoa", 300], ["Sahil", "Khoa", 400], ["Chiang", "Khoa", 100],
    ["Khoa", "Henry", 1200], ["Richard", "Henry", 300],
    ["Eyob", "Jeremy", 300],
  ];
  for (const [player, backed, stake] of plan) {
    if (!ROSTER.includes(player)) continue;
    const side = sideOf(backed);
    const wager = amount => ({ wager:{ kind:"outright", eventId:ev.id, evName:ev.name, contestId:contest.id,
      contestRevision:contest.revision, pick:side.key, pickPlayers:[...side.players], stake:amount } });
    try { act(state, "placeWager", wager(stake), playerCtx(player)); }
    catch { act(state, "placeWager", wager(100), playerCtx(player)); }
  }
  return state;
}
/* the commissioner's pill on Beer Die's draw beat: the crew check opens */
const crewBeat = () => fresh("event:putt:done");

/* Arrivals (Oct 4): the door open with `n` of the roster in, in roster
   order (the guest among them, or held back on the way), and arrival
   flights for five so the TV's Landed has something to light (four down
   by 3 PM Friday, one after). `latestAgo`: the last one in landed that
   many ms ago (a TV still holding its drop). */
export const ARRIVE_FLIGHTS = Object.freeze({ Ben:"09:55", Richard:"11:05", Allan:"12:40", Henry:"14:15", Jeremy:"18:30" });
/* the TV's check-in code in every view (the fit TV draws it; the fit
   phone's reducer takes it as the Durable Object's current code) */
export const FIT_ARRIVE_CODE = "FDTVK7QX";
/* 3:10 PM Friday at the house */
export const ARRIVE_CLOCK = "2026-10-30T22:10:00Z";
export function withArrivals(state, n, { guest = "road", latestAgo = null } = {}) {
  act(state, "setArrivalsOpen", { open:true });
  const order = guest === "here" ? [FIT_GUEST, ...ROSTER.filter(p => p !== FIT_GUEST)] : ROSTER.filter(p => p !== FIT_GUEST);
  order.slice(0, n).forEach(player => act(state, "setArrived", { player, arrived:true }));
  for (const [player, time] of Object.entries(ARRIVE_FLIGHTS))
    state.profiles[player] = { ...state.profiles[player], flightsBooked:true, flightIn:{ air:"AA", num:"2214", time } };
  /* the arrivals a minute apart, the last one `latestAgo` ms ago */
  if (latestAgo !== null) order.slice(0, n).reverse()
    .forEach((player, i) => { state.arrivals.at[player] = Date.now() - latestAgo - i * 60000; });
  return state;
}
/* the crew check with four still on the way */
const crewRoad = () => withArrivals(fresh("event:putt:done"), 9);
/* a match being played: the pill's two winner targets (Beer Die's play-in) */
function winnerBeat() {
  const state = fresh("event:putt:done");
  act(state, "announceAndDraw", { evId:"die" });
  const ev = eventOf(state, "die");
  const contest = resolveCurrentContest(state, ev);
  act(state, "lockAndStart", { evId:"die", contestId:contest.id, contestRevision:contest.revision });
  return state;
}
/* Beerio Kart's heats on the commissioner's phone: a heat being played
   (the pill's field of racers and the event sheet's tiles), and the
   three-way stage final whose finish order is tapped into the podium */
const lockCurrent = (state, evId) => {
  const contest = resolveCurrentContest(state, eventOf(state, evId));
  if (contest?.phase === "betting-open") act(state, "lockAndStart", { evId, contestId:contest.id, contestRevision:contest.revision });
  return resolveCurrentContest(state, eventOf(state, evId));
};
function heatLive() {
  const state = fresh("event:beerio:open");
  lockCurrent(state, "beerio");
  return state;
}
function heatFinal() {
  const state = fresh("event:beerio:open");
  let contest;
  while ((contest = lockCurrent(state, "beerio")) && contest.kind === "heat")
    act(state, "recordContestWinner", { evId:"beerio", contestId:contest.id, contestRevision:contest.revision,
      winner:contest.sides[contest.sides.length - 1].key });
  return state;
}
/* a bracket of nine seeded on a moved board: the byes sit at the bottom */
function byeBracket() {
  const state = fresh("event:putt:done");
  ROSTER.slice(9).forEach(player => act(state, "setAway", { player, away:true }));
  act(state, "announceAndDraw", { evId:"bball1" });
  return state;
}

/* a stand-in album cover (the audit never reaches Spotify's image host) */
const FIT_COVER = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect width="64" height="64" fill="#1d2b5e"/><circle cx="44" cy="22" r="12" fill="#f2b33d"/>
<path d="M0 46 18 30l12 10 10-8 24 18v14H0z" fill="#c2453a"/><path d="M0 54 24 42l16 8 24-6v20H0z" fill="#0d1430"/></svg>`)}`;

/* a guest's saved win song, as Spotify names the release */
function withSong(state, player) {
  state.profiles[player] = { ...state.profiles[player], walkoutTrack:{ trackId:"0CAAbxxK9CLmzWyo5ZjUuR",
    uri:"spotify:track:0CAAbxxK9CLmzWyo5ZjUuR", name:"Hit 'Em Up - Single Version", artists:["2Pac", "Outlawz"],
    imageUrl:null, durationMs:312000 } };
  return state;
}
/* a win song on the speaker (the Worker writes this record), started just
   after the win it plays for */
function walkoutRecord(state, player, { cover = false } = {}) {
  const at = Date.now() + 400;
  state.profiles[player] = { ...state.profiles[player], walkoutTrack:{ trackId:"3n3Ppam7vgaVa1iaRUc9Lp", uri:"spotify:track:3n3Ppam7vgaVa1iaRUc9Lp",
    name:"Mr. Brightside", artists:["The Killers"], imageUrl:cover ? FIT_COVER : null, durationMs:222000 } };
  state.showControl = { ...(state.showControl || {}), audio:{ ...(state.showControl?.audio || {}),
    walkout:{ player, trackId:"3n3Ppam7vgaVa1iaRUc9Lp", startedAt:at, until:at + 30000, auto:true } } };
  return state;
}

/* the winning team's song, sung by a winner who is not the phone's viewer
   (who the rehearsal crowns depends on the comebacks, so it is read back) */
function teamWinSong(state, evId) {
  const singer = (state.results?.[evId]?.slots?.[0] || []).find(player => player !== FIT_GUEST) || FIT_GM;
  return walkoutRecord(state, singer, { cover:true });
}

/* flights saved on the guest's and the host's own profiles */
function withFlights(state) {
  const set = (p, inLeg, outLeg) => { state.profiles[p] = { ...state.profiles[p], flightsBooked:true, flightIn:inLeg, flightOut:outLeg }; };
  set(FIT_GUEST, { air:"AA", num:"2214", time:"11:05" }, { air:"AA", num:"1630", time:"17:45" });
  set(FIT_GM, { air:"WN", num:"4663", time:"08:40" }, { air:"UA", num:"1885", time:"20:37" });
  return state;
}

/* a win song that should have played and did not (the Worker writes this) */
function missedSong(state, player) {
  state.showControl = { ...(state.showControl || {}), audio:{ ...(state.showControl?.audio || {}),
    miss:{ player, reason:"Speaker asleep", at:Date.now() } } };
  return state;
}

/* the commissioner's TV and Speaker sheets: a scene on the TV (the latest
   result's winner, its first step), win songs saved on three profiles, and
   Spotify's answers stubbed (dev/fit/client.js reads `spotify`), never real */
function onTv(state, kind, eventId) {
  act(state, "startShowScene", { kind, ...(eventId ? { eventId } : {}) }, { ...gmCtx(), showControl:true });
  return state;
}
const FIT_TRACK = (id, name, artists) => ({ trackId:id, uri:`spotify:track:${id}`, name, artists, imageUrl:null, durationMs:222000 });
function withSongs(state) {
  const songs = { Richard:FIT_TRACK("3n3Ppam7vgaVa1iaRUc9Lp", "Mr. Brightside", ["The Killers"]),
    Jeremy:FIT_TRACK("4uLU6hMCjMI75M1A2tKUQC", "Never Gonna Give You Up (2022 Remaster and Extended Mix)", ["Rick Astley"]),
    Brandon:FIT_TRACK("7ouMYWpwJ422jRcDASZB7P", "Kernkraft 400 (A Better Day)", ["Topic", "A7S"]) };
  for (const [player, track] of Object.entries(songs)) state.profiles[player] = { ...state.profiles[player], walkoutTrack:track };
  return state;
}
const CALLBACK = "https://fielddayseries.com/api/spotify/callback";
export const FIT_SPOTIFY = Object.freeze({
  connected:{
    status:{ ok:true, configured:true, connected:true, account:{ displayName:"Brandon Tran", product:"premium" }, premium:true,
      autoWinSongs:true, device:{ id:"d1", name:"Living Room Sonos" }, redirectUri:CALLBACK },
    player:{ ok:true, devices:[{ id:"d1", name:"Living Room Sonos", type:"Speaker", active:true },
      { id:"d2", name:"Brandon's iPhone", type:"Smartphone", active:false }],
      playback:{ playing:true, progressMs:42000, track:FIT_TRACK("3n3Ppam7vgaVa1iaRUc9Lp", "Mr. Brightside", ["The Killers"]) } },
  },
  disconnected:{ status:{ ok:true, configured:true, connected:false, redirectUri:CALLBACK } },
  setup:{ status:{ ok:true, configured:false, connected:false, redirectUri:CALLBACK } },
});

/* Quick Draw's live showdown (Oct 4): Henry Nguyen (no photo, a long
   name) challenges the guest for 300, through the real reducers. The
   session's own filler duels are cleared so the pair is free. `stage`:
   offer, stance (accepted), waiting (the guest ready), armed (both ready;
   the draw is held ten minutes out so the shot lands before it), won or
   foul (both drew; the runs restamped after the draw, as the phones send
   them, so the TV plays its result). */
export const DUEL_FOE = "Henry";
export function duelState(stage = "stance", { base = "session:fri", from = DUEL_FOE, to = FIT_GUEST } = {}) {
  const state = fresh(base);
  state.duels = [];
  if (stage === "none") return state;
  const id = act(state, "sendDuel", { to, game:"quickdraw", stake:300 }, playerCtx(from)).extra.id;
  const d = state.duels.find(item => item.id === id);
  if (stage === "offer") return state;
  act(state, "acceptDuel", { id }, playerCtx(to));
  if (stage === "stance") return state;
  act(state, "duelReady", { id }, playerCtx(to));
  if (stage === "waiting") return state;
  act(state, "duelReady", { id }, playerCtx(from));
  if (stage === "armed") { d.fireAt = d.armedAt + 10 * 60000; return state; }
  act(state, "playDuel", stage === "foul" ? { id, foul:true } : { id, ms:286 }, playerCtx(from));
  act(state, "playDuel", { id, ms:231 }, playerCtx(to));
  d.runs[from].ts = d.fireAt + 520;
  d.runs[to].ts = d.fireAt + 610;
  return state;
}

/* ── the TV ──
   at: how `now` is chosen. { turn } picks the ambient card (and ticker
   page), { result:ms } is that long after the latest result posted,
   { crown:"class" } the frozen TV's class photo turn, { geo:ms } that far
   into the current photo. moment: a takeover layered over the canvas
   ({ kind, t }), frozen at t ms in. */
const crownBeats = [
  ["title", 1000], ["towers", 2600], ["steps", 6000], ["holdtwo", 10800], ["rise", 13600], ["flood", 14900],
  ["name", 16800], ["count", 18400], ["end", 23000],
];
export const TV_SCENARIOS = Object.freeze([
  /* Quick Draw's showdown in a gap: the lamps lighting, the draw's flash,
     the result (reels, WON, the antes taken), a foul; and with an event
     live, no takeover (the result leads the ticker instead) */
  { id:"tv-showdown-lamps", build:() => duelState("armed"), at:{ duel:"armed", ms:1500 }, pause:true, wait:300 },
  { id:"tv-showdown-steady", build:() => duelState("armed"), at:{ duel:"armed", ms:2600 }, pause:true, wait:300 },
  { id:"tv-showdown-draw", build:() => duelState("armed"), at:{ duel:"fire", ms:150 }, pause:true, wait:300 },
  { id:"tv-showdown-result", build:() => duelState("won"), at:{ duel:"result", ms:3200 }, pause:true, wait:300 },
  { id:"tv-showdown-foul", build:() => duelState("foul"), at:{ duel:"result", ms:3200 }, pause:true, wait:300 },
  { id:"tv-showdown-live", build:() => duelState("won", { base:"event:putt:open" }), at:{ duel:"result", ms:3200 } },
  { id:"tv-locker", build:() => fresh("locker") },
  { id:"tv-ambient-board", build:() => fresh("session:fri"), at:{ turn:0 } },
  { id:"tv-ambient-next", build:() => fresh("session:fri"), at:{ turn:1 } },
  { id:"tv-ambient-latest", build:() => fresh("session:fri"), at:{ turn:2 } },
  { id:"tv-ambient-trophy", build:() => fresh("session:sam"), at:{ turn:3 } },
  /* the cup through the weekend: two plates in, seven, every team named at
     its longest, the crowned cup, and a plate being engraved on its turn
     (engrave: ms into the cut when it mounts; the still is 900ms later) */
  { id:"tv-trophy-early", build:() => fresh("event:die:done"), at:{ turn:3 } },
  { id:"tv-trophy-mid", build:() => fresh("event:volley:done"), at:{ turn:3 } },
  { id:"tv-trophy-names", build:() => ["die", "bball5", "pickleball", "volley"]
    .reduce((state, evId) => longNames(state, evId), fresh("event:trivia:done")), at:{ turn:3 } },
  { id:"tv-trophy-crowned", build:() => fresh("crowned"), at:{ crown:"trophy" } },
  { id:"tv-trophy-engrave", build:() => fresh("event:volley:done"), at:{ turn:3, engrave:-400 } },
  { id:"tv-ticker-1", build:() => fresh("session:sam"), at:{ turn:0, tick:1 } },
  { id:"tv-ticker-2", build:() => fresh("session:sam"), at:{ turn:0, tick:2 } },
  { id:"tv-intro", build:() => fresh("locker"), ceremony:{ intro:"putt" } },
  { id:"tv-intro-team", build:() => fresh("session:fri"), ceremony:{ intro:"bball5" } },
  { id:"tv-ffa-open", build:() => fresh("event:putt:open") },
  { id:"tv-ffa-crowd", build:ffaCrowd },
  { id:"tv-pairs-open", build:() => fresh("event:die:open") },
  { id:"tv-pairs-bracket-mid", build:() => fresh("event:pickleball:mid") },
  { id:"tv-team-open", build:() => fresh("event:bball5:open") },
  { id:"tv-team4-open", build:() => fresh("event:volley:open") },
  { id:"tv-heats-open", build:() => fresh("event:beerio:open") },
  { id:"tv-ffa-cage-open", build:() => fresh("event:ragecage:open") },
  { id:"tv-bracket13-open", build:() => bracketOf(13) },
  { id:"tv-bracket13-mid-nobets", build:() => bracketOf(13, { steps:3, bets:false }) },
  { id:"tv-bracket13-mid", build:() => bracketOf(13, { steps:5 }) },
  { id:"tv-bracket7-open", build:() => bracketOf(7) },
  { id:"tv-bracket10-mid", build:() => bracketOf(10, { steps:4 }) },
  { id:"tv-draft", build:draft },
  { id:"tv-poker-set", build:() => fresh("poker:set") },
  { id:"tv-poker-live", build:() => fresh("poker:live") },
  { id:"tv-poker-counted", build:() => fresh("poker:counted") },
  { id:"tv-result-ffa-0", build:() => posted("event:putt:open", "putt"), at:{ result:200 } },
  { id:"tv-result-ffa-900", build:() => posted("event:putt:open", "putt"), at:{ result:1100 } },
  { id:"tv-result-ffa-2400", build:() => posted("event:putt:open", "putt"), at:{ result:3600 } },
  { id:"tv-result-ffa-standings", build:() => posted("event:putt:open", "putt"), at:{ result:9500 } },
  { id:"tv-result-team-podium", build:() => posted("event:bball5:open", "bball5"), at:{ result:3600 } },
  { id:"tv-result-team-standings", build:() => posted("event:bball5:open", "bball5"), at:{ result:9500 } },
  { id:"tv-result-latest", build:() => fresh("event:bball5:done"), at:{ turn:2 } },
  { id:"tv-result-bracket-podium", build:() => fresh("event:bball1:done"), at:{ result:3600 } },
  /* the podium for each shape: a pair's bracket (a split 3rd), four teams
     of three, ties, and the rail of the winner's backers landing */
  { id:"tv-result-pairs-podium", build:() => newest(bracketWonBy("die", "Henry"), "die"), at:{ result:3600 } },
  { id:"tv-result-trivia-podium", build:() => posted("event:trivia:open", "trivia"), at:{ result:3600 } },
  { id:"tv-result-tie-podium", build:() => postedTie("putt"), at:{ result:3600 } },
  { id:"tv-crowned-rest", build:() => fresh("crowned") },
  { id:"tv-crowned-class", build:() => fresh("crowned"), at:{ crown:"class" } },
  ...crownBeats.map(([beat, t]) => ({ id:`tv-crown-${beat}`, build:() => fresh("crowned"), moment:{ kind:"crown", t } })),
  { id:"tv-awards", build:awards, at:{ award:6000 } },
  { id:"tv-geo-guess", build:() => geo("guess"), settle:false },
  { id:"tv-geo-reveal", build:() => geo("reveal"), at:{ geoReveal:9000 }, wait:4500 },
  { id:"tv-geo-final", build:() => geo("final"), at:{ geoReveal:9000 }, wait:4500 },
  { id:"tv-trivia-question", build:() => triviaStage("question"), at:{ trivia:6000 }, wait:1500 },
  { id:"tv-trivia-long", build:() => triviaStage("long"), at:{ trivia:6000 }, wait:1500 },
  { id:"tv-trivia-picture", build:() => triviaStage("picture"), at:{ trivia:6000 }, wait:1500 },
  { id:"tv-trivia-tune", build:() => triviaStage("tune"), at:{ trivia:4000 }, wait:1500 },
  { id:"tv-trivia-number", build:() => triviaStage("number"), at:{ trivia:6000 }, wait:1500 },
  { id:"tv-trivia-reveal", build:() => triviaStage("reveal"), at:{ trivia:4000 }, wait:3000 },
  { id:"tv-trivia-number-reveal", build:() => triviaStage("number-reveal"), at:{ trivia:4000 }, wait:3000 },
  { id:"tv-trivia-board", build:() => triviaStage("board"), at:{ trivia:3000 }, wait:2500 },
  { id:"tv-trivia-final", build:() => triviaStage("final"), at:{ trivia:3000 }, wait:3000 },
  { id:"tv-walkout", build:() => fresh("event:putt:done"), moment:{ kind:"walkout", t:3000, player:"Brandon" } },
  /* a team's win walks out as the team: the moment is read from the record
     and the win it follows (walkoutView), a pair with no cover, seven with one */
  { id:"tv-walkout-pair", build:() => walkoutRecord(bracketWonBy("die", "Henry"), "Henry"), moment:{ kind:"walkout", t:3000, record:true } },
  { id:"tv-walkout-team7", build:() => teamWinSong(fresh("event:bball5:done"), "bball5"),
    moment:{ kind:"walkout", t:3000, record:true } },
  { id:"tv-faceoff", build:() => fresh("event:pickleball:open"), moment:{ kind:"faceoff", t:5000 } },
  { id:"tv-faceoff-solo", build:() => bracketOf(13), moment:{ kind:"faceoff", t:5000 } },
  /* the draw on the TV for every shape: `draw.step` cards turned (mid),
     none yet (`t` ms before the first turns), or complete. dev/fit-tv.jsx
     moves the event's stamps so the room's clock reads that instant */
  { id:"tv-draw-covered", build:() => fresh("event:pong:open"), draw:{ ev:"pong", t:-6000 }, wait:1400 },
  { id:"tv-draw-playin-mid", build:() => fresh("event:pong:open"), draw:{ ev:"pong", step:1 } },
  { id:"tv-draw-playin", build:() => fresh("event:pong:open"), draw:{ ev:"pong" } },
  { id:"tv-draw-bracket13-mid", build:() => bracketOf(13), draw:{ ev:"bball1", step:3 } },
  { id:"tv-draw-bracket13", build:() => bracketOf(13), draw:{ ev:"bball1" } },
  { id:"tv-draw-bracket7", build:() => bracketOf(7), draw:{ ev:"bball1" } },
  { id:"tv-draw-bracket9", build:() => bracketOf(9), draw:{ ev:"bball1" } },
  { id:"tv-draw-split-mid", build:() => fresh("event:bball5:open"), draw:{ ev:"bball5", step:1 } },
  { id:"tv-draw-split", build:() => fresh("event:bball5:open"), draw:{ ev:"bball5" } },
  { id:"tv-draw-semis", build:() => fresh("event:volley:open"), draw:{ ev:"volley" } },
  { id:"tv-draw-heats-mid", build:() => fresh("event:beerio:open"), draw:{ ev:"beerio", step:2 } },
  { id:"tv-draw-heats", build:() => fresh("event:beerio:open"), draw:{ ev:"beerio" } },
  /* v3.1 comebacks: the underdog's 2:1 on the board and the face-off */
  { id:"tv-comeback-open", build:() => comebackBoard() },
  { id:"tv-comeback-faceoff", build:() => comebackBoard({ bets:false }), moment:{ kind:"faceoff", t:5000 } },
  { id:"tv-bracket9-byes", build:byeBracket },
  /* H10, taught once per TV: two seconds after the face-off lifts (7.1 s),
     the underdog's lamp still breathing on the board, and the bye key in
     the final's column */
  { id:"tv-comeback-teach", build:() => comebackBoard(), at:{ faceoff:9100 } },
  { id:"tv-bracket9-byes-teach", build:byeBracket, at:{ faceoff:9100 } },
  /* a crowded felt on the TV: every bettor's name (descenders too) and the
     "+N" fold stack stand inside the felt, never sliced at its foot */
  { id:"tv-felt-6-3", build:() => matchupBets(6, 3) },
  { id:"tv-felt-9-4", build:() => matchupBets(9, 4) },
  { id:"tv-felt-4-8", build:() => matchupBets(4, 8) },
  { id:"tv-bust", build:() => fresh("poker:live"), moment:{ kind:"bust", t:1500, player:"Richard" } },
  { id:"tv-blinds", build:() => fresh("poker:live"), moment:{ kind:"blinds", t:1500 } },
  { id:"tv-nowplaying", build:() => walkoutRecord(fresh("event:putt:open"), "Richard"), at:{ walkout:12000 } },
  { id:"tv-nowplaying-pair", build:() => walkoutRecord(bracketWonBy("die", "Henry"), "Henry"), at:{ walkout:12000 } },
  { id:"tv-nowplaying-team7", build:() => teamWinSong(fresh("event:bball5:done"), "bball5"), at:{ walkout:12000 } },
  /* team names at their longest on every board that letters them */
  { id:"tv-names-team", build:() => longNames(fresh("event:bball5:open"), "bball5") },
  { id:"tv-names-team4", build:() => longNames(fresh("event:volley:open"), "volley") },
  { id:"tv-names-pairs", build:() => longNames(fresh("event:pickleball:mid"), "pickleball") },
  { id:"tv-names-podium", build:() => longNames(posted("event:bball5:open", "bball5"), "bball5"), at:{ result:3600 } },
  { id:"tv-names-faceoff", build:() => longNames(fresh("event:volley:open"), "volley"), moment:{ kind:"faceoff", t:5000 } },
  { id:"tv-names-nowplaying", build:() => teamWinSong(longNames(fresh("event:bball5:done"), "bball5"), "bball5"),
    at:{ walkout:12000 } },
  /* the towers late in the weekend: every name and count in its own slot */
  { id:"tv-towers-2000-board", build:() => spread(fresh("event:pong:done"), SPREAD_2000), at:{ turn:0 } },
  { id:"tv-towers-2000-result", build:() => spreadPosted("event:putt:open", "putt", SPREAD_2000), at:{ result:9500 } },
  { id:"tv-towers-2000-horizon", build:() => spread(fresh("event:ragecage:open"), SPREAD_2000) },
  { id:"tv-towers-9200-board", build:() => spread(fresh("event:pong:done"), SPREAD_9200), at:{ turn:0 } },
  { id:"tv-towers-9200-result", build:() => spreadPosted("event:putt:open", "putt", SPREAD_9200), at:{ result:9500 } },
  { id:"tv-towers-9200-horizon", build:() => spread(fresh("event:ragecage:open"), SPREAD_9200) },
  { id:"tv-towers-15000-board", build:() => spread(fresh("event:pong:done"), SPREAD_15000), at:{ turn:0 } },
  { id:"tv-towers-15000-result", build:() => spreadPosted("event:putt:open", "putt", SPREAD_15000), at:{ result:9500 } },
  { id:"tv-towers-15000-horizon", build:() => spread(fresh("event:ragecage:open"), SPREAD_15000) },
  /* arrivals: the lobby before the first game is announced (0, 4, 9 and
     12 in, Landed lit on the flights down by 3 PM, and all 13 with the
     mark in the code's place), then the corner plate while anyone is still
     on the way: beside a live board, a big field and the towers' turn */
  { id:"tv-lobby-0", build:() => withArrivals(fresh("locker"), 0), at:{ clock:ARRIVE_CLOCK, turn:0 } },
  { id:"tv-lobby-4", build:() => withArrivals(fresh("locker"), 4), at:{ clock:ARRIVE_CLOCK, turn:0 } },
  { id:"tv-lobby-9", build:() => withArrivals(fresh("locker"), 9), at:{ clock:ARRIVE_CLOCK, turn:0 } },
  { id:"tv-lobby-12", build:() => withArrivals(fresh("locker"), 12), at:{ clock:ARRIVE_CLOCK, turn:0 } },
  { id:"tv-lobby-13", build:() => withArrivals(fresh("locker"), 13, { guest:"here", latestAgo:5000 }), settle:false },
  { id:"tv-arrive-corner", build:() => withArrivals(fresh("event:putt:open"), 9), at:{ clock:ARRIVE_CLOCK } },
  { id:"tv-arrive-corner-4", build:() => withArrivals(fresh("event:die:open"), 4), at:{ clock:ARRIVE_CLOCK } },
  { id:"tv-arrive-corner-board", build:() => withArrivals(fresh("session:fri"), 9), at:{ clock:ARRIVE_CLOCK, turn:0 } },
]);

/* ── the phone ──
   Each state is opened on every tab, at 390x844 and 375x667; `sheets`
   adds the views that live in sheets. viewer: the guest or the commissioner. */
export const PHONE_TABS = Object.freeze(["home", "events", "bets", "weekend"]);
export const PHONE_SCENARIOS = Object.freeze([
  /* Quick Draw: the challenge on your phone, the stance (Ready, then
     waiting), armed, the flash, the result won and lost, and the player
     card's Duel opening the rack */
  { id:"duel-offer", build:() => duelState("offer"), settle:false, tabs:[], sheets:["duel-offer"] },
  { id:"duel-stance", build:() => duelState("stance"), settle:false, tabs:["home"], sheets:["duel"] },
  { id:"duel-waiting", build:() => duelState("waiting"), settle:false, tabs:[], sheets:["duel"] },
  { id:"duel-armed", build:() => duelState("armed"), settle:false, tabs:[], sheets:["duel"] },
  { id:"duel-draw", build:() => duelState("stance"), settle:false, tabs:[], sheets:["duel-go"] },
  { id:"duel-won", build:() => duelState("stance"), settle:false, tabs:[], sheets:["duel-won"] },
  { id:"duel-lost", build:() => duelState("stance"), settle:false, tabs:[], sheets:["duel-lost"] },
  { id:"duel-send", build:() => duelState("none"), tabs:[], sheets:["duel-send"] },
  { id:"locker", build:() => fresh("locker"), sheets:["card", "card-back", "event"] },
  { id:"ffa-open", build:() => fresh("event:putt:open"), sheets:["event"] },
  /* the wide board's rows with the room betting: each backer's own chips */
  { id:"ffa-crowd", build:ffaCrowd, tabs:["bets"] },
  /* Home's live card in your own free-for-all with a saved win song, its
     release suffix and all ("Win and Hit 'Em Up plays") */
  { id:"ffa-song", build:() => withSong(fresh("event:putt:open"), FIT_GUEST), tabs:["home"] },
  /* Home's chip bars on a Saturday-night board: a 15,000 leader and a player below zero */
  { id:"spread-15000", build:() => spread(fresh("event:ragecage:open"), SPREAD_15000), tabs:["home"] },
  /* a pairs bracket on Home: the long pair "Henry Nguyen & Squilliam" beside VS */
  { id:"pairs-open", build:() => fresh("event:die:open"), tabs:["home"] },
  /* the betting sides: 0, 1, 3, 4, 6, 8 and 9 backers a side, both sides mirrored */
  { id:"felt-0-1", build:() => matchupBets(0, 1), tabs:["bets"] },
  { id:"felt-3-1", build:() => matchupBets(3, 1), tabs:["bets"] },
  { id:"felt-6-3", build:() => matchupBets(6, 3), tabs:["bets"] },
  { id:"felt-9-4", build:() => matchupBets(9, 4), tabs:["bets"] },
  { id:"felt-4-8", build:() => matchupBets(4, 8), tabs:["bets"] },
  { id:"bracket-mid", build:() => bracketOf(13, { steps:3 }), sheets:["event"] },
  { id:"team-drawn", build:() => fresh("event:bball5:open"), sheets:["event", "auto"] },
  { id:"result-done", build:() => fresh("event:bball1:done"), sheets:["event-1v1", "sky"] },
  { id:"draft", build:draft, sheets:["draft"] },
  { id:"poker-live", build:() => fresh("poker:live") },
  /* the last card at both phone widths (sheetSizes: its sheets at 375 too) */
  { id:"crowned", build:() => fresh("crowned"), sheets:["lastcard", "card"], sheetSizes:["375"] },
  /* Weekend, the program, mid-weekend: posted plates, a run of photos, and
     the back page's sheets */
  { id:"weekend-mid", build:() => withPhotos(fresh("event:bball1:done"), 9), tabs:["weekend"],
    sheets:["weekend-house", "weekend-rules", "weekend-games", "weekend-game", "weekend-payouts", "weekend-photos"] },
  { id:"gm-open", build:() => fresh("event:putt:open"), viewer:"gm", tabs:["home"], sheets:["event"] },
  { id:"gm-bracket", build:() => bracketOf(13, { steps:3 }), viewer:"gm", tabs:["home"], sheets:["event"] },
  /* Trivia, everyone on their own: the event sheet before it, and its podium of players after */
  { id:"trivia-open", build:() => fresh("event:trivia:open"), tabs:[], sheets:["event"] },
  { id:"trivia-done", build:() => fresh("event:trivia:done"), tabs:[], sheets:["event-trivia"] },
  /* the event sheet before, live and after, as the commissioner sees it */
  { id:"gm-before", build:() => fresh("locker"), viewer:"gm", tabs:["events"], sheets:["event"] },
  { id:"gm-team", build:() => fresh("event:bball5:open"), viewer:"gm", tabs:[], sheets:["event"] },
  { id:"gm-after", build:() => fresh("event:bball1:done"), viewer:"gm", tabs:[], sheets:["event-1v1"] },
  /* the menus and the commissioner's own surfaces: the guest More menu, the
     commissioner menu, the pill's more tray (a beat with a Skip), and QA
     mode on (its dock strip and console) */
  { id:"gm-menus", build:() => fresh("locker"), viewer:"gm", tabs:["home"], sheets:["menu", "gm-menu", "pill-more"] },
  /* the commissioner's menu mid-weekend (a Now section: lock bets, take
     back), with the TV and the Speaker on; the TV sheet idle and with a
     scene playing; the Speaker connected, signed out and not set up */
  { id:"gm-menu-live", build:() => fresh("event:putt:open"), viewer:"gm", show:true, audio:true, spotify:FIT_SPOTIFY.connected,
    tvs:[{ ageMs:1000, sound:"on" }], tabs:[], sheets:["gm-menu", "tv"] },
  { id:"gm-tv-scene", build:() => onTv(fresh("event:bball1:done"), "winner", "bball1"), viewer:"gm", show:true, audio:true,
    spotify:FIT_SPOTIFY.connected, tvs:[{ ageMs:1000, sound:"on" }, { ageMs:1000, sound:"blocked" }], tabs:[], sheets:["tv"] },
  { id:"gm-speaker", build:() => withSongs(fresh("event:putt:open")), viewer:"gm", audio:true, spotify:FIT_SPOTIFY.connected,
    tabs:[], sheets:["speaker"] },
  { id:"gm-speaker-off", build:() => fresh("event:putt:open"), viewer:"gm", audio:true, spotify:FIT_SPOTIFY.disconnected,
    tabs:[], sheets:["speaker"] },
  { id:"gm-speaker-setup", build:() => fresh("locker"), viewer:"gm", audio:true, spotify:FIT_SPOTIFY.setup,
    tabs:[], sheets:["speaker"] },
  { id:"gm-qa", build:() => fresh("event:putt:open"), viewer:"gm", qa:true, tabs:["home", "bets"], sheets:["qa", "pill-more"] },
  { id:"guest-menu", build:() => fresh("event:putt:open"), tabs:[], sheets:["menu"] },
  /* a win song playing on the commissioner's phone: its Stop rides in the
     pill's row (Audio Director on); and one that missed, offered again */
  /* Where and When on a player's phone: a photo up (the full-screen game),
     and after its result posts, when nothing of it may stay on screen */
  { id:"geo-guess", build:() => geo("guess"), settle:false, tabs:["home"] },
  { id:"geo-posted", build:() => { const state = geo("final"); act(state, "geoFinish", { evId:"where" }); return state; }, tabs:["home"] },
  /* Trivia on a player's phone (the guest's own pick open, a few still thinking):
     each format's question, the reveals, the scores; and the game gone once
     its result posts */
  { id:"trivia-question", build:() => triviaStage("question"), settle:false, tabs:["home"] },
  { id:"trivia-long", build:() => triviaStage("long"), settle:false, tabs:["home"] },
  { id:"trivia-picture", build:() => triviaStage("picture"), settle:false, tabs:["home"] },
  { id:"trivia-tune", build:() => triviaStage("tune"), settle:false, tabs:["home"] },
  { id:"trivia-number", build:() => triviaStage("number"), settle:false, tabs:["home"] },
  { id:"trivia-reveal", build:() => triviaStage("reveal"), tabs:["home"] },
  { id:"trivia-number-reveal", build:() => triviaStage("number-reveal"), tabs:["home"] },
  { id:"trivia-board", build:() => triviaStage("board"), tabs:["home"] },
  { id:"trivia-final", build:() => triviaStage("final"), tabs:["home"] },
  { id:"trivia-posted", build:() => { const state = triviaStage("final"); act(state, "triviaFinish", { evId:"trivia" }); return state; },
    tabs:["home"] },
  /* the announcement sheet as betting opens: a free-for-all (Where and
     When), a pairs bracket (Beer Die) and a team game (5v5) */
  { id:"ann-where", build:() => fresh("event:where:open"), settle:false, tabs:[], sheets:["announce"] },
  { id:"ann-pairs", build:() => fresh("event:die:open"), settle:false, tabs:[], sheets:["announce"] },
  { id:"ann-team", build:() => fresh("event:bball5:open"), settle:false, tabs:[], sheets:["announce"] },
  /* the House sheet's flights board: the guest's own legs (codes) beside the
     host's (times only), and the commissioner, who is the host */
  { id:"house-guest", build:() => withFlights(fresh("event:putt:open")), tabs:[], sheets:["weekend-house"] },
  { id:"house-gm", build:() => withFlights(fresh("event:putt:open")), viewer:"gm", tabs:[], sheets:["weekend-house"] },
  { id:"gm-song", build:() => walkoutRecord(fresh("event:putt:done"), "Richard"), settle:false, viewer:"gm", audio:true, tabs:["home"] },
  { id:"gm-song-miss", build:() => missedSong(fresh("event:putt:done"), "Richard"), viewer:"gm", audio:true, tabs:["home"] },
  /* a team's walkout on a teammate's phone (the guest, Squilliam, is on
     both winning sides; another member's song plays): "walkout" lands the
     song on a fresh frame and holds the takeover once it has stamped */
  { id:"walkout-pair", build:() => walkoutRecord(bracketWonBy("die", "Henry"), "Henry"), settle:false, tabs:[], sheets:["walkout"] },
  { id:"walkout-team7", build:() => teamWinSong(fresh("event:bball5:done"), "bball5"), settle:false, tabs:[],
    sheets:["walkout"] },
  /* naming your team: the card on Home (a team of seven, a team of three),
     writing your own, and the longest names on every phone board */
  { id:"name-team7", build:() => fresh("event:bball5:open"), tabs:["home"], sheets:["teamname-write"] },
  { id:"name-team3", build:() => fresh("event:volley:open"), tabs:["home"], sheets:["event"] },
  { id:"names-long", build:() => longNames(fresh("event:volley:open"), "volley"), tabs:["home", "bets"], sheets:["event"] },
  { id:"names-long-pairs", build:() => longNames(fresh("event:pickleball:mid"), "pickleball"), tabs:["bets"], sheets:["event"] },
  { id:"gm-names", build:() => fresh("event:volley:open"), viewer:"gm", tabs:[], sheets:["event"] },
  /* v3.1: the crew check before a draw and an underdog board */
  { id:"gm-crew-check", build:crewBeat, viewer:"gm", tabs:["home"], sheets:["crew-check"] },
  { id:"gm-crew-sitout", build:crewBeat, viewer:"gm", tabs:[], sheets:["crew-sitout"] },
  { id:"draw-replay", build:() => fresh("event:volley:open"), tabs:[], sheets:["draw-replay-mid", "draw-replay"] },
  /* winner entry: the two filled sides, then a tap lands WON with the 10 s Undo */
  { id:"gm-winner", build:winnerBeat, viewer:"gm", tabs:["home"], sheets:["pill-win"] },
  /* a market just opened with no bets in: Lock and start waits quiet, its
     amber lamp draining, the bets lamp unlit (ZERO_BET_WAIT_MS) */
  { id:"gm-lock-empty", build:() => {
    const state = comebackBoard({ bets:false });
    /* the audit shoots minutes after the build: hold the opening ahead of
       the wall clock so the wait is still running when the shot is taken */
    state.eventOps.die.bettingOpenedAt = Date.now() + 10 * 60000;
    return state;
  }, viewer:"gm", tabs:["home"] },
  /* a heat's winner: the pill's field of racers (a tap lands WON), the
     sheet's tiles, and the stage final's podium with 1st tapped in */
  { id:"gm-heats", build:heatLive, viewer:"gm", tabs:["home"], sheets:["event", "pill-win"] },
  { id:"gm-heats-final", build:heatFinal, viewer:"gm", tabs:["home"], sheets:["event", "heat-order"] },
  { id:"comeback-board", build:() => comebackBoard(), tabs:["home", "bets"], sheets:["card"] },
  /* the first underdog a phone shows: its drawing opens by itself, once */
  { id:"comeback-teach", build:() => comebackBoard(), teach:true, tabs:["bets"] },
  { id:"bracket9-byes", build:byeBracket, tabs:[], sheets:["event"] },
  /* a guest still in Safari: the Add to Home Screen card on Home, the steps
     opened on Weekend; and the profile sheet with its card on show */
  { id:"install-card", build:() => fresh("event:putt:open"), install:true, tabs:["home"], sheets:["install-open", "profile"] },
  /* arrivals (Oct 4): before check-in opens nothing is new; in the lobby
     the guest still on the way gets Scan the TV at the top of Home, and its
     scanner: looking (a camera frame with no code), the TV's code read and
     the chip seated, and the camera blocked. Once a game is announced it is
     a row lettered into the contest's painting. Once in, Home is Home with
     the road's faces unlit on the board */
  { id:"arrive-before", build:() => fresh("locker"), tabs:["home"] },
  { id:"arrive-lobby", build:() => withArrivals(fresh("locker"), 4), tabs:["home"],
    sheets:["scan-open", "scan-success", "scan-denied"] },
  { id:"arrive-row", build:() => withArrivals(fresh("event:putt:open"), 9), tabs:["home"] },
  { id:"arrive-here-9", build:() => withArrivals(fresh("event:putt:open"), 9, { guest:"here" }), tabs:["home"] },
  { id:"arrive-here-13", build:() => withArrivals(fresh("locker"), 13, { guest:"here" }), tabs:["home"] },
  /* the commissioner: Who is coming with the door shut and open, the
     travel board's arrivals, and the crew check with four on the way */
  { id:"gm-roster", build:() => fresh("locker"), viewer:"gm", tabs:[], sheets:["roster"] },
  { id:"gm-roster-door", build:() => withArrivals(fresh("locker"), 9), viewer:"gm", tabs:[], sheets:["roster", "travel-sheet"] },
  { id:"gm-crew-road", build:crewRoad, viewer:"gm", tabs:[], sheets:["crew-check"] },
]);
export const PHONE_SIZES = Object.freeze([{ w:390, h:844, id:"390" }, { w:375, h:667, id:"375" }]);

/* A steady view: the room has sat in this state a while, so a just-decided
   contest's card and a new leader's banner have had
   their moment. Every server stamp moves back by `ms`. */
export const SETTLE_MS = 120000;
export function aged(state, ms = SETTLE_MS) {
  const walk = node => {
    if (Array.isArray(node)) { node.forEach((v, i) => { if (typeof v === "number" && v > 1.6e12 && v < 2.2e12) node[i] = v - ms; else if (v && typeof v === "object") walk(v); }); return; }
    for (const [k, v] of Object.entries(node)) {
      if (typeof v === "number" && v > 1.6e12 && v < 2.2e12) node[k] = v - ms;
      else if (v && typeof v === "object") walk(v);
    }
  };
  walk(state);
  return state;
}

export function buildScenario(list, id) {
  const spec = list.find(item => item.id === id);
  if (!spec) throw new Error(`Unknown fit scenario ${id}`);
  const built = spec.build();
  const settled = spec.settle === false || spec.at || spec.moment || spec.draw ? built : aged(built);
  return { ...spec, state:dress(settled) };
}

/* the newest result's posting time (the TV's result moment anchor) */
export function latestPostedAt(state) {
  return Math.max(0, ...Object.values(state.results || {}).map(res => Number(res?.confirmedAt || res?.ts) || 0));
}
