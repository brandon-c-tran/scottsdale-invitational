/* D3 "Save poster": the class photo drawn onto a 1920x1080 canvas, the same
   composition the TV lays out (classPhoto.js), on the finale's desert
   (desertModel.js), with each player's chip drawn the way ChipFace draws it
   and their photo read from the same-origin endpoint so the canvas stays
   exportable. Browser only; every path resolves, none throws. */

import { CHIP_SKIN_PATHS } from "../identity/PlayerIdentity.jsx";
import { resolvePlayerIdentity } from "../identity/playerIdentity.js";
import { FIXED_STARS, desertScene, constellationStars, skyBoxClearOfDisc, skyStarLayout, starPoints } from "../tv/desertModel.js";
import { CLASS_H, CLASS_W, classPhotoLayout, classPhotoModel } from "./classPhoto.js";

const DISPLAY = "'Barlow Condensed', 'Arial Narrow', sans-serif";
const PHOTO_TIMEOUT_MS = 4000;

async function fontsReady() {
  if (typeof document === "undefined" || !document.fonts?.load) return;
  const wanted = [`700 88px ${DISPLAY}`, `800 36px ${DISPLAY}`];
  await Promise.race([
    Promise.all(wanted.map(font => document.fonts.load(font).catch(() => null))),
    new Promise(resolve => setTimeout(resolve, 2500)),
  ]);
}

/* the finale's desert and the chip inks, read from the live tokens (the
   TV's desert tokens live on .tv-stage) */
const TOKENS = {
  sky:"var(--desert-fin-sky, var(--bg))", far:"var(--desert-fin-far, var(--paper))",
  mid:"var(--desert-fin-mid, var(--paper2))", ground:"var(--desert-fin-ground, var(--paper))",
  near:"var(--desert-fin-near, var(--bg))", cactus:"var(--desert-fin-cactus, var(--ink0))",
  disc:"var(--desert-fin-disc, var(--sun))", star:"var(--desert-star, var(--bone))",
  bone:"var(--bone)", sun:"var(--sun)", muted:"var(--muted2)", ink0:"var(--ink0)", paper2:"var(--paper2)",
  chipMark:"var(--chip-mark)",
};
export function resolvePosterColors(doc = typeof document === "undefined" ? null : document) {
  if (!doc?.body) return null;
  const host = doc.createElement("div");
  host.className = "tv-stage";
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = "position:fixed;left:-10px;top:-10px;width:1px;height:1px;visibility:hidden;pointer-events:none;";
  const probe = doc.createElement("span");
  host.appendChild(probe);
  doc.body.appendChild(host);
  const out = {};
  try {
    for (const [name, value] of Object.entries(TOKENS)) {
      probe.style.color = "";
      probe.style.color = value;
      out[name] = getComputedStyle(probe).color;
    }
  } finally { host.remove(); }
  return out;
}

const loadImage = src => new Promise(resolve => {
  if (!src || typeof Image === "undefined") { resolve(null); return; }
  const img = new Image();
  const timer = setTimeout(() => resolve(null), PHOTO_TIMEOUT_MS);
  img.onload = () => { clearTimeout(timer); resolve(img); };
  img.onerror = () => { clearTimeout(timer); resolve(null); };
  img.src = src;
});

/* ChipFace on a canvas: the same 32-unit geometry, edge skin, photo
   medallion (or the number), and its two small highlight arcs */
export function drawChip(ctx, cx, cy, size, { color, light, skin, photo = null, num = null }, colors) {
  const k = size / 32;
  const skinInk = light ? colors.ink0 : colors.chipMark;
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(k, k);
  const circle = (r, x = 16, y = 16) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); };
  circle(14.7); ctx.fillStyle = color; ctx.fill(); ctx.lineWidth = 1.45; ctx.strokeStyle = colors.ink0; ctx.stroke();
  ctx.globalAlpha = 0.72; circle(13.25); ctx.lineWidth = 0.65;
  ctx.strokeStyle = light ? "rgba(42,33,25,0.38)" : "rgba(251,243,228,0.36)"; ctx.stroke(); ctx.globalAlpha = 1;
  ctx.save(); circle(14.7); ctx.clip();
  drawSkin(ctx, skin, skinInk);
  ctx.restore();
  if (photo) {
    circle(9.3); ctx.fillStyle = colors.paper2; ctx.fill();
    ctx.save(); circle(9.3); ctx.clip();
    const w = photo.naturalWidth || photo.width, h = photo.naturalHeight || photo.height;
    const s = Math.max(18.6 / w, 18.6 / h);
    ctx.drawImage(photo, 16 - (w * s) / 2, 16 - (h * s) / 2, w * s, h * s);
    ctx.restore();
    circle(9.3); ctx.lineWidth = 0.9; ctx.strokeStyle = skinInk; ctx.stroke();
  } else {
    circle(8.75); ctx.fillStyle = light ? "rgba(42,33,25,0.08)" : "rgba(251,243,228,0.10)"; ctx.fill();
    ctx.lineWidth = 0.8; ctx.strokeStyle = light ? "rgba(42,33,25,0.38)" : "rgba(251,243,228,0.36)"; ctx.stroke();
    if (num != null && num !== "") {
      ctx.fillStyle = light ? colors.ink0 : colors.bone;
      ctx.font = `700 11.7px ${DISPLAY}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(String(num), 16, 16.8);
    }
  }
  ctx.lineCap = "round";
  ctx.globalAlpha = 0.65; ctx.lineWidth = 0.75; ctx.strokeStyle = "rgba(255,255,255,.38)";
  ctx.beginPath(); ctx.arc(16, 16, 10.8, Math.PI * 1.2, Math.PI * 1.8); ctx.stroke();
  ctx.globalAlpha = 0.55; ctx.lineWidth = 0.7; ctx.strokeStyle = "rgba(23,16,9,.45)";
  ctx.beginPath(); ctx.arc(16, 16, 10.8, Math.PI * 0.2, Math.PI * 0.8); ctx.stroke();
  ctx.restore();
}

/* chipMarks (PlayerIdentity.jsx) for a canvas, at cx 16, edge 12.4 */
function drawSkin(ctx, skin, ink) {
  const cx = 16, edge = 12.4;
  const pt = (r, deg) => { const a = deg * Math.PI / 180; return [cx + Math.cos(a) * r, cx + Math.sin(a) * r]; };
  ctx.strokeStyle = ink; ctx.fillStyle = ink;
  const lines = (n, off, r1, r2, w) => {
    ctx.lineWidth = w; ctx.lineCap = "round";
    for (let i = 0; i < n; i++) {
      const [x1, y1] = pt(r1, i * (360 / n) + off), [x2, y2] = pt(r2, i * (360 / n) + off);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
  };
  const ring = (r, w) => { ctx.lineWidth = w; ctx.beginPath(); ctx.arc(cx, cx, r, 0, Math.PI * 2); ctx.stroke(); };
  const around = (n, d, r) => {
    const path = typeof Path2D === "function" ? new Path2D(d) : null;
    if (!path) return;
    for (let i = 0; i < n; i++) {
      const a = i * (360 / n), [x, y] = pt(r, a);
      ctx.save(); ctx.translate(x, y); ctx.rotate((a + 90) * Math.PI / 180); ctx.fill(path); ctx.restore();
    }
  };
  if (skin === "plain") return;
  if (skin === "dash") { ctx.setLineDash([8.4, 11.4]); ctx.lineCap = "butt"; ring(edge - 1.1, 3); ctx.setLineDash([]); return; }
  if (skin === "ring") { ring(edge - 2.5, 1.15); ctx.globalAlpha = 0.8; ring(edge - 4.4, 0.8); ctx.globalAlpha = 1; return; }
  if (skin === "quad") { lines(4, 0, edge - 3.6, edge + 0.6, 3.4); return; }
  if (skin === "dots") {
    for (let i = 0; i < 12; i++) { const [x, y] = pt(edge - 1.45, i * 30 + 15); ctx.beginPath(); ctx.arc(x, y, 1.08, 0, Math.PI * 2); ctx.fill(); }
    return;
  }
  if (skin === "saw") {
    const n = 11;
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const [x, y] = pt(i % 2 ? edge - 3.6 : edge + 0.5, i * (180 / n) - 90);
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.closePath(); ctx.lineWidth = 1.5; ctx.lineJoin = "round"; ctx.stroke();
    return;
  }
  if (skin === "flame") { around(6, CHIP_SKIN_PATHS.flame, edge - 0.6); return; }
  if (skin === "star") { around(6, CHIP_SKIN_PATHS.star, edge - 0.9); return; }
  if (skin === "bolt") { around(6, CHIP_SKIN_PATHS.bolt, edge - 0.8); return; }
  if (skin === "wave") {
    const n = 60;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const [x, y] = pt(edge - 1.9 + Math.sin(i / n * Math.PI * 14) * 1.5, i * (360 / n));
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.lineWidth = 1.5; ctx.stroke();
    return;
  }
  if (skin === "crown") {
    if (typeof Path2D !== "function") return;
    ctx.save(); ctx.translate(cx, cx - 8.3); ctx.fill(new Path2D(CHIP_SKIN_PATHS.crown)); ctx.restore();
    return;
  }
  lines(8, 22.5, edge - 3, edge + 0.6, 2.4);
}

function fitFont(ctx, text, max, size, weight = 700) {
  let s = size;
  ctx.font = `${weight} ${s}px ${DISPLAY}`;
  while (s > 18 && ctx.measureText(text).width > max) { s -= 1; ctx.font = `${weight} ${s}px ${DISPLAY}`; }
  return s;
}

/* the whole poster, from the layout and resolved inputs */
export function drawPoster(ctx, { layout, colors, identities, photos = new Map(), stars = [] }) {
  const W = CLASS_W, H = CLASS_H;
  const scene = desertScene({ width:W, height:H, variant:"full" });
  const path = d => typeof Path2D === "function" ? new Path2D(d) : null;
  const fill = (d, color) => { const p = path(d); if (p) { ctx.fillStyle = color; ctx.fill(p); } };
  ctx.fillStyle = colors.sky; ctx.fillRect(0, 0, W, H);
  /* the night sky: the fixed stars, then every event winner's own */
  const sky = skyStarLayout(skyBoxClearOfDisc(layout.starBox || { left:0, right:W, top:scene.sky.top, bottom:scene.sky.bottom },
    scene.disc.fin, scene.discR));
  FIXED_STARS.forEach((point, i) => {
    const [x, y] = sky.fixed(point);
    ctx.globalAlpha = 0.35 + (i % 3) * 0.2; ctx.fillStyle = colors.star;
    ctx.beginPath(); ctx.arc(x, y, sky.fixedR, 0, Math.PI * 2); ctx.fill();
  });
  ctx.globalAlpha = 1;
  stars.forEach(star => {
    const [x, y] = sky.at(star);
    ctx.fillStyle = identities.get(star.player)?.color || colors.star;
    ctx.beginPath();
    starPoints(sky.starR).forEach(([px, py], i) => (i ? ctx.lineTo(x + px, y + py) : ctx.moveTo(x + px, y + py)));
    ctx.closePath(); ctx.fill();
    ctx.lineWidth = 1; ctx.lineJoin = "round"; ctx.strokeStyle = colors.bone; ctx.stroke();
  });
  const disc = scene.disc.fin;
  ctx.fillStyle = colors.disc; ctx.beginPath(); ctx.arc(disc.x, disc.y, scene.discR, 0, Math.PI * 2); ctx.fill();
  fill(scene.far, colors.far);
  fill(scene.mid, colors.mid);
  fill(scene.ground, colors.ground);
  scene.cacti.forEach(c => {
    const p = path(c.d);
    if (!p) return;
    ctx.save(); ctx.translate(c.x, c.y); ctx.scale(c.scale, c.scale); ctx.fillStyle = colors.cactus; ctx.fill(p); ctx.restore();
  });
  if (scene.nearTop < H) { ctx.fillStyle = colors.near; ctx.fillRect(0, scene.nearTop, W, H - scene.nearTop); }

  /* the title */
  const { title } = layout;
  ctx.textBaseline = "top";
  ctx.font = `700 ${title.size}px ${DISPLAY}`;
  const brand = title.brand.toUpperCase(), rest = ` · ${title.edition.toUpperCase()}`;
  const bw = ctx.measureText(brand).width, rw = ctx.measureText(rest).width;
  const x0 = (W - bw - rw) / 2;
  ctx.textAlign = "left";
  ctx.fillStyle = colors.sun; ctx.fillText(brand, x0, title.top);
  ctx.fillStyle = colors.bone; ctx.fillText(rest, x0 + bw, title.top);

  /* everyone, back row first so a champion's tag sits on top */
  [...layout.slots].sort((a, b) => b.tier - a.tier).forEach(slot => {
    const identity = identities.get(slot.player) || {};
    drawChip(ctx, slot.cx, slot.cy, slot.size, { color:identity.color || colors.paper2, light:!!identity.isLight,
      skin:identity.skin, photo:photos.get(slot.player) || null, num:identity.num }, colors);
    const tag = slot.tag;
    ctx.fillStyle = slot.rank === 1 ? colors.sun : colors.bone;
    ctx.beginPath(); ctx.arc(tag.cx, tag.cy, tag.r, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = colors.ink0; ctx.stroke();
    ctx.fillStyle = colors.ink0; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = `800 ${tag.size}px ${DISPLAY}`; ctx.fillText(tag.text, tag.cx, tag.cy + 1);
    ctx.textBaseline = "top";
    fitFont(ctx, slot.name.text, slot.name.width, slot.name.size);
    ctx.fillStyle = slot.rank === 1 ? colors.sun : colors.bone;
    ctx.fillText(slot.name.text, slot.cx, slot.name.top);
    ctx.font = `700 ${slot.stack.size}px ${DISPLAY}`;
    ctx.fillStyle = slot.rank === 1 ? colors.bone : colors.sun;
    ctx.fillText(slot.stack.text, slot.cx, slot.stack.top);
  });
}

/* Resolves a PNG Blob, or null when this browser cannot draw one. */
export async function renderPosterImage(state, { events = [], standings = [] } = {}) {
  if (typeof document === "undefined" || !standings.length) return null;
  try {
    await fontsReady();
    const colors = resolvePosterColors();
    if (!colors) return null;
    const layout = classPhotoLayout(classPhotoModel(state, standings));
    const identities = new Map(layout.slots.map(slot => [slot.player, resolvePlayerIdentity(state.profiles, slot.player)]));
    const loaded = await Promise.all(layout.slots.map(async slot =>
      [slot.player, await loadImage(identities.get(slot.player)?.photo)]));
    const photos = new Map(loaded.filter(([, img]) => img));
    const canvas = document.createElement("canvas");
    canvas.width = CLASS_W; canvas.height = CLASS_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    drawPoster(ctx, { layout, colors, identities, photos, stars:constellationStars(state, events) });
    return await new Promise(resolve => canvas.toBlob(blob => resolve(blob || null), "image/png"));
  } catch { return null; }
}
