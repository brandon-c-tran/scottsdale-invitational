/* The art API (float/PROTOCOL.md "Art"): glossy vinyl toys. Desert critters
   as chunky collectible figurines in pool floaties, each wearing a gold
   chain with the rider's chip.

   Everything returns three.js objects in metres, y up, the rider facing -z
   (downstream when the screen turns it). A floatie's origin is the water
   line under its centre. Nothing here reads the network except a rider's
   own photo (entrant.photo, same origin) for the chip's face.

   The vinyl needs something to reflect: set
     scene.environment = floatEnvironment(renderer, "night")
   on the screen (floatLights("night") is a matching light rig).

   Signatures (kept from the stub):
     buildFloatie({ floatie, color }) -> { root, seat, update(dt), dispose() }
     buildCritter({ critter, color }) -> { root, setStroke(side), setState(state), setPose(pose), update(dt), dispose() }
     buildRider(entrant) -> { root, critter, floatie, update(dt), dispose() }
     riderPortrait(entrant, { size }) -> Promise<PNG data URL>
   Additions are documented where they are defined. */
import * as THREE from "three";
import { buildSpecies, BUILT_SPECIES } from "./species.js";
import { CritterRuntime } from "./critter.js";
import { buildFloatieArt, BUILT_FLOATIES } from "./floatie3d.js";
import { chainGeometry, chipGeometry, chipPlace, buildDrink, bezelGeometry } from "./accessories.js";
import { buildHat, buildShades } from "./hats.js";
import { vinyl, tint, releaseTint, glint, gold, geometry, disposeFloatArt, normalHex, cacheSizes, setFloatArtQuality, floatArtQuality } from "./materials.js";
import { acquireBadge, releaseBadge } from "./badge.js";
import { floatEnvironment, floatLights, disposeFloatEnvironment } from "./environment.js";
import { triangles } from "./sculpt.js";
import { bakedTemplate, hasBaked, bakedFile, BAKED_SPECIES } from "./critterTemplate.js";
import { loadCritterGeometry, critterGeometryNow, setCritterSource } from "./critterAsset.js";
import { plush, releasePlush, furMaterial } from "./plush.js";

export { floatEnvironment, floatLights, disposeFloatEnvironment, disposeFloatArt, BUILT_SPECIES, BUILT_FLOATIES, BAKED_SPECIES, cacheSizes, setFloatArtQuality, floatArtQuality, setCritterSource };

/* a species' template, cached by detail ("race" for the screen's pack,
   "hero" for close-ups: the showcase, portraits, the podium). A baked
   species (a soft plush, critterMeta.js) is a skeleton and anchors whose
   mesh loads from its file; the rest are built by the first pass's kit.
   version 1 asks for the first pass even where a bake exists (the
   showcase's side-by-side). */
const templateOf = (critter, detail, version = 2) => (version !== 1 && hasBaked(critter)
  ? geometry(`species2:${critter}:${detail}`, () => bakedTemplate(critter, detail))
  : geometry(`species:${critter}:${detail}`, () => buildSpecies(critter, { detail })));
const detailOf = d => (d === "hero" ? "hero" : "race");
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
   water, for splashes), ready (resolves when the chip's photo is drawn),
   state, lean (this frame's stroke lean, signed). */
export function buildCritter({ critter = "capybara", color = "#9aa39e", hat = "none", shades = "none", entrant = null, medallion = true,
  detail = "race", seed = null, groom = false, version = 2 } = {}) {
  const det = detailOf(detail);
  const template = templateOf(critter, det, version);
  const baked = template.version === 2;
  const hex = normalHex(color);
  const tints = [];
  const takeTint = () => { tints.push(hex); return tint(hex); };
  const grain = det === "hero" ? 0.22 : 0;
  const materials = baked ? { plush: plush(hex, { grain }), fur: furMaterial(det) } : { vinyl: vinyl(), tint: takeTint(), glint: glint() };
  const drink = buildDrink(hex, det); tints.push(hex);
  const rt = new CritterRuntime(template, { materials, seed: seed || seedOf(entrant, critter), drink });
  rt.root.name = `critter:${template.id}`;
  /* a baked mesh: there now if a rider of this species already loaded it,
     else it pops in when it arrives */
  let meshReady = Promise.resolve(true);
  if (baked) {
    const now = critterGeometryNow(template.key);
    if (now) { rt.attach(now); rt.pop = 1; }
    else {
      rt.holdPlace(template.bounds);
      meshReady = loadCritterGeometry(template.key, template.id, template.detail, template.file)
        .then(geo => { rt.attach(geo); return true; })
        .catch(error => { warnOnce(template.key, error); return false; });
    }
  }
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
  if (hatObj) rt.b.head.add(hatObj);
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
      if (baked && materials.plush) { releasePlush(hex, { grain }); materials.plush = null; }
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
export function buildRider(entrant = {}, { detail = "race", version = 2 } = {}) {
  const look = entrant.look || {};
  const color = normalHex(entrant.color);
  const seed = seedOf(entrant, "rider");
  const floatie = buildFloatie({ floatie: look.floatie, color, entrant: { ...entrant, color }, detail, seed });
  const critter = buildCritter({ critter: look.critter, color, hat: look.hat, shades: look.shades, entrant: { ...entrant, color }, detail, seed, groom: !!entrant.groom, version });
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
   skin, number and photo. */
export async function riderPortrait(entrant = {}, { size = 256 } = {}) {
  const { portrait } = await import("./portrait.js");
  return portrait(entrant, { size });
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
