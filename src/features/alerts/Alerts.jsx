import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTournament } from "../../lib/client.js";
import { isStandalone } from "../check-in/install.js";
import {
  alertRoute, alertsCardVisible, alertsRow, alertsSnapshot, alertsSupported, dismissAlertsCard,
  keepAlertsCurrent, refreshAlerts, subscribeAlerts, turnOffAlerts, turnOnAlerts, withoutAlertParams,
} from "./pocketAlerts.js";
import "../profile/player-pass.css";
import "./alerts.css";

const useAlerts = () => useSyncExternalStore(subscribeAlerts, alertsSnapshot, alertsSnapshot);

/* This device's Alerts row, beside Haptics in the profile sheet. A browser
   without Web Push (iOS Safari outside the home-screen app) renders nothing. */
export function AlertsToggle({ supported = alertsSupported() }) {
  return supported ? <AlertsRow /> : null;
}

function AlertsRow() {
  const { capabilities, pushKey } = useTournament();
  const alerts = useAlerts();
  useEffect(() => { refreshAlerts(); }, []);
  const row = alertsRow({ supported:true, capability:capabilities?.push === true && !!pushKey,
    permission:alerts.permission, subscribed:alerts.subscribed });
  if (row === "hidden") return null;
  const on = row === "on";
  return <div className="fd-profile-vibration fd-alerts-row" aria-busy={alerts.busy}>
    <span><span id="fd-alerts-label">Alerts</span>
      {alerts.error && <small className="fd-alerts-error" role="alert">{alerts.error}</small>}</span>
    {row === "blocked"
      ? <span className="fd-alerts-blocked">Off in Settings</span>
      : <button type="button" role="switch" aria-checked={on} aria-labelledby="fd-alerts-label"
          className="fd-switch" disabled={alerts.busy}
          onClick={() => on ? turnOffAlerts() : turnOnAlerts(pushKey)}><span aria-hidden="true" /></button>}
  </div>;
}

/* One Home card for an installed app that has never answered. */
export function AlertsCard({ me, supported = alertsSupported(), standalone }) {
  if (!supported || !me) return null;
  return (standalone ?? isStandalone()) ? <AlertsAsk me={me} /> : null;
}

function AlertsAsk({ me }) {
  const { capabilities, pushKey } = useTournament();
  const alerts = useAlerts();
  useEffect(() => { refreshAlerts(); }, []);
  const capability = capabilities?.push === true && !!pushKey;
  /* a Turn on that failed keeps the card up to say why */
  const [failed, setFailed] = useState("");
  const visible = alertsCardVisible({ supported:true, capability, standalone:true, me, checked:alerts.checked,
    asked:alerts.asked, subscribed:alerts.subscribed, permission:alerts.permission });
  if (!(visible || (failed && capability && !alerts.subscribed))) return null;
  const turnOn = async () => {
    setFailed("");
    const result = await turnOnAlerts(pushKey);
    if (result?.error) setFailed(result.error);
  };
  return <section className="fd-home-alerts" aria-label="Alerts" aria-busy={alerts.busy}>
    <span>Get alerts when you’re up</span>
    <button type="button" disabled={alerts.busy} onClick={turnOn}>
      {alerts.busy ? "Turning on…" : "Turn on"}</button>
    <button type="button" disabled={alerts.busy} onClick={() => { setFailed(""); dismissAlertsCard(); }}>Not now</button>
    {failed && <p role="alert">{failed}</p>}
  </section>;
}

/* App-level upkeep: hand this device's subscription to the server on each
   connection, and open where a tapped alert points (a cold start carries it
   in the address; a running app hears it from the service worker). */
export function usePocketAlerts({ connected, you, capabilities, pushKey, ready, onRoute }) {
  const route = useRef(onRoute);
  route.current = onRoute;
  const pending = useRef(null);
  useEffect(() => {
    if (!connected || !you || capabilities?.push !== true || !pushKey) return;
    keepAlertsCurrent(pushKey);
  }, [connected, you, capabilities?.push, pushKey]);
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const found = alertRoute(window.location.href);
    if (found) {
      pending.current = found;
      try { window.history.replaceState(window.history.state, "", withoutAlertParams(window.location.href)); } catch {}
    }
    const worker = navigator.serviceWorker;
    if (!worker?.addEventListener) return undefined;
    const onMessage = event => {
      if (event?.data?.type !== "fd-alert") return;
      const next = alertRoute(event.data.url);
      if (!next) return;
      pending.current = next;
      if (route.current?.(next)) pending.current = null;
    };
    worker.addEventListener("message", onMessage);
    return () => worker.removeEventListener("message", onMessage);
  }, []);
  /* a cold start waits for the first board before it can open anything */
  useEffect(() => {
    if (ready && pending.current && route.current?.(pending.current)) pending.current = null;
  }, [ready]);
}
