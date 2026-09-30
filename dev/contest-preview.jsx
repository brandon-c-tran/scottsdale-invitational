/* Developer-only rehearsal: actual app components and server actions, sample
   state in memory. No socket, storage, or remote service is connected. */
import React, { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  EMPTY_STATE, ROSTER, CHIP_COLORS, BUILTIN_EVENTS, computeStandings, disp,
  makeBracket, resolveSlot, resolveCurrentContest, resolveEventLifecycle,
  resolveWager, bracketChampion, stageEntrantView,
} from "../shared/core.js";
import { applyAction } from "../worker/actions.js";
import { PlayerIdentityProvider } from "../src/features/identity/PlayerIdentityContext.js";
import { PlayerSheet } from "../src/features/profile/PlayerSheet.jsx";
import { ContestPanel } from "../src/features/weekend/ContestPanel.jsx";
import { CompetitionBracket } from "../src/features/weekend/CompetitionBracket.jsx";
import { Wagers } from "../src/features/wagers/Wagers.jsx";
import { Shell } from "../src/ui/Shell.jsx";
import { GameMark } from "../src/ui/GameMark.jsx";
import { ActionButton, Sheet } from "../src/ui/controls.jsx";

const scenarios = [
  { id:"ffa", label:"Long Putt · everyone plays", evId:"putt" },
  { id:"bracket", label:"8-Ball · six teams", evId:"8ball" },
  { id:"heat", label:"Beerio Kart · heat winner", evId:"beerio" },
  { id:"heats", label:"Beerio Kart · two advance", evId:"beerio" },
  { id:"legacy", label:"8-Ball · existing mid-event", evId:"8ball" },
];
const events = BUILTIN_EVENTS;
const control = { minHeight:44, minWidth:0, padding:"8px 10px", border:"1px solid var(--line)",
  borderRadius:6, background:"var(--paper)", color:"var(--ink)", font:"inherit", width:"100%" };
const card = { padding:16, border:"1px solid var(--line)", borderRadius:10, background:"var(--paper)", marginBottom:16 };

function fixture(kind) {
  const state = structuredClone(EMPTY_STATE);
  state.live = kind === "legacy";
  state.profiles = Object.fromEntries(ROSTER.map((player, index) => [player, {
    display:player, num:index + 1, color:CHIP_COLORS[index * 2 % CHIP_COLORS.length].hex,
    skin:["ticks", "crown", "wave"][index % 3],
  }]));
  if (kind === "legacy") {
    // Deliberately persisted old data: one match completed, a live legacy ticket,
    // and no per-contest fields. Only this scenario starts after setup.
    state.draws["8ball"] = { id:"sample-legacy-draw", ts:1,
      teams:Array.from({ length:6 }, (_, index) => ({ players:ROSTER.slice(index * 2, index * 2 + 2) })),
      roles:[{ player:ROSTER[12], role:"photographer" }] };
    state.brackets["8ball"] = makeBracket(6);
    state.brackets["8ball"].rounds[0][0].winner = 3;
    state.eventOps["8ball"] = { drawRevealedAt:1, bettingOpenedAt:2, bettingLockedAt:3, startedAt:4 };
    const match = state.brackets["8ball"].rounds[0][1];
    const side = resolveSlot(state.brackets["8ball"], match.a);
    state.wagers = [{ id:"sample-legacy-ticket", player:ROSTER[12], eventId:"8ball", evName:"8-Ball Doubles",
      kind:"match", match:[0, 1], drawId:state.draws["8ball"].id, pick:side, teamIdx:side,
      pickTeam:true, pickPlayers:state.draws["8ball"].teams[side].players,
      stake:100, ts:2, status:"open" }];
  }
  return state;
}

function CompetitionDetails({ state, ev, onPlayer }) {
  const bracket = state.brackets[ev.id], draw = state.draws[ev.id], stages = state.stages[ev.id];
  return <section style={card} aria-label="Draw and results">
    <h2 style={{ marginTop:0, fontSize:20 }}>Draw and results</h2>
    {bracket ? <CompetitionBracket state={state} ev={ev} onPlayer={onPlayer} /> : stages ? <>
      <p>{stages.advance} advance from each heat.</p>
      {stages.groups.map((group, index) => <div key={index} style={{ padding:"12px 0", borderTop:"1px solid var(--line)" }}>
        <strong>{group.name}</strong>
        <p>{group.entrants.map(key => stageEntrantView(state, stages, key).players.map(player => disp(state, player)).join(" & ")).join(", ")}</p>
        {group.winner != null && <p>Winner: {stageEntrantView(state, stages, group.winner).players.join(" & ")}</p>}
        {!!group.through?.length && <p>Advance: {group.through.map(key => stageEntrantView(state, stages, key).players.join(" & ")).join(", ")}</p>}
      </div>)}
      {stages.finalWinner != null && <p>Final winner: {stageEntrantView(state, stages, stages.finalWinner).players.join(" & ")}</p>}
    </> : <p>All {ROSTER.length} players. One winner.</p>}
    {draw?.roles?.map(role => <p key={role.player}>{disp(state, role.player)} · {role.role}</p>)}
    {state.results[ev.id] && <p><strong>Result posted: {state.results[ev.id].slots[0].map(player => disp(state, player)).join(" & ")}</strong></p>}
  </section>;
}

function ResultEntry({ state, ev, onSave, onClose }) {
  const draw = state.draws[ev.id], bracket = state.brackets[ev.id], stages = state.stages[ev.id];
  const winnerKey = bracket ? bracketChampion(bracket) : stages?.finalWinner;
  const knownWinner = winnerKey == null ? null : stages ? stageEntrantView(state, stages, winnerKey).players : draw.teams[winnerKey].players;
  const [winner, setWinner] = useState(knownWinner?.[0] || "");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const save = async () => {
    if (busy.current) return;
    busy.current = true; setPending(true); setError("");
    try {
      const result = await onSave(knownWinner || [winner]);
      if (result.ok) onClose(); else setError(result.error || "Result not saved. Try again.");
    } finally { busy.current = false; setPending(false); }
  };
  return <Sheet title="Post event result" onClose={onClose} busy={pending}>
    <p>{ev.name}</p>
    {knownWinner ? <p>Winner: <strong>{knownWinner.map(player => disp(state, player)).join(" & ")}</strong></p>
      : <label style={{ display:"grid", gap:8 }}>Winner<select style={control} value={winner} disabled={pending} onChange={event => setWinner(event.target.value)}>
        <option value="">Choose winner</option>{ROSTER.map(player => <option key={player} value={player}>{disp(state, player)}</option>)}
      </select></label>}
    <p style={{ color:"var(--muted2)", lineHeight:1.5 }}>This rehearsal posts first place. The app’s result sheet also supports second and third.</p>
    {error && <p role="alert">{error}</p>}
    <ActionButton disabled={!winner || pending} pending={pending} onClick={save}>Post result</ActionButton>
  </Sheet>;
}

function Preview() {
  const [kind, setKind] = useState("ffa"), [state, setState] = useState(() => fixture("ffa"));
  const [gm, setGm] = useState(true), [me, setMe] = useState(ROSTER[12]);
  const [tab, setTab] = useState("contest"), [player, setPlayer] = useState(null), [resultOpen, setResultOpen] = useState(false);
  const [failure, setFailure] = useState(false), [log, setLog] = useState([]), [error, setError] = useState("");
  const [pending, setPending] = useState(0);
  const stateRef = useRef(state), epoch = useRef(0), failRef = useRef(failure);
  failRef.current = failure;
  const scenario = scenarios.find(item => item.id === kind), ev = events.find(event => event.id === scenario.evId);
  const standings = computeStandings(state), lifecycle = resolveEventLifecycle(state, ev), contest = resolveCurrentContest(state, ev);
  const reset = nextKind => {
    epoch.current++; const next = fixture(nextKind); stateRef.current = next; setState(next); setKind(nextKind);
    setTab("contest"); setLog([]); setError(""); setPlayer(null); setResultOpen(false); setPending(0);
  };
  const act = async (type, payload = {}) => {
    const generation = epoch.current;
    const actor = { player:me, isGm:gm, deviceId:"contest-preview", actionId:crypto.randomUUID() };
    setPending(count => count + 1);
    await new Promise(resolve => setTimeout(resolve, 400));
    if (generation !== epoch.current) return { ok:false, error:"Scenario changed. Try again." };
    const next = structuredClone(stateRef.current);
    const result = failRef.current ? { ok:false, error:"Preview connection failed. Turn off failure and retry." }
      : applyAction(next, type, payload, actor);
    if (result.ok) { stateRef.current = next; setState(next); }
    setLog(current => [{ id:actor.actionId, type, ok:result.ok, error:result.error, payload }, ...current].slice(0, 30));
    setPending(count => count - 1);
    return result;
  };
  const setup = async () => {
    setError("");
    let result;
    if (["heats", "heat"].includes(kind) && !stateRef.current.stages[ev.id]) {
      result = await act("runStages", { evId:ev.id, cfg:{ kind:"heats", nGroups:3, advance:kind === "heats" ? 2 : 1, players:[...ROSTER] } });
      if (!result.ok) { setError(result.error); return result; }
    }
    result = ev.teamCfg ? await act("announceAndDraw", { evId:ev.id, players:ROSTER.slice(0, 12), roles:[{ player:ROSTER[12], role:"photographer" }] })
      : await act("announceEvent", { evId:ev.id });
    if (!result.ok) setError(result.error);
    return result;
  };
  const enterResult = async () => {
    setError("");
    if (resolveEventLifecycle(stateRef.current, ev).phase !== "result-entry") {
      const result = await act("beginResultEntry", { evId:ev.id });
      if (!result.ok) { setError(result.error); return result; }
    }
    setResultOpen(true); return { ok:true };
  };
  const setupNeeded = ["scheduled", "teams-ready", "draw-ready"].includes(lifecycle.phase)
    || !state.eventOps[ev.id]?.bettingOpenedAt && !state.eventOps[ev.id]?.startedAt && !state.results[ev.id];

  return <PlayerIdentityProvider profiles={state.profiles}><Shell environment="contest rehearsal · sample data only">
    <div style={{ "--fd-nav-height":"0px", padding:"12px 0 40px", overflowWrap:"anywhere" }}>
      <section style={card} aria-label="Rehearsal controls">
        <h1 style={{ fontSize:24, margin:"0 0 12px" }}>Contest rehearsal</h1>
        <p style={{ fontSize:13, color:"var(--muted2)", lineHeight:1.5 }}>Sample data in memory. Play through each round using the app’s controls. Refresh or reset to start again.</p>
        <label style={{ display:"grid", gap:6, marginBottom:10 }}>Scenario<select style={control} value={kind} disabled={pending > 0} onChange={event => reset(event.target.value)}>
          {scenarios.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select></label>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
          <label style={{ display:"grid", gap:6 }}>View<select style={control} value={gm ? "gm" : "guest"} disabled={pending > 0} onChange={event => setGm(event.target.value === "gm")}>
            <option value="gm">Commissioner</option><option value="guest">Guest</option></select></label>
          <label style={{ display:"grid", gap:6 }}>Player<select style={control} value={me} disabled={pending > 0} onChange={event => setMe(event.target.value)}>
            {ROSTER.map(person => <option key={person} value={person}>{disp(state, person)}</option>)}</select></label>
        </div>
        <label style={{ display:"flex", alignItems:"center", gap:8, minHeight:44, fontSize:13 }}>
          <input type="checkbox" checked={failure} onChange={event => setFailure(event.target.checked)} /> Simulate failed saves</label>
        <ActionButton variant="secondary" disabled={pending > 0} onClick={() => reset(kind)}>Reset scenario</ActionButton>
        <p role="status" style={{ fontSize:12, marginBottom:0, color:"var(--muted2)" }}>{pending > 0 ? "Waiting for acknowledgement…" : "Ready"} · {lifecycle.label}</p>
      </section>
      <nav aria-label="Rehearsal view" style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6, marginBottom:16 }}>
        {[["contest", "Contest"], ["bets", "Bets"], ["details", "Draw / log"]].map(([id, label]) => <button type="button" key={id}
          style={{ ...control, background:tab === id ? "var(--action-fill)" : "var(--paper)", color:tab === id ? "var(--action-ink)" : "var(--ink)" }}
          aria-current={tab === id ? "page" : undefined} onClick={() => setTab(id)}>{label}</button>)}
      </nav>
      {error && <p role="alert">{error}</p>}
      {tab === "contest" && <>
        <h2 style={{ fontSize:25 }}>{ev.name}</h2>
        {setupNeeded ? <section style={card}>
          <p>{kind === "heats" ? "Three heats. Two players advance from each; six play the final." : kind === "heat" ? "Three heats. Each winner advances to the final." : ev.teamCfg ? "Six teams of two. One player photographs. Five matches, including the final." : `All ${ROSTER.length} players compete. Bet on the winner.`}</p>
          {gm ? <ActionButton disabled={pending > 0} pending={pending > 0} onClick={setup}>{ev.teamCfg ? "Draw teams and open betting" : ["heats", "heat"].includes(kind) ? "Set heats and open betting" : "Announce and open betting"}</ActionButton>
            : <p>Waiting for the commissioner to announce this event.</p>}
        </section> : <ContestPanel state={state} ev={ev} me={me} gm={gm} onPlayer={setPlayer} onBets={() => setTab("bets")}
          onLock={reference => act("lockAndStart", { evId:ev.id, ...reference })}
          onWinner={reference => act("recordContestWinner", { evId:ev.id, ...reference })}
          onUndo={reference => act("undoLastContest", { evId:ev.id, ...reference })} onResult={enterResult} />}
        {state.results[ev.id] && <section style={card}><h3>Result posted</h3><p>{state.results[ev.id].slots[0].map(person => disp(state, person)).join(" & ")} won {ev.name}.</p></section>}
      </>}
      {tab === "bets" && <Wagers key={`${kind}:${me}`} state={state} me={me} standings={standings} gm={gm} events={events}
        wagerEv={setupNeeded ? null : ev} onEvents={() => setTab("contest")} onEvent={() => setTab("details")}
        onPick={wager => act("placeWager", { wager })} onRetract={(id, reference) => act("retractWager", { id, ...reference })}
        onVoid={async ids => { for (const id of ids) { const result = await act("voidWager", { id }); if (!result.ok) return result; } return { ok:true }; }}
        onPlayer={setPlayer} GameMark={GameMark} />}
      {tab === "details" && <>
        <CompetitionDetails state={state} ev={ev} onPlayer={setPlayer} />
        <section style={card}><h2 style={{ marginTop:0, fontSize:20 }}>Bets and balances</h2>
          {state.wagers.length ? state.wagers.map(wager => { const settled = resolveWager(state, wager, events); return <p key={wager.id}>{disp(state, wager.player)} · {wager.stake} · {settled.status} · net {settled.delta || 0}</p>; }) : <p>No bets placed.</p>}
          <p>{standings.map(row => `${disp(state, row.player)} ${row.pts.toLocaleString("en-US")}`).join(" · ")}</p>
        </section>
        <section style={card}><h2 style={{ marginTop:0, fontSize:20 }}>Action log</h2>
          <p style={{ fontSize:12 }}>{contest ? `${contest.kind} · ${contest.phase} · revision ${contest.revision}${contest.legacy ? " · legacy data" : ""}` : "No current contest"}</p>
          <ol style={{ paddingLeft:20 }}>{log.map(item => <li key={item.id} style={{ marginBottom:10, fontSize:12 }}>
            <strong>{item.type}</strong> · {item.ok ? "saved" : item.error}<details><summary style={{ minHeight:32 }}>Payload</summary><pre style={{ whiteSpace:"pre-wrap" }}>{JSON.stringify(item.payload, null, 2)}</pre></details>
          </li>)}</ol>
        </section>
      </>}
      {player && <PlayerSheet state={state} me={me} p={player} standings={standings} events={events} onClose={() => setPlayer(null)} />}
      {resultOpen && <ResultEntry state={state} ev={ev} onClose={() => setResultOpen(false)}
        onSave={winner => act("saveResult", { evId:ev.id, slots:[winner, [], []], noScene:true })} />}
    </div>
  </Shell></PlayerIdentityProvider>;
}

const previewRoot = import.meta.hot?.data.root || createRoot(document.getElementById("root"));
if (import.meta.hot) import.meta.hot.data.root = previewRoot;
previewRoot.render(<Preview />);
