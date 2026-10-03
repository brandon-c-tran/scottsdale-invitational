import React, { useEffect, useMemo, useState } from "react";
import { disp } from "../../../shared/core.js";
import { useFreshChange } from "../../lib/motion.js";
import { liveEventOf } from "../../ui/phase.js";
import { GameMark } from "../../ui/GameMark.jsx";
import { EventName } from "../../ui/OneSafe.jsx";
import { ChipFace } from "../identity/PlayerIdentity.jsx";
import { usePlayerIdentity } from "../identity/PlayerIdentityContext.js";
import { starPoints } from "../tv/desertModel.js";
import { postedWinner, teamColorPlayer } from "./walkoutTeam.js";
import "./sky.css";

/* A sky that keeps score (Backglass signature moment 6), the phone's half:
   a strip under the header with one star per event of the weekend, in
   slate order, evenly spaced: an event still to play is a faint outline,
   the one in play pulses on the room's heartbeat, a played one is lit in
   its winner's color (a team's: its first member's, as at the draw). A star
   lit on a fresh frame pops in. A tap reads the star nearest it in place:
   the event's mark and name, the winner's chips and name, inside the strip
   (it grows rather than covering what is under it). The whole strip is the
   one target, since twelve stars sit closer than a thumb. Once the board is
   crowned the champion's stars join into their constellation, arcs drawn
   over the row, as on the TV. The poker finale has no star: its winner is
   the champion. */
const SKY_LABEL_MS = 4000;

/* the strip as data: every slot, which is live, which are lit and by whom,
   and the champion's arcs once crowned (a single chip leader; a tie joins
   nobody's) */
export function skyModel(state, events = [], standings = null, liveId = undefined) {
  const slate = events.filter(ev => !ev.finale && !state?.shelved?.[ev.id]);
  const live = liveId === undefined ? liveEventOf(state || {}, events)?.id || null : liveId;
  const count = Math.max(1, slate.length);
  const slots = slate.map((ev, order) => {
    const won = postedWinner(state, ev);
    return { id:ev.id, eventId:ev.id, order, x:(order + 0.5) / count, live:!won && ev.id === live,
      winners:won?.players || null, team:won?.team?.name || null, colorOf:won ? teamColorPlayer(won) : null };
  });
  const stars = slots.filter(slot => slot.winners);
  const leaders = state?.frozen && standings?.length ? standings.filter(row => row.rank === 1) : [];
  const champion = leaders.length === 1 ? leaders[0].player : null;
  const won = champion ? stars.filter(slot => slot.winners.includes(champion)) : [];
  const lines = won.length > 1 ? [{ player:champion, points:won }] : [];
  return { slots, stars, champion, lines };
}

/* the stars' line in the art's 0 to 100 box (sky.css puts them there) */
const STAR_Y = 62;
/* the arc from one of the champion's stars to the next, over the row: a
   neighbour's arc peaks about a third of the way up, the longest near the
   top (a quadratic's peak is half its control point's lift) */
export function skyArc(a, b) {
  const x1 = a.x * 100, x2 = b.x * 100;
  const lift = Math.min(50, 22 + Math.abs(x2 - x1) * 0.9);
  return `M${x1.toFixed(2)} ${STAR_Y}Q${((x1 + x2) / 2).toFixed(2)} ${(STAR_Y - lift * 2).toFixed(2)} ${x2.toFixed(2)} ${STAR_Y}`;
}

export function SkyStrip({ state, events, standings = null }) {
  const model = useMemo(() => skyModel(state, events, standings),
    [state.results, state.frozen, state.shelved, state.onDeck, state.eventOps, events, standings]); // eslint-disable-line react-hooks/exhaustive-deps
  const { champion, lines, slots } = model;
  const change = useFreshChange(model.stars.length, "sky");
  const [label, setLabel] = useState(null);
  useEffect(() => {
    if (!label) return undefined;
    const timer = setTimeout(() => setLabel(null), SKY_LABEL_MS);
    return () => clearTimeout(timer);
  }, [label]);
  if (!slots.length) return null;
  const newest = change.animate && change.to > change.from ? new Set(model.stars.slice(change.from).map(slot => slot.id)) : null;
  const shown = label ? slots.find(slot => slot.id === label) : null;
  /* the star nearest the tap; a tap on the reading puts it away */
  const tap = event => {
    const box = event.currentTarget.getBoundingClientRect();
    const x = box.width > 0 && Number.isFinite(event.clientX) ? (event.clientX - box.left) / box.width : 0;
    const nearest = slots.reduce((best, slot) => Math.abs(slot.x - x) < Math.abs(best.x - x) ? slot : best, slots[0]);
    setLabel(nearest.id);
  };
  const nameOf = id => events.find(item => item.id === id)?.name || "";
  const summary = slots.map(slot => `${nameOf(slot.eventId)}: ${slot.winners
    ? slot.team || slot.winners.map(p => disp(state, p)).join(", ") : slot.live ? "playing now" : "to play"}`).join(". ");
  return (
    <div className={`fd-sky${shown ? " is-reading" : ""}`} style={{ "--sky-n":slots.length }}>
      {shown ? <SkyReading state={state} slot={shown} ev={events.find(item => item.id === shown.eventId)}
        onClose={() => setLabel(null)} />
        : <button type="button" className="fd-sky-hit" onClick={tap} aria-label={`The weekend. ${summary}`} />}
      {!shown && <div className="fd-sky-row" aria-hidden="true">
          <svg className="fd-sky-art" viewBox="0 0 100 100" preserveAspectRatio="none">
            <line className="fd-sky-thread" x1={slots[0].x * 100} y1={STAR_Y} x2={slots.at(-1).x * 100} y2={STAR_Y} />
            {lines.map(line => line.points.slice(1).map((point, i) =>
              <path key={`${line.player}:${i}`} className="fd-sky-line" d={skyArc(line.points[i], point)} pathLength={100}
                style={{ animationDelay:`${i * 260}ms` }} />))}
          </svg>
          {slots.map(slot => <SkyStar key={slot.id} slot={slot} fresh={!!newest?.has(slot.id)}
            champ={!!champion && !!slot.winners?.includes(champion)} />)}
        </div>}
    </div>
  );
}

function SkyStar({ slot, fresh, champ }) {
  const identity = usePlayerIdentity(slot.colorOf);
  const r = 10;
  const points = starPoints(r).map(([x, y]) => `${(x + r).toFixed(2)},${(y + r).toFixed(2)}`).join(" ");
  const state = slot.winners ? "is-lit" : slot.live ? "is-live" : "is-open";
  return (
    <span className={`fd-sky-star ${state}${fresh ? " is-fresh" : ""}${champ ? " is-champ" : ""}`}
      style={{ left:`${slot.x * 100}%`, ...(slot.winners ? { "--star":identity.color } : null) }}>
      <svg viewBox={`0 0 ${r * 2} ${r * 2}`} className={slot.live ? "fd-beat" : undefined}><polygon points={points} /></svg>
    </span>
  );
}

/* the star read in place: the event's mark and name, then who won it; the
   reading is its own target, and a tap puts it away */
function SkyReading({ state, slot, ev, onClose }) {
  const winners = slot.winners || [];
  return (
    <button type="button" className="fd-sky-reading" onClick={onClose} aria-live="polite">
      <GameMark id={ev?.game} variant={ev?.variant} size={30} />
      <span className="fd-sky-reading-text">
        <span className="fd-sky-reading-event fd-show"><EventName name={ev?.name || ""} /></span>
        {winners.length > 0 && <b>{slot.team || winners.map(p => disp(state, p)).join(" & ")}</b>}
      </span>
      {winners.length > 0 && <span className="fd-sky-reading-chips">
        {winners.slice(0, 3).map(p => <ChipFace key={p} p={p} size={30} flat />)}
        {winners.length > 3 && <i>+{winners.length - 3}</i>}
      </span>}
    </button>
  );
}
