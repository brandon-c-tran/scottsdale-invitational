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
import { chainGeometry, chipGeometry, chipPlace, buildDrink } from "./accessories.js";
import { buildHat, buildShades } from "./hats.js";
import { vinyl, tint, releaseTint, glint, gold, geometry, disposeFloatArt, normalHex, cacheSizes } from "./materials.js";
import { acquireBadge, releaseBadge } from "./badge.js";
import { floatEnvironment, floatLights, disposeFloatEnvironment } from "./environment.js";
import { triangles } from "./sculpt.js";

export { floatEnvironment, floatLights, disposeFloatEnvironment, disposeFloatArt, BUILT_SPECIES, BUILT_FLOATIES, cacheSizes };

/* a species' template, cached by detail ("race" for the screen's pack,
   "hero" for close-ups: the showcase, portraits, the podium) */
const templateOf = (critter, detail) => geometry(`species:${critter}:${detail}`, () => buildSpecies(critter, { detail }));
const detailOf = d => (d === "hero" ? "hero" : "race");
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
  detail = "race", seed = null, groom = false } = {}) {
  const det = detailOf(detail);
  const template = templateOf(critter, det);
  const hex = normalHex(color);
  const tints = [];
  const takeTint = () => { tints.push(hex); return tint(hex); };
  const trunks = takeTint();
  const drink = buildDrink(hex, det); tints.push(hex);
  const rt = new CritterRuntime(template, { materials: { vinyl: vinyl(), tint: trunks, glint: glint() }, seed: seed || seedOf(entrant, critter), drink });
  rt.root.name = `critter:${template.id}`;
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
      if (badge) { releaseBadge(badge.key); badge = null; }
    },
    get state() { return rt.state; },
    get lean() { return rt.lean; },
    get pose() { return rt.pose; },
    get onCatch() { return userCatch; },
    set onCatch(fn) { userCatch = typeof fn === "function" ? fn : null; },
    takeCatch() { const c = caught; caught = null; return c; },
    anchors: rt.anchors,
    ready: badge ? badge.ready : Promise.resolve(false),
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
      floatie.kick({ lean: rt.lean, dip: dip + (critter.takeCatch() ? 0.1 : 0) });
      floatie.setState({ flipped: rt.state.swim && !rt.pose });
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

/* triangles and meshes drawn in a built object (the showcase and the tests) */
export function artStats(object) {
  let tris = 0, meshes = 0;
  object.updateMatrixWorld?.(true);
  object.traverse(o => {
    if (!o.isMesh) return;
    for (let p = o; p; p = p.parent) if (p.visible === false) return;
    meshes++;
    tris += triangles(o.geometry);
  });
  return { triangles: Math.round(tris), meshes };
}
