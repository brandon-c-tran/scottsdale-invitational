/* The /float page (float/PROTOCOL.md "Pages"): the shared screen, full
   window. Without ?room= it makes a room (four consonants, so never a word),
   puts it in the URL and hosts that room's lobby: the code, the QR to
   /float/play?room=<code>, Start, the bots and the drinking switch. With
   ?room= it is that room (a standalone code still hosts; a Field Day room
   is run by Field Day). */
import React, { useMemo } from "react";
import FloatScreen from "./FloatScreen.jsx";
import { ROOM_ID } from "../../shared/protocol.js";

const CONSONANTS = "bcdfghjklmnpqrstvwxz";
const STANDALONE = /^[bcdfghjklmnpqrstvwxz]{4}$/;

export function makeRoomCode(random = Math.random) {
  let code = "";
  for (let k = 0; k < 4; k++) code += CONSONANTS[Math.floor(random() * CONSONANTS.length) % CONSONANTS.length];
  return code;
}

function useRoom() {
  return useMemo(() => {
    const url = new URL(window.location.href);
    let room = String(url.searchParams.get("room") || "").toLowerCase();
    if (!ROOM_ID.test(room)) {
      room = makeRoomCode();
      url.searchParams.set("room", room);
      try { window.history.replaceState(null, "", url.toString()); } catch {}
    }
    const join = new URL("/float/play", window.location.origin);
    join.searchParams.set("room", room);
    return { room, hosting:STANDALONE.test(room), joinUrl:join.toString() };
  }, []);
}

export default function ScreenApp() {
  const { room, hosting, joinUrl } = useRoom();
  const full = () => {
    try {
      if (document.fullscreenElement) document.exitFullscreen?.();
      else document.documentElement.requestFullscreen?.();
    } catch {}
  };
  return <main style={{ position:"fixed", inset:0, background:"#090b14", overflow:"hidden" }} onDoubleClick={full}>
    <FloatScreen room={room} hosting={hosting} joinUrl={joinUrl} />
  </main>;
}
