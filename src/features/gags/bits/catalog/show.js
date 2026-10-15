/* Win bits whose song lands on the punchline: sunset, statue, victory
   spin, fireworks. cast.a is the winner. */
import { CAMERA_EASE, ONE } from "./common.js";

/* ── sunset: a neon sunset sign, dark, on the horizon. The chip rolls in
   on its edge, a touch past its mark, back onto it. One hop onto the
   mark: the sun's bands light bottom to top, the disc comes on full (the
   song) and the rays ignite one after another. ── */
const SN = { roll:200, stop:1450, settle:1750, hop:2150, press:2390, bands:2420, full:2850, rays:2930, sway:3500 };
const sunset = {
  id:"sunset", name:"Sunset", shape:"win", style:"punchline", ms:4800, beats:SN, still:3800, summary:"bitSpotlight",
  song:{ beat:"full" },
  letter:{ at:SN.full + 220, over:"a", place:"top" },
  camera:{ zoom:1.6, x:560, moves:[
    /* riding along with the roll */
    { at:SN.roll, ms:1300, zoom:1.62, x:1000, ease:"cubic-bezier(.3,.25,.3,1)" },
    /* back for the western's last shot while it settles on the mark */
    { at:SN.settle + 100, ms:900, zoom:1.32, x:1000 },
    /* the sun comes on */
    { at:SN.full, ms:90, zoom:1.38, x:1000, ease:CAMERA_EASE.snap },
    { at:SN.full + 160, ms:1500, zoom:1.24, x:1000 },
  ], shakes:[{ at:SN.full, big:true }] },
  cast:{ a:ONE("winner") },
  cues:[
    { at:SN.roll, sound:"bitRoll", pan:-0.6, opts:{ ms:SN.stop - SN.roll } },
    { at:SN.stop, sound:"bitRoll", pan:0.1, opts:{ ms:300, small:true } },
    { at:SN.settle, sound:"bitSpinDown", pan:0.05, opts:{ small:true } },
    { at:SN.hop, sound:"bitHop", pan:0.05, opts:{ step:0 } },
    { at:SN.press, sound:"bitSwitch", pan:0.05 },
    { at:SN.bands, sound:"neonBuzz", pan:0.05, opts:{ ms:SN.full - SN.bands, up:true } },
    { at:SN.full, sound:"bitSpotlight", pan:0.05 },
    { at:SN.rays, sound:"bitTwinkle", pan:-0.5 },
    { at:SN.rays + 280, sound:"bitTwinkle", pan:0.05, opts:{ step:1 } },
    { at:SN.rays + 560, sound:"bitTwinkle", pan:0.5, opts:{ step:2 } },
  ],
};

/* ── statue: a seam lights under the chip; a marble plinth comes up out
   of the floor in three cuts, the chip riding up on it, startled. At the
   top it looks round. A spotlight clunks on and finds it (the song): it
   strikes a pose, chin up, and sparkles go off. ── */
const ST = { seam:450, down:600, rise1:1000, rise2:1350, rise3:1700, look:1950, spot:2700, sparkle:2820 };
const statue = {
  id:"statue", name:"Statue", shape:"win", style:"punchline", ms:4500, beats:ST, still:3600, summary:"bitSpotlight",
  song:{ beat:"spot" },
  letter:{ at:ST.spot + 200, over:"a", place:"top-left" },
  camera:{ zoom:1.8, x:1040, moves:[
    /* back as it goes up, to keep it and the rig in the shot */
    { at:ST.rise1 - 60, ms:900, zoom:1.48, x:1060 },
    /* the light finds it */
    { at:ST.spot, ms:90, zoom:1.58, x:1080, ease:CAMERA_EASE.snap },
    { at:ST.spot + 160, ms:1300, zoom:1.4, x:1000 },
  ], shakes:[{ at:ST.rise1 }, { at:ST.rise2 }, { at:ST.rise3 }, { at:ST.spot, big:true }] },
  cast:{ a:ONE("winner") },
  cues:[
    { at:ST.seam, sound:"neonBuzz", pan:0.15, opts:{ ms:300, up:true } },
    { at:ST.rise1, sound:"bitHydraulic", pan:0.15, opts:{ step:0 } },
    { at:ST.rise2, sound:"bitHydraulic", pan:0.15, opts:{ step:1 } },
    { at:ST.rise3, sound:"bitHydraulic", pan:0.15, opts:{ step:2 } },
    { at:ST.look, sound:"bitSqueakSoft", pan:0.1 },
    { at:ST.spot, sound:"bitSpotlight", pan:0.3 },
    { at:ST.sparkle, sound:"bitTwinkle", pan:-0.1 },
    { at:ST.sparkle + 380, sound:"bitTwinkle", pan:0.4, opts:{ step:1 } },
  ],
};

/* ── victory spin: the chip winds up and spins on its edge, faster and
   faster, sparks spraying off the floor; at full speed (the song) it is a
   lit blur lifted off the floor in a shower of sparks; then it stops
   dead, facing the room, and leans back. ── */
const VS = { wind:300, go:700, sparks:1250, blur:1800, full:2300, stop:3500, land:3800, proud:3950 };
const victoryspin = {
  id:"victoryspin", name:"Victory spin", shape:"win", style:"punchline", ms:4700, beats:VS, still:3300, summary:"bitSparks",
  song:{ beat:"full" },
  letter:{ at:VS.full + 200, over:"a", place:"top-left" },
  camera:{ zoom:1.8, x:960, moves:[
    /* pushing in as it winds up to speed */
    { at:VS.go, ms:VS.full - VS.go, zoom:2, x:960, ease:"cubic-bezier(.5,0,.9,.6)" },
    /* full speed */
    { at:VS.full, ms:90, zoom:2.14, x:960, ease:CAMERA_EASE.snap },
    /* back out for the stop */
    { at:VS.stop, ms:500, zoom:1.86, x:960 },
  ], shakes:[{ at:VS.full, big:true }, { at:VS.land }] },
  cast:{ a:ONE("winner") },
  cues:[
    { at:VS.wind, sound:"bitRatchet", pan:0 },
    { at:VS.go, sound:"bitTwirl", pan:0 },
    { at:VS.go + 200, sound:"bitRoll", pan:0, opts:{ ms:VS.full - VS.go - 200 } },
    { at:VS.sparks, sound:"bitSparks", pan:0, opts:{ ms:VS.stop - VS.sparks } },
    { at:VS.full, sound:"bitShing", pan:0 },
    { at:VS.stop, sound:"bitSkid", pan:0 },
    { at:VS.land, sound:"bitThud", pan:0, opts:{ small:true } },
    { at:VS.proud, sound:"bitGleam", pan:0 },
  ],
};

/* ── fireworks: the first rocket fizzles, a sad puff, and the chip sags.
   The second BANGS into a huge burst in the chip's own color (the song)
   and it leaps; more bursts, a bounce on each, a finale of two. ── */
const FW = { launch:300, look:350, dud:820, droop:1000, launch1:1450, bang1:2000, launch2:2150, bang2:2550, launch3:2450, bang3:2850,
  launch4:2800, bang4:3250 };
const fireworks = {
  id:"fireworks", name:"Fireworks", shape:"win", style:"punchline", ms:4800, beats:FW, still:3700, summary:"bitBang",
  song:{ beat:"bang1" },
  letter:{ at:FW.bang1 + 250, over:"a", place:"top-left" },
  camera:{ zoom:1.6, x:980, moves:[
    /* up with the first rocket */
    { at:FW.look, ms:550, zoom:1.5, x:1000 },
    /* back for the sky as the second goes up */
    { at:FW.launch1, ms:500, zoom:1.42, x:1080 },
    /* the bang */
    { at:FW.bang1, ms:90, zoom:1.5, x:1080, ease:CAMERA_EASE.snap },
    { at:FW.bang1 + 160, ms:1100, zoom:1.4, x:1100 },
  ], shakes:[{ at:FW.bang1, big:true }, { at:FW.bang2 }, { at:FW.bang3 }, { at:FW.bang4, big:true }] },
  cast:{ a:ONE("winner") },
  cues:[
    { at:FW.launch, sound:"bitFirework", pan:0.25, opts:{ ms:FW.dud - FW.launch, small:true } },
    { at:FW.dud, sound:"bitPuff", pan:0.2 },
    { at:FW.dud + 480, sound:"bitTink", pan:0.25 },
    { at:FW.droop, sound:"bitDroop", pan:-0.15 },
    { at:FW.launch1, sound:"bitFirework", pan:0.3, opts:{ ms:FW.bang1 - FW.launch1 } },
    { at:FW.bang1, sound:"bitBang", pan:0.3 },
    { at:FW.bang1 + 300, sound:"bitCrackle", pan:0.3, opts:{ ms:700 } },
    { at:FW.launch2, sound:"bitLaunch", pan:0.5, opts:{ small:true } },
    { at:FW.bang2, sound:"bitBang", pan:0.6, opts:{ step:1 } },
    { at:FW.bang3, sound:"bitBang", pan:0.05, opts:{ step:2 } },
    { at:FW.launch4, sound:"bitLaunch", pan:0.4, opts:{ small:true } },
    { at:FW.bang4, sound:"bitBoomChain", pan:0.5 },
    { at:FW.bang4 + 300, sound:"bitCrackle", pan:0.55, opts:{ ms:1000 } },
  ],
};

export const SHOW = [sunset, statue, victoryspin, fireworks];
