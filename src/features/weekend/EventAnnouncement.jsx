import React, { useEffect, useRef, useState } from "react";
import { allEventsOf, disp, overflowRoleMeta, resolveCurrentContest } from "../../../shared/core.js";
import { contestName } from "../../../shared/show.js";
import { Sheet, ActionButton } from "../../ui/controls.jsx";
import { GameMark } from "../../ui/GameMark.jsx";
import { PayoutLadder } from "../../ui/PayoutLadder.jsx";
import { BankChip } from "../identity/PlayerIdentity.jsx";
import { usePlayerIdentity } from "../identity/PlayerIdentityContext.js";
import { serverNow } from "../../lib/serverClock.js";
import { DRAW_INTRO_MS, drawRevealGroups, drawStepAt, drawStepDelay, revealTimeline, startDrawPlayback } from "./drawReveal.js";
import { TeamSort, teamOf } from "../moments/TeamSort.jsx";
import { playSound } from "../../lib/sound.js";
import { drawPath } from "./drawPath.js";
import { DrawPathLine } from "./DrawPath.jsx";
import { currentFrame } from "../../lib/frameGate.js";
import { EventName } from "../../ui/OneSafe.jsx";
import { GameSteps, hasGameSteps } from "../rules/GameSteps.jsx";
import { GameIntro } from "../intro/GameIntro.jsx";
import "./announcement.css";

/* The announcement's hero, one composed block centred on the sheet: the
   game's moment (or its mark) and the event's name lettered large, its
   state a lamp beside a word (pending while betting is open, unlit on deck),
   never a subtitle under a second copy of the title. */
function AnnouncementHero({ ev, visual = null, lamp = null, size = "hero" }) {
  return <header className={`fd-announcement-hero is-${size}`}>
    {visual ? <div className="fd-announcement-game">{visual}</div>
      : <div className="fd-announcement-mark"><GameMark id={ev.game} variant={ev.variant} size={size === "hero" ? 64 : 44} /></div>}
    <h2 className={`fd-show${size === "hero" ? " is-hero" : ""} fd-announcement-name`}><EventName name={ev.name} /></h2>
    {lamp && <span className="fd-announcement-state"><i className={`fd-insert is-live${lamp.state === "pending" ? " is-pending" : lamp.state === "done" ? " is-done" : ""}`}
      aria-hidden="true" />{lamp.label}</span>}
  </header>;
}

/* `live`: the announcement as it happens, opened by the intro on every
   phone: the game intro (features/intro) heads the sheet on the room's
   clock from `anchor` (eventOps.announcedAt), the same frame as the TV. */
export function EventAnnouncement({ state, ev, handoff, onClose, onBets, holdMs = DRAW_INTRO_MS, visual, live = false, anchor = null,
  reduced = false, now:clockNow = serverNow }) {
  const contest = resolveCurrentContest(state,ev);
  /* the match by its name; what the event pays is the ladder, not a line */
  const named = !handoff && contest?.kind !== "ffa" ? contestName(state, ev, contest) : null;
  /* never the event's name a second time */
  const detail = named && named !== ev.name ? named : null;
  /* the handoff bar runs on the room's clock, so a phone that heard late
     starts it part-filled and every bar ends at the shared handoff */
  const [elapsed] = useState(() => {
    const introAt = handoff ? revealTimeline(state, ev.id)?.introAt : null;
    return introAt ? Math.min(holdMs, Math.max(0, clockNow() - introAt)) : 0;
  });
  return <Sheet title={ev.name} heading={false} onClose={onClose} layer={290} className="fd-announcement">
    {live ? <div className="fd-announcement-intro">
      <GameIntro ev={ev} surface="phone" anchor={anchor} reduced={reduced} handoff={handoff} now={clockNow} sound />
      <span className="fd-announcement-state"><i className={`fd-insert is-live${handoff ? " is-done" : " is-pending"}`} aria-hidden="true" />
        {handoff ? "On deck" : "Betting open"}</span>
    </div> : <AnnouncementHero ev={ev} visual={visual}
      lamp={handoff ? { label:"On deck", state:"done" } : { label:"Betting open", state:"pending" }} />}
    {detail && <p className="fd-announcement-detail">{detail}</p>}
    <div className={`fd-announcement-pays${handoff ? " is-handoff" : ""}`}><PayoutLadder ev={ev} size="phone" /></div>
    {!handoff && hasGameSteps(ev) && <GameSteps game={ev} size="card" notes={false} className="fd-announcement-steps" />}
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
  /* the room sorts itself: on a live draw your team's card floods this
     phone in your team's color to hold up (TeamSort); its sting replaces S4 */
  const [liveAtOpen] = useState(() => !!currentFrame().fresh);
  const team = synced && startAt !== null ? teamOf(reveal, groups, me) : null;
  const teamAt = team && liveAtOpen && !reducedMotion && team.index >= joined && run === 0
    ? startAt + drawStepDelay(team.index, total) : null;
  useEffect(() => {
    if (startAt === null || mineIndex < 0 || (!reducedMotion && mineIndex < joined)) return;
    /* only a phone following live: a draw this phone is catching up on (a
       first load, a reconnect, a rehearsal jump) shows its cards silently,
       as the TV's S3 is silent then */
    if (!currentFrame().fresh) return;
    playSound(team ? "teamUp" : "S4", { at:reducedMotion ? startAt : startAt + drawStepDelay(mineIndex, total), key:`card:${reveal.id}` });
  }, [reveal.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const you = usePlayerIdentity(me);
  const youStyle = { "--fd-you":you.color, "--fd-you-ink":you.isLight ? "var(--ink0)" : "var(--bone)" };
  const complete = shown >= total;
  /* D10: the live ceremony that turned your card ends on your path; a
     spectator's, and every replay from the event sheet, ends as before */
  const path = synced && mineIndex >= 0 ? drawPath(state, reveal, me) : null;
  /* the way to the board waits for the last card: chips go on the sides
     the room has seen, never on a draw still turning */
  const betsReady = !!onBets && complete;
  const actions = <div className="fd-announcement-actions">
    {betsReady && <ActionButton onClick={onBets}>Place chips</ActionButton>}
    <ActionButton variant={betsReady ? "secondary" : "primary"} onClick={onClose}>Done</ActionButton>
  </div>;
  const skip = () => playback.current?.skip();
  const replay = () => {
    playback.current?.stop();
    setShown(reducedMotion ? total : 0); setRun(value => value + 1);
  };
  /* a card turns over as one unit: its faces and names come round with it */
  const playerButton = (player, visible) => <button type="button" key={player}
    disabled={!visible || !onPlayer} tabIndex={visible ? undefined : -1}
    onClick={() => { if (visible) onPlayer?.(player); }}
    aria-label={`View ${disp(state,player)}'s player card`}>
    <BankChip p={player} size={32}/><span>{disp(state,player)}</span></button>;
  const revealEv = allEventsOf(state).find(item => item.id === reveal.evId) || null;
  /* one header grammar (ui/controls.jsx Sheet): the event's name at the
     left, Skip or Replay draw beside Close; the body is the draw */
  const playbackAction = <button type="button" className="fd-draw-playback-action" onClick={complete ? replay : skip}>
    {complete ? "Replay draw" : "Skip animation"}</button>;
  return <Sheet title={revealEv ? revealEv.name : reveal.subtitle || reveal.title} show={!!revealEv}
    subtitle={revealEv ? null : reveal.subtitle ? reveal.title : "The draw"} headerActions={playbackAction}
    onClose={onClose} onBack={onBack} layer={300} className="fd-announcement">
    <div className={`fd-draw-playback${complete ? " is-complete" : ""}`}>
      {/* the draw's progress, drawn while it turns: a small card per card.
          Face down it carries its back's number; turned, it carries what
          turned (the team's name, the heat, the match); the one turning is
          lit live. Once every card is up the cards say it all, so the row
          leaves (it is progress, never a set of tabs). */}
      {complete ? <span className="fd-draw-pips" aria-hidden="true" /> : <ol className="fd-draw-pips" aria-hidden="true">{groups.map((group, index) =>
        <li key={index} className={index < shown ? `is-named${index === shown - 1 && !complete ? " is-live" : " is-on"}` : undefined}>
          {index < shown && group.title ? <EventName name={group.title} /> : index + 1}</li>)}</ol>}
      <span className="fd-sr" role="status" aria-live="polite">{complete ? "Draw complete" : "Revealing the draw"}</span>
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
          {namedTeam && <strong className="fd-draw-team-name"><EventName name={line.text} /></strong>}
          <div className="fd-draw-people">{people.length ? people.map(player=>playerButton(player,visible)) : <span>{line.text}</span>}</div>
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
        <div className="fd-draw-card-back" aria-hidden="true"><span>{index + 1}</span></div>
        {ring && <i className="fd-draw-ring" aria-hidden="true"/>}
        <div className="fd-draw-card-front" aria-hidden={!visible}>
          <h3><EventName name={group.title} />{mine && visible && <span className="fd-draw-you">You</span>}</h3>
          {group.bye ? <div className="fd-draw-byes">{lines}</div> : lines}
        </div>
      </section>;
    })}</div>
    {!!reveal.crew?.length && <div className={`fd-draw-crew ${complete ? "is-revealed" : "is-covered"}`} aria-hidden={!complete}>
      {reveal.crew.map(role=><div key={role.player}>{playerButton(role.player,complete)}<span>{overflowRoleMeta(role.role).label}</span></div>)}
    </div>}
    {teamAt !== null && <TeamSort state={state} team={team} at={teamAt} />}
    {path && complete
      ? <div className={`fd-draw-footer${animate ? " is-drawing" : ""}`} style={youStyle} key={`path-${run}`}>
          <DrawPathLine state={state} path={path} me={me} animate={animate} />
          {actions}
        </div>
      : actions}
  </Sheet>;
}
