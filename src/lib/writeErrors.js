/* What a failed write says. Each line names the problem and the one thing
   to do about it; a server refusal already carries its own reason and is
   shown as it comes. Pure: the transport (client.js) and every surface that
   shows a failure read these, so a phone never says a bare "Try again".

   The transport does not queue writes: a write tapped with no connection is
   not sent, so the line says to tap again once the connection is back. A
   write that was sent but never answered may have landed; it settles from
   the next state, and until then the board is the place to look. */
export const WRITE_ERRORS = Object.freeze({
  offline:"No connection. Tap again when it's back.",
  dropped:"Connection dropped. If it saved, the board will show it.",
  timeout:"No answer yet. If it saved, the board will show it.",
  notApplied:"It didn't save. Tap again.",
  unconfirmed:"Couldn't confirm it saved. Check the board before tapping again.",
  serverFailed:"The server didn't save it. Tap again.",
});

/* legacy transport lines, from a client or Worker build older than this one */
const LEGACY = new Map([
  ["Offline, try again", WRITE_ERRORS.offline],
  ["Connection lost, try again", WRITE_ERRORS.dropped],
  ["No response, try again", WRITE_ERRORS.timeout],
  ["Not saved, try again", WRITE_ERRORS.notApplied],
  ["Not saved. Try again.", WRITE_ERRORS.notApplied],
  ["Couldn't save. Try again.", WRITE_ERRORS.serverFailed],
  ["Not confirmed. Check whether it saved before trying again.", WRITE_ERRORS.unconfirmed],
]);

/* a thrown fetch or socket failure reads as no connection */
const NETWORK = /failed to fetch|networkerror|network request failed|load failed/i;

/* The line to show for a failed write: the result's own reason (mapped
   from an old transport line), a thrown error's message, else `fallback`
   (a surface's own words for what did not happen), else notApplied. */
export function writeError(failure, fallback = WRITE_ERRORS.notApplied) {
  const raw = typeof failure === "string" ? failure
    : failure?.error || (failure instanceof Error ? failure.message : "") || "";
  const text = String(raw).trim();
  if (!text) return fallback;
  if (LEGACY.has(text)) return LEGACY.get(text);
  if (NETWORK.test(text)) return WRITE_ERRORS.offline;
  return text;
}

/* sent and unanswered: it may have landed, so the surface waits on
   `settled` instead of inviting a second tap */
export const writeUncertain = result => result?.ok !== true && result?.uncertain === true;
