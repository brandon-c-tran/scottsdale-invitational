/* A player's chip as textures (shared by ChipTowers and the chip layer):
   the face is their actual ChipFace (edge skin and all) rasterized from
   the DOM with their saved photo set in its middle, drawn last as the 2D
   chip does; the rim carries the edge skin as inserts on a clay chip.
   Canvas only: no three here, so the textures are made the same way
   whichever scene wraps them. */
import React, { useEffect, useRef } from "react";
import { ChipFace } from "../identity/PlayerIdentity.jsx";
import { usePlayerIdentity } from "../identity/PlayerIdentityContext.js";

/* tokens, read from :root so a scene never carries a raw color */
export const token = (name, fallback) => {
  try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback; }
  catch { return fallback; }
};
const resolveVars = markup => markup.replace(/var\((--[\w-]+)\)/g, (_, name) => token(name, "currentColor"));

/* Without a photo the middle stays plain: a jersey number never stands in
   for a person. */
export async function paintFace(svg, identity, size = 512) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d");
  g.fillStyle = identity.color;
  g.fillRect(0, 0, size, size);
  try {
    const markup = resolveVars(new XMLSerializer().serializeToString(svg)).replace(/filter:[^;"]*;?/g, "");
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
    await img.decode();
    /* the chip circle (r 14.7 + half its stroke) fills the cap */
    const k = 16 / 15.42, side = size * k, off = (size - side) / 2;
    g.drawImage(img, off, off, side, side);
  } catch { /* the flat color face still reads */ }
  if (identity.photo) {
    try {
      const photo = new Image();
      photo.src = identity.photo;
      await photo.decode();
      /* the portrait medallion: r 9.3 of the chip's 32, cover-cropped */
      const k = size / 32 * (16 / 15.42), r = 9.3 * k;
      const w = photo.naturalWidth || photo.width || 1, h = photo.naturalHeight || photo.height || 1;
      const crop = Math.min(w, h);
      g.save();
      g.beginPath(); g.arc(size / 2, size / 2, r, 0, Math.PI * 2); g.clip();
      g.drawImage(photo, (w - crop) / 2, (h - crop) / 2, crop, crop, size / 2 - r, size / 2 - r, 2 * r, 2 * r);
      g.restore();
      g.lineWidth = 0.9 * k;
      g.strokeStyle = identity.isLight ? token("--ink0", "#0a0910") : token("--chip-mark", "#f4ecd8");
      g.beginPath(); g.arc(size / 2, size / 2, r, 0, Math.PI * 2); g.stroke();
    } catch { /* the plain middle still reads as their chip */ }
  }
  return canvas;
}

/* the edge skin on the actual rim, as inserts on a clay chip */
export function paintSide(identity) {
  const w = 1024, h = 32;
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const g = canvas.getContext("2d");
  g.fillStyle = identity.color;
  g.fillRect(0, 0, w, h);
  const ink = identity.isLight ? token("--ink0", "#0a0910") : token("--bone", "#f4ecd8");
  g.fillStyle = ink; g.strokeStyle = ink; g.lineWidth = 4; g.lineJoin = "round";
  const each = (n, draw) => { for (let i = 0; i < n; i++) draw((i + 0.5) * w / n); };
  const skin = identity.skin;
  if (skin === "plain") return canvas;
  if (skin === "dots") each(12, x => { g.beginPath(); g.arc(x, h / 2, 6, 0, Math.PI * 2); g.fill(); });
  else if (skin === "quad") each(4, x => g.fillRect(x - 46, 6, 92, h - 12));
  else if (skin === "ring") { g.fillRect(0, h / 2 - 3, w, 6); }
  else if (skin === "dash") each(6, x => g.fillRect(x - 56, 9, 112, h - 18));
  else if (skin === "saw") {
    g.beginPath();
    for (let i = 0; i <= 44; i++) g.lineTo(i * w / 44, i % 2 ? 6 : h - 6);
    g.stroke();
  } else if (skin === "wave") {
    g.beginPath();
    for (let x = 0; x <= w; x += 4) g.lineTo(x, h / 2 + Math.sin(x / w * Math.PI * 28) * 8);
    g.stroke();
  } else if (skin === "flame" || skin === "star" || skin === "bolt" || skin === "crown") {
    each(skin === "crown" ? 4 : 6, x => {
      g.beginPath();
      if (skin === "star") { g.moveTo(x, 4); g.lineTo(x + 12, h / 2); g.lineTo(x, h - 4); g.lineTo(x - 12, h / 2); }
      else if (skin === "bolt") { g.moveTo(x - 14, 6); g.lineTo(x, h - 12); g.lineTo(x + 14, 6); g.lineTo(x + 14, 14); g.lineTo(x, h - 4); g.lineTo(x - 14, 14); }
      else if (skin === "crown") { g.moveTo(x - 22, h - 6); g.lineTo(x - 18, 6); g.lineTo(x - 8, 16); g.lineTo(x, 4); g.lineTo(x + 8, 16); g.lineTo(x + 18, 6); g.lineTo(x + 22, h - 6); }
      else { g.moveTo(x, 4); g.quadraticCurveTo(x + 12, h * 0.6, x, h - 4); g.quadraticCurveTo(x - 12, h * 0.6, x, 4); }
      g.closePath(); g.fill();
    });
  } else each(8, x => g.fillRect(x - 16, 6, 32, h - 12)); /* ticks, the default */
  return canvas;
}

/* one hidden ChipFace per player, the source of that player's textures;
   `onPaint` is a ref to (player, { face, side, identity, sig }) */
export function FaceSource({ p, onPaint, size = 512 }) {
  const identity = usePlayerIdentity(p);
  const ref = useRef(null);
  const sig = `${identity.color}|${identity.skin}|${identity.photo}|${identity.isLight}`;
  useEffect(() => {
    let live = true;
    const svg = ref.current?.querySelector("svg");
    Promise.resolve(svg ? paintFace(svg, identity, size) : null).then(face => {
      if (live) onPaint.current(p, { face, side:paintSide(identity), identity, sig });
    });
    return () => { live = false; };
  }, [p, sig, size]); // eslint-disable-line react-hooks/exhaustive-deps
  return <span ref={ref}><ChipFace p={p} size={128} stamp="" /></span>;
}
