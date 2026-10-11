import React from "react";
import { CAST, castGeometry } from "../cast/castGeometry.js";
import { CastChip, GloveArt, ShoeArt } from "../cast/CastChip.jsx";
import { DUST_FAN, DUST_LOW, DirtMound, Dust, SpeedLines } from "../props/Props.jsx";
import { bitById } from "./registry.js";
import "./toohype.css";

const TH = bitById("toohype").beats;

/* toohype (win, slapstick): the winner bounces on the spot, fists
   pumping, each bounce higher than the last. The fourth winds all the way
   down and goes straight up out of the top of the frame, right out of its
   shoes, which stay on the floor. The shoes alone, for a beat. It comes
   back down, misses them, and drives into the ground up to its middle,
   quivering. A glove comes up out of the dirt beside it: thumbs up. The
   shoes turn, and walk over to it on their own.

   Below the floor nothing shows (.th-ground clips at the floor's front
   edge), so whatever goes into the ground is buried. The rig's own shoes
   are hidden; the scene draws a pair that bounces with it and stays when
   it goes. A pair of winners bounces side by side and misses outward,
   each pair of shoes walking off to its own. The stage's camera shoots
   it (the registry's camera); the scene names its anchors. */
export const TH_STAGE = Object.freeze({ mid:960, solo:800, floor:CAST.floor, cut:944, miss:340, plant:84, gap:10, mound:0.8 });
const HOPS = Object.freeze([44, 104, 212]);

const r1 = n => Math.round(n * 10) / 10;
const px = n => `${r1(n)}px`;

/* each winner's spot: where it bounces, where it comes down (missing its
   shoes, outward), how far its shoes walk to it */
export function hypeStaging(n = 1) {
  const shown = Math.max(1, Math.min(2, Math.floor(Number(n) || 1)));
  const size = shown > 1 ? 210 : CAST.size;
  const k = size / CAST.size;
  const g = castGeometry(size);
  const shoeX = g.shoes.r.x;
  const members = Array.from({ length:shown }, (_, i) => {
    const dir = shown === 1 ? 1 : i === 0 ? -1 : 1;
    const x0 = shown === 1 ? TH_STAGE.solo : TH_STAGE.mid + (i === 0 ? -1 : 1) * 0.5 * size;
    const miss = TH_STAGE.miss * k * (shown > 1 ? 0.9 : 1);
    const x1 = x0 + dir * miss;
    /* the near shoe stops short of the dirt round it */
    const walk = Math.round(miss - 0.55 * size - TH_STAGE.gap * k - shoeX);
    return { i, dir, x0, x1, walk, glove:x1 + dir * 0.6 * size };
  });
  /* the span: its fists out to the side as it bounces, the glove beside
     where it comes down */
  const lefts = members.map(m => m.dir < 0 ? m.glove - 0.45 * size : m.x0 - size);
  const rights = members.map(m => m.dir > 0 ? m.glove + 0.45 * size : m.x0 + size);
  const minX = Math.round(Math.min(...lefts)), maxX = Math.round(Math.max(...rights));
  return { shown, more:Math.max(0, (Number(n) || 1) - shown), size, k, g, members, minX, maxX, mid:Math.round((minX + maxX) / 2),
    shoes:Math.round(members.reduce((sum, m) => sum + m.x0, 0) / shown) };
}

export function Toohype({ cast }) {
  const players = cast?.a || [];
  if (!players.length) return null;
  const s = hypeStaging(players.length);
  const { size, k, g, members } = s;
  const floor = TH_STAGE.floor;
  const style = {
    "--k":k, "--h1":px(-HOPS[0] * k), "--h2":px(-HOPS[1] * k), "--h3":px(-HOPS[2] * k), "--step-up":px(-16 * k),
  };
  return (
    <div className="th" style={style}>
      {/* the ground: below the floor's front edge nothing shows */}
      <div className="th-ground">
        {members.map(m => {
          const player = players[m.i];
          const look = { "--dx":px(m.x1 - m.x0), "--drop":px(-820), "--plant":px(TH_STAGE.plant * k), "--skew":px(-m.dir * 70 * k) };
          return (
            <React.Fragment key={player}>
              <CastChip player={player} size={size} x={m.x0} y={floor} className="th-chip" style={look}
                hands={{ l:[["fist", 0], ["open", TH.fall]], r:[["fist", 0], ["open", TH.fall]] }}>
                {/* its wake on the way down */}
                <span className="th-node th-fall-lines" style={{ left:0, top:g.top - 8 }}>
                  <span className="th-node th-up"><SpeedLines length={Math.round(340 * k)} rows={[[-80, 0.8], [-30, 1], [24, 0.7], [76, 0.9]]} /></span>
                </span>
              </CastChip>
              {/* a glove up out of the dirt beside it */}
              <span className="th-node th-pop" style={{ left:m.glove, top:floor - 46 * k, "--i":m.i }}>
                <span className="th-node th-pop-in" style={m.dir < 0 ? { transform:"scaleX(-1)" } : undefined}>
                  <GloveArt pose="thumb" scale={g.glove} />
                </span>
              </span>
            </React.Fragment>
          );
        })}
      </div>
      {members.map(m => (
        <React.Fragment key={m.i}>
          {/* the launch's wake, straight up off the shoes */}
          <span className="th-node th-launch-lines" style={{ left:m.x0, top:floor - g.size * 1.25 }}>
            <span className="th-node th-down"><SpeedLines length={Math.round(380 * k)} rows={[[-70, 0.9], [-24, 1], [26, 0.75], [72, 0.85]]} /></span>
          </span>
          <Dust className="th-off" at={TH.launch} puffs={DUST_LOW} spread={0.45 * k} size={0.55 * k} style={{ left:m.x0, top:floor - 4 }} />
          <Dust className="th-crash" at={TH.crash} puffs={DUST_FAN} spread={1.25 * k} size={1.15 * k} style={{ left:m.x1, top:floor - 10 }} />
          <span className="th-node th-mound" style={{ left:m.x1, top:floor + 6 * k }}><DirtMound scale={k * TH_STAGE.mound} /></span>
          <Dust className="th-pop-dust" at={TH.pop} puffs={DUST_LOW} spread={0.3 * k} size={0.45 * k}
            style={{ left:m.glove + m.dir * 40 * k, top:floor - 2 }} />
          {/* its shoes: they bounce with it, stay when it goes, turn to it,
              and walk over */}
          <span className="th-node th-shoes" style={{ left:m.x0, top:floor, "--stride":px(m.dir * m.walk / 3) }}>
            {["l", "r"].map(side => {
              const face = side === "l" ? -1 : 1;
              /* the shoe that points away turns round to face the way they walk */
              const turns = face !== m.dir;
              return (
                <span key={side} className={`th-node th-shoe is-${side}${side === (m.dir > 0 ? "l" : "r") ? " is-first" : " is-second"}`}
                  style={{ left:g.shoes[side].x }}>
                  <span className={`th-node th-shoe-face${turns ? " is-turning" : ""}`} style={{ "--face0":face, "--face1":m.dir }}>
                    <ShoeArt scale={g.scale} />
                  </span>
                </span>
              );
            })}
          </span>
        </React.Fragment>
      ))}
      {s.more > 0 && <span className="cast-more" style={{ left:members[members.length - 1].x0 + 0.95 * size, top:floor - 0.6 * size }}>
        <span className="cast-more-in fd-show" style={{ transform:"translate(0%, -50%)" }}>{`+${s.more}`}</span>
      </span>}
    </div>
  );
}

/* the camera's anchors: "shoes" where it bounced (and the shoes stay),
   "mid" the whole of it, minX to maxX the span */
Toohype.anchors = cast => {
  const s = hypeStaging(cast?.a?.length || 1);
  const land = s.members.reduce((sum, m) => sum + m.x1, 0) / s.shown;
  /* "beat": on the shoes, with the spot it will come down in still in frame */
  return { shoes:s.shoes, beat:Math.round(s.shoes + (land - s.shoes) * 0.4), land:Math.round(s.members.reduce((sum, m) => sum + m.x1, 0) / s.shown), mid:s.mid, minX:s.minX, maxX:s.maxX };
};
