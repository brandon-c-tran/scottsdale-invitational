import React, { useEffect, useRef, useState } from "react";
import { MVP_PTS, disp } from "../../../shared/core.js";
import { ChipFace } from "../identity/PlayerIdentity.jsx";
import { dispatch } from "../../lib/client.js";
import { tapTick } from "../../lib/haptics.js";
import { serverNow } from "../../lib/serverClock.js";
import { mvpHomeModel } from "./mvpHome.js";
import "../awards/awards.css";

const sendVote = payload => dispatch("mvpVote", payload, { retry:true });
const MVP_MARK = { color:"var(--sun)", isLight:true, skin:"ticks" };

/* re-render each second while a vote runs, and when the result line expires */
function useTicker(active) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => setTick(value => value + 1), 1000);
    return () => clearInterval(timer);
  }, [active]);
}

/* The winning team's vote, open on Home as soon as it starts (it closes
   itself in a minute): every teammate a photo chip, tap to vote, tap
   another to change it. Then the MVP, for the team. */
export function MvpHome({ state, me, events, onPlayer, onVote = sendVote, now }) {
  const at = now ?? serverNow();
  const model = mvpHomeModel(state, me, events, at);
  useTicker(!!model && now === undefined);
  const [pending, setPending] = useState(null);
  const [error, setError] = useState("");
  const busy = useRef(false);
  if (!model) return null;

  if (model.kind === "result") {
    const name = model.you ? "You" : disp(state, model.winner);
    return <section className="fd-awards" aria-label="Team MVP">
      <div className="fd-awards-entry" role="heading" aria-level={2}>
        <span className="fd-awards-mark" aria-hidden="true"><ChipFace p={null} size={34} stamp="" {...MVP_MARK} /></span>
        <span><small>Team MVP · {model.name}</small><strong>{name}{model.you ? ` · +${MVP_PTS}` : ""}</strong></span>
        <button type="button" className="fd-awards-entry-go" onClick={() => onPlayer?.(model.winner)}
          aria-label={`View ${disp(state, model.winner)}'s player card`}><ChipFace p={model.winner} size={36} flat /></button>
      </div>
    </section>;
  }

  const vote = async player => {
    if (busy.current || !model.canVote || model.mine === player) return;
    tapTick();
    busy.current = true;
    setPending(player); setError("");
    try {
      const result = await onVote({ evId:model.evId, pick:player });
      if (result?.ok !== true) setError(result?.error || "Not saved. Try again.");
    } catch { setError("Not saved. Try again."); }
    finally { busy.current = false; setPending(null); }
  };
  const left = Math.max(0, Math.ceil((model.closesAt - at) / 1000));
  const status = model.mine ? `Your vote: ${disp(state, model.mine)}` : `${model.voted} of ${model.voters} voted`;
  return <section className="fd-awards" aria-label="Team MVP vote">
    <div className="fd-awards-entry" role="heading" aria-level={2}>
      <span className="fd-awards-mark" aria-hidden="true"><ChipFace p={null} size={34} stamp="" {...MVP_MARK} /></span>
      <span><small><i className="fd-beat-dot" aria-hidden="true" />Team MVP · {model.name}</small><strong>{status}</strong></span>
      <span className="fd-awards-entry-go">{left} s</span>
    </div>
    <div className="fd-awards-body">
      <div className="fd-awards-grid" aria-busy={!!pending}>
        {model.picks.map(player => {
          const picked = pending ? pending === player : model.mine === player;
          return <button type="button" key={player} disabled={!model.canVote}
            className={`fd-awards-nominee${picked ? " is-picked" : ""}${pending === player ? " is-fresh" : ""}`}
            aria-pressed={picked} aria-label={picked ? `Your vote: ${disp(state, player)}` : `Vote for ${disp(state, player)}`}
            onClick={() => vote(player)}>
            <span className="fd-awards-chip"><ChipFace p={player} size={44} flat /></span>
            <span>{disp(state, player)}</span>
          </button>;
        })}
      </div>
      {error ? <p className="fd-awards-error" role="alert">{error}</p>
        : <p className="fd-awards-note">The MVP gets {MVP_PTS} chips. Most votes wins; a tie is drawn.</p>}
    </div>
  </section>;
}
