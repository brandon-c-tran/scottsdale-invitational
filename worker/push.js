/* Pocket alerts: Web Push (RFC 8030) with message encryption (RFC 8291,
   aes128gcm) and VAPID (RFC 8292, ES256), on WebCrypto alone.

   Keys: VAPID_PUBLIC_KEY is the uncompressed P-256 point (65 bytes) and
   VAPID_PRIVATE_KEY its 32-byte scalar, both base64url, the format every
   Web Push library prints. VAPID_SUBJECT is a mailto: or https: contact.
   With any of the three missing or malformed the capability is off and no
   client offers alerts. The private key is a Worker secret, never a var.

   Storage (private Durable Object keys, never in a snapshot or a frame):
   - private:push:subs  { [deviceId]: { endpoint, p256dh, auth, at } }. The
     player is the device's claim at send time, so a re-claimed phone follows
     its new owner and one player can have several devices.
   - private:push:sent  { [dedupe key]: ms }, so one moment alerts once. */

export const PUSH_SUBS_KEY = "private:push:subs";
export const PUSH_SENT_KEY = "private:push:sent";
export const PUSH_TTL_SECONDS = 600;
export const PUSH_SUB_LIMIT = 64;
const SENT_KEEP_MS = 3 * 24 * 60 * 60 * 1000;
const SENT_LIMIT = 600;
const JWT_LIFETIME_S = 12 * 60 * 60;
const SEND_TIMEOUT_MS = 8000;
const RECORD_SIZE = 4096;

const encoder = new TextEncoder();

/* ── base64url ── */
export function b64uEncode(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (let index = 0; index < view.length; index++) binary += String.fromCharCode(view[index]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function b64uDecode(text) {
  if (typeof text !== "string" || !/^[A-Za-z0-9_-]*={0,2}$/.test(text.trim())) return null;
  const clean = text.trim().replace(/=+$/, "").replace(/-/g, "+").replace(/_/g, "/");
  try {
    const binary = atob(clean + "===".slice((clean.length + 3) % 4));
    return Uint8Array.from(binary, char => char.charCodeAt(0));
  } catch { return null; }
}
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
};

/* ── configuration ── */
const validSubject = subject => typeof subject === "string"
  && /^(mailto:[^\s@]+@[^\s@]+|https:\/\/[^\s]+)$/.test(subject.trim());

export function vapidConfig(env) {
  const publicKey = typeof env?.VAPID_PUBLIC_KEY === "string" ? env.VAPID_PUBLIC_KEY.trim() : "";
  const privateKey = typeof env?.VAPID_PRIVATE_KEY === "string" ? env.VAPID_PRIVATE_KEY.trim() : "";
  const subject = typeof env?.VAPID_SUBJECT === "string" ? env.VAPID_SUBJECT.trim() : "";
  const point = b64uDecode(publicKey), scalar = b64uDecode(privateKey);
  if (!point || point.length !== 65 || point[0] !== 4) return null;
  if (!scalar || scalar.length !== 32 || !validSubject(subject)) return null;
  return {
    publicKey:b64uEncode(point),
    subject,
    jwk:{ kty:"EC", crv:"P-256", ext:true,
      x:b64uEncode(point.slice(1, 33)), y:b64uEncode(point.slice(33, 65)), d:b64uEncode(scalar) },
  };
}
export const pushConfigured = env => !!vapidConfig(env);

/* ── subscriptions ──
   Only real push services are reachable: the Worker POSTs to whatever a
   claimed device hands it, so the endpoint host is an allowlist. Local
   development may also use a loopback push service for its own checks. */
const PUSH_HOSTS = ["push.apple.com", "fcm.googleapis.com", "android.googleapis.com",
  "push.services.mozilla.com", "notify.windows.com"];
const hostAllowed = host => PUSH_HOSTS.some(allowed => host === allowed || host.endsWith(`.${allowed}`));

export function cleanSubscription(raw, { environment = "production" } = {}) {
  const endpoint = typeof raw?.endpoint === "string" ? raw.endpoint.trim() : "";
  if (!endpoint || endpoint.length > 1024) return null;
  let url;
  try { url = new URL(endpoint); } catch { return null; }
  const loopback = environment === "local" && url.protocol === "http:"
    && ["127.0.0.1", "localhost"].includes(url.hostname);
  if (!loopback && (url.protocol !== "https:" || !hostAllowed(url.hostname))) return null;
  if (url.username || url.password) return null;
  const p256dh = b64uDecode(raw?.keys?.p256dh), auth = b64uDecode(raw?.keys?.auth);
  if (!p256dh || p256dh.length !== 65 || p256dh[0] !== 4) return null;
  if (!auth || auth.length !== 16) return null;
  return { endpoint:url.href, p256dh:b64uEncode(p256dh), auth:b64uEncode(auth) };
}

async function readMap(storage, key) {
  const value = await storage.get(key);
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

/* One entry per device; the same endpoint never sits under two devices. */
export async function saveSubscription(storage, deviceId, sub, now = Date.now()) {
  const subs = await readMap(storage, PUSH_SUBS_KEY);
  const current = subs[deviceId];
  if (current && current.endpoint === sub.endpoint && current.p256dh === sub.p256dh && current.auth === sub.auth)
    return { changed:false };
  const next = Object.fromEntries(Object.entries(subs)
    .filter(([id, item]) => id !== deviceId && item?.endpoint !== sub.endpoint));
  next[deviceId] = { ...sub, at:now };
  const kept = Object.entries(next).sort((a, b) => (b[1]?.at || 0) - (a[1]?.at || 0)).slice(0, PUSH_SUB_LIMIT);
  await storage.put(PUSH_SUBS_KEY, Object.fromEntries(kept));
  return { changed:true };
}

export async function dropSubscription(storage, deviceId, endpoint = null) {
  const subs = await readMap(storage, PUSH_SUBS_KEY);
  const current = subs[deviceId];
  if (!current || (endpoint && current.endpoint !== endpoint)) return { changed:false };
  const next = { ...subs };
  delete next[deviceId];
  await storage.put(PUSH_SUBS_KEY, next);
  return { changed:true };
}

async function dropEndpoints(storage, endpoints) {
  if (!endpoints.length) return;
  const gone = new Set(endpoints);
  const subs = await readMap(storage, PUSH_SUBS_KEY);
  const next = Object.fromEntries(Object.entries(subs).filter(([, item]) => !gone.has(item?.endpoint)));
  if (Object.keys(next).length !== Object.keys(subs).length) await storage.put(PUSH_SUBS_KEY, next);
}

/* Marks each alert's dedupe key and returns only the ones never sent. Must
   run serialized (the Durable Object chains it) so two writes in a row
   cannot both claim the same key. */
export async function claimAlerts(storage, alerts, now = Date.now()) {
  if (!alerts.length) return [];
  const sent = await readMap(storage, PUSH_SENT_KEY);
  const fresh = [];
  for (const alert of alerts) {
    if (sent[alert.key]) continue;
    sent[alert.key] = now;
    fresh.push(alert);
  }
  if (!fresh.length) return [];
  const kept = Object.entries(sent).filter(([, at]) => now - Number(at) < SENT_KEEP_MS)
    .sort((a, b) => b[1] - a[1]).slice(0, SENT_LIMIT);
  await storage.put(PUSH_SENT_KEY, Object.fromEntries(kept));
  return fresh;
}

/* ── RFC 8291 message encryption ── */
async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name:"HKDF", hash:"SHA-256", salt, info }, key, length * 8));
}

/* `salt` and `localKeys` ({ publicKey: raw 65 bytes, privateKey: CryptoKey })
   exist for the RFC 8291 test vectors; a real send generates both. */
export async function encryptPayload(plaintext, { p256dh, auth }, { salt, localKeys } = {}) {
  const uaPublic = typeof p256dh === "string" ? b64uDecode(p256dh) : p256dh;
  const authSecret = typeof auth === "string" ? b64uDecode(auth) : auth;
  const data = typeof plaintext === "string" ? encoder.encode(plaintext) : plaintext;
  if (data.length > RECORD_SIZE - 17 - 86) throw new Error("Push payload too large");
  let asPublic, asPrivate;
  if (localKeys) ({ publicKey:asPublic, privateKey:asPrivate } = localKeys);
  else {
    const pair = await crypto.subtle.generateKey({ name:"ECDH", namedCurve:"P-256" }, true, ["deriveBits"]);
    asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
    asPrivate = pair.privateKey;
  }
  const saltBytes = salt || crypto.getRandomValues(new Uint8Array(16));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name:"ECDH", namedCurve:"P-256" }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name:"ECDH", public:uaKey }, asPrivate, 256));
  const keyInfo = concat(encoder.encode("WebPush: info\0"), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);
  const cek = await hkdf(saltBytes, ikm, encoder.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(saltBytes, ikm, encoder.encode("Content-Encoding: nonce\0"), 12);
  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name:"AES-GCM", iv:nonce },
    aesKey, concat(data, new Uint8Array([2]))));
  const header = new Uint8Array(21);
  header.set(saltBytes, 0);
  new DataView(header.buffer).setUint32(16, RECORD_SIZE);
  header[20] = asPublic.length;
  return concat(header, asPublic, cipher);
}

/* ── RFC 8292 VAPID ── */
const signingKeys = new Map();
async function signingKey(config) {
  if (!signingKeys.has(config.jwk.d))
    signingKeys.set(config.jwk.d, crypto.subtle.importKey("jwk", config.jwk,
      { name:"ECDSA", namedCurve:"P-256" }, false, ["sign"]));
  return signingKeys.get(config.jwk.d);
}

/* ES256 signs to the raw r||s form JWS wants; WebCrypto already emits it. */
export async function vapidJwt(audience, config, now = Date.now()) {
  const head = b64uEncode(encoder.encode(JSON.stringify({ typ:"JWT", alg:"ES256" })));
  const body = b64uEncode(encoder.encode(JSON.stringify({
    aud:audience, exp:Math.floor(now / 1000) + JWT_LIFETIME_S, sub:config.subject })));
  const unsigned = `${head}.${body}`;
  const signature = await crypto.subtle.sign({ name:"ECDSA", hash:"SHA-256" },
    await signingKey(config), encoder.encode(unsigned));
  return `${unsigned}.${b64uEncode(new Uint8Array(signature))}`;
}

const jwtCache = new Map();
export async function vapidAuthorization(endpoint, config, now = Date.now()) {
  const audience = new URL(endpoint).origin;
  const cacheKey = `${config.publicKey}|${audience}`;
  const cached = jwtCache.get(cacheKey);
  if (cached && cached.until > now) return cached.header;
  const header = `vapid t=${await vapidJwt(audience, config, now)}, k=${config.publicKey}`;
  jwtCache.set(cacheKey, { header, until:now + (JWT_LIFETIME_S - 3600) * 1000 });
  return header;
}

/* ── delivery ── */
export async function sendOne(sub, message, config, { fetchImpl = fetch, now = Date.now() } = {}) {
  const body = await encryptPayload(JSON.stringify(message), sub);
  const topic = typeof message.topic === "string" && /^[A-Za-z0-9_-]{1,32}$/.test(message.topic)
    ? { Topic:message.topic } : {};
  const response = await fetchImpl(sub.endpoint, {
    method:"POST",
    headers:{
      Authorization:await vapidAuthorization(sub.endpoint, config, now),
      "Content-Encoding":"aes128gcm",
      "Content-Type":"application/octet-stream",
      TTL:String(PUSH_TTL_SECONDS),
      Urgency:"high",
      ...topic,
    },
    body,
    signal:typeof AbortSignal?.timeout === "function" ? AbortSignal.timeout(SEND_TIMEOUT_MS) : undefined,
  });
  return { status:response.status, gone:response.status === 404 || response.status === 410 };
}

/* Sends each fresh alert to every device its player has claimed and
   subscribed, and forgets subscriptions the push service says are gone.
   Never throws: nothing here can reach an official write. */
export async function deliverAlerts(alerts, { storage, env, claims, fetchImpl = fetch, now = Date.now(), log = console } = {}) {
  const config = vapidConfig(env);
  if (!config || !alerts.length) return { sent:0, gone:0, failed:0 };
  const subs = await readMap(storage, PUSH_SUBS_KEY);
  const jobs = [];
  for (const alert of alerts)
    for (const [deviceId, sub] of Object.entries(subs))
      if (claims?.[deviceId] === alert.player && sub?.endpoint)
        jobs.push({ alert, sub });
  const outcomes = await Promise.all(jobs.map(async ({ alert, sub }) => {
    try { return { sub, ...(await sendOne(sub, alert.message, config, { fetchImpl, now })) }; }
    catch (error) { return { sub, status:0, error:String(error?.message || error).slice(0, 200) }; }
  }));
  const gone = outcomes.filter(outcome => outcome.gone).map(outcome => outcome.sub.endpoint);
  try { await dropEndpoints(storage, gone); } catch {}
  const failed = outcomes.filter(outcome => !outcome.gone && !(outcome.status >= 200 && outcome.status < 300));
  for (const outcome of failed)
    log?.warn?.(JSON.stringify({ event:"push-failed", status:outcome.status,
      host:(() => { try { return new URL(outcome.sub.endpoint).host; } catch { return ""; } })(),
      ...(outcome.error ? { error:outcome.error } : {}) }));
  return { sent:outcomes.length - gone.length - failed.length, gone:gone.length, failed:failed.length };
}
