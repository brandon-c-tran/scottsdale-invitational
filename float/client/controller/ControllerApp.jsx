/* The /float/play page (float/PROTOCOL.md "Pages"): the standalone join
   (float/client/join), then the controller.

     /float/play?room=<code>   the rider, then the room
     /float/play               the room code first

   ?mock=1 plays against the pretend room (mockRoom.js, loaded only then):
   &at=<scene> sets one moment up and opens straight on the controller,
   &freeze=1 holds it still (the room's clock stops), &join=code starts at
   the code. */
import React, { useEffect, useState } from "react";
import JoinFlow from "../join/JoinFlow.jsx";
import { roomFromSearch } from "../join/joinModel.js";

const MOCK_RIDER = { name:"Brandon", color:"#e4572e", look:{ critter:"capybara", floatie:"donut", hat:"none", shades:"none", pose:"flex" },
  drinks:true };

export default function ControllerApp() {
  const search = globalThis.location?.search || "";
  const params = new URLSearchParams(search);
  const mock = params.get("mock") === "1";
  const scene = params.get("at");
  const freeze = params.get("freeze") === "1";
  const [connect, setConnect] = useState(null);
  useEffect(() => {
    if (!mock) return undefined;
    let live = true;
    import("./mockRoom.js").then(({ createMockRoom }) => {
      if (live) setConnect(() => options => createMockRoom({ ...options, scene, freeze, expose:true }));
    });
    return () => { live = false; };
  }, [mock, scene, freeze]);
  if (mock && !connect) return null;
  if (mock) return <JoinFlow initialRoom={params.get("join") === "code" ? null : roomFromSearch(search) || "mock"} connect={connect}
    skip={!!scene} defaultRider={MOCK_RIDER} />;
  return <JoinFlow initialRoom={roomFromSearch(search)} />;
}
