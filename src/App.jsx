import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import qrcode from "qrcode-generator";
import {
  ROSTER, AWARDS, SPORTS, RATINGS, SESSIONS, SLOT_META, DRAW_METHODS, OUTRIGHT_MULT, SIZES, GAMES,
  allEventsOf, disp, shuffle, snakeTeam, teamLabel, stageFinalists, stageEntrantView,
  resolveWager, computeStandings, computeScenarios, atRisk, ROUND_NAMES, resolveSlot, bracketChampion,
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
      background: src ? "var(--paper2)" : c, position:"relative",
      border: ring ? "2px solid var(--ink)" : "1.5px solid rgba(42,33,25,0.5)", ...style }}>
      {src
        ? <img src={src} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
        : <>
            <div style={{ position:"absolute", inset:0,
              background:"linear-gradient(135deg, transparent 40%, rgba(251,243,228,0.26) 40%, rgba(251,243,228,0.26) 62%, transparent 62%)" }} />
            <span style={{ position:"relative", fontFamily:DISPLAY, fontWeight:700, fontStyle:"italic",
              fontSize:size*0.44, letterSpacing:"0.03em",
              color: c === "#D89C2F" ? "var(--ink)" : BONE }}>{initials}</span>
          </>}
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
    ghost:   { background:"var(--paper)", color:"var(--ink)", border:"1px solid var(--line)" },
    dark:    { background:"var(--paper)", color:"var(--ink)", border:"1.5px solid var(--ink)" },
    danger:  { background:"transparent", color:"var(--clay)", border:"1.5px solid rgba(188,75,60,0.55)" },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{ fontFamily:SANS, fontWeight:700,
      letterSpacing:"0.04em", fontSize:13.5, textTransform:"uppercase", padding:"12px 16px", borderRadius:11, minHeight:44,
      cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.35 : 1,
      transition:"transform .1s", ...kinds[kind], ...style }}>{children}</button>
  );
}
function Sheet({ title, onClose, children, wide }) {
  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, zIndex:100, background:"rgba(42,33,25,0.45)",
      backdropFilter:"blur(4px)", display:"flex", alignItems:"flex-end", justifyContent:"center" }}>
      <div onClick={e=>e.stopPropagation()} className="si-sheet" style={{ width:"100%", maxWidth: wide ? 780 : 540,
        overflowY:"auto", background:"var(--paper)", borderRadius:"18px 18px 0 0",
        border:"1.5px solid var(--ink)", borderBottom:"none",
        padding:"18px 18px calc(30px + env(safe-area-inset-bottom))", animation:"si-up .24s ease-out" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14,
          borderBottom:"1.5px solid var(--ink)", paddingBottom:10 }}>
          <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:24, letterSpacing:"0.02em",
            textTransform:"uppercase", color:"var(--ink)" }}>{title}</div>
          <button onClick={onClose} aria-label="Close" style={{ background:"var(--paper2)", border:"1.5px solid rgba(42,33,25,0.4)",
            color:"var(--ink)", width:36, height:36, borderRadius:9, fontSize:14, cursor:"pointer" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
function PlayerChip({ name, selected, disabled, onClick, small }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ fontFamily:SANS, fontWeight:600,
      fontSize: small ? 13 : 14, padding: small ? "9px 8px" : "11px 10px", borderRadius:9,
      cursor: disabled ? "default" : "pointer",
      background: selected ? GOLD_GRAD : "var(--paper)",
      color: selected ? "var(--ink)" : disabled ? "#AE9C80" : "var(--cream)",
      border: selected ? "1.5px solid var(--ink)" : "1px solid var(--line)",
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
  const [guestLens, setGuestLens] = useState(false);
  const gmView = gm && !guestLens;
  const [sim, setSim] = useState(null);
  const [qaMin, setQaMin] = useState(() => localGet("si-qa-min") === "yes");
  const [qaTop, setQaTop] = useState(() => localGet("si-qa-pos") === "top");
  const [tv, setTv] = useState(() => typeof window !== "undefined" &&
    (window.location.pathname === "/tv" || new URLSearchParams(window.location.search).has("tv")));
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
          if (award > 0) notify(`You took ${["1st","2nd","3rd"][idx]}, +${award}`, null, "gold");
        }
        if (lastAction === "adjust") {
          const a = state.adjustments?.[0];
          if (a?.player === me) notify(`Ruling: ${a.delta > 0 ? "+" : ""}${a.delta}${a.reason ? ", " + a.reason : ""}`,
            null, a.delta > 0 ? "gold" : undefined);
        }
      }
    }
    prevVersion.current = version;
  }, [version, lastAction, state, me, events, notify]);

  /* rank deltas plus lead-change detection: when the top of the board flips,
     every phone announces it */
  const prevLeaders = useRef(null);
  useEffect(() => {
    if (ready) {
      const key = allTied ? "__tied__" : standings.filter(r => r.rank === 1).map(r => r.player).join("+");
      if (!allTied && !state.frozen && prevLeaders.current && prevLeaders.current !== key) {
        const names = standings.filter(r => r.rank === 1).map(p => p.player === me ? "You" : disp(state, p.player));
        notify(names.length > 1 ? `${names.join(" and ")} share the lead`
          : `${names[0]} ${names[0] === "You" ? "take" : "takes"} the lead`, null, "gold");
      }
      prevLeaders.current = key;
    }
    if (allTied) return;
    const d = {};
    standings.forEach(r => {
      const prev = prevRanks.current[r.player];
      if (prev && prev !== r.rank) d[r.player] = prev - r.rank;
    });
    if (Object.keys(d).length) setDeltas(d);
    const map = {}; standings.forEach(r => map[r.player] = r.rank);
    prevRanks.current = map;
  }, [standings, allTied, ready, state, me, notify]);

  /* reveal detection: team draws and stage draws reveal on every phone */
  useEffect(() => {
    if (seenReveals === null || (!tv && onboardStep < 99) || reveal || !ready) return;
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

  /* nudge a captain when the draft comes around to them, once per pick */
  const draftNudge = useRef("");
  useEffect(() => {
    if (!me || !ready) return;
    for (const [eid, d] of Object.entries(state.drafts || {})) {
      if (!d?.pool?.length) continue;
      const cur = d.teams[snakeTeam(d.picks.length, d.teams.length)]?.captain;
      if (cur !== me) continue;
      const key = `${eid}:${d.picks.length}`;
      if (draftNudge.current === key) return;
      draftNudge.current = key;
      notify(`You're on the clock for ${events.find(e => e.id === eid)?.name || "the draft"}`, null, "gold");
      return;
    }
  }, [state.drafts, me, events, ready]); // eslint-disable-line

  /* every mutation is an action; the server validates, applies, broadcasts */
  const act = (type, payload, okMsg) => dispatch(type, payload).then(r => {
    if (!r.ok) notify(r.error || "Rejected");
    else if (okMsg) notify(okMsg);
    return r;
  });

  const saveProfile = (p, prof) => {
    act("saveProfile", { player: p, display: prof.display, num: prof.num, size: prof.size });
    if (prof.photo) uploadPhoto(p, prof.photo).then(r => { if (!r?.ok) notify(r?.error || "Photo failed"); });
  };
  const setLive = on => act("setLive", { on });
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
  const startDraft = (evId, captains, players) => act("startDraft", { evId, captains, players });
  const pickDraftPlayer = (evId, player) => act("pickDraftPlayer", { evId, player });
  const undoDraftPick = evId => act("undoDraftPick", { evId });
  const finalizeDraft = evId => act("finalizeDraft", { evId });
  const cancelDraft = evId => act("cancelDraft", { evId });
  const runStages = (ev, cfg) => act("runStages", { evId: ev.id, cfg });
  const clearStages = ev => act("clearStages", { evId: ev.id });
  const toggleThrough = (evId, g, key) => act("toggleThrough", { evId, g, key });
  const setFinalWinner = (evId, key) => act("setFinalWinner", { evId, key });
  const pickBracketWinner = (evId, r, m, teamIdx) => act("pickBracketWinner", { evId, r, m, teamIdx });
  const placeWager = w => act("placeWager", { wager: w }, "Chip down");
  const retractWager = id => act("retractWager", { id }, "Chip back");
  const voidWager = id => act("voidWager", { id });
  const addAdjust = (player, delta, reason) => act("adjust", { player, delta, reason });
  const setFrozen = f => act("setFrozen", { f });
  const resetGame = () => act("resetTournament", {}, "Board reset");
  const rerunOnboard = () => act("rerunOnboarding", {}, "Intro replays on every phone");
  const toggleQa = () => setQa(v => { saveMine("si-qa", v ? "no" : "yes"); return !v; });

  /* ── QA simulation driver ──
     Plays the weekend through real actions on this device's socket, claiming
     each player in turn, so every connected phone and the TV see exactly the
     broadcasts a live weekend would produce. Always re-claims your identity. */
  const stateRef = useRef(state); stateRef.current = state;
  const simRef = useRef({ running:false, cancel:false, fast:false });
  const rnd = a => a[Math.floor(Math.random() * a.length)];
  const simWait = ms => new Promise((res, rej) => setTimeout(() =>
    simRef.current.cancel ? rej(new Error("stopped")) : res(), simRef.current.fast ? Math.min(ms, 120) : ms));
  const simDo = async (type, payload, lbl) => {
    if (simRef.current.cancel) throw new Error("stopped");
    if (lbl) setSim(lbl);
    const r = await dispatch(type, payload);
    if (!r.ok) throw new Error(r.error || type);
    return r;
  };
  const simCheckIn = async () => {
    for (const p of ROSTER) {
      const s = stateRef.current;
      if (s.profiles?.[p]?.display && s.seeds?.[p]) continue;
      await simDo("claim", { player: p }, `${p} checks in`);
      await simDo("saveProfile", { player: p, display: p });
      const ratings = {}; SPORTS.forEach(sp => { ratings[sp.id] = rnd(RATINGS).v; });
      await simDo("saveSeeds", { player: p, ratings });
      await simWait(120);
    }
  };
  const simBetsRound = async () => {
    const evId = stateRef.current.onDeck;
    if (!evId) throw new Error("Open betting on an event first");
    for (const p of shuffle(ROSTER).slice(0, 9)) {
      const s = stateRef.current;
      const events2 = allEventsOf(s);
      const ev = events2.find(e => e.id === evId);
      if (!ev || s.results[evId] || s.onDeck !== evId) break;
      const pts = computeStandings(s).find(r => r.player === p)?.pts ?? 0;
      const exp = atRisk(s, p, events2);
      const room = Math.min(3 - exp, pts - exp);
      if (room < 1) continue;
      const stake = Math.min(room, rnd([1, 1, 2, 2, 3]));
      const draw = s.draws[evId];
      let wager = null;
      if (ev.kind === "solo") {
        const pick = rnd(ROSTER);
        wager = { kind:"outright", eventId:evId, evName:ev.name, pick, pickPlayers:[pick], pickTeam:false, stake };
      } else if (draw) {
        const t = rnd(draw.teams.map((x, i) => i));
        wager = { kind:"outright", eventId:evId, evName:ev.name, pickTeam:true,
          pickPlayers:[...draw.teams[t].players], drawId:draw.id, stake };
      } else continue;
      await simDo("claim", { player: p });
      await simDo("placeWager", { wager },
        `${p} puts ${stake} on ${wager.pickTeam ? teamLabel(s, { players: wager.pickPlayers }) : wager.pick}`);
      await simWait(700);
    }
  };
  const simPlayEvent = async () => {
    await simCheckIn();
    const s0 = stateRef.current;
    const ev = allEventsOf(s0).find(e => !s0.results[e.id] && !s0.shelved[e.id]);
    if (!ev) throw new Error("Nothing left to play");
    const table = AWARDS[ev.value];
    if (ev.teamCfg && !stateRef.current.draws[ev.id]) {
      await simDo("runDraw", { evId: ev.id, method: "random", players: ROSTER }, `Drawing ${ev.name}`);
      await simWait(1300);
    }
    await simDo("setOnDeck", { id: ev.id }, `Betting opens on ${ev.name}`);
    await simWait(600);
    await simBetsRound();
    let br = stateRef.current.brackets[ev.id];
    if (br) {
      for (let r = 0; r < br.rounds.length; r++) {
        for (let m = 0; m < br.rounds[r].length; m++) {
          const cur = stateRef.current.brackets[ev.id];
          const match = cur.rounds[r][m];
          if (match.winner !== null && match.winner !== undefined) continue;
          const a = resolveSlot(cur, match.a), b = resolveSlot(cur, match.b);
          if (a === null || b === null) continue;
          await simDo("pickBracketWinner", { evId: ev.id, r, m, teamIdx: rnd([a, b]) }, `Advancing the ${ev.name} bracket`);
          await simWait(900);
        }
      }
    }
    const s1 = stateRef.current;
    const draw = s1.draws[ev.id];
    br = s1.brackets[ev.id];
    let slots;
    if (br && draw) {
      const champ = bracketChampion(br);
      const final = br.rounds[br.rounds.length - 1][0];
      const a = resolveSlot(br, final.a), b = resolveSlot(br, final.b);
      const runner = champ === a ? b : a;
      slots = [[...draw.teams[champ].players],
        table[1] > 0 && runner !== null ? [...draw.teams[runner].players] : [], []];
    } else if (draw) {
      const order = shuffle(draw.teams.map((_, i) => i));
      slots = [[...draw.teams[order[0]].players],
        table[1] > 0 && order[1] !== undefined ? [...draw.teams[order[1]].players] : [], []];
    } else {
      const order = shuffle(ROSTER);
      slots = [[order[0]], table[1] > 0 ? [order[1]] : [], table[2] > 0 ? [order[2]] : []];
    }
    await simDo("saveResult", { evId: ev.id, slots }, `Posting the ${ev.name} result`);
    await simWait(800);
  };
  const simFastForward = async () => {
    for (let i = 0; i < 14; i++) {
      const s = stateRef.current;
      const nxt = allEventsOf(s).find(e => !s.results[e.id] && !s.shelved[e.id]);
      if (!nxt || nxt.finale) return;
      await simPlayEvent();
    }
  };
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
  const unlockGm = pin => dispatch("gmUnlock", { pin }).then(r => {
    if (!r.ok) return notify(r.error || "Wrong passcode");
    setGmToken(r.extra?.gmToken); setGm(true); saveMine("si-gm", "yes");
    setModal(null); notify("Commissioner mode on");
  });
  const switchPlayer = p => { setMe(p); saveMine("si-me", p); dispatch("claim", { player: p }); setModal(null); notify(`Now viewing as ${p}`); };


  const gmNext = (() => {
    if (!gmView || state.frozen || !ready) return null;
    const ev = events.find(e => !state.results[e.id] && !state.shelved[e.id]);
    if (!ev) return { label:"Crown the champion", run:() => setModal({type:"freeze"}) };
    if (ev.teamCfg && !state.draws[ev.id])
      return { label:`Draw ${ev.name}`, run:() => runDraw(ev, "random", ROSTER) };
    if (state.onDeck !== ev.id)
      return { label:`Open betting on ${ev.name}`, run:() => setOnDeck(ev.id) };
    const br = state.brackets[ev.id];
    if (br && bracketChampion(br) === null)
      return { label:`Advance the ${ev.name} bracket`, run:() => setModal({type:"bracket", ev}) };
    const st = state.stages[ev.id];
    if (st && (!stageFinalists(st) || st.finalWinner === null || st.finalWinner === undefined))
      return { label:`Advance the ${st.kind === "heats" ? "heats" : "pools"}`, run:() => setModal({type:"event", ev}) };
    return { label:`Post the ${ev.name} result`, run:() => setModal({type:"result", ev}) };
  })();

  if (tv) {
    return (
      <Shell tv>
        <TVMode standings={standings} state={state} events={events} onDeckEv={onDeckEv} allTied={allTied}
          champion={champion} coChamps={coChamps} onExit={() => setTv(false)} />
        {reveal && <Reveal state={state} reveal={reveal} big auto onClose={closeReveal} />}
        <Confetti burst={burst} />
      </Shell>
    );
  }

  if (onboardStep < 99) {
    return (
      <Shell>
        <Onboarding step={onboardStep} me={me} state={state} onTv={() => setTv(true)}
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
            style={{ background: gmView ? "var(--sun)" : "var(--paper)",
              border:"1.5px solid " + (gmView ? "var(--ink)" : "rgba(42,33,25,0.4)"), borderRadius:9,
              width:38, height:38, cursor:"pointer", color:"var(--ink)",
              display:"flex", alignItems:"center", justifyContent:"center" }}><IconGM filled={gmView} /></button>
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
        paddingBottom:`calc(${gm && qa ? 212 : 92}px + env(safe-area-inset-bottom))` }}>
        {tab === "board" && (state.live
          ? <Board state={state} standings={standings} me={me} deltas={deltas} allTied={allTied}
              champion={champion} coChamps={coChamps} gm={gmView} events={events}
              myAtRisk={me ? atRisk(state, me, events) : 0}
              onOpen={ev => setModal({type:"event", ev})}
              onAdjust={p => setModal({type:"adjust", player:p})}
              onFreeze={() => setModal({type:"freeze"})} onUnfreeze={() => setFrozen(false)}
              finaleDone={!!state.results[events.find(e => e.finale)?.id]} />
          : <LockerRoom state={state} me={me} gm={gmView}
              onProfile={() => setModal({type:"profile"})} onStart={() => setLive(true)} />)}
        {tab === "sched" && <Schedule state={state} events={events} gm={gmView}
          open={ev => setModal({type:"event", ev})} onAdd={() => setModal({type:"addEvent"})}
          onReorder={reorderEvents} />}
        {tab === "bets" && <Wagers state={state} me={me} standings={standings} gm={gmView} events={events}
          onDeckEv={onDeckEv}
          onPick={pick => placeWager({ ...pick, stake: 1 })}
          onRetract={id => retractWager(id)}
          onVoid={id => { voidWager(id); notify("Wager voided"); }} />}
        {tab === "guide" && <Guide replay={() => setOnboardStep(3)} events={events} />}
      </div>

      {gmNext && !modal && (
        <button onClick={gmNext.run} style={{ position:"fixed", right:14, zIndex:56,
          bottom:`calc(${gm && qa && !qaMin && !qaTop ? 224 : 74}px + env(safe-area-inset-bottom))`,
          display:"flex", alignItems:"center", gap:8, background:"var(--ink)", color:BONE,
          border:"none", borderRadius:99, padding:"11px 18px", cursor:"pointer",
          boxShadow:"0 6px 20px rgba(42,33,25,0.35)", maxWidth:"78vw" }}>
          <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:15.5, letterSpacing:"0.04em",
            textTransform:"uppercase", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            {gmNext.label}</span>
          <span style={{ fontFamily:SANS, fontWeight:700, fontSize:14, color:"var(--sun)" }}>›</span>
        </button>
      )}
      {gm && qa && <QABar me={me} onSwitch={switchPlayer} onReset={resetGame} onRerun={rerunOnboard} onExit={toggleQa}
        minimized={qaMin} onMin={() => setQaMin(v => { saveMine("si-qa-min", v ? "no" : "yes"); return !v; })}
        top={qaTop} onPos={() => setQaTop(v => { saveMine("si-qa-pos", v ? "bottom" : "top"); return !v; })}
        sim={sim} onStop={stopSim} guestLens={guestLens}
        onLens={() => setGuestLens(v => { notify(v ? "GM view" : "Guest view"); return !v; })}
        onSimBets={runSim(simBetsRound)} onPlayNext={runSim(simPlayEvent)}
        onFastForward={runSim(simFastForward, true)} />}

      {/* tab bar */}
      <div style={{ position:"fixed", bottom:0, left:0, right:0, display:"flex", justifyContent:"center", zIndex:50 }}>
        <div style={{ width:"100%", maxWidth:540, display:"flex", background:"rgba(244,237,223,0.95)",
          backdropFilter:"blur(16px)", borderTop:"1px solid var(--line)",
          padding:"8px 10px calc(12px + env(safe-area-inset-bottom))" }}>
          {[["board","Board"],["sched","Events"],["bets","Bets"],["guide","Rules"]].map(([id,lb]) => (
            <button key={id} onClick={() => setTab(id)} style={{ flex:1, background:"none", border:"none",
              cursor:"pointer", padding:"7px 0" }}>
              <div style={{ fontFamily:SANS, fontWeight:700, fontSize:12.5, letterSpacing:"0.04em",
                textTransform:"uppercase",
                color: tab===id ? BONE : "var(--muted)",
                background: tab===id ? "var(--ink)" : "transparent",
                borderRadius:99, padding:"8px 14px", display:"inline-block" }}>{lb}</div>
            </button>
          ))}
        </div>
      </div>

      {/* modals */}
      {modal?.type === "pin" && <PinSheet onClose={() => setModal(null)} unlock={unlockGm} />}
      {modal?.type === "profile" && <ProfileSheet state={state} me={me} onClose={() => setModal(null)}
        save={prof => { saveProfile(me, prof); setModal(null); notify("Profile saved"); }} />}
      {modal?.type === "gmMenu" && (
        <Sheet title="Commissioner" onClose={() => setModal(null)}>
          <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
            {state.onDeck && (
              <Btn kind="danger" onClick={() => { setOnDeck(null); setModal(null); notify("Betting closed"); }}>
                Close betting</Btn>
            )}
            <Btn kind="dark" onClick={() => { setLive(!state.live); setModal(null); }}>
              {state.live ? "Back to the locker room" : "Start the weekend"}</Btn>
            <Btn kind="dark" onClick={() => { toggleQa(); setModal(null); }}>{qa ? "QA mode off" : "QA mode"}</Btn>
            <Btn kind="dark" onClick={() => { setGm(false); saveMine("si-gm","no"); setModal(null); }}>Exit GM</Btn>
            {state.frozen
              ? <Btn kind="danger" onClick={() => { setFrozen(false); setModal(null); }}>Unfreeze board</Btn>
              : <Btn onClick={() => setModal({type:"freeze"})}>Crown the champion</Btn>}
          </div>
        </Sheet>
      )}
      {modal?.type === "event" && <EventSheet ev={events.find(e => e.id === modal.ev.id) || modal.ev} state={state} gm={gmView}
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
        openBracket={() => setModal({type:"bracket", ev:modal.ev})}
        openDraft={pool => setModal({type:"draft", ev:modal.ev, pool})} />}
      {modal?.type === "bracket" && <BracketSheet ev={modal.ev} state={state} gm={gmView}
        onClose={() => setModal({type:"event", ev:modal.ev})}
        onPick={(r,m,t) => pickBracketWinner(modal.ev.id, r, m, t)}
        onPostResult={() => setModal({type:"result", ev:modal.ev})} />}
      {modal?.type === "draft" && <DraftSheet ev={events.find(e => e.id === modal.ev.id) || modal.ev}
        state={state} gm={gmView} me={me} standings={standings} pool={modal.pool}
        onClose={() => setModal({type:"event", ev:modal.ev})}
        onStart={(captains, players) => startDraft(modal.ev.id, captains, players)}
        onPick={player => pickDraftPlayer(modal.ev.id, player)}
        onUndo={() => undoDraftPick(modal.ev.id)}
        onFinalize={() => { finalizeDraft(modal.ev.id); setModal(null); }}
        onCancel={() => { cancelDraft(modal.ev.id); setModal({type:"event", ev:modal.ev}); }} />}
      {modal?.type === "result" && <ResultSheet ev={events.find(e => e.id === modal.ev.id) || modal.ev} state={state}
        onClose={() => setModal(null)}
        save={slots => { saveResult(modal.ev, slots); setModal(null); notify(`${modal.ev.name} posted, wagers settled`); }} />}
      {modal?.type === "addEvent" && <AddEventSheet state={state} onClose={() => setModal(null)}
        save={ev => { addCustomEvent(ev); setModal(null); notify(`${ev.name} added`); }} />}
      {modal?.type === "adjust" && <AdjustSheet player={modal.player} onClose={() => setModal(null)}
        save={(d,r) => { addAdjust(modal.player, d, r); setModal(null); notify(`${modal.player} ${d>0?"+":""}${d}`); }} />}
      {modal?.type === "freeze" && (
        <Sheet title="Crown the champion" onClose={() => setModal(null)}>
          <p style={pStyle}>Freezes the board and crowns <b style={{color:"var(--accent2)"}}>{disp(state, standings[0]?.player)}</b> at {standings[0]?.pts} points. All betting closes.</p>
          {!state.results[events.find(e => e.finale)?.id] && <p style={{...pStyle, color:"var(--live2)"}}>No Finale result yet.</p>}
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
          --accent:#C25832; --accent2:#9C4526; --sun:#F0B02F; --pool:#4694A8;
          --olive:#77804C; --clay:#C0473A; --live2:#B23B2E;
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
        @keyframes si-die-arc {
          0%   { transform: translate(0px,30px)   rotate(0deg); }
          12%  { transform: translate(18px,2px)   rotate(80deg); }
          24%  { transform: translate(38px,-12px) rotate(160deg); }
          36%  { transform: translate(58px,-6px)  rotate(240deg); }
          48%  { transform: translate(78px,12px)  rotate(310deg); }
          56%  { transform: translate(90px,30px)  rotate(350deg); }
          64%  { transform: translate(102px,14px) rotate(380deg); }
          74%  { transform: translate(114px,10px) rotate(400deg); }
          84%  { transform: translate(126px,24px) rotate(415deg); }
          90%, 100% { transform: translate(132px,30px) rotate(420deg); }
        }
        @keyframes si-pong-arc {
          0%   { transform: translate(0px,26px);   opacity:1; }
          30%  { transform: translate(50px,-12px); opacity:1; }
          55%  { transform: translate(96px,0px);   opacity:1; }
          70%  { transform: translate(116px,16px); opacity:1; }
          80%, 100% { transform: translate(121px,30px); opacity:0; }
        }
        @keyframes si-flip-cup {
          0%, 14%   { transform: translate(0,0) rotate(0deg); }
          44%       { transform: translate(0,-26px) rotate(-120deg); }
          62%       { transform: translate(0,-6px) rotate(-180deg); }
          70%       { transform: translate(0,0) rotate(-180deg); }
          76%       { transform: translate(0,-4px) rotate(-180deg); }
          82%, 100% { transform: translate(0,0) rotate(-180deg); }
        }
        @media (prefers-reduced-motion: reduce) { * { animation:none !important; transition:none !important; } }
        ::-webkit-scrollbar { width:0; height:0; }
        /* dvh tracks the visible viewport (browser bars come and go); vh is the fallback */
        .si-vh { min-height:100vh; min-height:100dvh; }
        .si-sheet { max-height:90vh; max-height:90dvh; }
      `}</style>
      <div className="si-vh" style={{ width:"100%", maxWidth: tv ? "100%" : 540, display:"flex",
        flexDirection:"column", position:"relative",
        background:"radial-gradient(120% 50% at 50% -6%, rgba(233,180,65,0.14) 0%, transparent 60%), var(--bg)" }}>
        {!tv && <div style={{ position:"fixed", inset:0, pointerEvents:"none", backgroundImage:GRAIN, zIndex:1000, mixBlendMode:"multiply" }} />}
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
function Onboarding({ step, me, state, pick, saveProfile, submitSeeds, next, done, onTv }) {
  const [ratings, setRatings] = useState({});
  const [display, setDisplay] = useState("");
  const [photo, setPhoto] = useState(null);
  const [num, setNum] = useState("");
  const [size, setSize] = useState(null);
  useEffect(() => {
    if (!me) return;
    const pr = state.profiles?.[me];
    setDisplay(pr?.display || me);
    setNum(pr?.num != null ? String(pr.num) : "");
    setSize(pr?.size ?? null);
  }, [me]); // eslint-disable-line
  const cards = {
    3: { art:<FDMark size={54} />, t:"One board", b:"Everyone starts the weekend with 5 points. Event results and wagers move your total from there, and the events are worth more as the weekend goes on.", meter:true },
    4: { art:<ArtTicket />, t:"Bets", b:"Betting opens whenever an event goes on deck. You can back anyone to win it, including yourself. The winner pays 2 to 1, stakes run 1 to 3, and everything settles automatically once the result posts." },
    5: { art:<ArtStar />, t:"The Finale", b:"The Finale pays 6 / 3 / 1 to the top three finishers. Whoever leads the board after it takes the championship." },
    6: { art:<FDMark size={54} />, t:"Four tabs", b:"Everything lives one tap away.", tabs:[
      ["Board","Standings, live as results post."],
      ["Events","The schedule. Draws, brackets, and results run here."],
      ["Bets","Back anyone when betting opens."],
      ["Rules","Scoring, wagers, and how to play every game."],
    ]},
  };
  if (step === -1) return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", animation:"si-in .3s ease-out",
      padding:"calc(48px + env(safe-area-inset-top)) 22px calc(24px + env(safe-area-inset-bottom))" }}>
      <div style={label}>Scottsdale · October 2026</div>
      <div style={{ margin:"10px 0 4px" }}><Wordmark size={46} /></div>
      <div style={{ fontFamily:SANS, color:"var(--muted2)", fontSize:15, lineHeight:1.6, marginBottom:22 }}>
        This runs best from your home screen. Add it once and it opens full screen, like any other app.
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
      <div style={{ margin:"10px 0 28px" }}><Wordmark size={46} /></div>
      <div style={{ ...label, marginBottom:10 }}>Who are you?</div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:"auto" }}>
        {ROSTER.map(p => <PlayerChip key={p} name={p} selected={me===p} onClick={() => pick(p)} />)}
      </div>
      <Btn disabled={!me} onClick={next} style={{ width:"100%", fontSize:15, padding:"15px" }}>Check in</Btn>
      {onTv && <button onClick={onTv} style={{ background:"none", border:"none", cursor:"pointer", marginTop:14,
        fontFamily:SANS, fontWeight:600, fontSize:13, color:"var(--accent2)", alignSelf:"center" }}>
        TV mode</button>}
    </div>
  );
  if (step === 1) return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", animation:"si-in .3s ease-out",
      padding:"calc(40px + env(safe-area-inset-top)) 22px calc(24px + env(safe-area-inset-bottom))" }}>
      <div style={label}>Your card</div>
      <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:30, color:"var(--cream)", margin:"6px 0 16px" }}>
        Set up your profile</div>
      <ProfileEditor state={state} me={me} display={display} setDisplay={setDisplay} photo={photo} setPhoto={setPhoto}
        num={num} setNum={setNum} size={size} setSize={setSize} />
      <div style={{ marginTop:"auto" }}>
        <Btn disabled={!display.trim()} onClick={() => { saveProfile({ display: display.trim(),
            num: num === "" ? null : Number(num), size, ...(photo ? {photo} : {}) }); next(); }}
          style={{ width:"100%", fontSize:15, padding:"15px" }}>Continue</Btn>
      </div>
    </div>
  );
  if (step === 2) {
    const complete = SPORTS.every(s => ratings[s.id] !== undefined);
    return (
      <div style={{ flex:1, display:"flex", flexDirection:"column", animation:"si-in .3s ease-out",
        padding:"calc(40px + env(safe-area-inset-top)) 20px calc(24px + env(safe-area-inset-bottom))" }}>
        <div style={label}>Sealed scouting report</div>
        <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:30, color:"var(--cream)", margin:"6px 0 6px" }}>Rate yourself</div>
        <div style={{ fontFamily:SANS, fontSize:13.5, color:"var(--muted2)", lineHeight:1.55, marginBottom:16 }}>
          Nobody sees this. It only balances draws and heats.
        </div>
        <div style={{ flex:1, overflowY:"auto", marginBottom:14 }}>
          {[["sport","Sports"],["drink","Drinking games"]].map(([gid, glabel]) => (
          <div key={gid}>
          <div style={{ ...label, margin: gid === "sport" ? "0 0 2px" : "16px 0 2px" }}>{glabel}</div>
          {SPORTS.filter(s => s.group === gid).map(s => {
            const idx = RATINGS.findIndex(r => r.v === ratings[s.id]);
            return (
              <div key={s.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 0",
                borderBottom:"1px solid var(--line)" }}>
                <div style={{ fontFamily:SANS, fontWeight:700, fontSize:14, color:"var(--cream)", width:92 }}>{s.label}</div>
                <div style={{ display:"flex", gap:7, flex:1 }}>
                  {RATINGS.map((r, i) => (
                    <button key={r.v} onClick={() => setRatings(x => ({ ...x, [s.id]: r.v }))} aria-label={r.label}
                      style={{ width:34, height:34, borderRadius:"50%", cursor:"pointer", padding:0,
                        background: idx >= 0 && i <= idx ? "var(--sun)" : "var(--paper)",
                        border: idx >= 0 && i <= idx ? "1.5px solid var(--ink)" : "1px solid var(--line)",
                        transition:"background .12s" }} />
                  ))}
                </div>
                <div style={{ fontFamily:SANS, fontWeight:700, fontSize:12.5, width:88, textAlign:"right",
                  color: idx >= 0 ? "var(--accent2)" : "var(--muted)" }}>{idx >= 0 ? RATINGS[idx].label : ""}</div>
              </div>
            );
          })}
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
      {c.tabs && (
        <div style={{ marginTop:20 }}>
          {c.tabs.map(([t, d]) => (
            <div key={t} style={{ display:"flex", alignItems:"center", gap:14, padding:"10px 0",
              borderBottom:"1px solid var(--line)" }}>
              <span style={{ fontFamily:SANS, fontWeight:700, fontSize:12.5, letterSpacing:"0.04em",
                textTransform:"uppercase", background:"var(--ink)", color:BONE, borderRadius:99,
                padding:"7px 14px", flexShrink:0 }}>{t}</span>
              <span style={{ fontFamily:SANS, fontSize:14, color:"var(--muted2)" }}>{d}</span>
            </div>
          ))}
        </div>
      )}
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
          {[3,4,5,6].map(i => <div key={i} style={{ width:22, height:3, borderRadius:2, background: i<=step ? "var(--accent)" : "var(--line)" }} />)}
        </div>
        <Btn onClick={step === 6 ? done : next} style={{ fontSize:15, padding:"14px 28px" }}>
          {step === 6 ? "I'm in" : "Next"}
        </Btn>
      </div>
    </div>
  );
}

function ProfileEditor({ state, me, display, setDisplay, photo, setPhoto, num, setNum, size, setSize }) {
  const fileRef = useRef(null);
  const prof = state.profiles?.[me];
  const current = photo || (prof?.photoV ? `/api/photo/${encodeURIComponent(me)}?v=${prof.photoV}` : null);
  const takenBy = num !== "" ? Object.entries(state.profiles || {})
    .find(([p, pr]) => p !== me && pr?.num === Number(num)) : null;
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
        <input ref={fileRef} type="file" accept="image/*" onChange={onFile} style={{ display:"none" }} />
      </div>
      <div style={{ ...label, marginBottom:6 }}>Display name</div>
      <input value={display} onChange={e => setDisplay(e.target.value)} maxLength={16}
        style={{ width:"100%", background:"var(--panel2)", border:"1px solid var(--line)", borderRadius:12,
          padding:"13px 14px", color:"var(--cream)", fontFamily:SANS, fontWeight:600, fontSize:16, outline:"none" }} />
      <div style={{ display:"flex", alignItems:"center", gap:12, marginTop:14 }}>
        <div style={{ ...label, flex:1 }}>Jersey number</div>
        <input value={num} inputMode="numeric" placeholder="00"
          onChange={e => setNum(e.target.value.replace(/\D/g, "").slice(0, 2))}
          style={{ width:96, background:"var(--panel2)", borderRadius:12, textAlign:"center",
            border: takenBy ? "1.5px solid var(--clay)" : "1px solid var(--line)",
            padding:"11px 8px", color:"var(--cream)", fontFamily:DISPLAY, fontWeight:700, fontSize:22, outline:"none" }} />
      </div>
      {takenBy && <div style={{ fontFamily:SANS, fontSize:12.5, color:"var(--clay)", marginTop:4, textAlign:"right" }}>
        {disp(state, takenBy[0])} has {Number(num)}</div>}
      <div style={{ ...label, margin:"14px 0 6px" }}>Shirt size</div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:5 }}>
        {SIZES.map(s => (
          <button key={s} onClick={() => setSize(size === s ? null : s)}
            style={{ fontFamily:SANS, fontWeight:700, fontSize:14, padding:"13px 2px", borderRadius:10,
              cursor:"pointer", background: size === s ? GOLD_GRAD : "var(--paper)", color:"var(--ink)",
              border: size === s ? "1.5px solid var(--ink)" : "1px solid var(--line)" }}>{s}</button>
        ))}
      </div>
    </div>
  );
}

/* ─────────── locker room (pre-weekend roster wall; Board takes over when live) ─────────── */
function LockerRoom({ state, me, gm, onProfile, onStart }) {
  const profs = state.profiles || {};
  const inCount = ROSTER.filter(p => profs[p]).length;
  return (
    <div style={{ padding:"0 16px" }}>
      <div style={{ display:"flex", alignItems:"baseline", marginBottom:10 }}>
        <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:22, textTransform:"uppercase",
          color:"var(--ink)", flex:1 }}>The roster</div>
        <div style={{ fontFamily:SANS, fontWeight:700, fontSize:13, color:"var(--muted2)" }}>
          {inCount} of {ROSTER.length} in</div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
        {ROSTER.map(p => {
          const pr = profs[p];
          return (
            <button key={p} onClick={p === me ? onProfile : undefined}
              style={{ background:"var(--paper)", borderRadius:13, padding:"12px 6px 10px", textAlign:"center",
                border: p === me ? "1.5px solid var(--ink)" : "1px solid var(--line)",
                cursor: p === me ? "pointer" : "default", opacity: pr ? 1 : 0.45,
                animation:"si-in .25s both" }}>
              <div style={{ display:"flex", justifyContent:"center", marginBottom:9, position:"relative" }}>
                <span style={{ position:"relative", display:"inline-block" }}>
                  <Avatar state={state} p={p} size={54} ring={p === me} />
                  {pr?.num != null && (
                    <span style={{ position:"absolute", bottom:-6, left:"50%", transform:"translateX(-50%)",
                      background:BONE, color:"var(--ink)", border:"1.5px solid var(--ink)", borderRadius:5,
                      fontFamily:DISPLAY, fontWeight:700, fontSize:12.5, lineHeight:1,
                      padding:"2px 7px" }}>{pr.num}</span>
                  )}
                </span>
              </div>
              <div style={{ fontFamily:SANS, fontWeight:700, fontSize:13, color:"var(--ink)",
                overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{disp(state, p)}</div>
            </button>
          );
        })}
      </div>
      {me && <Btn kind="ghost" onClick={onProfile} style={{ width:"100%", marginTop:12 }}>Edit your profile</Btn>}
      {gm && (
        <div style={{ marginTop:18, background:"var(--paper)", border:"1px solid var(--line)",
          borderRadius:13, padding:"12px 13px" }}>
          <div style={{ ...label, marginBottom:8 }}>Jersey sheet</div>
          {ROSTER.map(p => {
            const pr = profs[p];
            return (
              <div key={p} style={{ display:"flex", gap:10, alignItems:"center", padding:"5px 0",
                borderBottom:"1px solid var(--line)", fontFamily:SANS, fontSize:13.5 }}>
                <span style={{ flex:1, fontWeight:600, color:"var(--ink)" }}>{p}</span>
                <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:15, width:36,
                  color: pr?.num != null ? "var(--accent2)" : "var(--line)" }}>
                  {pr?.num != null ? `#${pr.num}` : "?"}</span>
                <span style={{ width:36, fontWeight:700, color: pr?.size ? "var(--ink)" : "var(--line)" }}>
                  {pr?.size || "?"}</span>
              </div>
            );
          })}
          <Btn onClick={onStart} style={{ width:"100%", marginTop:12 }}>Start the weekend</Btn>
        </div>
      )}
    </div>
  );
}

/* ─────────── the board ─────────── */
const NEED_CHIP = [
  { bg:"var(--olive)", fg:BONE, text:"Any finish" },
  { bg:"var(--pool)",  fg:BONE, text:"3rd or better" },
  { bg:"var(--sun)",   fg:"var(--ink)", text:"2nd or better" },
  { bg:"var(--clay)",  fg:BONE, text:"Needs the win" },
];
function ScenarioCard({ state, scen, me }) {
  return (
    <div style={{ marginBottom:12, borderRadius:12, overflow:"hidden", border:"1.5px solid var(--ink)",
      background:"radial-gradient(120% 90% at 50% 0%, rgba(233,180,65,0.12) 0%, transparent 55%), var(--night)" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 14px",
        borderBottom:"1px solid rgba(251,243,228,0.18)" }}>
        <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:17, letterSpacing:"0.06em",
          textTransform:"uppercase", color:"var(--sun)", flex:1 }}>The Finale picture</span>
        <span style={{ fontFamily:SANS, fontWeight:700, fontSize:11.5, color:"#C9B896" }}>
          {scen.alive.length} of {scen.total} can still win it</span>
      </div>
      <div style={{ padding:"4px 0 6px" }}>
        {scen.alive.map((a, i) => (
          <div key={a.player} style={{ display:"flex", alignItems:"center", gap:10, padding:"6px 14px",
            borderTop: i > 0 ? "1px solid rgba(251,243,228,0.08)" : "none" }}>
            <Avatar state={state} p={a.player} size={26} />
            <span style={{ fontFamily:SANS, fontWeight:700, fontSize:14, color:BONE, flex:1,
              overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
              {disp(state, a.player)}{a.player === me && <span style={{ opacity:0.6, fontSize:11.5 }}> (you)</span>}</span>
            <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:15, color:"#C9B896", marginRight:2 }}>{a.pts}</span>
            <span style={{ fontFamily:SANS, fontWeight:700, fontSize:10.5, letterSpacing:"0.05em",
              textTransform:"uppercase", padding:"3px 8px", borderRadius:4,
              background:NEED_CHIP[a.needIdx].bg, color:NEED_CHIP[a.needIdx].fg }}>{NEED_CHIP[a.needIdx].text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Board({ state, standings, me, deltas, allTied, champion, coChamps, gm, events, myAtRisk, onOpen, onAdjust, onFreeze, onUnfreeze, finaleDone }) {
  let latest = null;
  Object.entries(state.results || {}).forEach(([eid, res]) => {
    const ev = events.find(e => e.id === eid);
    if (ev && res?.slots?.[0]?.length && (!latest || res.ts > latest.res.ts)) latest = { ev, res };
  });
  const upcoming = events.find(e => !state.results[e.id] && !state.shelved[e.id]);
  const scen = !champion && (state.onDeck && events.find(e => e.id === state.onDeck)?.finale || upcoming?.finale)
    ? computeScenarios(state) : null;
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
      {scen && <ScenarioCard state={state} scen={scen} me={me} />}
      {allTied && (
        <div style={{ textAlign:"center", padding:"6px 0 14px" }}>
          <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:19, color:"var(--cream)" }}>All square at 5</div>
        </div>
      )}
      <div style={{ background:"var(--paper)", border:"1px solid rgba(42,33,25,0.3)", borderRadius:14,
        overflow:"hidden", boxShadow:"0 4px 16px rgba(42,33,25,0.08)", animation:"si-in .25s both" }}>
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
                  {disp(state, r.player)}{isMe && <span style={{ opacity:0.55, fontWeight:600, fontSize:12 }}> (you)</span>}
                </div>
                <div style={{ fontFamily:SANS, fontSize:11.5, color: first ? "rgba(42,33,25,0.65)" : "var(--muted)" }}>
                  {r.wins} win{r.wins===1?"":"s"}{r.betNet !== 0 && <>, wagers {r.betNet>0?"+":""}{r.betNet}</>}
                  {isMe && myAtRisk > 0 && <>, <span style={{ color:"var(--live2)" }}>{myAtRisk} at risk</span></>}
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
        {champion.pts} points
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
        borderRadius:12, padding:"11px 14px 11px 16px", marginBottom:7, cursor: moving ? "default" : "pointer" }}>
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
        <GroupCard key={i} title={`${g.name}${st.advance > 1 ? `, top ${st.advance} through` : ""}`}
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
  onStages, onClearStages, onThrough, onFinal, onDeckToggle, onShelve, onRemove, openBracket, openDraft }) {
  const res = state.results[ev.id];
  const draw = state.draws[ev.id];
  const draftLive = state.drafts?.[ev.id];
  const br = state.brackets[ev.id];
  const st = state.stages[ev.id];
  const table = AWARDS[ev.value];
  const shelvedNow = !!state.shelved[ev.id];
  const [confirmRedraw, setConfirmRedraw] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmScrap, setConfirmScrap] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [howTo, setHowTo] = useState(false);
  const [more, setMore] = useState(false);
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
    (!m.needsSport || ev.sport) && (!m.pairsOnly || ev.teamCfg?.size === 2) && (!m.teamOnly || ev.kind === "team"));
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
      {ev.desc && <p style={{ ...pStyle, marginBottom: GAMES[ev.game] ? 8 : 14 }}>{ev.desc}</p>}
      {GAMES[ev.game] && (
        <button onClick={() => setHowTo(true)} style={{ background:"none", border:"none", cursor:"pointer",
          fontFamily:SANS, fontWeight:700, fontSize:13, letterSpacing:"0.02em", color:"var(--accent2)",
          padding:"0 0 14px", display:"block" }}>How to play →</button>
      )}
      {howTo && <HowToSheet gameId={ev.game} variant={ev.variant} onClose={() => setHowTo(false)} />}
      <p style={{ ...pStyle, color:"var(--dust)", fontSize:13 }}>
        Pays {table.map((v,i) => v>0 ? `${SLOT_META[i].label} +${v}` : null).filter(Boolean).join(", ")}
      </p>

      {draftLive && !draw && (
        <div style={{ marginBottom:14 }}>
          <div style={{ ...label, marginBottom:8 }}>Captains draft</div>
          <Btn kind="dark" onClick={() => openDraft()} style={{ width:"100%" }}>
            Open the draft board</Btn>
        </div>
      )}

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
          {ev.teamCfg && !draw && !draftLive && !res && (() => {
            const fit = ev.teamCfg.teams * ev.teamCfg.size;
            const diff = inPlayers.length - fit;
            return (
            <>
              <div style={{ display:"flex", alignItems:"center", marginBottom:4 }}>
                <div style={{ ...label, flex:1 }}>Draw teams</div>
                <button onClick={() => setShowOuts(v => !v)} style={{ cursor:"pointer",
                  fontFamily:SANS, fontWeight:700, fontSize:13, padding:"7px 12px", borderRadius:9,
                  background: diff !== 0 ? "rgba(192,71,58,0.12)" : "var(--paper)",
                  border: diff !== 0 ? "1.5px solid var(--clay)" : "1px solid var(--line)",
                  color: diff !== 0 ? "var(--clay)" : "var(--ink)" }}>
                  {inPlayers.length} playing {showOuts ? "▴" : "▾"}</button>
              </div>
              <div style={{ fontFamily:SANS, fontSize:12.5, marginBottom:8,
                color: diff !== 0 ? "var(--clay)" : "var(--muted)" }}>
                Format: {ev.teamCfg.teams} teams of {ev.teamCfg.size}, fits {fit}.
                {diff > 0 ? ` ${diff} extra will double up.` : diff < 0 ? ` ${-diff} short.` : ""}
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
                    cursor:"pointer", borderRadius:9,
                    background: method === m.id ? "rgba(233,180,65,0.35)" : "var(--paper)",
                    border: method === m.id ? "1.5px solid var(--ink)" : "1px solid var(--line)" }}>
                    <div style={{ fontFamily:SANS, fontWeight:700, fontSize:14, color:"var(--ink)" }}>{m.name}</div>
                    <div style={{ fontFamily:SANS, fontSize:12.5, color:"var(--dust)", marginTop:2 }}>{m.desc}</div>
                  </button>
                ))}
              </div>
              <Btn disabled={!method || inPlayers.length < 2}
                onClick={() => method === "draft" ? openDraft(inPlayers) : onDraw(method, inPlayers)}
                style={{ width:"100%", marginBottom:10 }}>
                {method === "draft" ? "Set up the draft" : "Run the draw"}</Btn>
            </>
            );
          })()}
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
                        <button onClick={() => setShowOuts(v => !v)} style={{ cursor:"pointer",
                          fontFamily:SANS, fontWeight:700, fontSize:12.5, padding:"6px 11px", borderRadius:9,
                          background:"var(--paper)", border:"1px solid var(--line)", color:"var(--ink)" }}>
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
                      <button key={n} onClick={() => setNGroups(n)} style={{ width:44, height:44, borderRadius:9,
                        cursor:"pointer", fontFamily:DISPLAY, fontWeight:700, fontSize:19,
                        background: groupsChoice===n ? GOLD_GRAD : "var(--paper)",
                        color:"var(--ink)",
                        border: groupsChoice===n ? "1.5px solid var(--ink)" : "1px solid var(--line)" }}>{n}</button>
                    ))}
                    <span style={{ flex:1 }} />
                    <span style={{ ...label }}>Through</span>
                    {[1,2].map(n => (
                      <button key={n} onClick={() => setAdvance(n)} style={{ width:44, height:44, borderRadius:9,
                        cursor:"pointer", fontFamily:DISPLAY, fontWeight:700, fontSize:19,
                        background: advance===n ? GOLD_GRAD : "var(--paper)",
                        color:"var(--ink)",
                        border: advance===n ? "1.5px solid var(--ink)" : "1px solid var(--line)" }}>{n}</button>
                    ))}
                  </div>
                  {canHeats && ev.sport && (
                    <div style={{ display:"flex", gap:6, marginBottom:10 }}>
                      {[["random","Blind"],["balanced","Balanced"]].map(([id,lb]) => (
                        <button key={id} onClick={() => setStageMethod(id)} style={{ flex:1, padding:"10px 8px",
                          borderRadius:9, cursor:"pointer", fontFamily:SANS, fontWeight:600, fontSize:12.5,
                          background: stageMethod===id ? GOLD_GRAD : "var(--paper)",
                          color:"var(--ink)",
                          border: stageMethod===id ? "1.5px solid var(--ink)" : "1px solid var(--line)" }}>{lb}</button>
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
                  <button key={v} onClick={() => setEValue(v)} style={{ flex:1, height:44, borderRadius:9, cursor:"pointer",
                    fontFamily:DISPLAY, fontWeight:700, fontSize:17,
                    background: eValue===v ? GOLD_GRAD : "var(--paper)",
                    color:"var(--ink)",
                    border: eValue===v ? "1.5px solid var(--ink)" : "1px solid var(--line)" }}>{v}</button>
                ))}
              </div>
              <div style={{ ...label, marginBottom:6 }}>When</div>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:14 }}>
                {[...SESSIONS.map(s => [s.id, s.label]), [null, "Extra"]].map(([id, lb]) => (
                  <button key={String(id)} onClick={() => setESession(id)} style={{ fontFamily:SANS, fontWeight:600,
                    fontSize:12.5, padding:"10px 12px", borderRadius:9, cursor:"pointer",
                    background: eSession===id ? GOLD_GRAD : "var(--paper)",
                    color: eSession===id ? "var(--ink)" : "var(--cream)",
                    border: eSession===id ? "1.5px solid var(--ink)" : "1px solid var(--line)" }}>{lb}</button>
                ))}
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <Btn disabled={!eName.trim()} onClick={() => { onEdit({ name:eName, desc:eDesc, value:eValue, session:eSession }); setEditOpen(false); }}
                  style={{ flex:1 }}>Save</Btn>
                <Btn kind="ghost" onClick={() => setEditOpen(false)}>Cancel</Btn>
              </div>
            </div>
          ) : !more ? (
            <button onClick={() => setMore(true)} style={{ background:"none", border:"none", cursor:"pointer",
              fontFamily:SANS, fontWeight:600, fontSize:12.5, color:"var(--accent2)", padding:"10px 0 0",
              display:"block", marginLeft:"auto" }}>More options ▾</button>
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
          <button key={v} onClick={() => setValue(v)} style={{ flex:1, height:44, borderRadius:9, cursor:"pointer",
            fontFamily:DISPLAY, fontWeight:700, fontSize:19,
            background: value===v ? GOLD_GRAD : "var(--paper)",
            color:"var(--ink)",
            border: value===v ? "1.5px solid var(--ink)" : "1px solid var(--line)" }}>{v}</button>
        ))}
      </div>
      <div style={{ ...label, marginBottom:6 }}>When</div>
      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:14 }}>
        {[...SESSIONS.map(s => [s.id, s.label]), [null, "Extra"]].map(([id, lb]) => (
          <button key={String(id)} onClick={() => setSess(id)} style={{ fontFamily:SANS, fontWeight:600, fontSize:13,
            padding:"10px 12px", borderRadius:9, cursor:"pointer",
            background: sess===id ? GOLD_GRAD : "var(--paper)",
            color: sess===id ? "var(--ink)" : "var(--cream)",
            border: sess===id ? "1.5px solid var(--ink)" : "1px solid var(--line)" }}>{lb}</button>
        ))}
      </div>
      <div style={{ ...label, marginBottom:6 }}>Format</div>
      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:16 }}>
        {fmts.map(f => (
          <button key={f.id} onClick={() => setFmt(f.id)} style={{ fontFamily:SANS, fontWeight:600, fontSize:13,
            padding:"10px 12px", borderRadius:9, cursor:"pointer",
            background: fmt===f.id ? GOLD_GRAD : "var(--paper)",
            color: fmt===f.id ? "var(--ink)" : "var(--cream)",
            border: fmt===f.id ? "1.5px solid var(--ink)" : "1px solid var(--line)" }}>{f.label}</button>
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
function BracketSheet({ ev, state, gm, onClose, onPick, onPostResult }) {
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
      {gm && champ !== null && !state.results[ev.id] && (
        <Btn onClick={onPostResult} style={{ width:"100%", marginTop:12 }}>Post the result</Btn>
      )}
    </Sheet>
  );
}

/* ─────────── captains draft (GM sets up + can override; on-clock captain picks) ─────────── */
function DraftSheet({ ev, state, gm, me, standings, pool, onClose, onStart, onPick, onUndo, onFinalize, onCancel }) {
  const d = state.drafts?.[ev.id];
  const N = ev.teamCfg?.teams || 2;
  const seedVal = p => ev.sport
    ? (state.seeds?.[p]?.[ev.sport] ?? 0)
    : -(standings.findIndex(s => s.player === p) + 1 || 999);
  const [capMethod, setCapMethod] = useState("pick");
  const [captains, setCaptains] = useState([]);
  if (!d && !pool) return <Sheet title="Captains draft" onClose={onClose}><p style={pStyle}>No draft to show.</p></Sheet>;

  /* ── setup (GM only reaches this) ── */
  if (!d) {
    const applyMethod = mth => {
      setCapMethod(mth);
      if (mth === "seed") setCaptains([...pool].sort((a,b) => seedVal(b) - seedVal(a)).slice(0, N));
      else if (mth === "random") setCaptains(shuffle(pool).slice(0, N));
      else setCaptains([]);
    };
    const toggleCap = p => setCaptains(c =>
      c.includes(p) ? c.filter(x => x !== p) : c.length < N ? [...c, p] : c);
    const CAP_METHODS = [["pick","Pick them"],["seed", ev.sport ? "Top seeds" : "Top standings"],["random","Random"]];
    return (
      <Sheet title={`${ev.name} draft`} onClose={onClose} wide>
        <div style={{ display:"flex", gap:8, marginBottom:12 }}>
          {CAP_METHODS.map(([id,lb]) => (
            <button key={id} onClick={() => applyMethod(id)} style={{ flex:1, padding:"10px 6px", cursor:"pointer",
              borderRadius:11, fontFamily:SANS, fontWeight:700, fontSize:13,
              background: capMethod===id ? GOLD_GRAD : "var(--paper)", color:"var(--ink)",
              border: capMethod===id ? "1.5px solid var(--ink)" : "1px solid var(--line)" }}>{lb}</button>
          ))}
        </div>
        <div style={{ ...label, marginBottom:8 }}>Captains {captains.length}/{N}</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6, marginBottom:14 }}>
          {(pool || []).map(p => {
            const i = captains.indexOf(p);
            return <PlayerChip key={p} small name={i >= 0 ? `${disp(state,p)} (C${i+1})` : disp(state,p)}
              selected={i >= 0} onClick={() => toggleCap(p)} />;
          })}
        </div>
        <Btn disabled={captains.length !== N} onClick={() => onStart(captains, pool)} style={{ width:"100%" }}>
          Start the draft</Btn>
      </Sheet>
    );
  }

  /* ── live board ── */
  const T = d.teams.length;
  const poolEmpty = d.pool.length === 0;
  const onClock = poolEmpty ? -1 : snakeTeam(d.picks.length, T);
  const cur = onClock >= 0 ? d.teams[onClock].captain : null;
  const myTurn = cur && me === cur;
  const canPick = !poolEmpty && (gm || myTurn);
  const round = Math.floor(d.picks.length / T) + 1;
  return (
    <Sheet title={`${ev.name} draft`} onClose={onClose} wide>
      <div style={{ textAlign:"center", marginBottom:14, padding:"11px", borderRadius:13,
        background: poolEmpty ? "rgba(95,122,69,0.14)" : myTurn ? "rgba(233,180,65,0.35)" : "var(--panel2)",
        border:"1.5px solid " + (poolEmpty ? "var(--green)" : myTurn ? "var(--ink)" : "var(--line)") }}>
        <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:22, textTransform:"uppercase", color:"var(--ink)" }}>
          {poolEmpty ? "Draft complete" : myTurn ? "You're on the clock" : `${disp(state, cur)} is on the clock`}</div>
        {!poolEmpty && <div style={{ fontFamily:SANS, fontSize:12.5, color:"var(--muted2)", marginTop:2 }}>
          Round {round}, {d.pool.length} left</div>}
      </div>

      <div style={{ display:"grid", gridTemplateColumns: T > 2 ? "1fr 1fr" : "1fr 1fr", gap:8, marginBottom:14 }}>
        {d.teams.map((t, i) => (
          <div key={i} style={{ background:"var(--paper)", borderRadius:12, padding:"9px 11px",
            border: i === onClock ? "1.5px solid var(--ink)" : "1px solid var(--line)" }}>
            <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6 }}>
              <Tag tone="gold">C</Tag>
              <span style={{ fontFamily:SANS, fontWeight:700, fontSize:13, color:"var(--accent2)",
                overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{disp(state, t.captain)}</span>
              <span style={{ flex:1 }} />
              <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:15, color:"var(--muted)" }}>{t.players.length}</span>
            </div>
            <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
              {t.players.map(p => <Avatar key={p} state={state} p={p} size={26} />)}
            </div>
          </div>
        ))}
      </div>

      {!poolEmpty && (
        <>
          <div style={{ ...label, marginBottom:8 }}>{canPick ? "Tap to draft" : "Still available"}</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6, marginBottom:12 }}>
            {d.pool.map(p => <PlayerChip key={p} small name={disp(state,p)}
              disabled={!canPick} onClick={() => canPick && onPick(p)} />)}
          </div>
        </>
      )}

      {gm && (
        <div style={{ display:"flex", gap:8 }}>
          {poolEmpty
            ? <Btn onClick={onFinalize} style={{ flex:2 }}>Lock in the teams</Btn>
            : <Btn kind="dark" disabled={!d.picks.length} onClick={onUndo} style={{ flex:1 }}>Undo</Btn>}
          <Btn kind="danger" onClick={onCancel} style={{ flex:1 }}>Cancel</Btn>
        </div>
      )}
      {!gm && !poolEmpty && !myTurn && (
        <p style={{ ...pStyle, textAlign:"center", marginBottom:0 }}>Waiting on {disp(state, cur)} to pick.</p>
      )}
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
    <Sheet title={`${ev.name} result`} onClose={onClose}>
      <div style={{ display:"flex", gap:8, marginBottom:14 }}>
        {slotIdxs.map(i => (
          <button key={i} onClick={() => setActive(i)} style={{ flex:1, padding:"10px 6px", cursor:"pointer",
            borderRadius:12, border:"1px solid " + (active===i ? "var(--gold)" : "var(--line)"),
            background: active===i ? "rgba(192,91,51,0.1)" : "var(--panel2)" }}>
            <div style={{ fontFamily:SANS, fontWeight:700, fontSize:14, color:SLOT_META[i].color }}>
              {ev.kind==="solo" ? SLOT_META[i].label : SLOT_META[i].team}</div>
            <div style={{ fontFamily:SANS, fontSize:11.5, color:"var(--dust)" }}>+{table[i]} each, {slots[i].length} in</div>
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
                background: w === active ? GOLD_GRAD : "var(--paper)",
                border: w === active ? "1.5px solid var(--ink)" : "1px solid var(--line)" }}>
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
            return <PlayerChip key={p} name={w>=0 && w!==active ? `${p} (${SLOT_META[w].label})` : p}
              selected={w===active} onClick={() => toggle(p)} small />;
          })}
        </div>
      )}
      {!!draw?.teams?.length && ev.kind !== "solo" && (
        <button onClick={() => setByPlayer(v => !v)} style={{ background:"none", border:"none", cursor:"pointer",
          fontFamily:SANS, fontWeight:600, fontSize:12.5, color:"var(--accent2)", padding:"0 0 14px", display:"block" }}>
          {byPlayer ? "Back to teams" : "Pick player by player instead"}</button>
      )}
      <Btn disabled={slots[0].length===0} onClick={() => save(slots)} style={{ width:"100%", fontSize:15, padding:"14px", marginTop:4 }}>
        Post result</Btn>
    </Sheet>
  );
}

/* ─────────── how to play ─────────── */
/* flat inline marks, one per event or per sport; fall back to the FD mark */
const svgMark = (s, kids) => (
  <svg width={s} height={s} viewBox="0 0 32 32" aria-hidden="true" style={{ flexShrink:0, display:"block" }}>{kids}</svg>
);
const MARKS = {
  putting: s => svgMark(s, <>
    <path d="M11 27V6" stroke="var(--ink)" strokeWidth="1.8" strokeLinecap="round"/>
    <path d="M11 6l10 3-10 3z" fill="var(--accent)" stroke="var(--ink)" strokeWidth="1.6" strokeLinejoin="round"/>
    <ellipse cx="15" cy="27" rx="8" ry="2.2" fill="var(--paper2)" stroke="var(--ink)" strokeWidth="1.4"/>
  </>),
  "8ball": s => svgMark(s, <>
    <circle cx="16" cy="16" r="11" fill="var(--ink)"/>
    <circle cx="16" cy="16" r="5" fill="var(--paper)"/>
    <text x="16" y="19.4" textAnchor="middle" fontSize="8" fontWeight="700" fontFamily="Archivo, sans-serif" fill="var(--ink)">8</text>
  </>),
  basketball: s => svgMark(s, <>
    <circle cx="16" cy="16" r="11" fill="var(--accent)" stroke="var(--ink)" strokeWidth="1.8"/>
    <path d="M5 16h22M16 5v22M8.5 8c4.5 4 4.5 12 0 16M23.5 8c-4.5 4-4.5 12 0 16" stroke="var(--ink)" strokeWidth="1.3" fill="none"/>
  </>),
  spikeball: s => svgMark(s, <>
    <circle cx="16" cy="8.5" r="3.6" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.7"/>
    <ellipse cx="16" cy="22" rx="11" ry="4.5" fill="var(--sun)" stroke="var(--ink)" strokeWidth="1.8"/>
    <path d="M9 22h14M16 17.5v9" stroke="var(--ink)" strokeWidth="1.1"/>
  </>),
  volleyball: s => svgMark(s, <>
    <circle cx="12" cy="16" r="8" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.8"/>
    <path d="M12 8c3 4 3 12 0 16M5 13.5c5 1.5 12 1 15-3.5" stroke="var(--ink)" strokeWidth="1.1" fill="none"/>
    <path d="M25 5v22" stroke="var(--ink)" strokeWidth="1.5" strokeDasharray="2 2"/>
  </>),
  die: s => svgMark(s, <>
    <rect x="6" y="6" width="20" height="20" rx="5" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.8"/>
    <circle cx="11.5" cy="11.5" r="1.8" fill="var(--ink)"/><circle cx="20.5" cy="11.5" r="1.8" fill="var(--ink)"/>
    <circle cx="16" cy="16" r="1.8" fill="var(--ink)"/>
    <circle cx="11.5" cy="20.5" r="1.8" fill="var(--ink)"/><circle cx="20.5" cy="20.5" r="1.8" fill="var(--ink)"/>
  </>),
  beerio: s => svgMark(s, <>
    <circle cx="13" cy="16" r="9" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.8"/>
    <circle cx="13" cy="16" r="3" fill="var(--accent)" stroke="var(--ink)" strokeWidth="1.3"/>
    <path d="M13 8.5v4.5M8 20l3.5-2.5" stroke="var(--ink)" strokeWidth="1.5" strokeLinecap="round"/>
    <rect x="21" y="12" width="6" height="10" rx="1.5" fill="var(--sun)" stroke="var(--ink)" strokeWidth="1.5"/>
  </>),
  pickleball: s => svgMark(s, <>
    <ellipse cx="13" cy="12.5" rx="8" ry="9" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.8"/>
    <path d="M11 21l-3.5 6" stroke="var(--ink)" strokeWidth="2.2" strokeLinecap="round"/>
    <circle cx="23" cy="21" r="4.5" fill="var(--sun)" stroke="var(--ink)" strokeWidth="1.5"/>
    <circle cx="21.6" cy="20" r="0.7" fill="var(--ink)"/><circle cx="24" cy="20" r="0.7" fill="var(--ink)"/><circle cx="22.8" cy="22.4" r="0.7" fill="var(--ink)"/>
  </>),
  foosball: s => svgMark(s, <>
    <path d="M16 3v26" stroke="var(--ink)" strokeWidth="1.8" strokeLinecap="round"/>
    <rect x="11" y="12" width="10" height="8" rx="2" fill="var(--accent)" stroke="var(--ink)" strokeWidth="1.6"/>
    <path d="M12.5 20l-2 5M19.5 20l2 5" stroke="var(--ink)" strokeWidth="1.6" strokeLinecap="round"/>
    <circle cx="8" cy="24.5" r="2" fill="var(--sun)" stroke="var(--ink)" strokeWidth="1.3"/>
  </>),
  pingpong: s => svgMark(s, <>
    <circle cx="14" cy="13" r="8" fill="var(--accent)" stroke="var(--ink)" strokeWidth="1.8"/>
    <path d="M12 20.5l-4 6.5" stroke="var(--ink)" strokeWidth="2.2" strokeLinecap="round"/>
    <circle cx="24" cy="22" r="3" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.5"/>
  </>),
  pong: s => svgMark(s, <>
    <path d="M10 12h12l-1.5 13h-9z" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.8" strokeLinejoin="round"/>
    <ellipse cx="16" cy="12" rx="6" ry="1.8" fill="var(--paper2)" stroke="var(--ink)" strokeWidth="1.4"/>
    <circle cx="16" cy="6" r="2.6" fill="var(--sun)" stroke="var(--ink)" strokeWidth="1.4"/>
  </>),
  flipcup: s => svgMark(s, <>
    <path d="M6 27a10 5 0 0 1 20 0" fill="none" stroke="var(--ink)" strokeWidth="1.1" strokeDasharray="2 2"/>
    <g transform="rotate(34 16 15)">
      <path d="M12 9h8l-1 11h-6z" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.8" strokeLinejoin="round"/>
      <ellipse cx="16" cy="9" rx="4" ry="1.4" fill="var(--paper2)" stroke="var(--ink)" strokeWidth="1.2"/>
    </g>
  </>),
  ragecage: s => svgMark(s, <>
    <circle cx="16" cy="16" r="3.6" fill="var(--accent)" stroke="var(--ink)" strokeWidth="1.5"/>
    {[0,60,120,180,240,300].map(a => {
      const r = 10, x = 16 + r*Math.cos(a*Math.PI/180), y = 16 + r*Math.sin(a*Math.PI/180);
      return <circle key={a} cx={x} cy={y} r="2.6" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.4"/>;
    })}
  </>),
};
function GameMark({ id, size=54 }) {
  const draw = MARKS[id];
  return draw ? draw(size) : <FDMark size={size} />;
}
/* beer die flagship: a die that arcs and bounces off the far edge of the table */
function DieHero() {
  return (
    <svg width="180" height="82" viewBox="0 0 180 82" aria-hidden="true" style={{ display:"block", overflow:"visible" }}>
      <line x1="8" y1="60" x2="172" y2="60" stroke="var(--sun)" strokeWidth="3" strokeLinecap="round"/>
      <line x1="8" y1="66" x2="172" y2="66" stroke="var(--ink)" strokeWidth="1.6" strokeLinecap="round" opacity="0.4"/>
      <g style={{ animation:"si-die-arc 2.6s linear 1 both" }}>
        <rect x="0" y="0" width="20" height="20" rx="4.5" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.8"/>
        <circle cx="5.5" cy="5.5" r="1.7" fill="var(--ink)"/>
        <circle cx="14.5" cy="5.5" r="1.7" fill="var(--ink)"/>
        <circle cx="10" cy="10" r="1.7" fill="var(--ink)"/>
        <circle cx="5.5" cy="14.5" r="1.7" fill="var(--ink)"/>
        <circle cx="14.5" cy="14.5" r="1.7" fill="var(--ink)"/>
      </g>
    </svg>
  );
}
/* pong ball arcs down the table and drops in the cup */
function PongHero() {
  return (
    <svg width="180" height="82" viewBox="0 0 180 82" aria-hidden="true" style={{ display:"block", overflow:"visible" }}>
      <line x1="8" y1="60" x2="172" y2="60" stroke="var(--sun)" strokeWidth="3" strokeLinecap="round"/>
      <path d="M112 30h20l-2.5 28h-15z" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.8" strokeLinejoin="round"/>
      <ellipse cx="122" cy="30" rx="10" ry="3" fill="var(--paper2)" stroke="var(--ink)" strokeWidth="1.4"/>
      <g style={{ animation:"si-pong-arc 2s linear 1 both" }}>
        <circle cx="8" cy="0" r="5.5" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.6"/>
      </g>
    </svg>
  );
}
/* flip cup: the cup hops, turns over, and sticks the landing */
function FlipHero() {
  return (
    <svg width="180" height="82" viewBox="0 0 180 82" aria-hidden="true" style={{ display:"block", overflow:"visible" }}>
      <line x1="8" y1="62" x2="172" y2="62" stroke="var(--sun)" strokeWidth="3" strokeLinecap="round"/>
      <g style={{ animation:"si-flip-cup 2.2s ease-in-out 1 both", transformOrigin:"90px 46px" }}>
        <path d="M78 32h24l-3 28H81z" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.8" strokeLinejoin="round"/>
        <ellipse cx="90" cy="32" rx="12" ry="3.4" fill="var(--paper2)" stroke="var(--ink)" strokeWidth="1.4"/>
      </g>
    </svg>
  );
}
const GAME_HEROES = { die: DieHero, pong: PongHero, flipcup: FlipHero };
/* optional, on-demand rules for one game. Purely client-side, nested over the sheet below. */
function HowToSheet({ gameId, variant, onClose }) {
  const game = GAMES[gameId];
  const variants = game?.variants || null;
  const [vIdx, setVIdx] = useState(() => {
    const i = variants ? variants.findIndex(v => v.id === variant) : -1;
    return i < 0 ? 0 : i;
  });
  const h = variants ? variants[vIdx]?.howto : game?.howto;
  const steps = h?.steps || [];
  const rm = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const [shown, setShown] = useState(rm ? steps.length : 0);
  const [heroKey, setHeroKey] = useState(0);
  useEffect(() => { setShown(rm ? steps.length : 0); }, [vIdx]); // eslint-disable-line
  useEffect(() => {
    if (shown >= steps.length) return;
    const t = setTimeout(() => setShown(s => s + 1), shown === 0 ? 320 : 480);
    return () => clearTimeout(t);
  }, [shown, steps.length]);
  if (!h) return null;
  const Hero = GAME_HEROES[gameId];
  return (
    <Sheet title="How to play" onClose={onClose}>
      <div onClick={() => Hero && setHeroKey(k => k + 1)}
        style={{ display:"flex", justifyContent:"center", alignItems:"center", minHeight:66, marginBottom:6,
          cursor: Hero ? "pointer" : "default" }}>
        {Hero ? <span key={heroKey}><Hero /></span>
          : <span style={{ animation:"si-pop .4s ease-out" }}><GameMark id={gameId} size={56} /></span>}
      </div>
      <div style={{ ...label, textAlign:"center", marginBottom:5 }}>{game.name}</div>
      {variants && (
        <div style={{ display:"flex", justifyContent:"center", gap:6, marginBottom:12 }}>
          {variants.map((v, i) => (
            <button key={v.id} onClick={() => setVIdx(i)} style={{ fontFamily:DISPLAY, fontWeight:700,
              fontSize:16, padding:"7px 18px", borderRadius:99, cursor:"pointer",
              background: i === vIdx ? "var(--ink)" : "var(--paper)",
              color: i === vIdx ? BONE : "var(--ink)",
              border: i === vIdx ? "1.5px solid var(--ink)" : "1px solid var(--line)" }}>{v.label}</button>
          ))}
        </div>
      )}
      {h.objective && <p style={{ ...pStyle, textAlign:"center", marginBottom:12 }}>{h.objective}</p>}
      <div style={{ display:"flex", gap:6, flexWrap:"wrap", justifyContent:"center", marginBottom:16 }}>
        {h.players && <Tag tone="gold">{h.players}</Tag>}
        {(h.gear || []).map(g => <Tag key={g}>{g}</Tag>)}
      </div>
      <ol style={{ listStyle:"none", padding:0, margin:"0 0 16px" }}>
        {steps.map((s, i) => (
          <li key={i} style={{ display:"flex", gap:12, alignItems:"flex-start", padding:"9px 0",
            borderBottom: i < steps.length-1 ? "1px solid var(--line)" : "none",
            visibility: i < shown ? "visible" : "hidden",
            animation: i < shown ? "si-in .32s ease-out both" : "none" }}>
            <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:20, lineHeight:1, color:"var(--accent2)",
              minWidth:20, textAlign:"center" }}>{i+1}</span>
            <span style={{ fontFamily:SANS, fontSize:14.5, lineHeight:1.5, color:"var(--muted2)" }}>{s}</span>
          </li>
        ))}
      </ol>
      <div style={{ background:"var(--paper2)", border:"1.5px solid var(--ink)", borderRadius:12,
        padding:"11px 13px", marginBottom: h.house ? 10 : 0 }}>
        <div style={{ ...label, fontSize:11, marginBottom:4 }}>To win</div>
        <div style={{ fontFamily:SANS, fontSize:14, lineHeight:1.5, color:"var(--ink)" }}>{h.win}</div>
      </div>
      {h.house && (
        <div style={{ fontFamily:SANS, fontSize:13, lineHeight:1.5, color:"var(--dust)" }}>
          <b style={{ color:"var(--accent2)" }}>House rule.</b> {h.house}
        </div>
      )}
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
  if (w.kind === "match") return { pick: pickName, ctx: `to win the ${w.matchName || "matchup"} in ${evName}` };
  if (w.final) return { pick: pickName, ctx: `to win the Final in ${evName}` };
  return { pick: pickName, ctx: `to advance from ${w.groupName} in ${evName}` };
}

function Wagers({ state, me, standings, gm, events, onDeckEv, onPick, onVoid, onRetract }) {
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

  /* the whiteboard row: one tap drops a chip, everyone's chips sit on the pick
     in their own colors, and the x pulls your last one back */
  const PickRow = ({ players, name, onClick, wide, pred }) => {
    const bets = pred ? pending.filter(x => pred(x.w)) : [];
    const mineBets = bets.filter(x => x.w.player === me);
    const mine = mineBets.reduce((s, x) => s + x.w.stake, 0);
    const chips = bets.flatMap(x => Array.from({ length: x.w.stake }, () => x.w.player));
    const shownChips = chips.slice(0, 6);
    return (
      <button onClick={room < 1 ? undefined : onClick}
        style={{ display:"flex", alignItems:"center", gap:8, padding: wide ? "10px 12px" : "8px 10px",
          borderRadius:12, width:"100%",
          background:"var(--panel2)",
          border:"1px solid " + (mine > 0 ? "rgba(192,91,51,0.55)" : "var(--line)"),
          cursor: room < 1 ? "default" : "pointer",
          opacity: room < 1 && !mine ? 0.5 : 1, textAlign:"left" }}>
        <AvatarStack state={state} players={players} size={wide ? 28 : 24} max={wide ? 5 : 3} />
        <span style={{ fontFamily:SANS, fontWeight:600, fontSize: wide ? 14 : 12.5, color:"var(--cream)",
          overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1 }}>{name}</span>
        {chips.length > 0 && (
          <span onClick={e => e.stopPropagation()} style={{ display:"flex", alignItems:"center", flexShrink:0 }}>
            {shownChips.map((p, i) => <span key={i} style={{ marginLeft: i ? -5 : 0 }}><BankChip p={p} size={16} /></span>)}
            {chips.length > shownChips.length && <span style={{ fontFamily:SANS, fontWeight:700, fontSize:10.5,
              color:"var(--muted2)", marginLeft:3 }}>+{chips.length - shownChips.length}</span>}
            {mine > 0 && (
              <span onClick={() => onRetract(mineBets[mineBets.length - 1].w.id)} role="button"
                style={{ width:22, height:22, borderRadius:99, display:"flex", alignItems:"center",
                  justifyContent:"center", cursor:"pointer", marginLeft:4, fontSize:11,
                  background:"rgba(42,33,25,0.08)", color:"var(--muted2)" }}>✕</span>
            )}
          </span>
        )}
      </button>
    );
  };

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
            <b>{disp(state, w.player)}</b> put {w.stake} on <b style={{ color:"var(--accent2)" }}>{l.pick}</b>
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
        <div style={{ display:"flex", alignItems:"center", gap:14, background:CARD_BG,
          border:"1px solid var(--line)", borderRadius:15, padding:"12px 14px", marginBottom:12 }}>
          <Avatar state={state} p={me} size={34} />
          <div style={{ flex:1, minWidth:0, fontFamily:SANS, fontWeight:700, fontSize:14, color:"var(--cream)",
            overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{disp(state, me)}</div>
          <div style={{ textAlign:"center" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:7, height:26 }}>
              <div style={{ position:"relative", width:18, height:26, flexShrink:0 }}>
                {[0,1,2].map(i => <div key={i} style={{ position:"absolute", bottom:i*4, left:0 }}>
                  <BankChip p={me} size={18} /></div>)}
              </div>
              <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:26, lineHeight:1, color:"var(--ink)" }}>{myPts}</span>
            </div>
            <div style={{ ...label, fontSize:9.5, marginTop:3 }}>Stack</div>
          </div>
          <div style={{ width:1, alignSelf:"stretch", background:"var(--line)" }} />
          <div style={{ textAlign:"center" }}>
            <div style={{ display:"flex", gap:5, alignItems:"center", height:26 }}>
              {[1,2,3].map(i => <BankChip key={i} p={me} size={18} empty={i > myExp} />)}
            </div>
            <div style={{ ...label, fontSize:9.5, marginTop:3 }}>On the table</div>
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
        <div style={{ borderRadius:14, border:"1px solid rgba(42,33,25,0.3)", overflow:"hidden",
          background:"var(--paper)", boxShadow:"0 4px 16px rgba(42,33,25,0.08)", marginBottom:16 }}>
          <div style={{ display:"flex", alignItems:"center", gap:9, padding:"7px 13px",
            background:"var(--clay)", color:BONE }}>
            <span style={{ width:8, height:8, borderRadius:99, background:BONE, animation:"si-pulse 1.6s infinite" }} />
            <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:19, letterSpacing:"0.02em",
              textTransform:"uppercase", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{ev.name}</span>
            <span style={{ fontFamily:SANS, fontWeight:700, fontSize:10.5, letterSpacing:"0.06em" }}>BETTING OPEN</span>
          </div>
          <div style={{ padding:"12px 13px 8px" }}>

          {/* the whiteboard: live event state up top, chips ride on the picks below */}
          {br && draw && (
            <div style={{ marginBottom:14, overflowX:"auto" }}>
              <BracketGrid state={state} ev={ev} gm={false} />
            </div>
          )}
          {st && !br && (
            <div style={{ marginBottom:14 }}>
              <StageGrid state={state} ev={ev} gm={false} />
            </div>
          )}

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
                    pred={w => w.kind === "outright" && w.eventId === ev.id &&
                      (o.pick.pickTeam
                        ? w.pickTeam && w.drawId === o.pick.drawId && (w.pickPlayers||[]).join("|") === o.pick.pickPlayers.join("|")
                        : !w.pickTeam && w.pick === o.key)}
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
                        pred={w => w.kind === "stage" && w.stagesId === st.id && !w.final &&
                          w.group === g.gi && w.pickKey === k}
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
                    pred={w => w.kind === "stage" && w.stagesId === st.id && w.final && w.pickKey === k}
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
                            pred={w => w.kind === "match" && w.eventId === ev.id &&
                              w.drawId === draw.id && w.match?.[0] === mu.r && w.match?.[1] === mu.m &&
                              w.teamIdx === tIdx}
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
        </div>
      )}

      {pending.length > 0 && <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:15, letterSpacing:"0.08em",
        textTransform:"uppercase", background:"var(--ink)", color:BONE, borderRadius:5,
        padding:"3px 10px", margin:"4px 0 8px" }}>{pending.length} open</div>}
      {pending.map(x => <Row key={x.w.id} x={x} />)}
      {settled.length > 0 && <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:15, letterSpacing:"0.08em",
        textTransform:"uppercase", background:"var(--paper2)", color:"var(--muted2)", borderRadius:5,
        padding:"3px 10px", margin:"14px 0 8px", border:"1px solid var(--line)" }}>Settled</div>}
      {settled.map(x => <Row key={x.w.id} x={x} />)}
    </div>
  );
}


/* ─────────── QA bar (GM only, real names) ─────────── */
function QABar({ me, onSwitch, onReset, onRerun, onExit, sim, onStop, guestLens, onLens,
  onSimBets, onPlayNext, onFastForward, minimized, onMin, top, onPos }) {
  const [confirm, setConfirm] = useState(false);
  const small = { fontFamily:SANS, fontWeight:700, fontSize:11, letterSpacing:"0.08em",
    textTransform:"uppercase", padding:"6px 10px", borderRadius:9, cursor:"pointer", flexShrink:0 };
  if (minimized) return (
    <button onClick={onMin} style={{ position:"fixed", left:14, zIndex:55,
      bottom:"calc(74px + env(safe-area-inset-bottom))", display:"flex", alignItems:"center", gap:7,
      background:"var(--sun)", color:"var(--ink)", border:"1.5px solid var(--ink)", borderRadius:99,
      padding:"9px 14px", cursor:"pointer", fontFamily:DISPLAY, fontWeight:700, fontSize:14,
      letterSpacing:"0.06em", boxShadow:"0 6px 20px rgba(42,33,25,0.3)" }}>
      {sim && <span style={{ width:7, height:7, borderRadius:99, background:"var(--clay)",
        animation:"si-pulse 1s infinite" }} />}QA</button>
  );
  return (
    <div style={{ position:"fixed", zIndex:55, left:0, right:0, display:"flex", justifyContent:"center",
      pointerEvents:"none",
      ...(top ? { top:"calc(64px + env(safe-area-inset-top))" }
              : { bottom:"calc(66px + env(safe-area-inset-bottom))" }) }}>
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
          <button onClick={onPos} title="Dock top or bottom" style={{ background:"none", border:"1px solid rgba(251,243,228,0.3)",
            color:"#FBF3E4", width:26, height:26, borderRadius:8, fontSize:11, cursor:"pointer", flexShrink:0 }}>{top ? "▾" : "▴"}</button>
          <button onClick={onMin} title="Minimize" style={{ background:"none", border:"1px solid rgba(251,243,228,0.3)",
            color:"#FBF3E4", width:26, height:26, borderRadius:8, fontSize:13, cursor:"pointer", flexShrink:0 }}>–</button>
          <button onClick={onExit} style={{ background:"var(--panel2)", border:"1px solid var(--line)",
            color:"var(--ink)", width:26, height:26, borderRadius:8, fontSize:11, cursor:"pointer", flexShrink:0 }}>✕</button>
        </div>
        <div style={{ display:"flex", gap:6, overflowX:"auto", marginBottom:7 }}>
          {ROSTER.map(p => (
            <button key={p} onClick={() => onSwitch(p)} style={{ fontFamily:SANS, fontWeight:600,
              fontSize:12, padding:"6px 11px", borderRadius:99, cursor:"pointer", flexShrink:0,
              background: me === p ? "var(--sun)" : "var(--panel2)",
              color:"var(--ink)",
              border: me === p ? "1px solid var(--ink)" : "1px solid var(--line)" }}>{p}</button>
          ))}
        </div>
        {sim ? (
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ width:7, height:7, borderRadius:99, background:"var(--sun)",
              animation:"si-pulse 1s infinite", flexShrink:0 }} />
            <span style={{ fontFamily:SANS, fontWeight:600, fontSize:12, color:"#FBF3E4", flex:1, minWidth:0,
              overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{sim}</span>
            <button onClick={onStop} style={{ ...small, background:"#B23B2E", border:"none", color:"#FBF3E4" }}>Stop</button>
          </div>
        ) : (
          <div style={{ display:"flex", gap:6, overflowX:"auto" }}>
            {[["Sim bets", onSimBets], ["Play next event", onPlayNext], ["To the Finale", onFastForward]].map(([lb, fn]) => (
              <button key={lb} onClick={fn} style={{ ...small,
                background:"var(--panel2)", border:"1px solid var(--line)", color:"var(--ink)" }}>{lb}</button>
            ))}
            <button onClick={onLens} style={{ ...small,
              background: guestLens ? "var(--sun)" : "transparent",
              border: guestLens ? "1px solid var(--ink)" : "1px solid rgba(251,243,228,0.35)",
              color: guestLens ? "var(--ink)" : "#FBF3E4" }}>
              {guestLens ? "Guest view on" : "Guest view"}</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────── GM sheets ─────────── */
function AdjustSheet({ player, onClose, save }) {
  const [delta, setDelta] = useState(1);
  const [reason, setReason] = useState("");
  return (
    <Sheet title={`Ruling for ${player}`} onClose={onClose}>
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
  const [num, setNum] = useState(state.profiles?.[me]?.num != null ? String(state.profiles[me].num) : "");
  const [size, setSize] = useState(state.profiles?.[me]?.size ?? null);
  if (!me) return null;
  return (
    <Sheet title="Your profile" onClose={onClose}>
      <div style={{ border:"1.5px solid var(--ink)", borderRadius:10, overflow:"hidden", marginBottom:16 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, background:playerColor(me), color:BONE,
          padding:"7px 12px" }}>
          <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:16, letterSpacing:"0.05em",
            textTransform:"uppercase", flex:1 }}>Player credential</span>
          <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:16 }}>NO. {String(state.profiles?.[me]?.num ?? playerNo(me)).padStart(2,"0")}</span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 12px", background:"var(--paper2)" }}>
          <Avatar state={state} p={me} size={40} />
          <div>
            <div style={{ fontFamily:SANS, fontWeight:700, fontSize:15, color:"var(--ink)" }}>{disp(state, me)}</div>
            <div style={{ fontFamily:SANS, fontSize:11.5, color:"var(--muted)" }}>Scottsdale · 2026</div>
          </div>
        </div>
      </div>
      <ProfileEditor state={state} me={me} display={display} setDisplay={setDisplay} photo={photo} setPhoto={setPhoto}
        num={num} setNum={setNum} size={size} setSize={setSize} />
      <Btn disabled={!display.trim()} onClick={() => save({ display: display.trim(),
          num: num === "" ? null : Number(num), size, ...(photo ? {photo} : {}) })}
        style={{ width:"100%", fontSize:15, padding:"14px", marginTop:16 }}>Save</Btn>
    </Sheet>
  );
}

/* ─────────── reveal (draws, heats, pools) ─────────── */
function Reveal({ state, reveal, big, auto, onClose, onBets }) {
  const items = reveal.versus ? 2 : reveal.groups.length;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (shown >= items) return;
    const t = setTimeout(() => setShown(s => s + 1), shown === 0 ? 900 : 1300);
    return () => clearTimeout(t);
  }, [shown, items]);
  const doneAll = shown >= items;
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    if (!auto || !doneAll) return;
    const t = setTimeout(() => closeRef.current(), 6000);
    return () => clearTimeout(t);
  }, [auto, doneAll]);
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
      {doneAll && !auto && (
        <div style={{ display:"flex", gap:10, marginTop: big ? 30 : 22, animation:"si-in .3s both" }}>
          {onBets && <Btn onClick={onBets} style={{ fontSize:15, padding:"13px 28px" }}>To the bets</Btn>}
          <Btn kind={onBets ? "ghost" : "primary"} onClick={onClose} style={{ fontSize:15, padding:"13px 28px" }}>Close</Btn>
        </div>
      )}
      {!doneAll && !auto && <button onClick={() => setShown(items)} style={{ marginTop:20, background:"none",
        border:"none", color:"#B7A386", fontFamily:SANS, fontSize:13, cursor:"pointer" }}>skip</button>}
    </div>
  );
}

/* ─────────── TV mode ─────────── */
/* one point as a poker chip; empty renders the open table spot it could fill */
function BankChip({ p, size=18, empty }) {
  if (empty) return <div style={{ width:size, height:size, borderRadius:"50%",
    border:"1.5px dashed var(--muted)", opacity:0.45, flexShrink:0 }} />;
  return <div style={{ width:size, height:size, borderRadius:"50%", background:playerColor(p),
    border:"1.5px solid var(--ink)", flexShrink:0,
    boxShadow:`inset 0 0 0 ${Math.max(2.5, size*0.09)}px rgba(251,243,228,0.5)` }} />;
}
/* poker-chip stack for one bet: colored chips to the stake height, bettor on top */
function ChipStack({ state, player, stake, size=44 }) {
  const c = playerColor(player);
  const lift = Math.round(size * 0.2);
  return (
    <div style={{ position:"relative", width:size, height:size + (stake - 1) * lift, flexShrink:0 }}>
      {Array.from({ length: stake }).map((_, i) => (
        <div key={i} style={{ position:"absolute", bottom:i * lift, left:0 }}>
          {i === stake - 1
            ? <Avatar state={state} p={player} size={size} />
            : <div style={{ width:size, height:size, borderRadius:"50%", background:c,
                border:"1.5px solid var(--ink)", boxShadow:`inset 0 0 0 ${Math.max(3, size*0.09)}px rgba(251,243,228,0.5)` }} />}
        </div>
      ))}
    </div>
  );
}
/* the betting board: one cell per live pick, bets sit on it as chip stacks */
function BetsBoard({ state, events, ev, big, compact }) {
  const open = (state.wagers || []).map(w => ({ w, r: resolveWager(state, w, events) }))
    .filter(x => x.r.status === "pending" && x.w.eventId === ev.id);
  const cells = new Map();
  open.forEach(x => {
    const w = x.w;
    const k = w.kind === "outright" ? "o:" + (w.pickTeam ? (w.pickPlayers || []).join("+") : w.pick)
      : w.kind === "match" ? `m:${w.match?.join("-")}:${w.teamIdx}` : `s:${w.final ? "F" : w.group}:${w.pickKey}`;
    if (!cells.has(k)) {
      const l = wagerPickLabel(state, w, events);
      cells.set(k, { name: l.pick, bets: [] });
    }
    cells.get(k).bets.push({ player: w.player, stake: w.stake });
  });
  const list = [...cells.values()];
  if (!list.length) return compact ? null : (
    <div style={{ fontFamily:SANS, fontSize: big ? "clamp(16px,1.8vw,24px)" : 15, color:"#C9B896",
      textAlign:"center", padding:"30px 0" }}>Betting is open. No bets in yet.</div>
  );
  const chip = compact ? 30 : 44;
  return (
    <div style={{ display:"flex", flexWrap:"wrap", gap: compact ? 8 : 14,
      justifyContent: big ? "center" : "flex-start", alignItems:"flex-end" }}>
      {list.map((cell, i) => (
        <div key={i} style={{ background:CARD_BG, border: compact ? "1px solid var(--line)" : "1.5px solid var(--ink)",
          borderRadius:12, padding: compact ? "7px 10px 9px" : "10px 14px 12px", minWidth: compact ? 96 : 150 }}>
          <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize: compact ? 13.5 : big ? "clamp(16px,1.6vw,22px)" : 16,
            textTransform:"uppercase", color:"var(--ink)", marginBottom: compact ? 7 : 10, whiteSpace:"nowrap",
            overflow:"hidden", textOverflow:"ellipsis", maxWidth: compact ? 150 : 230 }}>{cell.name}</div>
          <div style={{ display:"flex", gap: compact ? 6 : 8, alignItems:"flex-end", flexWrap:"wrap" }}>
            {cell.bets.map((b, j) => <ChipStack key={j} state={state} player={b.player} stake={b.stake} size={chip} />)}
          </div>
        </div>
      ))}
    </div>
  );
}
/* compact standings rail for live scenes */
function TVMiniBoard({ state, standings, allTied }) {
  return (
    <div style={{ width:320, flexShrink:0, background:CARD_BG, border:"1px solid var(--line)",
      borderRadius:14, overflow:"hidden", alignSelf:"flex-start" }}>
      <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:16, letterSpacing:"0.06em",
        textTransform:"uppercase", background:"var(--paper2)", color:"var(--muted2)",
        padding:"6px 14px", borderBottom:"1px solid var(--line)" }}>Standings</div>
      {standings.map((r, i) => (
        <div key={r.player} style={{ display:"flex", alignItems:"center", gap:10,
          padding:"clamp(3px,0.55vh,7px) 14px", borderTop: i > 0 ? "1px solid var(--line)" : "none",
          background: i === 0 && !allTied ? "var(--sun)" : "transparent" }}>
          <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:16, width:20, textAlign:"center",
            color: i === 0 && !allTied ? "var(--ink)" : "var(--muted)" }}>{allTied ? "·" : r.rank}</span>
          <Avatar state={state} p={r.player} size={24} />
          <span style={{ fontFamily:SANS, fontWeight:700, fontSize:14, color:"var(--ink)", flex:1,
            overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{disp(state, r.player)}</span>
          <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:18, color:"var(--ink)" }}>{r.pts}</span>
        </div>
      ))}
    </div>
  );
}

/* the draft, broadcast style: on-the-clock captain up top, pick stamps slam in,
   team columns fill live, the remaining pool waits at the bottom */
function TVDraft({ state, ev, d }) {
  const T = d.teams.length;
  const poolEmpty = d.pool.length === 0;
  const onClock = poolEmpty ? -1 : snakeTeam(d.picks.length, T);
  const cur = onClock >= 0 ? d.teams[onClock].captain : null;
  const last = d.picks[d.picks.length - 1];
  const round = Math.floor(d.picks.length / T) + 1;
  return (
    <div key="scene-draft" style={{ flex:1, display:"flex", flexDirection:"column", minHeight:0,
      padding:"6px 48px 16px", animation:"si-fade .6s ease-out" }}>
      <div style={{ display:"flex", alignItems:"center", gap:26, marginBottom:16 }}>
        {poolEmpty ? (
          <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:"clamp(30px,3vw,48px)",
            textTransform:"uppercase", color:"var(--sun)" }}>Draft complete</div>
        ) : (
          <div style={{ display:"flex", alignItems:"center", gap:18 }}>
            <span style={{ borderRadius:"50%", animation:"si-glow 2s infinite" }}>
              <Avatar state={state} p={cur} size={84} ring />
            </span>
            <div>
              <div style={{ ...label, fontSize:"clamp(12px,1.1vw,16px)", color:"#C9B896" }}>{ev.name} draft</div>
              <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:"clamp(30px,3vw,48px)", lineHeight:1.05,
                textTransform:"uppercase", color:BONE }}>{disp(state, cur)} is on the clock</div>
              <div style={{ fontFamily:SANS, fontWeight:600, fontSize:"clamp(13px,1.2vw,17px)", color:"#C9B896", marginTop:2 }}>
                Round {round}, pick {d.picks.length + 1}</div>
            </div>
          </div>
        )}
        {last && (
          <div key={d.picks.length} style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:14,
            background:CARD_BG, border:"2px solid var(--ink)", borderRadius:16, padding:"12px 20px",
            animation:"si-flag .55s ease-out both" }}>
            <span style={{ ...label, fontSize:"clamp(11px,1vw,14px)" }}>Pick {d.picks.length}</span>
            <Avatar state={state} p={last.player} size={46} />
            <div>
              <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:"clamp(19px,1.9vw,28px)", lineHeight:1,
                textTransform:"uppercase", color:"var(--ink)" }}>{disp(state, last.player)}</div>
              <div style={{ fontFamily:SANS, fontWeight:600, fontSize:"clamp(12px,1.1vw,15px)", color:"var(--muted2)" }}>
                to {disp(state, d.teams[last.team].captain)}</div>
            </div>
          </div>
        )}
      </div>
      <div style={{ display:"grid", gridTemplateColumns:`repeat(${T},1fr)`, gap:16, flex:1, minHeight:0 }}>
        {d.teams.map((t, i) => (
          <div key={i} style={{ background:CARD_BG, borderRadius:16, padding:"13px 15px", overflowY:"auto",
            border: i === onClock ? "2px solid var(--sun)" : "1px solid var(--line)",
            animation: i === onClock ? "si-glow 2s infinite" : "none" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, paddingBottom:9, marginBottom:9,
              borderBottom:"1.5px solid var(--ink)" }}>
              <Avatar state={state} p={t.captain} size={34} />
              <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:"clamp(16px,1.6vw,24px)",
                textTransform:"uppercase", color:"var(--ink)", flex:1, overflow:"hidden",
                textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{disp(state, t.captain)}</span>
              <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:"clamp(15px,1.5vw,22px)",
                color:"var(--muted)" }}>{t.players.length}</span>
            </div>
            {t.players.map(p => (
              <div key={p} style={{ display:"flex", alignItems:"center", gap:10, padding:"5px 0",
                animation:"si-in .3s ease-out both" }}>
                <Avatar state={state} p={p} size={30} />
                <span style={{ fontFamily:SANS, fontWeight:600, fontSize:"clamp(13px,1.3vw,18px)",
                  color:"var(--ink)" }}>{disp(state, p)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      {!poolEmpty && (
        <div style={{ display:"flex", alignItems:"center", gap:12, marginTop:14 }}>
          <span style={{ ...label, fontSize:"clamp(11px,1vw,14px)", color:"#C9B896", flexShrink:0 }}>
            Still on the board</span>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            {d.pool.map(p => <Avatar key={p} state={state} p={p} size={38} />)}
          </div>
        </div>
      )}
    </div>
  );
}

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
  const draftLive = useMemo(() => {
    for (const [eid, d] of Object.entries(state.drafts || {})) {
      const ev = events.find(e => e.id === eid);
      if (ev && d) return { ev, d };
    }
    return null;
  }, [state.drafts, events]);
  /* ambient broadcast data: the channel cycles through whatever is alive right now */
  let latest = null;
  Object.entries(state.results || {}).forEach(([eid, res]) => {
    const ev = events.find(e => e.id === eid);
    if (ev && res?.slots?.[0]?.length && (!latest || res.ts > latest.res.ts)) latest = { ev, res };
  });
  const nextEv = events.find(e => !state.results[e.id] && !state.shelved[e.id] && e.id !== onDeckEv?.id);
  const openBook = (state.wagers || [])
    .map(w => ({ w, r: resolveWager(state, w, events) }))
    .filter(x => x.r.status === "pending").slice(0, 9);
  const scen = useMemo(() => {
    const finaleNext = onDeckEv?.finale ||
      events.find(e => !state.results[e.id] && !state.shelved[e.id])?.finale;
    return finaleNext ? computeScenarios(state) : null;
  }, [state, events, onDeckEv]);
  const joinNeeded = Object.keys(state.profiles || {}).length < ROSTER.length;
  const qrUrl = useMemo(() => {
    try {
      const qr = qrcode(0, "M");
      qr.addData(window.location.origin);
      qr.make();
      return qr.createDataURL(8, 0);
    } catch { return null; }
  }, []);

  const liveEv = onDeckEv || liveBracketEv || liveStageEv;
  const scenes = useMemo(() => {
    const s = ["board"];
    if (champion) return s;
    if (joinNeeded && qrUrl) s.push("join");
    if (scen && scen.alive.length) s.push("finale");
    if (nextEv) s.push("next");
    if (latest) s.push("latest");
    if (openBook.length) s.push("book");
    return s;
  }, [champion, joinNeeded, qrUrl, scen, nextEv, latest, openBook.length]);
  const [sceneIdx, setSceneIdx] = useState(0);
  useEffect(() => { setSceneIdx(0); }, [scenes.length]);
  useEffect(() => {
    if (scenes.length < 2) return;
    const t = setInterval(() => setSceneIdx(i => (i + 1) % scenes.length), 12000);
    return () => clearInterval(t);
  }, [scenes.length]);
  const scene = scenes[sceneIdx] || "board";
  const sceneLabel = { ...label, fontSize:"clamp(12px,1.1vw,16px)", color:"#C9B896", marginBottom:6 };
  const sceneTitle = { fontFamily:DISPLAY, fontWeight:700, fontSize:"clamp(28px,2.8vw,44px)",
    textTransform:"uppercase", color:BONE, marginBottom:24 };

  /* ticker: a handful of labeled, high-signal segments instead of a name dump */
  const allW = (state.wagers||[]).map(w => ({ w, r: resolveWager(state, w, events) }));
  const tickerItems = [];
  if (draftLive && draftLive.d.pool.length) {
    const cur = draftLive.d.teams[snakeTeam(draftLive.d.picks.length, draftLive.d.teams.length)]?.captain;
    if (cur) tickerItems.push({ tag:"Draft", tone:"var(--accent)", players:[cur],
      text:`${disp(state, cur)} is on the clock` });
  }
  if (latest) tickerItems.push({ tag:"Final", tone:"var(--olive)", players:latest.res.slots[0].slice(0,4),
    text:`${latest.ev.name}: ${teamLabel(state, { players: latest.res.slots[0] })}` });
  if (onDeckEv) {
    const riding = allW.filter(x => x.r.status === "pending" && x.w.eventId === onDeckEv.id);
    const chipsIn = riding.reduce((n, x) => n + x.w.stake, 0);
    if (chipsIn > 0) tickerItems.push({ tag:"The book", tone:"var(--accent2)",
      players:[...new Set(riding.map(x => x.w.player))].slice(0,4),
      text:`${chipsIn} chip${chipsIn > 1 ? "s" : ""} riding on ${onDeckEv.name}` });
  }
  allW.filter(x => x.r.status === "won").slice(0,2).forEach(x =>
    tickerItems.push({ tag:"Cashed", tone:"var(--green)", players:[x.w.player],
      text:`${disp(state, x.w.player)} +${x.r.delta}` }));
  const lastRuling = (state.adjustments||[])[0];
  if (lastRuling) tickerItems.push({ tag:"Ruling", tone:"var(--clay)", players:[lastRuling.player],
    text:`${disp(state, lastRuling.player)} ${lastRuling.delta > 0 ? "+" : ""}${lastRuling.delta}${lastRuling.reason ? ", " + lastRuling.reason : ""}` });
  if (!allTied && standings[0]) tickerItems.push({ tag:"Leader", tone:"var(--sun)", players:[standings[0].player],
    text:`${disp(state, standings[0].player)}, ${standings[0].pts} points` });
  if (nextEv) tickerItems.push({ tag:"Next", tone:"var(--pool)",
    text:`${nextEv.name}, ${nextEv.value} pt${nextEv.value > 1 ? "s" : ""}` });
  if (!tickerItems.length) tickerItems.push({ tag:"Field Day", tone:"var(--accent)", text:"Scottsdale 2026" });

  const leader = !allTied ? standings[0] : null;
  const rest = leader ? standings.slice(1) : standings;
  const half = Math.ceil(rest.length / 2);

  return (
    <div style={{ position:"fixed", inset:0, display:"flex", flexDirection:"column", zIndex:60,
      background:"radial-gradient(110% 60% at 50% -10%, rgba(233,180,65,0.10) 0%, transparent 60%), var(--night)" }}>
      <button onClick={onExit} style={{ position:"absolute", top:"calc(16px + env(safe-area-inset-top))", right:16, zIndex:70,
        background:"var(--paper)", border:"1.5px solid rgba(42,33,25,0.4)", color:"var(--ink)",
        width:40, height:40, borderRadius:9, fontSize:15, cursor:"pointer" }}>✕</button>

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
      ) : draftLive ? (
        <TVDraft state={state} ev={draftLive.ev} d={draftLive.d} />
      ) : liveEv ? (
        <div key="scene-live" style={{ flex:1, display:"flex", gap:26, padding:"6px 44px 16px",
          minHeight:0, animation:"si-fade .6s ease-out" }}>
          <div style={{ flex:1, minWidth:0, display:"flex", flexDirection:"column", minHeight:0, overflow:"hidden" }}>
            <div style={{ ...sceneLabel, marginBottom:2 }}>
              {onDeckEv ? "Betting open" : liveBracketEv ? "Live bracket"
                : state.stages[liveStageEv?.id]?.kind === "heats" ? "Live heats" : "Live pools"}</div>
            <div style={{ ...sceneTitle, marginBottom:14, fontSize:"clamp(26px,2.5vw,40px)" }}>{liveEv.name}</div>
            <div style={{ flex:1, minHeight:0, overflowY:"auto" }}>
              {liveBracketEv ? <BracketGrid state={state} ev={liveBracketEv} gm={false} size="lg" />
                : liveStageEv ? <StageGrid state={state} ev={liveStageEv} gm={false} size="lg" />
                : <BetsBoard state={state} events={events} ev={onDeckEv} big />}
            </div>
            {onDeckEv && (liveBracketEv || liveStageEv) && (
              <div style={{ marginTop:14, maxHeight:190, overflowY:"hidden" }}>
                <BetsBoard state={state} events={events} ev={onDeckEv} />
              </div>
            )}
          </div>
          <TVMiniBoard state={state} standings={standings} allTied={allTied} />
        </div>
      ) : scene === "join" ? (
        <div key="scene-join" style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center",
          gap:"clamp(40px,6vw,110px)", padding:"10px 48px 20px", animation:"si-fade .6s ease-out" }}>
          <div>
            <FDMark size={120} />
            <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:"clamp(64px,8vw,130px)", lineHeight:0.9,
              textTransform:"uppercase", color:"var(--sun)", margin:"26px 0 8px" }}>Field<br/>Day</div>
            <div style={{ fontFamily:SANS, fontWeight:700, fontSize:"clamp(14px,1.5vw,22px)",
              letterSpacing:"0.14em", color:"#C9B896" }}>SCOTTSDALE · 2026</div>
            <div style={{ fontFamily:SANS, fontSize:"clamp(14px,1.4vw,20px)", color:BONE, marginTop:22, lineHeight:1.5 }}>
              Scan to check in.
            </div>
          </div>
          <div style={{ background:BONE, border:"2px solid var(--ink)", borderRadius:16,
            padding:"clamp(14px,1.6vw,24px)", textAlign:"center" }}>
            <img src={qrUrl} alt="Scan to join" style={{ width:"clamp(220px,24vw,340px)", display:"block",
              imageRendering:"pixelated" }} />
            <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:"clamp(15px,1.5vw,22px)",
              textTransform:"uppercase", color:"var(--ink)", marginTop:10 }}>Player check-in</div>
          </div>
        </div>
      ) : scene === "finale" && scen ? (
        <div key="scene-fin" style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center",
          justifyContent:"center", padding:"10px 48px 20px", animation:"si-fade .6s ease-out" }}>
          <div style={sceneLabel}>The Finale picture</div>
          <div style={sceneTitle}>{scen.alive.length} of {scen.total} can still win it</div>
          <div style={{ display:"grid", gridTemplateColumns: scen.alive.length > 4 ? "1fr 1fr" : "1fr",
            gap:"8px 40px", width:"100%", maxWidth:1100 }}>
            {scen.alive.map(a => (
              <div key={a.player} style={{ display:"flex", alignItems:"center", gap:16,
                padding:"clamp(8px,1.3vh,14px) 20px", borderRadius:12, background:CARD_BG,
                border:"1px solid var(--line)" }}>
                <Avatar state={state} p={a.player} size={44} />
                <span style={{ fontFamily:SANS, fontWeight:700, fontSize:"clamp(16px,2.2vh,26px)",
                  color:"var(--ink)", flex:1 }}>{disp(state, a.player)}</span>
                <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:"clamp(18px,2.4vh,28px)",
                  color:"var(--muted2)" }}>{a.pts}</span>
                <span style={{ fontFamily:SANS, fontWeight:700, fontSize:"clamp(11px,1.4vh,15px)",
                  letterSpacing:"0.05em", textTransform:"uppercase", padding:"4px 12px", borderRadius:5,
                  background:NEED_CHIP[a.needIdx].bg, color:NEED_CHIP[a.needIdx].fg }}>
                  {NEED_CHIP[a.needIdx].text}</span>
              </div>
            ))}
          </div>
        </div>
      ) : scene === "next" && nextEv ? (
        <div key="scene-next" style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center",
          justifyContent:"center", padding:"10px 48px 20px", animation:"si-fade .6s ease-out" }}>
          <div style={sceneLabel}>Next up</div>
          <div style={{ background:phaseOf(nextEv).bg, color:phaseOf(nextEv).fg, border:"2px solid var(--ink)",
            borderRadius:18, padding:"clamp(26px,4vh,50px) clamp(40px,5vw,90px)", textAlign:"center", maxWidth:1000 }}>
            <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:"clamp(48px,6vw,100px)", lineHeight:0.95,
              textTransform:"uppercase" }}>{nextEv.name}</div>
            <div style={{ fontFamily:SANS, fontWeight:700, fontSize:"clamp(14px,1.6vw,22px)", marginTop:14,
              letterSpacing:"0.06em" }}>WORTH {nextEv.value} PT{nextEv.value > 1 ? "S" : ""}</div>
          </div>
          {nextEv.desc && <div style={{ fontFamily:SANS, fontSize:"clamp(14px,1.5vw,20px)", color:"#C9B896",
            marginTop:22, maxWidth:760, textAlign:"center", lineHeight:1.5 }}>{nextEv.desc}</div>}
        </div>
      ) : scene === "latest" && latest ? (
        <div key="scene-latest" style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center",
          justifyContent:"center", padding:"10px 48px 20px", animation:"si-fade .6s ease-out" }}>
          <div style={{ display:"inline-block", fontFamily:DISPLAY, fontWeight:700, letterSpacing:"0.14em",
            textTransform:"uppercase", background:"var(--olive)", color:BONE,
            fontSize:"clamp(14px,1.5vw,20px)", padding:"4px 18px", borderRadius:5, marginBottom:14 }}>Final</div>
          <div style={sceneTitle}>{latest.ev.name}</div>
          <div style={{ display:"flex", justifyContent:"center", gap:14, marginBottom:18 }}>
            {latest.res.slots[0].map(p => <Avatar key={p} state={state} p={p} size={84} ring />)}
          </div>
          <div style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:"clamp(36px,4.5vw,72px)",
            textTransform:"uppercase", color:"var(--sun)", lineHeight:1, textAlign:"center" }}>
            {teamLabel(state, { players: latest.res.slots[0] })}</div>
          <div style={{ fontFamily:SANS, fontWeight:700, fontSize:"clamp(15px,1.6vw,22px)", color:"#C9B896", marginTop:12 }}>
            +{AWARDS[latest.ev.value][0]} each</div>
        </div>
      ) : scene === "book" ? (
        <div key="scene-book" style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center",
          justifyContent:"center", padding:"10px 48px 20px", animation:"si-fade .6s ease-out" }}>
          <div style={sceneLabel}>The book</div>
          <div style={sceneTitle}>{openBook.length} open wager{openBook.length === 1 ? "" : "s"}</div>
          <div style={{ display:"grid", gridTemplateColumns: openBook.length > 4 ? "1fr 1fr 1fr" : "1fr",
            gap:"10px 24px", width:"100%", maxWidth:1300 }}>
            {openBook.map(x => {
              const l = wagerPickLabel(state, x.w, events);
              return (
                <div key={x.w.id} style={{ display:"flex", alignItems:"center", gap:12,
                  padding:"clamp(8px,1.2vh,14px) 16px", borderRadius:12, background:CARD_BG,
                  border:"1px solid var(--line)" }}>
                  <Avatar state={state} p={x.w.player} size={38} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontFamily:SANS, fontWeight:700, fontSize:"clamp(13px,1.7vh,19px)", color:"var(--ink)" }}>
                      {disp(state, x.w.player)} put {x.w.stake} on {l.pick}</div>
                    <div style={{ fontFamily:SANS, fontSize:"clamp(11px,1.4vh,15px)", color:"var(--muted)",
                      overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{l.ctx}</div>
                  </div>
                  <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:"clamp(15px,2vh,22px)", color:"var(--olive)" }}>
                    +{x.w.kind === "outright" ? OUTRIGHT_MULT * x.w.stake : x.w.stake}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div key="scene-board" style={{ flex:1, display:"flex", flexDirection:"column",
          padding:"6px 48px 16px", minHeight:0, animation:"si-fade .6s ease-out" }}>
          {leader && (
            <div style={{ display:"flex", alignItems:"center", gap:20, padding:"clamp(10px,1.6vh,20px) 26px",
              marginBottom:12, borderRadius:16, position:"relative", overflow:"hidden",
              background:GOLD_GRAD, border:"1px solid var(--accent2)", boxShadow:"0 8px 34px rgba(192,91,51,0.3)" }}>
              <div style={{ fontFamily:DISPLAY, fontWeight:800, fontSize:"clamp(24px,3.4vh,42px)", color:"var(--ink)", width:46, textAlign:"center" }}>1</div>
              <Avatar state={state} p={leader.player} size={56} />
              <div style={{ flex:1 }}>
                <div style={{ fontFamily:SANS, fontWeight:700, fontSize:"clamp(20px,3vh,34px)", color:"var(--ink)", lineHeight:1.1 }}>
                  {disp(state, leader.player)}</div>
                <div style={{ fontFamily:SANS, fontSize:"clamp(11px,1.5vh,15px)", color:"rgba(30,22,8,0.6)" }}>
                  {leader.wins} win{leader.wins===1?"":"s"}{leader.betNet !== 0 ? `, wagers ${leader.betNet>0?"+":""}${leader.betNet}` : ""}</div>
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
      {scenes.length > 1 && !champion && !liveEv && (
        <div style={{ display:"flex", justifyContent:"center", gap:8, paddingBottom:8 }}>
          {scenes.map((s, i) => <div key={s} style={{ width:26, height:4, borderRadius:2,
            background: i === sceneIdx ? "var(--accent)" : "var(--line)" }} />)}
        </div>
      )}
      <div style={{ borderTop:"1px solid rgba(192,91,51,0.5)", background:"var(--paper2)", overflow:"hidden", padding:"9px 0" }}>
        <div style={{ display:"inline-flex", whiteSpace:"nowrap", willChange:"transform", transform:"translateZ(0)",
          animation:`si-tick ${Math.max(24, tickerItems.length * 9)}s linear infinite` }}>
          {[0,1].map(k => (
            <span key={k} style={{ display:"inline-flex", alignItems:"center" }}>
              {tickerItems.map((it, i) => (
                <span key={i} style={{ display:"inline-flex", alignItems:"center", gap:11, paddingRight:84 }}>
                  <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:"clamp(12px,1.1vw,15px)",
                    letterSpacing:"0.1em", textTransform:"uppercase", borderRadius:5, padding:"3px 10px",
                    background:it.tone, color: it.tone === "var(--sun)" ? "var(--ink)" : BONE }}>{it.tag}</span>
                  {(it.players || []).map(p => <Avatar key={p} state={state} p={p} size={27} />)}
                  <span style={{ fontFamily:SANS, fontWeight:600, fontSize:"clamp(14px,1.4vw,19px)",
                    color:"var(--ink)" }}>{it.text}</span>
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────── rules ─────────── */
function Guide({ replay, events }) {
  const [howToEv, setHowToEv] = useState(null);
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
      <S n="05" t="Learn the games">
        <div style={{ display:"grid", gap:8 }}>
          {Object.entries(GAMES).map(([id, g]) => (
            <button key={id} onClick={() => setHowToEv(id)} style={{ display:"flex", alignItems:"center",
              gap:12, textAlign:"left", cursor:"pointer", background:"var(--paper)",
              border:"1px solid var(--line)", borderRadius:12, padding:"9px 11px" }}>
              <GameMark id={id} size={30} />
              <span style={{ flex:1, minWidth:0 }}>
                <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:16, color:"var(--ink)",
                  textTransform:"uppercase", display:"block", lineHeight:1.05 }}>{g.name}</span>
                <span style={{ fontFamily:SANS, fontSize:12.5, color:"var(--dust)", display:"block",
                  overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                  {(g.howto || g.variants?.[0]?.howto)?.objective}</span>
              </span>
              <span style={{ color:"var(--accent2)", fontFamily:SANS, fontWeight:700, flexShrink:0 }}>→</span>
            </button>
          ))}
        </div>
      </S>
      <S n="06" t="Saturday night awards">
        The Championship, Fraud of the Weekend, Sharpshooter, Degenerate of the Weekend, Media MVP, Teammate of the Weekend.
      </S>
      <S n="07" t="House rules">
        Alcohol optional everywhere, NA equivalents carry no penalty. No forced participation. Rack cups hold water, drink from your own. No hard contact. Respect the property. Everyone knows when the 360 cam is rolling. Brandon can stop anything for safety.
      </S>
      {!isStandalone() && (
        <S n="08" t="The app">
          <InstallHint />
        </S>
      )}
      <div style={{ display:"flex", justifyContent:"center", padding:"6px 0 18px" }}>
        <Btn kind="ghost" onClick={replay}>Replay the intro</Btn>
      </div>
      <div style={{ fontFamily:DISPLAY, textAlign:"center", fontSize:13, letterSpacing:"0.24em",
        color:"#A5947B", paddingBottom:8 }}>FIELD DAY ✦ SCOTTSDALE 2026</div>
      {howToEv && <HowToSheet gameId={howToEv} onClose={() => setHowToEv(null)} />}
    </div>
  );
}
