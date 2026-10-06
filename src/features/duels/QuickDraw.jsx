import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { DUEL_LAPSE_MS, DUEL_READY_MS, disp, duelReadyUntil, resolveDuel } from "../../../shared/core.js";
import { ChipFace } from "../identity/PlayerIdentity.jsx";
import { ActionButton } from "../../ui/controls.jsx";
import { GlassArt } from "../../ui/GlassArt.jsx";
import { ScoreReel } from "../../ui/ScoreReel.jsx";
import { ChipStack, HOUSE_CHIP } from "../wagers/BetStacks.jsx";
import { duelView, duelsOpen } from "./duelView.js";
import { SHOWDOWN, STANCE_GRACE_MS, duelScreen, showdownResultAt } from "./showdown.js";
import "./quickdraw.css";
import { useDuelClock } from "./useDuelClock.js";
import { serverNow } from "../../lib/serverClock.js";
import { tapTick } from "../../lib/haptics.js";
import { setQuickDrawHush } from "../../lib/sound.js";

const fmt = n => (n ?? 0).toLocaleString("en-US");
/* the server accepts 80 to 5,000 ms. Faster than 80 cannot be a reaction to
   the flash, so it is a foul; slower records as the slowest time. */
export const QD_MIN_MS = 80;
export const QD_MAX_MS = 5000;
const FOUL = Object.freeze({ ms:null, foul:true });
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
/* a solo draw's own lamps and wait, from the Ready tap */
const SOLO_WAIT = Object.freeze({ min:1500, span:2500 });
const SOLO_LAMPS = Object.freeze([250, 600, 950]);
const CHIP = 88;
/* the deck's buttons: one width, the Ready a lit plate in the display face */
const WIDE = Object.freeze({ width:"min(100%, 320px)" });
const READY = Object.freeze({ width:"min(100%, 320px)", minHeight:64, fontFamily:"var(--fd-display)", fontSize:26,
  fontWeight:800, letterSpacing:".1em", textTransform:"uppercase" });
const ANTE_CHIP = 30;

/* One reaction per duel. It is kept on this device until the server
   acknowledges it, so reopening after a lost ack resubmits the same reaction
   instead of offering a fresh (possibly better) attempt. */
const captureKey = (id, me) => `fd-qd:${id}:${me}`;
export function readCaptured(id, me) {
  if (!id || !me) return null;
  try {
    const raw = window.localStorage.getItem(captureKey(id, me));
    const run = raw ? JSON.parse(raw) : null;
    if (run && (run.foul === true || Number.isFinite(run.ms))) return { ms:run.foul ? null : run.ms, foul:!!run.foul };
  } catch { /* storage unavailable: the in-memory capture still holds */ }
  return null;
}
const storeCaptured = (id, me, run) => {
  try { window.localStorage.setItem(captureKey(id, me), JSON.stringify(run)); } catch { /* ignore */ }
};
const clearCaptured = (id, me) => {
  try { window.localStorage.removeItem(captureKey(id, me)); } catch { /* ignore */ }
};
/* the reaction for a tap `elapsed` ms after the flash painted; a tap before
   the flash is stamped could not have been a reaction to it */
export function reactionFor(elapsed) {
  if (!Number.isFinite(elapsed) || elapsed < QD_MIN_MS) return FOUL;
  return { ms:Math.min(Math.round(elapsed), QD_MAX_MS), foul:false };
}

const pageVisible = () => typeof document === "undefined" || document.visibilityState !== "hidden";
function usePageVisible() {
  const [visible, setVisible] = useState(pageVisible);
  useEffect(() => {
    const update = () => setVisible(pageVisible());
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return visible;
}
/* a negative CSS delay that puts a scene `anchor` ms in the past, fixed per
   anchor so a re-render never restarts it (the server clock's --tl) */
function useAnchor(anchor) {
  const ref = useRef({ anchor:null, tl:0 });
  if (ref.current.anchor !== anchor) ref.current = { anchor, tl:anchor ? Math.round(anchor - serverNow()) : 0 };
  return ref.current.tl;
}

/* a lamp insert: lit, flashing (pending) or spent */
const Lamp = ({ state = "off", tone = "live", className = "" }) =>
  <i className={`fd-insert fd-qd-lamp is-${tone}${state === "pending" ? " is-pending" : state === "off" ? " is-done" : ""}${
    className ? ` ${className}` : ""}`} aria-hidden="true" />;

/* the three countdown lamps, lit one by one from the scene's anchor */
function Countdown({ at, lamps }) {
  return <div className="fd-qd-count" aria-hidden="true" style={{ "--tl":`${at}ms` }}>
    {lamps.map((t, i) => <i key={i} className="fd-insert fd-qd-count-lamp" style={{ animationDelay:`calc(var(--tl) + ${t}ms)` }} />)}
  </div>;
}

/* One side of the glass: the identity chip standing on the painting's
   floor, the name lettered under it, its lamp, and what it drew. */
function Side({ state, side, me, onRight = false }) {
  const { p, lamp, reel, stamp } = side;
  return <div className={`fd-qd-side${onRight ? " is-right" : ""}${side.lost ? " is-lost" : ""}${side.won ? " is-won" : ""}`}>
    <div className="fd-qd-chip">
      {p ? <ChipFace p={p} size={CHIP} flat /> : <ChipFace size={CHIP} empty />}
      {stamp && <span className={`fd-show fd-qd-stamp${stamp === "Tie" ? " is-tie" : ""}`}
        style={side.stampAt ? { animationDelay:side.stampAt } : undefined}>{stamp}</span>}
    </div>
    <span className="fd-show fd-glass-letter fd-qd-name">{p ? (p === me ? "You" : disp(state, p)) : "Anyone"}</span>
    <span className="fd-qd-mark">
      {lamp && <Lamp state={lamp} tone={p === me ? "you" : "live"} />}
      {reel}
    </span>
  </div>;
}

/* the antes between them: each side's stack of the house's chips, the
   value under it; at the result both slide to the winner */
function Antes({ stake, left, right, slide = null, slideAt = null }) {
  const stack = in_ => in_ ? <span className="fd-qd-ante">
    <ChipStack p={null} stake={stake} size={ANTE_CHIP} chip={HOUSE_CHIP} tag={false} />
    <small>{fmt(stake)}</small>
  </span> : <span className="fd-qd-ante is-empty" aria-hidden="true"><i /></span>;
  return <div className={`fd-qd-antes${slide ? ` is-to-${slide}` : ""}`} aria-label={`${fmt(stake)} each`}
    style={slideAt ? { "--slide-at":slideAt } : undefined}>
    {stack(left)}{stack(right)}
  </div>;
}

/* Quick Draw: the offer, the stance, the draw and the result on one
   full-screen layer of glass. The two chips face off on the session's
   painting with the antes between them; lamps carry every state. Errors
   render inside this layer, above the game, never behind it. */
export function QuickDrawGame({ state, me, duel, onSubmit, onAccept, onDecline, onWithdraw, onReady, onRematch, onClose, onHold }) {
  useDuelClock(state);
  const [, wake] = useState(0);
  const visible = usePageVisible();
  const now = serverNow();
  const serverRun = duel?.runs?.[me] && !duel.runs[me].played ? duel.runs[me] : null;
  const [local, setLocal] = useState("idle"); // idle | armed | go
  const [run, setRun] = useState(() => serverRun || readCaptured(duel?.id, me));
  /* a draw made on this screen lands on its reel; one read back shows */
  const drewNow = useRef(false);
  const [save, setSave] = useState({ status:serverRun ? "saved" : "idle", error:"" });
  const [busy, setBusy] = useState(null);
  const [actionError, setActionError] = useState("");
  const captured = useRef(run);
  const inFlight = useRef(null);
  const timer = useRef(null);
  const capTimer = useRef(null);
  const frame = useRef(0);
  const flashAt = useRef(0);
  const soloAt = useRef(0);
  /* which lamps the armed glass counts: the showdown's, or a solo draw's own */
  const armMode = useRef("showdown");
  const openedAt = useRef(now);
  const duelId = duel?.id;
  const screen = duelScreen(duel, me, { now, captured:!!run });
  const fireAt = Number(duel?.fireAt) || 0;

  const submit = useCallback(reaction => {
    if (inFlight.current) return inFlight.current;
    if (!duelId || !reaction || !onSubmit) return null;
    setSave({ status:"pending", error:"" });
    inFlight.current = Promise.resolve()
      .then(() => onSubmit(duelId, reaction.ms, reaction.foul))
      .then(result => {
        if (result?.ok) { clearCaptured(duelId, me); setSave({ status:"saved", error:"" }); }
        else setSave({ status:"failed", error:result?.error || "Draw not saved." });
        return result;
      }, () => {
        setSave({ status:"failed", error:"Draw not saved." });
        return { ok:false };
      })
      .finally(() => { inFlight.current = null; });
    return inFlight.current;
  }, [duelId, me, onSubmit]);

  /* a reaction captured before a lost ack goes back up unchanged */
  useEffect(() => {
    if (captured.current && !serverRun && save.status === "idle") submit(captured.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  /* the broadcast is the acknowledgement too */
  useEffect(() => {
    if (!serverRun) return;
    clearCaptured(duelId, me);
    if (!captured.current) { captured.current = serverRun; setRun(serverRun); }
    setSave(current => current.status === "saved" ? current : { status:"saved", error:"" });
  }, [!!serverRun]); // eslint-disable-line react-hooks/exhaustive-deps

  const capture = reaction => {
    if (captured.current) return;
    clearTimeout(timer.current);
    clearTimeout(capTimer.current);
    captured.current = reaction;
    drewNow.current = true;
    storeCaptured(duelId, me, reaction);
    setRun(reaction);
    setLocal("idle");
    submit(reaction);
  };

  /* a live run holds announcement and draw ceremonies until it ends */
  const running = local === "armed" || local === "go";
  const hold = useRef(onHold);
  hold.current = onHold;
  useEffect(() => { hold.current?.(running); }, [running]);
  /* silence from armed until the reaction is captured: no sound can pass for GO */
  useEffect(() => { setQuickDrawHush(running); }, [running]);

  /* a Ready taken back when this duelist leaves before the draw is set */
  const ready = useRef(onReady);
  ready.current = onReady;
  const standing = useRef(false);
  standing.current = !!duel?.ready?.[me] && !fireAt && screen === "stance";
  useEffect(() => {
    if (!visible && standing.current) ready.current?.(duelId, false);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => {
    setQuickDrawHush(false);
    clearTimeout(timer.current);
    clearTimeout(capTimer.current);
    if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame.current);
    hold.current?.(false);
    if (standing.current) ready.current?.(duelId, false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* the showdown: both ready, so this phone arms itself and flashes at
     fireAt on the server clock; a screen that opens within DUEL_LATE_MS of
     the flash flashes at once */
  useEffect(() => {
    if (captured.current || !visible || local !== "idle") return undefined;
    if (screen !== "armed" && screen !== "go") return undefined;
    if (screen === "go") { setLocal("go"); return undefined; }
    armMode.current = "showdown";
    setLocal("armed");
    timer.current = setTimeout(() => setLocal("go"), Math.max(0, fireAt - serverNow()));
    return undefined;
  }, [screen, visible, fireAt]); // eslint-disable-line react-hooks/exhaustive-deps

  /* the stance holds until the server's window (and its grace) passes */
  const stanceEnds = screen === "stance" ? (duelReadyUntil(duel) || 0) + STANCE_GRACE_MS : 0;
  useEffect(() => {
    if (!stanceEnds) return undefined;
    const t = setTimeout(() => wake(n => n + 1), Math.max(0, stanceEnds - serverNow()) + 30);
    return () => clearTimeout(t);
  }, [stanceEnds]);
  /* the result lands while open: re-read at the moment it is due */
  const resultAt = showdownResultAt(duel);
  const resultTl = useAnchor(resultAt);
  const armTl = useAnchor(Number(duel?.armedAt) || 0);

  /* the clock starts in the frame that paints the flash; a flash nobody
     taps records the slowest time, so the room's scene always resolves */
  useIsoLayoutEffect(() => {
    if (local !== "go") return undefined;
    flashAt.current = 0;
    frame.current = requestAnimationFrame(() => {
      flashAt.current = performance.now();
      capTimer.current = setTimeout(() => capture({ ms:QD_MAX_MS, foul:false }), QD_MAX_MS + 40);
    });
    return () => cancelAnimationFrame(frame.current);
  }, [local]); // eslint-disable-line react-hooks/exhaustive-deps

  /* leaving the page mid-run cancels it: nothing sent (a missed showdown
     flash draws alone later) */
  useEffect(() => {
    if (!running || visible) return;
    clearTimeout(timer.current);
    clearTimeout(capTimer.current);
    cancelAnimationFrame(frame.current);
    flashAt.current = 0;
    setLocal("idle");
  }, [running, visible]);
  useEffect(() => {
    if (!running) return undefined;
    const abort = () => {
      clearTimeout(timer.current);
      clearTimeout(capTimer.current);
      cancelAnimationFrame(frame.current);
      flashAt.current = 0;
      setLocal("idle");
    };
    window.addEventListener("pagehide", abort);
    return () => window.removeEventListener("pagehide", abort);
  }, [running]);

  if (!duel) return null;
  const view = duelView(state, duel, me, now);
  const opp = view.other;
  const res = resolveDuel(duel);

  const armSolo = () => {
    if (local !== "idle" || captured.current || screen !== "solo") return;
    soloAt.current = serverNow();
    armMode.current = "solo";
    setLocal("armed");
    timer.current = setTimeout(() => setLocal("go"), SOLO_WAIT.min + Math.random() * SOLO_WAIT.span);
  };
  const fire = event => {
    event?.preventDefault?.();
    if (captured.current || (local !== "armed" && local !== "go")) return;
    capture(local === "go" && flashAt.current ? reactionFor(performance.now() - flashAt.current) : FOUL);
  };
  const perform = async (key, handler, after) => {
    if (busy || !handler) return undefined;
    /* accepting or sending a rematch ticks; the reaction tap never does */
    if (key === "accept" || key === "rematch") tapTick();
    setBusy(key);
    setActionError("");
    try {
      const result = await handler(key === "rematch" ? duel : duel.id);
      if (!result?.ok) setActionError(result?.error || "Not sent. Try again.");
      else after?.(result);
      return result;
    } catch {
      setActionError("Not sent. Try again.");
      return { ok:false };
    } finally { setBusy(null); }
  };

  /* the flash: the whole glass lit magenta */
  if (local === "go") return (
    <div onPointerDown={fire} role="button" aria-label="Draw" className="fd-qd-run is-go">
      <div className="fd-show fd-qd-go">Draw</div>
    </div>
  );

  /* who stands where: you on the left, them on the right */
  const left = me && (duel.from === me || duel.to === me || view.canAccept) ? me : duel.from;
  const right = left === duel.from ? duel.to || null : duel.from;
  const leftAnte = left === duel.from || view.accepted;
  const rightAnte = right === duel.from || (view.accepted && !!right);
  const mine = run || serverRun;
  const decided = res.settled && !res.push;
  const fresh = !!resultAt && openedAt.current < resultAt;
  const resultCss = `calc(${resultTl}ms + `;
  const sideOf = p => {
    const r = p === me ? mine : duel.runs?.[p];
    const shown = r && !r.played ? r : null;
    const settledRun = res.settled ? duel.runs?.[p] : null;
    let lamp = null, reel = null, stamp = null, stampAt = null;
    if (screen === "offer") lamp = p && p === duel.from ? "on" : "pending";
    else if (screen === "stance") lamp = duel.ready?.[p] ? "on" : p === me ? "off" : "pending";
    else if (screen === "armed" || local === "armed") lamp = "on";
    else if (screen === "solo") lamp = duel.runs?.[p] ? "on" : p === me ? "off" : "pending";
    else if (screen === "done" || screen === "closed") {
      if (p === me && mine) reel = mine.foul ? <b className="fd-qd-foul">Foul</b>
        : <span className="fd-qd-time is-you"><ScoreReel value={mine.ms} drum tone="you" label={`${mine.ms} ms`}
          from={drewNow.current ? 0 : null} at={120} /><small>ms</small></span>;
      else if (settledRun) reel = settledRun.foul ? <b className="fd-qd-foul">Foul</b>
        : <span className="fd-qd-time"><ScoreReel value={settledRun.ms} label={`${settledRun.ms} ms`} motion="always"
          from={fresh ? 0 : null} at={`${resultCss}${SHOWDOWN.reel + SHOWDOWN.reelGap}ms)`} /><small>ms</small></span>;
      else lamp = shown || r ? "on" : "pending";
      if (decided && res.winner === p) { stamp = "WON"; stampAt = `${resultCss}${SHOWDOWN.stamp}ms)`; }
    }
    return { p, lamp, reel, stamp, stampAt: fresh ? stampAt : null,
      won:decided && res.winner === p, lost:decided && res.loser === p };
  };
  const sides = [sideOf(left), sideOf(right)];
  if (res.push && (screen === "done" || screen === "closed")) sides[0].stamp = "Tie";
  const slide = decided ? (res.winner === left ? "left" : "right") : null;

  /* the painting: the game lettered over the two chips squared off */
  const glass = <div className="fd-qd-scene fd-glass-scene">
    <GlassArt clear />
    <h2 className="fd-show fd-glass-letter fd-qd-title">Quick Draw</h2>
    <div className="fd-qd-ring">
      <Side state={state} side={sides[0]} me={me} />
      <Antes stake={duel.stake} left={leftAnte} right={rightAnte} slide={slide}
        slideAt={slide && fresh ? `${resultCss}${SHOWDOWN.slide}ms)` : null} />
      <Side state={state} side={sides[1]} me={me} onRight />
    </div>
    {screen === "offer" && duel.consent && <Drain key="offer" from={Number(duel.ts)} total={DUEL_LAPSE_MS} />}
    {screen === "stance" && <Drain key="stance" from={Number(duel.acceptedAt)} total={DUEL_READY_MS} />}
  </div>;

  const wrap = (kids, extra = "") => (
    <div className={`fd-qd is-${screen}${extra}`} role="dialog" aria-modal="true" aria-label="Quick Draw">
      {glass}
      <div className="fd-qd-deck">
        {actionError && <p role="alert" className="fd-qd-line is-error">{actionError}</p>}
        {kids}
      </div>
    </div>
  );
  const notNow = <button type="button" onClick={onClose} disabled={!!busy} className="fd-qd-quiet">Not now</button>;
  const closeOnly = word => wrap(<>
    <p className="fd-qd-state"><Lamp state="off" className="is-void" />{word}</p>
    <ActionButton variant="secondary" onClick={onClose} style={WIDE}>Close</ActionButton>
  </>, " is-over");

  /* armed: the whole glass is the target; a tap before the flash is a foul */
  if (local === "armed") return (
    <div className="fd-qd is-armed" role="button" aria-label="Tap when it flashes" onPointerDown={fire}>
      {glass}
      <div className="fd-qd-deck">
        <Countdown at={armMode.current === "showdown" ? armTl : Math.round(soloAt.current - serverNow())}
          lamps={armMode.current === "showdown" ? SHOWDOWN.lamps : SOLO_LAMPS} />
      </div>
    </div>
  );

  if (screen === "offer") {
    if (view.sender) return wrap(<>
      <p className="fd-qd-line is-strong" role="status">{duel.open ? "Open to anyone" : `Waiting for ${view.name} to accept`}</p>
      <div className="fd-qd-actions">
        <ActionButton variant="secondary" onClick={() => perform("withdraw", onWithdraw, onClose)}
          pending={busy === "withdraw"} disabled={!onWithdraw || !!busy} style={WIDE}>
          {busy === "withdraw" ? "Withdrawing…" : "Withdraw"}</ActionButton>
      </div>
      {notNow}
    </>);
    if (view.canAccept) return wrap(<>
      <div className="fd-qd-actions">
        <ActionButton onClick={() => perform("accept", onAccept)} pending={busy === "accept"} disabled={!onAccept || !!busy}
          style={WIDE}>{busy === "accept" ? "Accepting…" : "Accept"}</ActionButton>
        {view.canDecline && <ActionButton variant="secondary" onClick={() => perform("decline", onDecline, onClose)}
          pending={busy === "decline"} disabled={!onDecline || !!busy} style={WIDE}>
          {busy === "decline" ? "Declining…" : "Decline"}</ActionButton>}
      </div>
      {notNow}
    </>);
    return closeOnly("For someone else");
  }

  if (screen === "stance") {
    const meReady = !!duel.ready?.[me];
    return wrap(<>
      {meReady
        ? <p className="fd-qd-line is-strong" role="status">Waiting for {view.name}</p>
        : <ActionButton onClick={() => perform("ready", () => onReady?.(duel.id, true))} pending={busy === "ready"}
          disabled={!onReady || !!busy} style={READY}>{busy === "ready" ? "Ready…" : "Ready"}</ActionButton>}
      {notNow}
    </>);
  }

  if (screen === "solo") return wrap(<>
    <ActionButton onClick={armSolo} style={READY}>Ready</ActionButton>
    {notNow}
  </>);

  if (screen === "closed" && !mine) {
    const word = { lapsed:"Lapsed", withdrawn:"Withdrawn", declined:"Declined", void:"Voided" }[view.phase];
    return closeOnly(word || "Not your duel");
  }

  /* done: my reaction is in; the verdict fills in once the other side
     draws. Their time stays hidden until the duel settles. */
  const canRematch = res.settled && opp && onRematch && duelsOpen(state);
  const delta = decided ? (res.winner === me ? duel.stake : -duel.stake) : 0;
  return wrap(<>
    {save.status === "failed" && <div role="alert" className="fd-qd-failed">
      <p className="fd-qd-line is-error">{save.error}</p>
      <ActionButton onClick={() => submit(captured.current)} style={WIDE}>Send this draw again</ActionButton>
    </div>}
    {save.status === "pending" && <p role="status" className="fd-qd-line">Saving your draw…</p>}
    {decided ? <div className={`fd-qd-delta ${delta > 0 ? "is-up" : "is-down"}`}
      style={fresh ? { animationDelay:`${resultCss}${SHOWDOWN.slide}ms)` } : undefined}>
      <span aria-hidden="true">{delta > 0 ? "+" : "−"}</span>
      <ScoreReel value={Math.abs(delta)} tone={delta > 0 ? "won" : null} label={`${delta > 0 ? "+" : "−"}${fmt(Math.abs(delta))}`} />
    </div>
      : res.push ? <p className="fd-qd-line is-strong">Chips back</p>
      : duel.status === "open" && save.status === "saved" && opp
        ? <p className="fd-qd-line" role="status">Waiting for {disp(state, opp)}</p> : null}
    {duel.status === "void" && <p className="fd-qd-state"><Lamp state="off" className="is-void" />Voided</p>}
    {duel.status === "declined" && <p className="fd-qd-state"><Lamp state="off" className="is-void" />Declined</p>}
    <div className="fd-qd-actions">
      {canRematch && <ActionButton onClick={() => perform("rematch", onRematch)} pending={busy === "rematch"}
        style={WIDE}>{busy === "rematch" ? "Sending…" : `Rematch for ${fmt(duel.stake)}`}</ActionButton>}
      <ActionButton variant={res.settled && !canRematch ? "primary" : "secondary"} onClick={onClose} disabled={!!busy}
        style={WIDE}>Close</ActionButton>
    </div>
  </>, decided ? (res.winner === me ? " is-won" : " is-lost") : "");
}

/* a window draining along the painting's foot: what is left of the offer
   or of the Ready window, on the server clock */
function Drain({ from, total }) {
  /* read once when it mounts, so a re-render never retimes the drain */
  const left = useRef(null);
  if (left.current === null) left.current = Math.max(0, Math.min(total, from + total - serverNow()));
  if (!from || !total) return null;
  return <i className="fd-qd-drain" aria-hidden="true"
    style={{ "--drain-left":(left.current / total).toFixed(4), "--drain-ms":`${Math.round(left.current)}ms` }} />;
}
