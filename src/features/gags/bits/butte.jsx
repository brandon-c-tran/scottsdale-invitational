import React from "react";
import { CAST, RIG, castGeometry, clusterLayout } from "../cast/castGeometry.js";
import { CastSide } from "../cast/CastChip.jsx";
import { GLOVE_POSES } from "../cast/gloveArt.js";
import { DUST_FAN, Dust, Puff, Slab } from "../props/Props.jsx";
import { bitById } from "./registry.js";
import "./butte.css";

/* butte (versus, desert): a tall narrow hoodoo, a cap rock on a pinched
   stem, standing up out of a pit in the desert floor. B (the beaten)
   stands smug on the cap, fists on hips, chin up. A (the winner) looks up
   at it, walks to the pit's edge, and pokes the stem once with one
   finger. Nothing. A crack runs up the rock; it drops away down the pit
   in pieces, and B stays where it was, standing on nothing. B looks down
   (the fists come off its hips). B looks at us. B drops straight down the
   pit, out of sight. A leans over to look; after a beat a small puff of
   dust comes up out of it. A dusts off its gloves.

   The stage's camera shoots it (the registry: a two-shot, in on the
   finger, out as the crack runs up, a creep in on B, over to A). The
   hoodoo is cut from the session's painting (class "tv-desert" with
   data-phase: its mesa and shade inks), in strata that fall separately;
   the crack is drawn in each stratum it crosses, so it falls with them.
   Everything that goes down the pit is cut off at its middle line, so it
   drops in past the near rim. A side of more: B's whole side stands on a
   wider cap over a wider pit and drops one after another; A's walks up
   behind its lead. */
const BT = bitById("butte").beats;
export const BT_STAGE = Object.freeze({ floor:CAST.floor, edge:960, height:380, walk:200, stem:150, capH:64, below:290, fall:1180 });

const r1 = n => Math.round(n * 10) / 10;
const px = n => `${r1(n)}px`;
const lerp = (a, b, t) => a + (b - a) * t;

/* Where everyone stands and where the finger lands. A's lead ends its
   walk with its front toe at the lip; the stem's left face is exactly
   where its jab reaches; B's side stands centred on the cap. */
export function butteStaging(a = 1, b = 1) {
  const la = clusterLayout(a, { dir:-1 }), lb = clusterLayout(b, { dir:1 });
  const ka = la.size / CAST.size, kb = lb.size / CAST.size;
  const F = BT_STAGE.floor, edge = BT_STAGE.edge;
  const ga = castGeometry(la.size), gb = castGeometry(lb.size);
  const toe = la.size * RIG.shoeX + 34 * ka;
  const ax = r1(edge - toe - 10 * ka), walk = Math.round(BT_STAGE.walk * ka), ax0 = r1(ax - walk);
  const wrist = { x:ax + ga.hands.r.x, y:F + ga.hands.r.y };
  /* the point pose's fingertip from its wrist (gloveArt.js: the finger runs to 88, 15 wide) */
  const tip = { x:95.5 * ga.glove, y:GLOVE_POSES.point.held.y * ga.glove };
  const raise = { x:r1(4 * ka), y:r1(-14 * ka) }, jab = r1(34 * ka);
  const contact = { x:r1(wrist.x + raise.x + tip.x + jab), y:r1(wrist.y + raise.y + tip.y) };
  const pillar = r1(contact.x + 75);
  const top = F - BT_STAGE.height;
  /* B's side stands from the stem rightward, the cap overhanging after it,
     so a big side never hangs out over A's floor */
  const bx = r1(pillar - Math.min((lb.shown - 1) * lb.step / 2, 30 * kb));
  const capX = r1(bx + (lb.shown - 1) * lb.step / 2);
  const capW = Math.round(Math.max(BT_STAGE.stem + 150, (lb.shown - 1) * lb.step + lb.size * 1.3));
  const minX = Math.round(ax0 - la.reach - (la.more ? 110 : 0));
  const maxX = Math.round(Math.max(capX + capW / 2 + 20, bx + (lb.shown - 1) * lb.step + lb.size * (0.5 + RIG.handX) + 40 * kb
    + (lb.more ? 110 : 0)));
  return { la, lb, ka, kb, ga, gb, F, edge, ax, ax0, walk, raise, jab, contact, pillar, top, bx, capX, capW, minX, maxX,
    mid:Math.round((minX + maxX) / 2) };
}

/* The rock: a cap on a stem of four strata, each a slab with its own
   middle (it falls and turns about it), its outline and shade face from
   that middle, and the pieces of the crack that run through it (each
   with its instant, ms from the crack's start). The stem's left face
   passes through the finger's contact; it pinches a little up high. */
const FALLS = [[-40, -16, 70], [26, 12, 0], [-18, -9, 20], [34, 14, 40], [-10, 6, 55]];
export function butteRock(s, { crackMs = 200 } = {}) {
  const { F, top, contact, pillar, capW, capX } = s;
  const capH = BT_STAGE.capH, y0 = top + capH, yB = F + BT_STAGE.below;
  const pinch = lerp(y0, F, 0.3);
  const left = [[y0, -66], [pinch, -58], [contact.y, contact.x - pillar], [F, -86], [yB, -100]].sort((p, q) => p[0] - q[0]);
  const right = [[y0, 68], [pinch, 60], [lerp(pinch, F, 0.55), 74], [F, 88], [yB, 102]];
  const at = (face, y) => {
    if (y <= face[0][0]) return face[0][1];
    for (let i = 0; i < face.length - 1; i++) {
      const [ya, xa] = face[i], [yb, xb] = face[i + 1];
      if (y <= yb) return lerp(xa, xb, (y - ya) / (yb - ya || 1));
    }
    return face[face.length - 1][1];
  };
  /* the strata's seams, each a little off level */
  const seams = [y0, lerp(y0, F, 0.27), lerp(y0, F, 0.56), lerp(y0, F, 0.84), yB];
  const tilt = [0, 6, -5, 4, 0];
  const slabs = [];
  for (let i = 0; i < 4; i++) {
    const ta = seams[i] + tilt[i], tb = seams[i] - tilt[i], ba = seams[i + 1] + tilt[i + 1], bb = seams[i + 1] - tilt[i + 1];
    const between = face => face.filter(([y]) => y > Math.min(ta, tb) + 2 && y < Math.max(ba, bb) - 2);
    const outline = [[pillar + at(left, ta), ta], [pillar + at(right, tb), tb], ...between(right).map(([y, x]) => [pillar + x, y]),
      [pillar + at(right, bb), bb], [pillar + at(left, ba), ba], ...between(left).reverse().map(([y, x]) => [pillar + x, y])];
    const cut = (y, side) => lerp(pillar + at(left, y), pillar + at(right, y), 0.6) + (side ? 0 : 0);
    const shade = [[cut(tb), lerp(ta, tb, 0.6)], [pillar + at(right, tb), tb], ...between(right).map(([y, x]) => [pillar + x, y]),
      [pillar + at(right, bb), bb], [cut(bb), lerp(ba, bb, 0.6)]];
    slabs.push({ key:`s${i}`, outline, shade, top:Math.min(ta, tb), bottom:Math.max(ba, bb) });
  }
  /* the cap: wider than the stem, bevelled, its underside in shadow */
  const h = capW / 2;
  const cap = [[capX - h + 10, top], [capX + h - 12, top], [capX + h, top + 16], [capX + h - 6, top + capH - 18],
    [capX + h - 24, top + capH], [capX - h + 20, top + capH], [capX - h + 4, top + capH - 20], [capX - h, top + 18]];
  const capShade = [[lerp(capX - h, capX + h, 0.64), top], [capX + h - 12, top], [capX + h, top + 16], [capX + h - 6, top + capH - 18],
    [capX + h - 24, top + capH], [lerp(capX - h, capX + h, 0.6), top + capH]];
  const capUnder = [[capX - h + 8, top + capH - 16], [capX + h - 8, top + capH - 16], [capX + h - 24, top + capH], [capX - h + 20, top + capH]];
  const pieces = [{ key:"cap", outline:cap, shade:capShade, tone:capUnder, top, bottom:top + capH }, ...slabs];
  /* the crack: from the finger up and across to the top of the cap, a zig a stratum */
  const steps = 10;
  const crack = [[contact.x, contact.y]];
  const zig = [22, -30, -12, -34, -6, -28, -14, -26, -8, -18];
  for (let i = 1; i <= steps; i++) {
    const y = lerp(contact.y, top + 3, i / steps);
    crack.push([i === 1 ? contact.x + 22 : pillar + zig[i - 1], y]);
  }
  /* split it at the seams, so each piece falls with its stratum */
  const bounds = [top, y0, ...seams.slice(1)];
  const segs = [];
  let run = 0;
  const total = crack.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - crack[i][0], p[1] - crack[i][1]), 0);
  for (let i = 0; i < crack.length - 1; i++) {
    let [ax, ay] = crack[i];
    const [bx, by] = crack[i + 1];
    const cuts = bounds.filter(y => y < ay && y > by).sort((p, q) => q - p);
    for (const y of [...cuts, by]) {
      const t = (ay - y) / (ay - by || 1);
      const x = y === by ? bx : lerp(crack[i][0], bx, (crack[i][1] - y) / (crack[i][1] - by || 1));
      const mid = (ay + y) / 2;
      const owner = mid < y0 ? 0 : 1 + Math.max(0, Math.min(3, seams.findIndex((seam, j) => j < 4 && mid >= seam && mid < seams[j + 1])));
      segs.push({ owner, from:[ax, ay], to:[x, y], at:Math.round(run / total * crackMs) });
      run += Math.hypot(x - ax, y - ay);
      [ax, ay] = [x, y];
      void t;
    }
  }
  return pieces.map((piece, i) => {
    const xs = piece.outline.map(p => p[0]);
    const c = { x:r1((Math.min(...xs) + Math.max(...xs)) / 2), y:r1((piece.top + piece.bottom) / 2) };
    const local = list => list.map(([x, y]) => [r1(x - c.x), r1(y - c.y)]);
    const [dx, rot, d] = FALLS[i % FALLS.length];
    return { ...piece, c, points:local(piece.outline), shade:local(piece.shade), tone:piece.tone ? local(piece.tone) : null,
      crack:segs.filter(seg => seg.owner === i).map(seg => ({ d:`M${r1(seg.from[0] - c.x)},${r1(seg.from[1] - c.y)} L${r1(seg.to[0] - c.x)},${r1(seg.to[1] - c.y)}`,
        at:seg.at })),
      fall:{ x:dx, r:rot, d } };
  });
}

/* the dust a falling pillar throws up out of the canyon */
const BILLOW = Object.freeze([[-170, -60, 1.3], [-80, -130, 1.5], [10, -160, 1.25], [100, -120, 1.45], [180, -56, 1.2], [-250, -20, 0.9],
  [250, -24, 0.95]]);
/* dust shaken off the gloves at each pat */
const PAT = Object.freeze([[-46, -40, 0.45], [40, -46, 0.4], [6, -66, 0.35]]);

export function Butte({ cast, phase = "sap" }) {
  const a = cast?.a || [], b = cast?.b || [];
  const s = butteStaging(a.length || 1, b.length || 1);
  const { F, edge, ka, kb, ga, gb, contact, pillar, top } = s;
  const rock = butteRock(s);
  /* A's lead: rest, the finger up and out, then (later) both gloves up to dust each other off */
  const front = [["rest", 0], ["point", BT.raise], ["rest", BT.poke + 520], ["flat", BT.dust - 120]];
  const back = [["rest", 0], ["flat", BT.dust - 120]];
  /* B's side: fists on hips until it looks down, then the gloves hang */
  const hips = [["fist", 0], ["rest", BT.down + 40]];
  const hipAt = { x:r1(gb.size * 0.035), y:r1(gb.size * 0.05) };
  const style = {
    "--walk":`translateX(${px(s.walk)})`, "--raise":`translate(${px(s.raise.x)}, ${px(s.raise.y)})`,
    "--jab":`translate(${px(s.raise.x + s.jab)}, ${px(s.raise.y)})`,
    "--dust-front":`translate(${px(-ga.size * 0.43)}, ${px(ga.size * 0.1)})`, "--dust-back":`translate(${px(ga.size * 0.72)}, ${px(ga.size * 0.22)})`,
    "--brush":px(ga.size * 0.13),
    "--hip":`translate(${px(hipAt.x)}, ${px(hipAt.y)})`, "--hip-l":`translate(${px(-hipAt.x)}, ${px(hipAt.y)})`,
    "--fall":`translateY(${px(BT_STAGE.fall)})`,
  };
  /* the pit the hoodoo stands in: its left tip at A's toes, wide enough
     for B's whole side to drop into */
  const pit = butteHole(s);
  return (
    <div className="bt tv-desert" data-phase={phase} style={style}>
      {/* the hole: the far wall catching the light inside its far rim, the
          dark below, a lit lip on the near rim */}
      <svg className="bt-hole" width="1920" height="1200" viewBox="0 0 1920 1200" aria-hidden="true">
        <path className="bit-ink" strokeWidth={CAST.line * 2} d={pit.rim} />
        <path className="bt-void" d={pit.rim} />
        <path className="bt-wall" d={pit.wall} />
        <path className="bt-lip" d={pit.lip} />
      </svg>
      {/* everything that goes down the hole is cut off at its middle, so it
          drops in past the near rim: the hoodoo (stratum by stratum, the
          crack in each), grit off B's soles, B's side */}
      <div className="bt-pit" style={{ height:pit.y }}>
        <div className="bt-rock">
          {rock.map(piece => (
            <span key={piece.key} className={`bt-node bt-piece is-${piece.key}`} style={{ left:piece.c.x, top:piece.c.y,
              "--fall-to":`translate(${px(piece.fall.x)}, ${px(BT_STAGE.fall)}) rotate(${piece.fall.r}deg)`, "--d":`${piece.fall.d}ms` }}>
              <Slab points={piece.points} shade={piece.shade} tone={piece.tone}>
                {piece.crack.map((seg, i) => <path key={i} d={seg.d} className="bt-crack" strokeWidth={6} style={{ "--cd":`${seg.at}ms` }} />)}
              </Slab>
            </span>
          ))}
        </div>
        {[0, 1].map(i => <span key={i} className="bt-node bt-grit" style={{ left:s.bx + (i ? 18 : -22) * kb, top:top + 4, "--d":`${i * 150}ms` }}>
          <Slab points={[[-7, -5], [6, -6], [8, 4], [-5, 6]]} /></span>)}
        <CastSide players={b} x={s.bx} y={top} dir={1} facing={0} className="bt-b"
          lead={{ hands:{ l:hips, r:hips } }} mates={{ hands:{ l:hips, r:hips } }} />
      </div>
      {/* it shudders, then goes: dust off the break, dust up out of the hole */}
      <Dust className="bt-burst" at={BT.crumble + 10} puffs={DUST_FAN} spread={1.15} size={1.05}
        style={{ left:pillar, top:lerp(top, F, 0.55) }} />
      <Dust className="bt-billow" at={BT.crumble + 300} puffs={BILLOW} spread={1} size={1.1} style={{ left:pit.x, top:pit.y }} />
      <CastSide players={a} x={s.ax0} y={F} dir={-1} facing={1} className="bt-a"
        lead={{ hands:{ front, back } }} mates={{ hands:{ front:"rest", back:"rest" } }} />
      {/* the puff from far below, up out of the hole */}
      <span className="bt-node bt-puff" style={{ left:pit.x - 6, top:pit.y + 4 }}>
        <Puff scale={0.8 * kb} fill="var(--bit-dust)" shade="var(--bit-dust-shade)" /></span>
      {/* the dust shaken off A's gloves */}
      {[0, 1].map(i => <Dust key={i} className="bt-pat" at={BT.dust + 40 + i * 170} puffs={PAT} spread={ka} size={0.75 * ka}
        style={{ left:s.ax + ga.size * 0.52, top:F - ga.size * 0.36 }} />)}
    </div>
  );
}

/* the pit: an ellipse on the floor round the hoodoo's foot, its left tip
   just past A's toes; `rim` the opening, `wall` the far wall inside its
   far rim, `lip` the near rim's lit edge, `y` its middle (where things
   drop out of sight) */
export function butteHole(s) {
  const left = s.edge + 22 * s.ka;
  const half = Math.max(250, s.capW / 2 + 40, s.pillar - left + 30);
  const reach = s.lb.shown ? s.bx + (s.lb.shown - 1) * s.lb.step + s.lb.size * (0.5 + RIG.handX) + 30 * s.kb : s.pillar;
  const rx = Math.round(Math.max(half, (reach - left) / 2 + 10));
  const x = Math.round(left + rx), y = Math.round(s.F - 14), ry = Math.round(rx * 0.15);
  const arc = (r, k, sweep) => `A${r},${k} 0 0 ${sweep}`;
  return {
    x, y, rx, ry,
    rim:`M${x - rx},${y} ${arc(rx, ry, 1)} ${x + rx},${y} ${arc(rx, ry, 1)} ${x - rx},${y} Z`,
    wall:`M${x - rx},${y} ${arc(rx, ry, 1)} ${x + rx},${y} L${r1(x + rx * 0.93)},${r1(y + ry * 0.12)} ${arc(r1(rx * 0.93), r1(ry * 0.72), 0)} ${r1(x - rx * 0.93)},${r1(y + ry * 0.12)} Z`,
    lip:`M${x - rx + 6},${y + 4} ${arc(rx - 6, ry - 3, 0)} ${x + rx - 6},${y + 4}`,
  };
}
/* the camera's anchors: "mid" the two-shot, "poke" the finger at the
   rock, "b" the side on the cap, "a" A at the lip; minX to maxX the span */
Butte.anchors = cast => {
  const s = butteStaging(cast?.a?.length || 1, cast?.b?.length || 1);
  return { mid:s.mid, poke:Math.round(s.contact.x - 30 * s.ka), b:Math.round(s.pillar), a:Math.round(s.ax + 70 * s.ka), minX:s.minX, maxX:s.maxX };
};
