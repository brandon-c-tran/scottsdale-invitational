/* Float Groove art: the critters' prompts (scripts/float-art-jobs.mjs and
   its job modules), with no side effects so any job module can import them.
   Prompts describe the style in plain words and never name another game. */
import path from "node:path";
import { RAW } from "./float-art-lib.mjs";

export const ref = name => path.join(RAW, "refs", `${name}.png`).replaceAll("\\", "/");
export const gen = name => path.join(RAW, "gen", `${name}.png`).replaceAll("\\", "/");

/* what makes each one itself (the lineup's own details) */
export const DETAILS = {
  capybara:"the brown snout patch over its face and little round brown ears",
  javelina:"a spiky grey and black crest of bristles on its head, a pink pig snout and small pointed ears",
  roadrunner:"a long grey beak, a dark blue-grey feathered crest and long dark blue-grey tail feathers rising behind it",
  jackrabbit:"very tall upright ears with pale pink insides",
  tortoise:"an olive-green domed shell on its back with a pale tan face and a few freckles on its paws",
  gila:"a long lizard body covered in black and tan spots, a banded orange and black tail curling up behind it, and a little pink tongue poking out",
  hornedlizard:"a ring of small pointed spikes around its head and a few tiny brown speckles",
  bighorn:"big curled tan horns on both sides of its head and small brown hooves resting on the ring",
  quail:"a single curled black plume rising from its head, tan wing patches and a small grey beak",
  armadillo:"a tan banded shell over its back, a long pointed snout, tall ears and a banded tail",
  coyote:"tall pointed ears, a soft tan face and back, and a big bushy tail with a dark tip",
  otter:"a soft brown-grey head and back, whiskers, small round ears, brown paws and a flat brown tail",
  frog:"a wide flat head with two round eye bumps on top",
};

export const STYLE = "a soft round white body, a thin slightly wobbly black outline of one even weight, small black dot eyes, a tiny deadpan mouth";
export const RING = "Colour the swim ring a single flat bright magenta, with simple soft shading: a lighter highlight along its top and a slightly darker underside, still clearly magenta.";
export const NOTHING_BELOW = "Nothing below the ring: no feet, no legs, no water, no shadow, no ground.";

export function portraitJob(id) {
  return {
    name:`${id}-portrait`, size:"1024x1024", quality:"high", background:"transparent", format:"png",
    refs:[ref(id), ref("lineup")],
    prompt:`Redraw the ${id === "gila" ? "Gila monster" : id === "hornedlizard" ? "horned lizard" : id === "bighorn" ? "bighorn sheep" : id} from the first image as a clean, polished character illustration for a cute rhythm party game, keeping the exact same character design, face, angle and proportions as the first image and the same drawing style as the family in the second image: ${STYLE}, ${DETAILS[id]}. It sits in a round inflatable swim ring, paws resting on the front of the ring, facing the viewer. ${RING} ${NOTHING_BELOW} One character only, centred, filling about three quarters of the frame. Transparent background. No text, no letters, no logos.`,
  };
}

export const POSE_LINES = [
  "Top row, left to right:",
  "1. Idle: paws resting on the front of the ring, deadpan face, exactly like the image.",
  "2. Paddling: leaning to one side, one paw reaching down beside the ring as if paddling, a small white water splash at that paw.",
  "3. Shouting: one arm raised straight up, mouth open wide in a round shout.",
  "4. Pleased: eyes closed as two happy upward arcs, a small content smile, paws on the ring.",
  "Bottom row, left to right:",
  "5. Splashed: a splash of water hitting its face from the side, eyes squeezed shut, a small round o mouth, a few white droplets.",
  "6. Drinking: holding a red plastic party cup to its mouth with both paws, head tipped back, chugging.",
  "7. Cheering: both arms raised high, mouth open in a happy shout.",
  "8. Sad: slumped, ears and arms drooping, a sad frown, the ring half deflated and sagging.",
];

export function sheetJob(id, what = id) {
  return {
    name:`${id}-sheet`, size:"1536x1024", quality:"high", background:"transparent", format:"png",
    refs:[gen(`${id}-portrait`)],
    prompt:`A character pose sheet: the exact character from the image (the ${what} sitting in the magenta swim ring) drawn eight times in eight different poses, arranged in a neat grid of four columns and two rows. Every copy is the same size and scale, well separated from the others by empty space, nothing overlapping or touching. Keep the character identical in every copy: the same soft round white body, ${DETAILS[id] ? `the same ${DETAILS[id]}, ` : ""}the same thin slightly wobbly black outline of one even weight, the same small black dot eyes, the same angle, the same magenta swim ring with its soft shading. In every pose nothing is below the ring: no feet, no water surface, no ground, no shadow.\n${POSE_LINES.join("\n")}\nTransparent background. No text, no numbers, no labels, no grid lines, no borders.`,
  };
}

