/* Float's art (float/client/art): every critter, floatie, hat, shade and
   pose builds, animates without a NaN and disposes; the API keeps the
   contract's signatures; strokes retrigger the way the screen will call
   them; shared resources are counted back to zero; the art never imports
   Field Day's app. Geometry only: no WebGL here. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import * as art from "../float/client/art/index.js";
import { CRITTER_IDS, HAT_IDS, SHADE_IDS, POSE_IDS } from "../float/shared/looks.js";
import { FLOATIE_IDS } from "../float/shared/floaties.js";
import { edgeInserts, labelOf, badgeKey } from "../float/client/art/badge.js";
import { cacheSizes } from "../float/client/art/materials.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const { buildRider, buildCritter, buildFloatie, riderPortrait, artStats } = art;

const entrant = (critter, floatie, extra = {}) => ({ name: "Sam", color: "#3b6e9c", number: 7, skin: "star", look: { critter, floatie, hat: "none", shades: "none", pose: "flex" }, ...extra });

function finite(object) {
  object.updateMatrixWorld(true);
  let ok = true;
  object.traverse(o => { if (o.matrixWorld.elements.some(v => !Number.isFinite(v))) ok = false; });
  return ok;
}

test("the contract's four signatures, and the additions", () => {
  for (const name of ["buildFloatie", "buildCritter", "buildRider", "riderPortrait"]) assert.equal(typeof art[name], "function", name);
  for (const name of ["floatEnvironment", "floatLights", "disposeFloatArt", "artStats"]) assert.equal(typeof art[name], "function", name);
  const rider = buildRider(entrant("capybara", "classic"));
  for (const key of ["root", "critter", "floatie", "update", "dispose"]) assert.ok(key in rider, `rider.${key}`);
  for (const key of ["root", "setStroke", "setState", "setPose", "update", "dispose"]) assert.ok(key in rider.critter, `critter.${key}`);
  for (const key of ["root", "seat", "update", "dispose"]) assert.ok(key in rider.floatie, `floatie.${key}`);
  assert.ok(rider.root.isObject3D && rider.floatie.seat.isObject3D);
  /* destructured methods still work (no `this`) */
  const { setStroke, setState, update } = rider.critter;
  setStroke("L"); setState({ handsOff: true }); update(1 / 60);
  rider.dispose();
});

test("every critter builds, plays every state and pose, and disposes", () => {
  for (const critter of CRITTER_IDS) {
    const r = buildRider(entrant(critter, "classic"));
    const c = r.critter;
    const script = [[5, () => c.setStroke("L")], [20, () => c.setStroke("R")], [30, () => c.setState({ handsOff: true })],
      [50, () => c.setStroke("R")], [70, () => c.setState({ handsOff: false, swim: true })], [110, () => c.setState({ swim: false, sad: true })],
      [140, () => c.setState({ sad: false, celebrate: true })], [170, () => c.setState({ celebrate: false })]];
    for (let i = 0; i < 200; i++) { for (const [at, fn] of script) if (at === i) fn(); r.update(1 / 60); }
    for (const pose of POSE_IDS) { c.setPose(pose); for (let i = 0; i < 90; i++) r.update(1 / 30); }
    c.setPose(null);
    for (let i = 0; i < 30; i++) r.update(1 / 60);
    assert.ok(finite(r.root), `${critter}: every matrix finite`);
    r.dispose();
  }
});

test("every floatie builds with a seat and its seat info, flips, and disposes", () => {
  for (const floatie of FLOATIE_IDS) {
    const f = buildFloatie({ floatie, color: "#c05b33", entrant: { number: 12 } });
    assert.ok(f.seat.isObject3D, floatie);
    assert.ok(Array.isArray(f.seatInfo.rest) && Number.isFinite(f.seatInfo.out), `${floatie}: seat info`);
    f.setState({ flipped: true });
    for (let i = 0; i < 60; i++) f.update(1 / 60);
    assert.ok(Math.abs(Math.abs(f.hull.rotation.z) - Math.PI) < 0.3, `${floatie}: upside down`);
    f.setState({ flipped: false });
    for (let i = 0; i < 90; i++) f.update(1 / 60);
    assert.ok(Math.abs(f.hull.rotation.z) < 0.2, `${floatie}: upright again`);
    assert.ok(finite(f.root));
    f.dispose();
  }
});

test("every hat and shade fits every critter", () => {
  for (const critter of CRITTER_IDS) {
    for (const hat of HAT_IDS) { const c = buildCritter({ critter, hat, groom: true }); c.update(1 / 60); assert.ok(finite(c.root), `${critter} ${hat}`); c.dispose(); }
    for (const shades of SHADE_IDS) { const c = buildCritter({ critter, shades }); c.update(1 / 60); assert.ok(finite(c.root), `${critter} ${shades}`); c.dispose(); }
  }
});

test("the crown is the groom's: anyone else's crown is no hat", () => {
  const plain = buildCritter({ critter: "frog", hat: "crown" });
  const groom = buildCritter({ critter: "frog", hat: "crown", groom: true });
  assert.ok(artStats(groom.root).triangles >= artStats(plain.root).triangles);
  plain.dispose(); groom.dispose();
});

test("a stroke flag held for 250 ms is one stroke; held longer, the arm keeps paddling", () => {
  const c = buildCritter({ critter: "frog" });
  const st = c.runtime.side.L.stroke;
  c.setStroke("L");
  for (let i = 0; i < 5; i++) { c.update(0.05); c.setStroke("L"); }
  assert.ok(st.on && st.t > 0.24, "the repeats inside 0.28 s are the same stroke");
  c.update(0.05); c.setStroke("L");
  assert.ok(st.t < 0.1, "a call after 0.28 s starts the next stroke");
  let caught = 0;
  c.onCatch = side => { if (side === "L") caught++; };
  for (let i = 0; i < 20; i++) c.update(0.05);
  assert.equal(caught, 1, "the hand enters the water once a stroke");
  c.dispose();
});

test("drinking: the can shows in a hand, and a stroke on that side moves it to the other", () => {
  const c = buildCritter({ critter: "capybara" });
  c.setState({ handsOff: true });
  for (let i = 0; i < 40; i++) c.update(1 / 60);
  const drink = c.runtime.drink;
  assert.ok(drink.visible, "the can is out");
  assert.equal(c.runtime.drinkSide, "R");
  c.setStroke("R");
  assert.equal(c.runtime.drinkSide, "L", "the right hand paddles, the left holds the drink");
  c.setState({ handsOff: false });
  for (let i = 0; i < 60; i++) c.update(1 / 60);
  assert.ok(!drink.visible, "put away");
  c.dispose();
});

test("swimming flips the rider's floatie and climbing back rights it", () => {
  const r = buildRider(entrant("roadrunner", "shark"));
  r.critter.setState({ swim: true });
  for (let i = 0; i < 90; i++) r.update(1 / 60);
  assert.ok(Math.abs(Math.abs(r.floatie.hull.rotation.z) - Math.PI) < 0.3);
  const bone = r.critter.runtime.b.root;
  assert.ok(bone.position.y < -0.15 && bone.position.x > 0.6, "the critter is in the water beside its floatie");
  r.critter.setState({ swim: false });
  for (let i = 0; i < 120; i++) r.update(1 / 60);
  assert.ok(Math.abs(r.floatie.hull.rotation.z) < 0.2 && Math.abs(bone.position.y) < 0.05);
  r.dispose();
});

test("budget: a race-detail rider stays modest, a dozen meshes at most", () => {
  const bare = [], dressed = [];
  for (const critter of CRITTER_IDS) for (const floatie of FLOATIE_IDS) {
    const r = buildRider(entrant(critter, floatie));
    const s = artStats(r.root);
    bare.push(s.triangles);
    r.dispose();
    const d = buildRider({ ...entrant(critter, floatie), look: { critter, floatie, hat: "cowboy", shades: "aviators" } });
    const ds = artStats(d.root);
    dressed.push(ds.triangles);
    assert.ok(ds.meshes <= 12, `${critter} on ${floatie}: ${ds.meshes} meshes`);
    d.dispose();
  }
  const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
  assert.ok(Math.max(...bare) <= 8600, `bare max ${Math.max(...bare)} triangles`);
  assert.ok(avg(bare) <= 7000, `bare average ${Math.round(avg(bare))} triangles`);
  assert.ok(Math.max(...dressed) <= 10000, `dressed max ${Math.max(...dressed)} triangles`);
});

test("counted resources (tints, badges) go back to zero", () => {
  const before = cacheSizes().counted;
  const riders = ["#c05b33", "#3b6e9c", "#c05b33"].map((color, i) => buildRider({ ...entrant("frog", "donut"), color, number: i, look: { critter: "frog", floatie: "donut", hat: "cowboy" } }));
  assert.ok(cacheSizes().counted > before);
  riders.forEach(r => r.dispose());
  assert.equal(cacheSizes().counted, before);
});

test("the chip: number, else initial; every skin's edge inserts; keys by what it shows", () => {
  assert.equal(labelOf({ number: 7 }), "7");
  assert.equal(labelOf({ number: 0 }), "0");
  assert.equal(labelOf({ name: "evan" }), "E");
  assert.equal(labelOf({}), "");
  for (const skin of ["ticks", "plain", "dash", "quad", "dots", "ring", "saw", "flame", "star", "bolt", "wave", "crown"]) assert.equal(edgeInserts(skin).length, 24);
  assert.notEqual(badgeKey({ color: "#c05b33", number: 1 }), badgeKey({ color: "#c05b33", number: 2 }));
  assert.notEqual(badgeKey({ color: "#c05b33", number: 1 }), badgeKey({ color: "#c05b33", number: 1, photo: "/p.jpg" }));
});

test("quality: low drops the clear coats on everything built, high puts them back", () => {
  const r = buildRider(entrant("otter", "lounge"));
  const mats = new Set();
  r.root.traverse(o => { if (o.isMesh && o.material.isMeshPhysicalMaterial) mats.add(o.material); });
  assert.ok([...mats].some(m => m.clearcoat > 0));
  art.setFloatArtQuality("low");
  assert.ok([...mats].every(m => m.clearcoat === 0), "every coat off");
  const late = buildRider(entrant("frog", "cooler"));
  late.root.traverse(o => { if (o.isMesh && o.material.isMeshPhysicalMaterial) assert.equal(o.material.clearcoat, 0, "built while low: no coat"); });
  art.setFloatArtQuality("high");
  assert.ok([...mats].some(m => m.clearcoat > 0), "coats back");
  r.dispose(); late.dispose();
});

test("portraits need a DOM: none in node", async () => {
  assert.equal(await riderPortrait(entrant("frog", "classic")), null);
});

test("the art stands alone: nothing under float/client/art imports Field Day's app", () => {
  const dir = join(root, "float/client/art");
  for (const name of readdirSync(dir).filter(n => /\.(js|jsx)$/.test(n))) {
    const code = readFileSync(join(dir, name), "utf8");
    assert.doesNotMatch(code, /from\s*["'](\.\.\/){3,}(src|shared|worker)\//, `${name} reaches outside Float`);
    assert.doesNotMatch(code, /—/, `${name}: no em dashes`);
  }
});
