/* The room as this phone knows it: folded from the connection's frames
   (welcome, room, me, ev) into one state the controller renders. The phone
   finds itself by its device in the room's entrants. The chart comes in
   full with the welcome and when the song changes, and is kept while the
   room names the same one (chartId); the frozen chart module stands in for
   a room that sends neither. memory is what the room has said about this
   rider in the song (its verdicts on their cues, their Done) and the round
   they went out in; it starts over with each song, and all of it with each
   Cup. */
import { useEffect, useState } from "react";
import { chartFor, findMe, foldMine, songKeyOf } from "./controllerModel.js";

export const EMPTY = Object.freeze({ status:"connecting", welcome:null, room:null, chart:null, me:null, memory:{}, idx:-1, songKey:null });

const meIndex = (state, device) => findMe({ room:state.room, device, welcome:state.welcome });

/* one frame into the state */
export function foldFrame(state, msg, { device = null } = {}) {
  switch (msg?.t) {
    case "welcome": {
      const next = { ...state, welcome:msg.you || null };
      return { ...next, idx:meIndex(next, device) };
    }
    case "room": {
      const was = state.room;
      const fresh = (was?.cupId && msg.cupId && was.cupId !== msg.cupId) || (msg.phase === "lobby" && was?.phase && was.phase !== "lobby");
      const chart = chartFor(msg, state.chart);
      const songKey = msg.phase === "song" || msg.phase === "cut" || msg.phase === "lastcall" ? songKeyOf(msg) ?? state.songKey : null;
      /* the last song's `me` is not this one's */
      const newSong = fresh || msg.phase === "intro" || msg.phase === "lobby" || (songKey && songKey !== state.songKey)
        || (was && Number(was.round) !== Number(msg.round));
      const next = { ...state, room:msg, chart, songKey, me:newSong ? null : state.me };
      const idx = meIndex(next, device);
      let memory = foldMine(fresh ? {} : state.memory, null, { idx, songKey, round:msg.round });
      /* out at this cut: the round they went out in, for a room that sends no scores */
      if (msg.phase === "cut" && idx >= 0 && memory.outRound == null && Array.isArray(msg.out) && msg.out.includes(idx)
        && !(Array.isArray(was?.out) && was.out.includes(idx))) memory = { ...memory, outRound:Number(msg.round) || 0 };
      return { ...next, idx, memory };
    }
    case "me":
      return { ...state, me:msg, memory:foldMine(state.memory, msg, { idx:state.idx, songKey:state.songKey, round:state.room?.round }) };
    case "ev":
      return { ...state, memory:foldMine(state.memory, msg, { idx:state.idx, songKey:state.songKey, round:state.room?.round }) };
    default:
      return state;
  }
}

export function useRoom(net) {
  const [state, setState] = useState(EMPTY);
  useEffect(() => {
    if (!net) return undefined;
    setState({ ...EMPTY, status:net.status() });
    const device = net.device;
    const offs = ["welcome", "room", "me", "ev"].map(type => net.on(type, msg => setState(s => foldFrame(s, msg, { device }))));
    const offStatus = net.onStatus(status => setState(s => ({ ...s, status })));
    return () => { offs.forEach(off => off()); offStatus(); };
  }, [net]);
  return state;
}
