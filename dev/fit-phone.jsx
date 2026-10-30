/* The fit audit's phone: the whole app (src/main.jsx) over a scenario built
   in memory by the real reducers (dev/fit/scenarios.js), projected for its
   viewer by the Worker's own publicState, on the audit's in-memory
   transport (dev/fit/client.js). scripts/fit-audit.mjs opens
   /dev/fit-phone.html?scenario=<id>&tab=<home|events|bets|weekend>[&sheet=]
   at a phone's viewport and measures it. A tap that dispatches runs the
   real reducer here and re-projects, so a sheet opened by a tap is real. */
import React from "react";
import { applyAction } from "../worker/actions.js";
import { publicState } from "../worker/publicState.js";
import { bankForDesk } from "../worker/trivia.js";
import { publishFrame } from "../src/lib/frameGate.js";
import { provideFloatPart } from "../src/features/float/floatParts.js";
import { FIT_ARRIVE_CODE, FIT_GM, FIT_GUEST, PHONE_SCENARIOS, buildScenario } from "./fit/scenarios.js";
import { qbankFixtureResponse, qbankReduce } from "./fit/qbankFixtures.js";
import qrcode from "qrcode-generator";
import FloatController from "../float/client/controller/FloatController.jsx";
import { createMockRoom } from "../float/client/controller/mockRoom.js";

/* the rider's controller with no room behind it (the audit has no server):
   the room's own controller waits on "Joining", so a view that closes it
   hands in a stand-in whose Leave is the controller's onExit */
const FitController = ({ onExit }) => React.createElement("div", { className:"fit-float-controller" },
  React.createElement("button", { type:"button", "aria-label":"Leave", onClick:onExit }, "Leave"));

const params = new URLSearchParams(location.search);
const scenario = buildScenario(PHONE_SCENARIOS, params.get("scenario") || "locker");
const gm = scenario.viewer === "gm";
const me = gm ? FIT_GM : FIT_GUEST;
/* a QA scenario: the commissioner with the QA capability and QA mode on */
const qaOn = gm && !!scenario.qa;
const TABS = { home:"board", events:"sched", bets:"bets", weekend:"guide" };
const state = scenario.state;
/* a moment on the server clock (the Trivia board's) holds its instant: the
   page's clock stands still where the build stamped it */
if (scenario.freeze) { const frozen = Date.now(); Date.now = () => frozen; }
/* the commissioner's desk reads the bank as the Worker serves it */
globalThis.__FIT_BANK__ = bankForDesk();

try {
  localStorage.clear();
  const seed = { "si-device":`fit-${me}`, "si-me":me, "si-onboard-v5":"yes", "si-onboard-epoch":String(state.onboardEpoch || 0),
    "si-alerts-asked":"yes", "si-haptics":"off", "si-sound":"off", ...(scenario.install ? {} : { "si-install-card":"no" }),
    /* the underdog's drawing opens itself once per phone: taught, except where a view shows that moment */
    ...(scenario.teach ? {} : { "si-underdog-taught":"yes" }),
    ...(gm ? { "si-gm":"yes", "si-gm-token":"fit-token", "si-qa":qaOn ? "yes" : "no" } : {}) };
  Object.entries(seed).forEach(([k, v]) => localStorage.setItem(k, v));
  sessionStorage.clear();
  sessionStorage.setItem("fd-tab", TABS[params.get("tab")] || "board");
} catch {}

/* `catalog` (the Win song picker, on for everyone as in production) and
   `push` (pocket alerts): the Ready check's views and the profile's Win song */
const capabilities = { qa:qaOn, progressReset:qaOn, restore:false, snapshotExport:false, showControl:gm && !!scenario.show,
  audioDirector:gm && !!scenario.audio, audioCatalog:!!scenario.catalog, audioPlayback:false, push:gm && !!scenario.push,
  /* `karaoke`: the karaoke capability (the song picker in anyone's
     profile, its Home row before the game) */
  karaoke:!!scenario.karaoke,
  /* `float`: Float's room (the Locker, Home's floatie row, the desk) */
  ...(scenario.float ? { float:true } : {}) };
globalThis.__FIT_SPOTIFY__ = scenario.spotify || null;
/* the Karaoke desk and its Ready check row (`karaoke`), and its stubbed video check */
if (gm && scenario.karaoke) capabilities.karaoke = true;
globalThis.__FIT_KARAOKE_CHECK__ = scenario.karaokeCheck || null;
/* the Question bank desk's records (`qbank`), as GET /api/trivia/qbank answers */
globalThis.__FIT_QBANK__ = gm && scenario.qbank ? qbankFixtureResponse() : null;
let version = 1;
const frame = () => ({ state:publicState(state, { isGm:gm, player:me }, { moments:state.moments }), you:me, gm, capabilities, version:++version,
  ...(gm && scenario.tvs ? { tvs:scenario.tvs, tvsAt:Date.now() } : {}) });
globalThis.__FIT_FRAME__ = frame();
globalThis.__fitState = state;
let seq = 0;
globalThis.__FIT_DISPATCH__ = (type, payload) => {
  /* checkpoints live in the Durable Object's private keys, not in state */
  if (type === "qaCheckpoints") return { ok:true, extra:{ checkpoints:[] } };
  /* and so does Float's feedback (the scenario's own cards) */
  if (type === "floatFeedback") return gm ? { ok:true, extra:{ feedback:scenario.floatFeedback || [] } } : { ok:false, error:"Commissioner only" };
  /* the question bank's writes, in memory until the engine's reducers land */
  const result = (/^qbank/.test(type) && gm ? qbankReduce(state, type, payload) : null)
    || applyAction(state, type, payload, { isGm:gm, player:me, deviceId:`fit-${me}`, actionId:`fitp-${++seq}`,
    environment:"local", qa:qaOn, progressReset:qaOn, arriveCode:FIT_ARRIVE_CODE, float:!!scenario.float });
  if (result.ok) import("./fit/client.js").then(m => { publishFrame({ version, fresh:false }); m.setFitFrame(frame()); });
  return result;
};
publishFrame({ version:1, fresh:false });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const visible = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
/* up to 6 s for the element (a lazy sheet's chunk on a loaded machine
   takes its time); a present one is tapped at once */
async function tap(find, tries = 40) {
  for (let i = 0; i < tries; i++) {
    const el = find();
    if (el) { el.click(); return true; }
    await sleep(150);
  }
  return false;
}
/* a check that holds within `ms`: a sheet that mounts late still counts,
   so a slow run never passes a view that did not open what it names */
async function until(check, ms = 6000) {
  const end = Date.now() + ms;
  for (;;) {
    const value = check();
    if (value) return value;
    if (Date.now() > end) return false;
    await sleep(100);
  }
}
/* the views that live in sheets, opened the way a guest opens them */
async function openSheet(kind) {
  /* Quick Draw on the guest's phone: the challenge (from its toast), the
     duel from Home's card, and a whole showdown played through: both ready
     on a fresh frame, the draw a beat out, the flash tapped, the other run
     landing (won: theirs slower; lost: theirs faster) */
  if (kind === "duel-offer") {
    await tap(() => [...document.querySelectorAll(".fd-toast-action")].find(b => b.textContent.trim() === "View"));
    await sleep(500);
    return !!document.querySelector(".fd-qd");
  }
  if (kind === "duel" || kind === "duel-go" || kind === "duel-won" || kind === "duel-lost") {
    if (!document.querySelector(".fd-qd")) {
      await tap(() => document.querySelector("button[aria-label^='Play Quick Draw with']"));
      await sleep(600);
    }
    if (kind === "duel") return !!document.querySelector(".fd-qd");
    const client = await import("./fit/client.js");
    const d = state.duels.find(item => item.status === "open" && item.to === me);
    if (!d) return false;
    const at = Date.now();
    d.ready = { [d.from]:at, [d.to]:at };
    d.armedAt = at;
    d.fireAt = at + 2200;
    const armed = frame();
    publishFrame({ version:armed.version, fresh:true, lastAction:"duelReady" });
    client.setFitFrame(armed);
    await sleep(2400);
    if (kind === "duel-go") {
      const style = document.createElement("style");
      style.textContent = "*, *::before, *::after { animation-play-state:paused !important; }";
      document.head.append(style);
      return !!document.querySelector(".fd-qd-run.is-go");
    }
    await sleep(230);
    const flash = document.querySelector(".fd-qd-run.is-go");
    if (!flash) return false;
    flash.dispatchEvent(new PointerEvent("pointerdown", { bubbles:true, cancelable:true, pointerType:"touch" }));
    await sleep(500);
    const mine = d.runs?.[me];
    if (!mine) return false;
    d.runs[d.from] = { ms:kind === "duel-won" ? Math.min(5000, (mine.ms || 300) + 140) : 92, foul:false, ts:Date.now() };
    const settled = frame();
    publishFrame({ version:settled.version, fresh:true, lastAction:"playDuel" });
    client.setFitFrame(settled);
    await sleep(3000);
    return !!document.querySelector(".fd-qd-stamp");
  }
  /* a player card's Duel: the rack opens under the card */
  if (kind === "duel-send") {
    const card = await tap(() => [...document.querySelectorAll("button[aria-label*='player card' i]")]
      .find(b => visible(b) && /Henry Nguyen/.test(b.getAttribute("aria-label") || "")));
    await sleep(700);
    const duel = card && await tap(() => [...document.querySelectorAll("[role=dialog] button")]
      .find(b => visible(b) && b.textContent.trim() === "Duel Henry Nguyen"));
    await sleep(400);
    document.querySelector(".fd-duel-send")?.scrollIntoView({ block:"center" });
    await sleep(300);
    return !!duel && !!document.querySelector(".fd-duel-rack");
  }
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
    if (!(await until(() => document.querySelector(".fd-moment-walkout")))) return false;
    await sleep(2400);
    const style = document.createElement("style");
    style.textContent = "*, *::before, *::after { animation-play-state:paused !important; }";
    document.head.append(style);
    return !!document.querySelector(".fd-moment-walkout");
  }
  /* a moment on the guest's phone (features/gags): the write that owes it
     lands now on a fresh frame (the scenario's `land`, through the same
     reducers), the bit comes up at its instant on the room's clock, and is
     held once its name and fact have stamped */
  if (kind === "bit") {
    const { gagWeekend } = await import("./fit/scenarios.js");
    const { LETTER_LAND_MS, bitById } = await import("../src/features/gags/bits/registry.js");
    const client = await import("./fit/client.js");
    gagWeekend(scenario.land, scenario.landOpts || {}).write(state);
    const next = frame();
    publishFrame({ version:next.version, fresh:true, lastAction:"recordContestWinner" });
    client.setFitFrame(next);
    let overlay = null;
    for (let i = 0; i < 400 && !(overlay = document.querySelector(".fd-bit")); i++) await sleep(30);
    if (!overlay) return false;
    /* its name and fact stamped, before the overlay starts to leave */
    const bit = bitById(overlay.getAttribute("data-bit"));
    const joined = -parseFloat(overlay.style.getPropertyValue("--tl")) || 0;
    const hold = Math.min((bit?.letter?.at || 0) + LETTER_LAND_MS + 80, (bit?.ms || 0) - 500);
    await sleep(Math.max(0, hold - joined));
    /* held there: the CSS paused, the clock stopped (the bit's own end
       never comes) and the stage kept held (the receipt keeps waiting) */
    const style = document.createElement("style");
    style.textContent = "*, *::before, *::after { animation-play-state:paused !important; }";
    document.head.append(style);
    const frozen = Date.now();
    Date.now = () => frozen;
    const { holdStage } = await import("../src/lib/motion.js");
    holdStage("fit:bit", { maxMs:600000 });
    return !!document.querySelector(".fd-bit .fd-bit-name");
  }
  /* the event's announcement as a phone sees it when betting opens: the
     event goes on deck on a later frame than the first */
  /* the same announcement closed by the guest: what Home holds right after
     (a fresh draw's team name opens only once nothing else holds the screen;
     "announce" itself shows it still closed behind the sheet) */
  if (kind === "announce-closed") {
    if (!(await openSheet("announce"))) return false;
    for (let i = 0; i < 4 && document.querySelector(".fd-sheet-overlay"); i++) {
      document.dispatchEvent(new KeyboardEvent("keydown", { key:"Escape", bubbles:true }));
      window.dispatchEvent(new KeyboardEvent("keydown", { key:"Escape", bubbles:true }));
      await sleep(700);
    }
    await sleep(1200);
    return !document.querySelector(".fd-sheet-overlay");
  }
  /* a game's own screen (Where and When, Trivia) closed by the guest: Home's
     Now card carries the game as its row */
  if (kind === "game-closed") {
    const ok = await tap(() => document.querySelector(".fd-geo-close, .fd-trivia-close"));
    await sleep(600);
    return ok && !!document.querySelector(".fd-home-now-rows .fd-now-row");
  }
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
    /* the Now card's team row opens the suggestions first */
    const head = document.querySelector(".fd-teamname-now-head[aria-expanded=false]");
    if (head && !document.querySelector(".fd-teamname-link")) { head.click(); await sleep(300); }
    /* or the pencil on your team's name, when the card shows your team */
    const pencil = document.querySelector(".fd-teamname-pencil[aria-expanded=false]");
    if (pencil && !document.querySelector(".fd-teamname-link")) { pencil.click(); await sleep(300); }
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
  /* karaoke (the game's sheet opens by itself where it should): Change in
     the pick window, the sheet opened from Home's row, put away to show
     Home's row, the commissioner's tray, and your You're up landing on a
     fresh frame (held once YOU'RE UP has stamped) */
  if (kind === "karaoke-change") {
    const ok = await tap(() => [...document.querySelectorAll(".fd-karaoke-secondary")].find(b => b.textContent.trim() === "Change"));
    await sleep(400);
    return ok && !!document.querySelector(".fd-karaoke-body.is-picking");
  }
  if (kind === "karaoke-open") {
    const ok = await tap(() => document.querySelector(".fd-karaoke-now, .fd-karaoke-home"));
    await sleep(500);
    return ok && !!document.querySelector(".fd-karaoke-game");
  }
  if (kind === "karaoke-home") {
    const ok = await tap(() => document.querySelector(".fd-karaoke-close"));
    await sleep(500);
    return ok && !document.querySelector(".fd-karaoke-game");
  }
  if (kind === "karaoke-tray") {
    const ok = await tap(() => document.querySelector(".fd-karaoke-more"));
    await sleep(400);
    return ok && !!document.querySelector(".fd-karaoke-tray");
  }
  if (kind === "karaoke-moment") {
    const client = await import("./fit/client.js");
    const game = state.karaoke;
    if (!game) return false;
    state.karaoke = null;
    client.setFitFrame(frame());
    await sleep(600);
    game.turns[game.order[game.index]].upAt = Date.now();
    state.karaoke = game;
    const next = frame();
    publishFrame({ version:next.version, fresh:true, lastAction:"karaokeNext" });
    client.setFitFrame(next);
    await sleep(1600);
    const style = document.createElement("style");
    style.textContent = "*, *::before, *::after { animation-play-state:paused !important; }";
    document.head.append(style);
    return !!document.querySelector(".fd-moment-up.is-karaoke");
  }
  if (kind === "lastcard" || kind === "auto") return !!document.querySelector(".fd-sheet, [role=dialog]");
  /* your profile from the header, and Weekend's Add to Home Screen opened */
  if (kind === "profile") return tap(() => [...document.querySelectorAll("header button[aria-label='Your profile']")].find(visible));
  /* the profile's Jersey and Trip sections (where Home's setup rows lead) */
  const section = { "profile-jersey":"Jersey", "profile-trip":"Trip" }[kind];
  if (section) {
    if (!await tap(() => [...document.querySelectorAll("header button[aria-label='Your profile']")].find(visible))) return false;
    await sleep(600);
    if (!await tap(() => [...document.querySelectorAll(".fd-profile-sections button")]
      .find(b => visible(b) && b.textContent.trim() === section))) return false;
    await sleep(400);
    return true;
  }
  /* the profile's Karaoke section; `-found`: a song searched and picked, its
     videos the scenario's stand-ins (never Spotify or YouTube) */
  if (kind === "profile-karaoke" || kind === "profile-karaoke-found") {
    if (!await tap(() => [...document.querySelectorAll("header button[aria-label='Your profile']")].find(visible))) return false;
    await sleep(600);
    if (!await tap(() => [...document.querySelectorAll(".fd-profile-sections button")]
      .find(b => visible(b) && b.textContent.trim() === "Karaoke"))) return false;
    await sleep(400);
    if (kind === "profile-karaoke") return !!document.querySelector(".fd-ksong");
    const input = [...document.querySelectorAll(".fd-ksong input[type=search]")].find(visible);
    if (!input) return false;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "dont stop believin");
    input.dispatchEvent(new Event("input", { bubbles:true }));
    await sleep(900);
    if (!await tap(() => [...document.querySelectorAll(".fd-ksong .fd-song-use")].find(visible))) return false;
    await sleep(900);
    document.activeElement?.blur?.();
    return document.querySelectorAll(".fd-ksong-video").length === 3;
  }
  /* Float (src/features/float): the profile's Locker (the room's picker, its
     own chunk); the rider's controller closed (its onExit), leaving Home's
     row; the commissioner's desk from its menu row, past the controller a
     playing commissioner closes first */
  if (kind === "profile-locker") {
    if (!await tap(() => [...document.querySelectorAll("header button[aria-label='Your profile']")].find(visible))) return false;
    await sleep(600);
    if (!await tap(() => [...document.querySelectorAll(".fd-profile-sections button")]
      .find(b => visible(b) && b.textContent.trim() === "Locker"))) return false;
    return !!(await until(() => document.querySelector(".fd-float-locker .fll-root, .fd-float-locker select, .fd-float-locker [data-locker]")));
  }
  /* the rider's real controller on the pretend room (mockRoom.js: the real
     room run in the tab), one moment held still: float-pad:<scene> */
  if (kind.startsWith("float-pad:")) {
    const scene = kind.slice("float-pad:".length);
    provideFloatPart("controller", props => React.createElement(FloatController, { ...props,
      connect:options => createMockRoom({ ...options, scene, freeze:true }) }));
    return !!(await until(() => document.querySelector(".fd-float-play .flc-root")?.dataset.screen
      && !document.querySelector(".flc-connecting"), 20000)) && (await sleep(1500), true);
  }
  if (kind === "float-closed" || kind === "float-desk") {
    provideFloatPart("controller", FitController);
    if (await until(() => document.querySelector(".fd-float-play"), kind === "float-closed" ? 6000 : 1500)) {
      const closed = await tap(() => [...document.querySelectorAll(".fd-float-play button")].find(b => visible(b)
        && /close|exit|done|leave/i.test(`${b.getAttribute("aria-label") || ""} ${b.textContent}`)));
      if (!closed || !(await until(() => !document.querySelector(".fd-float-play")))) return false;
      await sleep(400);
    }
    if (kind === "float-closed") return !!document.querySelector(".fd-float-now, .fd-gm-dock");
    const opened = await tap(() => [...document.querySelectorAll("header button[aria-label='Commissioner']")].find(visible));
    if (!opened) return false;
    await sleep(600);
    const ok = await tap(() => [...document.querySelectorAll("[role=dialog] .fd-menu-row")].find(b => visible(b)
      && b.querySelector(".fd-menu-name")?.textContent.trim() === "Float"));
    return ok && !!(await until(() => document.querySelector(".fd-float-desk")));
  }
  /* the profile's Win song section with the saved song (the picker, the
     Win song capability on) */
  if (kind === "profile-song") {
    if (!await tap(() => [...document.querySelectorAll("header button[aria-label='Your profile']")].find(visible))) return false;
    await sleep(600);
    if (!await tap(() => [...document.querySelectorAll(".fd-profile-sections button")]
      .find(b => visible(b) && b.textContent.trim() === "Win song"))) return false;
    await sleep(400);
    return !!document.querySelector(".fd-song-pick");
  }
  if (kind === "install-open") {
    const box = document.querySelector(".fd-weekend-install");
    if (!box) return false;
    box.open = true;
    box.scrollIntoView({ block:"center" });
    return true;
  }
  /* a player card: the first one on the page, or `cardOf`'s (a player id);
     "card-turn" turns it over to its season sheet (the card's own "Turn
     over" button) */
  if (kind === "card-turn") {
    if (!await openSheet("card")) return false;
    await sleep(700);
    const ok = await tap(() => [...document.querySelectorAll("[role=dialog] button[aria-pressed]")]
      .find(b => visible(b) && /Turn over/.test(b.getAttribute("aria-label") || "")));
    await sleep(900);
    return ok && !!document.querySelector(".fd-pass-inner.is-flipped");
  }
  if (kind === "card" || kind === "card-back") {
    const label = scenario.cardOf ? `View ${state.profiles?.[scenario.cardOf]?.display || scenario.cardOf}'s player card` : null;
    const ok = await tap(() => [...document.querySelectorAll("button[aria-label*='player card' i], button[aria-label*='card' i]")]
      .find(b => visible(b) && !b.closest("[role=dialog]") && (!label || (b.getAttribute("aria-label") || "").startsWith(label))));
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
  /* the commissioner's Trivia desk, from its menu row */
  if (kind === "trivia-desk") {
    const opened = await tap(() => [...document.querySelectorAll("header button[aria-label='Commissioner']")].find(visible));
    if (!opened) return false;
    await sleep(600);
    const ok = await tap(() => [...document.querySelectorAll("[role=dialog] .fd-menu-row")].find(b => visible(b)
      && b.querySelector(".fd-menu-name")?.textContent.trim() === "Trivia"));
    return ok && !!(await until(() => document.querySelector(".fd-trivia-desk")));
  }
  /* the Question bank desk, from Trivia's desk: as it opens, a slot's
     alternatives (the Pass the Aux 200 slot, a variant and a repeat), the
     editor (the first card's Edit), the warnings list */
  if (kind.startsWith("qbank-")) {
    if (!await openSheet("trivia-desk")) return false;
    await sleep(400);
    const ok = await tap(() => [...document.querySelectorAll("[role=dialog] .fd-menu-row")].find(b => visible(b)
      && b.querySelector(".fd-menu-name")?.textContent.trim() === "Question bank"));
    if (!ok || !(await until(() => document.querySelector(".fd-qb:not(.is-loading)")))) return false;
    if (kind === "qbank-desk") return true;
    if (kind === "qbank-compare") {
      await tap(() => [...document.querySelectorAll(".fd-qb-cell")].find(b => /^Pass the Aux 200/.test(b.getAttribute("aria-label") || "")));
      const open = !!(await until(() => document.querySelector(".fd-qb-compare")));
      /* the tap scrolls the alternatives into view; audit the sheet from its top */
      await sleep(700);
      document.querySelectorAll(".si-sheet").forEach(sheet => { sheet.scrollTop = 0; });
      return open;
    }
    if (kind === "qbank-edit") {
      await tap(() => [...document.querySelectorAll(".fd-qb-act")].find(b => b.textContent.trim() === "Edit"));
      return !!(await until(() => document.querySelector(".fd-qb-editor")));
    }
    if (kind === "qbank-warnings") {
      await tap(() => document.querySelector(".fd-qb-warnbtn"));
      return !!(await until(() => document.querySelector(".fd-qb-warnings")));
    }
    return false;
  }
  /* the commissioner's Karaoke desk, from its menu row: as it opens (songs
     hidden), and with Show songs and Check videos tapped (the scenario's
     stubbed check answering) */
  if (kind === "karaoke-desk" || kind === "karaoke-desk-shown") {
    const opened = await tap(() => [...document.querySelectorAll("header button[aria-label='Commissioner']")].find(visible));
    if (!opened) return false;
    await sleep(600);
    const ok = await tap(() => [...document.querySelectorAll("[role=dialog] .fd-menu-row")].find(b => visible(b)
      && b.querySelector(".fd-menu-name")?.textContent.trim() === "Karaoke"));
    if (!ok || !(await until(() => document.querySelector(".fd-karaoke-desk")))) return false;
    if (kind === "karaoke-desk") return true;
    const button = text => [...document.querySelectorAll(".fd-karaoke-desk-actions button")].find(b => b.textContent.trim() === text);
    await tap(() => button("Show songs"));
    await tap(() => button("Check videos"));
    await sleep(600);
    return !!document.querySelector(".fd-karaoke-desk-row.is-ready");
  }
  /* the commissioner's Who is coming, Travel sheet and Ready check, from their menu rows */
  if (kind === "roster" || kind === "travel-sheet" || kind === "ready-check" || kind === "settings") {
    const opened = await tap(() => [...document.querySelectorAll("header button[aria-label='Commissioner']")].find(visible));
    if (!opened) return false;
    await sleep(600);
    const name = { roster:"Who is coming", "travel-sheet":"Travel sheet", "ready-check":"Ready check", settings:"Settings" }[kind];
    return tap(() => [...document.querySelectorAll("[role=dialog] .fd-menu-row")].find(b => visible(b)
      && b.querySelector(".fd-menu-name")?.textContent.trim() === name));
  }
  /* the rest of the commissioner's sheets, each from its menu row (the
     desks, the devices, the confirms the Now section opens) */
  const GM_ROWS = { "desk-geo":"Where and When", "desk-awards":"Awards", "desk-trivia":"Trivia", "gm-devices":"Commissioner devices",
    "gm-logistics":"Trip details", "gm-reset":"Reset game progress", "gm-crown":"Crown the champion", "gm-takeback":/^Take back /,
    "gm-unfreeze":"Unfreeze board", "gm-locker":"Back to the locker room" };
  if (GM_ROWS[kind]) {
    const opened = await tap(() => [...document.querySelectorAll("header button[aria-label='Commissioner']")].find(visible));
    if (!opened) return false;
    await sleep(600);
    const want = GM_ROWS[kind];
    const ok = await tap(() => [...document.querySelectorAll("[role=dialog] .fd-menu-row")].find(b => {
      const text = b.querySelector(".fd-menu-name")?.textContent.trim() || "";
      return visible(b) && (want instanceof RegExp ? want.test(text) : text === want);
    }));
    await sleep(900);
    return ok && document.querySelectorAll("[role=dialog]").length > 0;
  }
  /* the pill's own sheet: whatever its beat opens (Enter result, Deal,
     Post the counts, Crown); `pill-placed` also seats the field's first
     three in 1st, 2nd and 3rd */
  if (kind === "pill" || kind === "pill-placed") {
    const ok = await tap(() => document.querySelector(".fd-director-pill"));
    await sleep(900);
    if (!ok || !document.querySelector("[role=dialog]")) return false;
    if (kind === "pill") return true;
    for (let i = 0; i < 3; i++) {
      await tap(() => [...document.querySelectorAll("[role=dialog] .fd-pp-field button")].find(b => visible(b) && !b.disabled
        && !b.closest("[data-placed]") && b.getAttribute("aria-pressed") !== "true"));
      await sleep(450);
    }
    return true;
  }
  /* the commissioner's standings (Home's Standings link) and a ruling
     opened from its first row's Adjust */
  if (kind === "gm-standings" || kind === "gm-adjust") {
    const ok = await tap(() => [...document.querySelectorAll("main a, main button")].find(b => visible(b)
      && /^Standings/.test(b.textContent.trim())));
    await sleep(800);
    if (!ok || !document.querySelector("[role=dialog]")) return false;
    if (kind === "gm-standings") return true;
    const adjusted = await tap(() => [...document.querySelectorAll("[role=dialog] .fd-standing-adjust")].find(visible));
    await sleep(700);
    return adjusted && document.querySelectorAll("[role=dialog]").length > 0;
  }
  /* a captains draft from the pill: Before the draw confirmed as it stands,
     then the captains' setup it opens */
  if (kind === "pill-draft") {
    const ok = await tap(() => document.querySelector(".fd-director-pill"));
    await sleep(700);
    if (!ok || !document.querySelector(".fd-crew-check")) return false;
    await tap(() => document.querySelector(".fd-crew-confirm:not(:disabled)"));
    await sleep(900);
    return !document.querySelector(".fd-crew-check") && !!document.querySelector("[role=dialog]");
  }
  /* Scan the TV: the scanner over a stand-in camera (a canvas stream of a
     room, the TV's code on it for "scan-success"), or a camera the phone
     refused ("scan-denied") */
  if (kind === "scan-open" || kind === "scan-success" || kind === "scan-denied") {
    fakeCamera(kind);
    if (kind === "scan-success") {
      /* hold the seated chip for the shot: the scanner's close timer never fires here */
      const { ARRIVAL_LANDED_MS } = await import("../src/features/arrivals/arrivalsModel.js");
      const later = window.setTimeout;
      window.setTimeout = (fn, ms, ...rest) => ms === ARRIVAL_LANDED_MS ? 0 : later(fn, ms, ...rest);
    }
    const ok = await tap(() => document.querySelector(".fd-arrive, .fd-arrive-row"));
    const want = kind === "scan-open" ? ".fd-scan.is-scanning" : kind === "scan-success" ? ".fd-scan.is-done" : ".fd-scan.is-denied";
    for (let i = 0; i < 60 && !document.querySelector(want); i++) await sleep(150);
    await sleep(kind === "scan-success" ? 700 : 300);
    return ok && !!document.querySelector(want);
  }
  if (kind === "qa") {
    return tap(() => document.querySelector("[data-qa-open]")
      || [...document.querySelectorAll("button")].find(b => visible(b) && b.textContent.trim() === "Console"));
  }
  /* v3.1: the pill's draw beat opens Before the draw */
  if (kind === "crew-check") {
    const ok = await tap(() => document.querySelector(".fd-director-pill"));
    await sleep(500);
    return ok && !!document.querySelector(".fd-crew-check");
  }
  /* the crew check with two players sitting this one out (a playing face,
     then Sit out in the choices it opens in place, twice), the last face
     tapped left open so its choices are on the shot */
  if (kind === "crew-sitout") {
    const ok = await tap(() => document.querySelector(".fd-director-pill"));
    await sleep(500);
    if (!ok || !document.querySelector(".fd-crew-check")) return false;
    for (let i = 0; i < 2; i++) {
      await tap(() => document.querySelector(".fd-crew-seat.is-playing:not(.is-open) .fd-crew-chip:not(:disabled)"));
      await sleep(200);
      await tap(() => document.querySelector(".fd-crew-choice .fd-crew-option.is-out"));
      await sleep(200);
    }
    await tap(() => document.querySelector(".fd-crew-seat.is-out .fd-crew-chip"));
    await sleep(350);
    return document.querySelectorAll(".fd-crew-seat.is-out").length === 2;
  }
  /* the pill's first winner target: the write lands and WON stamps. The
     take-back window holds for the shot (its 10 s timer never fires here;
     a slow run used to shoot the next beat with the Undo already gone) */
  if (kind === "pill-win") {
    const { UNDO_WINDOW_MS } = await import("../src/features/director/DirectorPill.jsx");
    const later = window.setTimeout;
    window.setTimeout = (fn, ms, ...rest) => ms > UNDO_WINDOW_MS - 2000 && ms <= UNDO_WINDOW_MS ? 0 : later(fn, ms, ...rest);
    const ok = await tap(() => document.querySelector(".fd-director-pick"));
    await sleep(700);
    return ok && !!document.querySelector(".fd-director-recent");
  }
  /* a stage final's finish order: the event sheet, 1st tapped into the podium */
  if (kind === "heat-order") {
    const opened = await openSheet("event");
    await sleep(700);
    const ok = opened && await tap(() => [...document.querySelectorAll("[role=dialog] .fd-contest-tile-pick")].find(visible));
    await sleep(400);
    return ok && !!document.querySelector(".fd-contest-tile.is-placed");
  }
  if (kind === "pill-more") {
    return tap(() => document.querySelector("[data-pill-more]"));
  }
  /* the finale's stacks: All stacks from the table card, the commissioner's
     Starting stacks from the pill, and a seated player's Table view */
  if (kind === "poker-stacks") {
    const ok = await tap(() => [...document.querySelectorAll("#fd-poker-table button")].find(b => visible(b)
      && b.textContent.trim() === "All stacks"));
    await sleep(600);
    return ok && !!document.querySelector("[role=dialog] .fd-poker-stacks");
  }
  if (kind === "poker-setup") {
    const ok = await tap(() => document.querySelector(".fd-director-pill"));
    for (let i = 0; i < 40 && !document.querySelector(".fd-stack-row"); i++) await sleep(150);
    await sleep(300);
    return ok && !!document.querySelector(".fd-stack-row");
  }
  if (kind === "table-view") {
    const ok = await tap(() => document.querySelector(".fd-table-view-entry button"));
    await sleep(700);
    return ok && !!document.querySelector(".fd-table-view");
  }
  if (kind === "draft") {
    return tap(() => [...document.querySelectorAll("#fd-main button, main button")].find(b => visible(b)
      && /your pick|open draft|draft/i.test(`${b.getAttribute("aria-label") || ""} ${b.textContent}`)));
  }
  /* "event" opens the live (else the next) event from the Events tab;
     "event-<name>" the row whose name starts with it */
  /* Karaoke's drawn how-to, from Weekend's Games sheet */
  if (kind === "weekend-karaoke") {
    const ok = await tap(() => [...document.querySelectorAll("main button")].find(b => visible(b) && b.textContent.trim() === "Games"));
    await sleep(700);
    return ok && tap(() => [...document.querySelectorAll("[role=dialog] button")].find(b => visible(b) && /Karaoke/.test(b.textContent)));
  }
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
  /* the draw on the phone, replayed from the event sheet's header: once
     mid-turn (draw-replay-mid) and once every card face up */
  if (kind === "draw-replay" || kind === "draw-replay-mid") {
    await tap(() => [...document.querySelectorAll("nav button, footer button")].find(b => visible(b) && b.textContent.trim() === "Events"));
    await sleep(500);
    const opened = await tap(() => document.querySelector(".fd-events-row.is-live .fd-events-open, .fd-events-row.is-pending .fd-events-open")
      || [...document.querySelectorAll(".fd-events-open")].find(visible));
    await sleep(600);
    const replay = opened && await tap(() => [...document.querySelectorAll("[role=dialog] button")].find(b => visible(b) && b.textContent.trim() === "Replay draw"));
    if (!replay) return false;
    await sleep(kind === "draw-replay-mid" ? 1700 : 300);
    if (kind === "draw-replay") {
      await tap(() => [...document.querySelectorAll(".fd-draw-playback-action")].find(b => b.textContent.trim() === "Skip animation"), 4);
      await sleep(500);
    }
    return !!document.querySelector(".fd-draw-pips");
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

/* the stand-in rear camera: a dim room with the TV on its wall, the TV
   showing the check-in code for a scan that lands */
function fakeCamera(kind) {
  const media = navigator.mediaDevices || (navigator.mediaDevices = {});
  if (kind === "scan-denied") {
    media.getUserMedia = () => Promise.reject(Object.assign(new Error("Permission denied"), { name:"NotAllowedError" }));
    return;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 720; canvas.height = 1280;
  const ctx = canvas.getContext("2d");
  const draw = () => {
    const room = ctx.createLinearGradient(0, 0, 0, 1280);
    room.addColorStop(0, "#2a2620"); room.addColorStop(1, "#14110d");
    ctx.fillStyle = room; ctx.fillRect(0, 0, 720, 1280);
    ctx.fillStyle = "#07080d"; ctx.fillRect(40, 330, 640, 400);
    ctx.fillStyle = "#1b2a6a"; ctx.fillRect(52, 342, 616, 376);
    if (kind === "scan-success") {
      const qr = qrcode(0, "M");
      qr.addData(`${location.origin}/?arrive=${FIT_ARRIVE_CODE}`);
      qr.make();
      const n = qr.getModuleCount(), cell = Math.floor(300 / (n + 4)), side = cell * (n + 4);
      const x0 = 360 - side / 2, y0 = 530 - side / 2;
      ctx.fillStyle = "#f4ecd8"; ctx.fillRect(x0, y0, side, side);
      ctx.fillStyle = "#0a0910";
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++)
        if (qr.isDark(r, c)) ctx.fillRect(x0 + (c + 2) * cell, y0 + (r + 2) * cell, cell, cell);
    }
  };
  draw();
  setInterval(draw, 100);
  media.getUserMedia = async () => canvas.captureStream(10);
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
