/* The October beauty pass: the TV podium as a stage (stepped plinths, the
   backers on their own rail), and the fixes that rode along with it. Pure
   models only; the fit audit (npm run audit:fit) renders every shape. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  PODIUM_STAGE, BACKERS_RAIL, podiumStage, standFit, backersRail, podiumBackersAt, podiumBeatAt, stepAmount,
  podiumTitleFit, TV_WIDTH,
} from "../src/features/tv/tvModel.js";
import { podiumCues } from "../src/features/tv/roomSound.js";

const entry = (place, groups, amount = 400, unit = "award") => ({
  place, amount, unit, groups, players:groups.flatMap(group => group.players),
  names:groups.length <= 3 ? groups.map(group => group.name) : [`${groups.length} tied`], tied:groups.length > 1,
});
const solo = name => ({ players:[name], name });
const team = (name, n) => ({ players:Array.from({ length:n }, (_, i) => `${name}${i}`), name });

/* every block stands inside its step: faces inside the inner width, faces
   and the name's lines inside the room above the lid */
function assertStands(step) {
  const S = PODIUM_STAGE;
  const used = step.blocks.reduce((sum, block) => sum + block.rows * block.face + (block.rows - 1) * S.gap + S.gap + block.nameH, 0)
    + Math.max(0, step.blocks.length - 1) * S.gap;
  assert.ok(used <= step.room + 1, `place ${step.place}: ${used}px of people in ${step.room}px`);
  for (const block of step.blocks) {
    assert.ok(block.cols * block.face + (block.cols - 1) * S.gap <= step.inner + 1, `place ${step.place}: a row wider than its step`);
    assert.equal(block.cols * block.rows >= block.players.length, true, "every face has a seat");
    assert.ok(block.nameSize >= 28, "names stay large on the TV");
  }
}

test("podium: three joined steps, 2nd 1st 3rd, 1st tallest and centred on the canvas", () => {
  const stage = podiumStage([entry(1, [solo("Evan")]), entry(2, [solo("Adi")], 200), entry(3, [solo("Khoa")], 100)]);
  assert.deepEqual(stage.steps.map(step => step.place), [2, 1, 3]);
  const [second, first, third] = stage.steps;
  assert.ok(first.height > second.height && second.height > third.height, "the steps descend by place");
  assert.equal(second.left + second.width, first.left, "joined: no gap between the steps");
  assert.equal(first.left + first.width, third.left);
  assert.equal(second.left, TV_WIDTH - (third.left + third.width), "centred on the canvas");
  assert.ok(second.left >= 64, "inside the safe sides");
  stage.steps.forEach(step => assert.equal(step.top + step.height, PODIUM_STAGE.floor, "every step stands on the floor"));
  assert.equal(first.blocks[0].face, PODIUM_STAGE.face[1][0], "a lone winner stands at full size");
  stage.steps.forEach(assertStands);
});

test("podium: a pair, a team of three, the 5v5's seven, split places and a counted tie all stand by construction", () => {
  const shapes = [
    [entry(1, [team("Pair", 2)]), entry(2, [team("Two", 2)]), entry(3, [team("A", 2), team("B", 2)])],
    [entry(1, [team("Rattlers", 3)]), entry(2, [team("Vultures", 3)]), entry(3, [team("Bobcats", 3)])],
    [entry(1, [team("Sidewinders", 7)], 800), entry(2, [team("Bobcats", 6)], 0)],
    [entry(1, [solo("Squilliam")]), entry(2, [solo("Eyob"), solo("Chinh")], 200),
      entry(3, [solo("A"), solo("B"), solo("C"), solo("D")], 100)],
    [entry(1, [team("Henry Nguyen & Squilliam", 2)]), entry(2, [solo("Brandon"), solo("Sahil"), solo("Ben")])],
  ];
  for (const podium of shapes) podiumStage(podium).steps.forEach(step => { if (step.entry) assertStands(step); });
  const seven = podiumStage(shapes[2]).steps.find(step => step.place === 1).blocks[0];
  assert.equal(seven.rows, 2, "seven stand in two rows");
  assert.equal(seven.cols, 4, "four and three");
  const wide = podiumStage(shapes[3]).steps.find(step => step.place === 3);
  assert.equal(wide.blocks.length, 1, "a tie of four is one counted group");
  assert.equal(wide.blocks[0].name, "4 tied");
  const split = podiumStage(shapes[3]).steps.find(step => step.place === 2);
  assert.equal(split.blocks.length, 2, "a tie of two stands as two named groups");
  /* a place nobody took has no step: two places stand two steps, centred */
  const two = podiumStage(shapes[2]).steps;
  assert.deepEqual(two.map(step => step.place), [2, 1], "no empty 3rd plinth");
  assert.equal(two[0].left, TV_WIDTH - (two[1].left + two[1].width), "the two steps centre on the canvas");
});

test("podium: standFit keeps one row while it is about as large, else balanced rows", () => {
  assert.deepEqual(standFit(1, 556, 280, { cap:168 }), { size:168, cols:1, rows:1 });
  assert.equal(standFit(2, 556, 280, { cap:128 }).rows, 1);
  assert.equal(standFit(7, 556, 280, { cap:104 }).rows, 2);
  assert.ok(standFit(13, 416, 300, { cap:88, min:40 }).size >= 40);
});

test("podium: a step's face reads its award, a team's each, a poker stack as it stands", () => {
  assert.deepEqual(stepAmount(entry(1, [solo("Evan")])), { text:"+400", each:false });
  assert.deepEqual(stepAmount(entry(1, [team("T", 3)], 1600)), { text:"+1,600", each:true });
  assert.deepEqual(stepAmount(entry(1, [solo("Evan")], 12300, "stack")), { text:"12,300", each:false });
  assert.equal(stepAmount(entry(2, [team("T", 6)], 0)), null, "a place that pays nothing says nothing");
  assert.ok(podiumTitleFit("Where and When").size <= PODIUM_STAGE.title.max);
  assert.ok(podiumTitleFit("A Very Long Custom Event Name For The Weekend").size >= 24);
});

test("backers rail: named while it fits, faces past that, +N past what fits; biggest payout first", () => {
  const winners = n => ({ winners:Array.from({ length:n }, (_, i) => ({ player:`P${i}`, stake:100 * (i + 1), paid:100 * (i + 1) })) });
  assert.equal(backersRail({ winners:[] }), null);
  assert.equal(backersRail(null), null);
  const four = backersRail(winners(4));
  assert.equal(four.named, true);
  assert.equal(four.paid, 1000);
  assert.deepEqual(four.cells.map(cell => cell.player), ["P3", "P2", "P1", "P0"]);
  const R = BACKERS_RAIL, room = R.width - 2 * R.pad - R.tag - R.total;
  for (let n = 1; n <= 13; n++) {
    const rail = backersRail(winners(n));
    const cell = rail.named ? R.named : R.bare;
    const width = rail.cells.length * cell + (rail.cells.length - 1) * R.gap + (rail.more ? R.gap + R.more : 0);
    assert.ok(width <= room, `${n} backers: ${width} of ${room}`);
    assert.equal(rail.cells.length + rail.more, n, "nobody dropped: the rest are counted");
  }
  assert.equal(backersRail(winners(12)).more > 0, true);
});

test("backers rail: lands just after the last place turns, and the room hears it pay then", () => {
  assert.equal(podiumBackersAt(3), podiumBeatAt(2) + BACKERS_RAIL.afterMs);
  assert.equal(podiumBackersAt(1), podiumBeatAt(0) + BACKERS_RAIL.afterMs);
  const cues = podiumCues({ at:1000, places:3, paid:true }, "k");
  const paid = cues.find(cue => cue.id === "S12");
  assert.equal(paid?.at, 1000 + podiumBackersAt(3));
  assert.equal(podiumCues({ at:1000, places:3, paid:false }, "k").some(cue => cue.id === "S12"), false);
});

test("podium: liquid glass from the tokens only, transforms and opacity, a reduced-motion end state", () => {
  const css = readFileSync(new URL("../src/features/tv/tv-podium.css", import.meta.url), "utf8");
  assert.ok(!/#[0-9a-f]{3,6}\b(?![^{]*mask)/i.test(css.replace(/mask-image:[^;]*;/g, "")), "no raw hex outside masks");
  assert.ok(!/rgba?\(/.test(css), "no raw rgba: the --lg-* tokens");
  assert.ok(/var\(--lg-bands\)/.test(css) && /var\(--lg-lip\)/.test(css), "the steps are liquid glass");
  for (const [, body] of css.matchAll(/@keyframes [\w-]+ \{([\s\S]*?)\}\s*\}/g))
    assert.ok(!/(width|height|top|left|box-shadow|filter)\s*:/.test(body.replace(/text-shadow:[^;]*;/g, "")),
      `keyframes animate transform, opacity and color only: ${body.slice(0, 60)}`);
  assert.match(css, /prefers-reduced-motion: reduce\)[\s\S]*\.tv-step-who/);
  const tokens = readFileSync(new URL("../src/ui/experience.css", import.meta.url), "utf8");
  for (const name of ["--lg-lip", "--lg-fringe", "--lg-fall", "--lg-bands", "--lg-caustic", "--lg-sweep"])
    assert.ok(tokens.includes(`${name}:`), `${name} lives in :root`);
});

/* the last card's session axis: a session ticks once, labels never touch */
import { chartModel, SESSION_TICKS } from "../src/features/results/lastCard.js";
test("last card axis: a session ticks only when the weekend first reaches it, spaced by its label's width", () => {
  const steps = ["fri", "fri", "sam", "fri", "sap", "sap", "san", "fin"].map((session, i) => ({ pts:1000 + i * 100, session }));
  const chart = chartModel(steps, { width:330, height:128 });
  const labels = chart.ticks.map(tick => tick.label);
  assert.equal(labels.filter(label => label === "FRI").length, 1, "a step back to Friday never ticks it again");
  assert.equal(new Set(labels).size, labels.length);
  assert.equal(labels[labels.length - 1], SESSION_TICKS.fin, "the finish keeps its tick");
  const extent = tick => {
    const w = tick.label.length * 7.8;
    return tick.anchor === "start" ? [tick.x, tick.x + w] : tick.anchor === "end" ? [tick.x - w, tick.x] : [tick.x - w / 2, tick.x + w / 2];
  };
  for (let i = 1; i < chart.ticks.length; i++)
    assert.ok(extent(chart.ticks[i])[0] >= extent(chart.ticks[i - 1])[1] + 6, `${labels[i - 1]} and ${labels[i]} touch`);
  chart.ticks.forEach(tick => assert.ok(extent(tick)[1] <= 330 && extent(tick)[0] >= 0, `${tick.label} stays on the card`));
});
