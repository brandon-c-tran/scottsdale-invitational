/* Win bits with music (the song starts ON the action, its wind-up held
   until the speaker plays): headphones, needle drop, disco switch,
   jukebox, lowrider, saloon piano. A cue marked `unless:"song"` plays
   only when no song is coming (the bit's own little groove). */
import { CAMERA_EASE, ONE, hops } from "./common.js";

/* ── headphones: the chip idles. The house hand comes down from above
   with a pair of oversized neon headphones and holds them over it (the
   wind-up holds here until the song plays). Click: they snap on, the song
   starts, the cups light, and the chip bobs to it, notes rising. ── */
const HP = { reach:400, hover:1300, click:1550, leave:1720, notes:1900, groove:2300 };
const headphones = {
  id:"headphones", name:"Headphones", shape:"win", style:"music", ms:4800, beats:HP, still:3500, summary:"bitClick",
  song:{ beat:"click", hold:"hover" },
  letter:{ at:HP.notes + 100, over:"a", place:"top-left" },
  camera:{ zoom:1.5, x:960, moves:[
    /* a touch in as the headphones come down (the whole hand in the shot) */
    { at:HP.reach, ms:HP.hover - HP.reach, zoom:1.56, x:960 },
    /* the click: in on the chip, the hand on its way out */
    { at:HP.click, ms:80, zoom:1.86, x:960, ease:CAMERA_EASE.snap },
    /* ease back a little for the groove */
    { at:HP.click + 300, ms:900, zoom:1.76, x:980 },
  ], shakes:[{ at:HP.click }] },
  cast:{ a:ONE("winner") },
  cues:[
    { at:HP.reach, sound:"bitStreak", pan:0, opts:{ from:0, to:0 } },
    { at:HP.hover, sound:"neonBuzz", pan:0, opts:{ ms:240 } },
    { at:HP.click, sound:"bitClick", pan:0 },
    { at:HP.click + 40, sound:"neonBuzz", pan:0, opts:{ ms:160, up:true } },
    { at:HP.click + 60, sound:"bitGroove", pan:0, opts:{ ms:2600 }, unless:"song" },
  ],
};

/* ── needle drop: a neon turntable. The chip hops up onto the platter and
   falls flat on it like a record, its photo the label. The house hand
   pinches the tone arm off its rest, swings it over and lowers it until
   the needle hovers just over the record (the wind-up holds here). Drop:
   the needle lands, the song starts, the record spins, the arm rides it,
   the meter jumps and notes rise. ── */
const ND = { hop:150, land:700, flop:760, flat:1120, reach:1000, grab:1450, swing:1480, lower:1930, hover:2250, drop:2450,
  notes:2650, groove:2930 };
const needledrop = {
  id:"needledrop", name:"Needle drop", shape:"win", style:"music", ms:4900, beats:ND, still:3550, summary:"bitNeedle",
  song:{ beat:"drop", hold:"hover" },
  letter:{ at:ND.drop + 350, over:"a", place:"top-left" },
  camera:{ zoom:1.45, x:900, moves:[
    /* in on the turntable as the chip goes flat */
    { at:ND.flop, ms:700, zoom:1.6, x:960 },
    /* closer while the needle comes down */
    { at:ND.lower, ms:ND.hover - ND.lower, zoom:1.82, x:980 },
    /* the drop */
    { at:ND.drop, ms:80, zoom:2.16, x:965, ease:CAMERA_EASE.snap },
    /* ease back for the groove */
    { at:ND.drop + 300, ms:900, zoom:2, x:985 },
  ], shakes:[{ at:ND.drop }] },
  cast:{ a:ONE("winner") },
  cues:[
    { at:ND.hop + 80, sound:"bitHop", pan:-0.4, opts:{ step:0 } },
    { at:ND.land, sound:"bitClink", pan:-0.05 },
    { at:ND.flop + 120, sound:"bitSpinDown", pan:-0.05 },
    { at:ND.reach, sound:"bitStreak", pan:0.5, opts:{ from:0.9, to:0.3 } },
    { at:ND.grab, sound:"bitClick", pan:0.15, opts:{ small:true } },
    { at:ND.swing, sound:"bitFwip", pan:0.1 },
    { at:ND.hover - 200, sound:"neonBuzz", pan:0.05, opts:{ ms:240 } },
    { at:ND.drop, sound:"bitNeedle", pan:0.05 },
    { at:ND.drop + 40, sound:"neonBuzz", pan:0, opts:{ ms:160, up:true } },
    { at:ND.drop + 60, sound:"bitGroove", pan:0, opts:{ ms:2300 }, unless:"song" },
  ],
};

/* ── disco switch: the chip waits on a dark floor under nothing. The
   house hand comes in to a big neon knife switch on a panel by the floor,
   grips it and winds it back (the wind-up holds here, the hand straining
   on it). Throw: the switch slams home with a zap, the song starts, a
   neon disco ball drops in on its chain, beams sweep the room, the floor
   lights and the chip spins on its edge under the ball, on the beat. ── */
const DC = { look:250, reach:450, grip:950, strain:1100, ready:1450, throw:1650, land:1950, groove:2030 };
const disco = {
  id:"disco", name:"Disco switch", shape:"win", style:"music", ms:4700, beats:DC, still:3600, summary:"bitSwitch",
  song:{ beat:"throw", hold:"ready" },
  letter:{ at:DC.land + 300, over:"a", place:"top-right" },
  camera:{ zoom:1.6, x:1060, moves:[
    /* over to the switch as the hand takes it */
    { at:DC.reach, ms:DC.grip - DC.reach, zoom:1.72, x:1130 },
    /* the throw: a kick in on the switch */
    { at:DC.throw, ms:80, zoom:1.82, x:1150, ease:CAMERA_EASE.snap },
    /* out and over to the floor for the ball and the spin */
    { at:DC.throw + 140, ms:420, zoom:1.58, x:1030, ease:CAMERA_EASE.whip },
  ], shakes:[{ at:DC.throw }, { at:DC.land }] },
  cast:{ a:ONE("winner") },
  cues:[
    { at:DC.reach, sound:"bitStreak", pan:0.6, opts:{ from:0.9, to:0.4 } },
    { at:DC.grip, sound:"bitClick", pan:0.4, opts:{ small:true } },
    { at:DC.strain, sound:"bitStrain", pan:0.4, opts:{ ms:350 } },
    { at:DC.ready - 150, sound:"neonBuzz", pan:0.4, opts:{ ms:240 } },
    { at:DC.throw, sound:"bitSwitch", pan:0.4 },
    { at:DC.throw + 40, sound:"bitZip", pan:0, opts:{ small:true } },
    { at:DC.land, sound:"bitClink", pan:-0.1 },
    { at:DC.land + 20, sound:"bitDisco", pan:-0.1, opts:{ ms:1800 } },
    { at:DC.throw + 60, sound:"bitGroove", pan:0, opts:{ ms:2700 }, unless:"song" },
  ],
};

/* ── jukebox: a dark neon jukebox. The chip hops over and hip-checks it;
   it sputters, its lights stutter and it coughs up a couple of notes that
   flop to the floor. The chip backs off and leans away for a harder one
   (the wind-up holds here, the jukebox flickering). Bump: it kicks in,
   the song starts, every tube lights, bubbles run up its sides, notes
   stream out and the chip bobs beside it. ── */
const JB = { hop:150, check:1050, sputter:1150, cough:1300, wind:1650, hold:1950, kick:2150, groove:2400 };
const jukebox = {
  id:"jukebox", name:"Jukebox", shape:"win", style:"music", ms:4800, beats:JB, still:3560, summary:"bitSputter",
  song:{ beat:"kick", hold:"hold" },
  letter:{ at:JB.kick + 350, over:"a", place:"top-left" },
  camera:{ zoom:1.45, x:860, moves:[
    /* over to the jukebox for the hip-check */
    { at:JB.hop + 500, ms:600, zoom:1.52, x:950 },
    /* a touch in while it sputters */
    { at:JB.sputter, ms:JB.hold - JB.sputter, zoom:1.58, x:950 },
    /* the kick */
    { at:JB.kick, ms:80, zoom:1.7, x:950, ease:CAMERA_EASE.snap },
    /* back for the groove */
    { at:JB.kick + 300, ms:900, zoom:1.58, x:960 },
  ], shakes:[{ at:JB.check }, { at:JB.kick, big:true }] },
  cast:{ a:ONE("winner") },
  cues:[
    ...hops(JB.hop + 260, 3, 300, -0.45),
    { at:JB.check, sound:"bitBonk", pan:0 },
    { at:JB.sputter, sound:"bitSputter", pan:0.15, opts:{ ms:JB.hold - JB.sputter + 100 } },
    { at:JB.cough, sound:"bitCough", pan:0.15 },
    { at:JB.cough + 520, sound:"bitFlop", pan:0, opts:{ small:true } },
    { at:JB.wind, sound:"bitScoot", pan:-0.2 },
    { at:JB.kick, sound:"bitThud", pan:0 },
    { at:JB.kick + 30, sound:"neonBuzz", pan:0.15, opts:{ ms:220, up:true } },
    { at:JB.kick + 60, sound:"bitGroove", pan:0, opts:{ ms:2300 }, unless:"song" },
    { at:JB.kick + 200, sound:"bitBubble", pan:0.3 },
  ],
};

/* ── lowrider: the chip rolls in at the wheel of a neon lowrider (a
   convertible in its own candy paint), stops with a nose dip, and the
   engine idles, the car shuddering, the exhaust puffing; the chip leans
   in (the wind-up holds here, the car shuddering). Bass: the song starts
   and the car hops on its hydraulics, front up, back up, front up, then
   the whole car off the ground, on the beat. ── */
const LR = { stop:1250, idle:1400, rev:1600, ready:1850, bass:2050 };
const lowrider = {
  id:"lowrider", name:"Lowrider", shape:"win", style:"music", ms:5200, beats:LR, still:3690, summary:"bitBass",
  song:{ beat:"bass", hold:"ready" },
  letter:{ at:LR.bass + 400, over:"a", place:"top-left" },
  camera:{ zoom:1.38, x:960, moves:[
    /* in on the driver while it idles */
    { at:LR.stop, ms:LR.ready - LR.stop, zoom:1.6, x:960 },
    /* the bass: out to hold the whole car's hop */
    { at:LR.bass, ms:90, zoom:1.42, x:990, ease:CAMERA_EASE.snap },
  ], shakes:[{ at:LR.bass, big:true }, { at:LR.bass + 1440 + 250 }] },
  cast:{ a:ONE("winner") },
  cues:[
    { at:0, sound:"bitRoll", pan:-0.6, opts:{ ms:LR.stop } },
    { at:LR.stop, sound:"bitSkid", pan:0, opts:{ small:true } },
    { at:LR.idle, sound:"bitEngine", pan:-0.1, opts:{ ms:LR.bass - LR.idle } },
    { at:LR.rev, sound:"bitRev", pan:-0.2 },
    { at:LR.bass, sound:"bitBass", pan:0 },
    { at:LR.bass + 20, sound:"bitHydraulic", pan:0.3, opts:{ step:0 } },
    { at:LR.bass + 60, sound:"bitGroove", pan:0, opts:{ ms:2900 }, unless:"song" },
    { at:LR.bass + 480, sound:"bitHydraulic", pan:-0.3, opts:{ step:1 } },
    { at:LR.bass + 960, sound:"bitHydraulic", pan:0.3, opts:{ step:2 } },
    { at:LR.bass + 1440, sound:"bitHydraulic", pan:0, opts:{ step:3 } },
    { at:LR.bass + 1690, sound:"bitBounce", pan:0 },
  ],
};

/* ── saloon piano: a neon upright, a mug of beer on its lid. The chip
   hops over and leaps for the keys; at the top of its leap it hangs in
   the air, cartoon style (the wind-up holds here, the chip treading air).
   Land: it comes down on the keys, the first chord lights under it, the
   song starts; then it hops along the keyboard, each landing lighting a
   few keys and jolting the mug, notes rising off the lid. ── */
const PN = { hop:200, crouch:650, jump:850, apex:1300, hang:1500, land:1700, notes:1900 };
const piano = {
  id:"piano", name:"Saloon piano", shape:"win", style:"music", ms:4800, beats:PN, still:3180, summary:"bitChord",
  song:{ beat:"land", hold:"hang" },
  letter:{ at:PN.land + 400, over:"a", place:"top-left" },
  camera:{ zoom:1.36, x:900, moves:[
    /* up with the leap */
    { at:PN.jump, ms:PN.apex - PN.jump, zoom:1.34, x:900 },
    /* the landing: in on the keys */
    { at:PN.land, ms:90, zoom:1.52, x:960, ease:CAMERA_EASE.snap },
    /* along the keyboard with it */
    { at:PN.land + 300, ms:1500, zoom:1.46, x:1060 },
  ], shakes:[{ at:PN.land, big:true }] },
  cast:{ a:ONE("winner") },
  cues:[
    { at:PN.hop + 150, sound:"bitHop", pan:-0.5, opts:{ step:0 } },
    { at:PN.jump, sound:"bitBoing", pan:-0.3 },
    { at:PN.apex - 100, sound:"neonBuzz", pan:-0.2, opts:{ ms:260 } },
    { at:PN.land, sound:"bitChord", pan:-0.15, opts:{ step:0 } },
    { at:PN.land + 60, sound:"bitGroove", pan:0, opts:{ ms:2900 }, unless:"song" },
    ...[1, 2, 3, 4, 5].map(i => ({ at:PN.land + i * 480, sound:"bitPlink", pan:[0, 0.15, 0.3, 0.15, 0][i - 1], opts:{ step:i } })),
  ],
};

export const MUSIC = [headphones, needledrop, disco, jukebox, lowrider, piano];
