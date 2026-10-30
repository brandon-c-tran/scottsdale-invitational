/* The Locker, pure (LockerPicker.jsx; float/GROOVE.md "Looks, the
   Groove"): the critter (the 13, and Winnie for the groom alone:
   looks.js crittersFor), a hat (the crown the groom's alone), glasses,
   and the photo tee only for a rider with a photo (it prints the photo).
   What it offers, a pick, and the rider the preview draws. The other parts
   of a look stay in it untouched, so they come back when the Locker shows
   them again. */
import { HATS, POSES, SHADES, SHIRTS, cleanLook, crittersFor } from "../../shared/looks.js";
import { FLOATIES, FLOATIE_IDS } from "../../shared/floaties.js";

/* what the Locker shows: the critter, a hat, glasses, and the tee (with a photo; poses and floaties are hidden) */
export const LOCKER_TABS = Object.freeze([
  { id:"critter", name:"Critter" },
  { id:"hat", name:"Hat" },
  { id:"shades", name:"Glasses" },
  { id:"shirt", name:"Tee" },
]);
export const lockerTabs = ({ photo = null } = {}) => LOCKER_TABS.filter(tab => tab.id !== "shirt" || !!photo);

/* a preview without the rider's colour is drawn in this */
export const LOCKER_NEUTRAL = "#aab6c2";

export function lockerOptions(tab, { groom = false } = {}) {
  if (tab === "critter") return crittersFor({ groom });
  if (tab === "floatie") return FLOATIES;
  if (tab === "hat") {
    const hats = HATS.filter(hat => !hat.groom || groom);
    return groom ? [...hats.filter(hat => hat.groom), ...hats.filter(hat => !hat.groom)] : hats;
  }
  if (tab === "shades") return SHADES;
  if (tab === "shirt") return SHIRTS;
  if (tab === "pose") return POSES;
  return [];
}

export const lockerLook = (look, { groom = false } = {}) => cleanLook(look || {}, { groom, floatieIds:FLOATIE_IDS });

/* the next look after picking `id` in `kind`, or null when nothing changes */
export function pickLook(look, kind, id, { groom = false } = {}) {
  const clean = lockerLook(look, { groom });
  if (!["critter", "floatie", "hat", "shades", "shirt", "pose"].includes(kind) || clean[kind] === id) return null;
  if (!lockerOptions(kind, { groom }).some(option => option.id === id)) return null;
  return lockerLook({ ...clean, [kind]:id }, { groom });
}

/* a critter's name (Winnie's too) */
export const critterName = id => crittersFor({ groom:true }).find(c => c.id === id)?.name || "";

/* the rider the preview draws: the look on the rider's own colour and chip */
export function lockerEntrant({ look, color = null, name = "", photo = null, number = null, skin = null, groom = false } = {}) {
  return { name, color:color || LOCKER_NEUTRAL, look:lockerLook(look, { groom }),
    ...(photo ? { photo } : {}), ...(number !== null && number !== undefined ? { number } : {}), ...(skin ? { skin } : {}),
    ...(groom ? { groom:true } : {}) };
}

/* a critter's tile draws just the critter, so the tiles render once and
   nothing else about the rider redraws them */
export const critterTile = (entrant, critter) => ({ ...entrant, photo:undefined, number:undefined,
  look:{ critter, floatie:entrant.look.floatie, hat:"none", shades:"none", shirt:"none", pose:entrant.look.pose } });
/* a hat, glasses or tee tile: the rider's critter wearing just that (the
   tee's photo only on the tee's own tiles) */
export const lookTile = (entrant, kind, id) => {
  const plain = critterTile(entrant, entrant.look.critter);
  return { ...plain, ...(kind === "shirt" && entrant.photo ? { photo:entrant.photo } : {}), look:{ ...plain.look, [kind]:id } };
};

export const optionName = (tab, id) => tab === "critter" ? critterName(id) : lockerOptions(tab, { groom:true }).find(option => option.id === id)?.name || "";
