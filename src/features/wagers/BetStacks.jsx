import React, { useRef } from "react";
import { DISPLAY } from "../../ui/theme.js";
import { ChipFace } from "../identity/PlayerIdentity.jsx";
import { usePlayerIdentity } from "../identity/PlayerIdentityContext.js";
import { COIN_FACETS, edgeInserts } from "../identity/chipCoin.js";
import { STACK_CAP, STACK_TILT as TILT, stackChipCount, stackGeometry } from "./betStacks.js";
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

/* A side's stacks standing side by side, biggest first. On the TV a first
   name sits under each stack; the stack itself is the amount. */
export function BetStacks({ stacks, size = 40, names = null, cap = STACK_CAP, settle = null, delay = 0,
  className = "", tagSize = null, mine = null }) {
  if (!stacks?.length) return null;
  const tagged = stacks.some(item => stackChipCount(item.stake) + stackChipCount(item.paid || 0) > cap);
  return (
    <div className={`fd-stacks${tagged ? " has-tag" : ""}${className ? ` ${className}` : ""}`}>
      {stacks.map((item, index) => {
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
    </div>
  );
}
