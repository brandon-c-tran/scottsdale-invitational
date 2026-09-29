/* The commissioner's walkout cues, as a pure model. The server's walkout
   record (state.showControl.audio.walkout, shared/audio.js) is the truth for
   whether a song is playing: a chip reads Stop exactly while it is live, so a
   tap never restarts a song that is still on the speaker. The only local
   input is the answer to this device's own last cue command, which covers
   the moment between that answer and the broadcast that carries the same
   record. */
import { walkoutOf } from "../../../shared/audio.js";

/* how long this device trusts its own command's answer over the board */
export const CUE_BRIDGE_MS = 4000;
/* while a walkout is up, the commissioner's phone asks the speaker this often */
export const WALKOUT_POLL_MS = 6000;
/* a sheet header has room for this many play chips; Stop always fits */
export const DOCK_PLAY_LIMIT = 2;

/* bridge: { walkout, serverAt, clientAt } from this device's last play or
   stop answer. A stop answer (walkout null) hides the record it stopped
   until a newer one arrives; a play answer shows its record until the board
   carries it or something newer. */
export function effectiveWalkout(stored, bridge, clientNow) {
  if (!bridge || clientNow - bridge.clientAt >= CUE_BRIDGE_MS) return stored || null;
  if (!bridge.walkout) return stored && stored.startedAt > bridge.serverAt ? stored : null;
  return !stored || stored.startedAt < bridge.walkout.startedAt ? bridge.walkout : stored;
}

/* the record while its song is expected to play, else null */
export const soundingWalkout = (walkout, serverNowMs) =>
  walkout && serverNowMs < walkout.until ? walkout : null;

/* One chip per offered player with a saved track, plus the player whose
   walkout is playing even after their cue window closed (the Stop must
   outlast the offer). A song started from Audio Director search has no
   player and gets its own Stop chip. */
export function cueRackItems(state, candidates = [], sounding = null) {
  const trackOf = player => state?.profiles?.[player]?.walkoutTrack || null;
  const items = [...new Set(candidates)].map(player => ({ player, track:trackOf(player) }))
    .filter(item => item.track);
  if (sounding && !items.some(item => item.player === sounding.player))
    items.unshift({ player:sounding.player, track:sounding.player ? trackOf(sounding.player) : null });
  return items.map(item => ({ ...item, sounding:!!sounding && item.player === sounding.player }));
}

/* Inside a sheet header: the Stop chip whenever something plays, otherwise
   the play chips when there are few enough to fit beside the title. */
export function dockItems(items) {
  const sounding = items.filter(item => item.sounding);
  if (sounding.length) return sounding;
  return items.length <= DOCK_PLAY_LIMIT ? items : [];
}

/* whether the commissioner's phone should be asking the speaker */
export const shouldPollWalkout = (state, bridge, clientNow) =>
  !!effectiveWalkout(walkoutOf(state), bridge, clientNow);

export { walkoutOf };
