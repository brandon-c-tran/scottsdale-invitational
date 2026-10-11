/* The floating gloves (bits, Oct 10): white cartoon gloves with four
   fingers (three and a thumb) and a flared cuff, no arms. Each pose is
   drawn once, for the RIGHT hand of a 240 px chip, in canvas px, with the
   wrist (the cuff's open end, where an arm would be) at 0 0. The left hand
   is the same drawing mirrored.

   A pose is groups of parts, drawn the rubber-hose way: each group is laid
   down in ink a keyline wider than itself, then painted, so a group reads
   as one silhouette with one outline, and a later group keeps its own line
   over an earlier one (fingers over the palm, the cuff over the hand's
   heel). Parts:
     ["blob", d]       a filled shape
     ["cap", d, w]     a sausage: a stroke w wide with round ends (a finger, a thumb)
   `shade` is one hard tone on the shadow side; `held` is where a prop held
   in that pose sits (the top of a fist round a grip, a fingertip). Pure. */

/* the cuff: a short flared band, its open end at the wrist */
const CUFF_DOWN = ["blob", "M-26,-3 C-26,-10 26,-10 26,-3 L21,17 C14,21 -14,21 -21,17 Z"];
const CUFF_UP = ["blob", "M-26,3 C-26,10 26,10 26,3 L21,-17 C14,-21 -14,-21 -21,-17 Z"];
const CUFF_SIDE = ["blob", "M-3,-26 C-10,-26 -10,26 -3,26 L17,21 C21,14 21,-14 17,-21 Z"];
const PALM_DOWN = ["blob", "M-21,12 L21,12 C27,25 27,44 20,55 L-20,55 C-27,44 -27,25 -21,12 Z"];
const PALM_UP = ["blob", "M-21,-12 L21,-12 C27,-25 27,-44 20,-55 L-20,-55 C-27,-44 -27,-25 -21,-12 Z"];
const FIST = ["blob", "M12,-21 C22,-29 48,-30 57,-20 C64,-11 64,11 57,20 C48,29 22,28 12,21 Z"];
const FIST_SHADE = "M14,12 C24,20 46,21 58,14 C55,24 47,28 36,28 C25,28 18,25 13,20 Z";
const HANG_SHADE = "M-21,16 C-26,28 -26,44 -20,54 L-12,54 C-17,44 -18,28 -14,16 Z";

export const GLOVE_POSES = Object.freeze({
  /* hanging at the side, fingers loose, thumb forward: the default */
  rest:{
    shadeAt:1,
    groups:[[["cap", "M18,24 Q31,30 32,45", 16]], [PALM_DOWN],
      [["cap", "M-13,46 Q-14,63 -11,75", 16], ["cap", "M0,49 Q0,67 3,79", 16], ["cap", "M13,46 Q15,62 18,72", 15]], [CUFF_DOWN]],
    shade:[HANG_SHADE],
  },
  /* the gunslinger's hand: hovering low, fingers spread and curled, ready */
  ready:{
    shadeAt:1,
    groups:[[["cap", "M18,22 Q36,22 41,37", 16]], [PALM_DOWN],
      [["cap", "M-13,46 Q-22,60 -19,75", 16], ["cap", "M0,49 Q0,66 8,78", 16], ["cap", "M13,45 Q25,54 29,68", 15]], [CUFF_DOWN]],
    shade:[HANG_SHADE],
  },
  /* palm to the room, fingers up and spread: a grab at the air, surprise */
  open:{
    shadeAt:1,
    groups:[[["cap", "M-19,-26 Q-33,-30 -40,-47", 16]], [PALM_UP],
      [["cap", "M-13,-48 L-20,-80", 16], ["cap", "M0,-52 L0,-87", 16], ["cap", "M13,-48 L20,-79", 15]], [CUFF_UP]],
    shade:["M21,-16 C26,-28 26,-44 20,-54 L12,-54 C17,-44 18,-28 14,-16 Z"],
  },
  /* a fist from the side, knuckles to the right */
  fist:{
    groups:[[FIST], [["cap", "M46,-14 L57,-14", 15], ["cap", "M48,0 L59,0", 15], ["cap", "M46,14 L56,14", 14]],
      [["cap", "M25,-19 Q40,-27 50,-17", 14]], [CUFF_SIDE]],
    shade:[FIST_SHADE],
  },
  /* holding a grip: a fist closed under a handle, the first finger round a trigger */
  grip:{
    groups:[[FIST], [["cap", "M48,1 L59,1", 15], ["cap", "M46,15 L56,15", 14], ["cap", "M52,-14 Q63,-15 65,-6", 13]],
      [["cap", "M24,-20 Q38,-28 49,-20", 14]], [CUFF_SIDE]],
    shade:[FIST_SHADE],
    held:{ x:45, y:-27 },
  },
  /* the first finger out: pointing, or a gun hung on it to spin */
  point:{
    groups:[[FIST], [["cap", "M48,1 L59,1", 15], ["cap", "M46,15 L56,15", 14]], [["cap", "M50,-13 L88,-13", 15]],
      [["cap", "M24,-20 Q36,-26 45,-19", 14]], [CUFF_SIDE]],
    shade:[FIST_SHADE],
    held:{ x:80, y:-13 },
  },
  /* laid flat, palm down, fingers to the right: resting on something */
  flat:{
    shadeAt:1,
    groups:[[["cap", "M28,10 Q42,20 54,16", 13]],
      [["blob", "M12,-16 C26,-22 46,-21 58,-13 L60,10 C46,15 26,16 12,15 Z"]],
      [["cap", "M54,-6 L86,-4", 15], ["cap", "M55,5 L89,7", 15]], [CUFF_SIDE]],
    shade:["M12,8 C28,12 46,11 60,6 L60,10 C46,15 26,16 12,15 Z"],
  },
  /* thumb up */
  thumb:{
    groups:[[FIST], [["cap", "M46,-11 L57,-11", 15], ["cap", "M48,3 L59,3", 15], ["cap", "M46,16 L56,16", 14]],
      [["cap", "M30,-18 Q30,-34 33,-50", 16]], [CUFF_SIDE]],
    shade:[FIST_SHADE],
  },
});
export const GLOVE_POSE_NAMES = Object.freeze(Object.keys(GLOVE_POSES));

/* every pose fits this box (art px, wrist at 0 0), keylines included */
export const GLOVE_BOX = Object.freeze({ x:-62, y:-112, w:176, h:212 });

/* The shoes: a chunky cartoon sneaker from the side, toes to the right,
   standing on 0 0 (the middle of its sole). Same two-pass drawing. */
export const SHOE_ART = Object.freeze({
  upper:"M-24,-6 C-26,-20 -17,-28 -4,-27 C5,-26 10,-20 12,-16 C25,-18 34,-12 34,-4 L34,-2 L-24,-2 Z",
  sole:["M-22,-3 L32,-3", 10],
  shine:"M-13,-21 C-9,-24 -3,-24 1,-21",
  box:{ x:-38, y:-42, w:86, h:54 },
});
