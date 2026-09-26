import React from "react";

function EventGlyph({ id }) {
  const bone = "var(--ink)", accent = "var(--accent2)", sun = "var(--sun)";
  const common = { fill:"none", stroke:bone, strokeWidth:2.4,
    strokeLinecap:"round", strokeLinejoin:"round" };
  switch (id) {
    case "putting": return <g {...common}>
      <path d="M15 37V11l16 5-16 5" />
      <path d="M9 37c4-3 10-3 14 0-4 3-10 3-14 0Z" />
      <circle cx="32" cy="35" r="2.6" fill={accent} stroke="none" />
    </g>;
    case "8ball": return <g {...common}>
      <circle cx="24" cy="24" r="13" />
      <circle cx="24" cy="21" r="3.2" />
      <circle cx="24" cy="28" r="3.2" />
      <path d="M14 12l-3-3M34 36l3 3" stroke={accent} />
    </g>;
    case "pong": return <g {...common}>
      <path d="M15 20h18l-2.4 17H17.4L15 20Z" />
      <path d="M16 20c4-2 12-2 16 0" />
      <circle cx="25" cy="11" r="3.2" fill={sun} stroke={bone} />
      <path d="M17 13l4 2" stroke={accent} />
    </g>;
    case "die": return <g {...common}>
      <rect x="11" y="11" width="26" height="26" rx="7" />
      {[[17,17],[31,17],[24,24],[17,31],[31,31]].map(([x,y]) =>
        <circle key={`${x}-${y}`} cx={x} cy={y} r="1.9" fill={x === 24 ? accent : bone} stroke="none" />)}
    </g>;
    case "basketball": return <g {...common}>
      <circle cx="24" cy="24" r="13" />
      <path d="M11 24h26M24 11v26M15 14c5 5 5 15 0 20M33 14c-5 5-5 15 0 20" />
      <path d="M34 12l4-4" stroke={accent} />
    </g>;
    case "spikeball": return <g {...common}>
      <ellipse cx="24" cy="32" rx="14" ry="5.5" />
      <path d="M14 32h20M24 26.5v11M15 35l-3 4M33 35l3 4" />
      <circle cx="24" cy="15" r="4" fill={sun} stroke={bone} />
      <path d="M18 11l-3-3" stroke={accent} />
    </g>;
    case "pingpong": return <g {...common}>
      <circle cx="20" cy="20" r="9" />
      <path d="M14 27l-6 8" />
      <circle cx="35" cy="32" r="3.2" fill={accent} stroke={bone} />
      <path d="M29 17l5-3" />
    </g>;
    case "foosball": return <g {...common}>
      <path d="M8 15h32M8 31h32" />
      <circle cx="24" cy="14" r="3.5" />
      <path d="M24 18v10M18 22h12M24 28l-5 7M24 28l5 7" />
      <circle cx="35" cy="37" r="2.8" fill={accent} stroke="none" />
    </g>;
    case "volleyball": return <g {...common}>
      <path d="M30 12v27M30 19h10v20M30 24h10M30 29h10M30 34h10" />
      <circle cx="17" cy="22" r="9" />
      <path d="M17 13c4 5 4 13 0 18M9 20c6 1 12-1 16-5" />
      <path d="M9 35l4-3" stroke={accent} />
    </g>;
    case "pickleball": return <g {...common}>
      <circle cx="19" cy="19" r="9.5" />
      <path d="M13 26l-5 9" />
      <circle cx="35" cy="31" r="5" fill={sun} />
      {[[33,29],[37,29],[35,33]].map(([x,y]) =>
        <circle key={`${x}-${y}`} cx={x} cy={y} r=".8" fill={bone} stroke="none" />)}
      <path d="M29 15l4-3" stroke={accent} />
    </g>;
    case "flipcup": return <g {...common}>
      <path d="M15 15h15l-2 17H17l-2-17Z" transform="rotate(-28 22.5 23.5)" />
      <path d="M10 34c6 5 19 5 27-1" />
      <path d="M10 29c-3-7 0-13 6-17" stroke={accent} />
      <path d="M13 11l3 1-1 3" stroke={accent} />
    </g>;
    case "beerio": return <g {...common}>
      <circle cx="19" cy="24" r="11" />
      <circle cx="19" cy="24" r="3" />
      <path d="M19 13v8M10 29l6-3M28 29l-6-3" />
      <path d="M33 18h8l-1 17h-6l-1-17Z" />
      <path d="M34 18c2-1 4-1 6 0" />
      <path d="M32 12l4 2" stroke={accent} />
    </g>;
    case "ragecage": return <g {...common}>
      {[15,24,33].map(x => <path key={x} d={`M${x-4} 26h8l-1 11h-6l-1-11Z`} />)}
      <path d="M20 14h8l-1 10h-6l-1-10Z" />
      <circle cx="12" cy="15" r="3" fill={sun} stroke={bone} />
      <path d="M8 20l-2 4" stroke={accent} />
    </g>;
    case "poker": return <g {...common}>
      <rect x="10" y="11" width="15" height="21" rx="3" transform="rotate(-9 17.5 21.5)" />
      <rect x="23" y="10" width="15" height="21" rx="3" transform="rotate(8 30.5 20.5)" />
      <path d="M30 16l3 3-3 3-3-3 3-3Z" fill={accent} stroke="none" />
      <circle cx="24" cy="36" r="6" fill="var(--paper2)" />
      <path d="M20 36h8M24 32v8" stroke={sun} />
    </g>;
    case "gauntlet": return <g {...common}>
      <path d="M9 34c0-12 8-19 18-18 6 1 9 5 9 11" />
      {[[9,34],[12,23],[21,17],[31,19]].map(([x,y], i) =>
        <circle key={i} cx={x} cy={y} r="2.8" fill={i === 0 ? accent : "var(--paper2)"} />)}
      <path d="M36 27V11M36 11l7 3-7 3" />
    </g>;
    default: return <g {...common}>
      <circle cx="24" cy="24" r="12" />
      <path d="M24 15v18M15 24h18" stroke={accent} />
    </g>;
  }
}

function GameMark({ id, size=54, hero=false }) {
  return (
    <svg className={hero ? "fd-night" : undefined} width={size} height={size} viewBox="0 0 48 48" aria-hidden="true"
      style={{ flexShrink:0, display:"block", filter:hero ? "drop-shadow(0 14px 26px rgba(10,6,3,.32))" : "none" }}>
      <rect x="1.5" y="1.5" width="45" height="45" rx="14"
        fill={hero ? "var(--night2)" : "var(--paper2)"} stroke="var(--bone-line)" strokeWidth="1.5" />
      <EventGlyph id={id} />
      <circle cx="39.5" cy="8.5" r="2.4" fill="var(--accent2)" />
    </svg>
  );
}
export { GameMark };
