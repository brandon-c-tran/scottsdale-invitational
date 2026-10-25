/* Trivia's sound (the rounds format): the room's cues on the server clock
   (a question going up, each lock, the question's bed and last five
   seconds, the reveal on the TV's own animation, the scores and the final
   podium), the phone's points chime, the kit's recipes and the cut gate
   that stops the bed clean; and the board format's Final loop now cut the
   same way. Pure models against real reducer states and the TV's CSS; the
   recipes render offline in dev/sound-preview.html?selftest. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { EMPTY_STATE, allEventsOf, resolveCurrentContest } from "../shared/core.js";
import { TRIVIA_CLIP_MS, TRIVIA_MS, triviaAutoBeat } from "../shared/trivia.js";
import { applyAction } from "./support/confirmed-start.mjs";

globalThis.__FD_BUILD_ID__ = "build-test";
const kit = await import("../src/lib/soundKit.js");
const room = await import("../src/features/tv/roomSound.js");
const tv = await import("../src/features/tv/triviaSound.js");
const phone = await import("../src/features/trivia/triviaPhoneSound.js");
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

let serial = 0;
const GM = { isGm:true, qa:true, progressReset:true, environment:"local" };
const gm = () => ({ ...GM, player:null, deviceId:"gm", actionId:`g${++serial}` });
const as = player => ({ isGm:false, player, deviceId:`d-${player}`, actionId:`p${++serial}` });
const act = (state, type, payload, ctx = gm()) => {
  const result = applyAction(state, type, payload, ctx);
  assert.equal(result.ok, true, `${type}: ${result.error}`);
  return result;
};
const trivia = state => allEventsOf(state).find(ev => ev.id === "trivia");
const CUSTOM = { id:"tcustom01", source:"custom", name:"The groom", questions:[
  { id:"qgroom001", format:"choice", text:"Where did Brandon propose?", options:["Kyoto", "Paris", "Big Sur", "Tahoe"], answer:2 },
  { id:"qgroom002", format:"number", text:"How many days did they date?", answer:1461, unit:"days", digits:4 },
  { id:"qgroom003", format:"picture", text:"Who is this?", photo:{ id:"pphoto0001", w:1600, h:1200 },
    options:["Evan", "Khoa", "Sahil", "Henry"], answer:0 },
  { id:"qgroom004", format:"tune", text:"", options:[{ title:"Mr. Brightside", artist:"The Killers" },
    { title:"Take Me Out", artist:"Franz Ferdinand" }, { title:"Last Nite", artist:"The Strokes" },
    { title:"The Middle", artist:"Jimmy Eat World" }], answer:0, clip:{ isrc:"USIR20400274" } },
] };
const LAST = { id:"tcustom02", source:"custom", name:"Last call", questions:[
  { id:"qlast0001", format:"choice", text:"Which city?", options:["Phoenix", "Tempe", "Mesa", "Scottsdale"], answer:3 },
] };
/* a room at Trivia with the set list saved and the first question up */
function started() {
  const state = structuredClone(EMPTY_STATE);
  act(state, "qaAdvance", { target:"event:trivia:open", seed:7 });
  const contest = resolveCurrentContest(state, trivia(state));
  act(state, "lockAndStart", { evId:"trivia", contestId:contest.id, contestRevision:contest.revision });
  if (state.trivia) act(state, "triviaRestart", { evId:"trivia" });
  for (const round of [CUSTOM, LAST]) act(state, "triviaSaveRound", { round:structuredClone(round) });
  act(state, "triviaStart", { evId:"trivia" });
  return state;
}
const current = state => state.trivia.questions[state.trivia.index];
const snap = state => room.roomSnapshot(state, allEventsOf(state), { liveEv:trivia(state) });
const triviaOnly = cues => cues.filter(cue => cue.key?.startsWith("trivia:"));
/* to the next question: reveal, then the scores if the round ends, then next */
function nextQuestion(state) {
  const q = current(state);
  act(state, "triviaReveal", { questionId:q.id });
  if (triviaAutoBeat(state)?.type === "triviaBoard") act(state, "triviaBoard", { questionId:q.id });
  act(state, "triviaNext", { questionId:q.id });
}

/* the TV's CSS, as the reveal's planner reads it */
const css = read("src/features/tv/tv-trivia.css");
const motion = read("src/ui/motion.css");
function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = s => ((ax * s + bx) * s + cx) * s, Y = s => ((ay * s + by) * s + cy) * s;
  return x => { let lo = 0, hi = 1; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (X(m) < x) lo = m; else hi = m; } return Y((lo + hi) / 2); };
}

test("a question going up: the sting at openedAt, a slap per lock from that seat; a load or a stale frame is silent", () => {
  const state = started();
  const q = current(state);
  const s0 = snap(state);
  assert.equal(s0.trivia.format, "choice");
  assert.equal(s0.trivia.startsAt - s0.trivia.openedAt, 5000, "the first question's lead");
  assert.equal(s0.trivia.closesAt - s0.trivia.startsAt, TRIVIA_MS.choice);
  const before = structuredClone(state);
  before.trivia = null;
  const open = triviaOnly(room.roomCues(snap(before), s0, { now:s0.trivia.openedAt }));
  assert.deepEqual(open.map(cue => [cue.id, cue.at]), [["sting", s0.trivia.openedAt]]);
  assert.equal(triviaOnly(room.roomCues(snap(before), s0, { now:1, reduced:true }))[0].id, "S3");
  assert.deepEqual(room.roomStep(snap(before), s0, { fresh:false }), [], "a catch-up or correction sounds nothing");
  assert.deepEqual(room.roomStep(null, s0, { fresh:true }), [], "a TV that loads mid-question sounds nothing");
  const [a, b] = state.trivia.players;
  act(state, "triviaPick", { questionId:q.id, choice:1 }, as(a));
  const s1 = snap(state);
  assert.deepEqual(triviaOnly(room.roomCues(s0, s1, { now:9 })), [], "a pick that is not locked sounds nothing");
  act(state, "triviaPick", { questionId:q.id, lock:true }, as(a));
  act(state, "triviaPick", { questionId:q.id, choice:2, lock:true }, as(b));
  const locks = triviaOnly(room.roomCues(s1, snap(state), { now:6000 }));
  assert.deepEqual(locks.map(cue => [cue.id, cue.at]), [["S18", 6000], ["S18", 6090]]);
  assert.ok(locks[0].pan < locks[1].pan, "each from their own seat, left to right");
});

test("the question's clock: the bed from startsAt, its last bar ending on the knock, tense over the last bars; five ticks on the beats", () => {
  const state = started();
  const choice = snap(state).trivia;
  const { startsAt, closesAt } = choice;
  const cues = tv.triviaClockCues(choice, startsAt - 2000);
  const bars = cues.filter(cue => cue.id === "triviaBed");
  assert.equal(bars.length, TRIVIA_MS.choice / tv.TRIVIA_BAR_MS, "ten bars");
  assert.equal(bars[0].at, startsAt, "the sting has the lead to itself; the bed starts with the clock");
  assert.equal(bars.at(-1).at + tv.TRIVIA_BAR_MS, closesAt, "the last bar ends on the knock");
  assert.ok(bars.every((bar, i) => i === 0 || bar.at - bars[i - 1].at === tv.TRIVIA_BAR_MS), "bars butt end to end");
  assert.deepEqual(bars.map(bar => bar.opts.tense), [0, 0, 0, 0, 0, 0, 0, 3, 4, 5], "a 20 s question goes tense over its last three bars");
  assert.equal(bars.filter(bar => bar.opts.last).length, 1);
  assert.deepEqual(bars.slice(-4).map(bar => bar.opts.bar), [0, 1, 2, 3], "the turn's fourth chord leads into the knock");
  const ticks = cues.filter(cue => cue.id === "triviaTick");
  assert.deepEqual(ticks.map(cue => [closesAt - cue.at, cue.opts.s]), [[5000, 5], [4000, 4], [3000, 3], [2000, 2], [1000, 1]]);
  assert.ok(ticks.every(tick => (closesAt - tick.at) % (tv.TRIVIA_BAR_MS / 4) === 0), "every tick on a beat of the bed");
  assert.match(read("src/features/tv/TVTrivia.jsx"), /seconds <= 5 && !view\.leading \? " is-low"/, "the ticks run with the ring's red seconds");
  assert.deepEqual(cues.filter(cue => cue.id === "S8").map(cue => cue.at), [closesAt]);
  assert.equal(cues.filter(cue => cue.id === "typeTick").length, 0, "the old ticks are gone");
  /* a closest number: thirty seconds, fifteen bars, the last five tense */
  nextQuestion(state);
  const number = snap(state).trivia;
  assert.equal(number.format, "number");
  const long = tv.triviaClockCues(number, number.startsAt).filter(cue => cue.id === "triviaBed");
  assert.equal(long.length, TRIVIA_MS.number / tv.TRIVIA_BAR_MS);
  assert.equal(long[0].at, number.startsAt);
  assert.deepEqual(long.slice(-6).map(bar => bar.opts.tense), [0, 1, 2, 3, 4, 5]);
  assert.equal(long.at(-1).opts.bar, 3);
  /* a TV that joins late hears only what is still ahead, from the next bar line */
  const late = tv.triviaClockCues(choice, closesAt - 5500);
  assert.ok(late.every(cue => cue.at > closesAt - 5700));
  assert.equal(late.find(cue => cue.id === "triviaBed").at, closesAt - 4000);
  assert.deepEqual(late.filter(cue => cue.id === "triviaTick").map(cue => cue.opts.s), [5, 4, 3, 2, 1]);
  /* reduced motion: the clock without the bed; any other phase: nothing */
  const reduced = tv.triviaClockCues(choice, startsAt, { reduced:true });
  assert.equal(reduced.filter(cue => cue.id === "triviaBed").length, 0);
  assert.equal(reduced.filter(cue => cue.id === "triviaTick").length, 5);
  assert.deepEqual(tv.triviaClockCues({ ...choice, phase:"reveal" }, startsAt), []);
  assert.deepEqual(tv.triviaClockCues(null, startsAt), []);
});

test("name that tune: the bed stays out while the clip plays and comes in on the bar line after it; a picture question keeps it", () => {
  const state = started();
  nextQuestion(state);
  nextQuestion(state);
  const picture = snap(state).trivia;
  assert.equal(picture.format, "picture");
  assert.equal(tv.triviaClockCues(picture, picture.startsAt).filter(cue => cue.id === "triviaBed")[0].at, picture.startsAt);
  nextQuestion(state);
  const tune = snap(state).trivia;
  assert.equal(tune.format, "tune");
  const cues = tv.triviaClockCues(tune, tune.startsAt - 1000);
  const bars = cues.filter(cue => cue.id === "triviaBed");
  assert.ok(bars.every(bar => bar.at >= tune.startsAt + TRIVIA_CLIP_MS), "nothing under the clip");
  assert.equal(bars[0].at, tune.startsAt + TRIVIA_CLIP_MS, "in on the bar line the clip leaves");
  assert.equal(TRIVIA_CLIP_MS % tv.TRIVIA_BAR_MS, 0, "the clip ends on a bar line");
  assert.equal(bars.at(-1).at + tv.TRIVIA_BAR_MS, tune.closesAt);
  assert.deepEqual(bars.map(bar => bar.opts.tense), [0, 0, 3, 4, 5], "tense as any 20 s question");
  assert.equal(cues.filter(cue => cue.id === "triviaTick").length, 5, "the last five still tick");
  /* the clip's own window is the same ten seconds (tuneClip, TVTrivia) */
  assert.match(read("src/features/tv/TVTrivia.jsx"), /now < view\.startsAt \+ TRIVIA_CLIP_MS/);
});

test("the reveal on the TV's own animation: the stamp, the counts, the faces, the points and the settle, from the frame that shows it", () => {
  /* the planner's numbers are the CSS's */
  const T = tv.TRIVIA_TV;
  assert.match(css, /\.tv-trivia-options li\.is-right \{[^}]*animation:tv-trivia-stamp-in \.5s var\(--ease-land\) \.2s both/);
  assert.match(css, /\.tv-trivia-answer \{[^}]*animation:tv-trivia-stamp-in \.55s var\(--ease-land\) \.2s both/);
  assert.equal(T.stamp, 200);
  assert.match(css, new RegExp(`\\.tv-trivia-tally \\{[^}]*animation:tv-trivia-rise \\.45s cubic-bezier\\(\\.2,\\.8,\\.2,1\\) calc\\(\\.7s \\+ var\\(--i\\) \\* ${T.tally.step}ms\\)`));
  assert.deepEqual([T.tally.at, T.tally.ms], [700, 450]);
  assert.match(css, new RegExp(`\\.tv-trivia-faces > span \\{[^}]*animation:tv-trivia-land \\.4s var\\(--ease-land\\) calc\\(1s \\+ var\\(--i\\) \\* ${T.face.step}ms\\)`));
  assert.deepEqual([T.face.at, T.face.ms], [1000, 400]);
  assert.match(css, new RegExp(`\\.tv-trivia-row-plus \\{[^}]*animation:tv-trivia-fly \\.7s cubic-bezier\\(\\.2,\\.8,\\.2,1\\) calc\\(1\\.2s \\+ var\\(--row\\) \\* ${T.plus.step}ms\\)`));
  assert.deepEqual([T.plus.at, T.plus.ms], [1200, 700]);
  const src = read("src/features/tv/TVTrivia.jsx");
  assert.match(src, new RegExp(`function Faces\\(\\{ lanes, max = ${T.face.max}`));
  assert.match(src, new RegExp(`view\\.standings\\.slice\\(0, ${T.plus.rows}\\)`));
  assert.match(src, new RegExp(`nearestGuesses\\(view\\)\\.slice\\(0, ${T.plus.near}\\)`));
  /* "arrived" is where the curves say: the rise 80% of the way, the land 90% */
  assert.match(motion, /--ease-land:cubic-bezier\(\.3,\.7,\.35,1\.25\)/);
  assert.ok(bezier(0.2, 0.8, 0.2, 1)(tv.RISE_HIT) >= 0.79);
  assert.ok(bezier(0.3, 0.7, 0.35, 1.25)(tv.LAND_HIT) >= 0.89);

  /* a real reveal: three right, one wrong */
  const state = started();
  const q = current(state);
  const [a, b, c, d] = state.trivia.players;
  for (const [player, choice] of [[a, 2], [b, 2], [c, 2], [d, 0]]) act(state, "triviaPick", { questionId:q.id, choice, lock:true }, as(player));
  const s0 = snap(state);
  act(state, "triviaReveal", { questionId:q.id });
  const s1 = snap(state);
  assert.deepEqual(s1.trivia.reveal, { options:4, faces:3, points:[0, 1, 2] });
  const shown = s1.trivia.revealedAt + 140;
  const cues = triviaOnly(room.roomCues(s0, s1, { now:shown }));
  assert.deepEqual(cues.map(cue => cue.id), ["triviaAnswer", "triviaTally", "triviaFaces", "triviaPoints"]);
  const [answer, tally, faces, points] = cues;
  assert.equal(answer.at, shown + tv.TRIVIA_STAMP_HIT_MS, "the stamp with the right answer's stamp-in, from the frame");
  assert.equal(tally.at, shown + 700 + Math.round(450 * tv.RISE_HIT));
  assert.deepEqual(tally.opts.offsets, [0, 90, 180, 270], "a count a step, as they rise");
  assert.deepEqual([faces.at, faces.opts.n, faces.opts.gap], [shown + 1000 + Math.round(400 * tv.LAND_HIT), 3, 70]);
  assert.equal(points.at, shown + 1200 + Math.round(700 * tv.RISE_HIT));
  assert.deepEqual(points.opts.offsets, [0, 60, 120]);
  assert.ok(points.at + 120 + 140 + 1100 < s1.trivia.revealedAt + 9000, "the settle rings out inside the reveal's hold");
  assert.ok(!cues.some(cue => cue.id === "stamp" || cue.id === "S12"), "the old stamp and riffle are replaced, not stacked");
  /* a frame that lands later still starts from the write, never before it, and a stale one is silent */
  assert.equal(triviaOnly(room.roomCues(s0, s1, { now:s1.trivia.revealedAt - 400 }))[0].at, s1.trivia.revealedAt + tv.TRIVIA_STAMP_HIT_MS);
  assert.equal(tv.seenAt(1000, 9000), 1000 + tv.TRIVIA_SEEN_MS);
  assert.deepEqual(room.roomStep(s0, s1, { fresh:false }), []);
  assert.deepEqual(triviaOnly(room.roomCues(s1, snap(structuredClone(state)), { now:shown + 500 })), [], "the same reveal never sounds twice");
  /* reduced motion: the stamp alone, at once */
  assert.deepEqual(triviaOnly(room.roomCues(s0, s1, { now:shown, reduced:true })).map(cue => [cue.id, cue.at]), [["triviaAnswer", shown]]);
  /* sparse rows: only the rows whose points fly, at their own row */
  const sparse = tv.triviaRevealCues({ anchor:0, reveal:{ options:4, faces:8, points:[1, 4] } });
  assert.deepEqual(sparse.find(cue => cue.id === "triviaPoints").opts.offsets, [0, 180]);
  assert.equal(sparse.find(cue => cue.id === "triviaPoints").at, 1200 + 60 + Math.round(700 * tv.RISE_HIT));
  /* nobody right: the stamp and the counts, no faces, no points, no settle */
  assert.deepEqual(tv.triviaRevealCues({ anchor:0, reveal:{ options:4, faces:0, points:[] } }).map(cue => cue.id), ["triviaAnswer", "triviaTally"]);
});

test("an early reveal: everyone locked in stops the clock where it stands; a closest number reveals its nearest that scored", () => {
  const state = started();
  nextQuestion(state);
  const q = current(state);
  assert.equal(q.format, "number");
  const players = state.trivia.players;
  players.forEach((player, i) => act(state, "triviaPick", { questionId:q.id, value:1461 + (i - 2) * 10, lock:true }, as(player)));
  const beat = triviaAutoBeat(state);
  assert.equal(beat.type, "triviaReveal");
  assert.ok(beat.at < state.trivia.times[q.id].closesAt, "the room reveals before the clock runs out");
  const s0 = snap(state);
  act(state, "triviaReveal", { questionId:q.id });
  const s1 = snap(state);
  assert.deepEqual(tv.triviaClockCues(s1.trivia, s1.trivia.revealedAt), [], "the revealed question owes the clock nothing");
  assert.equal(s1.trivia.reveal.options, 0);
  assert.equal(s1.trivia.reveal.faces, 0);
  assert.ok(s1.trivia.reveal.points.length >= 1 && s1.trivia.reveal.points[0] === 0, "the nearest scored, first in the list");
  const cues = triviaOnly(room.roomCues(s0, s1, { now:s1.trivia.revealedAt + 100 }));
  assert.deepEqual(cues.map(cue => cue.id), ["triviaAnswer", "triviaPoints"]);
  /* the hook's stand key moves with the phase, so its handles are cancelled */
  const hook = read("src/features/tv/triviaSound.js");
  assert.match(hook, /const stand = snap\?\.phase === "question" && snap\.closesAt \? `\$\{snap\.id\}:\$\{snap\.startsAt\}:\$\{snap\.closesAt\}` : null;/);
  assert.match(hook, /return \(\) => handles\.forEach\(handle => handle\?\.cancel\?\.\(\)\);/);
});

test("the scores between rounds and the final podium: a chip a row then the motif; a stamp a step; never S14, and nothing once the result posts", () => {
  const T = tv.TRIVIA_TV;
  assert.match(css, new RegExp(`\\.tv-trivia-row, \\.tv-trivia-near li \\{[^}]*animation:tv-trivia-rise \\.45s cubic-bezier\\(\\.2,\\.8,\\.2,1\\) calc\\(var\\(--row\\) \\* ${T.row.step}ms\\)`));
  assert.match(css, /\.tv-trivia-step \{[^}]*animation:tv-trivia-rise \.6s/);
  assert.match(css, /\.tv-trivia-step\.is-third \{[^}]*animation-delay:\.2s/);
  assert.match(css, /\.tv-trivia-step\.is-second \{[^}]*animation-delay:\.6s/);
  assert.match(css, /\.tv-trivia-step\.is-first \{[^}]*animation-delay:1\.1s/);
  assert.deepEqual([T.step[3], T.step[2], T.step[1], T.step.ms], [200, 600, 1100, 600]);
  assert.match(read("src/features/tv/TVTrivia.jsx"), /i=\{c \* half \+ i\}/, "the board's rows rise in one order across its columns");

  const state = started();
  for (let i = 0; i < 3; i++) nextQuestion(state);
  const q4 = current(state);
  act(state, "triviaReveal", { questionId:q4.id });
  const r = snap(state);
  act(state, "triviaBoard", { questionId:q4.id });
  const b = snap(state);
  assert.equal(b.trivia.last, false);
  const shown = b.trivia.boardAt + 80;
  const scores = triviaOnly(room.roomCues(r, b, { now:shown }));
  assert.deepEqual(scores.map(cue => cue.id), ["triviaScores"]);
  assert.equal(scores[0].at, shown + Math.round(450 * tv.RISE_HIT));
  assert.deepEqual(scores[0].opts.offsets, Array.from({ length:b.trivia.rows }, (_, i) => i * 90), "a chip as each row rises");
  assert.deepEqual(triviaOnly(room.roomCues(r, b, { now:shown, reduced:true })).map(cue => [cue.id, cue.opts.summary]), [["triviaScores", true]]);
  /* the last question, then the final podium: reachable on the autopilot's own beats */
  act(state, "triviaNext", { questionId:q4.id });
  const q5 = current(state);
  state.trivia.players.slice(0, 3).forEach((player, i) => act(state, "triviaPick", { questionId:q5.id, choice:i + 1, lock:true }, as(player)));
  act(state, "triviaReveal", { questionId:q5.id });
  assert.equal(triviaAutoBeat(state).type, "triviaBoard");
  const r5 = snap(state);
  act(state, "triviaBoard", { questionId:q5.id });
  assert.equal(triviaAutoBeat(state).type, "triviaFinish", "the podium stands, then the result posts");
  const f = snap(state);
  assert.equal(f.trivia.last, true);
  const podium = triviaOnly(room.roomCues(r5, f, { now:f.trivia.boardAt }));
  assert.deepEqual(podium.map(cue => [cue.id, cue.opts.place, cue.at - f.trivia.boardAt]),
    [3, 2, 1].map(place => ["podium", place, T.step[place] + Math.round(600 * tv.RISE_HIT)]));
  assert.ok(!room.roomCues(r5, f, { now:f.trivia.boardAt }).some(cue => cue.id === "S14"), "the posted result rings S14, not the podium");
  assert.deepEqual(triviaOnly(room.roomCues(r5, f, { now:f.trivia.boardAt, reduced:true })).map(cue => [cue.id, cue.opts.place]), [["podium", 1]]);
  assert.deepEqual(tv.triviaBoardCues({ anchor:0, rows:2, last:true }).map(cue => cue.opts.place), [2, 1], "two players, two steps");
  act(state, "triviaFinish", { evId:"trivia" });
  assert.equal(snap(state).trivia, null, "the result posted: the game is silent");
  assert.deepEqual(triviaOnly(room.roomCues(f, snap(state), { now:Date.now() })), []);
});

test("the wiring: the room's snapshot carries the game, its clock rides useRoomSound, TVTrivia lays no clock of its own", () => {
  const roomSrc = read("src/features/tv/roomSound.js");
  assert.match(roomSrc, /trivia:triviaSnapshot\(state\)/);
  assert.match(roomSrc, /triviaCues\(prev, next, \{ now, reduced \}\)/);
  assert.match(roomSrc, /useTriviaRoomClock\(snap\?\.trivia \|\| null\)/);
  assert.doesNotMatch(roomSrc, /useTriviaClock|towersUp", at:t\.boardAt/);
  const tvSrc = read("src/features/tv/TVTrivia.jsx");
  assert.doesNotMatch(tvSrc, /useTriviaClock|roomSound/);
  const own = read("src/features/tv/triviaSound.js");
  assert.doesNotMatch(own, /bus:\s*"(you|gm)"|playSound\(/);
});

test("the phone: your points chime as their count stops, brighter as they climb; a wrong answer is silent", () => {
  assert.deepEqual([0, -500, 10, 500, 690, 700, 890, 900, 1000, 1250].map(phone.triviaScoreTier), [0, 0, 1, 1, 1, 2, 2, 3, 3, 3]);
  assert.equal(phone.triviaScoreCue(0), null, "wrong, or no answer: silent");
  assert.deepEqual(phone.triviaScoreCue(760), { tier:2, delayMs:phone.TRIVIA_COUNT.delay + phone.TRIVIA_COUNT.ms });
  assert.deepEqual(phone.triviaScoreCue(1000, { reduced:true }), { tier:3, delayMs:0 });
  const play = read("src/features/trivia/TriviaPlay.jsx");
  assert.match(play, /useCountTo\(myScore\?\.points \|\| 0, \{ delay:TRIVIA_COUNT\.delay, ms:TRIVIA_COUNT\.ms, run:fresh \}\)/,
    "the chime waits for the count Points draws");
  assert.match(play, /useTriviaScoreSound\(question\.id, myScore\?\.points \|\| 0, \{ fresh, reduced \}\)/);
  assert.doesNotMatch(play, /"payout"/, "points are not chips: no riffle");
  assert.match(play, /playSound\("S18", \{ bus:"you" \}\)/, "choose");
  assert.match(play, /if \(result\?\.ok\) playSound\("stamp", \{ bus:"you" \}\)/, "Lock in, on the server's answer");
  const own = read("src/features/trivia/triviaPhoneSound.js");
  assert.match(own, /if \(!fresh \|\| !questionId \|\| !freshFrameNow\(\)\) return undefined;/, "only a reveal that arrived fresh");
  assert.doesNotMatch(own, /bus:\s*"room"|cueAt\(/);
});

/* a recording context, enough for the kit */
function fakeContext() {
  class Param {
    constructor(v = 0) { this.value = v; this.events = []; }
    setValueAtTime(v, t) { this.events.push(["set", v, t]); this.value = v; }
    linearRampToValueAtTime(v, t) { this.events.push(["ramp", v, t]); }
    exponentialRampToValueAtTime(v, t) { this.events.push(["exp", v, t]); }
    cancelScheduledValues(t) { this.events.push(["cancel", t]); }
    setTargetAtTime() {}
  }
  class Node {
    constructor(ctx, kind) { this.ctx = ctx; this.kind = kind; this.connected = []; this.starts = [];
      for (const name of ["gain", "frequency", "Q", "pan", "threshold", "knee", "ratio", "attack", "release"]) this[name] = new Param(1); }
    connect(node) { this.connected.push(node); return node; } disconnect() { this.disconnected = (this.disconnected || 0) + 1; }
    start(t) { this.starts.push(t); } stop() {}
  }
  return { currentTime:10, sampleRate:8000, destination:{}, nodes:[],
    node(kind) { const n = new Node(this, kind); this.nodes.push(n); return n; },
    createGain() { return this.node("gain"); }, createBiquadFilter() { return this.node("filter"); },
    createDynamicsCompressor() { return this.node("comp"); }, createConvolver() { return this.node("conv"); },
    createStereoPanner() { return this.node("pan"); }, createOscillator() { return this.node("osc"); },
    createBufferSource() { return this.node("src"); },
    createBuffer(channels, length) { return { length, numberOfChannels:channels, getChannelData:() => new Float32Array(length) }; } };
}

test("the kit's Trivia recipes: each playable on its opts, every node released when its last source ends; the bed in D, not geo's", () => {
  const ctx = fakeContext();
  const E = kit.makeEngine(ctx, { listen:"tv" });
  const base = ctx.nodes.length;
  const ids = kit.TRIVIA_PARTS.map(part => part.id);
  assert.deepEqual(ids, ["triviaBed", "triviaTick", "triviaAnswer", "triviaTally", "triviaFaces", "triviaPoints", "triviaScores", "triviaScore"]);
  for (const id of ids) for (const opts of [{}, { bar:3, tense:5, last:true, s:1, n:7, gap:70, offsets:[0, 60, 240], summary:true, tier:3 }]) {
    ctx.nodes.length = base;
    assert.equal(kit.isSound(id), true, id);
    assert.ok(kit.playRecipe(E, id, 10, opts), id);
    const made = ctx.nodes.slice(base);
    const sources = made.filter(n => n.kind === "osc" || n.kind === "src");
    assert.ok(sources.length > 0, `${id} makes sound`);
    assert.ok(sources.every(n => typeof n.onended === "function"), `${id}: every source reports its end`);
    sources.forEach(n => n.onended());
    assert.ok(made.every(n => n.disconnected === 1), `${id}: every node released once`);
  }
  assert.equal(E.graph, undefined);
  assert.equal(E.cutDry, undefined, "no gate left open between recipes");
  const inD = new Set(["D", "E", "Fs", "A", "B"]);
  const names = Object.entries(kit.NOTE).map(([name, f]) => [name.replace(/\d/g, ""), f]);
  const noteOf = f => names.find(([, g]) => Math.abs(Math.log2(f / g) - Math.round(Math.log2(f / g))) < 1e-6)?.[0];
  for (const bar of kit.TRIVIA_BED) for (const f of [bar.root, ...bar.notes]) assert.ok(inD.has(noteOf(f)), `${f} Hz is in D`);
  assert.notDeepEqual(kit.TRIVIA_BED.map(bar => bar.root), kit.GEO_BED.map(bar => bar.root), "another turn than Where and When's");
  /* straight, where geo swings: an offbeat lands on the grid */
  const starts = id => { ctx.nodes.length = base; kit.playRecipe(E, id, 10, { bar:0 });
    const s = new Set(); ctx.nodes.slice(base).filter(n => n.kind === "osc").forEach(n => n.starts.forEach(t => s.add(Math.round((t - 10) * 1000))));
    ctx.nodes.slice(base).filter(n => n.kind === "osc" || n.kind === "src").forEach(n => n.onended()); return s; };
  assert.ok(starts("triviaBed").has(250) && !starts("triviaBed").has(305));
  assert.ok(starts("geoBed").has(305), "geo keeps its swing");
});

test("the beds and the Final's loop are cut recipes: a stopped bar goes silent, one not yet started never sounds, and no gate leaks", () => {
  for (const id of ["triviaBed", "geoBed", "think"]) assert.equal(kit.cutSound(id), true, id);
  for (const id of ["triviaTick", "triviaAnswer", "triviaScores", "S8"]) assert.equal(kit.cutSound(id), false, id);
  for (const id of ["triviaBed", "think"]) {
    const ctx = fakeContext();
    const E = kit.makeEngine(ctx, { listen:"tv" });
    const base = ctx.nodes.length;
    const handle = kit.playRecipe(E, id, 12, { bar:1 });
    assert.equal(typeof handle.stop, "function", id);
    const gates = ctx.nodes.slice(base, base + 2);
    assert.deepEqual(gates.map(n => n.connected[0]), [E.dry, E.wet], `${id}: the gate stands before the engine (the walkout duck still holds)`);
    const voices = ctx.nodes.slice(base + 2).filter(n => n.kind === "pan");
    assert.ok(voices.length && voices.every(n => n.connected.includes(gates[0])), `${id}: every voice through the gate`);
    handle.stop();
    assert.ok(gates.every(n => n.gain.events.some(([kind, v, t]) => kind === "set" && v === 0 && t === 10)), `${id}: held silent before it starts`);
    ctx.currentTime = 13;
    const from = ctx.nodes.length;
    const ringing = kit.playRecipe(E, id, 12.5, { bar:2 });
    const ring = ctx.nodes.slice(from, from + 2);
    ringing.stop(); ringing.stop();
    for (const gate of ring) assert.deepEqual(gate.gain.events.filter(e => e[0] === "ramp"), [["ramp", 0, 13 + kit.CUT_FADE_S]], `${id}: fades once`);
    /* every node, the gates too, lets go when the sources end */
    const made = ctx.nodes.slice(from);
    made.filter(n => n.kind === "osc" || n.kind === "src").forEach(n => n.onended());
    assert.ok(made.every(n => n.disconnected === 1), `${id}: nothing left running`);
    assert.equal(E.cutDry, undefined);
  }
});

test("the engine: cancel closes a ringing trivia bar; the bed never plays on a phone's bus", async () => {
  const sound = await import("../src/lib/sound.js");
  const made = [];
  class Ctx {
    constructor() { Object.assign(this, fakeContext()); this.state = "suspended"; this.outputLatency = 0; made.push(this); }
    resume() { this.state = "running"; this.onstatechange?.(); return Promise.resolve(); }
    close() { this.state = "closed"; }
  }
  sound.__resetSoundEngine({ factory:Ctx });
  sound.setSoundSurface("tv");
  sound.primeSound();
  const ctx = made[0];
  const from = ctx.nodes.length;
  const bar = sound.cueAt("triviaBed", Date.now(), { opts:{ bar:0 } });
  assert.ok(bar, "the bar plays now");
  const gates = ctx.nodes.slice(from, from + 2);
  bar.cancel();
  assert.ok(gates.every(n => n.gain.events.some(e => (e[0] === "set" || e[0] === "ramp") && e[1] === 0)), "cancel closed the gate");
  const waiting = sound.cueAt("triviaBed", Date.now() + 5000, { opts:{ bar:1 } });
  const before = ctx.nodes.length;
  waiting.cancel();
  assert.equal(ctx.nodes.length, before, "a bar still waiting is dropped before it builds anything");
  assert.equal(sound.playSound("triviaBed", { bus:"you" }), null, "the bed never sounds on a phone's bus from the TV");
  sound.setSoundSurface("phone");
  assert.equal(sound.cueAt("triviaBed", Date.now()), null, "nor in the room from a phone");
  sound.__resetSoundEngine();
});
