/* Cross-cutting checks for fixes that landed in separate areas and only meet
   at the broadcast boundary. */
import test from "node:test";
import assert from "node:assert/strict";
import { EMPTY_STATE, ROSTER } from "../shared/core.js";
import { publicState, createStateSerializer } from "../worker/publicState.js";

const [evan, khoa, sahil] = ROSTER;

function stateWithHalfPlayedDuel() {
  const state = structuredClone(EMPTY_STATE);
  state.duels = [
    { id:"half", from:evan, to:khoa, stake:100, status:"open", consent:true, acceptedAt:1,
      runs:{ [evan]:{ ms:190, foul:false, ts:2 } }, ts:1 },
    { id:"done", from:evan, to:sahil, stake:100, status:"open",
      runs:{ [evan]:{ ms:190 }, [sahil]:{ ms:220 } }, ts:1 },
  ];
  return state;
}

test("an undecided duel time never reaches another viewer's frame", () => {
  const state = stateWithHalfPlayedDuel();
  for (const viewer of [{ player:khoa }, { player:null }, { player:sahil, isGm:true }]) {
    const view = publicState(state, viewer);
    assert.deepEqual(view.duels[0].runs, { [evan]:{ played:true } }, JSON.stringify(viewer));
    assert.equal(view.duels[1].runs[sahil].ms, 220, "settled duels keep both times");
  }
  assert.equal(publicState(state, { player:evan }).duels[0].runs[evan].ms, 190, "the runner sees their own time");
});

test("the per-viewer serializer applies the same duel redaction", () => {
  const state = stateWithHalfPlayedDuel();
  const serialize = createStateSerializer(state);
  const frame = JSON.parse(serialize({ player:khoa }));
  const duels = frame.duels ?? frame.state?.duels;
  assert.ok(Array.isArray(duels), "frame carries duels");
  assert.deepEqual(duels[0].runs, { [evan]:{ played:true } });
  assert.equal(JSON.stringify(frame).includes('"ms":190,"foul"'), false);
});
