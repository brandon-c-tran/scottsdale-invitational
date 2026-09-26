import { ROSTER, CHIP_GRAY, CHIP_COLORS, CHIP_SKINS } from "../../../shared/core.js";

/* Presentation only. The server owns profile validation and every chip claim.
   Keep saved numbers verbatim, including zero, and use the roster number only
   when none has been saved. Unknown players have no invented number. */
export function resolvePlayerIdentity(profiles, player) {
  const profile = profiles?.[player];
  const claimedColor = CHIP_COLORS.find(color => color.hex === profile?.color);
  const rosterIndex = ROSTER.indexOf(player);
  return {
    color:claimedColor?.hex ?? CHIP_GRAY,
    isLight:!!claimedColor?.light,
    skin:CHIP_SKINS.includes(profile?.skin) ? profile.skin : "ticks",
    num:profile?.num ?? (rosterIndex < 0 ? null : rosterIndex + 1),
  };
}
