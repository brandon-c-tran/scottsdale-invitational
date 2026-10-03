import React, { useLayoutEffect, useRef, useState } from "react";
import { disp } from "../../../shared/core.js";
import { BankChip } from "../identity/PlayerIdentity.jsx";
import { MOTION, EASE, flightKeyframes, useFreshChange, useReducedMotion } from "../../lib/motion.js";
import { useFlip, useFreshHold } from "../../lib/motionKit.js";
import { draftBoard, landedPick } from "../draft/draftModel.js";
import "./tv-draft.css";

/* The draft on the TV, filling the canvas: the captain on the clock, large,
   with the snake order after them; every team's seats, empty ones as
   open chip slots marked by pick; the players still available as a wall of identity
   chips. A fresh pick flies its chip from the wall into its seat, the name
   slams in, and the wall closes up (M9). Undo, reloads and a TV joining late
   show the state. */

const SLAM_MS = 900, WALL_CHIP = 72;
const relativeRect = (el, root) => {
  if (!el || !root) return null;
  const box = root.getBoundingClientRect(), r = el.getBoundingClientRect();
  const scale = root.offsetWidth ? box.width / root.offsetWidth || 1 : 1;
  return { left:(r.left - box.left) / scale, top:(r.top - box.top) / scale, width:r.width / scale, height:r.height / scale };
};

/* an open seat: the empty slot the picked chip drops into */
function OpenSlot({ next }) {
  return (
    <svg className={`tv-draft-slot${next ? " is-next" : ""}`} viewBox="0 0 56 56" width="52" height="52" aria-hidden="true">
      <circle cx="28" cy="28" r="25" />
    </svg>
  );
}

export function TVDraft({ state, ev, d }) {
  const board = draftBoard(d, { upcoming:5 });
  const reduced = useReducedMotion();
  const root = useRef(null), wall = useRef(null), order = useRef(null);
  const [flight, setFlight] = useState(null);
  const change = useFreshChange(d?.picks?.length ?? null, d?.id || null);
  const landing = change.animate ? landedPick(d, change) : null;
  const passing = useFreshHold(d?.picks?.length ?? null, d?.id || null, MOTION.story * 2);
  const [slam, setSlam] = useState(null);
  /* the turn passing to another captain, apart from a captain picking twice */
  const handing = useFreshHold(board?.turn.captain ?? null, d?.id || null, MOTION.story * 2);

  useFlip(order, { play:!!landing, delay:MOTION.story, duration:MOTION.base, stagger:20 });
  useFlip(wall, { play:!!landing, delay:320, duration:MOTION.rowSlide, stagger:25, enter:false, onPlay:(before, after, container) => {
    const from = before.get(landing.player), wallRect = relativeRect(container, root.current);
    const seat = root.current?.querySelector(`[data-seat="${landing.player}"] .tv-draft-seat-chip`);
    const to = relativeRect(seat, root.current);
    if (!from || !wallRect || !to) { setSlam({ player:landing.player, id:change.changeId }); return; }
    /* the chip itself flies, from where it stood in the wall */
    const size = WALL_CHIP;
    setFlight({ player:landing.player, id:change.changeId,
      from:{ left:wallRect.left + from.left + (from.width - size) / 2, top:wallRect.top + from.top, width:size, height:size }, to });
  } });

  const flyer = useRef(null);
  useLayoutEffect(() => {
    if (!flight) return undefined;
    const el = flyer.current;
    const land = () => { setFlight(null); setSlam({ player:flight.player, id:flight.id }); };
    if (!el || typeof el.animate !== "function") { land(); return undefined; }
    let animation;
    try {
      animation = el.animate(flightKeyframes(flight.from, flight.to, { arc:160, easing:EASE.out }),
        { duration:MOTION.cardFlight + 80, easing:"linear", fill:"forwards" });
    } catch { land(); return undefined; }
    let live = true;
    animation.finished.then(() => { if (live) land(); }, () => { if (live) land(); });
    return () => { live = false; animation.cancel?.(); };
  }, [flight?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (!slam) return undefined;
    const t = setTimeout(() => setSlam(current => current?.id === slam.id ? null : current), SLAM_MS);
    return () => clearTimeout(t);
  }, [slam?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!board) return null;
  const { turn, teams, upcoming, pool, last } = board;
  const T = teams.length;
  const rows = Math.max(1, ...teams.map(team => team.slots.length));
  const arriving = flight?.player || null;
  const current = upcoming[0] || null;
  const later = upcoming.slice(1);
  return (
    <div ref={root} className={`tv-pane tv-draft${passing && !reduced ? " is-fresh" : ""}${handing && !reduced ? " is-passing" : ""}${turn.complete ? " is-complete" : ""}`}
      style={{ "--draft-rows":rows }}>
      <header className="tv-draft-head">
        {turn.complete ? (
          <div className="tv-draft-clock">
            <div>
              <div className="tv-display tv-draft-who">Teams picked</div>
            </div>
          </div>
        ) : (
          <div className="tv-draft-clock">
            <span className="tv-draft-clock-chip" key={`${d.id}:${turn.captain}`}><BankChip p={turn.captain} size={132} /></span>
            <div className="tv-draft-clock-copy" key={`${d.id}:${turn.draftRevision}`}>
              <div className="tv-display tv-draft-who">{disp(state, turn.captain)}'s pick</div>
              <div className="tv-label tv-draft-line">Pick {turn.pickIndex + 1} of {turn.totalPicks}</div>
            </div>
          </div>
        )}
        {later.length > 0 && (
          <ol className="tv-draft-order" ref={order} aria-label="Snake order">
            {later.map(item => (
              <li key={item.pick} data-flip={item.pick} className={item.turnsBack ? "is-back" : ""}>
                <BankChip p={item.captain} size={48} />
                <span><small>Pick {item.pick}</small><b>{disp(state, item.captain)}</b></span>
              </li>
            ))}
          </ol>
        )}
      </header>

      <div className="tv-draft-teams" style={{ gridTemplateColumns:`repeat(${T}, minmax(0, 1fr))` }}>
        {teams.map(team => {
          const clock = !turn.complete && turn.teamIndex === team.index;
          const filled = team.slots.filter(slot => slot.player).length;
          return (
            <section key={team.captain} className={`tv-draft-col${clock ? " is-clock" : ""}`}>
              <header>
                <BankChip p={team.captain} size={56} />
                <span className="tv-display tv-draft-captain">{disp(state, team.captain)}</span>
                <span className="tv-display tv-draft-count">{filled + 1}/{team.slots.length + 1}</span>
              </header>
              <ol>
                {team.slots.map((slot, index) => {
                  const latest = slot.player && slot.player === last?.player;
                  const slamming = slot.player && slam?.player === slot.player;
                  const hidden = slot.player && slot.player === arriving;
                  return (
                    <li key={slot.player || `pick:${slot.pick ?? index}`} data-seat={slot.player || undefined}
                      className={`tv-draft-seat${slot.player ? " is-filled" : ""}${latest ? " is-latest" : ""}${slamming ? " is-slam" : ""}${hidden ? " is-arriving" : ""}`}>
                      {slot.player ? <>
                        <span className="tv-draft-seat-chip"><BankChip p={slot.player} size={52} /></span>
                        <span className="tv-draft-seat-name">{disp(state, slot.player)}</span>
                        {latest && <span className="tv-draft-seat-pick">Pick {slot.pick ?? last.pick}</span>}
                      </> : <>
                        <span className="tv-draft-seat-chip"><OpenSlot next={current && slot.pick === current.pick} /></span>
                        {slot.pick != null && <span className={`tv-draft-seat-open${current && slot.pick === current.pick ? " is-next" : ""}`}>
                          Pick {slot.pick}</span>}
                      </>}
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })}
      </div>

      {pool.length > 0 && (
        <div className="tv-draft-pool">
          <div className="tv-label">Available <b>{pool.length}</b></div>
          <div className="tv-draft-wall" ref={wall}>
            {pool.map(player => (
              <div key={player} data-flip={player} className="tv-draft-wall-item">
                <span className="tv-draft-wall-chip"><BankChip p={player} size={WALL_CHIP} /></span>
                <span className="tv-draft-wall-name">{disp(state, player)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {flight && (
        <div ref={flyer} className="tv-draft-flyer" aria-hidden="true"
          style={{ left:flight.from.left, top:flight.from.top, width:flight.from.width, height:flight.from.height }}>
          <BankChip p={flight.player} size={Math.round(flight.from.width)} />
        </div>
      )}
    </div>
  );
}
