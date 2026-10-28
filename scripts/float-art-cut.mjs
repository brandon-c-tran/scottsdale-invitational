/* Float Groove art: the placeholder cut (float/GROOVE.md "Until the real
   sprites land"). The 13 critters cut out of the approved lineup
   (float/look/lineup.png) into the 512 box, every pose pointing at that one
   crop, with a rough tube mask, and the host cut out of flotilla-a.png.
   The real sprites replace these files later (scripts/float-art-sprites.mjs);
   the manifest's shape stays.

     node scripts/float-art-cut.mjs            critters, portraits and the host
     node scripts/float-art-cut.mjs --only frog
*/
import path from "node:path";
import { CRITTER_IDS } from "../float/shared/looks.js";
import {
  ROOT, OUT, POSES, BOX, loadRGBA, floodBackground, components, keyOff, crop, placeInBox, saveWebp,
  splitTube, close, dilate, hueOf, hueDist, editManifest,
} from "./float-art-lib.mjs";

const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const LINEUP_BG = [254, 253, 247];
/* one scale for the whole family; the waterline (the tube's middle) at the same box point */
export const PLACEHOLDER = { s:1.18, water:[256, 352], portrait:{ s:2.3, water:[512, 700] } };

/* where things are on each critter, eyeballed on lineup.png (its pixels):
   head = top of the head (a hat sits here), face = between the eyes and
   the mouth, hand = the paw nearer the viewer's right (a cup) */
const LINEUP_ANCHORS = {
  capybara:{ head:[120, 250], face:[150, 305], hand:[185, 402] },
  javelina:{ head:[340, 268], face:[352, 318], hand:[383, 402] },
  roadrunner:{ head:[548, 278], face:[548, 300], hand:[595, 402] },
  jackrabbit:{ head:[785, 272], face:[785, 318], hand:[820, 402] },
  tortoise:{ head:[985, 318], face:[985, 352], hand:[1035, 410] },
  gila:{ head:[1170, 302], face:[1162, 330], hand:[1232, 398] },
  hornedlizard:{ head:[1416, 292], face:[1416, 328], hand:[1455, 402] },
  bighorn:{ head:[150, 640], face:[150, 680], hand:[180, 772] },
  quail:{ head:[372, 642], face:[372, 672], hand:[425, 772] },
  armadillo:{ head:[585, 662], face:[578, 702], hand:[640, 785] },
  coyote:{ head:[850, 652], face:[850, 698], hand:[892, 770] },
  otter:{ head:[1130, 642], face:[1128, 684], hand:[1162, 762] },
  frog:{ head:[1400, 682], face:[1400, 718], hand:[1440, 772] },
};

async function cutCritters() {
  const img = await loadRGBA(path.join(ROOT, "float/look/lineup.png"));
  const { width:W, height:H } = img;
  const bg = floodBackground(img, (r, g, b) => Math.min(r, g, b) > 228 && Math.max(r, g, b) - Math.min(r, g, b) < 18);
  const fg = bg.map(v => (v ? 0 : 1));
  const { labels, comps } = components(fg, W, H);
  const big = comps.filter(c => c.n > 5000).sort((a, b) => (a.y0 > 500) - (b.y0 > 500) || a.x0 - b.x0);
  if (big.length !== CRITTER_IDS.length) throw new Error(`expected ${CRITTER_IDS.length} critters, found ${big.length}`);
  const entries = {};
  for (const [k, id] of CRITTER_IDS.entries()) {
    if (only && only !== id) continue;
    const c = big[k];
    const pad = 4;
    const x0 = c.x0 - pad, y0 = c.y0 - pad, w = c.x1 - c.x0 + 1 + pad * 2, h = c.y1 - c.y0 + 1 + pad * 2;
    const mine = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) if (labels[i] === c.id) mine[i] = 1;
    const keyed = keyOff(img, mine, LINEUP_BG);
    const part = crop(keyed, x0, y0, w, h);
    /* the tube: the saturated pixels of the critter's dominant hue */
    const hist = new Array(36).fill(0);
    const sat = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const r = part.data[i * 4], g = part.data[i * 4 + 1], b = part.data[i * 4 + 2], a = part.data[i * 4 + 3];
      if (a < 200 || Math.max(r, g, b) - Math.min(r, g, b) < 70 || Math.max(r, g, b) < 90) continue;
      sat[i] = 1;
      hist[Math.floor(hueOf(r, g, b) / 10)] += 1;
    }
    const top = hist.indexOf(Math.max(...hist)) * 10 + 5;
    let tube = new Uint8Array(w * h);
    let ty0 = h, ty1 = 0, tx0 = w, tx1 = 0;
    for (let i = 0; i < w * h; i++) {
      if (!sat[i]) continue;
      const r = part.data[i * 4], g = part.data[i * 4 + 1], b = part.data[i * 4 + 2];
      if (hueDist(hueOf(r, g, b), top) > 28) continue;
      tube[i] = 1;
      const x = i % w, y = (i - x) / w;
      if (y < ty0) ty0 = y; if (y > ty1) ty1 = y; if (x < tx0) tx0 = x; if (x > tx1) tx1 = x;
    }
    tube = dilate(close(tube, w, h, 4), w, h, 2);
    for (let i = 0; i < w * h; i++) if (part.data[i * 4 + 3] === 0) tube[i] = 0;
    const { src, mask } = splitTube(part, tube);
    const tcx = (tx0 + tx1) / 2, tcy = (ty0 + ty1) / 2;
    const place = (o, s, bx, by) => placeInBox(o, { sx:tcx, sy:tcy, s, bx, by });
    const [bx, by] = PLACEHOLDER.water;
    const a = await place(src, PLACEHOLDER.s, bx, by);
    const m = await place(mask, PLACEHOLDER.s, bx, by);
    if (a.clipped) console.warn(`${id}: clipped in the box`);
    const dir = path.join(OUT, "critters", id);
    await saveWebp(a.img, path.join(dir, "idle.webp"));
    await saveWebp(m.img, path.join(dir, "idle-tube.webp"));
    const P = PLACEHOLDER.portrait;
    const pa = await placeInBox(src, { sx:tcx, sy:tcy, s:P.s, bx:P.water[0], by:P.water[1], box:[1024, 1024] });
    const pm = await placeInBox(mask, { sx:tcx, sy:tcy, s:P.s, bx:P.water[0], by:P.water[1], box:[1024, 1024] });
    await saveWebp(pa.img, path.join(dir, "portrait.webp"));
    await saveWebp(pm.img, path.join(dir, "portrait-tube.webp"));
    /* anchors from the lineup's own pixels into the box */
    const at = ([x, y], s, [wx, wy]) => [Math.round(wx + (x - x0 - tcx) * s), Math.round(wy + (y - y0 - tcy) * s)];
    const L = LINEUP_ANCHORS[id];
    const anchor = (s, water) => ({ water:[...water], head:at(L.head, s, water), face:at(L.face, s, water), hand:at(L.hand, s, water) });
    const poses = {};
    for (const pose of POSES) poses[pose] = { src:`critters/${id}/idle.webp`, tube:`critters/${id}/idle-tube.webp` };
    entries[id] = {
      anchor:anchor(PLACEHOLDER.s, PLACEHOLDER.water),
      poses,
      portrait:{ src:`critters/${id}/portrait.webp`, tube:`critters/${id}/portrait-tube.webp`, w:1024, h:1024, anchor:anchor(P.s, P.water) },
      placeholder:true,
    };
    console.log(`${id}: tube hue ${top}, waterline ${Math.round(tcy + y0)} on the lineup`);
  }
  editManifest(m => { Object.assign(m.critters, entries); });
}

/* the host, cut out of flotilla-a.png: everything inside its black line */
async function cutHost() {
  const img = await loadRGBA(path.join(ROOT, "float/look/flotilla-a.png"));
  const x0 = 96, y0 = 226, w = 210, h = 162;
  const part = crop(img, x0, y0, w, h);
  const ink = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b < 105;
  const bg = floodBackground(part, (r, g, b) => !ink(r, g, b));
  const fg = bg.map(v => (v ? 0 : 1));
  const { labels, comps } = components(fg, w, h);
  /* the host is the piece around its body (abs 165, 330) */
  const body = labels[(330 - y0) * w + (165 - x0)];
  const hostComp = comps.find(c => c.id === body) || comps.sort((a, b) => b.n - a.n)[0];
  const mine = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (labels[i] === hostComp.id) mine[i] = 1;
  const keyed = keyOff(part, mine, [236, 178, 142]);
  /* feet on the ground at the box's (256, 470) */
  const footX = 160 - x0, footY = 383 - y0, s = 2.25;
  const placed = await placeInBox(keyed, { sx:footX, sy:footY, s, bx:256, by:470 });
  const file = path.join(OUT, "host", "idle.webp");
  await saveWebp(placed.img, file);
  const at = ([x, y]) => [Math.round(256 + (x - x0 - footX) * s), Math.round(470 + (y - y0 - footY) * s)];
  editManifest(m => {
    m.host = {
      box:[BOX, BOX],
      anchor:{ ground:[256, 470], head:at([170, 268]), face:at([195, 300]), horn:at([272, 296]) },
      poses:{ idle:{ src:"host/idle.webp" }, call:{ src:"host/idle.webp" }, cheer:{ src:"host/idle.webp" } },
      placeholder:true,
    };
  });
  console.log("host: cut");
}

await cutCritters();
if (!only) await cutHost();
