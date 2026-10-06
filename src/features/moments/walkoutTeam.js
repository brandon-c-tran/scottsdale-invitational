/* Whose win a walkout celebrates. The Worker plays one member's song for a
   pair or a team (worker/winSong.js draws the singer by the win's key), but
   the win is the whole side's: the walkout record names only the singer, so
   the win itself is read back from official state. It is the newest
   recorded contest (a bracket match, a heat, a stage final) or posted
   result before the song started, when it was decided shortly before and
   the singer is on its winning side. Two or more on that side is a team: its name (the
   draw's name, else the pair's names) and every member, in the draw's
   order. A solo win, a tie in a free-for-all and a team of one stay
   individual. Pure; no clock. */
import { allEventsOf, stageEntrantView, teamLabel } from "../../../shared/core.js";

/* a song starts this long after the win at most (the speaker's own start,
   a queued fade); an older win is not this song's */
export const WALKOUT_WIN_MS = 30 * 1000;
/* the Worker stamps the song after the write; allow its clock a little */
const SKEW_MS = 2000;

const sameSet = (a = [], b = []) => a.length === b.length && a.every(player => b.includes(player));

/* the players and draw team a recorded contest's winner names */
function contestSide(state, evId, entry) {
  const draw = state?.draws?.[evId];
  if (entry.kind === "match") {
    if (!draw?.teams || (entry.drawId && draw.id !== entry.drawId)) return null;
    const team = draw.teams[entry.winner];
    return team?.players?.length ? { players:[...team.players], team } : null;
  }
  const st = state?.stages?.[evId];
  if (!st || (entry.stagesId && st.id !== entry.stagesId) || entry.winner === null || entry.winner === undefined) return null;
  if (st.entrantType === "team") {
    const team = draw?.teams?.[entry.winner];
    return team?.players?.length ? { players:[...team.players], team } : null;
  }
  const view = stageEntrantView(state, { ...st, eventId:evId }, entry.winner);
  return view?.players?.length ? { players:[...view.players], team:null } : null;
}

/* a posted result's first place, as a side: a draw team when it matches
   one, a pair or team when the event is played in sides, else players who
   tied (individual). A team of one is a person. */
function resultSide(state, ev, res) {
  const first = res?.slots?.[0] || [];
  if (!first.length || res.stacks) return null;
  const team = (state?.draws?.[ev.id]?.teams || []).find(item => sameSet(item?.players, first)) || null;
  if (team) return { players:[...team.players], team };
  const sides = Number(ev?.teamCfg?.size) >= 2;
  return { players:[...first], team:sides ? { players:[...first] } : null };
}

/* An event's posted winner as a side, or null: { players, team } where
   team is { name } for a pair or a team (the draw's order and name). */
export function postedWinner(state, ev) {
  const side = ev ? resultSide(state, ev, state?.results?.[ev.id]) : null;
  if (!side) return null;
  const team = side.team && side.players.length > 1 ? { name:teamLabel(state, { ...side.team, players:side.players }) } : null;
  return { players:side.players, team };
}

/* every win on the books, in the order each event recorded them:
   { evId, at, players, team } (a tie in time goes to the later one) */
function winsOf(state, events) {
  const wins = [];
  for (const ev of events) {
    const op = state?.eventOps?.[ev.id];
    const stack = Array.isArray(op?.contestStack) ? op.contestStack : op?.lastContest ? [op.lastContest] : [];
    for (const entry of stack) {
      const at = Number(entry?.decidedAt);
      if (!at) continue;
      const side = contestSide(state, ev.id, entry);
      if (side) wins.push({ ev, at, ...side });
    }
    const res = state?.results?.[ev.id];
    const at = Number(res?.confirmedAt || res?.ts);
    if (at) {
      const side = resultSide(state, ev, res);
      if (side) wins.push({ ev, at, ...side });
    }
  }
  return wins;
}

/* The team a walkout celebrates, or null for an individual win (or one this
   state cannot place): { evId, event, name, players }. */
export function walkoutTeam(state, events, walkout) {
  if (!walkout?.player) return null;
  const start = Number(walkout.startedAt);
  if (!Number.isFinite(start)) return null;
  const list = events?.length ? events : allEventsOf(state || {});
  /* the song follows the newest decision before it; one the singer did not
     win, or an old one, is not this song's win */
  const win = winsOf(state, list).map((item, seq) => ({ ...item, seq })).filter(item => item.at <= start + SKEW_MS)
    .sort((a, b) => b.at - a.at || b.seq - a.seq)[0];
  if (!win || start - win.at > WALKOUT_WIN_MS || !win.players.includes(walkout.player)) return null;
  if (win.players.length < 2 || !win.team) return null;
  return { evId:win.ev.id, event:win.ev.name || null, name:teamLabel(state, { ...win.team, players:win.players }),
    named:!!win.team.name, players:win.players };
}

/* the player whose identity color stands for the team: its first member, as
   at the draw (TeamSort), so the team floods the same color both times */
export const teamColorPlayer = team => team?.players?.[0] || null;

/* whether a walkout's takeover belongs on this player's phone: the singer's,
   and every teammate's when the win is a team's */
export const walkoutReaches = (view, player) => !!player && !!view
  && (view.player === player || !!view.team?.players?.includes(player));

/* Rows for a team's chips: one row up to `perRow`, then balanced rows
   (7 at 5 a row is 4 and 3, never 5 and 2). */
export function teamRows(count, perRow = 5) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (!n) return [];
  const rows = Math.ceil(n / Math.max(1, perRow));
  const base = Math.floor(n / rows), extra = n % rows;
  return Array.from({ length:rows }, (_, i) => base + (i < extra ? 1 : 0));
}
