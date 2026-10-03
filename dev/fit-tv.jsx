/* The fit audit's TV: the real TVMode over a scenario built in memory by the
   real reducers (dev/fit/scenarios.js), no socket. scripts/fit-audit.mjs
   opens /dev/fit-tv.html?scenario=<id> at 1920x1080 and measures it.
   A crown beat plays the real fresh crown (the frozen state lands on a
   published fresh frame, anchored t ms ago); the walkout, face-off, bust
   and blinds layer their real takeovers over the canvas t ms in. Every
   animation is then paused where it stands, so a still is that instant. */
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { createPortal, flushSync } from "react-dom";
import { allEventsOf, computeStandings, resolveCurrentContest, wagerBoardEvent } from "../shared/core.js";
import { TVMode } from "../src/features/tv/TVMode.jsx";
import { TV_AMBIENT_MS, TV_AMBIENT_TURN_MS, TV_RESULT_MOMENT_MS, TV_TICKER_PAGE_MS } from "../src/features/tv/tvModel.js";
import { FROZEN_TURNS } from "../src/features/results/classPhoto.js";
import { ENGRAVE } from "../src/features/weekend/trophy.js";
import { CROWN_TIMING } from "../src/features/tv/tvMotion.js";
import { crownAnchor } from "../src/features/results/crownTiming.js";
import { TVWalkout } from "../src/features/tv/TVWalkout.jsx";
import { walkoutView } from "../src/features/moments/walkout.js";
import { TVPokerMoments } from "../src/features/tv/TVPokerMoments.jsx";
import { FaceOff } from "../src/features/tv/TVFaceOff.jsx";
import { faceOffView } from "../src/features/tv/faceOff.js";
import { publishFrame } from "../src/lib/frameGate.js";
import { PlayerIdentityProvider, TextFloor } from "../src/features/identity/PlayerIdentityContext.js";
import { Shell } from "../src/ui/Shell.jsx";
import { TV_SCENARIOS, buildScenario, latestPostedAt } from "./fit/scenarios.js";
import "../src/ui/shell.css";

const params = new URLSearchParams(location.search);
const scenario = buildScenario(TV_SCENARIOS, params.get("scenario") || "tv-locker");
const at = scenario.at || {};
/* ?t=ms moves a moment's instant (frame timing) */
const moment = scenario.moment ? { ...scenario.moment, ...(params.get("t") ? { t:Number(params.get("t")) } : {}) } : null;
const crownBeat = moment?.kind === "crown";

/* an ambient turn: a future instant where the turn index is `turn` for any
   rotation of up to eight cards */
const ROTATION = TV_AMBIENT_TURN_MS * 840;
function pickNow(state) {
  /* a plate mid-engrave: the newest result posted just before this trophy
     turn (its result moment played), `engrave` ms into the cut */
  if (at.engrave !== undefined) {
    const turnAt = Math.ceil(Date.now() / ROTATION) * ROTATION + (at.turn || 0) * TV_AMBIENT_TURN_MS;
    const res = Object.values(state.results || {}).sort((a, b) => (Number(b.confirmedAt || b.ts) || 0) - (Number(a.confirmedAt || a.ts) || 0))[0];
    if (res) { res.confirmedAt = turnAt - TV_RESULT_MOMENT_MS - 1000; res.ts = res.confirmedAt; }
    return turnAt + ENGRAVE.lead + at.engrave;
  }
  if (at.turn !== undefined) return Math.ceil(Date.now() / ROTATION) * ROTATION + at.turn * TV_AMBIENT_TURN_MS
    + (at.tick || 0) * TV_TICKER_PAGE_MS + 300;
  if (at.result !== undefined) return latestPostedAt(state) + at.result;
  if (at.crown === "class") return (crownAnchor(state) || Date.now()) + CROWN_TIMING.total + 1000;
  /* the frozen trophy turn a cycle after the one that engraves the champion */
  if (at.crown === "trophy") {
    const ready = (crownAnchor(state) || Date.now()) + CROWN_TIMING.total + TV_AMBIENT_MS;
    let k = Math.ceil(ready / TV_AMBIENT_MS);
    while (FROZEN_TURNS[k % FROZEN_TURNS.length] !== "trophy") k += 1;
    return (k + FROZEN_TURNS.length) * TV_AMBIENT_MS + 300;
  }
  if (at.award !== undefined) {
    const ballot = (state.prompts?.ballots || []).find(b => b?.reveal);
    return (Number(ballot?.reveal?.at) || Date.now()) + at.award;
  }
  if (at.trivia !== undefined) {
    const game = state.trivia, q = game?.questions?.[game.index];
    const time = game?.times?.[q?.id] || {};
    const anchor = game?.phase === "board" ? game.boardAt : game?.phase === "reveal" ? time.revealedAt : time.startsAt;
    return (Number(anchor) || Date.now()) + at.trivia;
  }
  if (at.geoReveal !== undefined) return (Number(state.geo?.revealedAt) || Date.now()) + at.geoReveal;
  if (at.walkout !== undefined) return (Number(state.showControl?.audio?.walkout?.startedAt) || Date.now()) + at.walkout;
  /* a steady view holds still mid-page, never caught in a cross-fade */
  return Math.floor(Date.now() / TV_TICKER_PAGE_MS) * TV_TICKER_PAGE_MS + TV_TICKER_PAGE_MS / 2;
}

/* the crown: the board as it stood before the crowning write, then the
   crowned state on a fresh frame anchored t ms in the past */
function crownStates(state) {
  const before = structuredClone(state);
  before.frozen = false;
  const after = structuredClone(state);
  after.updatedAt = Date.now() - moment.t;
  if (after.showControl?.active) after.showControl.active = null;
  return { before, after };
}

/* ?live=1 lets it run (frame timing), otherwise the still is frozen */
/* ?hide=a,b hides selectors (frame-time bisection) */
if (params.get("hide")) {
  const style = document.createElement("style");
  style.textContent = `${params.get("hide")} { display:none !important; }`;
  document.head.append(style);
}
function pause() {
  if (params.has("live")) return;
  /* an engraving holds one frame exactly: the light half across the plate */
  if (at.engrave !== undefined) document.getAnimations().forEach(anim => { anim.pause(); anim.currentTime = 760; });
  const style = document.createElement("style");
  style.textContent = "*, *::before, *::after { animation-play-state:paused !important; }";
  document.head.append(style);
}

function MomentLayer({ state, events }) {
  const [host, setHost] = useState(null);
  useEffect(() => { setHost(document.querySelector("[data-tv-canvas]")); }, []);
  if (!host || !moment || crownBeat) return null;
  const anchor = Date.now() - moment.t;
  let node = null;
  /* record: the moment the real model reads from the state's walkout record */
  const view = moment.kind === "walkout" && moment.record ? walkoutView(state, events) : null;
  if (view) {
    node = <TVWalkout state={state} moment={{ ...view, id:"fit-walkout", anchor, elapsed:moment.t }} />;
  } else if (moment.kind === "walkout") {
    const saved = state.profiles?.[moment.player]?.walkoutTrack;
    node = <TVWalkout state={state} moment={{ id:"fit-walkout", player:moment.player, mvp:!!moment.mvp,
      mvpEvent:moment.mvp ? "5v5 Full Court" : null, anchor, elapsed:moment.t,
      track:{ name:saved?.name || "Mr. Brightside", artists:"The Killers", imageUrl:null } }} />;
  } else if (moment.kind === "bust") {
    node = <TVPokerMoments state={state} moments={{ bust:{ id:"fit-bust", player:moment.player, placeText:"Out in 11th",
      anchor, elapsed:moment.t } }} />;
  } else if (moment.kind === "blinds") {
    node = <TVPokerMoments state={state} moments={{ blinds:{ id:"fit-blinds", from:"50/100", to:"100/200", anchor,
      elapsed:moment.t } }} />;
  } else if (moment.kind === "faceoff") {
    const ev = wagerBoardEvent(state, events);
    const contest = ev ? resolveCurrentContest(state, ev) : null;
    const view = ev && contest ? faceOffView(state, ev, contest, events) : null;
    node = view ? <FaceOff state={state} events={events} ev={ev} contest={contest} moment={{ id:"fit-faceoff", anchor,
      elapsed:moment.t }} view={{ ...view, record:view.record || "Tied 1-1" }} /> : null;
  }
  return node ? createPortal(node, host) : null;
}

function Harness() {
  const [state, setState] = useState(() => crownBeat ? crownStates(scenario.state).before : scenario.state);
  const [now] = useState(() => crownBeat || moment ? undefined : pickNow(scenario.state));
  useEffect(() => {
    let timer;
    if (crownBeat) {
      timer = setTimeout(() => {
        /* one render sees the crowned state and the fresh frame together,
           as the transport delivers them */
        flushSync(() => {
          setState(crownStates(scenario.state).after);
          publishFrame({ version:2, fresh:true, lastAction:"crownChampion" });
        });
        setTimeout(() => { pause(); window.__FIT_READY__ = true; }, 120);
      }, 400);
    } else {
      /* a scene whose rows enter on their own timers (the map's reveal) waits for them */
      timer = setTimeout(() => { if (moment || at.engrave !== undefined) pause(); window.__FIT_READY__ = true; },
        moment ? 250 : scenario.wait || 900);
    }
    return () => clearTimeout(timer);
  }, []);
  const events = allEventsOf(state);
  const standings = computeStandings(state);
  const allTied = standings.length > 0 && standings[0].pts === standings[standings.length - 1].pts && !state.frozen;
  const onDeckEv = state.onDeck && !state.frozen ? events.find(e => e.id === state.onDeck && !state.results[e.id]) : null;
  window.__fitState = state;
  return (
    <PlayerIdentityProvider profiles={state.profiles}><Shell tv environment="isolated preview">
      <TVMode standings={standings} state={state} events={events} onDeckEv={onDeckEv} allTied={allTied}
        champion={state.frozen ? standings[0] : null} coChamps={state.frozen ? standings.filter(r => r.rank === 1) : []}
        showControlEnabled={false} rankDeltas={{}} connection={{ ready:true, connected:true, status:"open", version:1 }}
        EventSpotlight={() => null} ceremony={scenario.ceremony || null} onExit={() => {}} now={now} />
      <TextFloor px={24}><MomentLayer state={state} events={events} /></TextFloor>
    </Shell></PlayerIdentityProvider>
  );
}

publishFrame({ version:1, fresh:false });
createRoot(document.getElementById("tv")).render(<Harness />);
