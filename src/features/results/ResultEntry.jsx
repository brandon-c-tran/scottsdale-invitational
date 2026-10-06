import React, { useEffect, useRef, useState } from "react";
import { AWARDS, awardTable, bracketChampion, resolveSlot, stageEntrantView, stageFinalists, presentPlayers, disp,
  teamLabel } from "../../../shared/core.js";
import { Sheet, ActionButton } from "../../ui/controls.jsx";
import { writeError } from "../../lib/writeErrors.js";
import { fly, MOTION, EASE, useReducedMotion } from "../../lib/motion.js";
import { tapTick } from "../../lib/haptics.js";
import { PLACE_NAMES, paidPlaces, nextTarget, tapUnit, tieAllowed, unitPlace, placeUnits, emptyPaidPlaces }
  from "./placePickerModel.js";
import { Podium, Socket, CrewStep, SeatUnit, FieldTile, TeamTile, FieldModes, podiumOrder } from "./PlacePicker.jsx";

const fmt = n => (Number(n) || 0).toLocaleString("en-US");
const POST = { width:"100%", fontSize:16, padding:"14px" };
const HALF = { flex:1 };

/* What the sheet opens with: a posted result, else what the contest already
   decided (a bracket's champion and runner-up and both semifinal losers in
   3rd, each paid in full; a stage final's winner and, with two finalists,
   its runner-up), else nothing. */
function initialSlots(state, ev, table) {
  const existing = state.results[ev.id];
  if (existing?.slots) return [0, 1, 2].map(i => [...(existing.slots[i] || [])]);
  const br = state.brackets[ev.id], draw = state.draws[ev.id], st = state.stages[ev.id];
  if (br && draw) {
    const champ = bracketChampion(br);
    if (champ !== null) {
      const final = br.rounds[br.rounds.length - 1][0];
      const a = resolveSlot(br, final.a), b = resolveSlot(br, final.b);
      const runner = champ === a ? b : a;
      const semis = br.rounds[br.rounds.length - 2] || [];
      const losers = semis.map(match => [resolveSlot(br, match.a), resolveSlot(br, match.b)]
        .find(side => side !== null && side !== match.winner)).filter(side => side !== undefined && draw.teams[side]);
      return [[...draw.teams[champ].players],
        table[1] > 0 && runner !== null ? [...draw.teams[runner].players] : [],
        table[2] > 0 ? losers.flatMap(side => draw.teams[side].players) : []];
    }
  }
  if (st && st.finalWinner !== null && st.finalWinner !== undefined) {
    const v = stageEntrantView(state, st, st.finalWinner);
    const finalists = stageFinalists(st) || [];
    const runner = finalists.length === 2 ? finalists.find(key => key !== st.finalWinner) : undefined;
    return [[...v.players],
      table[1] > 0 && runner !== undefined ? [...stageEntrantView(state, st, runner).players] : [], []];
  }
  return [[], [], []];
}

/* The official result (commissioner, real names): a podium of the paid
   places over the field. One tap places someone in the lit place, one tap
   takes them back. */
export function ResultEntry({ ev, state, onClose, save }) {
  const existing = state.results[ev.id];
  const table = AWARDS[ev.value] || ev.pays ? awardTable(ev) : [400, 0, 0];
  const paid = paidPlaces(table);
  const bracket = state.brackets[ev.id], stage = state.stages[ev.id], draw = state.draws[ev.id];
  const sequenced = !!state.eventOps?.[ev.id]?.contest;
  const winnerKnown = sequenced && ((bracket && bracketChampion(bracket) !== null)
    || (stage && stage.finalWinner !== null && stage.finalWinner !== undefined));
  const editable = paid.filter(index => !winnerKnown || index !== 0);
  const teams = draw?.teams?.length && ev.kind !== "solo" ? draw.teams : null;
  /* Two teams, one game: picking the winner is the whole result (the other
     team is 2nd when 2nd pays), so the field is the two teams. */
  const twoTeams = !winnerKnown && !bracket && !stage && !!teams && teams.length === 2;
  const crew = table[2] > 0 ? (draw?.roles || []).map(role => role.player).filter(Boolean) : [];

  /* everyone who can be placed: who is here, plus anyone already placed
     (a correction may name someone now away) */
  const fieldOf = placedSlots => [...new Set([...presentPlayers(state), ...placedSlots.flat()])];
  const sidesFor = placedSlots => teams ? teams.length : fieldOf(placedSlots).length;
  /* the places and the target move together, always from the latest pick */
  const [pick, setPick] = useState(() => {
    const start = initialSlots(state, ev, table);
    return { slots:start, target:twoTeams ? null : nextTarget(start, editable, sidesFor(start)) };
  });
  const { slots, target } = pick;
  const fieldPlayers = fieldOf(slots);
  const sidesInPlay = sidesFor(slots);
  const [byPlayer, setByPlayer] = useState(false);
  const [confirmCorrection, setConfirmCorrection] = useState(false);
  const [correctionReason, setCorrectionReason] = useState("");
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  /* a paid place left empty is a decision, not an oversight */
  const [emptyCheck, setEmptyCheck] = useState(null);
  const saving = useRef(false);
  const rules = { sequenced, fixedFirst:winnerKnown };
  const emptyPaid = twoTeams ? [] : emptyPaidPlaces(slots, editable, sidesInPlay);
  /* a sequenced event's 1st is one full team: while 1st is the target, the
     field is teams */
  const firstIsTeam = sequenced && !!teams && target === 0;
  const mode = teams && (!byPlayer || firstIsTeam || twoTeams) ? "teams" : "players";
  const unchanged = !!existing && JSON.stringify(existing.slots || []) === JSON.stringify(slots);

  /* ── flights: a face flies from the tile to its seat, or home ── */
  const reduced = useReducedMotion();
  const root = useRef(null), flight = useRef(null);
  const [arriving, setArriving] = useState(null);
  useEffect(() => {
    const next = flight.current;
    if (!next) return;
    flight.current = null;
    const dest = root.current?.querySelector(next.to) || (next.fallback && root.current?.querySelector(next.fallback));
    if (!dest) { setArriving(null); return; }
    fly(next.rect, dest, { node:next.node, duration:MOTION.flight, arc:next.home ? 18 : 30, easing:EASE.out, land:true })
      .then(() => setArriving(key => key === next.key ? null : key));
  });
  const takeOff = (key, home, place) => {
    if (reduced || !root.current) return;
    const source = home ? root.current.querySelector(`[data-seat="${key}"] [data-fly]`)
      : root.current.querySelector(`[data-tile="${key}"] [data-fly]`);
    if (!source) return;
    const rect = source.getBoundingClientRect();
    flight.current = { key, home, rect, node:source.cloneNode(true),
      to:home ? `[data-tile="${key}"] [data-fly]` : `[data-seat="${key}"] [data-fly]`,
      fallback:home ? null : `[data-socket="${place}"] .fd-pp-seat` };
    if (!home) setArriving(key);
  };

  /* one tap on a unit: place it in the target, or take it back */
  const tap = (key, players) => {
    if (saving.current) return;
    /* the tick and the flight go with what this tap sees; the places
       always move from the latest pick */
    const held = slots.some(slot => players.some(p => slot.includes(p)));
    if (held || (target !== null && editable.includes(target))) { tapTick(); takeOff(key, held, target); }
    setPick(prev => {
      const next = tapUnit(prev.slots, players, prev.target, { editable, sidesInPlay:sidesFor(prev.slots), ...rules });
      return next.slots === prev.slots && next.target === prev.target ? prev : next;
    });
    setEmptyCheck(null);
  };
  const aim = place => {
    if (saving.current) return;
    tapTick();
    setPick(prev => ({ ...prev, target:place }));
  };
  /* two teams: the winner is one tap; tapping it again clears */
  const pickWinner = index => {
    if (saving.current) return;
    tapTick();
    const team = teams[index], other = teams.find((item, i) => i !== index);
    setPick(prev => team.players.every(p => prev.slots[0].includes(p)) ? { slots:[[], [], []], target:null }
      : { slots:[[...team.players], table[1] > 0 && other ? [...other.players] : [], []], target:null });
  };

  const post = async (options, allowEmpty = false) => {
    if (saving.current) return;
    if (!allowEmpty && emptyPaid.length) { setEmptyCheck(options || {}); return; }
    setEmptyCheck(null);
    saving.current = true; setPending(true); setError("");
    try { const result = await save(slots, options); if (result?.ok !== true) setError(writeError(result, "The result didn't post. Tap again.")); }
    catch (failure) { setError(writeError(failure, "The result didn't post. Tap again.")); }
    finally { saving.current = false; setPending(false); }
  };

  /* ── the podium ── */
  const owed = emptyCheck ? emptyPaid : [];
  const placed = slots.flat();
  const unitsLeft = mode === "teams" ? teams.some(team => !team.players.some(p => placed.includes(p)))
    : fieldPlayers.some(p => !placed.includes(p));
  const order = podiumOrder(paid);
  const sockets = order.map(place => {
    const players = slots[place] || [];
    const units = placeUnits(players, teams || []);
    const fixed = twoTeams || (winnerKnown && place === 0);
    const tieable = !fixed && tieAllowed(place, rules) && unitsLeft;
    const lit = !fixed && target === place;
    const count = units.length + (lit && players.length && tieable ? 1 : 0);
    return <Socket key={place} name={`${PLACE_NAMES[place]} place`} place={place} amount={table[place]}
      target={lit} filled={players.length > 0} tieable={tieable} fixed={fixed} locked={winnerKnown && place === 0}
      owed={owed.includes(place)}
      replacing={lit && players.length > 0 && !tieable} disabled={pending}
      onClick={fixed ? null : () => aim(place)}>
      {units.map(unit => {
        const label = unit.team !== null ? teamLabel(state, teams[unit.team]) : disp(state, unit.players[0]);
        return <SeatUnit key={unit.key} unitKey={unit.key} state={state} players={unit.players} label={label}
          team={unit.team !== null} count={count} arriving={arriving === unit.key} disabled={pending}
          name={fixed ? label : `Remove ${label} from ${PLACE_NAMES[place]}`}
          onClick={fixed ? null : () => tap(unit.key, unit.players)} />;
      })}
    </Socket>;
  });
  if (crew.length) sockets.push(<CrewStep key="crew" state={state} players={crew} amount={table[2]} />);

  /* ── the field ── */
  const placeOf = players => {
    const whole = unitPlace(slots, players);
    return whole >= 0 ? whole : -1;
  };
  const idle = target === null && !twoTeams;
  const fixedFirst = winnerKnown ? slots[0] : [];
  let field = null;
  if (mode === "teams") {
    const shown = teams.map((team, index) => ({ team, index }))
      .filter(({ team }) => !team.players.some(p => fixedFirst.includes(p)));
    field = <div className={`fd-pp-field is-teams${twoTeams ? " is-two" : ""}`} role="group" aria-label="Teams">
      {shown.map(({ team, index }, i) => {
        const key = `team:${index}`;
        return <TeamTile key={key} unitKey={key} state={state} players={team.players} name={teamLabel(state, team)}
          place={placeOf(team.players)} idle={idle} big={twoTeams} disabled={pending}
          wide={!twoTeams && shown.length % 2 === 1 && i === shown.length - 1}
          onClick={() => twoTeams ? pickWinner(index) : tap(key, team.players)} />;
      })}
    </div>;
  } else {
    field = <div className="fd-pp-field" role="group" aria-label="Players">
      {fieldPlayers.filter(p => !fixedFirst.includes(p)).map(p => {
        const key = `player:${p}`;
        return <FieldTile key={key} unitKey={key} state={state} player={p} name={disp(state, p)}
          place={slots.findIndex(slot => slot.includes(p))} idle={idle} crew={crew.includes(p)} disabled={pending}
          onClick={() => tap(key, [p])} />;
      })}
    </div>;
  }
  const picking = twoTeams || editable.length > 0;

  return (
    <Sheet title={ev.name} show onClose={onClose} busy={pending}>
      <div className="fd-pp" ref={root}>
        <Podium columns={sockets.length} still={twoTeams || !editable.length}>{sockets}</Podium>
        {picking && <fieldset className="fd-pp-fieldset" disabled={pending}>
          {teams && !twoTeams && <FieldModes mode={mode} teamsOnly={firstIsTeam} disabled={pending}
            onTeams={() => setByPlayer(false)} onPlayers={() => setByPlayer(true)} />}
          {field}
        </fieldset>}
        {error && <p role="alert" className="fd-pp-error">{error}</p>}
        {emptyCheck && emptyPaid.length > 0 && <div role="alert" className="fd-pp-check">
          {emptyPaid.map(i => <p key={i}>{PLACE_NAMES[i]} place pays {fmt(table[i])}. Nobody selected.</p>)}
          <div className="fd-pp-actions">
            <ActionButton variant="commit" style={HALF} disabled={pending} onClick={() => post(emptyCheck, true)}>Leave empty</ActionButton>
            <ActionButton variant="tertiary" style={HALF} disabled={pending}
              onClick={() => { setPick(prev => ({ ...prev, target:emptyPaid[0] })); setEmptyCheck(null); }}>Choose</ActionButton>
          </div>
        </div>}
        {!existing ? (
          <ActionButton style={POST} disabled={slots[0].length === 0 || pending} onClick={() => post()}>
            Post official result</ActionButton>
        ) : !confirmCorrection ? (
          <ActionButton style={POST} disabled={slots[0].length === 0 || unchanged || pending}
            onClick={() => setConfirmCorrection(true)}>
            {unchanged ? "Official result" : "Review result correction"}</ActionButton>
        ) : (
          <div className="fd-pp-check is-correction">
            <label className="fd-pp-reason">
              <span>Reason for the correction</span>
              <input value={correctionReason} disabled={pending} onChange={event => setCorrectionReason(event.target.value)}
                maxLength={100} aria-label="Reason for the correction" />
            </label>
            <div className="fd-pp-actions">
              <ActionButton variant="commit" style={HALF} disabled={!correctionReason.trim() || pending}
                onClick={() => post({ confirmOverwrite:true, correctionReason })}>Replace official result</ActionButton>
              <ActionButton variant="tertiary" style={HALF} disabled={pending}
                onClick={() => { setConfirmCorrection(false); setCorrectionReason(""); }}>Keep current</ActionButton>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}
