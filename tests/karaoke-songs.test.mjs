/* Karaoke songs (docs/KARAOKE.md, "YouTube"): the karaoke uploads a chosen
   song is found with (one search, one read, kept 30 days), what is kept and
   how it ranks, YouTube's refusals as a guest reads them, the routes and
   their auth, the pick window's check of every saved video, and the picker
   a guest chooses with. Never the network: every YouTube answer is a
   fixture. */
import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { EMPTY_STATE, ROSTER } from "../shared/core.js";
import { songTitle } from "../shared/audio.js";
import { setupTodo } from "../shared/guestSetup.js";
import { KARAOKE_SECONDS, cleanKaraokeTrack, karaokeThumb } from "../shared/karaoke.js";
import {
  KARAOKE_CHANNELS, KARAOKE_CHOICES, KARAOKE_KEEP_MS, KARAOKE_MISS_MS, SING_KING, YouTubeError, checkKaraokeVideos,
  chooseKaraoke, findKaraokeVideos, karaokeCheckList, karaokeCheckReport, karaokeLookupFresh, karaokePlayProblem,
  karaokePreflight, karaokeProblemText, karaokeQuery, karaokeSongName, karaokeWindowOpened, youtubeFailure,
} from "../worker/karaokeVideos.js";
import { YOUTUBE_KEEP_MS } from "../worker/youtube.js";
import { ACTIONS } from "../worker/actions.js";
import { Tournament } from "../worker/tournament.js";
import {
  KARAOKE_CREDIT, karaokeChoice, previewProblem, sameSong, searchCredit, videoChoices, youTubeIdFrom,
} from "../src/features/karaoke/songPick.js";

const DAY = 24 * 60 * 60 * 1000;
const [EVAN, KHOA, ADI] = ROSTER;

/* a videos.list item */
const item = (id, title, { channel = "Stingray Karaoke", channelId = null, duration = "PT4M5S", embeddable = true,
  privacy = "public", upload = "processed", rating = null, region = null, live = "none" } = {}) => ({
  id, snippet:{ title, channelTitle:channel, ...(channelId ? { channelId } : {}), liveBroadcastContent:live },
  contentDetails:{ duration, ...(rating ? { contentRating:{ ytRating:rating } } : {}),
    ...(region ? { regionRestriction:region } : {}) },
  status:{ embeddable, privacyStatus:privacy, uploadStatus:upload },
});
const SONG = { name:"Don't Stop Believin' - Remastered 2022", artists:["Journey"], durationMs:250000 };
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status });
const youtubeError = (status, reason) => reply({ error:{ code:status, message:reason, errors:[{ reason, domain:"youtube" }] } }, status);

test("the search is the first artist, the song's own name and karaoke", () => {
  assert.equal(karaokeQuery({ name:"Mr. Brightside", artists:["The Killers"] }), "The Killers Mr. Brightside karaoke");
  assert.equal(karaokeQuery(SONG), "Journey Don't Stop Believin' karaoke", "a release's suffix is not the song");
  assert.equal(karaokeQuery({ name:"Africa (Radio Edit)", artists:["Toto"] }), "Toto Africa karaoke");
  assert.equal(karaokeQuery({ name:"Señorita (feat. Someone)", artists:["Shawn Mendes", "Camila Cabello"] }),
    "Shawn Mendes Señorita karaoke", "featured artists and the second artist stay out");
  assert.equal(karaokeQuery({ name:"Hey Ya!", artist:"OutKast" }), "OutKast Hey Ya! karaoke");
  assert.equal(karaokeQuery({ name:"" }), "");
  assert.equal(karaokeSongName("Hit 'Em Up - Single Version"), "Hit 'Em Up");
  assert.equal(songTitle("Hit 'Em Up - Single Version"), "Hit 'Em Up", "Home's song line reads the same rule");
});

test("only a karaoke upload an embedded player can play in the US is kept", () => {
  const items = [
    item("singking001", "Journey - Don't Stop Believin' (Karaoke Version)", { channel:"Sing King", channelId:SING_KING.id }),
    item("singking002", "Don't Stop Believin' (Karaoke Version)", { channel:"Sing King Karaoke" }),
    item("topicupload", "Don't Stop Believin' Karaoke", { channel:"Journey - Topic" }),
    item("agerestrict", "Don't Stop Believin' Karaoke", { channel:"Zoom Karaoke", rating:"ytAgeRestricted" }),
    item("usblocked01", "Don't Stop Believin' Karaoke", { channel:"CC Karaoke", region:{ blocked:["US", "DE"] } }),
    item("canadaonly1", "Don't Stop Believin' Karaoke", { channel:"CC Karaoke", region:{ allowed:["CA"] } }),
    item("tooshort001", "Don't Stop Believin' Karaoke", { duration:"PT45S" }),
    item("toolong0001", "Don't Stop Believin' Karaoke", { duration:"PT15M1S" }),
    item("notkaraoke1", "Journey - Don't Stop Believin' (Official Audio)"),
    item("private0001", "Don't Stop Believin' Karaoke", { privacy:"private" }),
    item("processing1", "Don't Stop Believin' Karaoke", { upload:"uploaded" }),
    item("livestream1", "Don't Stop Believin' Karaoke", { live:"live" }),
    item("notembed001", "Don't Stop Believin' Karaoke", { embeddable:false }),
    item("unlisted001", "Journey - Don't Stop Believin' (Karaoke)", { privacy:"unlisted", channel:"Some Uploader" }),
    item("bad id", "Don't Stop Believin' Karaoke"),
  ];
  assert.deepEqual(chooseKaraoke(items, SONG.durationMs, { name:SONG.name }).map(video => video.id), ["unlisted001"]);
  assert.equal(karaokePlayProblem(items[3]), "age");
  assert.equal(karaokePlayProblem(items[4]), "region");
  assert.equal(karaokePlayProblem(items[5]), "region", "an allow list without the US blocks it");
  assert.equal(karaokePlayProblem(items[6]), "length");
  assert.equal(karaokePlayProblem(items[9]), "private");
  assert.equal(karaokePlayProblem(items[10]), "processing");
  assert.equal(karaokePlayProblem(items[11]), "live");
  assert.equal(karaokePlayProblem(items[12]), "embedding");
  assert.equal(karaokePlayProblem(item("fine0000001", "x", { duration:`PT${KARAOKE_SECONDS.min}S` })), null, "60 s is a song");
  assert.equal(karaokePlayProblem(item("fine0000002", "x", { duration:`PT${KARAOKE_SECONDS.max / 60}M` })), null, "15 min is a song");
});

test("the known karaoke channels lead, then the title's words, then the length nearest Spotify's", () => {
  const ranked = chooseKaraoke([
    item("randomchan1", "Don't Stop Believin' karaoke cover", { channel:"Karaoke Bob", duration:"PT4M10S" }),
    item("stingray002", "Journey - Don't Stop Believin' (Karaoke with Lyrics) [Live]", { duration:"PT4M" }),
    item("zoomkaraoke", "Journey - Don't Stop Believin' (Karaoke Version)", { channel:"Zoom Karaoke", duration:"PT4M40S" }),
    item("stingray001", "Don't Stop Believin' (Karaoke Version) - Journey", { channelId:KARAOKE_CHANNELS[0].id,
      channel:"Stingray Karaoke", duration:"PT4M5S" }),
    item("randomchan2", "Don't Stop Believin' Karaoke Instrumental Lyrics", { channel:"Some Channel", duration:"PT4M11S" }),
    item("faithfully1", "Journey - Faithfully (Karaoke Version)", { duration:"PT4M10S" }),
  ], SONG.durationMs, { name:SONG.name });
  assert.equal(ranked.length, KARAOKE_CHOICES);
  assert.deepEqual(ranked.map(video => video.id), ["stingray001", "zoomkaraoke", "randomchan2"],
    "each channel's best before a second from the same one; the artist's other song never");
  assert.deepEqual(ranked[0], { id:"stingray001", title:"Don't Stop Believin' (Karaoke Version) - Journey",
    channel:"Stingray Karaoke", seconds:245 });
  const lone = chooseKaraoke([item("faithfully1", "Journey - Faithfully (Karaoke Version)")], SONG.durationMs, { name:SONG.name });
  assert.deepEqual(lone.map(video => video.id), ["faithfully1"], "the search's best when the song itself is not there");
  /* the same channel's uploads, by name or by id, and the words before the length */
  assert.deepEqual(chooseKaraoke([
    item("stingray003", "Journey - Don't Stop Believin' (Karaoke) [Live]", { duration:"PT4M10S" }),
    item("stingray004", "Don't Stop Believin' (Karaoke Version)", { channelId:KARAOKE_CHANNELS[0].id, channel:"Stingray",
      duration:"PT4M30S" }),
  ], SONG.durationMs, { name:SONG.name }).map(video => video.id), ["stingray004", "stingray003"]);
  assert.deepEqual(chooseKaraoke([
    item("partytyme01", "Don't Stop Believin' (Karaoke)", { channel:"Party Tyme Karaoke" }),
    item("sunfly00001", "Don't Stop Believin' (Karaoke)", { channel:"Sunfly Karaoke" }),
    item("karafun0001", "Don't Stop Believin' | Karaoke Version | KaraFun", { channel:"KaraFun" }),
  ], SONG.durationMs, { name:SONG.name }).map(video => video.id), ["sunfly00001", "karafun0001", "partytyme01"]);
});

test("one search and one read, titles from the read, never the search's escaped ones", async () => {
  const calls = [];
  const youtube = async url => {
    calls.push(new URL(url));
    return String(url).includes("/search?")
      ? reply({ items:[{ id:{ videoId:"stingray001" }, snippet:{ title:"Don&#39;t Stop Believin&#39; (Karaoke)" } },
        { id:{ videoId:"bad" } }, { id:{ kind:"youtube#channel" } }] })
      : reply({ items:[item("stingray001", "Don't Stop Believin' (Karaoke Version) - Journey & Friends")] });
  };
  const videos = await findKaraokeVideos(SONG, "key", youtube);
  assert.deepEqual(videos, [{ id:"stingray001", title:"Don't Stop Believin' (Karaoke Version) - Journey & Friends",
    channel:"Stingray Karaoke", seconds:245 }]);
  assert.equal(calls.length, 2);
  const [search, read] = calls;
  assert.equal(search.pathname, "/youtube/v3/search");
  for (const [name, value] of Object.entries({ part:"snippet", type:"video", videoEmbeddable:"true", videoSyndicated:"true",
    regionCode:"US", relevanceLanguage:"en", maxResults:"15", safeSearch:"none", q:"Journey Don't Stop Believin' karaoke", key:"key" }))
    assert.equal(search.searchParams.get(name), value, name);
  assert.equal(search.searchParams.get("videoCategoryId"), null, "karaoke uploads are filed in any category");
  assert.equal(read.pathname, "/youtube/v3/videos");
  assert.equal(read.searchParams.get("part"), "snippet,contentDetails,status");
  assert.equal(read.searchParams.get("id"), "stingray001", "only well-formed video ids are read");
  assert.deepEqual(await findKaraokeVideos(SONG, "key", async () => reply({ items:[] })), [], "nothing found reads nothing");
});

test("YouTube's refusals are typed, so a guest is told what to do", async () => {
  const quota = await findKaraokeVideos(SONG, "key", async () => youtubeError(403, "quotaExceeded")).catch(error => error);
  assert.ok(quota instanceof YouTubeError);
  assert.equal(quota.reason, "quotaExceeded");
  assert.deepEqual(youtubeFailure(quota), { status:429, code:"quota", error:"YouTube's daily limit is used up. Paste a YouTube link." });
  const read = await checkKaraokeVideos(["stingray001"], "key", async () => youtubeError(403, "dailyLimitExceeded")).catch(error => error);
  assert.equal(youtubeFailure(read).error, "YouTube's daily limit is used up. Try again tomorrow.", "a pasted link reads videos.list");
  assert.equal(youtubeFailure(await findKaraokeVideos(SONG, "key", async () => youtubeError(400, "keyInvalid")).catch(e => e)).code, "key");
  assert.equal(youtubeFailure(await findKaraokeVideos(SONG, "key", async () => youtubeError(403, "rateLimitExceeded")).catch(e => e)).code, "busy");
  const broken = await findKaraokeVideos(SONG, "key", async () => new Response("oops", { status:500 })).catch(error => error);
  assert.deepEqual(youtubeFailure(broken), { status:502, code:"failed", error:"YouTube did not answer. Try again" });
  const down = await findKaraokeVideos(SONG, "key", async () => { throw new TypeError("network"); }).catch(error => error);
  assert.equal(youtubeFailure(down).code, "failed");
  assert.equal(karaokeProblemText("embedding"), "That video only plays on YouTube. Try another.");
  assert.doesNotMatch(Object.values({ a:youtubeFailure(quota).error, b:karaokeProblemText("length") }).join(" "), /—|!/);
});

test("saved videos are read again in batches of 50, each with its own outcome", async () => {
  const ids = Array.from({ length:52 }, (_, k) => `video${String(k).padStart(6, "0")}`);
  const reads = [];
  const youtube = async url => {
    const asked = new URL(url).searchParams.get("id").split(",");
    reads.push(asked.length);
    return reply({ items:asked.filter(id => id !== ids[1]).map(id => item(id, "Anything",
      id === ids[2] ? { embeddable:false } : id === ids[3] ? { rating:"ytAgeRestricted" } : {})) });
  };
  const results = await checkKaraokeVideos([...ids, "nope"], "key", youtube);
  assert.deepEqual(reads, [50, 2]);
  assert.equal(results[ids[0]].ok, true, "a pasted video need not say karaoke");
  assert.deepEqual(results[ids[0]].video, { id:ids[0], title:"Anything", channel:"Stingray Karaoke", seconds:245 });
  assert.deepEqual([results[ids[1]].code, results[ids[2]].code, results[ids[3]].code, results.nope.code],
    ["removed", "embedding", "age", "invalid"]);
});

test("a kept lookup answers 30 days with videos and a day without", () => {
  const now = 100 * DAY;
  assert.equal(KARAOKE_KEEP_MS, YOUTUBE_KEEP_MS);
  assert.equal(YOUTUBE_KEEP_MS, 30 * DAY, "YouTube's storage rule");
  assert.equal(karaokeLookupFresh({ videos:[{ id:"x" }], at:now - 30 * DAY }, now), true);
  assert.equal(karaokeLookupFresh({ videos:[{ id:"x" }], at:now - 30 * DAY - 1 }, now), false);
  assert.equal(karaokeLookupFresh({ videos:[], at:now - KARAOKE_MISS_MS }, now), true);
  assert.equal(karaokeLookupFresh({ videos:[], at:now - KARAOKE_MISS_MS - 1 }, now), false);
  assert.equal(karaokeLookupFresh(null, now), false);
  assert.equal(karaokeLookupFresh({ videoId:"x", at:now }, now), false, "never a win song's answer");
});

/* ── the Durable Object ── */
const TRACK_ID = "4bHsxqR3GMrXTxEPLuK5ue";
const DEVICE = "guest-device-0000-4000-8000-000000000001";
const ENV = { APP_ENV:"local", M2_AUDIO_CATALOG_ENABLED:"true", SPOTIFY_CLIENT_ID:"id", SPOTIFY_CLIENT_SECRET:"secret",
  YOUTUBE_API_KEY:"key" };
function memoryContext() {
  const entries = new Map(), sockets = [], pending = [];
  const storage = {
    async get(key) { return structuredClone(entries.get(key)); },
    async put(key, value) {
      if (typeof key === "object") for (const [k, v] of Object.entries(key)) entries.set(k, structuredClone(v));
      else entries.set(key, structuredClone(value));
    },
    async delete(key) { for (const one of Array.isArray(key) ? key : [key]) entries.delete(one); },
    async list({ prefix = "" } = {}) {
      return new Map([...entries].filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k, structuredClone(v)]));
    },
    async transaction(fn) { return fn(storage); },
    async setAlarm() {}, async getAlarm() { return null; }, async deleteAlarm() {},
  };
  return { entries, sockets, pending,
    context:{ blockConcurrencyWhile() {}, getWebSockets:() => sockets, storage, waitUntil:work => pending.push(work) } };
}
async function room(env = ENV) {
  const memory = memoryContext();
  const tournament = new Tournament(memory.context, { ...env });
  await tournament.hydrateFromStorage();
  tournament.gmToken = "gm";
  tournament.claims = { [DEVICE]:EVAN };
  /* LRCLIB stands in: no synced lyrics for anything (tests/karaoke-lyrics.test.mjs has them) */
  tournament.lyricsFetch = async () => reply([]);
  return { tournament, memory };
}
const get = (tournament, path, { gm = false, device = DEVICE, method = "GET" } = {}) => {
  const headers = { ...(gm ? { Authorization:"Bearer gm" } : {}), ...(device ? { "X-Field-Day-Device":device } : {}) };
  const request = new Request(`https://fielddayseries.com${path}`, { method, headers });
  return tournament.fetch(request);
};
const lookup = (query = {}) => `/api/karaoke/videos?${new URLSearchParams({ trackId:TRACK_ID, name:SONG.name, artist:"Journey",
  durationMs:String(SONG.durationMs), ...query })}`;
const stingray = (id = "stingray001") => item(id, "Journey - Don't Stop Believin' (Karaoke Version)");

test("the capability is the Spotify search and the YouTube key together; without it the routes are not there", async () => {
  const on = await room();
  assert.equal(on.tournament.capabilities.karaoke, true);
  assert.equal(on.tournament.capabilities.audioCatalog && on.tournament.capabilities.songSnippets, true);
  const { YOUTUBE_API_KEY, ...noKey } = ENV;
  const { SPOTIFY_CLIENT_SECRET, ...noSpotify } = ENV;
  for (const env of [noKey, noSpotify, { ...ENV, M2_AUDIO_CATALOG_ENABLED:"false" }, { ...ENV, APP_ENV:"" }]) {
    const off = await room(env);
    assert.equal(off.tournament.capabilities.karaoke, false);
    let fetched = 0;
    off.tournament.youtubeFetch = async () => { fetched += 1; return reply({ items:[] }); };
    assert.equal((await get(off.tournament, lookup(), { gm:true })).status, 404);
    assert.equal((await get(off.tournament, "/api/karaoke/video?id=stingray001", { gm:true })).status, 404);
    assert.equal((await get(off.tournament, "/api/admin/karaoke/check", { gm:true })).status, 404);
    assert.equal(fetched, 0);
  }
});

test("a song's lookup: a checked-in guest or the commissioner, once, kept privately 30 days", async () => {
  const { tournament, memory } = await room();
  let calls = 0;
  tournament.youtubeFetch = async url => {
    calls += 1;
    return String(url).includes("/search?") ? reply({ items:[{ id:{ videoId:"stingray001" } }] }) : reply({ items:[stingray()] });
  };
  assert.equal((await get(tournament, lookup(), { device:"someone-else" })).status, 403, "check in first");
  assert.equal((await get(tournament, lookup(), { device:null })).status, 403);
  assert.equal((await get(tournament, lookup(), { method:"POST" })).status, 405);
  assert.equal((await get(tournament, lookup({ trackId:"short" }))).status, 400);
  assert.equal((await get(tournament, lookup({ durationMs:"0" }))).status, 400);
  assert.equal(calls, 0, "a refused ask spends nothing");
  const first = await (await get(tournament, lookup())).json();
  assert.deepEqual(first, { ok:true, videos:[{ id:"stingray001", title:"Journey - Don't Stop Believin' (Karaoke Version)",
    channel:"Stingray Karaoke", seconds:245 }], lyrics:false });
  assert.deepEqual(await (await get(tournament, lookup(), { gm:true, device:null })).json(), first);
  assert.equal(calls, 2, "one search and one read, once for everyone (its karaoke upload: no second search)");
  const key = `private:karaoke:${TRACK_ID}`;
  assert.deepEqual(memory.entries.get(key).videos, first.videos);
  assert.ok(!memory.entries.has(`private:youtube:${TRACK_ID}`), "never the win song's key");
  /* past 30 days the answer is looked up again */
  memory.entries.set(key, { ...memory.entries.get(key), at:Date.now() - YOUTUBE_KEEP_MS - 1000 });
  assert.equal((await get(tournament, lookup())).status, 200);
  assert.equal(calls, 4);
  assert.ok(Date.now() - memory.entries.get(key).at < 5000);
});

test("no karaoke version: a miss is kept a day; a failure is never kept and an expired answer goes", async () => {
  const { tournament, memory } = await room();
  const key = `private:karaoke:${TRACK_ID}`;
  let calls = 0, answer = () => reply({ items:[] });
  tournament.youtubeFetch = async url => { calls += 1; return answer(String(url)); };
  const miss = await get(tournament, lookup());
  assert.equal(miss.status, 404);
  assert.deepEqual(await miss.json(), { ok:false, error:"No karaoke version found. Paste a YouTube link.", code:"none", videos:[],
    lyrics:false });
  assert.equal(calls, 2, "an empty search reads nothing; no instrumental, so karaoke uploads are searched too");
  assert.equal((await get(tournament, lookup())).status, 404);
  assert.equal(calls, 2, "kept for a day");
  const stale = Date.now() - KARAOKE_MISS_MS - 1000;
  memory.entries.set(key, { videos:[], at:stale });
  answer = () => youtubeError(403, "quotaExceeded");
  const quota = await get(tournament, lookup());
  assert.equal(quota.status, 429);
  assert.deepEqual(await quota.json(), { ok:false, error:"YouTube's daily limit is used up. Paste a YouTube link.", code:"quota" });
  assert.equal(calls, 3, "a day-old miss is asked again");
  assert.equal(memory.entries.get(key).at, stale, "the failure is not kept as an answer");
  memory.entries.set(key, { videos:[{ id:"stingray001" }], at:Date.now() - YOUTUBE_KEEP_MS - 1000 });
  await get(tournament, lookup());
  assert.ok(!memory.entries.has(key), "an answer past its 30 days goes even when the refresh fails");
  answer = url => url.includes("/search?") ? reply({ items:[{ id:{ videoId:"stingray001" } }] }) : reply({ items:[stingray()] });
  assert.equal((await get(tournament, lookup())).status, 200, "the next ask looks again");
});

test("the win song's album upload is looked up again after 30 days too", async () => {
  const { tournament, memory } = await room();
  let calls = 0;
  tournament.youtubeFetch = async url => {
    calls += 1;
    return reply(String(url).includes("/search?") ? { items:[{ id:{ videoId:"topicupload" } }] }
      : { items:[{ id:"topicupload", contentDetails:{ duration:"PT4M10S" }, snippet:{ channelTitle:"Journey - Topic" },
        status:{ embeddable:true } }] });
  };
  const snippet = `/api/spotify/snippet?${new URLSearchParams({ trackId:TRACK_ID, name:"Anthem", artist:"Band", durationMs:"250000" })}`;
  const key = `private:youtube:${TRACK_ID}`;
  memory.entries.set(key, { videoId:"oldupload01", at:Date.now() - 29 * DAY });
  assert.deepEqual(await (await get(tournament, snippet)).json(), { ok:true, videoId:"oldupload01" });
  assert.equal(calls, 0, "inside 30 days the kept answer stands");
  memory.entries.set(key, { videoId:"oldupload01", at:Date.now() - YOUTUBE_KEEP_MS - 1000 });
  assert.deepEqual(await (await get(tournament, snippet)).json(), { ok:true, videoId:"topicupload" });
  assert.equal(calls, 2);
  memory.entries.set(key, { videoId:"oldupload01", at:Date.now() - YOUTUBE_KEEP_MS - 1000 });
  tournament.youtubeFetch = async () => youtubeError(403, "quotaExceeded");
  assert.equal((await get(tournament, snippet)).status, 502);
  assert.ok(!memory.entries.has(key), "past 30 days it goes, even when the refresh fails");
});

test("a device starts at most ten lookups a minute; a kept answer is free", async () => {
  const { tournament } = await room();
  tournament.youtubeFetch = async url => String(url).includes("/search?")
    ? reply({ items:[{ id:{ videoId:"stingray001" } }] }) : reply({ items:[stingray()] });
  const track = k => `${"a".repeat(20)}${String(k).padStart(2, "0")}`;
  for (let k = 0; k < 10; k += 1) assert.equal((await get(tournament, lookup({ trackId:track(k) }))).status, 200);
  const limited = await get(tournament, lookup({ trackId:track(10) }));
  assert.equal(limited.status, 429);
  assert.equal((await limited.json()).retryAfter, 60);
  assert.equal((await get(tournament, lookup({ trackId:track(3) }))).status, 200, "kept answers are not lookups");
  assert.equal((await get(tournament, lookup({ trackId:track(10) }), { gm:true, device:null })).status, 200,
    "the commissioner has his own budget");
});

test("a pasted link is one read with the same play checks, answering the video or why not", async () => {
  const { tournament } = await room();
  const reads = [];
  tournament.youtubeFetch = async url => {
    const id = new URL(url).searchParams.get("id");
    reads.push(id);
    return reply({ items:id === "goneforgood" ? [] : [item(id, "Mr. Brightside (Instrumental)", {
      embeddable:id !== "embedblock1", duration:id === "shortclip01" ? "PT30S" : "PT3M42S", channel:"Anyone" })] });
  };
  const ask = id => get(tournament, `/api/karaoke/video?${new URLSearchParams({ id })}`);
  assert.deepEqual(await (await ask("pastedvideo")).json(), { ok:true,
    video:{ id:"pastedvideo", title:"Mr. Brightside (Instrumental)", channel:"Anyone", seconds:222 } });
  const blocked = await ask("embedblock1");
  assert.equal(blocked.status, 422);
  assert.deepEqual(await blocked.json(), { ok:false, error:"That video only plays on YouTube. Try another.", code:"embedding" });
  assert.equal((await (await ask("goneforgood")).json()).code, "removed");
  assert.equal((await (await ask("shortclip01")).json()).error, "Pick a video from 1 to 15 minutes.");
  assert.equal((await ask("not a video")).status, 400);
  assert.deepEqual(reads, ["pastedvideo", "embedblock1", "goneforgood", "shortclip01"], "a malformed id reads nothing");
  assert.equal((await get(tournament, "/api/karaoke/video?id=pastedvideo", { device:"stranger" })).status, 403);
});

/* a saved karaoke song, as the profile keeps it (cleanKaraokeTrack) */
const spotify = (trackId, name, artist) => ({ provider:"spotify", trackId, uri:`spotify:track:${trackId}`,
  url:`https://open.spotify.com/track/${trackId}`, name, artists:[artist], durationMs:240000, imageUrl:null, explicit:false });
const video = (id, channel = "Stingray Karaoke", seconds = 240) => ({ id, title:`${channel} upload`, channel, seconds });
const saved = (trackId, name, main, alts = []) => cleanKaraokeTrack({ ...spotify(trackId, name, "Band"), video:video(main),
  alts:alts.map(id => video(id, "Zoom Karaoke")) }, { now:1 });

test("the commissioner's check reads every roster player's videos at once and stores nothing", async () => {
  const { tournament, memory } = await room();
  tournament.state.profiles[EVAN] = { display:"Evan", karaokeTrack:saved("1".repeat(22), "One", "evanmain001", ["evanalt0001"]) };
  tournament.state.profiles[KHOA] = { display:"Khoa", karaokeTrack:saved("2".repeat(22), "Two", "khoamain001", ["khoaalt0001", "khoaalt0002"]) };
  tournament.state.profiles[ADI] = { display:"Adi", karaokeTrack:saved("3".repeat(22), "Three", "adimain0001") };
  const reads = [];
  tournament.youtubeFetch = async url => {
    const ids = new URL(url).searchParams.get("id").split(",");
    reads.push(ids);
    return reply({ items:ids.filter(id => id !== "adimain0001")
      .map(id => item(id, "Song", { embeddable:id !== "khoamain001" })) });
  };
  /* the tournament's own keys: LRCLIB's answers (private:lyrics:*) are kept as any lookup is */
  const own = () => JSON.stringify([...memory.entries].filter(([key]) => !key.startsWith("private:lyrics:")));
  const before = own();
  assert.equal((await get(tournament, "/api/admin/karaoke/check")).status, 403, "a guest cannot");
  const answer = await (await get(tournament, "/api/admin/karaoke/check", { gm:true, device:null })).json();
  assert.equal(answer.ok, true);
  /* each song says how it will play: no synced lyrics here, so the video's own */
  assert.deepEqual(answer.results[EVAN], { ok:true, code:null, video:0, way:"video" });
  assert.deepEqual(answer.results[KHOA], { ok:true, code:"embedding", video:1, way:"video" }, "an alternate still plays");
  assert.deepEqual(answer.results[ADI], { ok:false, code:"removed", video:null, way:"video" });
  assert.deepEqual(answer.results[ROSTER[3]], { ok:false, code:"none", video:null });
  assert.equal(Object.keys(answer.results).length, ROSTER.length);
  assert.equal(reads.length, 1, "one batched read");
  assert.deepEqual(reads[0].sort(), ["adimain0001", "evanalt0001", "evanmain001", "khoaalt0001", "khoaalt0002", "khoamain001"]);
  assert.equal(own(), before, "read-only");
  assert.deepEqual(karaokeCheckReport([EVAN], {}, {}), { [EVAN]:{ ok:false, code:"none", video:null } });
});

/* ── the pick window's check ── */
const gameOpen = (state, id = "kkaraoke1", phase = "pick", startedAt = Date.now()) => {
  state.karaoke = { id, eventId:"karaoke", startedAt, phase, pickUntil:startedAt + 120000, moreTime:0, ready:{},
    broken:{}, order:[], out:[], songs:{}, index:-1, turns:{}, votes:{} };
  return { ok:true };
};

test("a write that opens a pick window is what the check follows", () => {
  const before = structuredClone(EMPTY_STATE), after = structuredClone(EMPTY_STATE);
  gameOpen(after, "kgame1", "pick", 5);
  assert.equal(karaokeWindowOpened(before, after), "kgame1");
  assert.equal(karaokeWindowOpened(after, structuredClone(after)), null, "already open");
  const turns = structuredClone(after); turns.karaoke.phase = "turns";
  assert.equal(karaokeWindowOpened(after, turns), null);
  const restarted = structuredClone(after); restarted.karaoke.startedAt = 9;
  assert.equal(karaokeWindowOpened(after, restarted), "kgame1", "a restart is a fresh window");
  assert.equal(karaokeWindowOpened(turns, after), "kgame1");
  const state = structuredClone(EMPTY_STATE);
  state.profiles[EVAN] = { karaokeTrack:saved("1".repeat(22), "One", "evanmain001", ["evanalt0001"]) };
  state.profiles[KHOA] = { karaokeTrack:saved("2".repeat(22), "Two", "khoamain001") };
  state.away = { [KHOA]:{ at:1 } };
  assert.deepEqual(karaokeCheckList(state), { [EVAN]:["evanmain001", "evanalt0001"] }, "present players only");
  assert.deepEqual(karaokePreflight({ [EVAN]:["evanmain001", "evanalt0001"] },
    { evanmain001:{ ok:false, code:"embedding" }, evanalt0001:{ ok:true } }),
  { bad:{ [EVAN]:"embedding" }, videos:{ evanmain001:"embedding", evanalt0001:null } });
});

async function stage() {
  const memory = memoryContext();
  const tournament = new Tournament(memory.context, { ...ENV });
  await tournament.hydrateFromStorage();
  tournament.gmToken = "gm";
  tournament.lyricsFetch = async () => reply([]);
  tournament.state.profiles[EVAN] = { display:"Evan", karaokeTrack:saved("1".repeat(22), "One", "evanmain001", ["evanalt0001"]) };
  tournament.state.profiles[KHOA] = { display:"Khoa", karaokeTrack:saved("2".repeat(22), "Two", "khoamain001") };
  const ws = { frames:[], send(frame) { ws.frames.push(JSON.parse(frame)); },
    serializeAttachment(value) { ws.attachment = structuredClone(value); }, deserializeAttachment() { return ws.attachment; },
    close() {} };
  memory.sockets.push(ws);
  await tournament.webSocketMessage(ws, JSON.stringify({ type:"hello", deviceId:"gm-device-0000-4000-8000-000000000001",
    payload:{ view:"app", visible:true } }));
  let seq = 0;
  const say = async (type, payload = {}) => {
    const actionId = `k${++seq}`;
    await tournament.webSocketMessage(ws, JSON.stringify({ actionId, type, payload, deviceId:"gm-device-0000-4000-8000-000000000001",
      gmToken:"gm" }));
    return ws.frames.find(frame => frame.type === "ack" && frame.actionId === actionId);
  };
  const settle = async () => { while (memory.pending.length) await memory.pending.shift(); };
  return { tournament, memory, ws, say, settle };
}
/* the reducers are worker/karaoke.js's (another part of tonight's build);
   these stand in for them, and anything already there comes back after */
async function withStubs(stubs, run) {
  const kept = Object.fromEntries(Object.keys(stubs).map(name => [name, Object.hasOwn(ACTIONS, name) ? ACTIONS[name] : undefined]));
  Object.assign(ACTIONS, stubs);
  try { return await run(); }
  finally { for (const [name, original] of Object.entries(kept)) { if (original) ACTIONS[name] = original; else delete ACTIONS[name]; } }
}

test("the start is never held up: its ack and broadcast leave first, then one read, then karaokePreflight", async () => {
  const world = await stage();
  const preflights = [];
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const reads = [];
  world.tournament.youtubeFetch = async url => {
    reads.push(new URL(url).searchParams.get("id").split(",").sort());
    await gate;
    return reply({ items:[item("evanmain001", "One", { embeddable:false }), item("evanalt0001", "One"), item("khoamain001", "Two")] });
  };
  await withStubs({
    karaokeOpenForTest:state => gameOpen(state),
    karaokePreflight:(state, payload, ctx) => {
      preflights.push({ payload:structuredClone(payload), ctx:{ ...ctx } });
      state.karaoke.broken = { ...payload.bad };
      return { ok:true };
    },
  }, async () => {
    const ack = await world.say("karaokeOpenForTest");
    assert.equal(ack.ok, true);
    const opened = world.ws.frames.find(frame => frame.type === "state" && frame.lastAction === "karaokeOpenForTest");
    assert.ok(opened, "the start is on every screen while YouTube is still answering");
    assert.equal(preflights.length, 0);
    assert.deepEqual(reads, [["evanalt0001", "evanmain001", "khoamain001"]], "one batched read of every saved video");
    release();
    await world.settle();
    assert.equal(preflights.length, 1);
    assert.deepEqual(preflights[0].payload, { gameId:"kkaraoke1", bad:{ [EVAN]:"embedding" },
      videos:{ evanmain001:"embedding", evanalt0001:null, khoamain001:null } });
    assert.equal(preflights[0].ctx.isGm, true);
    assert.equal(preflights[0].ctx.auto, true, "an autopilot write: it never needs a commissioner present");
    assert.equal(preflights[0].ctx.karaoke, true);
    assert.deepEqual(world.tournament.state.karaoke.broken, { [EVAN]:"embedding" });
    assert.ok(world.ws.frames.some(frame => frame.type === "state" && frame.lastAction === "karaokePreflight"), "broadcast");
  });
});

test("a failed read, a refused check or a closed window writes nothing and never fails the start", async () => {
  for (const scenario of ["quota", "refused", "closed", "throws"]) {
    const world = await stage();
    let preflights = 0;
    world.tournament.youtubeFetch = async () => {
      if (scenario === "quota") return youtubeError(403, "quotaExceeded");
      if (scenario === "closed") world.tournament.state.karaoke = { ...world.tournament.state.karaoke, phase:"turns" };
      return reply({ items:[item("evanmain001", "One"), item("evanalt0001", "One"), item("khoamain001", "Two")] });
    };
    await withStubs({
      karaokeOpenForTest:state => gameOpen(state),
      /* the lyrics' own write is tests/karaoke-lyrics.test.mjs's */
      karaokeLyrics:() => ({ ok:true, extra:{ unchanged:true } }),
      karaokePreflight:() => {
        preflights += 1;
        if (scenario === "throws") throw new Error("boom");
        return scenario === "refused" ? { ok:false, error:"No" } : { ok:true };
      },
    }, async () => {
      assert.equal((await world.say("karaokeOpenForTest")).ok, true, scenario);
      const version = world.tournament.version;
      await world.settle();
      assert.equal(world.tournament.version, version, `${scenario}: nothing written`);
      assert.equal(preflights, scenario === "refused" || scenario === "throws" ? 1 : 0, scenario);
      assert.equal(world.tournament.state.karaoke.phase, scenario === "closed" ? "turns" : "pick");
    });
  }
  /* without the reducer there is nothing to write, so YouTube is not asked */
  const bare = await stage();
  let asked = 0;
  bare.tournament.youtubeFetch = async () => { asked += 1; return reply({ items:[] }); };
  const hadPreflight = Object.hasOwn(ACTIONS, "karaokePreflight") ? ACTIONS.karaokePreflight : null;
  delete ACTIONS.karaokePreflight;
  try {
    await withStubs({ karaokeOpenForTest:state => gameOpen(state) }, async () => {
      assert.equal((await bare.say("karaokeOpenForTest")).ok, true);
      await bare.settle();
    });
  } finally { if (hadPreflight) ACTIONS.karaokePreflight = hadPreflight; }
  assert.equal(asked, 0);
});

/* ── the picker ── */
test("a pasted link's id: every YouTube address a phone shares, or nothing", () => {
  for (const link of ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s", "youtube.com/watch?v=dQw4w9WgXcQ",
    "https://m.youtube.com/watch?v=dQw4w9WgXcQ", "https://music.youtube.com/watch?v=dQw4w9WgXcQ&si=x",
    "https://youtu.be/dQw4w9WgXcQ?si=abc", "https://www.youtube.com/shorts/dQw4w9WgXcQ", " https://www.youtube.com/embed/dQw4w9WgXcQ ",
    "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ", "https://www.youtube.com/live/dQw4w9WgXcQ", "dQw4w9WgXcQ"])
    assert.equal(youTubeIdFrom(link), "dQw4w9WgXcQ", link);
  for (const link of ["", "hello", "https://vimeo.com/123456789", "https://www.youtube.com/watch?v=short",
    "https://evil.example/watch?v=dQw4w9WgXcQ", "https://www.youtube.com/channel/UCYi9TC1HC_U2kaRAK6I4FSQ"])
    assert.equal(youTubeIdFrom(link), null, link);
});

const TRACK = { ...spotify("4bHsxqR3GMrXTxEPLuK5ue", "Don't Stop Believin'", "Journey"), imageUrl:"https://i.scdn.co/image/ab67616d0000b273abc",
  durationMs:250000, startMs:0, isrc:"USSM18100116" };
const FOUND = [
  { id:"stingray001", title:"Journey - Don't Stop Believin' (Karaoke Version)", channel:"Stingray Karaoke", seconds:245 },
  { id:"zoomkaraoke", title:"Don't Stop Believin' (Karaoke Version)", channel:"Zoom Karaoke", seconds:280 },
  { id:"randomchan2", title:"Don't Stop Believin' Karaoke Instrumental", channel:"Some Channel", seconds:251 },
];

test("Use saves the song with its video and the rest as alternates, in the profile's own shape", () => {
  const pasted = { id:"pastedvideo", title:"Mine", channel:"Anyone", seconds:222, thumb:"data:image/png;base64,x" };
  const choices = videoChoices(FOUND, pasted);
  assert.deepEqual(choices.map(one => one.id), ["pastedvideo", "stingray001", "zoomkaraoke", "randomchan2"]);
  assert.deepEqual(videoChoices([...FOUND, FOUND[0]], FOUND[1]).map(one => one.id), ["zoomkaraoke", "stingray001", "randomchan2"]);
  const choice = karaokeChoice(TRACK, FOUND[1], choices);
  assert.equal(choice.startMs, undefined, "a karaoke song has no start point");
  assert.deepEqual(choice.video, FOUND[1]);
  assert.deepEqual(choice.alts.map(one => one.id), ["pastedvideo", "stingray001"]);
  assert.equal(choice.alts[0].thumb, undefined, "only id, title, channel and seconds ride along");
  const kept = cleanKaraokeTrack(choice, { now:7 });
  assert.ok(kept, "the reducer's own cleaner takes it whole");
  assert.deepEqual(kept.video, FOUND[1]);
  assert.equal(kept.alts.length, 2);
  assert.equal(kept.isrc, "USSM18100116");
  assert.equal(sameSong(kept, choice), true);
  assert.equal(sameSong(kept, { ...choice, video:FOUND[0] }), false);
  assert.equal(searchCredit(true), "Songs from Spotify. Previews from Deezer.");
  assert.equal(searchCredit(false), "Songs from Spotify.", "muted: the covers play nothing");
  assert.equal(previewProblem(150), "That video only plays on YouTube. Try another.");
  assert.equal(previewProblem(100), "That video is gone. Try another.");
});

test("Home lists a karaoke song only where the picker is on, until one is saved", () => {
  const state = structuredClone(EMPTY_STATE);
  state.profiles[EVAN] = { display:"Evan", color:"#fff", photoV:1, backName:"EVAN", num:7, size:"L",
    jerseyOk:{ name:"EVAN", num:7, size:"L", at:1 }, venmo:"evan", drinking:true };
  assert.deepEqual(setupTodo(state, EVAN), [], "nothing new for a caller that does not ask");
  assert.deepEqual(setupTodo(state, EVAN, { songs:true, karaoke:true }).map(row => row.id), ["song", "karaoke"]);
  assert.deepEqual(setupTodo(state, EVAN, { karaoke:true }), [{ id:"karaoke", section:"karaoke", label:"Pick a karaoke song" }]);
  state.profiles[EVAN].karaokeTrack = saved("1".repeat(22), "One", "evanmain001");
  assert.deepEqual(setupTodo(state, EVAN, { karaoke:true }), []);
});

const root = fileURLToPath(new URL("../", import.meta.url));
const compiled = await build({
  stdin:{ contents:[
    'export { KaraokeSongPicker, VideoStep } from "./src/features/karaoke/KaraokeSongPicker.jsx";',
    'export { clipStarting, onClipStart } from "./src/features/music/previewPlayer.js";',
  ].join("\n"), resolveDir:root, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react"], loader:{ ".css":"empty" }, write:false, logLevel:"silent",
  plugins:[{ name:"karaoke-client", setup(builder) {
    builder.onLoad({ filter:/[\\/]src[\\/]lib[\\/]client\.js$/ }, () => ({ loader:"js",
      contents:`export const spotifySearch = async () => ({ ok:true, tracks:[] });
        export const songPreview = async () => ({ ok:false });
        export const songSnippet = async () => ({ ok:false });
        export const karaokeVideos = async () => ({ ok:false });
        export const karaokeVideo = async () => ({ ok:false });` }));
  } }],
});
const bundle = new Module(fileURLToPath(new URL("karaoke-songs.cjs", import.meta.url)));
bundle.filename = bundle.id;
bundle.paths = Module._nodeModulePaths(root);
bundle._compile(compiled.outputFiles[0].text, bundle.filename);
const { KaraokeSongPicker, VideoStep, clipStarting, onClipStart } = bundle.exports;

const textOf = values => values.map(value => Array.isArray(value) ? textOf(value)
  : React.isValidElement(value) ? textOf([value.props.children])
    : typeof value === "string" || typeof value === "number" ? String(value) : "").join("");
function render(element) {
  const buttons = [];
  const createElement = React.createElement;
  React.createElement = (type, props, ...children) => {
    if (type === "button" && props?.onClick)
      buttons.push({ name:props["aria-label"] || textOf(children), click:props.onClick, disabled:!!props.disabled });
    return createElement(type, props, ...children);
  };
  let html;
  try { html = renderToStaticMarkup(element); } finally { React.createElement = createElement; }
  return { html, buttons };
}
const plain = html => html.replace(/<[^>]+>/g, " ");

test("with no song the picker opens on Spotify's search; muted, the covers play nothing", () => {
  const { html } = render(React.createElement(KaraokeSongPicker, { value:null, onChoose:async () => ({ ok:true }) }));
  assert.match(html, /aria-label="Search Spotify"/);
  assert.match(html, /Songs from Spotify\. Previews from Deezer\./);
  assert.doesNotMatch(html, />Cancel</);
  const muted = render(React.createElement(KaraokeSongPicker, { value:null, muted:true, compact:true, onChoose:async () => ({ ok:true }) }));
  assert.match(muted.html, /class="fd-song fd-ksong is-compact"/);
  assert.match(muted.html, /<p class="fd-song-credit">Songs from Spotify\.<\/p>/);
  assert.equal(render(React.createElement(KaraokeSongPicker, { value:null, enabled:false })).html, "", "off and empty: nothing");
});

test("a saved song shows its cover, its video's thumbnail, channel and length, and Change", () => {
  const value = cleanKaraokeTrack({ ...TRACK, video:FOUND[0], alts:FOUND.slice(1) }, { now:1 });
  const { html, buttons } = render(React.createElement(KaraokeSongPicker, { value, onChoose:async () => ({ ok:true }) }));
  assert.match(html, /Don&#x27;t Stop Believin&#x27;/);
  assert.match(html, /<small data-fit="ellipsis">Journey<\/small>/);
  assert.match(html, /aria-label="Play a preview of Don&#x27;t Stop Believin&#x27;"/, "the cover plays its clip");
  assert.match(html, new RegExp(`<img src="${karaokeThumb("stingray001")}" alt="" width="128" height="72"`),
    "YouTube's thumbnail, at least 120 by 70, starts the preview");
  assert.match(html, />Stingray Karaoke<\/strong><small>4:05<span class="fd-kway is-video fd-ksong-way"><i class="fd-insert is-done" aria-hidden="true"><\/i>Video lyrics<\/span><\/small>/,
    "a karaoke upload plays its own words: the lamp unlit");
  assert.ok(buttons.some(button => button.name === "Change"));
  assert.ok(buttons.some(button => button.name === "Preview Journey - Don't Stop Believin' (Karaoke Version)"));
  assert.ok(!buttons.some(button => /^Use/.test(button.name)), "nothing to use: it is the song");
  assert.match(html, new RegExp(`<p class="fd-song-credit">${KARAOKE_CREDIT.replace(/\./g, "\\.")}</p>`));
  assert.doesNotMatch(html, /—|!|speaker/i);
  assert.doesNotMatch(html, /fd-ksong-player/, "no player until a thumbnail is tapped");
  const muted = render(React.createElement(KaraokeSongPicker, { value, muted:true, onChoose:async () => ({ ok:true }) })).html;
  assert.doesNotMatch(muted, /Play a preview/, "muted: the cover is still");
  const off = render(React.createElement(KaraokeSongPicker, { value, enabled:false }));
  assert.match(off.html, /Stingray Karaoke/);
  assert.ok(!off.buttons.some(button => button.name === "Change"), "without the picker the song only shows");
});

test("the song picked: the server looking, up to three videos with Use, none, a failure, a pasted link", async () => {
  const step = props => render(React.createElement(VideoStep, { track:TRACK, found:{ status:"done", videos:[], error:"" },
    onChange() {}, onRetry() {}, onUse() {}, check:async () => ({ ok:false }), onPasted() {}, ...props }));
  const finding = step({ found:{ status:"finding", videos:[], error:"" } });
  assert.match(finding.html, /Finding karaoke versions/);
  assert.match(finding.html, /placeholder="Paste a YouTube link"/, "the link field never waits on the lookup");
  assert.ok(finding.buttons.some(button => button.name === "Change" && !button.disabled));
  const used = [];
  const found = step({ found:{ status:"done", videos:FOUND, error:"" }, onUse:video => used.push(video.id) });
  assert.equal((found.html.match(/class="fd-ksong-thumb"/g) || []).length, 3);
  assert.equal((found.html.match(/width="128" height="72"/g) || []).length, 3);
  assert.match(plain(found.html), /Zoom Karaoke\s+4:40/);
  found.buttons.find(button => button.name === "Use the Zoom Karaoke video").click();
  assert.deepEqual(used, ["zoomkaraoke"]);
  assert.match(found.html, /Songs from Spotify\. Videos from YouTube\./);
  const none = step({ found:{ status:"done", videos:[], error:"No karaoke version found. Paste a YouTube link." } });
  assert.match(none.html, /No karaoke version found\. Paste a YouTube link\./);
  assert.ok(!none.buttons.some(button => button.name === "Try again"));
  const failed = step({ found:{ status:"error", videos:[], error:"YouTube's daily limit is used up. Paste a YouTube link." } });
  assert.match(failed.html, /class="is-error">YouTube&#x27;s daily limit is used up/);
  assert.ok(failed.buttons.some(button => button.name === "Try again"));
  const saving = step({ found:{ status:"done", videos:FOUND, error:"" }, saving:"stingray001" });
  assert.ok(saving.buttons.filter(button => /^Use the/.test(button.name)).every(button => button.disabled));
  assert.match(saving.html, />Saving</);
  const refused = step({ found:{ status:"done", videos:FOUND, error:"" }, error:"Your song didn't save. Tap Use again." });
  assert.match(refused.html, /role="alert">Your song didn&#x27;t save\. Tap Use again\./);
  const pasted = step({ candidates:videoChoices(FOUND, { id:"pastedvideo", title:"Mine", channel:"Anyone", seconds:200 }) });
  assert.match(pasted.html, /aria-label="Use the Anyone video"/);
  for (const view of [finding, found, none, failed, saving, refused, pasted]) assert.doesNotMatch(view.html, /—|!/);
});

test("one source plays at a time: whatever starts stops every other player", () => {
  const stopped = [];
  const a = () => stopped.push("snippet"), b = () => stopped.push("karaoke");
  const offA = onClipStart(a), offB = onClipStart(b);
  clipStarting(b);
  assert.deepEqual(stopped, ["snippet"], "the karaoke preview starting stops the win song's snippet");
  clipStarting();
  assert.deepEqual(stopped, ["snippet", "snippet", "karaoke"], "a Deezer clip starting stops both");
  offA(); offB();
  clipStarting();
  assert.equal(stopped.length, 3, "a closed player is never called");
});
