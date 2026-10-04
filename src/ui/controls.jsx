import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { BONE, DISPLAY, SANS } from "./theme.js";
import { useSheetPresence } from "./sheetMotion.js";
import { Icon } from "./Icon.jsx";
import { EventName, OneSafe } from "./OneSafe.jsx";
import { MenuRow, MenuGroup } from "./Menu.jsx";

function Tag({ children, tone="dim", style }) {
  const tones = {
    dim:   { color:"var(--muted)", background:"var(--ink-tint)" },
    gold:  { color:"var(--accent2)", background:"var(--accent-tint)" },
    flame: { color:"var(--live2)", background:"rgba(192,71,58,0.14)" },
    green: { color:"var(--green)", background:"var(--green-tint)" },
  };
  return <span style={{ fontFamily:DISPLAY, fontWeight:700, fontSize:13, letterSpacing:"0.05em",
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
  destructive: { background:"var(--paper)", color:"var(--clay-text)", border:"1px solid var(--line)" },
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
      fontSize: compact ? 13 : 15, padding: compact ? "8px 12px" : "12px 16px",
      borderRadius:8, minHeight: compact ? 44 : 48, boxShadow:"var(--glass-edge)",
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
      background: selected ? "var(--info-tint)" : "transparent",
      border:"1px solid " + (selected ? "var(--lamp-info)" : "var(--line)"),
      color: selected ? "var(--lamp-info)" : "var(--ink)",
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
/* Menus (MenuRow, MenuGroup) live in Menu.jsx, the one menu system. */

/* Something the app keeps reachable in every sheet header (the
   commissioner's walkout Stop). Nothing is docked by default. */
const SheetDock = createContext(null);

let openSheets = 0;
let pageOverflow = "";
/* `show`: the title names an event or a person, so it is lettered in the
   backglass face rather than set as a label. */
/* `heading={false}`: the body letters its own hero (an announcement), so the
   header carries only its controls; the title still names the dialog */
function Sheet({ title, subtitle, headerActions, onClose, onBack, children, wide, busy = false, className = "", layer = 100, show = false,
  heading = true }) {
  const dialog = useRef(null);
  const overlay = useRef(null);
  useSheetPresence(overlay, dialog);
  const dock = useContext(SheetDock);
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
    <div ref={overlay} className="fd-sheet-overlay" onClick={busy ? undefined : onClose} style={{zIndex:layer}}>
      <div ref={dialog} tabIndex={-1} onClick={e=>e.stopPropagation()} className={`si-sheet${wide ? " is-wide" : ""} ${className}`} role="dialog" aria-modal="true"
        aria-label={title} aria-busy={busy || undefined}>
        {/* Shared sheet header stays in the surrounding surface palette. */}
        <div className="fd-sheet-header">
          {onBack && <IconButton label="Back" onClick={onBack} size={44} disabled={busy}
            style={{ marginLeft:-6, border:0 }}><span style={{ display:"flex", transform:"scaleX(-1)" }}><Icon name="next" size={20} /></span></IconButton>}
          {heading ? <div className={`fd-sheet-heading${show ? " is-show" : ""}`}><div>{typeof title === "string" ? <EventName name={title} /> : title}</div>
            {subtitle && <small>{typeof subtitle === "string" ? <OneSafe text={subtitle} /> : subtitle}</small>}</div>
            : <div className="fd-sheet-heading is-bare" aria-hidden="true" />}
          {headerActions && <div className="fd-sheet-header-actions">{headerActions}</div>}
          {dock && <div className="fd-sheet-dock">{dock}</div>}
          <IconButton label="Close" onClick={onClose} size={44} disabled={busy} style={{ border:0 }}><Icon name="close" size={20} /></IconButton>
        </div>
        <div className="fd-sheet-body">
          {children}
        </div>
      </div>
    </div>
  );
}

export { Tag, ActionButton, IconButton, Btn, MenuRow, MenuGroup, Sheet, SheetDock };
