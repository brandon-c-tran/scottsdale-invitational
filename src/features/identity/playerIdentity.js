import { ROSTER, CHIP_GRAY, CHIP_COLORS, CHIP_SKINS } from "../../../shared/core.js";
import { chipInkIsDark } from "./chipInk.js";

/* Presentation only. The server owns profile validation and every chip claim.
   Keep saved numbers verbatim, including zero, and use the roster number only
   when none has been saved. Unknown players have no invented number. */
/* The saved profile photo, same-origin, versioned so a new upload shows. */
export const photoUrl = (profile, player) =>
  profile?.photoV ? `/api/photo/${encodeURIComponent(player)}?v=${profile.photoV}` : null;

export function resolvePlayerIdentity(profiles, player) {
  const profile = profiles?.[player];
  const claimedColor = CHIP_COLORS.find(color => color.hex === profile?.color);
  const rosterIndex = ROSTER.indexOf(player);
  const color = claimedColor?.hex ?? CHIP_GRAY;
  return {
    color,
    /* dark ink on this chip (chipInk.js): whichever ink contrasts more */
    isLight:chipInkIsDark(color),
    skin:CHIP_SKINS.includes(profile?.skin) ? profile.skin : "ticks",
    num:profile?.num ?? (rosterIndex < 0 ? null : rosterIndex + 1),
    photo:photoUrl(profile, player),
  };
}
