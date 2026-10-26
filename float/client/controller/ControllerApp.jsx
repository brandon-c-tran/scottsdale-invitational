/* The /float/play page (float/PROTOCOL.md "Pages"): the standalone join,
   then the controller. ?mock=1 plays against the pretend room
   (mockRoom.js, loaded only then); &at=<scene> holds one scene. */
import React, { useEffect, useState } from "react";
import FloatController from "./FloatController.jsx";
import { ROOM_ID } from "../../shared/protocol.js";

const DEFAULT_RIDER = { name:"Brandon", color:"#ff5a4f", look:{ critter:"capybara", floatie:"donut", hat:"cowboy", shades:"aviators", pose:"flex" }, drinks:true };

export default function ControllerApp() {
  const params = new URLSearchParams(globalThis.location?.search || "");
  const mock = params.get("mock") === "1";
  const scene = params.get("at");
  const room = (params.get("room") || "").toLowerCase();
  const [connect, setConnect] = useState(null);
  useEffect(() => {
    if (!mock) return;
    let live = true;
    import("./mockRoom.js").then(({ createMockRoom }) => {
      if (live) setConnect(() => options => createMockRoom({ ...options, scene, expose:true }));
    });
    return () => { live = false; };
  }, [mock, scene]);
  if (mock) return connect ? <FloatController room="mock" rider={DEFAULT_RIDER} connect={connect} /> : null;
  return ROOM_ID.test(room) ? <FloatController room={room} rider={DEFAULT_RIDER} /> : null;
}
