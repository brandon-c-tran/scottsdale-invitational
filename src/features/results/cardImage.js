/* "Save card": the last card drawn onto a 1080x1350 canvas (4:5, what a
   camera roll and a group chat both keep whole) and handed to the iOS share
   sheet. The drawing reads the same model and chart geometry the screen
   card uses. Browser only; every path resolves, none throws. */

import { chartModel } from "./lastCard.js";

export const IMAGE_W = 1080, IMAGE_H = 1350;
/* the card is laid out in 360x450 units and scaled 3x */
const U = 3, W = IMAGE_W / U, H = IMAGE_H / U, PAD = 22;
const DISPLAY = "'Big Shoulders Display', 'Arial Narrow', sans-serif";
const BODY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";

export const cardFileName = model => `field-day-${String(model?.name || "card").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "card"}.png`;

async function fontsReady() {
  if (typeof document === "undefined" || !document.fonts?.load) return;
  const wanted = [`700 60px ${DISPLAY}`, `600 12px ${BODY}`, `700 12px ${BODY}`];
  await Promise.race([
    Promise.all(wanted.map(font => document.fonts.load(font).catch(() => null))),
    new Promise(resolve => setTimeout(resolve, 2500)),
  ]);
}

function fitText(ctx, text, max, font, size) {
  let s = size;
  ctx.font = font(s);
  while (s > 8 && ctx.measureText(text).width > max) { s -= 1; ctx.font = font(s); }
  return s;
}

/* the card's chip: one ink, edge ticks, the jersey number in the middle */
export function drawCardChip(ctx, cx, cy, r, { ink, num }) {
  ctx.save();
  ctx.strokeStyle = ink; ctx.fillStyle = ink;
  ctx.lineWidth = r * 0.075;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = r * 0.16; ctx.lineCap = "butt";
  for (let i = 0; i < 8; i++) {
    const a = (i * 45 + 22.5) * Math.PI / 180;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r * 0.72, cy + Math.sin(a) * r * 0.72);
    ctx.lineTo(cx + Math.cos(a) * r * 0.97, cy + Math.sin(a) * r * 0.97);
    ctx.stroke();
  }
  ctx.lineWidth = r * 0.05;
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.56, 0, Math.PI * 2); ctx.stroke();
  if (num != null) {
    ctx.font = `700 ${Math.round(r * 0.7)}px ${DISPLAY}`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(String(num), cx, cy + r * 0.04);
  }
  ctx.restore();
}

export function drawLastCard(ctx, model, { color, ink }) {
  ctx.save();
  ctx.scale(U, U);
  ctx.fillStyle = color; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = ink; ctx.strokeStyle = ink;
  ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";

  const small = (text, x, y, align = "left") => {
    ctx.font = `700 8.5px ${BODY}`; ctx.textAlign = align;
    if ("letterSpacing" in ctx) ctx.letterSpacing = "1px";
    ctx.fillText(text, x, y);
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
    ctx.textAlign = "left";
  };
  small(model.edition, PAD, 32);
  if (model.num != null) small(`PLAYER ${String(model.num).padStart(2, "0")}`, W - PAD, 32, "right");
  drawCardChip(ctx, W - PAD - 30, 76, 28, { ink, num:model.num });

  /* place, final stack, name */
  const placeSize = fitText(ctx, model.place, 150, s => `700 ${s}px ${DISPLAY}`, 96);
  ctx.fillText(model.place, PAD - 2, 44 + placeSize * 0.8);
  const placeW = ctx.measureText(model.place).width;
  ctx.font = `700 30px ${DISPLAY}`;
  ctx.fillText(model.pts.toLocaleString("en-US"), PAD + placeW + 12, 44 + placeSize * 0.8 - 22);
  small("FINAL STACK", PAD + placeW + 12, 44 + placeSize * 0.8 - 4);
  const nameTop = 44 + placeSize * 0.8 + 10;
  const nameSize = fitText(ctx, model.name.toUpperCase(), W - PAD * 2, s => `700 ${s}px ${DISPLAY}`, 44);
  ctx.fillText(model.name.toUpperCase(), PAD - 1, nameTop + nameSize * 0.82);

  /* the weekend, one step line */
  const chartTop = nameTop + nameSize * 0.82 + 12, chartH = 118;
  const chart = chartModel(model.history, { width:W - PAD * 2 + 8, height:chartH, minTickGap:48 });
  ctx.save();
  ctx.translate(PAD - 4, chartTop);
  ctx.globalAlpha = 0.4; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
  ctx.beginPath(); ctx.moveTo(4, chart.baseY); ctx.lineTo(chart.width - 10, chart.baseY); ctx.stroke();
  ctx.setLineDash([]); ctx.globalAlpha = 1;
  ctx.lineWidth = 2; ctx.lineJoin = "round";
  ctx.beginPath();
  chart.points.forEach((point, i) => {
    if (!i) ctx.moveTo(point.x, point.y);
    else { ctx.lineTo(point.x, chart.points[i - 1].y); ctx.lineTo(point.x, point.y); }
  });
  ctx.stroke();
  const ALIGN = { start:"left", middle:"center", end:"right" };
  const dot = point => {
    ctx.beginPath(); ctx.arc(point.x, point.y, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = color; ctx.stroke(); ctx.strokeStyle = ink;
    ctx.font = `700 13px ${DISPLAY}`;
    ctx.textAlign = ALIGN[point.label.anchor] || "center";
    ctx.fillText(point.pts.toLocaleString("en-US"), point.label.x, point.label.y);
    ctx.textAlign = "left";
  };
  if (chart.peak) dot(chart.peak);
  dot(chart.last);
  ctx.globalAlpha = 0.8;
  chart.ticks.forEach(tick => {
    ctx.fillRect(tick.x, chart.axisY + 3, 0.8, 4);
    ctx.font = `700 7.5px ${BODY}`;
    ctx.textAlign = ALIGN[tick.anchor] || "left";
    ctx.fillText(tick.label, tick.x, chart.height - 4);
    ctx.textAlign = "left";
  });
  ctx.globalAlpha = 1;
  ctx.restore();

  /* facts */
  let y = chartTop + chartH + 10;
  ctx.fillRect(PAD, y, W - PAD * 2, 1.5);
  const rowH = 25;
  model.facts.forEach(fact => {
    ctx.font = `700 15px ${DISPLAY}`;
    const valueW = ctx.measureText(fact.value).width;
    ctx.textAlign = "right"; ctx.fillText(fact.value, W - PAD, y + 17); ctx.textAlign = "left";
    fitText(ctx, fact.label, W - PAD * 2 - valueW - 12, s => `600 ${s}px ${BODY}`, 11);
    ctx.fillText(fact.label, PAD, y + 16.5);
    y += rowH;
    ctx.globalAlpha = 0.25; ctx.fillRect(PAD, y, W - PAD * 2, 1); ctx.globalAlpha = 1;
  });
  small(model.dates, PAD, H - 20);
  small(model.footer, W - PAD, H - 20, "right");
  ctx.restore();
}

/* Resolves a PNG Blob, or null when this browser cannot draw one. */
export async function renderLastCardImage(model, colors) {
  if (typeof document === "undefined" || !model) return null;
  try {
    await fontsReady();
    const canvas = document.createElement("canvas");
    canvas.width = IMAGE_W; canvas.height = IMAGE_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    drawLastCard(ctx, model, colors);
    return await new Promise(resolve => canvas.toBlob(blob => resolve(blob || null), "image/png"));
  } catch { return null; }
}

/* The iOS share sheet (Save Image, Messages) when it takes files; otherwise
   "preview", and the caller shows the image to press and hold. */
export async function shareCardImage(blob, name, nav = typeof navigator === "undefined" ? null : navigator) {
  if (!blob) return "preview";
  let file = null;
  try { file = new File([blob], name, { type:"image/png" }); } catch { return "preview"; }
  try {
    if (nav?.share && nav.canShare?.({ files:[file] })) {
      await nav.share({ files:[file] });
      return "shared";
    }
  } catch (error) {
    if (error?.name === "AbortError") return "cancelled";
  }
  return "preview";
}

/* D7 "Save all cards": every card in one share sheet when the browser takes
   several files ("shared"); else "each" when it takes one at a time (the
   caller steps through them, one share per tap), else "preview" (press and
   hold each image). A cancelled sheet is "cancelled". */
export async function shareCardImages(blobs, names, nav = typeof navigator === "undefined" ? null : navigator) {
  const files = [];
  try {
    (blobs || []).forEach((blob, index) => { if (blob) files.push(new File([blob], names[index], { type:"image/png" })); });
  } catch { return "preview"; }
  if (!files.length) return "preview";
  try {
    if (nav?.share && nav.canShare?.({ files })) {
      await nav.share({ files });
      return "shared";
    }
  } catch (error) {
    if (error?.name === "AbortError") return "cancelled";
  }
  try { if (nav?.share && nav.canShare?.({ files:[files[0]] })) return "each"; } catch {}
  return "preview";
}
