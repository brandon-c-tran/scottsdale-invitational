/* What a rider looks like (float/PROTOCOL.md "Looks"). Pure ids and names,
   shared by the room (validation), the Locker, the art and Field Day's
   profile. Cosmetic only: nothing here changes how a rider paddles. */

export const CRITTERS = Object.freeze([
  { id:"capybara", name:"Capybara" },
  { id:"javelina", name:"Javelina" },
  { id:"roadrunner", name:"Roadrunner" },
  { id:"jackrabbit", name:"Jackrabbit" },
  { id:"tortoise", name:"Tortoise" },
  { id:"gila", name:"Gila Monster" },
  { id:"hornedlizard", name:"Horned Lizard" },
  { id:"bighorn", name:"Bighorn" },
  { id:"quail", name:"Quail" },
  { id:"armadillo", name:"Armadillo" },
  { id:"coyote", name:"Coyote" },
  { id:"otter", name:"Otter" },
  { id:"frog", name:"Frog" },
]);

export const HATS = Object.freeze([
  { id:"none", name:"None" },
  { id:"cowboy", name:"Cowboy" },
  { id:"bucket", name:"Bucket" },
  { id:"visor", name:"Visor" },
  { id:"captain", name:"Captain" },
  { id:"party", name:"Party" },
  { id:"flowers", name:"Flower crown" },
  /* the groom's alone (an entrant with groom:true) */
  { id:"crown", name:"Crown", groom:true },
]);

export const SHADES = Object.freeze([
  { id:"none", name:"None" },
  { id:"aviators", name:"Aviators" },
  { id:"hearts", name:"Hearts" },
  { id:"stars", name:"Stars" },
  { id:"goggles", name:"Goggles" },
]);

/* the victory pose, played on the podium */
export const POSES = Object.freeze([
  { id:"flex", name:"Flex" },
  { id:"chug", name:"Chug" },
  { id:"airguitar", name:"Air guitar" },
  { id:"backflip", name:"Backflip" },
]);

const ids = list => list.map(item => item.id);
export const CRITTER_IDS = Object.freeze(ids(CRITTERS));
export const HAT_IDS = Object.freeze(ids(HATS));
export const SHADE_IDS = Object.freeze(ids(SHADES));
export const POSE_IDS = Object.freeze(ids(POSES));

/* the look a rider gets before they pick: seeded by any string (a device or
   player id), so a screen and a phone agree on a default */
export function defaultLook(seed = "", floatieIds = ["classic"]) {
  let h = 2166136261;
  for (const ch of String(seed)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  const pick = (list, salt) => list[(Math.abs(h + salt * 7919) >>> 0) % list.length];
  return { critter:pick(CRITTER_IDS, 1), floatie:pick(floatieIds, 2), hat:"none", shades:"none", pose:pick(POSE_IDS, 3) };
}

/* a look made legal: unknown ids fall back, the crown only for the groom */
export function cleanLook(look, { groom = false, floatieIds = ["classic"], seed = "" } = {}) {
  const fallback = defaultLook(seed, floatieIds);
  const one = (value, list, key) => list.includes(value) ? value : fallback[key];
  const hat = one(look?.hat, HAT_IDS, "hat");
  return {
    critter:one(look?.critter, CRITTER_IDS, "critter"),
    floatie:one(look?.floatie, floatieIds, "floatie"),
    hat:hat === "crown" && !groom ? "none" : hat,
    shades:one(look?.shades, SHADE_IDS, "shades"),
    pose:one(look?.pose, POSE_IDS, "pose"),
  };
}
