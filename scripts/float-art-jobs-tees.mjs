/* the photo tee's jobs (scripts/float-art-jobs.mjs tees [ids]): each
   critter's own pose sheet redrawn with a plain T-shirt in flat bright
   green (keyed like the tube, so the rider's colour fills it; the photo is
   printed on its chest at run time), the swim ring still magenta */
import { CRITTER_IDS, ALL_CRITTER_IDS } from "../float/shared/looks.js";

const TEE = "Redraw this exact character pose sheet with one change: in all eight poses the critter now wears a plain short-sleeved T-shirt in one flat bright green colour with simple soft shading. Keep everything else exactly the same: the same eight poses in the same places and at the same size, the same face, the same thin slightly wobbly black outline, the same magenta swim ring, the same splash, cup and droplets. The T-shirt covers its body down into the ring and its upper arms; it is plain, with no print, no pocket, no stripes, no text, no logo. Transparent background. No text, no labels.";
export default ({ gen }, ids = process.argv.slice(3)) => (ids.length ? ids : ALL_CRITTER_IDS).map(id => ({
  name:`${id}-tee-sheet`, size:"1536x1024", quality:"high", background:"transparent", format:"png", refs:[gen(`${id}-sheet`)], prompt:TEE,
}));
