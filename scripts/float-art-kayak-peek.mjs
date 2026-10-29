/* Float Groove art, the kayaks: a quick look at raw generations on a pale
   background, side by side, scaled to fit a width (for reviewing a
   generation before it is cut).
     node scripts/float-art-kayak-peek.mjs <out.png> <width> <file...> */
import sharp from "sharp";
const [out, width, ...files] = process.argv.slice(2);
const W = Number(width) || 1600, each = Math.floor(W / files.length);
const tiles = await Promise.all(files.map(async (f, k) => {
  const m = await sharp(f).metadata();
  const h = Math.round(m.height * each / m.width);
  return { input:await sharp(f).resize(each, h).png().toBuffer(), left:k * each, top:0, h };
}));
const H = Math.max(...tiles.map(t => t.h));
await sharp({ create:{ width:each * files.length, height:H, channels:4, background:"#bfe9e4" } }).composite(tiles.map(({ input, left, top }) => ({ input, left, top }))).png().toFile(out);
console.log(out);
