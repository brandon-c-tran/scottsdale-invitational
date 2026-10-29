/* the v3 looks' jobs (float/GROOVE.md v3 "A cuter, cooler hat rack";
   node scripts/float-art-jobs-looks2.mjs -> <raw>/jobs/looks2.json): one
   sheet of nine new hats (3 x 3, in LOOKS2_HATS order) and one of six
   glasses (3 x 2, in LOOKS2_SHADES order), in the critters' line, chunky
   enough to read small on a TV. A hat's magenta is keyed like the tube so
   it takes the rider's colour; hats drawn without magenta keep their own. */
import fs from "node:fs";
import path from "node:path";
import { RAW } from "./float-art-lib.mjs";
import { gen } from "./float-art-prompts.mjs";

export const LOOKS2_HATS = ["froggy", "beanie", "propeller", "tophat", "viking", "fishing", "sunhat", "halo", "mushroom"];
export const LOOKS2_SHADES = ["hearts", "stars", "pixel", "snorkel", "threed", "round"];
const STYLE = "in exactly the same style as the critter in the image: a thin slightly wobbly black outline of one even weight, flat soft colours with gentle simple shading, chunky rounded shapes, cute and bold so each one reads clearly when small";
const jobs = [{
  name:"looks2-hats", size:"1536x1536", quality:"high", background:"transparent", format:"png", refs:[gen("capybara-portrait"), gen("looks-hats")],
  prompt:`A sheet of nine separate hats for cute round critter characters in a 2D rhythm party game, ${STYLE}. Every hat is seen straight from the front as it sits when worn, upright and level, all at about the same width, each alone in its own cell of a neat grid of three columns and three rows, well separated, nothing overlapping, nothing touching. Where a hat says magenta, that part is one flat bright magenta with simple soft shading:\n1. a frog bucket hat: a soft green bucket hat with two big round frog eyes (white with black pupils) on top and a small smile stitched on the front.\n2. a pom-pom beanie: a ribbed knitted magenta beanie with a folded cuff and a big fluffy white pompom on top.\n3. a propeller cap: a round magenta beanie cap with a short peak and a little four-blade propeller on top in yellow, red, blue and green.\n4. a tiny top hat: a small tall black top hat with a magenta band, perched upright.\n5. a viking helmet: a round silver metal helmet with a band of rivets and two big cream curved horns sticking out to the sides.\n6. a fishing hat: a magenta bucket hat with three little fishing lures and a hook pinned on its band, one tiny fish lure hanging off the brim.\n7. a straw sun hat: a wide floppy pale straw hat with a woven texture, a magenta ribbon band and a bow.\n8. a halo: a glowing golden ring floating level, seen slightly from the front so it reads as a ring, with two tiny sparkles.\n9. a mushroom cap: a big round magenta mushroom cap with large white spots, worn like a hat, its pale gills showing underneath.\nTransparent background. No heads, no faces under the hats, no characters, no text, no letters, no logos.`,
}, {
  name:"looks2-shades", size:"1536x1024", quality:"high", background:"transparent", format:"png", refs:[gen("capybara-portrait"), gen("looks-shades")],
  prompt:`A sheet of six separate pairs of glasses for cute round critter characters in a 2D rhythm party game, ${STYLE}. Every pair is seen straight from the front as worn, level and symmetrical, all at the same width, each alone in its own cell of a neat grid of three columns and two rows, well separated, nothing overlapping, the two lenses clearly apart with a small bridge between them:\n1. heart sunglasses: two chunky pink-red heart-shaped frames with dark pink lenses and a white shine.\n2. star sunglasses: two chunky yellow star-shaped frames with dark lenses and a white shine.\n3. pixel shades: blocky black pixel-art sunglasses made of square steps, a straight top bar, white square shine pixels.\n4. a snorkel mask: one wide rounded diving mask with a light-blue glass and a dark rim, a short black strap stub at each side and a small orange snorkel tube rising at one side.\n5. 3D glasses: a white cardboard frame with one red lens on the left and one cyan lens on the right.\n6. round specs: big round thin black wire spectacles with clear lenses and a white shine.\nTransparent background. No faces, no characters, no text, no letters, no logos.`,
}];
import { pathToFileURL } from "node:url";
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = path.join(RAW, "jobs", "looks2.json");
  fs.writeFileSync(file, JSON.stringify(jobs, null, 1));
  console.log(file, jobs.length);
}
