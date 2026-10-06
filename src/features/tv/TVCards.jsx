import React, { useEffect, useMemo, useRef, useState } from "react";
import { rosterOf, disp, stageEntrantView, resolveCurrentContest } from "../../../shared/core.js";
import { ChipFace } from "../identity/PlayerIdentity.jsx";
import { DISC_OVERLAP } from "../identity/discLetters.js";
import { Icon } from "../../ui/Icon.jsx";
import { OneSafe } from "../../ui/OneSafe.jsx";
import { FDMark } from "../../ui/Brand.jsx";
import { RenameText } from "../teams/RenameText.jsx";
import { ENGRAVE, TrophyCup, TrophyHero, cupEngravings, engraveTotal, trophyCup } from "../weekend/Trophy.jsx";
import { useReducedMotion } from "../../lib/motion.js";
import { useEngraveSound } from "./roomSound.js";
import { editionLabel } from "./tvModel.js";
import { contestWinLines, winLineFor } from "../standings/winImpact.js";

export { TrophyHero };

/* X8 on the live scene: under each side, what its win does to the
   standings ("Win: Sahil to 1st"). The lines come from the same pure
   model the phones read; a side whose win changes nothing shows none. */
export function useContestWinLines(state, ev, contest, events) {
  return React.useMemo(() => contest && ev ? contestWinLines(state, ev, contest, { events }) : [],
    [state, ev?.id, contest?.id]); // eslint-disable-line react-hooks/exhaustive-deps
}
export function TVWinLine({ lines, sideKey }) {
  const line = winLineFor(lines, sideKey);
  if (!line) return null;
  return <div className={`tv-win-line${line.kind === "rank" ? " is-rank" : ""}`}>{line.text}</div>;
}

/* The money on the TV board in one grammar: the payout is a lamp label
   (an amber lens lit when it pays 2:1, unlit at 1:1, "Winner pays" in the
   label face beside it). The win line stays quieter in the body face. */
export function PayLamp({ text, lit = false, className = "" }) {
  if (!text) return null;
  return <span className={`tv-pay-lamp${lit ? " is-lit" : ""}${className ? ` ${className}` : ""}`}>
    <i className={`fd-insert${lit ? "" : " is-done"}`} aria-hidden="true" />{text}</span>;
}
/* `teach`: the first underdog this TV shows keeps its lamp breathing on
   the board for a few seconds after the face-off lifts (teach.js) */
export function TVSideTerms({ terms, className = "", teach = false }) {
  if (!terms) return null;
  return <span className={`tv-terms${className ? ` ${className}` : ""}`}>
    {terms.payLine && <PayLamp text={terms.payLine} lit={!!terms.underdog}
      className={teach && terms.underdog ? "is-teach" : ""} />}
  </span>;
}

/* The champion (M18) and the drawn bracket (M14) have their own modules. */
export { ChampionMoment } from "./TVChampion.jsx";
export { TVBracket } from "./TVBracket.jsx";

/* heats and pools with every entrant named; qualifiers stay bright */
/* Heats and pools, drawn: each group a plate of glass, its people as photo
   chips with their names as written, the group being played outlined in
   the live lamp (from resolveCurrentContest, never inferred here), who went
   through lit with a check and who did not dimmed. */
export function StageGroups({ state, ev }) {
  const st = state.stages?.[ev?.id];
  if (!st) return null;
  const contest = resolveCurrentContest(state, ev);
  const live = contest?.kind === "heat" ? contest.group : null;
  const entrant = (key, through, out) => {
    const view = stageEntrantView(state, st, key);
    return <span key={String(key)} className={`tv-stage-entrant${through ? " is-through" : ""}${out ? " is-out" : ""}`}>
      <span className={`tv-faces${view.players.length > 1 ? " is-overlap" : ""}`} aria-hidden="true"
        style={view.players.length > 1 ? { "--overlap":`${-Math.round(44 * DISC_OVERLAP)}px` } : undefined}>
        {view.players.slice(0, 3).map(p => <ChipFace key={p} p={p} size={44} />)}</span>
      <RenameText name={view.name} className="tv-stage-name" />
      {through && <i className="tv-stage-through" role="img" aria-label="Through"><Icon name="check" size={22} /></i>}
    </span>;
  };
  return (
    <div className="tv-stage-groups" aria-label={st.kind === "heats" ? "Heats" : "Pools"}>
      {st.groups.map((group, gi) => {
        const decided = (group.through || []).length > 0;
        return <section key={gi} className={`tv-stage-group${gi === live ? " is-live" : ""}${decided ? " is-decided" : ""}`}>
          <div className="tv-label tv-stage-head">{gi === live && <i className="fd-insert" aria-hidden="true" />}<OneSafe text={group.name} /></div>
          <div className="tv-stage-names">
            {group.entrants.map(key => {
              const through = (group.through || []).includes(key);
              return entrant(key, through, decided && !through);
            })}
          </div>
        </section>;
      })}
      {st.finalWinner !== null && st.finalWinner !== undefined && (
        <section className="tv-stage-group is-decided">
          <div className="tv-label tv-stage-head">Final</div>
          <div className="tv-stage-names">{entrant(st.finalWinner, true, false)}</div>
        </section>
      )}
    </div>
  );
}

/* the Opening scene's room step: all thirteen chips on the wall */
export function RosterWall({ state }) {
  return (
    <div className="tv-pane tv-center tv-roster-pane">
      <div className="tv-roster-head tv-sign">
        <FDMark size={72} variant="night" />
        <span className="fd-show tv-roster-title">Field Day</span>
        <span className="tv-mast-edition">{editionLabel()}</span>
      </div>
      <div className="tv-roster">
        {rosterOf(state).map(p => (
          <div key={p} className="tv-roster-chip">
            <ChipFace p={p} size={176} />
            <span className="tv-roster-name">{disp(state, p)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* The cup, engraved event by event (weekend/Trophy.jsx): the trophy's
   own turn, standing on the painting with nothing over it. turn: { turnAt,
   cycleMs, hold, crownEnd, crownHold } from TVMode (cupEngravings); the plates posted since
   the last time it held the room engrave on this turn's clock. */
function useEngraveTimeline(id, anchor, total, now) {
  const reduced = useReducedMotion();
  const ref = useRef({ id:undefined });
  const [, rerender] = useState(0);
  if (ref.current.id !== id) {
    const elapsed = id ? Math.max(0, Number(now) - anchor) : total;
    ref.current = { id, elapsed, done:!id || elapsed >= total };
  }
  const current = ref.current;
  useEffect(() => {
    if (current.done) return undefined;
    const timer = setTimeout(() => { current.done = true; rerender(n => n + 1); }, Math.max(0, total - current.elapsed));
    return () => clearTimeout(timer);
  }, [current, total]);
  return { playing:!current.done && !reduced, elapsed:current.elapsed };
}
export function TrophyCard({ state, events, turn = null, now = 0 }) {
  const cup = useMemo(() => trophyCup(state, events), [state, events]);
  const plan = turn ? cupEngravings(cup, turn) : [];
  const id = plan.map(item => item.key).join("|");
  const anchor = Number(turn?.turnAt) || 0;
  const line = useEngraveTimeline(id || null, anchor, ENGRAVE.lead + engraveTotal(plan), now);
  useEngraveSound(plan, ENGRAVE.cut);
  const engrave = line.playing ? Object.fromEntries(plan.map(item => [item.target, item.at - anchor - line.elapsed])) : null;
  return (
    <div className="tv-pane tv-trophy-pane">
      <TrophyCup state={state} events={events} variant="tv" cup={cup} engrave={engrave} />
    </div>
  );
}
