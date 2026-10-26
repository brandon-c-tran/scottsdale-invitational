/* A rider's badge: one canvas texture per rider holding their chip face (the
   medallion), the chip's edge (its skin's inserts) and the number decal for
   the floatie's sides. Drawn the way Field Day draws a chip
   (src/features/identity/PlayerIdentity.jsx ChipFace): the player's color to
   the edge, the skin as an edge treatment, the photo inset in the middle,
   else the number. Without a DOM (node tests) there is no texture and the
   chip shows its plain color.

   Atlas (512 x 256): chip face left half; number decal top right; chip edge
   strip bottom right. UVs below follow three's flipY (v up). */
import * as THREE from "three";
import { acquire, release, normalHex } from "./materials.js";

export const BADGE_UV = Object.freeze({
  face: { u0: 0, u1: 0.5, v0: 0, v1: 1 },
  decal: { u0: 0.5, u1: 1, v0: 0.5, v1: 1 },
  edge: { u0: 0.5, u1: 1, v0: 0, v1: 0.5 },
});

export const hasDom = () => typeof document !== "undefined" && typeof document.createElement === "function";

/* the two inks Field Day uses on a chip, whichever contrasts more */
const INK_DARK = "#151c1c", INK_BONE = "#f2eddf";
function luminance(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 0.2;
  return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
}
const contrast = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
export const inkOn = color => (contrast(color, INK_DARK) > contrast(color, INK_BONE) ? INK_DARK : INK_BONE);

/* which of 24 rim facets carry ink (Field Day's chipCoin.js edgeInserts) */
export function edgeInserts(skin, n = 24) {
  const every = (step, width = 1, offset = 0) => Array.from({ length: n }, (_, i) => ((i - offset + n) % n) % step < width);
  switch (skin) {
    case "plain": case "ring": return Array(n).fill(false);
    case "dash": return every(4, 2);
    case "quad": return every(6, 2, 5);
    case "dots": case "saw": return every(2);
    case "flame": case "star": case "bolt": return every(4, 1, 2);
    case "wave": return every(3, 2);
    case "crown": return Array.from({ length: n }, (_, i) => i === 0 || i === 1 || i === n - 1);
    default: return every(3);
  }
}

const SKIN_PATHS = {
  flame: "M0 -3.9C1.9 -1.5 2.3 -0.5 2.3 0.6 2.3 2.1 1.3 3 0 3S-2.3 2.1 -2.3 0.6C-2.3-0.5-1.9-1.5 0-3.9Z",
  star: "M0 -3C0.35-0.9 0.55-0.7 2.7-0.35 0.55 0 0.35 0.2 0 2.3c-0.35-2.1-0.55-2.3-2.7-2.65C-0.55-0.7-0.35-0.9 0-3Z",
  bolt: "M-2.7-2.4 0 .2 2.7-2.4 2.7.2 0 2.9-2.7.2 0-2.4Z",
  crown: "M-6.2 3.4 -5-3.6-2.1-0.9 0-5.2 2.1-0.9 5-3.6 6.2 3.4Z",
};

/* the skin's marks in the chip's own 32-unit box (centre 16, edge 12.4) */
function drawSkin(ctx, skin, ink) {
  const cx = 16, edge = 12.4;
  const pt = (r, deg) => { const a = (deg * Math.PI) / 180; return [cx + Math.cos(a) * r, cx + Math.sin(a) * r]; };
  ctx.save();
  ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineCap = "round"; ctx.lineJoin = "round";
  const lines = (n, off, r1, r2, w) => {
    ctx.lineWidth = w;
    for (let i = 0; i < n; i++) {
      const [x1, y1] = pt(r1, i * (360 / n) + off), [x2, y2] = pt(r2, i * (360 / n) + off);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
  };
  const around = (n, d, r, spin = 0) => {
    const path = typeof Path2D !== "undefined" ? new Path2D(d) : null;
    if (!path) return;
    for (let i = 0; i < n; i++) {
      const a = i * (360 / n) + spin, [x, y] = pt(r, a);
      ctx.save(); ctx.translate(x, y); ctx.rotate(((a + 90) * Math.PI) / 180); ctx.fill(path); ctx.restore();
    }
  };
  if (skin === "plain") { ctx.restore(); return; }
  if (skin === "dash") {
    ctx.lineWidth = 3; ctx.lineCap = "butt"; ctx.setLineDash([8.4, 11.4]);
    ctx.beginPath(); ctx.arc(cx, cx, edge - 1.1, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  } else if (skin === "ring") {
    ctx.lineWidth = 1.15; ctx.beginPath(); ctx.arc(cx, cx, edge - 2.5, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 0.8; ctx.globalAlpha = 0.8; ctx.beginPath(); ctx.arc(cx, cx, edge - 4.4, 0, Math.PI * 2); ctx.stroke();
  } else if (skin === "quad") lines(4, 0, edge - 3.6, edge + 0.6, 3.4);
  else if (skin === "dots") {
    for (let i = 0; i < 12; i++) { const [x, y] = pt(edge - 1.45, i * 30 + 15); ctx.beginPath(); ctx.arc(x, y, 1.08, 0, Math.PI * 2); ctx.fill(); }
  } else if (skin === "saw") {
    const n = 11; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let i = 0; i < n * 2; i++) { const [x, y] = pt(i % 2 ? edge - 3.6 : edge + 0.5, i * (180 / n) - 90); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    ctx.closePath(); ctx.stroke();
  } else if (skin === "flame") around(6, SKIN_PATHS.flame, edge - 0.6);
  else if (skin === "star") around(6, SKIN_PATHS.star, edge - 0.9);
  else if (skin === "bolt") around(6, SKIN_PATHS.bolt, edge - 0.8);
  else if (skin === "wave") {
    const n = 60; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let i = 0; i <= n; i++) { const [x, y] = pt(edge - 1.9 + Math.sin((i / n) * Math.PI * 14) * 1.5, i * (360 / n)); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    ctx.stroke();
  } else if (skin === "crown") {
    if (typeof Path2D !== "undefined") { ctx.translate(cx, cx - 8.3); ctx.fill(new Path2D(SKIN_PATHS.crown)); }
  } else lines(8, 22.5, edge - 3, edge + 0.6, 2.4);
  ctx.restore();
}

const FONT = '"Arial Black", "Avenir Next", "Helvetica Neue", system-ui, sans-serif';
export function labelOf(entrant = {}) {
  const n = entrant.number;
  if (n !== undefined && n !== null && String(n).trim() !== "") return String(n).trim().slice(0, 3);
  const name = String(entrant.name || "").trim();
  return name ? [...name][0].toUpperCase() : "";
}

/* the face of the chip into a 256-px square at (x, y) */
function drawFace(ctx, x, y, size, { color, skin, label, photo }) {
  const ink = inkOn(color);
  ctx.save();
  ctx.translate(x, y); ctx.scale(size / 32, size / 32);
  ctx.beginPath(); ctx.arc(16, 16, 15.6, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
  ctx.lineWidth = 0.9; ctx.strokeStyle = ink === INK_DARK ? "rgba(21,28,28,.35)" : "rgba(242,237,223,.35)";
  ctx.beginPath(); ctx.arc(16, 16, 14.2, 0, Math.PI * 2); ctx.stroke();
  ctx.save(); ctx.beginPath(); ctx.arc(16, 16, 15.6, 0, Math.PI * 2); ctx.clip();
  drawSkin(ctx, skin, ink); ctx.restore();
  const r = 9.6;
  if (photo) {
    ctx.save(); ctx.beginPath(); ctx.arc(16, 16, r, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = "#20242c"; ctx.fillRect(16 - r, 16 - r, r * 2, r * 2);
    const iw = photo.naturalWidth || photo.width, ih = photo.naturalHeight || photo.height;
    const k = Math.max((r * 2) / iw, (r * 2) / ih);
    ctx.drawImage(photo, 16 - (iw * k) / 2, 16 - (ih * k) / 2, iw * k, ih * k);
    ctx.restore();
    ctx.lineWidth = 0.9; ctx.strokeStyle = ink; ctx.beginPath(); ctx.arc(16, 16, r, 0, Math.PI * 2); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.arc(16, 16, r, 0, Math.PI * 2);
    ctx.fillStyle = ink === INK_DARK ? "rgba(255,255,255,.28)" : "rgba(0,0,0,.18)"; ctx.fill();
    ctx.lineWidth = 0.7; ctx.strokeStyle = ink; ctx.globalAlpha = 0.55; ctx.stroke(); ctx.globalAlpha = 1;
    if (label) {
      const fs = label.length >= 3 ? 8.2 : label.length === 2 ? 10.2 : 12.5;
      ctx.font = `900 ${fs}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = ink; ctx.fillText(label, 16, 16.9);
    }
  }
  /* the lacquer's highlight and shade, as Field Day's chip draws them */
  ctx.lineCap = "round";
  ctx.lineWidth = 0.75; ctx.strokeStyle = "rgba(255,255,255,.45)";
  ctx.beginPath(); ctx.arc(16, 16, 12.9, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
  ctx.strokeStyle = "rgba(23,16,9,.4)";
  ctx.beginPath(); ctx.arc(16, 16, 12.9, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
  ctx.restore();
}

/* the rim: the color with the skin's inserts, one strip around */
function drawEdge(ctx, x, y, w, h, { color, skin }) {
  ctx.fillStyle = color; ctx.fillRect(x, y, w, h);
  const ink = inkOn(color) === INK_DARK ? "#fbf7ee" : "#fbf7ee";
  const inserts = edgeInserts(skin);
  const n = inserts.length, fw = w / n;
  ctx.fillStyle = ink;
  inserts.forEach((on, i) => { if (on) ctx.fillRect(x + i * fw + fw * 0.12, y, fw * 0.76, h); });
  ctx.fillStyle = "rgba(0,0,0,.18)"; ctx.fillRect(x, y, w, h * 0.12); ctx.fillRect(x, y + h * 0.88, w, h * 0.12);
}

/* the race number for the floatie's side: a bone plate, the rider's color
   as its border, the number in ink */
function drawDecal(ctx, x, y, w, h, { color, label }) {
  ctx.clearRect(x, y, w, h);
  if (!label) return;
  const pad = 6, r = 26;
  const rect = (x0, y0, x1, y1, rr) => {
    ctx.beginPath();
    ctx.moveTo(x0 + rr, y0); ctx.lineTo(x1 - rr, y0); ctx.quadraticCurveTo(x1, y0, x1, y0 + rr);
    ctx.lineTo(x1, y1 - rr); ctx.quadraticCurveTo(x1, y1, x1 - rr, y1); ctx.lineTo(x0 + rr, y1);
    ctx.quadraticCurveTo(x0, y1, x0, y1 - rr); ctx.lineTo(x0, y0 + rr); ctx.quadraticCurveTo(x0, y0, x0 + rr, y0); ctx.closePath();
  };
  rect(x + pad, y + pad, x + w - pad, y + h - pad, r); ctx.fillStyle = "#151c1c"; ctx.fill();
  rect(x + pad + 6, y + pad + 6, x + w - pad - 6, y + h - pad - 6, r - 6); ctx.fillStyle = color; ctx.fill();
  rect(x + pad + 15, y + pad + 15, x + w - pad - 15, y + h - pad - 15, r - 14); ctx.fillStyle = "#fbf7ee"; ctx.fill();
  const fs = label.length >= 3 ? 64 : 84;
  ctx.font = `900 ${fs}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillStyle = "#151c1c"; ctx.fillText(label, x + w / 2, y + h / 2 + 4);
}

const photos = new Map();
/* a photo, loaded once per URL; resolves to the image or null */
export function loadPhoto(url, { timeout = 4000 } = {}) {
  if (!url || !hasDom() || typeof Image === "undefined") return Promise.resolve(null);
  if (photos.has(url)) return photos.get(url);
  const promise = new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    const timer = setTimeout(() => resolve(null), timeout);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); photos.delete(url); resolve(null); };
    img.src = url;
  });
  photos.set(url, promise);
  return promise;
}

export function badgeKey(entrant = {}) {
  return ["badge", normalHex(entrant.color), entrant.skin || "ticks", labelOf(entrant), entrant.photo || ""].join("|");
}

/* the rider's badge material, counted by key; { material, key, ready } */
export function acquireBadge(entrant = {}) {
  const key = badgeKey(entrant);
  const value = acquire(key, () => makeBadge(entrant));
  return { material: value.material, texture: value.texture, key, ready: value.ready };
}
export const releaseBadge = key => release(key);

function makeBadge(entrant) {
  const color = normalHex(entrant.color);
  const skin = entrant.skin || "ticks";
  const label = labelOf(entrant);
  const material = new THREE.MeshPhysicalMaterial({
    name: "float-badge", color: hasDom() ? 0xffffff : new THREE.Color(color), roughness: 0.32,
    clearcoat: 1, clearcoatRoughness: 0.06, alphaTest: 0.5,
  });
  if (!hasDom()) return { material, texture: null, ready: Promise.resolve(false), dispose: () => material.dispose() };
  const canvas = document.createElement("canvas");
  canvas.width = 512; canvas.height = 256;
  const ctx = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const draw = photo => {
    ctx.clearRect(0, 0, 512, 256);
    drawFace(ctx, 0, 0, 256, { color, skin, label, photo });
    drawDecal(ctx, 256, 0, 256, 128, { color, label });
    drawEdge(ctx, 256, 128, 256, 128, { color, skin });
    texture.needsUpdate = true;
  };
  draw(null);
  material.map = texture;
  material.needsUpdate = true;
  const ready = loadPhoto(entrant.photo).then(img => { if (img) draw(img); return !!img; });
  return { material, texture, ready, dispose: () => { texture.dispose(); material.dispose(); } };
}
