/* The real TV mode over the interface rehearsal's sample states, in memory.
   /dev/tv-preview.html?scenario=crowd-match (any efficiency-preview id).
   ?gap=N clears the live event and shows ambient turn N (0 is the board).
   Backglass moments: ?moment=walkout|faceoff|crown|bust|blinds plays that
   takeover over the canvas, ?t=ms starts it that far in, ?pause=1 freezes
   it there for stills.
   No socket: the transport is never started; the TV only renders. */
import React from "react";
import { createRoot } from "react-dom/client";
import { allEventsOf, computeStandings, wagerBoardEvent } from "../shared/core.js";
import { TVMode } from "../src/features/tv/TVMode.jsx";
import { TV_AMBIENT_TURN_MS } from "../src/features/tv/tvModel.js";
import { PlayerIdentityProvider } from "../src/features/identity/PlayerIdentityContext.js";
import { Shell } from "../src/ui/Shell.jsx";
import { createEfficiencyFixture } from "./efficiency-preview.jsx";
import { createPortal } from "react-dom";
import { resolveCurrentContest } from "../shared/core.js";
import { TVWalkout } from "../src/features/tv/TVWalkout.jsx";
import { TVPokerMoments } from "../src/features/tv/TVPokerMoments.jsx";
import { FaceOff } from "../src/features/tv/TVFaceOff.jsx";
import { ChampionMoment } from "../src/features/tv/TVChampion.jsx";
import { faceOffView } from "../src/features/tv/faceOff.js";
import { championView } from "../src/features/tv/tvModel.js";
import "../src/ui/shell.css";

const params = new URLSearchParams(location.search);
const id = params.get("scenario") || "crowd-match";
const gap = params.get("gap");
const base = createEfficiencyFixture(id).state;
/* ?spread=1 spreads the board (rulings in 100s) so the ranks show */
const fixture = !params.get("spread") ? base : { ...base, adjustments:[...(base.adjustments || []),
  ...Object.keys(base.profiles || {}).map((p, i) => ({ id:`sp${i}`, player:p, delta:((i * 7) % 13) * 100, reason:"preview", ts:1 }))] };
/* a gap between events: nothing announced, open or in play */
const state = gap === null ? fixture : { ...fixture, onDeck:null, eventOps:{}, draws:{}, brackets:{}, stages:{}, drafts:{},
  poker:null, wagers:[], live:true };
const events = allEventsOf(state);
const standings = computeStandings(state);
const Spotlight = () => null;
const now = gap === null ? undefined : Number(gap) * TV_AMBIENT_TURN_MS + 1000;
const momentKind = params.get("moment");
const T = Number(params.get("t") || 0);
if (params.get("pause")) {
  const style = document.createElement("style");
  style.textContent = "*, *::before, *::after { animation-play-state:paused !important; }";
  document.head.append(style);
}
/* a stand-in album cover for the walkout (?art=0 shows the chip fallback):
   flat shapes in the sample's own SVG, no network */
const SAMPLE_COVER = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 640'><rect width='640' height='640' fill='#1d2a4a'/>"
  + "<circle cx='320' cy='300' r='190' fill='#e8b04a'/><rect y='420' width='640' height='220' fill='#c2543a'/>"
  + "<rect y='470' width='640' height='16' fill='#1d2a4a'/><rect y='520' width='640' height='16' fill='#1d2a4a'/></svg>")}`;
/* a moment the TV's hooks would latch on a fresh frame, T ms in */
function MomentOverlay() {
  const at = Date.now() - T;
  const player = Object.keys(state.profiles || {})[0];
  if (momentKind === "walkout") return <TVWalkout state={state} moment={{ id:"w1", player, mvp:params.get("mvp") === "1",
    mvpEvent:"Volleyball", anchor:at, elapsed:T, track:{ name:"Mr. Brightside", artists:"The Killers",
      imageUrl:params.get("art") === "0" ? null : SAMPLE_COVER } }} />;
  if (momentKind === "bust") return <TVPokerMoments state={state} moments={{ bust:{ id:"b1", player, placeText:"Out in 11th",
    anchor:at, elapsed:T } }} />;
  if (momentKind === "blinds") return <TVPokerMoments state={state} moments={{ blinds:{ id:"l1", from:"50/100", to:"100/200",
    anchor:at, elapsed:T } }} />;
  if (momentKind === "faceoff") {
    const ev = wagerBoardEvent(state, events);
    const contest = ev ? resolveCurrentContest(state, ev) : null;
    const view = ev && contest ? faceOffView(state, ev, contest, events) : null;
    return view ? <FaceOff state={state} events={events} ev={ev} contest={contest} moment={{ id:"f1", anchor:at, elapsed:T }}
      view={{ ...view, record:view.record || params.get("record") || "Tied 1-1" }} /> : null;
  }
  if (momentKind === "crown") {
    /* a spread final board, so one champion stands */
    const players = Object.keys(state.profiles || {});
    const crowned = { ...state, frozen:true, adjustments:[...(state.adjustments || []),
      ...players.map((p, i) => ({ id:`pv${i}`, player:p, delta:(players.length - i) * 300, reason:"preview", ts:1 }))] };
    const final = computeStandings(crowned);
    const view = championView(crowned, events, final);
    /* the frame at rest sits where TV mode puts it, under the masthead */
    return view ? <div style={{ position:"absolute", left:0, right:0, top:96, bottom:0, zIndex:5 }}>
      <ChampionMoment state={crowned} view={view} standings={final} moment={{ id:"c1", anchor:at }} /></div> : null;
  }
  return null;
}
function MomentPortal() {
  const [host, setHost] = React.useState(null);
  React.useEffect(() => { setHost(document.querySelector("[data-tv-canvas]")); }, []);
  return host ? createPortal(<MomentOverlay />, host) : null;
}

createRoot(document.getElementById("tv")).render(
  <PlayerIdentityProvider profiles={state.profiles}><Shell tv environment="isolated preview">
    <TVMode standings={standings} state={state} events={events} onDeckEv={wagerBoardEvent(state, events)}
      allTied={false} champion={null} coChamps={[]} showControlEnabled={false} rankDeltas={{}}
      connection={{ ready:true, connected:true, status:"open", version:1 }} EventSpotlight={Spotlight}
      ceremony={null} onExit={() => {}} now={now} />
    {momentKind && <MomentPortal />}
  </Shell></PlayerIdentityProvider>);
