/* Karaoke's own lyrics (docs/KARAOKE.md "Lyrics", Oct 15): a song sung over
   an instrumental upload shows LRCLIB's synced lyrics on the TV and the
   singer's phone, timed to the video, with the commissioner's nudge. LRC
   parsing and the timing model (shared/karaokeLyrics.js), an upload's kind
   and the order a song's uploads play in (shared/karaoke.js), the
   instrumental search and its ranking (worker/karaokeVideos.js), LRCLIB
   (worker/lyrics.js), the writes (karaokeSong, karaokeLyrics,
   karaokeNudge), who gets the words (projectKaraoke, publicState), the
   Durable Object's lookups (LRCLIB and YouTube stood in), and the screens'
   pieces. Nothing here reaches YouTube or LRCLIB. */
import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { EMPTY_STATE, ROSTER, allEventsOf, resolveCurrentContest } from "../shared/core.js";
import {
  KARAOKE_UP_MS, cleanKaraokeTrack, karaokeArrange, karaokeLinesFor, karaokeLyricsWanted, karaokeSinger, karaokeSongWay,
  karaokeTurn, karaokeTurnWay, karaokeVideoKind, karaokeWay, projectKaraoke,
} from "../shared/karaoke.js";
import {
  LYRICS_HOLD_MS, LYRICS_NUDGE_MAX_MS, cleanLyrics, cleanLyricsOffset, lyricClockMs, lyricCue, lyricsOffsetText, parseLrc,
  wordFill,
} from "../shared/karaokeLyrics.js";
import {
  INSTRUMENTAL_MATCH_MS, backingQuery, chooseBacking, chooseInstrumentals, findBackingVideos, instrumentalProblem,
} from "../worker/karaokeVideos.js";
import { LYRICS_USER_AGENT, chooseLyrics, findLyrics, lyricsFresh, lyricsKey } from "../worker/lyrics.js";
import { PREVIEW_TTL_MS, previewCache } from "../worker/previews.js";
import { publicState } from "../worker/publicState.js";
import { Tournament } from "../worker/tournament.js";
import { nudgeText, nudged, karaokeDeskRows } from "../src/features/karaoke/deskModel.js";
import { candidateWay, karaokeChoice } from "../src/features/karaoke/songPick.js";
import { KARAOKE_LYRIC_VIDEO_BOX, KARAOKE_LYRIC_PLATE, KARAOKE_LYRIC_STAGE, karaokeLyricSize } from "../src/features/tv/karaokeTv.js";
import { KARAOKE_FIT_LYRICS } from "../dev/fit/karaokeLyricsFixture.js";
import { karaokeStage } from "../dev/fit/karaokeFixtures.js";
import { karaokePhoneStage } from "../dev/fit/karaokePhoneFixtures.js";
import { applyAction } from "./support/confirmed-start.mjs";

let serial = 0;
const GM = { isGm:true, qa:true, progressReset:true, environment:"local", karaoke:true };
const gm = (extra = {}) => ({ ...GM, player:null, deviceId:"gm", actionId:`g${++serial}`, ...extra });
const system = () => ({ isGm:true, auto:true, player:null, deviceId:"autopilot", actionId:`s${++serial}`, environment:"local",
  karaoke:true });
const as = (player, extra = {}) => ({ isGm:false, player, deviceId:`d-${player}`, actionId:`p${++serial}`, ...extra });
const act = (state, type, payload, ctx = gm()) => {
  const result = applyAction(state, type, payload, ctx);
  assert.equal(result.ok, true, `${type}: ${result.error}`);
  return result;
};
const at = (ms, fn) => { const real = Date.now; Date.now = () => ms; try { return fn(); } finally { Date.now = real; } };
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status });

/* ── LRC ── */
test("LRC: every stamp a line, metadata skipped, [offset] applied, enhanced word stamps kept as words", () => {
  const lines = parseLrc([
    "[ar:Journey]", "[ti:Don't Stop]", "[length: 04:10]", "[offset:+200]",
    "[00:12.50]Just a small town girl", "[00:16.00]", "[00:17.2][01:20.000] Livin' in a  lonely world ",
    "[00:20.00]<00:20.00> Took <00:20.50> the <00:20.80> midnight", "not a line", "[xx:yy]nope",
  ].join("\r\n"));
  assert.deepEqual(lines.map(line => [line.t, line.text]), [[12300, "Just a small town girl"], [15800, ""],
    [17000, "Livin' in a lonely world"], [19800, "Took the midnight"], [79800, "Livin' in a lonely world"]]);
  assert.deepEqual(lines[3].words, [{ t:19800, text:"Took" }, { t:20300, text:"the" }, { t:20600, text:"midnight" }]);
  assert.deepEqual(parseLrc(""), []);
  assert.deepEqual(parseLrc(null), []);
});

test("what a write may store: sorted whole ms, bounded, no break first or twice, null with no words", () => {
  assert.equal(cleanLyrics(null), null);
  assert.equal(cleanLyrics([{ t:5, text:"" }, { t:9, text:"  " }]), null);
  const kept = cleanLyrics([{ t:9000.4, text:"Two" }, { t:-5, text:"bad" }, { t:1000, text:"" }, { t:4000, text:"One\u0007 " },
    { t:5000, text:"" }, { t:6000, text:"" }, { t:"x", text:"bad" }, { t:12000, text:"" }, { t:3.6e9, text:"too late" }, "junk",
    { t:10000, text:"x".repeat(400) }]);
  assert.deepEqual(kept.map(line => [line.t, line.text.length > 20 ? line.text.length : line.text]),
    [[4000, "One"], [5000, ""], [9000, "Two"], [10000, 160]]);
  assert.equal(cleanLyrics(Array.from({ length:900 }, (_, k) => ({ t:k * 100, text:`l${k}` }))).length, 400);
});

/* ── the timing model ── */
test("the cue: nothing before the first line (the next waits), a line swept word by word, a break, the end", () => {
  const lines = cleanLyrics([{ t:6000, text:"Lights come up" }, { t:9000, text:"" }, { t:12000, text:"Every word on the glass" },
    { t:13000, text:"Then home" }]);
  const before = lyricCue(lines, 2000);
  assert.equal(before.line, null);
  assert.equal(before.next.text, "Lights come up");
  const mid = lyricCue(lines, 6000 + 700);
  assert.equal(mid.line.text, "Lights come up");
  assert.equal(mid.next.text, "Every word on the glass", "a break is never the next line");
  /* 13 characters at the singing pace: 1,200 ms the line's sweep */
  assert.ok(Math.abs(mid.progress - 700 / 1200) < 1e-9);
  assert.deepEqual(mid.words.map(word => word.text), ["Lights", "come", "up"]);
  assert.equal(mid.words[0].a, 0);
  assert.equal(mid.words.at(-1).b, 1);
  assert.equal(wordFill(mid.words[0], mid.progress), 1, "the first word is lit");
  assert.equal(wordFill(mid.words[2], mid.progress), 0, "the last is still dark");
  assert.ok(wordFill(mid.words[1], mid.progress) > 0 && wordFill(mid.words[1], mid.progress) < 1, "the sweep runs through the middle one");
  assert.equal(lyricCue(lines, 8500).progress, 1, "sung: it stays lit until the next");
  const rest = lyricCue(lines, 9500);
  assert.equal(rest.line, null, "a break");
  assert.equal(rest.next.text, "Every word on the glass");
  /* a line never sweeps past the next one's start */
  assert.equal(lyricCue(lines, 12999).progress < 1, true);
  assert.ok(Math.abs(lyricCue(lines, 12000 + 999.9).progress - 999.9 / 1000) < 1e-9);
  assert.equal(lyricCue(lines, 13000 + 1200 + LYRICS_HOLD_MS + 1).line, null, "the last line goes once sung and held");
  assert.equal(lyricCue([], 5000).line, null);
  assert.equal(lyricCue(lines, NaN).line, null);
});

test("word stamps time the words themselves", () => {
  const [line] = parseLrc("[00:10.00]<00:10.00> Hold <00:11.00> the <00:11.50> note");
  const cue = lyricCue([line], 11200);
  assert.deepEqual(cue.words.map(word => word.text), ["Hold", "the", "note"]);
  const share = word => wordFill(word, cue.progress);
  assert.equal(share(cue.words[0]), 1);
  assert.ok(share(cue.words[1]) > 0.3 && share(cue.words[1]) < 0.5);
  assert.equal(share(cue.words[2]), 0);
});

test("the phones' clock: the video's position on the server clock (from a TV's real start) plus the nudge", () => {
  assert.equal(lyricClockMs(null, 5), null);
  assert.equal(lyricClockMs({ songAt:null }, 5), null);
  assert.equal(lyricClockMs({ songAt:1000 }, 4000), 3000);
  assert.equal(lyricClockMs({ songAt:1000, playedAt:2500 }, 4000), 1500, "an ad or a slow load moves the start");
  assert.equal(lyricClockMs({ songAt:1000 }, 4000, 500), 3500, "earlier: the words come sooner");
  assert.equal(lyricClockMs({ songAt:1000 }, 4000, -250), 2750);
  assert.equal(lyricClockMs({ songAt:5000 }, 4000), 0, "never before the start");
});

test("the nudge: quarter seconds, ten at most either way, lettered for the desk", () => {
  assert.equal(cleanLyricsOffset(370), 250);
  assert.equal(cleanLyricsOffset(-99999), -LYRICS_NUDGE_MAX_MS);
  assert.equal(cleanLyricsOffset("x"), 0);
  assert.equal(lyricsOffsetText(-1250), "-1.25 s");
  assert.equal(nudgeText(0), "0 s");
  assert.equal(nudgeText(500), "0.5 s earlier");
  assert.equal(nudgeText(-250), "0.25 s later");
  assert.equal(nudged(0, true), 250);
  assert.equal(nudged(250, false), 0);
  assert.equal(nudged(LYRICS_NUDGE_MAX_MS, true), LYRICS_NUDGE_MAX_MS);
});

/* ── an upload's kind and the way a song plays ── */
const video = (id, title, seconds = 250) => ({ id, title, channel:"Somebody", seconds });
const KAR = video("karaoke0001", "Journey - Don't Stop Believin' (Karaoke Version)");
const INS = video("instrumen01", "Journey - Don't Stop Believin' (Official Instrumental)");
const LYRIC = cleanLyrics([{ t:1000, text:"Just a small town girl" }]);
const song = (fields = {}) => ({ provider:"spotify", trackId:"4bHsxqR3GMrXTxEPLuK5ue", uri:"spotify:track:4bHsxqR3GMrXTxEPLuK5ue", name:"Don't Stop Believin'",
  artists:["Journey"], durationMs:250000, video:KAR, alts:[], ...fields });

test("an upload's kind from its title: words on it are karaoke, the backing alone instrumental; the song's own words never count", () => {
  assert.equal(karaokeVideoKind(KAR), "karaoke");
  assert.equal(karaokeVideoKind(INS), "instrumental");
  assert.equal(karaokeVideoKind({ title:"Song (Instrumental with Lyrics)" }), "karaoke", "lyrics on screen");
  assert.equal(karaokeVideoKind({ title:"Song - Backing Track" }), "instrumental");
  assert.equal(karaokeVideoKind({ title:"Song (No Vocals)" }), "instrumental");
  assert.equal(karaokeVideoKind({ title:"Song (Official Video)" }), "other");
  assert.equal(karaokeVideoKind({ title:"Singalong Forever (Instrumental)" }, "Singalong Forever"), "instrumental");
  assert.equal(karaokeVideoKind({ title:"Singalong Forever (Instrumental)" }), "karaoke");
  /* a release suffix on the song's name ("- Remastered 2011", "(Live)") is not
     part of the name the title carries */
  assert.equal(karaokeVideoKind({ title:"Lyrics Of Love (Instrumental)" }, "Lyrics Of Love - Remastered 2011"), "instrumental");
  assert.equal(karaokeVideoKind({ title:"Lyrics Of Love (Karaoke)" }, "Lyrics Of Love - Remastered 2011"), "karaoke");
  assert.equal(karaokeVideoKind({ title:"Singalong Forever - Instrumental" }, "Singalong Forever (Live)"), "instrumental");
});

test("the way: our lyrics only over an instrumental with synced lyrics; a song's uploads arranged for it", () => {
  assert.equal(karaokeWay(INS, true), "lyrics");
  assert.equal(karaokeWay(INS, false), "video");
  assert.equal(karaokeWay(KAR, true), "video");
  assert.equal(karaokeWay(null, true), "card");
  /* saved before instrumentals were offered (lyrics unknown): an instrumental among its uploads goes first with lyrics */
  const legacy = song({ alts:[INS] });
  assert.equal(karaokeArrange(legacy, LYRIC).video.id, INS.id);
  assert.deepEqual(karaokeArrange(legacy, LYRIC).alts.map(item => item.id), [KAR.id]);
  assert.equal(karaokeSongWay(legacy, LYRIC), "lyrics");
  assert.equal(karaokeArrange(legacy, false), legacy, "no lyrics: as it was");
  /* a guest who chose the karaoke upload over the offered instrumental keeps it */
  const chosen = song({ alts:[INS], lyrics:true });
  assert.equal(karaokeArrange(chosen, LYRIC), chosen);
  assert.equal(karaokeSongWay(chosen, LYRIC), "video");
  /* the window's upgrade: the instrumental found for a song that has none */
  const upgrade = { trackId:legacy.trackId, video:INS };
  assert.equal(karaokeArrange(song(), LYRIC, upgrade).video.id, INS.id);
  assert.equal(karaokeArrange(song(), LYRIC, { ...upgrade, trackId:"another" }).video.id, KAR.id, "never another song's");
  assert.equal(karaokeArrange(song(), LYRIC, { trackId:legacy.trackId, video:KAR }).video.id, KAR.id, "never a karaoke upload");
  /* an instrumental with no lyrics found: its karaoke upload plays first */
  const instrumental = song({ video:INS, alts:[KAR], lyrics:true });
  assert.equal(karaokeArrange(instrumental, false).video.id, KAR.id);
  assert.equal(karaokeSongWay(instrumental, false), "video");
  assert.equal(karaokeSongWay(instrumental), "lyrics", "the profile's own word");
  assert.equal(karaokeSongWay(song({ video:INS, lyrics:false })), "video");
  assert.equal(karaokeSongWay(null), null);
});

test("a saved song keeps its lyrics and nudge; a phone's word on them is not taken", () => {
  const track = cleanKaraokeTrack({ ...song({ video:INS }), uri:"spotify:track:4bHsxqR3GMrXTxEPLuK5ue", lyrics:true, lyricsOffset:510 });
  assert.equal(track.lyrics, true);
  assert.equal(track.lyricsOffset, 500);
  assert.equal("lyrics" in cleanKaraokeTrack({ ...song(), uri:"spotify:track:4bHsxqR3GMrXTxEPLuK5ue", lyrics:"yes" }), false);
  const state = structuredClone(EMPTY_STATE);
  const [EVAN] = ROSTER;
  /* no kept answer: unknown, whatever the phone says */
  act(state, "karaokeSong", { track:{ ...song({ video:INS }), lyrics:true, lyricsOffset:2000 } }, as(EVAN));
  assert.equal("lyrics" in state.profiles[EVAN].karaokeTrack, false);
  assert.equal("lyricsOffset" in state.profiles[EVAN].karaokeTrack, false);
  /* the Durable Object's kept answer rides in ctx */
  act(state, "karaokeSong", { track:{ ...song({ video:INS }), lyrics:false } }, as(EVAN, { karaokeLyrics:{ [song().trackId]:true } }));
  assert.equal(state.profiles[EVAN].karaokeTrack.lyrics, true);
  /* the same song saved again keeps its lyrics' word and its nudge */
  state.profiles[EVAN].karaokeTrack.lyricsOffset = 750;
  act(state, "karaokeSong", { track:{ ...song({ video:INS, alts:[KAR] }) } }, as(EVAN));
  assert.equal(state.profiles[EVAN].karaokeTrack.lyrics, true);
  assert.equal(state.profiles[EVAN].karaokeTrack.lyricsOffset, 750);
  assert.equal(state.profiles[EVAN].karaokeTrack.alts[0].id, KAR.id);
  /* another song starts clean */
  act(state, "karaokeSong", { track:{ ...song(), trackId:"0".repeat(22), uri:`spotify:track:${"0".repeat(22)}` } }, as(EVAN));
  assert.equal("lyricsOffset" in state.profiles[EVAN].karaokeTrack, false);
});

/* ── the instrumental search ── */
const item = (id, title, { channel = "Somebody", duration = "PT4M10S", embeddable = true } = {}) => ({
  id, snippet:{ title, channelTitle:channel, liveBroadcastContent:"none" },
  contentDetails:{ duration }, status:{ embeddable, privacyStatus:"public", uploadStatus:"processed" } });
const SONG = { name:"Don't Stop Believin' - Remastered 2022", artists:["Journey"], durationMs:250000 };

test("the backing's search: the first artist, the song's own name and instrumental", () => {
  assert.equal(backingQuery(SONG), "Journey Don't Stop Believin' instrumental");
  assert.equal(backingQuery({ name:"" }), "");
});

test("an instrumental of the same recording: its length within 2.5 s, the song named, the arrangement kept, never a Topic", () => {
  const near = item("instrumen01", "Journey - Don't Stop Believin' (Instrumental)", { duration:"PT4M12S" });
  assert.equal(instrumentalProblem(near, SONG.durationMs, { name:SONG.name }), null);
  assert.equal(INSTRUMENTAL_MATCH_MS, 2500);
  assert.equal(instrumentalProblem(item("x", "Don't Stop Believin' Instrumental", { duration:"PT4M13S" }), SONG.durationMs,
    { name:SONG.name }), "length");
  assert.equal(instrumentalProblem(item("x", "Don't Stop Believin' (Karaoke Version)"), SONG.durationMs, { name:SONG.name }), "kind");
  assert.equal(instrumentalProblem(item("x", "Faithfully (Instrumental)"), SONG.durationMs, { name:SONG.name }), "name");
  assert.equal(instrumentalProblem(item("x", "Don't Stop Believin' Piano Instrumental"), SONG.durationMs, { name:SONG.name }),
    "arrangement");
  assert.equal(instrumentalProblem(item("x", "Don't Stop Believin' (Instrumental)", { channel:"Journey - Topic" }), SONG.durationMs,
    { name:SONG.name }), "topic");
  /* ranked: the nearest length (whole seconds), then the title's words, then the artist's own channel */
  const ranked = chooseInstrumentals([
    item("further0001", "Don't Stop Believin' Instrumental", { duration:"PT4M12S", channel:"A" }),
    item("plain000001", "Don't Stop Believin' Instrumental", { duration:"PT4M10S", channel:"B" }),
    item("official001", "Don't Stop Believin' (Official Instrumental)", { duration:"PT4M10S", channel:"C" }),
    item("ownchannel1", "Don't Stop Believin' Instrumental", { duration:"PT4M10S", channel:"JourneyVEVO" }),
    item("blocked0001", "Don't Stop Believin' (Official Instrumental)", { embeddable:false }),
    item("plain000002", "Don't Stop Believin' Instrumental (alt)", { duration:"PT4M10S", channel:"B" }),
  ], SONG.durationMs, { name:SONG.name, artist:"Journey" });
  assert.deepEqual(ranked.map(found => found.id), ["official001", "ownchannel1", "plain000001", "further0001", "plain000002"],
    "one a channel before any second; never one an embed cannot play");
});

test("the choices: instrumentals first with a karaoke upload kept as the fallback; without lyrics, karaoke alone", () => {
  const i = n => ({ id:`ins${n}` }), k = n => ({ id:`kar${n}` });
  assert.deepEqual(chooseBacking([i(1), i(2), i(3)], [k(1), k(2)], true).map(v => v.id), ["ins1", "ins2", "kar1"]);
  assert.deepEqual(chooseBacking([i(1), i(2), i(3)], [], true).map(v => v.id), ["ins1", "ins2", "ins3"]);
  assert.deepEqual(chooseBacking([i(1)], [k(1), k(2), k(3)], true).map(v => v.id), ["ins1", "kar1", "kar2"]);
  assert.deepEqual(chooseBacking([i(1)], [k(1)], false).map(v => v.id), ["kar1"]);
  assert.deepEqual(chooseBacking([i(1)], [], false), []);
});

test("one search when the instrumental and the lyrics are there; a second, for karaoke uploads, only when it is needed", async () => {
  const run = async (first, second, lyrics) => {
    const queries = [], reads = [];
    const fetchImpl = async url => {
      const u = new URL(url);
      if (u.pathname.endsWith("/search")) {
        queries.push(u.searchParams.get("q"));
        return reply({ items:(queries.length === 1 ? first : second).map(found => ({ id:{ videoId:found.id } })) });
      }
      const ids = u.searchParams.get("id").split(",");
      reads.push(ids);
      return reply({ items:[...first, ...second].filter(found => ids.includes(found.id)) });
    };
    const answer = await findBackingVideos(SONG, "key", fetchImpl, { lyrics:Promise.resolve(lyrics) });
    return { ...answer, queries, reads, ids:answer.videos.map(found => found.id) };
  };
  const inst = item("instrumen01", "Journey - Don't Stop Believin' (Official Instrumental)", { duration:"PT4M10S" });
  const kar = item("stingray001", "Journey - Don't Stop Believin' (Karaoke Version)", { channel:"Stingray Karaoke" });
  const both = await run([inst, kar], [], true);
  assert.deepEqual([both.searches, both.queries], [1, ["Journey Don't Stop Believin' instrumental"]]);
  assert.deepEqual(both.ids, ["instrumen01", "stingray001"]);
  const onlyInst = await run([inst], [kar], true);
  assert.deepEqual([onlyInst.searches, onlyInst.ids], [1, ["instrumen01"]], "the instrumental and lyrics: no second search");
  const noLyrics = await run([inst], [kar], false);
  assert.deepEqual([noLyrics.searches, noLyrics.queries[1], noLyrics.ids], [2, "Journey Don't Stop Believin' karaoke", ["stingray001"]]);
  assert.deepEqual(noLyrics.reads, [["instrumen01"], ["stingray001"]], "the second read is only what the first did not read");
  const none = await run([], [], true);
  assert.deepEqual([none.searches, none.ids, none.reads.length], [2, [], 0]);
});

/* ── LRCLIB ── */
const RECORD = (fields = {}) => ({ id:7, trackName:"Don't Stop Believin'", artistName:"Journey", duration:250.4, instrumental:false,
  syncedLyrics:"[00:01.00]Just a small town girl\n[00:04.00]Livin' in a lonely world", ...fields });
test("LRCLIB: the record of the same length with synced lyrics, asked with our User-Agent; none is null, a failure throws", async () => {
  assert.equal(chooseLyrics([RECORD({ duration:254 })], SONG), null, "another recording");
  assert.equal(chooseLyrics([RECORD({ syncedLyrics:null, plainLyrics:"words" })], SONG), null, "plain lyrics are not timed");
  assert.equal(chooseLyrics([RECORD({ instrumental:true })], SONG), null);
  assert.deepEqual(chooseLyrics([RECORD({ id:1, trackName:"Other", duration:250 }), RECORD({ id:2, duration:252 })], SONG).id, 2,
    "the song's own name first");
  let asked = null;
  const found = await findLyrics(SONG, async (url, init) => { asked = { url:new URL(url), init }; return reply([RECORD()]); });
  assert.deepEqual(found.lines, [{ t:1000, text:"Just a small town girl" }, { t:4000, text:"Livin' in a lonely world" }]);
  assert.equal(asked.url.origin + asked.url.pathname, "https://lrclib.net/api/search");
  assert.equal(asked.url.searchParams.get("track_name"), "Don't Stop Believin'");
  assert.equal(asked.url.searchParams.get("artist_name"), "Journey");
  assert.equal(asked.init.headers["User-Agent"], LYRICS_USER_AGENT);
  assert.equal(await findLyrics(SONG, async () => reply([])), null);
  assert.equal(await findLyrics(SONG, async () => new Response("", { status:404 })), null);
  await assert.rejects(findLyrics(SONG, async () => new Response("", { status:503 })), /LRCLIB 503/);
  await assert.rejects(findLyrics(SONG, async () => { throw new TypeError("offline"); }), /unreachable/);
  assert.equal(lyricsFresh({ lines:[{ t:1, text:"a" }], at:Date.now() - 20 * 86400000 }), true);
  assert.equal(lyricsFresh({ lines:null, at:Date.now() - 2 * 86400000 }), false, "a miss is asked again after a day");
  assert.equal(lyricsKey("abc"), "private:lyrics:abc");
});

/* ── the game: the writes ── */
const [EVAN, KHOA, SAHIL] = ROSTER;
const trackFor = (n, { instrumental = false, lyrics } = {}) => {
  const trackId = `lt${String(n).padStart(20, "0")}`;
  const kar = { id:`lk${String(n).padStart(9, "0")}`, title:`Song ${n} (Karaoke Version)`, channel:"Stingray Karaoke", seconds:200 };
  const ins = { id:`li${String(n).padStart(9, "0")}`, title:`Song ${n} (Instrumental)`, channel:"Artist", seconds:200 };
  return { provider:"spotify", trackId, uri:`spotify:track:${trackId}`, name:`Song ${n}`, artists:[`Artist ${n}`], durationMs:200000,
    imageUrl:null, explicit:false, video:instrumental ? ins : kar, alts:instrumental ? [kar] : [], ...(lyrics !== undefined ? { lyrics } : {}) };
};
/* three singers' songs on their profiles (Evan's an instrumental with lyrics, Khoa's a karaoke upload saved before Oct 15,
   Sahil's an instrumental whose lyrics turn out to be missing), Karaoke announced, then Lock and start */
function windowOpen() {
  const state = structuredClone(EMPTY_STATE);
  state.profiles[EVAN] = { ...state.profiles[EVAN], karaokeTrack:cleanKaraokeTrack(trackFor(1, { instrumental:true, lyrics:true })) };
  state.profiles[KHOA] = { ...state.profiles[KHOA], karaokeTrack:cleanKaraokeTrack(trackFor(2)) };
  state.profiles[SAHIL] = { ...state.profiles[SAHIL], karaokeTrack:cleanKaraokeTrack(trackFor(3, { instrumental:true, lyrics:true })) };
  act(state, "announceEvent", { evId:"karaoke" });
  const ev = allEventsOf(state).find(item => item.id === "karaoke");
  const contest = resolveCurrentContest(state, ev);
  act(state, "lockAndStart", { evId:"karaoke", contestId:contest.id, contestRevision:contest.revision });
  return state;
}
const LINES = cleanLyrics([{ t:2000, text:"First line" }, { t:5000, text:"Second line" }]);
const upgradeVideo = { id:"lupgrade002", title:"Song 2 (Official Instrumental)", channel:"Artist 2", seconds:200 };

test("the wanted list: in the window every present player's song; a song saved before Oct 15 owes its instrumental too", () => {
  const state = windowOpen();
  const wanted = karaokeLyricsWanted(state);
  assert.deepEqual(wanted.map(item => [item.player, item.lyrics, item.upgrade]),
    [[EVAN, true, false], [KHOA, true, true], [SAHIL, true, false]]);
  assert.deepEqual(karaokeLyricsWanted(structuredClone(EMPTY_STATE)), []);
});

test("karaokeLyrics: the Durable Object's alone; kept by track id; a changed song is dropped; nothing new is a no-op", () => {
  const state = windowOpen();
  const gameId = state.karaoke.id;
  const songs = { [EVAN]:{ trackId:trackFor(1).trackId, lines:LINES }, [KHOA]:{ trackId:trackFor(2).trackId, lines:LINES, upgrade:upgradeVideo },
    [SAHIL]:{ trackId:trackFor(3).trackId, lines:null }, [ROSTER[3]]:{ trackId:"x", lines:LINES } };
  assert.equal(applyAction(state, "karaokeLyrics", { gameId, songs }, gm()).ok, false, "the commissioner's tap cannot");
  assert.equal(applyAction(state, "karaokeLyrics", { gameId, songs }, as(EVAN)).ok, false);
  assert.equal(act(state, "karaokeLyrics", { gameId:"knope", songs }, system()).extra?.stale, true);
  act(state, "karaokeLyrics", { gameId, songs }, system());
  assert.deepEqual(state.karaoke.lyrics, { [trackFor(1).trackId]:LINES, [trackFor(2).trackId]:LINES, [trackFor(3).trackId]:false });
  assert.deepEqual(state.karaoke.upgrade, { [KHOA]:{ trackId:trackFor(2).trackId, video:upgradeVideo } });
  assert.equal(act(state, "karaokeLyrics", { gameId, songs }, system()).extra?.unchanged, true);
  /* junk lines are cleaned, never stored raw */
  act(state, "karaokeLyrics", { gameId, songs:{ [EVAN]:{ trackId:trackFor(1).trackId, lines:[{ t:"bad" }] } } }, system());
  assert.equal(state.karaoke.lyrics[trackFor(1).trackId], false);
});

test("the order draw plays each song its way: an instrumental first with lyrics, the karaoke upload first without", () => {
  const state = windowOpen();
  const gameId = state.karaoke.id;
  act(state, "karaokeLyrics", { gameId, songs:{ [EVAN]:{ trackId:trackFor(1).trackId, lines:LINES },
    [KHOA]:{ trackId:trackFor(2).trackId, lines:LINES, upgrade:upgradeVideo }, [SAHIL]:{ trackId:trackFor(3).trackId, lines:null } } },
  system());
  at(state.karaoke.pickUntil, () => act(state, "karaokeEndPick", { gameId }));
  const { songs } = state.karaoke;
  assert.equal(songs[EVAN].video.id, trackFor(1, { instrumental:true }).video.id, "chosen instrumental, lyrics found");
  assert.equal(songs[KHOA].video.id, upgradeVideo.id, "saved before Oct 15: the instrumental found leads");
  assert.equal(songs[KHOA].alts[0].id, trackFor(2).video.id, "its karaoke upload is the fallback");
  assert.equal(songs[SAHIL].video.id, trackFor(3, { instrumental:true }).alts[0].id,
    "no lyrics: the karaoke upload plays its own words");
  assert.equal(state.profiles[KHOA].karaokeTrack.video.id, trackFor(2).video.id, "the profile is never rewritten");
});

test("after the draw: lyrics that land late arrange a song not yet started, never one playing", () => {
  const state = windowOpen();
  const gameId = state.karaoke.id;
  at(state.karaoke.pickUntil, () => act(state, "karaokeEndPick", { gameId }));
  const game = state.karaoke;
  const first = karaokeSinger(game);
  const turn = karaokeTurn(game);
  at(turn.upAt + KARAOKE_UP_MS, () => act(state, "karaokeStartSong", { gameId, index:game.index }));
  const before = structuredClone(state.karaoke.songs);
  const entries = Object.fromEntries([[EVAN, 1], [KHOA, 2], [SAHIL, 3]].map(([player, n]) =>
    [player, { trackId:trackFor(n).trackId, lines:n === 3 ? null : LINES, ...(n === 2 ? { upgrade:upgradeVideo } : {}) }]));
  act(state, "karaokeLyrics", { gameId, songs:entries }, system());
  assert.deepEqual(state.karaoke.songs[first], before[first], "the song playing keeps its upload");
  for (const player of [EVAN, KHOA, SAHIL].filter(player => player !== first)) {
    const expected = karaokeArrange(before[player], state.karaoke.lyrics[before[player].trackId], state.karaoke.upgrade[player]);
    assert.deepEqual(state.karaoke.songs[player].video, expected.video, player);
  }
});

test("karaokeNudge: the commissioner's, on the profile and the game's copy, a quarter second a step, named by its track", () => {
  const state = windowOpen();
  const gameId = state.karaoke.id;
  at(state.karaoke.pickUntil, () => act(state, "karaokeEndPick", { gameId }));
  const trackId = trackFor(1).trackId;
  assert.equal(applyAction(state, "karaokeNudge", { player:EVAN, trackId, offsetMs:250 }, as(KHOA)).ok, false);
  assert.match(applyAction(state, "karaokeNudge", { player:EVAN, trackId:"another", offsetMs:250 }, gm()).error, /changed/);
  assert.equal(applyAction(state, "karaokeNudge", { player:EVAN, trackId, offsetMs:"soon" }, gm()).ok, false);
  act(state, "karaokeNudge", { player:EVAN, trackId, offsetMs:510 }, gm());
  assert.equal(state.profiles[EVAN].karaokeTrack.lyricsOffset, 500);
  assert.equal(state.karaoke.songs[EVAN].lyricsOffset, 500);
  assert.equal(act(state, "karaokeNudge", { player:EVAN, trackId, offsetMs:500 }, gm()).extra.unchanged, true);
  act(state, "karaokeNudge", { player:EVAN, trackId, offsetMs:99999 }, gm());
  assert.equal(state.karaoke.songs[EVAN].lyricsOffset, LYRICS_NUDGE_MAX_MS);
  act(state, "karaokeNudge", { player:EVAN, trackId, offsetMs:0 }, gm());
  assert.equal("lyricsOffset" in state.profiles[EVAN].karaokeTrack, false, "on time is no offset at all");
  assert.equal("lyricsOffset" in state.karaoke.songs[EVAN], false);
});

/* ── who gets the words ── */
test("the words are as public as the song: the current singer's only, from when they are up, for every screen", () => {
  const state = windowOpen();
  const gameId = state.karaoke.id;
  const lyrics = Object.fromEntries([[EVAN, 1], [KHOA, 2], [SAHIL, 3]].map(([player, n]) =>
    [player, { trackId:trackFor(n).trackId, lines:LINES, ...(n === 2 ? { upgrade:upgradeVideo } : {}) }]));
  act(state, "karaokeLyrics", { gameId, songs:lyrics }, system());
  /* the window: nobody's words, not even your own; only how your own song will play */
  for (const viewer of [null, EVAN, KHOA]) {
    const frame = projectKaraoke(state, viewer);
    assert.deepEqual(frame.lyrics, {}, `window, ${viewer}`);
    assert.equal(JSON.stringify(frame).includes("First line"), false);
    assert.equal("upgrade" in frame, false);
  }
  assert.deepEqual(projectKaraoke(state, EVAN).ways, { [EVAN]:"lyrics" });
  assert.deepEqual(projectKaraoke(state, KHOA).ways, { [KHOA]:"lyrics" }, "the found instrumental will lead");
  assert.deepEqual(projectKaraoke(state, null).ways, {}, "the TV hears nothing of anyone's song");
  at(state.karaoke.pickUntil, () => act(state, "karaokeEndPick", { gameId }));
  const singer = karaokeSinger(state.karaoke);
  const next = state.karaoke.order[state.karaoke.index + 1];
  for (const view of [{ isGm:false, player:null }, { isGm:true, player:EVAN }, { isGm:false, player:singer }, { isGm:false, player:next }]) {
    const frame = publicState(state, view).karaoke;
    assert.deepEqual(Object.keys(frame.lyrics), [state.karaoke.songs[singer].trackId], JSON.stringify(view));
    assert.deepEqual(karaokeLinesFor(frame, frame.songs[singer]), LINES);
    assert.equal(karaokeTurnWay(frame), "lyrics");
    assert.equal(JSON.stringify(frame).includes(state.karaoke.songs[next].trackId) && next !== view.player, false,
      "the next singer's song (and so its words) stays theirs");
  }
  /* the next singer's words come with their turn */
  const turn = karaokeTurn(state.karaoke);
  at(turn.upAt + KARAOKE_UP_MS, () => act(state, "karaokeStartSong", { gameId, index:state.karaoke.index }));
  at(Date.now(), () => act(state, "karaokeNext", { gameId, index:state.karaoke.index }));
  const after = projectKaraoke(state, null);
  assert.deepEqual(Object.keys(after.lyrics), [state.karaoke.songs[next].trackId]);
  /* the profile's song (with its lyrics' word and nudge) is the owner's and the commissioner's alone */
  state.profiles[EVAN].karaokeTrack.lyricsOffset = 250;
  assert.equal(publicState(state, { isGm:false, player:KHOA }).profiles[EVAN].karaokeTrack, undefined);
  assert.equal(publicState(state, { isGm:true, player:KHOA }).profiles[EVAN].karaokeTrack.lyricsOffset, 250);
});

/* ── the Durable Object ── */
const ENV = { APP_ENV:"local", M2_AUDIO_CATALOG_ENABLED:"true", SPOTIFY_CLIENT_ID:"id", SPOTIFY_CLIENT_SECRET:"secret",
  YOUTUBE_API_KEY:"key" };
const DEVICE = "lyrics-device-0000-4000-8000-000000000001";
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
async function room() {
  const memory = memoryContext();
  const tournament = new Tournament(memory.context, { ...ENV });
  await tournament.hydrateFromStorage();
  tournament.gmToken = "gm";
  tournament.claims = { [DEVICE]:EVAN };
  const lyricCalls = [];
  tournament.lyricsFetch = async (url, init) => { lyricCalls.push({ url:new URL(url), init }); return reply([RECORD()]); };
  return { tournament, memory, lyricCalls, settle:async () => { while (memory.pending.length) await memory.pending.shift(); } };
}
const TRACK_ID = "4bHsxqR3GMrXTxEPLuK5ue";
const lookup = `/api/karaoke/videos?${new URLSearchParams({ trackId:TRACK_ID, name:SONG.name, artist:"Journey", durationMs:"250000" })}`;
const get = (tournament, path) => tournament.fetch(new Request(`https://fielddayseries.com${path}`,
  { headers:{ "X-Field-Day-Device":DEVICE } }));

test("a song's lookup: LRCLIB beside one instrumental search; the lyrics' word and the uploads kept privately", async () => {
  const { tournament, memory, lyricCalls } = await room();
  const inst = item("instrumen01", "Journey - Don't Stop Believin' (Official Instrumental)", { duration:"PT4M10S" });
  let searches = 0;
  tournament.youtubeFetch = async url => {
    if (String(url).includes("/search?")) { searches += 1; return reply({ items:[{ id:{ videoId:"instrumen01" } }] }); }
    return reply({ items:[inst] });
  };
  const answer = await (await get(tournament, lookup)).json();
  assert.deepEqual(answer, { ok:true, videos:[{ id:"instrumen01", title:inst.snippet.title, channel:"Somebody", seconds:250 }],
    lyrics:true });
  assert.equal(searches, 1);
  assert.equal(lyricCalls.length, 1);
  assert.equal(lyricCalls[0].init.headers["User-Agent"], LYRICS_USER_AGENT);
  assert.equal(memory.entries.get(`private:karaoke:${TRACK_ID}`).v, 2);
  assert.equal(memory.entries.get(lyricsKey(TRACK_ID)).lines.length, 2);
  await get(tournament, lookup);
  assert.deepEqual([searches, lyricCalls.length], [1, 1], "kept: asked once for everyone");
  /* a lookup kept before Oct 15 (no instrumentals looked for) is asked again */
  memory.entries.set(`private:karaoke:${TRACK_ID}`, { videos:[{ id:"oldkaraoke1" }], at:Date.now() });
  await get(tournament, lookup);
  assert.equal(searches, 2);
});

test("YouTube's limit used up: a lookup kept before Oct 15 still answers inside its 30 days", async () => {
  const { tournament, memory } = await room();
  const old = { videos:[{ id:"oldkaraoke1", title:"Journey - Don't Stop Believin' (Karaoke Version)", channel:"Stingray Karaoke",
    seconds:245 }], at:Date.now() - 5 * 24 * 60 * 60 * 1000 };
  memory.entries.set(`private:karaoke:${TRACK_ID}`, old);
  let searches = 0;
  tournament.youtubeFetch = async () => {
    searches += 1;
    return new Response(JSON.stringify({ error:{ errors:[{ reason:"quotaExceeded" }] } }), { status:403 });
  };
  const answer = await get(tournament, lookup);
  assert.equal(answer.status, 200);
  assert.deepEqual(await answer.json(), { ok:true, videos:old.videos, lyrics:false });
  assert.equal(searches, 1, "the new lookup was tried");
  assert.deepEqual(memory.entries.get(`private:karaoke:${TRACK_ID}`), old, "and the kept one stays as it was");
});

test("LRCLIB down: the lookup still answers but is not kept, and the song's lyrics are asked again", async () => {
  const { tournament, memory } = await room();
  tournament.lyricsFetch = async () => new Response("", { status:503 });
  tournament.youtubeFetch = async url => String(url).includes("/search?") ? reply({ items:[{ id:{ videoId:"stingray001" } }] })
    : reply({ items:[item("stingray001", "Journey - Don't Stop Believin' (Karaoke Version)")] });
  const answer = await (await get(tournament, lookup)).json();
  assert.equal(answer.ok, true);
  assert.equal(answer.lyrics, false);
  assert.equal(memory.entries.has(`private:karaoke:${TRACK_ID}`), false);
  assert.equal(memory.entries.has(lyricsKey(TRACK_ID)), false);
});

test("LRCLIB down: asking again for the same song minutes later spends no search; past a few minutes it looks again", async () => {
  const { tournament, memory } = await room();
  let clock = Date.now();
  tournament.karaokeUnkept = previewCache(() => clock);
  let lyricAsks = 0, searches = 0;
  tournament.lyricsFetch = async () => { lyricAsks += 1; return new Response("", { status:503 }); };
  tournament.youtubeFetch = async url => {
    if (String(url).includes("/search?")) { searches += 1; return reply({ items:[{ id:{ videoId:"stingray001" } }] }); }
    return reply({ items:[item("stingray001", "Journey - Don't Stop Believin' (Karaoke Version)")] });
  };
  const first = await (await get(tournament, lookup)).json();
  const spent = searches;
  assert.ok(spent >= 1);
  for (let ask = 0; ask < 3; ask += 1) assert.deepEqual(await (await get(tournament, lookup)).json(), first);
  assert.equal(searches, spent, "the same song again: no search");
  assert.equal(memory.entries.has(`private:karaoke:${TRACK_ID}`), false, "still never kept");
  clock += PREVIEW_TTL_MS + 1000;
  await get(tournament, lookup);
  assert.ok(searches > spent, "a few minutes on, it looks again");
  assert.equal(lyricAsks, 2, "and asks LRCLIB again");
});

test("a song saved: its lyrics' word is the kept answer's, read before the write", async () => {
  const { tournament, memory } = await room();
  memory.entries.set(lyricsKey(TRACK_ID), { lines:LINES, at:Date.now() });
  const ws = { frames:[], send(frame) { ws.frames.push(JSON.parse(frame)); }, serializeAttachment(value) { ws.attachment = value; },
    deserializeAttachment() { return ws.attachment; }, close() {} };
  memory.sockets.push(ws);
  await tournament.webSocketMessage(ws, JSON.stringify({ type:"hello", deviceId:DEVICE, payload:{ view:"app", visible:true } }));
  const track = { ...song({ trackId:TRACK_ID, video:INS }), uri:`spotify:track:${TRACK_ID}`, lyrics:false };
  await tournament.webSocketMessage(ws, JSON.stringify({ actionId:"s1", type:"karaokeSong", deviceId:DEVICE, payload:{ track } }));
  assert.equal(ws.frames.find(frame => frame.type === "ack")?.ok, true);
  assert.equal(tournament.state.profiles[EVAN].karaokeTrack.lyrics, true);
});

test("the window: every song's lyrics (and an instrumental for a song saved before Oct 15) land in one write, never holding up the start", async () => {
  const { tournament, memory, settle } = await room();
  tournament.state = windowOpen();
  delete tournament.state.karaoke;
  const ws = { frames:[], send(frame) { ws.frames.push(JSON.parse(frame)); }, serializeAttachment(value) { ws.attachment = value; },
    deserializeAttachment() { return ws.attachment; }, close() {} };
  memory.sockets.push(ws);
  const GMDEV = "gm-device-0000-4000-8000-000000000001";
  await tournament.webSocketMessage(ws, JSON.stringify({ type:"hello", deviceId:GMDEV, payload:{ view:"app", visible:true } }));
  const searches = [];
  tournament.youtubeFetch = async url => {
    const u = new URL(url);
    if (u.pathname.endsWith("/search")) { searches.push(u.searchParams.get("q")); return reply({ items:[{ id:{ videoId:upgradeVideo.id } }] }); }
    const ids = u.searchParams.get("id").split(",");
    return reply({ items:ids.map(id => id === upgradeVideo.id
      ? item(id, upgradeVideo.title, { duration:"PT3M20S" }) : item(id, "Song", { duration:"PT3M20S" })) });
  };
  tournament.lyricsFetch = async url => {
    const name = new URL(url).searchParams.get("track_name");
    return reply(name === "Song 3" ? [] : [RECORD({ trackName:name, duration:200 })]);
  };
  await tournament.webSocketMessage(ws, JSON.stringify({ actionId:"k1", type:"karaokeStart", deviceId:GMDEV, gmToken:"gm",
    payload:{ evId:"karaoke" } }));
  assert.equal(ws.frames.find(frame => frame.type === "ack")?.ok, true);
  await settle();
  const game = tournament.state.karaoke;
  assert.ok(Array.isArray(game.lyrics[trackFor(1).trackId]));
  assert.ok(Array.isArray(game.lyrics[trackFor(2).trackId]));
  assert.equal(game.lyrics[trackFor(3).trackId], false);
  assert.deepEqual(game.upgrade[KHOA], { trackId:trackFor(2).trackId, video:{ id:upgradeVideo.id, title:upgradeVideo.title,
    channel:"Somebody", seconds:200 } });
  assert.deepEqual(searches, ["Artist 2 Song 2 instrumental"], "one search, for the song saved before instrumentals");
  assert.ok(ws.frames.some(frame => frame.type === "state" && frame.lastAction === "karaokeLyrics"));
  /* nothing more is owed: another write looks nothing up */
  assert.deepEqual(karaokeLyricsWanted(tournament.state), []);
});

/* ── the screens ── */
test("the TV's layout: the player compact in the corner, at least 200x200, nothing of ours over it; the line sized to two lines", () => {
  const box = KARAOKE_LYRIC_VIDEO_BOX;
  assert.ok(box.w >= 200 && box.h >= 200);
  assert.ok(box.x + box.w <= 1920 - 64 && box.y >= 54);
  const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  assert.equal(overlaps(box, KARAOKE_LYRIC_PLATE), false);
  assert.equal(overlaps(box, KARAOKE_LYRIC_STAGE), false);
  assert.ok(KARAOKE_LYRIC_STAGE.y + KARAOKE_LYRIC_STAGE.h <= 932, "over the strip");
  assert.equal(karaokeLyricSize("Hold the high note", 1632), 132);
  const long = karaokeLyricSize("We were never meant to sing this quietly, so sing it louder than the band", 1632);
  assert.ok(long < 132 && long >= 72);
  assert.equal(karaokeLyricSize("x".repeat(400), 1632), 72);
});

test("the fit views: the TV's lyric stage and the phones' teleprompter and line, from stand-in lines", () => {
  const tv = karaokeStage("lyrics", { now:1_900_000_000_000 });
  assert.equal(karaokeTurnWay(tv.karaoke), "lyrics");
  assert.deepEqual(karaokeLinesFor(tv.karaoke, tv.karaoke.songs[karaokeSinger(tv.karaoke)]), KARAOKE_FIT_LYRICS);
  for (const stage of ["singing-lyrics", "vote-lyrics"]) {
    const state = karaokePhoneStage(stage, { now:1_900_000_000_000 });
    const frame = publicState(state, { isGm:false, player:"Richard" }).karaoke;
    assert.equal(karaokeTurnWay(frame), "lyrics", stage);
  }
  assert.equal(publicState(karaokePhoneStage("pick-lyrics", { now:1_900_000_000_000 }), { isGm:false, player:"Richard" })
    .karaoke.ways.Richard, "lyrics");
});

test("the picker says how each upload will play; Use keeps the lookup's word on lyrics; the desk marks the singer and nudges their song", () => {
  assert.equal(candidateWay(INS, true, "Don't Stop Believin'"), "lyrics");
  assert.equal(candidateWay(INS, false), "video");
  assert.equal(candidateWay(KAR, true), "video");
  const chosen = karaokeChoice({ ...song(), startMs:0, lyricsOffset:500 }, INS, [INS, KAR], { lyrics:true });
  assert.equal(chosen.lyrics, true);
  assert.equal("lyricsOffset" in chosen, false);
  assert.equal(chosen.video.id, INS.id);
  const state = karaokePhoneStage("singing-lyrics", { now:1_900_000_000_000 });
  const frame = publicState(state, { isGm:true, player:"Brandon" });
  const rows = karaokeDeskRows(frame);
  const singing = rows.find(row => row.singing);
  assert.equal(singing.player, "Richard");
  assert.equal(singing.way, "lyrics");
  assert.equal(singing.trackId, state.karaoke.songs.Richard.trackId);
  assert.equal(rows.filter(row => row.singing).length, 1);
});

/* the Lyrics component as it draws a still (the fit audit's) */
const ROOT = fileURLToPath(new URL("../", import.meta.url));
async function component() {
  const out = await build({ stdin:{ contents:`export { Lyrics } from "./src/features/karaoke/Lyrics.jsx";
    export { KaraokeWay } from "./src/features/karaoke/KaraokeWay.jsx";`, resolveDir:ROOT, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react", "react-dom"], loader:{ ".css":"empty" }, write:false, logLevel:"silent" });
  const mod = new Module(fileURLToPath(new URL("karaoke-lyrics-ui.cjs", import.meta.url)));
  mod.filename = mod.id;
  mod.paths = Module._nodeModulePaths(ROOT);
  mod._compile(out.outputFiles[0].text, mod.filename);
  return mod.exports;
}
test("the Lyrics: the line being sung word by word with its share, the next under it; a break waits; a voter's line alone", async () => {
  const { Lyrics, KaraokeWay } = await component();
  const lines = cleanLyrics([{ t:1000, text:"Lights come up" }, { t:5000, text:"Every word" }]);
  const html = renderToStaticMarkup(React.createElement(Lyrics, { lines, at:1600, variant:"tv", sizeOf:() => 120 }));
  assert.match(html, /class="fd-lyric-now" style="--p:0\.5000;font-size:120px"/);
  assert.match(html, /<span class="fd-lyric-word" style="--a:0\.0000;--b:0\.4667">Lights<\/span> <span/);
  assert.match(html, /<p class="fd-lyric-next">Every word<\/p>/);
  const waiting = renderToStaticMarkup(React.createElement(Lyrics, { lines, at:200, variant:"prompt" }));
  assert.match(waiting, /fd-lyric-now is-waiting/);
  assert.match(waiting, /<p class="fd-lyric-next">Lights come up<\/p>/);
  const line = renderToStaticMarkup(React.createElement(Lyrics, { lines, at:1600, variant:"line" }));
  assert.doesNotMatch(line, /fd-lyric-next/);
  assert.match(renderToStaticMarkup(React.createElement(KaraokeWay, { way:"lyrics" })), /<i class="fd-insert" aria-hidden="true"><\/i>Lyrics/);
  assert.match(renderToStaticMarkup(React.createElement(KaraokeWay, { way:"video" })), /fd-insert is-done.*Video lyrics/);
  assert.equal(renderToStaticMarkup(React.createElement(KaraokeWay, { way:"card" })), "");
});
