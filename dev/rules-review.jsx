/* Development-only: every rules word the app shows, on one page, for
   Brandon to strike or rewrite. Each set renders the real GameSteps at the
   sheet and card sizes; under it, every label with its data key, editable
   in place. "Copy changes" puts the edited lines on the clipboard in the
   shape of src/features/rules/rulesWords.js, so each edit is a one-line
   change there. Edits are kept in this browser only (localStorage).
   Below the sets: the other rules and payout words still shown anywhere,
   and the source facts (GAMES and event descriptions in shared/core.js)
   that the drawings were made from. No socket, no state. */
import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { BUILTIN_EVENTS, DUEL_GAMES, GAMES } from "../shared/core.js";
import { GameMark } from "../src/ui/GameMark.jsx";
import { GameSteps, StepPicture, NoteGlyph } from "../src/features/rules/GameSteps.jsx";
import { STEP_SETS, RULE_SET_ORDER, gameStepsModel } from "../src/features/rules/gameSteps.js";
import { RULES_WORDS } from "../src/features/rules/rulesWords.js";
import "../src/ui/shell.css";
import "../src/ui/experience.css";
import "../src/ui/backglass.css";

const STORE = "fd-rules-review-edits";
const read = () => { try { return JSON.parse(localStorage.getItem(STORE) || "{}") || {}; } catch { return {}; } };
const write = value => { try { localStorage.setItem(STORE, JSON.stringify(value)); } catch {} };

/* slate games first (in slate order), then the earlier slates, then the weekend's own rules */
const slate = [...new Set(BUILTIN_EVENTS.map(ev => gameStepsModel(ev)?.id).filter(Boolean))];
const others = Object.keys(STEP_SETS).filter(id => !slate.includes(id) && !RULE_SET_ORDER.includes(id) && id !== "payouts");
const ORDER = [...slate, ...others, ...RULE_SET_ORDER, "payouts"];
const eventsFor = id => BUILTIN_EVENTS.filter(ev => gameStepsModel(ev)?.id === id);

const ELSEWHERE = [
  ["Winner pays 1:1 / Winner pays 2:1", "Bets board and rack, Home's contest, the You're up banner, the TV board (fixed wording)"],
  [DUEL_GAMES.quickdraw.desc, "Quick Draw, before you tap Ready (src/features/duels/QuickDraw.jsx, DUEL_GAMES in core)"],
  ["Max N · N to bet · N in bets", "the betting rack's meter (src/features/wagers/Wagers.jsx)"],
  ["An added event's own description", "the event sheet and its rules sheet, only for an event with no drawn game (App.jsx, HowToSheet.jsx)"],
  ["Payout ladders (1st / 2nd / 3rd as numbers)", "Weekend > Payouts, the event sheet, the TV intro: numbers only, no words (src/ui/PayoutLadder.jsx)"],
];

function Word({ k, value, edited, onEdit }) {
  return <span className={`rr-word${edited ? " is-edited" : ""}`} contentEditable suppressContentEditableWarning spellCheck={false}
    onBlur={event => onEdit(k, event.currentTarget.textContent.trim())}
    onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }}>{value}</span>;
}

function Source({ id }) {
  const [base, variant] = id.split(":");
  const game = GAMES[base];
  const howto = variant ? game?.variants?.find(item => item.id === variant)?.howto : game?.howto;
  const evs = eventsFor(id);
  if (!howto && !evs.length) return null;
  return <details className="rr-source"><summary>Source facts (shared/core.js)</summary>
    {howto && <dl>
      {howto.players && <><dt>players</dt><dd>{howto.players}</dd></>}
      {howto.objective && <><dt>objective</dt><dd>{howto.objective}</dd></>}
      {(howto.steps || []).map((step, i) => <React.Fragment key={i}><dt>step {i + 1}</dt><dd>{step}</dd></React.Fragment>)}
      {howto.win && <><dt>win</dt><dd>{howto.win}</dd></>}
      {howto.house && <><dt>house</dt><dd>{howto.house}</dd></>}
    </dl>}
    {evs.map(ev => <p key={ev.id}><b>{ev.name}</b> (event desc, not shown): {ev.desc}</p>)}
  </details>;
}

function SetReview({ id, edits, onEdit }) {
  const model = gameStepsModel(id);
  const words = key => edits[key] ?? RULES_WORDS[key];
  const game = id.split(":")[0];
  const items = [...model.steps.map(step => ({ ...step, kind:"step" })), ...model.notes.map(note => ({ ...note, kind:"note" }))];
  const names = eventsFor(id).map(ev => ev.name).join(", ");
  return <section className="rr-set" id={`set-${id}`}>
    <header className="rr-set-head">
      {GAMES[game] && <GameMark id={game} variant={id.split(":")[1]} size={44} />}
      <div><h2>{names || model.title}</h2><code>{id}</code></div>
    </header>
    <div className="rr-set-body">
      <div className="rr-col rr-col-sheet"><h3>Sheet</h3><GameSteps game={id} size="sheet" /></div>
      <div className="rr-col">
        <h3>Card</h3>{model.steps.length ? <GameSteps game={id} size="card" notes={false} /> : <p className="rr-quiet">Notes only</p>}
        <h3>Words</h3>
        <ol className="rr-words">{items.map(item => <li key={item.key}>
          <span className="rr-thumb">{item.kind === "step" ? <StepPicture id={item.key} size="card" /> : <NoteGlyph id={item.glyph} size={24} />}</span>
          <Word k={item.key} value={words(item.key)} edited={edits[item.key] !== undefined && edits[item.key] !== RULES_WORDS[item.key]} onEdit={onEdit} />
          <code>{item.key}</code>
        </li>)}</ol>
        <Source id={id} />
      </div>
    </div>
  </section>;
}

function Review() {
  const [edits, setEdits] = useState(read);
  const [copied, setCopied] = useState("");
  useEffect(() => write(edits), [edits]);
  const changed = useMemo(() => Object.entries(edits).filter(([key, value]) => value !== RULES_WORDS[key]), [edits]);
  const onEdit = (key, value) => setEdits(current => {
    const next = { ...current };
    if (!value || value === RULES_WORDS[key]) delete next[key]; else next[key] = value;
    return next;
  });
  const copy = async () => {
    const text = changed.map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)},`).join("\n");
    try { await navigator.clipboard.writeText(text); setCopied("Copied"); } catch { setCopied(text); }
  };
  return <main className="rr">
    <header className="rr-top">
      <h1>Rules words</h1>
      <p>Every label is editable: click it, rewrite or clear it. The key beside it is its line in src/features/rules/rulesWords.js.</p>
      <div className="rr-actions">
        <button type="button" onClick={copy} disabled={!changed.length}>Copy {changed.length || ""} change{changed.length === 1 ? "" : "s"}</button>
        <button type="button" onClick={() => setEdits({})} disabled={!changed.length}>Reset</button>
        {copied && <pre className="rr-copied">{copied}</pre>}
      </div>
      <nav className="rr-index">{ORDER.map(id => <a key={id} href={`#set-${id}`}>{eventsFor(id)[0]?.name || gameStepsModel(id).title}</a>)}</nav>
    </header>
    {ORDER.map(id => <SetReview key={id} id={id} edits={edits} onEdit={onEdit} />)}
    <section className="rr-set">
      <header className="rr-set-head"><div><h2>Elsewhere</h2><code>other rules and payout words still shown</code></div></header>
      <ul className="rr-elsewhere">{ELSEWHERE.map(([text, where]) => <li key={text}><b>{text}</b><span>{where}</span></li>)}</ul>
    </section>
  </main>;
}

const style = document.createElement("style");
style.textContent = `
  body { margin:0; background:var(--bg); color:var(--ink); font-family:var(--fd-body); }
  .rr { max-width:1100px; margin:0 auto; padding:24px 20px 80px; }
  .rr-top h1 { font:900 44px/1.05 var(--fd-show); margin:0 0 8px; }
  .rr-top p { color:var(--muted2); margin:0 0 14px; font-size:15px; }
  .rr-actions { display:flex; gap:10px; flex-wrap:wrap; align-items:flex-start; margin-bottom:14px; }
  .rr-actions button { min-height:44px; padding:0 16px; border-radius:8px; border:1px solid var(--line); background:var(--paper); color:var(--ink); font:600 15px var(--fd-body); cursor:pointer; }
  .rr-actions button:first-child { background:var(--action-fill); color:var(--action-ink); border-color:var(--action-fill); }
  .rr-actions button:disabled { opacity:.4; cursor:default; }
  .rr-copied { flex-basis:100%; margin:0; padding:10px; background:var(--paper); border-radius:8px; font:14px/1.5 var(--fd-mono, monospace); white-space:pre-wrap; }
  .rr-index { display:flex; flex-wrap:wrap; gap:4px 14px; padding:12px 0 4px; border-top:1px solid var(--line); }
  .rr-index a { color:var(--lamp-info); font:600 14px/2 var(--fd-body); text-decoration:none; }
  .rr-set { padding:28px 0; border-top:1px solid var(--line); }
  .rr-set-head { display:flex; gap:14px; align-items:center; margin-bottom:18px; }
  .rr-set-head h2 { font:900 32px/1.1 var(--fd-show); margin:0; }
  .rr-set-head code, .rr-words code { color:var(--muted); font:12px var(--fd-mono, monospace); }
  .rr-set-body { display:grid; grid-template-columns:minmax(0, 390px) minmax(0, 1fr); gap:32px; }
  @media (max-width:820px) { .rr-set-body { grid-template-columns:1fr; } }
  .rr-col h3 { font:800 12px/1.15 var(--fd-display); letter-spacing:.1em; text-transform:uppercase; color:var(--muted); margin:0 0 10px; }
  .rr-col h3:not(:first-child) { margin-top:24px; }
  .rr-quiet { color:var(--muted); font-size:14px; }
  .rr-words { list-style:none; margin:0; padding:0; display:grid; gap:6px; }
  .rr-words li { display:grid; grid-template-columns:64px minmax(0, 1fr) auto; gap:12px; align-items:center; }
  .rr-thumb { display:grid; place-items:center; width:64px; height:40px; border-radius:6px; background:var(--ink0); }
  .rr-thumb svg { width:64px; }
  .rr-word { display:block; min-height:36px; padding:7px 10px; border:1px dashed var(--ghost-line); border-radius:6px; font:800 18px/1.2 var(--fd-display); outline:none; }
  .rr-word:focus { border-style:solid; border-color:var(--lamp-info); background:var(--paper); }
  .rr-word.is-edited { border-color:var(--sun); color:var(--sun); }
  .rr-source { margin-top:16px; color:var(--muted2); font-size:14px; line-height:1.5; }
  .rr-source summary { cursor:pointer; min-height:32px; color:var(--muted); }
  .rr-source dl { display:grid; grid-template-columns:auto 1fr; gap:4px 12px; margin:8px 0; }
  .rr-source dt { color:var(--muted); }
  .rr-source dd { margin:0; }
  .rr-elsewhere { list-style:none; margin:0; padding:0; display:grid; gap:10px; }
  .rr-elsewhere li { display:grid; gap:2px; }
  .rr-elsewhere span { color:var(--muted2); font-size:14px; }
`;
document.head.append(style);
createRoot(document.getElementById("root")).render(<Review />);
