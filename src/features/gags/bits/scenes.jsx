/* Each registered bit's scene, by id (registry.js holds the timings; each
   group of the catalog keeps its scenes in scenes-<group>.jsx).

   THE SCENE CONTRACT: a Scene is a component rendered inside the bit's
   1920 x 1080 layer, on the session's painting gone to night. It gets
     { bit, cast, state, mode:"tv"|"phone", reduced, phase }
   where cast is { a:[players], b:[players] } by the bit's roles. It draws
   in neon (neon/Neon.jsx: NeonChip, HouseHand, Neon; neon/NeonProps.jsx),
   positioned in canvas pixels, and moves only with CSS keyframes delayed
   from the bit's clock: calc(var(--tl) + var(--b-<beat>) + Nms). Every
   animation rides --ba with fill `both`, so each element rests on its end
   state and a frozen bit holds any instant (bits.css). It mounts every
   element at once (nothing appears on a timer), never letters text (the
   stage letters the name and the fact), never plays sound (the stage
   plays the bit's cues), and draws no hand but the house's: the chips act
   by moving alone. A scene may name its camera's anchors (Scene.anchors). */
import { UPSET_SCENES } from "./scenes-upset.jsx";
import { MUSIC_SCENES } from "./scenes-music.jsx";
import { SHOW_SCENES } from "./scenes-show.jsx";
import { LOSS_SCENES } from "./scenes-loss.jsx";
import { TEAM_SCENES } from "./scenes-team.jsx";
import { IDLE_SCENES } from "./scenes-idle.jsx";

export const SCENES = Object.freeze({ ...UPSET_SCENES, ...MUSIC_SCENES, ...SHOW_SCENES, ...LOSS_SCENES, ...TEAM_SCENES, ...IDLE_SCENES });
