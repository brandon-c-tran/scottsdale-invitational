import React, { useEffect, useRef, useState } from "react";
import { AWARDS, disp, overflowRoleMeta, resolveCurrentContest } from "../../../shared/core.js";
import { Sheet, ActionButton } from "../../ui/controls.jsx";
import { GameMark } from "../../ui/GameMark.jsx";
import { Avatar } from "../identity/PlayerIdentity.jsx";
import { drawRevealGroups, startDrawPlayback } from "./drawReveal.js";
import "./announcement.css";

export function EventAnnouncement({ state, ev, handoff, onClose, onBets, holdMs = 2800, visual }) {
  const contest = resolveCurrentContest(state,ev);
  const detail = [!handoff && (contest?.kind !== "ffa" ? contest?.label : "One winner"),
    AWARDS[ev.value]?.[0] ? `${AWARDS[ev.value][0].toLocaleString("en-US")} chips to win` : null].filter(Boolean).join(" · ");
  return <Sheet title={ev.name} subtitle={handoff ? "On deck" : "Betting open"} onClose={onClose} layer={290} className="fd-announcement">
    {visual && <div className="fd-announcement-game">{visual}</div>}
    <div className={`fd-announcement-summary${handoff ? " is-handoff" : ""}`}>
      {!visual && <div className="fd-announcement-mark"><GameMark id={ev.game} size={64}/></div>}
      <div>{ev.desc && <p>{ev.desc}</p>}
        <small>{detail}</small>
      </div>
    </div>
    {handoff && <div className="fd-announcement-handoff" aria-hidden="true" style={{ "--intro-hold":`${holdMs}ms` }}><span/></div>}
    <div className="fd-announcement-actions">
      {onBets && <ActionButton onClick={onBets}>Place chips</ActionButton>}
      <ActionButton variant={onBets ? "secondary" : "primary"} onClick={onClose}>{handoff ? "View draw" : "Done"}</ActionButton>
    </div>
  </Sheet>;
}

function useReducedMotion(override) {
  const [reduced, setReduced] = useState(() => typeof window === "undefined" || !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!media) return;
    const update = () => setReduced(media.matches);
    update(); media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);
  return override ?? reduced;
}

export function DrawAnnouncement({ state, reveal, onClose, onBets, onPlayer, onBack, initialComplete = false, reducedMotion:motionOverride }) {
  const groups = drawRevealGroups(state, reveal);
  const total = groups.length + (reveal.crew?.length ? 1 : 0);
  const reducedMotion = useReducedMotion(motionOverride);
  const [shown, setShown] = useState(() => reducedMotion || initialComplete ? total : 0);
  const [run, setRun] = useState(0);
  const animate = !reducedMotion && !(initialComplete && run === 0);
  const playback = useRef(null);
  useEffect(() => {
    const next = startDrawPlayback({ total, reducedMotion:!animate, onStep:setShown });
    playback.current = next;
    return () => next.stop();
  }, [reveal.id, total, animate, run]);
  const complete = shown >= total;
  const skip = () => playback.current?.skip();
  const replay = () => {
    playback.current?.stop();
    setShown(reducedMotion ? total : 0); setRun(value => value + 1);
  };
  const playerButton = (player, visible, index = 0) => <button type="button" key={player}
    disabled={!visible || !onPlayer} tabIndex={visible ? undefined : -1}
    onClick={() => { if (visible) onPlayer?.(player); }}
    style={{ "--deal-index":index }} aria-label={`View ${disp(state,player)}'s player card`}>
    <Avatar state={state} p={player} size={30}/><span>{disp(state,player)}</span></button>;
  return <Sheet title={reveal.subtitle || reveal.title} subtitle={reveal.subtitle ? reveal.title : "The draw"} onClose={onClose} onBack={onBack} layer={300} className="fd-announcement">
    <div className="fd-draw-playback">
      <div className={`fd-draw-deck${complete ? " is-complete" : ""}`} aria-hidden="true"><i/><i/><i>FD</i></div>
      <span role="status" aria-live="polite">{complete ? "Draw complete" : "Revealing the draw"}</span>
      <button type="button" className="fd-draw-playback-action" onClick={complete ? replay : skip}>{complete ? "Replay draw" : "Skip animation"}</button>
    </div>
    <div className={`fd-draw-announcement${!animate ? " is-reduced" : ""}`} key={run}>{groups.map((group,index)=>{
      const visible = index < shown;
      return <section key={index} className={`fd-draw-card ${visible ? "is-revealed" : "is-covered"}`}>
        <div className="fd-draw-card-back" aria-hidden="true"><span>{String(index + 1).padStart(2,"0")}</span></div>
        <div className="fd-draw-card-front" aria-hidden={!visible}>
          <h3>{group.title}</h3>
          {group.lines.map((line,j)=>{
            const people = line.avatars || [];
            const namedTeam = line.text && people.length > 1 && line.text !== people.map(player => disp(state,player)).join(" & ") && line.text !== group.title;
            return <React.Fragment key={j}>
              {group.vs && j > 0 && <small className="fd-draw-versus">vs</small>}
              {namedTeam && <strong className="fd-draw-team-name">{line.text}</strong>}
              <div className="fd-draw-people">{people.length ? people.map((player, playerIndex)=>playerButton(player,visible,playerIndex)) : <span>{line.text}</span>}</div>
            </React.Fragment>;
          })}
        </div>
      </section>;
    })}</div>
    {!!reveal.crew?.length && <div className={`fd-draw-crew ${complete ? "is-revealed" : "is-covered"}`} aria-hidden={!complete}>
      {reveal.crew.map(role=><div key={role.player}>{playerButton(role.player,complete)}<span>{overflowRoleMeta(role.role).label}</span></div>)}
    </div>}
    <div className="fd-announcement-actions">
      {onBets && <ActionButton onClick={onBets}>Place chips</ActionButton>}
      <ActionButton variant={onBets ? "secondary" : "primary"} onClick={onClose}>Done</ActionButton>
    </div>
  </Sheet>;
}
