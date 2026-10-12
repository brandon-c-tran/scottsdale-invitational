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
     span       derived: how long it holds the screen, its last frame kept
                until the lettering has stood READ_MS (a TV window, a
                phone's overlay and the stage's lift-off all run on it)
     beats      named instants (ms from its start): the scene's CSS reads
                each as var(--b-<name>) and its cues land on them, so
                retiming a beat moves the motion and the sound together
     still      the punchline instant: reduced motion shows this frame
     summary    reduced motion's one sound, at the start
     letter     { at, over, place }: when the name (and the moment's fact)
                stamps on the sky, whose name, and where the shot leaves room
                for it (top-left, top-right or top); null letters nothing
                (an idle vignette)
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
/* the least time a landed name and fact stand before the bit lifts off */
export const READ_MS = 1800;
const spanOf = bit => bit.letter ? Math.max(bit.ms, Math.round(bit.letter.at + LETTER_LAND_MS + READ_MS)) : bit.ms;

const freezeAll = value => Array.isArray(value) ? Object.freeze(value.map(freezeAll))
  : value && typeof value === "object" ? Object.freeze(Object.fromEntries(Object.entries(value).map(([k, v]) => [k, freezeAll(v)]))) : value;
const freeze = bit => freezeAll({ ...bit, fits:bit.fits || BIT_SHAPES[bit.shape].triggers, span:spanOf(bit) });

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

/* ══ action movie, played straight like a trailer ══ */

/* ── explosionwalk: the winner walks toward us in dark glasses, gloves
   swinging. Behind it the horizon goes up in a fireball; it does not
   flinch, and the shot drops into slow motion. A burning chip comes down
   out of the sky and slams into the dirt beside it as the speed snaps
   back; it does not look. It stops close, pulls the glasses down with one
   finger and looks at us over them. A beat. Pushes them back up. ──
   The walk's steps are timed from these beats (explosionwalk.css): three
   from the start to the boom, one slow one from the boom to the land, one
   from the land to the stop. */
const EW = { boom:1200, ember:1420, land:2600, stop:3000, lower:3260, look:3440, up:4040, glint:4170 };
const explosionwalk = {
  id:"explosionwalk", name:"Explosion walk", shape:"win", style:"action", ms:4800, beats:EW, still:3800, summary:"bitBoom",
  letter:{ at:EW.stop + 20, over:"a", place:"top-left" },
  /* world x: the walkers centre on 960 and come toward us (explosionwalk.jsx) */
  camera:{ zoom:1.45, x:"walk", moves:[
    /* the slow motion leans in */
    { at:EW.boom + 80, ms:EW.land - EW.boom - 80, zoom:1.62 },
    /* it arrives */
    { at:EW.land, ms:EW.stop - EW.land + 120, zoom:1.86, x:"lead" },
    /* in on the look over the glasses */
    { at:EW.lower - 40, ms:460, zoom:2.45, x:"lead" },
  ], shakes:[{ at:EW.boom, big:true }, { at:EW.land }], washes:[EW.boom] },
  cast:{ a:{ role:"winner", max:4 } },
  cues:[
    { at:400, sound:"bitStep", pan:-0.06, opts:{ step:0 } },
    { at:800, sound:"bitStep", pan:0.06, opts:{ step:1 } },
    { at:EW.boom, sound:"bitBoom", pan:0.04, opts:{ slow:true } },
    { at:EW.land, sound:"bitSlam", pan:0.3 },
    { at:EW.land + 10, sound:"bitStep", pan:0.06, opts:{ step:1 } },
    { at:EW.stop, sound:"bitStep", pan:-0.06, opts:{ step:2 } },
    { at:EW.lower + 30, sound:"bitShades", pan:0.04 },
    { at:EW.up, sound:"bitShades", pan:0.04, opts:{ up:true } },
    { at:EW.glint, sound:"bitGlint", pan:0.1 },
  ],
};

/* ── dontlookback: the loser stands facing us, its own tall stack of chips
   behind its shoulder. A fuse fizzes up the stack. It does not notice.
   The fizz stops. A beat. The stack goes up. It does not turn round: it
   stands there, scorched from the middle down. Its chips come down all
   round it, one off the top of its head (it dips and comes back), and the
   last spins down and lands on its head, flat, like a hat. ── */
const DL = { fuse:340, top:1340, boom:1780, rain:2280, bonk:2760, hat:3420 };
const dontlookback = {
  id:"dontlookback", name:"Don't look back", shape:"loss", style:"action", ms:4600, beats:DL, still:4040, summary:"bitBoom",
  letter:{ at:DL.hat + 60, over:"a", place:"top-left" },
  /* world x: the chip stands at 860, its stack behind it at 1050 (dontlookback.jsx) */
  camera:{ zoom:1.8, x:940, moves:[
    /* lean in on the fuse */
    { at:DL.fuse, ms:DL.top - DL.fuse, zoom:1.9, x:960 },
    /* in on the face that does not move, while its chips come down */
    { at:DL.boom + 420, ms:1500, zoom:2.12, x:880 },
  ], shakes:[{ at:DL.boom, big:true }, { at:DL.bonk }], washes:[DL.boom] },
  cast:{ a:{ role:"loser", max:1 } },
  cues:[
    { at:DL.fuse, sound:"bitFuse", pan:0.22, opts:{ ms:DL.top - DL.fuse } },
    { at:DL.boom, sound:"bitBoom", pan:0.2 },
    /* the chips landing (dontlookback.jsx RAIN), the bonk, the hat */
    ...[[0, -0.42], [150, 0.34], [250, -0.2], [380, 0.46], [560, -0.5], [700, 0.28]].map(([dt, pan], i) =>
      ({ at:DL.rain + dt, sound:"bitChipDrop", pan, opts:{ step:i } })),
    { at:DL.bonk, sound:"bitBonk", pan:-0.08 },
    { at:DL.hat, sound:"bitSpinDown", pan:-0.06 },
  ],
};

/* ── quicksand: the chip stands on a patch of sand, and starts to go down
   into it. It looks down. It flails, grabs at the air, reaches for the
   arm of a saguaro that is just too far. Down it goes until one glove is
   left above the sand; the glove gives a slow thumbs up as it sinks out of
   sight. One bubble. ── */
const QS = { sink:520, notice:1300, flail:1700, reach:2380, slip:2860, under:3160, thumb:3330, gone:3480, bubble:4230 };
const quicksand = {
  id:"quicksand", name:"Quicksand", shape:"loss", style:"action", ms:4800, beats:QS, still:3780, summary:"bitSink",
  letter:{ at:QS.under + 40, over:"a", place:"top-left" },
  /* world x: the chip sinks at 860, the saguaro stands at 1340 (quicksand.jsx) */
  camera:{ zoom:1.8, x:1060, moves:[
    /* it looks down: so do we */
    { at:QS.notice, ms:520, zoom:1.9, x:1010 },
    /* the reach, and the gap */
    { at:QS.reach - 60, ms:360, zoom:2.15, x:1090 },
    /* the last glove */
    { at:QS.under - 80, ms:700, zoom:2.4, x:"glove" },
  ], shakes:[] },
  cast:{ a:{ role:"loser", max:1 } },
  cues:[
    { at:0, sound:"bitWind", pan:0, opts:{ ms:1700 } },
    { at:QS.sink, sound:"bitSink", pan:-0.1, opts:{ ms:QS.notice - QS.sink } },
    { at:QS.flail, sound:"bitFlail", pan:-0.1, opts:{ ms:QS.reach - QS.flail } },
    { at:QS.flail + 80, sound:"bitSink", pan:-0.1, opts:{ ms:QS.under - QS.flail } },
    { at:QS.reach, sound:"bitStrain", pan:0.18, opts:{ ms:QS.slip - QS.reach } },
    { at:QS.under, sound:"bitSink", pan:-0.08, opts:{ ms:320, deep:true } },
    { at:QS.thumb, sound:"bitSqueak", pan:0.04 },
    { at:QS.gone, sound:"bitSink", pan:0.04, opts:{ ms:QS.bubble - QS.gone - 80 } },
    { at:QS.bubble, sound:"bitBubble", pan:0.04 },
  ],
};

const ACTION_BITS = [explosionwalk, dontlookback, quicksand];

/* ══ idle (Oct 10): the TV's downtime, its attract mode between games.
   Slower and drier than a moment: a small story with a turn and an ending
   pose, played once per downtime turn. The cast is the room: `a` is the
   players present (the caller's order), a vignette takes the first one or
   two. Nothing is lettered (`letter:null`: the stage letters no name and
   no fact), so `still` is simply the punchline frame. ══ */
export const IDLE_MS = Object.freeze({ min:6000, max:10000 });
const ROOM = role => ({ a:{ role:"room", max:role } });

/* ── nap: the chip asleep on its back, its head on a little pillow,
   breathing, sleep marks drifting up. A moth circles and lands on its
   face. A glove comes up, slowly, and swats: its own face. The moth was
   already off; it lands on the glove. It sleeps on. ── */
const NP = { mark1:300, enter:1200, circle:2200, mark2:2300, land:3300, twitch:3900, lift:4300, flee:4960, swat:5000,
  perch:6150, sigh:6500, mark3:6700 };
const nap = {
  id:"nap", name:"Nap", shape:"idle", style:"desert", ms:8000, beats:NP, still:7000, summary:"bitSnore", letter:null,
  camera:{ zoom:2.06, x:960, moves:[
    /* the faintest drift in while it sleeps and the moth comes round */
    { at:0, ms:NP.land, zoom:2.3, x:962 },
    /* a nudge in on the swat */
    { at:NP.swat, ms:70, zoom:2.42, x:966, ease:CAMERA_EASE.snap },
    /* settle for the ending */
    { at:NP.swat + 600, ms:1400, zoom:2.3, x:964 },
  ], shakes:[{ at:NP.swat }] },
  cast:ROOM(1),
  cues:[
    { at:NP.mark1, sound:"bitSnore", pan:0, opts:{ small:true } },
    { at:NP.enter, sound:"bitFlutter", pan:-0.3, opts:{ ms:NP.land - NP.enter } },
    { at:NP.mark2, sound:"bitSnore", pan:0, opts:{ small:true } },
    { at:NP.flee, sound:"bitFlutter", pan:0.05, opts:{ ms:NP.perch - NP.flee } },
    { at:NP.swat, sound:"bitSwat", pan:0.05 },
    { at:NP.sigh, sound:"bitSnore", pan:0 },
  ],
};

/* ── armwrestle: two chips at a tiny table, gloves locked, trembling in
   a dead even stalemate. Sweat. The hands tilt a little one way, a little
   the other, back to the middle. Then both turn to the room at the same
   moment, and hold, still locked, still shaking. ── */
const AW = { sweatA:700, tiltA:1000, backA:2200, tiltB:3000, backB:4000, sweatB:4300, center:4700, look:5700, drip:7600 };
const armwrestle = {
  id:"armwrestle", name:"Arm wrestle", shape:"idle", style:"action", ms:9000, beats:AW, still:6900, summary:"bitCreak", letter:null,
  camera:{ zoom:1.62, x:960, moves:[
    /* lean in through the struggle; then the camera holds still for the look */
    { at:300, ms:AW.center - 300, zoom:1.84, x:960 },
  ] },
  cast:ROOM(2),
  cues:[
    { at:AW.sweatA, sound:"bitDrip", pan:-0.3, opts:{ small:true } },
    { at:AW.tiltA, sound:"bitCreak", pan:-0.1, opts:{ ms:900 } },
    { at:AW.backA, sound:"bitCreak", pan:0, opts:{ ms:500, small:true } },
    { at:AW.tiltB, sound:"bitCreak", pan:0.1, opts:{ ms:800 } },
    { at:AW.backB, sound:"bitCreak", pan:0, opts:{ ms:500, small:true } },
    { at:AW.sweatB, sound:"bitDrip", pan:0.3, opts:{ small:true } },
    { at:AW.look - 300, sound:"bitWind", pan:0, opts:{ ms:3500 } },
    { at:AW.drip, sound:"bitDrip", pan:-0.25 },
  ],
};

/* ── saguaro: the chip wants the blossom on top of a saguaro. One glove:
   pricked, a hop back, shaking it. The other: pricked. It fetches a
   stepladder, far too short, stands on it, reaches: not even close. It
   gives up and leans back against the cactus: pricked. The leap takes it
   to the top, where it wanted to be; it looks at us. ── */
const SG = { look:200, reach1:700, prick1:1000, reach2:1900, prick2:2200, exit:2900, enter:3500, set:4200, climb:4500,
  reach:4800, giveup:5800, lean:6300, prick3:6700, jump:6760, top:7300, face:7950 };
const saguaro = {
  id:"saguaro", name:"Saguaro", shape:"idle", style:"desert", ms:9400, beats:SG, still:8500, summary:"bitPrick", letter:null,
  /* world x: the chip at 730, the ladder at 990, the cactus at 1160 (saguaro.jsx) */
  camera:{ zoom:1.66, x:975, moves:[
    /* in on the stepladder */
    { at:SG.set - 200, ms:900, zoom:1.75, x:1010 },
    /* out with the leap, the whole of the saguaro */
    { at:SG.jump, ms:620, zoom:1.18, x:1080, ease:CAMERA_EASE.snap },
  ], shakes:[{ at:SG.top }] },
  cast:ROOM(1),
  cues:[
    { at:SG.prick1, sound:"bitPrick", pan:0.05 },
    { at:SG.prick1 + 120, sound:"bitShake", pan:-0.1 },
    { at:SG.prick2, sound:"bitPrick", pan:0.05 },
    { at:SG.prick2 + 120, sound:"bitShake", pan:-0.12 },
    { at:SG.set, sound:"bitLadder", pan:0 },
    { at:SG.climb + 200, sound:"bitHop", pan:0, opts:{ step:0 } },
    { at:SG.prick3, sound:"bitPrick", pan:0.1, opts:{ big:true } },
    { at:SG.jump, sound:"bitBoing", pan:0.1 },
    { at:SG.jump + 160, sound:"bitLadder", pan:-0.05, opts:{ small:true } },
    { at:SG.top, sound:"bitHop", pan:0.15, opts:{ step:1 } },
  ],
};

/* ── pushups: gloves planted, the chip goes down and up, each one harder
   than the last; on the fourth it goes down and stays there, flat. One
   glove gives a weak thumbs up. ── */
const PU = { down1:500, up1:850, down2:1350, up2:1800, down3:2550, up3:3050, sweat:3300, down4:4150, strain:4750, collapse:5150,
  flat:5300, thumb:6100 };
const pushups = {
  id:"pushups", name:"Push-ups", shape:"idle", style:"slapstick", ms:7400, beats:PU, still:6600, summary:"bitFlop", letter:null,
  /* world x: the chip at 960, its gloves 168 either side (pushups.jsx) */
  camera:{ zoom:1.9, x:960, moves:[
    /* closer as it gets hard */
    { at:PU.down3, ms:PU.down4 - PU.down3, zoom:2.1, x:960 },
    /* toward the glove, the chip still in the shot */
    { at:PU.thumb - 200, ms:800, zoom:2.16, x:1010 },
  ], shakes:[{ at:PU.flat }] },
  cast:ROOM(1),
  cues:[
    { at:PU.up1, sound:"bitHuff", pan:0, opts:{ step:0 } },
    { at:PU.up2, sound:"bitHuff", pan:0, opts:{ step:1 } },
    { at:PU.up3, sound:"bitHuff", pan:0, opts:{ step:2 } },
    { at:PU.sweat, sound:"bitDrip", pan:0.12, opts:{ small:true } },
    { at:PU.strain, sound:"bitHuff", pan:0, opts:{ step:3 } },
    { at:PU.flat, sound:"bitFlop", pan:0 },
    { at:PU.thumb, sound:"bitSqueakSoft", pan:0.12 },
  ],
};

/* ── sweep: the chip sweeps the desert into a neat little pile and pats
   it tidy. A gust takes the pile back across the floor (a tumbleweed
   with it). It stares. It starts again. ── */
const SW = { stroke1:200, stroke2:900, stroke3:1600, stroke4:2300, pat:2950, admire:3350, weed:3900, gust:4000, stare:5000,
  again:6450, again2:7150 };
const sweep = {
  id:"sweep", name:"Sweep", shape:"idle", style:"desert", ms:8000, beats:SW, still:5800, summary:"bitSweep", letter:null,
  camera:{ zoom:1.78, x:1000, moves:[
    /* in on the pile as it gets tidy */
    { at:SW.stroke2, ms:SW.admire - SW.stroke2, zoom:1.94, x:1010 },
    /* hold on the stare, a touch closer */
    { at:SW.stare, ms:1200, zoom:2.04, x:980 },
  ] },
  cast:ROOM(1),
  cues:[
    ...[SW.stroke1, SW.stroke2, SW.stroke3, SW.stroke4].map((at, i) => ({ at, sound:"bitSweep", pan:0.1, opts:{ step:i } })),
    { at:SW.pat, sound:"bitHop", pan:0.2, opts:{ step:0 } },
    { at:SW.pat + 180, sound:"bitHop", pan:0.2, opts:{ step:1 } },
    { at:SW.gust - 250, sound:"bitGust", pan:0, opts:{ ms:1300 } },
    { at:SW.weed + 420, sound:"bitHop", pan:0.3, opts:{ step:0 } },
    { at:SW.weed + 820, sound:"bitHop", pan:-0.1, opts:{ step:1 } },
    { at:SW.again, sound:"bitSweep", pan:0.1, opts:{ step:4 } },
    { at:SW.again2, sound:"bitSweep", pan:0.1, opts:{ step:5 } },
  ],
};

/* ── map: the chip unfolds a paper map bigger than itself and peers over
   it; turns it; turns it again (it was upside down). A roadrunner goes
   by on the horizon. It crumples the map and throws it away; the ball
   comes back off a rock and bonks it. ── */
const MP = { unfold1:300, unfold2:650, unfold3:1000, study:1400, turn1:2000, turn2:3000, runner:3550, crumple:4400, toss:5000,
  rock:5420, bonk:5940, drop:6300 };
const map = {
  id:"map", name:"Map", shape:"idle", style:"desert", ms:8000, beats:MP, still:6060, summary:"bitPaper", letter:null,
  camera:{ zoom:1.8, x:980, moves:[
    /* in on the map */
    { at:MP.unfold1, ms:1300, zoom:1.92, x:960 },
    /* out a little for the throw and the rock */
    { at:MP.toss - 200, ms:500, zoom:1.7, x:1060 },
  ], shakes:[{ at:MP.bonk }] },
  cast:ROOM(1),
  cues:[
    { at:MP.unfold1, sound:"bitPaper", pan:0, opts:{ ms:900 } },
    { at:MP.turn1, sound:"bitPaper", pan:0, opts:{ ms:350, small:true } },
    { at:MP.turn2, sound:"bitPaper", pan:0, opts:{ ms:350, small:true } },
    { at:MP.runner, sound:"bitStreak", pan:0, opts:{ from:0.8, to:-0.8 } },
    { at:MP.runner + 260, sound:"bitBeepFar", pan:-0.7 },
    { at:MP.crumple, sound:"bitCrumple", pan:0 },
    { at:MP.rock, sound:"bitPap", pan:0.5 },
    { at:MP.bonk, sound:"bitBonk", pan:0 },
    { at:MP.drop, sound:"bitPap", pan:0.05, opts:{ small:true } },
  ],
};
const IDLE = [nap, armwrestle, saguaro, pushups, sweep, map];

/* ═══ the slapstick bits (springglove, toohype, dynamite) ═══ */

/* ── springglove: an upset. B is mid victory bounce, fists up; A stands
   off to the side with a boxing glove on a spring in a box, aimed at B.
   B turns and sees it. Nothing. A slams the button: the glove punches B
   off in a straight line into the distance. The spring quivers over the
   empty spot. A star pings where B went. The spring snaps back, clean
   through the box and out its back into A's face; A wobbles, turns to the
   room, thumbs up. ── */
const SPG = { hop:0, turn:800, raise:1320, press:1540, fire:1570, hit:1650, fly:1710, twinkle:2450, retract:3000, home:3130, boop:3240,
  look:3760, thumb:4080 };
const springglove = {
  id:"springglove", name:"Spring glove", shape:"versus", style:"slapstick", ms:4850, beats:SPG, still:4420, summary:"bitPow",
  letter:{ at:SPG.look + 120, over:"a", place:"top-left" },
  camera:{ zoom:1.5, x:"mid", fit:true, moves:[
    /* lean in on the bounce and the standoff */
    { at:200, ms:1200, zoom:1.56 },
    /* after the punch, drift to the empty spot and the sky over it */
    { at:SPG.fly + 160, ms:620, zoom:1.45, x:"sky" },
    /* whip back with the spring to A */
    { at:SPG.retract - 30, ms:200, zoom:1.95, x:"a", ease:CAMERA_EASE.whip },
    /* in on A for the thumbs up */
    { at:SPG.look, ms:1000, zoom:2.06 },
  ], shakes:[{ at:SPG.hit, big:true }, { at:SPG.home }] },
  cast:{ a:{ role:"winner", max:4 }, b:{ role:"beaten", max:4 } },
  cues:[
    ...[0, 1, 2].map(i => ({ at:SPG.hop + 260 * i + 218, sound:"bitHop", pan:0.42, opts:{ step:i } })),
    { at:SPG.press, sound:"bitClick", pan:-0.22 },
    { at:SPG.fire, sound:"bitSproing", pan:0.05 },
    { at:SPG.hit, sound:"bitPow", pan:0.38 },
    { at:SPG.fly, sound:"bitStreak", pan:0.45, opts:{ from:0.4, to:0.95 } },
    { at:SPG.twinkle, sound:"bitTwinkle", pan:0.62 },
    { at:SPG.retract, sound:"bitZip", pan:0.25 },
    { at:SPG.boop, sound:"bitBonk", pan:-0.36 },
    { at:SPG.boop + 60, sound:"bitBoing", pan:-0.36, opts:{ small:true } },
  ],
};

/* ── toohype: a run of wins. It bounces on the spot, fists pumping, each
   bounce higher. The fourth goes straight up out of the frame, right out
   of its shoes. The shoes alone, a beat. It comes back down, misses them
   and drives into the ground up to its middle. A glove comes up out of
   the dirt, thumb up. The shoes walk over to it on their own. ── */
const TH = { hop1:0, hop2:270, hop3:630, wind:1110, launch:1330, fall:2200, crash:2400, pop:2940, turn:3280, walk:3400, arrive:4000 };
const toohype = {
  id:"toohype", name:"Too hype", shape:"win", style:"slapstick", ms:4500, beats:TH, still:4100, summary:"bitPlant",
  letter:{ at:TH.pop, over:"a", place:"top-left" },
  camera:{ zoom:1.8, x:"mid", fit:true, moves:[
    /* lean in with the bounces */
    { at:200, ms:1000, zoom:1.86 },
    /* the shoes, alone: creep in on them */
    { at:TH.launch + 260, ms:640, zoom:1.98, x:"beat" },
    /* back out for the shoes' walk */
    { at:TH.crash + 260, ms:700, zoom:1.84, x:"mid" },
  ], shakes:[{ at:TH.crash, big:true }] },
  cast:{ a:{ role:"winner", max:2 } },
  cues:[
    { at:TH.hop1 + 70, sound:"bitBounce", pan:-0.12, opts:{ step:0 } },
    { at:TH.hop2 + 60, sound:"bitBounce", pan:-0.12, opts:{ step:1 } },
    { at:TH.hop3 + 60, sound:"bitBounce", pan:-0.12, opts:{ step:2 } },
    { at:TH.launch, sound:"bitLaunch", pan:-0.12 },
    { at:TH.fall - 60, sound:"bitFall", pan:0.24, opts:{ ms:260 } },
    { at:TH.crash, sound:"bitPlant", pan:0.24 },
    { at:TH.crash + 60, sound:"bitBoing", pan:0.24 },
    { at:TH.pop, sound:"bitPop", pan:0.4 },
    { at:TH.turn, sound:"bitSneaker", pan:-0.12, opts:{ step:1 } },
    ...[0, 1, 2, 3, 4, 5].map(j => ({ at:TH.walk + 100 * (j + 1), sound:"bitSneaker", pan:Math.round((-0.1 + j * 0.04) * 100) / 100, opts:{ step:j } })),
  ],
};

/* ── dynamite: a loss. A cupcake at a little party table; the chip strikes
   a match and lights the candle, a stick of dynamite, and leans in,
   delighted. It stops. A sweat drop. It looks at the room. BOOM. The smoke
   clears: black with soot, the same pose, the cupcake gone. One cough of
   smoke. A glove drops off into the dirt. ── */
const DY = { strike:300, light:650, lit:680, out:900, admire:1100, realize:1800, look:2050, boom:2850, clear:3500, cough:3780,
  drop:4080, land:4260 };
const dynamite = {
  id:"dynamite", name:"Dynamite", shape:"loss", style:"slapstick", ms:4800, beats:DY, still:4400, summary:"bitBlast",
  letter:{ at:DY.clear, over:"a", place:"top-right" },
  /* world x: the chip stands at 820, the table at 1080 (dynamite.jsx) */
  camera:{ zoom:1.8, x:"mid", moves:[
    /* in a little as it leans in to admire it */
    { at:DY.admire, ms:800, zoom:1.92, x:930 },
    /* in on its face as it turns to the room */
    { at:DY.look, ms:520, zoom:2.25, x:"chip" },
    /* the blast throws the shot back */
    { at:DY.boom, ms:90, zoom:1.72, x:"mid", ease:CAMERA_EASE.snap },
    /* and it creeps back in on what is left */
    { at:DY.clear - 200, ms:1100, zoom:1.95, x:880 },
  ], shakes:[{ at:DY.boom, big:true }], washes:[DY.boom] },
  cast:{ a:{ role:"loser", max:1 } },
  cues:[
    { at:DY.strike, sound:"bitMatch", pan:0 },
    { at:DY.lit, sound:"bitFuseHiss", pan:0.2, opts:{ ms:DY.boom - DY.lit } },
    { at:DY.boom, sound:"bitBlast", pan:0.1 },
    { at:DY.cough, sound:"bitCough", pan:-0.12 },
    { at:DY.land, sound:"bitGloveFlop", pan:-0.3 },
  ],
};

const SLAPSTICK = [springglove, toohype, dynamite];

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
  id:"sunset", name:"Sunset", shape:"win", style:"desert", ms:5000, beats:SS, still:3090, summary:"bitGleam",
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
    { at:SS.glint, sound:"bitGleam", pan:-0.05 },
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

const DESERT = [butte, sunset, statue, vulture];

export const BITS = Object.freeze([quickdraw, anvil, roadrunner, ...ACTION_BITS, ...IDLE, ...SLAPSTICK, ...DESERT].map(freeze));
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
