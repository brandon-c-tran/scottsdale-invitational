/* D11, the photo desk: upload validation (type, size, auth, rate limit,
   caps), EXIF stripping, metadata privacy (no device ids, hidden only for
   the commissioner), moderation, the TV's rotation gating, and snapshot
   behaviour. Everything runs in memory. */
import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { EMPTY_STATE, ROSTER, RESET_PROGRESS_CONFIRMATION, allEventsOf, computeStandings } from "../shared/core.js";
import { applyAction } from "./support/confirmed-start.mjs";
import { Tournament } from "../worker/tournament.js";
import { publicState } from "../worker/publicState.js";
import { isPortableStorageKey, validateSnapshot, INTERNAL_RESET_BACKUP_PREFIX } from "../worker/snapshot.js";
import {
  MOMENT_INDEX_KEY, MOMENT_LIMITS, admitMoment, clampTakenAt, cleanMomentIndex, jpegInfo, momentFullKey,
  momentThumbKey, publicMoments, stripJpegMetadata,
} from "../worker/moments.js";
import {
  PHOTO_PREP, TV_PHOTO_MS, TV_PHOTO_RECENT, batchLine, canDeleteMoment, deskMoments, fitSide, photoFit, tvPhotoAt,
  tvPhotoGap, tvPhotoRotation, visibleMoments, withPhotoTurns,
} from "../src/features/photos/photoModel.js";
import { uploadMoment } from "../src/lib/client.js";

const [HOST, ALEX, BLAKE] = ROSTER;

/* ── a small JPEG: real segment structure, EXIF with a location, a comment ── */
const ascii = text => [...text].map(char => char.charCodeAt(0));
const segment = (marker, payload) => [0xFF, marker, (payload.length + 2) >> 8, (payload.length + 2) & 255, ...payload];
function fakeJpeg({ width = 1600, height = 1200, exif = true } = {}) {
  return new Uint8Array([0xFF, 0xD8,
    ...segment(0xE0, [...ascii("JFIF"), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]),
    ...(exif ? segment(0xE1, [...ascii("Exif"), 0, 0, ...ascii("GPS 33.4942N 111.9261W iPhone")]) : []),
    ...segment(0xFE, ascii("a comment")),
    ...segment(0xDB, new Array(65).fill(1)),
    ...segment(0xC0, [8, height >> 8, height & 255, width >> 8, width & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]),
    ...segment(0xDA, [3, 1, 0, 2, 0x11, 3, 0x11, 0, 63, 0]),
    ...new Array(300).fill(0x55), 0xFF, 0xD9]);
}
const text = bytes => Buffer.from(bytes).toString("latin1");

/* ── Durable Object harness ── */
function memoryContext() {
  const entries = new Map();
  const sockets = [];
  const storage = {
    async get(key) { return structuredClone(entries.get(key)); },
    async put(key, value) {
      if (typeof key === "object") for (const [k, v] of Object.entries(key)) entries.set(k, structuredClone(v));
      else entries.set(key, structuredClone(value));
    },
    async delete(key) { for (const item of Array.isArray(key) ? key : [key]) entries.delete(item); },
    async list({ prefix = "" } = {}) {
      return new Map([...entries].filter(([key]) => key.startsWith(prefix)).map(([k, v]) => [k, structuredClone(v)]));
    },
    async transaction(fn) { return fn(storage); },
  };
  return { entries, sockets, context:{ blockConcurrencyWhile() {}, getWebSockets:() => sockets, storage } };
}
const socketFor = memory => {
  let attachment = null;
  const ws = { frames:[], raw:[],
    send(frame) { ws.raw.push(frame); ws.frames.push(JSON.parse(frame)); },
    serializeAttachment(value) { attachment = structuredClone(value); },
    deserializeAttachment() { return attachment; }, close() {} };
  memory.sockets.push(ws);
  return ws;
};
const GM_TOKEN = "gm-token-for-photo-desk";
const DEVICES = { gm:"device-gm-photo-0001", alex:"device-alex-photo-0002", blake:"device-blake-photo-0003",
  tv:"device-tv-photo-0004", stranger:"device-stranger-photo-0005" };
let seq = 0;
async function deskWith(preload = {}, env = {}) {
  const memory = memoryContext();
  for (const [key, value] of Object.entries(preload)) memory.entries.set(key, value);
  memory.entries.set("gmToken", GM_TOKEN);
  const tournament = new Tournament(memory.context, { APP_ENV:"local", PROGRESS_RESET_ENABLED:"true", ...env });
  await tournament.hydrateFromStorage();
  tournament.gmToken = GM_TOKEN;
  const sockets = { gm:socketFor(memory), alex:socketFor(memory), blake:socketFor(memory), tv:socketFor(memory) };
  const say = async (who, type, payload = {}, { asGm = false } = {}) => {
    const actionId = `p${++seq}`;
    await tournament.webSocketMessage(sockets[who], JSON.stringify({ actionId, type, payload, deviceId:DEVICES[who],
      ...(asGm ? { gmToken:GM_TOKEN } : {}) }));
    return sockets[who].frames.find(frame => frame.type === "ack" && frame.actionId === actionId);
  };
  await say("gm", "hello", {}, { asGm:true });
  await say("gm", "claim", { player:HOST });
  await say("alex", "hello");
  await say("alex", "claim", { player:ALEX });
  await say("blake", "hello");
  await say("blake", "claim", { player:BLAKE });
  await say("tv", "hello", { view:"tv" });
  const call = (path, { method = "GET", device = null, gm = false, body, headers = {} } = {}) =>
    tournament.fetch(new Request(`http://field.day${path}`, { method, body, headers:{
      ...(device ? { "X-Field-Day-Device":DEVICES[device] || device } : {}),
      ...(gm ? { Authorization:`Bearer ${GM_TOKEN}` } : {}), ...headers } }));
  const upload = (device, { photo = fakeJpeg(), thumb = fakeJpeg({ width:480, height:360 }), type = "image/jpeg",
    takenAt = null, headers = {} } = {}) => {
    const form = new FormData();
    form.append("photo", new Blob([photo], { type }), "photo.jpg");
    form.append("thumb", new Blob([thumb], { type:"image/jpeg" }), "thumb.jpg");
    if (takenAt) form.append("takenAt", String(takenAt));
    return call("/api/moments", { method:"POST", device, body:form, headers });
  };
  const lastState = who => sockets[who].frames.filter(frame => frame.type === "state").at(-1);
  return { memory, tournament, sockets, say, call, upload, lastState };
}
const record = (id, by, extra = {}) => ({ id, by, at:1_700_000_000_000, takenAt:1_700_000_000_000, w:1600, h:1200,
  bytes:300_000, thumbBytes:30_000, ...extra });
const ids = n => Array.from({ length:n }, (_, i) => `mseed${String(i).padStart(8, "0")}`);

/* ── the JPEG reader ── */
test("the server reads a JPEG's real size and strips EXIF, IPTC and comments", () => {
  const jpeg = fakeJpeg({ width:1200, height:1600 });
  assert.deepEqual(jpegInfo(jpeg), { width:1200, height:1600 });
  assert.match(text(jpeg), /GPS 33\.4942N/);
  const clean = stripJpegMetadata(jpeg);
  assert.ok(clean.byteLength < jpeg.byteLength);
  assert.doesNotMatch(text(clean), /GPS|Exif|iPhone|a comment/, "no location, device or comment survives");
  assert.match(text(clean), /JFIF/, "the image's own segments stay");
  assert.deepEqual(jpegInfo(clean), { width:1200, height:1600 });
  assert.deepEqual([...clean.slice(-2)], [0xFF, 0xD9], "the scan and its end marker are untouched");
  for (const bad of [new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    new Uint8Array([0xFF, 0xD8, 0xFF, 0xD9, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), jpeg.slice(0, 40), new Uint8Array(0)]) {
    assert.equal(jpegInfo(bad), null);
    assert.equal(stripJpegMetadata(bad), null);
  }
});

test("the index is cleaned, capped per desk, per byte and per player", () => {
  const clean = cleanMomentIndex([record("mbbbbbbbbbbb", ALEX, { at:2 }), { id:"bad", by:ALEX }, null,
    record("maaaaaaaaaaa", BLAKE, { at:5, deviceId:"leak", hidden:true, hiddenAt:9 }), record("mbbbbbbbbbbb", ALEX)]);
  assert.deepEqual(clean.map(item => item.id), ["maaaaaaaaaaa", "mbbbbbbbbbbb"], "newest first, unique, valid ids");
  assert.ok(!("deviceId" in clean[0]));
  assert.equal(admitMoment([], { by:ALEX, bytes:1, thumbBytes:1 }).ok, true);
  assert.equal(admitMoment(ids(MOMENT_LIMITS.count).map(id => record(id, BLAKE)), { by:ALEX, bytes:1, thumbBytes:1 }).error,
    "The photo desk is full");
  assert.equal(admitMoment([record("mcccccccccccc", BLAKE, { bytes:MOMENT_LIMITS.totalBytes - 10 })],
    { by:ALEX, bytes:20, thumbBytes:0 }).error, "The photo desk is full");
  assert.equal(admitMoment(ids(MOMENT_LIMITS.perPlayer).map(id => record(id, ALEX)), { by:ALEX, bytes:1, thumbBytes:1 }).error,
    `You have ${MOMENT_LIMITS.perPlayer} photos up. Delete one first`);
  const now = 1_800_000_000_000;
  assert.equal(clampTakenAt(now + 5000, now), now, "never in the future");
  assert.equal(clampTakenAt(1, now), now - MOMENT_LIMITS.takenAtFloorMs, "never ancient");
  assert.equal(clampTakenAt("nope", now), now);
});

test("frames carry only public records: no device ids or byte counts, hidden only for the commissioner", () => {
  const index = cleanMomentIndex([record("maaaaaaaaaaa", ALEX), record("mbbbbbbbbbbb", BLAKE, { at:1, hidden:true })]);
  const guest = publicState(structuredClone(EMPTY_STATE), { isGm:false, player:ALEX }, { moments:index });
  assert.deepEqual(guest.moments, [{ id:"maaaaaaaaaaa", by:ALEX, at:1_700_000_000_000, takenAt:1_700_000_000_000, w:1600, h:1200 }]);
  const gm = publicState(structuredClone(EMPTY_STATE), { isGm:true, player:HOST }, { moments:index });
  assert.deepEqual(gm.moments.map(item => [item.id, !!item.hidden]), [["maaaaaaaaaaa", false], ["mbbbbbbbbbbb", true]]);
  assert.ok(!JSON.stringify(gm).includes("hiddenAt") && !JSON.stringify(gm).includes("bytes"));
  const empty = publicState(structuredClone(EMPTY_STATE), { isGm:false, player:null }, { moments:[] });
  assert.ok(!("moments" in empty), "an empty desk adds nothing to a frame");
  assert.equal(publicMoments(index).length, 1);
});

/* ── the HTTP surface ── */
test("an upload needs a claimed device, a JPEG, and the size caps", async () => {
  const desk = await deskWith();
  let response = await desk.upload(null);
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, "Check in first");
  response = await desk.upload("stranger");
  assert.equal(response.status, 403, "an unclaimed device cannot add");

  response = await desk.upload("alex", { type:"image/png" });
  assert.equal(response.status, 400, "only JPEG");
  response = await desk.upload("alex", { photo:new Uint8Array(4000).fill(7) });
  assert.equal(response.status, 400, "a body that is not a JPEG is refused whatever its type says");
  response = await desk.upload("alex", { photo:fakeJpeg({ width:5000, height:3000 }) });
  assert.equal(response.status, 400, "no side past the cap");
  const huge = new Uint8Array(MOMENT_LIMITS.fullBytes + 10);
  huge.set(fakeJpeg());
  response = await desk.upload("alex", { photo:huge });
  assert.equal(response.status, 413);
  response = await desk.upload("alex", { headers:{ "Content-Length":String(MOMENT_LIMITS.bodyBytes + 1) } });
  assert.equal(response.status, 413, "a declared oversize body is refused before it is read");
  assert.equal(desk.tournament.momentDesk.index.length, 0);
  assert.ok(![...desk.memory.entries.keys()].some(key => key.startsWith("moment:full:")), "nothing stored");
});

test("a photo lands stripped, in its own keys, and every screen gets its public record", async () => {
  const desk = await deskWith();
  const versionBefore = desk.tournament.version;
  const response = await desk.upload("alex", { takenAt:Date.now() - 60_000 });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  const { id } = body.moment;
  assert.deepEqual(Object.keys(body.moment).sort(), ["at", "by", "h", "id", "takenAt", "w"]);
  assert.equal(body.moment.by, ALEX);
  assert.deepEqual([body.moment.w, body.moment.h], [1600, 1200], "the size is the server's own reading");

  const stored = desk.memory.entries.get(momentFullKey(id));
  assert.ok(stored instanceof Uint8Array);
  assert.doesNotMatch(text(stored), /GPS|Exif/);
  assert.ok(desk.memory.entries.get(momentThumbKey(id)) instanceof Uint8Array);
  assert.deepEqual(desk.memory.entries.get(MOMENT_INDEX_KEY).map(item => item.id), [id]);
  assert.ok(!("moments" in (desk.memory.entries.get("state") || {})), "never in the tournament state");
  assert.equal(desk.tournament.version, versionBefore, "a photo is not a tournament write");

  for (const who of ["gm", "alex", "blake", "tv"]) {
    const frame = desk.lastState(who);
    assert.equal(frame.lastAction, "moments");
    assert.deepEqual(frame.state.moments.map(item => item.id), [id], `${who} sees it`);
  }
  for (const who of ["gm", "alex", "blake", "tv"])
    for (const raw of desk.sockets[who].raw)
      for (const device of Object.values(DEVICES)) assert.ok(!raw.includes(device), "no frame carries a device id");

  const photo = await desk.call(`/api/moments/${id}`);
  assert.equal(photo.status, 200);
  assert.equal(photo.headers.get("Content-Type"), "image/jpeg");
  assert.match(photo.headers.get("Cache-Control"), /immutable/);
  assert.doesNotMatch(text(new Uint8Array(await photo.arrayBuffer())), /GPS/);
  assert.equal((await desk.call(`/api/moments/${id}/thumb`)).status, 200);
  assert.equal((await desk.call("/api/moments/mnotarealphoto1")).status, 404);
  assert.equal((await desk.call("/api/moments/../state")).status, 404);

  /* a reconnect's hello carries the desk too */
  await desk.say("blake", "hello");
  assert.deepEqual(desk.lastState("blake").state.moments.map(item => item.id), [id]);
  /* a fresh instance (eviction) reads the index back */
  const again = new Tournament(desk.memory.context, { APP_ENV:"local" });
  await again.hydrateFromStorage();
  assert.deepEqual(again.momentDesk.index.map(item => item.id), [id]);
});

test("uploads are rate limited per player and capped per desk", async () => {
  const desk = await deskWith();
  for (let i = 0; i < MOMENT_LIMITS.ratePerWindow; i++)
    assert.equal((await desk.upload("alex")).status, 200, `upload ${i + 1}`);
  const limited = await desk.upload("alex");
  assert.equal(limited.status, 429);
  assert.equal((await limited.json()).error, "Wait a minute, then add more");
  assert.equal((await desk.upload("blake")).status, 200, "another player has their own window");

  const full = await deskWith({ [MOMENT_INDEX_KEY]:ids(MOMENT_LIMITS.count).map(id => record(id, BLAKE)) });
  const refused = await full.upload("alex");
  assert.equal(refused.status, 409);
  assert.equal((await refused.json()).error, "The photo desk is full");
  const mine = await deskWith({ [MOMENT_INDEX_KEY]:ids(MOMENT_LIMITS.perPlayer).map(id => record(id, ALEX)) });
  assert.equal((await mine.upload("alex")).status, 409);
  assert.equal((await mine.upload("blake")).status, 200);
});

test("guests delete their own; the commissioner hides, shows and deletes any", async () => {
  const desk = await deskWith();
  const first = (await (await desk.upload("alex")).json()).moment.id;
  const second = (await (await desk.upload("alex")).json()).moment.id;

  let response = await desk.call(`/api/moments/${first}`, { method:"DELETE", device:"blake" });
  assert.equal(response.status, 403, "not someone else's");
  response = await desk.call(`/api/moments/${first}`, { method:"POST", device:"alex",
    body:JSON.stringify({ hidden:true }), headers:{ "Content-Type":"application/json" } });
  assert.equal(response.status, 403, "a guest cannot hide");

  response = await desk.call(`/api/moments/${first}`, { method:"POST", gm:true,
    body:JSON.stringify({ hidden:true }), headers:{ "Content-Type":"application/json" } });
  assert.equal((await response.json()).ok, true);
  assert.deepEqual(desk.lastState("alex").state.moments.map(item => item.id), [second], "gone from guests");
  assert.deepEqual(desk.lastState("tv").state.moments.map(item => item.id), [second], "gone from the TV");
  assert.deepEqual(desk.lastState("gm").state.moments.map(item => [item.id, !!item.hidden]),
    [[second, false], [first, true]], "the commissioner still sees it, marked");
  assert.equal((await desk.call(`/api/moments/${first}`)).status, 404, "its bytes are not public");
  const asGm = await desk.call(`/api/moments/${first}/thumb`, { gm:true });
  assert.equal(asGm.status, 200);
  assert.equal(asGm.headers.get("Cache-Control"), "no-store");
  response = await desk.call(`/api/moments/${first}`, { method:"POST", gm:true,
    body:JSON.stringify({ hidden:true }), headers:{ "Content-Type":"application/json" } });
  assert.equal((await response.json()).unchanged, true, "a retry is a no-op");
  response = await desk.call(`/api/moments/${first}`, { method:"POST", gm:true,
    body:JSON.stringify({ hidden:false }), headers:{ "Content-Type":"application/json" } });
  assert.deepEqual(desk.lastState("alex").state.moments.map(item => item.id).sort(), [first, second].sort());

  response = await desk.call(`/api/moments/${second}`, { method:"DELETE", device:"alex" });
  assert.equal((await response.json()).ok, true, "the author deletes their own");
  assert.ok(!desk.memory.entries.has(momentFullKey(second)) && !desk.memory.entries.has(momentThumbKey(second)));
  response = await desk.call(`/api/moments/${second}`, { method:"DELETE", device:"alex" });
  assert.equal((await response.json()).unchanged, true, "a second tap is already done");
  response = await desk.call(`/api/moments/${first}`, { method:"DELETE", gm:true });
  assert.equal((await response.json()).ok, true, "the commissioner deletes anyone's");
  assert.deepEqual(desk.tournament.momentDesk.index, []);
  assert.ok(!("moments" in desk.lastState("gm").state), "an empty desk leaves the frame");
});

test("photos stay out of snapshots and backups, and survive a restore and a reset", async () => {
  const desk = await deskWith();
  const id = (await (await desk.upload("alex")).json()).moment.id;
  for (const key of [MOMENT_INDEX_KEY, momentFullKey(id), momentThumbKey(id)])
    assert.equal(isPortableStorageKey(key), false, `${key} is not portable`);
  const snapshot = await desk.tournament.createSnapshot();
  assert.ok(!snapshot.entries.some(entry => entry.key.startsWith("moment:")), "never in a snapshot");
  assert.equal(validateSnapshot(snapshot).ok, true);
  const smuggled = structuredClone(snapshot);
  smuggled.entries.push({ key:momentFullKey(id), value:"x" });
  assert.equal(validateSnapshot(smuggled).ok, false, "an import cannot write one");

  /* a reset makes its rotating backup without them and leaves them alone */
  const reset = await desk.say("gm", "resetTournament", { confirm:RESET_PROGRESS_CONFIRMATION }, { asGm:true });
  assert.equal(reset.ok, true, reset.error);
  {
    const backupKeys = [...desk.memory.entries.keys()].filter(key => key.startsWith(INTERNAL_RESET_BACKUP_PREFIX));
    assert.ok(backupKeys.length > 0);
    for (const key of backupKeys) assert.ok(!JSON.stringify(desk.memory.entries.get(key)).includes(id));
  }
  await desk.tournament.persist(desk.tournament.state, { backupPrefix:INTERNAL_RESET_BACKUP_PREFIX });
  for (const [key, value] of desk.memory.entries)
    if (key.startsWith(INTERNAL_RESET_BACKUP_PREFIX)) assert.ok(!(value instanceof Uint8Array), "no photo bytes in a backup");

  /* a restore replaces the portable keys only */
  await desk.tournament.restoreValidatedSnapshot(snapshot, validateSnapshot(snapshot));
  assert.ok(desk.memory.entries.has(momentFullKey(id)));
  assert.deepEqual(desk.tournament.momentDesk.index.map(item => item.id), [id]);

  /* the export: every record and its bytes, for the commissioner only */
  assert.equal((await desk.call("/api/admin/moments")).status, 403);
  const listed = await (await desk.call("/api/admin/moments", { gm:true })).json();
  assert.deepEqual(listed.moments.map(item => item.id), [id]);
  assert.equal(listed.count, 1);
  const bytes = await desk.call(`/api/admin/moments/${id}`, { gm:true });
  assert.equal(bytes.status, 200);
  assert.equal(bytes.headers.get("Cache-Control"), "no-store");
});

/* ── the pure model ── */
test("the phone model: visible, desk order, delete rights, fit and batch lines", () => {
  const state = { moments:[
    { id:"maaaaaaaaaaa", by:ALEX, at:1, w:1200, h:1600 },
    { id:"mbbbbbbbbbbb", by:BLAKE, at:3, w:1600, h:1200, hidden:true },
    { id:"mcccccccccccc", by:BLAKE, at:2, w:1600, h:1600 },
    { id:"bad", by:ALEX, at:9 },
  ] };
  assert.deepEqual(visibleMoments(state).map(item => item.id), ["mcccccccccccc", "maaaaaaaaaaa"]);
  assert.deepEqual(deskMoments(state, { gm:true }).map(item => item.id), ["mbbbbbbbbbbb", "mcccccccccccc", "maaaaaaaaaaa"]);
  assert.deepEqual(deskMoments(state).map(item => item.id), ["mcccccccccccc", "maaaaaaaaaaa"]);
  assert.equal(canDeleteMoment(state.moments[0], { me:ALEX }), true);
  assert.equal(canDeleteMoment(state.moments[0], { me:BLAKE }), false);
  assert.equal(canDeleteMoment(state.moments[0], { gm:true }), true);
  assert.equal(photoFit({ w:1600, h:1200 }), "cover");
  assert.equal(photoFit({ w:1200, h:1600 }), "contain");
  assert.equal(photoFit({ w:1600, h:1600 }), "contain");
  assert.deepEqual(fitSide(4032, 3024, 1600), { width:1600, height:1200 });
  assert.deepEqual(fitSide(3024, 4032, 1600), { width:1200, height:1600 });
  assert.deepEqual(fitSide(800, 600, 1600), { width:800, height:600 }, "never enlarged");
  assert.equal(batchLine({ added:3 }), "3 photos added");
  assert.equal(batchLine({ added:1 }), "1 photo added");
  assert.equal(batchLine({ added:2, failed:1, error:"The photo desk is full" }), "2 added. 1 not added: The photo desk is full");
  assert.equal(batchLine({ added:10, skipped:2 }), `10 photos added. ${PHOTO_PREP.perBatch} at a time`);
  assert.equal(batchLine({}), "");
});

test("the TV takes photo turns only in an ambient gap, on the server clock", () => {
  assert.equal(tvPhotoGap({}), true);
  for (const blocker of ["loading", "final", "directed", "result", "poker", "draft", "live", "intro", "reveal", "faceOff"])
    assert.equal(tvPhotoGap({ [blocker]:true }), false, `${blocker} holds the photos`);
  assert.deepEqual(withPhotoTurns(["board", "next"], 0), ["board", "next"], "no photos, no turn");
  assert.deepEqual(withPhotoTurns(["board", "next"], 3), ["board", "next", "photos"]);
  assert.deepEqual(withPhotoTurns(["board", "next", "latest", "book"], 9), ["board", "next", "photos", "latest", "book", "photos"],
    "a busy desk gets a second turn");
  const many = { moments:Array.from({ length:40 }, (_, i) => ({ id:`m${String(i).padStart(11, "0")}`, by:ALEX, at:i })) };
  const rotation = tvPhotoRotation(many);
  assert.equal(rotation.length, TV_PHOTO_RECENT);
  assert.equal(rotation[0].at, 39, "newest first");
  const at = tvPhotoAt(rotation, TV_PHOTO_MS * 3 + 10);
  assert.equal(at.index, 3);
  assert.equal(at.next, rotation[4]);
  assert.equal(tvPhotoAt(rotation, TV_PHOTO_MS * 3 + 5999).moment.id, at.moment.id, "every TV agrees within a turn");
  assert.equal(tvPhotoAt([], 0), null);
});

/* ── client transport and the batch ── */
test("the upload sends the device, both files and the time, and aborts at 20 seconds", async t => {
  const timers = [];
  t.mock.method(globalThis, "setTimeout", (callback, delay) => { const timer = { callback, delay }; timers.push(timer); return timer; });
  t.mock.method(globalThis, "clearTimeout", () => {});
  let sent;
  t.mock.method(globalThis, "fetch", (url, options) => {
    sent = { url, ...options };
    return new Promise((_resolve, reject) => options.signal.addEventListener("abort",
      () => reject(new DOMException("Aborted", "AbortError")), { once:true }));
  });
  const pending = uploadMoment({ photo:new Blob([fakeJpeg()], { type:"image/jpeg" }),
    thumb:new Blob([fakeJpeg()], { type:"image/jpeg" }), takenAt:123 });
  assert.equal(sent.url, "/api/moments");
  assert.equal(sent.method, "POST");
  assert.ok(sent.headers["X-Field-Day-Device"]);
  assert.ok(sent.body.get("photo") && sent.body.get("thumb"));
  assert.equal(sent.body.get("takenAt"), "123");
  assert.equal(timers[0].delay, 20000);
  timers[0].callback();
  assert.deepEqual(await pending, { ok:false, error:"Upload timed out. Try again." });
});

/* ── rendered ── */
const root = fileURLToPath(new URL("../", import.meta.url));
const compiled = await build({
  stdin:{ contents:`export { TVMode } from "./src/features/tv/TVMode.jsx";
    export { Guide } from "./src/features/weekend/Guide.jsx";
    export { PhotoGrid, PhotoViewer } from "./src/features/photos/PhotoGrid.jsx";
    export { PhotoDesk, sendBatch } from "./src/features/photos/PhotoDesk.jsx";
    export { TVPhotoCard } from "./src/features/photos/TVPhotoCard.jsx";
    export { PlayerIdentityProvider } from "./src/features/identity/PlayerIdentityContext.js";`,
    resolveDir:root, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react", "qrcode-generator", "three"], loader:{ ".css":"empty" },
  write:false, logLevel:"silent",
});
const mod = new Module(fileURLToPath(new URL("photo-desk.cjs", import.meta.url)));
mod.filename = mod.id;
mod.paths = Module._nodeModulePaths(root);
mod._compile(compiled.outputFiles[0].text, mod.filename);
const { TVMode, Guide, PhotoGrid, PhotoDesk, sendBatch, TVPhotoCard, PlayerIdentityProvider } = mod.exports;

const photoState = () => {
  const state = structuredClone(EMPTY_STATE);
  state.profiles = { [ALEX]:{ display:"Alex", num:7, color:"#2F7E83" }, [BLAKE]:{ display:"Blake", num:9 } };
  state.moments = [
    { id:"maaaaaaaaaaa", by:ALEX, at:3, takenAt:3, w:1600, h:1200 },
    { id:"mbbbbbbbbbbb", by:BLAKE, at:2, takenAt:2, w:1200, h:1600 },
  ];
  return state;
};
const inIdentity = (state, element) => renderToStaticMarkup(
  React.createElement(PlayerIdentityProvider, { profiles:state.profiles }, element));

test("Weekend > Photos: the grid for everyone, Add only for a checked-in guest", () => {
  const state = photoState();
  const events = allEventsOf(state);
  const html = inIdentity(state, React.createElement(Guide, { events, state, me:ALEX }));
  assert.match(html, /id="fd-program-photos"/, "photos are part of the program, no tab to find");
  assert.match(html, /aria-label="All 2 photos"/);
  assert.match(html, />Add</);
  assert.match(html, /accept="image\/\*"/);
  assert.equal((html.match(/class="fd-photo-tile"/g) || []).length, 2);
  assert.match(html, /aria-label="Photo by Alex"/);
  assert.match(html, /src="\/api\/moments\/maaaaaaaaaaa\/thumb"/, "the grid loads thumbnails");
  const desk = inIdentity(state, React.createElement(PhotoDesk, { state, me:ALEX }));
  assert.match(desk, /2 photos/);
  assert.match(desk, />Add photos</);
  const visitor = inIdentity(state, React.createElement(PhotoDesk, { state, me:null }));
  assert.ok(!visitor.includes("Add photos"), "no claim, no add");
  const first = inIdentity(EMPTY_STATE, React.createElement(Guide, { events, state:EMPTY_STATE, me:ALEX }));
  assert.match(first, /class="fd-program-first-photo"/, "no photos yet: one way to add the first");
  const nobody = inIdentity(EMPTY_STATE, React.createElement(Guide, { events, state:EMPTY_STATE, me:null }));
  assert.ok(!nobody.includes("fd-program-photos"), "nothing to see and nothing to add: no section");
  const empty = inIdentity(EMPTY_STATE, React.createElement(PhotoDesk, { state:EMPTY_STATE, me:ALEX }));
  assert.match(empty, /No photos yet/);
  const limited = inIdentity(state, React.createElement(PhotoGrid, { state, limit:1 }));
  assert.equal((limited.match(/class="fd-photo-tile"/g) || []).length, 1, "a limit trims the grid for other surfaces");
});

test("a batch goes up one at a time, stops on a full desk, and never takes more than ten", async () => {
  const sent = [];
  const tally = await sendBatch(Array.from({ length:12 }, (_, i) => ({ name:`p${i}` })), {
    prepare:async file => ({ file }),
    upload:async ({ file }) => { sent.push(file.name); return sent.length < 4 ? { ok:true } : { ok:false, status:409, error:"The photo desk is full" }; },
  });
  assert.deepEqual(sent, ["p0", "p1", "p2", "p3"]);
  assert.deepEqual(tally, { added:3, failed:7, error:"The photo desk is full", skipped:2 });
  const broken = await sendBatch([{}, {}], { prepare:async () => { throw new Error("That photo could not be opened"); },
    upload:async () => ({ ok:true }) });
  assert.deepEqual(broken, { added:0, failed:2, error:"That photo could not be opened", skipped:0 });
});

test("the TV shows photos full width with the author's chip, and only in a gap", t => {
  /* the server renderer's layout-effect notice, once per TV render */
  const error = console.error;
  t.mock.method(console, "error", (...args) => { if (!String(args[0]).includes("useLayoutEffect")) error(...args); });
  const state = photoState();
  const card = inIdentity(state, React.createElement(TVPhotoCard, { state, list:visibleMoments(state), now:0 }));
  assert.match(card, /class="tv-photo-layer is-cover"/);
  assert.match(card, /src="\/api\/moments\/maaaaaaaaaaa"/, "the TV shows the full photo");
  assert.match(card, /class="tv-photo-name">Alex</);
  const portrait = inIdentity(state, React.createElement(TVPhotoCard, { state, list:visibleMoments(state), now:TV_PHOTO_MS }));
  assert.match(portrait, /class="tv-photo-layer is-contain"/, "a portrait stands whole");

  const events = allEventsOf(state);
  const standings = computeStandings(state);
  const render = (s, now) => inIdentity(s, React.createElement(TVMode, { state:s, events:allEventsOf(s),
    standings:computeStandings(s), allTied:false, onDeckEv:null, champion:null, coChamps:[], showControlEnabled:false,
    connection:{ ready:true, connected:true, version:3 }, now, onExit:() => {} }));
  const turns = Array.from({ length:12 }, (_, i) => render(state, i * 12000 + 100));
  assert.ok(turns.some(html => html.includes("tv-photos")), "an ambient turn is a photo");
  assert.ok(turns.some(html => !html.includes("tv-photos")), "and the other cards keep theirs");

  /* an open market: the live board, never a photo */
  const live = photoState();
  const gm = { isGm:true, player:HOST, deviceId:"gm", actionId:"a1" };
  assert.equal(applyAction(live, "announceEvent", { evId:events[0].id }, gm).ok, true);
  const liveTurns = Array.from({ length:12 }, (_, i) => render(live, i * 12000 + 100));
  assert.ok(liveTurns.every(html => !html.includes("tv-photos")), "never over a live event");

  /* hidden photos never reach a TV, even a commissioner's */
  const hidden = photoState();
  hidden.moments = hidden.moments.map(item => ({ ...item, hidden:true }));
  assert.ok(Array.from({ length:12 }, (_, i) => render(hidden, i * 12000 + 100)).every(html => !html.includes("tv-photos")));
  assert.ok(standings.length && events.length);
});
