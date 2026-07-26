/* The Tournament Durable Object is the single authority for all state.
   Why this kills sync errors:
   - One instance, single-threaded: every action is applied and persisted in
     strict order. There is no last-write-wins, ever.
   - Clients never send state, only actions. The DO validates each action
     against current state (using the same shared engine the client renders
     with), applies it, persists, then broadcasts the new state to everyone.
   - WebSocket hibernation keeps connections cheap; on any reconnect the
     client immediately receives the full authoritative state. */

import { EMPTY_STATE, GM_PIN, ROSTER } from "../shared/core.js";
import { applyAction } from "./actions.js";

export class Tournament {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    ctx.blockConcurrencyWhile(async () => {
      this.state = (await ctx.storage.get("state")) || structuredClone(EMPTY_STATE);
      this.version = (await ctx.storage.get("version")) || 0;
      this.gmToken = (await ctx.storage.get("gmToken")) || null;
      this.claims = (await ctx.storage.get("claims")) || {}; // deviceId -> player
    });
  }

  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/ws") {
      if (req.headers.get("Upgrade") !== "websocket")
        return new Response("Expected websocket", { status: 426 });
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1]);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    if (url.pathname.startsWith("/api/photo/")) {
      const player = decodeURIComponent(url.pathname.split("/").pop());
      if (!ROSTER.includes(player)) return new Response("Not found", { status: 404 });
      if (req.method === "GET") {
        const dataUrl = await this.ctx.storage.get("photo:" + player);
        if (!dataUrl) return new Response("Not found", { status: 404 });
        const [, meta, b64] = dataUrl.match(/^data:(.+?);base64,(.+)$/) || [];
        if (!b64) return new Response("Bad photo", { status: 500 });
        const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        return new Response(bytes, { headers: {
          "Content-Type": meta || "image/jpeg",
          "Cache-Control": "public, max-age=31536000, immutable",
        }});
      }
      if (req.method === "POST") {
        let body;
        try { body = await req.json(); } catch { return Response.json({ ok: false, error: "Bad photo" }, { status: 400 }); }
        const { dataUrl, deviceId, gmToken } = body || {};
        const isGm = !!this.gmToken && gmToken === this.gmToken;
        if (this.claims[deviceId] !== player && !isGm)
          return Response.json({ ok: false, error: "Not your profile" }, { status: 403 });
        if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/") || dataUrl.length > 120000)
          return Response.json({ ok: false, error: "Bad photo" }, { status: 400 });
        await this.ctx.storage.put("photo:" + player, dataUrl);
        this.state.profiles[player] = { ...(this.state.profiles[player] || {}), photoV: Date.now() };
        await this.persistAndBroadcast();
        return Response.json({ ok: true });
      }
      return new Response("Method not allowed", { status: 405 });
    }

    return new Response("Not found", { status: 404 });
  }

  async webSocketMessage(ws, raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const { actionId, type, payload, deviceId, gmToken } = msg;
    const reply = obj => { try { ws.send(JSON.stringify({ type: "ack", actionId, ...obj })); } catch {} };

    if (type === "hello") {
      try { ws.send(JSON.stringify({ type: "state", version: this.version, state: this.state,
        you: this.claims[deviceId] || null })); } catch {}
      return;
    }
    if (type === "ping") { try { ws.send(JSON.stringify({ type: "pong" })); } catch {} return; }

    if (type === "gmUnlock") {
      /* a 4-digit pin needs a brake: ten misses lock the door for a minute */
      const now = Date.now();
      if (this.pinLockUntil && now < this.pinLockUntil)
        return reply({ ok: false, error: "Too many tries, wait a minute" });
      if (payload?.pin !== GM_PIN) {
        this.pinFails = (this.pinFails || 0) + 1;
        if (this.pinFails >= 10) { this.pinLockUntil = now + 60000; this.pinFails = 0; }
        return reply({ ok: false, error: "Wrong passcode" });
      }
      this.pinFails = 0;
      if (!this.gmToken) {
        this.gmToken = crypto.randomUUID();
        await this.ctx.storage.put("gmToken", this.gmToken);
      }
      return reply({ ok: true, extra: { gmToken: this.gmToken } });
    }

    if (type === "claim") {
      const player = payload?.player;
      if (!ROSTER.includes(player)) return reply({ ok: false, error: "Pick a player" });
      this.claims[deviceId] = player;
      await this.ctx.storage.put("claims", this.claims);
      return reply({ ok: true });
    }

    const isGm = !!this.gmToken && gmToken === this.gmToken;
    const result = applyAction(this.state, type, payload, { isGm, player: this.claims[deviceId] || null });
    if (!result.ok) return reply(result);
    await this.persistAndBroadcast(type);
    reply({ ...result, version: this.version });
  }

  async persistAndBroadcast(lastAction) {
    this.version += 1;
    this.state.updatedAt = Date.now();
    /* one put, both keys: state and version can never disagree in storage */
    await this.ctx.storage.put({ state: this.state, version: this.version });
    const frame = JSON.stringify({ type: "state", version: this.version, state: this.state, lastAction });
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(frame); } catch {}
    }
  }

  async webSocketClose(ws) { try { ws.close(); } catch {} }
  async webSocketError(ws) { try { ws.close(); } catch {} }
}
