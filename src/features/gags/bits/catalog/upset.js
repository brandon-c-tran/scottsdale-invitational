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

/* ── flipper: a pinball backglass. The long shot drops out of the sky
   onto a flipper like a ball put in play and rolls down it; the house
   hand presses the button; the flipper fires it across the floor into
   the favorite (the smash), who pings off two bumpers, DING DING, and
   drops seeing stars while the table's lamps chase. ── */
const FP = { drop:250, land:520, roll:700, reach:750, bob:1050, press:1400, fire:1460, smash:1760, ding:1910, ding2:2100,
  aland:2200, bland:2370, stars:2450, release:2550 };
const flipper = {
  id:"flipper", name:"Flipper", shape:"versus", style:"punchline", ms:4400, beats:FP, still:3000, summary:"bitFlipper",
  song:{ beat:"smash" },
  letter:{ at:FP.smash + 260, over:"a", place:"top-left" },
  camera:{ zoom:1.3, x:"mid", fit:true, moves:[
    /* in on the flipper as the hand comes down over the button */
    { at:FP.roll, ms:620, zoom:1.6, x:"flip" },
    /* out with the shot */
    { at:FP.fire, ms:220, zoom:1.32, x:"mid", ease:CAMERA_EASE.whip },
    /* the smash, on B */
    { at:FP.smash, ms:90, zoom:1.56, x:"b", ease:CAMERA_EASE.snap },
    /* back for the bumpers and the table lit */
    { at:FP.smash + 260, ms:700, zoom:1.36, x:"end" },
  ], shakes:[{ at:FP.fire }, { at:FP.smash, big:true }, { at:FP.ding }, { at:FP.ding2 }], washes:[FP.smash] },
  cast:{ a:ONE("winner"), b:ONE("beaten") },
  cues:[
    { at:FP.drop + 40, sound:"bitFall", pan:-0.5 },
    { at:FP.land, sound:"bitBounce", pan:-0.55 },
    { at:FP.land + 200, sound:"bitRoll", pan:-0.5, opts:{ ms:FP.fire - FP.land - 200 } },
    { at:FP.reach, sound:"bitStreak", pan:-0.8, opts:{ from:-0.9, to:-0.7 } },
    { at:FP.press, sound:"bitClick", pan:-0.8 },
    { at:FP.fire, sound:"bitFlipper", pan:-0.55 },
    { at:FP.fire + 20, sound:"bitZip", pan:-0.2 },
    { at:FP.smash, sound:"bitPow", pan:0.25 },
    { at:FP.ding, sound:"bitBumper", pan:0.6 },
    { at:FP.ding2, sound:"bitBumper", pan:0.45, opts:{ step:1 } },
    { at:FP.aland, sound:"bitHop", pan:0.1, opts:{ step:0 } },
    { at:FP.bland, sound:"bitThud", pan:0.55 },
    { at:FP.stars, sound:"bitStars", pan:0.55, opts:{ ms:1200 } },
  ],
};

/* ── rockslide: a neon mesa. The long shot stands on top beside a
   boulder bigger than it is; the favorite stands smug at the foot of the
   cliff. The tiniest nudge, a hop and a bump: the boulder creeps to the
   edge, teeters (the favorite looks up, too late) and lands on it (the
   song). Dust both ways. The long shot leans over to look. ── */
const RK = { look:350, bob:550, nudge:1150, bump:1300, creep:1320, teeter:1920, notice:2020, sweat:2180, tip:2500, land:2730,
  settle:2800, peek:3150, shrug:3750 };
const rockslide = {
  id:"rockslide", name:"Rockslide", shape:"versus", style:"punchline", ms:4400, beats:RK, still:3700, summary:"bitRumble",
  song:{ beat:"land" },
  letter:{ at:RK.land + 220, over:"a", place:"top-right" },
  camera:{ zoom:1.4, x:"mid", fit:true, moves:[
    /* up top for the nudge */
    { at:RK.look + 300, ms:700, zoom:1.52, x:"top" },
    /* over to the edge and B under it while it teeters */
    { at:RK.teeter - 200, ms:600, zoom:1.5, x:"drop" },
    /* the landing */
    { at:RK.land, ms:90, zoom:1.56, x:"hit", ease:CAMERA_EASE.snap },
    /* back for the pancake and the long shot looking down */
    { at:RK.land + 320, ms:800, zoom:1.44, x:"after" },
  ], shakes:[{ at:RK.bump }, { at:RK.land, big:true }, { at:RK.settle + 90 }], washes:[RK.land] },
  cast:{ a:ONE("winner"), b:ONE("beaten") },
  cues:[
    { at:RK.bob, sound:"bitHop", pan:0.05, opts:{ step:0, small:true } },
    { at:RK.bob + 240, sound:"bitHop", pan:0.05, opts:{ step:1, small:true } },
    { at:RK.nudge, sound:"bitHop", pan:-0.5, opts:{ step:2 } },
    { at:RK.bump, sound:"bitPoke", pan:-0.25 },
    { at:RK.creep + 40, sound:"bitRumble", pan:-0.15, opts:{ ms:RK.teeter - RK.creep } },
    { at:RK.teeter, sound:"bitCreak", pan:-0.08, opts:{ ms:420 } },
    { at:RK.notice, sound:"neonBuzz", pan:0.05, opts:{ ms:180, up:true } },
    { at:RK.tip, sound:"bitFall", pan:0 },
    { at:RK.land, sound:"bitSlam", pan:0.05 },
    { at:RK.land + 30, sound:"bitCrumble", pan:0.05 },
    { at:RK.settle + 90, sound:"bitThud", pan:0.05, opts:{ small:true } },
    { at:RK.shrug, sound:"bitHop", pan:-0.5, opts:{ step:0, small:true } },
  ],
};

export const UPSET = [standoff, flipper, rockslide];
