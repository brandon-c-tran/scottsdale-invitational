/* Commissioner > Trivia > Your board (docs/TRIVIA-QBANK.md "The desk"): the
   7 x 5 board Brandon is picking. One job: tap a slot, pick from a short
   list, done. A slot opens its sheet (the whole phone, the right column on
   a laptop): "Pass the Aux · 200", its pick, then every other question of
   that category as compact rows, this value first. A row is a thumbnail or
   a play button (the exact window the TV plays), the question, the answer,
   a lamp and where else it is used; tapped, it opens in place with the four
   options, the reveal, the bigger media and Use this (Edit, the marks and
   the sources sit under More). Previous and Next walk the board without
   closing the sheet. Browse all is the whole bank with search and filters.

   Every change is a commissioner write (qbankAssign, qbankEdit, qbankMark,
   qbankPlanReset, qbankImport), so it survives a reload and shows on his
   other devices; one write at a time. The records come over GET
   /api/trivia/qbank (his token); the plan, edits and marks ride his frame. */
import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { triviaQBank } from "../../lib/client.js";
import { useReducedMotion } from "../../lib/motion.js";
import { writeError } from "../../lib/writeErrors.js";
import { ActionButton, Sheet } from "../../ui/controls.jsx";
import { Icon } from "../../ui/Icon.jsx";
import { OneSafe } from "../../ui/OneSafe.jsx";
import {
  QBANK_CATEGORIES, QBANK_LIMITS, QBANK_STATUSES, QBANK_VALUES, qbankCategory, qbankWarnings,
} from "../../../shared/triviaQBank.js";
import {
  MARK_NAMES, NO_FILTERS, PAGE_SIZE, QBANK_TIERS, REACH_NAMES, STATUS_COUNTED, STATUS_NAMES, VERIFIED_NAMES, answerOption, bankView,
  boardView, categoryName, checkEdit, deskRecords, exportFileName, exportPayload, parseImport, planColumns, planSummary, recordsById,
  revealsAnswer, slotRows, slotStep, slotTarget, statusCounts, usedElsewhere, valueOfTier, warningCount, warningLines, windowLabel,
} from "./qbankModel.js";
import { stopClip, toggleClip, useClip } from "./qbankMedia.js";
import "./trivia.css";
import "./qbank.css";

const LETTERS = ["A", "B", "C", "D"];
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const SOFT_HYPHEN = String.fromCharCode(173);
/* a long word in a phone's narrow slot breaks with a hyphen, not mid-letter */
const breakable = text => String(text || "").replace(/\S{9,}/g, word => word.replace(/(.{6})(?=.{3})/g, `$1${SOFT_HYPHEN}`));
const LAMP = { ready:"is-ready", confirm:"is-confirm is-pending", asset:"is-asset is-off", rejected:"is-rejected is-void" };
const SPOKEN = { ready:"ready", confirm:"needs your answer", asset:"needs its asset", rejected:"rejected", empty:"empty" };
const FLASH_MS = 1600;
const shortDate = iso => {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso || "" : d.toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" });
};
/* "Aux 300": a slot named short; within `from`'s column, its value alone */
const slotName = (plan, at, from = null) => !at ? "" : from && from.col === at.col ? String(QBANK_VALUES[at.slot])
  : `${qbankCategory(planColumns(plan)[at.col]?.category)?.short || ""} ${QBANK_VALUES[at.slot]}`.trim();

function Lamp({ status }) {
  return <i className={`fd-insert fd-qb-lamp ${LAMP[status] || "is-off"}`} aria-hidden="true" />;
}

/* the laptop's two columns, from 1000 px */
function useWide() {
  const query = "(min-width:1000px)";
  const [wide, setWide] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const list = window.matchMedia?.(query);
    if (!list) return undefined;
    const on = () => setWide(list.matches);
    list.addEventListener?.("change", on);
    return () => list.removeEventListener?.("change", on);
  }, []);
  return wide;
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
function Board({ board, selected, flash, onSelect }) {
  return <div className="fd-qb-boardwrap">
    <div className="fd-qb-board" role="grid" aria-label="Board">
      <span className="fd-qb-corner" aria-hidden="true" />
      {QBANK_VALUES.map((value, slot) => <span key={`v${slot}`} className="fd-qb-val" style={{ "--s":slot + 2 }} aria-hidden="true">{value}</span>)}
      {board.map((column, col) => <React.Fragment key={column.category}>
        <span className="fd-qb-cat" style={{ "--c":col + 2 }}><OneSafe text={column.name} /></span>
        {column.cells.map(cell => {
          const on = selected?.col === col && selected?.slot === cell.slot;
          const flashing = flash?.col === col && flash?.slot === cell.slot;
          return <button type="button" key={`${cell.slot}:${flashing ? flash.n : 0}`} style={{ "--c":col + 2, "--s":cell.slot + 2 }}
            className={`fd-qb-cell${cell.qid ? "" : " is-empty"}${on ? " is-selected" : ""}${flashing ? " is-flash" : ""}`}
            aria-pressed={on} onClick={() => onSelect({ col, slot:cell.slot })}
            aria-label={`${column.name} ${cell.value}: ${cell.qid ? cell.label : "empty"}${cell.qid ? `, ${SPOKEN[cell.lamp]}` : ""}`
              + `${cell.warnings.length ? `, ${plural(cell.warnings.length, "warning")}` : ""}`}>
            {cell.qid ? <Lamp status={cell.lamp} /> : <Icon name="plus" size={18} />}
            {cell.qid && <span className="fd-qb-cell-label is-long"><OneSafe text={breakable(cell.label)} /></span>}
            {cell.qid && <span className="fd-qb-cell-label is-short" aria-hidden="true"><OneSafe text={breakable(cell.short)} /></span>}
            {cell.warnings.length > 0 && <b className="fd-qb-dot" aria-hidden="true" />}
          </button>;
        })}
      </React.Fragment>)}
    </div>
  </div>;
}

/* ── media ── */
/* a clip's play button and its run, at the record's exact window */
function ClipButton({ id, media, video, bar = true }) {
  const clip = useClip(id);
  const playing = clip.status === "playing" || clip.status === "loading";
  const button = <button type="button" className="fd-qb-play" aria-pressed={playing}
    onClick={event => { event.stopPropagation(); toggleClip(id, media, video?.current || null); }}
    aria-label={playing ? "Stop" : `Play ${windowLabel(media)}`}><Icon name={playing ? "stop" : "play"} size={20} /></button>;
  if (!bar) return button;
  return <div className="fd-qb-clip">
    {button}
    <span className="fd-qb-clip-track"><span className="fd-qb-clip-fill" style={{ transform:`scaleX(${clip.progress})` }} /></span>
    <span className="fd-qb-clip-time">{windowLabel(media)}</span>
    {clip.error && <span className="fd-qb-clip-error" role="status">{clip.error}</span>}
  </div>;
}

/* a row's small media: a picture's thumbnail, a clip's play button (a
   video plays in its own small frame) */
function RowMedia({ record }) {
  const video = useRef(null);
  const media = record.media;
  if (!media) return <span className="fd-qb-thumb is-text" aria-hidden="true"><Icon name="rules" size={18} /></span>;
  if (media.kind === "image") return <img className="fd-qb-thumb" src={media.src} alt="" loading="lazy" decoding="async" />;
  if (media.kind === "video") return <span className="fd-qb-thumb is-video">
    <video ref={video} src={`${media.src}#t=${Number(media.start) || 0}`} poster={media.poster} playsInline preload="metadata" aria-hidden="true" />
    <ClipButton id={`qb:${record.id}`} media={media} video={video} bar={false} />
  </span>;
  return <span className="fd-qb-thumb is-audio"><ClipButton id={`qb:${record.id}`} media={media} bar={false} /></span>;
}

/* an open row's media: the picture large with its reveal, a video large, a clip's run */
function Media({ record }) {
  const [reveal, setReveal] = useState(false);
  const video = useRef(null);
  const media = record.media;
  if (!media) return null;
  const image = reveal && record.revealMedia ? record.revealMedia : media.kind === "image" ? media : null;
  return <div className={`fd-qb-media is-${media.kind}`}>
    {media.kind === "video" && !reveal && <video ref={video} src={media.src} poster={media.poster} playsInline preload="metadata"
      className="fd-qb-video" aria-label="Clip" />}
    {image && <img src={image.src} alt="" loading="lazy" decoding="async" width={image.w || undefined} height={image.h || undefined} />}
    {media.kind !== "image" && !reveal && <ClipButton id={media.kind === "video" ? `qb-big:${record.id}` : `qb:${record.id}`} media={media} video={video} />}
    {record.revealMedia && <button type="button" className="fd-qb-revealswitch" aria-pressed={reveal}
      onClick={() => { stopClip(); setReveal(on => !on); }}>{reveal ? "Clue" : "Reveal"}</button>}
  </div>;
}

function Details({ record }) {
  const tags = record.tags || {};
  const verified = record.verified || {};
  return <dl className="fd-qb-details">
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
  </dl>;
}

/* ── a row ── */
/* `at` is the slot Use this fills; `here` marks the slot's own pick;
   `showCategory` names the category (Browse all) */
function Row({ record, at, here = false, open, onToggle, showCategory = false, pending, error, onUse, onClear, onMark, onEdit, onForce }) {
  const [more, setMore] = useState(false);
  const [sources, setSources] = useState(false);
  const right = answerOption(record);
  const used = usedElsewhere(record, here ? at : null);
  const busy = !!pending;
  const out = record.mark === "reject" || record.status === "rejected";
  /* the line that tells it apart: its subject, a media clue's answer (its
     prompt is the same for every record), else the question */
  const title = record.subject || (record.media && right ? right.text : record.prompt);
  const titleIsAnswer = !!right && title.toLowerCase() === right.text.toLowerCase();
  const meta = [
    showCategory && <span key="c">{categoryName(record.category)} {valueOfTier(record.tier)}</span>,
    record.status !== "ready" && <span key="s">{STATUS_NAMES[record.status]}</span>,
    used.length > 0 && <span key="u" className="is-used">Used at {used.join(", ")}</span>,
    record.mark && <span key="m" className={`is-mark is-${record.mark}`}>{MARK_NAMES[record.mark]}</span>,
    record.media && record.media.kind !== "image" && <span key="w">{windowLabel(record.media)}</span>,
  ].filter(Boolean);
  /* a text clue has no thumbnail; an open clip row plays in its large frame */
  const bare = !record.media || (open && record.media.kind !== "image");
  return <li className={`fd-qb-row${open ? " is-open" : ""}${out ? " is-out" : ""}${here ? " is-here" : ""}`}>
    <div className={`fd-qb-row-head${bare ? " is-bare" : ""}`}>
      {!bare && <RowMedia record={record} />}
      <button type="button" className="fd-qb-row-main" aria-expanded={open} onClick={() => { setMore(false); onToggle(); }}>
        <span className="fd-qb-row-title" data-fit="ellipsis">{titleIsAnswer && <Icon name="check" size={14} />}{title}</span>
        {titleIsAnswer ? <span className="fd-qb-row-sub" data-fit="ellipsis">{record.prompt}</span>
          : <span className="fd-qb-row-answer" data-fit="ellipsis"><Icon name="check" size={14} />{right?.text || "No answer marked"}</span>}
        {meta.length > 0 && <span className="fd-qb-row-meta">{meta}</span>}
      </button>
      <Lamp status={record.forced && here ? "ready" : record.status} />
    </div>
    {open && <div className="fd-qb-row-body">
      <Media key={record.id} record={record} />
      {record.subject && <p className="fd-qb-prompt">{record.prompt}</p>}
      <ol className="fd-qb-options">
        {(record.options || []).map((option, i) => <li key={option.id} className={option.id === record.answer ? "is-right" : ""}>
          <span className="fd-qb-letter" aria-hidden="true">{option.id === record.answer ? <Icon name="check" size={16} /> : LETTERS[i]}</span>
          <span className="fd-qb-option-text">{option.text}{option.id === record.answer && <span className="fd-sr"> (right answer)</span>}</span>
        </li>)}
      </ol>
      {record.reveal && <p className="fd-qb-reveal"><b>Reveal</b>{record.reveal}</p>}
      {record.notes && <p className="fd-qb-notes"><b>Notes</b>{record.notes}</p>}
      {(record.surprise || revealsAnswer(record) || record.edited) && <div className="fd-qb-badges">
        {record.surprise && <span className="is-caution">Wedding surprise</span>}
        {revealsAnswer(record) && <span className="is-caution">Asset gives it away</span>}
        {record.edited && <span>Edited</span>}
      </div>}
      <div className="fd-qb-actions">
        {here ? <ActionButton variant="secondary" disabled={busy} pending={pending === `assign:${record.id}`}
          onClick={() => onClear(at, record)}>Take off board</ActionButton>
          : <ActionButton disabled={busy || !at || record.personal === "needs-brandon"} pending={pending === `assign:${record.id}`}
            onClick={() => onUse(record, at)}>{showCategory && at ? `Put in ${QBANK_VALUES[at.slot]}` : "Use this"}</ActionButton>}
        <button type="button" className="fd-qb-more" aria-expanded={more} onClick={() => setMore(on => !on)}>More</button>
      </div>
      {/* on the board but not ready: his call to play it anyway (never a
          clue still waiting on his answer) */}
      {here && record.status !== "ready" && record.personal !== "needs-brandon" && <button type="button" className="fd-qb-force"
        aria-pressed={record.forced} disabled={busy} aria-busy={pending === `force:${record.id}` || undefined}
        onClick={() => onForce(record, !record.forced)}><Lamp status={record.forced ? "ready" : "confirm"} />Play anyway</button>}
      {more && <ul className="fd-qb-menu" aria-label="More">
        <li><button type="button" disabled={busy} onClick={() => onEdit(record)}><Icon name="pencil" size={18} />Edit</button></li>
        {[["fav", "Favorite", "star"], ["short", "Shortlist", "check"], ["reject", "Reject", "close"]].map(([id, name, icon]) =>
          <li key={id}><button type="button" className={`is-${id}`} aria-pressed={record.mark === id} disabled={busy}
            aria-busy={pending === `mark:${record.id}` || undefined} onClick={() => onMark(record, record.mark === id ? null : id)}>
            <Icon name={icon} size={18} />{name}</button></li>)}
        <li><button type="button" aria-expanded={sources} onClick={() => setSources(on => !on)}>
          <Icon name="rules" size={18} />Sources and audience</button></li>
        {sources && <li><Details record={record} /></li>}
      </ul>}
      {!right && <p className="fd-qb-error" role="alert">No right answer is marked. Edit it.</p>}
      {error && <p className="fd-qb-error" role="alert">{error}</p>}
    </div>}
  </li>;
}

/* ── a slot's sheet ── */
function SlotPanel({ at, plan, records, open, setOpen, rowProps, onStep, heading = false }) {
  const { current, groups } = slotRows(records, plan, at);
  const { prev, next } = slotStep(at);
  const column = planColumns(plan)[at.col];
  const row = (record, here = false) => <Row key={record.id} record={record} at={at} here={here} open={open === record.id}
    onToggle={() => { stopClip(); setOpen(id => id === record.id ? null : record.id); }} {...rowProps(record)} />;
  return <div className="fd-qb-slot">
    {heading && <h3 className="fd-qb-slot-title">{column.name} · {QBANK_VALUES[at.slot]}</h3>}
    <nav className="fd-qb-walk" aria-label="Slots">
      <button type="button" disabled={!prev} onClick={() => onStep(prev)}><Icon name="back" size={18} />{prev ? slotName(plan, prev, at) : "Previous"}</button>
      <button type="button" disabled={!next} onClick={() => onStep(next)}>{next ? slotName(plan, next, at) : "Next"}<Icon name="next" size={18} /></button>
    </nav>
    {current ? <ul className="fd-qb-rows is-current" aria-label="In this slot">{row(current, true)}</ul>
      : <p className="fd-qb-emptyslot">Empty</p>}
    {groups.map(group => <section key={group.tier} className="fd-qb-group" aria-label={String(group.value)}>
      <h4 className="fd-qb-group-head">{group.value}</h4>
      <ul className="fd-qb-rows">{group.records.map(record => row(record))}</ul>
    </section>)}
  </div>;
}

/* ── Browse all ── */
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

function BrowsePanel({ records, plan, filters, setFilters, open, setOpen, rowProps }) {
  const [pages, setPages] = useState(1);
  const query = useDeferredValue(filters.query);
  useEffect(() => { setPages(1); }, [filters]);
  const list = bankView(records, { ...filters, query }).flatMap(group => group.records);
  const shown = list.slice(0, pages * PAGE_SIZE);
  const counts = statusCounts(records);
  return <div className="fd-qb-browse">
    <Filters filters={filters} count={list.length} onChange={patch => setFilters(f => ({ ...f, ...patch }))} />
    {!filters.query && filters.status === "all" && <p className="fd-qb-statusline">
      {QBANK_STATUSES.filter(status => counts[status]).map(status => <span key={status}><Lamp status={status} />{counts[status]} {STATUS_COUNTED[status]}</span>)}
    </p>}
    {!list.length && <p className="fd-qb-hint">Nothing matches</p>}
    <ul className="fd-qb-rows">
      {shown.map(record => <Row key={record.id} record={record} at={slotTarget(plan, record)} showCategory open={open === record.id}
        onToggle={() => { stopClip(); setOpen(id => id === record.id ? null : record.id); }} {...rowProps(record)} />)}
    </ul>
    {list.length > shown.length && <ActionButton variant="secondary" onClick={() => setPages(n => n + 1)}>
      {`Show ${Math.min(PAGE_SIZE, list.length - shown.length)} more`}</ActionButton>}
  </div>;
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

/* ── the desk ── */
/* `initial` opens a slot, Browse all or the editor straight away (the
   rehearsal page); `preloaded` is the bank's answer already in hand (a
   test); `wide` forces the laptop's columns (a test) */
export function QBankDesk({ state, onAct, notify, loadQBank = triviaQBank, initial = null, preloaded = null, wide:forceWide = null }) {
  const { bank, error:loadError, retry } = useQBank(loadQBank, preloaded);
  const reduced = useReducedMotion();
  const media = useWide();
  const wide = forceWide ?? media;
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
  /* a clue rated at another value is his call: never a warning */
  const lines = warningLines(warnings.filter(warning => warning.kind !== "tier"));
  const problems = warningCount(lines);

  const [selected, setSelected] = useState(initial?.slot || null);
  const [browsing, setBrowsing] = useState(!!initial?.browse);
  const [filters, setFilters] = useState(() => ({ ...NO_FILTERS, ...(initial?.filters || {}) }));
  const [open, setOpen] = useState(initial?.open || null);
  const [editing, setEditing] = useState(initial?.edit || null);
  const [pending, setPending] = useState(null);
  const [errors, setErrors] = useState({});
  const [confirm, setConfirm] = useState(null);
  const [showWarnings, setShowWarnings] = useState(!!initial?.warnings);
  const [imported, setImported] = useState(null);
  const [flash, setFlash] = useState(null);
  const pendingRef = useRef(null);
  const panel = useRef(null);
  const fileInput = useRef(null);
  useEffect(() => () => stopClip(), []);
  useEffect(() => {
    if (!flash) return undefined;
    const timer = setTimeout(() => setFlash(null), FLASH_MS);
    return () => clearTimeout(timer);
  }, [flash]);

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

  /* the slot shows it landed: the sheet goes, the slot flashes */
  const landed = at => {
    stopClip();
    setOpen(null);
    setSelected(null);
    setBrowsing(false);
    setFlash(f => ({ ...at, n:(f?.n || 0) + 1 }));
  };
  const use = (record, at) => at && write(`assign:${record.id}`, record.id, "qbankAssign", { col:at.col, slot:at.slot, qid:record.id })
    .then(result => { if (result?.ok) landed(at); });
  const clear = (at, record) => write(`assign:${record.id}`, record.id, "qbankAssign", { col:at.col, slot:at.slot, qid:null })
    .then(result => { if (result?.ok) setOpen(null); });
  const force = (record, on) => record.placed[0] && write(`force:${record.id}`, record.id, "qbankAssign",
    { col:record.placed[0].col, slot:record.placed[0].slot, qid:record.id, force:on });
  const markRecord = (record, mark) => write(`mark:${record.id}`, record.id, "qbankMark", { qid:record.id, mark });
  const saveEdit = (record, patch) => write(`edit:${record.id}`, "editor", "qbankEdit", { qid:record.id, patch });
  const revert = record => write(`revert:${record.id}`, "editor", "qbankEdit", { qid:record.id, patch:null });
  const rowProps = record => ({ pending, error:errors[record.id] || "", onUse:use, onClear:clear, onMark:markRecord, onForce:force,
    onEdit:item => { stopClip(); setEditing(item.id); } });

  const openSlot = at => {
    stopClip();
    setOpen(null);
    setBrowsing(false);
    setSelected(at);
    /* a step inside the sheet starts at its top */
    requestAnimationFrame(() => {
      const scroller = panel.current?.closest(".si-sheet");
      if (scroller && panel.current?.closest(".fd-qb-slotsheet")) scroller.scrollTo({ top:0, behavior:reduced ? "auto" : "smooth" });
      else if (wide) panel.current?.scrollIntoView?.({ block:"nearest", behavior:reduced ? "auto" : "smooth" });
    });
  };
  const closeSlot = () => { stopClip(); setOpen(null); setSelected(null); };

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

  const editRecord = editing ? byId.get(editing) : null;
  const column = selected ? planColumns(plan)[selected.col] : null;
  const slotTitle = selected ? `${column.name} · ${QBANK_VALUES[selected.slot]}` : "";
  const slot = selected && <div ref={panel}><SlotPanel at={selected} plan={plan} records={records} open={open} setOpen={setOpen}
    rowProps={rowProps} onStep={openSlot} heading={wide} /></div>;
  const browse = <div ref={selected ? null : panel}><BrowsePanel records={records} plan={plan} filters={filters} setFilters={setFilters}
    open={open} setOpen={setOpen} rowProps={rowProps} /></div>;

  return <div className="fd-qb">
    <section className="fd-qb-side" aria-label="Board">
      <div className="fd-qb-summary">
        <span className="fd-qb-reel" aria-label={`${summary.ready} of ${summary.total} ready`}><b>{summary.ready}</b>/{summary.total}</span>
        <span className="fd-qb-sumtext">{["ready", summary.total - summary.filled > 0 && `${summary.total - summary.filled} empty`,
          summary.filled - summary.ready > 0 && `${summary.filled - summary.ready} not ready`].filter(Boolean).join(" · ")}</span>
        {problems > 0 && <button type="button" className="fd-qb-warnbtn is-on" aria-expanded={showWarnings}
          onClick={() => setShowWarnings(on => !on)}><b className="fd-qb-dot" aria-hidden="true" />{plural(problems, "warning")}</button>}
      </div>
      {showWarnings && problems > 0 && <ul className="fd-qb-warnings" aria-label="Warnings">
        {lines.map((line, i) => <li key={i}><button type="button" onClick={() => line.slots[0] && openSlot(line.slots[0])}>
          <b className="fd-qb-dot" aria-hidden="true" /><span>{line.text}</span>
          <small>{line.slots.slice(0, 4).map(at => slotName(plan, at)).join(", ")}{line.slots.length > 4 ? ` +${line.slots.length - 4}` : ""}</small>
        </button></li>)}
      </ul>}
      <Board board={board} selected={selected} flash={flash} onSelect={openSlot} />
      {!wide && <ActionButton variant="secondary" onClick={() => { stopClip(); setOpen(null); setBrowsing(true); }}>
        <span className="fd-qb-browsebtn"><Icon name="search" size={18} />Browse all</span></ActionButton>}
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

    {wide && <section className="fd-qb-bank" aria-label={selected ? slotTitle : "Browse all"}>
      {selected && <button type="button" className="fd-qb-link fd-qb-backlink" onClick={closeSlot}>
        <Icon name="search" size={16} />Browse all</button>}
      {selected ? slot : browse}
    </section>}
    {!wide && selected && <Sheet title={slotTitle} className="fd-qb-slotsheet" layer={120} onClose={closeSlot}>{slot}</Sheet>}
    {!wide && browsing && !selected && <Sheet title="Browse all" className="fd-qb-slotsheet" layer={120}
      onClose={() => { stopClip(); setOpen(null); setBrowsing(false); }}>{browse}</Sheet>}
    {editRecord && <Editor record={editRecord} prior={edits[editRecord.id] || null} pending={pending} onSave={saveEdit} onRevert={revert}
      onClose={() => { stopClip(); setErrors(all => ({ ...all, editor:"" })); setEditing(null); }} />}
  </div>;
}
