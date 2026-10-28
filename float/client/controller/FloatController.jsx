/* The phone's whole game for one room (float/PROTOCOL.md "Components",
   float/GROOVE.md "The screen (TV) and the phone"):
   <FloatController room={id} rider={rider} onExit={fn} />, full screen.
   rider: { name, color, look, drinks?, pid?, photo?, number?, skin?, groom? }

   Optional, beyond the contract's props:
     connect  how to open the room (default connectFloat; the /float/play
              page passes the mock room for ?mock=1)
     onLook   called with the rider's new look when they change it here,
              so a host can keep it (Field Day's profile, the join's storage)

   It opens its own connection (hello carries the rider, and its latest look
   on every reconnect), renders whatever the room says, and never decides
   the game. What the room must confirm (ready, a look, Done) is sent again
   after every reconnect until it does.

   The tap (GROOVE.md "Judging"): in the touch handler itself, the touch's
   own time on the room's clock (serverStamp), matchTap with the room's
   offset, {t:"hit", c, r}, the popup at once and big, the critter's move,
   floatTapSound(q) and tapTick(). A tap that matches no cue only sounds
   and ticks. A phone back from a reconnect carries on by the clock: the
   cues it took stay taken (the room ignores a second hit on a cue anyway).
   Last Call takes one tap (cue 0) and says nothing of it until the reveal:
   no popup, no quality in its sound. The chug-off's Done is `drink`, sent
   again until the room has it. */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { connectFloat } from "../net.js";
import { cleanColor, cleanName } from "../../shared/protocol.js";
import { cleanLook } from "../../shared/looks.js";
import { FLOATIE_IDS } from "../../shared/floaties.js";
import { createWakeLock } from "../../../src/lib/wakeLock.js";
import { qualityOf } from "../../shared/chart.js";
import { tapTick } from "../../../src/lib/haptics.js";
import SongScreen from "./SongScreen.jsx";
import LastCall from "./LastCall.jsx";
import ChugOff from "./ChugOff.jsx";
import Screens from "./Screens.jsx";
import { useRoom } from "./useRoom.js";
import { indexOf, offsetOf, roundShape, roundSong, screenOf, songAtOf, wakeFor } from "./controllerModel.js";
import { createGate, createPad, padTap, restamp, serverStamp, stampOf } from "./rhythm.js";
import { cheerSound, doneSound, tapSound, unlockSound, useControllerSound } from "./sound.js";
import { usePreloadArt } from "./art.jsx";
import "./controller.css";

const DONE_RETRY_MS = 4000;
const FEEDBACK_KEY = "float-feedback";

const store = () => { try { return globalThis.localStorage || null; } catch { return null; } };
const readJson = key => { try { return JSON.parse(store()?.getItem(key) || "null"); } catch { return null; } };
const writeJson = (key, value) => { try { store()?.setItem(key, JSON.stringify(value)); } catch {} };
const sameLook = (a, b) => !!a && !!b && ["critter", "floatie", "hat", "shades", "pose"].every(key => a[key] === b[key]);
const perfNow = () => globalThis.performance?.now?.() ?? Date.now();

/* the page is a game while this is open: still and unzoomable, and awake
   while the Cup wants it (wakeFor: joining to the podium) */
function useGameSurface(awake) {
  const lock = useRef(null);
  useEffect(() => {
    const wake = createWakeLock();
    lock.current = wake;
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
      lock.current = null;
      html.classList.remove("flc-locked");
      document.removeEventListener("gesturestart", stop, opts);
      document.removeEventListener("gesturechange", stop, opts);
      document.removeEventListener("dblclick", stop, opts);
    };
  }, []);
  useEffect(() => {
    const wake = lock.current;
    if (!wake) return;
    if (awake) wake.start(); else wake.release();
  }, [awake]);
  return lock;
}

/* the room's word on this rider's Last Call tap: its ev hit, else me.lastCall { ms, d } */
export function lastCallJudged(game, songKey) {
  const judged = game.memory?.song === songKey ? game.memory.judged || {} : {};
  if (judged[0]) return judged;
  const said = game.me?.lastCall;
  if (said && typeof said === "object" && Number.isFinite(Number(said.d))) {
    const d = Number(said.d);
    return { 0:{ q:game.me.c === 0 && typeof game.me.q === "string" ? game.me.q : qualityOf(d), d } };
  }
  return judged;
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
  const me = useMemo(() => ({ ...(rider || {}), name:cleanName(rider?.name) || "Rider", color:cleanColor(rider?.color) || "#e4572e",
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
  useControllerSound(net, { me:idx >= 0 ? idx : null });
  const phase = game.room?.phase || null;
  const awake = wakeFor(phase);
  const wake = useGameSurface(awake);

  const screen = screenOf({ room:game.room, idx, memory:game.memory });
  const roomEntrant = game.room?.entrants?.[idx] || null;
  const [pendingLook, setPendingLook] = useState(null);
  const entrant = useMemo(() => ({ ...me, ...(roomEntrant || {}), look:pendingLook || roomEntrant?.look || me.look }),
    [me, roomEntrant, pendingLook]);
  usePreloadArt(entrant);
  const cupId = game.room?.cupId || null;
  const songKey = game.songKey;
  const chart = game.chart;
  const songAt = songAtOf(game.room);

  /* ── the chug-off's Done: tapped here (this chug-off), or the room's word ── */
  const chug = phase === "chugoff" && game.room?.chugoff && typeof game.room.chugoff === "object" ? game.room.chugoff : null;
  const chugKey = chug ? `${cupId || ""}:${game.room?.round ?? 0}:${indexOf(chug.a)}:${indexOf(chug.b)}` : null;
  const [doneFor, setDoneFor] = useState(null);
  const doneHere = !!chugKey && doneFor === chugKey;
  const doneRoom = !!chug && idx >= 0 && !!chug.doneAt && typeof chug.doneAt === "object" && chug.doneAt[idx] != null;
  const doneOwedRef = useRef(false);

  /* ── what the room has to confirm, sent again after a reconnect ── */
  const intents = useRef({ ready:null, look:null, lookPhase:null });
  useEffect(() => {
    if (!net) return undefined;
    return net.onStatus(status => {
      if (status !== "open") return;
      const i = intents.current, g = gameRef.current, p = g.room?.phase;
      if (i.ready !== null && (!p || p === "lobby")) net.send({ t:"ready", on:i.ready });
      if (i.look) net.send({ t:"look", look:i.look });
      if (doneOwedRef.current) net.send({ t:"drink" });
    });
  }, [net]);
  useEffect(() => {
    const i = intents.current, p = game.room?.phase;
    if (p && p !== "lobby") i.ready = null;
    if (i.look && ((roomEntrant?.look && sameLook(roomEntrant.look, i.look)) || (p && i.lookPhase && p !== i.lookPhase))) {
      i.look = null;
      setPendingLook(null);
    }
  });
  /* a Done the room has not confirmed goes again every few seconds while the chug-off is on */
  const doneOwed = doneHere && !doneRoom && !!chug && indexOf(chug.winner) === null;
  doneOwedRef.current = doneOwed;
  useEffect(() => {
    if (!doneOwed || !net) return undefined;
    const id = setInterval(() => net.send({ t:"drink" }), DONE_RETRY_MS);
    return () => clearInterval(id);
  }, [doneOwed, net]);

  /* ── the pad ── */
  const pad = useMemo(() => createPad(), []);
  pad.song(songKey);
  const [popup, setPopup] = useState(null);
  const [act, setAct] = useState(null);
  /* Last Call: this phone's own call on its one tap, kept for the reveal */
  const [lcTap, setLcTap] = useState(null);
  /* a new song starts with nothing on the screen */
  useEffect(() => { setPopup(null); setAct(null); }, [songKey]);
  const popupRef = useRef(null);
  popupRef.current = popup;
  const live = useRef({});
  live.current = { chart, songAt, offset:offsetOf(game.room), screen, songKey };
  const seq = useRef(0);
  const show = useCallback(item => {
    seq.current += 1;
    const next = { ...item, key:seq.current, at:perfNow() };
    setPopup(next);
    return next;
  }, []);
  /* the room's word on this rider's cues: taken for good; a different call on the one up restamps it once; its miss pops */
  useEffect(() => {
    if (!net) return undefined;
    const word = msg => {
      const g = gameRef.current;
      if (!Number.isInteger(msg.c) || typeof msg.q !== "string" || (msg.t === "ev" && msg.i !== g.idx)) return;
      if (msg.t === "me" && msg.i !== undefined && msg.i !== g.idx) return;
      pad.take(msg.c);
      const up = popupRef.current;
      const fresh = up && perfNow() - up.at < 900;
      if (fresh && up.c === msg.c) {
        const again = restamp(up, msg);
        if (again) setPopup({ ...again, key:up.key, at:up.at });
        return;
      }
      /* Last Call says nothing until its reveal */
      const s = live.current;
      if (msg.t === "ev" && msg.q === "miss" && (!fresh || up.c < msg.c) && s.screen === "song") {
        show({ c:msg.c, q:"miss", d:null });
        seq.current += 1;
        setAct({ key:seq.current, kind:"miss", q:"miss", at:perfNow() });
      }
    };
    const offEv = net.on("ev", msg => { if (msg.e === "hit") word(msg); });
    const offMe = net.on("me", word);
    return () => { offEv(); offMe(); };
  }, [net, pad, show]);

  const onTap = useCallback(eventAt => {
    const s = live.current;
    if (!net || (s.screen !== "song" && s.screen !== "lastcall")) return;
    /* both clocks first: the sound's first unlock can take a while */
    const perf = perfNow(), server = net.serverNow();
    unlockSound();
    if (wakeFor(gameRef.current.room?.phase)) wake.current?.start();
    const t = serverStamp(stampOf({ timeStamp:eventAt }, perf), { perfNow:perf, serverNow:server });
    /* Last Call: one tap, then Locked; a tap after it does nothing at all */
    if (s.screen === "lastcall" && pad.has(0)) return;
    const { open, found } = padTap(pad, t, { chart:s.chart, songAt:s.songAt, offset:s.offset });
    if (globalThis.__floatMock) globalThis.__floatLastTap = { t, songAt:s.songAt, offset:s.offset, open, c:found?.c ?? null, eventAt, perf };
    if (!open) return;
    if (s.screen === "lastcall") {
      if (found) {
        net.send(found.hit);
        setLcTap({ key:s.songKey, q:found.q, d:found.d });
        tapSound(null, "zero");
      }
      tapTick();
      return;
    }
    if (found) {
      net.send(found.hit);
      show({ c:found.c, q:found.q, d:found.d });
      seq.current += 1;
      setAct({ key:seq.current, kind:found.cue.kind, q:found.q, at:perfNow() });
    }
    tapSound(found ? found.q : null, found?.cue?.kind ?? null);
    tapTick();
  }, [net, pad, show, wake]);

  const onDone = useCallback(() => {
    tapTick();
    unlockSound();
    doneSound();
    setDoneFor(chugKey);
    doneOwedRef.current = true;
    net?.send({ t:"drink" });
  }, [net, chugKey]);

  /* ── the look, the ready, the cheer, the feedback ── */
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
    unlockSound();
    intents.current.ready = !!on;
    net?.send({ t:"ready", on:!!on });
  }, [net]);
  const cheerGate = useMemo(() => createGate(2), []);
  const [cheer, setCheer] = useState(null);
  const onCheer = useCallback(() => {
    unlockSound();
    if (!cheerGate.allow(perfNow())) return;
    tapTick();
    cheerSound();
    net?.send({ t:"cheer" });
    seq.current += 1;
    setCheer({ key:seq.current, kind:"cheer", q:null, at:perfNow() });
  }, [net, cheerGate]);
  const [feedbackFor, setFeedbackFor] = useState(() => readJson(FEEDBACK_KEY));
  const sendFeedback = useCallback(answers => {
    tapTick();
    net?.send({ t:"feedback", answers });
    const cup = gameRef.current.room?.cupId || null;
    if (cup) writeJson(FEEDBACK_KEY, cup);
    setFeedbackFor(cup || "local");
  }, [net]);
  const feedbackSent = !!feedbackFor && (feedbackFor === "local" || feedbackFor === cupId);
  /* any touch keeps the sound unlocked and asks for the wake lock again */
  const onTouchEnd = useCallback(() => {
    unlockSound();
    if (wakeFor(gameRef.current.room?.phase)) wake.current?.start();
  }, [wake]);

  const shape = roundShape(game.room);
  const song = roundSong(game.room);
  const serverNow = net?.serverNow;
  return <div className="flc-root" style={{ "--me":entrant.color }} data-screen={screen} onTouchEnd={onTouchEnd}>
    {screen === "song"
      ? <SongScreen serverNow={serverNow} chart={chart} songAt={songAt} entrant={entrant} shape={shape} name={song.name}
        popup={popup} act={act} me={game.me} onTap={onTap} />
      : screen === "lastcall"
      ? <LastCall serverNow={serverNow} room={game.room} idx={idx} chart={chart} songAt={songAt} entrant={entrant}
        judged={lastCallJudged(game, songKey)} tap={lcTap?.key === songKey ? lcTap : null} onTap={onTap} />
      : screen === "chugoff"
      ? <ChugOff serverNow={serverNow} room={game.room} idx={idx} entrant={entrant} sent={doneHere || doneRoom} onDone={onDone}
        cheer={cheer} onCheer={onCheer} onExit={onExit} />
      : <Screens screen={screen} game={game} entrant={entrant} me={me} groom={groom} serverNow={serverNow} onReady={setReady}
        onLook={setLook} onFeedback={sendFeedback} feedbackSent={feedbackSent} cheer={cheer} onCheer={onCheer} onExit={onExit} />}
    {game.status !== "open" && <div className="flc-link" role="status">
      <i aria-hidden="true" />{game.status === "closed" ? "Disconnected" : "Reconnecting"}</div>}
  </div>;
}
