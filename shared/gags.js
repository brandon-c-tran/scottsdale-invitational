/* Gags (Oct 8): the TV's bowling-alley cartoons (src/features/gags/). What
   the Worker needs of them: the kinds, rarest first, and the stand-in cast
   the QA console's test plays (qaGag writes state.gagTest). The gags
   themselves are derived on the TV from the record and never stored.
   Pure. */
import { computeStandings } from "./core.js";

export const GAG_KINDS = Object.freeze(["turkey", "strike", "gutter", "vultures"]);
/* what a test gutter ball costs */
export const GAG_TEST_AMOUNT = 1000;

/* A test's cast, from the board as it stands: the turkey is the leader,
   the strike the last place beating the leader (the underdog first), the
   gutter ball the second on the board for 1,000, the vultures last place.
   Null for an unknown kind or an empty board. */
export function gagTestCast(state, kind) {
  if (!GAG_KINDS.includes(kind)) return null;
  const rows = computeStandings(state || {});
  if (!rows.length) return null;
  const first = rows[0].player;
  const last = rows[rows.length - 1].player;
  const second = rows[1]?.player || first;
  if (kind === "turkey") return { players:[first] };
  if (kind === "strike") return { players:[last, last === first ? second : first] };
  if (kind === "gutter") return { players:[second], amount:GAG_TEST_AMOUNT };
  return { players:[last] };
}
