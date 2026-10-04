import React, { useRef } from "react";
import { disp } from "../../../shared/core.js";
import { ChipFace } from "../identity/PlayerIdentity.jsx";
import { usePlayerIdentity } from "../identity/PlayerIdentityContext.js";
import { ChipStack } from "../wagers/BetStacks.jsx";
import { useServerNow } from "../../lib/serverClock.js";
import { AWARD_TIMING as T, awardLayout, awardPhase } from "./awardsModel.js";
import "./awards.css";

/* the ballot chip belongs to nobody: the FD sun chip, blank on top */
const BALLOT_CHIP = Object.freeze({ color:"var(--sun)", isLight:true, skin:"ticks", stamp:"" });
const COLUMN_SPAN = 1800;

/* the whole name on one line (capitals run about .56em), down to 24px; a
   name longer still wraps at its space rather than be cut */
const nameSize = (name, max, width) =>
  Math.max(24, Math.min(max, Math.floor(width / (Math.max(4, String(name || "").length) * 0.56))));

function Nominee({ state, player, index, landed, total, layout, width, stamped, winner, tie, settled }) {
  const identity = usePlayerIdentity(player);
  const name = disp(state, player);
  const dim = stamped && !winner;
  return (
    <div className={`tv-award-nominee${winner && stamped ? " is-winner" : ""}${dim ? " is-dim" : ""}`}
      style={{ width, "--nominee-color":identity.color, "--nominee-in":`${T.nominees + index * T.nomineeStagger}ms` }}
      data-award-nominee={player} data-award-votes={landed}>
      <div className="tv-award-pile">
        {winner && stamped && <div className={`tv-display tv-award-stamp${settled ? " is-still" : ""}`}>{tie ? "Tie" : "Winner"}</div>}
        {landed > 0 && <span className="tv-award-stack">
          <ChipStack p={null} chip={BALLOT_CHIP} count={landed} size={layout.chip} cap={Math.max(13, total)} tag={false} />
        </span>}
      </div>
      <span className="tv-award-face"><ChipFace p={player} size={layout.face} flat /></span>
      <div className="tv-display tv-award-name" style={{ fontSize:nameSize(name, layout.name, width) }}>{name}</div>
      <div className="tv-award-votes">{landed > 0 ? `${landed} vote${landed === 1 ? "" : "s"}` : ""}</div>
    </div>
  );
}

/* D6: one award on the TV. Anonymous ballot chips land on the nominees,
   round by round, then the winner stamps; a tie stamps every winner. The
   whole sequence runs from reveal.at on the server clock, so every TV turns
   together and a late one joins where the room is. */
export function AwardsReveal({ state, view, now, reducedMotion = false }) {
  const settledAtProp = awardPhase(view, now, { reducedMotion }).settled;
  /* a fine clock only while chips are still landing */
  const tick = useServerNow(settledAtProp ? 0 : 80);
  const at = Math.max(Number(now) || 0, settledAtProp ? 0 : tick);
  const phase = awardPhase(view, at, { reducedMotion });
  /* entrances measured from the reveal, fixed at mount (as the face-off's) */
  const mount = useRef(null);
  if (!mount.current || mount.current.key !== `${view.ballotId}:${view.index}`)
    mount.current = { key:`${view.ballotId}:${view.index}`, elapsed:phase.settled ? 1e6 : phase.elapsed };
  const layout = awardLayout(view.nominees.length);
  const width = Math.min(360, Math.floor((COLUMN_SPAN - layout.gap * (view.nominees.length - 1)) / view.nominees.length));
  const winners = new Set(view.winners || []);
  const tie = winners.size > 1;
  const total = Math.max(0, ...Object.values(view.counts || {}).map(Number));
  return (
    <div className={`tv-pane tv-awards${phase.settled ? " is-settled" : ""}`} role="status"
      aria-label={`${view.question.title}: ${phase.stamped ? view.winners.length ? view.winners.map(p => disp(state, p)).join(" and ") : "no votes" : "votes coming in"}`}
      style={{ "--tl":`${-Math.round(mount.current.elapsed)}ms` }}>
      <div className="tv-awards-head">
        <div className="tv-display tv-awards-title">{view.question.title}</div>
        <div className="tv-label">Award {view.index + 1} of {view.count}</div>
      </div>
      <div className="tv-awards-field" style={{ gap:layout.gap }} data-crowded={view.nominees.length > 8 || undefined}>
        {view.nominees.map((player, index) => (
          <Nominee key={player} state={state} player={player} index={index} landed={phase.landed[player] || 0}
            total={total} layout={layout} width={width} stamped={phase.stamped} winner={winners.has(player)} tie={tie}
            settled={phase.settled} />
        ))}
      </div>
      <div className="tv-awards-foot">{phase.stamped && !view.winners.length ? "No votes" : ""}</div>
    </div>
  );
}
