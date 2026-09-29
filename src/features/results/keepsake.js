/* D7 "The weekend, kept": everything Weekend's edition section shows once
   the board is frozen, derived from the frozen state and never stored. The
   plates, the brackets' existence, the lead's path and every player's last
   card are read the same way the live surfaces read them, so a correction
   after the crown restamps all of it and the page keeps working long after
   the weekend (nothing here reads a clock, a socket or a live contest). */

import { EDITION, SESSIONS, START, allEventsOf, computeStandings, disp, teamLabel } from "../../../shared/core.js";
import { chipHistory, lastCardModel } from "./lastCard.js";

export const KEPT_SECTION = "kept";
/* the section exists only once the board is frozen */
export const keepsakeOpen = state => !!state?.frozen;

const SESSION_NAMES = Object.freeze({ fri:"Friday", sam:"Saturday morning", sap:"Saturday afternoon",
  san:"Saturday night", fin:"Finale" });
const PLACE_NAMES = ["1st", "2nd", "3rd"];

/* The team (or teams: a bracket's two semifinal losers share 3rd) a placed
   group played as, when the draw's teams hold exactly those players. */
function placedTeam(state, evId, players) {
  if (players.length < 2) return null;
  const teams = (state.draws?.[evId]?.teams || []).filter(team => team?.players?.some(player => players.includes(player)));
  const covered = teams.reduce((sum, team) => sum + team.players.length, 0);
  if (!teams.length || covered !== players.length || !teams.every(team => team.players.every(player => players.includes(player))))
    return null;
  return teams.map(team => teamLabel(state, team)).join(" · ");
}

/* One plate per event on the slate (not the finale, not a skipped event),
   in slate order: its final order as places, and whether it has a bracket
   to open. Blank until its result posts. */
export function keptPlates(state, events = allEventsOf(state)) {
  return events.filter(ev => !ev.finale && !state?.shelved?.[ev.id]).map(ev => {
    const result = state.results?.[ev.id] || null;
    const places = [];
    (result?.slots || []).forEach((players, place) => {
      const list = (players || []).filter(Boolean);
      if (!list.length) return;
      places.push({ place, label:PLACE_NAMES[place] || `${place + 1}th`, players:list,
        team:placedTeam(state, ev.id, list) });
    });
    const placed = new Set(places.flatMap(item => item.players));
    const crew = result ? (state.draws?.[ev.id]?.roles || []).map(role => role?.player)
      .filter(player => player && !placed.has(player)) : [];
    return {
      eventId:ev.id, name:ev.name, game:ev.game || ev.id, session:ev.session,
      sessionName:SESSION_NAMES[ev.session] || "",
      posted:!!places[0]?.players.length, places, crew,
      winners:places[0]?.place === 0 ? places[0].players : [],
      bracket:!!(state.brackets?.[ev.id] && state.draws?.[ev.id]?.teams),
    };
  });
}

/* Who led the board after every write of the weekend. Each player's
   chipHistory is replayed on one shared timeline; a tie keeps whoever led
   into it. The first point is the 1,000 everyone starts with (nobody leads)
   and the last is the board: its leaders are the standings' first place. */
export function leadPath(state, events = allEventsOf(state), standings = computeStandings(state)) {
  const players = standings.map(row => row.player);
  const histories = new Map(players.map(player => [player, chipHistory(state, player, events).filter(step => !step.start)]));
  const times = [...new Set([...histories.values()].flatMap(steps => steps.map(step => step.at)))].sort((a, b) => a - b);
  const cursor = new Map(players.map(player => [player, 0]));
  const pts = new Map(players.map(player => [player, START]));
  const steps = [{ at:0, pts:START, leaders:[...players], leader:null, session:SESSIONS[0]?.id || "fri", tied:true }];
  for (const at of times) {
    let session = null;
    for (const player of players) {
      const list = histories.get(player);
      let i = cursor.get(player);
      while (i < list.length && list[i].at <= at) {
        pts.set(player, list[i].pts);
        if (list[i].at === at && !session) session = list[i].session;
        i++;
      }
      cursor.set(player, i);
    }
    const top = Math.max(...players.map(player => pts.get(player)));
    const leaders = players.filter(player => pts.get(player) === top);
    const before = steps[steps.length - 1];
    const leader = before.leader && leaders.includes(before.leader) ? before.leader : leaders[0];
    if (before.leader === leader && before.pts === top && before.leaders.length === leaders.length) continue;
    steps.push({ at, pts:top, leaders, leader, session:session || before.session, tied:leaders.length > 1 });
  }
  const changes = [];
  steps.forEach((step, index) => {
    if (step.leader && step.leader !== steps[index - 1]?.leader) changes.push({ index, player:step.leader, at:step.at, pts:step.pts });
  });
  const led = new Set(changes.map(change => change.player));
  return { steps, changes, leadChanges:Math.max(0, changes.length - 1), leaders:[...led] };
}

/* D6's superlatives, when that feature has put revealed results in state.
   Read defensively: this file does not own the awards shape, and nothing
   shows until an award is revealed. Accepts `state.awards.results`
   ([{ title, winners }]) or revealed prompts in `state.prompts` carrying
   per-nominee totals. Voters are never read. */
export function keptAwards(state) {
  const out = [];
  const push = (id, title, winners, totals = null) => {
    const list = (winners || []).filter(player => typeof player === "string" && player);
    if (!title || !list.length) return;
    out.push({ id:String(id ?? out.length), title:String(title), winners:list, tie:list.length > 1, totals });
  };
  const direct = state?.awards?.results;
  if (Array.isArray(direct)) direct.forEach((award, index) => push(award?.id ?? index, award?.title, award?.winners));
  const prompts = Array.isArray(state?.prompts) ? state.prompts : Object.values(state?.prompts || {});
  for (const prompt of prompts) {
    if (!prompt || typeof prompt !== "object") continue;
    const revealed = prompt.revealed === true || prompt.status === "revealed" || Number(prompt.revealedAt) > 0;
    if (!revealed) continue;
    if (Array.isArray(prompt.winners)) { push(prompt.id, prompt.title, prompt.winners); continue; }
    const totals = prompt.totals || prompt.results || prompt.tally;
    if (!totals || typeof totals !== "object") continue;
    const counts = Object.entries(totals).map(([player, n]) => [player, Number(n) || 0]).filter(([, n]) => n > 0);
    if (!counts.length) continue;
    const top = Math.max(...counts.map(([, n]) => n));
    push(prompt.id, prompt.title, counts.filter(([, n]) => n === top).map(([player]) => player), Object.fromEntries(counts));
  }
  return out;
}

/* The whole section. Cards are in final standings order. */
export function keepsakeModel(state, { events = allEventsOf(state), standings = computeStandings(state) } = {}) {
  if (!keepsakeOpen(state)) return null;
  const cards = standings.map(row => lastCardModel(state, row.player, { events, standings })).filter(Boolean);
  const champions = standings.filter(row => row.rank === 1)
    .map(row => ({ player:row.player, name:disp(state, row.player), pts:row.pts }));
  const plates = keptPlates(state, events);
  return {
    title:EDITION.label || `${EDITION.name} · ${EDITION.year}`,
    dates:EDITION.long,
    champions, cards, plates,
    posted:plates.filter(plate => plate.posted).length,
    lead:leadPath(state, events, standings),
    awards:keptAwards(state),
  };
}
