import {
  PT, disp, duelAccepted, duelBetween, duelLapsesAt, duelMode, duelOpen, duelPhase, pokerLive, resolveDuel, stacksPosted,
} from "../../../shared/core.js";

import { serverNow } from "../tv/serverClock.js";

const fmt = n => (n ?? 0).toLocaleString("en-US");

/* Duels can be sent and answered only while the weekend board is moving. */
export const duelsOpen = state => !!(state?.live && !state.frozen
  && !(state.poker && !state.results?.[state.poker.id]) && !pokerLive(state) && !stacksPosted(state));

export const minutesLeft = (duel, now = serverNow()) => {
  const at = duelLapsesAt(duel);
  return at === null ? null : Math.max(1, Math.ceil((at - now) / 60000));
};

/* One viewer-relative reading of a duel, shared by Home, the player card,
   and the Quick Draw overlay, so every surface offers the same actions. */
export function duelView(state, duel, me, now = serverNow()) {
  const phase = duelPhase(duel, now);
  const sender = !!me && duel.from === me;
  const recipient = !!me && !!duel.to && duel.to === me;
  const other = sender ? duel.to || null : duel.from;
  const name = other ? disp(state, other) : "Anyone";
  const myRun = me ? duel.runs?.[me] || null : null;
  const otherDrew = !!(other && duel.runs?.[other]);
  const offer = phase === "offered";
  const live = phase === "live";
  const takeable = offer && !!duel.open && !!me && !sender && !duelBetween(state, duel.from, me, now);
  const canAccept = offer && (recipient || takeable);
  const canDecline = (offer && recipient) || (live && recipient && !myRun);
  const canWithdraw = offer && sender;
  const canPlay = live && (sender || recipient) && !myRun;
  const left = offer ? minutesLeft(duel, now) : null;
  let status = "";
  if (offer) status = sender
    ? duel.open ? "Open to anyone" : `Waiting for ${name} to accept`
    : duel.open ? "Open challenge" : "Challenged you";
  /* the showdown: who has tapped Ready, and whether the draw is set */
  const mode = live ? duelMode(duel, now) : null;
  const meReady = !!me && !!duel.ready?.[me], otherReady = !!other && !!duel.ready?.[other];
  if (live) status = myRun ? `Waiting for ${name} to draw`
    : mode === "showdown" ? "Draw"
      : mode === "stance" ? meReady ? `Waiting for ${name}` : otherReady ? `${name} is ready` : "Your turn"
        : !duel.consent && recipient && !Object.keys(duel.runs || {}).length ? "Challenged you"
          : otherDrew ? `${name} has drawn` : "Your turn";
  /* the declines the server allows: not once the showdown's draw is set */
  const declinable = canDecline && mode !== "showdown";
  return { phase, sender, recipient, other, name, myRun, otherDrew, takeable,
    canAccept, canDecline:declinable, canWithdraw, canPlay, minutesLeft:left, status, mode, meReady, otherReady,
    accepted:duelAccepted(duel), involved:sender || recipient };
}

/* The duels a player should see on Home: their own offered or live duels and
   open challenges they could take. */
export function duelsForPlayer(state, me, now = serverNow()) {
  if (!me) return [];
  return (state?.duels || []).filter(duel => {
    if (!duelOpen(duel, now)) return false;
    if (duel.from === me || duel.to === me) return true;
    return duelView(state, duel, me, now).takeable;
  });
}

/* Home's "your turn": a duel you can accept or play right now. A lapsed
   offer is no longer open, so it never keeps the dot lit. */
export const hasDuelTurn = (state, me, now = serverNow()) => !!me && duelsOpen(state)
  && (state?.duels || []).some(duel => {
    if (!duelOpen(duel, now)) return false;
    const view = duelView(state, duel, me, now);
    return view.canAccept || view.canPlay;
  });

/* A finished duel as a line on a player card, from `viewer`'s side. */
export function duelResult(state, duel, viewer) {
  const phase = duelPhase(duel);
  if (!duel.to || !duelAccepted(duel)) return null;
  if (phase !== "settled" && phase !== "void") return null;
  const other = duel.from === viewer ? duel.to : duel.from;
  const r = resolveDuel(duel);
  const time = run => !run ? "no draw" : run.foul ? "foul" : Number.isFinite(run.ms) ? `${run.ms} ms` : "drew";
  /* times appear only once a duel settles; a voided one keeps them hidden */
  const times = phase === "settled" ? `${time(duel.runs?.[viewer])} vs ${time(duel.runs?.[other])}` : "";
  const outcome = phase === "void" ? "void" : r.push ? "push" : r.winner === viewer ? "won" : "lost";
  const delta = outcome === "won" ? duel.stake : outcome === "lost" ? -duel.stake : 0;
  return { id:duel.id, other, name:disp(state, other), stake:duel.stake, times, outcome, delta, ts:duel.ts };
}

/* head to head between the viewer and one other player, newest first */
export function duelRecord(state, viewer, other) {
  const lines = (state?.duels || [])
    .filter(duel => (duel.from === viewer && duel.to === other) || (duel.from === other && duel.to === viewer))
    .map(duel => duelResult(state, duel, viewer)).filter(Boolean)
    .sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const won = lines.filter(line => line.outcome === "won").length;
  const lost = lines.filter(line => line.outcome === "lost").length;
  const net = lines.reduce((sum, line) => sum + line.delta, 0);
  return { lines, won, lost, net };
}

export const signedChips = n => `${n > 0 ? "+" : n < 0 ? "-" : ""}${fmt(Math.abs(n))}`;
export const ANTES = [PT, 2 * PT, 5 * PT, 10 * PT];
