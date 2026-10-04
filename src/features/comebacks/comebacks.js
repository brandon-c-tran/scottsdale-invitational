/* Comebacks, as every surface reads them (v3.1). Pure: the rules live in
   shared/core.js (bountyFor, bountyAwards, oddsFor, seedBracket); this says
   what to light and what to letter, so the phone, the TV and the pill agree. */
import {
  BOUNTY_PTS, ROSTER, allEventsOf, bountyAwards, bountyFor, bountyLeaders, computeStandings, contestSideMults,
  pokerLive, resolveCurrentContest, resolveWeekendOperation, stacksPosted,
} from "../../../shared/core.js";

/* the payout copy, always this shape */
export const payLine = mult => `Winner pays ${Number(mult) || 1}:1`;
export const bountyLine = (pts = BOUNTY_PTS) => `Bounty +${pts}`;

/* the players a contest carries a bounty on: its stamp once betting locks,
   else the board's leaders who play in it as it stands */
export function contestBountyPlayers(state, contest, rows) {
  if (!contest) return [];
  if (contest.bounty) return [...contest.bounty.players];
  return bountyFor(state, contest, rows)?.players || [];
}

/* Per side: what it pays and whether it faces (or holds) the bounty. A wide
   field lights only the leader's own side; a two-sided contest letters the
   bounty on the side facing them. */
export function contestTerms(state, contest, rows) {
  if (!contest) return null;
  const mults = contestSideMults(contest);
  const odds = !!contest.odds;
  const wanted = contestBountyPlayers(state, contest, rows);
  const wide = (contest.sides || []).length > 2;
  const sides = {};
  for (const side of contest.sides || []) {
    const holds = side.players.some(player => wanted.includes(player));
    sides[side.key] = {
      mult:mults[side.key],
      payLine:odds ? payLine(mults[side.key]) : null,
      underdog:odds && contest.odds.underdog === side.key,
      holdsBounty:holds,
      bounty:!holds && wanted.length > 0 && !wide ? BOUNTY_PTS : 0,
    };
  }
  return { odds, wide, bounty:wanted.length ? { players:wanted, pts:BOUNTY_PTS, stamped:!!contest.bounty } : null,
    sides, any:odds || wanted.length > 0 };
}

/* The players the standings light as wanted: a locked contest's stamped
   bounty, else the live leaders. Nothing before the weekend, while the board
   is level, once the finale deals, or frozen. */
export function boardBounty(state, events = allEventsOf(state), rows = computeStandings(state)) {
  if (!state?.live || state.frozen || state.poker || pokerLive(state) || stacksPosted(state)) return [];
  const ev = resolveWeekendOperation(state, events).event;
  const contest = ev && !ev.finale ? resolveCurrentContest(state, ev) : null;
  if (contest?.bounty) return [...contest.bounty.players];
  const leaders = bountyLeaders(state, rows);
  const present = rows.filter(row => !state.away?.[row.player]);
  return leaders.length && leaders.length < Math.max(2, present.length) && leaders.length < ROSTER.length ? leaders : [];
}

/* every bounty one player collected, newest first: { eventId, pts, at, from } */
export const bountiesFor = (state, player, events = allEventsOf(state)) =>
  bountyAwards(state, events).filter(item => item.player === player).sort((a, b) => b.at - a.at);
