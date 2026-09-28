import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  PT, OUTRIGHT_MULT, atRisk, disp, maxRisk, contestBetEligibility, contestMult, contestSideOf, wagerMult,
  resolveCurrentContest, duelReserve, resolveDuel, resolveEventLifecycle, resolveWager, stacksPosted, teamLabel,
} from "../../../shared/core.js";
import { DISPLAY, SANS } from "../../ui/theme.js";
import { ActionButton } from "../../ui/controls.jsx";
import { haptic, tapTick } from "../../lib/haptics.js";
import { PageHeading } from "../../ui/layout.jsx";
import { Avatar, BankChip } from "../identity/PlayerIdentity.jsx";
import { BracketPeek } from "../weekend/CompetitionBracket.jsx";
import { BetStacks, ChipStack } from "./BetStacks.jsx";
import { orderStacks, stacksTotal, settledStacks } from "./betStacks.js";
import { contestWinLines, winLineFor } from "../standings/winImpact.js";
import { WinLine } from "../standings/WinLine.jsx";
import "./wagers.css";

/* a phone stack's chip, px across: a 44px target still carries it */
const PHONE_CHIP = 28;

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
    w.kind === "outright" ? (w.pickTeam ? "t:" + w.drawId + ":" + (w.pickPlayers || []).join("+") : "p:" + w.pick) + ":x" + wagerMult(w)
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
/* A timed-out write may still have landed. The transport may say so
   explicitly (uncertain); older transports only report "No response". */
export const isUncertainResult = result => result?.ok !== true && (result?.uncertain === true
  || result?.status === "uncertain" || /no response/i.test(String(result?.error || "")));

function MarketPick({ state, me, players, name, bets, marketOpen, canPick, onPick, onRetract, onPlayer,
  roleLabel, unavailableReason, unavailableLabel = "Opponent", tapStake, capLabel, capReason, winLine }) {
  const [pendingAction, setPendingAction] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [checking, setChecking] = useState(null);
  const pendingRef = useRef(false);
  const mine = bets.filter(x => x.w.player === me).sort((a, b) => {
    const latest = ({ w }) => w.chips?.[w.chips.length - 1]?.ts || w.updatedAt || w.ts || 0;
    return latest(a) - latest(b);
  });
  const mineTotal = mine.reduce((total, x) => total + x.w.stake, 0);
  const live = useRef({ state, mineTotal });
  live.current = { state, mineTotal };
  const mineChips = mine.flatMap(({ w }) => w.chips?.length ? w.chips.map(chip => chip.stake) : [w.stake]);
  /* everyone else's chips on this side: one stack each, biggest first */
  const otherStacks = orderStacks(bets.filter(x => x.w.player !== me).map(({ w }) => ({ player:w.player, stake:w.stake })));
  const sideTotal = mineTotal + stacksTotal(otherStacks);
  const landed = (kind, before, total) => kind === "place" ? total > before : total < before;
  /* a chip landing or leaving answers any earlier error on this pick */
  const shownTotal = useRef(mineTotal);
  useEffect(() => {
    if (shownTotal.current === mineTotal) return;
    shownTotal.current = mineTotal;
    setActionError(null);
  }, [mineTotal]);
  /* Checking… holds the pick until the transport settles the write. Only a
     transport without a settled promise falls back to the next broadcast:
     the chip is there (done), or it is not (Not placed). */
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  useEffect(() => {
    if (!checking || checking.settled || state === checking.state) return;
    if (!landed(checking.kind, checking.before, mineTotal))
      setActionError(checking.kind === "place" ? "Not placed" : "Not removed");
    pendingRef.current = false;
    setChecking(null);
  }, [state, mineTotal, checking]);
  const act = (kind, callback) => {
    if (pendingRef.current) return;
    /* the iOS tick belongs to the tap itself, before any await */
    tapTick();
    pendingRef.current = true;
    const before = mineTotal;
    setPendingAction(kind);
    setActionError(null);
    let holding = false;
    const finish = () => { if (!holding) pendingRef.current = false; setPendingAction(null); };
    const check = result => {
      if (isUncertainResult(result)) {
        if (!landed(kind, before, live.current.mineTotal)) {
          holding = true;
          const settled = typeof result?.settled?.then === "function";
          setChecking({ kind, before, state:live.current.state, settled });
          if (settled) result.settled.then(outcome => outcome, () => ({ ok:false })).then(outcome => {
            if (!alive.current) return;
            if (outcome?.ok === true) haptic(kind === "place" ? "place" : "retract");
            else if (!landed(kind, before, live.current.mineTotal))
              setActionError(kind === "place" ? "Not placed" : "Not removed");
            pendingRef.current = false;
            setChecking(null);
          });
        }
        return result;
      }
      if (result?.ok === false) setActionError(result.error || "Bet not saved.");
      else if (result?.ok === true) haptic(kind === "place" ? "place" : "retract");
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
      const checked = check(result);
      finish();
      return checked;
    } catch (error) { finish(); return fail(error); }
  };
  const stack = mineTotal > 0 && <ChipStack p={me} stake={mineTotal} size={PHONE_CHIP} mine groups={mineChips} />;
  const busyKind = pendingAction || checking?.kind || null;
  return <div className={`fd-wagers-pick${mineTotal ? " is-mine" : ""}${roleLabel ? " is-your-side" : ""}${unavailableReason ? " is-unavailable" : ""}${busyKind ? ` is-pending-${busyKind}` : ""}`}>
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
    <WinLine line={winLine} className="fd-wagers-win" />
    {/* the felt: the well places a chip, your stack (sun ring) takes the
        last one back, anyone else's stack opens their card; the side's
        total sits at its head */}
    <div className="fd-wagers-felt" role="group" aria-label={`Bets on ${name}`} aria-busy={!!busyKind}>
      {sideTotal > 0 && <span className="fd-wagers-felt-total">{fmt(sideTotal)}</span>}
      <div className="fd-wagers-felt-stacks">
        <button type="button" className={`fd-wagers-pick-main${capLabel ? " is-capped" : ""}`} disabled={!canPick || !!busyKind}
          onClick={() => act("place", onPick)} aria-label={canPick ? `Place a chip on ${name}` : name}
          aria-description={unavailableReason || capReason || (canPick ? `Add ${fmt(tapStake)} chips` : undefined)}>
          {unavailableReason ? <span className="fd-wagers-pick-closed">{unavailableLabel}</span> : marketOpen && players.length > 0 ? <>
            <span className="fd-wagers-chip-well" aria-hidden="true">+</span>
            <span className="fd-wagers-pick-add">{capLabel || fmt(tapStake)}</span>
          </> : <span className="fd-wagers-pick-closed">{players.length ? "Locked" : "Pending"}</span>}
        </button>
        {mineTotal > 0 && (marketOpen ? <button type="button" className="fd-wagers-retract" disabled={!!busyKind}
          onClick={() => act("remove", () => onRetract(mine[mine.length - 1].w.id))}
          aria-label={`Retract your last chip on ${name}`}
          aria-description={`Remove ${fmt(mineChips[mineChips.length - 1])} chips; ${fmt(mineTotal)} total on this pick`}>
          {stack}
        </button> : <div className="fd-wagers-owned-stack" role="img" aria-label={`${fmt(mineTotal)} of your chips on ${name}`}>{stack}</div>)}
        {otherStacks.map(item => <button type="button" key={item.player} className="fd-wagers-other" disabled={!onPlayer}
          onClick={() => onPlayer?.(item.player)} title={disp(state, item.player)}
          aria-label={`View ${disp(state, item.player)}'s player card (${fmt(item.stake)} chips)`}>
          <ChipStack p={item.player} stake={item.stake} size={PHONE_CHIP} />
        </button>)}
      </div>
    </div>
    {checking && <p className="fd-wagers-pick-checking" role="status">Checking…</p>}
    {actionError && !checking && <p className="fd-wagers-pick-error" role="alert">{actionError}</p>}
  </div>;
}

/* A decided contest settles on the board the phone was showing: winners'
   stacks grow by their payout, the rest slide back to the bank. */
const SETTLE_SHOW_MS = 4600;
function SettleStrip({ me, settling }) {
  const { view, label } = settling;
  return <section className="fd-wagers-settle" role="status"
    aria-label={`${label} settled: ${fmt(view.paid)} paid, ${fmt(view.lost)} lost`}>
    <h2>{label}</h2>
    <div className="fd-wagers-settle-row" aria-hidden="true">
      {view.winners.length > 0 && <div className="fd-wagers-settle-zone is-won">
        <strong>+{fmt(view.paid)}</strong>
        <BetStacks stacks={view.winners} size={24} delay={900} mine={me} />
      </div>}
      {view.losers.length > 0 && <div className="fd-wagers-settle-zone is-lost">
        <strong>−{fmt(view.lost)}</strong>
        <BetStacks stacks={view.losers} size={24} delay={450} mine={me} />
      </div>}
    </div>
  </section>;
}

/* The bar is the whole stack, the notch is the cap, gold is what your bets
   hold, hatching is what duels hold, and the gap to the notch is what is left
   to bet. Anything past the notch (after a correction) is drawn as a loss. */
function StackMeter({ pts, cap, bets, duels, room }) {
  const exposure = bets + duels;
  const scale = Math.max(pts, exposure, cap, 1);
  const at = value => Math.max(0, Math.min(100, value / scale * 100));
  const pct = value => `${at(value)}%`;
  const betsIn = Math.min(bets, cap), duelsIn = Math.min(duels, Math.max(0, cap - betsIn));
  const over = Math.max(0, exposure - cap);
  const capped = room < PT && pts - exposure >= PT;
  const gapMid = Math.min(92, Math.max(8, (at(Math.min(exposure, cap)) + at(Math.min(cap, pts))) / 2));
  return <div className={`fd-wagers-meter${capped ? " is-capped" : ""}${over ? " is-over" : ""}`} role="meter"
    aria-label="Chips at risk" aria-valuemin={0} aria-valuemax={Math.max(cap, exposure)} aria-valuenow={exposure}
    aria-valuetext={`${fmt(exposure)} at risk, ${fmt(cap)} maximum, ${fmt(pts)} in your stack${duels ? `, ${fmt(duels)} reserved for duels` : ""}`}>
    <div className="fd-wagers-meter-top" aria-hidden="true">
      <strong style={{ left:capped ? `${Math.min(92, Math.max(8, at(cap)))}%` : `${gapMid}%` }}>{fmt(room)}</strong>
    </div>
    <div className="fd-wagers-meter-bar" aria-hidden="true">
      {betsIn > 0 && <span className="is-bets" style={{ left:0, width:pct(betsIn) }} />}
      {duelsIn > 0 && <span className="is-duels" style={{ left:pct(betsIn), width:pct(duelsIn) }} />}
      {over > 0 && <span className="is-over" style={{ left:pct(cap), width:pct(over) }} />}
      <i className="fd-wagers-meter-notch" style={{ left:pct(cap) }} />
    </div>
    <div className="fd-wagers-meter-scale" aria-hidden="true">
      {exposure > 0 && <span className="is-exposure">{fmt(exposure)}</span>}
      <span className="is-cap" style={{ left:`${Math.min(92, Math.max(8, at(cap)))}%` }}>{fmt(cap)}</span>
      {at(cap) <= 72 && <span className="is-stack">{fmt(pts)}</span>}
    </div>
  </div>;
}

function WagerLine({ x, state, events, gm, manage = false, onVoid, onPlayer }) {
  const { w, r } = x;
  const label = wagerPickLabel(state, w, events);
  const win = wagerMult(w) * w.stake;
  const [confirming, setConfirming] = useState(false), [voiding, setVoiding] = useState(false);
  const voidBusy = useRef(false);
  const ids = w.ids || [w.id];
  const voidable = gm && manage && r.status === "pending" && !!onVoid;
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
      {voidable && !confirming && <button type="button" className="fd-wagers-void"
        onClick={() => setConfirming(true)}>Void</button>}
    </div>
    {voidable && confirming && <div className="fd-wagers-void-confirm" role="group" aria-label="Confirm void">
      <span>{disp(state, w.player)}, {ids.length} bet{ids.length === 1 ? "" : "s"}, {fmt(w.stake)} chips back</span>
      <button type="button" className="is-commit" disabled={voiding} onClick={async () => {
        if (voidBusy.current) return undefined;
        voidBusy.current = true; setVoiding(true);
        try {
          const result = await onVoid(ids);
          if (result?.ok !== false) setConfirming(false);
          return result;
        } finally { voidBusy.current = false; setVoiding(false); }
      }}>{voiding ? "Voiding…" : `Void ${ids.length === 1 ? "bet" : `${ids.length} bets`}`}</button>
      <button type="button" disabled={voiding} onClick={() => setConfirming(false)}>Keep</button>
    </div>}
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

function Wagers({ state, me, standings, gm, events, wagerEv, onEvents, onEvent, onPick, onVoid, onRetract, onPlayer, GameMark,
  openSettled = false, onSettledSeen }) {
  const [settledOpen, setSettledOpen] = useState(() => openSettled && me ? `st:${me}` : null);
  const [settledShown, setSettledShown] = useState(!!openSettled);
  const settledRef = useRef(null);
  useEffect(() => {
    if (!openSettled) return;
    setSettledShown(true);
    if (me) setSettledOpen(`st:${me}`);
    settledRef.current?.scrollIntoView?.({ block:"start" });
    onSettledSeen?.();
  }, [openSettled]); // eslint-disable-line
  const [denom, setDenom] = useState(PT);
  /* per-bet Void sits behind the commissioner's Manage toggle */
  const [manage, setManage] = useState(false);
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
  /* the cap (not the balance) is what stops the next chip */
  const capBinds = !!me && room < PT && myPts - myExp >= PT;
  useEffect(() => {
    if (denom > PT && room >= PT && denom > room)
      setDenom([...RACK_DENOMS].reverse().find(value => value <= room) || PT);
  }, [room, denom]);
  const tapStake = denom <= room ? denom : [...RACK_DENOMS].reverse().find(value => value <= room) || PT;
  const ev = wagerEv;
  /* once the table is dealt, or its counts post, nothing takes a bet again */
  const finaleClosed = stacksPosted(state) || !!(state.poker && !state.results?.[state.poker.id]);
  const contest = ev ? resolveCurrentContest(state, ev) : null;
  const lifecycle = ev ? resolveEventLifecycle(state, ev) : null;
  const marketOpen = !!contest && contest.phase === "betting-open" && !!state.live
    && !state.frozen && !state.results?.[ev?.id] && !stacksPosted(state)
    && !(state.poker && !state.results?.[state.poker.id]);
  const ownSide = contest?.sides.find(side => side.players.includes(me));
  /* a two-sided contest is a matchup whatever its format: even money, own side only */
  const evenMoney = contestMult(contest) === 1;
  const restricted = !!ownSide && evenMoney;
  const contestNoun = contest?.kind === "match" || contest?.kind === "ffa" ? "match" : contest?.kind === "heat" ? "heat" : "final";
  const restriction = restricted
    ? `You can only bet on ${ownSide.players.length > 1 ? "your team" : "yourself"} in this ${contestNoun}.`
    : null;
  /* one side per contest: chips already down fix which side the rest can join */
  const heldSide = me && contest ? contestSideOf(state, contest, me, events) : null;
  /* X8: what each side's win does to the standings */
  const winLines = useMemo(() => contest && ev ? contestWinLines(state, ev, contest, { events }) : [],
    [state, ev?.id, contest?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const picks = (contest?.sides || []).map(side => {
    const own = side.players.includes(me);
    const drawnTeam = typeof side.key === "number" ? state.draws?.[ev.id]?.teams?.[side.key] : null;
    const name = side.players.length === 1 ? disp(state, side.players[0]) : teamLabel(state, drawnTeam || { players:side.players });
    const pick = contestPick(contest, side, ev);
    const eligible = !!me && contestBetEligibility(contest, me, side.key);
    const otherSide = eligible && heldSide !== null && heldSide !== side.key;
    return { key:side.key, state, me, players:side.players, name, marketOpen,
      onRetract:id => onRetract(id, { contestId:contest.id, contestRevision:contest.revision }),
      onPlayer, tapStake, bets:pending.filter(x => samePick(x.w, pick)), winLine:winLineFor(winLines, side.key),
      roleLabel:own ? side.players.length > 1 ? "Your team" : "Back yourself" : null,
      unavailableReason:restricted && !eligible ? restriction
        : otherSide && marketOpen ? "One side per contest. Your chips are on the other side." : null,
      unavailableLabel:restricted && !eligible ? "Opponent" : "Other side",
      canPick:marketOpen && room >= PT && eligible && !otherSide,
      capLabel:marketOpen && eligible && !otherSide && capBinds ? `Max ${fmt(myCap)}` : null,
      capReason:marketOpen && eligible && !otherSide && capBinds ? `At your ${fmt(myCap)} limit` : null,
      onPick:() => onPick({ ...pick, stake:tapStake }) };
  });
  /* free-for-all: your own name leads the board */
  if (contest?.kind === "ffa") picks.sort((a, b) => Number(!!b.roleLabel) - Number(!!a.roleLabel));
  const status = marketOpen ? "Betting open" : contest?.phase === "awaiting-result"
    ? "Awaiting result" : !contest ? lifecycle?.label || "Betting locked" : "Betting locked";
  /* a live bracket game shows the bracket itself, which replaces the link */
  /* the contest this board was showing, so its chips can visibly settle
     when it is decided: derived from resolveWager, held only while shown */
  const watched = useRef(null);
  const [settling, setSettling] = useState(null);
  useEffect(() => {
    const prev = watched.current;
    watched.current = contest ? { contest, label:contest.kind === "ffa" ? ev?.name || "Winner" : contest.label } : null;
    if (!prev || prev.contest.id === contest?.id) return;
    const view = settledStacks(state, events, prev.contest);
    if (view.any) setSettling({ id:prev.contest.id, label:prev.label, view });
  }, [contest?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!settling) return undefined;
    const timer = setTimeout(() => setSettling(null), SETTLE_SHOW_MS);
    return () => clearTimeout(timer);
  }, [settling?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const peek = !!onEvent && !!ev && !state.results?.[ev.id] && !!state.brackets?.[ev.id] && !!state.draws?.[ev.id];
  const contextLabel = contest?.kind === "match" || state.brackets?.[ev?.id] ? "Full bracket"
    : contest?.kind === "heat" || contest?.kind === "stage-final" || state.stages?.[ev?.id] ? "Heats and final" : "Event details";

  return <div className={`fd-wagers${me && marketOpen ? " has-rack" : ""}`}
    style={{ "--fd-wagers-numerals":DISPLAY, "--fd-wagers-body":SANS }}>
    {ev ? <header className="fd-wagers-event-heading">
      <div><h1>{ev.name}</h1>{GameMark && <GameMark id={ev.game} size={34} />}</div>
      <div className="fd-wagers-event-meta">
        <span className={`fd-wagers-status${marketOpen ? " is-open" : ""}`}>
          <i className={marketOpen ? "fd-beat-dot" : undefined} aria-hidden="true" />{status}
        </span>
      </div>
    </header> : <PageHeading title="Bets" />}

    {settling && <SettleStrip key={settling.id} me={me} settling={settling} />}

    {!ev && <section className={`fd-wagers-waiting${state.frozen || finaleClosed ? " is-finished" : ""}`}>
      <div className="fd-wagers-waiting-copy">
        <h2>{state.frozen ? "The board is frozen." : finaleClosed ? "Betting is closed for the finale"
          : state.live ? "Between events" : "Betting opens with the first event"}</h2>
        {!state.frozen && !finaleClosed && <ActionButton variant="secondary" onClick={onEvents}>Browse the events</ActionButton>}
      </div>
    </section>}

    {ev && <section className="fd-wagers-event">
      <div className="fd-wagers-contest-heading">
        <div><h2>{contest?.kind === "ffa" ? "Winner" : contest?.label || "Bets"}</h2>
          {contest && <p>{evenMoney ? "Winner pays 1:1" : "Winner pays 2:1"}</p>}</div>
        {onEvent && !peek && <button type="button" className="fd-wagers-context" onClick={() => onEvent(ev)}>
          {contextLabel}<span aria-hidden="true">↗</span>
        </button>}
      </div>
      {contest && picks.length > 0 ? <section className={`fd-wagers-market fd-wagers-contest is-${contest.kind}`}
        aria-label={contest.label}>
        <div className="fd-wagers-picks">
          {picks.map(pick => <MarketPick {...pick} key={`${contest.id}:${pick.key}`} />)}
        </div>
      </section> : <p className="fd-wagers-contest-waiting">{state.results?.[ev.id] ? "Result posted." : "Waiting for the next contest."}</p>}
      {me && marketOpen && myPts - myExp < PT
        && <p className="fd-wagers-limit" role="status">No chips available.</p>}
      {peek && <BracketPeek state={state} ev={ev} me={me} onOpen={onEvent} card />}
    </section>}

    {pendingLines.length > 0 && <details className="fd-wagers-history" open={!contest || undefined}>
      <summary>Open bets <span>{pendingLines.length}</span></summary>
      {gm && onVoid && <button type="button" className="fd-wagers-manage" aria-pressed={manage}
        onClick={() => setManage(value => !value)}>{manage ? "Done" : "Manage"}</button>}
      <div className="fd-wagers-ledger">{pendingLines.map(x =>
        <WagerLine key={x.w.id} x={x} state={state} events={events} gm={gm} manage={manage} onVoid={onVoid} onPlayer={onPlayer} />)}</div>
    </details>}

    {settledLines.length > 0 && <details className="fd-wagers-history" ref={settledRef} open={settledShown}
      onToggle={event => setSettledShown(event.currentTarget.open)}>
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
      <StackMeter pts={myPts} cap={myCap} bets={wagerRisk} duels={duelAntes} room={room} />
      <div className="fd-wagers-denoms" role="group" aria-label="Chip value per tap">
        {RACK_DENOMS.map(value => {
          const affordable = value <= room;
          return <button type="button" key={value} disabled={!affordable} onClick={() => { tapTick(); setDenom(value); }}
            aria-pressed={tapStake === value && affordable} aria-label={`Bet ${value} a tap`}
            className={tapStake === value && affordable ? "is-selected" : ""}>
            <BankChip p={me} size={46} val={value} />
          </button>;
        })}
      </div>
    </section>}
  </div>;
}

export { Wagers, wagerPickLabel, mergeWagerLines, RACK_DENOMS };
