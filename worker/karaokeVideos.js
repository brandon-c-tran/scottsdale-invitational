/* Karaoke videos on YouTube (docs/KARAOKE.md, "YouTube"): the uploads a
   guest's song can be sung to, found once per chosen Spotify track; a
   pasted link's check; and the pick window's check of every saved one.

   A lookup is ONE search.list (its own bucket of 100 calls a day since
   June 2026) then ONE videos.list for what it found (1 of the 10,000 units
   everything else shares). Titles and channels are read from videos.list:
   search.list escapes them as HTML. A video is kept only when an embedded
   player can play it in the US (embeddable, public or unlisted, processed,
   not age restricted, not blocked in the US, not live, 60 to 900 s) and it
   is a karaoke upload ("karaoke" in its title, never an auto-generated
   "- Topic" channel, never Sing King, whose uploads refuse embedding).
   Ranked: the song's own name in the title (a karaoke search also turns up
   the artist's other songs, which are dropped when the song itself is
   there), then the known karaoke channels in order, then the title's
   words, then the length nearest Spotify's; each channel's best first, so
   the alternates are other channels' uploads.

   A failed call throws a YouTubeError carrying YouTube's own reason
   (quotaExceeded, keyInvalid...), so a route says what to do instead of a
   bare 502; nothing here keeps an answer. Pure but for the injected fetch:
   no cloudflare:* or node:* imports. */
import { presentPlayers } from "../shared/core.js";
import { songTitle } from "../shared/audio.js";
import { KARAOKE_ALTS_MAX, KARAOKE_SECONDS, isYouTubeId, karaokeVideoKind } from "../shared/karaoke.js";
import { YOUTUBE_KEEP_MS, isoDurationMs } from "./youtube.js";

export { isYouTubeId };

const API = "https://www.googleapis.com/youtube/v3";
const CALL_MS = 8000;
/* one search's candidates (a search costs the same whatever the count) */
export const KARAOKE_SEARCH_RESULTS = 15;
/* the picker's choices: the upload a guest uses and up to two alternates */
export const KARAOKE_CHOICES = KARAOKE_ALTS_MAX + 1;
/* videos.list reads at most 50 ids a call */
export const KARAOKE_ID_BATCH = 50;
/* a lookup's answer is kept 30 days (YouTube's storage rule); a song with
   no karaoke upload is asked again after a day */
export const KARAOKE_KEEP_MS = YOUTUBE_KEEP_MS;
export const KARAOKE_MISS_MS = 24 * 60 * 60 * 1000;

/* The karaoke channels whose uploads play in an embed (sampled Oct 12:
   every upload embeddable), best first; KaraFun's and Party Tyme's pass
   only some, so they come last. Matched by channel id, else by name. */
export const KARAOKE_CHANNELS = Object.freeze([
  ["Stingray Karaoke", "UCYi9TC1HC_U2kaRAK6I4FSQ", ["stingraykaraoke", "thekaraokechannel"]],
  ["Zoom Karaoke", "UCrk8mp-ugqtAbjif6JARjlw", ["zoomkaraoke", "zoomkaraokeofficial"]],
  ["CC Karaoke", "UCwXOPyNfdUIhsM4NykfhPFw", ["cckaraoke"]],
  ["Musisi Karaoke", "UCJw1qyMF4m3ZIBWdhogkcsw", ["musisikaraoke"]],
  ["KaraokeOnVEVO", "UCQHthJbbEt6osR39NsST13g", ["karaokeonvevo"]],
  ["Sunfly Karaoke", "UCcKX_cqJR4RwW5dxeqHbseQ", ["sunfly", "sunflykaraoke", "sunflykaraokeofficial"]],
  ["Atomic Karaoke", "UCutZyApGOjqhOS-pp7yAj4Q", ["atomickaraoke"]],
  ["KaraFun", "UCbqcG1rdt9LMwOJN4PyGTKg", ["karafun", "karafunkaraoke"]],
  ["Party Tyme Karaoke", "UCWLqO9ztz16a_Ko4YB9PnFQ", ["partytymekaraoke", "partytymekaraokechannel", "partytymevevo"]],
].map(([name, id, names]) => Object.freeze({ name, id, names:Object.freeze(names) })));
/* Sing King's uploads refuse embedding: never offered */
export const SING_KING = Object.freeze({ name:"Sing King", id:"UCwTRjvjVge51X-ILJ4i22ew",
  names:Object.freeze(["singking", "singkingkaraoke"]) });

const plain = value => String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const squash = value => plain(value).replace(/[^a-z0-9]/g, "");
/* a title's words: lowercase, accents and apostrophes gone ("Don't" is "dont") */
const words = value => plain(value).replace(/['\u2018\u2019`]/g, "").split(/[^a-z0-9]+/).filter(Boolean);
const sameChannel = (snippet, channel) => snippet?.channelId === channel.id || channel.names.includes(squash(snippet?.channelTitle));
/* a channel's place in KARAOKE_CHANNELS (any other channel after them all) */
export function karaokeChannelRank(snippet) {
  const at = KARAOKE_CHANNELS.findIndex(channel => sameChannel(snippet, channel));
  return at < 0 ? KARAOKE_CHANNELS.length : at;
}

/* "(feat. X)", "(with X)", "- feat. X": a karaoke title seldom carries them */
const stripFeat = value => String(value || "")
  .replace(/\s*[([]\s*(?:feat\.?|ft\.?|featuring|with)\s[^)\]]*[)\]]/gi, "")
  .replace(/\s+-\s+(?:feat\.?|ft\.?|featuring)\s.*$/i, "")
  .trim();
/* the song's name to search and match: its release suffix and featured
   artists dropped */
export const karaokeSongName = name => stripFeat(songTitle(name)) || String(name || "").trim();

/* the one search: "{first artist} {the song's name} karaoke" */
export function karaokeQuery({ name, artists = [], artist = "" } = {}) {
  const title = karaokeSongName(name);
  if (!title) return "";
  const first = String((Array.isArray(artists) ? artists[0] : "") || artist || "").trim();
  return `${`${first} ${title}`.replace(/\s+/g, " ").trim().slice(0, 140)} karaoke`;
}

/* how much of the song's own name a title carries, 0 to 1: a word counts
   when a title word is it, or (four letters or more) one starts the other,
   so "believin" finds "believing" */
export function nameShare(title, name) {
  const want = words(karaokeSongName(name));
  if (!want.length) return 1;
  const have = words(title);
  const found = want.filter(word => have.some(other => other === word
    || (Math.min(word.length, other.length) >= 4 && (other.startsWith(word) || word.startsWith(other)))));
  return found.length / want.length;
}
const NAME_SHARE = 0.6;

/* A title's words, up for a lyric video or an instrumental, down for a
   cover, a live take, a lesson, a reaction or a re-speed (unless the song's
   own name says it: "Live and Let Die") */
const TITLE_UP = Object.freeze([["karaoke"], ["instrumental"], ["lyrics", "lyric"]]);
const TITLE_DOWN = Object.freeze([["cover"], ["live"], ["lesson"], ["tutorial"], ["reaction"], ["slowed"],
  ["sped up", "speed up"]]);
export function titleScore(title, name = "") {
  const text = ` ${words(title).join(" ")} `, own = ` ${words(karaokeSongName(name)).join(" ")} `;
  const has = word => text.includes(` ${word} `) && !own.includes(` ${word} `);
  return TITLE_UP.filter(group => group.some(has)).length - TITLE_DOWN.filter(group => group.some(has)).length;
}

const text = (value, max) => typeof value === "string"
  ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
const secondsOf = item => {
  const ms = isoDurationMs(item?.contentDetails?.duration);
  return ms === null ? null : Math.round(ms / 1000);
};
/* a video as the profile keeps it (shared/karaoke.js cleanKaraokeVideo) */
const videoOf = item => ({ id:item.id, title:text(item.snippet?.title, 140), channel:text(item.snippet?.channelTitle, 80),
  seconds:secondsOf(item) });
const blockedInUs = restriction => !!restriction
  && ((Array.isArray(restriction.allowed) && !restriction.allowed.includes("US"))
    || (Array.isArray(restriction.blocked) && restriction.blocked.includes("US")));

/* Why an embedded player in the US cannot play this videos.list item, or
   null when it can: removed, private, processing, embedding, age, region,
   live or length. */
export function karaokePlayProblem(item) {
  if (!item || !isYouTubeId(item.id)) return "removed";
  const status = item.status || {};
  if (["deleted", "failed", "rejected"].includes(status.uploadStatus)) return "removed";
  if (!["public", "unlisted"].includes(status.privacyStatus)) return "private";
  if (status.uploadStatus !== "processed") return "processing";
  if (status.embeddable !== true) return "embedding";
  if (item.contentDetails?.contentRating?.ytRating === "ytAgeRestricted") return "age";
  if (blockedInUs(item.contentDetails?.regionRestriction)) return "region";
  if ((item.snippet?.liveBroadcastContent ?? "none") !== "none") return "live";
  const seconds = secondsOf(item);
  if (!(seconds >= KARAOKE_SECONDS.min && seconds <= KARAOKE_SECONDS.max)) return "length";
  return null;
}
/* why a playable video is not a karaoke upload a search may offer, or null */
export function karaokeKindProblem(item) {
  if (!/karaoke/i.test(item?.snippet?.title || "")) return "title";
  if (/\s-\sTopic$/i.test(item?.snippet?.channelTitle || "")) return "topic";
  if (sameChannel(item?.snippet, SING_KING)) return "singking";
  return null;
}

/* The search's videos.list items, best first: up to three
   { id, title, channel, seconds } (see the ranking above). Never an
   instrumental (no words on it), whatever else its title says. */
export function chooseKaraoke(items, durationMs, { name = "" } = {}) {
  const target = Number(durationMs) || 0;
  const seen = new Set();
  const rows = (Array.isArray(items) ? items : [])
    .filter(item => !karaokePlayProblem(item) && !karaokeKindProblem(item))
    .filter(item => karaokeVideoKind({ title:item.snippet?.title || "" }, name) !== "instrumental")
    .filter(item => !seen.has(item.id) && seen.add(item.id))
    .map((item, at) => {
      const video = videoOf(item), rank = karaokeChannelRank(item.snippet);
      /* one channel, however it was matched */
      const channel = rank < KARAOKE_CHANNELS.length ? `known:${rank}` : item.snippet?.channelId || squash(item.snippet?.channelTitle);
      return { video, at, channel, rank, named:nameShare(video.title, name) >= NAME_SHARE,
        words:titleScore(video.title, name), off:target ? Math.abs(video.seconds * 1000 - target) : 0 };
    })
    .sort((a, b) => Number(b.named) - Number(a.named) || a.rank - b.rank || b.words - a.words || a.off - b.off || a.at - b.at);
  /* the song itself, when the search found it: never another song as its alternate */
  const pool = rows.some(row => row.named) ? rows.filter(row => row.named) : rows;
  const firsts = [], rest = [], channels = new Set();
  for (const row of pool) (channels.has(row.channel) ? rest : (channels.add(row.channel), firsts)).push(row);
  return [...firsts, ...rest].slice(0, KARAOKE_CHOICES).map(row => row.video);
}

/* ── calling YouTube ── */
export class YouTubeError extends Error {
  constructor(message, { status = 0, reason = null, detail = null, call = null } = {}) {
    super(message);
    this.name = "YouTubeError";
    this.status = status;
    this.reason = reason;
    this.detail = detail;
    this.call = call;
  }
}

async function youtubeJson(path, params, key, fetchImpl) {
  const url = new URL(`${API}/${path}`);
  for (const [name, value] of Object.entries({ ...params, key })) url.searchParams.set(name, value);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALL_MS);
  try {
    let response;
    try { response = await fetchImpl(url, { signal:controller.signal }); }
    catch { throw new YouTubeError(controller.signal.aborted ? "YouTube timed out" : "YouTube unreachable", { call:path }); }
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const reason = body?.error?.errors?.[0]?.reason || null;
      const detail = (Array.isArray(body?.error?.details) ? body.error.details : []).find(item => item?.reason)?.reason || null;
      throw new YouTubeError(`YouTube ${response.status}${reason ? ` ${reason}` : ""}`,
        { status:response.status, reason, detail, call:path });
    }
    return await response.json();
  } finally { clearTimeout(timer); }
}

/* A chosen song's karaoke uploads: one search, one read. [] when there are none. */
export async function findKaraokeVideos({ name = "", artists = [], artist = "", durationMs = 0 } = {}, key, fetchImpl = fetch) {
  const q = karaokeQuery({ name, artists, artist });
  if (!q) return [];
  const found = await youtubeJson("search", { part:"snippet", type:"video", videoEmbeddable:"true", videoSyndicated:"true",
    regionCode:"US", relevanceLanguage:"en", safeSearch:"none", maxResults:String(KARAOKE_SEARCH_RESULTS), q }, key, fetchImpl);
  const ids = [...new Set((found?.items || []).map(item => item?.id?.videoId).filter(isYouTubeId))];
  if (!ids.length) return [];
  const details = await youtubeJson("videos", { part:"snippet,contentDetails,status", id:ids.join(",") }, key, fetchImpl);
  return chooseKaraoke(details?.items, durationMs, { name });
}

/* ── the backing track: an instrumental upload (Oct 15, docs/KARAOKE.md
   "YouTube"). OFF since Oct 28 (Brandon's call: our own lyrics did not play
   reliably); nothing searches for an instrumental now, and these stay only
   to read what older lookups kept. ── A song sung with our own lyrics plays over an upload with
   no vocals and no words on it, of the same recording: its length within
   INSTRUMENTAL_MATCH_MS of Spotify's (so LRCLIB's times line up), its title
   saying it is the instrumental (shared/karaoke.js karaokeVideoKind) and
   naming the song, nothing in it that changes the arrangement (a piano
   cover, a remix, slowed...), never a "- Topic" channel. Ranked by how
   close its length is (whole seconds), then its title's words, then the
   artist's own channel; one a channel first. */
export const INSTRUMENTAL_MATCH_MS = 2500;
/* the one search: "{first artist} {the song's name} instrumental" */
export function backingQuery({ name, artists = [], artist = "" } = {}) {
  const title = karaokeSongName(name);
  if (!title) return "";
  const first = String((Array.isArray(artists) ? artists[0] : "") || artist || "").trim();
  return `${`${first} ${title}`.replace(/\s+/g, " ").trim().slice(0, 140)} instrumental`;
}
/* words that make it another arrangement (unless the song's own name says them) */
const ARRANGED = Object.freeze(["piano", "acoustic", "cover", "remix", "live", "orchestral", "orchestra", "lofi", "lo fi",
  "nightcore", "8d", "slowed", "sped up", "speed up", "reverb", "guitar", "drum", "drums", "bass", "lesson", "tutorial",
  "reaction", "8 bit", "music box", "violin", "cello", "sax", "saxophone", "ukulele", "marimba", "remake", "mashup"]);
const INSTRUMENTAL_UP = Object.freeze([["official"], ["original"], ["studio"]]);
const INSTRUMENTAL_DOWN = Object.freeze([["backing vocals", "bgv"], ["extended"], ["hq"], ["remastered"]]);
const hasWords = (title, name, word) => {
  const text = ` ${words(title).join(" ")} `, own = ` ${words(karaokeSongName(name)).join(" ")} `;
  return text.includes(` ${word} `) && !own.includes(` ${word} `);
};
/* why a playable video is not this song's instrumental, or null */
export function instrumentalProblem(item, durationMs, { name = "" } = {}) {
  const title = item?.snippet?.title || "";
  if (karaokeVideoKind({ title }, name) !== "instrumental") return "kind";
  if (/\s-\sTopic$/i.test(item?.snippet?.channelTitle || "")) return "topic";
  if (sameChannel(item?.snippet, SING_KING)) return "singking";
  if (nameShare(title, name) < NAME_SHARE) return "name";
  const seconds = secondsOf(item);
  if (!Number.isFinite(seconds) || Math.abs(seconds * 1000 - (Number(durationMs) || 0)) > INSTRUMENTAL_MATCH_MS) return "length";
  if (ARRANGED.some(word => hasWords(title, name, word))) return "arrangement";
  return null;
}
/* the artist's own channel ("Journey", "JourneyVEVO") */
const artistChannel = (snippet, artist) => {
  const channel = squash(snippet?.channelTitle), own = squash(artist);
  return !!own && (channel === own || channel === `${own}vevo` || channel === `${own}official`);
};
/* The search's videos.list items that are this song's instrumental, best
   first, one a channel before any second: [{ id, title, channel, seconds }]. */
export function chooseInstrumentals(items, durationMs, { name = "", artist = "" } = {}) {
  const target = Number(durationMs) || 0;
  const seen = new Set();
  const rows = (Array.isArray(items) ? items : [])
    .filter(item => !karaokePlayProblem(item) && !instrumentalProblem(item, target, { name }))
    .filter(item => !seen.has(item.id) && seen.add(item.id))
    .map((item, at) => {
      const video = videoOf(item);
      const score = INSTRUMENTAL_UP.filter(group => group.some(word => hasWords(video.title, name, word))).length
        - INSTRUMENTAL_DOWN.filter(group => group.some(word => hasWords(video.title, name, word))).length;
      return { video, at, channel:item.snippet?.channelId || squash(item.snippet?.channelTitle),
        off:Math.round(Math.abs(video.seconds * 1000 - target) / 1000), score, own:artistChannel(item.snippet, artist) };
    })
    .sort((a, b) => a.off - b.off || b.score - a.score || Number(b.own) - Number(a.own) || a.at - b.at);
  const firsts = [], rest = [], channels = new Set();
  for (const row of rows) (channels.has(row.channel) ? rest : (channels.add(row.channel), firsts)).push(row);
  return [...firsts, ...rest].map(row => row.video);
}
/* The choices a guest is offered since Oct 28: the karaoke uploads alone,
   never an instrumental (`instrumentals` and `hasLyrics` are ignored). Up
   to KARAOKE_CHOICES. */
export function chooseBacking(instrumentals, karaokes) {
  return (Array.isArray(karaokes) ? karaokes : []).slice(0, KARAOKE_CHOICES);
}

/* Saved or pasted videos, read again: one videos.list per 50 ids, the same
   play checks (a pasted or saved video is the guest's own choice, so the
   search's karaoke-title rules do not apply). { [id]:{ ok, code, video } };
   an id YouTube no longer has is "removed", a malformed one "invalid". */
export async function checkKaraokeVideos(ids, key, fetchImpl = fetch) {
  const list = Array.isArray(ids) ? ids : [];
  const out = {};
  for (const id of list) if (!isYouTubeId(id)) out[String(id)] = { ok:false, code:"invalid", video:null };
  const valid = [...new Set(list.filter(isYouTubeId))];
  for (let at = 0; at < valid.length; at += KARAOKE_ID_BATCH) {
    const batch = valid.slice(at, at + KARAOKE_ID_BATCH);
    const details = await youtubeJson("videos", { part:"snippet,contentDetails,status", id:batch.join(",") }, key, fetchImpl);
    const byId = new Map((details?.items || []).filter(item => batch.includes(item?.id)).map(item => [item.id, item]));
    for (const id of batch) {
      const item = byId.get(id);
      if (!item) { out[id] = { ok:false, code:"removed", video:null }; continue; }
      const code = karaokePlayProblem(item);
      out[id] = { ok:!code, code, video:videoOf(item) };
    }
  }
  return out;
}

/* What a route answers for a failed call: the line to show, a short code
   and its HTTP status. Search's own bucket running out still leaves
   videos.list, so a pasted link works then. */
const QUOTA = new Set(["quotaExceeded", "dailyLimitExceeded"]);
const BUSY = new Set(["rateLimitExceeded", "userRateLimitExceeded"]);
const KEY = new Set(["keyInvalid", "keyExpired", "accessNotConfigured", "ipRefererBlocked", "API_KEY_INVALID",
  "API_KEY_SERVICE_BLOCKED", "API_KEY_HTTP_REFERRER_BLOCKED", "SERVICE_DISABLED"]);
export function youtubeFailure(error) {
  const reasons = [error?.reason, error?.detail].filter(Boolean);
  if (reasons.some(reason => QUOTA.has(reason)))
    return { status:429, code:"quota", error:error?.call === "search"
      ? "YouTube's daily limit is used up. Paste a YouTube link." : "YouTube's daily limit is used up. Try again tomorrow." };
  if (reasons.some(reason => BUSY.has(reason))) return { status:429, code:"busy", error:"YouTube is busy. Try again in a minute." };
  if (reasons.some(reason => KEY.has(reason))) return { status:503, code:"key", error:"YouTube lookups are down. Try again later." };
  return { status:502, code:"failed", error:"YouTube did not answer. Try again" };
}

/* a video that will not play, as its owner reads it */
const PROBLEMS = Object.freeze({
  removed:"That video is gone. Try another.",
  private:"That video is private. Try another.",
  processing:"That video is still processing. Try another.",
  embedding:"That video only plays on YouTube. Try another.",
  age:"That video is age restricted. Try another.",
  region:"That video is blocked in the US. Try another.",
  live:"That video is a live stream. Try another.",
  length:"Pick a video from 1 to 15 minutes.",
  invalid:"That isn't a YouTube link",
});
export const karaokeProblemText = code => PROBLEMS[code] || PROBLEMS.removed;

/* a kept lookup still answers: 30 days with videos, a day without */
export const karaokeLookupFresh = (saved, now = Date.now()) => !!saved && Array.isArray(saved.videos)
  && Number.isFinite(Number(saved.at)) && now - Number(saved.at) <= (saved.videos.length ? KARAOKE_KEEP_MS : KARAOKE_MISS_MS);

/* ── the window's check and the commissioner's ── */
/* each player's saved video and alternates, in that order: { [player]:[id] } */
export function karaokeCheckList(state, players = presentPlayers(state)) {
  const list = {};
  for (const player of players || []) {
    const track = state?.profiles?.[player]?.karaokeTrack;
    const ids = [...new Set([track?.video?.id, ...(Array.isArray(track?.alts) ? track.alts : []).map(alt => alt?.id)]
      .filter(isYouTubeId))];
    if (ids.length && ids[0] === track?.video?.id) list[player] = ids;
  }
  return list;
}

/* The karaokePreflight payload from a check: `bad` (the contract's) names
   each player whose saved video failed and why; `videos` is every checked
   id's own outcome (null: it plays), so the reducer can promote a working
   alternate and ignore a song changed since the check. */
export function karaokePreflight(list, results) {
  const bad = {}, videos = {};
  for (const [player, ids] of Object.entries(list || {})) {
    for (const id of ids) videos[id] = results?.[id]?.ok ? null : results?.[id]?.code || "removed";
    if (videos[ids[0]]) bad[player] = videos[ids[0]];
  }
  return { bad, videos };
}

/* The commissioner's check, per player: ok when some saved video plays,
   `code` the saved one's problem (null when it plays), `video` the first
   that plays (0 the saved one, 1 or 2 an alternate); "none" without a song. */
export function karaokeCheckReport(players, list, results) {
  const out = {};
  for (const player of players || []) {
    const ids = list?.[player];
    if (!ids?.length) { out[player] = { ok:false, code:"none", video:null }; continue; }
    const playing = ids.findIndex(id => results?.[id]?.ok);
    const main = results?.[ids[0]];
    out[player] = { ok:playing >= 0, code:main?.ok ? null : main?.code || "removed", video:playing >= 0 ? playing : null };
  }
  return out;
}

/* A write that opened a pick window (a new game, or a game sent back to
   picking): the game's id, else null. */
export function karaokeWindowOpened(before, after) {
  const game = after?.karaoke;
  if (!game?.id || game.phase !== "pick") return null;
  const prior = before?.karaoke;
  return !prior?.id || prior.id !== game.id || prior.phase !== "pick" || prior.startedAt !== game.startedAt ? game.id : null;
}
