/* Karaoke (Oct 12, docs/KARAOKE.md is the contract): Hypixel Build Battle's
   shape for a karaoke night. Everyone picks a song ahead of time (their
   profile's karaokeTrack, separate from the win song); Lock and start opens a
   pick window on every phone; each singer's karaoke video then plays on the
   TV while the rest of the room votes on their phones in Build Battle's six
   tiers, votes hidden and changeable until the vote closes; after the last
   singer the TV reveals the order from last to first, and the result posts
   as an ordinary free-for-all result. Nothing here touches chips.

   Two keys:
   - `profiles[p].karaokeTrack`, the guest's song: the Spotify track exactly
     as validateSpotifyTrack keeps a win song (provider, trackId, uri, url,
     name, artists, durationMs, imageUrl, explicit, isrc), less startMs, plus
       video:{ id, title, channel, seconds }, alts:[video], at, checkedAt
     Configuration, private to its owner and the commissioner, kept by a
     progress reset.
   - `state.karaoke`, the game (progress, cleared by a reset):
       { id, eventId, startedAt, phase:"pick"|"turns"|"reveal"|"done",
         pickUntil, moreTime, ready:{ [player]:at }, broken:{ [player]:code },
         order:[player], out:[player], songs:{ [player]:song },
         index, turns:{ [player]:turn }, votes (server only), revealAt,
         ranking, empty, finishedAt, ops (server only) }
       turn = { upAt, songAt, endAt, closeAt, video, playedAt, failed, cut,
                skipped, later, closedAt, legendary }
       votes = { [singer]:{ [voter]:{ tier, at } } }
   Pure. */
import { presentPlayers } from "./core.js";
import { validateSpotifyTrack } from "./audio.js";

/* ── the vote: Build Battle's classic ladder, low to high. A vote stores its
   tier (1 to 6); a score counts its points, Hypixel's own values for these
   names (a low vote still adds a little; the top two are worth most). ── */
export const KARAOKE_TIERS = Object.freeze([
  Object.freeze({ value:1, id:"superpoop", name:"Super Poop", points:1 }),
  Object.freeze({ value:2, id:"poop", name:"Poop", points:2 }),
  Object.freeze({ value:3, id:"ok", name:"OK", points:7 }),
  Object.freeze({ value:4, id:"good", name:"Good", points:10 }),
  Object.freeze({ value:5, id:"epic", name:"Epic", points:14 }),
  Object.freeze({ value:6, id:"legendary", name:"Legendary", points:18 }),
]);
export const isKaraokeTier = value => Number.isInteger(value) && value >= 1 && value <= KARAOKE_TIERS.length;
export const karaokeTierPoints = value => KARAOKE_TIERS[value - 1]?.points ?? 0;
/* the tier a score (in points) is nearest; halfway goes up */
export function karaokeTierOf(score) {
  if (!Number.isFinite(score)) return null;
  let best = KARAOKE_TIERS[0];
  for (const tier of KARAOKE_TIERS) if (Math.abs(score - tier.points) <= Math.abs(score - best.points)) best = tier;
  return best;
}

/* ── the clock ── */
/* the pick window Lock and start opens; "More time" adds a minute, three times at most */
export const KARAOKE_PICK_MS = 2 * 60 * 1000;
export const KARAOKE_MORE_TIME_MS = 60 * 1000;
export const KARAOKE_MORE_TIME_MAX = 3;
/* the drawn order on the TV before the first singer is up */
export const KARAOKE_ORDER_HOLD_MS = 6000;
/* "Up next": the walk-up; then the song starts by its own write (karaokeStartSong) */
export const KARAOKE_UP_MS = 20 * 1000;
/* a song starts this long after the write that starts it, so every TV has the frame */
export const KARAOKE_SONG_LEAD_MS = 1500;
/* a song plays its video's length, never more than this */
export const KARAOKE_MAX_SONG_MS = 5 * 60 * 1000;
/* a QA practice song (no video): a lit card and its countdown */
export const KARAOKE_PRACTICE_MS = 30 * 1000;
/* the vote stays open this long after the song ends */
export const KARAOKE_VOTE_GRACE_MS = 20 * 1000;
/* a vote landing just after the close, before the close's write, still counts */
export const KARAOKE_VOTE_LATE_MS = 1500;
/* everyone in: a breath before the window or the vote closes (autopilot's AUTO_ALL_IN_MS) */
export const KARAOKE_ALL_IN_MS = 1500;
/* a TV that saw the song start late (an ad, a slow load) moves the song's
   end by the delay: never less than this, never more than the max */
export const KARAOKE_LATE_MIN_MS = 2000;
export const KARAOKE_LATE_MAX_MS = 2 * 60 * 1000;
/* Build Battle's "Legendary" rain: a quarter of the votes (two at least)
   Legendary, and the TV rains it before the next singer is up */
export const KARAOKE_LEGENDARY_SHARE = 0.25;
export const KARAOKE_LEGENDARY_MIN = 2;
export const KARAOKE_LEGENDARY_MS = 3500;
/* 6 or more votes: the single highest and lowest are dropped */
export const KARAOKE_TRIM_AT = 6;
/* the reveal: a title beat, each place from last up to 4th, then 3rd, 2nd
   and 1st each longer, then the full order stands before the result posts */
export const KARAOKE_REVEAL_LEAD_MS = 2500;
export const KARAOKE_REVEAL_STEP_MS = 1300;
export const KARAOKE_REVEAL_PODIUM_MS = 3200;
export const KARAOKE_REVEAL_HOLD_MS = 7000;

/* ── a song ── */
export const KARAOKE_SECONDS = Object.freeze({ min:60, max:900 });
export const KARAOKE_ALTS_MAX = 2;
const YT_ID = /^[A-Za-z0-9_-]{11}$/;
export const isYouTubeId = id => typeof id === "string" && YT_ID.test(id);
/* a video's picture, derived from its id (never stored) */
export const karaokeThumb = id => isYouTubeId(id) ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
const text = (value, max) => typeof value === "string"
  ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";

export function cleanKaraokeVideo(input) {
  if (!input || typeof input !== "object" || !isYouTubeId(input.id)) return null;
  const seconds = Math.round(Number(input.seconds));
  if (!(seconds >= KARAOKE_SECONDS.min && seconds <= KARAOKE_SECONDS.max)) return null;
  return { id:input.id, title:text(input.title, 140), channel:text(input.channel, 80), seconds };
}

/* A guest's song as the profile stores it, or null when it is not one: the
   Spotify half through validateSpotifyTrack (as a win song), the video
   required (a song the TV cannot play is not a karaoke song); alternates
   that fail are dropped, never the song. */
export function cleanKaraokeTrack(input, { now = 0 } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const checked = validateSpotifyTrack({ ...input, provider:"spotify" });
  const video = cleanKaraokeVideo(input.video);
  if (!checked.ok || !checked.track || !video) return null;
  const { startMs, ...spotify } = checked.track;
  const alts = (Array.isArray(input.alts) ? input.alts : []).map(cleanKaraokeVideo)
    .filter((alt, k, list) => alt && alt.id !== video.id && list.findIndex(other => other?.id === alt.id) === k)
    .slice(0, KARAOKE_ALTS_MAX);
  return { ...spotify, video, alts, at:Number(input.at) || now || null, checkedAt:Number(input.checkedAt) || null };
}
/* the same song, ignoring when it was saved (a retried save is a no-op) */
export const sameKaraokeTrack = (a, b) => !!a && !!b
  && JSON.stringify({ ...a, at:null, checkedAt:null }) === JSON.stringify({ ...b, at:null, checkedAt:null });
export const karaokeTrackOf = (state, player) => state?.profiles?.[player]?.karaokeTrack || null;
export const hasKaraokeSong = (state, player) => !!karaokeTrackOf(state, player)?.video;
export const karaokeArtists = song => (song?.artists || []).join(", ");
/* the snapshot the game keeps of a song at the window's end */
export const karaokeSnapshot = track => track ? {
  provider:track.provider, trackId:track.trackId, name:track.name, artists:[...(track.artists || [])],
  imageUrl:track.imageUrl || null, durationMs:track.durationMs || null, ...(track.isrc ? { isrc:track.isrc } : {}),
  video:track.video ? { ...track.video } : null, alts:(track.alts || []).map(alt => ({ ...alt })),
  ...(track.practice ? { practice:true } : {}),
} : null;

/* QA's practice songs: titles only, no video (the TV plays a lit card for
   KARAOKE_PRACTICE_MS). Written into a game only, never to a profile. */
export const KARAOKE_PRACTICE_SONGS = Object.freeze([
  ["Mr. Brightside", "The Killers"], ["Don't Stop Believin'", "Journey"], ["Wonderwall", "Oasis"],
  ["Livin' on a Prayer", "Bon Jovi"], ["Bohemian Rhapsody", "Queen"], ["I Want It That Way", "Backstreet Boys"],
  ["Sweet Caroline", "Neil Diamond"], ["Africa", "Toto"], ["Hey Ya!", "OutKast"], ["Toxic", "Britney Spears"],
  ["Mamma Mia", "ABBA"], ["Party in the U.S.A.", "Miley Cyrus"], ["All Star", "Smash Mouth"],
].map(([name, artist], k) => Object.freeze({ provider:"practice", trackId:`practice${k + 1}`, name,
  artists:Object.freeze([artist]), imageUrl:null, durationMs:KARAOKE_PRACTICE_MS, video:null,
  alts:Object.freeze([]), practice:true })));

/* ── the game ── */
export const karaokeGame = (state, evId = null) => state?.karaoke?.id && (!evId || state.karaoke.eventId === evId)
  ? state.karaoke : null;
/* a game holds the room from its pick window until its result posts */
export const karaokeLive = state => {
  const game = state?.karaoke;
  return !!game?.id && game.phase !== "done" && !state.results?.[game.eventId];
};
export const karaokeSinger = game => game?.phase === "turns" ? game.order?.[game.index] || null : null;
export const karaokeTurn = (game, player = karaokeSinger(game)) => player ? game?.turns?.[player] || null : null;
/* the video a turn plays: 0 the chosen upload, 1 and 2 its alternates */
export const karaokeVideoOf = (song, turn) => {
  const k = Number(turn?.video) || 0;
  return k === 0 ? song?.video || null : song?.alts?.[k - 1] || null;
};
export const karaokeSongMs = (song, turn = null) => {
  const video = karaokeVideoOf(song, turn);
  return video ? Math.min(video.seconds * 1000, KARAOKE_MAX_SONG_MS) : KARAOKE_PRACTICE_MS;
};
/* A song's times once its start is written: it plays from songAt for its
   video's length; the vote closes KARAOKE_VOTE_GRACE_MS after. */
export function karaokeSchedule(song, songAt, turn = null) {
  const endAt = songAt + karaokeSongMs(song, turn);
  return { songAt, endAt, closeAt:endAt + KARAOKE_VOTE_GRACE_MS };
}
/* where a turn is at `now`: up (the walk-up, until its song is started),
   singing, voting (the song over, the vote open), closing (past its close,
   the write owed), closed */
export function karaokeStage(turn, now) {
  if (!turn) return null;
  if (turn.closedAt) return "closed";
  if (!Number.isFinite(turn.songAt) || now < turn.songAt) return "up";
  if (now < turn.endAt) return "singing";
  if (now < turn.closeAt) return "voting";
  return "closing";
}
/* where the video should be at `now`, in seconds (a TV that saw the song
   start late counts from when it really started) */
export const karaokeVideoSeconds = (turn, now) => turn && Number.isFinite(turn.songAt)
  ? Math.max(0, (now - (Number(turn.playedAt) || turn.songAt)) / 1000) : 0;
/* who may vote on a singer: everyone present but the singer */
export const karaokeVoters = (state, singer) => presentPlayers(state).filter(player => player !== singer);
export const karaokeVoteOpen = (turn, now) => !!turn && !turn.closedAt && !turn.skipped
  && Number.isFinite(turn.songAt) && now >= turn.songAt && now < turn.closeAt + KARAOKE_VOTE_LATE_MS;
/* the votes on a singer as each screen has them: the Worker's { tier, at },
   a frame's { at } only (projectKaraoke's `voted`) */
export const karaokeVotesOn = (game, singer) => game?.votes?.[singer]
  || Object.fromEntries(Object.entries(game?.voted?.[singer] || {}).map(([voter, at]) => [voter, { at }]));
/* the pick window: everyone present who has locked in a song */
export const karaokeReadyPlayers = (state, game = state?.karaoke) =>
  presentPlayers(state).filter(player => !!game?.ready?.[player]);

/* FNV-1a, then a small seeded shuffle: the running order is drawn from the
   game id, so a retried write draws the same order and QA repeats */
export function karaokeSeed(value) {
  let hash = 0x811c9dc5;
  for (const ch of String(value)) { hash ^= ch.charCodeAt(0); hash = Math.imul(hash, 0x01000193) >>> 0; }
  return hash >>> 0;
}
export function karaokeOrder(players, seed) {
  let s = karaokeSeed(seed) || 1;
  const next = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const list = [...players];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}
/* the game's id, from its event and its start (deterministic under QA's clock) */
export const karaokeGameId = (evId, startedAt) => `k${String(evId).replace(/[^a-z0-9]/gi, "").slice(0, 12)}${Number(startedAt).toString(36)}`;

/* ── scoring ── */
const tierValue = vote => Number(typeof vote === "object" && vote ? vote.tier : vote);
/* One singer's votes: the mean of their points after dropping the single
   highest and lowest at KARAOKE_TRIM_AT or more, kept as an exact sum and
   count. `counts[k]` is how many voted tier k + 1 (all votes, for the
   countback and the Legendary rain). */
export function karaokeScore(votes) {
  const values = Object.values(votes || {}).map(tierValue).filter(isKaraokeTier).sort((a, b) => a - b);
  const counts = KARAOKE_TIERS.map(() => 0);
  values.forEach(value => { counts[value - 1] += 1; });
  const kept = values.length >= KARAOKE_TRIM_AT ? values.slice(1, -1) : values;
  const sum = kept.reduce((total, value) => total + karaokeTierPoints(value), 0);
  return { votes:values.length, sum, count:kept.length, score:kept.length ? sum / kept.length : null, counts };
}
/* Build Battle's rain: enough Legendary in a closed vote */
export const karaokeLegendary = votes => {
  const { votes:n, counts } = karaokeScore(votes);
  const top = counts[KARAOKE_TIERS.length - 1];
  return top >= KARAOKE_LEGENDARY_MIN && top >= n * KARAOKE_LEGENDARY_SHARE;
};
/* higher first: the score (exact, sum/count cross-multiplied), then more of
   the top tier, then the next tier down, then more votes; 0 only for the
   very same row */
export function compareKaraoke(a, b) {
  if (!a.count || !b.count) { const d = (b.count ? 1 : 0) - (a.count ? 1 : 0); if (d) return d; }
  else {
    const diff = b.sum * a.count - a.sum * b.count;
    if (diff) return diff;
  }
  for (let k = KARAOKE_TIERS.length - 1; k >= 0; k--)
    if ((a.counts?.[k] || 0) !== (b.counts?.[k] || 0)) return (b.counts?.[k] || 0) - (a.counts?.[k] || 0);
  return (b.votes || 0) - (a.votes || 0);
}
/* Every singer who sang (their vote closed, not skipped), best first, each
   in their own place: a tie that survives the countback and the vote count
   goes to the earlier singer in the running order (a free-for-all posts one
   winner). A singer nobody voted on has no score and ranks after everyone
   who has one. */
export function karaokeRanking(game) {
  const order = game?.order || [];
  const rows = order.filter(player => game.turns?.[player]?.closedAt && !game.turns[player].skipped)
    .map(player => ({ player, ...karaokeScore(game.votes?.[player]) }));
  rows.sort((a, b) => compareKaraoke(a, b) || order.indexOf(a.player) - order.indexOf(b.player));
  return rows.map((row, k) => ({ player:row.player, place:k + 1,
    score:row.score === null ? null : Math.round(row.score * 100) / 100, sum:row.sum, count:row.count, votes:row.votes }));
}
/* the result's slots: one player each in 1st, 2nd and 3rd, from singers who
   got votes; nobody voted on anyone gives no slots (the result is entered
   by hand) */
export const karaokeResultSlots = ranking => (ranking || []).filter(row => row.count > 0).slice(0, 3).map(row => [row.player]);
/* one decimal, as the TV and phones show a score */
export const karaokeScoreText = score => Number.isFinite(score) ? (Math.round(score * 10) / 10).toFixed(1) : "-";

/* The reveal, from last place up, one singer a step at offsets from
   `revealAt`; `span` is one beat after 1st turns. */
export function karaokeRevealSchedule(ranking) {
  const steps = [];
  let at = KARAOKE_REVEAL_LEAD_MS;
  for (const row of [...(ranking || [])].reverse()) {
    steps.push({ player:row.player, place:row.place, at });
    at += row.place <= 3 ? KARAOKE_REVEAL_PODIUM_MS : KARAOKE_REVEAL_STEP_MS;
  }
  return { steps, span:at };
}
/* the instant a player's row turns on the TV (null: not in the ranking) */
export function karaokeRevealAt(game, player) {
  if (!game?.revealAt) return null;
  const step = karaokeRevealSchedule(game.ranking).steps.find(item => item.player === player);
  return step ? Number(game.revealAt) + step.at : null;
}

/* ── the autopilot: the next write the game owes, or null. Reads only what
   a commissioner's frame also has (projectKaraoke keeps the vote times), so
   the pill's drain and the server's alarm agree. ── */
export function karaokeAutoBeat(state) {
  const game = state?.karaoke;
  if (!game?.id || game.phase === "done" || game.finishedAt || state.results?.[game.eventId]) return null;
  const base = `karaoke:${game.id}`;
  if (game.phase === "pick") {
    const present = presentPlayers(state);
    const ready = present.filter(player => game.ready?.[player]);
    const pickUntil = Number(game.pickUntil) || 0;
    const at = present.length && ready.length === present.length
      ? Math.min(pickUntil, Math.max(...ready.map(player => Number(game.ready[player]) || 0)) + KARAOKE_ALL_IN_MS)
      : pickUntil;
    return { at, from:Number(game.startedAt) || null, type:"karaokeEndPick", payload:{ gameId:game.id },
      key:`${base}:pick` };
  }
  if (game.phase === "turns") {
    const singer = karaokeSinger(game), turn = karaokeTurn(game, singer);
    if (!turn || turn.closedAt) return null;
    if (!Number.isFinite(turn.songAt))
      return { at:Number(turn.upAt) + KARAOKE_UP_MS, from:Number(turn.upAt) || null, type:"karaokeStartSong",
        payload:{ gameId:game.id, index:game.index }, key:`${base}:start:${game.index}:${singer}` };
    const voters = karaokeVoters(state, singer), votes = karaokeVotesOn(game, singer);
    let at = Number(turn.closeAt);
    if (voters.length && voters.every(voter => votes[voter]))
      at = Math.min(at, Math.max(Number(turn.endAt), ...voters.map(voter => Number(votes[voter].at) || 0)) + KARAOKE_ALL_IN_MS);
    return { at, from:Number(turn.songAt) || null, type:"karaokeNext", payload:{ gameId:game.id, index:game.index },
      key:`${base}:next:${game.index}:${singer}` };
  }
  if (game.phase === "reveal") {
    const revealAt = Number(game.revealAt) || 0;
    return { at:revealAt + karaokeRevealSchedule(game.ranking).span + KARAOKE_REVEAL_HOLD_MS, from:revealAt,
      type:"karaokeFinish", payload:{ gameId:game.id }, key:`${base}:finish` };
  }
  return null;
}

/* Every instant a screen should wake on, sorted: the window's end, each
   turn's walk-up end, song, end and close, the reveal's steps. */
export function karaokeInstants(game) {
  if (!game?.id) return [];
  const out = [Number(game.pickUntil)];
  for (const turn of Object.values(game.turns || {}))
    out.push(Number(turn.upAt), Number(turn.upAt) + KARAOKE_UP_MS, Number(turn.songAt), Number(turn.endAt),
      Number(turn.closeAt), Number(turn.closedAt) + (turn.legendary ? KARAOKE_LEGENDARY_MS : 0));
  if (game.revealAt) {
    const { steps, span } = karaokeRevealSchedule(game.ranking);
    steps.forEach(step => out.push(Number(game.revealAt) + step.at));
    out.push(Number(game.revealAt) + span);
  }
  return [...new Set(out.filter(Number.isFinite))].sort((a, b) => a - b);
}

/* ── what each screen gets ──
   Everyone, the commissioner and the TV included: the game's times, the
   order, who sat out, who has locked in, who voted on each turn and when
   (never the tier), each song up to the current turn, and the ranking once
   the reveal starts. A player also gets their own song (ready or not) and
   their own votes, and whether their song's video failed the check. The
   commissioner sees songs no sooner than anyone (he sings too; his desk
   reads the profiles). Nobody gets anyone else's vote. */
export function projectKaraoke(state, viewer = null) {
  const game = state?.karaoke;
  if (!game?.id) return null;
  const order = Array.isArray(game.order) ? game.order : [];
  const shownThrough = game.phase === "pick" ? -1 : game.phase === "turns" ? Number(game.index) : order.length - 1;
  const songs = {};
  for (const [player, song] of Object.entries(game.songs || {})) {
    const at = order.indexOf(player);
    if (player === viewer || (at >= 0 && at <= shownThrough)) songs[player] = song;
  }
  const voted = {}, mine = {};
  for (const [singer, votes] of Object.entries(game.votes || {})) {
    voted[singer] = Object.fromEntries(Object.entries(votes || {}).map(([voter, vote]) => [voter, Number(vote?.at) || 0]));
    if (viewer && votes?.[viewer]) mine[singer] = Number(votes[viewer].tier);
  }
  const revealed = game.phase === "reveal" || game.phase === "done";
  return {
    id:game.id, eventId:game.eventId, startedAt:game.startedAt, phase:game.phase,
    pickUntil:game.pickUntil, moreTime:Number(game.moreTime) || 0, ready:{ ...(game.ready || {}) },
    broken:viewer && game.broken?.[viewer] ? { [viewer]:game.broken[viewer] } : {},
    order:[...order], out:[...(game.out || [])], index:Number.isInteger(game.index) ? game.index : -1,
    turns:JSON.parse(JSON.stringify(game.turns || {})), songs, voted, mine,
    revealAt:game.revealAt || null, ranking:revealed ? (game.ranking || []).map(row => ({ ...row })) : null,
    empty:!!game.empty, finishedAt:game.finishedAt || null,
  };
}
