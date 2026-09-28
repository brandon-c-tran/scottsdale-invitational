import React, { useEffect, useMemo, useRef, useState } from "react";
import { EDITION, allEventsOf, computeStandings, disp } from "../../../shared/core.js";
import { ChipCoin } from "../identity/ChipCoin.jsx";
import { usePlayerIdentity } from "../identity/PlayerIdentityContext.js";
import { useReducedMotion } from "../../ui/motion.js";
import { signedChips } from "../../lib/motion.js";
import { useRisoTilt } from "./useRisoTilt.js";
import { recordText, seasonStats } from "./seasonStats.js";
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
   the flip; the chip spins on its own. `mint` lets a new claim mint the chip.
   The back is the player's season (seasonStats); `viewer` adds their record
   against this player, or their rivalries on their own card. */
export function PlayerPass({ state, p, display, num, photo, compact = false, mint = false,
  viewer = null, events, standings, onFlip }) {
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
  const rows = useMemo(() => standings || (state.live ? computeStandings(state) : null), [standings, state]);
  const standing = state.live ? rows?.find(row => row.player === p) : null;
  const season = useMemo(() => p ? seasonStats(state, p,
    { events:events || allEventsOf(state), standings:rows || undefined, viewer }) : null,
  [state, p, events, rows, viewer]);
  const sheet = !!season && (season.active || !!season.versus);
  /* The season can outgrow the 4:5 front, so the turned card grows to fit it. */
  const seasonRef = useRef(null);
  const [backHeight, setBackHeight] = useState(0);
  useEffect(() => {
    const body = seasonRef.current, face = body?.parentElement;
    if (!body || !face || typeof window === "undefined") { setBackHeight(0); return undefined; }
    const measure = () => {
      const cs = window.getComputedStyle(face);
      const frame = ["paddingTop", "paddingBottom", "borderTopWidth", "borderBottomWidth"]
        .reduce((sum, key) => sum + (parseFloat(cs[key]) || 0), 0);
      setBackHeight(Math.ceil(body.offsetHeight + frame));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(body);
    return () => observer.disconnect();
  }, [sheet]);
  if (!p) return null;
  /* The name shrinks to fit its longest word instead of breaking mid-word. */
  const longest = Math.max(4, ...name.split(/\s+/).map(word => word.length));
  const ghost = number == null ? "FD" : String(number).padStart(2, "0");
  const turn = () => { const next = !flipped; setFlipped(next); onFlip?.(next); };

  return (
    <div className={`fd-pass-wrap${compact ? " fd-pass-compact" : ""}`}
      style={{ "--pass-color":identity.color, "--pass-ink":cardInk(identity.color), "--pass-name-chars":longest }}>
      <button type="button" ref={cardRef} className="fd-pass" {...tilt.handlers}
        style={flipped && backHeight ? { minHeight:backHeight } : undefined}
        onClick={() => { if (tilt.consumeClick()) return; tilt.flip(); turn(); }}
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
          <span className={`fd-pass-face fd-pass-back${sheet ? " is-season" : ""}`} aria-hidden={!flipped}>
            {sheet ? <SeasonBack state={state} name={name} number={number} season={season}
              walkout={profile.walkoutTrack?.name} bodyRef={seasonRef} /> : <>
              <span className="fd-pass-top"><span>{name}</span><span>FIELD DAY / {EDITION.year}</span></span>
              <span className="fd-pass-back-title">PLAYER<br />{number == null ? "CARD" : String(number).padStart(2, "0")}</span>
              <span className="fd-pass-facts">
                <span><span>Scottsdale, Arizona</span><span>{EDITION.short}</span></span>
                {standing && <span><span>Current chips</span><strong>{standing.pts.toLocaleString("en-US")}</strong></span>}
                {profile.walkoutTrack?.name && <span><span>Walkout song</span><strong>{profile.walkoutTrack.name}</strong></span>}
              </span>
              <span className="fd-pass-foot"><span>{name.toUpperCase()}</span><span>{EDITION.year}</span></span>
            </>}
          </span>
        </span>
        </span>
      </button>
      <span className="fd-pass-hint">{flipped ? "Tap to see the front" : "Tap to turn over"}</span>
    </div>
  );
}

const fmt = n => (n ?? 0).toLocaleString("en-US");
const awardText = row => row.award === null || row.award === undefined
  ? row.status === "playing" ? "Playing" : "–"
  : row.award > 0 ? signedChips(row.award) : "0";

/* The back as a stat sheet: your record against this player first, then
   every event and place, the totals, and (on your own card) your rivals.
   Only what exists renders, so a quiet weekend is a short card. */
function SeasonBack({ state, name, number, season, walkout, bodyRef }) {
  const { versus, events, bets, duels, rivals } = season;
  const settledBets = bets.won + bets.lost;
  const settledDuels = duels.won + duels.lost + duels.push;
  let index = 0;
  const order = () => ({ "--i":index++ });
  const totals = [
    season.rank !== null && { key:"rank", value:String(season.rank), label:"Rank" },
    season.pts !== null && { key:"chips", value:fmt(season.pts), label:"Chips" },
    settledBets > 0 && { key:"bets", value:signedChips(bets.net), label:`Bets ${recordText(bets)}` },
    settledDuels > 0 && { key:"duels", value:recordText(duels), label:"Quick Draw" },
  ].filter(Boolean);
  const meetings = versus ? versus.meetings.slice(-3) : [];
  return <span className="fd-pass-season" ref={bodyRef}>
    <span className="fd-pass-top"><span>{name}</span><span>FIELD DAY / {EDITION.year}</span></span>
    <span className="fd-pass-season-head">
      <span className="fd-pass-season-title">{number == null ? "Player card" : `Player ${number}`}</span>
      {number != null && <span className="fd-pass-season-ghost">{String(number).padStart(2, "0")}</span>}
    </span>
    {versus && <span className="fd-pass-box fd-pass-row" style={order()}>
      <span className="fd-pass-box-head"><span>You vs {name}</span><strong>{recordText(versus)}</strong></span>
      {meetings.map((meeting, at) => <span className="fd-pass-line" key={`${meeting.eventId}-${at}`}>
        <span>{meeting.label === meeting.event ? meeting.event : `${meeting.event} · ${meeting.label}`}</span>
        <strong>{meeting.won ? "You" : name}</strong>
      </span>)}
      {versus.duels.won + versus.duels.lost + versus.duels.push > 0 && <span className="fd-pass-line">
        <span>Quick Draw</span><strong>{recordText(versus.duels)}</strong></span>}
      {versus.bets.won + versus.bets.lost > 0 && <span className="fd-pass-line">
        <span>Your bets on {name}</span><strong>{signedChips(versus.bets.net)}</strong></span>}
    </span>}
    {events.length > 0 && <span className="fd-pass-table">
      <span className="fd-pass-table-head fd-pass-row" style={order()}><span>Event</span><span>Place</span><span>Chips</span></span>
      {events.map(row => <span key={row.id} className={`fd-pass-table-row fd-pass-row is-${row.status}`} style={order()}>
        <span>{row.name}</span><strong>{row.place}</strong><span>{awardText(row)}</span>
      </span>)}
    </span>}
    {totals.length > 0 && <span className="fd-pass-totals fd-pass-row" style={order()}>
      {totals.map(item => <span key={item.key}><strong>{item.value}</strong><small>{item.label}</small></span>)}
    </span>}
    {rivals.length > 0 && <span className="fd-pass-box fd-pass-row" style={order()}>
      <span className="fd-pass-box-head"><span>Rivalries</span></span>
      {rivals.map(record => <span className="fd-pass-line" key={record.other}>
        <span>vs {disp(state, record.other)}</span><strong>{recordText(record)}</strong>
      </span>)}
    </span>}
    {walkout && <span className="fd-pass-line fd-pass-walkout fd-pass-row" style={order()}>
      <span>Walkout song</span><strong>{walkout}</strong></span>}
  </span>;
}
