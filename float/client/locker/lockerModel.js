/* The Locker, pure (LockerPicker.jsx; float/GROOVE.md "The art pipeline":
   the critter and the rider's colour for the weekend; hats, shades and
   floatie designs only if time remains). What it offers (the 13 critters,
   and Winnie for the groom alone: looks.js crittersFor), a pick, and the
   rider the preview draws. The other parts of a look stay in it untouched,
   so they come back when the Locker shows them again. */
import { HATS, POSES, SHADES, cleanLook, crittersFor } from "../../shared/looks.js";
import { FLOATIES, FLOATIE_IDS } from "../../shared/floaties.js";

/* what the Locker shows: the critter (hats, shades, poses and floaties are hidden for now) */
export const LOCKER_TABS = Object.freeze([
  { id:"critter", name:"Critter" },
]);

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
  if (tab === "pose") return POSES;
  return [];
}

export const lockerLook = (look, { groom = false } = {}) => cleanLook(look || {}, { groom, floatieIds:FLOATIE_IDS });

/* the next look after picking `id` in `kind`, or null when nothing changes */
export function pickLook(look, kind, id, { groom = false } = {}) {
  const clean = lockerLook(look, { groom });
  if (!["critter", "floatie", "hat", "shades", "pose"].includes(kind) || clean[kind] === id) return null;
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
  look:{ critter, floatie:entrant.look.floatie, hat:"none", shades:"none", pose:entrant.look.pose } });

export const optionName = (tab, id) => lockerOptions(tab, { groom:true }).find(option => option.id === id)?.name || "";
