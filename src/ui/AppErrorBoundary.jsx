import React from "react";
import { computeStandings, disp } from "../../shared/core.js";
import { reportClientError, useTournament } from "../lib/client.js";

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

function StandingsFallback() {
  const { state } = useTournament();
  let rows = [];
  try { rows = computeStandings(state); } catch { rows = []; }
  return <main style={{ ...page, placeItems:"start center" }}>
    <div style={{ width:"100%", maxWidth:720 }}>
      <h1 style={{ margin:"0 0 16px", fontSize:28 }}>Standings</h1>
      <ol aria-label="Tournament standings" style={{ listStyle:"none", margin:0, padding:0 }}>
        {rows.map(row => <li key={row.player} style={{ display:"grid", gridTemplateColumns:"48px 1fr auto",
          gap:12, padding:"10px 0", borderBottom:"1px solid var(--line, rgba(242,237,223,.15))", fontSize:24 }}>
          <span>{row.rank}</span>
          <span>{disp(state, row.player)}</span>
          <strong>{Number(row.pts).toLocaleString("en-US")}</strong>
        </li>)}
      </ol>
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
