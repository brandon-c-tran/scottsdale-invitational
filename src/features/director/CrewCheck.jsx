/* Before the draw: one screen, every player as a photo chip, each chip
   drawing its own state (a plain face plays, a cyan ring and role tag is
   crew, a dashed seat is sitting out, a struck face is away). A tap on a
   face opens its choices in place, right under its row: this event's seat
   (Playing, Crew, Sit out) as one segmented control, Away apart in its own
   shape because it writes at once, and a crew member's roles. Crew the
   shape could not seat (auto) carries the rotation mark on its tag. No
   mode to pick first. The
   suggestion is preselected and its first crew member opens on arrival,
   so the way to change it is on screen. Away writes at once (setAway);
   the crew and the sit-outs ride on the one confirm. */
import React, { useEffect, useRef, useState } from "react";
import { disp, overflowRoleMeta } from "../../../shared/core.js";
import { BankChip } from "../identity/PlayerIdentity.jsx";
import { ActionButton, Sheet } from "../../ui/controls.jsx";
import { Icon } from "../../ui/Icon.jsx";
import { tapTick } from "../../lib/haptics.js";
import { useReducedMotion } from "../../lib/motion.js";
import { writeError } from "../../lib/writeErrors.js";
import { crewCheckModel, crewRoles, seatChoices, setCrewRole, suggestedCrew } from "./crewCheck.js";
import "./crew-check.css";

/* the grid's columns (crew-check.css): the choices open under a row */
const COLUMNS = 4;
const CHOICE_LABEL = { playing:"Playing", crew:"Crew", out:"Sit out", away:"Away", here:"Here" };
const stateText = item => item.state === "crew" ? `${item.auto ? "crew by rotation" : "crew"}, ${item.roleLabel}`
  : item.state === "out" ? "sitting out" : item.state === "road" ? "on the way" : item.state;

/* One face's choices, under its row with a caret up to it. Each choice
   carries the lamp its state draws on the chip; a crew member's roles
   stand on a second line, one tap each. */
function SeatChoices({ state, ev, item, model, column, pending, onChoose, onClose }) {
  const ref = useRef(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    ref.current?.scrollIntoView?.({ block:"nearest", behavior:reduced ? "auto" : "smooth" });
  }, [item.player, reduced]);
  const name = disp(state, item.player);
  const roles = crewRoles(ev);
  const choices = seatChoices(model, item);
  /* this event's seat (rides on the confirm) is one segmented control;
     Away (a write of its own, now) stands apart in its own shape */
  const option = choice => <button key={choice} type="button"
    className={`fd-crew-option is-${choice}${item.state === choice ? " is-on" : ""}`}
    aria-pressed={item.state === choice} disabled={!!pending}
    onClick={() => onChoose(item.player, choice)}>
    <i className="fd-crew-lens" aria-hidden="true" /><span>{CHOICE_LABEL[choice]}</span>
  </button>;
  return <li ref={ref} className="fd-crew-choice" role="group" aria-label={name}
    style={{ "--caret":`${((column + 0.5) / COLUMNS) * 100}%` }}
    onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}>
    <div className="fd-crew-choice-row">
      <div className="fd-crew-choice-states">{choices.filter(choice => choice !== "away").map(option)}</div>
      {choices.includes("away") && <div className="fd-crew-choice-away">{option("away")}</div>}
    </div>
    {/* a crew member's role: one control that steps to the next role, its
        lamps saying how many there are and which one this is */}
    {item.state === "crew" && roles.length > 1 && <div className="fd-crew-choice-roles">
      <button type="button" className="fd-crew-role-cycle" disabled={!!pending}
        aria-label={`${name}'s role: ${overflowRoleMeta(item.role).label}. Next role`}
        onClick={() => onChoose(item.player, "crew", roles[(roles.indexOf(item.role) + 1) % roles.length], true)}>
        <span className="fd-crew-role-name">{item.roleLabel}</span>
        <span className="fd-crew-role-lamps" aria-hidden="true">{roles.map(role =>
          <i key={role} className={role === item.role ? "is-on" : undefined} />)}</span>
        <Icon name="next" size={16} />
      </button>
    </div>}
  </li>;
}

export function CrewCheck({ state, ev, roles = null, confirmLabel = "Announce and draw", onConfirm, onAway, onArrived = null,
  onClose, onBack }) {
  /* the commissioner's own crew picks; the model adds whoever the shape
     cannot seat (auto), and `keep` is anyone set back to Playing */
  const [crew, setCrew] = useState(() => (roles && roles.length ? roles.map(item => ({ ...item, auto:false })) : []));
  const [sitOut, setSitOut] = useState([]);
  const [keep, setKeep] = useState([]);
  /* the face whose choices are open: the suggestion's first crew member on arrival */
  const [open, setOpen] = useState(() => (roles || suggestedCrew(state, ev))[0]?.player || null);
  const [pending, setPending] = useState(null);
  const [error, setError] = useState("");
  const busy = useRef(false);
  /* the director's suggestion arrives as `roles`: the overflow the shape
     cannot seat, chosen by rotation. Until the commissioner touches one of
     those faces it is drawn as auto crew (presentation only: the payload
     is unchanged) */
  const [rotated, setRotated] = useState(() => {
    const suggested = new Set(suggestedCrew(state, ev).map(item => item.player));
    return (roles || []).filter(item => suggested.has(item.player)).map(item => item.player);
  });
  const checked = crewCheckModel(state, ev, crew, sitOut, keep);
  const model = { ...checked, roster:checked.roster.map(item => item.state === "crew" && rotated.includes(item.player)
    ? { ...item, auto:true } : item) };
  const drop = (list, player) => list.filter(item => (item.player || item) !== player);

  /* Away (and Here, for a face still on the way) is a write of its own,
     now; it answers true once it lands */
  const mark = async (player, away, write = onAway) => {
    busy.current = true; setPending(player);
    try {
      const result = await write?.(player, away);
      if (result && !result.ok) {
        setError(writeError(result, `${disp(state, player)} wasn't marked. Tap again.`));
        return false;
      }
      return true;
    } catch (failure) { setError(writeError(failure)); return false; }
    finally { busy.current = false; setPending(null); }
  };
  const choose = async (player, next, role = null, stay = false) => {
    if (busy.current) return;
    const entry = model.roster.find(item => item.player === player);
    if (!entry) return;
    tapTick();
    setError("");
    /* a touched face is the commissioner's call from here on */
    setRotated(current => current.filter(item => item !== player));
    if (next === "away") {
      if (entry.state !== "away" && await mark(player, true)) {
        setCrew(current => drop(current, player));
        setSitOut(current => drop(current, player));
        setKeep(current => drop(current, player));
        setOpen(null);
      }
      return;
    }
    /* on the way: Here checks them in, and they join the room */
    if (next === "here") {
      if (entry.state === "road" && await mark(player, true, onArrived)) setOpen(null);
      return;
    }
    /* back from away first, then the choice */
    if (entry.state === "away" && !await mark(player, false)) return;
    if (next === "crew") {
      setSitOut(current => drop(current, player));
      setKeep(current => drop(current, player));
      /* an auto crew seat becomes the commissioner's own, with its role */
      const seated = model.crew.find(item => item.player === player);
      setCrew(current => setCrewRole(ev, current.some(item => item.player === player) ? current
        : seated ? [...current, { player, role:seated.role, auto:false }] : current, player, role));
      /* stepping the role keeps the face open for the next step */
      if (role && !stay) setOpen(null);
      return;
    }
    if (next === "out") {
      setSitOut(current => current.includes(player) ? current : [...current, player]);
      setCrew(current => drop(current, player));
      setKeep(current => drop(current, player));
      setOpen(null);
      return;
    }
    /* playing: off the crew and the sit-outs, and kept off the auto crew */
    setCrew(current => drop(current, player));
    setSitOut(current => drop(current, player));
    setKeep(current => current.includes(player) ? current : [...current, player]);
    setOpen(null);
  };
  const confirm = async () => {
    if (busy.current || !model.fit.ok) return;
    busy.current = true; setPending("confirm"); setError("");
    try {
      const result = await onConfirm(model.playing, model.crew, model.sitOut);
      if (result && !result.ok) setError(writeError(result));
    } catch (failure) { setError(writeError(failure)); }
    finally { busy.current = false; setPending(null); }
  };

  const at = open ? model.roster.findIndex(item => item.player === open) : -1;
  const rowEnd = at < 0 ? -1 : Math.min(model.roster.length - 1, Math.floor(at / COLUMNS) * COLUMNS + COLUMNS - 1);
  return (
    <Sheet title="Before the draw" subtitle={ev.name}
      onClose={onClose} onBack={onBack} busy={pending === "confirm"} className="fd-crew-check"
      footer={<>
        {!model.fit.ok && <p role="alert" className="fd-crew-error">{model.fit.error}</p>}
        {error && <p role="alert" className="fd-crew-error">{error}</p>}
        <ActionButton className="fd-crew-confirm" disabled={!model.fit.ok || !!pending} onClick={confirm}
          style={{ fontSize:16 }}>
          {pending === "confirm" ? "Drawing…" : confirmLabel}</ActionButton>
      </>}>
      {model.shape && <p className="fd-crew-shape" role="status">{model.shape}</p>}
      <ul className="fd-crew-grid">
        {model.roster.flatMap((item, index) => {
          const seat = <li key={item.player} className={`fd-crew-seat is-${item.state}${pending === item.player ? " is-pending" : ""}${open === item.player ? " is-open" : ""}`}>
            <button type="button" className="fd-crew-chip" disabled={pending === "confirm"}
              aria-expanded={open === item.player}
              aria-label={`${disp(state, item.player)}: ${stateText(item)}`}
              onClick={() => { tapTick(); setOpen(current => current === item.player ? null : item.player); }}>
              <span className="fd-crew-face"><BankChip p={item.player} size={46} /></span>
              <span className="fd-crew-name">{disp(state, item.player)}</span>
              {/* the state, drawn under the name: crew's role in its lamp, a sit-out unlit */}
              {/* auto crew (the shape could not seat them) carries the
                  rotation mark, so it is clear why they became crew */}
              {item.state === "crew" && <span className={`fd-crew-tag is-crew${item.auto ? " is-auto" : ""}`} aria-hidden="true">
                {item.auto && <Icon name="shuffle" size={12} />}{item.roleLabel}</span>}
              {item.state === "out" && <span className="fd-crew-tag is-out" aria-hidden="true">Sit out</span>}
              {item.state === "road" && <span className="fd-crew-tag is-road" aria-hidden="true">On the way</span>}
            </button>
          </li>;
          return index === rowEnd
            ? [seat, <SeatChoices key="choices" state={state} ev={ev} item={model.roster[at]} model={model} column={at % COLUMNS}
                pending={pending} onChoose={choose} onClose={() => setOpen(null)} />]
            : [seat];
        })}
      </ul>
    </Sheet>
  );
}
