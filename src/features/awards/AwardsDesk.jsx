import React, { useEffect, useMemo, useRef, useState } from "react";
import { ROSTER, allEventsOf, disp } from "../../../shared/core.js";
import {
  PROMPT_QUESTIONS_MAX, PROMPT_TITLE_MAX, awardResults, awardsRevealBlocker, ballotStatusLine, ballotsOf, revealedCount,
} from "../../../shared/prompts.js";
import { serverNow } from "../../lib/serverClock.js";
import { stampTime } from "./awardsModel.js";
import { ChipFace } from "../identity/PlayerIdentity.jsx";
import { ActionButton, Sheet } from "../../ui/controls.jsx";
import { dispatch } from "../../lib/client.js";
import "./awards.css";

const send = (type, payload) => dispatch(type, payload, { retry:true });
const token = () => Math.random().toString(36).slice(2, 10).padEnd(8, "0");
const newQuestion = () => ({ id:`q${token()}`, title:"", nominees:null, allowSelf:false });
const blankDraft = () => ({ id:`b${Date.now().toString(36)}${token().slice(0, 4)}`, kind:"awards",
  questions:[newQuestion(), newQuestion(), newQuestion()] });
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/* the ballot the commissioner is working on: voting, a reveal, a closed
   ballot waiting for the TV, a draft, else the last finished one */
export function deskBallot(state) {
  const ballots = ballotsOf(state);
  const newest = list => [...list].sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0))[0] || null;
  return ballots.find(ballot => ballot.status === "open")
    || newest(ballots.filter(ballot => ballot.status === "closed" && ballot.reveal && !ballot.reveal.done))
    || newest(ballots.filter(ballot => ballot.status === "closed" && !ballot.reveal))
    || newest(ballots.filter(ballot => ballot.status === "draft"))
    || newest(ballots) || null;
}

/* the menu row's live fact */
export const deskNote = state => {
  const ballot = deskBallot(state);
  return ballot ? ballotStatusLine(ballot) : "Superlatives, voted on every phone";
};

/* what a draft sends: whole awards only */
export function draftPayload(draft) {
  return { id:draft.id, kind:"awards", questions:draft.questions.map(question => ({ id:question.id,
    title:question.title.trim(), nominees:question.nominees, allowSelf:!!question.allowSelf })) };
}

/* what stops a draft from being saved, in the words the server uses */
export function draftProblem(draft) {
  if (!draft.questions.length) return "Add an award";
  for (const [index, question] of draft.questions.entries()) {
    if (!question.title.trim()) return `Name award ${index + 1}`;
    if (Array.isArray(question.nominees) && question.nominees.length < 2) return `${question.title.trim()} needs two nominees`;
  }
  return null;
}

function AwardEditor({ state, question, index, count, onChange, onRemove }) {
  const everyone = !Array.isArray(question.nominees);
  const picked = new Set(question.nominees || []);
  const toggle = player => {
    const next = picked.has(player) ? [...picked].filter(item => item !== player) : [...picked, player];
    onChange({ nominees:ROSTER.filter(item => next.includes(item)) });
  };
  return (
    <div className="fd-awards-edit">
      <div className="fd-awards-edit-row">
        <input type="text" value={question.title} maxLength={PROMPT_TITLE_MAX} placeholder={`Award ${index + 1}`}
          aria-label={`Award ${index + 1} title`} onChange={event => onChange({ title:event.target.value })} />
        {count > 1 && <ActionButton variant="tertiary" compact onClick={onRemove}
          aria-label={`Remove award ${index + 1}`}>Remove</ActionButton>}
      </div>
      <div className="fd-awards-toggle" role="group" aria-label="Nominees">
        <button type="button" aria-pressed={everyone} onClick={() => onChange({ nominees:null })}>Everyone</button>
        <button type="button" aria-pressed={!everyone} onClick={() => { if (everyone) onChange({ nominees:[] }); }}>
          {everyone ? "Pick nominees" : `${picked.size} picked`}</button>
      </div>
      {!everyone && <div className="fd-awards-picks">
        {ROSTER.map(player => <button type="button" key={player}
          className={`fd-awards-nominee${picked.has(player) ? " is-picked" : ""}`} aria-pressed={picked.has(player)}
          onClick={() => toggle(player)}>
          <span className="fd-awards-chip"><ChipFace p={player} size={40} flat /></span>
          <span>{disp(state, player)}</span>
        </button>)}
      </div>}
      <label className="fd-awards-check">
        <input type="checkbox" checked={!!question.allowSelf} onChange={event => onChange({ allowSelf:event.target.checked })} />
        Allow self-votes
      </label>
    </div>
  );
}

/* D6: the commissioner's awards. Write the superlatives, publish them as
   one ballot, watch the turnout (never the totals), close voting, then
   reveal them on the TV one at a time. The director pill offers the same
   reveal beats. */
export function AwardsDesk({ state, events = allEventsOf(state), onClose, onBack, write = send, notify }) {
  const ballot = deskBallot(state);
  const editing = !ballot || ballot.status === "draft" || (ballot.status === "closed" && ballot.reveal?.done);
  const [draft, setDraft] = useState(() => ballot?.status === "draft"
    ? { id:ballot.id, kind:ballot.kind, questions:ballot.questions.map(question => ({ ...question,
      nominees:question.nominees ? [...question.nominees] : null })) } : null);
  const [fresh, setFresh] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const [pending, setPending] = useState(null);
  const blocker = useMemo(() => awardsRevealBlocker(state, events), [state, events]);

  const run = async (key, type, payload, done) => {
    if (busy.current) return { ok:false };
    busy.current = true; setPending(key); setError("");
    try {
      const result = await write(type, payload);
      if (result?.ok !== true) setError(result?.error || "Not saved. Try again.");
      else { setConfirm(null); done?.(result); }
      return result;
    } catch { setError("Not saved. Try again."); return { ok:false }; }
    finally { busy.current = false; setPending(null); }
  };

  /* one blank ballot per sheet, so its fields keep their identity */
  const blank = useRef(null);
  if (!blank.current) blank.current = blankDraft();
  const showEditor = editing && (ballot?.status === "draft" || fresh || !ballot);
  const working = showEditor ? draft || blank.current : null;
  const setWorking = change => setDraft(current => change(current || working));
  const problem = working ? draftProblem(working) : null;

  let body;
  if (showEditor) {
    const update = (index, patch) => setWorking(current => ({ ...current,
      questions:current.questions.map((question, i) => i === index ? { ...question, ...patch } : question) }));
    body = <>
      {working.questions.map((question, index) => <AwardEditor key={question.id} state={state} question={question}
        index={index} count={working.questions.length} onChange={patch => update(index, patch)}
        onRemove={() => setWorking(current => ({ ...current, questions:current.questions.filter((_, i) => i !== index) }))} />)}
      {working.questions.length < PROMPT_QUESTIONS_MAX && <ActionButton variant="secondary"
        onClick={() => setWorking(current => ({ ...current, questions:[...current.questions, newQuestion()] }))}>
        Add award</ActionButton>}
      {confirm === "publish" ? <>
        <p className="fd-awards-note">Every phone gets {plural(working.questions.length, "award")} to vote on.</p>
        <div className="fd-awards-actions">
          <ActionButton variant="tertiary" onClick={() => setConfirm(null)}>Cancel</ActionButton>
          <ActionButton pending={pending === "publish"} onClick={() => run("publish", "promptPublish",
            { ballot:draftPayload(working) }, () => { setDraft(null); setFresh(false); notify?.("Ballot published"); })}>
            Publish ballot</ActionButton>
        </div>
      </> : <div className="fd-awards-actions">
        <ActionButton variant="secondary" disabled={!!problem} pending={pending === "save"}
          onClick={() => run("save", "promptSave", draftPayload(working), () => notify?.("Draft saved"))}>Save draft</ActionButton>
        <ActionButton disabled={!!problem} onClick={() => setConfirm("publish")}>Publish</ActionButton>
      </div>}
      {problem && working.questions.some(question => question.title.trim()) && <p className="fd-awards-note">{problem}</p>}
      {ballot?.status === "draft" && (confirm === "discard" ? <div className="fd-awards-actions">
        <ActionButton variant="tertiary" onClick={() => setConfirm(null)}>Keep draft</ActionButton>
        <ActionButton variant="commit" pending={pending === "discard"}
          onClick={() => run("discard", "promptDiscard", { id:ballot.id }, () => setDraft(null))}>Discard draft</ActionButton>
      </div> : <ActionButton variant="destructive" onClick={() => setConfirm("discard")}>Discard draft</ActionButton>)}
    </>;
  } else if (ballot.status === "open") {
    const waiting = (ballot.of || ROSTER.length) - (ballot.voted || 0);
    body = <>
      <div className="fd-awards-count" role="status"><strong>{ballot.voted || 0}</strong>
        <span>of {ballot.of || ROSTER.length} voted</span></div>
      <AwardList state={state} ballot={ballot} />
      {confirm === "close" ? <>
        <p className="fd-awards-note">{waiting ? `${plural(waiting, "player")} ${waiting === 1 ? "has" : "have"} not voted.`
          : "Everyone has voted."}</p>
        <div className="fd-awards-actions">
          <ActionButton variant="tertiary" onClick={() => setConfirm(null)}>Keep voting open</ActionButton>
          <ActionButton pending={pending === "close"} onClick={() => run("close", "promptClose", { id:ballot.id },
            () => notify?.("Voting closed"))}>Close voting</ActionButton>
        </div>
      </> : <ActionButton onClick={() => setConfirm("close")}>Close voting</ActionButton>}
    </>;
  } else if (ballot.status === "closed" && !ballot.reveal?.done) {
    const shown = revealedCount(ballot), n = ballot.questions.length;
    const next = ballot.questions[shown];
    body = <>
      <div className="fd-awards-count" role="status">
        {shown ? <><strong>{shown}</strong><span>of {n} shown on the TV</span></>
          : <><strong>{ballot.voted || 0}</strong><span>of {ballot.of || ROSTER.length} voted · voting closed</span></>}
      </div>
      <AwardList state={state} ballot={ballot} shown={shown} />
      {next ? <ActionButton disabled={!!blocker} pending={pending === "reveal"}
        onClick={() => run("reveal", "promptReveal", { id:ballot.id, step:shown + 1 })}>
        {shown ? `Next: ${next.title}` : `Reveal on TV: ${next.title}`}</ActionButton>
        : <ActionButton pending={pending === "end"} onClick={() => run("end", "promptRevealEnd", { id:ballot.id })}>
          End awards</ActionButton>}
      {blocker && next && <p className="fd-awards-note">{blocker}</p>}
      <div className="fd-awards-actions">
        {!shown && <ActionButton variant="secondary" pending={pending === "reopen"}
          onClick={() => run("reopen", "promptReopen", { id:ballot.id }, () => notify?.("Voting reopened"))}>
          Reopen voting</ActionButton>}
        {next && (confirm === "skip" ? <ActionButton variant="commit" pending={pending === "end"}
          onClick={() => run("end", "promptRevealEnd", { id:ballot.id })}>Show every result on phones</ActionButton>
          : <ActionButton variant="tertiary" onClick={() => setConfirm("skip")}>Skip the TV</ActionButton>)}
      </div>
    </>;
  } else {
    body = <>
      <AwardList state={state} ballot={ballot} shown={ballot.questions.length} />
      <ActionButton variant="secondary" onClick={() => { blank.current = blankDraft(); setDraft(null); setFresh(true); }}>
        New ballot</ActionButton>
    </>;
  }

  return (
    <Sheet title="Awards" subtitle={!showEditor && ballot?.reveal?.done ? ballotStatusLine(ballot) : null} onClose={onClose} onBack={onBack}
      busy={!!pending}>
      <div className="fd-awards-desk">
        {body}
        {error && <p className="fd-awards-error" role="alert">{error}</p>}
      </div>
    </Sheet>
  );
}

/* the ballot's awards; revealed ones carry their winner */
function AwardList({ state, ballot, shown = 0 }) {
  /* the award on the TV keeps its winner until the TV stamps it, here too */
  const [, setTick] = useState(0);
  const onTv = awardResults(state).find(row => row.ballotId === ballot.id && row.onTvSince);
  const heldUntil = onTv ? stampTime(onTv) : 0;
  useEffect(() => {
    const wait = heldUntil - serverNow();
    if (wait <= 0) return undefined;
    const timer = setTimeout(() => setTick(value => value + 1), wait + 30);
    return () => clearTimeout(timer);
  }, [heldUntil]);
  const held = heldUntil > serverNow() ? onTv.questionId : null;
  return (
    <ul className="fd-awards-desk-list">
      {ballot.questions.map((question, index) => {
        const result = index < shown && question.id !== held ? ballot.results?.[question.id] : null;
        const winners = result?.winners || [];
        return <li key={question.id}><span>{question.title}</span>
          <small>{result ? winners.length ? `${winners.map(player => disp(state, player)).join(" & ")} · ${result.counts[winners[0]]}`
            : "No votes" : question.nominees ? `${question.nominees.length} nominees` : "Everyone"}</small></li>;
      })}
    </ul>
  );
}
