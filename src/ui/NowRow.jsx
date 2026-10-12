import React from "react";
import { Icon } from "./Icon.jsx";

/* One row of Home's Now card (features/home/GuestHome.jsx): what is
   happening for you besides the contest on its face. An in-app game in
   progress, a draft, naming your team, a market open on another event:
   the lamp and the live status on the left, the one way in on the right.
   The card is the frame; a row is never a card of its own. `tone` is the
   lamp (live magenta, info cyan, you filament); `go` is the verb ("Play",
   "Open"), `primary` fills it as the card's main action. */
export function NowRow({ tone = "live", label = null, status, extra = null, go = "Open", primary = false, flash = false,
  onClick, className = "", ariaLabel, expanded, icon = null }) {
  const lamp = `fd-insert is-${tone}${tone === "live" && !flash ? " fd-beat-dot" : ""}${flash ? " is-pending" : ""}`;
  return <button type="button" className={`fd-now-row is-${tone}${primary ? " is-primary" : ""} ${className}`.trim()}
    onClick={onClick} aria-label={ariaLabel} aria-expanded={expanded}>
    <span className="fd-now-row-text">
      {label && <small>{label}</small>}
      <strong>{icon || <i className={lamp} aria-hidden="true" />}<span>{status}</span></strong>
      {extra && <em>{extra}</em>}
    </span>
    {go && <span className="fd-now-row-go">{go}{!primary && <Icon name="open" size={16} />}</span>}
  </button>;
}
