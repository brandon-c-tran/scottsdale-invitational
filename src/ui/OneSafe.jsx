import React from "react";
import "./backglass.css";

/* Big Shoulders Display draws "1" as a bare stroke with only a nub of a
   flag (its font has no alternate), so uppercased beside letters it reads as
   I or |: "SEMIFINAL 1", "T1", "1V1". OneSafe wraps each lone 1 (not part
   of a longer number like 1,200) so it keeps the family's own 1 and gains a
   drawn flag (backglass.css .fd-one). EventName also keeps an event name
   with a digit out of uppercase, so "1v1 Basketball" reads as written. */
const LONE_ONE = /(?<![\d,.])1(?![\d,.])/;

/* `all` sets every 1, for a label that is only a number beside a name
   ("11 Henry" reads "ll Henry" otherwise) */
export function oneSafeParts(text, { all = false } = {}) {
  const value = String(text ?? "");
  if (all) return value.includes("1") ? value.split(/(1)/).filter(part => part !== "") : [value];
  /* a bare "1" (a rank alone) reads as a numeral; only a label with letters swaps it */
  if (!LONE_ONE.test(value) || !/[A-Za-z]/.test(value)) return [value];
  return value.split(/((?<![\d,.])1(?![\d,.]))/).filter(part => part !== "");
}

export function OneSafe({ text, all = false }) {
  const parts = oneSafeParts(text, { all });
  if (parts.length === 1 && !(all && parts[0] === "1")) return parts[0];
  return <>{parts.map((part, i) => part === "1" ? <span className="fd-one" key={i}>1</span> : part)}</>;
}

export function EventName({ name }) {
  const value = String(name ?? "");
  if (!/\d/.test(value)) return value;
  return <span className="fd-keep-case"><OneSafe text={value} /></span>;
}
