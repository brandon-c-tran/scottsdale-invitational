/* Float Groove art, the kayaks (float/GROOVE.md v3 item 10): the image jobs
   for scripts/float-art-gen.mjs. Each critter: a 1024 portrait in its kayak
   (from its tube portrait and its lineup cell, the kayak and paddle copied
   from the first approved kayak portrait so the 14 share one boat), then
   one 3 x 3 sheet of the nine poses from that portrait (one generation
   keeps one character), then the photo tee sheet from that sheet.

     FLOAT_ART_RAW=<raw>/kayak node scripts/float-art-kayak-jobs.mjs portraits [ids]
     ... sheets [ids] | tees [ids]
   The hull is flat magenta and the paddle blades flat violet: both are
   keyed into the one `tube` mask the rider's colour fills.
   Prompts describe the style in plain words and never name another game. */
import fs from "node:fs";
import path from "node:path";
import { ALL_CRITTER_IDS } from "../float/shared/looks.js";
import { RAW } from "./float-art-lib.mjs";
import { DETAILS, STYLE } from "./float-art-prompts.mjs";

export const ref = name => path.join(RAW, "refs", `${name}.png`).replaceAll("\\", "/");
export const gen = name => path.join(RAW, "gen", `${name}.png`).replaceAll("\\", "/");

/* the kayak every critter shares, taken from this one once it is approved */
export const KAYAK_MODEL = process.env.KAYAK_MODEL || "capybara";
export const WHAT = { gila:"Gila monster", hornedlizard:"horned lizard", bighorn:"bighorn sheep", winnie:"cavapoo puppy" };
const what = id => WHAT[id] || id;
const details = id => id === "winnie"
  ? "soft apricot curly fur all over, floppy curly ears, a small black button nose and a plain light-blue bandanna around his neck (one flat colour, no pattern, no letters)"
  : DETAILS[id];

export const KAYAK = "a small, short, stubby sit-on-top kayak, toy-like, only about one and a half times as long as the critter is wide, seen in a compact three-quarter view: its rounded pointed bow toward the right and slightly toward the viewer, its stern to the left and slightly away, so we see a little of its top deck and its near side";
export const HULL = "Colour the kayak's hull one flat bright magenta (like #ff1fa0) with simple soft shading: a lighter highlight along the top of its side and a slightly darker lower edge, still clearly magenta.";
export const PADDLE = "a double-bladed kayak paddle: one straight thin dark grey shaft with a flat oval blade at each end; both blades one flat bright violet-blue (like #6a3cff) with simple soft shading, the shaft dark grey, never magenta, never violet";
export const WATERLINE = "The kayak sits in the water: draw only the part above the water, its bottom edge one gentle flat line along the waterline. Nothing else below it: no water surface, no ripples, no reflection, no shadow, no ground, no feet.";

export function portraitJob(id) {
  const refs = id === "winnie" ? [ref("winnie-portrait-tube"), ref("winnie-pixel")] : [ref(`${id}-portrait-tube`), ref(id)];
  const model = id !== KAYAK_MODEL && fs.existsSync(gen(`${KAYAK_MODEL}-kayak-portrait`));
  if (model) refs.push(gen(`${KAYAK_MODEL}-kayak-portrait`));
  const n = refs.length;
  return {
    name:`${id}-kayak-portrait`, size:"1024x1024", quality:"high", background:"transparent", format:"png", refs,
    prompt:`Redraw the ${what(id)} from the first image as a clean, polished character illustration for a cute rhythm party game, keeping the exact same character design, face and proportions as the first image${id === "winnie" ? "" : " (the second image is the same character from the original lineup)"}: ${STYLE}, ${details(id)}. Instead of the swim ring it now sits in ${model ? `exactly the same kayak, at exactly the same angle, size and place in the frame, holding exactly the same paddle in the same way as the critter in image ${n}` : KAYAK}. The critter sits in the middle of the kayak, its body from the waist up above the deck, facing the viewer and turned slightly toward the bow, holding ${PADDLE} level across its lap with both paws, deadpan face. ${HULL} ${WATERLINE} One character only, centred, the kayak filling about three quarters of the frame's width. Transparent background. No text, no letters, no logos.`,
  };
}

/* the nine poses on the 3 x 3 sheet, in reading order (the sheet's cells) */
export const SHEET_POSES = ["idle", "stroke", "stroke-r", "hey", "nice", "miss", "chug", "cheer", "out"];
export const POSE_LINES = [
  "Top row, left to right:",
  "1. Idle: exactly like the image: the paddle held level across its lap with both paws, deadpan face.",
  "2. Paddling on the right: leaning a little toward the right of the picture, the paddle tilted steeply so its lower blade dips into the water at the right side of the kayak, a small white water splash where it enters; the other blade high in the air at the upper left.",
  "3. Paddling on the left: the mirror stroke: leaning a little toward the left of the picture, the paddle tilted steeply the other way so its lower blade dips into the water at the left side of the kayak, a small white water splash where it enters; the other blade high in the air at the upper right.",
  "Middle row, left to right:",
  "4. Shouting: one arm raised straight up, mouth open wide in a round shout, the paddle held in the other paw resting across the kayak.",
  "5. Pleased: eyes closed as two happy upward arcs, a small content smile, the paddle level across its lap.",
  "6. Splashed: the paddle slapped down flat on the water beside the kayak, a splash of water hitting its face from the side, eyes squeezed shut, a small round o mouth, a few white droplets.",
  "Bottom row, left to right:",
  "7. Drinking: holding a red plastic party cup to its mouth with both paws, head tipped back, chugging, the paddle tucked under one arm lying along the kayak.",
  "8. Cheering: both arms raised high holding the paddle level over its head, mouth open in a happy shout.",
  "9. Sad: slumped forward over the kayak, ears and arms drooping, a sad frown, the kayak tilted a little and sitting low, the paddle floating flat on the water beside the kayak, out of its paws.",
];

export function sheetJob(id) {
  return {
    name:`${id}-kayak-sheet`, size:"2048x1536", quality:"high", background:"transparent", format:"png",
    refs:[gen(`${id}-kayak-portrait`)],
    prompt:`A character pose sheet: the exact character from the image (the ${what(id)} sitting in the magenta kayak with the violet-bladed paddle) drawn nine times in nine different poses, arranged in a neat grid of three columns and three rows. Every copy is the same size and scale, its kayak the same size, at the same three-quarter angle (bow toward the right and the viewer) and in the same place in its cell, every copy well separated from the others by empty space, nothing overlapping or touching. Keep the character identical in every copy: the same body, ${details(id) ? `the same ${details(id)}, ` : ""}the same thin slightly wobbly black outline of one even weight, the same small black dot eyes, the same magenta kayak with its soft shading, the same paddle with its dark grey shaft and violet blades (always one paddle, both blades visible). In every pose the kayak is drawn only above the water, its bottom edge one flat line along the waterline, and nothing is below it: no water surface, no ripples, no ground, no shadow; splashes stay small and white.\n${POSE_LINES.join("\n")}\nTransparent background. No text, no numbers, no labels, no motion lines, no grid lines, no borders.`,
  };
}

export const TEE = "Redraw this exact character pose sheet with one change: in all nine poses the critter now wears a plain short-sleeved T-shirt in one flat bright green colour with simple soft shading. Keep everything else exactly the same: the same nine poses in the same places and at the same size, the same face, the same thin slightly wobbly black outline, the same magenta kayak, the same paddle with its dark grey shaft and violet blades, the same splashes, cup and droplets. The T-shirt covers its body down to the kayak's deck and its upper arms; it is plain, with no print, no pocket, no stripes, no text, no logo. Transparent background. No text, no labels.";
export const teeJob = id => ({ name:`${id}-kayak-tee-sheet`, size:"2048x1536", quality:"high", background:"transparent", format:"png", refs:[gen(`${id}-kayak-sheet`)], prompt:TEE });

if (process.argv[1]?.endsWith("float-art-kayak-jobs.mjs")) {
  const [what = "portraits", ...rest] = process.argv.slice(2);
  const ids = rest.length ? rest : ALL_CRITTER_IDS;
  const make = { portraits:portraitJob, sheets:sheetJob, tees:teeJob }[what];
  if (!make) { console.error(`unknown: ${what}`); process.exit(1); }
  const dir = path.join(RAW, "jobs");
  fs.mkdirSync(dir, { recursive:true });
  const file = path.join(dir, `kayak-${what}.json`);
  fs.writeFileSync(file, JSON.stringify(ids.map(make), null, 1));
  console.log(file, ids.length);
}
