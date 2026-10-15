/* What every catalog entry shares (bits/registry.js holds the contract). */
import { CAMERA_EASE } from "../camera.js";

export { CAMERA_EASE };
/* a moment bit's length; idle vignettes run longer */
export const MOMENT_MS = Object.freeze({ min:3000, max:5500 });
export const IDLE_MS = Object.freeze({ min:6000, max:10000 });
/* team bits (a side of 2 to 7: the doubles to the full court's 7 v 6) */
export const TEAM_MIN = 2;
export const TEAM_MAX = 7;
/* a solo bit's side: one chip */
export const ONE = role => ({ role, max:1 });
/* a team bit's side: one to seven chips */
export const SIDE = role => ({ role, min:1, max:TEAM_MAX });
/* the room, for an idle vignette: the first `n` present */
export const ROOM = n => ({ a:{ role:"room", max:n } });
/* three hops' worth of cues at `at`, `gap` apart */
export const hops = (at, n, gap, pan = 0, sound = "bitHop") =>
  Array.from({ length:n }, (_, i) => ({ at:at + i * gap, sound, pan, opts:{ step:i } }));
