/* PARKED: the 3D art API (float/PROTOCOL.md "Art"; branch float/proto). The
   Groove version draws in 2D (index.js, groove/); this file is kept
   unimported so the 3D fallback still builds and its tests still run.

   The art API (float/PROTOCOL.md "Art"): soft plush desert critters in
   glossy pool floaties, each wearing a gold chain with the rider's chip.

   Everything returns three.js objects in metres, y up, the rider facing -z
   (downstream when the screen turns it). A floatie's origin is the water
   line under its centre. What it reads from the network: a rider's own
   photo (entrant.photo, same origin) for the chip's face, and the critters'
   meshes, baked offline (scripts/float-bake-critters.mjs) into
   /float/critters/<species>.<race|hero>.bin: about 50 KB a species at race
   detail, 250 KB at hero, each fetched once, when a critter of that species
   and detail is first built, and shared by every rider of it.

   So a critter is built at once (its skeleton, chain, chip, hat and
   shades) and its body arrives a moment later the first time: it pops in,
   and `ready` waits for it (meshReady alone). A hero critter whose race
   mesh is already in shows that until its own arrives, and a species raced
   at race detail fetches its hero file ahead in idle time, so the podium's
   rebuild is whole at once. preloadCritters(ids, details) loads ahead
   (a lobby that wants no pop-in); setCritterSource(fn) hands the bytes over
   where there is no page to fetch from (node tests).

   The gloss needs something to reflect: set
     scene.environment = floatEnvironment(renderer, "night")
   on the screen (floatLights("night") is a matching light rig).

   Signatures (kept from the stub):
     buildFloatie({ floatie, color }) -> { root, seat, update(dt), dispose() }
     buildCritter({ critter, color }) -> { root, setStroke(side), setState(state), setPose(pose), update(dt), dispose() }
     buildRider(entrant) -> { root, critter, floatie, update(dt), dispose() }
     riderPortrait(entrant, { size }) -> Promise<PNG data URL>
   Additions are documented where they are defined. */
import * as THREE from "three";
import { CritterRuntime } from "./critter.js";
import { buildFloatieArt, BUILT_FLOATIES } from "./floatie3d.js";
import { chainGeometry, chipGeometry, chipPlace, buildDrink, bezelGeometry } from "./accessories.js";
import { buildHat, buildShades } from "./hats.js";
import { tint, releaseTint, gold, geometry, disposeFloatArt as disposeShared, normalHex, cacheSizes, setFloatArtQuality, floatArtQuality } from "./materials.js";
import { acquireBadge, releaseBadge } from "./badge.js";
import { floatEnvironment, floatLights, disposeFloatEnvironment } from "./environment.js";
import { triangles } from "./sculpt.js";
import { bakedTemplate, hasBaked, bakedFile, BAKED_SPECIES } from "./critterTemplate.js";
import { loadCritterGeometry, critterGeometryNow, setCritterSource, disposeCritterGeometry, critterEpoch } from "./critterAsset.js";
import { plush, releasePlush, furMaterial } from "./plush.js";

/* the species built (every one of them is baked: BAKED_SPECIES is the same list) */
const BUILT_SPECIES = BAKED_SPECIES;
export { floatEnvironment, floatLights, disposeFloatEnvironment, BUILT_SPECIES, BUILT_FLOATIES, BAKED_SPECIES, cacheSizes, setFloatArtQuality, floatArtQuality, setCritterSource };

/* everything the art made, the loaded critter meshes included: call when
   the screen unmounts for good */
export function disposeFloatArt() {
  disposeShared();
  disposeCritterGeometry();
  ahead.clear();
}

/* a species' template, cached by detail ("race" for the screen's pack,
   "hero" for close-ups: the showcase, portraits, the podium): its skeleton
   and anchors (critterMeta.js); the mesh loads from its file. An unknown
   species is a capybara. */
const templateOf = (critter, detail) => {
  const id = hasBaked(critter) ? critter : "capybara";
  return geometry(`species2:${id}:${detail}`, () => bakedTemplate(id, detail));
};
const detailOf = d => (d === "hero" ? "hero" : "race");
/* a plume or a crest worn under a hat comes out through its top. A hat
   open on top (the visor, the flowers, the crown) lets it be; a party
   hat's point is no place for one, so it folds away under it. An invisible
   marker on the crest keeps a bounding box (a name tag's height, a
   portrait's frame) over the plume's top. */
const OPEN_HATS = new Set(["visor", "flowers", "crown"]);
function crestOverHat(rt, hatObj, id) {
  const crest = rt.b.crest;
  if (!crest || OPEN_HATS.has(id)) return;
  if (id === "party") { crest.scale.setScalar(0.001); return; }
  rt.root.updateMatrixWorld(true);
  const top = new THREE.Box3().setFromObject(hatObj).max.y;
  const at = new THREE.Vector3().setFromMatrixPosition(crest.matrixWorld).y;
  const lift = top - at - 0.035;
  if (!(lift > 0)) return;
  crest.position.y += lift;
  rt.crestLift = lift;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([-0.05, 0, -0.05, 0.05, 0.2, 0.05], 3));
  g.setDrawRange(0, 0);
  const marker = new THREE.Mesh(g);
  marker.visible = false;
  marker.name = "crest-top";
  crest.add(marker);
  rt.crestMarker = marker;
}
const warned = new Set();
const warnOnce = (key, error) => { if (warned.has(key)) return; warned.add(key); console.warn("Float critter", key, error?.message || error); };

/* load baked critters ahead (all of them by default): resolves when their
   meshes are in, so critters built after it are complete at once (tests,
   a lobby that wants no pop-in) */
export function preloadCritters(ids = BAKED_SPECIES, details = ["race"]) {
  const jobs = [];
  for (const id of ids) {
    if (!hasBaked(id)) continue;
    for (const d of details) { const f = bakedFile(id, d); jobs.push(loadCritterGeometry(f.key, id, f.detail, f.file)); }
  }
  return Promise.all(jobs).then(() => true);
}

/* the podium's meshes, fetched ahead: a species raced at race detail is
   the one the screen asks for in hero when its rider steps up, so a few
   seconds after its first race build its hero file loads in idle time,
   one file at a time (a page only, never node) */
const AHEAD_FIRST_MS = 4000, AHEAD_GAP_MS = 1200;
const ahead = new Set();
let aheadChain = Promise.resolve();
function heroAhead(id) {
  if (ahead.has(id) || typeof window === "undefined" || typeof document === "undefined") return;
  const f = bakedFile(id, "hero");
  ahead.add(id);
  if (f.detail !== "hero" || critterGeometryNow(f.key)) return;
  const at = critterEpoch();
  const wait = ahead.size === 1 ? AHEAD_FIRST_MS : AHEAD_GAP_MS;
  aheadChain = aheadChain.then(() => new Promise(resolve => {
    const go = () => {
      if (at !== critterEpoch()) { resolve(); return; }
      loadCritterGeometry(f.key, id, f.detail, f.file).catch(() => null).then(() => resolve());
    };
    setTimeout(() => (typeof window.requestIdleCallback === "function" ? window.requestIdleCallback(go, { timeout: 2000 }) : go()), wait);
  }));
}
const seedOf = (entrant, fallback) => String(entrant?.device || entrant?.pid || entrant?.name || entrant?.number || fallback || "rider");

/* A floatie: { root, seat, update(dt), dispose() }. `seat` is where a
   critter sits. Additions: seatInfo (how a critter sits in it),
   setState({ flipped }), kick({ lean, dip }); options entrant (its number on
   the sides and back), detail, seed. */
export function buildFloatie({ floatie = "classic", color = "#e8b04a", entrant = null, detail = "race", seed = null } = {}) {
  const badge = entrant ? acquireBadge({ ...entrant, color: normalHex(entrant.color || color) }) : null;
  const f = buildFloatieArt({ floatie, color, badge, detail: detailOf(detail), seed: seed || seedOf(entrant, floatie) });
  const dispose = f.dispose;
  f.dispose = () => { dispose(); if (badge) releaseBadge(badge.key); };
  return f;
}

/* A critter: { root, setStroke(side), setState(state), setPose(pose),
   update(dt), dispose() }. state: { swim, handsOff, sad, celebrate }
   (booleans, merged: pass only what changed). setStroke("L"|"R") plays one
   stroke (calls inside the same stroke's first 0.28 s are that stroke).
   setPose(id) loops a victory pose until setPose(null).
   Options: hat, shades, entrant (for the chip: photo, number, skin, groom),
   medallion (false: no chain), detail, seed.
   Additions: setSeat(seatInfo), anchors { head, chest, handL, handR },
   onCatch (assign a function: called with "L"/"R" as a hand enters the
   water, for splashes), ready (resolves when the chip's photo is drawn and
   the critter's mesh is in), meshReady (the mesh alone), state, lean (this
   frame's stroke lean, signed). meshDetail (the portraits'): the mesh's
   own detail when it differs from the dressing's (a hero still drawn from
   the race mesh, which a small image cannot tell apart). */
export function buildCritter({ critter = "capybara", color = "#9aa39e", hat = "none", shades = "none", entrant = null, medallion = true,
  detail = "race", seed = null, groom = false, meshDetail = null } = {}) {
  const det = detailOf(detail);
  const template = templateOf(critter, meshDetail ? detailOf(meshDetail) : det);
  const hex = normalHex(color);
  const tints = [];
  const takeTint = () => { tints.push(hex); return tint(hex); };
  const grain = det === "hero" ? 0.22 : 0;
  const materials = { plush: plush(hex, { grain }), fur: furMaterial(det) };
  const drink = buildDrink(hex, det); tints.push(hex);
  const rt = new CritterRuntime(template, { materials, seed: seed || seedOf(entrant, critter), drink });
  rt.root.name = `critter:${template.id}`;
  /* a baked mesh: there now if a rider of this species already loaded it;
     a hero critter whose race mesh is in (the podium, built over a rider
     it raced) shows that at once and trades up when its own arrives;
     else it pops in when it arrives */
  let meshReady = Promise.resolve(true);
  /* a hero mesh's fur rides the race mesh (critter.js setShellBase) */
  const race = bakedFile(template.id, "race");
  const raceNow = template.detail === "hero" ? critterGeometryNow(race.key) : null;
  let shellsReady = Promise.resolve(true);
  if (template.detail === "hero") {
    if (raceNow) rt.setShellBase(raceNow);
    else {
      shellsReady = loadCritterGeometry(race.key, template.id, race.detail, race.file)
        .then(geo => { rt.setShellBase(geo); return true; })
        .catch(error => { warnOnce(race.key, error); return false; });
    }
  }
  const now = critterGeometryNow(template.key);
  if (now) { rt.attach(now); rt.pop = 1; }
  else {
    if (raceNow) { rt.attach(raceNow, { fur: furMaterial("race") }); rt.pop = 1; }
    else rt.holdPlace(template.bounds);
    meshReady = loadCritterGeometry(template.key, template.id, template.detail, template.file)
      .then(geo => { rt.attach(geo); return true; })
      .catch(error => { warnOnce(template.key, error); return false; });
  }
  meshReady = Promise.all([meshReady, shellsReady]).then(([body]) => body);
  if (det === "race" && !meshDetail) heroAhead(template.id);
  let badge = null;
  if (medallion) {
    badge = acquireBadge({ ...(entrant || {}), color: hex });
    const chain = new THREE.Mesh(chainGeometry(template, det), gold());
    chain.name = "chain";
    rt.b.chest.add(chain);
    const chip = new THREE.Mesh(chipGeometry(det === "hero" ? 64 : 36), badge.material);
    chip.name = "chip";
    const place = chipPlace(template);
    chip.position.copy(place.p).sub(rt.chestAt);
    chip.quaternion.copy(place.q);
    rt.b.chest.add(chip);
  }
  const headAt = template.bones.find(b => b.name === "head").at;
  const crowned = groom || !!entrant?.groom;
  const hatObj = buildHat(hat === "crown" && !crowned ? "none" : hat, { template, color: hex, detail: det, headAt, takeTint });
  if (hatObj) { rt.b.head.add(hatObj); if (template.info.crestOverHat) crestOverHat(rt, hatObj, hat); }
  const shadesObj = buildShades(shades, { template, color: hex, detail: det, headAt, takeTint });
  if (shadesObj) rt.b.head.add(shadesObj);
  let caught = null, userCatch = null;
  rt.onCatch = side => { caught = side; if (userCatch) userCatch(side); };
  return {
    root: rt.root,
    id: template.id,
    setStroke: side => rt.setStroke(side),
    setState: state => rt.setState(state),
    setPose: pose => rt.setPose(pose),
    setSeat: seat => rt.setSeat(seat),
    update: dt => rt.update(dt),
    dispose() {
      rt.dispose();
      for (const h of tints) releaseTint(h);
      tints.length = 0;
      if (materials.plush) { releasePlush(hex, { grain }); materials.plush = null; }
      if (badge) { releaseBadge(badge.key); badge = null; }
    },
    get state() { return rt.state; },
    get lean() { return rt.lean; },
    get pose() { return rt.pose; },
    get onCatch() { return userCatch; },
    set onCatch(fn) { userCatch = typeof fn === "function" ? fn : null; },
    takeCatch() { const c = caught; caught = null; return c; },
    anchors: rt.anchors,
    ready: Promise.all([badge ? badge.ready : Promise.resolve(false), meshReady]).then(([drawn]) => drawn),
    meshReady,
    runtime: rt,
  };
}

/* A rider: the critter seated in its floatie, wearing the chip.
   entrant: { name, color, look:{ critter, floatie, hat, shades, pose }, photo?, number?, skin?, groom? }
   Optional second argument: { detail: "race" | "hero" }.
   Additions: setState(state), setStroke(side), setPose(pose) (the critter's;
   the floatie follows: it tilts with strokes, flips while its rider swims,
   dips when a backflip lands), ready. */
export function buildRider(entrant = {}, { detail = "race" } = {}) {
  const look = entrant.look || {};
  const color = normalHex(entrant.color);
  const seed = seedOf(entrant, "rider");
  const floatie = buildFloatie({ floatie: look.floatie, color, entrant: { ...entrant, color }, detail, seed });
  const critter = buildCritter({ critter: look.critter, color, hat: look.hat, shades: look.shades, entrant: { ...entrant, color }, detail, seed, groom: !!entrant.groom });
  critter.setSeat(floatie.seatInfo);
  floatie.seat.add(critter.root);
  const rt = critter.runtime;
  return {
    root: floatie.root, critter, floatie,
    setState: s => critter.setState(s),
    setStroke: side => critter.setStroke(side),
    setPose: p => critter.setPose(p),
    ready: critter.ready,
    update(dt) {
      critter.update(dt);
      const dip = rt.impulse.dip;
      rt.impulse.dip = 0;
      floatie.push(rt.lean, dip + (critter.takeCatch() ? 0.1 : 0));
      floatie.setFlipped(rt.state.swim && !rt.pose);
      floatie.update(dt);
    },
    dispose() { critter.dispose(); floatie.dispose(); },
  };
}

/* A still of a look for the Locker, the lobby and the TV's HUD: a 3/4 bust
   in its hat and shades, wearing the chip, on a transparent background.
   Resolves to a PNG data URL (null without a DOM); cached by look, color,
   skin, number and photo. meshDetail ("race" | "hero", look development):
   which mesh draws it (by default race up to 400 px, hero above). */
export async function riderPortrait(entrant = {}, { size = 256, meshDetail = null } = {}) {
  const { portrait } = await import("./portrait.js");
  return portrait(entrant, { size, meshDetail });
}

/* The medallion alone (an addition): the rider's chip in its gold bezel,
   facing -z, about 0.16 m across. { root, ready, dispose() } */
export function buildMedallion(entrant = {}, { detail = "hero" } = {}) {
  const det = detailOf(detail);
  const badge = acquireBadge({ ...entrant, color: normalHex(entrant.color) });
  const root = new THREE.Group();
  root.name = "medallion";
  root.add(new THREE.Mesh(chipGeometry(det === "hero" ? 64 : 36), badge.material), new THREE.Mesh(bezelGeometry(det), gold()));
  let live = true;
  return { root, ready: badge.ready, dispose() { if (!live) return; live = false; root.parent?.remove(root); releaseBadge(badge.key); } };
}

/* free the portraits' offscreen renderer (its WebGL context); finished
   images stay cached. For the Locker when its sheet closes. */
export async function disposePortraits() {
  const { disposePortraits: dispose } = await import("./portrait.js");
  dispose();
}

/* triangles and meshes drawn in a built object (the showcase and the tests) */
export function artStats(object) {
  let tris = 0, meshes = 0;
  object.updateMatrixWorld?.(true);
  object.traverse(o => {
    if (!o.isMesh) return;
    for (let p = o; p; p = p.parent) if (p.visible === false) return;
    if (o.material?.visible === false) return;
    meshes++;
    /* the fur's shells are one draw of every shell */
    tris += triangles(o.geometry) * (o.geometry.isInstancedBufferGeometry ? o.geometry.instanceCount : 1);
  });
  return { triangles: Math.round(tris), meshes };
}
