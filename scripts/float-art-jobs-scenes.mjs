/* the scenes' jobs (scripts/float-art-jobs.mjs scenes): for each outdoor
   scene one strip of scenery on a transparent sky, ending in a flat sandy
   bank where the river starts (the sky and the checkered water are drawn,
   scripts/float-art-scenes.mjs), and the bar's room. No characters. */
const STRIP = (what, palette) => `A wide strip of desert riverbank scenery for the background of a cute 2D rhythm party game, in a soft flat pastel style with simple rounded shapes, gentle shading and no black outlines: ${what}. Colours: ${palette}. The scenery runs across the whole width of the image in its middle band. Its bottom edge is one straight, level, flat sandy riverbank line across the whole width, a little below the middle of the image; everything below that line is empty. The sky above the scenery is empty. At the far left and far right edges there is only the flat sandy bank and low ground, nothing tall, so strips can sit side by side. Lots of calm empty space. Transparent background. No characters, no animals, no people, no water, no clouds, no sun, no text.`;

export const SCENE_STRIPS = {
  open:["far flat-topped mesas, a few tall saguaro cacti and small round desert bushes along the near sandy bank, small smooth stones at the water's edge", "warm peach, salmon and coral mesas, sage green cacti, pale sand"],
  rocks:["big rounded boulders piled along the bank, a few saguaro cacti between them, distant buttes", "lilac and dusty rose rocks, soft sage cacti, pale sand"],
  whirlpool:["gentle green desert with small palo verde trees, agave plants and round bushes along the bank, distant soft blue-grey mesas", "mint, sage and soft blue, pale sand"],
  falls:["tall canyon walls of layered red rock on the far side, a few saguaros on their tops, a narrow sandy bank below", "coral, apricot and soft red rock, sage cacti, pale sand"],
  lobby:["a calm sandy river beach with a small wooden dock, a striped beach umbrella and a few saguaro cacti, distant mesas", "mint, warm yellow and peach, pale sand"],
  podium:["a riverside meadow with soft rounded hills, a string of little triangle flags between two wooden posts, a few saguaro cacti", "lilac, pink and soft gold, pale sand"],
};

export default () => [
  ...Object.entries(SCENE_STRIPS).map(([id, [what, palette]]) => ({
    name:`scene-${id}`, size:"1536x1024", quality:"high", background:"transparent", format:"png", prompt:STRIP(what, palette),
  })),
  { name:"scene-bar", size:"1536x1024", quality:"high", format:"png",
    prompt:"The inside of a cosy desert saloon bar, the background of a cute 2D rhythm party game, in a soft flat pastel style with gentle shading and thin slightly wobbly dark outlines: a long polished wooden bar counter runs across the whole width in the lower middle, shelves of plain unlabelled bottles and glasses behind it, a hanging lantern, a window on the left showing desert mesas and a saguaro at sunset, swinging saloon doors on the right, a glowing neon outline of a saguaro cactus on the back wall, a plank floor in the foreground, warm peach and apricot light. Lots of calm empty space above the counter. No characters, no people, no animals, no stools, no text, no words, no signs with letters, no labels on the bottles." },
];
