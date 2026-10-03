/* Trivia, rehearsed: a whole game built in memory by the real reducers
   (dev/fit/scenarios.js triviaStage, applyAction), shown on a player's
   phone, a spectator's phone, the TV and the commissioner's desk. No
   socket, no Worker: the phone's taps run the real pick write on the
   in-memory state; photos are stand-ins.

     /dev/trivia-preview.html                    every surface, step by step
     ?step=<id>&as=player|spectator|tv|desk      one surface alone (for stills)
     &pause=1                                    animations frozen at their end */
import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { allEventsOf, computeStandings, wagerBoardEvent } from "../shared/core.js";
import { applyAction } from "../worker/actions.js";
import { publicState } from "../worker/publicState.js";
import { bankForDesk } from "../worker/trivia.js";
import { FIT_GUEST, act, dress, triviaStage } from "./fit/scenarios.js";
import { TriviaPlaySheet } from "../src/features/trivia/TriviaPlay.jsx";
import { TriviaDesk } from "../src/features/trivia/TriviaDesk.jsx";
import { TVMode } from "../src/features/tv/TVMode.jsx";
import { PlayerIdentityProvider } from "../src/features/identity/PlayerIdentityContext.js";
import { Shell } from "../src/ui/Shell.jsx";
import { Sheet } from "../src/ui/controls.jsx";
import "../src/ui/shell.css";

const params = new URLSearchParams(location.search);
const AS = params.get("as");
if (params.get("pause")) {
  const style = document.createElement("style");
  style.textContent = "*, *::before, *::after { animation-delay:-60s !important; animation-play-state:paused !important; }";
  document.head.append(style);
}

/* the game, moment by moment */
const lock = state => {
  const game = state.trivia, q = game.questions[game.index];
  const team = game.teams.find(item => item.players.includes(FIT_GUEST));
  act(state, "triviaPick", { questionId:q.id, lock:true }, { isGm:false, player:team.players[2] === FIT_GUEST ? team.players[1] : team.players[2],
    deviceId:"preview", actionId:`lock-${q.id}` });
  return state;
};
export const STEPS = Object.freeze([
  { id:"question", label:"Multiple choice", build:() => triviaStage("question") },
  { id:"locked", label:"Your team locks in", build:() => lock(triviaStage("question")) },
  { id:"reveal", label:"Reveal", build:() => triviaStage("reveal") },
  { id:"number", label:"Closest number", build:() => triviaStage("number") },
  { id:"number-reveal", label:"Closest number reveal", build:() => triviaStage("number-reveal") },
  { id:"board", label:"Scores after a round", build:() => triviaStage("board") },
  { id:"long", label:"A long question", build:() => triviaStage("long") },
  { id:"picture", label:"Picture", build:() => triviaStage("picture") },
  { id:"tune", label:"Name that tune", build:() => triviaStage("tune") },
  { id:"final", label:"Final scores", build:() => triviaStage("final") },
]);
const anchor = state => {
  const game = state.trivia, q = game?.questions?.[game.index];
  const time = game?.times?.[q?.id] || {};
  return game?.phase === "board" ? game.boardAt + 2500 : game?.phase === "reveal" ? time.revealedAt + 3500 : time.startsAt + 6000;
};
/* a stand-in photo: no Worker here to serve one */
const PHOTO = `data:image/svg+xml;charset=utf-8,${encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1600 1200'>"
  + "<rect width='1600' height='1200' fill='#d98a4e'/><rect y='760' width='1600' height='440' fill='#7a3d22'/>"
  + "<path d='M0 760 380 380 620 600 900 300 1240 640 1600 420 1600 760z' fill='#a5482a'/><circle cx='1250' cy='230' r='110' fill='#ffe7b3'/></svg>")}`;
const withPhotos = frame => {
  for (const q of frame.trivia?.questions || []) if (q.photo) q.photo = { ...q.photo, src:PHOTO };
  return frame;
};
const crewOf = state => state.draws?.trivia?.roles?.[0]?.player || null;

function Phone({ base, me, step }) {
  const [state, setState] = useState(base);
  const frame = useMemo(() => withPhotos(publicState(state, { player:me })), [state, me]);
  const now = anchor(base);
  const onPick = async payload => {
    const next = structuredClone(state);
    const result = applyAction(next, "triviaPick", payload, { isGm:false, player:me, deviceId:"preview", actionId:`${Math.random()}` });
    if (result.ok) setState(next);
    return result;
  };
  return <PlayerIdentityProvider profiles={frame.profiles}><Shell environment="production">
    <TriviaPlaySheet key={step} state={frame} me={me} now={now} onPick={onPick} initiallyOpen />
  </Shell></PlayerIdentityProvider>;
}

function Tv({ base }) {
  const frame = withPhotos(publicState(base, {}));
  const events = allEventsOf(frame);
  return <PlayerIdentityProvider profiles={frame.profiles}><Shell tv environment="production">
    <TVMode standings={computeStandings(frame)} state={frame} events={events} onDeckEv={wagerBoardEvent(frame, events)}
      allTied={false} champion={null} coChamps={[]} showControlEnabled={false} rankDeltas={{}}
      connection={{ ready:true, connected:true, status:"open", version:1 }} EventSpotlight={() => null}
      ceremony={null} onExit={() => {}} now={anchor(base)} />
  </Shell></PlayerIdentityProvider>;
}

function Desk({ base }) {
  const frame = withPhotos(publicState(base, { isGm:true }));
  const [state, setState] = useState({ ...frame, trivia:null });
  const onAct = async (type, payload) => {
    const next = structuredClone(state);
    const result = applyAction(next, type, payload, { isGm:true, player:null, deviceId:"preview", actionId:`${Math.random()}` });
    if (result.ok) setState(next);
    return result;
  };
  return <PlayerIdentityProvider profiles={frame.profiles}><Shell environment="production">
    <Sheet title="Trivia" onClose={() => {}}>
      <TriviaDesk state={state} onAct={onAct} notify={() => {}} loadBank={async () => ({ ok:true, categories:bankForDesk() })} />
    </Sheet>
  </Shell></PlayerIdentityProvider>;
}

function Single({ id, as }) {
  const step = STEPS.find(item => item.id === id) || STEPS[0];
  const base = useMemo(() => dress(step.build()), [step]);
  if (as === "tv") return <Tv base={base} />;
  if (as === "desk") return <Desk base={base} />;
  return <Phone base={base} me={as === "spectator" ? crewOf(base) : FIT_GUEST} step={step.id} />;
}

/* every surface for the chosen moment */
function Board() {
  const [id, setId] = useState(params.get("step") || STEPS[0].id);
  const src = as => `/dev/trivia-preview.html?step=${id}&as=${as}`;
  return <div style={{ minHeight:"100vh", background:"#05060c", color:"#f4ecd8", font:"14px/1.4 system-ui", padding:16 }}>
    <nav style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:16 }}>
      {STEPS.map(step => <button key={step.id} type="button" onClick={() => setId(step.id)} style={{ minHeight:40, padding:"0 12px",
        borderRadius:8, border:"1px solid #333", background:step.id === id ? "#5fdcf0" : "#121626", color:step.id === id ? "#0a0910" : "#f4ecd8",
        cursor:"pointer" }}>{step.label}</button>)}
    </nav>
    <div style={{ display:"flex", flexWrap:"wrap", gap:16, alignItems:"flex-start" }}>
      {[["player", "Player on a team"], ["spectator", "Spectator"], ["desk", "Commissioner desk"]].map(([as, label]) =>
        <figure key={as} style={{ margin:0 }}><figcaption style={{ marginBottom:6 }}>{label}</figcaption>
          <iframe key={`${id}:${as}`} title={label} src={src(as)} width="390" height="844" style={{ border:"1px solid #333", borderRadius:12 }} /></figure>)}
      <figure style={{ margin:0 }}><figcaption style={{ marginBottom:6 }}>TV</figcaption>
        <div style={{ width:960, height:540, overflow:"hidden", border:"1px solid #333", borderRadius:12 }}>
          <iframe key={`${id}:tv`} title="TV" src={src("tv")} width="1920" height="1080"
            style={{ border:0, transform:"scale(.5)", transformOrigin:"0 0" }} /></div></figure>
    </div>
  </div>;
}

createRoot(document.getElementById("root")).render(AS ? <Single id={params.get("step")} as={AS} /> : <Board />);
