import React, { useRef, useState } from "react";
import { Icon } from "./Icon.jsx";
import "./menu.css";

/* The one menu system: the guest's More menu, the commissioner's menu and
   the QA console's groups all draw sections and rows from here.

   A section is a head (its icon and a short label) over one glass list. A
   row is a 52px target: an optional glyph, the name, an optional value (a
   state, never a sentence), and the chevron when it drills into a sheet.
   Rows guard their own pending write: a second tap before the first
   settles does nothing, and the guard releases on success, refusal or a
   thrown error. */

const iconOf = icon => typeof icon === "string" ? <Icon name={icon} size={18} /> : icon;

export function MenuRow({ name, note, value = note, icon, tone, onClick, disabled, chevron = true, pressed, last }) {
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
    <button type="button" onClick={handle} disabled={disabled || busy} aria-busy={busy || undefined}
      aria-pressed={pressed === undefined ? undefined : pressed}
      className={`fd-menu-row${tone === "destructive" ? " is-destructive" : ""}${last ? " is-last" : ""}`}>
      {icon && <span className="fd-menu-glyph" aria-hidden="true">{iconOf(icon)}</span>}
      <span className="fd-menu-name">{name}</span>
      {value !== undefined && value !== null && value !== "" && <span className="fd-menu-value">{value}</span>}
      {pressed !== undefined
        ? <span className={`fd-menu-switch${pressed ? " is-on" : ""}`} aria-hidden="true" />
        : chevron && <span className="fd-menu-chevron" aria-hidden="true"><Icon name="next" size={18} /></span>}
    </button>
  );
}

/* `icon`: an Icon name or a node (your own chip for You) */
export function MenuGroup({ title, icon, tone, children }) {
  const rows = React.Children.toArray(children).filter(Boolean);
  if (!rows.length) return null;
  return (
    <section className={`fd-menu-section${tone ? ` is-${tone}` : ""}`} aria-label={title || undefined}>
      {title && <h3 className="fd-menu-head">{icon && <span className="fd-menu-head-glyph" aria-hidden="true">{iconOf(icon)}</span>}
        <span>{title}</span></h3>}
      <div className="fd-menu-list">
        {rows.map((row, i) => React.cloneElement(row, { last: i === rows.length - 1 }))}
      </div>
    </section>
  );
}
export { MenuGroup as MenuSection };

/* A menu drawn from a model (features/director/menuModel.js): sections of
   items, each item's `id` handed to onItem. */
export function MenuSections({ sections, onItem, glyphs = {} }) {
  return sections.map(section => (
    <MenuGroup key={section.id} title={section.title} icon={glyphs[section.id] || section.icon} tone={section.tone}>
      {section.items.map(item => <MenuRow key={item.id} name={item.name} value={item.value} icon={item.icon}
        tone={item.tone} chevron={item.chevron !== false} pressed={item.pressed} disabled={item.disabled}
        onClick={() => onItem(item.id, item)} />)}
    </MenuGroup>
  ));
}
