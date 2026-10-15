/* Loss bits (no song): anvil, roadrunner, quicksand, dynamite, vulture,
   the rake, needle scratch. cast.a is the one who lost. */
import { CAMERA_EASE, ONE } from "./common.js";

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

export const LOSS = [anvil];
