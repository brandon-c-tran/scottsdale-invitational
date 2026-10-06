/* Copy review (/dev/copy-review.html): the text sweep for Brandon to scan
   in one place. "Cut" is the hand record in dev/copy-cuts.js (what was
   there, what stands in its place). "In the app" is read live from the
   source on every load (Vite's raw glob), so it is never stale: JSX text
   and string literals that read as copy (a capital letter, a space, no
   code), aria-labels and comments left out, grouped by surface and file.
   A heuristic: it can list a string that never reaches a screen and miss
   one built from parts. Dev only. */
import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { CUTS } from "./copy-cuts.js";
import "../src/ui/experience.css";

const SOURCES = import.meta.glob(["../src/**/*.{js,jsx}", "../shared/core.js", "../shared/show.js", "../shared/guestSetup.js",
  "!../src/**/*.test.*"], { query:"?raw", import:"default", eager:true });

/* the surface a file belongs to */
const SURFACES = [
  [/features\/(tv|awards\/TV)/, "TV"], [/features\/home|standings/, "Home"], [/features\/wagers|duels/, "Bets and duels"],
  [/features\/weekend\/(Schedule|ContestPanel|CompetitionBracket|EventSheetParts|EventAnnouncement|DrawPath)/, "Events and the event sheet"],
  [/features\/(weekend|rules|travel|photos)|results\/Keepsake/, "Weekend"], [/features\/check-in/, "Check-in"],
  [/features\/(profile|jersey|music|alerts|identity)/, "Profile and player card"], [/features\/draft/, "Draft"],
  [/features\/(director|qa)/, "Commissioner"], [/features\/(results|moments)/, "Results and moments"],
  [/features\/(awards)/, "Awards"], [/features\/geo/, "Where and When"], [/features\/poker/, "Poker"],
  [/src\/App\.jsx/, "App (sheets, toasts, commissioner)"], [/src\/ui\//, "Shared UI"], [/shared\//, "Shared (core, show)"],
];
const surfaceOf = file => (SURFACES.find(([re]) => re.test(file)) || [null, "Other"])[1];

const stripComments = src => src.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, " ")).replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
const CODE = /(^fd-|^si-|\bfd-[a-z]|https?:|\.(jsx?|css|png|svg|webp|woff2)\b|=>|\$\{[^}]*\(|^[a-z][A-Za-z]+$|^[A-Z_]+$|var\(--|px\b|^#[0-9a-f]{3,8}$)/;
const looksLikeCopy = text => {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length < 3 || t.length > 400) return false;
  if (CODE.test(t)) return false;
  if (!/[A-Z]/.test(t[0]) && !/^[{"“]/.test(t)) return false;
  return /[a-z]/.test(t) && (/\s/.test(t) || /[.!?:]$/.test(t));
};
/* the copy in one file: JSX text, and string or template literals not
   inside an aria-label, a className, an import or an error thrown in code */
function extract(src) {
  const out = new Set();
  const code = stripComments(src);
  for (const m of code.matchAll(/>([^<>{}]*[A-Za-z][^<>{}]*)</g)) {
    const t = m[1].replace(/\s+/g, " ").trim();
    if (looksLikeCopy(t) && !/[;=]/.test(t)) out.add(t);
  }
  for (const m of code.matchAll(/(["`])((?:\\.|(?!\1)[^\\\n])*)\1/g)) {
    const before = code.slice(Math.max(0, m.index - 24), m.index);
    if (/(aria-label|ariaLabel|className|class|import|from|require|new Error|throw|querySelector|data-[a-z-]+)\s*[=(:{]?\s*\{?\s*$/.test(before)) continue;
    const t = m[2].replace(/\$\{([^}]*)\}/g, (_, expr) => `{${expr.trim().split(/[^A-Za-z0-9_.]/)[0].split(".").pop() || "…"}}`);
    if (looksLikeCopy(t)) out.add(t.replace(/\s+/g, " ").trim());
  }
  return [...out];
}

function useInventory() {
  return useMemo(() => {
    const bySurface = new Map();
    for (const [path, src] of Object.entries(SOURCES)) {
      const file = path.replace(/^\.\.\//, "");
      const lines = extract(src);
      if (!lines.length) continue;
      const surface = surfaceOf(file);
      if (!bySurface.has(surface)) bySurface.set(surface, []);
      bySurface.get(surface).push({ file, lines });
    }
    return [...bySurface.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, []);
}

const css = `
body { margin:0; background:var(--bg); color:var(--ink); font-family:var(--fd-body); }
.cr { max-width:1100px; margin:0 auto; padding:28px 20px 80px; }
.cr h1 { margin:0 0 6px; font:900 40px/1.1 var(--fd-show); }
.cr-meta { color:var(--muted2); font-size:14px; margin:0 0 18px; }
.cr-tabs { display:flex; gap:8px; margin:0 0 16px; flex-wrap:wrap; }
.cr-tabs button { min-height:44px; padding:0 16px; border-radius:10px; border:1px solid var(--line); background:var(--paper); color:var(--ink); font:600 14px var(--fd-body); cursor:pointer; }
.cr-tabs button[aria-pressed="true"] { background:var(--info-tint); color:var(--lamp-info); border-color:var(--lamp-info); }
.cr-find { width:100%; box-sizing:border-box; min-height:48px; margin:0 0 20px; padding:0 14px; border-radius:10px; border:1px solid var(--ghost-line); background:var(--bg); color:var(--ink); font-size:16px; }
.cr h2 { margin:28px 0 8px; font:800 20px/1.2 var(--fd-display); letter-spacing:.08em; text-transform:uppercase; color:var(--muted2); }
.cr h3 { margin:14px 0 4px; font:600 12px/1.3 ui-monospace, monospace; color:var(--muted); }
.cr ul { list-style:none; margin:0; padding:0; border-top:1px solid var(--line); }
.cr li { padding:5px 2px; border-bottom:1px solid var(--line); font-size:15px; line-height:1.45; }
.cr-cut { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:6px 18px; }
.cr-cut del { color:var(--clay-text); text-decoration-thickness:1px; }
.cr-cut span { color:var(--ink); }
.cr-cut small { grid-column:1/-1; color:var(--muted); font:12px ui-monospace, monospace; }
.cr-none { color:var(--muted); font-style:italic; }
@media (max-width:640px) { .cr-cut { grid-template-columns:1fr; } }
`;

function App() {
  const inventory = useInventory();
  const [tab, setTab] = useState(() => new URLSearchParams(location.search).get("tab") === "left" ? "left" : "cut");
  const [find, setFind] = useState("");
  /* sentences first: a line that ends like a sentence or runs five words */
  const [sentences, setSentences] = useState(true);
  const isSentence = line => /[.!?]$/.test(line) || line.split(" ").length >= 5;
  const q = find.trim().toLowerCase();
  const match = text => !q || String(text || "").toLowerCase().includes(q);
  const cutsBySurface = useMemo(() => {
    const map = new Map();
    CUTS.forEach(cut => { if (!map.has(cut.surface)) map.set(cut.surface, []); map.get(cut.surface).push(cut); });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, []);
  const remaining = inventory.reduce((sum, [, files]) => sum + files.reduce((s, f) => s + f.lines.length, 0), 0);
  return <main className="cr">
    <style>{css}</style>
    <h1>Copy review</h1>
    <p className="cr-meta">{CUTS.length} cut or replaced, {remaining} lines still in the app</p>
    <div className="cr-tabs" role="group" aria-label="View">
      <button type="button" aria-pressed={tab === "cut"} onClick={() => setTab("cut")}>Cut</button>
      <button type="button" aria-pressed={tab === "left"} onClick={() => setTab("left")}>In the app</button>
      {tab === "left" && <button type="button" aria-pressed={sentences} onClick={() => setSentences(v => !v)}>Sentences only</button>}
    </div>
    <input className="cr-find" type="search" placeholder="Find" value={find} onChange={e => setFind(e.target.value)} aria-label="Find" />
    {tab === "cut" && cutsBySurface.map(([surface, cuts]) => {
      const shown = cuts.filter(c => match(c.before) || match(c.after) || match(c.file));
      if (!shown.length) return null;
      return <section key={surface}><h2>{surface}</h2><ul>
        {shown.map((cut, i) => <li key={i} className="cr-cut">
          <del>{cut.before}</del>
          {cut.after ? <span>{cut.after}</span> : <span className="cr-none">nothing</span>}
          <small>{cut.file}</small>
        </li>)}
      </ul></section>;
    })}
    {tab === "left" && inventory.map(([surface, files]) => {
      const shown = files.map(f => ({ ...f, lines:f.lines.filter(line => match(line) && (!sentences || isSentence(line))) })).filter(f => f.lines.length);
      if (!shown.length) return null;
      return <section key={surface}><h2>{surface}</h2>
        {shown.map(f => <div key={f.file}><h3>{f.file}</h3><ul>{f.lines.map(line => <li key={line}>{line}</li>)}</ul></div>)}
      </section>;
    })}
  </main>;
}

createRoot(document.getElementById("root")).render(<App />);
