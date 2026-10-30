import fs from "node:fs"; import sharp from "sharp";
const m = JSON.parse(fs.readFileSync("public/float/groove/manifest.json","utf8"));
const S=320, tiles=[]; let i=0;
const items=[...Object.entries(m.hats).map(([k,v])=>[k,v]), ...Object.entries(m.shades)];
for (const [id,h] of items) {
  const img = await sharp("public/float/groove/"+h.src).resize(h.w,h.h).png().toBuffer();
  const grid = Array.from({length:10},(_,k)=>`<line x1="${k*32}" y1="0" x2="${k*32}" y2="440" stroke="#0003"/><line x1="0" y1="${k*32}" x2="320" y2="${k*32}" stroke="#0003"/>`).join("");
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="460"><rect width="100%" height="100%" fill="#bfe8e6"/>${grid}<text x="4" y="455" font-size="18" font-family="Arial">${id} a=${h.anchor} fit=${h.fit??''} d=${h.depth??''}</text></svg>`);
  const ax=h.anchor[0], ay=h.anchor[1];
  const mark = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="460"><circle cx="${ax}" cy="${ay}" r="5" fill="#f0f"/></svg>`);
  const tile = await sharp(svg).composite([{input:img,left:0,top:0},{input:mark,left:0,top:0}]).png().toBuffer();
  tiles.push({input:tile,left:(i%7)*S,top:Math.floor(i/7)*460}); i++;
}
await sharp({create:{width:7*S,height:Math.ceil(i/7)*460,channels:3,background:"#fff"}}).composite(tiles).png().toFile(process.argv[2]);
