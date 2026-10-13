import React from "react";
import { CAST, RIG } from "../cast/castGeometry.js";
import { CastChip } from "../cast/CastChip.jsx";
import { bitById } from "./registry.js";
import "./pyramid.css";

const PY = bitById("pyramid").beats;

/* pyramid (team, win, slapstick): the team stands in a row facing the
   room. The middle of the row shuffles together into the base and
   braces; the rest bounce on their toes to psych up and hop up onto
   shoulders one after another, the top last, the rows under it giving
   under its landing. The top wobbles, wobbles (the row under it leaning
   against it), holds dead still... and one glove comes up: thumbs up.

   The rows (PY_ROWS) are a cheer pyramid's: the base widest, each chip up
   standing on the two under it (its shoes in the dip between their
   rims, its gloves on their heads), a single on one's head where the rows
   go three to one, and a seventh up on the top's head (discs can't do a
   4-2-1: a top across two middles a gap apart drops through to the base).
   Every glove is its own chip's: the base keeps its hands behind its
   own back (an end chip's outer glove hangs free), the middles' rest on
   the heads they stand on, the top's are out for balance. The pyramid
   stands over the middle of the base's start places, so the base only
   ever shuffles in. The chips are sized from the pyramid's height, so the
   tallest keeps its top under the lettering at the camera's closest. */
export const PY_STAGE = Object.freeze({ mid:960, floor:CAST.floor, max:240,
  /* the start row's spacing, the base's, in chips */
  line:1.3, step:1.1,
  /* the screen the pyramid may fill, floor to just under the lettering,
     at the closest zoom the camera takes (the registry's wobble move) */
  room:660, zoom:1.45,
  /* how high over the higher end a hop arcs, in chips */
  arc:0.45 });
/* the climbers' landings: the last up always lands on PY.top, the ones
   before it on the beats before (a smaller team's bounce in place on them) */
export const PY_LANDS = Object.freeze([PY.hop0, PY.hop1, PY.hop2, PY.top]);

/* the rows from the bottom; each row's chips stand on these of the row
   under (one index: on its head; two: in the dip between them) */
export const PY_ROWS = Object.freeze({
  1:[[1]], 2:[[1], [1]], 3:[[2], [1]], 4:[[3], [1]], 5:[[3], [2]], 6:[[3], [2], [1]], 7:[[3], [2], [1], [1]],
});
function supportsOf(below, count) {
  if (below === 1) return [[0]];
  if (count === below - 1) return Array.from({ length:count }, (_, k) => [k, k + 1]);
  if (below === 3 && count === 1) return [[1]];
  if (below === 4 && count === 2) return [[0, 1], [2, 3]];
  return Array.from({ length:count }, (_, k) => [Math.min(k, below - 1)]);
}

const CY = RIG.lift + 0.5;
/* where a shoe `dx` from a support's middle stands on its rim */
const rimAt = dx => CY + Math.sqrt(Math.max(0, 0.25 - dx * dx));

/* the pyramid in chip units (x from its middle, y up from the floor):
   every chip's spot, its feet's height, how far its shoes spread, what it
   stands on, and the order the climbers go up */
export function pyramidShape(count = 3) {
  const n = Math.max(1, Math.min(7, Math.floor(Number(count) || 1)));
  const rows = PY_ROWS[n].map(([k]) => k);
  const spots = [];
  rows.forEach((k, r) => {
    if (!r) {
      for (let j = 0; j < k; j++) spots.push({ row:0, j, x:(j - (k - 1) / 2) * PY_STAGE.step, y:0, split:0, on:[] });
      return;
    }
    const below = spots.filter(spot => spot.row === r - 1);
    supportsOf(below.length, k).forEach((on, j) => {
      const sup = on.map(i => below[i]);
      const x = sup.reduce((sum, spot) => sum + spot.x, 0) / sup.length;
      const half = sup.length > 1 ? Math.abs(sup[1].x - sup[0].x) / 2 : 0;
      /* the shoes spread to land on the rims either side, three tenths in */
      const shoe = sup.length > 1 ? Math.max(RIG.shoeX, half - 0.3) : RIG.shoeX;
      const y = sup[0].y + rimAt(sup.length > 1 ? half - shoe : shoe);
      spots.push({ row:r, j, x, y, split:Math.max(0, shoe - RIG.shoeX), on:sup.map(spot => spots.indexOf(spot)) });
    });
  });
  const top = spots[spots.length - 1];
  return { n, rows, spots, height:top.y + RIG.lift + 1, base:rows[0] };
}

/* the start row, who takes which spot (the base the middle of the row,
   the climbers the nearest free spot, in hop order), where the pyramid
   stands (over the base's start places) and the climbers' landings */
export function pyramidStaging(count = 3) {
  const shape = pyramidShape(count);
  const { n, spots, base } = shape;
  const size = Math.round(Math.min(PY_STAGE.max, PY_STAGE.room / (shape.height * PY_STAGE.zoom)));
  const line = Array.from({ length:n }, (_, k) => (k - (n - 1) / 2) * PY_STAGE.line);
  const first = Math.floor((n - base) / 2);
  const cx = (line[first] + line[first + base - 1]) / 2;
  shape.spots.forEach(spot => { spot.x += cx; });
  const slot = new Array(n).fill(-1);
  for (let j = 0; j < base; j++) slot[first + j] = j;
  const free = line.map((x, k) => k).filter(k => slot[k] < 0);
  const order = [];
  spots.slice(base).forEach((spot, h) => {
    const best = free.reduce((pick, k) => pick < 0 || Math.abs(line[k] - spot.x) < Math.abs(line[pick] - spot.x) ? k : pick, -1);
    free.splice(free.indexOf(best), 1);
    slot[best] = base + h;
    order.push(best);
  });
  const lands = PY_LANDS.slice(PY_LANDS.length - order.length);
  const px = u => Math.round(PY_STAGE.mid + u * size);
  const reach = 0.55 + 0.3;
  /* the start row, the base, and the top's balance gloves past a narrow base */
  const topX = spots[spots.length - 1].x;
  const minU = Math.min(line[0] - reach, spots[0].x - reach, topX - 1.15);
  const maxU = Math.max(line[n - 1] + reach, spots[base - 1].x + reach, topX + 1.15);
  return { ...shape, size, line, slot, order, lands, px, cx:px(cx), minX:px(minU), maxX:px(maxU) };
}

const ms = n => `${Math.round(n)}ms`;
const len = n => `${Math.round(n * 10) / 10}px`;

export function Pyramid({ cast }) {
  const team = (cast?.a || []).slice(0, 7);
  const s = pyramidStaging(team.length || 1);
  const { size, spots, base } = s;
  const floor = PY_STAGE.floor;
  const topIndex = spots.length - 1;
  /* the chips, drawn row by row so each one up stands in front of its supports */
  const cast_ = team.map((player, k) => ({ player, k, spot:spots[s.slot[k]], at:s.slot[k] }))
    .sort((p, q) => p.at - q.at);
  return (
    <div className="py" style={{ "--tuck":len(size * RIG.handX), "--bob":len(-size * 0.18), "--on-x":len(size * 0.25),
      "--on-y":len(size * 0.32), "--bal-x":len(-size * 0.08), "--bal-y":len(-size * 0.12), "--thumb-y":len(-size * 0.42) }}>
      {cast_.map(({ player, k, spot, at }) => {
        const solo = spots.length === 1;
        const climb = s.order.indexOf(k);
        /* a team of one hops in place onto the top of its own pyramid */
        const land = climb >= 0 ? s.lands[climb] : solo ? PY.top : null;
        /* a single top has its gloves out for balance; a top row of two
           (a team of five) keeps them on the heads under it, wobbles as
           one, and its outer glove gives the thumbs up */
        const crown = spot.row && spot.row === s.rows.length - 1 && s.rows[spot.row] > 1;
        const isTop = at === topIndex && !crown;
        const kind = isTop ? (spot.row ? "is-top" : "is-base is-top") : spot.row === 0 ? "is-base"
          : crown ? `is-mid is-crown${at === topIndex ? " is-thumb" : ""}` : "is-mid";
        const dx = (spot.x - s.line[k]) * size, dy = -spot.y * size;
        /* practice bounces at the hop beats before its own */
        const bounces = land === null ? 0 : PY_LANDS.indexOf(land);
        /* the base's end chips let their outer glove hang free */
        const end = solo || spot.row ? null : base > 1 ? (spot.j === 0 ? "l" : spot.j === base - 1 ? "r" : null) : "both";
        const style = {
          "--dx":len(dx), "--dy":len(dy), "--arc":len(-(spot.y / 2 + PY_STAGE.arc) * size),
          "--land":ms(land ?? PY.top), "--bounces":String(bounces), "--split":len(spot.split * size),
        };
        const hands = isTop || at === topIndex ? { l:"flat", r:[["flat", 0], ["thumb", PY.thumb]] } : spot.row ? "flat" : "rest";
        return <CastChip key={player} player={player} size={size} x={s.px(s.line[k])} y={floor} facing={0}
          className={`py-chip ${kind}${land !== null ? " is-climber" : ""}${end ? ` is-end-${end}` : ""}`} style={style} hands={hands} />;
      })}
    </div>
  );
}

/* the camera's anchors: the pyramid's middle ("top", where its top
   stands), and the start row and the pyramid's span */
Pyramid.anchors = cast => {
  const s = pyramidStaging(Math.min(7, cast?.a?.length || 1));
  return { mid:Math.round((s.minX + s.maxX) / 2), top:s.cx, minX:s.minX, maxX:s.maxX };
};
