/* Arrivals on the TV (Oct 4, redesigned the same day).

   The lobby: from check-in opening until the first game is announced the
   TV is the room filling up. The session's painting across the canvas;
   at the center a pane of glass holding the check-in code, lit bone so a
   phone reads it from the couch, with the count under it as the scene's
   one drum ("9 of 13"); round it, thirteen seats as a horseshoe, one per
   roster player in roster order so a seat never moves. A player who is in
   stands in their seat as their chip, lit from behind; a seat still
   waiting is a dashed outline with the player's name under it, its Landed
   lamp flashing once their flight is down. A fresh arrival drops its chip
   into its seat from the arrival's own server instant (a late screen joins
   mid-fall); a load shows everyone seated, and so does reduced motion.
   With all thirteen in the code steps aside for the lit mark.

   The corner: once a game is announced and someone is still on the way, a
   small plate in the bottom right corner with the code over the faces
   still out (the standings make room for it). Never over a scene or a
   takeover. */
import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChipFace } from "../identity/PlayerIdentity.jsx";
import { FDMark } from "../../ui/Brand.jsx";
import { ScoreReel } from "../../ui/ScoreReel.jsx";
import { stackName } from "../wagers/betStacks.js";
import { ARRIVAL_DROP_MS, droppingSeats, lobbySeats } from "../arrivals/arrivalsModel.js";
import { qrModules } from "../arrivals/arriveQr.js";
import "./tv-arrivals.css";

/* the code, crisp at any size: bone plate, ink modules, a quiet zone of
   four modules (two drawn, the plate's padding the rest) */
export function QrPlate({ url, size, className = "" }) {
  const qr = useMemo(() => url ? qrModules(url) : null, [url]);
  if (!qr) return null;
  return <div className={`tv-qr-plate${className ? ` ${className}` : ""}`} style={{ width:size, height:size }}
    role="img" aria-label="Check-in code">
    <svg viewBox={`-2 -2 ${qr.size + 4} ${qr.size + 4}`} shapeRendering="crispEdges" aria-hidden="true" focusable="false">
      <path d={qr.d} />
    </svg>
  </div>;
}

/* the drop's delay: negative once the arrival is already under way, fixed
   when the seat first sees it so the fall never jumps as the clock ticks */
function DropChip({ p, size, at, now }) {
  const [delay] = useState(() => Math.min(0, Math.round(at - now)));
  return <span className="tv-lobby-chip is-dropping" style={{ animationDelay:`${delay}ms` }}>
    <ChipFace p={p} size={size} /></span>;
}

/* who was already here when this screen first read the board: seated, never dropped */
function useSeen(board) {
  const seen = useRef(null);
  if (seen.current === null) seen.current = new Set(board.seats.filter(seat => seat.here).map(seat => seat.player));
  return seen.current;
}

/* a seat's chip, the well it stands in, and the name plate's room */
export const LOBBY_CHIP = 98;
export const LOBBY_NAME_W = 164;
/* a seat's name: one line, as large as its plate allows (30px down to the
   24px floor), and a name still wider at 24 narrowed to the plate, never cut */
export const arriveNameSize = name => Math.max(24, Math.min(30, Math.floor(LOBBY_NAME_W / Math.max(1, String(name || "").length * 0.5))));
function SeatName({ name }) {
  const ref = useRef(null);
  const [squeeze, setSqueeze] = useState(1);
  useLayoutEffect(() => {
    let live = true;
    const measure = () => {
      const w = ref.current?.scrollWidth || 0;
      if (live && w) setSqueeze(Math.max(0.6, Math.min(1, LOBBY_NAME_W / w)));
    };
    measure();
    document.fonts?.ready?.then(measure);
    return () => { live = false; };
  }, [name]);
  return <span className="tv-lobby-name fd-show" style={{ fontSize:arriveNameSize(name) }}>
    <span ref={ref} style={squeeze < 1 ? { transform:`scaleX(${squeeze.toFixed(3)})` } : undefined}>{name}</span></span>;
}

export function TVLobby({ state, board, now, url }) {
  const seen = useSeen(board);
  const dropping = new Set(droppingSeats(board, now, seen, ARRIVAL_DROP_MS));
  const spots = lobbySeats(board.seats.length);
  const code = !board.full && url;
  return (
    <div className="tv-lobby" aria-label={`${board.here} of ${board.total} here`}>
      <div className={`tv-lobby-pane tv-glass${code ? "" : " is-full"}`}>
        {code ? <QrPlate url={url} size={400} className="is-lobby" />
          : <span className="tv-lobby-mark"><FDMark size={300} /></span>}
        <div className="tv-lobby-count" aria-hidden="true">
          <ScoreReel value={board.here} drum className="tv-lobby-reel" />
          <span className="tv-lobby-of">of {board.total}</span>
        </div>
      </div>
      <ol className="tv-lobby-seats">
        {board.seats.map((seat, i) => (
          <li key={seat.player} className={`tv-lobby-seat${seat.here ? " is-here" : " is-road"}${seat.landed ? " is-landed" : ""}`}
            style={{ left:spots[i]?.x ?? 0, top:spots[i]?.y ?? 0 }}>
            <span className="tv-lobby-well">
              {seat.here ? (dropping.has(seat.player)
                ? <DropChip key={`drop:${seat.at}`} p={seat.player} size={LOBBY_CHIP} at={seat.at} now={now} />
                : <span key="seated" className="tv-lobby-chip"><ChipFace p={seat.player} size={LOBBY_CHIP} /></span>)
                : seat.landed && <span className="tv-lobby-landed"><i className="fd-insert is-info is-pending" aria-hidden="true" />Landed</span>}
            </span>
            <SeatName name={stackName(state, seat.player)} />
          </li>
        ))}
      </ol>
    </div>
  );
}

/* the corner plate's room: the standings and the ticker stand clear of it */
export const CORNER_W = 212;
export const CORNER_GAP = 24;
const CORNER_FACES = 4;
export function TVArriveCorner({ board, url }) {
  const road = board.onTheWay;
  const shown = road.length > CORNER_FACES ? road.slice(0, CORNER_FACES - 1) : road;
  const more = road.length - shown.length;
  return (
    <aside className="tv-arrive-corner" style={{ width:CORNER_W }} aria-label={`${road.length} on the way`}>
      <QrPlate url={url} size={CORNER_W - 24} />
      <span className="tv-arrive-corner-faces">
        {shown.map(player => <span key={player} className="tv-arrive-corner-face"><ChipFace p={player} size={40} /></span>)}
        {more > 0 && <span className="tv-arrive-corner-more">+{more}</span>}
      </span>
    </aside>
  );
}
