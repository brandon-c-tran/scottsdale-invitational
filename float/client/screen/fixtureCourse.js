/* A fixture river for the screen's mock (float/PROTOCOL.md "The course data"),
   in the contract's exact shape: the Salt River at night in four legs, built
   once from a turtle path so it bends like a real river.

     1 Put-in          wide and gentle, a calm pool to drink in, a riffle out
     2 The Narrows     canyon walls close in, rocks mid-river, fast water
     3 Whirlpool Bend  a whirlpool inside a big bend, then a split around an
                       island (fast and rocky left, calm and longer right)
     4 The Drop        rapids, the falls (a 7 m drop in elev), calm water to
                       the takeout bar

   The engine's float/shared/course.js is the real river; the screen builds
   whatever course the room sends, so nothing here is special-cased. */

const STEP = 4;

/* [length m, turn degrees (+ is left, counter-clockwise), width at the end m] */
const SEGMENTS = [
  /* 1 Put-in */
  [40, 0, 30], [70, 35, 34], [60, 0, 44], [60, -50, 32], [40, 0, 28],
  /* 2 The Narrows */
  [40, -10, 20], [70, 40, 15], [60, -40, 14], [60, 20, 16], [40, 0, 22],
  /* 3 Whirlpool Bend */
  [50, 0, 26], [110, 120, 34], [30, -20, 56], [70, 30, 60], [50, 0, 28],
  /* 4 The Drop */
  [60, -30, 24], [50, 25, 20], [14, 0, 22], [40, 0, 34], [80, 30, 40], [30, 0, 46],
];

const smooth = t => t * t * (3 - 2 * t);
const round = (value, places = 2) => Math.round(value * 10 ** places) / 10 ** places;

function centreline() {
  const line = [];
  let x = 0, y = 0, heading = 0, width = SEGMENTS[0][2];
  line.push([x, y, width]);
  for (const [length, turn, endWidth] of SEGMENTS) {
    const n = Math.round(length / STEP);
    const from = width;
    for (let k = 1; k <= n; k++) {
      heading += (turn * Math.PI / 180) / n;
      x += Math.cos(heading) * (length / n);
      y += Math.sin(heading) * (length / n);
      width = from + (endWidth - from) * smooth(k / n);
      line.push([round(x), round(y), round(width, 1)]);
    }
  }
  return line;
}

const line = centreline();

/* a point s metres down the line, `lateral` metres to the left of it */
function along(s, lateral = 0) {
  let acc = 0;
  for (let i = 1; i < line.length; i++) {
    const [x0, y0] = line[i - 1], [x1, y1] = line[i];
    const seg = Math.hypot(x1 - x0, y1 - y0);
    if (acc + seg >= s || i === line.length - 1) {
      const t = Math.min(1, Math.max(0, (s - acc) / seg));
      const tx = (x1 - x0) / seg, ty = (y1 - y0) / seg;
      const w = line[i - 1][2] + (line[i][2] - line[i - 1][2]) * t;
      return { x:x0 + (x1 - x0) * t - ty * lateral, y:y0 + (y1 - y0) * t + tx * lateral, w };
    }
    acc += seg;
  }
  return { x:0, y:0, w:20 };
}

/* a rock `side` of the way across (-1 right bank .. 1 left bank) */
const rock = (s, side, r) => {
  const p = along(s);
  const at = along(s, side * p.w / 2);
  return [round(at.x), round(at.y), r];
};

const rocks = [
  /* Put-in: a few in the riffle on the way out */
  rock(212, 0.35, 1.1), rock(226, -0.25, 1.4), rock(238, 0.1, 0.9),
  /* The Narrows: mid-river, alternating */
  rock(298, -0.2, 1.3), rock(316, 0.3, 1.6), rock(334, -0.05, 1.1), rock(352, 0.35, 1.2), rock(368, -0.3, 1.7),
  rock(392, 0.1, 1.4), rock(404, -0.35, 1.0), rock(418, 0.32, 1.3), rock(446, -0.15, 1.5), rock(468, 0.25, 1.1),
  rock(488, -0.3, 1.2), rock(508, 0.05, 1.6),
  /* Whirlpool Bend: the outer bank */
  rock(620, -0.6, 1.8), rock(660, -0.55, 1.4),
  /* the split's left channel: fast and rocky */
  rock(748, 0.58, 1.0), rock(758, 0.7, 1.3), rock(768, 0.6, 0.9), rock(778, 0.74, 1.1), rock(788, 0.62, 1.2),
  /* The Drop: rapids, then two rocks either side of the lip */
  rock(878, 0.2, 1.2), rock(890, -0.3, 1.5), rock(902, 0.35, 1.0), rock(914, -0.1, 1.3), rock(924, 0.3, 1.6),
  rock(934, -0.35, 1.1), rock(944, 0.05, 1.4), rock(952, -0.25, 1.0), rock(961, 0.82, 1.6), rock(961, -0.84, 1.8),
];

/* the split: an island shifted left, so the left channel is the narrow one */
const island = (s, lateral, r) => {
  const at = along(s, lateral);
  return [round(at.x), round(at.y), r];
};
const islands = [island(750, 4, 7), island(765, 5, 10), island(780, 4, 7)];

export const FIXTURE_COURSE = Object.freeze({
  id:"salt",
  line,
  flow:[[0, 0.5], [110, 0.25], [170, 0.5], [205, 1.4], [245, 0.8], [270, 1.8], [385, 2.6], [425, 2.0], [540, 1.2],
    [615, 1.0], [700, 1.6], [730, 1.2], [800, 1.4], [850, 2.4], [958, 3.0], [963, 5.0], [969, 5.0], [976, 1.0],
    [1020, 0.5], [1124, 0.2]],
  elev:[[0, 22], [270, 21], [385, 20.6], [425, 19.6], [540, 19], [850, 17.8], [958, 16.4], [963, 16.3], [964, 15.9],
    [965.5, 14], [967, 11.4], [968.3, 9.7], [969.5, 9.2], [976, 9], [1124, 8.6]],
  rocks,
  islands,
  zones:[
    { k:"pool", s0:110, s1:170 },
    { k:"riffle", s0:205, s1:245 },
    { k:"narrows", s0:280, s1:530 },
    { k:"riffle", s0:385, s1:425 },
    { k:"eddy", s0:470, s1:495 },
    { k:"whirlpool", s0:615, s1:675 },
    { k:"split", s0:728, s1:808 },
    { k:"riffle", s0:870, s1:958 },
    { k:"drop", s0:958, s1:976 },
    { k:"pool", s0:976, s1:1020 },
    { k:"bar", s0:1070, s1:1124 },
  ],
  legs:[
    { id:"putin", name:"Put-in", s0:0, s1:270, grid:18, finish:256 },
    { id:"narrows", name:"The Narrows", s0:270, s1:540, grid:288, finish:528 },
    { id:"whirlpool", name:"Whirlpool Bend", s0:540, s1:850, grid:558, finish:836 },
    { id:"drop", name:"The Drop", s0:850, s1:1124, grid:868, finish:1092 },
  ],
});

export default FIXTURE_COURSE;
