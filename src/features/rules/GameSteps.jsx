import React from "react";
import { gameStepsModel, hasGameSteps, stepSetId } from "./gameSteps.js";
import { NOTE_GLYPHS, RULE_PICTURES } from "./RulePictures.jsx";
import "./rules.css";

/* How to play, drawn: 3 or 4 steps, each a picture in the icon family with
   a 2 to 4 word label, then the notes that change play (a variant, a house
   rule, a tie) as a glyph and a few words. No prose: the words come from
   rulesWords.js, the facts from GAMES in shared/core.js.

   API (stable; the event sheet, Weekend and the TV use it):
     <GameSteps game={id | event} variant? size="sheet" | "card" | "tv"
       notes? max? className? />
     game     a GAMES id ("putting"), "basketball:5v5", a rules set
              ("betting"), or an event (its `game` and `variant` are read)
     variant  overrides the event's variant
     size     "sheet" (a sheet: steps down the page, big pictures),
              "card" (a row across a panel, labels under), "tv" (the
              1920 canvas: a row, 28px labels)
     notes    false hides the notes (default true)
     max      show at most this many steps (0: all)
   Renders nothing for a game with no drawn steps (hasGameSteps). */
const STROKE = { sheet:1.3, card:1.6, tv:0.9 };

export function StepPicture({ id, size = "sheet" }) {
  const art = RULE_PICTURES[id];
  return <svg className="fd-rules-pic" viewBox="0 0 64 40" aria-hidden="true" focusable="false"
    fill="none" stroke="currentColor" strokeWidth={STROKE[size] || STROKE.sheet} strokeLinecap="round" strokeLinejoin="round">
    {art || <circle cx="32" cy="20" r="6" />}
  </svg>;
}

export function NoteGlyph({ id, size = 20 }) {
  return <svg className="fd-rules-glyph" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false"
    fill="none" stroke="currentColor" strokeWidth={size <= 20 ? 1.9 : 1.6} strokeLinecap="round" strokeLinejoin="round">
    {NOTE_GLYPHS[id] || <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />}
  </svg>;
}

export function GameSteps({ game, variant, size = "sheet", notes = true, max = 0, className = "" }) {
  const model = gameStepsModel(game, variant);
  if (!model) return null;
  const steps = max > 0 ? model.steps.slice(0, max) : model.steps;
  const tile = size === "card" ? ` is-${steps.length}-up` : "";
  return <div className={`fd-rules is-${size}${tile}${className ? ` ${className}` : ""}`} data-rules={model.id}>
    {steps.length > 0 && <ol className="fd-rules-steps">
      {steps.map(step => <li key={step.key} className={`fd-rules-step${step.win ? " is-win" : ""}`} data-rule-key={step.key}>
        <span className="fd-rules-window"><StepPicture id={step.key} size={size} /></span>
        <span className="fd-rules-words">{step.words}</span>
      </li>)}
    </ol>}
    {notes && model.notes.length > 0 && <ul className="fd-rules-notes">
      {model.notes.map(note => <li key={note.key} data-rule-key={note.key}>
        <NoteGlyph id={note.glyph} size={size === "tv" ? 32 : 20} /><span>{note.words}</span>
      </li>)}
    </ul>}
  </div>;
}

export { hasGameSteps, stepSetId, gameStepsModel };
