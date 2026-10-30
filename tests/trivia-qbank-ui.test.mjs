/* The question bank's board on the screens (docs/TRIVIA-QBANK.md): seven
   columns on the TV and the phone (the phone with each category's short
   name), every clue kind drawn by the real components over games the real
   writes played on the fixture bank (dev/fit/qbankFixtures.js): text, an
   image with its subject, an audio clip (the speaker and its bar), a video
   (no controls), a silhouette and a crop that swap in their reveal image;
   phones see an image small and never a clip; the clip's plan follows the
   arm, the host's replay and pause, and stops when the clue leaves. */
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import { publicState } from "../worker/publicState.js";
import { BANK_FIXTURES, BANK_STAGES, bankStage } from "../dev/fit/qbankFixtures.js";
import { boardInstants, boardScreen, boardView, columnShort, tvBoardScene } from "../src/features/trivia/boardModel.js";
import { boardClipPlan, mediaWaiting, shownMediaOf } from "../src/features/trivia/boardMedia.js";
import { QBANK_CATEGORIES } from "../shared/triviaQBank.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const say = console.error;
console.error = (...args) => /useLayoutEffect/.test(String(args[0])) ? undefined : say(...args);
const NOW = 1_900_000_000_000;
const ME = "Richard";
const stage = name => bankStage(name, { now:NOW }).state;
const record = id => BANK_FIXTURES.records.find(item => item.id === id);

let ui = null;
async function components() {
  if (ui) return ui;
  const { buildSync } = await import("esbuild");
  const { Module } = await import("node:module");
  const React = (await import("react")).default;
  const { renderToStaticMarkup } = await import("react-dom/server");
  const out = buildSync({ stdin:{ contents:[
    'export { TriviaPlaySheet } from "./src/features/trivia/TriviaPlay.jsx";',
    'export { TVTrivia } from "./src/features/tv/TVTrivia.jsx";',
    'export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";'].join("\n"),
  resolveDir:ROOT, loader:"jsx" }, bundle:true, platform:"node", format:"cjs", external:["react", "react-dom"],
  loader:{ ".css":"empty" }, write:false, logLevel:"silent" });
  const mod = new Module(fileURLToPath(new URL("trivia-qbank-ui.cjs", import.meta.url)));
  mod.filename = mod.id; mod.paths = Module._nodeModulePaths(ROOT);
  mod._compile(out.outputFiles[0].text, mod.filename);
  const wrap = (s, node) => renderToStaticMarkup(React.createElement(mod.exports.PlayerIdentityProvider, { profiles:s.profiles || {} }, node));
  ui = { ...mod.exports, React, wrap };
  return ui;
}
const drawTv = async (name, at = NOW) => {
  const { React, wrap, TVTrivia } = await components();
  const s = publicState(stage(name), {});
  return wrap(s, React.createElement(TVTrivia, { state:s, now:at, fixed:true }));
};
const drawPhone = async (name, player = ME, at = NOW, built = null) => {
  const { React, wrap, TriviaPlaySheet } = await components();
  const s = publicState(built || stage(name), { player });
  return wrap(s, React.createElement(TriviaPlaySheet, { state:s, me:player, now:at, onAct:async () => ({ ok:true }) }));
};

test("every bank stage builds through the real writes", () => {
  for (const name of BANK_STAGES) assert.ok(stage(name).trivia, name);
});

test("seven columns: the TV letters each category's board name, a phone its short name", async () => {
  const tv = await drawTv("pick");
  assert.equal((tv.match(/class="tv-board-head"/g) || []).length, 7);
  assert.equal((tv.match(/class="tv-board-cell"/g) || []).length, 35);
  for (const value of ["100", "200", "300", "400", "500"]) assert.ok(tv.includes(`>${value}</b>`), value);
  assert.ok(tv.includes("Internet") && tv.includes("Archaeology"), "a long name on two lines");
  const view = boardView(publicState(stage("pick"), { player:ME }), ME, NOW);
  assert.deepEqual(view.columns.map(columnShort), QBANK_CATEGORIES.map(category => category.short));
  const built = stage("pick");
  const phone = await drawPhone("pick", built.trivia.control, NOW, built);
  assert.equal((phone.match(/fd-board-colname/g) || []).length, 7);
  assert.ok(phone.includes(">Old Web<") && phone.includes(">NBA<"), "the short names");
  assert.equal((phone.match(/<button type="button" class="fd-board-cell is-live/g) || []).length, 35);
});

test("the TV: a text clue, an image with its subject, an audio clip's speaker and bar, a video with no controls", async () => {
  const text = await drawTv("text");
  assert.ok(text.includes(record("fx-lore-2").prompt));
  assert.ok(!/tv-board-media|<video|tv-board-clipbar/.test(text), "text alone");
  const image = await drawTv("image");
  assert.match(image, new RegExp(`<img src="${record("fx-nba-1").media.src}"`));
  assert.match(image, /tv-board-subject[^>]*>Fixture Player</);
  assert.ok(!image.includes(record("fx-nba-1").revealMedia.src), "no reveal image before the reveal");
  const audio = await drawTv("audio");
  assert.match(audio, /tv-board-clip/);
  assert.match(audio, /tv-board-speaker is-live/, "the speaker pumps while the clip plays");
  assert.match(audio, /tv-board-clipbar is-playing/);
  assert.ok(!audio.includes(record("fx-sound-1").media.src), "the audio file is not in the page: the room's element plays it");
  const video = await drawTv("video");
  assert.match(video, new RegExp(`<video[^>]*src="${record("fx-web-1").media.src}"`));
  assert.ok(!/<video[^>]*controls=""/.test(video) && /<video[^>]*playsinline/i.test(video), "no controls");
  assert.match(video, /tv-board-clipbar is-playing/);
});

test("the reveal: the silhouette and the crop swap in their originals, the note under the answer", async () => {
  for (const [name, id] of [["sil-reveal", "fx-sil-1"], ["crop-reveal", "fx-web-2"], ["image-reveal", "fx-nba-1"]]) {
    const html = await drawTv(name);
    const source = record(id);
    assert.match(html, /tv-board-panel tv-glass is-answer is-reveal/, name);
    assert.ok(html.includes(source.revealMedia.src), `${name}: the reveal image`);
    assert.ok(!html.includes(source.media.src), `${name}: the clue image gone`);
    assert.ok(html.includes(source.reveal), `${name}: the note`);
  }
  const before = await drawTv("sil");
  assert.ok(before.includes(record("fx-sil-1").media.src) && !before.includes(record("fx-sil-1").revealMedia.src));
});

test("a phone: an image clue small over the buzzer, the reveal's image after; a clip never on a phone", async () => {
  const image = await drawPhone("image");
  assert.match(image, /fd-buzzer/);
  assert.match(image, new RegExp(`fd-board-media"><img src="${record("fx-nba-1").media.src}"`));
  const reveal = await drawPhone("sil-reveal");
  assert.ok(reveal.includes(record("fx-sil-1").revealMedia.src));
  for (const name of ["audio", "video", "audio-answer", "audio-replay"]) {
    const html = await drawPhone(name);
    assert.ok(!/<audio|<video|fd-board-media/.test(html), `${name}: nothing plays on a phone`);
    for (const id of ["fx-sound-1", "fx-web-1", "fx-aux-2"]) assert.ok(!html.includes(record(id).media.src), `${name}: no file`);
  }
  assert.equal(boardScreen(boardView(publicState(stage("audio"), { player:ME }), ME, NOW)), "buzzer");
});

test("the clip's plan: from the arm, again on the host's replay, stopped by his pause and when the clue leaves", () => {
  const tv = name => boardView(publicState(stage(name), {}), null, NOW);
  const audio = tv("audio");
  const plan = boardClipPlan(audio, NOW);
  assert.deepEqual([plan.kind, plan.src, plan.ms, plan.active, plan.at], ["audio", record("fx-sound-1").media.src, 1000, true, audio.armAt]);
  assert.equal(boardClipPlan(audio, audio.armAt + 1001).active, false, "its window over");
  assert.ok(boardInstants(audio, NOW).includes(audio.armAt + 1000), "the TV wakes as the clip ends");
  const answer = tv("audio-answer");
  assert.equal(boardClipPlan(answer, NOW).active, false, "the buzzers closed: the clip stopped");
  const replay = tv("audio-replay");
  const again = boardClipPlan(replay, NOW);
  assert.equal(again.replay, true);
  assert.equal(again.active, NOW < again.at + again.ms, "the host's replay plays while they answer");
  assert.equal(again.start, 0.2, "the file's own window");
  const reveal = tv("image-reveal");
  assert.equal(boardClipPlan(reveal, NOW), null, "an image has no clip");
  assert.equal(shownMediaOf(reveal.clue, true).src, record("fx-nba-1").revealMedia.src);
  const video = tv("video");
  assert.equal(boardClipPlan(video, NOW).kind, "video");
  assert.equal(tvBoardScene(video, NOW), "armed");
  /* the TV reported ready during the zoom: nothing waits */
  assert.equal(mediaWaiting(video), false);
});
