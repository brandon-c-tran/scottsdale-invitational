import React from "react";
import { Avatar } from "../features/identity/PlayerIdentity.jsx";
import { EDITION } from "../../shared/core.js";
import { FDMark, IconGM } from "./Brand.jsx";
import { IconButton } from "./controls.jsx";
import { UpdateChip } from "./UpdateReady.jsx";

export function AppHeader({ state, me, onHome, onProfile, onMenu, onCommissioner, gm, connected, loaded, wagerEv, wagerMarketOpen, onBets, GameMark,
  updateReady = false, onReload }) {
  return <header className="fd-header">
    <div className={`fd-header-row${updateReady && onReload ? " has-update" : ""}`}>
      <button className="fd-brand" onClick={onHome} aria-label="Field Day home"><FDMark size={30} /><span><strong>Field Day</strong><small>{EDITION.label}</small></span></button>
      {updateReady && onReload && <UpdateChip onReload={onReload} />}
      {gm && <IconButton label="Commissioner" size={44} selected onClick={onCommissioner}><IconGM filled /></IconButton>}
      {me && <button onClick={onProfile} aria-label="Your profile" className="fd-profile-link"><Avatar state={state} p={me} size={34} /></button>}
      <IconButton label="More options" size={44} onClick={onMenu}><svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><circle cx="4" cy="10" r="1.6" /><circle cx="10" cy="10" r="1.6" /><circle cx="16" cy="10" r="1.6" /></svg></IconButton>
    </div>
    {!connected && loaded && <div className="fd-connection" role="status">Reconnecting…</div>}
    {wagerEv && <button className="fd-live-link" onClick={onBets}>
      <GameMark id={wagerEv.game} size={26} />
      <span className="fd-live-link-text">{wagerEv.name}</span>
      <span className="fd-live-label">{wagerMarketOpen ? "Betting open" : "Betting locked"} <span aria-hidden="true">›</span></span>
    </button>}
  </header>;
}

function NavIcon({ name }) {
  const paths = {
    board:<><path d="m3 10 9-7 9 7v10H3z" /><path d="M9 20v-7h6v7" /></>,
    sched:<><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M4 10h16M8 3v4M16 3v4M8 14h2M14 14h2M8 17h2" /></>,
    bets:<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><path d="M12 3v3M21 12h-3M12 21v-3M3 12h3" /></>,
    guide:<><path d="M12 5v16M12 5Q7 2 3 4v15q4-2 9 2 5-4 9-2V4q-4-2-9 1Z" /><path d="m6 8 3 1M15 9l3-1M6 12l3 1M15 13l3-1" /></>,
  };
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

/* badges: { bets, board } carry a short reason string when something there
   is waiting on this guest (an open market with room, a duel or pick). */
export function AppNavigation({ tab, onTab, badges = {} }) {
  return <div className="fd-nav-wrap"><nav className="fd-nav" aria-label="Primary">
    {[["board","Home"],["sched","Events"],["bets","Bets"],["guide","Weekend"]].map(([id,name]) => {
      const badge = tab !== id && badges[id];
      return <button key={id} onClick={() => onTab(id)} aria-current={tab === id ? "page" : undefined}
        aria-label={badge ? `${name}, ${badge}` : undefined}>
        <span className="fd-nav-icon"><NavIcon name={id} />{badge && <i className="fd-nav-badge" aria-hidden="true" />}</span><span>{name}</span>
      </button>;
    })}
  </nav></div>;
}
