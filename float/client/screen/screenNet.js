/* The screen's own connection to a real room, with the net API's shape
   (float/PROTOCOL.md "Net": { send, on, close, serverNow, rtt, status,
   onStatus }). It is used only while float/client/net.js (the controller
   builder's, which FloatScreen prefers) does not exist yet: hello on every
   open, a ping every 2 s, the clock offset as the median of the last five
   pongs, reconnects with backoff. */

const PING_MS = 2000;

function deviceId() {
  const fresh = () => `s-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
  try {
    let id = localStorage.getItem("float-device");
    if (!id) { id = fresh(); localStorage.setItem("float-device", id); }
    return id;
  } catch { return fresh(); }
}

export function connectFloat({ room, role = "screen", hello = {} } = {}) {
  const listeners = new Map();
  const statusFns = new Set();
  const device = hello.device || deviceId();
  let ws = null, status = "connecting", closed = false, retry = 0, pingTimer = null, retryTimer = null;
  let offset = 0, haveOffset = false, lastRtt = 0, seq = 0;
  const samples = [];
  const sent = new Map();

  const emit = msg => {
    const fns = listeners.get(msg.t);
    if (fns) [...fns].forEach(fn => { try { fn(msg); } catch (error) { console.error(error); } });
  };
  const setStatus = next => { if (status !== next) { status = next; statusFns.forEach(fn => fn(next)); } };
  const raw = msg => { try { if (ws?.readyState === 1) ws.send(JSON.stringify(msg)); } catch {} };
  const ping = () => {
    const c = ++seq;
    sent.set(c, performance.now());
    if (sent.size > 20) sent.delete(sent.keys().next().value);
    raw({ t:"ping", c, ...(lastRtt ? { rtt:Math.round(lastRtt) } : {}) });
  };
  const onPong = msg => {
    const at = sent.get(msg.c);
    if (at === undefined || !Number.isFinite(msg.s)) return;
    sent.delete(msg.c);
    lastRtt = performance.now() - at;
    samples.push(msg.s + lastRtt / 2 - Date.now());
    if (samples.length > 5) samples.shift();
    const sorted = samples.slice().sort((a, b) => a - b);
    offset = sorted[sorted.length >> 1];
    haveOffset = true;
  };

  const connect = () => {
    if (closed) return;
    setStatus("connecting");
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    try { ws = new WebSocket(`${proto}://${window.location.host}/float/ws?room=${encodeURIComponent(room)}`); }
    catch { scheduleRetry(); return; }
    ws.onopen = () => {
      retry = 0;
      raw({ t:"hello", role, device, ...(hello.rider ? { rider:hello.rider } : {}) });
      ping();
      clearInterval(pingTimer);
      pingTimer = setInterval(ping, PING_MS);
      setStatus("open");
    };
    ws.onmessage = event => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      if (!msg || typeof msg.t !== "string") return;
      /* until the pongs say better, the first stamp sets the clock */
      if (!haveOffset && Number.isFinite(msg.s)) { offset = msg.s - Date.now(); haveOffset = true; }
      if (msg.t === "pong") onPong(msg);
      emit(msg);
    };
    ws.onclose = () => { clearInterval(pingTimer); if (!closed) scheduleRetry(); };
    ws.onerror = () => { try { ws.close(); } catch {} };
  };
  const scheduleRetry = () => {
    setStatus("connecting");
    clearTimeout(retryTimer);
    retryTimer = setTimeout(connect, Math.min(8000, 400 * 2 ** retry++));
  };
  connect();
  const onVisible = () => { if (document.visibilityState === "visible" && ws?.readyState !== 1 && !closed) { retry = 0; connect(); } };
  document.addEventListener("visibilitychange", onVisible);

  return {
    send:raw,
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
      return () => listeners.get(type)?.delete(fn);
    },
    close() {
      closed = true;
      clearInterval(pingTimer); clearTimeout(retryTimer);
      document.removeEventListener("visibilitychange", onVisible);
      try { ws?.close(); } catch {}
      setStatus("closed");
    },
    serverNow:() => Date.now() + offset,
    rtt:() => lastRtt,
    status:() => status,
    onStatus(fn) { statusFns.add(fn); return () => statusFns.delete(fn); },
  };
}

export default connectFloat;
