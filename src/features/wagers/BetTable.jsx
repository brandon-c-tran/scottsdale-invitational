/* The table (Oct 13, "your seat at the table"): the current contest as one
   printed felt, a spot per side. Your seat is the dock along the bottom
   (the rack, what is left to bet); the TV is the same felt from above.

   A spot is a printed betting square: its side's faces and name, the room's
   % on a reel, and an amber fill rising inside it to that share of the
   pool (a spot never moves as money lands, the fill does). Everyone's
   chips stand on it with their faces; yours wears your filament ring and
   reads what it brings back ("300 → 1,020"). Tap a spot to drop the rack's
   chip; tap your stack to take the last one back; drag a rack chip across
   the spots and each previews what that chip would bring back. A face is
   its own target: it opens the player's card. Layouts: a matchup is two
   big spots, three to six sides one row, seven or more a 7-wide grid. */
import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { PT, disp, priceText } from "../../../shared/core.js";
import { Avatar, ChipFace } from "../identity/PlayerIdentity.jsx";
import { ScoreReel } from "../../ui/ScoreReel.jsx";
import { Icon } from "../../ui/Icon.jsx";
import { OneSafe } from "../../ui/OneSafe.jsx";
import { useFreshChange, useReducedMotion } from "../../lib/motion.js";
import { serverNow } from "../../lib/serverClock.js";
import { ChipPhysicsLayer, useChipPhysics } from "../chips3d/ChipPhysicsLayer.jsx";
import { playSound } from "../../lib/sound.js";
import { RenameText } from "../teams/RenameText.jsx";
import { ordinal } from "../standings/winImpact.js";
import { ChipStack, groupChip } from "./BetStacks.jsx";
import { Sheet } from "../../ui/controls.jsx";
import { groupStacks, stackChipCount, stackName } from "./betStacks.js";
import { backLine, fillLevel, fmtChips, nextBack } from "./tableModel.js";
import { useChipActions } from "./useChipActions.js";
import { DealerGlove } from "./DealerGlove.jsx";
import "./table.css";

/* ── the drag: one rack chip in the air at a time (module store) ── */
let drag = null;
const listeners = new Set();
const emit = () => listeners.forEach(fn => fn());
const subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn); };
const dragNow = () => drag;
export const useTableDrag = () => useSyncExternalStore(subscribe, dragNow, dragNow);
const drops = new Map();
let endedAt = 0;
/* a drag ends in a pointerup the browser also reads as a click: the rack ignores it */
export const tableDragJustEnded = () => Date.now() - endedAt < 400;
/* the rack calls these: start on a held chip, move, drop */
export const tableDrag = {
  start(stake, x, y) { drag = { stake, x, y, over:null }; emit(); },
  move(x, y) {
    if (!drag) return;
    const hit = typeof document !== "undefined" ? document.elementFromPoint(x, y)?.closest?.("[data-spot]") : null;
    const over = hit?.getAttribute("data-spot") ?? null;
    drag = { ...drag, x, y, over };
    emit();
  },
  end() {
    const was = drag;
    drag = null; endedAt = Date.now(); emit();
    if (was?.over != null) drops.get(was.over)?.(was.stake);
  },
  cancel() { drag = null; emit(); },
};

/* X8 on a spot, drawn so it fits its one row by construction: "Win",
   then who climbs (only when it is not the whole side, which the card
   already names: their faces, two at most and a count), then where to, as
   an up arrow and the place ("4th", "Tie 4th"), or the chips it posts
   ("+400"). The sentence is the accessible name. */
const WIN_FACES = 2;
export function BetWin({ state, line, side, inline = false }) {
  if (!line?.text) return null;
  const movers = line.players || [];
  const whole = movers.length >= side.length;
  const shown = whole ? [] : movers.slice(0, WIN_FACES);
  const extra = whole ? 0 : movers.length - shown.length;
  return <span className={`fd-wagers-win${inline ? " is-inline" : ""}${line.kind === "rank" ? " is-rank" : " is-chips"}`}
    role="img" aria-label={line.text}>
    <small>Win</small>
    {shown.length > 0 && <span className="fd-wagers-win-faces">
      {shown.map(player => <Avatar key={player} state={state} p={player} size={20} />)}
      {extra > 0 && <span className="fd-wagers-win-more">+{extra}</span>}</span>}
    {line.kind === "rank"
      ? <b className="fd-wagers-win-rank"><Icon name="up" size={14} />{line.tied ? "Tie " : ""}{ordinal(line.rank)}</b>
      : <b className="fd-wagers-win-chips">+{fmtChips(line.award)}</b>}
  </span>;
}

/* stacks a spot stands, by layout: a matchup's spot a full row, a row's
   spot two, a grid spot only its bettor count */
const SPOT_STACKS = { match:4, row:2, grid:2 };
const SPOT_CHIP = { match:30, row:22, grid:20 };

export function Spot({ spot, table, state, me, contestLabel, name, named = false, marketOpen, canPick, onPick, onRetract,
  onPlayer, tapStake, denoms, capLabel = null, unavailableReason = null, pointer = null, roleLabel = null, shape, settled = null,
  bets = null, winLine = null, winSlot = false }) {
  const mineRef = useRef(null), anchorRef = useRef(null);
  /* your open records on this side (`bets`: the side's pending lines, a
     legacy ticket without a contest id included), oldest chip first, so
     the take-back always lifts the newest chip */
  const latest = w => w.chips?.at(-1)?.ts || w.updatedAt || w.ts || 0;
  const mine = (bets || []).map(x => x.w).filter(w => w.player === me).sort((a, b) => latest(a) - latest(b));
  const mineChips = mine.flatMap(w => w.chips?.length ? w.chips.map(chip => chip.stake) : [w.stake]);
  const actions = useChipActions({ state, me, tapStake, mineTotal:spot.mine, mineChips, chipSize:SPOT_CHIP[shape] || 24,
    denoms, capped:!!capLabel, mineRef, anchorRef });
  const { act, busyKind, busyPlace, checking, actionError } = actions;
  const place = (stake = tapStake) => act("place", () => onPick(stake), { stake });
  const retract = () => {
    const last = mine.at(-1);
    return last ? act("remove", () => onRetract(last.id)) : undefined;
  };
  /* a rack chip dropped here places at its own value */
  useEffect(() => {
    if (!canPick) return undefined;
    const key = String(spot.key);
    drops.set(key, stake => { if (!busyPlace) place(stake); });
    return () => { if (drops.get(key)) drops.delete(key); };
  });
  const dragging = useTableDrag();
  const over = dragging && dragging.over === String(spot.key);
  const previewStake = over ? dragging.stake : tapStake;
  const preview = canPick && marketOpen ? nextBack(spot, table, previewStake) : 0;
  const fill = fillLevel(spot.share);
  /* the % rolls only for a fresh change; a moved % stays lit until shown */
  const moved = useFreshChange(spot.pct, `${table.contestId}:${spot.key}`);
  const [lit, setLit] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  useEffect(() => {
    if (!moved.animate) return undefined;
    setLit(true);
    const timer = setTimeout(() => setLit(false), 2400);
    return () => clearTimeout(timer);
  }, [moved.changeId]); // eslint-disable-line react-hooks/exhaustive-deps
  const yours = spot.mine > 0;
  const stacks = spot.stacks.filter(item => item.player !== me);
  const slots = SPOT_STACKS[shape] ?? 0;
  const pile = slots > 0 ? groupStacks(stacks, slots) : null;
  const cls = ["fd-spot", `is-${shape}`, yours ? "is-mine" : "", roleLabel ? "is-own-side" : "", spot.long ? "is-long" : "",
    unavailableReason ? "is-closed" : "", canPick ? "is-open" : "", over ? "is-over" : "", lit ? "is-moved" : "",
    busyKind ? `is-pending-${busyKind}` : "", settled ? `is-${settled}` : ""].filter(Boolean).join(" ");
  const pctLabel = `${spot.pct}%`;
  const faceSize = shape === "match" ? (spot.players.length > 2 ? 26 : 34) : shape === "row" ? 26 : 30;
  const showNames = shape === "match" && spot.players.length <= 2 && !named;
  return (
    <div className={cls} data-spot={String(spot.key)} ref={anchorRef} role="group"
      aria-label={`${name}: ${pctLabel} of the pool`} style={{ "--fill":fill }}>
      {/* the printed square, its fill rising to the side's share */}
      <span className="fd-spot-fill" aria-hidden="true" />
      {/* the spot itself is the bet: a tap drops the rack's chip */}
      {canPick && <button type="button" className="fd-spot-hit" disabled={busyPlace} onClick={() => place()}
        aria-label={`Place ${fmtChips(tapStake)} on ${name}`}
        aria-description={capLabel ? capLabel : preview ? `Brings back ${fmtChips(preview)} if ${name} wins` : undefined} />}
      <div className="fd-spot-ink">
        <div className="fd-spot-who">
          {/* your own side (you are playing): a filament tag over its faces, so
              the side closed to you reads at once as the other one (a grid's
              sides are all open, and your face is the spot) */}
          {roleLabel && <span className="fd-spot-role" aria-hidden="true">{roleLabel}</span>}
          <span className={`fd-spot-faces${spot.players.length > 3 ? " is-many" : ""}`} style={{ "--n":spot.players.length }}>
            {spot.players.map(player => <button key={player} type="button" className="fd-spot-face" disabled={!onPlayer}
              onClick={() => onPlayer?.(player)} aria-label={`View ${disp(state, player)}'s player card`}>
              <Avatar state={state} p={player} size={spot.players.length > 3 ? 24 : faceSize} />
            </button>)}
          </span>
          {(named || spot.players.length > 2
            ? <RenameText name={name} className="fd-spot-name" />
            : showNames ? <span className="fd-spot-name">{spot.players.map(p => stackName(state, p)).join(" & ")}</span>
              : <span className="fd-spot-name">{name}</span>)}
        </div>
        {/* X8: what this side's win does to the standings; every spot of
            a board keeps the row once any side has a line, so they stay level */}
        {winSlot && !settled && <div className="fd-spot-win">
          <BetWin state={state} line={winLine} side={spot.players} inline={shape === "row"} /></div>}
        <div className="fd-spot-pct" aria-hidden="true">
          <ScoreReel value={spot.pct} tone={spot.long ? "chip" : null} slim={shape !== "match"} label={pctLabel} />
          <span className="fd-spot-pct-sign">%</span>
        </div>
        {/* what a chip brings back: yours already down, else the next one;
            a side closed to you says so in that place instead */}
        {settled ? (yours
          ? <span className={`fd-spot-back ${settled === "won" ? "is-you" : "is-lost"}`}>
            {settled === "won" ? backLine(spot.mine, spot.back) : `−${fmtChips(spot.mine)}`}</span>
          : <span className="fd-spot-back is-blank" aria-hidden="true" />)
        : unavailableReason && marketOpen && !yours
          ? <span className="fd-spot-lock" role="img" aria-label={unavailableReason}>
            <Icon name="lock" size={16} />
          </span>
          : (yours
          ? <span className="fd-spot-back is-you" aria-label={`Your ${fmtChips(spot.mine)} brings back ${fmtChips(spot.back)}`}>
            {backLine(spot.mine, spot.back)}</span>
          : preview > 0 ? <span className={`fd-spot-back${over ? " is-over" : ""}`} aria-hidden="true">
            {backLine(previewStake, preview)}</span>
            : capLabel ? <span className="fd-spot-back is-cap">{capLabel}</span>
              : <span className="fd-spot-back is-blank" aria-hidden="true" />)}
        {/* the chips standing on the spot */}
        <div className="fd-spot-chips">
          {yours && (marketOpen
            ? <button type="button" ref={mineRef} className="fd-spot-mine" disabled={!!busyKind} onClick={retract}
              aria-label={`Retract your last chip on ${name}`}
              aria-description={mineChips.length ? `Remove ${fmtChips(mineChips.at(-1))} chips; ${fmtChips(spot.mine)} total on this pick` : undefined}>
              {<ChipStack p={me} stake={spot.mine} size={SPOT_CHIP[shape]} tag={false} tower mine />}
            </button>
            : <span ref={mineRef} className="fd-spot-mine" role="img" aria-label={`${fmtChips(spot.mine)} of your chips on ${name}`}>
              {<ChipStack p={me} stake={spot.mine} size={SPOT_CHIP[shape]} tag={false} tower mine />}
            </span>)}
          {pile && pile.shown.map(item => <button key={item.player} type="button" className="fd-spot-stack" disabled={!onPlayer}
            onClick={() => onPlayer?.(item.player)} aria-label={`${disp(state, item.player)}: ${fmtChips(item.stake)} on ${name}`}>
            <ChipStack p={item.player} stake={item.stake} size={SPOT_CHIP[shape]} tag={false} tower
              paid={settled === "won" ? item.paid || 0 : 0} settle={settled === "won" ? "won" : null} />
          </button>)}
          {/* the smallest backers past the spot's stacks, as one "+N" pile: a tap lists everyone */}
          {pile?.rest && <button type="button" className="fd-spot-stack is-group" onClick={() => setListOpen(true)}
            aria-label={`All ${spot.stacks.length} backing ${name}`} aria-description={`${pile.rest.count} more: ${fmtChips(pile.rest.total)} chips`}>
            <ChipStack chip={groupChip(pile.rest.count)} count={stackChipCount(pile.rest.total)} size={SPOT_CHIP[shape]} tag={false} tower />
          </button>}
        </div>
        {settled === "won" && <span className="fd-spot-won" aria-label="Won">WON</span>}
        {/* a long shot that came in says what it paid, quietly */}
        {settled === "won" && spot.long && <span className="fd-spot-paid">Paid {priceText(spot.price)}</span>}
      </div>
      {over && <span className="fd-spot-drop" aria-hidden="true">{backLine(spot.mine + previewStake, preview)}</span>}
      {checking && <span className="fd-spot-note" role="status">Checking…</span>}
      {actionError && !checking && <span className="fd-spot-note is-error" role="alert">{actionError}</span>}
      {listOpen && <Sheet title={name} onClose={() => setListOpen(false)} className="fd-spot-backers-sheet">
        <ol className="fd-spot-backers">{spot.stacks.map(item => <li key={item.player}>
          <button type="button" disabled={!onPlayer} onClick={() => onPlayer?.(item.player)}
            aria-label={`View ${disp(state, item.player)}'s player card (${fmtChips(item.stake)} chips)`}>
            <Avatar state={state} p={item.player} size={32} />
            <span>{item.player === me ? "You" : disp(state, item.player)}</span><b>{fmtChips(item.stake)}</b>
          </button></li>)}</ol>
      </Sheet>}

    </div>
  );
}

/* A side's share as a small spot of the table (Home, and anywhere a
   contest is named without its table): the %, the amber fill to that share,
   the long shot lit. */
export function SharePip({ spot }) {
  return <span className={`fd-share-pip${spot.long ? " is-long" : ""}${spot.mine > 0 ? " is-mine" : ""}`}
    style={{ "--fill":fillLevel(spot.share) }} aria-label={`${spot.pct}% of the pool`}>
    <span className="fd-share-pip-fill" aria-hidden="true" /><b>{spot.pct}</b><small>%</small></span>;
}

/* The grid's focus line: a 7-wide grid has no room for the payout in each
   spot, so the spot you are on (your chips, else the one under your drag)
   says it in one line under the grid. */
function GridFocus({ table, spots, names, me, tapStake }) {
  const dragging = useTableDrag();
  const overKey = dragging?.over ?? null;
  const spot = spots.find(item => String(item.key) === overKey) || spots.find(item => item.mine > 0) || null;
  if (!spot) return <p className="fd-table-focus is-blank" aria-hidden="true" />;
  const stake = overKey != null && String(spot.key) === overKey ? dragging.stake : 0;
  const back = stake ? nextBack(spot, table, stake) : spot.back;
  return <p className={`fd-table-focus${spot.mine > 0 && !stake ? " is-you" : ""}`} role="status">
    <b>{names.get(String(spot.key))}</b><span>{spot.pct}%</span>
    <span className="fd-table-focus-back">{backLine(stake ? spot.mine + stake : spot.mine, back)}</span>
  </p>;
}

/* The felt: the contest's label printed in its corner, the pool's total in
   the other, the spots, and the dealer's glove when betting locks. */
export function BetTable({ table, spots, contestLabel, phase, marketOpen, children, focus = null, dealer = null, settled = false }) {
  const shape = table.shape;
  /* the chips you can feel (chips3d): real 3D chips in each spot's chip
     area, tossed in as bets land, raked and paid on a result; the DOM
     stacks keep their taps underneath. Off (the switch, no WebGL, a slow
     phone) the flat stacks draw as before. */
  const feltRef = useRef(null);
  const physics = useChipPhysics({ tv:false, want:table.staked > 0 || !!settled });
  const reduced = useReducedMotion();
  return (
    <section className={`fd-table is-${shape}${marketOpen ? " is-open" : " is-locked"}`} aria-label={contestLabel || "Bets"}>
      <header className="fd-table-head">
        {contestLabel ? <h2 className="fd-table-label"><OneSafe text={contestLabel} /></h2> : <span />}
        <span className="fd-table-pool"><small>Pool</small>
          <ScoreReel value={table.total} tone="chip" slim label={fmtChips(table.total)} /></span>
      </header>
      <div ref={feltRef} className={`fd-table-felt${physics ? " has-chips3d" : ""}`} style={{ "--cols":shape === "grid" ? 3 : spots }}>
        {children}
        {physics && <ChipPhysicsLayer quality="phone" host={feltRef} contestId={table.contestId}
          phase={settled ? "settled" : marketOpen ? "open" : "locked"}
          spots={table.spots.map(spot => ({ key:spot.key, stacks:spot.stacks }))}
          chip={shape === "match" ? 30 : 22} chipMin={shape === "match" ? 18 : 14}
          areaSelector=".fd-spot-chips" reducedMotion={reduced} clock={serverNow} />}
        {dealer}
      </div>
      {focus}
      {!marketOpen && phase && <p className="fd-table-state">{phase}</p>}
    </section>
  );
}
export { GridFocus };

/* "No more bets": the dealer's glove sweeps across the felt the moment a
   fresh frame locks the market, and the room's % settle under it. Plays
   once per lock, never on a load or a correction; reduced motion shows the
   words alone. */
export function LockSweep({ lockKey, locked }) {
  const change = useFreshChange(locked ? lockKey : null, "lock");
  const [play, setPlay] = useState(null);
  useEffect(() => {
    if (!locked || !change.animate) return undefined;
    setPlay(change.changeId);
    playSound("S8", { bus:"you" });
    const timer = setTimeout(() => setPlay(null), 1900);
    return () => clearTimeout(timer);
  }, [change.changeId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!play) return null;
  return <div className="fd-table-sweep" key={play} aria-hidden="true">
    <span className="fd-table-sweep-glove"><DealerGlove pose="flat" size={64} /></span>
    <span className="fd-table-sweep-words">No more bets</span>
  </div>;
}

export { PT };
