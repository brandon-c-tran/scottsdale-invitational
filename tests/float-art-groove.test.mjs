/* Float Groove's 2D art (float/GROOVE.md "The art manifest and the 2D art
   module"): the manifest keeps the contract's schema; every critter has
   every pose and its files exist at the box's size; the host, the scenes,
   the props and the font are there; the module's pure parts (reading the
   manifest, anchors, colours, URLs) behave; painting needs a canvas, so in
   node the sprites are the bare files and a portrait is null; index.js
   imports no three.js; the popup letters what chart.js says. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import Module from "node:module";
import sharp from "sharp";
import { build } from "esbuild";
import { ALL_CRITTER_IDS, HAT_IDS, SHADE_IDS } from "../float/shared/looks.js";
import { popupOf } from "../float/shared/chart.js";
import * as groove from "../float/client/art/groove/index.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const PUB = join(ROOT, "public");
const DIR = join(PUB, "float/groove");
const manifest = JSON.parse(readFileSync(join(DIR, "manifest.json"), "utf8"));
const POSES = ["idle", "stroke", "hey", "nice", "miss", "chug", "cheer", "out"];
const file = rel => join(DIR, rel);
/* a WebP's size from its header (VP8X, VP8L or VP8), no decode */
function webpSize(buf) {
  if (buf.toString("latin1", 0, 4) !== "RIFF" || buf.toString("latin1", 8, 12) !== "WEBP") return null;
  const chunk = buf.toString("latin1", 12, 16);
  if (chunk === "VP8X") return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)];
  if (chunk === "VP8L") { const b = buf.readUInt32LE(21); return [1 + (b & 0x3fff), 1 + ((b >> 14) & 0x3fff)]; }
  if (chunk === "VP8 ") return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
  return null;
}
const size = async rel => webpSize(readFileSync(file(rel)));
const isPoint = (p, w = 1e9, h = 1e9) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite) && p[0] >= 0 && p[1] >= 0 && p[0] <= w && p[1] <= h;

test("the manifest's shape: v 1, the eight poses, the 512 box", () => {
  assert.equal(manifest.v, 1);
  assert.deepEqual(manifest.poses, POSES);
  assert.deepEqual(groove.POSES, POSES);
  assert.deepEqual(manifest.box, [512, 512]);
  for (const key of ["critters", "host", "scenes", "props", "font"]) assert.ok(manifest[key], key);
});

test("every critter (the 13 and Winnie): anchors in the box, every pose's sprite and tube at 512, the portrait at 1024", async () => {
  for (const id of ALL_CRITTER_IDS) {
    const c = manifest.critters[id];
    assert.ok(c, `${id} is in the manifest`);
    for (const name of ["water", "head", "face", "hand"]) assert.ok(isPoint(c.anchor?.[name], 512, 512), `${id} anchor.${name}`);
    for (const pose of POSES) {
      const p = c.poses?.[pose];
      assert.ok(p?.src && p?.tube, `${id} ${pose}`);
      for (const rel of [p.src, p.tube]) {
        assert.ok(existsSync(file(rel)), `${id} ${pose}: ${rel}`);
        assert.deepEqual(await size(rel), [512, 512], `${id} ${pose}: ${rel} is the box`);
      }
      /* a pose's own anchors (optional) stay in the box, the waterline never moves */
      if (p.anchor) {
        for (const [name, at] of Object.entries(p.anchor)) assert.ok(isPoint(at, 512, 512), `${id} ${pose} anchor.${name}`);
        if (p.anchor.water) assert.deepEqual(p.anchor.water, c.anchor.water, `${id} ${pose}: the waterline stays put`);
      }
    }
    const P = c.portrait;
    assert.equal(P.w, 1024); assert.equal(P.h, 1024);
    for (const rel of [P.src, P.tube]) assert.deepEqual(await size(rel), [1024, 1024], `${id} portrait ${rel}`);
    for (const name of ["water", "head", "face"]) assert.ok(isPoint(P.anchor?.[name], 1024, 1024), `${id} portrait anchor.${name}`);
  }
  /* nothing in it but known critters (the 13 and the special ones) */
  for (const id of Object.keys(manifest.critters)) assert.ok(ALL_CRITTER_IDS.includes(id), `${id} is a known critter`);
});

test("a tube mask is white where it is the tube; a sprite is transparent around the critter", async () => {
  const c = manifest.critters.capybara;
  const { data, info } = await sharp(file(c.poses.idle.tube)).ensureAlpha().raw().toBuffer({ resolveWithObject:true });
  let lit = 0, off = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 200) { lit++; if (data[i] < 240 || data[i + 1] < 240 || data[i + 2] < 240) off++; }
  }
  assert.ok(lit > 512 * 512 * 0.02, "the mask covers a tube");
  assert.ok(off / lit < 0.02, "the mask is white");
  const src = await sharp(file(c.poses.idle.src)).ensureAlpha().raw().toBuffer({ resolveWithObject:true });
  const corner = k => src.data[k * 4 + 3];
  for (const k of [0, info.width - 1, info.width * (info.height - 1), info.width * info.height - 1]) assert.equal(corner(k), 0, "the corners are clear");
});

const decoded = new Map();
const raw = rel => {
  if (!decoded.has(rel)) decoded.set(rel, sharp(file(rel)).ensureAlpha().raw().toBuffer({ resolveWithObject:true }).then(({ data, info }) => ({ data, w:info.width, h:info.height })));
  return decoded.get(rel);
};
const alphaAt = (img, [x, y]) => img.data[(Math.round(y) * img.w + Math.round(x)) * 4 + 3];
/* the share of the box that is solid (every 4th pixel is plenty) */
const coverage = img => { let n = 0; for (let i = 3; i < img.data.length; i += 16) if (img.data[i] > 128) n++; return n * 4 / (img.w * img.h); };

test("the real art: every pose has a critter and a tube; the face is on the body, never in the tube mask", async () => {
  /* decoded together: sharp's pool works in parallel */
  await Promise.all(ALL_CRITTER_IDS.flatMap(id => POSES.flatMap(pose => [raw(manifest.critters[id].poses[pose].src), raw(manifest.critters[id].poses[pose].tube)])));
  for (const id of ALL_CRITTER_IDS) {
    const c = manifest.critters[id];
    assert.ok(!c.placeholder, `${id} is real art`);
    const seen = new Set();
    for (const pose of POSES) {
      const p = c.poses[pose];
      seen.add(p.src);
      const src = await raw(p.src), tube = await raw(p.tube);
      const face = (p.anchor || c.anchor).face;
      assert.ok(coverage(src) > 0.06, `${id} ${pose}: a critter in the box`);
      assert.ok(coverage(tube) > 0.02, `${id} ${pose}: a tube`);
      assert.ok(alphaAt(src, face) > 200, `${id} ${pose}: the face anchor is on the critter`);
      assert.ok(alphaAt(tube, face) < 40, `${id} ${pose}: no tube mask at the face`);
    }
    assert.equal(seen.size, POSES.length, `${id}: eight different sprites`);
  }
});

test("the host: its box, anchors and the three poses' files", async () => {
  assert.ok(!manifest.host.placeholder, "the host is real art");
  assert.equal(new Set(["idle", "call", "cheer"].map(pose => manifest.host.poses[pose].src)).size, 3, "three different poses");
  const h = manifest.host;
  assert.ok(Array.isArray(h.box) && h.box.length === 2);
  for (const name of ["ground", "head", "face", "horn"]) assert.ok(isPoint(h.anchor?.[name], ...h.box), `host anchor.${name}`);
  for (const pose of ["idle", "call", "cheer"]) {
    assert.ok(h.poses?.[pose]?.src, `host ${pose}`);
    assert.deepEqual(await size(h.poses[pose].src), h.box, `host ${pose} is its box`);
  }
});

test("Last Call's bartender: waist up in its box, three poses in three files, standing on the counter line", async () => {
  const b = manifest.bartender;
  assert.ok(b, "the bartender");
  assert.deepEqual(Object.keys(b.poses), ["idle", "slide", "cheer"]);
  assert.equal(new Set(Object.values(b.poses).map(p => p.src)).size, 3);
  for (const [pose, p] of Object.entries(b.poses)) {
    assert.deepEqual(await size(p.src), b.box, `bartender ${pose}`);
    for (const name of ["ground", "head", "face", "hand"]) assert.ok(isPoint(p.anchor[name], ...b.box), `bartender ${pose} anchor.${name}`);
    assert.deepEqual(p.anchor.ground, b.anchor.ground, "the counter line stays put");
  }
  assert.ok(manifest.props.drink, "the drink it slides");
  groove.provideGrooveArt(manifest);
  const cast = groove.bartenderSprites();
  assert.ok(cast.poses.slide.startsWith("/float/groove/bartender/"), "an absolute URL");
  assert.deepEqual(cast.anchors.slide, { ...b.anchor, ...b.poses.slide.anchor });
});

test("the scenes: the four songs, the lobby, the bar and the podium, layered back to front at 1920 x 1080", async () => {
  for (const id of ["open", "rocks", "whirlpool", "falls", "lobby", "bar", "podium"]) {
    const s = manifest.scenes[id];
    assert.ok(s, id);
    assert.equal(s.w, 1920); assert.equal(s.h, 1080);
    assert.ok(s.water > 0 && s.water < 1, `${id} water`);
    assert.ok(s.layers.length >= 1, `${id} layers`);
    let depth = -1;
    for (const layer of s.layers) {
      assert.ok(layer.depth >= 0 && layer.depth <= 1 && layer.depth >= depth, `${id}: depths go back to front`);
      depth = layer.depth;
      assert.equal(typeof layer.loop, "boolean");
      assert.deepEqual(await size(layer.src), [1920, 1080], `${id} ${layer.src}`);
    }
  }
  /* a looping layer tiles: its last column runs into its first like any two neighbours */
  for (const [id, sc] of Object.entries(manifest.scenes)) for (const layer of sc.layers.filter(l => l.loop)) {
    const img = await raw(layer.src);
    const col = x => { const out = []; for (let y = 0; y < img.h; y += 4) { const i = (y * img.w + x) * 4; out.push(img.data[i] * img.data[i + 3] / 255, img.data[i + 1] * img.data[i + 3] / 255, img.data[i + 2] * img.data[i + 3] / 255, img.data[i + 3]); } return out; };
    const diff = (a, b) => a.reduce((sum, v, i) => sum + Math.abs(v - b[i]), 0) / a.length;
    const seam = diff(col(img.w - 1), col(0));
    let inner = 0;
    for (const x of [300, 700, 1100, 1500]) inner = Math.max(inner, diff(col(x), col(x + 1)));
    assert.ok(seam <= Math.max(3, inner * 2.5), `${id} ${layer.src}: no seam (${seam.toFixed(2)} vs ${inner.toFixed(2)})`);
  }
  for (const sc of Object.values(manifest.scenes)) assert.ok(!sc.placeholder, "scenes are real art");
  /* the songs' scenes are the ones chart.js names, each with its one loud accent, a prop */
  const { SONGS } = await import("../float/shared/chart.js");
  for (const song of SONGS) {
    const sc = manifest.scenes[song.scene];
    assert.ok(sc, `${song.id} -> ${song.scene}`);
    assert.ok(sc.accent && manifest.props[sc.accent], `${song.scene}'s accent is a prop (${sc.accent})`);
  }
  assert.deepEqual(SONGS.map(song => manifest.scenes[song.scene].accent), ["accent-open", "accent-rocks", "accent-whirl", "accent-falls"]);
});

test("the props: at least the contract's, each at its declared size with an anchor inside it", async () => {
  for (const id of ["splash", "ripple", "rock", "whirl", "cup", "crown", "sign-paddle", "sign-rock", "sign-spin", "falls-lip"]) assert.ok(manifest.props[id], id);
  for (const [id, p] of Object.entries(manifest.props)) {
    assert.deepEqual(await size(p.src), [p.w, p.h], `${id} size`);
    assert.ok(isPoint(p.anchor, p.w, p.h), `${id} anchor`);
    assert.equal(typeof p.tint, "boolean", `${id} tint`);
    assert.ok(!p.placeholder, `${id} is real art`);
  }
  /* the podium's steps: 1st highest, all on the block tops inside the image */
  const podium = manifest.props.podium;
  assert.equal(podium.steps.length, 3);
  for (const at of podium.steps) assert.ok(isPoint(at, podium.w, podium.h));
  assert.ok(podium.steps[0][1] < podium.steps[1][1] && podium.steps[1][1] < podium.steps[2][1], "1st, then 2nd, then 3rd");
});

test("the font: Float Pixel, the woff2 and its OFL licence beside it, declared once in groove.css", () => {
  assert.equal(manifest.font.family, "Float Pixel");
  assert.match(manifest.font.src, /^\/fonts\/.+\.woff2$/);
  const woff = join(PUB, manifest.font.src);
  assert.ok(existsSync(woff));
  assert.equal(readFileSync(woff).subarray(0, 4).toString("latin1"), "wOF2");
  assert.match(readFileSync(join(PUB, "fonts/pixelify-sans-OFL.txt"), "utf8"), /SIL Open Font License/);
  const css = readFileSync(join(ROOT, "float/client/art/groove/groove.css"), "utf8");
  assert.equal(css.match(/@font-face/g)?.length, 1);
  assert.match(css, /font-family:\s*"Float Pixel"/);
  assert.ok(css.includes(`url("${manifest.font.src}")`));
});

test("reading the manifest: an unknown critter is the capybara, a missing pose is idle, anchors scale, URLs are absolute", () => {
  groove.setGrooveBase("/float/groove/");
  groove.provideGrooveArt(manifest);
  assert.equal(groove.grooveArtNow(), manifest);
  assert.equal(groove.critterArt("dragon"), manifest.critters.capybara);
  assert.equal(groove.critterArt("frog"), manifest.critters.frog);
  const p = groove.poseArt("frog", "cheer");
  assert.equal(p.src, `/float/groove/${manifest.critters.frog.poses.cheer.src}`);
  assert.equal(groove.poseArt("frog", "nope").src, `/float/groove/${manifest.critters.frog.poses.idle.src}`);
  const water = manifest.critters.frog.anchor.water;
  assert.deepEqual(groove.spriteAnchor("frog", "idle", "water", 256), [water[0] / 2, water[1] / 2]);
  assert.equal(groove.spriteAnchor("frog", "idle", "nope"), null);
  const scene = groove.sceneOf("open");
  assert.ok(scene.layers.every(layer => layer.src.startsWith("/float/groove/scenes/")));
  assert.equal(groove.sceneOf("nowhere"), null);
  assert.equal(groove.propOf("cup").src, `/float/groove/${manifest.props.cup.src}`);
  const host = groove.hostSprites();
  for (const pose of ["idle", "call", "cheer"]) assert.match(host.poses[pose], /^\/float\/groove\/host\//);
  assert.equal(groove.grooveUrl("/fonts/x.woff2"), "/fonts/x.woff2");
  assert.equal(groove.grooveUrl("https://cdn.example/x.webp"), "https://cdn.example/x.webp");
});

test("colours: #rgb and #rrggbb pass (lowercased), anything else is the fallback grey", () => {
  assert.equal(groove.normalColor("#E53935"), "#e53935");
  assert.equal(groove.normalColor("#f80"), "#ff8800");
  for (const bad of [null, "", "red", "#12345", "url(x)"]) assert.equal(groove.normalColor(bad), groove.FALLBACK_COLOR);
});

test("the painted size: the smallest of 128, 256, 512 covering the drawn size in device pixels", () => {
  assert.deepEqual([...groove.SPRITE_SIZES], [128, 256, 512]);
  assert.equal(groove.spriteSize(100), 128);
  assert.equal(groove.spriteSize(200), 256);
  assert.equal(groove.spriteSize(300), 512);
  assert.equal(groove.spriteSize(200, 2), 512);
  assert.equal(groove.spriteSize(120, 2), 256);
  assert.equal(groove.spriteSize(4000, 3), 512);
  assert.equal(groove.spriteSize(undefined), 512);
});

test("no canvas in node: riderSprites hands back every pose's bare file, riderPortrait is null", async () => {
  groove.provideGrooveArt(manifest);
  const urls = await groove.riderSprites({ critter:"otter", color:"#123456" });
  assert.deepEqual(Object.keys(urls), POSES);
  for (const pose of POSES) assert.equal(urls[pose], `/float/groove/${manifest.critters.otter.poses[pose].src}`);
  assert.equal(await groove.riderPortrait({ color:"#123456", look:{ critter:"otter" } }), null);
});

/* bundled the way Field Day's gate and the screen bundle it */
async function bundle(entry, { name, global = {} } = {}) {
  const out = await build({ entryPoints:[join(ROOT, entry)], bundle:true, platform:"node", format:"cjs",
    external:["react", "react-dom", "three"], loader:{ ".css":"empty" }, write:false, logLevel:"silent", metafile:true });
  const mod = new Module(fileURLToPath(new URL(`${name}.cjs`, import.meta.url)));
  mod.filename = mod.id;
  mod.paths = Module._nodeModulePaths(ROOT);
  Object.assign(globalThis, global);
  mod._compile(out.outputFiles[0].text, mod.filename);
  return { exports:mod.exports, inputs:Object.keys(out.metafile.inputs), text:out.outputFiles[0].text };
}

test("index.js: the Groove module, no three.js, and riderPortrait for Field Day's gate", async () => {
  const { exports, inputs, text } = await bundle("float/client/art/index.js", { name:"float-art-groove-index" });
  for (const name of ["loadGrooveArt", "riderSprites", "riderPortrait", "sceneOf", "propOf", "hostSprites", "RiderSprite", "Popup"]) assert.equal(typeof exports[name], "function", name);
  assert.ok(!/require\(["']three["']\)/.test(text), "no three.js");
  assert.ok(!inputs.some(path => /float\/client\/art\/(?!groove\/|index\.js)/.test(path)), `only the Groove files: ${inputs.filter(p => p.includes("art/")).join(", ")}`);
});

test("the popup letters chart.js's judgement: the number over the word, Perfect on its plate, a miss without a number", async () => {
  const { exports } = await bundle("float/client/art/groove/Popup.jsx", { name:"float-art-groove-popup" });
  const React = (await import("react")).default;
  const { renderToStaticMarkup } = await import("react-dom/server");
  const html = (q, d) => renderToStaticMarkup(React.createElement(exports.default, { q, d, size:40 }));
  const late = html("late", 30);
  assert.match(late, /class="fg-popup-num">\+0\.03</);
  assert.match(late, /class="fg-popup-word">Late</);
  assert.match(late, /fg-tone-salmon/);
  assert.match(late, /--fg-size:40px/);
  const nice = html("nice", -10);
  assert.match(nice, />-0\.01</); assert.match(nice, />Nice!</); assert.match(nice, /fg-tone-yellow/);
  const perfect = html("perfect", 0);
  assert.match(perfect, /fg-popup--plate/); assert.match(perfect, />Perfect</); assert.match(perfect, />0\.00</);
  const miss = html("miss");
  assert.ok(!miss.includes("fg-popup-num"), "a miss has no number");
  assert.match(miss, />Miss</); assert.match(miss, /fg-tone-grey/);
  for (const [q, d] of [["late", 30], ["early", -170], ["ok", 120]]) assert.ok(html(q, d).includes(`>${popupOf(q, d).word}<`));
});

test("RiderSprite renders without the manifest (a placeholder box) and with it (the CSS composite at the asked size)", async () => {
  const React = (await import("react")).default;
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { exports:art } = await bundle("float/client/art/index.js", { name:"float-art-groove-sprite" });
  const draw = props => renderToStaticMarkup(React.createElement(art.RiderSprite, { critter:"frog", color:"#E53935", size:128, ...props }));
  art.provideGrooveArt(null);
  const empty = draw();
  assert.match(empty, /fg-rider--wait/);
  assert.match(empty, /width:128px/);
  art.provideGrooveArt(manifest);
  const css = draw({ pose:"cheer" });
  assert.match(css, /fg-rider--css/);
  assert.ok(css.includes(`src="/float/groove/${manifest.critters.frog.poses.cheer.src}"`), "the pose's sprite");
  assert.match(css, /background-color:#e53935/);
  assert.ok(css.includes(`url(&quot;/float/groove/${manifest.critters.frog.poses.cheer.tube}&quot;)`), "the tube mask");
  /* the stand-in draws the critter alone; the look's extras come with the painted sprite */
  assert.ok(!draw({ groom:true, hat:"cowboy", shades:"hearts" }).includes("looks/"), "no extras before the paint");
  /* an unknown critter draws the capybara */
  assert.ok(draw({ critter:"dragon" }).includes(manifest.critters.capybara.poses.idle.src));
});

test("the looks: every hat (keyed to take the colour; the crown gold) and every pair of glasses, anchored", async () => {
  for (const id of HAT_IDS.filter(id => id !== "none")) {
    const h = manifest.hats[id];
    assert.ok(h, `hat ${id}`);
    assert.deepEqual(await size(h.src), [h.w, h.h], `hat ${id}`);
    if (id !== "crown") assert.deepEqual(await size(h.mask), [h.w, h.h], `hat ${id} mask`);
    assert.ok(isPoint(h.anchor, h.w, h.h) && h.fit > 0 && h.depth >= 0, `hat ${id} fit`);
  }
  for (const id of SHADE_IDS.filter(id => id !== "none")) {
    const g = manifest.shades[id];
    assert.ok(g, `glasses ${id}`);
    assert.deepEqual(await size(g.src), [g.w, g.h]);
    assert.ok(isPoint(g.anchor, g.w, g.h) && g.span > g.w * 0.25 && g.span < g.w, `glasses ${id} span`);
  }
  for (const id of ALL_CRITTER_IDS) {
    const c = manifest.critters[id];
    assert.ok(c.measure.headW > 60 && c.measure.eyeSpan > 20, `${id} measure`);
    for (const pose of POSES) assert.ok(isPoint(c.poses[pose].anchor.eyes, 512, 512), `${id} ${pose} eyes`);
  }
});

test("the photo tee: every critter's eight poses with a shirt mask, a chest for the photo, and a portrait frame", async () => {
  for (const id of ALL_CRITTER_IDS) {
    const t = manifest.critters[id].tee;
    assert.ok(t, `${id} tee`);
    assert.ok(t.frame.length === 3 && t.frame[0] >= 0 && t.frame[1] >= 0 && t.frame[0] + t.frame[2] <= 512 && t.frame[1] + t.frame[2] <= 512, `${id} frame`);
    for (const pose of POSES) {
      const p = t.poses[pose];
      for (const rel of [p.src, p.tube, p.shirt]) assert.deepEqual(await size(rel), [512, 512], `${id} tee ${pose} ${rel}`);
      assert.ok(isPoint(p.anchor.chest, 512, 512) && p.chestR >= 18, `${id} tee ${pose} chest`);
      assert.deepEqual(p.anchor.water, manifest.critters[id].anchor.water, "the same waterline");
    }
  }
});

test("lookOf: none is nothing, the tee needs a photo, the groom's hat is the crown unless he picked one", () => {
  groove.provideGrooveArt(manifest);
  const plain = groove.lookOf({ color:"#E53935", look:{ critter:"frog", hat:"none", shades:"none", shirt:"photo" } });
  assert.deepEqual(plain, { critter:"frog", color:"#e53935", groom:false, hat:null, shades:null, shirt:null, photo:null });
  const dressed = groove.lookOf({ color:"#123", groom:true, photo:"/api/photo/7", look:{ critter:"otter", hat:"party", shades:"stars", shirt:"photo" } });
  assert.deepEqual(dressed, { critter:"otter", color:"#112233", groom:true, hat:"party", shades:"stars", shirt:"photo", photo:"/api/photo/7" });
  assert.equal(groove.hatOf(dressed), "party");
  assert.equal(groove.hatOf({ ...dressed, hat:null }), "crown");
  assert.equal(groove.hatOf({ ...dressed, hat:null, groom:false }), null);
});

test("no canvas in node: a photo tee look hands back the tee's files", async () => {
  groove.provideGrooveArt(manifest);
  const urls = await groove.riderSprites({ critter:"quail", color:"#123456", shirt:"photo", photo:"/api/photo/1", hat:"cowboy" });
  for (const pose of POSES) assert.equal(urls[pose], `/float/groove/${manifest.critters.quail.tee.poses[pose].src}`);
});

test("the cutscenes' props: the pelicans (one with a grip), dizzy stars, bonk, bubbles, tumbleweed; the countdown's chalkboard and clock (with a blank face), pull cord and foam", () => {
  for (const id of ["pelican", "pelican-carry", "dizzy", "bonk", "bubbles", "tumbleweed", "chalkboard", "clock", "pull-cord", "foam"]) assert.ok(manifest.props[id], id);
  const { props:p } = manifest;
  assert.ok(isPoint(p["pelican-carry"].grip, p["pelican-carry"].w, p["pelican-carry"].h));
  assert.ok(isPoint(p["pull-cord"].handle, p["pull-cord"].w, p["pull-cord"].h));
  for (const id of ["chalkboard", "clock"]) {
    const [x, y, w, h] = p[id].face;
    assert.ok(x >= 0 && y >= 0 && x + w <= p[id].w && y + h <= p[id].h && w > p[id].w * 0.4 && h > p[id].h * 0.4, `${id} face`);
  }
});
