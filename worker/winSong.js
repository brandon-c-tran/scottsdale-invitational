/* Which win song a write owes, from the board before and after it.
   Pure: no storage, no network, no clock beyond what it is given.

   The song is a player's saved track (profiles[p].walkoutTrack, shown to
   guests as "Win song"). Four moments play one:
   - a team MVP vote closing (shared/mvp.js): the MVP's song for
     WIN_SONG_CLIP_MS, marked `mvp` so the TV names them MVP. A team that
     votes gets no song when it wins; its song waits for the vote;
   - a recorded contest winner (a bracket match, a heat, a stage final): the
     winning side's song for the same clip;
   - an event result posted without a contest (a free-for-all): first
     place's song;
   - the crown: the champion's whole song. A tie crowns nobody's.
   A side of more than one (a duo, or a team between its bracket rounds)
   plays one member's song, drawn from those who saved one. The draw is
   seeded by the win's key, so a retried write draws the same member. */

import { allEventsOf, computeStandings, isActivePlayer, resolveCurrentContest } from "../shared/core.js";
import { WIN_SONG_CLIP_MS } from "../shared/audio.js";

export { WIN_SONG_CLIP_MS };
/* writes that take a win back stop the song it started */
export const WIN_SONG_STOP_ACTIONS = new Set(["correctContest", "undoLastContest", "clearResult", "setFrozen"]);

const songOf = (state, player) => state?.profiles?.[player]?.walkoutTrack || null;

/* a stable number from a string, so a key always draws the same member */
function seedOf(text) {
  let hash = 2166136261;
  for (const char of String(text)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

/* the side's singer: one member who saved a song, drawn by the win's key */
export function singerFor(state, players, key = "") {
  const singers = (players || []).filter(player => isActivePlayer(player) && songOf(state, player));
  return singers.length ? singers[seedOf(key) % singers.length] : null;
}

const logOf = (state, evId) => {
  const log = state?.eventOps?.[evId]?.contestLog;
  return Array.isArray(log) ? log : [];
};

/* the newest contest decision this write recorded, with its winning side
   read from the contest as it stood before the write */
function contestWin(prev, next) {
  let best = null;
  for (const evId of Object.keys(next?.eventOps || {})) {
    const known = new Set(logOf(prev, evId).map(entry => `${entry?.id}@${entry?.at}`));
    for (const entry of logOf(next, evId)) {
      if (!entry?.id || known.has(`${entry.id}@${entry.at}`)) continue;
      if (!best || Number(entry.at) > Number(best.entry.at)) best = { evId, entry };
    }
  }
  if (!best) return null;
  const ev = allEventsOf(prev).find(item => item.id === best.evId);
  let contest = null;
  try { contest = ev ? resolveCurrentContest(prev, ev) : null; } catch { contest = null; }
  const side = contest?.id === best.entry.id
    ? contest.sides.find(item => item.key === best.entry.winner) : null;
  return side ? { evId:best.evId, players:side.players,
    key:`contest:${best.evId}:${best.entry.id}:${best.entry.at}` } : null;
}

/* a result that appeared in this write (not the poker count) */
function resultWin(prev, next) {
  for (const [evId, result] of Object.entries(next?.results || {})) {
    if (prev?.results?.[evId] || result?.stacks) continue;
    const first = result?.slots?.[0] || [];
    if (first.length) return { evId, players:first, key:`result:${evId}:${Number(result.ts) || 0}` };
  }
  return null;
}

/* an MVP vote this write opened: that team's song waits for its close */
const mvpOpened = (prev, next, evId) => {
  const record = next?.mvp?.[evId];
  return !!record && !record.closedAt && prev?.mvp?.[evId]?.id !== record.id;
};

/* an MVP vote this write closed */
function mvpClosed(prev, next) {
  for (const [evId, record] of Object.entries(next?.mvp || {})) {
    const was = prev?.mvp?.[evId];
    if (record?.closedAt && record.winner && !(was?.id === record.id && was.closedAt))
      return { evId, record };
  }
  return null;
}

/* { player, track, clipMs, key, mvp? } or null. clipMs null plays the whole
   song. */
export function winSongFor(prev, next) {
  if (!next || prev === next) return null;
  if (!prev?.frozen && next.frozen) {
    const champions = computeStandings(next).filter(row => row.rank === 1).map(row => row.player);
    const player = champions.length === 1 && songOf(next, champions[0]) ? champions[0] : null;
    return player ? { player, track:songOf(next, player), clipMs:null, key:`champion:${player}` } : null;
  }
  if (next.frozen) return null;
  const voted = mvpClosed(prev, next);
  if (voted) {
    const { record } = voted;
    return songOf(next, record.winner) ? { player:record.winner, track:songOf(next, record.winner),
      clipMs:WIN_SONG_CLIP_MS, key:`mvp:${record.id}`, mvp:true } : null;
  }
  const win = contestWin(prev, next) || resultWin(prev, next);
  if (!win || mvpOpened(prev, next, win.evId)) return null;
  const player = singerFor(next, win.players, win.key);
  return player ? { player, track:songOf(next, player), clipMs:WIN_SONG_CLIP_MS, key:win.key } : null;
}
