/* The TV's "now playing" card, as data: whose win song is on the speaker
   (the walkout record the Worker writes, shared/audio.js), named MVP when it
   is a team MVP's, or the team's when a pair or a team won (the walkout
   record names only the singer). A team MVP whose vote just closed shows
   for a moment even with no song saved. Pure; `now` is the server clock. */
import { walkoutLive } from "../../../shared/audio.js";
import { latestMvp } from "../../../shared/mvp.js";
import { walkoutTeam } from "../moments/walkoutTeam.js";

/* how long a team MVP's card stays up when no song plays */
export const MVP_CARD_MS = 12 * 1000;

export function nowPlayingModel(state, events = [], now = Date.now()) {
  const nameOf = evId => events.find(event => event.id === evId)?.name || null;
  const latest = latestMvp(state);
  const mvpFresh = latest && now - Number(latest.closedAt) < MVP_CARD_MS;
  const walkout = walkoutLive(state, now);
  if (walkout?.player) {
    const saved = state?.profiles?.[walkout.player]?.walkoutTrack;
    const track = saved && (!walkout.trackId || saved.trackId === walkout.trackId)
      ? { name:saved.name, artists:(saved.artists || []).join(", "), imageUrl:saved.imageUrl || null } : null;
    const mvp = walkout.mvp && latest?.winner === walkout.player ? latest : null;
    /* a pair or a team wins as the team: its name and chips lead, then the song */
    const team = mvp ? null : walkoutTeam(state, events, walkout);
    return { key:mvp ? `mvp:${mvp.id}` : `song:${walkout.startedAt}`, player:walkout.player, track, team,
      mvp:mvp ? nameOf(mvp.eventId) || "Team MVP" : null, startedAt:Number(walkout.startedAt) || now, until:walkout.until };
  }
  if (mvpFresh) return { key:`mvp:${latest.id}`, player:latest.winner, track:null, team:null,
    mvp:nameOf(latest.eventId) || "Team MVP", startedAt:Number(latest.closedAt), until:Number(latest.closedAt) + MVP_CARD_MS };
  return null;
}
