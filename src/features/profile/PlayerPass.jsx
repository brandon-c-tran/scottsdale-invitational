import React, { useRef, useState } from "react";
import { EDITION, computeStandings } from "../../../shared/core.js";
import { ChipCoin } from "../identity/ChipCoin.jsx";
import { usePlayerIdentity } from "../identity/PlayerIdentityContext.js";
import { useReducedMotion } from "../../ui/motion.js";
import { useRisoTilt } from "./useRisoTilt.js";
import "./player-pass.css";

// Small card labels need more contrast than the chip's large center stamp.
// Pick the stronger ink against the actual claimed color, including midtones.
export function cardInk(color) {
  const luminanceOf = hex => {
    const channels = hex.slice(1).match(/.{2}/g).map(value => parseInt(value,16) / 255)
      .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
  };
  const luminance = luminanceOf(color), darkLuminance = luminanceOf("#070b09");
  return (luminance + .05) / (darkLuminance + .05) >= 1.05 / (luminance + .05)
    ? "#070b09" : "#ffffff";
}

/* The card leans toward the thumb (Riso tilt): printed layers slide by
   depth and the ink plate slips out of register. A press under 8px is still
   the flip; the chip spins on its own. `mint` lets a new claim mint the chip. */
export function PlayerPass({ state, p, display, num, photo, compact = false, mint = false }) {
  const identity = usePlayerIdentity(p);
  const [flipped, setFlipped] = useState(false);
  const reducedMotion = useReducedMotion();
  const cardRef = useRef(null);
  const tilt = useRisoTilt(cardRef, !reducedMotion && !!p);
  const profile = state.profiles?.[p] || {};
  const name = display?.trim() || profile.display || p;
  const number = num !== undefined && num !== null && num !== "" ? Number(num) : identity.num;
  const saved = photo || (profile.photoV ? `/api/photo/${encodeURIComponent(p)}?v=${profile.photoV}` : null);
  const [failed, setFailed] = useState(null);
  const portrait = saved && failed !== saved ? saved : null;
  const standing = state.live ? computeStandings(state).find(row => row.player === p) : null;
  if (!p) return null;
  /* The name shrinks to fit its longest word instead of breaking mid-word. */
  const longest = Math.max(4, ...name.split(/\s+/).map(word => word.length));
  const ghost = number == null ? "FD" : String(number).padStart(2, "0");

  return (
    <div className={`fd-pass-wrap${compact ? " fd-pass-compact" : ""}`}
      style={{ "--pass-color":identity.color, "--pass-ink":cardInk(identity.color), "--pass-name-chars":longest }}>
      <button type="button" ref={cardRef} className="fd-pass" {...tilt.handlers}
        onClick={() => { if (tilt.consumeClick()) return; tilt.flip(); setFlipped(value => !value); }}
        aria-label={`${name}'s player card. ${flipped ? "Show front" : "Turn over"}`}
        aria-pressed={flipped}>
        <span className="fd-pass-shadow" aria-hidden="true" />
        <span className="fd-pass-tilt">
        <span className={`fd-pass-inner${flipped ? " is-flipped" : ""}`}>
          <span className="fd-pass-face fd-pass-front" aria-hidden={flipped}>
            <span className="fd-pass-top"><span>FIELD DAY</span><span>{EDITION.name.toUpperCase()} / {EDITION.year}</span></span>
            <span className="fd-pass-art">
              <span className="fd-pass-orbit" />
              <span className="fd-pass-number">{ghost}</span>
              <span className="fd-pass-number fd-pass-plate" aria-hidden="true">{ghost}</span>
              {portrait && <img className="fd-pass-photo" src={portrait} alt="" onError={() => setFailed(portrait)} />}
              <span className={`fd-pass-chip${portrait ? " with-photo" : ""}`}>
                <ChipCoin p={p} size={portrait ? 78 : 112} stamp={number == null ? undefined : String(number)} mint={mint} />
              </span>
              <span className="fd-pass-edition">SCOTTSDALE<br />ARIZONA</span>
            </span>
            <span className="fd-pass-name">{name}</span>
            <span className="fd-pass-foot"><span>{EDITION.short}</span><span>PLAYER / {number ?? "FD"}</span></span>
          </span>
          <span className="fd-pass-face fd-pass-back" aria-hidden={!flipped}>
            <span className="fd-pass-top"><span>{name}</span><span>FIELD DAY / {EDITION.year}</span></span>
            <span className="fd-pass-back-title">PLAYER<br />{number == null ? "CARD" : String(number).padStart(2, "0")}</span>
            <span className="fd-pass-facts">
              <span><span>Scottsdale, Arizona</span><span>{EDITION.short}</span></span>
              {standing && <span><span>Current chips</span><strong>{standing.pts.toLocaleString("en-US")}</strong></span>}
              {profile.walkoutTrack?.name && <span><span>Walkout song</span><strong>{profile.walkoutTrack.name}</strong></span>}
            </span>
            <span className="fd-pass-foot"><span>{name.toUpperCase()}</span><span>{EDITION.year}</span></span>
          </span>
        </span>
        </span>
      </button>
      <span className="fd-pass-hint">{flipped ? "Tap to see the front" : "Tap to turn over"}</span>
    </div>
  );
}
