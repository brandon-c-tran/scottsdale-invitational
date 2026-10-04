/* Pocket alerts on this device: whether it can take them, the one explicit
   ask, the subscription, and where a tapped alert opens. The Worker decides
   what to send (worker/pushAlerts.js); this only subscribes and routes.

   iOS offers Web Push only to the home-screen app (16.4+), where Notification
   and PushManager exist. Everywhere else nothing here renders. */
import { dispatch, localGet, localSet } from "../../lib/client.js";

export const ALERT_REASONS = Object.freeze(["playing", "pick", "duel", "mvp"]);
export const ALERTS_ASKED_KEY = "si-alerts-asked";
export const SW_URL = "/sw.js";

export function alertsSupported(win = typeof window === "undefined" ? null : window) {
  return !!win && win.isSecureContext !== false && "Notification" in win && "PushManager" in win
    && !!win.navigator?.serviceWorker;
}

/* "/?alert=pick&ev=bball" -> { reason:"pick", ev:"bball" } */
export function alertRoute(href) {
  let url;
  try { url = new URL(href, "https://fielddayseries.com"); } catch { return null; }
  const reason = url.searchParams.get("alert");
  if (!ALERT_REASONS.includes(reason)) return null;
  const ev = url.searchParams.get("ev");
  return { reason, ev:ev && ev.length <= 80 ? ev : null };
}

/* the same address without the alert parameters */
export function withoutAlertParams(href) {
  const url = new URL(href);
  url.searchParams.delete("alert");
  url.searchParams.delete("ev");
  return `${url.pathname}${url.search}${url.hash}`;
}

export function keyBytes(base64url) {
  const clean = String(base64url || "").replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(clean + "===".slice((clean.length + 3) % 4));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

export function sameKey(buffer, base64url) {
  if (!buffer || !base64url) return false;
  const left = new Uint8Array(buffer), right = keyBytes(base64url);
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

/* A subscription made with another server key (the keys were replaced).
   A browser that does not report its key is taken at its word. */
export function keyChanged(subscription, pushKey) {
  const key = subscription?.options?.applicationServerKey;
  return !!key && !sameKey(key, pushKey);
}

/* What the profile row shows: nothing, a switch, or where to allow it. */
export function alertsRow({ supported, capability, permission, subscribed }) {
  if (!supported || !capability) return "hidden";
  if (permission === "denied") return "blocked";
  return subscribed && permission === "granted" ? "on" : "off";
}

/* The Home card: an installed app that can take alerts and has never
   answered, on this device. */
export function alertsCardVisible({ supported, capability, standalone, permission, subscribed, asked, me, checked }) {
  return !!(supported && capability && standalone && me && checked && !asked && !subscribed
    && permission === "default");
}

/* ── shared device state ── */
const store = { checked:false, permission:"default", subscribed:false, busy:false, error:"", asked:false };
let cached = { ...store };
const listeners = new Set();
const emit = patch => { Object.assign(store, patch); cached = { ...store }; listeners.forEach(fn => fn()); };
export const alertsSnapshot = () => cached;
export const subscribeAlerts = fn => { listeners.add(fn); return () => listeners.delete(fn); };

const permissionNow = () => { try { return Notification.permission; } catch { return "default"; } };

async function currentSubscription() {
  const registration = await navigator.serviceWorker.getRegistration("/");
  return registration ? { registration, subscription:await registration.pushManager.getSubscription() } : null;
}

export async function refreshAlerts() {
  if (!alertsSupported()) return;
  try {
    const asked = localGet(ALERTS_ASKED_KEY) === "yes";
    const found = await currentSubscription();
    emit({ checked:true, asked, permission:permissionNow(), subscribed:!!found?.subscription });
  } catch { emit({ checked:true, asked:true, permission:permissionNow() }); }
}

export function dismissAlertsCard() {
  localSet(ALERTS_ASKED_KEY, "yes");
  emit({ asked:true });
}

const DENIED = "Allow notifications for Field Day in Settings";

/* Must start inside the tap: iOS only shows the permission prompt for a
   user gesture, so requestPermission is the first thing awaited. */
export async function turnOnAlerts(pushKey) {
  if (!alertsSupported() || !pushKey || store.busy) return { ok:false };
  let permission = permissionNow();
  const asking = permission === "default" ? Notification.requestPermission() : null;
  emit({ busy:true, error:"" });
  try {
    if (asking) permission = await asking;
    localSet(ALERTS_ASKED_KEY, "yes");
    if (permission !== "granted") {
      emit({ busy:false, asked:true, permission, error:permission === "denied" ? DENIED : "" });
      return { ok:false, error:permission === "denied" ? DENIED : null };
    }
    const registration = await navigator.serviceWorker.register(SW_URL, { scope:"/" });
    await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (subscription && keyChanged(subscription, pushKey)) {
      await subscription.unsubscribe();
      subscription = null;
    }
    if (!subscription) subscription = await registration.pushManager.subscribe({
      userVisibleOnly:true, applicationServerKey:keyBytes(pushKey) });
    const result = await dispatch("pushSubscribe", subscription.toJSON());
    if (result?.ok !== true) {
      const error = result?.error || "Alerts didn't turn on. Try again.";
      emit({ busy:false, asked:true, permission, subscribed:false, error });
      return { ok:false, error };
    }
    emit({ busy:false, asked:true, permission, subscribed:true, error:"" });
    return { ok:true };
  } catch {
    const error = "Alerts didn't turn on. Try again.";
    emit({ busy:false, asked:true, permission:permissionNow(), error });
    return { ok:false, error };
  }
}

export async function turnOffAlerts() {
  if (!alertsSupported() || store.busy) return { ok:false };
  emit({ busy:true, error:"" });
  try {
    const found = await currentSubscription();
    const endpoint = found?.subscription?.endpoint || null;
    if (found?.subscription) await found.subscription.unsubscribe();
    const result = await dispatch("pushUnsubscribe", { endpoint });
    emit({ busy:false, subscribed:false, error:result?.ok === false && !result.uncertain ? result.error || "" : "" });
    return { ok:true };
  } catch {
    emit({ busy:false, error:"Alerts didn't turn off. Try again." });
    return { ok:false };
  }
}

/* On every connection: a subscription this device already holds is handed
   to the server again (it follows the claim, and survives a server that
   dropped it); one made with an older key is replaced. */
export async function keepAlertsCurrent(pushKey) {
  if (!alertsSupported() || !pushKey || permissionNow() !== "granted" || store.busy) return;
  try {
    const found = await currentSubscription();
    let subscription = found?.subscription;
    if (!subscription) { emit({ checked:true, permission:"granted", subscribed:false }); return; }
    if (keyChanged(subscription, pushKey)) {
      await subscription.unsubscribe();
      subscription = await found.registration.pushManager.subscribe({
        userVisibleOnly:true, applicationServerKey:keyBytes(pushKey) });
    }
    const result = await dispatch("pushSubscribe", subscription.toJSON());
    emit({ checked:true, permission:"granted", subscribed:result?.ok === true || store.subscribed });
  } catch {}
}
