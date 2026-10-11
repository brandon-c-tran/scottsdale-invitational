/* Each registered bit's scene, by id (registry.js holds the timings).

   THE SCENE CONTRACT: a Scene is a component rendered inside the bit's
   1920 x 1080 layer, on the session's painting. It gets
     { bit, cast, state, mode:"tv"|"phone", reduced }
   where cast is { a:[players], b:[players] } by the bit's roles. It draws
   with the cast rig (cast/CastChip.jsx) and the props (props/Props.jsx),
   positioned in canvas pixels, and moves only with CSS keyframes delayed
   from the bit's clock: calc(var(--tl) + var(--b-<beat>) + Nms). Every
   animation rides --ba with fill `both`, so each element rests on its end
   state and a frozen bit holds any instant (bits.css). It mounts every
   element at once (nothing appears on a timer), never letters text (the
   stage letters the name and the fact) and never plays sound (the stage
   plays the bit's cues). */
import { Quickdraw } from "./quickdraw.jsx";
import { Anvil } from "./anvil.jsx";
import { Roadrunner } from "./roadrunner.jsx";
/* the slapstick bits */
import { Springglove } from "./springglove.jsx";
import { Toohype } from "./toohype.jsx";

export const SCENES = Object.freeze({
  quickdraw:Quickdraw,
  anvil:Anvil,
  roadrunner:Roadrunner,
  /* the slapstick bits */
  springglove:Springglove,
  toohype:Toohype,
});
