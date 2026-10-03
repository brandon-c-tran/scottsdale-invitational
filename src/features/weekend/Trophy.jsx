import React, { useEffect, useId, useLayoutEffect, useState } from "react";
import { ChipFace } from "../identity/PlayerIdentity.jsx";
import { EventName } from "../../ui/OneSafe.jsx";
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
   The champion on the cup, every event's winners engraved on its base:
   one band per session, top to bottom in time, plates in slate order
   (trophy.js trophyCup). The bowl is one SVG; the cartouche the champion
   is engraved in sits on it in HTML, so its lettering is real text. The
   base is rows of plates on turned metal. The phone lays the plates out
   with CSS; the TV sizes them from cupTvLayout so every line holds the
   24px floor. A plate engraves (light runs across it, the blank metal
   gives way, the names are cut in) on a fresh posting seen live, or on the
   TV's own trophy turn after the result (cupEngravings, in TrophyCard).
   Reduced motion shows the engraved plate. */

/* the bowl, in a 600x240 box: handles, a lip, the body tapering to its
   neck and foot. Gold from --sun, turned: dark at the edges, lit just left
   of centre, the way a lamp above and to the left catches a cylinder. */
export const BOWL_BOX = Object.freeze({ w:600, h:240 });
function CupBowlArt() {
  const uid = useId().replace(/:/g, "");
  const gold = `cup-gold-${uid}`, inside = `cup-in-${uid}`;
  const handle = dir => {
    const x = v => dir > 0 ? v : BOWL_BOX.w - v;
    return `M${x(140)} 58 C${x(68)} 40 ${x(38)} 82 ${x(54)} 118 C${x(66)} 150 ${x(118)} 162 ${x(172)} 154`;
  };
  return (
    <svg className="fd-cup-bowl-art" viewBox={`0 0 ${BOWL_BOX.w} ${BOWL_BOX.h}`} aria-hidden="true">
      <defs>
        <linearGradient id={gold} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" style={{ stopColor:"color-mix(in srgb, var(--sun) 46%, var(--ink0))" }} />
          <stop offset=".16" style={{ stopColor:"color-mix(in srgb, var(--sun) 82%, var(--ink0))" }} />
          <stop offset=".36" style={{ stopColor:"color-mix(in srgb, var(--sun) 58%, var(--bone))" }} />
          <stop offset=".5" style={{ stopColor:"var(--sun)" }} />
          <stop offset=".8" style={{ stopColor:"color-mix(in srgb, var(--sun) 70%, var(--ink0))" }} />
          <stop offset="1" style={{ stopColor:"color-mix(in srgb, var(--sun) 40%, var(--ink0))" }} />
        </linearGradient>
        <linearGradient id={inside} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" style={{ stopColor:"var(--ink0)" }} />
          <stop offset="1" style={{ stopColor:"color-mix(in srgb, var(--sun) 30%, var(--ink0))" }} />
        </linearGradient>
      </defs>
      {[1, -1].map(dir => <g key={dir}>
        <path d={handle(dir)} fill="none" stroke="var(--ink0)" strokeWidth="22" strokeLinecap="round" />
        <path d={handle(dir)} fill="none" stroke={`url(#${gold})`} strokeWidth="14" strokeLinecap="round" />
      </g>)}
      <path d="M120 46 C124 150 194 208 300 212 C406 208 476 150 480 46 Z" fill={`url(#${gold})`} stroke="var(--ink0)" strokeWidth="3" />
      {/* a bead turned round the bowl under its lip */}
      <path d="M123 64 Q300 80 477 64" fill="none" stroke="color-mix(in srgb, var(--sun) 50%, var(--ink0))" strokeWidth="3" />
      <path d="M266 210 H334 L324 228 H276 Z" fill={`url(#${gold})`} stroke="var(--ink0)" strokeWidth="3" />
      <path d="M232 228 H368 L386 240 H214 Z" fill={`url(#${gold})`} stroke="var(--ink0)" strokeWidth="3" />
      <rect x="108" y="18" width="384" height="30" rx="7" fill={`url(#${gold})`} stroke="var(--ink0)" strokeWidth="3" />
      <ellipse cx="300" cy="20" rx="182" ry="11" fill={`url(#${inside})`} stroke="var(--ink0)" strokeWidth="3" />
      {/* one hard reflection down the lit side */}
      <path d="M170 86 C176 134 200 168 232 188" fill="none" stroke="color-mix(in srgb, var(--bone) 60%, transparent)"
        strokeWidth="7" strokeLinecap="round" />
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

function CupPlate({ plate, tv, dims, engraveAt, onPlate }) {
  const fresh = useFreshEngrave(plate.postedAt, plate.eventId, plate.posted);
  const cutAt = engraveAt ?? (fresh ? 0 : null);
  const engraving = plate.engraving;
  const fit = tv && engraving ? fitPlateName(engraving.name, plateNameWidth(dims.plateW, engraving.players.length)) : null;
  const label = plate.posted ? `${plate.name}: ${engraving?.name || ""}` : plate.name;
  const body = <>
    {cutAt !== null && <Cut />}
    <span className="fd-cup-event" aria-hidden="true"><EventName name={plate.name} /></span>
    {engraving && <span className="fd-cup-win" aria-hidden="true">
      <PlateFaces players={engraving.players} size={tv ? CUP_TV.plate.face : 24} />
      <span className="fd-cup-winner" style={fit ? { fontSize:fit.size } : undefined}>
        {fit ? <Lines lines={fit.lines} /> : engraving.name}</span>
    </span>}
  </>;
  const cls = `fd-cup-plate${plate.posted ? " is-posted" : ""}${plate.next ? " is-next" : ""}${plate.live ? " is-live" : ""}`
    + `${cutAt !== null ? " is-engraving" : ""}`;
  const style = { ...(tv ? { width:dims.plateW, height:dims.plateH } : null),
    ...(cutAt !== null ? { "--cut-at":`${Math.round(cutAt)}ms` } : null) };
  return <li key={fresh || "rest"} className={cls} style={style} aria-label={onPlate ? undefined : label}>
    {onPlate
      ? <button type="button" className="fd-cup-plate-open" onClick={() => onPlate(plate.eventId)} aria-label={label}>{body}</button>
      : body}
  </li>;
}

/* the cup's cartouche is the finale's plate: blank until the crown,
   outlined while the finale is next (lit while it is live), then the
   champion engraved in it */
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
    {champs.length > 0 && <>
      <PlateFaces players={champs.map(champ => champ.player)} size={tv ? (fit.lines.length > 1 ? 44 : 56) : 28} />
      <span className="fd-cup-champ" aria-hidden="true" style={fit ? { fontSize:fit.size } : undefined}>
        {fit ? <Lines lines={fit.lines} /> : name}</span>
    </>}
  </div>;
}

/* The cup. variant "phone" (Weekend, the keepsake) or "tv" (TrophyCard).
   onPlate(eventId) makes each plate open its event. engrave: { [eventId |
   "cup"]: ms } the server-anchored engravings start at, relative to mount. */
export function TrophyCup({ state, events, variant = "phone", onPlate = null, engrave = null, cup: given = null }) {
  const cup = given || trophyCup(state, events);
  const tv = variant === "tv";
  const layout = tv ? cupTvLayout(cup) : null;
  const finale = cup.crowned ? null : events.find(ev => ev.finale && !state?.shelved?.[ev.id]);
  const lead = finale ? programCover(state || {}, events).lead : null;
  const finaleLead = lead?.event.id === finale?.id ? lead : null;
  return (
    <div className={`fd-cup is-${variant}`} style={tv ? { width:layout.width, "--cup-label":`${CUP_TV.label}px`,
      "--cup-pad":`${CUP_TV.pad}px`, "--cup-gap":`${CUP_TV.gap}px`, "--cup-rim":`${CUP_TV.rim}px` } : undefined}>
      <div className="fd-cup-bowl">
        <CupBowlArt />
        <Cartouche cup={cup} tv={tv} engraveAt={engrave?.cup ?? null} finale={finaleLead} />
      </div>
      <i className="fd-cup-collar" aria-hidden="true" />
      <ol className="fd-cup-base" aria-label="Winners by session">
        {cup.bands.map((band, index) => {
          const dims = layout?.bands[index];
          const words = band.label.split(" ");
          return <li key={band.session} className="fd-cup-band" style={dims ? { height:dims.height } : undefined}>
            <span className="fd-cup-session" aria-hidden="true">{tv && words.length > 1
              ? <>{words[0]}<br />{words.slice(1).join(" ")}</> : band.label}</span>
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

export { trophyCup, trophyPlates, cupEngravings, engraveTotal, ENGRAVE };
