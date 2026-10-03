import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { DUEL_GAMES, disp, resolveDuel } from "../../../shared/core.js";
import { Avatar } from "../identity/PlayerIdentity.jsx";
import { Btn } from "../../ui/controls.jsx";
import { duelView, duelsOpen } from "./duelView.js";
import "./quickdraw.css";
import { useDuelClock } from "./useDuelClock.js";
import { tapTick } from "../../lib/haptics.js";
import { setQuickDrawHush } from "../../lib/sound.js";

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

const BIG = { fontSize:16, padding:"14px 36px" };

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

  /* a live run holds announcement and draw ceremonies until it ends */
  const running = local === "armed" || local === "go";
  const hold = useRef(onHold);
  hold.current = onHold;
  useEffect(() => { hold.current?.(running); }, [running]);
  /* silence from armed until the reaction is captured: no sound can pass for GO */
  useEffect(() => { setQuickDrawHush(running); }, [running]);
  useEffect(() => () => {
    setQuickDrawHush(false);
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

  const wrap = kids => (
    <div className="fd-qd" role="dialog" aria-modal="true" aria-label="Quick Draw">
      {actionError && <p role="alert" className="fd-qd-line is-error">{actionError}</p>}
      {kids}
    </div>
  );
  /* the label names the moment; the title is the game, lettered */
  const heading = (moment, title = "Quick Draw") => <>
    <div className="fd-qd-label">{moment}</div>
    <h2 className="fd-qd-title">{title}</h2>
  </>;
  const faceOff = <div className="fd-qd-faceoff">
    <Avatar state={state} p={me} size={62} ring />
    <span className="fd-qd-vs">vs</span>
    {opp ? <Avatar state={state} p={opp} size={62} ring />
      : <span className="fd-qd-anyone">Anyone</span>}
  </div>;
  const stakeLine = <div className="fd-qd-stake">{fmt(duel.stake)} each, winner takes {fmt(2 * duel.stake)}</div>;
  const notNow = <button type="button" onClick={onClose} disabled={!!busy} className="fd-qd-quiet">Not now</button>;
  const closeOnly = message => wrap(<>
    {heading("Duel")}
    <p className="fd-qd-line" style={{ marginBottom:24 }}>{message}</p>
    <Btn kind="ghost" onClick={onClose} style={BIG}>Close</Btn>
  </>);

  if (local === "armed") return (
    <div onPointerDown={fire} role="button" aria-label="Tap when it flashes" className="fd-qd-run is-armed">
      <div className="fd-qd-steady">Steady</div>
      <div className="fd-qd-steady-note">Tap when it flashes</div>
    </div>
  );
  if (local === "go") return (
    <div onPointerDown={fire} role="button" aria-label="Draw" className="fd-qd-run is-go">
      <div className="fd-qd-go">Draw</div>
    </div>
  );

  if (!run) {
    if (view.phase === "offered" && view.sender) return wrap(<>
      {heading("Challenge sent")}
      {faceOff}
      <p className="fd-qd-line is-strong" role="status">
        {duel.open ? "Open to anyone" : `Waiting for ${view.name} to accept`}</p>
      {stakeLine}
      <Btn kind="dark" onClick={() => perform("withdraw", onWithdraw, onClose)} pending={busy === "withdraw"}
        disabled={!onWithdraw} style={BIG}>
        {busy === "withdraw" ? "Withdrawing…" : "Withdraw"}</Btn>
      {notNow}
    </>);
    if (view.phase === "offered" && view.canAccept) return wrap(<>
      {heading(duel.open ? "Open challenge" : "Duel")}
      {faceOff}
      <p className="fd-qd-line is-strong">
        {duel.open ? `${view.name} challenged anyone` : `${view.name} challenged you`}</p>
      {stakeLine}
      <div className="fd-qd-actions">
        <Btn onClick={() => perform("accept", onAccept)} pending={busy === "accept"} disabled={!onAccept || !!busy}
          style={BIG}>{busy === "accept" ? "Accepting…" : "Accept"}</Btn>
        {view.canDecline && <Btn kind="dark" onClick={() => perform("decline", onDecline, onClose)}
          pending={busy === "decline"} disabled={!onDecline || !!busy} style={BIG}>
          {busy === "decline" ? "Declining…" : "Decline"}</Btn>}
      </div>
      {notNow}
    </>);
    if (view.canPlay) return wrap(<>
      {heading("Duel")}
      {faceOff}
      <p className="fd-qd-line is-strong">{DUEL_GAMES.quickdraw.desc}</p>
      {view.otherDrew && <p className="fd-qd-line is-drawn" style={{ marginTop:8 }}>{view.name} has drawn.</p>}
      {stakeLine}
      <Btn onClick={arm} style={{ ...BIG, padding:"14px 44px" }}>Ready</Btn>
      {notNow}
    </>);
    if (view.phase === "lapsed") return closeOnly("Lapsed");
    if (view.phase === "withdrawn") return closeOnly("Withdrawn");
    if (view.phase === "declined") return closeOnly("Declined");
    if (view.phase === "void") return closeOnly("Voided by the commissioner");
    return closeOnly(view.phase === "offered" ? "This challenge is for someone else." : "This duel is not yours to play.");
  }

  /* done: my reaction is captured; the verdict fills in once the other side
     draws. Their time stays hidden until the duel settles. */
  const decided = res.settled && !res.push;
  const oppRun = res.settled && opp ? duel.runs?.[opp] : null;
  const canRematch = res.settled && opp && onRematch && duelsOpen(state);
  return wrap(
    <>
      {save.status === "failed" && <div role="alert" style={{ marginBottom:18 }}>
        <p className="fd-qd-line is-error" style={{ margin:"0 0 10px" }}>{save.error}</p>
        <Btn onClick={() => submit(captured.current)} style={BIG}>Send this draw again</Btn>
      </div>}
      <div className="fd-qd-label">Your draw</div>
      <div className={`fd-qd-mine${run.foul ? " is-foul" : ""}`}>{run.foul ? "Foul" : `${run.ms} ms`}</div>
      {run.foul && <p className="fd-qd-line is-strong">Too early.</p>}
      {save.status === "pending" && <p role="status" className="fd-qd-line" style={{ marginTop:10 }}>Saving your draw…</p>}
      {oppRun ? <div className="fd-qd-board">
        {[[me, duel.runs?.[me] || run], [opp, oppRun]].map(([p, r2]) => (
          <div key={p} className={`fd-qd-card${decided && res.winner === p ? " is-winner" : ""}${decided && res.loser === p ? " is-loser" : ""}`}>
            <Avatar state={state} p={p} size={38} />
            <strong>{duelTime(r2)}</strong>
            <span>{disp(state, p)}</span>
          </div>
        ))}
      </div> : duel.status === "open" && save.status === "saved" && opp
        ? <p className="fd-qd-line fd-qd-wait">Waiting on {disp(state, opp)}.</p> : <div className="fd-qd-wait" />}
      {res.settled && (
        <div className={`fd-qd-verdict${res.push ? "" : res.winner === me ? " is-won" : " is-lost"}`}>
          {res.push ? "Tied. Chips returned."
            : res.winner === me ? `You win, +${fmt(duel.stake)}`
            : `${disp(state, opp)} wins`}
        </div>
      )}
      {duel.status === "void" && <p className="fd-qd-line" style={{ marginBottom:20 }}>
        Voided by the commissioner</p>}
      {duel.status === "declined" && <p className="fd-qd-line" style={{ marginBottom:20 }}>Declined</p>}
      <div className="fd-qd-actions">
        {canRematch && <Btn onClick={() => perform("rematch", onRematch)} pending={busy === "rematch"} style={BIG}>
          {busy === "rematch" ? "Sending…" : `Rematch for ${fmt(duel.stake)}`}</Btn>}
        <Btn kind={res.settled && !canRematch ? "primary" : "ghost"} onClick={onClose} disabled={!!busy}
          style={BIG}>Close</Btn>
      </div>
    </>
  );
}
