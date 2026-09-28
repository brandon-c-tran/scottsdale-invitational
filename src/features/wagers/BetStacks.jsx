import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import { DISPLAY } from "../../ui/theme.js";
import { ChipFace } from "../identity/PlayerIdentity.jsx";
import { usePlayerIdentity } from "../identity/PlayerIdentityContext.js";
import { COIN_FACETS, edgeInserts } from "../identity/chipCoin.js";
import { STACK_CAP, STACK_TILT as TILT, fitLevels, groupStacks, stackChipCount, stackGeometry } from "./betStacks.js";
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
  delay = 0, tag = true, tagSize = null, groups = null, chip = null, count = null }) {
  /* a poker chip is not anyone's: its color, edge and stamp come with it,
     and it stacks one chip per chip rather than one per 100 */
  const player = usePlayerIdentity(p);
  const identity = chip ? { color:chip.color, isLight:!!chip.isLight, skin:chip.skin || "quad", num:chip.stamp } : player;
  const chips = count ?? stackChipCount(stake);
  const paidChips = count == null ? stackChipCount(paid) : 0;
  const shown = Math.max(1, Math.min(chips + paidChips, cap));
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

  const { D, pad, rx, ry, t, cx, width, yFace, height } = stackGeometry(size, shown, mine);
  const inserts = edgeInserts(identity.skin);
  const stroke = Math.max(0.8, D / 44);
  const light = identity.isLight;
  const value = stake + (settle === "won" ? paid : 0);
  const capped = chips + paidChips > cap;

  const chipAt = i => {
    const yt = yFace + (shown - 1 - i) * t;
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
  const rise = paying ? (shown - base) * t : 0;
  const stamp = identity.num;
  return (
    <span className={`fd-stack${light ? " is-light" : ""}${mine ? " is-mine" : ""}${settle ? ` is-${settle}` : ""}`}
      style={{ "--stack-color":identity.color, width, animationDelay:settle === "lost" ? `${delay}ms` : undefined }}
      data-stack-player={chip ? undefined : p} data-chip-value={chip ? chip.stamp : undefined} data-stack-chips={shown}>
      {capped && tag && <span className="fd-stack-tag" style={tagSize ? { fontSize:tagSize } : undefined}>{fmt(value)}</span>}
      <svg width={r2(width)} height={r2(height)} viewBox={`0 0 ${r2(width)} ${r2(height)}`} aria-hidden="true">
        {mine && <ellipse className="fd-stack-ring" cx={r2(cx)} cy={r2(yFace + shown * t + 1.5)}
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

/* The smallest bettors on a crowded side, as one pile: a fan of their own
   flat identity chips (each still in its colour, overlapping), the group's
   total stamped on its shoulder, "+N" where a name would sit. */
export function StackGroup({ rest, size = 40, names = false, tagSize = null, label = true }) {
  const mini = Math.max(14, Math.round(size * 0.72));
  /* up to eight, four to a row: the back row peeks over the front one */
  const fan = rest.stacks.slice(0, 8);
  const step = Math.round(mini * 0.42), perRow = 4, rise = Math.round(mini * 0.42);
  const rows = Math.ceil(fan.length / perRow);
  const width = mini + step * (Math.min(perRow, fan.length) - 1);
  const height = mini + (rows - 1) * rise;
  const players = rest.players;
  return (
    <div className="fd-stacks-slot fd-stacks-group" role="img"
      aria-label={`${players.length} more: ${fmt(rest.total)} chips`}>
      <span className="fd-stack fd-stack-fan">
        <span className="fd-stack-tag is-group" style={tagSize ? { fontSize:tagSize } : undefined}>{fmt(rest.total)}</span>
        <span className="fd-stack-fan-chips" style={{ width, height }}>
          {fan.map((item, index) => <span key={item.player} className="fd-stack-fan-chip"
            style={{ left:(index % perRow) * step + (index >= perRow ? Math.round(step / 2) : 0),
              top:index >= perRow ? 0 : (rows - 1) * rise, zIndex:(index >= perRow ? 0 : 10) + perRow - (index % perRow) }}>
            <ChipFace p={item.player} size={mini} stamp="" flat />
          </span>)}
        </span>
      </span>
      {names && label && <span className="fd-stacks-name">+{players.length}</span>}
    </div>
  );
}

/* A side's stacks standing side by side, biggest first. On the TV a first
   name sits under each stack; the stack itself is the amount. Past `slots`
   the smallest collapse into one StackGroup. */
export function BetStacks({ stacks, size = 40, names = null, cap = STACK_CAP, settle = null, delay = 0,
  className = "", tagSize = null, mine = null, slots = Infinity }) {
  if (!stacks?.length) return null;
  const { shown, rest } = groupStacks(stacks, slots);
  const tagged = !!rest || shown.some(item => stackChipCount(item.stake) + stackChipCount(item.paid || 0) > cap);
  return (
    <div className={`fd-stacks${tagged ? " has-tag" : ""}${className ? ` ${className}` : ""}`}>
      {shown.map((item, index) => {
        const result = settle || item.status || null;
        const at = delay + index * 90;
        /* a lost stack leaves with its name */
        return <div key={item.player} className={`fd-stacks-slot${result === "lost" ? " is-lost" : ""}`}
          style={result === "lost" ? { animationDelay:`${at}ms` } : undefined}>
          <ChipStack p={item.player} stake={item.stake} paid={item.paid || 0} size={size} cap={cap}
            settle={result === "won" ? "won" : null} delay={at} tagSize={tagSize} mine={!!mine && item.player === mine} />
          {names && <span className="fd-stacks-name">{names(item.player)}</span>}
        </div>;
      })}
      {rest && <StackGroup key="group" rest={rest} size={size} names={!!names} tagSize={tagSize} />}
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
  const parts = [...inner.querySelectorAll(".fd-stacks-slot, .fd-stack-tag")];
  return parts.every(el => {
    const r = el.getBoundingClientRect();
    if (r.top < b.top - 1 || r.left < b.left - 1 || r.right > b.right + 1 || r.bottom > b.bottom + 1) return false;
    return !a || r.right <= a.left - 8 || r.left >= a.right + 8 || r.bottom <= a.top - 4 || r.top >= a.bottom + 4;
  });
}

/* A felt that keeps every bettor on it legible (P1): the side's total sits
   top right and the stacks stand from the bottom up, biggest first. When
   they do not fit, the chips step down in size, then the smallest bettors
   collapse into a "+N" pile, one more at a time, until nothing overflows or
   touches the total. Measured before paint, so no frame ever overlaps. */
export function FitStacks({ stacks, total = 0, totalClass = "", chip = 64, cap = STACK_CAP, min = 30,
  names = null, tagSize = null, className = "" }) {
  const box = useRef(null), totalRef = useRef(null);
  const [boxSize, setBoxSize] = useState("");
  const levels = useMemo(() => fitLevels(stacks.length, { chip, cap, min }), [stacks.length, chip, cap, min]);
  const key = `${boxSize}|${chip}|${cap}|${stacks.map(item => `${item.player}:${item.stake}`).join(",")}`;
  const [fit, setFit] = useState({ key:"", level:0 });
  const level = Math.min(fit.key === key ? fit.level : 0, levels.length - 1);
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
    else if (fit.key !== key || fit.level !== level) setFit({ key, level });
  });
  const step = levels[level] || { size:chip, cap, slots:Infinity };
  return (
    <div className={`fd-fit${className ? ` ${className}` : ""}`} ref={box} data-fit-level={level}>
      <BetStacks stacks={stacks} size={step.size} cap={step.cap} slots={step.slots} names={names}
        tagSize={tagSize} className="fd-fit-stacks" />
      {total > 0 && <span ref={totalRef} className={`fd-fit-total${totalClass ? ` ${totalClass}` : ""}`}>{fmt(total)}</span>}
    </div>
  );
}
