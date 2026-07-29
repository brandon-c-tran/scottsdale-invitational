import React, { useState, useEffect, useRef, useMemo, useCallback, useId } from "react";
import qrcode from "qrcode-generator";
import {
  ROSTER, AWARDS, SPORTS, RATINGS, SESSIONS, SLOT_META, OUTRIGHT_MULT, SIZES, GAMES,
  DUEL_STAKE, DUEL_GAMES, CHIP_GRAY, CHIP_COLORS, CHIP_SKINS, PT, maxRisk, CHIP_MIN,
  pokerLive, pokerClock, pokerDenoms,
  allEventsOf, disp, shuffle, snakeTeam, teamLabel, stageFinalists, stageEntrantView,
  resolveWager, wagerBoardEvent, resolveDuel, computeStandings, atRisk, ROUND_NAMES, resolveSlot, bracketChampion, EDITION,
  AIRLINES, cleanLeg, legTime, legText, eventCapacity, validateEventParticipants,
  defaultQaParticipants, OVERFLOW_ROLES, resolveEventLifecycle, resolveWeekendOperation,
  RESET_PROGRESS_CONFIRMATION,
} from "../shared/core.js";
import {
  useTournament, dispatch, uploadPhoto, downloadSnapshot, localGet, localSet, setGmToken, hasGmToken,
} from "./lib/client.js";
import PhotoCropper from "./PhotoCropper.jsx";


/* PWA install: stash the browser's install prompt when offered. iOS never
   fires it. Chrome usually fires AFTER first paint, so subscribers get a
   nudge to re-render once the native button becomes possible. */
let installEvt = null;
const installSubs = new Set();
const onInstallReady = fn => { installSubs.add(fn); return () => installSubs.delete(fn); };
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault(); installEvt = e; installSubs.forEach(fn => fn());
  });
}
const isStandalone = () => typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true);
const isIOS = () => typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent);
const isMobile = () => typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/.test(navigator.userAgent);
const prefersReducedMotion = () => typeof window !== "undefined" &&
  !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
/* where onboarding opens. The install gate is step -1 and has to come BEFORE
   check-in, because the installed app gets its own storage and anything done
   in the browser first would be lost. Skip it only when there is nothing to
   install: already standalone, or not a phone. Every entry point (first run,
   a GM rerun, a local replay) must use this, or the gate silently disappears
   for everyone who was re-onboarded. */
const firstOnboardStep = () => (isStandalone() || !isMobile() ? 0 : -1);

/* ─────────── visual system: FIELD DAY ───────────
   Sun-faded rec-tournament at night. Barlow Condensed carries scores, ranks,
   and event names; Inter carries everything functional. Full dark: warm
   near-black surfaces, bone ink, sun-gold for what matters. */
const DISPLAY = "'Barlow Condensed','Arial Narrow',sans-serif";
const SANS = "'Inter',system-ui,sans-serif";
const fmt = n => (n ?? 0).toLocaleString("en-US");
const ord = n => (n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`);
const BONE = "var(--bone)";
const GOLD_GRAD = "var(--sun)";
const EMBER_GRAD = "var(--accent)";
const CARD_BG = "var(--paper)";
const GRAIN = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E\")";

/* chip identity: color and skin come from claimed profiles (CHIP_COLORS in
   core, first come first serve). Everyone starts gray until they pick.
   App() syncs this module-level source each render before children read it. */
let CHIP_PROFILES = {};
const syncChips = profiles => { CHIP_PROFILES = profiles || {}; };
const playerColor = p => {
  const c = CHIP_PROFILES[p]?.color;
  return CHIP_COLORS.find(x => x.hex === c) ? c : CHIP_GRAY;
};
const playerIsLight = p => !!CHIP_COLORS.find(x => x.hex === CHIP_PROFILES[p]?.color)?.light;
const playerSkin = p => CHIP_SKINS.includes(CHIP_PROFILES[p]?.skin) ? CHIP_PROFILES[p].skin : "ticks";
const playerNo = p => { const i = ROSTER.indexOf(p); return i < 0 ? null : i + 1; };
const CHIP_SKIN_META = {
  ticks: "Classic", plain: "Clean", dash: "Split", quad: "Four block",
  dots: "Pips", ring: "Double ring", saw: "Zigzag", flame: "Petal",
  star: "Starburst", bolt: "Chevron", wave: "Ripple", crown: "Crown",
};

/* the Field Day mark: a betting chip carrying the sun. Sun-gold chip, bone
   edge ticks like the BankChips on the board, geometric sun at dead center.
   One mark everywhere: header, wordmark, TV, onboarding, and the PWA icons
   (scripts/icons.mjs regenerates them from this same geometry).
   variant "night" swaps the outer ring to bone for dark surfaces. */
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
const ArtTicket = () => (
  <svg width="58" height="42" viewBox="0 0 56 40" aria-hidden="true">
    <rect x="1.5" y="1.5" width="53" height="37" rx="6" fill="var(--paper)" stroke="var(--ink)" strokeWidth="2"/>
    <line x1="38" y1="4" x2="38" y2="36" stroke="var(--ink)" strokeWidth="2" strokeDasharray="3.5 3.5"/>
    <circle cx="16" cy="20" r="6.5" fill="var(--sun)" stroke="var(--ink)" strokeWidth="2"/>
  </svg>
);
const ArtStar = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 2.6 15 8.6l6.6.9-4.8 4.6 1.2 6.6L12 17.6l-6 3.1 1.2-6.6L2.4 9.5l6.6-.9z"
      fill="var(--sun)" stroke="var(--ink)" strokeWidth="1.6" strokeLinejoin="round"/>
  </svg>
);

/* ─────────── the prize ───────────
   An actually-turned trophy: every part is a real solid of revolution built
   from a ring of facets (rotateY out to the radius, tilted to the profile's
   slant), with back faces culled so you only ever see the near half. Flat
   facet tones come from color-mix on the palette, no gradient, no glow. */
function trophyRing({ key, topR, botR, h, yTop, n, hue, lo = 0.72 }) {
  const slant = Math.hypot(h, topR - botR);
  const tilt = Math.atan2(topR - botR, h) * 180 / Math.PI;
  const wTop = 2 * topR * Math.tan(Math.PI / n) + 0.6;
  const wBot = 2 * botR * Math.tan(Math.PI / n) + 0.6;
  const w = Math.max(wTop, wBot);
  const rMid = (topR + botR) / 2;
  const inset = t => 50 - 50 * (t / w);
  return Array.from({ length: n }, (_, i) => {
    /* facets are shaded by their own angle: a fixed tone band around the ring
       that sweeps as the piece turns, so the facet edges read as volume */
    const mix = Math.round(100 - (100 - lo * 100) * (1 - Math.cos(i * 2 * Math.PI / n)) / 2);
    return (
      <div key={`${key}${i}`} style={{
        position:"absolute", left:"50%", top:0, width:w, height:slant, marginLeft:-w / 2,
        backgroundColor:`var(${hue})`,
        background:`color-mix(in srgb, var(${hue}) ${mix}%, var(--ink0))`,
        backfaceVisibility:"hidden",
        clipPath:`polygon(${inset(wTop)}% 0%, ${100 - inset(wTop)}% 0%, ${100 - inset(wBot)}% 100%, ${inset(wBot)}% 100%)`,
        transform:`translateY(${yTop + h / 2 - slant / 2}px) rotateY(${i * 360 / n}deg) `
          + `translateZ(${rMid}px) rotateX(${-tilt}deg)`,
      }} />
    );
  });
}
function TrophyHero({ size = 190, plate = "FIELD DAY" }) {
  const S = size;
  const cupTop = 0.27 * S, cupBot = 0.115 * S;
  const parts = [
    /* rim, bowl, neck, stem, collar, plinth, block */
    { key:"rim",  topR:0.285 * S, botR:0.275 * S, h:0.045 * S, yTop:0.04 * S, n:20, hue:"--sun", lo:0.8 },
    { key:"cup",  topR:cupTop,    botR:cupBot,    h:0.29 * S,  yTop:0.085 * S, n:20, hue:"--sun" },
    { key:"neck", topR:cupBot,    botR:0.045 * S, h:0.045 * S, yTop:0.375 * S, n:16, hue:"--sun", lo:0.62 },
    { key:"stem", topR:0.042 * S, botR:0.042 * S, h:0.115 * S, yTop:0.42 * S,  n:14, hue:"--sun", lo:0.6 },
    { key:"coll", topR:0.05 * S,  botR:0.15 * S,  h:0.05 * S,  yTop:0.535 * S, n:18, hue:"--sun", lo:0.68 },
    { key:"base", topR:0.16 * S,  botR:0.16 * S,  h:0.045 * S, yTop:0.585 * S, n:20, hue:"--sun", lo:0.7 },
    { key:"blk",  topR:0.185 * S, botR:0.185 * S, h:0.1 * S,   yTop:0.63 * S,  n:22, hue:"--accent", lo:0.66 },
  ];
  return (
    <div style={{ width:S, height:S * 0.82, perspective:5.5 * S, flexShrink:0 }} aria-hidden="true">
      <div data-trophy style={{ position:"relative", width:"100%", height:"100%", transformStyle:"preserve-3d",
        transform:"rotateX(-8deg)", animation:"si-trophy 16s linear infinite" }}>
        {parts.map(p => trophyRing(p))}
        {/* the mouth of the cup, so you look into it rather than through it.
            transform-origin is the element centre, so translate by half its
            own height to land the disc exactly on the rim */}
        <div style={{ position:"absolute", left:"50%", top:0, width:0.55 * S, height:0.55 * S,
          marginLeft:-0.275 * S, borderRadius:"50%", backgroundColor:"var(--ink0)",
          transform:`translateY(${0.045 * S - 0.275 * S}px) rotateX(90deg)` }} />
        {/* handles are flat ribbons in one plane, exactly like the real thing:
            broad from the front, edge-on from the side */}
        {[1, -1].map(dir => (
          <svg key={dir} width={S} height={S * 0.82} viewBox="0 0 100 82"
            style={{ position:"absolute", inset:0, pointerEvents:"none" }}>
            <path d={dir > 0 ? "M27 13 Q10 18 14 30 Q17 39 29 40" : "M73 13 Q90 18 86 30 Q83 39 71 40"}
              fill="none" stroke="var(--ink0)" strokeWidth="6.4" strokeLinecap="round"/>
            <path d={dir > 0 ? "M27 13 Q10 18 14 30 Q17 39 29 40" : "M73 13 Q90 18 86 30 Q83 39 71 40"}
              fill="none" stroke="var(--sun)" strokeWidth="3.4" strokeLinecap="round"/>
          </svg>
        ))}
        {/* engraved on both faces so the name never comes around mirrored */}
        {[0, 180].map(deg => (
          <div key={deg} style={{ position:"absolute", left:"50%", top:0, width:0.3 * S, height:0.1 * S,
            marginLeft:-0.15 * S, display:"flex", alignItems:"center", justifyContent:"center",
            backfaceVisibility:"hidden", fontFamily:DISPLAY, fontWeight:700, fontSize:0.052 * S,
            letterSpacing:"0.06em", color:"var(--bone)", whiteSpace:"nowrap",
            transform:`translateY(${0.63 * S}px) rotateY(${deg}deg) translateZ(${0.187 * S}px)` }}>
            {plate}</div>
        ))}
      </div>
    </div>
  );
}

/* ─────────── everyone flies in ───────────
   Stylized US, positions from real longitude/latitude, every route drawing
   itself into Scottsdale and a chip running the line behind it. */
/* everything is real geography, projected once: x = (lon+125)/55, y = (49-lat)/24.
   The country is drawn as a dot field rather than a traced coastline, so it
   reads as a map at a glance without a hand-drawn outline to get wrong. */
const geo = (lon, lat) => [(lon + 125) / 55 * 100, (49 - lat) / 24 * 100];
const US_LL = [
  [-124.7,48.4],[-124.2,43.3],[-122.4,37.8],[-120.6,34.5],[-117.1,32.5],[-114.7,32.7],
  [-111.0,31.3],[-108.2,31.3],[-106.5,31.8],[-104.5,29.7],[-103.0,29.0],[-99.1,26.4],
  [-97.1,25.9],[-95.0,29.0],[-93.8,29.7],[-91.0,29.2],[-89.0,29.2],[-88.0,30.3],
  [-85.0,29.7],[-84.0,30.0],[-82.8,27.9],[-82.0,26.5],[-80.4,25.2],[-80.1,27.0],
  [-81.4,30.7],[-79.2,33.0],[-77.0,35.0],[-75.5,37.0],[-75.5,39.0],[-74.0,40.5],
  [-71.5,41.3],[-70.0,42.0],[-70.7,43.5],[-67.0,44.8],[-71.5,45.0],[-76.0,44.0],
  [-79.0,43.3],[-83.0,42.0],[-83.5,45.8],[-88.0,48.2],[-95.0,49.0],[-104.0,49.0],
  [-117.0,49.0],
].map(([lo, la]) => geo(lo, la));
const inUS = (x, y) => {
  let hit = false;
  for (let i = 0, j = US_LL.length - 1; i < US_LL.length; j = i++) {
    const [xi, yi] = US_LL[i], [xj, yj] = US_LL[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
};
const US_DOTS = (() => {
  const step = 2.6, out = [];
  for (let y = 1; y < 100; y += step)
    for (let x = 1; x < 100; x += step) if (inUS(x, y)) out.push([x, y]);
  return out;
})();
const TRAVEL_CITIES = [
  { n:"San Francisco", ll:[-122.4,37.8], dx:3.6,  dy:-4.2, a:"start" },
  { n:"San Diego",     ll:[-117.2,32.7], dx:-1,   dy:6.6,  a:"middle" },
  { n:"Tulsa",         ll:[-96.0,36.2],  dx:0,    dy:-4.6, a:"middle" },
  { n:"Dallas",        ll:[-96.8,32.8],  dx:4,    dy:1.2,  a:"start" },
  { n:"Austin",        ll:[-97.7,30.3],  dx:-4,   dy:1.2,  a:"end" },
  { n:"Baton Rouge",   ll:[-91.2,30.5],  dx:4,    dy:1.2,  a:"start" },
  { n:"New York",      ll:[-74.0,40.7],  dx:-4.5, dy:-4.6, a:"end" },
].map(c => { const [x, y] = geo(...c.ll); return { ...c, x, y }; });
const TRAVEL_DEST = (() => { const [x, y] = geo(-111.9, 33.5); return { x, y }; })();
function TravelMap() {
  const arc = c => {
    const mx = (c.x + TRAVEL_DEST.x) / 2;
    const lift = 9 + Math.abs(c.x - TRAVEL_DEST.x) * 0.3;
    return `M${c.x} ${c.y} Q${mx} ${Math.min(c.y, TRAVEL_DEST.y) - lift} ${TRAVEL_DEST.x} ${TRAVEL_DEST.y}`;
  };
  return (
    <svg viewBox="-5 -3 110 104" width="100%" height="100%" preserveAspectRatio="xMidYMid meet"
      aria-hidden="true" style={{ display:"block", overflow:"hidden", maxWidth:"100%", maxHeight:"100%" }}>
      <g style={{ animation:"si-fade .8s ease-out both" }}>
        {US_DOTS.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="0.62" fill="var(--muted)" opacity="0.45" />)}
      </g>
      {TRAVEL_CITIES.map((c, i) => (
        <path key={"r" + c.n} d={arc(c)} fill="none" stroke="var(--accent2)" strokeWidth="0.8"
          strokeLinecap="round" strokeDasharray="140" pathLength="140"
          style={{ "--len":140, animation:`si-route 1.1s ease-out ${0.3 + i * 0.18}s both` }} />
      ))}
      {/* the travelling chips. animateMotion translates from the element's own
          position, so these must stay at the origin (any cx/cy would double up
          and throw them off the map). Hidden until their leg begins, or all
          seven stack up in the corner waiting. */}
      {TRAVEL_CITIES.map((c, i) => (
        <circle key={"m" + c.n} r="1.7" fill="var(--sun)" stroke="var(--ink0)"
          strokeWidth="0.5" opacity="0">
          <set attributeName="opacity" to="1" begin={`${1.2 + i * 0.18}s`} />
          <animateMotion dur="3.6s" begin={`${1.2 + i * 0.18}s`} repeatCount="indefinite" path={arc(c)} />
        </circle>
      ))}
      {TRAVEL_CITIES.map((c, i) => (
        <g key={c.n} style={{ animation:`si-in .4s ease-out ${i * 0.18}s both` }}>
          <circle cx={c.x} cy={c.y} r="1.9" fill="var(--paper)" stroke="var(--bone)" strokeWidth="0.9"/>
          <text x={c.x + c.dx} y={c.y + c.dy} textAnchor={c.a} fontFamily={SANS} fontWeight="700"
            fontSize="3.4" fill="var(--muted2)" letterSpacing="0.15">{c.n.toUpperCase()}</text>
        </g>
      ))}
      <circle cx={TRAVEL_DEST.x} cy={TRAVEL_DEST.y} r="4.6" fill="none" stroke="var(--sun)" strokeWidth="0.9"
        style={{ animation:"si-land 2.2s ease-in-out infinite" }} />
      <circle cx={TRAVEL_DEST.x} cy={TRAVEL_DEST.y} r="2.8" fill="var(--sun)" stroke="var(--ink0)" strokeWidth="0.8"/>
      <text x={TRAVEL_DEST.x} y={TRAVEL_DEST.y - 8} textAnchor="middle" fontFamily={DISPLAY} fontWeight="700"
        fontSize="6" fill="var(--sun)" letterSpacing="0.3">SCOTTSDALE</text>
    </svg>
  );
}
const IconGM = ({ filled }) => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor"
    strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3.2 14.6 8.5l5.9.8-4.3 4.1 1 5.9L12 16.5l-5.2 2.8 1-5.9L3.5 9.3l5.9-.8z"/>
  </svg>
);

function Avatar({ state, p, size=34, ring, style }) {
  const prof = state.profiles?.[p];
  const src = prof?.photoV ? `/api/photo/${encodeURIComponent(p)}?v=${prof.photoV}` : null;
  const initials = (prof?.display || p).slice(0,2).toUpperCase();
  const c = playerColor(p);
  return (
    <div style={{ width:size, height:size, borderRadius:"50%", flexShrink:0, overflow:"hidden",
      display:"flex", alignItems:"center", justifyContent:"center",
      background: src ? "var(--paper2)" : c, position:"relative",
      border: ring ? "2px solid var(--bone)" : "1.5px solid rgba(23,16,9,0.6)", ...style }}>
      {src
        ? <img src={src} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
        : <>
            <div style={{ position:"absolute", inset:0,
              background:"linear-gradient(135deg, transparent 40%, rgba(251,243,228,0.26) 40%, rgba(251,243,228,0.26) 62%, transparent 62%)" }} />
            <span style={{ position:"relative", fontFamily:DISPLAY, fontWeight:700, fontStyle:"italic",
              fontSize:size*0.44, letterSpacing:"0.03em",
              color: playerIsLight(p) ? "var(--ink0)" : BONE }}>{initials}</span>
          </>}
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
function Confetti({ burst }) {
  if (!burst) return null;
  const colors = ["var(--accent2)","var(--accent)","var(--sun)","var(--bone)","var(--olive)"];
  const pieces = Array.from({length:90}, (_,i) => ({
    left: Math.random()*100, delay: Math.random()*0.5, dur: 2.4 + Math.random()*1.6,
    color: colors[i % colors.length], size: 5 + Math.random()*8, rot: Math.random()*360,
    drift: (Math.random()-0.5)*180,
  }));
  return (
    <div key={burst} style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:400,overflow:"hidden"}}>
      {pieces.map((p,i) => (
        <div key={i} style={{ position:"absolute", top:-20, left:`${p.left}%`, width:p.size, height:p.size*0.5,
          background:p.color, opacity:0.95, transform:`rotate(${p.rot}deg)`,
          animation:`si-fall ${p.dur}s ${p.delay}s cubic-bezier(.2,.6,.4,1) forwards`, "--drift":`${p.drift}px` }} />
      ))}
    </div>
  );
}
const label = { fontFamily:SANS, fontWeight:700, fontSize:11, letterSpacing:"0.07em", color:"var(--muted)", textTransform:"uppercase" };
function Tag({ children, tone="dim", style }) {
  const tones = {
    dim:   { color:"var(--muted)", background:"var(--ink-tint)" },
    gold:  { color:"var(--accent2)", background:"var(--accent-tint)" },
    flame: { color:"var(--live2)", background:"rgba(192,71,58,0.14)" },
    green: { color:"var(--green)", background:"var(--green-tint)" },
  };
  return <span style={{ fontFamily:SANS, fontWeight:700, fontSize:11, letterSpacing:"0.05em",
    padding:"3px 8px", borderRadius:6, textTransform:"uppercase", ...tones[tone], ...style }}>{children}</span>;
}
function Btn({ children, onClick, kind="primary", disabled, style, ...props }) {
  const kinds = {
    primary: { background:"var(--sun)", color:"var(--ink0)", border:"1.5px solid var(--ink0)" },
    flame:   { background:"var(--clay)", color:BONE, border:"1.5px solid var(--ink0)" },
    ghost:   { background:"var(--paper)", color:"var(--ink)", border:"1px solid var(--line)" },
    dark:    { background:"var(--paper)", color:"var(--ink)", border:"1.5px solid var(--ink)" },
    danger:  { background:"transparent", color:"var(--clay)", border:"1.5px solid rgba(192,71,58,0.55)" },
  };
  return (
    <button onClick={onClick} disabled={disabled} {...props} style={{ fontFamily:SANS, fontWeight:700,
      letterSpacing:"0.04em", fontSize:14, textTransform:"uppercase", padding:"12px 16px", borderRadius:10, minHeight:44,
      cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.35 : 1,
      transition:"transform .1s", ...kinds[kind], ...style }}>{children}</button>
  );
}
function Sheet({ title, onClose, children, wide }) {
  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, zIndex:100, background:"rgba(23,16,9,0.55)",
      backdropFilter:"blur(4px)", display:"flex", alignItems:"flex-end", justifyContent:"center" }}>
      <div onClick={e=>e.stopPropagation()} className="si-sheet" role="dialog" aria-modal="true"
        aria-label={title} style={{ width:"100%", maxWidth: wide ? 780 : 540,
        overflowY:"auto", background:"var(--paper)", borderRadius:"16px 16px 0 0",
        border:"1.5px solid var(--ink)", borderBottom:"none",
        padding:"0 0 calc(30px + env(safe-area-inset-bottom))", animation:"si-up .24s ease-out" }}>
        {/* night title band ties every sheet to the chrome */}
        <div style={{ position:"sticky", top:0, zIndex:5, display:"flex", alignItems:"center",
          justifyContent:"space-between", background:"var(--night)", padding:"13px 18px 11px",
          borderBottom:"1px solid var(--bone-line)", marginBottom:14 }}>
          <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:24, letterSpacing:"0.02em",
            textTransform:"uppercase", color:"var(--bone)" }}>{title}</div>
          <button onClick={onClose} aria-label="Close" style={{ background:"transparent", border:"1.5px solid var(--ghost-line)",
            color:"var(--bone)", width:36, height:36, borderRadius:10, fontSize:14, cursor:"pointer" }}>✕</button>
        </div>
        <div style={{ padding:"0 18px" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
/* A one-item final row should read as the end of a deliberate roster, not as
   a grid bug. Three-column player racks center it; two-column racks give it
   half width and center it across the row. */
const centeredGridCell = (i, count, columns = 3, gap = 6) => {
  if (i !== count - 1 || count % columns !== 1) return {};
  if (columns % 2) return { gridColumn:String(Math.ceil(columns / 2)) };
  return { gridColumn:"1 / -1", width:`calc(${100 / columns}% - ${gap / 2}px)`, justifySelf:"center" };
};
function PlayerChip({ name, selected, disabled, onClick, small, style }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-pressed={selected} style={{ fontFamily:SANS, fontWeight:600,
      fontSize: small ? 13 : 14, padding: small ? "9px 8px" : "11px 10px", borderRadius:10, width:"100%",
      cursor: disabled ? "default" : "pointer",
      background: selected ? GOLD_GRAD : "var(--paper)",
      color: selected ? "var(--ink0)" : disabled ? "var(--disabled)" : "var(--ink)",
      border: selected ? "1.5px solid var(--ink0)" : "1.5px solid var(--line)",
      opacity: disabled && !selected ? 0.4 : 1, transition:"all .12s",
      overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", ...style }}>{name}</button>
  );
}
const pStyle = { fontFamily:SANS, fontSize:14, lineHeight:1.6, color:"var(--muted2)", marginBottom:14 };
function Wordmark({ size=28 }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:size*0.4 }}>
      <FDMark size={size*1.6} />
      <div>
        <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:size*1.25, lineHeight:0.92,
          letterSpacing:"0.015em", textTransform:"uppercase", color:"var(--ink)" }}>Field Day</div>
        <div style={{ fontFamily:SANS, fontWeight:700, fontSize:Math.max(9.5, size*0.34),
          letterSpacing:"0.12em", color:"var(--accent2)", marginTop:3 }}>SCOTTSDALE · 2026</div>
      </div>
    </div>
  );
}
/* two big teams side by side, broadcast style: each side gets a color band and a VS disc sits between */
const SIDE_COLORS = ["var(--pool)", "var(--accent)"];
function VersusDraw({ state, teams, size="md" }) {
  const av = size === "lg" ? 34 : 26;
  const f = size === "lg" ? 19 : 14;
  const tf = size === "lg" ? 26 : 17;
  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr auto 1fr", gap: size==="lg" ? 18 : 10, alignItems:"stretch" }}>
      {[teams[0], null, teams[1]].map((t, i) => i === 1 ? (
        <div key="vs" style={{ alignSelf:"center", width: size==="lg" ? 54 : 36, height: size==="lg" ? 54 : 36,
          borderRadius:"50%", background:"var(--sun)", color:"var(--ink0)", display:"flex", alignItems:"center",
          justifyContent:"center", fontFamily:DISPLAY, fontWeight:700, fontStyle:"italic",
          fontSize: size==="lg" ? 24 : 16, border:"2px solid var(--ink)", zIndex:2 }}>VS</div>
      ) : (
        <div key={i} style={{ background:"var(--paper)", border:"1.5px solid var(--ink)", borderRadius:10,
          overflow:"hidden", display:"flex", flexDirection:"column" }}>
          <div style={{ background:SIDE_COLORS[i === 0 ? 0 : 1], color:BONE, fontFamily:DISPLAY, fontWeight:700,
            fontSize:tf, letterSpacing:"0.02em", textTransform:"uppercase", padding: size==="lg" ? "8px 14px" : "5px 11px",
            textAlign: i === 0 ? "left" : "right", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            {teamLabel(state, t)}</div>
          <div style={{ padding: size==="lg" ? "10px 14px" : "8px 11px" }}>
            {t.players.map(p => (
              <div key={p} style={{ display:"flex", alignItems:"center", gap:8, padding:"3px 0",
                flexDirection: i === 0 ? "row" : "row-reverse" }}>
                <Avatar state={state} p={p} size={av} />
                <span style={{ fontFamily:SANS, fontWeight:600, fontSize:f, color:"var(--ink)" }}>{disp(state, p)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ═════════════════════════════ APP ═════════════════════════════ */
export default function App() {
  const { state, connected, ready, version, lastAction, environment, capabilities } = useTournament();
  syncChips(state.profiles);
  const [me, setMe] = useState(() => localGet("si-me"));
  const [onboardStep, setOnboardStep] = useState(() => localGet("si-onboard-v5") === "yes" ? 99
    : firstOnboardStep());
  const [tab, setTab] = useState("board");
  const [gm, setGm] = useState(() => localGet("si-gm") === "yes" && hasGmToken());
  const [qa, setQa] = useState(() => localGet("si-qa") === "yes");
  const [guestLens, setGuestLens] = useState(false);
  const gmView = gm && !guestLens;
  const [sim, setSim] = useState(null);
  const [qaMin, setQaMin] = useState(() => localGet("si-qa-min") === "yes");
  const [qaTop, setQaTop] = useState(() => localGet("si-qa-pos") === "top");
  const [tv, setTv] = useState(() => typeof window !== "undefined" &&
    (window.location.pathname === "/tv" || new URLSearchParams(window.location.search).has("tv")));
  const [modal, setModal] = useState(null);
  const [intro, setIntro] = useState(null);
  const [burst, setBurst] = useState(0);
  const [toast, setToast] = useState(null);
  const [seenReveals, setSeenReveals] = useState(() => {
    try { return JSON.parse(localGet("si-seen-v5") || "[]"); } catch { return []; }
  });
  const [reveal, setReveal] = useState(null);
  const prevRanks = useRef({});
  const [deltas, setDeltas] = useState({});
  const undoRef = useRef(null);
  const toastTimer = useRef(null);
  const prevVersion = useRef(0);
  const loaded = ready;
  const saveMine = (k, v) => localSet(k, v);
  const qaAllowed = capabilities.qa === true;
  const progressResetAllowed = capabilities.progressReset === true;
  const qaActive = qaAllowed && qa;

  const events = useMemo(() => allEventsOf(state), [state]);
  const weekendOperation = useMemo(() => resolveWeekendOperation(state, events), [state, events]);
  const standings = useMemo(() => computeStandings(state), [state]);
  const allTied = standings.length > 0 && standings[0].pts === standings[standings.length-1].pts && !state.frozen;
  const onDeckEv = state.onDeck && !state.frozen ? events.find(e => e.id === state.onDeck && !state.results[e.id]) : null;
  const wagerEv = useMemo(() => wagerBoardEvent(state, events), [state, events]);
  const wagerMarketOpen = !!onDeckEv && onDeckEv.id === wagerEv?.id;
  const qaStatus = useMemo(() => {
    const scored = events.filter(ev => !ev.finale && !state.shelved?.[ev.id]);
    const pendingWagers = (state.wagers || []).filter(w =>
      resolveWager(state, w, events).status === "pending").length;
    const openDuels = (state.duels || []).filter(duel =>
      duel.status === "open" && !resolveDuel(duel).settled).length;
    return {
      environment,
      version,
      schema:state.v,
      profiles:Object.values(state.profiles || {}).filter(profile =>
        profile && Object.keys(profile).length > 0).length,
      completed:scored.filter(ev => state.results?.[ev.id]).length,
      total:scored.length,
      pendingWagers,
      openDuels,
      current:weekendOperation.event?.name || "No active event",
      phase:weekendOperation.lifecycle?.label || (state.live ? "Weekend live" : "Locker room"),
      next:weekendOperation.nextAction?.label || "No pending action",
      blockers:weekendOperation.lifecycle?.blockers || [],
    };
  }, [environment, version, state, events, weekendOperation]);
  const champion = state.frozen ? standings[0] : null;
  const coChamps = state.frozen ? standings.filter(r => r.rank === 1) : [];
  const introHasQueuedReveal = !!intro && (
    (state.draws?.[intro] && !seenReveals.includes(state.draws[intro].id)) ||
    (state.stages?.[intro] && !seenReveals.includes(state.stages[intro].id))
  );

  /* chip: a roster name puts that player's claimed chip and number on the
     toast; without one the FD mark carries it. Kills the inbox-notif look. */
  const notify = useCallback((msg, action, tone, chip) => {
    setToast({ msg, action, tone, chip });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), action ? 6000 : tone === "gold" ? 4000 : 2600);
  }, []);

  /* re-claim identity on every (re)connect so the server knows who this device is */
  useEffect(() => { if (connected && me) dispatch("claim", { player: me }); }, [connected, me]);

  /* your own wagers settling deserve a moment: watch pending picks flip to won or lost */
  const prevWagerRes = useRef(null);
  const settleToastV = useRef(0);
  useEffect(() => {
    if (!ready) return;
    const map = {};
    let delta = 0, any = false;
    (state.wagers || []).forEach(w => {
      if (w.player !== me) return;
      const r = resolveWager(state, w, events);
      map[w.id] = r.status;
      if (prevWagerRes.current && prevWagerRes.current[w.id] === "pending" &&
          (r.status === "won" || r.status === "lost")) { any = true; delta += r.delta; }
    });
    if (any && onboardStep >= 99) {
      notify(delta > 0 ? `Won +${delta}` : delta < 0 ? `Lost ${delta}` : "Wagers settled even",
        null, delta > 0 ? "gold" : undefined, me);
      settleToastV.current = version;
    }
    prevWagerRes.current = map;
  }, [state, events, me, ready, onboardStep, notify, version]);

  /* GM can rerun onboarding for everyone; each device compares the epoch it
     finished. A device that finished before it ever stored one adopts the
     current epoch instead of replaying: only a NEW rerun pushes anyone back */
  useEffect(() => {
    if (!ready || onboardStep < 99) return;
    const seen = localGet("si-onboard-epoch");
    if (seen === null || seen === undefined || seen === "") {
      saveMine("si-onboard-epoch", String(state.onboardEpoch || 0));
      return;
    }
    if ((state.onboardEpoch || 0) > Number(seen)) setOnboardStep(firstOnboardStep());
  }, [ready, state.onboardEpoch, onboardStep]); // eslint-disable-line

  /* celebrate on broadcasts so every phone pops, not just the GM's;
     tell people plainly when their own points moved and why */
  useEffect(() => {
    if (version > prevVersion.current && prevVersion.current > 0) {
      if (lastAction === "saveResult" || lastAction === "pokerResult" || (lastAction === "setFrozen" && state.frozen)) setBurst(b => b + 1);
      if (me && settleToastV.current !== version) {
        if (lastAction === "saveResult") {
          let latest = null;
          Object.entries(state.results || {}).forEach(([eid, res]) => {
            if (!latest || res.ts > latest.res.ts) latest = { eid, res };
          });
          const ev = latest && events.find(e => e.id === latest.eid);
          const idx = latest ? latest.res.slots.findIndex(s => (s || []).includes(me)) : -1;
          const award = ev && idx >= 0 ? (AWARDS[ev.value]?.[idx] ?? 0) : 0;
          if (award > 0) notify(`You took ${ord(idx + 1)}, +${award}`, null, "gold", me);
        }
        if (lastAction === "adjust") {
          const a = state.adjustments?.[0];
          if (a?.player === me) notify(`Ruling: ${a.delta > 0 ? "+" : ""}${a.delta}${a.reason ? ", " + a.reason : ""}`,
            null, a.delta > 0 ? "gold" : undefined, a.player);
        }
      }
    }
    prevVersion.current = version;
  }, [version, lastAction, state, me, events, notify]);

  /* rank deltas plus lead-change detection: when the top of the board flips,
     every phone announces it */
  const prevLeaders = useRef(null);
  useEffect(() => {
    if (ready) {
      const key = allTied ? "__tied__" : standings.filter(r => r.rank === 1).map(r => r.player).join("+");
      if (!allTied && !state.frozen && prevLeaders.current && prevLeaders.current !== key) {
        const names = standings.filter(r => r.rank === 1).map(p => p.player === me ? "You" : disp(state, p.player));
        notify(names.length > 1 ? `${names.join(" and ")} share the lead`
          : `${names[0]} ${names[0] === "You" ? "take" : "takes"} the lead`, null, "gold",
          standings.find(r => r.rank === 1)?.player);
      }
      prevLeaders.current = key;
    }
    if (allTied) return;
    const d = {};
    standings.forEach(r => {
      const prev = prevRanks.current[r.player];
      if (prev && prev !== r.rank) d[r.player] = prev - r.rank;
    });
    if (Object.keys(d).length) setDeltas(d);
    const map = {}; standings.forEach(r => map[r.player] = r.rank);
    prevRanks.current = map;
  }, [standings, allTied, ready, state, me, notify]);

  /* reveal detection: team draws and stage draws reveal on every phone.
     The intro announces the game first and the reveal comes second, but the
     handover is automatic: one GM tap plays both scenes in order, so nobody
     has to close a card to make the draw appear. */
  const INTRO_HOLD = prefersReducedMotion() ? 650 : 4200;
  const introAt = useRef(0);
  useEffect(() => { if (intro) introAt.current = Date.now(); }, [intro]);
  useEffect(() => {
    if (seenReveals === null || (!tv && onboardStep < 99) || reveal || !ready) return;
    /* fast-forward sims should not stack reveal ceremonies; mark them seen silently */
    if (simRef.current.running && simRef.current.fast) {
      const ids = [...Object.values(state.draws || {}), ...Object.values(state.stages || {})]
        .filter(x => x && !seenReveals.includes(x.id)).map(x => x.id);
      if (ids.length) {
        const nx = [...seenReveals, ...ids].slice(-60);
        setSeenReveals(nx); localSet("si-seen-v5", JSON.stringify(nx));
      }
      return;
    }
    /* built first and shown second: the intro can only be handed over once we
       know something is actually waiting behind it */
    const build = () => {
    const ordered = map => Object.entries(map || {}).sort(([a], [b]) =>
      a === intro ? -1 : b === intro ? 1 : 0);
    for (const [eid, draw] of ordered(state.draws)) {
      if (draw && !seenReveals.includes(draw.id)) {
        const ev = events.find(e => e.id === eid);
        if (!ev) continue;
        /* a bracket draw announces the matchups, not just the teams: each
           first-round pairing is its own card, byes get named for what they skip */
        const br = state.brackets[eid];
        let groups = null;
        if (draw.teams.length !== 2 && br) {
          const names = ROUND_NAMES[br.size] || [];
          const teamLine = t => ({ avatars: [...draw.teams[t].players], text: teamLabel(state, draw.teams[t]) });
          const seated = new Set();
          groups = [];
          br.rounds[0].forEach((match, m) => {
            const a = resolveSlot(br, match.a), b = resolveSlot(br, match.b);
            if (a === null || b === null) return;
            seated.add(a); seated.add(b);
            groups.push({ title: `${names[0] || "Round 1"}${br.rounds[0].length > 1 ? ` ${m + 1}` : ""}`,
              vs: true, lines: [teamLine(a), teamLine(b)] });
          });
          const byes = draw.teams.map((_, i) => i).filter(i => !seated.has(i));
          if (byes.length) groups.push({
            title: names[1] ? `Straight to the ${names[1].toLowerCase()}` : "Bye",
            lines: byes.map(teamLine) });
        } else if (draw.teams.length !== 2) {
          groups = draw.teams.map(t => ({ title: teamLabel(state, t), lines: t.players.map(p => ({ avatars:[p], text: disp(state, p) })) }));
        }
        return { id:draw.id, evId:ev.id, title:"The draw", subtitle:ev.name, groups,
          versus: draw.teams.length === 2 ? draw.teams : null };
      }
    }
    for (const [eid, st] of ordered(state.stages)) {
      if (st && !seenReveals.includes(st.id)) {
        const ev = events.find(e => e.id === eid);
        if (!ev) continue;
        const groups = st.groups.map(g => ({
          title: g.name,
          lines: g.entrants.map(k => {
            const v = stageEntrantView(state, st, k);
            return { avatars: v.players, text: v.name };
          }),
        }));
        return { id:st.id, evId:ev.id, title: st.kind === "heats" ? "The heats" : "The pools",
          subtitle:ev.name, groups, versus:null };
      }
    }
    return null;
    };
    const next = build();
    if (!next) return;
    if (intro) {
      /* A solo announcement owns the screen until it closes. Only a reveal
         for that same event is allowed to continue this ceremony. */
      if (next.evId !== intro) return;
      /* let the announcement have its beat, then step aside for the teams */
      const t = setTimeout(() => setIntro(null),
        Math.max(0, INTRO_HOLD - (Date.now() - introAt.current)));
      return () => clearTimeout(t);
    }
    setReveal(next);
  }, [state.draws, state.stages, seenReveals, onboardStep, reveal, intro, events, ready]); // eslint-disable-line
  const rememberReveal = useCallback(id => {
    if (!id) return;
    setSeenReveals(prev => {
      if (prev?.includes(id)) return prev;
      const next = [...(prev || []), id].slice(-60);
      localSet("si-seen-v5", JSON.stringify(next));
      return next;
    });
  }, []);
  const closeReveal = useCallback(() => {
    if (reveal) rememberReveal(reveal.id);
    setReveal(null);
  }, [reveal, rememberReveal]);
  /* Clearing or redrawing an event retires the visual for the old draw
     immediately; a replacement ID can then begin a fresh ceremony. */
  useEffect(() => {
    if (!reveal) return;
    const alive = [...Object.values(state.draws || {}), ...Object.values(state.stages || {})]
      .some(x => x?.id === reveal.id);
    if (!alive) setReveal(null);
  }, [state.draws, state.stages, reveal]);

  /* nudge a captain when the draft comes around to them, once per pick */
  const draftNudge = useRef("");
  useEffect(() => {
    if (!me || !ready) return;
    for (const [eid, d] of Object.entries(state.drafts || {})) {
      if (!d?.pool?.length) continue;
      const cur = d.teams[snakeTeam(d.picks.length, d.teams.length)]?.captain;
      if (cur !== me) continue;
      const key = `${eid}:${d.picks.length}`;
      if (draftNudge.current === key) return;
      draftNudge.current = key;
      notify(`You're on the clock for ${events.find(e => e.id === eid)?.name || "the draft"}`, null, "gold", me);
      return;
    }
  }, [state.drafts, me, events, ready]); // eslint-disable-line

  /* duels: nudge when a challenge lands on you, toast when one settles.
     Skip the settle toast if the game overlay is up showing the same reveal. */
  const duelNudged = useRef(new Set());
  useEffect(() => {
    if (!me || !ready || onboardStep < 99) return;
    for (const d of state.duels || []) {
      if (d.status !== "open" || d.to !== me || d.runs?.[me]) continue;
      if (duelNudged.current.has(d.id)) continue;
      duelNudged.current.add(d.id);
      notify(`Quick Draw: ${disp(state, d.from)} challenged you`,
        { label:"Play", fn:() => { setModal({ type:"duelPlay", id:d.id }); setToast(null); } }, "gold", d.from);
      return;
    }
  }, [state.duels, me, ready, onboardStep, notify, state]);
  const prevDuelRes = useRef(null);
  useEffect(() => {
    if (!ready) return;
    const map = {};
    let msg = null;
    (state.duels || []).forEach(d => {
      if (d.from !== me && d.to !== me) return;
      const r = resolveDuel(d);
      const st = !r.settled ? "open" : r.push ? "push" : r.winner === me ? "won" : "lost";
      map[d.id] = st;
      if (prevDuelRes.current && prevDuelRes.current[d.id] === "open" && st !== "open"
          && !(modal?.type === "duelPlay" && modal.id === d.id)) {
        const oth = d.from === me ? d.to : d.from;
        const other = disp(state, oth);
        msg = st === "won" ? { t:`Quick Draw: you win +${d.stake}`, tone:"gold", chip:oth }
          : st === "lost" ? { t:`Quick Draw: ${other} wins`, chip:oth }
          : { t:`Quick Draw: tied, chips returned`, chip:oth };
      }
    });
    if (msg && onboardStep >= 99) notify(msg.t, null, msg.tone, msg.chip);
    prevDuelRes.current = map;
  }, [state.duels, me, ready, onboardStep, notify, state, modal]);

  /* the blind clock announces itself; no one has to watch it. The interval
     survives broadcasts: it reads fresh state through stateRef. */
  const prevPokerLevel = useRef(null);
  useEffect(() => {
    if (!state.poker?.startedAt) { prevPokerLevel.current = null; return; }
    const iv = setInterval(() => {
      const s = stateRef.current;
      if (!pokerLive(s)) return;
      const clk = pokerClock(s.poker, Date.now());
      if (prevPokerLevel.current !== null && clk.idx > prevPokerLevel.current && onboardStep >= 99)
        notify(`Blinds up: ${fmt(clk.sb)} / ${fmt(clk.bb)}`, null, "gold");
      prevPokerLevel.current = clk.idx;
    }, 1000);
    return () => clearInterval(iv);
  }, [state.poker?.startedAt, notify, onboardStep]); // eslint-disable-line

  /* when betting opens on a new event, it announces itself everywhere. The
     broadcast order is the game, then the teams, then the book: the intro
     fires the moment the event goes on deck, and the draw reveal below waits
     for it to close rather than landing on top of it. */
  const prevOnDeck = useRef("UNSET");
  useEffect(() => {
    if (!ready) return;
    if (prevOnDeck.current !== "UNSET" && state.onDeck && state.onDeck !== prevOnDeck.current
        && !simRef.current.fast) {
      /* A newer GM announcement supersedes any ceremony still hanging around
         for the previous event. Retire it so it cannot surface again later. */
      if (reveal && reveal.evId !== state.onDeck) {
        rememberReveal(reveal.id);
        setReveal(null);
      }
      setIntro(state.onDeck);
    } else if (!state.onDeck) {
      setIntro(null);
    }
    prevOnDeck.current = state.onDeck;
  }, [state.onDeck, ready, reveal, rememberReveal]);

  /* every mutation is an action; the server validates, applies, broadcasts */
  const act = (type, payload, okMsg, options) => dispatch(type, payload, options).then(r => {
    if (!r.ok) notify(r.error || "Rejected");
    else if (okMsg) notify(okMsg);
    return r;
  });

  const saveProfile = (p, prof) => {
    act("saveProfile", { player: p, display: prof.display, num: prof.num, size: prof.size,
      flightsBooked: prof.flightsBooked, flightIn: prof.flightIn, flightOut: prof.flightOut });
    if (prof.photo) uploadPhoto(p, prof.photo).then(r => { if (!r?.ok) notify(r?.error || "Photo failed"); });
  };
  const setLive = on => act("setLive", { on });
  const saveSeeds = r => act("saveSeeds", { player: me, ratings: r });
  const saveResult = (ev, slots, options = {}) =>
    act("saveResult", { evId:ev.id, slots, ...options });
  const clearResult = (ev, correctionReason) =>
    act("clearResult", { evId:ev.id, confirmClear:true, correctionReason });
  const setOnDeck = id => act("setOnDeck", { id });
  const startEvent = ev => act("startEvent", { evId:ev.id }, `${ev.name} is underway`);
  const openResultEntry = async ev => {
    if (!state.results[ev.id] && resolveEventLifecycle(state, ev).phase !== "result-entry") {
      const opened = await act("beginResultEntry", { evId:ev.id });
      if (!opened.ok) return false;
    }
    setModal({ type:"result", ev });
    return true;
  };
  const shelveEvent = (id, on) => act("shelve", { id, on });
  const addCustomEvent = ev => act("addEvent", { ev });
  const editEvent = (id, patch) => act("editEvent", { id, patch }, "Saved");
  const reorderEvents = ids => act("reorderEvents", { ids });
  const removeCustomEvent = ev => {
    dispatch("removeEvent", { id: ev.id }).then(r => {
      if (!r.ok) return notify(r.error || "Rejected");
      undoRef.current = r.extra?.snapshot || null;
      notify(`${ev.name} removed`, { label:"Undo", fn: () => {
        const u = undoRef.current; if (!u) return;
        act("restoreEvent", { snapshot: u });
        undoRef.current = null; setToast(null);
      }});
    });
  };
  const runDraw = (ev, players, roles = []) => act("runDraw", { evId: ev.id, players, roles });
  const clearDraw = ev => act("clearDraw", { evId: ev.id });
  const startDraft = (evId, captains, players, roles = []) =>
    act("startDraft", { evId, captains, players, roles });
  const pickDraftPlayer = (evId, player) => act("pickDraftPlayer", { evId, player });
  const undoDraftPick = evId => act("undoDraftPick", { evId });
  const finalizeDraft = evId => act("finalizeDraft", { evId });
  const cancelDraft = evId => act("cancelDraft", { evId });
  const runStages = (ev, cfg) => act("runStages", { evId: ev.id, cfg });
  const clearStages = ev => act("clearStages", { evId: ev.id });
  const toggleThrough = (evId, g, key) => act("toggleThrough", { evId, g, key });
  const setFinalWinner = (evId, key) => act("setFinalWinner", { evId, key });
  const pickBracketWinner = (evId, r, m, teamIdx) => act("pickBracketWinner", { evId, r, m, teamIdx });
  const pickChip = (color, skin) => act("pickChip", { player: me, color, skin });
  const pokerSetup = () => act("pokerSetup", {});
  const pokerStart = () => act("pokerStart", {}, "Cards are live");
  const pokerLevelNudge = delta => act("pokerLevel", { delta });
  const pokerBust = player => act("pokerBust", { player });
  const pokerUnbust = player => act("pokerUnbust", { player });
  const pokerResult = () => act("pokerResult", {}, "Counts posted");
  const pokerCount = (player, count) => act("pokerCount", { player, count });
  const pokerCancel = () => act("pokerCancel", {}, "Table cleared");
  const sendDuel = (to, stake) => act("sendDuel", { to, game:"quickdraw", stake }, "Challenge sent");
  const playDuelRun = (id, ms, foul) => act("playDuel", { id, ms, foul });
  const declineDuel = id => act("declineDuel", { id }, "Declined");
  const voidDuel = id => act("voidDuel", { id }, "Duel voided");
  const placeWager = w => act("placeWager", { wager: w }, "Chip down", { retry:true });
  const retractWager = id => act("retractWager", { id }, "Chip back", { retry:true });
  const voidWager = id => act("voidWager", { id });
  const addAdjust = (player, delta, reason) => act("adjust", { player, delta, reason });
  const setFrozen = f => act("setFrozen", { f });
  const resetGame = () => act("resetTournament", {
    confirm:RESET_PROGRESS_CONFIRMATION,
  }, "Game progress reset");
  /* two taps AND an explicit force, because this is the only control that
     discards guest input. The dry run tells us how many people it costs. */
  const rerunOnboard = async () => {
    const probe = await dispatch("rerunOnboarding", {});
    const n = probe.extra?.signedUp?.length || 0;
    if (probe.ok) return notify("Check-in reopens on every phone");
    if (!n) return notify(probe.error || "Rejected");
    const who = probe.extra.signedUp.map(p => disp(state, p)).join(", ");
    if (!window.confirm(`${n} ${n === 1 ? "person has" : "people have"} checked in:\n${who}\n\n`
      + "Rerunning reopens the chip race and releases every claimed color.\nTheir names, numbers, sizes and flights are kept.\n\nRerun anyway?"))
      return notify("Left alone");
    act("rerunOnboarding", { force: true }, "Check-in reopens on every phone");
  };
  /* replay the whole flow on THIS device, from the install gate. Clears the
     local finished flags so a reload keeps replaying instead of snapping to
     the board: the epoch handshake is for the group, this is for one phone */
  const replayOnboardHere = () => {
    saveMine("si-onboard-v5", "");
    saveMine("si-onboard-epoch", "0");
    /* hand your color back so the re-pick is a real claim again */
    if (me && !state.live) act("pickChip", { player: me, color: null, skin: null });
    setModal(null);
    setOnboardStep(firstOnboardStep());
  };
  const toggleQa = () => {
    if (!qaAllowed) return notify("QA mode is unavailable");
    setQa(v => { saveMine("si-qa", v ? "no" : "yes"); return !v; });
  };

  /* ── QA simulation driver ──
     Plays the weekend through real actions on this device's socket, claiming
     each player in turn, so every connected phone and the TV see exactly the
     broadcasts a live weekend would produce. Always re-claims your identity. */
  const stateRef = useRef(state); stateRef.current = state;
  const simRef = useRef({ running:false, cancel:false, fast:false });
  const rnd = a => a[Math.floor(Math.random() * a.length)];
  const simWait = ms => new Promise((res, rej) => setTimeout(() =>
    simRef.current.cancel ? rej(new Error("stopped")) : res(), simRef.current.fast ? Math.min(ms, 120) : ms));
  const simDo = async (type, payload, lbl) => {
    if (simRef.current.cancel) throw new Error("stopped");
    if (lbl) setSim(lbl);
    const r = await dispatch(type, payload);
    if (!r.ok) throw new Error(r.error || type);
    return r;
  };
  /* per-player nice-to-haves (bets, chips, duel runs) go through simTry:
     one rejection skips that player, structural steps stay on simDo */
  const simTry = async (type, payload, lbl) => {
    if (simRef.current.cancel) throw new Error("stopped");
    if (lbl) setSim(lbl);
    return dispatch(type, payload);
  };
  const simCheckIn = async () => {
    for (const p of ROSTER) {
      const s = stateRef.current;
      const prof = s.profiles?.[p] || {};
      /* NEVER write over a real person. Once the invite is out, these slots
         hold answers Brandon is going to order shirts and plan pickups from,
         and filling a blank field with a plausible fake is worse than leaving
         it blank: nothing downstream can tell the two apart. A player is
         fair game only while every field is still empty. */
      const touched = prof.display || prof.num !== undefined || prof.size || prof.color
        || prof.skin || prof.flightsBooked !== undefined || prof.flightIn || prof.flightOut || s.seeds?.[p];
      if (touched) continue;
      const needProfile = true, needSeeds = true, needChip = true;
      await simDo("claim", { player: p }, `${p} checks in`);
      if (needProfile) {
        const taken = new Set(Object.entries(stateRef.current.profiles || {})
          .filter(([q]) => q !== p).map(([, pr]) => pr?.num).filter(n => n !== undefined));
        let num = prof.num !== undefined ? prof.num : ROSTER.indexOf(p) + 1;
        while (taken.has(num)) num = Math.floor(Math.random() * 100);
        await simDo("saveProfile", { player: p, display: prof.display || p,
          num, size: prof.size || rnd(SIZES), flightsBooked:false });
      }
      if (needSeeds) {
        const ratings = {}; SPORTS.forEach(sp => { ratings[sp.id] = rnd(RATINGS).v; });
        await simDo("saveSeeds", { player: p, ratings });
      }
      if (needChip) {
        const used = new Set(Object.values(stateRef.current.profiles || {}).map(pr => pr?.color));
        const open = CHIP_COLORS.filter(c => !used.has(c.hex));
        if (open.length) await simTry("pickChip", { player: p, color: rnd(open).hex, skin: rnd(CHIP_SKINS) });
      }
      await simWait(120);
    }
  };
  const simBetsRound = async () => {
    const evId = stateRef.current.onDeck;
    if (!evId) throw new Error("Open betting on an event first");
    for (const p of shuffle(ROSTER).slice(0, 9)) {
      const s = stateRef.current;
      const events2 = allEventsOf(s);
      const ev = events2.find(e => e.id === evId);
      if (!ev || s.results[evId] || s.onDeck !== evId) break;
      const pts = computeStandings(s).find(r => r.player === p)?.pts ?? 0;
      const exp = atRisk(s, p, events2);
      const room = Math.min(maxRisk(pts) - exp, pts - exp);
      if (room < PT) continue;
      const stake = Math.min(Math.floor(room / PT) * PT, rnd([PT, PT, 2 * PT, 2 * PT, 3 * PT, 5 * PT]));
      const draw = s.draws[evId];
      const st = s.stages[evId];
      const myIdx = draw ? draw.teams.findIndex(t => t.players.includes(p)) : -1;
      let wager = null;
      if (st && Math.random() < 0.5) {
        /* group bet on an undecided heat or pool; inside your own group you
           back yourself, mirroring the server's against-your-team rule */
        let gi = null, pickKey = null;
        for (const i of shuffle(st.groups.map((_, x) => x))) {
          const g = st.groups[i];
          if ((g.through || []).length >= st.advance) continue;
          const open = g.entrants.filter(k => !(g.through || []).includes(k));
          if (!open.length) continue;
          if (st.entrantType === "team" && g.entrants.includes(myIdx)) {
            if (open.includes(myIdx)) { gi = i; pickKey = myIdx; break; }
            continue;
          }
          gi = i; pickKey = st.entrantType === "solo" && open.includes(p) ? p : rnd(open);
          break;
        }
        if (gi === null) continue;
        const v = stageEntrantView(s, st, pickKey);
        wager = { kind:"stage", eventId:evId, evName:ev.name, stagesId:st.id, group:gi,
          groupName:st.groups[gi].name, pickKey, final:false, pickPlayers:[...v.players],
          pickTeam: st.entrantType === "team", stake };
      } else if (ev.kind === "solo") {
        const pick = rnd(ROSTER);
        wager = { kind:"outright", eventId:evId, evName:ev.name, pick, pickPlayers:[pick], pickTeam:false, stake };
      } else if (draw) {
        /* in a 2-team draw the server forbids backing the other side */
        const t = draw.teams.length === 2 && myIdx >= 0 ? myIdx : rnd(draw.teams.map((_, i) => i));
        wager = { kind:"outright", eventId:evId, evName:ev.name, pickTeam:true,
          pickPlayers:[...draw.teams[t].players], drawId:draw.id, stake };
      } else continue;
      await simDo("claim", { player: p });
      await simTry("placeWager", { wager },
        `${p} puts ${stake} on ${wager.kind === "stage" ? stageEntrantView(s, st, wager.pickKey).name
          : wager.pickTeam ? teamLabel(s, { players: wager.pickPlayers }) : wager.pick}`);
      await simWait(700);
    }
  };
  /* heats for a few solo events and pools for spike, so the stage machinery
     gets exercised; everything else keeps its native format */
  const SIM_HEAT_IDS = ["pingpong", "bball1", "beerio"];
  const simEnsureFormat = async ev => {
    const s = stateRef.current;
    if (s.results[ev.id]) return;
    if (ev.teamCfg && !s.draws[ev.id]) {
      const players = defaultQaParticipants(ev, ROSTER);
      const selected = new Set(players);
      const roles = ROSTER.filter(player => !selected.has(player))
        .map(player => ({ player, role:"sit-out" }));
      await simDo("runDraw", { evId: ev.id, players, roles }, `Drawing ${ev.name}`);
      await simWait(1300);
    }
    const s2 = stateRef.current;
    if (s2.stages[ev.id]) return;
    if (ev.kind === "solo" && SIM_HEAT_IDS.includes(ev.id)) {
      await simDo("runStages", { evId: ev.id, cfg: { kind:"heats", nGroups:3, advance:1, players: ROSTER } },
        `Splitting ${ev.name} into heats`);
      await simWait(600);
    } else if (ev.teamCfg && !ev.teamCfg.bracket && (s2.draws[ev.id]?.teams?.length ?? 0) >= 4) {
      await simDo("runStages", { evId: ev.id, cfg: { kind:"pools", nGroups:2, advance:1 } },
        `Splitting ${ev.name} into pools`);
      await simWait(600);
    }
  };
  const simAdvanceStages = async ev => {
    const st0 = stateRef.current.stages[ev.id];
    if (!st0) return;
    /* all groups first: toggleThrough resets the final winner */
    for (let gi = 0; gi < st0.groups.length; gi++) {
      for (;;) {
        const st = stateRef.current.stages[ev.id];
        const g = st?.groups?.[gi];
        if (!g || (g.through || []).length >= st.advance) break;
        const open = g.entrants.filter(k => !(g.through || []).includes(k));
        if (!open.length) break;
        await simDo("toggleThrough", { evId: ev.id, g: gi, key: rnd(open) },
          `Advancing ${g.name}`);
        await simWait(500);
      }
    }
    const st = stateRef.current.stages[ev.id];
    const finalists = stageFinalists(st);
    if (finalists && (st.finalWinner === null || st.finalWinner === undefined)) {
      await simDo("setFinalWinner", { evId: ev.id, key: rnd(finalists) }, `Deciding the ${ev.name} final`);
      await simWait(500);
    }
  };
  const simPlayEvent = async () => {
    await simCheckIn();
    if (!stateRef.current.live) await simDo("setLive", { on: true }, "The weekend goes live");
    const s0 = stateRef.current;
    const ev = allEventsOf(s0).find(e => !s0.results[e.id] && !s0.shelved[e.id]);
    if (!ev) throw new Error("Nothing left to play");
    if (ev.game === "poker" && ev.finale) throw new Error("The finale is poker, run it from the table");
    const table = AWARDS[ev.value] || [0, 0, 0];
    await simEnsureFormat(ev);
    await simDo("setOnDeck", { id: ev.id }, `Betting opens on ${ev.name}`);
    await simWait(600);
    await simBetsRound();
    await simDo("setOnDeck", { id:null }, `Betting locks on ${ev.name}`);
    await simDo("startEvent", { evId:ev.id }, `${ev.name} is underway`);
    let br = stateRef.current.brackets[ev.id];
    if (br) {
      for (let r = 0; r < br.rounds.length; r++) {
        for (let m = 0; m < br.rounds[r].length; m++) {
          const cur = stateRef.current.brackets[ev.id];
          const match = cur.rounds[r][m];
          if (match.winner !== null && match.winner !== undefined) continue;
          const a = resolveSlot(cur, match.a), b = resolveSlot(cur, match.b);
          if (a === null || b === null) continue;
          await simDo("pickBracketWinner", { evId: ev.id, r, m, teamIdx: rnd([a, b]) }, `Advancing the ${ev.name} bracket`);
          await simWait(900);
        }
      }
    }
    await simAdvanceStages(ev);
    const s1 = stateRef.current;
    const draw = s1.draws[ev.id];
    const st = s1.stages[ev.id];
    br = s1.brackets[ev.id];
    let slots;
    if (st && stageFinalists(st) && st.finalWinner !== null && st.finalWinner !== undefined) {
      /* podium from the stages: final winner, then the other finalists */
      const podium = [st.finalWinner, ...shuffle(stageFinalists(st).filter(k => k !== st.finalWinner))];
      slots = [0, 1, 2].map(i => table[i] > 0 && podium[i] !== undefined
        ? [...stageEntrantView(s1, st, podium[i]).players] : []);
      if (slots[0].length === 0) slots[0] = [...stageEntrantView(s1, st, podium[0]).players];
    } else if (br && draw) {
      const champ = bracketChampion(br);
      const final = br.rounds[br.rounds.length - 1][0];
      const a = resolveSlot(br, final.a), b = resolveSlot(br, final.b);
      const runner = champ === a ? b : a;
      /* third: a random semifinal loser when the table pays 3 deep */
      let third = null;
      if (table[2] > 0 && br.rounds.length >= 2) {
        const losers = br.rounds[br.rounds.length - 2]
          .map(mu => { const x = resolveSlot(br, mu.a), y = resolveSlot(br, mu.b);
            return mu.winner === x ? y : mu.winner === y ? x : null; })
          .filter(t => t !== null && t !== champ && t !== runner);
        third = losers.length ? rnd(losers) : null;
      }
      slots = [[...draw.teams[champ].players],
        table[1] > 0 && runner !== null ? [...draw.teams[runner].players] : [],
        third !== null ? [...draw.teams[third].players] : []];
    } else if (draw) {
      const order = shuffle(draw.teams.map((_, i) => i));
      slots = [[...draw.teams[order[0]].players],
        table[1] > 0 && order[1] !== undefined ? [...draw.teams[order[1]].players] : [],
        table[2] > 0 && order[2] !== undefined ? [...draw.teams[order[2]].players] : []];
    } else {
      const order = shuffle(ROSTER);
      slots = [[order[0]], table[1] > 0 ? [order[1]] : [], table[2] > 0 ? [order[2]] : []];
    }
    await simDo("beginResultEntry", { evId:ev.id }, `Opening the ${ev.name} scorecard`);
    await simDo("saveResult", { evId: ev.id, slots }, `Posting the ${ev.name} result`);
    await simWait(800);
  };
  const simFastForward = async () => {
    for (let i = 0; i < 20; i++) {
      const s = stateRef.current;
      const nxt = allEventsOf(s).find(e => !s.results[e.id] && !s.shelved[e.id]);
      if (!nxt || nxt.finale) return;
      await simPlayEvent();
    }
  };
  /* duels between sim players; me never sends, so my 3-a-day stays free */
  const simDuelPools = s => {
    const events2 = allEventsOf(s);
    const rows = computeStandings(s);
    const live = (s.duels || []).filter(d => d.status === "open" && !resolveDuel(d).settled);
    const day = 24 * 60 * 60 * 1000;
    const spendable = p => (rows.find(r => r.player === p)?.pts ?? 0)
      - atRisk(s, p, events2)
      - live.filter(d => d.from === p || d.to === p).reduce((t, d) => t + d.stake, 0);
    const canSend = p => p !== me && spendable(p) >= DUEL_STAKE
      && (s.duels || []).filter(d => d.from === p && d.status !== "declined" && d.ts > Date.now() - day).length < 3;
    const canFace = (a, b) => !live.find(d => (d.from === a && d.to === b) || (d.from === b && d.to === a));
    return { spendable, canSend, canFace };
  };
  const simDuelRun = () => Math.random() < 0.1
    ? { ms: 40, foul: true } : { ms: 160 + Math.floor(Math.random() * 300) };
  const simDuels = async (n = 3) => {
    for (let i = 0; i < n; i++) {
      const s = stateRef.current;
      if (pokerLive(s) || s.frozen) return;
      const { spendable, canSend, canFace } = simDuelPools(s);
      const senders = shuffle(ROSTER.filter(canSend));
      let from = null, to = null;
      for (const f of senders) {
        const tos = ROSTER.filter(q => q !== f && q !== me && spendable(q) >= DUEL_STAKE && canFace(f, q));
        if (tos.length) { from = f; to = rnd(tos); break; }
      }
      if (!from) return;
      await simDo("claim", { player: from });
      const r = await simTry("sendDuel", { to, game:"quickdraw" }, `${from} challenges ${to}`);
      if (!r.ok) continue;
      await simWait(400);
      const duel = (stateRef.current.duels || []).find(d =>
        d.from === from && d.to === to && d.status === "open" && !d.runs?.[from]);
      if (!duel) continue;
      await simTry("playDuel", { id: duel.id, ...simDuelRun() }, `${from} draws`);
      await simDo("claim", { player: to });
      await simTry("playDuel", { id: duel.id, ...simDuelRun() }, `${to} plays`);
      await simWait(600);
    }
  };
  const simDuelMe = async () => {
    if (!me) throw new Error("Pick who you are first");
    const s = stateRef.current;
    if (pokerLive(s)) throw new Error("The finale is live");
    if (s.frozen) throw new Error("The board is frozen");
    const { canSend, canFace } = simDuelPools(s);
    const from = rnd(ROSTER.filter(p => canSend(p) && canFace(p, me)));
    if (!from) throw new Error("Nobody can afford a challenge");
    await simDo("claim", { player: from });
    await simDo("sendDuel", { to: me, game:"quickdraw" }, `${from} challenges you`);
    await simWait(300);
    const duel = (stateRef.current.duels || []).find(d =>
      d.from === from && d.to === me && d.status === "open" && !d.runs?.[from]);
    if (duel) await simTry("playDuel", { id: duel.id, ...simDuelRun() });
  };
  /* clean book: void whatever is still pending so the poker gate opens */
  const simSettleBook = async () => {
    const s = stateRef.current;
    const events2 = allEventsOf(s);
    for (const w of s.wagers) {
      if (resolveWager(s, w, events2).status === "pending")
        await simDo("voidWager", { id: w.id }, "Voiding open wagers");
    }
    for (const d of s.duels || []) {
      if (d.status === "open" && !resolveDuel(d).settled)
        await simDo("voidDuel", { id: d.id }, "Voiding open duels");
    }
    await simWait(300);
    for (const row of computeStandings(stateRef.current)) {
      if (row.pts < 0)
        await simDo("adjust", { player: row.player, delta: Math.ceil(-row.pts / PT) * PT, reason: "QA" },
          "Clearing negative stacks");
    }
  };
  const simPokerAlive = () => ROSTER.filter(q =>
    !(stateRef.current.poker?.outs || []).some(o => o.player === q));
  const simPokerNight = async ({ through = "result" } = {}) => {
    await simFastForward();
    await simSettleBook();
    if (!stateRef.current.poker) {
      await simDo("pokerSetup", {}, "Setting the table");
      await simWait(400);
    }
    if (through === "setup") return;
    if (!stateRef.current.poker?.startedAt) {
      await simDo("pokerStart", {}, "Start the table");
      await simWait(400);
    }
    for (let b = 0; b < 4 && simPokerAlive().length > 3; b++) {
      const pool = simPokerAlive().filter(q => q !== me);
      if (!pool.length) break;
      await simDo("pokerBust", { player: rnd(pool) }, "Busting a player");
      await simWait(500);
    }
    const poker = stateRef.current.poker;
    const done = poker.counts || {};
    if (through === "live") {
      for (const q of shuffle(simPokerAlive().filter(q => q !== me && done[q] === undefined)).slice(0, 2)) {
        await simDo("pokerCount", { player: q, count: rnd([40, 60, 80, 100]) * CHIP_MIN }, `${q} counts down`);
        await simWait(300);
      }
      return;
    }
    /* exact chip split of what the counted stacks have not claimed yet */
    const todo = simPokerAlive().filter(q => done[q] === undefined);
    if (todo.length) {
      const counted = Object.values(done).reduce((a, b) => a + b, 0);
      let left = Math.max(0, Math.floor((poker.total - counted) / CHIP_MIN));
      const weights = todo.map(() => 0.2 + Math.random());
      const wsum = weights.reduce((a, b) => a + b, 0);
      for (let i = 0; i < todo.length; i++) {
        const share = i === todo.length - 1 ? left
          : Math.min(left, Math.round(left * weights[i] / wsum));
        left -= share;
        await simDo("pokerCount", { player: todo[i], count: share * CHIP_MIN }, `${todo[i]} counts down`);
        await simWait(250);
      }
    }
    await simDo("pokerResult", {}, "Posting the counts");
    await simWait(400);
  };
  const simCrown = async () => {
    await simPokerNight({ through: "result" });
    if (!stateRef.current.frozen) await simDo("setFrozen", { f: true }, "Crowning the champion");
  };
  const simOpenBetting = async () => {
    const s = stateRef.current;
    const ev = allEventsOf(s).find(e => !s.results[e.id] && !s.shelved[e.id]);
    if (!ev || (ev.finale && ev.game === "poker")) return;
    await simEnsureFormat(ev);
    await simDo("setOnDeck", { id: ev.id }, `Betting opens on ${ev.name}`);
    await simWait(400);
    await simBetsRound();
  };
  const runSim = (fn, fast = false) => () => {
    if (simRef.current.running) return;
    simRef.current = { running: true, cancel: false, fast };
    (async () => {
      try { await fn(); setSim(null); notify("Sim complete"); }
      catch (e) { setSim(null); notify(e.message === "stopped" ? "Sim stopped" : "Sim halted: " + e.message); }
      finally { simRef.current.running = false; if (me) dispatch("claim", { player: me }); }
    })();
  };
  const stopSim = () => { simRef.current.cancel = true; };
  /* checkpoints: where the board is on the weekend's arc, derived only */
  const simRank = s => {
    const evs = allEventsOf(s);
    const finale = evs.find(e => e.finale && e.game === "poker");
    const rest = evs.filter(e => !e.finale && !s.shelved[e.id]);
    const early = rest.filter(e => e.session === "fri" || e.session === "sam");
    if (s.frozen) return 7;
    if (finale && s.results[finale.id]) return 6;
    if (pokerLive(s)) return 5;
    if (s.poker) return 4;
    if (rest.length && rest.every(e => s.results[e.id])) return 3.5;
    if (early.length && early.every(e => s.results[e.id])) return 3;
    if (Object.keys(s.results).length || s.onDeck) return 2;
    if (s.live) return 1;
    return 0;
  };
  const QA_PRESETS = [
    { key:"locker", name:"Locker room", rank:0, note:`All ${ROSTER.length} checked in, chips claimed, not live`,
      run: simCheckIn },
    { key:"betting", name:"Betting open", rank:2, note:"Live, first event on deck, bets down",
      run: async () => {
        await simCheckIn();
        if (!stateRef.current.live) await simDo("setLive", { on:true }, "The weekend goes live");
        await simOpenBetting();
      } },
    { key:"midsat", name:"Mid-Saturday", rank:3, note:"Friday and Sat AM played, duels settled",
      run: async () => {
        for (let i = 0; i < 12; i++) {
          const s = stateRef.current;
          const nxt = allEventsOf(s).find(e => !s.results[e.id] && !s.shelved[e.id]);
          if (!nxt || nxt.finale || (nxt.session !== "fri" && nxt.session !== "sam")) break;
          await simPlayEvent();
        }
        await simDuels(3);
        await simOpenBetting();
      } },
    { key:"tableset", name:"Table set", rank:4, note:"Everything played, no open wagers, buy-ins posted",
      run: () => simPokerNight({ through:"setup" }) },
    { key:"pokerlive", name:"Poker live", rank:5, note:"Clock running, busts in, counts started",
      run: () => simPokerNight({ through:"live" }) },
    { key:"crowned", name:"Champion crowned", rank:7, note:"Stacks are the standings, board frozen",
      run: simCrown },
  ];
  const jumpTo = pre => {
    setModal(null);
    runSim(async () => {
      if (simRank(stateRef.current) > pre.rank) {
        await simDo("resetTournament", {
          confirm:RESET_PROGRESS_CONFIRMATION,
        }, "Resetting game progress");
        await simWait(400);
      }
      await pre.run();
    }, true)();
  };
  /* standalone helpers refuse to poke a table with cards in the air */
  const qaGuard = fn => () => {
    const s = stateRef.current;
    if (pokerLive(s)) return notify("The finale is live");
    if (s.frozen) return notify("The board is frozen");
    runSim(fn)();
  };
  const unlockGm = pin => dispatch("gmUnlock", { pin }).then(r => {
    if (!r.ok) return notify(r.error || "Wrong passcode");
    setGmToken(r.extra?.gmToken); setGm(true); saveMine("si-gm", "yes");
    setModal(null); notify("Commissioner mode on");
  });
  const switchPlayer = (p, close = true) => {
    setMe(p);
    saveMine("si-me", p);
    dispatch("claim", { player:p });
    if (close) setModal(null);
    notify(`Now viewing as ${p}`, null, undefined, p);
  };


  const gmNext = (() => {
    if (!gmView || state.frozen || !ready) return null;
    const { event:ev, nextAction } = weekendOperation;
    if (!ev || nextAction?.type === "crown-champion")
      return { label:"Crown the champion", run:() => setModal({type:"freeze"}) };
    if (!nextAction) return null;
    const run = {
      "setup-poker":() => { pokerSetup(); setModal({type:"pokerBuyin"}); },
      "start-poker":() => setModal({type:"pokerBuyin"}),
      "run-poker":() => setModal({type:"pokerResult"}),
      "post-poker-result":() => setModal({type:"pokerResult"}),
      "prepare-draw":() => setModal({type:"event", ev}),
      "continue-draft":() => setModal({type:"event", ev}),
      "open-betting":() => setOnDeck(ev.id),
      "lock-betting":() => setOnDeck(null),
      "start-event":() => startEvent(ev),
      "advance-bracket":() => setModal({type:"bracket", ev}),
      "advance-stages":() => setModal({type:"event", ev}),
      "enter-result":() => openResultEntry(ev),
      "post-result":() => setModal({type:"result", ev}),
    }[nextAction.type];
    return run ? { label:nextAction.label, run } : null;
  })();

  if (tv) {
    return (
      <Shell tv environment={environment}>
        <TVMode standings={standings} state={state} events={events} onDeckEv={onDeckEv} allTied={allTied}
          champion={champion} coChamps={coChamps} onExit={() => setTv(false)} />
        {intro && (() => {
          const iev = events.find(e => e.id === intro);
          return iev && !state.results[iev.id]
            ? <EventIntro state={state} ev={iev} big auto handoff={introHasQueuedReveal}
                onClose={() => setIntro(null)} /> : null;
        })()}
        {reveal && <Reveal key={reveal.id} state={state} reveal={reveal} big auto onClose={closeReveal} />}
        <Confetti burst={burst} />
      </Shell>
    );
  }

  if (onboardStep < 99) {
    return (
      <Shell environment={environment}>
        <Onboarding step={onboardStep} me={me} state={state} onTv={() => setTv(true)} onChip={pickChip}
          pick={p => { setMe(p); saveMine("si-me", p); dispatch("claim", { player: p }); }}
          saveProfile={prof => saveProfile(me, prof)}
          submitSeeds={saveSeeds}
          next={() => setOnboardStep(s => s + 1)}
          done={() => { setOnboardStep(99); saveMine("si-onboard-v5","yes");
            saveMine("si-onboard-epoch", String(state.onboardEpoch || 0));
            setTab("board"); setBurst(b => b + 1); }} />
        <Confetti burst={burst} />
      </Shell>
    );
  }

  return (
    <Shell environment={environment}>
      {/* header: night chrome framing the paper below */}
      <div style={{ position:"sticky", top:0, zIndex:40, background:"var(--chrome)",
        backdropFilter:"blur(14px)", borderBottom:"1px solid var(--chrome-line)",
        paddingTop:"env(safe-area-inset-top)" }}>
        <div style={{ padding:"10px 16px 9px", display:"flex", alignItems:"center", gap:10 }}>
          <button onClick={() => setModal({type:"profile"})} aria-label="Your profile"
            style={{ background:"none", border:"none", padding:0, cursor:"pointer" }}>
            {me ? <Avatar state={state} p={me} size={38} /> : null}
          </button>
          <div style={{ flex:1, display:"flex", alignItems:"center", gap:9 }}>
            <FDMark size={30} variant="night" />
            <div style={{ lineHeight:1 }}>
              <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:24, letterSpacing:"0.015em",
                textTransform:"uppercase", color:"var(--bone)" }}>Field Day</div>
              <div style={{ fontFamily:SANS, fontWeight:700, fontSize:10, letterSpacing:"0.14em",
                color:"var(--night-text)", marginTop:2 }}>SCOTTSDALE · 2026</div>
            </div>
          </div>
          <button onClick={() => setTv(true)} title="TV mode" aria-label="TV mode"
            style={{ background:"transparent", border:"1.5px solid var(--ghost-line)", borderRadius:10,
              width:38, height:38, cursor:"pointer", color:"var(--bone)",
              display:"flex", alignItems:"center", justifyContent:"center" }}><IconTV /></button>
          <button onClick={() => !gm ? setModal({type:"pin"})
            : guestLens ? (setGuestLens(false), notify("GM view")) : setModal({type:"gmMenu"})} aria-label="Commissioner"
            style={{ background: gmView ? "var(--sun)" : "transparent",
              border:"1.5px solid " + (gmView ? "var(--sun)" : "var(--ghost-line)"), borderRadius:10,
              width:38, height:38, cursor:"pointer", color: gmView ? "var(--ink0)" : "var(--bone)",
              display:"flex", alignItems:"center", justifyContent:"center" }}><IconGM filled={gmView} /></button>
        </div>
        {!connected && loaded && (
          <div role="status" aria-live="polite" style={{ display:"flex", alignItems:"center", gap:8, margin:"0 16px 10px",
            padding:"7px 13px", borderRadius:10, background:"rgba(192,71,58,0.2)",
            border:"1px solid rgba(192,71,58,0.5)" }}>
            <span style={{ width:7, height:7, borderRadius:99, background:"var(--clay)", animation:"si-pulse 1.2s infinite" }} />
            <span style={{ fontFamily:SANS, fontWeight:700, fontSize:11, letterSpacing:"0.12em",
              color:"var(--bone)", textTransform:"uppercase" }}>Reconnecting</span>
          </div>
        )}
        {wagerEv && (
          <button onClick={() => setTab("bets")}
            style={{ display:"flex", alignItems:"center", gap:10, width:"calc(100% - 32px)", margin:"0 16px 10px",
            padding:"9px 13px", borderRadius:14, border:"1px solid rgba(240,176,47,0.4)",
            background:"rgba(240,176,47,0.14)", cursor:"pointer", textAlign:"left" }}>
            <GameMark id={wagerEv.game} size={26} />
            <span style={{ fontFamily:SANS, fontWeight:700, fontSize:11, letterSpacing:"0.16em", color:"var(--sun)" }}>
              {wagerMarketOpen ? "ON DECK" : "WAGER BOARD"}</span>
            <span style={{ fontFamily:SANS, fontWeight:600, fontSize:14, color:"var(--bone)", flex:1 }}>{wagerEv.name}</span>
            <span style={{ fontFamily:SANS, fontWeight:700, fontSize:11, letterSpacing:"0.05em",
              textTransform:"uppercase", padding:"3px 8px", borderRadius:6,
              color:wagerMarketOpen ? "var(--ink0)" : "var(--sun)",
              background:wagerMarketOpen ? "var(--sun)" : "rgba(240,176,47,0.12)",
              border:wagerMarketOpen ? "none" : "1px solid rgba(240,176,47,0.45)" }}>
              {wagerMarketOpen ? "Betting open" : "Betting locked"}</span>
          </button>
        )}
      </div>

      <div style={{ flex:1, overflowY:"auto",
        paddingTop: gm && qaActive && qaTop && !qaMin ? 112 : 12,
        paddingBottom:`calc(${gm && qaActive && !qaMin && !qaTop ? 160 : 92}px + env(safe-area-inset-bottom))` }}>
        {tab === "board" && (<>
          {me && !state.frozen && (
            <div style={{ padding:"0 16px" }}>
              <DuelStrip state={state} me={me} gm={gmView}
                onPlay={id => setModal({type:"duelPlay", id})}
                onDecline={declineDuel} onVoid={voidDuel} />
            </div>
          )}
          {state.poker && !state.frozen && (
            <div style={{ padding:"0 16px" }}>
              <PokerCard state={state} standings={standings} me={me} gm={gmView}
                onBuyin={() => setModal({type:"pokerBuyin"})}
                onStart={pokerStart} onCancel={pokerCancel}
                onLevel={pokerLevelNudge} onBust={pokerBust} onUnbust={pokerUnbust}
                onCount={pokerCount} onReview={() => setModal({type:"pokerResult"})} />
            </div>
          )}
          {state.live
            ? <Board state={state} standings={standings} me={me} deltas={deltas} allTied={allTied}
                champion={champion} coChamps={coChamps} gm={gmView} events={events}
                myAtRisk={me ? atRisk(state, me, events) : 0}
                onOpen={ev => setModal({type:"event", ev})}
                onAdjust={p => setModal({type:"adjust", player:p})}
                onChallenge={p => setModal({type:"player", p})}
                onFreeze={() => setModal({type:"freeze"})} onUnfreeze={() => setFrozen(false)}
                finaleDone={!!state.results[events.find(e => e.finale)?.id]} />
            : <LockerRoom state={state} me={me} gm={gmView}
                onProfile={() => setModal({type:"profile"})} onStart={() => setLive(true)}
                onLogistics={vals => act("saveLogistics", vals, "Trip details saved")}
                onSize={(p, sz) => act("saveProfile", { player: p, display: state.profiles?.[p]?.display || p, size: sz })}
                onNotify={notify}
                onChallenge={p => setModal({type:"player", p})} />}

        </>)}
        {tab === "sched" && <Schedule state={state} events={events} gm={gmView}
          open={ev => setModal({type:"event", ev})} onAdd={() => setModal({type:"addEvent"})}
          onReorder={reorderEvents} />}
        {tab === "bets" && <Wagers state={state} me={me} standings={standings} gm={gmView} events={events}
          onDeckEv={onDeckEv} wagerEv={wagerEv}
          onEvents={() => setTab("sched")}
          onPick={pick => placeWager({ ...pick, stake: pick.stake || PT })}
          onRetract={id => retractWager(id)}
          onVoid={ids => { (Array.isArray(ids) ? ids : [ids]).forEach(id => voidWager(id)); notify("Wager voided"); }} />}
        {tab === "guide" && <Guide events={events} state={state} />}
      </div>

      {gmNext && !modal && (
        <button onClick={gmNext.run} style={{ position:"fixed", right:14, zIndex:56,
          bottom:`calc(${gm && qaActive && !qaMin && !qaTop ? 172
            : tab === "bets" && me && onDeckEv && !state.frozen ? 148 : 74}px + env(safe-area-inset-bottom))`,
          display:"flex", alignItems:"center", gap:8, background:"var(--night)", color:BONE,
          border:"1px solid var(--bone-line)", borderRadius:99, padding:"11px 18px", cursor:"pointer",
          boxShadow:"var(--shadow-2)", maxWidth:"78vw" }}>
          <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:16, letterSpacing:"0.04em",
            textTransform:"uppercase", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            {gmNext.label}</span>
          <span style={{ fontFamily:SANS, fontWeight:700, fontSize:14, color:"var(--sun)" }}>›</span>
        </button>
      )}
      {gm && qaActive && <QABar me={me} status={qaStatus} onExit={toggleQa}
        minimized={qaMin} onMin={() => setQaMin(v => { saveMine("si-qa-min", v ? "no" : "yes"); return !v; })}
        top={qaTop} onPos={() => setQaTop(v => { saveMine("si-qa-pos", v ? "bottom" : "top"); return !v; })}
        sim={sim} onStop={stopSim} guestLens={guestLens}
        onLens={() => setGuestLens(v => { notify(v ? "GM view" : "Guest view"); return !v; })}
        onOpen={() => setModal({ type:"qa" })}
        onPlayNext={runSim(simPlayEvent)} />}

      {/* tab bar: night chrome, sun pill marks the active tab */}
      <div style={{ position:"fixed", bottom:0, left:0, right:0, display:"flex", justifyContent:"center", zIndex:50 }}>
        <div style={{ width:"100%", maxWidth:540, display:"flex", background:"var(--chrome)",
          backdropFilter:"blur(16px)", borderTop:"1px solid var(--chrome-line)",
          padding:"8px 10px calc(12px + env(safe-area-inset-bottom))" }}>
          {[["board","Board"],["sched","Events"],["bets","Bets"],["guide","Rules"]].map(([id,lb]) => (
            <button key={id} onClick={() => setTab(id)} aria-current={tab === id ? "page" : undefined}
              style={{ flex:1, background:"none", border:"none",
              cursor:"pointer", padding:"7px 0" }}>
              <div style={{ fontFamily:SANS, fontWeight:700, fontSize:12.5, letterSpacing:"0.04em",
                textTransform:"uppercase",
                color: tab===id ? "var(--ink0)" : "var(--night-text)",
                background: tab===id ? "var(--sun)" : "transparent",
                borderRadius:99, padding:"8px 14px", display:"inline-block" }}>{lb}</div>
            </button>
          ))}
        </div>
      </div>

      {/* modals */}
      {modal?.type === "pin" && <PinSheet onClose={() => setModal(null)} unlock={unlockGm} />}
      {modal?.type === "profile" && <ProfileSheet state={state} me={me} onClose={() => setModal(null)} onChip={pickChip}
        save={prof => { saveProfile(me, prof); setModal(null); notify("Profile saved"); }} />}
      {modal?.type === "gmMenu" && (
        <Sheet title="Commissioner" onClose={() => setModal(null)}>
          <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
            {state.onDeck && (
              <Btn kind="danger" onClick={() => { setOnDeck(null); setModal(null); notify("Betting closed"); }}>
                Close betting</Btn>
            )}
            <Btn kind="dark" onClick={() => { setLive(!state.live); setModal(null); }}>
              {state.live ? "Back to the locker room" : "Start the weekend"}</Btn>
            {qaAllowed && <Btn kind="dark" onClick={() => { toggleQa(); setModal(null); }}>
              {qa ? "QA mode off" : "QA mode"}</Btn>}
            {progressResetAllowed && (
              <Btn kind="danger" onClick={() => setModal({type:"resetProgress"})}>
                Reset game progress</Btn>
            )}
            {capabilities.snapshotExport && <Btn kind="dark" onClick={async () => {
              const exported = await downloadSnapshot();
              notify(exported.ok ? `Snapshot exported from ${exported.metadata.environment}`
                : exported.error || "Export failed");
            }}>Export snapshot</Btn>}
            <Btn kind="dark" onClick={() => { setGm(false); saveMine("si-gm","no"); setModal(null); }}>Exit GM</Btn>
            {state.frozen
              ? <Btn kind="danger" onClick={() => { setFrozen(false); setModal(null); }}>Unfreeze board</Btn>
              : <Btn onClick={() => setModal({type:"freeze"})}>Crown the champion</Btn>}
          </div>
        </Sheet>
      )}
      {modal?.type === "event" && <EventSheet ev={events.find(e => e.id === modal.ev.id) || modal.ev} state={state} gm={gmView}
        onClose={() => setModal(null)}
        enterResult={() => openResultEntry(modal.ev)}
        clearRes={async reason => {
          const cleared = await clearResult(modal.ev, reason);
          if (cleared.ok) {
            setModal(null);
            notify("Result cleared for correction. Betting stays closed.");
          }
        }}
        onEdit={patch => editEvent(modal.ev.id, patch)}
        onDraw={(players, roles) => { runDraw(modal.ev, players, roles); setModal(null); }}
        onClearDraw={() => clearDraw(modal.ev)}
        onStages={cfg => { runStages(modal.ev, cfg); setModal(null); }}
        onClearStages={() => clearStages(modal.ev)}
        onThrough={(g,k) => toggleThrough(modal.ev.id, g, k)}
        onFinal={k => setFinalWinner(modal.ev.id, k)}
        onDeckToggle={() => { setOnDeck(state.onDeck === modal.ev.id ? null : modal.ev.id); }}
        onStart={() => startEvent(modal.ev)}
        onShelve={on => { shelveEvent(modal.ev.id, on); setModal(null); }}
        onRemove={() => { setModal(null); removeCustomEvent(modal.ev); }}
        openBracket={() => setModal({type:"bracket", ev:modal.ev})}
        openDraft={(pool, roles) => setModal({type:"draft", ev:modal.ev, pool, roles})} />}
      {modal?.type === "bracket" && <BracketSheet ev={modal.ev} state={state} gm={gmView}
        onClose={() => setModal({type:"event", ev:modal.ev})}
        onPick={(r,m,t) => pickBracketWinner(modal.ev.id, r, m, t)}
        onPostResult={() => openResultEntry(modal.ev)} />}
      {modal?.type === "draft" && <DraftSheet ev={events.find(e => e.id === modal.ev.id) || modal.ev}
        state={state} gm={gmView} me={me} standings={standings} pool={modal.pool}
        onClose={() => setModal({type:"event", ev:modal.ev})}
        onStart={(captains, players) => startDraft(modal.ev.id, captains, players, modal.roles)}
        onPick={player => pickDraftPlayer(modal.ev.id, player)}
        onUndo={() => undoDraftPick(modal.ev.id)}
        onFinalize={() => { finalizeDraft(modal.ev.id); setModal(null); }}
        onCancel={() => { cancelDraft(modal.ev.id); setModal({type:"event", ev:modal.ev}); }} />}
      {modal?.type === "result" && <ResultSheet ev={events.find(e => e.id === modal.ev.id) || modal.ev} state={state}
        onClose={() => setModal(null)}
        save={async (slots, options) => {
          const saved = await saveResult(modal.ev, slots, options);
          if (saved.ok) {
            setModal(null);
            notify(saved.extra?.unchanged
              ? `${modal.ev.name} result is unchanged`
              : `${modal.ev.name} posted, wagers settled`);
          }
          return saved;
        }} />}
      {modal?.type === "addEvent" && <AddEventSheet state={state} onClose={() => setModal(null)}
        save={ev => { addCustomEvent(ev); setModal(null); notify(`${ev.name} added`); }} />}
      {modal?.type === "pokerBuyin" && <PokerBuyinSheet state={state} standings={standings} gm={gmView}
        onClose={() => setModal(null)} onStart={() => { pokerStart(); setModal(null); }} />}
      {modal?.type === "pokerResult" && <PokerResultSheet state={state} onClose={() => setModal(null)}
        onCount={pokerCount} onBust={pokerBust} onUnbust={pokerUnbust}
        onPost={() => { pokerResult(); setModal(null); }} />}
      {modal?.type === "player" && <PlayerSheet state={state} me={me} p={modal.p} standings={standings} events={events}
        onClose={() => setModal(null)}
        onDuel={stake => { sendDuel(modal.p, stake); setModal(null); }} />}
      {modal?.type === "duelPlay" && <QuickDrawGame state={state} me={me}
        duel={(state.duels || []).find(d => d.id === modal.id)}
        onSubmit={playDuelRun}
        onClose={() => setModal(null)} />}
      {modal?.type === "adjust" && <AdjustSheet player={modal.player} onClose={() => setModal(null)}
        save={(d,r) => { addAdjust(modal.player, d, r); setModal(null); notify(`${modal.player} ${d>0?"+":""}${d}`); }} />}
      {qaAllowed && modal?.type === "qa" && <QASheet rank={simRank(state)} presets={QA_PRESETS} busy={!!sim}
        status={qaStatus} me={me} guestLens={guestLens}
        onSwitch={player => switchPlayer(player, false)}
        onLens={() => setGuestLens(v => { notify(v ? "GM view" : "Guest view"); return !v; })}
        onJump={jumpTo} pokerOn={pokerLive(state)}
        onPlayNext={() => { setModal(null); runSim(simPlayEvent)(); }}
        onDuelMe={() => { setModal(null); qaGuard(simDuelMe)(); }}
        onDuels={() => { setModal(null); qaGuard(() => simDuels(3))(); }}
        onBets={() => { setModal(null); qaGuard(simBetsRound)(); }}
        onBustOne={() => { const pool = simPokerAlive().filter(q => q !== me); if (pool.length) pokerBust(pool[Math.floor(Math.random() * pool.length)]); }}
        onCountRest={async () => {
          const p = state.poker; if (!p) return;
          const done = p.counts || {};
          const todo = simPokerAlive().filter(q => q !== me && done[q] === undefined);
          if (!todo.length) return notify("Everyone else is counted");
          const counted = Object.values(done).reduce((a, b) => a + b, 0);
          const meIn = done[me] === undefined && simPokerAlive().includes(me) ? 1 : 0;
          let left = Math.max(0, Math.floor((p.total - counted) / CHIP_MIN));
          const per = Math.floor(left / (todo.length + meIn));
          for (const q of todo) { await pokerCount(q, Math.min(left, per) * CHIP_MIN); left -= Math.min(left, per); }
          notify(meIn ? "Counts in, yours is the last one" : "Counts in");
        }}
        onRerun={() => { rerunOnboard(); setModal(null); }}
        onReplayMine={() => { replayOnboardHere(); setModal(null); }}
        onResetRequest={() => setModal({type:"resetProgress"})}
        onClose={() => setModal(null)} />}
      {progressResetAllowed && modal?.type === "resetProgress" && (
        <ResetProgressSheet state={state} environment={environment} busy={!!sim}
          onClose={() => setModal(null)}
          onConfirm={async () => {
            const reset = await resetGame();
            if (!reset.ok) return;
            setIntro(null);
            setReveal(null);
            setModal(null);
            setTab("board");
          }} />
      )}
      {modal?.type === "freeze" && (
        <Sheet title="Crown the champion" onClose={() => setModal(null)}>
          <p style={pStyle}>Freezes the board and crowns <b style={{color:"var(--accent2)"}}>{disp(state, standings[0]?.player)}</b> at {fmt(standings[0]?.pts)} points. All betting closes.</p>
          {!state.results[events.find(e => e.finale)?.id] && <p style={{...pStyle, color:"var(--live2)"}}>No Finale result yet.</p>}
          <div style={{ display:"flex", gap:10 }}>
            <Btn onClick={() => { setFrozen(true); setModal(null); setTab("board"); }}>Freeze the board</Btn>
            <Btn kind="ghost" onClick={() => setModal(null)}>Not yet</Btn>
          </div>
        </Sheet>
      )}

      {toast && (
        <div role="status" aria-live="polite" style={{ position:"fixed", bottom:"calc(98px + env(safe-area-inset-bottom))", left:"50%", transform:"translateX(-50%)", zIndex:150,
          display:"flex", alignItems:"center", gap:10,
          background:"var(--night2)",
          border:"1px solid " + (toast.tone === "gold" ? "rgba(240,176,47,0.45)" : "var(--bone-line)"), borderRadius:99,
          color: toast.tone === "gold" ? "var(--sun)" : "var(--bone)", padding:"8px 16px 8px 9px", fontFamily:SANS, fontWeight:600, fontSize:14,
          whiteSpace:"nowrap", boxShadow:"var(--shadow-3)", animation:"si-up .2s ease-out" }}>
          {toast.chip ? (
            <span style={{ display:"flex", alignItems:"center", gap:6 }}>
              <BankChip p={toast.chip} size={26} />
              {state.profiles?.[toast.chip]?.num != null && (
                <span style={{ fontFamily:DISPLAY, fontWeight:700, fontStyle:"italic", fontSize:16,
                  color:"var(--night-text)" }}>#{state.profiles[toast.chip].num}</span>
              )}
            </span>
          ) : <FDMark size={24} variant="night" />}
          {toast.msg}
          {toast.action && <button onClick={toast.action.fn} style={{ background:"none", border:"none",
            color:"var(--sun)", fontFamily:SANS, fontWeight:700, fontSize:14, cursor:"pointer",
            textTransform:"uppercase", letterSpacing:"0.08em", padding:0 }}>{toast.action.label}</button>}
        </div>
      )}
      {intro && onboardStep >= 99 && (() => {
        const iev = events.find(e => e.id === intro);
        return iev && !state.results[iev.id] ? (
          <EventIntro state={state} ev={iev} handoff={introHasQueuedReveal} onClose={() => setIntro(null)}
            onBets={!introHasQueuedReveal && state.onDeck === iev.id
              ? () => { setIntro(null); setTab("bets"); } : null} />
        ) : null;
      })()}
      {reveal && <Reveal key={reveal.id} state={state} reveal={reveal} onClose={closeReveal}
        onBets={state.onDeck === reveal.evId && !state.results[reveal.evId]
          ? () => { closeReveal(); setTab("bets"); } : null} />}
      <Confetti burst={burst} />
      {!loaded && <LoadingScreen />}
    </Shell>
  );
}

/* event intro: when betting opens, the event announces itself on every phone
   and the TV: phase band, game mark, name, and the game's hero animation. */
function EventIntro({ state, ev, big, auto, handoff, onClose, onBets }) {
  const ph = phaseOf(ev);
  const session = SESSIONS.find(s => s.id === ev.session);
  const format = ev.finale ? "Finale" : ev.kind === "solo" ? "Individual"
    : ev.kind === "pairs" ? "Pairs" : "Team event";
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    if (!auto) return;
    const t = setTimeout(() => closeRef.current(), prefersReducedMotion() ? 2200 : 7000);
    return () => clearTimeout(t);
  }, [auto]);
  return (
    <div className="si-event-intro" onClick={auto ? undefined : onClose}
      style={{ position:"fixed", inset:0, zIndex:290, background:"rgba(23,16,9,0.985)",
        display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
        padding:"calc(28px + env(safe-area-inset-top)) 22px calc(28px + env(safe-area-inset-bottom))",
        overflowY:"auto" }}>
      <div aria-hidden="true" style={{ position:"absolute", inset:"0 0 auto", height:5, background:ph.bg }} />
      <div style={{ display:"inline-flex", alignItems:"center", gap:9, color:"var(--night-text)",
        animation:"si-intro-copy .35s .08s both" }}>
        <span style={{ width:7, height:7, borderRadius:99, background:ph.bg }} />
        <span style={{ fontFamily:SANS, fontWeight:700, fontSize:big ? 15 : 11,
          letterSpacing:"0.16em", textTransform:"uppercase" }}>
          On deck{session ? ` · ${session.label}` : ""}{ev.value ? ` · ${ev.value} pts` : ""}
        </span>
      </div>
      <div style={{ margin:big ? "18px 0 2px" : "10px 0 0" }}>
        <EventSpotlight gameId={ev.game} big={big} />
      </div>
      <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize: big ? "clamp(56px,7vw,110px)" : 44,
        lineHeight:0.92, textAlign:"center", textTransform:"uppercase", color:BONE,
        maxWidth:big ? 1050 : 430, animation:"si-intro-copy .45s .28s both" }}>{ev.name}</div>
      <div style={{ fontFamily:SANS, fontWeight:700, fontSize:big ? 15 : 11.5,
        letterSpacing:"0.14em", textTransform:"uppercase", color:ph.bg, marginTop:big ? 15 : 10,
        animation:"si-intro-copy .4s .4s both" }}>{format}</div>
      {ev.desc && <div style={{ fontFamily:SANS, fontSize:big ? "clamp(15px,1.45vw,20px)" : 14,
        lineHeight:1.55, color:"var(--night-text)", textAlign:"center", maxWidth:big ? 720 : 355,
        marginTop:big ? 18 : 13, animation:"si-intro-copy .4s .52s both" }}>{ev.desc}</div>}
      {handoff && <div style={{ display:"inline-flex", alignItems:"center", gap:8, fontFamily:SANS,
        fontWeight:700, fontSize:big ? 14 : 11.5, letterSpacing:"0.14em", textTransform:"uppercase",
        color:"var(--sun)", marginTop:big ? 26 : 20, animation:"si-intro-copy .3s .65s both" }}>
        <span className="si-event-dot" /><span className="si-event-dot si-event-dot-2" />
        <span className="si-event-dot si-event-dot-3" /> Drawing teams
      </div>}
      {!auto && !handoff && (
        <div onClick={e => e.stopPropagation()}
          style={{ display:"flex", gap:10, marginTop:24, animation:"si-intro-copy .3s .7s both" }}>
          {onBets && <Btn onClick={onBets} style={{ fontSize:16, padding:"13px 28px" }}>To the bets</Btn>}
          <Btn kind={onBets ? "ghost" : "primary"} onClick={onClose} style={{ fontSize:16, padding:"13px 28px" }}>Close</Btn>
        </div>
      )}
    </div>
  );
}

/* ─────────── shell ─────────── */
function Shell({ children, tv, environment = "production" }) {
  return (
    <div className="si-vh" style={{ background:"var(--bg)", display:"flex", justifyContent:"center" }}>
      <style>{`
        :root {
          color-scheme:dark;
          /* Field Day tokens, full night. Surfaces are warm near-black card
             stock; --ink is now the primary TEXT color (bone). --ink0 is the
             absolute brown-black for marks, chips, and anything on sun. */
          --bg:#171009; --paper:#241B12; --paper2:#332619; --line:rgba(251,243,228,0.13);
          --ink:#F4EAD9; --ink0:#2A2119; --muted:#A08F76; --muted2:#C9B896; --disabled:#6F5F4A;
          /* phase + signal palette: pool (Fri), sun (Sat AM), terracotta (Sat PM), clay (Sat night), night (Finale) */
          --accent:#C25832; --accent2:#D97A50; --sun:#F0B02F; --pool:#4694A8;
          --olive:#8A945C; --clay:#C0473A; --live2:#D45A48; --green:#6E9450;
          /* night family: reveals, champion, TV, sheet bands */
          --night:#251C14; --night2:#3A2C1E; --night-deep:#171009;
          --bone:#FBF3E4; --night-text:#C9B896; --night-text2:#8D7A5F;
          /* medals */
          --silver:#8C99A4; --bronze:#C08454;
          /* alpha tints, recomputed from the canonical hexes above */
          --sun-tint:rgba(240,176,47,0.16); --clay-tint:rgba(192,71,58,0.18);
          --green-tint:rgba(110,148,80,0.16); --accent-tint:rgba(194,88,50,0.16);
          --ink-tint:rgba(251,243,228,0.05); --bone-line:rgba(251,243,228,0.16);
          /* bone alphas with jobs: ghost button borders, chip skin marks,
             night-card dividers; clay alpha for danger borders */
          --ghost-line:rgba(251,243,228,0.3); --chip-mark:rgba(251,243,228,0.75);
          --night-line:rgba(251,243,228,0.12); --danger-line:rgba(192,71,58,0.4);
          /* deep warm shadow scale; never pure black */
          --shadow-1:0 2px 10px rgba(10,6,3,0.5);
          --shadow-2:0 8px 24px rgba(10,6,3,0.6);
          --shadow-3:0 14px 40px rgba(10,6,3,0.7);
          /* chrome: a shade deeper than the canvas */
          --chrome:rgba(16,11,7,0.93); --chrome-line:rgba(251,243,228,0.13);
        }
        * { box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
        body { margin:0; background:var(--bg); -webkit-font-smoothing:antialiased; text-rendering:optimizeLegibility; }
        button:active:not(:disabled) { transform: scale(0.97); }
        button:focus-visible, a:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible {
          outline:3px solid var(--sun); outline-offset:3px;
        }
        input::placeholder { color:var(--muted); }
        @keyframes si-fall { to { transform: translateY(110vh) translateX(var(--drift)) rotate(720deg); opacity:0.7; } }
        @keyframes si-pulse { 0%,100% { opacity:1; } 50% { opacity:0.25; } }
        @keyframes si-up { from { transform: translateY(26px); opacity:0; } to { transform:none; opacity:1; } }
        @keyframes si-in { from { opacity:0; transform: translateY(8px); } to { opacity:1; transform:none; } }
        @keyframes si-fade { from { opacity:0; } to { opacity:1; } }
        @keyframes si-flag { 0% { opacity:0; transform: translateY(30px) scale(0.92); } 60% { transform: translateY(-4px) scale(1.015); } 100% { opacity:1; transform:none; } }
        @keyframes si-shine { 0% { transform: translateX(-120%) skewX(-18deg);} 100% { transform: translateX(240%) skewX(-18deg);} }
        @keyframes si-tick { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @keyframes si-glow { 0%,100% { box-shadow:0 0 26px rgba(194,88,50,0.22);} 50% { box-shadow:0 0 50px rgba(192,71,58,0.32);} }
        @keyframes si-pop { 0% { transform:scale(1); } 40% { transform:scale(1.22); } 100% { transform:scale(1); } }
        @keyframes si-intro-mark {
          0% { opacity:0; transform:scale(0.78) rotate(-4deg); }
          68% { opacity:1; transform:scale(1.025) rotate(0deg); }
          100% { opacity:1; transform:scale(1); }
        }
        @keyframes si-intro-ring {
          0% { opacity:0; transform:scale(0.66); }
          28% { opacity:0.48; }
          100% { opacity:0; transform:scale(1.45); }
        }
        @keyframes si-intro-rule {
          from { opacity:0; transform:scaleX(0); }
          to { opacity:0.62; transform:scaleX(1); }
        }
        @keyframes si-intro-copy {
          from { opacity:0; transform:translateY(10px); }
          to { opacity:1; transform:none; }
        }
        @keyframes si-event-dot {
          0%, 58%, 100% { opacity:0.28; transform:translateY(0); }
          28% { opacity:1; transform:translateY(-3px); }
        }
        .si-event-ring {
          position:absolute; inset:19%; border:1px solid rgba(240,176,47,0.5);
          border-radius:31%; animation:si-intro-ring 1.35s 0.08s ease-out both;
        }
        .si-event-ring-2 { inset:8%; animation-delay:0.22s; }
        .si-event-rule {
          position:absolute; top:50%; width:44px; height:1px; background:var(--sun);
          animation:si-intro-rule 0.48s 0.32s ease-out both;
        }
        .si-event-rule-left { right:calc(50% + 66px); transform-origin:right; }
        .si-event-rule-right { left:calc(50% + 66px); transform-origin:left; }
        .si-event-mark { position:relative; z-index:1; animation:si-intro-mark 0.58s cubic-bezier(.2,.85,.28,1) both; }
        .si-event-dot {
          display:inline-block; width:5px; height:5px; border-radius:50%; background:var(--sun);
          animation:si-event-dot 1.05s ease-in-out infinite;
        }
        .si-event-dot-2 { animation-delay:0.13s; }
        .si-event-dot-3 { animation-delay:0.26s; }
        @keyframes si-die-arc {
          0%   { transform: translate(0px,30px)   rotate(0deg); }
          12%  { transform: translate(18px,2px)   rotate(80deg); }
          24%  { transform: translate(38px,-12px) rotate(160deg); }
          36%  { transform: translate(58px,-6px)  rotate(240deg); }
          48%  { transform: translate(78px,12px)  rotate(310deg); }
          56%  { transform: translate(90px,30px)  rotate(350deg); }
          64%  { transform: translate(102px,14px) rotate(380deg); }
          74%  { transform: translate(114px,10px) rotate(400deg); }
          84%  { transform: translate(126px,24px) rotate(415deg); }
          90%, 100% { transform: translate(132px,30px) rotate(420deg); }
        }
        @keyframes si-pong-arc {
          0%   { transform: translate(0px,26px);   opacity:1; }
          30%  { transform: translate(50px,-12px); opacity:1; }
          55%  { transform: translate(96px,0px);   opacity:1; }
          70%  { transform: translate(116px,16px); opacity:1; }
          80%, 100% { transform: translate(121px,30px); opacity:0; }
        }
        @keyframes si-flip-cup {
          0%, 14%   { transform: translate(0,0) rotate(0deg); }
          44%       { transform: translate(0,-26px) rotate(-120deg); }
          62%       { transform: translate(0,-6px) rotate(-180deg); }
          70%       { transform: translate(0,0) rotate(-180deg); }
          76%       { transform: translate(0,-4px) rotate(-180deg); }
          82%, 100% { transform: translate(0,0) rotate(-180deg); }
        }
        @keyframes si-putt {
          0%        { transform: translate(0,0); }
          72%       { transform: translate(122px,0); }
          84%       { transform: translate(126px,2px); }
          92%, 100% { transform: translate(127px,12px); }
        }
        @keyframes si-cue {
          0%, 12%   { transform: translate(0,0); }
          42%, 100% { transform: translate(56px,0); }
        }
        @keyframes si-eight {
          0%, 42%   { transform: translate(0,0); }
          88%, 100% { transform: translate(64px,0); }
        }
        @keyframes si-bball {
          0%, 10%   { transform: translate(0,0); }
          48%       { transform: translate(66px,-42px); }
          72%       { transform: translate(128px,-24px); }
          84%       { transform: translate(133px,-6px); }
          94%, 100% { transform: translate(134px,4px); }
        }
        @keyframes si-spike {
          0%, 14%   { transform: translate(0,0); }
          52%       { transform: translate(72px,38px); }
          58%       { transform: translate(78px,34px); }
          100%      { transform: translate(158px,-18px); }
        }
        @keyframes si-pingpong {
          0%        { transform: translate(0,0); }
          22%       { transform: translate(28px,-14px); }
          46%       { transform: translate(56px,16px); }
          64%       { transform: translate(84px,-16px); }
          84%       { transform: translate(110px,14px); }
          100%      { transform: translate(128px,-4px); }
        }
        @keyframes si-foosman {
          0%, 30%   { transform: translate(0,0); }
          40%       { transform: translate(0,-9px); }
          48%, 100% { transform: translate(0,0); }
        }
        @keyframes si-foos {
          0%, 46%   { transform: translate(0,0); }
          72%, 100% { transform: translate(138px,0); }
        }
        @keyframes si-volley {
          0%, 10%   { transform: translate(0,0); }
          52%       { transform: translate(74px,-38px); }
          82%       { transform: translate(134px,6px); }
          90%       { transform: translate(142px,-2px); }
          100%      { transform: translate(148px,6px); }
        }
        @keyframes si-pickle {
          0%, 8%    { transform: translate(0,0); }
          30%       { transform: translate(38px,6px); }
          56%       { transform: translate(76px,-18px); }
          82%       { transform: translate(110px,6px); }
          100%      { transform: translate(126px,-2px); }
        }
        @keyframes si-kart {
          0%        { transform: translate(-16px,0); }
          30%       { transform: translate(38px,0); }
          38%       { transform: translate(52px,-8px); }
          46%       { transform: translate(66px,0); }
          78%       { transform: translate(112px,0); }
          100%      { transform: translate(148px,0); }
        }
        @keyframes si-rage {
          0%        { transform: translate(0,0); }
          38%       { transform: translate(48px,42px); }
          52%       { transform: translate(56px,30px); }
          72%       { transform: translate(72px,26px); }
          88%, 100% { transform: translate(74px,32px); }
        }
        @keyframes si-deal1 {
          0%        { transform: translate(-90px,-40px) rotate(-40deg); opacity:0; }
          22%       { opacity:1; }
          38%, 100% { transform: translate(0,0) rotate(0deg); opacity:1; }
        }
        @keyframes si-deal2 {
          0%, 20%   { transform: translate(-110px,-40px) rotate(-40deg); opacity:0; }
          40%       { opacity:1; }
          58%, 100% { transform: translate(0,0) rotate(0deg); opacity:1; }
        }
        @keyframes si-chip-in {
          0%, 55%   { transform: translate(0,0); }
          80%       { transform: translate(112px,-2px); }
          88%       { transform: translate(118px,0); }
          100%      { transform: translate(118px,0); }
        }
        @keyframes si-gauntlet {
          0%        { transform: translate(0,0); }
          18%       { transform: translate(24px,-16px); }
          30%       { transform: translate(40px,0); }
          44%       { transform: translate(60px,-16px); }
          54%       { transform: translate(78px,0); }
          66%       { transform: translate(96px,-16px); }
          76%       { transform: translate(112px,0); }
          88%       { transform: translate(134px,-18px); }
          100%      { transform: translate(152px,-2px); }
        }
        /* the prize: flat blades rotated around one axis read as a solid */
        @keyframes si-trophy { from { transform: rotateY(0deg); } to { transform: rotateY(360deg); } }
        /* routes draw themselves in, then a chip runs the line */
        @keyframes si-route { from { stroke-dashoffset: var(--len); } to { stroke-dashoffset: 0; } }
        @keyframes si-land { 0%,100% { r:3.4; opacity:1; } 50% { r:5.2; opacity:0.55; } }
        @media (prefers-reduced-motion: reduce) { * { animation:none !important; transition:none !important; } }
        ::-webkit-scrollbar { width:0; height:0; }
        /* dvh tracks the visible viewport (browser bars come and go); vh is the fallback */
        .si-vh { min-height:100vh; min-height:100dvh; }
        .si-sheet { max-height:90vh; max-height:90dvh; }
      `}</style>
      <div className="si-vh" style={{ width:"100%", maxWidth: tv ? "100%" : 540, display:"flex",
        flexDirection:"column", position:"relative",
        background:"radial-gradient(120% 50% at 50% -6%, var(--sun-tint) 0%, transparent 60%), var(--bg)" }}>
        {!tv && <div style={{ position:"fixed", inset:0, pointerEvents:"none", backgroundImage:GRAIN, zIndex:1000, mixBlendMode:"screen", opacity:0.6 }} />}
        {environment !== "production" && (
          <div aria-label={`${environment} environment`} style={{ position:"fixed", top:"calc(6px + env(safe-area-inset-top))",
            left:8, zIndex:2000, pointerEvents:"none", borderRadius:999, padding:"5px 9px",
            background:"var(--clay)", color:"var(--bone)", border:"1px solid var(--bone)",
            boxShadow:"var(--shadow-1)", fontFamily:SANS, fontWeight:800, fontSize:10,
            letterSpacing:"0.14em", textTransform:"uppercase" }}>{environment}</div>
        )}
        {children}
      </div>
    </div>
  );
}

/* install UI: native prompt where the browser offers one, instructions where it never will */
function InstallHint() {
  const [, bump] = useState(0);
  useEffect(() => onInstallReady(() => bump(x => x + 1)), []);
  if (installEvt) return <Btn onClick={() => installEvt.prompt()} style={{ alignSelf:"flex-start" }}>Add to home screen</Btn>;
  if (isIOS()) return (
    <div>
      {[["1","Tap the Share button in Safari"],["2","Tap Add to Home Screen"]].map(([n,t]) => (
        <div key={n} style={{ display:"flex", gap:12, alignItems:"center", padding:"7px 0" }}>
          <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:19, color:"var(--accent2)" }}>{n}</span>
          <span style={{ fontFamily:SANS, fontSize:16, color:"var(--ink)" }}>{t}</span>
        </div>
      ))}
    </div>
  );
  return <div style={{ fontFamily:SANS, fontSize:16, color:"var(--ink)" }}>
    In your browser menu, choose Add to Home Screen.</div>;
}

/* ─────────── onboarding ─────────── */
const ONBOARD_STEPS = 6;
function InviteProgress({ step, kicker }) {
  return (
    <div style={{ marginBottom:10 }}>
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        <div style={{ ...label, flex:1 }}>{kicker}</div>
        <div style={{ fontFamily:SANS, fontWeight:700, fontSize:10.5, letterSpacing:"0.1em",
          textTransform:"uppercase", color:"var(--muted)" }}>{step} of {ONBOARD_STEPS}</div>
      </div>
      <div style={{ display:"flex", gap:5, marginTop:7 }} aria-hidden="true">
        {Array.from({ length:ONBOARD_STEPS }, (_, i) => i + 1).map(i => <div key={i} style={{ height:3, borderRadius:9, flex:1,
          background:i <= step ? "var(--accent)" : "var(--line)" }} />)}
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div role="status" aria-live="polite" style={{ position:"fixed", inset:0, background:"var(--bg)", zIndex:500,
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:18,
      padding:24, textAlign:"center" }}>
      <div style={{ animation:"si-pulse 1.6s ease-in-out infinite" }}><Wordmark size={34} /></div>
      <div>
        <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:18, letterSpacing:"0.04em",
          textTransform:"uppercase", color:"var(--ink)" }}>Opening the invitation</div>
        <div style={{ fontFamily:SANS, fontSize:12.5, color:"var(--muted)", marginTop:5 }}>
          Loading the latest trip details…</div>
      </div>
    </div>
  );
}

/* The mechanics are the invitation's trailer. Four cards tell one escalating
   story without creating a second onboarding flow: play, bet, challenge, then
   carry the whole score into the finale. The next card stays visible at the
   edge so the horizontal rail explains itself. */
function OnboardingMechanics({ me }) {
  const rival = ROSTER.find(p => p !== me);
  const cards = [
    {
      n:"01", title:"Collect points",
      body:"Everyone starts at 1,000. Win events and land bets. Whatever you have Saturday night becomes your poker stack.",
      art:(
        <div style={{ display:"flex", alignItems:"center" }}>
          {["putting","pong","basketball"].map((id, i) => (
            <span key={id} style={{ marginLeft:i ? -11 : 0, transform:`rotate(${(i - 1) * 5}deg)` }}>
              <GameMark id={id} size={66} />
            </span>
          ))}
        </div>
      ),
    },
    {
      n:"02", title:"Betting",
      body:"Every event can be bet on. Only half your points can be at risk at one time.",
      art:(
        <div style={{ display:"flex", alignItems:"center" }}>
          {[100,400,1000].map((v, i) => (
            <span key={v} style={{ marginLeft:i ? -11 : 0, transform:`translateY(${i === 1 ? -9 : 0}px)` }}>
              <BankChip p={me} size={62} val={v} />
            </span>
          ))}
        </div>
      ),
    },
    {
      n:"03", title:"Duels",
      body:"Challenge anyone to Quick Draw. You name the ante, and the fastest tap takes the pot.",
      art:(
        <div style={{ display:"flex", alignItems:"center", gap:9 }}>
          <BankChip p={me} size={60} />
          <svg width="34" height="53" viewBox="0 0 27 42" aria-hidden="true">
            <path d="M16 2 5 23h7l-2 17 13-24h-8z" fill="var(--sun)"
              stroke="var(--ink0)" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
          <BankChip p={rival} size={60} />
        </div>
      ),
    },
    {
      n:"04", title:"The trophy",
      body:"The winner of the poker finale is the Field Day champion and takes home the Scottsdale 2026 trophy.",
      art:<TrophyHero size={170} plate="2026" />,
    },
  ];
  return (
    <div>
      <div style={{ ...label, margin:"17px 2px 9px" }}>How it works</div>
      <div role="list" aria-label="How Field Day works"
        style={{ display:"flex", gap:9, overflowX:"auto", scrollSnapType:"x mandatory",
          overscrollBehaviorX:"contain", scrollbarWidth:"none", margin:"0 -6px", padding:"0 6px 5px" }}>
        {cards.map((c, i) => (
          <div key={c.n} role="listitem" style={{ position:"relative", minWidth:"min(82vw, 294px)",
            height:"clamp(240px, 35vh, 300px)", scrollSnapAlign:"start", overflow:"hidden", borderRadius:14,
            padding:"13px 14px", background:i === 3
              ? "radial-gradient(100% 100% at 85% 0%, var(--sun-tint), transparent 58%), var(--night)"
              : "var(--paper)", border:i === 3 ? "1px solid rgba(240,176,47,.42)" : "1px solid var(--line)" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:12, color:"var(--accent2)" }}>{c.n}</span>
            </div>
            <div style={{ position:"absolute", right:8, top:37, width:190, height:136,
              display:"grid", placeItems:"center", transform:i === 3 ? "translateY(-3px)" : "none" }}>
              {c.art}
            </div>
            <div style={{ position:"absolute", left:14, right:14, bottom:13 }}>
              <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:23, lineHeight:1,
                textTransform:"uppercase", color:"var(--ink)", maxWidth:220 }}>{c.title}</div>
              <div style={{ fontFamily:SANS, fontSize:12, lineHeight:1.42,
                color:"var(--muted2)", marginTop:6, maxWidth:238 }}>{c.body}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Onboarding({ step, me, state, pick, saveProfile, submitSeeds, next, done, onTv, onChip }) {
  const [ratings, setRatings] = useState({});
  const [display, setDisplay] = useState("");
  const [photo, setPhoto] = useState(null);
  const [num, setNum] = useState("");
  const [size, setSize] = useState(null);
  const [flightsBooked, setFlightsBooked] = useState(null);
  const [flightIn, setFlightIn] = useState(null);
  const [flightOut, setFlightOut] = useState(null);
  useEffect(() => {
    if (!me) return;
    const pr = state.profiles?.[me];
    setDisplay(pr?.display || me);
    setNum(pr?.num != null ? String(pr.num) : "");
    setSize(pr?.size ?? null);
    /* Check-in asks the question fresh, even on a replay. Keep saved legs so
       choosing Yes reveals them, but do not pre-answer on the guest's behalf. */
    setFlightsBooked(null);
    setFlightIn(pr?.flightIn || null);
    setFlightOut(pr?.flightOut || null);
    /* a replay must not make anyone re-rate themselves from scratch: seed the
       form with whatever they already sealed */
    setRatings(state.seeds?.[me] ? { ...state.seeds[me] } : {});
  }, [me]); // eslint-disable-line
  /* install lives at step -1, BEFORE check-in: the installed app gets its own
     fresh storage, so anything set up in the browser first would be lost */
  const lg = state.logistics || {};
  if (step === -1) return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", animation:"si-in .3s ease-out",
      padding:"calc(48px + env(safe-area-inset-top)) 22px calc(24px + env(safe-area-inset-bottom))" }}>
      <div style={label}>Scottsdale · {EDITION.short}, 2026</div>
      <div style={{ margin:"10px 0 26px" }}><Wordmark size={46} /></div>
      <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:34, lineHeight:1.05,
        color:"var(--ink)", marginBottom:10 }}>Take Field Day with you</div>
      <div style={{ fontFamily:SANS, color:"var(--muted2)", fontSize:16, lineHeight:1.6, marginBottom:22 }}>
        Add it to your home screen for live scores, draws, bets, and alerts all weekend.
      </div>
      <InstallHint />
      <div style={{ fontFamily:SANS, fontSize:12.5, color:"var(--muted)", marginTop:18, lineHeight:1.6 }}>
        Open it from your home screen to finish your two-minute check-in.
      </div>
      <div style={{ marginTop:"auto" }}>
        <Btn kind="ghost" onClick={next} style={{ width:"100%" }}>Skip, stay in the browser</Btn>
      </div>
    </div>
  );
  if (step === 0) return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", animation:"si-in .3s ease-out",
      padding:"calc(40px + env(safe-area-inset-top)) 22px calc(24px + env(safe-area-inset-bottom))" }}>
      <InviteProgress step={1} kicker="Your invitation" />
      <div style={{ margin:"8px 0 18px" }}><Wordmark size={44} /></div>
      <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:30, lineHeight:1.05,
        color:"var(--ink)", marginBottom:7 }}>Claim your spot</div>
      <div style={{ fontFamily:SANS, fontSize:13.5, color:"var(--muted2)", lineHeight:1.55, marginBottom:18 }}>
        Pick your name to unlock the trip details and give me the additional information I’ll need for logistics. It’ll only take ~2 minutes.
      </div>
      <div style={{ ...label, marginBottom:10 }}>Who are you?</div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,minmax(0,1fr))", gap:8, marginBottom:"auto" }}>
        {ROSTER.map((p, i) => <PlayerChip key={p} name={p} selected={me===p}
          onClick={() => pick(p)} style={centeredGridCell(i, ROSTER.length)} />)}
      </div>
      <Btn disabled={!me} onClick={next} style={{ width:"100%", fontSize:16, padding:"15px" }}>
        {me ? `Continue as ${me}` : "Pick your name"}</Btn>
      {onTv && <button onClick={onTv} style={{ background:"none", border:"none", cursor:"pointer", marginTop:14,
        fontFamily:SANS, fontWeight:600, fontSize:12.5, color:"var(--accent2)", alignSelf:"center" }}>
        TV mode</button>}
    </div>
  );
  /* The mechanics get a full beat of their own. The travel map follows on the
     next screen so neither has to compete for attention. */
  if (step === 1) return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", animation:"si-in .3s ease-out",
      height:"100dvh", minHeight:0, maxHeight:"100dvh",
      padding:"calc(40px + env(safe-area-inset-top)) 22px calc(24px + env(safe-area-inset-bottom))" }}>
      <InviteProgress step={2} kicker={EDITION.long} />
      <div style={{ flex:1, overflowY:"auto", margin:"0 -6px", padding:"0 6px 8px" }}>
        <div style={{ margin:"6px 0 12px" }}><Wordmark size={39} /></div>
        <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:31, lineHeight:1.04,
          color:"var(--ink)", marginBottom:8 }}>The bachelor party is a tournament</div>
        <div style={{ fontFamily:SANS, fontSize:14, lineHeight:1.55, color:"var(--muted2)" }}>
          {ROSTER.length} players, {allEventsOf(state).filter(e => !e.finale).length} events, one board.
          {" "}Win events and land bets to collect points all weekend,
          then your points become your chips at the poker finale. Whoever wins the poker table is the Field Day champion.
        </div>
        <OnboardingMechanics me={me} />
      </div>
      <Btn onClick={next} style={{ width:"100%", fontSize:16, padding:"15px", marginTop:10 }}>Continue</Btn>
    </div>
  );
  if (step === 2) return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", animation:"si-in .3s ease-out",
      height:"100dvh", minHeight:0, maxHeight:"100dvh",
      padding:"calc(40px + env(safe-area-inset-top)) 22px calc(24px + env(safe-area-inset-bottom))" }}>
      <InviteProgress step={3} kicker="The roster" />
      <div style={{ margin:"8px 0 2px" }}><Wordmark size={39} /></div>
      <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:32, lineHeight:1.04,
        color:"var(--ink)", margin:"12px 0 8px" }}>Thank you for flying in for this!</div>
      <div style={{ fontFamily:SANS, fontSize:14, lineHeight:1.55, color:"var(--muted2)" }}>
        {ROSTER.length} players coming in from {TRAVEL_CITIES.length} cities.
      </div>
      <div style={{ flex:1, minHeight:0, minWidth:0, width:"100%", overflow:"hidden",
        display:"flex", alignItems:"center", margin:"12px -6px 0", padding:"0 6px" }}>
        <TravelMap />
      </div>
      <Btn onClick={next} style={{ width:"100%", fontSize:16, padding:"15px", marginTop:10 }}>Continue</Btn>
    </div>
  );
  /* The address and flights live here. Size and travel
     go straight to the roster so the host stops chasing texts */
  if (step === 3) return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", animation:"si-in .3s ease-out",
      padding:"calc(40px + env(safe-area-inset-top)) 22px calc(24px + env(safe-area-inset-bottom))" }}>
      <InviteProgress step={4} kicker="The details" />
      <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:32, color:"var(--ink)", margin:"6px 0 14px" }}>
        Getting there</div>
      <div style={{ flex:1, overflowY:"auto", margin:"0 -6px", padding:"0 6px 10px" }}>
        <VenueCard lg={lg} />
        {/* everything above is Brandon telling you things; everything below is
            you telling him. One panel, its own edge, so the switch is obvious */}
        <div style={{ border:"1.5px solid var(--bone-line)", borderRadius:16, padding:"14px 14px 16px",
          background:"var(--paper)", marginTop:4 }}>
          <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:24, letterSpacing:"0.02em",
            textTransform:"uppercase", color:"var(--ink)", lineHeight:1.05, marginBottom:12 }}>
            Information I need</div>
          <TravelFields booked={flightsBooked} setBooked={setFlightsBooked}
            flightIn={flightIn} setFlightIn={setFlightIn}
            flightOut={flightOut} setFlightOut={setFlightOut} />
          <SizeRow lb="T-shirt size" value={size} onPick={setSize} />
        </div>
      </div>
      <div style={{ marginTop:12 }}>
        <Btn disabled={!size || flightsBooked === null} onClick={() => { saveProfile({ display: (display || me).trim() || me,
            size, flightsBooked, flightIn, flightOut }); next(); }}
          style={{ width:"100%", fontSize:16, padding:"15px" }}>Continue</Btn>
      </div>
    </div>
  );
  if (step === 4) return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", animation:"si-in .3s ease-out",
      padding:"calc(40px + env(safe-area-inset-top)) 22px calc(24px + env(safe-area-inset-bottom))" }}>
      <InviteProgress step={5} kicker="Your card" />
      <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:32, color:"var(--ink)", margin:"6px 0 16px" }}>
        Set up your profile</div>
      <div style={{ flex:1, overflowY:"auto", margin:"0 -6px", padding:"0 6px 10px" }}>
        <ProfileEditor state={state} me={me} display={display} setDisplay={setDisplay} photo={photo} setPhoto={setPhoto}
          num={num} setNum={setNum} showSize={false} onChip={onChip} />
      </div>
      <div style={{ marginTop:12 }}>
        <Btn disabled={!display.trim() || !state.profiles?.[me]?.color} onClick={() => { saveProfile({ display: display.trim(),
            num: num === "" ? null : Number(num), ...(photo ? {photo} : {}) }); next(); }}
          style={{ width:"100%", fontSize:16, padding:"15px" }}>Continue</Btn>
      </div>
    </div>
  );
  if (step === 5) {
    const complete = SPORTS.every(s => ratings[s.id] !== undefined);
    const rated = SPORTS.filter(s => ratings[s.id] !== undefined).length;
    const fillAverage = () => setRatings(Object.fromEntries(SPORTS.map(s => [s.id, 2])));
    return (
      <div style={{ flex:1, display:"flex", flexDirection:"column", animation:"si-in .3s ease-out",
        padding:"calc(40px + env(safe-area-inset-top)) 20px calc(24px + env(safe-area-inset-bottom))" }}>
        <InviteProgress step={6} kicker="Private scouting report" />
        <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:32, color:"var(--ink)", margin:"0 0 6px" }}>Rate yourself</div>
        <div style={{ fontFamily:SANS, fontSize:14, color:"var(--muted2)", lineHeight:1.55, marginBottom:11 }}>
          These stay private. They’re only used to make fair teams.
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
          <div role="status" aria-live="polite" style={{ fontFamily:SANS, fontWeight:700, fontSize:12.5,
            color:complete ? "var(--green)" : "var(--muted)", flex:1 }}>{rated} of {SPORTS.length} rated</div>
          {!complete && <button onClick={fillAverage} style={{ background:"none", border:"none", padding:"4px 0",
            cursor:"pointer", fontFamily:SANS, fontWeight:700, fontSize:11.5, letterSpacing:"0.04em",
            color:"var(--accent2)" }}>Mark all Average</button>}
        </div>
        <div style={{ flex:1, overflowY:"auto", marginBottom:14 }}>
          {[["sport","Sports"],["drink","Drinking games"]].map(([gid, glabel]) => (
          <div key={gid}>
          <div style={{ ...label, margin: gid === "sport" ? "0 0 7px" : "18px 0 7px" }}>{glabel}</div>
          <div aria-hidden="true" style={{ display:"grid", gridTemplateColumns:"88px minmax(0,1fr)", gap:10,
            alignItems:"end", marginBottom:2 }}>
            <span />
            <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:5 }}>
              {["Never","Rough","Avg","Solid","Elite"].map(x => <span key={x} style={{ fontFamily:SANS,
                fontWeight:700, fontSize:8.5, letterSpacing:"0.02em", textAlign:"center",
                color:"var(--muted)", whiteSpace:"nowrap" }}>{x}</span>)}
            </div>
          </div>
          {SPORTS.filter(s => s.group === gid).map(s => {
            const idx = RATINGS.findIndex(r => r.v === ratings[s.id]);
            return (
              <div key={s.id} style={{ display:"grid", gridTemplateColumns:"88px minmax(0,1fr)", alignItems:"center",
                gap:10, padding:"10px 0",
                borderBottom:"1px solid var(--line)" }}>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontFamily:SANS, fontWeight:700, fontSize:13.5, color:"var(--ink)",
                    lineHeight:1.15 }}>{s.label}</div>
                  <div style={{ fontFamily:SANS, fontWeight:700, fontSize:10.5, marginTop:3,
                    color:idx >= 0 ? "var(--accent2)" : "var(--muted)" }}>
                    {idx >= 0 ? RATINGS[idx].label : "Not rated"}</div>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:5 }}>
                  {RATINGS.map((r, i) => (
                    <button key={r.v} onClick={() => setRatings(x => ({ ...x, [s.id]: r.v }))}
                      aria-label={`${s.label}: ${r.label}`} aria-pressed={idx === i}
                      style={{ width:"100%", aspectRatio:"1", minWidth:0, borderRadius:"50%", cursor:"pointer", padding:0,
                        background: idx >= 0 && i <= idx ? "var(--sun)" : "var(--paper)",
                        border: idx >= 0 && i <= idx ? "1.5px solid var(--ink)" : "1.5px solid var(--line)",
                        transition:"background .12s" }} />
                  ))}
                </div>
              </div>
            );
          })}
          </div>
          ))}
        </div>
        <Btn disabled={!complete} onClick={() => { submitSeeds(ratings); done(); }}
          style={{ width:"100%", fontSize:16, padding:"15px" }}>Finish check-in</Btn>
      </div>
    );
  }
  return null;
}

function ProfileEditor({ state, me, display, setDisplay, photo, setPhoto, num, setNum, size, setSize, onChip, showSize = true }) {
  const fileRef = useRef(null);
  const [cropSource, setCropSource] = useState(null);
  const prof = state.profiles?.[me];
  const current = photo || (prof?.photoV ? `/api/photo/${encodeURIComponent(me)}?v=${prof.photoV}` : null);
  const takenBy = num !== "" ? Object.entries(state.profiles || {})
    .find(([p, pr]) => p !== me && pr?.num === Number(num)) : null;
  const onFile = e => {
    const f = e.target.files?.[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setCropSource(reader.result);
    reader.readAsDataURL(f);
    /* Allow choosing the same file again after cancelling the crop. */
    e.target.value = "";
  };
  /* one field system: same label, same surface, same height everywhere */
  const FIELD_H = 48;
  const field = { background:"var(--paper2)", border:"1.5px solid var(--line)", borderRadius:10,
    color:"var(--ink)", outline:"none", height:FIELD_H };
  return (
    <div>
      {/* Photo, name, number, and chip are one identity surface. The narrow
          color rail carries the player's color without splitting the editor
          into two competing image banners. */}
      <div style={{ position:"relative", background:"var(--paper)", border:"1px solid var(--line)",
        borderRadius:16, overflow:"hidden", boxShadow:"var(--shadow-1)" }}>
        <div aria-hidden="true" style={{ height:4,
          background:me ? playerColor(me) : "var(--accent)" }} />
        <div style={{ padding:"12px 12px 13px",
          background:"linear-gradient(180deg, var(--paper2), var(--paper))" }}>
          <div style={{ display:"flex", alignItems:"baseline", gap:8, marginBottom:4 }}>
            <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:22, lineHeight:1,
              textTransform:"uppercase", color:"var(--ink)", flex:1 }}>Player identity</div>
            <div style={{ fontFamily:SANS, fontWeight:700, fontSize:9.5, letterSpacing:"0.12em",
              textTransform:"uppercase", color:"var(--muted)" }}>Scottsdale · 2026</div>
          </div>
          <div style={{ fontFamily:SANS, fontSize:12.5, color:"var(--muted)", lineHeight:1.45,
            marginBottom:12 }}>How you’ll appear throughout Field Day.</div>
          <div style={{ display:"flex", gap:12, alignItems:"flex-end" }}>
            <button onClick={() => fileRef.current?.click()} aria-label="Change your photo"
              style={{ background:"none", border:"none", padding:0, cursor:"pointer", position:"relative", flexShrink:0 }}>
              {current
                ? <img src={current} alt="" style={{ width:64, height:64, borderRadius:"50%", objectFit:"cover", border:"2px solid var(--paper)", outline:"2px solid var(--accent)", boxShadow:"var(--shadow-1)", display:"block" }} />
                : me && <Avatar state={state} p={me} size={64} ring />}
              <div style={{ position:"absolute", bottom:-2, right:-2, width:26, height:26, borderRadius:"50%",
                background:"var(--sun)", border:"1.5px solid var(--ink0)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--ink0)" strokeWidth="2.2" strokeLinejoin="round" aria-hidden="true"><path d="M4 8h3.2L9 6h6l1.8 2H20v11H4z"/><circle cx="12" cy="13" r="3.2"/></svg></div>
            </button>
            <input ref={fileRef} type="file" accept="image/*" onChange={onFile} style={{ display:"none" }} />
            {cropSource && (
              <PhotoCropper src={cropSource} onCancel={() => setCropSource(null)}
                onConfirm={cropped => { setPhoto(cropped); setCropSource(null); }} />
            )}
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ ...label, fontSize:10, marginBottom:5 }}>Display name</div>
              <input value={display} onChange={e => setDisplay(e.target.value)} maxLength={16} aria-label="Display name"
                style={{ ...field, width:"100%", padding:"0 12px", fontFamily:SANS, fontWeight:600, fontSize:16,
                  background:"var(--paper)" }} />
            </div>
            <div style={{ width:62, flexShrink:0 }}>
              <div style={{ ...label, fontSize:10, marginBottom:5, textAlign:"center" }}>No.</div>
              <input value={num} inputMode="numeric" placeholder="00" aria-label="Player number"
                onChange={e => setNum(e.target.value.replace(/\D/g, "").slice(0, 2))}
                style={{ ...field, width:"100%", textAlign:"center", padding:0, background:"var(--paper)",
                  border: takenBy ? "1.5px solid var(--clay)" : field.border,
                  fontFamily:DISPLAY, fontWeight:700, fontSize:22 }} />
            </div>
          </div>
          {takenBy && (
            <div style={{ marginTop:10, padding:"8px 10px", border:"1px solid var(--danger-line)",
              borderRadius:9, background:"var(--clay-tint)", fontFamily:SANS, fontWeight:600, fontSize:12,
              color:"var(--clay)", lineHeight:1.4 }}>
              {disp(state, takenBy[0])} already has {Number(num)}.
            </div>
          )}
        </div>
        {onChip && me && <ChipPicker state={state} me={me} onChip={onChip} num={num} embedded />}
      </div>
      {showSize && (
        <>
          <div style={{ marginTop:18 }}>
            <SizeRow lb="T-shirt size" value={size} onPick={setSize} allowClear />
          </div>
        </>
      )}
    </div>
  );
}

/* The venue is a reveal, not a diagram. The real overhead shot communicates
   the house, pool, pickleball, basketball, and volleyball in one clean frame. */
function HouseArt() {
  return (
    <div style={{ position:"relative", aspectRatio:"16 / 9", background:"var(--paper2)", overflow:"hidden" }}>
      <img src="/airbnb-compound-field-day.webp" alt=""
        width="1440" height="810" loading="eager" decoding="async"
        style={{ width:"100%", height:"100%", display:"block", objectFit:"cover",
          filter:"saturate(.94) contrast(1.02)" }} />
      <div aria-hidden="true" style={{ position:"absolute", inset:0,
        background:"linear-gradient(180deg, rgba(23,16,9,0.02) 45%, rgba(23,16,9,0.38) 100%)",
        boxShadow:"inset 0 0 0 1px rgba(251,243,228,0.08)" }} />
    </div>
  );
}

/* Two cards, each one subject. The house owns its own check-in window, so
   nobody has to work out what those times belong to; travel owns the airport
   and the host's flights, since both are about getting there. */
const CARD = { background:"var(--paper)", border:"1px solid var(--line)", borderRadius:14,
  marginBottom:12, overflow:"hidden" };
/* the label-over-value pair, used by both split rows */
function InfoCell({ lb, v, first }) {
  return (
    <div style={{ flex:1, minWidth:0, padding:"11px 14px",
      borderLeft: first ? "none" : "1px solid var(--line)" }}>
      <div style={{ ...label, fontSize:10, marginBottom:4 }}>{lb}</div>
      <div style={{ fontFamily:SANS, fontWeight:700, fontSize:14, color:"var(--ink)",
        lineHeight:1.35 }}>{v}</div>
    </div>
  );
}

function VenueCard({ lg }) {
  const mapUrl = lg.venue
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lg.venue)}` : null;
  const inL = cleanLeg(lg.hostIn), outL = cleanLeg(lg.hostOut);
  const hostLegs = [
    inL && ["Lands", inL.note || (legTime(inL.time) && `Fri ${legTime(inL.time)}`)],
    outL && ["Leaves", outL.note || (legTime(outL.time) && `Sun ${legTime(outL.time)}`)],
  ].filter(x => x && x[1]);
  return (
    <div>
      <div style={CARD}>
        <HouseArt />
        <div style={{ padding:"12px 14px", borderTop:"1px solid var(--line)" }}>
          <div style={{ ...label, marginBottom:5 }}>The house</div>
          {/* the address ships in core, so there is no honest empty state to
              write copy for: if it is somehow blank, say nothing */}
          {lg.venue && <div style={{ fontFamily:SANS, fontWeight:600, fontSize:15.5, lineHeight:1.45,
            userSelect:"text", color:"var(--ink)" }}>{lg.venue}</div>}
          {lg.venueNote && <div style={{ fontFamily:SANS, fontSize:13, color:"var(--muted2)", marginTop:5,
            lineHeight:1.5 }}>{lg.venueNote}</div>}
          {mapUrl && (
            <a href={mapUrl} target="_blank" rel="noreferrer"
              style={{ display:"inline-block", marginTop:10, fontFamily:SANS, fontWeight:700, fontSize:12.5,
                letterSpacing:"0.04em", textTransform:"uppercase", color:"var(--accent2)",
                textDecoration:"none" }}>Open in maps ›</a>
          )}
        </div>
        {(lg.checkIn || lg.checkOut) && (
          <div style={{ display:"flex", borderTop:"1px solid var(--line)" }}>
            <InfoCell lb="Check in" v={lg.checkIn || "TBD"} first />
            <InfoCell lb="Checkout" v={lg.checkOut || "TBD"} />
          </div>
        )}
      </div>
      {(lg.airport || hostLegs.length > 0) && (
        <div style={CARD}>
          {lg.airport && (
            <div style={{ display:"flex", alignItems:"center", gap:14, padding:"12px 14px" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="var(--accent2)" aria-hidden="true"
                style={{ flexShrink:0 }}><path d="M2 4 22 12 2 20l4.6-8z"/></svg>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ ...label, fontSize:10, marginBottom:3 }}>Fly into</div>
                <div style={{ fontFamily:SANS, fontSize:13, color:"var(--muted2)" }}>{lg.airportName}</div>
              </div>
              <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:30, letterSpacing:"0.06em",
                color:"var(--sun)", lineHeight:1 }}>{lg.airport}</div>
            </div>
          )}
          {hostLegs.length > 0 && (
            /* the flight codes matter to nobody but Brandon; the times are how
               people work out who they are sharing a ride with */
            <div style={{ borderTop: lg.airport ? "1px solid var(--line)" : "none" }}>
              <div style={{ ...label, fontSize:10, padding:"10px 14px 0" }}>My flights</div>
              <div style={{ display:"flex" }}>
                {hostLegs.map(([lb, v], i) => <InfoCell key={lb} lb={lb} v={v} first={i === 0} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* The editable flight. Dressed as a boarding pass this read as something
   already filled in, so entry gets real bordered fields with captions under
   them: three boxes on a page of cards say "type here" without a word. */
function FlightEntry({ leg: raw, dir, setLeg }) {
  const leg = raw || {};
  const set = patch => setLeg({ ...leg, ...patch });
  const box = { background:"var(--paper)", border:"1.5px solid var(--line)", borderRadius:10,
    height:46, display:"flex", alignItems:"center", padding:"0 10px", boxSizing:"border-box" };
  const bare = { background:"none", border:"none", outline:"none", padding:0, minWidth:0,
    width:"100%", boxSizing:"border-box", color:"var(--ink)" };
  const cap = { ...label, fontSize:9, marginTop:5, color:"var(--muted)" };
  return (
    <div style={{ display:"flex", gap:8 }}>
      <div style={{ width:74, flexShrink:0 }}>
        <div style={box}>
          <input value={leg.air || ""} list="fd-airlines" placeholder="UA" autoCapitalize="characters"
            aria-label="Airline"
            onChange={e => set({ air: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3) })}
            style={{ ...bare, fontFamily:SANS, fontWeight:700, fontSize:15, letterSpacing:"0.1em" }} />
        </div>
        <div style={cap}>Airline</div>
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={box}>
          <input value={leg.num || ""} inputMode="numeric" placeholder="1885" aria-label="Flight number"
            onChange={e => set({ num: e.target.value.replace(/\D/g, "").slice(0, 4) })}
            style={{ ...bare, fontFamily:SANS, fontWeight:700, fontSize:15 }} />
        </div>
        <div style={cap}>Flight no.</div>
      </div>
      <div style={{ width:138, flexShrink:0 }}>
        <div style={box}>
          <input type="time" value={leg.time || ""} onChange={e => set({ time: e.target.value })}
            aria-label={dir === "out" ? "Departure time" : "Landing time"}
            style={{ ...bare, fontFamily:SANS, fontWeight:700, fontSize:14,
              color: leg.time ? "var(--ink)" : "var(--muted)" }} />
        </div>
        <div style={cap}>{dir === "out" ? "Takes off" : "Lands"}</div>
      </div>
    </div>
  );
}

/* One boarding pass, read only: this is how a saved leg prints back */
function FlightPass({ leg: raw, dir, small, edit, setLeg }) {
  if (edit) return <FlightEntry leg={raw} dir={dir} setLeg={setLeg} />;
  const leg = cleanLeg(raw);
  if (!leg) return null;
  if (leg.note) return (
    <div style={{ fontFamily:SANS, fontWeight:600, fontSize: small ? 12.5 : 13.5,
      color:"var(--ink)", lineHeight:1.5 }}>{leg.note}</div>
  );
  const t = legTime(leg.time);
  const numSize = small ? 19 : 22;
  return (
    <div style={{ display:"flex", alignItems:"center", gap: small ? 10 : 11,
      background:"var(--paper2)", border:"1px solid var(--line)", borderRadius:10,
      padding: small ? "9px 11px" : "11px 13px" }}>
      <svg width={small ? 14 : 16} height={small ? 14 : 16} viewBox="0 0 24 24" fill="var(--muted)"
        aria-hidden="true" style={{ flexShrink:0 }}>
        <path d="M2 4 22 12 2 20l4.6-8z"/>
      </svg>
      <div style={{ display:"flex", alignItems:"baseline", gap:7, flex:1, minWidth:0 }}>
        <span style={{ fontFamily:SANS, fontWeight:700, fontSize: small ? 11 : 12,
          letterSpacing:"0.14em", color:"var(--accent2)" }}>{leg.air || "\u00b7\u00b7"}</span>
        <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:numSize,
          color:"var(--ink)", lineHeight:1 }}>{leg.num || "\u2014"}</span>
      </div>
      <div style={{ flexShrink:0, borderLeft:"1px dashed var(--line)", paddingLeft: small ? 10 : 12,
        textAlign:"right" }}>
        <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize: small ? 16 : 19, lineHeight:1.05,
          color: t ? "var(--sun)" : "var(--muted)" }}>{t || "\u2014"}</div>
        <div style={{ fontFamily:SANS, fontWeight:700, fontSize: small ? 9.5 : 10,
          letterSpacing:"0.12em", textTransform:"uppercase", color:"var(--muted)", marginTop:2 }}>
          {dir === "out" ? "Leaves Sun" : "Lands Fri"}</div>
      </div>
    </div>
  );
}

/* label, a way out, and the pass */
function LegField({ lb, dir, leg, setLeg }) {
  const filled = leg && (leg.air || leg.num || leg.time);
  return (
    <div style={{ marginBottom:12 }}>
      <div style={{ display:"flex", alignItems:"baseline", gap:8, marginBottom:6 }}>
        <span style={label}>{lb}</span>
        {filled && (
          <button onClick={() => setLeg(null)} style={{ marginLeft:"auto", background:"none",
            border:"none", cursor:"pointer", padding:0, fontFamily:SANS, fontWeight:700, fontSize:11,
            letterSpacing:"0.1em", textTransform:"uppercase", color:"var(--muted)" }}>Clear</button>
        )}
      </div>
      <FlightPass leg={leg} dir={dir} edit setLeg={setLeg} />
    </div>
  );
}

/* the carrier list both editors share */
function TravelLists() {
  return <datalist id="fd-airlines">{AIRLINES.map(a => <option key={a} value={a} />)}</datalist>;
}

/* one apparel size. Brandon uses the T-shirt answer for the jersey too. */
function SizeRow({ lb, value, onPick, allowClear }) {
  return (
    <div style={{ marginBottom:12 }}>
      <div style={{ ...label, marginBottom:6 }}>{lb}</div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:5 }}>
        {SIZES.map(sz => (
          <button key={sz} onClick={() => onPick(allowClear && value === sz ? null : sz)}
            aria-label={`${lb}: ${sz}`} aria-pressed={value === sz}
            style={{ fontFamily:SANS, fontWeight:700, fontSize:13, height:48, padding:0, borderRadius:10,
              cursor:"pointer", background: value === sz ? GOLD_GRAD : "var(--paper2)",
              color: value === sz ? "var(--ink0)" : "var(--ink)",
              border: value === sz ? "1.5px solid var(--ink0)" : "1.5px solid var(--line)" }}>{sz}</button>
        ))}
      </div>
    </div>
  );
}

/* travel entry, shared by onboarding and the profile sheet. Ask the question
   outright and give it two equal answers: a quiet link next to a form reads
   as decoration, and whoever has not booked cannot tell it is meant for them.
   Nothing shows until you answer, so the question IS the instruction. */
function TravelFields({ booked, setBooked, flightIn, setFlightIn, flightOut, setFlightOut }) {
  const opt = on => ({ fontFamily:SANS, fontWeight:700, fontSize:14, height:48, padding:0,
    borderRadius:10, cursor:"pointer",
    background: on ? GOLD_GRAD : "var(--paper2)", color: on ? "var(--ink0)" : "var(--ink)",
    border: on ? "1.5px solid var(--ink0)" : "1.5px solid var(--line)" });
  return (
    <div>
      <TravelLists />
      {/* a field prompt, not a second headline: the panel title above is the
          display face, so the questions inside it are set in the body face */}
      <div style={{ fontFamily:SANS, fontWeight:600, fontSize:15, color:"var(--ink)",
        marginBottom:8 }}>Booked your flights?</div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginBottom:14 }}>
        <button onClick={() => setBooked(true)} aria-pressed={booked === true} style={opt(booked === true)}>Yes</button>
        <button onClick={() => { setBooked(false); setFlightIn(null); setFlightOut(null); }}
          aria-pressed={booked === false} style={opt(booked === false)}>Not yet</button>
      </div>
      {booked === true && (
        <>
          <LegField lb="Landing Friday" dir="in" leg={flightIn} setLeg={setFlightIn} />
          <LegField lb="Leaving Sunday" dir="out" leg={flightOut} setLeg={setFlightOut} />
        </>
      )}
      {booked === false && (
        <div style={{ fontFamily:SANS, fontSize:13.5, color:"var(--muted2)", lineHeight:1.55,
          background:"var(--paper2)", border:"1px solid var(--line)", borderRadius:12,
          padding:"12px 14px", marginBottom:12 }}>
          No problem. Once you book, tap your player icon in the top-left to add your flights.
        </div>
      )}
    </div>
  );
}

/* chip claim: colors are first come first serve, live on the server the
   moment you tap. Skins repeat freely. Locked once the weekend starts. */
function ChipPicker({ state, me, onChip, num, embedded = false }) {
  const mine = state.profiles?.[me] || {};
  /* the preview has to follow the number field, not the saved profile, or
     picking a skin while changing your number shows you the old one */
  const stamp = num !== undefined && num !== "" && num !== null ? Number(num) : mine.num;
  const owner = hex => Object.entries(state.profiles || {}).find(([p, pr]) => pr?.color === hex)?.[0];
  const locked = state.live;
  const skin = playerSkin(me);
  return (
    <div style={{ background:"var(--paper)", border:embedded ? "none" : "1px solid var(--line)",
      borderTop:embedded ? "1px solid var(--line)" : undefined,
      borderRadius:embedded ? 0 : 14, padding:embedded ? "14px 12px 13px" : 12 }}>
      <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:15 }}>
        <div style={{ position:"relative", width:80, height:80, flexShrink:0, display:"grid", placeItems:"center" }}>
          <span aria-hidden="true" style={{ position:"absolute", inset:4, borderRadius:"50%",
            background:"var(--sun-tint)", border:"1px solid var(--line)" }} />
          <div style={{ position:"relative", filter:"drop-shadow(0 8px 10px rgba(42,33,25,.2))" }}>
            <ChipFace p={me} size={70} stamp={stamp} />
          </div>
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontFamily:SANS, fontWeight:700, fontSize:10, letterSpacing:"0.16em",
            textTransform:"uppercase", color:"var(--accent2)", marginBottom:4 }}>Chip design</div>
          <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:26, lineHeight:1,
            textTransform:"uppercase", color:"var(--ink)" }}>Your chip</div>
          <div style={{ fontFamily:SANS, fontSize:12.5, color:"var(--muted2)", lineHeight:1.45, marginTop:5 }}>
            {mine.color ? `${CHIP_SKIN_META[skin] || "Classic"} pattern`
              : "Choose your color and pattern below."}
          </div>
        </div>
      </div>
      {locked && (
        <div style={{ fontFamily:SANS, fontSize:12.5, color:"var(--muted2)", lineHeight:1.5, marginBottom:10 }}>
          Chips are locked for the weekend.
        </div>
      )}
      <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between", gap:10,
        marginBottom:8 }}>
        <div style={{ ...label, fontSize:10 }}>Choose your color</div>
        {!mine.color && <div style={{ fontFamily:SANS, fontSize:10.5, color:"var(--muted)" }}>
          First come, first served
        </div>}
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(8,1fr)", gap:6, marginBottom:18 }}>
        {CHIP_COLORS.map(c => {
          const by = owner(c.hex);
          const isMine = by === me;
          const taken = by && !isMine;
          return (
            <button key={c.hex} disabled={taken || locked}
              onClick={() => onChip(isMine ? null : c.hex, undefined)}
              aria-label={taken ? `Color taken by ${disp(state, by)}`
                : isMine ? "Release selected chip color" : `Claim chip color ${c.hex}`}
              aria-pressed={isMine}
              title={taken ? `Taken by ${disp(state, by)}` : undefined}
              style={{ position:"relative", width:"100%", aspectRatio:"1", borderRadius:"50%", padding:3,
                display:"grid", placeItems:"center", cursor: taken || locked ? "default" : "pointer",
                background:isMine ? "var(--sun-tint)" : "transparent",
                border: isMine ? "2px solid var(--sun)" : "1px solid transparent",
                opacity: taken ? 0.42 : locked && !isMine ? 0.55 : 1 }}>
              <span style={{ position:"relative", display:"grid", placeItems:"center", width:"100%",
                aspectRatio:"1", maxWidth:34, borderRadius:"50%", background:c.hex,
                border:"1.5px solid rgba(251,243,228,.28)", boxShadow:"inset 0 1px 0 rgba(255,255,255,.18)" }}>
                {taken && <span style={{ fontFamily:SANS, fontWeight:800, fontSize:8.5,
                  color: c.light ? "var(--ink0)" : "var(--bone)" }}>
                  {(disp(state, by) || "").slice(0, 2).toUpperCase()}</span>}
                {isMine && (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none"
                    stroke={c.light ? "var(--ink0)" : "var(--bone)"} strokeWidth="2.4"
                    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m3.2 8.3 3 3 6.6-6.6" />
                  </svg>
                )}
              </span>
            </button>
          );
        })}
      </div>
      <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between", gap:10,
        marginBottom:8 }}>
        <div style={{ ...label, fontSize:10 }}>Choose your pattern</div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:7 }}>
        {CHIP_SKINS.map(sk => (
          <button key={sk} disabled={locked} onClick={() => onChip(undefined, sk)}
            aria-label={`Chip pattern ${CHIP_SKIN_META[sk] || sk}`} aria-pressed={skin === sk}
            style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
              gap:5, minHeight:72, padding:"7px 4px 6px",
              borderRadius:10, cursor: locked ? "default" : "pointer",
              background:skin === sk ? "var(--sun-tint)" : "var(--paper2)",
              border: skin === sk ? "1.5px solid var(--sun)" : "1px solid var(--line)",
              boxShadow:skin === sk ? "inset 0 -2px 0 var(--sun)" : "none",
              opacity: locked && skin !== sk ? 0.55 : 1 }}>
            <ChipFace p={me} size={42} skin={sk} stamp={stamp} />
            <span style={{ fontFamily:SANS, fontWeight:700, fontSize:10.5,
              color:skin === sk ? "var(--ink)" : "var(--muted2)", lineHeight:1.1 }}>
              {CHIP_SKIN_META[sk] || sk}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* where a standings number came from, as marks rather than a run-on sentence:
   a cup for events won, a chip for the book, a bolt for duels, and your own
   exposure while it is live. Only what is nonzero shows, so a fresh board is
   just names and numbers. */
const PILL_ART = {
  win:  <path d="M4 2h8v3.2a4 4 0 0 1-8 0z M2.6 2.6v1.2a2 2 0 0 0 1.7 2 M13.4 2.6v1.2a2 2 0 0 1-1.7 2 M8 9.2V12 M5.4 13.4h5.2" />,
  bet:  <><circle cx="8" cy="7.6" r="5" /><path d="M8 2.6v1.6 M8 11v1.6 M3 7.6h1.6 M11.4 7.6H13" /></>,
  duel: <path d="M9.4 2 4.6 8.2h3L6.6 13.4 11.4 7h-3z" />,
};
function StatPills({ row, atRisk = 0, onSun }) {
  const bits = [
    row.wins > 0 && { k:"win", v: row.wins, tone: onSun ? "var(--ink0)" : "var(--sun)" },
    row.betNet !== 0 && { k:"bet", v: `${row.betNet > 0 ? "+" : ""}${fmt(row.betNet)}`,
      tone: onSun ? "var(--ink0)" : row.betNet > 0 ? "var(--green)" : "var(--clay)" },
    row.duelNet !== 0 && { k:"duel", v: `${row.duelNet > 0 ? "+" : ""}${fmt(row.duelNet)}`,
      tone: onSun ? "var(--ink0)" : row.duelNet > 0 ? "var(--green)" : "var(--clay)" },
    atRisk > 0 && { k:"bet", v: `${fmt(atRisk)} at risk`, tone:"var(--live2)" },
  ].filter(Boolean);
  if (!bits.length) return null;
  return (
    <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginTop:3 }}>
      {bits.map((b, i) => (
        <span key={i} style={{ display:"inline-flex", alignItems:"center", gap:3.5, borderRadius:99,
          padding:"1.5px 7px 1.5px 5px", background: onSun ? "rgba(42,33,25,0.13)" : "var(--ink-tint)",
          border:`1px solid ${onSun ? "rgba(42,33,25,0.18)" : "var(--line)"}` }}>
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke={b.tone}
            strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true"
            style={{ flexShrink:0 }}>{PILL_ART[b.k]}</svg>
          <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:12.5, lineHeight:1.15,
            color:b.tone }}>{b.v}</span>
        </span>
      ))}
    </div>
  );
}

/* everything Brandon orders and plans from, as tab-separated text: it pastes
   straight into a spreadsheet or a supplier form. Blanks stay blank, because
   a guessed size is worse than a missing one. */
function sheetText(state) {
  const head = ["Player", "Name", "No", "T-shirt / Jersey", "Flights booked", "Chip", "Skin", "Lands Fri", "Leaves Sun"];
  const rows = ROSTER.map(p => {
    const pr = state.profiles?.[p] || {};
    /* the column already says which leg it is, so the cell is just the flight */
    const t = leg => {
      const l = cleanLeg(leg);
      if (!l) return "";
      if (l.note) return l.note;
      return [[l.air, l.num].filter(Boolean).join(" "), legTime(l.time)].filter(Boolean).join(" ");
    };
    return [p, pr.display && pr.display !== p ? pr.display : "", pr.num ?? "", pr.size || "",
      pr.flightsBooked === true ? "Yes" : pr.flightsBooked === false ? "No" : "",
      pr.color || "", pr.skin || "", t(pr.flightIn), t(pr.flightOut)];
  });
  return [head, ...rows].map(r => r.join("\t")).join("\n");
}

/* ─────────── locker room (pre-weekend roster wall; Board takes over when live) ─────────── */
/* GM's weekend sheet: the address and host flights everyone reads during
   onboarding and in the guide. Saved as one action */
const LOGI_FIELDS = [
  { k:"venue",     ph:"House address" },
  { k:"venueNote", ph:"Door code, parking, anything they need" },
  { k:"checkIn",   ph:"Check in, e.g. Fri Oct 30, 4:00 PM", half:true },
  { k:"checkOut",  ph:"Checkout, e.g. Sun Nov 1, 10:00 AM", half:true },
];
function LogisticsEditor({ state, onSave }) {
  const lg = state.logistics || {};
  const [form, setForm] = useState(() =>
    Object.fromEntries(LOGI_FIELDS.map(f => [f.k, lg[f.k] || ""])));
  const [hostIn, setHostIn] = useState(lg.hostIn || null);
  const [hostOut, setHostOut] = useState(lg.hostOut || null);
  const same = (a, b) => JSON.stringify(a || null) === JSON.stringify(b || null);
  const dirty = LOGI_FIELDS.some(f => form[f.k] !== (lg[f.k] || ""))
    || !same(hostIn, lg.hostIn) || !same(hostOut, lg.hostOut);
  const field = { background:"var(--paper2)", border:"1.5px solid var(--line)", borderRadius:10,
    color:"var(--ink)", outline:"none", width:"100%", padding:"12px 13px",
    fontFamily:SANS, fontWeight:600, fontSize:14 };
  return (
    <div style={{ marginTop:18, background:"var(--paper)", border:"1px solid var(--line)",
      borderRadius:14, padding:"12px 13px" }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
        <div style={{ ...label, flex:1 }}>Trip details guests see</div>
        <Tag>Onboarding + Rules</Tag>
      </div>
      <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
        {LOGI_FIELDS.map(f => (
          <input key={f.k} value={form[f.k]} placeholder={f.ph} aria-label={f.ph} maxLength={240}
            onChange={e => setForm(x => ({ ...x, [f.k]: e.target.value }))}
            style={{ ...field, flex: f.half ? "1 1 45%" : "1 1 100%", minWidth:0 }} />
        ))}
      </div>
      <div style={{ marginTop:14 }}>
        <TravelLists />
        <LegField lb="You land Friday" dir="in" leg={hostIn} setLeg={setHostIn} />
        <LegField lb="You leave Sunday" dir="out" leg={hostOut} setLeg={setHostOut} />
      </div>
      <Btn disabled={!dirty} onClick={() => onSave({ ...form, hostIn, hostOut })}
        style={{ width:"100%", marginTop:4 }}>Save</Btn>
    </div>
  );
}
function LockerRoom({ state, me, gm, onProfile, onStart, onSize, onChallenge, onLogistics, onNotify }) {
  const copySheet = st => {
    const txt = sheetText(st);
    navigator.clipboard?.writeText(txt)
      .then(() => onNotify?.("Sheet copied"))
      /* clipboard is blocked outside https and in some in-app browsers, so
         fall back to something you can still select by hand */
      .catch(() => { try { window.prompt("Copy the sheet", txt); } catch { onNotify?.("Could not copy"); } });
  };
  const profs = state.profiles || {};
  const inCount = ROSTER.filter(p => profs[p]).length;
  return (
    <div style={{ padding:"0 16px" }}>
      <div style={{ display:"flex", alignItems:"baseline", marginBottom:10 }}>
        <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:24, textTransform:"uppercase",
          color:"var(--ink)", flex:1 }}>The roster</div>
        <div style={{ fontFamily:SANS, fontWeight:700, fontSize:12.5, color:"var(--muted2)" }}>
          {inCount} of {ROSTER.length} in</div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,minmax(0,1fr))", gap:8 }}>
        {ROSTER.map((p, i) => {
          const pr = profs[p];
          return (
            <button key={p} onClick={p === me ? onProfile : me ? () => onChallenge(p) : undefined}
              style={{ background:"var(--paper)", borderRadius:14, padding:"12px 6px 10px", textAlign:"center",
                border: p === me ? "1.5px solid var(--ink)" : "1.5px solid var(--line)",
                cursor: p === me || me ? "pointer" : "default", opacity: pr ? 1 : 0.45,
                animation:"si-in .25s both", ...centeredGridCell(i, ROSTER.length) }}>
              <div style={{ display:"flex", justifyContent:"center", marginBottom:9, position:"relative" }}>
                <span style={{ position:"relative", display:"inline-block" }}>
                  <Avatar state={state} p={p} size={54} ring={p === me} />
                  {pr?.num != null && (
                    <span style={{ position:"absolute", bottom:-6, left:"50%", transform:"translateX(-50%)",
                      background:BONE, color:"var(--ink0)", border:"1.5px solid var(--ink0)", borderRadius:6,
                      fontFamily:DISPLAY, fontWeight:700, fontSize:12.5, lineHeight:1,
                      padding:"2px 7px" }}>{pr.num}</span>
                  )}
                </span>
              </div>
              <div style={{ fontFamily:SANS, fontWeight:700, fontSize:12.5, color:"var(--ink)",
                overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{disp(state, p)}</div>
            </button>
          );
        })}
      </div>
      {me && <Btn kind="ghost" onClick={onProfile} style={{ width:"100%", marginTop:12 }}>Edit your profile</Btn>}
      {gm && (
        <>
          <LogisticsEditor state={state} onSave={onLogistics} />
          <div style={{ marginTop:12, background:"var(--paper)", border:"1px solid var(--line)",
            borderRadius:14, padding:"12px 13px" }}>
            <div style={{ display:"flex", alignItems:"baseline", gap:8, marginBottom:8 }}>
              <span style={label}>Travel and apparel sheet</span>
              {/* the sheet you actually order from lives in a supplier form or
                  a spreadsheet, not on a phone, so it has to be able to leave */}
              <button onClick={() => copySheet(state)} style={{ marginLeft:"auto", background:"none",
                border:"none", padding:0, cursor:"pointer", fontFamily:SANS, fontWeight:700,
                fontSize:11, letterSpacing:"0.1em", textTransform:"uppercase",
                color:"var(--accent2)" }}>Copy sheet</button>
            </div>
            {ROSTER.map(p => {
              const pr = profs[p];
              const legs = [pr?.flightIn && `in ${legText(pr.flightIn, "in")}`,
                pr?.flightOut && `out ${legText(pr.flightOut, "out")}`].filter(Boolean).join(" · ");
              const travelStatus = legs || (pr?.flightsBooked === false ? "not booked yet" : "no flight response");
              return (
                <div key={p} style={{ padding:"6px 0", borderBottom:"1px solid var(--line)" }}>
                  <div style={{ display:"flex", gap:10, alignItems:"center", fontFamily:SANS, fontSize:14 }}>
                    <span style={{ flex:1, fontWeight:600, color:"var(--ink)" }}>{p}</span>
                    <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:16, width:36,
                      color: pr?.num != null ? "var(--accent2)" : "var(--line)" }}>
                      {pr?.num != null ? `#${pr.num}` : "?"}</span>
                    <button onClick={() => onSize(p, SIZES[(SIZES.indexOf(pr?.size) + 1) % SIZES.length])}
                      title="Tap to cycle the size"
                      style={{ width:44, fontFamily:SANS, fontWeight:700, fontSize:14, textAlign:"right",
                        background:"none", border:"none", cursor:"pointer", padding:0,
                        color: pr?.size ? "var(--ink)" : "var(--clay)" }}>
                      {pr?.size || "?"}</button>
                  </div>
                  <div style={{ fontFamily:SANS, fontSize:12, lineHeight:1.4, marginTop:1,
                    color: legs ? "var(--muted2)" : pr?.flightsBooked === false ? "var(--muted)" : "var(--clay)" }}>
                    {travelStatus}</div>
                </div>
              );
            })}
            <Btn onClick={onStart} style={{ width:"100%", marginTop:12 }}>Start the weekend</Btn>
          </div>
        </>
      )}
    </div>
  );
}

/* ─────────── the board ─────────── */
/* ─────────── the poker finale, on the board ───────────
   The app runs the table: buy-in sheet, blind clock, busts. Cards and chips
   stay physical. The clock is derived; this card re-derives every second. */
const mmss = ms => {
  const t = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};
function PokerCard({ state, standings, me, gm, onBuyin, onStart, onCancel, onLevel, onBust, onUnbust, onCount, onReview }) {
  const pk = state.poker;
  const [now, setNow] = useState(Date.now());
  const [confirmOut, setConfirmOut] = useState(false);
  const [counting, setCounting] = useState(false);
  useEffect(() => {
    if (!pk?.startedAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [pk?.startedAt]);
  useEffect(() => { if (!confirmOut) return; const t = setTimeout(() => setConfirmOut(false), 4000); return () => clearTimeout(t); }, [confirmOut]);
  if (!pk || state.results[pk.id]) return null;
  const outIdx = pk.outs.findIndex(o => o.player === me);
  const myRow = standings.find(r => r.player === me);
  const card = { marginBottom:12, borderRadius:14, overflow:"hidden", border:"1.5px solid var(--ink)",
    background:"radial-gradient(120% 90% at 50% 0%, var(--sun-tint) 0%, transparent 55%), var(--night)" };

  if (!pk.startedAt) {
    const d = myRow ? pokerDenoms(myRow.pts) : null;
    return (
      <div style={card}>
        <div style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px" }}>
          <GameMark id="poker" size={34} />
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:17, letterSpacing:"0.05em",
              textTransform:"uppercase", color:"var(--sun)" }}>Championship Poker</div>
            {myRow && d ? (
              <div style={{ fontFamily:SANS, fontSize:12.5, color:BONE, marginTop:2 }}>
                Your buy-in: <b>{fmt(myRow.pts)}</b>
                {d.length ? `, take ${d.map(x => `${x.n} x ${x.v}`).join(" + ")}` : ""}
              </div>
            ) : (
              <div style={{ fontFamily:SANS, fontSize:11.5, color:"var(--night-text)" }}>{fmt(pk.total)} chips in play</div>
            )}
          </div>
          <button onClick={onBuyin} style={{ fontFamily:SANS, fontWeight:700, fontSize:11, letterSpacing:"0.05em",
            textTransform:"uppercase", background:"transparent", color:BONE, border:"1.5px solid var(--ghost-line)",
            borderRadius:10, padding:"6px 12px", cursor:"pointer", flexShrink:0 }}>Everyone</button>
        </div>
        {gm && (
          <div style={{ display:"flex", gap:8, padding:"0 14px 12px" }}>
            <Btn onClick={onStart} style={{ flex:1, padding:"10px 12px", fontSize:12.5 }}>Start the table</Btn>
            <Btn kind="danger" onClick={onCancel} style={{ padding:"10px 12px", fontSize:12.5 }}>Cancel</Btn>
          </div>
        )}
      </div>
    );
  }

  const clk = pokerClock(pk, now);
  const outSet = new Set(pk.outs.map(o => o.player));
  const alive = ROSTER.length - outSet.size;
  const counted = ROSTER.filter(p => !outSet.has(p) && pk.counts?.[p] !== undefined);
  const countSum = counted.reduce((s, p) => s + pk.counts[p], 0);
  const allIn = counted.length === alive;
  const countPhase = counting || (clk.last && clk.msLeft === 0) || counted.length > 0;

  return (
    <div style={card}>
      <div style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px" }}>
        <GameMark id="poker" size={30} />
        <div style={{ flex:1 }}>
          <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:26, lineHeight:1, color:BONE }}>
            {fmt(clk.sb)} / {fmt(clk.bb)}</div>
          <div style={{ fontFamily:SANS, fontSize:11, color:"var(--night-text)", marginTop:3 }}>
            Blinds, level {clk.idx + 1} of {pk.levels.length}. {alive} still in.</div>
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:26, lineHeight:1,
            color: clk.msLeft < 60000 && !clk.last ? "var(--live2)" : "var(--sun)" }}>
            {clk.last && clk.msLeft === 0 ? "LAST" : mmss(clk.msLeft)}</div>
          <div style={{ fontFamily:SANS, fontSize:10.5, color:"var(--night-text2)", marginTop:3 }}>
            {clk.last && clk.msLeft === 0 ? "count them down" : "to the next level"}</div>
        </div>
      </div>

      {/* your seat: bust yourself, count yourself. The GM never types for you. */}
      {me && outIdx < 0 && (
        <div style={{ borderTop:"1px solid var(--night-line)", padding:"9px 14px" }}>
          {pk.counts?.[me] !== undefined && !counting ? (
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <span style={{ fontFamily:SANS, fontSize:12.5, color:BONE, flex:1 }}>
                Counted: <b>{fmt(pk.counts[me])}</b></span>
              <button onClick={() => setCounting(true)} style={{ background:"none", border:"none",
                color:"var(--night-text)", fontFamily:SANS, fontWeight:700, fontSize:11.5, cursor:"pointer",
                textTransform:"uppercase", padding:"4px 6px" }}>Recount</button>
            </div>
          ) : countPhase ? (
            <ChipCounter start={pk.counts?.[me]} onDone={total => { onCount(me, total); setCounting(false); }} />
          ) : (
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <span style={{ fontFamily:SANS, fontSize:12.5, color:"var(--night-text)", flex:1 }}>
                Your stack: <b style={{ color:BONE }}>{fmt(myRow?.pts ?? 0)}</b> at the buy-in</span>
              <button onClick={() => setCounting(true)} style={{ background:"none", border:"none",
                color:"var(--night-text)", fontFamily:SANS, fontWeight:700, fontSize:11.5, cursor:"pointer",
                textTransform:"uppercase", padding:"4px 6px" }}>Count</button>
              <button onClick={() => { if (confirmOut) { onBust(me); setConfirmOut(false); } else setConfirmOut(true); }}
                style={{ fontFamily:SANS, fontWeight:700, fontSize:11, letterSpacing:"0.05em",
                  textTransform:"uppercase", borderRadius:10, padding:"6px 12px", cursor:"pointer",
                  background: confirmOut ? "var(--clay)" : "transparent",
                  color: confirmOut ? BONE : "var(--clay)",
                  border:"1.5px solid rgba(192,71,58,0.6)" }}>
                {confirmOut ? "Tap again, you are out" : "I busted"}</button>
            </div>
          )}
        </div>
      )}
      {me && outIdx >= 0 && (
        <div style={{ borderTop:"1px solid var(--night-line)", padding:"9px 14px",
          display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontFamily:SANS, fontSize:12.5, color:BONE, flex:1 }}>
            Out. You finish {ord(ROSTER.length - outIdx)}.</span>
          <button onClick={() => onUnbust(me)} style={{ background:"none", border:"none",
            color:"var(--night-text)", fontFamily:SANS, fontWeight:700, fontSize:11.5, cursor:"pointer",
            textTransform:"uppercase", padding:"4px 6px" }}>Wrong, back in</button>
        </div>
      )}

      {/* counts land in parallel; the GM posts once when everyone is in */}
      {counted.length > 0 && (
        <div style={{ borderTop:"1px solid var(--night-line)", padding:"8px 14px",
          display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontFamily:SANS, fontSize:12, color:"var(--night-text)", flex:1 }}>
            {counted.length} of {alive} counted{allIn ? `, ${fmt(countSum)} of ${fmt(pk.total)}` : ""}
            {allIn && countSum !== pk.total && (
              <span style={{ color:"var(--clay)" }}> ({countSum > pk.total
                ? `${fmt(countSum - pk.total)} over` : `${fmt(pk.total - countSum)} short`})</span>
            )}
          </span>
          {gm && (
            <button onClick={onReview} style={{ fontFamily:SANS, fontWeight:700, fontSize:11, letterSpacing:"0.05em",
              textTransform:"uppercase", background: allIn ? "var(--sun)" : "transparent",
              color: allIn ? "var(--ink0)" : BONE,
              border:"1.5px solid " + (allIn ? "var(--ink0)" : "var(--ghost-line)"),
              borderRadius:10, padding:"6px 12px", cursor:"pointer" }}>
              {allIn ? "Post the counts" : "Review"}</button>
          )}
        </div>
      )}

      {gm && (
        <div style={{ borderTop:"1px solid var(--night-line)", padding:"8px 14px 10px",
          display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ ...label, fontSize:10.5, color:"var(--night-text2)" }}>Level</span>
          <button onClick={() => onLevel(-1)} style={{ width:30, height:30, borderRadius:10, cursor:"pointer",
            background:"transparent", border:"1.5px solid var(--ghost-line)", color:BONE }}>−</button>
          <button onClick={() => onLevel(1)} style={{ width:30, height:30, borderRadius:10, cursor:"pointer",
            background:"transparent", border:"1.5px solid var(--ghost-line)", color:BONE }}>+</button>
          <span style={{ flex:1 }} />
          {!counted.length && (
            <button onClick={onReview} style={{ background:"none", border:"none", color:"var(--night-text)",
              fontFamily:SANS, fontWeight:700, fontSize:11.5, cursor:"pointer", textTransform:"uppercase",
              padding:"4px 0" }}>Table sheet</button>
          )}
        </div>
      )}
    </div>
  );
}

/* count your stack by denomination; the app does the math. Values in chips. */
function ChipCounter({ start, onDone }) {
  const seed = v => {
    let left = start || 0;
    const out = {};
    for (const d of [1000, 500, 100, 25]) { out[d] = Math.floor(left / d); left -= out[d] * d; }
    return out[v];
  };
  const [n1000, set1000] = useState(() => seed(1000));
  const [n500, set500] = useState(() => seed(500));
  const [n100, set100] = useState(() => seed(100));
  const [n25, set25] = useState(() => seed(25));
  const total = n1000 * 1000 + n500 * 500 + n100 * 100 + n25 * 25;
  const Step = ({ v, set, worth }) => (
    <div style={{ flex:1, display:"flex", alignItems:"center", gap:6 }}>
      <button onClick={() => set(x => Math.max(0, x - 1))} style={{ width:30, height:30, borderRadius:10,
        cursor:"pointer", background:"transparent", border:"1.5px solid var(--ghost-line)", color:BONE }}>−</button>
      <div style={{ textAlign:"center", minWidth:40 }}>
        <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:21, lineHeight:1, color:BONE }}>{v}</div>
        <div style={{ fontFamily:SANS, fontSize:9.5, fontWeight:700, letterSpacing:"0.06em",
          color:"var(--night-text2)" }}>x {worth}</div>
      </div>
      <button onClick={() => set(x => x + 1)} style={{ width:30, height:30, borderRadius:10,
        cursor:"pointer", background:"transparent", border:"1.5px solid var(--ghost-line)", color:BONE }}>+</button>
    </div>
  );
  return (
    <div>
      <div style={{ fontFamily:SANS, fontSize:11.5, color:"var(--night-text)", marginBottom:8 }}>
        Count your stack by chip.</div>
      <div style={{ display:"flex", gap:10, marginBottom:8 }}>
        <Step v={n1000} set={set1000} worth="1000" />
        <Step v={n500} set={set500} worth="500" />
      </div>
      <div style={{ display:"flex", gap:10, alignItems:"center" }}>
        <Step v={n100} set={set100} worth="100" />
        <Step v={n25} set={set25} worth="25" />
        <div style={{ textAlign:"right", minWidth:60 }}>
          <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:24, lineHeight:1, color:"var(--sun)" }}>{fmt(total)}</div>
        </div>
      </div>
      <Btn onClick={() => onDone(total)} style={{ width:"100%", marginTop:10, padding:"10px 12px", fontSize:12.5 }}>
        That is my count</Btn>
    </div>
  );
}

function PokerBuyinSheet({ state, standings, gm, onClose, onStart }) {
  const pk = state.poker;
  if (!pk) return null;
  return (
    <Sheet title="Buy-in" onClose={onClose}>
      <p style={pStyle}>Your points are your chips. Everyone takes their own stack from the tray.</p>
      {standings.map(r => {
        const d = pokerDenoms(r.pts);
        return (
          <div key={r.player} style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 0",
            borderBottom:"1px solid var(--line)" }}>
            <Avatar state={state} p={r.player} size={28} />
            <span style={{ fontFamily:SANS, fontWeight:600, fontSize:14, color:"var(--ink)", flex:1,
              minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{disp(state, r.player)}</span>
            <span style={{ fontFamily:SANS, fontSize:12, color:"var(--muted)" }}>
              {d.map(x => `${x.n} x ${x.v}`).join(" + ") || "0"}</span>
            <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:19, color:"var(--ink)", minWidth:52,
              textAlign:"right" }}>{fmt(r.pts)}</span>
          </div>
        );
      })}
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 0 14px" }}>
        <span style={{ ...label, flex:1 }}>Chips in play</span>
        <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:22, color:"var(--sun)" }}>{fmt(pk.total)}</span>
      </div>
      {gm && !pk.startedAt && <Btn onClick={onStart} style={{ width:"100%" }}>Start the table</Btn>}
    </Sheet>
  );
}

/* GM table sheet: live count status, tap a row to fix a count, one post */
function PokerResultSheet({ state, onClose, onCount, onBust, onUnbust, onPost }) {
  const pk = state.poker;
  const [fixing, setFixing] = useState(null);
  if (!pk) return null;
  const outSet = new Set(pk.outs.map(o => o.player));
  const alive = ROSTER.filter(p => !outSet.has(p));
  const counted = alive.filter(p => pk.counts?.[p] !== undefined);
  const sum = counted.reduce((s, p) => s + pk.counts[p], 0);
  const allIn = counted.length === alive.length;
  return (
    <Sheet title="The table" onClose={onClose}>
      <p style={pStyle}>Everyone counts their own stack from their phone. Tap a row to fix one.</p>
      {ROSTER.map(p => {
        const out = outSet.has(p);
        const c = pk.counts?.[p];
        return (
          <div key={p}>
            <div onClick={() => !out && setFixing(f => f === p ? null : p)}
              style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 0",
                borderBottom:"1px solid var(--line)", cursor: out ? "default" : "pointer",
                opacity: out ? 0.55 : 1 }}>
              <Avatar state={state} p={p} size={26} />
              <span style={{ fontFamily:SANS, fontWeight:600, fontSize:13, color:"var(--ink)", flex:1,
                minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                {disp(state, p)}</span>
              {out ? <Tag>Out</Tag>
                : c !== undefined
                  ? <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:19, color:"var(--ink)" }}>{fmt(c)}</span>
                  : <span style={{ fontFamily:SANS, fontSize:11.5, fontWeight:600, color:"var(--muted)" }}>counting</span>}
              {!out && (
                <button onClick={e => { e.stopPropagation(); onBust(p); setFixing(null); }}
                  style={{ background:"none", border:"1px solid var(--danger-line)", borderRadius:10,
                    color:"var(--clay)", fontFamily:SANS, fontWeight:700, fontSize:10.5, padding:"3px 8px",
                    cursor:"pointer", textTransform:"uppercase" }}>Bust</button>
              )}
              {out && (
                <button onClick={e => { e.stopPropagation(); onUnbust(p); }}
                  style={{ background:"none", border:"none", color:"var(--muted)", fontFamily:SANS,
                    fontWeight:700, fontSize:10.5, padding:"3px 6px", cursor:"pointer",
                    textTransform:"uppercase" }}>Back in</button>
              )}
            </div>
            {fixing === p && !out && (
              <div style={{ padding:"10px 0", borderBottom:"1px solid var(--line)", background:"var(--night)",
                margin:"0 -18px", paddingLeft:18, paddingRight:18 }}>
                <ChipCounter start={c} onDone={total => { onCount(p, total); setFixing(null); }} />
              </div>
            )}
          </div>
        );
      })}
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 0 4px" }}>
        <span style={{ ...label, flex:1 }}>Counted</span>
        <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:22,
          color: allIn && sum === pk.total ? "var(--green)" : "var(--ink)" }}>{fmt(sum)}</span>
        <span style={{ fontFamily:SANS, fontSize:12.5, color:"var(--muted)" }}>of {fmt(pk.total)}</span>
      </div>
      {allIn && sum !== pk.total && (
        <div style={{ fontFamily:SANS, fontSize:12.5, color:"var(--clay)", marginBottom:10 }}>
          {sum > pk.total ? `${fmt(sum - pk.total)} over` : `${fmt(pk.total - sum)} short`}. Chips get miscounted, you can still post.
        </div>
      )}
      <Btn disabled={!allIn} onClick={onPost} style={{ width:"100%", marginTop:8 }}>
        {allIn ? "Post the counts" : `Waiting on ${alive.length - counted.length}`}</Btn>
    </Sheet>
  );
}


/* what a result actually changed: rank moves, the lead, and the chips that
   settled on it. Derived by recomputing standings without that result. */
function resultImpact(state, events, latest, standings) {
  if (latest.res.stacks) return "";
  const prev = { ...state, results: { ...state.results } };
  delete prev.results[latest.ev.id];
  const before = computeStandings(prev);
  const rank = rows => Object.fromEntries(rows.map(r => [r.player, r.rank]));
  const rb = rank(before), ra = rank(standings);
  const awarded = (latest.res.slots || []).flat();
  let climb = null;
  awarded.forEach(p => {
    const d = (rb[p] ?? 99) - (ra[p] ?? 99);
    if (d > 0 && (!climb || d > climb.d)) climb = { p, d };
  });
  const leadBefore = before.filter(r => r.rank === 1).map(r => r.player).join("+");
  const leadAfter = standings.filter(r => r.rank === 1).map(r => r.player).join("+");
  const settled = (state.wagers || []).filter(w => w.eventId === latest.ev.id)
    .map(w => ({ w, r: resolveWager(state, w, events) })).filter(x => x.r.status === "won" || x.r.status === "lost");
  /* what the book actually moved, in board points. Chip counts read as a
     second currency here, and a bare "14 burned" names neither */
  const paid = settled.reduce((s, x) => s + Math.max(0, x.r.delta || 0), 0);
  const lost = -settled.reduce((s, x) => s + Math.min(0, x.r.delta || 0), 0);
  const parts = [];
  if (leadAfter !== leadBefore)
    parts.push(`${standings.filter(r => r.rank === 1).map(r => disp(state, r.player)).join(" and ")} take${leadAfter.includes("+") ? "" : "s"} the lead`);
  else if (climb) parts.push(`${disp(state, climb.p)} up ${climb.d} to ${ord(ra[climb.p])}`);
  if (paid && lost) parts.push(`Bets paid ${fmt(paid)} and lost ${fmt(lost)}`);
  else if (paid) parts.push(`Bets paid ${fmt(paid)}`);
  else if (lost) parts.push(`Bets lost ${fmt(lost)}`);
  return parts.join(". ");
}

/* the now zone: one slot above the standings. Live progress beats a fresh
   result beats the next event; betting-open already lives in the header. */
function NowCard({ state, standings, events, me, onOpen }) {
  const openEv = e => !state.results[e.id] && !state.shelved[e.id] && e.id !== state.onDeck;
  const liveEv = events.find(e => openEv(e) && (state.brackets[e.id] || state.stages[e.id]));
  const latest = useMemo(() => {
    let l = null;
    const byId = new Map(events.map(e => [e.id, e]));
    Object.entries(state.results || {}).forEach(([eid, res]) => {
      const ev = byId.get(eid);
      if (ev && res?.slots?.[0]?.length && (!l || res.ts > l.res.ts)) l = { ev, res };
    });
    return l;
  }, [state, events]);
  /* the impact line recomputes standings on a cloned state: once per result */
  const impactMemo = useMemo(() => latest && !latest.res.stacks
    ? resultImpact(state, events, latest, standings) : "", [state, events, latest, standings]);
  const card = { display:"block", width:"100%", textAlign:"left", cursor:"pointer", marginBottom:10,
    background:"var(--paper)", border:"1px solid var(--line)", borderRadius:14, padding:"10px 13px" };

  if (liveEv) {
    const br = state.brackets[liveEv.id];
    const st = state.stages[liveEv.id];
    let progress = "", matchup = null;
    if (br) {
      const all = br.rounds.flat();
      const done = all.filter(m => m.winner !== null && m.winner !== undefined).length;
      progress = `${done} of ${all.length} decided`;
      const nm = nextOpenMatch(br);
      if (nm) matchup = { a: nm.a, b: nm.b, name: nm.roundName };
    } else if (st) {
      const done = st.groups.filter(g => (g.through || []).length >= st.advance).length;
      progress = `${st.kind === "heats" ? "heats" : "pools"}: ${done} of ${st.groups.length} decided`;
    }
    const draw = state.draws[liveEv.id];
    return (
      <button onClick={() => onOpen(liveEv)} style={{ ...card, border:"1px solid rgba(192,71,58,0.45)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <GameMark id={liveEv.game} size={28} />
          <span style={{ width:7, height:7, borderRadius:99, background:"var(--live2)", animation:"si-pulse 1.4s infinite" }} />
          <span style={{ fontFamily:SANS, fontWeight:700, fontSize:11, letterSpacing:"0.16em",
            color:"var(--live2)", textTransform:"uppercase" }}>Live</span>
          <span style={{ fontFamily:SANS, fontWeight:600, fontSize:12.5, color:"var(--ink)", flex:1, minWidth:0,
            overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{liveEv.name}</span>
          <span style={{ fontFamily:SANS, fontWeight:600, fontSize:11.5, color:"var(--muted)" }}>{progress}</span>
        </div>
        {matchup && draw && (
          <div style={{ display:"flex", alignItems:"center", gap:9, marginTop:8, paddingTop:8,
            borderTop:"1px solid var(--line)" }}>
            <span style={{ fontFamily:SANS, fontWeight:700, fontSize:10.5, letterSpacing:"0.1em",
              color:"var(--muted)", textTransform:"uppercase", flexShrink:0 }}>{matchup.name || "Up now"}</span>
            <AvatarStack state={state} players={draw.teams[matchup.a].players} size={20} max={3} />
            <span style={{ fontFamily:SANS, fontWeight:600, fontSize:12, color:"var(--ink)", minWidth:0,
              overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1 }}>
              {teamLabel(state, draw.teams[matchup.a])}
              <span style={{ color:"var(--muted)", fontWeight:700 }}> vs </span>
              {teamLabel(state, draw.teams[matchup.b])}</span>
            <AvatarStack state={state} players={draw.teams[matchup.b].players} size={20} max={3} />
          </div>
        )}
      </button>
    );
  }

  if (latest) {
    const isStacks = !!latest.res.stacks;
    const award = isStacks ? 0 : (AWARDS[latest.ev.value]?.[0] ?? 0);
    const impact = isStacks
      ? `Final counts are in. ${latest.res.slots[0].map(p => disp(state, p)).join(" and ")} leads the chips.`
      : impactMemo;
    return (
      <button onClick={() => onOpen(latest.ev)} style={card}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <GameMark id={latest.ev.game} size={28} />
          <span style={{ fontFamily:SANS, fontWeight:700, fontSize:10.5, letterSpacing:"0.05em",
            textTransform:"uppercase", padding:"3px 8px", borderRadius:6,
            background:"var(--olive)", color:BONE }}>Final</span>
          <span style={{ fontFamily:SANS, fontWeight:600, fontSize:12.5, color:"var(--ink)", flex:1, minWidth:0,
            overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{latest.ev.name}</span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:9, marginTop:8, paddingTop:8,
          borderTop:"1px solid var(--line)" }}>
          <AvatarStack state={state} players={latest.res.slots[0]} size={22} max={4} />
          <span style={{ fontFamily:SANS, fontWeight:700, fontSize:12.5, color:"var(--ink)", flex:1, minWidth:0,
            overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            {teamLabel(state, { players: latest.res.slots[0] })}</span>
          <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:16, color:"var(--green)" }}>
            {isStacks ? `${fmt(latest.res.stacks[latest.res.slots[0][0]] ?? 0)} chips` : `+${award} each`}</span>
        </div>
        {impact && <div style={{ fontFamily:SANS, fontSize:11.5, color:"var(--muted2)", marginTop:5 }}>{impact}</div>}
      </button>
    );
  }

  const next = events.find(openEv);
  if (!next) return null;
  const ph = phaseOf(next);
  const sess = SESSIONS.find(s => s.id === next.session);
  return (
    <button onClick={() => onOpen(next)} style={{ ...card, display:"flex", alignItems:"center", gap:10,
      boxShadow:`inset 4px 0 0 ${ph.bg}` }}>
      <GameMark id={next.game} size={26} />
      <span style={{ fontFamily:SANS, fontWeight:700, fontSize:11, letterSpacing:"0.16em",
        color:"var(--accent2)", textTransform:"uppercase" }}>Next</span>
      <span style={{ fontFamily:SANS, fontWeight:600, fontSize:12.5, color:"var(--ink)", flex:1, minWidth:0,
        overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{next.name}</span>
      <span style={{ fontFamily:SANS, fontWeight:600, fontSize:11.5, color:"var(--muted)" }}>
        {sess ? `${sess.label}, ` : ""}{next.value ? `${next.value} pts` : "poker"}</span>
    </button>
  );
}

function Board({ state, standings, me, deltas, allTied, champion, coChamps, gm, events, myAtRisk, onOpen, onAdjust, onChallenge, onFreeze, onUnfreeze, finaleDone }) {
  return (
    <div style={{ padding:"0 16px" }}>
      {champion && <ChampionCard state={state} champion={champion} coChamps={coChamps} />}
      {!champion && <NowCard state={state} standings={standings} events={events} me={me} onOpen={onOpen} />}
      <div style={{ background:"var(--paper)", border:"1px solid rgba(251,243,228,0.2)", borderRadius:14,
        overflow:"hidden", boxShadow:"var(--shadow-1)", animation:"si-in .25s both" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12, padding:"6px 12px",
          borderBottom:"1.5px solid var(--ink)", background:"var(--paper2)" }}>
          <span style={{ ...label, fontSize:11, width:26, textAlign:"center" }}>Pos</span>
          <span style={{ ...label, fontSize:11, flex:1 }}>Player</span>
          <span style={{ ...label, fontSize:11 }}>Pts</span>
        </div>
        {standings.map((r, i) => {
          const isMe = r.player === me;
          const first = r.rank === 1 && !allTied;
          const medal = !allTied && r.rank === 2 ? "var(--silver)" : !allTied && r.rank === 3 ? "var(--bronze)" : null;
          return (
            <div key={r.player}
              onClick={gm ? () => onAdjust(r.player)
                : me && !isMe && !state.frozen ? () => onChallenge(r.player) : undefined}
              style={{ display:"flex", alignItems:"center", gap:12, padding: first ? "11px 12px" : "8px 12px",
                cursor: gm || (me && !isMe && !state.frozen) ? "pointer" : "default", position:"relative",
                background: first ? "var(--sun)" : isMe ? "rgba(194,88,50,0.08)" : i % 2 ? "var(--ink-tint)" : "transparent",
                borderTop: i > 0 ? "1px solid var(--line)" : "none",
                boxShadow: isMe && !first ? "inset 3px 0 0 var(--accent)" : "none" }}>
              <div style={{ width:26, textAlign:"center", fontFamily:DISPLAY, fontWeight:700,
                fontSize: first ? 24 : 19, color: first ? "var(--ink0)" : medal || "var(--muted)" }}>
                {allTied ? "·" : r.rank}</div>
              <Avatar state={state} p={r.player} size={first ? 36 : 30} />
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontFamily:SANS, fontWeight:700, fontSize: first ? 16 : 14.5, color: first ? "var(--ink0)" : "var(--ink)",
                  overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                  {disp(state, r.player)}{isMe && <span style={{ opacity:0.55, fontWeight:600, fontSize:12.5 }}> (you)</span>}
                  {state.poker?.startedAt && !state.results[state.poker.id]
                    && state.poker.outs.some(o => o.player === r.player) && (
                    <span style={{ marginLeft:6, fontFamily:SANS, fontWeight:700, fontSize:9.5,
                      letterSpacing:"0.08em", padding:"2px 6px", borderRadius:6,
                      background:"var(--clay-tint)", color:"var(--clay)" }}>OUT</span>
                  )}
                </div>
                <StatPills row={r} atRisk={isMe ? myAtRisk : 0} onSun={first} />
              </div>
              {!allTied && deltas[r.player] && <div style={{ fontFamily:SANS, fontWeight:800, fontSize:12.5,
                color: deltas[r.player] > 0 ? "var(--green)" : "var(--clay)" }}>
                {deltas[r.player] > 0 ? `▲${deltas[r.player]}` : `▼${-deltas[r.player]}`}</div>}
              <div key={r.pts} style={{ fontFamily:DISPLAY, fontWeight:700, fontSize: first ? 30 : 24,
                minWidth:36, textAlign:"right", color: first ? "var(--ink0)" : "var(--ink)", animation:"si-pop .5s ease-out" }}>{fmt(r.pts)}</div>
            </div>
          );
        })}
      </div>
      {gm && !champion && (
        <div style={{ padding:"14px 4px 8px", textAlign:"center" }}>
          <Btn kind={finaleDone ? "primary" : "ghost"} onClick={onFreeze}>Crown the champion</Btn>
        </div>
      )}
      {gm && champion && (
        <div style={{ textAlign:"center", padding:"10px 0" }}>
          <Btn kind="danger" onClick={onUnfreeze}>Unfreeze board</Btn>
        </div>
      )}
    </div>
  );
}
function ChampionCard({ state, champion, coChamps, big }) {
  return (
    <div style={{ padding: big ? "48px 30px" : "26px 18px", textAlign:"center", marginBottom:16,
      position:"relative", overflow:"hidden", borderRadius:14,
      background:"radial-gradient(110% 80% at 50% 0%, var(--sun-tint) 0%, transparent 55%), var(--night)",
      border:"1.5px solid var(--ink)" }}>
      <div style={{ display:"flex", justifyContent:"center",
        margin:big ? "-24px 0 -10px" : "-14px 0 -4px" }}>
        <TrophyHero size={big ? 250 : 164} plate="FIELD DAY" />
      </div>
      <div style={{ display:"flex", justifyContent:"center", gap:10, marginBottom:14 }}>
        {coChamps.map(c => <Avatar key={c.player} state={state} p={c.player} size={big ? 110 : 64}
          style={{ border:"2.5px solid var(--sun)" }} />)}
      </div>
      <div style={{ display:"inline-block", fontFamily:DISPLAY, fontWeight:700, letterSpacing:"0.14em",
        textTransform:"uppercase", background:"var(--sun)", color:"var(--night)",
        fontSize: big ? 19 : 12.5, padding: big ? "5px 22px" : "3px 14px", borderRadius:6 }}>Champion</div>
      <div style={{ fontFamily:DISPLAY, fontWeight:700, fontStyle:"italic", textTransform:"uppercase",
        fontSize: big ? 104 : 46, lineHeight:0.95, margin:"10px 0 6px", color:"var(--sun)" }}>
        {coChamps.map(c => disp(state, c.player)).join(" & ")}
      </div>
      <div style={{ fontFamily:SANS, fontWeight:600, color:"var(--night-text)", fontSize: big ? 19 : 13 }}>
        {fmt(champion.pts)} points
      </div>
      {coChamps.length > 1 && <div style={{ fontFamily:SANS, marginTop:8, color:"var(--night-text)", fontSize: big ? 16 : 12.5 }}>
        Tied. One pressure putt decides it.</div>}
    </div>
  );
}

/* ─────────── slate ─────────── */
/* phase colors: each session of the weekend gets its own band */
const PHASE = {
  fri: { bg:"var(--pool)",   fg:BONE },
  sam: { bg:"var(--sun)",    fg:"var(--ink0)" },
  sap: { bg:"var(--accent)", fg:BONE },
  san: { bg:"var(--clay)",   fg:BONE },
  fin: { bg:"var(--night)",  fg:"var(--sun)" },
};
const phaseOf = ev => PHASE[ev?.session] || { bg:"var(--paper2)", fg:"var(--ink)" };

function Schedule({ state, events, gm, open, onAdd, onReorder }) {
  const [reorderMode, setReorderMode] = useState(false);
  const shelved = events.filter(e => state.shelved[e.id]);
  const inSession = s => events.filter(e => e.session === s.id && !state.shelved[e.id]);
  const extras = events.filter(e => !SESSIONS.find(s => s.id === e.session) && !state.shelved[e.id]);
  const move = (ev, dir) => {
    const ids = [...SESSIONS.map(s => inSession(s).map(e => e.id)), extras.map(e => e.id)];
    for (const g of ids) {
      const i = g.indexOf(ev.id);
      if (i >= 0) {
        const j = i + dir;
        if (j < 0 || j >= g.length) return;
        [g[i], g[j]] = [g[j], g[i]];
        break;
      }
    }
    onReorder(ids.flat());
  };
  const arrow = (ev, dir, edge) => (
    <button disabled={edge} onClick={e => { e.stopPropagation(); move(ev, dir); }}
      style={{ width:34, height:34, borderRadius:10, cursor: edge ? "default" : "pointer",
        background:"var(--paper2)", border:"1px solid var(--line)", color: edge ? "var(--disabled)" : "var(--accent2)",
        fontSize:12.5, flexShrink:0 }}>{dir < 0 ? "▲" : "▼"}</button>
  );
  const section = (evList, canMove) => evList.map((ev, i) => {
    const res = state.results[ev.id];
    const draw = state.draws[ev.id];
    const st = state.stages[ev.id];
    const deck = state.onDeck === ev.id;
    const moving = reorderMode && gm && canMove;
    const ph = phaseOf(ev);
    return (
      <button key={ev.id} onClick={moving ? undefined : () => open(ev)} style={{ display:"block", width:"100%", textAlign:"left",
        background: deck ? "rgba(192,71,58,0.09)" : "var(--paper)",
        border: deck ? "1.5px solid var(--clay)" : "1px solid var(--line)",
        boxShadow:`inset 4px 0 0 ${ph.bg}`,
        borderRadius:14, padding:"11px 14px 11px 16px", marginBottom:7, cursor: moving ? "default" : "pointer" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <GameMark id={ev.game} size={30} />
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontFamily:DISPLAY, fontWeight:600, fontSize:19, letterSpacing:"0.01em",
              textTransform:"uppercase", color:"var(--ink)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
              {res && <span style={{ color:"var(--green)" }}>✓ </span>}{ev.name}
              {ev.finale && <span style={{ color:"var(--accent)" }}> ★</span>}
            </div>
          </div>
          {moving ? (
            <>{arrow(ev, -1, i === 0)}{arrow(ev, 1, i === evList.length - 1)}</>
          ) : (
            <>
              {deck && <Tag tone="flame">On deck</Tag>}
              {!res && !deck && st && <Tag tone="green">{st.kind === "heats" ? "Heats live" : "Pools live"}</Tag>}
              {!res && !deck && !st && draw && <Tag tone="green">Teams set</Tag>}
              {!res && !deck && !st && !draw && <Tag>{ev.value ? `${ev.value} pts` : "Poker"}</Tag>}
            </>
          )}
        </div>
        {res && res.slots?.[0]?.length > 0 && (
          <div style={{ marginTop:9, display:"flex", flexWrap:"wrap", gap:6, alignItems:"center" }}>
            {res.slots[0].map(p => (
              <span key={p} style={{ display:"inline-flex", alignItems:"center", gap:6,
                fontFamily:SANS, fontWeight:700, fontSize:12.5, padding:"3px 10px 3px 4px", borderRadius:99,
                background:"rgba(194,88,50,0.14)", color:"var(--accent2)" }}>
                <Avatar state={state} p={p} size={20} />{disp(state, p)}
              </span>
            ))}
          </div>
        )}
      </button>
    );
  });
  return (
    <div style={{ padding:"0 16px" }}>
      {SESSIONS.map(s => {
        const evs = inSession(s);
        if (evs.length === 0) return null;
        const ph = PHASE[s.id] || { bg:"var(--paper2)", fg:"var(--ink)" };
        return (
          <div key={s.id} style={{ marginBottom:16 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, padding:"6px 12px", marginBottom:7,
              borderRadius:10, background:ph.bg, color:ph.fg, border:"1.5px solid var(--ink)" }}>
              <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:19, letterSpacing:"0.03em",
                textTransform:"uppercase", flex:1 }}>{s.label}</span>
              <span style={{ fontFamily:SANS, fontWeight:700, fontSize:11, letterSpacing:"0.05em" }}>{s.tag}</span>
            </div>
            {section(evs, true)}
          </div>
        );
      })}
      {extras.length > 0 && (
        <div style={{ marginBottom:16 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, padding:"6px 12px", marginBottom:7,
            borderRadius:10, background:"var(--paper2)", color:"var(--ink)", border:"1.5px solid var(--ink)" }}>
            <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:19, letterSpacing:"0.03em",
              textTransform:"uppercase", flex:1 }}>Extra</span>
          </div>
          {section(extras, true)}
        </div>
      )}
      {gm && (
        <div style={{ display:"flex", gap:8, marginBottom:14 }}>
          <Btn kind="ghost" onClick={onAdd} style={{ flex:1 }}>+ Add an event</Btn>
          <Btn kind={reorderMode ? "primary" : "ghost"} onClick={() => setReorderMode(v => !v)}>
            {reorderMode ? "Done" : "Reorder"}</Btn>
        </div>
      )}
      {shelved.length > 0 && (
        <div style={{ marginBottom:16, opacity:0.55 }}>
          <div style={{ ...label, margin:"4px 2px 8px" }}>Shelved</div>
          {section(shelved, false)}
        </div>
      )}
    </div>
  );
}

/* ─────────── stage grid (event sheet + TV) ─────────── */
function StageGrid({ state, ev, gm, onThrough, onFinal, size="md" }) {
  const st = state.stages[ev.id];
  if (!st) return null;
  const finalists = stageFinalists(st);
  const dims = {
    md: { av:24, f:13.5, tf:13, pad:"7px 10px", gap:8, col:"1fr 1fr" },
    lg: { av:36, f:19,   tf:17, pad:"11px 14px", gap:14, col:`repeat(${Math.min(st.groups.length + (finalists ? 1 : 0), 4)}, 1fr)` },
  }[size];
  const GroupCard = ({ title, entrants, through, gIdx, isFinal, wide }) => (
    <div style={{ background:"var(--paper2)", border:"1px solid " + (isFinal ? "rgba(156,69,38,0.5)" : "var(--line)"),
      borderRadius:14, overflow:"hidden", boxShadow:"var(--shadow-1)",
      ...(wide ? { gridColumn:"1 / -1" } : {}) }}>
      <div style={{ ...label, fontSize: size==="lg" ? 13 : 10.5, padding: size==="lg" ? "9px 14px 5px" : "7px 10px 3px",
        color: isFinal ? "var(--accent2)" : "var(--muted)" }}>{title}</div>
      {entrants.map(key => {
        const v = stageEntrantView(state, st, key);
        const isThrough = isFinal ? st.finalWinner === key : (through || []).includes(key);
        const decided = isFinal ? st.finalWinner !== null && st.finalWinner !== undefined
          : (through || []).length >= st.advance;
        const dimmed = decided && !isThrough;
        const clickable = gm && (isFinal ? onFinal : onThrough);
        return (
          <button key={String(key)} disabled={!clickable}
            onClick={() => isFinal ? onFinal(key) : onThrough(gIdx, key)}
            style={{ display:"flex", alignItems:"center", gap:8, width:"100%", textAlign:"left",
              padding:dims.pad, border:"none", borderTop:"1px solid var(--line)",
              cursor: clickable ? "pointer" : "default",
              background: isThrough ? "var(--accent-tint)" : "transparent",
              opacity: dimmed ? 0.38 : 1 }}>
            <AvatarStack state={state} players={v.players} size={dims.av} max={3} />
            <span style={{ fontFamily:SANS, fontWeight:700, fontSize:dims.f, flex:1,
              overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
              color: isThrough ? "var(--accent2)" : "var(--ink)" }}>{v.name}</span>
            {isThrough && <span style={{ fontFamily:SANS, fontWeight:700, fontSize:dims.tf, color:"var(--accent2)" }}>
              {isFinal ? "🏆" : "✓"}</span>}
          </button>
        );
      })}
    </div>
  );
  return (
    <div style={{ display:"grid", gridTemplateColumns:dims.col, gap:dims.gap, alignItems:"start" }}>
      {st.groups.map((g, i) => (
        <GroupCard key={i} title={`${g.name}${st.advance > 1 ? `, top ${st.advance} through` : ""}`}
          entrants={g.entrants} through={g.through} gIdx={i} />
      ))}
      {finalists && (
        <GroupCard title="The Final" entrants={finalists} isFinal
          wide={size === "md" && (st.groups.length + 1) % 2 === 1} />
      )}
    </div>
  );
}

/* ─────────── event sheet ─────────── */
function EventSheet({ ev, state, gm, onClose, enterResult, clearRes, onEdit, onDraw, onClearDraw,
  onStages, onClearStages, onThrough, onFinal, onDeckToggle, onStart, onShelve, onRemove, openBracket, openDraft }) {
  const res = state.results[ev.id];
  const draw = state.draws[ev.id];
  const draftLive = state.drafts?.[ev.id];
  const br = state.brackets[ev.id];
  const st = state.stages[ev.id];
  const table = AWARDS[ev.value];
  const shelvedNow = !!state.shelved[ev.id];
  const [confirmRedraw, setConfirmRedraw] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearReason, setClearReason] = useState("");
  const [confirmScrap, setConfirmScrap] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [howTo, setHowTo] = useState(false);
  const [more, setMore] = useState(false);
  const [eName, setEName] = useState("");
  const [eDesc, setEDesc] = useState("");
  const [eValue, setEValue] = useState(80);
  const [eSession, setESession] = useState(null);
  const openEdit = () => {
    setEName(ev.name); setEDesc(ev.desc || ""); setEValue(ev.value ?? 40);
    setESession(SESSIONS.find(s => s.id === ev.session) ? ev.session : null);
    setEditOpen(true);
  };
  const [outs, setOuts] = useState([]);
  const [outRoles, setOutRoles] = useState({});
  const [showOuts, setShowOuts] = useState(false);
  const [stageCfgOpen, setStageCfgOpen] = useState(false);
  const [nGroups, setNGroups] = useState(null);
  const [advance, setAdvance] = useState(1);
  const lifecycle = resolveEventLifecycle(state, ev);
  const inPlayers = ROSTER.filter(p => !outs.includes(p));
  const participantFit = validateEventParticipants(ev, inPlayers, ROSTER);
  const overflowAssignments = outs.map(player => ({
    player,
    role: OVERFLOW_ROLES.includes(outRoles[player]) ? outRoles[player] : "sit-out",
  }));
  const isPoker = ev.game === "poker" && !!ev.finale;
  const canHeats = ev.kind === "solo" && !res && !isPoker;
  const canPools = ev.teamCfg && draw && !br && draw.teams.length >= 4 && !res;
  const stageKind = canHeats ? "heats" : "pools";
  const stageEntrantCount = canHeats ? inPlayers.length : (draw?.teams?.length || 0);
  const suggestedGroups = Math.min(4, Math.max(2, Math.round(stageEntrantCount / (canHeats ? 4 : 3))));
  const groupsChoice = nGroups ?? suggestedGroups;
  return (
    <Sheet title={ev.name} onClose={onClose}>
      <div style={{ display:"flex", gap:10, alignItems:"center", marginBottom:12, flexWrap:"wrap" }}>
        <GameMark id={ev.game} size={38} />
        <Tag tone={ev.finale ? "flame" : "gold"}>{ev.value ? `${ev.value} pts` : "Poker"}</Tag>
        <Tag>{ev.kind === "solo" ? "Individual" : ev.kind === "pairs" ? "Pairs" : "Teams"}</Tag>
        <Tag tone={lifecycle.phase === "complete" ? "green"
          : lifecycle.phase === "betting-open" || lifecycle.phase === "in-progress" ? "flame" : undefined}>
          {lifecycle.label}</Tag>
        {shelvedNow && <Tag>Shelved</Tag>}
      </div>
      {ev.desc && <p style={{ ...pStyle, marginBottom: GAMES[ev.game] ? 8 : 14 }}>{ev.desc}</p>}
      {GAMES[ev.game]?.howto && (
        <button onClick={() => setHowTo(true)} style={{ background:"none", border:"none", cursor:"pointer",
          fontFamily:SANS, fontWeight:700, fontSize:12.5, letterSpacing:"0.02em", color:"var(--accent2)",
          padding:"0 0 14px", display:"block" }}>How to play →</button>
      )}
      {howTo && <HowToSheet gameId={ev.game} variant={ev.variant} onClose={() => setHowTo(false)} />}
      {table && <p style={{ ...pStyle, color:"var(--muted)", fontSize:12.5 }}>
        Pays {table.map((v,i) => v>0 ? `${SLOT_META[i].label} +${v}` : null).filter(Boolean).join(", ")}
      </p>}
      {ev.game === "poker" && ev.finale && <p style={{ ...pStyle, color:"var(--muted)", fontSize:12.5 }}>
        Pays nothing. Final chip counts are the final standings.
      </p>}

      {draftLive && !draw && (
        <div style={{ marginBottom:14 }}>
          <div style={{ ...label, marginBottom:8 }}>Captains draft</div>
          <Btn kind="dark" onClick={() => openDraft()} style={{ width:"100%" }}>
            Open the draft board</Btn>
        </div>
      )}

      {draw && (
        <div style={{ marginBottom:14 }}>
          <div style={{ ...label, marginBottom:8 }}>The draw</div>
          {draw.teams.length === 2 ? (
            <VersusDraw state={state} teams={draw.teams} />
          ) : (
            <div style={{ display:"grid", gridTemplateColumns: draw.teams.length > 3 ? "1fr 1fr" : "1fr", gap:8 }}>
              {draw.teams.map((t,i) => (
                <div key={i} style={{ background:"var(--paper2)", border:"1px solid var(--line)", borderRadius:14,
                  padding:"10px 12px",
                  ...(draw.teams.length > 3 && draw.teams.length % 2 === 1 && i === draw.teams.length - 1
                    ? { gridColumn:"1 / -1" } : {}) }}>
                  <div style={{ fontFamily:SANS, fontWeight:700, fontSize:12.5, color:"var(--accent2)", marginBottom:5 }}>{teamLabel(state, t)}</div>
                  <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                    {t.players.map(p => <Avatar key={p} state={state} p={p} size={26} />)}
                  </div>
                </div>
              ))}
            </div>
          )}
          {draw.roles?.length > 0 && (
            <div style={{ marginTop:9, fontFamily:SANS, fontSize:12.5, lineHeight:1.5, color:"var(--muted)" }}>
              {draw.roles.map(({ player, role }) => `${disp(state, player)}: ${role}`).join(" · ")}
            </div>
          )}
          {br && <Btn kind="dark" onClick={openBracket} style={{ width:"100%", marginTop:10 }}>View bracket</Btn>}
        </div>
      )}

      {st && (
        <div style={{ marginBottom:14 }}>
          <div style={{ ...label, marginBottom:8 }}>{st.kind === "heats" ? "Heats" : "Pools"}</div>
          <StageGrid state={state} ev={ev} gm={gm && !state.frozen}
            onThrough={onThrough} onFinal={onFinal} />
        </div>
      )}

      {res && res.slots && (
        <div style={{ marginBottom:14 }}>
          {res.slots.map((players, i) => players?.length > 0 && (
            <div key={i} style={{ fontFamily:SANS, fontSize:14, color:"var(--ink)", marginBottom:4 }}>
              <span style={{ color:SLOT_META[i].color, fontWeight:700 }}>{SLOT_META[i].label}:</span>{" "}
              {players.map(p => disp(state,p)).join(", ")} <span style={{ color:"var(--muted)" }}>
                {res.stacks ? `${fmt(res.stacks[players[0]] ?? 0)} chips` : `+${table?.[i] ?? 0} each`}</span>
            </div>
          ))}
        </div>
      )}

      {gm && !state.frozen && (
        <div style={{ borderTop:"1px solid var(--line)", paddingTop:14 }}>
          {ev.teamCfg && !draw && !draftLive && !res && (() => {
            const fit = eventCapacity(ev);
            const diff = inPlayers.length - fit;
            return (
            <>
              <div style={{ display:"flex", alignItems:"center", marginBottom:4 }}>
                <div style={{ ...label, flex:1 }}>Draw teams</div>
                <button onClick={() => setShowOuts(v => !v)} style={{ cursor:"pointer",
                  fontFamily:SANS, fontWeight:700, fontSize:12.5, padding:"7px 12px", borderRadius:10,
                  background: diff !== 0 ? "var(--clay-tint)" : "var(--paper)",
                  border: diff !== 0 ? "1.5px solid var(--clay)" : "1px solid var(--line)",
                  color: diff !== 0 ? "var(--clay)" : "var(--ink)" }}>
                  {inPlayers.length} playing {showOuts ? "▴" : "▾"}</button>
              </div>
              <div style={{ fontFamily:SANS, fontSize:12.5, marginBottom:8,
                color: diff !== 0 ? "var(--clay)" : "var(--muted)" }}>
                Format: {ev.teamCfg.teams} teams of {ev.teamCfg.size}, fits {fit}.
                {diff > 0 ? ` Assign ${diff} to non-playing roles.` : diff < 0 ? ` ${-diff} short.` : " Exact fit."}
              </div>
              {showOuts && (
                <>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(3,minmax(0,1fr))", gap:5, marginBottom:10 }}>
                    {ROSTER.map((p, i) => <PlayerChip key={p} name={p} small selected={!outs.includes(p)}
                      onClick={() => setOuts(o => o.includes(p) ? o.filter(x=>x!==p) : [...o,p])}
                      style={centeredGridCell(i, ROSTER.length, 3, 5)} />)}
                  </div>
                  {outs.map(player => (
                    <label key={player} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:7,
                      fontFamily:SANS, fontWeight:700, fontSize:12.5, color:"var(--ink)" }}>
                      <span style={{ flex:1 }}>{disp(state, player)}</span>
                      <select value={outRoles[player] || "sit-out"}
                        onChange={event => setOutRoles(current => ({ ...current, [player]:event.target.value }))}
                        style={{ minWidth:132, padding:"8px 9px", borderRadius:9, background:"var(--paper)",
                          color:"var(--ink)", border:"1px solid var(--line)", fontFamily:SANS, fontWeight:600 }}>
                        {OVERFLOW_ROLES.map(role => <option key={role} value={role}>{role}</option>)}
                      </select>
                    </label>
                  ))}
                </>
              )}
              <div style={{ fontFamily:SANS, fontSize:12.5, color:"var(--muted)", lineHeight:1.5, marginBottom:10 }}>
                {participantFit.ok
                  ? `Teams balance from ratings and results. ${outs.length} excluded ${outs.length === 1 ? "player gets" : "players get"} a recorded sit-out role.`
                  : participantFit.error}
              </div>
              <div style={{ display:"flex", gap:8, marginBottom:10 }}>
                <Btn disabled={!participantFit.ok}
                  onClick={() => onDraw(inPlayers, overflowAssignments)}
                  style={{ flex:1, whiteSpace:"nowrap", padding:"12px 8px" }}>
                  Run the draw</Btn>
                {ev.kind === "team" && (
                  <Btn kind="dark" disabled={!participantFit.ok}
                    onClick={() => openDraft(inPlayers, overflowAssignments)}
                    style={{ flex:1, whiteSpace:"nowrap", padding:"12px 8px" }}>
                    Captains draft</Btn>
                )}
              </div>
            </>
            );
          })()}
          {ev.teamCfg && draw && !res && (
            confirmRedraw
              ? <div style={{ display:"flex", gap:8, marginBottom:10 }}>
                  <Btn kind="danger" onClick={() => { onClearDraw(); setConfirmRedraw(false); }} style={{ flex:1 }}>Scrap the draw</Btn>
                  <Btn kind="ghost" onClick={() => setConfirmRedraw(false)} style={{ flex:1 }}>Keep it</Btn>
                </div>
              : <Btn kind="ghost" onClick={() => setConfirmRedraw(true)} style={{ width:"100%", marginBottom:10 }}>Redraw</Btn>
          )}

          {/* heats / pools setup */}
          {(canHeats || canPools) && !st && (
            !stageCfgOpen
              ? <Btn kind="dark" onClick={() => setStageCfgOpen(true)} style={{ width:"100%", marginBottom:10 }}>
                  {canHeats ? "Run heats" : "Set up pools"}</Btn>
              : (
                <div style={{ background:"var(--paper2)", border:"1px solid var(--line)", borderRadius:14,
                  padding:"12px 13px", marginBottom:10 }}>
                  {canHeats && (
                    <>
                      <div style={{ display:"flex", alignItems:"center", marginBottom:8 }}>
                        <div style={{ ...label, flex:1 }}>Heats</div>
                        <button onClick={() => setShowOuts(v => !v)} style={{ cursor:"pointer",
                          fontFamily:SANS, fontWeight:700, fontSize:12.5, padding:"6px 11px", borderRadius:10,
                          background:"var(--paper)", border:"1px solid var(--line)", color:"var(--ink)" }}>
                          {inPlayers.length} playing {showOuts ? "▴" : "▾"}</button>
                      </div>
                      {showOuts && (
                        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,minmax(0,1fr))", gap:5, marginBottom:10 }}>
                          {ROSTER.map((p, i) => <PlayerChip key={p} name={p} small selected={!outs.includes(p)}
                            onClick={() => setOuts(o => o.includes(p) ? o.filter(x=>x!==p) : [...o,p])}
                            style={centeredGridCell(i, ROSTER.length, 3, 5)} />)}
                        </div>
                      )}
                    </>
                  )}
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                    <span style={{ ...label }}>{canHeats ? "Heats" : "Pools"}</span>
                    {[2,3,4].filter(n => n <= stageEntrantCount).map(n => (
                      <button key={n} onClick={() => setNGroups(n)} style={{ width:44, height:44, borderRadius:10,
                        cursor:"pointer", fontFamily:DISPLAY, fontWeight:700, fontSize:19,
                        background: groupsChoice===n ? GOLD_GRAD : "var(--paper)",
                        color: groupsChoice===n ? "var(--ink0)" : "var(--ink)",
                        border: groupsChoice===n ? "1.5px solid var(--ink0)" : "1.5px solid var(--line)" }}>{n}</button>
                    ))}
                    <span style={{ flex:1 }} />
                    <span style={{ ...label }}>Through</span>
                    {[1,2].map(n => (
                      <button key={n} onClick={() => setAdvance(n)} style={{ width:44, height:44, borderRadius:10,
                        cursor:"pointer", fontFamily:DISPLAY, fontWeight:700, fontSize:19,
                        background: advance===n ? GOLD_GRAD : "var(--paper)",
                        color: advance===n ? "var(--ink0)" : "var(--ink)",
                        border: advance===n ? "1.5px solid var(--ink0)" : "1.5px solid var(--line)" }}>{n}</button>
                    ))}
                  </div>
                  <div style={{ display:"flex", gap:8 }}>
                    <Btn disabled={canHeats && !participantFit.ok}
                      onClick={() => onStages({ kind:stageKind, nGroups:groupsChoice, advance,
                      players:inPlayers })} style={{ flex:1 }}>
                      {canHeats ? "Draw heats" : "Draw pools"}</Btn>
                    <Btn kind="ghost" onClick={() => setStageCfgOpen(false)}>Cancel</Btn>
                  </div>
                </div>
              )
          )}
          {st && !res && (
            confirmScrap
              ? <div style={{ display:"flex", gap:8, marginBottom:10 }}>
                  <Btn kind="danger" onClick={() => { onClearStages(); setConfirmScrap(false); }} style={{ flex:1 }}>
                    Scrap {st.kind === "heats" ? "heats" : "pools"}, sure</Btn>
                  <Btn kind="ghost" onClick={() => setConfirmScrap(false)} style={{ flex:1 }}>Keep</Btn>
                </div>
              : <Btn kind="ghost" onClick={() => setConfirmScrap(true)} style={{ width:"100%", marginBottom:10 }}>
                  Scrap {st.kind === "heats" ? "heats" : "pools"}</Btn>
          )}

          <div style={{ display:"flex", gap:8, marginTop:6, flexWrap:"wrap" }}>
            {res && !isPoker && <Btn onClick={enterResult}
              style={{ flex:1, whiteSpace:"nowrap", padding:"12px 8px" }}>Edit result</Btn>}
            {!res && lifecycle.nextAction?.type === "open-betting" && (
              <Btn kind="dark" onClick={onDeckToggle}
                style={{ flex:1, whiteSpace:"nowrap", padding:"12px 8px" }}>Open betting</Btn>
            )}
            {!res && lifecycle.nextAction?.type === "lock-betting" && (
              <Btn kind="dark" onClick={onDeckToggle}
                style={{ flex:1, whiteSpace:"nowrap", padding:"12px 8px" }}>Lock betting</Btn>
            )}
            {!res && lifecycle.nextAction?.type === "start-event" && (
              <Btn onClick={onStart}
                style={{ flex:1, whiteSpace:"nowrap", padding:"12px 8px" }}>Start event</Btn>
            )}
            {!res && ["enter-result", "post-result"].includes(lifecycle.nextAction?.type) && (
              <Btn disabled={!lifecycle.nextAction?.enabled} onClick={enterResult}
                style={{ flex:1, whiteSpace:"nowrap", padding:"12px 8px" }}>
                {lifecycle.nextAction.type === "enter-result" ? "Enter result" : "Post result"}</Btn>
            )}
            {res && !confirmClear && (
              <Btn kind="danger" onClick={() => setConfirmClear(true)} style={{ flex:1 }}>Clear</Btn>
            )}
          </div>
          {!res && lifecycle.blockers?.length > 0 && (
            <div style={{ ...pStyle, marginTop:8, color:"var(--muted)", fontSize:13 }}>
              Next: {lifecycle.blockers[0]}</div>
          )}
          {res && confirmClear && (
            <div style={{ marginTop:10, padding:"12px 13px", background:"var(--paper2)",
              border:"1px solid var(--line)", borderRadius:14 }}>
              <div style={{ ...label, marginBottom:6 }}>Why is this result being cleared?</div>
              <input value={clearReason} onChange={event => setClearReason(event.target.value)}
                maxLength={100} placeholder="Example: signed scorecard needs re-entry"
                style={{ width:"100%", background:"var(--paper)", border:"1px solid var(--line)",
                  borderRadius:10, padding:"11px 12px", color:"var(--ink)", fontFamily:SANS,
                  fontWeight:600, fontSize:14, marginBottom:9, outline:"none" }} />
              <div style={{ display:"flex", gap:8 }}>
                <Btn kind="danger" disabled={!clearReason.trim()}
                  onClick={() => clearRes(clearReason)} style={{ flex:1 }}>Clear official result</Btn>
                <Btn kind="ghost" onClick={() => { setConfirmClear(false); setClearReason(""); }}
                  style={{ flex:1 }}>Keep it</Btn>
              </div>
            </div>
          )}
          {editOpen ? (
            <div style={{ background:"var(--paper2)", border:"1px solid var(--line)", borderRadius:14,
              padding:"12px 13px", marginTop:8 }}>
              <div style={{ ...label, marginBottom:6 }}>Name</div>
              <input value={eName} onChange={e => setEName(e.target.value)} maxLength={28} aria-label="Event name"
                style={{ width:"100%", background:"var(--paper)", border:"1px solid var(--line)", borderRadius:10,
                  padding:"11px 12px", color:"var(--ink)", fontFamily:SANS, fontWeight:600, fontSize:16, marginBottom:12, outline:"none" }} />
              <div style={{ ...label, marginBottom:6 }}>How it works</div>
              <textarea value={eDesc} onChange={e => setEDesc(e.target.value)} maxLength={300} rows={3}
                aria-label="Event description"
                style={{ width:"100%", background:"var(--paper)", border:"1px solid var(--line)", borderRadius:10,
                  padding:"11px 12px", color:"var(--ink)", fontFamily:SANS, fontSize:14, lineHeight:1.5,
                  marginBottom:12, outline:"none", resize:"vertical" }} />
              <div style={{ ...label, marginBottom:6 }}>Worth</div>
              <div style={{ display:"flex", gap:8, marginBottom:12 }}>
                {[400,800,1200,1600].map(v => (
                  <button key={v} onClick={() => setEValue(v)} style={{ flex:1, height:44, borderRadius:10, cursor:"pointer",
                    fontFamily:DISPLAY, fontWeight:700, fontSize:16,
                    background: eValue===v ? GOLD_GRAD : "var(--paper)",
                    color: eValue===v ? "var(--ink0)" : "var(--ink)",
                    border: eValue===v ? "1.5px solid var(--ink0)" : "1.5px solid var(--line)" }}>{v}</button>
                ))}
              </div>
              <div style={{ ...label, marginBottom:6 }}>When</div>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:14 }}>
                {[...SESSIONS.map(s => [s.id, s.label]), [null, "Extra"]].map(([id, lb]) => (
                  <button key={String(id)} onClick={() => setESession(id)} style={{ fontFamily:SANS, fontWeight:600,
                    fontSize:12.5, padding:"10px 12px", borderRadius:10, cursor:"pointer",
                    background: eSession===id ? GOLD_GRAD : "var(--paper)",
                    color: eSession===id ? "var(--ink0)" : "var(--ink)",
                    border: eSession===id ? "1.5px solid var(--ink0)" : "1.5px solid var(--line)" }}>{lb}</button>
                ))}
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <Btn disabled={!eName.trim()} onClick={() => { onEdit({ name:eName, desc:eDesc, value:eValue, session:eSession }); setEditOpen(false); }}
                  style={{ flex:1 }}>Save</Btn>
                <Btn kind="ghost" onClick={() => setEditOpen(false)}>Cancel</Btn>
              </div>
            </div>
          ) : !more ? (
            <button onClick={() => setMore(true)} style={{ background:"none", border:"none", cursor:"pointer",
              fontFamily:SANS, fontWeight:600, fontSize:12.5, color:"var(--accent2)", padding:"10px 0 0",
              display:"block", marginLeft:"auto" }}>More options ▾</button>
          ) : (
            <div style={{ display:"flex", gap:8, marginTop:8, flexWrap:"wrap" }}>
              <Btn kind="ghost" onClick={openEdit} style={{ flex:1 }}>Edit details</Btn>
              {!res && <Btn kind="ghost" onClick={() => onShelve(!shelvedNow)} style={{ flex:1 }}>{shelvedNow ? "Restore" : "Shelve"}</Btn>}
              {ev.custom && !confirmRemove && <Btn kind="danger" onClick={() => setConfirmRemove(true)}>Remove</Btn>}
              {ev.custom && confirmRemove && <Btn kind="danger" onClick={onRemove}>Confirm remove</Btn>}
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}

/* ─────────── add event ─────────── */
function AddEventSheet({ state, onClose, save }) {
  const [name, setName] = useState("");
  const [value, setValue] = useState(80);
  const [fmt, setFmt] = useState("solo");
  const [sess, setSess] = useState(null);
  const [game, setGame] = useState(null);
  const fmts = [
    { id:"solo", label:"Individual" },
    { id:"pairs", label:"Pairs" },
    { id:"t2", label:"2 teams" },
    { id:"t3", label:"3 teams" },
    { id:"t4", label:"4 teams" },
  ];
  const build = () => {
    const id = "c" + Date.now();
    const base = { id, custom:true, name:name.trim(), value, desc:"",
      ...(sess ? { session:sess } : {}), ...(game ? { game } : {}) };
    if (fmt === "solo") return { ...base, kind:"solo" };
    if (fmt === "pairs") return { ...base, kind:"pairs", teamCfg:{ teams:6, size:2 } };
    const n = Number(fmt[1]);
    return { ...base, kind:"team", teamCfg:{ teams:n, size:Math.ceil(ROSTER.length/n) } };
  };
  return (
    <Sheet title="Add an event" onClose={onClose}>
      <div style={{ ...label, marginBottom:6 }}>Name</div>
      <input value={name} onChange={e => setName(e.target.value)} maxLength={28} placeholder="Bocce, poker, HORSE"
        aria-label="Event name"
        style={{ width:"100%", background:"var(--paper2)", border:"1px solid var(--line)", borderRadius:14,
          padding:"12px 13px", color:"var(--ink)", fontFamily:SANS, fontWeight:600, fontSize:16, marginBottom:14, outline:"none" }} />
      <div style={{ ...label, marginBottom:6 }}>Worth</div>
      <div style={{ display:"flex", gap:8, marginBottom:14 }}>
        {[400,800,1200,1600].map(v => (
          <button key={v} onClick={() => setValue(v)} style={{ flex:1, height:44, borderRadius:10, cursor:"pointer",
            fontFamily:DISPLAY, fontWeight:700, fontSize:19,
            background: value===v ? GOLD_GRAD : "var(--paper)",
            color: value===v ? "var(--ink0)" : "var(--ink)",
            border: value===v ? "1.5px solid var(--ink0)" : "1.5px solid var(--line)" }}>{v}</button>
        ))}
      </div>
      <div style={{ ...label, marginBottom:6 }}>When</div>
      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:14 }}>
        {[...SESSIONS.map(s => [s.id, s.label]), [null, "Extra"]].map(([id, lb]) => (
          <button key={String(id)} onClick={() => setSess(id)} style={{ fontFamily:SANS, fontWeight:600, fontSize:12.5,
            padding:"10px 12px", borderRadius:10, cursor:"pointer",
            background: sess===id ? GOLD_GRAD : "var(--paper)",
            color: sess===id ? "var(--ink0)" : "var(--ink)",
            border: sess===id ? "1.5px solid var(--ink0)" : "1.5px solid var(--line)" }}>{lb}</button>
        ))}
      </div>
      <div style={{ ...label, marginBottom:6 }}>Format</div>
      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:14 }}>
        {fmts.map(f => (
          <button key={f.id} onClick={() => setFmt(f.id)} style={{ fontFamily:SANS, fontWeight:600, fontSize:12.5,
            padding:"10px 12px", borderRadius:10, cursor:"pointer",
            background: fmt===f.id ? GOLD_GRAD : "var(--paper)",
            color: fmt===f.id ? "var(--ink0)" : "var(--ink)",
            border: fmt===f.id ? "1.5px solid var(--ink0)" : "1.5px solid var(--line)" }}>{f.label}</button>
        ))}
      </div>
      {/* borrow a known game's mark, hero, and how-to; none = the FD chip */}
      <div style={{ ...label, marginBottom:6 }}>Looks like</div>
      <div style={{ display:"flex", gap:6, overflowX:"auto", marginBottom:16, paddingBottom:4 }}>
        {[null, ...Object.keys(MARKS)].map(g => (
          <button key={String(g)} onClick={() => setGame(g)} style={{ width:52, height:52, borderRadius:10,
            cursor:"pointer", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center",
            background: game===g ? "var(--sun-tint)" : "var(--paper)",
            border: game===g ? "1.5px solid var(--sun)" : "1.5px solid var(--line)" }}>
            {g ? <GameMark id={g} size={34} /> : <FDMark size={30} />}
          </button>
        ))}
      </div>
      <Btn disabled={!name.trim()} onClick={() => save(build())} style={{ width:"100%", fontSize:16, padding:"14px" }}>
        Add to the slate</Btn>
    </Sheet>
  );
}

/* ─────────── bracket ─────────── */
/* the next fully-seated, undecided matchup in bracket order: what plays now */
function nextOpenMatch(br) {
  if (!br) return null;
  const names = ROUND_NAMES[br.size] || [];
  for (let r = 0; r < br.rounds.length; r++) for (let m = 0; m < br.rounds[r].length; m++) {
    const match = br.rounds[r][m];
    if (match.winner !== null && match.winner !== undefined) continue;
    const a = resolveSlot(br, match.a), b = resolveSlot(br, match.b);
    if (a !== null && b !== null) return { r, m, a, b, roundName: names[r] || "Match" };
  }
  return null;
}
function BracketGrid({ state, ev, gm, onPick, size="md", bet, hot }) {
  const br = state.brackets[ev.id];
  const draw = state.draws[ev.id];
  if (!br || !draw) return null;
  const names = ROUND_NAMES[br.size] || [];
  const dims = {
    md: { col:200, av:24, f:13.5, pad:"9px 11px", lbl:11 },
    lg: { col:280, av:34, f:18,   pad:"13px 15px", lbl:14 },
  }[size];
  return (
    <div style={{ display:"flex", gap: size==="lg" ? 22 : 14, overflowX:"auto", paddingBottom:6,
      justifyContent: size==="lg" ? "center" : "flex-start" }}>
      {br.rounds.map((round, r) => (
        <div key={r} style={{ minWidth:dims.col, display:"flex", flexDirection:"column",
          justifyContent:"space-around", gap:12 }}>
          <div style={{ ...label, fontSize:dims.lbl, textAlign:"center" }}>{names[r]}</div>
          {round.map((match, m) => {
            const a = resolveSlot(br, match.a), b = resolveSlot(br, match.b);
            const undecided = match.winner === null || match.winner === undefined;
            const isHot = hot && hot[0] === r && hot[1] === m;
            return (
              <div key={m} style={{ borderRadius:14, overflow:"hidden",
                border: isHot ? "1.5px solid var(--sun)" : "1px solid var(--line)",
                background:"var(--paper2)", boxShadow: isHot ? "var(--shadow-2)" : "var(--shadow-1)" }}>
                {[a,b].map((tIdx, side) => {
                  const t = tIdx !== null ? draw.teams[tIdx] : null;
                  const isWinner = match.winner !== null && match.winner === tIdx;
                  const isLoser = match.winner !== null && match.winner !== tIdx && tIdx !== null;
                  /* bet mode: an open, fully-seated matchup takes a chip on tap */
                  const canBet = !!bet?.onBet && undecided && a !== null && b !== null && tIdx !== null;
                  const tappable = gm ? (onPick && tIdx !== null && a !== null && b !== null) : canBet;
                  return (
                    <button key={side} disabled={!tappable}
                      onClick={() => gm ? onPick && onPick(r, m, tIdx) : bet.onBet(r, m, tIdx, names[r])}
                      style={{ display:"flex", alignItems:"center", gap:8, width:"100%", textAlign:"left",
                        padding:dims.pad,
                        cursor: tappable ? "pointer" : "default", border:"none",
                        borderBottom: side === 0 ? "1px solid var(--line)" : "none",
                        background: isWinner ? "var(--accent-tint)" : "transparent",
                        opacity: isLoser ? 0.38 : 1 }}>
                      {t && <AvatarStack state={state} players={t.players} size={dims.av} max={3} />}
                      <div style={{ fontFamily:SANS, fontWeight:700, fontSize:dims.f, flex:1, minWidth:0,
                        overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                        color: isWinner ? "var(--accent2)" : t ? "var(--ink)" : "var(--disabled)" }}>
                        {t ? teamLabel(state, t) : "TBD"}{isWinner && " ✓"}
                      </div>
                      {bet && tIdx !== null && bet.chips(r, m, tIdx)}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
function BracketSheet({ ev, state, gm, onClose, onPick, onPostResult }) {
  const br = state.brackets[ev.id];
  const draw = state.draws[ev.id];
  if (!br || !draw) return null;
  const champ = bracketChampion(br);
  return (
    <Sheet title={`${ev.name} bracket`} onClose={onClose} wide>
      {champ !== null && (
        <div style={{ textAlign:"center", marginBottom:14, padding:"12px", borderRadius:14,
          background:"rgba(194,88,50,0.1)", border:"1px solid rgba(194,88,50,0.4)" }}>
          <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:19, color:"var(--accent2)" }}>
            {teamLabel(state, draw.teams[champ])} take it</span>
        </div>
      )}
      <BracketGrid state={state} ev={ev} gm={gm} onPick={onPick} />
      {gm && champ !== null && !state.results[ev.id] && (
        <Btn onClick={onPostResult} style={{ width:"100%", marginTop:12 }}>Post the result</Btn>
      )}
    </Sheet>
  );
}

/* ─────────── captains draft (GM sets up + can override; on-clock captain picks) ─────────── */
function DraftSheet({ ev, state, gm, me, standings, pool, onClose, onStart, onPick, onUndo, onFinalize, onCancel }) {
  const d = state.drafts?.[ev.id];
  const N = ev.teamCfg?.teams || 2;
  const seedVal = p => ev.sport
    ? (state.seeds?.[p]?.[ev.sport] ?? 0)
    : -(standings.findIndex(s => s.player === p) + 1 || 999);
  const [capMethod, setCapMethod] = useState("pick");
  const [captains, setCaptains] = useState([]);
  if (!d && !pool) return <Sheet title="Captains draft" onClose={onClose}><p style={pStyle}>No draft to show.</p></Sheet>;

  /* ── setup (GM only reaches this) ── */
  if (!d) {
    const applyMethod = mth => {
      setCapMethod(mth);
      if (mth === "seed") setCaptains([...pool].sort((a,b) => seedVal(b) - seedVal(a)).slice(0, N));
      else if (mth === "random") setCaptains(shuffle(pool).slice(0, N));
      else setCaptains([]);
    };
    const toggleCap = p => setCaptains(c =>
      c.includes(p) ? c.filter(x => x !== p) : c.length < N ? [...c, p] : c);
    const CAP_METHODS = [["pick","Pick them"],["seed", ev.sport ? "Top seeds" : "Top standings"],["random","Random"]];
    return (
      <Sheet title={`${ev.name} draft`} onClose={onClose} wide>
        <div style={{ display:"flex", gap:8, marginBottom:12 }}>
          {CAP_METHODS.map(([id,lb]) => (
            <button key={id} onClick={() => applyMethod(id)} style={{ flex:1, padding:"10px 6px", cursor:"pointer",
              borderRadius:10, fontFamily:SANS, fontWeight:700, fontSize:12.5,
              background: capMethod===id ? GOLD_GRAD : "var(--paper)", color: capMethod===id ? "var(--ink0)" : "var(--ink)",
              border: capMethod===id ? "1.5px solid var(--ink0)" : "1.5px solid var(--line)" }}>{lb}</button>
          ))}
        </div>
        <div style={{ ...label, marginBottom:8 }}>Captains {captains.length}/{N}</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,minmax(0,1fr))", gap:6, marginBottom:14 }}>
          {(pool || []).map((p, pi) => {
            const i = captains.indexOf(p);
            return <PlayerChip key={p} small name={i >= 0 ? `${disp(state,p)} (C${i+1})` : disp(state,p)}
              selected={i >= 0} onClick={() => toggleCap(p)}
              style={centeredGridCell(pi, (pool || []).length)} />;
          })}
        </div>
        <Btn disabled={captains.length !== N} onClick={() => onStart(captains, pool)} style={{ width:"100%" }}>
          Start the draft</Btn>
      </Sheet>
    );
  }

  /* ── live board ── */
  const T = d.teams.length;
  const poolEmpty = d.pool.length === 0;
  const onClock = poolEmpty ? -1 : snakeTeam(d.picks.length, T);
  const cur = onClock >= 0 ? d.teams[onClock].captain : null;
  const myTurn = cur && me === cur;
  const canPick = !poolEmpty && (gm || myTurn);
  const round = Math.floor(d.picks.length / T) + 1;
  return (
    <Sheet title={`${ev.name} draft`} onClose={onClose} wide>
      <div style={{ textAlign:"center", marginBottom:14, padding:"11px", borderRadius:14,
        background: poolEmpty ? "rgba(78,110,57,0.14)" : myTurn ? "rgba(240,176,47,0.35)" : "var(--paper2)",
        border:"1.5px solid " + (poolEmpty ? "var(--green)" : myTurn ? "var(--ink)" : "var(--line)") }}>
        <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:24, textTransform:"uppercase", color:"var(--ink)" }}>
          {poolEmpty ? "Draft complete" : myTurn ? "You're on the clock" : `${disp(state, cur)} is on the clock`}</div>
        {!poolEmpty && <div style={{ fontFamily:SANS, fontSize:12.5, color:"var(--muted2)", marginTop:2 }}>
          Round {round}, {d.pool.length} left</div>}
      </div>

      <div style={{ display:"grid", gridTemplateColumns: T > 2 ? "1fr 1fr" : "1fr 1fr", gap:8, marginBottom:14 }}>
        {d.teams.map((t, i) => (
          <div key={i} style={{ background:"var(--paper)", borderRadius:14, padding:"9px 11px",
            border: i === onClock ? "1.5px solid var(--ink)" : "1.5px solid var(--line)",
            ...(i === T - 1 && T % 2 === 1 ? { gridColumn:"1 / -1" } : {}) }}>
            <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6 }}>
              <Tag tone="gold">C</Tag>
              <span style={{ fontFamily:SANS, fontWeight:700, fontSize:12.5, color:"var(--accent2)",
                overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{disp(state, t.captain)}</span>
              <span style={{ flex:1 }} />
              <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:16, color:"var(--muted)" }}>{t.players.length}</span>
            </div>
            <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
              {t.players.map(p => <Avatar key={p} state={state} p={p} size={26} />)}
            </div>
          </div>
        ))}
      </div>

      {!poolEmpty && (
        <>
          <div style={{ ...label, marginBottom:8 }}>{canPick ? "Tap to draft" : "Still available"}</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,minmax(0,1fr))", gap:6, marginBottom:12 }}>
            {d.pool.map((p, i) => <PlayerChip key={p} small name={disp(state,p)}
              disabled={!canPick} onClick={() => canPick && onPick(p)}
              style={centeredGridCell(i, d.pool.length)} />)}
          </div>
        </>
      )}

      {gm && (
        <div style={{ display:"flex", gap:8 }}>
          {poolEmpty
            ? <Btn onClick={onFinalize} style={{ flex:2 }}>Lock in the teams</Btn>
            : <Btn kind="dark" disabled={!d.picks.length} onClick={onUndo} style={{ flex:1 }}>Undo</Btn>}
          <Btn kind="danger" onClick={onCancel} style={{ flex:1 }}>Cancel</Btn>
        </div>
      )}
      {!gm && !poolEmpty && !myTurn && (
        <p style={{ ...pStyle, textAlign:"center", marginBottom:0 }}>Waiting on {disp(state, cur)} to pick.</p>
      )}
    </Sheet>
  );
}

/* ─────────── result entry (GM, real names) ─────────── */
function ResultSheet({ ev, state, onClose, save }) {
  const existing = state.results[ev.id];
  const table = AWARDS[ev.value] || [20, 0, 0];
  const slotIdxs = table.map((v,i) => v>0 ? i : null).filter(i => i !== null);
  const initial = useMemo(() => {
    if (existing?.slots) return existing.slots.map(s => [...(s||[])]);
    const br = state.brackets[ev.id], draw = state.draws[ev.id], st = state.stages[ev.id];
    if (br && draw) {
      const champ = bracketChampion(br);
      if (champ !== null) {
        const final = br.rounds[br.rounds.length-1][0];
        const a = resolveSlot(br, final.a), b = resolveSlot(br, final.b);
        const runner = champ === a ? b : a;
        return [[...draw.teams[champ].players],
          table[1] > 0 && runner !== null ? [...draw.teams[runner].players] : [], []];
      }
    }
    if (st && st.finalWinner !== null && st.finalWinner !== undefined) {
      const v = stageEntrantView(state, st, st.finalWinner);
      return [[...v.players], [], []];
    }
    return [[],[],[]];
  }, []); // eslint-disable-line
  const [slots, setSlots] = useState(initial);
  const [active, setActive] = useState(0);
  const [byPlayer, setByPlayer] = useState(false);
  const [confirmCorrection, setConfirmCorrection] = useState(false);
  const [correctionReason, setCorrectionReason] = useState("");
  const draw = state.draws[ev.id];
  const teamMode = !!draw?.teams?.length && ev.kind !== "solo" && !byPlayer;
  const unchanged = !!existing && JSON.stringify(existing.slots || []) === JSON.stringify(slots);
  const taken = p => slots.findIndex(s => s.includes(p));
  const toggle = p => setSlots(prev => {
    const nx = prev.map(s => [...s]);
    const w = nx.findIndex(s => s.includes(p));
    if (w === active) nx[active] = nx[active].filter(x => x !== p);
    else { if (w >= 0) nx[w] = nx[w].filter(x => x !== p); nx[active].push(p); }
    return nx;
  });
  const teamSlot = t => slots.findIndex(s => t.players.length && t.players.every(p => s.includes(p)));
  const toggleTeam = t => setSlots(prev => {
    const was = prev.findIndex(s => t.players.length && t.players.every(p => s.includes(p)));
    const nx = prev.map(s => s.filter(p => !t.players.includes(p)));
    if (was !== active) nx[active] = [...nx[active], ...t.players];
    return nx;
  });
  return (
    <Sheet title={`${ev.name} result`} onClose={onClose}>
      <div style={{ display:"flex", gap:8, marginBottom:14 }}>
        {slotIdxs.map(i => (
          <button key={i} onClick={() => setActive(i)} style={{ flex:1, padding:"10px 6px", cursor:"pointer",
            borderRadius:14, border:"1px solid " + (active===i ? "var(--accent)" : "var(--line)"),
            background: active===i ? "rgba(194,88,50,0.1)" : "var(--paper2)" }}>
            <div style={{ fontFamily:SANS, fontWeight:700, fontSize:14, color:SLOT_META[i].color }}>
              {ev.kind==="solo" ? SLOT_META[i].label : SLOT_META[i].team}</div>
            <div style={{ fontFamily:SANS, fontSize:11, color:"var(--muted)" }}>+{table[i]} each, {slots[i].length} in</div>
          </button>
        ))}
      </div>
      {teamMode ? (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:10 }}>
          {draw.teams.map((t, i) => {
            const w = teamSlot(t);
            return (
              <button key={i} onClick={() => toggleTeam(t)} style={{ display:"flex", alignItems:"center", gap:8,
                padding:"10px 11px", borderRadius:14, cursor:"pointer", textAlign:"left",
                background: w === active ? GOLD_GRAD : "var(--paper)",
                border: w === active ? "1.5px solid var(--ink0)" : "1.5px solid var(--line)",
                ...(draw.teams.length % 2 === 1 && i === draw.teams.length - 1
                  ? { gridColumn:"1 / -1" } : {}) }}>
                <AvatarStack state={state} players={t.players} size={22} max={3} />
                <span style={{ flex:1, fontFamily:SANS, fontWeight:600, fontSize:12.5, minWidth:0,
                  overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                  color: w === active ? "var(--ink0)" : "var(--ink)" }}>{teamLabel(state, t)}</span>
                {w >= 0 && w !== active && <span style={{ fontFamily:SANS, fontWeight:700, fontSize:11,
                  color:SLOT_META[w].color, flexShrink:0 }}>{SLOT_META[w].label}</span>}
              </button>
            );
          })}
        </div>
      ) : (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,minmax(0,1fr))", gap:8, marginBottom:10 }}>
          {ROSTER.map((p, i) => {
            const w = taken(p);
            return <PlayerChip key={p} name={w>=0 && w!==active ? `${p} (${SLOT_META[w].label})` : p}
              selected={w===active} onClick={() => toggle(p)} small
              style={centeredGridCell(i, ROSTER.length)} />;
          })}
        </div>
      )}
      {!!draw?.teams?.length && ev.kind !== "solo" && (
        <button onClick={() => setByPlayer(v => !v)} style={{ background:"none", border:"none", cursor:"pointer",
          fontFamily:SANS, fontWeight:600, fontSize:12.5, color:"var(--accent2)", padding:"0 0 14px", display:"block" }}>
          {byPlayer ? "Back to teams" : "Pick player by player instead"}</button>
      )}
      {!existing ? (
        <Btn disabled={slots[0].length===0} onClick={() => save(slots)}
          style={{ width:"100%", fontSize:16, padding:"14px", marginTop:4 }}>
          Post official result</Btn>
      ) : !confirmCorrection ? (
        <Btn disabled={slots[0].length===0 || unchanged} onClick={() => setConfirmCorrection(true)}
          style={{ width:"100%", fontSize:16, padding:"14px", marginTop:4 }}>
          {unchanged ? `Official result · revision ${existing.revision || 1}` : "Review result correction"}</Btn>
      ) : (
        <div style={{ marginTop:4, padding:"12px 13px", background:"var(--paper2)",
          border:"1px solid var(--line)", borderRadius:14 }}>
          <div style={{ ...label, marginBottom:6 }}>Why is the official result changing?</div>
          <input value={correctionReason} onChange={event => setCorrectionReason(event.target.value)}
            maxLength={100} placeholder="Example: 2nd and 3rd were reversed"
            style={{ width:"100%", background:"var(--paper)", border:"1px solid var(--line)",
              borderRadius:10, padding:"11px 12px", color:"var(--ink)", fontFamily:SANS,
              fontWeight:600, fontSize:14, marginBottom:9, outline:"none" }} />
          <div style={{ display:"flex", gap:8 }}>
            <Btn kind="danger" disabled={!correctionReason.trim()}
              onClick={() => save(slots, {
                confirmOverwrite:true,
                correctionReason,
              })} style={{ flex:1 }}>Replace official result</Btn>
            <Btn kind="ghost" onClick={() => {
              setConfirmCorrection(false);
              setCorrectionReason("");
            }} style={{ flex:1 }}>Keep current</Btn>
          </div>
        </div>
      )}
    </Sheet>
  );
}

/* ─────────── how to play ─────────── */
/* Event marks share one scorecard seal and one optical box. The equipment
   inside can stay distinctive without each icon inventing its own scale,
   background, or border language. */
const svgMark = (s, kids) => (
  <svg width={s} height={s} viewBox="0 0 32 32" aria-hidden="true"
    style={{ flexShrink:0, display:"block" }}>
    <circle cx="16" cy="16" r="15" fill="var(--paper2)" stroke="var(--line)" strokeWidth="1.2" />
    <g transform="translate(2 2) scale(.875)">{kids}</g>
  </svg>
);
const MARKS = {
  poker: s => svgMark(s, <>
    <g transform="rotate(-14 12 13)">
      <rect x="6.5" y="4.5" width="11" height="15" rx="2" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.5"/>
    </g>
    <g transform="rotate(10 21 12)">
      <rect x="15" y="3.5" width="11" height="15" rx="2" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.5"/>
      <circle cx="20.5" cy="11" r="2.4" fill="var(--accent)"/>
    </g>
    <circle cx="16" cy="23.5" r="7.2" fill="var(--sun)" stroke="var(--ink0)" strokeWidth="1.6"/>
    {[45, 135, 225, 315].map(deg => {
      const a = deg * Math.PI / 180;
      return <line key={deg}
        x1={16 + Math.cos(a) * 4.6} y1={23.5 + Math.sin(a) * 4.6}
        x2={16 + Math.cos(a) * 6.6} y2={23.5 + Math.sin(a) * 6.6}
        stroke="var(--bone)" strokeWidth="1.7" strokeLinecap="round"/>;
    })}
  </>),
  putting: s => svgMark(s, <>
    <path d="M11 27V6" stroke="var(--ink)" strokeWidth="1.8" strokeLinecap="round"/>
    <path d="M11 6l10 3-10 3z" fill="var(--accent)" stroke="var(--ink)" strokeWidth="1.6" strokeLinejoin="round"/>
    <ellipse cx="15" cy="27" rx="8" ry="2.2" fill="var(--paper2)" stroke="var(--ink)" strokeWidth="1.4"/>
  </>),
  "8ball": s => svgMark(s, <>
    <circle cx="16" cy="16" r="11" fill="var(--ink0)" stroke="var(--bone)" strokeWidth="1.2"/>
    <circle cx="16" cy="16" r="5" fill="var(--paper)"/>
    <text x="16" y="19.4" textAnchor="middle" fontSize="8" fontWeight="700" fontFamily={SANS} fill="var(--ink)">8</text>
  </>),
  basketball: s => svgMark(s, <>
    <circle cx="16" cy="16" r="11" fill="var(--accent)" stroke="var(--ink)" strokeWidth="1.8"/>
    <path d="M5 16h22M16 5v22M8.5 8c4.5 4 4.5 12 0 16M23.5 8c-4.5 4-4.5 12 0 16" stroke="var(--ink)" strokeWidth="1.3" fill="none"/>
  </>),
  spikeball: s => svgMark(s, <>
    <circle cx="16" cy="8.5" r="3.6" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.7"/>
    <ellipse cx="16" cy="22" rx="11" ry="4.5" fill="var(--sun)" stroke="var(--ink)" strokeWidth="1.8"/>
    <path d="M9 22h14M16 17.5v9" stroke="var(--ink)" strokeWidth="1.1"/>
  </>),
  volleyball: s => svgMark(s, <>
    <circle cx="12" cy="16" r="8" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.8"/>
    <path d="M12 8c3 4 3 12 0 16M5 13.5c5 1.5 12 1 15-3.5" stroke="var(--ink)" strokeWidth="1.1" fill="none"/>
    <path d="M25 5v22" stroke="var(--ink)" strokeWidth="1.5" strokeDasharray="2 2"/>
  </>),
  die: s => svgMark(s, <>
    <rect x="6" y="6" width="20" height="20" rx="5" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.8"/>
    <circle cx="11.5" cy="11.5" r="1.8" fill="var(--ink)"/><circle cx="20.5" cy="11.5" r="1.8" fill="var(--ink)"/>
    <circle cx="16" cy="16" r="1.8" fill="var(--ink)"/>
    <circle cx="11.5" cy="20.5" r="1.8" fill="var(--ink)"/><circle cx="20.5" cy="20.5" r="1.8" fill="var(--ink)"/>
  </>),
  beerio: s => svgMark(s, <>
    <circle cx="13" cy="16" r="9" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.8"/>
    <circle cx="13" cy="16" r="3" fill="var(--accent)" stroke="var(--ink)" strokeWidth="1.3"/>
    <path d="M13 8.5v4.5M8 20l3.5-2.5" stroke="var(--ink)" strokeWidth="1.5" strokeLinecap="round"/>
    <rect x="21" y="12" width="6" height="10" rx="1.5" fill="var(--sun)" stroke="var(--ink)" strokeWidth="1.5"/>
  </>),
  pickleball: s => svgMark(s, <>
    <ellipse cx="13" cy="12.5" rx="8" ry="9" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.8"/>
    <path d="M11 21l-3.5 6" stroke="var(--ink)" strokeWidth="2.2" strokeLinecap="round"/>
    <circle cx="23" cy="21" r="4.5" fill="var(--sun)" stroke="var(--ink)" strokeWidth="1.5"/>
    <circle cx="21.6" cy="20" r="0.7" fill="var(--ink)"/><circle cx="24" cy="20" r="0.7" fill="var(--ink)"/><circle cx="22.8" cy="22.4" r="0.7" fill="var(--ink)"/>
  </>),
  foosball: s => svgMark(s, <>
    <path d="M16 3v26" stroke="var(--ink)" strokeWidth="1.8" strokeLinecap="round"/>
    <rect x="11" y="12" width="10" height="8" rx="2" fill="var(--accent)" stroke="var(--ink)" strokeWidth="1.6"/>
    <path d="M12.5 20l-2 5M19.5 20l2 5" stroke="var(--ink)" strokeWidth="1.6" strokeLinecap="round"/>
    <circle cx="8" cy="24.5" r="2" fill="var(--sun)" stroke="var(--ink)" strokeWidth="1.3"/>
  </>),
  pingpong: s => svgMark(s, <>
    <circle cx="14" cy="13" r="8" fill="var(--accent)" stroke="var(--ink)" strokeWidth="1.8"/>
    <path d="M12 20.5l-4 6.5" stroke="var(--ink)" strokeWidth="2.2" strokeLinecap="round"/>
    <circle cx="24" cy="22" r="3" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.5"/>
  </>),
  pong: s => svgMark(s, <>
    <path d="M10 12h12l-1.5 13h-9z" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.8" strokeLinejoin="round"/>
    <ellipse cx="16" cy="12" rx="6" ry="1.8" fill="var(--paper2)" stroke="var(--ink)" strokeWidth="1.4"/>
    <circle cx="16" cy="6" r="2.6" fill="var(--sun)" stroke="var(--ink)" strokeWidth="1.4"/>
  </>),
  flipcup: s => svgMark(s, <>
    <path d="M6 27a10 5 0 0 1 20 0" fill="none" stroke="var(--ink)" strokeWidth="1.1" strokeDasharray="2 2"/>
    <g transform="rotate(34 16 15)">
      <path d="M12 9h8l-1 11h-6z" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.8" strokeLinejoin="round"/>
      <ellipse cx="16" cy="9" rx="4" ry="1.4" fill="var(--paper2)" stroke="var(--ink)" strokeWidth="1.2"/>
    </g>
  </>),
  ragecage: s => svgMark(s, <>
    <circle cx="16" cy="16" r="3.6" fill="var(--accent)" stroke="var(--ink)" strokeWidth="1.5"/>
    {[0,60,120,180,240,300].map(a => {
      const r = 10, x = 16 + r*Math.cos(a*Math.PI/180), y = 16 + r*Math.sin(a*Math.PI/180);
      return <circle key={a} cx={x} cy={y} r="2.6" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.4"/>;
    })}
  </>),
  /* the gauntlet: five stations on a timed circuit, last one lit */
  gauntlet: s => svgMark(s, <>
    <path d="M6 24 L10 9 L16 20 L22 7 L26 22" fill="none" stroke="var(--ink)"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    {[[6,24],[10,9],[16,20],[22,7]].map(([x,y], i) => (
      <circle key={i} cx={x} cy={y} r="2.6" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.5"/>
    ))}
    <circle cx="26" cy="22" r="3.4" fill="var(--sun)" stroke="var(--ink0)" strokeWidth="1.6"/>
  </>),
};
/* One pictogram system for every event: the same rounded score tile, the same
   2.4px line, and one terracotta signal. The former marks mixed illustrations,
   filled objects, and several optical scales; this family stays legible from
   the 26px schedule rail through the full-screen announcement. */
function EventGlyph({ id }) {
  const bone = "var(--bone)", accent = "var(--accent2)", sun = "var(--sun)";
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
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true"
      style={{ flexShrink:0, display:"block", filter:hero ? "drop-shadow(0 14px 26px rgba(10,6,3,.32))" : "none" }}>
      <rect x="1.5" y="1.5" width="45" height="45" rx="14"
        fill={hero ? "var(--night2)" : "var(--paper2)"} stroke="var(--bone-line)" strokeWidth="1.5" />
      <EventGlyph id={id} />
      <circle cx="39.5" cy="8.5" r="2.4" fill="var(--accent2)" />
    </svg>
  );
}

/* One broadcast ident, with the event's own mark doing the differentiating.
   Subtle rings and a single rule replace fifteen novelty mini-animations. */
function EventSpotlight({ gameId, big=false }) {
  const mark = big ? 150 : 112;
  const box = big ? 242 : 176;
  return (
    <div style={{ position:"relative", width:box, height:box, display:"grid", placeItems:"center" }}>
      <span className="si-event-ring" aria-hidden="true" />
      <span className="si-event-ring si-event-ring-2" aria-hidden="true" />
      <span className="si-event-rule si-event-rule-left" aria-hidden="true" />
      <span className="si-event-rule si-event-rule-right" aria-hidden="true" />
      <span className="si-event-mark"><GameMark id={gameId} size={mark} hero /></span>
    </div>
  );
}
/* beer die flagship: a die that arcs and bounces off the far edge of the table */
function DieHero() {
  return (
    <svg width="180" height="82" viewBox="0 0 180 82" aria-hidden="true" style={{ display:"block", overflow:"visible" }}>
      <line x1="8" y1="60" x2="172" y2="60" stroke="var(--sun)" strokeWidth="3" strokeLinecap="round"/>
      <line x1="8" y1="66" x2="172" y2="66" stroke="var(--ink)" strokeWidth="1.6" strokeLinecap="round" opacity="0.4"/>
      <g style={{ animation:"si-die-arc 2.6s linear 1 both" }}>
        <rect x="0" y="0" width="20" height="20" rx="4.5" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.8"/>
        <circle cx="5.5" cy="5.5" r="1.7" fill="var(--ink)"/>
        <circle cx="14.5" cy="5.5" r="1.7" fill="var(--ink)"/>
        <circle cx="10" cy="10" r="1.7" fill="var(--ink)"/>
        <circle cx="5.5" cy="14.5" r="1.7" fill="var(--ink)"/>
        <circle cx="14.5" cy="14.5" r="1.7" fill="var(--ink)"/>
      </g>
    </svg>
  );
}
/* pong ball arcs down the table and drops in the cup */
function PongHero() {
  return (
    <svg width="180" height="82" viewBox="0 0 180 82" aria-hidden="true" style={{ display:"block", overflow:"visible" }}>
      <line x1="8" y1="60" x2="172" y2="60" stroke="var(--sun)" strokeWidth="3" strokeLinecap="round"/>
      <path d="M112 30h20l-2.5 28h-15z" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.8" strokeLinejoin="round"/>
      <ellipse cx="122" cy="30" rx="10" ry="3" fill="var(--paper2)" stroke="var(--ink)" strokeWidth="1.4"/>
      <g style={{ animation:"si-pong-arc 2s linear 1 both" }}>
        <circle cx="8" cy="0" r="5.5" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.6"/>
      </g>
    </svg>
  );
}
/* flip cup: the cup hops, turns over, and sticks the landing */
function FlipHero() {
  return (
    <svg width="180" height="82" viewBox="0 0 180 82" aria-hidden="true" style={{ display:"block", overflow:"visible" }}>
      <line x1="8" y1="60" x2="172" y2="60" stroke="var(--sun)" strokeWidth="3" strokeLinecap="round"/>
      <g style={{ animation:"si-flip-cup 2.2s ease-in-out 1 both", transformOrigin:"90px 46px" }}>
        <path d="M78 32h24l-3 28H81z" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.8" strokeLinejoin="round"/>
        <ellipse cx="90" cy="32" rx="12" ry="3.4" fill="var(--paper2)" stroke="var(--ink)" strokeWidth="1.4"/>
      </g>
    </svg>
  );
}
/* putt rolls the length of the green and drops at the flag */
function PuttHero() {
  return (
    <svg width="180" height="82" viewBox="0 0 180 82" aria-hidden="true" style={{ display:"block", overflow:"visible" }}>
      <line x1="8" y1="60" x2="132" y2="60" stroke="var(--sun)" strokeWidth="3" strokeLinecap="round"/>
      <line x1="146" y1="60" x2="172" y2="60" stroke="var(--sun)" strokeWidth="3" strokeLinecap="round"/>
      <line x1="139" y1="60" x2="139" y2="26" stroke="var(--ink)" strokeWidth="1.8"/>
      <path d="M139 26h16l-5 5.5 5 5.5h-16z" fill="var(--accent)" stroke="var(--ink)" strokeWidth="1.4" strokeLinejoin="round"/>
      <g style={{ animation:"si-putt 2.4s ease-in-out 1 both" }}>
        <circle cx="12" cy="54" r="5" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.6"/>
      </g>
    </svg>
  );
}
/* cue ball breaks, the 8 rolls for the corner */
function EightHero() {
  return (
    <svg width="180" height="82" viewBox="0 0 180 82" aria-hidden="true" style={{ display:"block", overflow:"visible" }}>
      <line x1="8" y1="60" x2="172" y2="60" stroke="var(--sun)" strokeWidth="3" strokeLinecap="round"/>
      <g style={{ animation:"si-cue 2.4s ease-out 1 both" }}>
        <circle cx="26" cy="52" r="7" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.6"/>
      </g>
      <g style={{ animation:"si-eight 2.4s ease-out 1 both" }}>
        <circle cx="96" cy="52" r="7" fill="var(--ink0)" stroke="var(--bone)" strokeWidth="1.6"/>
        <circle cx="96" cy="52" r="3.2" fill="var(--paper)"/>
        <text x="96" y="54.6" textAnchor="middle" fontSize="5" fontWeight="700" fontFamily={SANS} fill="var(--ink0)">8</text>
      </g>
    </svg>
  );
}
/* the shot arcs in off the glass */
function BballHero() {
  return (
    <svg width="180" height="82" viewBox="0 0 180 82" aria-hidden="true" style={{ display:"block", overflow:"visible" }}>
      <line x1="8" y1="60" x2="172" y2="60" stroke="var(--sun)" strokeWidth="3" strokeLinecap="round"/>
      <line x1="158" y1="12" x2="158" y2="34" stroke="var(--ink)" strokeWidth="2.2"/>
      <line x1="142" y1="32" x2="158" y2="32" stroke="var(--accent)" strokeWidth="2.6" strokeLinecap="round"/>
      <line x1="144" y1="32" x2="147" y2="43" stroke="var(--ink)" strokeWidth="1.2" opacity="0.6"/>
      <line x1="155" y1="32" x2="153" y2="43" stroke="var(--ink)" strokeWidth="1.2" opacity="0.6"/>
      <g style={{ animation:"si-bball 2.4s ease-in-out 1 both" }}>
        <circle cx="16" cy="50" r="7" fill="var(--accent)" stroke="var(--ink)" strokeWidth="1.6"/>
        <path d="M9 50h14M16 43v14" stroke="var(--ink)" strokeWidth="1.1" opacity="0.7"/>
      </g>
    </svg>
  );
}
/* serve down onto the net, pocket shot pops away */
function SpikeHero() {
  return (
    <svg width="180" height="82" viewBox="0 0 180 82" aria-hidden="true" style={{ display:"block", overflow:"visible" }}>
      <line x1="8" y1="60" x2="172" y2="60" stroke="var(--sun)" strokeWidth="3" strokeLinecap="round"/>
      <ellipse cx="90" cy="52" rx="22" ry="6" fill="var(--paper2)" stroke="var(--ink)" strokeWidth="1.8"/>
      <path d="M74 56l-5 4M106 56l5 4" stroke="var(--ink)" strokeWidth="1.8" strokeLinecap="round"/>
      <g style={{ animation:"si-spike 2.2s ease-in 1 both" }}>
        <circle cx="14" cy="8" r="5.5" fill="var(--sun)" stroke="var(--ink0)" strokeWidth="1.6"/>
      </g>
    </svg>
  );
}
/* rally over the net, three touches across */
function PingpongHero() {
  return (
    <svg width="180" height="82" viewBox="0 0 180 82" aria-hidden="true" style={{ display:"block", overflow:"visible" }}>
      <line x1="8" y1="60" x2="172" y2="60" stroke="var(--sun)" strokeWidth="3" strokeLinecap="round"/>
      <line x1="90" y1="60" x2="90" y2="46" stroke="var(--ink)" strokeWidth="2"/>
      <g transform="rotate(-30 22 48)">
        <ellipse cx="22" cy="44" rx="8" ry="10" fill="var(--accent)" stroke="var(--ink)" strokeWidth="1.6"/>
        <rect x="20" y="54" width="4" height="9" rx="2" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.2"/>
      </g>
      <g transform="rotate(30 158 48)">
        <ellipse cx="158" cy="44" rx="8" ry="10" fill="var(--pool)" stroke="var(--ink)" strokeWidth="1.6"/>
        <rect x="156" y="54" width="4" height="9" rx="2" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.2"/>
      </g>
      <g style={{ animation:"si-pingpong 2.4s linear 1 both" }}>
        <circle cx="34" cy="40" r="4" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.4"/>
      </g>
    </svg>
  );
}
/* the rod snaps and the shot beats the keeper */
function FoosHero() {
  return (
    <svg width="180" height="82" viewBox="0 0 180 82" aria-hidden="true" style={{ display:"block", overflow:"visible" }}>
      <line x1="8" y1="60" x2="172" y2="60" stroke="var(--sun)" strokeWidth="3" strokeLinecap="round"/>
      <path d="M160 38v22M172 38v22M160 38h12" fill="none" stroke="var(--ink)" strokeWidth="2"/>
      <g style={{ animation:"si-foosman 2.4s ease-in-out 1 both" }}>
        <line x1="96" y1="10" x2="96" y2="50" stroke="var(--ink)" strokeWidth="2.4"/>
        <path d="M91 32h10l-1.6 14h-6.8z" fill="var(--clay)" stroke="var(--ink)" strokeWidth="1.4" strokeLinejoin="round"/>
      </g>
      <g style={{ animation:"si-foos 2.4s ease-out 1 both" }}>
        <circle cx="24" cy="54" r="5.5" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.6"/>
      </g>
    </svg>
  );
}
/* high arc over the tall net, side out */
function VolleyHero() {
  return (
    <svg width="180" height="82" viewBox="0 0 180 82" aria-hidden="true" style={{ display:"block", overflow:"visible" }}>
      <line x1="8" y1="60" x2="172" y2="60" stroke="var(--sun)" strokeWidth="3" strokeLinecap="round"/>
      <line x1="90" y1="60" x2="90" y2="18" stroke="var(--ink)" strokeWidth="2.2"/>
      <line x1="82" y1="18" x2="98" y2="18" stroke="var(--ink)" strokeWidth="2.6" strokeLinecap="round"/>
      <path d="M84 24h12M84 30h12" stroke="var(--ink)" strokeWidth="1.1" opacity="0.55"/>
      <g style={{ animation:"si-volley 2.4s ease-in-out 1 both" }}>
        <circle cx="18" cy="46" r="6.5" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.6"/>
        <path d="M11.5 46c4-3.4 9-3.4 13 0M18 39.5v13" stroke="var(--ink)" strokeWidth="1.1" opacity="0.7"/>
      </g>
    </svg>
  );
}
/* third shot drops soft over the kitchen */
function PickleHero() {
  return (
    <svg width="180" height="82" viewBox="0 0 180 82" aria-hidden="true" style={{ display:"block", overflow:"visible" }}>
      <line x1="8" y1="60" x2="172" y2="60" stroke="var(--sun)" strokeWidth="3" strokeLinecap="round"/>
      <line x1="90" y1="60" x2="90" y2="40" stroke="var(--ink)" strokeWidth="2"/>
      <line x1="83" y1="40" x2="97" y2="40" stroke="var(--ink)" strokeWidth="2.4" strokeLinecap="round"/>
      <line x1="64" y1="60" x2="64" y2="56" stroke="var(--ink)" strokeWidth="1.6" opacity="0.6"/>
      <line x1="116" y1="60" x2="116" y2="56" stroke="var(--ink)" strokeWidth="1.6" opacity="0.6"/>
      <g style={{ animation:"si-pickle 2.4s ease-in-out 1 both" }}>
        <circle cx="18" cy="50" r="5" fill="var(--sun)" stroke="var(--ink0)" strokeWidth="1.5"/>
      </g>
    </svg>
  );
}
/* the kart hops the finish line, beer stays upright */
function KartHero() {
  return (
    <svg width="180" height="82" viewBox="0 0 180 82" aria-hidden="true" style={{ display:"block", overflow:"visible" }}>
      <line x1="8" y1="60" x2="172" y2="60" stroke="var(--sun)" strokeWidth="3" strokeLinecap="round"/>
      <path d="M150 60v-22M150 38h6v4h-6M150 46h6v4h-6" stroke="var(--ink)" strokeWidth="1.8" fill="none"/>
      <g style={{ animation:"si-kart 2.6s ease-in-out 1 both" }}>
        <path d="M10 46h30l-4 8H16z" fill="var(--clay)" stroke="var(--ink)" strokeWidth="1.6" strokeLinejoin="round"/>
        <path d="M20 40h12l2 6H18z" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.4" strokeLinejoin="round"/>
        <circle cx="17" cy="56" r="4.4" fill="var(--ink0)" stroke="var(--bone)" strokeWidth="1.4"/>
        <circle cx="35" cy="56" r="4.4" fill="var(--ink0)" stroke="var(--bone)" strokeWidth="1.4"/>
      </g>
    </svg>
  );
}
/* sink, stack, next cup in the ring */
function RageHero() {
  return (
    <svg width="180" height="82" viewBox="0 0 180 82" aria-hidden="true" style={{ display:"block", overflow:"visible" }}>
      <line x1="8" y1="60" x2="172" y2="60" stroke="var(--sun)" strokeWidth="3" strokeLinecap="round"/>
      {[64, 90, 116].map(x => (
        <g key={x}>
          <path d={`M${x - 9} 36h18l-2.4 24h-13.2z`} fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.6" strokeLinejoin="round"/>
          <ellipse cx={x} cy="36" rx="9" ry="2.8" fill="var(--paper2)" stroke="var(--ink)" strokeWidth="1.2"/>
        </g>
      ))}
      <g style={{ animation:"si-rage 2.2s ease-in 1 both" }}>
        <circle cx="16" cy="10" r="4.5" fill="var(--sun)" stroke="var(--ink0)" strokeWidth="1.4"/>
      </g>
    </svg>
  );
}
/* five stations, one clean run */
function GauntletHero() {
  return (
    <svg width="180" height="82" viewBox="0 0 180 82" aria-hidden="true" style={{ display:"block", overflow:"visible" }}>
      <line x1="8" y1="60" x2="172" y2="60" stroke="var(--sun)" strokeWidth="3" strokeLinecap="round"/>
      {[36, 68, 100, 132, 164].map((x, i) => (
        <rect key={x} x={x - 7} y="50" width="14" height="10" rx="2"
          fill={i === 4 ? "var(--accent)" : "var(--paper2)"} stroke="var(--ink)" strokeWidth="1.4"/>
      ))}
      <g style={{ animation:"si-gauntlet 2.8s ease-in-out 1 both" }}>
        <circle cx="12" cy="44" r="5.5" fill="var(--sun)" stroke="var(--ink0)" strokeWidth="1.6"/>
      </g>
    </svg>
  );
}
/* two cards hit the felt, the chip follows */
function PokerHero() {
  return (
    <svg width="180" height="82" viewBox="0 0 180 82" aria-hidden="true" style={{ display:"block", overflow:"visible" }}>
      <line x1="8" y1="60" x2="172" y2="60" stroke="var(--sun)" strokeWidth="3" strokeLinecap="round"/>
      <g style={{ animation:"si-deal1 2.4s ease-out 1 both" }}>
        <rect x="70" y="26" width="18" height="26" rx="3" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.6"/>
      </g>
      <g style={{ animation:"si-deal2 2.4s ease-out 1 both" }}>
        <rect x="92" y="26" width="18" height="26" rx="3" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.6"/>
        <circle cx="101" cy="39" r="3.4" fill="var(--accent)"/>
      </g>
      <g style={{ animation:"si-chip-in 2.4s ease-in-out 1 both" }}>
        <circle cx="16" cy="52" r="7.5" fill="var(--sun)" stroke="var(--ink0)" strokeWidth="1.6"/>
        <circle cx="16" cy="52" r="4.2" fill="none" stroke="var(--chip-mark)" strokeWidth="1.6"/>
      </g>
    </svg>
  );
}
/* One hero per GAMES id. HowToSheet, EventIntro, and the TV betting board all
   read this registry; anything unregistered falls back to its GameMark, and
   custom events fall back to the FD chip. Adding an event later:
   BUILTIN_EVENTS entry in core (or the GM add-event flow), then optionally a
   GAMES howto, a MARKS icon, and a hero here. Nothing else to wire. */
const GAME_HEROES = { die: DieHero, pong: PongHero, flipcup: FlipHero,
  putting: PuttHero, "8ball": EightHero, basketball: BballHero, spikeball: SpikeHero,
  pingpong: PingpongHero, foosball: FoosHero, volleyball: VolleyHero,
  pickleball: PickleHero, beerio: KartHero, ragecage: RageHero, gauntlet: GauntletHero, poker: PokerHero };
/* optional, on-demand rules for one game. Purely client-side, nested over the sheet below. */
function HowToSheet({ gameId, variant, onClose }) {
  const game = GAMES[gameId];
  const variants = game?.variants || null;
  const [vIdx, setVIdx] = useState(() => {
    const i = variants ? variants.findIndex(v => v.id === variant) : -1;
    return i < 0 ? 0 : i;
  });
  const h = variants ? variants[vIdx]?.howto : game?.howto;
  const steps = h?.steps || [];
  const rm = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const [shown, setShown] = useState(rm ? steps.length : 0);
  const [heroKey, setHeroKey] = useState(0);
  useEffect(() => { setShown(rm ? steps.length : 0); }, [vIdx]); // eslint-disable-line
  useEffect(() => {
    if (shown >= steps.length) return;
    const t = setTimeout(() => setShown(s => s + 1), shown === 0 ? 320 : 480);
    return () => clearTimeout(t);
  }, [shown, steps.length]);
  if (!h) return null;
  return (
    <Sheet title="How to play" onClose={onClose}>
      <div onClick={() => setHeroKey(k => k + 1)}
        style={{ display:"flex", justifyContent:"center", alignItems:"center", minHeight:82, marginBottom:6,
          cursor:"pointer" }} aria-label={`Replay ${game.name} mark`}>
        <span key={heroKey} style={{ animation:"si-intro-mark .55s cubic-bezier(.2,.85,.28,1) both" }}>
          <GameMark id={gameId} size={76} hero />
        </span>
      </div>
      <div style={{ ...label, textAlign:"center", marginBottom:5 }}>{game.name}</div>
      {variants && (
        <div style={{ display:"flex", justifyContent:"center", gap:6, marginBottom:12 }}>
          {variants.map((v, i) => (
            <button key={v.id} onClick={() => setVIdx(i)} style={{ fontFamily:DISPLAY, fontWeight:700,
              fontSize:16, padding:"7px 18px", borderRadius:99, cursor:"pointer",
              background: i === vIdx ? "var(--sun)" : "var(--paper)",
              color: i === vIdx ? "var(--ink0)" : "var(--ink)",
              border: i === vIdx ? "1.5px solid var(--ink0)" : "1.5px solid var(--line)" }}>{v.label}</button>
          ))}
        </div>
      )}
      {h.objective && <p style={{ ...pStyle, textAlign:"center", marginBottom:12 }}>{h.objective}</p>}
      <div style={{ display:"flex", gap:6, flexWrap:"wrap", justifyContent:"center", marginBottom:16 }}>
        {h.players && <Tag tone="gold">{h.players}</Tag>}
        {(h.gear || []).map(g => <Tag key={g}>{g}</Tag>)}
      </div>
      <ol style={{ listStyle:"none", padding:0, margin:"0 0 16px" }}>
        {steps.map((s, i) => (
          <li key={i} style={{ display:"flex", gap:12, alignItems:"flex-start", padding:"9px 0",
            borderBottom: i < steps.length-1 ? "1px solid var(--line)" : "none",
            visibility: i < shown ? "visible" : "hidden",
            animation: i < shown ? "si-in .32s ease-out both" : "none" }}>
            <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:19, lineHeight:1, color:"var(--accent2)",
              minWidth:20, textAlign:"center" }}>{i+1}</span>
            <span style={{ fontFamily:SANS, fontSize:14, lineHeight:1.5, color:"var(--muted2)" }}>{s}</span>
          </li>
        ))}
      </ol>
      <div style={{ background:"var(--paper2)", border:"1.5px solid var(--ink)", borderRadius:14,
        padding:"11px 13px", marginBottom: h.house ? 10 : 0 }}>
        <div style={{ ...label, fontSize:11, marginBottom:4 }}>To win</div>
        <div style={{ fontFamily:SANS, fontSize:14, lineHeight:1.5, color:"var(--ink)" }}>{h.win}</div>
      </div>
      {h.house && (
        <div style={{ fontFamily:SANS, fontSize:12.5, lineHeight:1.5, color:"var(--muted)" }}>
          <b style={{ color:"var(--accent2)" }}>House rule.</b> {h.house}
        </div>
      )}
    </Sheet>
  );
}

/* ─────────── wagers ─────────── */
function wagerPickLabel(state, w, events) {
  const ev = events.find(e => e.id === w.eventId);
  const evName = ev?.name || "removed event";
  const pickName = w.pickTeam || w.pickPlayers?.length > 1
    ? teamLabel(state, { players: w.pickPlayers })
    : disp(state, w.pickPlayers ? w.pickPlayers[0] : w.pick);
  if (w.kind === "outright") return { pick: pickName, ctx: `to win ${evName}` };
  if (w.kind === "match") return { pick: pickName, ctx: `to win the ${w.matchName || "matchup"} in ${evName}` };
  if (w.final) return { pick: pickName, ctx: `to win the Final in ${evName}` };
  return { pick: pickName, ctx: `to advance from ${w.groupName} in ${evName}` };
}

/* rack denominations: 10 is the chip quantum, the bigger chips keep taps
   quick as stacks grow. Anything unaffordable sits gray in the rack */
const RACK_DENOMS = [PT, 2 * PT, 5 * PT, 10 * PT];

/* New wagers are aggregated by the server. This compatibility merge keeps
   older snapshots with separate same-pick records equally readable. w.ids
   carries every underlying record id for commissioner void actions. */
function mergeWagerLines(list) {
  const key = ({ w, r }) => [w.player, r.status, w.kind, w.eventId,
    w.kind === "outright" ? (w.pickTeam ? "t:" + w.drawId + ":" + (w.pickPlayers || []).join("+") : "p:" + w.pick)
      : w.kind === "match" ? "m:" + w.drawId + ":" + (w.match || []).join("-") + ":" + w.teamIdx
      : "s:" + w.stagesId + ":" + (w.final ? "F" : w.group) + ":" + w.pickKey].join("|");
  const out = new Map();
  for (const x of list) {
    const k = key(x), cur = out.get(k);
    if (!cur) out.set(k, { w: { ...x.w, ids: [x.w.id] }, r: { ...x.r } });
    else {
      cur.w.stake += x.w.stake;
      cur.w.ids.push(x.w.id);
      if (typeof x.r.delta === "number") cur.r.delta = (cur.r.delta || 0) + x.r.delta;
    }
  }
  return [...out.values()];
}
function Wagers({ state, me, standings, gm, events, onDeckEv, wagerEv, onEvents, onPick, onVoid, onRetract }) {
  const [whoOpen, setWhoOpen] = useState(null);
  /* the rack: pick a chip, then every tap on the board bets that chip */
  const [denom, setDenom] = useState(PT);
  const resolved = useMemo(() => (state.wagers || []).map(w => ({ w, r: resolveWager(state, w, events) })),
    [state, events]);
  const pending = resolved.filter(x => x.r.status === "pending");
  /* One pending server record now represents the bettor's total on that pick;
     legacy separate records are merged for the list below. */
  const pendingLines = mergeWagerLines(pending);
  const settledLines = mergeWagerLines(resolved.filter(x => x.r.status !== "pending"));
  /* thirteen people betting several picks each turns the settled list into a
     wall of near-identical cards. One line per bettor carrying their net, and
     the picks behind it are one tap away. Nothing is dropped: the net is over
     every settled bet, so the line always agrees with the board. */
  const settledByPlayer = useMemo(() => {
    const m = new Map();
    for (const x of settledLines) {
      const g = m.get(x.w.player) || { player:x.w.player, lines:[], net:0 };
      g.lines.push(x);
      g.net += x.r.delta || 0;
      m.set(x.w.player, g);
    }
    return [...m.values()].sort((a, b) => b.net - a.net || a.player.localeCompare(b.player));
  }, [settledLines]); // eslint-disable-line
  const myExp = me ? atRisk(state, me, events) : 0;
  const myPts = standings.find(r => r.player === me)?.pts ?? 0;
  const myCap = maxRisk(myPts);
  const room = me ? Math.max(0, Math.min(myCap - myExp, myPts - myExp)) : 0;

  /* a tap bets the selected chip, clamped down to what the cap leaves you;
     when the room shrinks under the selected chip, snap to the biggest that fits */
  useEffect(() => {
    if (denom > PT && room >= PT && denom > room)
      setDenom([...RACK_DENOMS].reverse().find(d => d <= room) || PT);
  }, [room, denom]);
  const tapStake = Math.max(PT, Math.min(denom, Math.floor(room / PT) * PT));
  const bet = pick => onPick({ ...pick, stake: tapStake });

  const ev = wagerEv;
  const marketOpen = !!onDeckEv && onDeckEv.id === ev?.id;
  const draw = ev ? state.draws[ev.id] : null;
  const br = ev ? state.brackets[ev.id] : null;
  const st = ev ? state.stages[ev.id] : null;

  /* outright candidates */
  let outrights = [];
  if (ev) {
    if (ev.kind === "solo") outrights = ROSTER.map(p => ({
      key:p, players:[p], name: disp(state, p),
      pick: { kind:"outright", eventId:ev.id, pick:p, pickPlayers:[p], pickTeam:false, evName:ev.name },
    }));
    else if (draw) outrights = draw.teams.map((t,i) => ({
      key:"t"+i, players:t.players, name: teamLabel(state, t),
      pick: { kind:"outright", eventId:ev.id, pickTeam:true, pickPlayers:[...t.players], drawId:draw.id, evName:ev.name },
    }));
  }
  const bigTeams = outrights.length > 0 && outrights[0].players.length >= 3;

  /* open stage groups + final */
  let stageGroups = [], stageFinal = null;
  if (ev && st) {
    st.groups.forEach((g, gi) => {
      if ((g.through || []).length < st.advance) {
        const open = g.entrants.filter(k => !(g.through || []).includes(k));
        if (open.length > 1) stageGroups.push({ gi, name:g.name, entrants:open });
      }
    });
    const finalists = stageFinalists(st);
    if (finalists && (st.finalWinner === null || st.finalWinner === undefined)) stageFinal = finalists;
  }

  /* the whiteboard row: one tap drops a chip, everyone's chips sit on the pick
     in their own colors, the x pulls your last one back, and tapping the chip
     cluster reveals exactly who is riding the pick */
  const PickRow = ({ players, name, onClick, wide, pred, rowKey, cellStyle }) => {
    const bets = pred ? pending.filter(x => pred(x.w)) : [];
    const mineBets = bets.filter(x => x.w.player === me);
    const mine = mineBets.reduce((s, x) => s + x.w.stake, 0);
    const chips = bets.map(x => ({ p: x.w.player, val: x.w.stake }));
    const shownChips = chips.slice(0, 5);
    const open = whoOpen === rowKey && bets.length > 0;
    const canPick = marketOpen && room >= PT && typeof onClick === "function";
    return (
      <div style={cellStyle}>
        <button onClick={canPick ? onClick : undefined}
          style={{ display:"flex", alignItems:"center", gap:8, padding: wide ? "10px 12px" : "8px 10px",
            borderRadius:14, width:"100%",
            background:"var(--paper2)",
            border:"1px solid " + (mine > 0 ? "rgba(194,88,50,0.55)" : "var(--line)"),
            cursor: canPick ? "pointer" : "default",
            opacity: marketOpen && room < PT && !mine ? 0.5 : 1, textAlign:"left" }}>
          <AvatarStack state={state} players={players} size={wide ? 28 : 24} max={wide ? 5 : 3} />
          <span style={{ fontFamily:SANS, fontWeight:600, fontSize: wide ? 14 : 12.5, color:"var(--ink)",
            overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1 }}>{name}</span>
          {chips.length > 0 && (
            <span onClick={e => { e.stopPropagation(); setWhoOpen(w => w === rowKey ? null : rowKey); }} role="button"
              style={{ display:"flex", alignItems:"center", flexShrink:0, cursor:"pointer", padding:"4px 0" }}>
              {shownChips.map((c, i) => <span key={i} style={{ marginLeft: i ? -6 : 0 }}><BankChip p={c.p} size={22} val={c.val} /></span>)}
              {chips.length > shownChips.length && <span style={{ fontFamily:SANS, fontWeight:700, fontSize:11,
                color:"var(--muted2)", marginLeft:3 }}>+{chips.length - shownChips.length}</span>}
              {marketOpen && mine > 0 && (
                <span onClick={e => { e.stopPropagation(); onRetract(mineBets[mineBets.length - 1].w.id); }} role="button"
                  style={{ width:22, height:22, borderRadius:99, display:"flex", alignItems:"center",
                    justifyContent:"center", cursor:"pointer", marginLeft:4, fontSize:11,
                    background:"rgba(251,243,228,0.08)", color:"var(--muted2)" }}>✕</span>
              )}
            </span>
          )}
        </button>
        {open && (
          <div style={{ margin:"4px 0 2px", padding:"7px 10px", borderRadius:10, background:"var(--paper)",
            border:"1px solid var(--line)", display:"flex", flexDirection:"column", gap:5, animation:"si-in .15s ease-out" }}>
            {/* one row per bettor: their chip stack and total, never repeated */}
            {[...bets.reduce((m2, x) => m2.set(x.w.player, (m2.get(x.w.player) || 0) + x.w.stake), new Map())]
              .sort((x, y) => y[1] - x[1])
              .map(([p, total]) => (
                <div key={p} style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <Avatar state={state} p={p} size={20} />
                  <span style={{ fontFamily:SANS, fontWeight:600, fontSize:12.5, color:"var(--ink)", flex:1,
                    minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{disp(state, p)}</span>
                  <BankChip p={p} size={20} val={total} />
                  <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:14, color:"var(--muted2)",
                    minWidth:28, textAlign:"right" }}>{total}</span>
                </div>
              ))}
          </div>
        )}
      </div>
    );
  };

  const Row = ({ x }) => {
    const { w, r } = x;
    const l = wagerPickLabel(state, w, events);
    const win = w.kind === "outright" ? OUTRIGHT_MULT * w.stake : w.stake;
    return (
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 13px",
        borderRadius:14, background: r.status === "pending" ? CARD_BG : "var(--paper2)",
        border:"1px solid " + (r.status === "pending" ? "var(--line)" : "var(--line)"), marginBottom:7 }}>
        <Avatar state={state} p={w.player} size={30} />
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontFamily:SANS, fontWeight:600, fontSize:14, color:"var(--ink)" }}>
            <b>{disp(state, w.player)}</b> put {w.stake} on <b style={{ color:"var(--accent2)" }}>{l.pick}</b>
          </div>
          <div style={{ fontFamily:SANS, fontSize:12.5, color:"var(--muted)" }}>{l.ctx}</div>
        </div>
        {r.status === "pending" && <span style={{ fontFamily:SANS, fontSize:12.5, color:"var(--muted)" }}>to win +{win}</span>}
        {r.status === "won" && <span style={{ fontFamily:SANS, fontWeight:700, fontSize:12.5, color:"var(--green)" }}>+{r.delta}</span>}
        {r.status === "lost" && <span style={{ fontFamily:SANS, fontWeight:700, fontSize:12.5, color:"var(--clay)" }}>{r.delta}</span>}
        {r.status === "void" && <span style={{ fontFamily:SANS, fontWeight:700, fontSize:11, color:"var(--muted)" }}>VOID</span>}
        {gm && r.status === "pending" && (
          <button onClick={() => onVoid(w.ids || [w.id])} style={{ background:"none", border:"1px solid var(--danger-line)",
            borderRadius:10, color:"var(--clay)", fontFamily:SANS, fontWeight:700, fontSize:11, padding:"4px 8px",
            cursor:"pointer", textTransform:"uppercase" }}>Void</button>
        )}
      </div>
    );
  };

  /* one bettor, one line: name, how many bets are behind it, and the net */
  const SettledRow = ({ g }) => {
    const key = "st:" + g.player, open = whoOpen === key;
    return (
      <div style={{ marginBottom:7 }}>
        <button onClick={() => setWhoOpen(w => w === key ? null : key)}
          style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"9px 13px",
            borderRadius:14, background:"var(--paper2)", border:"1px solid var(--line)",
            cursor:"pointer", textAlign:"left" }}>
          <Avatar state={state} p={g.player} size={26} />
          <span style={{ fontFamily:SANS, fontWeight:600, fontSize:14, color:"var(--ink)", flex:1,
            minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            {disp(state, g.player)}</span>
          <span style={{ fontFamily:SANS, fontSize:12, color:"var(--muted)" }}>
            {g.lines.length} bet{g.lines.length === 1 ? "" : "s"}</span>
          <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:17, minWidth:46, textAlign:"right",
            color: g.net > 0 ? "var(--green)" : g.net < 0 ? "var(--clay)" : "var(--muted)" }}>
            {g.net > 0 ? "+" : ""}{fmt(g.net)}</span>
        </button>
        {open && <div style={{ marginTop:6 }}>{g.lines.map(x => <Row key={x.w.id} x={x} />)}</div>}
      </div>
    );
  };

  return (
    <div style={{ padding:"0 16px", paddingBottom: me && marketOpen ? 152 : 0 }}>
      {!ev && !state.frozen && (
        <div style={{ textAlign:"center", padding:"clamp(56px,15vh,120px) 24px 24px",
          display:"flex", flexDirection:"column", alignItems:"center" }}>
          <div style={{ opacity:0.82, marginBottom:18 }}><ArtTicket /></div>
          <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:30, lineHeight:1,
            textTransform:"uppercase", color:"var(--ink)", marginBottom:9 }}>
            {state.live ? "Between events" : "Betting opens with the first event"}</div>
          <div style={{ maxWidth:300, color:"var(--muted2)", fontFamily:SANS, fontSize:14, lineHeight:1.6 }}>
            As each event starts, betting opens here.
          </div>
          <Btn kind="ghost" onClick={onEvents} style={{ marginTop:20 }}>Browse the events</Btn>
        </div>
      )}
      {state.frozen && (
        <div style={{ textAlign:"center", padding:"22px 20px", color:"var(--muted)", fontFamily:SANS, fontSize:14 }}>
          The board is frozen.
        </div>
      )}

      {ev && (
        <div style={{ borderRadius:14, border:"1px solid rgba(251,243,228,0.2)", overflow:"hidden",
          background:"var(--paper)", boxShadow:"var(--shadow-1)", marginBottom:16 }}>
          <div style={{ display:"flex", alignItems:"center", gap:9, padding:"7px 13px",
            background:marketOpen ? "var(--clay)" : "var(--night)", color:BONE }}>
            <GameMark id={ev.game} size={26} />
            <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:19, letterSpacing:"0.02em",
              textTransform:"uppercase", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{ev.name}</span>
            <span style={{ fontFamily:SANS, fontWeight:700, fontSize:11, letterSpacing:"0.06em",
              color:marketOpen ? BONE : "var(--sun)" }}>
              {marketOpen ? "BETTING OPEN" : "BETTING LOCKED"}</span>
          </div>
          <div style={{ padding:"12px 13px 8px" }}>

          {/* the whiteboard: chips ride directly on the bracket. Tap a side
              of any open matchup to drop one; your ✕ pulls the last back. */}
          {br && draw && (
            <div style={{ marginBottom:14, overflowX:"auto" }}>
              <BracketGrid state={state} ev={ev} gm={false} bet={{
                onBet: marketOpen ? (r2, m2, tIdx, roundName) => {
                  if (room < PT) return;
                  bet({ kind:"match", eventId:ev.id, teamIdx:tIdx,
                    pickPlayers:[...draw.teams[tIdx].players], pickTeam:true, drawId:draw.id,
                    match:[r2, m2], matchName: roundName, evName: ev.name });
                } : undefined,
                chips: (r2, m2, tIdx) => {
                  const bets = pending.filter(x => x.w.kind === "match" && x.w.eventId === ev.id &&
                    x.w.drawId === draw.id && x.w.match?.[0] === r2 && x.w.match?.[1] === m2 &&
                    x.w.teamIdx === tIdx);
                  if (!bets.length) return null;
                  const chips = bets.map(x => ({ p: x.w.player, val: x.w.stake }));
                  const mineBets = bets.filter(x => x.w.player === me);
                  return (
                    <span style={{ display:"flex", alignItems:"center", flexShrink:0 }}>
                      {chips.slice(0, 4).map((c, i) => <span key={i} style={{ marginLeft: i ? -7 : 0 }}>
                        <BankChip p={c.p} size={20} val={c.val} /></span>)}
                      {chips.length > 4 && <span style={{ fontFamily:SANS, fontWeight:700, fontSize:10.5,
                        color:"var(--muted2)", marginLeft:2 }}>+{chips.length - 4}</span>}
                      {marketOpen && mineBets.length > 0 && (
                        <span onClick={e => { e.stopPropagation(); onRetract(mineBets[mineBets.length - 1].w.id); }}
                          role="button" style={{ width:20, height:20, borderRadius:99, display:"flex",
                            alignItems:"center", justifyContent:"center", cursor:"pointer", marginLeft:3,
                            fontSize:10, background:"var(--ink-tint)", color:"var(--muted2)" }}>✕</span>
                      )}
                    </span>
                  );
                },
              }} />
              <div style={{ fontFamily:SANS, fontSize:11, color:"var(--muted)", marginTop:6 }}>
                {marketOpen
                  ? "Matchups pay even. Tap a side to put a chip on it."
                  : "Betting is locked. Chips stay on the bracket until each matchup settles."}</div>
            </div>
          )}
          {st && !br && (
            <div style={{ marginBottom:14 }}>
              <StageGrid state={state} ev={ev} gm={false} />
            </div>
          )}

          {outrights.length > 0 && (
            <>
              <div style={{ display:"flex", alignItems:"baseline", gap:8, marginBottom:8 }}>
                <span style={{ ...label }}>Winner</span>
                <span style={{ fontFamily:SANS, fontSize:11, color:"var(--muted)" }}>pays 2 to 1</span>
              </div>
              <div style={{ display: bigTeams ? "flex" : "grid", flexDirection:"column",
                gridTemplateColumns:"1fr 1fr", gap:6, marginBottom:12 }}>
                {outrights.map((o, i) => (
                  <PickRow key={o.key} rowKey={"o:" + o.key} players={o.players} name={o.name} wide={bigTeams}
                    cellStyle={!bigTeams ? centeredGridCell(i, outrights.length, 2, 6) : undefined}
                    pred={w => w.kind === "outright" && w.eventId === ev.id &&
                      (o.pick.pickTeam
                        ? w.pickTeam && w.drawId === o.pick.drawId && (w.pickPlayers||[]).join("|") === o.pick.pickPlayers.join("|")
                        : !w.pickTeam && w.pick === o.key)}
                    onClick={() => bet(o.pick)} />
                ))}
              </div>
            </>
          )}
          {ev.kind !== "solo" && !draw && (
            <div style={{ fontFamily:SANS, fontSize:12.5, color:"var(--muted)", marginBottom:10 }}>
              Winner betting opens after the draw.
            </div>
          )}

          {stageGroups.length > 0 && (
            <>
              <div style={{ display:"flex", alignItems:"baseline", gap:8, marginBottom:8 }}>
                <span style={{ ...label }}>Advancing</span>
                <span style={{ fontFamily:SANS, fontSize:11, color:"var(--muted)" }}>pays even</span>
              </div>
              {stageGroups.map(g => (
                <div key={g.gi} style={{ marginBottom:10 }}>
                  <div style={{ fontFamily:SANS, fontSize:11, color:"var(--muted)", textTransform:"uppercase",
                    letterSpacing:"0.12em", marginBottom:4 }}>{g.name}</div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
                    {g.entrants.map(k => {
                      const v = stageEntrantView(state, st, k);
                      return <PickRow key={String(k)} rowKey={`s:${g.gi}:${k}`} players={v.players} name={v.name}
                        pred={w => w.kind === "stage" && w.stagesId === st.id && !w.final &&
                          w.group === g.gi && w.pickKey === k}
                        onClick={() => bet({ kind:"stage", eventId:ev.id, stagesId:st.id, group:g.gi,
                          groupName:g.name, pickKey:k, pickPlayers:[...v.players],
                          pickTeam: st.entrantType === "team", evName:ev.name })} />;
                    })}
                  </div>
                </div>
              ))}
            </>
          )}

          {stageFinal && (
            <>
              <div style={{ display:"flex", alignItems:"baseline", gap:8, marginBottom:8 }}>
                <span style={{ ...label }}>The Final</span>
                <span style={{ fontFamily:SANS, fontSize:11, color:"var(--muted)" }}>pays even</span>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginBottom:12 }}>
                {stageFinal.map(k => {
                  const v = stageEntrantView(state, st, k);
                  return <PickRow key={String(k)} rowKey={`f:${k}`} players={v.players} name={v.name}
                    pred={w => w.kind === "stage" && w.stagesId === st.id && w.final && w.pickKey === k}
                    onClick={() => bet({ kind:"stage", eventId:ev.id, stagesId:st.id, final:true,
                      pickKey:k, pickPlayers:[...v.players], pickTeam: st.entrantType === "team", evName:ev.name })} />;
                })}
              </div>
            </>
          )}

          {/* the cap case needs no sentence, the meter below is showing it */}
          {me && myPts - myExp < PT && <div style={{ fontFamily:SANS, fontSize:12.5, color:"var(--clay)", padding:"2px 0 6px" }}>
            Not enough points until a wager settles.</div>}

          </div>
        </div>
      )}

      {/* the rack: fixed above the tab bar the whole time betting is open.
          Pick a chip, tap the board. Exactly video roulette.
          Above the chips, the rule as a picture instead of two loose words:
          the bar is your WHOLE stack, the notch is how much of it may ride,
          the gold is what is riding now. The gap between gold and notch is
          what you have left, and you can see it can never cross. Shown even
          when you are maxed out, because that is when it explains the most. */}
      {me && ev && marketOpen && (
        <div style={{ position:"fixed", bottom:"calc(72px + env(safe-area-inset-bottom))", zIndex:48,
          left:"50%", transform:"translateX(-50%)", width:"min(92vw, 430px)",
          display:"flex", flexDirection:"column", gap:10, padding:"11px 16px 12px", borderRadius:16,
          background:"var(--paper)", border:"1px solid var(--line)", boxShadow:"var(--shadow-3)" }}>
          <div>
            <div style={{ display:"flex", alignItems:"baseline", gap:8, marginBottom:5 }}>
              <span style={{ ...label, fontSize:9.5 }}>At risk</span>
              <span style={{ marginLeft:"auto", fontFamily:DISPLAY, fontWeight:700, fontSize:17,
                lineHeight:1, color: room >= PT ? "var(--ink)" : "var(--clay)" }}>{fmt(room)}</span>
              <span style={{ fontFamily:SANS, fontSize:9.5, fontWeight:700, letterSpacing:"0.1em",
                textTransform:"uppercase", color:"var(--muted)" }}>to bet</span>
            </div>
            <div style={{ position:"relative", height:9, borderRadius:99, background:"var(--paper2)",
              border:"1px solid var(--line)" }}>
              <div style={{ height:"100%", borderRadius:99, background:GOLD_GRAD,
                width:`${myPts ? Math.min(100, (myExp / myPts) * 100) : 0}%`, transition:"width .2s ease" }} />
              {/* the cap, standing on the stack it is half of */}
              {/* below 1,000 the MAX_RISK floor gives you MORE than half, so
                  the notch sits past the middle. Generous either way, and the
                  exact numbers are on the line below */}
              <div style={{ position:"absolute", top:-4, bottom:-4, width:2, borderRadius:2,
                background:"var(--ink)", left:`${myPts ? Math.min(100, (myCap / myPts) * 100) : 100}%` }} />
            </div>
            <div style={{ display:"flex", marginTop:4, fontFamily:SANS, fontSize:10, color:"var(--muted)" }}>
              <span>{fmt(myExp)} of {fmt(myCap)} max</span>
              <span style={{ marginLeft:"auto" }}>stack {fmt(myPts)}</span>
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"flex-end", gap:13 }}>
            {RACK_DENOMS.map(d => {
              const ok = d <= room;
              return (
                <button key={d} disabled={!ok} onClick={() => setDenom(d)} aria-label={`Bet ${d} a tap`}
                  style={{ background:"none", border:"none", padding:0, cursor: ok ? "pointer" : "default",
                    transform: denom === d && ok ? "translateY(-7px) scale(1.14)" : "none",
                    transition:"transform .16s ease", opacity: ok ? 1 : 0.28,
                    filter: denom === d && ok ? "drop-shadow(0 5px 7px rgba(23,16,9,0.5))" : "none" }}>
                  <BankChip p={me} size={42} val={d} />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {pending.length > 0 && <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:16, letterSpacing:"0.08em",
        textTransform:"uppercase", background:"var(--paper2)", color:"var(--ink)", borderRadius:6,
        padding:"3px 10px", margin:"4px 0 8px" }}>{pendingLines.length} open</div>}
      {pendingLines.map(x => <Row key={x.w.id} x={x} />)}
      {settledLines.length > 0 && <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:16, letterSpacing:"0.08em",
        textTransform:"uppercase", background:"var(--paper2)", color:"var(--muted2)", borderRadius:6,
        padding:"3px 10px", margin:"14px 0 8px", border:"1px solid var(--line)" }}>Settled</div>}
      {settledByPlayer.map(g => <SettledRow key={g.player} g={g} />)}
    </div>
  );
}


/* ─────────── duels ───────────
   Head-to-head phone games. The strip lives under the board; the game itself
   takes the whole screen. Settlement is derived server-side from the runs. */
const duelTime = r => (r.foul ? "foul" : `${r.ms}ms`);

/* open duels involving you, and only you: a compact strip near the top of
   the board. It only exists while a duel needs attention. Everything else
   (history, other people's duels) lives in the ticker and player cards. */
function DuelStrip({ state, me, gm, onPlay, onDecline, onVoid }) {
  const mine = (state.duels || []).filter(d =>
    d.status === "open" && !resolveDuel(d).settled && (d.from === me || d.to === me));
  if (!mine.length) return null;
  return (
    <div style={{ marginBottom:10 }}>
      {mine.map(d => {
        const myTurn = !d.runs?.[me];
        const other = d.from === me ? d.to : d.from;
        return (
          <div key={d.id} style={{ display:"flex", alignItems:"center", gap:9, padding:"8px 13px",
            borderRadius:14, marginBottom:6,
            background: myTurn ? "var(--sun-tint)" : "var(--paper)",
            border:"1px solid " + (myTurn ? "rgba(240,176,47,0.45)" : "var(--line)") }}>
            <BankChip p={other} size={18} />
            <Avatar state={state} p={other} size={22} />
            <span style={{ fontFamily:SANS, fontWeight:600, fontSize:12.5, color:"var(--ink)", flex:1,
              minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
              {myTurn
                ? d.to === me ? `${disp(state, other)} challenged you` : `Your turn vs ${disp(state, other)}`
                : `Waiting on ${disp(state, other)}`}
            </span>
            {myTurn && d.to === me && !Object.keys(d.runs || {}).length && (
              <button onClick={() => onDecline(d.id)} style={{ background:"none", border:"none",
                color:"var(--muted)", fontFamily:SANS, fontWeight:700, fontSize:11, cursor:"pointer",
                textTransform:"uppercase", padding:"4px 6px", flexShrink:0 }}>Decline</button>
            )}
            {myTurn && (
              <button onClick={() => onPlay(d.id)} style={{ fontFamily:SANS, fontWeight:700, fontSize:11,
                letterSpacing:"0.05em", textTransform:"uppercase", background:"var(--sun)", color:"var(--ink0)",
                border:"1.5px solid var(--ink0)", borderRadius:10, padding:"6px 14px", cursor:"pointer",
                flexShrink:0 }}>Play</button>
            )}
            {gm && (
              <button onClick={() => onVoid(d.id)} style={{ background:"none", border:"1px solid var(--danger-line)",
                borderRadius:10, color:"var(--clay)", fontFamily:SANS, fontWeight:700, fontSize:11, padding:"4px 8px",
                cursor:"pointer", textTransform:"uppercase", flexShrink:0 }}>Void</button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* tapping any player opens their card first: who they are, how their weekend
   is going, and only then the call-out. No surprise Quick Draw. */
function PlayerSheet({ state, me, p, standings, events, onClose, onDuel }) {
  const prof = state.profiles?.[p] || {};
  const row = standings.find(r => r.player === p);
  const duels = (state.duels || []).map(d => ({ d, r: resolveDuel(d) })).filter(x => x.r.settled && !x.r.push);
  const dw = duels.filter(x => x.r.winner === p).length;
  const dl = duels.filter(x => x.r.loser === p).length;
  const busy = (state.duels || []).some(d => d.status === "open" && !resolveDuel(d).settled &&
    ((d.from === me && d.to === p) || (d.from === p && d.to === me)));
  const canDuel = me && p !== me && !state.frozen && state.live;
  const legIn = cleanLeg(prof.flightIn), legOut = cleanLeg(prof.flightOut);
  /* capitalised after the join, not before: with only a return leg the line
     starts at "leaves Sun" and would open lowercase */
  const travel = (() => {
    const t = [
      legIn && (legIn.note || (legTime(legIn.time) && `lands Fri ${legTime(legIn.time)}`)),
      legOut && (legOut.note || (legTime(legOut.time) && `leaves Sun ${legTime(legOut.time)}`)),
    ].filter(Boolean).join(", ");
    return t && t[0].toUpperCase() + t.slice(1);
  })();
  /* the ante is bounded by whichever of the two can cover less, mirroring
     sendDuel so the rack never offers a chip the server will refuse */
  const spendable = q => {
    const pts = standings.find(r => r.player === q)?.pts ?? 0;
    const antes = (state.duels || [])
      .filter(d => d.status === "open" && !resolveDuel(d).settled && (d.from === q || d.to === q))
      .reduce((n, d) => n + d.stake, 0);
    return Math.min(maxRisk(pts), pts - atRisk(state, q, events || []) - antes);
  };
  const anteMax = canDuel ? Math.min(spendable(me), spendable(p)) : 0;
  const [ante, setAnte] = useState(PT);
  useEffect(() => { if (ante > anteMax) setAnte(Math.max(PT, Math.floor(anteMax / PT) * PT)); }, [anteMax]); // eslint-disable-line
  return (
    <Sheet title={disp(state, p)} onClose={onClose}>
      <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:14 }}>
        <Avatar state={state} p={p} size={64} ring />
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <BankChip p={p} size={20} />
            {prof.num != null && <span style={{ fontFamily:DISPLAY, fontWeight:700, fontStyle:"italic",
              fontSize:19, color:"var(--muted2)" }}>#{prof.num}</span>}
          </div>
          {/* before the weekend every row is 1st on 1,000 with no wins, which
              says nothing about anyone. Until the board means something, use
              the line for the thing people actually want off each other
              months out: when you land and when you go. */}
          <div style={{ fontFamily:SANS, fontSize:12.5, color:"var(--muted)", marginTop:4 }}>
            {state.live
              ? <>{ord(row?.rank ?? 1)} on the board, {fmt(row?.pts ?? 0)} pts,{" "}
                  {row?.wins ?? 0} win{(row?.wins ?? 0) === 1 ? "" : "s"}
                  {(dw > 0 || dl > 0) && <>, duels {dw} and {dl}</>}</>
              : travel || <span style={{ color:"var(--muted)" }}>No flights in yet</span>}
          </div>
        </div>
      </div>
      {canDuel && (
        <div style={{ background:"var(--paper2)", border:"1px solid var(--line)", borderRadius:14,
          padding:"12px 13px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
            <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:17, letterSpacing:"0.03em",
              textTransform:"uppercase", color:"var(--ink)", flex:1 }}>Quick Draw</span>
            <BankChip p={me} size={16} /><BankChip p={p} size={16} />
          </div>
          <div style={{ fontFamily:SANS, fontSize:12.5, color:"var(--muted2)", lineHeight:1.55, marginBottom:10 }}>
            You both play on your own phone whenever you want. The screen flashes after a random
            wait, tap it. Fastest tap wins the pot. Tapping early is a foul.
          </div>
          {busy
            ? <div style={{ fontFamily:SANS, fontSize:12.5, fontWeight:600, color:"var(--muted)" }}>
                A challenge between you two is already open.</div>
            : (
              <>
                {/* you name the ante, capped by whichever of you can cover less */}
                <div style={{ ...label, fontSize:10, marginBottom:6 }}>Ante, each</div>
                <div style={{ display:"flex", alignItems:"flex-end", gap:11, marginBottom:11 }}>
                  {RACK_DENOMS.map(d => {
                    const okd = d <= anteMax;
                    return (
                      <button key={d} disabled={!okd} onClick={() => setAnte(d)} aria-label={`Ante ${d}`}
                        style={{ background:"none", border:"none", padding:0, cursor: okd ? "pointer" : "default",
                          transform: ante === d && okd ? "translateY(-6px) scale(1.12)" : "none",
                          transition:"transform .16s ease", opacity: okd ? 1 : 0.28 }}>
                        <BankChip p={me} size={38} val={d} />
                      </button>
                    );
                  })}
                </div>
                <Btn onClick={() => onDuel(ante)} style={{ width:"100%" }}>
                  Challenge {disp(state, p)} for {fmt(ante)}</Btn>
              </>
            )}
        </div>
      )}
    </Sheet>
  );
}

function QuickDrawGame({ state, me, duel, onSubmit, onClose }) {
  const myRun0 = duel?.runs?.[me] || null;
  const [phase, setPhase] = useState(myRun0 ? "done" : "intro"); // intro | armed | go | done
  const [run, setRun] = useState(myRun0);
  const t0 = useRef(0);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  if (!duel) return null;
  const opp = duel.from === me ? duel.to : duel.from;
  const oppRun = duel.runs?.[opp];
  const res = resolveDuel(duel);
  const arm = () => {
    setPhase("armed");
    timer.current = setTimeout(() => { t0.current = performance.now(); setPhase("go"); },
      1500 + Math.random() * 2500);
  };
  const fire = () => {
    if (phase === "armed") {
      clearTimeout(timer.current);
      setRun({ ms:null, foul:true }); setPhase("done");
      onSubmit(duel.id, null, true);
    } else if (phase === "go") {
      const m = Math.round(performance.now() - t0.current);
      setRun({ ms:m, foul:false }); setPhase("done");
      onSubmit(duel.id, m, false);
    }
  };
  const wrap = kids => (
    <div style={{ position:"fixed", inset:0, zIndex:300, background:"rgba(32,24,17,0.98)",
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
      padding:"calc(30px + env(safe-area-inset-top)) 24px calc(30px + env(safe-area-inset-bottom))" }}>
      {kids}
    </div>
  );
  if (phase === "armed") return (
    <div onPointerDown={fire} style={{ position:"fixed", inset:0, zIndex:300, background:"var(--night-deep)",
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", touchAction:"none" }}>
      <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:44, letterSpacing:"0.12em",
        textTransform:"uppercase", color:"var(--night-text2)", animation:"si-pulse 2.2s infinite" }}>Steady</div>
      <div style={{ fontFamily:SANS, fontSize:14, color:"var(--night-text2)", marginTop:10 }}>tap when it flashes</div>
    </div>
  );
  if (phase === "go") return (
    <div onPointerDown={fire} style={{ position:"fixed", inset:0, zIndex:300, background:"var(--sun)",
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", touchAction:"none" }}>
      <div style={{ fontFamily:DISPLAY, fontWeight:700, fontStyle:"italic", fontSize:96,
        letterSpacing:"0.04em", textTransform:"uppercase", color:"var(--ink0)" }}>Draw</div>
    </div>
  );
  if (phase === "intro") return wrap(
    <>
      <div style={{ ...label, fontSize:11, color:"var(--sun)" }}>Duel</div>
      <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:44, color:BONE, textTransform:"uppercase",
        lineHeight:0.95, margin:"6px 0 22px" }}>Quick Draw</div>
      <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:22 }}>
        <Avatar state={state} p={me} size={62} ring />
        <span style={{ fontFamily:DISPLAY, fontWeight:700, fontStyle:"italic", fontSize:24, color:"var(--sun)" }}>VS</span>
        <Avatar state={state} p={opp} size={62} ring />
      </div>
      <div style={{ fontFamily:SANS, fontSize:16, lineHeight:1.6, color:"var(--night-text)", textAlign:"center",
        maxWidth:340, marginBottom:8 }}>{DUEL_GAMES.quickdraw.desc}</div>
      <div style={{ fontFamily:SANS, fontSize:12.5, color:"var(--night-text2)", marginBottom:26 }}>
        {fmt(duel.stake)} each, winner takes the pot</div>
      <Btn onClick={arm} style={{ fontSize:16, padding:"14px 40px" }}>Ready</Btn>
      <button onClick={onClose} style={{ marginTop:18, background:"none", border:"none", color:"var(--night-text2)",
        fontFamily:SANS, fontSize:12.5, cursor:"pointer" }}>Not now</button>
    </>
  );
  /* done: my run is in; the verdict fills in live once the opponent draws */
  const decided = res.settled && !res.push;
  return wrap(
    <>
      <div style={{ ...label, fontSize:11, color:"var(--sun)" }}>Your draw</div>
      <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize: run.foul ? 56 : 76, color: run.foul ? "var(--live2)" : BONE,
        textTransform:"uppercase", lineHeight:1, margin:"8px 0 4px", animation:"si-flag .5s both" }}>
        {run.foul ? "Foul" : `${run.ms} ms`}</div>
      {run.foul && <div style={{ fontFamily:SANS, fontSize:14, color:"var(--night-text)" }}>Too early. That is a foul.</div>}
      <div style={{ margin:"26px 0", width:"100%", maxWidth:360 }}>
        {oppRun ? (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            {[[me, duel.runs?.[me] || run], [opp, oppRun]].map(([p, r2]) => (
              <div key={p} style={{ background:CARD_BG, borderRadius:14, padding:"12px 10px", textAlign:"center",
                border: decided && res.winner === p ? "2px solid var(--sun)" : "1px solid var(--line)",
                opacity: decided && res.loser === p ? 0.65 : 1, animation:"si-flag .5s both" }}>
                <div style={{ display:"flex", justifyContent:"center", marginBottom:7 }}>
                  <Avatar state={state} p={p} size={38} /></div>
                <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:24, color:"var(--ink)" }}>
                  {duelTime(r2)}</div>
                <div style={{ fontFamily:SANS, fontWeight:600, fontSize:12.5, color:"var(--muted2)" }}>
                  {disp(state, p)}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign:"center", fontFamily:SANS, fontSize:14, color:"var(--night-text)", lineHeight:1.6 }}>
            Waiting on {disp(state, opp)}.<br/>It settles when they play.
          </div>
        )}
      </div>
      {res.settled && (
        <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:32, textTransform:"uppercase",
          color: res.push ? "var(--night-text)" : res.winner === me ? "var(--sun)" : "var(--live2)",
          marginBottom:22, animation:"si-flag .5s .15s both" }}>
          {res.push ? "Tied. Chips returned."
            : res.winner === me ? `You win, +${duel.stake}`
            : `${disp(state, opp)} wins`}
        </div>
      )}
      {duel.status === "void" && (
        <div style={{ fontFamily:SANS, fontSize:14, color:"var(--night-text)", marginBottom:20 }}>
          Voided by the commissioner. No chips move.</div>
      )}
      <Btn kind={res.settled ? "primary" : "ghost"} onClick={onClose}
        style={{ fontSize:16, padding:"13px 34px" }}>Close</Btn>
    </>
  );
}

/* ─────────── QA bar (GM only, real names) ─────────── */
function QABar({ me, status, onExit, sim, onStop, guestLens, onLens,
  onOpen, onPlayNext, minimized, onMin, top, onPos }) {
  const small = { fontFamily:SANS, fontWeight:700, fontSize:11, letterSpacing:"0.08em",
    textTransform:"uppercase", padding:"6px 10px", borderRadius:10, cursor:"pointer", flexShrink:0 };
  if (minimized) return (
    <button onClick={onMin} style={{ position:"fixed", left:14, zIndex:55,
      bottom:"calc(74px + env(safe-area-inset-bottom))", display:"flex", alignItems:"center", gap:7,
      background:"var(--sun)", color:"var(--ink0)", border:"1.5px solid var(--ink0)", borderRadius:99,
      padding:"9px 14px", cursor:"pointer", fontFamily:DISPLAY, fontWeight:700, fontSize:14,
      letterSpacing:"0.06em", boxShadow:"var(--shadow-2)" }}>
      {sim && <span style={{ width:7, height:7, borderRadius:99, background:"var(--clay)",
        animation:"si-pulse 1s infinite" }} />}
      QA · {status.environment.toUpperCase()}</button>
  );
  return (
    <div style={{ position:"fixed", zIndex:55, left:0, right:0, display:"flex", justifyContent:"center",
      pointerEvents:"none",
      ...(top ? { top:"calc(64px + env(safe-area-inset-top))" }
              : { bottom:"calc(66px + env(safe-area-inset-bottom))" }) }}>
      <div style={{ width:"calc(100% - 20px)", maxWidth:520, pointerEvents:"auto",
        background:"rgba(23,16,9,0.97)", border:"1px solid rgba(194,88,50,0.4)", borderRadius:14,
        padding:"8px 10px", boxShadow:"var(--shadow-3)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:7 }}>
          <span style={{ ...label, fontSize:10, color:"var(--sun)" }}>QA</span>
          <Tag tone={status.environment === "production" ? "flame" : "gold"}>
            {status.environment}</Tag>
          <span style={{ fontFamily:SANS, fontSize:12.5, color:"var(--bone)", flex:1, minWidth:0,
            overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            {status.current} · {status.phase}</span>
          <button onClick={onPos} title="Dock top or bottom" style={{ background:"none", border:"1px solid var(--ghost-line)",
            color:"var(--bone)", width:26, height:26, borderRadius:10, fontSize:11, cursor:"pointer", flexShrink:0 }}>{top ? "▾" : "▴"}</button>
          <button onClick={onMin} title="Minimize" style={{ background:"none", border:"1px solid var(--ghost-line)",
            color:"var(--bone)", width:26, height:26, borderRadius:10, fontSize:12.5, cursor:"pointer", flexShrink:0 }}>–</button>
          <button onClick={onExit} style={{ background:"var(--paper2)", border:"1px solid var(--line)",
            color:"var(--ink)", width:26, height:26, borderRadius:10, fontSize:11, cursor:"pointer", flexShrink:0 }}>✕</button>
        </div>
        {sim ? (
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ width:7, height:7, borderRadius:99, background:"var(--sun)",
              animation:"si-pulse 1s infinite", flexShrink:0 }} />
            <span style={{ fontFamily:SANS, fontWeight:600, fontSize:12.5, color:"var(--bone)", flex:1, minWidth:0,
              overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{sim}</span>
            <button onClick={onStop} style={{ ...small, background:"var(--clay)", border:"none", color:"var(--bone)" }}>Stop</button>
          </div>
        ) : (
          <div style={{ display:"flex", alignItems:"center", gap:6, overflowX:"auto" }}>
            <button onClick={onOpen} style={{ ...small,
              background:"var(--sun)", border:"1px solid var(--ink0)", color:"var(--ink0)" }}>Console</button>
            <button onClick={onPlayNext} style={{ ...small,
              background:"var(--paper2)", border:"1px solid var(--line)", color:"var(--ink)" }}>Run next event</button>
            <button onClick={onLens} style={{ ...small,
              background: guestLens ? "var(--sun)" : "transparent",
              border: guestLens ? "1px solid var(--ink0)" : "1px solid var(--ghost-line)",
              color: guestLens ? "var(--ink0)" : "var(--bone)" }}>
              {guestLens ? "Guest view on" : "Guest view"}</button>
            <span style={{ marginLeft:"auto", fontFamily:SANS, fontSize:11.5, color:"var(--night-text)",
              whiteSpace:"nowrap" }}>As <b style={{ color:"var(--bone)" }}>{me || "nobody"}</b></span>
          </div>
        )}
      </div>
    </div>
  );
}

/* QA jump sheet: checkpoints land the board at a named point in the weekend,
   helpers poke one feature at a time. Everything runs the sim driver; the
   bar shows progress and holds the Stop. */
function QASheet({ rank, presets, busy, status, me, guestLens, onSwitch, onLens,
  onJump, pokerOn, onPlayNext, onDuelMe, onDuels, onBets,
  onBustOne, onCountRest, onRerun, onReplayMine, onResetRequest, onClose }) {
  const [confirmRerun, setConfirmRerun] = useState(false);
  const sect = { ...label, fontSize:10.5, margin:"14px 2px 8px" };
  const stat = (value, name) => (
    <div style={{ minWidth:0, background:"var(--paper2)", border:"1px solid var(--line)",
      borderRadius:10, padding:"9px 10px" }}>
      <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:21, color:"var(--ink)",
        overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{value}</div>
      <div style={{ ...label, fontSize:9.5, marginTop:2 }}>{name}</div>
    </div>
  );
  return (
    <Sheet title={`QA · ${status.environment}`} onClose={onClose}>
      <div style={{ display:"flex", alignItems:"center", gap:8, margin:"0 2px 10px" }}>
        <Tag tone={status.environment === "production" ? "flame" : "gold"}>
          {status.environment}</Tag>
        <span style={{ fontFamily:SANS, fontSize:12.5, color:"var(--muted)", marginLeft:"auto" }}>
          state v{status.schema} · sync {status.version}</span>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4, minmax(0, 1fr))", gap:7 }}>
        {stat(`${status.completed}/${status.total}`, "Events")}
        {stat(status.pendingWagers, "Open bets")}
        {stat(status.openDuels, "Open duels")}
        {stat(`${status.profiles}/${ROSTER.length}`, "Profiles")}
      </div>
      <div style={{ marginTop:9, padding:"10px 12px", borderRadius:10,
        background:"var(--ink-tint)", border:"1px solid var(--line)" }}>
        <div style={{ ...label, fontSize:9.5 }}>Current</div>
        <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:18, textTransform:"uppercase",
          color:"var(--ink)", marginTop:2 }}>{status.current} · {status.phase}</div>
        <div style={{ fontFamily:SANS, fontSize:12.5, color:"var(--muted)", marginTop:4 }}>
          Next: {status.next}</div>
        {status.blockers.length > 0 && (
          <div style={{ fontFamily:SANS, fontSize:12, color:"var(--clay)", marginTop:4 }}>
            Blocked: {status.blockers.join(" · ")}</div>
        )}
      </div>

      <div style={sect}>View as player</div>
      <div style={{ display:"flex", gap:6, overflowX:"auto", paddingBottom:2 }}>
        {ROSTER.map(player => (
          <button key={player} disabled={busy} onClick={() => onSwitch(player)}
            style={{ fontFamily:SANS, fontWeight:600, fontSize:12.5, padding:"7px 11px",
              borderRadius:99, cursor:busy ? "default" : "pointer", flexShrink:0,
              background:me === player ? "var(--sun)" : "var(--paper2)",
              color:me === player ? "var(--ink0)" : "var(--ink)",
              border:me === player ? "1px solid var(--ink0)" : "1px solid var(--line)",
              opacity:busy ? 0.45 : 1 }}>{player}</button>
        ))}
      </div>
      <div style={{ display:"flex", gap:8, marginTop:8, flexWrap:"wrap" }}>
        <Btn kind={guestLens ? "primary" : "ghost"} onClick={onLens}>
          {guestLens ? "Guest view on" : "Guest view"}</Btn>
        <Btn kind="ghost" onClick={onReplayMine}>Redo check-in here</Btn>
      </div>

      <div style={sect}>Rehearsal checkpoints</div>
      {presets.map(pre => {
        const reached = rank >= pre.rank;
        const resets = rank > pre.rank;
        return (
          <button key={pre.key} disabled={busy} onClick={() => onJump(pre)}
            style={{ width:"100%", display:"flex", alignItems:"center", gap:10, textAlign:"left",
              background:"var(--paper2)", border:"1px solid var(--line)", borderRadius:10,
              padding:"10px 12px", marginBottom:7, cursor:"pointer", opacity:busy ? 0.45 : 1 }}>
            <span style={{ width:8, height:8, borderRadius:99, flexShrink:0,
              background:reached ? "var(--sun)" : "transparent",
              border:"1.5px solid " + (reached ? "var(--sun)" : "var(--muted)") }} />
            <span style={{ flex:1, minWidth:0 }}>
              <span style={{ display:"block", fontFamily:DISPLAY, fontWeight:700, fontSize:16.5,
                letterSpacing:"0.03em", textTransform:"uppercase", color:"var(--ink)" }}>{pre.name}</span>
              <span style={{ display:"block", fontFamily:SANS, fontSize:12, color:"var(--muted)" }}>{pre.note}</span>
            </span>
            {resets && <Tag>Resets first</Tag>}
          </button>
        );
      })}

      <div style={sect}>Quick tests</div>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
        <Btn kind="primary" disabled={busy} onClick={onPlayNext}>Run next event</Btn>
        <Btn kind="ghost" disabled={busy} onClick={onBets}>Add bets</Btn>
        <Btn kind="ghost" disabled={busy} onClick={onDuelMe}>Duel me</Btn>
        <Btn kind="ghost" disabled={busy} onClick={onDuels}>Duels round</Btn>
        {pokerOn && <Btn kind="ghost" disabled={busy} onClick={onBustOne}>Bust one</Btn>}
        {pokerOn && <Btn kind="ghost" disabled={busy} onClick={onCountRest}>Count the rest</Btn>}
      </div>

      <div style={sect}>All phones</div>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
        {confirmRerun
          ? <Btn kind="flame" onClick={() => { setConfirmRerun(false); onRerun(); }}>
              Confirm, release every chip</Btn>
          : <Btn kind="ghost" onClick={() => setConfirmRerun(true)}>Reopen check-in</Btn>}
        {confirmRerun && <Btn kind="ghost" onClick={() => setConfirmRerun(false)}>Keep it closed</Btn>}
      </div>
      <div style={{ fontFamily:SANS, fontSize:12, color:"var(--muted)", lineHeight:1.5, margin:"7px 2px 0" }}>
        Reopening check-in releases every claimed chip color. Profiles, photos,
        ratings, shirt sizes, and flights stay saved.</div>

      <div style={{ ...sect, color:"var(--clay)" }}>Danger zone</div>
      <div style={{ border:"1px solid var(--danger-line)", borderRadius:10, padding:"11px 12px" }}>
        <div style={{ fontFamily:SANS, fontWeight:700, fontSize:13.5, color:"var(--ink)" }}>
          Reset game progress</div>
        <div style={{ fontFamily:SANS, fontSize:12, color:"var(--muted)", lineHeight:1.45,
          margin:"4px 0 9px" }}>
          Clears the rehearsal and keeps people, travel, ratings, and the event setup.</div>
        <Btn kind="danger" disabled={busy} onClick={onResetRequest}>Review reset</Btn>
      </div>
    </Sheet>
  );
}

function ResetProgressSheet({ state, environment, busy, onClose, onConfirm }) {
  const [confirmed, setConfirmed] = useState(false);
  const completed = Object.keys(state.results || {}).length;
  const listStyle = { margin:"5px 0 0", paddingLeft:18, fontFamily:SANS, fontSize:13,
    lineHeight:1.55, color:"var(--muted)" };
  return (
    <Sheet title="Reset game progress" onClose={onClose}>
      <div style={{ margin:"0 16px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
          <Tag tone={environment === "production" ? "flame" : "gold"}>{environment}</Tag>
          <span style={{ fontFamily:SANS, fontWeight:700, fontSize:13, color:"var(--ink)" }}>
            {completed} result{completed === 1 ? "" : "s"} currently posted</span>
        </div>
        <div style={{ ...label, color:"var(--green)" }}>Kept</div>
        <ul style={listStyle}>
          <li>Profiles, photos, numbers, shirts, flights, and chip designs</li>
          <li>Device claims, private ratings, and trip details</li>
          <li>Event additions, edits, and order</li>
        </ul>
        <div style={{ ...label, color:"var(--clay)", marginTop:14 }}>Cleared</div>
        <ul style={listStyle}>
          <li>Results, wagers, rulings, draws, brackets, heats, pools, and drafts</li>
          <li>Duels, poker, shelved events, and weekend live or frozen state</li>
        </ul>
        <label style={{ display:"flex", alignItems:"flex-start", gap:10, margin:"16px 0 12px",
          padding:"11px 12px", borderRadius:10, background:"var(--paper2)", border:"1px solid var(--line)",
          cursor:busy ? "default" : "pointer" }}>
          <input type="checkbox" checked={confirmed} disabled={busy}
            onChange={event => setConfirmed(event.target.checked)}
            style={{ marginTop:2, accentColor:"var(--clay)" }} />
          <span style={{ fontFamily:SANS, fontWeight:600, fontSize:13, lineHeight:1.45, color:"var(--ink)" }}>
            Reset the {environment} game on every connected screen.</span>
        </label>
        {busy && (
          <div style={{ fontFamily:SANS, fontSize:12.5, color:"var(--clay)", marginBottom:10 }}>
            Stop the running rehearsal first.</div>
        )}
        <div style={{ display:"flex", gap:8 }}>
          <Btn kind="flame" disabled={!confirmed || busy} onClick={onConfirm}
            style={{ flex:1 }}>Reset progress</Btn>
          <Btn kind="ghost" onClick={onClose}>Keep it</Btn>
        </div>
      </div>
    </Sheet>
  );
}

/* ─────────── GM sheets ─────────── */
function AdjustSheet({ player, onClose, save }) {
  const [delta, setDelta] = useState(PT);
  const [reason, setReason] = useState("");
  return (
    <Sheet title={`Ruling for ${player}`} onClose={onClose}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:16, marginBottom:16 }}>
        <Btn kind="dark" onClick={() => setDelta(d => d - PT)} style={{ fontSize:19, width:54 }}>−</Btn>
        <div style={{ fontFamily:DISPLAY, fontWeight:800, fontSize:44, width:84, textAlign:"center",
          color: delta >= 0 ? "var(--green)" : "var(--clay)" }}>{delta>0?"+":""}{delta}</div>
        <Btn kind="dark" onClick={() => setDelta(d => d + PT)} style={{ fontSize:19, width:54 }}>+</Btn>
      </div>
      <input value={reason} onChange={e => setReason(e.target.value)} maxLength={50} aria-label="Ruling reason"
        placeholder="Reason, e.g. pressure putt"
        style={{ width:"100%", background:"var(--paper2)", border:"1px solid var(--line)", borderRadius:14,
          padding:"12px 13px", color:"var(--ink)", fontFamily:SANS, fontSize:14, marginBottom:14, outline:"none" }} />
      <Btn disabled={delta === 0} onClick={() => save(delta, reason.trim())} style={{ width:"100%", fontSize:16, padding:"14px" }}>Apply</Btn>
    </Sheet>
  );
}
function PinSheet({ onClose, unlock }) {
  const [pin, setPin] = useState("");
  return (
    <Sheet title="Commissioner" onClose={onClose}>
      <input value={pin} onChange={e => setPin(e.target.value.replace(/\D/g,"").slice(0,4))}
        aria-label="Commissioner passcode"
        inputMode="numeric" placeholder="Passcode" autoFocus
        onKeyDown={e => e.key === "Enter" && unlock(pin)}
        style={{ width:"100%", background:"var(--paper2)", border:"1px solid var(--line)", borderRadius:14,
          padding:"13px 12px", color:"var(--ink)", fontFamily:DISPLAY, fontSize:24,
          letterSpacing:"0.4em", textAlign:"center", marginBottom:12, outline:"none" }} />
      <Btn disabled={pin.length !== 4} onClick={() => unlock(pin)} style={{ width:"100%", fontSize:16, padding:"14px" }}>Unlock</Btn>
    </Sheet>
  );
}
function ProfileSheet({ state, me, onClose, save, onChip }) {
  const [display, setDisplay] = useState(state.profiles?.[me]?.display || me || "");
  const [photo, setPhoto] = useState(null);
  const [num, setNum] = useState(state.profiles?.[me]?.num != null ? String(state.profiles[me].num) : "");
  const [flightIn, setFlightIn] = useState(state.profiles?.[me]?.flightIn || null);
  const [flightOut, setFlightOut] = useState(state.profiles?.[me]?.flightOut || null);
  const [flightsBooked, setFlightsBooked] = useState(
    typeof state.profiles?.[me]?.flightsBooked === "boolean" ? state.profiles[me].flightsBooked
      : (state.profiles?.[me]?.flightIn || state.profiles?.[me]?.flightOut ? true : null));
  const [size, setSize] = useState(state.profiles?.[me]?.size ?? null);
  if (!me) return null;
  return (
    <Sheet title="Your profile" onClose={onClose}>
      <ProfileEditor state={state} me={me} display={display} setDisplay={setDisplay} photo={photo} setPhoto={setPhoto}
        num={num} setNum={setNum} size={size} setSize={setSize} onChip={onChip} showSize={false} />
      <div style={{ marginTop:20, paddingTop:18, borderTop:"1px solid var(--line)" }}>
        <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:23, lineHeight:1,
          textTransform:"uppercase", color:"var(--ink)", marginBottom:12 }}>Information I need</div>
        <TravelFields booked={flightsBooked} setBooked={setFlightsBooked}
          flightIn={flightIn} setFlightIn={setFlightIn} flightOut={flightOut} setFlightOut={setFlightOut} />
        <SizeRow lb="T-shirt size" value={size} onPick={setSize} allowClear />
      </div>
      <Btn disabled={!display.trim()} onClick={() => save({ display: display.trim(),
          num: num === "" ? null : Number(num), size, flightsBooked,
          flightIn, flightOut, ...(photo ? {photo} : {}) })}
        style={{ width:"100%", fontSize:16, padding:"14px", marginTop:16 }}>Save</Btn>
    </Sheet>
  );
}

/* ─────────── reveal (draws, heats, pools) ─────────── */
function Reveal({ state, reveal, big, auto, onClose, onBets }) {
  const items = reveal.versus ? 1 : reveal.groups.length;
  const reducedMotion = prefersReducedMotion();
  const [shown, setShown] = useState(() => reducedMotion ? items : 0);
  useEffect(() => {
    if (shown >= items) return;
    const t = setTimeout(() => setShown(s => s + 1), shown === 0 ? 900 : 1300);
    return () => clearTimeout(t);
  }, [shown, items]);
  const doneAll = shown >= items;
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    if (!auto || !doneAll) return;
    const t = setTimeout(() => closeRef.current(), reducedMotion ? 2200 : 6000);
    return () => clearTimeout(t);
  }, [auto, doneAll, reducedMotion]);
  return (
    <div style={{ position:"fixed", inset:0, zIndex:300, background:"rgba(32,24,17,0.97)",
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
      padding:"calc(30px + env(safe-area-inset-top)) 20px calc(30px + env(safe-area-inset-bottom))",
      overflowY:"auto" }}>
      <div style={{ ...label, fontSize: big ? 15 : 11, color:"var(--sun)", animation:"si-in .4s both" }}>{reveal.title}</div>
      <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize: big ? 64 : 36, color:BONE, textTransform:"uppercase",
        lineHeight:0.95, marginBottom: big ? 28 : 20, animation:"si-in .4s .1s both", textAlign:"center" }}>{reveal.subtitle}</div>

      {reveal.versus ? (
        <div style={{ width:"100%", maxWidth: big ? 900 : 470,
          visibility: shown > 0 ? "visible" : "hidden",
          animation: shown > 0 ? "si-flag .55s both" : "none" }}>
          <VersusDraw state={state} teams={reveal.versus} size={big ? "lg" : "md"} />
        </div>
      ) : (
        <div style={{ display:"grid", gap: big ? 16 : 10, width:"100%", maxWidth: big ? 1100 : 460,
          gridTemplateColumns: big ? `repeat(${items === 4 ? 2 : Math.min(items,3)}, 1fr)`
            : items > 3 ? "1fr 1fr" : "1fr" }}>
          {reveal.groups.map((g, i) => (
            <div key={i} style={{ visibility: i < shown ? "visible" : "hidden",
              animation: i < shown ? "si-flag .55s both" : "none",
              background:CARD_BG, border:"1px solid rgba(156,69,38,0.45)", borderRadius:14,
              padding: big ? "18px 20px" : "14px 15px", boxShadow:"var(--shadow-2)" }}>
              <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize: big ? 26 : 16,
                color:"var(--accent2)", marginBottom:8 }}>{g.title}</div>
              {g.lines.map((ln, j) => (
                <React.Fragment key={j}>
                  {g.vs && j > 0 && (
                    <div style={{ fontFamily:SANS, fontWeight:700, fontSize: big ? 14 : 11,
                      letterSpacing:"0.18em", color:"var(--muted)", textTransform:"uppercase",
                      padding:"1px 0 1px 4px", animation: i < shown ? "si-in .3s .3s both" : "none" }}>vs</div>
                  )}
                  <div style={{ display:"flex", alignItems:"center", gap:9, padding:"3px 0",
                    animation: i < shown ? `si-in .3s ${0.25 + j*0.15}s both` : "none" }}>
                    <AvatarStack state={state} players={ln.avatars} size={big ? 34 : 26} max={3} />
                    <span style={{ fontFamily:SANS, fontWeight:600, fontSize: big ? 20 : 14.5, color:"var(--ink)" }}>
                      {ln.text}</span>
                  </div>
                </React.Fragment>
              ))}
            </div>
          ))}
        </div>
      )}
      {doneAll && !auto && (
        <div style={{ display:"flex", gap:10, marginTop: big ? 30 : 22, animation:"si-in .3s both" }}>
          {onBets && <Btn onClick={onBets} style={{ fontSize:16, padding:"13px 28px" }}>To the bets</Btn>}
          <Btn kind={onBets ? "ghost" : "primary"} onClick={onClose} style={{ fontSize:16, padding:"13px 28px" }}>Close</Btn>
        </div>
      )}
      {!doneAll && !auto && <button onClick={() => setShown(items)} style={{ marginTop:20, background:"none",
        border:"none", color:"var(--night-text)", fontFamily:SANS, fontSize:12.5, cursor:"pointer" }}>skip</button>}
    </div>
  );
}

/* ─────────── TV mode ─────────── */
/* one point as a poker chip in the player's claimed color and skin;
   empty renders the open table spot it could fill */
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
  color: colorOverride, isLight: lightOverride, valueRing=false }) {
  const clipId = `chip-edge-${useId().replace(/:/g, "")}`;
  if (empty) return <div style={{ width:size, height:size, borderRadius:"50%",
    border:"1.5px dashed var(--muted)", opacity:0.45, flexShrink:0 }} />;
  const color = colorOverride || playerColor(p);
  const light = lightOverride ?? playerIsLight(p);
  const skin = skinOverride || playerSkin(p);
  const skinInk = light ? "var(--ink0)" : "var(--chip-mark)";
  const inlay = light ? "rgba(42,33,25,0.08)" : "rgba(251,243,228,0.10)";
  const inlayLine = light ? "rgba(42,33,25,0.38)" : "rgba(251,243,228,0.36)";
  const num = CHIP_PROFILES[p]?.num ?? playerNo(p);
  const stamp = stampOverride != null ? stampOverride : num;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true"
      style={{ flexShrink:0, display:"block",
        filter:size >= 32 ? "drop-shadow(0 2px 2px rgba(0,0,0,.22))" : "none" }}>
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
/* TV betting scene: the open board. Every live pick is a felt cell and the
   value chips sit on it; before any chips land, the game's hero plays. */
function TVBettingBoard({ state, events, ev }) {
  const open = (state.wagers || []).map(w => ({ w, r: resolveWager(state, w, events) }))
    .filter(x => x.r.status === "pending" && x.w.eventId === ev.id);
  const chipsIn = open.reduce((n, x) => n + x.w.stake, 0) / PT;
  if (!open.length) return (
    <div style={{ height:"100%", display:"flex", flexDirection:"column", alignItems:"center",
      justifyContent:"center", gap:6 }}>
      <EventSpotlight gameId={ev.game} big />
      <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:"clamp(22px,2.2vw,34px)",
        textTransform:"uppercase", color:"var(--night-text)" }}>Betting is open. No chips in yet.</div>
    </div>
  );
  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%" }}>
      <div style={{ flex:1, minHeight:0, overflowY:"auto" }}>
        <BetsBoard state={state} events={events} ev={ev} big />
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:12, paddingTop:12 }}>
        <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:"clamp(15px,1.5vw,22px)",
          textTransform:"uppercase", color:"var(--sun)" }}>
          {fmt(chipsIn * PT)} in play</span>
        <span style={{ fontFamily:SANS, fontSize:"clamp(12px,1.2vw,16px)", color:"var(--night-text)" }}>
          winner pays 2 to 1, everything else even</span>
      </div>
    </div>
  );
}

/* the betting board: one cell per live pick, bets sit on it as chip stacks */
function BetsBoard({ state, events, ev, big }) {
  const open = (state.wagers || []).map(w => ({ w, r: resolveWager(state, w, events) }))
    .filter(x => x.r.status === "pending" && x.w.eventId === ev.id);
  const cells = new Map();
  open.forEach(x => {
    const w = x.w;
    const k = w.kind === "outright" ? "o:" + (w.pickTeam ? (w.pickPlayers || []).join("+") : w.pick)
      : w.kind === "match" ? `m:${w.match?.join("-")}:${w.teamIdx}` : `s:${w.final ? "F" : w.group}:${w.pickKey}`;
    if (!cells.has(k)) {
      const l = wagerPickLabel(state, w, events);
      cells.set(k, { name: l.pick, bets: [] });
    }
    cells.get(k).bets.push({ player: w.player, stake: w.stake });
  });
  const list = [...cells.values()];
  if (!list.length) return (
    <div style={{ fontFamily:SANS, fontSize: big ? "clamp(16px,1.8vw,24px)" : 15, color:"var(--night-text)",
      textAlign:"center", padding:"30px 0" }}>Betting is open. No bets in yet.</div>
  );
  const chip = big ? 46 : 40;
  return (
    <div style={{ display:"flex", flexWrap:"wrap", gap:14,
      justifyContent: big ? "center" : "flex-start", alignItems:"flex-end" }}>
      {list.map((cell, i) => {
        const total = cell.bets.reduce((s, b) => s + b.stake, 0);
        return (
          <div key={i} style={{ background:CARD_BG, border:"1.5px solid var(--ink)",
            borderRadius:14, padding:"10px 14px 12px", minWidth:150 }}>
            <div style={{ display:"flex", alignItems:"baseline", gap:12, marginBottom:10 }}>
              <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize: big ? "clamp(16px,1.6vw,22px)" : 16,
                textTransform:"uppercase", color:"var(--ink)", whiteSpace:"nowrap",
                overflow:"hidden", textOverflow:"ellipsis", maxWidth:230 }}>{cell.name}</span>
              <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize: big ? "clamp(15px,1.5vw,20px)" : 15,
                color:"var(--sun)", marginLeft:"auto" }}>{fmt(total)}</span>
            </div>
            {/* one value-stamped chip per bet, the bettor's color says whose */}
            <div style={{ display:"flex", alignItems:"center", flexWrap:"wrap" }}>
              {cell.bets.map((b, j) => <span key={j} style={{ marginLeft: j ? -Math.round(chip * 0.22) : 0 }}>
                <BankChip p={b.player} size={chip} val={b.stake} /></span>)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
/* compact standings rail for live scenes */
function TVMiniBoard({ state, standings, allTied }) {
  return (
    <div style={{ width:320, flexShrink:0, background:CARD_BG, border:"1px solid var(--line)",
      borderRadius:14, overflow:"hidden", alignSelf:"flex-start" }}>
      <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:16, letterSpacing:"0.06em",
        textTransform:"uppercase", background:"var(--paper2)", color:"var(--muted2)",
        padding:"6px 14px", borderBottom:"1px solid var(--line)" }}>Standings</div>
      {standings.map((r, i) => (
        <div key={r.player} style={{ display:"flex", alignItems:"center", gap:10,
          padding:"clamp(3px,0.55vh,7px) 14px", borderTop: i > 0 ? "1px solid var(--line)" : "none",
          background: i === 0 && !allTied ? "var(--sun)" : "transparent" }}>
          <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:16, width:20, textAlign:"center",
            color: i === 0 && !allTied ? "var(--ink0)" : "var(--muted)" }}>{allTied ? "·" : r.rank}</span>
          <Avatar state={state} p={r.player} size={24} />
          <span style={{ fontFamily:SANS, fontWeight:700, fontSize:14, flex:1, minWidth:0,
            color: i === 0 && !allTied ? "var(--ink0)" : "var(--ink)",
            overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{disp(state, r.player)}</span>
          <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:19,
            color: i === 0 && !allTied ? "var(--ink0)" : "var(--ink)" }}>{fmt(r.pts)}</span>
        </div>
      ))}
    </div>
  );
}

/* the poker finale on the big screen: buy-in sheet until the cards go live,
   then the blind clock with the board rail */
function TVPoker({ state, standings }) {
  const pk = state.poker;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!pk?.startedAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [pk?.startedAt]);
  if (!pk) return null;
  if (!pk.startedAt) {
    return (
      <div key="scene-buyin" style={{ flex:1, display:"flex", flexDirection:"column", minHeight:0,
        padding:"6px 48px 16px", animation:"si-fade .6s ease-out" }}>
        <div style={{ display:"flex", alignItems:"center", gap:20, marginBottom:16 }}>
          <GameMark id="poker" size={72} />
          <div>
            <div style={{ fontFamily:SANS, fontWeight:700, fontSize:"clamp(12px,1.1vw,16px)", letterSpacing:"0.07em",
              color:"var(--night-text)", textTransform:"uppercase" }}>Championship Poker · buy-in</div>
            <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:"clamp(28px,2.8vw,44px)",
              textTransform:"uppercase", color:BONE }}>Your points are your chips.</div>
          </div>
          <div style={{ marginLeft:"auto", textAlign:"right" }}>
            <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:"clamp(28px,3vw,48px)", color:"var(--sun)" }}>{fmt(pk.total)}</div>
            <div style={{ fontFamily:SANS, fontWeight:700, fontSize:"clamp(11px,1vw,14px)", letterSpacing:"0.1em",
              color:"var(--night-text2)", textTransform:"uppercase" }}>chips in play</div>
          </div>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, flex:1, minHeight:0,
          alignContent:"start" }}>
          {standings.map(r => {
            const d = pokerDenoms(r.pts);
            return (
              <div key={r.player} style={{ display:"flex", alignItems:"center", gap:12, background:CARD_BG,
                border:"1px solid var(--line)", borderRadius:14, padding:"10px 16px" }}>
                <Avatar state={state} p={r.player} size={40} />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontFamily:SANS, fontWeight:700, fontSize:"clamp(14px,1.4vw,19px)", color:"var(--ink)",
                    overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{disp(state, r.player)}</div>
                  <div style={{ fontFamily:SANS, fontSize:"clamp(11px,1.1vw,14px)", color:"var(--muted)" }}>
                    {d.map(x => `${x.n} x ${x.v}`).join(" + ") || "0"}</div>
                </div>
                <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:"clamp(22px,2.2vw,34px)", color:"var(--sun)" }}>{fmt(r.pts)}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  const clk = pokerClock(pk, now);
  const outSet = new Set(pk.outs.map(o => o.player));
  return (
    <div key="scene-poker" style={{ flex:1, display:"flex", gap:26, padding:"6px 44px 16px",
      minHeight:0, animation:"si-fade .6s ease-out" }}>
      <div style={{ flex:1, minWidth:0, display:"flex", flexDirection:"column", alignItems:"center",
        justifyContent:"center", gap:6 }}>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <GameMark id="poker" size={54} />
          <span style={{ fontFamily:SANS, fontWeight:700, fontSize:"clamp(13px,1.2vw,17px)", letterSpacing:"0.14em",
            color:"var(--night-text)", textTransform:"uppercase" }}>Level {clk.idx + 1} of {pk.levels.length}</span>
        </div>
        <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:"clamp(80px,10vw,170px)", lineHeight:0.95,
          color:BONE }}>{fmt(clk.sb)} / {fmt(clk.bb)}</div>
        <div style={{ fontFamily:SANS, fontWeight:700, fontSize:"clamp(13px,1.2vw,17px)", letterSpacing:"0.16em",
          color:"var(--night-text2)", textTransform:"uppercase" }}>Blinds</div>
        <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:"clamp(48px,6vw,96px)", lineHeight:1,
          color: clk.last && clk.msLeft === 0 ? "var(--live2)" : clk.msLeft < 60000 ? "var(--live2)" : "var(--sun)",
          marginTop:8 }}>{clk.last && clk.msLeft === 0 ? "LAST LEVEL" : mmss(clk.msLeft)}</div>
        {pk.outs.length > 0 && (
          <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:18 }}>
            <span style={{ fontFamily:SANS, fontWeight:700, fontSize:"clamp(11px,1vw,14px)", letterSpacing:"0.1em",
              color:"var(--night-text2)", textTransform:"uppercase" }}>Out</span>
            {pk.outs.map(o => (
              <span key={o.player} style={{ opacity:0.4, filter:"grayscale(1)" }}>
                <Avatar state={state} p={o.player} size={34} /></span>
            ))}
          </div>
        )}
      </div>
      <TVMiniBoard state={state} standings={standings.map(r => outSet.has(r.player) ? { ...r } : r)} allTied={false} />
    </div>
  );
}

/* the draft, broadcast style: on-the-clock captain up top, pick stamps slam in,
   team columns fill live, the remaining pool waits at the bottom */
function TVDraft({ state, ev, d }) {
  const T = d.teams.length;
  const poolEmpty = d.pool.length === 0;
  const onClock = poolEmpty ? -1 : snakeTeam(d.picks.length, T);
  const cur = onClock >= 0 ? d.teams[onClock].captain : null;
  const last = d.picks[d.picks.length - 1];
  const round = Math.floor(d.picks.length / T) + 1;
  return (
    <div key="scene-draft" style={{ flex:1, display:"flex", flexDirection:"column", minHeight:0,
      padding:"6px 48px 16px", animation:"si-fade .6s ease-out" }}>
      <div style={{ display:"flex", alignItems:"center", gap:26, marginBottom:16 }}>
        {poolEmpty ? (
          <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:"clamp(30px,3vw,48px)",
            textTransform:"uppercase", color:"var(--sun)" }}>Draft complete</div>
        ) : (
          <div style={{ display:"flex", alignItems:"center", gap:18 }}>
            <span style={{ borderRadius:"50%", animation:"si-glow 2s infinite" }}>
              <Avatar state={state} p={cur} size={84} ring />
            </span>
            <div>
              <div style={{ ...label, fontSize:"clamp(12px,1.1vw,16px)", color:"var(--night-text)" }}>{ev.name} draft</div>
              <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:"clamp(30px,3vw,48px)", lineHeight:1.05,
                textTransform:"uppercase", color:BONE }}>{disp(state, cur)} is on the clock</div>
              <div style={{ fontFamily:SANS, fontWeight:600, fontSize:"clamp(13px,1.2vw,17px)", color:"var(--night-text)", marginTop:2 }}>
                Round {round}, pick {d.picks.length + 1}</div>
            </div>
          </div>
        )}
        {last && (
          <div key={d.picks.length} style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:14,
            background:CARD_BG, border:"2px solid var(--ink)", borderRadius:14, padding:"12px 20px",
            animation:"si-flag .55s ease-out both" }}>
            <span style={{ ...label, fontSize:"clamp(11px,1vw,14px)" }}>Pick {d.picks.length}</span>
            <Avatar state={state} p={last.player} size={46} />
            <div>
              <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:"clamp(19px,1.9vw,28px)", lineHeight:1,
                textTransform:"uppercase", color:"var(--ink)" }}>{disp(state, last.player)}</div>
              <div style={{ fontFamily:SANS, fontWeight:600, fontSize:"clamp(12px,1.1vw,15px)", color:"var(--muted2)" }}>
                to {disp(state, d.teams[last.team].captain)}</div>
            </div>
          </div>
        )}
      </div>
      <div style={{ display:"grid", gridTemplateColumns:`repeat(${T},1fr)`, gap:16, flex:1, minHeight:0 }}>
        {d.teams.map((t, i) => (
          <div key={i} style={{ background:CARD_BG, borderRadius:14, padding:"13px 15px", overflowY:"auto",
            border: i === onClock ? "2px solid var(--sun)" : "1px solid var(--line)",
            animation: i === onClock ? "si-glow 2s infinite" : "none" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, paddingBottom:9, marginBottom:9,
              borderBottom:"1.5px solid var(--ink)" }}>
              <Avatar state={state} p={t.captain} size={34} />
              <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:"clamp(16px,1.6vw,24px)",
                textTransform:"uppercase", color:"var(--ink)", flex:1, overflow:"hidden",
                textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{disp(state, t.captain)}</span>
              <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:"clamp(15px,1.5vw,22px)",
                color:"var(--muted)" }}>{t.players.length}</span>
            </div>
            {t.players.map(p => (
              <div key={p} style={{ display:"flex", alignItems:"center", gap:10, padding:"5px 0",
                animation:"si-in .3s ease-out both" }}>
                <Avatar state={state} p={p} size={30} />
                <span style={{ fontFamily:SANS, fontWeight:600, fontSize:"clamp(13px,1.3vw,18px)",
                  color:"var(--ink)" }}>{disp(state, p)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      {!poolEmpty && (
        <div style={{ display:"flex", alignItems:"center", gap:12, marginTop:14 }}>
          <span style={{ ...label, fontSize:"clamp(11px,1vw,14px)", color:"var(--night-text)", flexShrink:0 }}>
            Still available</span>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            {d.pool.map(p => <Avatar key={p} state={state} p={p} size={38} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function TVMode({ standings, state, events, onDeckEv, allTied, champion, coChamps, onExit }) {
  const operation = useMemo(() => resolveWeekendOperation(state, events), [state, events]);
  const operationEv = operation.event;
  const operationLifecycle = operation.lifecycle;
  const liveBracketEv = useMemo(() => {
    const c = events.filter(e => state.brackets[e.id] && state.draws[e.id] && !state.results[e.id]);
    if (onDeckEv && c.find(e => e.id === onDeckEv.id)) return onDeckEv;
    return c[0] || null;
  }, [events, state, onDeckEv]);
  const liveStageEv = useMemo(() => {
    const c = events.filter(e => state.stages[e.id] && !state.results[e.id]);
    if (onDeckEv && c.find(e => e.id === onDeckEv.id)) return onDeckEv;
    return c[0] || null;
  }, [events, state, onDeckEv]);
  const draftLive = useMemo(() => {
    for (const [eid, d] of Object.entries(state.drafts || {})) {
      const ev = events.find(e => e.id === eid);
      if (ev && d) return { ev, d };
    }
    return null;
  }, [state.drafts, events]);
  /* ambient broadcast data: the channel cycles through whatever is alive right now */
  let latest = null;
  Object.entries(state.results || {}).forEach(([eid, res]) => {
    const ev = events.find(e => e.id === eid);
    if (ev && res?.slots?.[0]?.length && (!latest || res.ts > latest.res.ts)) latest = { ev, res };
  });
  const tvImpact = useMemo(() => latest && !latest.res.stacks
    ? resultImpact(state, events, latest, standings) : "", [state, events, latest, standings]);
  const nextEv = events.find(e => !state.results[e.id] && !state.shelved[e.id] && e.id !== operationEv?.id);
  const allW = useMemo(() => (state.wagers || []).map(w => ({ w, r: resolveWager(state, w, events) })),
    [state, events]);
  const openBook = mergeWagerLines(allW.filter(x => x.r.status === "pending")).slice(0, 9);
  /* the ticker shows live blinds; tick once a second while cards are live */
  const [, pokerTick] = useState(0);
  useEffect(() => {
    if (!pokerLive(state)) return;
    const iv = setInterval(() => pokerTick(t => t + 1), 1000);
    return () => clearInterval(iv);
  }, [state.poker?.startedAt, state]);
  const joinNeeded = Object.keys(state.profiles || {}).length < ROSTER.length;
  const qrUrl = useMemo(() => {
    try {
      const qr = qrcode(0, "M");
      qr.addData(window.location.origin);
      qr.make();
      return qr.createDataURL(8, 0);
    } catch { return null; }
  }, []);

  const lifecycleLive = operationEv && ["betting-locked", "in-progress", "result-entry"]
    .includes(operationLifecycle?.phase);
  const liveEv = onDeckEv || liveBracketEv || liveStageEv || (lifecycleLive ? operationEv : null);
  /* Once an event is explicitly on deck, an unfinished bracket from another
     game must not leak into its TV scene. */
  const activeBracketEv = liveEv && state.brackets[liveEv.id] && state.draws[liveEv.id] ? liveEv : null;
  const activeStageEv = liveEv && state.stages[liveEv.id] ? liveEv : null;
  /* who steps up next: the first open, fully-seated matchup in the live bracket */
  const upNext = useMemo(() => activeBracketEv ? nextOpenMatch(state.brackets[activeBracketEv.id]) : null,
    [activeBracketEv, state]);
  const upNextDraw = activeBracketEv ? state.draws[activeBracketEv.id] : null;
  /* chips riding a TV bracket cell, value stamped, read-only */
  const tvBracketChips = (r, m, tIdx) => {
    const bets = allW.filter(x => x.r.status === "pending" && x.w.kind === "match" &&
      x.w.eventId === activeBracketEv?.id && x.w.drawId === upNextDraw?.id &&
      x.w.match?.[0] === r && x.w.match?.[1] === m && x.w.teamIdx === tIdx);
    if (!bets.length) return null;
    return (
      <span style={{ display:"flex", alignItems:"center", flexShrink:0 }}>
        {bets.slice(0, 4).map((x, i) => <span key={i} style={{ marginLeft: i ? -8 : 0 }}>
          <BankChip p={x.w.player} size={26} val={x.w.stake} /></span>)}
        {bets.length > 4 && <span style={{ fontFamily:SANS, fontWeight:700, fontSize:13,
          color:"var(--muted2)", marginLeft:3 }}>+{bets.length - 4}</span>}
      </span>
    );
  };
  const scenes = useMemo(() => {
    const s = ["board"];
    if (champion) return s;
    if (joinNeeded && qrUrl) s.push("join");
    if (nextEv) s.push("next");
    if (latest) s.push("latest");
    if (openBook.length) s.push("book");
    return s;
  }, [champion, joinNeeded, qrUrl, nextEv, latest, openBook.length]);
  const [sceneIdx, setSceneIdx] = useState(0);
  const sceneKey = scenes.join("|");
  const reducedMotion = prefersReducedMotion();
  useEffect(() => { setSceneIdx(0); }, [sceneKey]);
  useEffect(() => {
    if (scenes.length < 2 || reducedMotion) return;
    const t = setInterval(() => setSceneIdx(i => (i + 1) % scenes.length), 12000);
    return () => clearInterval(t);
  }, [sceneKey, scenes.length, reducedMotion]);
  const scene = scenes[sceneIdx] || "board";
  const sceneLabel = { ...label, fontSize:"clamp(12px,1.1vw,16px)", color:"var(--night-text)", marginBottom:6 };
  const sceneTitle = { fontFamily:DISPLAY, fontWeight:700, fontSize:"clamp(28px,2.8vw,44px)",
    textTransform:"uppercase", color:BONE, marginBottom:24 };

  /* ticker: a handful of labeled, high-signal segments instead of a name dump */
  const tickerItems = [];
  if (draftLive && draftLive.d.pool.length) {
    const cur = draftLive.d.teams[snakeTeam(draftLive.d.picks.length, draftLive.d.teams.length)]?.captain;
    if (cur) tickerItems.push({ tag:"Draft", tone:"var(--accent)", players:[cur],
      text:`${disp(state, cur)} is on the clock` });
  }
  if (latest) tickerItems.push({ tag:"Final", tone:"var(--olive)", players:latest.res.slots[0].slice(0,4),
    text:`${latest.ev.name}: ${teamLabel(state, { players: latest.res.slots[0] })}` });
  if (upNext && upNextDraw) tickerItems.push({ tag:"Up now", tone:"var(--sun)",
    players:[...upNextDraw.teams[upNext.a].players, ...upNextDraw.teams[upNext.b].players].slice(0,4),
    text:`${teamLabel(state, upNextDraw.teams[upNext.a])} vs ${teamLabel(state, upNextDraw.teams[upNext.b])}, ${upNext.roundName}` });
  if (onDeckEv) {
    const riding = allW.filter(x => x.r.status === "pending" && x.w.eventId === onDeckEv.id);
    const ptsIn = riding.reduce((n, x) => n + x.w.stake, 0);
    if (ptsIn > 0) tickerItems.push({ tag:"Betting", tone:"var(--accent2)",
      players:[...new Set(riding.map(x => x.w.player))].slice(0,4),
      text:`${fmt(ptsIn)} on ${onDeckEv.name}` });
  }
  mergeWagerLines(allW.filter(x => x.r.status === "won")).slice(0,2).forEach(x =>
    tickerItems.push({ tag:"Won", tone:"var(--green)", players:[x.w.player],
      text:`${disp(state, x.w.player)} +${x.r.delta}` }));
  if (pokerLive(state)) {
    const clk = pokerClock(state.poker, Date.now());
    tickerItems.push({ tag:"Poker", tone:"var(--accent)",
      text:`Blinds ${fmt(clk.sb)} / ${fmt(clk.bb)}, ${ROSTER.length - state.poker.outs.length} still in` });
  }
  const lastDuel = (state.duels || []).map(d => ({ d, r: resolveDuel(d) })).find(x => x.r.settled && !x.r.push);
  if (lastDuel) {
    const wRun = lastDuel.d.runs[lastDuel.r.winner], lRun = lastDuel.d.runs[lastDuel.r.loser];
    tickerItems.push({ tag:"Duel", tone:"var(--accent)", players:[lastDuel.r.winner, lastDuel.r.loser],
      text:`${disp(state, lastDuel.r.winner)} beat ${disp(state, lastDuel.r.loser)} in Quick Draw${
        lRun.foul ? ", on a foul" : `, ${wRun.ms} to ${lRun.ms}ms`}` });
  }
  const lastRuling = (state.adjustments||[])[0];
  if (lastRuling) tickerItems.push({ tag:"Ruling", tone:"var(--clay)", players:[lastRuling.player],
    text:`${disp(state, lastRuling.player)} ${lastRuling.delta > 0 ? "+" : ""}${lastRuling.delta}${lastRuling.reason ? ", " + lastRuling.reason : ""}` });
  if (!allTied && standings[0]) tickerItems.push({ tag:"Leader", tone:"var(--sun)", players:[standings[0].player],
    text:`${disp(state, standings[0].player)}, ${fmt(standings[0].pts)} points` });
  if (nextEv) tickerItems.push({ tag:"Next", tone:"var(--pool)",
    text:`${nextEv.name}, ${nextEv.value ? `${nextEv.value} pts` : "the finale"}` });
  if (!tickerItems.length) tickerItems.push({ tag:"Field Day", tone:"var(--accent)", text:"Scottsdale 2026" });

  const leader = !allTied ? standings[0] : null;
  const rest = leader ? standings.slice(1) : standings;
  const half = Math.ceil(rest.length / 2);

  return (
    <div style={{ position:"fixed", inset:0, display:"flex", flexDirection:"column", zIndex:60,
      background:"var(--night)", borderTop:"4px solid var(--sun)" }}>
      <button onClick={onExit} style={{ position:"absolute", top:"calc(16px + env(safe-area-inset-top))", right:16, zIndex:70,
        background:"var(--paper)", border:"1.5px solid var(--ghost-line)", color:"var(--ink)",
        width:40, height:40, borderRadius:10, fontSize:16, cursor:"pointer" }}>✕</button>

      {/* masthead */}
      <div style={{ display:"flex", alignItems:"center", gap:22,
        padding:"calc(26px + env(safe-area-inset-top)) 48px 14px" }}>
        <FDMark size={46} variant="night" />
        <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:"clamp(30px,3.4vw,50px)", lineHeight:1,
          textTransform:"uppercase", letterSpacing:"0.015em", color:"var(--sun)" }}>
          Field Day</div>
        <div style={{ ...label, fontSize:"clamp(11px,1vw,14px)", color:"var(--night-text)" }}>Scottsdale · 2026</div>
        <span style={{ display:"inline-flex", alignItems:"center", gap:7, ...label,
          fontSize:"clamp(10px,0.9vw,13px)", color:state.live ? "var(--live2)" : "var(--night-text)" }}>
          <span style={{ width:9, height:9, borderRadius:99,
            background:state.live ? "var(--clay)" : "var(--muted)",
            animation:state.live ? "si-pulse 1.6s infinite" : "none" }} />
          {state.live ? "Weekend live" : "Check-in"}
        </span>
        <div style={{ flex:1 }} />
        {onDeckEv && !champion && (
          <div style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 20px", borderRadius:14,
            background:"var(--clay-tint)",
            border:"1px solid rgba(192,71,58,0.45)", marginRight:56 }}>
            <span style={{ fontFamily:SANS, fontWeight:700, fontSize:"clamp(10px,0.9vw,13px)",
              letterSpacing:"0.18em", color:"var(--live2)", textTransform:"uppercase" }}>On deck</span>
            <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:"clamp(17px,1.7vw,26px)", color:"var(--bone)" }}>
              {onDeckEv.name}</span>
            <Tag tone="gold" style={{ fontSize:"clamp(10px,0.9vw,13px)" }}>Betting open</Tag>
          </div>
        )}
      </div>

      {champion ? (
        <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", padding:"0 60px" }}>
          <div style={{ width:"100%", maxWidth:1100 }}>
            <ChampionCard state={state} champion={champion} coChamps={coChamps} big />
          </div>
        </div>
      ) : state.poker && !state.results[state.poker.id] ? (
        <TVPoker state={state} standings={standings} />
      ) : draftLive ? (
        <TVDraft state={state} ev={draftLive.ev} d={draftLive.d} />
      ) : liveEv ? (
        <div key="scene-live" style={{ flex:1, display:"flex", gap:26, padding:"6px 44px 16px",
          minHeight:0, animation:"si-fade .6s ease-out" }}>
          <div style={{ flex:1, minWidth:0, display:"flex", flexDirection:"column", minHeight:0, overflow:"hidden" }}>
            <div style={{ display:"flex", alignItems:"center", gap:20, marginBottom:14 }}>
              <GameMark id={liveEv.game} size={72} />
              <div>
                <div style={{ ...sceneLabel, marginBottom:2, display:"flex", alignItems:"center", gap:9 }}>
                  <span style={{ width:9, height:9, borderRadius:99, background:"var(--sun)",
                    animation:"si-pulse 1.6s infinite" }} />
                  {operationEv?.id === liveEv.id && operationLifecycle
                    ? operationLifecycle.label
                    : onDeckEv ? "Betting open" : activeBracketEv ? "Live bracket"
                      : state.stages[activeStageEv?.id]?.kind === "heats" ? "Live heats" : "Live pools"}</div>
                <div style={{ ...sceneTitle, marginBottom:0, fontSize:"clamp(26px,2.5vw,40px)" }}>{liveEv.name}</div>
              </div>
              {/* the call to the table: who plays next, straight off the bracket */}
              {upNext && upNextDraw && (
                <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:14,
                  padding:"12px 22px", borderRadius:14, background:"var(--sun-tint)",
                  border:"1.5px solid var(--sun)", animation:"si-in .5s ease-out" }}>
                  <span style={{ fontFamily:SANS, fontWeight:700, fontSize:"clamp(10px,0.9vw,13px)",
                    letterSpacing:"0.18em", color:"var(--sun)", textTransform:"uppercase" }}>
                    Up now · {upNext.roundName}</span>
                  <AvatarStack state={state} players={upNextDraw.teams[upNext.a].players} size={30} max={3} />
                  <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:"clamp(16px,1.6vw,24px)", color:BONE }}>
                    {teamLabel(state, upNextDraw.teams[upNext.a])}
                    <span style={{ color:"var(--night-text)", padding:"0 8px" }}>vs</span>
                    {teamLabel(state, upNextDraw.teams[upNext.b])}</span>
                  <AvatarStack state={state} players={upNextDraw.teams[upNext.b].players} size={30} max={3} />
                </div>
              )}
            </div>
            <div style={{ flex:1, minHeight:0, overflowY:"auto" }}>
              {activeBracketEv ? <BracketGrid state={state} ev={activeBracketEv} gm={false} size="lg"
                  bet={{ chips: tvBracketChips }} hot={upNext ? [upNext.r, upNext.m] : null} />
                : activeStageEv ? <StageGrid state={state} ev={activeStageEv} gm={false} size="lg" />
                : onDeckEv ? <TVBettingBoard state={state} events={events} ev={onDeckEv} />
                  : (
                    <div style={{ height:"100%", minHeight:260, display:"flex", flexDirection:"column",
                      alignItems:"center", justifyContent:"center", textAlign:"center", padding:36,
                      border:"1px solid var(--ghost-line)", borderRadius:18, background:"var(--night2)" }}>
                      <div style={{ ...sceneLabel }}>{operationLifecycle?.label}</div>
                      <div style={{ ...sceneTitle, marginBottom:10 }}>{liveEv.name}</div>
                      <div style={{ fontFamily:SANS, fontWeight:700, fontSize:"clamp(18px,2vw,28px)",
                        color:"var(--night-text)" }}>
                        {operationLifecycle?.nextAction?.label || "Waiting for the commissioner"}</div>
                    </div>
                  )}
            </div>
            {onDeckEv && (activeBracketEv || activeStageEv) && (
              <div style={{ marginTop:14, maxHeight:190, overflowY:"hidden" }}>
                <BetsBoard state={state} events={events} ev={onDeckEv} />
              </div>
            )}
          </div>
          <TVMiniBoard state={state} standings={standings} allTied={allTied} />
        </div>
      ) : scene === "join" ? (
        <div key="scene-join" style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center",
          gap:"clamp(40px,6vw,110px)", padding:"10px 48px 20px", animation:"si-fade .6s ease-out" }}>
          <div>
            <FDMark size={120} variant="night" />
            <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:"clamp(64px,8vw,130px)", lineHeight:0.9,
              textTransform:"uppercase", color:"var(--sun)", margin:"26px 0 8px" }}>Field<br/>Day</div>
            <div style={{ fontFamily:SANS, fontWeight:700, fontSize:"clamp(14px,1.5vw,22px)",
              letterSpacing:"0.14em", color:"var(--night-text)" }}>SCOTTSDALE · 2026</div>
            <div style={{ fontFamily:SANS, fontSize:"clamp(14px,1.4vw,20px)", color:BONE, marginTop:22, lineHeight:1.5 }}>
              Scan to check in.
            </div>
          </div>
          <div style={{ background:BONE, border:"2px solid var(--ink)", borderRadius:14,
            padding:"clamp(14px,1.6vw,24px)", textAlign:"center" }}>
            <img src={qrUrl} alt="Scan to join" style={{ width:"clamp(220px,24vw,340px)", display:"block",
              imageRendering:"pixelated" }} />
            <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:"clamp(15px,1.5vw,22px)",
              textTransform:"uppercase", color:"var(--ink)", marginTop:10 }}>Player check-in</div>
          </div>
        </div>
      ) : scene === "next" && nextEv ? (
        <div key="scene-next" style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center",
          justifyContent:"center", padding:"10px 48px 20px", animation:"si-fade .6s ease-out" }}>
          <div style={sceneLabel}>Next up</div>
          <div style={{ marginBottom:18 }}><GameMark id={nextEv.game} size={110} /></div>
          <div style={{ background:phaseOf(nextEv).bg, color:phaseOf(nextEv).fg, border:"2px solid var(--ink0)",
            borderRadius:16, padding:"clamp(26px,4vh,50px) clamp(40px,5vw,90px)", textAlign:"center", maxWidth:1000 }}>
            <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:"clamp(48px,6vw,100px)", lineHeight:0.95,
              textTransform:"uppercase" }}>{nextEv.name}</div>
            <div style={{ fontFamily:SANS, fontWeight:700, fontSize:"clamp(14px,1.6vw,22px)", marginTop:14,
              letterSpacing:"0.06em" }}>{nextEv.value ? `WORTH ${nextEv.value} PTS` : "THE FINALE"}</div>
          </div>
          {nextEv.desc && <div style={{ fontFamily:SANS, fontSize:"clamp(14px,1.5vw,20px)", color:"var(--night-text)",
            marginTop:22, maxWidth:760, textAlign:"center", lineHeight:1.5 }}>{nextEv.desc}</div>}
        </div>
      ) : scene === "latest" && latest ? (
        <div key="scene-latest" style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center",
          justifyContent:"center", padding:"10px 48px 20px", animation:"si-fade .6s ease-out" }}>
          <div style={{ display:"inline-block", fontFamily:DISPLAY, fontWeight:700, letterSpacing:"0.14em",
            textTransform:"uppercase", background:"var(--olive)", color:BONE,
            fontSize:"clamp(14px,1.5vw,20px)", padding:"4px 18px", borderRadius:6, marginBottom:14 }}>Final</div>
          <div style={sceneTitle}>{latest.ev.name}</div>
          <div style={{ display:"flex", justifyContent:"center", gap:14, marginBottom:18 }}>
            {latest.res.slots[0].map(p => <Avatar key={p} state={state} p={p} size={84} ring />)}
          </div>
          <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:"clamp(36px,4.5vw,72px)",
            textTransform:"uppercase", color:"var(--sun)", lineHeight:1, textAlign:"center" }}>
            {teamLabel(state, { players: latest.res.slots[0] })}</div>
          <div style={{ fontFamily:SANS, fontWeight:700, fontSize:"clamp(15px,1.6vw,22px)", color:"var(--night-text)", marginTop:12 }}>
            {latest.res.stacks
              ? `${fmt(latest.res.stacks[latest.res.slots[0][0]] ?? 0)} chips`
              : `+${AWARDS[latest.ev.value]?.[0] ?? 0} each`}</div>
          {tvImpact ? <div style={{ fontFamily:SANS, fontWeight:600, fontSize:"clamp(14px,1.5vw,20px)",
            color:"var(--sun)", marginTop:10 }}>{tvImpact}</div> : null}
        </div>
      ) : scene === "book" ? (
        <div key="scene-book" style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center",
          justifyContent:"center", padding:"10px 48px 20px", animation:"si-fade .6s ease-out" }}>
          <div style={sceneLabel}>Betting</div>
          <div style={sceneTitle}>{openBook.length} open wager{openBook.length === 1 ? "" : "s"}</div>
          <div style={{ display:"grid", gridTemplateColumns: openBook.length > 4 ? "1fr 1fr 1fr" : "1fr",
            gap:"10px 24px", width:"100%", maxWidth:1300 }}>
            {openBook.map(x => {
              const l = wagerPickLabel(state, x.w, events);
              return (
                <div key={x.w.id} style={{ display:"flex", alignItems:"center", gap:12,
                  padding:"clamp(8px,1.2vh,14px) 16px", borderRadius:14, background:CARD_BG,
                  border:"1px solid var(--line)" }}>
                  <Avatar state={state} p={x.w.player} size={38} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontFamily:SANS, fontWeight:700, fontSize:"clamp(13px,1.7vh,19px)", color:"var(--ink)" }}>
                      {disp(state, x.w.player)} put {x.w.stake} on {l.pick}</div>
                    <div style={{ fontFamily:SANS, fontSize:"clamp(11px,1.4vh,15px)", color:"var(--muted)",
                      overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{l.ctx}</div>
                  </div>
                  <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:"clamp(15px,2vh,22px)", color:"var(--olive)" }}>
                    +{x.w.kind === "outright" ? OUTRIGHT_MULT * x.w.stake : x.w.stake}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div key="scene-board" style={{ flex:1, display:"flex", flexDirection:"column",
          padding:"6px 48px 16px", minHeight:0, animation:"si-fade .6s ease-out" }}>
          {leader && (
            <div style={{ display:"flex", alignItems:"center", gap:20, padding:"clamp(10px,1.6vh,20px) 26px",
              marginBottom:12, borderRadius:14, position:"relative", overflow:"hidden",
              background:GOLD_GRAD, border:"1px solid var(--accent2)", boxShadow:"var(--shadow-2)" }}>
              <div style={{ fontFamily:DISPLAY, fontWeight:800, fontSize:"clamp(24px,3.4vh,42px)", color:"var(--ink)", width:46, textAlign:"center" }}>1</div>
              <Avatar state={state} p={leader.player} size={56} />
              <div style={{ flex:1 }}>
                <div style={{ fontFamily:SANS, fontWeight:700, fontSize:"clamp(20px,3vh,34px)", color:"var(--ink)", lineHeight:1.1 }}>
                  {disp(state, leader.player)}</div>
                <div style={{ fontFamily:SANS, fontSize:"clamp(11px,1.5vh,15px)", color:"rgba(30,22,8,0.6)" }}>
                  {leader.wins} win{leader.wins===1?"":"s"}{leader.betNet !== 0 ? `, wagers ${leader.betNet>0?"+":""}${leader.betNet}` : ""}</div>
              </div>
              <div key={leader.pts} style={{ fontFamily:DISPLAY, fontWeight:800, fontSize:"clamp(30px,4.4vh,54px)", color:"var(--ink)", animation:"si-pop .5s ease-out" }}>{fmt(leader.pts)}</div>
            </div>
          )}
          <div style={{ flex:1, display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px 22px", alignContent:"start", minHeight:0 }}>
            {[rest.slice(0,half), rest.slice(half)].map((col, ci) => (
              <div key={ci}>
                {col.map(r => (
                  <div key={r.player} style={{ display:"flex", alignItems:"center", gap:14,
                    padding:"clamp(5px,0.9vh,11px) 16px", marginBottom:7, borderRadius:14,
                    background:CARD_BG,
                    border:"1px solid " + (r.rank===2 && !allTied ? "rgba(189,178,160,0.5)" : r.rank===3 && !allTied ? "rgba(192,122,75,0.5)" : "var(--line)") }}>
                    <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:"clamp(16px,2.2vh,26px)", width:36,
                      color: !allTied && r.rank===2 ? "var(--silver)" : !allTied && r.rank===3 ? "var(--bronze)" : "var(--muted)",
                      textAlign:"center" }}>{allTied ? "·" : r.rank}</div>
                    <Avatar state={state} p={r.player} size={36} />
                    <div style={{ fontFamily:SANS, fontWeight:700, fontSize:"clamp(14px,2vh,24px)", flex:1,
                      color:"var(--ink)" }}>{disp(state, r.player)}</div>
                    <div key={r.pts} style={{ fontFamily:DISPLAY, fontWeight:800, fontSize:"clamp(18px,2.5vh,30px)",
                      color:"var(--ink)", animation:"si-pop .5s ease-out" }}>{fmt(r.pts)}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* scene dots + ticker */}
      {scenes.length > 1 && !champion && !liveEv && (
        <div style={{ display:"flex", justifyContent:"center", gap:8, paddingBottom:8 }}>
          {scenes.map((s, i) => <div key={s} style={{ width:26, height:4, borderRadius:6,
            background: i === sceneIdx ? "var(--accent)" : "var(--line)" }} />)}
        </div>
      )}
      <div style={{ borderTop:"1px solid rgba(194,88,50,0.5)", background:"var(--paper2)", overflow:"hidden", padding:"9px 0" }}>
        <div style={{ display:"inline-flex", whiteSpace:"nowrap", willChange:"transform", transform:"translateZ(0)",
          animation:`si-tick ${Math.max(24, tickerItems.length * 9)}s linear infinite` }}>
          {[0,1].map(k => (
            <span key={k} style={{ display:"inline-flex", alignItems:"center" }}>
              {tickerItems.map((it, i) => (
                <span key={i} style={{ display:"inline-flex", alignItems:"center", gap:11, paddingRight:84 }}>
                  <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:"clamp(12px,1.1vw,15px)",
                    letterSpacing:"0.1em", textTransform:"uppercase", borderRadius:6, padding:"3px 10px",
                    background:it.tone, color: it.tone === "var(--sun)" ? "var(--ink0)" : BONE }}>{it.tag}</span>
                  {(it.players || []).map(p => <Avatar key={p} state={state} p={p} size={27} />)}
                  <span style={{ fontFamily:SANS, fontWeight:600, fontSize:"clamp(14px,1.4vw,19px)",
                    color:"var(--ink)" }}>{it.text}</span>
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────── rules ─────────── */
function Guide({ events, state }) {
  const [howToEv, setHowToEv] = useState(null);
  const lg = state?.logistics || {};
  const games = Object.entries(GAMES);
  const awards = ["The Championship", "Fraud of the Weekend", "Sharpshooter",
    "Degenerate of the Weekend", "Media MVP", "Teammate of the Weekend"];
  const SectionTitle = ({ kicker, title, note }) => (
    <div style={{ margin:"22px 2px 9px", minWidth:0 }}>
      <div style={{ ...label, fontSize:10, marginBottom:3 }}>{kicker}</div>
      <div style={{ display:"flex", alignItems:"baseline", gap:9, minWidth:0 }}>
        <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:24, lineHeight:1,
          textTransform:"uppercase", color:"var(--ink)", minWidth:0 }}>{title}</div>
        {note && <div style={{ marginLeft:"auto", fontFamily:SANS, fontSize:11.5,
          color:"var(--muted)", flexShrink:0 }}>{note}</div>}
      </div>
    </div>
  );
  const Rule = ({ title, meta, children }) => (
    <details style={{ background:"var(--paper)", border:"1px solid var(--line)",
      borderRadius:12, marginBottom:7, overflow:"hidden", maxWidth:"100%" }}>
      <summary style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 13px",
        cursor:"pointer", listStyle:"none", minWidth:0 }}>
        <span style={{ width:5, height:28, borderRadius:6, background:"var(--accent)", flexShrink:0 }} />
        <span style={{ flex:1, minWidth:0 }}>
          <span style={{ display:"block", fontFamily:DISPLAY, fontWeight:700, fontSize:18,
            lineHeight:1, textTransform:"uppercase", color:"var(--ink)" }}>{title}</span>
          <span style={{ display:"block", fontFamily:SANS, fontSize:11.5, color:"var(--muted)",
            marginTop:3, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{meta}</span>
        </span>
        <span aria-hidden="true" style={{ fontFamily:DISPLAY, fontWeight:700,
          fontSize:20, color:"var(--accent2)" }}>+</span>
      </summary>
      <div style={{ borderTop:"1px solid var(--line)", padding:"11px 14px 13px 28px",
        fontFamily:SANS, fontSize:13.5, lineHeight:1.58, color:"var(--muted2)" }}>{children}</div>
    </details>
  );
  return (
    <div style={{ padding:"0 16px 20px", maxWidth:"100%", overflowX:"hidden" }}>
      <div style={{ background:"var(--paper)", border:"1.5px solid var(--ink)",
        borderRadius:14, overflow:"hidden", marginBottom:4 }}>
        <div style={{ padding:"13px 14px 12px" }}>
          <div style={{ ...label, color:"var(--accent2)", marginBottom:5 }}>How Field Day works</div>
          <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:27, lineHeight:1,
            textTransform:"uppercase", color:"var(--ink)", maxWidth:360 }}>
            Build one score. Bring it to poker.</div>
          <div style={{ fontFamily:SANS, fontSize:13.5, lineHeight:1.55,
            color:"var(--muted2)", marginTop:8 }}>
            {ROSTER.length} players, {events.filter(e => !e.finale).length} events, one board.
            {" "}Teams reshuffle every event.
            Everyone starts at 1,000, and results, bets, and duels all move that same number.
          </div>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"minmax(0,1fr) auto minmax(0,1fr)",
          alignItems:"center", gap:9, padding:"10px 13px", background:"var(--paper2)",
          borderTop:"1px solid var(--line)" }}>
          <div style={{ minWidth:0 }}>
            <div style={{ ...label, fontSize:9.5 }}>All weekend</div>
            <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:18, color:"var(--ink)",
              textTransform:"uppercase", lineHeight:1.05 }}>Your points</div>
          </div>
          <div aria-hidden="true" style={{ color:"var(--accent2)", fontFamily:DISPLAY,
            fontWeight:700, fontSize:22 }}>→</div>
          <div style={{ minWidth:0, textAlign:"right" }}>
            <div style={{ ...label, fontSize:9.5 }}>The finale</div>
            <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:18, color:"var(--sun)",
              textTransform:"uppercase", lineHeight:1.05 }}>Your chips</div>
          </div>
        </div>
        <div style={{ padding:"11px 14px 13px", fontFamily:SANS, fontSize:12.5,
          color:"var(--muted)", lineHeight:1.5 }}>
          Whatever you have when the events end is the stack you are dealt at Championship Poker.
          The winner of that table is the Field Day champion.
        </div>
      </div>

      <SectionTitle kicker="The mechanics" title="Core rules" note="Tap to open" />
      <Rule title="Event payouts" meta="Friday 400 · Saturday 800, 1,200, 1,600">
        Friday events pay 400. Saturday morning pays 800, afternoon 1,200, and night 1,600.
        Solo events pay the podium. Team events pay every player on the placing team the full amount.
        Ties are settled on the spot, and a championship tie is one pressure putt.
      </Rule>
      <Rule title="Betting" meta="One open event · 100 to 1,000 per tap">
        Every event can be bet on. Betting opens when an event goes on deck and closes when the result posts.
        Pick a chip, 100 to 1,000, and tap who you like. The outright winner pays 2 to 1.
        Matchups, getting out of a heat or pool, and stage finals pay even. To limit the damage of one
        bad decision, only half your points can be at risk at a time. Bets settle off the official result,
        so correcting a result corrects the payouts. I can void any wager.
      </Rule>
      <Rule title="Duels" meta="Quick Draw · equal ante · three a day">
        Short on points? Challenge someone. Tap anyone on the board and name the ante. You both put up the same.
        You each play Quick Draw on your own phone whenever you want: the screen flashes after a random wait,
        tap it. Fastest tap takes the pot. Tapping early is a foul. Matching times or two fouls return the chips.
        One open challenge per pair, three a day.
      </Rule>
      <Rule title="Draws and brackets" meta="Balanced teams · live brackets, heats, and pools">
        I run each draw, and it reveals on every phone at once. Teams balance from your ratings and your results
        so far, and the later the weekend, the more the results count. Ratings are never shown. Some events are
        captains drafting instead. Brackets, heats, and pools update here and on the TV as they are played.
      </Rule>

      <SectionTitle kicker="Saturday night" title="Awards" />
      <div style={{ background:"var(--paper)", border:"1px solid var(--line)",
        borderRadius:14, padding:"12px 13px" }}>
        <div style={{ fontFamily:SANS, fontSize:12.5, color:"var(--muted2)", marginBottom:9 }}>
          Voted Saturday night.</div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
          {awards.map(x => <span key={x} style={{ fontFamily:SANS, fontWeight:700, fontSize:11.5,
            color:"var(--ink)", background:"var(--paper2)", border:"1px solid var(--line)",
            borderRadius:99, padding:"6px 9px", maxWidth:"100%" }}>{x}</span>)}
        </div>
      </div>

      <SectionTitle kicker="The house" title="Safety and respect" />
      <div style={{ background:"var(--paper)", border:"1px solid var(--line)",
        borderRadius:14, padding:"11px 13px" }}>
        <ul style={{ margin:0, paddingLeft:18, fontFamily:SANS, fontSize:13.5,
          lineHeight:1.55, color:"var(--muted2)" }}>
          <li style={{ marginBottom:5 }}>Alcohol is optional everywhere. NA equivalents carry no penalty. No forced participation.</li>
          <li style={{ marginBottom:5 }}>Rack cups hold water. Drink from your own cup.</li>
          <li style={{ marginBottom:5 }}>No hard contact. Respect the property.</li>
          <li style={{ marginBottom:5 }}>Everyone knows when the 360 cam is rolling.</li>
          <li>I can stop anything for safety.</li>
        </ul>
      </div>

      {(lg.venue || lg.checkIn) && (
        <>
          <SectionTitle kicker={`${EDITION.short} · Scottsdale`} title="Trip details" />
          <VenueCard lg={lg} />
          <div style={{ fontFamily:SANS, fontSize:12, color:"var(--muted)", margin:"-4px 2px 0" }}>
            To update your flights, tap your player icon in the top-left.</div>
        </>
      )}
      {!isStandalone() && (
        <>
          <SectionTitle kicker="On your phone" title="The app" />
          <div style={{ background:"var(--paper)", border:"1px solid var(--line)",
            borderRadius:14, padding:"12px 13px" }}><InstallHint /></div>
        </>
      )}

      <SectionTitle kicker={`${games.length} games`} title="Learn the games" note="Tap one" />
      <div style={{ display:"grid", gridTemplateColumns:"repeat(2,minmax(0,1fr))",
        gap:7, width:"100%", maxWidth:"100%" }}>
        {games.map(([id, g]) => {
          const objective = (g.howto || g.variants?.[0]?.howto)?.objective || "";
          return (
            <button key={id} onClick={() => setHowToEv(id)}
              aria-label={objective ? `${g.name}. ${objective}` : g.name}
              style={{ display:"flex", alignItems:"center", gap:8, width:"100%", minWidth:0,
                textAlign:"left", cursor:"pointer", background:"var(--paper)",
                border:"1px solid var(--line)", borderRadius:12, padding:"8px 9px" }}>
              <GameMark id={id} size={28} />
              <span style={{ flex:1, minWidth:0, fontFamily:DISPLAY, fontWeight:700, fontSize:15.5,
                color:"var(--ink)", textTransform:"uppercase", lineHeight:1.05,
                overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{g.name}</span>
              <span aria-hidden="true" style={{ color:"var(--accent2)", fontFamily:DISPLAY,
                fontWeight:700, fontSize:16, flexShrink:0 }}>›</span>
            </button>
          );
        })}
      </div>
      {howToEv && <HowToSheet gameId={howToEv} onClose={() => setHowToEv(null)} />}
    </div>
  );
}
