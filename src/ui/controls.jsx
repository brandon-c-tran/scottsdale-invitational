import React, { useState, useEffect, useRef } from "react";
import { BONE, DISPLAY, SANS, label } from "./theme.js";

function Tag({ children, tone="dim", style }) {
  const tones = {
    dim:   { color:"var(--muted)", background:"var(--ink-tint)" },
    gold:  { color:"var(--accent2)", background:"var(--accent-tint)" },
    flame: { color:"var(--live2)", background:"rgba(192,71,58,0.14)" },
    green: { color:"var(--green)", background:"var(--green-tint)" },
  };
  return <span style={{ fontFamily:SANS, fontWeight:700, fontSize:11, letterSpacing:"0.05em",
    padding:"3px 8px", borderRadius:6, textTransform:"uppercase", ...tones[tone], ...style }}>{children}</span>;
}
/* Variant is hierarchy, not appearance: primary is the one next thing,
   secondary is a real alternative, tertiary is quiet, destructive is the
   outlined entry into a flow that loses something, commit is the filled
   confirm step inside that flow. A destructive style never doubles as a
   routine secondary. An async onClick gets one pending state and further
   taps are ignored until it settles, so callers do not wire their own
   duplicate-tap guards. */
/* The whole system is two fills and one quiet shape. Sun fill is the one
   next thing, clay fill is the confirm step of a destructive flow, and every
   other action shares the same paper-and-line shape where only the ink
   changes: ink for a real alternative, muted for a quiet out, clay for the
   entry to a destructive flow. No competing stroke weights. */
const ACTION_VARIANTS = {
  primary:     { background:"var(--action-fill)", color:"var(--action-ink)", border:"1px solid var(--action-fill)" },
  secondary:   { background:"var(--paper)", color:"var(--ink)", border:"1px solid var(--line)" },
  tertiary:    { background:"var(--paper)", color:"var(--muted2)", border:"1px solid var(--line)" },
  destructive: { background:"var(--paper)", color:"var(--clay)", border:"1px solid var(--line)" },
  commit:      { background:"var(--clay)", color:BONE, border:"1.5px solid var(--ink0)" },
};
function ActionButton({ children, onClick, variant="primary", pending, disabled, compact, style, ...props }) {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const waiting = !!pending || busy;
  const off = disabled || waiting;
  const handle = event => {
    if (off || busyRef.current || !onClick) return;
    busyRef.current = true;
    const finish = () => { busyRef.current = false; setBusy(false); };
    try {
      const result = onClick(event);
      if (result && typeof result.then === "function") {
        setBusy(true);
        return Promise.resolve(result).then(value => { finish(); return value; }, finish);
      }
      busyRef.current = false;
      return result;
    } catch (error) { busyRef.current = false; throw error; }
  };
  return (
    <button onClick={handle} disabled={off} aria-busy={waiting || undefined} {...props}
      style={{ fontFamily:SANS, fontWeight:600, letterSpacing:"0",
      fontSize: compact ? 12 : 13, padding: compact ? "8px 11px" : "12px 16px",
      borderRadius:6, minHeight: compact ? 44 : 48,
      cursor: off ? "default" : "pointer", opacity: disabled ? 0.35 : waiting ? 0.6 : 1,
      transition:"transform .1s, opacity .15s", ...ACTION_VARIANTS[variant], ...style }}>{children}</button>
  );
}
/* Icon actions are commands too; the label is required so none ships unnamed. */
function IconButton({ label, onClick, size=38, selected, disabled, style, children, ...props }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-label={label} title={label} {...props}
      style={{ width:size, height:size, borderRadius:5, flexShrink:0,
      cursor: disabled ? "default" : "pointer",
      background: selected ? "var(--sun)" : "transparent",
      border:"1px solid " + (selected ? "var(--sun)" : "var(--line)"),
      color: selected ? "var(--ink0)" : "var(--ink)",
      display:"flex", alignItems:"center", justifyContent:"center",
      opacity: disabled ? 0.35 : 1, ...style }}>{children}</button>
  );
}
/* Legacy alias: kind names described appearance; they now resolve to the
   semantic variants so every existing call site shares one behavior. New
   surfaces use ActionButton directly. */
const BTN_KIND_VARIANT = { primary:"primary", dark:"secondary", ghost:"tertiary", danger:"destructive", flame:"commit" };
function Btn({ kind="primary", ...props }) {
  return <ActionButton variant={BTN_KIND_VARIANT[kind]} {...props} />;
}
/* A menu is not a button rack. Hierarchy in a menu comes from grouping and
   order, so every row shares one quiet shape, the note carries the live fact,
   and only a destructive row changes ink. */
function MenuRow({ name, note, tone, onClick, disabled, last }) {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const handle = () => {
    if (busy || disabled || busyRef.current || !onClick) return;
    busyRef.current = true;
    const finish = () => { busyRef.current = false; setBusy(false); };
    try {
      const result = onClick();
      if (result && typeof result.then === "function") {
        setBusy(true);
        return Promise.resolve(result).then(value => { finish(); return value; }, finish);
      }
      busyRef.current = false;
      return result;
    } catch (error) { busyRef.current = false; throw error; }
  };
  return (
    <button onClick={handle} disabled={disabled || busy} aria-busy={busy || undefined}
      style={{ display:"flex", alignItems:"center", gap:10, width:"100%", textAlign:"left",
      minHeight:48, padding:"12px 14px", background:"transparent", border:"none",
      borderBottom: last ? "none" : "1px solid var(--line)",
      cursor: disabled || busy ? "default" : "pointer",
      opacity: disabled ? 0.35 : busy ? 0.6 : 1 }}>
      <span style={{ flex:1, minWidth:0 }}>
        <span style={{ display:"block", fontFamily:SANS, fontWeight:700, fontSize:13.5,
          letterSpacing:"0.04em", textTransform:"uppercase",
          color: tone === "destructive" ? "var(--clay)" : "var(--ink)" }}>{name}</span>
        {note && <span style={{ display:"block", fontFamily:SANS, fontSize:12, color:"var(--muted)",
          marginTop:3, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{note}</span>}
      </span>
      <span aria-hidden="true" style={{ fontFamily:SANS, fontWeight:700, fontSize:15,
        color:"var(--muted)" }}>›</span>
    </button>
  );
}
function MenuGroup({ title, children }) {
  const rows = React.Children.toArray(children).filter(Boolean);
  if (!rows.length) return null;
  return (
    <div style={{ marginBottom:16 }}>
      <div style={{ ...label, marginBottom:7 }}>{title}</div>
      <div style={{ border:"1px solid var(--line)", borderRadius:14, background:"var(--paper2)",
        overflow:"hidden" }}>
        {rows.map((row, i) => React.cloneElement(row, { last: i === rows.length - 1 }))}
      </div>
    </div>
  );
}

let openSheets = 0;
let pageOverflow = "";
function Sheet({ title, subtitle, headerActions, onClose, onBack, children, wide, busy = false, className = "", layer = 100 }) {
  const dialog = useRef(null);
  const current = useRef({ busy, onClose });
  current.current = { busy, onClose };
  useEffect(() => {
    const previousFocus = document.activeElement;
    if (!openSheets++) { pageOverflow = document.body.style.overflow; document.body.style.overflow = "hidden"; }
    const node = dialog.current;
    node?.focus({ preventScroll:true });
    const keys = event => {
      const sheets = document.querySelectorAll('[aria-modal="true"]');
      if (sheets[sheets.length - 1] !== node) return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (!current.current.busy) current.current.onClose?.();
      }
      if (event.key !== "Tab") return;
      const focusable = [...node.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]')]
        .filter(element => element.getClientRects().length && !element.closest('[inert]'));
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (!first) { event.preventDefault(); node.focus(); }
      else if (!focusable.includes(document.activeElement)) {
        event.preventDefault(); (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener("keydown", keys);
    return () => {
      document.removeEventListener("keydown", keys);
      if (!--openSheets) document.body.style.overflow = pageOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll:true });
    };
  }, []);
  return (
    <div className="fd-sheet-overlay" onClick={busy ? undefined : onClose} style={{zIndex:layer}}>
      <div ref={dialog} tabIndex={-1} onClick={e=>e.stopPropagation()} className={`si-sheet${wide ? " is-wide" : ""} ${className}`} role="dialog" aria-modal="true"
        aria-label={title} aria-busy={busy || undefined}>
        {/* Shared sheet header stays in the surrounding surface palette. */}
        <div className="fd-sheet-header">
          {onBack && <IconButton label="Back" onClick={onBack} size={44} disabled={busy}
            style={{ fontSize:18, marginLeft:-6 }}>‹</IconButton>}
          <div className="fd-sheet-heading"><div>{title}</div>{subtitle && <small>{subtitle}</small>}</div>
          {headerActions && <div className="fd-sheet-header-actions">{headerActions}</div>}
          <IconButton label="Close" onClick={onClose} size={44} disabled={busy} style={{ fontSize:14 }}>✕</IconButton>
        </div>
        <div className="fd-sheet-body">
          {children}
        </div>
      </div>
    </div>
  );
}

export { Tag, ActionButton, IconButton, Btn, MenuRow, MenuGroup, Sheet };
