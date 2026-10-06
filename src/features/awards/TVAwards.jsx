import React, { useRef } from "react";
import { disp } from "../../../shared/core.js";
import { ChipFace } from "../identity/PlayerIdentity.jsx";
import { usePlayerIdentity } from "../identity/PlayerIdentityContext.js";
import { floodColor } from "../identity/chipInk.js";
import { useServerNow } from "../../lib/serverClock.js";
import { AWARD_TIMING as T, awardLayout, awardPhase } from "./awardsModel.js";
import "./awards.css";

const COLUMN_SPAN = 1800;
/* the pile's room for its slips under the stamp */
const PILE = Object.freeze({ room:184, crowded:152, pitch:20, gap:5 });

/* the honoree's name across the foot: one line, as large as the room allows
   (Big Shoulders 900 runs about half an em a letter) */
export const awardHeroSize = text =>
  Math.max(56, Math.min(124, Math.floor(1700 / (Math.max(6, String(text || "").length) * 0.5))));

/* Votes are not chips: each is a ballot slip, bone, laid on the pile as it
   lands; the winner's slips light cyan once the stamp is down. One pitch
   for the whole field (the most votes anyone has fits the pile). */
function VoteSlips({ count, total, width, crowded, lit }) {
  const room = crowded ? PILE.crowded : PILE.room;
  const pitch = Math.max(8, Math.min(PILE.pitch, Math.floor(room / Math.max(1, total))));
  const h = Math.max(4, pitch - PILE.gap);
  return <span className={`tv-award-slips${lit ? " is-lit" : ""}`} aria-hidden="true" style={{ width, gap:pitch - h }}>
    {Array.from({ length:count }, (_, i) => <i key={i} style={{ height:h }} />)}
  </span>;
}

/* the whole name on one line (capitals run about .56em), down to 24px; a
   name longer still wraps at its space rather than be cut */
const nameSize = (name, max, width) =>
  Math.max(24, Math.min(max, Math.floor(width / (Math.max(4, String(name || "").length) * 0.56))));

function Nominee({ state, player, index, landed, total, layout, width, stamped, winner, tie, settled, crowded }) {
  const identity = usePlayerIdentity(player);
  const name = disp(state, player);
  const dim = stamped && !winner;
  return (
    <div className={`tv-award-nominee${winner && stamped ? " is-winner" : ""}${dim ? " is-dim" : ""}`}
      style={{ width, "--nominee-color":floodColor(identity.color), "--nominee-in":`${T.nominees + index * T.nomineeStagger}ms` }}
      data-award-nominee={player} data-award-votes={landed}>
      <div className="tv-award-pile">
        {winner && stamped && <div className={`tv-display tv-award-stamp${settled ? " is-still" : ""}`}>{tie ? "Tie" : "Winner"}</div>}
        {landed > 0 && <VoteSlips count={landed} total={total} width={Math.round(layout.chip * 0.8)} crowded={crowded}
          lit={winner && stamped} />}
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
  const heroName = (view.winners || []).map(p => disp(state, p)).join(" & ");
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
            settled={phase.settled} crowded={view.nominees.length > 8} />
        ))}
      </div>
      {/* the honoree is the hero: their name across the foot once the stamp lands */}
      <div className="tv-awards-foot">{phase.stamped && (view.winners.length
        ? <div className={`fd-show tv-awards-hero${phase.settled ? " is-still" : ""}`} style={{ fontSize:awardHeroSize(heroName) }}>{heroName}</div>
        : <span className="tv-awards-none">No votes</span>)}</div>
    </div>
  );
}
