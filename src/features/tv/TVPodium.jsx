import React, { useState } from "react";
import { ChipFace } from "../identity/PlayerIdentity.jsx";
import { resolvePlayerIdentity } from "../identity/playerIdentity.js";
import { GameMark } from "../../ui/GameMark.jsx";
import { EventName } from "../../ui/OneSafe.jsx";
import { ScoreReel } from "../../ui/ScoreReel.jsx";
import { disp } from "../../../shared/core.js";
import { stackName } from "../wagers/betStacks.js";
import {
  fmt, podiumStage, podiumTitleFit, podiumBeatAt, backersRail, podiumBackersAt, PODIUM_STAGE, BACKERS_RAIL,
} from "./tvModel.js";
import "./tv-podium.css";

/* A result on the TV is a real podium: three stepped plinths of lit glass
   standing on the session's desert floor (2nd, 1st, 3rd, joined), the
   event's name lettered over them on the sky, each place's people standing
   on its step and its award lettered on the step's face. The empty podium
   stands first; each place turns on its beat (podiumBeatAt: 3rd, 2nd, then
   a held beat and 1st), its glass lighting and its people dropping onto the
   lid, the award stamping after. 1st is lit through in its winner's own
   color with a shaft of that light from above and one sweep of light across
   the glass. Every beat runs from the result's server instant (--tl), so a
   late TV joins mid-sequence and every TV turns together with the room's
   stamps (roomSound podiumCues). Reduced motion, or no anchor (the ambient
   turn), shows the finished podium. Transforms and opacity only. */

/* the age of the moment when this podium mounted: read once, so the
   second's re-render never moves the beats */
function useMountAge(anchor, now) {
  const [age] = useState(() => (anchor ? Math.max(0, Number(now) - Number(anchor)) : null));
  return age;
}
/* a finished sequence: every beat long past */
const AT_REST = -600000;

function StepPeople({ block, first }) {
  return (
    <div className="tv-step-block">
      <div className="tv-step-faces" style={{ gridTemplateColumns:`repeat(${block.cols}, ${block.face}px)` }}>
        {block.players.map(p => <span key={p} className="tv-step-face-chip"><ChipFace p={p} size={block.face} /></span>)}
      </div>
      <div className={`fd-show tv-step-name${first ? " is-marquee" : ""}`} style={{ fontSize:block.nameSize }}>
        {block.nameLines.length > 1 ? <>{block.nameLines[0]}<br />{block.nameLines[1]}</> : block.name}
      </div>
    </div>
  );
}

function Step({ state, step, beat, lid, index }) {
  const { place, entry } = step;
  const first = place === 1;
  /* a win lights the glass for its winner: one winning side's own color */
  const lit = first && entry && entry.groups.length === 1 ? resolvePlayerIdentity(state.profiles, entry.players[0]).color : null;
  const style = { left:step.left, top:step.top - lid, width:step.width, height:step.height + lid, "--lid":`${lid}px`,
    "--beat":`${beat}ms`, "--rise":`${index * 90}ms`, ...(lit ? { "--win":lit } : null) };
  return (
    <div className={`tv-step is-p${place}${entry ? " is-filled" : " is-empty"}${lit ? " is-lit" : ""}`} style={style}
      aria-label={entry ? `${place === 1 ? "1st" : place === 2 ? "2nd" : "3rd"}: ${entry.names.join(", ")}` : undefined}>
      {first && entry && <i className="tv-step-shaft" aria-hidden="true" />}
      <i className="tv-step-pool" aria-hidden="true" />
      {entry && <div className="tv-step-who" style={{ bottom:step.height + Math.round(lid * 0.5), height:step.room }}>
        {step.blocks.map(block => <StepPeople key={block.name} block={block} first={first && step.blocks.length === 1} />)}
      </div>}
      <i className="tv-step-lid" aria-hidden="true" />
      <div className="tv-step-face">
        <i className="tv-step-glow" aria-hidden="true" />
        <span className="fd-show is-marquee tv-step-num" aria-hidden="true">{place}</span>
        {/* the award rolls in on the step's own reel as it stamps, on the
            room's clock (a late TV joins mid-roll, the ambient turn rests) */}
        {step.amount && <span className="tv-step-amount" aria-label={step.amount.text}>
          {entry.unit !== "stack" && <span className="tv-step-sign" aria-hidden="true">+</span>}
          <ScoreReel value={entry.amount} from={0} motion="always" tone="chip" label=""
            at="calc(var(--tl) + var(--beat) + 240ms)" />
          {step.amount.each && <small>each</small>}</span>}
        <i className="tv-step-sweep" aria-hidden="true" />
      </div>
    </div>
  );
}

export function TVPodium({ state, model, anchor = null, now = 0 }) {
  const age = useMountAge(anchor, now);
  const stage = podiumStage(model.podium);
  const title = podiumTitleFit(model.eventName);
  const order = model.revealOrder.map(item => item.place);
  const beatOf = place => (order.includes(place) ? podiumBeatAt(order.indexOf(place)) : 0);
  /* the light sweeps the whole podium once 1st has landed */
  const sweep = podiumBeatAt(Math.max(0, order.length - 1)) + 240;
  const style = { "--tl":`${age === null ? AT_REST : -Math.round(age)}ms`, "--sweep":`${sweep}ms` };
  return (
    <div className="tv-podium-stage" style={style} role="status"
      aria-label={`${model.eventName}: ${model.podium.map(item => `${item.place}. ${item.names.join(", ")}`).join("; ")}`}>
      <div className="tv-podium-title">
        <GameMark id={model.game} variant={model.variant} size={PODIUM_STAGE.title.mark} />
        <div className="fd-show tv-podium-event" style={{ fontSize:title.size }}>
          {title.lines.length > 1 ? <><EventName name={title.lines[0]} /><br /><EventName name={title.lines[1]} /></>
            : <EventName name={model.eventName} />}
        </div>
      </div>
      <i className="tv-podium-floor" aria-hidden="true" style={{ top:stage.floor }} />
      {stage.steps.map((step, index) => <Step key={step.place} state={state} step={step} beat={beatOf(step.place)}
        lid={stage.lid} index={index} />)}
    </div>
  );
}

/* the rail under the podium, where the ticker runs: who backed the winner
   and what it paid them, landing once 1st has turned */
export function BackersRail({ state, model, anchor = null, now = 0 }) {
  const age = useMountAge(anchor, now);
  const rail = backersRail(model?.winnerStacks);
  if (!rail) return null;
  const at = podiumBackersAt(model.revealOrder.length);
  return (
    <div className="tv-ticker tv-rail-slot">
      <div className={`tv-rail${rail.named ? " is-named" : " is-bare"}`} role="status"
        aria-label={`Bets paid ${fmt(rail.paid)}: ${rail.cells.map(cell => `${disp(state, cell.player)} ${fmt(cell.paid)}`).join(", ")}`}
        style={{ "--tl":`${age === null ? AT_REST : -Math.round(age)}ms`, "--rail-at":`${at}ms`,
          "--rail-pad":`${BACKERS_RAIL.pad}px`, "--rail-gap":`${BACKERS_RAIL.gap}px` }}>
        <span className="tv-ticker-tag tv-rail-tag" style={{ width:BACKERS_RAIL.tag }}>Bets paid</span>
        <b className="tv-rail-total" style={{ width:BACKERS_RAIL.total }} aria-hidden="true">+<ScoreReel value={rail.paid}
          from={0} motion="always" tone="won" slim label="" at="calc(var(--tl) + var(--rail-at) + 160ms)" /></b>
        <ol className="tv-rail-cells">
          {rail.cells.map((cell, i) => (
            <li key={cell.player} className="tv-rail-cell" style={{ "--i":i, width:rail.named ? BACKERS_RAIL.named : BACKERS_RAIL.bare }}>
              <ChipFace p={cell.player} size={rail.named ? 56 : 40} />
              <span className="tv-rail-text">
                {rail.named && <span className="tv-rail-name">{stackName(state, cell.player)}</span>}
                <b className="tv-rail-paid">+{fmt(cell.paid)}</b>
              </span>
            </li>
          ))}
          {rail.more > 0 && <li className="tv-rail-cell tv-rail-more" style={{ "--i":rail.cells.length, width:BACKERS_RAIL.more }}>
            +{rail.more}</li>}
        </ol>
      </div>
    </div>
  );
}
