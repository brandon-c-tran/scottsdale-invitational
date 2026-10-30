/* the cutscenes' props (scripts/float-art-jobs.mjs cut; float/GROOVE.md
   "After a song" and Last Call's countdown): one sheet for the cut's exits,
   one for the bar's countdown, in the props' style */
const STYLE = "in the same style as the image: a thin slightly wobbly black outline of one even weight, flat soft colours with gentle shading, cute and simple";
const SHEET = (n, grid, items) => `A sheet of ${n} separate game props for a cute 2D rhythm party game, ${STYLE}. Arranged in a neat grid of ${grid}, each prop alone in its own cell, centred, well separated, nothing overlapping or touching:\n${items.map((item, k) => `${k + 1}. ${item}`).join("\n")}\nTransparent background. No text, no letters, no numbers, no labels, no grid lines.`;
export default ({ gen }) => [{
  name:"props-cut", size:"1536x1024", quality:"high", background:"transparent", format:"png", refs:[gen("props-water"), gen("host-sheet")],
  prompt:SHEET("six", "three columns and two rows", [
    "a round white pelican flying to the right, wings spread wide, a big orange-yellow pouch bill, a calm deadpan face with a small dot eye",
    "the same pelican flying to the right while carrying something heavy: wings up mid-flap, its legs hanging straight down with its orange feet curled as if gripping something below them, the feet empty",
    "a flat oval ring of five small yellow cartoon stars, as if circling over a dizzy head",
    "a comic impact burst: a jagged white and yellow starburst with a thick outline, as when something bonks",
    "a small cluster of round water bubbles of several sizes rising in a loose column, pale blue with a white shine",
    "a round tumbleweed, a ball of dry tan twigs",
  ]),
}, {
  name:"props-lastcall", size:"1536x1024", quality:"high", background:"transparent", format:"png", refs:[gen("props-things"), gen("scene-bar")],
  prompt:SHEET("four", "two columns and two rows", [
    "a saloon chalkboard sign: a wide wooden frame around a blank dark green slate, nothing written on it",
    "a round saloon wall clock: a wooden rim around a blank cream face with no numbers and no hands",
    "a light pull cord: a long thin string hanging straight down with a small round wooden pull knob at its end",
    "beer foam spilling over: a white foamy head overflowing and dripping down, just the foam, no glass",
  ]),
}];
