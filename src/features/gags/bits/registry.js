/* Bits (Oct 10): the TV's comic moments, the cast being the players' own
   photo chips with floating gloves. A bit is a few seconds of straight-faced
   physical comedy written for a SHAPE of moment, in one of three styles,
   picked at random per moment from its shape's pool.

     versus  an upset: cast.a won, cast.b was beaten
     win     a run of wins, a new leader: cast.a
     loss    a big losing bet, a new last place: cast.a
     idle    the TV's downtime (no cast needed)

   This file is the contract, pure data and nothing that draws (the scenes
   are bits/scenes.jsx, keyed by id), so the moment model, the TV, a phone
   and the tests read the same timings:

     id, name   the bit, and what the reel calls it
     shape, style
     ms         its length; a moment bit runs MOMENT_MS.min to .max
     beats      named instants (ms from its start): the scene's CSS reads
                each as var(--b-<name>) and its cues land on them, so
                retiming a beat moves the motion and the sound together
     still      the punchline instant: reduced motion shows this frame
     summary    reduced motion's one sound, at the start
     letter     { at, over, place }: when the name (and the moment's fact)
                stamps on the sky, whose name, and where the shot leaves room
                for it (top-left, top-right or top)
     camera     the shot (bits/camera.js): its zoom and centre, moves on the
                bit's clock, shakes and washes
     cast       the roles the scene needs: { a:{ role, max }, b:... }
     cues       [{ at, sound, pan, opts }]: kit recipes on the room bus
     fits       the triggers it suits (default: every trigger of its shape) */
import { CAMERA_EASE } from "./camera.js";

export const BIT_SHAPES = Object.freeze({
  versus:Object.freeze({ name:"Versus", triggers:Object.freeze(["An upset"]) }),
  win:Object.freeze({ name:"Win", triggers:Object.freeze(["3 straight wins", "A new leader"]) }),
  loss:Object.freeze({ name:"Loss", triggers:Object.freeze(["A big losing bet", "A new last place"]) }),
  idle:Object.freeze({ name:"Idle", triggers:Object.freeze(["Between games"]) }),
});
export const SHAPES = Object.freeze(Object.keys(BIT_SHAPES));
export const BIT_STYLES = Object.freeze({ action:"Action movie", slapstick:"Cartoon slapstick", desert:"Deadpan desert" });
export const STYLES = Object.freeze(Object.keys(BIT_STYLES));
/* a moment bit's length; idle vignettes may run longer */
export const MOMENT_MS = Object.freeze({ min:3000, max:5500 });
/* how long a bit takes to come up on the painting and to lift off it */
export const BIT_IN_MS = 260;
export const BIT_OUT_MS = 380;
/* how long the name and the fact take to stamp onto the sky (bits.css
   bit-stamp, the fact a beat behind): a still shows them landed */
export const LETTER_LAND_MS = 480;
export const LETTER_PLACES = Object.freeze(["top-left", "top-right", "top"]);

const freezeAll = value => Array.isArray(value) ? Object.freeze(value.map(freezeAll))
  : value && typeof value === "object" ? Object.freeze(Object.fromEntries(Object.entries(value).map(([k, v]) => [k, freezeAll(v)]))) : value;
const freeze = bit => freezeAll({ ...bit, fits:bit.fits || BIT_SHAPES[bit.shape].triggers });

/* ── quickdraw: an upset at high noon. Far apart on the floor, the wind,
   a tumbleweed between them, the long hold. B's hand twitches; A's whips
   out a revolver far too small: BANG, and the kick knocks A back a step,
   shoes skidding. The camera whips to B: nothing happens. Then B goes over
   backwards, stiff as a board. A blows the smoke off the barrel, spins
   it... and fumbles it. ── */
const QD = { tumble:40, twitch:1360, draw:1580, bang:1660, kick:1700, whip:2040, fall:2700, land:3040, blow:3380, spin:3700,
  fumble:4080, bonk:4210, drop:4470, look:4600 };
const quickdraw = {
  id:"quickdraw", name:"Quick draw", shape:"versus", style:"action", ms:5400, beats:QD, still:5020, summary:"bitCrack",
  letter:{ at:QD.land + 200, over:"a", place:"top-left" },
  camera:{ zoom:1.5, x:"mid", fit:true, moves:[
    /* lean in through the standoff */
    { at:300, ms:1250, zoom:1.6 },
    /* punch in on the shot, and stay for its kick */
    { at:QD.bang, ms:90, zoom:1.95, x:"a", ease:CAMERA_EASE.snap },
    /* whip to B, who just stands there */
    { at:QD.whip, ms:170, zoom:1.95, x:"b", ease:CAMERA_EASE.whip },
    /* back out for the rest of it */
    { at:QD.land + 60, ms:480, zoom:1.5, x:"mid" },
  ], shakes:[{ at:QD.bang, big:true }, { at:QD.land }], washes:[QD.bang] },
  cast:{ a:{ role:"winner", max:4 }, b:{ role:"beaten", max:4 } },
  cues:[
    { at:0, sound:"bitWind", pan:0, opts:{ ms:QD.twitch + 200 } },
    { at:QD.tumble + 367, sound:"bitHop", pan:0.3, opts:{ step:0 } },
    { at:QD.tumble + 733, sound:"bitHop", pan:-0.28, opts:{ step:1 } },
    { at:QD.draw, sound:"bitDraw", pan:-0.3 },
    { at:QD.bang, sound:"bitCrack", pan:-0.25 },
    { at:QD.kick, sound:"bitSkid", pan:-0.4 },
    { at:QD.whip, sound:"bitStreak", pan:0, opts:{ from:-0.4, to:0.4 } },
    { at:QD.land, sound:"bitThud", pan:0.3 },
    { at:QD.blow, sound:"bitPuff", pan:-0.42 },
    { at:QD.spin, sound:"bitTwirl", pan:-0.38 },
    { at:QD.bonk, sound:"bitBonk", pan:-0.38 },
    { at:QD.drop, sound:"bitClink", pan:-0.3 },
  ],
};

/* ── anvil: the chip admires its own stack. A shadow grows under it.
   It looks up. CLANG: a pancake, stars going round. It peels itself off
   the floor like a sticker, boings back into shape, turns to the room for
   a beat, and limps off on one shoe (the other is still flat on the
   floor). ── */
const AN = { admire:200, shadow:420, notice:1640, sweat:1750, drop:1900, hit:2020, rebound:2080, stars:2130, thud:2350,
  peel:2780, pop:3100, look:3560, limp:4580 };
const anvil = {
  id:"anvil", name:"Anvil", shape:"loss", style:"slapstick", ms:5450, beats:AN, still:2720, summary:"bitClang",
  letter:{ at:AN.stars + 60, over:"a", place:"top-right" },
  /* world x: the chip stands at 820, its stack at 1180 (anvil.jsx) */
  camera:{ zoom:1.8, x:900, moves:[
    /* ease in while the shadow grows */
    { at:AN.shadow, ms:1220, zoom:1.92, x:860 },
    /* the clang */
    { at:AN.hit, ms:70, zoom:2, x:830, ease:CAMERA_EASE.snap },
    /* back out for the pancake and its stars */
    { at:AN.stars + 120, ms:520, zoom:1.8, x:860 },
    /* in on it, looking at the room */
    { at:AN.look, ms:520, zoom:2.3, x:815 },
    /* out as it limps off */
    { at:AN.limp, ms:700, zoom:1.8, x:760 },
  ], shakes:[{ at:AN.hit, big:true }, { at:AN.thud }] },
  cast:{ a:{ role:"loser", max:1 } },
  cues:[
    { at:AN.shadow, sound:"bitWhistle", pan:0, opts:{ ms:AN.notice - AN.shadow - 160 } },
    { at:AN.hit, sound:"bitClang", pan:-0.1 },
    { at:AN.thud, sound:"bitThud", pan:-0.4 },
    { at:AN.stars, sound:"bitStars", pan:-0.1, opts:{ ms:AN.peel - AN.stars - 80 } },
    { at:AN.peel, sound:"bitPeel", pan:-0.1 },
    { at:AN.pop, sound:"bitBoing", pan:-0.1 },
    /* each limp lands at the end of its 240 ms hop (anvil.css an-limp-bob) */
    ...[0, 1, 2].map(i => ({ at:AN.limp + 240 * (i + 1), sound:"bitHop", pan:Math.round((-0.12 - i * 0.14) * 100) / 100, opts:{ step:i } })),
  ],
};

/* ── roadrunner: the chip alone on the floor, the wind. A roadrunner
   comes in like a shot and skids a long way to a stop beside it, heels
   in, leaning back into its own dust. It leans in: beep beep. Gone, and
   the chip with it. When the dust clears only its shadow is left. The
   shadow notices, pulls back, winds itself up on the spot, and runs off
   after it. ── */
const RR = { arrive:1000, skid:1110, stop:1410, beep:1760, turn:1800, leave:2160, clear:2900, notice:3420, windup:3640, zip:4140 };
const roadrunner = {
  id:"roadrunner", name:"Roadrunner", shape:"loss", style:"desert", ms:5000, beats:RR, still:3390, summary:"bitBeep",
  letter:{ at:RR.clear, over:"a", place:"top-left" },
  /* world x: the chip stands at 880, the bird stops at 1330 (roadrunner.jsx) */
  camera:{ zoom:1.8, x:1080, moves:[
    /* the chip alone: the faintest drift in */
    { at:0, ms:RR.arrive - 80, zoom:1.86, x:1060 },
    /* lean in on what is left */
    { at:RR.clear - 120, ms:720, zoom:2.3, x:910 },
    /* a flinch after it as it goes, then the empty floor */
    { at:RR.zip, ms:240, zoom:2.1, x:740, ease:CAMERA_EASE.whip },
  ], shakes:[{ at:RR.stop }] },
  cast:{ a:{ role:"loser", max:1 } },
  cues:[
    { at:0, sound:"bitWind", pan:0, opts:{ ms:4800 } },
    { at:RR.arrive, sound:"bitStreak", pan:0, opts:{ from:0.95, to:0.5 } },
    { at:RR.skid, sound:"bitSkid", pan:0.45, opts:{ ms:RR.stop - RR.skid } },
    { at:RR.beep, sound:"bitBeep", pan:0.34 },
    { at:RR.leave, sound:"bitStreak", pan:0, opts:{ from:0.35, to:-0.95 } },
    { at:RR.notice, sound:"bitBoing", pan:0, opts:{ small:true } },
    { at:RR.windup, sound:"bitRev", pan:0.08, opts:{ ms:RR.zip - RR.windup } },
    { at:RR.zip, sound:"bitZip", pan:-0.2 },
  ],
};

/* ══ the deadpan desert (Oct 10): butte, sunset, statue, vulture ══ */

/* ── butte: an upset. B stands smug on top of a tall narrow rock pillar
   rising out of a canyon, gloves on hips; A at the cliff's edge below,
   looking up. A walks over and pokes the pillar once with one finger.
   Nothing. A crack runs up it, and the pillar drops away beneath B. B
   stays where it was, standing on nothing. It looks down. It looks at
   us. It drops out of frame, a whistle falling away after it. A beat;
   a small puff of dust comes up from far below. A dusts off its gloves.
   A side of more: the whole beaten side stands on the pillar. ── */
const BT = { look:140, walk:420, raise:980, poke:1160, crack:1780, crumble:2040, down:2490, face:2890, drop:3570, peek:3700,
  puff:4520, dust:4720 };
const butte = {
  id:"butte", name:"Butte", shape:"versus", style:"desert", ms:5300, beats:BT, still:3320, summary:"bitCrumble",
  letter:{ at:BT.crumble + 260, over:"a", place:"top-left" },
  /* world x: the cliff's edge at 960, the pillar a gap past it (butte.jsx) */
  camera:{ zoom:1.38, x:"mid", fit:true, moves:[
    /* in on the finger */
    { at:BT.raise - 140, ms:420, zoom:1.84, x:"poke" },
    /* out as the crack runs up */
    { at:BT.crack, ms:220, zoom:1.38, x:"mid", ease:CAMERA_EASE.snap },
    /* creep in on B, standing on nothing */
    { at:BT.down - 220, ms:1000, zoom:1.46, x:"b" },
    /* over to A for the dust-off */
    { at:BT.drop + 380, ms:620, zoom:1.5, x:"a" },
  ], shakes:[{ at:BT.crumble }] },
  cast:{ a:{ role:"winner", max:4 }, b:{ role:"beaten", max:4 } },
  cues:[
    { at:0, sound:"bitWind", pan:0, opts:{ ms:1500 } },
    ...[0, 1, 2].map(i => ({ at:BT.walk + 140 * (i + 1) - 10, sound:"bitHop", pan:Math.round((-0.3 + i * 0.05) * 100) / 100, opts:{ step:i } })),
    { at:BT.poke + 70, sound:"bitPoke", pan:0.12 },
    { at:BT.crack, sound:"bitCrackle", pan:0.2, opts:{ ms:200 } },
    { at:BT.crumble, sound:"bitCrumble", pan:0.25 },
    { at:BT.drop + 50, sound:"bitFallAway", pan:0.25, opts:{ ms:BT.puff - BT.drop - 400 } },
    { at:BT.puff, sound:"bitFarThud", pan:0.25 },
    { at:BT.dust, sound:"bitPat", pan:-0.12, opts:{ step:0 } },
    { at:BT.dust + 170, sound:"bitPat", pan:-0.12, opts:{ step:1 } },
  ],
};

/* ── sunset: a win. The winner on top of a butte, fists on hips, the sun
   behind it. The sun sets, fast; the sky relamps warmer in six hard
   steps and the desert goes to silhouette. A pair of sunglasses comes
   down slowly on a string from above the frame and settles on its face.
   A glint off the lens. A tumbleweed blows past below. The string yanks
   them back up and out. The chip never moves. ── */
const SS = { sink:200, set:1480, lower:1660, settle:2760, glint:2980, weed:3140, yank:3860 };
const sunset = {
  id:"sunset", name:"Sunset", shape:"win", style:"desert", ms:5000, beats:SS, still:3090, summary:"bitGlint",
  letter:{ at:SS.set + 60, over:"a", place:"top-left" },
  /* world x: the butte under the winner at 960 (sunset.jsx) */
  camera:{ zoom:1.5, x:"chip", moves:[
    /* a slow push in through the sunset and the shades coming down */
    { at:0, ms:SS.settle, zoom:1.66, x:"chip" },
  ] },
  cast:{ a:{ role:"winner", max:4 } },
  cues:[
    { at:0, sound:"bitWind", pan:0, opts:{ ms:1700 } },
    ...[0, 1, 2, 3, 4, 5].map(i => ({ at:SS.sink + 80 + i * 150, sound:"bitRelamp", pan:0, opts:{ step:i } })),
    { at:SS.lower, sound:"bitRatchet", pan:0, opts:{ ms:SS.settle - SS.lower } },
    { at:SS.glint, sound:"bitGlint", pan:-0.05 },
    { at:SS.weed, sound:"bitWind", pan:-0.2, opts:{ ms:800 } },
    { at:SS.weed + 250, sound:"bitHop", pan:-0.3, opts:{ step:0 } },
    { at:SS.weed + 500, sound:"bitHop", pan:0.25, opts:{ step:1 } },
    { at:SS.yank, sound:"bitYank", pan:0 },
  ],
};

/* ── statue: a win. The winner crouches and strikes a heroic pose, one
   finger to the sky, a fist on its hip. A sheen runs down it and it is
   gold. A stone plinth grinds up out of the ground under it. A cactus
   wren lands on its head, pecks it once (tink), settles and fluffs up.
   Then the raised finger slowly droops. ── */
const ST = { crouch:260, pose:480, sheen:900, rise:1440, thump:2040, wren:2420, land:2800, peck:3060, fluff:3380, droop:3700 };
const statue = {
  id:"statue", name:"Statue", shape:"win", style:"desert", ms:5200, beats:ST, still:4720, summary:"bitTink",
  letter:{ at:ST.thump + 80, over:"a", place:"top-left" },
  /* world x: the winner at 900 (statue.jsx) */
  camera:{ zoom:1.76, x:"chip", fit:true, moves:[
    /* back out as the plinth lifts it */
    { at:ST.rise, ms:620, zoom:1.42, x:"chip" },
    /* in on the bird and the finger */
    { at:ST.wren + 200, ms:1400, zoom:1.6, x:"top" },
  ], shakes:[{ at:ST.thump }] },
  cast:{ a:{ role:"winner", max:4 } },
  cues:[
    { at:ST.pose, sound:"bitStreak", pan:0, opts:{ from:-0.1, to:0.1 } },
    { at:ST.sheen, sound:"bitSheen", pan:0 },
    { at:ST.rise, sound:"bitGrind", pan:0, opts:{ ms:ST.thump - ST.rise } },
    { at:ST.thump, sound:"bitThud", pan:0 },
    { at:ST.wren, sound:"bitFlap", pan:-0.4, opts:{ small:true, step:0 } },
    { at:ST.wren + 150, sound:"bitFlap", pan:-0.25, opts:{ small:true, step:1 } },
    { at:ST.land - 100, sound:"bitFlap", pan:-0.1, opts:{ small:true, step:2 } },
    { at:ST.peck, sound:"bitTink", pan:-0.02 },
    { at:ST.fluff, sound:"bitFluff", pan:-0.02 },
    { at:ST.droop, sound:"bitDroop", pan:0.1, opts:{ ms:900 } },
  ],
};

/* ── vulture: a loss. The chip alone, glum. A turkey vulture glides in
   and lands beside it (flap, dust) and folds its wings. They look at
   each other. The chip scoots a little away; the vulture scoots after
   it; again, faster. The vulture tucks a napkin under its beak and
   produces a knife and fork. The chip looks at us. Hold. ── */
const VU = { glide:420, land:1080, fold:1260, stare:1560, scoot:2180, follow:2420, scoot2:2700, follow2:2840, napkin:3160, cutlery:3520,
  look:3960 };
const vulture = {
  id:"vulture", name:"Vulture", shape:"loss", style:"desert", ms:5300, beats:VU, still:4700, summary:"bitShing",
  letter:{ at:VU.land + 160, over:"a", place:"top-left" },
  /* world x: the chip at 820, the vulture lands at 1170 (vulture.jsx) */
  camera:{ zoom:1.8, x:1000, moves:[
    /* in a little on the two of them */
    { at:VU.stare - 200, ms:600, zoom:1.9, x:975 },
    /* after them as they scoot */
    { at:VU.scoot, ms:820, zoom:1.9, x:900 },
    /* in on the chip, the knife and fork at its shoulder */
    { at:VU.look - 120, ms:560, zoom:2.2, x:840 },
  ], shakes:[{ at:VU.land }] },
  cast:{ a:{ role:"loser", max:1 } },
  cues:[
    { at:0, sound:"bitWind", pan:0, opts:{ ms:1200 } },
    ...[0, 1, 2].map(i => ({ at:VU.glide + 120 + i * 180, sound:"bitFlap", pan:0.5 - i * 0.08, opts:{ step:i } })),
    { at:VU.land, sound:"bitThud", pan:0.3 },
    { at:VU.fold, sound:"bitFlap", pan:0.3, opts:{ step:3 } },
    { at:VU.scoot, sound:"bitScoot", pan:-0.15, opts:{ step:0 } },
    { at:VU.follow, sound:"bitScoot", pan:0.2, opts:{ step:1 } },
    { at:VU.scoot2, sound:"bitScoot", pan:-0.22, opts:{ step:2 } },
    { at:VU.follow2, sound:"bitScoot", pan:0.12, opts:{ step:3 } },
    { at:VU.napkin, sound:"bitFwip", pan:0.12 },
    { at:VU.cutlery, sound:"bitShing", pan:0.08 },
  ],
};

export const BITS = Object.freeze([quickdraw, anvil, roadrunner,
  butte, sunset, statue, vulture,
].map(freeze));
const BY_ID = new Map(BITS.map(bit => [bit.id, bit]));
export const bitById = id => BY_ID.get(id) || null;
export const bitsOf = shape => BITS.filter(bit => bit.shape === shape);

/* FNV-1a over a string: the same seed hashes the same on every screen */
export function seedHash(text) {
  let h = 0x811c9dc5;
  for (const ch of String(text)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/* The bit a moment plays: one of its shape's pool, picked by its seed
   (the moment's own key, so every TV and phone picks the same), never one
   in `recent` (bit ids already played, newest last) while any other
   remains; when all have played, never the newest again if the pool has
   another. Null for a shape with no bits. */
export function pickBit(shape, seed, recent = []) {
  const pool = bitsOf(shape);
  if (!pool.length) return null;
  const played = Array.isArray(recent) ? recent : [];
  let candidates = pool.filter(bit => !played.includes(bit.id));
  if (!candidates.length) {
    const newest = played[played.length - 1];
    candidates = pool.length > 1 ? pool.filter(bit => bit.id !== newest) : pool;
  }
  return candidates[seedHash(`${shape}:${seed}`) % candidates.length];
}

/* a bit's beats as custom properties for its scene's CSS */
export const beatVars = bit => Object.fromEntries(Object.entries(bit?.beats || {}).map(([name, ms]) => [`--b-${name}`, `${Math.round(ms)}ms`]));
