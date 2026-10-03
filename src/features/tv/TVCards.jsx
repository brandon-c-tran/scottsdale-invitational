import React from "react";
import { ROSTER, disp, stageEntrantView } from "../../../shared/core.js";
import { ChipFace } from "../identity/PlayerIdentity.jsx";
import { FDMark } from "../../ui/Brand.jsx";
import { OneSafe } from "../../ui/OneSafe.jsx";
import { RenameText } from "../teams/RenameText.jsx";
import { TrophyHero, TrophyPlates, trophyPlates } from "../weekend/Trophy.jsx";
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

/* the trophy filling up: a plate per event, stamped as each result posts */
export function TrophyCard({ state, events }) {
  const plates = trophyPlates(state, events);
  const done = plates.filter(plate => plate.posted).length;
  return (
    <div className="tv-pane tv-trophy-pane">
      <div className="tv-card-head tv-sign">
        <div className="fd-show tv-card-title">Trophy</div>
        <div className="tv-label"><OneSafe text={`${done} of ${plates.length} posted`} /></div>
      </div>
      <div className="tv-trophy-stage"><TrophyPlates state={state} events={events} variant="tv" cup={200} /></div>
    </div>
  );
}
