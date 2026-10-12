/* Gags (Oct 8; the bits since Oct 10, src/features/gags/): the TV's comic
   moments. What the Worker needs of them: the shapes a moment comes in,
   each shape's bits (the registry, src/features/gags/bits/registry.js,
   holds their drawings and timings; tests/gags.test.mjs holds the two
   lists equal), and the stand-in cast the QA console's test plays (qaGag
   writes state.gagTest). The moments themselves are derived on every
   screen from the record and never stored. Pure. */
import { computeStandings } from "./core.js";

/* the moment shapes, as the registry names them */
export const GAG_SHAPES = Object.freeze(["versus", "win", "loss"]);
/* each shape's bits, in the registry's order */
export const GAG_BITS = Object.freeze({
  versus:Object.freeze(["quickdraw", "springglove", "butte"]),
  win:Object.freeze(["explosionwalk", "toohype", "sunset", "statue"]),
  loss:Object.freeze(["anvil", "roadrunner", "dontlookback", "quicksand", "dynamite", "vulture"]),
});
export const gagShapeOf = bit => GAG_SHAPES.find(shape => GAG_BITS[shape].includes(bit)) || null;
/* what a test's losing bet costs */
export const GAG_TEST_AMOUNT = 1000;

/* A test's cast, from the board as it stands: a versus is last place
   beating the leader (the underdog first), a win the leader, a loss last
   place. Null for an unknown shape or an empty board. */
export function gagTestCast(state, shape) {
  if (!GAG_SHAPES.includes(shape)) return null;
  const rows = computeStandings(state || {});
  if (!rows.length) return null;
  const first = rows[0].player;
  const last = rows[rows.length - 1].player;
  const second = rows[1]?.player || first;
  if (shape === "versus") return { players:[last], beaten:[last === first ? second : first] };
  if (shape === "win") return { players:[first], beaten:[] };
  return { players:[last], beaten:[] };
}
