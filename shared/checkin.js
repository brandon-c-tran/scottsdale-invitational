/* A returning guest in a new storage context (reinstalled PWA, a different
   browser) has no local completion marker, but the server still has their
   answers. The server decides this for the claim acknowledgement and the
   client for a hello that already carries a claim, so both read the same
   rule: a saved name, a claimed chip color, and saved private ratings. */
function checkInComplete(state, player) {
  if (!player) return false;
  const profile = state?.profiles?.[player];
  const ratings = state?.seeds?.[player];
  return !!(profile
    && typeof profile.display === "string" && profile.display.trim()
    && profile.color
    && ratings && typeof ratings === "object" && Object.keys(ratings).length > 0);
}

export { checkInComplete };
