/* X8: what a win means for the standings, one line per side of the current
   contest ("Win: Sahil to 1st", "Win: Evan and Ben +400"). Pure, shared by
   the phone (Home, Bets) and the TV live scene.

   Only the contest's own effects count: the event result a win would post,
   derived through the same resultAwards / computeStandings every surface
   reads. A win that posts nothing (a play-in, a semifinal, a heat) says
   nothing, so its line is omitted. Wagers are never part of it: a backer's
   ticket is the backer's, not the side's, and every ticket still pending is
   left out of both sides of the comparison. */

import {
  awardTable, allEventsOf, computeStandings, disp, resolveSlot, resolveWager, teamLabel,
} from "../../../shared/core.js";

const known = key => key !== null && key !== undefined;
export const ordinal = n => {
  const tail = n % 100;
  if (tail >= 11 && tail <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] || "th"}`;
};
const fmt = n => (n ?? 0).toLocaleString("en-US");

/* "Sahil", "Evan and Ben", "Evan, Ben and Adi" */
export function joinNames(names) {
  if (names.length <= 1) return names[0] || "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/* The result slots this side's win would post, or null when the win posts
   nothing. Mirrors how the server places a contest (contestPlacement): a
   bracket final places champion, runner-up and the semifinal losers; a stage
   final and a wide field only guarantee the winner's 1st; a two-sided field
   also fixes 2nd. */
export function winSlots(state, ev, contest, sideKey) {
  if (!ev || !contest || ev.finale || !(awardTable(ev)[0] > 0)) return null;
  const side = contest.sides?.find(item => item.key === sideKey);
  if (!side?.players?.length) return null;
  const table = awardTable(ev);
  if (contest.kind === "match") {
    const br = state.brackets?.[ev.id], draw = state.draws?.[ev.id];
    if (!br || !draw?.teams || !Array.isArray(contest.match)) return null;
    const [r] = contest.match;
    if (r !== br.rounds.length - 1) return null;
    const runner = contest.sides.find(item => item.key !== sideKey);
    const before = br.rounds.length > 1 ? br.rounds[br.rounds.length - 2] : [];
    const third = before.map(match => [resolveSlot(br, match.a), resolveSlot(br, match.b)]
      .find(key => known(key) && known(match.winner) && key !== match.winner))
      .filter(key => known(key) && draw.teams[key]);
    return [[...side.players],
      table[1] > 0 && runner ? [...runner.players] : [],
      table[2] > 0 ? third.flatMap(key => draw.teams[key].players) : []];
  }
  if (contest.kind === "stage-final") return [[...side.players], [], []];
  if (contest.kind === "ffa") {
    const other = contest.sides.length === 2 ? contest.sides.find(item => item.key !== sideKey) : null;
    return [[...side.players], table[1] > 0 && other ? [...other.players] : [], []];
  }
  return null;
}

/* One line per side: { key, text, kind:"rank"|"chips", rank?, award?, players }
   or null for a side whose win changes nothing. `standings` is the current
   board (computeStandings(state)); pass it when the caller already has it. */
export function contestWinLines(state, ev, contest, { events = allEventsOf(state), standings, keys = null } = {}) {
  if (!state || !ev || !contest?.sides?.length) return [];
  const settled = (state.wagers || []).filter(w => resolveWager(state, w, events).status !== "pending");
  const base = { ...state, wagers:settled };
  const beforeRows = standings || computeStandings(state);
  const before = new Map(beforeRows.map(row => [row.player, row]));
  return contest.sides.map(side => {
    if (keys && !keys.includes(side.key)) return null;
    const slots = winSlots(state, ev, contest, side.key);
    if (!slots) return null;
    const after = computeStandings({ ...base, results:{ ...(state.results || {}),
      [ev.id]:{ slots, ts:0, revision:1 } } });
    const afterBy = new Map(after.map(row => [row.player, row]));
    const players = side.players.filter(p => before.has(p) && afterBy.has(p));
    if (!players.length) return null;
    const movers = players.filter(p => afterBy.get(p).rank < before.get(p).rank);
    if (movers.length) {
      const best = Math.min(...movers.map(p => afterBy.get(p).rank));
      const group = movers.filter(p => afterBy.get(p).rank === best);
      const shared = after.filter(row => row.rank === best).length > group.length;
      const whole = group.length === side.players.length && group.length > 2;
      const names = whole ? teamLabel(state, { players:side.players, name:state.draws?.[ev.id]?.teams?.[side.key]?.name })
        : joinNames(group.map(p => disp(state, p)));
      const plural = group.length > 1 && !whole;
      const text = shared ? `Win: ${names} ${plural ? "tie" : "ties"} for ${ordinal(best)}` : `Win: ${names} to ${ordinal(best)}`;
      return { key:side.key, kind:"rank", rank:best, tied:shared, players:group, text };
    }
    const award = afterBy.get(players[0]).pts - before.get(players[0]).pts;
    if (!(award > 0)) return null;
    const names = players.length > 2
      ? teamLabel(state, { players, name:state.draws?.[ev.id]?.teams?.[side.key]?.name })
      : joinNames(players.map(p => disp(state, p)));
    return { key:side.key, kind:"chips", award, players, text:`Win: ${names} +${fmt(award)}` };
  });
}

/* The line for one side key, from contestWinLines' output. */
export const winLineFor = (lines, key) => (lines || []).find(line => line && line.key === key) || null;
