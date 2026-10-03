import React, { useEffect, useRef, useState } from "react";
import {
  TRIVIA_DIGITS_MAX, TRIVIA_FORMAT_NAMES, TRIVIA_MAX_QUESTIONS, TRIVIA_MAX_ROUNDS, TRIVIA_NAME_MAX, TRIVIA_OPTION_MAX,
  TRIVIA_TEXT_MAX, TRIVIA_UNIT_MAX, cleanTriviaQuestion, defaultDigits, digitsFor, triviaFinished, triviaRoundCount,
} from "../../../shared/trivia.js";
import { spotifySearch, triviaBank, triviaClipCheck, triviaPhotoUrl, triviaUploadPhoto } from "../../lib/client.js";
import { prepareMoment } from "../photos/prepareMoment.js";
import { ActionButton } from "../../ui/controls.jsx";
import { Icon } from "../../ui/Icon.jsx";
import { LETTERS, numberLabel } from "./triviaModel.js";
import "./trivia.css";

const newId = prefix => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const FORMAT_ICONS = { choice:"rules", number:"plus", tune:"song", picture:"photo" };
const BANK_PICKS = 5;

/* the bank, read once per desk with the commissioner token */
function useBank(load) {
  const [bank, setBank] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let gone = false;
    load().then(result => {
      if (gone) return;
      if (result?.ok) setBank(result.categories || []); else setError(result?.error || "Couldn't load the bank");
    });
    return () => { gone = true; };
  }, []);
  return { bank, error };
}

/* a clip for a tune, asked of the Worker: "Clip", "No clip" or checking */
function ClipStatus({ song }) {
  const [state, setState] = useState("checking");
  const key = `${song?.title}|${song?.artist}|${song?.isrc || ""}`;
  useEffect(() => {
    if (!song?.title) { setState("none"); return undefined; }
    let gone = false;
    setState("checking");
    triviaClipCheck({ title:song.title, artist:song.artist || "", isrc:song.isrc || "" })
      .then(result => { if (!gone) setState(result?.ok ? "ok" : "none"); });
    return () => { gone = true; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return <span className={`fd-trivia-clip is-${state}`}>
    <i aria-hidden="true" />{state === "ok" ? "Clip" : state === "none" ? "No clip" : "Checking"}</span>;
}

/* a photo not yet shown is the commissioner's: fetched with the token */
function DeskPhoto({ id }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let url = null, gone = false;
    triviaPhotoUrl(id).then(found => { if (gone) { if (found?.startsWith("blob:")) URL.revokeObjectURL(found); return; } url = found; setSrc(found); });
    return () => { gone = true; if (url?.startsWith("blob:")) URL.revokeObjectURL(url); };
  }, [id]);
  return src ? <img src={src} alt="" /> : <span className="fd-trivia-desk-blank" aria-hidden="true" />;
}

/* what a question reads as in a list: its text and its answer */
function answerOf(question) {
  if (question.format === "number") return numberLabel(question.answer, question.unit);
  const option = question.options?.[question.answer];
  return typeof option === "string" ? option : option ? `${option.title}, ${option.artist}` : "";
}
const titleOf = question => question.format === "tune" ? question.options?.[question.answer]?.title || "Name that tune"
  : question.text || (question.format === "picture" ? "Picture" : "");

/* the question as a phone shows it, the right answer marked */
function Preview({ question }) {
  return <div className="fd-trivia-preview" aria-label="Preview">
    {question.format === "tune" ? <h3 className="fd-trivia-text">Name that tune</h3>
      : question.text && <h3 className="fd-trivia-text is-long">{question.text}</h3>}
    {question.format === "number" ? <p className="fd-trivia-answer"><b>{numberLabel(question.answer)}</b><span>{question.unit}</span></p>
      : <ol className="fd-trivia-options">{(question.options || []).map((option, i) => <li key={i}>
        <span className={`fd-trivia-option${i === question.answer ? " is-right" : ""}`}>
          <span className="fd-trivia-letter">{i === question.answer ? <Icon name="check" size={18} /> : LETTERS[i]}</span>
          <span className="fd-trivia-option-text">{typeof option === "string" ? option
            : <><b>{option.title}</b><small>{option.artist}</small></>}</span>
        </span></li>)}</ol>}
  </div>;
}

/* one song slot of a tune: search the catalog, or type it */
function SongSlot({ value, onChange, letter, right, onRight }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const search = text => {
    setQuery(text);
    clearTimeout(timer.current);
    if (text.trim().length < 2) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      const found = await spotifySearch(text.trim());
      setResults(found?.ok ? (found.tracks || []).slice(0, 5) : []);
    }, 350);
  };
  return <div className={`fd-trivia-song${right ? " is-right" : ""}`}>
    <div className="fd-trivia-song-head">
      <button type="button" className="fd-trivia-mark" aria-pressed={right} onClick={onRight}
        aria-label={`Song ${letter} is the one that plays`}>{right ? <Icon name="check" size={18} /> : letter}</button>
      <input value={value.title} maxLength={TRIVIA_OPTION_MAX} placeholder="Title" aria-label={`Song ${letter} title`}
        onChange={event => onChange({ ...value, title:event.target.value, isrc:undefined })} />
    </div>
    <input value={value.artist} maxLength={TRIVIA_OPTION_MAX} placeholder="Artist" aria-label={`Song ${letter} artist`}
      onChange={event => onChange({ ...value, artist:event.target.value, isrc:undefined })} />
    <input className="fd-trivia-song-search" value={query} placeholder="Search songs" aria-label={`Search for song ${letter}`}
      onChange={event => search(event.target.value)} />
    {!!results.length && <ul className="fd-trivia-song-results">{results.map(track => <li key={track.trackId}>
      <button type="button" onClick={() => {
        onChange({ title:track.name.slice(0, TRIVIA_OPTION_MAX), artist:(track.artists || []).join(", ").slice(0, TRIVIA_OPTION_MAX),
          ...(track.isrc ? { isrc:track.isrc } : {}) });
        setResults([]); setQuery("");
      }}><b>{track.name}</b><small>{(track.artists || []).join(", ")}</small></button></li>)}</ul>}
  </div>;
}

/* one question of a round, in any of the four formats */
function QuestionEditor({ question, onSave, onCancel }) {
  const [format, setFormat] = useState(question?.format || "choice");
  const [text, setText] = useState(question?.text || "");
  const [options, setOptions] = useState(() => question?.format !== "number" && question?.format !== "tune" && question?.options
    ? [...question.options] : ["", "", "", ""]);
  const [songs, setSongs] = useState(() => question?.format === "tune" ? question.options.map((option, i) =>
    ({ ...option, ...(i === question.answer && question.clip?.isrc ? { isrc:question.clip.isrc } : {}) }))
    : Array.from({ length:4 }, () => ({ title:"", artist:"" })));
  const [answer, setAnswer] = useState(question && question.format !== "number" ? question.answer : 0);
  const [number, setNumber] = useState(question?.format === "number" ? String(question.answer) : "");
  const [unit, setUnit] = useState(question?.unit || "");
  const [digits, setDigits] = useState(question?.digits || 4);
  const [photo, setPhoto] = useState(question?.photo || null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [showing, setShowing] = useState(false);
  const file = useRef(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const numeric = Math.max(0, Math.trunc(Number(String(number).replace(/[^\d]/g, "")) || 0));
  useEffect(() => { if (format === "number" && digits < digitsFor(numeric)) setDigits(defaultDigits(numeric)); }, [numeric, format]); // eslint-disable-line react-hooks/exhaustive-deps
  const draft = () => ({ id:question?.id || newId("q"), format, text,
    ...(format === "number" ? { answer:numeric, unit, digits }
      : format === "tune" ? { options:songs.map(({ title, artist }) => ({ title, artist })), answer,
        clip:songs[answer]?.isrc ? { isrc:songs[answer].isrc } : {} }
        : { options, answer, ...(format === "picture" ? { photo } : {}) }) });
  const checked = cleanTriviaQuestion(draft());
  const choose = async event => {
    const picked = event.target.files?.[0];
    event.target.value = "";
    if (!picked) return;
    setBusy("photo"); setError("");
    try {
      const prepared = await prepareMoment(picked);
      const result = await triviaUploadPhoto(prepared.photo);
      if (!result.ok) { setError(result.error || "Upload failed"); return; }
      setPhoto(result.photo);
      setPreview(URL.createObjectURL(prepared.photo));
    } catch (failure) { setError(failure?.message || "That photo could not be opened"); }
    finally { setBusy(""); }
  };
  const save = () => {
    if (checked.error) { setError(checked.error); return; }
    onSave(checked.question);
  };
  return <div className="fd-trivia-editor">
    <div className="fd-trivia-formats" role="radiogroup" aria-label="Format">
      {Object.entries(TRIVIA_FORMAT_NAMES).map(([id, name]) => <button type="button" key={id} role="radio" aria-checked={format === id}
        onClick={() => { setFormat(id); setError(""); }}><Icon name={FORMAT_ICONS[id]} size={18} /><span>{name}</span></button>)}
    </div>
    {format === "picture" && <div className="fd-trivia-editor-photo">
      {preview ? <img src={preview} alt="" /> : photo ? <DeskPhoto id={photo.id} /> : <span className="fd-trivia-desk-blank" aria-hidden="true" />}
      <ActionButton variant="secondary" compact disabled={!!busy} onClick={() => file.current?.click()}>
        {busy === "photo" ? "Uploading" : photo ? "Change photo" : "Choose photo"}</ActionButton>
      <input ref={file} type="file" accept="image/*" hidden onChange={choose} />
    </div>}
    {format !== "tune" && <label className="fd-trivia-field"><span>{format === "picture" ? "Question (optional)" : "Question"}</span>
      <textarea value={text} maxLength={TRIVIA_TEXT_MAX} rows={3} onChange={event => setText(event.target.value)} /></label>}
    {format === "number" && <div className="fd-trivia-field-row">
      <label className="fd-trivia-field"><span>Answer</span><input inputMode="numeric" value={number}
        onChange={event => setNumber(event.target.value.replace(/[^\d,]/g, ""))} /></label>
      <label className="fd-trivia-field"><span>Unit</span><input value={unit} maxLength={TRIVIA_UNIT_MAX} placeholder="feet"
        onChange={event => setUnit(event.target.value)} /></label>
      <div className="fd-trivia-field"><span>Wheels</span><div className="fd-trivia-stepper">
        <button type="button" aria-label="One wheel fewer" disabled={digits <= Math.max(1, digitsFor(numeric))}
          onClick={() => setDigits(d => d - 1)}><Icon name="minus" size={16} /></button>
        <b>{digits}</b>
        <button type="button" aria-label="One wheel more" disabled={digits >= TRIVIA_DIGITS_MAX}
          onClick={() => setDigits(d => d + 1)}><Icon name="plus" size={16} /></button></div></div>
    </div>}
    {(format === "choice" || format === "picture") && <ol className="fd-trivia-option-fields">
      {options.map((option, i) => <li key={i} className={answer === i ? "is-right" : ""}>
        <button type="button" className="fd-trivia-mark" aria-pressed={answer === i} aria-label={`Answer ${LETTERS[i]} is right`}
          onClick={() => setAnswer(i)}>{answer === i ? <Icon name="check" size={18} /> : LETTERS[i]}</button>
        <input value={option} maxLength={TRIVIA_OPTION_MAX} aria-label={`Answer ${LETTERS[i]}`}
          onChange={event => setOptions(list => list.map((item, k) => k === i ? event.target.value : item))} />
      </li>)}
    </ol>}
    {format === "tune" && <div className="fd-trivia-songs">
      {songs.map((song, i) => <SongSlot key={i} value={song} letter={LETTERS[i]} right={answer === i} onRight={() => setAnswer(i)}
        onChange={next => setSongs(list => list.map((item, k) => k === i ? next : item))} />)}
      {songs[answer]?.title && <ClipStatus song={songs[answer]} />}
    </div>}
    {showing && !checked.error && <Preview question={checked.question} />}
    {error && <p className="fd-trivia-error" role="alert">{error}</p>}
    <div className="fd-trivia-editor-actions">
      <ActionButton onClick={save} disabled={!!busy}>Save question</ActionButton>
      <ActionButton variant="secondary" disabled={!!checked.error} onClick={() => setShowing(value => !value)}>
        {showing ? "Hide preview" : "Preview"}</ActionButton>
      <ActionButton variant="tertiary" onClick={onCancel}>Cancel</ActionButton>
    </div>
  </div>;
}

/* a round the commissioner writes: its name and its questions */
function CustomRound({ round, onSave, onCancel }) {
  const [name, setName] = useState(round?.name || "");
  const [questions, setQuestions] = useState(round?.questions || []);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");
  if (editing) return <QuestionEditor question={editing === "new" ? null : questions.find(question => question.id === editing)}
    onCancel={() => setEditing(null)}
    onSave={question => {
      setQuestions(list => list.some(item => item.id === question.id) ? list.map(item => item.id === question.id ? question : item)
        : [...list, question]);
      setEditing(null);
    }} />;
  const move = (i, by) => setQuestions(list => {
    const next = [...list];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    return next;
  });
  const save = async () => {
    setError("");
    const result = await onSave({ id:round?.id || newId("t"), source:"custom", name, questions });
    if (result?.ok !== true) setError(result?.error || "Not saved. Try again.");
  };
  return <div className="fd-trivia-editor">
    <label className="fd-trivia-field"><span>Round</span><input value={name} maxLength={TRIVIA_NAME_MAX} placeholder="The groom"
      onChange={event => setName(event.target.value)} /></label>
    <ol className="fd-trivia-qlist">
      {questions.map((question, i) => <li key={question.id}>
        <span className="fd-trivia-qicon"><Icon name={FORMAT_ICONS[question.format]} size={18} /></span>
        <span className="fd-trivia-qtext"><strong>{titleOf(question)}</strong><small>{answerOf(question)}</small></span>
        <span className="fd-trivia-qactions">
          <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><Icon name="up" size={16} /></button>
          <button type="button" aria-label="Move down" disabled={i === questions.length - 1} onClick={() => move(i, 1)}><Icon name="down" size={16} /></button>
          <button type="button" onClick={() => setEditing(question.id)}>Edit</button>
          <button type="button" onClick={() => setQuestions(list => list.filter(item => item.id !== question.id))}>Remove</button>
        </span>
      </li>)}
    </ol>
    {questions.length < TRIVIA_MAX_QUESTIONS && <ActionButton variant="secondary" onClick={() => setEditing("new")}>Add question</ActionButton>}
    {error && <p className="fd-trivia-error" role="alert">{error}</p>}
    <div className="fd-trivia-editor-actions">
      <ActionButton onClick={save} disabled={!questions.length || !name.trim()}>Save round</ActionButton>
      <ActionButton variant="tertiary" onClick={onCancel}>Cancel</ActionButton>
    </div>
  </div>;
}

/* a bank category: tick the questions that play */
function BankRound({ round, category, onSave, onCancel }) {
  const [picks, setPicks] = useState(() => round?.picks || category.questions.slice(0, BANK_PICKS).map(question => question.id));
  const [open, setOpen] = useState(null);
  const [error, setError] = useState("");
  const toggle = id => setPicks(list => list.includes(id) ? list.filter(item => item !== id)
    : list.length >= TRIVIA_MAX_QUESTIONS ? list : [...list, id]);
  const save = async () => {
    setError("");
    const ordered = category.questions.map(question => question.id).filter(id => picks.includes(id));
    const result = await onSave({ id:round?.id || newId("t"), source:"bank", category:category.id, picks:ordered });
    if (result?.ok !== true) setError(result?.error || "Not saved. Try again.");
  };
  return <div className="fd-trivia-editor">
    <h3 className="fd-trivia-desk-title">{category.name}</h3>
    <ol className="fd-trivia-qlist is-bank">
      {category.questions.map(question => <li key={question.id} className={picks.includes(question.id) ? "is-on" : ""}>
        <button type="button" className="fd-trivia-check" role="checkbox" aria-checked={picks.includes(question.id)}
          aria-label={`Play ${titleOf(question)}`} onClick={() => toggle(question.id)}>
          {picks.includes(question.id) && <Icon name="check" size={16} />}</button>
        <button type="button" className="fd-trivia-qtext" onClick={() => setOpen(id => id === question.id ? null : question.id)}
          aria-expanded={open === question.id}>
          <strong>{titleOf(question)}</strong><small>{answerOf(question)}</small></button>
        {question.format === "tune" && picks.includes(question.id) && <ClipStatus song={question.options[0]} />}
        {open === question.id && <div className="fd-trivia-qopen"><Preview question={question} /></div>}
      </li>)}
    </ol>
    <p className="fd-trivia-hint">{plural(picks.length, "question")}</p>
    {error && <p className="fd-trivia-error" role="alert">{error}</p>}
    <div className="fd-trivia-editor-actions">
      <ActionButton onClick={save} disabled={!picks.length}>Save round</ActionButton>
      <ActionButton variant="tertiary" onClick={onCancel}>Cancel</ActionButton>
    </div>
  </div>;
}

/* Commissioner > Trivia: the set list in play order. Rounds come from the
   bank or are written here. Locked while a game runs; Restart clears the
   answers, never the set list. */
export function TriviaDesk({ state, onAct, notify, loadBank = triviaBank }) {
  const rounds = state.triviaRounds || [];
  const game = state.trivia?.questions?.length ? state.trivia : null;
  const running = !!game && !triviaFinished(state);
  const { bank, error } = useBank(loadBank);
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const save = async payload => {
    const result = await onAct("triviaSaveRound", { round:payload });
    if (result?.ok) { setEditing(null); setAdding(false); }
    return result;
  };
  const nameOf = round => round.source === "bank" ? bank?.find(category => category.id === round.category)?.name || "Bank round" : round.name;
  if (editing) {
    const round = editing.id ? rounds.find(item => item.id === editing.id) : null;
    if (editing.source === "custom") return <CustomRound round={round} onSave={save} onCancel={() => setEditing(null)} />;
    const category = bank?.find(item => item.id === (round?.category || editing.category));
    if (!category) return <p className="fd-trivia-hint">{error || "Loading the bank"}</p>;
    return <BankRound round={round} category={category} onSave={save} onCancel={() => setEditing(null)} />;
  }
  const total = rounds.reduce((sum, round) => sum + triviaRoundCount(round), 0);
  return <div className="fd-trivia-desk">
    {running && <div className="fd-trivia-running">
      <span>Question {game.index + 1} of {game.questions.length} live</span>
      <button type="button" className={confirm === "restart" ? "is-confirm" : ""} onClick={async () => {
        if (confirm !== "restart") { setConfirm("restart"); return; }
        setConfirm(null);
        const result = await onAct("triviaRestart", { evId:game.eventId });
        if (!result?.ok) notify?.(result?.error || "Couldn't restart");
      }}>{confirm === "restart" ? "Clear every answer?" : "Restart game"}</button>
    </div>}
    <ol className="fd-trivia-rounds">
      {rounds.map((round, index) => <li key={round.id}>
        <span className="fd-trivia-round-n">{index + 1}</span>
        <span className="fd-trivia-qtext"><strong>{nameOf(round)}</strong><small>{plural(triviaRoundCount(round), "question")}</small></span>
        {!running && <span className="fd-trivia-qactions">
          <button type="button" aria-label={`Move ${nameOf(round)} up`} disabled={index === 0}
            onClick={() => onAct("triviaMoveRound", { id:round.id, by:-1 })}><Icon name="up" size={16} /></button>
          <button type="button" aria-label={`Move ${nameOf(round)} down`} disabled={index === rounds.length - 1}
            onClick={() => onAct("triviaMoveRound", { id:round.id, by:1 })}><Icon name="down" size={16} /></button>
          <button type="button" onClick={() => setEditing({ id:round.id, source:round.source })}>Edit</button>
          <button type="button" className={confirm === round.id ? "is-confirm" : ""} onClick={async () => {
            if (confirm !== round.id) { setConfirm(round.id); return; }
            setConfirm(null);
            const result = await onAct("triviaDeleteRound", { id:round.id });
            if (!result?.ok) notify?.(result?.error || "Couldn't remove");
          }}>{confirm === round.id ? "Remove?" : "Remove"}</button>
        </span>}
      </li>)}
    </ol>
    {!running && rounds.length < TRIVIA_MAX_ROUNDS && (adding ? <div className="fd-trivia-add">
      <ActionButton onClick={() => setEditing({ source:"custom" })}>Write a round</ActionButton>
      <ul className="fd-trivia-bank">
        {(bank || []).map(category => <li key={category.id}><button type="button" onClick={() => setEditing({ source:"bank", category:category.id })}>
          <Icon name={category.questions[0]?.format === "tune" ? "song" : "rules"} size={18} />
          <span>{category.name}</span><small>{category.questions.length}</small></button></li>)}
        {!bank && <li className="fd-trivia-hint">{error || "Loading the bank"}</li>}
      </ul>
      <ActionButton variant="tertiary" onClick={() => setAdding(false)}>Cancel</ActionButton>
    </div> : <ActionButton onClick={() => setAdding(true)}>Add round</ActionButton>)}
    <p className="fd-trivia-hint">{plural(total, "question")}</p>
  </div>;
}
