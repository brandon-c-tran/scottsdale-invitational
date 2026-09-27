/* Client transport. The client never writes state. It sends actions and
   renders whatever the server broadcasts. dispatch() returns a promise that
   resolves with the server's ack (ok or a rejection reason).

   Liveness: a phone that slept can hold a socket that looks open and is
   dead. Every inbound message counts as proof of life; a ping without an
   answer in 10s, or a foreground/online/pageshow probe without a state in
   2.5s, replaces the socket. `connected` is true only while the socket is
   open AND has delivered a state since it opened, so the header reads
   Reconnecting until a fresh board lands. */

import { useSyncExternalStore } from "react";
import { EMPTY_STATE } from "../../shared/core.js";
import { BUILD_ID, buildsDiffer } from "../../shared/build.js";

const localGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
const localSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const sessionGet = k => { try { return sessionStorage.getItem(k); } catch { return null; } };
const sessionSet = (k, v) => { try { sessionStorage.setItem(k, v); } catch {} };
export { localGet, localSet };

const PING_EVERY_MS = 25000;
const PONG_DEADLINE_MS = 10000;
const PROBE_DEADLINE_MS = 2500;
const OPEN_DEADLINE_MS = 8000;
const QUIET_MS = PING_EVERY_MS + PONG_DEADLINE_MS;
const ACK_TIMEOUT_MS = 6000;
const UNCERTAIN_EXPIRY_MS = 60000;
const UPDATE_AWAY_MS = 30000;
const TV_CEREMONY_WAIT_MS = 5 * 60 * 1000;

/* randomUUID exists only in a secure context, so over plain http it is
   undefined and throwing here would blank the app before React ever mounts.
   The id is an opaque key in the server's claims map, never parsed. */
const newDeviceId = () =>
  crypto.randomUUID?.() ??
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;

let deviceId = localGet("si-device");
if (!deviceId) { deviceId = newDeviceId(); localSet("si-device", deviceId); }
export const getDeviceId = () => deviceId;

let gmToken = localGet("si-gm-token") || null;
export const setGmToken = t => {
  gmToken = t; localSet("si-gm-token", t || "");
  /* the server decides each connection's view at hello: ask again */
  if (ws?.readyState === 1) sendHello();
};
export const hasGmToken = () => !!gmToken;

const isTvRoute = () => typeof window !== "undefined" && (window.location.pathname === "/tv"
  || new URLSearchParams(window.location.search).has("tv"));

const DEFAULT_CAPABILITIES = {
  qa:false,
  progressReset:false,
  restore:false,
  snapshotExport:false,
  showControl:false,
  audioDirector:false,
  audioCatalog:false,
  audioPlayback:false,
};
const snapshot = {
  state: EMPTY_STATE,
  version: 0,
  connected: false,
  /* socket open, independent of whether a state has arrived on it */
  socketOpen: false,
  /* no fresh state proves this socket is alive; header shows Reconnecting */
  stale: false,
  ready: false,
  lastAction: null,
  environment: "production",
  capabilities: { ...DEFAULT_CAPABILITIES },
  /* the roster player the server has for this device, or null */
  you: null,
  build: BUILD_ID,
  serverBuild: null,
  /* the Worker runs a newer build than this bundle */
  updateReady: false,
};
let cached = { ...snapshot };
const listeners = new Set();
const emit = () => { cached = { ...snapshot }; listeners.forEach(fn => fn()); };
export const getTournamentSnapshot = () => cached;

let ws = null, backoff = 500, pingTimer = null, pongTimer = null, reconnectTimer = null;
let probeTimer = null, openTimer = null, aid = 0, helloSeq = 0;
let lastInbound = 0, freshSinceOpen = false, lastBoot = null;
const pendingAcks = new Map();
const uncertain = new Map();

function syncConnected() {
  const next = snapshot.socketOpen && freshSinceOpen && !snapshot.stale;
  if (next !== snapshot.connected) { snapshot.connected = next; return true; }
  return false;
}
function markStale() {
  if (snapshot.stale) return;
  snapshot.stale = true; syncConnected(); emit();
}

function wsUrl() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/ws`;
}

function sendHello() {
  const nonce = ++helloSeq;
  send({ type:"hello", payload:{ view:isTvRoute() ? "tv" : "app", nonce } });
  return nonce;
}

/* Close handling shared by a real close and a socket we gave up on. Pending
   actions fail now instead of waiting out their timers; they may still have
   landed, so they come back uncertain and settle on the next fresh state. */
function socketLost() {
  clearInterval(pingTimer); clearTimeout(pongTimer); clearTimeout(probeTimer); clearTimeout(openTimer);
  snapshot.socketOpen = false; freshSinceOpen = false;
  syncConnected(); emit();
  for (const [actionId, pending] of [...pendingAcks])
    becomeUncertain(actionId, pending.sent ? "Connection lost, try again" : "Offline, try again", !pending.sent);
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(connect, backoff);
  backoff = Math.min(backoff * 2, 8000);
}

function dropSocket() {
  if (!ws) return;
  const dead = ws;
  ws = null;
  dead.onopen = dead.onmessage = dead.onclose = dead.onerror = null;
  try { dead.close(); } catch {}
}

/* Replace a socket that looks open but has gone quiet. */
function forceReconnect() {
  dropSocket();
  backoff = 500;
  markStale();
  socketLost();
}

function connect() {
  /* one socket, ever: silence the old one so its close handler cannot
     schedule a second reconnect, and never stack reconnect timers */
  if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
  clearTimeout(reconnectTimer);
  dropSocket();
  const socket = new WebSocket(wsUrl());
  ws = socket;
  clearTimeout(openTimer);
  openTimer = setTimeout(() => { if (ws === socket && socket.readyState === 0) forceReconnect(); },
    OPEN_DEADLINE_MS);
  socket.onopen = () => {
    clearTimeout(openTimer);
    backoff = 500;
    /* fresh socket, fresh baseline: if the server was ever reset, its
       version restarts and a stale high-water mark would wedge us */
    snapshot.version = 0;
    snapshot.socketOpen = true; freshSinceOpen = false;
    lastInbound = Date.now();
    syncConnected(); emit();
    sendHello();
    clearTimeout(probeTimer);
    probeTimer = setTimeout(() => { if (ws === socket && !freshSinceOpen) forceReconnect(); },
      PROBE_DEADLINE_MS * 2);
    clearInterval(pingTimer);
    pingTimer = setInterval(() => {
      if (ws !== socket) return;
      const sentAt = Date.now();
      send({ type: "ping" });
      clearTimeout(pongTimer);
      pongTimer = setTimeout(() => { if (ws === socket && lastInbound < sentAt) forceReconnect(); },
        PONG_DEADLINE_MS);
    }, PING_EVERY_MS);
  };
  socket.onmessage = e => {
    if (ws !== socket) return;
    lastInbound = Date.now();
    let msg; try { msg = JSON.parse(e.data); } catch { return; }
    if (msg.type === "state") receiveState(msg);
    else if (msg.type === "ack") receiveAck(msg);
  };
  socket.onclose = () => { if (ws === socket) { ws = null; socketLost(); } };
  socket.onerror = () => { try { socket.close(); } catch {} };
}

function receiveState(msg) {
  if (typeof msg.boot === "string") lastBoot = msg.boot;
  settleUncertain(msg);
  if (msg.version >= snapshot.version) {
    snapshot.state = msg.state; snapshot.version = msg.version;
    snapshot.ready = true; snapshot.lastAction = msg.lastAction || null;
    snapshot.environment = msg.environment || "production";
    snapshot.capabilities = msg.capabilities || { ...DEFAULT_CAPABILITIES };
    if ("you" in msg) snapshot.you = msg.you || null;
  }
  freshSinceOpen = true;
  snapshot.stale = false;
  clearTimeout(probeTimer);
  syncConnected();
  noteServerBuild(msg.build);
  emit();
}

function receiveAck(msg) {
  const p = pendingAcks.get(msg.actionId);
  if (p) {
    pendingAcks.delete(msg.actionId);
    clearTimeout(p.t);
    clearTimeout(p.retryTimer);
    p.resolve(msg);
    return;
  }
  /* an ack that arrives after we gave up still settles the uncertain result */
  const u = uncertain.get(msg.actionId);
  if (u) finishUncertain(msg.actionId, msg.ok ? { ...msg, late:true } : msg);
}

function send(obj) {
  try {
    if (ws?.readyState !== 1) return false;
    ws.send(JSON.stringify({ ...obj, deviceId, gmToken }));
    return true;
  } catch { return false; }
}

/* ── uncertain results ──
   A dispatch that timed out, or whose socket closed under it, may still have
   landed. It resolves { ok:false, uncertain:true, error, actionId, settled }:
   `error` keeps the old text for existing callers, and `settled` resolves
   with the real outcome ({ ok:true, late:true } when the next state shows
   the action applied; { ok:false, error } when a hello answered after it
   shows it did not). A UI can render "Checking…" until it settles. */
function becomeUncertain(actionId, error, certainFailure = false) {
  const pending = pendingAcks.get(actionId);
  if (!pending) return;
  pendingAcks.delete(actionId);
  clearTimeout(pending.t); clearTimeout(pending.retryTimer);
  if (certainFailure) { pending.resolve({ ok:false, error }); return; }
  let settle;
  const settled = new Promise(resolve => { settle = resolve; });
  const expiry = setTimeout(() => finishUncertain(actionId,
    { ok:false, unknown:true, error:"Couldn't confirm. Check before trying again." }), UNCERTAIN_EXPIRY_MS);
  /* the first hello sent from here on is answered after this action */
  uncertain.set(actionId, { settle, boot:pending.boot, probe:helloSeq + 1, expiry });
  pending.resolve({ ok:false, uncertain:true, error, actionId, settled });
  probe();
}

function finishUncertain(actionId, outcome) {
  const u = uncertain.get(actionId);
  if (!u) return;
  uncertain.delete(actionId);
  clearTimeout(u.expiry);
  u.settle({ ...outcome, actionId });
}

function settleUncertain(msg) {
  if (!uncertain.size) return;
  const applied = Array.isArray(msg.applied) ? msg.applied : [];
  for (const [actionId, u] of [...uncertain]) {
    if (applied.includes(actionId)) { finishUncertain(actionId, { ok:true, late:true }); continue; }
    if (typeof msg.hello !== "number" || msg.hello < u.probe) continue;
    finishUncertain(actionId, u.boot && msg.boot && u.boot !== msg.boot
      ? { ok:false, unknown:true, error:"Couldn't confirm. Check before trying again." }
      : { ok:false, error:"Not saved, try again" });
  }
}

export function dispatch(type, payload, { retry = false } = {}) {
  return new Promise(resolve => {
    if (!ws || ws.readyState !== 1) return resolve({ ok: false, error: "Offline, try again" });
    const actionId = "a" + (++aid) + "-" + Date.now();
    const message = { actionId, type, payload };
    let retryTimer = null;
    const t = setTimeout(() => becomeUncertain(actionId, "No response, try again"), ACK_TIMEOUT_MS);
    if (retry) {
      retryTimer = setTimeout(() => {
        if (pendingAcks.has(actionId)) send(message);
      }, 1800);
    }
    const pending = { resolve, t, retryTimer, boot:lastBoot, sent:false };
    pendingAcks.set(actionId, pending);
    pending.sent = send(message);
  });
}

/* Foreground, network back, or page restored: ask for a fresh state and
   replace the socket if none arrives quickly. */
function probe() {
  if (typeof window === "undefined") return;
  if (!ws || ws.readyState > 1) { clearTimeout(reconnectTimer); backoff = 500; connect(); return; }
  if (ws.readyState === 0) return;
  if (Date.now() - lastInbound > QUIET_MS) markStale();
  const socket = ws;
  const sentAt = Date.now();
  sendHello();
  clearTimeout(probeTimer);
  probeTimer = setTimeout(() => {
    if (ws === socket && lastInbound < sentAt) forceReconnect();
  }, PROBE_DEADLINE_MS);
}

/* ── new builds ──
   The Worker stamps its build on every state. A TV reloads itself once no
   ceremony is on screen (App sets window.__FD_CEREMONY__); a phone shows
   Update ready and reloads the next time it comes back to the foreground.
   Reloading never touches localStorage. A build that keeps coming back old
   (a cached bundle) stops reloading after two tries this session. */
function reloadAttempts(build) {
  const [seen, count] = (sessionGet("fd-update-reload") || "").split("|");
  return seen === build ? Number(count) || 0 : 0;
}
export function reloadForUpdate() {
  if (typeof window === "undefined") return false;
  const build = snapshot.serverBuild || "";
  sessionSet("fd-update-reload", `${build}|${reloadAttempts(build) + 1}`);
  window.location.reload();
  return true;
}
const autoReloadAllowed = () => reloadAttempts(snapshot.serverBuild || "") < 2 && pendingAcks.size === 0;

let tvReloadTimer = null, tvWaitingSince = 0;
function tvReloadWhenIdle() {
  clearTimeout(tvReloadTimer);
  if (!snapshot.updateReady || reloadAttempts(snapshot.serverBuild || "") >= 2) return;
  tvWaitingSince = tvWaitingSince || Date.now();
  const busy = pendingAcks.size > 0 || (typeof window !== "undefined" && window.__FD_CEREMONY__ === true);
  if (busy && Date.now() - tvWaitingSince < TV_CEREMONY_WAIT_MS) {
    tvReloadTimer = setTimeout(tvReloadWhenIdle, 5000);
    return;
  }
  reloadForUpdate();
}

function noteServerBuild(build) {
  if (typeof build !== "string") return;
  snapshot.serverBuild = build;
  /* two reloads that still come back old cannot be fixed by a third: stop asking */
  const differs = buildsDiffer(BUILD_ID, build) && reloadAttempts(build) < 2;
  if (differs === snapshot.updateReady) return;
  snapshot.updateReady = differs;
  if (differs && isTvRoute()) tvReloadWhenIdle();
}

export function useTournament() {
  return useSyncExternalStore(
    cb => { listeners.add(cb); return () => listeners.delete(cb); },
    () => cached,
    () => cached,
  );
}

if (typeof window !== "undefined") {
  connect();
  let hiddenAt = null;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    const away = hiddenAt ? Date.now() - hiddenAt : 0;
    hiddenAt = null;
    if (snapshot.updateReady && away >= UPDATE_AWAY_MS && autoReloadAllowed() && reloadForUpdate()) return;
    probe();
  });
  window.addEventListener("pageshow", () => probe());
  window.addEventListener("online", () => probe());
  window.addEventListener("offline", () => markStale());
}

export async function uploadPhoto(player, dataUrl) {
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 20000);
  try {
    const r = await fetch(`/api/photo/${encodeURIComponent(player)}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataUrl, deviceId, gmToken }),
      signal: controller.signal,
    });
    return await r.json();
  } catch {
    return { ok: false, error: controller.signal.aborted
      ? "Photo upload timed out. Try again." : "Upload failed" };
  } finally {
    clearTimeout(deadline);
  }
}

/* Crash reports for `wrangler tail`. Best effort, never throws. */
export function reportClientError(report) {
  try {
    const body = JSON.stringify({ ...report, build:BUILD_ID,
      path:typeof window !== "undefined" ? window.location.pathname : "", tv:isTvRoute() });
    return fetch("/api/client-error", { method:"POST", keepalive:true,
      headers:{ "Content-Type":"application/json" }, body }).catch(() => null);
  } catch { return Promise.resolve(null); }
}

/* A stuck audio request frees the cue chip after eight seconds. */
const SPOTIFY_CLIENT_TIMEOUT_MS = 8000;
async function spotifyRequest(path, { method = "GET", body, gm = false } = {}) {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const deadline = controller ? setTimeout(() => controller.abort(), SPOTIFY_CLIENT_TIMEOUT_MS) : null;
  try {
    const response = await fetch(`/api/spotify/${path}`, {
      ...(controller ? { signal:controller.signal } : {}),
      method,
      headers:{
        ...(body ? { "Content-Type":"application/json" } : {}),
        "X-Field-Day-Device":deviceId,
        ...(gm ? { Authorization:`Bearer ${gmToken || ""}` } : {}),
      },
      ...(body ? { body:JSON.stringify(body) } : {}),
    });
    const result = await response.json().catch(() => ({}));
    return response.ok
      ? result
      : { ...result, ok:false, error:result.error || "Spotify request failed" };
  } catch {
    return { ok:false, error:controller?.signal.aborted
      ? "Spotify did not answer. Try again" : "Spotify is unavailable" };
  } finally {
    clearTimeout(deadline);
  }
}

export const spotifyStatus = () => spotifyRequest("status", { gm:true });
export const spotifyPlayer = () => spotifyRequest("player", { gm:true });
export const spotifySearch = query =>
  spotifyRequest(`search?q=${encodeURIComponent(query)}`, { gm:true });
export const spotifyAuthorize = () =>
  spotifyRequest("authorize", { method:"POST", gm:true });
export const spotifyDisconnect = () =>
  spotifyRequest("disconnect", { method:"POST", gm:true });
export const spotifyPlay = ({ uri = null, deviceId:targetDevice = "", positionMs = 0 } = {}) =>
  spotifyRequest("play", {
    method:"POST",
    gm:true,
    body:{ uri, deviceId:targetDevice, positionMs },
  });
export const spotifyDevice = ({ deviceId:targetDevice = "", name = "" } = {}) =>
  spotifyRequest("device", { method:"POST", gm:true, body:{ deviceId:targetDevice, name } });
export const spotifyPause =({ deviceId:targetDevice = "" } = {}) =>
  spotifyRequest("pause", {
    method:"POST",
    gm:true,
    body:{ deviceId:targetDevice },
  });

export async function downloadSnapshot() {
  try {
    const response = await fetch("/api/admin/snapshot", {
      headers: { Authorization: `Bearer ${gmToken || ""}` },
    });
    const snapshotBody = await response.json();
    if (!response.ok) return { ok: false, error: snapshotBody.error || "Export failed" };
    const stamp = new Date(snapshotBody.metadata.exportedAt).toISOString().replace(/[:.]/g, "-");
    const blob = new Blob([`${JSON.stringify(snapshotBody, null, 2)}\n`], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `field-day-${snapshotBody.metadata.environment}-${stamp}.fieldday-snapshot.json`;
    link.click();
    URL.revokeObjectURL(href);
    return { ok: true, metadata: snapshotBody.metadata };
  } catch {
    return { ok: false, error: "Export failed" };
  }
}
