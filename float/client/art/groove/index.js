/* Float Groove: the 2D art (float/GROOVE.md "The art manifest and the 2D
   art module", "Looks, the Groove"). Everything the TV and the phone draw
   comes from /float/groove/manifest.json: white deadpan critters in tubes
   (one sprite per critter per pose in a 512 box, the tube a grey that takes
   the rider's colour), their hats, glasses and photo tee, the host, the
   bartender, the scenes in parallax layers, the props and the pixel font.
   Pure data and canvas work: no React, no CSS, no three.js here (the
   components are RiderSprite.jsx and Popup.jsx beside it).

     loadGrooveArt()                    -> Promise<manifest> (fetched once)
     grooveArtNow()                     -> the manifest once loaded, else null
     lookOf(entrant)                    -> the flat look the painters take:
                                           { critter, color, groom, hat, shades, shirt, photo }
     riderSprites({ critter, color, groom, hat, shades, shirt, photo, size? })
                                        -> Promise<{ [pose]: url }> painted sprites
                                           (object URLs, cached per everything that changes them;
                                           size one of SPRITE_SIZES, spriteSize(drawn, dpr) picks it)
     riderSpritesNow({ ... })           -> the same, if already painted, else null
     riderPortrait(entrant, { size })   -> Promise<PNG data URL | null> (null without a DOM)
     sceneOf(id) / propOf(id) / hostSprites() / bartenderSprites()
                                        -> the manifest's entry with absolute URLs
                                           (null until loadGrooveArt has resolved)
     critterArt(id), poseArt(critter, pose), spriteAnchor(critter, pose, name, size)
                                        -> a critter's entry, a pose's files and anchors

   The tube: in a pose's `src` the tube is a light grey carrying its own
   shading, and `tube` is its mask (white, alpha = tube). Painting fills the
   mask with the rider's colour multiplied over that grey. A look adds
   layers: the photo tee (a second set of sprites whose shirt is keyed like
   the tube, the photo printed round at anchor.chest), glasses at
   anchor.eyes sized to the critter's eyes, and a hat (keyed like the tube,
   so it takes the colour too) on anchor.head sized to its head. The groom
   wears the crown unless he picked another hat. The tee is drawn only with
   a photo; a photo that will not load leaves the tee plain. */
import { ALL_CRITTER_IDS, retiredHat, retiredShades } from "../../../shared/looks.js";

export const GROOVE_BASE = "/float/groove/";
export const POSES = Object.freeze(["idle", "stroke", "stroke-r", "hey", "nice", "miss", "chug", "cheer", "out"]);
export const BOX = 512;
export const HOST_POSES = Object.freeze(["idle", "call", "cheer"]);
export const SCENES = Object.freeze(["open", "rocks", "whirlpool", "falls", "night", "lobby", "bar", "podium"]);
export const PROPS = Object.freeze(["splash", "ripple", "rock", "whirl", "cup", "crown", "sign-paddle", "sign-rock", "sign-spin", "falls-lip"]);
export const FALLBACK_CRITTER = "capybara";
export const FALLBACK_COLOR = "#9aa39e";
/* kept for older callers; the crown is now a hat sized to the head */
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

/* a critter's entry ({ anchor, measure, poses, portrait, tee }); an unknown id is the capybara */
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

/* a standing character: { box, anchor, poses:{ [pose]: url }, anchors:{ [pose]: anchor } } */
function castOf(entry, names) {
  if (!entry) return null;
  const poses = {}, anchors = {};
  for (const [pose, art] of Object.entries(entry.poses || {})) { poses[pose] = grooveUrl(art.src); anchors[pose] = { ...entry.anchor, ...(art.anchor || {}) }; }
  for (const pose of names) { poses[pose] ||= poses.idle || null; anchors[pose] ||= entry.anchor; }
  return { box:entry.box, anchor:entry.anchor, poses, anchors };
}
/* the host on the bank: idle, call (megaphone up), cheer; anchors ground, head, face, horn */
export const hostSprites = (m = manifest) => castOf(m?.host, HOST_POSES);
/* Last Call's bartender, waist up behind the counter: idle, slide, cheer; anchors ground (the counter), head, face, hand */
export const BARTENDER_POSES = Object.freeze(["idle", "slide", "cheer"]);
export const bartenderSprites = (m = manifest) => castOf(m?.bartender, BARTENDER_POSES);

/* a colour made usable: #rgb or #rrggbb, else the fallback grey */
export function normalColor(color) {
  const s = String(color || "").trim();
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(s)) return `#${[...s.slice(1)].map(ch => ch + ch).join("")}`.toLowerCase();
  return FALLBACK_COLOR;
}

/* ---- a rider's look ---- */

/* A rider's look from an entrant ({ color, groom, photo, look:{ critter,
   hat, shades, shirt } }) or a flat look ({ critter, color, groom, hat,
   shades, shirt, photo }). "none" is no hat or glasses; shirt "photo" is
   the photo tee, drawn only when there is a photo. */
export function lookOf(any = {}) {
  const look = any?.look && typeof any.look === "object" ? any.look : any || {};
  const pick = value => (typeof value === "string" && value && value !== "none" ? value : null);
  const photo = pick(any?.photo ?? look.photo);
  return {
    critter:pick(look.critter) || pick(any?.critter) || FALLBACK_CRITTER,
    color:normalColor(any?.color ?? look.color),
    groom:!!(any?.groom ?? look.groom),
    /* "none" stays "none": no hat, the groom's crown too; unset (null) is the groom's crown */
    hat:(look.hat ?? any?.hat) === "none" ? "none" : pick(look.hat ?? any?.hat),
    shades:pick(look.shades ?? any?.shades),
    shirt:(look.shirt ?? any?.shirt) === "photo" && photo ? "photo" : null,
    photo,
  };
}
/* the hat a look wears: "none" is none (the groom's too); its own; else, unset, the groom's crown.
   A retired id is drawn as the hat cleanLook moves it to. */
export function hatOf(look, m = manifest) {
  const raw = look?.hat;
  if (raw === "none") return null;
  const id = raw ? retiredHat(raw) : null;
  if (id && m?.hats?.[id]) return id;
  if (raw && !id) return null;
  return !raw && look?.groom && m?.hats?.crown ? "crown" : null;
}
/* a critter's sizes for hats and glasses (in its art's px) */
const DEFAULT_MEASURE = Object.freeze({ headW:180, eyeSpan:80, tilt:0 });
/* a head is never taken as narrower than this share of the box (a hat on a small head still reads on a TV) */
const MIN_HEAD_SHARE = 0.2;
/* glasses: as wide as the eyes ask, within these shares of the head */
const SHADES_MIN = 0.62, SHADES_MAX = 0.95;
const measureOf = (entry, fallback = DEFAULT_MEASURE) => ({ ...fallback, ...(entry?.measure || {}) });

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
  if (typeof createImageBitmap === "function" && typeof fetch === "function" && !/^data:image\/svg/i.test(url)) {
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

/* the masked part of src filled with color multiplied over its grey, drawn on g */
function tintInto(g, src, mask, color, w, h) {
  if (!mask) return;
  const t = canvas(w, h);
  const tg = t.getContext("2d");
  tg.drawImage(mask, 0, 0, w, h);
  tg.globalCompositeOperation = "source-in";
  tg.fillStyle = normalColor(color);
  tg.fillRect(0, 0, w, h);
  tg.globalCompositeOperation = "multiply";
  tg.drawImage(src, 0, 0, w, h);
  tg.globalCompositeOperation = "destination-in";
  tg.drawImage(mask, 0, 0, w, h);
  g.drawImage(t, 0, 0);
}
/* an image with its masked part in a colour, at its own size */
function tinted(src, mask, color) {
  const w = src.width, h = src.height;
  const out = canvas(w, h);
  const g = out.getContext("2d");
  g.drawImage(src, 0, 0, w, h);
  tintInto(g, src, mask, color, w, h);
  return out;
}

/* Paint one pose onto a new canvas of w x h: src with its masks (the tube,
   the tee's shirt) in the colour, then the photo printed round on the
   chest, the glasses at the eyes, the hat on the head. Anchors and sizes
   are in the art's own px (boxW wide). layers: { photo, shades:{ img, w,
   h, anchor, span }, hat:{ img, w, h, anchor (its base), fit, depth, gap } }. `crown` is
   the old single-crown form ({ img, at, anchor:[share x, share y], share }). */
export function paintSprite({ src, tube, shirt = null, color, w, h, boxW = w, anchor = null, measure = DEFAULT_MEASURE, chestR = 0, layers = {}, crown = null }) {
  const out = canvas(w, h);
  const g = out.getContext("2d");
  g.drawImage(src, 0, 0, w, h);
  tintInto(g, src, tube, color, w, h);
  tintInto(g, src, shirt, color, w, h);
  const k = w / boxW;
  const { photo, shades, hat } = layers || {};
  if (photo && anchor?.chest && chestR > 0) {
    /* printed on the tee: the photo's middle square in a ringed circle, kept to the shirt (the arms cross it) */
    const [cx, cy] = anchor.chest, r = chestR * k;
    const p = canvas(w, h);
    const pg = p.getContext("2d");
    pg.save();
    pg.beginPath();
    pg.arc(cx * k, cy * k, r, 0, Math.PI * 2);
    pg.clip();
    const side = Math.min(photo.width, photo.height);
    pg.drawImage(photo, (photo.width - side) / 2, (photo.height - side) / 2, side, side, cx * k - r, cy * k - r, r * 2, r * 2);
    pg.restore();
    pg.beginPath();
    pg.arc(cx * k, cy * k, r, 0, Math.PI * 2);
    pg.lineWidth = Math.max(1, r * 0.1);
    pg.strokeStyle = "#1d1b22";
    pg.stroke();
    if (shirt) {
      pg.globalCompositeOperation = "destination-in";
      pg.drawImage(shirt, 0, 0, w, h);
    }
    g.drawImage(p, 0, 0);
  }
  /* glasses and hat turn with the eye line (measure.tilt, degrees) about their own anchor */
  const tilt = Math.max(-25, Math.min(25, Number(measure.tilt) || 0)) * Math.PI / 180;
  const headW = Math.max(measure.headW || DEFAULT_MEASURE.headW, boxW * MIN_HEAD_SHARE);
  if (shades?.img && anchor?.eyes) {
    /* lenses on the eyes' span, the frame never wider than the head */
    const lensFit = (measure.eyeSpan || headW * 0.42) * (shades.w / shades.span) * (shades.fit ?? 0.95);
    const gw = Math.max(headW * SHADES_MIN, Math.min(headW * SHADES_MAX, lensFit));
    const sc = gw / shades.w;
    g.save();
    g.translate(anchor.eyes[0] * k, anchor.eyes[1] * k);
    g.rotate(tilt);
    g.drawImage(shades.img, -shades.anchor[0] * sc * k, -shades.anchor[1] * sc * k, shades.w * sc * k, shades.h * sc * k);
    g.restore();
  }
  if (hat?.img && anchor?.head) {
    /* the base under the head's top, but never down over the eyes */
    const sc = (hat.fit * headW) / hat.w;
    let baseY = (hat.depth ?? hat.sink ?? 0.1) * headW;
    if (anchor.eyes) {
      const ex = anchor.eyes[0] - anchor.head[0], ey = anchor.eyes[1] - anchor.head[1];
      const eyeY = -ex * Math.sin(tilt) + ey * Math.cos(tilt);
      baseY = Math.min(baseY, eyeY - (hat.gap ?? 0.08) * headW);
    }
    g.save();
    g.translate(anchor.head[0] * k, anchor.head[1] * k);
    g.rotate(tilt);
    g.drawImage(hat.img, -hat.anchor[0] * sc * k, (baseY - hat.anchor[1] * sc) * k, hat.w * sc * k, hat.h * sc * k);
    g.restore();
  }
  if (crown?.img && crown.at) {
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

/* a look's own pictures, loaded and coloured once: the hat (tinted), the glasses, the photo (null if it will not load) */
async function layersOf(m, look) {
  const hatId = hatOf(look, m);
  const hat = hatId ? m.hats[hatId] : null;
  const sh = look.shades ? m.shades?.[retiredShades(look.shades)] : null;
  const [hatSrc, hatMask, shadesImg, photo] = await Promise.all([
    hat ? loadImage(grooveUrl(hat.src)).catch(() => null) : null,
    hat?.mask ? loadImage(grooveUrl(hat.mask)).catch(() => null) : null,
    sh ? loadImage(grooveUrl(sh.src)).catch(() => null) : null,
    look.shirt && look.photo ? loadImage(look.photo).catch(() => null) : null,
  ]);
  return {
    hat:hat && hatSrc ? { ...hat, img:hatMask ? tinted(hatSrc, hatMask, look.color) : hatSrc } : null,
    shades:sh && shadesImg ? { ...sh, img:shadesImg } : null,
    photo,
  };
}

/* the set a look's poses come from: the tee's with the photo tee (when the critter has one), else the plain one */
const artSet = (c, look) => (look.shirt && c?.tee?.poses ? c.tee : c);

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
/* everything that changes the picture, so two looks never share an entry */
const spriteKey = (raw = {}) => {
  const look = lookOf(raw);
  const hat = manifest ? hatOf(look, manifest) : look.hat === "none" ? null : look.hat || (look.groom ? "crown" : null);
  return [resolvedId(look.critter), look.color, hat || "", look.shades || "", look.shirt ? `tee:${look.photo}` : "", paintSize(raw?.size)].join("|");
};
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

/* every pose of a look painted: { [pose]: object URL }. raw is a flat look
   ({ critter, color, groom, hat, shades, shirt, photo, size }) or an
   entrant (lookOf reads either). size (optional, one of SPRITE_SIZES,
   spriteSize() picks it) paints smaller than the 512 box; anchors scale by
   size / 512. */
export function riderSprites(raw = {}) {
  return loadGrooveArt().then(m => {
    const look = lookOf(raw);
    const key = spriteKey(raw);
    if (painted.has(key)) return painted.get(key);
    const px = paintSize(raw?.size);
    const id = resolvedId(look.critter, m);
    const c = critterArt(id, m);
    const set = artSet(c, look);
    const box = m.box || [BOX, BOX];
    const job = (async () => {
      const urls = {};
      if (!hasCanvas()) {
        for (const pose of m.poses || POSES) urls[pose] = grooveUrl((set.poses?.[pose] || set.poses?.idle)?.src) || null;
        return urls;
      }
      const layers = await layersOf(m, look);
      const done = new Map();
      for (const pose of m.poses || POSES) {
        const art = set.poses?.[pose] || set.poses?.idle;
        const at = { ...c.anchor, ...(set.anchor || {}), ...(art?.anchor || {}) };
        const measure = measureOf(art, measureOf(set, measureOf(c)));
        const fileKey = `${art?.src}|${art?.tube}|${art?.shirt || ""}|${JSON.stringify(at)}|${JSON.stringify(measure)}`;
        if (done.has(fileKey)) { urls[pose] = done.get(fileKey); continue; }
        const [src, tube, shirt] = await Promise.all([
          loadImage(grooveUrl(art.src)),
          loadImage(grooveUrl(art.tube)).catch(() => null),
          art.shirt ? loadImage(grooveUrl(art.shirt)).catch(() => null) : null,
        ]);
        const out = paintSprite({ src, tube, shirt, color:look.color, w:Math.round(px * box[0] / BOX), h:Math.round(px * box[1] / BOX), boxW:box[0], anchor:at, measure, chestR:art.chestR || 0, layers });
        urls[pose] = await canvasUrl(out);
        /* poses that share one file and anchors (the placeholders) are painted once */
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
   the critter facing front in its tube in the rider's colour, in its hat
   and glasses, on a transparent background. Resolves to a PNG data URL, or
   null without a DOM. entrant: { color, groom, photo, look:{ critter, hat,
   shades, shirt } }. With the photo tee the still is the tee's idle pose,
   cut to the portrait's framing (tee.frame). */
export async function riderPortrait(entrant = {}, { size = 256 } = {}) {
  if (!hasCanvas() || typeof fetch !== "function") return null;
  const m = await loadGrooveArt().catch(() => null);
  if (!m) return null;
  const look = lookOf(entrant);
  const id = resolvedId(look.critter, m);
  const c = critterArt(id, m);
  if (!c?.portrait) return null;
  const px = Math.max(16, Math.min(1024, Math.round(Number(size) || 256)));
  const key = `${spriteKey({ ...look, size:BOX })}|${px}`;
  if (portraits.has(key)) return portraits.get(key);
  const job = (async () => {
    const layers = await layersOf(m, look);
    const tee = look.shirt && c.tee?.poses?.idle ? c.tee : null;
    if (tee) {
      const art = tee.poses.idle;
      const box = m.box || [BOX, BOX];
      const [src, tube, shirt] = await Promise.all([loadImage(grooveUrl(art.src)), loadImage(grooveUrl(art.tube)).catch(() => null), art.shirt ? loadImage(grooveUrl(art.shirt)).catch(() => null) : null]);
      const full = paintSprite({ src, tube, shirt, color:look.color, w:box[0], h:box[1], boxW:box[0], anchor:{ ...c.anchor, ...(tee.anchor || {}), ...art.anchor }, measure:measureOf(art, measureOf(c)), chestR:art.chestR || 0, layers });
      const [fx, fy, fw] = tee.frame || [0, 0, box[0]];
      const out = canvas(px, px);
      out.getContext("2d").drawImage(full, fx, fy, fw, fw, 0, 0, px, px);
      return canvasDataUrl(out);
    }
    const [src, tube] = await Promise.all([loadImage(grooveUrl(c.portrait.src)), loadImage(grooveUrl(c.portrait.tube)).catch(() => null)]);
    const pm = measureOf(c.portrait, { headW:DEFAULT_MEASURE.headW * 2, eyeSpan:DEFAULT_MEASURE.eyeSpan * 2 });
    const out = paintSprite({ src, tube, color:look.color, w:px, h:px, boxW:c.portrait.w || 1024, anchor:c.portrait.anchor, measure:pm, layers });
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
