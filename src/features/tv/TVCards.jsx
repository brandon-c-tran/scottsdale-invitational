import React, { useEffect, useMemo, useRef, useState } from "react";
import { ROSTER, disp, stageEntrantView } from "../../../shared/core.js";
import { ChipFace } from "../identity/PlayerIdentity.jsx";
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

/* The champion (M18) and the drawn bracket (M14) have their own modules. */
export { ChampionMoment } from "./TVChampion.jsx";
export { TVBracket } from "./TVBracket.jsx";

/* heats and pools with every entrant named; qualifiers stay bright */
export function StageGroups({ state, ev }) {
  const st = state.stages?.[ev?.id];
  if (!st) return null;
  return (
    <div className="tv-stage-groups" aria-label={st.kind === "heats" ? "Heats" : "Pools"}>
      {st.groups.map((group, gi) => (
        <div key={gi} className="tv-stage-group">
          <div className="tv-label">{group.name}</div>
          <div className="tv-stage-names">
            {group.entrants.map(key => {
              const view = stageEntrantView(state, st, key);
              const through = (group.through || []).includes(key);
              return <RenameText key={String(key)} name={view.name}
                className={group.through?.length ? (through ? "is-through" : "is-out") : ""} />;
            })}
          </div>
        </div>
      ))}
      {st.finalWinner !== null && st.finalWinner !== undefined && (
        <div className="tv-stage-group">
          <div className="tv-label">Final</div>
          <div className="tv-stage-names"><span className="is-through">{stageEntrantView(state, st, st.finalWinner).name}</span></div>
        </div>
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
        {ROSTER.map(p => (
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
