/* node dev/acc/pair.mjs before.png after.png out.png "rows" "cols" tile  — the same tiles of two sheets side by side, labelled */
import sharp from "sharp";
const [b, a, out, rowsArg, colsArg, tileArg = "150"] = process.argv.slice(2);
const T = +tileArg, rows = rowsArg.split(",").map(Number), cols = colsArg.split(",").map(Number);
const cut = (file, r, c) => sharp(file).extract({ left:c * T, top:r * T, width:T, height:T }).png().toBuffer();
const tiles = [];
const label = (txt, w) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="40"><rect width="100%" height="100%" fill="#14202a"/><text x="12" y="27" font-family="Arial" font-weight="700" font-size="22" fill="#f4efe6">${txt}</text></svg>`);
const W = cols.length * T;
tiles.push({ input:label("Before", W), left:0, top:0 }, { input:label("After", W), left:W + 24, top:0 });
for (const [i, r] of rows.entries()) for (const [j, c] of cols.entries()) {
  tiles.push({ input:await cut(b, r, c), left:j * T, top:40 + i * T });
  tiles.push({ input:await cut(a, r, c), left:W + 24 + j * T, top:40 + i * T });
}
await sharp({ create:{ width:W * 2 + 24, height:40 + rows.length * T, channels:3, background:"#14202a" } }).composite(tiles).png().toFile(out);
console.log(out);
