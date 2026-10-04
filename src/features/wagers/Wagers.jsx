import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  PT, OUTRIGHT_MULT, atRisk, disp, maxRisk, contestBetEligibility, contestMult, contestSideOf, wagerMult,
  resolveCurrentContest, duelReserve, resolveDuel, resolveEventLifecycle, resolveWager, stacksPosted, teamLabel,
} from "../../../shared/core.js";
import { DISPLAY, SANS } from "../../ui/theme.js";
import { ActionButton, Sheet } from "../../ui/controls.jsx";
import { haptic, tapTick } from "../../lib/haptics.js";
import { playSound, unlockSound } from "../../lib/sound.js";
import { PageHeading } from "../../ui/layout.jsx";
import { Avatar, BankChip } from "../identity/PlayerIdentity.jsx";
import { BracketPeek } from "../weekend/CompetitionBracket.jsx";
import { BetStacks, ChipStack } from "./BetStacks.jsx";
import {
  STACK_CAP, decidedContest, faceRect, hoverRect, orderStacks, rackTargetFor, stackChipCount, stacksTotal, settledStacks,
} from "./betStacks.js";
import { EASE, MOTION, fly, flightTarget, prefersReducedMotion, useFlightTarget, useFreshChange, useMotionFrame, useStageHold } from "../../lib/motion.js";
import { contestWinLines, winLineFor } from "../standings/winImpact.js";
import { WinLine } from "../standings/WinLine.jsx";
import { GlassArt } from "../../ui/GlassArt.jsx";
import { EventName, OneSafe } from "../../ui/OneSafe.jsx";
import { Icon } from "../../ui/Icon.jsx";
import { RenameText } from "../teams/RenameText.jsx";
import { Coin } from "../../ui/Coin.jsx";
import { ScoreReel } from "../../ui/ScoreReel.jsx";
import { useGlassTilt } from "../../ui/useGlassTilt.js";
import { SideTerms } from "../comebacks/Comebacks.jsx";
import { contestTerms } from "../comebacks/comebacks.js";
import "./wagers.css";

/* the pot's chip, px across: a side card's tower, and a wide board's row */
const PHONE_CHIP = 28;
const ROW_CHIP = 18;

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

const PLACE_QUEUE = 4;
function MarketPick({ state, me, players, name, bets, marketOpen, canPick, onPick, onRetract, onPlayer,
  roleLabel, unavailableReason, unavailableLabel = "Opponent", tapStake, capLabel, capReason, winLine, winSlot = false, lines = 2,
  named = false, terms = null, termsSlot = false }) {
  const [pendingAction, setPendingAction] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [checking, setChecking] = useState(null);
  const pendingRef = useRef(false);
  /* roulette taps: a + tapped while a chip is saving queues behind it (one
     write at a time still), up to PLACE_QUEUE; any failure clears the queue */
  const pendingKindRef = useRef(null), queueRef = useRef([]);
  const [queued, setQueued] = useState(0);
  /* M4: the chip in the air for the write in flight (presentation only) */
  const wellRef = useRef(null), mineRef = useRef(null), flightRef = useRef(null);
  const mine = bets.filter(x => x.w.player === me).sort((a, b) => {
    const latest = ({ w }) => w.chips?.[w.chips.length - 1]?.ts || w.updatedAt || w.ts || 0;
    return latest(a) - latest(b);
  });
  const mineTotal = mine.reduce((total, x) => total + x.w.stake, 0);
  const chip = lines === 1 ? ROW_CHIP : PHONE_CHIP;
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
  /* the side's pot: its tower's top face, or null while the pot is empty */
  const mineFace = () => mineRef.current?.querySelector(".fd-stack > svg")?.getBoundingClientRect() || null;
  /* M4: the rack's chip lifts and arcs to hover over the side's pot; the
     write's answer drops it in or flies it home. Never gates the write: a
     skipped flight is just no flight. */
  const placeFlight = () => {
    if (!me || typeof document === "undefined" || prefersReducedMotion()) return null;
    const source = flightTarget(`bets:rack:${tapStake}`);
    const face = mineFace();
    const anchor = face || mineRef.current?.getBoundingClientRect() || wellRef.current?.getBoundingClientRect();
    if (!source || !anchor) return null;
    let release = () => {};
    const hold = new Promise(resolve => { release = resolve; });
    try { source.animate([{ transform:"scale(1)" }, { transform:"scale(.9)" }, { transform:"scale(1)" }],
      { duration:MOTION.fast * 2, easing:EASE.out }); } catch {}
    fly(source, hoverRect(anchor, chip, face ? 10 : 6), { node:<BankChip p={me} size={46} val={tapStake} />,
      arc:64, hold });
    let settled = false;
    const finish = next => { if (!settled) { settled = true; release(next); } };
    return {
      /* the state is already painted when the ack lands; wait one frame so
         the new stack is measured, then drop onto it */
      land:() => requestAnimationFrame(() => {
        const now = mineFace();
        /* it lands with weight: its own sound, a squash and a settle */
        const onLand = () => playSound("chipLand");
        if (now) finish({ to:faceRect(now), duration:MOTION.fast, settle:true, onLand });
        else if (mineRef.current) finish({ to:mineRef.current, duration:MOTION.fast * 1.5, land:true, onLand });
        else finish(null);
      }),
      back:() => finish({ to:flightTarget(`bets:rack:${tapStake}`) || source, arc:40, duration:MOTION.flight }),
      cancel:() => finish(null),
    };
  };
  /* retract: your last chip leaves the top of your stack for its rack slot */
  const retractFlight = () => {
    if (!me || typeof document === "undefined" || prefersReducedMotion()) return null;
    const face = mineFace();
    const from = face ? faceRect(face) : mineRef.current?.getBoundingClientRect();
    if (!from) return null;
    const value = mineChips[mineChips.length - 1];
    return {
      land:() => {
        const to = flightTarget(rackTargetFor(value, RACK_DENOMS, tapStake));
        if (to) fly(from, to, { node:<BankChip p={me} size={Math.round(from.width)} val={value} />, arc:48, land:true });
      },
      back:() => {}, cancel:() => {},
    };
  };
  /* A4: the chip under your thumb, in the tap itself: placed, taken back, or
     meeting your limit */
  const chipSound = kind => {
    unlockSound();
    /* a chip sounds like what it is (S5 by denomination) and climbs as your
       stack on that side grows */
    playSound(kind === "place" ? capLabel ? "S7" : "S5" : "S6",
      { opts:{ denom:tapStake, height:Array.isArray(mineChips) ? mineChips.length : 0 } });
  };
  const act = (kind, callback, queuedTap = false) => {
    if (pendingRef.current) {
      if (kind === "place" && pendingKindRef.current === "place" && !queuedTap
          && queueRef.current.length < PLACE_QUEUE) {
        tapTick();
        chipSound(kind);
        queueRef.current.push(callback);
        setQueued(queueRef.current.length);
      }
      return;
    }
    /* the iOS tick belongs to the tap itself, before any await */
    if (!queuedTap) tapTick();
    if (!queuedTap) chipSound(kind);
    pendingRef.current = true;
    pendingKindRef.current = kind;
    const before = live.current.mineTotal;
    setPendingAction(kind);
    setActionError(null);
    const flight = kind === "place" ? placeFlight() : retractFlight();
    flightRef.current = flight;
    let holding = false, saved = false;
    const finish = () => {
      if (!holding) { pendingRef.current = false; pendingKindRef.current = null; }
      setPendingAction(null);
      const next = saved && !holding && alive.current ? queueRef.current.shift() : null;
      if (!next) queueRef.current = [];
      setQueued(queueRef.current.length);
      if (next) act("place", next, true);
    };
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
              playSound("S26");
              flight?.back();
            } else flight?.land();
            pendingRef.current = false;
            setChecking(null);
          });
        } else flight?.land();
        return result;
      }
      if (result?.ok === false) { setActionError(result.error || "Bet not saved."); playSound("S26"); flight?.back(); }
      else if (result?.ok === true) { saved = true; haptic(kind === "place" ? "place" : "retract"); flight?.land(); }
      else flight?.cancel();
      return result;
    };
    const fail = error => {
      const message = error?.message || "Bet not saved.";
      setActionError(message);
      playSound("S26");
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
  const busyKind = pendingAction || checking?.kind || null;
  /* Pot and backers (Brandon, Oct 2): a side is one pot, a single chip
     tower as tall as what rides on it with the side's total beside it, then
     who backs it, biggest first, at most BACKER_ROWS rows and "N more". Your
     own row is lit and takes your last chip back; anyone else's opens their
     card. The side you can back ends on one "+ 100" (the rack's chip).
     Every card on a board keeps one shape whatever is bet. */
  const everyone = orderStacks([...otherStacks, ...(mineTotal > 0 ? [{ player:me, stake:mineTotal }] : [])]);
  const [listOpen, setListOpen] = useState(false);
  /* the + stands only where a chip can go: a side you may back while
     betting is open; anywhere else no + and no word (the reason is read aloud) */
  const showWell = !unavailableReason && marketOpen && players.length > 0;
  const shownRows = lines === 1 ? [] : backerRows(everyone, me);
  const more = everyone.length - shownRows.length;
  /* a one-line board's single name carries its win line, so the card is one row shorter */
  const winInline = lines === 1 && players.length === 1;
  /* beside the name it already follows, the line drops it: "Win +400",
     "Win to 1st", so it holds one line in the row */
  const namePrefix = `Win: ${name} `;
  const inlineLine = winInline && winLine?.text?.startsWith(namePrefix)
    ? { ...winLine, text:`Win ${winLine.text.slice(namePrefix.length)}` } : winLine;
  const busyPlace = !!busyKind && !(pendingAction === "place" && !checking && queued < PLACE_QUEUE);
  const placeButton = showWell && <button type="button" ref={wellRef} className={`fd-wagers-place${capLabel != null ? " is-capped" : ""}`}
    disabled={!canPick || busyPlace} onClick={() => act("place", onPick)} aria-label={canPick ? `Place a chip on ${name}` : name}
    aria-description={unavailableReason || capReason || (canPick ? `Add ${fmt(tapStake)} chips` : undefined)}>
    <Icon name="plus" size={lines === 1 ? 18 : 20} />{capLabel !== "" && <span>{capLabel || fmt(tapStake)}</span>}
  </button>;
  const retract = () => act("remove", () => onRetract(mine[mine.length - 1].w.id));
  const backerRow = item => {
    const you = item.player === me;
    const body = <>
      <Avatar state={state} p={item.player} size={24} />
      <span className="fd-wagers-backer-name">{you ? "You" : disp(state, item.player)}</span>
      <span className="fd-wagers-backer-amount">{fmt(item.stake)}</span>
      {you && marketOpen && <Icon name="undo" size={16} className="fd-wagers-backer-back" />}
    </>;
    if (you) return marketOpen
      ? <li key={item.player}><button type="button" className="fd-wagers-backer is-you" disabled={!!busyKind} onClick={retract}
        aria-label={`Retract your last chip on ${name}`}
        aria-description={`Remove ${fmt(mineChips[mineChips.length - 1])} chips; ${fmt(mineTotal)} total on this pick`}>{body}</button></li>
      : <li key={item.player}><span className="fd-wagers-backer is-you" role="img" aria-label={`${fmt(mineTotal)} of your chips on ${name}`}>{body}</span></li>;
    return <li key={item.player}><button type="button" className="fd-wagers-backer" disabled={!onPlayer}
      onClick={() => onPlayer?.(item.player)} aria-label={`View ${disp(state, item.player)}'s player card (${fmt(item.stake)} chips)`}>{body}</button></li>;
  };
  const potStack = <ChipStack chip={POT_CHIP} count={stackChipCount(sideTotal)} size={lines === 1 ? ROW_CHIP : PHONE_CHIP}
    cap={STACK_CAP} tag={false} tower />;
  const pot = <span ref={mineRef} className={`fd-wagers-pot-stack${sideTotal > 0 ? "" : " is-empty"}`} aria-hidden="true">
    {sideTotal > 0 && potStack}
  </span>;
  const faceOnly = players.length > 3 || (lines === 1 && players.length > 2 || named)
    && players.some(player => disp(state, player).length > (named ? 10 : 8));
  return <div className={`fd-wagers-pick${lines === 1 ? " is-one-line" : ""}${mineTotal ? " is-mine" : ""}${roleLabel ? " is-your-side" : ""}${unavailableReason ? " is-unavailable" : ""}${busyKind ? ` is-pending-${busyKind}` : ""}`}>
    <div className={`fd-wagers-pick-identity${players.length > 2 || named ? " is-team" : ""}`}>
      {players.length === 1 ? <button type="button" className="fd-wagers-player" disabled={!onPlayer}
        onClick={() => onPlayer?.(players[0])} aria-label={`View ${name}'s player card`}>
        <Avatar state={state} p={players[0]} size={lines === 1 ? 34 : 26} />{winInline ? <span className="fd-wagers-player-text">
          <span>{name}</span><WinLine line={inlineLine} className="fd-wagers-win-inline" /></span> : <span>{name}</span>}
      </button> : <>
        {/* a team's name (a pair's too, once it takes one), re-lettered when it changes */}
        {(players.length > 2 || named) && <RenameText name={name} className={`fd-wagers-team-name${name.length > 16 ? " is-long" : ""}`} />}
        {/* a team past three shows its faces across the card, no names, so
            all of them fit without a scroll; so does a team of three on a
            narrow card (a board of 3+ sides) once a name would not fit */}
        <span className={`fd-wagers-team-players${faceOnly ? " is-many" : ""}`}
          style={faceOnly ? { "--fd-team-n":players.length } : undefined}>{players.map(player => <button type="button" key={player}
          disabled={!onPlayer} onClick={() => onPlayer?.(player)} title={disp(state, player)}
          aria-label={`View ${disp(state, player)}'s player card`}>
          <Avatar state={state} p={player} size={24} />{!faceOnly && <span>{disp(state, player)}</span>}
        </button>)}</span>
      </>}
    </div>
    {winSlot && !winInline && <div className="fd-wagers-win-slot"><WinLine line={winLine} className="fd-wagers-win" /></div>}
    {/* v3.1: this side's payout and the bounty it collects, one row on every card */}
    {termsSlot && <SideTerms terms={terms} className="fd-wagers-terms" />}
    {lines === 1
      /* a wide board's row: the pot, how many back it (yours lit, a tap
         takes your last chip back), then the + */
      ? <div className="fd-wagers-pot is-row" role="group" aria-label={`Bets on ${name}`} aria-busy={!!busyKind}
        aria-description={unavailableReason || undefined}>
        {roleLabel && <span className="fd-wagers-pick-role">{roleLabel}</span>}
        <span ref={mineRef} className={`fd-wagers-pot-total${sideTotal > 0 ? "" : " is-empty"}`}>{sideTotal > 0 ? fmt(sideTotal) : null}</span>
        {/* yours, lit (a tap takes your last chip back), else how many back it */}
        <span className="fd-wagers-pot-who">{mineTotal > 0 ? (marketOpen
          ? <button type="button" className="fd-wagers-pot-you" disabled={!!busyKind} onClick={retract}
            aria-label={`Retract your last chip on ${name}`}
            aria-description={`Remove ${fmt(mineChips[mineChips.length - 1])} chips; ${fmt(mineTotal)} total on this pick`}>
            <Icon name="undo" size={14} />{fmt(mineTotal)}</button>
          : <span className="fd-wagers-pot-you" role="img" aria-label={`${fmt(mineTotal)} of your chips on ${name}`}>{fmt(mineTotal)}</span>)
          : everyone.length > 0 && <button type="button" className="fd-wagers-pot-count" onClick={() => setListOpen(true)}
            aria-label={`${everyone.length} backing ${name}`}><Icon name="people" size={14} />{everyone.length}</button>}</span>
        {placeButton}
      </div>
      : <div className="fd-wagers-pot" role="group" aria-label={`Bets on ${name}`} aria-busy={!!busyKind}
        aria-description={unavailableReason || undefined}>
        <div className="fd-wagers-pot-head">
          {pot}
          {sideTotal > 0 && <span className="fd-wagers-pot-total"><ScoreReel value={sideTotal} tone="chip" slim label={fmt(sideTotal)} /></span>}
          {roleLabel && <span className="fd-wagers-pick-role">{roleLabel}</span>}
        </div>
        {/* nothing on it yet: the felt's open seat, where the first chip lands */}
        {shownRows.length ? <ol className="fd-wagers-backers">{shownRows.map(backerRow)}</ol>
          : <div className={`fd-wagers-seat${showWell ? " is-open" : ""}`} aria-hidden="true"><i /></div>}
        <div className="fd-wagers-backers-more">{more > 0 && <button type="button" onClick={() => setListOpen(true)}
          aria-label={`All ${everyone.length} backing ${name}`}>{more} more</button>}</div>
        <div className="fd-wagers-place-slot">{placeButton}</div>
      </div>}
    {checking && <p className="fd-wagers-pick-checking" role="status">Checking…</p>}
    {actionError && !checking && <p className="fd-wagers-pick-error" role="alert">{actionError}</p>}
    {listOpen && <Sheet title={name} onClose={() => setListOpen(false)} className="fd-wagers-backers-sheet">
      <div className="fd-wagers-pot-head is-sheet"><span className="fd-wagers-pot-stack" aria-hidden="true">{sideTotal > 0 && potStack}</span>
        <span className="fd-wagers-pot-total">{fmt(sideTotal)}</span></div>
      <ol className="fd-wagers-backers is-all">{everyone.map(backerRow)}</ol>
    </Sheet>}
  </div>;
}

/* the pot's chip: the side's, not anyone's (amber, chips) */
const POT_CHIP = Object.freeze({ color:"var(--sun)", isLight:true, skin:"plain", stamp:"" });
/* the backers a side card lists before "N more"; your own row is always one of them */
export const BACKER_ROWS = 4;
export function backerRows(everyone = [], me = null, rows = BACKER_ROWS) {
  if (everyone.length <= rows) return everyone;
  const top = everyone.slice(0, rows);
  const mine = me ? everyone.find(item => item.player === me) : null;
  return mine && !top.includes(mine) ? [...top.slice(0, rows - 1), mine] : top;
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

/* A rack chip is a coin in the tray (Coin.jsx): it leans back in its slot
   with its edge showing, and the chosen one stands, lifts toward you and
   settles. It is also where a flying chip leaves from and comes home to;
   data-fly-coin makes those flights coins too (spin out, flip home). */
function RackChip({ value, me, disabled, selected, onClick }) {
  const target = useFlightTarget(`bets:rack:${value}`);
  return <button type="button" ref={target} disabled={disabled} onClick={onClick} data-fly-coin=""
    aria-pressed={selected} aria-label={`Bet ${value} a tap`} className={selected ? "is-selected" : disabled ? "is-unlit" : ""}>
    <Coin p={me} unlit={disabled}>
      {disabled ? <UnlitChip value={value} /> : <BankChip p={me} size={46} val={value} />}
    </Coin>
  </button>;
}

/* a denomination past what is left to bet: an unlit lamp in the rack, its
   value still read at a glance (muted bone on dark glass, well over 3:1) */
function UnlitChip({ value }) {
  const ticks = Array.from({ length:8 }, (_, i) => i * 45);
  return <svg className="fd-wagers-unlit" viewBox="0 0 46 46" width="46" height="46" aria-hidden="true" focusable="false">
    <circle cx="23" cy="23" r="21.5" className="fd-wagers-unlit-body" />
    {ticks.map(angle => <rect key={angle} x="21" y="2.5" width="4" height="7" rx="1"
      className="fd-wagers-unlit-tick" transform={`rotate(${angle} 23 23)`} />)}
    <circle cx="23" cy="23" r="12.5" className="fd-wagers-unlit-face" />
    <text x="23" y="23" className="fd-wagers-unlit-value" textAnchor="middle" dominantBaseline="central">{value}</text>
  </svg>;
}

/* M5: the decided contest, held on the board it was bet on. WON stamps on
   the winning side, the losing stacks go back to the bank, the winners'
   stacks grow by their payout, and your own winnings fly to Home. A tap
   anywhere on it deals the next contest in. */
const HOME_FLIGHT_AT = 1300;
function HeldBoard({ state, me, held, view, onSkip }) {
  const mineRef = useRef(null);
  /* the chips-moved receipt waits until this board has said it */
  useStageHold(`bets:held:${held.id}`, true);
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
  const { contest, ev, label, winSlot = false } = held;
  const lines = (contest.sides || []).length > 2 ? 1 : 2;
  const sides = contest.kind === "ffa" ? view.sides.filter(side => side.won || side.stacks.length) : view.sides;
  const nameOf = side => {
    const drawn = typeof side.key === "number" ? state.draws?.[ev.id]?.teams?.[side.key] : null;
    return side.players.length === 1 ? disp(state, side.players[0]) : teamLabel(state, drawn || { players:side.players });
  };
  return <section className="fd-wagers-event fd-wagers-held" onClick={onSkip} aria-label={`${label} settled`}>
    <div className="fd-wagers-contest-heading">
      <div><h2>{contest.kind === "ffa" ? "Winner" : label}</h2>
        {!contest.odds && <p>{contestMult(contest) === 1 ? "Winner pays 1:1" : "Winner pays 2:1"}</p>}</div>
    </div>
    <div className="fd-wagers-picks">{sides.map(side => {
      const head = side.won ? side.paid > 0 && <span className="fd-wagers-held-head is-up">+{fmt(side.paid)}</span>
        : side.total > 0 && <span className="fd-wagers-held-head is-down">−{fmt(side.total)}</span>;
      return <div key={String(side.key)} className={`fd-wagers-pick fd-wagers-held-side${lines === 1 ? " is-one-line" : ""} ${side.won ? "is-won" : "is-lost"}`}>
        <div className={`fd-wagers-pick-identity${side.players.length > 2 ? " is-team" : ""}`}>
          {side.players.length === 1 ? <span className="fd-wagers-player">
            <Avatar state={state} p={side.players[0]} size={26} /><span>{nameOf(side)}</span>
          </span> : <>
            {side.players.length > 2 && <span className="fd-wagers-team-name">{nameOf(side)}</span>}
            <span className={`fd-wagers-team-players${side.players.length > 3 ? " is-many" : ""}`}
              style={side.players.length > 3 ? { "--fd-team-n":side.players.length } : undefined}>
              {side.players.map(player => <span key={player} className="fd-wagers-held-face">
              <Avatar state={state} p={player} size={24} />{side.players.length <= 3 && <span>{disp(state, player)}</span>}
            </span>)}</span>
          </>}
        </div>
        {winSlot && !(lines === 1 && side.players.length === 1) && <div className="fd-wagers-win-slot" />}
        {/* the live board's shape: the pot, then its backers; the winning
            pot grows by what it pays, a losing side's rows go dim */}
        <div className={`fd-wagers-pot is-held${lines === 1 ? " is-row" : ""}`}>
          <div className="fd-wagers-pot-head">
            <span ref={mineRef} className={`fd-wagers-pot-stack${side.total > 0 ? "" : " is-empty"}`} aria-hidden="true">
              {side.total > 0 && <ChipStack chip={POT_CHIP} count={stackChipCount(side.total + (side.won ? side.paid : 0))}
                size={lines === 1 ? ROW_CHIP : PHONE_CHIP} cap={STACK_CAP} tag={false} tower settle={side.won ? "won" : null} delay={500} />}
            </span>
            {head || <span className="fd-wagers-pot-total is-empty">0</span>}
            {side.won && <span className="fd-wagers-won" aria-label="Won">WON</span>}
          </div>
          {lines !== 1 && <ol className="fd-wagers-backers">{backerRows(side.stacks, me).map((item, index) =>
            <li key={item.player}><span className={`fd-wagers-backer${item.player === me ? " is-you" : ""}${side.won ? "" : " is-lost"}`}
              style={side.won ? undefined : { animationDelay:`${200 + index * 90}ms` }}>
              <Avatar state={state} p={item.player} size={24} />
              <span className="fd-wagers-backer-name">{item.player === me ? "You" : disp(state, item.player)}</span>
              <span className={`fd-wagers-backer-amount${side.won ? " is-up" : ""}`}>{side.won ? `+${fmt(item.paid)}` : fmt(item.stake)}</span>
            </span></li>)}</ol>}
          {lines !== 1 && <div className="fd-wagers-backers-more">{side.stacks.length > BACKER_ROWS
            && <span>{side.stacks.length - backerRows(side.stacks, me).length} more</span>}</div>}
        </div>
      </div>;
    })}</div>
  </section>;
}

/* The bar is the whole stack, the notch is the cap, gold is what your bets
   hold, hatching is what duels hold, and the gap to the notch is what is left
   to bet. Anything past the notch (after a correction) is drawn as a loss. */
function StackMeter({ pts, cap, bets, duels, room, capBinds = false }) {
  const exposure = bets + duels;
  const scale = Math.max(pts, exposure, cap, 1);
  const at = value => Math.max(0, Math.min(100, value / scale * 100));
  const pct = value => `${at(value)}%`;
  const betsIn = Math.min(bets, cap), duelsIn = Math.min(duels, Math.max(0, cap - betsIn));
  const over = Math.max(0, exposure - cap);
  const capped = room < PT && pts - exposure >= PT;
  return <div className={`fd-wagers-meter${capped ? " is-capped" : ""}${over ? " is-over" : ""}`} role="meter"
    aria-label="Chips at risk" aria-valuemin={0} aria-valuemax={Math.max(cap, exposure)} aria-valuenow={exposure}
    aria-valuetext={`${fmt(exposure)} at risk, ${fmt(cap)} maximum, ${fmt(pts)} in your stack${duels ? `, ${fmt(duels)} reserved for duels` : ""}`}>
    {/* one fixed readout: what is left to bet, and what is already down */}
    <div className="fd-wagers-meter-top" aria-hidden="true">
      {capBinds ? <span className="fd-wagers-meter-room is-max"><strong>Max {fmt(cap)}</strong></span>
        : <span className="fd-wagers-meter-room"><strong><ScoreReel value={room} tone="chip" label={fmt(room)} /></strong><small>to bet</small></span>}
      {exposure > 0 && <span className="fd-wagers-meter-down">{fmt(exposure)}<small>in bets</small></span>}
    </div>
    <div className="fd-wagers-meter-bar" aria-hidden="true">
      {betsIn > 0 && <span className="is-bets" style={{ left:0, width:pct(betsIn) }} />}
      {duelsIn > 0 && <span className="is-duels" style={{ left:pct(betsIn), width:pct(duelsIn) }} />}
      {over > 0 && <span className="is-over" style={{ left:pct(cap), width:pct(over) }} />}
      <i className="fd-wagers-meter-notch" style={{ left:pct(cap) }} />
    </div>
    <div className="fd-wagers-meter-scale" aria-hidden="true">
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
        onClick={() => onPlayer?.(w.player)}>{disp(state, w.player)}</button> <span>{fmt(w.stake)} chips</span></span>
      <strong>{label.pick}</strong>
      <span className="fd-wagers-line-context">{label.ctx}</span>
    </div>
    <div className="fd-wagers-line-result">
      {r.status === "pending" && <><small>To win</small><strong>+{fmt(win)}</strong></>}
      {r.status === "won" && <><small>Won</small><strong>+{fmt(r.delta)}</strong></>}
      {r.status === "lost" && <><small>Lost</small><strong>{fmt(r.delta)}</strong></>}
      {r.status === "void" && <small className="is-void">Void</small>}
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
  /* a wide field shows only your own side's win line, as on Home (X8) */
  const wide = contest?.kind === "ffa" && (contest?.sides || []).length > 2;
  /* v3.1: underdog odds and the leader bounty, per side */
  const terms = contest ? contestTerms(state, contest, standings) : null;
  const termsSlot = !!terms?.any && !terms.wide;
  const picks = (contest?.sides || []).map(side => {
    const own = side.players.includes(me);
    const drawnTeam = typeof side.key === "number" ? state.draws?.[ev.id]?.teams?.[side.key] : null;
    const name = side.players.length === 1 ? disp(state, side.players[0]) : teamLabel(state, drawnTeam || { players:side.players });
    const pick = contestPick(contest, side, ev);
    const eligible = !!me && contestBetEligibility(contest, me, side.key);
    const otherSide = eligible && heldSide !== null && heldSide !== side.key;
    return { key:side.key, state, me, players:side.players, name, named:side.players.length === 2 && !!drawnTeam?.name, marketOpen,
      onRetract:id => onRetract(id, { contestId:contest.id, contestRevision:contest.revision }),
      onPlayer, tapStake, bets:pending.filter(x => samePick(x.w, pick)), winLine:wide && !own ? null : winLineFor(winLines, side.key),
      roleLabel:own ? side.players.length > 1 ? "Your team" : "Back yourself" : null,
      terms:termsSlot ? terms.sides[side.key] : null, termsSlot,
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
  /* one board, one card shape: a win line's row is kept on every card when any has one */
  const winSlot = picks.some(pick => !!pick.winLine?.text);
  /* a matchup keeps two lines of stacks; three sides or more keep one */
  const lines = picks.length > 2 ? 1 : 2;
  /* a wide board says its cap once, on the meter; each row's + goes quiet */
  picks.forEach(pick => { pick.winSlot = winSlot; pick.lines = lines; if (lines === 1 && pick.capLabel) pick.capLabel = ""; });
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
    watched.current = ev && contest ? { ev, contest, winSlot, label:contest.kind === "ffa" ? ev.name || "Winner" : contest.label } : null;
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
  const rackShown = !!(me && ev && marketOpen && !holding);
  const rootRef = useRef(null), rackRef = useRef(null);
  /* the tray is glass: it gives a little under the chip you press */
  useGlassTilt(rackRef, { enabled:rackShown, max:2 });
  return <div ref={rootRef} className={`fd-wagers${rackShown ? " has-rack" : ""}`}
    style={{ "--fd-wagers-numerals":DISPLAY, "--fd-wagers-body":SANS }}>
    {/* the board's head is the viewport's one painting: the session's sky
        to floor, the game's name lettered on the horizon with its medallion
        seated there, the status and the payout on the clear glass under it */}
    {headEv ? <header className={`fd-wagers-event-heading fd-lamp${liveDot ? " is-live" : ""}`}>
      <div className="fd-wagers-scene fd-glass-scene">
        <GlassArt clear />
        <h1 className="fd-show is-marquee fd-glass-letter"><EventName name={headEv.name} /></h1>
        {GameMark && <span className="fd-wagers-event-mark"><GameMark id={headEv.game} variant={headEv.variant} size={34} /></span>}
      </div>
      <div className="fd-wagers-event-meta">
        <span className={`fd-wagers-status${liveDot ? " is-open" : ""}`}>
          <i className={liveDot ? "fd-insert fd-beat-dot" : "fd-insert is-done"} aria-hidden="true" />{holding ? "Settled" : status}
        </span>
        {/* the payout is said once, here */}
        {contest && !holding && !terms?.odds && <span className="fd-wagers-payout">{evenMoney ? "Winner pays 1:1" : "Winner pays 2:1"}</span>}
      </div>
    </header> : <PageHeading title="Bets" />}

    {settling && <SettleStrip key={settling.id} me={me} settling={settling} />}

    {holding && <HeldBoard key={held.id} state={state} me={me} held={held} view={heldView} onSkip={endHold} />}

    {!ev && !holding && <section className={`fd-wagers-waiting fd-glass-field fd-field-info${state.frozen || finaleClosed ? " is-finished" : ""}`}>
      <div className="fd-wagers-waiting-copy">
        <h2>{state.frozen ? "The board is frozen." : finaleClosed ? "Betting is closed for the finale"
          : state.live ? "Between events" : "Betting opens with the first event"}</h2>
        {!state.frozen && !finaleClosed && <ActionButton variant="secondary" onClick={onEvents}>Browse the events</ActionButton>}
      </div>
    </section>}

    {ev && !holding && <section className="fd-wagers-event">
      {(contest?.kind !== "ffa" || (onEvent && !peek)) && <div className="fd-wagers-contest-heading">
        <div>{contest?.kind !== "ffa" && <h2><OneSafe text={contest?.label || "Bets"} /></h2>}</div>
        {onEvent && !peek && <button type="button" className="fd-wagers-context" onClick={() => onEvent(ev)}>
          {contextLabel}<Icon name="open" size={18} />
        </button>}
      </div>}
      {contest && picks.length > 0 ? <div className="fd-wagers-play">
        <section className={`fd-wagers-market fd-wagers-contest is-${contest.kind}${dealing ? " is-dealing" : ""}`}
          aria-label={contest.label}>
          <div className={`fd-wagers-picks${lines === 1 ? " is-rows" : ""}`}>
            {picks.map(pick => <MarketPick {...pick} key={`${contest.id}:${pick.key}`} />)}
          </div>
        </section>
          {/* the rack docks under the board it bets on: sticky above the tab
              bar (and the commissioner's dock) while the board scrolls, and
              in the page's flow after it, so it never covers the bracket or
              the bets below. The meter draws exposure against the cap. */}
          {rackShown && <section ref={rackRef} className={`fd-wagers-rack fd-night${dealing ? " is-dealing" : ""}`} aria-label="Choose your betting chip">
            <StackMeter pts={myPts} cap={myCap} bets={wagerRisk} duels={duelAntes} room={room} capBinds={capBinds} />
            <div className="fd-wagers-denoms" role="group" aria-label="Chip value per tap">
              {RACK_DENOMS.map(value => {
                const affordable = value <= room;
                return <RackChip key={value} value={value} me={me} disabled={!affordable}
                  selected={tapStake === value && affordable} onClick={() => { tapTick(); setDenom(value); }} />;
              })}
            </div>
          </section>}
      </div> : <p className="fd-wagers-contest-waiting">{state.results?.[ev.id] ? "Result posted." : "Waiting for the next contest."}</p>}
      {me && marketOpen && myPts - myExp < PT
        && <p className="fd-wagers-limit" role="status">No chips available.</p>}
      {peek && <BracketPeek state={state} ev={ev} me={me} onOpen={onEvent} card />}
    </section>}

    {pendingLines.length > 0 && <details className="fd-wagers-history" open={!contest || undefined}>
      <summary>Open bets <span>{pendingLines.length}</span><Icon name="plus" size={20} className="fd-wagers-summary-icon" /></summary>
      {gm && onVoid && <button type="button" className="fd-wagers-manage" aria-pressed={manage}
        onClick={() => setManage(value => !value)}>{manage ? "Done" : "Manage"}</button>}
      <div className="fd-wagers-ledger">{pendingLines.map(x =>
        <WagerLine key={x.w.id} x={x} state={state} events={events} gm={gm} manage={manage} onVoid={onVoid} onPlayer={onPlayer} />)}</div>
    </details>}

    {settledLines.length > 0 && <details className="fd-wagers-history" ref={settledRef} open={settledShown}
      onToggle={event => setSettledShown(event.currentTarget.open)}>
      <summary>Settled <span>{settledLines.length}</span><Icon name="plus" size={20} className="fd-wagers-summary-icon" /></summary>
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
            <span className="fd-wagers-settled-arrow"><Icon name={open ? "minus" : "plus"} size={20} /></span>
          </button></div>
          {open && <div className="fd-wagers-settled-detail">{group.lines.map(x =>
            <WagerLine key={x.w.id} x={x} state={state} events={events} gm={gm} onVoid={onVoid} onPlayer={onPlayer} />)}</div>}
        </div>;
      })}</div>
    </details>}

  </div>;
}

export { Wagers, wagerPickLabel, mergeWagerLines, RACK_DENOMS };
