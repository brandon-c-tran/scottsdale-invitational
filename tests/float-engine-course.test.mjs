/* Float's river (float/shared/course.js): the four legs in the contract's
   format, and the helpers everything samples it through. */
import test from "node:test";
import assert from "node:assert/strict";
import { COURSE, COURSE_ID, courseLength, frameAt, nearestS, flowAt, flowSpeed, elevAt, zonesAt, isInside,
  islandSpan, rocksNear, gridSlots, beachSlot, barOf, legLength, legAt, widthAt } from "../float/shared/course.js";
import { racingLine } from "../float/shared/bots.js";
import { RADIUS } from "../float/shared/tuning.js";

const ZONE_KINDS = ["pool", "riffle", "narrows", "eddy", "whirlpool", "split", "drop", "bar"];
const total = courseLength(COURSE);

test("the course is the contract's shape: id, line, flow, elev, rocks, islands, zones, legs", () => {
  assert.equal(COURSE.id, COURSE_ID);
  for (const key of ["line", "flow", "elev", "rocks", "islands", "zones", "legs"]) assert.ok(Array.isArray(COURSE[key]), key);
  for (const point of COURSE.line) assert.equal(point.length, 3);
  for (const rock of COURSE.rocks) assert.equal(rock.length, 3);
  for (const island of COURSE.islands) assert.equal(island.length, 3);
  for (const zone of COURSE.zones) {
    assert.ok(ZONE_KINDS.includes(zone.k), zone.k);
    assert.ok(zone.s0 < zone.s1 && zone.s0 >= 0 && zone.s1 <= total + 1, `${zone.k} ${zone.s0}`);
  }
  /* points every ~4 m */
  for (let k = 1; k < COURSE.line.length; k += 1) {
    const [x0, y0] = COURSE.line[k - 1], [x1, y1] = COURSE.line[k];
    const step = Math.hypot(x1 - x0, y1 - y0);
    assert.ok(step > 3.5 && step < 4.3, `step ${k}: ${step}`);
  }
  /* it survives the wire: a JSON copy samples the same */
  const copy = JSON.parse(JSON.stringify(COURSE));
  for (const s of [10, 333, 777, 1001, 1442]) {
    assert.deepEqual(frameAt(copy, s), frameAt(COURSE, s));
    const f = frameAt(COURSE, s);
    assert.deepEqual(flowAt(copy, f.x, f.y), flowAt(COURSE, f.x, f.y));
  }
});

test("four legs, in order, contiguous, each 300 to 450 m from the start line to the finish", () => {
  assert.deepEqual(COURSE.legs.map(leg => leg.name), ["Put-in", "The Narrows", "Whirlpool Bend", "The Drop"]);
  assert.equal(COURSE.legs[0].s0, 0);
  for (let k = 0; k < COURSE.legs.length; k += 1) {
    const leg = COURSE.legs[k];
    if (k) assert.equal(leg.s0, COURSE.legs[k - 1].s1, "contiguous");
    assert.ok(leg.s0 < leg.grid && leg.grid < leg.finish && leg.finish < leg.s1, leg.id);
    const len = legLength(COURSE, k);
    assert.ok(len >= 300 && len <= 450, `${leg.name}: ${len} m`);
    /* every leg ends at a takeout bar past its finish */
    const bar = barOf(COURSE, k);
    assert.ok(bar && bar.s0 <= leg.finish && bar.s1 >= leg.finish, `${leg.name} bar`);
  }
  assert.ok(Math.abs(COURSE.legs.at(-1).s1 - total) < 2);
});

test("widths fit a 13-rider grid at the start and narrow to fair canyons", () => {
  const widths = COURSE.line.map(point => point[2]);
  assert.ok(Math.min(...widths) >= 9, `narrowest ${Math.min(...widths)}`);
  assert.ok(Math.max(...widths) <= 40);
  /* The Narrows really narrows */
  const narrows = COURSE.zones.filter(zone => zone.k === "narrows");
  assert.ok(narrows.length >= 2);
  for (const zone of narrows) assert.ok(widthAt(COURSE, (zone.s0 + zone.s1) / 2) <= 12);
  for (let leg = 0; leg < COURSE.legs.length; leg += 1) {
    for (const n of [13, 16]) {
      const slots = gridSlots(COURSE, leg, n);
      assert.equal(slots.length, n);
      assert.ok(slots.slice(0, 5).every(slot => slot.s === slots[0].s) || slots[0].s >= slots.at(-1).s);
      for (const slot of slots) {
        assert.ok(isInside(COURSE, slot.x, slot.y, slot.s), `leg ${leg} slot inside`);
        const near = nearestS(COURSE, slot.x, slot.y, slot.s);
        assert.ok(Math.abs(near.d) <= near.w / 2 - RADIUS, "clear of the banks");
        assert.ok(slot.s >= legAt(COURSE, leg).s0 + 2, "on its own leg");
      }
      for (let a = 0; a < slots.length; a += 1)
        for (let b = a + 1; b < slots.length; b += 1)
          assert.ok(Math.hypot(slots[a].x - slots[b].x, slots[a].y - slots[b].y) >= 2 * RADIUS + 0.4, `slots ${a} ${b}`);
    }
    /* rows of 4 or 5 at the Put-in: the pole row is full */
    if (leg === 0) assert.equal(gridSlots(COURSE, 0, 13).filter(slot => slot.s === gridSlots(COURSE, 0, 13)[0].s).length, 5);
  }
});

test("the river never comes back on itself, and bends stay gentler than its width", () => {
  const line = COURSE.line;
  for (let i = 0; i < line.length; i += 1)
    for (let j = i + 25; j < line.length; j += 1) {
      const gap = Math.hypot(line[i][0] - line[j][0], line[i][1] - line[j][1]) - (line[i][2] + line[j][2]) / 2;
      assert.ok(gap > 10, `land between s ${i * 4} and ${j * 4}: ${gap.toFixed(1)}`);
    }
  for (let i = 1; i < line.length - 1; i += 1) {
    const a1 = Math.atan2(line[i][1] - line[i - 1][1], line[i][0] - line[i - 1][0]);
    const a2 = Math.atan2(line[i + 1][1] - line[i][1], line[i + 1][0] - line[i][0]);
    let turn = a2 - a1;
    while (turn > Math.PI) turn -= 2 * Math.PI;
    while (turn < -Math.PI) turn += 2 * Math.PI;
    assert.ok(Math.abs(turn) / 4 * line[i][2] / 2 < 0.6, `bend at s ${i * 4}`);
  }
});

test("rocks sit inside the river, off the island, and always leave a way through", () => {
  for (const [x, y, r] of COURSE.rocks) {
    const near = nearestS(COURSE, x, y);
    assert.ok(Math.abs(near.d) + r < near.w / 2, `rock at s ${near.s.toFixed(0)}`);
    for (const [ix, iy, ir] of COURSE.islands) assert.ok(Math.hypot(x - ix, y - iy) > ir + r + 1.5, "clear of the island");
    /* the widest open gap across the river at the rock */
    const blocks = rocksNear(COURSE, near.s, 1.2).map(rock => [rock.d - rock.r, rock.d + rock.r]);
    const span = islandSpan(COURSE, near.s);
    if (span) blocks.push(span);
    blocks.sort((a, b) => a[0] - b[0]);
    let at = -near.w / 2, widest = 0;
    for (const [lo, hi] of blocks) { widest = Math.max(widest, lo - at); at = Math.max(at, hi); }
    widest = Math.max(widest, near.w / 2 - at);
    assert.ok(widest >= 3, `passage at s ${near.s.toFixed(0)}: ${widest.toFixed(2)} m`);
  }
});

test("Whirlpool Bend splits round an island: the left channel is shorter, faster and rocky, the right calm", () => {
  const split = COURSE.zones.find(zone => zone.k === "split");
  assert.ok(split);
  const mid = (split.s0 + split.s1) / 2;
  const span = islandSpan(COURSE, mid);
  assert.ok(span, "the island is in the split");
  const half = widthAt(COURSE, mid) / 2;
  assert.ok(half - span[1] >= 6 && span[0] + half >= 6, "both channels at least 6 m wide");
  assert.ok(half - span[1] < span[0] + half, "the left channel is the narrower");
  const f = frameAt(COURSE, mid);
  const left = flowAt(COURSE, f.x + f.nx * (span[1] + half) / 2, f.y + f.ny * (span[1] + half) / 2);
  const right = flowAt(COURSE, f.x + f.nx * (span[0] - half) / 2, f.y + f.ny * (span[0] - half) / 2);
  assert.ok(Math.hypot(left.ux, left.uy) > 1.6 * Math.hypot(right.ux, right.uy), "left fast, right calm");
  const rocksLeft = COURSE.rocks.filter(([x, y]) => { const near = nearestS(COURSE, x, y); return near.s > split.s0 && near.s < split.s1 && near.d > 0; });
  const rocksRight = COURSE.rocks.filter(([x, y]) => { const near = nearestS(COURSE, x, y); return near.s > split.s0 && near.s < split.s1 && near.d < 0; });
  assert.ok(rocksLeft.length >= 4 && rocksRight.length === 0);
  /* the racing lines through each channel: left is the shorter way */
  const length = variant => {
    let sum = 0, prev = null;
    for (const [s, d] of racingLine(COURSE, variant)) {
      if (s < split.s0 || s > split.s1) continue;
      const g = frameAt(COURSE, s);
      const p = [g.x + g.nx * d, g.y + g.ny * d];
      if (prev) sum += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
      prev = p;
    }
    return sum;
  };
  assert.ok(length("left") < length("right") - 8, `left ${length("left").toFixed(0)} right ${length("right").toFixed(0)}`);
});

test("the current: faster mid-river than at the banks, slow in pools, fastest over the Drop; water only falls", () => {
  for (const s of [100, 500, 700, 1300]) {
    const f = frameAt(COURSE, s);
    const mid = flowAt(COURSE, f.x, f.y, { hint:s });
    const edge = flowAt(COURSE, f.x + f.nx * (f.w / 2 - 0.5), f.y + f.ny * (f.w / 2 - 0.5), { hint:s });
    assert.ok(Math.hypot(mid.ux, mid.uy) > Math.hypot(edge.ux, edge.uy) * 1.5, `s ${s}`);
    /* downstream: along the tangent */
    assert.ok(mid.ux * f.tx + mid.uy * f.ty > 0.9 * Math.hypot(mid.ux, mid.uy));
  }
  const drop = COURSE.zones.find(zone => zone.k === "drop");
  const fastest = Math.max(...COURSE.flow.map(([, v]) => v));
  assert.equal(flowSpeed(COURSE, (drop.s0 + drop.s1) / 2) >= fastest - 0.6, true);
  for (const zone of COURSE.zones.filter(item => item.k === "pool" && item.s0 > 0))
    assert.ok(flowSpeed(COURSE, (zone.s0 + zone.s1) / 2) <= 1.6, `pool at ${zone.s0}`);
  for (let s = 1; s <= total; s += 1) assert.ok(elevAt(COURSE, s) <= elevAt(COURSE, s - 1) + 1e-9, `elev at ${s}`);
  const fall = elevAt(COURSE, drop.s0) - elevAt(COURSE, drop.s1);
  assert.ok(fall >= 3 && fall <= 4, `the Drop falls ${fall} m`);
  /* every leg has calm water to drink in */
  for (const leg of COURSE.legs) {
    const calm = COURSE.zones.filter(zone => ["pool", "eddy"].includes(zone.k) && zone.s0 > leg.grid + 20 && zone.s1 < leg.finish + 1);
    assert.ok(calm.length >= 1, `${leg.name} has calm water past the start`);
  }
});

test("the whirlpool spins on the inside of its bend and the eddy runs back upstream", () => {
  const pool = COURSE.zones.find(zone => zone.k === "whirlpool");
  assert.ok(Number.isFinite(pool.x) && Number.isFinite(pool.y) && pool.r > pool.core);
  const at = nearestS(COURSE, pool.x, pool.y);
  assert.ok(at.d > 2, "on the inside (left) of the left-hand bend");
  /* counter-clockwise: east of the centre the water runs north */
  const east = flowAt(COURSE, pool.x + pool.core * 1.5, pool.y);
  const west = flowAt(COURSE, pool.x - pool.core * 1.5, pool.y);
  assert.ok(east.uy - west.uy > 1, "it turns");
  assert.ok(flowAt(COURSE, pool.x + 0.3, pool.y).curl > 0, "the core spins counter-clockwise");
  const eddy = COURSE.zones.find(zone => zone.k === "eddy");
  const f = frameAt(COURSE, (eddy.s0 + eddy.s1) / 2);
  const d = eddy.side * (f.w / 2 - 0.8);
  const water = flowAt(COURSE, f.x + f.nx * d, f.y + f.ny * d);
  assert.ok(water.ux * f.tx + water.uy * f.ty < 0, "back upstream along the eddy's bank");
});

test("nearestS finds a point's distance and side; isInside knows the banks and the island", () => {
  for (const s of [5, 123.4, 400, 650.5, 999, 1205, 1500]) {
    const f = frameAt(COURSE, s);
    for (const d of [-0.4, 0.3].map(k => k * f.w)) {
      const near = nearestS(COURSE, f.x + f.nx * d, f.y + f.ny * d);
      assert.ok(Math.abs(near.s - s) < 0.6, `s ${s} d ${d}: ${near.s}`);
      assert.ok(Math.abs(near.d - d) < 0.3, `s ${s} d ${d}: ${near.d}`);
      assert.equal(isInside(COURSE, f.x + f.nx * d, f.y + f.ny * d), !islandSpan(COURSE, s)
        || d < islandSpan(COURSE, s)[0] || d > islandSpan(COURSE, s)[1]);
    }
    assert.equal(isInside(COURSE, f.x + f.nx * (f.w / 2 + 1), f.y + f.ny * (f.w / 2 + 1)), false, "past the bank");
  }
  const [ix, iy] = COURSE.islands[Math.floor(COURSE.islands.length / 2)];
  assert.equal(isInside(COURSE, ix, iy), false, "on the island");
  /* a hint keeps the search local and agrees with the global one */
  const f = frameAt(COURSE, 812);
  assert.deepEqual(nearestS(COURSE, f.x, f.y, 810).s.toFixed(3), nearestS(COURSE, f.x, f.y).s.toFixed(3));
});

test("arrived riders park on the bar past the finish, in the water's edge, apart", () => {
  for (let leg = 0; leg < COURSE.legs.length; leg += 1) {
    const slots = Array.from({ length:13 }, (_, k) => beachSlot(COURSE, leg, k));
    for (const slot of slots) {
      assert.ok(slot.s > legAt(COURSE, leg).finish && slot.s < legAt(COURSE, leg).s1);
      assert.ok(isInside(COURSE, slot.x, slot.y, slot.s));
    }
    for (let a = 0; a < slots.length; a += 1)
      for (let b = a + 1; b < slots.length; b += 1)
        assert.ok(Math.hypot(slots[a].x - slots[b].x, slots[a].y - slots[b].y) >= 2 * RADIUS, `leg ${leg} ${a} ${b}`);
  }
  assert.ok(zonesAt(COURSE, legAt(COURSE, 3).finish).some(zone => zone.k === "bar"));
});
