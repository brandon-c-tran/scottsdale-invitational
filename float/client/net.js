/* The browser's room connection (float/PROTOCOL.md "Net"). The screen and the
   controller both use it, so it stays small and dependency-free.

   connectFloat({ room, role, hello }) opens /float/ws?room=<id> and returns
   { send(msg), on(type, fn) -> off, close(), serverNow(), rtt(), status(), onStatus(fn) -> off }
   (plus `device` and `room` for convenience).

   - hello: the extra fields of the hello frame, an object or a function that
     returns one (a function is read at every open, so a reconnect carries the
     rider's latest look). t, role and device are always ours.
   - Every open sends hello, then a ping, then reports "open", so an onStatus
     listener that re-sends its own state always lands after the hello.
   - status(): "connecting" (opening, or waiting to retry), "open", "closed"
     (only after close()).
   - send() returns false while the socket is not open. Nothing is queued: a
     stroke that waited out a reconnect would be a stroke nobody made.
   - Clock: a ping every 2 s carries the last round trip; each pong is one
     offset sample, s - (c + rtt / 2), and the offset is the median of the
     last five. Until the first pong, any frame's `s` stands in.
   - Liveness: a phone that slept can hold a socket that looks open and is
     dead. An open socket silent for 6 s, or one that stays quiet 2.5 s after
     the page comes back (visible, pageshow, online), is replaced.

   Tests pass WebSocket, storage, now, timers, random, location and the
   window/document event targets; the browser uses the globals. */

export const PING_MS = 2000;
export const QUIET_MS = 6000;
export const PROBE_MS = 2500;
export const OPEN_MS = 6000;
export const BACKOFF_MIN_MS = 300;
export const BACKOFF_MAX_MS = 5000;
export const OFFSET_SAMPLES = 5;
export const DEVICE_KEY = "float-device";

const DEVICE_ID = /^[\w-]{8,64}$/;
let memoryDevice = null;

const browserStorage = () => {
  try { return globalThis.localStorage || null; } catch { return null; }
};

const randomId = () => {
  try { if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID(); } catch {}
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`;
};

/* A stable random id for this browser, kept in localStorage `float-device`.
   Without storage (a private window that refuses it) it lasts the page. */
export function floatDeviceId(storage = browserStorage()) {
  try {
    const saved = storage?.getItem(DEVICE_KEY);
    if (saved && DEVICE_ID.test(saved)) return saved;
  } catch {}
  const id = memoryDevice || randomId();
  memoryDevice = id;
  try { storage?.setItem(DEVICE_KEY, id); } catch {}
  return id;
}

export function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function floatSocketUrl(room, location = globalThis.location) {
  const secure = location?.protocol === "https:";
  return `${secure ? "wss" : "ws"}://${location?.host || "localhost"}/float/ws?room=${encodeURIComponent(room)}`;
}

export function connectFloat({
  room = "test", role = "controller", hello = null, url = null,
  WebSocket: Socket = globalThis.WebSocket, storage = browserStorage(), now = () => Date.now(),
  timers = globalThis, random = Math.random, location = globalThis.location,
  win = typeof window === "undefined" ? null : window, doc = typeof document === "undefined" ? null : document,
} = {}) {
  const device = floatDeviceId(storage);
  const target = url || floatSocketUrl(room, location);
  const later = (fn, ms) => timers.setTimeout(fn, ms);
  const cancel = id => { if (id != null) timers.clearTimeout(id); };
  const listeners = new Map();
  const statusFns = new Set();
  let ws = null, state = "connecting", closed = false;
  let backoff = BACKOFF_MIN_MS, retryTimer = null, pingTimer = null, openTimer = null, probeTimer = null;
  let lastInbound = 0, inbound = 0, lastRtt = null, offset = 0, ponged = false;
  const samples = [];

  const setStatus = next => {
    if (next === state) return;
    state = next;
    for (const fn of [...statusFns]) { try { fn(next); } catch {} }
  };
  const emit = msg => {
    for (const key of [msg.t, "*"]) {
      const set = listeners.get(key);
      if (set) for (const fn of [...set]) { try { fn(msg); } catch {} }
    }
  };
  const write = msg => {
    try { ws.send(JSON.stringify(msg)); return true; } catch { return false; }
  };
  const helloFrame = () => {
    let extra = null;
    try { extra = typeof hello === "function" ? hello() : hello; } catch {}
    return { ...(extra && typeof extra === "object" ? extra : {}), t:"hello", role, device };
  };
  const ping = () => {
    if (!ws || ws.readyState !== 1) return;
    const msg = { t:"ping", c:now() };
    if (lastRtt !== null) msg.rtt = lastRtt;
    write(msg);
  };
  const notePong = msg => {
    const at = now();
    if (typeof msg.c !== "number" || typeof msg.s !== "number") return;
    const rtt = at - msg.c;
    if (!(rtt >= 0) || rtt > 60000) return;
    lastRtt = Math.round(rtt);
    samples.push(msg.s - (msg.c + rtt / 2));
    if (samples.length > OFFSET_SAMPLES) samples.shift();
    offset = median(samples);
    ponged = true;
  };
  const stopTimers = () => {
    if (pingTimer != null) timers.clearInterval(pingTimer);
    pingTimer = null;
    cancel(openTimer); cancel(probeTimer);
    openTimer = probeTimer = null;
  };
  /* forget a socket without letting its close handler schedule anything */
  const drop = () => {
    const dead = ws;
    ws = null;
    if (!dead) return;
    dead.onopen = dead.onmessage = dead.onclose = dead.onerror = null;
    try { dead.close(); } catch {}
  };
  const lost = () => {
    stopTimers();
    if (closed) return;
    setStatus("connecting");
    cancel(retryTimer);
    const delay = Math.round(backoff * (0.8 + 0.4 * random()));
    backoff = Math.min(backoff * 2, BACKOFF_MAX_MS);
    retryTimer = later(connect, delay);
  };
  /* a socket that looks open but has gone quiet */
  const replace = () => {
    drop();
    backoff = BACKOFF_MIN_MS;
    lost();
  };

  function connect() {
    if (closed) return;
    cancel(retryTimer);
    retryTimer = null;
    drop();
    stopTimers();
    setStatus("connecting");
    let socket;
    try { socket = new Socket(target); } catch { lost(); return; }
    ws = socket;
    openTimer = later(() => { if (ws === socket && socket.readyState === 0) replace(); }, OPEN_MS);
    socket.onopen = () => {
      if (ws !== socket) return;
      cancel(openTimer);
      openTimer = null;
      backoff = BACKOFF_MIN_MS;
      lastInbound = now();
      write(helloFrame());
      ping();
      pingTimer = timers.setInterval(() => {
        if (ws !== socket) return;
        if (now() - lastInbound > QUIET_MS) { replace(); return; }
        ping();
      }, PING_MS);
      setStatus("open");
    };
    socket.onmessage = event => {
      if (ws !== socket) return;
      lastInbound = now();
      inbound++;
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      if (!msg || typeof msg.t !== "string") return;
      if (msg.t === "pong") notePong(msg);
      else if (!ponged && typeof msg.s === "number") offset = msg.s - lastInbound;
      emit(msg);
    };
    socket.onclose = () => { if (ws === socket) { ws = null; lost(); } };
    socket.onerror = () => { try { socket.close(); } catch {} };
  }

  /* the page came back: prove the socket is alive, or replace it */
  const probe = () => {
    if (closed) return;
    if (!ws || ws.readyState > 1) { backoff = BACKOFF_MIN_MS; connect(); return; }
    if (ws.readyState === 0) return;
    const socket = ws, seen = inbound;
    ping();
    cancel(probeTimer);
    probeTimer = later(() => { if (ws === socket && inbound === seen) replace(); }, PROBE_MS);
  };
  const onVisibility = () => { if (doc?.visibilityState !== "hidden") probe(); };
  doc?.addEventListener?.("visibilitychange", onVisibility);
  win?.addEventListener?.("pageshow", probe);
  win?.addEventListener?.("online", probe);

  connect();

  return {
    device,
    room,
    send(msg) {
      if (closed || !ws || ws.readyState !== 1 || !msg || typeof msg !== "object") return false;
      return write(msg);
    },
    on(type, fn) {
      if (typeof fn !== "function") return () => {};
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
      return () => listeners.get(type)?.delete(fn);
    },
    close() {
      if (closed) return;
      closed = true;
      cancel(retryTimer);
      retryTimer = null;
      stopTimers();
      drop();
      doc?.removeEventListener?.("visibilitychange", onVisibility);
      win?.removeEventListener?.("pageshow", probe);
      win?.removeEventListener?.("online", probe);
      setStatus("closed");
    },
    serverNow: () => now() + offset,
    rtt: () => lastRtt,
    status: () => state,
    onStatus(fn) {
      if (typeof fn !== "function") return () => {};
      statusFns.add(fn);
      return () => statusFns.delete(fn);
    },
  };
}
