/* The room as this phone knows it: folded from the connection's frames
   (welcome, room, me, ev) into one state the controller renders. The
   course comes in full once and is kept while the room names the same one.
   memory is what the beach and the drink button need from the stream:
   the rounds this rider drank in, the round they went out, their last
   throw, and every splash. */
import { useEffect, useState } from "react";
import { FLAG, findMe, foldEvent, has, indexes, withDrink } from "./controllerModel.js";

export const EMPTY = Object.freeze({ status:"connecting", welcome:null, room:null, course:null, me:null, memory:{}, last:null, idx:-1 });

const meIndex = (state, device, pid) => findMe({ room:state.room, device, pid, welcome:state.welcome, me:state.me });

/* one frame into the state */
export function foldFrame(state, msg, { device = null, pid = null } = {}) {
  switch (msg?.t) {
    case "welcome": {
      const next = { ...state, welcome:msg.you || null };
      return { ...next, idx:meIndex(next, device, pid) };
    }
    case "room": {
      const course = msg.course && typeof msg.course === "object" ? msg.course
        : state.course && (!msg.courseId || state.course.id === msg.courseId) ? state.course : null;
      const next = { ...state, room:msg, course };
      const idx = meIndex(next, device, pid);
      let memory = state.memory;
      if (idx >= 0 && indexes(msg.out).includes(idx) && memory.outRound == null) memory = { ...memory, outRound:Number(msg.round) || 0 };
      if (msg.phase === "lobby" && state.room?.phase && state.room.phase !== "lobby") memory = {};
      return { ...next, idx, memory };
    }
    case "me": {
      const next = { ...state, me:msg };
      const idx = state.idx >= 0 ? state.idx : meIndex(next, device, pid);
      const memory = has(msg.f, FLAG.DRANK) ? withDrink(state.memory, state.room?.round) : state.memory;
      return { ...next, idx, memory };
    }
    case "ev":
      return { ...state, memory:foldEvent(state.memory, msg, state.idx, state.room?.round), last:msg };
    default:
      return state;
  }
}

export function useRoom(net, { pid = null } = {}) {
  const [state, setState] = useState(EMPTY);
  useEffect(() => {
    if (!net) return undefined;
    setState({ ...EMPTY, status:net.status() });
    const device = net.device;
    const offs = ["welcome", "room", "me", "ev"].map(type => net.on(type, msg => setState(s => foldFrame(s, msg, { device, pid }))));
    const offStatus = net.onStatus(status => setState(s => ({ ...s, status })));
    return () => { offs.forEach(off => off()); offStatus(); };
  }, [net, pid]);
  return state;
}
