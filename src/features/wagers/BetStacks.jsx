import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { DISPLAY } from "../../ui/theme.js";
import { ChipFace } from "../identity/PlayerIdentity.jsx";
import { usePlayerIdentity } from "../identity/PlayerIdentityContext.js";
import { COIN_FACETS, edgeInserts } from "../identity/chipCoin.js";
import {
  STACK_CAP, STACK_TILT as TILT, fitLevels, groupStacks, stackChipCount, stackGeometry, towerGap, towerTiers,
} from "./betStacks.js";
import "./bet-stacks.css";

const fmt = n => (Number(n) || 0).toLocaleString("en-US");
const r2 = n => Math.round(n * 100) / 100;
const FACET = 360 / COIN_FACETS;
/* a neat stack: the inserts mostly line up, a chip now and then turned */
const TURNS = [0, 0, 1, 0, 2, 0, 1];

/* One rim: the band between the front arcs of a chip's top and bottom
   faces, one darker tone of the chip's color, the skin's inserts printed
   through it the way a clay chip carries them. Flat, one ink. */
function Rim({ cx, rx, ry, yt, t, inserts, turn, stroke }) {
  const yb = yt + t;
  const band = `M${r2(cx - rx)} ${r2(yt)}L${r2(cx - rx)} ${r2(yb)}A${r2(rx)} ${r2(ry)} 0 0 0 ${r2(cx + rx)} ${r2(yb)}`
    + `L${r2(cx + rx)} ${r2(yt)}A${r2(rx)} ${r2(ry)} 0 0 1 ${r2(cx - rx)} ${r2(yt)}Z`;
  const marks = [];
  inserts.forEach((ink, index) => {
    if (!ink) return;
    const mid = ((index + turn) % COIN_FACETS) * FACET + FACET / 2;
    const a = Math.max(0, mid - FACET / 2), b = Math.min(180, mid + FACET / 2);
    if (b <= a) return;
    const pt = (deg, y) => `${r2(cx + rx * Math.cos(deg * Math.PI / 180))},${r2(y + ry * Math.sin(deg * Math.PI / 180))}`;
    marks.push(<polygon key={index} className="fd-stack-insert"
      points={`${pt(a, yt)} ${pt(b, yt)} ${pt(b, yb)} ${pt(a, yb)}`} />);
  });
  return <>
    <path className="fd-stack-rim" d={band} />
    {marks}
    <path className="fd-stack-seam" d={`M${r2(cx - rx)} ${r2(yb)}A${r2(rx)} ${r2(ry)} 0 0 0 ${r2(cx + rx)} ${r2(yb)}`}
      strokeWidth={stroke} />
  </>;
}

/* A bettor's chips on one side, as the physical stack of their own identity
   chip: one chip per 100, the top face carrying the jersey number, drawn
   last over the chip's own halo. Past the cap the stack stops growing and
   its value is stamped. A new chip drops on; a settled winner grows by its
   payout and a loser slides back to the bank. Presentation only. */
export function ChipStack({ p, stake, paid = 0, size = 40, cap = STACK_CAP, mine = false, settle = null,
  delay = 0, tag = true, tagSize = null, groups = null, chip = null, count = null, tower = false }) {
  /* a poker chip is not anyone's: its color, edge and stamp come with it,
     and it stacks one chip per chip rather than one per 100 */
  const player = usePlayerIdentity(p);
  const identity = chip ? { color:chip.color, isLight:!!chip.isLight, skin:chip.skin || "quad", num:chip.stamp } : player;
  const chips = count ?? stackChipCount(stake);
  const paidChips = count == null ? stackChipCount(paid) : 0;
  /* a bet board's stack past the cap stands a short tower on a break */
  const tiers = tower ? towerTiers(chips + paidChips, cap) : 0;
  const gap = tiers ? towerGap(size) : 0;
  const shown = Math.max(1, Math.min(chips + paidChips, cap)) + tiers;
  /* a capped winner still visibly grows: its stake keeps its share of the cap */
  const base = settle === "won" && chips + paidChips > cap
    ? Math.max(1, Math.min(cap - 1, Math.round(cap * chips / (chips + paidChips))))
    : Math.min(chips, shown);
  const paying = settle === "won" && shown > base;
  /* only chips that land after the stack is on screen drop in; the mark
     stays until the stack changes again, so an unrelated render cannot cut
     the drop short */
  const seen = useRef(null);
  if (!seen.current) seen.current = { shown, from:shown };
  else if (seen.current.shown !== shown)
    seen.current = { shown, from:shown > seen.current.shown ? seen.current.shown : shown };
  const dropped = settle ? 0 : Math.max(0, shown - seen.current.from);

  /* your ring rides on the felt under the stack; it never makes it taller */
  const { D, pad, rx, ry, t, cx, width, yFace, height:body } = stackGeometry(size, shown);
  const height = body + gap;
  const inserts = edgeInserts(identity.skin);
  const stroke = Math.max(0.8, D / 44);
  const light = identity.isLight;
  const value = stake + (settle === "won" ? paid : 0);
  const capped = chips + paidChips > cap;
  const breakAt = shown - tiers;

  const chipAt = i => {
    const yt = yFace + (shown - 1 - i) * t + (i < breakAt ? gap : 0);
    const isPaid = paying && i >= base;
    const isNew = !isPaid && i >= shown - dropped;
    return <g key={i} className={`fd-stack-chip${isPaid ? " is-paid" : ""}${isNew ? " is-drop" : ""}`}
      style={isPaid ? { animationDelay:`${delay + (i - base) * 70}ms` } : undefined}>
      <Rim cx={cx} rx={rx} ry={ry} yt={yt} t={t} inserts={inserts} turn={TURNS[i % TURNS.length] + 1} stroke={stroke} />
    </g>;
  };
  /* your own stack keeps each tap's chips together, so the last tap is the
     part that comes back off */
  const rims = [];
  if (groups?.length) {
    let start = 0;
    groups.forEach((value, index) => {
      const end = index === groups.length - 1 ? shown : Math.min(shown, start + stackChipCount(value));
      if (end <= start) return;
      rims.push(<g key={`tap-${index}`} className="fd-stack-tap" data-chip-stake={value}>
        {Array.from({ length:end - start }, (_, k) => chipAt(start + k))}
      </g>);
      start = end;
    });
  } else for (let i = 0; i < shown; i++) rims.push(chipAt(i));
  /* the break under a tower: one bone line across the gap */
  if (tiers) {
    const yb = yFace + (shown - breakAt) * t + gap / 2;
    rims.push(<path key="break" className="fd-stack-break" strokeWidth={Math.max(1.2, D / 22)}
      d={`M${r2(cx - rx)} ${r2(yb)}A${r2(rx)} ${r2(ry)} 0 0 0 ${r2(cx + rx)} ${r2(yb)}`} />);
  }
  const rise = paying ? (shown - base) * t : 0;
  const stamp = identity.num;
  return (
    <span className={`fd-stack${light ? " is-light" : ""}${mine ? " is-mine" : ""}${settle ? ` is-${settle}` : ""}`}
      style={{ "--stack-color":identity.color, width, animationDelay:settle === "lost" ? `${delay}ms` : undefined }}
      data-stack-player={chip ? undefined : p} data-chip-value={chip ? chip.stamp : undefined} data-stack-chips={shown}
      data-stack-tower={tiers || undefined}>
      {capped && tag && <span className="fd-stack-tag" style={tagSize ? { fontSize:tagSize } : undefined}>{fmt(value)}</span>}
      <svg width={r2(width)} height={r2(height)} viewBox={`0 0 ${r2(width)} ${r2(height)}`} aria-hidden="true">
        {mine && <ellipse className="fd-stack-ring" cx={r2(cx)} cy={r2(yFace + shown * t + gap + 1.5)}
          rx={r2(rx + 2.5)} ry={r2(ry + 2)} strokeWidth={Math.max(1.6, D / 18)} />}
        {rims}
        <g key={`face-${shown}`} className={`fd-stack-face${dropped ? " is-drop" : ""}${paying ? " is-rising" : ""}`}
          style={paying ? { "--stack-rise":`${r2(rise)}px`, animationDelay:`${delay}ms`,
            animationDuration:`${(shown - base) * 70 + 120}ms` } : undefined}>
          <g transform={`translate(${r2(pad)} ${r2(yFace - D * TILT / 2)}) scale(1 ${TILT})`}>
            <ChipFace p={p} size={D} stamp="" flat
              {...(chip ? { color:identity.color, isLight:identity.isLight, skin:identity.skin } : {})} />
          </g>
          {D >= 20 && stamp != null && <text x={r2(cx)} y={r2(yFace + D * 0.02)} textAnchor="middle" dominantBaseline="central"
            fontFamily={DISPLAY} fontWeight="700" className="fd-stack-num"
            fontSize={r2(D * (String(stamp).length > 3 ? 0.25 : String(stamp).length > 2 ? 0.3 : 0.36))}
            transform={`translate(0 ${r2(yFace)}) scale(1 .86) translate(0 ${r2(-yFace)})`}>{stamp}</text>}
        </g>
      </svg>
    </span>
  );
}

/* The chip a crowded side's smallest bettors fold into: drawn as a stack
   like any other, one flat neutral color, "+N" on its face. */
export const groupChip = count => ({ color:"var(--silver)", isLight:true, skin:"plain", stamp:`+${count}` });

/* The smallest bettors on a crowded side, as one stack the size and shape of
   the rest: "+N" on its face, their combined chips on the value line. */
export function StackGroup({ rest, size = 40, cap = STACK_CAP, names = false, label = true, valueAt = "below" }) {
  const players = rest.players;
  const value = <span className="fd-stacks-value">{fmt(rest.total)}</span>;
  return (
    <div className="fd-stacks-slot fd-stacks-group" role="img"
      aria-label={`${players.length} more: ${fmt(rest.total)} chips`}>
      <span className="fd-stacks-body">
        <ChipStack chip={groupChip(players.length)} count={stackChipCount(rest.total)} size={size} cap={cap}
          tag={false} tower />
        {valueAt === "side" && value}
      </span>
      {valueAt !== "side" && value}
      {names && label && <span className="fd-stacks-name">+{players.length}</span>}
    </div>
  );
}

/* A side's stacks standing side by side, biggest first, each with its amount
   on one value line (beside the stack where a row is short) and, on the TV,
   a first name under it. Past `slots` the smallest collapse into one
   StackGroup. */
export function BetStacks({ stacks, size = 40, names = null, cap = STACK_CAP, settle = null, delay = 0,
  className = "", mine = null, slots = Infinity, valueAt = "below" }) {
  if (!stacks?.length) return null;
  const { shown, rest } = groupStacks(stacks, slots, mine);
  return (
    <div className={`fd-stacks${valueAt === "side" ? " is-value-side" : ""}${className ? ` ${className}` : ""}`}>
      {shown.map((item, index) => {
        const result = settle || item.status || null;
        const at = delay + index * 90;
        const value = <span className="fd-stacks-value">{fmt(item.stake + (result === "won" ? item.paid || 0 : 0))}</span>;
        /* a lost stack leaves with its name */
        return <div key={item.player} className={`fd-stacks-slot${result === "lost" ? " is-lost" : ""}`}
          style={result === "lost" ? { animationDelay:`${at}ms` } : undefined}>
          <span className="fd-stacks-body">
            <ChipStack p={item.player} stake={item.stake} paid={item.paid || 0} size={size} cap={cap} tag={false} tower
              settle={result === "won" ? "won" : null} delay={at} mine={!!mine && item.player === mine} />
            {valueAt === "side" && value}
          </span>
          {valueAt !== "side" && value}
          {names && <span className="fd-stacks-name">{names(item.player)}</span>}
        </div>;
      })}
      {rest && <StackGroup key="group" rest={rest} size={size} cap={cap} names={!!names} valueAt={valueAt} />}
    </div>
  );
}

/* Does every stack sit inside the box, clear of the side's total? */
function stacksFit(box, avoid) {
  const inner = box?.firstElementChild;
  if (!inner) return true;
  const b = box.getBoundingClientRect();
  if (!(b.width > 0) || !(b.height > 0)) return true;
  const a = avoid?.getBoundingClientRect?.();
  const parts = [...inner.querySelectorAll(".fd-stacks-slot")];
  return parts.every(el => {
    const r = el.getBoundingClientRect();
    if (r.top < b.top - 1 || r.left < b.left - 1 || r.right > b.right + 1 || r.bottom > b.bottom + 1) return false;
    return !a || r.right <= a.left - 8 || r.left >= a.right + 8 || r.bottom <= a.top - 4 || r.top >= a.bottom + 4;
  });
}

/* A felt that keeps every bettor on it legible (P1): the side's total sits
   top right and the stacks stand from the bottom up, biggest first. When
   they do not fit, the chips step down in size, then the smallest bettors
   collapse into a "+N" stack, one more at a time, until nothing overflows or
   touches the total. Measured before paint, so no frame ever overlaps.
   Felts on one board share a ladder (`ladder`, the board's most bettors) and
   a floor (`floor`, the deepest level any of them needed, reported through
   `onLevel`), so every side of a contest draws the same chip size. */
export function FitStacks({ stacks, total = 0, totalClass = "", chip = 64, cap = STACK_CAP, min = 30,
  names = null, className = "", ladder = null, floor = 0, onLevel = null, valueAt = "below" }) {
  const box = useRef(null), totalRef = useRef(null);
  const [boxSize, setBoxSize] = useState("");
  const count = Math.max(stacks.length, Number(ladder) || 0);
  const levels = useMemo(() => fitLevels(count, { chip, cap, min }), [count, chip, cap, min]);
  /* names and values are measured in the display face: refit once it loads */
  const [fonts, setFonts] = useState(0);
  useEffect(() => {
    const faces = typeof document === "undefined" ? null : document.fonts;
    if (!faces?.addEventListener) return undefined;
    const refit = () => setFonts(value => value + 1);
    faces.addEventListener("loadingdone", refit);
    return () => faces.removeEventListener("loadingdone", refit);
  }, []);
  const key = `${boxSize}|${fonts}|${chip}|${cap}|${count}|${stacks.map(item => `${item.player}:${item.stake}`).join(",")}`;
  const [fit, setFit] = useState({ key:"", level:0 });
  const own = Math.min(fit.key === key ? fit.level : 0, levels.length - 1);
  const level = Math.min(Math.max(own, Number(floor) || 0), levels.length - 1);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver !== "function") return undefined;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setBoxSize(`${Math.round(r.width)}x${Math.round(r.height)}`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    if (!boxSize) return;
    if (level < levels.length - 1 && !stacksFit(box.current, totalRef.current)) setFit({ key, level:level + 1 });
    else {
      if (fit.key !== key || fit.level !== own) setFit({ key, level:own });
      onLevel?.(own);
    }
  });
  const step = levels[level] || { size:chip, cap, slots:Infinity };
  return (
    <div className={`fd-fit${className ? ` ${className}` : ""}`} ref={box} data-fit-level={level}>
      <BetStacks stacks={stacks} size={step.size} cap={step.cap} slots={step.slots} names={names}
        className="fd-fit-stacks" valueAt={valueAt} />
      {total > 0 && <span ref={totalRef} className={`fd-fit-total${totalClass ? ` ${totalClass}` : ""}`}>{fmt(total)}</span>}
    </div>
  );
}
