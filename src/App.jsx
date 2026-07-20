import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  ROSTER, AWARDS, SPORTS, RATINGS, SESSIONS, SLOT_META, DRAW_METHODS, OUTRIGHT_MULT,
  allEventsOf, disp, teamLabel, stageFinalists, stageEntrantView,
  resolveWager, computeStandings, atRisk, ROUND_NAMES, resolveSlot, bracketChampion,
} from "../shared/core.js";
import {
  useTournament, dispatch, uploadPhoto, localGet, localSet, setGmToken, hasGmToken,
} from "./lib/client.js";


/* PWA install: stash the browser's install prompt when offered. iOS never fires it. */
let installEvt = null;
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvt = e; });
}
const isStandalone = () => typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true);
const isIOS = () => typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent);
const isMobile = () => typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/.test(navigator.userAgent);

/* ─────────── visual system: FIELD DAY ───────────
   Sun-faded rec-tournament look. Barlow Condensed carries scores, ranks, and
   event names; Archivo carries everything functional. Light bone paper by
   default; warm night surfaces are reserved for reveals, finals, and TV. */
const DISPLAY = "'Barlow Condensed','Arial Narrow',sans-serif";
const SANS = "'Archivo',system-ui,sans-serif";
const BONE = "#FBF3E4";
const GOLD_GRAD = "var(--sun)";
const EMBER_GRAD = "var(--accent)";
const CARD_BG = "var(--paper)";
const GRAIN = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E\")";

/* 13 curated flat player colors, assigned by roster order; readable on paper and night */
const PLAYER_COLORS = ["#C05B33","#4F93A3","#77804C","#B23B2E","#D89C2F","#7A5C43","#557B72",
  "#A9663F","#5E7291","#8A4F62","#4E6E39","#B37A4A","#6F6546"];
const playerColor = p => PLAYER_COLORS[Math.max(0, ROSTER.indexOf(p)) % PLAYER_COLORS.length];
const playerNo = p => { const i = ROSTER.indexOf(p); return i < 0 ? null : i + 1; };

/* the Field Day mark: a sun over lanes; works as favicon, patch, or stamp */
function FDMark({ size=28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" style={{ flexShrink:0, display:"block" }}>
      <rect x="1.2" y="1.2" width="29.6" height="29.6" rx="7" fill="var(--sun)" stroke="var(--ink)" strokeWidth="1.8"/>
      <circle cx="16" cy="12.5" r="6.2" fill="var(--accent)" stroke="var(--ink)" strokeWidth="1.8"/>
      <path d="M5 22h22M5 26h22" stroke="var(--ink)" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  );
}
const IconTV = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="7" width="18" height="12" rx="2"/><path d="m8.5 2.5 3.5 3.5 3.5-3.5"/>
  </svg>
);
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
const IconGM = ({ filled }) => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor"
    strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3.2 14.6 8.5l5.9.8-4.3 4.1 1 5.9L12 16.5l-5.2 2.8 1-5.9L3.5 9.3l5.9-.8z"/>
  </svg>
);

function Avatar({ state, p, size=34, ring, style }) {
  const prof = state.profiles?.[p];
  const src = prof?.photoV ? `/api/photo/${encodeURIComponent(p)}?v=${prof.photoV}` : null;
  const initials = (prof?.display || p).slice(0,2).toUpperCase();
  const c = playerColor(p);
  return (
    <div style={{ width:size, height:size, borderRadius:"50%", flexShrink:0, overflow:"hidden",
      display:"flex", alignItems:"center", justifyContent:"center",
      background: src ? "var(--paper2)" : c,
      border: ring ? "2px solid var(--ink)" : "1.5px solid rgba(42,33,25,0.5)", ...style }}>
      {src
        ? <img src={src} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
        : <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:size*0.42, letterSpacing:"0.02em",
            color: c === "#D89C2F" ? "var(--ink)" : BONE }}>{initials}</span>}
    </div>
  );
}
function AvatarStack({ state, players, size=24, max=4 }) {
  const show = players.slice(0, max);
  const extra = players.length - show.length;
  return (
    <div style={{ display:"flex", alignItems:"center" }}>
      {show.map((p,pi) => <Avatar key={p} state={state} p={p} size={size} style={{ marginLeft: pi>0 ? -size*0.32 : 0 }} />)}
      {extra > 0 && <div style={{ width:size, height:size, borderRadius:"50%", marginLeft:-size*0.32,
        background:"var(--panel2)", border:"1.5px solid rgba(42,33,25,0.15)", display:"flex",
        alignItems:"center", justifyContent:"center", fontFamily:SANS, fontWeight:700,
        fontSize:size*0.4, color:"var(--dust)", flexShrink:0 }}>+{extra}</div>}
    </div>
  );
}
function Confetti({ burst }) {
  if (!burst) return null;
  const colors = ["var(--accent2)","var(--accent)","#E1572A","#F4E9D4","#7CB98A"];
  const pieces = Array.from({length:90}, (_,i) => ({
    left: Math.random()*100, delay: Math.random()*0.5, dur: 2.4 + Math.random()*1.6,
    color: colors[i % colors.length], size: 5 + Math.random()*8, rot: Math.random()*360,
    drift: (Math.random()-0.5)*180,
  }));
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
const label = { fontFamily:SANS, fontWeight:700, fontSize:11.5, letterSpacing:"0.07em", color:"var(--muted)", textTransform:"uppercase" };
function Tag({ children, tone="dim", style }) {
  const tones = {
    dim:   { color:"var(--dust)", background:"rgba(42,33,25,0.05)" },
    gold:  { color:"var(--accent2)", background:"rgba(192,91,51,0.12)" },
    flame: { color:"var(--live2)", background:"rgba(188,75,60,0.14)" },
    green: { color:"var(--green)", background:"rgba(95,122,69,0.12)" },
  };
  return <span style={{ fontFamily:SANS, fontWeight:700, fontSize:11, letterSpacing:"0.05em",
    padding:"3px 8px", borderRadius:4, textTransform:"uppercase", ...tones[tone], ...style }}>{children}</span>;
}
function Btn({ children, onClick, kind="primary", disabled, style }) {
  const kinds = {
    primary: { background:"var(--sun)", color:"var(--ink)", border:"1.5px solid var(--ink)" },
    flame:   { background:"var(--clay)", color:BONE, border:"1.5px solid var(--ink)" },
    ghost:   { background:"transparent", color:"var(--ink)", border:"1.5px solid rgba(42,33,25,0.35)" },
    dark:    { background:"var(--paper)", color:"var(--ink)", border:"1.5px solid var(--ink)" },
    danger:  { background:"transparent", color:"var(--clay)", border:"1.5px solid rgba(188,75,60,0.55)" },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{ fontFamily:SANS, fontWeight:700,
      letterSpacing:"0.04em", fontSize:13.5, textTransform:"uppercase", padding:"12px 16px", borderRadius:9,
      cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.35 : 1,
      transition:"transform .1s", ...kinds[kind], ...style }}>{children}</button>
  );
}
function Sheet({ title, onClose, children, wide }) {
  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, zIndex:100, background:"rgba(42,33,25,0.45)",
      backdropFilter:"blur(4px)", display:"flex", alignItems:"flex-end", justifyContent:"center" }}>
      <div onClick={e=>e.stopPropagation()} className="si-sheet" style={{ width:"100%", maxWidth: wide ? 780 : 540,
        overflowY:"auto", background:"var(--paper)", borderRadius:"14px 14px 0 0",
        border:"1.5px solid var(--ink)", borderBottom:"none",
        padding:"18px 18px calc(30px + env(safe-area-inset-bottom))", animation:"si-up .24s ease-out" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14,
          borderBottom:"1.5px solid var(--ink)", paddingBottom:10 }}>
          <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:24, letterSpacing:"0.02em",
            textTransform:"uppercase", color:"var(--ink)" }}>{title}</div>
          <button onClick={onClose} aria-label="Close" style={{ background:"var(--paper2)", border:"1.5px solid rgba(42,33,25,0.4)",
            color:"var(--ink)", width:32, height:32, borderRadius:8, fontSize:14, cursor:"pointer" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
function PlayerChip({ name, selected, disabled, onClick, small }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ fontFamily:SANS, fontWeight:600,
      fontSize: small ? 13 : 14, padding: small ? "8px 8px" : "10px 10px", borderRadius:11,
      cursor: disabled ? "default" : "pointer",
      background: selected ? GOLD_GRAD : "var(--panel2)",
      color: selected ? "var(--ink)" : disabled ? "#AE9C80" : "var(--cream)",
      border: selected ? "1px solid transparent" : "1px solid var(--line)",
      opacity: disabled && !selected ? 0.4 : 1, transition:"all .12s" }}>{name}</button>
  );
}
const pStyle = { fontFamily:SANS, fontSize:14, lineHeight:1.6, color:"var(--muted2)", marginBottom:14 };
function Wordmark({ size=28 }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:size*0.4 }}>
      <FDMark size={size*1.6} />
      <div>
        <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:size*1.25, lineHeight:0.92,
          letterSpacing:"0.015em", textTransform:"uppercase", color:"var(--ink)" }}>Field Day</div>
        <div style={{ fontFamily:SANS, fontWeight:700, fontSize:Math.max(9.5, size*0.34),
          letterSpacing:"0.12em", color:"var(--accent2)", marginTop:3 }}>SCOTTSDALE · 2026</div>
      </div>
    </div>
  );
}
/* two big teams side by side, broadcast style: each side gets a color band and a VS disc sits between */
const SIDE_COLORS = ["var(--pool)", "var(--accent)"];
function VersusDraw({ state, teams, size="md" }) {
  const av = size === "lg" ? 34 : 26;
  const f = size === "lg" ? 19 : 14;
  const tf = size === "lg" ? 26 : 17;
  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr auto 1fr", gap: size==="lg" ? 18 : 10, alignItems:"stretch" }}>
      {[teams[0], null, teams[1]].map((t, i) => i === 1 ? (
        <div key="vs" style={{ alignSelf:"center", width: size==="lg" ? 54 : 36, height: size==="lg" ? 54 : 36,
          borderRadius:"50%", background:"var(--ink)", color:BONE, display:"flex", alignItems:"center",
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
            {t.players.map(p => (
              <div key={p} style={{ display:"flex", alignItems:"center", gap:8, padding:"3px 0",
                flexDirection: i === 0 ? "row" : "row-reverse" }}>
                <Avatar state={state} p={p} size={av} />
                <span style={{ fontFamily:SANS, fontWeight:600, fontSize:f, color:"var(--ink)" }}>{disp(state, p)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ═════════════════════════════ APP ═════════════════════════════ */
export default function App() {
  const { state, connected, ready, version, lastAction } = useTournament();
  const [me, setMe] = useState(() => localGet("si-me"));
  const [onboardStep, setOnboardStep] = useState(() => localGet("si-onboard-v5") === "yes" ? 99
    : isStandalone() || !isMobile() ? 0 : -1);
  const [tab, setTab] = useState("board");
  const [gm, setGm] = useState(() => localGet("si-gm") === "yes" && hasGmToken());
  const [qa, setQa] = useState(() => localGet("si-qa") === "yes");
  const [tv, setTv] = useState(false);
  const [modal, setModal] = useState(null);
  const [burst, setBurst] = useState(0);
  const [toast, setToast] = useState(null);
  const [seenReveals, setSeenReveals] = useState(() => {
    try { return JSON.parse(localGet("si-seen-v5") || "[]"); } catch { return []; }
  });
  const [reveal, setReveal] = useState(null);
  const prevRanks = useRef({});
  const [deltas, setDeltas] = useState({});
  const undoRef = useRef(null);
  const toastTimer = useRef(null);
  const prevVersion = useRef(0);
  const loaded = ready;
  const saveMine = (k, v) => localSet(k, v);

  const events = useMemo(() => allEventsOf(state), [state]);
  const standings = useMemo(() => computeStandings(state), [state]);
  const allTied = standings.length > 0 && standings[0].pts === standings[standings.length-1].pts && !state.frozen;
  const onDeckEv = state.onDeck && !state.frozen ? events.find(e => e.id === state.onDeck && !state.results[e.id]) : null;
  const champion = state.frozen ? standings[0] : null;
  const coChamps = state.frozen ? standings.filter(r => r.rank === 1) : [];

  const notify = useCallback((msg, action, tone) => {
    setToast({ msg, action, tone });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), action ? 6000 : tone === "gold" ? 4000 : 2600);
  }, []);

  /* re-claim identity on every (re)connect so the server knows who this device is */
  useEffect(() => { if (connected && me) dispatch("claim", { player: me }); }, [connected, me]);

  /* your own wagers settling deserve a moment: watch pending picks flip to won or lost */
  const prevWagerRes = useRef(null);
  const settleToastV = useRef(0);
  useEffect(() => {
    if (!ready) return;
    const map = {};
    let delta = 0, any = false;
    (state.wagers || []).forEach(w => {
      if (w.player !== me) return;
      const r = resolveWager(state, w, events);
      map[w.id] = r.status;
      if (prevWagerRes.current && prevWagerRes.current[w.id] === "pending" &&
          (r.status === "won" || r.status === "lost")) { any = true; delta += r.delta; }
    });
    if (any && onboardStep >= 99) {
      notify(delta > 0 ? `Cashed +${delta}` : delta < 0 ? `Wager lost ${delta}` : "Wagers settled even",
        null, delta > 0 ? "gold" : undefined);
      settleToastV.current = version;
    }
    prevWagerRes.current = map;
  }, [state, events, me, ready, onboardStep, notify, version]);

  /* GM can rerun onboarding for everyone; each device compares the epoch it finished */
  useEffect(() => {
    if (!ready || onboardStep < 99) return;
    if ((state.onboardEpoch || 0) > Number(localGet("si-onboard-epoch") || 0)) setOnboardStep(0);
  }, [ready, state.onboardEpoch, onboardStep]);

  /* celebrate on broadcasts so every phone pops, not just the GM's;
     tell people plainly when their own points moved and why */
  useEffect(() => {
    if (version > prevVersion.current && prevVersion.current > 0) {
      if (lastAction === "saveResult" || (lastAction === "setFrozen" && state.frozen)) setBurst(b => b + 1);
      if (me && settleToastV.current !== version) {
        if (lastAction === "saveResult") {
          let latest = null;
          Object.entries(state.results || {}).forEach(([eid, res]) => {
            if (!latest || res.ts > latest.res.ts) latest = { eid, res };
          });
          const ev = latest && events.find(e => e.id === latest.eid);
          const idx = latest ? latest.res.slots.findIndex(s => (s || []).includes(me)) : -1;
          const award = ev && idx >= 0 ? AWARDS[ev.value][idx] : 0;
          if (award > 0) notify(`You took ${["1st","2nd","3rd"][idx]} · +${award}`, null, "gold");
        }
        if (lastAction === "adjust") {
          const a = state.adjustments?.[0];
          if (a?.player === me) notify(`Ruling: ${a.delta > 0 ? "+" : ""}${a.delta}${a.reason ? " · " + a.reason : ""}`,
            null, a.delta > 0 ? "gold" : undefined);
        }
      }
    }
    prevVersion.current = version;
  }, [version, lastAction, state, me, events, notify]);

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

  /* reveal detection: team draws and stage draws reveal on every phone */
  useEffect(() => {
    if (seenReveals === null || onboardStep < 99 || reveal || !ready) return;
    for (const [eid, draw] of Object.entries(state.draws || {})) {
      if (draw && !seenReveals.includes(draw.id)) {
        const ev = events.find(e => e.id === eid);
        if (!ev) continue;
        const groups = draw.teams.length === 2
          ? null
          : draw.teams.map(t => ({ title: teamLabel(state, t), lines: t.players.map(p => ({ avatars:[p], text: disp(state, p) })) }));
        setReveal({ id:draw.id, evId:ev.id, title:"The draw", subtitle:ev.name, groups, versus: draw.teams.length === 2 ? draw.teams : null });
        return;
      }
    }
    for (const [eid, st] of Object.entries(state.stages || {})) {
      if (st && !seenReveals.includes(st.id)) {
        const ev = events.find(e => e.id === eid);
        if (!ev) continue;
        const groups = st.groups.map(g => ({
          title: g.name,
          lines: g.entrants.map(k => {
            const v = stageEntrantView(state, st, k);
            return { avatars: v.players, text: v.name };
          }),
        }));
        setReveal({ id:st.id, evId:ev.id, title: st.kind === "heats" ? "The heats" : "The pools", subtitle:ev.name, groups, versus:null });
        return;
      }
    }
  }, [state.draws, state.stages, seenReveals, onboardStep, reveal, events, ready]); // eslint-disable-line
  const closeReveal = () => {
    if (reveal) {
      const next = [...(seenReveals||[]), reveal.id].slice(-60);
      setSeenReveals(next); localSet("si-seen-v5", JSON.stringify(next));
    }
    setReveal(null);
  };

  /* every mutation is an action; the server validates, applies, broadcasts */
  const act = (type, payload, okMsg) => dispatch(type, payload).then(r => {
    if (!r.ok) notify(r.error || "Rejected");
    else if (okMsg) notify(okMsg);
    return r;
  });

  const saveProfile = (p, prof) => {
    act("saveProfile", { player: p, display: prof.display });
    if (prof.photo) uploadPhoto(p, prof.photo).then(r => { if (!r?.ok) notify(r?.error || "Photo failed"); });
  };
  const saveSeeds = r => act("saveSeeds", { player: me, ratings: r });
  const saveResult = (ev, slots) => act("saveResult", { evId: ev.id, slots });
  const clearResult = ev => act("clearResult", { evId: ev.id });
  const setOnDeck = id => act("setOnDeck", { id });
  const shelveEvent = (id, on) => act("shelve", { id, on });
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
  const runDraw = (ev, method, players) => act("runDraw", { evId: ev.id, method, players });
  const clearDraw = ev => act("clearDraw", { evId: ev.id });
  const runStages = (ev, cfg) => act("runStages", { evId: ev.id, cfg });
  const clearStages = ev => act("clearStages", { evId: ev.id });
  const toggleThrough = (evId, g, key) => act("toggleThrough", { evId, g, key });
  const setFinalWinner = (evId, key) => act("setFinalWinner", { evId, key });
  const pickBracketWinner = (evId, r, m, teamIdx) => act("pickBracketWinner", { evId, r, m, teamIdx });
  const placeWager = w => act("placeWager", { wager: w }, "Wager placed");
  const voidWager = id => act("voidWager", { id });
  const addAdjust = (player, delta, reason) => act("adjust", { player, delta, reason });
  const setFrozen = f => act("setFrozen", { f });
  const resetGame = () => act("resetTournament", {}, "Board reset");
  const rerunOnboard = () => act("rerunOnboarding", {}, "Intro replays on every phone");
  const toggleQa = () => setQa(v => { saveMine("si-qa", v ? "no" : "yes"); return !v; });
  const unlockGm = pin => dispatch("gmUnlock", { pin }).then(r => {
    if (!r.ok) return notify(r.error || "Wrong passcode");
    setGmToken(r.extra?.gmToken); setGm(true); saveMine("si-gm", "yes");
    setModal(null); notify("Commissioner mode on");
  });
  const switchPlayer = p => { setMe(p); saveMine("si-me", p); dispatch("claim", { player: p }); setModal(null); notify(`Now viewing as ${p}`); };


  if (onboardStep < 99) {
    return (
      <Shell>
        <Onboarding step={onboardStep} me={me} state={state}
          pick={p => { setMe(p); saveMine("si-me", p); dispatch("claim", { player: p }); }}
          saveProfile={prof => saveProfile(me, prof)}
          submitSeeds={saveSeeds}
          next={() => setOnboardStep(s => s + 1)}
          done={() => { setOnboardStep(99); saveMine("si-onboard-v5","yes");
            saveMine("si-onboard-epoch", String(state.onboardEpoch || 0)); setBurst(b=>b+1); }} />
        <Confetti burst={burst} />
      </Shell>
    );
  }

  if (tv) {
    return (
      <Shell tv>
        <TVMode standings={standings} state={state} events={events} onDeckEv={onDeckEv} allTied={allTied}
          champion={champion} coChamps={coChamps} onExit={() => setTv(false)} />
        {reveal && <Reveal state={state} reveal={reveal} big onClose={closeReveal} />}
        <Confetti burst={burst} />
      </Shell>
    );
  }

  return (
    <Shell>
      {/* header */}
      <div style={{ position:"sticky", top:0, zIndex:40, background:"rgba(244,237,223,0.93)",
        backdropFilter:"blur(14px)", borderBottom:"1px solid var(--line)",
        paddingTop:"env(safe-area-inset-top)" }}>
        <div style={{ padding:"10px 16px 9px", display:"flex", alignItems:"center", gap:10 }}>
          <button onClick={() => setModal({type:"profile"})} aria-label="Your profile"
            style={{ background:"none", border:"none", padding:0, cursor:"pointer" }}>
            {me ? <Avatar state={state} p={me} size={38} /> : null}
          </button>
          <div style={{ flex:1, display:"flex", alignItems:"center", gap:9 }}>
            <FDMark size={30} />
            <div style={{ lineHeight:1 }}>
              <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:22, letterSpacing:"0.015em",
                textTransform:"uppercase", color:"var(--ink)" }}>Field Day</div>
              <div style={{ fontFamily:SANS, fontWeight:700, fontSize:9, letterSpacing:"0.14em",
                color:"var(--muted)", marginTop:2 }}>SCOTTSDALE · 2026</div>
            </div>
          </div>
          <button onClick={() => setTv(true)} title="TV mode" aria-label="TV mode"
            style={{ background:"var(--paper)", border:"1.5px solid rgba(42,33,25,0.4)", borderRadius:9,
              width:38, height:38, cursor:"pointer", color:"var(--ink)",
              display:"flex", alignItems:"center", justifyContent:"center" }}><IconTV /></button>
          <button onClick={() => gm ? setModal({type:"gmMenu"}) : setModal({type:"pin"})} aria-label="Commissioner"
            style={{ background: gm ? "var(--sun)" : "var(--paper)",
              border:"1.5px solid " + (gm ? "var(--ink)" : "rgba(42,33,25,0.4)"), borderRadius:9,
              width:38, height:38, cursor:"pointer", color:"var(--ink)",
              display:"flex", alignItems:"center", justifyContent:"center" }}><IconGM filled={gm} /></button>
        </div>
        {!connected && loaded && (
          <div style={{ display:"flex", alignItems:"center", gap:8, margin:"0 16px 10px",
            padding:"7px 13px", borderRadius:11, background:"rgba(188,75,60,0.1)",
            border:"1px solid rgba(188,75,60,0.4)" }}>
            <span style={{ width:7, height:7, borderRadius:99, background:"var(--clay)", animation:"si-pulse 1.2s infinite" }} />
            <span style={{ fontFamily:SANS, fontWeight:700, fontSize:11.5, letterSpacing:"0.12em",
              color:"var(--clay)", textTransform:"uppercase" }}>Reconnecting</span>
          </div>
        )}
        {onDeckEv && (
          <button onClick={() => setTab("bets")}
            style={{ display:"flex", alignItems:"center", gap:10, width:"calc(100% - 32px)", margin:"0 16px 10px",
            padding:"9px 13px", borderRadius:13, border:"1px solid rgba(188,75,60,0.4)",
            background:"linear-gradient(90deg, rgba(188,75,60,0.14), rgba(188,75,60,0.04))", cursor:"pointer", textAlign:"left" }}>
            <span style={{ width:7, height:7, borderRadius:99, background:"var(--live2)", animation:"si-pulse 1.6s infinite" }} />
            <span style={{ fontFamily:SANS, fontWeight:700, fontSize:11, letterSpacing:"0.16em", color:"var(--live2)" }}>ON DECK</span>
            <span style={{ fontFamily:SANS, fontWeight:600, fontSize:13.5, color:"var(--cream)", flex:1 }}>{onDeckEv.name}</span>
            <Tag tone="gold">Betting open</Tag>
          </button>
        )}
      </div>

      <div style={{ flex:1, overflowY:"auto", paddingTop:12,
        paddingBottom:`calc(${gm && qa ? 168 : 92}px + env(safe-area-inset-bottom))` }}>
        {tab === "board" && <Board state={state} standings={standings} me={me} deltas={deltas} allTied={allTied}
          champion={champion} coChamps={coChamps} gm={gm} events={events}
          myAtRisk={me ? atRisk(state, me, events) : 0}
          onOpen={ev => setModal({type:"event", ev})}
          onAdjust={p => setModal({type:"adjust", player:p})}
          onFreeze={() => setModal({type:"freeze"})} onUnfreeze={() => setFrozen(false)}
          finaleDone={!!state.results["finale"]} />}
        {tab === "sched" && <Schedule state={state} events={events} gm={gm}
          open={ev => setModal({type:"event", ev})} onAdd={() => setModal({type:"addEvent"})}
          onReorder={reorderEvents} />}
        {tab === "bets" && <Wagers state={state} me={me} standings={standings} gm={gm} events={events}
          onDeckEv={onDeckEv}
          onPick={pick => setModal({type:"placeWager", pick})}
          onVoid={id => { voidWager(id); notify("Wager voided"); }} />}
        {tab === "guide" && <Guide replay={() => setOnboardStep(3)} />}
      </div>

      {gm && qa && <QABar me={me} onSwitch={switchPlayer} onReset={resetGame} onRerun={rerunOnboard} onExit={toggleQa} />}

      {/* tab bar */}
      <div style={{ position:"fixed", bottom:0, left:0, right:0, display:"flex", justifyContent:"center", zIndex:50 }}>
        <div style={{ width:"100%", maxWidth:540, display:"flex", background:"rgba(244,237,223,0.95)",
          backdropFilter:"blur(16px)", borderTop:"1px solid var(--line)",
          padding:"8px 10px calc(12px + env(safe-area-inset-bottom))" }}>
          {[["board","Board"],["sched","Events"],["bets","Bets"],["guide","Rules"]].map(([id,lb]) => (
            <button key={id} onClick={() => setTab(id)} style={{ flex:1, background:"none", border:"none",
              cursor:"pointer", padding:"7px 0" }}>
              <div style={{ fontFamily:SANS, fontWeight:700, fontSize:12.5, letterSpacing:"0.05em",
                textTransform:"uppercase",
                color: tab===id ? "var(--accent2)" : "var(--muted)",
                borderBottom: tab===id ? "3px solid var(--accent)" : "3px solid transparent",
                display:"inline-block", paddingBottom:4 }}>{lb}</div>
            </button>
          ))}
        </div>
      </div>

      {/* modals */}
      {modal?.type === "pin" && <PinSheet onClose={() => setModal(null)} unlock={unlockGm} />}
      {modal?.type === "profile" && <ProfileSheet state={state} me={me} onClose={() => setModal(null)}
        save={prof => { saveProfile(me, prof); setModal(null); notify("Profile saved"); }} />}
      {modal?.type === "switch" && (
        <Sheet title="Switch player" onClose={() => setModal(null)}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
            {ROSTER.map(p => <PlayerChip key={p} name={p} selected={me===p} onClick={() => switchPlayer(p)} />)}
          </div>
        </Sheet>
      )}
      {modal?.type === "gmMenu" && (
        <Sheet title="Commissioner" onClose={() => setModal(null)}>
          <p style={pStyle}>Draws, heats, pools, and results run from Events. Opening betting puts an event on deck. Rulings from the Board. Commissioner controls show real names.</p>
          <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
            <Btn kind="dark" onClick={() => { setModal({type:"switch"}); }}>Switch player</Btn>
            <Btn kind="dark" onClick={() => { setTv(true); setModal(null); }}>TV mode</Btn>
            <Btn kind="dark" onClick={() => { toggleQa(); setModal(null); }}>{qa ? "QA mode off" : "QA mode"}</Btn>
            <Btn kind="dark" onClick={() => { setGm(false); saveMine("si-gm","no"); setModal(null); }}>Exit GM</Btn>
            {state.frozen
              ? <Btn kind="danger" onClick={() => { setFrozen(false); setModal(null); }}>Unfreeze board</Btn>
              : <Btn onClick={() => setModal({type:"freeze"})}>Crown the champion</Btn>}
          </div>
        </Sheet>
      )}
      {modal?.type === "event" && <EventSheet ev={events.find(e => e.id === modal.ev.id) || modal.ev} state={state} gm={gm}
        onClose={() => setModal(null)}
        enterResult={() => setModal({type:"result", ev:modal.ev})}
        clearRes={() => { clearResult(modal.ev); setModal(null); notify("Result cleared, wagers reopened"); }}
        onEdit={patch => editEvent(modal.ev.id, patch)}
        onDraw={(m, players) => { runDraw(modal.ev, m, players); setModal(null); }}
        onClearDraw={() => clearDraw(modal.ev)}
        onStages={cfg => { runStages(modal.ev, cfg); setModal(null); }}
        onClearStages={() => clearStages(modal.ev)}
        onThrough={(g,k) => toggleThrough(modal.ev.id, g, k)}
        onFinal={k => setFinalWinner(modal.ev.id, k)}
        onDeckToggle={() => { setOnDeck(state.onDeck === modal.ev.id ? null : modal.ev.id); }}
        onShelve={on => { shelveEvent(modal.ev.id, on); setModal(null); }}
        onRemove={() => { setModal(null); removeCustomEvent(modal.ev); }}
        openBracket={() => setModal({type:"bracket", ev:modal.ev})} />}
      {modal?.type === "bracket" && <BracketSheet ev={modal.ev} state={state} gm={gm}
        onClose={() => setModal({type:"event", ev:modal.ev})}
        onPick={(r,m,t) => pickBracketWinner(modal.ev.id, r, m, t)} />}
      {modal?.type === "result" && <ResultSheet ev={events.find(e => e.id === modal.ev.id) || modal.ev} state={state}
        onClose={() => setModal(null)}
        save={slots => { saveResult(modal.ev, slots); setModal(null); notify(`${modal.ev.name} posted, wagers settled`); }} />}
      {modal?.type === "addEvent" && <AddEventSheet state={state} onClose={() => setModal(null)}
        save={ev => { addCustomEvent(ev); setModal(null); notify(`${ev.name} added`); }} />}
      {modal?.type === "placeWager" && <PlaceWagerSheet state={state} me={me} standings={standings}
        events={events} pick={modal.pick} onClose={() => setModal(null)}
        place={w => { setModal(null); placeWager(w); }} />}
      {modal?.type === "adjust" && <AdjustSheet player={modal.player} onClose={() => setModal(null)}
        save={(d,r) => { addAdjust(modal.player, d, r); setModal(null); notify(`${modal.player} ${d>0?"+":""}${d}`); }} />}
      {modal?.type === "freeze" && (
        <Sheet title="Crown the champion" onClose={() => setModal(null)}>
          <p style={pStyle}>Freezes the board and crowns <b style={{color:"var(--accent2)"}}>{disp(state, standings[0]?.player)}</b> at {standings[0]?.pts} points. All betting closes.</p>
          {!state.results["finale"] && <p style={{...pStyle, color:"var(--live2)"}}>No Finale result yet.</p>}
          <div style={{ display:"flex", gap:10 }}>
            <Btn onClick={() => { setFrozen(true); setModal(null); setTab("board"); }}>Freeze the board</Btn>
            <Btn kind="ghost" onClick={() => setModal(null)}>Not yet</Btn>
          </div>
        </Sheet>
      )}

      {toast && (
        <div style={{ position:"fixed", bottom:"calc(98px + env(safe-area-inset-bottom))", left:"50%", transform:"translateX(-50%)", zIndex:150,
          display:"flex", alignItems:"center", gap:12,
          background: toast.tone === "gold" ? "linear-gradient(180deg, rgba(192,91,51,0.16), rgba(192,91,51,0.05)), var(--panel2)" : "var(--panel2)",
          border:"1px solid " + (toast.tone === "gold" ? "rgba(156,69,38,0.6)" : "var(--line)"), borderRadius:12,
          color: toast.tone === "gold" ? "var(--accent2)" : "var(--cream)", padding:"10px 16px", fontFamily:SANS, fontWeight:600, fontSize:13.5,
          whiteSpace:"nowrap", boxShadow:"0 10px 34px rgba(0,0,0,0.55)", animation:"si-up .2s ease-out" }}>
          {toast.msg}
          {toast.action && <button onClick={toast.action.fn} style={{ background:"none", border:"none",
            color:"var(--accent2)", fontFamily:SANS, fontWeight:700, fontSize:13.5, cursor:"pointer",
            textTransform:"uppercase", letterSpacing:"0.08em", padding:0 }}>{toast.action.label}</button>}
        </div>
      )}
      {reveal && <Reveal state={state} reveal={reveal} onClose={closeReveal}
        onBets={state.onDeck === reveal.evId && !state.results[reveal.evId]
          ? () => { closeReveal(); setTab("bets"); } : null} />}
      <Confetti burst={burst} />
      {!loaded && <div style={{ position:"fixed", inset:0, background:"var(--bg)", zIndex:500,
        display:"flex", alignItems:"center", justifyContent:"center" }}><Wordmark size={30} /></div>}
    </Shell>
  );
}

/* ─────────── shell ─────────── */
function Shell({ children, tv }) {
  return (
    <div className="si-vh" style={{ background:"var(--bg)", display:"flex", justifyContent:"center" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,500;0,600;0,700;1,700&family=Archivo:wght@400;500;600;700&display=swap');
        :root {
          /* Field Day tokens. Canvas and paper are warm bone; ink is brown-black. */
          --bg:#F2E9D8; --paper:#FBF5E9; --paper2:#EADFC8; --line:#DACDB4;
          --ink:#2A2119; --muted:#8A7A63; --muted2:#6E5E49;
          /* phase + signal palette: pool (Fri), sun (Sat AM), terracotta (Sat PM), clay (Sat night), night (Finale) */
          --accent:#C05B33; --accent2:#9C4526; --sun:#E9B441; --pool:#4F93A3;
          --olive:#77804C; --clay:#BC4B3C; --live2:#B23B2E;
          --night:#251C14; --night2:#3A2C1E;
          /* legacy aliases still used by not-yet-restyled surfaces */
          --panel:#FBF5E9; --panel2:#EDE2CB; --cream:#2A2119; --dust:#8A7A63;
          --gold:#C05B33; --flame:#BC4B3C; --green:#4E6E39;
        }
        * { box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
        body { margin:0; background:var(--bg); }
        button:active { transform: scale(0.97); }
        input::placeholder { color:var(--muted); }
        @keyframes si-fall { to { transform: translateY(110vh) translateX(var(--drift)) rotate(720deg); opacity:0.7; } }
        @keyframes si-pulse { 0%,100% { opacity:1; } 50% { opacity:0.25; } }
        @keyframes si-up { from { transform: translateY(26px); opacity:0; } to { transform:none; opacity:1; } }
        @keyframes si-in { from { opacity:0; transform: translateY(8px); } to { opacity:1; transform:none; } }
        @keyframes si-fade { from { opacity:0; } to { opacity:1; } }
        @keyframes si-flag { 0% { opacity:0; transform: translateY(30px) scale(0.92); } 60% { transform: translateY(-4px) scale(1.015); } 100% { opacity:1; transform:none; } }
        @keyframes si-shine { 0% { transform: translateX(-120%) skewX(-18deg);} 100% { transform: translateX(240%) skewX(-18deg);} }
        @keyframes si-tick { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @keyframes si-glow { 0%,100% { box-shadow:0 0 26px rgba(192,91,51,0.22);} 50% { box-shadow:0 0 50px rgba(188,75,60,0.32);} }
        @keyframes si-pop { 0% { transform:scale(1); } 40% { transform:scale(1.22); } 100% { transform:scale(1); } }
        @media (prefers-reduced-motion: reduce) { * { animation:none !important; transition:none !important; } }
        ::-webkit-scrollbar { width:0; height:0; }
        /* dvh tracks the visible viewport (browser bars come and go); vh is the fallback */
        .si-vh { min-height:100vh; min-height:100dvh; }
        .si-sheet { max-height:90vh; max-height:90dvh; }
      `}</style>
      <div className="si-vh" style={{ width:"100%", maxWidth: tv ? "100%" : 540, display:"flex",
        flexDirection:"column", position:"relative",
        background:"radial-gradient(120% 50% at 50% -6%, rgba(233,180,65,0.14) 0%, transparent 60%), var(--bg)" }}>
        <div style={{ position:"fixed", inset:0, pointerEvents:"none", backgroundImage:GRAIN, zIndex:1000, mixBlendMode:"multiply" }} />
        {children}
      </div>
    </div>
  );
}

/* install UI: native prompt where the browser offers one, instructions where it never will */
function InstallHint() {
  if (installEvt) return <Btn onClick={() => installEvt.prompt()} style={{ alignSelf:"flex-start" }}>Add to home screen</Btn>;
  if (isIOS()) return (
    <div>
      {[["1","Tap the Share button in Safari"],["2","Tap Add to Home Screen"]].map(([n,t]) => (
        <div key={n} style={{ display:"flex", gap:12, alignItems:"center", padding:"7px 0" }}>
          <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:19, color:"var(--accent2)" }}>{n}</span>
          <span style={{ fontFamily:SANS, fontSize:15.5, color:"var(--cream)" }}>{t}</span>
        </div>
      ))}
    </div>
  );
  return <div style={{ fontFamily:SANS, fontSize:15.5, color:"var(--cream)" }}>
    In your browser menu, choose Add to Home Screen.</div>;
}

/* ─────────── onboarding ─────────── */
function Onboarding({ step, me, state, pick, saveProfile, submitSeeds, next, done }) {
  const [ratings, setRatings] = useState({});
  const [display, setDisplay] = useState("");
  const [photo, setPhoto] = useState(null);
  useEffect(() => { if (me) setDisplay(state.profiles?.[me]?.display || me); }, [me]); // eslint-disable-line
  const cards = {
    3: { art:<FDMark size={54} />, t:"One board", b:"13 players, one board, all weekend. Every event and every bet moves it. Everyone starts with 5.", meter:true },
    4: { art:<ArtTicket />, t:"Bets", b:"When an event opens, back anyone to win it, even yourself. Winner pays 2 to 1. Stakes of 1 to 3. It settles itself." },
    5: { art:<ArtStar />, t:"Saturday night", b:"The Finale pays big, then the champion is crowned. Glance for ten seconds, get back out there." },
  };
  if (step === -1) return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", animation:"si-in .3s ease-out",
      padding:"calc(48px + env(safe-area-inset-top)) 22px calc(24px + env(safe-area-inset-bottom))" }}>
      <div style={label}>Scottsdale · October 2026</div>
      <div style={{ margin:"10px 0 4px" }}><Wordmark size={46} /></div>
      <div style={{ fontFamily:SANS, color:"var(--muted2)", fontSize:15, lineHeight:1.6, marginBottom:22 }}>
        First move: put this on your home screen. Full screen, no browser bar, there all weekend.
      </div>
      <InstallHint />
      <div style={{ fontFamily:SANS, fontSize:13, color:"var(--dust)", marginTop:18, lineHeight:1.6 }}>
        Then open it from your home screen and check in there.
      </div>
      <div style={{ marginTop:"auto" }}>
        <Btn kind="ghost" onClick={next} style={{ width:"100%" }}>Skip, stay in the browser</Btn>
      </div>
    </div>
  );
  if (step === 0) return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", animation:"si-in .3s ease-out",
      padding:"calc(48px + env(safe-area-inset-top)) 22px calc(24px + env(safe-area-inset-bottom))" }}>
      <div style={label}>Scottsdale · October 2026</div>
      <div style={{ margin:"10px 0 4px" }}><Wordmark size={46} /></div>
      <div style={{ fontFamily:SANS, color:"var(--muted2)", fontSize:15, marginBottom:28 }}>
        13 players. One board. A champion Saturday night.
      </div>
      <div style={{ ...label, marginBottom:10 }}>Who are you?</div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:"auto" }}>
        {ROSTER.map(p => <PlayerChip key={p} name={p} selected={me===p} onClick={() => pick(p)} />)}
      </div>
      <Btn disabled={!me} onClick={next} style={{ width:"100%", fontSize:15, padding:"15px" }}>Check in</Btn>
    </div>
  );
  if (step === 1) return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", animation:"si-in .3s ease-out",
      padding:"calc(40px + env(safe-area-inset-top)) 22px calc(24px + env(safe-area-inset-bottom))" }}>
      <div style={label}>Your card</div>
      <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:30, color:"var(--cream)", margin:"6px 0 16px" }}>
        Set up your profile</div>
      <ProfileEditor state={state} me={me} display={display} setDisplay={setDisplay} photo={photo} setPhoto={setPhoto} />
      <div style={{ marginTop:"auto" }}>
        <Btn disabled={!display.trim()} onClick={() => { saveProfile({ display: display.trim(), ...(photo ? {photo} : {}) }); next(); }}
          style={{ width:"100%", fontSize:15, padding:"15px" }}>Continue</Btn>
      </div>
    </div>
  );
  if (step === 2) {
    const complete = SPORTS.every(s => ratings[s.id] !== undefined);
    return (
      <div style={{ flex:1, display:"flex", flexDirection:"column", animation:"si-in .3s ease-out",
        padding:"calc(40px + env(safe-area-inset-top)) 20px calc(24px + env(safe-area-inset-bottom))" }}>
        <div style={label}>Scouting report · sealed</div>
        <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:30, color:"var(--cream)", margin:"6px 0 6px" }}>Rate yourself</div>
        <div style={{ fontFamily:SANS, fontSize:13.5, color:"var(--muted2)", lineHeight:1.55, marginBottom:16 }}>
          Nobody sees this. It only balances draws and heats.
        </div>
        <div style={{ flex:1, overflowY:"auto", marginBottom:14 }}>
          {SPORTS.map(s => (
            <div key={s.id} style={{ marginBottom:14 }}>
              <div style={{ fontFamily:SANS, fontWeight:700, fontSize:13.5, letterSpacing:"0.06em",
                color:"var(--cream)", marginBottom:6 }}>{s.label}</div>
              <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                {RATINGS.map(r => (
                  <button key={r.label} onClick={() => setRatings(x => ({...x, [s.id]: r.v}))}
                    style={{ fontFamily:SANS, fontWeight:600, fontSize:12, padding:"7px 10px", borderRadius:9,
                      cursor:"pointer",
                      background: ratings[s.id] === r.v ? GOLD_GRAD : "var(--panel2)",
                      color: ratings[s.id] === r.v ? "var(--ink)" : "var(--cream)",
                      border: ratings[s.id] === r.v ? "1px solid transparent" : "1px solid var(--line)" }}>
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <Btn disabled={!complete} onClick={() => { submitSeeds(ratings); next(); }}
          style={{ width:"100%", fontSize:15, padding:"15px" }}>Seal it</Btn>
      </div>
    );
  }
  const c = cards[step];
  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", animation:"si-in .3s ease-out",
      padding:"calc(56px + env(safe-area-inset-top)) 26px calc(24px + env(safe-area-inset-bottom))" }} key={step}>
      <div style={{ marginBottom:16 }}>{c.art}</div>
      <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:40, color:"var(--cream)", lineHeight:1.02, marginBottom:12 }}>{c.t}</div>
      <div style={{ fontFamily:SANS, fontSize:16, lineHeight:1.6, color:"var(--muted2)" }}>{c.b}</div>
      {c.meter && (
        <div style={{ display:"flex", gap:6, alignItems:"flex-end", marginTop:28, height:96 }}>
          {[["Fri",1],["Sat AM",2],["Sat PM",3],["Sat Nite",4],["Finale",6]].map(([lb,v]) => (
            <div key={lb} style={{ flex:1, textAlign:"center" }}>
              <div style={{ height:v*13, margin:"0 2px", borderRadius:"4px 4px 0 0",
                background: v===6 ? EMBER_GRAD : GOLD_GRAD, opacity: v===6 ? 1 : 0.3 + v*0.13,
                animation: v===6 ? "si-glow 2s infinite" : "none" }} />
              <div style={{ fontFamily:SANS, fontSize:10, letterSpacing:"0.1em", color:"var(--dust)", marginTop:6, fontWeight:700, textTransform:"uppercase" }}>{lb}</div>
              <div style={{ fontFamily:DISPLAY, fontSize:16, color:"var(--accent2)", fontWeight:700 }}>{v}</div>
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop:"auto", display:"flex", alignItems:"center", gap:14 }}>
        <div style={{ display:"flex", gap:6, flex:1 }}>
          {[3,4,5].map(i => <div key={i} style={{ width:22, height:3, borderRadius:2, background: i<=step ? "var(--accent)" : "var(--line)" }} />)}
        </div>
        <Btn onClick={step === 5 ? done : next} style={{ fontSize:15, padding:"14px 28px" }}>
          {step === 5 ? "I'm in" : "Next"}
        </Btn>
      </div>
    </div>
  );
}

function ProfileEditor({ state, me, display, setDisplay, photo, setPhoto }) {
  const fileRef = useRef(null);
  const prof = state.profiles?.[me];
  const current = photo || (prof?.photoV ? `/api/photo/${encodeURIComponent(me)}?v=${prof.photoV}` : null);
  const onFile = e => {
    const f = e.target.files?.[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        try {
          const c = document.createElement("canvas");
          const s = 144; c.width = s; c.height = s;
          const ctx = c.getContext("2d");
          const m = Math.min(img.width, img.height);
          ctx.drawImage(img, (img.width-m)/2, (img.height-m)/2, m, m, 0, 0, s, s);
          setPhoto(c.toDataURL("image/jpeg", 0.72));
        } catch {}
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(f);
  };
  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:18 }}>
        <button onClick={() => fileRef.current?.click()} style={{ background:"none", border:"none", padding:0, cursor:"pointer", position:"relative" }}>
          {current
            ? <img src={current} alt="" style={{ width:84, height:84, borderRadius:"50%", objectFit:"cover", border:"2.5px solid var(--gold)", boxShadow:"0 4px 18px rgba(192,91,51,0.3)" }} />
            : me && <Avatar state={state} p={me} size={84} ring />}
          <div style={{ position:"absolute", bottom:0, right:0, width:28, height:28, borderRadius:"50%",
            background:"var(--sun)", border:"1.5px solid var(--ink)", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2.2" strokeLinejoin="round" aria-hidden="true"><path d="M4 8h3.2L9 6h6l1.8 2H20v11H4z"/><circle cx="12" cy="13" r="3.2"/></svg></div>
        </button>
        <div style={{ fontFamily:SANS, fontSize:13, color:"var(--dust)", lineHeight:1.5 }}>
          Photo is optional. It shows on the board, the bracket, and the TV.
        </div>
        <input ref={fileRef} type="file" accept="image/*" onChange={onFile} style={{ display:"none" }} />
      </div>
      <div style={{ ...label, marginBottom:6 }}>Display name</div>
      <input value={display} onChange={e => setDisplay(e.target.value)} maxLength={16}
        style={{ width:"100%", background:"var(--panel2)", border:"1px solid var(--line)", borderRadius:12,
          padding:"13px 14px", color:"var(--cream)", fontFamily:SANS, fontWeight:600, fontSize:16, outline:"none" }} />
    </div>
  );
}

/* ─────────── the board ─────────── */
function Board({ state, standings, me, deltas, allTied, champion, coChamps, gm, events, myAtRisk, onOpen, onAdjust, onFreeze, onUnfreeze, finaleDone }) {
  let latest = null;
  Object.entries(state.results || {}).forEach(([eid, res]) => {
    const ev = events.find(e => e.id === eid);
    if (ev && res?.slots?.[0]?.length && (!latest || res.ts > latest.res.ts)) latest = { ev, res };
  });
  return (
    <div style={{ padding:"0 16px" }}>
      {champion && <ChampionCard state={state} champion={champion} coChamps={coChamps} />}
      {latest && !champion && (
        <div style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 13px", marginBottom:10,
          borderRadius:13, background:"rgba(95,122,69,0.06)", border:"1px solid rgba(95,122,69,0.25)" }}>
          <span style={{ fontFamily:SANS, fontWeight:700, fontSize:10.5, letterSpacing:"0.16em",
            color:"var(--green)", textTransform:"uppercase" }}>Latest</span>
          <span style={{ fontFamily:SANS, fontWeight:600, fontSize:13, color:"var(--cream)", flex:1,
            overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            {latest.ev.name}: {teamLabel(state, { players: latest.res.slots[0] })}</span>
          <AvatarStack state={state} players={latest.res.slots[0]} size={22} max={3} />
        </div>
      )}
      {!champion && (() => {
        const open = e => !state.results[e.id] && !state.shelved[e.id] && e.id !== state.onDeck;
        const live = events.find(e => open(e) && (state.brackets[e.id] || state.stages[e.id]));
        const next = live || events.find(open);
        if (!next) return null;
        return (
          <button onClick={() => onOpen(next)} style={{ display:"flex", alignItems:"center", gap:10, width:"100%",
            padding:"9px 13px", marginBottom:10, borderRadius:13, cursor:"pointer", textAlign:"left",
            background: live ? "linear-gradient(90deg, rgba(188,75,60,0.1), rgba(188,75,60,0.02)), var(--panel)" : "var(--panel)",
            border: live ? "1px solid rgba(188,75,60,0.4)" : "1px solid var(--line)" }}>
            <span style={{ fontFamily:SANS, fontWeight:700, fontSize:10.5, letterSpacing:"0.16em",
              color: live ? "var(--live2)" : "var(--accent2)", textTransform:"uppercase" }}>{live ? "Live" : "Next"}</span>
            <span style={{ fontFamily:SANS, fontWeight:600, fontSize:13, color:"var(--cream)", flex:1, minWidth:0,
              overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{next.name}</span>
            <span style={{ fontFamily:SANS, color:"var(--dust)", fontSize:15 }}>›</span>
          </button>
        );
      })()}
      {allTied && (
        <div style={{ textAlign:"center", padding:"6px 0 14px" }}>
          <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:19, color:"var(--cream)" }}>All square at 5</div>
          <div style={{ fontFamily:SANS, fontSize:13, color:"var(--dust)" }}>The first result sets the board</div>
        </div>
      )}
      <div style={{ background:"var(--paper)", border:"1.5px solid var(--ink)", borderRadius:10,
        overflow:"hidden", animation:"si-in .25s both" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12, padding:"6px 12px",
          borderBottom:"1.5px solid var(--ink)", background:"var(--paper2)" }}>
          <span style={{ ...label, fontSize:10.5, width:26, textAlign:"center" }}>Pos</span>
          <span style={{ ...label, fontSize:10.5, flex:1 }}>Player</span>
          <span style={{ ...label, fontSize:10.5 }}>Pts</span>
        </div>
        {standings.map((r, i) => {
          const isMe = r.player === me;
          const first = r.rank === 1 && !allTied;
          const medal = !allTied && r.rank === 2 ? "#75818C" : !allTied && r.rank === 3 ? "#AC6A3B" : null;
          return (
            <div key={r.player} onClick={gm ? () => onAdjust(r.player) : undefined}
              style={{ display:"flex", alignItems:"center", gap:12, padding: first ? "11px 12px" : "8px 12px",
                cursor: gm ? "pointer" : "default", position:"relative",
                background: first ? "var(--sun)" : isMe ? "rgba(192,91,51,0.08)" : i % 2 ? "rgba(42,33,25,0.03)" : "transparent",
                borderTop: i > 0 ? "1px solid var(--line)" : "none",
                boxShadow: isMe && !first ? "inset 3px 0 0 var(--accent)" : "none" }}>
              <div style={{ width:26, textAlign:"center", fontFamily:DISPLAY, fontWeight:700,
                fontSize: first ? 24 : 19, color: first ? "var(--ink)" : medal || "var(--muted)" }}>
                {allTied ? "·" : r.rank}</div>
              <Avatar state={state} p={r.player} size={first ? 36 : 30} />
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontFamily:SANS, fontWeight:700, fontSize: first ? 16 : 14.5, color:"var(--ink)",
                  overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                  {disp(state, r.player)}{isMe && <span style={{ opacity:0.55, fontWeight:600, fontSize:12 }}> · you</span>}
                </div>
                <div style={{ fontFamily:SANS, fontSize:11.5, color: first ? "rgba(42,33,25,0.65)" : "var(--muted)" }}>
                  {r.wins} win{r.wins===1?"":"s"}{r.betNet !== 0 && <> · wagers {r.betNet>0?"+":""}{r.betNet}</>}
                  {isMe && myAtRisk > 0 && <> · <span style={{ color:"var(--live2)" }}>{myAtRisk} at risk</span></>}
                </div>
              </div>
              {!allTied && deltas[r.player] && <div style={{ fontFamily:SANS, fontWeight:800, fontSize:12.5,
                color: deltas[r.player] > 0 ? "var(--green)" : "var(--clay)" }}>
                {deltas[r.player] > 0 ? `▲${deltas[r.player]}` : `▼${-deltas[r.player]}`}</div>}
              <div key={r.pts} style={{ fontFamily:DISPLAY, fontWeight:700, fontSize: first ? 30 : 24,
                minWidth:36, textAlign:"right", color:"var(--ink)", animation:"si-pop .5s ease-out" }}>{r.pts}</div>
            </div>
          );
        })}
      </div>
      {gm && !champion && (
        <div style={{ padding:"14px 4px 8px", textAlign:"center" }}>
          <div style={{ fontFamily:SANS, fontSize:12.5, color:"var(--dust)", marginBottom:10 }}>
            Tap a player for a bonus or penalty
          </div>
          <Btn kind={finaleDone ? "primary" : "ghost"} onClick={onFreeze}>Crown the champion</Btn>
        </div>
      )}
      {gm && champion && (
        <div style={{ textAlign:"center", padding:"10px 0" }}>
          <Btn kind="danger" onClick={onUnfreeze}>Unfreeze board</Btn>
        </div>
      )}
    </div>
  );
}
function ChampionCard({ state, champion, coChamps, big }) {
  return (
    <div style={{ padding: big ? "48px 30px" : "26px 18px", textAlign:"center", marginBottom:16,
      position:"relative", overflow:"hidden", borderRadius:12,
      background:"radial-gradient(110% 80% at 50% 0%, rgba(233,180,65,0.14) 0%, transparent 55%), var(--night)",
      border:"1.5px solid var(--ink)" }}>
      <div style={{ display:"flex", justifyContent:"center", gap:10, marginBottom:14 }}>
        {coChamps.map(c => <Avatar key={c.player} state={state} p={c.player} size={big ? 110 : 64}
          style={{ border:"2.5px solid var(--sun)" }} />)}
      </div>
      <div style={{ display:"inline-block", fontFamily:DISPLAY, fontWeight:700, letterSpacing:"0.14em",
        textTransform:"uppercase", background:"var(--sun)", color:"var(--night)",
        fontSize: big ? 19 : 12.5, padding: big ? "5px 22px" : "3px 14px", borderRadius:4 }}>Champion</div>
      <div style={{ fontFamily:DISPLAY, fontWeight:700, fontStyle:"italic", textTransform:"uppercase",
        fontSize: big ? 104 : 46, lineHeight:0.95, margin:"10px 0 6px", color:"var(--sun)" }}>
        {coChamps.map(c => disp(state, c.player)).join(" & ")}
      </div>
      <div style={{ fontFamily:SANS, fontWeight:600, color:"#D8C6A6", fontSize: big ? 19 : 13 }}>
        {champion.pts} points · Field Day · Scottsdale 2026
      </div>
      {coChamps.length > 1 && <div style={{ fontFamily:SANS, marginTop:8, color:"#E5967F", fontSize: big ? 17 : 13 }}>
        Tied. One pressure putt on the green decides it.</div>}
    </div>
  );
}

/* ─────────── slate ─────────── */
/* phase colors: each session of the weekend gets its own band */
const PHASE = {
  fri: { bg:"var(--pool)",   fg:BONE },
  sam: { bg:"var(--sun)",    fg:"var(--ink)" },
  sap: { bg:"var(--accent)", fg:BONE },
  san: { bg:"var(--clay)",   fg:BONE },
  fin: { bg:"var(--night)",  fg:"var(--sun)" },
};
const phaseOf = ev => PHASE[ev?.session] || { bg:"var(--paper2)", fg:"var(--ink)" };

function Schedule({ state, events, gm, open, onAdd, onReorder }) {
  const [reorderMode, setReorderMode] = useState(false);
  const shelved = events.filter(e => state.shelved[e.id]);
  const inSession = s => events.filter(e => e.session === s.id && !state.shelved[e.id]);
  const extras = events.filter(e => e.custom && !SESSIONS.find(s => s.id === e.session) && !state.shelved[e.id]);
  const move = (ev, dir) => {
    const ids = [...SESSIONS.map(s => inSession(s).map(e => e.id)), extras.map(e => e.id)];
    for (const g of ids) {
      const i = g.indexOf(ev.id);
      if (i >= 0) {
        const j = i + dir;
        if (j < 0 || j >= g.length) return;
        [g[i], g[j]] = [g[j], g[i]];
        break;
      }
    }
    onReorder(ids.flat());
  };
  const arrow = (ev, dir, edge) => (
    <button disabled={edge} onClick={e => { e.stopPropagation(); move(ev, dir); }}
      style={{ width:34, height:34, borderRadius:10, cursor: edge ? "default" : "pointer",
        background:"var(--panel2)", border:"1px solid var(--line)", color: edge ? "#A5947B" : "var(--accent2)",
        fontSize:13, flexShrink:0 }}>{dir < 0 ? "▲" : "▼"}</button>
  );
  const section = (evList, canMove) => evList.map((ev, i) => {
    const res = state.results[ev.id];
    const draw = state.draws[ev.id];
    const st = state.stages[ev.id];
    const deck = state.onDeck === ev.id;
    const moving = reorderMode && gm && canMove;
    const ph = phaseOf(ev);
    return (
      <button key={ev.id} onClick={moving ? undefined : () => open(ev)} style={{ display:"block", width:"100%", textAlign:"left",
        background: deck ? "rgba(188,75,60,0.09)" : "var(--paper)",
        border: deck ? "1.5px solid var(--clay)" : "1px solid var(--line)",
        boxShadow:`inset 4px 0 0 ${ph.bg}`,
        borderRadius:9, padding:"11px 14px 11px 16px", marginBottom:7, cursor: moving ? "default" : "pointer" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontFamily:DISPLAY, fontWeight:600, fontSize:18.5, letterSpacing:"0.01em",
              textTransform:"uppercase", color:"var(--ink)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
              {res && <span style={{ color:"var(--green)" }}>✓ </span>}{ev.name}
              {ev.finale && <span style={{ color:"var(--accent)" }}> ★</span>}
            </div>
          </div>
          {moving ? (
            <>{arrow(ev, -1, i === 0)}{arrow(ev, 1, i === evList.length - 1)}</>
          ) : (
            <>
              {deck && <Tag tone="flame">On deck</Tag>}
              {!res && !deck && st && <Tag tone="green">{st.kind === "heats" ? "Heats live" : "Pools live"}</Tag>}
              {!res && !deck && !st && draw && <Tag tone="green">Teams set</Tag>}
              {!res && !deck && !st && !draw && <Tag>{ev.value} pt{ev.value>1?"s":""}</Tag>}
            </>
          )}
        </div>
        {res && res.slots?.[0]?.length > 0 && (
          <div style={{ marginTop:9, display:"flex", flexWrap:"wrap", gap:6, alignItems:"center" }}>
            {res.slots[0].map(p => (
              <span key={p} style={{ display:"inline-flex", alignItems:"center", gap:6,
                fontFamily:SANS, fontWeight:700, fontSize:12, padding:"3px 10px 3px 4px", borderRadius:99,
                background:"rgba(192,91,51,0.14)", color:"var(--accent2)" }}>
                <Avatar state={state} p={p} size={20} />{disp(state, p)}
              </span>
            ))}
          </div>
        )}
      </button>
    );
  });
  return (
    <div style={{ padding:"0 16px" }}>
      {SESSIONS.map(s => {
        const evs = inSession(s);
        if (evs.length === 0) return null;
        const ph = PHASE[s.id] || { bg:"var(--paper2)", fg:"var(--ink)" };
        return (
          <div key={s.id} style={{ marginBottom:16 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, padding:"6px 12px", marginBottom:7,
              borderRadius:7, background:ph.bg, color:ph.fg, border:"1.5px solid var(--ink)" }}>
              <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:18, letterSpacing:"0.03em",
                textTransform:"uppercase", flex:1 }}>{s.label}</span>
              <span style={{ fontFamily:SANS, fontWeight:700, fontSize:11, letterSpacing:"0.05em" }}>{s.tag}</span>
            </div>
            {section(evs, true)}
          </div>
        );
      })}
      {extras.length > 0 && (
        <div style={{ marginBottom:16 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, padding:"6px 12px", marginBottom:7,
            borderRadius:7, background:"var(--paper2)", color:"var(--ink)", border:"1.5px solid var(--ink)" }}>
            <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:18, letterSpacing:"0.03em",
              textTransform:"uppercase", flex:1 }}>Extra</span>
          </div>
          {section(extras, true)}
        </div>
      )}
      {gm && (
        <div style={{ display:"flex", gap:8, marginBottom:14 }}>
          <Btn kind="ghost" onClick={onAdd} style={{ flex:1 }}>+ Add an event</Btn>
          <Btn kind={reorderMode ? "primary" : "ghost"} onClick={() => setReorderMode(v => !v)}>
            {reorderMode ? "Done" : "Reorder"}</Btn>
        </div>
      )}
      {shelved.length > 0 && (
        <div style={{ marginBottom:16, opacity:0.55 }}>
          <div style={{ ...label, margin:"4px 2px 8px" }}>Shelved</div>
          {section(shelved, false)}
        </div>
      )}
      <div style={{ fontFamily:SANS, fontSize:12.5, color:"var(--muted)", textAlign:"center", padding:"4px 20px 16px", lineHeight:1.6 }}>
        Order is loose. Events run whenever. Sunday is unscored: breakfast, cleanup, group photo, out by 11.
      </div>
    </div>
  );
}

/* ─────────── stage grid (event sheet + TV) ─────────── */
function StageGrid({ state, ev, gm, onThrough, onFinal, size="md" }) {
  const st = state.stages[ev.id];
  if (!st) return null;
  const finalists = stageFinalists(st);
  const dims = {
    md: { av:24, f:13.5, tf:13, pad:"7px 10px", gap:8, col:"1fr 1fr" },
    lg: { av:36, f:19,   tf:17, pad:"11px 14px", gap:14, col:`repeat(${Math.min(st.groups.length + (finalists ? 1 : 0), 4)}, 1fr)` },
  }[size];
  const GroupCard = ({ title, entrants, through, gIdx, isFinal }) => (
    <div style={{ background:"var(--panel2)", border:"1px solid " + (isFinal ? "rgba(156,69,38,0.5)" : "var(--line)"),
      borderRadius:13, overflow:"hidden", boxShadow:"0 3px 12px rgba(0,0,0,0.3)" }}>
      <div style={{ ...label, fontSize: size==="lg" ? 13 : 10.5, padding: size==="lg" ? "9px 14px 5px" : "7px 10px 3px",
        color: isFinal ? "var(--accent2)" : "var(--dust)" }}>{title}</div>
      {entrants.map(key => {
        const v = stageEntrantView(state, st, key);
        const isThrough = isFinal ? st.finalWinner === key : (through || []).includes(key);
        const decided = isFinal ? st.finalWinner !== null && st.finalWinner !== undefined
          : (through || []).length >= st.advance;
        const dimmed = decided && !isThrough;
        const clickable = gm && (isFinal ? onFinal : onThrough);
        return (
          <button key={String(key)} disabled={!clickable}
            onClick={() => isFinal ? onFinal(key) : onThrough(gIdx, key)}
            style={{ display:"flex", alignItems:"center", gap:8, width:"100%", textAlign:"left",
              padding:dims.pad, border:"none", borderTop:"1px solid var(--line)",
              cursor: clickable ? "pointer" : "default",
              background: isThrough ? "rgba(192,91,51,0.16)" : "transparent",
              opacity: dimmed ? 0.38 : 1 }}>
            <AvatarStack state={state} players={v.players} size={dims.av} max={3} />
            <span style={{ fontFamily:SANS, fontWeight:700, fontSize:dims.f, flex:1,
              overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
              color: isThrough ? "var(--accent2)" : "var(--cream)" }}>{v.name}</span>
            {isThrough && <span style={{ fontFamily:SANS, fontWeight:700, fontSize:dims.tf, color:"var(--accent2)" }}>
              {isFinal ? "🏆" : "✓"}</span>}
          </button>
        );
      })}
    </div>
  );
  return (
    <div style={{ display:"grid", gridTemplateColumns:dims.col, gap:dims.gap, alignItems:"start" }}>
      {st.groups.map((g, i) => (
        <GroupCard key={i} title={`${g.name}${st.advance > 1 ? ` · top ${st.advance} through` : ""}`}
          entrants={g.entrants} through={g.through} gIdx={i} />
      ))}
      {finalists && (
        <GroupCard title="The Final" entrants={finalists} isFinal />
      )}
    </div>
  );
}

/* ─────────── event sheet ─────────── */
function EventSheet({ ev, state, gm, onClose, enterResult, clearRes, onEdit, onDraw, onClearDraw,
  onStages, onClearStages, onThrough, onFinal, onDeckToggle, onShelve, onRemove, openBracket }) {
  const res = state.results[ev.id];
  const draw = state.draws[ev.id];
  const br = state.brackets[ev.id];
  const st = state.stages[ev.id];
  const table = AWARDS[ev.value];
  const shelvedNow = !!state.shelved[ev.id];
  const [confirmRedraw, setConfirmRedraw] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmScrap, setConfirmScrap] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [eName, setEName] = useState("");
  const [eDesc, setEDesc] = useState("");
  const [eValue, setEValue] = useState(1);
  const [eSession, setESession] = useState(null);
  const openEdit = () => {
    setEName(ev.name); setEDesc(ev.desc || ""); setEValue(ev.value);
    setESession(SESSIONS.find(s => s.id === ev.session) ? ev.session : null);
    setEditOpen(true);
  };
  const [method, setMethod] = useState(null);
  const [outs, setOuts] = useState([]);
  const [showOuts, setShowOuts] = useState(false);
  const [stageCfgOpen, setStageCfgOpen] = useState(false);
  const [nGroups, setNGroups] = useState(null);
  const [advance, setAdvance] = useState(1);
  const [stageMethod, setStageMethod] = useState("random");
  const inPlayers = ROSTER.filter(p => !outs.includes(p));
  const methods = DRAW_METHODS.filter(m =>
    (!m.needsSport || ev.sport) && (!m.pairsOnly || ev.teamCfg?.size === 2));
  const canHeats = ev.kind === "solo" && !res;
  const canPools = ev.teamCfg && draw && !br && draw.teams.length >= 4 && !res;
  const stageKind = canHeats ? "heats" : "pools";
  const stageEntrantCount = canHeats ? inPlayers.length : (draw?.teams?.length || 0);
  const suggestedGroups = Math.min(4, Math.max(2, Math.round(stageEntrantCount / (canHeats ? 4 : 3))));
  const groupsChoice = nGroups ?? suggestedGroups;
  return (
    <Sheet title={ev.name} onClose={onClose}>
      <div style={{ display:"flex", gap:8, marginBottom:12, flexWrap:"wrap" }}>
        <Tag tone={ev.finale ? "flame" : "gold"}>{ev.value} pt{ev.value>1?"s":""}</Tag>
        <Tag>{ev.kind === "solo" ? "Individual" : ev.kind === "pairs" ? "Pairs" : "Teams"}</Tag>
        {state.onDeck === ev.id && <Tag tone="flame">On deck</Tag>}
        {shelvedNow && <Tag>Shelved</Tag>}
      </div>
      {ev.desc && <p style={pStyle}>{ev.desc}</p>}
      <p style={{ ...pStyle, color:"var(--dust)", fontSize:13 }}>
        Pays {table.map((v,i) => v>0 ? `${SLOT_META[i].label} +${v}` : null).filter(Boolean).join(" · ")}
        {ev.kind !== "solo" && ". Team results pay every player the full amount."}
      </p>

      {draw && (
        <div style={{ marginBottom:14 }}>
          <div style={{ ...label, marginBottom:8 }}>The draw</div>
          {draw.teams.length === 2 ? (
            <VersusDraw state={state} teams={draw.teams} />
          ) : (
            <div style={{ display:"grid", gridTemplateColumns: draw.teams.length > 3 ? "1fr 1fr" : "1fr", gap:8 }}>
              {draw.teams.map((t,i) => (
                <div key={i} style={{ background:"var(--panel2)", border:"1px solid var(--line)", borderRadius:12, padding:"10px 12px" }}>
                  <div style={{ fontFamily:SANS, fontWeight:700, fontSize:13, color:"var(--accent2)", marginBottom:5 }}>{teamLabel(state, t)}</div>
                  <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                    {t.players.map(p => <Avatar key={p} state={state} p={p} size={26} />)}
                  </div>
                </div>
              ))}
            </div>
          )}
          {br && <Btn kind="dark" onClick={openBracket} style={{ width:"100%", marginTop:10 }}>View bracket</Btn>}
        </div>
      )}

      {st && (
        <div style={{ marginBottom:14 }}>
          <div style={{ ...label, marginBottom:8 }}>{st.kind === "heats" ? "Heats" : "Pools"}</div>
          <StageGrid state={state} ev={ev} gm={gm && !state.frozen}
            onThrough={onThrough} onFinal={onFinal} />
          {gm && !res && <div style={{ fontFamily:SANS, fontSize:12, color:"var(--dust)", marginTop:8 }}>
            Tap who goes through in each {st.kind === "heats" ? "heat" : "pool"}, then tap the final winner. Wagers settle as you go.
          </div>}
        </div>
      )}

      {res && res.slots && (
        <div style={{ marginBottom:14 }}>
          {res.slots.map((players, i) => players?.length > 0 && (
            <div key={i} style={{ fontFamily:SANS, fontSize:14, color:"var(--cream)", marginBottom:4 }}>
              <span style={{ color:SLOT_META[i].color, fontWeight:700 }}>{SLOT_META[i].label}:</span>{" "}
              {players.map(p => disp(state,p)).join(", ")} <span style={{ color:"var(--dust)" }}>+{table[i]} each</span>
            </div>
          ))}
        </div>
      )}

      {gm && !state.frozen && (
        <div style={{ borderTop:"1px solid var(--line)", paddingTop:14 }}>
          {ev.teamCfg && !draw && !res && (
            <>
              <div style={{ display:"flex", alignItems:"center", marginBottom:8 }}>
                <div style={{ ...label, flex:1 }}>Draw teams</div>
                <button onClick={() => setShowOuts(v => !v)} style={{ background:"none", border:"none",
                  fontFamily:SANS, fontSize:12, color:"var(--dust)", cursor:"pointer" }}>
                  {inPlayers.length} playing {showOuts ? "▴" : "▾"}</button>
              </div>
              {showOuts && (
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:5, marginBottom:10 }}>
                  {ROSTER.map(p => <PlayerChip key={p} name={p} small selected={!outs.includes(p)}
                    onClick={() => setOuts(o => o.includes(p) ? o.filter(x=>x!==p) : [...o,p])} />)}
                </div>
              )}
              <div style={{ display:"flex", flexDirection:"column", gap:6, marginBottom:10 }}>
                {methods.map(m => (
                  <button key={m.id} onClick={() => setMethod(m.id)} style={{ textAlign:"left", padding:"11px 13px",
                    cursor:"pointer", borderRadius:12,
                    background: method === m.id ? "rgba(192,91,51,0.1)" : "var(--panel2)",
                    border:"1px solid " + (method === m.id ? "var(--gold)" : "var(--line)") }}>
                    <span style={{ fontFamily:SANS, fontWeight:700, fontSize:14,
                      color: method === m.id ? "var(--accent2)" : "var(--cream)" }}>{m.name}</span>
                    <span style={{ fontFamily:SANS, fontSize:12.5, color:"var(--dust)" }}>  ·  {m.desc}</span>
                  </button>
                ))}
              </div>
              <Btn disabled={!method || inPlayers.length < 2} onClick={() => onDraw(method, inPlayers)} style={{ width:"100%", marginBottom:10 }}>
                Run the draw</Btn>
            </>
          )}
          {ev.teamCfg && draw && !res && (
            confirmRedraw
              ? <div style={{ display:"flex", gap:8, marginBottom:10 }}>
                  <Btn kind="danger" onClick={() => { onClearDraw(); setConfirmRedraw(false); }} style={{ flex:1 }}>Scrap the draw</Btn>
                  <Btn kind="ghost" onClick={() => setConfirmRedraw(false)} style={{ flex:1 }}>Keep it</Btn>
                </div>
              : <Btn kind="ghost" onClick={() => setConfirmRedraw(true)} style={{ width:"100%", marginBottom:10 }}>Redraw</Btn>
          )}

          {/* heats / pools setup */}
          {(canHeats || canPools) && !st && (
            !stageCfgOpen
              ? <Btn kind="dark" onClick={() => setStageCfgOpen(true)} style={{ width:"100%", marginBottom:10 }}>
                  {canHeats ? "Run heats" : "Set up pools"}</Btn>
              : (
                <div style={{ background:"var(--panel2)", border:"1px solid var(--line)", borderRadius:13,
                  padding:"12px 13px", marginBottom:10 }}>
                  {canHeats && (
                    <>
                      <div style={{ display:"flex", alignItems:"center", marginBottom:8 }}>
                        <div style={{ ...label, flex:1 }}>Heats</div>
                        <button onClick={() => setShowOuts(v => !v)} style={{ background:"none", border:"none",
                          fontFamily:SANS, fontSize:12, color:"var(--dust)", cursor:"pointer" }}>
                          {inPlayers.length} playing {showOuts ? "▴" : "▾"}</button>
                      </div>
                      {showOuts && (
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:5, marginBottom:10 }}>
                          {ROSTER.map(p => <PlayerChip key={p} name={p} small selected={!outs.includes(p)}
                            onClick={() => setOuts(o => o.includes(p) ? o.filter(x=>x!==p) : [...o,p])} />)}
                        </div>
                      )}
                    </>
                  )}
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                    <span style={{ ...label }}>{canHeats ? "Heats" : "Pools"}</span>
                    {[2,3,4].filter(n => n <= stageEntrantCount).map(n => (
                      <button key={n} onClick={() => setNGroups(n)} style={{ width:38, height:36, borderRadius:10,
                        cursor:"pointer", fontFamily:DISPLAY, fontWeight:700, fontSize:16,
                        background: groupsChoice===n ? GOLD_GRAD : "var(--panel)",
                        color: groupsChoice===n ? "var(--ink)" : "var(--muted2)",
                        border: groupsChoice===n ? "1px solid transparent" : "1px solid var(--line)" }}>{n}</button>
                    ))}
                    <span style={{ flex:1 }} />
                    <span style={{ ...label }}>Through</span>
                    {[1,2].map(n => (
                      <button key={n} onClick={() => setAdvance(n)} style={{ width:38, height:36, borderRadius:10,
                        cursor:"pointer", fontFamily:DISPLAY, fontWeight:700, fontSize:16,
                        background: advance===n ? GOLD_GRAD : "var(--panel)",
                        color: advance===n ? "var(--ink)" : "var(--muted2)",
                        border: advance===n ? "1px solid transparent" : "1px solid var(--line)" }}>{n}</button>
                    ))}
                  </div>
                  {canHeats && ev.sport && (
                    <div style={{ display:"flex", gap:6, marginBottom:10 }}>
                      {[["random","Blind"],["balanced","Balanced"]].map(([id,lb]) => (
                        <button key={id} onClick={() => setStageMethod(id)} style={{ flex:1, padding:"8px",
                          borderRadius:10, cursor:"pointer", fontFamily:SANS, fontWeight:600, fontSize:12.5,
                          background: stageMethod===id ? GOLD_GRAD : "var(--panel)",
                          color: stageMethod===id ? "var(--ink)" : "var(--cream)",
                          border: stageMethod===id ? "1px solid transparent" : "1px solid var(--line)" }}>{lb}</button>
                      ))}
                    </div>
                  )}
                  <div style={{ display:"flex", gap:8 }}>
                    <Btn onClick={() => onStages({ kind:stageKind, nGroups:groupsChoice, advance,
                      method:stageMethod, players:inPlayers })} style={{ flex:1 }}>
                      {canHeats ? "Draw heats" : "Draw pools"}</Btn>
                    <Btn kind="ghost" onClick={() => setStageCfgOpen(false)}>Cancel</Btn>
                  </div>
                </div>
              )
          )}
          {st && !res && (
            confirmScrap
              ? <div style={{ display:"flex", gap:8, marginBottom:10 }}>
                  <Btn kind="danger" onClick={() => { onClearStages(); setConfirmScrap(false); }} style={{ flex:1 }}>
                    Scrap {st.kind === "heats" ? "heats" : "pools"}, sure</Btn>
                  <Btn kind="ghost" onClick={() => setConfirmScrap(false)} style={{ flex:1 }}>Keep</Btn>
                </div>
              : <Btn kind="ghost" onClick={() => setConfirmScrap(true)} style={{ width:"100%", marginBottom:10 }}>
                  Scrap {st.kind === "heats" ? "heats" : "pools"}</Btn>
          )}

          <div style={{ display:"flex", gap:8, marginTop:6, flexWrap:"wrap" }}>
            <Btn onClick={enterResult} style={{ flex:1 }}>{res ? "Edit result" : "Post result"}</Btn>
            {!res && <Btn kind="dark" onClick={onDeckToggle}>{state.onDeck === ev.id ? "Close betting" : "Open betting"}</Btn>}
            {res && !confirmClear && <Btn kind="danger" onClick={() => setConfirmClear(true)}>Clear</Btn>}
            {res && confirmClear && <Btn kind="danger" onClick={clearRes}>Clear, sure</Btn>}
          </div>
          {editOpen ? (
            <div style={{ background:"var(--panel2)", border:"1px solid var(--line)", borderRadius:13,
              padding:"12px 13px", marginTop:8 }}>
              <div style={{ ...label, marginBottom:6 }}>Name</div>
              <input value={eName} onChange={e => setEName(e.target.value)} maxLength={28}
                style={{ width:"100%", background:"var(--panel)", border:"1px solid var(--line)", borderRadius:11,
                  padding:"11px 12px", color:"var(--cream)", fontFamily:SANS, fontWeight:600, fontSize:15, marginBottom:12, outline:"none" }} />
              <div style={{ ...label, marginBottom:6 }}>How it works</div>
              <textarea value={eDesc} onChange={e => setEDesc(e.target.value)} maxLength={300} rows={3}
                style={{ width:"100%", background:"var(--panel)", border:"1px solid var(--line)", borderRadius:11,
                  padding:"11px 12px", color:"var(--cream)", fontFamily:SANS, fontSize:14, lineHeight:1.5,
                  marginBottom:12, outline:"none", resize:"vertical" }} />
              <div style={{ ...label, marginBottom:6 }}>Worth</div>
              <div style={{ display:"flex", gap:8, marginBottom:12 }}>
                {[1,2,3,4,...(ev.value === 6 ? [6] : [])].map(v => (
                  <button key={v} onClick={() => setEValue(v)} style={{ flex:1, height:40, borderRadius:11, cursor:"pointer",
                    fontFamily:DISPLAY, fontWeight:700, fontSize:17,
                    background: eValue===v ? GOLD_GRAD : "var(--panel)",
                    color: eValue===v ? "var(--ink)" : "var(--muted2)",
                    border: eValue===v ? "1px solid transparent" : "1px solid var(--line)" }}>{v}</button>
                ))}
              </div>
              <div style={{ ...label, marginBottom:6 }}>When</div>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:14 }}>
                {[...SESSIONS.map(s => [s.id, s.label]), [null, "Extra"]].map(([id, lb]) => (
                  <button key={String(id)} onClick={() => setESession(id)} style={{ fontFamily:SANS, fontWeight:600,
                    fontSize:12.5, padding:"8px 11px", borderRadius:10, cursor:"pointer",
                    background: eSession===id ? GOLD_GRAD : "var(--panel)",
                    color: eSession===id ? "var(--ink)" : "var(--cream)",
                    border: eSession===id ? "1px solid transparent" : "1px solid var(--line)" }}>{lb}</button>
                ))}
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <Btn disabled={!eName.trim()} onClick={() => { onEdit({ name:eName, desc:eDesc, value:eValue, session:eSession }); setEditOpen(false); }}
                  style={{ flex:1 }}>Save</Btn>
                <Btn kind="ghost" onClick={() => setEditOpen(false)}>Cancel</Btn>
              </div>
            </div>
          ) : (
            <div style={{ display:"flex", gap:8, marginTop:8, flexWrap:"wrap" }}>
              <Btn kind="ghost" onClick={openEdit} style={{ flex:1 }}>Edit details</Btn>
              {!res && <Btn kind="ghost" onClick={() => onShelve(!shelvedNow)} style={{ flex:1 }}>{shelvedNow ? "Restore" : "Shelve"}</Btn>}
              {ev.custom && !confirmRemove && <Btn kind="danger" onClick={() => setConfirmRemove(true)}>Remove</Btn>}
              {ev.custom && confirmRemove && <Btn kind="danger" onClick={onRemove}>Confirm remove</Btn>}
            </div>
          )}
        </div>
      )}
      {!gm && br && !res && <Btn kind="dark" onClick={openBracket} style={{ width:"100%" }}>View bracket</Btn>}
    </Sheet>
  );
}

/* ─────────── add event ─────────── */
function AddEventSheet({ state, onClose, save }) {
  const [name, setName] = useState("");
  const [value, setValue] = useState(1);
  const [fmt, setFmt] = useState("solo");
  const [sess, setSess] = useState(null);
  const fmts = [
    { id:"solo", label:"Individual" },
    { id:"pairs", label:"Pairs" },
    { id:"t2", label:"2 teams" },
    { id:"t3", label:"3 teams" },
    { id:"t4", label:"4 teams" },
  ];
  const build = () => {
    const id = "c" + Date.now();
    const base = { id, custom:true, name:name.trim(), value, desc:"", ...(sess ? { session:sess } : {}) };
    if (fmt === "solo") return { ...base, kind:"solo" };
    if (fmt === "pairs") return { ...base, kind:"pairs", teamCfg:{ teams:6, size:2 } };
    const n = Number(fmt[1]);
    return { ...base, kind:"team", teamCfg:{ teams:n, size:Math.ceil(ROSTER.length/n) } };
  };
  return (
    <Sheet title="Add an event" onClose={onClose}>
      <div style={{ ...label, marginBottom:6 }}>Name</div>
      <input value={name} onChange={e => setName(e.target.value)} maxLength={28} placeholder="Bocce, poker, HORSE"
        style={{ width:"100%", background:"var(--panel2)", border:"1px solid var(--line)", borderRadius:12,
          padding:"12px 13px", color:"var(--cream)", fontFamily:SANS, fontWeight:600, fontSize:15, marginBottom:14, outline:"none" }} />
      <div style={{ ...label, marginBottom:6 }}>Worth</div>
      <div style={{ display:"flex", gap:8, marginBottom:14 }}>
        {[1,2,3,4].map(v => (
          <button key={v} onClick={() => setValue(v)} style={{ flex:1, height:44, borderRadius:12, cursor:"pointer",
            fontFamily:DISPLAY, fontWeight:700, fontSize:19,
            background: value===v ? GOLD_GRAD : "var(--panel2)",
            color: value===v ? "var(--ink)" : "var(--muted2)",
            border: value===v ? "1px solid transparent" : "1px solid var(--line)" }}>{v}</button>
        ))}
      </div>
      <div style={{ ...label, marginBottom:6 }}>When</div>
      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:14 }}>
        {[...SESSIONS.map(s => [s.id, s.label]), [null, "Extra"]].map(([id, lb]) => (
          <button key={String(id)} onClick={() => setSess(id)} style={{ fontFamily:SANS, fontWeight:600, fontSize:13,
            padding:"9px 12px", borderRadius:10, cursor:"pointer",
            background: sess===id ? GOLD_GRAD : "var(--panel2)",
            color: sess===id ? "var(--ink)" : "var(--cream)",
            border: sess===id ? "1px solid transparent" : "1px solid var(--line)" }}>{lb}</button>
        ))}
      </div>
      <div style={{ ...label, marginBottom:6 }}>Format</div>
      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:16 }}>
        {fmts.map(f => (
          <button key={f.id} onClick={() => setFmt(f.id)} style={{ fontFamily:SANS, fontWeight:600, fontSize:13,
            padding:"9px 12px", borderRadius:10, cursor:"pointer",
            background: fmt===f.id ? GOLD_GRAD : "var(--panel2)",
            color: fmt===f.id ? "var(--ink)" : "var(--cream)",
            border: fmt===f.id ? "1px solid transparent" : "1px solid var(--line)" }}>{f.label}</button>
        ))}
      </div>
      <Btn disabled={!name.trim()} onClick={() => save(build())} style={{ width:"100%", fontSize:15, padding:"14px" }}>
        Add to the slate</Btn>
    </Sheet>
  );
}

/* ─────────── bracket ─────────── */
function BracketGrid({ state, ev, gm, onPick, size="md" }) {
  const br = state.brackets[ev.id];
  const draw = state.draws[ev.id];
  if (!br || !draw) return null;
  const names = ROUND_NAMES[br.size] || [];
  const dims = {
    md: { col:200, av:24, f:13.5, pad:"9px 11px", lbl:11 },
    lg: { col:280, av:34, f:18,   pad:"13px 15px", lbl:14 },
  }[size];
  return (
    <div style={{ display:"flex", gap: size==="lg" ? 22 : 14, overflowX:"auto", paddingBottom:6,
      justifyContent: size==="lg" ? "center" : "flex-start" }}>
      {br.rounds.map((round, r) => (
        <div key={r} style={{ minWidth:dims.col, display:"flex", flexDirection:"column",
          justifyContent:"space-around", gap:12 }}>
          <div style={{ ...label, fontSize:dims.lbl, textAlign:"center" }}>{names[r]}</div>
          {round.map((match, m) => {
            const a = resolveSlot(br, match.a), b = resolveSlot(br, match.b);
            return (
              <div key={m} style={{ border:"1px solid var(--line)", borderRadius:13, overflow:"hidden",
                background:"var(--panel2)", boxShadow:"0 3px 12px rgba(0,0,0,0.3)" }}>
                {[a,b].map((tIdx, side) => {
                  const t = tIdx !== null ? draw.teams[tIdx] : null;
                  const isWinner = match.winner !== null && match.winner === tIdx;
                  const isLoser = match.winner !== null && match.winner !== tIdx && tIdx !== null;
                  return (
                    <button key={side} disabled={!gm || !onPick || tIdx === null || a === null || b === null}
                      onClick={() => onPick && onPick(r, m, tIdx)}
                      style={{ display:"flex", alignItems:"center", gap:8, width:"100%", textAlign:"left",
                        padding:dims.pad,
                        cursor: gm && onPick && tIdx !== null ? "pointer" : "default", border:"none",
                        borderBottom: side === 0 ? "1px solid var(--line)" : "none",
                        background: isWinner ? "rgba(192,91,51,0.16)" : "transparent",
                        opacity: isLoser ? 0.38 : 1 }}>
                      {t && <AvatarStack state={state} players={t.players} size={dims.av} max={3} />}
                      <div style={{ fontFamily:SANS, fontWeight:700, fontSize:dims.f,
                        color: isWinner ? "var(--accent2)" : t ? "var(--cream)" : "#AE9C80" }}>
                        {t ? teamLabel(state, t) : "TBD"}{isWinner && " ✓"}
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
function BracketSheet({ ev, state, gm, onClose, onPick }) {
  const br = state.brackets[ev.id];
  const draw = state.draws[ev.id];
  if (!br || !draw) return null;
  const champ = bracketChampion(br);
  return (
    <Sheet title={`${ev.name} bracket`} onClose={onClose} wide>
      {champ !== null && (
        <div style={{ textAlign:"center", marginBottom:14, padding:"12px", borderRadius:14,
          background:"rgba(192,91,51,0.1)", border:"1px solid rgba(192,91,51,0.4)" }}>
          <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:19, color:"var(--accent2)" }}>
            {teamLabel(state, draw.teams[champ])} take it</span>
        </div>
      )}
      <BracketGrid state={state} ev={ev} gm={gm} onPick={onPick} />
      {gm && <div style={{ fontFamily:SANS, fontSize:12.5, color:"var(--dust)", marginTop:10 }}>
        Tap the winner of each matchup to advance them. Matchup wagers settle as you go.</div>}
    </Sheet>
  );
}

/* ─────────── result entry (GM, real names) ─────────── */
function ResultSheet({ ev, state, onClose, save }) {
  const existing = state.results[ev.id];
  const table = AWARDS[ev.value];
  const slotIdxs = table.map((v,i) => v>0 ? i : null).filter(i => i !== null);
  const initial = useMemo(() => {
    if (existing?.slots) return existing.slots.map(s => [...(s||[])]);
    const br = state.brackets[ev.id], draw = state.draws[ev.id], st = state.stages[ev.id];
    if (br && draw) {
      const champ = bracketChampion(br);
      if (champ !== null) {
        const final = br.rounds[br.rounds.length-1][0];
        const a = resolveSlot(br, final.a), b = resolveSlot(br, final.b);
        const runner = champ === a ? b : a;
        return [[...draw.teams[champ].players],
          table[1] > 0 && runner !== null ? [...draw.teams[runner].players] : [], []];
      }
    }
    if (st && st.finalWinner !== null && st.finalWinner !== undefined) {
      const v = stageEntrantView(state, st, st.finalWinner);
      return [[...v.players], [], []];
    }
    return [[],[],[]];
  }, []); // eslint-disable-line
  const [slots, setSlots] = useState(initial);
  const [active, setActive] = useState(0);
  const [byPlayer, setByPlayer] = useState(false);
  const draw = state.draws[ev.id];
  const teamMode = !!draw?.teams?.length && ev.kind !== "solo" && !byPlayer;
  const taken = p => slots.findIndex(s => s.includes(p));
  const toggle = p => setSlots(prev => {
    const nx = prev.map(s => [...s]);
    const w = nx.findIndex(s => s.includes(p));
    if (w === active) nx[active] = nx[active].filter(x => x !== p);
    else { if (w >= 0) nx[w] = nx[w].filter(x => x !== p); nx[active].push(p); }
    return nx;
  });
  const teamSlot = t => slots.findIndex(s => t.players.length && t.players.every(p => s.includes(p)));
  const toggleTeam = t => setSlots(prev => {
    const was = prev.findIndex(s => t.players.length && t.players.every(p => s.includes(p)));
    const nx = prev.map(s => s.filter(p => !t.players.includes(p)));
    if (was !== active) nx[active] = [...nx[active], ...t.players];
    return nx;
  });
  return (
    <Sheet title={`Result · ${ev.name}`} onClose={onClose}>
      <div style={{ display:"flex", gap:8, marginBottom:14 }}>
        {slotIdxs.map(i => (
          <button key={i} onClick={() => setActive(i)} style={{ flex:1, padding:"10px 6px", cursor:"pointer",
            borderRadius:12, border:"1px solid " + (active===i ? "var(--gold)" : "var(--line)"),
            background: active===i ? "rgba(192,91,51,0.1)" : "var(--panel2)" }}>
            <div style={{ fontFamily:SANS, fontWeight:700, fontSize:14, color:SLOT_META[i].color }}>
              {ev.kind==="solo" ? SLOT_META[i].label : SLOT_META[i].team}</div>
            <div style={{ fontFamily:SANS, fontSize:11.5, color:"var(--dust)" }}>+{table[i]} each · {slots[i].length} in</div>
          </button>
        ))}
      </div>
      {teamMode ? (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:10 }}>
          {draw.teams.map((t, i) => {
            const w = teamSlot(t);
            return (
              <button key={i} onClick={() => toggleTeam(t)} style={{ display:"flex", alignItems:"center", gap:8,
                padding:"10px 11px", borderRadius:12, cursor:"pointer", textAlign:"left",
                background: w === active ? GOLD_GRAD : "var(--panel2)",
                border: w === active ? "1px solid transparent" : "1px solid var(--line)" }}>
                <AvatarStack state={state} players={t.players} size={22} max={3} />
                <span style={{ flex:1, fontFamily:SANS, fontWeight:600, fontSize:13, minWidth:0,
                  overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                  color: w === active ? "var(--ink)" : "var(--cream)" }}>{teamLabel(state, t)}</span>
                {w >= 0 && w !== active && <span style={{ fontFamily:SANS, fontWeight:700, fontSize:11,
                  color:SLOT_META[w].color, flexShrink:0 }}>{SLOT_META[w].label}</span>}
              </button>
            );
          })}
        </div>
      ) : (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:10 }}>
          {ROSTER.map(p => {
            const w = taken(p);
            return <PlayerChip key={p} name={w>=0 && w!==active ? `${p} · ${SLOT_META[w].label}` : p}
              selected={w===active} onClick={() => toggle(p)} small />;
          })}
        </div>
      )}
      {!!draw?.teams?.length && ev.kind !== "solo" && (
        <button onClick={() => setByPlayer(v => !v)} style={{ background:"none", border:"none", cursor:"pointer",
          fontFamily:SANS, fontSize:12.5, color:"var(--dust)", padding:"0 0 14px", display:"block" }}>
          {byPlayer ? "Back to teams" : "Pick player by player instead"}</button>
      )}
      <Btn disabled={slots[0].length===0} onClick={() => save(slots)} style={{ width:"100%", fontSize:15, padding:"14px", marginTop:4 }}>
        Post result</Btn>
    </Sheet>
  );
}

/* ─────────── wagers ─────────── */
function wagerPickLabel(state, w, events) {
  const ev = events.find(e => e.id === w.eventId);
  const evName = ev?.name || "removed event";
  const pickName = w.pickTeam || w.pickPlayers?.length > 1
    ? teamLabel(state, { players: w.pickPlayers })
    : disp(state, w.pickPlayers ? w.pickPlayers[0] : w.pick);
  if (w.kind === "outright") return { pick: pickName, ctx: `to win ${evName}` };
  if (w.kind === "match") return { pick: pickName, ctx: `to win the ${w.matchName || "matchup"} · ${evName}` };
  if (w.final) return { pick: pickName, ctx: `to win the Final · ${evName}` };
  return { pick: pickName, ctx: `to advance from ${w.groupName} · ${evName}` };
}

function Wagers({ state, me, standings, gm, events, onDeckEv, onPick, onVoid }) {
  const wagers = state.wagers || [];
  const resolved = wagers.map(w => ({ w, r: resolveWager(state, w, events) }));
  const pending = resolved.filter(x => x.r.status === "pending");
  const settled = resolved.filter(x => x.r.status !== "pending").slice(0, 40);
  const myExp = me ? atRisk(state, me, events) : 0;
  const myPts = standings.find(r => r.player === me)?.pts ?? 0;
  const room = me ? Math.max(0, Math.min(3 - myExp, myPts - myExp)) : 0;

  const ev = onDeckEv;
  const draw = ev ? state.draws[ev.id] : null;
  const br = ev ? state.brackets[ev.id] : null;
  const st = ev ? state.stages[ev.id] : null;

  /* outright candidates */
  let outrights = [];
  if (ev) {
    if (ev.kind === "solo") outrights = ROSTER.map(p => ({
      key:p, players:[p], name: disp(state, p),
      pick: { kind:"outright", eventId:ev.id, pick:p, pickPlayers:[p], pickTeam:false, evName:ev.name },
    }));
    else if (draw) outrights = draw.teams.map((t,i) => ({
      key:"t"+i, players:t.players, name: teamLabel(state, t),
      pick: { kind:"outright", eventId:ev.id, pickTeam:true, pickPlayers:[...t.players], drawId:draw.id, evName:ev.name },
    }));
  }
  const bigTeams = outrights.length > 0 && outrights[0].players.length >= 3;

  /* open bracket matchups */
  let matchups = [];
  if (ev && br && draw) {
    const names = ROUND_NAMES[br.size] || [];
    br.rounds.forEach((round, r) => round.forEach((match, m) => {
      const a = resolveSlot(br, match.a), b = resolveSlot(br, match.b);
      if (a !== null && b !== null && (match.winner === null || match.winner === undefined)) {
        matchups.push({ r, m, a, b, roundName: names[r] });
      }
    }));
  }

  /* open stage groups + final */
  let stageGroups = [], stageFinal = null;
  if (ev && st) {
    st.groups.forEach((g, gi) => {
      if ((g.through || []).length < st.advance) {
        const open = g.entrants.filter(k => !(g.through || []).includes(k));
        if (open.length > 1) stageGroups.push({ gi, name:g.name, entrants:open });
      }
    });
    const finalists = stageFinalists(st);
    if (finalists && (st.finalWinner === null || st.finalWinner === undefined)) stageFinal = finalists;
  }

  /* my open stake per pick, so multiple picks per event read clearly */
  const myStakeOn = pred => pending
    .filter(x => x.w.player === me && pred(x.w))
    .reduce((s,x) => s + x.w.stake, 0);

  const PickRow = ({ players, name, onClick, wide, mine }) => (
    <button disabled={room < 1} onClick={onClick}
      style={{ display:"flex", alignItems:"center", gap:8, padding: wide ? "10px 12px" : "8px 10px",
        borderRadius:12, width:"100%",
        background:"var(--panel2)",
        border:"1px solid " + (mine > 0 ? "rgba(192,91,51,0.55)" : "var(--line)"),
        cursor: room < 1 ? "default" : "pointer",
        opacity: room < 1 ? 0.5 : 1, textAlign:"left" }}>
      <AvatarStack state={state} players={players} size={wide ? 28 : 24} max={wide ? 5 : 3} />
      <span style={{ fontFamily:SANS, fontWeight:600, fontSize: wide ? 14 : 12.5, color:"var(--cream)",
        overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1 }}>{name}</span>
      {mine > 0 && <span style={{ fontFamily:SANS, fontWeight:700, fontSize:10.5, letterSpacing:"0.08em",
        padding:"3px 7px", borderRadius:99, background:"rgba(192,91,51,0.16)", color:"var(--accent2)",
        textTransform:"uppercase", flexShrink:0 }}>You: {mine}</span>}
    </button>
  );

  const Row = ({ x }) => {
    const { w, r } = x;
    const l = wagerPickLabel(state, w, events);
    const win = w.kind === "outright" ? OUTRIGHT_MULT * w.stake : w.stake;
    return (
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 13px",
        borderRadius:14, background: r.status === "pending" ? CARD_BG : "var(--paper2)",
        border:"1px solid " + (r.status === "pending" ? "var(--line)" : "var(--line)"), marginBottom:7 }}>
        <Avatar state={state} p={w.player} size={30} />
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontFamily:SANS, fontWeight:600, fontSize:13.5, color:"var(--cream)" }}>
            <b>{disp(state, w.player)}</b> · {w.stake} on <b style={{ color:"var(--accent2)" }}>{l.pick}</b>
          </div>
          <div style={{ fontFamily:SANS, fontSize:12, color:"var(--dust)" }}>{l.ctx}</div>
        </div>
        {r.status === "pending" && <span style={{ fontFamily:SANS, fontSize:12, color:"var(--dust)" }}>to win +{win}</span>}
        {r.status === "won" && <span style={{ fontFamily:SANS, fontWeight:700, fontSize:13, color:"var(--green)" }}>+{r.delta}</span>}
        {r.status === "lost" && <span style={{ fontFamily:SANS, fontWeight:700, fontSize:13, color:"var(--clay)" }}>{r.delta}</span>}
        {r.status === "void" && <span style={{ fontFamily:SANS, fontWeight:700, fontSize:11, color:"var(--muted)" }}>VOID</span>}
        {gm && r.status === "pending" && (
          <button onClick={() => onVoid(w.id)} style={{ background:"none", border:"1px solid rgba(188,75,60,0.4)",
            borderRadius:8, color:"var(--clay)", fontFamily:SANS, fontWeight:700, fontSize:10.5, padding:"4px 8px",
            cursor:"pointer", textTransform:"uppercase" }}>Void</button>
        )}
      </div>
    );
  };

  return (
    <div style={{ padding:"0 16px" }}>
      {me && (
        <div style={{ display:"flex", alignItems:"center", gap:12, background:CARD_BG,
          border:"1px solid var(--line)", borderRadius:15, padding:"12px 14px", marginBottom:12 }}>
          <Avatar state={state} p={me} size={34} />
          <div style={{ flex:1 }}>
            <div style={{ fontFamily:SANS, fontWeight:700, fontSize:14, color:"var(--cream)" }}>{disp(state, me)}</div>
            <div style={{ fontFamily:SANS, fontSize:12.5, color:"var(--dust)" }}>{myPts} banked · {myExp} of 3 at risk</div>
          </div>
          <div style={{ display:"flex", gap:5 }}>
            {[1,2,3].map(i => <div key={i} style={{ width:12, height:20, borderRadius:4,
              background: i<=myExp ? EMBER_GRAD : "var(--panel2)", border:"1px solid var(--line)" }} />)}
          </div>
        </div>
      )}

      {!ev && !state.frozen && (
        <div style={{ textAlign:"center", padding:"22px 20px", color:"var(--muted)", fontFamily:SANS, fontSize:14, lineHeight:1.6 }}>
          Betting is closed.<br/>When Brandon opens the next event, it shows up here.
        </div>
      )}
      {state.frozen && (
        <div style={{ textAlign:"center", padding:"22px 20px", color:"var(--muted)", fontFamily:SANS, fontSize:14 }}>
          The board is frozen. All wagers are settled.
        </div>
      )}

      {ev && (
        <div style={{ borderRadius:16, border:"1px solid rgba(192,91,51,0.4)",
          background:"linear-gradient(180deg, rgba(192,91,51,0.06), transparent), var(--panel)",
          padding:"14px 14px 10px", marginBottom:16 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
            <span style={{ width:7, height:7, borderRadius:99, background:"var(--live2)", animation:"si-pulse 1.6s infinite" }} />
            <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:18, color:"var(--cream)", flex:1 }}>{ev.name}</span>
            <Tag tone="gold">Betting open</Tag>
          </div>

          {outrights.length > 0 && (
            <>
              <div style={{ display:"flex", alignItems:"baseline", gap:8, marginBottom:8 }}>
                <span style={{ ...label }}>Winner</span>
                <span style={{ fontFamily:SANS, fontSize:11.5, color:"var(--dust)" }}>pays 2 to 1</span>
              </div>
              <div style={{ display: bigTeams ? "flex" : "grid", flexDirection:"column",
                gridTemplateColumns:"1fr 1fr", gap:6, marginBottom:12 }}>
                {outrights.map(o => (
                  <PickRow key={o.key} players={o.players} name={o.name} wide={bigTeams}
                    mine={myStakeOn(w => w.kind === "outright" && w.eventId === ev.id &&
                      (o.pick.pickTeam
                        ? w.pickTeam && w.drawId === o.pick.drawId && (w.pickPlayers||[]).join("|") === o.pick.pickPlayers.join("|")
                        : !w.pickTeam && w.pick === o.key))}
                    onClick={() => onPick(o.pick)} />
                ))}
              </div>
            </>
          )}
          {ev.kind !== "solo" && !draw && (
            <div style={{ fontFamily:SANS, fontSize:13, color:"var(--dust)", marginBottom:10 }}>
              Winner betting opens after the draw.
            </div>
          )}

          {stageGroups.length > 0 && (
            <>
              <div style={{ display:"flex", alignItems:"baseline", gap:8, marginBottom:8 }}>
                <span style={{ ...label }}>Advancing</span>
                <span style={{ fontFamily:SANS, fontSize:11.5, color:"var(--dust)" }}>pays even</span>
              </div>
              {stageGroups.map(g => (
                <div key={g.gi} style={{ marginBottom:10 }}>
                  <div style={{ fontFamily:SANS, fontSize:10.5, color:"var(--dust)", textTransform:"uppercase",
                    letterSpacing:"0.12em", marginBottom:4 }}>{g.name}</div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
                    {g.entrants.map(k => {
                      const v = stageEntrantView(state, st, k);
                      return <PickRow key={String(k)} players={v.players} name={v.name}
                        mine={myStakeOn(w => w.kind === "stage" && w.stagesId === st.id && !w.final &&
                          w.group === g.gi && w.pickKey === k)}
                        onClick={() => onPick({ kind:"stage", eventId:ev.id, stagesId:st.id, group:g.gi,
                          groupName:g.name, pickKey:k, pickPlayers:[...v.players],
                          pickTeam: st.entrantType === "team", evName:ev.name })} />;
                    })}
                  </div>
                </div>
              ))}
            </>
          )}

          {stageFinal && (
            <>
              <div style={{ display:"flex", alignItems:"baseline", gap:8, marginBottom:8 }}>
                <span style={{ ...label }}>The Final</span>
                <span style={{ fontFamily:SANS, fontSize:11.5, color:"var(--dust)" }}>pays even</span>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginBottom:12 }}>
                {stageFinal.map(k => {
                  const v = stageEntrantView(state, st, k);
                  return <PickRow key={String(k)} players={v.players} name={v.name}
                    mine={myStakeOn(w => w.kind === "stage" && w.stagesId === st.id && w.final && w.pickKey === k)}
                    onClick={() => onPick({ kind:"stage", eventId:ev.id, stagesId:st.id, final:true,
                      pickKey:k, pickPlayers:[...v.players], pickTeam: st.entrantType === "team", evName:ev.name })} />;
                })}
              </div>
            </>
          )}

          {matchups.length > 0 && (
            <>
              <div style={{ display:"flex", alignItems:"baseline", gap:8, marginBottom:8 }}>
                <span style={{ ...label }}>Matchups</span>
                <span style={{ fontFamily:SANS, fontSize:11.5, color:"var(--dust)" }}>pay even</span>
              </div>
              {matchups.map(mu => (
                <div key={`${mu.r}-${mu.m}`} style={{ marginBottom:8 }}>
                  <div style={{ fontFamily:SANS, fontSize:10.5, color:"var(--dust)", textTransform:"uppercase",
                    letterSpacing:"0.12em", marginBottom:4 }}>{mu.roundName}</div>
                  <div style={{ display:"flex", gap:6, alignItems:"stretch" }}>
                    {[mu.a, mu.b].map((tIdx, side) => {
                      const t = draw.teams[tIdx];
                      return (
                        <div key={side} style={{ flex:1 }}>
                          <PickRow players={t.players} name={teamLabel(state, t)}
                            mine={myStakeOn(w => w.kind === "match" && w.eventId === ev.id &&
                              w.drawId === draw.id && w.match?.[0] === mu.r && w.match?.[1] === mu.m &&
                              w.teamIdx === tIdx)}
                            onClick={() => onPick({ kind:"match", eventId:ev.id, teamIdx:tIdx,
                              pickPlayers:[...t.players], pickTeam:true, drawId:draw.id, match:[mu.r, mu.m],
                              matchName: mu.roundName, evName: ev.name })} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </>
          )}
          {me && room < 1 && <div style={{ fontFamily:SANS, fontSize:12.5, color:"var(--clay)", padding:"2px 0 6px" }}>
            You are maxed out until a wager settles.</div>}
        </div>
      )}

      {pending.length > 0 && <div style={{ ...label, margin:"4px 2px 8px" }}>Open</div>}
      {pending.map(x => <Row key={x.w.id} x={x} />)}
      {settled.length > 0 && <div style={{ ...label, margin:"14px 2px 8px" }}>Settled</div>}
      {settled.map(x => <Row key={x.w.id} x={x} />)}
    </div>
  );
}

function PlaceWagerSheet({ state, me, standings, events, pick, onClose, place }) {
  const [stake, setStake] = useState(1);
  const myPts = standings.find(r => r.player === me)?.pts ?? 0;
  const myExp = atRisk(state, me, events);
  const maxStake = Math.max(0, Math.min(3 - myExp, myPts - myExp, 3));
  const mult = pick.kind === "outright" ? OUTRIGHT_MULT : 1;
  const pickName = pick.pickPlayers.length > 1
    ? teamLabel(state, { players: pick.pickPlayers }) : disp(state, pick.pickPlayers[0]);
  const ctx = pick.kind === "outright" ? `to win ${pick.evName}`
    : pick.kind === "match" ? `to win the ${pick.matchName} · ${pick.evName}`
    : pick.final ? `to win the Final · ${pick.evName}`
    : `to advance from ${pick.groupName} · ${pick.evName}`;
  const self = pick.pickPlayers.includes(me);
  return (
    <Sheet title="Place a wager" onClose={onClose}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
        <AvatarStack state={state} players={pick.pickPlayers} size={40} max={4} />
        <div>
          <div style={{ fontFamily:SANS, fontWeight:700, fontSize:16, color:"var(--cream)" }}>
            {pickName}{self ? " (you)" : ""}</div>
          <div style={{ fontFamily:SANS, fontSize:12.5, color:"var(--dust)" }}>{ctx}</div>
        </div>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:10, margin:"16px 0 8px" }}>
        <div style={label}>Stake</div>
        {[1,2,3].map(v => (
          <button key={v} onClick={() => setStake(v)} disabled={v > maxStake}
            style={{ width:46, height:42, borderRadius:12, cursor: v > maxStake ? "default" : "pointer",
            fontFamily:DISPLAY, fontWeight:700, fontSize:19, opacity: v > maxStake ? 0.35 : 1,
            background: stake===v ? GOLD_GRAD : "var(--panel2)",
            color: stake===v ? "var(--ink)" : "var(--muted2)",
            border: stake===v ? "1px solid transparent" : "1px solid var(--line)" }}>{v}</button>
        ))}
        <div style={{ fontFamily:SANS, fontSize:13, color:"var(--dust)", marginLeft:"auto" }}>
          wins <b style={{ color:"var(--green)" }}>+{mult*stake}</b> · loses <b style={{ color:"var(--clay)" }}>−{stake}</b>
        </div>
      </div>
      <div style={{ fontFamily:SANS, fontSize:12, color:"var(--muted)", marginBottom:14 }}>
        Settles automatically off the official result. {maxStake < 1 ? "You are maxed out." : ""}
      </div>
      <Btn disabled={maxStake < 1 || stake > maxStake} onClick={() => place({ ...pick, stake, status:"open" })}
        style={{ width:"100%", fontSize:15, padding:"14px" }}>Place it</Btn>
    </Sheet>
  );
}

/* ─────────── QA bar (GM only, real names) ─────────── */
function QABar({ me, onSwitch, onReset, onRerun, onExit }) {
  const [confirm, setConfirm] = useState(false);
  const small = { fontFamily:SANS, fontWeight:700, fontSize:11, letterSpacing:"0.08em",
    textTransform:"uppercase", padding:"6px 10px", borderRadius:9, cursor:"pointer", flexShrink:0 };
  return (
    <div style={{ position:"fixed", bottom:"calc(66px + env(safe-area-inset-bottom))", left:0, right:0,
      display:"flex", justifyContent:"center", zIndex:55, pointerEvents:"none" }}>
      <div style={{ width:"calc(100% - 20px)", maxWidth:520, pointerEvents:"auto",
        background:"rgba(42,33,25,0.97)", border:"1px solid rgba(192,91,51,0.4)", borderRadius:14,
        padding:"8px 10px", boxShadow:"0 10px 30px rgba(0,0,0,0.5)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:7 }}>
          <span style={{ ...label, fontSize:10, color:"var(--sun)" }}>QA</span>
          <span style={{ fontFamily:SANS, fontSize:12, color:"#C9B896", flex:1, minWidth:0,
            overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            Acting as <b style={{ color:"#FBF3E4" }}>{me || "nobody"}</b></span>
          {confirm ? (
            <>
              <button onClick={() => { onReset(); setConfirm(false); }} style={{ ...small,
                background:"#D64A20", border:"none", color:"#FFF4EC" }}>Confirm reset</button>
              <button onClick={() => setConfirm(false)} style={{ ...small,
                background:"var(--panel2)", border:"1px solid var(--line)", color:"var(--cream)" }}>Keep</button>
            </>
          ) : (
            <>
              <button onClick={onRerun} style={{ ...small,
                background:"var(--panel2)", border:"1px solid var(--line)", color:"var(--cream)" }}>Rerun intro</button>
              <button onClick={() => setConfirm(true)} style={{ ...small,
                background:"none", border:"1px solid rgba(188,75,60,0.4)", color:"var(--clay)" }}>Reset game</button>
            </>
          )}
          <button onClick={onExit} style={{ background:"var(--panel2)", border:"1px solid var(--line)",
            color:"var(--dust)", width:26, height:26, borderRadius:8, fontSize:11, cursor:"pointer", flexShrink:0 }}>✕</button>
        </div>
        <div style={{ display:"flex", gap:6, overflowX:"auto" }}>
          {ROSTER.map(p => (
            <button key={p} onClick={() => onSwitch(p)} style={{ fontFamily:SANS, fontWeight:600,
              fontSize:12, padding:"6px 11px", borderRadius:99, cursor:"pointer", flexShrink:0,
              background: me === p ? GOLD_GRAD : "var(--panel2)",
              color: me === p ? "var(--ink)" : "var(--cream)",
              border: me === p ? "1px solid transparent" : "1px solid var(--line)" }}>{p}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────── GM sheets ─────────── */
function AdjustSheet({ player, onClose, save }) {
  const [delta, setDelta] = useState(1);
  const [reason, setReason] = useState("");
  return (
    <Sheet title={`Ruling · ${player}`} onClose={onClose}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:16, marginBottom:16 }}>
        <Btn kind="dark" onClick={() => setDelta(d => d - 1)} style={{ fontSize:20, width:54 }}>−</Btn>
        <div style={{ fontFamily:DISPLAY, fontWeight:800, fontSize:46, width:84, textAlign:"center",
          color: delta >= 0 ? "var(--green)" : "var(--clay)" }}>{delta>0?"+":""}{delta}</div>
        <Btn kind="dark" onClick={() => setDelta(d => d + 1)} style={{ fontSize:20, width:54 }}>+</Btn>
      </div>
      <input value={reason} onChange={e => setReason(e.target.value)} maxLength={50}
        placeholder="Reason, e.g. pressure putt"
        style={{ width:"100%", background:"var(--panel2)", border:"1px solid var(--line)", borderRadius:12,
          padding:"12px 13px", color:"var(--cream)", fontFamily:SANS, fontSize:14, marginBottom:14, outline:"none" }} />
      <Btn disabled={delta === 0} onClick={() => save(delta, reason.trim())} style={{ width:"100%", fontSize:15, padding:"14px" }}>Apply</Btn>
    </Sheet>
  );
}
function PinSheet({ onClose, unlock }) {
  const [pin, setPin] = useState("");
  return (
    <Sheet title="Commissioner" onClose={onClose}>
      <input value={pin} onChange={e => setPin(e.target.value.replace(/\D/g,"").slice(0,4))}
        inputMode="numeric" placeholder="Passcode" autoFocus
        onKeyDown={e => e.key === "Enter" && unlock(pin)}
        style={{ width:"100%", background:"var(--panel2)", border:"1px solid var(--line)", borderRadius:12,
          padding:"13px 12px", color:"var(--cream)", fontFamily:DISPLAY, fontSize:26,
          letterSpacing:"0.4em", textAlign:"center", marginBottom:12, outline:"none" }} />
      <Btn disabled={pin.length !== 4} onClick={() => unlock(pin)} style={{ width:"100%", fontSize:15, padding:"14px" }}>Unlock</Btn>
    </Sheet>
  );
}
function ProfileSheet({ state, me, onClose, save }) {
  const [display, setDisplay] = useState(state.profiles?.[me]?.display || me || "");
  const [photo, setPhoto] = useState(null);
  if (!me) return null;
  return (
    <Sheet title="Your profile" onClose={onClose}>
      <div style={{ border:"1.5px solid var(--ink)", borderRadius:10, overflow:"hidden", marginBottom:16 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, background:playerColor(me), color:BONE,
          padding:"7px 12px" }}>
          <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:16, letterSpacing:"0.05em",
            textTransform:"uppercase", flex:1 }}>Field Day · Player credential</span>
          <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:16 }}>NO. {String(playerNo(me)).padStart(2,"0")}</span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 12px", background:"var(--paper2)" }}>
          <Avatar state={state} p={me} size={40} />
          <div>
            <div style={{ fontFamily:SANS, fontWeight:700, fontSize:15, color:"var(--ink)" }}>{disp(state, me)}</div>
            <div style={{ fontFamily:SANS, fontSize:11.5, color:"var(--muted)" }}>Scottsdale · 2026</div>
          </div>
        </div>
      </div>
      <ProfileEditor state={state} me={me} display={display} setDisplay={setDisplay} photo={photo} setPhoto={setPhoto} />
      <Btn disabled={!display.trim()} onClick={() => save({ display: display.trim(), ...(photo ? {photo} : {}) })}
        style={{ width:"100%", fontSize:15, padding:"14px", marginTop:16 }}>Save</Btn>
    </Sheet>
  );
}

/* ─────────── reveal (draws, heats, pools) ─────────── */
function Reveal({ state, reveal, big, onClose, onBets }) {
  const items = reveal.versus ? 2 : reveal.groups.length;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (shown >= items) return;
    const t = setTimeout(() => setShown(s => s + 1), shown === 0 ? 900 : 1300);
    return () => clearTimeout(t);
  }, [shown, items]);
  const doneAll = shown >= items;
  return (
    <div style={{ position:"fixed", inset:0, zIndex:300, background:"rgba(32,24,17,0.97)",
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
      padding:"calc(30px + env(safe-area-inset-top)) 20px calc(30px + env(safe-area-inset-bottom))",
      overflowY:"auto" }}>
      <div style={{ ...label, fontSize: big ? 15 : 11, color:"var(--sun)", animation:"si-in .4s both" }}>{reveal.title}</div>
      <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize: big ? 64 : 36, color:BONE, textTransform:"uppercase",
        lineHeight:0.95, marginBottom: big ? 28 : 20, animation:"si-in .4s .1s both", textAlign:"center" }}>{reveal.subtitle}</div>

      {reveal.versus ? (
        <div style={{ width:"100%", maxWidth: big ? 900 : 470,
          visibility: shown > 0 ? "visible" : "hidden",
          animation: shown > 0 ? "si-flag .55s both" : "none" }}>
          <VersusDraw state={state} teams={reveal.versus} size={big ? "lg" : "md"} />
        </div>
      ) : (
        <div style={{ display:"grid", gap: big ? 16 : 10, width:"100%", maxWidth: big ? 1100 : 460,
          gridTemplateColumns: big ? `repeat(${Math.min(items,3)}, 1fr)` : items > 3 ? "1fr 1fr" : "1fr" }}>
          {reveal.groups.map((g, i) => (
            <div key={i} style={{ visibility: i < shown ? "visible" : "hidden",
              animation: i < shown ? "si-flag .55s both" : "none",
              background:CARD_BG, border:"1px solid rgba(156,69,38,0.45)", borderRadius:16,
              padding: big ? "18px 20px" : "14px 15px", boxShadow:"0 8px 30px rgba(0,0,0,0.4)" }}>
              <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize: big ? 26 : 16,
                color:"var(--accent2)", marginBottom:8 }}>{g.title}</div>
              {g.lines.map((ln, j) => (
                <div key={j} style={{ display:"flex", alignItems:"center", gap:9, padding:"3px 0",
                  animation: i < shown ? `si-in .3s ${0.25 + j*0.15}s both` : "none" }}>
                  <AvatarStack state={state} players={ln.avatars} size={big ? 34 : 26} max={3} />
                  <span style={{ fontFamily:SANS, fontWeight:600, fontSize: big ? 20 : 14.5, color:"var(--cream)" }}>
                    {ln.text}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      {doneAll && (
        <div style={{ display:"flex", gap:10, marginTop: big ? 30 : 22, animation:"si-in .3s both" }}>
          {onBets && <Btn onClick={onBets} style={{ fontSize:15, padding:"13px 28px" }}>To the bets</Btn>}
          <Btn kind={onBets ? "ghost" : "primary"} onClick={onClose} style={{ fontSize:15, padding:"13px 28px" }}>Close</Btn>
        </div>
      )}
      {!doneAll && <button onClick={() => setShown(items)} style={{ marginTop:20, background:"none",
        border:"none", color:"#B7A386", fontFamily:SANS, fontSize:13, cursor:"pointer" }}>skip</button>}
    </div>
  );
}

/* ─────────── TV mode ─────────── */
function TVMode({ standings, state, events, onDeckEv, allTied, champion, coChamps, onExit }) {
  const liveBracketEv = useMemo(() => {
    const c = events.filter(e => state.brackets[e.id] && state.draws[e.id] && !state.results[e.id]);
    if (onDeckEv && c.find(e => e.id === onDeckEv.id)) return onDeckEv;
    return c[0] || null;
  }, [events, state, onDeckEv]);
  const liveStageEv = useMemo(() => {
    const c = events.filter(e => state.stages[e.id] && !state.results[e.id]);
    if (onDeckEv && c.find(e => e.id === onDeckEv.id)) return onDeckEv;
    return c[0] || null;
  }, [events, state, onDeckEv]);
  const scenes = useMemo(() => {
    const s = ["board"];
    if (!champion && liveBracketEv) s.push("bracket");
    if (!champion && liveStageEv) s.push("stages");
    return s;
  }, [liveBracketEv, liveStageEv, champion]);
  const [sceneIdx, setSceneIdx] = useState(0);
  useEffect(() => { setSceneIdx(0); }, [scenes.length]);
  useEffect(() => {
    if (scenes.length < 2) return;
    const t = setInterval(() => setSceneIdx(i => (i + 1) % scenes.length), 14000);
    return () => clearInterval(t);
  }, [scenes.length]);
  const scene = scenes[sceneIdx] || "board";

  const results = Object.entries(state.results || {}).map(([eid, r]) => {
    const ev = events.find(e => e.id === eid);
    return ev && r.slots?.[0]?.length ? `${ev.name}: ${r.slots[0].map(p => disp(state,p)).join(" + ")}` : null;
  }).filter(Boolean);
  const allW = (state.wagers||[]).map(w => ({ w, r: resolveWager(state, w, events) }));
  const tickerWagers = allW.filter(x => x.r.status === "pending").slice(0,8).map(x => {
    const l = wagerPickLabel(state, x.w, events);
    return `${disp(state, x.w.player)}: ${x.w.stake} on ${l.pick}`;
  });
  const cashes = allW.filter(x => x.r.status === "won").slice(0,5)
    .map(x => `${disp(state, x.w.player)} cashed +${x.r.delta}`);
  const rulings = (state.adjustments||[]).slice(0,4).map(a => `Ruling: ${disp(state,a.player)} ${a.delta>0?"+":""}${a.delta}${a.reason ? " · " + a.reason : ""}`);
  let ticker = [...tickerWagers, ...results, ...cashes, ...rulings];
  if (ticker.length === 0) ticker = ["Field Day", "13 players · one board", "Champion crowned Saturday night"];
  const tickerStr = ticker.join("   ✦   ");

  const leader = !allTied ? standings[0] : null;
  const rest = leader ? standings.slice(1) : standings;
  const half = Math.ceil(rest.length / 2);

  return (
    <div style={{ position:"fixed", inset:0, display:"flex", flexDirection:"column", zIndex:60,
      background:"radial-gradient(110% 60% at 50% -10%, rgba(233,180,65,0.10) 0%, transparent 60%), var(--night)" }}>
      <button onClick={onExit} style={{ position:"absolute", top:"calc(16px + env(safe-area-inset-top))", right:16, zIndex:70,
        background:"var(--panel)", border:"1px solid var(--line)", color:"var(--dust)",
        width:38, height:38, borderRadius:11, fontSize:15, cursor:"pointer" }}>✕</button>

      {/* masthead */}
      <div style={{ display:"flex", alignItems:"center", gap:22,
        padding:"calc(26px + env(safe-area-inset-top)) 48px 14px" }}>
        <FDMark size={46} />
        <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:"clamp(30px,3.4vw,50px)", lineHeight:1,
          textTransform:"uppercase", letterSpacing:"0.015em", color:"var(--sun)" }}>
          Field Day</div>
        <div style={{ ...label, fontSize:"clamp(11px,1vw,14px)", color:"#C9B896" }}>Scottsdale · 2026</div>
        <span style={{ width:10, height:10, borderRadius:99, background:"#E5967F", animation:"si-pulse 1.6s infinite" }} />
        <div style={{ flex:1 }} />
        {onDeckEv && !champion && (
          <div style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 20px", borderRadius:14,
            background:"linear-gradient(90deg, rgba(188,75,60,0.14), rgba(188,75,60,0.03))",
            border:"1px solid rgba(188,75,60,0.45)", marginRight:56 }}>
            <span style={{ fontFamily:SANS, fontWeight:700, fontSize:"clamp(10px,0.9vw,13px)",
              letterSpacing:"0.18em", color:"var(--live2)", textTransform:"uppercase" }}>On deck</span>
            <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:"clamp(17px,1.7vw,26px)", color:"#FBF3E4" }}>
              {onDeckEv.name}</span>
            <Tag tone="gold" style={{ fontSize:"clamp(10px,0.9vw,13px)" }}>Betting open</Tag>
          </div>
        )}
      </div>

      {champion ? (
        <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", padding:"0 60px" }}>
          <div style={{ width:"100%", maxWidth:1100 }}>
            <ChampionCard state={state} champion={champion} coChamps={coChamps} big />
          </div>
        </div>
      ) : scene === "bracket" && liveBracketEv ? (
        <div key="scene-br" style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center",
          justifyContent:"center", padding:"10px 48px 20px", animation:"si-fade .6s ease-out" }}>
          <div style={{ ...label, fontSize:"clamp(12px,1.1vw,16px)", color:"#C9B896", marginBottom:6 }}>Live bracket</div>
          <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:"clamp(28px,2.8vw,44px)", textTransform:"uppercase",
            color:"#FBF3E4", marginBottom:24 }}>{liveBracketEv.name}</div>
          <div style={{ width:"100%", maxWidth:1240 }}>
            <BracketGrid state={state} ev={liveBracketEv} gm={false} size="lg" />
          </div>
        </div>
      ) : scene === "stages" && liveStageEv ? (
        <div key="scene-st" style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center",
          justifyContent:"center", padding:"10px 48px 20px", animation:"si-fade .6s ease-out" }}>
          <div style={{ ...label, fontSize:"clamp(12px,1.1vw,16px)", color:"#C9B896", marginBottom:6 }}>
            {state.stages[liveStageEv.id]?.kind === "heats" ? "Live heats" : "Live pools"}</div>
          <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:"clamp(28px,2.8vw,44px)", textTransform:"uppercase",
            color:"#FBF3E4", marginBottom:24 }}>{liveStageEv.name}</div>
          <div style={{ width:"100%", maxWidth:1300 }}>
            <StageGrid state={state} ev={liveStageEv} gm={false} size="lg" />
          </div>
        </div>
      ) : (
        <div key="scene-board" style={{ flex:1, display:"flex", flexDirection:"column",
          padding:"6px 48px 16px", minHeight:0, animation:"si-fade .6s ease-out" }}>
          {leader && (
            <div style={{ display:"flex", alignItems:"center", gap:20, padding:"clamp(10px,1.6vh,20px) 26px",
              marginBottom:12, borderRadius:16, position:"relative", overflow:"hidden",
              background:GOLD_GRAD, border:"1px solid var(--accent2)", boxShadow:"0 8px 34px rgba(192,91,51,0.3)" }}>
              <div style={{ position:"absolute", top:0, bottom:0, width:110,
                background:"linear-gradient(90deg,transparent,rgba(255,255,255,0.4),transparent)",
                animation:"si-shine 3.4s 1s infinite" }} />
              <div style={{ fontFamily:DISPLAY, fontWeight:800, fontSize:"clamp(24px,3.4vh,42px)", color:"var(--ink)", width:46, textAlign:"center" }}>1</div>
              <Avatar state={state} p={leader.player} size={56} />
              <div style={{ flex:1 }}>
                <div style={{ fontFamily:SANS, fontWeight:700, fontSize:"clamp(20px,3vh,34px)", color:"var(--ink)", lineHeight:1.1 }}>
                  {disp(state, leader.player)}</div>
                <div style={{ fontFamily:SANS, fontSize:"clamp(11px,1.5vh,15px)", color:"rgba(30,22,8,0.6)" }}>
                  {leader.wins} win{leader.wins===1?"":"s"}{leader.betNet !== 0 ? ` · wagers ${leader.betNet>0?"+":""}${leader.betNet}` : ""}</div>
              </div>
              <div key={leader.pts} style={{ fontFamily:DISPLAY, fontWeight:800, fontSize:"clamp(30px,4.4vh,54px)", color:"var(--ink)", animation:"si-pop .5s ease-out" }}>{leader.pts}</div>
            </div>
          )}
          <div style={{ flex:1, display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px 22px", alignContent:"start", minHeight:0 }}>
            {[rest.slice(0,half), rest.slice(half)].map((col, ci) => (
              <div key={ci}>
                {col.map(r => (
                  <div key={r.player} style={{ display:"flex", alignItems:"center", gap:14,
                    padding:"clamp(5px,0.9vh,11px) 16px", marginBottom:7, borderRadius:13,
                    background:CARD_BG,
                    border:"1px solid " + (r.rank===2 && !allTied ? "rgba(189,178,160,0.5)" : r.rank===3 && !allTied ? "rgba(192,122,75,0.5)" : "var(--line)") }}>
                    <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:"clamp(16px,2.2vh,26px)", width:36,
                      color: !allTied && r.rank===2 ? "#75818C" : !allTied && r.rank===3 ? "#AC6A3B" : "var(--muted)",
                      textAlign:"center" }}>{allTied ? "·" : r.rank}</div>
                    <Avatar state={state} p={r.player} size={36} />
                    <div style={{ fontFamily:SANS, fontWeight:700, fontSize:"clamp(14px,2vh,24px)", flex:1,
                      color:"var(--cream)" }}>{disp(state, r.player)}</div>
                    <div key={r.pts} style={{ fontFamily:DISPLAY, fontWeight:800, fontSize:"clamp(18px,2.5vh,30px)",
                      color:"var(--cream)", animation:"si-pop .5s ease-out" }}>{r.pts}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* scene dots + ticker */}
      {scenes.length > 1 && !champion && (
        <div style={{ display:"flex", justifyContent:"center", gap:8, paddingBottom:8 }}>
          {scenes.map((s, i) => <div key={s} style={{ width:26, height:4, borderRadius:2,
            background: i === sceneIdx ? "var(--accent)" : "var(--line)" }} />)}
        </div>
      )}
      <div style={{ borderTop:"1px solid rgba(192,91,51,0.5)", background:"var(--paper2)", overflow:"hidden", padding:"11px 0" }}>
        <div style={{ display:"inline-flex", whiteSpace:"nowrap", animation:`si-tick ${Math.max(30, tickerStr.length/3)}s linear infinite` }}>
          {[0,1].map(k => (
            <span key={k} style={{ fontFamily:SANS, fontWeight:600, fontSize:"clamp(14px,1.4vw,19px)",
              letterSpacing:"0.06em", color:"var(--accent2)", paddingRight:60 }}>{tickerStr}   ✦   </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────── rules ─────────── */
function Guide({ replay }) {
  const S = ({ n, t, children }) => (
    <div style={{ marginBottom:18 }}>
      <div style={{ display:"flex", gap:10, alignItems:"baseline", marginBottom:6 }}>
        <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:13, color:"var(--dust)" }}>{n}</span>
        <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:18, color:"var(--accent2)" }}>{t}</span>
      </div>
      <div style={{ fontFamily:SANS, fontSize:14, lineHeight:1.62, color:"var(--muted2)" }}>{children}</div>
    </div>
  );
  return (
    <div style={{ padding:"0 18px 10px" }}>
      <S n="01" t="Format">
        Individual championship, team and solo events, teams reshuffle every event. Every result and every wager moves one board. Everyone starts with 5. The board freezes at Saturday night's trophy ceremony. Sunday is unscored.
      </S>
      <S n="02" t="Scoring">
        Friday events pay 1. Saturday morning 2, afternoon 3, night 4. The Finale pays 6 / 3 / 1. Solo events pay the podium; team events pay every player on the placing team the full value. Ties get a quick tiebreaker. A championship tie is one pressure putt.
      </S>
      <S n="03" t="Wagers">
        Betting opens when an event goes on deck and stays open until the result posts. Back anyone, including yourself, to win the event at 2 to 1. Bracket matchups, heat and pool advancement, and stage finals pay even and settle as the event progresses. Stakes of 1 to 3, max 3 at risk per player, no negative balances. Everything settles automatically off the official result. Brandon can void any wager.
      </S>
      <S n="04" t="Draws, brackets, heats">
        Brandon runs each draw and it reveals on every phone. Blind Draw is chance. Balanced Draw uses sealed self-ratings. Buddy System pairs top and bottom seeds. Ratings are never shown. Brackets, heats, and pools track live in the app and on the TV as they progress.
      </S>
      <S n="05" t="Saturday night awards">
        The Championship · Fraud of the Weekend · Sharpshooter · Degenerate of the Weekend · Media MVP · Teammate of the Weekend.
      </S>
      <S n="06" t="House rules">
        Alcohol optional everywhere, NA equivalents carry no penalty. No forced participation. Rack cups hold water, drink from your own. No hard contact. Respect the property. Everyone knows when the 360 cam is rolling. Brandon can stop anything for safety.
      </S>
      {!isStandalone() && (
        <S n="07" t="The app">
          <div style={{ marginBottom:8 }}>Best from your home screen. Full screen, one tap away.</div>
          <InstallHint />
        </S>
      )}
      <div style={{ display:"flex", justifyContent:"center", padding:"6px 0 18px" }}>
        <Btn kind="ghost" onClick={replay}>Replay the intro</Btn>
      </div>
      <div style={{ fontFamily:DISPLAY, textAlign:"center", fontSize:13, letterSpacing:"0.24em",
        color:"#A5947B", paddingBottom:8 }}>FIELD DAY ✦ SCOTTSDALE 2026</div>
    </div>
  );
}
