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

/* the hat rack (float/GROOVE.md v3 "A cuter, cooler hat rack"), in the
   order the Locker offers them */
export const HATS = Object.freeze([
  { id:"none", name:"None" },
  { id:"froggy", name:"Frog hat" },
  { id:"beanie", name:"Beanie" },
  { id:"propeller", name:"Propeller" },
  { id:"tophat", name:"Top hat" },
  { id:"viking", name:"Viking" },
  { id:"mushroom", name:"Mushroom" },
  { id:"fishing", name:"Fishing hat" },
  { id:"sunhat", name:"Sun hat" },
  { id:"halo", name:"Halo" },
  { id:"cowboy", name:"Cowboy" },
  { id:"party", name:"Party" },
  /* the groom's alone (an entrant with groom:true) */
  { id:"crown", name:"Crown", groom:true },
]);

export const SHADES = Object.freeze([
  { id:"none", name:"None" },
  { id:"hearts", name:"Hearts" },
  { id:"stars", name:"Stars" },
  { id:"pixel", name:"Pixel" },
  { id:"round", name:"Round" },
  { id:"threed", name:"3D" },
  { id:"snorkel", name:"Snorkel" },
  { id:"aviators", name:"Aviators" },
]);

/* ids saved before the v3 rack, each drawn and cleaned as the nearest one on it */
export const RETIRED_HATS = Object.freeze({ bucket:"fishing", visor:"sunhat", captain:"tophat", flowers:"halo" });
export const RETIRED_SHADES = Object.freeze({ goggles:"snorkel" });
export const retiredHat = id => RETIRED_HATS[id] || id;
export const retiredShades = id => RETIRED_SHADES[id] || id;

/* what the critter wears (float/GROOVE.md "Looks, the Groove"): the photo
   tee is tinted the rider's colour with their profile photo printed on the
   chest, so it needs a photo; without one it draws as none */
export const SHIRTS = Object.freeze([
  { id:"none", name:"None" },
  { id:"photo", name:"Photo tee" },
]);

/* the victory pose, played on the podium */
export const POSES = Object.freeze([
  { id:"flex", name:"Flex" },
  { id:"chug", name:"Chug" },
  { id:"airguitar", name:"Air guitar" },
  { id:"backflip", name:"Backflip" },
]);

/* critters only one rider may pick (float/GROOVE.md "Special critters"):
   Winnie, Brandon's own cavapoo, is the groom's alone. Never a default and
   never a bot. */
export const SPECIAL_CRITTERS = Object.freeze([
  { id:"winnie", name:"Winnie", groom:true },
]);

const ids = list => list.map(item => item.id);
export const CRITTER_IDS = Object.freeze(ids(CRITTERS));
export const SPECIAL_CRITTER_IDS = Object.freeze(ids(SPECIAL_CRITTERS));
/* every critter the art draws */
export const ALL_CRITTER_IDS = Object.freeze([...CRITTER_IDS, ...SPECIAL_CRITTER_IDS]);
/* the critters a rider may pick: the 13, and the groom's own */
export const crittersFor = ({ groom = false } = {}) =>
  [...CRITTERS, ...SPECIAL_CRITTERS.filter(item => !item.groom || groom)];
/* the ids on the rack (a retired one is cleaned to its new id) */
export const HAT_IDS = Object.freeze(ids(HATS));
export const SHADE_IDS = Object.freeze(ids(SHADES));
export const SHIRT_IDS = Object.freeze(ids(SHIRTS));
export const POSE_IDS = Object.freeze(ids(POSES));

/* the look a rider gets before they pick: seeded by any string (a device or
   player id), so a screen and a phone agree on a default */
export function defaultLook(seed = "", floatieIds = ["classic"]) {
  let h = 2166136261;
  for (const ch of String(seed)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  const pick = (list, salt) => list[(Math.abs(h + salt * 7919) >>> 0) % list.length];
  return { critter:pick(CRITTER_IDS, 1), floatie:pick(floatieIds, 2), hat:"none", shades:"none", shirt:"none", pose:pick(POSE_IDS, 3) };
}

/* a look made legal: unknown ids fall back, a retired hat or pair is the
   nearest on the rack, the crown and Winnie only for the groom; a groom
   who never picked a hat wears the crown ("none" is no hat, his too) */
export function cleanLook(look, { groom = false, floatieIds = ["classic"], seed = "" } = {}) {
  const fallback = defaultLook(seed, floatieIds);
  const one = (value, list, key) => list.includes(value) ? value : fallback[key];
  const unset = look?.hat === undefined || look?.hat === null || look?.hat === "";
  const hat = groom && unset ? "crown" : one(retiredHat(look?.hat), HAT_IDS, "hat");
  const critters = groom ? ALL_CRITTER_IDS : CRITTER_IDS;
  return {
    critter:one(look?.critter, critters, "critter"),
    floatie:one(look?.floatie, floatieIds, "floatie"),
    hat:hat === "crown" && !groom ? "none" : hat,
    shades:one(retiredShades(look?.shades), SHADE_IDS, "shades"),
    shirt:one(look?.shirt, SHIRT_IDS, "shirt"),
    pose:one(look?.pose, POSE_IDS, "pose"),
  };
}
