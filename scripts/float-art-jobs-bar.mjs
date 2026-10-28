/* Last Call's jobs (scripts/float-art-jobs.mjs bar; float/GROOVE.md "Last
   Call"): the bartender's three poses from the approved bar frame
   (lastcall.png), drawn waist up to stand behind the counter, and the drink
   that slides down the bar */
export default ({ ref, gen }) => [{
  name:"bartender-sheet", size:"1536x1024", quality:"high", background:"transparent", format:"png",
  refs:[ref("bartender"), gen("host-sheet")],
  prompt:"A character pose sheet of the bartender from the first image, drawn in the same clean style as the host in the second image: a tall soft white blob critter with a rounded head, a thin slightly wobbly black outline of one even weight, small black dot eyes, a small flat deadpan mouth, a black bow tie and a dark grey vest, a white towel. Exactly three poses in one row, left to right, each the same size, well separated, nothing overlapping:\n1. Idle: polishing a small glass with the towel, deadpan.\n2. Sliding a drink: leaning forward, one arm stretched out flat to the right as if pushing a glass along a bar counter, deadpan.\n3. Cheering: both arms up, mouth open in a happy shout.\nEach drawn from the waist up and cut off by one straight level line at the bottom, as if standing behind a bar counter, the counter itself not drawn, the bottom line at the same height in every pose. Transparent background. No glass or drink in poses 2 and 3, no counter, no shelves, no text, no letters.",
}, {
  name:"bar-drink", size:"1024x1024", quality:"high", background:"transparent", format:"png",
  refs:[ref("drink"), gen("props-things")],
  prompt:"One game prop in the same style as the props in the second image (a thin slightly wobbly black outline of one even weight, flat soft colours with gentle shading): the glass of lemonade from the first image, a short clear tumbler with pale yellow lemonade, two ice cubes and a lemon slice on the rim, seen from the side, standing upright. Alone, centred, filling about half of the frame. Transparent background. No table, no shadow, no motion lines, no text.",
}];
