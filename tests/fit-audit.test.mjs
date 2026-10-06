/* The fit audit's pure parts, pinned (the browser run is npm run audit:fit):
   its rules over measured records, the real data shapes its scenarios build,
   the in-memory transport standing in for the real one, and the geometry
   the TV now fits by construction (the crown's pace, the champion card,
   the poker ring, tower names, the payout ladder). */
import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

import { ROSTER } from "../shared/core.js";
import { CLIP_TOL, MIN_TEXT, clipFindings, boundsFindings, overlapFindings, overlayFindings, smallFindings, foldFindings, findingsFor,
  failing, summarize } from "../dev/fit/rules.js";
import { TV_SCENARIOS, PHONE_SCENARIOS, FIT_NAMES, FIT_PHOTOS, buildScenario, aged } from "../dev/fit/scenarios.js";
import { FIT_EXCEPTIONS } from "../dev/fit/exceptions.js";
import { CROWN_TIMING, crownOutAt } from "../src/features/tv/tvMotion.js";
import { PHONE_CROWN } from "../src/features/results/crownTiming.js";
import { frozenAmbient } from "../src/features/results/classPhoto.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const compiled = await build({
  stdin:{ contents:`export { championNameFit, medalLayout } from "./src/features/tv/TVChampion.jsx";
    export { tableRing, seatPoint, SEAT } from "./src/features/tv/TVPoker.jsx";
    export { towerNameFit, matchTitle, BIG_BRACKET } from "./src/features/tv/TVMode.jsx";
    export { sideBracketDims, roundHead, roundHeadFit } from "./src/features/tv/TVBracket.jsx";
    export { payoutSteps, ladderChips } from "./src/ui/PayoutLadder.jsx";
    export { trophyPlateFit } from "./src/features/weekend/Trophy.jsx";`, resolveDir:root, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react", "react-dom", "qrcode-generator", "three"], loader:{ ".css":"empty" },
  write:false, logLevel:"silent",
});
const mod = new Module(fileURLToPath(new URL("fit-audit.cjs", import.meta.url)));
mod.filename = mod.id;
mod.paths = Module._nodeModulePaths(root);
mod._compile(compiled.outputFiles[0].text, mod.filename);
const ui = mod.exports;

/* ── the rules ── */
const text = (over = {}) => ({ id:0, sel:"div.name", text:"SQUILLIAM", fontPx:30, lineHeight:"33px", ellipsisOk:false, moving:false, ...over });
const clip = (over, trunc = null) => ({ id:0, line:0, clipSel:"div.box", trunc, over:{ left:0, right:0, top:0, bottom:0, ...over },
  ink:{ x:0, y:0, w:100, h:30 }, clip:{ x:0, y:0, w:90, h:28 } });

test("rules: a cut descender, an ellipsis, and the opt-in for a truncation that is meant", () => {
  assert.deepEqual(clipFindings({ text:[text()], clips:[clip({ bottom:CLIP_TOL })] }), [], "within a pixel is not a cut");
  const cut = clipFindings({ text:[text()], clips:[clip({ bottom:3 })] });
  assert.equal(cut.length, 1);
  assert.equal(cut[0].rule, "clip");
  assert.match(cut[0].detail, /descenders cut/);
  const dots = clipFindings({ text:[text()], clips:[clip({ right:20 }, "ellipsis")] });
  assert.equal(dots[0].rule, "ellipsis", "a name cut short with an ellipsis is its own finding");
  assert.equal(clipFindings({ text:[text()], clips:[clip({ bottom:4 }, "ellipsis")] })[0].rule, "clip",
    "an ellipsis box that cuts a descender is still a clip");
  assert.deepEqual(clipFindings({ text:[text({ ellipsisOk:true })], clips:[clip({ right:20 }, "ellipsis")] }), [],
    "data-fit=\"ellipsis\" opts a free text in (a song title)");
  const both = clipFindings({ text:[text()], clips:[clip({ right:20 }, "ellipsis"), clip({ right:12 })] });
  assert.deepEqual(both.map(f => f.rule), ["ellipsis"], "a truncated line is reported once");
});

test("rules: the leaderboard heading's title line stays on the first screen, above the bottom docks", () => {
  const fold = over => ({ fold:{ sel:"div.fd-section-heading > h2", text:"Leaderboard", top:540, bottom:570, limit:593, vh:667, ...over } });
  assert.deepEqual(foldFindings(fold()), [], "whole above the tab bar");
  assert.deepEqual(foldFindings({}), [], "a view without the mark has nothing to fold");
  const low = foldFindings(fold({ top:580, bottom:610 }));
  assert.equal(low.length, 1);
  assert.equal(low[0].rule, "fold");
  assert.match(low[0].detail, /first screen's 593px/);
  assert.equal(findingsFor(fold({ top:900, bottom:930 }), { mode:"phone", view:"phone-375-team-drawn-home" })[0].rule, "fold");
});

test("rules: bounds, overlaps, docks and the text floors", () => {
  const records = { text:[text(), text({ id:1, text:"400", moving:true })], bounds:[
    { id:0, kind:"safe", by:12, ink:{ x:50, y:0, w:10, h:10 } }, { id:1, kind:"canvas", by:40, ink:{ x:0, y:0, w:1, h:1 } },
    { id:-1, control:"button.fd-x", kind:"viewport", by:6, ink:{ x:0, y:0, w:1, h:1 } }] };
  const bounds = boundsFindings(records, { mode:"tv" });
  assert.deepEqual(bounds.map(f => f.detail), ["outside the TV safe area by 12px (canvas px)", "outside the viewport by 6px (canvas px)"],
    "text mid-flight is judged where it lands");
  assert.deepEqual(overlapFindings({ overlaps:[{ kind:"text-text", a:"a", at:"A", b:"b", bt:"B", x:2, y:30 }] }), [],
    "two pixels is a touch, not an overlap");
  assert.equal(overlapFindings({ overlaps:[{ kind:"region", a:"a", at:"2,800", b:"the ticker", bt:"ticker", x:30, y:12,
    box:{ x:0, y:0, w:1, h:1 }, box2:{ x:0, y:0, w:1, h:1 } }] }).length, 1, "text running into the ticker plate");
  assert.equal(overlayFindings({ overlays:[{ dock:"nav.fd-nav", where:"bottom", box:{}, count:2, covered:[{ text:"Coming up" }] }] })[0].rule,
    "overlay");
  assert.equal(MIN_TEXT.tv, 24);
  assert.equal(MIN_TEXT.phone, 12);
  const small = { text:[text({ fontPx:23.4 }), text({ id:1, fontPx:9, moving:true })], small:[{ id:0, px:23.4 }, { id:1, px:9 }] };
  assert.deepEqual(smallFindings(small, { mode:"tv" }).map(f => f.text), ["SQUILLIAM"]);
  assert.deepEqual(smallFindings(small, { mode:"phone" }), []);
  const all = findingsFor({ ...small, clips:[clip({ bottom:5 })] }, { mode:"tv", view:"tv-geo-reveal",
    exceptions:[{ view:"^tv-geo", rule:"small", reason:"a licence notice" }] });
  assert.deepEqual(failing(all).map(f => f.rule), ["clip"]);
  assert.deepEqual(summarize(all), { clip:1, excepted:1 });
  FIT_EXCEPTIONS.forEach(ex => assert.ok(ex.reason && ex.rule && ex.view, "every exception says why"));
});

/* ── the scenarios ── */
test("scenarios: real data shapes from the real reducers", () => {
  const ids = [...TV_SCENARIOS, ...PHONE_SCENARIOS].map(s => s.id);
  assert.equal(new Set(ids).size, ids.length, "unique ids");
  for (const want of ["tv-crowned-rest", "tv-bracket13-mid-nobets", "tv-team-open", "tv-draft", "tv-poker-set", "tv-awards",
    "tv-geo-reveal", "tv-walkout", "tv-faceoff", "tv-bust", "tv-blinds", "tv-nowplaying", "tv-result-ffa-900"])
    assert.ok(ids.includes(want), want);
  const team = buildScenario(TV_SCENARIOS, "tv-team-open").state;
  assert.equal(Object.keys(team.profiles).length, ROSTER.length, "thirteen players");
  assert.equal(team.profiles.Richard.display, FIT_NAMES.Richard);
  assert.equal(team.profiles.Jeremy.display, "j vo", "a lowercase two-word name");
  assert.ok(FIT_PHOTOS.every(p => team.profiles[p].photoV) && !team.profiles.Jeremy.photoV, "photos and none");
  assert.deepEqual(team.draws.bball5.teams.map(t => t.players.length).sort(), [6, 7], "5v5 is everyone, 7 a side");
  const bracket = buildScenario(TV_SCENARIOS, "tv-bracket13-mid-nobets").state;
  assert.equal(bracket.draws.bball1.teams.length, 13, "a thirteen-player bracket");
  const crowned = buildScenario(TV_SCENARIOS, "tv-crowned-rest").state;
  assert.ok(crowned.frozen && Object.keys(crowned.results).length >= 12, "every result on the champion's weekend");
  const stamp = 1.8e12;
  assert.deepEqual(aged({ a:stamp, b:[stamp, 3], c:{ d:stamp } }, 1000), { a:stamp - 1000, b:[stamp - 1000, 3], c:{ d:stamp - 1000 } });
});

test("the audit's transport stands in for every export of the real one", () => {
  const names = file => [...readFileSync(new URL(file, import.meta.url), "utf8")
    .matchAll(/export\s+(?:async\s+)?(?:function|const|let)\s+(\w+)|export\s*\{([^}]+)\}/g)]
    .flatMap(m => m[1] ? [m[1]] : m[2].split(",").map(name => name.trim().split(/\s+as\s+/).pop()));
  const real = new Set(names("../src/lib/client.js"));
  const fake = new Set(names("../dev/fit/client.js"));
  for (const name of real) assert.ok(fake.has(name), `dev/fit/client.js exports ${name}`);
});

/* ── what the TV fits by construction ── */
test("the crown keeps its beats at about twenty-three seconds, phones on the same flood", () => {
  const C = CROWN_TIMING;
  assert.ok(C.total >= 20000 && C.total <= 26000);
  assert.ok(C.towers + 12 * C.towersStagger + 520 <= C.hold + 400, "night, title and the towers stand in about 3.5s");
  const outs = Array.from({ length:13 }, (_, i) => crownOutAt(i, 13));
  for (let i = 3; i < 13; i++) assert.equal(outs[i - 1] - outs[i], C.stepStagger, "13th up to 3rd, 0.6s apart");
  assert.equal(C.stepStagger, 600);
  assert.ok(C.second - outs[2] >= 2000, "a held beat on the last two");
  assert.ok(C.second < C.rise && C.rise < C.flood && C.flood < C.chip && C.chip < C.name && C.name < C.count && C.count < C.lines);
  assert.equal(PHONE_CROWN.flood, C.flood, "every phone floods on the TV's beat");
  const css = readFileSync(new URL("../src/features/results/results.css", import.meta.url), "utf8");
  assert.ok(css.includes(`+ ${C.flood}ms)`) && css.includes(`+ ${C.rise}ms)`) && css.includes(`+ ${C.chip}ms)`));
  assert.ok(!/66000|52000|54200/.test(css), "no beat of the old minute left on the phone");
  assert.deepEqual([0, 1, 2].map(k => frozenAmbient({ now:k * 12000 + 1, period:12000 })), ["champion", "class", "trophy"],
    "the frozen TV turns: champion, class photo, the trophy with every event's winner");
});

test("the champion card: one name line where it can, medals in rows by count", () => {
  assert.equal(ui.championNameFit("Chiang").lines.length, 1);
  assert.ok(ui.championNameFit("Chiang").size >= 120, "the hero");
  const pair = ui.championNameFit("Henry Nguyen & Squilliam");
  assert.ok(pair.size <= 108 && pair.lines.length === 2);
  assert.deepEqual(ui.medalLayout(7), { rows:2, perRow:4, tile:150, named:true });
  assert.equal(ui.medalLayout(13).rows, 3);
  assert.ok(ui.medalLayout(13).tile * ui.medalLayout(13).perRow <= 1000);
});

test("the poker ring: thirteen fixed seats never touch, the sides, or the ticker", () => {
  for (const dealing of [false, true]) {
    const ring = ui.tableRing(dealing);
    const boxes = Array.from({ length:13 }, (_, i) => {
      const p = ui.seatPoint(i, 13, ring);
      return { l:p.x - ui.SEAT.w / 2, r:p.x + ui.SEAT.w / 2, t:p.y - ring.seatH / 2, b:p.y + ring.seatH / 2 };
    });
    boxes.forEach((a, i) => {
      assert.ok(a.l >= 64 && a.r <= 1856 && a.t >= 0 && a.b <= 836, `seat ${i} on the stage`);
      boxes.slice(i + 1).forEach((b, j) => assert.ok(a.r <= b.l || b.r <= a.l || a.b <= b.t || b.b <= a.t,
        `${dealing ? "dealing" : "live"}: seats ${i} and ${i + j + 1} apart`));
    });
  }
});

test("names fit their slots: towers, bracket rows and round heads", () => {
  assert.deepEqual(ui.towerNameFit("Brandon").lines, ["Brandon"], "a name as written, never uppercased");
  const long = ui.towerNameFit("Henry Nguyen");
  assert.deepEqual(long.lines, ["Henry Nguyen"], "one line, so every count stands on one baseline");
  assert.equal(long.size, 24, "at the floor, never an ellipsis");
  assert.ok(long.squeeze < 1 && long.squeeze >= 0.75, "narrowed to the slot");
  const band = ui.sideBracketDims({ units:3.5, cols:7, fit:{ width:1736, height:268 }, mirror:true, band:true });
  assert.ok(band.row >= 28 && band.nameMax >= 24 && band.nameW >= 150, "a thirteen-player band letters every name at 24px+");
  /* a round's head says what the phones say, down to the 24px floor, then
     the short word, and the initials only past that */
  assert.equal(ui.roundHead("Quarterfinals", 219), "Quarterfinals", "a thirteen-player band's column letters it whole");
  assert.deepEqual(ui.roundHeadFit("Quarterfinals", 219), { text:"Quarterfinals", size:26 });
  assert.equal(ui.roundHead("Quarterfinals", 560), "Quarterfinals");
  assert.equal(ui.roundHead("Quarterfinals", 140), "Quarters");
  assert.equal(ui.roundHead("Quarterfinals", 80), "QF");
  assert.equal(ui.matchTitle("Semifinals · Match 2"), "Semifinal 2");
  assert.equal(ui.matchTitle("Round 1 · Match 3"), "Round 1 Match 3");
  assert.equal(ui.BIG_BRACKET, 7);
  assert.equal(ui.trophyPlateFit(440, "FIELD DAY", 30, 24).font, 27, "the champion's trophy letters its plate");
  assert.equal(ui.trophyPlateFit(200, "FIELD DAY", 24, 24).font, 0, "a small cup on the TV leaves it blank, never under 24px");
});

test("the payout ladder: places that pay, chips scaled to the tallest", () => {
  assert.deepEqual(ui.payoutSteps([400, 200, 100]).map(s => s.place), [1, 2, 3]);
  assert.deepEqual(ui.payoutSteps([800, 0, 0]).map(s => s.amount), [800], "a single-winner event shows the winner's medallion alone");
  assert.equal(ui.payoutSteps([400, 200, 100], { crew:100 }).at(-1).crew, true);
  assert.equal(ui.ladderChips(400, 400, 10), 4, "one chip per 100");
  assert.equal(ui.ladderChips(1600, 1600, 10), 8, "the tallest keeps to its cap");
  assert.equal(ui.ladderChips(400, 1600, 10), 2);
});
