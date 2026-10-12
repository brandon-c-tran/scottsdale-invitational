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
import { allEventsOf, computeStandings, disp, resolveCurrentContest, resolveWeekendOperation, rosterOf, wagerBoardEvent } from "../shared/core.js";
import { TVMode } from "../src/features/tv/TVMode.jsx";
import { TV_AMBIENT_MS, TV_AMBIENT_TURN_MS, TV_RESULT_MOMENT_MS, TV_TICKER_PAGE_MS, latestResultOf, nextUpEvent, tvLiveEvent }
  from "../src/features/tv/tvModel.js";
import { recordAt, recordCards, withRecordTurns } from "../src/features/tv/recordsModel.js";
import { attractAt, attractRoom, withAttractTurns } from "../src/features/tv/attractModel.js";
import { tvPhotoRotation, withPhotoTurns } from "../src/features/photos/photoModel.js";
import { FROZEN_TURNS } from "../src/features/results/classPhoto.js";
import { ENGRAVE } from "../src/features/weekend/trophy.js";
import { CROWN_TIMING } from "../src/features/tv/tvMotion.js";
import { crownAnchor } from "../src/features/results/crownTiming.js";
import { TVWalkout } from "../src/features/tv/TVWalkout.jsx";
import { walkoutView } from "../src/features/moments/walkout.js";
import { TVPokerMoments } from "../src/features/tv/TVPokerMoments.jsx";
import { FaceOff } from "../src/features/tv/TVFaceOff.jsx";
import { faceOffStart, faceOffView } from "../src/features/tv/faceOff.js";
import { TVGag } from "../src/features/gags/TVGags.jsx";
import { gagPlan } from "../src/features/gags/gagModel.js";
import { LETTER_LAND_MS, bitById } from "../src/features/gags/bits/registry.js";
import { highlightAt, highlightReel, withHighlightTurns } from "../src/features/gags/highlights.js";
import { weekendPhase } from "../src/ui/phase.js";
import { publishFrame } from "../src/lib/frameGate.js";
import { PlayerIdentityProvider, TextFloor } from "../src/features/identity/PlayerIdentityContext.js";
import { Shell } from "../src/ui/Shell.jsx";
import { FIT_ARRIVE_CODE, TV_SCENARIOS, buildScenario, latestPostedAt } from "./fit/scenarios.js";
import { DRAW_INTRO_MS, buildEventReveal, drawStepDelay } from "../src/features/weekend/drawReveal.js";
import "../src/ui/shell.css";

const params = new URLSearchParams(location.search);
const scenario = buildScenario(TV_SCENARIOS, params.get("scenario") || "tv-locker");
const at = scenario.at || {};
/* a bit held "letter" (its name and fact landed) or at its "still" */
const bitInstant = (bit, t) => t === "letter" ? (bit?.letter?.at || 0) + LETTER_LAND_MS + 120 : t === "still" ? bit?.still || 0 : Number(t) || 0;
/* ?t=ms moves a moment's instant (frame timing) */
const moment = scenario.moment ? { ...scenario.moment, ...(params.get("t") ? { t:Number(params.get("t")) } : {}) } : null;
if (moment?.kind === "gag") moment.t = bitInstant(bitById(moment.gag.bit), moment.t);
const crownBeat = moment?.kind === "crown";

/* an ambient turn: a future instant where the turn index is `turn` for any
   rotation of up to ten cards */
const ROTATION = TV_AMBIENT_TURN_MS * 2520;
/* the gap's rotation as TVMode builds it: its own cards, then the records,
   the attract turn, the highlight reel and the photos */
function gapAmbient(state, events) {
  const operationEv = resolveWeekendOperation(state, events).event;
  const liveEv = tvLiveEvent(state, events, operationEv);
  const base = ["board"];
  if (rosterOf(state).some(p => !state.profiles?.[p])) base.push("join");
  if (nextUpEvent(state, events, { liveEv, operationEv })) base.push("next");
  if (latestResultOf(state, events)) base.push("latest");
  if (state.live) base.push("trophy");
  const cards = recordCards(state, events);
  const reel = highlightReel(state, events);
  const room = attractRoom(state);
  return { cards, reel, room, ambient:withAttractTurns(withPhotoTurns(withHighlightTurns(withRecordTurns(base, cards.length), reel.length),
    tvPhotoRotation(state).length), room.length) };
}
/* `record`: the records turn (features/tv/recordsModel.js) that shows the
   card of `kind` (and `players` on it, `worst` for the bettors), `ms` into
   the turn (5 s: the card standing, its entrance done). The gap's rotation
   as TVMode builds it; the harness checks the card it drew is that one. */
function recordNow(state, want) {
  const { cards, ambient } = gapAmbient(state, allEventsOf(state));
  const match = card => card.kind === want.kind && (want.worst === undefined || !!card.worst === want.worst)
    && (!want.players || want.players.every(p => card.players.includes(p)));
  const start = Math.ceil(Date.now() / ROTATION) * ROTATION;
  for (let turn = 0; turn < ambient.length * (cards.length + 1); turn++) {
    const now = start + turn * TV_AMBIENT_TURN_MS + (want.ms ?? 5000);
    const card = recordAt(cards, ambient, now);
    if (card && match(card)) return now;
  }
  throw new Error(`fit: no records turn shows ${JSON.stringify(want)} (${cards.map(card => card.id).join(", ") || "no cards"})`);
}
/* `attract`: the attract turn (features/tv/attractModel.js) that plays the
   idle vignette `id`, `ms` into it; the harness checks the TV drew it */
function attractNow(state, want) {
  const { room, ambient } = gapAmbient(state, allEventsOf(state));
  const start = Math.ceil(Date.now() / ROTATION) * ROTATION;
  for (let turn = 0; turn < ambient.length * 60; turn++) {
    const now = start + turn * TV_AMBIENT_TURN_MS + want.ms;
    if (attractAt({ ambient, now, room })?.id === want.id) return now;
  }
  throw new Error(`fit: no attract turn plays ${want.id} (${room.length} in the room)`);
}
/* `highlight`: the first highlights turn (features/gags/highlights.js),
   `ms` into it (the bit's own clock: its lettering lands, its still holds) */
function highlightNow(state, want) {
  const { reel, ambient } = gapAmbient(state, allEventsOf(state));
  const start = Math.ceil(Date.now() / ROTATION) * ROTATION;
  for (let turn = 0; turn < ambient.length; turn++) {
    const now = start + turn * TV_AMBIENT_TURN_MS + (want.ms ?? 4000);
    if (highlightAt(reel, ambient, now)) return now;
  }
  throw new Error(`fit: no highlights turn (${reel.length} moments)`);
}
function pickNow(state) {
  if (at.record) return recordNow(state, at.record);
  if (at.attract) return attractNow(state, at.attract);
  if (at.highlight) return highlightNow(state, at.highlight);
  /* a plate mid-engrave: the newest result posted just before this trophy
     turn (its result moment played), `engrave` ms into the cut */
  if (at.engrave !== undefined) {
    const turnAt = Math.ceil(Date.now() / ROTATION) * ROTATION + (at.turn || 0) * TV_AMBIENT_TURN_MS;
    const res = Object.values(state.results || {}).sort((a, b) => (Number(b.confirmedAt || b.ts) || 0) - (Number(a.confirmedAt || a.ts) || 0))[0];
    if (res) { res.confirmedAt = turnAt - TV_RESULT_MOMENT_MS - 1000; res.ts = res.confirmedAt; }
    return turnAt + ENGRAVE.lead + at.engrave;
  }
  /* `clock`: the room's clock at this instant (an ISO time; arrivals read Friday's flights against it) */
  const base = at.clock ? Date.parse(at.clock) : Date.now();
  if (at.turn !== undefined) return Math.ceil(base / ROTATION) * ROTATION + at.turn * TV_AMBIENT_TURN_MS
    + (at.tick || 0) * TV_TICKER_PAGE_MS + 300;
  if (at.clock) return Math.floor(base / TV_TICKER_PAGE_MS) * TV_TICKER_PAGE_MS + TV_TICKER_PAGE_MS / 2;
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
  /* the Trivia board's fixtures stand their moment on the state's own write time */
  if (at.board !== undefined) return (Number(state.updatedAt) || Date.now()) + at.board;
  if (at.trivia !== undefined) {
    const game = state.trivia, q = game?.questions?.[game.index];
    const time = game?.times?.[q?.id] || {};
    const anchor = game?.phase === "board" ? game.boardAt : game?.phase === "reveal" ? time.revealedAt : time.startsAt;
    return (Number(anchor) || Date.now()) + at.trivia;
  }
  if (at.geoReveal !== undefined) return (Number(state.geo?.revealedAt) || Date.now()) + at.geoReveal;
  if (at.walkout !== undefined) return (Number(state.showControl?.audio?.walkout?.startedAt) || Date.now()) + at.walkout;
  /* Quick Draw's showdown: `ms` after the newest armed duel's armedAt
     ("armed"), its draw ("fire") or its result ("result", the second run) */
  if (at.duel) {
    const d = [...(state.duels || [])].filter(item => item.armedAt).sort((a, b) => b.armedAt - a.armedAt)[0];
    const result = d ? Math.max(...Object.values(d.runs || {}).map(run => Number(run?.ts) || 0)) : 0;
    const base = !d ? Date.now() : at.duel === "fire" ? d.fireAt : at.duel === "result" ? result : d.armedAt;
    return base + (at.ms || 0);
  }
  /* `gag` ms into the moment the state owes the room (features/gags: a QA
     test first, else the newest write's), or "letter" (its name and fact
     landed) or "still"; ?t=ms moves it */
  if (at.gag !== undefined) {
    const gag = gagPlan(state, allEventsOf(state))[0];
    return (gag?.start || Date.now()) + (params.get("t") ? Number(params.get("t")) : bitInstant(bitById(gag?.bit), at.gag));
  }
  /* `faceoff` ms after the live contest's face-off starts (the TV's teach windows) */
  if (at.faceoff !== undefined) {
    const ev = wagerBoardEvent(state, allEventsOf(state));
    return ((ev && faceOffStart(state, ev)) || Date.now()) + at.faceoff;
  }
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

/* a draw scene: the event's announcement and draw stamps moved so the
   room's clock reads `step` cards turned (and 300 ms into the last), `t`
   ms after the reveal starts, or the whole draw; the real TVDrawReveal then
   joins there as a late TV would. ?t=ms overrides. */
function drawCeremony(state) {
  const spec = scenario.draw;
  const ev = allEventsOf(state).find(item => item.id === spec.ev);
  const reveal = ev ? buildEventReveal(state, ev) : null;
  if (!reveal) return null;
  const total = (reveal.versus ? 2 : reveal.groups.length) + (reveal.crew?.length ? 1 : 0);
  const t = params.get("t") ? Number(params.get("t")) : spec.t !== undefined ? spec.t
    : spec.step ? drawStepDelay(spec.step - 1, total) + 300 : 60000;
  const at = Date.now() - t - DRAW_INTRO_MS;
  const op = state.eventOps[ev.id] || (state.eventOps[ev.id] = {});
  op.announcedAt = at; op.drawRevealedAt = at;
  for (const item of [state.draws?.[ev.id], state.stages?.[ev.id]]) if (item?.id === reveal.id) item.ts = at;
  return { reveal };
}
const drawn = scenario.draw ? drawCeremony(scenario.state) : null;

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
/* ?hold=ms freezes every animation that long after load (a still mid-roll) */
if (params.get("hold")) setTimeout(pause, Number(params.get("hold")));

function MomentLayer({ state, events }) {
  const [host, setHost] = useState(null);
  useEffect(() => { setHost(document.querySelector("[data-tv-canvas]")); }, []);
  if (!host || !moment || crownBeat) return null;
  const anchor = Date.now() - moment.t;
  let node = null;
  /* record: the moment the real model reads from the state's walkout record */
  const view = moment.kind === "walkout" && moment.record ? walkoutView(state, events) : null;
  if (view) {
    node = <TVWalkout state={state} events={events} moment={{ ...view, id:"fit-walkout", anchor, elapsed:moment.t }} />;
  } else if (moment.kind === "walkout") {
    const saved = state.profiles?.[moment.player]?.walkoutTrack;
    node = <TVWalkout state={state} events={events} moment={{ id:"fit-walkout", player:moment.player, anchor, elapsed:moment.t,
      track:{ name:saved?.name || "Mr. Brightside", artists:"The Killers", imageUrl:null } }} />;
  } else if (moment.kind === "bust") {
    node = <TVPokerMoments state={state} moments={{ bust:{ id:"fit-bust", player:moment.player, placeText:"Out in 11th",
      anchor, elapsed:moment.t } }} />;
  } else if (moment.kind === "blinds") {
    node = <TVPokerMoments state={state} moments={{ blinds:{ id:"fit-blinds", from:"50/100", to:"100/200", anchor,
      elapsed:moment.t } }} />;
  } else if (moment.kind === "gag") {
    /* a bit for a cast the reducers cannot reach on cue (a team, a big
       side, a long name): the real takeover, t ms in */
    const bit = bitById(moment.gag.bit);
    const gag = { id:"fit-gag", shape:bit?.shape, ms:bit?.ms || 0, start:anchor, end:anchor + (bit?.ms || 0), elapsed:moment.t,
      name:disp(state, moment.gag.players[0]), beaten:[], ...moment.gag };
    node = <TVGag state={state} gag={gag} phase={weekendPhase(state, events)} />;
  } else if (moment.kind === "faceoff") {
    const ev = wagerBoardEvent(state, events);
    const contest = ev ? resolveCurrentContest(state, ev) : null;
    const view = ev && contest ? faceOffView(state, ev, contest, events) : null;
    node = view ? <FaceOff state={state} events={events} ev={ev} contest={contest} moment={{ id:"fit-faceoff", anchor,
      elapsed:moment.t }} view={{ ...view, record:view.record || "Tied 1-1" }} teach={!!contest.odds} /> : null;
  }
  return node ? createPortal(node, host) : null;
}

let mountedAt = 0;
function Harness() {
  if (!mountedAt && typeof performance !== "undefined") mountedAt = performance.now();
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
      timer = setTimeout(() => {
        /* `pause`: every animation is wound back to the chosen instant (the
           page took a moment to load around it) and held there */
        if (scenario.pause) {
          const lag = performance.now() - mountedAt;
          document.getAnimations().forEach(anim => { anim.pause(); anim.currentTime = Math.max(0, (Number(anim.currentTime) || 0) - lag); });
        }
        /* a gag held as a moment: its own clock (and the board's step-out
           under it) back to the instant it was drawn at, t ms in; the
           chrome keeps the step-out it has already made */
        if (moment?.kind === "gag") document.getAnimations().filter(anim => {
          const el = anim.effect?.target;
          return el?.closest?.(".tv-gag") || el?.matches?.("[data-tv-canvas] > .tv-main");
        }).forEach(anim => { anim.pause(); anim.currentTime = 0; });
        if (moment || at.engrave !== undefined || scenario.pause) pause();
        /* a records view draws the card it asked for, or says so */
        const drawn = at.record ? document.querySelector("[data-record]")?.getAttribute("data-record") || null : null;
        if (at.record && drawn !== at.record.kind)
          setTimeout(() => { throw new Error(`fit: the TV drew ${drawn || "no record"}, not ${at.record.kind}`); });
        /* an attract view draws the vignette it asked for, or says so */
        const bit = at.attract ? document.querySelector(".tv-attract [data-bit]")?.getAttribute("data-bit") || null : null;
        if (at.attract && bit !== at.attract.id)
          setTimeout(() => { throw new Error(`fit: the TV drew ${bit || "no vignette"}, not ${at.attract.id}`); });
        window.__FIT_READY__ = true;
      },
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
        EventSpotlight={() => null} ceremony={drawn || scenario.ceremony || null} onExit={() => {}} now={now}
        arriveCode={FIT_ARRIVE_CODE} />
      <TextFloor px={24}><MomentLayer state={state} events={events} /></TextFloor>
    </Shell></PlayerIdentityProvider>
  );
}

/* each view is its own TV: nothing taught yet (teach.js) */
try { localStorage.removeItem("si-tv-taught-underdog"); localStorage.removeItem("si-tv-taught-bye"); } catch {}
publishFrame({ version:1, fresh:false });
createRoot(document.getElementById("tv")).render(<Harness />);
