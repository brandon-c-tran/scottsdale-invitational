/* FloatRoom: one Durable Object per Float room (float/PROTOCOL.md). This is
   the skeleton the first build fills in: it accepts sockets and answers
   hello and ping, so the pages can connect end to end. */
import { ROLES } from "../shared/protocol.js";

export class FloatRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.sockets = new Set();
  }

  async fetch(req) {
    if (req.headers.get("Upgrade") !== "websocket") return new Response("Expected a WebSocket", { status:426 });
    const pair = new WebSocketPair();
    const ws = pair[1];
    ws.accept();
    this.sockets.add(ws);
    ws.addEventListener("message", event => this.onMessage(ws, event.data));
    ws.addEventListener("close", () => this.sockets.delete(ws));
    ws.addEventListener("error", () => this.sockets.delete(ws));
    return new Response(null, { status:101, webSocket:pair[0] });
  }

  send(ws, message) {
    try { ws.send(JSON.stringify({ ...message, s:Date.now() })); } catch {}
  }

  onMessage(ws, data) {
    let message;
    try { message = JSON.parse(data); } catch { return; }
    if (message?.t === "hello" && ROLES.includes(message.role))
      this.send(ws, { t:"welcome", you:{ device:String(message.device || ""), role:message.role } });
    else if (message?.t === "ping") this.send(ws, { t:"pong", c:message.c });
  }
}
