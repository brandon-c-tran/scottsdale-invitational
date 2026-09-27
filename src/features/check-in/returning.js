import { checkInComplete } from "../../../shared/checkin.js";

/* A returning guest in a new storage context (reinstalled app, another
   browser) has no local check-in record, but the server has every answer.
   Only a device with NO local record qualifies: "" marks a deliberate local
   replay, and "yes" is a finished device that an epoch rerun sent back.
   Where check-in opens is still firstOnboardStep()'s decision; these only
   decide whether the claim screen may hand off to Home. */
const CHECK_IN_MARKER = "si-onboard-v5";

/* The claim acknowledgement carries the server's answer. */
const returningAfterClaim = ({ localMarker, result }) =>
  localMarker === null && result?.ok === true && result?.extra?.checkedIn === true;

/* A hello on a device the server already knows. Step 0 only: never the
   install gate, never mid-flow. Returns the player to land as, or null. */
function returningFromHello({ localMarker, step, you, state }) {
  if (localMarker !== null || step !== 0 || !you) return null;
  return checkInComplete(state, you) ? you : null;
}

export { CHECK_IN_MARKER, returningAfterClaim, returningFromHello };
