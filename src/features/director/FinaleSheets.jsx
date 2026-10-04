import React, { useRef, useState } from "react";
import { disp, pokerInventory, pokerSetupPreview, computeStandings } from "../../../shared/core.js";
import { ActionButton, Sheet } from "../../ui/controls.jsx";
import { Avatar } from "../identity/PlayerIdentity.jsx";
import { DenomStacks, ChipTray, GrantMark } from "../poker/PokerChips.jsx";
import { namesOf } from "./directorPill.js";
import "./director.css";

const fmt = n => (n ?? 0).toLocaleString("en-US");

/* One write at a time behind a pending guard; a failure keeps the sheet
   open with the error and the same button as the retry. */
function useCommit() {
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  const busy = useRef(false);
  const run = async callback => {
    if (busy.current) return undefined;
    busy.current = true; setPending(true); setError("");
    try {
      const result = await callback();
      if (result?.ok !== true) setError(result?.error || "Not saved. Try again.");
      return result;
    } catch (failure) {
      setError(failure?.message || "Not saved. Try again.");
      return { ok:false, error:failure?.message };
    } finally { busy.current = false; setPending(false); }
  };
  return { pending, error, run };
}

/* What the table will be dealt, before anything is written: each seat's
   stack and chips, who is topped up to the minimum, who is away, the tray,
   and the open duels the deal voids. Only Deal and start writes. */
export function PokerSetupSheet({ state, onClose, onBack, onDeal }) {
  const commit = useCommit();
  const dealt = state.poker && !state.results?.[state.poker.id] ? state.poker : null;
  const preview = dealt ? {
    rows:Object.entries(dealt.startingStacks || {}).map(([player, stack]) => ({ player, stack, grant:0 })),
    away:Object.keys(dealt.unseated || {}),
    total:dealt.total,
    inventory:pokerInventory(dealt.startingStacks || {}),
    voidDuels:0,
  } : pokerSetupPreview(state);
  const board = Object.fromEntries(computeStandings(state).map(row => [row.player, row.pts]));
  const away = (preview.away || []).map(item => typeof item === "string" ? { player:item, pts:board[item] } : item)
    .filter(item => item?.player);
  const duels = Array.isArray(preview.voidDuels) ? preview.voidDuels : [];
  const voids = Array.isArray(preview.voidDuels) ? duels.length : Number(preview.voidDuels) || 0;
  const blocker = preview.ok === false ? preview.blockers?.[0] : null;
  const grants = preview.rows.filter(row => row.grant > 0);
  return <Sheet title="Starting stacks" subtitle={`${fmt(preview.total)} chips`}
    onClose={onClose} onBack={onBack} busy={commit.pending}>
    {preview.rows.map(row => <div className={`fd-stack-row${row.grant > 0 ? " is-grant" : ""}`} key={row.player}>
      <Avatar state={state} p={row.player} size={30} />
      <span><b>{disp(state, row.player)}</b>
        <DenomStacks stack={row.stack} size={30} /></span>
      <span className="fd-stack-total"><strong>{fmt(row.stack)}</strong><GrantMark grant={row.grant} /></span>
    </div>)}
    {away.map(({ player, pts }) => <div className="fd-stack-row is-away" key={player}>
      <Avatar state={state} p={player} size={30} />
      <span><b>{disp(state, player)}</b><small>Away, not dealt in</small></span>
      <strong>{fmt(dealt?.unseated?.[player] ?? pts)}</strong>
    </div>)}
    <div className="fd-stack-tray">
      <span>The tray</span>
      <ChipTray inventory={preview.inventory || []} />
    </div>
    <div className="fd-stack-summary">
      {grants.length > 0 && <div><span>Minimum stack</span><strong className="fd-stack-grants">
        {grants.map(row => <Avatar key={row.player} state={state} p={row.player} size={20} />)}
        <GrantMark grant={grants.reduce((sum, row) => sum + row.grant, 0)} /></strong></div>}
      {voids > 0 && <div><span>Voids {voids} open duel{voids === 1 ? "" : "s"}</span>
        {duels.length > 0 && <strong>{duels.map(duel => duel.label).join(", ")}</strong>}</div>}
    </div>
    {blocker && <p role="alert" className="fd-contest-error">{blocker}</p>}
    {commit.error && <p role="alert" className="fd-contest-error">{commit.error}</p>}
    <ActionButton disabled={commit.pending || !onDeal || !!blocker} style={{ width:"100%" }}
      onClick={() => commit.run(onDeal)}>{commit.pending ? "Dealing…" : "Deal and start"}</ActionButton>
  </Sheet>;
}

/* The crown is one confirmed write. The button names who it crowns; the
   write carries those names, so a board that moved in between is refused. */
export function CrownSheet({ state, finalePosted = true, onClose, onBack, onCrown }) {
  const commit = useCommit();
  const leaders = computeStandings(state).filter(row => row.rank === 1);
  const players = leaders.map(row => row.player);
  const names = namesOf(state, players);
  return <Sheet title="Crown the champion" onClose={onClose} onBack={onBack} busy={commit.pending}>
    <p style={{ margin:"0 0 14px", color:"var(--muted2)", font:"500 14px/1.6 var(--fd-body)" }}>
      Freezes the board with <b style={{ color:"var(--accent2)" }}>{names}</b>
      {players.length > 1 ? " as co-champions" : " as champion"} at {fmt(leaders[0]?.pts)} chips. Betting and duels close.</p>
    {!finalePosted && <p style={{ margin:"0 0 14px", color:"var(--live2)", font:"600 13px/1.5 var(--fd-body)" }}>No finale result yet.</p>}
    {commit.error && <p role="alert" className="fd-contest-error">{commit.error}</p>}
    <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
      <ActionButton disabled={commit.pending || !players.length || !onCrown} style={{ flex:1 }}
        onClick={() => commit.run(() => onCrown(players))}>{commit.pending ? "Crowning…" : `Crown ${names}`}</ActionButton>
      <ActionButton variant="tertiary" disabled={commit.pending} onClick={onClose}>Not yet</ActionButton>
    </div>
  </Sheet>;
}
