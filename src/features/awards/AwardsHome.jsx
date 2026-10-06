import React, { useEffect, useRef, useState } from "react";
import { disp } from "../../../shared/core.js";
import { ChipFace } from "../identity/PlayerIdentity.jsx";
import { dispatch } from "../../lib/client.js";
import { tapTick } from "../../lib/haptics.js";
import { serverNow } from "../../lib/serverClock.js";
import { awardResults } from "../../../shared/prompts.js";
import { ballotModel, homeResults, nextStampAt, nextUnanswered, stampTime } from "./awardsModel.js";
import "./awards.css";
import { Icon } from "../../ui/Icon.jsx";
import { writeError } from "../../lib/writeErrors.js";

const BALLOT_MARK = { color:"var(--sun)", isLight:true, skin:"ticks" };
const sendVote = payload => dispatch("promptRespond", payload, { retry:true });
/* long enough to see the pick land before the next award */
const ADVANCE_MS = 650;

/* D6: the open ballot on Home. One line until you open it; then one award
   at a time, every nominee a photo chip. Tap to vote, tap your pick again
   to take it back, change it until voting closes. Nothing here opens on its
   own, so it never interrupts a bet, a draw or a sheet. */
export function AwardsBallot({ state, me, onVote = sendVote, initiallyOpen = false }) {
  const model = ballotModel(state, me);
  const [open, setOpen] = useState(initiallyOpen);
  const [index, setIndex] = useState(() => Math.max(0, model ? model.questions.findIndex(question => !question.choice) : 0));
  const [pending, setPending] = useState(null);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const advance = useRef(null);
  if (!model || !model.canVote) return null;
  const at = Math.min(index, model.questions.length - 1);
  const question = model.questions[at];
  const done = model.picked === model.count;

  const vote = async player => {
    if (busy.current) return;
    tapTick();
    const choice = question.choice === player ? null : player;
    busy.current = true;
    setPending({ player, question:question.id, choice }); setError("");
    clearTimeout(advance.current);
    try {
      const result = await onVote({ id:model.id, questionId:question.id, choice });
      if (result?.ok !== true) { setError(writeError(result)); return; }
      if (choice) {
        const after = model.questions.map((item, i) => i === at ? { ...item, choice } : item);
        const next = nextUnanswered(after, at);
        if (next >= 0) advance.current = setTimeout(() => setIndex(next), ADVANCE_MS);
      }
    } catch (failure) { setError(writeError(failure)); }
    finally { busy.current = false; setPending(null); }
  };

  /* the entry leads with the award you owe a vote on, by its name; how far
     through the ballot you are is drawn by the steps inside */
  const owed = model.questions[Math.max(0, nextUnanswered(model.questions, -1))];
  const status = done ? "Voted" : owed?.title || "Vote";
  return (
    <section className={`fd-awards fd-lamp${done ? " is-done" : " is-live"}`} aria-label="Awards ballot">
      <button type="button" className="fd-awards-entry" aria-expanded={open} onClick={() => setOpen(value => !value)}>
        <span className="fd-awards-mark" aria-hidden="true"><ChipFace p={null} size={34} stamp="" {...BALLOT_MARK} /></span>
        <span><small><i className="fd-insert fd-beat-dot" aria-hidden="true" />Awards ballot</small>
          <strong className={done ? undefined : "fd-awards-owed"}>{status}</strong></span>
        <span className="fd-awards-entry-go">{open ? "Hide" : <>{done ? "Change " : "Vote "}<Icon name="open" size="1em" /></>}</span>
      </button>
      {open && <div className="fd-awards-body">
        {model.count > 1 && <div className="fd-awards-steps" role="group" aria-label="Awards">
          {model.questions.map((item, i) => <button type="button" key={item.id}
            className={`fd-awards-step${item.choice ? " is-done" : ""}`} aria-current={i === at ? "step" : undefined}
            aria-label={`${item.title}${item.choice ? `, voted ${disp(state, item.choice)}` : ""}`}
            onClick={() => { clearTimeout(advance.current); setIndex(i); }}>{i + 1}</button>)}
        </div>}
        <h3 className="fd-awards-title">{question.title}</h3>
        <div className="fd-awards-grid" aria-busy={!!pending}>
          {question.nominees.map(player => {
            const self = player === me && question.selfBlocked;
            /* the tapped chip reads as picked while its write is in the air */
            const picked = pending ? pending.player === player && pending.question === question.id && !!pending.choice
              : question.choice === player;
            const name = player === me ? "You" : disp(state, player);
            return <button type="button" key={player}
              className={`fd-awards-nominee${picked ? " is-picked" : ""}${pending?.player === player ? " is-fresh" : ""}`}
              disabled={self} aria-pressed={picked}
              aria-label={self ? `${disp(state, player)}, not eligible` : picked ? `Your vote: ${disp(state, player)}. Take it back`
                : `Vote for ${disp(state, player)}`}
              onClick={() => vote(player)}>
              <span className="fd-awards-chip"><ChipFace p={player} size={44} flat /></span>
              <span>{name}</span>
            </button>;
          })}
        </div>
        {error && <p className="fd-awards-error" role="alert">{error}</p>}
      </div>}
    </section>
  );
}

/* The awards the TV has revealed, for this evening. Each winner's chip
   opens their card. Only totals exist; nobody's vote is ever shown. A row
   the TV stamped a moment ago warms once; a phone opened later does not. */
const JUST_STAMPED_MS = 2000;
export function AwardsResults({ state, rows, onPlayer, now = 0 }) {
  if (!rows.length) return null;
  return (
    <section className="fd-awards is-results" aria-label="Awards">
      <div className="fd-awards-entry" role="heading" aria-level={2}>
        <span className="fd-awards-mark" aria-hidden="true"><ChipFace p={null} size={34} stamp="" {...BALLOT_MARK} /></span>
        <span><strong>Awards</strong><small>{rows.length} of {rows[0].count}</small></span>
      </div>
      <ul className="fd-awards-results">
        {rows.map((row, i) => <li key={row.questionId}
          className={`fd-awards-result${stampTime(row) && now - stampTime(row) < JUST_STAMPED_MS ? " is-new" : ""}`}>
          <span><small>{row.title}</small>
            <strong>{row.winners.length ? row.winners.map(player => disp(state, player)).join(" & ") : "No votes"}</strong></span>
          <span className="fd-awards-result-who">{row.winners.slice(0, 3).map(player =>
            <button type="button" key={player} onClick={() => onPlayer?.(player)}
              aria-label={`View ${disp(state, player)}'s player card`}><ChipFace p={player} size={36} flat /></button>)}</span>
          <span className="fd-awards-result-votes">{row.winners.length
            ? `${row.counts[row.winners[0]]} of ${row.votes}` : ""}</span>
        </li>)}
      </ul>
    </section>
  );
}

/* Home's awards slot: the ballot while voting runs, then what the TV has
   revealed. */
export function AwardsHome({ state, me, onPlayer, onVote, now }) {
  /* the award on the TV right now keeps its winner off phones until the TV
     stamps it */
  const [tick, setTick] = useState(0);
  const at = now ?? serverNow();
  const wake = nextStampAt(awardResults(state), at);
  useEffect(() => {
    if (wake === null || now !== undefined) return undefined;
    const timer = setTimeout(() => setTick(value => value + 1), Math.max(50, wake - serverNow() + 30));
    return () => clearTimeout(timer);
  }, [wake, tick, now]);
  const rows = homeResults(state, at);
  const model = ballotModel(state, me);
  if (model && me) return <AwardsBallot state={state} me={me} onVote={onVote} />;
  return rows.length ? <AwardsResults state={state} rows={rows} onPlayer={onPlayer} now={at} /> : null;
}
