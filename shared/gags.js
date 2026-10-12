/* Gags (Oct 8; the bits since Oct 10, src/features/gags/): the TV's comic
   moments. What the Worker needs of them: the shapes a moment comes in,
   each shape's bits (the registry, src/features/gags/bits/registry.js,
   holds their drawings and timings; tests/gags.test.mjs holds the lists
   equal), which of them are team bits, and the stand-in cast the QA
   console's test plays (qaGag writes state.gagTest). The moments
   themselves are derived on every screen from the record and never
   stored. Pure. */
import { computeStandings } from "./core.js";

/* the moment shapes, as the registry names them */
export const GAG_SHAPES = Object.freeze(["versus", "win", "loss"]);
/* each shape's bits, in the registry's order */
export const GAG_BITS = Object.freeze({
  versus:Object.freeze(["quickdraw", "springglove", "butte", "dominoes", "tugofwar", "slowmowalk"]),
  win:Object.freeze(["explosionwalk", "toohype", "sunset", "statue", "pyramid", "teamphoto", "victorylap"]),
  loss:Object.freeze(["anvil", "roadrunner", "dontlookback", "quicksand", "dynamite", "vulture"]),
});
/* the team bits (Oct 12): a side of 3 or more (the registry's TEAM_MIN),
   cast with a whole team */
export const GAG_TEAM_BITS = Object.freeze(["dominoes", "tugofwar", "slowmowalk", "pyramid", "teamphoto", "victorylap"]);
export const GAG_TEAM_MAX = 7;
export const gagShapeOf = bit => GAG_SHAPES.find(shape => GAG_BITS[shape].includes(bit)) || null;
export const isTeamGag = bit => GAG_TEAM_BITS.includes(bit);
/* what a test's losing bet costs */
export const GAG_TEST_AMOUNT = 1000;
/* a team test's winning side (the top of the board): a volleyball team */
export const GAG_TEST_TEAM = 3;

/* A test's cast, from the board as it stands: a versus is last place
   beating the leader (the underdog first), a win the leader, a loss last
   place. A team bit's (`team`) is a whole team: a versus the bottom of
   the board beating the top (the room split as the full court splits
   it, 7 v 6, the underdogs from last place up), a win the top three. Null
   for an unknown shape or an empty board. */
export function gagTestCast(state, shape, { team = false } = {}) {
  if (!GAG_SHAPES.includes(shape)) return null;
  const rows = computeStandings(state || {});
  if (!rows.length) return null;
  const order = rows.map(row => row.player);
  const first = order[0];
  const last = order[order.length - 1];
  const second = order[1] || first;
  if (team && shape === "versus" && order.length > 1) {
    const top = Math.min(GAG_TEAM_MAX, Math.ceil(order.length / 2));
    return { players:order.slice(top).reverse().slice(0, GAG_TEAM_MAX), beaten:order.slice(0, top) };
  }
  if (team && shape === "win") return { players:order.slice(0, GAG_TEST_TEAM), beaten:[] };
  if (shape === "versus") return { players:[last], beaten:[last === first ? second : first] };
  if (shape === "win") return { players:[first], beaten:[] };
  return { players:[last], beaten:[] };
}
