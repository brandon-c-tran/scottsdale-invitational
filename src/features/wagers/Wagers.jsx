import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  PT, OUTRIGHT_MULT, atRisk, disp, maxRisk, contestBetEligibility, contestMult, contestSideOf, wagerMult, wagerPrice, poolNet,
  resolveCurrentContest, duelReserve, resolveDuel, resolveEventLifecycle, resolveWager, stacksPosted, teamLabel,
} from "../../../shared/core.js";
import { DISPLAY, SANS } from "../../ui/theme.js";
import { ActionButton, Sheet } from "../../ui/controls.jsx";
import { haptic, tapTick } from "../../lib/haptics.js";
import { playSound, unlockSound } from "../../lib/sound.js";
import { PageHeading } from "../../ui/layout.jsx";
import { Avatar, BankChip, ChipFace } from "../identity/PlayerIdentity.jsx";
import { usePlayerIdentity } from "../identity/PlayerIdentityContext.js";
import { BracketPeek } from "../weekend/CompetitionBracket.jsx";
import { BetStacks, ChipStack, HOUSE_CHIP, groupChip } from "./BetStacks.jsx";
import {
  decidedContest, faceRect, groupStacks, hoverRect, orderStacks, rackTargetFor, stackChipCount, stackMaxHeight, stackName,
  stacksTotal, settledStacks,
} from "./betStacks.js";
import { EASE, MOTION, fly, flightTarget, prefersReducedMotion, useFlightTarget, useFreshChange, useMotionFrame, useStageHold } from "../../lib/motion.js";
import { contestWinLines, winLineFor } from "../standings/winImpact.js";
import { GlassArt } from "../../ui/GlassArt.jsx";
import { EventName, OneSafe } from "../../ui/OneSafe.jsx";
import { Icon } from "../../ui/Icon.jsx";
import { RenameText } from "../teams/RenameText.jsx";
import { Coin } from "../../ui/Coin.jsx";
import { ScoreReel } from "../../ui/ScoreReel.jsx";
import { useGlassTilt } from "../../ui/useGlassTilt.js";
import { PriceLamp, SideTerms } from "../comebacks/Comebacks.jsx";
import { BetTable, GridFocus, LockSweep, Spot, tableDrag, tableDragJustEnded, useTableDrag } from "./BetTable.jsx";
import { settledTable, tableView } from "./tableModel.js";
import { DealerGlove } from "./DealerGlove.jsx";
import { createPortal } from "react-dom";
import { contestTerms } from "../comebacks/comebacks.js";
import "./wagers.css";

/* a stack's chip, px across: a matchup's felt, and a wide board's row */
const PHONE_CHIP = 32;
const ROW_CHIP = 20;
/* a matchup's felt: two lines of three cells, the well first, then a stack
   per backer biggest first; past five the smallest fold into one "+N" */
export const FELT_CELLS = 6;
/* a wide board's row: up to two backers' stacks, else one and the "+N" */
export const ROW_STACKS = 2;
/* every line of a felt stands as tall as the tallest stack, so a card is
   one height from its first chip to its last */
const FELT_STACK_H = Math.ceil(stackMaxHeight(PHONE_CHIP));

const fmt = n => (n ?? 0).toLocaleString("en-US");
/* A competitor's name is lettered as large as its slot allows (Fits By
   Construction): the slot's width over the name's letters sets the size, from
   the show size down to the label floor (wagers.css, --fd-name-ch). */
const nameFit = name => ({ "--fd-name-ch":Math.max(1, String(name || "").length) });
function CompetitorName({ name }) {
  return <span className="fd-wagers-player-name" style={nameFit(name)}>{name}</span>;
}
/* one of a pair: the first name under the face, as the side's subject */
function PairName({ name }) {
  return <span className="fd-wagers-pair-name" style={nameFit(name)}>{name}</span>;
}

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

/* A timed-out write may still have landed (the engine lives in useChipActions.js) */
export { isUncertainResult } from "./useChipActions.js";

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
/* a rack chip is tapped to choose it, or held and dragged onto a spot,
   which previews and then places that chip (BetTable tableDrag) */
const DRAG_START_PX = 10;
function RackChip({ value, disabled, selected, onClick }) {
  const target = useFlightTarget(`bets:rack:${value}`);
  const press = useRef(null);
  const handlers = disabled ? {} : {
    onPointerDown:event => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      press.current = { id:event.pointerId, x:event.clientX, y:event.clientY, dragging:false };
      /* hold the pointer from the press, so a quick flick off the chip still drags */
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch {}
    },
    onPointerMove:event => {
      const p = press.current;
      if (!p || p.id !== event.pointerId) return;
      if (!p.dragging && Math.hypot(event.clientX - p.x, event.clientY - p.y) < DRAG_START_PX) return;
      if (!p.dragging) {
        p.dragging = true;
        tapTick();
        tableDrag.start(value, event.clientX, event.clientY);
      }
      tableDrag.move(event.clientX, event.clientY);
    },
    onPointerUp:() => {
      const p = press.current;
      press.current = null;
      if (p?.dragging) tableDrag.end();
    },
    onPointerCancel:() => { if (press.current?.dragging) tableDrag.cancel(); press.current = null; },
    onClickCapture:event => { if (tableDragJustEnded()) { event.preventDefault(); event.stopPropagation(); } },
  };
  return <button type="button" ref={target} disabled={disabled} onClick={onClick} data-fly-coin="" {...handlers}
    style={{ touchAction:"none" }}
    aria-pressed={selected} aria-label={`Bet ${value} a tap`} className={selected ? "is-selected" : disabled ? "is-unlit" : ""}>
    <Coin color={DENOM_COLOR} unlit={disabled}>
      {disabled ? <UnlitChip value={value} /> : <DenomChip size={RACK_COIN} value={value} />}
    </Coin>
  </button>;
}

/* The rack's chips are the house's, not a person's: every denomination is
   the chip lamp's amber, its value stamped in the middle. A placed chip
   leaves the rack as the bettor's own chip (BankChip), the one their stack
   is built from. */
const DENOM_COLOR = HOUSE_CHIP.color;
const RACK_COIN = 44;
function DenomChip({ size = RACK_COIN, value }) {
  return <ChipFace size={size} stamp={value} valueRing color={DENOM_COLOR} isLight={HOUSE_CHIP.isLight} skin={HOUSE_CHIP.skin} />;
}

/* a pool's heading: the whole pool on a reel, the chips lamp beside it */
function PoolLamp({ total, label = "Pool" }) {
  return <span className="fd-wagers-pays is-pool"><i className="fd-insert" aria-hidden="true" />{label}
    <ScoreReel value={Math.round(total)} tone="chip" slim label={fmt(Math.round(total))} /></span>;
}
/* what a side pays, as a lit amber label: the money lamp beside the words.
   "1:1" is a ratio, not a lone 1 beside letters, so it stays unflagged */
function PayLamp({ mult }) {
  return <span className="fd-wagers-pays"><i className="fd-insert" aria-hidden="true" />
    {mult === 1 ? "Winner pays 1:1" : "Winner pays 2:1"}</span>;
}

/* a denomination past what is left to bet: an unlit lamp in the rack, its
   value still read at a glance (muted bone on dark glass, well over 3:1) */
function UnlitChip({ value }) {
  const ticks = Array.from({ length:8 }, (_, i) => i * 45);
  return <svg className="fd-wagers-unlit" viewBox="0 0 46 46" width={RACK_COIN} height={RACK_COIN} aria-hidden="true" focusable="false">
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
  /* the chips-moved receipt waits until this board has said it */
  useStageHold(`bets:held:${held.id}`, true);
  const boardRef = useRef(null);
  const paid = (view.sides.find(side => side.won)?.stacks || [])
    .filter(item => item.player === me).reduce((sum, item) => sum + item.paid, 0);
  /* your winnings fly from your stack on the winning spot to Home */
  useEffect(() => {
    if (!me || paid <= 0) return undefined;
    const timer = setTimeout(() => {
      const svg = boardRef.current?.querySelector(".fd-spot.is-won .fd-spot-mine .fd-stack > svg");
      if (!svg) return;
      const from = faceRect(svg.getBoundingClientRect());
      const count = Math.max(1, Math.min(5, Math.round(paid / PT)));
      for (let i = 0; i < count; i++) fly(from, "tab:home", { node:<BankChip p={me} size={Math.round(from.width)} val={PT} />,
        delay:i * 70, arc:60, duration:560, scale:0.7, fade:true, land:i === count - 1 });
    }, HOME_FLIGHT_AT);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const { contest, ev, label } = held;
  const table = settledTable(state, contest, view, me);
  if (!table) return null;
  const nameOf = spot => {
    const drawn = typeof spot.key === "number" ? state.draws?.[ev.id]?.teams?.[spot.key] : null;
    return spot.players.length === 1 ? disp(state, spot.players[0]) : teamLabel(state, drawn || { players:spot.players });
  };
  /* the decided table: the winner floods and stamps, the losers' chips are
     raked to the bank; a tap anywhere deals the next contest in */
  return <section ref={boardRef} className="fd-wagers-event fd-wagers-held" onClick={onSkip} aria-label={`${label} settled`}>
    <BetTable table={table} spots={table.spots.length} contestLabel={contest.kind !== "ffa" ? label : null} marketOpen={false} settled
      phase={null} dealer={<RakeSweep />}>
      {table.spots.map(spot => <Spot key={String(spot.key)} spot={spot} table={table} state={state} me={me} shape={table.shape}
        name={nameOf(spot)} named={spot.players.length === 2 && !!state.draws?.[ev.id]?.teams?.[spot.key]?.name}
        marketOpen={false} canPick={false} onPick={() => {}} onRetract={() => {}} tapStake={PT} denoms={RACK_DENOMS}
        settled={spot.won ? "won" : "lost"} />)}
    </BetTable>
  </section>;
}

/* the dealer rakes the losing chips to the bank: one pass of the glove,
   right to left, as the decided table holds */
function RakeSweep() {
  return <div className="fd-table-rake" aria-hidden="true"><span className="fd-table-rake-glove"><DealerGlove pose="flat" size={60} flip /></span></div>;
}

/* The bar is the whole stack, the notch is the cap, gold is what your bets
   hold, hatching is what duels hold, and the gap to the notch is what is left
   to bet. Anything past the notch (after a correction) is drawn as a loss. */
/* the rack's readout: what is left to bet (a reel), or the cap once it binds */
function RoomReadout({ cap, room, capBinds, capped }) {
  return capBinds ? <span className="fd-wagers-meter-room is-max" aria-hidden="true"><strong>Max {fmt(cap)}</strong></span>
    : <span className={`fd-wagers-meter-room${capped ? " is-capped" : ""}`} aria-hidden="true">
      <strong><ScoreReel value={room} tone="chip" label={fmt(room)} /></strong><small>to bet</small></span>;
}
function StackMeter({ pts, cap, bets, duels, room }) {
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
    <div className="fd-wagers-meter-bar" aria-hidden="true">
      {betsIn > 0 && <span className="is-bets" style={{ left:0, width:pct(betsIn) }} />}
      {duelsIn > 0 && <span className="is-duels" style={{ left:pct(betsIn), width:pct(duelsIn) }} />}
      {over > 0 && <span className="is-over" style={{ left:pct(cap), width:pct(over) }} />}
      <i className="fd-wagers-meter-notch" style={{ left:pct(cap) }} />
    </div>
    {/* no figure under the bar: the rack's readout is the one number ("N
        to bet", or "Max N" once the cap binds, as on the +), and the notch
        stays a drawn mark */}
  </div>;
}

/* After the crown: your weekend's betting, drawn as a record. The net is the
   one hero number (a reel in its sign's ink), the won and lost counts beside
   it as lamps, then the way to your last card. The ledger below holds every
   bet, yours open first. */
function BetRecord({ group, me, onLastCard }) {
  const won = group ? group.lines.filter(x => x.r.status === "won").length : 0;
  const lost = group ? group.lines.filter(x => x.r.status === "lost").length : 0;
  const net = group?.net || 0;
  return <section className="fd-wagers-record fd-glass-field fd-field-chip" aria-label="Your bets">
    {me && <>
      <h2>Your bets</h2>
      {group ? <div className="fd-wagers-record-row">
        <strong className={`fd-wagers-record-net${net > 0 ? " is-up" : net < 0 ? " is-down" : ""}`}>
          {net > 0 ? "+" : net < 0 ? "−" : ""}<ScoreReel value={Math.abs(net)} label={fmt(Math.abs(net))} /></strong>
        <span className="fd-wagers-record-tally">
          <span className="is-won"><i className="fd-insert" aria-hidden="true" /><b>{won}</b><small>Won</small></span>
          <span className="is-lost"><i className="fd-insert is-done" aria-hidden="true" /><b>{lost}</b><small>Lost</small></span>
        </span>
      </div> : <p className="fd-wagers-record-none">No bets</p>}
    </>}
    {onLastCard && <button type="button" className="fd-wagers-record-card" onClick={onLastCard}>
      {me ? "Your last card" : "The champion's card"}<Icon name="open" size={18} /></button>}
  </section>;
}

function WagerLine({ x, state, events, gm, manage = false, onVoid, onPlayer }) {
  const { w, r } = x;
  const label = wagerPickLabel(state, w, events);
  /* a pool ticket wins at its pool's price now (fixed once betting locks) */
  const price = w.pool ? wagerPrice(state, w) : null;
  const win = w.pool ? poolNet(w.stake, price) : wagerMult(w) * w.stake;
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
  openSettled = false, onSettledSeen, onLastCard }) {
  /* once the board is frozen, Bets is your weekend's betting record: the
     settled ledger open, your own bets first and open */
  const frozen = !!state.frozen;
  const [settledOpen, setSettledOpen] = useState(() => (openSettled || frozen) && me ? `st:${me}` : null);
  const [settledShown, setSettledShown] = useState(!!openSettled || frozen);
  useEffect(() => {
    if (!frozen) return;
    setSettledShown(true);
    if (me) setSettledOpen(current => current || `st:${me}`);
  }, [frozen]); // eslint-disable-line react-hooks/exhaustive-deps
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
    /* yours leads once the board is frozen (it is your record) */
    const first = group => frozen && group.player === me ? 0 : 1;
    return [...groups.values()].sort((a, b) => first(a) - first(b) || b.net - a.net || a.player.localeCompare(b.player));
  }, [settledLines, frozen, me]);
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
  /* v3.1: underdog odds, per side */
  const terms = contest ? contestTerms(state, contest) : null;
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
      roleLabel:own ? side.players.length > 1 ? "Your team" : "You" : null,
      terms:termsSlot || terms?.pool ? terms.sides[side.key] : null, termsSlot,
      unavailableReason:restricted && !eligible ? restriction
        : otherSide && marketOpen ? "One side per contest. Your chips are on the other side." : null,
      unavailableLabel:restricted && !eligible ? "Opponent" : "Other side",
      canPick:marketOpen && room >= PT && eligible && !otherSide,
      capLabel:marketOpen && eligible && !otherSide && capBinds ? `Max ${fmt(myCap)}` : null,
      capReason:marketOpen && eligible && !otherSide && capBinds ? `At your ${fmt(myCap)} limit` : null,
      onPick:(stake = tapStake) => onPick({ ...pick, stake }) };
  });
  /* free-for-all: your own name leads the board */
  /* the table's spots stand where the draw put them, so a spot never moves */
  const table = useMemo(() => contest ? tableView(state, events, contest, me) : null,
    [state, events, contest?.id, contest?.revision, me]); // eslint-disable-line react-hooks/exhaustive-deps
  /* one board, one card shape: a win line's row is kept on every card when any has one */
  const winSlot = picks.some(pick => !!pick.winLine?.text);
  /* a matchup keeps two lines of stacks; three sides or more keep one */
  const lines = picks.length > 2 ? 1 : 2;
  /* every side of a board takes the tallest identity any side needs, so
     both halves of a matchup stay level (a named pair beside an unnamed one) */
  const identity = picks.some(pick => pick.players.length > 2 || pick.named) ? "team"
    : picks.some(pick => pick.players.length === 2) ? "pair" : "solo";
  /* a wide board says its cap once, on the meter; each row's + goes quiet */
  picks.forEach(pick => { pick.winSlot = winSlot; pick.lines = lines; if (lines === 1 && pick.capLabel) pick.capLabel = ""; });
  /* a side closed to you points at the side that is yours: your own (a
     competitor), else the one your chips are already on */
  const yoursKey = restricted ? ownSide.key : heldSide;
  const yoursAt = yoursKey === null || yoursKey === undefined ? -1 : picks.findIndex(pick => pick.key === yoursKey);
  picks.forEach((pick, i) => {
    if (!pick.unavailableReason || yoursAt < 0 || yoursAt === i) return;
    pick.pointer = lines === 1 ? yoursAt < i ? "up" : "down" : yoursAt < i ? "back" : "next";
  });
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
    watched.current = ev && contest ? { ev, contest, winSlot, termsSlot, identity,
      label:contest.kind === "ffa" ? ev.name || "Winner" : contest.label } : null;
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
  /* the rack keeps its place while a decided board holds, so the board
     under it never jumps; it takes taps again when the next contest deals */
  const rackShown = !!(me && ev && marketOpen);
  const rackLive = rackShown && !holding;
  const rackRef = useRef(null);
  /* the tray is glass: it gives a little under the chip you press */
  useGlassTilt(rackRef, { enabled:rackLive, max:2 });
  const rackCapped = room < PT && myPts - myExp >= PT;
  const openEvent = onEvent && headEv ? () => onEvent(headEv) : null;
  return <div className={`fd-wagers${rackShown ? " has-rack" : ""}`}
    style={{ "--fd-wagers-numerals":DISPLAY, "--fd-wagers-body":SANS }}>
    {/* The board's head is the viewport's one painting: the session's sky to
        floor, the game's name lettered on the horizon with its medallion
        seated there, the whole pane the way into the event. Under it, on
        the pane's clear glass, your chips (the rack) while betting is open,
        else the market's state. The rack sits above the board in the
        page's flow, so nothing on the board is ever under it. */}
    {headEv ? <header className={`fd-wagers-event-heading fd-lamp${liveDot ? " is-live" : ""}`}>
      <div className="fd-wagers-scene fd-glass-scene">
        <GlassArt clear />
        {/* the name is the pane's button; its ::after stretches over the
            whole painting, so the scene is one target */}
        <h1 className="fd-show fd-glass-letter">{openEvent
          ? <button type="button" className="fd-wagers-scene-button" onClick={openEvent} aria-label={`${headEv.name}: ${contextLabel}`}>
            <EventName name={headEv.name} /></button>
          : <EventName name={headEv.name} />}</h1>
        <span className="fd-wagers-scene-side">
          {openEvent && <span className="fd-wagers-scene-open" aria-hidden="true"><Icon name="open" size={18} /></span>}
          {GameMark && <span className="fd-wagers-event-mark"><GameMark id={headEv.game} variant={headEv.variant} size={34} /></span>}
        </span>
      </div>
      {!rackShown && <div className="fd-wagers-event-meta">
        <span className={`fd-wagers-status${liveDot ? " is-open" : ""}`}>
          <i className={liveDot ? "fd-insert fd-beat-dot" : "fd-insert is-done"} aria-hidden="true" />{holding ? "Settled" : status}
        </span>
      </div>}
    </header> : <PageHeading title="Bets" />}

    {settling && <SettleStrip key={settling.id} me={me} settling={settling} />}

    {holding && <HeldBoard key={held.id} state={state} me={me} held={held} view={heldView} onSkip={endHold} />}

    {/* frozen: your weekend's bets as one record, and your last card */}
    {frozen && !ev && !holding && <BetRecord group={me ? settledByPlayer.find(group => group.player === me) : null}
      me={me} onLastCard={onLastCard} />}

    {!frozen && !ev && !holding && <section className={`fd-wagers-waiting fd-glass-field fd-field-info${finaleClosed ? " is-finished" : ""}`}>
      <div className="fd-wagers-waiting-copy">
        <h2>{finaleClosed ? "Betting is closed for the finale"
          : state.live ? "Between events" : "Betting opens with the first event"}</h2>
        {!finaleClosed && <ActionButton variant="secondary" onClick={onEvents}>Browse the events</ActionButton>}
      </div>
    </section>}

    {ev && !holding && <section className="fd-wagers-event">
      {/* the contest by its name, and what it pays as a lit amber label; a
          board with odds says each side's payout on that side instead */}
      {/* a contest opened before pools keeps its fixed payout line */}
      {contest && !terms?.pool && !terms?.odds && <div className="fd-wagers-contest-heading">
        <PayLamp mult={contestMult(contest)} /></div>}
      {contest && table && picks.length > 0 ? <div className={`fd-wagers-play${dealing ? " is-dealing" : ""}`}>
        <BetTable table={table} spots={picks.length} contestLabel={contest.kind !== "ffa" ? contest.label : null}
          marketOpen={marketOpen} phase={marketOpen ? null : status}
          focus={table.shape === "grid" ? <GridFocus table={table} spots={table.spots} me={me} tapStake={tapStake}
            names={new Map(picks.map(pick => [String(pick.key), pick.name]))} /> : null}
          dealer={<LockSweep lockKey={contest.id} locked={contest.phase !== "betting-open"} />}>
          {picks.map(pick => <Spot {...pick} key={`${contest.id}:${pick.key}`} spot={table.spots.find(item => item.key === pick.key)}
            table={table} shape={table.shape} denoms={RACK_DENOMS} contestLabel={contest.label} />)}
        </BetTable>
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

    {/* your seat: the rack docked along the bottom edge, over the tab bar */}
    {rackShown && <section ref={rackRef} className={`fd-wagers-rack is-seat${holding ? " is-resting" : ""}`}
      aria-label="Choose your betting chip" inert={holding ? "" : undefined}>
      <span className="fd-sr" role="status">{holding ? "Settled" : status}</span>
      <div className="fd-wagers-rack-row">
        <RoomReadout cap={myCap} room={room} capBinds={capBinds} capped={rackCapped} />
        <div className="fd-wagers-denoms" role="group" aria-label="Chip value per tap">
          {RACK_DENOMS.map(value => {
            const affordable = value <= room;
            return <RackChip key={value} value={value} disabled={!affordable}
              selected={tapStake === value && affordable} onClick={() => { tapTick(); setDenom(value); }} />;
          })}
        </div>
      </div>
      <StackMeter pts={myPts} cap={myCap} bets={wagerRisk} duels={duelAntes} room={room} />
    </section>}
    <DragChip me={me} />
  </div>;
}

/* the rack chip under your finger while it is dragged over the table */
function DragChip({ me }) {
  const drag = useTableDrag();
  if (!drag || typeof document === "undefined") return null;
  return createPortal(<span className="fd-table-dragchip" style={{ left:drag.x, top:drag.y }} aria-hidden="true">
    <BankChip p={me} size={RACK_COIN + 6} val={drag.stake} /></span>, document.body);
}

export { Wagers, wagerPickLabel, mergeWagerLines, RACK_DENOMS };
