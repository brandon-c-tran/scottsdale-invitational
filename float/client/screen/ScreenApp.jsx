/* The /float page (float/PROTOCOL.md "Pages"): the shared screen, full
   window. Without ?room= it makes a room (four consonants, so never a word),
   puts it in the URL and hosts that room's lobby: the code, the QR to
   /float/play?room=<code>, Start, the bots and the drinking switch. With
   ?room= it is that room (a Field Day room is run by Field Day: no controls). */
import React, { useMemo } from "react";
import FloatScreen from "./FloatScreen.jsx";
import { CODE_LETTERS, CODE_LENGTH, ROOM_ID } from "../../shared/protocol.js";

/* the join's own letters (float/shared/protocol.js), so a phone can always type it */
export function makeRoomCode(random = Math.random) {
  let code = "";
  for (let k = 0; k < CODE_LENGTH; k++) code += CODE_LETTERS[Math.floor(random() * CODE_LETTERS.length) % CODE_LETTERS.length];
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
    /* the page hosts any party room; a Field Day room (mode "fieldday") shows no controls */
    return { room, hosting:true, joinUrl:join.toString() };
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
