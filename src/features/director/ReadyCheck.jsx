/* Ready check: the commissioner's one sheet of what the weekend still needs
   (readyCheck.js). Three short sections under the menu's heads, each row a
   lamp insert (lit cyan ready, amber part done, unlit not started, struck
   when switched off), its label, its count, and the chevron where a desk
   fixes it. A guest row part done shows who it waits on as faces. Reads
   the commissioner's frame only; nothing here writes. */
import React, { useEffect, useState } from "react";
import { disp } from "../../../shared/core.js";
import { Sheet } from "../../ui/controls.jsx";
import { MenuGroup } from "../../ui/Menu.jsx";
import { Icon } from "../../ui/Icon.jsx";
import { Avatar } from "../identity/PlayerIdentity.jsx";
import { TV_STALE_MS } from "./tvHealth.js";
import { readyCheck } from "./readyCheck.js";
import "./ready-check.css";

/* the lamp's state, for a screen reader (an off row says it in its value) */
const SPOKEN = { ready:"ready", partial:"part done", missing:"not started" };

/* a TV that stops speaking drops out on its own */
function useNow(active) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), Math.round(TV_STALE_MS / 4));
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

function Count({ row }) {
  if (Number.isFinite(row.of)) return <span className="fd-ready-count"><b>{row.have}</b><span>/{row.of}</span></span>;
  if (Number.isFinite(row.have)) return <span className="fd-ready-count"><b>{row.have}</b></span>;
  if (row.value) return <span className="fd-ready-value">{row.value}</span>;
  return null;
}

function ReadyRow({ row, state, onOpen, last }) {
  const faces = row.state === "partial" ? row.missing : [];
  const open = row.opens && onOpen ? () => onOpen(row.opens) : null;
  const className = `fd-ready-row is-${row.state}${last ? " is-last" : ""}`;
  const body = <>
    <span className={`fd-insert${row.state === "off" ? " is-void" : ""}`} aria-hidden="true" />
    <span className="fd-ready-label">{row.label}{SPOKEN[row.state] && <span className="fd-sr">, {SPOKEN[row.state]}</span>}</span>
    <Count row={row} />
    <span className="fd-ready-chevron" aria-hidden="true">{open && <Icon name="next" size={18} />}</span>
    {faces.length > 0 && <span className="fd-ready-faces" role="img" aria-label={faces.map(player => disp(state, player)).join(", ")}>
      {faces.map(player => <Avatar key={player} state={state} p={player} size={24} />)}</span>}
  </>;
  return open ? <button type="button" className={className} onClick={open}>{body}</button>
    : <div className={className}>{body}</div>;
}

export function ReadyCheck({ state, capabilities = {}, tvs = null, tvsAt = 0, speaker = null, onOpen, onClose, onBack }) {
  const now = useNow(Array.isArray(tvs));
  const sections = readyCheck(state, { capabilities, tvs, receivedAt:tvsAt, speaker, now });
  return (
    <Sheet title="Ready check" onClose={onClose} onBack={onBack} className="fd-ready-sheet">
      {sections.map(section => (
        <MenuGroup key={section.id} title={section.title} icon={section.icon}>
          {section.rows.map(row => <ReadyRow key={row.id} row={row} state={state} onOpen={onOpen} />)}
        </MenuGroup>
      ))}
    </Sheet>
  );
}
