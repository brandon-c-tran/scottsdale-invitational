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
  KARAOKE_LEGENDARY_MS, KARAOKE_ORDER_HOLD_MS, karaokeRevealSchedule, karaokeSinger, karaokeStage, karaokeTierOf, karaokeTurn,
  karaokeVideoKey, karaokeVideoOf, karaokeVoters, karaokeVotesOn,
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

/* the TV's stage at `now` (null: no game holds the room) */
export function karaokeTvStage(game, now) {
  if (!game?.id || game.phase === "done") return null;
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
  return { lanes, count:lanes.filter(lane => lane.lit).length, total:lanes.length };
}
/* who may vote on a singer, lit once they have (never how) */
export function karaokeVoteRoom(state, game, singer) {
  const votes = karaokeVotesOn(game, singer);
  const lanes = karaokeVoters(state, singer).map(player => ({ player, lit:!!votes[player] }));
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

/* who follows the singer up: the next `n` in the running order, with
   their place in it */
export function karaokeQueue(game, n = 2) {
  const index = Number(game?.index) || 0;
  return (game?.order || []).slice(index + 1, index + 1 + n).map((player, k) => ({ player, place:index + 2 + k }));
}

/* The reveal's rows, best first, each with the instant it turns on the TV
   (karaokeRevealSchedule from revealAt: last place first) and the tier
   its score is nearest. */
export function karaokeRevealRows(game, now) {
  const ranking = Array.isArray(game?.ranking) ? game.ranking : [];
  const revealAt = Number(game?.revealAt) || 0;
  const at = new Map(karaokeRevealSchedule(ranking).steps.map(step => [step.player, revealAt + step.at]));
  return ranking.map(row => ({ ...row, at:at.get(row.player), shown:now >= at.get(row.player), tier:karaokeTierOf(row.score) }));
}

/* a song's name as the room knows it: a release's suffix ("- Remastered
   2011", "(Radio Edit)", "- Single Version") is not part of it */
const SONG_SUFFIX = /\s*(?:-\s+[^-]*\b(?:version|remaster(?:ed)?|edit|mix|mono|stereo|live|single|radio|explicit|clean)\b[^-]*|[([][^)\]]*\b(?:version|remaster(?:ed)?|edit|mix|mono|stereo|live|radio|explicit|clean)\b[^)\]]*[)\]])\s*$/i;
export function karaokeTitle(name) {
  const full = String(name || "").trim();
  return full.replace(SONG_SUFFIX, "").trim() || full;
}
/* a title's lettering size by its length, so two lines always fit */
export function karaokeTitleSize(text, { max = 96, min = 56 } = {}) {
  const n = String(text || "").length;
  const size = n > 34 ? max * 0.62 : n > 24 ? max * 0.74 : n > 16 ? max * 0.86 : max;
  return Math.max(min, Math.round(size));
}
