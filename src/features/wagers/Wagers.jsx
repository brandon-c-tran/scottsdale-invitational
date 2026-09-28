import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { BetStacks, ChipStack, StackGroup } from "./BetStacks.jsx";
import {
  STACK_CAP, decidedContest, faceRect, groupStacks, hoverRect, orderStacks, rackTargetFor,
  stackChipCount, stacksTotal, settledStacks,
} from "./betStacks.js";
import { EASE, MOTION, fly, flightTarget, prefersReducedMotion, useFlightTarget, useFreshChange, useMotionFrame } from "../../lib/motion.js";
import { contestWinLines, winLineFor } from "../standings/winImpact.js";
import { WinLine } from "../standings/WinLine.jsx";
import "./wagers.css";

/* a phone stack's chip, px across: a 44px target still carries it */
const PHONE_CHIP = 28;
/* a phone felt holds two rows of three: the well, your stack, the rest */
const PHONE_SLOTS = 6;

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
  /* M4: the chip in the air for the write in flight (presentation only) */
  const wellRef = useRef(null), mineRef = useRef(null), flightRef = useRef(null);
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
  useEffect(() => () => { alive.current = false; flightRef.current?.cancel(); }, []);
  useEffect(() => {
    if (!checking || checking.settled || state === checking.state) return;
    if (!landed(checking.kind, checking.before, mineTotal)) {
      setActionError(checking.kind === "place" ? "Not placed" : "Not removed");
      checking.flight?.back();
    } else checking.flight?.land();
    pendingRef.current = false;
    setChecking(null);
  }, [state, mineTotal, checking]);
  /* your stack's drawing, or null before your first chip lands */
  const mineFace = () => mineRef.current?.querySelector(".fd-stack > svg")?.getBoundingClientRect() || null;
  /* M4: the rack's chip lifts and arcs to hover over your stack (or the
     well, before your first chip); the write's answer lands it or flies it
     home. Never gates the write: a skipped flight is just no flight. */
  const placeFlight = () => {
    if (!me || typeof document === "undefined" || prefersReducedMotion()) return null;
    const source = flightTarget(`bets:rack:${tapStake}`);
    const face = mineFace();
    const anchor = face || wellRef.current?.querySelector(".fd-wagers-chip-well")?.getBoundingClientRect();
    if (!source || !anchor) return null;
    let release = () => {};
    const hold = new Promise(resolve => { release = resolve; });
    try { source.animate([{ transform:"scale(1)" }, { transform:"scale(.9)" }, { transform:"scale(1)" }],
      { duration:MOTION.fast * 2, easing:EASE.out }); } catch {}
    fly(source, hoverRect(anchor, PHONE_CHIP, face ? 10 : 6), { node:<BankChip p={me} size={46} val={tapStake} />,
      arc:64, hold });
    let settled = false;
    const finish = next => { if (!settled) { settled = true; release(next); } };
    return {
      /* the state is already painted when the ack lands; wait one frame so
         the new stack is measured, then drop onto it */
      land:() => requestAnimationFrame(() => {
        const now = mineFace();
        if (!now) { finish(null); return; }
        finish(face ? { to:faceRect(now), duration:MOTION.fast, fade:true }
          : { to:mineRef.current, duration:MOTION.fast * 1.5, land:true });
      }),
      back:() => finish({ to:flightTarget(`bets:rack:${tapStake}`) || source, arc:40, duration:MOTION.flight }),
      cancel:() => finish(null),
    };
  };
  /* retract: your last chip leaves the top of your stack for its rack slot */
  const retractFlight = () => {
    if (!me || typeof document === "undefined" || prefersReducedMotion()) return null;
    const face = mineFace();
    if (!face) return null;
    const value = mineChips[mineChips.length - 1];
    const from = faceRect(face);
    return {
      land:() => {
        const to = flightTarget(rackTargetFor(value, RACK_DENOMS, tapStake));
        if (to) fly(from, to, { node:<BankChip p={me} size={Math.round(from.width)} val={value} />, arc:48, land:true });
      },
      back:() => {}, cancel:() => {},
    };
  };
  const act = (kind, callback) => {
    if (pendingRef.current) return;
    /* the iOS tick belongs to the tap itself, before any await */
    tapTick();
    pendingRef.current = true;
    const before = mineTotal;
    setPendingAction(kind);
    setActionError(null);
    const flight = kind === "place" ? placeFlight() : retractFlight();
    flightRef.current = flight;
    let holding = false;
    const finish = () => { if (!holding) pendingRef.current = false; setPendingAction(null); };
    const check = result => {
      if (isUncertainResult(result)) {
        if (!landed(kind, before, live.current.mineTotal)) {
          holding = true;
          const settled = typeof result?.settled?.then === "function";
          setChecking({ kind, before, state:live.current.state, settled, flight });
          if (settled) result.settled.then(outcome => outcome, () => ({ ok:false })).then(outcome => {
            if (!alive.current) return;
            if (outcome?.ok === true) { haptic(kind === "place" ? "place" : "retract"); flight?.land(); }
            else if (!landed(kind, before, live.current.mineTotal)) {
              setActionError(kind === "place" ? "Not placed" : "Not removed");
              flight?.back();
            } else flight?.land();
            pendingRef.current = false;
            setChecking(null);
          });
        } else flight?.land();
        return result;
      }
      if (result?.ok === false) { setActionError(result.error || "Bet not saved."); flight?.back(); }
      else if (result?.ok === true) { haptic(kind === "place" ? "place" : "retract"); flight?.land(); }
      else flight?.cancel();
      return result;
    };
    const fail = error => {
      const message = error?.message || "Bet not saved.";
      setActionError(message);
      flight?.back();
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
  /* P1: two rows at most (well, yours, then the biggest); the smallest
     bettors fold into one "+N" pile. The ledger still lists every bet. */
  const { shown:othersShown, rest:othersRest } = groupStacks(otherStacks, PHONE_SLOTS - 1 - (mineTotal > 0 ? 1 : 0));
  const tagged = !!othersRest || stackChipCount(mineTotal) > STACK_CAP || othersShown.some(item => item.capped);
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
      <div className={`fd-wagers-felt-stacks${tagged ? " has-tag" : ""}`}>
        <button type="button" ref={wellRef} className={`fd-wagers-pick-main${capLabel ? " is-capped" : ""}`} disabled={!canPick || !!busyKind}
          onClick={() => act("place", onPick)} aria-label={canPick ? `Place a chip on ${name}` : name}
          aria-description={unavailableReason || capReason || (canPick ? `Add ${fmt(tapStake)} chips` : undefined)}>
          {unavailableReason ? <span className="fd-wagers-pick-closed">{unavailableLabel}</span> : marketOpen && players.length > 0 ? <>
            <span className="fd-wagers-chip-well" aria-hidden="true">+</span>
            <span className="fd-wagers-pick-add">{capLabel || fmt(tapStake)}</span>
          </> : <span className="fd-wagers-pick-closed">{players.length ? "Locked" : "Pending"}</span>}
        </button>
        {mineTotal > 0 && (marketOpen ? <button type="button" ref={mineRef} className="fd-wagers-retract" disabled={!!busyKind}
          onClick={() => act("remove", () => onRetract(mine[mine.length - 1].w.id))}
          aria-label={`Retract your last chip on ${name}`}
          aria-description={`Remove ${fmt(mineChips[mineChips.length - 1])} chips; ${fmt(mineTotal)} total on this pick`}>
          {stack}
        </button> : <div ref={mineRef} className="fd-wagers-owned-stack" role="img" aria-label={`${fmt(mineTotal)} of your chips on ${name}`}>{stack}</div>)}
        {othersShown.map(item => <button type="button" key={item.player} className="fd-wagers-other" disabled={!onPlayer}
          onClick={() => onPlayer?.(item.player)} title={disp(state, item.player)}
          aria-label={`View ${disp(state, item.player)}'s player card (${fmt(item.stake)} chips)`}>
          <ChipStack p={item.player} stake={item.stake} size={PHONE_CHIP} />
        </button>)}
        {othersRest && <StackGroup rest={othersRest} size={PHONE_CHIP} />}
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

/* A rack chip is also where a flying chip leaves from and comes home to. */
function RackChip({ value, me, disabled, selected, onClick }) {
  const target = useFlightTarget(`bets:rack:${value}`);
  return <button type="button" ref={target} disabled={disabled} onClick={onClick}
    aria-pressed={selected} aria-label={`Bet ${value} a tap`} className={selected ? "is-selected" : ""}>
    <BankChip p={me} size={46} val={value} />
  </button>;
}

/* M5: the decided contest, held on the board it was bet on. WON stamps on
   the winning side, the losing stacks go back to the bank, the winners'
   stacks grow by their payout, and your own winnings fly to Home. A tap
   anywhere on it deals the next contest in. */
const HOME_FLIGHT_AT = 1300;
function HeldBoard({ state, me, held, view, onSkip }) {
  const mineRef = useRef(null);
  const paid = (view.sides.find(side => side.won)?.stacks || [])
    .filter(item => item.player === me).reduce((sum, item) => sum + item.paid, 0);
  useEffect(() => {
    if (!me || paid <= 0) return undefined;
    const timer = setTimeout(() => {
      const svg = mineRef.current?.querySelector(".fd-stack > svg");
      if (!svg) return;
      const from = faceRect(svg.getBoundingClientRect());
      const count = Math.max(1, Math.min(5, Math.round(paid / PT)));
      for (let i = 0; i < count; i++) fly(from, "tab:home", { node:<BankChip p={me} size={Math.round(from.width)} val={PT} />,
        delay:i * 70, arc:60, duration:560, scale:0.7, fade:true, land:i === count - 1 });
    }, HOME_FLIGHT_AT);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const { contest, ev, label } = held;
  const sides = contest.kind === "ffa" ? view.sides.filter(side => side.won || side.stacks.length) : view.sides;
  const nameOf = side => {
    const drawn = typeof side.key === "number" ? state.draws?.[ev.id]?.teams?.[side.key] : null;
    return side.players.length === 1 ? disp(state, side.players[0]) : teamLabel(state, drawn || { players:side.players });
  };
  return <section className="fd-wagers-event fd-wagers-held" onClick={onSkip} aria-label={`${label} settled`}>
    <div className="fd-wagers-contest-heading">
      <div><h2>{contest.kind === "ffa" ? "Winner" : label}</h2>
        <p>{contestMult(contest) === 1 ? "Winner pays 1:1" : "Winner pays 2:1"}</p></div>
    </div>
    <div className="fd-wagers-picks">{sides.map(side => {
      const { shown, rest } = groupStacks(side.stacks, PHONE_SLOTS);
      const head = side.won ? side.paid > 0 && <span className="fd-wagers-held-head is-up">+{fmt(side.paid)}</span>
        : side.total > 0 && <span className="fd-wagers-held-head is-down">−{fmt(side.total)}</span>;
      return <div key={String(side.key)} className={`fd-wagers-pick fd-wagers-held-side ${side.won ? "is-won" : "is-lost"}`}>
        <div className="fd-wagers-pick-identity">
          {side.players.length === 1 ? <span className="fd-wagers-player">
            <Avatar state={state} p={side.players[0]} size={26} /><span>{nameOf(side)}</span>
          </span> : <>
            {side.players.length > 2 && <span className="fd-wagers-team-name">{nameOf(side)}</span>}
            <span className="fd-wagers-team-players">{side.players.map(player => <span key={player} className="fd-wagers-held-face">
              <Avatar state={state} p={player} size={24} /><span>{disp(state, player)}</span>
            </span>)}</span>
          </>}
        </div>
        <div className="fd-wagers-felt">
          {head}
          {side.won && <span className="fd-wagers-won" aria-label="Won">WON</span>}
          <div className={`fd-wagers-felt-stacks${head || side.won ? " has-head" : ""}`}>
            {shown.map((item, index) => side.won
              ? <span key={item.player} className="fd-wagers-held-stack" ref={item.player === me ? mineRef : undefined}>
                <ChipStack p={item.player} stake={item.stake} paid={item.paid} size={PHONE_CHIP} settle="won"
                  delay={500 + index * 90} mine={item.player === me} />
              </span>
              : <span key={item.player} className="fd-wagers-held-stack fd-stacks-slot is-lost"
                style={{ animationDelay:`${200 + index * 90}ms` }}>
                <ChipStack p={item.player} stake={item.stake} size={PHONE_CHIP} mine={item.player === me} />
              </span>)}
            {rest && <StackGroup rest={rest} size={PHONE_CHIP} />}
          </div>
        </div>
      </div>;
    })}</div>
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
  /* M5: the contest this board was showing, so it can settle in place when
     it is decided. Only a fresh decision plays (never a first load, a
     reconnect, or a correction): the board holds the decided contest for
     MOTION.settleHold, then the next one deals in. With reduced motion the
     next contest shows at once and the settle strip carries the result.
     Everything shown is derived from the latest state through resolveWager;
     the hold never delays or blocks the state underneath. */
  const boardKey = ev ? `${ev.id}:${contest?.id || ""}` : "";
  const boardChange = useFreshChange(boardKey);
  const frame = useMotionFrame();
  const watched = useRef(null);
  const [settling, setSettling] = useState(null);
  const [held, setHeld] = useState(null);
  const [dealing, setDealing] = useState(0);
  useLayoutEffect(() => {
    const prev = watched.current;
    watched.current = ev && contest ? { ev, contest, label:contest.kind === "ffa" ? ev.name || "Winner" : contest.label } : null;
    if (!boardChange.fresh || !prev || prev.contest.id === contest?.id) return;
    const decided = decidedContest(state, events, prev.ev.id, prev.contest);
    if (!decided) return;
    if (boardChange.animate) { setSettling(null); setHeld({ id:`${prev.contest.id}:${boardChange.changeId}`, ...prev }); return; }
    const view = settledStacks(state, events, prev.contest);
    if (view.any) setSettling({ id:prev.contest.id, label:prev.label, view });
  }, [boardKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const heldView = held ? decidedContest(state, events, held.ev.id, held.contest) : null;
  const endHold = () => { setHeld(null); setDealing(value => value + 1); };
  useEffect(() => {
    if (!held) return undefined;
    const timer = setTimeout(endHold, MOTION.settleHold);
    return () => clearTimeout(timer);
  }, [held?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  /* a rewind (Undo, a correction) ends the hold on the corrected board */
  useEffect(() => {
    if (held && (!heldView || frame.correction)) setHeld(null);
  }, [held?.id, !!heldView, frame.seq]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!dealing) return undefined;
    const timer = setTimeout(() => setDealing(0), MOTION.story + 200);
    return () => clearTimeout(timer);
  }, [dealing]);
  useEffect(() => {
    if (!settling) return undefined;
    const timer = setTimeout(() => setSettling(null), SETTLE_SHOW_MS);
    return () => clearTimeout(timer);
  }, [settling?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const peek = !!onEvent && !!ev && !state.results?.[ev.id] && !!state.brackets?.[ev.id] && !!state.draws?.[ev.id];
  const contextLabel = contest?.kind === "match" || state.brackets?.[ev?.id] ? "Full bracket"
    : contest?.kind === "heat" || contest?.kind === "stage-final" || state.stages?.[ev?.id] ? "Heats and final" : "Event details";

  const holding = !!(held && heldView);
  const headEv = holding ? held.ev : ev;
  const liveDot = marketOpen && !holding;
  return <div className={`fd-wagers${me && marketOpen ? " has-rack" : ""}`}
    style={{ "--fd-wagers-numerals":DISPLAY, "--fd-wagers-body":SANS }}>
    {headEv ? <header className="fd-wagers-event-heading">
      <div><h1>{headEv.name}</h1>{GameMark && <GameMark id={headEv.game} size={34} />}</div>
      <div className="fd-wagers-event-meta">
        <span className={`fd-wagers-status${liveDot ? " is-open" : ""}`}>
          <i className={liveDot ? "fd-beat-dot" : undefined} aria-hidden="true" />{holding ? "Settled" : status}
        </span>
      </div>
    </header> : <PageHeading title="Bets" />}

    {settling && <SettleStrip key={settling.id} me={me} settling={settling} />}

    {holding && <HeldBoard key={held.id} state={state} me={me} held={held} view={heldView} onSkip={endHold} />}

    {!ev && !holding && <section className={`fd-wagers-waiting${state.frozen || finaleClosed ? " is-finished" : ""}`}>
      <div className="fd-wagers-waiting-copy">
        <h2>{state.frozen ? "The board is frozen." : finaleClosed ? "Betting is closed for the finale"
          : state.live ? "Between events" : "Betting opens with the first event"}</h2>
        {!state.frozen && !finaleClosed && <ActionButton variant="secondary" onClick={onEvents}>Browse the events</ActionButton>}
      </div>
    </section>}

    {ev && !holding && <section className="fd-wagers-event">
      <div className="fd-wagers-contest-heading">
        <div><h2>{contest?.kind === "ffa" ? "Winner" : contest?.label || "Bets"}</h2>
          {contest && <p>{evenMoney ? "Winner pays 1:1" : "Winner pays 2:1"}</p>}</div>
        {onEvent && !peek && <button type="button" className="fd-wagers-context" onClick={() => onEvent(ev)}>
          {contextLabel}<span aria-hidden="true">↗</span>
        </button>}
      </div>
      {contest && picks.length > 0 ? <section className={`fd-wagers-market fd-wagers-contest is-${contest.kind}${dealing ? " is-dealing" : ""}`}
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
    {me && ev && marketOpen && !holding && <section className={`fd-wagers-rack fd-night${dealing ? " is-dealing" : ""}`} aria-label="Choose your betting chip">
      <StackMeter pts={myPts} cap={myCap} bets={wagerRisk} duels={duelAntes} room={room} />
      <div className="fd-wagers-denoms" role="group" aria-label="Chip value per tap">
        {RACK_DENOMS.map(value => {
          const affordable = value <= room;
          return <RackChip key={value} value={value} me={me} disabled={!affordable}
            selected={tapStake === value && affordable} onClick={() => { tapTick(); setDenom(value); }} />;
        })}
      </div>
    </section>}
  </div>;
}

export { Wagers, wagerPickLabel, mergeWagerLines, RACK_DENOMS };
