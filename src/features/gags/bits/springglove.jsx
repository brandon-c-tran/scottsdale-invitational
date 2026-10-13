import React from "react";
import { CAST, PAIR_STEP, castGeometry, clusterLayout } from "../cast/castGeometry.js";
import { CastSide } from "../cast/CastChip.jsx";
import { GLOVE_POSES } from "../cast/gloveArt.js";
import { BOXING_GLOVE, Blast, BoxingGlove, DUST_FAN, Dust, PUNCH_BOX, PunchBox, SpeedLines, Spring, Twinkle } from "../props/Props.jsx";
import { bitById } from "./registry.js";
import "./springglove.css";

const SG = bitById("springglove").beats;
const PAIR_LAG = bitById("springglove").pairLag;

/* springglove (versus, slapstick): B (the beaten favorite) is mid victory
   bounce, fists up, chin up. A (the underdog) stands off to the side with
   a steel box on a pistol grip, a big red boxing glove in its horn, aimed
   at B, the other glove flat over a big red button. B turns and sees it.
   Nothing. A slams the button: the glove shoots across on an accordion
   spring and punches B off in a dead straight line, up and away into the
   distance, a speck, gone. The spring hangs there quivering over the empty
   spot. A star pings in the sky where B went. The spring snaps back, goes
   clean through the box and out its back port into A's own face. A
   wobbles, turns to the room, thumbs up. A side of more than one: the
   punch carries down B's line, each launched after the last, each its own
   star; A's side gives the thumbs up together.
   A pair of winners (Oct 13) is a pincer: one launcher at each end of the
   stage, the second the first mirrored about the middle (its photo
   flipped back). Against a pair, the favorites bounce back to back in
   the middle and each launcher punches the one nearest it, a beat apart
   (the registry's pairLag), their flights crossing in the sky; against
   one, both gloves land on it at once and it goes straight up. Both get
   the boop, both thumbs go up. A lone winner against a pair punches the
   first and the punch carries.

   The stage's camera shoots it (the registry's camera: a two-shot as tight
   as both sides allow, drifting to the empty spot and its sky, then a whip
   back to A; a pincer's own wider shot, its pairs entry); the scene names
   its anchors. Everything on A's device is in its own coordinates, hung
   from A's front glove (the rig's `hold`), so the box, its spring and both
   gloves move with the hand. */
export const SG_STAGE = Object.freeze({ mid:960, floor:CAST.floor, reach:250, sky:560, vp:360, vpMax:1700,
  hold:Object.freeze({ x:-6, y:50 }), hop:38, twinkleStep:Object.freeze({ x:34, y:-26 }),
  /* a pincer's chips, so both launchers and both favorites fit one shot */
  pincer:170 });

const r1 = n => Math.round(n * 10) / 10;
const px = n => `${r1(n)}px`;
const move = ({ x, y }) => `translate(${px(x)}, ${px(y)})`;

/* the launcher on a chip of `size`: the device's anchor from A's feet,
   its horn, the spring's reach, and how far from A's feet B's feet stand */
function launcher(size, bSize) {
  const ka = size / CAST.size;
  const g = castGeometry(size);
  const hold = { x:SG_STAGE.hold.x * ka, y:SG_STAGE.hold.y * ka };
  const spot = { x:GLOVE_POSES.grip.held.x * g.glove, y:GLOVE_POSES.grip.held.y * g.glove };
  const device = { x:g.hands.r.x + hold.x + spot.x, y:g.hands.r.y + hold.y + spot.y };
  const nozzle = { x:(PUNCH_BOX.nozzle.x - 6) * ka, y:PUNCH_BOX.nozzle.y * ka };
  const reach = Math.round(SG_STAGE.reach * ka);
  const restFront = device.x + nozzle.x + BOXING_GLOVE.front * ka;
  return { ka, g, hold, device, nozzle, reach, gap:Math.round(restFront + reach + 0.28 * bSize) };
}

/* where everything stands: the leads, the device on A's front glove, how
   far the spring reaches (A's knuckles at rest to a little way into B),
   the span the camera fits, and the point in the sky B's side flies into */
export function springStaging(a = 1, b = 1) {
  if (a === 2) return pincerStaging(b);
  const la = clusterLayout(a, { dir:-1 }), lb = clusterLayout(b, { dir:1 });
  const kb = lb.size / CAST.size;
  const { ka, g, hold, device, nozzle, reach, gap } = launcher(la.size, lb.size);
  const lastA = la.xs[la.xs.length - 1] || 0, lastB = lb.xs[lb.xs.length - 1] || 0;
  const left = (la.shown > 1 ? lastA - 0.95 * la.size : -0.56 * la.size) - (la.more ? 110 : 0);
  const right = gap + lastB + 0.95 * lb.size + (lb.more ? 110 : 0);
  const ax = Math.round(SG_STAGE.mid - (left + right) / 2);
  const bx = ax + gap;
  /* the first star; the rest of the side's run on up and to the right of
     it, all of them inside the TV */
  const vp = { x:Math.round(Math.min(SG_STAGE.vpMax - (lb.shown - 1) * SG_STAGE.twinkleStep.x, bx + lastB + SG_STAGE.vp * Math.max(kb, 0.75))),
    y:SG_STAGE.sky };
  /* where the glove's knuckles meet B */
  const contact = { x:ax + device.x + nozzle.x + reach + BOXING_GLOVE.front * ka, y:SG_STAGE.floor + device.y + nozzle.y };
  return { pincer:false, la, lb, ka, kb, g, hold, device, nozzle, reach, ax, bx, lastB, vp, contact,
    minX:Math.round(ax + left), maxX:Math.round(ax + right), mid:Math.round(ax + (left + right) / 2) };
}

/* a pincer: the left half staged (the right is its mirror about the
   middle). Against a pair the left favorite stands half a pair's step
   left of the middle and flies up and to the right; against one it
   stands in the middle and goes straight up. */
function pincerStaging(b) {
  const size = SG_STAGE.pincer;
  const la = clusterLayout(1, { sizes:[size] }), lb = clusterLayout(1, { sizes:[size] });
  const kb = lb.size / CAST.size;
  const { ka, g, hold, device, nozzle, reach, gap } = launcher(size, size);
  const pair = b === 2;
  const bx = Math.round(SG_STAGE.mid - (pair ? PAIR_STEP * size / 2 : 0));
  const ax = bx - gap;
  const vp = pair ? { x:Math.round(bx + SG_STAGE.vp * Math.max(kb, 0.75)), y:SG_STAGE.sky } : { x:SG_STAGE.mid, y:SG_STAGE.sky - 40 };
  const contact = { x:ax + device.x + nozzle.x + reach + BOXING_GLOVE.front * ka, y:SG_STAGE.floor + device.y + nozzle.y };
  /* the outer glove's thumbs up stays in the shot */
  const minX = Math.round(ax - 1.05 * size);
  return { pincer:true, pairB:pair, la, lb, ka, kb, g, hold, device, nozzle, reach, ax, bx, lastB:0, vp, contact,
    minX, maxX:2 * SG_STAGE.mid - minX, mid:SG_STAGE.mid };
}

/* A's launchers (Oct 13): the lead's, and a pincer's second (the first
   mirrored about the middle: the same marks, drawn flipped), a beat
   behind against a pair (each its own favorite), with it against one.
   Each: its feet, its device, its reach, where its knuckles land, its lag,
   the B it hits and whether it is drawn mirrored. */
export function springLaunchers(s) {
  const lead = { i:0, x:s.ax, device:s.device, hold:s.hold, reach:s.reach, contact:s.contact, lag:0, target:0, mirror:false };
  if (!s.pincer) return [lead];
  return [lead, { ...lead, i:1, x:2 * SG_STAGE.mid - s.ax, contact:{ x:2 * SG_STAGE.mid - s.contact.x, y:s.contact.y },
    lag:s.pairB ? PAIR_LAG : 0, target:s.pairB ? 1 : 0, mirror:true }];
}

/* A's back glove over the button, wound up, on it, and up beside A for
   the thumbs up: offsets from its own wrist. The flat glove's palm (art
   36 px out, 16 px under its wrist) lands on the button's dome. */
export function springMarks(s) {
  const { g, device, ka } = s;
  const wrist = g.hands.l;
  const dome = { x:device.x + PUNCH_BOX.button.x * ka, y:device.y + (PUNCH_BOX.button.y - 30) * ka };
  const palm = { x:36 * g.glove, y:16 * g.glove };
  const over = { x:dome.x + palm.x - wrist.x, y:dome.y - palm.y - 16 * ka - wrist.y };
  const thumb = { x:0.1 * g.size, y:-0.12 * g.size };
  return {
    over, windUp:{ x:over.x - 6 * ka, y:over.y - 58 * ka }, on:{ x:over.x, y:over.y + 24 * ka }, thumb,
    /* on the way over to the thumbs up it goes over the top of A, not
       across its face */
    arc:{ x:(over.x + thumb.x) / 2, y:-g.size * 0.78 },
  };
}

export function Springglove({ cast }) {
  const a = cast?.a || [], b = cast?.b || [];
  const s = springStaging(a.length, b.length);
  const { la, lb, ka, kb, ax, bx, vp, reach, nozzle, hold } = s;
  const m = springMarks(s);
  const floor = SG_STAGE.floor;
  const cy = -castGeometry(lb.size).center.y;
  /* the flight: each of B's side from its feet to its own star near the
     vanishing point, shrinking into the distance; stretched along the way */
  const center = { x:bx, y:floor - cy };
  const angle = Math.atan2(vp.y - center.y, vp.x - center.x) * 180 / Math.PI;
  const step = lb.step;
  const ts = SG_STAGE.twinkleStep;
  const moreAt = { x:bx + s.lastB + lb.size * 0.92, y:floor - cy };
  const moreTo = { x:vp.x + lb.shown * ts.x, y:vp.y + lb.shown * ts.y };
  const style = {
    "--hold":move(hold), "--hold-low":move({ x:hold.x, y:hold.y + 16 * ka }),
    "--over":move(m.over), "--wind":move(m.windUp), "--on":move(m.on), "--thumb":move(m.thumb), "--arc":move(m.arc),
    "--reach":px(reach), "--back-in":px(118 * ka), "--back-out":px(22 * ka),
    "--hop-h":px(-SG_STAGE.hop * kb), "--kb":kb,
    "--fly-x":px(vp.x - bx), "--fly-y":px(vp.y - floor), "--fly-step":px(ts.x - step), "--fly-dy":px(ts.y),
    "--fly-rot":`${Math.round(angle)}deg`, "--fly-anti":`${-Math.round(angle)}deg`, "--cy":px(-cy),
    "--more-fly":`translate(${px(moreTo.x - moreAt.x)}, ${px(moreTo.y - moreAt.y)}) scale(.04)`, "--more-i":lb.shown,
  };
  /* the device, in its own coordinates (its anchor is where the grip meets
     the box): the back port's glove behind the box, the box, then the
     spring and the glove out of its horn */
  const rear = { x:PUNCH_BOX.rear.x * ka, y:PUNCH_BOX.rear.y * ka };
  const device = (
    <span className="sg-node sg-device">
      <span className="sg-node sg-back" style={{ left:rear.x, top:rear.y }}>
        <span className="sg-node sg-back-x"><span className="sg-node sg-flip"><BoxingGlove scale={ka} /></span></span>
      </span>
      <PunchBox scale={ka} />
      <span className="sg-node sg-arm" style={{ left:nozzle.x, top:nozzle.y }}>
        <span className="sg-node sg-spring"><Spring length={reach} amp={Math.round(20 * ka)} pitch={44 * ka} /></span>
        <span className="sg-node sg-glove">
          <span className="sg-node sg-trail is-out"><span className="sg-node sg-flip"><SpeedLines length={Math.round(reach * 0.9)}
            rows={[[-46, 1], [-16, 0.7], [14, 1], [42, 0.6]]} /></span></span>
          <span className="sg-node sg-trail is-in" style={{ left:BOXING_GLOVE.front * ka }}><SpeedLines length={Math.round(reach * 0.7)}
            rows={[[-40, 0.8], [-8, 1], [26, 0.7]]} /></span>
          <BoxingGlove scale={ka} />
        </span>
      </span>
    </span>
  );
  const lagged = lag => lag ? { style:{ "--pd":`${lag}ms` } } : {};
  /* A: its launcher on the front glove, the other on the button */
  const sideA = (players, lag = 0) => (
    <CastSide players={players} x={ax} dir={-1} facing={1} className="sg-a"
      lead={{ hands:{ front:"grip", back:[["flat", 0], ["thumb", SG.look + lag]] }, hold:{ front:{ grip:device } }, ...lagged(lag) }}
      mates={{ hands:{ front:"rest", back:[["rest", 0], ["thumb", SG.look + 120]] } }} />
  );
  /* the hit: a hot star between the knuckles and B, for a few frames */
  const pow = (lag = 0) => <span className="sg-node sg-pow" style={{ left:s.contact.x - 24 * ka, top:s.contact.y, ...(lag ? { "--pd":`${lag}ms` } : {}) }}>
    <span className="sg-node sg-pow-in"><Blast r={Math.round(92 * ka)} /></span>
  </span>;
  /* B: the bounce, the dust where it stood, its wake and its star */
  const sideB = (players, lag = 0) => {
    const shown = players.slice(0, lb.shown);
    return <>
      <CastSide players={players} x={bx} dir={1} facing={-1} className="sg-b"
        lead={{ hands:{ l:"fist", r:"fist" }, ...lagged(lag) }} mates={{ hands:{ l:"fist", r:"fist" } }} />
      <Dust className="sg-dust" at={SG.fly + lag} puffs={DUST_FAN} spread={0.7 * kb} size={0.7 * kb} style={{ left:bx, top:floor - 6 }} />
      {shown.map((player, i) => <span key={player} className="sg-node sg-zip" style={{ left:bx + lb.xs[i], top:floor - cy, "--i":i,
        ...(lag ? { "--pd":`${lag}ms` } : {}) }}>
        <span className="sg-node sg-zip-in"><SpeedLines length={Math.round(300 * kb)} rows={[[-60, 0.8], [-20, 1], [20, 0.7], [58, 0.9]]} /></span>
      </span>)}
      {shown.map((player, i) => <span key={player} className="sg-node sg-sky" style={{ left:vp.x + i * ts.x, top:vp.y + i * ts.y, "--i":i }}>
        <span className="sg-node sg-speck"><Twinkle r={13} line={2.5} /></span>
        <span className="sg-node sg-twinkle"><Twinkle r={34} /></span>
      </span>)}
    </>;
  };
  if (!s.pincer) return <div className="sg" style={style}>{sideB(b)}{pow()}{sideA(a)}</div>;
  /* a pincer: the left half, then its mirror about the middle (a beat
     behind against a pair); one favorite between them stands unmirrored */
  const [, second] = springLaunchers(s);
  const half = (j, lag) => <>
    {s.pairB && sideB([b[j]], lag)}
    {pow(lag)}
    {sideA([a[j]], lag)}
  </>;
  return (
    <div className="sg is-pincer" style={style}>
      {!s.pairB && sideB(b.slice(0, 1))}
      {half(0, 0)}
      <div className="sg-mirror cast-flip" style={{ transformOrigin:`${SG_STAGE.mid}px 0px` }}>{half(1, second.lag)}</div>
    </div>
  );
}

/* the camera's anchors: "a" is A and its device (a pincer's: the middle),
   "b" B's side, "sky" the empty spot and the sky over it where B's side
   went, "mid" the two-shot, minX to maxX the span it fits */
Springglove.anchors = cast => {
  const s = springStaging(cast?.a?.length || 1, cast?.b?.length || 1);
  if (s.pincer) return { a:s.mid, b:s.mid, sky:s.mid, mid:s.mid, minX:s.minX, maxX:s.maxX };
  return { a:Math.round(s.ax + 120 * s.ka), b:Math.round(s.bx + s.lastB / 2), sky:Math.round((s.bx + s.vp.x) / 2),
    mid:s.mid, minX:s.minX, maxX:s.maxX };
};
