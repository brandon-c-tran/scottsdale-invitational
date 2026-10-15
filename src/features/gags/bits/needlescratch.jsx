import React from "react";
import { Neon, NeonChip, Swaps } from "../neon/Neon.jsx";
import { Note, Tumbleweed } from "../neon/NeonProps.jsx";
import { TUBE, arcPath, circlePath, ellipsePath } from "../neon/neonArt.js";
import { bitById } from "./registry.js";
import "./needlescratch.css";

const NS = bitById("needlescratch").beats;
const W = TUBE.w;

/* needle scratch (loss, songless; only while the last winner's song is
   still playing, and the Worker cuts that song on the scratch): a neon
   record player spins, notes float up off it, and the loser's chip bops
   along as if it belongs. It tries a spin, overbalances and goes over
   backwards, and as it hits the floor the needle skids across the record
   (a cut-in of the arm dragged across, a scratch on the vinyl). The notes
   stop dead in the air and drop onto the deck. The record spins down. Silence: the
   chip flat on the floor, a lone tumbleweed rolling by behind it.

   World x: the chip at 760; the turntable drawn from 1010 to 1450 (its
   record centred at 1220 on the deck, y 860; the arm's pivot at 1395)
   and set down a third bigger about its foot, at 1250. */
export const NS_STAGE = Object.freeze({ chip:760, floor:930, size:240, deck:{ x:1220, y:860, r:160, ry:24 }, pivot:{ x:1395, y:818 },
  /* the turntable is drawn about (1240, 930) and set down at 1250, a third bigger */
  table:{ x:1250, from:1240, scale:1.3 } });

const r1 = n => Math.round(n * 10) / 10;
/* the turntable's body: a deck in perspective and its front face */
const DECK = "M1036 846L1424 846L1452 880L1008 880Z";
const FRONT = "M1008 880L1452 880L1452 930L1008 930Z";
/* the tone arm, playing: post, arm, headshell down onto the record */
const ARM_PLAY = "M1395 860L1395 818M1395 818L1306 840M1306 840L1298 838L1298 856";
/* skidding: the arm dragged across, the needle at the far side */
const ARM_SKID = "M1395 860L1395 818M1395 818L1158 846M1158 846L1150 844L1150 862";
const Arm = ({ d }) => <Neon box={[1120, 790, 300, 90]} tubes={[{ d, tone:"cyan", w:W * 0.6 },
  { d:ellipsePath(1395, 860, 16, 5), tone:"cyan", w:W * 0.45 }]} />;
/* the scratch: a jag across the vinyl from where the needle was to where it went */
const SCRATCH = "M1298 858L1276 864L1258 853L1236 867L1214 855L1192 868L1170 856L1150 863";

/* the notes: each rises from the record and gets to its height exactly on
   the scratch, so all of them stop dead together; then they drop */
const NOTES = [
  { x:1150, h:290, dx:-40, rise:2100, two:false, tone:"magenta" },
  { x:1270, h:230, dx:30, rise:1450, two:true, tone:"cyan" },
  { x:1190, h:140, dx:-20, rise:880, two:true, tone:"magenta" },
  { x:1320, h:66, dx:16, rise:420, two:false, tone:"cyan" },
];
/* and two that came and went before (the music was already on) */
const EARLY = [{ x:1240, two:false, tone:"cyan", at:0 }, { x:1300, two:true, tone:"magenta", at:500 }];

export function Needlescratch({ cast }) {
  const player = cast?.a?.[0];
  if (!player) return null;
  const { chip, floor, deck, table } = NS_STAGE;
  const k = r1(deck.ry / deck.r * 1000) / 1000;
  /* where a point of the drawn turntable lands, set down */
  const place = (x, y) => ({ x:table.x + (x - table.from) * table.scale, y:floor + (y - floor) * table.scale });
  const emerge = place(deck.x, deck.y - 20).y;
  /* they drop dead onto the deck */
  const land = place(deck.x, deck.y - 6).y;
  return (
    <div className="ns">
      {/* a lone tumbleweed, behind everything, after */}
      <span className="neon-node ns-weed" style={{ left:-150, top:floor - 52 }}>
        <span className="neon-node ns-weed-hop"><span className="neon-node ns-weed-spin"><Tumbleweed scale={0.72} /></span></span>
      </span>
      <span className="neon-node" style={{ left:table.x, top:floor, transform:`scale(${table.scale})` }}>
      <span className="neon-node" style={{ left:-table.from, top:-floor }}>
      {/* the turntable */}
      <span className="neon-node">
        <Neon box={[990, 800, 480, 150]} fills={[{ d:DECK }, { d:FRONT }]} tubes={[
          { d:DECK, tone:"magenta", w:W * 0.6 },
          { d:FRONT, tone:"magenta", w:W * 0.7 },
          { d:`${circlePath(1060, 905, 9)}${circlePath(1096, 905, 9)}`, tone:"amber", w:W * 0.45 },
          { d:"M1360 905L1420 905", tone:"amber", w:W * 0.45, g:"lamp" },
        ]} />
      </span>
      {/* the record: grooves as drawn, what turns on it in a flattened node */}
      <span className="neon-node">
        <Neon box={[1040, 820, 360, 80]} fills={[{ d:ellipsePath(deck.x, deck.y, deck.r, deck.ry) }]} tubes={[
          { d:ellipsePath(deck.x, deck.y, deck.r, deck.ry), tone:"bone", w:W * 0.55 },
          { d:`${ellipsePath(deck.x, deck.y, deck.r * 0.8, deck.ry * 0.8)}${ellipsePath(deck.x, deck.y, deck.r * 0.6, deck.ry * 0.6)}`,
            tone:"bone", w:W * 0.25 },
          { d:ellipsePath(deck.x, deck.y, deck.r * 0.3, deck.ry * 0.3), tone:"magenta", w:W * 0.5 },
        ]} />
      </span>
      <span className="neon-node" style={{ left:deck.x, top:deck.y, transform:`scaleY(${k})` }}>
        <span className="neon-node ns-platter">
          <Neon box={[-170, -170, 340, 340]} tubes={[
            { d:`${arcPath(0, 0, 128, 300, 345)}${arcPath(0, 0, 128, 120, 165)}`, tone:"cyan", w:W * 0.7 },
            { d:"M0 0L0 -40", tone:"magenta", w:W * 0.9 },
          ]} />
        </span>
      </span>
      <span className="neon-node ns-scratch"><Neon box={[1130, 840, 190, 40]} tubes={[{ d:SCRATCH, tone:"clay", w:W * 0.5 }]} /></span>
      <Swaps className="ns-arm" layers={[[<Arm key="p" d={ARM_PLAY} />, 0], [<Arm key="s" d={ARM_SKID} />, NS.scratch]]} />
      </span>
      </span>
      {/* the notes */}
      {EARLY.map((n, i) => <span key={`e${i}`} className={`neon-node ns-early is-${i}`} style={{ left:place(n.x, 0).x, top:emerge }}>
        <Note two={n.two} tone={n.tone} scale={0.9} /></span>)}
      {NOTES.map((n, i) => (
        <span key={i} className={`neon-node ns-note is-${i}`} style={{ left:place(n.x, 0).x, top:emerge,
          "--ns-rise":`translate(${n.dx}px, ${-n.h}px)`, "--ns-drop":`translateY(${land - emerge + n.h}px)` }}>
          <span className="neon-node ns-note-fall">
            <span className="neon-node ns-note-rise"><span className="neon-node ns-note-tip"><Note two={n.two} tone={n.tone} scale={0.9} /></span></span>
          </span>
        </span>
      ))}
      <NeonChip player={player} x={chip} y={floor} className="ns-chip" />
    </div>
  );
}
