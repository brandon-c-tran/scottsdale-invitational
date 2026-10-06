import React, { useEffect, useId, useLayoutEffect, useState } from "react";
import { EDITION } from "../../../shared/core.js";
import { ChipFace } from "../identity/PlayerIdentity.jsx";
import { EventName } from "../../ui/OneSafe.jsx";
import { GameMark } from "../../ui/GameMark.jsx";
import { useFreshChange } from "../../lib/motion.js";
import { programCover } from "./programModel.js";
import {
  CUP_TV, ENGRAVE, PLATE_FACES, cupEngravings, cupTvLayout, engraveTotal, fitChampionName, fitPlateName, plateNameWidth,
  trophyCup, trophyPlates,
} from "./trophy.js";
import "./trophy.css";

/* ─────────── the prize ───────────
   An actually-turned trophy: every part is a real solid of revolution built
   from a ring of facets, back faces culled. Flat facet tones, no glow. CSS
   only, so phones draw it without WebGL. */
function trophyRing({ key, topR, botR, h, yTop, n, hue, lo = 0.72 }) {
  const slant = Math.hypot(h, topR - botR);
  const tilt = Math.atan2(topR - botR, h) * 180 / Math.PI;
  const wTop = 2 * topR * Math.tan(Math.PI / n) + 0.6;
  const wBot = 2 * botR * Math.tan(Math.PI / n) + 0.6;
  const w = Math.max(wTop, wBot);
  const rMid = (topR + botR) / 2;
  const inset = t => 50 - 50 * (t / w);
  return Array.from({ length:n }, (_, i) => {
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
/* the plinth's plate is sized to its words: the lettering fits the plate
   (about .56em a letter with its tracking), at most plateFont, and a plate
   too small to letter at minPlateFont (the TV's 24px floor) stays blank */
export function trophyPlateFit(size, plate = "FIELD DAY", plateFont = 24, minPlateFont = 12) {
  const width = 0.36 * size;
  const font = Math.min(plateFont, Math.floor((width - 0.04 * size) / (Math.max(1, String(plate).length) * 0.56)));
  return { width, font:font >= minPlateFont ? font : 0 };
}
export function TrophyHero({ size = 190, plate = "FIELD DAY", plateFont = 24, minPlateFont = 12 }) {
  const S = size;
  const plateFit = plate ? trophyPlateFit(S, plate, plateFont, minPlateFont) : { width:0, font:0 };
  const cupTop = 0.27 * S, cupBot = 0.115 * S;
  const parts = [
    { key:"rim",  topR:0.285 * S, botR:0.275 * S, h:0.045 * S, yTop:0.04 * S, n:20, hue:"--sun", lo:0.8 },
    { key:"cup",  topR:cupTop,    botR:cupBot,    h:0.29 * S,  yTop:0.085 * S, n:20, hue:"--sun" },
    { key:"neck", topR:cupBot,    botR:0.045 * S, h:0.045 * S, yTop:0.375 * S, n:16, hue:"--sun", lo:0.62 },
    { key:"stem", topR:0.042 * S, botR:0.042 * S, h:0.115 * S, yTop:0.42 * S,  n:14, hue:"--sun", lo:0.6 },
    { key:"coll", topR:0.05 * S,  botR:0.15 * S,  h:0.05 * S,  yTop:0.535 * S, n:18, hue:"--sun", lo:0.68 },
    { key:"base", topR:0.16 * S,  botR:0.16 * S,  h:0.045 * S, yTop:0.585 * S, n:20, hue:"--sun", lo:0.7 },
    { key:"blk",  topR:0.185 * S, botR:0.185 * S, h:0.1 * S,   yTop:0.63 * S,  n:22, hue:"--trophy-base", lo:0.66 },
  ];
  return (
    <div style={{ width:S, height:S * 0.82, perspective:5.5 * S, flexShrink:0 }} aria-hidden="true">
      <div data-trophy style={{ position:"relative", width:"100%", height:"100%", transformStyle:"preserve-3d",
        transform:"rotateX(-8deg)", animation:"si-trophy 16s linear infinite" }}>
        {parts.map(p => trophyRing(p))}
        <div style={{ position:"absolute", left:"50%", top:0, width:0.55 * S, height:0.55 * S,
          marginLeft:-0.275 * S, borderRadius:"50%", backgroundColor:"var(--ink0)",
          transform:`translateY(${0.045 * S - 0.275 * S}px) rotateX(90deg)` }} />
        {[1, -1].map(dir => (
          <svg key={dir} width={S} height={S * 0.82} viewBox="0 0 100 82"
            style={{ position:"absolute", inset:0, pointerEvents:"none" }}>
            <path d={dir > 0 ? "M27 13 Q10 18 14 30 Q17 39 29 40" : "M73 13 Q90 18 86 30 Q83 39 71 40"}
              fill="none" stroke="var(--ink0)" strokeWidth="6.4" strokeLinecap="round"/>
            <path d={dir > 0 ? "M27 13 Q10 18 14 30 Q17 39 29 40" : "M73 13 Q90 18 86 30 Q83 39 71 40"}
              fill="none" stroke="var(--sun)" strokeWidth="3.4" strokeLinecap="round"/>
          </svg>
        ))}
        {plate && plateFit.font > 0 && [0, 180].map(deg => (
          <div key={deg} style={{ position:"absolute", left:"50%", top:0, width:plateFit.width, height:0.1 * S,
            marginLeft:-plateFit.width / 2, display:"flex", alignItems:"center", justifyContent:"center",
            backfaceVisibility:"hidden", fontFamily:"var(--fd-display)", fontWeight:700, fontSize:plateFit.font, lineHeight:1.15,
            letterSpacing:"0.06em", color:"var(--bone)", whiteSpace:"nowrap",
            transform:`translateY(${0.63 * S}px) rotateY(${deg}deg) translateZ(${0.187 * S}px)` }}>
            {plate}</div>
        ))}
      </div>
    </div>
  );
}

/* The same cup drawn flat, in one SVG: for a scene that needs every frame
   (the TV's produced crown), where a hundred and fifty 3D facets would be
   re-composited on every one. Same silhouette, same inks, turned a little
   so a lit face and a shaded face read as a solid. */
export function TrophyFlat({ size = 190, plate = "FIELD DAY", plateFont = 24, minPlateFont = 12 }) {
  const fit = plate ? trophyPlateFit(size, plate, plateFont, minPlateFont) : { font:0 };
  const shade = "color-mix(in srgb, var(--sun) 72%, var(--ink0))";
  const deep = "color-mix(in srgb, var(--sun) 58%, var(--ink0))";
  const handle = dir => dir > 0 ? "M27 13 Q10 18 14 30 Q17 39 29 40" : "M73 13 Q90 18 86 30 Q83 39 71 40";
  return (
    <svg width={size} height={size * 0.82} viewBox="0 0 100 82" aria-hidden="true" style={{ display:"block", flexShrink:0 }}>
      {[1, -1].map(dir => <g key={dir}>
        <path d={handle(dir)} fill="none" stroke="var(--ink0)" strokeWidth="6.4" strokeLinecap="round" />
        <path d={handle(dir)} fill="none" stroke="var(--sun)" strokeWidth="3.4" strokeLinecap="round" />
      </g>)}
      <path d="M23 8.5H77L62 36Q50 40.5 38 36Z" fill="var(--sun)" />
      <path d="M58 8.5H77L62 36Q57 38.2 52 38.8Z" fill={shade} />
      <rect x="21.5" y="4" width="57" height="4.5" rx="1.2" fill="var(--sun)" />
      <rect x="62" y="4" width="16.5" height="4.5" rx="1.2" fill={shade} />
      <ellipse cx="50" cy="4.6" rx="26.5" ry="1.5" fill="var(--ink0)" />
      <path d="M40 37.5H60L54.5 42H45.5Z" fill={deep} />
      <rect x="45.8" y="42" width="8.4" height="11.5" fill="var(--sun)" />
      <rect x="51" y="42" width="3.2" height="11.5" fill={shade} />
      <path d="M45 53.5H55L65 58.5H35Z" fill="var(--sun)" />
      <path d="M52 53.5H55L65 58.5H55Z" fill={shade} />
      <rect x="34" y="58.5" width="32" height="4.5" fill="var(--sun)" />
      <rect x="56" y="58.5" width="10" height="4.5" fill={shade} />
      <rect x="31.5" y="63" width="37" height="10" rx="0.8" fill="var(--trophy-base, color-mix(in srgb, var(--bone) 34%, var(--ink0)))" />
      {fit.font > 0 && <text x="50" y="68.6" textAnchor="middle" dominantBaseline="central" fill="var(--bone)"
        fontFamily="var(--fd-display)" fontWeight="700" letterSpacing=".06em" fontSize={fit.font * 100 / size}>{plate}</text>}
    </svg>
  );
}

/* ─────────── the weekend's cup ───────────
   A lit gold trophy on a stepped plinth, the way a real one stands on a
   shelf: the cup turned and polished (two hard reflections down its lit
   side, the lip catching the light, the inside dark, a knop on the stem, a
   flared foot casting its shadow), the champion engraved on a silver plate
   wrapped round the bowl, and under it a plinth of black lacquer in tiers,
   one per session (Friday on top), each tier inlaid with a small silver
   plaque per event in slate order (trophy.js trophyCup). The plaques stay
   subordinate to the cup: the game's mark cut in, and once the result
   posts its winner engraved beside it. The phone lays the plaques out with
   CSS; the TV sizes them from cupTvLayout so every line holds the 24px
   floor. A plaque engraves (light runs across it, the blank metal gives
   way, the names are cut in) on a fresh posting seen live, or on the TV's
   own trophy turn after the result (cupEngravings, in TrophyCard).
   Reduced motion shows the engraved plaque. */

/* the cup, in a 600x330 box: lip and opening, the bowl, its handles, the
   stem with its knop, the foot and its shadow on the plinth */
export const BOWL_BOX = Object.freeze({ w:600, h:330 });
const mix = (a, pct, b) => `color-mix(in srgb, var(${a}) ${pct}%, ${b.startsWith("--") ? `var(${b})` : b})`;
function CupArt() {
  const uid = useId().replace(/:/g, "");
  const id = name => `cup-${name}-${uid}`;
  const url = name => `url(#${id(name)})`;
  /* turned gold: dark at the edges, a hard reflection left of centre and a
     second, fainter one on the right, the way a lamp and a window sit in
     polished metal */
  const turned = [[0, mix("--sun", 30, "--ink0")], [.07, mix("--sun", 66, "--ink0")], [.17, mix("--sun", 72, "--bone")],
    [.23, mix("--sun", 38, "--bone")], [.29, mix("--sun", 86, "--bone")], [.42, "var(--sun)"], [.56, mix("--sun", 78, "--ink0")],
    [.7, mix("--sun", 58, "--ink0")], [.8, mix("--sun", 80, "--bone")], [.88, mix("--sun", 60, "--ink0")], [1, mix("--sun", 28, "--ink0")]];
  const stops = list => list.map(([offset, color]) => <stop key={offset} offset={offset} style={{ stopColor:color }} />);
  const handle = dir => {
    const x = v => dir > 0 ? v : BOWL_BOX.w - v;
    return `M${x(120)} 70 C${x(44)} 52 ${x(20)} 118 ${x(56)} 150 C${x(80)} 172 ${x(128)} 176 ${x(170)} 162`;
  };
  return (
    <svg className="fd-cup-art" viewBox={`0 0 ${BOWL_BOX.w} ${BOWL_BOX.h}`} aria-hidden="true">
      <defs>
        <linearGradient id={id("gold")} x1="0" x2="1" y1="0" y2="0">{stops(turned)}</linearGradient>
        <linearGradient id={id("lip")} x1="0" x2="1" y1="0" y2="0">{stops([[0, mix("--sun", 40, "--ink0")],
          [.2, mix("--sun", 50, "--bone")], [.5, "var(--sun)"], [.82, mix("--sun", 74, "--bone")], [1, mix("--sun", 36, "--ink0")]])}</linearGradient>
        {/* the bowl rounds away underneath and sits in the lip's shadow at the top */}
        <linearGradient id={id("round")} x1="0" x2="0" y1="0" y2="1">{stops([[0, mix("--ink0", 42, "transparent")],
          [.12, "transparent"], [.62, "transparent"], [1, mix("--ink0", 48, "transparent")]])}</linearGradient>
        <linearGradient id={id("inside")} x1="0" x2="0" y1="0" y2="1">{stops([[0, mix("--sun", 58, "--ink0")],
          [.5, mix("--ink0", 88, "--sun")], [1, mix("--sun", 34, "--ink0")]])}</linearGradient>
        <linearGradient id={id("arm")} x1="0" x2="0" y1="0" y2="1">{stops([[0, mix("--sun", 70, "--bone")],
          [.45, "var(--sun)"], [1, mix("--sun", 42, "--ink0")]])}</linearGradient>
        <radialGradient id={id("knop")} cx=".36" cy=".34" r=".7">{stops([[0, mix("--sun", 40, "--bone")],
          [.45, "var(--sun)"], [1, mix("--sun", 34, "--ink0")]])}</radialGradient>
        <radialGradient id={id("glow")} cx=".5" cy=".5" r=".5">{stops([[0, mix("--bone", 55, "transparent")],
          [1, "transparent"]])}</radialGradient>
        <radialGradient id={id("shadow")} cx=".5" cy=".5" r=".5">{stops([[0, mix("--ink0", 85, "transparent")],
          [1, "transparent"]])}</radialGradient>
      </defs>
      {/* its shadow on the plinth's top face */}
      <ellipse cx="300" cy="320" rx="190" ry="11" fill={url("shadow")} />
      {[1, -1].map(dir => <g key={dir}>
        <path d={handle(dir)} fill="none" stroke="var(--ink0)" strokeWidth="27" strokeLinecap="round" />
        <path d={handle(dir)} fill="none" stroke={url("arm")} strokeWidth="19" strokeLinecap="round" />
        <path d={handle(dir)} fill="none" stroke={mix("--bone", 55, "transparent")} strokeWidth="4" strokeLinecap="round"
          transform={`translate(${dir > 0 ? -2 : 2} -4)`} strokeDasharray="70 400" />
      </g>)}
      {/* the bowl */}
      <path d="M112 44 C114 150 196 226 300 230 C404 226 486 150 488 44 Z" fill={url("gold")} stroke="var(--ink0)" strokeWidth="3" />
      <path d="M112 44 C114 150 196 226 300 230 C404 226 486 150 488 44 Z" fill={url("round")} />
      {/* a bead turned round under the lip */}
      <path d="M117 76 Q300 104 483 76" fill="none" stroke={mix("--sun", 40, "--ink0")} strokeWidth="4" />
      <path d="M118 81 Q300 109 482 81" fill="none" stroke={mix("--sun", 60, "--bone")} strokeWidth="1.6" />
      {/* the light: one soft bloom and two hard streaks down the lit side */}
      <ellipse cx="206" cy="128" rx="34" ry="62" fill={url("glow")} />
      <path d="M170 96 C176 146 202 186 240 208" fill="none" stroke={mix("--bone", 78, "transparent")} strokeWidth="8" strokeLinecap="round" />
      <path d="M196 98 C200 130 214 158 236 176" fill="none" stroke={mix("--bone", 40, "transparent")} strokeWidth="3" strokeLinecap="round" />
      <path d="M432 92 C428 130 410 164 384 188" fill="none" stroke={mix("--bone", 30, "transparent")} strokeWidth="4" strokeLinecap="round" />
      {/* the lip and the opening, seen from a little above */}
      <ellipse cx="300" cy="44" rx="196" ry="25" fill={url("lip")} stroke="var(--ink0)" strokeWidth="3" />
      <ellipse cx="300" cy="42" rx="179" ry="17" fill={url("inside")} stroke={mix("--sun", 36, "--ink0")} strokeWidth="2" />
      <path d="M106 46 A194 23 0 0 0 494 46" fill="none" stroke={mix("--bone", 60, "transparent")} strokeWidth="2.2" />
      {/* the stem: a collar, a neck, the knop, a neck, the foot */}
      <ellipse cx="300" cy="230" rx="48" ry="9" fill={url("gold")} stroke="var(--ink0)" strokeWidth="2.5" />
      <path d="M281 236 H319 L311 256 H289 Z" fill={url("gold")} stroke="var(--ink0)" strokeWidth="2.5" />
      <ellipse cx="300" cy="265" rx="31" ry="16" fill={url("knop")} stroke="var(--ink0)" strokeWidth="2.5" />
      <path d="M289 279 H311 L318 296 H282 Z" fill={url("gold")} stroke="var(--ink0)" strokeWidth="2.5" />
      <path d="M282 294 H318 C332 301 380 304 406 309 V315 C360 325 240 325 194 315 V309 C220 304 268 301 282 294 Z"
        fill={url("gold")} stroke="var(--ink0)" strokeWidth="2.5" />
      <path d="M200 310 C250 302 350 302 400 310" fill="none" stroke={mix("--bone", 50, "transparent")} strokeWidth="2" />
    </svg>
  );
}

/* the faces a plate shows (a team's name stands for the rest) */
function PlateFaces({ players, size }) {
  const shown = players.slice(0, PLATE_FACES);
  return <span className={`fd-cup-faces${shown.length > 1 ? " is-overlap" : ""}`} aria-hidden="true">
    {shown.map(p => <ChipFace key={p} p={p} size={size} flat />)}
  </span>;
}
const Lines = ({ lines }) => lines.length > 1 ? <>{lines[0]}<br />{lines[1]}</> : lines[0];

/* a fresh posting seen live engraves now: the change id while it runs */
const ENGRAVE_MS = ENGRAVE.sweep + ENGRAVE.settle;
function useFreshEngrave(value, key, posted) {
  const change = useFreshChange(value, key);
  const [cut, setCut] = useState(0);
  useLayoutEffect(() => {
    if (change.animate && posted) setCut(change.changeId);
  }, [change.changeId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!cut) return undefined;
    const timer = setTimeout(() => setCut(0), ENGRAVE_MS + 200);
    return () => clearTimeout(timer);
  }, [cut]);
  return cut;
}
/* the light and the blank metal an engraving runs through; `--cut-at` is
   when it starts (a server-anchored TV turn, or 0 for a posting seen live) */
const Cut = () => <>
  <i className="fd-cup-cut" aria-hidden="true"><i className="fd-cup-blank" /></i>
  <i className="fd-cup-cut is-light" aria-hidden="true"><i className="fd-cup-sweep" /></i>
</>;

/* One plaque. Blank: dark metal with the game's mark lightly cut (and on
   the TV its event, so the plinth says what is left). Posted: polished
   silver, the mark and the winner engraved (the TV adds their faces). */
function CupPlate({ plate, tv, dims, engraveAt, onPlate, marksOnly = false }) {
  const fresh = useFreshEngrave(plate.postedAt, plate.eventId, plate.posted);
  const cutAt = engraveAt ?? (fresh ? 0 : null);
  const engraving = plate.engraving;
  const fit = tv && engraving && !marksOnly ? fitPlateName(engraving.name, plateNameWidth(dims.plateW, engraving.players.length)) : null;
  const label = plate.posted ? `${plate.name}: ${engraving?.name || ""}` : plate.name;
  const body = <>
    {cutAt !== null && <Cut />}
    <span className="fd-cup-mark" aria-hidden="true">
      <GameMark id={plate.game} variant={plate.variant} size={marksOnly ? (tv ? 40 : 18) : tv ? CUP_TV.plate.mark : 22} /></span>
    {engraving && !marksOnly && <span className="fd-cup-win" aria-hidden="true">
      {tv && <PlateFaces players={engraving.players} size={CUP_TV.plate.face} />}
      <span className="fd-cup-winner" style={fit ? { fontSize:fit.size } : undefined}>
        {fit ? <Lines lines={fit.lines} /> : engraving.name}</span>
    </span>}
    {!engraving && tv && !marksOnly && <span className="fd-cup-event" aria-hidden="true"><EventName name={plate.name} /></span>}
  </>;
  const cls = `fd-cup-plate${plate.posted ? " is-posted" : ""}${plate.next ? " is-next" : ""}${plate.live ? " is-live" : ""}`
    + `${cutAt !== null ? " is-engraving" : ""}`;
  const style = { ...(tv && dims ? { width:dims.plateW, height:dims.plateH } : null),
    ...(cutAt !== null ? { "--cut-at":`${Math.round(cutAt)}ms` } : null) };
  return <li key={fresh || "rest"} className={cls} style={style} aria-label={onPlate ? undefined : label}>
    {onPlate
      ? <button type="button" className="fd-cup-plate-open" onClick={() => onPlate(plate.eventId)} aria-label={label}>{body}</button>
      : body}
  </li>;
}

/* The champion's plate, wrapped round the bowl's face: polished silver
   with the edition engraved, outlined while the finale is next (lit while
   it is live), then the champion's name cut in under the edition. */
function Cartouche({ cup, tv, engraveAt, finale }) {
  const champs = cup.champions;
  const name = champs.map(champ => champ.name).join(" & ");
  const fresh = useFreshEngrave(champs.length ? name : "", "cup", champs.length > 0);
  const cutAt = engraveAt ?? (fresh ? 0 : null);
  const fit = tv && champs.length ? fitChampionName(name) : null;
  const cls = `fd-cup-cartouche${champs.length ? " is-posted" : ""}`
    + `${!champs.length && finale ? ` is-next${finale.live ? " is-live" : ""}` : ""}${cutAt !== null ? " is-engraving" : ""}`;
  return <div key={fresh || "rest"} className={cls} style={cutAt !== null ? { "--cut-at":`${Math.round(cutAt)}ms` } : undefined}
    role={champs.length ? "img" : undefined} aria-label={champs.length ? `Champion: ${name}` : undefined}>
    {cutAt !== null && <Cut />}
    <span className="fd-cup-edition" aria-hidden="true">{EDITION.label}</span>
    {champs.length > 0 && <span className="fd-cup-champ" aria-hidden="true" style={fit ? { fontSize:fit.size } : undefined}>
      {fit ? <Lines lines={fit.lines} /> : name}</span>}
  </div>;
}

/* the cup itself: the art with its plate laid on the bowl */
const Prize = ({ cup, tv, engraveAt, finale }) => <div className="fd-cup-bowl">
  <CupArt />
  <Cartouche cup={cup} tv={tv} engraveAt={engraveAt} finale={finale} />
</div>;

/* The cup. variant "phone" (Weekend, the keepsake) or "tv" (TrophyCard).
   onPlate(eventId) makes each plaque open its event. engrave: { [eventId |
   "cup"]: ms } the server-anchored engravings start at, relative to mount. */
export function TrophyCup({ state, events, variant = "phone", onPlate = null, engrave = null, cup: given = null }) {
  const cup = given || trophyCup(state, events);
  const tv = variant === "tv";
  const layout = tv ? cupTvLayout(cup) : null;
  const finale = cup.crowned ? null : events.find(ev => ev.finale && !state?.shelved?.[ev.id]);
  const lead = finale ? programCover(state || {}, events).lead : null;
  const finaleLead = lead?.event.id === finale?.id ? lead : null;
  const tiers = cup.bands.length;
  return (
    <div className={`fd-cup is-${variant}`} style={tv ? { width:layout.width, "--cup-label":`${CUP_TV.label}px`,
      "--cup-pad":`${CUP_TV.pad}px`, "--cup-gap":`${CUP_TV.gap}px`, "--cup-rim":`${CUP_TV.rim}px` } : undefined}>
      <Prize cup={cup} tv={tv} engraveAt={engrave?.cup ?? null} finale={finaleLead} />
      <ol className="fd-cup-base" aria-label="Winners by session">
        {cup.bands.map((band, index) => {
          const dims = layout?.bands[index];
          const words = band.label.split(" ");
          return <li key={band.session} className="fd-cup-band"
            style={dims ? { height:dims.height, width:dims.width } : { "--tier-rest":tiers - 1 - index }}>
            {tv && <span className="fd-cup-session" aria-hidden="true">{words.length > 1
              ? <>{words[0]}<br />{words.slice(1).join(" ")}</> : band.label}</span>}
            <ol className="fd-cup-plates" aria-label={band.label}
              style={{ gridTemplateColumns:dims ? `repeat(${dims.cols}, ${dims.plateW}px)`
                : `repeat(${Math.min(3, band.plates.length)}, minmax(0, 1fr))` }}>
              {band.plates.map(plate => <CupPlate key={plate.eventId} plate={plate} tv={tv} dims={dims}
                engraveAt={engrave?.[plate.eventId] ?? null} onPlate={onPlate} />)}
            </ol>
          </li>;
        })}
      </ol>
    </div>
  );
}

/* The cup at the crown (TV champion scene, the phone's crown): the same
   cup, held as the prize. The champion is cut into its plate on the
   crown's own beat when engraveAt is given (ms from mount, negative for a
   screen that joined late); the plinth's plaques carry only their game's
   mark (the names live on the trophy turn and in Weekend). variant "tv" is
   canvas pixels; "phone" fills its box. base={false} is the cup alone. */
export function CrownCup({ state, events = [], variant = "tv", engraveAt = null, base = true, cup: given = null }) {
  const cup = given || trophyCup(state, events);
  const tv = variant === "tv";
  const tiers = cup.bands.length;
  return (
    <div className={`fd-cup is-${variant} is-crown`} aria-hidden="true">
      <Prize cup={cup} tv={tv} engraveAt={engraveAt} finale={null} />
      {base && <ol className="fd-cup-base">
        {cup.bands.map((band, index) => <li key={band.session} className="fd-cup-band" style={{ "--tier-rest":tiers - 1 - index }}>
          <ol className="fd-cup-plates" style={{ gridTemplateColumns:`repeat(${Math.max(1, band.plates.length)}, minmax(0, 1fr))` }}>
            {band.plates.map(plate => <CupPlate key={plate.eventId} plate={plate} tv={tv} marksOnly />)}
          </ol>
        </li>)}
      </ol>}
    </div>
  );
}

export { trophyCup, trophyPlates, cupEngravings, engraveTotal, ENGRAVE };
