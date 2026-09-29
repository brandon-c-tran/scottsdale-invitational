import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

/* A10 pocket alerts. Crypto against the RFC 8291 example, the VAPID JWT,
   which writes alert whom, dedupe, foreground skip, capability gating,
   storage privacy and dead-subscription cleanup. Everything runs in
   memory; no push service is contacted. */
globalThis.__FD_BUILD_ID__ = "build-test";

const {
  EMPTY_STATE, ROSTER, BUILTIN_EVENTS, allEventsOf, defaultQaParticipants, draftTurn, makeBracket,
  resolveCurrentContest,
} = await import("../shared/core.js");
const { applyAction, confirmStart } = await import("./support/confirmed-start.mjs");
const push = await import("../worker/push.js");
const { alertsFor, liveContest } = await import("../worker/pushAlerts.js");
const { Tournament } = await import("../worker/tournament.js");
const { validateSnapshot } = await import("../worker/snapshot.js");
const alerts = await import("../src/features/alerts/pocketAlerts.js");

const { b64uDecode, b64uEncode, encryptPayload } = push;
const enc = new TextEncoder(), dec = new TextDecoder();

/* ── keys and the receiving side ── */
const pointToJwk = (point, d) => ({ kty:"EC", crv:"P-256", x:b64uEncode(point.slice(1, 33)),
  y:b64uEncode(point.slice(33, 65)), ...(d ? { d } : {}) });
async function vapidPair() {
  const pair = await crypto.subtle.generateKey({ name:"ECDSA", namedCurve:"P-256" }, true, ["sign", "verify"]);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  return { publicKey:b64uEncode(raw), privateKey:jwk.d };
}
/* a browser's subscription: its ECDH pair and auth secret */
async function browserKeys() {
  const pair = await crypto.subtle.generateKey({ name:"ECDH", namedCurve:"P-256" }, true, ["deriveBits"]);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return { privateKey:pair.privateKey, p256dh:b64uEncode(raw), auth:b64uEncode(auth) };
}
const hkdf = async (salt, ikm, info, length) => new Uint8Array(await crypto.subtle.deriveBits(
  { name:"HKDF", hash:"SHA-256", salt, info }, await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]), length * 8));
/* RFC 8291 section 3.4 from the user agent's side */
async function decrypt(body, { privateKey, p256dh, auth }) {
  const salt = body.slice(0, 16), idlen = body[20], keyid = body.slice(21, 21 + idlen);
  assert.equal(new DataView(body.buffer, body.byteOffset).getUint32(16), 4096);
  const asKey = await crypto.subtle.importKey("raw", keyid, { name:"ECDH", namedCurve:"P-256" }, false, []);
  const secret = new Uint8Array(await crypto.subtle.deriveBits({ name:"ECDH", public:asKey }, privateKey, 256));
  const ua = b64uDecode(p256dh);
  const info = new Uint8Array([...enc.encode("WebPush: info\0"), ...ua, ...keyid]);
  const ikm = await hkdf(b64uDecode(auth), secret, info, 32);
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name:"AES-GCM", iv:nonce },
    await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]), body.slice(21 + idlen)));
  let end = plain.length - 1;
  while (end >= 0 && plain[end] === 0) end--;
  assert.equal(plain[end], 2, "last record delimiter");
  return dec.decode(plain.slice(0, end));
}

/* ── RFC 8291 Appendix A / section 5 ── */
const RFC = {
  plaintext:"V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24",
  asPublic:"BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  asPrivate:"yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  uaPublic:"BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  uaPrivate:"q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94",
  salt:"DGv6ra1nlYgDCS1FRnbzlw",
  auth:"BTBZMqHH6r4Tts7J_aSIgg",
  body:"DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
  ciphertext:"8pfeW0KbunFT06SuDKoJH9Ql87S1QUrdirN6GcG7sFz1y1sqLgVi1VhjVkHsUoEsbI_0LpXMuGvnzQ",
};

test("encryption reproduces the RFC 8291 example byte for byte", async () => {
  const asPublic = b64uDecode(RFC.asPublic);
  const privateKey = await crypto.subtle.importKey("jwk", pointToJwk(asPublic, RFC.asPrivate),
    { name:"ECDH", namedCurve:"P-256" }, false, ["deriveBits"]);
  const body = await encryptPayload(b64uDecode(RFC.plaintext), { p256dh:RFC.uaPublic, auth:RFC.auth },
    { salt:b64uDecode(RFC.salt), localKeys:{ publicKey:asPublic, privateKey } });
  assert.equal(b64uEncode(body), RFC.body);
  assert.equal(body.length - 86, b64uDecode(RFC.ciphertext).length, "86-octet header");
  assert.deepEqual(body.slice(86), b64uDecode(RFC.ciphertext));

  /* and the user agent's side of the same example opens it */
  const uaPrivate = await crypto.subtle.importKey("jwk", pointToJwk(b64uDecode(RFC.uaPublic), RFC.uaPrivate),
    { name:"ECDH", namedCurve:"P-256" }, false, ["deriveBits"]);
  assert.equal(await decrypt(b64uDecode(RFC.body), { privateKey:uaPrivate, p256dh:RFC.uaPublic, auth:RFC.auth }),
    "When I grow up, I want to be a watermelon");
});

test("a fresh message uses a new salt and key each time and still opens", async () => {
  const browser = await browserKeys();
  const message = JSON.stringify({ title:"You’re playing", body:"Cornhole · Semifinal 1 vs Evan & Ben" });
  const [one, two] = [await encryptPayload(message, browser), await encryptPayload(message, browser)];
  assert.notDeepEqual(one.slice(0, 16), two.slice(0, 16), "salt");
  assert.notDeepEqual(one.slice(21, 86), two.slice(21, 86), "server key");
  assert.equal(await decrypt(one, browser), message);
  assert.equal(await decrypt(two, browser), message);
  await assert.rejects(encryptPayload("x".repeat(4000), browser), /too large/);
});

test("the VAPID JWT is ES256, audience-scoped, short-lived, and verifies with the public key", async () => {
  const keys = await vapidPair();
  const config = push.vapidConfig({ VAPID_PUBLIC_KEY:keys.publicKey, VAPID_PRIVATE_KEY:keys.privateKey,
    VAPID_SUBJECT:"https://fielddayseries.com" });
  assert.ok(config);
  const now = 1_800_000_000_000;
  const endpoint = "https://web.push.apple.com/QGuQyavXutnMH9lWzGNkGmBQ7c2d4c3r?x=1";
  const header = await push.vapidAuthorization(endpoint, config, now);
  const [, jwt, k] = header.match(/^vapid t=([^,]+), k=(.+)$/);
  assert.equal(k, keys.publicKey);
  const [head, body, signature] = jwt.split(".");
  assert.deepEqual(JSON.parse(dec.decode(b64uDecode(head))), { typ:"JWT", alg:"ES256" });
  const claims = JSON.parse(dec.decode(b64uDecode(body)));
  assert.equal(claims.aud, "https://web.push.apple.com");
  assert.equal(claims.sub, "https://fielddayseries.com");
  assert.ok(claims.exp > now / 1000 && claims.exp <= now / 1000 + 24 * 3600, "exp within 24 hours");
  assert.equal(b64uDecode(signature).length, 64, "raw r||s");
  const verifier = await crypto.subtle.importKey("raw", b64uDecode(keys.publicKey),
    { name:"ECDSA", namedCurve:"P-256" }, false, ["verify"]);
  assert.equal(await crypto.subtle.verify({ name:"ECDSA", hash:"SHA-256" }, verifier,
    b64uDecode(signature), enc.encode(`${head}.${body}`)), true);
  assert.equal(await push.vapidAuthorization(endpoint, config, now + 60_000), header, "reused within its life");
  assert.notEqual(await push.vapidAuthorization("https://fcm.googleapis.com/fcm/send/abc", config, now), header);
});

test("the capability needs a well-formed public key, private key and subject", async () => {
  const keys = await vapidPair();
  const full = { VAPID_PUBLIC_KEY:keys.publicKey, VAPID_PRIVATE_KEY:keys.privateKey, VAPID_SUBJECT:"mailto:ops@example.com" };
  assert.ok(push.pushConfigured(full));
  for (const broken of [
    { ...full, VAPID_PRIVATE_KEY:undefined },
    { ...full, VAPID_PUBLIC_KEY:"" },
    { ...full, VAPID_SUBJECT:undefined },
    { ...full, VAPID_SUBJECT:"ops@example.com" },
    { ...full, VAPID_PUBLIC_KEY:keys.privateKey },
    { ...full, VAPID_PRIVATE_KEY:keys.publicKey },
  ]) assert.equal(push.pushConfigured(broken), false);
});

test("only real push services, well-formed keys and loopback in local are accepted", async () => {
  const browser = await browserKeys();
  const keys = { p256dh:browser.p256dh, auth:browser.auth };
  const ok = endpoint => push.cleanSubscription({ endpoint, keys });
  assert.ok(ok("https://web.push.apple.com/QGuQyavXutnMH9lWzGNkGmBQ7c2d4c3r"));
  assert.ok(ok("https://fcm.googleapis.com/fcm/send/abc:def"));
  assert.ok(ok("https://updates.push.services.mozilla.com/wpush/v2/gAAA"));
  for (const endpoint of ["http://web.push.apple.com/x", "https://evil.example.com/x", "https://push.apple.com.evil.io/x",
    "https://user:pw@web.push.apple.com/x", "http://127.0.0.1:5491/push", "not a url", ""])
    assert.equal(ok(endpoint), null, endpoint);
  assert.ok(push.cleanSubscription({ endpoint:"http://127.0.0.1:5491/push", keys }, { environment:"local" }));
  assert.equal(push.cleanSubscription({ endpoint:"http://127.0.0.1:5491/push", keys }, { environment:"staging" }), null);
  assert.equal(push.cleanSubscription({ endpoint:"https://web.push.apple.com/x", keys:{ ...keys, auth:"AAAA" } }), null);
  assert.equal(push.cleanSubscription({ endpoint:"https://web.push.apple.com/x", keys:{ ...keys, p256dh:keys.auth } }), null);
});

/* ── which writes alert whom ── */
let serial = 0;
const [HOST, P1, P2, P3] = ROSTER;
const gm = () => ({ isGm:true, player:HOST, deviceId:"host", actionId:`host-${++serial}` });
const guest = player => ({ player, deviceId:`device-${player}`, actionId:`g-${++serial}` });
const act = (state, type, payload, ctx = gm()) => {
  const result = applyAction(state, type, payload, ctx);
  assert.equal(result.ok, true, `${type}: ${result.error}`);
  return result;
};
const step = (state, type, payload, ctx = gm()) => {
  const before = structuredClone(state);
  act(state, type, payload, ctx);
  return alertsFor(before, state, { actor:ctx.player });
};
const eventOf = (state, id) => allEventsOf(state).find(ev => ev.id === id);
const contestOf = (state, id) => resolveCurrentContest(state, eventOf(state, id));
const refs = c => ({ contestId:c.id, contestRevision:c.revision });
const bracketState = () => {
  const s = structuredClone(EMPTY_STATE);
  s.draws["8ball"] = { id:"draw-1", teams:Array.from({ length:6 }, (_, key) => ({ name:null,
    players:ROSTER.slice(key * 2, key * 2 + 2) })), ts:1 };
  s.brackets["8ball"] = makeBracket(6);
  return s;
};

test("You're playing: the current contest's players, once, never the actor, not a wide field", () => {
  const s = bracketState();
  const opened = step(s, "announceEvent", { evId:"8ball" });
  const first = contestOf(s, "8ball");
  const expected = first.players.filter(player => player !== HOST).sort();
  assert.deepEqual(opened.map(alert => alert.player).sort(), expected);
  assert.ok(opened.every(alert => alert.reason === "playing" && alert.key === `playing:${alert.player}:${first.id}`));
  const sample = opened[0];
  const own = first.sides.find(side => side.players.includes(sample.player));
  const other = first.sides.find(side => side !== own);
  assert.equal(sample.message.title, "You’re playing");
  assert.equal(sample.message.body, `${eventOf(s, "8ball").name} · ${first.label} vs ${other.players.join(" & ")}`);
  assert.equal(sample.message.url, "/?alert=playing&ev=8ball");
  assert.doesNotMatch(JSON.stringify(opened), /—|!/);

  /* locking and starting the same contest owes nothing new */
  assert.deepEqual(step(s, "lockAndStart", { evId:"8ball", ...refs(first) }), []);
  /* the winner opens the next contest: its players, not the last ones */
  const next = step(s, "recordContestWinner", { evId:"8ball", ...refs(first), winner:first.sides[0].key });
  const second = contestOf(s, "8ball");
  assert.notEqual(second.id, first.id);
  assert.deepEqual(next.map(alert => alert.player).sort(), second.players.filter(player => player !== HOST).sort());
  assert.ok(next.every(alert => alert.key.endsWith(second.id)));

  /* an away player is not told */
  const t = bracketState();
  t.away = { [P2]:true };
  assert.equal(liveContest(t), null, "nothing live before the weekend");
  assert.ok(!step(t, "announceEvent", { evId:"8ball" }).some(alert => alert.player === P2));

  /* a free-for-all with the whole room is not "your match" */
  const wide = structuredClone(EMPTY_STATE);
  assert.deepEqual(step(wide, "announceEvent", { evId:"putt" }), []);
});

test("Your pick: the captain whose turn it became, never the captain who just picked", () => {
  const s = structuredClone(EMPTY_STATE);
  const ev = BUILTIN_EVENTS.find(item => item.id === "bball");
  const players = defaultQaParticipants(ev);
  const captains = players.slice(0, ev.teamCfg.teams);
  const started = step(s, "startDraft", { evId:ev.id, players, captains,
    roles:ROSTER.filter(player => !players.includes(player)).map(player => ({ player, role:"referee" })) });
  const turn = draftTurn(s.drafts[ev.id]);
  assert.deepEqual(started.map(alert => [alert.player, alert.reason]),
    turn.captain === HOST ? [] : [[turn.captain, "pick"]]);
  if (started.length) {
    assert.equal(started[0].message.title, "Your pick");
    assert.equal(started[0].message.body, `${ev.name} draft · Round 1`);
    assert.equal(started[0].key, `pick:${turn.captain}:${turn.draftId}:0`);
  }
  /* each pick hands the turn on; the snake's double turn is the picker's own */
  let doubles = 0;
  while (!draftTurn(s.drafts[ev.id]).complete) {
    const now = draftTurn(s.drafts[ev.id]);
    const got = step(s, "pickDraftPlayer", { evId:ev.id, player:s.drafts[ev.id].pool[0],
      draftId:now.draftId, pickIndex:now.pickIndex, draftRevision:now.draftRevision }, guest(now.captain));
    const after = draftTurn(s.drafts[ev.id]);
    if (after.complete) { assert.deepEqual(got, []); break; }
    if (after.captain === now.captain) { doubles++; assert.deepEqual(got, [], "the picker already knows"); }
    else assert.deepEqual(got.map(alert => alert.player), [after.captain]);
  }
  assert.ok(doubles > 0, "the snake turned");
});

test("A challenge by name alerts its recipient; an open challenge alerts no one", () => {
  const s = { ...structuredClone(EMPTY_STATE), live:true };
  const named = step(s, "sendDuel", { to:P2, game:"quickdraw", stake:200 }, guest(P1));
  assert.equal(named.length, 1);
  assert.equal(named[0].player, P2);
  assert.equal(named[0].message.title, `${P1} challenged you`);
  assert.equal(named[0].message.body, "Quick Draw · 200 chips");
  assert.deepEqual(step(s, "sendDuel", { open:true, game:"quickdraw", stake:100 }, guest(P3)), []);
  assert.deepEqual(alertsFor(s, s), [], "the same board owes nothing");
});

/* ── the Durable Object ── */
function memoryContext() {
  const entries = new Map(), sockets = [], pending = [];
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
  return { entries, sockets, pending,
    context:{ blockConcurrencyWhile() {}, getWebSockets:() => sockets, storage, waitUntil:p => pending.push(p) } };
}
const socketIn = memory => {
  let attachment = null;
  const ws = { raw:[], frames:[],
    send(frame) { ws.raw.push(frame); ws.frames.push(JSON.parse(frame)); },
    serializeAttachment(value) { attachment = structuredClone(value); },
    deserializeAttachment() { return attachment; }, close() {} };
  memory.sockets.push(ws);
  return ws;
};
const GM_TOKEN = "gm-token-for-push-tests";
async function scene({ env = {}, keys } = {}) {
  const memory = memoryContext();
  const vapid = keys || await vapidPair();
  const tournament = new Tournament(memory.context, { APP_ENV:"local", VAPID_PUBLIC_KEY:vapid.publicKey,
    VAPID_PRIVATE_KEY:vapid.privateKey, VAPID_SUBJECT:"https://fielddayseries.com", ...env });
  await tournament.hydrateFromStorage();
  tournament.gmToken = GM_TOKEN;
  const sent = [];
  let respond = () => new Response(null, { status:201 });
  tournament.pushFetch = async (url, init) => { sent.push({ url, init }); return respond(url, init); };
  let seq = 0;
  const say = async (ws, deviceId, message, gmMode = false) => {
    const actionId = `p${++seq}`;
    await tournament.webSocketMessage(ws, JSON.stringify({ actionId, ...message,
      ...(message.type && message.payload !== undefined ? { payload:confirmStart(message.type, message.payload) } : {}),
      deviceId, ...(gmMode ? { gmToken:GM_TOKEN } : {}) }));
    return ws.frames.find(frame => frame.type === "ack" && frame.actionId === actionId);
  };
  const phones = {};
  const phone = async (player, { visible = false, subscribe = true } = {}) => {
    const deviceId = `device-${player}-0000-4000-8000-${String(Object.keys(phones).length).padStart(12, "0")}`;
    const ws = socketIn(memory);
    await say(ws, deviceId, { type:"hello", payload:{ view:"app", visible } });
    await say(ws, deviceId, { type:"claim", payload:{ player } });
    const browser = await browserKeys();
    const endpoint = `https://web.push.apple.com/${player}-${deviceId.slice(-4)}`;
    const ack = subscribe ? await say(ws, deviceId, { type:"pushSubscribe",
      payload:{ endpoint, keys:{ p256dh:browser.p256dh, auth:browser.auth } } }) : null;
    return (phones[player] = { ws, deviceId, browser, endpoint, ack });
  };
  const settle = async () => { while (memory.pending.length) await memory.pending.shift(); };
  return { memory, tournament, sent, say, phone, phones, settle, vapid,
    respondWith:fn => { respond = fn; } };
}

test("a write alerts subscribed, backgrounded players after it persists; the frame carries only the public key", async () => {
  const world = await scene();
  const { tournament, memory, say, phone, sent, settle, phones } = world;
  const host = await phone(HOST, { visible:true });
  Object.assign(tournament.state, { draws:bracketState().draws, brackets:bracketState().brackets });
  const players = ROSTER.slice(0, 12);
  for (const player of players.slice(1)) await phone(player, { visible:player === P3 });
  assert.equal(phones[P1].ack.ok, true, phones[P1].ack.error);
  const frame = host.ws.frames.filter(item => item.type === "state").at(-1);
  assert.equal(frame.capabilities.push, true);
  assert.equal(frame.pushKey, world.vapid.publicKey);

  const ack = await say(host.ws, host.deviceId, { type:"announceEvent", payload:{ evId:"8ball" } }, true);
  assert.equal(ack.ok, true, ack.error);
  await settle();
  const contest = contestOf(tournament.state, "8ball");
  const owed = contest.players.filter(player => player !== HOST && player !== P3);
  assert.deepEqual(sent.map(item => item.url).sort(), owed.map(player => phones[player].endpoint).sort(),
    "the actor and a phone looking at the app are skipped");
  for (const { url, init } of sent) {
    const player = owed.find(item => phones[item].endpoint === url);
    assert.equal(init.headers["Content-Encoding"], "aes128gcm");
    assert.equal(init.headers.TTL, String(push.PUSH_TTL_SECONDS));
    assert.match(init.headers.Authorization, /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=/);
    const message = JSON.parse(await decrypt(init.body, phones[player].browser));
    assert.equal(message.title, "You’re playing");
    assert.equal(message.url, "/?alert=playing&ev=8ball");
  }

  /* nothing private ever reaches a socket or a snapshot */
  const everything = memory.sockets.flatMap(ws => ws.raw).join("\n");
  assert.equal(everything.includes("web.push.apple.com"), false);
  assert.equal(everything.includes(phones[P1].browser.auth), false);
  const snapshot = await tournament.createSnapshot();
  assert.equal(snapshot.entries.some(entry => entry.key.startsWith("private:push")), false);
  assert.equal(validateSnapshot(snapshot).ok, true);
  assert.ok(memory.entries.get(push.PUSH_SUBS_KEY));
  assert.ok(Object.keys(memory.entries.get(push.PUSH_SENT_KEY)).length >= owed.length);

  /* the same transition again (a replay, a correction back) is deduped */
  const before = sent.length;
  await tournament.queueAlerts({ ...structuredClone(EMPTY_STATE) }, tournament.state, HOST);
  await settle();
  assert.equal(sent.length, before);
});

test("a hidden phone gets the alert; one on screen does not, until it goes quiet", async () => {
  const { tournament, say, phone, sent, settle, phones } = await scene();
  await phone(P2, { visible:true });
  /* P2 hides the app: the next challenge reaches the pocket */
  await say(phones[P2].ws, phones[P2].deviceId, { type:"presence", payload:{ visible:false } });
  tournament.state.live = true;
  await phone(P1, { visible:true });
  let ack = await say(phones[P1].ws, phones[P1].deviceId, { type:"sendDuel", payload:{ to:P2, game:"quickdraw", stake:100 } });
  assert.equal(ack.ok, true, ack.error);
  await settle();
  assert.deepEqual(sent.map(item => item.url), [phones[P2].endpoint]);

  /* back on screen: no alert; a foreground that went quiet counts as away */
  await say(phones[P2].ws, phones[P2].deviceId, { type:"ping", payload:{ visible:true } });
  assert.equal(tournament.playerLooking(P2), true);
  assert.equal(tournament.playerLooking(P2, Date.now() + 60_000), false);
  ack = await say(phones[P1].ws, phones[P1].deviceId, { type:"sendDuel", payload:{ to:P3, game:"quickdraw", stake:100 } });
  assert.equal(ack.ok, true);
  await settle();
  assert.equal(sent.length, 1, "P3 has no subscription");
});

test("a gone subscription is forgotten; a failing push service never touches the write", async () => {
  const { tournament, memory, say, phone, sent, settle, phones, respondWith } = await scene();
  tournament.state.live = true;
  await phone(P1, { visible:true, subscribe:false });
  await phone(P2);
  respondWith(() => new Response(null, { status:410 }));
  let ack = await say(phones[P1].ws, phones[P1].deviceId, { type:"sendDuel", payload:{ to:P2, game:"quickdraw", stake:100 } });
  assert.equal(ack.ok, true);
  await settle();
  assert.equal(sent.length, 1);
  assert.equal(Object.values(memory.entries.get(push.PUSH_SUBS_KEY)).some(sub => sub.endpoint === phones[P2].endpoint), false);

  await phone(P3);
  respondWith(() => { throw new Error("network down"); });
  const version = tournament.version;
  const warnings = [];
  const warn = console.warn;
  console.warn = line => warnings.push(line);
  try {
    ack = await say(phones[P1].ws, phones[P1].deviceId, { type:"sendDuel", payload:{ to:P3, game:"quickdraw", stake:100 } });
    await settle();
  } finally { console.warn = warn; }
  assert.equal(ack.ok, true);
  assert.equal(tournament.version, version + 1);
  assert.ok(warnings.some(line => /push-failed/.test(line) && !/web\.push\.apple\.com\/P/.test(line)), "logged by host only");
  assert.ok(Object.values(memory.entries.get(push.PUSH_SUBS_KEY)).some(sub => sub.endpoint === phones[P3].endpoint),
    "a transient failure keeps the subscription");
});

test("subscribing needs a claim, a real endpoint and the capability; unsubscribing always works", async () => {
  const { tournament, memory, say, phones, phone } = await scene();
  const stranger = socketIn(memory);
  const browser = await browserKeys();
  const payload = { endpoint:"https://web.push.apple.com/x1", keys:{ p256dh:browser.p256dh, auth:browser.auth } };
  await say(stranger, "device-unclaimed-0000-4000-8000-000000000099", { type:"hello", payload:{ view:"app" } });
  let ack = await say(stranger, "device-unclaimed-0000-4000-8000-000000000099", { type:"pushSubscribe", payload });
  assert.equal(ack.ok, false);
  assert.match(ack.error, /Check in first/);
  await phone(P1, { subscribe:false });
  ack = await say(phones[P1].ws, phones[P1].deviceId, { type:"pushSubscribe",
    payload:{ ...payload, endpoint:"https://collector.example.com/x" } });
  assert.equal(ack.ok, false);
  ack = await say(phones[P1].ws, phones[P1].deviceId, { type:"pushSubscribe", payload });
  assert.equal(ack.ok, true);
  assert.equal(memory.entries.get(push.PUSH_SUBS_KEY)[phones[P1].deviceId].endpoint, payload.endpoint);
  /* the same endpoint moving to another device leaves one entry */
  await phone(P2, { subscribe:false });
  await say(phones[P2].ws, phones[P2].deviceId, { type:"pushSubscribe", payload });
  assert.deepEqual(Object.keys(memory.entries.get(push.PUSH_SUBS_KEY)), [phones[P2].deviceId]);
  ack = await say(phones[P2].ws, phones[P2].deviceId, { type:"pushUnsubscribe", payload:{ endpoint:payload.endpoint } });
  assert.equal(ack.ok, true);
  assert.deepEqual(memory.entries.get(push.PUSH_SUBS_KEY), {});
  void tournament;

  /* without keys: no capability, no key in the frame, no subscriptions */
  const off = await scene({ env:{ VAPID_PRIVATE_KEY:undefined } });
  const offPhone = await off.phone(P1);
  assert.equal(offPhone.ack.ok, false);
  const frame = offPhone.ws.frames.filter(item => item.type === "state").at(-1);
  assert.equal(frame.capabilities.push, false);
  assert.equal("pushKey" in frame, false);
  off.tournament.state.live = true;
  assert.equal(off.tournament.queueAlerts(EMPTY_STATE, off.tournament.state, null), null);
});

test("QA jumps and resets never alert; ordinary writes are considered", async () => {
  const { tournament, say, phone } = await scene({ env:{ QA_ENABLED:"true", PROGRESS_RESET_ENABLED:"true" } });
  const host = await phone(HOST, { subscribe:false });
  const considered = [];
  const original = tournament.queueAlerts.bind(tournament);
  tournament.queueAlerts = (...args) => { considered.push(args); return original(...args); };
  let ack = await say(host.ws, host.deviceId, { type:"qaAdvance", payload:{ target:"locker" } }, true);
  assert.equal(ack.ok, true, ack.error);
  assert.equal(considered.length, 0);
  ack = await say(host.ws, host.deviceId, { type:"setLive", payload:{ on:true } }, true);
  assert.equal(ack.ok, true, ack.error);
  assert.equal(considered.length, 1);
});

/* ── the device ── */
test("alert routes, the profile row and the Home card", () => {
  assert.deepEqual(alerts.alertRoute("/?alert=pick&ev=bball"), { reason:"pick", ev:"bball" });
  assert.deepEqual(alerts.alertRoute("https://fielddayseries.com/?alert=duel"), { reason:"duel", ev:null });
  assert.equal(alerts.alertRoute("/?alert=wat"), null);
  assert.equal(alerts.alertRoute("/"), null);
  assert.equal(alerts.withoutAlertParams("https://fielddayseries.com/?alert=pick&ev=bball&x=1#h"), "/?x=1#h");
  assert.ok(alerts.sameKey(b64uDecode(RFC.asPublic).buffer, RFC.asPublic));
  assert.equal(alerts.sameKey(b64uDecode(RFC.uaPublic).buffer, RFC.asPublic), false);
  assert.equal(alerts.keyChanged({ options:{ applicationServerKey:b64uDecode(RFC.uaPublic).buffer } }, RFC.asPublic), true);
  assert.equal(alerts.keyChanged({ options:{ applicationServerKey:b64uDecode(RFC.asPublic).buffer } }, RFC.asPublic), false);
  assert.equal(alerts.keyChanged({ options:{} }, RFC.asPublic), false, "no churn where the key is not reported");

  const row = extra => alerts.alertsRow({ supported:true, capability:true, permission:"default", subscribed:false, ...extra });
  assert.equal(row({ supported:false }), "hidden");
  assert.equal(row({ capability:false }), "hidden");
  assert.equal(row({}), "off");
  assert.equal(row({ permission:"granted", subscribed:true }), "on");
  assert.equal(row({ permission:"denied" }), "blocked");

  const card = extra => alerts.alertsCardVisible({ supported:true, capability:true, standalone:true,
    permission:"default", subscribed:false, asked:false, me:P1, checked:true, ...extra });
  assert.equal(card({}), true);
  for (const extra of [{ standalone:false }, { supported:false }, { capability:false }, { asked:true },
    { permission:"granted" }, { permission:"denied" }, { subscribed:true }, { me:null }, { checked:false }])
    assert.equal(card(extra), false, JSON.stringify(extra));
});

test("the service worker only shows and opens alerts: no fetch handler, no cache", () => {
  const source = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
  const handlers = [...source.matchAll(/addEventListener\("(\w+)"/g)].map(match => match[1]).sort();
  assert.deepEqual(handlers, ["activate", "install", "notificationclick", "push"]);
  assert.doesNotMatch(source, /caches\.|respondWith|importScripts/);
});

const root = fileURLToPath(new URL("../", import.meta.url));
const compiled = await build({
  stdin:{ contents:'export { AlertsToggle, AlertsCard } from "./src/features/alerts/Alerts.jsx";', resolveDir:root, loader:"jsx" },
  bundle:true, platform:"node", format:"cjs", external:["react"], loader:{ ".css":"empty" }, write:false, logLevel:"silent",
  plugins:[{ name:"alerts-stub", setup(builder) {
    builder.onLoad({ filter:/[\\/]src[\\/]lib[\\/]client\.js$/ }, () => ({ loader:"js", contents:`
      export const useTournament = () => globalThis.__alertsTournament;
      export const dispatch = async () => ({ ok:true });
      export const localGet = () => null; export const localSet = () => {};` }));
    builder.onLoad({ filter:/[\\/]features[\\/]check-in[\\/]install\.js$/ }, () => ({ loader:"js", contents:
      "export const isStandalone = () => { throw new Error('checked only where alerts are supported'); };" }));
  } }],
});
const componentModule = new Module(fileURLToPath(new URL("web-push.cjs", import.meta.url)));
componentModule.filename = componentModule.id;
componentModule.paths = Module._nodeModulePaths(root);
componentModule._compile(compiled.outputFiles[0].text, componentModule.filename);
const { AlertsToggle, AlertsCard } = componentModule.exports;

test("the controls render nothing without Web Push, and a switch where it exists", () => {
  globalThis.__alertsTournament = { capabilities:{ push:true }, pushKey:RFC.asPublic };
  const html = element => renderToStaticMarkup(element);
  assert.equal(html(React.createElement(AlertsToggle, {})), "", "no Notification/PushManager in this runtime");
  assert.equal(html(React.createElement(AlertsCard, { me:P1 })), "");
  const toggle = html(React.createElement(AlertsToggle, { supported:true }));
  assert.match(toggle, /role="switch"/);
  assert.match(toggle, /aria-checked="false"/);
  assert.match(toggle, />Alerts</);
  globalThis.__alertsTournament = { capabilities:{ push:false }, pushKey:null };
  assert.equal(html(React.createElement(AlertsToggle, { supported:true })), "");
  /* the card waits for this device's answer before it asks */
  assert.equal(html(React.createElement(AlertsCard, { me:P1, supported:true, standalone:true })), "");
});
