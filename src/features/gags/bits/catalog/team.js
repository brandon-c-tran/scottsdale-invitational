/* Team bits (a side of 2 to 7): dominoes, tug of war, slow-mo walk,
   pyramid, team photo, victory lap. Each plays when the moment's larger
   side has 2 or more (doubles, a volleyball three, the 5v5 game's 7 v 6)
   and lays out any side of 1 to 7, every chip acting. A versus's cast.a
   are the underdogs who won, cast.b the favorites; a win's cast.a the
   team. All punchline: the winner's song lands on the hit. */
import { CAMERA_EASE, SIDE } from "./common.js";

/* ── dominoes: the favorites stand in a line like dominoes, turned three
   quarters. One underdog hops up and taps the first: the line goes over
   backwards in a chain, each a beat after the last, and the last one is
   knocked onto its heel and teeters there a long time, the whole leaning
   line riding with it... then goes flat (the song). The underdogs bounce
   once. The chain spans chain to last whatever its length. ── */
const DM = { smug:150, hop:800, tap:1450, chain:1480, last:2300, drop:3640, flat:3860, bounce:4250 };
const dominoes = {
  id:"dominoes", name:"Dominoes", shape:"versus", style:"punchline", ms:5200, beats:DM, still:4700, summary:"bitClatter",
  song:{ beat:"flat" }, team:true,
  letter:{ at:DM.flat + 120, over:"a", place:"top-right" },
  /* fitted: the whole line and the underdogs; every zoom below scales
     with the fit, so a 7 v 6 and a 2 v 1 get the same shots */
  camera:{ zoom:1.5, x:"mid", fit:true, moves:[
    /* in on the tapper and the first domino */
    { at:DM.hop + 200, ms:500, zoom:2.1, x:"tap" },
    /* along the line with the chain, the last and the tapper in the shot */
    { at:DM.chain + 60, ms:DM.last - DM.chain + 100, zoom:1.95, x:"watch" },
    /* closer while it teeters */
    { at:DM.last + 300, ms:DM.drop - DM.last - 300, zoom:2.15, x:"watch" },
    /* the slap on the last, then out for the underdogs' bounce */
    { at:DM.flat, ms:70, zoom:2.45, x:"last", ease:CAMERA_EASE.snap },
    { at:DM.flat + 260, ms:520, zoom:1.7, x:"mid" },
  ], shakes:[{ at:DM.tap }, { at:DM.flat, big:true }] },
  cast:{ a:SIDE("winner"), b:SIDE("beaten") },
  cues:[
    { at:DM.smug, sound:"bitClatter", pan:-0.3, opts:{ ms:280, dir:1 } },
    { at:DM.hop, sound:"bitHop", pan:0.25, opts:{ step:0 } },
    { at:DM.hop + 300, sound:"bitHop", pan:0.15, opts:{ step:1 } },
    { at:DM.tap, sound:"bitPoke", pan:0.05 },
    { at:DM.chain, sound:"bitClatter", pan:-0.2, opts:{ ms:DM.last - DM.chain, dir:-1 } },
    { at:DM.last + 60, sound:"bitCreak", pan:-0.5, opts:{ ms:DM.drop - DM.last } },
    { at:DM.flat, sound:"bitFlop", pan:-0.5 },
    { at:DM.flat + 30, sound:"bitThud", pan:-0.5 },
    { at:DM.bounce, sound:"bitBoing", pan:0.4, opts:{ small:true } },
  ],
};

/* ── tugofwar: a neon rope tied round each side, the knot over a line on
   the floor. Both sides lean back, straining; the favorites gain in two
   tugs, smug; the underdogs dig in and YANK: the favorites fly over the
   line into a heap at their feet (the song), stars going round. ── */
const TW = { lean:200, strain:600, gain:1300, smug:2050, dig:2400, yank:2800, heap:3250, stars:3450, bounce:3950 };
const tugofwar = {
  id:"tugofwar", name:"Tug of war", shape:"versus", style:"punchline", ms:5000, beats:TW, still:4400, summary:"bitYank",
  song:{ beat:"heap" }, team:true,
  letter:{ at:TW.heap + 150, over:"a", place:"top-left" },
  camera:{ zoom:1.5, x:"mid", fit:true, moves:[
    /* in on the knot through the strain, following it their way */
    { at:TW.strain, ms:TW.gain - TW.strain, zoom:1.68, x:"line" },
    { at:TW.gain, ms:700, zoom:1.74, x:"pull" },
    /* onto the underdogs as they dig in */
    { at:TW.dig - 80, ms:260, zoom:1.95, x:"a", ease:CAMERA_EASE.snap },
    /* out for the yank */
    { at:TW.yank, ms:140, zoom:1.5, x:"mid", ease:CAMERA_EASE.whip },
    /* the heap lands */
    { at:TW.heap - 40, ms:90, zoom:1.85, x:"heap", ease:CAMERA_EASE.snap },
    { at:TW.heap + 300, ms:700, zoom:1.66, x:"end" },
  ], shakes:[{ at:TW.yank }, { at:TW.heap, big:true }] },
  cast:{ a:SIDE("winner"), b:SIDE("beaten") },
  cues:[
    { at:TW.lean, sound:"bitCreak", pan:0, opts:{ ms:500, small:true } },
    { at:TW.strain, sound:"bitStrain", pan:0, opts:{ ms:TW.gain - TW.strain } },
    { at:TW.gain, sound:"bitScoot", pan:-0.3, opts:{ step:0 } },
    { at:TW.gain + 400, sound:"bitScoot", pan:-0.25, opts:{ step:1 } },
    { at:TW.smug, sound:"bitSqueak", pan:0.4 },
    { at:TW.dig, sound:"bitHuff", pan:-0.4 },
    { at:TW.yank, sound:"bitYank", pan:-0.3 },
    { at:TW.yank + 40, sound:"bitStreak", pan:0.1, opts:{ from:0.5, to:-0.2 } },
    { at:TW.heap, sound:"bitThud", pan:-0.15 },
    { at:TW.heap + 20, sound:"bitClatter", pan:-0.15, opts:{ ms:240 } },
    { at:TW.stars, sound:"bitStars", pan:-0.15, opts:{ ms:900 } },
    { at:TW.bounce, sound:"bitBoing", pan:-0.4, opts:{ small:true } },
  ],
};

/* ── slowmowalk: the underdogs walk toward us abreast in slow motion
   while, small on the horizon behind them, the favorites' chip stacks go
   up one after another in neon fireballs. They stop close; the biggest
   goes up last (the song). Nobody turns round. The six small blasts land
   on bitBoomChain's own beats (from `first`, every 280 ms). ── */
const SW = { first:600, fuse:2100, stop:2800, boom:2950 };
const slowmowalk = {
  id:"slowmowalk", name:"Slow-mo walk", shape:"versus", style:"punchline", ms:4700, beats:SW, still:3720, summary:"bitBoom",
  song:{ beat:"boom" }, team:true,
  letter:{ at:SW.boom + 60, over:"a", place:"top-left" },
  camera:{ zoom:1.35, x:"mid", fit:true, moves:[
    /* the slow walk leans in */
    { at:0, ms:SW.stop, zoom:1.46 },
    /* the last one goes: a punch in on the faces that do not turn */
    { at:SW.boom, ms:80, zoom:1.62, ease:CAMERA_EASE.snap },
    { at:SW.boom + 500, ms:700, zoom:1.5 },
  ], shakes:[{ at:SW.first }, { at:SW.boom, big:true }], washes:[SW.boom] },
  cast:{ a:SIDE("winner"), b:SIDE("beaten") },
  cues:[
    ...[1, 2, 3, 4].map(k => ({ at:SW.stop - 2760 + k * 690, sound:"bitStep", pan:0, opts:{ step:k } })),
    { at:SW.first, sound:"bitBoom", pan:-0.5, opts:{ slow:true } },
    { at:SW.first, sound:"bitBoomChain", pan:0, opts:{ ms:1400 } },
    { at:SW.fuse, sound:"bitFuse", pan:0, opts:{ ms:SW.boom - SW.fuse } },
    { at:SW.boom, sound:"bitBoom", pan:0 },
    { at:SW.boom, sound:"bitBass", pan:0 },
  ],
};

/* ── pyramid: the team hops up into a cheerleader pyramid of chips, the
   base row first, each row onto the one below (2 is one on one, 3 is
   2 + 1, 5 is 3 + 2, 7 is 4 + 2 + 1); the top chip leaps up last and
   lands (the song), wobbles, holds; neon sparkle. Rows land climb ms
   apart, the top on `top` (pyramid.jsx). ── */
const PY = { gather:350, top:2700 };
const pyramid = {
  id:"pyramid", name:"Pyramid", shape:"win", style:"punchline", ms:4800, beats:PY, still:4300, summary:"bitBoing",
  song:{ beat:"top" }, team:true,
  letter:{ at:PY.top + 160, over:"a", place:"top-left" },
  camera:{ zoom:1.45, x:"mid", fit:true, moves:[
    /* in as it goes up */
    { at:PY.gather + 600, ms:PY.top - PY.gather - 700, zoom:1.66 },
    /* the top lands */
    { at:PY.top, ms:80, zoom:1.8, ease:CAMERA_EASE.snap },
    { at:PY.top + 300, ms:900, zoom:1.7 },
  ], shakes:[{ at:PY.top, big:true }] },
  cast:{ a:SIDE("winner") },
  cues:[
    { at:PY.gather + 470, sound:"bitHop", pan:0, opts:{ step:0, small:true } },
    { at:PY.top - 1080, sound:"bitHop", pan:-0.25, opts:{ step:1 } },
    { at:PY.top - 540, sound:"bitHop", pan:0.25, opts:{ step:2 } },
    { at:PY.top - 520, sound:"bitStrain", pan:0, opts:{ ms:300 } },
    { at:PY.top, sound:"bitPlant", pan:0 },
    { at:PY.top + 20, sound:"bitTwinkle", pan:0.2 },
    { at:PY.top + 160, sound:"bitCreak", pan:0, opts:{ ms:1200, small:true } },
  ],
};

/* ── teamphoto: a neon camera on a tripod. The team hops into place and
   poses, each its own way, and holds while the self-timer's lamp blinks
   faster and faster (bitTimer's blips, timer to flash). FLASH (the
   song). They hold. Then the camera tips over on its tripod. ── */
const TP = { line:150, timer:1000, pose:1250, flash:3100, tip:4000, crash:4620 };
const teamphoto = {
  id:"teamphoto", name:"Team photo", shape:"win", style:"punchline", ms:5300, beats:TP, still:3950, summary:"bitShutter",
  song:{ beat:"flash" }, team:true,
  letter:{ at:TP.flash + 150, over:"a", place:"top-left" },
  camera:{ zoom:1.45, x:"mid", fit:true, moves:[
    /* in through the count, the team and the lamp in the shot */
    { at:TP.timer, ms:TP.flash - TP.timer - 100, zoom:1.56 },
    /* the flash: in on the team, as the picture */
    { at:TP.flash, ms:60, zoom:1.78, x:"team", ease:CAMERA_EASE.snap },
    /* back out as the tripod goes */
    { at:TP.tip - 300, ms:600, zoom:1.45, x:"mid" },
  ], shakes:[{ at:TP.flash, big:true }, { at:TP.crash }], washes:[TP.flash] },
  cast:{ a:SIDE("winner") },
  cues:[
    ...[0, 1, 2].map(k => ({ at:TP.line + 200 + k * 140, sound:"bitHop", pan:-0.2, opts:{ step:k, small:true } })),
    { at:TP.timer, sound:"bitTimer", pan:0.5, opts:{ ms:TP.flash - TP.timer } },
    ...[0, 1, 2, 3].map(k => ({ at:TP.pose + k * 340, sound:"bitSqueak", pan:-0.3 + k * 0.1, opts:{ step:k } })),
    { at:TP.flash, sound:"bitShutter", pan:0.45 },
    { at:TP.flash + 660, sound:"bitThud", pan:0, opts:{ small:true } },
    { at:TP.tip, sound:"bitCreak", pan:0.6, opts:{ ms:TP.crash - TP.tip } },
    { at:TP.crash, sound:"bitThud", pan:0.7 },
    { at:TP.crash + 40, sound:"bitClatter", pan:0.7, opts:{ ms:200 } },
  ],
};

/* ── victorylap: the team rolls a lap of a neon oval track in a file,
   rolling on their edges, up round the far side and back down the near
   straight; the leader crosses the finish line (the song) as the
   checkered flag whips and the photo finish flashes, and they pull up in
   a row past it. The file runs one 3800 ms path, a chip's width apart
   (victorylap.css). ── */
const VL = { cross:2800 };
const victorylap = {
  id:"victorylap", name:"Victory lap", shape:"win", style:"punchline", ms:5300, beats:VL, still:4700, summary:"bitFlagFlap",
  song:{ beat:"cross" }, team:true,
  letter:{ at:VL.cross + 150, over:"a", place:"top-left" },
  camera:{ zoom:1.2, x:"mid", fit:true, moves:[
    /* down the near straight, in on the line */
    { at:1900, ms:850, zoom:1.42, x:"line" },
    /* the crossing */
    { at:VL.cross, ms:70, zoom:1.55, x:"line", ease:CAMERA_EASE.snap },
    /* along with them as they pull up */
    { at:VL.cross + 200, ms:1500, zoom:1.36, x:"row" },
  ], shakes:[{ at:VL.cross, big:true }], washes:[VL.cross] },
  cast:{ a:SIDE("winner") },
  cues:[
    { at:0, sound:"bitRoll", pan:0.5, opts:{ ms:VL.cross } },
    { at:0, sound:"bitFlagFlap", pan:-0.3, opts:{ ms:VL.cross + 1600 } },
    { at:VL.cross, sound:"bitShutter", pan:-0.2 },
    { at:VL.cross + 30, sound:"bitTwinkle", pan:-0.2 },
    { at:VL.cross + 60, sound:"bitRoll", pan:0.2, opts:{ ms:1700 } },
    { at:VL.cross + 1600, sound:"bitSkid", pan:0.4 },
  ],
};

export const TEAM = [dominoes, tugofwar, slowmowalk, pyramid, teamphoto, victorylap];
