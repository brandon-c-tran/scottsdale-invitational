import { validateSpotifyTrack } from "../shared/audio.js";

const ACCOUNTS_BASE = "https://accounts.spotify.com";
const API_BASE = "https://api.spotify.com/v1";
const SPOTIFY_SCOPES = Object.freeze([
  "user-read-private",
  "user-read-playback-state",
  "user-modify-playback-state",
]);
const FETCH_TIMEOUT_MS = 6000;

class SpotifyServiceError extends Error {
  constructor(message, { status = 502, code = "spotify_error", retryAfter = null } = {}) {
    super(message);
    this.name = "SpotifyServiceError";
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

const spotifyConfigured = env =>
  typeof env?.SPOTIFY_CLIENT_ID === "string" && !!env.SPOTIFY_CLIENT_ID
  && typeof env?.SPOTIFY_CLIENT_SECRET === "string" && !!env.SPOTIFY_CLIENT_SECRET;

function spotifyRedirectUri(request, env) {
  if (typeof env?.SPOTIFY_REDIRECT_URI === "string" && env.SPOTIFY_REDIRECT_URI) {
    const configured = new URL(env.SPOTIFY_REDIRECT_URI);
    if (configured.protocol !== "https:"
        && !(configured.protocol === "http:" && configured.hostname === "127.0.0.1"))
      throw new SpotifyServiceError("Spotify redirect URI must use HTTPS or 127.0.0.1",
        { status:500, code:"bad_configuration" });
    return configured.toString();
  }
  const incoming = new URL(request.url);
  if (incoming.hostname === "localhost") incoming.hostname = "127.0.0.1";
  incoming.pathname = "/api/spotify/callback";
  incoming.search = "";
  incoming.hash = "";
  return incoming.toString();
}

function spotifyAuthorizeUrl({ clientId, redirectUri, state }) {
  const url = new URL(`${ACCOUNTS_BASE}/authorize`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", SPOTIFY_SCOPES.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("show_dialog", "true");
  return url.toString();
}

async function spotifyFetch(url, init = {}, fetchImpl = fetch) {
  let response;
  try {
    response = await fetchImpl(url, {
      ...init,
      signal:init.signal || AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    throw new SpotifyServiceError("Spotify did not respond", { code:"spotify_unavailable" });
  }
  return response;
}

const REAUTHORIZE_MESSAGE = "Reconnect Spotify in Audio Director";
const PLAYER_MESSAGES = {
  PREMIUM_REQUIRED:"Spotify Premium is required for playback",
  NO_ACTIVE_DEVICE:"No active speaker. Choose one in Audio Director",
};
async function spotifyError(response, fallback) {
  let message = fallback;
  let code = "spotify_error";
  try {
    const body = await response.json();
    message = body?.error?.message || body?.error_description || fallback;
    code = body?.error?.reason || (typeof body?.error === "string" ? body.error : null) || code;
  } catch {}
  if (PLAYER_MESSAGES[code]) message = PLAYER_MESSAGES[code];
  const retryAfter = response.headers.get("Retry-After");
  throw new SpotifyServiceError(message, {
    status:response.status === 429 ? 429 : response.status >= 500 ? 502 : response.status,
    code:String(code),
    retryAfter:retryAfter ? Math.max(0, Number(retryAfter) || 0) : null,
  });
}

async function requestSpotifyToken(env, form, fetchImpl = fetch) {
  if (!spotifyConfigured(env))
    throw new SpotifyServiceError("Spotify credentials are not configured",
      { status:503, code:"not_configured" });
  const authorization = btoa(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`);
  const response = await spotifyFetch(`${ACCOUNTS_BASE}/api/token`, {
    method:"POST",
    headers:{
      Authorization:`Basic ${authorization}`,
      "Content-Type":"application/x-www-form-urlencoded",
    },
    body:new URLSearchParams(form),
  }, fetchImpl);
  if (!response.ok) await spotifyError(response, "Spotify authorization failed");
  const body = await response.json();
  if (typeof body.access_token !== "string" || !body.access_token)
    throw new SpotifyServiceError("Spotify returned an invalid token",
      { code:"invalid_token_response" });
  return {
    accessToken:body.access_token,
    refreshToken:typeof body.refresh_token === "string" ? body.refresh_token : null,
    expiresAt:Date.now() + Math.max(60, Number(body.expires_in) || 3600) * 1000,
    scope:typeof body.scope === "string" ? body.scope : "",
  };
}

const requestClientToken = (env, fetchImpl) =>
  requestSpotifyToken(env, { grant_type:"client_credentials" }, fetchImpl);

const exchangeAuthorizationCode = (env, { code, redirectUri }, fetchImpl) =>
  requestSpotifyToken(env, {
    grant_type:"authorization_code",
    code,
    redirect_uri:redirectUri,
  }, fetchImpl);

/* A revoked or expired refresh token (invalid_grant) cannot be retried: the
   commissioner has to authorize again, and every surface says so. */
async function refreshAuthorization(env, session, fetchImpl) {
  if (!session?.refreshToken)
    throw new SpotifyServiceError(REAUTHORIZE_MESSAGE, { status:401, code:"reauthorize" });
  let refreshed;
  try {
    refreshed = await requestSpotifyToken(env, {
      grant_type:"refresh_token",
      refresh_token:session.refreshToken,
    }, fetchImpl);
  } catch (error) {
    if (error instanceof SpotifyServiceError
        && (error.code === "invalid_grant" || error.code === "invalid_client"))
      throw new SpotifyServiceError(REAUTHORIZE_MESSAGE, { status:401, code:"reauthorize" });
    throw error;
  }
  return {
    ...session,
    ...refreshed,
    refreshToken:refreshed.refreshToken || session.refreshToken,
  };
}

async function spotifyApi(accessToken, path, init = {}, fetchImpl = fetch) {
  const response = await spotifyFetch(`${API_BASE}${path}`, {
    ...init,
    headers:{
      ...(init.body ? { "Content-Type":"application/json" } : {}),
      ...(init.headers || {}),
      Authorization:`Bearer ${accessToken}`,
    },
  }, fetchImpl);
  if (!response.ok && response.status !== 204)
    await spotifyError(response, "Spotify request failed");
  if (response.status === 204) return null;
  return response.json();
}

function compactSpotifyTrack(track, startMs = 0) {
  const candidate = {
    provider:"spotify",
    trackId:track?.id,
    uri:track?.uri,
    url:track?.external_urls?.spotify,
    name:track?.name,
    artists:Array.isArray(track?.artists) ? track.artists.map(artist => artist?.name) : [],
    durationMs:track?.duration_ms,
    imageUrl:track?.album?.images?.find(image => image?.url)?.url || null,
    explicit:track?.explicit === true,
    startMs,
  };
  const checked = validateSpotifyTrack(candidate);
  return checked.ok ? checked.track : null;
}

async function searchSpotifyTracks(accessToken, query, fetchImpl = fetch) {
  const url = new URL(`${API_BASE}/search`);
  url.searchParams.set("q", query);
  url.searchParams.set("type", "track");
  url.searchParams.set("market", "US");
  url.searchParams.set("limit", "8");
  const response = await spotifyFetch(url, {
    headers:{ Authorization:`Bearer ${accessToken}` },
  }, fetchImpl);
  if (!response.ok) await spotifyError(response, "Spotify search failed");
  const body = await response.json();
  return (body?.tracks?.items || []).map(track => compactSpotifyTrack(track)).filter(Boolean);
}

function compactSpotifyDevice(device) {
  if (!device || typeof device.id !== "string" || !device.id) return null;
  return {
    id:device.id.slice(0, 160),
    name:String(device.name || "Spotify device").slice(0, 100),
    type:String(device.type || "unknown").slice(0, 40),
    active:device.is_active === true,
    restricted:device.is_restricted === true,
    volume:Number.isFinite(device.volume_percent) ? device.volume_percent : null,
  };
}

function compactSpotifyPlayback(playback) {
  if (!playback) return null;
  return {
    playing:playback.is_playing === true,
    progressMs:Math.max(0, Math.floor(Number(playback.progress_ms) || 0)),
    device:compactSpotifyDevice(playback.device),
    track:compactSpotifyTrack(playback.item),
  };
}

function publicSpotifyError(error) {
  if (error instanceof SpotifyServiceError) {
    return {
      status:Math.max(400, Math.min(503, error.status || 502)),
      body:{
        ok:false,
        error:error.message,
        code:error.code,
        ...(error.retryAfter !== null ? { retryAfter:error.retryAfter } : {}),
      },
    };
  }
  return {
    status:502,
    body:{ ok:false, error:"Spotify is unavailable", code:"spotify_unavailable" },
  };
}

export {
  REAUTHORIZE_MESSAGE,
  SPOTIFY_SCOPES,
  SpotifyServiceError,
  compactSpotifyDevice,
  compactSpotifyPlayback,
  compactSpotifyTrack,
  exchangeAuthorizationCode,
  publicSpotifyError,
  refreshAuthorization,
  requestClientToken,
  searchSpotifyTracks,
  spotifyApi,
  spotifyAuthorizeUrl,
  spotifyConfigured,
  spotifyRedirectUri,
};
