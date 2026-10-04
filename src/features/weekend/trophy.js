import { SESSIONS, computeStandings, disp, teamLabel } from "../../../shared/core.js";
import { firstName } from "../../../shared/teamNames.js";
import { programCover } from "./programModel.js";

/* The weekend's cup (Oct 3), kept the way the Stanley Cup keeps its
   winners: the champion goes on the cup itself, and every event's winners
   are engraved on the base, one band per session (Friday, Saturday
   morning, afternoon, night), each band's plates in slate order. Read top
   to bottom it is the weekend in time; no plate outranks another. A plate
   stays blank until its event's result posts; the event the live order
   runs now or next is outlined; the poker finale is the cup, engraved with
   the champion once the board is crowned. One model for the phone, the TV
   and the keepsake. Pure: it reads the official results every time, so a
   correction re-engraves and a skipped event has no plate. */

const SESSION_LABEL = Object.fromEntries(SESSIONS.map(session => [session.id, session.label]));
const postedAt = res => Number(res?.confirmedAt || res?.ts) || 0;

/* a person in a pair: their first name, else the name as written */
const pairName = (state, player) => {
  const name = disp(state, player);
  return firstName(name) || name;
};

/* Who a plate engraves, as one line. A pair is the name it took, else both
   first names; a team of three or more is its name (its chips stand for its
   people); a split 1st names both; past two it is counted. */
export function plateEngraving(state, evId, winners = []) {
  const left = [...winners];
  const groups = [];
  for (const team of state?.draws?.[evId]?.teams || []) {
    const players = team?.players || [];
    if (!players.length || !players.every(p => left.includes(p))) continue;
    players.forEach(p => left.splice(left.indexOf(p), 1));
    if (players.length === 1) groups.push({ players:[...players], name:disp(state, players[0]), kind:"solo" });
    else if (players.length === 2) groups.push({ players:[...players], kind:"pair",
      name:team.name || `${pairName(state, players[0])} & ${pairName(state, players[1])}` });
    else groups.push({ players:[...players], name:teamLabel(state, team), kind:"team" });
  }
  left.forEach(p => groups.push({ players:[p], name:disp(state, p), kind:"solo" }));
  if (!groups.length) return null;
  if (groups.length === 1) return { ...groups[0], groups };
  return { players:groups.flatMap(group => group.players), groups, kind:"tie",
    name:groups.length > 2 ? `${groups.length} tied` : groups.map(group => group.name).join(", ") };
}

/* one plate per event on the slate (not the finale, not a skipped event),
   in slate order */
export function trophyPlates(state, events = []) {
  return events.filter(ev => !ev.finale && !state?.shelved?.[ev.id]).map(ev => {
    const res = state?.results?.[ev.id];
    const winners = [...(res?.slots?.[0] || [])];
    return { eventId:ev.id, name:ev.name, game:ev.game || ev.id, variant:ev.variant || null, session:ev.session,
      winners, posted:winners.length > 0, postedAt:winners.length ? postedAt(res) : 0,
      engraving:winners.length ? plateEngraving(state, ev.id, winners) : null };
  });
}

/* The whole cup. bands: one per session that has plates, in session order
   (an event in no known session rides a last band). A plate is `next` when
   the live order runs it now or next, and `live` when it is in play. */
export function trophyCup(state, events = []) {
  const cover = programCover(state || {}, events);
  const lead = cover.lead && !cover.lead.event.finale ? cover.lead : null;
  const plates = trophyPlates(state, events).map(plate => {
    const next = !plate.posted && lead?.event.id === plate.eventId;
    return { ...plate, next, live:next && !!lead.live };
  });
  const known = new Set(SESSIONS.map(session => session.id));
  const bands = [...SESSIONS.map(session => session.id), "other"].map(id => ({
    session:id,
    label:SESSION_LABEL[id] || "More",
    plates:plates.filter(plate => id === "other" ? !known.has(plate.session) : plate.session === id),
  })).filter(band => band.plates.length);
  const crowned = !!state?.frozen;
  const champions = crowned
    ? computeStandings(state).filter(row => row.rank === 1).map(row => ({ player:row.player, name:disp(state, row.player) }))
    : [];
  return { bands, plates, crowned, champions,
    posted:plates.filter(plate => plate.posted).length, total:plates.length };
}

/* ── engraving on the TV ──
   A posted plate engraves the first time the trophy holds the TV after the
   result's own moment (hold) has played: light runs across the plate and
   the winners are cut into it. It runs on the server clock from the turn's
   start, so every TV engraves together and one that joins late joins
   mid-cut, its sound dropped as late. The champion engraves on the cup the
   first trophy turn after the crown and its class photo (crownHold).
   turnAt: this trophy turn's start; cycleMs: one pass of the rotation. */
export const ENGRAVE = Object.freeze({ lead:900, stagger:700, sweep:1100, cut:520, settle:600 });
export const engraveTotal = plan => plan.length
  ? plan[plan.length - 1].at - plan[0].at + ENGRAVE.sweep + ENGRAVE.settle : 0;

export function cupEngravings(cup, { turnAt = 0, cycleMs = 0, hold = 0, crownEnd = 0, crownHold = 0 } = {}) {
  if (!cup || !(turnAt > 0) || !(cycleMs > 0)) return [];
  const due = (at, wait) => at > 0 && at > turnAt - cycleMs - wait && at <= turnAt - wait;
  const list = cup.plates.filter(plate => plate.posted && due(plate.postedAt, hold))
    .sort((a, b) => a.postedAt - b.postedAt)
    .map(plate => ({ key:`${plate.eventId}:${plate.postedAt}`, target:plate.eventId }));
  if (cup.crowned && cup.champions.length && due(crownEnd, crownHold)) list.push({ key:`cup:${crownEnd}`, target:"cup" });
  return list.map((item, index) => ({ ...item, at:turnAt + ENGRAVE.lead + index * ENGRAVE.stagger }));
}

/* ── the TV's cup, in canvas pixels ──
   The cup stands centred in the main area: its bowl high in the sky, the
   base's bands across the canvas down to the floor. Every size keeps the
   TV's 24px floor; a winner's line is fitted per plate (fitPlateName). */
export const CUP_TV = Object.freeze({
  width:1480, label:196, pad:12, gap:12, rim:6, sag:16, line:3, top:34, foot:27, platePad:10,
  bowl:Object.freeze({ width:600, height:240, cartouche:Object.freeze({ width:260, height:112 }) }),
  collar:24, height:796,
  plate:Object.freeze({ face:44, overlap:14, padX:16, gapX:12, event:24,
    name:Object.freeze({ max:32, min:28, two:26, floor:24 }) }),
});

/* the base's bands share what is left under the bowl, one plate row each;
   a band of more than four plates takes two rows */
export function cupTvLayout(cup) {
  const T = CUP_TV;
  const rows = (cup?.bands || []).map(band => Math.max(1, Math.ceil(band.plates.length / 4)));
  const totalRows = rows.reduce((sum, n) => sum + n, 0) || 1;
  const bandsH = T.height - T.bowl.height - T.collar + T.sag - T.top - T.foot - Math.max(0, rows.length - 1) * T.rim;
  const rowH = Math.floor(bandsH / totalRows);
  const inner = T.width - T.label - 2 * T.pad - 2 * T.line;
  const bands = (cup?.bands || []).map((band, index) => {
    const cols = Math.ceil(band.plates.length / rows[index]);
    return { session:band.session, rows:rows[index], cols, height:rowH * rows[index],
      plateW:Math.floor((inner - (cols - 1) * T.gap) / cols), plateH:rowH - 2 * T.platePad };
  });
  return { width:T.width, rowH, bands };
}

/* A line lettered as large as fits in one (min to max), else in two broken
   after "&" or at the last space (floor to two). Big Shoulders 900 runs
   about .47em a letter. */
const ADVANCE = 0.47;
function fitLines(name, width, { max, min, two, floor }) {
  const text = String(name || "");
  const size = len => Math.floor(width / Math.max(1, len * ADVANCE));
  const one = size(text.length);
  if (one >= min) return { size:Math.min(max, one), lines:[text] };
  const cut = text.includes(" & ") ? text.indexOf(" & ") + 2 : text.lastIndexOf(" ");
  if (cut <= 0) return { size:Math.max(floor, Math.min(two, one)), lines:[text] };
  const lines = [text.slice(0, cut).trim(), text.slice(cut).trim()];
  return { size:Math.max(floor, Math.min(two, size(Math.max(...lines.map(line => line.length))))), lines };
}
/* a winner's line on a TV plate: 28 to 32 in one line, else 24 to 28 in two */
export const fitPlateName = (name, width) => fitLines(name, width, CUP_TV.plate.name);
/* a plate shows up to three faces, overlapped; a team's name stands for the rest */
export const PLATE_FACES = 3;
export function plateFacesWidth(count, face = CUP_TV.plate.face) {
  const n = Math.max(1, Math.min(PLATE_FACES, count));
  return face + (n - 1) * (face - CUP_TV.plate.overlap);
}
export function plateNameWidth(plateW, count) {
  const P = CUP_TV.plate;
  return plateW - 2 * P.padX - plateFacesWidth(count) - P.gapX;
}

/* the champion on the cup's cartouche: 36 to 52 in one line, else two */
export const fitChampionName = name => fitLines(name, CUP_TV.bowl.cartouche.width - 32, { max:52, min:36, two:34, floor:24 });
