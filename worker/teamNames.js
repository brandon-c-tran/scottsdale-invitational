/* Team names (shared/teamNames.js): the one write. Any member of the team
   (by device claim) names it until the event's first contest locks or
   starts; the commissioner names any team at any time. A name is a label
   on the draw's team (state.draws[evId].teams[i].name) and nothing else:
   wagers, brackets, stages and results reference team keys and players,
   so a rename never moves a chip.

   Retries: the same device and action id is acknowledged without writing
   twice, even after a teammate renamed it in between (eventOps.nameCommands,
   server only like draftCommands). */
import { allEventsOf, isActivePlayer } from "../shared/core.js";
import { cleanTeamName, teamNameKey, teamNameProblem, teamNamesLocked } from "../shared/teamNames.js";

const NAME_COMMAND_LIMIT = 64;

export function teamNameActions({ ok, err }) {
  const requestKey = ctx => typeof ctx?.deviceId === "string" && ctx.deviceId && ctx.deviceId.length <= 200
    && typeof ctx?.actionId === "string" && ctx.actionId && ctx.actionId.length <= 120
    ? `request:${ctx.deviceId}:${ctx.actionId}` : null;
  return {
    nameTeam(state, payload, ctx) {
      const { evId, drawId, team } = payload;
      const key = requestKey(ctx);
      const actor = ctx.isGm ? "commissioner" : ctx.player;
      const fingerprint = JSON.stringify(["nameTeam", evId, drawId, team, payload.name ?? null]);
      const prior = key ? state.eventOps?.[evId]?.nameCommands?.[key] : null;
      if (prior) return prior.actor === actor && prior.fingerprint === fingerprint
        ? ok({ ...prior.extra, unchanged:true }) : err("Request id already used");

      const ev = allEventsOf(state).find(item => item.id === evId);
      if (!ev) return err("No such event");
      const draw = state.draws?.[evId];
      if (!draw?.teams?.length) return err("No teams yet");
      if (drawId !== draw.id) return err("Teams changed, refresh and try again");
      const target = Number.isInteger(team) ? draw.teams[team] : null;
      if (!target) return err("No such team");
      if ((target.players?.length || 0) < 2) return err("Only teams take names");
      if (!ctx.isGm) {
        if (!isActivePlayer(ctx.player)) return err("Check in first");
        if (!target.players.includes(ctx.player)) return err("Only the team names itself");
        if (teamNamesLocked(state, evId)) return err("Names are locked");
      }
      const problem = teamNameProblem(payload.name);
      if (problem) return err(problem);
      const name = cleanTeamName(payload.name);
      /* a pair may go back to its names; a bigger team always has one */
      if (name === null && target.players.length > 2) return err("Name required");
      if (name && draw.teams.some((other, index) => index !== team && other?.name && teamNameKey(other.name) === teamNameKey(name)))
        return err("Another team has that name");

      const extra = { team, name };
      if ((target.name ?? null) === name) return ok({ ...extra, unchanged:true });
      if (name === null) { delete target.name; delete target.named; }
      else {
        target.name = name;
        target.named = { by:isActivePlayer(ctx.player) ? ctx.player : null, gm:!!ctx.isGm, at:Date.now() };
      }
      if (key) {
        state.eventOps = state.eventOps || {};
        const op = state.eventOps[evId] = state.eventOps[evId] || {};
        op.nameCommands = { ...(op.nameCommands || {}), [key]:{ actor, fingerprint, extra } };
        const keys = Object.keys(op.nameCommands);
        keys.slice(0, Math.max(0, keys.length - NAME_COMMAND_LIMIT)).forEach(stale => delete op.nameCommands[stale]);
      }
      return ok(extra);
    },
  };
}
