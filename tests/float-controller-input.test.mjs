/* The phone's paddles, pure (float/client/controller): strokes from
   touches, the outbound stroke gate, the thumbs on the paddles with their
   lift grace, and the sideways frame's geometry. */
import test from "node:test";
import assert from "node:assert/strict";
import { STROKE, createStrokeGate, createStrokes, strokePower } from "../float/client/controller/strokes.js";
import { HANDS_GRACE_MS, createHands } from "../float/client/controller/hands.js";
import { frameBox, frameTurn, insetEdges, insetVars, saveTurn, savedTurn, toContent, toViewport }
  from "../float/client/controller/turn.js";
import { stampOf } from "../float/client/controller/usePaddleInput.js";

/* a thumb moving through points [y, t] (x fixed), lifting at the end unless hold */
function drive(strokes, id, side, points, { x = 100, hold = false } = {}) {
  const fired = [];
  const [[y0, t0], ...rest] = points;
  strokes.down(id, side, x, y0, t0);
  for (const [y, t] of rest.slice(0, hold ? rest.length : -1)) { const s = strokes.move(id, x, y, t); if (s) fired.push(s); }
  if (!hold) { const [y, t] = rest[rest.length - 1] || [y0, t0]; const s = strokes.up(id, x, y, t); if (s) fired.push(s); }
  return fired;
}
const pullPoints = (y0, px, ms, t0 = 0, steps = 6) => [[y0, t0], ...Array.from({ length:steps }, (_, k) => [y0 + px * (k + 1) / steps, t0 + ms * (k + 1) / steps])];

test("a downward pull is one stroke when the thumb lifts, on the side it landed", () => {
  const strokes = createStrokes();
  const fired = drive(strokes, 1, "L", pullPoints(100, 90, 100));
  assert.equal(fired.length, 1);
  assert.equal(fired[0].side, "L");
  assert.equal(fired[0].kind, "lift");
  assert.ok(fired[0].p > STROKE.TAP_P && fired[0].p <= 1, `power ${fired[0].p}`);
  assert.equal(drive(strokes, 2, "R", pullPoints(100, 90, 100, 1000))[0].side, "R");
});

test("power grows with speed and length, between a tap's and full", () => {
  assert.ok(strokePower(120, 80) > strokePower(120, 300), "faster is stronger");
  assert.ok(strokePower(120, 100) > strokePower(40, 100 / 3), "longer is stronger at the same speed");
  assert.equal(strokePower(400, 100), 1);
  assert.equal(strokePower(15, 400), STROKE.TAP_P, "never under a tap");
  for (const [px, ms] of [[14, 10], [60, 60], [90, 120], [200, 500]]) {
    const p = strokePower(px, ms);
    assert.ok(p >= STROKE.TAP_P && p <= 1, `${px}px in ${ms}ms: ${p}`);
  }
});

test("a tap is a light stroke; a press that rests, an upward or a sideways swipe is not a stroke", () => {
  const strokes = createStrokes();
  const tap = drive(strokes, 1, "R", [[200, 0], [202, 60], [202, 90]]);
  assert.deepEqual(tap.map(s => [s.kind, s.p]), [["tap", STROKE.TAP_P]]);
  assert.deepEqual(drive(strokes, 2, "R", [[200, 1000], [201, 1300], [201, 1600]]), [], "a resting thumb");
  assert.deepEqual(drive(strokes, 3, "L", pullPoints(300, -90, 100, 2000)), [], "upward");
  strokes.down(4, "L", 100, 200, 3000);
  for (let k = 1; k <= 6; k++) strokes.move(4, 100 + k * 20, 200, 3000 + k * 16);
  assert.equal(strokes.up(4, 220, 200, 3110), null, "sideways");
});

test("scrubbing down and up without lifting strokes every pull", () => {
  const strokes = createStrokes();
  const fired = [];
  strokes.down(1, "L", 100, 100, 0);
  let t = 0;
  for (let rep = 0; rep < 3; rep++) {
    for (let k = 1; k <= 5; k++) { t += 16; const s = strokes.move(1, 100, 100 + k * 16, t); if (s) fired.push(s); }
    for (let k = 1; k <= 5; k++) { t += 16; const s = strokes.move(1, 100, 180 - k * 16, t); if (s) fired.push(s); }
  }
  assert.equal(fired.length, 3);
  assert.ok(fired.every(s => s.kind === "reverse" && s.side === "L"));
});

test("a pull that stops going down fires after the stall, and the thumb can pull again from there", () => {
  const strokes = createStrokes();
  strokes.down(1, "R", 100, 100, 0);
  for (let k = 1; k <= 5; k++) strokes.move(1, 100, 100 + k * 16, k * 16);
  assert.equal(strokes.stallAt(), 80 + STROKE.STALL_MS);
  assert.deepEqual(strokes.tick(80 + STROKE.STALL_MS - 1), [], "not yet");
  const stalled = strokes.tick(80 + STROKE.STALL_MS);
  assert.equal(stalled.length, 1);
  assert.equal(stalled[0].kind, "stall");
  assert.equal(strokes.stallAt(), null);
  /* the same thumb carries on down: a new pull */
  let again = null;
  for (let k = 1; k <= 5; k++) again = strokes.move(1, 100, 180 + k * 16, 400 + k * 16) || again;
  assert.equal(strokes.up(1, 100, 260, 500)?.kind, "lift");
});

test("a resting thumb that jitters never blocks the swipe that follows it", () => {
  const strokes = createStrokes();
  strokes.down(1, "L", 100, 200, 0);
  strokes.move(1, 100, 203, 40);
  strokes.move(1, 101, 204, 60);
  assert.deepEqual(strokes.tick(60 + STROKE.STALL_MS), [], "a 4 px wobble is not a stroke");
  strokes.move(1, 100, 202, 900);
  let fired = null;
  for (let k = 1; k <= 5; k++) fired = strokes.move(1, 100, 202 + k * 18, 900 + k * 16) || fired;
  const lift = strokes.up(1, 100, 292, 990);
  assert.equal((fired || lift)?.side, "L", "the swipe strokes");
});

test("a slow drift or a long crawl is not a stroke", () => {
  const strokes = createStrokes();
  assert.deepEqual(drive(strokes, 1, "L", pullPoints(100, 30, 600, 0, 12)), [], "30 px in 600 ms");
  assert.deepEqual(drive(strokes, 2, "L", pullPoints(100, 200, 1200, 2000, 30)), [], "longer than MAX_PULL_MS");
});

test("one side never fires twice within the floor; the other side is free", () => {
  const strokes = createStrokes();
  const a = drive(strokes, 1, "L", pullPoints(100, 80, 80, 0));
  const b = drive(strokes, 2, "L", pullPoints(100, 80, 80, 20));
  const c = drive(strokes, 3, "R", pullPoints(100, 80, 80, 25));
  assert.equal(a.length + b.length, 1, "two fingers on the left, one stroke");
  assert.equal(c.length, 1);
});

test("pullOf follows the pull below where it began, and is 0 between pulls", () => {
  const strokes = createStrokes();
  strokes.down(1, "R", 100, 100, 0);
  assert.equal(strokes.pullOf(1), 0);
  strokes.move(1, 100, 110, 16);
  strokes.move(1, 100, 140, 32);
  assert.equal(strokes.pullOf(1), 40);
  strokes.move(1, 100, 125, 48);
  assert.equal(strokes.pullOf(1), 0, "the reversal ended the pull");
  assert.equal(strokes.pullOf(99), 0);
});

test("cancel ends a touch without a stroke; sides lists the thumbs down", () => {
  const strokes = createStrokes();
  strokes.down(1, "L", 0, 0, 0);
  strokes.down(2, "R", 0, 0, 0);
  assert.deepEqual([...strokes.sides()].sort(), ["L", "R"]);
  strokes.move(1, 0, 60, 30);
  strokes.cancel(1);
  assert.equal(strokes.up(1, 0, 90, 60), null);
  assert.deepEqual([...strokes.sides()], ["R"]);
});

test("the stroke gate lets 8 out in any second, then the next as the window moves", () => {
  const gate = createStrokeGate();
  const out = Array.from({ length:12 }, (_, k) => gate.allow(k * 50));
  assert.equal(out.filter(Boolean).length, 8);
  assert.equal(gate.allow(999), false);
  assert.equal(gate.allow(1000), true, "the first has left the window");
});

test("hands: a thumb landing counts at once, a lift only after the grace", () => {
  const hands = createHands();
  assert.equal(hands.report(0), null, "nothing down, nothing to say");
  hands.down(1, "L", 0);
  assert.equal(hands.report(0), 1);
  hands.down(2, "R", 10);
  assert.equal(hands.report(10), 2);
  hands.up(1, 100);
  assert.equal(hands.report(100), null, "still 2 inside the grace");
  assert.equal(hands.nextAt(100), 100 + HANDS_GRACE_MS);
  assert.equal(hands.report(100 + HANDS_GRACE_MS - 1), null);
  assert.equal(hands.report(100 + HANDS_GRACE_MS), 1);
  assert.equal(hands.nextAt(100 + HANDS_GRACE_MS), null);
});

test("hands: alternate paddling (each thumb up 350 ms between its strokes) never drops to 1", () => {
  const hands = createHands();
  let id = 1;
  const on = { L:id++, R:id++ };
  hands.down(on.L, "L", 0); hands.down(on.R, "R", 0);
  assert.equal(hands.report(0), 2);
  const said = [];
  let t = 100;
  for (let k = 0; k < 12; k++) {
    const side = k % 2 ? "R" : "L";
    hands.up(on[side], t);
    said.push(hands.report(t));
    t += 350;
    on[side] = id++;
    hands.down(on[side], side, t);
    said.push(hands.report(t));
    t += 40;
  }
  assert.deepEqual(said.filter(n => n !== null), []);
  /* and one thumb that stays off (a drink in hand) drops to 1 once the grace runs out */
  hands.up(on.L, t);
  assert.equal(hands.report(t + HANDS_GRACE_MS), 1);
});

test("hands: two thumbs on one side count once; a lift of one keeps it held; clear drops at once", () => {
  const hands = createHands();
  hands.down(1, "L", 0); hands.down(2, "L", 0);
  assert.equal(hands.report(0), 1);
  hands.up(1, 50);
  assert.equal(hands.nextAt(50), null, "the other thumb holds the side");
  assert.equal(hands.up(42, 60), null, "an unknown touch");
  hands.down(3, "R", 70);
  assert.equal(hands.report(70), 2);
  hands.clear();
  assert.equal(hands.report(71), 0);
  assert.equal(hands.touching("L"), false);
});

test("an event's own time stamp times the pull; a stale or epoch one falls back to the clock", () => {
  assert.equal(stampOf({ timeStamp:900 }, 1000), 900);
  assert.equal(stampOf({ timeStamp:1700000000000 }, 1000), 1000);
  assert.equal(stampOf({}, 1000), 1000);
  assert.equal(stampOf({ timeStamp:1200 }, 1000), 1000, "never ahead of the clock");
});

test("turn: sideways screens in a portrait viewport turn a quarter; the rest never do", () => {
  assert.equal(frameTurn({ w:390, h:844 }, true), 90);
  assert.equal(frameTurn({ w:390, h:844 }, true, -90), -90);
  assert.equal(frameTurn({ w:844, h:390 }, true), 0);
  assert.equal(frameTurn({ w:390, h:844 }, false), 0);
  const box = frameBox({ w:390, h:844 }, 90);
  assert.deepEqual([box.cw, box.ch, box.left, box.top, box.transform], [844, 390, -227, 227, "rotate(90deg)"]);
  assert.deepEqual(frameBox({ w:844, h:390 }, 0), { cw:844, ch:390, left:0, top:0, transform:"none" });
});

test("turn: a content point and its viewport point round-trip for every turn", () => {
  const vp = { w:390, h:844 };
  for (const turn of [0, 90, -90]) {
    for (const [cx, cy] of [[0, 0], [100, 50], [843, 389], [422, 195]]) {
      const v = toViewport(cx, cy, vp, turn);
      const c = toContent(v.x, v.y, vp, turn);
      assert.deepEqual([c.x, c.y], [cx, cy], `turn ${turn}`);
    }
  }
  /* held with the top to the left (90): the player's down is the viewport's left */
  const a = toViewport(100, 100, vp, 90), b = toViewport(100, 200, vp, 90);
  assert.ok(b.x < a.x && b.y === a.y);
});

test("turn: content edges take the safe area of the viewport edge they sit on", () => {
  assert.deepEqual(insetEdges(90), { top:"right", right:"bottom", bottom:"left", left:"top" });
  assert.deepEqual(insetEdges(-90), { top:"left", right:"top", bottom:"right", left:"bottom" });
  assert.equal(insetVars(0)["--sa-bottom"], "env(safe-area-inset-bottom, 0px)");
  assert.equal(insetVars(90)["--sa-right"], "env(safe-area-inset-bottom, 0px)");
});

test("turn: the flip is kept on the phone", () => {
  const memory = new Map();
  const store = { getItem:k => memory.get(k) ?? null, setItem:(k, v) => memory.set(k, String(v)) };
  assert.equal(savedTurn(store), 90);
  saveTurn(-90, store);
  assert.equal(savedTurn(store), -90);
  assert.equal(savedTurn({ getItem() { throw new Error("blocked"); } }), 90);
});
