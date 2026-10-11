import React from "react";
import { CAST, castGeometry, clusterLayout } from "../cast/castGeometry.js";
import { CastSide, Swaps } from "../cast/CastChip.jsx";
import { DUST_LOW, Dust, Gleam, Plinth, Wren } from "../props/Props.jsx";
import { bitById } from "./registry.js";
import "./statue.css";

/* statue (win, desert): the winner on the desert floor. A little crouch,
   then the pose: one finger thrust at the sky, a fist on its hip, chin up.
   A sheen runs down it and it is gold (a gold copy of the cast revealed
   top to bottom over the live one; a sepia-gold filter turns the photo,
   the chip and the gloves to metal and leaves the ink). A stone plinth
   grinds up out of the ground under it and lifts it. A cactus wren flaps
   in, lands on its head, pecks it once (tink), settles and fluffs up into
   a ball. Then the raised finger slowly droops.

   The plinth is cut from the session's painting (class "tv-desert" with
   data-phase) and rises out of a cut at the floor, so it comes up out of
   the ground. A side of more: all of it in gold on one wide plinth, the
   bird on the lead. */
const ST = bitById("statue").beats;
export const ST_STAGE = Object.freeze({ x:900, floor:CAST.floor, lift:170 });

const r1 = n => Math.round(n * 10) / 10;
const px = n => `${r1(n)}px`;

export function statueStaging(n = 1) {
  const l = clusterLayout(n, { dir:1 });
  const k = l.size / CAST.size;
  const g = castGeometry(l.size);
  const span = (l.shown - 1) * l.step;
  const lead = r1(ST_STAGE.x - span / 2);
  const F = ST_STAGE.floor;
  const plinth = Math.round(span + l.size * 1.3);
  /* the box the gold sweeps down: from over the raised finger to the shoes */
  const wipeTop = Math.round(F + g.top - l.size * 0.85), wipeH = Math.round(F + 24 - wipeTop);
  /* the bird's perch: the top of the lead's chip, once lifted */
  const perch = { x:r1(lead - l.size * 0.04), y:r1(F - ST_STAGE.lift + g.top + l.size * 0.035) };
  return { l, k, g, span, lead, F, plinth, wipeTop, wipeH, perch,
    minX:Math.round(lead - l.size * 1.2), maxX:Math.round(lead + span + l.size * 1.2 + (l.more ? 110 : 0)) };
}

/* the wren's flight, then its perch: flap flap flap, perched, fluffed */
const flight = [0, 1, 2, 3, 4].map(i => [i % 2 ? "flap" : "fly", ST.wren + i * 76]);

export function Statue({ cast, phase = "sap" }) {
  const a = cast?.a || [];
  const s = statueStaging(a.length || 1);
  const { l, k, F } = s;
  const hands = { front:[["rest", 0], ["point", ST.pose]], back:[["rest", 0], ["fist", ST.pose]] };
  const side = (cls, gold) => <CastSide players={a} x={s.lead} y={F} dir={1} facing={1} className={`st-cast ${cls}`}
    lead={{ hands, shadow:!gold }} mates={{ hands, shadow:!gold }} />;
  const style = {
    "--raise":`translate(${px(-l.size * 0.2)}, ${px(-l.size * 0.56)})`, "--hip-l":`translate(${px(-l.size * 0.035)}, ${px(l.size * 0.05)})`,
    "--sag":`translate(${px(-l.size * 0.06)}, ${px(-l.size * 0.3)})`,
    "--lift":`translateY(${px(-ST_STAGE.lift)})`, "--sink":`translateY(${px(ST_STAGE.lift + 12)})`,
    "--wipe":`translateY(${px(-s.wipeH)})`, "--wipe-in":`translateY(${px(s.wipeH)})`, "--sheen":px(l.size * 1.2),
  };
  return (
    <div className="st tv-desert" data-phase={phase} style={style}>
      {/* the plinth, rising out of the ground (cut off at the floor) */}
      <div className="st-ground" style={{ height:F + 6 }}>
        <span className="st-node st-plinth" style={{ left:ST_STAGE.x, top:F + 6 }}>
          <Plinth width={s.plinth} height={ST_STAGE.lift + 6} />
        </span>
      </div>
      <Dust className="st-dust" at={ST.rise + 40} puffs={DUST_LOW} spread={s.plinth / 520} size={0.8} style={{ left:ST_STAGE.x, top:F - 4 }} />
      <Dust className="st-dust is-thump" at={ST.thump} puffs={DUST_LOW} spread={s.plinth / 460} size={0.7} style={{ left:ST_STAGE.x, top:F - 4 }} />
      <div className="st-rise">
        {side("st-live", false)}
        {/* the gold, swept down over it */}
        <div className="st-wipe" style={{ top:s.wipeTop, height:s.wipeH }}>
          <div className="st-wipe-in" style={{ top:-s.wipeTop }}>
            <div className="st-gold">{side("st-metal", true)}</div>
          </div>
        </div>
        {/* the sheen running down each chip, and a glint off the gold */}
        {a.slice(0, l.shown).map((p, i) => {
          const cx = s.lead + l.xs[i], cy = F + s.g.center.y;
          return <React.Fragment key={p}>
            <span className="st-shine" style={{ left:cx - l.size / 2, top:cy - l.size / 2, width:l.size, height:l.size, "--i":i }}>
              <span className="st-shine-band" /></span>
            <span className="st-node st-glint" style={{ left:cx - l.size * 0.3, top:cy - l.size * 0.32, "--i":i }}><Gleam r={36 * k} /></span>
          </React.Fragment>;
        })}
        {/* the wren: in from the left, onto the head; it pecks, it fluffs up */}
        <span className="st-node st-wren" style={{ left:s.perch.x, top:s.perch.y + ST_STAGE.lift }}>
          <span className="st-node st-wren-x"><span className="st-node st-wren-y"><span className="st-node st-wren-peck">
            <span className="st-node st-wren-face">
              <Swaps layers={[...flight.map(([pose, ms]) => [<Wren pose={pose} scale={1.15 * k} />, ms]),
                [<Wren pose="perch" scale={1.15 * k} />, ST.land], [<Wren pose="fluff" scale={1.15 * k} />, ST.fluff]]} />
            </span>
          </span></span></span>
        </span>
      </div>
    </div>
  );
}

/* the camera's anchors: "chip" the side, "top" the bird and the finger
   once it is up on the plinth; minX to maxX the span */
Statue.anchors = cast => {
  const s = statueStaging(cast?.a?.length || 1);
  return { chip:Math.round(s.lead + s.span / 2), top:Math.round(s.lead + s.l.size * 0.05), minX:s.minX, maxX:s.maxX };
};
