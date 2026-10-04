import { createContext, createElement, useContext } from "react";
import { resolvePlayerIdentity } from "./playerIdentity.js";
import { ROSTER } from "../../../shared/core.js";

const PlayerIdentityContext = createContext(undefined);

/* Each application or preview supplies its own current server profiles.
   No render can overwrite the identity used by another tree. */
export function PlayerIdentityProvider({ profiles, children }) {
  return createElement(PlayerIdentityContext.Provider, { value:profiles ?? null }, children);
}

/* a player's initials, from the saved display name: what stands in for a
   face without a photo (never another player's number). Two letters, unique
   across the roster and never a lookalike of someone else's at chip size:
   the first two letters, else the first and last, else the first and the
   next letter that sets them apart (Evan EV, Eyob EB; Chinh CH, Chiang CG).
   Computed once per profiles object, in roster order, so every screen agrees. */
const LOOKALIKE = { Y:"V", D:"O", Q:"O" };
const shapeOf = pair => pair.replace(/[YDQ]/g, ch => LOOKALIKE[ch]);
const nameOf = (profiles, player) => String(profiles?.[player]?.display || player || "").trim().toUpperCase();
const lettersOf = name => name.replace(/[^A-Z0-9]/g, "");
const tables = new WeakMap();
export function initialsTable(profiles) {
  const key = profiles && typeof profiles === "object" ? profiles : null;
  if (key && tables.has(key)) return tables.get(key);
  const players = [...new Set([...ROSTER, ...Object.keys(key || {})])];
  const taken = new Set(), table = {};
  for (const player of players) {
    const name = nameOf(key, player), letters = lettersOf(name);
    if (!letters) { table[player] = ""; continue; }
    const first = letters[0];
    /* a name of two words letters as its initials ("j vo" is JV) */
    const words = name.split(/\s+/).map(lettersOf).filter(Boolean);
    const options = [...(words.length > 1 ? [words[0][0] + words[1][0]] : []), letters.slice(0, 2),
      first + letters[letters.length - 1], ...[...letters.slice(2)].map(ch => first + ch)];
    const pick = options.find(pair => pair.length === 2 && !taken.has(shapeOf(pair))) || letters.slice(0, 2);
    taken.add(shapeOf(pick));
    table[player] = pick;
  }
  if (key) tables.set(key, table);
  return table;
}
export const initialsOf = (profiles, player) => initialsTable(profiles)[player]
  ?? (profiles?.[player]?.display || player || "").trim().slice(0, 2).toUpperCase();
export function usePlayerInitials(player) {
  return initialsOf(useContext(PlayerIdentityContext), player);
}

/* the smallest text a surface allows: 12px on a phone, 24px on the TV
   (TVMode provides it). A chip or avatar too small to letter its initials
   at the floor shows its color and skin alone. */
const TextFloorContext = createContext(12);
export function TextFloor({ px = 12, children }) {
  return createElement(TextFloorContext.Provider, { value:px }, children);
}
export const useTextFloor = () => useContext(TextFloorContext);

export function usePlayerIdentity(player) {
  const profiles = useContext(PlayerIdentityContext);
  if (profiles === undefined) {
    throw new Error("Player identity must render inside PlayerIdentityProvider.");
  }
  return resolvePlayerIdentity(profiles, player);
}
