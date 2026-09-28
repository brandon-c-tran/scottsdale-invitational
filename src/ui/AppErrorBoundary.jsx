import React from "react";
import { computeStandings, disp } from "../../shared/core.js";
import { reportClientError, useTournament } from "../lib/client.js";
import { tvCanvasFit } from "../features/tv/tvModel.js";

/* Recovery reloads the client only. Claims and saved guest/game data stay in
   their existing stores; this screen must never clear or reset them.

   Phones keep the manual Reload. The TV has nobody holding it, so it reloads
   itself (10s, then 20s) and on the third crash in a row shows a plain
   standings board built from the last state, trying the full app again every
   ten minutes. A minute of clean running forgets earlier crashes. */
const CRASH_KEY = "fd-tv-crash";
const RELOAD_BASE_MS = 10000;
const BOARD_AFTER = 3;
const BOARD_RETRY_MS = 10 * 60 * 1000;
const STABLE_MS = 60000;

const isTv = () => typeof window !== "undefined" && (window.location.pathname === "/tv"
  || new URLSearchParams(window.location.search).has("tv"));
const crashCount = () => { try { return Number(sessionStorage.getItem(CRASH_KEY)) || 0; } catch { return 0; } };
const setCrashCount = n => {
  try { if (n > 0) sessionStorage.setItem(CRASH_KEY, String(n)); else sessionStorage.removeItem(CRASH_KEY); } catch {}
};

const page = { minHeight:"100vh", boxSizing:"border-box", padding:24, display:"grid", placeItems:"center",
  background:"var(--bg, #151c1c)", color:"var(--ink, #f2eddf)", fontFamily:"var(--fd-body, system-ui, sans-serif)" };

/* The crash board is drawn on the same fixed 1920x1080 canvas as the TV,
   scaled to the screen, so a 4K set reads it from the couch too. Inline
   styles only: nothing here may depend on the code that just failed. */
function useFallbackFit() {
  const read = () => typeof window === "undefined" ? tvCanvasFit(1920, 1080)
    : tvCanvasFit(window.innerWidth, window.innerHeight);
  const [fit, setFit] = React.useState(read);
  React.useEffect(() => {
    const onResize = () => setFit(read());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return fit;
}
function StandingsFallback() {
  const { state } = useTournament();
  const fit = useFallbackFit();
  let rows = [];
  try { rows = computeStandings(state); } catch { rows = []; }
  const half = Math.ceil(rows.length / 2);
  const row = r => <li key={r.player} style={{ display:"grid", gridTemplateColumns:"64px 1fr auto", alignItems:"center",
    gap:18, height:96, padding:"0 26px", borderRadius:14, background:"var(--paper, #202b2a)",
    border:"1px solid var(--line, rgba(242,237,223,.15))", fontSize:40, fontWeight:700 }}>
    <span style={{ color:"var(--muted, #a7b5ac)", fontFamily:"var(--fd-display, sans-serif)" }}>{r.rank}</span>
    <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{disp(state, r.player)}</span>
    <strong style={{ fontFamily:"var(--fd-display, sans-serif)", fontSize:48 }}>{Number(r.pts).toLocaleString("en-US")}</strong>
  </li>;
  return <main style={{ position:"fixed", inset:0, overflow:"hidden", background:"var(--night-deep, #151c1c)",
    color:"var(--ink, #f2eddf)", fontFamily:"var(--fd-body, system-ui, sans-serif)" }}>
    <div data-tv-canvas style={{ position:"absolute", left:fit.left, top:fit.top, width:1920, height:1080,
      transform:`scale(${fit.scale})`, transformOrigin:"0 0", boxSizing:"border-box", padding:"48px 56px",
      background:"var(--night, #202b2a)", borderTop:"6px solid var(--sun, #e4d477)" }}>
      <h1 style={{ margin:"0 0 28px", fontSize:72, lineHeight:1, textTransform:"uppercase",
        fontFamily:"var(--fd-display, sans-serif)", color:"var(--sun, #e4d477)" }}>Standings</h1>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:28 }}>
        {[rows.slice(0, half), rows.slice(half)].map((col, index) => (
          <ol key={index} aria-label={index ? undefined : "Tournament standings"}
            style={{ listStyle:"none", margin:0, padding:0, display:"grid", gap:12, alignContent:"start" }}>
            {col.map(row)}
          </ol>
        ))}
      </div>
    </div>
  </main>;
}

export class AppErrorBoundary extends React.Component {
  state = { failed:false, board:false };

  static getDerivedStateFromError() {
    return { failed:true };
  }

  componentDidMount() {
    if (isTv() && crashCount() > 0)
      this.stableTimer = setTimeout(() => setCrashCount(0), STABLE_MS);
  }

  componentDidCatch(error, info) {
    clearTimeout(this.stableTimer);
    const tv = isTv();
    const crashes = tv ? crashCount() + 1 : 1;
    reportClientError({
      message:String(error?.message || error || "Unknown error"),
      stack:typeof error?.stack === "string" ? error.stack : undefined,
      componentStack:typeof info?.componentStack === "string" ? info.componentStack : undefined,
      attempt:crashes,
    });
    if (!tv) return;
    clearTimeout(this.reloadTimer);
    if (crashes >= BOARD_AFTER) {
      setCrashCount(crashes);
      this.setState({ board:true });
      /* one more full try later; failing again lands back on the board */
      this.reloadTimer = setTimeout(() => {
        setCrashCount(BOARD_AFTER - 1);
        window.location.reload();
      }, BOARD_RETRY_MS);
      return;
    }
    setCrashCount(crashes);
    this.reloadTimer = setTimeout(() => window.location.reload(),
      RELOAD_BASE_MS * 2 ** (crashes - 1));
  }

  componentWillUnmount() {
    clearTimeout(this.stableTimer);
    clearTimeout(this.reloadTimer);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    if (this.state.board) return <StandingsFallback />;

    return <main style={page}>
      <div role="alert" style={{ maxWidth:360, textAlign:"center" }}>
        <h1 style={{ margin:"0 0 20px", fontSize:26, lineHeight:1.2 }}>Field Day couldn’t open</h1>
        <button type="button" autoFocus onClick={() => window.location.reload()}
          style={{ minHeight:48, padding:"12px 24px", border:0, borderRadius:6,
            background:"var(--sun, #e4d477)", color:"var(--ink0, #151c1c)",
            font:"inherit", fontWeight:600, cursor:"pointer" }}>Reload</button>
      </div>
    </main>;
  }
}
