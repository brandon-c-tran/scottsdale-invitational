import test from "node:test";
import assert from "node:assert/strict";
import { EMPTY_STATE, ROSTER, allEventsOf, resolveCurrentContest, resolveEventLifecycle,
  resolveWager, contestBetEligibility, wagerMatchesContest, contestUndoAvailability,
  computeStandings, atRisk, makeBracket } from "../shared/core.js";
import { applyAction } from "./support/confirmed-start.mjs";
import { hydrateStoredState } from "../worker/state.js";
import { withLegacyEvents } from "./support/legacy-events.mjs";

let serial = 0;
const fresh = () => structuredClone(EMPTY_STATE);
const event = (s, id) => allEventsOf(s).find(e => e.id === id);
const current = (s, id) => resolveCurrentContest(s, event(s, id));
const refs = c => ({ contestId:c.id, contestRevision:c.revision });
const gm = id => ({ isGm:true, player:ROSTER[0], deviceId:"host", actionId:id || `host-${++serial}` });
const guest = (player, id) => ({ player, deviceId:`device-${player}`, actionId:id || `chip-${++serial}` });
const act = (s, type, payload, ctx = gm()) => {
  const result = applyAction(s, type, payload, ctx);
  assert.equal(result.ok, true, `${type}: ${result.error}`);
  return result;
};
const fail = (s, type, payload, ctx = gm(), pattern) => {
  const before = structuredClone(s);
  const result = applyAction(s, type, payload, ctx);
  assert.equal(result.ok, false, `${type} should reject`);
  if (pattern) assert.match(result.error, pattern);
  assert.deepEqual(s, before, `${type} must not partially mutate on rejection`);
  return result;
};
const bracket = () => {
  const s = fresh();
  s.draws["8ball"] = { id:"draw-1", teams:Array.from({length:6}, (_, key) => ({ name:`Team ${key}`, players:ROSTER.slice(key*2,key*2+2) })), ts:1 };
  s.brackets["8ball"] = makeBracket(6);
  act(s, "announceEvent", { evId:"8ball" });
  return s;
};
const lock = (s, id) => act(s, "lockAndStart", { evId:id, ...refs(current(s,id)) });
const win = (s, id, winner, qualifiers) => act(s, "recordContestWinner", { evId:id, ...refs(current(s,id)), winner, ...(qualifiers ? {qualifiers} : {}) });
const chip = (s, id, side, stake = 100) => {
  const c = current(s,id), ev = event(s,id);
  const common = { eventId:id, evName:ev.name, stake, ...refs(c) };
  if (c.kind === "ffa") return c.drawId ? { ...common, kind:"outright", pickTeam:true, pickPlayers:side.players, drawId:c.drawId }
    : { ...common, kind:"outright", pick:side.key };
  if (c.kind === "match") return { ...common, kind:"match", match:c.match, teamIdx:side.key, drawId:c.drawId };
  return { ...common, kind:c.kind === "heat" ? "heat" : "stage", stagesId:c.stagesId, drawId:c.drawId,
    group:c.group, final:c.kind === "stage-final", pickKey:side.key };
};

test("untouched events are scheduled; FFA allows an intentional chip on anyone including self", () => {
  const s = fresh(), ev = event(s,"putt");
  assert.equal(current(s,"putt").phase, "scheduled");
  assert.equal(resolveEventLifecycle(s,ev).nextAction.type, "open-betting");
  const before = computeStandings(s);
  act(s,"announceEvent",{evId:ev.id});
  assert.deepEqual(computeStandings(s), before);
  assert.equal(s.wagers.length,0);
  const c = current(s,ev.id);
  assert.equal(c.sides.length,ROSTER.length);
  for (const key of [ROSTER[0],ROSTER[1]]) {
    const side = c.sides.find(x => x.key === key);
    assert.equal(contestBetEligibility(c,ROSTER[0],key),true);
    act(s,"placeWager",{wager:chip(s,ev.id,side)},guest(ROSTER[0]));
  }
  assert.equal(atRisk(s,ROSTER[0],allEventsOf(s)),200);
  lock(s,ev.id);
  assert.equal(current(s,ev.id).nextAction.type,"enter-result");
  act(s,"beginResultEntry",{evId:ev.id});
  assert.equal(current(s,ev.id).phase,"awaiting-result");
  fail(s,"saveResult",{evId:ev.id,slots:[[ROSTER[0],ROSTER[1]]]},gm(),/one winner/);
  act(s,"saveResult",{evId:ev.id,slots:[[ROSTER[0]]]});
  assert.equal(current(s,ev.id),null);
  assert.deepEqual(s.wagers.map(w=>resolveWager(s,w,allEventsOf(s)).delta).sort((a,b)=>a-b),[-100,200]);
});

test("bracket markets expose exactly one matchup; queued chips and host results cannot land on the next one", () => {
  const s=bracket(), id="8ball", c=current(s,id), observer=ROSTER[12];
  assert.deepEqual(c.match,[0,0]);
  const mine=c.sides[0].players[0];
  fail(s,"placeWager",{wager:chip(s,id,c.sides[1])},guest(mine),/yourself or your team/);
  act(s,"placeWager",{wager:chip(s,id,c.sides[0])},guest(mine));
  act(s,"placeWager",{wager:chip(s,id,c.sides[1])},guest(observer));
  fail(s,"placeWager",{wager:{...chip(s,id,c.sides[0]),match:[0,1]}},guest(observer),/current contest/);
  fail(s,"placeWager",{wager:{eventId:id,kind:"outright",stake:100,pick:observer,...refs(c)}},guest(observer),/current contest/);
  fail(s,"placeWager",{wager:{...chip(s,id,c.sides[0]),contestId:undefined,contestRevision:undefined}},guest(observer),/already moved on/);
  const oldTicket=s.wagers[0], queued=chip(s,id,c.sides[1]);
  const start={evId:id,...refs(c)}, lockCtx=gm("lock-once");
  act(s,"lockAndStart",start,lockCtx);
  fail(s,"retractWager",{id:oldTicket.id,...refs(c)},guest(observer),/closed/);
  const resultPayload={evId:id,...refs(c),winner:c.sides[0].key}, resultCtx=gm("winner-once");
  act(s,"recordContestWinner",resultPayload,resultCtx);
  const next=current(s,id);
  assert.deepEqual(next.match,[0,1]);
  assert.equal(next.phase,"betting-open");
  assert.equal(next.revision,c.revision+1);
  assert.equal(s.onDeck,id);
  fail(s,"placeWager",{wager:queued},guest(observer),/already moved on/);
  fail(s,"recordContestWinner",resultPayload,gm(),/already moved on/);
  const after=structuredClone(s);
  assert.equal(act(s,"recordContestWinner",resultPayload,resultCtx).extra.unchanged,true);
  assert.equal(act(s,"lockAndStart",start,lockCtx).extra.unchanged,true);
  assert.deepEqual(s,after);
  fail(s,"lockAndStart",start,gm(),/already moved on/);
  assert.equal(wagerMatchesContest(oldTicket,next),false);
  assert.equal(resolveWager(s,oldTicket,allEventsOf(s)).status,"lost");
});

test("the whole bracket runs one contest at a time and final podium must agree", () => {
  const s=bracket(), id="8ball", seen=[];
  while (current(s,id)) {
    const c=current(s,id); seen.push(c.match);
    fail(s,"recordContestWinner",{evId:id,...refs(c),winner:c.sides[0].key},gm(),/Lock betting/);
    lock(s,id);
    fail(s,"pickBracketWinner",{evId:id,r:c.match[0],m:c.match[1],teamIdx:c.sides[0].key},gm(),/Record it from the pill/);
    win(s,id,c.sides[0].key);
  }
  assert.deepEqual(seen,[[0,0],[0,1],[1,0],[1,1],[2,0]]);
  assert.equal(resolveEventLifecycle(s,event(s,id)).phase,"result-entry");
  const champion=s.brackets[id].rounds[2][0].winner;
  const winner=s.draws[id].teams[champion].players;
  const other=s.draws[id].teams.find(t=>!t.players.includes(winner[0])).players;
  fail(s,"saveResult",{evId:id,slots:[other]},gm(),/contest winner/);
  act(s,"saveResult",{evId:id,slots:[winner]});
});

test("heat winner is independent of multiple qualifiers and legacy advancement tickets keep their meaning", () => {
  const s=fresh(), id="beerio";
  fail(s,"announceEvent",{evId:id},gm(),/Set up heats/);
  act(s,"runStages",{evId:id,cfg:{kind:"heats",nGroups:3,advance:2,players:ROSTER}});
  act(s,"announceEvent",{evId:id});
  const c=current(s,id), [winner,runner]=c.sides;
  assert.equal(c.kind,"heat");
  const observer=ROSTER.find(p=>!c.players.includes(p));
  act(s,"placeWager",{wager:chip(s,id,runner)},guest(observer));
  fail(s,"placeWager",{wager:{...chip(s,id,runner),kind:"stage"}},guest(observer),/current contest/);
  s.wagers.push({id:"historic-advance",eventId:id,kind:"stage",stagesId:c.stagesId,group:0,pickKey:runner.key,stake:100,player:observer});
  lock(s,id);
  fail(s,"recordContestWinner",{evId:id,...refs(c),winner:winner.key},gm(),/2 qualifiers/);
  fail(s,"recordContestWinner",{evId:id,...refs(c),winner:winner.key,qualifiers:[runner.key,runner.key]},gm(),/2 qualifiers/);
  win(s,id,winner.key,[winner.key,runner.key]);
  assert.equal(resolveWager(s,s.wagers.find(w=>w.kind==="heat"),allEventsOf(s)).delta,-100);
  assert.equal(resolveWager(s,s.wagers.find(w=>w.id==="historic-advance"),allEventsOf(s)).delta,100);
  assert.equal(current(s,id).group,1);
  while (current(s,id)?.kind==="heat") {
    const next=current(s,id); lock(s,id); win(s,id,next.sides[0].key,next.sides.slice(0,2).map(side=>side.key));
  }
  assert.equal(current(s,id).kind,"stage-final");
  assert.equal(current(s,id).sides.length,6);
  const final=current(s,id); lock(s,id); win(s,id,final.sides[0].key);
  assert.equal(current(s,id),null);
  act(s,"saveResult",{evId:id,slots:[[final.sides[0].key]]});
});

test("legacy hydration preserves locked current match, skips completed advancement groups, and never guesses heat winners", () => {
  const old=bracket(); delete old.eventOps["8ball"].contest; delete old.eventOps["8ball"].contestRevision;
  old.v=8; old.onDeck=null; old.eventOps["8ball"].startedAt=50;
  old.brackets["8ball"].rounds[0][0].winner=3;
  const s=hydrateStoredState(old), c=current(s,"8ball");
  assert.equal(c.phase,"in-progress"); assert.equal(c.legacy,true); assert.equal(c.revision,0);
  assert.deepEqual(c.match,[0,1]);
  assert.equal(s.eventOps["8ball"].contest,undefined);
  assert.equal(resolveEventLifecycle(s,event(s,"8ball")).nextAction.type,"record-contest-winner");
  win(s,"8ball",c.sides[0].key);
  assert.equal(current(s,"8ball").phase,"betting-open");
  const heats=fresh(); heats.v=8;
  heats.stages.beerio={id:"old-stages",eventId:"beerio",kind:"heats",entrantType:"solo",advance:1,
    groups:[{name:"Heat 1",entrants:ROSTER.slice(0,4),through:[ROSTER[2]]},{name:"Heat 2",entrants:ROSTER.slice(4,8),through:[]}],finalWinner:null};
  heats.eventOps.beerio={startedAt:10};
  const hydrated=hydrateStoredState(heats);
  assert.equal(current(hydrated,"beerio").group,1);
  assert.equal(current(hydrated,"beerio").phase,"in-progress");
  assert.equal(hydrated.stages.beerio.groups[0].winner,undefined);
  const legacyFfa=fresh(); legacyFfa.eventOps.beerio={startedAt:10};
  assert.equal(current(legacyFfa,"beerio").kind,"ffa");
});

test("team pool announce is atomic, and prepared draws never count as live", () => {
  /* the slate has no pools event any more: Spikeball's pairs pools stay a
     supported shape */
  const s=withLegacyEvents(fresh(),["spike"]);
  act(s,"announceAndDraw",{evId:"spike",players:ROSTER.slice(0,12)});
  assert.equal(s.stages.spike.kind,"pools");
  assert.equal(current(s,"spike").kind,"heat");
  assert.equal(current(s,"spike").phase,"betting-open");
  assert.equal(s.stages.spike.groups[0].winner,null);
  const prepared=fresh();
  act(prepared,"runDraw",{evId:"8ball",players:ROSTER.slice(0,12)});
  assert.equal(current(prepared,"8ball").phase,"scheduled");
  fail(prepared,"lockAndStart",{evId:"8ball"},gm());
});

test("legacy winners without lifecycle stamps still block reopening or replacing the running competition", () => {
  const s=bracket(), id="8ball";
  s.eventOps={}; s.onDeck=null;
  s.brackets[id].rounds[0][0].winner=3;
  assert.equal(current(s,id).phase,"in-progress");
  fail(s,"setOnDeck",{id},gm(),/already started/);
  fail(s,"announceAndDraw",{evId:id,players:ROSTER.slice(0,12)},gm(),/already started/);
  fail(s,"runDraw",{evId:id,players:ROSTER.slice(0,12)},gm(),/already started/);
  fail(s,"clearDraw",{evId:id},gm(),/already started/);
});

test("frozen and poker gates reject a pending contest result before changing its facts", () => {
  const s=bracket(), id="8ball";
  lock(s,id);
  const c=current(s,id), payload={evId:id,...refs(c),winner:c.sides[0].key};
  s.frozen=true;
  fail(s,"recordContestWinner",payload,gm(),/frozen/);
  s.frozen=false; s.poker={id:"poker",startedAt:1};
  fail(s,"recordContestWinner",payload,gm(),/poker table/);
});

test("chip stacking/retraction is acknowledged and caps include open duel reservations in both directions", () => {
  const s=fresh(), id="putt", player=ROSTER[0];
  s.live=true;
  act(s,"announceEvent",{evId:id});
  const c=current(s,id), pick=c.sides[0];
  s.duels=[{id:"reserved",from:player,to:ROSTER[1],stake:400,status:"open",runs:{},ts:1}];
  const payload={wager:chip(s,id,pick)}, ctx=guest(player,"once");
  const placed=act(s,"placeWager",payload,ctx);
  assert.equal(act(s,"placeWager",payload,ctx).extra.unchanged,true);
  assert.equal(s.wagers[0].stake,100);
  fail(s,"placeWager",payload,guest(player),/Max 500/);
  fail(s,"sendDuel",{to:ROSTER[2],stake:100},guest(player),/Max 500/);
  fail(s,"retractWager",{id:placed.extra.wagerId},guest(player),/already moved on/);
  act(s,"retractWager",{id:placed.extra.wagerId,...refs(c)},guest(player));
  assert.equal(s.wagers.length,0);
  act(s,"placeWager",payload,guest(player));
  s.frozen=true;
  fail(s,"placeWager",payload,guest(player),/frozen/);
});

test("undo restores the prior contest locked at a fresh revision and keeps its wagers derived", () => {
  const s=bracket(), id="8ball", c=current(s,id), player=ROSTER[12];
  act(s,"placeWager",{wager:chip(s,id,c.sides[0])},guest(player));
  lock(s,id); win(s,id,c.sides[0].key);
  const ticket=structuredClone(s.wagers[0]), next=current(s,id), available=contestUndoAvailability(s,event(s,id));
  assert.equal(available.enabled,true);
  assert.equal(resolveWager(s,ticket,allEventsOf(s)).status,"won");
  const undo={evId:id,contestId:available.contestId,contestRevision:available.contestRevision}, ctx=gm("undo-once");
  act(s,"undoLastContest",undo,ctx);
  assert.equal(current(s,id).id,c.id);
  assert.equal(current(s,id).phase,"in-progress");
  assert.ok(current(s,id).revision>next.revision);
  assert.equal(s.onDeck,null);
  assert.deepEqual(s.wagers[0],ticket);
  assert.equal(resolveWager(s,ticket,allEventsOf(s)).status,"pending");
  const after=structuredClone(s);
  assert.equal(act(s,"undoLastContest",undo,ctx).extra.unchanged,true);
  assert.deepEqual(s,after);
  fail(s,"recordContestWinner",{evId:id,...refs(c),winner:c.sides[1].key},gm(),/already moved on/);
  win(s,id,c.sides[1].key);
  assert.equal(resolveWager(s,ticket,allEventsOf(s)).status,"lost");
});

test("undo returns next-contest chips, works after the next contest starts, and supports heat qualifiers/final", () => {
  /* Deliberate change: next-market chips and a started next contest no
     longer block a correction. The chips are voided in the same write and
     named before the tap. */
  const s=bracket(), id="8ball";
  const opening=current(s,id);
  lock(s,id); win(s,id,opening.sides[0].key);
  const c=current(s,id);
  act(s,"placeWager",{wager:chip(s,id,c.sides[0])},guest(ROSTER[12]));
  let undo=contestUndoAvailability(s,event(s,id));
  assert.equal(undo.enabled,true);
  assert.deepEqual(undo.refunds,[{player:ROSTER[12],stake:100}]);
  lock(s,id);
  undo=contestUndoAvailability(s,event(s,id));
  assert.equal(undo.enabled,true);
  const undone=act(s,"undoLastContest",{evId:id,contestId:undo.contestId,contestRevision:undo.contestRevision});
  assert.deepEqual(undone.extra.refunds,[{player:ROSTER[12],stake:100}]);
  assert.equal(s.wagers[0].status,"void");
  assert.equal(current(s,id).id,opening.id);
  assert.equal(current(s,id).phase,"in-progress");
  const h=fresh(), hid="beerio";
  act(h,"runStages",{evId:hid,cfg:{kind:"heats",nGroups:2,advance:2,players:ROSTER}});
  act(h,"announceEvent",{evId:hid});
  const first=current(h,hid); lock(h,hid); win(h,hid,first.sides[0].key,first.sides.slice(0,2).map(x=>x.key));
  undo=contestUndoAvailability(h,event(h,hid)); act(h,"undoLastContest",{evId:hid,...undo});
  assert.deepEqual(h.stages[hid].groups[0].through,[]);
  assert.equal(h.stages[hid].groups[0].winner,null);
  while(current(h,hid)) {
    const c=current(h,hid); if(c.phase==="betting-open")lock(h,hid);
    win(h,hid,c.sides[0].key,c.kind==="heat"?c.sides.slice(0,2).map(x=>x.key):undefined);
  }
  undo=contestUndoAvailability(h,event(h,hid)); assert.equal(undo.enabled,true);
  act(h,"undoLastContest",{evId:hid,...undo});
  assert.equal(current(h,hid).kind,"stage-final");
  const winner=current(h,hid).sides[0].key; win(h,hid,winner);
  act(h,"saveResult",{evId:hid,slots:[[winner]]});
  assert.match(contestUndoAvailability(h,event(h,hid)).blocker,/already posted/);
});
