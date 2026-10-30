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
     riderPortrait(entrant, { size, frame }) -> Promise<PNG data URL | null> (null without a DOM);
                                           frame "head" crops to the head, so a hat or glasses chip reads small
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

/* a critter's entry ({ anchor, measure, poses, portrait, tee, hatScale }); an unknown id is the capybara.
   hatScale: its skull's width over its measured head's (horns or fluff measured in), for hats;
   browShare: its brow's height over its eyes as a share of that width, where the eyes are its top */
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
/* the photo window on a kayak's hull: this many times as wide as tall (scripts/float-art-deck.mjs ASPECT) */
export const DECK_ASPECT = 1.7;
/* glasses: as wide as the eyes ask, within these shares of the head */
const SHADES_MIN = 0.62, SHADES_MAX = 0.95;
/* the ink of the line art, and the hat's shadow on the head (ink, this strong) */
const INK = "#1d1b22";
const SHADOW_INK = "#1d1b22", SHADOW_ALPHA = 0.24;
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
   chest (on a kayak, a sticker on the hull at anchor.deck, deckR), the glasses at the eyes, the hat on the head. Anchors and sizes
   are in the art's own px (boxW wide). layers: { photo, shades:{ img, w,
   h, anchor, span }, hat:{ img, w, h, anchor (its front edge), fit, sink (or the older depth, gap),
   shadow } }. front / seam: the pose's parts that stand in front of what it wears and the ink at
   their base (scripts/float-art-seat.mjs), drawn only where a hat or glasses went. `crown` is the
   old single-crown form ({ img, at, anchor:[share x, share y], share }). */
export function paintSprite({ src, tube, shirt = null, front = null, seam = null, wornTop = false, color, w, h, boxW = w, anchor = null, measure = DEFAULT_MEASURE, chestR = 0, deckR = 0, deckTilt = 0, layers = {}, crown = null }) {
  const out = canvas(w, h);
  const g = out.getContext("2d");
  g.drawImage(src, 0, 0, w, h);
  tintInto(g, src, tube, color, w, h);
  tintInto(g, src, shirt, color, w, h);
  const k = w / boxW;
  const { photo, shades, hat } = layers || {};
  /* the photo: on a kayak, a sticker on the hull's side (deckR), the one place every pose shows whole;
     else printed on the tee's chest, kept to the shirt (the arms cross it) */
  const onDeck = photo && anchor?.deck && deckR > 0;
  const at = onDeck ? anchor.deck : anchor?.chest;
  const pr = onDeck ? deckR : chestR;
  /* the deck circle lies inside the hull by its measure (the mask, thinned at the shine, would fade it) */
  const keep = onDeck ? null : shirt;
  if (photo && at && pr > 0) {
    const [cx, cy] = at, r = pr * k;
    /* the deck's window is wide (DECK_ASPECT), turned with the hull; the chest's is round */
    const rx = onDeck ? r * DECK_ASPECT : r, turn = onDeck ? (Number(deckTilt) || 0) * Math.PI / 180 : 0;
    const p = canvas(w, h);
    const pg = p.getContext("2d");
    const shape = (sx, sy) => { pg.beginPath(); pg.ellipse(cx * k, cy * k, sx, sy, turn, 0, Math.PI * 2); };
    if (onDeck) {
      /* a white rim, then the photo's middle, then the ink line */
      shape(rx, r);
      pg.fillStyle = "#fffdf8";
      pg.fill();
    }
    const inset = onDeck ? r * 0.16 : 0;
    const iy = r - inset, ix = rx - inset;
    pg.save();
    shape(ix, iy);
    pg.clip();
    /* the photo's middle band (a face sits a little over the middle of a profile photo), as wide as the window */
    const pw = photo.width, ph = photo.height;
    const sw = Math.min(pw, ph * (ix / iy)), sh = sw * (iy / ix);
    const sx = (pw - sw) / 2, sy = Math.max(0, Math.min(ph - sh, ph * (onDeck ? 0.46 : 0.5) - sh / 2));
    pg.translate(cx * k, cy * k);
    pg.rotate(turn);
    pg.drawImage(photo, sx, sy, sw, sh, -ix, -iy, ix * 2, iy * 2);
    pg.restore();
    shape(rx, r);
    pg.lineWidth = Math.max(1, r * (onDeck ? 0.12 : 0.1));
    pg.strokeStyle = INK;
    pg.stroke();
    if (keep) {
      pg.globalCompositeOperation = "destination-in";
      pg.drawImage(keep, 0, 0, w, h);
    }
    g.drawImage(p, 0, 0);
  }
  /* glasses and hat turn with the eye line (measure.tilt, degrees) about their own anchor */
  const tilt = Math.max(-25, Math.min(25, Number(measure.tilt) || 0)) * Math.PI / 180;
  const headW = Math.max(measure.headW || DEFAULT_MEASURE.headW, boxW * MIN_HEAD_SHARE);
  /* what is worn keeps one size across a critter's poses (measure.wearW, wearSpan: its idle head's),
     so a hat never pulses as the poses swap on the beat */
  const wearW = Math.max(measure.wearW || measure.headW || DEFAULT_MEASURE.headW, boxW * MIN_HEAD_SHARE);
  /* each worn thing on its own layer: the glasses, the hat; a cast shadow under both, the parts that
     stand in front of them (ears, horns, a crest, a paddle overhead, the cup) drawn back over them */
  const wearsShades = !!(shades?.img && anchor?.eyes), wearsHat = !!(hat?.img && anchor?.head);
  if (wearsShades || wearsHat) {
    const glassesLayer = wearsShades ? canvas(w, h) : null, hatLayer = wearsHat ? canvas(w, h) : null;
    /* the glasses' height over the eyes (art px), a brim stays off it; the hat's part over its crown line, which ears come through */
    let glassesTop = null, hatCrown = null;
    if (wearsShades) {
      /* lenses on the eyes' span, the frame never wider than the head; a face turned three quarters
         has its eyes closer than a front face's, so the frame narrows with them but keeps its height */
      const gg = glassesLayer.getContext("2d");
      const lensFit = (measure.wearSpan || measure.eyeSpan || headW * 0.42) * (shades.w / shades.span) * (shades.fit ?? 0.95);
      const gw = Math.max(wearW * SHADES_MIN, Math.min(wearW * SHADES_MAX, lensFit));
      const sc = gw / shades.w;
      const sy = measure.turn ? sc / Math.max(0.6, 1 - measure.turn * 0.4) : sc;
      gg.translate(anchor.eyes[0] * k, anchor.eyes[1] * k);
      gg.rotate(tilt);
      gg.drawImage(shades.img, -shades.anchor[0] * sc * k, -shades.anchor[1] * sy * k, shades.w * sc * k, shades.h * sy * k);
      glassesTop = shades.anchor[1] * sy;
      /* never past the critter's own outline: on a three quarter face the far lens goes behind the snout */
      gg.setTransform(1, 0, 0, 1, 0, 0);
      gg.globalCompositeOperation = "destination-in";
      gg.drawImage(src, 0, 0, w, h);
    }
    if (wearsHat) {
      const hg = hatLayer.getContext("2d");
      /* a critter whose measured head takes in its horns or fluff wears its hat at its skull's width */
      const skullW = Math.max(boxW * MIN_HEAD_SHARE, (measure.wearW || measure.headW || DEFAULT_MEASURE.headW) * (measure.hatScale ?? 1)) * (measure.wearScale ?? 1);
      const sc = (hat.fit * skullW) / hat.w;
      let baseY;
      if (hat.sink != null && anchor.eyes) {
        /* seated: the hat's front edge on the brow, `sink` of the way from the head's top down to the
           eye line, so the skull goes into the crown instead of the hat perching on it */
        const ex = anchor.eyes[0] - anchor.head[0], ey = anchor.eyes[1] - anchor.head[1];
        const eyeY = -ex * Math.sin(tilt) + ey * Math.cos(tilt);
        if (Number.isFinite(measure.browDrop)) {
          /* riding the eyes: the critter's own brow height over its eyes (from idle), the same in every pose */
          baseY = eyeY - (1 - hat.sink) * (measure.seatDrop ?? measure.browDrop);
          /* never over the skull's own top: a hat always takes some head in (a critter seated by its brow share sits where it says) */
          if (measure.seatDrop == null || measure.seatDrop === measure.browDrop) baseY = Math.max(baseY, eyeY - measure.browDrop + skullW * 0.05);
        } else {
          /* from the skull's own top where the art measured it (an ear's tip or a slumped head throws the anchor off) */
          const top = Number.isFinite(measure.skullTop) ? Math.min(measure.skullTop, eyeY - skullW * 0.12) : 0;
          baseY = top + Math.max(skullW * 0.12, eyeY - top) * hat.sink;
        }
      } else {
        /* the base under the head's top, but never down over the eyes */
        baseY = (hat.depth ?? 0.1) * headW;
        if (anchor.eyes) {
          const ex = anchor.eyes[0] - anchor.head[0], ey = anchor.eyes[1] - anchor.head[1];
          const eyeY = -ex * Math.sin(tilt) + ey * Math.cos(tilt);
          baseY = Math.min(baseY, eyeY - (hat.gap ?? 0.08) * headW);
        }
      }
      /* a brim never comes down over the glasses: its edge stops at their top */
      if (glassesTop != null && anchor.eyes) {
        const ex = anchor.eyes[0] - anchor.head[0], ey = anchor.eyes[1] - anchor.head[1];
        const eyeY = -ex * Math.sin(tilt) + ey * Math.cos(tilt);
        baseY = Math.min(baseY, eyeY - glassesTop * 0.85);
      }
      hg.translate(anchor.head[0] * k, anchor.head[1] * k);
      hg.rotate(tilt);
      const hx0 = -hat.anchor[0] * sc * k, hy0 = (baseY - hat.anchor[1] * sc) * k;
      hg.drawImage(hat.img, hx0, hy0, hat.w * sc * k, hat.h * sc * k);
      /* ears come through a soft brimmed hat (hat.ears) over its crown line (hat.crown, hat px); the brim always wins */
      if (hat.ears && Number.isFinite(hat.crown)) {
        hatCrown = canvas(w, h);
        const cg = hatCrown.getContext("2d");
        cg.translate(anchor.head[0] * k, anchor.head[1] * k);
        cg.rotate(tilt);
        cg.beginPath();
        cg.rect(hx0 - w, hy0 - h, hat.w * sc * k + 2 * w, h + hat.crown * sc * k);
        cg.clip();
        cg.drawImage(hat.img, hx0, hy0, hat.w * sc * k, hat.h * sc * k);
      }
    }
    /* the cast shadow: each layer's shape a little down the head, on the critter only, in ink */
    const shadow = canvas(w, h);
    const sg = shadow.getContext("2d");
    const drop = (layer, by) => { if (layer) sg.drawImage(layer, -Math.sin(tilt) * by * k, Math.cos(tilt) * by * k); };
    drop(glassesLayer, wearW * 0.03);
    drop(hatLayer, wearW * (hat?.shadow ?? 0.075));
    sg.globalCompositeOperation = "source-in";
    sg.fillStyle = SHADOW_INK;
    sg.fillRect(0, 0, w, h);
    sg.globalCompositeOperation = "destination-in";
    sg.drawImage(src, 0, 0, w, h);
    if (glassesLayer) { sg.globalCompositeOperation = "destination-out"; sg.drawImage(glassesLayer, 0, 0); }
    g.save();
    g.globalAlpha = SHADOW_ALPHA;
    g.drawImage(shadow, 0, 0);
    g.restore();
    if (glassesLayer) g.drawImage(glassesLayer, 0, 0);
    if (hatLayer) g.drawImage(hatLayer, 0, 0);
    /* asked for: how high the hat reaches (px), so a still can frame it whole */
    if (wornTop && hatLayer) out.wornTop = topRow(hatLayer);
    /* in front: the sprite's own ears, horns, crest, paddle and cup, drawn back over what was worn;
       a part the hat swallows whole (a capybara's little ears under a cowboy hat) stays under it */
    if (front && (glassesLayer || hatCrown)) {
      const worn = canvas(w, h), wg = worn.getContext("2d");
      if (glassesLayer) wg.drawImage(glassesLayer, 0, 0);
      if (hatLayer) wg.drawImage(hatLayer, 0, 0);
      /* where a front part may show: over the glasses (the cup), over the crown of a hat ears come through */
      const over = canvas(w, h), og = over.getContext("2d");
      if (glassesLayer) og.drawImage(glassesLayer, 0, 0);
      if (hatCrown) og.drawImage(hatCrown, 0, 0);
      const f = canvas(w, h);
      const fg = f.getContext("2d");
      fg.drawImage(front, 0, 0, w, h);
      const sm = seam && hatCrown ? canvas(w, h) : null;
      if (sm) sm.getContext("2d").drawImage(seam, 0, 0, w, h);
      keepStandingOut(f, worn, sm, w, h);
      fg.globalCompositeOperation = "destination-in";
      fg.drawImage(over, 0, 0);
      g.drawImage(f, 0, 0);
      /* where an ear comes out of the crown, its base inked */
      if (sm) {
        const smg = sm.getContext("2d");
        smg.globalCompositeOperation = "source-in";
        smg.fillStyle = INK;
        smg.fillRect(0, 0, w, h);
        smg.globalCompositeOperation = "destination-in";
        smg.drawImage(hatCrown, 0, 0);
        g.drawImage(sm, 0, 0);
      }
    }
  }
  if (crown?.img && crown.at) {
    const cw = boxW * (crown.share || CROWN_SHARE) * k;
    const ch = cw * ((crown.img.height || 1) / (crown.img.width || 1));
    const [ax, ay] = crown.anchor || [0.5, 0.92];
    g.drawImage(crown.img, crown.at[0] * k - cw * ax, crown.at[1] * k - ch * ay, cw, ch);
  }
  return out;
}

/* The front parts that stand out of what was worn: only the pieces of `front` that reach outside
   the worn layer (an ear through the crown, a paddle across it) are kept, in front and in the seam;
   a piece wholly inside (an ear the hat covers) is cleared. 4-connected, through front's alpha. */
function keepStandingOut(front, worn, seam, w, h) {
  const fg = front.getContext("2d"), wg = worn.getContext("2d");
  const fd = fg.getImageData(0, 0, w, h), wd = wg.getImageData(0, 0, w, h).data;
  const a = fd.data, n = w * h;
  const reach = new Uint8Array(n), stack = [];
  for (let i = 0; i < n; i++) if (a[i * 4 + 3] > 24 && wd[i * 4 + 3] < 40) { reach[i] = 1; stack.push(i); }
  while (stack.length) {
    const i = stack.pop(), x = i % w;
    const next = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w];
    for (const j of next) if (j >= 0 && j < n && !reach[j] && a[j * 4 + 3] > 24) { reach[j] = 1; stack.push(j); }
  }
  for (let i = 0; i < n; i++) if (!reach[i]) a[i * 4 + 3] = 0;
  fg.putImageData(fd, 0, 0);
  if (seam) {
    const sg = seam.getContext("2d"), sd = sg.getImageData(0, 0, w, h);
    for (let i = 0; i < n; i++) if (!reach[i]) sd.data[i * 4 + 3] = 0;
    sg.putImageData(sd, 0, 0);
  }
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

/* What is worn on a critter, sized once (its idle pose; a portrait its own measure): the head's width
   and eye span, and how far over the eyes its skull's top is (browDrop, along the head's down), which
   hats ride in every pose. Merged into each pose's measure. */
export function wearOf(c, entry = null) {
  const at = entry ? entry.anchor : { ...c?.anchor, ...(c?.poses?.idle?.anchor || {}) };
  const me = entry ? measureOf(entry) : measureOf(c?.poses?.idle, measureOf(c));
  const out = { wearW:me.headW, wearSpan:me.eyeSpan, hatScale:c?.hatScale ?? 1 };
  if (at?.head && at?.eyes) {
    const t = Math.max(-25, Math.min(25, Number(me.tilt) || 0)) * Math.PI / 180;
    const ex = at.eyes[0] - at.head[0], ey = at.eyes[1] - at.head[1];
    const eyeY = -ex * Math.sin(t) + ey * Math.cos(t);
    const skullW = Math.max(me.headW || DEFAULT_MEASURE.headW, 512 * MIN_HEAD_SHARE * (entry?.w ? entry.w / 512 : 1)) * out.hatScale;
    const top = Number.isFinite(me.skullTop) ? Math.min(me.skullTop, eyeY - skullW * 0.12) : 0;
    /* browShare: a critter whose eyes are its top (the frog) says its brow height as a share of its skull */
    out.browDrop = Math.max(skullW * 0.12, eyeY - top);
    out.seatDrop = Number(c?.browShare) > 0 ? c.browShare * skullW : out.browDrop;
  }
  return out;
}

/* a pose that draws the head slumped and sunk (out) wears its hat this much smaller */
const POSE_WEAR = Object.freeze({ out:0.9 });

/* the set a look's poses come from: the tee's with the photo tee (when the critter has one), else the plain one */
const artSet = (c, look) => (look.shirt && c?.tee?.poses ? c.tee : c);
/* a pose's front parts and seam, loaded only when something is worn (null when the art has none) */
const wornParts = (art, layers) => {
  const worn = !!(layers?.hat || layers?.shades);
  return [worn && art?.front ? loadImage(grooveUrl(art.front)).catch(() => null) : null,
    worn && layers?.hat && art?.seam ? loadImage(grooveUrl(art.seam)).catch(() => null) : null];
};

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
      const wear = wearOf(c);
      const done = new Map();
      for (const pose of m.poses || POSES) {
        const art = set.poses?.[pose] || set.poses?.idle;
        const at = { ...c.anchor, ...(set.anchor || {}), ...(art?.anchor || {}) };
        const measure = { ...measureOf(art, measureOf(set, measureOf(c))), ...wear, wearScale:POSE_WEAR[pose] ?? 1 };
        const fileKey = `${art?.src}|${art?.tube}|${art?.shirt || ""}|${JSON.stringify(at)}|${JSON.stringify(measure)}`;
        if (done.has(fileKey)) { urls[pose] = done.get(fileKey); continue; }
        const [src, tube, shirt, front, seam] = await Promise.all([
          loadImage(grooveUrl(art.src)),
          loadImage(grooveUrl(art.tube)).catch(() => null),
          art.shirt ? loadImage(grooveUrl(art.shirt)).catch(() => null) : null,
          ...wornParts(art, layers),
        ]);
        const out = paintSprite({ src, tube, shirt, front, seam, color:look.color, w:Math.round(px * box[0] / BOX), h:Math.round(px * box[1] / BOX), boxW:box[0], anchor:at, measure, chestR:art.chestR || 0, deckR:art.deckR || 0, deckTilt:art.deckTilt || 0, layers });
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
/* Headroom: a portrait or a tee pose is painted with this share of its width free over it, so a tall
   hat (a party hat, viking horns, a propeller) is never cut at the top; the frame then takes it in. */
const HEADROOM = 0.45;
/* an image drawn at w x h with `pad` px clear above it */
function padded(img, w, h, pad) {
  if (!img) return null;
  const c = canvas(w, h + pad);
  c.getContext("2d").drawImage(img, 0, pad, w, h);
  return c;
}
/* the first row (from the top) with anything opaque in it, else the height */
function topRow(c) {
  const { width:w, height:h } = c;
  const d = c.getContext("2d").getImageData(0, 0, w, h).data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 16) return y;
  return h;
}
/* a square about the head (frame "head"), in art px: the face and glasses inside, the whole hat over it */
function headSquare(anchor, measure, W, hatTop = null) {
  const hw = Math.max(measure.headW || DEFAULT_MEASURE.headW, W * MIN_HEAD_SHARE);
  /* between the skull's middle and the face's: a three quarter face keeps its snout in the chip */
  const cx = anchor?.head ? (anchor.head[0] + (anchor.eyes?.[0] ?? anchor.head[0])) / 2 : W / 2, headY = anchor?.head?.[1] ?? W * 0.3;
  const eyesY = anchor?.eyes?.[1] ?? headY + hw * 0.4;
  const top = Math.min(headY - hw * 0.45, hatTop == null ? Infinity : hatTop - hw * 0.06);
  const bottom = eyesY + hw * 0.55;
  const side = Math.max(hw * 1.8, bottom - top);
  return [cx - side / 2, top - (side - (bottom - top)) * 0.35, side];
}
/* Paint a still with headroom and cut the square `frame` asks for into px x px: "head" about the head
   with its hat whole; else `region` ([x, y, side] in art px, the whole art by default), grown upward
   (and evenly sideways) by however far a hat rises over it. W: the art's width; ws: the paint's width. */
function framedStill({ src, tube, shirt, front, seam, W, ws, anchor, measure, region, frame, px, ...rest }) {
  const k = ws / W, padArt = Math.round(W * HEADROOM), pad = Math.round(padArt * k);
  const at = Object.fromEntries(Object.entries(anchor || {}).map(([name, p]) => [name, Array.isArray(p) ? [p[0], p[1] + padArt] : p]));
  const full = paintSprite({ ...rest, src:padded(src, ws, ws, pad), tube:padded(tube, ws, ws, pad), shirt:padded(shirt, ws, ws, pad),
    front:padded(front, ws, ws, pad), seam:padded(seam, ws, ws, pad), w:ws, h:ws + pad, boxW:W, anchor:at, measure, wornTop:frame === "head" });
  let x, y, side;
  if (frame === "head") {
    [x, y, side] = headSquare(at, measure, W, full.wornTop == null ? null : full.wornTop / k);
  } else {
    const [fx, fy, fw] = region || [0, 0, W];
    const spill = Math.max(0, fy + padArt - topRow(full) / k - W * 0.01);
    side = fw + spill; x = fx - spill / 2; y = fy + padArt - spill;
  }
  const out = canvas(px, px);
  const og = out.getContext("2d");
  const sc = px / (side * k);
  og.setTransform(sc, 0, 0, sc, -x * k * sc, -y * k * sc);
  og.drawImage(full, 0, 0);
  return canvasDataUrl(out);
}
export async function riderPortrait(entrant = {}, { size = 256, frame = "full" } = {}) {
  if (!hasCanvas() || typeof fetch !== "function") return null;
  const m = await loadGrooveArt().catch(() => null);
  if (!m) return null;
  const look = lookOf(entrant);
  const id = resolvedId(look.critter, m);
  const c = critterArt(id, m);
  if (!c?.portrait) return null;
  const px = Math.max(16, Math.min(1024, Math.round(Number(size) || 256)));
  const head = frame === "head";
  const key = `${spriteKey({ ...look, size:BOX })}|${px}${head ? "|head" : ""}`;
  if (portraits.has(key)) return portraits.get(key);
  const job = (async () => {
    const layers = await layersOf(m, look);
    const tee = look.shirt && c.tee?.poses?.idle ? c.tee : null;
    if (tee) {
      const art = tee.poses.idle;
      const box = m.box || [BOX, BOX];
      const [src, tube, shirt, front, seam] = await Promise.all([loadImage(grooveUrl(art.src)), loadImage(grooveUrl(art.tube)).catch(() => null), art.shirt ? loadImage(grooveUrl(art.shirt)).catch(() => null) : null, ...wornParts(art, layers)]);
      return framedStill({ src, tube, shirt, front, seam, color:look.color, W:box[0], ws:box[0], anchor:{ ...c.anchor, ...(tee.anchor || {}), ...art.anchor },
        measure:{ ...measureOf(art, measureOf(c)), ...wearOf(c) }, chestR:art.chestR || 0, deckR:art.deckR || 0, deckTilt:art.deckTilt || 0, layers,
        region:tee.frame || [0, 0, box[0]], frame, px });
    }
    const [src, tube, front, seam] = await Promise.all([loadImage(grooveUrl(c.portrait.src)), loadImage(grooveUrl(c.portrait.tube)).catch(() => null), ...wornParts(c.portrait, layers)]);
    const pm = { ...measureOf(c.portrait, { headW:DEFAULT_MEASURE.headW * 2, eyeSpan:DEFAULT_MEASURE.eyeSpan * 2 }), ...wearOf(c, c.portrait) };
    const PW = c.portrait.w || 1024;
    /* painted no bigger than twice the still needs (a chip never paints the whole 1024) */
    const ws = Math.min(PW, Math.max(128, px * 2));
    return framedStill({ src, tube, front, seam, color:look.color, W:PW, ws, anchor:c.portrait.anchor, measure:pm, layers, frame, px });
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
