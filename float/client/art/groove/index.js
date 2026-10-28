/* Float Groove: the 2D art (float/GROOVE.md "The art manifest and the 2D
   art module"). Everything the TV and the phone draw comes from
   /float/groove/manifest.json: white deadpan critters in tubes (one sprite
   per critter per pose in a 512 box, the tube a grey that takes the rider's
   colour), the host, the scenes in parallax layers, the props and the pixel
   font. Pure data and canvas work: no React, no CSS, no three.js here (the
   components are RiderSprite.jsx and Popup.jsx beside it).

     loadGrooveArt()                    -> Promise<manifest> (fetched once)
     grooveArtNow()                     -> the manifest once loaded, else null
     riderSprites({ critter, color, groom, size? })
                                        -> Promise<{ [pose]: url }> painted sprites
                                           (object URLs; cached per critter, colour, groom, size;
                                           size one of SPRITE_SIZES, spriteSize(drawn, dpr) picks it)
     riderSpritesNow({ ... })           -> the same, if already painted, else null
     riderPortrait(entrant, { size })   -> Promise<PNG data URL | null> (null without a DOM)
     sceneOf(id) / propOf(id) / hostSprites()
                                        -> the manifest's entry with absolute URLs
                                           (null until loadGrooveArt has resolved)
     critterArt(id), poseArt(critter, pose), spriteAnchor(critter, pose, name, size)
                                        -> a critter's entry, a pose's files and anchors

   The tube: in a pose's `src` the tube is a light grey carrying its own
   shading, and `tube` is its mask (white, alpha = tube). Painting fills the
   mask with the rider's colour multiplied over that grey. The groom's
   sprites wear the crown (prop "crown") at the pose's head anchor. */
import { ALL_CRITTER_IDS } from "../../../shared/looks.js";

export const GROOVE_BASE = "/float/groove/";
export const POSES = Object.freeze(["idle", "stroke", "hey", "nice", "miss", "chug", "cheer", "out"]);
export const BOX = 512;
export const HOST_POSES = Object.freeze(["idle", "call", "cheer"]);
export const SCENES = Object.freeze(["open", "rocks", "whirlpool", "falls", "lobby", "bar", "podium"]);
export const PROPS = Object.freeze(["splash", "ripple", "rock", "whirl", "cup", "crown", "sign-paddle", "sign-rock", "sign-spin", "falls-lip"]);
export const FALLBACK_CRITTER = "capybara";
export const FALLBACK_COLOR = "#9aa39e";
/* the crown on a groom's sprite, as a share of the box's width */
export const CROWN_SHARE = 0.24;

let base = GROOVE_BASE;
let manifest = null;
let loading = null;
const listeners = new Set();

/* where the files are (tests, or a page served from elsewhere) */
export function setGrooveBase(url = GROOVE_BASE) {
  base = url.endsWith("/") ? url : `${url}/`;
  manifest = null;
  loading = null;
  clearPainted();
}
/* a test or a rehearsal hands the manifest in ahead */
export function provideGrooveArt(m) {
  manifest = m && typeof m === "object" ? m : null;
  loading = manifest ? Promise.resolve(manifest) : null;
  clearPainted();
  listeners.forEach(fn => fn(manifest));
}
export const grooveArtNow = () => manifest;
/* called with the manifest when it lands; returns the unsubscribe */
export function onGrooveArt(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/* a path in the manifest as a URL (absolute paths and URLs pass through) */
export function grooveUrl(file) {
  if (!file) return null;
  if (/^(?:[a-z]+:|\/)/i.test(file)) return file;
  return `${base}${file}`;
}

export function loadGrooveArt() {
  if (manifest) return Promise.resolve(manifest);
  if (loading) return loading;
  if (typeof fetch !== "function") return Promise.reject(new Error("no fetch"));
  loading = fetch(`${base}manifest.json`, { cache:"no-cache" })
    .then(res => { if (!res.ok) throw new Error(`manifest ${res.status}`); return res.json(); })
    .then(m => {
      manifest = m;
      loadPixelFont(m);
      listeners.forEach(fn => fn(manifest));
      return m;
    })
    .catch(error => { loading = null; throw error; });
  return loading;
}

/* the popups' face, loaded with the manifest so the first judgement never
   letters in a fallback (groove.css declares it) */
function loadPixelFont(m) {
  try {
    const family = m?.font?.family || "Float Pixel";
    if (typeof document !== "undefined" && document.fonts?.load) document.fonts.load(`700 48px "${family}"`).catch(() => {});
  } catch {}
}

/* ---- reading the manifest ---- */

export const knownCritter = id => ALL_CRITTER_IDS.includes(id);

/* a critter's entry ({ anchor, poses, portrait }); an unknown id is the capybara */
export function critterArt(id, m = manifest) {
  if (!m?.critters) return null;
  return m.critters[id] || m.critters[FALLBACK_CRITTER] || Object.values(m.critters)[0] || null;
}

/* one pose: { src, tube, anchor } as URLs; a pose without its own art is idle */
export function poseArt(critter, pose = "idle", m = manifest) {
  const c = critterArt(critter, m);
  if (!c) return null;
  const p = c.poses?.[pose] || c.poses?.idle;
  if (!p) return null;
  return { src:grooveUrl(p.src), tube:grooveUrl(p.tube), anchor:{ ...c.anchor, ...(p.anchor || {}) }, box:m.box || [BOX, BOX] };
}

/* an anchor of a pose in px at a drawn size (the box is square) */
export function spriteAnchor(critter, pose, name = "water", size = BOX, m = manifest) {
  const p = poseArt(critter, pose, m);
  const at = p?.anchor?.[name];
  if (!at) return null;
  const k = size / (p.box?.[0] || BOX);
  return [at[0] * k, at[1] * k];
}

export function sceneOf(id, m = manifest) {
  const s = m?.scenes?.[id];
  if (!s) return null;
  return { id, ...s, layers:(s.layers || []).map(layer => ({ ...layer, src:grooveUrl(layer.src) })) };
}

export function propOf(id, m = manifest) {
  const p = m?.props?.[id];
  return p ? { id, ...p, src:grooveUrl(p.src) } : null;
}

export function hostSprites(m = manifest) {
  const h = m?.host;
  if (!h) return null;
  const poses = {};
  for (const [pose, art] of Object.entries(h.poses || {})) poses[pose] = grooveUrl(art.src);
  for (const pose of HOST_POSES) poses[pose] ||= poses.idle || null;
  return { box:h.box, anchor:h.anchor, poses };
}

/* a colour made usable: #rgb or #rrggbb, else the fallback grey */
export function normalColor(color) {
  const s = String(color || "").trim();
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(s)) return `#${[...s.slice(1)].map(ch => ch + ch).join("")}`.toLowerCase();
  return FALLBACK_COLOR;
}

/* ---- painting (a browser's canvas; node has none and gets the bare files) ---- */

const hasCanvas = () => typeof OffscreenCanvas === "function" || (typeof document !== "undefined" && typeof document.createElement === "function");
function canvas(w, h) {
  if (typeof OffscreenCanvas === "function") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}

const images = new Map();
/* an image ready to draw (decoded once per URL) */
export function loadImage(url) {
  if (!url) return Promise.resolve(null);
  if (images.has(url)) return images.get(url);
  let job;
  if (typeof createImageBitmap === "function" && typeof fetch === "function") {
    job = fetch(url).then(res => { if (!res.ok) throw new Error(`${url} ${res.status}`); return res.blob(); }).then(blob => createImageBitmap(blob));
  } else if (typeof Image === "function") {
    job = new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`${url} failed`));
      img.src = url;
    });
  } else job = Promise.reject(new Error("no image decoder"));
  job = job.catch(error => { images.delete(url); throw error; });
  images.set(url, job);
  return job;
}

/* Paint a sprite onto a new canvas of w x h: the critter, its tube filled
   with `color` multiplied over its grey, and the crown if `crown` is
   { img, at:[x, y] (box px), share }. */
export function paintSprite({ src, tube, color, w, h, boxW = w, crown = null }) {
  const out = canvas(w, h);
  const g = out.getContext("2d");
  g.drawImage(src, 0, 0, w, h);
  if (tube) {
    const t = canvas(w, h);
    const tg = t.getContext("2d");
    tg.drawImage(tube, 0, 0, w, h);
    tg.globalCompositeOperation = "source-in";
    tg.fillStyle = normalColor(color);
    tg.fillRect(0, 0, w, h);
    tg.globalCompositeOperation = "multiply";
    tg.drawImage(src, 0, 0, w, h);
    tg.globalCompositeOperation = "destination-in";
    tg.drawImage(tube, 0, 0, w, h);
    g.drawImage(t, 0, 0);
  }
  if (crown?.img && crown.at) {
    const k = w / boxW;
    const cw = boxW * (crown.share || CROWN_SHARE) * k;
    const ch = cw * ((crown.img.height || 1) / (crown.img.width || 1));
    const [ax, ay] = crown.anchor || [0.5, 0.92];
    g.drawImage(crown.img, crown.at[0] * k - cw * ax, crown.at[1] * k - ch * ay, cw, ch);
  }
  return out;
}

async function canvasUrl(c) {
  let blob;
  if (typeof c.convertToBlob === "function") blob = await c.convertToBlob({ type:"image/webp", quality:0.92 });
  else blob = await new Promise(resolve => c.toBlob(resolve, "image/webp", 0.92));
  if (!blob) throw new Error("no blob");
  return URL.createObjectURL(blob);
}
async function canvasDataUrl(c) {
  if (typeof c.toDataURL === "function") return c.toDataURL("image/png");
  const blob = await c.convertToBlob({ type:"image/png" });
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

/* the crown's art for a pose: the prop and where it sits */
function crownFor(m, critter, pose) {
  const prop = m?.props?.crown;
  const p = poseArt(critter, pose, m);
  if (!prop || !p?.anchor?.head) return null;
  const anchor = prop.anchor && prop.w ? [prop.anchor[0] / prop.w, prop.anchor[1] / prop.h] : [0.5, 0.92];
  return { url:grooveUrl(prop.src), at:p.anchor.head, anchor };
}

/* The size a sprite is painted at: the smallest of 128, 256 and 512 that
   covers the drawn size in device pixels (a TV's small riders keep a
   quarter of the memory; a phone's big one stays sharp). */
export const SPRITE_SIZES = Object.freeze([128, 256, 512]);
export function spriteSize(drawn = BOX, dpr = 1) {
  const px = Math.max(1, Number(drawn) || BOX) * Math.max(1, Number(dpr) || 1);
  return SPRITE_SIZES.find(size => size >= px) || BOX;
}

const MAX_PAINTED = 160;
const painted = new Map();
const settled = new Map();
const warmed = new Map();
const resolvedId = (critter, m = manifest) => (m?.critters?.[critter] ? critter : FALLBACK_CRITTER);
const paintSize = size => (SPRITE_SIZES.includes(size) ? size : BOX);
const spriteKey = ({ critter, color, groom, size }) => `${resolvedId(critter)}|${normalColor(color)}|${groom ? 1 : 0}|${paintSize(size)}`;
function forget(urls) {
  for (const url of Object.values(urls)) {
    if (!String(url).startsWith("blob:")) continue;
    images.delete(url);
    warmed.delete(url);
    try { URL.revokeObjectURL(url); } catch {}
  }
}
function clearPainted() {
  for (const urls of settled.values()) forget(urls);
  painted.clear();
  settled.clear();
}
/* decoded as an <img> ahead, and held, so showing a pose never waits on a decode */
function warm(url) {
  if (typeof Image !== "function" || warmed.has(url)) return Promise.resolve();
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  warmed.set(url, img);
  return typeof img.decode === "function" ? img.decode().catch(() => {}) : Promise.resolve();
}

/* the painted sprites, if they are ready now (a render reads this) */
export function riderSpritesNow(look = {}) {
  if (!manifest) return null;
  return settled.get(spriteKey(look)) || null;
}

/* every pose painted in the rider's colour: { [pose]: object URL }. size
   (optional, one of SPRITE_SIZES, spriteSize() picks it) paints them
   smaller than the 512 box; anchors scale by size / 512. */
export function riderSprites({ critter = FALLBACK_CRITTER, color = FALLBACK_COLOR, groom = false, size = BOX } = {}) {
  return loadGrooveArt().then(m => {
    const key = spriteKey({ critter, color, groom, size });
    const px = paintSize(size);
    if (painted.has(key)) return painted.get(key);
    const c = critterArt(critter, m);
    const id = resolvedId(critter, m);
    const box = m.box || [BOX, BOX];
    const job = (async () => {
      const urls = {};
      if (!hasCanvas()) {
        for (const pose of m.poses || POSES) urls[pose] = poseArt(id, pose, m)?.src || null;
        return urls;
      }
      const crownImg = groom && m.props?.crown ? await loadImage(grooveUrl(m.props.crown.src)).catch(() => null) : null;
      const done = new Map();
      for (const pose of m.poses || POSES) {
        const art = c.poses?.[pose] || c.poses?.idle;
        const fileKey = `${art?.src}|${art?.tube}|${art?.anchor?.head || ""}`;
        if (done.has(fileKey)) { urls[pose] = done.get(fileKey); continue; }
        const p = poseArt(id, pose, m);
        const [src, tube] = await Promise.all([loadImage(p.src), loadImage(p.tube).catch(() => null)]);
        const crown = crownImg ? { img:crownImg, ...crownFor(m, id, pose) } : null;
        const out = paintSprite({ src, tube, color, w:Math.round(px * box[0] / BOX), h:Math.round(px * box[1] / BOX), boxW:box[0], crown });
        urls[pose] = await canvasUrl(out);
        /* poses that share one file (the placeholders) are painted once */
        done.set(fileKey, urls[pose]);
        /* let a frame through between poses */
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      await Promise.all([...new Set(Object.values(urls))].map(warm));
      settled.set(key, urls);
      if (settled.size > MAX_PAINTED) {
        const [oldKey, oldUrls] = settled.entries().next().value;
        settled.delete(oldKey);
        painted.delete(oldKey);
        forget(oldUrls);
      }
      return urls;
    })();
    job.catch(() => painted.delete(key));
    painted.set(key, job);
    return job;
  });
}

const portraits = new Map();
/* A still of a rider for the Locker, the lobby and Field Day's TV turn:
   the critter's portrait (idle, facing front) in its tube in the rider's
   colour, on a transparent background. Resolves to a PNG data URL, or null
   without a DOM. entrant: { color, look:{ critter }, groom } */
export async function riderPortrait(entrant = {}, { size = 256 } = {}) {
  if (!hasCanvas() || typeof fetch !== "function") return null;
  const m = await loadGrooveArt().catch(() => null);
  if (!m) return null;
  const critter = entrant?.look?.critter || entrant?.critter || FALLBACK_CRITTER;
  const c = critterArt(critter, m);
  if (!c?.portrait) return null;
  const px = Math.max(16, Math.min(1024, Math.round(Number(size) || 256)));
  const groom = !!entrant?.groom;
  const key = `${resolvedId(critter, m)}|${normalColor(entrant?.color)}|${groom ? 1 : 0}|${px}`;
  if (portraits.has(key)) return portraits.get(key);
  const job = (async () => {
    const [src, tube] = await Promise.all([loadImage(grooveUrl(c.portrait.src)), loadImage(grooveUrl(c.portrait.tube)).catch(() => null)]);
    let crown = null;
    if (groom && m.props?.crown && c.portrait.anchor?.head) {
      const img = await loadImage(grooveUrl(m.props.crown.src)).catch(() => null);
      const prop = m.props.crown;
      if (img) crown = { img, at:c.portrait.anchor.head, anchor:[prop.anchor[0] / prop.w, prop.anchor[1] / prop.h] };
    }
    const out = paintSprite({ src, tube, color:entrant?.color, w:px, h:px, boxW:c.portrait.w || 1024, crown });
    return canvasDataUrl(out);
  })();
  job.catch(() => portraits.delete(key));
  portraits.set(key, job);
  return job;
}

/* ---- the popup's lettering (Popup.jsx) ---- */

/* the class names a judgement letters with: { tone, plate } (Perfect sits on a gold plate) */
export function popupStyle(tone) {
  return { tone:tone || "white", plate:tone === "gold" };
}
