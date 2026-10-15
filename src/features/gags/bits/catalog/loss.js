/* Loss bits (no song): anvil, roadrunner, quicksand, dynamite, vulture,
   the rake, needle scratch. cast.a is the one who lost. */
import { CAMERA_EASE, ONE } from "./common.js";
import { panAt } from "../../neon/neonArt.js";

/* ── anvil: the chip gives a happy little hop. A ring lights on the floor
   under it and grows (the whistle). It tips back to look up. CLANG: a
   neon anvil, and the chip is a pancake, stars going round. The anvil
   hops off; the chip boings back up, dazed, turns to the room for a
   beat, and keels over backwards flat on the floor, rattling down like a
   coin. ── */
const AN = { hop:250, shadow:600, notice:1500, sweat:1620, drop:1900, hit:2020, stars:2100, lift:3000, thud:3280, pop:3500,
  look:3900, keel:4400, flat:4650 };
const anvil = {
  id:"anvil", name:"Anvil", shape:"loss", style:"songless", ms:5400, beats:AN, still:2900, summary:"bitClang", song:null,
  letter:{ at:AN.hit + 130, over:"a", place:"top-right" },
  camera:{ zoom:1.8, x:960, moves:[
    /* ease in while the ring grows */
    { at:AN.shadow, ms:AN.notice - AN.shadow, zoom:1.92, x:960 },
    /* the clang */
    { at:AN.hit, ms:70, zoom:2.04, x:960, ease:CAMERA_EASE.snap },
    /* back out for the pancake and its stars */
    { at:AN.stars + 120, ms:520, zoom:1.84, x:1000 },
    /* in on it, looking at the room */
    { at:AN.look - 200, ms:500, zoom:2.2, x:960 },
    /* out as it keels over */
    { at:AN.keel, ms:400, zoom:1.86, x:960 },
  ], shakes:[{ at:AN.hit, big:true }, { at:AN.thud }, { at:AN.flat }] },
  cast:{ a:ONE("loser") },
  cues:[
    { at:AN.hop + 220, sound:"bitHop", pan:0, opts:{ step:0 } },
    { at:AN.shadow, sound:"bitWhistle", pan:0, opts:{ ms:AN.drop - AN.shadow } },
    { at:AN.notice, sound:"neonBuzz", pan:0, opts:{ ms:180, up:true } },
    { at:AN.hit, sound:"bitClang", pan:0 },
    { at:AN.stars, sound:"bitStars", pan:0, opts:{ ms:AN.lift - AN.stars } },
    { at:AN.lift, sound:"bitHop", pan:0.3, opts:{ step:1 } },
    { at:AN.thud, sound:"bitThud", pan:0.45 },
    { at:AN.pop, sound:"bitBoing", pan:0 },
    { at:AN.keel, sound:"bitCreak", pan:0, opts:{ ms:240, small:true } },
    { at:AN.flat, sound:"bitSpinDown", pan:0 },
  ],
};

/* ── roadrunner: the chip alone. A neon roadrunner streaks in from the
   right, skids to a stop beside it in a spray of dust and leans in, beak
   an inch off its face: beep beep (the chip jolts on each). Its legs spin
   up into a wheel and it is gone in a streak right past the chip, which
   spins like a top in its wake, wobbles and keels over flat. A beep, far
   off. One feather comes down on it. ── */
const RR = { arrive:300, skid:560, stop:1000, lean:1300, beep:1600, beep2:1790, windup:2250, leave:2550, spin:2600, far:3350,
  topple:3750, flat:4000, land:4600 };
const roadrunner = {
  id:"roadrunner", name:"Roadrunner", shape:"loss", style:"songless", ms:5000, beats:RR, still:4700, summary:"bitBeep", song:null,
  letter:{ at:RR.spin + 200, over:"a", place:"top-right" },
  camera:{ zoom:1.8, x:1010, moves:[
    /* in on the beeps */
    { at:RR.lean, ms:300, zoom:2.0, x:1060 },
    /* whipped out as it goes */
    { at:RR.leave, ms:160, zoom:1.74, x:920, ease:CAMERA_EASE.whip },
    /* in on the chip as it keels over */
    { at:RR.topple - 150, ms:500, zoom:1.96, x:880 },
  ], shakes:[{ at:RR.stop }, { at:RR.flat }] },
  cast:{ a:ONE("loser") },
  cues:[
    { at:RR.arrive, sound:"bitStreak", pan:0.6, opts:{ from:1, to:0.25 } },
    { at:RR.skid, sound:"bitSkid", pan:panAt(1250), opts:{ ms:RR.stop - RR.skid } },
    { at:RR.beep, sound:"bitBeep", pan:panAt(1000) },
    { at:RR.windup, sound:"bitRev", pan:panAt(1200), opts:{ ms:RR.leave - RR.windup } },
    { at:RR.leave, sound:"bitZip", pan:0 },
    { at:RR.spin, sound:"bitTwirl", pan:panAt(860) },
    { at:RR.far, sound:"bitBeepFar", pan:-0.9 },
    { at:RR.topple, sound:"bitCreak", pan:panAt(860), opts:{ ms:240, small:true } },
    { at:RR.flat, sound:"bitSpinDown", pan:panAt(860) },
    { at:RR.land - 120, sound:"bitFluff", pan:panAt(880) },
  ],
};

/* ── quicksand: the chip stands on a patch of neon sand, its swirl
   turning. It sinks a little and looks down; it wiggles, it hops in
   place to get out (no hands: it can't), down a bit more with every
   landing. Sunk to its rim, it looks up at the sky; one last little hop;
   gone. One bubble comes up and pops. ── */
const QS = { settle:450, notice:900, struggle:1250, h1:1900, h2:2300, h3:2700, rim:3100, lastHop:3450, gone:3800, bubble:4150,
  pop:4550 };
const quicksand = {
  id:"quicksand", name:"Quicksand", shape:"loss", style:"songless", ms:5000, beats:QS, still:2950, summary:"bitSink", song:null,
  letter:{ at:QS.h2 - 100, over:"a", place:"top-left" },
  camera:{ zoom:1.8, x:960, moves:[
    /* in as the struggle starts */
    { at:QS.struggle, ms:1400, zoom:1.98, x:980 },
    /* in on the rim */
    { at:QS.rim - 100, ms:300, zoom:2.25, x:990, ease:CAMERA_EASE.snap },
    /* back a little for the bubble */
    { at:QS.gone + 200, ms:600, zoom:2.05, x:990 },
  ], shakes:[] },
  cast:{ a:ONE("loser") },
  cues:[
    { at:QS.settle, sound:"bitSink", pan:0, opts:{ ms:600 } },
    { at:QS.notice, sound:"neonBuzz", pan:0, opts:{ ms:180, up:true } },
    { at:QS.struggle, sound:"bitFlail", pan:0, opts:{ ms:620 } },
    { at:QS.h1, sound:"bitHop", pan:0, opts:{ step:0 } },
    { at:QS.h1 + 300, sound:"bitSink", pan:0, opts:{ ms:350 } },
    { at:QS.h2, sound:"bitHop", pan:0, opts:{ step:1 } },
    { at:QS.h2 + 280, sound:"bitSink", pan:0, opts:{ ms:350 } },
    { at:QS.h3, sound:"bitHop", pan:0, opts:{ step:2 } },
    { at:QS.h3 + 260, sound:"bitSink", pan:0, opts:{ ms:350 } },
    { at:QS.rim, sound:"bitStrain", pan:0, opts:{ ms:300 } },
    { at:QS.lastHop, sound:"bitHop", pan:0, opts:{ step:3, small:true } },
    { at:QS.gone, sound:"bitSink", pan:0, opts:{ ms:700, deep:true } },
    { at:QS.bubble, sound:"bitBubble", pan:panAt(1000) },
    { at:QS.pop, sound:"bitPop", pan:panAt(1000) },
  ],
};

/* ── dynamite: the chip hums to itself beside a bundle of neon dynamite,
   its fuse fizzing down. A glance; it looks away; the double take, too
   late: BOOM (a white frame, the big shake). Smoke rings roll out and the
   smoke clears: the chip still standing, blackened, its rim stuttering
   like a dying tube, smoke curling off it. A beat; a little puff of
   smoke. It topples flat on its face. ── */
const DY = { glance:1250, away:1600, notice:2000, sweat:2150, boom:2400, cough:3350, topple:3950, flat:4250 };
const dynamite = {
  id:"dynamite", name:"Dynamite", shape:"loss", style:"songless", ms:5500, beats:DY, still:3450, summary:"bitBlast", song:null,
  letter:{ at:DY.boom + 300, over:"a", place:"top-left" },
  camera:{ zoom:1.8, x:1000, moves:[
    /* a slow push while the fuse burns */
    { at:200, ms:1600, zoom:1.9, x:1010 },
    /* in on the double take */
    { at:DY.notice, ms:140, zoom:2.1, x:930, ease:CAMERA_EASE.snap },
    /* out with the blast */
    { at:DY.boom, ms:70, zoom:1.72, x:980, ease:CAMERA_EASE.whip },
    /* in on what is left */
    { at:DY.boom + 500, ms:700, zoom:1.98, x:840 },
    /* out a touch as it goes over */
    { at:DY.topple, ms:400, zoom:1.86, x:840 },
  ], shakes:[{ at:DY.boom, big:true }, { at:DY.flat }], washes:[DY.boom] },
  cast:{ a:ONE("loser") },
  cues:[
    { at:200, sound:"bitFuse", pan:panAt(1180), opts:{ ms:DY.boom - 200 } },
    { at:DY.notice, sound:"neonBuzz", pan:panAt(860), opts:{ ms:180, up:true } },
    { at:DY.sweat, sound:"bitDrip", pan:panAt(860), opts:{ small:true } },
    { at:DY.boom, sound:"bitBlast", pan:panAt(1130) },
    { at:DY.cough, sound:"bitCough", pan:panAt(810) },
    { at:DY.topple, sound:"bitCreak", pan:panAt(810), opts:{ ms:280, small:true } },
    { at:DY.flat, sound:"bitFlop", pan:panAt(810) },
  ],
};

/* ── vulture: the chip alone, glum. A neon vulture glides in and lands on
   a dead tree beside it. They look at each other. The chip scoots away;
   the vulture hops down after it. Again. The vulture tucks in a napkin
   and brings up a knife and fork. Hold on the chip. ── */
const VU = { glide:200, land:1100, perch:1300, look:1550, tilt:1700, scoot:2000, hop1:2300, look2:2750, scoot2:2950, hop2:3250,
  napkin:3650, cutlery:4000, shing:4150 };
const vulture = {
  id:"vulture", name:"Vulture", shape:"loss", style:"songless", ms:5400, beats:VU, still:4350, summary:"bitShing", song:null,
  letter:{ at:VU.napkin - 100, over:"a", place:"top-right" },
  camera:{ zoom:1.7, x:1060, moves:[
    /* along with the chip as it scoots */
    { at:VU.scoot, ms:600, zoom:1.74, x:960 },
    { at:VU.scoot2, ms:600, zoom:1.8, x:780 },
    /* in for the knife and fork */
    { at:VU.napkin, ms:700, zoom:2.0, x:690 },
  ], shakes:[] },
  cast:{ a:ONE("loser") },
  cues:[
    { at:VU.glide, sound:"bitWind", pan:0.5, opts:{ ms:900 } },
    { at:VU.land - 160, sound:"bitFlap", pan:panAt(1240) },
    { at:VU.land, sound:"bitFlap", pan:panAt(1240), opts:{ small:true } },
    { at:VU.perch, sound:"bitCreak", pan:panAt(1300), opts:{ ms:300, small:true } },
    { at:VU.scoot, sound:"bitScoot", pan:panAt(860), opts:{ step:0 } },
    { at:VU.scoot + 110, sound:"bitScoot", pan:panAt(800), opts:{ step:1 } },
    { at:VU.scoot + 220, sound:"bitScoot", pan:panAt(740), opts:{ step:2 } },
    { at:VU.hop1, sound:"bitFlap", pan:panAt(1100), opts:{ small:true } },
    { at:VU.hop1 + 380, sound:"bitHop", pan:panAt(990), opts:{ step:0, small:true } },
    { at:VU.scoot2, sound:"bitScoot", pan:panAt(680), opts:{ step:0 } },
    { at:VU.scoot2 + 110, sound:"bitScoot", pan:panAt(620), opts:{ step:1 } },
    { at:VU.scoot2 + 220, sound:"bitScoot", pan:panAt(560), opts:{ step:2 } },
    { at:VU.hop2, sound:"bitFlap", pan:panAt(900), opts:{ small:true } },
    { at:VU.hop2 + 380, sound:"bitHop", pan:panAt(810), opts:{ step:1, small:true } },
    { at:VU.napkin, sound:"bitFwip", pan:panAt(780) },
    { at:VU.shing, sound:"bitShing", pan:panAt(720) },
    { at:VU.cutlery + 250, sound:"bitDrip", pan:panAt(560), opts:{ small:true } },
  ],
};

/* ── the rake: the casino's revenge. The chip sits on its bet spot on the
   felt. The house hand reaches in with a croupier's rake and sets it
   behind the chip like a losing bet. It pushes; the chip digs in, leaning
   back into the rake, and slides anyway, all the way to the table's edge,
   where it teeters, and finds its feet. One little nudge: over the edge
   and out of the frame. The rake taps the felt twice. ── */
const RK = { reach:300, set:800, push:1300, slide:1850, edge:2150, cling:2200, shove:2950, fall:3000, gone:3350, far:3700, tap1:3950,
  tap2:4250 };
const rake = {
  id:"rake", name:"The rake", shape:"loss", style:"songless", ms:5000, beats:RK, still:2700, summary:"bitRake", song:null,
  letter:{ at:RK.edge - 150, over:"a", place:"top-right" },
  camera:{ zoom:1.75, x:1000, moves:[
    /* in as it digs in */
    { at:RK.push, ms:600, zoom:1.86, x:1060 },
    /* on the edge */
    { at:RK.edge - 60, ms:200, zoom:2.06, x:1200, ease:CAMERA_EASE.snap },
    /* back as it goes over */
    { at:RK.fall, ms:400, zoom:1.82, x:1120 },
    /* the felt, and the rake on it */
    { at:RK.far, ms:600, zoom:1.75, x:1020 },
  ], shakes:[] },
  cast:{ a:ONE("loser") },
  cues:[
    { at:RK.reach, sound:"bitStreak", pan:-0.6, opts:{ from:-0.95, to:-0.45 } },
    { at:RK.set - 20, sound:"bitPap", pan:panAt(880) },
    { at:RK.push, sound:"bitRake", pan:panAt(940), opts:{ ms:550 } },
    { at:RK.push + 100, sound:"bitStrain", pan:panAt(1040), opts:{ ms:450 } },
    { at:RK.slide, sound:"bitRake", pan:panAt(1160), opts:{ ms:300, small:true } },
    { at:RK.edge, sound:"neonBuzz", pan:panAt(1290), opts:{ ms:180, up:true } },
    { at:RK.cling, sound:"bitCreak", pan:panAt(1290), opts:{ ms:700, small:true } },
    { at:RK.shove - 100, sound:"bitPoke", pan:panAt(1180) },
    { at:RK.fall, sound:"bitFallAway", pan:panAt(1330), opts:{ ms:600 } },
    { at:RK.far, sound:"bitFarThud", pan:panAt(1340) },
    { at:RK.tap1 + 100, sound:"bitPap", pan:panAt(1100) },
    { at:RK.tap2 + 100, sound:"bitPap", pan:panAt(1100), opts:{ small:true } },
  ],
};

/* ── needle scratch: only while the last winner's song is still playing
   (needs:"song"); the Worker cuts that song on the scratch (cut). A neon
   record player spins, notes float up off it, and the loser bops along
   as if it belongs. It tries a spin, overbalances and goes over flat,
   and as it hits the floor the needle skids across the record. The notes
   stop dead in the air and drop. The record spins down. Silence; a
   cricket; a lone tumbleweed rolls by behind the chip. ── */
const NS = { spin:1500, wobble:1950, scratch:2400, drop:2560, weed:2900, gone:3300, chirp:3700 };
const needlescratch = {
  id:"needlescratch", name:"Needle scratch", shape:"loss", style:"songless", ms:5200, beats:NS, still:3400, summary:"bitScratch",
  song:null, needs:"song", cut:"scratch",
  letter:{ at:NS.scratch + 200, over:"a", place:"top-left" },
  camera:{ zoom:1.8, x:1010, moves:[
    /* a slow push while it grooves */
    { at:200, ms:1600, zoom:1.88, x:1000 },
    /* the cut-in: in on the chip going down and the needle skidding */
    { at:NS.scratch, ms:80, zoom:2.04, x:1060, ease:CAMERA_EASE.snap },
    /* back out for the silence */
    { at:NS.weed, ms:900, zoom:1.8, x:950 },
  ], shakes:[{ at:NS.scratch }] },
  cast:{ a:ONE("loser") },
  cues:[
    { at:NS.spin, sound:"bitTwirl", pan:panAt(760) },
    { at:NS.wobble, sound:"bitCreak", pan:panAt(760), opts:{ ms:300, small:true } },
    { at:NS.scratch, sound:"bitScratch", pan:panAt(1230) },
    { at:NS.scratch + 40, sound:"bitFlop", pan:panAt(760) },
    { at:NS.drop + 340, sound:"bitPap", pan:panAt(1230), opts:{ small:true } },
    { at:NS.weed, sound:"bitWind", pan:-0.3, opts:{ ms:2200 } },
    { at:NS.chirp, sound:"bitTink", pan:0.7, opts:{ small:true } },
    { at:NS.chirp + 160, sound:"bitTink", pan:0.7, opts:{ small:true } },
  ],
};

export const LOSS = [anvil, roadrunner, quicksand, dynamite, vulture, rake, needlescratch];
