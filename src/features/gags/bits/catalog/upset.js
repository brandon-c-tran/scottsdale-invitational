/* Upsets (versus, a 1 v 1; the song lands on the hit): standoff,
   flipper, rockslide. cast.a is the long shot who won, cast.b the
   favorite. */
import { CAMERA_EASE, ONE } from "./common.js";

/* ── standoff: high noon in neon. The two chips face off across the
   floor; a tumbleweed rolls through. The house hand reaches in behind
   the long shot, cocks a finger, and FLICKS it: the long shot skims
   across, glances off the favorite (who spins on its edge) and ricochets
   up into the favorite's own tall stack of chips. The stack goes over
   like a tree, flat on the favorite. The long shot comes down on top of
   the pile and spins itself out. ── */
const SO = { tumble:100, lean:1150, bob:1350, reach:1450, set:1900, flick:2150, ping:2330, hit:2620, crash:3000, settle:3250,
  rest:4250 };
const standoff = {
  id:"standoff", name:"Standoff", shape:"versus", style:"punchline", ms:5000, beats:SO, still:4500, summary:"bitRicochet",
  song:{ beat:"hit" },
  letter:{ at:SO.crash + 200, over:"a", place:"top-left" },
  camera:{ zoom:1.5, x:"mid", fit:true, moves:[
    /* lean in through the standoff */
    { at:300, ms:1100, zoom:1.6 },
    /* over to the long shot as the hand comes in behind it */
    { at:SO.reach, ms:450, zoom:1.72, x:"a" },
    /* out with the flick */
    { at:SO.flick, ms:160, zoom:1.48, x:"mid", ease:CAMERA_EASE.whip },
    /* the hit, on the stack */
    { at:SO.hit, ms:90, zoom:1.7, x:"stack", ease:CAMERA_EASE.snap },
    /* settle on the pile */
    { at:SO.crash + 120, ms:700, zoom:1.62, x:"pile" },
  ], shakes:[{ at:SO.ping }, { at:SO.hit, big:true }, { at:SO.crash }], washes:[SO.hit] },
  cast:{ a:ONE("winner"), b:ONE("beaten") },
  cues:[
    { at:0, sound:"bitWind", pan:0, opts:{ ms:SO.flick } },
    { at:SO.tumble + 380, sound:"bitHop", pan:0.5, opts:{ step:0, small:true } },
    { at:SO.tumble + 820, sound:"bitHop", pan:0.15, opts:{ step:1, small:true } },
    { at:SO.tumble + 1260, sound:"bitHop", pan:-0.25, opts:{ step:2, small:true } },
    { at:SO.reach, sound:"bitStreak", pan:-0.6, opts:{ from:-0.9, to:-0.4 } },
    { at:SO.set, sound:"neonBuzz", pan:-0.4, opts:{ ms:250 } },
    { at:SO.flick, sound:"neonFlick", pan:-0.35 },
    { at:SO.flick + 20, sound:"bitStreak", pan:-0.1, opts:{ from:-0.4, to:0.2 } },
    { at:SO.ping, sound:"bitRicochet", pan:0.15 },
    { at:SO.hit, sound:"bitClatter", pan:0.4, opts:{ ms:360, dir:-1 } },
    { at:SO.crash, sound:"bitThud", pan:0.25 },
    { at:SO.crash + 60, sound:"bitChipDrop", pan:0.55, opts:{ step:0 } },
    { at:SO.crash + 180, sound:"bitChipDrop", pan:-0.05, opts:{ step:1 } },
    { at:SO.settle, sound:"bitSpinDown", pan:0.2 },
  ],
};

export const UPSET = [standoff];
