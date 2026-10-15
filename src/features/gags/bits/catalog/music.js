/* Win bits with music (the song starts ON the action, its wind-up held
   until the speaker plays): headphones, needle drop, disco switch,
   jukebox, lowrider, saloon piano. A cue marked `unless:"song"` plays
   only when no song is coming (the bit's own little groove). */
import { CAMERA_EASE, ONE } from "./common.js";

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

export const MUSIC = [headphones];
