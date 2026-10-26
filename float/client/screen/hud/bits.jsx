/* The HUD's small pieces: a rider's chip, the state icons, the flagged 1. */
import React from "react";
import { usePortrait, inkOn, initials } from "./identity.js";

export function Chip({ entrant, size = 44, out = false, className = "" }) {
  const url = usePortrait(entrant, 160);
  const color = entrant?.color || "#9aa39e";
  return <span className={`fs-chip${out ? " is-out" : ""} ${className}`} style={{ "--size":`calc(var(--u) * ${size})`, "--c":color, "--ink":inkOn(color) }}>
    {url ? <img src={url} alt="" draggable={false} /> : <span>{initials(entrant?.name)}</span>}
  </span>;
}

/* Big Shoulders' bare 1 gets its flag (DESIGN.md), only beside letters */
const LONE_ONE = /(?<![\d,.])1(?![\d,.])/;
export function OneSafe({ children }) {
  const text = String(children ?? "");
  if (!/[A-Za-z]/.test(text) || !LONE_ONE.test(text)) return text;
  const parts = text.split(/((?<![\d,.])1(?![\d,.]))/).filter(part => part !== "");
  return parts.map((part, k) => part === "1" ? <span key={k} className="fs-one">1</span> : <React.Fragment key={k}>{part}</React.Fragment>);
}

/* a place as words, every 1 flagged ("1st", "11th" never read as I or ll) */
export const ordinalText = n => {
  const k = n % 100;
  const suffix = k >= 11 && k <= 13 ? "th" : ({ 1:"st", 2:"nd", 3:"rd" })[n % 10] || "th";
  return `${n}${suffix}`;
};
export function Ordinal({ n }) {
  const text = ordinalText(n);
  return text.split(/(1)/).filter(Boolean).map((part, k) => part === "1" ? <span key={k} className="fs-one">1</span> : <React.Fragment key={k}>{part}</React.Fragment>);
}
export const ordinalHtml = n => ordinalText(n).replace(/1/g, '<span class="fs-one">1</span>');
/* a bare number with every 1 flagged, for numbers beside names ("11 Henry") */
export function Num({ n }) {
  const text = String(n);
  if (!text.includes("1") || text === "1") return text;
  return text.split(/(1)/).filter(Boolean).map((part, k) => part === "1" ? <span key={k} className="fs-one">1</span> : <React.Fragment key={k}>{part}</React.Fragment>);
}

/* a phone that went quiet: the room's bot paddles for it until it speaks again */
export function BotMark() {
  return <span className="fs-bot" aria-label="Bot">
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M11 2h2v3h4a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3h4V2Zm-2 8.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm6 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM2 10h1v5H2v-5Zm19 0h1v5h-1v-5Z" />
    </svg>
  </span>;
}

export function DrinkIcon(props) {
  return <svg className="fs-icon" viewBox="0 0 24 24" aria-hidden="true" {...props}>
    <path fill="currentColor" d="M7 3h10l-1 3v13a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V6L7 3Zm2.4 6v8.5h5.2V9H9.4Z" />
  </svg>;
}
export function SwimIcon(props) {
  return <svg className="fs-icon" viewBox="0 0 24 24" aria-hidden="true" {...props}>
    <path fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" d="M2 15c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2M2 20c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2" />
    <circle cx="15" cy="7" r="2.6" fill="currentColor" />
  </svg>;
}
export function DoneIcon(props) {
  return <svg className="fs-icon" viewBox="0 0 24 24" aria-hidden="true" {...props}>
    <path fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.5 4.5 4.5 10.5-11" />
  </svg>;
}
export function FlagIcon(props) {
  return <svg className="fs-icon" viewBox="0 0 24 24" aria-hidden="true" {...props}>
    <path fill="currentColor" d="M5 2h2v20H5zM8 3h11l-3 4.5 3 4.5H8z" />
  </svg>;
}
export function PhoneIcon(props) {
  return <svg viewBox="0 0 48 48" aria-hidden="true" {...props}>
    <rect x="13" y="3" width="22" height="42" rx="5" fill="none" stroke="currentColor" strokeWidth="3.2" />
    <rect x="20" y="38" width="8" height="2.6" rx="1.3" fill="currentColor" />
    <path d="M19 15h10M19 21h10M19 27h6" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
  </svg>;
}
export function SoundIcon(props) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
    <path fill="currentColor" d="M4 9h4l5-4v14l-5-4H4z" />
    <path fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
  </svg>;
}
