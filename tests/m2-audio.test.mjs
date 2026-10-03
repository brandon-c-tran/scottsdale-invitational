import test from "node:test";
import assert from "node:assert/strict";

import { EMPTY_STATE } from "../shared/core.js";
import { validateSpotifyTrack } from "../shared/audio.js";
import { applyAction } from "../worker/actions.js";
import { Tournament } from "../worker/tournament.js";
import {
  compactSpotifyTrack,
  requestClientToken,
  searchSpotifyTracks,
  spotifyAuthorizeUrl,
  spotifyRedirectUri,
} from "../worker/spotify.js";

const TRACK_ID = "1234567890123456789012";
const providerTrack = {
  id:TRACK_ID,
  uri:`spotify:track:${TRACK_ID}`,
  name:"Field Day Entrance",
  artists:[{ name:"The Commissioners" }],
  duration_ms:201000,
  explicit:false,
  external_urls:{ spotify:`https://open.spotify.com/track/${TRACK_ID}` },
  album:{ images:[{ url:"https://i.scdn.co/image/test-art" }] },
};
const publicTrack = compactSpotifyTrack(providerTrack, 42000);

const memoryContext = () => {
  const entries = new Map();
  return {
    entries,
    context:{
      blockConcurrencyWhile() {},
      storage:{
        async get(key) { return entries.get(key); },
        async put(key, value) {
          if (typeof key === "object") {
            for (const [entryKey, entryValue] of Object.entries(key))
              entries.set(entryKey, structuredClone(entryValue));
          } else {
            entries.set(key, structuredClone(value));
          }
        },
        async delete(key) {
          for (const item of Array.isArray(key) ? key : [key]) entries.delete(item);
        },
        async list({ prefix = "" } = {}) {
          return new Map([...entries].filter(([key]) => key.startsWith(prefix)));
        },
      },
    },
  };
};

test("Spotify profile metadata is canonical, bounded, optional, and backward-compatible", () => {
  assert.ok(publicTrack);
  assert.equal(publicTrack.url, `https://open.spotify.com/track/${TRACK_ID}`);
  const checked = validateSpotifyTrack({ ...publicTrack, startMs:999999 });
  assert.equal(checked.ok, true);
  assert.equal(checked.track.startMs, publicTrack.durationMs - 1000);

  assert.match(validateSpotifyTrack({
    ...publicTrack,
    imageUrl:"https://tracker.invalid/cover.jpg",
  }).error, /image/i);
  assert.match(validateSpotifyTrack({
    ...publicTrack,
    uri:"spotify:track:aaaaaaaaaaaaaaaaaaaaaa",
  }).error, /track/i);
  assert.deepEqual(validateSpotifyTrack(null), { ok:true, track:null });

  const state = structuredClone(EMPTY_STATE);
  assert.equal(applyAction(state, "saveProfile", {
    player:"Brandon",
    display:"B",
    walkoutTrack:publicTrack,
  }, { isGm:false, player:"Brandon" }).ok, true);
  assert.deepEqual(state.profiles.Brandon.walkoutTrack, publicTrack);

  assert.equal(applyAction(state, "saveProfile", {
    player:"Brandon",
    display:"Brandon",
  }, { isGm:false, player:"Brandon" }).ok, true);
  assert.deepEqual(state.profiles.Brandon.walkoutTrack, publicTrack);

  assert.equal(applyAction(state, "saveProfile", {
    player:"Brandon",
    display:"Brandon",
    walkoutTrack:null,
  }, { isGm:false, player:"Brandon" }).ok, true);
  assert.equal("walkoutTrack" in state.profiles.Brandon, false);
});

test("Spotify catalog token and search stay server-side and return compact metadata", async () => {
  let tokenAuthorization = "";
  const token = await requestClientToken({
    SPOTIFY_CLIENT_ID:"server-client",
    SPOTIFY_CLIENT_SECRET:"server-secret",
  }, async (_url, init) => {
    tokenAuthorization = init.headers.Authorization;
    return Response.json({
      access_token:"catalog-access-token",
      token_type:"Bearer",
      expires_in:3600,
    });
  });
  assert.equal(token.accessToken, "catalog-access-token");
  assert.match(tokenAuthorization, /^Basic /);
  assert.equal(tokenAuthorization.includes("server-secret"), false);

  let requestAuthorization = "";
  const tracks = await searchSpotifyTracks("catalog-access-token", "field day",
    async (url, init) => {
      assert.equal(new URL(url).searchParams.get("limit"), "8");
      requestAuthorization = init.headers.Authorization;
      return Response.json({ tracks:{ items:[providerTrack] } });
    });
  assert.equal(requestAuthorization, "Bearer catalog-access-token");
  assert.deepEqual(tracks, [{ ...publicTrack, startMs:0 }]);
  assert.equal(JSON.stringify(tracks).includes("catalog-access-token"), false);
});

test("Spotify OAuth uses an exact callback, state, and least-privilege playback scopes", () => {
  const localRedirect = spotifyRedirectUri(
    new Request("http://localhost:5173/api/spotify/status"), {});
  assert.equal(localRedirect, "http://127.0.0.1:5173/api/spotify/callback");
  const stagingRedirect = spotifyRedirectUri(
    new Request("https://staging.example/api/spotify/status"), {});
  assert.equal(stagingRedirect, "https://staging.example/api/spotify/callback");

  const authorization = new URL(spotifyAuthorizeUrl({
    clientId:"client-id",
    redirectUri:stagingRedirect,
    state:"opaque-state",
  }));
  assert.equal(authorization.origin, "https://accounts.spotify.com");
  assert.equal(authorization.searchParams.get("state"), "opaque-state");
  assert.equal(authorization.searchParams.get("redirect_uri"), stagingRedirect);
  const scopes = authorization.searchParams.get("scope").split(" ");
  assert.deepEqual(scopes.sort(), [
    "user-modify-playback-state",
    "user-read-playback-state",
    "user-read-private",
  ]);
});

test("Speaker (audio) advertises setup safely and persists OAuth state privately", async () => {
  const memory = memoryContext();
  const tournament = new Tournament(memory.context, {
    APP_ENV:"staging",
    M2_AUDIO_CATALOG_ENABLED:"true",
    M2_AUDIO_PLAYBACK_ENABLED:"true",
  });
  tournament.state = structuredClone(EMPTY_STATE);
  tournament.claims = {};
  tournament.gmToken = "gm-test-token";

  const statusRequest = new Request("https://staging.example/api/spotify/status", {
    headers:{ Authorization:"Bearer gm-test-token" },
  });
  const setup = await tournament.handleSpotify(statusRequest, new URL(statusRequest.url));
  assert.equal(setup.status, 200);
  assert.deepEqual(await setup.json(), {
    ok:true,
    configured:false,
    connected:false,
    account:null,
    redirectUri:"https://staging.example/api/spotify/callback",
    catalogEnabled:true,
    playbackEnabled:true,
  });

  tournament.env.SPOTIFY_CLIENT_ID = "client-id";
  tournament.env.SPOTIFY_CLIENT_SECRET = "client-secret";
  const authorizeRequest = new Request("https://staging.example/api/spotify/authorize", {
    method:"POST",
    headers:{ Authorization:"Bearer gm-test-token" },
  });
  const response = await tournament.handleSpotify(authorizeRequest, new URL(authorizeRequest.url));
  const body = await response.json();
  assert.equal(body.ok, true);
  const authorization = new URL(body.authorizationUrl);
  const state = authorization.searchParams.get("state");
  assert.ok(state);
  assert.deepEqual(memory.entries.get(`private:spotify:state:${state}`), {
    createdAt:memory.entries.get(`private:spotify:state:${state}`).createdAt,
    redirectUri:"https://staging.example/api/spotify/callback",
  });
  assert.equal(body.authorizationUrl.includes("client-secret"), false);
});
