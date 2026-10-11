import React from "react";
import { CAST, castGeometry, clusterLayout } from "../cast/castGeometry.js";
import { CastSide } from "../cast/CastChip.jsx";
import { FloorShadow, Gleam, Sunglasses, Tumbleweed } from "../props/Props.jsx";
import { GLASS, backglassScene } from "../../tv/desertModel.js";
import { bitById } from "./registry.js";
import "./sunset.css";

/* sunset (win, desert): the winner on top of a butte in the foreground,
   fists on hips, a big sun behind it. The sun sets, fast; the sky relamps
   warmer in six hard steps (the backglass's own way of changing session)
   and the range, the buttes and the saguaros go to silhouette. A pair of
   sunglasses comes down slowly on a string from above the frame, sways,
   and settles on its face. A glint off the lens. A tumbleweed blows past
   at the butte's foot. The string yanks them back up and out of frame.
   The chip never moves.

   The sky is a copy of the painting's horizon over the painting itself:
   the range in the painting's own inks (class "tv-desert" with
   data-phase, so it is the painting until the relamp), the sunset bands
   and the silhouettes over it, the sun between, all cut off at the
   horizon. The painting's own sun or moon is hidden for the bit. A side
   of more stands shoulder to shoulder on a wider butte, a pair of shades
   each. */
const SS = bitById("sunset").beats;
export const SS_STAGE = Object.freeze({ x:960, floor:CAST.floor, rise:200, sunR:250, sunY:530, set:600 });

const r1 = n => Math.round(n * 10) / 10;
const px = n => `${r1(n)}px`;

/* the side on the butte, centred; where each face's shades land */
export function sunsetStaging(n = 1) {
  const l = clusterLayout(n, { dir:1 });
  const k = l.size / CAST.size;
  const g = castGeometry(l.size);
  const span = (l.shown - 1) * l.step;
  const lead = r1(SS_STAGE.x - span / 2);
  const top = SS_STAGE.floor - SS_STAGE.rise;
  const xs = l.xs.map(x => r1(lead + x));
  const half = Math.round(Math.max(210, span / 2 + l.size * 0.9));
  /* the bridge of the shades: a little above the photo's middle */
  const eyes = r1(top + g.center.y - l.size * 0.06);
  return { l, k, g, lead, top, xs, half, eyes, minX:Math.round(SS_STAGE.x - half - 120), maxX:Math.round(SS_STAGE.x + half + 120 + (l.more ? 110 : 0)) };
}

/* the foreground butte: a flat top under the side, steep sides with a
   ledge, its foot off the bottom of the frame */
function buttePath({ half, top }, F) {
  const x = SS_STAGE.x, w = half;
  const p = [[x - w + 8, top], [x + w - 10, top], [x + w + 6, top + 14], [x + w + 26, top + 70], [x + w + 22, top + 82],
    [x + w + 60, F - 30], [x + w + 140, F + 160], [x - w - 150, F + 160], [x - w - 70, F - 40], [x - w - 40, top + 96],
    [x - w - 46, top + 84], [x - w - 12, top + 20]];
  return `M${p.map(([a, b]) => `${r1(a)},${r1(b)}`).join("L")}Z`;
}
function butteShade({ half, top }, F) {
  const x = SS_STAGE.x, w = half;
  const p = [[x + w * 0.35, top], [x + w - 10, top], [x + w + 6, top + 14], [x + w + 26, top + 70], [x + w + 22, top + 82],
    [x + w + 60, F - 30], [x + w + 140, F + 160], [x + w * 0.2, F + 160]];
  return `M${p.map(([a, b]) => `${r1(a)},${r1(b)}`).join("L")}Z`;
}

/* the sky's bands, as the painting cuts them (desertModel.js GLASS_BANDS) */
const BANDS = [[0, 300, "sky"], [300, 200, "sky2"], [500, 150, "sky3"], [650, 110, "sky4"], [760, GLASS.horizon - 760, "glow"]];

export function Sunset({ cast, phase = "sap" }) {
  const a = cast?.a || [];
  const s = sunsetStaging(a.length || 1);
  const F = SS_STAGE.floor, H = GLASS.horizon;
  const scene = backglassScene();
  const range = cls => <>
    <path className={`${cls}far`} d={scene.far} />
    <path className={`${cls}mid`} d={scene.hump} />
    {scene.buttes.map((b, i) => <g key={i}><path className={`${cls}mesa`} d={b.lit} /><path className={`${cls}shade`} d={b.shade} /></g>)}
    <g className={`${cls}cactus`}>{scene.cacti.map((c, i) => <path key={i} d={c.d}
      transform={`translate(${c.x} ${c.y}) scale(${c.scale})`} />)}</g>
  </>;
  const hips = { l:"fist", r:"fist" };
  const butte = buttePath(s, F);
  const style = { "--hip":`translate(${px(s.l.size * 0.035)}, ${px(s.l.size * 0.05)})`, "--hip-l":`translate(${px(-s.l.size * 0.035)}, ${px(s.l.size * 0.05)})`,
    "--sun-set":`translateY(${px(SS_STAGE.set)})` };
  return (
    <div className="ss tv-desert" data-phase={phase} style={style}>
      {/* the sky over the painting's: the range as painted, the sun behind
          it, then the sunset's bands and silhouettes relamping in */}
      <svg className="ss-sky" width="1920" height={H} viewBox={`0 0 1920 ${H}`} aria-hidden="true">
        <g className="ss-dusk">{BANDS.map(([y, h, band]) => <rect key={band} className={`ss-band is-${band}`} y={y} width="1920" height={h} />)}</g>
        <g className="ss-sun-go"><circle className="ss-sun" cx={SS_STAGE.x} cy={SS_STAGE.sunY} r={SS_STAGE.sunR} /></g>
        <g className="ss-day">{range("tv-desert-")}</g>
        <g className="ss-dark">{range("ss-dark-")}</g>
      </svg>
      {/* the butte the winner stands on: in daylight, then a silhouette with the last light on its rim */}
      <svg className="ss-butte" width="1920" height="1200" viewBox="0 0 1920 1200" aria-hidden="true">
        <path className="bit-ink" strokeWidth={CAST.line * 2} d={butte} />
        <path className="ss-rock" d={butte} />
        <path className="ss-rock-shade" d={butteShade(s, F)} />
        <g className="ss-dark"><path className="ss-dark-butte" d={butte} />
          <path className="ss-rim" d={`M${SS_STAGE.x - s.half + 8},${s.top + 3} L${SS_STAGE.x + s.half - 10},${s.top + 3}`} /></g>
      </svg>
      <CastSide players={a} x={s.lead} y={s.top} dir={1} facing={0} className="ss-a" lead={{ hands:hips }} mates={{ hands:hips }} />
      {/* the shades on their strings, one pair a face */}
      {s.xs.map((x, i) => (
        <span key={i} className="ss-node ss-shades" style={{ left:x, top:s.eyes, "--i":i }}>
          <span className="ss-node ss-lower"><span className="ss-node ss-sway">
            <span className="ss-string" />
            <Sunglasses scale={s.k} />
            <span className="ss-node ss-glint" style={{ left:-62 * s.k, top:-12 * s.k }}><Gleam r={34 * s.k} /></span>
          </span></span>
        </span>
      ))}
      {/* a tumbleweed past the butte's foot */}
      <span className="ss-node ss-weed" style={{ left:-140, top:F + 34 }}>
        <span className="ss-node"><FloorShadow w={90} h={16} /></span>
        <span className="ss-node ss-weed-hop"><span className="ss-node ss-weed-spin"><Tumbleweed scale={0.8} /></span></span>
      </span>
    </div>
  );
}

/* the camera's anchors: "chip" the side on the butte; minX to maxX the span */
Sunset.anchors = cast => {
  const s = sunsetStaging(cast?.a?.length || 1);
  return { chip:SS_STAGE.x, minX:s.minX, maxX:s.maxX };
};
