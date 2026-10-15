/* Idle vignettes (attract mode): nap, edge push, saguaro, coin spin
   contest, polish, lost tourist. The TV's downtime between games: no
   song, nothing lettered, a small story with a turn and an ending pose,
   played once. cast.a is the room (the first one or two present). */
import { panAt } from "../../neon/neonArt.js";
import { CAMERA_EASE, ROOM } from "./common.js";

/* ── nap: the chip nods off, once, twice, and keels over backwards flat
   on the floor. It sleeps, breathing, Z's drifting up. A moth finds its
   light, circles and lands on it; it twitches, the moth lifts off,
   circles, lands again. It sleeps on. ── */
const NP = { nod1:300, nod2:1250, keel:2050, flat:2330, zees:2800, moth:3100, land:4700, twitch:5500, land2:7100 };
const nap = {
  id:"nap", name:"Nap", shape:"idle", style:"songless", ms:9000, beats:NP, still:8300, summary:"bitSnore", song:null, letter:null,
  camera:{ zoom:1.9, x:950, moves:[
    /* a touch out as it keels over */
    { at:NP.keel - 100, ms:600, zoom:1.84, x:960 },
    /* in, slowly, as the moth comes to the light */
    { at:NP.moth, ms:NP.land - NP.moth, zoom:2.16, x:960 },
    /* the twitch: a small kick back */
    { at:NP.twitch, ms:260, zoom:2.04, ease:CAMERA_EASE.snap },
    /* settle in close as it sleeps on */
    { at:NP.land2 - 200, ms:1900, zoom:2.38, x:965 },
  ], shakes:[{ at:NP.flat }] },
  cast:ROOM(1),
  cues:[
    { at:NP.nod1 + 650, sound:"bitSqueakSoft", pan:0 },
    { at:NP.nod2 + 560, sound:"bitSqueakSoft", pan:0 },
    { at:NP.keel, sound:"bitCreak", pan:0, opts:{ ms:260, small:true } },
    { at:NP.flat, sound:"bitFlop", pan:0 },
    { at:NP.flat + 700, sound:"bitSnore", pan:0, opts:{ small:true } },
    { at:NP.moth, sound:"bitFlutter", pan:panAt(1500), opts:{ ms:NP.land - NP.moth } },
    { at:NP.land - 100, sound:"bitSnore", pan:0 },
    { at:NP.twitch, sound:"bitHop", pan:0, opts:{ step:2 } },
    { at:NP.twitch + 40, sound:"bitFlutter", pan:0, opts:{ ms:NP.land2 - NP.twitch } },
    { at:NP.land2 + 300, sound:"bitSnore", pan:0, opts:{ small:true } },
  ],
};

/* ── edge push: a sumo push. Two chips square up, each stamps, they
   crouch and charge and meet rim to rim. Leaning in, trembling, sweat
   flying, the lock slides one way, the other, back to the middle. Then
   both turn to the room at once and hold, still locked, still shaking. ── */
const EP = { stampA:400, stampB:850, set:1250, charge:1550, clash:1750, push1:2300, sweat1:2550, push2:3400, sweat2:3700,
  sweat3:4300, push3:4700, sweat4:5100, turn:6000, drip:6700 };
const edgepush = {
  id:"edgepush", name:"Edge push", shape:"idle", style:"songless", ms:8200, beats:EP, still:7300, summary:"bitStrain", song:null,
  letter:null,
  camera:{ zoom:1.8, x:"mid", fit:true, moves:[
    /* in as they lock up */
    { at:EP.clash, ms:140, zoom:1.96, ease:CAMERA_EASE.snap },
    /* riding the lock as it slides */
    { at:EP.push1, ms:800, x:1000 },
    { at:EP.push2 + 300, ms:700, x:920 },
    { at:EP.push3, ms:700, x:960 },
    /* the turn: in on both of them, looking at us */
    { at:EP.turn, ms:200, zoom:2.2, ease:CAMERA_EASE.snap },
  ], shakes:[{ at:EP.stampA + 260 }, { at:EP.stampB + 260 }, { at:EP.clash }] },
  cast:ROOM(2),
  cues:[
    { at:EP.stampA + 260, sound:"bitThud", pan:panAt(650) },
    { at:EP.stampB + 260, sound:"bitThud", pan:panAt(1270) },
    { at:EP.charge, sound:"bitScoot", pan:panAt(800) },
    { at:EP.charge + 30, sound:"bitScoot", pan:panAt(1120) },
    { at:EP.clash, sound:"bitClink", pan:0 },
    { at:EP.clash + 150, sound:"bitStrain", pan:0, opts:{ ms:1600 } },
    { at:EP.push1, sound:"bitSkid", pan:panAt(1180) },
    { at:EP.sweat1, sound:"bitDrip", pan:panAt(700), opts:{ small:true } },
    { at:EP.push2, sound:"bitStrain", pan:0, opts:{ ms:1400 } },
    { at:EP.push2 + 300, sound:"bitSkid", pan:panAt(760) },
    { at:EP.sweat2, sound:"bitDrip", pan:panAt(1220), opts:{ small:true } },
    { at:EP.push3, sound:"bitStrain", pan:0, opts:{ ms:1100 } },
    { at:EP.turn, sound:"bitSqueakSoft", pan:0 },
    { at:EP.drip, sound:"bitDrip", pan:0 },
  ],
};

/* ── saguaro: a neon saguaro with a blossom lit on top. The chip hops:
   nowhere near. Hops higher, into the spines; bounces off, shakes it
   off. Leans on the arm to think: the spines again. Backs right up, runs,
   leaps, and lands perched on the arm, level with the blossom at last.
   The blossom closes for the night. The chip looks at us. ── */
const SG = { look:300, hop1:900, hop2:1500, prick1:1780, shake:2250, scoot:2900, lean:3380, think:3800, prick2:4650, backup:5300,
  wind:6050, run:6350, takeoff:6700, land:7100, close:7850, look2:8500 };
const saguaro = {
  id:"saguaro", name:"Saguaro", shape:"idle", style:"songless", ms:9800, beats:SG, still:9200, summary:"bitPrick", song:null,
  letter:null,
  camera:{ zoom:1.74, x:860, moves:[
    /* in on it leaning there, thinking */
    { at:SG.lean - 200, ms:700, zoom:1.95, x:850 },
    /* out with the second prick */
    { at:SG.prick2, ms:160, zoom:1.74, x:830, ease:CAMERA_EASE.snap },
    /* wide for the run-up */
    { at:SG.backup, ms:700, zoom:1.66, x:840 },
    /* up with the leap, over to the arm and the blossom */
    { at:SG.takeoff, ms:520, zoom:1.8, x:1010 },
    /* in, a touch, for the look */
    { at:SG.look2 - 100, ms:600, zoom:1.88, x:1010 },
  ], shakes:[{ at:SG.prick1 }, { at:SG.land }] },
  cast:ROOM(1),
  cues:[
    { at:SG.look, sound:"neonBuzz", pan:panAt(1120), opts:{ ms:300, small:true } },
    { at:SG.hop1, sound:"bitHop", pan:panAt(620), opts:{ step:0 } },
    { at:SG.hop2, sound:"bitHop", pan:panAt(640), opts:{ step:1 } },
    { at:SG.prick1, sound:"bitPrick", pan:panAt(900) },
    { at:SG.shake, sound:"bitShake", pan:panAt(650) },
    { at:SG.scoot, sound:"bitScoot", pan:panAt(700) },
    { at:SG.lean, sound:"bitCreak", pan:panAt(780), opts:{ ms:300, small:true } },
    { at:SG.prick2, sound:"bitPrick", pan:panAt(900), opts:{ big:true } },
    { at:SG.backup, sound:"bitScoot", pan:panAt(560) },
    { at:SG.backup + 240, sound:"bitScoot", pan:panAt(500) },
    { at:SG.wind, sound:"bitRev", pan:panAt(460), opts:{ ms:300 } },
    { at:SG.run, sound:"bitSneaker", pan:panAt(480), opts:{ step:0 } },
    { at:SG.run + 140, sound:"bitSneaker", pan:panAt(560), opts:{ step:1 } },
    { at:SG.run + 260, sound:"bitSneaker", pan:panAt(660), opts:{ step:0 } },
    { at:SG.takeoff, sound:"bitLaunch", pan:panAt(720) },
    { at:SG.land, sound:"bitThud", pan:panAt(940) },
    { at:SG.close, sound:"neonBuzz", pan:panAt(1120), opts:{ ms:340 } },
  ],
};

/* ── coin spin contest: two chips size each other up, wind up and set
   themselves spinning on their edges at once, sparks off their rims.
   One wobbles, slows, and goes down flat, rattling out. The other spins
   on, smug, hopping; then it slows too, stops square to the room, takes
   a bow, and the bow tips it over onto its face. ── */
const CS = { eye:300, wind:1150, spin:1450, wobbleA:3100, fallA:4350, smug:4700, slowB:5550, bow:6700, topple:7400 };
const coinspin = {
  id:"coinspin", name:"Coin spin", shape:"idle", style:"songless", ms:9000, beats:CS, still:8400, summary:"bitSpinDown", song:null,
  letter:null,
  camera:{ zoom:1.9, x:"mid", fit:true, moves:[
    /* in a touch for the wind-up */
    { at:CS.wind - 200, ms:500, zoom:2.02 },
    /* over to the first as it dies */
    { at:CS.wobbleA, ms:900, zoom:2.1, x:880 },
    /* to the other, spinning on */
    { at:CS.fallA + 300, ms:900, zoom:2.1, x:1060 },
    /* in on it, stopped, before the bow */
    { at:CS.slowB + 400, ms:700, zoom:2.25, x:1090 },
    /* back out on the two of them, flat */
    { at:CS.topple + 200, ms:700, zoom:2.0, x:960 },
  ], shakes:[{ at:CS.fallA + 240 }, { at:CS.topple + 300 }] },
  cast:ROOM(2),
  cues:[
    { at:CS.wind, sound:"bitRatchet", pan:0 },
    { at:CS.spin, sound:"bitRoll", pan:panAt(760), opts:{ ms:CS.fallA - CS.spin } },
    { at:CS.spin + 20, sound:"bitRoll", pan:panAt(1160), opts:{ ms:CS.slowB - CS.spin + 600 } },
    { at:CS.fallA - 300, sound:"bitTwirl", pan:panAt(760) },
    { at:CS.fallA + 240, sound:"bitSpinDown", pan:panAt(760) },
    { at:CS.smug + 160, sound:"bitHop", pan:panAt(1120), opts:{ step:0 } },
    { at:CS.smug + 480, sound:"bitHop", pan:panAt(1100), opts:{ step:1 } },
    { at:CS.slowB, sound:"bitTwirl", pan:panAt(1090) },
    { at:CS.bow, sound:"bitCreak", pan:panAt(1090), opts:{ ms:300, small:true } },
    { at:CS.topple + 300, sound:"bitSpinDown", pan:panAt(1090) },
  ],
};

/* ── polish: the chip stands there gone dull. The house hand reaches in
   with a cloth and buffs it in circles; it turns a little with the
   rubbing, the dust puffs off. The hand draws back; the chip spins once
   on its edge, the rim comes up bright, a glint runs across, a sparkle
   catches the edge. Pleased, it hops once. The hand comes back for one
   last flick of a buff, and goes. ── */
const PL = { reach:400, rub:1300, lift:4100, gleam:4500, glint:4650, sparkle:4950, hop:5500, back:6150, flick:6450, leave:6800 };
const polish = {
  id:"polish", name:"Polish", shape:"idle", style:"songless", ms:8400, beats:PL, still:7800, summary:"bitGleam", song:null,
  letter:null,
  camera:{ zoom:1.8, x:930, moves:[
    /* closer while it buffs */
    { at:PL.rub, ms:PL.lift - PL.rub, zoom:1.96, x:960 },
    /* in on the chip as the cloth lifts */
    { at:PL.lift, ms:500, zoom:2.14, x:1000 },
    /* out a touch for the hand's return */
    { at:PL.back - 200, ms:500, zoom:1.98, x:980 },
    /* settle on the gleaming chip */
    { at:PL.leave + 200, ms:900, zoom:2.1, x:1000 },
  ] },
  cast:ROOM(1),
  cues:[
    { at:PL.reach, sound:"bitStreak", pan:panAt(400), opts:{ from:-0.9, to:-0.1 } },
    { at:PL.rub, sound:"bitSweep", pan:panAt(990), opts:{ step:0 } },
    { at:PL.rub + 700, sound:"bitSweep", pan:panAt(990), opts:{ step:1 } },
    { at:PL.rub + 1400, sound:"bitSweep", pan:panAt(990), opts:{ step:2 } },
    { at:PL.rub + 2100, sound:"bitSweep", pan:panAt(990), opts:{ step:0 } },
    { at:PL.lift + 60, sound:"bitRoll", pan:panAt(1000), opts:{ ms:700 } },
    { at:PL.gleam, sound:"bitGleam", pan:panAt(1000) },
    { at:PL.glint, sound:"bitShing", pan:panAt(1000) },
    { at:PL.sparkle, sound:"bitTwinkle", pan:panAt(1080) },
    { at:PL.hop, sound:"bitHop", pan:panAt(1000), opts:{ step:1 } },
    { at:PL.back, sound:"bitStreak", pan:panAt(700), opts:{ from:-0.7, to:-0.2 } },
    { at:PL.flick, sound:"bitFwip", pan:panAt(1000) },
    { at:PL.leave, sound:"bitStreak", pan:panAt(600), opts:{ from:-0.2, to:-0.9 } },
  ],
};

/* ── lost tourist: a chip wanders in under a Vegas arrow sign. It looks
   up: right. It rolls off right; the arrow cuts to left. It rolls back;
   the arrow cuts to right. It stops, looks one way and the other, a
   question mark lit over it. The house hand reaches in and points: that
   way. It rolls off. A beat later the arrow cuts to left. ── */
const LT = { wander:0, look:1450, go1:2100, flip1:3150, back:3350, go2:3700, flip2:4800, puzzle:5100, hand:6200, point:6750,
  go3:7250, flip3:8450 };
const losttourist = {
  id:"losttourist", name:"Lost tourist", shape:"idle", style:"songless", ms:9600, beats:LT, still:6950, summary:"neonBuzz", song:null,
  letter:null,
  camera:{ zoom:1.74, x:960, moves:[
    /* after it, off to the right */
    { at:LT.go1, ms:900, x:1080 },
    /* back with it */
    { at:LT.go2 + 100, ms:900, x:930 },
    /* in on it, lost */
    { at:LT.puzzle - 100, ms:700, zoom:1.95, x:900 },
    /* out as it rolls away, then over to the sign for its last word */
    { at:LT.go3, ms:800, zoom:1.8, x:860 },
    { at:LT.flip3 - 600, ms:700, zoom:1.95, x:1000 },
  ] },
  cast:ROOM(1),
  cues:[
    { at:LT.wander, sound:"bitRoll", pan:panAt(400), opts:{ ms:1300 } },
    { at:LT.look, sound:"neonBuzz", pan:panAt(1060), opts:{ ms:260, small:true } },
    { at:LT.go1, sound:"bitRoll", pan:panAt(1060), opts:{ ms:900 } },
    { at:LT.flip1, sound:"bitClick", pan:panAt(1060) },
    { at:LT.flip1 + 20, sound:"neonBuzz", pan:panAt(1060), opts:{ ms:240, up:true } },
    { at:LT.go2, sound:"bitRoll", pan:panAt(1000), opts:{ ms:950 } },
    { at:LT.flip2, sound:"bitClick", pan:panAt(1060) },
    { at:LT.flip2 + 20, sound:"neonBuzz", pan:panAt(1060), opts:{ ms:240, up:true } },
    { at:LT.puzzle + 150, sound:"neonBuzz", pan:panAt(760), opts:{ ms:320, small:true } },
    { at:LT.hand, sound:"bitStreak", pan:panAt(1300), opts:{ from:0.9, to:0.2 } },
    { at:LT.point + 160, sound:"bitPoke", pan:panAt(740) },
    { at:LT.go3, sound:"bitRoll", pan:panAt(500), opts:{ ms:1000 } },
    { at:LT.flip3, sound:"bitClick", pan:panAt(1060) },
    { at:LT.flip3 + 20, sound:"neonBuzz", pan:panAt(1060), opts:{ ms:240, up:true } },
  ],
};

export const IDLE = [nap, edgepush, saguaro, coinspin, polish, losttourist];
