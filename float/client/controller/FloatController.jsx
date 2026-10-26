/* The phone's whole game for one room (float/PROTOCOL.md "Components"):
   <FloatController room={id} rider={rider} onExit={fn} />, full screen.
   rider: { name, color, look, drinks?, pid?, photo?, number?, skin?, groom? }

   Optional, beyond the contract's props:
     connect  how to open the room (default connectFloat; the /float/play
              page passes the mock room for ?mock=1)
     onLook   called with the rider's new look when they change it here,
              so a host can keep it (Field Day's profile, the join's storage)

   It opens its own connection (hello carries the rider, and its latest look
   on every reconnect), renders whatever the room says, and never decides
   the game. What the room must confirm (ready, a look, a drink) is driven
   from the room's own state and sent again after every reconnect, with the
   thumbs on the paddles now; the thumbs go again at the gun too, because
   the room takes `hands` only once a race is on.

   The beat (PROTOCOL "The beat", rhythm.js): every touch is judged where it
   lands, on the room's clock, and its call is stamped, ticked and heard at
   once; a stroke goes as {t:"stroke", side, p, k, d}. The grid and the
   countdown are practice: the same screen, judged and shown, never sent. */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { connectFloat } from "../net.js";
import { cleanColor, cleanName } from "../../shared/protocol.js";
import { cleanLook } from "../../shared/looks.js";
import { FLOATIE_IDS } from "../../shared/floaties.js";
import { useFloatControllerSound, unlockFloatSound } from "../sound/index.js";
import { createWakeLock } from "../../../src/lib/wakeLock.js";
import { haptic, tapTick } from "../../../src/lib/haptics.js";
import Frame from "./Frame.jsx";
import RaceScreen from "./RaceScreen.jsx";
import Screens from "./Screens.jsx";
import { useRoom } from "./useRoom.js";
import { countFor, drinkState, drinksOn, gridSlot, gunAt, raceView, screenOf } from "./controllerModel.js";
import { POWER_OF, beatGun, beatMode, createRhythm, nextBeatAt, serverStamp, settleFor } from "./rhythm.js";
import { createStrokeGate } from "./strokes.js";
import { saveTurn, savedTurn } from "./turn.js";
import "./controller.css";

const DRINK_RETRY_MS = 4000;
const BEACH_KEY = "float-beach";
const FEEDBACK_KEY = "float-feedback";

const store = () => { try { return globalThis.localStorage || null; } catch { return null; } };
const readJson = key => { try { return JSON.parse(store()?.getItem(key) || "null"); } catch { return null; } };
const writeJson = (key, value) => { try { store()?.setItem(key, JSON.stringify(value)); } catch {} };
const sameLook = (a, b) => !!a && !!b && ["critter", "floatie", "hat", "shades", "pose"].every(key => a[key] === b[key]);

/* the page is a game while this is open: awake, still, unzoomable */
function useGameSurface() {
  const lock = useRef(null);
  useEffect(() => {
    const wake = createWakeLock();
    lock.current = wake;
    wake.start();
    /* a class, not inline styles: a host that locks the page itself (Field
       Day's sheet) unlocks in its own order, and nothing is left stuck */
    const html = document.documentElement;
    html.classList.add("flc-locked");
    const stop = event => { if (event.cancelable) event.preventDefault(); };
    const opts = { passive:false };
    document.addEventListener("gesturestart", stop, opts);
    document.addEventListener("gesturechange", stop, opts);
    document.addEventListener("dblclick", stop, opts);
    return () => {
      wake.release();
      html.classList.remove("flc-locked");
      document.removeEventListener("gesturestart", stop, opts);
      document.removeEventListener("gesturechange", stop, opts);
      document.removeEventListener("dblclick", stop, opts);
    };
  }, []);
  return lock;
}

/* the room's clock, ticking only while a screen counts something */
function useServerNow(net, every) {
  const [now, setNow] = useState(() => net?.serverNow?.() ?? Date.now());
  useEffect(() => {
    if (!net || !every) return undefined;
    setNow(net.serverNow());
    const id = setInterval(() => setNow(net.serverNow()), every);
    return () => clearInterval(id);
  }, [net, every]);
  return net && every ? now : (net?.serverNow?.() ?? Date.now());
}

/* the room's clock, re-read just after every beat from the gun: the 3-2-1
   turns on the beat, not up to a tick later */
function useBeatNow(net, gun, on) {
  const [now, setNow] = useState(() => net?.serverNow?.() ?? Date.now());
  useEffect(() => {
    if (!net || !on || !Number.isFinite(gun)) return undefined;
    let id = null;
    const step = () => {
      const t = net.serverNow();
      setNow(t);
      id = setTimeout(step, Math.max(8, nextBeatAt(t + 1, gun) - net.serverNow()) + 2);
    };
    step();
    return () => clearTimeout(id);
  }, [net, gun, on]);
  return now;
}

const perfNow = () => globalThis.performance?.now?.() ?? Date.now();

/* where the beat is for a stroke now: "live" in a race (and from the gun,
   before the room's word that the race is on), "practice" before the gun,
   else none */
function beatModeNow(state, net) {
  if (state.live) return "live";
  if (state.screen === "countdown" && Number.isFinite(state.gun) && (net?.serverNow?.() ?? -Infinity) >= state.gun) return "live";
  return beatMode(state.screen === "grid" || state.screen === "countdown" ? state.screen : null);
}

export default function FloatController({ room = "test", rider = null, onExit = null, connect = connectFloat, onLook = null }) {
  const groom = !!rider?.groom;
  const seed = rider?.pid || rider?.name || "";
  const riderLook = JSON.stringify(rider?.look || null);
  const [look, setLookState] = useState(() => cleanLook(rider?.look, { groom, floatieIds:FLOATIE_IDS, seed }));
  /* the host changed the rider's look (Field Day's profile): follow it */
  const firstLook = useRef(true);
  useEffect(() => {
    if (firstLook.current) { firstLook.current = false; return; }
    setLookState(cleanLook(rider?.look, { groom, floatieIds:FLOATIE_IDS, seed }));
  }, [riderLook]); // eslint-disable-line react-hooks/exhaustive-deps
  const me = useMemo(() => ({ ...(rider || {}), name:cleanName(rider?.name) || "Rider", color:cleanColor(rider?.color) || "#ff5a4f",
    drinks:rider?.drinks !== false, look }), [rider, look]);
  const meRef = useRef(me);
  meRef.current = me;

  const [net, setNet] = useState(null);
  useEffect(() => {
    const opened = connect({ room, role:"controller", hello:() => ({ rider:meRef.current }) });
    setNet(opened);
    return () => opened.close();
  }, [room, connect]);

  const game = useRoom(net);
  const gameRef = useRef(game);
  gameRef.current = game;
  const { idx } = game;
  const taps = useFloatControllerSound(net, { me:idx >= 0 ? idx : null });
  const wake = useGameSurface();

  const { screen, sideways } = screenOf({ room:game.room, idx });
  const roomEntrant = game.room?.entrants?.[idx] || null;
  const [pendingLook, setPendingLook] = useState(null);
  const entrant = useMemo(() => ({ ...me, ...(roomEntrant || {}), look:pendingLook || roomEntrant?.look || me.look }),
    [me, roomEntrant, pendingLook]);
  const view = raceView(game.me, game.room?.cut);
  const round = Number(game.room?.round) || 0;
  const cupId = game.room?.cupId || null;
  const gun = gunAt(game.room);
  const ticking = ["cut", "outcut", "beach", "grid", "intro"].includes(screen) ? 250 : 0;
  const ticked = useServerNow(net, ticking);
  const beatNow = useBeatNow(net, gun, screen === "countdown");
  const now = screen === "countdown" ? beatNow : ticked;

  /* ── what the room has to confirm, sent again after a reconnect ── */
  const intents = useRef({ ready:null, look:null, lookPhase:null, drink:null, beach:false, hands:0 });
  const [drinkSent, setDrinkSent] = useState(null);
  const [beachMark, setBeachMark] = useState(() => readJson(BEACH_KEY));
  useEffect(() => {
    if (!net) return undefined;
    return net.onStatus(status => {
      if (status !== "open") return;
      const i = intents.current, phase = gameRef.current.room?.phase;
      net.send({ t:"hands", n:i.hands });
      if (i.ready !== null && (!phase || phase === "lobby")) net.send({ t:"ready", on:i.ready });
      if (i.look) net.send({ t:"look", look:i.look });
      if (i.drink !== null && i.drink === (Number(gameRef.current.room?.round) || 0)) net.send({ t:"drink" });
      if (i.beach && net.send({ t:"drink" })) i.beach = false;
    });
  }, [net]);
  useEffect(() => {
    const i = intents.current, phase = game.room?.phase;
    if (phase && phase !== "lobby") i.ready = null;
    if (i.look && ((roomEntrant?.look && sameLook(roomEntrant.look, i.look)) || (phase && i.lookPhase && phase !== i.lookPhase))) {
      i.look = null;
      setPendingLook(null);
    }
    if (i.drink !== null && (i.drink !== round || view.drank)) i.drink = null;
  });

  /* the gun: the room takes hands only once a race is on, and starts everyone at two */
  const lastScreen = useRef(screen);
  useEffect(() => {
    if (screen === "race" && lastScreen.current !== "race") net?.send({ t:"hands", n:intents.current.hands });
    lastScreen.current = screen;
  }, [screen, net]);

  /* ── the paddles and the beat ── */
  const live = screen === "race" && !view.arrived;
  const practice = screen === "grid" || screen === "countdown";
  const racing = practice || screen === "race";
  const rhythm = useMemo(() => createRhythm(), []);
  const visualsRef = useRef(null);
  const beatAt = racing ? beatGun(game.room) : null;
  const beatOn = racing && !view.arrived && !view.swim && Number.isFinite(beatAt);
  const liveRef = useRef({});
  liveRef.current = { live, screen, gun, beatOn, beatAt };
  /* a new grid starts practice over, the race starts the count over */
  useEffect(() => {
    const mode = beatMode(racing ? screen : null);
    if (mode) rhythm.setMode(mode);
  }, [screen, round, racing, rhythm]);
  /* the room's `me` is the truth: the count gives way to it, and its word on the last call restamps it */
  useEffect(() => {
    if (!net) return undefined;
    return net.on("me", msg => {
      rhythm.setSettle(settleFor(net.rtt?.()));
      const word = rhythm.room(msg, net.serverNow());
      if (word) visualsRef.current?.restampLast(word);
    });
  }, [net, rhythm]);
  /* a touch's call, the moment it lands (performance clock), on the room's beat */
  const judgeAt = useCallback(at => {
    const state = liveRef.current;
    if (!net || !state.beatOn) return null;
    const mode = beatModeNow(state, net);
    if (!mode) return null;
    rhythm.setMode(mode);
    return rhythm.peek(serverStamp(at, { perfNow:perfNow(), serverNow:net.serverNow() }), state.beatAt);
  }, [net, rhythm]);
  const onLand = useCallback((side, j) => { taps.stroke(side, POWER_OF[j.q] ?? 0.6, j.q); }, [taps]);
  const gate = useMemo(() => createStrokeGate(), []);
  /* a stroke: its call committed (and returned for the stamp and splash),
     sent with its beat in a live race; past the gate's rate it is held back
     and reads as too fast */
  const onStroke = useCallback(stroke => {
    const state = liveRef.current;
    const mode = beatModeNow(state, net);
    if (mode) rhythm.setMode(mode);
    const going = mode === "live";
    const allowed = going && gate.allow(stroke.at);
    let final = null;
    if (stroke.j && mode) final = going && !allowed ? { k:stroke.j.k, d:stroke.j.d, q:"fast", onBeat:false }
      : rhythm.commit(stroke.j, net?.serverNow?.() ?? Date.now(), { heard:going });
    if (allowed) net?.send(final ? { t:"stroke", side:stroke.side, p:stroke.p, k:final.k, d:final.d } : { t:"stroke", side:stroke.side, p:stroke.p });
    if (!stroke.j) taps.stroke(stroke.side, stroke.p);
    return final;
  }, [net, taps, gate, rhythm]);
  const beat = useMemo(() => net && Number.isFinite(beatAt) ? { rhythm, gun:beatAt, serverNow:net.serverNow } : null, [net, rhythm, beatAt]);
  const onHands = useCallback(n => {
    intents.current.hands = n;
    net?.send({ t:"hands", n });
  }, [net]);
  const onTouchEnd = useCallback(() => { unlockFloatSound(); wake.current?.start(); }, [wake]);
  useEffect(() => {
    if (!net) return undefined;
    const away = () => { intents.current.hands = 0; net.send({ t:"hands", n:0 }); };
    window.addEventListener("pagehide", away);
    return () => window.removeEventListener("pagehide", away);
  }, [net]);

  /* ── the drink ── */
  const owes = idx >= 0 && drinksOn(game.room, idx);
  const drankHere = view.drank || (game.memory.drinkRounds || []).includes(round);
  const sent = !!drinkSent && drinkSent.round === round && (game.status !== "open" || Date.now() - drinkSent.at < DRINK_RETRY_MS);
  const drink = drinkState({ owes, drank:drankHere, sent, live:screen === "race" });
  const [, retick] = useState(0);
  useEffect(() => {
    if (drink !== "sent") return undefined;
    const id = setTimeout(() => retick(n => n + 1), DRINK_RETRY_MS + 50);
    return () => clearTimeout(id);
  }, [drink, drinkSent]);
  const beachDrank = !!cupId && beachMark?.cup === cupId && beachMark?.i === idx;
  const memory = useMemo(() => beachDrank ? { ...game.memory, beachDrank:true } : game.memory, [game.memory, beachDrank]);
  const onDrink = useCallback(() => {
    tapTick();
    haptic("pick");
    unlockFloatSound();
    taps.drink();
    const g = gameRef.current, r = Number(g.room?.round) || 0;
    const where = screenOf({ room:g.room, idx:g.idx }).screen;
    if (where === "beach" || where === "outcut") {
      /* the beach drink: the room answers only the first, so it counts once sent */
      if (!net?.send({ t:"drink" })) intents.current.beach = true;
      const mark = { cup:g.room?.cupId || null, i:g.idx, at:Date.now() };
      if (mark.cup) writeJson(BEACH_KEY, mark);
      setBeachMark(mark.cup ? mark : { cup:"local", i:g.idx });
      return;
    }
    intents.current.drink = r;
    setDrinkSent({ round:r, at:Date.now() });
    net?.send({ t:"drink" });
  }, [net, taps]);

  /* ── the look, the ready, the balloons, the feedback ── */
  const setLook = useCallback(next => {
    const clean = cleanLook(next, { groom, floatieIds:FLOATIE_IDS, seed });
    setLookState(clean);
    setPendingLook(clean);
    intents.current.look = clean;
    intents.current.lookPhase = gameRef.current.room?.phase || null;
    net?.send({ t:"look", look:clean });
    onLook?.(clean);
  }, [net, groom, seed, onLook]);
  const setReady = useCallback(on => {
    tapTick();
    unlockFloatSound();
    intents.current.ready = !!on;
    net?.send({ t:"ready", on:!!on });
  }, [net]);
  const throwAt = useCallback(at => {
    tapTick();
    haptic("place");
    unlockFloatSound();
    taps.throw();
    net?.send({ t:"balloon", at });
  }, [net, taps]);
  const [feedbackFor, setFeedbackFor] = useState(() => readJson(FEEDBACK_KEY));
  const sendFeedback = useCallback(answers => {
    tapTick();
    net?.send({ t:"feedback", answers });
    const cup = gameRef.current.room?.cupId || null;
    if (cup) writeJson(FEEDBACK_KEY, cup);
    setFeedbackFor(cup || "local");
  }, [net]);
  const feedbackSent = !!feedbackFor && (feedbackFor === "local" || feedbackFor === cupId);

  /* ── the turn ── */
  const [prefer, setPrefer] = useState(savedTurn);
  const geomRef = useRef({});
  const flip = useCallback(() => {
    tapTick();
    setPrefer(turn => { const next = turn === -90 ? 90 : -90; saveTurn(next); return next; });
  }, []);
  const count = screen === "countdown" ? countFor(gun, now) : null;
  const shared = { game:{ ...game, memory }, entrant, me, now, groom, drink, onDrink, onExit };
  return <div className="flc-root" style={{ "--me":entrant.color }} data-screen={screen}>
    <Frame sideways={sideways} prefer={prefer} geomRef={geomRef}>
      {({ turn }) => <>
        {racing
          ? <RaceScreen entrant={entrant} view={view} geomRef={geomRef} live={live} count={count} drink={drink} onDrink={onDrink}
            slot={gridSlot(game.room, idx)} resume={game.room?.resume === true}
            endsAt={game.room?.phase === "race" ? Number(game.room?.endsAt) || null : null} now={now}
            practice={practice} beat={beat} visualsRef={visualsRef} judgeAt={judgeAt} onLand={onLand}
            onStroke={onStroke} onHands={onHands} onTouchEnd={onTouchEnd} onFlip={turn ? flip : null} />
          : <Screens screen={screen} {...shared} onReady={setReady} onLook={setLook} onThrow={throwAt} onFeedback={sendFeedback}
            feedbackSent={feedbackSent} onFlip={turn ? flip : null} />}
        {game.status !== "open" && <div className="flc-link" role="status">
          <i aria-hidden="true" />{game.status === "closed" ? "Disconnected" : "Reconnecting"}</div>}
      </>}
    </Frame>
  </div>;
}
