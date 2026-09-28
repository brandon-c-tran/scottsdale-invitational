import React from "react";
import { disp } from "../../../shared/core.js";
import { usePlayerIdentity } from "../identity/PlayerIdentityContext.js";
import { readableInk } from "../tv/tvModel.js";
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
export function TrophyHero({ size = 190, plate = "FIELD DAY", plateFont = 24 }) {
  const S = size;
  const cupTop = 0.27 * S, cupBot = 0.115 * S;
  const parts = [
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
        {plate && [0, 180].map(deg => (
          <div key={deg} style={{ position:"absolute", left:"50%", top:0, width:0.3 * S, height:0.1 * S,
            marginLeft:-0.15 * S, display:"flex", alignItems:"center", justifyContent:"center",
            backfaceVisibility:"hidden", fontFamily:"var(--fd-display)", fontWeight:700, fontSize:Math.max(plateFont, 0.052 * S),
            letterSpacing:"0.06em", color:"var(--bone)", whiteSpace:"nowrap",
            transform:`translateY(${0.63 * S}px) rotateY(${deg}deg) translateZ(${0.187 * S}px)` }}>
            {plate}</div>
        ))}
      </div>
    </div>
  );
}

/* a winner's number, stamped in their chip color with readable ink */
function Stamp({ p }) {
  const identity = usePlayerIdentity(p);
  return <span className="fd-trophy-stamp" style={{ background:identity.color, color:readableInk(identity.color) }}>
    {identity.num ?? "·"}</span>;
}

/* The cup on a stepped plinth, one tier per session, one plate per event.
   A plate stays blank until its result posts. */
export function TrophyPlates({ state, events, variant = "phone", cup = 150 }) {
  const tiers = plateTiers(trophyPlates(state, events));
  return (
    <div className={`fd-trophy is-${variant}`} style={{ "--cup":`${cup}px` }}>
      <TrophyHero size={cup} plate={variant === "tv" ? "FIELD DAY" : ""} />
      <ol className="fd-trophy-plinth" aria-label="Trophy plates">
        {tiers.map((tier, index) => (
          <li key={tier.session} className="fd-trophy-tier" style={{ "--tier":index, "--tier-count":tiers.length }}>
            <ol>
              {tier.plates.map(plate => (
                <li key={plate.eventId} className={`fd-trophy-plate${plate.posted ? " is-posted" : ""}${plate.winners.length > 3 ? " is-crowded" : ""}${plate.winners.length > 4 ? " is-packed" : ""}`}
                  aria-label={plate.posted ? `${plate.name}: ${plate.winners.map(p => disp(state, p)).join(", ")}` : plate.name}>
                  {plate.posted && <>
                    <span className="fd-trophy-plate-name" aria-hidden="true">{plate.name}</span>
                    <span className="fd-trophy-stamps" aria-hidden="true">{plate.winners.map(p => <Stamp key={p} p={p} />)}</span>
                  </>}
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
