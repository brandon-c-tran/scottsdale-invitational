import { coalescePendingReveals, disp, ROUND_NAMES, resolveSlot, stageEntrantView, teamLabel } from "../../../shared/core.js";

/* A draw reveal only matters while its event is still ahead. Events that
   started, posted, or were shelved retire their ceremony silently; an
   unannounced event's draw plays only if it is current, on deck, or fresh.
   Anything else stays pending (not seen) so its announcement can still play
   it. Replay draw on the event sheet is unaffected. */
export const REVEAL_FRESH_MS = 2 * 60 * 1000;
const revealTime = (state, evId, item) => Number(item.ts) || Number(state.eventOps?.[evId]?.drawRevealedAt)
  || parseInt(String(item.id).replace(/^\D+/, ""), 10) || 0;
export function filterRevealCandidates(state, { seen = [], now = Date.now(), current = null } = {}) {
  const seenIds = new Set(seen), retire = [], draws = {}, stages = {};
  const sort = (map, out) => Object.entries(map || {}).forEach(([evId, item]) => {
    if (!item?.id || seenIds.has(item.id)) return;
    if (state.results?.[evId] || state.shelved?.[evId] || state.eventOps?.[evId]?.startedAt) {
      retire.push(item.id);
      return;
    }
    if (evId === state.onDeck || evId === current || now - revealTime(state, evId, item) <= REVEAL_FRESH_MS)
      out[evId] = item;
  });
  sort(state.draws, draws);
  sort(state.stages, stages);
  return { draws, stages, retire };
}

// Presentation only. Replaying reads the saved assignment; it never runs a draw.
export function buildEventReveal(state, ev, kind) {
  if (!ev) return null;
  const draw = state.draws?.[ev.id], stage = state.stages?.[ev.id];
  const source = kind || coalescePendingReveals(
    draw ? { [ev.id]:draw } : {}, stage ? { [ev.id]:stage } : {}, [], ev.id,
  ).latest?.kind;
  if (source === "stage" && stage) return {
    id:stage.id, evId:ev.id, title:stage.kind === "heats" ? "The heats" : "The pools", subtitle:ev.name,
    groups:stage.groups.map(group => ({ title:group.name, lines:group.entrants.map(key => {
      const entrant = stageEntrantView(state, stage, key);
      return { avatars:[...entrant.players], text:entrant.name };
    }) })), versus:null, crew:stage.roles || (stage.drawId && draw?.id === stage.drawId ? draw.roles : null) || [],
  };
  if (source !== "draw" || !draw) return null;
  const bracket = state.brackets?.[ev.id];
  let groups = null;
  if (draw.teams.length !== 2 && bracket) {
    const names = ROUND_NAMES[bracket.size] || [], seated = new Set();
    const line = index => ({ avatars:[...draw.teams[index].players], text:teamLabel(state, draw.teams[index]) });
    groups = [];
    bracket.rounds[0].forEach((match, index) => {
      const a = resolveSlot(bracket, match.a), b = resolveSlot(bracket, match.b);
      if (a === null || b === null) return;
      seated.add(a); seated.add(b);
      groups.push({ title:`${names[0] || "Round 1"}${bracket.rounds[0].length > 1 ? ` ${index + 1}` : ""}`,
        vs:true, lines:[line(a), line(b)] });
    });
    const byes = draw.teams.map((_, index) => index).filter(index => !seated.has(index));
    if (byes.length) groups.push({ title:names[1] ? `Straight to the ${names[1].toLowerCase()}` : "Bye", lines:byes.map(line) });
  } else if (draw.teams.length !== 2) {
    groups = draw.teams.map(team => ({ title:teamLabel(state, team),
      lines:team.players.map(player => ({ avatars:[player], text:disp(state, player) })) }));
  }
  return { id:draw.id, evId:ev.id, title:"The draw", subtitle:ev.name, groups,
    versus:draw.teams.length === 2 ? draw.teams : null, crew:draw.roles || [] };
}

export function drawRevealGroups(state, reveal) {
  return reveal.versus ? reveal.versus.map((team, index) => ({
    title:team.name || `Team ${index + 1}`,
    lines:[{ avatars:team.players, text:team.players.map(player => disp(state, player)).join(" & ") }],
  })) : reveal.groups || [];
}

// A bounded reveal clock shared by the component and its deterministic tests.
// Cancelled callbacks are inert even if the browser had already queued them.
export function startDrawPlayback({ total, reducedMotion = false, onStep, schedule = setTimeout, cancel = clearTimeout }) {
  let active = true;
  const timers = [];
  const stop = () => { active = false; timers.forEach(cancel); };
  const skip = () => { stop(); onStep(total); };
  if (reducedMotion || total === 0) onStep(total);
  else {
    onStep(0);
    for (let index = 0; index < total; index++) {
      const delay = 480 + index * Math.min(680, 2900 / Math.max(1, total - 1));
      timers.push(schedule(() => { if (active) onStep(index + 1); }, delay));
    }
  }
  return { stop, skip };
}
