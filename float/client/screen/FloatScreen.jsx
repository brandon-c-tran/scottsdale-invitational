/* The shared screen for one room (float/PROTOCOL.md "Components"). STUB with
   the real props: <FloatScreen room={id} /> fills its parent. */
import React from "react";

export default function FloatScreen({ room = "test" }) {
  return <div style={{ position:"absolute", inset:0, display:"grid", placeItems:"center", background:"#0b1220",
    color:"#f2ead8", font:"600 32px system-ui" }}>Float · {room}</div>;
}
