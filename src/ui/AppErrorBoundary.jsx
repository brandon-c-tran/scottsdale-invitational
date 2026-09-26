import React from "react";

export class AppErrorBoundary extends React.Component {
  state = { failed:false };

  static getDerivedStateFromError() {
    return { failed:true };
  }

  render() {
    if (!this.state.failed) return this.props.children;

    // Recovery reloads the client only. Claims and saved guest/game data stay
    // in their existing stores; this screen must never clear or reset them.
    return <main style={{ minHeight:"100vh", boxSizing:"border-box", padding:24,
      display:"grid", placeItems:"center", background:"var(--bg, #151c1c)",
      color:"var(--ink, #f2eddf)", fontFamily:"var(--fd-body, system-ui, sans-serif)" }}>
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
