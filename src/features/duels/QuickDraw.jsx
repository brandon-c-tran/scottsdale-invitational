import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { DUEL_GAMES, disp, resolveDuel } from "../../../shared/core.js";
import { Avatar } from "../identity/PlayerIdentity.jsx";
import { Btn } from "../../ui/controls.jsx";
import { BONE, CARD_BG, DISPLAY, SANS, label } from "../../ui/theme.js";
import { duelView, duelsOpen } from "./duelView.js";
import { useDuelClock } from "./useDuelClock.js";

const fmt = n => (n ?? 0).toLocaleString("en-US");
const duelTime = r => (r.foul ? "foul" : `${r.ms}ms`);
/* the server accepts 80 to 5,000 ms. Faster than 80 cannot be a reaction to
   the flash, so it is a foul; slower records as the slowest time. */
export const QD_MIN_MS = 80;
export const QD_MAX_MS = 5000;
const FOUL = Object.freeze({ ms:null, foul:true });
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

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

const lineStyle = { fontFamily:SANS, fontSize:14, lineHeight:1.6, color:"var(--night-text)", textAlign:"center", maxWidth:340 };
const quiet = { marginTop:14, minHeight:44, padding:"0 16px", background:"none", border:"none",
  color:"var(--night-text2)", fontFamily:SANS, fontSize:12.5, cursor:"pointer" };

/* Quick Draw: the offer, the run, and the result on one full-screen layer.
   Errors render inside this layer, above the game, never behind it. */
export function QuickDrawGame({ state, me, duel, onSubmit, onAccept, onDecline, onWithdraw, onRematch, onClose, onHold }) {
  const now = useDuelClock(state);
  const serverRun = duel?.runs?.[me] && !duel.runs[me].played ? duel.runs[me] : null;
  const [local, setLocal] = useState("intro"); // intro | armed | go
  const [run, setRun] = useState(() => serverRun || readCaptured(duel?.id, me));
  const [save, setSave] = useState({ status:serverRun ? "saved" : "idle", error:"" });
  const [busy, setBusy] = useState(null);
  const [actionError, setActionError] = useState("");
  const captured = useRef(run);
  const inFlight = useRef(null);
  const timer = useRef(null);
  const frame = useRef(0);
  const flashAt = useRef(0);
  const duelId = duel?.id;

  const submit = useCallback(reaction => {
    if (inFlight.current) return inFlight.current;
    if (!duelId || !reaction || !onSubmit) return null;
    setSave({ status:"pending", error:"" });
    inFlight.current = Promise.resolve()
      .then(() => onSubmit(duelId, reaction.ms, reaction.foul))
      .then(result => {
        if (result?.ok) { clearCaptured(duelId, me); setSave({ status:"saved", error:"" }); }
        else setSave({ status:"failed", error:result?.error || "Your draw didn't save." });
        return result;
      }, () => {
        setSave({ status:"failed", error:"Your draw didn't save." });
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

  /* a live run holds announcement and draw ceremonies until it ends */
  const running = local === "armed" || local === "go";
  const hold = useRef(onHold);
  hold.current = onHold;
  useEffect(() => { hold.current?.(running); }, [running]);
  useEffect(() => () => {
    clearTimeout(timer.current);
    if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame.current);
    hold.current?.(false);
  }, []);

  /* the clock starts in the frame that paints the flash */
  useIsoLayoutEffect(() => {
    if (local !== "go") return undefined;
    flashAt.current = 0;
    frame.current = requestAnimationFrame(() => { flashAt.current = performance.now(); });
    return () => cancelAnimationFrame(frame.current);
  }, [local]);

  /* leaving the page mid-run cancels it: back to the intro, nothing sent */
  useEffect(() => {
    if (!running) return undefined;
    const abort = () => {
      clearTimeout(timer.current);
      cancelAnimationFrame(frame.current);
      flashAt.current = 0;
      setLocal("intro");
    };
    const onVisibility = () => { if (document.visibilityState === "hidden") abort(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", abort);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", abort);
    };
  }, [running]);

  if (!duel) return null;
  const view = duelView(state, duel, me, now);
  const opp = view.other;
  const res = resolveDuel(duel);

  const arm = () => {
    if (local !== "intro" || captured.current || !view.canPlay) return;
    setLocal("armed");
    timer.current = setTimeout(() => setLocal("go"), 1500 + Math.random() * 2500);
  };
  const fire = event => {
    event?.preventDefault?.();
    if (captured.current || (local !== "armed" && local !== "go")) return;
    clearTimeout(timer.current);
    const reaction = local === "go" && flashAt.current
      ? reactionFor(performance.now() - flashAt.current) : FOUL;
    captured.current = reaction;
    storeCaptured(duel.id, me, reaction);
    setRun(reaction);
    setLocal("intro");
    submit(reaction);
  };
  const perform = async (key, handler, after) => {
    if (busy || !handler) return undefined;
    setBusy(key);
    setActionError("");
    try {
      const result = await handler(key === "rematch" ? duel : duel.id);
      if (!result?.ok) setActionError(result?.error || "That didn't go through. Try again.");
      else after?.(result);
      return result;
    } catch {
      setActionError("That didn't go through. Try again.");
      return { ok:false };
    } finally { setBusy(null); }
  };

  const wrap = kids => (
    <div className="fd-night" role="dialog" aria-modal="true" aria-label="Quick Draw"
      style={{ position:"fixed", inset:0, zIndex:300, background:"var(--night-deep)",
        display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", overflowY:"auto",
        padding:"calc(30px + env(safe-area-inset-top)) 24px calc(30px + env(safe-area-inset-bottom))" }}>
      {actionError && <p role="alert" style={{ ...lineStyle, color:"var(--live2)", fontWeight:600, margin:"0 0 16px" }}>{actionError}</p>}
      {kids}
    </div>
  );
  const heading = (eyebrow, title = "Quick Draw") => <>
    <div style={{ ...label, fontSize:11, color:"var(--sun)" }}>{eyebrow}</div>
    <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:44, color:BONE, textTransform:"uppercase",
      lineHeight:0.95, margin:"6px 0 22px" }}>{title}</div>
  </>;
  const faceOff = <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:22 }}>
    <Avatar state={state} p={me} size={62} ring />
    <span style={{ fontFamily:DISPLAY, fontWeight:700, fontStyle:"italic", fontSize:24, color:"var(--sun)" }}>VS</span>
    {opp ? <Avatar state={state} p={opp} size={62} ring />
      : <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:22, color:"var(--night-text)", textTransform:"uppercase" }}>Anyone</span>}
  </div>;
  const stakeLine = <div style={{ fontFamily:SANS, fontSize:12.5, color:"var(--night-text2)", marginBottom:26 }}>
    {fmt(duel.stake)} each, winner takes the pot</div>;
  const notNow = <button type="button" onClick={onClose} disabled={!!busy} style={quiet}>Not now</button>;
  const closeOnly = message => wrap(<>
    {heading("Duel")}
    <p style={{ ...lineStyle, marginBottom:24 }}>{message}</p>
    <Btn kind="ghost" onClick={onClose} style={{ fontSize:16, padding:"13px 34px" }}>Close</Btn>
  </>);

  if (local === "armed") return (
    <div onPointerDown={fire} role="button" aria-label="Tap when it flashes"
      style={{ position:"fixed", inset:0, zIndex:300, background:"var(--night-deep)",
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", touchAction:"none" }}>
      <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:44, letterSpacing:"0.12em",
        textTransform:"uppercase", color:"var(--night-text2)", animation:"si-pulse 2.2s infinite" }}>Steady</div>
      <div style={{ fontFamily:SANS, fontSize:14, color:"var(--night-text2)", marginTop:10 }}>tap when it flashes</div>
    </div>
  );
  if (local === "go") return (
    <div onPointerDown={fire} role="button" aria-label="Draw"
      style={{ position:"fixed", inset:0, zIndex:300, background:"var(--sun)",
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", touchAction:"none" }}>
      <div style={{ fontFamily:DISPLAY, fontWeight:700, fontStyle:"italic", fontSize:96,
        letterSpacing:"0.04em", textTransform:"uppercase", color:"var(--ink0)" }}>Draw</div>
    </div>
  );

  if (!run) {
    if (view.phase === "offered" && view.sender) return wrap(<>
      {heading("Challenge sent")}
      {faceOff}
      <p style={{ ...lineStyle, marginBottom:8 }} role="status">
        {duel.open ? "Open to anyone" : `Waiting for ${view.name} to accept`} · {view.minutesLeft} min</p>
      {stakeLine}
      <Btn kind="dark" onClick={() => perform("withdraw", onWithdraw, onClose)} pending={busy === "withdraw"}
        disabled={!onWithdraw} style={{ fontSize:15, padding:"13px 30px" }}>
        {busy === "withdraw" ? "Withdrawing…" : "Withdraw"}</Btn>
      {notNow}
    </>);
    if (view.phase === "offered" && view.canAccept) return wrap(<>
      {heading(duel.open ? "Open challenge" : "Duel")}
      {faceOff}
      <p style={{ ...lineStyle, marginBottom:8 }}>
        {duel.open ? `${view.name} will take anyone` : `${view.name} challenged you`} · {view.minutesLeft} min</p>
      <div style={{ ...lineStyle, fontSize:13, color:"var(--night-text2)", marginBottom:8 }}>{DUEL_GAMES.quickdraw.desc}</div>
      {stakeLine}
      <div style={{ display:"flex", gap:10, flexWrap:"wrap", justifyContent:"center" }}>
        <Btn onClick={() => perform("accept", onAccept)} pending={busy === "accept"} disabled={!onAccept || !!busy}
          style={{ fontSize:16, padding:"14px 36px" }}>{busy === "accept" ? "Accepting…" : "Accept"}</Btn>
        {view.canDecline && <Btn kind="dark" onClick={() => perform("decline", onDecline, onClose)}
          pending={busy === "decline"} disabled={!onDecline || !!busy} style={{ fontSize:15, padding:"13px 26px" }}>
          {busy === "decline" ? "Declining…" : "Decline"}</Btn>}
      </div>
      {notNow}
    </>);
    if (view.canPlay) return wrap(<>
      {heading("Duel")}
      {faceOff}
      <div style={{ ...lineStyle, fontSize:16, marginBottom:8 }}>{DUEL_GAMES.quickdraw.desc}</div>
      {view.otherDrew && <div style={{ ...lineStyle, color:"var(--sun)", fontWeight:600, marginBottom:8 }}>
        {view.name} has drawn.</div>}
      {stakeLine}
      <Btn onClick={arm} style={{ fontSize:16, padding:"14px 40px" }}>Ready</Btn>
      {notNow}
    </>);
    if (view.phase === "lapsed") return closeOnly("This challenge lapsed. No chips move.");
    if (view.phase === "withdrawn") return closeOnly("Withdrawn. No chips move.");
    if (view.phase === "declined") return closeOnly("Declined. No chips move.");
    if (view.phase === "void") return closeOnly("Voided by the commissioner. No chips move.");
    return closeOnly(view.phase === "offered" ? "This challenge is waiting for someone else." : "This duel is not yours to play.");
  }

  /* done: my reaction is captured; the verdict fills in once the other side
     draws. Their time stays hidden until the duel settles. */
  const decided = res.settled && !res.push;
  const oppRun = res.settled && opp ? duel.runs?.[opp] : null;
  const canRematch = res.settled && opp && onRematch && duelsOpen(state);
  return wrap(
    <>
      {save.status === "failed" && <div role="alert" style={{ ...lineStyle, marginBottom:18 }}>
        <p style={{ margin:"0 0 10px", color:"var(--live2)", fontWeight:600 }}>{save.error}</p>
        <Btn onClick={() => submit(captured.current)} style={{ fontSize:15, padding:"12px 28px" }}>
          Send this draw again</Btn>
      </div>}
      <div style={{ ...label, fontSize:11, color:"var(--sun)" }}>Your draw</div>
      <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize: run.foul ? 56 : 76, color: run.foul ? "var(--live2)" : BONE,
        textTransform:"uppercase", lineHeight:1, margin:"8px 0 4px", animation:"si-flag .5s both" }}>
        {run.foul ? "Foul" : `${run.ms} ms`}</div>
      {run.foul && <div style={{ fontFamily:SANS, fontSize:14, color:"var(--night-text)" }}>Too early. That is a foul.</div>}
      {save.status === "pending" && <div role="status" style={{ ...lineStyle, color:"var(--night-text2)", marginTop:10 }}>
        Saving your draw…</div>}
      <div style={{ margin:"26px 0", width:"100%", maxWidth:360 }}>
        {oppRun ? (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            {[[me, duel.runs?.[me] || run], [opp, oppRun]].map(([p, r2]) => (
              <div key={p} style={{ background:CARD_BG, borderRadius:14, padding:"12px 10px", textAlign:"center",
                border: decided && res.winner === p ? "2px solid var(--sun)" : "1px solid var(--line)",
                opacity: decided && res.loser === p ? 0.65 : 1, animation:"si-flag .5s both" }}>
                <div style={{ display:"flex", justifyContent:"center", marginBottom:7 }}>
                  <Avatar state={state} p={p} size={38} /></div>
                <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:24, color:"var(--ink)" }}>
                  {duelTime(r2)}</div>
                <div style={{ fontFamily:SANS, fontWeight:600, fontSize:12.5, color:"var(--muted2)" }}>
                  {disp(state, p)}</div>
              </div>
            ))}
          </div>
        ) : duel.status === "open" && save.status === "saved" && opp ? (
          <div style={lineStyle}>Waiting on {disp(state, opp)}.<br/>It settles when they play.</div>
        ) : null}
      </div>
      {res.settled && (
        <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:32, textTransform:"uppercase",
          color: res.push ? "var(--night-text)" : res.winner === me ? "var(--sun)" : "var(--live2)",
          marginBottom:22, animation:"si-flag .5s .15s both" }}>
          {res.push ? "Tied. Chips returned."
            : res.winner === me ? `You win, +${fmt(duel.stake)}`
            : `${disp(state, opp)} wins`}
        </div>
      )}
      {duel.status === "void" && <div style={{ ...lineStyle, marginBottom:20 }}>
        Voided by the commissioner. No chips move.</div>}
      {duel.status === "declined" && <div style={{ ...lineStyle, marginBottom:20 }}>Declined. No chips move.</div>}
      <div style={{ display:"flex", gap:10, flexWrap:"wrap", justifyContent:"center" }}>
        {canRematch && <Btn onClick={() => perform("rematch", onRematch)} pending={busy === "rematch"}
          style={{ fontSize:16, padding:"13px 30px" }}>
          {busy === "rematch" ? "Sending…" : `Rematch · ${fmt(duel.stake)}`}</Btn>}
        <Btn kind={res.settled && !canRematch ? "primary" : "ghost"} onClick={onClose} disabled={!!busy}
          style={{ fontSize:16, padding:"13px 34px" }}>Close</Btn>
      </div>
    </>
  );
}
