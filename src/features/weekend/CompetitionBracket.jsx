import React from "react";
import { disp, resolveSlot, resolveCurrentContest, ROUND_NAMES, teamLabel } from "../../../shared/core.js";
import { Avatar } from "../identity/PlayerIdentity.jsx";
import "./competition-bracket.css";

/* Team targets and player-card targets are siblings: viewing a player can
   never record a winner. The caller acknowledges the winner before advancing. */
export function CompetitionBracket({ state, ev, me, gm=false, onPick, onPlayer, size="md", hot, pending=false }) {
  const bracket = state.brackets?.[ev.id], draw = state.draws?.[ev.id];
  if (!bracket || !draw) return null;
  const contest = resolveCurrentContest(state, ev);
  const active = contest?.kind === "match" ? contest.match : null;
  const canRecord = gm && !!onPick && contest?.phase === "in-progress"
    && !state.frozen && !state.results?.[ev.id] && !state.poker && !state.shelved?.[ev.id];
  return <section className={`fd-competition-bracket ${size === "lg" ? "is-large" : ""}`} style={{"--fd-round-count":bracket.rounds.length}} aria-label={`${ev.name} bracket`} aria-busy={pending}>
    <div className="fd-bracket-rounds">{bracket.rounds.map((round, r) => <section className="fd-bracket-round" key={r}
      aria-label={ROUND_NAMES[bracket.size]?.[r] || `Round ${r + 1}`}>
      <h4>{ROUND_NAMES[bracket.size]?.[r] || `Round ${r + 1}`}</h4>
      <div className="fd-bracket-matches">{round.map((match, m) => {
        const sides = [resolveSlot(bracket, match.a), resolveSlot(bracket, match.b)];
        const isCurrent = active?.[0] === r && active?.[1] === m;
        const highlighted = isCurrent || hot?.[0] === r && hot?.[1] === m;
        const decided = match.winner !== null && match.winner !== undefined;
        return <div key={m} className={`fd-bracket-match ${highlighted ? "is-current" : ""}`} aria-label={`Match ${m + 1}${isCurrent ? ", current matchup" : ""}`}>
          <div className="fd-bracket-match-label"><span>Match {m + 1}</span>
            {isCurrent && <strong>{contest.phase === "in-progress" ? "Playing" : contest.phase === "betting-open" ? "Betting open" : "Up next"}</strong>}
            {decided && <span>Final</span>}</div>
          {sides.map((key, index) => {
            const team = key === null || key === undefined ? null : draw.teams[key];
            const won = decided && match.winner === key, lost = decided && team && !won;
            const name = team ? teamLabel(state, team) : "TBD";
            const fullName = team?.players.map(player => disp(state, player)).join(" & ");
            const selectable = canRecord && isCurrent && !decided && sides.every(side => side !== null && side !== undefined);
            return <div key={index} className={`fd-bracket-team ${won ? "is-winner" : ""} ${lost ? "is-loser" : ""} ${team?.players.includes(me) ? "is-you" : ""}`}>
              <button type="button" className="fd-bracket-pick" disabled={!selectable || pending}
                aria-label={selectable ? `Winner: ${fullName}` : `${fullName || "To be determined"}${won ? ", winner" : ""}`}
                onClick={() => selectable && onPick(r, m, key)}>
                <span>{name}</span>{won && <span className="fd-bracket-outcome" aria-hidden="true">✓</span>}
                {selectable && <span className="fd-bracket-pick-hint">{pending ? "Saving…" : "Win"}</span>}
              </button>
              {team && <div className="fd-bracket-players">{team.players.map(player => <button key={player} type="button"
                aria-label={`View ${disp(state, player)}'s player card`} disabled={pending || !onPlayer}
                onClick={() => onPlayer?.(player)}><Avatar state={state} p={player} size={25} /></button>)}</div>}
            </div>;
          })}
        </div>;
      })}</div>
    </section>)}</div>
  </section>;
}
