/* Float's art (float/client/art): every critter, floatie, hat, shade and
   pose builds, animates without a NaN and disposes; the API keeps the
   contract's signatures; strokes retrigger the way the screen will call
   them; shared resources are counted back to zero; the baked plush critters
   decode and bind to their skeletons, and their floppy parts follow the
   world; the art never imports Field Day's app. Geometry only: no WebGL
   here. The baked meshes come off the disk (setCritterSource), as the site
   serves them. */
import test, { before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import * as THREE from "three";
import * as art from "../float/client/art/index.js";
import { CRITTER_IDS, HAT_IDS, SHADE_IDS, POSE_IDS } from "../float/shared/looks.js";
import { FLOATIE_IDS } from "../float/shared/floaties.js";
import { edgeInserts, labelOf, badgeKey } from "../float/client/art/badge.js";
import { cacheSizes } from "../float/client/art/materials.js";
import { CRITTER_META } from "../float/client/art/critterMeta.js";
import { decodeCritter, readHeader, critterGeometryNow, critterCacheSize } from "../float/client/art/critterAsset.js";
import { furMaterial } from "../float/client/art/plush.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const { buildRider, buildCritter, buildFloatie, riderPortrait, artStats } = art;
const critterFile = file => readFileSync(join(root, "public/float/critters", file.split("?")[0]));
art.setCritterSource((id, detail, file) => critterFile(file));
before(() => art.preloadCritters(art.BAKED_SPECIES, ["race", "hero"]));

const entrant = (critter, floatie, extra = {}) => ({ name: "Sam", color: "#3b6e9c", number: 7, skin: "star", look: { critter, floatie, hat: "none", shades: "none", pose: "flex" }, ...extra });

function finite(object) {
  object.updateMatrixWorld(true);
  let ok = true;
  object.traverse(o => { if (o.matrixWorld.elements.some(v => !Number.isFinite(v))) ok = false; });
  return ok;
}

/* the critter's own body (the plush and its features), not its fur */
function bodyTriangles(critter) {
  const m = critter.runtime.meshes;
  return m.plush ? m.plush.geometry.index.count / 3 : 0;
}

test("the contract's four signatures, and the additions", () => {
  for (const name of ["buildFloatie", "buildCritter", "buildRider", "riderPortrait"]) assert.equal(typeof art[name], "function", name);
  for (const name of ["floatEnvironment", "floatLights", "disposeFloatArt", "artStats", "buildMedallion", "setFloatArtQuality", "disposePortraits", "preloadCritters", "setCritterSource"]) assert.equal(typeof art[name], "function", name);
  const rider = buildRider(entrant("capybara", "classic"));
  for (const key of ["root", "critter", "floatie", "update", "dispose"]) assert.ok(key in rider, `rider.${key}`);
  for (const key of ["root", "setStroke", "setState", "setPose", "update", "dispose"]) assert.ok(key in rider.critter, `critter.${key}`);
  for (const key of ["root", "seat", "update", "dispose"]) assert.ok(key in rider.floatie, `floatie.${key}`);
  assert.ok(rider.root.isObject3D && rider.floatie.seat.isObject3D);
  /* destructured methods still work (no `this`) */
  const { setStroke, setState, update } = rider.critter;
  setStroke("L"); setState({ handsOff: true }); update(1 / 60);
  rider.dispose();
  /* every look's critter is baked, and builds as itself; an unknown one is a capybara */
  assert.deepEqual([...art.BUILT_SPECIES].sort(), [...CRITTER_IDS].sort());
  assert.deepEqual([...art.BAKED_SPECIES].sort(), [...CRITTER_IDS].sort());
  for (const id of CRITTER_IDS) { const c = buildCritter({ critter: id }); assert.equal(c.id, id); c.dispose(); }
  const stray = buildCritter({ critter: "dragon" });
  assert.equal(stray.id, "capybara");
  stray.dispose();
});

/* what the screen does the moment it builds a rider: a name tag's height
   from the rider's box, before any mesh has arrived */
const topOf = object => { object.updateMatrixWorld(true); return new THREE.Box3().setFromObject(object).max.y; };

test("before its mesh is in: a critter holds its size, pops in whole, and a hero critter trades up from the race mesh in place", async () => {
  /* disposeFloatArt frees the loaded meshes too (the screen calls it on unmount) */
  art.disposeFloatArt();
  assert.equal(critterCacheSize(), 0, "no critter mesh left loaded");
  const id = "quail";
  const c = buildCritter({ critter: id });
  assert.ok(!c.runtime.meshes.plush && c.runtime.placeholder, "built at once, its body still on the way");
  const early = topOf(c.root);
  assert.ok(Math.abs(early - CRITTER_META[id].bounds.hi[1]) < 0.03, `the placeholder is the sculpt's size (${early.toFixed(3)})`);
  assert.equal(await c.meshReady, true);
  for (let i = 0; i < 30; i++) c.update(1 / 60);
  assert.ok(c.runtime.meshes.plush?.isSkinnedMesh && !c.runtime.placeholder, "the plush is in");
  assert.equal(c.root.scale.x, 1, "popped in and settled");
  assert.ok(Math.abs(topOf(c.root) - early) < 0.03, "the name tag's height did not move");
  c.dispose();
  /* the podium: a hero critter over a raced species shows the race mesh at once */
  const race = critterGeometryNow(`${id}:race`);
  assert.ok(race && !critterGeometryNow(`${id}:hero`));
  const h = buildCritter({ critter: id, detail: "hero" });
  assert.equal(h.runtime.meshes.plush.geometry, race, "the race mesh stands in");
  assert.equal(h.runtime.meshes.fur.material, furMaterial("race"), "with the race fur");
  h.update(1 / 60);
  assert.equal(h.root.scale.x, 1, "no pop: it is already there");
  assert.equal(await h.meshReady, true);
  h.update(1 / 60);
  const hero = h.runtime.meshes.plush.geometry;
  assert.ok(hero === critterGeometryNow(`${id}:hero`) && hero.index.count > race.index.count * 3, "traded up to the hero mesh");
  assert.equal(h.runtime.meshes.fur.material, furMaterial("hero"), "and the hero fur");
  assert.equal(h.root.children.filter(o => o.isSkinnedMesh).length, 2, "one plush, one fur: the stand-in is gone");
  assert.equal(h.root.scale.x, 1);
  assert.ok(finite(h.root));
  h.dispose();
  /* a portrait's still: the race mesh under hero dressing and fur */
  const p = buildCritter({ critter: id, detail: "hero", meshDetail: "race" });
  assert.equal(p.runtime.meshes.plush.geometry, race);
  assert.equal(p.runtime.meshes.fur.geometry.instanceCount, furMaterial("hero").userData.shells);
  p.dispose();
  /* the rest of the file wants every mesh in */
  await art.preloadCritters(art.BAKED_SPECIES, ["race", "hero"]);
});

test("the baked files: every species' race and hero file decodes, fits its skeleton, and weighs little", async () => {
  let total = 0;
  for (const id of art.BAKED_SPECIES) {
    const meta = CRITTER_META[id];
    for (const detail of ["race", "hero"]) {
      const f = meta.files[detail];
      assert.ok(f, `${id}: a ${detail} file`);
      const bytes = critterFile(f.file);
      total += bytes.length;
      const head = readHeader(new Uint8Array(bytes));
      assert.equal(head.bones, meta.bones.length, `${id} ${detail}: its skeleton`);
      const d = await decodeCritter(new Uint8Array(bytes));
      const V = d.positions.length / 3;
      assert.ok(V < 65536 && V === f.vertices, `${id} ${detail}: ${V} vertices`);
      assert.ok(d.index.every(i => i < V), `${id} ${detail}: indices in range`);
      for (let v = 0; v < V; v++) {
        const sum = d.skinWeight[v * 4] + d.skinWeight[v * 4 + 1] + d.skinWeight[v * 4 + 2] + d.skinWeight[v * 4 + 3];
        if (sum !== 255) assert.fail(`${id} ${detail}: vertex ${v} weights sum to ${sum}`);
        for (let k = 0; k < 4; k++) if (d.skinIndex[v * 4 + k] >= meta.bones.length) assert.fail(`${id} ${detail}: vertex ${v} on bone ${d.skinIndex[v * 4 + k]}`);
      }
      assert.ok(d.positions.every(Number.isFinite) && d.normals.every(Number.isFinite), `${id} ${detail}: finite`);
      /* it is furry somewhere, and its eyes have their catch lights (roughness 0) */
      assert.ok(d.color.some((c, i) => i % 4 === 3 && c > 8), `${id} ${detail}: fur`);
      assert.ok(d.mat.some((c, i) => i % 4 === 2 && c === 0), `${id} ${detail}: catch lights`);
      const tris = d.index.length / 3;
      if (detail === "race") assert.ok(tris <= 6600, `${id} race: ${tris} triangles`);
      else assert.ok(tris >= 20000 && tris <= 40000, `${id} hero: ${tris} triangles`);
    }
    /* what the hats, shades, chain and chip read */
    assert.ok(meta.sockets.hat.at.length === 3 && meta.anchors.chain.length > 8 && meta.anchors.chip.p.length === 3, `${id}: anchors`);
    assert.equal(meta.info.eyes.length, 2, `${id}: two eyes`);
    for (const b of meta.bones) assert.ok(b.parent < meta.bones.indexOf(b), `${id}: ${b.name} after its parent`);
  }
  /* the whole roster's files stay small enough to fetch on a TV's Wi-Fi */
  assert.ok(total <= art.BAKED_SPECIES.length * 330 * 1024, `${(total / 1024).toFixed(0)} KB for ${art.BAKED_SPECIES.length} species`);
});

test("a baked critter is one skinned plush, its fur one instanced draw, bound to a skeleton made in the bind pose", () => {
  for (const id of art.BAKED_SPECIES) {
    for (const detail of ["race", "hero"]) {
      const c = buildCritter({ critter: id, detail });
      const { plush, fur } = c.runtime.meshes;
      assert.ok(plush?.isSkinnedMesh, `${id} ${detail}: the plush`);
      assert.ok(fur?.isSkinnedMesh && fur.geometry.isInstancedBufferGeometry && fur.geometry.instanceCount === furMaterial(detail).userData.shells, `${id} ${detail}: the fur's shells`);
      assert.equal(plush.skeleton, fur.skeleton);
      assert.equal(plush.geometry.attributes.position, fur.geometry.attributes.position, "the shells share the body's buffers");
      c.update(1 / 60);
      assert.ok(finite(c.root));
      c.dispose();
    }
  }
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

test("hero detail (close-ups, portraits, the podium): every critter and floatie builds and disposes", () => {
  for (const critter of CRITTER_IDS) {
    const r = buildRider({ ...entrant(critter, FLOATIE_IDS[CRITTER_IDS.indexOf(critter) % FLOATIE_IDS.length]), look: { critter, floatie: FLOATIE_IDS[CRITTER_IDS.indexOf(critter) % FLOATIE_IDS.length], hat: "party", shades: "goggles" } }, { detail: "hero" });
    for (let i = 0; i < 30; i++) r.update(1 / 60);
    assert.ok(finite(r.root), critter);
    const race = buildRider(entrant(critter, "classic"));
    assert.ok(bodyTriangles(r.critter) > bodyTriangles(race.critter) * 3, `${critter}: hero is finer than race`);
    race.dispose(); r.dispose();
  }
  for (const floatie of FLOATIE_IDS) { const f = buildFloatie({ floatie, detail: "hero", entrant: { number: 5 } }); f.update(1 / 60); f.dispose(); }
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

test("a baked critter's hat sits on its crown and its shades before its eyes", () => {
  for (const id of art.BAKED_SPECIES) {
    const meta = CRITTER_META[id];
    const c = buildCritter({ critter: id, hat: "cowboy", shades: "aviators" });
    c.update(1 / 60);
    c.root.updateMatrixWorld(true);
    const hat = c.root.getObjectByName("hat:cowboy"), shades = c.root.getObjectByName("shades:aviators");
    const hp = new THREE.Vector3().setFromMatrixPosition(hat.matrixWorld);
    assert.ok(Math.abs(hp.y - meta.sockets.hat.at[1]) < 0.06, `${id}: the hat on the crown (${hp.y.toFixed(3)} vs ${meta.sockets.hat.at[1]})`);
    const box = new THREE.Box3().setFromObject(shades);
    const eyeY = (meta.info.eyes[0].c[1] + meta.info.eyes[1].c[1]) / 2;
    assert.ok(box.min.y < eyeY && box.max.y > eyeY, `${id}: shades across the eyes`);
    assert.ok(box.min.z < Math.min(meta.info.eyes[0].p[2], meta.info.eyes[1].p[2]), `${id}: shades in front of the face`);
    c.dispose();
  }
});

test("the crown is the groom's: anyone else's crown is no hat", () => {
  const plain = buildCritter({ critter: "frog", hat: "crown" });
  const groom = buildCritter({ critter: "frog", hat: "crown", groom: true });
  assert.ok(artStats(groom.root).triangles >= artStats(plain.root).triangles);
  assert.ok(groom.root.getObjectByName("hat:crown") && !plain.root.getObjectByName("hat:crown"));
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
  for (const critter of ["roadrunner", "frog"]) {
    const r = buildRider(entrant(critter, "shark"));
    r.critter.setState({ swim: true });
    for (let i = 0; i < 90; i++) r.update(1 / 60);
    assert.ok(Math.abs(Math.abs(r.floatie.hull.rotation.z) - Math.PI) < 0.3);
    const bone = r.critter.runtime.b.root;
    assert.ok(bone.position.y < -0.15 && bone.position.x > 0.6, `${critter}: in the water beside its floatie`);
    r.critter.setState({ swim: false });
    for (let i = 0; i < 120; i++) r.update(1 / 60);
    assert.ok(Math.abs(r.floatie.hull.rotation.z) < 0.2 && Math.abs(bone.position.y) < 0.05);
    r.dispose();
  }
});

test("floppy: a baked critter's ears, cheeks and belly lag a shove and settle back", () => {
  const id = art.BAKED_SPECIES[0];
  const holder = new THREE.Group();
  const c = buildCritter({ critter: id });
  holder.add(c.root);
  const b = c.runtime.b;
  for (let i = 0; i < 30; i++) { holder.updateMatrixWorld(true); c.update(1 / 60); }
  const ear0 = b.earL.rotation.x, cheek0 = b.cheekL.position.y;
  /* a shove forward and up, then a dead stop, as a bump would give it */
  let moved = 0;
  for (let i = 0; i < 40; i++) {
    if (i < 12) { holder.position.z -= 0.04; holder.position.y += 0.02; }
    holder.updateMatrixWorld(true); c.update(1 / 60);
    moved = Math.max(moved, Math.abs(b.earL.rotation.x - ear0), Math.abs(b.cheekL.position.y - cheek0) * 20);
  }
  assert.ok(moved > 0.05, `the ears and cheeks swing (${moved.toFixed(3)})`);
  for (let i = 0; i < 240; i++) { holder.updateMatrixWorld(true); c.update(1 / 60); }
  assert.ok(Math.abs(b.earL.rotation.x - ear0) < 0.02 && Math.abs(b.cheekL.position.y - cheek0) < 0.002, "and settle once it stops");
  assert.ok(finite(c.root));
  c.dispose();
});

test("budget: a race-detail rider stays modest, a dozen meshes at most", () => {
  const body = [], dressed = [];
  for (const critter of CRITTER_IDS) for (const floatie of FLOATIE_IDS) {
    const d = buildRider({ ...entrant(critter, floatie), look: { critter, floatie, hat: "cowboy", shades: "aviators" } });
    const ds = artStats(d.root);
    assert.ok(ds.meshes <= 12, `${critter} on ${floatie}: ${ds.meshes} meshes`);
    /* the fur's shells are drawn N times: the rest is what a frame pays for geometry */
    const fur = d.critter.runtime.meshes.fur;
    const shells = fur ? (fur.geometry.index.count / 3) * fur.geometry.instanceCount : 0;
    dressed.push(ds.triangles - shells);
    body.push(bodyTriangles(d.critter));
    assert.ok(shells <= 26000, `${critter}: ${shells} fur triangles`);
    d.dispose();
  }
  assert.ok(Math.max(...body) <= 6600, `a plush body: ${Math.max(...body)} triangles`);
  assert.ok(Math.max(...dressed) <= 12000, `dressed, without the fur: ${Math.max(...dressed)} triangles`);
});

test("counted resources (tints, badges, plush) go back to zero", () => {
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

test("quality: low drops the clear coats, the sheen and the fur on everything built, high puts them back", () => {
  const r = buildRider(entrant("otter", "lounge"));
  const mats = new Set();
  r.root.traverse(o => { if (o.isMesh && o.material.isMeshPhysicalMaterial) mats.add(o.material); });
  assert.ok([...mats].some(m => m.clearcoat > 0));
  const plushRider = buildRider(entrant(art.BAKED_SPECIES[0], "classic"));
  const plush = plushRider.critter.runtime.meshes.plush.material;
  assert.ok(plush.sheen > 0 && furMaterial("race").visible);
  art.setFloatArtQuality("low");
  assert.ok([...mats].every(m => m.clearcoat === 0), "every coat off");
  assert.ok(plush.sheen === 0 && !furMaterial("race").visible && !furMaterial("hero").visible, "no sheen, no fur");
  assert.ok(artStats(plushRider.root).meshes < artStats(r.root).meshes + 2, "the fur is not drawn");
  const late = buildRider(entrant("frog", "cooler"));
  late.root.traverse(o => { if (o.isMesh && o.material.isMeshPhysicalMaterial) assert.equal(o.material.clearcoat, 0, "built while low: no coat"); });
  art.setFloatArtQuality("high");
  assert.ok([...mats].some(m => m.clearcoat > 0), "coats back");
  assert.ok(plush.sheen > 0 && furMaterial("race").visible, "sheen and fur back");
  r.dispose(); late.dispose(); plushRider.dispose();
});

test("portraits need a DOM: none in node", async () => {
  assert.equal(await riderPortrait(entrant("frog", "classic")), null);
});

test("the art stands alone: nothing under float/client/art imports Field Day's app", () => {
  const files = [];
  const walk = dir => readdirSync(join(root, dir)).forEach(name => {
    const path = `${dir}/${name}`;
    if (statSync(join(root, path)).isDirectory()) walk(path);
    else if (/\.(js|jsx)$/.test(name)) files.push(path);
  });
  walk("float/client/art");
  for (const path of files) {
    const code = readFileSync(join(root, path), "utf8");
    assert.doesNotMatch(code, /from\s*["'](\.\.\/){3,}(src|shared|worker)\//, `${path} reaches outside Float`);
    assert.doesNotMatch(code, /—/, `${path}: no em dashes`);
  }
  /* the runtime never loads the bake (it is node only, and big) */
  for (const path of files.filter(p => !p.includes("/bake/"))) assert.doesNotMatch(readFileSync(join(root, path), "utf8"), /from\s*["']\.\/bake\//, `${path} imports the bake`);
});
