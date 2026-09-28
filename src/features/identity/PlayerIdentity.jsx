import React, { useId, useState } from "react";
import { DISPLAY, SANS, BONE } from "../../ui/theme.js";
import { usePlayerIdentity } from "./PlayerIdentityContext.js";

/* A missing or failed photo falls back to initials on the player's color. */
function Avatar({ state, p, size=34, ring, style }) {
  const prof = state.profiles?.[p];
  const photo = prof?.photoV ? `/api/photo/${encodeURIComponent(p)}?v=${prof.photoV}` : null;
  const [failed, setFailed] = useState(null);
  const src = photo && failed !== photo ? photo : null;
  const initials = (prof?.display || p || "").slice(0,2).toUpperCase();
  const identity = usePlayerIdentity(p);
  const c = identity.color;
  return (
    <div style={{ width:size, height:size, borderRadius:"50%", flexShrink:0, overflow:"hidden",
      display:"flex", alignItems:"center", justifyContent:"center",
      background: src ? "var(--paper2)" : c, position:"relative",
      border: ring ? "2px solid var(--bone)" : "1.5px solid var(--ink0)", ...style }}>
      {src
        ? <img src={src} alt="" onError={() => setFailed(photo)} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
        : <span style={{ position:"relative", fontFamily:DISPLAY, fontWeight:700, fontStyle:"italic",
            fontSize:size*0.44, letterSpacing:"0.03em",
            color: identity.isLight ? "var(--ink0)" : BONE }}>{initials}</span>}
    </div>
  );
}
function AvatarStack({ state, players, size=24, max=4 }) {
  const show = players.slice(0, max);
  const extra = players.length - show.length;
  return (
    <div style={{ display:"flex", alignItems:"center" }}>
      {show.map((p,pi) => <Avatar key={p} state={state} p={p} size={size} style={{ marginLeft: pi>0 ? -size*0.32 : 0 }} />)}
      {extra > 0 && <div style={{ width:size, height:size, borderRadius:"50%", marginLeft:-size*0.32,
        background:"var(--paper2)", border:"1.5px solid var(--line)", display:"flex",
        alignItems:"center", justifyContent:"center", fontFamily:SANS, fontWeight:700,
        fontSize:size*0.4, color:"var(--muted)", flexShrink:0 }}>+{extra}</div>}
    </div>
  );
}
const chipMarks = (skin, cx = 16, edge = 12.4, ink = "var(--chip-mark)") => {
  const pt = (r, deg) => {
    const a = deg * Math.PI / 180;
    return [cx + Math.cos(a) * r, cx + Math.sin(a) * r];
  };
  const lines = (n, off, r1, r2, w) => Array.from({ length: n }, (_, i) => {
    const [x1, y1] = pt(r1, i * (360 / n) + off), [x2, y2] = pt(r2, i * (360 / n) + off);
    return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={ink}
      strokeWidth={w} strokeLinecap="round" />;
  });
  if (skin === "plain") return null;
  if (skin === "dash") return <circle cx={cx} cy={cx} r={edge - 1.1} fill="none"
    stroke={ink} strokeWidth="3" strokeDasharray="8.4 11.4" strokeLinecap="butt" />;
  if (skin === "ring") return <>
    <circle cx={cx} cy={cx} r={edge - 2.5} fill="none" stroke={ink} strokeWidth="1.15" />
    <circle cx={cx} cy={cx} r={edge - 4.4} fill="none" stroke={ink} strokeWidth=".8" opacity=".8" />
  </>;
  if (skin === "quad") return lines(4, 0, edge - 3.6, edge + 0.6, 3.4);
  if (skin === "dots") return Array.from({ length: 12 }, (_, i) => {
    const [x, y] = pt(edge - 1.45, i * 30 + 15);
    return <circle key={i} cx={x} cy={y} r="1.08" fill={ink} />;
  });
  /* the loud half of the rack. Still flat, still one ink, still an edge
     treatment so the number in the middle stays readable at 18px */
  const around = (n, d, r, spin = 0) => Array.from({ length: n }, (_, i) => {
    const a = i * (360 / n) + spin, [x, y] = pt(r, a);
    return <path key={i} d={d} fill={ink}
      transform={`translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${a + 90})`} />;
  });
  if (skin === "saw") {
    const n = 11, p2 = [];
    for (let i = 0; i < n * 2; i++) {
      const [x, y] = pt(i % 2 ? edge - 3.6 : edge + 0.5, i * (180 / n) - 90);
      p2.push(`${x.toFixed(2)},${y.toFixed(2)}`);
    }
    return <polygon points={p2.join(" ")} fill="none" stroke={ink}
      strokeWidth="1.5" strokeLinejoin="round" />;
  }
  /* symmetric teardrop: the earlier version had an inner curl that read as a
     comma once it was 3px on a phone */
  if (skin === "flame") return around(6,
    "M0 -3.9C1.9 -1.5 2.3 -0.5 2.3 0.6 2.3 2.1 1.3 3 0 3S-2.3 2.1 -2.3 0.6C-2.3-0.5-1.9-1.5 0-3.9Z",
    edge - 0.6);
  if (skin === "star") return around(6,
    "M0 -3C0.35-0.9 0.55-0.7 2.7-0.35 0.55 0 0.35 0.2 0 2.3c-0.35-2.1-0.55-2.3-2.7-2.65C-0.55-0.7-0.35-0.9 0-3Z",
    edge - 0.9);
  if (skin === "bolt") return around(6, "M-2.7-2.4 0 .2 2.7-2.4 2.7.2 0 2.9-2.7.2 0-2.4Z", edge - 0.8);
  if (skin === "wave") {
    const n = 60, d = [];
    for (let i = 0; i <= n; i++) {
      const [x, y] = pt(edge - 1.9 + Math.sin(i / n * Math.PI * 14) * 1.5, i * (360 / n));
      d.push(`${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`);
    }
    return <path d={d.join(" ")} fill="none" stroke={ink} strokeWidth="1.5" />;
  }
  /* the one asymmetric skin, and the only one that has to be read as an
     object rather than a pattern, so it is filled. It rides the top edge:
     every skin has to leave the middle of the chip clear, because the stamp
     in there is the whole point of the chip. */
  if (skin === "crown") return (
    <path d="M-6.2 3.4 -5-3.6-2.1-0.9 0-5.2 2.1-0.9 5-3.6 6.2 3.4Z"
      fill={ink} transform={`translate(${cx} ${cx - 8.3})`} />
  );
  return lines(8, 22.5, edge - 3, edge + 0.6, 2.4); // ticks, the default
};
function ChipFace({ p, size=18, empty, stamp: stampOverride, skin: skinOverride,
  color: colorOverride, isLight: lightOverride, valueRing=false, flat=false }) {
  const clipId = `chip-edge-${useId().replace(/:/g, "")}`;
  const identity = usePlayerIdentity(p);
  if (empty) return <div style={{ width:size, height:size, borderRadius:"50%",
    border:"1.5px dashed var(--muted)", opacity:0.45, flexShrink:0 }} />;
  const color = colorOverride || identity.color;
  const light = lightOverride ?? identity.isLight;
  const skin = skinOverride || identity.skin;
  const skinInk = light ? "var(--ink0)" : "var(--chip-mark)";
  const inlay = light ? "rgba(42,33,25,0.08)" : "rgba(251,243,228,0.10)";
  const inlayLine = light ? "rgba(42,33,25,0.38)" : "rgba(251,243,228,0.36)";
  const num = identity.num;
  const stamp = stampOverride != null ? stampOverride : num;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true"
      style={{ flexShrink:0, display:"block",
        filter:size >= 32 && !flat ? "drop-shadow(0 2px 2px rgba(0,0,0,.22))" : "none" }}>
      <defs>
        <clipPath id={clipId}><circle cx="16" cy="16" r="14.7" /></clipPath>
      </defs>
      <circle cx="16" cy="16" r="14.7" fill={color} stroke="var(--ink0)" strokeWidth="1.45"/>
      <circle cx="16" cy="16" r="13.25" fill="none" stroke={inlayLine} strokeWidth=".65" opacity=".72" />
      <g clipPath={`url(#${clipId})`}>{chipMarks(skin, 16, 12.4, skinInk)}</g>
      <circle cx="16" cy="16" r="8.75" fill={inlay} stroke={inlayLine} strokeWidth=".8" />
      <path d="M7.4 9.4A10.8 10.8 0 0 1 24.6 9.4" fill="none"
        stroke="rgba(255,255,255,.38)" strokeWidth=".75" strokeLinecap="round" opacity=".65" />
      <path d="M24.6 22.6A10.8 10.8 0 0 1 7.4 22.6" fill="none"
        stroke="rgba(23,16,9,.45)" strokeWidth=".7" strokeLinecap="round" opacity=".55" />
      {valueRing && <circle cx="16" cy="16" r="7.25" fill="none" strokeWidth=".8"
        stroke={light ? "var(--ink0)" : "var(--bone)"} opacity=".48"/>}
      {size >= 20 && stamp != null && (
        <text x="16" y="16.8" textAnchor="middle" dominantBaseline="central"
          fontFamily={DISPLAY} fontWeight="700" fontSize={valueRing && stamp >= 100 ? 8.7 : 11.7}
          fill={light ? "var(--ink0)" : "var(--bone)"}>{stamp}</text>
      )}
    </svg>
  );
}
function BankChip({ p, size=18, empty, val }) {
  /* A bet chip carries its value; an identity chip carries the jersey number.
     Color still says whose it is either way. */
  return <ChipFace p={p} size={size} empty={empty} stamp={val} valueRing={val != null} />;
}
/* A chip pile gets one fixed well. More bettors increase the badge, never the
   width or height of the market pill carrying it. */
function BetChipCluster({ chips, size=22, max=3, onRetract, reserveAction=false }) {
  if (!chips?.length) return null;
  const visible = chips.slice(0, max);
  const step = Math.max(7, Math.round(size * 0.42));
  const stackWidth = size + step * (max - 1);
  const actionWidth = reserveAction ? 24 : 0;
  return (
    <span style={{ width:stackWidth + actionWidth, height:size + 4,
      display:"flex", alignItems:"center", justifyContent:"flex-end", flexShrink:0,
      cursor:"inherit" }}>
      <span style={{ position:"relative", width:stackWidth, height:size, flexShrink:0 }}>
        {visible.map((chip, index) => {
          const left = stackWidth - size - (visible.length - 1 - index) * step;
          return (
            <span key={`${chip.p}:${index}`} style={{ position:"absolute", left, top:0,
              width:size, height:size }}>
              <BankChip p={chip.p} size={size} val={chip.val} />
            </span>
          );
        })}
        {chips.length > max && (
          <span style={{ position:"absolute", right:-3, top:-5, minWidth:17, height:17,
            padding:"0 4px", borderRadius:99, display:"flex", alignItems:"center",
            justifyContent:"center", background:"var(--night)", border:"1px solid var(--paper)",
            color:"var(--bone)", fontFamily:SANS, fontWeight:800, fontSize:9,
            lineHeight:1, zIndex:max + 1 }}>+{chips.length - max}</span>
        )}
      </span>
      {reserveAction && (onRetract ? (
        <span onClick={e => { e.stopPropagation(); onRetract(); }} role="button"
          aria-label="Retract last chip" style={{ width:20, height:20, borderRadius:99,
            display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer",
            marginLeft:4, fontSize:10, background:"var(--ink-tint)",
            color:"var(--muted2)", flexShrink:0 }}>✕</span>
      ) : <span aria-hidden="true" style={{ width:24, height:20, flexShrink:0 }} />)}
    </span>
  );
}

export { Avatar, AvatarStack, ChipFace, BankChip, BetChipCluster };
