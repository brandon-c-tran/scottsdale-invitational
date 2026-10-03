/* Where and When: the commissioner's photos from the group's past, played
   live on the TV. Each round shows one photo; every player drops a pin where
   it was taken and picks the date and hour; the reveal scores both.

   Two keys:
   - `state.geoRounds` is the commissioner's authored game: [{ id, photo:{ id,
     w, h }, lat, lng, place, when:"YYYY-MM-DDTHH", caption }]. Configuration,
     kept by a progress reset like the slate. Answers are the commissioner's
     until each round is revealed.
   - `state.geo` is the game in progress: { eventId, order:[roundId], index,
     phase:"guess"|"reveal"|"done", startedAt, closesAt, revealedAt, author,
     guesses:{ [roundId]:{ [player]:{ lat, lng, when, at } } } }. Progress,
     cleared by a reset.

   A time is the photo's local wall clock ("2019-07-04T21"), never a moment
   in UTC: a guess and an answer are both read as where they happened, so no
   time zone enters the game. Pure. */

export const GEO_MAX_ROUNDS = 25;
export const GEO_ROUND_MS = 60 * 1000;
/* a guess that left the phone as time ran out still counts */
export const GEO_GRACE_MS = 3000;
export const GEO_POINTS = 5000;
/* GeoGuessr's shape in miles: 10 mi off scores about 4,700, 100 mi 2,600,
   1,000 mi almost nothing */
export const GEO_MILES_SCALE = 155;
/* a day off scores about 4,960, a month 3,900, a year 240 */
export const GEO_HOURS_SCALE = 120 * 24;
export const GEO_PLACE_MAX = 60;
export const GEO_CAPTION_MAX = 140;

const WHEN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})$/;
const ROUND_ID = /^g[a-z0-9]{6,32}$/;
export const geoRoundId = value => typeof value === "string" && ROUND_ID.test(value);
export const geoPhotoId = geoRoundId;

/* "YYYY-MM-DDTHH" on the wall clock, or null */
export function cleanWhen(value) {
  const match = typeof value === "string" ? WHEN.exec(value) : null;
  if (!match) return null;
  const [, y, m, d, h] = match.map(Number);
  if (y < 1950 || y > 2030 || m < 1 || m > 12 || h > 23) return null;
  const date = new Date(Date.UTC(y, m - 1, d, h));
  if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return value;
}
/* hours since the epoch on a naive wall clock: only differences matter */
const wallHours = when => {
  const [, y, m, d, h] = WHEN.exec(when).map(Number);
  return Date.UTC(y, m - 1, d, h) / 3_600_000;
};
export const hoursApart = (a, b) => Math.abs(wallHours(a) - wallHours(b));

export function cleanPoint(lat, lng) {
  const la = Number(lat), ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln) || Math.abs(la) > 90 || Math.abs(ln) > 180) return null;
  return { lat:Math.round(la * 1e5) / 1e5, lng:Math.round(ln * 1e5) / 1e5 };
}

export function milesApart(a, b) {
  const rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const whereScore = miles => Math.round(GEO_POINTS * Math.exp(-Math.max(0, miles) / GEO_MILES_SCALE));
export const whenScore = hours => Math.round(GEO_POINTS * Math.exp(-Math.max(0, hours) / GEO_HOURS_SCALE));

/* one guess against one answer; a part left unset scores nothing */
export function scoreGuess(round, guess) {
  if (!round || !guess) return { where:0, when:0, total:0, miles:null, hours:null };
  const pinned = Number.isFinite(guess.lat) && Number.isFinite(guess.lng);
  const timed = typeof guess.when === "string" && !!cleanWhen(guess.when);
  const miles = pinned ? milesApart(round, guess) : null;
  const hours = timed ? hoursApart(round.when, guess.when) : null;
  const where = pinned ? whereScore(miles) : 0, when = timed ? whenScore(hours) : 0;
  return { where, when, total:where + when, miles, hours };
}

/* the round the room is on */
export const geoCurrentId = geo => geo?.order?.[geo.index] ?? null;
/* rounds whose answer is out: every one before the current, and the
   current once revealed */
export function geoRevealedIds(geo) {
  if (!geo?.order) return [];
  const upto = geo.phase === "guess" ? geo.index : geo.index + 1;
  return geo.order.slice(0, Math.max(0, upto));
}
/* rounds whose photo has been shown */
export const geoShownIds = geo => geo?.order ? geo.order.slice(0, Math.min(geo.order.length, geo.index + 1)) : [];

export const geoLastRound = geo => !!geo?.order && geo.index >= geo.order.length - 1;

/* who plays: everyone present and active, never the author */
export function geoPlayers(state, roster, { isActivePlayer = () => true, isAway = () => false } = {}) {
  const author = state?.geo?.author || null;
  return roster.filter(player => isActivePlayer(player) && !isAway(state, player) && player !== author);
}

/* Totals over the revealed rounds, best first. A tie breaks on more points
   for where, then on the faster guesses (an earlier sum of guess times). */
export function geoStandings(geo, rounds, players) {
  const byId = new Map((rounds || []).map(round => [round.id, round]));
  const rows = players.map(player => ({ player, total:0, where:0, when:0, speed:0, guessed:0 }));
  const index = new Map(rows.map(row => [row.player, row]));
  for (const id of geoRevealedIds(geo)) {
    const round = byId.get(id);
    if (!round) continue;
    for (const [player, guess] of Object.entries(geo.guesses?.[id] || {})) {
      const row = index.get(player);
      if (!row) continue;
      const score = scoreGuess(round, guess);
      row.total += score.total; row.where += score.where; row.when += score.when;
      row.speed += Number(guess.at) || 0; row.guessed += 1;
    }
  }
  rows.sort((a, b) => b.total - a.total || b.where - a.where || a.speed - b.speed || a.player.localeCompare(b.player));
  let rank = 0;
  rows.forEach((row, i) => {
    const prev = rows[i - 1];
    rank = prev && prev.total === row.total && prev.where === row.where && prev.speed === row.speed ? rank : i + 1;
    row.rank = rank;
  });
  return rows;
}

/* the event result: a single winner, then 2nd and 3rd (a full tie shares) */
export function geoResultSlots(rows) {
  const order = rows.filter(row => row.guessed > 0);
  if (!order.length) return null;
  /* first place is one player (the ranking already broke ties); the next
     two ranks below them fill 2nd and 3rd, a shared rank sharing its slot */
  const rest = order.slice(1);
  const ranks = [...new Set(rest.map(row => row.rank))].slice(0, 2);
  return [[order[0].player], ...ranks.map(rank => rest.filter(row => row.rank === rank).map(row => row.player))];
}

/* The director's beat while a Where and When event is under way and has
   rounds: start, reveal each photo, next, then post the result. Null when
   the ordinary result entry applies. */
export function geoBeat(state, ev) {
  const rounds = state?.geoRounds || [];
  if (ev?.game !== "where" || !rounds.length || state?.results?.[ev.id]) return null;
  const geo = state.geo?.eventId === ev.id && state.geo.order ? state.geo : null;
  if (!geo) return { type:"geo-start", label:"Start game", subject:ev.name };
  const roundId = geoCurrentId(geo);
  const photo = `Photo ${geo.index + 1} of ${geo.order.length}`;
  if (geo.phase === "guess") return { type:"geo-reveal", label:"Reveal", subject:photo, roundId };
  if (geo.phase === "reveal" && !geoLastRound(geo)) return { type:"geo-next", label:"Next photo", subject:photo, roundId };
  return { type:"geo-finish", label:"Post result", subject:ev.name };
}

/* What a phone or the TV is sent. The commissioner gets everything. Anyone
   else gets the rounds shown so far (an answer only once revealed), their
   own guesses, everyone's guesses on revealed rounds, and how many have
   guessed the current one. */
export function projectGeo(geo, rounds, { isGm = false, player = null } = {}) {
  if (isGm) return { geo:geo || null, geoRounds:rounds || [] };
  if (!geo?.order) return { geo:null, geoRounds:[] };
  const revealed = new Set(geoRevealedIds(geo));
  const byId = new Map((rounds || []).map(round => [round.id, round]));
  const shown = geoShownIds(geo).map((id, n) => {
    const round = byId.get(id);
    if (!round) return null;
    const base = { id, n:n + 1, photo:round.photo };
    return revealed.has(id) ? { ...base, lat:round.lat, lng:round.lng, place:round.place, when:round.when,
      ...(round.caption ? { caption:round.caption } : {}) } : base;
  }).filter(Boolean);
  const guesses = {};
  for (const [id, byPlayer] of Object.entries(geo.guesses || {})) {
    if (revealed.has(id)) guesses[id] = byPlayer;
    else if (player && byPlayer?.[player]) guesses[id] = { [player]:byPlayer[player] };
  }
  const current = geoCurrentId(geo);
  /* who has locked in on the current photo and who is still working on a
     guess, never where or when */
  const entries = Object.entries(geo.guesses?.[current] || {});
  const lockedIn = entries.filter(([, guess]) => guess?.done).map(([name]) => name);
  const drafting = entries.filter(([, guess]) => !guess?.done).map(([name]) => name);
  return {
    geo:{ ...geo, guesses, total:geo.order.length, order:geo.order.slice(0, geo.index + 1),
      guessed:lockedIn.length, lockedIn, drafting },
    geoRounds:shown,
  };
}
