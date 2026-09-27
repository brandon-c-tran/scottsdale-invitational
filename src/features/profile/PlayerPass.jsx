import React, { useState } from "react";
import { EDITION, computeStandings } from "../../../shared/core.js";
import { ChipFace } from "../identity/PlayerIdentity.jsx";
import { usePlayerIdentity } from "../identity/PlayerIdentityContext.js";
import "./player-pass.css";

// Small card labels need more contrast than the chip's large center stamp.
// Pick the stronger ink against the actual claimed color, including midtones.
function cardInk(color) {
  const luminanceOf = hex => {
    const channels = hex.slice(1).match(/.{2}/g).map(value => parseInt(value,16) / 255)
      .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
  };
  const luminance = luminanceOf(color), darkLuminance = luminanceOf("#070b09");
  return (luminance + .05) / (darkLuminance + .05) >= 1.05 / (luminance + .05)
    ? "#070b09" : "#ffffff";
}

export function PlayerPass({ state, p, display, num, photo, compact = false }) {
  const identity = usePlayerIdentity(p);
  const [flipped, setFlipped] = useState(false);
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

  return (
    <div className={`fd-pass-wrap${compact ? " fd-pass-compact" : ""}`}
      style={{ "--pass-color":identity.color, "--pass-ink":cardInk(identity.color), "--pass-name-chars":longest }}>
      <button type="button" className="fd-pass" onClick={() => setFlipped(value => !value)}
        aria-label={`${name}'s player card. ${flipped ? "Show front" : "Turn over"}`}
        aria-pressed={flipped}>
        <span className={`fd-pass-inner${flipped ? " is-flipped" : ""}`}>
          <span className="fd-pass-face fd-pass-front" aria-hidden={flipped}>
            <span className="fd-pass-top"><span>FIELD DAY</span><span>SCOTTSDALE / 2026</span></span>
            <span className="fd-pass-art">
              <span className="fd-pass-orbit" />
              <span className="fd-pass-number">{number == null ? "FD" : String(number).padStart(2, "0")}</span>
              {portrait && <img className="fd-pass-photo" src={portrait} alt="" onError={() => setFailed(portrait)} />}
              <span className={`fd-pass-chip${portrait ? " with-photo" : ""}`}>
                <ChipFace p={p} size={portrait ? 78 : 112} stamp={number == null ? undefined : String(number)} />
              </span>
              <span className="fd-pass-edition">SCOTTSDALE<br />ARIZONA</span>
            </span>
            <span className="fd-pass-name">{name}</span>
            <span className="fd-pass-foot"><span>{EDITION.short}</span><span>PLAYER / {number ?? "FD"}</span></span>
          </span>
          <span className="fd-pass-face fd-pass-back" aria-hidden={!flipped}>
            <span className="fd-pass-top"><span>{name}</span><span>FIELD DAY / 2026</span></span>
            <span className="fd-pass-back-title">PLAYER<br />{number == null ? "CARD" : String(number).padStart(2, "0")}</span>
            <span className="fd-pass-facts">
              <span><span>Scottsdale, Arizona</span><span>{EDITION.short}</span></span>
              {standing && <span><span>Current chips</span><strong>{standing.pts.toLocaleString("en-US")}</strong></span>}
              {profile.walkoutTrack?.name && <span><span>Walkout song</span><strong>{profile.walkoutTrack.name}</strong></span>}
            </span>
            <span className="fd-pass-foot"><span>{name.toUpperCase()}</span><span>2026</span></span>
          </span>
        </span>
      </button>
      <span className="fd-pass-hint">{flipped ? "Tap to see the front" : "Tap to turn over"}</span>
    </div>
  );
}
