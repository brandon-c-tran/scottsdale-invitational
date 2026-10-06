import React from "react";
import { Avatar } from "../features/identity/PlayerIdentity.jsx";
import { EDITION } from "../../shared/core.js";
import { FDMark } from "./Brand.jsx";
import { IconButton } from "./controls.jsx";
import { UpdateChip } from "./UpdateReady.jsx";
import { ScoreReel } from "./ScoreReel.jsx";
import { Icon } from "./Icon.jsx";
import { EventName, OneSafe } from "./OneSafe.jsx";
import { useCountUp, useFlightTarget } from "../lib/motion.js";

const ordinal = n => n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`;
/* your chips and rank for the header; no rank before the weekend goes live,
   and none while every stack is level. A tie reads as the place it shares
   ("2nd"); the leaderboard draws the tie. */
export function headerStanding(state, standings = [], me) {
  const row = me ? standings.find(item => item.player === me) : null;
  if (!row) return null;
  if (!state?.live && !state?.frozen) return { pts:row.pts, rank:null };
  if (standings.every(item => item.pts === row.pts)) return { pts:row.pts, rank:null };
  const tied = standings.filter(item => item.rank === row.rank).length > 1;
  return { pts:row.pts, rank:{ n:row.rank, tied, text:ordinal(row.rank) } };
}

/* your reel and rank in the header, lit in your filament: their one home,
   on every tab. A fresh change counts in 100s. A tap finds your row on
   Home’s leaderboard. */
function YouReel({ standing, onStandings }) {
  const count = useCountUp(standing.pts, { key:"you-header" });
  const label = `${standing.pts.toLocaleString("en-US")} chips${standing.rank ? `, ${standing.rank.tied
    ? `tied for ${standing.rank.text}` : standing.rank.text}` : ""}. Find your row`;
  return <button type="button" className="fd-header-you" onClick={onStandings} aria-label={label}>
    {standing.rank && <span className="fd-header-rank"><OneSafe text={standing.rank.text} /></span>}
    <ScoreReel value={count.value} tone="you" label="" />
  </button>;
}

export function AppHeader({ state, me, onHome, onProfile, onMenu, onCommissioner, gm, connected, loaded, wagerEv, wagerMarketOpen, onBets, GameMark,
  updateReady = false, onReload, standing = null, onStandings, sky = null }) {
  const profileTarget = useFlightTarget("header:profile");
  return <header className="fd-header">
    <div className={`fd-header-row${updateReady && onReload ? " has-update" : ""}`}>
      <button className="fd-brand" onClick={onHome} aria-label="Field Day home"><FDMark size={30} /><span><strong>Field Day</strong><small>{EDITION.label}</small></span></button>
      {updateReady && onReload && <UpdateChip onReload={onReload} />}
      {me && standing && <YouReel standing={standing} onStandings={onStandings || onHome} />}
      {/* the commissioner's own way in, lettered so it is never a bare glyph */}
      {gm && <button type="button" className="fd-header-gm" onClick={onCommissioner} aria-label="Commissioner">
        <Icon name="star" size={18} lit /><span aria-hidden="true">GM</span></button>}
      {me && <button ref={profileTarget} onClick={onProfile} aria-label="Your profile" className="fd-profile-link"><Avatar state={state} p={me} size={34} /></button>}
      <IconButton label="More options" size={44} onClick={onMenu}><Icon name="menu" size={22} /></IconButton>
    </div>
    {sky}
    {!connected && loaded && <div className="fd-connection" role="status"><i className="fd-beat-dot" aria-hidden="true" />Reconnecting…</div>}
    {wagerEv && <button className={`fd-live-link${wagerMarketOpen ? " is-open" : ""}`} onClick={onBets}>
      <GameMark id={wagerEv.game} variant={wagerEv.variant} size={26} />
      <span className="fd-live-link-text fd-show"><EventName name={wagerEv.name} /></span>
      <span className={`fd-live-label${wagerMarketOpen ? " fd-beat-fill" : ""}`}>{wagerMarketOpen ? "Betting open" : "Betting locked"}<Icon name="next" size={16} /></span>
    </button>}
  </header>;
}

/* the tab bar's glyphs, from the one icon set; the current tab is lit */
const NAV_ICONS = { board:"home", sched:"events", bets:"bets", guide:"weekend" };
function NavIcon({ name, lit }) {
  return <Icon name={NAV_ICONS[name]} size={22} lit={lit} />;
}

/* Flight targets for the tabs: fly(el, "tab:home") lands on the Home icon. */
export const TAB_TARGETS = Object.freeze({ board:"tab:home", sched:"tab:events", bets:"tab:bets", guide:"tab:weekend" });

function NavTab({ id, name, tab, onTab, badge }) {
  const target = useFlightTarget(TAB_TARGETS[id]);
  return <button onClick={() => onTab(id)} aria-current={tab === id ? "page" : undefined}
    aria-label={badge ? `${name}, ${badge}` : undefined}>
    <span className="fd-nav-icon" ref={target}><NavIcon name={id} lit={tab === id} />{badge && <i className="fd-nav-badge fd-beat" aria-hidden="true" />}</span><span>{name}</span>
  </button>;
}

/* badges: { bets, board } carry a short reason string when something there
   is waiting on this guest (an open market with room, a duel or pick). */
export function AppNavigation({ tab, onTab, badges = {} }) {
  return <div className="fd-nav-wrap"><nav className="fd-nav" aria-label="Primary">
    {[["board","Home"],["sched","Events"],["bets","Bets"],["guide","Weekend"]].map(([id,name]) =>
      <NavTab key={id} id={id} name={name} tab={tab} onTab={onTab} badge={tab !== id && badges[id]} />)}
  </nav></div>;
}
