import React from "react";
import { ChipStack } from "../wagers/BetStacks.jsx";
import { pokerChip, seatStacks, trayStacks, TRAY_TUBE } from "./pokerChips.js";
import "./poker-chips.css";

const fmt = n => (Number(n) || 0).toLocaleString("en-US");

/* A seat's starting chips as the dealer builds them: one short stack per
   denomination, height = count, the count on the stack's base. */
export function DenomStacks({ stack, size = 24, counts = true, className = "" }) {
  const { stacks } = seatStacks(stack);
  if (!stacks.length) return null;
  return (
    <div className={`fd-poker-stacks${className ? ` ${className}` : ""}`}
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
