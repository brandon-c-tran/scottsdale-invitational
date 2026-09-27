import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  PT, OUTRIGHT_MULT, atRisk, disp, maxRisk, contestBetEligibility,
  resolveCurrentContest, duelReserve, resolveEventLifecycle, resolveWager, stacksPosted, teamLabel,
} from "../../../shared/core.js";
import { DISPLAY, SANS } from "../../ui/theme.js";
import { ActionButton } from "../../ui/controls.jsx";
import { PageHeading } from "../../ui/layout.jsx";
import { Avatar, BankChip } from "../identity/PlayerIdentity.jsx";
import "./wagers.css";

const fmt = n => (n ?? 0).toLocaleString("en-US");

function wagerPickLabel(state, w, events) {
  const ev = events.find(e => e.id === w.eventId);
  const evName = ev?.name || "removed event";
  const pickName = w.pickTeam || w.pickPlayers?.length > 1
    ? teamLabel(state, { players: w.pickPlayers })
    : disp(state, w.pickPlayers ? w.pickPlayers[0] : w.pick);
  if (w.kind === "outright") return { pick: pickName, ctx: `to win ${evName}` };
  if (w.kind === "match") return { pick: pickName, ctx: `to win the ${w.matchName || "matchup"} in ${evName}` };
  if (w.kind === "heat") return { pick: pickName, ctx: `to win ${w.groupName || "the heat"} in ${evName}` };
  if (w.final) return { pick: pickName, ctx: `to win the Final in ${evName}` };
  return { pick: pickName, ctx: `to advance from ${w.groupName} in ${evName}` };
}

/* A chip always moves in PT. Larger denominations keep growing stacks quick
   to play; unaffordable denominations stay visible in the rack. */
const RACK_DENOMS = [PT, 2 * PT, 5 * PT, 10 * PT];

/* New wagers are aggregated by the server. This compatibility merge keeps
   older snapshots with separate same-pick records equally readable. w.ids
   carries every underlying record id for commissioner void actions. */
function mergeWagerLines(list) {
  const key = ({ w, r }) => [w.player, r.status, w.kind, w.eventId,
    w.kind === "outright" ? (w.pickTeam ? "t:" + w.drawId + ":" + (w.pickPlayers || []).join("+") : "p:" + w.pick)
      : w.kind === "match" ? "m:" + w.drawId + ":" + (w.match || []).join("-") + ":" + w.teamIdx
      : "s:" + w.stagesId + ":" + (w.final ? "F" : w.group) + ":" + w.pickKey].join("|");
  const out = new Map();
  for (const x of list) {
    const k = key(x), cur = out.get(k);
    if (!cur) out.set(k, { w: { ...x.w, ids: [x.w.id] }, r: { ...x.r } });
    else {
      cur.w.stake += x.w.stake;
      cur.w.ids.push(x.w.id);
      if (typeof x.r.delta === "number") cur.r.delta = (cur.r.delta || 0) + x.r.delta;
    }
  }
  return [...out.values()];
}

/* The upper edge opens player cards. The lower area is the betting surface:
   the empty well adds a chip; the guest's own pile removes its last chip. */
function MarketPick({ state, me, players, name, bets, marketOpen, canPick, onPick, onRetract, onPlayer,
  roleLabel, unavailableReason, tapStake }) {
  const [pendingAction, setPendingAction] = useState(null);
  const [actionError, setActionError] = useState(null);
  const pendingRef = useRef(false);
  const mine = bets.filter(x => x.w.player === me).sort((a, b) => {
    const latest = ({ w }) => w.chips?.[w.chips.length - 1]?.ts || w.updatedAt || w.ts || 0;
    return latest(a) - latest(b);
  });
  const mineTotal = mine.reduce((total, x) => total + x.w.stake, 0);
  const mineChips = mine.flatMap(({ w }) => w.chips?.length ? w.chips.map(chip => chip.stake) : [w.stake]);
  const otherBets = new Map();
  for (const { w } of bets.filter(x => x.w.player !== me))
    otherBets.set(w.player, (otherBets.get(w.player) || 0) + w.stake);
  const otherChips = [...otherBets].map(([p, val]) => ({ p, val }));
  const act = (kind, callback) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPendingAction(kind);
    setActionError(null);
    const finish = () => { pendingRef.current = false; setPendingAction(null); };
    const check = result => {
      if (result?.ok === false) setActionError(result.error || "Bet not saved.");
      return result;
    };
    const fail = error => {
      const message = error?.message || "Bet not saved.";
      setActionError(message);
      return { ok:false, error:message };
    };
    try {
      const result = callback();
      if (result?.then) return Promise.resolve(result).then(check, fail).finally(finish);
      finish();
      return check(result);
    } catch (error) { finish(); return fail(error); }
  };
  const stack = mineTotal > 0 && <>
    <span className="fd-wagers-chip-pile" aria-hidden="true">
      {mineChips.slice(-3).map((value, index, visible) => <span key={`${mineTotal}:${index}`}
        data-chip-stake={value} style={{ "--chip-level":index, "--chip-count":visible.length }}>
        <BankChip p={me} size={36} val={value} />
      </span>)}
      {marketOpen && <span className="fd-wagers-chip-remove">−</span>}
    </span>
    <span className="fd-wagers-chip-total">{fmt(mineTotal)}</span>
  </>;
  return <div className={`fd-wagers-pick${mineTotal ? " is-mine" : ""}${roleLabel ? " is-your-side" : ""}${unavailableReason ? " is-unavailable" : ""}${pendingAction ? ` is-pending-${pendingAction}` : ""}`}>
    <div className="fd-wagers-pick-identity">
      {roleLabel && <span className="fd-wagers-pick-role">{roleLabel}</span>}
      {players.length === 1 ? <button type="button" className="fd-wagers-player" disabled={!onPlayer}
        onClick={() => onPlayer?.(players[0])} aria-label={`View ${name}'s player card`}>
        <Avatar state={state} p={players[0]} size={26} /><span>{name}</span>
      </button> : <>
        {players.length > 2 && <span className="fd-wagers-team-name">{name}</span>}
        <span className="fd-wagers-team-players">{players.map(player => <button type="button" key={player}
          disabled={!onPlayer} onClick={() => onPlayer?.(player)} title={disp(state, player)}
          aria-label={`View ${disp(state, player)}'s player card`}>
          <Avatar state={state} p={player} size={24} /><span>{disp(state, player)}</span>
        </button>)}</span>
      </>}
    </div>
    <div className="fd-wagers-pick-surface" aria-busy={!!pendingAction}>
      <button type="button" className="fd-wagers-pick-main" disabled={!canPick || !!pendingAction}
        onClick={() => act("place", onPick)} aria-label={canPick ? `Place a chip on ${name}` : name}
        aria-description={unavailableReason || (canPick ? `Add ${fmt(tapStake)} chips` : undefined)}>
        {unavailableReason ? <span className="fd-wagers-pick-closed">Opponent</span> : marketOpen && players.length > 0 ? <>
          <span className="fd-wagers-chip-well" aria-hidden="true">+</span>
          <span className="fd-wagers-pick-add">{fmt(tapStake)}</span>
        </> : <span className="fd-wagers-pick-closed">{players.length ? "Locked" : "Pending"}</span>}
      </button>
      {mineTotal > 0 && (marketOpen ? <button type="button" className="fd-wagers-retract" disabled={!!pendingAction}
        onClick={() => act("remove", () => onRetract(mine[mine.length - 1].w.id))}
        aria-label={`Retract your last chip on ${name}`}
        aria-description={`Remove ${fmt(mineChips[mineChips.length - 1])} chips; ${fmt(mineTotal)} total on this pick`}>
        {stack}
      </button> : <div className="fd-wagers-owned-stack" aria-label={`${fmt(mineTotal)} of your chips on ${name}`}>{stack}</div>)}
    </div>
    {otherChips.length > 0 && <div className="fd-wagers-other-chips" role="group" aria-label={`Other bets on ${name}`}>
      {otherChips.map(chip => <button type="button" key={chip.p} disabled={!onPlayer}
        onClick={() => onPlayer?.(chip.p)} title={`${disp(state, chip.p)} · ${fmt(chip.val)}`}
        aria-label={`View ${disp(state, chip.p)}'s player card (${fmt(chip.val)} chips)`}>
        <BankChip p={chip.p} size={25} val={chip.val} />
      </button>)}
    </div>}
    {actionError && <p className="fd-wagers-pick-error" role="alert">{actionError}</p>}
  </div>;
}

function WagerLine({ x, state, events, gm, onVoid, onPlayer }) {
  const { w, r } = x;
  const label = wagerPickLabel(state, w, events);
  const win = w.kind === "outright" ? OUTRIGHT_MULT * w.stake : w.stake;
  return <article className={`fd-wagers-line is-${r.status}`}>
    <button type="button" className="fd-wagers-ledger-player" disabled={!onPlayer}
      onClick={() => onPlayer?.(w.player)} aria-label={`View ${disp(state, w.player)}'s player card`}>
      <Avatar state={state} p={w.player} size={32} />
    </button>
    <div className="fd-wagers-line-copy">
      <span className="fd-wagers-line-bettor"><button type="button" disabled={!onPlayer}
        onClick={() => onPlayer?.(w.player)}>{disp(state, w.player)}</button> <span>· {fmt(w.stake)} chips</span></span>
      <strong>{label.pick}</strong>
      <span className="fd-wagers-line-context">{label.ctx}</span>
    </div>
    <div className="fd-wagers-line-result">
      {r.status === "pending" && <><small>TO WIN</small><strong>+{fmt(win)}</strong></>}
      {r.status === "won" && <><small>WON</small><strong>+{fmt(r.delta)}</strong></>}
      {r.status === "lost" && <><small>LOST</small><strong>{fmt(r.delta)}</strong></>}
      {r.status === "void" && <small>VOID</small>}
      {gm && r.status === "pending" && <ActionButton compact variant="destructive"
        className="fd-wagers-void" onClick={() => onVoid(w.ids || [w.id])}>Void</ActionButton>}
    </div>
  </article>;
}

/* Pick payloads retain the contract they were placed against. In particular,
   heat winners and legacy advancement bets never share a ledger target. */
function contestPick(contest, side, event) {
  const common = { eventId:event.id, evName:event.name, contestId:contest.id,
    contestRevision:contest.revision, pickPlayers:[...side.players] };
  if (contest.kind === "ffa") {
    const pickTeam = typeof side.key === "number";
    return { ...common, kind:"outright", pickTeam,
      ...(pickTeam ? { drawId:contest.drawId } : { pick:side.key }) };
  }
  if (contest.kind === "match") return { ...common, kind:"match", pickTeam:true,
    drawId:contest.drawId, match:[...contest.match], teamIdx:side.key, matchName:contest.label };
  const pickTeam = typeof side.key === "number";
  const stage = { ...common, stagesId:contest.stagesId, pickKey:side.key, pickTeam,
    ...(pickTeam && contest.drawId ? { drawId:contest.drawId } : {}) };
  return contest.kind === "heat"
    ? { ...stage, kind:"heat", group:contest.group, groupName:contest.label }
    : { ...stage, kind:"stage", final:true };
}

function samePick(wager, pick) {
  if (wager.kind !== pick.kind || wager.eventId !== pick.eventId) return false;
  if (wager.contestId && pick.contestId && wager.contestId !== pick.contestId) return false;
  if (pick.kind === "outright") return !!wager.pickTeam === !!pick.pickTeam && (pick.pickTeam
    ? wager.drawId === pick.drawId && (wager.pickPlayers || []).join("|") === pick.pickPlayers.join("|")
    : wager.pick === pick.pick);
  if (pick.kind === "match") return wager.drawId === pick.drawId && wager.teamIdx === pick.teamIdx
    && wager.match?.[0] === pick.match[0] && wager.match?.[1] === pick.match[1];
  return wager.stagesId === pick.stagesId && wager.pickKey === pick.pickKey
    && !!wager.final === !!pick.final && (pick.final || wager.group === pick.group);
}

function Wagers({ state, me, standings, gm, events, wagerEv, onEvents, onEvent, onPick, onVoid, onRetract, onPlayer, GameMark }) {
  const [settledOpen, setSettledOpen] = useState(null);
  const [denom, setDenom] = useState(PT);
  const resolved = useMemo(() => (state.wagers || []).map(w => ({ w, r:resolveWager(state, w, events) })),
    [state, events]);
  const pending = resolved.filter(x => x.r.status === "pending");
  const pendingLines = mergeWagerLines(pending);
  const settledLines = mergeWagerLines(resolved.filter(x => x.r.status !== "pending"));
  const settledByPlayer = useMemo(() => {
    const groups = new Map();
    for (const x of settledLines) {
      const group = groups.get(x.w.player) || { player:x.w.player, lines:[], net:0 };
      group.lines.push(x);
      group.net += x.r.delta || 0;
      groups.set(x.w.player, group);
    }
    return [...groups.values()].sort((a, b) => b.net - a.net || a.player.localeCompare(b.player));
  }, [settledLines]);
  const wagerRisk = me ? atRisk(state, me, events) : 0;
  const myPts = standings.find(row => row.player === me)?.pts ?? 0;
  const myCap = maxRisk(myPts);
  // Accepted duels, plus your own ante on a challenge still waiting for an answer.
  const duelAntes = me ? duelReserve(state, me) : 0;
  const myExp = wagerRisk + duelAntes;
  const room = me ? Math.max(0, Math.min(myCap - myExp, myPts - myExp)) : 0;
  useEffect(() => {
    if (denom > PT && room >= PT && denom > room)
      setDenom([...RACK_DENOMS].reverse().find(value => value <= room) || PT);
  }, [room, denom]);
  const tapStake = denom <= room ? denom : [...RACK_DENOMS].reverse().find(value => value <= room) || PT;
  const ev = wagerEv;
  const contest = ev ? resolveCurrentContest(state, ev) : null;
  const lifecycle = ev ? resolveEventLifecycle(state, ev) : null;
  const marketOpen = !!contest && contest.phase === "betting-open" && !!state.live
    && !state.frozen && !state.results?.[ev?.id] && !stacksPosted(state)
    && !(state.poker && !state.results?.[state.poker.id]);
  const ownSide = contest?.sides.find(side => side.players.includes(me));
  const restricted = !!ownSide && contest.kind !== "ffa";
  const contestNoun = contest?.kind === "match" ? "match" : contest?.kind === "heat" ? "heat" : "final";
  const restriction = restricted
    ? `You can only bet on ${ownSide.players.length > 1 ? "your team" : "yourself"} in this ${contestNoun}.`
    : null;
  const picks = (contest?.sides || []).map(side => {
    const own = side.players.includes(me);
    const drawnTeam = typeof side.key === "number" ? state.draws?.[ev.id]?.teams?.[side.key] : null;
    const name = side.players.length === 1 ? disp(state, side.players[0]) : teamLabel(state, drawnTeam || { players:side.players });
    const pick = contestPick(contest, side, ev);
    const eligible = !!me && contestBetEligibility(contest, me, side.key);
    return { key:side.key, state, me, players:side.players, name, marketOpen,
      onRetract:id => onRetract(id, { contestId:contest.id, contestRevision:contest.revision }),
      onPlayer, tapStake, bets:pending.filter(x => samePick(x.w, pick)),
      roleLabel:own ? side.players.length > 1 ? "Your team" : "Back yourself" : null,
      unavailableReason:restricted && !eligible ? restriction : null,
      canPick:marketOpen && room >= PT && eligible,
      onPick:() => onPick({ ...pick, stake:tapStake }) };
  });
  const status = marketOpen ? "Betting open" : contest?.phase === "awaiting-result"
    ? "Awaiting result" : !contest ? lifecycle?.label || "Betting locked" : "Betting locked";
  const contextLabel = contest?.kind === "match" || state.brackets?.[ev?.id] ? "Full bracket"
    : contest?.kind === "heat" || contest?.kind === "stage-final" || state.stages?.[ev?.id] ? "Heats and final" : "Event details";

  return <div className={`fd-wagers${me && marketOpen ? " has-rack" : ""}`}
    style={{ "--fd-wagers-numerals":DISPLAY, "--fd-wagers-body":SANS }}>
    {ev ? <header className="fd-wagers-event-heading">
      <div><h1>{ev.name}</h1>{GameMark && <GameMark id={ev.game} size={34} />}</div>
      <div className="fd-wagers-event-meta">
        <span className={`fd-wagers-status${marketOpen ? " is-open" : ""}`}>
          <i aria-hidden="true" />{status}
        </span>
        {marketOpen && <p>Tap + to add. Tap your chips to remove.</p>}
      </div>
    </header> : <PageHeading title="Bets" />}

    {!ev && <section className={`fd-wagers-waiting${state.frozen ? " is-finished" : ""}`}>
      <div className="fd-wagers-waiting-copy">
        <h2>{state.frozen ? "The board is frozen." : state.live ? "Between events" : "Betting opens with the first event"}</h2>
        {!state.frozen && <p>Betting opens when an event goes on deck.</p>}
        {!state.frozen && <ActionButton variant="secondary" onClick={onEvents}>Browse the events</ActionButton>}
      </div>
    </section>}

    {ev && <section className="fd-wagers-event">
      <div className="fd-wagers-contest-heading">
        <div><h2>{contest?.kind === "ffa" ? "Winner" : contest?.label || "Bets"}</h2>
          {contest && <p>{contest.kind === "ffa" ? "Pays 2 to 1" : "Winner pays even"}</p>}</div>
        {onEvent && <button type="button" className="fd-wagers-context" onClick={() => onEvent(ev)}>
          {contextLabel}<span aria-hidden="true">↗</span>
        </button>}
      </div>
      {contest && picks.length > 0 ? <section className={`fd-wagers-market fd-wagers-contest is-${contest.kind}`}
        aria-label={contest.label}>
        {restriction && <p className="fd-wagers-participant-note">{restriction}</p>}
        <div className="fd-wagers-picks">
          {picks.map(pick => <MarketPick {...pick} key={`${contest.id}:${pick.key}`} />)}
        </div>
      </section> : <p className="fd-wagers-contest-waiting">{state.results?.[ev.id] ? "Result posted." : "Waiting for the next contest."}</p>}
      {me && marketOpen && myPts - myExp < PT
        && <p className="fd-wagers-limit" role="status">No chips available.</p>}
    </section>}

    {pendingLines.length > 0 && <details className="fd-wagers-history" open={gm || !contest || undefined}>
      <summary>Open bets <span>{pendingLines.length}</span></summary>
      <div className="fd-wagers-ledger">{pendingLines.map(x =>
        <WagerLine key={x.w.id} x={x} state={state} events={events} gm={gm} onVoid={onVoid} onPlayer={onPlayer} />)}</div>
    </details>}

    {settledLines.length > 0 && <details className="fd-wagers-history">
      <summary>Settled <span>{settledLines.length}</span></summary>
      <div className="fd-wagers-settled-list">{settledByPlayer.map(group => {
        const key = `st:${group.player}`, open = settledOpen === key;
        return <div className={`fd-wagers-settled${open ? " is-open" : ""}`} key={group.player}>
          <div className="fd-wagers-settled-row"><button type="button" className="fd-wagers-settled-person" disabled={!onPlayer}
            onClick={() => onPlayer?.(group.player)} aria-label={`View ${disp(state, group.player)}'s player card`}>
            <Avatar state={state} p={group.player} size={32} />
            <strong>{disp(state, group.player)}</strong>
          </button><button type="button" className="fd-wagers-settled-toggle" aria-expanded={open}
            aria-label={`${open ? "Hide" : "View"} settled bets by ${disp(state, group.player)}`}
            onClick={() => setSettledOpen(current => current === key ? null : key)}>
            <small>{group.lines.length} bet{group.lines.length === 1 ? "" : "s"}</small>
            <span className={`fd-wagers-net${group.net > 0 ? " is-up" : group.net < 0 ? " is-down" : ""}`}>
              {group.net > 0 ? "+" : ""}{fmt(group.net)}</span>
            <span className="fd-wagers-settled-arrow" aria-hidden="true">{open ? "−" : "+"}</span>
          </button></div>
          {open && <div className="fd-wagers-settled-detail">{group.lines.map(x =>
            <WagerLine key={x.w.id} x={x} state={state} events={events} gm={gm} onVoid={onVoid} onPlayer={onPlayer} />)}</div>}
        </div>;
      })}</div>
    </details>}

    {/* One summary and one chip row keep the rack visible without covering
        the matchup. The meter expresses exposure against the actual cap. */}
    {me && ev && marketOpen && <section className="fd-wagers-rack fd-night" aria-label="Choose your betting chip">
      <div className="fd-wagers-rack-top"><span><strong>{fmt(room)}</strong> to bet</span>
        <span>{fmt(myExp)} / {fmt(myCap)} at risk</span></div>
      <div className="fd-wagers-meter" role="meter" aria-label="Chips at risk"
        aria-valuemin={0} aria-valuemax={Math.max(myCap, myExp)} aria-valuenow={myExp}
        aria-valuetext={`${fmt(myExp)} at risk, ${fmt(myCap)} maximum, ${fmt(myPts)} in your stack${duelAntes ? `, ${fmt(duelAntes)} reserved for duels` : ""}`}>
        <span style={{ width:`${myCap ? Math.min(100, myExp / myCap * 100) : 0}%` }} />
      </div>
      <div className="fd-wagers-denoms" role="group" aria-label="Chip value per tap">
        {RACK_DENOMS.map(value => {
          const affordable = value <= room;
          return <button type="button" key={value} disabled={!affordable} onClick={() => setDenom(value)}
            aria-pressed={tapStake === value && affordable} aria-label={`Bet ${value} a tap`}
            className={tapStake === value && affordable ? "is-selected" : ""}>
            <BankChip p={me} size={46} val={value} />
          </button>;
        })}
      </div>
      {duelAntes > 0 && <p className="fd-wagers-duel-reserve">Includes {fmt(duelAntes)} in duels</p>}
    </section>}
  </div>;
}

export { Wagers, wagerPickLabel, mergeWagerLines, RACK_DENOMS };
