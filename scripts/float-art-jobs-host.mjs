/* the host's job (scripts/float-art-jobs.mjs host): one sheet of its three
   poses, from its crop of the approved river frame (flotilla-a.png) */
export default ({ ref }) => [{
  name:"host-sheet", size:"1536x1024", quality:"high", background:"transparent", format:"png",
  refs:[ref("host"), ref("lineup")],
  prompt:"A character pose sheet of the host from the first image, drawn in the same clean style as the family in the second image: a round white blob critter with a soft rounded body, short stubby arms and little feet, a thin slightly wobbly black outline of one even weight, small black dot eyes, a tiny deadpan mouth, wearing a straw sun hat with a teal band, holding a small red and white megaphone. Exactly three poses in one row, left to right, each the same size, well separated, nothing overlapping:\n1. Idle: standing, holding the megaphone down at its side, deadpan.\n2. Calling: the megaphone raised to its mouth and pointed to the right, leaning in, mouth open.\n3. Cheering: both arms up, the megaphone held high in one hand, mouth open in a happy shout.\nThe whole figure visible and standing, its feet at the same level in every pose. Transparent background. No ground, no shadow, no text, no letters, no sound marks.",
}];
