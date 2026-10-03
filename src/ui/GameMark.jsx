import React from "react";

/* One mark per game, drawn as a Backglass insert: a round window of dark
   glass in a seat, with the game's pictogram on the icon set's grid (24
   units, round caps and joins, Icon.jsx) and its one object (the ball, the
   die, the chip) filled solid. The pictogram is currentColor, set from
   --fd-mark-ink (bone by default) so a context may tint it. Legible at
   24px (the pictogram grows inside a thinner seat), handsome from 88 to 200px on the TV (the
   stroke lightens as the mark grows). Unknown ids fall back to the chip. */

const BALL = { fill:"currentColor", stroke:"none" };

const MARKS = {
  /* Long Putt: the flag, the cup, and a ball a long way out */
  putting:<>
    <path d="M14 18.6V4.2" />
    <path d="M14 4.2 19.6 6.6 14 9z" fill="currentColor" />
    <ellipse cx="14" cy="18.8" rx="3.4" ry="1.15" />
    <circle cx="5.2" cy="18.6" r="1.75" {...BALL} />
  </>,
  /* Beer Die: the die mid-toss */
  die:<>
    <rect x="5.4" y="5.4" width="13.2" height="13.2" rx="3" transform="rotate(-12 12 12)" />
    <g {...BALL}><circle cx="8.8" cy="9.4" r="1.35" /><circle cx="12" cy="12" r="1.35" /><circle cx="15.2" cy="14.6" r="1.35" /></g>
  </>,
  /* Where and When: a pin dropped on the map, its ring on the ground */
  where:<>
    <path d="M12 16.6s-5-4.3-5-8.4a5 5 0 0 1 10 0c0 4.1-5 8.4-5 8.4z" />
    <circle cx="12" cy="8.2" r="1.9" {...BALL} />
    <path d="M7.4 16.9c-2 .5-3.2 1.2-3.2 2 0 1.4 3.5 2.4 7.8 2.4s7.8-1 7.8-2.4c0-.8-1.2-1.5-3.2-2" />
  </>,
  /* basketball: a ball with its seams (5v5); 1v1 is the hoop, side on, the
     shot coming in */
  basketball:<>
    <circle cx="12" cy="12" r="8.4" />
    <path d="M3.6 12h16.8M12 3.6v16.8M6.1 6c2.4 1.6 3.4 3.6 3.4 6s-1 4.4-3.4 6M17.9 6c-2.4 1.6-3.4 3.6-3.4 6s1 4.4 3.4 6" />
  </>,
  "basketball:1v1":<>
    <path d="M17.2 3.4v9M17.2 8h2.6v12.6" />
    <path d="M8.6 10.2h8.6M9.4 10.2l1.6 5.6h3.4l1.6-5.6" />
    <circle cx="6.2" cy="5.2" r="2.4" {...BALL} />
  </>,
  /* Pickleball: the paddle and the holed ball */
  pickleball:<>
    <g transform="rotate(-32 10.4 10.4)">
      <rect x="5.4" y="2.8" width="10" height="11.6" rx="3.2" />
      <path d="M10.4 14.4v5.6" strokeWidth="2.8" />
    </g>
    <circle cx="17.8" cy="17.6" r="2.9" {...BALL} />
    <g fill="var(--fd-mark-glass)" stroke="none"><circle cx="16.9" cy="16.8" r=".55" /><circle cx="18.7" cy="16.8" r=".55" /><circle cx="17.8" cy="18.5" r=".55" /></g>
  </>,
  /* Volleyball: the ball over the net (three seams from one point read as
     a star at 24px, so the ball carries two curved panel lines and the net
     says the game) */
  volleyball:<>
    <circle cx="12" cy="8.6" r="5.6" />
    <path d="M7.3 5.9c2.9-.3 5.9 1.1 7.6 3.7M6.9 10.6c2.8-1.4 6.3-1.3 8.9.6M10.3 3.3c1.9 1.6 2.9 4.1 2.6 6.6" />
    <path d="M3.6 16.6h16.8M3.6 20.2h16.8M3.6 16.6v3.6M20.4 16.6v3.6M7.8 16.6v3.6M12 16.6v3.6M16.2 16.6v3.6" strokeWidth=".9" />
  </>,
  /* Trivia: a card with the question on it */
  trivia:<>
    <rect x="4.8" y="3.6" width="14.4" height="16.8" rx="2.4" />
    <path d="M9.6 9.6a2.4 2.4 0 1 1 3.6 2.1c-.8.5-1.2 1-1.2 1.9v.5" />
    <circle cx="12" cy="16.9" r="1.2" {...BALL} />
  </>,
  /* 8-Ball: the black ball's window and its 8 */
  "8ball":<>
    <circle cx="12" cy="12" r="8.4" />
    <circle cx="12" cy="11.2" r="3.9" {...BALL} />
    <g stroke="var(--fd-mark-glass)" strokeWidth="1"><circle cx="12" cy="9.9" r="1" /><circle cx="12" cy="12.45" r="1.3" /></g>
  </>,
  /* Beer Pong: the ball dropping into the cup */
  pong:<>
    <path d="M6.6 10.2h10.8M7.3 10.2l1.4 9a1.5 1.5 0 0 0 1.5 1.3h3.6a1.5 1.5 0 0 0 1.5-1.3l1.4-9" />
    <path d="M7.9 14h8.2" />
    <circle cx="14.6" cy="4.9" r="2" {...BALL} />
  </>,
  /* Rage Cage: a cup stacked on a cup, the ball after it */
  ragecage:<>
    <path d="M4.6 12.4h9.6M5.2 12.4l1.2 7.2a1.3 1.3 0 0 0 1.3 1.1h4.4a1.3 1.3 0 0 0 1.3-1.1l1.2-7.2" />
    <path d="M6.8 8.2h9.6M7.4 8.2l.6 4.2M15.8 8.2l-1 6.2" />
    <circle cx="18.2" cy="4.8" r="1.8" {...BALL} />
  </>,
  /* Beerio Kart: the wheel */
  beerio:<>
    <circle cx="12" cy="12" r="8.4" />
    <circle cx="12" cy="12.6" r="2.4" {...BALL} />
    <path d="M3.7 11.6c2.3-.6 4.6-.6 6 .3M20.3 11.6c-2.3-.6-4.6-.6-6 .3M12 15v5.3" />
  </>,
  /* Poker: two cards, the front one showing its pip */
  poker:<>
    <rect x="4.2" y="5" width="9.4" height="13.4" rx="1.9" transform="rotate(-12 8.9 11.7)" />
    <rect x="10.2" y="4.6" width="9.4" height="13.4" rx="1.9" transform="rotate(10 14.9 11.3)" fill="var(--fd-mark-glass)" />
    <path d="m14.8 8.3 2.4 3.1-2.4 3.1-2.4-3.1z" {...BALL} />
  </>,

  /* earlier slates (kept for their events and the add-event picker) */
  spikeball:<>
    <ellipse cx="12" cy="16.2" rx="8.2" ry="3.2" />
    <path d="M6 18.4 4.8 20.6M18 18.4l1.2 2.2M8.4 15.6h7.2" />
    <circle cx="12" cy="6.4" r="2.6" {...BALL} />
  </>,
  pingpong:<>
    <circle cx="10" cy="9.6" r="5.6" />
    <path d="m6.2 13.8-2.6 4.4" strokeWidth="2.6" />
    <circle cx="17.6" cy="17" r="2.2" {...BALL} />
  </>,
  foosball:<>
    <path d="M3.6 6.2h16.8" />
    <circle cx="12" cy="9.4" r="2.1" />
    <path d="M12 11.5v4.3M9.4 13h5.2M12 15.8l-2.6 3.8M12 15.8l2.6 3.8" />
    <circle cx="18.4" cy="18.6" r="1.8" {...BALL} />
  </>,
};

/* the fallback: the chip */
const CHIP = <>
  <circle cx="12" cy="12" r="8.4" />
  <circle cx="12" cy="12" r="3" {...BALL} />
  <path d={[30, 90, 150, 210, 270, 330].map(deg => {
    const a = deg * Math.PI / 180, x = r => (12 + Math.cos(a) * r).toFixed(2), y = r => (12 + Math.sin(a) * r).toFixed(2);
    return `M${x(5.2)} ${y(5.2)}L${x(6.6)} ${y(6.6)}`;
  }).join("")} />
</>;

/* every game id with its own mark, for pickers ("Looks like") */
export const GAME_MARK_IDS = Object.freeze(Object.keys(MARKS).filter(id => !id.includes(":")));

function GameMark({ id, size=54, hero=false, variant }) {
  const glyph = MARKS[variant ? `${id}:${variant}` : id] || MARKS[id] || CHIP;
  /* small marks: a thinner seat and a bigger pictogram; big marks: a
     lighter stroke */
  const small = size <= 34;
  const scale = small ? 0.9 : 0.76;
  const stroke = size <= 28 ? 2.05 : size <= 48 ? 1.85 : size <= 96 ? 1.65 : 1.45;
  const at = 12 - 12 * scale;
  const glass = hero ? "var(--paper)" : "var(--paper2)";
  return (
    <svg className={`fd-game-mark${hero ? " is-hero" : ""}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"
      focusable="false" style={{ flexShrink:0, display:"block", color:"var(--fd-mark-ink, var(--ink))", "--fd-mark-glass":glass }}>
      {/* the seat, the glass, and its bezel's lit lower lip */}
      <circle cx="12" cy="12" r="11.9" fill="var(--ink0)" />
      <circle cx="12" cy="12" r={small ? 11.1 : 10.9} fill={glass} />
      <path d={small ? "M2.2 13.6a9.9 9.9 0 0 0 19.6 0" : "M2.4 13.6a9.7 9.7 0 0 0 19.2 0"} fill="none"
        stroke="var(--bone)" strokeOpacity=".16" strokeWidth=".5" strokeLinecap="round" />
      <g transform={`translate(${at} ${at}) scale(${scale})`} fill="none" stroke="currentColor"
        strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">{glyph}</g>
    </svg>
  );
}
export { GameMark };
