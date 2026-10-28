/* the props' jobs (scripts/float-art-jobs.mjs props): two sheets of six,
   each prop alone in its cell of a 3 x 2 grid, in the critters' style */
const SHEET = items => `A sheet of six separate game props for a cute 2D rhythm party game, in the same style as the image: a thin slightly wobbly black outline of one even weight, flat soft colours with gentle shading. Arranged in a neat grid of three columns and two rows, each prop alone in its own cell, centred, well separated, nothing overlapping or touching:\n${items.map((item, k) => `${k + 1}. ${item}`).join("\n")}\nTransparent background. No text, no letters, no numbers, no labels, no grid lines.`;
export default ({ gen }) => [
  { name:"props-water", size:"1536x1024", quality:"high", background:"transparent", format:"png", refs:[gen("capybara-sheet")],
    prompt:SHEET([
      "a burst of white water splash shooting up from a paddle stroke, white with pale blue shading",
      "a flat oval ring of water ripples seen from a low angle, white and pale blue",
      "a smooth rounded river rock, warm grey with a lighter top, a thin line of white foam around its base",
      "a whirlpool: a flat oval spiral swirl of blue water seen from a low angle, white foam lines spiralling in",
      "the lip of a waterfall seen from the side: a short stretch of blue river flowing to the right and pouring over a rounded rock edge into a cloud of white mist below",
      "a big round splash of white water, as when something lands in the river, white with pale blue shading",
    ]) },
  { name:"props-things", size:"1536x1024", quality:"high", background:"transparent", format:"png", refs:[gen("capybara-sheet")],
    prompt:SHEET([
      "a red plastic party cup with a white rim",
      "a small gold crown with three rounded points and a pink gem in the middle",
      "a small wooden sign board on a wooden stick, the board painted with one simple picture: a canoe paddle",
      "a small wooden sign board on a wooden stick, the board painted with one simple picture: a round grey river rock",
      "a small wooden sign board on a wooden stick, the board painted with one simple picture: a blue spiral swirl",
      "a three-step winners podium of sand-coloured wooden blocks, the middle block tallest, the left block middle height, the right block lowest, plain faces with no numbers",
    ]) },
];
