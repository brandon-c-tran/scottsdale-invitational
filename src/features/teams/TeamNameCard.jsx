import React, { useRef, useState } from "react";
import { disp } from "../../../shared/core.js";
import { dispatch } from "../../lib/client.js";
import { tapTick } from "../../lib/haptics.js";
import { Avatar } from "../identity/PlayerIdentity.jsx";
import { Icon } from "../../ui/Icon.jsx";
import { RenameText } from "./RenameText.jsx";
import { TEAM_NAME_MAX, checkTeamName, myTeamNaming, namingEvents, teamNaming } from "./teamNameModel.js";
import "./teams.css";

const sendName = payload => dispatch("nameTeam", payload, { retry:true });

/* The naming itself: the three suggestions as chips (the current name lit),
   the next three, and a name of your own. One write at a time. */
function NameEditor({ state, naming, round, onRound, onSend, onDone }) {
  const [pending, setPending] = useState(null);
  const [writing, setWriting] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const busy = useRef(false);
  const current = naming.name;
  const send = async name => {
    if (busy.current) return;
    const checked = checkTeamName(state, naming, name);
    if (checked.error) { setError(checked.error); return; }
    if ((checked.name ?? null) === (current ?? null)) { setWriting(false); onDone?.(); return; }
    busy.current = true; setPending(checked.name ?? ""); setError("");
    try {
      const result = await onSend({ evId:naming.evId, drawId:naming.drawId, team:naming.team, name:checked.name });
      if (result?.ok !== true) setError(result?.error || "Not saved. Try again.");
      else { setWriting(false); setDraft(""); onDone?.(); }
    } catch { setError("Not saved. Try again."); }
    finally { busy.current = false; setPending(null); }
  };
  const pick = name => { tapTick(); send(name); };
  return <div className="fd-teamname-edit" aria-busy={pending !== null}>
    <div className="fd-teamname-chips" role="group" aria-label="Suggestions">
      {/* the name the team has now, lit, with whoever chose it; then the suggestions */}
      {[...(current && !naming.suggestions.includes(current) ? [current] : []), ...naming.suggestions].map(name => {
        const on = pending !== null ? pending === name : current === name;
        return <button type="button" key={name} className={`fd-teamname-chip${on ? " is-on" : ""}`} aria-pressed={on}
          disabled={pending !== null} onClick={() => pick(name)}>
          {name === current ? <RenameText name={name} /> : name}
          {name === current && pending === null && <NamedBy state={state} named={naming.named} size={22} />}</button>;
      })}
      <button type="button" className="fd-teamname-chip is-tool" aria-label="More names" disabled={pending !== null}
        onClick={() => { tapTick(); onRound(round + 1); }}><Icon name="shuffle" size={20} /></button>
    </div>
    {writing
      ? <form className="fd-teamname-write" onSubmit={event => { event.preventDefault(); send(draft); }}>
          <input type="text" value={draft} maxLength={TEAM_NAME_MAX} autoFocus enterKeyHint="done" autoComplete="off"
            autoCapitalize="words" spellCheck={false} aria-label="Team name" placeholder={naming.label}
            disabled={pending !== null} onChange={event => { setDraft(event.target.value.replace(/[\r\n]+/g, " ")); setError(""); }} />
          <button type="submit" className="fd-teamname-save" disabled={pending !== null || !draft.trim()}>
            {pending !== null ? "Saving…" : "Save"}</button>
        </form>
      : <div className="fd-teamname-own">
          <button type="button" className="fd-teamname-link" disabled={pending !== null}
            onClick={() => { setWriting(true); setDraft(""); setError(""); }}><Icon name="pencil" size={18} />Write your own</button>
          {naming.pair && current && <button type="button" className="fd-teamname-link" disabled={pending !== null}
            onClick={() => send(null)}>Use our names</button>}
        </div>}
    {error && <p className="fd-teamname-error" role="alert">{error}</p>}
  </div>;
}

/* who named it, as their photo chip */
function NamedBy({ state, named, size = 28 }) {
  if (!named?.by) return null;
  return <span className="fd-teamname-by" role="img" aria-label={`Named by ${disp(state, named.by)}`}>
    <Avatar state={state} p={named.by} size={size} /></span>;
}

/* One team's card. A team of three or more opens with its suggestions; a
   pair, or a team that already chose, keeps them behind the pencil. */
export function TeamNameCard({ state, naming: given, ev, me, gm = false, index = null, onSend = sendName, className = "" }) {
  const [round, setRound] = useState(0);
  const resolved = given || (index !== null ? teamNaming(state, ev, index, { gm, round }) : myTeamNaming(state, ev, me, { gm, round }));
  const [open, setOpen] = useState(null);
  if (!resolved) return null;
  const naming = resolved;
  const chosen = !!naming.named;
  const expanded = open ?? (!naming.pair && !chosen && !gm);
  const lamp = chosen || gm ? "" : " fd-lamp is-info is-pending";
  return <section className={`fd-teamname fd-glass-field fd-field-info${lamp}${gm ? " is-desk" : ""} ${className}`.trim()}
    aria-label={gm ? `${naming.label} name` : "Name your team"}>
    {/* open, the heading asks and the chips answer (the current name is
        the lit one); closed, the team's name is the heading */}
    <div className="fd-teamname-head">
      {expanded && !gm ? <h2 className="fd-teamname-ask">Name your team</h2>
        : <div className="fd-teamname-current">
            {!gm && !naming.name ? <h2 className="fd-teamname-ask">Name your team</h2>
              : <RenameText name={naming.label} as="h2" className="fd-show fd-teamname-name" />}
            {naming.name && <NamedBy state={state} named={naming.named} />}
          </div>}
      <button type="button" className={`fd-teamname-toggle${expanded ? " is-open" : ""}`} aria-expanded={expanded}
        aria-label={expanded ? "Close" : "Rename"} onClick={() => setOpen(!expanded)}>
        <Icon name={expanded ? "collapse" : "pencil"} size={20} /></button>
    </div>
    {expanded && <NameEditor state={state} naming={naming} round={round} onRound={setRound} onSend={onSend}
      onDone={() => { if (gm || naming.pair) setOpen(false); }} />}
  </section>;
}

/* Home: your team in each event whose names are still open */
export function TeamNamesHome({ state, me, events, onSend }) {
  const list = namingEvents(state, events, me);
  if (!list.length) return null;
  return <>{list.map(ev => <TeamNameCard key={`${ev.id}:${state.draws[ev.id].id}`} state={state} ev={ev} me={me} onSend={onSend} />)}</>;
}

/* The commissioner's names for an event: every team, always open to rename */
export function TeamNameDesk({ state, ev, onSend }) {
  const teams = state?.draws?.[ev?.id]?.teams || [];
  if (!teams.some(team => (team.players?.length || 0) >= 2)) return null;
  return <div className="fd-teamname-desk" role="group" aria-label="Team names">
    <h3>Team names</h3>
    {teams.map((team, index) => (team.players?.length || 0) >= 2
      && <TeamNameCard key={`${state.draws[ev.id].id}:${index}`} state={state} ev={ev} index={index} gm onSend={onSend} />)}
  </div>;
}
