/* The table on the TV (Oct 13, "your seat at the table"): the felt every
   phone is a seat at, seen from above at room scale. One printed felt, a
   spot per side that never moves; the room's money rises in each spot as
   an amber fill to its share of the pool, its % on a reel, and the bettors'
   own chip stacks stand on it with their faces. The contest is printed in
   one corner and the pool in the other.

   Shapes (tableModel.tableShape): a matchup is two big spots, three to six
   sides one row, seven or more a 7-wide grid. A big bracket's match is one
   band above the bracket. Moments, each on the server clock so every TV in
   the house plays them together: a chip that lands drops onto its spot (a
   fresh frame only); Lock and start sweeps the dealer's glove across the
   felt and stamps "No more bets"; a decided contest floods its winner's
   spot, stamps WON, rakes the losers' chips to the bank and grows the
   winners' stacks, and a long shot that won lights "Paid 3.4×". The
   sounds are roomSound's (S5 chips, S8 lock, S10 to S12 the settle). */
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { priceText } from "../../../shared/core.js";
import { ChipFace } from "../identity/PlayerIdentity.jsx";
import { DISC_OVERLAP } from "../identity/discLetters.js";
import { ScoreReel } from "../../ui/ScoreReel.jsx";
import { OneSafe } from "../../ui/OneSafe.jsx";
import { useFreshChange, useReducedMotion } from "../../lib/motion.js";
import { RenameText } from "../teams/RenameText.jsx";
import { BetStacks, FitStacks } from "../wagers/BetStacks.jsx";
import { STACK_CAP, decidedContest, fitLevels, stackName } from "../wagers/betStacks.js";
import { fillLevel, fmtChips, settledTable, tableView } from "../wagers/tableModel.js";
import { DealerGlove } from "../wagers/DealerGlove.jsx";
import { PayLamp, TVWinLine, useContestWinLines } from "./TVCards.jsx";
import { contestLamp, contestSideView, oddsLine, sideNameFit } from "./tvModel.js";
import { SETTLE, SWEEP, SWEEP_MS, TABLE_H, BAND_TABLE_H, backerPile, entryContest, spotX, sweepWindow, tableLayout, chipLayer, glovePath } from "./tvTable.js";
import { ChipPhysicsLayer, useChipPhysics } from "../chips3d/ChipPhysicsLayer.jsx";
import { roomChipsLanded } from "../../lib/sound.js";
import "./tv-table.css";

/* the room's %: a reel with a smaller % plate after it; the long shot lit */
export function TVPct({ pct, long = false, size = 96, teach = false, className = "" }) {
  return <span className={`tvt-pct${long ? " is-long" : ""}${teach ? " is-teach" : ""}${className ? ` ${className}` : ""}`}
    style={{ fontSize:size }}>
    <ScoreReel value={pct} tone={long ? "chip" : null} slim label={`${pct}%`} />
    <span className="tvt-pct-sign" aria-hidden="true">%</span>
  </span>;
}

/* photo chips, overlapped past one when a side is a team */
function Faces({ players, size, overlap = players.length > 1 }) {
  return <span className={`tv-faces tvt-faces${overlap ? " is-overlap" : ""}`}
    style={overlap ? { "--overlap":`${-Math.round(size * DISC_OVERLAP)}px` } : undefined}>
    {players.map(p => <ChipFace key={p} p={p} size={size} />)}
  </span>;
}
const facesWidth = (n, size, overlap = n > 1) => overlap ? size + (n - 1) * size * (1 - DISC_OVERLAP) : n * size + (n - 1) * 8;
/* the faces a side's column holds: smaller for a team, never past the column */
const faceFor = (n, size, width) => {
  if (n <= 1) return size;
  const base = n > 3 ? Math.round(size * 0.66) : n > 2 ? Math.round(size * 0.8) : size;
  return Math.max(36, Math.min(base, Math.floor(width / (1 + (n - 1) * (1 - DISC_OVERLAP)))));
};

/* a side's name, one size on the whole felt (the smallest any side needs) */
function SpotName({ name, size, lines }) {
  return <RenameText name={name} as="div" className="tvt-name">
    <span style={{ fontSize:size }}>{lines.length > 1 ? <>{lines[0]}<br />{lines[1]}</> : name}</span>
  </RenameText>;
}

/* a chip that lands on a spot drops onto it: a new bettor's stack (or a
   grid cell's face) falls from above on a fresh frame. A stack that grows
   drops its own new chips (ChipStack). */
function useLandings(ref, spot, scope) {
  const players = spot.stacks.map(item => item.player).join(",");
  const change = useFreshChange(players, scope);
  useLayoutEffect(() => {
    if (!change.animate || !ref.current) return;
    const before = new Set(String(change.from || "").split(",").filter(Boolean));
    String(change.to || "").split(",").filter(p => p && !before.has(p)).forEach(p => {
      ref.current.querySelectorAll(`[data-stack-player="${p}"], [data-backer="${p}"]`).forEach(el => el.animate?.([
        { transform:"translateY(-140px) scale(1.15)", opacity:0 },
        { transform:"translateY(6px) scale(1)", opacity:1, offset:0.62 },
        { transform:"translateY(-3px)", offset:0.8 },
        { transform:"none", opacity:1 },
      ], { duration:520, easing:"cubic-bezier(.3,.7,.35,1)" }));
    });
  }, [change.changeId]); // eslint-disable-line react-hooks/exhaustive-deps
}

/* every felt on the table stands its stacks at one chip size: each reports
   the level it needs, all stand at the deepest */
function useSharedFit(contestId, spots, layout) {
  const [need, setNeed] = useState({});
  const ladder = Math.max(0, ...spots.map(spot => spot.stacks.length));
  const floor = Math.max(0, ...spots.map(spot => need[`${contestId}:${String(spot.key)}`] || 0));
  const levels = useMemo(() => fitLevels(ladder, { chip:layout.chip || 48, cap:STACK_CAP, min:layout.chipMin || 30 }).length,
    [ladder, layout.chip, layout.chipMin]);
  const report = key => level => setNeed(prev => prev[key] === level ? prev : { ...prev, [key]:level });
  return { ladder, floor:Math.min(floor, Math.max(0, levels - 1)), report:spot => report(`${contestId}:${String(spot.key)}`) };
}

/* one spot of an open or locked table */
function Spot({ state, spot, name, fit, layout, winLines = null, teach = false, contestId, nameSize, physics = false }) {
  const ref = useRef(null);
  useLandings(ref, spot, `${contestId}:${String(spot.key)}`);
  const n = spot.players.length;
  const cls = `tvt-spot is-${layout.band ? "band" : layout.shape}${layout.wide ? " is-wide" : ""}${spot.long ? " is-long" : ""}${spot.stacks.length ? " has-chips" : ""}`;
  const style = { "--fill":fillLevel(spot.share), width:layout.spotW, height:layout.spotH };
  const label = `${name}: ${spot.pct}% of the pool${spot.stacks.length ? `, ${spot.stacks.length} backing` : ""}`;
  const stacks = !physics && spot.stacks.length > 0 && <FitStacks stacks={spot.stacks} total={0} chip={layout.chip} cap={STACK_CAP}
    min={layout.chipMin} className="tv-stacks-fit tvt-stacks" names={p => stackName(state, p)} valueAt={layout.band ? "side" : "below"}
    ladder={fit.ladder} floor={fit.floor} onLevel={fit.report(spot)} />;
  const pct = <TVPct pct={spot.pct} long={spot.long} size={layout.pct} teach={teach && spot.long} />;
  const legacy = !spot.pool && spot.mult > 1 ? <PayLamp text={`Winner pays ${spot.mult}:1`} lit className="tvt-pays" /> : null;

  if (layout.shape === "grid") {
    /* the face and its backers' pile on top, the name, the % standing on the fill */
    const pile = backerPile(spot.stacks, 3);
    const face = faceFor(n, layout.face, layout.spotW * 0.4);
    return (
      <div ref={ref} className={cls} style={style} role="group" aria-label={label} data-spot={String(spot.key)}>
        <span className="tvt-fill" aria-hidden="true" />
        <div className="tvt-ink">
          <div className="tvt-top"><Faces players={spot.players} size={face} />
            <span className="tvt-pile" aria-hidden="true">
              {pile.shown.map(p => <span key={p} className="tvt-backer" data-backer={p}><ChipFace p={p} size={layout.backer} /></span>)}
              {pile.more > 0 && <b className="tvt-more">+{pile.more}</b>}
            </span></div>
          <div className="tvt-name is-cell" style={{ fontSize:nameSize || layout.name }}><RenameText name={name} /></div>
          {pct}
        </div>
      </div>
    );
  }
  const colW = layout.band ? 0 : layout.wide ? Math.floor(layout.spotW * 0.42) - 28 : layout.spotW - 36;
  if (layout.band) {
    const face = faceFor(n, layout.face, 150);
    return (
      <div ref={ref} className={`${cls}${spot.right ? " is-right" : ""}`} style={style} role="group" aria-label={label} data-spot={String(spot.key)}>
        <span className="tvt-fill" aria-hidden="true" />
        <div className="tvt-ink">
          <Faces players={spot.players} size={face} />
          <div className="tvt-band-who"><SpotName name={name} {...nameSize} />{legacy}</div>
          {pct}
          <div className="tvt-band-felt">{stacks}</div>
        </div>
      </div>
    );
  }
  const face = faceFor(n, layout.face, colW);
  return (
    <div ref={ref} className={cls} style={style} role="group" aria-label={label} data-spot={String(spot.key)}>
      <span className="tvt-fill" aria-hidden="true" />
      <div className="tvt-ink">
        <div className="tvt-col">
          <Faces players={spot.players} size={face} />
          <SpotName name={name} {...nameSize} />
          {winLines && <div className="tvt-winline"><TVWinLine lines={winLines} sideKey={spot.key} /></div>}
          {legacy}
          {pct}
        </div>
        <div className="tvt-felt-stacks">{stacks}</div>
      </div>
    </div>
  );
}

/* the sides' names at one size: the smallest any spot needs */
function nameSizing(names, layout) {
  if (layout.shape === "grid") {
    /* one line a cell, every cell at the size the longest name allows */
    const longest = Math.max(4, ...names.map(name => String(name || "").length));
    const size = Math.max(24, Math.min(layout.name, Math.floor((layout.spotW - 30) / (longest * 0.5))));
    return names.map(() => size);
  }
  const width = layout.band ? 330 : layout.wide ? Math.floor(layout.spotW * 0.42) - 28 : layout.spotW - 36;
  const fits = names.map(name => sideNameFit(name, width, { max:layout.nameMax, min:layout.nameMin, caps:true }));
  const size = Math.min(...fits.map(fit => fit.size));
  return fits.map(fit => ({ size, lines:fit.lines }));
}

/* The felt's two printed corners: the contest, and the pool (a legacy
   contest's fixed payout in its place). */
function FeltHead({ label, live = false, table, contest, detail = null }) {
  return (
    <header className="tvt-head">
      <span className="tvt-label">{label && live && <i className="fd-beat-dot tv-beat" aria-hidden="true" />}
        {label && <span className="tvt-label-text"><OneSafe text={label} /></span>}{detail && <span className="tvt-detail">{detail}</span>}</span>
      {table.pool ? <span className="tvt-pool"><small>Pool</small>
        <ScoreReel value={table.total} tone="chip" slim label={fmtChips(table.total)} /></span>
        : oddsLine(contest) ? <PayLamp text={oddsLine(contest)} className="tvt-odds" /> : <span />}
    </header>
  );
}

/* "No more bets": the dealer's glove sweeps the felt from the lock's own
   server time; a late TV joins mid-sweep. Reduced motion: the words alone. */
export function LockSweep({ lockAt, clock, width }) {
  const reduced = useReducedMotion();
  const [win] = useState(() => sweepWindow(lockAt, clock()));
  const [on, setOn] = useState(!!win);
  useEffect(() => {
    if (!win) return undefined;
    const timer = setTimeout(() => setOn(false), Math.max(0, SWEEP_MS - win.elapsed));
    return () => clearTimeout(timer);
  }, [win]);
  if (!win || !on) return null;
  return (
    <div className={`tvt-sweep${reduced ? " is-still" : ""}`} aria-hidden="true"
      style={{ "--tl":`${-Math.round(win.elapsed)}ms`, "--sweep-w":`${width}px`, "--sweep-ms":`${SWEEP_MS}ms`,
        "--glove-ms":`${SWEEP.gloveMs}ms`, "--words-at":`${SWEEP.words}ms` }}>
      {!reduced && <span className="tvt-sweep-glove"><DealerGlove pose="flat" size={220} /></span>}
      <span className="fd-show tvt-sweep-words">No more bets</span>
    </div>
  );
}

/* The live table: an open market, or a locked one in play. */
export function TVTable({ state, events, ev, contest, width, height = TABLE_H, band = false, teach = false, clock = () => Date.now() }) {
  const table = useMemo(() => tableView(state, events, contest), [state, events, contest]);
  const host = useRef(null);
  const reduced = useReducedMotion();
  const physics = useChipPhysics({ tv:true, want:table.staked > 0 });
  const layout = tableLayout({ shape:table.shape, count:table.spots.length, width, height, band });
  const names = contest.sides.map(side => contestSideView(state, ev, contest, side).name);
  const sizing = nameSizing(names, layout);
  const fit = useSharedFit(contest.id, table.spots, layout);
  const lines = useContestWinLines(state, ev, table.shape === "match" && !band ? contest : null, events);
  const anyLine = lines.length > 0 && table.spots.some(spot => lines.some(line => line && line.key === spot.key));
  const lamp = contestLamp(contest);
  const open = contest.phase === "betting-open";
  const lockAt = Number(state.eventOps?.[ev.id]?.bettingLockedAt) || 0;
  const upNow = contest.kind === "match";
  const label = upNow ? matchLabel(contest.label) : contest.label !== ev.name ? contest.label : null;
  const spots = table.spots.map((spot, i) => <Spot key={String(spot.key)} state={state} spot={band && i === 1 ? { ...spot, right:true } : spot}
    name={names[i]} fit={fit} layout={layout} winLines={anyLine ? lines : null} teach={teach} contestId={contest.id} nameSize={sizing[i]}
    physics={physics} />);
  const chips = chipLayer(layout);
  return (
    <section ref={host} className={`tvt tv-glass is-${band ? "band" : table.shape}${open ? " is-open" : " is-locked"}${lamp ? " fd-lamp is-live" : ""}`}
      style={{ width, height }} aria-label={label || ev.name}>
      {band ? <div className="tvt-band">
        {spots[0]}
        <div className="tvt-band-mid">
          {table.pool ? <><small>Pool</small><ScoreReel value={table.total} tone="chip" slim label={fmtChips(table.total)} /></>
            : oddsLine(contest) ? <PayLamp text={oddsLine(contest)} /> : null}
        </div>
        {spots[1]}
      </div> : <>
        <FeltHead label={label} live={upNow} table={table} contest={contest} />
        <div className={`tvt-body is-${table.shape}`} style={{ "--cols":layout.cols, "--gap":`${table.shape === "grid" ? 12 : table.shape === "row" ? 16 : 24}px` }}>
          {spots}
        </div>
      </>}
      {physics && <ChipPhysicsLayer host={host} quality="tv" contestId={contest.id} phase={open ? "open" : "locked"}
        spots={table.spots.map(spot => ({ key:spot.key, stacks:spot.stacks }))} chip={chips.chip} chipMin={chips.min} pairs={chips.pairs}
        areaSelector={CHIP_AREA} keepoutSelector={CHIP_KEEPOUT}
        label={chips.labels ? stackPlate(state) : null} clock={clock} reducedMotion={reduced} onLand={roomChipsLanded}
        lockSweep={!open && lockAt > 0 ? { at:lockAt + SWEEP.glove, ms:SWEEP.gloveMs, ...glovePath.sweep(width) } : null} />}
      {!open && lockAt > 0 && <LockSweep key={lockAt} lockAt={lockAt} clock={clock} width={width} />}
    </section>
  );
}

/* the chip layer stands its stacks anywhere on a spot's felt clear of what reads there */
const CHIP_AREA = ".tvt-ink";
const CHIP_KEEPOUT = ".tvt-faces, .tvt-name, .tvt-pct, .tvt-winline, .tvt-pays, .tvt-verdict, .tvt-pile";
/* under each real stack, its plate: what it holds, whose it is (a fold's "+N") */
const plateName = (state, item) => item.group ? `+${item.count}` : stackName(state, item.player);
export const stackPlate = state => ({
  h:60,
  w:item => Math.ceil(Math.max(fmtChips(item.stake).length * 12, plateName(state, item).length * 11)) + 8,
  render:item => <span className="tvt-c3-plate"><b>{fmtChips(item.stake)}</b><span>{plateName(state, item)}</span></span>,
});

/* "Round 1 · Match 3" reads "Round 1 Match 3", "Semifinals · Match 2"
   "Semifinal 2" (the shape of bracketMatchName in core) */
export const matchLabel = label => {
  const match = /^(.*) · Match (\d+)$/.exec(String(label || ""));
  if (!match) return label;
  const [, round, n] = match;
  if (/^Finals?$/.test(round)) return "Final";
  return /\d$/.test(round) ? `${round} Match ${n}` : `${round.replace(/s$/, "")} ${n}`;
};

/* One settled spot: the winner floods and stamps WON beside its % (with
   the price it paid when a long shot won it), its stacks grow by their
   payout; a loser's fill drains and its chips go to the bank. Every delay
   counts from the decision (`elapsed` is how far in this TV joined). On
   the band the winner's WON stands where its % was. */
function SettledSpot({ state, spot, name, layout, nameSize, elapsed, physics = false }) {
  const n = spot.players.length;
  const won = !!spot.won;
  const cls = `tvt-spot is-${layout.band ? "band" : layout.shape}${layout.wide ? " is-wide" : ""} is-settled ${won ? "is-won" : "is-lost"}${spot.right ? " is-right" : ""}`;
  const slots = layout.band ? 3 : layout.shape === "match" ? (layout.wide ? 6 : 3) : 2;
  const size = layout.band ? 34 : layout.shape === "match" ? (layout.wide ? 52 : 40) : 36;
  const at = ms => Math.round(ms - elapsed);
  const stacks = !physics && spot.stacks.length > 0 && <BetStacks stacks={spot.stacks} size={size} names={layout.band ? null : p => stackName(state, p)}
    delay={won ? at(SETTLE.pay) : at(SETTLE.rake)} className="tv-stacks tvt-stacks" slots={slots} valueAt={layout.band ? "side" : "below"} />;
  const face = faceFor(n, layout.face, layout.band ? 150 : layout.wide ? Math.floor(layout.spotW * 0.42) - 28 : layout.spotW - 36);
  const verdict = won && <span className="tvt-verdict">
    <span className="fd-show tvt-won" style={{ animationDelay:`${at(SETTLE.won)}ms` }}>Won</span>
    {spot.long && spot.price ? <span className="tvt-paid" style={{ animationDelay:`${at(SETTLE.paid)}ms` }}>
      <i className="fd-insert" aria-hidden="true" />Paid {priceText(spot.price)}</span> : null}
  </span>;
  const pct = <TVPct pct={spot.pct} long={won && spot.long} size={layout.pct} />;
  const style = { "--fill":fillLevel(spot.share), width:layout.spotW, height:layout.spotH,
    "--flood-at":`${at(SETTLE.flood)}ms`, "--drain-at":`${at(SETTLE.rake)}ms` };
  const label = `${name}${won ? " won" : ""}: ${spot.pct}% of the pool`;
  if (layout.band) return (
    <div className={cls} style={style} role="group" aria-label={label} data-spot={String(spot.key)}>
      <span className="tvt-fill" aria-hidden="true" />
      <div className="tvt-ink">
        <Faces players={spot.players} size={face} />
        <div className="tvt-band-who"><SpotName name={name} {...nameSize} /></div>
        {won ? verdict : pct}
        <div className={`tvt-band-felt${won ? "" : " is-raked"}`}>{stacks}</div>
      </div>
    </div>
  );
  return (
    <div className={cls} style={style} role="group" aria-label={label} data-spot={String(spot.key)}>
      <span className="tvt-fill" aria-hidden="true" />
      <div className="tvt-ink">
        <div className="tvt-col">
          <Faces players={spot.players} size={face} />
          <SpotName name={name} {...nameSize} />
          <div className="tvt-pctrow">{won && layout.shape === "row" ? null : pct}{verdict}</div>
        </div>
        <div className={`tvt-felt-stacks is-settle${won ? "" : " is-raked"}`}>{stacks}</div>
      </div>
    </div>
  );
}

/* The decided contest (tvModel advanceMoment): its table settling, from
   the decision's server time. The rake: the glove crosses the losing spots
   toward the pool's corner (the bank) as their chips leave. */
export function TVSettledTable({ state, events, ev, advance, width, height = TABLE_H, band = false, clock = () => Date.now() }) {
  const entry = useMemo(() => (state.eventOps?.[ev.id]?.contestStack || []).find(item => item.id === advance.id)
    || state.eventOps?.[ev.id]?.lastContest, [state, ev.id, advance.id]);
  const contest = useMemo(() => entryContest(state, ev, entry), [state, ev, entry]);
  const decided = useMemo(() => contest ? decidedContest(state, events, ev.id, contest) : null, [state, events, ev.id, contest]);
  const table = useMemo(() => contest && decided ? settledTable(state, contest, decided) : null, [state, contest, decided]);
  const [elapsed] = useState(() => Math.max(0, clock() - Number(advance.decidedAt)));
  const reduced = useReducedMotion();
  const host = useRef(null);
  const physics = useChipPhysics({ tv:true, want:!!table && table.staked > 0 });
  if (!table) return null;
  const layout = tableLayout({ shape:table.shape, count:table.spots.length, width, height, band });
  const names = contest.sides.map(side => contestSideView(state, ev, contest, side).name);
  const sizing = nameSizing(names, layout);
  /* the glove starts on the first losing spot with chips and rakes them to the pool's corner */
  const rakeFrom = table.spots.findIndex(spot => !spot.won && spot.stacks.length > 0);
  const rake = rakeFrom >= 0;
  const rakeTo = Math.round(band ? width / 2 - 90 : width - 260);
  const rakeLeft = rake && rakeTo < spotX(layout, rakeFrom, width);
  /* what the win means next ("Semifinals next"); a final's win says nothing more */
  const detail = advance.next && !/^Win/.test(advance.verb || "") ? `${advance.next} next` : null;
  const spots = table.spots.map((spot, i) => <SettledSpot key={String(spot.key)} state={state}
    spot={band && i === 1 ? { ...spot, right:true } : spot} name={names[i]} layout={layout} nameSize={sizing[i]} elapsed={elapsed}
    physics={physics} />);
  const chips = chipLayer(layout);
  const decidedAt = Number(advance.decidedAt) || clock();
  const rakeX0 = rake ? spotX(layout, rakeFrom, width) + layout.spotW * 0.15 : 0;
  const settle = { payAt:decidedAt + SETTLE.pay,
    rake:{ at:decidedAt + SETTLE.rake + 100, ms:SETTLE.rakeMs, ...glovePath.rake(rakeX0, rakeTo, band), to:{ x:band ? width / 2 : width - 200, y:band ? 16 : 28 } } };
  return (
    <section ref={host} className={`tvt tv-glass is-settled is-${band ? "band" : table.shape}${reduced ? " is-still" : ""}`}
      style={{ width, height, "--tl":`${-Math.round(elapsed)}ms` }} role="status"
      aria-label={`${advance.name} ${advance.verb}${detail ? `, ${detail}` : ""}`}>
      {band ? <div className="tvt-band">
        {spots[0]}
        <div className="tvt-band-mid">
          {table.pool && <><small>Pool</small><ScoreReel value={table.total} tone="chip" slim label={fmtChips(table.total)} /></>}
        </div>
        {spots[1]}
      </div> : <>
        <FeltHead label={matchLabel(contest.label)} table={table} contest={contest} detail={detail} />
        <div className={`tvt-body is-${table.shape}`} style={{ "--cols":layout.cols, "--gap":`${table.shape === "row" ? 16 : 24}px` }}>
          {spots}
        </div>
      </>}
      {rake && !reduced && <span className="tvt-rake" aria-hidden="true"
        style={{ "--rake-at":`${Math.round(SETTLE.rake - elapsed)}ms`, "--rake-ms":`${SETTLE.rakeMs}ms`,
          "--rake-x0":`${Math.round(spotX(layout, rakeFrom, width) + layout.spotW * 0.15)}px`, "--rake-x1":`${rakeTo}px` }}>
        <DealerGlove pose="flat" size={band ? 120 : 180} flip={rakeLeft} /></span>}
      {physics && <ChipPhysicsLayer host={host} quality="tv" contestId={`${contest.id}:settled`} phase="settled"
        spots={table.spots.map(spot => ({ key:spot.key, stacks:spot.stacks }))} chip={chips.chip} chipMin={chips.min} pairs={chips.pairs}
        areaSelector={CHIP_AREA} keepoutSelector={CHIP_KEEPOUT}
        label={chips.labels ? stackPlate(state) : null} clock={clock} reducedMotion={reduced} settle={settle} />}
    </section>
  );
}

export { BAND_TABLE_H, TABLE_H };
