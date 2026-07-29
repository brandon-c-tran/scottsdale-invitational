/* The Tournament Durable Object is the single authority for all state.
   Why this kills sync errors:
   - One instance, single-threaded: every action is applied and persisted in
     strict order. There is no last-write-wins, ever.
   - Clients never send state, only actions. The DO validates each action
     against current state (using the same shared engine the client renders
     with), applies it, persists, then broadcasts the new state to everyone.
   - WebSocket hibernation keeps connections cheap; on any reconnect the
     client immediately receives the full authoritative state. */

import {
  ALL_PLAYERS, ROSTER, isActivePlayer,
} from "../shared/core.js";
import { applyAction } from "./actions.js";
import { hydrateStoredState } from "./state.js";
import {
  INTERNAL_BACKUP_PREFIX,
  INTERNAL_RESET_BACKUP_PREFIX,
  MAX_SNAPSHOT_BYTES,
  buildSnapshot,
  isPortableStorageKey,
  nextRestoreVersion,
  snapshotSha256,
  validateSnapshot,
} from "./snapshot.js";

const tokenEncoder = new TextEncoder();
async function secureTokenEqual(provided, expected) {
  if (!provided || !expected) return false;
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", tokenEncoder.encode(provided)),
    crypto.subtle.digest("SHA-256", tokenEncoder.encode(expected)),
  ]);
  if (typeof crypto.subtle.timingSafeEqual === "function")
    return crypto.subtle.timingSafeEqual(providedHash, expectedHash);
  /* Node's Web Crypto does not yet expose the Workers timingSafeEqual
     extension, so focused Node tests use the equivalent fixed-size loop. */
  const left = new Uint8Array(providedHash);
  const right = new Uint8Array(expectedHash);
  let difference = 0;
  for (let index = 0; index < left.length; index++)
    difference |= left[index] ^ right[index];
  return difference === 0;
}

export class Tournament {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    ctx.blockConcurrencyWhile(async () => this.hydrateFromStorage());
  }

  get environment() {
    return ["local", "staging", "production"].includes(this.env.APP_ENV)
      ? this.env.APP_ENV : "production";
  }

  get capabilities() {
    const configured = ["local", "staging", "production"].includes(this.env.APP_ENV);
    const isolated = this.environment === "local" || this.environment === "staging";
    return {
      qa: configured && this.env.QA_ENABLED === "true",
      progressReset: configured && this.env.PROGRESS_RESET_ENABLED === "true",
      restore: isolated,
      snapshotExport: isolated,
    };
  }

  async hydrateFromStorage() {
    this.state = hydrateStoredState(await this.ctx.storage.get("state"));
    this.version = (await this.ctx.storage.get("version")) || 0;
    this.gmToken = (await this.ctx.storage.get("gmToken")) || null;
    this.claims = (await this.ctx.storage.get("claims")) || {}; // deviceId -> player
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

    if (url.pathname.startsWith("/api/admin/")) return this.handleAdmin(req, url);

    if (url.pathname.startsWith("/api/photo/")) {
      const player = decodeURIComponent(url.pathname.split("/").pop());
      if (!ALL_PLAYERS.includes(player)) return new Response("Not found", { status: 404 });
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
        const isGm = await secureTokenEqual(gmToken, this.gmToken);
        if ((!isActivePlayer(player) || this.claims[deviceId] !== player) && !isGm)
          return Response.json({ ok: false, error: "Not your profile" }, { status: 403 });
        if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/") || dataUrl.length > 120000)
          return Response.json({ ok: false, error: "Bad photo" }, { status: 400 });
        const nextState = structuredClone(this.state);
        nextState.profiles[player] = { ...(nextState.profiles[player] || {}), photoV: Date.now() };
        /* Persist the payload before publishing its reference. A failed state
           write can leave only an unreferenced photo, never a broken profile. */
        await this.ctx.storage.put("photo:" + player, dataUrl);
        await this.persistAndBroadcast("photo", nextState);
        return Response.json({ ok: true });
      }
      return new Response("Method not allowed", { status: 405 });
    }

    return new Response("Not found", { status: 404 });
  }

  async adminAuthorized(req) {
    const auth = req.headers.get("Authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : req.headers.get("X-Field-Day-GM-Token");
    const expected = this.environment === "production"
      ? this.env.SNAPSHOT_ADMIN_TOKEN
      : this.gmToken;
    return secureTokenEqual(token, expected);
  }

  async readBoundedJson(req) {
    const declared = Number(req.headers.get("Content-Length") || 0);
    if (declared > MAX_SNAPSHOT_BYTES) throw new Error("Snapshot exceeds the maximum size");
    const text = await req.text();
    if (new TextEncoder().encode(text).byteLength > MAX_SNAPSHOT_BYTES)
      throw new Error("Snapshot exceeds the maximum size");
    try { return JSON.parse(text); }
    catch { throw new Error("Malformed JSON"); }
  }

  async createSnapshot() {
    const entries = await this.ctx.storage.list();
    /* Fresh local objects may not have written their default state yet. The
       in-memory authority still has a complete logical value for each required
       key, so export it without mutating storage. */
    if (!entries.has("state")) entries.set("state", this.state);
    if (!entries.has("version")) entries.set("version", this.version);
    if (!entries.has("claims")) entries.set("claims", this.claims);
    return buildSnapshot(entries, {
      environment: this.environment,
      applicationVersion: this.env.APP_VERSION || "unknown",
      object: "tournament/main",
    });
  }

  async restoreValidatedSnapshot(snapshot, checked) {
    const current = await this.ctx.storage.list();
    const backupSource = new Map(current);
    if (!backupSource.has("state")) backupSource.set("state", this.state);
    if (!backupSource.has("version")) backupSource.set("version", this.version);
    if (!backupSource.has("claims")) backupSource.set("claims", this.claims);
    const backup = buildSnapshot(backupSource, {
      environment: this.environment,
      applicationVersion: this.env.APP_VERSION || "unknown",
      object: "tournament/main",
    });
    const backupKey = `${INTERNAL_BACKUP_PREFIX}${Date.now()}`;
    const backupEntries = backup.entries;
    const currentPortableKeys = [...current.keys()].filter(isPortableStorageKey);
    const restored = [...checked.entries.entries()];
    const importedVersion = checked.entries.get("version");
    const currentVersion = Number(current.get("version") || 0);
    const restoreVersion = nextRestoreVersion(currentVersion, importedVersion);

    await this.ctx.storage.transaction(async txn => {
      await txn.put(`${backupKey}:manifest`, {
        ...backup,
        entries: backupEntries.map((entry, index) => ({
          key: entry.key,
          storageKey: `${backupKey}:entry:${index}`,
        })),
      });
      for (let index = 0; index < backupEntries.length; index++)
        await txn.put(`${backupKey}:entry:${index}`, backupEntries[index].value);
      if (currentPortableKeys.length) await txn.delete(currentPortableKeys);
      for (const [key, value] of restored)
        await txn.put(key, key === "version" ? restoreVersion : value);
    });

    await this.hydrateFromStorage();
    this.broadcastState("restoreSnapshot");
    return {
      backupKey,
      restoredEntries: restored.length,
      version: restoreVersion,
      sha256: await snapshotSha256(snapshot),
    };
  }

  async loadInternalBackup(backupKey) {
    const backupPrefixes = [INTERNAL_BACKUP_PREFIX, INTERNAL_RESET_BACKUP_PREFIX];
    if (typeof backupKey !== "string"
        || !backupPrefixes.some(prefix => new RegExp(`^${prefix}\\d+$`).test(backupKey)))
      throw new Error("Invalid backup key");
    const manifest = await this.ctx.storage.get(`${backupKey}:manifest`);
    if (!manifest || !Array.isArray(manifest.entries) || manifest.entries.length > 256)
      throw new Error("Backup not found or invalid");

    const entries = [];
    for (const ref of manifest.entries) {
      if (!isPortableStorageKey(ref?.key)
          || typeof ref?.storageKey !== "string"
          || !ref.storageKey.startsWith(`${backupKey}:entry:`))
        throw new Error("Backup manifest is invalid");
      const value = await this.ctx.storage.get(ref.storageKey);
      if (value === undefined) throw new Error("Backup entry is missing");
      entries.push({ key:ref.key, value });
    }
    return { ...manifest, entries };
  }

  async handleAdmin(req, url) {
    if (!await this.adminAuthorized(req))
      return Response.json({ ok: false, error: "Commissioner authentication required" }, { status: 403 });

    if (url.pathname === "/api/admin/snapshot" && req.method === "GET") {
      const snapshot = await this.createSnapshot();
      const checked = validateSnapshot(snapshot);
      if (!checked.ok)
        return Response.json({ ok: false, error: "Stored state cannot be exported", details: checked.errors },
          { status: 500 });
      return Response.json(snapshot, { headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="field-day-${this.environment}-snapshot.json"`,
        "X-Field-Day-Environment": this.environment,
      }});
    }

    if (url.pathname === "/api/admin/snapshot/validate" && req.method === "POST") {
      let snapshot;
      try { snapshot = await this.readBoundedJson(req); }
      catch (error) {
        return Response.json({ ok: false, errors: [error.message] }, { status: 400 });
      }
      const checked = validateSnapshot(snapshot);
      const sha256 = checked.ok ? await snapshotSha256(snapshot) : null;
      return Response.json({
        ok: checked.ok,
        errors: checked.errors,
        metadata: snapshot?.metadata || null,
        stats: checked.stats,
        sha256,
        environment: this.environment,
      }, {
        status: checked.ok ? 200 : 400,
        headers: { "Cache-Control": "no-store", "X-Field-Day-Environment": this.environment },
      });
    }

    if (url.pathname === "/api/admin/restore" && req.method === "POST") {
      if (this.environment === "production")
        return Response.json({ ok: false, error: "Restore is disabled in production" }, { status: 403 });
      if (req.headers.get("X-Field-Day-Confirm") !== this.environment)
        return Response.json({ ok: false, error: `Confirm target environment: ${this.environment}` }, { status: 409 });

      let snapshot;
      try { snapshot = await this.readBoundedJson(req); }
      catch (error) {
        return Response.json({ ok: false, error: error.message }, { status: 400 });
      }
      const checked = validateSnapshot(snapshot);
      if (!checked.ok)
        return Response.json({ ok: false, error: "Snapshot validation failed", details: checked.errors },
          { status: 400 });

      const result = await this.restoreValidatedSnapshot(snapshot, checked);
      return Response.json({
        ok: true,
        environment: this.environment,
        ...result,
      }, { headers: { "Cache-Control": "no-store", "X-Field-Day-Environment": this.environment } });
    }

    if (url.pathname === "/api/admin/restore-backup" && req.method === "POST") {
      if (this.environment === "production")
        return Response.json({ ok: false, error: "Backup recovery is disabled in production" }, { status: 403 });
      if (req.headers.get("X-Field-Day-Confirm") !== this.environment)
        return Response.json({ ok: false, error: `Confirm target environment: ${this.environment}` }, { status: 409 });

      let body;
      try { body = await this.readBoundedJson(req); }
      catch (error) {
        return Response.json({ ok: false, error: error.message }, { status: 400 });
      }
      let snapshot;
      try { snapshot = await this.loadInternalBackup(body?.backupKey); }
      catch (error) {
        return Response.json({ ok: false, error: error.message }, { status: 400 });
      }
      const checked = validateSnapshot(snapshot);
      if (!checked.ok)
        return Response.json({ ok: false, error: "Backup validation failed", details: checked.errors },
          { status: 400 });
      const result = await this.restoreValidatedSnapshot(snapshot, checked);
      return Response.json({
        ok: true,
        environment: this.environment,
        recoveredFrom: body.backupKey,
        ...result,
      }, { headers: { "Cache-Control": "no-store", "X-Field-Day-Environment": this.environment } });
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
        you: isActivePlayer(this.claims[deviceId]) ? this.claims[deviceId] : null,
        environment: this.environment, capabilities: this.capabilities })); } catch {}
      return;
    }
    if (type === "ping") { try { ws.send(JSON.stringify({ type: "pong" })); } catch {} return; }

    if (type === "gmUnlock") {
      /* a 4-digit pin needs a brake: ten misses lock the door for a minute */
      const now = Date.now();
      if (this.pinLockUntil && now < this.pinLockUntil)
        return reply({ ok: false, error: "Too many tries, wait a minute" });
      const submittedPin = typeof payload?.pin === "string" ? payload.pin : "";
      if (!await secureTokenEqual(submittedPin, this.env.GM_PIN)) {
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
      const nextClaims = { ...this.claims, [deviceId]:player };
      await this.ctx.storage.put("claims", nextClaims);
      this.claims = nextClaims;
      return reply({ ok: true });
    }

    const isGm = await secureTokenEqual(gmToken, this.gmToken);
    const claimed = this.claims[deviceId];
    const nextState = structuredClone(this.state);
    const result = applyAction(nextState, type, payload, {
      isGm,
      player: isActivePlayer(claimed) ? claimed : null,
      deviceId,
      actionId,
      environment:this.environment,
      progressReset:this.capabilities.progressReset,
    });
    if (!result.ok) return reply(result);
    /* Explicit no-ops make retried result/transition actions idempotent:
       acknowledge them without incrementing the transport version or
       broadcasting a state that did not change. */
    if (result.extra?.unchanged)
      return reply({ ...result, version:this.version });
    const persisted = await this.persistAndBroadcast(type, nextState, {
      backupPrefix:type === "resetTournament" ? INTERNAL_RESET_BACKUP_PREFIX : null,
    });
    const extra = { ...(result.extra || {}), ...(persisted || {}) };
    reply({ ...result, ...(Object.keys(extra).length ? { extra } : {}), version: this.version });
  }

  async persistAndBroadcast(lastAction, nextState = this.state, { backupPrefix = null } = {}) {
    const nextVersion = this.version + 1;
    nextState.updatedAt = Date.now();
    /* Persist first, cache second. The atomic map write keeps state/version
       aligned, and a failed write cannot leak an uncommitted in-memory board. */
    let backupKey = null;
    if (backupPrefix) {
      const backup = await this.createSnapshot();
      const backupEntries = backup.entries;
      backupKey = `${backupPrefix}${Date.now()}`;
      const olderResetBackupKeys = backupPrefix === INTERNAL_RESET_BACKUP_PREFIX
        ? [...(await this.ctx.storage.list({ prefix:INTERNAL_RESET_BACKUP_PREFIX })).keys()]
        : [];
      await this.ctx.storage.transaction(async txn => {
        if (olderResetBackupKeys.length) await txn.delete(olderResetBackupKeys);
        await txn.put(`${backupKey}:manifest`, {
          ...backup,
          entries:backupEntries.map((entry, index) => ({
            key:entry.key,
            storageKey:`${backupKey}:entry:${index}`,
          })),
        });
        for (let index = 0; index < backupEntries.length; index++)
          await txn.put(`${backupKey}:entry:${index}`, backupEntries[index].value);
        await txn.put({ state:nextState, version:nextVersion });
      });
    } else {
      await this.ctx.storage.put({ state:nextState, version:nextVersion });
    }
    this.state = nextState;
    this.version = nextVersion;
    this.broadcastState(lastAction);
    return backupKey ? { backupKey } : null;
  }

  broadcastState(lastAction) {
    const frame = JSON.stringify({ type: "state", version: this.version, state: this.state, lastAction,
      environment: this.environment, capabilities: this.capabilities });
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(frame); } catch {}
    }
  }

  async webSocketClose(ws) { try { ws.close(); } catch {} }
  async webSocketError(ws) { try { ws.close(); } catch {} }
}
