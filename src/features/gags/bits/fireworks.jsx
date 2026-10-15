import React from "react";
import { Neon, NeonChip, useNeonColor } from "../neon/Neon.jsx";
import { TUBE, circlePath, spokesPath, starPath } from "../neon/neonArt.js";
import "./fireworks.css";

/* fireworks (win, punchline): the chip stands beside a rack of mortar
   tubes. The first rocket goes up, wobbles, and fizzles: a sad little
   puff, the stick drops back to the floor, and the chip sags. A beat.
   The second goes up whistling and BANGS into a huge burst in magenta
   and the chip's own color (the song comes in here); the chip leaps. Then
   cyan, amber, and a finale of two at once, the chip bouncing on each
   bang. The finale stays lit.

   World x: the chip at 820, the rack at 1160, the bursts up over the
   right of the shot (the lettering takes the top left). */
export const FW_STAGE = Object.freeze({ x:820, floor:930, chip:240, rack:1160 });
/* the shells: where each bursts, its size, its look and lamps */
export const FW_SHELLS = Object.freeze([
  { id:"dud", x:1110, y:640, r:34 },
  { id:"b1", x:1260, y:480, r:170, tone:"magenta", dots:"player" },
  { id:"b2", x:1530, y:590, r:120, tone:"cyan", dots:"cyan" },
  { id:"b3", x:1010, y:610, r:110, tone:"amber", dots:"amber", star:true },
  { id:"b4", x:1410, y:420, r:146, tone:"player", dots:"amber" },
  { id:"b5", x:1640, y:500, r:112, tone:"magenta", dots:"bone", star:true },
]);
const MOUTH = Object.freeze({ dy:-70 });

const r1 = n => Math.round(n * 10) / 10;

/* a burst: spokes out from the middle, a ring of lights at their ends
   (a star of tubes for some). Anchor: its middle. */
function Shell({ r, tone, dots, star }) {
  const n = 14;
  const ring = Array.from({ length:n }, (_, i) => {
    const a = (i * 360 / n + 8) * Math.PI / 180;
    return circlePath(Math.cos(a) * r, Math.sin(a) * r, Math.max(5, r * 0.055));
  }).join("");
  return <Neon box={[-r - 30, -r - 30, r * 2 + 60, r * 2 + 60]} tubes={[
    { d:spokesPath(n, r * 0.22, r * 0.8, 0, 0, 8), tone, w:TUBE.thin },
    { d:ring, tone:dots, w:TUBE.thin, g:"dots" },
    ...(star ? [{ d:starPath(5, r * 0.32, r * 0.14), tone:dots, w:TUBE.thin, g:"core" }] : []),
  ]} />;
}
/* the dud's puff: three little rings of smoke */
function Fizzle() {
  return <Neon box={[-80, -80, 160, 160]} tubes={[{ d:`${circlePath(-26, 8, 20)}${circlePath(16, -14, 26)}${circlePath(32, 26, 15)}`,
    tone:"bone", w:TUBE.thin }, { d:spokesPath(5, 44, 58, 0, 0, 200), tone:"ember", w:TUBE.fine }]} />;
}
/* a rocket: its head and the trail behind it, pointing right in its own
   frame (the scene turns it to its flight). Anchor: its head. */
function Rocket() {
  return <Neon box={[-110, -16, 130, 32]} tubes={[
    { d:"M-96 0L-8 0", tone:"amber", w:TUBE.fine, g:"trail" },
    { d:"M-14 0L4 0", tone:"bone", w:TUBE.w },
  ]} />;
}
/* the rack: three mortar tubes on the floor. Anchor: its foot's middle. */
function Rack() {
  const tube = x => `M${x - 16} 0L${x - 16} -70L${x + 16} -70L${x + 16} 0`;
  const d = `${tube(-40)}${tube(0)}${tube(40)}`;
  return <Neon box={[-80, -90, 160, 100]} fills={[{ d:`M-56 0L-56 -70L56 -70L56 0Z` }]}
    tubes={[{ d, tone:"cyan", w:TUBE.thin }, { d:"M-70 0L70 0", tone:"cyan", w:TUBE.thin }]} />;
}

export function Fireworks({ cast }) {
  const player = cast?.a?.[0];
  const color = useNeonColor(player);
  if (!player) return null;
  const { x, floor, rack } = FW_STAGE;
  const mouth = { x:rack, y:floor + MOUTH.dy };
  return (
    <div className="fwk" style={{ "--neon-player":color }}>
      {FW_SHELLS.map(shell => {
        const dx = shell.x - mouth.x, dy = shell.y - mouth.y, len = Math.hypot(dx, dy);
        const deg = Math.atan2(dy, dx) * 180 / Math.PI;
        return <React.Fragment key={shell.id}>
          {/* the rocket, turned to its flight, flying the length of it */}
          <span className={`neon-node fwk-rocket is-${shell.id}`} style={{ left:mouth.x, top:mouth.y, "--len":`${r1(len)}px` }}>
            <span className="neon-node" style={{ transform:`rotate(${r1(deg)}deg)` }}>
              <span className="neon-node fwk-fly"><span className="neon-node fwk-wobble"><Rocket /></span></span>
            </span>
          </span>
          <span className={`neon-node fwk-shell is-${shell.id}`} style={{ left:shell.x, top:shell.y }}>
            <span className="neon-node fwk-bloom">{shell.id === "dud" ? <Fizzle /> : <Shell {...shell} />}</span>
          </span>
        </React.Fragment>;
      })}
      {/* the dud's stick, falling back to the floor */}
      <span className="neon-node fwk-stick" style={{ left:1110, top:640, "--fall":`${floor - 8 - 640}px` }}>
        <span className="neon-node fwk-stick-turn"><Neon box={[-30, -10, 60, 20]} tubes={[{ d:"M-18 0L18 0", tone:"bone", w:TUBE.thin }]} /></span>
      </span>
      <span className="neon-node" style={{ left:rack, top:floor }}><Rack /></span>
      <NeonChip player={player} x={x} y={floor} className="fwk-chip" />
    </div>
  );
}
