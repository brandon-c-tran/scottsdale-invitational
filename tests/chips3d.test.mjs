/* The chip layer (Oct 13, features/chips3d): real chips on the betting
   table. The pure rules (where each stack stands, how many bodies it is,
   when the glove reaches it), the gate's mode, and the bundle boundary:
   three and cannon-es live only in lazily loaded chunks. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
  CHIP3D, bodyCap, chipJitter, chipPhysicsMode, elevationAt, footprint, scatterStacks, stackBodies, stackExtent, sweepHit, tossSchedule,
} from "../src/features/chips3d/chipScatter.js";
import { glovePath, chipLayer, tableLayout } from "../src/features/tv/tvTable.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = path => readFileSync(join(root, path), "utf8");

test("a stake stands as one chip per 100 to the cap, then the tower's one or two", () => {
  assert.equal(stackBodies(0), 0);
  assert.equal(stackBodies(100), 1);
  assert.equal(stackBodies(500), 5);
  assert.equal(stackBodies(1000), 10);
  assert.equal(stackBodies(1200), 11, "past the cap: one tower chip");
  assert.equal(stackBodies(2500), 12, "past twice the cap: two");
  assert.equal(CHIP3D.tallest, 12);
});

const AREA = { x:100, y:200, w:460, h:300 };
const stacks = [
  { player:"Evan", stake:1000 }, { player:"Sahil", stake:700 }, { player:"Chinh", stake:300 }, { player:"Adi", stake:100 },
];
const LABEL = { h:60, w:item => item.player.length * 11 + 8 };
const pad = CHIP3D.pad;
const overlaps = (a, b) => a.left < b.right + pad && b.left < a.right + pad && a.top < b.bottom + pad && b.top < a.bottom + pad;

test("scatter: deterministic for the same contest and spot, different for another", () => {
  const a = scatterStacks({ area:AREA, stacks, r:24, seed:"c1|0", label:LABEL, pair:true, height:600 });
  const b = scatterStacks({ area:AREA, stacks, r:24, seed:"c1|0", label:LABEL, pair:true, height:600 });
  assert.deepEqual(a, b, "every screen scatters the same stacks to the same places");
  const c = scatterStacks({ area:AREA, stacks, r:24, seed:"c2|0", label:LABEL, pair:true, height:600 });
  assert.notDeepEqual(a.items.map(i => [i.x, i.y]), c.items.map(i => [i.x, i.y]), "another contest scatters anew");
  assert.deepEqual(chipJitter("c1|0", "Evan", 3), chipJitter("c1|0", "Evan", 3));
});

test("scatter: every stack (with its payout's room and its plate) inside the area, clear of the others and of what reads", () => {
  const keepouts = [{ left:100, right:300, top:200, bottom:330 }, { left:420, right:560, top:200, bottom:240 }];
  for (const seed of ["c1|0", "c1|1", "x|y", "match:7|2"]) {
    const sc = scatterStacks({ area:AREA, keepouts, stacks, r:24, rMin:14, seed, label:LABEL, pair:true, height:600 });
    assert.equal(sc.items.length + (sc.folded ? sc.folded - 1 : 0), stacks.length, `${seed}: every bettor stands or folds`);
    const boxes = sc.items.map(item => footprint(item, item.x, item.y, sc.r, { label:LABEL, pair:true, height:600 }));
    boxes.forEach((box, i) => {
      assert.ok(box.left >= AREA.x - 0.5 && box.right <= AREA.x + AREA.w + 0.5, `${seed}: ${sc.items[i].player} inside across`);
      assert.ok(box.top >= AREA.y - 0.5 && box.bottom <= AREA.y + AREA.h + 0.5, `${seed}: ${sc.items[i].player} inside down`);
      keepouts.forEach(k => assert.ok(!overlaps(box, k), `${seed}: ${sc.items[i].player} clear of the text`));
      boxes.slice(i + 1).forEach((other, j) => assert.ok(!overlaps(box, other), `${seed}: ${sc.items[i].player} clear of ${sc.items[i + 1 + j].player}`));
    });
    sc.items.forEach(item => assert.ok(item.pairDir === 1 || item.pairDir === -1));
  }
});

test("scatter: a new bettor never moves a stack already standing", () => {
  const first = scatterStacks({ area:AREA, stacks:stacks.slice(0, 2), r:24, seed:"c1|0", label:LABEL, pair:true });
  const prev = new Map(first.items.map(item => [item.player, { x:item.x, y:item.y, pairDir:item.pairDir }]));
  const next = scatterStacks({ area:AREA, stacks, r:24, seed:"c1|0", label:LABEL, pair:true, prev });
  for (const item of first.items) {
    const now = next.items.find(i => i.player === item.player);
    assert.equal(now.x, item.x); assert.equal(now.y, item.y);
  }
});

test("scatter: a crowd shrinks the chips to the floor, then the smallest fold into one +N stack", () => {
  const crowd = ["Brandon", "Evan", "Sahil", "Chinh", "Adi", "Ben", "Khoa", "Allan", "Eyob", "Jeremy", "Henry", "Chiang"]
    .map((player, i) => ({ player, stake:1200 - i * 100 }));
  const small = { x:0, y:0, w:300, h:150 };
  const sc = scatterStacks({ area:small, stacks:crowd, r:24, rMin:15, seed:"crowd", label:LABEL, pair:true });
  assert.ok(sc.r < 24 && sc.r >= 15 - 1e-9, "shrunk, never under the floor");
  const group = sc.items.find(item => item.group);
  assert.ok(group, "a fold");
  assert.equal(group.count, sc.folded);
  assert.equal(group.player, `+${group.count}`);
  const kept = sc.items.filter(item => !item.group).map(item => item.player);
  assert.deepEqual(kept, crowd.slice(0, kept.length).map(item => item.player).filter(p => kept.includes(p)), "the biggest stand");
  assert.equal(group.stake, crowd.filter(item => !kept.includes(item.player)).reduce((sum, item) => sum + item.stake, 0));
  assert.deepEqual(scatterStacks({ area:small, stacks:[], seed:"x" }).items, []);
});

test("the camera: a stack higher on the host stands taller and flatter; extents grow with the chips", () => {
  assert.ok(elevationAt(0, 600) < elevationAt(300, 600) && elevationAt(300, 600) < elevationAt(600, 600));
  assert.equal(elevationAt(300, 600), CHIP3D.elevationDeg * Math.PI / 180);
  assert.ok(stackExtent(24, 10).up > stackExtent(24, 2).up);
  assert.ok(stackExtent(24, 12, elevationAt(0, 600)).up > stackExtent(24, 12, elevationAt(600, 600)).up);
  assert.ok(stackExtent(24, 1, elevationAt(0, 600)).down < stackExtent(24, 1, elevationAt(600, 600)).down);
});

test("the budget: under it every chip is real; over it the tallest give first and a stack keeps one", () => {
  assert.equal(bodyCap([10, 10, 5], 300), Infinity);
  const counts = Array.from({ length:26 }, () => 12).concat([3, 1]);
  const cap = bodyCap(counts, 120);
  assert.ok(counts.reduce((sum, n) => sum + Math.min(n, cap), 0) <= 120);
  assert.ok(cap >= 1);
  assert.equal(bodyCap(Array(200).fill(12), 120), 1, "never under one");
  assert.deepEqual(CHIP3D.budget, { tv:300, phone:120 });
});

test("tosses and sweeps: staggered, seeded, and the glove reaches each stack in order", () => {
  const plan = tossSchedule(5, "c|Evan");
  assert.equal(plan.length, 5);
  assert.deepEqual(plan, tossSchedule(5, "c|Evan"));
  plan.slice(1).forEach((step, i) => assert.ok(step.delay > plan[i].delay));
  const sweep = { at:1000, ms:1300, ...glovePath.sweep(1872) };
  assert.equal(sweepHit(sweep.x0 - 50, sweep), 1000);
  assert.equal(sweepHit(sweep.x1 + 50, sweep), 2300);
  assert.ok(sweepHit(400, sweep) < sweepHit(1400, sweep));
});

test("the TV's felt: each shape's chip, its floor, payout room and plates", () => {
  const match = chipLayer(tableLayout({ shape:"match", count:2, width:1872 }));
  assert.deepEqual([match.pairs, match.labels], [true, true]);
  assert.ok(match.chip >= 48 && match.min < match.chip);
  const grid = chipLayer(tableLayout({ shape:"grid", count:13, width:1872 }));
  assert.deepEqual([grid.pairs, grid.labels], [false, false], "a grid cell's faces already say whose");
  const band = chipLayer(tableLayout({ shape:"match", count:2, width:1872, band:true }));
  assert.equal(band.labels, true);
});

test("the gate: a TV always wants the layer, a phone only with its switch; no WebGL or a failure is flat", () => {
  const on = { want:true, supported:true, loaded:true };
  assert.deepEqual(chipPhysicsMode({ ...on, tv:true, enabled:false }), { load:true, on:true }, "the TV has no switch");
  assert.deepEqual(chipPhysicsMode({ ...on, tv:false, enabled:false }), { load:false, on:false }, "a phone's switch off: no download");
  assert.deepEqual(chipPhysicsMode({ ...on, tv:false, enabled:true }), { load:true, on:true });
  assert.deepEqual(chipPhysicsMode({ ...on, supported:false, tv:true }), { load:false, on:false }, "no WebGL");
  assert.deepEqual(chipPhysicsMode({ ...on, failed:"slow", tv:true }), { load:false, on:false }, "fell back for the session");
  assert.deepEqual(chipPhysicsMode({ ...on, loaded:false, tv:true }), { load:true, on:false }, "flat until the chunk is in");
  assert.deepEqual(chipPhysicsMode({ ...on, want:false, tv:true }), { load:false, on:false }, "no chips on the table: nothing loads");
});

test("the bundle: three and cannon-es only in the lazy chunks; the gate imports the layer dynamically", () => {
  const files = [];
  const walk = dir => readdirSync(dir, { withFileTypes:true }).forEach(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (/\.(jsx?|mjs)$/.test(entry.name)) files.push(path);
  });
  walk(join(root, "src"));
  walk(join(root, "shared"));
  const rel = file => file.replace(/\\/g, "/").split("/src/")[1] || file;
  const staticOf = name => files.filter(file => new RegExp(`(?:^|\\n)\\s*import[^;]*from\\s*["']${name}["']`).test(readFileSync(file, "utf8"))).map(rel);
  assert.deepEqual(staticOf("cannon-es"), ["features/chips3d/ChipPhysics.jsx"], "the engine has one importer");
  assert.ok(staticOf("three").every(file => ["features/chips3d/ChipPhysics.jsx", "features/tv/ChipTowers.jsx"].includes(file)));
  const staticLayer = files.filter(file => /import[^;(]*from\s*["'][^"']*\/ChipPhysics(\.jsx)?["']/.test(readFileSync(file, "utf8")));
  assert.deepEqual(staticLayer, [], "ChipPhysics is never imported statically");
  assert.match(read("src/features/chips3d/ChipPhysicsLayer.jsx"), /import\("\.\/ChipPhysics\.jsx"\)/);
  assert.doesNotMatch(read("src/features/chips3d/chipPhysicsFlag.js"), /from\s*["'](three|cannon-es)["']/);
  assert.doesNotMatch(read("src/features/chips3d/chipScatter.js"), /from\s*["'](three|cannon-es)["']/);
  const pkg = JSON.parse(read("package.json"));
  assert.match(pkg.dependencies["cannon-es"], /^\d+\.\d+\.\d+$/, "cannon-es is pinned to an exact version");
  /* after a build, the entry chunk carries neither the renderer nor the engine */
  const assets = join(root, "dist/client/assets");
  if (existsSync(assets)) readdirSync(assets).filter(name => /^index-.*\.js$/.test(name)).forEach(name => {
    const code = readFileSync(join(assets, name), "utf8");
    assert.ok(!code.includes("WebGLRenderer"), `${name}: no three`);
    assert.ok(!code.includes("SAPBroadphase") && !code.includes("ContactMaterial"), `${name}: no cannon-es`);
  });
});

test("the layer: a canvas that never takes a tap, chips only on fresh frames, the slow and lost-context fallbacks", () => {
  const layer = read("src/features/chips3d/ChipPhysics.jsx");
  const css = read("src/features/chips3d/chips3d.css");
  assert.match(css, /\.c3d \{[^}]*pointer-events:none/);
  assert.match(layer, /fresh === undefined \? freshFrameNow\(\) : !!fresh/, "a toss only on a fresh frame");
  assert.match(layer, /!reducedMotion && /, "reduced motion: at rest");
  assert.match(layer, /webglcontextlost/);
  assert.match(layer, /onFail\("slow"\)/);
  assert.doesNotMatch(layer, /roomChipsLanded\(|cueAt\(|bus:\s*"room"/, "the shared layer plays nothing itself");
  assert.match(layer, /IntersectionObserver/);
  assert.match(layer, /visibilitychange/);
  const table = read("src/features/tv/TVTable.jsx");
  assert.match(table, /onLand=\{roomChipsLanded\}/, "the TV's clacks ride the room's density rule");
  assert.match(table, /useChipPhysics\(\{ tv:true/);
  assert.match(table, /!physics && spot\.stacks\.length > 0 && <FitStacks/, "the DOM stacks are the fallback");
});

test("a stack that shrinks outside a moment just loses its chips; only a fresh one lifts them off", () => {
  const physics = readFileSync(new URL("../src/features/chips3d/ChipPhysics.jsx", import.meta.url), "utf8");
  assert.match(physics, /lift\(st, pay = false, animate = true\) \{[\s\S]*?if \(animate\) this\.fade\(chip\); else this\.remove\(chip\);/);
  assert.match(physics, /for \(let j = want; j < have; j\+\+\) this\.lift\(st, false, animate\);/,
    "a catch-up, a correction or reduced motion never plays the lift");
});
