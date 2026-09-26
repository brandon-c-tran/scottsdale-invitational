import React from "react";

function FDMark({ size=28, variant }) {
  const ring = variant === "night" ? "var(--bone)" : "var(--ink0)";
  const ticks = Array.from({ length: 8 }, (_, i) => {
    const a = (i * 45 + 22.5) * Math.PI / 180;
    return { x1: 32 + Math.cos(a) * 23.4, y1: 32 + Math.sin(a) * 23.4,
             x2: 32 + Math.cos(a) * 28.2, y2: 32 + Math.sin(a) * 28.2 };
  });
  const rays = Array.from({ length: 8 }, (_, i) => {
    const a = i * 45, pt = (r, deg) => {
      const v = deg * Math.PI / 180;
      return `${(32 + Math.cos(v) * r).toFixed(2)},${(32 + Math.sin(v) * r).toFixed(2)}`;
    };
    return `${pt(10.7, a - 8)} ${pt(17.8, a)} ${pt(10.7, a + 8)}`;
  });
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" style={{ flexShrink:0, display:"block" }}>
      <circle cx="32" cy="32" r="29.5" fill="var(--sun)" stroke={ring} strokeWidth="3.5"/>
      {ticks.map((t, i) => <line key={i} {...t} stroke="var(--bone)" strokeWidth="3.8" strokeLinecap="round"/>)}
      <circle cx="32" cy="32" r="20.6" fill="none" stroke="var(--ink0)" strokeWidth="1.5" opacity="0.6"/>
      {rays.map((points, i) => <polygon key={i} points={points} fill="var(--ink0)"/>)}
      <circle cx="32" cy="32" r="8.4" fill="var(--ink0)"/>
    </svg>
  );
}

const IconTV = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="7" width="18" height="12" rx="2"/><path d="m8.5 2.5 3.5 3.5 3.5-3.5"/>
  </svg>
);

const IconGM = ({ filled }) => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor"
    strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3.2 14.6 8.5l5.9.8-4.3 4.1 1 5.9L12 16.5l-5.2 2.8 1-5.9L3.5 9.3l5.9-.8z"/>
  </svg>
);
export { FDMark, IconTV, IconGM };
