/* Commissioner > Trivia > Question bank (docs/TRIVIA-QBANK.md "The desk"):
   the 7 x 5 board Brandon is picking on top, the bank under it (beside it
   on a laptop). A slot shows its record's few words, a status lamp and a
   warning dot; tapping it compares that slot's alternatives (the bank at
   its category and value). Each record is a card: its media at the exact
   window the TV plays, the four answers with the right one marked, the
   reveal, the sources and audience (this desk only), and Put in slot,
   Edit, Favorite, Shortlist, Reject. Every change is a commissioner write
   (qbankAssign, qbankEdit, qbankMark, qbankPlanReset, qbankImport), so it
   survives a reload and shows on his other devices; one write at a time.
   The records come over GET /api/trivia/qbank (the commissioner's token);
   the plan, edits and marks ride his frame. */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { triviaQBank } from "../../lib/client.js";
import { useReducedMotion } from "../../lib/motion.js";
import { writeError } from "../../lib/writeErrors.js";
import { ActionButton, Sheet } from "../../ui/controls.jsx";
import { Icon } from "../../ui/Icon.jsx";
import { OneSafe } from "../../ui/OneSafe.jsx";
import {
  QBANK_CATEGORIES, QBANK_LIMITS, QBANK_STATUSES, QBANK_VALUES, qbankWarnings,
} from "../../../shared/triviaQBank.js";
import {
  MARK_NAMES, STATUS_COUNTED, NO_FILTERS, PAGE_SIZE, REACH_NAMES, STATUS_NAMES, VERIFIED_NAMES, answerOption, bankView, boardView,
  QBANK_TIERS, categoryName, checkEdit, deskRecords, recordsById, revealsAnswer, warningCount, exportFileName, exportPayload, parseImport, planColumns, planSummary, slotAlternatives,
  slotChoices, slotKey, slotTarget, statusCounts, valueOfTier, warningLines, windowLabel,
} from "./qbankModel.js";
import { toggleClip, stopClip, useClip } from "./qbankMedia.js";
import { FormatSwitch } from "./BoardDesk.jsx";
import { BOARD_FORMAT, triviaFormatOf } from "../../../shared/triviaBoard.js";
import { triviaLive } from "../../../shared/trivia.js";
import "./trivia.css";
import "./qbank.css";

const LETTERS = ["A", "B", "C", "D"];
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const LAMP = { ready:"is-ready", confirm:"is-confirm is-pending", asset:"is-asset is-off", rejected:"is-rejected is-void" };
const SPOKEN = { ready:"ready", confirm:"needs your answer", asset:"needs its asset", rejected:"rejected", empty:"empty" };
const shortDate = iso => {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso || "" : d.toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" });
};

function Lamp({ status }) {
  return <i className={`fd-insert fd-qb-lamp ${LAMP[status] || "is-off"}`} aria-hidden="true" />;
}

/* the bank's records, read once per desk and again on Retry */
function useQBank(load, preloaded) {
  const [bank, setBank] = useState(preloaded || null);
  const [error, setError] = useState("");
  const [tries, setTries] = useState(0);
  useEffect(() => {
    if (preloaded && !tries) return undefined;
    let gone = false;
    setError("");
    load().then(result => {
      if (gone) return;
      if (result?.ok && Array.isArray(result.records)) setBank(result);
      else setError(result?.error || "Couldn't load the question bank. Try again.");
    });
    return () => { gone = true; };
  }, [tries]); // eslint-disable-line react-hooks/exhaustive-deps
  return { bank, error, retry:() => setTries(n => n + 1) };
}

/* ── the board ── */
function Board({ board, selected, onSelect }) {
  return <div className="fd-qb-boardwrap">
    <div className="fd-qb-board" role="grid" aria-label="Board">
      <span className="fd-qb-corner" aria-hidden="true" />
      {QBANK_VALUES.map((value, slot) => <span key={`v${slot}`} className="fd-qb-val" style={{ "--s":slot + 2 }} aria-hidden="true">{value}</span>)}
      {board.map((column, col) => <React.Fragment key={column.category}>
        <span className="fd-qb-cat" style={{ "--c":col + 2 }}><OneSafe text={column.name} /></span>
        {column.cells.map(cell => {
          const on = selected?.col === col && selected?.slot === cell.slot;
          return <button type="button" key={cell.slot} style={{ "--c":col + 2, "--s":cell.slot + 2 }}
            className={`fd-qb-cell${cell.qid ? "" : " is-empty"}${on ? " is-selected" : ""}${cell.warnings.length ? " is-warned" : ""}`}
            aria-pressed={on} onClick={() => onSelect(on ? null : { col, slot:cell.slot })}
            aria-label={`${column.name} ${cell.value}: ${cell.qid ? cell.label : "empty"}${cell.qid ? `, ${SPOKEN[cell.lamp]}` : ""}`
              + `${cell.warnings.length ? `, ${plural(cell.warnings.length, "warning")}` : ""}`}>
            {cell.qid ? <Lamp status={cell.lamp} /> : <Icon name="plus" size={16} />}
            {cell.qid && <span className="fd-qb-cell-label is-long"><OneSafe text={cell.label} /></span>}
            {cell.qid && <span className="fd-qb-cell-label is-short" aria-hidden="true"><OneSafe text={cell.short} /></span>}
            {cell.warnings.length > 0 && <b className="fd-qb-dot" aria-hidden="true" />}
          </button>;
        })}
      </React.Fragment>)}
    </div>
  </div>;
}

/* ── media ── */
function ClipButton({ id, media, video }) {
  const clip = useClip(id);
  const playing = clip.status === "playing" || clip.status === "loading";
  return <div className="fd-qb-clip">
    <button type="button" className="fd-qb-play" aria-pressed={playing} onClick={() => toggleClip(id, media, video?.current || null)}
      aria-label={playing ? "Stop" : `Play ${windowLabel(media)}`}>
      <Icon name={playing ? "stop" : "play"} size={20} /></button>
    <span className="fd-qb-clip-track"><span className="fd-qb-clip-fill" style={{ transform:`scaleX(${clip.progress})` }} /></span>
    <span className="fd-qb-clip-time">{windowLabel(media)}</span>
    {clip.error && <span className="fd-qb-clip-error" role="status">{clip.error}</span>}
  </div>;
}

function Media({ record, clipKey }) {
  const [reveal, setReveal] = useState(false);
  const video = useRef(null);
  const media = record.media;
  if (!media) return null;
  const image = reveal && record.revealMedia ? record.revealMedia : media.kind === "image" ? media : null;
  return <div className={`fd-qb-media is-${media.kind}`}>
    {media.kind === "video" && !reveal && <video ref={video} src={media.src} poster={media.poster} playsInline preload="metadata"
      muted={false} className="fd-qb-video" aria-label="Clip" />}
    {media.kind === "audio" && !reveal && <span className="fd-qb-audioart" aria-hidden="true"><Icon name="sound" size={28} /></span>}
    {image && <img src={image.src} alt="" loading="lazy" decoding="async" width={image.w || undefined} height={image.h || undefined} />}
    {media.kind !== "image" && !reveal && <ClipButton id={clipKey} media={media} video={video} />}
    {record.revealMedia && <button type="button" className="fd-qb-revealswitch" aria-pressed={reveal}
      onClick={() => { stopClip(); setReveal(on => !on); }}>{reveal ? "Clue" : "Reveal"}</button>}
  </div>;
}

/* ── a card ── */
function Badges({ record, showCategory }) {
  /* on the board at its own value says only that; anywhere else says where */
  const elsewhere = record.placed.filter(({ slot }) => slot + 1 !== Number(record.tier)).map(({ slot }) => QBANK_VALUES[slot]);
  return <div className="fd-qb-badges">
    <span className={`fd-qb-status is-${record.status}`}><Lamp status={record.status} />{STATUS_NAMES[record.status] || record.status}</span>
    <span className="fd-qb-tier">{valueOfTier(record.tier)}</span>
    {showCategory && <span className="fd-qb-badge">{categoryName(record.category)}</span>}
    {record.placed.length > 0 && <span className="fd-qb-badge is-board">{elsewhere.length ? `On the board at ${elsewhere.join(", ")}` : "On the board"}</span>}
    {record.mark && <span className={`fd-qb-badge is-mark is-${record.mark}`}>{MARK_NAMES[record.mark]}</span>}
    {record.surprise && <span className="fd-qb-badge is-caution">Wedding surprise</span>}
    {record.personal === "needs-brandon" && <span className="fd-qb-badge is-caution">Needs your answer</span>}
    {revealsAnswer(record) && <span className="fd-qb-badge is-caution">Asset gives it away</span>}
    {record.edited && <span className="fd-qb-badge">Edited</span>}
  </div>;
}

function Details({ record }) {
  const tags = record.tags || {};
  const verified = record.verified || {};
  return <details className="fd-qb-details">
    <summary>Sources and audience</summary>
    <dl>
      <dt>Checked</dt><dd>{[VERIFIED_NAMES[verified.by] || "Not checked", verified.at && shortDate(verified.at),
        verified.cutoff && `rosters to ${shortDate(verified.cutoff)}`].filter(Boolean).join(" · ")}</dd>
      {(record.sources || []).length > 0 && <><dt>Sources</dt><dd><ul className="fd-qb-sources">
        {record.sources.map((source, i) => <li key={i}><a href={source.url} target="_blank" rel="noreferrer noopener">
          {source.note || source.url}<Icon name="open" size={14} /></a>{source.checkedAt && <small>{shortDate(source.checkedAt)}</small>}</li>)}
      </ul></dd></>}
      {(tags.likely || []).length > 0 && <><dt>Likely</dt><dd>{tags.likely.join(", ")}</dd></>}
      {(tags.possible || []).length > 0 && <><dt>Possible</dt><dd>{tags.possible.join(", ")}</dd></>}
      {tags.reach && <><dt>Reach</dt><dd>{REACH_NAMES[tags.reach] || tags.reach}</dd></>}
      {(tags.topics || []).length > 0 && <><dt>Topics</dt><dd>{tags.topics.join(", ")}</dd></>}
      {record.media && <><dt>File</dt><dd className="fd-qb-file">{[record.media.src.split("/").pop().slice(0, 40), record.media.mime,
        record.media.w && record.media.h && `${record.media.w}×${record.media.h}`, windowLabel(record.media)].filter(Boolean).join(" · ")}</dd></>}
      {record.variantOf && <><dt>Variant of</dt><dd>{record.variantOf}</dd></>}
      <dt>Id</dt><dd className="fd-qb-file">{record.id}</dd>
    </dl>
  </details>;
}

function SlotPicker({ plan, record, pending, onPut }) {
  return <div className="fd-qb-slotpick" role="group" aria-label="Pick a slot">
    {slotChoices(plan, record).map(choice => <button type="button" key={choice.slot} disabled={!!pending || choice.own}
      className={choice.qid ? "is-filled" : ""} aria-label={`${choice.value}${choice.own ? ", already here" : choice.qid ? ", replace" : ", empty"}`}
      onClick={() => onPut(record, { col:choice.col, slot:choice.slot })}>
      <b>{choice.value}</b><small>{choice.own ? "Here" : choice.qid ? "Replace" : "Empty"}</small></button>)}
  </div>;
}

function QCard({ group, plan, selected, showCategory, pending, error, onPut, onClear, onMark, onEdit, onForce }) {
  const [shown, setShown] = useState(group.records[0].id);
  const [picking, setPicking] = useState(false);
  const record = group.records.find(item => item.id === shown) || group.records[0];
  const target = selected || slotTarget(plan, record);
  const columns = planColumns(plan);
  const here = target && columns[target.col]?.slots[target.slot] === record.id;
  const right = answerOption(record);
  const busy = !!pending;
  const mark = async value => onMark(record, record.mark === value ? null : value);
  return <article className={`fd-qb-card${record.placed.length ? " is-placed" : ""}${record.mark === "reject" || record.status === "rejected" ? " is-out" : ""}`}
    aria-label={record.subject || record.prompt}>
    <Badges record={record} showCategory={showCategory} />
    {group.records.length > 1 && <div className="fd-qb-variants" role="radiogroup" aria-label="Variants">
      {group.records.map((item, i) => <button type="button" role="radio" key={item.id} aria-checked={item.id === record.id}
        onClick={() => { stopClip(); setShown(item.id); }}>{item.media ? windowLabel(item.media) || `Clip ${i + 1}` : `Version ${i + 1}`}</button>)}
    </div>}
    <Media key={record.id} record={record} clipKey={`qb:${record.id}`} />
    <div className="fd-qb-q">
      {record.subject && <h3 className="fd-qb-subject">{record.subject}</h3>}
      <p className="fd-qb-prompt">{record.prompt}</p>
    </div>
    <ol className="fd-qb-options">
      {(record.options || []).map((option, i) => <li key={option.id} className={option.id === record.answer ? "is-right" : ""}>
        <span className="fd-qb-letter" aria-hidden="true">{option.id === record.answer ? <Icon name="check" size={16} /> : LETTERS[i]}</span>
        <span className="fd-qb-option-text">{option.text}{option.id === record.answer && <span className="fd-sr"> (right answer)</span>}</span>
      </li>)}
    </ol>
    {record.reveal && <p className="fd-qb-reveal"><b>Reveal</b>{record.reveal}</p>}
    {record.notes && <p className="fd-qb-notes"><b>Notes</b>{record.notes}</p>}
    <Details record={record} />
    {!right && <p className="fd-qb-error" role="alert">No right answer is marked. Edit it.</p>}
    <div className="fd-qb-actions">
      {here ? <ActionButton variant="secondary" compact disabled={busy} pending={pending === `assign:${record.id}`}
        onClick={() => onClear(target, record)}>Take off board</ActionButton>
        : <ActionButton compact disabled={busy || !target} pending={pending === `assign:${record.id}`}
          onClick={() => onPut(record, target)}>{target ? `Put in ${QBANK_VALUES[target.slot]}` : "Put in slot"}</ActionButton>}
      <button type="button" className="fd-qb-more" aria-expanded={picking} aria-label="Pick a slot" onClick={() => setPicking(on => !on)}>
        <Icon name={picking ? "collapse" : "expand"} size={18} /></button>
      <button type="button" className="fd-qb-act" disabled={busy} onClick={() => onEdit(record)}><Icon name="pencil" size={16} />Edit</button>
    </div>
    {/* on the board but not ready: his call to play it anyway (never a
        personal clue still waiting on his answer) */}
    {record.placed.length > 0 && record.status !== "ready" && record.personal !== "needs-brandon" && <button type="button"
      className="fd-qb-force" aria-pressed={record.forced} disabled={busy} aria-busy={pending === `force:${record.id}` || undefined}
      onClick={() => onForce(record, !record.forced)}><Lamp status={record.forced ? "ready" : "confirm"} />Play anyway</button>}
    {picking && <SlotPicker plan={plan} record={record} pending={pending} onPut={(r, slot) => { setPicking(false); onPut(r, slot); }} />}
    <div className="fd-qb-marks" role="group" aria-label="Mark">
      {[["fav", "Favorite", "star"], ["short", "Shortlist", "check"], ["reject", "Reject", "close"]].map(([id, name, icon]) =>
        <button type="button" key={id} className={`fd-qb-mark is-${id}`} aria-pressed={record.mark === id} disabled={busy}
          aria-busy={pending === `mark:${record.id}` || undefined} onClick={() => mark(id)}><Icon name={icon} size={16} />{name}</button>)}
    </div>
    {error && <p className="fd-qb-error" role="alert">{error}</p>}
  </article>;
}

/* ── the editor ── */
function Editor({ record, prior, pending, onSave, onRevert, onClose }) {
  const base = record.base || record;
  const [draft, setDraft] = useState(() => ({ prompt:record.prompt, options:record.options.map(option => ({ ...option })),
    answer:record.answer, reveal:record.reveal || "", tier:record.tier, status:record.status, notes:record.notes || "",
    media:record.media && record.media.kind !== "image" ? { start:record.media.start || 0, duration:record.media.duration || 0 } : undefined }));
  const [error, setError] = useState("");
  const set = patch => { setDraft(d => ({ ...d, ...patch })); setError(""); };
  const clipMedia = record.media && record.media.kind !== "image" ? { ...record.media, ...draft.media } : null;
  useEffect(() => () => stopClip(), []);
  const save = async () => {
    const checked = checkEdit(base, draft, prior);
    if (checked.error) { setError(checked.error); return; }
    if (!checked.patch && !record.edited) { onClose(); return; }
    const result = await onSave(record, checked.patch);
    if (result?.ok) onClose(); else setError(writeError(result));
  };
  const busy = !!pending;
  return <Sheet title="Edit question" onClose={onClose} busy={busy} layer={130} className="fd-qb-editor-sheet">
    <div className="fd-qb-editor">
      <label className="fd-qb-field"><span>Question <small>{draft.prompt.length}/{QBANK_LIMITS.prompt}</small></span>
        <textarea rows={3} maxLength={QBANK_LIMITS.prompt} value={draft.prompt} onChange={event => set({ prompt:event.target.value })} /></label>
      <fieldset className="fd-qb-field"><legend>Answers</legend>
        <ol className="fd-qb-option-fields">
          {draft.options.map((option, i) => <li key={option.id} className={draft.answer === option.id ? "is-right" : ""}>
            <button type="button" className="fd-qb-letter" aria-pressed={draft.answer === option.id}
              aria-label={`${LETTERS[i]} is right`} onClick={() => set({ answer:option.id })}>
              {draft.answer === option.id ? <Icon name="check" size={16} /> : LETTERS[i]}</button>
            <input value={option.text} maxLength={QBANK_LIMITS.option} aria-label={`Answer ${LETTERS[i]}`}
              onChange={event => set({ options:draft.options.map((item, k) => k === i ? { ...item, text:event.target.value } : item) })} />
          </li>)}
        </ol>
      </fieldset>
      <label className="fd-qb-field"><span>Reveal</span>
        <textarea rows={3} maxLength={QBANK_LIMITS.reveal} value={draft.reveal} onChange={event => set({ reveal:event.target.value })} /></label>
      <fieldset className="fd-qb-field"><legend>Value</legend>
        <div className="fd-qb-seg" role="radiogroup" aria-label="Value">
          {QBANK_TIERS.map(tier => <button type="button" role="radio" key={tier} aria-checked={Number(draft.tier) === tier}
            onClick={() => set({ tier })}>{valueOfTier(tier)}</button>)}
        </div>
      </fieldset>
      {clipMedia && <fieldset className="fd-qb-field"><legend>Clip</legend>
        <div className="fd-qb-window">
          <label><span>Start (s)</span><input inputMode="decimal" value={draft.media.start}
            onChange={event => set({ media:{ ...draft.media, start:event.target.value.replace(/[^\d.]/g, "") } })} /></label>
          <label><span>Length (s)</span><input inputMode="decimal" value={draft.media.duration}
            onChange={event => set({ media:{ ...draft.media, duration:event.target.value.replace(/[^\d.]/g, "") } })} /></label>
        </div>
        <ClipButton id={`qb-edit:${record.id}`} media={{ ...clipMedia, start:Number(draft.media.start) || 0, duration:Number(draft.media.duration) || 0 }}
          video={null} />
      </fieldset>}
      <fieldset className="fd-qb-field"><legend>Status</legend>
        <div className="fd-qb-seg is-status" role="radiogroup" aria-label="Status">
          {QBANK_STATUSES.map(status => <button type="button" role="radio" key={status} aria-checked={draft.status === status}
            onClick={() => set({ status })}><Lamp status={status} />{STATUS_NAMES[status]}</button>)}
        </div>
      </fieldset>
      <label className="fd-qb-field"><span>Notes</span>
        <textarea rows={2} maxLength={QBANK_LIMITS.notes} value={draft.notes} onChange={event => set({ notes:event.target.value })} /></label>
      {error && <p className="fd-qb-error" role="alert">{error}</p>}
      <div className="fd-qb-editor-actions">
        <ActionButton onClick={save} disabled={busy} pending={pending === `edit:${record.id}`}>Save</ActionButton>
        <ActionButton variant="tertiary" onClick={onClose} disabled={busy}>Cancel</ActionButton>
      </div>
      {record.edited && <ActionButton variant="destructive" compact disabled={busy} pending={pending === `revert:${record.id}`}
        onClick={async () => {
          const result = await onRevert(record);
          if (result?.ok) onClose(); else setError(writeError(result));
        }}>Undo my edits</ActionButton>}
    </div>
  </Sheet>;
}

/* ── filters ── */
const FILTER_SELECTS = [
  ["category", "Category", [["all", "Category"], ...QBANK_CATEGORIES.map(category => [category.id, category.name])]],
  ["tier", "Value", [["all", "Value"], ...QBANK_TIERS.map(tier => [String(tier), String(valueOfTier(tier))])]],
  ["status", "Status", [["all", "Status"], ...QBANK_STATUSES.map(status => [status, STATUS_NAMES[status]])]],
  ["mark", "Mark", [["all", "Mark"], ["board", "On the board"], ["fav", "Favorites"], ["short", "Shortlist"], ["reject", "Rejected"], ["none", "Unmarked"]]],
];
function Filters({ filters, onChange, count }) {
  const active = Object.entries(NO_FILTERS).some(([k, v]) => String(filters[k]) !== String(v));
  return <div className="fd-qb-filters">
    <label className="fd-qb-search"><Icon name="search" size={18} />
      <input type="search" value={filters.query} placeholder="Search" aria-label="Search the bank" autoComplete="off" autoCorrect="off"
        spellCheck={false} enterKeyHint="search" onChange={event => onChange({ query:event.target.value })}
        onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label>
    <div className="fd-qb-selects">
      {FILTER_SELECTS.map(([key, label, options]) => <label key={key} className={String(filters[key]) !== "all" ? "is-set" : ""}>
        <span className="fd-sr">{label}</span>
        <select value={String(filters[key])} onChange={event => onChange({ [key]:event.target.value })}>
          {options.map(([value, name]) => <option key={value} value={value}>{name}</option>)}
        </select><Icon name="down" size={16} /></label>)}
    </div>
    <div className="fd-qb-count"><span>{plural(count, "question")}</span>
      {active && <button type="button" onClick={() => onChange({ ...NO_FILTERS })}>Clear filters</button>}</div>
  </div>;
}

/* ── the desk ── */
/* `initial` opens a slot or the editor straight away (the rehearsal page);
   `preloaded` is the bank's answer already in hand (a test) */
export function QBankDesk({ state, onAct, notify, loadQBank = triviaQBank, initial = null, preloaded = null }) {
  const { bank, error:loadError, retry } = useQBank(loadQBank, preloaded);
  const reduced = useReducedMotion();
  /* the plan, edits and marks ride the commissioner's frame; a frame
     without them falls back to what the bank's answer carried */
  const live = !!state && "triviaBankEdits" in state;
  const plan = (live && state.triviaPlan) || bank?.plan || bank?.recommended || null;
  const edits = (live ? state.triviaBankEdits : bank?.edits) || {};
  const marks = (live ? state.triviaBankMarks : bank?.marks) || {};
  const records = useMemo(() => deskRecords(bank?.records || [], { edits, marks, plan }), [bank, edits, marks, plan]);
  const byId = useMemo(() => recordsById(records), [records]);
  const warnings = useMemo(() => qbankWarnings(plan, byId), [plan, byId]);
  const board = useMemo(() => boardView(plan, byId, warnings), [plan, byId, warnings]);
  const summary = planSummary(plan, byId);
  const format = triviaFormatOf(state);
  const running = triviaLive(state);
  const lines = warningLines(warnings);
  const problems = warningCount(lines);

  const [selected, setSelected] = useState(initial?.slot || null);
  const [filters, setFilters] = useState(() => ({ ...NO_FILTERS, ...(initial?.filters || {}) }));
  const [pages, setPages] = useState(1);
  const [editing, setEditing] = useState(initial?.edit || null);
  const [pending, setPending] = useState(null);
  const [errors, setErrors] = useState({});
  const [confirm, setConfirm] = useState(null);
  const [showWarnings, setShowWarnings] = useState(!!initial?.warnings);
  const [imported, setImported] = useState(null);
  const pendingRef = useRef(null);
  const bankTop = useRef(null);
  const fileInput = useRef(null);
  useEffect(() => () => stopClip(), []);
  useEffect(() => { setPages(1); }, [filters, selected]);

  /* one write at a time; a failure says what to do where it was asked */
  const write = useCallback(async (key, where, type, payload) => {
    if (pendingRef.current) return { ok:false, error:"One moment" };
    pendingRef.current = key;
    setPending(key);
    setErrors(all => ({ ...all, [where]:"" }));
    let result;
    try { result = await onAct(type, payload); } catch (failure) { result = { ok:false, error:failure?.message }; }
    pendingRef.current = null;
    setPending(null);
    if (!result?.ok) {
      const text = writeError(result);
      setErrors(all => ({ ...all, [where]:text }));
      if (where !== "editor") notify?.(text);
    } else if (!live) retry();
    return result;
  }, [onAct, notify, live]); // eslint-disable-line react-hooks/exhaustive-deps

  const put = (record, slot) => slot && write(`assign:${record.id}`, record.id, "qbankAssign", { col:slot.col, slot:slot.slot, qid:record.id })
    .then(result => { if (result?.ok && !selected) notify?.(`In ${planColumns(plan)[slot.col].name} ${QBANK_VALUES[slot.slot]}`); });
  const clear = (slot, record) => write(`assign:${record?.id || "slot"}`, record?.id || "plan", "qbankAssign", { col:slot.col, slot:slot.slot, qid:null });
  const force = (record, on) => record.placed[0] && write(`force:${record.id}`, record.id, "qbankAssign",
    { col:record.placed[0].col, slot:record.placed[0].slot, qid:record.id, force:on });
  const markRecord = (record, mark) => write(`mark:${record.id}`, record.id, "qbankMark", { qid:record.id, mark });
  const saveEdit = (record, patch) => write(`edit:${record.id}`, "editor", "qbankEdit", { qid:record.id, patch });
  const revert = record => write(`revert:${record.id}`, "editor", "qbankEdit", { qid:record.id, patch:null });

  const selectSlot = slot => {
    stopClip();
    setSelected(slot);
    if (slot) requestAnimationFrame(() => bankTop.current?.scrollIntoView?.({ block:"start", behavior:reduced ? "auto" : "smooth" }));
  };

  const exportPlan = () => {
    const body = JSON.stringify(exportPayload({ plan, edits, marks }), null, 2);
    try {
      const href = URL.createObjectURL(new Blob([`${body}\n`], { type:"application/json" }));
      const link = document.createElement("a");
      link.href = href;
      link.download = exportFileName();
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
    } catch { notify?.("Couldn't save the file. Try again."); }
  };
  const readImport = async event => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const parsed = parseImport(await file.text().catch(() => ""), { knownIds:new Set(records.map(record => record.id)) });
    if (parsed.error) { setErrors(all => ({ ...all, plan:parsed.error })); setImported(null); return; }
    setErrors(all => ({ ...all, plan:"" }));
    setImported(parsed);
  };

  if (!bank) return <div className="fd-qb is-loading">
    {loadError ? <div className="fd-qb-loaderror"><p role="alert">{loadError}</p><ActionButton variant="secondary" onClick={retry}>Retry</ActionButton></div>
      : <p className="fd-qb-hint" role="status">Loading the question bank</p>}
  </div>;

  const column = selected ? planColumns(plan)[selected.col] : null;
  const current = selected ? byId.get(column?.slots[selected.slot]) || null : null;
  const groups = selected ? slotAlternatives(records, plan, selected) : bankView(records, filters);
  const shownGroups = groups.slice(0, pages * PAGE_SIZE);
  const counts = statusCounts(records);
  const editRecord = editing ? byId.get(editing) : null;

  return <div className="fd-qb">
    <section className="fd-qb-side" aria-label="Board">
      {/* the board deals only in the Board format: the switch sits with it */}
      <div className={`fd-qb-format${format === BOARD_FORMAT ? " is-board" : ""}`}>
        <FormatSwitch format={format} disabled={running || !!pending}
          onChange={next => write("format", "plan", "triviaSetFormat", { format:next })} />
      </div>
      <div className="fd-qb-summary">
        <span className="fd-qb-reel" aria-label={`${summary.ready} of ${summary.total} ready`}><b>{summary.ready}</b>/{summary.total}</span>
        <span className="fd-qb-sumtext">ready{summary.total - summary.filled > 0 ? ` · ${summary.total - summary.filled} empty` : ""}</span>
        <button type="button" className={`fd-qb-warnbtn${problems ? " is-on" : ""}`} aria-expanded={showWarnings}
          onClick={() => setShowWarnings(on => !on)} disabled={!problems}>
          {problems ? <><b className="fd-qb-dot" aria-hidden="true" />{plural(problems, "warning")}</> : "No warnings"}</button>
      </div>
      <Board board={board} selected={selected} onSelect={selectSlot} />
      {showWarnings && problems > 0 && <ul className="fd-qb-warnings" aria-label="Warnings">
        {lines.map((line, i) => <li key={i}><button type="button" onClick={() => line.slots[0] && selectSlot(line.slots[0])}>
          <b className="fd-qb-dot" aria-hidden="true" /><span>{line.text}</span>
          <small>{line.slots.slice(0, 4).map(({ col, slot }) => `${planColumns(plan)[col]?.name} ${QBANK_VALUES[slot]}`).join(", ")}
            {line.slots.length > 4 ? ` +${line.slots.length - 4}` : ""}</small></button></li>)}
      </ul>}
      <div className="fd-qb-plantools">
        <button type="button" className={confirm === "reset" ? "is-confirm" : ""} disabled={!!pending}
          aria-busy={pending === "reset" || undefined} onClick={() => {
            if (confirm !== "reset") { setConfirm("reset"); return; }
            setConfirm(null);
            write("reset", "plan", "qbankPlanReset", {}).then(result => { if (result?.ok) notify?.("Back to the recommended board"); });
          }}>{confirm === "reset" ? "Replace your board?" : "Reset to recommended"}</button>
        <button type="button" onClick={exportPlan}>Export</button>
        <button type="button" disabled={!!pending} onClick={() => fileInput.current?.click()}>Import</button>
        <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={readImport} />
      </div>
      {imported && <div className="fd-qb-importing" role="group" aria-label="Import">
        <span>Replace the board, edits and marks with this file?</span>
        <ActionButton compact variant="destructive" disabled={!!pending} pending={pending === "import"} onClick={async () => {
          const result = await write("import", "plan", "qbankImport", imported);
          if (result?.ok) { setImported(null); notify?.("Board imported"); }
        }}>Replace</ActionButton>
        <ActionButton compact variant="tertiary" disabled={!!pending} onClick={() => setImported(null)}>Cancel</ActionButton>
      </div>}
      {errors.plan && <p className="fd-qb-error" role="alert">{errors.plan}</p>}
    </section>

    <section className="fd-qb-bank" aria-label={selected ? "Alternatives" : "Bank"} ref={bankTop}>
      {selected ? <div className="fd-qb-compare">
        <div className="fd-qb-compare-head">
          <span className="fd-qb-compare-title"><b>{column.name}</b><span>{QBANK_VALUES[selected.slot]}</span></span>
          <button type="button" className="fd-qb-link" onClick={() => selectSlot(null)}>Whole bank</button>
        </div>
        <div className="fd-qb-count"><span>{current ? plural(groups.length - 1, "other") : plural(groups.length, "alternative")}</span>
          {!current && <span>Empty slot</span>}</div>
      </div> : <Filters filters={filters} count={groups.length} onChange={patch => setFilters(f => ({ ...f, ...patch }))} />}
      {!selected && !filters.query && filters.status === "all" && <p className="fd-qb-statusline">
        {QBANK_STATUSES.filter(status => counts[status]).map(status => <span key={status}><Lamp status={status} />{counts[status]} {STATUS_COUNTED[status]}</span>)}
      </p>}
      {groups.length === 0 && <p className="fd-qb-hint">{selected ? "Nothing else in the bank at this value" : "Nothing matches"}</p>}
      <div className={`fd-qb-cards${selected ? " is-compare" : ""}`}>
        {shownGroups.map(group => <QCard key={group.id} group={group} plan={plan} selected={selected} showCategory={!selected && filters.category === "all"}
          pending={pending} error={errors[group.records[0].id] || group.records.map(item => errors[item.id]).find(Boolean) || ""}
          onPut={put} onClear={clear} onMark={markRecord} onForce={force} onEdit={record => { stopClip(); setEditing(record.id); }} />)}
      </div>
      {groups.length > shownGroups.length && <ActionButton variant="secondary" onClick={() => setPages(n => n + 1)}>
        {`Show ${Math.min(PAGE_SIZE, groups.length - shownGroups.length)} more`}</ActionButton>}
    </section>
    {editRecord && <Editor record={editRecord} prior={edits[editRecord.id] || null} pending={pending} onSave={saveEdit} onRevert={revert}
      onClose={() => { stopClip(); setErrors(all => ({ ...all, editor:"" })); setEditing(null); }} />}
  </div>;
}

