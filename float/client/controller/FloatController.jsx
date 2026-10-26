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
   the room takes `hands` only once a race is on. */
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
    const html = document.documentElement, body = document.body;
    const saved = [html.style.overflow, body.style.overflow, html.style.overscrollBehavior, body.style.overscrollBehavior];
    html.style.overflow = body.style.overflow = "hidden";
    html.style.overscrollBehavior = body.style.overscrollBehavior = "none";
    const stop = event => { if (event.cancelable) event.preventDefault(); };
    const opts = { passive:false };
    document.addEventListener("gesturestart", stop, opts);
    document.addEventListener("gesturechange", stop, opts);
    document.addEventListener("dblclick", stop, opts);
    return () => {
      wake.release();
      [html.style.overflow, body.style.overflow, html.style.overscrollBehavior, body.style.overscrollBehavior] = saved;
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

  const game = useRoom(net, { pid:rider?.pid || null });
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
  const ticking = screen === "countdown" ? 100 : ["cut", "outcut", "beach", "grid", "intro"].includes(screen) ? 250 : 0;
  const now = useServerNow(net, ticking);

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

  /* ── the paddles ── */
  const live = screen === "race" && !view.arrived;
  const liveRef = useRef({ live, screen, gun });
  liveRef.current = { live, screen, gun };
  const gate = useMemo(() => createStrokeGate(), []);
  const onStroke = useCallback(stroke => {
    const state = liveRef.current;
    const going = state.live || (state.screen === "countdown" && Number.isFinite(state.gun) && net?.serverNow() >= state.gun);
    if (going && gate.allow(stroke.at)) net?.send({ t:"stroke", side:stroke.side, p:stroke.p });
    taps.stroke(stroke.side, stroke.p);
  }, [net, taps, gate]);
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
  const racing = screen === "race" || screen === "countdown";
  const shared = { game:{ ...game, memory }, entrant, me, now, groom, drink, onDrink, onExit };
  return <div className="flc-root" style={{ "--me":entrant.color }} data-screen={screen}>
    <Frame sideways={sideways} prefer={prefer} geomRef={geomRef}>
      {({ turn }) => <>
        {racing
          ? <RaceScreen entrant={entrant} view={view} geomRef={geomRef} live={live} count={count} drink={drink} onDrink={onDrink}
            slot={gridSlot(game.room, idx)} resume={game.room?.resume === true}
            onStroke={onStroke} onHands={onHands} onTouchEnd={onTouchEnd} onFlip={turn ? flip : null} />
          : <Screens screen={screen} {...shared} onReady={setReady} onLook={setLook} onThrow={throwAt} onFeedback={sendFeedback}
            feedbackSent={feedbackSent} onFlip={turn ? flip : null} />}
        {game.status !== "open" && <div className="flc-link" role="status">
          <i aria-hidden="true" />{game.status === "closed" ? "Disconnected" : "Reconnecting"}</div>}
      </>}
    </Frame>
  </div>;
}
