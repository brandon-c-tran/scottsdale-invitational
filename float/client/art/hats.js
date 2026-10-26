/* Hats and shades. Each is modelled once for a standard head (0.5 m wide)
   and fitted to a species by its sockets (species.js): where the crown of
   the head is, how big, how it tilts; where the eyes are. */
import * as THREE from "three";

/* a hat as a group on the head bone, or null */
export function buildHat(id, ctx) {
  void ctx;
  if (!id || id === "none") return null;
  return null;
}

/* shades as a group on the head bone, or null */
export function buildShades(id, ctx) {
  void ctx;
  if (!id || id === "none") return null;
  return null;
}

export const HAT_IDS_BUILT = [];
export const SHADE_IDS_BUILT = [];
void THREE;
