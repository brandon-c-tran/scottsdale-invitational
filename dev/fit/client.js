/* The fit audit's transport (scripts/fit-audit.mjs swaps it in for
   src/lib/client.js on its own dev server only). No socket: the harness
   hands it a projected frame (the same publicState projection the Worker
   sends), and dispatch runs the real reducer in memory through the hook the
   harness installs. Every export of the real transport exists here, so the
   whole app mounts; tests/fit-audit.test.mjs pins that the names match. */
import { useSyncExternalStore } from "react";
import { EMPTY_STATE } from "../../shared/core.js";

const localGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
const localSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
export { localGet, localSet };

const CAPS = { qa:false, progressReset:false, restore:false, snapshotExport:false, showControl:false,
  audioDirector:false, audioCatalog:false, audioPlayback:false, push:false };
let cached = { state:EMPTY_STATE, version:0, connected:false, socketOpen:false, stale:false, ready:false, lastAction:null,
  environment:"local", capabilities:CAPS, you:null, gm:null, build:"fit", serverBuild:"fit", updateReady:false,
  pushKey:null, tvs:null, tvsAt:0 };
const listeners = new Set();
/* the harness's frame: { state, you, gm, capabilities, version } */
export function setFitFrame(frame) {
  cached = { ...cached, ...frame, ready:true, connected:true, socketOpen:true, version:frame.version || cached.version + 1 };
  listeners.forEach(fn => fn());
}
if (typeof globalThis !== "undefined" && globalThis.__FIT_FRAME__) setFitFrame(globalThis.__FIT_FRAME__);

export const getDeviceId = () => localGet("si-device") || "fit-device";
export const setGmToken = t => localSet("si-gm-token", t || "");
export const hasGmToken = () => !!localGet("si-gm-token");
export const getTournamentSnapshot = () => cached;
export const setTvView = () => {};
export const reportTvSound = () => {};
export function dispatch(type, payload) {
  const run = globalThis.__FIT_DISPATCH__;
  return Promise.resolve(run ? run(type, payload) : { ok:false, error:"Offline, try again" });
}
export const reloadForUpdate = () => false;
export function useTournament() {
  return useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, () => cached, () => cached);
}
const offline = async () => ({ ok:false, error:"Unavailable in the fit audit" });
export const uploadPhoto = offline;
export const uploadMoment = offline;
export const deleteMoment = offline;
export const setMomentHidden = offline;
export const hiddenMomentUrl = async () => null;
export const geoUploadPhoto = offline;
export const geoDeleteRound = offline;
export const geoPhotoUrl = async id => `/api/geo/photo/${encodeURIComponent(id)}`;
export const triviaUploadPhoto = offline;
export const triviaBank = offline;
export const triviaClip = offline;
export const triviaClipCheck = offline;
export const triviaPhotoUrl = async id => `/api/trivia/photo/${encodeURIComponent(id)}`;
export const reportClientError = () => {};
export const spotifyStatus = offline;
export const spotifyPlayer = offline;
export const spotifySearch = offline;
export const songSnippet = offline;
export const songPreview = offline;
export const spotifyAuthorize = offline;
export const spotifyDisconnect = offline;
export const spotifyPlay = offline;
export const spotifyAutoWinSongs = offline;
export const spotifyDevice = offline;
export const spotifyRetry = offline;
export const spotifyPause = offline;
export const downloadSnapshot = offline;
