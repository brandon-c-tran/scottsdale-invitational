/* Karaoke on the TV (docs/KARAOKE.md): what the room's screen shows at
   `now`, read from the game as a TV's frame carries it (projectKaraoke:
   who voted and when, never how) through the shared model, never
   re-deriving it. Pure.

   The stages, in the night's order:
     pick       the pick window: the room's chips light as each locks in
     order      the running order dealt as a queue (KARAOKE_ORDER_HOLD_MS)
     up         a singer up next: their chip, their song stamped in
     singing    the song: the video in its own box (nothing drawn over it),
                or the lit card for a practice song or a failed upload
     voting     the song over, the vote open: who has voted, never how
     legendary  a closed vote that was Legendary rains over its singer
     reveal     the order from last place to first */
import { presentPlayers } from "../../../shared/core.js";
import {
  KARAOKE_LEGENDARY_MS, KARAOKE_ORDER_HOLD_MS, karaokeInstants, karaokeReadyPlayers, karaokeRevealSchedule, karaokeSinger,
  karaokeStage, karaokeTierOf, karaokeTurn, karaokeVideoKey, karaokeVideoOf, karaokeVoters, karaokeVotesOn,
} from "../../../shared/karaoke.js";
import { teamRows } from "../moments/walkoutTeam.js";

/* The video's own rectangle on the 1920x1080 canvas: 16:9, inside the
   title-safe edges (64 a side, 54 top and bottom). YouTube's rules forbid
   anything in front of any part of a player, so nothing on the TV ever
   draws over this box while a video is in it; the singer's strip stands
   under it. */
export const KARAOKE_VIDEO_BOX = Object.freeze({ x:192, y:54, w:1536, h:864 });
export const KARAOKE_STRIP = Object.freeze({ x:64, y:932, w:1792, h:88 });

/* A closed vote that was Legendary rains over its singer from when the
   TV sees it until KARAOKE_LEGENDARY_MS after it closed (the next singer
   is up after it). The newest one, or null. */
export function karaokeRain(game, now) {
  let rain = null;
  for (const [player, turn] of Object.entries(game?.turns || {})) {
    const closedAt = Number(turn?.closedAt);
    if (!turn?.legendary || !Number.isFinite(closedAt) || now >= closedAt + KARAOKE_LEGENDARY_MS) continue;
    if (!rain || closedAt > rain.closedAt) rain = { player, closedAt, until:closedAt + KARAOKE_LEGENDARY_MS };
  }
  return rain;
}

/* the TV's stage at `now` (null: nothing to draw) */
export function karaokeTvStage(game, now) {
  if (!game?.id || game.phase === "done" || game.empty) return null;
  if (game.phase === "pick") return "pick";
  if (karaokeRain(game, now)) return "legendary";
  if (game.phase === "reveal") return "reveal";
  if (game.phase !== "turns") return null;
  const turn = karaokeTurn(game);
  if (!turn) return null;
  /* the first singer is up once the order has been dealt */
  if (Number(game.index) === 0 && now < Number(turn.upAt)) return "order";
  const stage = karaokeStage(turn, now);
  return stage === "up" || stage === "singing" ? stage : "voting";
}

/* The song holds the room from the write that starts it (its lead, so the
   stage's chrome is gone before the video shows) until it ends: the TV's
   takeover, the chrome out and no frame lamps. */
export function karaokeSongOn(game, now) {
  if (game?.phase !== "turns" || karaokeRain(game, now)) return false;
  const turn = karaokeTurn(game);
  return !!turn && Number.isFinite(turn.songAt) && !turn.closedAt && !turn.skipped && now < Number(turn.endAt);
}

/* a new build never reloads the TV from the first singer up to the result */
export const karaokeTvBusy = game => game?.phase === "turns" || game?.phase === "reveal";

/* What the TV's one player owes the turn on now (karaokePlayer.js): cue
   the upload from the walk-up (the song is public from upAt), play it
   from songAt, stop at endAt. Null when the turn has no video to play (a
   practice song, a failed upload, a closed or skipped turn, no turn). */
export function karaokeVideoPlan(game, now) {
  if (game?.phase !== "turns" || !game.id) return null;
  const singer = karaokeSinger(game), turn = karaokeTurn(game, singer);
  if (!turn || turn.closedAt || turn.skipped || turn.failed) return null;
  const video = karaokeVideoOf(game.songs?.[singer], turn);
  if (!video?.id) return null;
  const key = karaokeVideoKey(game);
  const songAt = Number(turn.songAt);
  if (!Number.isFinite(songAt)) return { key, id:video.id, mode:"cue", songAt:null, endAt:null };
  const endAt = Number(turn.endAt);
  return { key, id:video.id, songAt, endAt, mode:now < songAt ? "cue" : now < endAt ? "play" : "over" };
}

/* the pick window's room: everyone present, lit once locked in */
export function karaokePickRoom(state, game) {
  const lanes = presentPlayers(state).map(player => ({ player, lit:!!game?.ready?.[player] }));
  return { lanes, count:karaokeReadyPlayers(state, game).length, total:lanes.length };
}
/* who may vote on a singer, lit once they have (never how) */
export function karaokeVoteRoom(state, game, singer) {
  const votes = karaokeVotesOn(game, singer);
  const lanes = singer ? karaokeVoters(state, singer).map(player => ({ player, lit:!!votes[player] })) : [];
  return { lanes, count:lanes.filter(lane => lane.lit).length, total:lanes.length };
}

/* The running order dealt as a queue: from when the window closed (the
   first singer's upAt less the hold), a card every `step` after a `lead`,
   in balanced rows of seven at most, each row centred. A slot's `x` is
   its centre across the queue (0 to 1), for its card's pan. */
export const KARAOKE_DEAL = Object.freeze({ lead:500, step:300, perRow:7 });
export function karaokeDealAt(game) {
  const first = Number(game?.turns?.[game?.order?.[0]]?.upAt);
  return Number.isFinite(first) ? first - KARAOKE_ORDER_HOLD_MS : null;
}
export function karaokeDealSlots(count, perRow = KARAOKE_DEAL.perRow) {
  const rows = teamRows(count, perRow);
  const cols = Math.max(1, ...rows);
  const slots = [];
  rows.forEach((n, row) => { for (let col = 0; col < n; col++) slots.push({ row, col, x:(col + (cols - n) / 2 + 0.5) / cols }); });
  return slots;
}
/* the walk-up's beats from upAt: the chip lands, the name, then the song
   stamps in; a reveal row's from its instant: it stamps, its score rolls */
export const KARAOKE_UP_BEATS = Object.freeze({ chip:0, name:350, song:900 });
export const KARAOKE_ROW_BEATS = Object.freeze({ stamp:140, reel:420 });

/* a place across the room as a pan, left to right */
export const karaokePan = x => Math.round((Math.max(0, Math.min(1, x)) - 0.5) * 140) / 100;

/* who follows the singer up: the next `n` present players in the running
   order, with their place in it (an absent one is skipped when their turn
   comes, so the room never sees them on deck) */
export function karaokeQueue(state, game, n = 2) {
  const index = Number(game?.index) || 0;
  const present = new Set(presentPlayers(state));
  const order = game?.order || [];
  const out = [];
  for (let k = index + 1; k < order.length && out.length < n; k++)
    if (present.has(order[k])) out.push({ player:order[k], place:k + 1 });
  return out;
}

/* The reveal's rows, best first, each with the instant it turns on the TV
   (karaokeRevealSchedule from revealAt: last place first) and the tier
   its score is nearest. */
export function karaokeRevealRows(game, now) {
  const ranking = Array.isArray(game?.ranking) ? game.ranking : [];
  const revealAt = Number(game?.revealAt) || 0;
  const at = new Map(karaokeRevealSchedule(ranking).steps.map(step => [step.player, revealAt + step.at]));
  return ranking.map(row => {
    const on = at.get(row.player);
    return { ...row, at:on, shown:Number.isFinite(on) && now >= on, tier:karaokeTierOf(row.score) };
  });
}
/* Where each place stands on the reveal: 1st, 2nd and 3rd as the large
   rows on top; the rest in two columns under them, the first column the
   upper half (4th down), so the climb runs up each column. */
export function karaokeRevealColumns(count) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  const top = Math.min(3, n), rest = n - top, left = Math.ceil(rest / 2);
  const places = (from, k) => Array.from({ length:Math.max(0, k) }, (_, i) => from + i);
  return { podium:places(1, top), left:places(4, left), right:places(4 + left, rest - left) };
}
/* a place's pan on the reveal: its column's side, the podium centred */
export function karaokeRevealPan(place, count) {
  const cols = karaokeRevealColumns(count);
  return cols.left.includes(place) ? -0.45 : cols.right.includes(place) ? 0.45 : 0;
}

/* A song title's lettering in a box `width` wide: the hero cut (Big
   Shoulders Inline, `hero` px) when it fits in one or two lines there,
   else the solid face as large as two lines allow (`max` down to `min`).
   Big Shoulders 900 runs about half an em a letter. */
export function karaokeTitleFit(text, width, { hero = 150, max = 112, min = 56, advance = 0.5 } = {}) {
  const title = String(text || "").trim();
  const fits = (line, size) => line.length * advance * size <= width;
  if (fits(title, hero)) return { marquee:true, size:hero, lines:[title] };
  const words = title.split(/\s+/);
  let best = null;
  for (let k = 1; k < words.length; k++) {
    const lines = [words.slice(0, k).join(" "), words.slice(k).join(" ")];
    const longest = Math.max(...lines.map(line => line.length));
    if (!best || longest < best.longest) best = { lines, longest };
  }
  if (best && best.longest * advance * hero <= width) return { marquee:true, size:hero, lines:best.lines };
  const lines = best ? best.lines : [title];
  const longest = Math.max(1, ...lines.map(line => line.length));
  const size = Math.max(min, Math.min(max, Math.floor(width / (longest * advance))));
  return { marquee:false, size, lines };
}

/* the next instant the TV's karaoke changes by itself (a stage turning,
   a reveal row), after `now`; null when nothing more is due */
export function karaokeNextInstant(game, now) {
  return karaokeInstants(game).find(at => at > now) ?? null;
}

/* seconds as the TV's clock reads them: 1:40, then 59 down to 0 */
export function karaokeClock(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return seconds >= 60 ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` : String(seconds);
}
