import React from "react";
import { disp } from "../../../shared/core.js";
import { ChipFace } from "../identity/PlayerIdentity.jsx";
import { podiumGroups } from "../tv/tvModel.js";
import { EventName } from "../../ui/OneSafe.jsx";
import { trophyPlates, plateTiers } from "./trophy.js";
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

/* who won a plate: their photo chips, then the name the room knows them
   by (the player, the pair, the team), never a jersey number */
const PLATE_FACES = 3;
function PlateWinners({ state, plate, chip }) {
  const groups = podiumGroups(state, plate.eventId, plate.winners);
  const label = groups.length > 2 ? `${groups.length} tied` : groups.map(group => group.name).join(", ");
  /* a team is named, so three of its chips stand for it */
  const shown = plate.winners.slice(0, PLATE_FACES);
  return <span className="fd-trophy-win">
    <span className={`fd-trophy-faces${shown.length > 1 ? " is-overlap" : ""}`} aria-hidden="true">
      {shown.map(p => <ChipFace key={p} p={p} size={chip} flat />)}
    </span>
    <span className="fd-trophy-winner" aria-hidden="true">{label}</span>
  </span>;
}

/* The cup on a stepped plinth, one tier per session, one plate per event.
   A plate stays blank until its result posts. */
export function TrophyPlates({ state, events, variant = "phone", cup = 150, onPlate = null }) {
  const tiers = plateTiers(trophyPlates(state, events));
  const chip = variant === "tv" ? 44 : 24;
  return (
    <div className={`fd-trophy is-${variant}`} style={{ "--cup":`${cup}px` }}>
      <TrophyHero size={cup} plate={variant === "tv" ? "FIELD DAY" : ""} minPlateFont={variant === "tv" ? 24 : 12} />
      <ol className="fd-trophy-plinth" aria-label="Trophy plates">
        {tiers.map((tier, index) => (
          <li key={tier.session} className="fd-trophy-tier" style={{ "--tier":index, "--tier-count":tiers.length }}>
            <ol>
              {tier.plates.map(plate => (
                <li key={plate.eventId} className={`fd-trophy-plate${plate.posted ? " is-posted" : ""}`}
                  aria-label={plate.posted ? `${plate.name}: ${plate.winners.map(p => disp(state, p)).join(", ")}` : plate.name}>
                  {plate.posted && (onPlate
                    ? <button type="button" className="fd-trophy-plate-open" onClick={() => onPlate(plate.eventId)}
                      aria-label={`${plate.name}: ${plate.winners.map(p => disp(state, p)).join(", ")}`}>
                      <span className="fd-trophy-plate-name" aria-hidden="true"><EventName name={plate.name} /></span>
                      <PlateWinners state={state} plate={plate} chip={chip} />
                    </button>
                    : <>
                      <span className="fd-trophy-plate-name" aria-hidden="true"><EventName name={plate.name} /></span>
                      <PlateWinners state={state} plate={plate} chip={chip} />
                    </>)}
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ol>
    </div>
  );
}

export { trophyPlates, plateTiers };
