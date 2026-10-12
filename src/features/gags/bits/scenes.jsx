/* Each registered bit's scene, by id (registry.js holds the timings).

   THE SCENE CONTRACT: a Scene is a component rendered inside the bit's
   1920 x 1080 layer, on the session's painting. It gets
     { bit, cast, state, mode:"tv"|"phone", reduced, phase }
   where cast is { a:[players], b:[players] } by the bit's roles and phase
   is the session's painting (a scene's own rock or sky can wear the
   painting's inks: class "tv-desert" with data-phase={phase}). It draws
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
/* action movie */
import { ExplosionWalk } from "./explosionwalk.jsx";
import { DontLookBack } from "./dontlookback.jsx";
import { Quicksand } from "./quicksand.jsx";
/* idle (Oct 10): the downtime vignettes */
import { Nap } from "./nap.jsx";
import { Armwrestle } from "./armwrestle.jsx";
import { Saguaro } from "./saguaro.jsx";
import { Pushups } from "./pushups.jsx";
import { Sweep } from "./sweep.jsx";
import { MapBit } from "./map.jsx";
/* the slapstick bits */
import { Springglove } from "./springglove.jsx";
import { Toohype } from "./toohype.jsx";
import { Dynamite } from "./dynamite.jsx";
/* the deadpan desert */
import { Butte } from "./butte.jsx";
import { Sunset } from "./sunset.jsx";
import { Statue } from "./statue.jsx";
import { Vulture } from "./vulture.jsx";
/* the team bits (Oct 12): a side of 3 or more */
import { Dominoes } from "./dominoes.jsx";
import { Tugofwar } from "./tugofwar.jsx";
import { Slowmowalk } from "./slowmowalk.jsx";
import { Pyramid } from "./pyramid.jsx";
import { Teamphoto } from "./teamphoto.jsx";
import { Victorylap } from "./victorylap.jsx";

export const SCENES = Object.freeze({
  quickdraw:Quickdraw,
  anvil:Anvil,
  roadrunner:Roadrunner,
  /* action movie */
  explosionwalk:ExplosionWalk,
  dontlookback:DontLookBack,
  quicksand:Quicksand,
  /* idle */
  nap:Nap,
  armwrestle:Armwrestle,
  saguaro:Saguaro,
  pushups:Pushups,
  sweep:Sweep,
  map:MapBit,
  /* the slapstick bits */
  springglove:Springglove,
  toohype:Toohype,
  dynamite:Dynamite,
  /* the deadpan desert */
  butte:Butte,
  sunset:Sunset,
  statue:Statue,
  vulture:Vulture,
  /* the team bits */
  dominoes:Dominoes,
  tugofwar:Tugofwar,
  slowmowalk:Slowmowalk,
  pyramid:Pyramid,
  teamphoto:Teamphoto,
  victorylap:Victorylap,
});
