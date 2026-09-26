import { createContext, createElement, useContext } from "react";
import { resolvePlayerIdentity } from "./playerIdentity.js";

const PlayerIdentityContext = createContext(undefined);

/* Each application or preview supplies its own current server profiles.
   No render can overwrite the identity used by another tree. */
export function PlayerIdentityProvider({ profiles, children }) {
  return createElement(PlayerIdentityContext.Provider, { value:profiles ?? null }, children);
}

export function usePlayerIdentity(player) {
  const profiles = useContext(PlayerIdentityContext);
  if (profiles === undefined) {
    throw new Error("Player identity must render inside PlayerIdentityProvider.");
  }
  return resolvePlayerIdentity(profiles, player);
}
