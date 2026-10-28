/* Winnie's jobs (scripts/float-art-jobs.mjs winnie; float/GROOVE.md
   "Special critters"): the portrait from Brandon's pixel Winnie and a head
   crop of the photo cut above the bandanna (its lettering never enters a
   request), drawn in the capybara's style; then his sheet from that
   portrait like every critter's. The references stay outside the repo. */
import { sheetJob } from "./float-art-prompts.mjs";

const LOOK = "soft apricot curly fur all over, floppy curly ears hanging down, a round fluffy head, a small black button nose, and a plain light-blue bandanna around his neck in one flat colour with no pattern, no logo, no letters and no words";
export const WINNIE_DETAILS = "apricot curly fur, floppy curly ears, black button nose and plain light-blue bandanna (one flat colour, no pattern, no letters)";

export default ({ ref, gen }) => [{
  name:"winnie-portrait", size:"1024x1024", quality:"high", background:"transparent", format:"png",
  refs:[ref("winnie-pixel"), ref("winnie-head"), gen("capybara-portrait")],
  prompt:`Draw Winnie, a small cavapoo puppy, as a new character in exactly the same style as the third image (the capybara in the magenta swim ring): a soft round body, a thin slightly wobbly black outline of one even weight, small black dot eyes, a tiny deadpan mouth, simple flat colour with soft shading. Use the first two images only for what he looks like: ${LOOK}. He sits in the same round magenta swim ring as the third image, paws resting on the front of the ring, facing the viewer, the same size and framing as the third image. Nothing below the ring: no feet, no water, no shadow. Transparent background. No text, no letters, no logos anywhere.`,
}, { ...sheetJob("winnie", "cavapoo puppy"), prompt:sheetJob("winnie", "cavapoo puppy").prompt.replace("the same soft round white body, ", `the same soft round body with his ${WINNIE_DETAILS}, `) }];
