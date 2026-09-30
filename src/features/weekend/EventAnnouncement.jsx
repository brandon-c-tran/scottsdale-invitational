import React, { useEffect, useRef, useState } from "react";
import { awardTable, disp, overflowRoleMeta, resolveCurrentContest } from "../../../shared/core.js";
import { Sheet, ActionButton } from "../../ui/controls.jsx";
import { GameMark } from "../../ui/GameMark.jsx";
import { Avatar } from "../identity/PlayerIdentity.jsx";
import { usePlayerIdentity } from "../identity/PlayerIdentityContext.js";
import { serverNow } from "../../lib/serverClock.js";
import { drawRevealGroups, drawStepAt, drawStepDelay, revealTimeline, startDrawPlayback } from "./drawReveal.js";
import { playSound } from "../../lib/sound.js";
import { drawPath } from "./drawPath.js";
import { DrawPathLine } from "./DrawPath.jsx";
import { currentFrame } from "../../lib/frameGate.js";
import "./announcement.css";

export function EventAnnouncement({ state, ev, handoff, onClose, onBets, holdMs = 3000, visual, now:clockNow = serverNow }) {
  const contest = resolveCurrentContest(state,ev);
  const detail = [!handoff && (contest?.kind !== "ffa" ? contest?.label : "One winner"),
    awardTable(ev)[0] ? `${awardTable(ev)[0].toLocaleString("en-US")} chips to win` : null].filter(Boolean).join(" · ");
  /* the handoff bar runs on the room's clock, so a phone that heard late
     starts it part-filled and every bar ends at the shared handoff */
  const [elapsed] = useState(() => {
    const introAt = handoff ? revealTimeline(state, ev.id)?.introAt : null;
    return introAt ? Math.min(holdMs, Math.max(0, clockNow() - introAt)) : 0;
  });
  return <Sheet title={ev.name} subtitle={handoff ? "On deck" : "Betting open"} onClose={onClose} layer={290} className="fd-announcement">
    {visual && <div className="fd-announcement-game">{visual}</div>}
    <div className={`fd-announcement-summary${handoff ? " is-handoff" : ""}`}>
      {!visual && <div className="fd-announcement-mark"><GameMark id={ev.game} size={64}/></div>}
      <div>{ev.desc && <p>{ev.desc}</p>}
        <small>{detail}</small>
      </div>
    </div>
    {handoff && <div className="fd-announcement-handoff" aria-hidden="true"
      style={{ "--intro-hold":`${holdMs}ms`, "--intro-elapsed":`${-Math.round(elapsed)}ms` }}><span/></div>}
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

/* `synced`: the live ceremony, timed from the server's stamps so every phone
   and the TV turn each card together; a sheet that opens late joins at the
   current step, and cards already turned show without turning again. Replay
   draw and the event sheet's replay run on this device's own clock. */
export function DrawAnnouncement({ state, reveal, me = null, synced = false, onClose, onBets, onPlayer, onBack,
  initialComplete = false, reducedMotion:motionOverride, now:clockNow = serverNow }) {
  const groups = drawRevealGroups(state, reveal);
  const total = groups.length + (reveal.crew?.length ? 1 : 0);
  const reducedMotion = useReducedMotion(motionOverride);
  const startAt = synced && !initialComplete
    ? revealTimeline(state, reveal.evId, { reveal, reducedMotion })?.revealAt ?? null : null;
  const [joined] = useState(() => reducedMotion || initialComplete ? total
    : startAt !== null ? drawStepAt(clockNow() - startAt, total) : 0);
  const [shown, setShown] = useState(joined);
  const [run, setRun] = useState(0);
  const animate = !reducedMotion && !(run === 0 && (initialComplete || joined >= total));
  const playback = useRef(null);
  useEffect(() => {
    const next = startDrawPlayback({ total, reducedMotion:!animate, onStep:setShown,
      ...(run === 0 && startAt !== null ? { startAt, now:clockNow } : {}) });
    playback.current = next;
    return () => next.stop();
  }, [reveal.id, total, animate, run, startAt]); // eslint-disable-line react-hooks/exhaustive-deps
  /* S4: your card rings on your phone the instant the room turns it (the
     TV's S3 lands on the same server time); reduced motion rings once as
     the whole draw shows */
  const mineIndex = me ? groups.findIndex(group => group.lines.some(line => (line.avatars || []).includes(me))) : -1;
  useEffect(() => {
    if (startAt === null || mineIndex < 0 || (!reducedMotion && mineIndex < joined)) return;
    /* only a phone following live: a draw this phone is catching up on (a
       first load, a reconnect, a rehearsal jump) shows its cards silently,
       as the TV's S3 is silent then */
    if (!currentFrame().fresh) return;
    playSound("S4", { at:reducedMotion ? startAt : startAt + drawStepDelay(mineIndex, total), key:`card:${reveal.id}` });
  }, [reveal.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const you = usePlayerIdentity(me);
  const youStyle = { "--fd-you":you.color, "--fd-you-ink":you.isLight ? "var(--ink0)" : "var(--bone)" };
  const complete = shown >= total;
  /* D10: the live ceremony that turned your card ends on your path; a
     spectator's, and every replay from the event sheet, ends as before */
  const path = synced && mineIndex >= 0 ? drawPath(state, reveal, me) : null;
  const actions = <div className="fd-announcement-actions">
    {onBets && <ActionButton onClick={onBets}>Place chips</ActionButton>}
    <ActionButton variant={onBets ? "secondary" : "primary"} onClick={onClose}>Done</ActionButton>
  </div>;
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
      /* turned before this sheet opened: shown as it lies, no second turn */
      const settled = run === 0 && index < joined;
      /* your own team, heat or matchup rings in your color as it turns */
      const mine = !!me && group.lines.some(line => (line.avatars || []).includes(me));
      const ring = mine && visible && animate && !settled;
      const lines = group.lines.map((line,j)=>{
        const people = line.avatars || [];
        const namedTeam = line.text && people.length > 1 && line.text !== people.map(player => disp(state,player)).join(" & ") && line.text !== group.title;
        const body = <>
          {namedTeam && <strong className="fd-draw-team-name">{line.text}</strong>}
          <div className="fd-draw-people">{people.length ? people.map((player, playerIndex)=>playerButton(player,visible,playerIndex)) : <span>{line.text}</span>}</div>
        </>;
        if (group.bye) return <div key={j} style={{ "--deal-index":j }}
          className={`fd-draw-bye${me && people.includes(me) ? " is-mine" : ""}`}>{body}</div>;
        return <React.Fragment key={j}>
          {group.vs && j > 0 && <small className="fd-draw-versus">vs</small>}
          {body}
        </React.Fragment>;
      });
      return <section key={index} style={mine ? youStyle : undefined}
        className={`fd-draw-card ${visible ? "is-revealed" : "is-covered"}${group.bye ? " is-byes" : ""}${settled ? " is-settled" : ""}${mine && visible ? " is-mine" : ""}${ring ? " is-ringing" : ""}`}>
        <div className="fd-draw-card-back" aria-hidden="true"><span>{String(index + 1).padStart(2,"0")}</span></div>
        {ring && <i className="fd-draw-ring" aria-hidden="true"/>}
        <div className="fd-draw-card-front" aria-hidden={!visible}>
          <h3>{group.title}{mine && visible && <span className="fd-draw-you">You</span>}</h3>
          {group.bye ? <div className="fd-draw-byes">{lines}</div> : lines}
        </div>
      </section>;
    })}</div>
    {!!reveal.crew?.length && <div className={`fd-draw-crew ${complete ? "is-revealed" : "is-covered"}`} aria-hidden={!complete}>
      {reveal.crew.map(role=><div key={role.player}>{playerButton(role.player,complete)}<span>{overflowRoleMeta(role.role).label}</span></div>)}
    </div>}
    {path && complete
      ? <div className={`fd-draw-footer${animate ? " is-drawing" : ""}`} style={youStyle} key={`path-${run}`}>
          <DrawPathLine state={state} path={path} me={me} animate={animate} />
          {actions}
        </div>
      : actions}
  </Sheet>;
}
