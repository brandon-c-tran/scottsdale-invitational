/* Karaoke's own lyrics, OFF since Oct 28 (Brandon's call: "the native
   lyric ones just straight up not play"; docs/KARAOKE.md "Lyrics, off").
   Every song plays a karaoke upload with its words on it. Here: every way
   is video; the search keeps karaoke uploads only and LRCLIB is never
   asked; a song saved while instrumentals were offered (Oct 15 to Oct 28)
   plays a karaoke upload from its alternates, else one the Durable Object
   finds, else asks its owner for another; older stored lyric data loads
   and stays unread. The dormant pieces (LRC parsing, the instrumental
   ranking, LRCLIB, the TV's lyric layout, the Lyrics component) keep their
   pure tests. Nothing here reaches YouTube or LRCLIB. */
import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { EMPTY_STATE, ROSTER, allEventsOf, resolveCurrentContest } from "../shared/core.js";
import {
  KARAOKE_UP_MS, cleanKaraokeTrack, karaokeArrange, karaokeLinesFor, karaokeLyricsWanted, karaokeNeedsWords, karaokeNoWords,
  karaokeSinger, karaokeSongWay, karaokeTurn, karaokeTurnWay, karaokeVideoKind, karaokeWay, projectKaraoke,
} from "../shared/karaoke.js";
import {
  LYRICS_HOLD_MS, LYRICS_NUDGE_MAX_MS, cleanLyrics, cleanLyricsOffset, lyricClockMs, lyricCue, lyricsOffsetText, parseLrc,
  wordFill,
} from "../shared/karaokeLyrics.js";
import {
  INSTRUMENTAL_MATCH_MS, backingQuery, chooseBacking, chooseInstrumentals, chooseKaraoke, instrumentalProblem,
} from "../worker/karaokeVideos.js";
import { LYRICS_USER_AGENT, chooseLyrics, findLyrics, lyricsFresh, lyricsKey } from "../worker/lyrics.js";
import { publicState } from "../worker/publicState.js";
import { Tournament } from "../worker/tournament.js";
import { karaokeChecked, karaokeDeskRows } from "../src/features/karaoke/deskModel.js";
import { karaokeChoice } from "../src/features/karaoke/songPick.js";
import { karaokeView } from "../src/features/karaoke/karaokeModel.js";
import { KARAOKE_LYRIC_VIDEO_BOX, KARAOKE_LYRIC_PLATE, KARAOKE_LYRIC_STAGE, karaokeLyricSize } from "../src/features/tv/karaokeTv.js";
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

test("the nudge's offset: quarter seconds, ten at most either way", () => {
  assert.equal(cleanLyricsOffset(370), 250);
  assert.equal(cleanLyricsOffset(-99999), -LYRICS_NUDGE_MAX_MS);
  assert.equal(cleanLyricsOffset("x"), 0);
  assert.equal(lyricsOffsetText(-1250), "-1.25 s");
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
  assert.equal(karaokeVideoKind({ title:"Lyrics Of Love (Instrumental)" }, "Lyrics Of Love - Remastered 2011"), "instrumental");
  assert.equal(karaokeVideoKind({ title:"Lyrics Of Love (Karaoke)" }, "Lyrics Of Love - Remastered 2011"), "karaoke");
  assert.equal(karaokeVideoKind({ title:"Singalong Forever - Instrumental" }, "Singalong Forever (Live)"), "instrumental");
});

test("every way is video: an instrumental, a karaoke upload, any song, any stored lyrics; no upload is the card", () => {
  assert.equal(karaokeWay(INS, true), "video");
  assert.equal(karaokeWay(KAR, true), "video");
  assert.equal(karaokeWay(video("other000001", "Song (Official Video)")), "video");
  assert.equal(karaokeWay(null, true), "card");
  assert.equal(karaokeSongWay(song({ video:INS, lyrics:true })), "video");
  assert.equal(karaokeSongWay(song({ video:INS, alts:[KAR], lyrics:true }), LYRIC), "video");
  assert.equal(karaokeSongWay(null), null);
  assert.equal(karaokeLinesFor({ lyrics:{ [song().trackId]:LYRIC } }, song()), null, "our own lines are never shown");
});

test("a song's uploads: an instrumental steps behind an upload with words on it; nothing else moves", () => {
  /* the guest's own alternates first */
  const saved = song({ video:INS, alts:[KAR], lyrics:true });
  const arranged = karaokeArrange(saved, LYRIC);
  assert.equal(arranged.video.id, KAR.id);
  assert.deepEqual(arranged.alts.map(item => item.id), [INS.id], "the instrumental stays as the last resort");
  assert.equal(saved.video.id, INS.id, "pure: the song itself is untouched");
  /* a karaoke upload, or a song saved before Oct 15, is as it was, whatever lyrics a game stored */
  const legacy = song({ alts:[INS] });
  assert.equal(karaokeArrange(legacy, LYRIC), legacy);
  assert.equal(karaokeArrange(song(), LYRIC, { trackId:song().trackId, video:INS }).video.id, KAR.id, "never an instrumental upgrade");
  /* nothing with words among its own: the Durable Object's find leads */
  const bare = song({ video:INS, alts:[] });
  const found = video("stingray002", "Journey - Don't Stop Believin' (Karaoke)");
  const upgraded = karaokeArrange(bare, null, { trackId:bare.trackId, video:found });
  assert.equal(upgraded.video.id, found.id);
  assert.deepEqual(upgraded.alts.map(item => item.id), [INS.id]);
  assert.equal(karaokeArrange(bare, null, { trackId:"another", video:found }), bare, "never another song's");
  assert.equal(karaokeArrange(bare, null, { trackId:bare.trackId, video:INS }), bare, "never an instrumental");
  assert.equal(karaokeArrange(bare, null, { trackId:bare.trackId, video:null }), bare, "none found: as it was");
  /* what owes the game a search, and what asks its owner for another */
  assert.equal(karaokeNeedsWords(bare), true);
  assert.equal(karaokeNeedsWords(saved), false, "an alternate has words");
  assert.equal(karaokeNeedsWords(song()), false);
  assert.equal(karaokeNoWords(bare, undefined), false, "not looked yet");
  assert.equal(karaokeNoWords(bare, { trackId:bare.trackId, video:found }), false);
  assert.equal(karaokeNoWords(bare, { trackId:bare.trackId, video:null }), true);
  assert.equal(karaokeNoWords(bare, { trackId:"another", video:null }), false);
});

test("a saved song keeps its stored lyrics fields, so saving it again changes nothing; a phone's word is not taken", () => {
  const track = cleanKaraokeTrack({ ...song({ video:INS }), lyrics:true, lyricsOffset:510 });
  assert.equal(track.lyrics, true);
  assert.equal(track.lyricsOffset, 500);
  const state = structuredClone(EMPTY_STATE);
  const [EVAN] = ROSTER;
  act(state, "karaokeSong", { track:{ ...song({ video:KAR }), lyrics:true, lyricsOffset:2000 } }, as(EVAN));
  assert.equal("lyrics" in state.profiles[EVAN].karaokeTrack, false);
  assert.equal("lyricsOffset" in state.profiles[EVAN].karaokeTrack, false);
  /* a production profile saved between Oct 15 and Oct 28 */
  state.profiles[EVAN].karaokeTrack = { ...state.profiles[EVAN].karaokeTrack, lyrics:true, lyricsOffset:750 };
  const before = structuredClone(state.profiles[EVAN].karaokeTrack);
  assert.equal(act(state, "karaokeSong", { track:{ ...song({ video:KAR }) } }, as(EVAN)).extra?.unchanged, true);
  assert.deepEqual(state.profiles[EVAN].karaokeTrack, before);
});

/* ── the search: karaoke uploads only ── */
const item = (id, title, { channel = "Somebody", duration = "PT4M10S", embeddable = true } = {}) => ({
  id, snippet:{ title, channelTitle:channel, liveBroadcastContent:"none" },
  contentDetails:{ duration }, status:{ embeddable, privacyStatus:"public", uploadStatus:"processed" } });
const SONG = { name:"Don't Stop Believin' - Remastered 2022", artists:["Journey"], durationMs:250000 };

test("the choices are karaoke uploads only: never an instrumental, whatever the lyrics", () => {
  const i = n => ({ id:`ins${n}` }), k = n => ({ id:`kar${n}` });
  assert.deepEqual(chooseBacking([i(1), i(2), i(3)], [k(1), k(2)], true).map(v => v.id), ["kar1", "kar2"]);
  assert.deepEqual(chooseBacking([i(1), i(2), i(3)], [], true), []);
  assert.deepEqual(chooseBacking([i(1)], [k(1), k(2), k(3), k(4)], false).map(v => v.id), ["kar1", "kar2", "kar3"]);
  const items = [
    item("instrumen01", "Journey - Don't Stop Believin' (Official Instrumental)"),
    item("stingray001", "Journey - Don't Stop Believin' (Karaoke Version)", { channel:"Stingray Karaoke" }),
  ];
  assert.deepEqual(chooseKaraoke(items, 250000, { name:SONG.name }).map(v => v.id), ["stingray001"]);
  /* "karaoke" in the song's own name never makes its instrumental a karaoke upload */
  const queen = [item("queenins001", "Karaoke Queen (Instrumental)"), item("queenkar001", "Karaoke Queen (Karaoke Version)")];
  assert.deepEqual(chooseKaraoke(queen, 250000, { name:"Karaoke Queen" }).map(v => v.id), ["queenkar001"]);
});

/* ── the instrumental ranking (nothing searches for one since Oct 28) ── */
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

/* ── LRCLIB (never asked since Oct 28) ── */
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

/* ── the game ── */
const [EVAN, KHOA, SAHIL] = ROSTER;
const trackFor = (n, { instrumental = false, alt = true, lyrics } = {}) => {
  const trackId = `lt${String(n).padStart(20, "0")}`;
  const kar = { id:`lk${String(n).padStart(9, "0")}`, title:`Song ${n} (Karaoke Version)`, channel:"Stingray Karaoke", seconds:200 };
  const ins = { id:`li${String(n).padStart(9, "0")}`, title:`Song ${n} (Instrumental)`, channel:"Artist", seconds:200 };
  return { provider:"spotify", trackId, uri:`spotify:track:${trackId}`, name:`Song ${n}`, artists:[`Artist ${n}`], durationMs:200000,
    imageUrl:null, explicit:false, video:instrumental ? ins : kar, alts:instrumental && alt ? [kar] : [],
    ...(lyrics !== undefined ? { lyrics } : {}) };
};
/* three singers' songs on their profiles, as production may hold them: Evan's an instrumental with a karaoke
   alternate (saved Oct 15 to 28), Khoa's a karaoke upload, Sahil's an instrumental with nothing else; Karaoke
   announced, then Lock and start */
function windowOpen() {
  const state = structuredClone(EMPTY_STATE);
  state.profiles[EVAN] = { ...state.profiles[EVAN], karaokeTrack:cleanKaraokeTrack(trackFor(1, { instrumental:true, lyrics:true })) };
  state.profiles[KHOA] = { ...state.profiles[KHOA], karaokeTrack:cleanKaraokeTrack(trackFor(2)) };
  state.profiles[SAHIL] = { ...state.profiles[SAHIL],
    karaokeTrack:cleanKaraokeTrack(trackFor(3, { instrumental:true, alt:false, lyrics:true })) };
  act(state, "announceEvent", { evId:"karaoke" });
  const ev = allEventsOf(state).find(item => item.id === "karaoke");
  const contest = resolveCurrentContest(state, ev);
  act(state, "lockAndStart", { evId:"karaoke", contestId:contest.id, contestRevision:contest.revision });
  return state;
}
const LINES = cleanLyrics([{ t:2000, text:"First line" }, { t:5000, text:"Second line" }]);
const found3 = { id:"lfound00003", title:"Song 3 (Karaoke Version)", channel:"Zoom Karaoke", seconds:204 };

test("the wanted list: only a song with no upload that has words on it, until its search is answered", () => {
  const state = windowOpen();
  assert.deepEqual(karaokeLyricsWanted(state).map(item => [item.player, item.trackId, item.upgrade]),
    [[SAHIL, trackFor(3).trackId, true]]);
  act(state, "karaokeLyrics", { gameId:state.karaoke.id, songs:{ [SAHIL]:{ trackId:trackFor(3).trackId, upgrade:found3 } } }, system());
  assert.deepEqual(karaokeLyricsWanted(state), []);
  assert.deepEqual(karaokeLyricsWanted(structuredClone(EMPTY_STATE)), []);
});

test("karaokeLyrics: the Durable Object's alone; a karaoke upload kept by player; lines ignored; a changed song dropped", () => {
  const state = windowOpen();
  const gameId = state.karaoke.id;
  const songs = { [SAHIL]:{ trackId:trackFor(3).trackId, upgrade:found3, lines:LINES }, [KHOA]:{ trackId:"another", upgrade:found3 } };
  assert.equal(applyAction(state, "karaokeLyrics", { gameId, songs }, gm()).ok, false, "the commissioner's tap cannot");
  assert.equal(applyAction(state, "karaokeLyrics", { gameId, songs }, as(EVAN)).ok, false);
  assert.equal(act(state, "karaokeLyrics", { gameId:"knope", songs }, system()).extra?.stale, true);
  act(state, "karaokeLyrics", { gameId, songs }, system());
  assert.deepEqual(state.karaoke.upgrade, { [SAHIL]:{ trackId:trackFor(3).trackId, video:found3 } });
  assert.equal(state.karaoke.lyrics, undefined, "no lines are stored");
  assert.equal(act(state, "karaokeLyrics", { gameId, songs }, system()).extra?.unchanged, true, "retry-safe");
  /* an instrumental is never the find */
  const ins = { id:"lfoundins03", title:"Song 3 (Instrumental)", channel:"Artist", seconds:200 };
  act(state, "karaokeLyrics", { gameId, songs:{ [SAHIL]:{ trackId:trackFor(3).trackId, upgrade:ins } } }, system());
  assert.deepEqual(state.karaoke.upgrade[SAHIL], { trackId:trackFor(3).trackId, video:null });
});

test("nothing found in the window: that song asks its owner for another, and only a new song or a later find clears it", () => {
  const state = windowOpen();
  const gameId = state.karaoke.id;
  act(state, "karaokeReady", { gameId }, as(SAHIL));
  act(state, "karaokeLyrics", { gameId, songs:{ [SAHIL]:{ trackId:trackFor(3).trackId, upgrade:null } } }, system());
  assert.equal(state.karaoke.broken[SAHIL], "words");
  assert.equal(state.karaoke.ready[SAHIL], undefined, "the lock-in undone");
  assert.equal(projectKaraoke(state, SAHIL).broken[SAHIL], "words");
  assert.equal(karaokeView(publicState(state, { isGm:false, player:SAHIL }), SAHIL).broken, true, "Pick another song");
  assert.equal(applyAction(state, "karaokeReady", { gameId }, as(SAHIL)).error, "Pick another song");
  /* the same song again stays asked; the guest's song is never cleared */
  const same = structuredClone(state.profiles[SAHIL].karaokeTrack);
  act(state, "karaokeSong", { track:same }, as(SAHIL));
  assert.equal(state.karaoke.broken[SAHIL], "words");
  assert.equal(state.profiles[SAHIL].karaokeTrack.video.id, trackFor(3, { instrumental:true }).video.id);
  /* a song with words on it clears it and locks in */
  act(state, "karaokeSong", { track:trackFor(4) }, as(SAHIL));
  assert.equal(state.karaoke.broken[SAHIL], undefined);
  assert.ok(state.karaoke.ready[SAHIL]);
  /* a find that lands later clears a "words" ask too */
  const other = windowOpen();
  act(other, "karaokeLyrics", { gameId:other.karaoke.id, songs:{ [SAHIL]:{ trackId:trackFor(3).trackId, upgrade:null } } }, system());
  act(other, "karaokeLyrics", { gameId:other.karaoke.id, songs:{ [SAHIL]:{ trackId:trackFor(3).trackId, upgrade:found3 } } }, system());
  assert.equal(other.karaoke.broken[SAHIL], undefined);
});

test("the order draw: a saved instrumental plays its karaoke alternate, else the find; the profile is never rewritten", () => {
  const state = windowOpen();
  const gameId = state.karaoke.id;
  const profiles = structuredClone(state.profiles);
  act(state, "karaokeLyrics", { gameId, songs:{ [SAHIL]:{ trackId:trackFor(3).trackId, upgrade:found3 } } }, system());
  at(state.karaoke.pickUntil, () => act(state, "karaokeEndPick", { gameId }));
  const { songs } = state.karaoke;
  assert.equal(songs[EVAN].video.id, trackFor(1).video.id, "its own karaoke alternate");
  assert.deepEqual(songs[EVAN].alts.map(item => item.id), [trackFor(1, { instrumental:true }).video.id]);
  assert.equal(songs[KHOA].video.id, trackFor(2).video.id);
  assert.equal(songs[SAHIL].video.id, found3.id, "the find");
  assert.deepEqual(songs[SAHIL].alts.map(item => item.id), [trackFor(3, { instrumental:true }).video.id]);
  assert.deepEqual(state.profiles, profiles, "every guest's choice stays as they saved it");
  for (const player of [EVAN, KHOA, SAHIL]) assert.equal(karaokeVideoKind(songs[player].video, songs[player].name), "karaoke");
  assert.equal(karaokeTurnWay(state.karaoke), "video");
});

test("after the draw: a find that lands late arranges a song not yet started, never one playing", () => {
  const state = windowOpen();
  const gameId = state.karaoke.id;
  at(state.karaoke.pickUntil, () => act(state, "karaokeEndPick", { gameId }));
  const game = state.karaoke;
  const first = karaokeSinger(game);
  const turn = karaokeTurn(game);
  at(turn.upAt + KARAOKE_UP_MS, () => act(state, "karaokeStartSong", { gameId, index:game.index }));
  const before = structuredClone(state.karaoke.songs);
  act(state, "karaokeLyrics", { gameId, songs:{ [SAHIL]:{ trackId:trackFor(3).trackId, upgrade:found3 } } }, system());
  if (first === SAHIL) assert.deepEqual(state.karaoke.songs[SAHIL], before[SAHIL], "the song playing keeps its upload");
  else assert.equal(state.karaoke.songs[SAHIL].video.id, found3.id);
  for (const player of [EVAN, KHOA]) assert.deepEqual(state.karaoke.songs[player], before[player]);
});

test("a restart keeps what was found, and the ask for another song with it", () => {
  const state = windowOpen();
  act(state, "karaokeLyrics", { gameId:state.karaoke.id, songs:{ [SAHIL]:{ trackId:trackFor(3).trackId, upgrade:null } } }, system());
  act(state, "karaokeRestart", { gameId:state.karaoke.id, confirm:true });
  assert.deepEqual(state.karaoke.upgrade[SAHIL], { trackId:trackFor(3).trackId, video:null });
  assert.equal(state.karaoke.broken[SAHIL], "words");
  assert.deepEqual(karaokeLyricsWanted(state), [], "no second search");
});

test("the nudge's write stays harmless: the commissioner's, on the profile and the game's copy", () => {
  const state = windowOpen();
  const gameId = state.karaoke.id;
  at(state.karaoke.pickUntil, () => act(state, "karaokeEndPick", { gameId }));
  const trackId = trackFor(1).trackId;
  assert.equal(applyAction(state, "karaokeNudge", { player:EVAN, trackId, offsetMs:250 }, as(KHOA)).ok, false);
  act(state, "karaokeNudge", { player:EVAN, trackId, offsetMs:510 }, gm());
  assert.equal(state.profiles[EVAN].karaokeTrack.lyricsOffset, 500);
  assert.equal(karaokeSongWay(state.karaoke.songs[EVAN]), "video");
});

/* ── an older state ── */
function olderState() {
  /* a game an Oct 15 build stored: lines for every song, an instrumental upgrade, nudges, and a profile's lyrics word */
  const state = windowOpen();
  const gameId = state.karaoke.id;
  at(state.karaoke.pickUntil, () => act(state, "karaokeEndPick", { gameId }));
  const game = state.karaoke;
  game.lyrics = Object.fromEntries([1, 2, 3].map(n => [trackFor(n).trackId, n === 2 ? false : LINES]));
  game.upgrade = { [KHOA]:{ trackId:trackFor(2).trackId, video:{ id:"lupgrade002", title:"Song 2 (Official Instrumental)",
    channel:"Artist 2", seconds:200 } } };
  for (const player of Object.keys(game.songs)) game.songs[player] = { ...game.songs[player], lyrics:true, lyricsOffset:250 };
  state.profiles[EVAN].karaokeTrack.lyricsOffset = 500;
  return state;
}

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
  tournament.lyricsFetch = async url => { lyricCalls.push(new URL(url)); return reply([]); };
  return { tournament, memory, lyricCalls, settle:async () => { while (memory.pending.length) await memory.pending.shift(); } };
}

test("an older state with lyrics loads, plays every song the video way, and never sends its lines", async () => {
  const state = olderState();
  for (const view of [{ isGm:false, player:null }, { isGm:true, player:EVAN }, { isGm:false, player:KHOA }]) {
    const frame = publicState(state, view).karaoke;
    assert.deepEqual(frame.lyrics, {}, JSON.stringify(view));
    assert.equal(JSON.stringify(frame).includes("First line"), false);
    assert.equal("upgrade" in frame, false);
    assert.equal(karaokeTurnWay(frame), "video");
    assert.equal(karaokeView(publicState(state, view), view.player).way, "video");
  }
  /* the Durable Object hydrates it as it was stored */
  const memory = memoryContext();
  memory.entries.set("state", structuredClone(state));
  const tournament = new Tournament(memory.context, { ...ENV });
  await tournament.hydrateFromStorage();
  assert.deepEqual(tournament.state.karaoke.lyrics, state.karaoke.lyrics, "kept, unread");
  assert.equal(tournament.state.profiles[EVAN].karaokeTrack.lyricsOffset, 500);
  /* its lines are never looked at; its instrumental upgrade is no find; its song with no words is looked for */
  assert.deepEqual(karaokeLyricsWanted(tournament.state).map(item => item.player), [SAHIL]);
  assert.equal(karaokeArrange(tournament.state.karaoke.songs[KHOA], null, tournament.state.karaoke.upgrade[KHOA]),
    tournament.state.karaoke.songs[KHOA]);
  assert.equal(karaokeTurnWay(tournament.state.karaoke), "video");
});

const TRACK_ID = "4bHsxqR3GMrXTxEPLuK5ue";
const lookup = `/api/karaoke/videos?${new URLSearchParams({ trackId:TRACK_ID, name:SONG.name, artist:"Journey", durationMs:"250000" })}`;
const get = (tournament, path) => tournament.fetch(new Request(`https://fielddayseries.com${path}`,
  { headers:{ "X-Field-Day-Device":DEVICE } }));
const kept = (videos, extra = {}) => ({ videos, at:Date.now() - 2 * 86400000, ...extra });
const KEPT_INS = { id:"instrumen01", title:"Journey - Don't Stop Believin' (Official Instrumental)", channel:"Journey", seconds:250 };
const KEPT_KAR = { id:"stingray001", title:"Journey - Don't Stop Believin' (Karaoke Version)", channel:"Stingray Karaoke", seconds:245 };

test("a song's lookup: one karaoke search, never LRCLIB, never an instrumental search; kept as v:3", async () => {
  const { tournament, memory, lyricCalls } = await room();
  const queries = [];
  tournament.youtubeFetch = async url => {
    const u = new URL(url);
    if (u.pathname.endsWith("/search")) {
      queries.push(u.searchParams.get("q"));
      return reply({ items:[{ id:{ videoId:"instrumen01" } }, { id:{ videoId:"stingray001" } }] });
    }
    return reply({ items:[item("instrumen01", KEPT_INS.title), item("stingray001", KEPT_KAR.title, { channel:"Stingray Karaoke" })] });
  };
  const answer = await (await get(tournament, lookup)).json();
  assert.deepEqual(answer.videos.map(found => found.id), ["stingray001"]);
  assert.equal("lyrics" in answer, false);
  assert.deepEqual(queries, ["Journey Don't Stop Believin' karaoke"]);
  assert.equal(lyricCalls.length, 0);
  assert.equal(memory.entries.get(`private:karaoke:${TRACK_ID}`).v, 3);
  assert.equal(memory.entries.has(lyricsKey(TRACK_ID)), false);
});

test("a lookup kept Oct 15 to 28: its karaoke uploads answer free; one with only instrumentals is asked again", async () => {
  const { tournament, memory } = await room();
  let searches = 0;
  tournament.youtubeFetch = async url => {
    if (String(url).includes("/search?")) { searches += 1; return reply({ items:[{ id:{ videoId:"stingray001" } }] }); }
    return reply({ items:[item("stingray001", KEPT_KAR.title, { channel:"Stingray Karaoke" })] });
  };
  memory.entries.set(`private:karaoke:${TRACK_ID}`, kept([KEPT_INS, KEPT_KAR], { lyrics:true, v:2 }));
  assert.deepEqual(await (await get(tournament, lookup)).json(), { ok:true, videos:[KEPT_KAR] });
  assert.equal(searches, 0, "kept: no search");
  memory.entries.set(`private:karaoke:${TRACK_ID}`, kept([KEPT_INS], { lyrics:true, v:2 }));
  const again = await (await get(tournament, lookup)).json();
  assert.deepEqual(again.videos.map(found => found.id), ["stingray001"]);
  assert.equal(searches, 1);
  assert.equal(memory.entries.get(`private:karaoke:${TRACK_ID}`).v, 3);
  /* one kept before Oct 15 (karaoke only, no v) still answers */
  memory.entries.set(`private:karaoke:${TRACK_ID}`, kept([KEPT_KAR]));
  assert.deepEqual(await (await get(tournament, lookup)).json(), { ok:true, videos:[KEPT_KAR] });
  assert.equal(searches, 1);
});

test("the window: a saved instrumental with nothing else gets one karaoke search and one write; LRCLIB is never asked", async () => {
  const { tournament, memory, lyricCalls, settle } = await room();
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
    if (u.pathname.endsWith("/search")) { searches.push(u.searchParams.get("q")); return reply({ items:[{ id:{ videoId:found3.id } }] }); }
    const ids = u.searchParams.get("id").split(",");
    return reply({ items:ids.map(id => item(id, id === found3.id ? found3.title : "Song",
      { channel:"Zoom Karaoke", duration:"PT3M24S" })) });
  };
  await tournament.webSocketMessage(ws, JSON.stringify({ actionId:"k1", type:"karaokeStart", deviceId:GMDEV, gmToken:"gm",
    payload:{ evId:"karaoke" } }));
  assert.equal(ws.frames.find(frame => frame.type === "ack")?.ok, true);
  await settle();
  const game = tournament.state.karaoke;
  assert.deepEqual(game.upgrade, { [SAHIL]:{ trackId:trackFor(3).trackId, video:found3 } });
  assert.deepEqual(searches, ["Artist 3 Song 3 karaoke"], "one search, for the one song with no words");
  assert.equal(lyricCalls.length, 0);
  assert.equal(game.lyrics, undefined);
  assert.ok(ws.frames.some(frame => frame.type === "state" && frame.lastAction === "karaokeLyrics"));
  assert.deepEqual(karaokeLyricsWanted(tournament.state), [], "nothing more is owed");
  assert.equal(tournament.state.profiles[SAHIL].karaokeTrack.video.id, trackFor(3, { instrumental:true }).video.id,
    "the guest's song is never rewritten");
});

/* ── the screens ── */
test("the picker saves no lyrics word; the desk carries no way and no nudge", () => {
  const chosen = karaokeChoice({ ...song(), startMs:0, lyrics:true, lyricsOffset:500 }, KAR, [KAR, INS]);
  assert.equal("lyrics" in chosen, false);
  assert.equal("lyricsOffset" in chosen, false);
  assert.equal(chosen.video.id, KAR.id);
  const state = olderState();
  const rows = karaokeDeskRows(publicState(state, { isGm:true, player:KHOA }));
  assert.equal(rows.filter(row => row.singing).length, 1);
  for (const row of rows) for (const key of ["way", "offset", "trackId"]) assert.equal(key in row, false, key);
  const checks = karaokeChecked(state, { [EVAN]:{ ok:true, code:null, video:0, way:"lyrics" } });
  assert.equal("way" in checks[EVAN], false);
});

/* ── the dormant screens ── */
test("(unmounted since Oct 28) the TV's lyric layout: the player compact in the corner, at least 200x200, nothing of ours over it; the line sized to two lines", () => {
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

/* the Lyrics component (unmounted since Oct 28) as it draws a still */
const ROOT = fileURLToPath(new URL("../", import.meta.url));
async function component() {
  const out = await build({ stdin:{ contents:`export { Lyrics } from "./src/features/karaoke/Lyrics.jsx";`, resolveDir:ROOT, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react", "react-dom"], loader:{ ".css":"empty" }, write:false, logLevel:"silent" });
  const mod = new Module(fileURLToPath(new URL("karaoke-lyrics-ui.cjs", import.meta.url)));
  mod.filename = mod.id;
  mod.paths = Module._nodeModulePaths(ROOT);
  mod._compile(out.outputFiles[0].text, mod.filename);
  return mod.exports;
}
test("the Lyrics: the line being sung word by word with its share, the next under it; a break waits; a voter's line alone", async () => {
  const { Lyrics } = await component();
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
});
