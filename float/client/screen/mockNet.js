/* The screen's stand-in connection (`?mock=1`), with the net API's exact
   shape (float/PROTOCOL.md "Net"): { send, on, close, serverNow, rtt,
   status, onStatus }. Nothing goes over the network.

     ?mock=1               the real room (float/worker/room.js) run in this tab
                           (mock/room.js); if the engine does not load (it is
                           mid-change), the scripted Cup instead
     &script=1             the Cup scripted from the charts alone (mock/script.js),
                           no engine behind it: the whole contract, v2 included
     &n=13                 how many phones join (0 to 16)
     &auto=1               start on its own once they are in
     &shot=<moment>        jump straight to a moment (MOCK_SHOTS)
     &freeze=1             and stop the clock there (screenshots)
     &seed=3               another room
     &drinking=0           a room with drinking off

   The room module is loaded lazily, so a broken engine never takes the
   scripted Cup (or the screen) down with it. */
import { connectScripted, scriptCup, seenOf } from "./mock/script.js";
import { MOCK_SHOTS, SHOTS, mockRider, mockSkills, shotTime } from "./mock/shared.js";

export { MOCK_SHOTS, SHOTS, mockRider, mockSkills, scriptCup, seenOf, shotTime, connectScripted };

const wantsScript = options => {
  const params = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
  return String(options?.script ?? params.get("script") ?? "") === "1";
};

/* the connect function the screen should use: the room, else the script */
export async function loadMockConnect(options = {}) {
  if (wantsScript(options)) return connectScripted;
  try {
    const { connectRoom } = await import("./mock/room.js");
    return connectRoom;
  } catch (error) {
    console.warn("Float mock: the room did not load; playing the scripted Cup", error);
    return connectScripted;
  }
}

/* synchronous: the scripted Cup (the room needs loadMockConnect) */
export function connectFloat(args = {}) {
  return connectScripted(args);
}

export default connectFloat;
