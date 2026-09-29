import React, { useEffect, useMemo, useRef, useState } from "react";
import { CHIP_MIN } from "../../../shared/core.js";
import { ChipFace } from "../identity/PlayerIdentity.jsx";
import { usePlayerIdentity } from "../identity/PlayerIdentityContext.js";
import { cardInk } from "../profile/PlayerPass.jsx";
import { useCountBetween, useReducedMotion } from "../../lib/motion.js";
import { serverNow } from "../../lib/serverClock.js";
import { chartModel, lastCardModel } from "./lastCard.js";
import { cardFileName, renderLastCardImage, shareCardImage } from "./cardImage.js";
import { PHONE_CROWN as P, crownAnchor, crownPhonePlan } from "./crownTiming.js";
import { SavePoster } from "./SavePoster.jsx";
import "./results.css";

const fmt = n => Math.round(Number(n) || 0).toLocaleString("en-US");

/* The card's chip: one ink, edge ticks, the jersey number. The saved image
   draws the same chip (cardImage.js drawCardChip). */
function CardChip({ num, size = 58 }) {
  const ticks = Array.from({ length:8 }, (_, i) => {
    const a = (i * 45 + 22.5) * Math.PI / 180;
    return <line key={i} x1={32 + Math.cos(a) * 21.6} y1={32 + Math.sin(a) * 21.6}
      x2={32 + Math.cos(a) * 29.1} y2={32 + Math.sin(a) * 29.1} strokeWidth="4.8" />;
  });
  return <svg className="fd-lastcard-chip" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
    <g fill="none" stroke="currentColor">
      <circle cx="32" cy="32" r="30" strokeWidth="2.25" />{ticks}
      <circle cx="32" cy="32" r="16.8" strokeWidth="1.5" />
    </g>
    {num != null && <text x="32" y="33" textAnchor="middle" dominantBaseline="central" fill="currentColor"
      fontFamily="var(--fd-display)" fontWeight="700" fontSize="21">{num}</text>}
  </svg>;
}

function CardChart({ history, label }) {
  const chart = useMemo(() => chartModel(history, { width:330, height:128 }), [history]);
  const dot = point => <g key={point.index}>
    <circle cx={point.x} cy={point.y} r="4.5" fill="currentColor" stroke="var(--card-color)" strokeWidth="2" />
    <text x={point.label.x} y={point.label.y} textAnchor={point.label.anchor} className="fd-lastcard-chart-num">{fmt(point.pts)}</text>
  </g>;
  return <svg className="fd-lastcard-chart" viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label={label}>
    <line x1="4" x2={chart.width - 10} y1={chart.baseY} y2={chart.baseY} stroke="currentColor" strokeOpacity=".4" strokeDasharray="2 3" />
    <path d={chart.d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" className="fd-lastcard-line" pathLength="1" />
    {chart.peak && dot(chart.peak)}
    {dot(chart.last)}
    {chart.ticks.map(tick => <g key={tick.label} opacity=".8">
      <line x1={tick.x} x2={tick.x} y1={chart.axisY + 2} y2={chart.axisY + 6} stroke="currentColor" />
      <text x={tick.x} y={chart.height - 4} textAnchor={tick.anchor} className="fd-lastcard-tick">{tick.label}</text>
    </g>)}
  </svg>;
}

/* X5: one player's weekend on one card, in their identity color with ink
   read from it. */
export function LastCardFace({ model, turn = false }) {
  const identity = usePlayerIdentity(model.player);
  const ink = cardInk(identity.color);
  const first = model.history[0]?.pts;
  const label = `${model.name}'s chips across the weekend: ${fmt(first)} to ${fmt(model.pts)}${
    model.high ? `, high ${fmt(model.high.pts)}` : ""}`;
  return <article className={`fd-lastcard${turn ? " is-turning" : ""}`}
    style={{ "--card-color":identity.color, "--card-ink":ink }} aria-label={`${model.name}, ${model.place}, ${fmt(model.pts)} chips`}>
    <div className="fd-lastcard-top"><span>{model.edition}</span>
      {model.num != null && <span>PLAYER {String(model.num).padStart(2, "0")}</span>}</div>
    <CardChip num={model.num} />
    <div className="fd-lastcard-place"><b>{model.place}</b>
      <span><strong>{fmt(model.pts)}</strong><small>FINAL STACK</small></span></div>
    <h2 className="fd-lastcard-name">{model.name}</h2>
    <CardChart history={model.history} label={label} />
    {model.facts.length > 0 && <dl className="fd-lastcard-facts">
      {model.facts.map(fact => <div key={fact.id}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}
    </dl>}
    <div className="fd-lastcard-foot"><span>{model.dates}</span><span>{model.footer}</span></div>
  </article>;
}

/* D1: the phone half of the crown, on the TV's own server instant. The
   champion's face appears where the TV's row rises to, their color floods
   the whole screen on the same beat as the TV, their chip drops and turns,
   and the stack counts in 25s. --tl is minus the ms already gone when this
   phone joined, so every delay reads "this long after the crown". A tie
   stays on night. */
function ChampionMoment({ leaders, elapsed, flood, floodColor, floodInk, onSkip }) {
  const pts = leaders[0]?.pts || 0;
  const count = useCountBetween(0, pts, { play:true, step:CHIP_MIN, delay:P.count - elapsed, duration:P.countMs });
  const name = leaders.map(leader => leader.name).join(" & ");
  return <div className={`fd-crown-moment${flood ? " is-flood" : ""}`}
    style={{ "--tl":`${-Math.round(elapsed)}ms`, ...(flood ? { "--crown-color":floodColor, "--crown-ink":floodInk } : null) }}
    onClick={onSkip} role="presentation">
    <p className="fd-crown-kicker">Final standings</p>
    {flood && <span className="fd-crown-origin" aria-hidden="true"><ChipFace p={leaders[0].player} size={72} flat /></span>}
    {flood && <div className="fd-crown-flood" aria-hidden="true" />}
    <div className="fd-crown-stage">
      <div className="fd-crown-coins">{leaders.map(leader => <span key={leader.player} className="fd-crown-coin">
        <ChipFace p={leader.player} size={leaders.length > 1 ? 118 : 164} flat /></span>)}</div>
      <p className="fd-crown-tag">{leaders.length > 1 ? "Tied for the championship" : "Champion"}</p>
      <h1 className="fd-crown-name" aria-label={name}>{[...name.toUpperCase()].map((letter, index) =>
        <span key={index} aria-hidden="true" style={{ "--fd-letter":index }}>{letter === " " ? " " : letter}</span>)}</h1>
      <p className="fd-crown-stack"><b>{fmt(count)}</b> chips</p>
    </div>
    <button type="button" className="fd-crown-skip" onClick={event => { event.stopPropagation(); onSkip(); }}>Skip</button>
  </div>;
}

/* The crown on a phone (X5, M18 phone, D1): every phone floods with the
   champion's color on the TV's beat, holds, then turns to its own last
   card. A tap anywhere skips the hold. Reduced motion, a crown this phone
   missed, or one that reached it after the flood opens straight to the
   card. The commissioner can also save the class photo poster (D3). */
export function LastCardLayer({ state, me, events, standings, mode = "card", gm = false, onClose, onStandings }) {
  const reduced = useReducedMotion();
  const leaders = useMemo(() => standings.filter(row => row.rank === 1)
    .map(row => ({ player:row.player, pts:row.pts, name:state.profiles?.[row.player]?.display || row.player })),
  [standings, state.profiles]);
  const subject = me && standings.some(row => row.player === me) ? me : leaders[0]?.player;
  const model = useMemo(() => subject ? lastCardModel(state, subject, { events, standings }) : null,
    [state, subject, events, standings]);
  const floodIdentity = usePlayerIdentity(leaders[0]?.player);
  const cardIdentity = usePlayerIdentity(subject);
  /* the plan is fixed from the frame that crowned, on the server clock */
  const plan = useRef(null);
  if (!plan.current) plan.current = crownPhonePlan({ anchor:crownAnchor(state), now:serverNow(),
    fresh:mode === "moment", reduced, tied:leaders.length > 1 });
  const [phase, setPhase] = useState(plan.current.mode);
  const turned = useRef(phase === "moment");
  useEffect(() => {
    if (phase !== "moment") return undefined;
    const timer = setTimeout(() => setPhase("card"), plan.current.turnIn);
    return () => clearTimeout(timer);
  }, [phase]);

  /* the image is drawn as soon as the card is up, so Save card can hand it
     to the share sheet inside the tap */
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const imageRef = useRef(null);
  useEffect(() => {
    if (phase !== "card" || !model) return undefined;
    let live = true;
    const colors = { color:cardIdentity.color, ink:cardInk(cardIdentity.color) };
    imageRef.current = renderLastCardImage(model, colors).then(blob => { if (live) setImage(blob); return blob; });
    return () => { live = false; };
  }, [phase, model, cardIdentity.color]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const save = async () => {
    if (saving || !model) return;
    setSaving(true);
    const blob = image || await imageRef.current;
    const outcome = await shareCardImage(blob, cardFileName(model));
    setSaving(false);
    if (outcome === "preview" && blob) setPreview(URL.createObjectURL(blob));
  };

  if (!model || !leaders.length) return null;
  const champion = leaders[0];
  return <div className="fd-crown fd-night" role="dialog" aria-modal="true" aria-label="Final standings">
    {phase === "moment" ? <ChampionMoment leaders={leaders} elapsed={plan.current.elapsed} flood={plan.current.flood}
      floodColor={floodIdentity.color} floodInk={cardInk(floodIdentity.color)} onSkip={() => setPhase("card")} />
      : <div className={`fd-crown-card${turned.current ? " is-arriving" : ""}`}>
        <div className="fd-crown-bar"><span className="fd-kicker">Final standings</span>
          <button type="button" className="fd-crown-close" aria-label="Close" onClick={onClose}>✕</button></div>
        <div className="fd-crown-champ">
          <ChipFace p={champion.player} size={36} />
          <span><small>{leaders.length > 1 ? "Tied for the championship" : "Champion"}</small>
            <b>{leaders.map(leader => leader.name).join(" & ")}</b></span>
          <strong>{fmt(champion.pts)}</strong>
        </div>
        <LastCardFace model={model} turn={turned.current && !reduced} />
        <div className="fd-crown-actions">
          <button type="button" className="fd-crown-save" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save card"}</button>
          <button type="button" className="fd-crown-board" onClick={onStandings}>Leaderboard <span aria-hidden="true">↗</span></button>
        </div>
        {gm && <SavePoster state={state} events={events} standings={standings} />}
      </div>}
    {preview && <div className="fd-crown-preview" role="dialog" aria-label="Saved card">
      <img src={preview} alt={`${model.name}'s last card`} />
      <p>Press and hold the image to save it.</p>
      <button type="button" onClick={() => setPreview(null)}>Done</button>
    </div>}
  </div>;
}
