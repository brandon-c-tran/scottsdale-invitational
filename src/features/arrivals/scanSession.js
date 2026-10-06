/* The scanner's session (Scanner.jsx), apart from the camera so it can be
   driven by any decoder: frames go in, at most one check-in goes out at a
   time. A frame whose code is not the TV's (any other QR) is ignored. A
   refused check-in (an old code, check-in closed) says why and resumes,
   never sending that same code again; an accepted one ends the session. */
import { arriveCodeFrom } from "./arrivalsModel.js";

/* one frame's pixels to the code it shows, or null. `decode` is jsQR's
   signature: (data, width, height, options) => { data } | null */
export function readArriveFrame(decode, image) {
  if (!decode || !image?.data || !image.width || !image.height) return null;
  let hit = null;
  try { hit = decode(image.data, image.width, image.height, { inversionAttempts:"dontInvert" }); } catch { hit = null; }
  return hit?.data ? arriveCodeFrom(hit.data) : null;
}

export function createScanSession({ decode, submit, onChange = () => {} }) {
  let phase = "scanning", error = "", refused = null;
  const set = (next, message = error) => { phase = next; error = message; onChange({ phase, error }); };
  return {
    get phase() { return phase; },
    get error() { return error; },
    /* one camera frame; resolves the write's result when it sent one */
    async frame(image) {
      if (phase !== "scanning") return null;
      const code = readArriveFrame(decode, image);
      if (!code || code === refused) return null;
      set("sending", "");
      let result;
      try {
        result = await submit(code);
        /* a timed-out write is settled by the next state */
        if (result?.uncertain && result.settled) result = await Promise.resolve(result.settled).catch(() => result) || result;
      } catch (failure) { result = { ok:false, error:String(failure?.message || "") }; }
      if (result?.ok) { set("done", ""); return result; }
      refused = code;
      set("scanning", result?.error || "Scan the code on the TV");
      return result;
    },
    stop() { if (phase !== "done") set("stopped", ""); },
  };
}
