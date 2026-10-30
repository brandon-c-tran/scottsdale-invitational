/* The cut as a show (float/GROOVE.md "After a song"): a grade stamp over
   every rider at once, up to three award cards a beat apart, then the cut
   line and the riders out one by one from the bottom, each leaving with the
   song's slapstick exit for the bank; with a chug-off next, the first one
   out (the bubble) waits for it and the cut ends on "Chug-off!" and the
   two names. Pure: the beats are the room's (`room.show`, server ms),
   else the same shape made here from the cut's start and end. */
import { indexList } from "./cupShape.js";

/* the show's beats when the room does not send them (cup.js CUT_SHOW) */
export const SHOW = Object.freeze({ GRADES_MS:400, AWARDS_MS:2400, AWARD_GAP_MS:1200, OUTS_AFTER_LINE_MS:800, OUT_GAP_MS:1400, END_MS:1200 });
/* at most three award cards */
export const MAX_AWARDS = 3;
/* the grades' stamp stands this long; the cards leave when the cut line comes */
export const GRADE_HOLD_MS = 3200;

/* The show for a cut room: { grades:{ [i]: grade }, gradesAt, awards:[{ i,
   label, value, at }], line, outs:[{ i, at }] (from the bottom), chugoff:
   { a, b } | null, ranking }. */
export function cutShow(room, songField = []) {
  const ranking = cutRankingOf(room, songField);
  const start = Number.isFinite(room?.startAt) ? room.startAt : 0;
  const end = Number.isFinite(room?.endsAt) ? room.endsAt : start + 15000;
  const results = Array.isArray(room?.results) ? room.results : [];
  const grades = {};
  for (const row of results) if (Number.isInteger(row?.i) && row.grade) grades[row.i] = row.grade;
  const awardsIn = (Array.isArray(room?.awards) ? room.awards : []).filter(a => Number.isInteger(a?.i)).slice(0, MAX_AWARDS);
  const last = !!room?.lastRound || room?.cut === null;
  /* the chug-off's two: the room's word, else the last one through and the first one out */
  const outsAll = ranking.filter(row => row.out);
  const through = ranking.filter(row => !row.out);
  const show = room?.show && typeof room.show === "object" ? room.show : null;
  const bubbleRows = ranking.filter(row => row.bubble);
  const chugoff = room?.chugoff && Number.isInteger(room.chugoff.a) && Number.isInteger(room.chugoff.b) ? { a:room.chugoff.a, b:room.chugoff.b }
    : Array.isArray(show?.bubble) && show.bubble.length === 2 ? { a:show.bubble[0], b:show.bubble[1] }
      : bubbleRows.length === 2 ? { a:bubbleRows[0].i, b:bubbleRows[1].i }
        : !show && room?.drinking !== false && !last && outsAll.length && through.length ? { a:through[through.length - 1].i, b:outsAll[0].i } : null;
  const gradesAt = Number.isFinite(show?.grades) ? show.grades : start + SHOW.GRADES_MS;
  const awards = awardsIn.map((award, k) => ({ i:award.i, id:award.id, label:award.label || award.id, value:award.value,
    at:Number.isFinite(show?.awards?.[k]) ? show.awards[k] : start + SHOW.AWARDS_MS + k * SHOW.AWARD_GAP_MS }));
  let line = null, outs = [];
  if (show && Array.isArray(show.outs)) {
    line = Number.isFinite(show.line) ? show.line : null;
    outs = show.outs.filter(o => Number.isInteger(o?.i) && Number.isFinite(o.at));
  } else {
    const going = outsAll.map(row => row.i).filter(i => i !== chugoff?.b).reverse();
    if (going.length || chugoff) {
      line = start + SHOW.AWARDS_MS + awards.length * SHOW.AWARD_GAP_MS;
      const from = line + SHOW.OUTS_AFTER_LINE_MS;
      const gap = going.length ? Math.max(0, Math.min(SHOW.OUT_GAP_MS, (end - SHOW.END_MS - from) / going.length)) : 0;
      outs = going.map((i, k) => ({ i, at:Math.round(from + k * gap) }));
    }
  }
  const lastOut = outs.length ? outs[outs.length - 1].at : line ?? gradesAt;
  return { grades, gradesAt, awards, line, outs, chugoff, ranking, last,
    awardsEnd:line ?? (awards.length ? awards[awards.length - 1].at + SHOW.AWARD_GAP_MS * 2 : gradesAt + GRADE_HOLD_MS),
    callAt:chugoff ? Math.max(lastOut + 1800, end - 3600) : null, nextAt:Math.max(lastOut + 1800, end - 3600) };
}

/* the song this cut closes, as the room records it: its history entry for
   this round ({ round, song, field, results, out }), or null */
export function cutRecord(room) {
  const history = Array.isArray(room?.history) ? room.history : [];
  const last = history[history.length - 1];
  return last && (last.round === undefined || last.round === room?.round) ? last : null;
}

/* the field that played the song: the room's record, else what the screen
   saw in the song, else the room's field */
export function cutField(room, songField = []) {
  const record = cutRecord(room);
  const fromRecord = indexList(record?.field);
  if (fromRecord.length) return fromRecord;
  if (indexList(songField).length) return indexList(songField);
  return indexList(room?.field);
}

/* The song's ranking at the cut: [{ i, pct, place, out }] best first. The
   room's own (`results`: its places, ties broken its way, `out` on the
   riders going home) when it sends one; else by `scores`' percent, ties by
   the Cup before it, then entrant index, `out` from the room's outs. */
export function cutRanking(scores = [], { field = [], out = [], results = null } = {}) {
  const gone = new Set(indexList(out));
  const placed = (Array.isArray(results) ? results : []).filter(row => Number.isInteger(row?.i));
  if (placed.length) {
    return placed.slice().sort((a, b) => (a.place ?? 99) - (b.place ?? 99))
      .map((row, k) => ({ i:row.i, pct:Number(row.pct) || 0, cup:Number(row.cup) || 0, place:row.place ?? k + 1,
        out:row.out === undefined ? gone.has(row.i) : row.out === true, ...(row.bubble ? { bubble:true } : {}), ...(row.grade ? { grade:row.grade } : {}) }));
  }
  const rows = (Array.isArray(scores) ? scores : []).filter(row => Number.isInteger(row?.i));
  const known = new Set(rows.map(row => row.i));
  for (const i of indexList(field)) if (!known.has(i)) rows.push({ i, pct:0, cup:0 });
  const inField = new Set(indexList(field));
  return rows
    .filter(row => !inField.size || inField.has(row.i))
    .map(row => ({ i:row.i, pct:Number(row.pct) || 0, cup:Number(row.cup) || 0 }))
    .sort((a, b) => b.pct - a.pct || b.cup - a.cup || a.i - b.i)
    .map((row, k) => ({ ...row, place:k + 1, out:gone.has(row.i) }));
}

/* the ranking for a room message in its cut */
export function cutRankingOf(room, songField = []) {
  const record = cutRecord(room);
  const field = cutField(room, songField);
  const results = Array.isArray(room?.results) && room.results.length ? room.results : record?.results;
  const out = indexList(record?.out).length ? [...indexList(room?.out), ...indexList(record.out)] : room?.out;
  return cutRanking(room?.scores, { field, out, results });
}

/* who this cut sends home, from the last place up (the order they are
   stamped and hop) */
export const cutOuts = ranking => ranking.filter(row => row.out).map(row => row.i).reverse();

/* "92.5%": a percent as the board letters it */
export const pctText = pct => {
  const v = Math.max(0, Math.min(100, Number(pct) || 0));
  return `${v >= 99.95 ? 100 : v.toFixed(1)}%`;
};

/* an award card's value, said plainly */
export const awardValue = award => {
  const v = award?.value;
  if (!Number.isFinite(v)) return "";
  if (award.id === "streak") return `${v} in a row`;
  if (award.id === "early") return `${v} ms early`;
  if (award.id === "late") return `${v} ms late`;
  if (award.id === "splashes") return `${v} ${v === 1 ? "miss" : "misses"}`;
  if (award.id === "perfects") return `${v} ${v === 1 ? "Perfect" : "Perfects"}`;
  return String(v);
};
