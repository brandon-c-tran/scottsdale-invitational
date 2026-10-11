import React from "react";
import { CAST, castGeometry } from "../cast/castGeometry.js";
import { CastChip } from "../cast/CastChip.jsx";
import { Dust, Emanata, SAGUARO, Saguaro, ThumbUp } from "../props/Props.jsx";
import { bitById } from "./registry.js";
import "./quicksand.css";

/* quicksand (loss, action): the chip stands on a patch of sand, and the
   sand starts to take it, slowly, rings going out. It looks down. A beat.
   It flails, grabs at the air, turns and reaches for the arm of a saguaro
   with everything it has: the fingers stop just short, shaking. They slip.
   It goes down until one glove is left up out of the sand, open. The
   glove closes to a thumbs up, and goes down slowly, straight, out of
   sight. One bubble.

   Everything of it is inside a box whose foot is the sand's surface, so
   whatever goes below the surface is gone; a lip of sand hugs it where it
   goes in. The stage's camera shoots it (the registry's camera, in this
   stage's world x: the chip at 860, the saguaro at 1250; the "glove"
   anchor is the last glove). */
const QS = bitById("quicksand").beats;
export const QS_STAGE = Object.freeze({ x:860, floor:CAST.floor, surface:934, saguaro:1340, lean:12 });
/* how far down it has gone at each beat (canvas px under the floor):
   slowly; the face still up through the reach; yanked under after the
   slip; then the glove down at one slow, steady speed to the end */
export const SINK = Object.freeze({ notice:26, flail:34, reach:84, slip:112, under:300, thumb:335, gone:366, end:480 });

const px = n => `${Math.round(n * 10) / 10}px`;
const move = ({ x, y }, deg = 0) => `translate(${px(x)}, ${px(y)}) rotate(${deg}deg)`;

/* the front glove's marks, from where it hangs: reaching for the arm (the
   open fingers turned toward it, held where the arm is while the rest of
   it sinks), slipping, and last, straight up over its head */
export function quicksandMarks(size = CAST.size) {
  const g = castGeometry(size);
  const k = size / CAST.size;
  const wrist = g.hands.r;
  /* the arm's elbow (the outside of its bend; the saguaro stands 6 px
     down the floor), and the open glove turned up toward it: its middle
     fingertip, 95 art px over the wrist, stops a hand's breadth short, down
     and in from the bend */
  const arm = { x:QS_STAGE.saguaro + SAGUARO.armX - SAGUARO.armW / 2 - QS_STAGE.x, y:SAGUARO.armY + SAGUARO.armW / 2 + 6 };
  const aim = 45, a = aim * Math.PI / 180;
  const finger = 95 * g.glove;
  const tip = { x:finger * Math.sin(a), y:-finger * Math.cos(a) };
  const gap = 34 * k;
  /* the whole of it leans toward the arm (quicksand.css qs-lean), so the
     glove is placed in the leaned body: turned the lean less, and its
     wrist found by turning the world back by the lean */
  const lean = QS_STAGE.lean * Math.PI / 180;
  const unlean = ({ x, y }) => ({ x:x * Math.cos(lean) + y * Math.sin(lean), y:-x * Math.sin(lean) + y * Math.cos(lean) });
  /* held at the arm while the rest of it goes down `sink`: it gets there
     120 ms after the reach beat, and holds until the slip */
  const reachAt = sink => {
    const at = unlean({ x:arm.x - gap - tip.x, y:arm.y + gap - tip.y - sink });
    return { x:at.x - wrist.x, y:at.y - wrist.y };
  };
  const there = SINK.reach + (SINK.slip - SINK.reach) * 120 / (QS.slip - QS.reach);
  const hold = reachAt(SINK.slip);
  const up = { x:40 * k - wrist.x, y:-330 * k - wrist.y };
  return { g, tilt:aim - QS_STAGE.lean, arm, reach:reachAt(there), hold, slip:{ x:hold.x - 18 * k, y:hold.y + 96 * k }, up,
    /* where the last glove goes down, in world x */
    gloveX:QS_STAGE.x + wrist.x + up.x };
}

/* the sand flicked up by the flailing: little puffs, low and wide */
const FLICK = Object.freeze([[-120, -50, 0.7], [-60, -86, 0.6], [70, -80, 0.62], [130, -44, 0.7]]);

export function Quicksand({ cast }) {
  const player = cast?.a?.[0];
  if (!player) return null;
  const { x, floor, surface, saguaro } = QS_STAGE;
  const m = quicksandMarks(CAST.size);
  const g = m.g;
  const front = [["rest", 0], ["open", QS.notice + 260], ["fist", QS.flail + 180], ["open", QS.flail + 280], ["fist", QS.flail + 470],
    ["open", QS.flail + 560]];
  const back = [["rest", 0], ["open", QS.notice + 300], ["fist", QS.flail + 90], ["open", QS.flail + 190], ["fist", QS.flail + 380],
    ["open", QS.flail + 480], ["fist", QS.reach + 120], ["open", QS.reach + 220]];
  const sink = Object.fromEntries(Object.entries(SINK).map(([name, depth]) => [`--s-${name}`, `translateY(${px(depth)})`]));
  const style = { ...sink, "--reach":move(m.reach, m.tilt), "--hold":move(m.hold, m.tilt), "--slip":move(m.slip, m.tilt + 12),
    "--up":move(m.up), "--up-low":move({ x:m.up.x, y:m.up.y + 30 }) };
  /* the thumbs up, hung where the front glove is and moved the same way */
  const thumb = <span className="qs-node qs-thumb" style={{ left:g.hands.r.x, top:g.hands.r.y }}>
    <span className="qs-node qs-thumb-in"><ThumbUp scale={g.glove} /></span>
  </span>;
  return (
    <div className="qs" style={style}>
      <span className="qs-node qs-saguaro" style={{ left:saguaro, top:floor + 6 }}><Saguaro reach={-1} /></span>
      {/* the patch of sand: dry round the edge, wet in the middle, rings going out */}
      <svg className="qs-patch" viewBox="-300 -50 600 100" width="600" height="100" style={{ left:x - 300, top:surface + 4 - 50 }} aria-hidden="true">
        <ellipse cx="0" cy="0" rx="292" ry="44" className="qs-sand" />
        <ellipse cx="0" cy="2" rx="196" ry="28" className="qs-wet" />
      </svg>
      {[[QS.sink, 0], [QS.notice - 200, 1], [QS.flail + 60, 2], [QS.flail + 300, 3], [QS.reach + 80, 4], [QS.under, 5], [QS.gone + 200, 6],
        [QS.bubble, 7]].map(([at, i]) => (
        <span key={i} className={`qs-node qs-ring${i >= 6 ? " is-small" : ""}`} style={{ left:i >= 5 ? m.gloveX : x, top:surface + 4, "--at":`${at}ms` }}>
          <svg viewBox="-200 -30 400 60" width="400" height="60" style={{ left:-200, top:-30 }} aria-hidden="true">
            <ellipse cx="0" cy="0" rx="190" ry="26" className="qs-ring-line" />
          </svg>
        </span>
      ))}
      {/* the chip, and everything of it below the surface gone */}
      <div className="qs-under">
        <CastChip player={player} x={x} y={floor} facing={0} shadow={false} className="qs-chip"
          hands={{ front, back }}>{thumb}</CastChip>
      </div>
      {/* the lip of sand where it goes in */}
      <span className="qs-node qs-lip" style={{ left:x, top:surface + 2 }}>
        <svg viewBox="-150 -20 300 30" width="300" height="30" style={{ left:-150, top:-20 }} aria-hidden="true">
          <path d="M-140,6 C-120,-10 -60,-17 0,-17 C60,-17 120,-10 140,6 Z" className="qs-lip-ink" />
          <path d="M-140,6 C-120,-10 -60,-17 0,-17 C60,-17 120,-10 140,6 Z" className="qs-lip-sand" />
        </svg>
      </span>
      {[0, 1, 2].map(i => <Dust key={i} className="qs-flick" at={QS.flail + 120 + i * 210} puffs={FLICK} spread={0.9} size={0.55}
        style={{ left:x + (i - 1) * 40, top:surface - 2 }} />)}
      {/* one bubble, where the glove went */}
      <span className="qs-node qs-bubble" style={{ left:m.gloveX, top:surface - 4 }}>
        <span className="qs-node qs-bubble-ball">
          <svg viewBox="-24 -24 48 48" width="48" height="48" style={{ left:-24, top:-24 }} aria-hidden="true">
            <circle r="15" className="qs-bubble-ink" /><circle r="15" className="qs-bubble-skin" />
            <path d="M-8,-6 A9,9 0 0 1 -2,-10" className="qs-bubble-shine" />
          </svg>
        </span>
        <span className="qs-node qs-pop"><Emanata rays={POP} width={6} scale={0.8} color="var(--bit-sand)" /></span>
      </span>
    </div>
  );
}
/* the bubble's pop: short strokes all round */
const POP = Object.freeze([[-90, 18, 34], [-30, 18, 34], [30, 18, 34], [90, 18, 30], [150, 18, 34], [210, 18, 34]]);

/* the camera's anchors: the last glove, over the spot it goes down */
Quicksand.anchors = () => ({ glove:Math.round(quicksandMarks(CAST.size).gloveX) });
