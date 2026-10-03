/* The fit audit's phone: the whole app (src/main.jsx) over a scenario built
   in memory by the real reducers (dev/fit/scenarios.js), projected for its
   viewer by the Worker's own publicState, on the audit's in-memory
   transport (dev/fit/client.js). scripts/fit-audit.mjs opens
   /dev/fit-phone.html?scenario=<id>&tab=<home|events|bets|weekend>[&sheet=]
   at a phone's viewport and measures it. A tap that dispatches runs the
   real reducer here and re-projects, so a sheet opened by a tap is real. */
import { applyAction } from "../worker/actions.js";
import { publicState } from "../worker/publicState.js";
import { publishFrame } from "../src/lib/frameGate.js";
import { FIT_GM, FIT_GUEST, PHONE_SCENARIOS, buildScenario } from "./fit/scenarios.js";

const params = new URLSearchParams(location.search);
const scenario = buildScenario(PHONE_SCENARIOS, params.get("scenario") || "locker");
const gm = scenario.viewer === "gm";
const me = gm ? FIT_GM : FIT_GUEST;
/* a QA scenario: the commissioner with the QA capability and QA mode on */
const qaOn = gm && !!scenario.qa;
const TABS = { home:"board", events:"sched", bets:"bets", weekend:"guide" };
const state = scenario.state;

try {
  localStorage.clear();
  const seed = { "si-device":`fit-${me}`, "si-me":me, "si-onboard-v5":"yes", "si-onboard-epoch":String(state.onboardEpoch || 0),
    "si-alerts-asked":"yes", "si-haptics":"off", "si-sound":"off",
    ...(gm ? { "si-gm":"yes", "si-gm-token":"fit-token", "si-qa":qaOn ? "yes" : "no" } : {}) };
  Object.entries(seed).forEach(([k, v]) => localStorage.setItem(k, v));
  sessionStorage.clear();
  sessionStorage.setItem("fd-tab", TABS[params.get("tab")] || "board");
} catch {}

const capabilities = { qa:qaOn, progressReset:qaOn, restore:false, snapshotExport:false, showControl:gm && !!scenario.show,
  audioDirector:gm && !!scenario.audio, audioCatalog:false, audioPlayback:false, push:false };
globalThis.__FIT_SPOTIFY__ = scenario.spotify || null;
let version = 1;
const frame = () => ({ state:publicState(state, { isGm:gm, player:me }, { moments:state.moments }), you:me, gm, capabilities, version:++version,
  ...(gm && scenario.tvs ? { tvs:scenario.tvs, tvsAt:Date.now() } : {}) });
globalThis.__FIT_FRAME__ = frame();
globalThis.__fitState = state;
let seq = 0;
globalThis.__FIT_DISPATCH__ = (type, payload) => {
  /* checkpoints live in the Durable Object's private keys, not in state */
  if (type === "qaCheckpoints") return { ok:true, extra:{ checkpoints:[] } };
  const result = applyAction(state, type, payload, { isGm:gm, player:me, deviceId:`fit-${me}`, actionId:`fitp-${++seq}`,
    environment:"local", qa:qaOn, progressReset:qaOn });
  if (result.ok) import("./fit/client.js").then(m => { publishFrame({ version, fresh:false }); m.setFitFrame(frame()); });
  return result;
};
publishFrame({ version:1, fresh:false });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const visible = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
async function tap(find, tries = 20) {
  for (let i = 0; i < tries; i++) {
    const el = find();
    if (el) { el.click(); return true; }
    await sleep(150);
  }
  return false;
}
/* the views that live in sheets, opened the way a guest opens them */
async function openSheet(kind) {
  /* a win song lands now on a fresh frame (the record re-stamped to this
     instant, as the Worker stamps it); the takeover is held once it has stamped */
  /* the sky strip read in place: a tap on its fourth star (5v5, a team of seven) */
  if (kind === "sky") {
    const hit = document.querySelector(".fd-sky-hit");
    if (!hit) return false;
    const box = hit.getBoundingClientRect();
    const n = Number(getComputedStyle(hit.parentElement).getPropertyValue("--sky-n")) || 12;
    hit.dispatchEvent(new MouseEvent("click", { bubbles:true, clientX:box.left + box.width * 3.5 / n, clientY:box.top + box.height / 2 }));
    await sleep(400);
    return !!document.querySelector(".fd-sky-reading");
  }
  if (kind === "walkout") {
    const walkout = state.showControl?.audio?.walkout;
    if (!walkout) return false;
    const at = Date.now();
    state.showControl.audio.walkout = { ...walkout, startedAt:at, until:at + 30000 };
    const client = await import("./fit/client.js");
    const next = frame();
    publishFrame({ version:next.version, fresh:true, lastAction:"recordContestWinner" });
    client.setFitFrame(next);
    await sleep(2400);
    const style = document.createElement("style");
    style.textContent = "*, *::before, *::after { animation-play-state:paused !important; }";
    document.head.append(style);
    return !!document.querySelector(".fd-moment-walkout");
  }
  /* the event's announcement as a phone sees it when betting opens: the
     event goes on deck on a later frame than the first */
  if (kind === "announce") {
    const client = await import("./fit/client.js");
    const onDeck = state.onDeck;
    state.onDeck = null;
    client.setFitFrame(frame());
    await sleep(700);
    state.onDeck = onDeck;
    client.setFitFrame(frame());
    await sleep(1600);
    return !!document.querySelector(".fd-announcement");
  }
  /* writing your own team name, the longest one there is */
  if (kind === "teamname-write") {
    const ok = await tap(() => [...document.querySelectorAll(".fd-teamname-link")].find(b => visible(b) && /Write your own/.test(b.textContent)));
    await sleep(300);
    const input = document.querySelector(".fd-teamname-write input");
    if (!ok || !input) return false;
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    set.call(input, "Smarty Pints and Friends");
    input.dispatchEvent(new Event("input", { bubbles:true }));
    await sleep(200);
    return true;
  }
  if (kind === "lastcard" || kind === "auto") return !!document.querySelector(".fd-sheet, [role=dialog]");
  if (kind === "card" || kind === "card-back") {
    const ok = await tap(() => [...document.querySelectorAll("button[aria-label*='player card' i], button[aria-label*='card' i]")]
      .find(b => visible(b) && !b.closest("[role=dialog]")));
    if (ok && kind === "card-back") {
      await sleep(700);
      await tap(() => [...document.querySelectorAll("[role=dialog] button")].find(b => visible(b)
        && /flip|season|back|stats/i.test(`${b.getAttribute("aria-label") || ""} ${b.textContent}`)));
    }
    return ok;
  }
  /* the menus and the commissioner's surfaces: the header's More and
     Commissioner buttons, the QA console, the pill's more tray */
  if (kind === "menu" || kind === "gm-menu") {
    const label = kind === "menu" ? "More options" : "Commissioner";
    return tap(() => [...document.querySelectorAll(`header button[aria-label='${label}']`)].find(visible));
  }
  /* the commissioner's TV and Speaker sheets, from their menu rows */
  if (kind === "tv" || kind === "speaker") {
    const opened = await tap(() => [...document.querySelectorAll("header button[aria-label='Commissioner']")].find(visible));
    if (!opened) return false;
    await sleep(600);
    const name = kind === "tv" ? "TV" : "Speaker";
    return tap(() => [...document.querySelectorAll("[role=dialog] .fd-menu-row")].find(b => visible(b)
      && b.querySelector(".fd-menu-name")?.textContent.trim() === name));
  }
  if (kind === "qa") {
    return tap(() => document.querySelector("[data-qa-open]")
      || [...document.querySelectorAll("button")].find(b => visible(b) && b.textContent.trim() === "Console"));
  }
  if (kind === "pill-more") {
    return tap(() => document.querySelector("[data-pill-more]"));
  }
  if (kind === "draft") {
    return tap(() => [...document.querySelectorAll("#fd-main button, main button")].find(b => visible(b)
      && /your pick|open draft|draft/i.test(`${b.getAttribute("aria-label") || ""} ${b.textContent}`)));
  }
  /* "event" opens the live (else the next) event from the Events tab;
     "event-<name>" the row whose name starts with it */
  /* Weekend's back page and photos: the tile (or All) that opens the sheet,
     and one game from the Games sheet */
  if (kind.startsWith("weekend-")) {
    const want = { "weekend-house":/^House$/, "weekend-rules":/^Rules$/, "weekend-games":/^Games$/, "weekend-game":/^Games$/,
      "weekend-payouts":/^Payouts$/, "weekend-photos":/^All \d+$/ }[kind];
    const ok = await tap(() => [...document.querySelectorAll("main button")].find(b => visible(b) && want?.test(b.textContent.trim())));
    if (ok && kind === "weekend-game") {
      await sleep(700);
      return tap(() => [...document.querySelectorAll("[role=dialog] button")].find(b => visible(b) && /Beer Die/.test(b.textContent)));
    }
    return ok;
  }
  if (kind === "event" || kind.startsWith("event-")) {
    const want = kind.startsWith("event-") ? kind.slice(6).toLowerCase() : null;
    await tap(() => [...document.querySelectorAll("nav button, footer button")].find(b => visible(b)
      && b.textContent.trim() === "Events"));
    await sleep(500);
    /* a finished session is folded: open them all to find a named row */
    if (want) { document.querySelectorAll(".fd-events-session-toggle[aria-expanded='false']").forEach(b => b.click()); await sleep(300); }
    return tap(() => {
      const rows = [...document.querySelectorAll(".fd-events-open")].filter(visible);
      if (want) return rows.find(b => (b.getAttribute("aria-label") || "").toLowerCase().startsWith(want));
      return document.querySelector(".fd-events-row.is-live .fd-events-open, .fd-events-row.is-pending .fd-events-open") || rows[0];
    });
  }
  return false;
}

/* a crowned phone opens on its last card; a tab view closes it first */
async function settle() {
  const sheet = params.get("sheet");
  await sleep(1400);
  if (!sheet || sheet !== "lastcard") {
    await tap(() => document.querySelector(".fd-crown-close, [aria-label='Close last card']"), 4);
  }
  /* a tab is audited as a guest sees it after the sheet that opened on its
     own (a draw announcement) is closed; sheet=auto audits that sheet */
  if (sheet !== "auto" && sheet !== "lastcard") {
    for (let i = 0; i < 4 && document.querySelector(".fd-sheet-overlay"); i++) {
      document.dispatchEvent(new KeyboardEvent("keydown", { key:"Escape", bubbles:true }));
      window.dispatchEvent(new KeyboardEvent("keydown", { key:"Escape", bubbles:true }));
      await sleep(700);
    }
  }
  if (sheet) {
    await sleep(500);
    window.__FIT_SHEET__ = await openSheet(sheet);
  }
  await sleep(900);
  window.__FIT_READY__ = true;
}

import("../src/main.jsx").then(settle);
