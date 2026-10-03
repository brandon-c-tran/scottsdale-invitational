import { HowToSheet } from "./features/weekend/HowToSheet.jsx";
import { ContestPanel, useContestOperations } from "./features/weekend/ContestPanel.jsx";
import { GameSteps } from "./features/rules/GameSteps.jsx";
import { EventCrew, EventField, EventPays, EventResult, EventRiding, EventTeams, eventStage } from "./features/weekend/EventSheetParts.jsx";
import { CompetitionBracket } from "./features/weekend/CompetitionBracket.jsx";
import { EventAnnouncement, DrawAnnouncement } from "./features/weekend/EventAnnouncement.jsx";
import { DraftSheet, DraftEntry } from "./features/draft/DraftSheet.jsx";
import { PokerBlinds, PokerSeatChips } from "./features/poker/PokerMotion.jsx";
import { TableViewEntry } from "./features/poker/TableView.jsx";
import { buildEventReveal, pendingReveal, revealReady } from "./features/weekend/drawReveal.js";
import "./features/weekend/event-sheet.css";
import { HomeDuels } from "./features/home/HomeDuels.jsx";
import { GameMark, GAME_MARK_IDS } from "./ui/GameMark.jsx";
import { PayoutLadder } from "./ui/PayoutLadder.jsx";
import { AppHeader, AppNavigation, headerStanding } from "./ui/AppChrome.jsx";
import { FDMark } from "./ui/Brand.jsx";
import { GuestHome, hasGameRules } from "./features/home/GuestHome.jsx";
import { bracketPath, deriveHomeModel } from "./features/home/homeModel.js";
import { guestLedger, updateHaptic, freshResults, resultMarkers, sinceTracker, SINCE_KEY } from "./features/home/guestUpdates.js";
import { haptic, setHapticSurface } from "./lib/haptics.js";
import { VibrationToggle } from "./features/profile/VibrationToggle.jsx";
import { AlertsToggle, usePocketAlerts } from "./features/alerts/Alerts.jsx";
import { SoundToggle } from "./features/profile/SoundToggle.jsx";
import { useSoundSystem, tvKioskCommand } from "./lib/sound.js";
import { lazyPart } from "./lib/lazyPart.js";
import { usePhoneSounds } from "./features/home/phoneSound.js";
import { filterRevealCandidates, introRemainingMs, DRAW_INTRO_MS, DRAW_INTRO_REDUCED_MS } from "./features/weekend/drawReveal.js";
import { Board, postedLine } from "./features/standings/Standings.jsx";
import { Schedule } from "./features/weekend/Schedule.jsx";
import { Guide } from "./features/weekend/Guide.jsx";
import { programCover } from "./features/weekend/programModel.js";
import { Wagers, wagerPickLabel, RACK_DENOMS, mergeWagerLines } from "./features/wagers/Wagers.jsx";
import { DenomStacks, ChipTray } from "./features/poker/PokerChips.jsx";
import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback, useId, lazy, Suspense } from "react";
import { PlayerIdentityProvider } from "./features/identity/PlayerIdentityContext.js";
import { Avatar, AvatarStack, BankChip, BetChipCluster } from "./features/identity/PlayerIdentity.jsx";
import { LogisticsEditor, SizeRow, TravelApparelSheet, TravelFields, VenueCard } from "./features/travel/Travel.jsx";
import { ProfileEditor } from "./features/profile/ProfileEditor.jsx";
import { PlayerSheet } from "./features/profile/PlayerSheet.jsx";
import { savePlayerProfile } from "./features/profile/savePlayerProfile.js";
import { InstallHint } from "./features/check-in/InstallHint.jsx";
import { nextOpenMatch, tvSceneView } from "./features/tv/tvModel.js";
import { serverNow, useServerClockSync } from "./lib/serverClock.js";
import { MotionRoot, useStageHeld } from "./lib/motion.js";
import { currentFrame } from "./lib/frameGate.js";
import { chipSnapshot, freshContestWins, mergeMoments, receiptDock, resultMoment } from "./features/results/resultMoment.js";
import { ChipReceipt } from "./features/results/ChipReceipt.jsx";
import { ChipShower } from "./features/results/ChipShower.jsx";
import { MomentsLayer } from "./features/moments/PhoneMoments.jsx";
import { SkyStrip } from "./features/moments/SkyStrip.jsx";
import { LastCardLayer } from "./features/results/LastCard.jsx";
import { useCrownMoment } from "./features/results/useCrownMoment.js";
import { firstOnboardStep, isStandalone } from "./features/check-in/install.js";
import { CHECK_IN_MARKER, returningAfterClaim, returningFromHello } from "./features/check-in/returning.js";
import {
  ROSTER, AWARDS, awardTable, SPORTS, RATINGS, SESSIONS, SLOT_META, OUTRIGHT_MULT, wagerMult, SIZES, GAMES,
  DUEL_STAKE, DUEL_GAMES, CHIP_COLORS, CHIP_SKINS, PT, maxRisk, CHIP_MIN,
  pokerLive, pokerClock, pokerDenoms, pokerInventory, resultAwards, awardPlan, stacksPosted,
  allEventsOf, disp, shuffle, snakeTeam, teamLabel, stageFinalists, stageEntrantView,
  resolveWager, wagerBoardEvent, resolveDuel, computeStandings, atRisk, ROUND_NAMES, resolveSlot, bracketChampion, EDITION,
  cleanLeg, legTime, eventCapacity, validateEventParticipants,
  coalescePendingReveals, defaultQaParticipants, qaBracketMatchWager, OVERFLOW_ROLES, overflowRoleMeta,
  resolveEventLifecycle, resolveWeekendOperation, resolveCurrentContest, contestBetEligibility, wagerMatchesContest, draftTurn,
  RESET_PROGRESS_CONFIRMATION, DUEL_DAILY_LIMIT, duelAccepted, duelBetween, duelLapsesAt, duelOpen, duelPhase, duelRoom, duelsSentToday,
  presentPlayers, suggestParticipants, teamFit, shapeLabel, refundText, bracketOrder, bracketMatchOpen,
  correctionText, announcementTakeBack, lockerRoomAvailability, postCountRulingApplies,
} from "../shared/core.js";
import { QuickDrawGame } from "./features/duels/QuickDraw.jsx";
import { DuelDesk, openDuelsForDesk } from "./features/duels/DuelDesk.jsx";
import { duelView, hasDuelTurn } from "./features/duels/duelView.js";
import { useDuelClock } from "./features/duels/useDuelClock.js";
import { DirectorPill } from "./features/director/DirectorPill.jsx";
import { CueRack, useWalkoutWatch } from "./features/director/CueRack.jsx";
import { TvHealth } from "./features/director/TvHealth.jsx";
import { CommissionerDock } from "./features/director/CommissionerDock.jsx";
import { AwardsHome } from "./features/awards/AwardsHome.jsx";
import { MvpHome, MvpVoteSheet } from "./features/mvp/MvpHome.jsx";
import { TeamNameCard, TeamNameDesk, TeamNamesHome } from "./features/teams/TeamNameCard.jsx";
import { GeoHome, GeoPlaySheet } from "./features/geo/GeoPlay.jsx";
import { TriviaHome, TriviaPlaySheet } from "./features/trivia/TriviaPlay.jsx";
import { triviaQuestionTotal } from "../shared/trivia.js";
import { JerseySection } from "./features/jersey/Jersey.jsx";
import { TripDetails } from "./features/profile/TripDetails.jsx";
import { cleanBackName, cleanVenmo, jerseyConfirmed, setupTodo } from "../shared/guestSetup.js";
import { WinSongPicker } from "./features/music/WinSongPicker.jsx";
import { deskNote } from "./features/awards/awardsModel.js";
import { directorPill } from "./features/director/directorPill.js";
import { resolveShowScene, resolveDirector } from "../shared/show.js";
import {
  useTournament, dispatch, uploadPhoto, downloadSnapshot, localGet, localSet, setGmToken, hasGmToken,
  reportTvSound, setTvView,
} from "./lib/client.js";

import { Shell } from "./ui/Shell.jsx";
import { usePhaseTheme } from "./ui/usePhaseTheme.js";
import { DISPLAY, SANS, BONE, GOLD_GRAD, CARD_BG, label, pStyle } from "./ui/theme.js";
import { Tag, ActionButton, IconButton, Btn, Sheet, SheetDock } from "./ui/controls.jsx";
import { MenuSections } from "./ui/Menu.jsx";
import { commissionerMenu, moreMenu } from "./features/director/menuModel.js";
import { tvAmbient, tvNowLabel } from "./features/director/tvSheetModel.js";
import { speakerValue } from "./features/speaker/speakerModel.js";
import { useSpeakerStatus } from "./features/speaker/speakerStatus.js";
import { Icon } from "./ui/Icon.jsx";

const Onboarding = lazy(() => import("./features/check-in/Onboarding.jsx")
  .then(module => ({ default:module.Onboarding })));
/* Loaded on first use: the TV's mode, and what only a commissioner opens.
   A commissioner device warms the sheets once it holds the GM view. */
const TVMode = /* @__PURE__ */ lazyPart(() => import("./features/tv/TVMode.jsx"), "TVMode");
const QABar = /* @__PURE__ */ lazyPart(() => import("./features/qa/QABar.jsx"), "QABar");
const QASheet = /* @__PURE__ */ lazyPart(() => import("./features/qa/QASheet.jsx"), "QASheet");
const GeoDesk = /* @__PURE__ */ lazyPart(() => import("./features/geo/GeoDesk.jsx"), "GeoDesk");
const TriviaDesk = /* @__PURE__ */ lazyPart(() => import("./features/trivia/TriviaDesk.jsx"), "TriviaDesk");
const AwardsDesk = /* @__PURE__ */ lazyPart(() => import("./features/awards/AwardsDesk.jsx"), "AwardsDesk");
const PokerSetupSheet = /* @__PURE__ */ lazyPart(() => import("./features/director/FinaleSheets.jsx"), "PokerSetupSheet");
const CrownSheet = /* @__PURE__ */ lazyPart(() => import("./features/director/FinaleSheets.jsx"), "CrownSheet");
const TvSheet = /* @__PURE__ */ lazyPart(() => import("./features/director/TvSheet.jsx"), "TvSheet");
const SpeakerSheet = /* @__PURE__ */ lazyPart(() => import("./features/speaker/SpeakerSheet.jsx"), "SpeakerSheet");
const COMMISSIONER_PARTS = [QABar, QASheet, GeoDesk, TriviaDesk, AwardsDesk, PokerSetupSheet, CrownSheet, TvSheet, SpeakerSheet];


const prefersReducedMotion = () => typeof window !== "undefined" &&
  !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

const fmt = n => (n ?? 0).toLocaleString("en-US");
const ord = n => (n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`);

/* A timed-out write may still have landed: the surface that made it shows
   Checking…, and only a settled failure is worth a toast. */
export function actionFeedback(r, notify, okMsg) {
  if (r?.uncertain) {
    Promise.resolve(r.settled).then(outcome => {
      if (outcome && outcome.ok === false) notify(outcome.error || "Not saved, try again");
      else if (outcome?.ok && okMsg) notify(okMsg);
    }, () => {});
    return r;
  }
  if (!r?.ok) notify(r?.error || "Rejected");
  else if (okMsg) notify(okMsg);
  return r;
}

const SINCE_HOLD_MS = 5 * 60 * 1000;
const DUEL_LAPSE_NOTICE_MS = 15 * 60 * 1000;
const readJson = key => { try { return JSON.parse(localGet(key) || "null"); } catch { return null; } };
const sessionRead = key => { try { return sessionStorage.getItem(key); } catch { return null; } };
const sessionWrite = (key, value) => { try { sessionStorage.setItem(key, value); } catch {} };
function usePageVisible() {
  const [visible, setVisible] = useState(() => typeof document === "undefined" || document.visibilityState !== "hidden");
  useEffect(() => {
    if (typeof document === "undefined") return;
    const update = () => setVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return visible;
}

/* the Field Day mark: a betting chip carrying the sun. Sun-gold chip, bone
   edge ticks like the BankChips on the board, geometric sun at dead center.
   One mark everywhere: header, wordmark, TV, onboarding, and the PWA icons
   (scripts/icons.mjs regenerates them from this same geometry).
   variant "night" swaps the outer ring to bone for dark surfaces. */


const ArtTicket = () => (
  <svg width="58" height="42" viewBox="0 0 56 40" aria-hidden="true">
    <rect x="1.5" y="1.5" width="53" height="37" rx="6" fill="var(--paper)" stroke="var(--ink)" strokeWidth="2"/>
    <line x1="38" y1="4" x2="38" y2="36" stroke="var(--ink)" strokeWidth="2" strokeDasharray="3.5 3.5"/>
    <circle cx="16" cy="20" r="6.5" fill="var(--sun)" stroke="var(--ink)" strokeWidth="2"/>
  </svg>
);
const ArtStar = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 2.6 15 8.6l6.6.9-4.8 4.6 1.2 6.6L12 17.6l-6 3.1 1.2-6.6L2.4 9.5l6.6-.9z"
      fill="var(--sun)" stroke="var(--ink)" strokeWidth="1.6" strokeLinejoin="round"/>
  </svg>
);

/* ─────────── everyone flies in ───────────
   Stylized US, positions from real longitude/latitude, every route drawing
   itself into Scottsdale and a chip running the line behind it. */
/* everything is real geography, projected once: x = (lon+125)/55, y = (49-lat)/24.
   The country is drawn as a dot field rather than a traced coastline, so it
   reads as a map at a glance without a hand-drawn outline to get wrong. */



const CONFETTI_COLORS = ["var(--accent2)","var(--accent)","var(--sun)","var(--bone)","var(--olive)"];
/* pieces are drawn once per burst: a re-render mid-fall must not reshuffle them */
function Confetti({ burst }) {
  const pieces = useMemo(() => burst ? Array.from({length:90}, (_,i) => ({
    left: Math.random()*100, delay: Math.random()*0.5, dur: 2.4 + Math.random()*1.6,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length], size: 5 + Math.random()*8, rot: Math.random()*360,
    drift: (Math.random()-0.5)*180,
  })) : [], [burst]);
  if (!burst) return null;
  return (
    <div key={burst} style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:400,overflow:"hidden"}}>
      {pieces.map((p,i) => (
        <div key={i} style={{ position:"absolute", top:-20, left:`${p.left}%`, width:p.size, height:p.size*0.5,
          background:p.color, opacity:0.95, transform:`rotate(${p.rot}deg)`,
          animation:`si-fall ${p.dur}s ${p.delay}s cubic-bezier(.2,.6,.4,1) forwards`, "--drift":`${p.drift}px` }} />
      ))}
    </div>
  );
}

/* A one-item final row should read as the end of a deliberate roster, not as
   a grid bug. Three-column player racks center it; two-column racks give it
   half width and center it across the row. */
const centeredGridCell = (i, count, columns = 3, gap = 6) => {
  if (i !== count - 1 || count % columns !== 1) return {};
  if (columns % 2) return { gridColumn:String(Math.ceil(columns / 2)) };
  return { gridColumn:"1 / -1", width:`calc(${100 / columns}% - ${gap / 2}px)`, justifySelf:"center" };
};
function PlayerChip({ name, selected, disabled, onClick, small, style }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-pressed={selected} style={{ fontFamily:SANS, fontWeight:600,
      fontSize: small ? 13 : 14, padding: small ? "9px 8px" : "11px 10px", borderRadius:10, width:"100%",
      cursor: disabled ? "default" : "pointer",
      background: selected ? GOLD_GRAD : "var(--paper)",
      color: selected ? "var(--ink0)" : disabled ? "var(--disabled)" : "var(--ink)",
      border: selected ? "1.5px solid var(--ink0)" : "1.5px solid var(--line)",
      opacity: disabled && !selected ? 0.4 : 1, transition:"all .12s",
      overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", ...style }}>{name}</button>
  );
}

function Wordmark({ size=28 }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:size*0.4 }}>
      <FDMark size={size*1.6} />
      <div>
        <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:size*1.25, lineHeight:0.92,
          letterSpacing:"0.015em", textTransform:"uppercase", color:"var(--ink)" }}>Field Day</div>
        <div style={{ fontFamily:SANS, fontWeight:700, fontSize:Math.max(9.5, size*0.34),
          letterSpacing:"0.12em", color:"var(--accent2)", marginTop:3, textTransform:"uppercase" }}>{EDITION.label}</div>
      </div>
    </div>
  );
}
/* two big teams side by side, broadcast style: each side gets a color band and a VS disc sits between */
const SIDE_COLORS = ["var(--pool)", "var(--accent)"];
function VersusDraw({ state, teams, size="md", onPlayer }) {
  const av = size === "lg" ? 34 : 26;
  const f = size === "lg" ? 19 : 14;
  const tf = size === "lg" ? 26 : 17;
  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr auto 1fr", gap: size==="lg" ? 18 : 10, alignItems:"stretch" }}>
      {[teams[0], null, teams[1]].map((t, i) => i === 1 ? (
        <div key="vs" style={{ alignSelf:"center", width: size==="lg" ? 54 : 36, height: size==="lg" ? 54 : 36,
          borderRadius:"50%", background:"var(--sun)", color:"var(--ink0)", display:"flex", alignItems:"center",
          justifyContent:"center", fontFamily:DISPLAY, fontWeight:700, fontStyle:"italic",
          fontSize: size==="lg" ? 24 : 16, border:"2px solid var(--ink)", zIndex:2 }}>VS</div>
      ) : (
        <div key={i} style={{ background:"var(--paper)", border:"1.5px solid var(--ink)", borderRadius:10,
          overflow:"hidden", display:"flex", flexDirection:"column" }}>
          <div style={{ background:SIDE_COLORS[i === 0 ? 0 : 1], color:BONE, fontFamily:DISPLAY, fontWeight:700,
            fontSize:tf, letterSpacing:"0.02em", textTransform:"uppercase", padding: size==="lg" ? "8px 14px" : "5px 11px",
            textAlign: i === 0 ? "left" : "right", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            {teamLabel(state, t)}</div>
          <div style={{ padding: size==="lg" ? "10px 14px" : "8px 11px" }}>
            {t.players.map(p => React.createElement(onPlayer ? "button" : "div", {
                key:p, type:onPlayer ? "button" : undefined,
                onClick:onPlayer ? () => onPlayer(p) : undefined,
                className:onPlayer ? "fd-player-link" : undefined,
                style:{ display:"flex", alignItems:"center", gap:8, padding:"3px 0", width:"100%",
                  flexDirection:i === 0 ? "row" : "row-reverse" } }, <>
                <Avatar state={state} p={p} size={av} />
                <span style={{ fontFamily:SANS, fontWeight:600, fontSize:f, color:"var(--ink)" }}>{disp(state, p)}</span>
              </>)
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ═════════════════════════════ APP ═════════════════════════════ */
export default function App({ onUpdateReload = null }) {
  const tournament = useTournament();
  return <PlayerIdentityProvider profiles={tournament.state.profiles}>
    <TournamentApp tournament={tournament} onUpdateReload={onUpdateReload} />
    <MotionRoot connected={tournament.connected} loaded={tournament.ready} />
  </PlayerIdentityProvider>;
}

function TournamentApp({ tournament, onUpdateReload }) {
  const { state, connected, ready, version, lastAction, environment, capabilities } = tournament;
  useServerClockSync(tournament);
  const [me, setMe] = useState(() => localGet("si-me"));
  const [onboardStep, setOnboardStep] = useState(() => localGet("si-onboard-v5") === "yes" ? 99
    : firstOnboardStep());
  /* the tab and Weekend section survive an update reload in this session */
  const [tab, setActiveTab] = useState(() => {
    const saved = sessionRead("fd-tab");
    return ["board", "sched", "bets", "guide"].includes(saved) ? saved : "board";
  });
  const [weekendSection, setWeekendSection] = useState(() => {
    const saved = sessionRead("fd-weekend-section");
    /* none chosen: Weekend opens on Trip, or on the edition once frozen */
    return ["kept", "trip", "rules", "games", "photos"].includes(saved) ? saved : null;
  });
  useEffect(() => { sessionWrite("fd-tab", tab); }, [tab]);
  useEffect(() => { if (weekendSection) sessionWrite("fd-weekend-section", weekendSection); }, [weekendSection]);
  const tabScroll = useRef({});
  const setTab = next => {
    if (next === tab) { window.scrollTo({ top:0, behavior:"instant" }); return; }
    tabScroll.current[tab] = window.scrollY;
    setActiveTab(next);
  };
  useLayoutEffect(() => { window.scrollTo({ top:tabScroll.current[tab] || 0, behavior:"instant" }); }, [tab]);
  const [gm, setGm] = useState(() => localGet("si-gm") === "yes" && hasGmToken());
  const [qa, setQa] = useState(() => localGet("si-qa") === "yes");
  const [guestLens, setGuestLens] = useState(false);
  const gmView = gm && !guestLens;
  /* a commissioner device fetches its sheets ahead, so none waits on a tap */
  useEffect(() => { if (gm) for (const part of COMMISSIONER_PARTS) part.preload().catch(() => {}); }, [gm]);
  const [sim, setSim] = useState(null);
  const simRef = useRef({ running:false, cancel:false, fast:false });
  const [tv, setTv] = useState(() => typeof window !== "undefined" &&
    (window.location.pathname === "/tv" || new URLSearchParams(window.location.search).has("tv")));
  /* the TV never vibrates, however it got there */
  useEffect(() => { setHapticSurface(tv ? "tv" : "phone"); }, [tv]);
  /* the server counts this device as a TV while it shows TV mode */
  useEffect(() => { setTvView(tv); }, [tv]);
  /* Sheets stack: setModal replaces the stack (open fresh, or null closes
     all), pushModal opens a sheet INSIDE the current one so back returns to
     it. The X and the scrim always close the whole stack. */
  const [modalStack, setModalStack] = useState([]);
  const modal = modalStack[modalStack.length - 1] || null;
  const modalRef = useRef(null);
  modalRef.current = modal;
  const setModal = next => setModalStack(next ? [next] : []);
  const pushModal = next => {
    const scrollTop = document.querySelector(".si-sheet")?.scrollTop || 0;
    setModalStack(stack => [...stack.map((entry,index) => index === stack.length - 1
      ? { ...entry, scrollTop } : entry), next]);
  };
  const popModal = () => setModalStack(stack => stack.slice(0, -1));
  const modalBack = modalStack.length > 1 ? popModal : null;
  useLayoutEffect(() => {
    const sheet = document.querySelector(".si-sheet");
    if (sheet && modal) sheet.scrollTop = modal.scrollTop || 0;
  }, [modal]);
  const [intro, setIntro] = useState(null);
  const [burst, setBurst] = useState(0);
  /* X2 / M19: this phone's own receipt and its own chip shower */
  const [moment, setMoment] = useState(null);
  const [shower, setShower] = useState(0);
  const [toast, setToast] = useState(null);
  const [seenReveals, setSeenReveals] = useState(() => {
    try { return JSON.parse(localGet("si-seen-v5") || "[]"); } catch { return []; }
  });
  const [reveal, setReveal] = useState(null);
  const prevRanks = useRef({});
  const [deltas, setDeltas] = useState({});
  const undoRef = useRef(null);
  const toastTimer = useRef(null);
  const loaded = ready;
  const saveMine = (k, v) => localSet(k, v);
  const qaAllowed = capabilities.qa === true;
  const progressResetAllowed = capabilities.progressReset === true;
  const showControlAllowed = capabilities.showControl === true;
  const audioDirectorAllowed = capabilities.audioDirector === true;
  const audioCatalogAllowed = capabilities.audioCatalog === true;
  useWalkoutWatch(state, gmView && capabilities.audioPlayback === true);
  const qaActive = qaAllowed && qa;
  /* the Speaker row's value: read each time the commissioner menu opens */
  const speakerStatus = useSpeakerStatus(gmView && audioDirectorAllowed && modalStack.at(-1)?.type === "gmMenu");

  const events = useMemo(() => allEventsOf(state), [state]);
  const activeShowScene = useMemo(
    () => showControlAllowed ? resolveShowScene(state, events) : null,
    [showControlAllowed, state, events],
  );
  /* the TV's view of the active scene moves on its own (intro overlay, idle
     fallback), so re-evaluate at its next boundary without a server write */
  const [sceneTick, setSceneTick] = useState(0);
  const tvSceneMode = useMemo(() => tv && activeShowScene ? tvSceneView(activeShowScene, serverNow()) : null,
    [tv, activeShowScene, sceneTick]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!tvSceneMode?.until) return undefined;
    const t = setTimeout(() => setSceneTick(n => n + 1), Math.max(50, tvSceneMode.until - serverNow() + 50));
    return () => clearTimeout(t);
  }, [tvSceneMode?.until]);
  const tvCeremonyHold = !!tvSceneMode?.covers;
  const weekendOperation = useMemo(() => resolveWeekendOperation(state, events), [state, events]);
  /* the session's surfaces, the same phase the TV sky draws */
  const livingPhase = usePhaseTheme({ state, events, operationEvent:weekendOperation.event, settled:ready });
  /* A1: sound follows the surface, the session's room and the walkout hush */
  useSoundSystem({ state, tv, phase:livingPhase });
  /* the pill reads the director; the TV keeps reading weekendOperation so
     director copy never leaks to the room */
  const director = useMemo(
    () => resolveDirector(state, events, { showControl:showControlAllowed }),
    [state, events, showControlAllowed],
  );
  const standings = useMemo(() => computeStandings(state), [state]);
  const allTied = standings.length > 0 && standings[0].pts === standings[standings.length-1].pts && !state.frozen;
  const onDeckEv = state.onDeck && !state.frozen ? events.find(e => e.id === state.onDeck && !state.results[e.id]) : null;
  const wagerEv = useMemo(() => wagerBoardEvent(state, events), [state, events]);
  const wagerMarketOpen = !!wagerEv && resolveCurrentContest(state, wagerEv)?.phase === "betting-open";
  const qaStatus = useMemo(() => {
    const scored = events.filter(ev => !ev.finale && !state.shelved?.[ev.id]);
    const pendingWagers = (state.wagers || []).filter(w =>
      resolveWager(state, w, events).status === "pending").length;
    const openDuels = (state.duels || []).filter(duel => duelOpen(duel)).length;
    return {
      environment,
      version,
      schema:state.v,
      profiles:Object.values(state.profiles || {}).filter(profile =>
        profile && Object.keys(profile).length > 0).length,
      completed:scored.filter(ev => state.results?.[ev.id]).length,
      total:scored.length,
      pendingWagers,
      openDuels,
      current:weekendOperation.event?.name || "No active event",
      phase:weekendOperation.lifecycle?.label || (state.live ? "Weekend live" : "Locker room"),
      next:weekendOperation.nextAction?.label || "No pending action",
      blockers:weekendOperation.lifecycle?.blockers || [],
    };
  }, [environment, version, state, events, weekendOperation]);
  /* nav badges: something on that tab is waiting on this guest */
  const homeModel = useMemo(() => deriveHomeModel({ state, me, events, standings }), [state, me, events, standings]);
  /* the Bets dot is for a market this device has not looked at yet */
  const duelNow = useDuelClock(state);
  const betsContest = homeModel.betting?.canPlace ? resolveCurrentContest(state, homeModel.betting.event) : null;
  const betsKey = betsContest ? `${betsContest.id}:${betsContest.revision}` : null;
  const [betsSeen, setBetsSeen] = useState(() => localGet("si-bets-seen") || "");
  useEffect(() => {
    if (tab !== "bets" || !betsKey || betsSeen === betsKey || onboardStep < 99) return;
    setBetsSeen(betsKey); localSet("si-bets-seen", betsKey);
  }, [tab, betsKey, betsSeen, onboardStep]);
  const navBadges = {
    bets:betsKey && betsSeen !== betsKey ? "betting open" : null,
    board:me && (hasDuelTurn(state, me, duelNow)
      || Object.values(state.drafts || {}).some(draft => { const turn = draftTurn(draft); return turn && !turn.complete && turn.captain === me; }))
      ? "your turn" : null,
  };
  const champion = state.frozen ? standings[0] : null;
  const coChamps = state.frozen ? standings.filter(r => r.rank === 1) : [];
  const introHasQueuedReveal = !!intro && (
    (state.draws?.[intro] && !seenReveals.includes(state.draws[intro].id)) ||
    (state.stages?.[intro] && !seenReveals.includes(state.stages[intro].id))
  );
  /* a device that hears the announcement after the room's intro is over
     goes straight to the draw instead of flashing the intro */
  const shownIntro = introHasQueuedReveal && state.eventOps?.[intro]?.announcedAt
    && introRemainingMs(state, intro, { now:serverNow(), reducedMotion:prefersReducedMotion() }) <= 0 ? null : intro;

  /* chip: a roster name puts that player's claimed chip and number on the
     toast; without one the FD mark carries it. Kills the inbox-notif look. */
  const notify = useCallback((msg, action, tone, chip) => {
    setToast({ msg, action, tone, chip });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), action ? 6000 : tone === "gold" ? 4000 : 2600);
  }, []);

  /* the server stopped treating this phone as the commissioner (its token was
     revoked from another device): leave commissioner mode here too */
  useEffect(() => {
    if (!gm || tv || tournament.gm !== false) return;
    setGmToken(null); setGm(false); saveMine("si-gm", "no"); setModal(null);
    notify("Signed out of commissioner mode");
  }, [gm, tv, tournament.gm, notify]); // eslint-disable-line
  useEffect(() => {
    if (typeof window === "undefined" || !audioDirectorAllowed) return;
    const url = new URL(window.location.href);
    const result = url.searchParams.get("spotify");
    if (!result) return;
    url.searchParams.delete("spotify");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    if (result === "connected") {
      notify("Spotify connected", null, "gold");
      if (gmView) setModal({type:"audioDirector"});
    } else {
      notify(result === "denied" ? "Spotify connection cancelled" : "Spotify connection failed");
    }
  }, [audioDirectorAllowed, gmView, notify]);

  /* a tapped pocket alert opens Home, or the draft for Your pick */
  usePocketAlerts({ connected, you:tournament.you, capabilities, pushKey:tournament.pushKey,
    ready:ready && onboardStep === 99 && !tv, onRoute:route => {
      if (!ready || onboardStep !== 99 || tv) return false;
      const ev = route.reason === "pick" ? events.find(item => item.id === route.ev) : null;
      if (ev && state.drafts?.[ev.id]) setModal({ type:"draft", ev });
      else { setModal(null); setTab("board"); }
      return true;
    } });

  /* re-claim identity on every (re)connect so the server knows who this device is */
  useEffect(() => { if (connected && me) dispatch("claim", { player: me }); }, [connected, me]);

  /* A returning guest in a new storage context (reinstalled app, another
     browser) already has every answer on the server. Their claim, or a hello
     that already knows this device, lands them on Home (check-in/returning.js
     decides; the install gate still comes first). */
  const completeReturningGuest = player => {
    setMe(player); saveMine("si-me", player);
    saveMine(CHECK_IN_MARKER, "yes");
    saveMine("si-onboard-epoch", String(state.onboardEpoch || 0));
    setOnboardStep(99); setTab("board");
  };
  const serverYou = tournament.you || null;
  useEffect(() => {
    if (!ready) return;
    const player = returningFromHello({ localMarker:localGet(CHECK_IN_MARKER), step:onboardStep,
      you:serverYou, state });
    if (player) completeReturningGuest(player);
  }, [ready, onboardStep, serverYou, state]); // eslint-disable-line

  /* The TV's update reload waits until no ceremony is on screen. The TV
     sets the flag itself from what its canvas is actually showing. */
  useEffect(() => {
    if (typeof window !== "undefined" && !tv) window.__FD_CEREMONY__ = !!(intro || reveal);
  }, [intro, reveal, tv]);
  /* A phone's automatic update reload waits while a sheet is open (a
     profile draft or photo lives in one) or check-in drafts are on screen.
     The tab and Weekend section are restored from this session. */
  useEffect(() => {
    if (typeof window !== "undefined")
      window.__FD_HOLD_RELOAD__ = modalStack.length > 0 || (onboardStep >= 0 && onboardStep < 99);
  }, [modalStack.length, onboardStep]);

  /* "Since you looked": one line after an absence, from this device's own
     memory of the last board it showed. Coming back from the background
     only raises a flag: the line is built from the first FRESH state after
     it, and the memory is never rewritten from the stale board still on
     screen. The line opens what it reports and clears once a newer change
     lands or it has been up for a while. */
  const [since, setSince] = useState(null);
  const [settledOpen, setSettledOpen] = useState(false);
  const sinceLive = useRef({});
  sinceLive.current = { state, me, events, standings, version, connected };
  const sinceMemory = useRef(null);
  if (!sinceMemory.current) sinceMemory.current = sinceTracker({ read:() => readJson(SINCE_KEY),
    write:saved => localSet(SINCE_KEY, JSON.stringify(saved)) });
  const sinceShownFor = useRef(null);
  useEffect(() => {
    if (!ready || !me || onboardStep < 99 || typeof document === "undefined") return;
    const summary = sinceMemory.current.observe({ state, me, events, standings, version, connected,
      hidden:document.visibilityState === "hidden" });
    if (!summary) return;
    sinceShownFor.current = state;
    setSince({ ...summary, markers:JSON.stringify(resultMarkers(state)),
      pts:standings.find(row => row.player === me)?.pts });
  }, [ready, me, onboardStep, state, events, standings, version, connected]);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisible = () => {
      if (document.visibilityState === "hidden") sinceMemory.current.hidden(sinceLive.current);
      else sinceMemory.current.visible(sinceLive.current);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
  useEffect(() => {
    if (!since || state === sinceShownFor.current) return;
    const pts = standings.find(row => row.player === me)?.pts;
    if (JSON.stringify(resultMarkers(state)) !== since.markers || pts !== since.pts) setSince(null);
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!since) return undefined;
    const timer = setTimeout(() => setSince(null), SINCE_HOLD_MS);
    return () => clearTimeout(timer);
  }, [since]);
  /* Home's flight question is answered once per device and player */
  const [flightsAnswered, setFlightsAnswered] = useState(false);
  /* Home's Where and When row reopens the guess sheet */
  const [geoForce, setGeoForce] = useState(0);
  /* Home's Trivia row reopens the game */
  const [triviaForce, setTriviaForce] = useState(0);
  useEffect(() => { setFlightsAnswered(!!me && localGet(`si-flights-asked:${me}`) === "yes"); }, [me]);
  const openSince = route => {
    setSince(null);
    const ev = route?.type === "event" ? events.find(item => item.id === route.evId) : null;
    if (ev) setModal({ type:"event", ev });
    else if (route?.type === "settled") { setSettledOpen(true); setTab("bets"); }
    else setModal({ type:"standings" });
  };

  /* X2: one receipt per fresh broadcast that moved this device's player's
     chips, from a before/after diff of their own row split by source. A
     receipt still on screen takes the next one in. A correction is one quiet
     line; a catch-up is the since line's job, and the update the since line
     just reported is not said twice. M19: only this player's own wins shower
     their own chips; other people's results only move numbers. The TV keeps
     its room-wide burst for results; its crown has its own scene (M18). */
  const ledgerRef = useRef(null);
  const snapRef = useRef(null);
  const prevStateRef = useRef(null);
  const resultsSeenRef = useRef(null);
  useEffect(() => {
    if (!ready) return;
    const markers = resultMarkers(state);
    if (tv && resultsSeenRef.current && freshResults(resultsSeenRef.current, state).length) setBurst(b => b + 1);
    resultsSeenRef.current = markers;
    const next = me ? guestLedger(state, me, events, standings) : null;
    const prev = ledgerRef.current;
    ledgerRef.current = next;
    const nextSnap = me ? chipSnapshot(state, me, events, standings) : null;
    const prevSnap = snapRef.current;
    snapRef.current = nextSnap;
    const prevState = prevStateRef.current;
    prevStateRef.current = state;
    if (tv || onboardStep < 99 || sinceShownFor.current === state) return;
    const playing = modalRef.current?.type === "duelPlay" ? modalRef.current.id : null;
    const frame = currentFrame();
    const found = resultMoment({ prev:prevSnap, next:nextSnap, prevState, state, events, frame, skipDuel:playing });
    if (found?.kind === "notice") notify(found.text, null, undefined, me);
    else if (found) setMoment(current => current ? mergeMoments(current, found, { state, prevState, events }) : found);
    if (frame.fresh && me && (found?.celebrate || freshContestWins(prevState, state, me).length)) setShower(n => n + 1);
    const buzz = tv ? null : updateHaptic(prev, next, { state, skipDuel:playing });
    if (buzz) haptic(buzz);
  }, [state, standings, events, me, ready, onboardStep, notify]); // eslint-disable-line react-hooks/exhaustive-deps
  /* A4: the lead, a challenge, your draft turn: sounds only for this phone's own player */
  usePhoneSounds({ state, standings, me, active:ready && !tv && onboardStep >= 99 });
  /* X5: the crown plays once per phone, then Home reopens the last card */
  /* a board settling a contest in place plays first; the receipt follows */
  const stageHeld = useStageHeld();
  const lastCard = useCrownMoment({ state, standings, me, ready, active:!tv && onboardStep >= 99 });

  /* GM can rerun onboarding for everyone; each device compares the epoch it
     finished. A device that finished before it ever stored one adopts the
     current epoch instead of replaying: only a NEW rerun pushes anyone back */
  useEffect(() => {
    if (!ready || onboardStep < 99) return;
    const seen = localGet("si-onboard-epoch");
    if (seen === null || seen === undefined || seen === "") {
      saveMine("si-onboard-epoch", String(state.onboardEpoch || 0));
      return;
    }
    if ((state.onboardEpoch || 0) > Number(seen)) setOnboardStep(firstOnboardStep());
  }, [ready, state.onboardEpoch, onboardStep]); // eslint-disable-line

  /* rank deltas: arrows show what moved in the last update, then clear once
     they have been on screen long enough to be seen */
  useEffect(() => {
    if (allTied) return;
    const d = {};
    standings.forEach(r => {
      const prev = prevRanks.current[r.player];
      if (prev && prev !== r.rank) d[r.player] = prev - r.rank;
    });
    if (Object.keys(d).length) setDeltas(d);
    const map = {}; standings.forEach(r => map[r.player] = r.rank);
    prevRanks.current = map;
  }, [standings, allTied]);
  const pageVisible = usePageVisible();
  const deltasShown = !!Object.keys(deltas).length && pageVisible
    && ((tab === "board" && onboardStep >= 99) || modal?.type === "standings");
  useEffect(() => {
    if (!deltasShown) return;
    const timer = setTimeout(() => setDeltas({}), 8000);
    return () => clearTimeout(timer);
  }, [deltasShown, deltas]);


  /* reveal detection: team draws and stage draws reveal on every phone.
     The intro announces the game first and the reveal comes second, but the
     handover is automatic: one GM tap plays both scenes in order, so nobody
     has to close a card to make the draw appear. If a device reconnects with
     several unseen ceremonies, older ones retire and only the latest plays. */
  /* A Quick Draw run in progress (Steady or the flash) holds every
     announcement and draw ceremony until the tap lands or the run is left. */
  const [duelHold, setDuelHold] = useState(false);
  const introAt = useRef(0);
  const prevOnDeck = useRef("UNSET");
  // An atomic draw + announcement reaches both effects in the same render.
  // Reserve that render for the intro before the reveal can mount.
  const announcementQueued = ready && prevOnDeck.current !== "UNSET" && !!state.onDeck
    && state.onDeck !== prevOnDeck.current && !state.eventOps?.[state.onDeck]?.startedAt
    && !(simRef.current.running && simRef.current.fast);
  useEffect(() => { if (intro) introAt.current = Date.now(); }, [intro]);
  useEffect(() => {
    if (seenReveals === null || (!tv && onboardStep < 99) || reveal || !ready || announcementQueued
      || tvCeremonyHold || duelHold) return;
    /* fast-forward sims should not stack reveal ceremonies; mark them seen silently */
    if (simRef.current.running && simRef.current.fast) {
      const ids = [...Object.values(state.draws || {}), ...Object.values(state.stages || {})]
        .filter(x => x && !seenReveals.includes(x.id)).map(x => x.id);
      if (ids.length) {
        const nx = [...seenReveals, ...ids].slice(-60);
        setSeenReveals(nx); localSet("si-seen-v5", JSON.stringify(nx));
      }
      return;
    }
    /* finished, started or shelved events never replay their draw, and a
       draw prepared for a later event waits (unseen) for its announcement */
    const candidates = filterRevealCandidates(state, { seen:seenReveals, current:weekendOperation.event?.id || null });
    const announced = map => Object.fromEntries(Object.entries(map).filter(([evId]) => revealReady(state, evId)));
    const { staleIds:olderIds, latest } = coalescePendingReveals(announced(candidates.draws), announced(candidates.stages), seenReveals, intro);
    const staleIds = [...candidates.retire, ...olderIds];
    const next = latest ? buildEventReveal(state, events.find(event => event.id === latest.evId), latest.kind) : null;
    if (staleIds.length) {
      const nx = [...seenReveals, ...staleIds].filter((id, index, all) => all.indexOf(id) === index).slice(-60);
      setSeenReveals(nx);
      localSet("si-seen-v5", JSON.stringify(nx));
      return;
    }
    /* built first and shown second: the intro can only be handed over once we
       know something is actually waiting behind it */

    if (!next) return;
    if (intro) {
      /* A solo announcement owns the screen until it closes. Only a reveal
         for that same event is allowed to continue this ceremony. */
      if (next.evId !== intro) return;
      /* let the announcement have its beat, then step aside for the teams
         at the room's shared handoff (server-anchored; see drawReveal.js) */
      const t = setTimeout(() => setIntro(null), introRemainingMs(state, intro, { now:serverNow(),
        localStart:introAt.current, reducedMotion:prefersReducedMotion() }));
      return () => clearTimeout(t);
    }
    setReveal(next);
  }, [state.draws, state.stages, state.onDeck, state.results, state.shelved, state.eventOps, weekendOperation,
    seenReveals, onboardStep, reveal, intro, events, ready, announcementQueued, duelHold, tvCeremonyHold]); // eslint-disable-line
  const rememberReveal = useCallback(id => {
    if (!id) return;
    setSeenReveals(prev => {
      if (prev?.includes(id)) return prev;
      const next = [...(prev || []), id].slice(-60);
      localSet("si-seen-v5", JSON.stringify(next));
      return next;
    });
  }, []);
  const closeReveal = useCallback(() => {
    if (reveal) rememberReveal(reveal.id);
    setReveal(null);
  }, [reveal, rememberReveal]);
  /* While a directed scene covers the TV, legacy ceremonies WAIT: a reveal
     that lands mid-scene is neither shown nor marked seen, and plays as soon
     as the scene ends or hands the TV back. The event-intro scene is itself
     the intro, so the legacy intro for that same event is dropped. Phones
     keep playing the legacy chain. */
  useEffect(() => {
    if (!tv || !intro || tvSceneMode?.mode !== "intro-overlay") return;
    if (tvSceneMode.eventId === intro) setIntro(null);
  }, [tv, intro, tvSceneMode?.mode, tvSceneMode?.eventId]);
  /* Clearing or redrawing an event retires the visual for the old draw
     immediately; a replacement ID can then begin a fresh ceremony. */
  useEffect(() => {
    if (!reveal) return;
    const alive = [...Object.values(state.draws || {}), ...Object.values(state.stages || {})]
      .some(x => x?.id === reveal.id);
    if (!alive) setReveal(null);
  }, [state.draws, state.stages, reveal]);

  /* nudge a captain when the draft comes around to them, once per pick */
  const draftNudge = useRef("");
  useEffect(() => {
    if (!me || !ready) return;
    /* a nudge for a turn that has passed (picked for them, or the draft
       closed) leaves with it */
    const retire = () => setToast(t => t?.draftTurn ? null : t);
    for (const [eid, d] of Object.entries(state.drafts || {})) {
      if (!d?.pool?.length) continue;
      const cur = d.teams[snakeTeam(d.picks.length, d.teams.length)]?.captain;
      if (cur !== me) continue;
      const key = `${d.id}:${d.revision || 0}:${d.picks.length}`;
      if (draftNudge.current === key) return;
      draftNudge.current = key;
      const draftEvent = events.find(e => e.id === eid);
      /* the open draft already says "Your pick": the tick is enough */
      if (modalRef.current?.type === "draft" && modalRef.current.ev?.id === eid) {
        retire();
        if (!tv) haptic("pick");
        return;
      }
      notify("Your pick", draftEvent
        ? { label:"Open draft", fn:() => { setModal({type:"draft",ev:draftEvent}); setToast(null); } } : null, "gold", me);
      setToast(t => t && t.msg === "Your pick" ? { ...t, draftTurn:key } : t);
      if (!tv) haptic("pick");
      return;
    }
    retire();
  }, [state.drafts, me, events, ready]); // eslint-disable-line

  /* a drafted player hears it from the captain who picked them, once */
  const draftPicksSeen = useRef(null);
  useEffect(() => {
    if (!ready) return;
    const seen = new Set();
    let picked = null;
    for (const [eid, d] of Object.entries(state.drafts || {})) {
      (d?.picks || []).forEach((pick, index) => {
        const key = `${d.id}:${index}:${pick.player}`;
        seen.add(key);
        if (draftPicksSeen.current && !draftPicksSeen.current.has(key) && me && pick.player === me)
          picked = { captain:d.teams?.[pick.team]?.captain, ev:events.find(e => e.id === eid) };
      });
    }
    draftPicksSeen.current = seen;
    if (picked?.captain && onboardStep >= 99)
      notify(`${disp(state, picked.captain)} picked you${picked.ev ? ` for ${picked.ev.name}` : ""}`, null, "gold", picked.captain);
  }, [state.drafts, me, events, ready, onboardStep, notify]); // eslint-disable-line

  /* duels: nudge once when a challenge lands on you or an open one appears
     (remembered on this device across reloads), tell the challenger when
     theirs is answered or lapses. Settled duels join the update summary.
     Nothing toasts about the duel the Quick Draw layer is already showing. */
  const duelNudged = useRef(null);
  if (!duelNudged.current) duelNudged.current = new Set(Array.isArray(readJson("si-duel-nudged")) ? readJson("si-duel-nudged") : []);
  const rememberNudge = id => {
    duelNudged.current.add(id);
    localSet("si-duel-nudged", JSON.stringify([...duelNudged.current].slice(-80)));
  };
  useEffect(() => {
    if (!me || !ready || onboardStep < 99) return;
    for (const d of state.duels || []) {
      if (duelNudged.current.has(d.id)) continue;
      const view = duelView(state, d, me);
      let msg = null, action = "View";
      if (view.phase === "offered" && view.recipient)
        msg = `${disp(state, d.from)} challenged you for ${fmt(d.stake)}`;
      else if (view.phase === "offered" && view.takeable)
        msg = `${disp(state, d.from)} challenged anyone for ${fmt(d.stake)}`;
      else if (view.phase === "live" && !d.consent && view.recipient && !view.myRun) {
        msg = `Quick Draw: ${disp(state, d.from)} challenged you`;
        action = "Play";
      }
      if (!msg) continue;
      rememberNudge(d.id);
      if (modal?.type === "duelPlay" && modal.id === d.id) continue;
      notify(msg, { label:action, fn:() => { setModal({ type:"duelPlay", id:d.id }); setToast(null); } }, "gold", d.from);
      return;
    }
  }, [state.duels, me, ready, onboardStep, notify, state, modal]); // eslint-disable-line react-hooks/exhaustive-deps
  /* an offer lapses on the clock, not on a write: wake at the lapse */
  const [lapseTick, setLapseTick] = useState(0);
  useEffect(() => {
    if (!me || !ready || onboardStep < 99) return undefined;
    const now = serverNow();
    let wake = Infinity;
    const lapsed = [];
    for (const d of state.duels || []) {
      if (d.from !== me) continue;
      const phase = duelPhase(d, now);
      if (phase === "offered") { const at = duelLapsesAt(d); if (at) wake = Math.min(wake, at); continue; }
      if (phase !== "lapsed" || duelNudged.current.has(`lapse:${d.id}`)) continue;
      rememberNudge(`lapse:${d.id}`);
      if (now - (duelLapsesAt(d) || 0) <= DUEL_LAPSE_NOTICE_MS) lapsed.push(d);
    }
    if (lapsed.length) {
      const d = lapsed[0];
      notify(d.to ? `${disp(state, d.to)} didn't answer` : "No one took your challenge", null, undefined, d.to || me);
    }
    if (wake === Infinity) return undefined;
    const timer = setTimeout(() => setLapseTick(n => n + 1), Math.max(250, wake - now + 250));
    return () => clearTimeout(timer);
  }, [state.duels, me, ready, onboardStep, lapseTick, notify]); // eslint-disable-line react-hooks/exhaustive-deps
  const prevDuelRes = useRef(null);
  useEffect(() => {
    if (!ready) return;
    const map = {};
    let msg = null;
    (state.duels || []).forEach(d => {
      if (!me || (d.from !== me && d.to !== me)) return;
      const r = resolveDuel(d);
      const st = !r.settled ? duelPhase(d, serverNow()) : r.push ? "push" : r.winner === me ? "won" : "lost";
      map[d.id] = st;
      const before = prevDuelRes.current?.[d.id];
      if (!before || before === st || (modal?.type === "duelPlay" && modal.id === d.id)) return;
      const oth = d.from === me ? d.to : d.from;
      const other = disp(state, oth);
      if (before === "offered" && st === "live" && d.from === me)
        msg = { t:`${other} accepted`, tone:"gold", chip:oth,
          action:{ label:"Play", fn:() => { setModal({ type:"duelPlay", id:d.id }); setToast(null); } } };
      else if (st === "declined" && d.from === me)
        msg = { t:`${other} declined`, chip:oth };
    });
    if (msg && onboardStep >= 99) notify(msg.t, msg.action || null, msg.tone, msg.chip);
    prevDuelRes.current = map;
  }, [state.duels, me, ready, onboardStep, notify, state, modal]);

  /* the blind clock announces itself; no one has to watch it. The interval
     survives broadcasts: it reads fresh state through stateRef. */
  const prevPokerLevel = useRef(null);
  useEffect(() => {
    if (!state.poker?.startedAt) { prevPokerLevel.current = null; return; }
    const iv = setInterval(() => {
      const s = stateRef.current;
      if (!pokerLive(s)) return;
      const clk = pokerClock(s.poker, serverNow());
      if (prevPokerLevel.current !== null && clk.idx > prevPokerLevel.current && onboardStep >= 99)
        notify(`Blinds up: ${fmt(clk.sb)} / ${fmt(clk.bb)}`, null, "gold");
      prevPokerLevel.current = clk.idx;
    }, 1000);
    return () => clearInterval(iv);
  }, [state.poker?.startedAt, notify, onboardStep]); // eslint-disable-line

  /* when betting opens on a new event, it announces itself everywhere. The
     broadcast order is the game, then the teams, then the book: the intro
     fires the moment the event goes on deck, and the draw reveal below waits
     for it to close rather than landing on top of it. */
  useEffect(() => {
    if (!ready) return;
    if (announcementQueued) {
      /* A newer GM announcement supersedes any ceremony still hanging around
         for the previous event. Retire it so it cannot surface again later. */
      if (reveal) {
        if (reveal.evId !== state.onDeck) rememberReveal(reveal.id);
        setReveal(null);
      }
      setIntro(state.onDeck);
    } else if (!state.onDeck) {
      setIntro(null);
    }
    prevOnDeck.current = state.onDeck;
  }, [state.onDeck, ready, reveal, rememberReveal, announcementQueued]);

  /* every mutation is an action; the server validates, applies, broadcasts */
  const act = async (type, payload, okMsg, options) => {
    let r = await dispatch(type, payload, options);
    /* the first game-opening write starts the weekend: one confirm, then the
       same write again with the confirmation */
    if (!r.ok && r.extra?.needsStartConfirm) {
      if (!window.confirm(`${r.extra.event || "This"} starts the weekend.`)) return r;
      r = await dispatch(type, { ...(payload || {}), startWeekend:true }, options);
    }
    return actionFeedback(r, notify, okMsg);
  };

  const saveProfile = async (p, prof) => {
    const result = await savePlayerProfile({ player:p, profile:prof,
      save:(player, fields) => dispatch("saveProfile", { player, ...fields }), upload:uploadPhoto });
    if (!result.ok) notify(result.error);
    return result;
  };
  const saveSeeds = r => act("saveSeeds", { player: me, ratings: r });
  const saveResult = (ev, slots, options = {}) =>
    act("saveResult", { evId:ev.id, slots, ...options });
  const clearResult = (ev, correctionReason) =>
    act("clearResult", { evId:ev.id, confirmClear:true, correctionReason });
  const contestRef = ev => {
    const contest = ev && resolveCurrentContest(state, ev);
    return contest ? { contestId:contest.id, contestRevision:contest.revision } : {};
  };
  const setOnDeck = id => act("setOnDeck", { id, ...contestRef(events.find(ev => ev.id === (id || state.onDeck))) });
  const startShowScene = request =>
    act("startShowScene", request, null, { retry:true });
  const advanceShowScene = id =>
    act("advanceShowScene", { id }, null, { retry:true });
  const endShowScene = (id, outcome) =>
    act("endShowScene", { id, outcome }, null, { retry:true });
  const retryShowScene = id =>
    act("retryShowScene", { id }, null, { retry:true });
  const startEvent = ev => act("startEvent", { evId:ev.id, ...contestRef(ev) }, `${ev.name} is underway`);
  const announceEvent = ev => act("announceEvent", { evId:ev.id, ...contestRef(ev) }, `${ev.name} is on deck`);
  /* the draw and its announcement land in one write: intro first, then teams */
  const announceAndDraw = (ev, players, roles, cfg) => act("announceAndDraw", { evId:ev.id,
    ...(Array.isArray(players) && players.length ? { players, roles:roles || [] } : {}),
    ...(cfg ? { cfg:{ nGroups:cfg.nGroups, advance:cfg.advance } } : {}) }, `${ev.name} is on deck`);
  /* corrects any recorded contest; the toast names what moved */
  const undoLastContest = async (ev, reference) => {
    const result = await act("correctContest", { evId:ev.id, ...reference }, null, {retry:true});
    const moved = result.ok ? correctionText(state, result.extra || {}) : "";
    if (moved) notify(moved);
    return result;
  };
  const playContestNext = (ev, payload) => act("playContestNext", { evId:ev.id, ...payload }, null, {retry:true});
  const withRefunds = (text, result) => {
    const returned = result?.ok ? refundText(state, result.extra?.refunds || []) : "";
    if (result?.ok) notify(returned ? `${text}. ${returned}` : text);
    return result;
  };
  const swapPlayer = async (ev, out, into) => withRefunds(`${disp(state, into)} in for ${disp(state, out)}`,
    await act("swapPlayer", { evId:ev.id, out, into }));
  const setAway = async (player, away) => {
    const result = await act("setAway", { player, away });
    return result.extra?.refunds?.length ? withRefunds(`${disp(state, player)} away`, result) : result;
  };
  const takeBackAnnouncement = async ev => withRefunds(`${ev.name} taken back`,
    await act("takeBackAnnouncement", { evId:ev.id }));
  const returnToLockerRoom = () => act("returnToLockerRoom", {}, "Back in the locker room");
  const lockAndStart = (ev, reference) => {
    const contest = resolveCurrentContest(state, ev);
    return act("lockAndStart", { evId:ev.id, contestId:contest?.id, contestRevision:contest?.revision, ...reference }, "Bets locked", { retry:true });
  };
  const recordContestWinner = (ev, result) => act("recordContestWinner", { evId:ev.id, ...result }, "Winner recorded", { retry:true });
  const openResultEntry = async ev => {
    if (!state.results[ev.id] && resolveEventLifecycle(state, ev).phase !== "result-entry") {
      const opened = await act("beginResultEntry", { evId:ev.id });
      if (!opened.ok) return opened;
    }
    setModal({ type:"result", ev });
    return { ok:true };
  };
  const shelveEvent = async (id, on, confirmReturn) => {
    const result = await act("shelve", { id, on, ...(confirmReturn ? { confirmReturn:true } : {}) });
    const returned = result.ok && !on ? refundText(state, result.extra?.refunds || []) : "";
    if (returned) notify(returned);
    return result;
  };
  const addCustomEvent = ev => act("addEvent", { ev });
  const editEvent = (id, patch) => act("editEvent", { id, patch }, "Saved");
  const reorderEvents = ids => act("reorderEvents", { ids });
  const removeCustomEvent = ev => {
    dispatch("removeEvent", { id: ev.id }).then(r => {
      if (!r.ok) return notify(r.error || "Rejected");
      undoRef.current = r.extra?.snapshot || null;
      notify(`${ev.name} removed`, { label:"Undo", fn: () => {
        const u = undoRef.current; if (!u) return;
        act("restoreEvent", { snapshot: u });
        undoRef.current = null; setToast(null);
      }});
    });
  };
  const runDraw = (ev, players, roles = []) => act("runDraw", { evId: ev.id, players, roles });
  const clearDraw = ev => act("clearDraw", { evId: ev.id });
  const startDraft = (evId, captains, players, roles = []) =>
    act("startDraft", { evId, captains, players, roles }, null, {retry:true});
  const pickDraftPlayer = (evId, player, reference) => act("pickDraftPlayer", { evId, player, ...reference }, null, {retry:true});
  const undoDraftPick = (evId, reference) => act("undoDraftPick", { evId, ...reference }, null, {retry:true});
  const finalizeDraft = (evId, reference) => act("finalizeDraft", { evId, ...reference }, null, {retry:true});
  const cancelDraft = (evId, reference) => act("cancelDraft", { evId, ...reference }, null, {retry:true});
  const runStages = (ev, cfg) => act("runStages", { evId: ev.id, cfg });
  const clearStages = ev => act("clearStages", { evId: ev.id });
  const toggleThrough = (evId, g, key) => act("toggleThrough", { evId, g, key });
  const setFinalWinner = (evId, key) => act("setFinalWinner", { evId, key });
  const pickBracketWinner = (evId, r, m, teamIdx) => act("pickBracketWinner", { evId, r, m, teamIdx });
  const pickChip = (color, skin) => act("pickChip", { player: me, color, skin });
  const pokerSetup = () => act("pokerSetup", {});
  const pokerStart = () => act("pokerStart", {}, "Cards are live");
  const pokerLevelNudge = delta => act("pokerLevel", { delta });
  const pokerPause = paused => act("pokerPause", { paused }, paused ? "Clock paused" : "Clock running");
  const pokerBust = player => act("pokerBust", { player });
  const pokerUnbust = player => act("pokerUnbust", { player });
  const pokerResult = () => act("pokerResult", {}, "Counts posted");
  const pokerCount = (player, count) => act("pokerCount", { player, count });
  const pokerCancel = () => act("pokerCancel", {}, "Table cleared");
  /* duel writes report their errors inline on the surface that made them.
     The transport resends a lost request once; the server acknowledges a
     resend without applying it twice. */
  const duelAct = (type, payload) => dispatch(type, payload, { retry:true });
  const openDuel = id => setModal({ type:"duelPlay", id });
  const sendDuel = (to, stake, open = false) => duelAct("sendDuel",
    open ? { open:true, game:"quickdraw", stake } : { to, game:"quickdraw", stake });
  const duelSent = result => (result?.extra?.id ? openDuel(result.extra.id) : setModal(null));
  const acceptDuel = id => duelAct("acceptDuel", { id }).then(r => { if (r.ok) openDuel(id); return r; });
  const playDuelRun = (id, ms, foul) => duelAct("playDuel", { id, ms, foul });
  const declineDuel = id => duelAct("declineDuel", { id });
  const withdrawDuel = id => duelAct("withdrawDuel", { id });
  const voidDuel = id => duelAct("voidDuel", { id });
  const voidOpenDuels = () => duelAct("voidOpenDuels", {}).then(r => {
    if (r.ok && r.extra?.count) notify(`${r.extra.count} open duel${r.extra.count === 1 ? "" : "s"} voided`);
    return r;
  });
  const rematchDuel = duel => sendDuel(duel.from === me ? duel.to : duel.from, duel.stake)
    .then(r => { if (r.ok) duelSent(r); return r; });
  const placeWager = w => act("placeWager", { wager: w }, null, { retry:true });
  const retractWager = (id, reference) => act("retractWager", { id, ...reference }, null, { retry:true });
  const voidWager = id => act("voidWager", { id });
  const addAdjust = (player, delta, reason) => act("adjust", { player, delta, reason }, null, { retry:true });
  const setFrozen = f => act("setFrozen", { f });
  const resetGame = () => act("resetTournament", {
    confirm:RESET_PROGRESS_CONFIRMATION,
  }, "Game progress reset");
  /* two taps AND an explicit force, because this is the only control that
     discards guest input. The dry run tells us how many people it costs. */
  const rerunOnboard = async () => {
    const probe = await dispatch("rerunOnboarding", {});
    const n = probe.extra?.signedUp?.length || 0;
    if (probe.ok) return notify("Check-in reopens on every phone");
    if (!n) return notify(probe.error || "Rejected");
    const who = probe.extra.signedUp.map(p => disp(state, p)).join(", ");
    if (!window.confirm(`${n} ${n === 1 ? "person has" : "people have"} checked in:\n${who}\n\n`
      + "Rerunning releases every claimed chip color.\nTheir names, numbers, sizes and flights are kept.\n\nRerun anyway?"))
      return notify("Check-in not reopened");
    act("rerunOnboarding", { force: true }, "Check-in reopens on every phone");
  };
  /* replay the whole flow on THIS device, from the install gate. Clears the
     local finished flags so a reload keeps replaying instead of snapping to
     the board: the epoch handshake is for the group, this is for one phone */
  const replayOnboardHere = () => {
    saveMine("si-onboard-v5", "");
    saveMine("si-onboard-epoch", "0");
    /* hand your color back so the re-pick is a real claim again */
    if (me && !state.live) act("pickChip", { player: me, color: null, skin: null });
    setModal(null);
    setOnboardStep(firstOnboardStep());
  };
  const toggleQa = () => {
    if (!qaAllowed) return notify("QA mode is unavailable");
    setQa(v => { saveMine("si-qa", v ? "no" : "yes"); return !v; });
  };

  /* ── QA simulation driver ──
     Plays the weekend through real actions on this device's socket, claiming
     each player in turn, so every connected phone and the TV see exactly the
     broadcasts a live weekend would produce. Always re-claims your identity. */
  const stateRef = useRef(state); stateRef.current = state;
  const rnd = a => a[Math.floor(Math.random() * a.length)];
  const simWait = ms => new Promise((res, rej) => setTimeout(() =>
    simRef.current.cancel ? rej(new Error("stopped")) : res(), simRef.current.fast ? Math.min(ms, 120) : ms));
  const simDo = async (type, payload, lbl) => {
    if (simRef.current.cancel) throw new Error("stopped");
    if (lbl) setSim(lbl);
    let r = await dispatch(type, payload);
    /* a rehearsal is a deliberate run: it confirms the weekend start itself */
    if (!r.ok && r.extra?.needsStartConfirm) r = await dispatch(type, { ...(payload || {}), startWeekend:true });
    if (!r.ok) throw new Error(r.error || type);
    return r;
  };
  /* per-player nice-to-haves (bets, chips, duel runs) go through simTry:
     one rejection skips that player, structural steps stay on simDo */
  const simTry = async (type, payload, lbl) => {
    if (simRef.current.cancel) throw new Error("stopped");
    if (lbl) setSim(lbl);
    return dispatch(type, payload);
  };
  const simCheckIn = async () => {
    for (const p of ROSTER) {
      const s = stateRef.current;
      const prof = s.profiles?.[p] || {};
      /* NEVER write over a real person. Once the invite is out, these slots
         hold answers Brandon is going to order shirts and plan pickups from,
         and filling a blank field with a plausible fake is worse than leaving
         it blank: nothing downstream can tell the two apart. A player is
         fair game only while every field is still empty. */
      const touched = prof.display || prof.num !== undefined || prof.size || prof.color
        || prof.skin || prof.flightsBooked !== undefined || prof.flightIn || prof.flightOut || s.seeds?.[p];
      if (touched) continue;
      const needProfile = true, needSeeds = true, needChip = true;
      await simDo("claim", { player: p }, `${p} checks in`);
      if (needProfile) {
        const taken = new Set(Object.entries(stateRef.current.profiles || {})
          .filter(([q]) => q !== p).map(([, pr]) => pr?.num).filter(n => n !== undefined));
        let num = prof.num !== undefined ? prof.num : ROSTER.indexOf(p) + 1;
        while (taken.has(num)) num = Math.floor(Math.random() * 100);
        await simDo("saveProfile", { player: p, display: prof.display || p,
          num, size: prof.size || rnd(SIZES), flightsBooked:false });
      }
      if (needSeeds) {
        const ratings = {}; SPORTS.forEach(sp => { ratings[sp.id] = rnd(RATINGS).v; });
        await simDo("saveSeeds", { player: p, ratings });
      }
      if (needChip) {
        const used = new Set(Object.values(stateRef.current.profiles || {}).map(pr => pr?.color));
        const open = CHIP_COLORS.filter(c => !used.has(c.hex));
        if (open.length) await simTry("pickChip", { player: p, color: rnd(open).hex, skin: rnd(CHIP_SKINS) });
      }
      await simWait(120);
    }
  };
  const simBetsRound = async () => {
    const evId = stateRef.current.onDeck;
    if (!evId) throw new Error("Open betting on an event first");
    const bettors = shuffle(ROSTER).slice(0, 9);
    for (let bettorIndex = 0; bettorIndex < bettors.length; bettorIndex++) {
      const p = bettors[bettorIndex];
      const s = stateRef.current;
      const events2 = allEventsOf(s);
      const ev = events2.find(e => e.id === evId);
      if (!ev || s.results[evId] || s.onDeck !== evId) break;
      const pts = computeStandings(s).find(r => r.player === p)?.pts ?? 0;
      const exp = atRisk(s, p, events2);
      const room = Math.min(maxRisk(pts) - exp, pts - exp);
      if (room < PT) continue;
      const stake = Math.min(Math.floor(room / PT) * PT, rnd([PT, PT, 2 * PT, 2 * PT, 3 * PT, 5 * PT]));
      const contest = resolveCurrentContest(s, ev);
      if (contest?.phase !== "betting-open") continue;
      const side = rnd(contest.sides.filter(item => contestBetEligibility(contest,p,item.key)));
      if (!side) continue;
      const wager = { eventId:evId, evName:ev.name, contestId:contest.id, contestRevision:contest.revision,
        pickPlayers:[...side.players], pickTeam:!!contest.drawId, drawId:contest.drawId, stake };
      if (contest.kind === "ffa") Object.assign(wager,{kind:"outright",pick:side.key});
      else if (contest.kind === "match") Object.assign(wager,{kind:"match",match:contest.match,teamIdx:side.key});
      else Object.assign(wager,{kind:contest.kind === "heat" ? "heat" : "stage", stagesId:contest.stagesId,
        group:contest.group, groupName:contest.label, final:contest.kind === "stage-final", pickKey:side.key});
      await simDo("claim", { player: p });
      await simTry("placeWager", { wager }, p + " puts " + stake + " on " + side.players.map(player=>disp(s,player)).join(" & "));
      await simWait(700);
    }
  };
  /* heats for Beerio Kart, so the stage machinery gets exercised; everything
     else keeps its native format */
  const SIM_HEAT_IDS = ["beerio"];
  const simEnsureFormat = async ev => {
    const s = stateRef.current;
    if (s.results[ev.id]) return;
    if (ev.teamCfg && !s.draws[ev.id]) {
      /* the same default the director offers: everyone here, rotating crew */
      const suggestion = suggestParticipants(s, ev);
      if (!suggestion) throw new Error(`Not enough players here for ${ev.name}`);
      await simDo("runDraw", { evId: ev.id, players:suggestion.players, roles:suggestion.roles }, `Drawing ${ev.name}`);
      await simWait(1300);
    }
    const s2 = stateRef.current;
    if (s2.stages[ev.id]) return;
    if (ev.kind === "solo" && SIM_HEAT_IDS.includes(ev.id)) {
      await simDo("runStages", { evId: ev.id, cfg: { kind:"heats", nGroups:3, advance:1, players: presentPlayers(s2) } },
        `Splitting ${ev.name} into heats`);
      await simWait(600);
    } else if (ev.teamCfg && !ev.teamCfg.bracket && (s2.draws[ev.id]?.teams?.length ?? 0) >= 4) {
      await simDo("runStages", { evId: ev.id, cfg: { kind:"pools", nGroups:2, advance:1 } },
        `Splitting ${ev.name} into pools`);
      await simWait(600);
    }
  };
  const simPlayEvent = async () => {
    await simCheckIn();
    const s0 = stateRef.current;
    const ev = allEventsOf(s0).find(e => !s0.results[e.id] && !s0.shelved[e.id]);
    if (!ev) throw new Error("Nothing left to play");
    if (ev.finale) throw new Error("The finale is poker, run it from the table");
    const table = awardTable(ev);
    await simEnsureFormat(ev);
    if (!stateRef.current.eventOps?.[ev.id]?.startedAt && stateRef.current.onDeck !== ev.id)
      await simDo("setOnDeck", { id:ev.id }, "Betting opens on " + ev.name);
    for (;;) {
      const snapshot = stateRef.current;
      const contest = resolveCurrentContest(snapshot,ev);
      if (!contest || contest.phase === "awaiting-result") break;
      const reference = { contestId:contest.id, contestRevision:contest.revision };
      if (contest.phase === "betting-open") { await simWait(600); await simBetsRound(); }
      if (["betting-open","betting-locked"].includes(contest.phase))
        await simDo("lockAndStart", {evId:ev.id,...reference}, contest.label + " is underway");
      if (contest.kind === "ffa") break;
      const picks = shuffle(contest.sides.map(side=>side.key));
      await simDo("recordContestWinner", {evId:ev.id,...reference,winner:picks[0],
        qualifiers:picks.slice(0,contest.kind === "heat" ? snapshot.stages[ev.id].advance : 1)},
        "Recording the " + contest.label + " winner");
      await simWait(900);
    }
    let br;
    const s1 = stateRef.current;
    const draw = s1.draws[ev.id];
    const st = s1.stages[ev.id];
    br = s1.brackets[ev.id];
    let slots;
    if (st && stageFinalists(st) && st.finalWinner !== null && st.finalWinner !== undefined) {
      /* podium from the stages: final winner, then the other finalists */
      const podium = [st.finalWinner, ...shuffle(stageFinalists(st).filter(k => k !== st.finalWinner))];
      slots = [0, 1, 2].map(i => table[i] > 0 && podium[i] !== undefined
        ? [...stageEntrantView(s1, st, podium[i]).players] : []);
      if (slots[0].length === 0) slots[0] = [...stageEntrantView(s1, st, podium[0]).players];
    } else if (br && draw) {
      const champ = bracketChampion(br);
      const final = br.rounds[br.rounds.length - 1][0];
      const a = resolveSlot(br, final.a), b = resolveSlot(br, final.b);
      const runner = champ === a ? b : a;
      /* third: a random semifinal loser when the table pays 3 deep */
      let third = null;
      if (table[2] > 0 && br.rounds.length >= 2) {
        const losers = br.rounds[br.rounds.length - 2]
          .map(mu => { const x = resolveSlot(br, mu.a), y = resolveSlot(br, mu.b);
            return mu.winner === x ? y : mu.winner === y ? x : null; })
          .filter(t => t !== null && t !== champ && t !== runner);
        third = losers.length ? rnd(losers) : null;
      }
      slots = [[...draw.teams[champ].players],
        table[1] > 0 && runner !== null ? [...draw.teams[runner].players] : [],
        third !== null ? [...draw.teams[third].players] : []];
    } else if (draw) {
      const order = shuffle(draw.teams.map((_, i) => i));
      slots = [[...draw.teams[order[0]].players],
        table[1] > 0 && order[1] !== undefined ? [...draw.teams[order[1]].players] : [],
        table[2] > 0 && order[2] !== undefined ? [...draw.teams[order[2]].players] : []];
    } else {
      const order = shuffle(ROSTER);
      slots = [[order[0]], table[1] > 0 ? [order[1]] : [], table[2] > 0 ? [order[2]] : []];
    }
    await simDo("beginResultEntry", { evId:ev.id }, `Opening the ${ev.name} scorecard`);
    await simDo("saveResult", { evId: ev.id, slots, noScene:true }, `Posting the ${ev.name} result`);
    await simWait(800);
  };
  /* duels between sim players; me never sends, so my 3-a-day stays free */
  const simDuelPools = s => {
    const events2 = allEventsOf(s);
    const rows = computeStandings(s);
    const spendable = p => duelRoom(s, p, { events:events2, rows }).room;
    const canSend = p => p !== me && spendable(p) >= DUEL_STAKE && duelsSentToday(s, p) < DUEL_DAILY_LIMIT;
    const canFace = (a, b) => !duelBetween(s, a, b);
    return { spendable, canSend, canFace };
  };
  const simDuelRun = () => Math.random() < 0.1
    ? { ms: 40, foul: true } : { ms: 160 + Math.floor(Math.random() * 300) };
  const simDuels = async (n = 3) => {
    for (let i = 0; i < n; i++) {
      const s = stateRef.current;
      if (pokerLive(s) || s.frozen) return;
      const { spendable, canSend, canFace } = simDuelPools(s);
      const senders = shuffle(ROSTER.filter(canSend));
      let from = null, to = null;
      for (const f of senders) {
        const tos = ROSTER.filter(q => q !== f && q !== me && spendable(q) >= DUEL_STAKE && canFace(f, q));
        if (tos.length) { from = f; to = rnd(tos); break; }
      }
      if (!from) return;
      await simDo("claim", { player: from });
      const r = await simTry("sendDuel", { to, game:"quickdraw" }, `${from} challenges ${to}`);
      if (!r.ok || !r.extra?.id) continue;
      const id = r.extra.id;
      await simWait(400);
      await simDo("claim", { player: to });
      const accepted = await simTry("acceptDuel", { id }, `${to} accepts`);
      if (!accepted.ok) continue;
      await simTry("playDuel", { id, ...simDuelRun() }, `${to} draws`);
      await simDo("claim", { player: from });
      await simTry("playDuel", { id, ...simDuelRun() }, `${from} draws`);
      await simWait(600);
    }
  };
  /* a sim player challenges you; after you accept and draw, they draw */
  const simDuelMe = async () => {
    if (!me) throw new Error("Pick who you are first");
    const s = stateRef.current;
    if (pokerLive(s)) throw new Error("The finale is live");
    if (s.frozen) throw new Error("The board is frozen");
    const { canSend, canFace } = simDuelPools(s);
    const from = rnd(ROSTER.filter(p => canSend(p) && canFace(p, me)));
    if (!from) throw new Error("Nobody can afford a challenge");
    await simDo("claim", { player: from });
    const sent = await simDo("sendDuel", { to: me, game:"quickdraw" }, `${from} challenges you`);
    const id = sent.extra?.id;
    await simDo("claim", { player: me });
    if (!id) return;
    for (let waited = 0; waited < 180; waited++) {
      const duel = (stateRef.current.duels || []).find(d => d.id === id);
      if (!duel || !duelOpen(duel)) return;
      if (duelAccepted(duel) && duel.runs?.[me]) break;
      await simWait(500);
    }
    const duel = (stateRef.current.duels || []).find(d => d.id === id);
    if (!duel || !duelAccepted(duel) || !duel.runs?.[me]) return;
    await simDo("claim", { player: from });
    await simTry("playDuel", { id, ...simDuelRun() }, `${from} draws`);
  };
  const simPokerAlive = () => (stateRef.current.poker?.seats || ROSTER).filter(q =>
    !(stateRef.current.poker?.outs || []).some(o => o.player === q));
  const runSim = (fn, fast = false) => () => {
    if (simRef.current.running) return;
    simRef.current = { running: true, cancel: false, fast };
    (async () => {
      try { await fn(); setSim(null); notify("Sim complete"); }
      catch (e) { setSim(null); notify(e.message === "stopped" ? "Sim stopped" : "Sim halted: " + e.message); }
      finally { simRef.current.running = false; if (me) dispatch("claim", { player: me }); }
    })();
  };
  const stopSim = () => { simRef.current.cancel = true; };
  /* standalone helpers refuse to poke a table with cards in the air */
  const qaGuard = fn => () => {
    const s = stateRef.current;
    if (pokerLive(s)) return notify("The finale is live");
    if (s.frozen) return notify("The board is frozen");
    runSim(fn)();
  };
  const unlockGm = pin => dispatch("gmUnlock", { pin }).then(r => {
    if (!r.ok) return notify(r.error || "Wrong passcode");
    setGmToken(r.extra?.gmToken); setGm(true); saveMine("si-gm", "yes");
    setModal(null); notify("Commissioner mode on");
  });
  /* leaving commissioner mode signs this device's token out on the server */
  const exitGm = async () => {
    await dispatch("gmExit", {});
    setGmToken(null); setGm(false); saveMine("si-gm", "no"); setModal(null);
  };
  const switchPlayer = (p, close = true) => {
    setMe(p);
    saveMine("si-me", p);
    dispatch("claim", { player:p });
    if (close) setModal(null);
    notify(`Now viewing as ${p}`, null, undefined, p);
  };


  /* The pill: directorPill turns the director's beat into targets. A write
     goes straight to the server; an open names the sheet or view. */
  const pillModel = gmView && ready ? directorPill(state, events, director, { me }) : null;
  const DIRECTOR_TOASTS = {
    announceEvent:p => `${events.find(e => e.id === p.evId)?.name || "Event"} is on deck`,
    announceAndDraw:p => `${events.find(e => e.id === p.evId)?.name || "Event"} is on deck`,
    lockAndStart:() => "Bets locked",
    startEvent:() => "Started",
  };
  /* through act(): it owns the weekend-start confirm and the error toast */
  const directorWrite = (type, payload) => act(type, payload, null, { retry:true }).then(r => {
    if (r.ok && !r.extra?.unchanged && DIRECTOR_TOASTS[type]) notify(DIRECTOR_TOASTS[type](payload));
    return r;
  });
  const directorOpen = run => {
    const ev = run.evId ? events.find(e => e.id === run.evId) : null;
    if (run.tab) return setTab(run.tab);
    if (run.open === "pokerClock") {
      setModal(null); setTab("board");
      setTimeout(() => document.getElementById("fd-poker-table")?.scrollIntoView({ block:"start", behavior:"smooth" }), 80);
      return;
    }
    if (run.open === "resultEntry") return ev && openResultEntry(ev);
    if (run.open === "draft") return ev && setModal({ type:"draft", ev, pool:run.pool, roles:run.roles });
    if (run.open === "announceDraw") return ev && setModal({ type:"announceDraw", ev, players:run.players,
      roles:run.roles, changing:!!run.changing });
    if (["event", "bracket", "result", "skipEvent"].includes(run.open)) return ev && setModal({ type:run.open, ev });
    if (["pokerSetup", "pokerResult", "crown"].includes(run.open)) return setModal({ type:run.open });
  };
  const crownReady = director.nextAction?.type === "crown-champion" && !state.frozen;
  const dealAndStart = async () => {
    const dealt = await dispatch("pokerSetup", {}, { retry:true });
    if (!dealt.ok) return dealt;
    const started = await dispatch("pokerStart", {}, { retry:true });
    if (started.ok) { setModal(null); notify("Cards are live"); }
    return started;
  };
  const crownChampion = async champions => {
    const result = await dispatch("crownChampion", { champions }, { retry:true });
    if (result.ok) { setModal(null); setTab("board"); }
    return result;
  };

  if (tv) {
    return (
      <Shell tv environment={environment}>
        {/* the TV draws the intro and the draw inside its own canvas */}
        <Suspense fallback={null}><TVMode standings={standings} state={state} events={events} onDeckEv={onDeckEv} allTied={allTied}
          champion={champion} coChamps={coChamps} showControlEnabled={showControlAllowed}
          rankDeltas={deltas} connection={{ ready, connected, status:tournament.status, version }}
          ceremony={tvCeremonyHold ? null : { intro:shownIntro, handoff:introHasQueuedReveal, reveal,
            onIntroDone:() => setIntro(null), onRevealDone:closeReveal }}
          onSoundStatus={reportTvSound}
          onExit={() => setTv(false)} /></Suspense>
        <Confetti burst={burst} />
      </Shell>
    );
  }

  if (onboardStep < 99) {
    return (
      <Shell arrival environment={environment}>
        {ready ? <Suspense fallback={<LoadingScreen />}><Onboarding step={onboardStep} me={me} state={state} onTv={() => setTv(true)} onChip={pickChip}
          pick={async p => {
            const localMarker = localGet(CHECK_IN_MARKER);
            const result = await dispatch("claim", { player:p });
            if (result.ok) {
              setMe(p); saveMine("si-me", p);
              if (returningAfterClaim({ localMarker, result })) completeReturningGuest(p);
            }
            return result;
          }}
          saveProfile={prof => saveProfile(me, prof)}
          submitSeeds={saveSeeds}
          next={() => setOnboardStep(s => s + 1)}
          back={() => setOnboardStep(s => Math.max(0, s - 1))}
          done={() => { setOnboardStep(99); saveMine("si-onboard-v5","yes");
            saveMine("si-onboard-epoch", String(state.onboardEpoch || 0));
            setTab("board"); setShower(n => n + 1); }} /></Suspense> : <LoadingScreen />}
      </Shell>
    );
  }

  /* win songs play themselves; the rack beside the pill (and docked in the
     header of any open sheet) is only the Stop for the one playing */
  /* QA: the contest taking bets, for the quick bets (worker/qa.js runQaBets) */
  const qaMarket = (() => {
    if (!qaAllowed || !onDeckEv) return null;
    const contest = resolveCurrentContest(state, onDeckEv);
    if (contest?.phase !== "betting-open") return null;
    const pending = (state.wagers || []).filter(w => wagerMatchesContest(w, contest)
      && resolveWager(state, w, events).status === "pending");
    return { contestId:contest.id, contestRevision:contest.revision, label:contest.label || onDeckEv.name,
      bets:pending.length, chips:pending.reduce((sum, w) => sum + (w.stake || 0), 0) };
  })();
  /* the QA strip: one row at the top of the commissioner's dock */
  const qaStrip = <Suspense fallback={null}><QABar status={qaStatus} market={qaMarket}
    sim={sim} onStop={stopSim} guestLens={guestLens}
    onLens={() => setGuestLens(v => { notify(v ? "GM view" : "Guest view"); return !v; })}
    onOpen={() => setModal({ type:"qa" })}
    dispatch={dispatch} environment={environment} notify={notify} /></Suspense>;
  /* the More menu and the commissioner's menu: one model, one renderer
     (features/director/menuModel.js, ui/Menu.jsx); each row's id acts here */
  const gmMenuFacts = modal?.type === "gmMenu" ? {
    audioDirector:audioDirectorAllowed, speaker:speakerValue(speakerStatus),
    tvNow:tvNowLabel(activeShowScene, tvAmbient(state, events, weekendOperation.event)),
    crownReady:state.live && !state.frozen && crownReady,
    lockerRoom:state.live && !state.frozen && lockerRoomAvailability(state).enabled,
    away:Object.keys(state.away || {}), geoPhotos:(state.geoRounds || []).length,
    triviaQuestions:triviaQuestionTotal(state.triviaRounds), awardsNote:deskNote(state),
    onDeck:state.onDeck ? onDeckEv?.name || "Open" : null,
    takeBacks:events.filter(ev => announcementTakeBack(state, ev).enabled),
    frozen:state.live && state.frozen, snapshotExport:capabilities.snapshotExport === true,
    qaAllowed, qaOn:qa, progressReset:progressResetAllowed,
  } : null;
  /* A5: launched this way, the TV keeps its sound after every reload */
  const copyTvShortcut = () => {
    const command = tvKioskCommand(window.location.origin);
    return (navigator.clipboard?.writeText ? navigator.clipboard.writeText(command) : Promise.reject(new Error("no clipboard")))
      .then(() => notify("Shortcut copied"), () => notify(command));
  };
  const menuItem = id => {
    const sheet = type => pushModal({ type });
    if (id.startsWith("takeBack:")) {
      const ev = events.find(item => item.id === id.slice("takeBack:".length));
      return ev ? pushModal({ type:"takeBack", ev }) : undefined;
    }
    switch (id) {
      case "profile": return sheet("profile");
      case "trip": case "rules": setModal(null); setWeekendSection(id); setTab("guide"); return undefined;
      case "tv": setModal(null); setTv(true); return undefined;
      case "commissioner":
        if (!gm) return sheet("pin");
        setGuestLens(false); return sheet("gmMenu");
      case "showControl": case "audioDirector": case "qa": case "crown": case "attendance": case "lockerRoom":
      case "unfreeze": case "logistics": case "travelSheet": case "gmDevices": return sheet(id);
      case "geo": return sheet("geoDesk");
      case "trivia": return sheet("triviaDesk");
      case "awards": return sheet("awards");
      case "reset": return sheet("resetProgress");
      case "lockBets": return setOnDeck(null).then(locked => {
        if (locked.ok) { setModal(null); notify("Bets locked"); }
        return locked;
      });
      case "snapshot": return downloadSnapshot().then(exported => notify(exported.ok
        ? `Snapshot exported from ${exported.metadata.environment}` : exported.error || "Export failed"));
      case "exit": return exitGm();
      default: return undefined;
    }
  };
  const cueRack = gmView && audioDirectorAllowed ? docked => <CueRack docked={docked === true} pill={docked === "pill"} state={state}
    candidates={[]}
    notify={notify} onAudio={() => setModal({type:"audioDirector"})} /> : null;
  /* Weekend's cover already names the live event: no second live strip over it */
  const coverNames = ev => {
    if (!ev) return false;
    const cover = programCover(state, events);
    return [cover.lead?.event?.id, cover.then?.event?.id].includes(ev.id);
  };
  return (
    <SheetDock.Provider value={cueRack && modal?.type !== "audioDirector" ? cueRack(true) : null}>
    <Shell environment={environment}>
      <AppHeader state={state} me={me} onHome={() => setTab("board")}
        standing={tab === "board" ? null : headerStanding(state, standings, me)}
        onStandings={() => setModal({type:"standings"})}
        onProfile={() => setModal({type:"profile"})} onMenu={() => setModal({type:"menu"})} gm={gmView}
        onCommissioner={() => !gm ? setModal({type:"pin"})
          : guestLens ? (setGuestLens(false), notify("GM view")) : setModal({type:"gmMenu"})}
        connected={connected} loaded={loaded} wagerEv={tab === "bets" || tab === "board" || (tab === "guide" && coverNames(wagerEv)) ? null : wagerEv}
        wagerMarketOpen={wagerMarketOpen}
        onBets={() => setTab("bets")} GameMark={GameMark}
        updateReady={!!tournament.updateReady} onReload={onUpdateReload || (() => window.location.reload())}
        sky={state.live && me ? <SkyStrip state={state} events={events} standings={standings} /> : null} />

      {/* the page clears the tab bar and the commissioner's dock (its
          measured height, --fd-dock-h) by the same 18px */}
      <main id="fd-main" className="fd-main" style={{
        paddingBottom:"calc(var(--fd-nav-height) + var(--fd-dock-h, 0px) + 18px)" }}>
        {tab === "board" && <GuestHome state={state} me={me} events={events} standings={standings} GameMark={GameMark} StatPills={StatPills}
          onEvents={() => setTab("sched")}
          onOpen={ev => setModal({type:"event", ev})}
          onRules={ev => setModal({type:"howto", ev})} onBracket={ev => setModal({type:"bracket", ev})}
          onDraft={ev => setModal({type:"draft", ev})} deltas={deltas}
          since={since} onSince={openSince}
          onSinceDismiss={() => setSince(null)}
          flightsAnswered={flightsAnswered}
          onFlightsYes={() => setModal({type:"profile", section:"travel"})}
          onFlightsNotYet={async () => {
            const result = await saveProfile(me, { flightsBooked:false });
            if (result?.ok) { setFlightsAnswered(true); saveMine(`si-flights-asked:${me}`, "yes"); }
            return result;
          }}
          setup={me ? setupTodo(state, me, { songs:audioCatalogAllowed }) : []}
          onSetup={item => setModal({type:"profile", section:item.section})}
          songs={audioCatalogAllowed} onWinSong={() => setModal({type:"profile", section:"walkout"})}
          onPlayer={p => setModal({type:"player", p})} onLastCard={lastCard.crowned ? lastCard.show : undefined}
          onBets={() => setTab("bets")} onStandings={() => setModal({type:"standings"})}
          duelContent={me && <HomeDuels state={state} me={me} gm={gmView}
            onPlayer={p => setModal({type:"player", p})}
            onPlay={openDuel} onAccept={acceptDuel} onDecline={declineDuel}
            onWithdraw={withdrawDuel} onVoid={voidDuel} />}
          awardsContent={<>
            <TeamNamesHome state={state} me={me} events={events} />
            <AwardsHome state={state} me={me} onPlayer={p => setModal({type:"player", p})} />
          </>}
          mvpContent={<>
            <GeoHome state={state} me={me} onOpen={() => setGeoForce(n => n + 1)} />
            <TriviaHome state={state} me={me} onOpen={() => setTriviaForce(n => n + 1)} />
            <MvpHome state={state} me={me} events={events} onPlayer={p => setModal({type:"player", p})} />
          </>}
          pokerContent={<PokerCard state={state} standings={standings} me={me} gm={gmView}
                onBuyin={() => setModal({type:"pokerBuyin"})}
                onStart={pokerStart} onCancel={pokerCancel}
                onLevel={pokerLevelNudge} onPause={pokerPause} onBust={pokerBust} onUnbust={pokerUnbust}
                onCount={pokerCount} onReview={() => setModal({type:"pokerResult"})} />} />}
        {tab === "sched" && <Schedule GameMark={GameMark} state={state} events={events} me={me} gm={gmView}
          open={ev => setModal({type:"event", ev})} onAdd={() => setModal({type:"addEvent"})}
          onPlayer={p => setModal({type:"player", p})} onBracket={ev => setModal({type:"bracket", ev})}
          onReorder={reorderEvents} />}
        {tab === "bets" && <Wagers GameMark={GameMark} state={state} me={me} standings={standings} gm={gmView} events={events}
          openSettled={settledOpen} onSettledSeen={() => setSettledOpen(false)}
          onEvent={ev => setModal({type:state.brackets?.[ev.id] ? "bracket" : "event", ev})}
          onDeckEv={onDeckEv} wagerEv={wagerEv}
          onEvents={() => setTab("sched")}
          onPlayer={p => setModal({type:"player", p})}
          onPick={pick => placeWager({ ...pick, stake: pick.stake || PT })}
          onRetract={(id, reference) => retractWager(id, reference)}
          onVoid={async ids => {
            const results = await Promise.all((Array.isArray(ids) ? ids : [ids]).map(id => voidWager(id)));
            const failed = results.find(result => !result.ok);
            if (!failed) notify(results.length === 1 ? "Bet voided" : `${results.length} bets voided`);
            return failed || { ok:true };
          }} />}
        {tab === "bets" && gmView && <DuelDesk state={state} onVoid={voidDuel} onVoidAll={voidOpenDuels} />}
        {tab === "guide" && <Guide events={events} state={state} me={me} gm={gmView}
          section={weekendSection} onSection={setWeekendSection}
          onProfile={() => setModal({type:"profile", section:"travel"})} onPlayer={p => setModal({type:"player", p})}
          standings={standings} onBracket={ev => setModal({type:"bracket", ev})}
          onEvent={ev => setModal({type:"event", ev})}
          GameMark={GameMark} HowToSheet={HowToSheet} />}
      </main>

      {/* the commissioner's dock: one shelf on the tab bar (the QA strip,
          the cue rack's Stop, the next step with the TV's state in it); the
          page is padded by its height */}
      {((gmView && !modal) || (gm && qaActive)) && <CommissionerDock>
        {gm && qaActive && qaStrip}
        {gmView && !modal && ready && <DirectorPill model={pillModel} state={state} events={events}
          audio={cueRack ? cueRack("pill") : null}
          director={director} showControl={showControlAllowed} onWrite={directorWrite} onOpen={directorOpen} onPlayer={p => setModal({type:"player", p})}
          health={<TvHealth tvs={tournament.tvs} receivedAt={tournament.tvsAt} live={!!state.live} />} />}
      </CommissionerDock>}

      <AppNavigation tab={tab} onTab={setTab} live={state.live} badges={navBadges} />

      {/* modals */}
      {modal?.type === "howto" && <HowToSheet gameId={modal.ev.game} variant={modal.ev.variant} ev={modal.ev} onClose={() => setModal(null)} />}
      {modal?.type === "standings" && <Sheet title={champion ? "Final standings" : "Standings"} subtitle={postedLine(state, events)} onClose={() => setModal(null)} onBack={modalBack}>
        <Board embedded GameMark={GameMark} StatPills={StatPills} resultImpact={resultImpact} nextOpenMatch={nextOpenMatch}
          state={state} standings={standings} me={me} deltas={deltas} allTied={allTied}
          champion={champion} coChamps={coChamps} gm={gmView} events={events}
          myAtRisk={me ? atRisk(state, me, events) : 0}
          onOpen={ev => pushModal({type:"event", ev})} onAdjust={p => pushModal({type:"adjust", player:p})}
          crownReady={crownReady}
          onPlayer={p => pushModal({type:"player", p})} onFreeze={() => pushModal({type:"crown"})}
          onUnfreeze={() => pushModal({type:"unfreeze"})} finaleDone={!!state.results[events.find(e => e.finale)?.id]} />
      </Sheet>}
      {modal?.type === "menu" && <Sheet title="Field Day" onClose={() => setModal(null)}>
        <MenuSections sections={moreMenu({ gm })} onItem={menuItem}
          glyphs={me ? { you:<Avatar state={state} p={me} size={22} /> } : {}} />
      </Sheet>}
      {modal?.type === "house" && <Sheet title="Trip details" onClose={() => setModal(null)}><VenueCard lg={state.logistics || {}} /></Sheet>}
      {modal?.type === "pin" && <PinSheet onClose={() => setModal(null)} onBack={modalBack} unlock={unlockGm} />}
      {me && <MvpVoteSheet state={state} me={me} events={events} blocked={!!modal} />}
      {me && <GeoPlaySheet state={state} me={me} blocked={!!modal} force={geoForce} />}
      {me && <TriviaPlaySheet state={state} me={me} blocked={!!modal} force={triviaForce} />}
      {modal?.type === "profile" && <ProfileSheet state={state} me={me} onClose={() => setModal(null)} onBack={modalBack} onChip={pickChip}
        initialSection={modal.section}
        spotifyCatalogEnabled={audioCatalogAllowed}
        songSnippets={capabilities.songSnippets === true}
        save={async prof => {
          const saved = await saveProfile(me, prof);
          if (saved.ok) { setModal(null); notify(prof.confirmJersey ? "Jersey confirmed" : "Profile saved"); }
          return saved;
        }} />}
      {modal?.type === "gmMenu" && <Sheet title="Commissioner" onClose={() => setModal(null)} onBack={modalBack}>
        <MenuSections sections={commissionerMenu(gmMenuFacts)} onItem={menuItem} />
      </Sheet>}
      {gmView && modal?.type === "awards" && <Suspense fallback={null}><AwardsDesk state={state} events={events} notify={notify}
        onClose={() => setModal(null)} onBack={modalBack} /></Suspense>}
      {gmView && modal?.type === "geoDesk" && <Sheet title="Where and When" onClose={() => setModal(null)} onBack={modalBack}>
        <Suspense fallback={null}><GeoDesk state={state} notify={notify} onAct={(type, payload) => act(type, payload)} /></Suspense>
      </Sheet>}
      {gmView && modal?.type === "triviaDesk" && <Sheet title="Trivia" onClose={() => setModal(null)} onBack={modalBack}>
        <Suspense fallback={null}><TriviaDesk state={state} me={me} events={events} notify={notify}
          onAct={(type, payload) => act(type, payload)} /></Suspense>
      </Sheet>}
      {gmView && modal?.type === "showControl" && <Suspense fallback={null}>
        <TvSheet state={state} events={events} scene={activeShowScene} operationEvent={weekendOperation.event}
          scenes={showControlAllowed} tvs={tournament.tvs} tvsAt={tournament.tvsAt}
          onClose={() => setModal(null)} onBack={modalBack}
          onStart={startShowScene} onAdvance={advanceShowScene} onEnd={endShowScene} onRetry={retryShowScene}
          onShortcut={copyTvShortcut} /></Suspense>}
      {gmView && audioDirectorAllowed && modal?.type === "audioDirector" && <Suspense fallback={null}>
        <SpeakerSheet state={state} onClose={() => setModal(null)} onBack={modalBack} notify={notify} /></Suspense>}
      {gmView && modal?.type === "logistics" && (
        <Sheet title="Trip details" onClose={() => setModal(null)} onBack={modalBack}>
          <LogisticsEditor state={state} onSave={async vals => {
            const saved = await act("saveLogistics", vals, "Trip details saved");
            if (saved.ok) setModal(null);
          }} />
        </Sheet>
      )}
      {gmView && modal?.type === "travelSheet" && (
        <Sheet title="Travel sheet" onClose={() => setModal(null)} onBack={modalBack}>
          <TravelApparelSheet state={state}
            onSize={(p, sz) => act("saveProfile", {
              player:p,
              display:state.profiles?.[p]?.display || p,
              size:sz,
            })}
            onLock={locked => act("lockJerseys", { locked }, locked ? "Jerseys locked" : "Jerseys unlocked")}
            onNotify={notify} />
        </Sheet>
      )}
      {modal?.type === "event" && <EventSheet ev={events.find(e => e.id === modal.ev.id) || modal.ev} state={state} gm={gmView}
        me={me} onLock={reference => lockAndStart(modal.ev, reference)}
        onWinner={result => recordContestWinner(modal.ev, result)}
        onUndo={reference => undoLastContest(modal.ev, reference)}
        onPlayNext={payload => playContestNext(modal.ev, payload)}
        announceNext={weekendOperation.event?.id === modal.ev.id && !state.onDeck
          && ["prepare-draw", "prepare-stages"].includes(weekendOperation.nextAction?.type)}
        onAnnounceDraw={(players, roles, cfg) => announceAndDraw(modal.ev, players, roles, cfg)}
        onSwap={(out, into) => swapPlayer(modal.ev, out, into)}
        onTakeBack={() => takeBackAnnouncement(modal.ev)}
        onClose={() => setModal(null)}
        onBack={modalBack}
        onPlayer={p => pushModal({type:"player", p})}
        onBets={wagerEv?.id === modal.ev.id ? () => { setModal(null); setTab("bets"); } : null}
        enterResult={() => openResultEntry(modal.ev)}
        clearRes={async reason => {
          const cleared = await clearResult(modal.ev, reason);
          if (cleared.ok) {
            setModal(null);
            notify("Result cleared");
          }
        }}
        onEdit={patch => editEvent(modal.ev.id, patch)}
        onDraw={(players, roles) => runDraw(modal.ev, players, roles)}
        onClearDraw={() => clearDraw(modal.ev)}
        onStages={cfg => runStages(modal.ev, cfg)}
        onClearStages={() => clearStages(modal.ev)}
        onThrough={(g,k) => toggleThrough(modal.ev.id, g, k)}
        onFinal={k => setFinalWinner(modal.ev.id, k)}
        onDeckToggle={() => { setOnDeck(state.onDeck === modal.ev.id ? null : modal.ev.id); }}
        onStart={() => startEvent(modal.ev)}
        onShelve={async (on, confirmReturn) => {
          const shelved = await shelveEvent(modal.ev.id, on, confirmReturn);
          if (shelved.ok) setModal(null);
        }}
        onRemove={() => { setModal(null); removeCustomEvent(modal.ev); }}
        openBracket={() => pushModal({type:"bracket", ev:modal.ev})}
        onReplay={() => pushModal({type:"drawReplay", ev:modal.ev})}
        openDraft={(pool, roles) => pushModal({type:"draft", ev:modal.ev, pool, roles})} />}
      {modal?.type === "drawReplay" && buildEventReveal(state,modal.ev) && <DrawAnnouncement state={state}
        reveal={buildEventReveal(state,modal.ev)} initialComplete={modal.completed} onClose={() => setModal(null)} onBack={modalBack}
        onPlayer={p => setModalStack(stack => [...stack.slice(0,-1),{...modal,completed:true},{type:"player",p}])}
        onBets={wagerEv?.id === modal.ev.id ? () => {setModal(null);setTab("bets");} : null}/>}
      {modal?.type === "bracket" && <BracketSheet ev={modal.ev} state={state} gm={gmView}
        me={me}
        onLock={reference => lockAndStart(modal.ev, reference)}
        onWinner={result => recordContestWinner(modal.ev, result)}
        onUndo={reference => undoLastContest(modal.ev, reference)}
        onPlayNext={payload => playContestNext(modal.ev, payload)}
        onBets={wagerEv?.id === modal.ev.id ? () => {setModal(null);setTab("bets");} : null}
        onCurrent={() => pushModal({type:"event", ev:modal.ev})}
        onClose={() => setModal(null)} onBack={modalBack}
        onPlayer={p => pushModal({type:"player", p})}
        onPick={(r,m,t) => pickBracketWinner(modal.ev.id, r, m, t)}
        onPostResult={() => openResultEntry(modal.ev)} />}
      {modal?.type === "draft" && <DraftSheet ev={events.find(e => e.id === modal.ev.id) || modal.ev}
        state={state} gm={gmView} me={me} standings={standings} pool={modal.pool} roles={modal.roles}
        onClose={modalBack || (() => setModal(null))}
        onPlayer={p => pushModal({type:"player", p})}
        onStart={(captains, players) => startDraft(modal.ev.id, captains, players, modal.roles)}
        onPick={(player, reference) => pickDraftPlayer(modal.ev.id, player, reference)}
        onUndo={reference => undoDraftPick(modal.ev.id, reference)}
        onFinalize={reference => finalizeDraft(modal.ev.id, reference)}
        onCancel={reference => cancelDraft(modal.ev.id, reference)} />}
      {modal?.type === "result" && <ResultSheet ev={events.find(e => e.id === modal.ev.id) || modal.ev} state={state}
        onClose={() => setModal(null)}
        save={async (slots, options) => {
          const saved = await saveResult(modal.ev, slots, options);
          if (saved.ok) {
            setModal(null);
            notify(saved.extra?.unchanged
              ? `${modal.ev.name} result is unchanged`
              : `${modal.ev.name} posted`);
          }
          return saved;
        }} />}
      {modal?.type === "addEvent" && <AddEventSheet state={state} onClose={() => setModal(null)}
        save={ev => { addCustomEvent(ev); setModal(null); notify(`${ev.name} added`); }} />}
      {modal?.type === "pokerBuyin" && <PokerBuyinSheet state={state} standings={standings} gm={gmView}
        onClose={() => setModal(null)} onStart={() => { pokerStart(); setModal(null); }} />}
      {modal?.type === "pokerResult" && <PokerResultSheet state={state} onClose={() => setModal(null)}
        onCount={pokerCount} onBust={pokerBust} onUnbust={pokerUnbust}
        onPost={async () => { const result = await pokerResult(); if (result.ok) setModal(null); return result; }} />}
      {modal?.type === "player" && <PlayerSheet state={state} me={me} p={modal.p} standings={standings} events={events}
        onClose={() => setModal(null)} onBack={modalBack}
        onEdit={() => pushModal({type:"profile"})}
        onDuel={(stake, open) => sendDuel(modal.p, stake, open)} onSent={duelSent}
        onPlay={openDuel} onAccept={acceptDuel} onDecline={declineDuel} onWithdraw={withdrawDuel} />}
      {modal?.type === "duelPlay" && <QuickDrawGame key={modal.id} state={state} me={me}
        duel={(state.duels || []).find(d => d.id === modal.id)}
        onSubmit={playDuelRun} onAccept={acceptDuel} onDecline={declineDuel}
        onWithdraw={withdrawDuel} onRematch={rematchDuel} onHold={setDuelHold}
        onClose={() => setModal(null)} />}
      {modal?.type === "adjust" && <AdjustSheet state={state} player={modal.player} onClose={() => setModal(null)}
        save={async (d,r) => {
          const saved = await addAdjust(modal.player, d, r);
          if (saved.ok) { setModal(null); notify(`${disp(state, modal.player)} ${d>0?"+":""}${d}`); }
          return saved;
        }}
        onRemove={(id, reason) => act("removeAdjustment", { id, reason }, "Ruling removed", { retry:true })} />}
      {qaAllowed && modal?.type === "qa" && <Suspense fallback={null}><QASheet state={state} busy={!!sim}
        status={qaStatus} me={me} guestLens={guestLens} market={qaMarket}
        environment={environment} dispatch={dispatch} notify={notify}
        qaOn={qa} onStrip={toggleQa} onBack={modalBack}
        onSwitch={player => switchPlayer(player, false)}
        onLens={() => setGuestLens(v => { notify(v ? "GM view" : "Guest view"); return !v; })}
        pokerOn={pokerLive(state)}
        onPlayLive={() => { setModal(null); runSim(simPlayEvent)(); }}
        onDuelMe={() => { setModal(null); qaGuard(simDuelMe)(); }}
        onDuels={() => { setModal(null); qaGuard(() => simDuels(3))(); }}
        onBustOne={() => { const pool = simPokerAlive().filter(q => q !== me); if (pool.length) pokerBust(pool[Math.floor(Math.random() * pool.length)]); }}
        onCountRest={async () => {
          const p = state.poker; if (!p) return;
          const done = p.counts || {};
          const todo = simPokerAlive().filter(q => q !== me && done[q] === undefined);
          if (!todo.length) return notify("Everyone else is counted");
          const counted = Object.values(done).reduce((a, b) => a + b, 0);
          const meIn = done[me] === undefined && simPokerAlive().includes(me) ? 1 : 0;
          let left = Math.max(0, Math.floor((p.total - counted) / CHIP_MIN));
          const per = Math.floor(left / (todo.length + meIn));
          for (const q of todo) { await pokerCount(q, Math.min(left, per) * CHIP_MIN); left -= Math.min(left, per); }
          notify(meIn ? "Counts in, yours is the last one" : "Counts in");
        }}
        onRerun={() => { rerunOnboard(); setModal(null); }}
        onReplayMine={() => { replayOnboardHere(); setModal(null); }}
        onClose={() => setModal(null)} /></Suspense>}
      {progressResetAllowed && modal?.type === "resetProgress" && (
        <ResetProgressSheet state={state} environment={environment} busy={!!sim}
          onClose={() => setModal(null)} onBack={modalBack}
          onConfirm={async () => {
            const reset = await resetGame();
            if (!reset.ok) return;
            setIntro(null);
            setReveal(null);
            setModal(null);
            setTab("board");
          }} />
      )}
      {gmView && modal?.type === "announceDraw" && (
        <AnnounceDrawSheet state={state} ev={events.find(e => e.id === modal.ev.id) || modal.ev}
          players={modal.players} roles={modal.roles} changing={modal.changing} onClose={() => setModal(null)}
          onPlayer={p => pushModal({type:"player", p})}
          onConfirm={async (players, roles) => {
            const result = await announceAndDraw(modal.ev, players, roles);
            if (result.ok) setModal(null);
            return result;
          }} />
      )}
      {gmView && modal?.type === "skipEvent" && (
        <Sheet title={`Skip ${modal.ev.name}`} onClose={() => setModal(null)} onBack={modalBack}>
          <p style={pStyle}>{(() => {
            const bets = (state.wagers || []).filter(w => w.eventId === modal.ev.id
              && resolveWager(state, w, events).status === "pending").length;
            return bets ? `Returns ${bets} bet${bets === 1 ? "" : "s"}.` : "No open bets.";
          })()}</p>
          <div style={{ display:"flex", gap:10 }}>
            <Btn onClick={async () => { const result = await shelveEvent(modal.ev.id, true, true);
              if (result.ok) { setModal(null); const bets = result.extra?.bets || 0;
                notify(bets ? `${modal.ev.name} shelved. ${bets} bet${bets === 1 ? "" : "s"} returned` : `${modal.ev.name} shelved`); } }}>Skip {modal.ev.name}</Btn>
            <Btn kind="ghost" onClick={() => setModal(null)}>Keep it</Btn>
          </div>
        </Sheet>
      )}
      {gmView && modal?.type === "takeBack" && (() => {
        const available = announcementTakeBack(state, modal.ev);
        const returned = refundText(state, available.refunds);
        return <Sheet title={`Take back ${modal.ev.name}`} onClose={() => setModal(null)} onBack={modalBack}>
          {(returned || !available.enabled) && <p style={pStyle}>{available.enabled ? returned : available.blocker}</p>}
          <div style={{ display:"flex", gap:10 }}>
            <Btn disabled={!available.enabled} onClick={async () => {
              const result = await takeBackAnnouncement(modal.ev);
              if (result.ok) setModal(null); }}>Take back</Btn>
            <Btn kind="ghost" onClick={() => setModal(null)}>Keep it</Btn>
          </div>
        </Sheet>;
      })()}
      {gmView && modal?.type === "lockerRoom" && (() => {
        const available = lockerRoomAvailability(state);
        return <Sheet title="Back to the locker room" onClose={() => setModal(null)} onBack={modalBack}>
          {!available.enabled && <p style={pStyle}>{available.blocker}</p>}
          <div style={{ display:"flex", gap:10 }}>
            <Btn kind="danger" disabled={!available.enabled} onClick={async () => {
              const result = await returnToLockerRoom();
              if (result.ok) setModal(null); }}>Back to the locker room</Btn>
            <Btn kind="ghost" onClick={() => setModal(null)}>Keep it live</Btn>
          </div>
        </Sheet>;
      })()}
      {gmView && modal?.type === "unfreeze" && (
        <Sheet title="Unfreeze the board" onClose={() => setModal(null)} onBack={modalBack}>
          <p style={pStyle}>{stacksPosted(state)
            ? "Rulings reopen. Betting and duels stay closed after the finale."
            : "Betting, duels and rulings reopen."}</p>
          <div style={{ display:"flex", gap:10 }}>
            <Btn kind="danger" onClick={async () => { const result = await setFrozen(false);
              if (result.ok) setModal(null); }}>Unfreeze</Btn>
            <Btn kind="ghost" onClick={() => setModal(null)}>Keep it frozen</Btn>
          </div>
        </Sheet>
      )}
      {gmView && modal?.type === "attendance" && (
        <Sheet title="Who is here" onClose={() => setModal(null)} onBack={modalBack}>
          <p style={pStyle}>Away players sit out new draws, contests, and the poker table. Their chips stay.</p>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(2,minmax(0,1fr))", gap:8 }}>
            {ROSTER.map(p => {
              const away = !!state.away?.[p];
              return <button key={p} type="button" aria-pressed={!away} onClick={() => setAway(p, !away)}
                style={{ display:"flex", alignItems:"center", gap:8, minHeight:48, padding:"8px 10px", borderRadius:10,
                  cursor:"pointer", textAlign:"left", background:away ? "var(--paper)" : "var(--paper2)",
                  border:away ? "1.5px solid var(--clay)" : "1px solid var(--line)", color:"var(--ink)" }}>
                <Avatar state={state} p={p} size={28} />
                <span style={{ flex:1, minWidth:0, fontFamily:SANS, fontWeight:700, fontSize:13 }}>{disp(state, p)}</span>
                <span style={{ fontFamily:SANS, fontWeight:700, fontSize:12, color:away ? "var(--clay-text)" : "var(--muted2)" }}>
                  {away ? "Away" : "Here"}</span>
              </button>;
            })}
          </div>
        </Sheet>
      )}
      {gmView && modal?.type === "gmDevices" && (
        <GmDevicesSheet state={state} onClose={() => setModal(null)} onBack={modalBack} notify={notify}
          onSignedOut={() => { setGmToken(null); setGm(false); saveMine("si-gm", "no"); setModal(null); }} />
      )}
      {gmView && modal?.type === "crown" && (
        <Suspense fallback={null}><CrownSheet state={state} finalePosted={!!state.results[events.find(e => e.finale)?.id]}
          onClose={() => setModal(null)} onBack={modalBack} onCrown={crownChampion} /></Suspense>
      )}
      {gmView && modal?.type === "pokerSetup" && (
        <Suspense fallback={null}><PokerSetupSheet state={state} onClose={() => setModal(null)} onBack={modalBack} onDeal={dealAndStart} /></Suspense>
      )}

      {/* a Your pick nudge stands down while the draft itself is open */}
      {toast && !(toast.draftTurn && modal?.type === "draft") && (
        <div role="status" aria-live="polite" className={`fd-toast${toast.tone === "gold" ? " is-gold" : ""}${toast.action ? " has-action" : ""}${tab === "bets" && me && wagerEv && wagerMarketOpen && !modal ? " is-over-rack" : ""}`}>
          {toast.chip ? (
            <span className="fd-toast-mark">
              <BankChip p={toast.chip} size={26} />
              {state.profiles?.[toast.chip]?.num != null && (
                <span className="fd-toast-number">#{state.profiles[toast.chip].num}</span>
              )}
            </span>
          ) : <span className="fd-toast-mark"><FDMark size={24} variant="night" /></span>}
          <span className="fd-toast-msg">{toast.msg}</span>
          {toast.action && <button type="button" className="fd-toast-action" onClick={toast.action.fn}>{toast.action.label}</button>}
        </div>
      )}
      {shownIntro && onboardStep >= 99 && !duelHold && (() => {
        const iev = events.find(e => e.id === shownIntro);
        return iev && !state.results[iev.id] ? (
          <EventIntro state={state} ev={iev} handoff={introHasQueuedReveal} onClose={() => setIntro(null)}
            onBets={!introHasQueuedReveal && state.onDeck === iev.id
              ? () => { setIntro(null); setModal(null); setTab("bets"); } : null} />
        ) : null;
      })()}
      {reveal && !duelHold && <Reveal key={reveal.id} state={state} reveal={reveal} me={me} onClose={closeReveal}
        onPlayer={p => {
          const ev = events.find(event => event.id === reveal.evId);
          closeReveal();
          setModalStack(stack => [...stack,...(ev ? [{type:"drawReplay",ev,completed:true}] : []),{type:"player",p}]);
        }}
        onBets={state.onDeck === reveal.evId && !state.results[reveal.evId]
          ? () => { closeReveal(); setModal(null); setTab("bets"); } : null} />}
      {moment && !stageHeld && <ChipReceipt moment={moment} onDismiss={() => setMoment(null)}
        dock={receiptDock({ tab, modal })}
        onStandings={() => { setMoment(null); setModal({ type:"standings" }); }}
        onSettled={() => { setMoment(null); setModal(null); setSettledOpen(true); setTab("bets"); }} />}
      <ChipShower burst={shower} p={me} amount={moment ? moment.to - moment.from : 0} />
      <MomentsLayer state={state} events={events} me={me} active={ready && !tv && onboardStep >= 99}
        onBets={() => { setModal(null); setTab("bets"); }} />
      {lastCard.open && <LastCardLayer key={lastCard.open.key} state={state} me={me} events={events}
        standings={standings} mode={lastCard.open.mode} gm={gmView} onClose={lastCard.close}
        onStandings={() => { lastCard.close(); setTab("board"); setModal({ type:"standings" }); }} />}
      {!loaded && <LoadingScreen />}
    </Shell>
    </SheetDock.Provider>
  );
}

/* event intro: when betting opens, the event announces itself on every phone
   with the game's own intro (features/intro), on the room's clock. The TV
   draws the same intro inside its canvas. */
function EventIntro({ state, ev, handoff, onClose, onBets }) {
  const reduced = prefersReducedMotion();
  return <EventAnnouncement state={state} ev={ev} handoff={handoff} onClose={onClose} onBets={onBets} live reduced={reduced}
    anchor={Number(state.eventOps?.[ev.id]?.announcedAt) || null} holdMs={reduced ? DRAW_INTRO_REDUCED_MS : DRAW_INTRO_MS} />;
}

/* ─────────── shell ─────────── */


/* install UI: native prompt where the browser offers one, instructions where it never will */


/* ─────────── onboarding ─────────── */

function LoadingScreen() {
  return (
    <div role="status" aria-live="polite" style={{ position:"fixed", inset:0, background:"var(--bg)", zIndex:500,
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:18,
      padding:24, textAlign:"center" }}>
      <div style={{ animation:"si-pulse 1.6s ease-in-out infinite" }}><Wordmark size={34} /></div>
      <div>
        <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:18, letterSpacing:"0.04em",
          textTransform:"uppercase", color:"var(--ink)" }}>Opening Field Day</div>
        <div style={{ fontFamily:SANS, fontSize:12.5, color:"var(--muted)", marginTop:5 }}>
          Connecting…</div>
      </div>
    </div>
  );
}

/* The venue is a reveal, not a diagram. The real overhead shot communicates
   the house, pool, pickleball, basketball, and volleyball in one clean frame. */


/* Two cards, each one subject. The house owns its own check-in window, so
   nobody has to work out what those times belong to; travel owns the airport
   and the host's flights, since both are about getting there. */

/* the label-over-value pair, used by both split rows */

/* The editable flight. Dressed as a boarding pass this read as something
   already filled in, so entry gets real bordered fields with captions under
   them: three boxes on a page of cards say "type here" without a word. */


/* One boarding pass, read only: this is how a saved leg prints back */


/* label, a way out, and the pass */


/* the carrier list both editors share */


/* one apparel size. Brandon uses the T-shirt answer for the jersey too. */


/* travel entry, shared by onboarding and the profile sheet. Ask the question
   outright and give it two equal answers: a quiet link next to a form reads
   as decoration, and whoever has not booked cannot tell it is meant for them.
   Nothing shows until you answer, so the question IS the instruction. */


/* chip claim: colors are first come first serve, live on the server the
   moment you tap. Skins repeat freely. Locked once the weekend starts. */


/* where a standings number came from, as marks rather than a run-on sentence:
   a cup for events won, a chip for the book, a bolt for duels, and your own
   exposure while it is live. Only what is nonzero shows, so a fresh board is
   just names and numbers. */
const PILL_ART = {
  win:  <path d="M4 2h8v3.2a4 4 0 0 1-8 0z M2.6 2.6v1.2a2 2 0 0 0 1.7 2 M13.4 2.6v1.2a2 2 0 0 1-1.7 2 M8 9.2V12 M5.4 13.4h5.2" />,
  bet:  <><circle cx="8" cy="7.6" r="5" /><path d="M8 2.6v1.6 M8 11v1.6 M3 7.6h1.6 M11.4 7.6H13" /></>,
  duel: <path d="M9.4 2 4.6 8.2h3L6.6 13.4 11.4 7h-3z" />,
};
function StatPills({ row, atRisk = 0, onSun }) {
  const bits = [
    row.wins > 0 && { k:"win", v: row.wins, tone: onSun ? "var(--ink0)" : "var(--signal-text)" },
    row.betNet !== 0 && { k:"bet", v: `${row.betNet > 0 ? "+" : ""}${fmt(row.betNet)}`,
      tone: onSun ? "var(--ink0)" : row.betNet > 0 ? "var(--green)" : "var(--clay-text)" },
    row.duelNet !== 0 && { k:"duel", v: `${row.duelNet > 0 ? "+" : ""}${fmt(row.duelNet)}`,
      tone: onSun ? "var(--ink0)" : row.duelNet > 0 ? "var(--green)" : "var(--clay-text)" },
    atRisk > 0 && { k:"bet", v: `${fmt(atRisk)} at risk`, tone:"var(--live2)" },
  ].filter(Boolean);
  if (!bits.length) return null;
  return (
    <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginTop:3 }}>
      {bits.map((b, i) => (
        <span key={i} style={{ display:"inline-flex", alignItems:"center", gap:3.5, borderRadius:99,
          padding:"1.5px 7px 1.5px 5px", background: onSun ? "color-mix(in srgb, var(--ink0) 13%, transparent)" : "var(--ink-tint)",
          border:`1px solid ${onSun ? "color-mix(in srgb, var(--ink0) 18%, transparent)" : "var(--line)"}` }}>
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke={b.tone}
            strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true"
            style={{ flexShrink:0 }}>{PILL_ART[b.k]}</svg>
          <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:12.5, lineHeight:1.15,
            color:b.tone }}>{b.v}</span>
        </span>
      ))}
    </div>
  );
}

/* everything Brandon orders and plans from, as tab-separated text: it pastes
   straight into a spreadsheet or a supplier form. Blanks stay blank, because
   a guessed size is worse than a missing one. */


/* ─────────── locker room (pre-weekend roster wall; Board takes over when live) ─────────── */
/* GM's weekend sheet: the address and host flights everyone reads during
   onboarding and in the guide. Saved as one action */



/* ─────────── the board ─────────── */
/* ─────────── the poker finale, on the board ───────────
   The app runs the table: starting stacks, blind clock, busts. Cards and chips
   stay physical. The clock is derived; this card re-derives every second. */
const mmss = ms => {
  const t = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};
export function PokerCard({ state, standings, me, gm, onBuyin, onStart, onCancel, onLevel, onPause, onBust, onUnbust, onCount, onReview }) {
  const pk = state.poker;
  const [now, setNow] = useState(() => serverNow());
  const [confirmOut, setConfirmOut] = useState(false);
  const [counting, setCounting] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  useEffect(() => {
    if (!pk?.startedAt) return;
    const t = setInterval(() => setNow(serverNow()), 1000);
    return () => clearInterval(t);
  }, [pk?.startedAt]);
  useEffect(() => { if (!confirmOut) return; const t = setTimeout(() => setConfirmOut(false), 4000); return () => clearTimeout(t); }, [confirmOut]);
  if (!pk || state.results[pk.id]) return null;
  const outIdx = pk.outs.findIndex(o => o.player === me);
  const myRow = standings.find(r => r.player === me);
  /* one pane of glass; its rows part on hairlines */
  const card = { marginBottom:12, borderRadius:14, overflow:"hidden", border:"1px solid var(--line)",
    background:"var(--night)", boxShadow:"var(--glass-edge)" };
  /* an away guest has no seat: no count, no bust, their chips carry as is */
  const unseated = !!me && Array.isArray(pk.seats) && !pk.seats.includes(me);
  const carried = unseated ? pk.unseated?.[me] ?? myRow?.pts ?? 0 : 0;
  const seatButton = { minHeight:44, minWidth:44, fontFamily:SANS, fontWeight:700, fontSize:12, letterSpacing:"0.05em",
    textTransform:"uppercase", borderRadius:10, padding:"0 12px", cursor:"pointer", flexShrink:0 };
  const notSeated = unseated && (
    <div style={{ display:"flex", justifyContent:"space-between", gap:12, borderTop:"1px solid var(--night-line)", padding:"12px 14px", fontFamily:SANS, fontSize:12.5, color:BONE }}>
      <span>Not seated</span><b>{fmt(carried)}</b></div>
  );

  if (!pk.startedAt) {
    const d = myRow && !unseated ? pokerDenoms(myRow.pts) : null;
    return (
      <div id="fd-poker-table" className="fd-night" style={card}>
        <div style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px" }}>
          <GameMark id="poker" size={34} />
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:17, letterSpacing:"0.05em",
              textTransform:"uppercase", color:"var(--sun)" }}>Championship Poker</div>
            {myRow && d ? (
              <div style={{ fontFamily:SANS, fontSize:12.5, color:BONE, marginTop:2 }}>
                Starting stack: <b>{fmt(myRow.pts)}</b>
              </div>
            ) : (
              <div style={{ fontFamily:SANS, fontSize:12, color:"var(--night-text)" }}>{fmt(pk.total)} chips in play</div>
            )}
          </div>
          <button onClick={onBuyin} style={{ ...seatButton, background:"transparent", color:BONE,
            border:"1.5px solid var(--ghost-line)" }}>All stacks</button>
        </div>
        {myRow && d?.length > 0 && <div style={{ padding:"0 14px 12px 60px" }}><DenomStacks stack={myRow.pts} size={26} build /></div>}
        {notSeated}
        {gm && (confirmCancel ? (
          <div style={{ padding:"0 14px 12px" }}>
            <p style={{ margin:"0 0 8px", fontFamily:SANS, fontSize:12.5, color:BONE }}>
              Clears the dealt stacks and removes the minimum stack grants.</p>
            <div style={{ display:"flex", gap:8 }}>
              <Btn kind="flame" onClick={async () => { const result = await onCancel(); if (result?.ok) setConfirmCancel(false); return result; }}
                style={{ flex:1, fontSize:12.5 }}>Cancel the table</Btn>
              <Btn kind="ghost" onClick={() => setConfirmCancel(false)} style={{ fontSize:12.5 }}>Keep it</Btn>
            </div>
          </div>
        ) : (
          <div style={{ display:"flex", gap:8, padding:"0 14px 12px" }}>
            <Btn onClick={onStart} style={{ flex:1, fontSize:12.5 }}>Start the table</Btn>
            <Btn kind="danger" onClick={() => setConfirmCancel(true)} style={{ fontSize:12.5 }}>Cancel</Btn>
          </div>
        ))}
      </div>
    );
  }

  const clk = pokerClock(pk, now);
  const outSet = new Set(pk.outs.map(o => o.player));
  const seats = pk.seats || ROSTER;
  const alive = seats.length - outSet.size;
  const counted = seats.filter(p => !outSet.has(p) && pk.counts?.[p] !== undefined);
  const countSum = counted.reduce((s, p) => s + pk.counts[p], 0);
  const allIn = counted.length === alive;
  const countPhase = counting || (clk.last && clk.msLeft === 0) || counted.length > 0;

  return (
    <div id="fd-poker-table" className="fd-night" style={card}>
      <div style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px" }}>
        <PokerBlinds pk={pk} clk={clk} now={now} alive={alive} />
        <div style={{ textAlign:"right" }}>
          <div style={{ fontFamily:DISPLAY, fontWeight:800, fontSize:30, lineHeight:1.15, fontVariantNumeric:"tabular-nums",
            color: clk.msLeft < 60000 && !clk.last ? "var(--lamp-live-text)" : "var(--ink)" }}>
            {clk.paused ? mmss(clk.msLeft) : clk.final ? "LAST" : mmss(clk.msLeft)}</div>
          <div style={{ fontFamily:SANS, fontSize:12, color:"var(--night-text2)", marginTop:3 }}>
            {clk.paused ? "Paused" : clk.final ? "Count" : "Next level"}</div>
        </div>
      </div>

      <div className="fd-seat-chips-row"><PokerSeatChips state={state} pk={pk} /></div>
      <TableViewEntry state={state} me={me} />
      {/* your seat: bust yourself, count yourself. The GM never types for you. */}
      {notSeated}
      {me && !unseated && outIdx < 0 && (
        <div style={{ borderTop:"1px solid var(--night-line)", padding:"9px 14px" }}>
          {pk.counts?.[me] !== undefined && !counting ? (
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <span style={{ fontFamily:SANS, fontSize:12.5, color:BONE, flex:1 }}>
                Counted: <b>{fmt(pk.counts[me])}</b></span>
              <button onClick={() => setCounting(true)} style={{ ...seatButton, background:"none", border:"none",
                color:"var(--night-text)" }}>Recount</button>
            </div>
          ) : countPhase ? (
            <ChipCounter start={pk.counts?.[me]} onDone={async total => { const result = await onCount(me, total); if (result?.ok) setCounting(false); return result; }} />
          ) : (
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <span style={{ fontFamily:SANS, fontSize:12.5, color:"var(--night-text)", flex:1 }}>
                Starting stack: <b style={{ color:BONE }}>{fmt(pk.startingStacks?.[me] ?? myRow?.pts ?? 0)}</b></span>
              <button onClick={() => setCounting(true)} style={{ ...seatButton, background:"none", border:"none",
                color:"var(--night-text)" }}>Count</button>
              <button onClick={() => { if (confirmOut) { onBust(me); setConfirmOut(false); } else setConfirmOut(true); }}
                style={{ ...seatButton,
                  background: confirmOut ? "var(--clay)" : "transparent",
                  color: confirmOut ? BONE : "var(--clay-text)",
                  border:"1.5px solid var(--danger-line)" }}>
                {confirmOut ? "Tap again, you are out" : "I busted"}</button>
            </div>
          )}
        </div>
      )}
      {me && !unseated && outIdx >= 0 && (
        <div style={{ borderTop:"1px solid var(--night-line)", padding:"9px 14px",
          display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontFamily:SANS, fontSize:12.5, color:BONE, flex:1 }}>
            Out. You finish {ord(seats.length - outIdx)}.</span>
          <button onClick={() => onUnbust(me)} style={{ ...seatButton, background:"none", border:"none",
            color:"var(--night-text)" }}>Wrong, back in</button>
        </div>
      )}

      {/* counts land in parallel; the GM posts once when everyone is in */}
      {counted.length > 0 && (
        <div style={{ borderTop:"1px solid var(--night-line)", padding:"8px 14px",
          display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontFamily:SANS, fontSize:12, color:"var(--night-text)", flex:1 }}>
            {counted.length} of {alive} counted{allIn ? `, ${fmt(countSum)} of ${fmt(pk.total)}` : ""}
            {allIn && countSum !== pk.total && (
              <span style={{ color:"var(--clay-text)" }}> ({countSum > pk.total
                ? `${fmt(countSum - pk.total)} over` : `${fmt(pk.total - countSum)} short`})</span>
            )}
          </span>
          {gm && (
            <button onClick={onReview} style={{ fontFamily:SANS, fontWeight:700, fontSize:12, letterSpacing:"0.05em",
              textTransform:"uppercase", background: allIn ? "var(--sun)" : "transparent",
              color: allIn ? "var(--ink0)" : BONE,
              border:"1.5px solid " + (allIn ? "var(--ink0)" : "var(--ghost-line)"),
              borderRadius:10, padding:"6px 12px", cursor:"pointer" }}>
              {allIn ? "Post the counts" : "Review"}</button>
          )}
        </div>
      )}

      {gm && (
        <div style={{ borderTop:"1px solid var(--night-line)", padding:"8px 14px 10px",
          display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ ...label, color:"var(--night-text2)" }}>Level</span>
          <button onClick={() => onLevel(-1)} aria-label="Previous level" style={{ width:44, height:44, borderRadius:10, cursor:"pointer",
            background:"transparent", border:"1.5px solid var(--ghost-line)", color:BONE, fontSize:18 }}><Icon name="minus" size={18} /></button>
          <button onClick={() => onLevel(1)} aria-label="Next level" style={{ width:44, height:44, borderRadius:10, cursor:"pointer",
            background:"transparent", border:"1.5px solid var(--ghost-line)", color:BONE, fontSize:18 }}><Icon name="plus" size={18} /></button>
          {onPause && <button onClick={() => onPause(!clk.paused)} style={{ minHeight:44, padding:"0 12px",
            borderRadius:10, cursor:"pointer", background:"transparent", border:"1.5px solid var(--ghost-line)",
            color:BONE, fontFamily:SANS, fontWeight:700, fontSize:12, textTransform:"uppercase" }}>
            {clk.paused ? "Resume clock" : "Pause clock"}</button>}
          <span style={{ flex:1 }} />
          {!counted.length && (
            <button onClick={onReview} style={{ background:"none", border:"none", color:"var(--night-text)",
              fontFamily:SANS, fontWeight:700, fontSize:12, cursor:"pointer", textTransform:"uppercase",
              minHeight:44, padding:"4px 0" }}>Table sheet</button>
          )}
        </div>
      )}
    </div>
  );
}

/* count your stack by denomination; the app does the math. Values in chips. */
function ChipCounter({ start, onDone }) {
  const denominations = [1000,500,100,25];
  const countId = useId(), saving = useRef(false);
  const [counts,setCounts] = useState(()=>{
    let left = start || 0;
    return Object.fromEntries(denominations.map(value=>{const n=Math.floor(left/value);left-=n*value;return [value,n];}));
  });
  const [pending,setPending] = useState(false), [error,setError] = useState("");
  const total = denominations.reduce((sum,value)=>sum+Number(counts[value]||0)*value,0);
  const set = (value,count)=>{if (!saving.current) setCounts(current=>({...current,[value]:count}));};
  return <div className="fd-chip-counter">
    {denominations.map(value=><div className="fd-chip-count-row" key={value}>
      <label htmlFor={countId+value}>{fmt(value)} chips</label>
      <button type="button" disabled={pending || !Number(counts[value])} aria-label={"Remove one "+value+" chip"}
        onClick={()=>set(value,Math.max(0,Number(counts[value]||0)-1))}><Icon name="minus" size={16} /></button>
      <input id={countId+value} aria-label={"Number of "+value+" chips"} inputMode="numeric" pattern="[0-9]*" value={counts[value]} disabled={pending}
        onChange={event=>{if (/^\d*$/.test(event.target.value)) set(value,event.target.value);}}/>
      <button type="button" disabled={pending} aria-label={"Add one "+value+" chip"} onClick={()=>set(value,Number(counts[value]||0)+1)}><Icon name="plus" size={16} /></button>
    </div>)}
    <div className="fd-chip-count-total"><span>Total</span><strong>{fmt(total)}</strong></div>
    {error && <p role="alert">{error}</p>}
    <ActionButton disabled={pending} onClick={async()=>{
      if (saving.current) return;
      saving.current = true;
      setPending(true);setError("");
      try {const result=await onDone(total);if(result?.ok !== true)setError(result?.error || "Count not saved. Try again.");}
      catch(failure){setError(failure?.message || "Count not saved. Try again.");}
      finally {saving.current=false;setPending(false);}
    }} style={{width:"100%"}}>{pending ? "Saving…" : "Save count"}</ActionButton>
  </div>;
}

function PokerBuyinSheet({ state, standings, gm, onClose, onStart }) {
  const pk = state.poker;
  if (!pk) return null;
  /* only the seats were dealt; an away player's total carries, undealt */
  const seats = Array.isArray(pk.seats) ? pk.seats : standings.map(r => r.player);
  const dealt = standings.filter(r => seats.includes(r.player))
    .map(r => ({ ...r, pts:pk.startingStacks?.[r.player] ?? r.pts }));
  const away = standings.filter(r => !seats.includes(r.player));
  return (
    <Sheet title="Starting stacks" onClose={onClose}>
      {dealt.map(r => (
        <div key={r.player} style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 0",
          borderBottom:"1px solid var(--line)" }}>
          <Avatar state={state} p={r.player} size={28} />
          <span style={{ flex:1, minWidth:0, display:"flex", flexDirection:"column", gap:4 }}>
            <span style={{ fontFamily:SANS, fontWeight:600, fontSize:14, color:"var(--ink)",
              overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{disp(state, r.player)}</span>
            <DenomStacks stack={r.pts} size={30} />
          </span>
          <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:19, color:"var(--ink)", minWidth:52,
            textAlign:"right" }}>{fmt(r.pts)}</span>
        </div>
      ))}
      {away.length > 0 && <div style={{ padding:"10px 0 0" }}>
        {away.map(r => (
          <div key={r.player} style={{ display:"flex", alignItems:"center", gap:10, padding:"5px 0",
            fontFamily:SANS, fontSize:13, color:"var(--muted)" }}>
            <Avatar state={state} p={r.player} size={22} />
            <span style={{ flex:1, minWidth:0 }}>{disp(state, r.player)}</span>
            <span>Away</span><b style={{ color:"var(--ink)" }}>{fmt(pk.unseated?.[r.player] ?? r.pts)}</b>
          </div>
        ))}
      </div>}
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 0 14px" }}>
        <span style={{ ...label, flex:1 }}>Chips in play</span>
        <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:22, color:"var(--signal-text)" }}>{fmt(pk.total)}</span>
      </div>
      {gm && <div className="fd-stack-tray" style={{ margin:"0 0 14px" }}>
        <span style={label}>The tray</span>
        <ChipTray inventory={pokerInventory(pk.startingStacks || standings.map(r => r.pts))} />
      </div>}
      {gm && !pk.startedAt && <Btn onClick={onStart} style={{ width:"100%" }}>Start the table</Btn>}
    </Sheet>
  );
}

/* GM table sheet: live count status, tap a row to fix a count, one post */
function PokerResultSheet({ state, onClose, onCount, onBust, onUnbust, onPost }) {
  const pk = state.poker;
  const [fixing, setFixing] = useState(null);
  const [pending,setPending] = useState(false), [error,setError] = useState("");
  const saving = useRef(false);
  const act = async callback => {
    if (saving.current) return {ok:false,error:"Saving…"};
    saving.current=true;setPending(true);setError("");
    try {
      const result=await callback();
      if (result?.ok !== true) setError(result?.error || "Not saved. Try again.");
      return result;
    } catch(failure) {const message=failure?.message || "Not saved. Try again.";setError(message);return {ok:false,error:message};}
    finally {saving.current=false;setPending(false);}
  };
  if (!pk) return null;
  const outSet = new Set(pk.outs.map(o => o.player));
  const seats = pk.seats || ROSTER;
  const alive = seats.filter(p => !outSet.has(p));
  const counted = alive.filter(p => pk.counts?.[p] !== undefined);
  const sum = counted.reduce((s, p) => s + pk.counts[p], 0);
  const allIn = counted.length === alive.length;
  return (
    <Sheet title="The table" onClose={onClose} busy={pending}>
      {seats.map(p => {
        const out = outSet.has(p);
        const c = pk.counts?.[p];
        return (
          <div key={p}>
            <div className={"fd-poker-count-row"+(out ? " is-out" : "")}>
              <button className="fd-poker-count-player" disabled={out || pending} aria-expanded={fixing===p}
                aria-label={out ? `${disp(state,p)} is out` : `Edit ${disp(state,p)}'s chip count`}
                onClick={() => {if (!saving.current) setFixing(f => f === p ? null : p);}}>
                <Avatar state={state} p={p} size={28}/><span>{disp(state,p)}</span>
                {out ? <Tag>Out</Tag> : c !== undefined ? <strong>{fmt(c)}</strong> : <small>counting</small>}
              </button>
              <button className="fd-poker-count-action" disabled={pending} aria-label={`${out ? "Bring back" : "Bust"} ${disp(state,p)}`}
                onClick={()=>act(async()=>{const result=await (out ? onUnbust(p) : onBust(p));if(result?.ok) setFixing(null);return result;})}>
                {out ? "Back in" : "Bust"}
              </button>
            </div>
            {fixing === p && !out && (
              <div className="fd-night" style={{ padding:"10px 0", borderBottom:"1px solid var(--line)", background:"var(--night)",
                margin:"0 -16px", paddingLeft:16, paddingRight:16 }}>
                <ChipCounter start={c} onDone={total => act(async()=>{ const result = await onCount(p, total); if (result?.ok) setFixing(null); return result; })} />
              </div>
            )}
          </div>
        );
      })}
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 0 4px" }}>
        <span style={{ ...label, flex:1 }}>Counted</span>
        <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:22,
          color: allIn && sum === pk.total ? "var(--green)" : "var(--ink)" }}>{fmt(sum)}</span>
        <span style={{ fontFamily:SANS, fontSize:12.5, color:"var(--muted)" }}>of {fmt(pk.total)}</span>
      </div>
      {allIn && sum !== pk.total && (
        <div style={{ fontFamily:SANS, fontSize:12.5, color:"var(--clay-text)", marginBottom:10 }}>
          {sum > pk.total ? `${fmt(sum - pk.total)} over` : `${fmt(pk.total - sum)} short`}.
        </div>
      )}
      {error && <p role="alert" style={{color:"var(--clay-text)",fontSize:13}}>{error}</p>}
      <Btn disabled={!allIn || pending} onClick={()=>act(onPost)} style={{ width:"100%", marginTop:8 }}>
        {allIn ? "Post the counts" : `Waiting on ${alive.length - counted.length}`}</Btn>
    </Sheet>
  );
}


/* what a result actually changed: rank moves, the lead, and the chips that
   settled on it. Derived by recomputing standings without that result. */
function resultImpact(state, events, latest, standings) {
  if (latest.res.stacks) return "";
  const prev = { ...state, results: { ...state.results } };
  delete prev.results[latest.ev.id];
  const before = computeStandings(prev);
  const rank = rows => Object.fromEntries(rows.map(r => [r.player, r.rank]));
  const rb = rank(before), ra = rank(standings);
  const awards = resultAwards(state, latest.ev, latest.res);
  const awarded = awards.map(award => award.player);
  const crew = awards.filter(award => award.place === "crew");
  let climb = null;
  awarded.forEach(p => {
    const d = (rb[p] ?? 99) - (ra[p] ?? 99);
    if (d > 0 && (!climb || d > climb.d)) climb = { p, d };
  });
  const leadBefore = before.filter(r => r.rank === 1).map(r => r.player).join("+");
  const leadAfter = standings.filter(r => r.rank === 1).map(r => r.player).join("+");
  const settled = (state.wagers || []).filter(w => w.eventId === latest.ev.id)
    .map(w => ({ w, r: resolveWager(state, w, events) })).filter(x => x.r.status === "won" || x.r.status === "lost");
  /* what the book actually moved, in board points. Chip counts read as a
     second currency here, and a bare "14 burned" names neither */
  const paid = settled.reduce((s, x) => s + Math.max(0, x.r.delta || 0), 0);
  const lost = -settled.reduce((s, x) => s + Math.min(0, x.r.delta || 0), 0);
  const parts = [];
  if (leadAfter !== leadBefore)
    parts.push(`${standings.filter(r => r.rank === 1).map(r => disp(state, r.player)).join(" and ")} take${leadAfter.includes("+") ? "" : "s"} the lead`);
  else if (climb) parts.push(`${disp(state, climb.p)} up ${climb.d} to ${ord(ra[climb.p])}`);
  if (crew.length) parts.push(`Crew ${crew.map(award => disp(state, award.player)).join(", ")} +${fmt(crew[0].pts)}`);
  if (paid && lost) parts.push(`Bets paid ${fmt(paid)} and lost ${fmt(lost)}`);
  else if (paid) parts.push(`Bets paid ${fmt(paid)}`);
  else if (lost) parts.push(`Bets lost ${fmt(lost)}`);
  return parts.join(". ");
}

/* ─────────── slate ─────────── */
function PlayerLinks({ state, players, onPlayer, size=26 }) {
  return <div className="fd-player-links">{players.map(p => <button type="button" key={p}
    className="fd-player-link" onClick={() => onPlayer(p)} aria-label={`View ${disp(state,p)}'s player card`}>
    <Avatar state={state} p={p} size={size} /><span>{disp(state,p)}</span>
  </button>)}</div>;
}

function EventCrewCard({ state, roles, compact=false, onPlayer }) {
  const assignments = (roles || []).filter(item => item?.player);
  if (!assignments.length) return null;
  if (compact) {
    if (onPlayer) return <div className="fd-event-crew-compact"><span style={label}>Event crew</span>
      {assignments.map(item=><button type="button" key={item.player} onClick={()=>onPlayer(item.player)} aria-label={`View ${disp(state,item.player)}'s player card`}>
        <Avatar state={state} p={item.player} size={24}/><span>{disp(state,item.player)}</span><small>{overflowRoleMeta(item.role).short}</small>
      </button>)}
    </div>;
    return (
      <div style={{ display:"flex", alignItems:"center", gap:8, minWidth:0, marginTop:9, paddingTop:8,
        borderTop:"1px solid var(--line)" }}>
        <span style={{ ...label, color:"var(--muted2)", flexShrink:0 }}>Event crew</span>
        <AvatarStack state={state} players={assignments.map(item => item.player)} size={20} max={3} />
        <span style={{ fontFamily:SANS, fontWeight:600, fontSize:12, color:"var(--ink)", minWidth:0,
          overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1 }}>
          {assignments.map(item => disp(state, item.player)).join(", ")}
        </span>
        <span style={{ fontFamily:SANS, fontWeight:700, fontSize:12, color:"var(--muted2)",
          flexShrink:0 }}>
          {assignments.map(item => overflowRoleMeta(item.role).short).join(" + ")}
        </span>
      </div>
    );
  }
  return (
    <div style={{ margin:"10px 0 4px", padding:"11px 12px", borderRadius:14,
      background:"var(--paper2)", border:"1px solid var(--bone-line)" }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
        <span style={{ ...label, color:"var(--muted2)", flex:1 }}>Event crew</span>
      </div>
      {assignments.map((item, index) => {
        const meta = overflowRoleMeta(item.role);
        if (onPlayer) return <button type="button" key={`${item.player}-${index}`} className="fd-crew-link"
          onClick={() => onPlayer(item.player)} aria-label={`View ${disp(state,item.player)}'s player card`}>
          <Avatar state={state} p={item.player} size={30} />
          <span><strong>{disp(state,item.player)}</strong></span>
          <small>{meta.label}</small>
        </button>;
        return (
          <div key={`${item.player}-${index}`} style={{ display:"flex", alignItems:"center", gap:9,
            padding:index ? "8px 0 0" : "0", marginTop:index ? 8 : 0,
            borderTop:index ? "1px solid var(--line)" : "none" }}>
            <Avatar state={state} p={item.player} size={30} />
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontFamily:SANS, fontWeight:700, fontSize:13, color:"var(--ink)",
                overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                {disp(state, item.player)}
              </div>
            </div>
            <span style={{ fontFamily:SANS, fontWeight:700, fontSize:12, color:"var(--accent2)",
              background:"var(--accent-tint)", borderRadius:7, padding:"4px 7px", flexShrink:0 }}>
              {meta.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}



/* ─────────── stage grid (event sheet + TV) ─────────── */
function StageGrid({ state, ev, gm, onThrough, onFinal, onPlayer, size="md" }) {
  const st = state.stages[ev.id];
  if (!st) return null;
  const finalists = stageFinalists(st);
  const dims = {
    md: { av:24, f:13.5, tf:13, pad:"7px 10px", gap:8, col:"1fr 1fr" },
    lg: { av:36, f:19,   tf:17, pad:"11px 14px", gap:14, col:`repeat(${Math.min(st.groups.length + (finalists ? 1 : 0), 4)}, 1fr)` },
  }[size];
  const GroupCard = ({ title, entrants, through, gIdx, isFinal, wide }) => (
    <div style={{ background:"var(--paper2)", border:"1px solid " + (isFinal ? "var(--ghost-line)" : "var(--line)"),
      borderRadius:14, overflow:"hidden", boxShadow:"var(--shadow-1)",
      ...(wide ? { gridColumn:"1 / -1" } : {}) }}>
      <div style={{ ...label, fontSize: size==="lg" ? 13 : 10.5, padding: size==="lg" ? "9px 14px 5px" : "7px 10px 3px",
        color: isFinal ? "var(--accent2)" : "var(--muted)" }}>{title}</div>
      {entrants.map(key => {
        const v = stageEntrantView(state, st, key);
        const isThrough = isFinal ? st.finalWinner === key : (through || []).includes(key);
        const decided = isFinal ? st.finalWinner !== null && st.finalWinner !== undefined
          : (through || []).length >= st.advance;
        const dimmed = decided && !isThrough;
        const clickable = gm && (isFinal ? onFinal : onThrough);
        if (!gm && onPlayer) return <div key={String(key)} style={{padding:dims.pad,
          borderTop:"1px solid var(--line)",background:isThrough ? "var(--accent-tint)" : "transparent"}}>
          <PlayerLinks state={state} players={v.players} onPlayer={onPlayer} size={dims.av} />
          {isThrough && <small style={{color:"var(--accent2)"}}>{isFinal ? "Winner" : "Advanced"}</small>}
        </div>;
        return (
          <button key={String(key)} disabled={!clickable}
            onClick={() => isFinal ? onFinal(key) : onThrough(gIdx, key)}
            style={{ display:"flex", alignItems:"center", gap:8, width:"100%", textAlign:"left",
              padding:dims.pad, border:"none", borderTop:"1px solid var(--line)",
              cursor: clickable ? "pointer" : "default",
              background: isThrough ? "var(--accent-tint)" : "transparent",
              opacity: dimmed ? 0.38 : 1 }}>
            <AvatarStack state={state} players={v.players} size={dims.av} max={3} />
            <span style={{ fontFamily:SANS, fontWeight:700, fontSize:dims.f, flex:1,
              overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
              color: isThrough ? "var(--accent2)" : "var(--ink)" }}>{v.name}</span>
            {isThrough && <span style={{ fontFamily:SANS, fontWeight:700, fontSize:dims.tf, color:"var(--accent2)" }}>
              <Icon name={isFinal ? "trophy" : "check"} size="1em" /></span>}
          </button>
        );
      })}
    </div>
  );
  return (
    <div style={{ display:"grid", gridTemplateColumns:dims.col, gap:dims.gap, alignItems:"start" }}>
      {st.groups.map((g, i) => (
        <GroupCard key={i} title={`${g.name}${st.advance > 1 ? `, top ${st.advance} through` : ""}`}
          entrants={g.entrants} through={g.through} gIdx={i} />
      ))}
      {finalists && (
        <GroupCard title="The Final" entrants={finalists} isFinal
          wide={size === "md" && (st.groups.length + 1) % 2 === 1} />
      )}
    </div>
  );
}

/* ─────────── event sheet ─────────── */
function EventSheet({ ev, state, me, gm, onLock, onWinner, onUndo, onClose, onBack, onPlayer, onBets, enterResult, clearRes, onEdit, onDraw, onClearDraw,
  onStages, onClearStages, onThrough, onFinal, onDeckToggle, onStart, onShelve, onRemove, openBracket, openDraft, onReplay,
  onPlayNext, announceNext, onAnnounceDraw, onSwap, onTakeBack }) {
  const res = state.results[ev.id];
  const [confirmTakeBack, setConfirmTakeBack] = useState(false);
  const contestOps = useContestOperations();
  const draw = state.draws[ev.id];
  const draftLive = state.drafts?.[ev.id];
  const br = state.brackets[ev.id];
  const st = state.stages[ev.id];
  const table = AWARDS[ev.value] ? awardTable(ev) : undefined;
  const shelvedNow = !!state.shelved[ev.id];
  const [confirmRedraw, setConfirmRedraw] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearReason, setClearReason] = useState("");
  const [confirmScrap, setConfirmScrap] = useState(false);
  const [confirmShelve, setConfirmShelve] = useState(false);
  const openBets = (state.wagers || []).filter(w => w.eventId === ev.id
    && resolveWager(state, w, allEventsOf(state)).status === "pending");
  const [editOpen, setEditOpen] = useState(false);
  const [howTo, setHowTo] = useState(false);
  const [more, setMore] = useState(false);
  const [eName, setEName] = useState("");
  const [eDesc, setEDesc] = useState("");
  const [eValue, setEValue] = useState(400);
  const [eSession, setESession] = useState(null);
  const openEdit = () => {
    setEName(ev.name); setEDesc(ev.desc || ""); setEValue(ev.value ?? 400);
    setESession(SESSIONS.find(s => s.id === ev.session) ? ev.session : null);
    setEditOpen(true);
  };
  /* the crew starts as whoever has sat out least, so nobody has to untick */
  const [suggested] = useState(() => ev.teamCfg && !state.draws?.[ev.id] ? suggestParticipants(state, ev) : null);
  const [outs, setOuts] = useState(() => (suggested?.roles || []).map(item => item.player));
  const [outRoles, setOutRoles] = useState(() => Object.fromEntries((suggested?.roles || []).map(item => [item.player, item.role])));
  const [swapOut, setSwapOut] = useState(""), [swapIn, setSwapIn] = useState("");
  const [showOuts, setShowOuts] = useState(false);
  const [stageCfgOpen, setStageCfgOpen] = useState(!!ev.stageCfg);
  const [nGroups, setNGroups] = useState(null);
  const [advance, setAdvance] = useState(ev.stageCfg?.advance || 1);
  const [setupPending, setSetupPending] = useState(false);
  const [contestPending, setContestPending] = useState(false);
  const waitForContest = async callback => {
    setContestPending(true);
    try {return await callback();} finally {setContestPending(false);}
  };
  const [setupError, setSetupError] = useState("");
  const setupBusy = useRef(false);
  const saveSetup = async callback => {
    if (setupBusy.current) return;
    setupBusy.current = true; setSetupPending(true); setSetupError("");
    try {
      const result = await callback();
      if (!result?.ok) setSetupError(result?.error || "Change not saved. Try again.");
    } catch (error) { setSetupError(error?.message || "Change not saved. Try again."); }
    finally { setupBusy.current = false; setSetupPending(false); }
  };
  const lifecycle = resolveEventLifecycle(state, ev);
  const contest = resolveCurrentContest(state, ev);
  const contestActive = contest && ["betting-open", "betting-locked", "in-progress", "awaiting-result"].includes(contest.phase);
  const setupAllowed = ["setup", "draw-pending", "draw-revealed", "scheduled"].includes(lifecycle.phase);
  const present = presentPlayers(state);
  const inPlayers = present.filter(p => !outs.includes(p));
  const participantFit = validateEventParticipants(ev, inPlayers, present);
  const overflowAssignments = outs.filter(player => present.includes(player)).map(player => ({
    player,
    role: OVERFLOW_ROLES.includes(outRoles[player]) ? outRoles[player] : "sit-out",
  }));
  const isPoker = !!ev.finale;
  const canHeats = ev.kind === "solo" && !ev.teamCfg && !res && !isPoker;
  const canPools = ev.teamCfg && draw && !br && draw.teams.length >= 4 && !res;
  const stageKind = canHeats ? "heats" : "pools";
  const stageEntrantCount = canHeats ? inPlayers.length : (draw?.teams?.length || 0);
  const suggestedGroups = Math.min(4, Math.max(2, Math.round(stageEntrantCount / (canHeats ? 4 : 3))));
  const groupsChoice = nGroups ?? ev.stageCfg?.nGroups ?? suggestedGroups;
  const heatsFit = inPlayers.length >= groupsChoice * 2;
  const stage = eventStage(state, ev);
  const crewAward = awardPlan(ev, draw).find(row => row.place === "crew")?.pts || null;
  const roles = draw?.roles || st?.roles || draftLive?.roles || null;
  /* your way through a bracket, unless you are on now (the contest says so) */
  const path = stage === "live" && me && !contest?.players?.includes(me) ? bracketPath(state, ev, me) : null;
  /* the contest card shows its own sides while it runs; the drawn teams
     stand alone only before then (and for a two-team game, as the matchup) */
  const contestShowsSides = contestActive && contest?.kind !== "ffa";
  const contestProps = { state, ev, me, gm, onPlayer, onBets, operations:contestOps,
    onLock:reference=>waitForContest(()=>onLock(reference)),
    onWinner:result=>waitForContest(()=>onWinner(result)),
    onUndo:reference=>waitForContest(()=>onUndo(reference)), onResult:()=>waitForContest(enterResult),
    onPlayNext:onPlayNext ? payload=>waitForContest(()=>onPlayNext(payload)) : undefined };
  const who = <>
    {draftLive && !draw && <div className="fd-es-block"><DraftEntry state={state} ev={ev} me={me} onOpen={() => openDraft()}/></div>}
    {draw && !br && !st && !contestShowsSides && <EventTeams state={state} ev={ev} draw={draw} me={me} onPlayer={onPlayer} />}
    {br && !contestActive && <div className="fd-es-block"><CompetitionBracket state={state} ev={ev} me={me} onPlayer={onPlayer}/></div>}
    {st && <div className="fd-es-block"><StageGrid state={state} ev={ev} gm={false} onPlayer={onPlayer}/></div>}
    {!draw && !draftLive && !st && !ev.teamCfg && !isPoker && stage === "before" && <EventField state={state} ev={ev} me={me} onPlayer={onPlayer} />}
    {roles && <EventCrew state={state} roles={roles} me={me} onPlayer={onPlayer} />}
  </>;
  return (
    <Sheet title={ev.name} show onClose={onClose} onBack={onBack} wide={!!br} busy={setupPending || contestPending}
      headerActions={<>
        {(draw || st) && onReplay && <button type="button" disabled={setupPending || contestPending} onClick={onReplay}>Replay draw</button>}
        {/* before play the steps are on the sheet itself; after that the rules are a tap away */}
        {hasGameRules(ev) && stage !== "before" && <button type="button" disabled={setupPending || contestPending} onClick={()=>setHowTo(true)}>Rules</button>}
      </>}>
      {howTo && <HowToSheet gameId={ev.game} variant={ev.variant} ev={ev} onClose={()=>setHowTo(false)}/>}
      {/* the contest: live it leads; a commissioner's quick Undo shows here in any state */}
      <ContestPanel {...contestProps} part="contest" />
      {/* your team's name, while it is still open */}
      <TeamNameCard state={state} ev={ev} me={me} />
      {stage === "before" && <>
        {who}
        <GameSteps game={ev} size="card" className="fd-es-steps" />
        {!GAMES[ev.game] && ev.desc && <p className="fd-es-gm-note">{ev.desc}</p>}
        {table && <EventPays ev={ev} crew={crewAward} />}
      </>}
      {stage === "live" && <>
        {path?.mine && <p className="fd-es-path">{path.text}</p>}
        {who}
        <EventRiding state={state} ev={ev} />
      </>}
      {stage === "after" && <>
        <EventResult state={state} ev={ev} me={me} onPlayer={onPlayer} />
        {br && <details className="fd-event-info"><summary><span>Bracket</span></summary>
          <CompetitionBracket state={state} ev={ev} me={me} onPlayer={onPlayer}/></details>}
        {st && <details className="fd-event-info"><summary><span>{st.kind === "heats" ? "Heats" : "Pools"}</span></summary>
          <StageGrid state={state} ev={ev} gm={false} onPlayer={onPlayer}/></details>}
      </>}
      {!contestActive && onBets && stage !== "after" && <ActionButton variant="secondary" onClick={onBets} style={{width:"100%",marginBottom:12}}>View bets</ActionButton>}

      {gm && <section className="fd-es-gm" aria-labelledby={`fd-es-gm-${ev.id}`}>
        <h2 id={`fd-es-gm-${ev.id}`}>Commissioner</h2>
        <ContestPanel {...contestProps} part="commissioner" />
        <TeamNameDesk state={state} ev={ev} />
        {!state.frozen && <>
          {ev.teamCfg && !draw && !draftLive && !res && (() => {
            const shape = teamFit(ev, present.length) || ev.teamCfg;
            const fit = shape.teams * shape.size;
            const diff = inPlayers.length - fit;
            return (
            <>
              <div className="fd-es-gm-fit">
                <span>{shapeLabel(shape)}</span>
                <button type="button" className={`fd-es-gm-count${diff !== 0 ? " is-off" : ""}`} aria-expanded={showOuts}
                  aria-label={`${inPlayers.length} competitors${shape.size === 1 ? "" : ` of ${fit}`}. Choose who plays`}
                  onClick={() => setShowOuts(v => !v)}>
                  {inPlayers.length}{shape.size === 1 ? "" : ` / ${fit}`} <Icon name={showOuts ? "collapse" : "expand"} size="1em" /></button>
              </div>
              {showOuts && (
                <>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(3,minmax(0,1fr))", gap:5, marginBottom:10 }}>
                    {present.map((p, i) => <PlayerChip key={p} name={p} small selected={!outs.includes(p)}
                      onClick={() => setOuts(o => o.includes(p) ? o.filter(x=>x!==p) : [...o,p])}
                      style={centeredGridCell(i, present.length, 3, 5)} />)}
                  </div>
                  {overflowAssignments.length > 0 && (
                    <div style={{ background:"var(--paper2)", border:"1px solid var(--bone-line)",
                      borderRadius:14, padding:"11px 12px", marginBottom:10 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3 }}>
                        <span style={{ ...label, flex:1 }}>Crew</span>
                        {table?.[2] > 0 && <b style={{ color:"var(--sun)", fontFamily:DISPLAY, fontWeight:800, fontSize:16 }}>+{fmt(table[2])}</b>}
                      </div>
                      {overflowAssignments.map(({ player }, index) => {
                        const role = outRoles[player] || "sit-out";
                        return (
                          <div key={player} style={{ display:"flex", alignItems:"center", gap:9,
                            padding:index ? "9px 0 0" : "0", marginTop:index ? 9 : 0,
                            borderTop:index ? "1px solid var(--line)" : "none" }}>
                            <Avatar state={state} p={player} size={32} />
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ fontFamily:SANS, fontWeight:700, fontSize:12.5, color:"var(--ink)",
                                overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                                {disp(state, player)}
                              </div>
                            </div>
                            <select aria-label={`${disp(state, player)} event crew role`} value={role}
                              onChange={event => setOutRoles(current => ({ ...current, [player]:event.target.value }))}
                              style={{ width:142, maxWidth:"42%", padding:"8px 8px", borderRadius:9,
                                background:"var(--paper)", color:"var(--ink)", border:"1px solid var(--line)",
                                fontFamily:SANS, fontWeight:700, fontSize:12 }}>
                              {OVERFLOW_ROLES.map(value => (
                                <option key={value} value={value}>{overflowRoleMeta(value).label}</option>
                              ))}
                            </select>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
              {!participantFit.ok && <p className="fd-es-gm-note" role="alert" style={{ color:"var(--clay-text)" }}>{participantFit.error}</p>}
              <div style={{ display:"flex", gap:8, marginBottom:10 }}>
                {/* the next event draws and announces in one write, intro first */}
                <Btn disabled={!participantFit.ok || setupPending}
                  onClick={() => saveSetup(() => announceNext && onAnnounceDraw
                    ? onAnnounceDraw(inPlayers, overflowAssignments)
                    : onDraw(inPlayers, overflowAssignments))}
                  style={{ flex:1, whiteSpace:"nowrap", padding:"12px 8px" }}>
                  {setupPending ? "Drawing…" : announceNext ? "Announce and draw" : "Run the draw"}</Btn>
                {ev.kind === "team" && (
                  <Btn kind="dark" disabled={!participantFit.ok}
                    onClick={() => openDraft(inPlayers, overflowAssignments)}
                    style={{ flex:1, whiteSpace:"nowrap", padding:"12px 8px" }}>
                    Captains draft</Btn>
                )}
              </div>
            </>
            );
          })()}
          {ev.teamCfg && draw && !res && setupAllowed && (
            confirmRedraw
              ? <div style={{ display:"flex", gap:8, marginBottom:10 }}>
                  <Btn kind="danger" onClick={() => { onClearDraw(); setConfirmRedraw(false); }} style={{ flex:1 }}>Scrap the draw</Btn>
                  <Btn kind="ghost" onClick={() => setConfirmRedraw(false)} style={{ flex:1 }}>Keep it</Btn>
                </div>
              : <Btn kind="ghost" onClick={() => setConfirmRedraw(true)} style={{ width:"100%", marginBottom:10 }}>Redraw</Btn>
          )}

          {/* a dropout before their contest starts: someone from the bench takes the seat */}
          {(draw || st?.entrantType === "solo") && !res && onSwap && (() => {
            const drawn = draw ? draw.teams.flatMap(team => team.players) : st.groups.flatMap(group => group.entrants);
            const bench = present.filter(player => !drawn.includes(player));
            if (!bench.length) return null;
            const selectStyle = { flex:1, minWidth:120, minHeight:44, padding:"8px", borderRadius:9, background:"var(--paper)",
              color:"var(--ink)", border:"1px solid var(--line)", fontFamily:SANS, fontWeight:700, fontSize:12.5 };
            return (
              <details className="fd-event-info">
                <summary><span>Swap in a player</span></summary>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center", marginBottom:8 }}>
                  <select aria-label="Player leaving" value={swapOut} disabled={setupPending}
                    onChange={event => setSwapOut(event.target.value)} style={selectStyle}>
                    <option value="">Leaving</option>
                    {drawn.map(player => <option key={player} value={player}>{disp(state, player)}</option>)}
                  </select>
                  <select aria-label="Player coming in" value={swapIn} disabled={setupPending}
                    onChange={event => setSwapIn(event.target.value)} style={selectStyle}>
                    <option value="">Coming in</option>
                    {bench.map(player => <option key={player} value={player}>{disp(state, player)}</option>)}
                  </select>
                  <ActionButton compact disabled={!swapOut || !swapIn || setupPending}
                    onClick={() => saveSetup(async () => {
                      const result = await onSwap(swapOut, swapIn);
                      if (result?.ok) { setSwapOut(""); setSwapIn(""); }
                      return result;
                    })}>Swap in</ActionButton>
                </div>
                <p>Voids bets on the player leaving.</p>
              </details>
            );
          })()}
          {/* heats / pools setup */}
          {(canHeats || canPools) && !st && setupAllowed && (
            !stageCfgOpen
              ? <Btn kind="dark" onClick={() => setStageCfgOpen(true)} style={{ width:"100%", marginBottom:10 }}>
                  {canHeats ? "Run heats" : "Set up pools"}</Btn>
              : (
                <div style={{ background:"var(--paper2)", border:"1px solid var(--line)", borderRadius:14,
                  padding:"12px 13px", marginBottom:10 }}>
                  {canHeats && (
                    <>
                      <div style={{ display:"flex", alignItems:"center", marginBottom:8 }}>
                        <div style={{ ...label, flex:1 }}>Heats</div>
                        <button onClick={() => setShowOuts(v => !v)} style={{ cursor:"pointer",
                          fontFamily:SANS, fontWeight:700, fontSize:12.5, padding:"6px 11px", borderRadius:10,
                          background:"var(--paper)", border:"1px solid var(--line)", color:"var(--ink)" }}>
                          {inPlayers.length} playing <Icon name={showOuts ? "collapse" : "expand"} size="1em" /></button>
                      </div>
                      {showOuts && (
                        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,minmax(0,1fr))", gap:5, marginBottom:10 }}>
                          {present.map((p, i) => <PlayerChip key={p} name={p} small selected={!outs.includes(p)}
                            onClick={() => setOuts(o => o.includes(p) ? o.filter(x=>x!==p) : [...o,p])}
                            style={centeredGridCell(i, present.length, 3, 5)} />)}
                        </div>
                      )}
                      {!heatsFit && <p role="alert" style={{ ...pStyle, color:"var(--clay-text)", fontSize:13 }}>
                        Heats need at least 2 players each</p>}
                    </>
                  )}
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                    <span style={{ ...label }}>{canHeats ? "Heats" : "Pools"}</span>
                    {[2,3,4].filter(n => n <= stageEntrantCount).map(n => (
                      <button key={n} onClick={() => setNGroups(n)} style={{ width:44, height:44, borderRadius:10,
                        cursor:"pointer", fontFamily:DISPLAY, fontWeight:700, fontSize:19,
                        background: groupsChoice===n ? GOLD_GRAD : "var(--paper)",
                        color: groupsChoice===n ? "var(--ink0)" : "var(--ink)",
                        border: groupsChoice===n ? "1.5px solid var(--ink0)" : "1.5px solid var(--line)" }}>{n}</button>
                    ))}
                    <span style={{ flex:1 }} />
                    <span style={{ ...label }}>Through</span>
                    {[1,2].map(n => (
                      <button key={n} onClick={() => setAdvance(n)} style={{ width:44, height:44, borderRadius:10,
                        cursor:"pointer", fontFamily:DISPLAY, fontWeight:700, fontSize:19,
                        background: advance===n ? GOLD_GRAD : "var(--paper)",
                        color: advance===n ? "var(--ink0)" : "var(--ink)",
                        border: advance===n ? "1.5px solid var(--ink0)" : "1.5px solid var(--line)" }}>{n}</button>
                    ))}
                  </div>
                  <div style={{ display:"flex", gap:8 }}>
                    <ActionButton disabled={setupPending || canHeats && !heatsFit}
                      onClick={() => saveSetup(() => announceNext && onAnnounceDraw
                        ? onAnnounceDraw(canHeats ? inPlayers : null, canHeats ? overflowAssignments : null,
                          { nGroups:groupsChoice, advance })
                        : onStages({ kind:stageKind, nGroups:groupsChoice, advance,
                          players:inPlayers, roles:overflowAssignments }))} style={{ flex:1 }}>
                      {setupPending ? "Drawing…" : announceNext ? "Announce and draw"
                        : canHeats ? "Draw heats" : "Draw pools"}</ActionButton>
                    <ActionButton variant="tertiary" onClick={() => setStageCfgOpen(false)}>Cancel</ActionButton>
                  </div>
                </div>
              )
          )}
          {setupError && <p className="fd-contest-error" role="alert">{setupError}</p>}
          {st && !res && setupAllowed && (
            confirmScrap
              ? <div style={{ display:"flex", gap:8, marginBottom:10 }}>
                  <ActionButton variant="commit" onClick={() => { onClearStages(); setConfirmScrap(false); }} style={{ flex:1 }}>
                    Scrap {st.kind === "heats" ? "heats" : "pools"}</ActionButton>
                  <ActionButton variant="tertiary" onClick={() => setConfirmScrap(false)} style={{ flex:1 }}>Keep</ActionButton>
                </div>
              : <ActionButton variant="destructive" onClick={() => setConfirmScrap(true)} style={{ width:"100%", marginBottom:10 }}>
                  Scrap {st.kind === "heats" ? "heats" : "pools"}</ActionButton>
          )}

          <div style={{ display:"flex", gap:8, marginTop:6, flexWrap:"wrap" }}>
            {res && !isPoker && <ActionButton onClick={enterResult}
              style={{ flex:1, whiteSpace:"nowrap", padding:"12px 8px" }}>Edit result</ActionButton>}
            {!res && lifecycle.nextAction?.type === "open-betting" && (
              <ActionButton variant="secondary" onClick={onDeckToggle}
                style={{ flex:1, whiteSpace:"nowrap", padding:"12px 8px" }}>Open betting</ActionButton>
            )}
            {!res && !contestActive && lifecycle.nextAction?.type === "lock-betting" && (
              <ActionButton variant="secondary" onClick={onDeckToggle}
                style={{ flex:1, whiteSpace:"nowrap", padding:"12px 8px" }}>Lock betting</ActionButton>
            )}
            {!res && !contestActive && lifecycle.nextAction?.type === "start-event" && (
              <ActionButton onClick={onStart}
                style={{ flex:1, whiteSpace:"nowrap", padding:"12px 8px" }}>Start event</ActionButton>
            )}
            {res && !confirmClear && (
              <ActionButton variant="destructive" onClick={() => setConfirmClear(true)} style={{ flex:1 }}>Clear</ActionButton>
            )}
          </div>
          {!res && onTakeBack && announcementTakeBack(state, ev).enabled && (
            confirmTakeBack ? (
              <div style={{ marginTop:10 }}>
                <p style={{ ...pStyle, fontSize:13, marginBottom:8 }}>
                  {refundText(state, announcementTakeBack(state, ev).refunds) || "No open bets."}</p>
                <div style={{ display:"flex", gap:8 }}>
                  <ActionButton variant="commit" disabled={setupPending} style={{ flex:1 }}
                    onClick={() => saveSetup(async () => { const result = await onTakeBack();
                      if (result?.ok) setConfirmTakeBack(false); return result; })}>
                    {setupPending ? "Taking back…" : "Take it back"}</ActionButton>
                  <ActionButton variant="tertiary" disabled={setupPending} onClick={() => setConfirmTakeBack(false)}>Keep it</ActionButton>
                </div>
              </div>
            ) : <ActionButton variant="destructive" onClick={() => setConfirmTakeBack(true)}
                style={{ width:"100%", marginTop:10 }}>Take back the announcement</ActionButton>
          )}
          {!res && !contestActive && lifecycle.blockers?.length > 0 && (
            <div style={{ ...pStyle, marginTop:8, color:"var(--muted)", fontSize:13 }}>
              {lifecycle.blockers[0]}</div>
          )}
          {res && confirmClear && (
            <div style={{ marginTop:10, padding:"12px 13px", background:"var(--paper2)",
              border:"1px solid var(--line)", borderRadius:14 }}>
              <div style={{ ...label, marginBottom:6 }}>Reason for clearing</div>
              <input value={clearReason} onChange={event => setClearReason(event.target.value)}
                maxLength={100} aria-label="Reason for clearing"
                style={{ width:"100%", background:"var(--paper)", border:"1px solid var(--line)",
                  borderRadius:10, padding:"11px 12px", color:"var(--ink)", fontFamily:SANS,
                  fontWeight:600, fontSize:14, marginBottom:9, outline:"none" }} />
              <div style={{ display:"flex", gap:8 }}>
                <ActionButton variant="commit" disabled={!clearReason.trim()}
                  onClick={() => clearRes(clearReason)} style={{ flex:1 }}>Clear official result</ActionButton>
                <ActionButton variant="tertiary" onClick={() => { setConfirmClear(false); setClearReason(""); }}
                  style={{ flex:1 }}>Keep it</ActionButton>
              </div>
            </div>
          )}
          {editOpen ? (
            <div style={{ background:"var(--paper2)", border:"1px solid var(--line)", borderRadius:14,
              padding:"12px 13px", marginTop:8 }}>
              <div style={{ ...label, marginBottom:6 }}>Name</div>
              <input value={eName} onChange={e => setEName(e.target.value)} maxLength={28} aria-label="Event name"
                style={{ width:"100%", background:"var(--paper)", border:"1px solid var(--line)", borderRadius:10,
                  padding:"11px 12px", color:"var(--ink)", fontFamily:SANS, fontWeight:600, fontSize:16, marginBottom:12, outline:"none" }} />
              <div style={{ ...label, marginBottom:6 }}>How to play</div>
              <textarea value={eDesc} onChange={e => setEDesc(e.target.value)} maxLength={300} rows={3}
                aria-label="Event description"
                style={{ width:"100%", background:"var(--paper)", border:"1px solid var(--line)", borderRadius:10,
                  padding:"11px 12px", color:"var(--ink)", fontFamily:SANS, fontSize:14, lineHeight:1.5,
                  marginBottom:12, outline:"none", resize:"vertical" }} />
              <div style={{ ...label, marginBottom:6 }}>Worth</div>
              <div style={{ display:"flex", gap:8, marginBottom:12 }}>
                {[400,800,1200,1600].map(v => (
                  <button key={v} disabled={!!res} onClick={() => setEValue(v)} style={{ flex:1, height:44, borderRadius:10, cursor:res ? "default" : "pointer",
                    fontFamily:DISPLAY, fontWeight:700, fontSize:16,
                    background: eValue===v ? GOLD_GRAD : "var(--paper)",
                    color: eValue===v ? "var(--ink0)" : "var(--ink)",
                    border: eValue===v ? "1.5px solid var(--ink0)" : "1.5px solid var(--line)" }}>{v}</button>
                ))}
              </div>
              <div style={{ ...label, marginBottom:6 }}>Session</div>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:14 }}>
                {[...SESSIONS.map(s => [s.id, s.label]), [null, "Anytime"]].map(([id, lb]) => (
                  <button key={String(id)} onClick={() => setESession(id)} style={{ fontFamily:SANS, fontWeight:600,
                    fontSize:12.5, padding:"10px 12px", borderRadius:10, cursor:"pointer",
                    background: eSession===id ? GOLD_GRAD : "var(--paper)",
                    color: eSession===id ? "var(--ink0)" : "var(--ink)",
                    border: eSession===id ? "1.5px solid var(--ink0)" : "1.5px solid var(--line)" }}>{lb}</button>
                ))}
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <Btn disabled={!eName.trim()} onClick={() => { onEdit({ name:eName, desc:eDesc, ...(res ? {} : { value:eValue }), session:eSession }); setEditOpen(false); }}
                  style={{ flex:1 }}>Save</Btn>
                <Btn kind="ghost" onClick={() => setEditOpen(false)}>Cancel</Btn>
              </div>
            </div>
          ) : !more ? (
            <button onClick={() => setMore(true)} style={{ background:"none", border:"none", cursor:"pointer",
              fontFamily:SANS, fontWeight:600, fontSize:12.5, color:"var(--accent2)", minHeight:44, padding:"8px 0",
              display:"block", marginLeft:"auto" }}>More <Icon name="expand" size="1em" /></button>
          ) : (
            <div style={{ display:"flex", gap:8, marginTop:8, flexWrap:"wrap" }}>
              <Btn kind="ghost" onClick={openEdit} style={{ flex:1 }}>Edit details</Btn>
              {!res && !confirmShelve && <Btn kind="ghost" onClick={() => shelvedNow || !openBets.length
                ? onShelve(!shelvedNow) : setConfirmShelve(true)} style={{ flex:1 }}>{shelvedNow ? "Restore" : "Shelve"}</Btn>}
              {!res && confirmShelve && <>
                <Btn kind="danger" onClick={() => { setConfirmShelve(false); onShelve(true, true); }} style={{ flex:1 }}>
                  Shelve. Returns {openBets.length} bet{openBets.length === 1 ? "" : "s"}, {fmt(openBets.reduce((sum, w) => sum + w.stake, 0))} chips</Btn>
                <Btn kind="ghost" onClick={() => setConfirmShelve(false)}>Keep</Btn>
              </>}
              {ev.custom && !confirmRemove && <Btn kind="danger" onClick={() => setConfirmRemove(true)}>Remove</Btn>}
              {ev.custom && confirmRemove && <Btn kind="danger" onClick={onRemove}>Confirm remove</Btn>}
            </div>
          )}
        </>}
      </section>}
    </Sheet>
  );
}

/* ─────────── add event ─────────── */
function AddEventSheet({ state, onClose, save }) {
  const [name, setName] = useState("");
  const [value, setValue] = useState(400);
  const [fmt, setFmt] = useState("solo");
  const [sess, setSess] = useState(null);
  const [game, setGame] = useState(null);
  const fmts = [
    { id:"solo", label:"Individual" },
    { id:"pairs", label:"Pairs" },
    { id:"t2", label:"2 teams" },
    { id:"t3", label:"3 teams" },
    { id:"t4", label:"4 teams" },
  ];
  const build = () => {
    const id = "c" + Date.now();
    const base = { id, custom:true, name:name.trim(), value, desc:"",
      ...(sess ? { session:sess } : {}), ...(game ? { game } : {}) };
    if (fmt === "solo") return { ...base, kind:"solo" };
    if (fmt === "pairs") return { ...base, kind:"pairs", teamCfg:{ teams:6, size:2 } };
    /* equal teams from who is here; the remainder works the event as crew */
    const n = Number(fmt[1]);
    return { ...base, kind:"team", teamCfg:{ teams:n, size:Math.floor(presentPlayers(state).length/n) } };
  };
  const draft = build();
  const here = presentPlayers(state).length;
  const capacity = draft.teamCfg ? draft.teamCfg.teams * draft.teamCfg.size : 0;
  const shapeError = draft.teamCfg && (draft.teamCfg.size < 1 || capacity > here)
    ? `${draft.teamCfg.teams} teams need at least ${draft.teamCfg.teams * Math.max(1, draft.teamCfg.size)} players; ${here} here` : "";
  const shapeNote = draft.teamCfg && !shapeError
    ? `${draft.teamCfg.teams} teams of ${draft.teamCfg.size}${here > capacity ? `, ${here - capacity} on crew` : ""}` : "";
  return (
    <Sheet title="Add an event" onClose={onClose}>
      <div style={{ ...label, marginBottom:6 }}>Name</div>
      <input value={name} onChange={e => setName(e.target.value)} maxLength={28} placeholder="Bocce, poker, HORSE"
        aria-label="Event name"
        style={{ width:"100%", background:"var(--paper2)", border:"1px solid var(--line)", borderRadius:14,
          padding:"12px 13px", color:"var(--ink)", fontFamily:SANS, fontWeight:600, fontSize:16, marginBottom:14, outline:"none" }} />
      <div style={{ ...label, marginBottom:6 }}>Worth</div>
      <div style={{ display:"flex", gap:8, marginBottom:14 }}>
        {[400,800,1200,1600].map(v => (
          <button key={v} onClick={() => setValue(v)} style={{ flex:1, height:44, borderRadius:10, cursor:"pointer",
            fontFamily:DISPLAY, fontWeight:700, fontSize:19,
            background: value===v ? GOLD_GRAD : "var(--paper)",
            color: value===v ? "var(--ink0)" : "var(--ink)",
            border: value===v ? "1.5px solid var(--ink0)" : "1.5px solid var(--line)" }}>{v}</button>
        ))}
      </div>
      <div style={{ ...label, marginBottom:6 }}>When</div>
      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:14 }}>
        {[...SESSIONS.map(s => [s.id, s.label]), [null, "Anytime"]].map(([id, lb]) => (
          <button key={String(id)} onClick={() => setSess(id)} style={{ fontFamily:SANS, fontWeight:600, fontSize:12.5,
            padding:"10px 12px", borderRadius:10, cursor:"pointer",
            background: sess===id ? GOLD_GRAD : "var(--paper)",
            color: sess===id ? "var(--ink0)" : "var(--ink)",
            border: sess===id ? "1.5px solid var(--ink0)" : "1.5px solid var(--line)" }}>{lb}</button>
        ))}
      </div>
      <div style={{ ...label, marginBottom:6 }}>Format</div>
      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:14 }}>
        {fmts.map(f => (
          <button key={f.id} onClick={() => setFmt(f.id)} style={{ fontFamily:SANS, fontWeight:600, fontSize:12.5,
            padding:"10px 12px", borderRadius:10, cursor:"pointer",
            background: fmt===f.id ? GOLD_GRAD : "var(--paper)",
            color: fmt===f.id ? "var(--ink0)" : "var(--ink)",
            border: fmt===f.id ? "1.5px solid var(--ink0)" : "1.5px solid var(--line)" }}>{f.label}</button>
        ))}
      </div>
      {(shapeError || shapeNote) && <p role={shapeError ? "alert" : undefined}
        style={{ ...pStyle, marginTop:-6, fontSize:12.5, color:shapeError ? "var(--clay-text)" : "var(--muted2)" }}>
        {shapeError || shapeNote}</p>}
      {/* borrow a known game's mark, hero, and how-to; none = the FD chip */}
      <div style={{ ...label, marginBottom:6 }}>Looks like</div>
      <div style={{ display:"flex", gap:6, overflowX:"auto", marginBottom:16, paddingBottom:4 }}>
        {[null, ...GAME_MARK_IDS].map(g => (
          <button key={String(g)} onClick={() => setGame(g)} style={{ width:52, height:52, borderRadius:10,
            cursor:"pointer", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center",
            background: game===g ? "var(--sun-tint)" : "var(--paper)",
            border: game===g ? "1.5px solid var(--sun)" : "1.5px solid var(--line)" }}>
            {g ? <GameMark id={g} size={34} /> : <FDMark size={30} />}
          </button>
        ))}
      </div>
      <Btn disabled={!name.trim() || !!shapeError} onClick={() => save(build())} style={{ width:"100%", fontSize:16, padding:"14px" }}>
        Add event</Btn>
    </Sheet>
  );
}

function BracketSheet({ ev, state, me, gm, onClose, onBack, onPlayer, onLock, onWinner, onUndo, onPlayNext, onBets, onPostResult }) {
  const [pending,setPending] = useState(false);
  const waitFor = async callback => {setPending(true);try{return await callback();}finally{setPending(false);}};
  const br = state.brackets[ev.id], draw = state.draws[ev.id];
  if (!br || !draw) return null;
  const contest = resolveCurrentContest(state,ev);
  const active = contest && ["betting-open","betting-locked","in-progress","awaiting-result"].includes(contest.phase);
  return <Sheet title={ev.name} subtitle="Bracket" show onClose={onClose} onBack={onBack} busy={pending} wide>
    <ContestPanel state={state} ev={ev} me={me} gm={gm} onPlayer={onPlayer} onBets={onBets}
      onLock={reference=>waitFor(()=>onLock(reference))}
      onWinner={result=>waitFor(()=>onWinner(result))}
      onUndo={reference=>waitFor(()=>onUndo(reference))} onResult={()=>waitFor(onPostResult)}
      onPlayNext={onPlayNext ? payload=>waitFor(()=>onPlayNext(payload)) : undefined}/>
    {!active && <CompetitionBracket state={state} ev={ev} me={me} onPlayer={onPlayer}/>}
    <EventCrewCard state={state} roles={draw.roles} compact onPlayer={onPlayer}/>
  </Sheet>;
}

/* ─────────── result entry (GM, real names) ─────────── */
function ResultSheet({ ev, state, onClose, save }) {
  const existing = state.results[ev.id];
  const table = AWARDS[ev.value] || ev.pays ? awardTable(ev) : [400, 0, 0];
  const slotIdxs = table.map((v,i) => v>0 ? i : null).filter(i => i !== null);
  const bracket = state.brackets[ev.id], stage = state.stages[ev.id];
  const sequenced = !!state.eventOps?.[ev.id]?.contest;
  const winnerKnown = sequenced && ((bracket && bracketChampion(bracket) !== null)
    || (stage && stage.finalWinner !== null && stage.finalWinner !== undefined));
  const editableSlots = slotIdxs.filter(index => !winnerKnown || index !== 0);
  /* what one player in each place is paid */
  const paysEach = index => resultAwards(state, ev, { slots })
    .find(award => award.place === index)?.pts ?? table[index];
  const initial = useMemo(() => {
    if (existing?.slots) return existing.slots.map(s => [...(s||[])]);
    const br = state.brackets[ev.id], draw = state.draws[ev.id], st = state.stages[ev.id];
    if (br && draw) {
      const champ = bracketChampion(br);
      if (champ !== null) {
        const final = br.rounds[br.rounds.length-1][0];
        const a = resolveSlot(br, final.a), b = resolveSlot(br, final.b);
        const runner = champ === a ? b : a;
        /* no 3rd-place game: both semifinal losers take 3rd, each paid in full */
        const semis = br.rounds[br.rounds.length - 2] || [];
        const losers = semis.map(match => [resolveSlot(br, match.a), resolveSlot(br, match.b)]
          .find(side => side !== null && side !== match.winner)).filter(side => side !== undefined && draw.teams[side]);
        return [[...draw.teams[champ].players],
          table[1] > 0 && runner !== null ? [...draw.teams[runner].players] : [],
          table[2] > 0 ? losers.flatMap(side => draw.teams[side].players) : []];
      }
    }
    if (st && st.finalWinner !== null && st.finalWinner !== undefined) {
      const v = stageEntrantView(state, st, st.finalWinner);
      const finalists = stageFinalists(st) || [];
      const runner = finalists.length === 2 ? finalists.find(key => key !== st.finalWinner) : undefined;
      return [[...v.players],
        table[1] > 0 && runner !== undefined ? [...stageEntrantView(state, st, runner).players] : [], []];
    }
    return [[],[],[]];
  }, []); // eslint-disable-line
  const [slots, setSlots] = useState(initial);
  const [active, setActive] = useState(editableSlots[0] ?? 0);
  const [byPlayer, setByPlayer] = useState(false);
  const [confirmCorrection, setConfirmCorrection] = useState(false);
  const [correctionReason, setCorrectionReason] = useState("");
  const [pending,setPending] = useState(false), [error,setError] = useState("");
  /* a paid place left empty is a decision, not an oversight */
  const [emptyCheck, setEmptyCheck] = useState(null);
  const saving = useRef(false);
  const post = async (options, allowEmpty = false) => {
    if (saving.current) return;
    if (!allowEmpty && emptyPaid.length) { setEmptyCheck(options || {}); return; }
    setEmptyCheck(null);
    saving.current=true;setPending(true);setError("");
    try {const result=await save(slots,options);if(result?.ok !== true)setError(result?.error || "Result not saved. Try again.");}
    catch(failure){setError(failure?.message || "Result not saved. Try again.");}
    finally {saving.current=false;setPending(false);}
  };
  const draw = state.draws[ev.id];
  /* Two teams, one game: picking the winner is the whole result (the other
     team is 2nd), so the sheet is one choice, not places to fill. */
  const twoTeams = !winnerKnown && !bracket && !stage && ev.kind !== "solo" && draw?.teams?.length === 2;
  const pickWinner = team => setSlots(prev => {
    if (saving.current) return prev;
    if (team.players.every(p => prev[0].includes(p))) return [[], [], []];
    const other = draw.teams.find(item => item !== team);
    return [[...team.players], table[1] > 0 && other ? [...other.players] : [], []];
  });
  /* only a place some side could still fill: two teams have no 3rd */
  const sidesInPlay = draw?.teams?.length && ev.kind !== "solo" ? draw.teams.length : ROSTER.length;
  const emptyPaid = slotIdxs.filter(index => index > 0 && index < sidesInPlay && !slots[index].length);
  const teamMode = !!draw?.teams?.length && ev.kind !== "solo" && (!byPlayer || sequenced && active === 0);
  const unchanged = !!existing && JSON.stringify(existing.slots || []) === JSON.stringify(slots);
  const taken = p => slots.findIndex(s => s.includes(p));
  const toggle = p => setSlots(prev => {
    if (saving.current || (winnerKnown && prev[0].includes(p))) return prev;
    const nx = prev.map(s => [...s]);
    const w = nx.findIndex(s => s.includes(p));
    if (sequenced && active === 0) return nx.map((slot,index)=>index === 0 ? (w === 0 ? [] : [p]) : slot.filter(player=>player !== p));
    if (w === active) nx[active] = nx[active].filter(x => x !== p);
    else { if (w >= 0) nx[w] = nx[w].filter(x => x !== p); nx[active].push(p); }
    return nx;
  });
  const teamSlot = t => slots.findIndex(s => t.players.length && t.players.every(p => s.includes(p)));
  const toggleTeam = t => setSlots(prev => {
    if (saving.current || (winnerKnown && t.players.some(p=>prev[0].includes(p)))) return prev;
    const was = prev.findIndex(s => t.players.length && t.players.every(p => s.includes(p)));
    const nx = prev.map(s => s.filter(p => !t.players.includes(p)));
    if (sequenced && active === 0) {nx[0] = was === 0 ? [] : [...t.players];return nx;}
    if (was !== active) nx[active] = [...nx[active], ...t.players];
    return nx;
  });
  return (
    <Sheet title={ev.name} subtitle="Official result" onClose={onClose} busy={pending}>
      {winnerKnown && <div className="fd-result-winner">
        <small>Winner</small><strong>{slots[0].map(player=>disp(state,player)).join(" & ")}</strong>
        <span>+{fmt(table[0])}{slots[0].length > 1 ? " each" : " chips"}</span>
      </div>}
      {winnerKnown && <p style={{ ...pStyle, fontSize:12.5, color:"var(--muted2)" }}>{existing
        ? "To change the winner, clear the result and correct the final."
        : "To change the winner, correct the final from the event sheet."}</p>}
      {twoTeams && <fieldset disabled={pending} style={{border:0,padding:0,margin:0,minWidth:0}}>
        <div style={{ ...label, marginBottom:8 }}>Winner</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:10 }}>
          {draw.teams.map((team, i) => {
            const won = team.players.length > 0 && team.players.every(p => slots[0].includes(p));
            return <button key={i} type="button" onClick={() => pickWinner(team)} aria-pressed={won}
              style={{ display:"flex", flexDirection:"column", alignItems:"flex-start", gap:8, minHeight:88,
                padding:"12px", borderRadius:14, cursor:"pointer", textAlign:"left",
                background:won ? GOLD_GRAD : "var(--paper)", border:won ? "1.5px solid var(--ink0)" : "1.5px solid var(--line)" }}>
              <AvatarStack state={state} players={team.players} size={26} max={5} />
              <span style={{ fontFamily:SANS, fontWeight:700, fontSize:14, color:won ? "var(--ink0)" : "var(--ink)",
                overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:"100%" }}>{teamLabel(state, team)}</span>
            </button>;
          })}
        </div>
        {slots[0].length > 0 && <p style={{ ...pStyle, fontSize:12.5, color:"var(--muted2)", margin:"0 0 12px" }}>
          +{fmt(paysEach(0))} each to the winners{table[1] > 0 ? `, +${fmt(paysEach(1))} each to the other team` : ""}
          {table[2] > 0 && draw.roles?.length ? `, +${fmt(table[2])} each to the crew` : ""}.</p>}
      </fieldset>}
      {!twoTeams && !!editableSlots.length && <fieldset disabled={pending} style={{border:0,padding:0,margin:0,minWidth:0}}>
      <div style={{ display:"flex", gap:8, marginBottom:14 }}>
        {editableSlots.map(i => (
          <button key={i} onClick={() => setActive(i)} style={{ flex:1, padding:"10px 6px", cursor:"pointer",
            borderRadius:14, border:"1px solid " + (active===i ? "var(--accent)" : "var(--line)"),
            background: active===i ? "var(--ink-tint)" : "var(--paper2)" }}>
            <div style={{ fontFamily:SANS, fontWeight:700, fontSize:14, color:SLOT_META[i].color }}>
              {ev.kind==="solo" ? SLOT_META[i].label : SLOT_META[i].team}</div>
            <div style={{ fontFamily:SANS, fontSize:12, color:"var(--muted)" }}>+{fmt(paysEach(i))} each, {slots[i].length} in</div>
          </button>
        ))}
      </div>
      {table[2] > 0 && !!draw?.roles?.length && <p style={{ ...pStyle, fontSize:12.5, color:"var(--muted)", margin:"-6px 0 12px" }}>
        Event crew +{fmt(table[2])} each: {draw.roles.map(role => disp(state, role.player)).join(", ")}</p>}
      {teamMode ? (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:10 }}>
          {draw.teams.filter(t=>!winnerKnown || !t.players.some(p=>slots[0].includes(p))).map((t, i) => {
            const w = teamSlot(t);
            return (
              <button key={i} onClick={() => toggleTeam(t)} style={{ display:"flex", alignItems:"center", gap:8,
                padding:"10px 11px", borderRadius:14, cursor:"pointer", textAlign:"left",
                background: w === active ? GOLD_GRAD : "var(--paper)",
                border: w === active ? "1.5px solid var(--ink0)" : "1.5px solid var(--line)",
                ...(draw.teams.length % 2 === 1 && i === draw.teams.length - 1
                  ? { gridColumn:"1 / -1" } : {}) }}>
                <AvatarStack state={state} players={t.players} size={22} max={3} />
                <span style={{ flex:1, fontFamily:SANS, fontWeight:600, fontSize:12.5, minWidth:0,
                  overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                  color: w === active ? "var(--ink0)" : "var(--ink)" }}>{teamLabel(state, t)}</span>
                {w >= 0 && w !== active && <span style={{ fontFamily:SANS, fontWeight:700, fontSize:12,
                  color:SLOT_META[w].color, flexShrink:0 }}>{SLOT_META[w].label}</span>}
              </button>
            );
          })}
        </div>
      ) : (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,minmax(0,1fr))", gap:8, marginBottom:10 }}>
          {ROSTER.filter(p=>!winnerKnown || !slots[0].includes(p)).map((p, i) => {
            const w = taken(p);
            return <PlayerChip key={p} name={w>=0 && w!==active ? `${p} (${SLOT_META[w].label})` : p}
              selected={w===active} onClick={() => toggle(p)} small
              style={centeredGridCell(i, ROSTER.length)} />;
          })}
        </div>
      )}
      {!!draw?.teams?.length && ev.kind !== "solo" && !(sequenced && active === 0) && (
        <button onClick={() => setByPlayer(v => !v)} style={{ background:"none", border:"none", cursor:"pointer",
          fontFamily:SANS, fontWeight:600, fontSize:12.5, color:"var(--accent2)", minHeight:44, padding:"6px 0", display:"block" }}>
          {byPlayer ? "Back to teams" : "Pick by player"}</button>
      )}
      </fieldset>}
      {error && <p role="alert" style={{color:"var(--clay-text)",fontSize:13}}>{error}</p>}
      {emptyCheck && emptyPaid.length > 0 && <div role="alert" style={{ marginBottom:10, padding:"12px 13px",
        background:"var(--paper2)", border:"1px solid var(--line)", borderRadius:14 }}>
        {emptyPaid.map(i => <p key={i} style={{ ...pStyle, margin:"0 0 6px" }}>
          {SLOT_META[i].label} place pays {fmt(paysEach(i))}. Nobody selected.</p>)}
        <div style={{ display:"flex", gap:8, marginTop:8 }}>
          <ActionButton variant="commit" disabled={pending} onClick={() => post(emptyCheck, true)}
            style={{ flex:1 }}>Leave empty</ActionButton>
          <ActionButton variant="tertiary" disabled={pending} onClick={() => { setActive(emptyPaid[0]); setEmptyCheck(null); }}
            style={{ flex:1 }}>Choose</ActionButton>
        </div>
      </div>}
      {!existing ? (
        <ActionButton disabled={slots[0].length===0 || pending} onClick={() => post()}
          style={{ width:"100%", fontSize:16, padding:"14px", marginTop:4 }}>
          Post official result</ActionButton>
      ) : !confirmCorrection ? (
        <ActionButton disabled={slots[0].length===0 || unchanged || pending} onClick={() => setConfirmCorrection(true)}
          style={{ width:"100%", fontSize:16, padding:"14px", marginTop:4 }}>
          {unchanged ? "Official result" : "Review result correction"}</ActionButton>
      ) : (
        <div style={{ marginTop:4, padding:"12px 13px", background:"var(--paper2)",
          border:"1px solid var(--line)", borderRadius:14 }}>
          <div style={{ ...label, marginBottom:6 }}>Reason for the correction</div>
          <input value={correctionReason} disabled={pending} onChange={event => setCorrectionReason(event.target.value)}
            maxLength={100} aria-label="Reason for the correction"
            style={{ width:"100%", background:"var(--paper)", border:"1px solid var(--line)",
              borderRadius:10, padding:"11px 12px", color:"var(--ink)", fontFamily:SANS,
              fontWeight:600, fontSize:14, marginBottom:9, outline:"none" }} />
          <div style={{ display:"flex", gap:8 }}>
            <ActionButton variant="commit" disabled={!correctionReason.trim() || pending}
              onClick={() => post({
                confirmOverwrite:true,
                correctionReason,
              })} style={{ flex:1 }}>Replace official result</ActionButton>
            <ActionButton variant="tertiary" disabled={pending} onClick={() => {
              setConfirmCorrection(false);
              setCorrectionReason("");
            }} style={{ flex:1 }}>Keep current</ActionButton>
          </div>
        </div>
      )}
    </Sheet>
  );
}

/* ─────────── how to play ─────────── */
/* Each game's intro scene lives in features/intro (IntroScenes.jsx SCENES):
   phone and TV read the one registry; a game without a scene drops its
   GameMark, which falls back to the FD chip. */
/* optional, on-demand rules for one game. Purely client-side, nested over the sheet below. */


/* ─────────── wagers ─────────── */


/* rack denominations live in features/wagers (RACK_DENOMS): 100 is the chip
   quantum (PT) and the bigger chips keep taps quick as stacks grow. */


/* New wagers are aggregated by the server. This compatibility merge keeps
   older snapshots with separate same-pick records equally readable. w.ids
   carries every underlying record id for commissioner void actions. */




/* ─────────── duels ───────────
   Quick Draw lives in features/duels: offers, the run, and the result. */

function ResetProgressSheet({ state, environment, busy, onClose, onBack, onConfirm }) {
  const [confirmed, setConfirmed] = useState(false);
  const completed = Object.keys(state.results || {}).length;
  const listStyle = { margin:"5px 0 0", paddingLeft:18, fontFamily:SANS, fontSize:13,
    lineHeight:1.55, color:"var(--muted)" };
  return (
    <Sheet title="Reset game progress" onClose={onClose} onBack={onBack}>
      <div style={{ margin:"0 16px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
          <Tag tone={environment === "production" ? "flame" : "gold"}>{environment}</Tag>
          <span style={{ fontFamily:SANS, fontWeight:700, fontSize:13, color:"var(--ink)" }}>
            {completed} result{completed === 1 ? "" : "s"} currently posted</span>
        </div>
        <div style={{ ...label, color:"var(--green)" }}>Kept</div>
        <ul style={listStyle}>
          <li>Profiles, photos, numbers, shirts, flights, and chip designs</li>
          <li>Device claims, private ratings, and trip details</li>
          <li>Event additions, edits, and order</li>
        </ul>
        <div style={{ ...label, color:"var(--clay-text)", marginTop:14 }}>Cleared</div>
        <ul style={listStyle}>
          <li>Results, wagers, rulings, draws, brackets, heats, pools, and drafts</li>
          <li>Duels, poker, shelved events, and weekend live or frozen state</li>
        </ul>
        <label style={{ display:"flex", alignItems:"flex-start", gap:10, margin:"16px 0 12px",
          padding:"11px 12px", borderRadius:10, background:"var(--paper2)", border:"1px solid var(--line)",
          cursor:busy ? "default" : "pointer" }}>
          <input type="checkbox" checked={confirmed} disabled={busy}
            onChange={event => setConfirmed(event.target.checked)}
            style={{ marginTop:2, accentColor:"var(--clay)" }} />
          <span style={{ fontFamily:SANS, fontWeight:600, fontSize:13, lineHeight:1.45, color:"var(--ink)" }}>
            Reset the {environment} game on every connected screen.</span>
        </label>
        {busy && (
          <div style={{ fontFamily:SANS, fontSize:12.5, color:"var(--clay-text)", marginBottom:10 }}>
            Stop the running rehearsal first.</div>
        )}
        <div style={{ display:"flex", gap:8 }}>
          <Btn kind="flame" disabled={!confirmed || busy} onClick={onConfirm}
            style={{ flex:1 }}>Reset progress</Btn>
          <Btn kind="ghost" onClick={onClose}>Keep it</Btn>
        </div>
      </div>
    </Sheet>
  );
}

/* ─────────── GM sheets ─────────── */
/* One pending write at a time, success only on the server's ack. After the
   finale counts post, rulings move in 25s; the number field takes any size. */
function AdjustSheet({ state, player, onClose, save, onRemove }) {
  const step = stacksPosted(state) ? CHIP_MIN : PT;
  const [delta, setDelta] = useState(step);
  const [reason, setReason] = useState("");
  const [removing, setRemoving] = useState(null);
  const [removeReason, setRemoveReason] = useState("");
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  const busy = useRef(false);
  const run = async callback => {
    if (busy.current) return;
    busy.current = true; setPending(true); setError("");
    try {
      const result = await callback();
      if (result?.ok !== true) setError(result?.error || "Not saved. Try again.");
      return result;
    } catch (failure) { setError(failure?.message || "Not saved. Try again."); }
    finally { busy.current = false; setPending(false); }
  };
  const rulings = (state.adjustments || []).filter(a => a.player === player && !a.removedAt);
  /* a ruling on a finale count names that count; a recount supersedes it */
  const countRes = Object.values(state.results || {}).find(res => res?.stacks) || null;
  const countLabel = a => a.pokerRevision === undefined ? ""
    : ` · Count ${a.pokerRevision}${postCountRulingApplies(a, countRes) ? "" : ", not applied"}`;
  const legal = Number.isInteger(delta) && delta !== 0 && delta % step === 0;
  const field = { background:"var(--paper2)", border:"1px solid var(--line)", borderRadius:14,
    padding:"12px 13px", color:"var(--ink)", fontFamily:SANS, fontSize:14, outline:"none" };
  return (
    <Sheet title={`Ruling for ${disp(state, player)}`} onClose={onClose} busy={pending}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:12, marginBottom:12 }}>
        <Btn kind="dark" disabled={pending} onClick={() => setDelta(d => (Number(d) || 0) - step)} style={{ fontSize:19, width:54 }}
          aria-label={`Minus ${step}`}><Icon name="minus" size={18} /></Btn>
        <input value={delta > 0 ? `+${delta}` : String(delta)} inputMode="numeric" disabled={pending}
          aria-label="Ruling chips" onChange={e => {
            const v = e.target.value.replace(/[^\d-]/g, "");
            setDelta(v === "" || v === "-" ? 0 : Math.trunc(Number(v)) || 0);
          }}
          style={{ ...field, width:130, textAlign:"center", fontFamily:DISPLAY, fontWeight:800, fontSize:34, padding:"6px 8px",
            color: delta >= 0 ? "var(--green)" : "var(--clay-text)" }} />
        <Btn kind="dark" disabled={pending} onClick={() => setDelta(d => (Number(d) || 0) + step)} style={{ fontSize:19, width:54 }}
          aria-label={`Plus ${step}`}><Icon name="plus" size={18} /></Btn>
      </div>
      {!legal && delta !== 0 && <p style={{ ...pStyle, color:"var(--clay-text)", textAlign:"center" }}>Rulings move in {step}s.</p>}
      <input value={reason} disabled={pending} onChange={e => setReason(e.target.value)} maxLength={80} aria-label="Ruling reason"
        placeholder="Reason" style={{ ...field, width:"100%", marginBottom:14 }} />
      {error && <p role="alert" style={{ color:"var(--clay-text)", fontSize:13 }}>{error}</p>}
      <Btn disabled={!legal || pending} onClick={() => run(() => save(delta, reason.trim()))}
        style={{ width:"100%", fontSize:16, padding:"14px" }}>{pending ? "Saving…" : "Apply"}</Btn>
      {rulings.length > 0 && <div style={{ marginTop:18 }}>
        <div style={{ ...label, marginBottom:6 }}>Rulings</div>
        {rulings.map(a => (
          <div key={a.id} style={{ borderTop:"1px solid var(--line)", padding:"8px 0" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, minHeight:44 }}>
              <strong style={{ fontFamily:DISPLAY, fontSize:19, minWidth:64,
                color:a.delta >= 0 ? "var(--green)" : "var(--clay-text)" }}>{a.delta > 0 ? "+" : ""}{fmt(a.delta)}</strong>
              <span style={{ flex:1, minWidth:0, fontFamily:SANS, fontSize:13, color:"var(--muted)" }}>{a.reason || "No reason"}{countLabel(a)}</span>
              {a.reason !== "Minimum stack" && removing !== a.id && <Btn kind="ghost" disabled={pending}
                onClick={() => { setRemoving(a.id); setRemoveReason(""); }}>Remove</Btn>}
            </div>
            {removing === a.id && <div style={{ display:"flex", gap:8, marginTop:6 }}>
              <input value={removeReason} disabled={pending} onChange={e => setRemoveReason(e.target.value)} maxLength={100}
                aria-label="Why is this ruling removed" placeholder="Reason" style={{ ...field, flex:1, minWidth:0 }} />
              <Btn kind="danger" disabled={!removeReason.trim() || pending}
                onClick={() => run(async () => { const result = await onRemove(a.id, removeReason.trim());
                  if (result?.ok) setRemoving(null); return result; })}>Remove</Btn>
              <Btn kind="ghost" disabled={pending} onClick={() => setRemoving(null)}>Keep</Btn>
            </div>}
          </div>
        ))}
      </div>}
    </Sheet>
  );
}
function PinSheet({ onClose, onBack, unlock }) {
  const [pin, setPin] = useState("");
  return (
    <Sheet title="Commissioner" onClose={onClose} onBack={onBack}>
      <input value={pin} onChange={e => setPin(e.target.value.replace(/\D/g,"").slice(0,4))}
        aria-label="Commissioner passcode"
        inputMode="numeric" placeholder="Passcode" autoFocus
        onKeyDown={e => e.key === "Enter" && unlock(pin)}
        style={{ width:"100%", background:"var(--paper2)", border:"1px solid var(--line)", borderRadius:14,
          padding:"13px 12px", color:"var(--ink)", fontFamily:DISPLAY, fontSize:24,
          letterSpacing:"0.4em", textAlign:"center", marginBottom:12, outline:"none" }} />
      <ActionButton disabled={pin.length !== 4} onClick={() => unlock(pin)}
        style={{ width:"100%", fontSize:16, padding:"14px" }}>Unlock</ActionButton>
    </Sheet>
  );
}
/* Each unlocked phone holds its own commissioner token; any of them can be
   signed out from here. Revoking this device ends its commissioner mode. */
function GmDevicesSheet({ state, onClose, onBack, notify, onSignedOut }) {
  const [devices, setDevices] = useState(null);
  const [pending, setPending] = useState("");
  useEffect(() => {
    let live = true;
    dispatch("gmDevices", {}).then(result => {
      if (!live) return;
      if (result.ok) setDevices(result.extra?.devices || []);
      else { setDevices([]); notify(result.error || "Rejected"); }
    });
    return () => { live = false; };
  }, []); // eslint-disable-line
  const revoke = async device => {
    if (pending) return;
    setPending(device.id);
    const result = await dispatch("gmRevoke", { id:device.id });
    setPending("");
    if (!result.ok) return notify(result.error || "Rejected");
    if (device.current) return onSignedOut();
    setDevices(result.extra?.devices || []);
  };
  return (
    <Sheet title="Commissioner devices" onClose={onClose} onBack={onBack} busy={!!pending}>
      {devices === null ? <p style={pStyle}>Loading…</p> : !devices.length ? <p style={pStyle}>No devices signed in.</p>
        : devices.map(device => (
          <div key={device.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 0",
            borderTop:"1px solid var(--line)" }}>
            {device.player ? <Avatar state={state} p={device.player} size={30} /> : <FDMark size={30} variant="night" />}
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontFamily:SANS, fontWeight:700, fontSize:13.5, color:"var(--ink)" }}>
                {device.legacy ? "Older shared unlock" : device.player ? disp(state, device.player) : "Unknown phone"}
                {device.current ? " · this device" : ""}</div>
              {!device.legacy && device.createdAt > 0 && <div style={{ fontFamily:SANS, fontSize:12, color:"var(--muted2)" }}>
                Unlocked {new Date(device.createdAt).toLocaleString("en-US", { weekday:"short", hour:"numeric", minute:"2-digit" })}</div>}
            </div>
            <ActionButton compact variant="destructive" disabled={!!pending} onClick={() => revoke(device)}>
              {pending === device.id ? "Revoking…" : "Revoke"}</ActionButton>
          </div>
        ))}
    </Sheet>
  );
}

/* The director's announce-and-draw beat. The crew is prefilled with whoever
   has sat out least; Change reopens the choice. Confirm draws and announces
   in one write so every screen plays the intro before the teams. */
function AnnounceDrawSheet({ state, ev, players, roles, onClose, onConfirm, onPlayer, changing:startChanging = false }) {
  const present = presentPlayers(state);
  const [crew, setCrew] = useState(() => (roles || []).map(item => ({ ...item })));
  const [changing, setChanging] = useState(!!startChanging);
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  const busy = useRef(false);
  const crewIds = crew.map(item => item.player);
  const playing = present.filter(player => !crewIds.includes(player));
  const heats = !ev.teamCfg;
  const fit = heats
    ? (playing.length >= (ev.stageCfg?.nGroups || 2) * 2 ? { ok:true } : { ok:false, error:"Heats need at least 2 players each" })
    : validateEventParticipants(ev, playing, present);
  const shape = !heats && fit.ok && fit.fit ? shapeLabel(fit.fit) : null;
  const toggle = player => setCrew(current => current.some(item => item.player === player)
    ? current.filter(item => item.player !== player)
    : [...current, { player, role:OVERFLOW_ROLES[current.length % OVERFLOW_ROLES.length] }]);
  const confirm = async () => {
    if (busy.current || !fit.ok) return;
    busy.current = true; setPending(true); setError("");
    try {
      const result = await onConfirm(playing, crew);
      if (!result?.ok) setError(result?.error || "Not saved. Try again.");
    } catch (failure) { setError(failure?.message || "Not saved. Try again."); }
    finally { busy.current = false; setPending(false); }
  };
  return (
    <Sheet title={`Announce ${ev.name}`} subtitle={shape || undefined} onClose={onClose} busy={pending}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
        <span style={{ flex:1, minWidth:0, fontFamily:SANS, fontWeight:600, fontSize:14, color:"var(--ink)" }}>
          {crew.length ? <>Crew: {crew.map((item, index) => <React.Fragment key={item.player}>{index ? ", " : ""}
            <button type="button" className="fd-player-link" onClick={() => onPlayer?.(item.player)}>{disp(state, item.player)}</button>
            {` (${overflowRoleMeta(item.role).label})`}</React.Fragment>)}</> : "Everyone plays"}
        </span>
        <ActionButton compact variant="secondary" disabled={pending} onClick={() => setChanging(value => !value)}>
          {changing ? "Done" : "Change"}</ActionButton>
      </div>
      {changing && (
        <>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,minmax(0,1fr))", gap:5, marginBottom:10 }}>
            {present.map((player, index) => <PlayerChip key={player} name={disp(state, player)} small
              selected={!crewIds.includes(player)} disabled={pending} onClick={() => toggle(player)}
              style={centeredGridCell(index, present.length, 3, 5)} />)}
          </div>
          {crew.map(item => (
            <div key={item.player} style={{ display:"flex", alignItems:"center", gap:9, marginBottom:8 }}>
              <Avatar state={state} p={item.player} size={28} />
              <span style={{ flex:1, minWidth:0, fontFamily:SANS, fontWeight:700, fontSize:12.5, color:"var(--ink)" }}>
                {disp(state, item.player)}</span>
              <select aria-label={`${disp(state, item.player)} event crew role`} value={item.role} disabled={pending}
                onChange={event => setCrew(current => current.map(entry => entry.player === item.player
                  ? { ...entry, role:event.target.value } : entry))}
                style={{ width:150, maxWidth:"48%", minHeight:44, padding:"8px", borderRadius:9, background:"var(--paper)",
                  color:"var(--ink)", border:"1px solid var(--line)", fontFamily:SANS, fontWeight:700, fontSize:12 }}>
                {OVERFLOW_ROLES.map(value => <option key={value} value={value}>{overflowRoleMeta(value).label}</option>)}
              </select>
            </div>
          ))}
        </>
      )}
      {!fit.ok && <p role="alert" style={{ ...pStyle, color:"var(--clay-text)", fontSize:13 }}>{fit.error}</p>}
      {error && <p role="alert" style={{ ...pStyle, color:"var(--clay-text)", fontSize:13 }}>{error}</p>}
      <ActionButton disabled={!fit.ok || pending} onClick={confirm} style={{ width:"100%", fontSize:16, padding:"14px" }}>
        {pending ? "Drawing…" : "Announce and draw"}</ActionButton>
    </Sheet>
  );
}

function ProfileSheet({ state, me, onClose, onBack, initialSection = "card", save, onChip, spotifyCatalogEnabled,
  songSnippets = false }) {
  const [section, setSection] = useState(initialSection);
  const [display, setDisplay] = useState(state.profiles?.[me]?.display || me || "");
  const [photo, setPhoto] = useState(null);
  const [num, setNum] = useState(state.profiles?.[me]?.num != null ? String(state.profiles[me].num) : "");
  const [flightIn, setFlightIn] = useState(state.profiles?.[me]?.flightIn || null);
  const [flightOut, setFlightOut] = useState(state.profiles?.[me]?.flightOut || null);
  const [flightsBooked, setFlightsBooked] = useState(
    typeof state.profiles?.[me]?.flightsBooked === "boolean" ? state.profiles[me].flightsBooked
      : (state.profiles?.[me]?.flightIn || state.profiles?.[me]?.flightOut ? true : null));
  const [size, setSize] = useState(state.profiles?.[me]?.size ?? null);
  const [walkoutTrack, setWalkoutTrack] = useState(
    state.profiles?.[me]?.walkoutTrack || null);
  const [backName, setBackName] = useState(state.profiles?.[me]?.backName || "");
  const [venmo, setVenmo] = useState(state.profiles?.[me]?.venmo || "");
  const [drinking, setDrinking] = useState(typeof state.profiles?.[me]?.drinking === "boolean"
    ? state.profiles[me].drinking : null);
  const [needs, setNeeds] = useState(state.profiles?.[me]?.needs || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(null);
  /* A chip claim and a profile/photo save share one guard. Keep the draft
     fixed and the sheet open until every write in the operation settles. */
  const submit = operation => {
    if (pending.current) return pending.current;
    setBusy(true); setError("");
    pending.current = Promise.resolve().then(operation)
      .catch(() => ({ ok:false, error:"Couldn't save your profile. Try again." }))
      .then(result => {
        if (result?.ok !== true) setError(result?.error || "Couldn't save your profile. Try again.");
        return result;
      })
      .finally(() => { pending.current = null; setBusy(false); });
    return pending.current;
  };
  /* A save carries only what this sheet changed, so a commissioner edit made
     while it was open (a size, a flight) is never overwritten by the stale
     copy the sheet opened with. The server requires a name on every save. */
  const opened = useRef(null);
  if (!opened.current) opened.current = { display, num, size, flightsBooked, flightIn, flightOut, walkoutTrack,
    backName, venmo, drinking, needs };
  const changedFields = () => {
    const base = opened.current, same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
    const fields = { display:display.trim() === (base.display || "").trim()
      ? state.profiles?.[me]?.display || display.trim() : display.trim() };
    if (num !== base.num) fields.num = num === "" ? null : Number(num);
    if (!same(size, base.size)) fields.size = size;
    if (flightsBooked !== base.flightsBooked) fields.flightsBooked = flightsBooked;
    if (!same(flightIn, base.flightIn)) fields.flightIn = flightIn;
    if (!same(flightOut, base.flightOut)) fields.flightOut = flightOut;
    if (!same(walkoutTrack, base.walkoutTrack)) fields.walkoutTrack = walkoutTrack;
    for (const [key, value] of [["backName", backName], ["venmo", venmo], ["needs", needs]])
      if (value.trim() !== base[key].trim()) fields[key] = value.trim() || null;
    if (drinking !== base.drinking) fields.drinking = drinking;
    return { ...fields, ...(photo ? { photo } : {}) };
  };
  const saved = state.profiles?.[me] || {};
  const jerseysLocked = !!state.jerseysLocked;
  const draftNum = num === "" ? undefined : Number(num);
  const draftBack = cleanBackName(backName);
  const jerseyOk = jerseyConfirmed({ ...saved, display, num:draftNum, size:size ?? undefined,
    backName:draftBack || undefined }, me);
  const badDraft = draftBack === undefined || (venmo.trim() !== "" && cleanVenmo(venmo) === undefined);
  const confirming = section === "jersey" && !jerseysLocked && !jerseyOk;
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const close = () => {
    if (pending.current) return;
    if (photo && !confirmDiscard) { setConfirmDiscard(true); return; }
    onClose();
  };
  const walkoutSaved = state.profiles?.[me]?.walkoutTrack;
  const walkoutTab = spotifyCatalogEnabled || !!walkoutSaved;
  const sections = [["card","Card"],["jersey","Jersey"],["travel","Trip"],...(walkoutTab ? [["walkout","Win song"]] : [])];
  if (!me) return null;
  return (
    <Sheet title="Your profile" onClose={close} onBack={onBack} busy={busy}>
      <fieldset disabled={busy} aria-busy={busy}
        style={{ border:0, padding:0, margin:0, minWidth:0 }}>
      <div className="fd-profile-sections" role="group" aria-label="Profile sections">
        {sections.map(([id,name]) =>
          <button key={id} type="button" aria-pressed={section === id} onClick={() => setSection(id)}>{name}</button>)}
      </div>
      <div hidden={section !== "card"}>
      <ProfileEditor state={state} me={me} display={display} setDisplay={setDisplay} photo={photo} setPhoto={setPhoto}
        num={num} setNum={setNum} size={size} setSize={setSize}
        onChip={onChip ? (color, skin) => submit(() => onChip(color, skin)) : undefined} showSize={false}
        numLocked={jerseysLocked} />
      <VibrationToggle />
      <SoundToggle />
      <AlertsToggle />
      </div>
      <div hidden={section !== "jersey"}>
        <JerseySection state={state} me={me} display={display} backName={backName} setBackName={setBackName}
          num={num} setNum={setNum} size={size} setSize={setSize} locked={jerseysLocked} confirmed={jerseyOk} />
      </div>
      <div hidden={section !== "travel"}>
        <TravelFields booked={flightsBooked} setBooked={setFlightsBooked}
          flightIn={flightIn} setFlightIn={setFlightIn} flightOut={flightOut} setFlightOut={setFlightOut} />
        <TripDetails venmo={venmo} setVenmo={setVenmo} drinking={drinking} setDrinking={setDrinking}
          needs={needs} setNeeds={setNeeds} />
      </div>
      {walkoutTab && <div hidden={section !== "walkout"}>
        {spotifyCatalogEnabled ? <WinSongPicker value={walkoutTrack} onChange={setWalkoutTrack} snippets={songSnippets} />
          : <SpotifyTrackCard track={walkoutSaved} />}
      </div>}
      </fieldset>
      <div className="fd-profile-save">
      {confirmDiscard && <div className="fd-profile-discard" role="alert">
        <p>Your new photo is not saved.</p>
        <div><ActionButton compact variant="destructive" onClick={onClose}>Discard photo</ActionButton>
          <ActionButton compact variant="secondary" onClick={() => setConfirmDiscard(false)}>Keep editing</ActionButton></div>
      </div>}
      {error && <div role="alert" style={{ fontFamily:SANS, fontSize:13, color:"var(--clay-text)", marginTop:14 }}>{error}</div>}
      <ActionButton disabled={busy || !display.trim() || badDraft} pending={busy}
        onClick={() => submit(() => save(confirming ? { ...changedFields(), confirmJersey:true } : changedFields()))}
        style={{ width:"100%", fontSize:16, padding:"14px" }}>{confirming ? "Confirm jersey" : "Save"}</ActionButton>
      </div>
    </Sheet>
  );
}

const audioClock = milliseconds => {
  const total = Math.max(0, Math.floor((Number(milliseconds) || 0) / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

function SpotifyTrackCard({ track, action, actionLabel = "Choose", compact = false }) {
  if (!track) return null;
  return (
    <div style={{ display:"flex", gap:10, alignItems:"center", padding:compact ? 9 : 11,
      border:"1px solid var(--line)", borderRadius:11, background:"var(--paper2)" }}>
      {track.imageUrl
        ? <img src={track.imageUrl} alt="" width={compact ? 42 : 52} height={compact ? 42 : 52}
            style={{ width:compact ? 42 : 52, height:compact ? 42 : 52, objectFit:"cover",
              borderRadius:8, flexShrink:0 }} />
        : <div aria-hidden="true" style={{ width:compact ? 42 : 52, height:compact ? 42 : 52,
            borderRadius:8, flexShrink:0, background:"var(--ink-tint)", display:"grid",
            placeItems:"center", fontFamily:DISPLAY, fontWeight:700, color:"var(--muted)" }}>FD</div>}
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontFamily:SANS, fontWeight:700, fontSize:compact ? 12.5 : 14,
          color:"var(--ink)", whiteSpace:"nowrap", overflow:"hidden",
          textOverflow:"ellipsis" }}>{track.name}</div>
        <div style={{ fontFamily:SANS, fontSize:12, color:"var(--muted)",
          whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
          {(track.artists || []).join(", ")} · {audioClock(track.durationMs)}</div>
        <a href={track.url} target="_blank" rel="noreferrer"
          style={{ fontFamily:SANS, fontWeight:700, fontSize:12, color:"var(--accent2)",
            textDecoration:"none" }}>Open in Spotify</a>
      </div>
      {action && <Btn kind="ghost" onClick={action}
        style={{ minHeight:44, padding:"8px 10px", fontSize:12, flexShrink:0 }}>{actionLabel}</Btn>}
    </div>
  );
}

/* ─────────── reveal (draws, heats, pools) ─────────── */
/* the draw on a phone, on the room's clock; the TV draws its own inside the canvas */
function Reveal({ state, reveal, me, onClose, onBets, onPlayer }) {
  return <DrawAnnouncement state={state} reveal={reveal} me={me} synced onClose={onClose} onBets={onBets} onPlayer={onPlayer}/>;
}

/* ─────────── rules ─────────── */
export { EventSheet, BracketSheet, EventIntro, Reveal, ResultSheet, PokerResultSheet, ChipCounter };
export { ProfileSheet };
