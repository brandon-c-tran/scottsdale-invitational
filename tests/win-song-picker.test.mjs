/* The Win song picker: the clock and the window the room hears, the start
   point controls, search mode, and the commissioner's speaker test. */
import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { WIN_SONG_CLIP_MS } from "../shared/audio.js";
import { WIN_SONG_CLIP_MS as WORKER_CLIP } from "../worker/winSong.js";
import { clampStart, clipWindow, maxStart, searchQuery, songClock, yourSongLine } from "../src/features/music/winSongModel.js";
import { nowPlayingModel } from "../src/features/tv/nowPlaying.js";

test("Home names your song in your own 1v1 or free-for-all, and offers the picker when you have none", () => {
  const song = { trackId:"t", name:"Mr. Brightside", artists:["The Killers"], imageUrl:"https://i.scdn.co/x" };
  const state = { profiles:{ Evan:{ walkoutTrack:song }, Khoa:{}, Adi:{}, Ben:{} } };
  const oneOnOne = { players:["Evan", "Khoa"], sides:[{ key:0, players:["Evan"] }, { key:1, players:["Khoa"] }] };
  assert.deepEqual(yourSongLine(state, oneOnOne, "Evan"), { song:"Mr. Brightside" });
  assert.equal(yourSongLine(state, oneOnOne, "Khoa"), null, "no song and no picker: nothing");
  assert.deepEqual(yourSongLine(state, oneOnOne, "Khoa", { songs:true }), { pick:true });
  assert.equal(yourSongLine(state, oneOnOne, "Adi", { songs:true }), null, "not in it");
  const pairs = { players:["Evan", "Khoa", "Adi", "Ben"], sides:[{ key:0, players:["Evan", "Khoa"] }, { key:1, players:["Adi", "Ben"] }] };
  assert.equal(yourSongLine(state, pairs, "Evan", { songs:true }), null, "a pair draws one member's song");
  assert.equal(yourSongLine(state, null, "Evan"), null);
});

test("the TV card carries the cover and the clip's own clock", () => {
  const startedAt = 1_000_000;
  const state = { profiles:{ Evan:{ walkoutTrack:{ trackId:"brightsidebrightside12", name:"Mr. Brightside", artists:["The Killers"],
    imageUrl:"https://i.scdn.co/x" } } }, mvp:{},
  showControl:{ audio:{ walkout:{ player:"Evan", trackId:"brightsidebrightside12", startedAt, until:startedAt + WIN_SONG_CLIP_MS, auto:true } } } };
  const card = nowPlayingModel(state, [], startedAt + 5000);
  assert.equal(card.track.imageUrl, "https://i.scdn.co/x");
  assert.equal(card.startedAt, startedAt);
  assert.equal(card.until - card.startedAt, WIN_SONG_CLIP_MS);
});

const track = { provider:"spotify", trackId:"1234567890123456789012", uri:"spotify:track:1234567890123456789012",
  url:"https://open.spotify.com/track/1234567890123456789012", name:"Anthem", artists:["Band", "Guest"],
  durationMs:200000, imageUrl:null, explicit:true, startMs:65000 };

test("the window the room hears is 30 seconds from the start point, never past the song", () => {
  assert.equal(WORKER_CLIP, WIN_SONG_CLIP_MS, "one clip length for the Worker and the picker");
  assert.equal(songClock(65000), "1:05");
  assert.equal(songClock(0), "0:00");
  assert.deepEqual(clipWindow(track), { from:65000, to:95000, text:"Plays 1:05 to 1:35" });
  assert.equal(clipWindow({ ...track, startMs:185000 }).text, "Plays 3:05 to 3:20", "the song ends first");
  assert.equal(maxStart(track), 199000);
  assert.equal(clampStart(track, -4000), 0);
  assert.equal(clampStart(track, 250000), 199000);
  assert.equal(clampStart(track, 12400), 12000, "whole seconds");
});

test("the clip is found by ISRC, else by title and artist, and only from Deezer's CDN", async () => {
  const { findPreview, previewCache, PREVIEW_TTL_MS } = await import("../worker/previews.js");
  const clip = "https://cdnt-preview.dzcdn.net/api/1/1/a.mp3?hdnea=exp=1";
  const calls = [];
  const answer = body => async url => { calls.push(String(url)); return new Response(JSON.stringify(body(String(url)))); };
  assert.deepEqual(await findPreview({ isrc:"USIR20400274" }, answer(() => ({ preview:clip }))), { url:clip });
  assert.match(calls[0], /\/2\.0\/track\/isrc:USIR20400274$/);
  calls.length = 0;
  const fallback = answer(url => url.includes("isrc:") ? { error:{ code:800 } } : { data:[{ preview:clip }] });
  assert.deepEqual(await findPreview({ isrc:"USIR20400274", name:"Mr. \"Brightside\"", artist:"The Killers" }, fallback), { url:clip });
  assert.match(decodeURIComponent(calls[1]), /track:"Mr\. Brightside" artist:"The Killers"/, "quotes cannot break the query");
  assert.equal(await findPreview({ name:"x" }, answer(() => ({ data:[{ preview:"https://evil.example/a.mp3" }] }))), null);
  assert.equal(await findPreview({ name:"" }, answer(() => ({}))), null);
  let now = 0;
  const cache = previewCache(() => now);
  cache.set("k", { url:clip });
  now = PREVIEW_TTL_MS - 1;
  assert.deepEqual(cache.get("k"), { url:clip });
  now = PREVIEW_TTL_MS + 1;
  assert.equal(cache.get("k"), undefined, "the signed address expires, so the answer does too");
});

test("the snippet plays the album upload whose length matches Spotify's, preferring YouTube's Topic uploads", async () => {
  const { chooseUpload, findAlbumUpload, isoDurationMs } = await import("../worker/youtube.js");
  assert.equal(isoDurationMs("PT3M42S"), 222000);
  assert.equal(isoDurationMs("PT1H2M3S"), 3723000);
  assert.equal(isoDurationMs("nope"), null);
  const video = (id, duration, channel, embeddable = true) => ({ id, contentDetails:{ duration },
    snippet:{ channelTitle:channel }, status:{ embeddable } });
  const spotifyMs = 222075;
  assert.deepEqual(chooseUpload([
    video("musicvideo1", "PT4M5S", "The Killers"),
    video("closeupload", "PT3M42S", "Some Channel"),
    video("topicupload", "PT3M43S", "The Killers - Topic"),
    video("blockedxxxx", "PT3M42S", "The Killers - Topic", false),
  ], spotifyMs), { videoId:"topicupload", durationMs:223000, topic:true }, "a Topic upload wins within 3 s");
  assert.equal(chooseUpload([video("musicvideo1", "PT4M5S", "The Killers")], spotifyMs), null,
    "a video whose intro shifts the song is not used");

  const calls = [];
  const youtube = async url => {
    calls.push(String(url));
    const body = String(url).includes("/search?")
      ? { items:[{ id:{ videoId:"topicupload" } }, { id:{ videoId:"bad" } }] }
      : { items:[video("topicupload", "PT3M42S", "The Killers - Topic")] };
    return new Response(JSON.stringify(body));
  };
  assert.deepEqual(await findAlbumUpload({ name:"Mr. Brightside", artist:"The Killers", durationMs:spotifyMs }, "key", youtube),
    { videoId:"topicupload", durationMs:222000, topic:true });
  assert.match(calls[0], /videoCategoryId=10/);
  assert.match(calls[1], /id=topicupload&/, "only well-formed ids are read");
});

test("the snippet route needs its key, answers from the kept lookup, and never spends the quota twice", async () => {
  const { Tournament } = await import("../worker/tournament.js");
  const entries = new Map();
  const storage = { async get(key) { return structuredClone(entries.get(key)); },
    async put(key, value) { if (typeof key === "object") for (const [k, v] of Object.entries(key)) entries.set(k, v); else entries.set(key, value); },
    async delete() {}, async list() { return new Map(); }, async transaction(fn) { return fn(storage); } };
  const make = async env => { const t = new Tournament({ blockConcurrencyWhile() {}, getWebSockets:() => [], storage }, env);
    await t.hydrateFromStorage(); t.gmToken = "gm"; return t; };
  const env = { APP_ENV:"local", M2_AUDIO_CATALOG_ENABLED:"true", SPOTIFY_CLIENT_ID:"id", SPOTIFY_CLIENT_SECRET:"secret" };
  const ask = (tournament, query) => {
    const request = new Request(`https://fielddayseries.com/api/spotify/snippet?${new URLSearchParams(query)}`,
      { headers:{ Authorization:"Bearer gm" } });
    return tournament.handleSpotify(request, new URL(request.url));
  };
  const query = { trackId:"1234567890123456789012", name:"Anthem", artist:"Band", durationMs:"200000" };
  const unset = await make(env);
  assert.equal(unset.capabilities.songSnippets, false);
  assert.equal((await ask(unset, query)).status, 503);

  const ready = await make({ ...env, YOUTUBE_API_KEY:"key" });
  assert.equal(ready.capabilities.songSnippets, true);
  let lookups = 0;
  ready.youtubeFetch = async url => {
    lookups += 1;
    return new Response(JSON.stringify(String(url).includes("/search?") ? { items:[{ id:{ videoId:"topicupload" } }] }
      : { items:[{ id:"topicupload", contentDetails:{ duration:"PT3M20S" }, snippet:{ channelTitle:"Band - Topic" }, status:{ embeddable:true } }] }));
  };
  assert.deepEqual(await (await ask(ready, query)).json(), { ok:true, videoId:"topicupload" });
  assert.deepEqual(await (await ask(ready, query)).json(), { ok:true, videoId:"topicupload" });
  assert.equal(lookups, 2, "one search and one read, once");
  assert.ok(entries.has("private:youtube:1234567890123456789012"), "kept in a private key, never a snapshot");
  assert.equal((await ask(ready, { ...query, trackId:"short" })).status, 400);
});

test("a search result keeps its ISRC; an old saved song without one still validates", async () => {
  const { compactSpotifyTrack } = await import("../worker/spotify.js");
  const { validateSpotifyTrack } = await import("../shared/audio.js");
  const found = compactSpotifyTrack({ id:"1234567890123456789012", uri:"spotify:track:1234567890123456789012", name:"Anthem",
    artists:[{ name:"Band" }], duration_ms:200000, external_ids:{ isrc:"usir20400274" }, album:{ images:[] } });
  assert.equal(found.isrc, "USIR20400274");
  const { isrc, ...old } = found;
  assert.equal(validateSpotifyTrack(old).track.isrc, undefined);
  assert.equal(validateSpotifyTrack({ ...old, isrc:"nope" }).track.isrc, undefined);
});

test("search runs from two characters, trimmed", () => {
  assert.equal(searchQuery(" a "), null);
  assert.equal(searchQuery("  mr   brightside "), "mr brightside");
  assert.equal(searchQuery("x".repeat(90)).length, 80);
});

const root = fileURLToPath(new URL("../", import.meta.url));
const compiled = await build({
  stdin:{ contents:`export { WinSongPicker } from "./src/features/music/WinSongPicker.jsx";`, resolveDir:root, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react"], loader:{ ".css":"empty" }, write:false, logLevel:"silent",
  plugins:[{ name:"picker-client", setup(builder) {
    builder.onLoad({ filter:/[\\/]src[\\/]lib[\\/]client\.js$/ }, () => ({ loader:"js",
      contents:`export const spotifySearch = async () => ({ ok:true, tracks:[] });
        export const songPreview = async body => { (globalThis.__previews ||= []).push(body); return { ok:false }; };
        export const songSnippet = async () => ({ ok:false });` }));
  } }],
});
const picker = new Module(fileURLToPath(new URL("win-song-picker.cjs", import.meta.url)));
picker.filename = picker.id;
picker.paths = Module._nodeModulePaths(root);
picker._compile(compiled.outputFiles[0].text, picker.filename);
const { WinSongPicker } = picker.exports;

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

test("a chosen song: its cover plays the clip, the room's 30 seconds sit on a timeline, nudges move them", () => {
  const changes = [];
  const { html, buttons } = render(React.createElement(WinSongPicker, { value:track, onChange:value => changes.push(value) }));
  assert.match(html, /Anthem/);
  assert.match(html, /Band, Guest · 3:20/);
  assert.match(html, />1:05</);
  assert.match(html, /Plays 1:05 to 1:35/);
  assert.match(html, /role="slider"[^>]*aria-valuetext="Plays 1:05 to 1:35"/);
  /* the window covers 65 to 95 of 200 seconds */
  assert.match(html, /class="fd-song-window" style="left:32.5%;width:15%"/);
  assert.match(html, /aria-label="Play a preview of Anthem"/);
  assert.match(html, /Open in Spotify/);
  assert.doesNotMatch(html, /Search Spotify/, "search waits behind Change");
  assert.doesNotMatch(html, /speaker/i, "previews play on the phone, never the room");
  assert.doesNotMatch(html, /—/);
  buttons.find(button => button.name === "Back 5 seconds").click();
  buttons.find(button => button.name === "Forward 5 seconds").click();
  assert.deepEqual(changes.map(value => value.startMs), [60000, 70000]);
  buttons.find(button => button.name === "Remove song").click();
  assert.equal(changes.at(-1), null);
});

test("with snippets set up, the window gets a button that plays exactly it", () => {
  const off = render(React.createElement(WinSongPicker, { value:track, onChange() {} })).html;
  assert.doesNotMatch(off, /Preview 1:05/);
  const on = render(React.createElement(WinSongPicker, { value:track, onChange() {}, snippets:true })).html;
  assert.match(on, />Preview 1:05 to 1:35</);
  assert.match(on, /class="fd-song-snippet-video" hidden=""/, "YouTube's player shows only once it has the song");
});

test("with no song it opens on search, with no Search button", () => {
  const empty = render(React.createElement(WinSongPicker, { value:null, onChange() {} })).html;
  assert.match(empty, /aria-label="Search Spotify"/);
  assert.match(empty, /placeholder="Song or artist"/);
  assert.match(empty, /Songs from Spotify. Previews from Deezer./);
  assert.doesNotMatch(empty, />Search</, "results come as you type");
});

test("the picker never lets a double tap zoom the page, and its field is 16px", async () => {
  const { readFile } = await import("node:fs/promises");
  const shell = await readFile(new URL("../src/ui/shell.css", import.meta.url), "utf8");
  assert.match(shell, /html \{ touch-action:manipulation;/);
  assert.match(shell, /font-size:max\(16px, 1em\)/);
  const css = await readFile(new URL("../src/features/music/winSong.css", import.meta.url), "utf8");
  assert.match(css, /\.fd-song-field input \{[^}]*font:500 16px/);
  assert.match(css, /\.fd-song-strip \{[^}]*touch-action:none/, "dragging the window never scrolls the sheet");
});
