import React, { useEffect, useState } from "react";
import { disp } from "../../../shared/core.js";
import { ChipFace } from "../identity/PlayerIdentity.jsx";
import { usePlayerIdentity } from "../identity/PlayerIdentityContext.js";
import { cardInk } from "../profile/PlayerPass.jsx";
import { serverNow } from "../../lib/serverClock.js";
import "./moments.css";

/* The room sorts itself (Backglass signature moment 3): at the draw, the
   instant the room turns your team's card, your phone floods with your
   team's color (its first member's identity color, so everyone on a team
   floods the same) and shows the team in poster type to hold up, so
   teammates find each other across the room. Then the reveal and your path
   carry on underneath. Only a team of two or more; a phone following the
   draw live (EventAnnouncement passes `at` only then). */
export const TEAM_SORT_MS = 4200;

/* your team in a draw reveal's groups: the line (or the team group) you
   are in, when it has two or more people, else null */
export function teamOf(reveal, groups, me) {
  if (!me || !Array.isArray(groups)) return null;
  for (let index = 0; index < groups.length; index++) {
    const group = groups[index];
    if (group.bye) continue;
    const line = group.lines.find(item => (item.avatars || []).includes(me));
    if (!line) continue;
    /* a team listed one player a line is the whole group (the draw, not heats) */
    const singles = group.lines.every(item => (item.avatars || []).length <= 1);
    const players = singles && !group.vs && reveal?.title === "The draw"
      ? group.lines.flatMap(item => item.avatars || []) : [...(line.avatars || [])];
    if (players.length < 2) return null;
    const name = group.vs ? line.text : group.title || line.text;
    return { index, players, name };
  }
  return null;
}

export function TeamSort({ state, team, at }) {
  const identity = usePlayerIdentity(team?.players?.[0]);
  const ink = cardInk(identity.color);
  const [show, setShow] = useState(() => serverNow() >= at && serverNow() < at + TEAM_SORT_MS);
  useEffect(() => {
    const now = serverNow();
    const timers = [];
    if (now < at) timers.push(setTimeout(() => setShow(true), at - now));
    timers.push(setTimeout(() => setShow(false), Math.max(0, at + TEAM_SORT_MS - now)));
    return () => timers.forEach(clearTimeout);
  }, [at]);
  if (!show || !team) return null;
  const elapsed = Math.max(0, serverNow() - at);
  const size = team.players.length > 4 ? 72 : team.players.length > 2 ? 88 : 112;
  return (
    <div className="fd-moment fd-moment-team" role="status" aria-label={`Your team: ${team.players.map(p => disp(state, p)).join(", ")}`}
      style={{ "--tl":`${-Math.round(elapsed)}ms`, "--moment-color":identity.color, "--moment-ink":ink,
        "--moment-hold":`${TEAM_SORT_MS}ms` }}
      onClick={() => setShow(false)}>
      <div className="fd-moment-flood" aria-hidden="true"><i style={{ background:identity.color }} /></div>
      <div className="fd-moment-body" aria-hidden="true">
        <h2 className="fd-show fd-moment-team-name">{team.name}</h2>
        <p className="fd-moment-sub"><span>Your team</span></p>
        <div className="fd-moment-team-faces">
          {team.players.map((p, i) => <span key={p} style={{ "--face":i }}><ChipFace p={p} size={size} flat /></span>)}
        </div>
        <p className="fd-moment-hold">Hold it up</p>
      </div>
    </div>
  );
}
