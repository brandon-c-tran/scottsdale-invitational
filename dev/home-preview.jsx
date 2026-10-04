/* Development-only browser fixture. Real components and server action
   validation run against sample state in memory, with no app connection. */
import React, { useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  EMPTY_STATE, ROSTER, CHIP_COLORS, BUILTIN_EVENTS, ROUND_NAMES,
  atRisk, computeStandings, disp, makeBracket, overflowRoleMeta, resolveSlot,
} from "../shared/core.js";
import { applyAction } from "../worker/actions.js";
import { PlayerIdentityProvider } from "../src/features/identity/PlayerIdentityContext.js";
import { Avatar } from "../src/features/identity/PlayerIdentity.jsx";
import { PlayerSheet } from "../src/features/profile/PlayerSheet.jsx";
import { PlayerPass } from "../src/features/profile/PlayerPass.jsx";
import { GuestHome } from "../src/features/home/GuestHome.jsx";
import { HomeDuels } from "../src/features/home/HomeDuels.jsx";
import { deriveHomeModel } from "../src/features/home/homeModel.js";
import { Board } from "../src/features/standings/Standings.jsx";
import { Wagers } from "../src/features/wagers/Wagers.jsx";
import { Schedule } from "../src/features/weekend/Schedule.jsx";
import { Guide } from "../src/features/weekend/Guide.jsx";
import { HowToSheet } from "../src/features/weekend/HowToSheet.jsx";
import { VenueCard } from "../src/features/travel/Travel.jsx";
import { Shell } from "../src/ui/Shell.jsx";
import { AppHeader, AppNavigation, headerStanding } from "../src/ui/AppChrome.jsx";
import { ActionButton, MenuGroup, MenuRow, Sheet } from "../src/ui/controls.jsx";
import { GameMark } from "../src/ui/GameMark.jsx";
import { usePhaseTheme } from "../src/ui/usePhaseTheme.js";

const me = ROSTER[0];
const events = BUILTIN_EVENTS;
const scenarios = [["before", "Before"], ["betting", "Betting open"], ["playing", "Playing"],
  ["crew", "Crew"], ["result", "Awaiting result"], ["limit", "At limit"], ["final", "Final"]];
const previewControl = { padding:8, minHeight:40, background:"var(--paper)", color:"var(--ink)",
  border:"1px solid var(--line)", borderRadius:6, font:"inherit" };

function fixture(kind) {
  const state = structuredClone(EMPTY_STATE);
  state.live = kind !== "before";
  state.profiles = Object.fromEntries(ROSTER.map((player, index) => [player, {
    display:player, num:index + 1, color:CHIP_COLORS[(index * 2) % CHIP_COLORS.length].hex,
    skin:["ticks", "crown", "wave"][index % 3],
  }]));
  if (kind === "before") return state;
  state.results.putt = { slots:[[ROSTER[2]], [], []], ts:1, revision:1 };
  const participants = kind === "crew" ? ROSTER.slice(1) : ROSTER.slice(0, 12);
  const draw = state.draws["8ball"] = { id:"sample-8ball-draw", ts:2,
    teams:Array.from({ length:6 }, (_, index) => ({ players:participants.slice(index * 2, index * 2 + 2) })),
    roles:[{ player:kind === "crew" ? me : ROSTER[12], role:"photographer" }] };
  state.brackets["8ball"] = makeBracket(6);
  state.eventOps["8ball"] = { drawRevealedAt:2, bettingOpenedAt:3 };
  if (["betting", "limit"].includes(kind)) state.onDeck = "8ball";
  else {
    state.eventOps["8ball"].bettingLockedAt = 4;
    state.eventOps["8ball"].startedAt = 5;
    state.brackets["8ball"].rounds[0][0].winner = 3;
    state.brackets["8ball"].rounds[0][1].winner = 2;
  }
  if (kind === "result") {
    state.brackets["8ball"].rounds[1][0].winner = 0;
    state.brackets["8ball"].rounds[1][1].winner = 1;
    state.brackets["8ball"].rounds[2][0].winner = 0;
    state.eventOps["8ball"].resultEntryAt = 6;
  }
  if (kind === "playing") state.duels = [{ id:"sample-received-duel", game:"quickdraw",
    from:ROSTER[9], to:me, stake:100, status:"open", runs:{}, ts:Date.now() }];
  if (kind === "limit") state.wagers = [{ id:"sample-at-limit", player:me,
    eventId:"8ball", evName:"8-Ball Doubles", kind:"outright", pick:null,
    pickTeam:true, pickPlayers:[...draw.teams[0].players], drawId:draw.id,
    teamIdx:0, stake:500, chips:[{ stake:200, ts:1 }, { stake:200, ts:2 }, { stake:100, ts:3 }],
    ts:1, updatedAt:3, status:"open" }];
  if (kind === "final") {
    state.frozen = true;
    state.onDeck = null;
    state.results.poker = { slots:[[ROSTER[1]], [], []], ts:100, revision:1,
      stacks:Object.fromEntries(ROSTER.map((player, index) => [player, index === 1 ? 4200 : index === 0 ? 2900 : 1000 - index * 50])) };
  }
  return state;
}

function nextOpenMatch(bracket) {
  if (!bracket) return null;
  for (let r = 0; r < bracket.rounds.length; r++) for (let m = 0; m < bracket.rounds[r].length; m++) {
    const match = bracket.rounds[r][m];
    if (match.winner != null) continue;
    const a = resolveSlot(bracket, match.a), b = resolveSlot(bracket, match.b);
    if (a !== null && b !== null) return { r, m, a, b, roundName:ROUND_NAMES[bracket.size]?.[r] || "Match" };
  }
  return null;
}
function Stats({ row, atRisk:exposure }) {
  const parts = [row.wins && `${row.wins} wins`, row.betNet && `${row.betNet > 0 ? "+" : ""}${row.betNet} bets`, exposure && `${exposure} at risk`].filter(Boolean);
  return parts.length ? <div style={{ fontSize:10, color:"var(--muted2)" }}>{parts.join(" · ")}</div> : null;
}
function ProfilePreview({ state, close, back, save }) {
  const [display, setDisplay] = useState(state.profiles[me]?.display || me);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true); setError("");
    const result = await save(display);
    if (result.ok) back ? back() : close();
    else setError(result.error);
    setBusy(false);
  };
  return <Sheet title="Your profile" onClose={close} onBack={back} busy={busy}>
    <PlayerPass state={state} p={me} display={display} compact />
    <label style={{ display:"grid", gap:8, marginBottom:16 }}>Display name
      <input style={previewControl} value={display} disabled={busy} onChange={event => setDisplay(event.target.value)} /></label>
    {error && <p role="alert">{error}</p>}
    <ActionButton onClick={submit} disabled={busy || !display.trim()} pending={busy} style={{ width:"100%" }}>Save profile</ActionButton>
  </Sheet>;
}

function Preview() {
  /* ?scenario=<id>&tab=<board|sched|bets|guide> opens a state directly (headless screenshots) */
  const query = new URLSearchParams(window.location.search);
  const initialKind = scenarios.some(([id]) => id === query.get("scenario")) ? query.get("scenario") : "before";
  const [kind, setKind] = useState(initialKind);
  const [state, setState] = useState(() => fixture(initialKind));
  const [tab, setTab] = useState(() => query.get("tab") || "board");
  const [section, setSection] = useState("trip");
  const [stack, setStack] = useState([]);
  const [failure, setFailure] = useState(false);
  const [duelGm, setDuelGm] = useState(false);
  const [notice, setNotice] = useState("");
  const stateRef = useRef(state); stateRef.current = state;
  const epoch = useRef(0);
  const modal = stack.at(-1);
  const open = entry => setStack(previous => [...previous, entry]);
  const close = () => setStack([]);
  const back = stack.length > 1 ? () => setStack(previous => previous.slice(0, -1)) : null;
  const player = p => open({ type:"player", p });
  const event = ev => open({ type:"event", ev });
  const rules = ev => open({ type:"howto", gameId:ev.game, variant:ev.variant });
  const navigate = next => { close(); setTab(next); window.scrollTo({ top:0, behavior:"instant" }); };
  useLayoutEffect(() => { window.scrollTo({ top:0, behavior:"instant" }); }, [tab]);
  const reset = nextKind => {
    epoch.current++; const next = fixture(nextKind); stateRef.current = next;
    setKind(nextKind); setState(next); setTab("board"); setStack([]); setNotice(""); setDuelGm(false);
    window.scrollTo({ top:0, behavior:"instant" });
  };
  const action = async (type, payload) => {
    const generation = epoch.current;
    await new Promise(resolve => setTimeout(resolve, 250));
    if (generation !== epoch.current) return { ok:false, error:"Preview scenario changed." };
    if (failure) return { ok:false, error:"Preview: connection failed. Try again." };
    const next = structuredClone(stateRef.current);
    const result = applyAction(next, type, payload, { player:me, isGm:duelGm,
      deviceId:"home-preview", actionId:crypto.randomUUID() });
    if (result.ok) { stateRef.current = next; setState(next); }
    else setNotice(result.error);
    return result;
  };
  const standings = computeStandings(state);
  const home = deriveHomeModel({ state, me, events, standings });
  /* the session's glass, as the app sets it (TH1): the painting follows it */
  usePhaseTheme({ state, events, settled:true });
  const bets = () => navigate("bets");
  const ownProfile = () => open({ type:"profile" });
  const crewCard = ({ roles }) => <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
    {(roles || []).map(role => <button key={role.player} type="button" onClick={() => player(role.player)}
      style={{ background:"none", border:0, color:"var(--muted2)", padding:4, fontSize:11 }}>
      {disp(state, role.player)} · {overflowRoleMeta(role.role).label}</button>)}</div>;
  const selectedEvent = modal?.type === "event" ? modal.ev : null;
  const selectedDuel = modal?.type === "duel" ? state.duels.find(duel => duel.id === modal.id) : null;
  const assignment = selectedEvent ? deriveHomeModel({ state, me, events:[selectedEvent], standings }).current?.assignment : null;

  return <PlayerIdentityProvider profiles={state.profiles}><Shell environment="sample preview">
    <div style={{ padding:"12px 18px", borderBottom:"1px solid var(--line)", fontSize:11, color:"var(--muted2)" }}>
      <strong style={{ color:"var(--ink)" }}>Sample data. Changes stay in this page.</strong>
      <div style={{ display:"flex", flexWrap:"wrap", gap:12, alignItems:"center", marginTop:9 }}>
        <label>Scenario <select aria-label="Preview scenario" value={kind} onChange={e => reset(e.target.value)} style={previewControl}>
          {scenarios.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <label><input type="checkbox" checked={failure} onChange={e => setFailure(e.target.checked)} /> Fail actions</label>
        {kind === "playing" && <label><input type="checkbox" checked={duelGm}
          onChange={e => setDuelGm(e.target.checked)} /> Duel GM controls</label>}
        <button type="button" onClick={() => reset(kind)} style={previewControl}>Reset sample</button>
      </div>
    </div>
    <AppHeader state={state} me={me} connected loaded gm={false} GameMark={GameMark}
      standing={tab === "board" ? null : headerStanding(state, standings, me)} onStandings={() => open({ type:"standings" })}
      onHome={() => navigate("board")} onProfile={ownProfile} onMenu={() => open({ type:"menu" })}
      wagerEv={tab === "board" || tab === "bets" ? null : home.betting?.event} wagerMarketOpen={home.betting?.open} onBets={bets} />
    {notice && <div role="status" style={{ padding:"10px 18px", color:"var(--clay)", fontSize:12 }}>
      {notice} <button type="button" onClick={() => setNotice("")} style={previewControl}>Dismiss</button></div>}
    <main id="fd-main" className="fd-main" style={{ paddingBottom:"calc(96px + env(safe-area-inset-bottom))" }}>
      {tab === "board" && <GuestHome state={state} me={me} events={events} standings={standings} GameMark={GameMark}
        onProfile={ownProfile} onPlayer={player} onEvents={() => navigate("sched")}
        onGuide={() => { setSection("rules"); navigate("guide"); }} onHouse={() => open({ type:"trip" })}
        onOpen={event} onRules={rules} onBets={bets} onStandings={() => open({ type:"standings" })}
        duelContent={<HomeDuels state={state} me={me} gm={duelGm} onPlayer={player}
          onPlay={id => open({ type:"duel", id })} onDecline={id => action("declineDuel", { id })}
          onVoid={id => action("voidDuel", { id })} />} />}
      {tab === "sched" && <Schedule state={state} events={events} gm={false} open={event}
        onPlayer={player} GameMark={GameMark} EventCrewCard={crewCard} />}
      {tab === "bets" && <Wagers state={state} me={me} standings={standings} events={events} gm={false}
        wagerEv={home.betting?.event || null} onDeckEv={home.betting?.open ? home.betting.event : null}
        GameMark={GameMark} onPlayer={player} onEvents={() => navigate("sched")}
        onPick={wager => action("placeWager", { wager })} onRetract={id => action("retractWager", { id })} />}
      {tab === "guide" && <Guide state={state} me={me} events={events} section={section} onSection={setSection}
        onProfile={ownProfile} GameMark={GameMark} HowToSheet={HowToSheet} />}
    </main>
    <AppNavigation tab={tab} onTab={navigate} live={state.live} />

    {modal?.type === "standings" && <Sheet title="Standings" onClose={close} onBack={back}>
      <Board embedded state={state} standings={standings} me={me} events={events} gm={false}
        allTied={!state.frozen && standings[0].pts === standings.at(-1).pts}
        champion={state.frozen ? standings[0] : null} coChamps={state.frozen ? standings.filter(row => row.rank === 1) : []}
        myAtRisk={atRisk(state, me, events)} onOpen={event} onPlayer={player}
        GameMark={GameMark} StatPills={Stats} resultImpact={() => ""} nextOpenMatch={nextOpenMatch} />
    </Sheet>}
    {modal?.type === "player" && <PlayerSheet state={state} me={me} p={modal.p} standings={standings}
      events={events} onClose={close} onBack={back} onEdit={ownProfile}
      onDuel={stake => action("sendDuel", { to:modal.p, game:"quickdraw", stake })} />}
    {selectedDuel && <Sheet title="Quick Draw" onClose={close} onBack={back}>
      <p style={{ fontSize:13, lineHeight:1.6 }}>Sample preview. The reaction game does not run here.</p>
      <button type="button" onClick={() => player(selectedDuel.from === me ? selectedDuel.to : selectedDuel.from)}
        style={{ ...previewControl, marginBottom:16 }}>
        {disp(state, selectedDuel.from === me ? selectedDuel.to : selectedDuel.from)} · {selectedDuel.stake} each
      </button>
      <ActionButton onClick={close} style={{ width:"100%" }}>Close</ActionButton>
    </Sheet>}
    {modal?.type === "profile" && <ProfilePreview state={state} close={close} back={back}
      save={display => action("saveProfile", { player:me, display })} />}
    {modal?.type === "trip" && <Sheet title="Trip details" onClose={close} onBack={back}>
      <VenueCard lg={state.logistics} /><ActionButton onClick={close} style={{ width:"100%", marginTop:16 }}>Close</ActionButton>
    </Sheet>}
    {selectedEvent && <Sheet title={selectedEvent.name} onClose={close} onBack={back}>
      <GameMark id={selectedEvent.game} size={72} /><p style={{ fontSize:14, lineHeight:1.65 }}>{selectedEvent.desc}</p>
      {assignment?.label && <p>{assignment.label}</p>}
      {assignment?.role && <p>{overflowRoleMeta(assignment.role).detail}</p>}
      {[...(assignment?.partners || []), ...(assignment?.opponents || [])].map(p =>
        <button type="button" key={p} onClick={() => player(p)} style={{ ...previewControl, display:"inline-flex", alignItems:"center", gap:8, margin:"0 8px 12px 0" }}>
          <Avatar state={state} p={p} size={28} />{disp(state, p)}</button>)}
      <div style={{ display:"flex", gap:10, marginTop:12 }}>
        {home.betting?.event.id === selectedEvent.id && <ActionButton onClick={bets} style={{ flex:1 }}>{home.betting.open ? "Place chips" : "View bets"}</ActionButton>}
        <ActionButton variant="secondary" onClick={() => rules(selectedEvent)} style={{ flex:1 }}>How to play</ActionButton>
        <ActionButton variant="secondary" onClick={close} style={{ flex:1 }}>Close</ActionButton>
      </div>
    </Sheet>}
    {modal?.type === "howto" && <HowToSheet gameId={modal.gameId} variant={modal.variant} onClose={back || close} />}
    {modal?.type === "menu" && <Sheet title="Field Day" onClose={close} onBack={back}>
      <MenuGroup title="Preview"><MenuRow name="Standings" onClick={() => open({ type:"standings" })} />
        <MenuRow name="Your profile" onClick={ownProfile} /><MenuRow name="Trip details" onClick={() => open({ type:"trip" })} />
        <MenuRow name="Rules" onClick={() => { setSection("rules"); navigate("guide"); }} />
      </MenuGroup>
    </Sheet>}
  </Shell></PlayerIdentityProvider>;
}

const previewRoot = import.meta.hot?.data.root || createRoot(document.getElementById("root"));
previewRoot.render(<Preview />);
if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose(data => { data.root = previewRoot; });
}
