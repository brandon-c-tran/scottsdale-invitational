/* The TV's "now playing" card, as data: whose win song is on the speaker
   (the walkout record the Worker writes, shared/audio.js), or the team's
   when a pair or a team won (the walkout record names only the singer).
   Pure; `now` is the server clock. */
import { walkoutLive } from "../../../shared/audio.js";
import { walkoutTeam } from "../moments/walkoutTeam.js";

export function nowPlayingModel(state, events = [], now = Date.now()) {
  const walkout = walkoutLive(state, now);
  if (!walkout?.player) return null;
  const saved = state?.profiles?.[walkout.player]?.walkoutTrack;
  const track = saved && (!walkout.trackId || saved.trackId === walkout.trackId)
    ? { name:saved.name, artists:(saved.artists || []).join(", "), imageUrl:saved.imageUrl || null } : null;
  /* a pair or a team wins as the team: its name and chips lead, then the song */
  const team = walkoutTeam(state, events, walkout);
  return { key:`song:${walkout.startedAt}`, player:walkout.player, track, team,
    startedAt:Number(walkout.startedAt) || now, until:walkout.until };
}
