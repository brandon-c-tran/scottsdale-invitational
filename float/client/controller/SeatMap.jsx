/* Who you are (float/GROOVE.md v3 "Who you are: fixed seats"): a small map
   of the flotilla as the TV lays it out (seats.js: the front row at the
   bottom, left to right), every seat a kayak, yours your own critter in its
   kayak of your colour, and the seat in words under it ("Front row, 3rd from
   the left"). Shown with the round card and the song's intro. */
import React from "react";
import { Critter } from "./art.jsx";

/* view: seatView({ room, idx }); entrant: yours (the look) */
export default function SeatMap({ view, entrant }) {
  if (!view) return null;
  /* the back row on top, the front row at the bottom (row 0) */
  const rows = view.rows.map((seats, row) => ({ row, seats })).reverse();
  return <div className="flc-seats" role="img" aria-label={view.words}>
    <div className="flc-seats-water" aria-hidden="true">
      {rows.map(({ row, seats }) => <div key={row} className={`flc-seats-row is-row${row}`} style={{ "--depth":row }}>
        {seats.map(seat => seat?.me
          ? <span key={seat.i} className="flc-seat is-me"><Critter entrant={entrant} size={76} /></span>
          : <i key={seat.i} className="flc-seat"><svg viewBox="0 0 40 16" focusable="false"><path d="M2 8 Q14 2 38 6 Q30 14 4 11 Z" /></svg></i>)}
      </div>)}
    </div>
    <b className="flc-seats-words">{view.words}</b>
  </div>;
}
