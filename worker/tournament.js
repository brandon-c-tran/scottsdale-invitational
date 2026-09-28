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
import { checkInComplete } from "../shared/checkin.js";
import { BUILD_ID } from "../shared/build.js";
import { applyAction } from "./actions.js";
import { createStateSerializer } from "./publicState.js";
import { WAGER_OPS_KEY, hydrateStoredState, splitStoredState } from "./state.js";
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
import {
  SpotifyServiceError,
  compactSpotifyDevice,
  compactSpotifyPlayback,
  exchangeAuthorizationCode,
  publicSpotifyError,
  REAUTHORIZE_MESSAGE,
  refreshAuthorization,
  requestClientToken,
  searchSpotifyTracks,
  spotifyApi,
  spotifyAuthorizeUrl,
  spotifyConfigured,
  spotifyRedirectUri,
} from "./spotify.js";

const tokenEncoder = new TextEncoder();
/* The Durable Object value limit is 2 MB; warn well before it. */
const STATE_WARN_BYTES = 1.5 * 1024 * 1024;
const STATE_WARN_EVERY_MS = 60 * 1000;
const MAX_DEVICE_ID_LENGTH = 200;
const APPLIED_ACTION_LIMIT = 24;
const validDeviceId = value => typeof value === "string" && value.length > 0
  && value.length <= MAX_DEVICE_ID_LENGTH ? value : null;
/* One commissioner token per unlocked device, private (never exported in a
   snapshot). The single shared token from before stays valid as the
   "earlier unlock" entry until someone revokes it. */
const GM_TOKENS_KEY = "private:gm:tokens";
const GM_TOKEN_LIMIT = 20;
const SPOTIFY_SESSION_KEY = "private:spotify:session";
const SPOTIFY_STATE_PREFIX = "private:spotify:state:";
/* the weekend speaker: chosen once in Audio Director, sent with every cue */
const SPOTIFY_DEVICE_KEY = "private:spotify:device";
const SPOTIFY_STATE_TTL_MS = 10 * 60 * 1000;
const SPOTIFY_SEARCH_WINDOW_MS = 60 * 1000;
const SPOTIFY_SEARCH_LIMIT = 12;
const spotifyJson = (body, status = 200) => Response.json(body, {
  status,
  headers:{ "Cache-Control":"no-store" },
});
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
    /* A fresh id per instance. Hibernation or eviction rebuilds the object
       and empties the in-memory applied-action lists, so clients can tell a
       missing id apart from an action that never landed. */
    this.bootId = crypto.randomUUID();
    this.appliedActions = new Map();
    this.socketFallback = new WeakMap();
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
      showControl: configured && this.env.M2_SHOW_CONTROL_ENABLED === "true",
      audioDirector:configured && (
        this.env.M2_AUDIO_CATALOG_ENABLED === "true"
        || this.env.M2_AUDIO_PLAYBACK_ENABLED === "true"
      ),
      audioCatalog:configured
        && this.env.M2_AUDIO_CATALOG_ENABLED === "true"
        && spotifyConfigured(this.env),
      audioPlayback:configured
        && this.env.M2_AUDIO_PLAYBACK_ENABLED === "true"
        && spotifyConfigured(this.env),
    };
  }

  async hydrateFromStorage() {
    const storedWagerOps = await this.ctx.storage.get(WAGER_OPS_KEY);
    this.state = hydrateStoredState(await this.ctx.storage.get("state"), storedWagerOps);
    /* What the separate key holds now. A state still carrying its embedded
       ledger migrates on the next write, in the same atomic put. */
    this.persistedWagerOps = storedWagerOps === undefined ? null : JSON.stringify(storedWagerOps);
    this.version = (await this.ctx.storage.get("version")) || 0;
    this.gmToken = (await this.ctx.storage.get("gmToken")) || null;
    this.gmTokens = (await this.ctx.storage.get(GM_TOKENS_KEY)) || {};
    this.claims = (await this.ctx.storage.get("claims")) || {}; // deviceId -> player
  }

  /* the id of the commissioner token presented, or null */
  async gmTokenId(token) {
    if (typeof token !== "string" || !token) return null;
    for (const [id, record] of Object.entries(this.gmTokens || {}))
      if (await secureTokenEqual(token, record?.token)) return id;
    return this.gmToken && await secureTokenEqual(token, this.gmToken) ? "legacy" : null;
  }

  async revokeGmToken(id) {
    if (id === "legacy") {
      this.gmToken = null;
      await this.ctx.storage.delete("gmToken");
      this.dropGmSockets("legacy");
      return true;
    }
    if (!this.gmTokens?.[id]) return false;
    const next = { ...this.gmTokens };
    delete next[id];
    await this.ctx.storage.put(GM_TOKENS_KEY, next);
    this.gmTokens = next;
    this.dropGmSockets(id);
    return true;
  }

  /* A revoked device stops receiving the commissioner view at once, not at
     its next message. */
  dropGmSockets(id) {
    for (const ws of this.ctx.getWebSockets?.() || []) {
      const meta = this.socketMeta(ws);
      if (!meta.gm || meta.gmId !== id) continue;
      this.setSocketMeta(ws, { ...meta, gm:false, gmId:null });
      this.sendState(ws);
    }
  }

  gmDeviceList(currentId) {
    const devices = Object.entries(this.gmTokens || {})
      .map(([id, record]) => ({ id, player:record?.player || null, createdAt:record?.createdAt || 0,
        current:id === currentId }))
      .sort((a, b) => b.createdAt - a.createdAt);
    if (this.gmToken) devices.push({ id:"legacy", player:null, createdAt:0, legacy:true, current:currentId === "legacy" });
    return devices;
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
    if (url.pathname.startsWith("/api/spotify/")) return this.handleSpotify(req, url);

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
        const isGm = !!await this.gmTokenId(gmToken);
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

  async gmAuthorized(req) {
    const auth = req.headers.get("Authorization") || "";
    const token = auth.startsWith("Bearer ")
      ? auth.slice(7) : req.headers.get("X-Field-Day-GM-Token");
    return !!await this.gmTokenId(token);
  }

  spotifyRateLimit(deviceId) {
    const now = Date.now();
    this.spotifySearches = this.spotifySearches || new Map();
    const recent = (this.spotifySearches.get(deviceId) || [])
      .filter(timestamp => now - timestamp < SPOTIFY_SEARCH_WINDOW_MS);
    if (recent.length >= SPOTIFY_SEARCH_LIMIT) return false;
    recent.push(now);
    this.spotifySearches.set(deviceId, recent);
    return true;
  }

  async spotifySearchAuthorized(req) {
    if (await this.gmAuthorized(req)) return { ok:true, key:"gm" };
    const deviceId = req.headers.get("X-Field-Day-Device") || "";
    return isActivePlayer(this.claims[deviceId])
      ? { ok:true, key:`device:${deviceId}` }
      : { ok:false, key:null };
  }

  async spotifyCatalogAccessToken() {
    if (this.spotifyCatalogToken?.expiresAt > Date.now() + 30000)
      return this.spotifyCatalogToken.accessToken;
    this.spotifyCatalogToken = await requestClientToken(this.env);
    return this.spotifyCatalogToken.accessToken;
  }

  async storeSpotifyOAuthState(state, redirectUri) {
    const now = Date.now();
    const existing = await this.ctx.storage.list({ prefix:SPOTIFY_STATE_PREFIX });
    const stale = [...existing.entries()]
      .filter(([, value]) => now - Number(value?.createdAt) > SPOTIFY_STATE_TTL_MS)
      .map(([key]) => key);
    const fresh = [...existing.entries()]
      .filter(([key]) => !stale.includes(key))
      .sort((left, right) => Number(left[1]?.createdAt) - Number(right[1]?.createdAt));
    const excess = fresh.slice(0, Math.max(0, fresh.length - 4)).map(([key]) => key);
    if (stale.length || excess.length) await this.ctx.storage.delete([...stale, ...excess]);
    await this.ctx.storage.put(`${SPOTIFY_STATE_PREFIX}${state}`, {
      createdAt:now,
      redirectUri,
    });
  }

  async spotifySession({ forceRefresh = false } = {}) {
    let session = await this.ctx.storage.get(SPOTIFY_SESSION_KEY);
    if (!session?.refreshToken && !session?.accessToken)
      throw new SpotifyServiceError("Connect Spotify first",
        { status:401, code:"not_connected" });
    if (session.reauthorize)
      throw new SpotifyServiceError(REAUTHORIZE_MESSAGE, { status:401, code:"reauthorize" });
    if (forceRefresh || !(session.expiresAt > Date.now() + 30000)) {
      /* one refresh at a time: concurrent cue taps share it rather than
         spending the same refresh token twice */
      if (!this.spotifyRefreshing) {
        const current = session;
        this.spotifyRefreshing = (async () => {
          try {
            const refreshed = await refreshAuthorization(this.env, current);
            await this.ctx.storage.put(SPOTIFY_SESSION_KEY, refreshed);
            return refreshed;
          } catch (error) {
            if (error instanceof SpotifyServiceError && error.code === "reauthorize")
              await this.ctx.storage.put(SPOTIFY_SESSION_KEY, { ...current, reauthorize:true });
            throw error;
          } finally {
            this.spotifyRefreshing = null;
          }
        })();
      }
      session = await this.spotifyRefreshing;
    }
    return session;
  }

  async spotifyUserApi(path, init = {}) {
    let session = await this.spotifySession();
    try {
      return await spotifyApi(session.accessToken, path, init);
    } catch (error) {
      if (!(error instanceof SpotifyServiceError) || error.status !== 401) throw error;
      session = await this.spotifySession({ forceRefresh:true });
      return spotifyApi(session.accessToken, path, init);
    }
  }

  /* An explicit speaker becomes the saved one; otherwise the saved one plays. */
  async spotifySpeaker(requested) {
    const saved = await this.ctx.storage.get(SPOTIFY_DEVICE_KEY);
    const id = typeof requested === "string" && requested && requested.length <= 160
      ? requested : saved?.id || "";
    if (id && id !== saved?.id)
      await this.ctx.storage.put(SPOTIFY_DEVICE_KEY, { id, name:null, savedAt:Date.now() });
    return id;
  }

  /* Always aim at the chosen speaker. Spotify answers 404 when nothing is
     active; transfer playback to the speaker and try exactly once more. */
  async spotifyPlayOnSpeaker(deviceId, body) {
    const play = () => this.spotifyUserApi(
      `/me/player/play${deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : ""}`,
      { method:"PUT", body:JSON.stringify(body) },
    );
    try {
      return await play();
    } catch (error) {
      if (!(error instanceof SpotifyServiceError) || error.status !== 404) throw error;
      if (!deviceId)
        throw new SpotifyServiceError("Choose a speaker in Audio Director",
          { status:409, code:"no_device" });
      await this.spotifyUserApi("/me/player", {
        method:"PUT",
        body:JSON.stringify({ device_ids:[deviceId], play:false }),
      });
      return play();
    }
  }

  spotifyCallbackRedirect(req, status) {
    const url = new URL(req.url);
    url.pathname = "/";
    url.search = "";
    url.searchParams.set("spotify", status);
    return Response.redirect(url.toString(), 302);
  }

  async handleSpotify(req, url) {
    const catalogFlag = this.env.M2_AUDIO_CATALOG_ENABLED === "true";
    const playbackFlag = this.env.M2_AUDIO_PLAYBACK_ENABLED === "true";
    if (!catalogFlag && !playbackFlag) return new Response("Not found", { status:404 });

    if (url.pathname === "/api/spotify/callback" && req.method === "GET") {
      if (!playbackFlag) return this.spotifyCallbackRedirect(req, "disabled");
      const stateId = url.searchParams.get("state") || "";
      const stateKey = `${SPOTIFY_STATE_PREFIX}${stateId}`;
      const pending = stateId ? await this.ctx.storage.get(stateKey) : null;
      if (stateId) await this.ctx.storage.delete(stateKey);
      if (!pending || Date.now() - Number(pending.createdAt) > SPOTIFY_STATE_TTL_MS)
        return this.spotifyCallbackRedirect(req, "invalid_state");
      if (url.searchParams.get("error"))
        return this.spotifyCallbackRedirect(req, "denied");
      const code = url.searchParams.get("code") || "";
      if (!code || code.length > 2048)
        return this.spotifyCallbackRedirect(req, "error");
      try {
        const token = await exchangeAuthorizationCode(this.env, {
          code,
          redirectUri:pending.redirectUri,
        });
        const account = await spotifyApi(token.accessToken, "/me");
        await this.ctx.storage.put(SPOTIFY_SESSION_KEY, {
          ...token,
          account:{
            id:String(account?.id || "").slice(0, 100),
            displayName:String(account?.display_name || account?.id || "Spotify").slice(0, 100),
            product:String(account?.product || "unknown").slice(0, 30),
          },
          connectedAt:Date.now(),
        });
        return this.spotifyCallbackRedirect(req, "connected");
      } catch {
        return this.spotifyCallbackRedirect(req, "error");
      }
    }

    if (url.pathname === "/api/spotify/search" && req.method === "GET") {
      if (!catalogFlag) return new Response("Not found", { status:404 });
      const authorized = await this.spotifySearchAuthorized(req);
      if (!authorized.ok)
        return spotifyJson({ ok:false, error:"Check in first" }, 403);
      if (!this.spotifyRateLimit(authorized.key))
        return spotifyJson({ ok:false, error:"Too many searches; wait a minute", retryAfter:60 }, 429);
      const query = (url.searchParams.get("q") || "").trim().replace(/\s+/g, " ");
      if (query.length < 2 || query.length > 80)
        return spotifyJson({ ok:false, error:"Search must be 2 to 80 characters" }, 400);
      try {
        const accessToken = await this.spotifyCatalogAccessToken();
        return spotifyJson({ ok:true, tracks:await searchSpotifyTracks(accessToken, query) });
      } catch (error) {
        const failure = publicSpotifyError(error);
        return spotifyJson(failure.body, failure.status);
      }
    }

    if (!await this.gmAuthorized(req))
      return spotifyJson({ ok:false, error:"Commissioner authentication required" }, 403);

    if (url.pathname === "/api/spotify/status" && req.method === "GET") {
      const session = await this.ctx.storage.get(SPOTIFY_SESSION_KEY);
      let redirectUri = null;
      try { redirectUri = spotifyRedirectUri(req, this.env); } catch {}
      const hasTokens = !!(session?.refreshToken || session?.accessToken);
      const device = hasTokens ? await this.ctx.storage.get(SPOTIFY_DEVICE_KEY) : null;
      return spotifyJson({
        ok:true,
        configured:spotifyConfigured(this.env),
        /* a revoked grant is not a connection, whatever tokens remain */
        connected:hasTokens && !session.reauthorize,
        account:session?.account || null,
        redirectUri,
        catalogEnabled:catalogFlag,
        playbackEnabled:playbackFlag,
        ...(hasTokens ? {
          reconnect:!!session.reauthorize,
          ...(session.reauthorize ? { error:REAUTHORIZE_MESSAGE } : {}),
          premium:session.account?.product ? session.account.product === "premium" : null,
          device:device?.id ? { id:device.id, name:device.name || null } : null,
        } : {}),
      });
    }

    if (!playbackFlag) return new Response("Not found", { status:404 });

    if (url.pathname === "/api/spotify/authorize" && req.method === "POST") {
      if (!spotifyConfigured(this.env))
        return spotifyJson({ ok:false, error:"Spotify credentials are not configured" }, 503);
      try {
        const redirectUri = spotifyRedirectUri(req, this.env);
        const state = `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll("-", "");
        await this.storeSpotifyOAuthState(state, redirectUri);
        return spotifyJson({
          ok:true,
          authorizationUrl:spotifyAuthorizeUrl({
            clientId:this.env.SPOTIFY_CLIENT_ID,
            redirectUri,
            state,
          }),
        });
      } catch (error) {
        const failure = publicSpotifyError(error);
        return spotifyJson(failure.body, failure.status);
      }
    }

    if (url.pathname === "/api/spotify/disconnect" && req.method === "POST") {
      const pending = await this.ctx.storage.list({ prefix:SPOTIFY_STATE_PREFIX });
      await this.ctx.storage.delete([SPOTIFY_SESSION_KEY, ...pending.keys()]);
      return spotifyJson({ ok:true });
    }

    if (url.pathname === "/api/spotify/device" && req.method === "POST") {
      let body = {};
      try { body = await req.json(); } catch {}
      const id = typeof body?.deviceId === "string" ? body.deviceId : "";
      if (!id || id.length > 160)
        return spotifyJson({ ok:false, error:"Choose a speaker" }, 400);
      const device = { id, name:typeof body?.name === "string" ? body.name.slice(0, 100) : null,
        savedAt:Date.now() };
      await this.ctx.storage.put(SPOTIFY_DEVICE_KEY, device);
      return spotifyJson({ ok:true, device:{ id:device.id, name:device.name } });
    }

    if (url.pathname === "/api/spotify/player" && req.method === "GET") {
      try {
        const [deviceBody, playbackBody] = await Promise.all([
          this.spotifyUserApi("/me/player/devices"),
          this.spotifyUserApi("/me/player"),
        ]);
        return spotifyJson({
          ok:true,
          devices:(deviceBody?.devices || []).map(compactSpotifyDevice).filter(Boolean),
          playback:compactSpotifyPlayback(playbackBody),
        });
      } catch (error) {
        const failure = publicSpotifyError(error);
        return spotifyJson(failure.body, failure.status);
      }
    }

    if (url.pathname === "/api/spotify/play" && req.method === "POST") {
      let body;
      try { body = await req.json(); } catch {
        return spotifyJson({ ok:false, error:"Invalid playback request" }, 400);
      }
      const uri = typeof body?.uri === "string" ? body.uri : null;
      if (uri && !/^spotify:track:[A-Za-z0-9]{22}$/.test(uri))
        return spotifyJson({ ok:false, error:"Invalid Spotify track" }, 400);
      const deviceId = typeof body?.deviceId === "string" && body.deviceId.length <= 160
        ? body.deviceId : "";
      const positionMs = Math.max(0, Math.min(12 * 60 * 60 * 1000,
        Math.floor(Number(body?.positionMs) || 0)));
      try {
        const speaker = await this.spotifySpeaker(deviceId);
        await this.spotifyPlayOnSpeaker(speaker,
          uri ? { uris:[uri], position_ms:positionMs } : {});
        return spotifyJson({ ok:true, deviceId:speaker || null });
      } catch (error) {
        const failure = publicSpotifyError(error);
        return spotifyJson(failure.body, failure.status);
      }
    }

    if (url.pathname === "/api/spotify/pause" && req.method === "POST") {
      let body = {};
      try { body = await req.json(); } catch {}
      const deviceId = typeof body?.deviceId === "string" && body.deviceId.length <= 160
        ? body.deviceId : "";
      try {
        const speaker = deviceId || (await this.ctx.storage.get(SPOTIFY_DEVICE_KEY))?.id || "";
        await this.spotifyUserApi(
          `/me/player/pause${speaker ? `?device_id=${encodeURIComponent(speaker)}` : ""}`,
          { method:"PUT" },
        );
        return spotifyJson({ ok:true });
      } catch (error) {
        const failure = publicSpotifyError(error);
        return spotifyJson(failure.body, failure.status);
      }
    }

    return new Response("Not found", { status:404 });
  }

  async adminAuthorized(req) {
    const auth = req.headers.get("Authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : req.headers.get("X-Field-Day-GM-Token");
    if (this.environment !== "production") return !!await this.gmTokenId(token);
    return secureTokenEqual(token, this.env.SNAPSHOT_ADMIN_TOKEN);
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

  /* Fresh local objects may not have written their default state yet. The
     in-memory authority still has a complete logical value for each required
     key, so export it (in its stored shape) without mutating storage. */
  withInMemoryDefaults(entries) {
    if (!entries.has("state")) {
      const split = splitStoredState(this.state);
      entries.set("state", split.state);
      if (!entries.has(WAGER_OPS_KEY) && Object.keys(split.wagerOps).length)
        entries.set(WAGER_OPS_KEY, split.wagerOps);
    }
    if (!entries.has("version")) entries.set("version", this.version);
    if (!entries.has("claims")) entries.set("claims", this.claims);
    return entries;
  }

  async createSnapshot() {
    const entries = this.withInMemoryDefaults(await this.ctx.storage.list());
    return buildSnapshot(entries, {
      environment: this.environment,
      applicationVersion: this.env.APP_VERSION || "unknown",
      object: "tournament/main",
    });
  }

  async restoreValidatedSnapshot(snapshot, checked) {
    const current = await this.ctx.storage.list();
    const backupSource = this.withInMemoryDefaults(new Map(current));
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

  /* ── connection identity ──
     A socket is bound to the device id it first presents (its hello). The
     binding lives in the hibernation attachment so it survives eviction; the
     WeakMap covers test sockets and runtimes without attachments. */
  socketMeta(ws) {
    let meta = null;
    try { meta = ws?.deserializeAttachment?.() ?? null; } catch {}
    if (!meta || typeof meta !== "object") meta = this.socketFallback.get(ws) || null;
    return { deviceId:validDeviceId(meta?.deviceId), gm:meta?.gm === true, tv:meta?.tv === true,
      gmId:typeof meta?.gmId === "string" ? meta.gmId : null };
  }

  setSocketMeta(ws, meta) {
    const clean = { deviceId:validDeviceId(meta?.deviceId), gm:meta?.gm === true, tv:meta?.tv === true,
      gmId:meta?.gm === true && typeof meta?.gmId === "string" ? meta.gmId : null };
    try { ws?.serializeAttachment?.(clean); } catch {}
    if (ws && typeof ws === "object") this.socketFallback.set(ws, clean);
    return clean;
  }

  /* The one place a connection's commissioner view is decided. It mirrors the
     action check below; if GM tokens change shape, change both together. */
  async messageIsGm(gmToken) {
    return !!await this.gmTokenId(gmToken);
  }

  viewerFor(meta) {
    if (meta?.tv) return { isGm:false, player:null };
    const claimed = meta?.deviceId ? this.claims[meta.deviceId] : null;
    return { isGm:meta?.gm === true, player:isActivePlayer(claimed) ? claimed : null };
  }

  rememberApplied(deviceId, actionId) {
    if (!deviceId || typeof actionId !== "string" || !actionId || actionId.length > 120) return;
    const list = (this.appliedActions.get(deviceId) || []).filter(id => id !== actionId);
    list.push(actionId);
    this.appliedActions.set(deviceId, list.slice(-APPLIED_ACTION_LIMIT));
  }

  stateFrame(ws, serialize, extra = {}, shared = null) {
    const meta = this.socketMeta(ws);
    const viewer = this.viewerFor(meta);
    const head = JSON.stringify({
      type:"state",
      version:this.version,
      ...extra,
      you:viewer.player,
      /* whether this connection currently holds a commissioner view, so a
         phone whose token was revoked leaves its commissioner screens */
      ...(meta.deviceId ? { gm:viewer.isGm } : {}),
      environment:shared?.environment ?? this.environment,
      capabilities:shared?.capabilities ?? this.capabilities,
      build:BUILD_ID,
      boot:this.bootId,
      applied:meta.deviceId ? this.appliedActions.get(meta.deviceId) || [] : [],
      /* send time, so every screen shares one clock (src/lib/serverClock.js) */
      serverNow:Date.now(),
    });
    return `${head.slice(0, -1)},"state":${serialize(viewer)}}`;
  }

  sendState(ws, extra = {}) {
    try { ws.send(this.stateFrame(ws, createStateSerializer(this.state), extra)); } catch {}
  }

  async webSocketMessage(ws, raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg !== "object" || Array.isArray(msg)) return;
    const { actionId, type, payload, gmToken } = msg;
    const reply = obj => { try { ws.send(JSON.stringify({ type: "ack", actionId, ...obj })); } catch {} };

    /* Trust only the device id this socket was bound to. A different id on a
       later message is someone else's identity, never a re-bind. */
    let meta = this.socketMeta(ws);
    const presented = validDeviceId(msg.deviceId);
    if (meta.deviceId && presented && presented !== meta.deviceId) {
      if (type === "hello" || type === "ping") return;
      return reply({ ok:false, error:"This connection belongs to another device. Reload." });
    }
    if (!meta.deviceId && presented) meta = this.setSocketMeta(ws, { ...meta, deviceId:presented });
    const deviceId = meta.deviceId;

    if (type === "hello") {
      const gmId = await this.gmTokenId(gmToken);
      meta = this.setSocketMeta(ws, { ...meta, tv:payload?.view === "tv", gm:!!gmId, gmId });
      const nonce = Number.isSafeInteger(payload?.nonce) ? payload.nonce : undefined;
      this.sendState(ws, nonce === undefined ? {} : { hello:nonce });
      return;
    }
    if (type === "ping") { try { ws.send(JSON.stringify({ type: "pong", serverNow:Date.now() })); } catch {} return; }

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
      /* each unlock mints this device's own token and replaces its last one */
      const token = crypto.randomUUID();
      const kept = Object.entries(this.gmTokens || {})
        .filter(([, record]) => record?.deviceId !== deviceId)
        .sort((a, b) => (b[1]?.createdAt || 0) - (a[1]?.createdAt || 0))
        .slice(0, GM_TOKEN_LIMIT - 1);
      const nextTokens = { ...Object.fromEntries(kept), [crypto.randomUUID().slice(0, 8)]:{
        token, deviceId:typeof deviceId === "string" ? deviceId.slice(0, 200) : null,
        player:isActivePlayer(this.claims?.[deviceId]) ? this.claims[deviceId] : null, createdAt:now,
      } };
      await this.ctx.storage.put(GM_TOKENS_KEY, nextTokens);
      this.gmTokens = nextTokens;
      return reply({ ok: true, extra: { gmToken: token } });
    }

    if (type === "gmDevices" || type === "gmRevoke" || type === "gmExit") {
      const currentId = await this.gmTokenId(gmToken);
      if (type === "gmExit") {
        if (currentId) await this.revokeGmToken(currentId);
        return reply({ ok: true });
      }
      if (!currentId) return reply({ ok: false, error: "Commissioner only" });
      if (type === "gmRevoke") {
        const id = typeof payload?.id === "string" ? payload.id : "";
        if (!await this.revokeGmToken(id)) return reply({ ok: false, error: "That device is already signed out" });
      }
      return reply({ ok: true, extra: { devices: this.gmDeviceList(currentId) } });
    }

    if (type === "claim") {
      const player = payload?.player;
      if (!ROSTER.includes(player)) return reply({ ok: false, error: "Pick a player" });
      if (!deviceId) return reply({ ok:false, error:"Reload and try again" });
      const previous = this.claims[deviceId];
      if (previous !== player) {
        const nextClaims = { ...this.claims, [deviceId]:player };
        await this.ctx.storage.put("claims", nextClaims);
        this.claims = nextClaims;
        /* The claim changes what this device may see (its own ratings and
           travel answers), so its sockets get their view before the ack. */
        const serialize = createStateSerializer(this.state);
        for (const socket of this.ctx.getWebSockets?.() || []) {
          if (this.socketMeta(socket).deviceId !== deviceId) continue;
          try { socket.send(this.stateFrame(socket, serialize)); } catch {}
        }
      }
      /* A returning guest in a new browser or reinstalled app already has
         every answer on the server; the client skips the rest of check-in. */
      return reply({ ok: true, extra:{ player, checkedIn:checkInComplete(this.state, player) } });
    }

    const gmId = await this.gmTokenId(gmToken);
    const isGm = !!gmId;
    /* A token that starts or stops matching changes this socket's view. */
    let viewChanged = false;
    if (isGm !== meta.gm || gmId !== meta.gmId) {
      meta = this.setSocketMeta(ws, { ...meta, gm:isGm, gmId });
      viewChanged = !meta.tv;
    }
    const claimed = this.claims[deviceId];
    const nextState = structuredClone(this.state);
    const result = applyAction(nextState, type, payload, {
      isGm,
      player: isActivePlayer(claimed) ? claimed : null,
      deviceId,
      actionId,
      environment:this.environment,
      progressReset:this.capabilities.progressReset,
      showControl:this.capabilities.showControl,
    });
    if (!result.ok) {
      if (viewChanged) this.sendState(ws);
      return reply(result);
    }
    /* Explicit no-ops make retried result/transition actions idempotent:
       acknowledge them without incrementing the transport version or
       broadcasting a state that did not change. */
    if (result.extra?.unchanged) {
      this.rememberApplied(deviceId, actionId);
      if (viewChanged) this.sendState(ws);
      return reply({ ...result, version:this.version });
    }
    let persisted;
    try {
      persisted = await this.persist(nextState, {
        backupPrefix:type === "resetTournament" ? INTERNAL_RESET_BACKUP_PREFIX : null,
      });
    } catch (error) {
      console.error(JSON.stringify({ event:"persist-failed", action:type,
        error:String(error?.message || error).slice(0, 300) }));
      if (viewChanged) this.sendState(ws);
      return reply({ ok:false, error:"Couldn't save. Try again." });
    }
    this.rememberApplied(deviceId, actionId);
    /* The actor's ack is not held up by the broadcast. Its own socket gets
       the new board first (a resolved dispatch has always meant the state
       it produced is already on screen), then the ack, then every other
       socket. Each frame carries the applied id. */
    const serialize = createStateSerializer(this.state);
    const shared = { environment:this.environment, capabilities:this.capabilities };
    try { ws.send(this.stateFrame(ws, serialize, { lastAction:type }, shared)); } catch {}
    const extra = { ...(result.extra || {}), ...(persisted || {}) };
    reply({ ...result, ...(Object.keys(extra).length ? { extra } : {}), version: this.version });
    this.broadcastState(type, { serialize, shared, skip:ws });
  }

  async persistAndBroadcast(lastAction, nextState = this.state, options = {}) {
    const persisted = await this.persist(nextState, options);
    this.broadcastState(lastAction);
    return persisted;
  }

  /* Stored shape: "state" without the wager retry ledger, which has its own
     key and is written only when it changed. */
  storageWrite(nextState, nextVersion) {
    const split = splitStoredState(nextState);
    const write = { state:split.state, version:nextVersion };
    const opsJson = JSON.stringify(split.wagerOps);
    if (opsJson !== this.persistedWagerOps) write[WAGER_OPS_KEY] = split.wagerOps;
    this.warnIfLarge(split.state, opsJson);
    return { write, opsJson };
  }

  warnIfLarge(storedState, opsJson) {
    let bytes = 0;
    try { bytes = JSON.stringify(storedState).length; } catch { return; }
    if (bytes <= STATE_WARN_BYTES) return;
    const now = Date.now();
    if (this.lastSizeWarning && now - this.lastSizeWarning < STATE_WARN_EVERY_MS) return;
    this.lastSizeWarning = now;
    console.warn(JSON.stringify({ event:"state-size", stateBytes:bytes,
      wagerOpsBytes:opsJson.length, limitBytes:2 * 1024 * 1024 }));
  }

  async persist(nextState = this.state, { backupPrefix = null } = {}) {
    const nextVersion = this.version + 1;
    nextState.updatedAt = Date.now();
    const { write, opsJson } = this.storageWrite(nextState, nextVersion);
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
        await txn.put(write);
      });
    } else {
      await this.ctx.storage.put(write);
    }
    this.persistedWagerOps = opsJson;
    this.state = nextState;
    this.version = nextVersion;
    return backupKey ? { backupKey } : null;
  }

  /* Every socket gets its own projection (publicState.js). Sockets with the
     same viewer share one serialized state; only the small frame head is
     per socket. */
  broadcastState(lastAction, {
    serialize = createStateSerializer(this.state),
    shared = { environment:this.environment, capabilities:this.capabilities },
    skip = null,
  } = {}) {
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === skip) continue;
      try { ws.send(this.stateFrame(ws, serialize, { lastAction }, shared)); } catch {}
    }
  }

  async webSocketClose(ws) { try { ws.close(); } catch {} }
  async webSocketError(ws) { try { ws.close(); } catch {} }
}
