/* Client transport. The client never writes state. It sends actions and
   renders whatever the server broadcasts. dispatch() returns a promise that
   resolves with the server's ack (ok or a rejection reason). */

import { useSyncExternalStore } from "react";
import { EMPTY_STATE } from "../../shared/core.js";

const localGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
const localSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
export { localGet, localSet };

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
export const setGmToken = t => { gmToken = t; localSet("si-gm-token", t || ""); };
export const hasGmToken = () => !!gmToken;

const snapshot = { state: EMPTY_STATE, version: 0, connected: false, ready: false, lastAction: null };
let cached = { ...snapshot };
const listeners = new Set();
const emit = () => { cached = { ...snapshot }; listeners.forEach(fn => fn()); };

let ws = null, backoff = 500, pingTimer = null, reconnectTimer = null, aid = 0;
const pendingAcks = new Map();

function wsUrl() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/ws`;
}

function connect() {
  /* one socket, ever: silence the old one so its close handler cannot
     schedule a second reconnect, and never stack reconnect timers */
  if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
  clearTimeout(reconnectTimer);
  if (ws) { ws.onclose = null; ws.onerror = null; try { ws.close(); } catch {} }
  ws = new WebSocket(wsUrl());
  ws.onopen = () => {
    backoff = 500;
    /* fresh socket, fresh baseline: if the server was ever reset, its
       version restarts and a stale high-water mark would wedge us */
    snapshot.version = 0;
    snapshot.connected = true; emit();
    send({ type: "hello" });
    clearInterval(pingTimer);
    pingTimer = setInterval(() => send({ type: "ping" }), 25000);
  };
  ws.onmessage = e => {
    let msg; try { msg = JSON.parse(e.data); } catch { return; }
    if (msg.type === "state") {
      if (msg.version >= snapshot.version) {
        snapshot.state = msg.state; snapshot.version = msg.version;
        snapshot.ready = true; snapshot.lastAction = msg.lastAction || null;
        emit();
      }
    } else if (msg.type === "ack") {
      const p = pendingAcks.get(msg.actionId);
      if (p) { pendingAcks.delete(msg.actionId); clearTimeout(p.t); p.resolve(msg); }
    }
  };
  ws.onclose = () => {
    snapshot.connected = false; emit();
    clearInterval(pingTimer);
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, backoff);
    backoff = Math.min(backoff * 2, 8000);
  };
  ws.onerror = () => { try { ws.close(); } catch {} };
}

function send(obj) {
  try { ws?.readyState === 1 && ws.send(JSON.stringify({ ...obj, deviceId, gmToken })); } catch {}
}

export function dispatch(type, payload) {
  return new Promise(resolve => {
    if (!ws || ws.readyState !== 1) return resolve({ ok: false, error: "Offline, try again" });
    const actionId = "a" + (++aid) + "-" + Date.now();
    const t = setTimeout(() => {
      pendingAcks.delete(actionId);
      resolve({ ok: false, error: "No response, try again" });
    }, 6000);
    pendingAcks.set(actionId, { resolve, t });
    send({ actionId, type, payload });
  });
}

export async function uploadPhoto(player, dataUrl) {
  try {
    const r = await fetch(`/api/photo/${encodeURIComponent(player)}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataUrl, deviceId, gmToken }),
    });
    return await r.json();
  } catch { return { ok: false, error: "Upload failed" }; }
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
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && (!ws || ws.readyState > 1)) connect();
  });
}
