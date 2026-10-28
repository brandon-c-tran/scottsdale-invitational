/* The screen's stand-in connection (`?mock=1`), with the net API's exact
   shape (float/PROTOCOL.md "Net"): { send, on, close, serverNow, rtt,
   status, onStatus }. Nothing goes over the network.

     ?mock=1               the real room (float/worker/room.js) run in this tab
                           (mock/room.js): a lobby that fills with the roster's
                           phones; Start runs the Cup
     &script=1             a Cup scripted from the charts alone (mock/script.js),
                           no engine behind it
     &n=13                 how many phones join (0 to 16)
     &auto=1               start on its own once they are in
     &shot=<moment>        jump straight to a moment (MOCK_SHOTS)
     &freeze=1             and stop the clock there (screenshots)
     &seed=3               another room
     &drinking=0           a room with drinking off */
import { connectRoom } from "./mock/room.js";
import { connectScripted, scriptCup, seenOf } from "./mock/script.js";
import { MOCK_SHOTS, SHOTS, mockRider, mockSkills, shotTime } from "./mock/shared.js";

export { MOCK_SHOTS, SHOTS, mockRider, mockSkills, scriptCup, seenOf, shotTime, connectRoom, connectScripted };

export function connectFloat(args = {}) {
  const params = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
  const scripted = String(args.options?.script ?? params.get("script") ?? "") === "1";
  return scripted ? connectScripted(args) : connectRoom(args);
}

export default connectFloat;
