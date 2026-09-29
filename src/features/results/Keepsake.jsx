import React, { useEffect, useMemo, useRef, useState } from "react";
import { disp } from "../../../shared/core.js";
import { Sheet } from "../../ui/controls.jsx";
import { ChipFace } from "../identity/PlayerIdentity.jsx";
import { usePlayerIdentity } from "../identity/PlayerIdentityContext.js";
import { resolvePlayerIdentity } from "../identity/playerIdentity.js";
import { cardInk } from "../profile/PlayerPass.jsx";
import { BracketPeek } from "../weekend/CompetitionBracket.jsx";
import { TrophyHero } from "../weekend/Trophy.jsx";
import { LastCardFace } from "./LastCard.jsx";
import { chartModel } from "./lastCard.js";
import { cardFileName, renderLastCardImage, shareCardImage, shareCardImages } from "./cardImage.js";
import { keepsakeModel } from "./keepsake.js";
import "./keepsake.css";

/* D7 "The weekend, kept": Weekend's edition section once the board is
   frozen. The champion, every player's last card, who led the board and
   when, every event's plate with its final order and bracket, and the
   awards when they exist. Read-only and derived; `photos` is the slot for
   the shared photo grid when that feature supplies one. */

const fmt = n => Math.round(Number(n) || 0).toLocaleString("en-US");
const names = list => list.map(item => item.name).join(" & ");

function SectionHead({ id, title, detail, action }) {
  return <div className="fd-kept-head"><h3 id={id}>{title}</h3>
    {detail && <span>{detail}</span>}{action}</div>;
}

/* a player as a photo chip: the player-card target */
function PlayerChip({ state, p, size, onPlayer, named = false }) {
  const label = disp(state, p);
  return <button type="button" className={`fd-kept-player${named ? " is-named" : ""}`} onClick={() => onPlayer?.(p)}
    disabled={!onPlayer} aria-label={`${label}'s player card`}>
    <ChipFace p={p} size={size} flat />{named && <span aria-hidden="true">{label}</span>}
  </button>;
}

/* one card in the rack: the last card at a glance, in its owner's color */
function MiniCard({ model, onOpen }) {
  const identity = usePlayerIdentity(model.player);
  const chart = useMemo(() => chartModel(model.history, { width:140, height:40, top:6, bottom:4, left:2, right:4 }),
    [model.history]);
  return <button type="button" className="fd-kept-card" onClick={() => onOpen(model.player)}
    style={{ "--card-color":identity.color, "--card-ink":cardInk(identity.color) }}
    aria-label={`${model.name}, ${model.place}, ${fmt(model.pts)} chips. Last card`}>
    <span className="fd-kept-card-top" aria-hidden="true"><b>{model.place}</b>
      {model.num != null && <span>{String(model.num).padStart(2, "0")}</span>}</span>
    <strong aria-hidden="true">{model.name}</strong>
    <svg viewBox={`0 0 ${chart.width} ${chart.height}`} aria-hidden="true" preserveAspectRatio="none">
      <line x1="2" x2={chart.width - 4} y1={chart.baseY} y2={chart.baseY} stroke="currentColor" strokeOpacity=".35" strokeDasharray="2 3" />
      <path d={chart.d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
    <span className="fd-kept-card-pts" aria-hidden="true">{fmt(model.pts)}</span>
  </button>;
}

/* The board's top number after every write, drawn in the color of whoever
   held it, with their photo chip where the lead changed hands. */
const LEAD_W = 346, LEAD_H = 156, MARK_GAP = 26;
function LeadChart({ state, lead }) {
  const chart = useMemo(() => chartModel(lead.steps.map(step => ({ pts:step.pts, session:step.session })),
    { width:LEAD_W, height:LEAD_H, top:34, bottom:20, left:4, right:14, minTickGap:50 }), [lead]);
  const color = p => p ? resolvePlayerIdentity(state.profiles, p).color : "var(--muted)";
  const points = chart.points;
  const runs = [];
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1], to = points[i];
    const held = lead.steps[i - 1]?.leader || null, next = lead.steps[i]?.leader || held;
    runs.push(<path key={`h${i}`} d={`M${from.x} ${from.y} H${to.x}`} stroke={color(held)} />);
    if (from.y !== to.y) runs.push(<path key={`v${i}`} d={`M${to.x} ${from.y} V${to.y}`} stroke={color(next)} />);
  }
  /* markers from the last change back, dropping any that would crowd the
     one after it, so the final leader always shows */
  const marks = [];
  for (let k = lead.changes.length - 1; k >= 0; k--) {
    const change = lead.changes[k], point = points[change.index];
    if (!point) continue;
    if (marks.length && marks[marks.length - 1].x - point.x < MARK_GAP) continue;
    marks.push({ ...change, x:point.x, y:point.y });
  }
  const last = chart.last;
  return <div className="fd-kept-lead" style={{ aspectRatio:`${LEAD_W} / ${LEAD_H}` }}>
    <svg viewBox={`0 0 ${LEAD_W} ${LEAD_H}`} role="img"
      aria-label={`The top of the board across the weekend, ending at ${fmt(last.pts)}`}>
      <line x1="4" x2={LEAD_W - 14} y1={chart.baseY} y2={chart.baseY} className="fd-kept-lead-base" />
      <g fill="none" strokeWidth="3" strokeLinecap="square">{runs}</g>
      {/* left of the final leader's chip, which stands over the last point */}
      <text x={last.x - 18} y={last.y - 10} textAnchor="end" className="fd-kept-lead-num">{fmt(last.pts)}</text>
      {chart.ticks.map(tick => <g key={tick.label} className="fd-kept-lead-tick">
        <line x1={tick.x} x2={tick.x} y1={chart.axisY + 2} y2={chart.axisY + 6} />
        <text x={tick.x} y={LEAD_H - 4} textAnchor={tick.anchor}>{tick.label}</text>
      </g>)}
    </svg>
    {marks.map(mark => <span key={mark.index} className="fd-kept-lead-mark" aria-hidden="true"
      style={{ left:`${mark.x / LEAD_W * 100}%`, top:`${mark.y / LEAD_H * 100}%` }}>
      <ChipFace p={mark.player} size={24} flat /></span>)}
  </div>;
}

function Plate({ state, plate, ev, me, onPlayer, onBracket }) {
  return <li className={`fd-kept-plate${plate.posted ? "" : " is-blank"}`}>
    <div className="fd-kept-plate-head">
      <span className="fd-kept-plate-name">{plate.name}</span>
      <span className="fd-kept-plate-session">{plate.sessionName}</span>
    </div>
    {plate.posted ? <ol className="fd-kept-places">
      {plate.places.map(place => <li key={place.place} className={place.place === 0 ? "is-first" : undefined}>
        <span className="fd-kept-place">{place.label}</span>
        <span className="fd-kept-people">{place.players.map(p => <PlayerChip key={p} state={state} p={p}
          size={place.place === 0 ? 34 : 26} onPlayer={onPlayer} named={place.players.length === 1} />)}</span>
        {place.players.length > 1 && <span className="fd-kept-team">{place.team
          || place.players.map(p => disp(state, p)).join(" & ")}</span>}
      </li>)}
    </ol> : <p className="fd-kept-blank">Not played</p>}
    {plate.bracket && ev && onBracket && <BracketPeek state={state} ev={ev} me={me} onOpen={onBracket} />}
  </li>;
}

/* one player's last card, to read and save */
function KeptCardSheet({ state, model, onClose, onPlayer }) {
  const identity = usePlayerIdentity(model.player);
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const pending = useRef(null);
  useEffect(() => {
    let live = true;
    pending.current = renderLastCardImage(model, { color:identity.color, ink:cardInk(identity.color) })
      .then(blob => { if (live) setImage(blob); return blob; });
    return () => { live = false; };
  }, [model, identity.color]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const save = async () => {
    if (saving) return;
    setSaving(true);
    const blob = image || await pending.current;
    const outcome = await shareCardImage(blob, cardFileName(model));
    setSaving(false);
    if (outcome === "preview" && blob) setPreview(URL.createObjectURL(blob));
  };
  return <Sheet title="Last card" onClose={onClose} className="fd-kept-sheet">
    <LastCardFace model={model} />
    <div className="fd-crown-actions">
      <button type="button" className="fd-crown-save" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save card"}</button>
      {onPlayer && <button type="button" className="fd-crown-board" onClick={() => onPlayer(model.player)}>Player card</button>}
    </div>
    {preview && <div className="fd-crown-preview fd-kept-preview" role="dialog" aria-label="Saved card">
      <img src={preview} alt={`${model.name}'s last card`} />
      <p>Press and hold the image to save it.</p>
      <button type="button" onClick={() => setPreview(null)}>Done</button>
    </div>}
  </Sheet>;
}

/* The commissioner's "Save all cards": every last card drawn as soon as the
   button shows, then one share sheet with all of them. A browser that
   shares one file at a time steps through them, one tap each; one that
   shares none shows each image to press and hold. */
function SaveAllCards({ state, cards }) {
  const [blobs, setBlobs] = useState(null);
  const [step, setStep] = useState(null);
  const [saving, setSaving] = useState(false);
  const pending = useRef(null);
  const key = cards.map(card => `${card.player}:${card.pts}:${state.profiles?.[card.player]?.color || ""}`).join(",");
  useEffect(() => {
    let live = true;
    setBlobs(null);
    pending.current = Promise.all(cards.map(card => {
      const color = resolvePlayerIdentity(state.profiles, card.player).color;
      return renderLastCardImage(card, { color, ink:cardInk(color) });
    })).then(list => { if (live) setBlobs(list); return list; });
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const fileNames = cards.map(card => cardFileName(card));
  const url = useMemo(() => step && blobs?.[step.index] ? URL.createObjectURL(blobs[step.index]) : null, [step, blobs]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  const save = async () => {
    if (saving) return;
    setSaving(true);
    const list = blobs || await pending.current;
    const outcome = await shareCardImages(list, fileNames);
    setSaving(false);
    if (outcome === "each" || outcome === "preview") setStep({ index:0, mode:outcome });
  };
  const shareOne = async () => {
    if (!step || !blobs?.[step.index]) return;
    const outcome = await shareCardImage(blobs[step.index], fileNames[step.index]);
    if (outcome === "preview") setStep(current => ({ ...current, mode:"preview" }));
  };
  const card = step ? cards[step.index] : null;
  return <>
    <button type="button" className="fd-kept-save-all" onClick={save} disabled={saving}>
      {saving ? "Saving…" : blobs ? `Save all ${cards.length} cards` : "Drawing cards…"}</button>
    {step && card && <div className="fd-crown-preview fd-kept-preview" role="dialog" aria-label={`${card.name}'s last card`}>
      {url && <img src={url} alt={`${card.name}'s last card`} />}
      <p>{step.index + 1} of {cards.length} · {card.name}</p>
      {step.mode === "preview" && <p>Press and hold the image to save it.</p>}
      <div className="fd-kept-step">
        {step.mode === "each" && <button type="button" className="fd-kept-share" onClick={shareOne}>Share</button>}
        {step.index < cards.length - 1
          ? <button type="button" onClick={() => setStep(current => ({ ...current, index:current.index + 1 }))}>Next</button>
          : null}
        <button type="button" onClick={() => setStep(null)}>Done</button>
      </div>
    </div>}
  </>;
}

export function Keepsake({ state, events, standings, me, gm = false, onPlayer, onBracket, photos = null }) {
  const model = useMemo(() => keepsakeModel(state, { events, standings }), [state, events, standings]);
  const [open, setOpen] = useState(null);
  if (!model) return null;
  const eventOf = id => events.find(ev => ev.id === id);
  const champs = model.champions;
  const openCard = model.cards.find(card => card.player === open) || null;
  const lead = model.lead;
  return <div className="fd-kept">
    {champs.length > 0 && <header className="fd-kept-champ">
      <span className="fd-kept-champ-chips">{champs.map(champ => <PlayerChip key={champ.player} state={state} p={champ.player}
        size={champs.length > 1 ? 48 : 64} onPlayer={onPlayer} />)}</span>
      <span className="fd-kept-champ-name"><small>{champs.length > 1 ? "Tied for the championship" : "Champion"}</small>
        <b>{names(champs)}</b><strong>{fmt(champs[0].pts)}</strong></span>
      <TrophyHero size={84} plate="" />
    </header>}

    <section className="fd-kept-section" aria-labelledby="fd-kept-cards">
      <SectionHead id="fd-kept-cards" title="Last cards" detail={`${model.cards.length} players`} />
      <div className="fd-kept-cards">{model.cards.map(card => <MiniCard key={card.player} model={card} onOpen={setOpen} />)}</div>
      {gm && <SaveAllCards state={state} cards={model.cards} />}
    </section>

    {lead.steps.length > 1 && <section className="fd-kept-section" aria-labelledby="fd-kept-lead">
      <SectionHead id="fd-kept-lead" title="The lead"
        detail={lead.leadChanges === 1 ? "1 lead change" : `${lead.leadChanges} lead changes`} />
      <LeadChart state={state} lead={lead} />
      {lead.leaders.length > 0 && <div className="fd-kept-leaders" aria-label="Led the board">
        {lead.leaders.map(p => <PlayerChip key={p} state={state} p={p} size={26} onPlayer={onPlayer} named />)}
      </div>}
    </section>}

    <section className="fd-kept-section" aria-labelledby="fd-kept-events">
      <SectionHead id="fd-kept-events" title="Events" detail={`${model.posted} of ${model.plates.length}`} />
      <ol className="fd-kept-plates">{model.plates.map(plate => <Plate key={plate.eventId} state={state} plate={plate}
        ev={eventOf(plate.eventId)} me={me} onPlayer={onPlayer} onBracket={onBracket} />)}</ol>
    </section>

    {model.awards.length > 0 && <section className="fd-kept-section" aria-labelledby="fd-kept-awards">
      <SectionHead id="fd-kept-awards" title="Awards" />
      <ul className="fd-kept-awards">{model.awards.map(award => <li key={award.id}>
        <span className="fd-kept-award-title">{award.title}</span>
        <span className="fd-kept-people">{award.winners.map(p => <PlayerChip key={p} state={state} p={p} size={30}
          onPlayer={onPlayer} named />)}</span>
        {award.tie && <span className="fd-kept-team">Tie</span>}
      </li>)}</ul>
    </section>}

    {photos && <section className="fd-kept-section fd-kept-photos" aria-labelledby="fd-kept-photos">
      <SectionHead id="fd-kept-photos" title="Photos" />
      {photos}
    </section>}

    {openCard && <KeptCardSheet state={state} model={openCard} onClose={() => setOpen(null)} onPlayer={onPlayer} />}
  </div>;
}
