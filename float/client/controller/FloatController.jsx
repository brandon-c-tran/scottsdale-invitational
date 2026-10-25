/* The phone's game for one room (float/PROTOCOL.md "Components"). STUB with
   the real props: <FloatController room={id} rider={rider} onExit={fn} />.
   rider: { name, color, look, drinks?, pid?, photo?, number?, skin?, groom? } */
import React from "react";

export default function FloatController({ room = "test", rider = null, onExit = null }) {
  return <div style={{ position:"fixed", inset:0, display:"grid", placeItems:"center", background:"#0b1220",
    color:"#f2ead8", font:"600 24px system-ui" }}>
    <span>Float · {room}{rider?.name ? ` · ${rider.name}` : ""}</span>
    {onExit && <button type="button" onClick={onExit}>Close</button>}
  </div>;
}
