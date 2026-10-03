/* The lamps and tags comebacks put on existing surfaces: the bounty lamp on
   the wanted player, "Bounty +200" on the side facing them, and each
   side's payout when a contest carries underdog odds. Amber: chips. */
import React from "react";
import { BOUNTY_PTS } from "../../../shared/core.js";
import { bountyLine } from "./comebacks.js";
import "./comebacks.css";

/* a lit amber insert beside a wanted player's name */
export function BountyLamp({ className = "", label = "Bounty" }) {
  return <span className={`fd-bounty-lamp ${className}`} role="img" aria-label={label}>
    <i className="fd-insert" aria-hidden="true" /><span>Bounty</span>
  </span>;
}

/* "Bounty +200", the side that collects it */
export function BountyTag({ pts = BOUNTY_PTS, className = "" }) {
  return <span className={`fd-bounty-tag ${className}`}><i className="fd-insert" aria-hidden="true" />{bountyLine(pts)}</span>;
}

/* one side's terms row: its payout (when the contest carries odds) and the
   bounty it collects; an empty row keeps every card the same height */
export function SideTerms({ terms, className = "", tv = false }) {
  const cls = `fd-side-terms${tv ? " is-tv" : ""} ${className}`;
  if (!terms) return <div className={cls} />;
  return <div className={cls}>
    {terms.payLine && <span className={`fd-side-pays${terms.underdog ? " is-underdog" : ""}`}>{terms.payLine}</span>}
    {terms.bounty > 0 && <BountyTag pts={terms.bounty} />}
  </div>;
}
