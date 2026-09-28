import React, { useLayoutEffect, useRef } from "react";
import { ChipStack } from "../wagers/BetStacks.jsx";
import { EASE } from "../../lib/motion.js";
import { useFreshMount } from "../../lib/motionKit.js";
import { pokerChip, seatStacks, trayStacks, TRAY_TUBE } from "./pokerChips.js";
import { buildSchedule } from "./pokerMotion.js";
import "./poker-chips.css";

const fmt = n => (Number(n) || 0).toLocaleString("en-US");

const DROP = [
  { transform:"translateY(-22px)", opacity:0 },
  { transform:"translateY(2px)", opacity:1, offset:.55 },
  { transform:"translateY(-1.5px)", offset:.78 },
  { transform:"none", opacity:1 },
];
const DROP_MS = 260;

/* A seat's starting chips as the dealer builds them: one short stack per
   denomination, height = count, the count on the stack's base. With
   `build`, stacks put on screen by a fresh deal (pokerSetup) build chip by
   chip after `buildDelay` ms (M17); any other mount shows them built. */
export function DenomStacks({ stack, size = 24, counts = true, className = "", build = false, buildDelay = 0 }) {
  const { stacks } = seatStacks(stack);
  const box = useRef(null);
  const dealt = useFreshMount("pokerSetup");
  const building = build && dealt;
  useLayoutEffect(() => {
    const root = box.current;
    if (!building || !root) return;
    const columns = [...root.querySelectorAll(".fd-poker-stack")];
    const schedule = buildSchedule(columns.map(column => column.querySelectorAll(".fd-stack-chip").length));
    const play = (el, delay) => {
      if (typeof el?.animate !== "function") return;
      try { el.animate(DROP, { duration:DROP_MS, delay, easing:EASE.out, fill:"backwards" }); } catch {}
    };
    columns.forEach((column, index) => {
      const { start, step } = schedule[index];
      const chips = [...column.querySelectorAll(".fd-stack-chip")];
      chips.forEach((chip, k) => play(chip, buildDelay + start + k * step));
      const top = buildDelay + start + Math.max(0, chips.length - 1) * step;
      play(column.querySelector(".fd-stack-face"), top);
      const count = column.querySelector(".fd-poker-count");
      if (typeof count?.animate === "function") {
        try { count.animate([{ opacity:0 }, { opacity:1 }], { duration:DROP_MS, delay:top + DROP_MS / 2, fill:"backwards" }); } catch {}
      }
    });
  }, [building]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!stacks.length) return null;
  return (
    <div ref={box} className={`fd-poker-stacks${className ? ` ${className}` : ""}`}
      role="img" aria-label={stacks.map(item => `${item.n} of ${fmt(item.v)}`).join(", ")}>
      {stacks.map(({ v, n }) => (
        <div className="fd-poker-stack" key={v} data-denom={v} data-count={n}>
          <ChipStack chip={pokerChip(v)} count={n} size={size} cap={TRAY_TUBE} tag={false} />
          {counts && <span className="fd-poker-count">{n}</span>}
        </div>
      ))}
    </div>
  );
}

/* The case pull for the whole table: each denomination in rows of twenty,
   its total count under it. */
export function ChipTray({ inventory, size = 22, className = "" }) {
  const rows = trayStacks(inventory);
  if (!rows.length) return null;
  return (
    <div className={`fd-poker-tray${className ? ` ${className}` : ""}`} role="img"
      aria-label={rows.map(item => `${item.n} of ${fmt(item.v)}`).join(", ")}>
      {rows.map(({ v, n, tubes }) => (
        <div className="fd-poker-tray-denom" key={v} data-denom={v} data-count={n}>
          <div className="fd-poker-tray-tubes">
            {tubes.map((count, index) => <ChipStack key={index} chip={pokerChip(v)} count={count} size={size}
              cap={TRAY_TUBE} tag={false} />)}
          </div>
          <span className="fd-poker-tray-count">{fmt(n)}</span>
        </div>
      ))}
    </div>
  );
}

/* a minimum-stack top-up: the grant itself, marked */
export const GrantMark = ({ grant }) => grant > 0
  ? <span className="fd-poker-grant" aria-label={`Minimum stack, ${fmt(grant)} added`}>▲{fmt(grant)}</span> : null;
