/* Actual app sheets over sample state. The generated component module replaces
   every transport export with a throwing stub. App itself is never rendered. */
import React, { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  EMPTY_STATE, ROSTER, CHIP_COLORS, BUILTIN_EVENTS, ROUND_NAMES, allEventsOf,
  computeStandings, defaultQaParticipants, resolveCurrentContest, resolveEventLifecycle,
  resolveSlot, teamLabel, wagerBoardEvent, draftTurn,
} from "../shared/core.js";
import { applyAction } from "../worker/actions.js";
import {
  EventSheet, BracketSheet, EventIntro, Reveal, ResultSheet, PokerResultSheet, ChipCounter,
  PlayerIdentityProvider, PlayerSheet, Wagers, Shell, GameMark, Sheet, ActionButton, DraftSheet,
} from "./efficiency-components.js";
import { buildEventReveal } from "../src/features/weekend/drawReveal.js";
import "./efficiency-components.css";

export const scenarios = [
  { id:"draft-setup", label:"Volleyball · captain setup", evId:"volley", surface:"draft" },
  { id:"draft-live", label:"Volleyball · draft", evId:"volley", surface:"draft" },
  { id:"draft-four", label:"Volleyball · four captains", evId:"volley", surface:"draft" },
  { id:"draft-complete", label:"Volleyball · teams picked", evId:"volley", surface:"draft" },
  { id:"bracket-open", label:"8-Ball · betting open", evId:"8ball", surface:"event" },
  { id:"bracket-play", label:"8-Ball · playing", evId:"8ball", surface:"event" },
  { id:"bracket-view", label:"Full bracket", evId:"8ball", surface:"bracket" },
  { id:"heats", label:"Beerio Kart · heats", evId:"beerio", surface:"event" },
  { id:"ffa", label:"Long Putt · announcement", evId:"putt", surface:"intro" },
  { id:"draw", label:"8-Ball · draw reveal", evId:"8ball", surface:"reveal" },
  { id:"results", label:"8-Ball · result entry", evId:"8ball", surface:"result" },
  { id:"poker", label:"Poker · counts", evId:"poker", surface:"poker" },
  { id:"counter", label:"Poker · chip counter", evId:"poker", surface:"counter" },
  /* every guest bets: how the board holds a crowd */
  { id:"crowd-match", label:"Bets · doubles matchup, everyone in", evId:"8ball", surface:null, crowd:true },
  { id:"crowd-ffa", label:"Bets · free-for-all, everyone in", evId:"putt", surface:null, crowd:true },
  { id:"crowd-team", label:"Bets · 7 v 6, everyone in", evId:"bball5", surface:null, crowd:true },
  { id:"crowd-heat", label:"Bets · heat, everyone in", evId:"beerio", surface:null, crowd:true },
];
/* the pick a side's + makes (Wagers contestPick) */
function crowdPick(contest, side, ev) {
  const common = { eventId:ev.id, evName:ev.name, contestId:contest.id, contestRevision:contest.revision,
    pickPlayers:[...side.players] };
  if (contest.kind === "ffa") return { ...common, kind:"outright", pickTeam:typeof side.key === "number",
    ...(typeof side.key === "number" ? { drawId:contest.drawId } : { pick:side.key }) };
  if (contest.kind === "match") return { ...common, kind:"match", pickTeam:true, drawId:contest.drawId,
    match:[...contest.match], teamIdx:side.key, matchName:contest.label };
  const pickTeam = typeof side.key === "number";
  const stage = { ...common, stagesId:contest.stagesId, pickKey:side.key, pickTeam,
    ...(pickTeam && contest.drawId ? { drawId:contest.drawId } : {}) };
  return contest.kind === "heat" ? { ...stage, kind:"heat", group:contest.group, groupName:contest.label }
    : { ...stage, kind:"stage", final:true };
}
/* each guest taps a mix of chips onto one side: their own when they play */
const CROWD_TAPS = [[100, 200], [500], [100, 100, 100], [200, 200], [100], [500], [200, 100, 100], [100, 200, 200],
  [500], [100], [200], [100, 100], [500]];
const reference = (state, ev) => {
  const contest = resolveCurrentContest(state, ev);
  return contest ? { contestId:contest.id, contestRevision:contest.revision } : {};
};
const sampleActor = { isGm:true, player:ROSTER.at(-1), deviceId:"efficiency-preview" };
export function createEfficiencyFixture(id) {
  const scenario = scenarios.find(item => item.id === id) || scenarios[0];
  const state = structuredClone(EMPTY_STATE), ev = BUILTIN_EVENTS.find(event => event.id === scenario.evId);
  state.profiles = Object.fromEntries(ROSTER.map((player, index) => [player, {
    display:player, num:index + 1, color:CHIP_COLORS[index * 2 % CHIP_COLORS.length].hex,
    skin:["ticks", "crown", "wave"][index % 3],
  }]));
  const seed = (type, payload = {}, actor = sampleActor) => {
    /* the first game-opening write carries the weekend-start confirm */
    const confirmed = ["announceEvent", "announceAndDraw", "startEvent", "lockAndStart", "pokerStart", "setOnDeck"]
      .includes(type) && !state.live ? { ...payload, startWeekend:true } : payload;
    const result = applyAction(state, type, confirmed, { ...actor, actionId:crypto.randomUUID() });
    if (!result.ok) throw new Error(`${scenario.id}: ${type}: ${result.error}`);
    return result;
  };
  if (scenario.id.startsWith("draft-")) {
    if (scenario.id !== "draft-setup") {
      const players = defaultQaParticipants(ev);
      seed("startDraft", { evId:ev.id, players, captains:players.slice(0,ev.teamCfg.teams) });
      const count = scenario.id === "draft-complete" ? players.length - ev.teamCfg.teams : 2;
      for (let i=0; i<count; i++) seed("pickDraftPlayer", { evId:ev.id,
        player:state.drafts[ev.id].pool[0], ...draftTurn(state.drafts[ev.id]) });
    }
  } else if (ev.finale) {
    seed("pokerSetup"); seed("pokerStart");
    for (const player of ROSTER.slice(0, 5)) seed("pokerCount", { player, count:state.poker.startingStacks[player] });
    seed("pokerBust", { player:ROSTER[10] });
    seed("pokerBust", { player:ROSTER[11] });
  } else {
    if (ev.teamCfg) seed("announceAndDraw", { evId:ev.id, players:defaultQaParticipants(ev),
      roles:ROSTER.filter(player => !defaultQaParticipants(ev).includes(player)).map(player => ({ player, role:"photographer" })) });
    else {
      if (ev.stageCfg) seed("runStages", { evId:ev.id, cfg:{ ...ev.stageCfg, advance:2, players:defaultQaParticipants(ev) } });
      seed("setOnDeck", { id:ev.id });
    }
    const contest = resolveCurrentContest(state, ev), side = contest.sides[0];
    if (scenario.crowd) {
      ROSTER.forEach((player, index) => {
        const own = contest.sides.find(item => item.players.includes(player));
        const pick = own || contest.sides[index % contest.sides.length];
        for (const stake of CROWD_TAPS[index % CROWD_TAPS.length])
          seed("placeWager", { wager:{ ...crowdPick(resolveCurrentContest(state, ev), pick, ev), stake } },
            { isGm:false, player, deviceId:`crowd-${index}` });
      });
    } else if (contest.kind === "match") seed("placeWager", { wager:{ kind:"match", eventId:ev.id,
      drawId:contest.drawId, match:contest.match, teamIdx:side.key, stake:200, ...reference(state, ev) } });
    if (["bracket-play", "bracket-view", "results"].includes(scenario.id)) seed("lockAndStart", { evId:ev.id, ...reference(state, ev) });
    if (scenario.id === "results") {
      let current = resolveCurrentContest(state, ev), steps = 0;
      while (current) {
        if (++steps > 20) throw new Error("Fixture did not finish its bracket");
        if (current.phase === "betting-open") seed("lockAndStart", { evId:ev.id, ...reference(state, ev) });
        seed("recordContestWinner", { evId:ev.id, winner:current.sides[0].key, ...reference(state, ev) });
        current = resolveCurrentContest(state, ev);
      }
    }
  }
  return { state, scenario };
}

function revealFor(state, ev) {
  const draw = state.draws[ev.id], bracket = state.brackets[ev.id], seated = new Set();
  const line = key => ({ avatars:draw.teams[key].players, text:teamLabel(state, draw.teams[key]) });
  const rounds = ROUND_NAMES[bracket.size] || [];
  const groups = bracket.rounds[0].flatMap((match, index) => {
    const a = resolveSlot(bracket, match.a), b = resolveSlot(bracket, match.b);
    if (a == null || b == null) return [];
    seated.add(a); seated.add(b);
    return [{ title:`${rounds[0] || "Round 1"} ${index + 1}`, vs:true, lines:[line(a), line(b)] }];
  });
  const byes = draw.teams.map((_, index) => index).filter(index => !seated.has(index));
  if (byes.length) groups.push({ title:rounds[1] ? `Straight to the ${rounds[1].toLowerCase()}` : "Bye", lines:byes.map(line) });
  return { id:draw.id, evId:ev.id, title:"The draw", subtitle:ev.name, groups, crew:draw.roles || [] };
}

const initialId = typeof location === "undefined" ? "bracket-open" : new URLSearchParams(location.search).get("scenario");
function Preview() {
  const [sample, setSample] = useState(() => createEfficiencyFixture(initialId));
  const [gm, setGm] = useState(true), [me, setMe] = useState(ROSTER.at(-1));
  const [surface, setSurface] = useState(sample.scenario.surface), [history, setHistory] = useState([]);
  const [player, setPlayer] = useState(null), [failure, setFailure] = useState(false), [notice, setNotice] = useState("");
  const stateRef = useRef(sample.state), epoch = useRef(0), current = useRef({ gm, me, failure });
  current.current = { gm, me, failure };
  const state = sample.state, events = allEventsOf(state), standings = computeStandings(state);
  const ev = events.find(event => event.id === sample.scenario.evId), wagerEv = wagerBoardEvent(state, events);
  const close = () => { setSurface(null); setHistory([]); };
  const push = next => { setHistory(previous => [...previous, surface]); setSurface(next); };
  const back = history.length ? () => { setSurface(history.at(-1)); setHistory(previous => previous.slice(0, -1)); } : undefined;
  const openPlayer = person => { setPlayer(person); push("player"); };
  const reset = id => {
    const next = createEfficiencyFixture(id); epoch.current++; stateRef.current = next.state;
    setSample(next); setSurface(next.scenario.surface); setHistory([]); setPlayer(null); setNotice("");
  };
  const act = async (type, payload = {}) => {
    const generation = epoch.current, actor = current.current;
    await new Promise(resolve => setTimeout(resolve, 200));
    if (generation !== epoch.current) return { ok:false, error:"Preview changed. Try again." };
    const next = structuredClone(stateRef.current);
    const result = actor.failure ? { ok:false, error:"Preview save failed. Turn off failure and retry." }
      : applyAction(next, type, payload, { isGm:actor.gm, player:actor.me, deviceId:"efficiency-preview", actionId:crypto.randomUUID() });
    if (result.ok) { stateRef.current = next; setSample(previous => ({ ...previous, state:next })); }
    setNotice(result.ok ? "Saved in this preview" : result.error);
    return result;
  };
  const enterResult = async () => {
    if (!stateRef.current.results[ev.id] && resolveEventLifecycle(stateRef.current, ev).phase !== "result-entry") {
      const result = await act("beginResultEntry", { evId:ev.id });
      if (!result.ok) return result;
    }
    push("result"); return { ok:true };
  };
  const openBets = () => close();
  const control = { minHeight:44, padding:"8px 10px", border:"1px solid var(--line)", borderRadius:8,
    background:"var(--paper)", color:"var(--ink)", font:"inherit", minWidth:0 };
  return <PlayerIdentityProvider profiles={state.profiles}><Shell environment="isolated preview">
    <section style={{ padding:16, display:"grid", gap:10, fontSize:13 }} aria-label="Preview controls">
      <h1 style={{ margin:0, fontSize:23 }}>Interface rehearsal</h1>
      <label style={{ display:"grid", gap:5 }}>Preview scenario<select value={sample.scenario.id} style={control} onChange={event => reset(event.target.value)}>
        {scenarios.map(scenario => <option key={scenario.id} value={scenario.id}>{scenario.label}</option>)}
      </select></label>
      <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
        <label style={{ display:"flex", alignItems:"center", gap:6, minHeight:44 }}><input type="checkbox" checked={gm} onChange={event => setGm(event.target.checked)} />Host</label>
        <select aria-label="Preview player" style={{ ...control, flex:1 }} value={me} onChange={event => setMe(event.target.value)}>{ROSTER.map(person => <option key={person}>{person}</option>)}</select>
        <label style={{ display:"flex", alignItems:"center", gap:6, minHeight:44 }}><input type="checkbox" checked={failure} onChange={event => setFailure(event.target.checked)} />Fail saves</label>
      </div>
      <div style={{ display:"flex", gap:8 }}><ActionButton onClick={() => setSurface(sample.scenario.surface)}>Open sample</ActionButton>
        <ActionButton variant="secondary" onClick={() => reset(sample.scenario.id)}>Reset</ActionButton></div>
      <p role="status" style={{ margin:0, color:"var(--muted2)", lineHeight:1.5 }}>{notice || "Sample data in memory. No connection to your tournament."}</p>
    </section>
    {wagerEv && <Wagers state={state} me={me} gm={gm} standings={standings} events={events} wagerEv={wagerEv} GameMark={GameMark}
      onEvents={() => setSurface("event")} onEvent={() => setSurface("event")} onPlayer={openPlayer}
      onPick={wager => act("placeWager", { wager })} onRetract={(id, ref) => act("retractWager", { id, ...ref })}
      onVoid={ids => Promise.all(ids.map(id => act("voidWager", { id })))} />}
    {surface === "event" && <EventSheet ev={ev} state={state} me={me} gm={gm} onClose={close} onBack={back} onPlayer={openPlayer}
      onBets={wagerEv?.id === ev.id ? openBets : null} onLock={ref => act("lockAndStart", { evId:ev.id, ...ref })}
      onWinner={result => act("recordContestWinner", { evId:ev.id, ...result })}
      onUndo={ref => act("undoLastContest", { evId:ev.id, ...ref })} enterResult={enterResult}
      clearRes={reason => act("clearResult", { evId:ev.id, confirmClear:true, correctionReason:reason })}
      onEdit={patch => act("editEvent", { id:ev.id, patch })}
      onDraw={(players, roles) => act("runDraw", { evId:ev.id, players, roles })} onClearDraw={() => act("clearDraw", { evId:ev.id })}
      onStages={cfg => act("runStages", { evId:ev.id, cfg })} onClearStages={() => act("clearStages", { evId:ev.id })}
      onThrough={(g, key) => act("toggleThrough", { evId:ev.id, g, key })} onFinal={key => act("setFinalWinner", { evId:ev.id, key })}
      onDeckToggle={() => act("setOnDeck", { id:state.onDeck === ev.id ? null : ev.id, ...reference(state, ev) })}
      onStart={() => act("startEvent", { evId:ev.id, ...reference(state, ev) })} onShelve={on => act("shelve", { id:ev.id, on })}
      onRemove={() => act("removeEvent", { id:ev.id })} openBracket={() => push("bracket")}
      openDraft={() => setNotice("Choose a drawn-event sample to review these sheets.")} />}
    {surface === "bracket" && <BracketSheet state={state} ev={ev} me={me} gm={gm} onClose={close} onBack={back} onPlayer={openPlayer}
      onLock={ref => act("lockAndStart", { evId:ev.id, ...ref })}
      onWinner={result => act("recordContestWinner", { evId:ev.id, ...result })}
      onUndo={ref => act("undoLastContest", { evId:ev.id, ...ref })}
      onBets={openBets} onPostResult={enterResult} />}
    {surface === "intro" && <EventIntro state={state} ev={ev} auto={false} onClose={close} onBets={openBets} />}
    {surface === "reveal" && <Reveal state={state} reveal={buildEventReveal(state,ev)} auto={false} onClose={close} onBets={wagerEv ? openBets : null} onPlayer={openPlayer} />}
    {surface === "draft" && <DraftSheet ev={ev} state={state} me={me} gm={gm} standings={standings}
      pool={defaultQaParticipants(ev)} onClose={() => setSurface(stateRef.current.draws[ev.id] ? "reveal" : null)} onPlayer={openPlayer}
      onStart={(captains,players) => act("startDraft", { evId:ev.id, captains,players })}
      onPick={(player,ref) => act("pickDraftPlayer", { evId:ev.id, player,...ref })}
      onUndo={ref => act("undoDraftPick", { evId:ev.id,...ref })}
      onFinalize={ref => act("finalizeDraft", { evId:ev.id,...ref })}
      onCancel={ref => act("cancelDraft", { evId:ev.id,...ref })}/>}
    {surface === "result" && <ResultSheet state={state} ev={ev} onClose={close} save={async (slots, options) => {
      const result = await act("saveResult", { evId:ev.id, slots, ...options }); if (result.ok) close(); return result;
    }} />}
    {surface === "poker" && <PokerResultSheet state={state} onClose={close}
      onCount={(player, count) => act("pokerCount", { player, count })} onBust={player => act("pokerBust", { player })}
      onUnbust={player => act("pokerUnbust", { player })} onPost={() => act("pokerResult")} />}
    {surface === "counter" && <Sheet title="Count your chips" onClose={close}><ChipCounter start={state.poker?.counts[me] ?? state.poker?.startingStacks[me]}
      onDone={async count => { const result = await act("pokerCount", { player:me, count }); if (result.ok) close(); return result; }} /></Sheet>}
    {surface === "player" && player && <PlayerSheet state={state} me={me} p={player} standings={standings} events={events} onClose={close}
      onBack={back} onDuel={stake => act("sendDuel", { to:player, game:"quickdraw", stake })} />}
  </Shell></PlayerIdentityProvider>;
}

if (typeof document !== "undefined" && document.getElementById("root")) {
  const previewRoot = import.meta.hot?.data.root || createRoot(document.getElementById("root"));
  previewRoot.render(<Preview />);
  if (import.meta.hot) {
    import.meta.hot.accept();
    import.meta.hot.dispose(data => { data.root = previewRoot; });
  }
}
