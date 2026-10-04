import React from "react";

/* The drawings behind every rules step (gameSteps.js), keyed like their
   words (rulesWords.js). One family with the icon set and the game marks
   (src/ui/Icon.jsx, src/ui/GameMark.jsx): round caps and joins,
   currentColor, a step's one object (the ball, the die, the cup that
   decides it) filled solid. A step picture is drawn on a 64 x 40 field
   with the floor at y 34; a note glyph on the icon set's 24 grid.

   Classes (rules.css): fd-rp-faint (court, table and floor lines),
   fd-rp-trail (a ball's flight, dotted), fd-rp-lit (what wins: the sun,
   like the trophy), fd-rp-gone (what is out: dashed), fd-rp-num (a
   numeral, Big Shoulders), fd-rp-glass (a window cut in a filled object).
   Decorative: the step's words carry its name. */

const F = { fill:"currentColor", stroke:"none" };
const ball = (x, y, r = 2.1) => <circle cx={x} cy={y} r={r} {...F} />;
const Faint = ({ children }) => <g className="fd-rp-faint">{children}</g>;
const Lit = ({ children }) => <g className="fd-rp-lit">{children}</g>;
const Gone = ({ children }) => <g className="fd-rp-gone">{children}</g>;
const trail = d => <path className="fd-rp-trail" d={d} />;
const Num = ({ x, y, size = 11, anchor = "middle", children }) =>
  <text className="fd-rp-num" x={x} y={y} fontSize={size} textAnchor={anchor}>{children}</text>;
/* an arrowhead at (x, y) pointing along `deg` */
const head = (x, y, deg = 0) => <path d="M-2.6 -2.4 0 0-2.6 2.4" transform={`translate(${x} ${y}) rotate(${deg})`} />;
const floor = (y = 34) => <Faint><path d={`M4 ${y}H60`} /></Faint>;
/* a person, head and shoulders, the head at (x, y) */
const bust = (x, y, r = 2.4) => <g>
  <circle cx={x} cy={y} r={r} />
  <path d={`M${x - r * 1.8} ${y + r * 3.5}a${r * 1.8} ${r * 1.8} 0 0 1 ${r * 3.6} 0`} />
</g>;
/* a cup seen from the side, its rim at `top` */
const cup = (x, top, w = 7, h = 8) => <path d={`M${x - w / 2} ${top}h${w}l-${w * 0.14} ${h}h-${w * 0.72}z`} />;
/* the win: a crown standing on (x, base) */
const crown = (x, base, s = 1) => <Lit><path {...F} d={`M${x - 5 * s} ${base}l${-1 * s} ${-7 * s} ${3.5 * s} ${3 * s} ${2.5 * s} ${-5 * s} ${2.5 * s} ${5 * s} ${3.5 * s} ${-3 * s} ${-1 * s} ${7 * s}z`} /></Lit>;
/* a die, filled, with its pips cut */
const die = (x, y, s = 5, deg = -14) => <g transform={`rotate(${deg} ${x} ${y})`}>
  <rect x={x - s / 2} y={y - s / 2} width={s} height={s} rx={s * 0.22} {...F} />
  <g className="fd-rp-glass"><circle cx={x - s * 0.2} cy={y - s * 0.2} r={s * 0.11} /><circle cx={x + s * 0.2} cy={y + s * 0.2} r={s * 0.11} /></g>
</g>;
/* a chip stack, one chip per step, standing on `base` (PayoutLadder's chips) */
const stack = (x, base, n, w = 14) => <g>
  {Array.from({ length:n }, (_, i) => <rect key={i} x={x - w / 2} y={base - (i + 1) * 3.6} width={w} height={2.9} rx={1.45} {...F} />)}
</g>;
/* a hoop side on: backboard at bx, the rim reaching left */
const hoop = (bx = 54, y = 13) => <g>
  <path d={`M${bx} ${y - 8}V${y + 6}`} />
  <path d={`M${bx - 10} ${y}H${bx}`} />
  <path className="fd-rp-faint" d={`M${bx - 9} ${y}l2 6h4l2-6`} />
</g>;
/* half court from above, the hoop at the top */
const halfCourt = <Faint>
  <path d="M4 3.5H60" /><path d="M26 3.5V17H38V3.5" /><path d="M10 3.5V9A22 22 0 0 0 54 9V3.5" />
</Faint>;
const rimTop = <g><path d="M28 5H36" /><circle cx="32" cy="7.6" r="2.1" /></g>;
const tv = (x, y, w, h) => <g><rect x={x} y={y} width={w} height={h} rx="2" /><path d={`M${x + w / 2} ${y + h}v3.5M${x + w / 2 - 6} ${y + h + 3.5}h12`} /></g>;
const scoreToWin = (big, small = "+2") => <g>
  <Num x={27} y={30} size={24}>{big}</Num>
  <Lit><Num x={49} y={22} size={13}>{small}</Num></Lit>
</g>;
/* a row of n marks, the last lit, with the crown over it */
const firstTo = (n, mark = "ball") => {
  const gap = Math.min(10, 50 / (n - 1));
  const x0 = 32 - gap * (n - 1) / 2;
  return <g>
    {Array.from({ length:n }, (_, i) => {
      const x = x0 + i * gap;
      const node = mark === "card" ? <rect x={x - 2.4} y={25} width={4.8} height={6.4} rx={1} {...F} /> : ball(x, 28, 2.6);
      return <React.Fragment key={i}>{i === n - 1 ? <Lit>{node}</Lit> : node}</React.Fragment>;
    })}
    {crown(x0 + gap * (n - 1), 20, 0.9)}
  </g>;
};
const twoBounces = <g>
  <Faint><path d="M4 18H60M4 36H60" /></Faint>
  <path d="M32 18v-6M32 36v-6" />
  {trail("M6 11Q26 -2 43 17.4Q47 12 54 11")}
  {trail("M58 29Q38 16 21 35.4Q17 30 10 29")}
  <Faint><path d="M41 16.8l1.6 1.2 1.6-1.2M19 34.8l1.6 1.2 1.6-1.2" /></Faint>
  {ball(54, 11, 1.8)}{ball(10, 29, 1.8)}
</g>;
const kart = (x = 0, y = 0) => <g transform={`translate(${x} ${y})`}>
  <path d="M6 27h27l-3-7H21l-3-5h-5l-2 5H6z" />
  <circle cx="16" cy="11" r="2.4" />
  <circle cx="11.5" cy="29" r="3.4" {...F} /><circle cx="27.5" cy="29" r="3.4" {...F} />
</g>;
const can = (x, y, h = 14, deg = 0) => <g transform={`rotate(${deg} ${x} ${y + h / 2})`}>
  <rect x={x - 4} y={y} width="8" height={h} rx="1.6" /><path d={`M${x - 2.4} ${y - 1.4}h4.8`} />
</g>;
const stopwatch = (x, y, r = 10) => <g>
  <circle cx={x} cy={y} r={r} /><path d={`M${x} ${y - r}v-2.6M${x - 2.6} ${y - r - 2.8}h5.2`} />
  <Lit><path d={`M${x} ${y}l${r * 0.5} ${-r * 0.5}`} /></Lit>
</g>;
const chip = (x, y, r = 5) => <g><circle cx={x} cy={y} r={r} {...F} /><circle className="fd-rp-glass-line" cx={x} cy={y} r={r * 0.5} /></g>;
const tallestCrowned = <g>
  {floor()}
  <g>{stack(16, 34, 4, 11)}</g>
  <Lit>{stack(32, 34, 6, 11)}</Lit>
  <g>{stack(48, 34, 3, 11)}</g>
  {crown(32, 10, 0.9)}
</g>;
const checkUp = <g>
  {halfCourt}{rimTop}
  {ball(32, 26, 2.2)}
  <circle cx="23" cy="31" r="2.6" {...F} /><circle cx="41" cy="31" r="2.6" {...F} />
  {trail("M25.5 29Q32 21 38.5 29")}{head(38.5, 29, 50)}
</g>;
const scoreArc = (inside, outside) => <g>
  <Faint><path d="M4 3.5H60" /><path d="M9 3.5V7A23 23 0 0 0 55 7V3.5" /></Faint>{rimTop}
  <Num x={32} y={24.5} size={12}>{inside}</Num>
  <Num x={32} y={39.5} size={11}>{outside}</Num>
</g>;

export const RULE_PICTURES = {
  /* ── Long Putt ── */
  "putting.1":<g>
    {floor()}
    <path d="M10 8 17.6 32.6" /><path d="M14 33.2H21.6" strokeWidth="2.6" />
    {ball(26, 32)}{ball(31.5, 32)}{ball(37, 32)}
    <path d="M54 34V12" /><path d="M54 12l7 2.6-7 2.6z" {...F} />
    <ellipse cx="54" cy="34" rx="3.4" ry="1.1" />
  </g>,
  "putting.2":<g>
    <Faint><ellipse cx="32" cy="22" rx="27" ry="14" /></Faint>
    <circle cx="34" cy="21" r="1.8" {...F} />
    <path d="M34 21V5" /><path d="M34 5l6 2.4-6 2.4z" {...F} />
    {ball(12, 27, 1.9)}{ball(53, 14, 1.9)}
    {trail("M41.6 26.2L36.4 22.4")}
    <Lit>{ball(44, 28, 2)}<circle cx="44" cy="28" r="4" /></Lit>
  </g>,
  "putting.3":<g>
    <Faint><path d="M4 30H27M37 30H60" /></Faint>
    <path d="M27 30V37H37V30" />
    <path d="M35.6 30V10" /><path d="M35.6 10l6.4 2.6-6.4 2.6z" {...F} />
    {trail("M8 27Q22 16 31 31")}
    <Lit>{ball(31.6, 34.4, 2.2)}</Lit>
    {ball(14, 28, 2)}
    {crown(17, 15, 0.85)}
  </g>,

  /* ── Beer Die ── */
  "die.1":<g>
    <Faint><path d="M3 11.5H61" strokeDasharray="1.5 2.5" /></Faint>
    <path d="M12 28H52" strokeWidth="2.2" /><path d="M15 28v8M49 28v8" />
    {cup(15, 22, 5, 6)}{cup(49, 22, 5, 6)}
    {bust(6, 15, 2.3)}
    {trail("M9 13Q30 -10 44 26")}
    {die(28.3, 5, 4.6)}
  </g>,
  "die.2":<g>
    <path d="M8 28H56" strokeWidth="2.2" /><path d="M11 28v8M53 28v8" />
    {cup(11, 22, 5, 6)}{cup(53, 22, 5, 6)}
    {trail("M8 4Q30 2 38 26")}
    {trail("M38 26Q42 12 48 9")}
    <Faint><path d="M35 23.6l1.6 1.6M41 23.6l-1.6 1.6" /></Faint>
    {die(49, 8.6, 4.4, 18)}
  </g>,
  "die.3":<g>
    <Faint><path d="M4 37H60" /></Faint>
    <path d="M4 22H38" strokeWidth="2.2" /><path d="M8 22v15M34 22v15" />
    {bust(51, 7, 2.3)}
    {trail("M38 20Q48 4 55 33")}
    <Lit>{die(56, 34.4, 4.4, 10)}<Num x={20} y={15} size={13}>+1</Num></Lit>
  </g>,
  "die.4":<g>
    <path d="M6 32H58" strokeWidth="2.2" />
    <path d="M24 14h16l-2.4 18H26.4z" /><Faint><path d="M25 19h14" /></Faint>
    {trail("M5 9Q18 -2 29 9")}
    <Lit>{die(32, 13, 5, 30)}</Lit>
    {crown(50, 13, 0.9)}
  </g>,

  /* ── Where and When ── */
  "where.1":<g>
    {tv(22, 4, 36, 24)}
    <Faint><path d="M25 25l7-9 5 5 4-4 14 8" /></Faint>
    <circle cx="49" cy="10.5" r="2.2" {...F} />
    <rect x="5" y="11" width="12" height="21" rx="2.2" />
    <Faint><path d="M7 27l3.5-4.5 2 2 1.6-1.6 2 4" /></Faint>
    <circle cx="13.2" cy="15.6" r="1.1" {...F} />
  </g>,
  "where.2":<g>
    <rect x="4" y="7" width="28" height="26" rx="2.2" />
    <Faint><path d="M4 21Q15 15 32 24M15 7v26" /></Faint>
    <Lit><path d="M18 24.5s-5-4.3-5-8.4a5 5 0 0 1 10 0c0 4.1-5 8.4-5 8.4z" {...F} /></Lit>
    <circle className="fd-rp-glass" cx="18" cy="16" r="1.7" />
    <rect x="37" y="9" width="23" height="23" rx="2.2" /><path d="M37 15H60M42 6.5v4.5M55 6.5v4.5" />
    <g {...F}><circle cx="42.5" cy="20.5" r="1.3" /><circle cx="48.5" cy="20.5" r="1.3" /><circle cx="54.5" cy="20.5" r="1.3" />
      <circle cx="42.5" cy="26.5" r="1.3" /><circle cx="54.5" cy="26.5" r="1.3" /></g>
    <Lit><circle cx="48.5" cy="26.5" r="2.6" /></Lit>
  </g>,
  "where.3":<g>
    <Faint><path d="M8 4V34H60" /></Faint>
    <path d="M9 7C20 25 34 31 58 32.5" />
    <Lit>{ball(12, 11.6, 2.4)}</Lit>
    {ball(44, 31, 2)}
  </g>,
  "where.4":<g>
    {floor()}
    <rect x="12" y="20" width="8" height="14" rx="1" /><path d="M12 27h8" />
    <Lit><rect x="28" y="13" width="8" height="21" rx="1" /><path d="M28 23.5h8" /></Lit>
    <rect x="44" y="25" width="8" height="9" rx="1" /><path d="M44 29.5h8" />
    {crown(32, 10, 0.85)}
  </g>,

  /* ── Basketball 1v1 ── */
  "basketball:1v1.1":checkUp,
  "basketball:1v1.2":<g>
    {floor(36)}{hoop()}
    {trail("M8 32Q26 -4 46 11")}
    <Lit>{ball(46.5, 11, 2.4)}<Num x={22} y={24} size={14}>1</Num></Lit>
  </g>,
  "basketball:1v1.3":<g>
    {floor(36)}{hoop()}
    {ball(48, 24, 2.4)}
    {trail("M46 29Q32 40 17 29")}{head(17, 29, 220)}
    {bust(11, 17, 2.4)}
  </g>,
  "basketball:1v1.4":firstTo(5),

  /* ── Basketball 5v5 ── */
  "basketball:5v5.1":<g>
    <Faint><ellipse cx="32" cy="34" rx="13" ry="3" /></Faint>
    {bust(21, 17, 2.4)}{bust(43, 17, 2.4)}
    {trail("M24 13Q28 6 30.5 6")}{trail("M40 13Q36 6 33.5 6")}
    <Lit>{ball(32, 5, 2.6)}</Lit>
  </g>,
  "basketball:5v5.2":scoreArc("2", "3"),
  "basketball:5v5.3":<g>
    {stopwatch(19, 22, 10.5)}
    <Lit><rect x="36" y="16" width="10" height="11" rx="1.4" {...F} /></Lit>
    <rect x="48" y="16" width="10" height="11" rx="1.4" />
  </g>,
  "basketball:5v5.4":<g>
    <path d="M5 17h4l10-6v18l-10-6H5z" />
    <Faint><path d="M23 14a8 8 0 0 1 0 12M27 11a12 12 0 0 1 0 18" /></Faint>
    <rect x="34" y="7" width="25" height="25" rx="2.2" />
    <Lit><rect x="38.5" y="13" width="6.5" height="15" rx="1" {...F} /></Lit>
    <rect x="48.5" y="19" width="6.5" height="9" rx="1" />
  </g>,

  /* ── Pickleball ── */
  "pickleball.1":<g>
    <Faint><rect x="4" y="5" width="56" height="30" rx="1" /><path d="M24 5v30M40 5v30M4 20h20M40 20h20" /></Faint>
    <path d="M32 3v34" strokeWidth="2" />
    <circle cx="7.5" cy="29" r="2.4" {...F} />
    {trail("M10 27Q30 2 50 12")}{head(50, 12, 30)}
    <Lit><rect x="41" y="6" width="18" height="13" rx="1" className="fd-rp-wash" /></Lit>
  </g>,
  "pickleball.2":twoBounces,
  "pickleball.3":<g>
    <Faint><path d="M4 5H60V35H4z" /><path d="M42 5v30" /></Faint>
    <Faint><path d="M33 12l8-7M33 20l9-8M33 28l9-8M35 35l7-7" /></Faint>
    <path d="M32 3v34" strokeWidth="2" />
    <circle cx="38" cy="23" r="2.4" {...F} />
    <circle cx="40.4" cy="14" r="1.8" />
    <circle cx="38" cy="18.5" r="9" /><path d="M31.6 24.9 44.4 12.1" />
  </g>,
  "pickleball.4":scoreToWin("11"),

  /* ── Volleyball ── */
  "volleyball.1":<g>
    {floor()}<path d="M11 34v-4" />
    <path d="M37 34V12" /><rect x="36" y="12" width="2.4" height="9" {...F} />
    {bust(6, 17, 2.3)}
    {trail("M9 13Q26 -3 49 21")}
    {ball(50, 22, 2)}
  </g>,
  "volleyball.2":<g>
    {floor()}
    <path d="M48 34V12" /><rect x="47" y="12" width="2.4" height="9" {...F} />
    {trail("M6 30Q11 12 17 24Q23 9 29 22Q37 0 56 18")}
    <circle cx="6" cy="30" r="2.2" /><circle cx="17" cy="24" r="2.2" /><circle cx="29" cy="22" r="2.2" />
  </g>,
  "volleyball.3":<g>
    {floor()}
    <path d="M30 34V12" /><rect x="29" y="12" width="2.4" height="9" {...F} />
    {trail("M8 12Q30 -6 48 31")}
    <Faint><path d="M43 33l-2-2.4M53 33l2-2.4" /></Faint>
    {ball(48, 31.6, 2.2)}
    <Lit><Num x={49} y={18} size={13}>+1</Num></Lit>
  </g>,
  "volleyball.4":scoreToWin("15"),

  /* ── 8-Ball ── */
  "8ball.1":<g>
    <Faint><rect x="4" y="5" width="56" height="30" rx="3" /></Faint>
    <Faint><g {...F}><circle cx="6" cy="7" r="1.6" /><circle cx="32" cy="6" r="1.6" /><circle cx="58" cy="7" r="1.6" />
      <circle cx="6" cy="33" r="1.6" /><circle cx="32" cy="34" r="1.6" /><circle cx="58" cy="33" r="1.6" /></g></Faint>
    <path d="M2 21.6 10.6 20.4" strokeWidth="2.4" />
    <circle cx="14" cy="20" r="2" />
    {trail("M17 20H40")}
    {ball(44, 20, 1.8)}<circle cx="47.6" cy="18" r="1.8" />{ball(47.6, 22, 1.8)}
    <circle cx="51.2" cy="16" r="1.8" />{ball(51.2, 20, 1.8)}<circle cx="51.2" cy="24" r="1.8" />
  </g>,
  "8ball.2":<g>
    {bust(20, 15, 2.6)}{bust(44, 15, 2.6)}
    {trail("M25 9Q32 3 39 9")}{head(39, 9, 40)}
    {trail("M39 31Q32 37 25 31")}{head(25, 31, 220)}
  </g>,
  "8ball.3":<g>
    <Faint><path d="M4 22V5h22" /></Faint>
    <circle cx="9" cy="10" r="3.2" {...F} />
    {trail("M24 26 12 13")}
    <circle cx="25.5" cy="27.5" r="2" />
    <path d="M41 36v-9a1.6 1.6 0 0 1 3.2 0v-5a1.6 1.6 0 0 1 3.2 0v4.6-1.4a1.6 1.6 0 0 1 3.2 0v2a1.6 1.6 0 0 1 3.2 0V31a5 5 0 0 1-5 5z" />
    <Lit><circle cx="47.6" cy="13" r="2.8" /></Lit>
  </g>,
  "8ball.4":<g>
    <Faint><path d="M38 5h22v17" /></Faint>
    <circle cx="55" cy="10" r="3.2" {...F} />
    <Lit><circle cx="55" cy="10" r="6.4" /></Lit>
    {trail("M27.6 24 50.4 13")}
    <circle cx="23" cy="27" r="4.4" {...F} />
    <circle className="fd-rp-glass" cx="23" cy="26" r="1.9" />
  </g>,

  /* ── Beer Pong ── */
  "pong.1":<g>
    <Faint><rect x="4" y="7" width="56" height="26" rx="2" /><path d="M32 7v26" /></Faint>
    <g>{[[9, 15], [9, 20], [9, 25], [13.4, 17.5], [13.4, 22.5], [17.8, 20]].map(([x, y]) => <circle key={`l${y}${x}`} cx={x} cy={y} r="2" />)}</g>
    <g>{[[55, 15], [55, 20], [55, 25], [50.6, 17.5], [50.6, 22.5], [46.2, 20]].map(([x, y]) => <circle key={`r${y}${x}`} cx={x} cy={y} r="2" />)}</g>
  </g>,
  "pong.2":<g>
    <path d="M30 30H62" strokeWidth="2.2" />
    {cup(44, 24, 5, 6)}{cup(50, 24, 5, 6)}{cup(56, 24, 5, 6)}
    {bust(7, 6, 2.2)}{bust(7, 22, 2.2)}
    {trail("M11 7Q30 -4 43 21")}{trail("M11 23Q33 6 50 21")}
    {ball(43.4, 21.4, 1.7)}{ball(50, 21.4, 1.7)}
  </g>,
  "pong.3":<g>
    <path d="M4 30H60" strokeWidth="2.2" /><path d="M7 30v6M57 30v6" />
    {trail("M6 6Q18 6 26 29")}{trail("M26 29Q36 10 49 23")}
    <Faint><path d="M23 26.6l1.6 1.6M29 26.6l-1.6 1.6" /></Faint>
    {cup(43, 24, 5, 6)}
    <Lit>{cup(49, 24, 5, 6)}{cup(55, 24, 5, 6)}</Lit>
  </g>,
  "pong.4":<g>
    <Faint><rect x="4" y="8" width="56" height="27" rx="2" /><path d="M32 8v27" /></Faint>
    <Faint>{[[9, 17], [9, 22], [9, 27], [13.4, 19.5], [13.4, 24.5], [17.8, 22]].map(([x, y]) => <circle key={`l${y}${x}`} cx={x} cy={y} r="2" />)}</Faint>
    <Gone>{[[55, 17], [55, 22], [55, 27], [50.6, 19.5], [50.6, 24.5], [46.2, 22]].map(([x, y]) => <circle key={`r${y}${x}`} cx={x} cy={y} r="2" />)}</Gone>
    {crown(51, 13, 0.85)}
  </g>,

  /* ── Trivia ── */
  "trivia.1":<g>
    {tv(14, 4, 36, 24)}
    <path d="M28.4 12a3.6 3.6 0 1 1 5.4 3.1c-1.2.7-1.8 1.4-1.8 2.7v.8" strokeWidth="1.9" />
    <circle cx="32" cy="23" r="1.3" {...F} />
  </g>,
  "trivia.2":<g>
    {bust(8, 22, 2)}{bust(15, 19, 2)}{bust(22, 22, 2)}
    {bust(42, 22, 2)}{bust(49, 19, 2)}{bust(56, 22, 2)}
    <Lit><circle cx="15" cy="7" r="2.6" {...F} /><path d="M15 1.6v-1M9.6 7h-1.4M20.4 7h1.4M11.2 3.2l-1-1M18.8 3.2l1-1" /></Lit>
    <Lit><Num x={32} y={14} size={13}>+1</Num></Lit>
  </g>,
  "trivia.3":firstTo(7, "card"),

  /* ── Rage Cage ── */
  "ragecage.1":<g>
    {Array.from({ length:10 }, (_, i) => {
      const a = i * Math.PI / 5;
      return <circle key={i} cx={(32 + Math.cos(a) * 23).toFixed(2)} cy={(20 + Math.sin(a) * 13).toFixed(2)} r="2.4" />;
    })}
    <circle cx="32" cy="20" r="4.4" /><circle cx="32" cy="20" r="2.2" />
    {ball(55, 20, 1.5)}{ball(9, 20, 1.5)}
  </g>,
  "ragecage.2":<g>
    <path d="M4 30H60" strokeWidth="2.2" />
    {cup(34, 22, 6, 8)}
    {trail("M8 8Q16 8 22 29")}{trail("M22 29Q28 14 33 21")}
    <Faint><path d="M19 26.6l1.6 1.6M25 26.6l-1.6 1.6" /></Faint>
    {cup(52, 22, 6, 8)}
    {trail("M38 16Q44 9 49 16")}{head(49, 16, 50)}
  </g>,
  "ragecage.3":<g>
    {floor(36)}
    <path d="M24 18h16l-2.2 18H26.2z" />
    <path d="M23 11h18l-2.4 16H25.4z" />
    <Lit>{ball(44, 5, 2)}</Lit>
    {trail("M42.4 6.4 37 10")}
  </g>,
  "ragecage.4":<g>
    {floor(36)}
    <Gone>{bust(8, 22, 2.2)}{bust(19, 22, 2.2)}{bust(45, 22, 2.2)}{bust(56, 22, 2.2)}</Gone>
    <Lit>{bust(32, 20, 2.6)}</Lit>
    {crown(32, 13, 0.85)}
  </g>,

  /* ── Beerio Kart ── */
  "beerio.1":<g>
    {kart(0, 2)}
    <Faint><path d="M40 4v32" strokeDasharray="3 3" /></Faint>
    {can(50, 16, 15)}
    <Lit><path d="M48 10l-1.6-4M52 10l1.6-4M50 9.6V5" /></Lit>
  </g>,
  "beerio.2":<g>
    {kart(0, 2)}
    <Lit><path d="M41 9v12M47 9v12" strokeWidth="2.6" /></Lit>
    {can(56, 12, 14, 32)}
  </g>,
  "beerio.3":<g>
    <path d="M48 36V5" />
    <rect x="48" y="5" width="12" height="9" />
    <g {...F}><rect x="48" y="5" width="3" height="3" /><rect x="54" y="5" width="3" height="3" /><rect x="51" y="8" width="3" height="3" />
      <rect x="57" y="8" width="3" height="3" /><rect x="48" y="11" width="3" height="3" /><rect x="54" y="11" width="3" height="3" /></g>
    {can(20, 12, 15, 180)}
    {trail("M28 22H42")}{head(42, 22, 0)}
  </g>,
  "beerio.4":<g>
    {[6, 15, 24, 33].map((y, i) => <g key={y}>
      <Lit>{ball(6, y, 1.9)}</Lit>{ball(12, y, 1.9)}{ball(18, y, 1.9)}
      {trail(`M23 ${y}L42 ${10 + i * 6.6}`)}
    </g>)}
    <Lit>{ball(46, 10, 2.2)}</Lit>{ball(46, 16.6, 2.2)}{ball(46, 23.2, 2.2)}{ball(46, 29.8, 2.2)}
    {crown(55, 13, 0.75)}
  </g>,

  /* ── Championship Poker ── */
  "poker.1":<g>
    <Faint><rect x="5" y="9" width="20" height="5" rx="1.5" /><rect x="5" y="25" width="20" height="5" rx="1.5" /></Faint>
    <Lit><rect x="5" y="17" width="20" height="5" rx="1.5" /></Lit>
    {trail("M29 19.5H37")}{head(37.5, 19.5, 0)}
    <Lit>{stack(50, 34, 7, 14)}</Lit>
  </g>,
  "poker.2":<g>
    {stopwatch(15, 22, 9.5)}
    {floor()}
    <Lit>{stack(35, 34, 2, 9)}{stack(46, 34, 4, 9)}{stack(57, 34, 6, 9)}</Lit>
  </g>,
  "poker.3":<g>
    {floor()}
    <Gone><rect x="9" y="27" width="16" height="3" rx="1.5" /><rect x="9" y="23" width="16" height="3" rx="1.5" /></Gone>
    {bust(42, 17, 2.6)}
    {trail("M49 22H58")}{head(58.4, 22, 0)}
  </g>,
  "poker.4":tallestCrowned,

  /* ── earlier slates ── */
  "spikeball.1":<g>
    <circle cx="32" cy="20" r="7" /><Faint><circle cx="32" cy="20" r="4" /></Faint>
    <circle cx="9" cy="31" r="2.4" {...F} /><Faint><circle cx="9" cy="9" r="2.4" {...F} /><circle cx="55" cy="31" r="2.4" {...F} /></Faint>
    <Lit><circle cx="55" cy="9" r="2.4" {...F} /></Lit>
    {trail("M11 29Q22 22 28 21.6")}{trail("M35 18Q45 11 51.6 10")}
  </g>,
  "spikeball.2":<g>
    {floor(36)}
    <ellipse cx="50" cy="30" rx="9" ry="2.4" /><path d="M43 31.4 41.6 36M57 31.4l1.4 4.6" />
    {trail("M6 26Q10 10 16 21Q22 8 28 19Q38 4 49 29")}
    <circle cx="6" cy="26" r="2.2" /><circle cx="16" cy="21" r="2.2" /><circle cx="28" cy="19" r="2.2" />
  </g>,
  "spikeball.3":<g>
    {floor(36)}
    <ellipse cx="38" cy="28" rx="9" ry="2.4" /><path d="M31 29.4 29.6 36M45 29.4l1.4 4.6" />
    {trail("M8 6Q22 4 28.6 27")}{trail("M28.6 27Q24 30 18 34")}
    <Gone><circle cx="16" cy="33.4" r="2" /></Gone>
  </g>,
  "spikeball.4":scoreToWin("11"),
  "pingpong.1":<g>
    <path d="M4 28H60" strokeWidth="2.2" /><path d="M32 28v-6M8 28v8M56 28v8" />
    {ball(8, 16, 2)}{ball(14, 16, 2)}
    {trail("M18 10Q32 0 46 10")}{head(46, 10, 40)}
    <Gone><circle cx="50" cy="16" r="2" /><circle cx="56" cy="16" r="2" /></Gone>
  </g>,
  "pingpong.2":twoBounces,
  "pingpong.3":scoreToWin("11"),
  "foosball.1":<g>
    <Faint><rect x="6" y="5" width="52" height="30" rx="2" /></Faint>
    {[14, 26].map(x => <g key={x}><path d={`M${x} 2v36`} /><rect x={x - 2} y="11" width="4" height="5" rx="1" {...F} /><rect x={x - 2} y="24" width="4" height="5" rx="1" {...F} /></g>)}
    <Faint>{[38, 50].map(x => <g key={x}><path d={`M${x} 2v36`} /><rect x={x - 2} y="11" width="4" height="5" rx="1" /><rect x={x - 2} y="24" width="4" height="5" rx="1" /></g>)}</Faint>
    {ball(32, 20, 1.8)}
  </g>,
  "foosball.2":<g>
    <path d="M6 20H58" />
    <rect x="29" y="12" width="6" height="16" rx="2" {...F} />
    <path d="M24 9a12 12 0 1 1-2 13" />{head(22, 22, 110)}
    <path d="M17 34 47 6" strokeWidth="2.2" />
  </g>,
  "foosball.3":<g>
    <path d="M54 9v22M54 9h6M54 31h6" />
    {trail("M8 26Q24 18 44 20")}
    <Lit>{ball(47, 20, 2.4)}</Lit>
    <Num x={18} y={14} size={14}>10</Num>
  </g>,

  /* ── the weekend ── */
  "fieldday.1":<g>
    {floor(36)}
    <Faint>{bust(12, 20, 2.2)}{bust(52, 20, 2.2)}</Faint>
    <Lit>{stack(32, 36, 9, 16)}</Lit>
  </g>,
  "fieldday.2":<g>
    {floor()}
    <path d="M5 6h11v4a5.5 5.5 0 0 1-11 0z" /><path d="M10.5 15.5V19M7 20h7" />
    {chip(55, 11, 5)}
    {trail("M12 23Q16 30 23 29")}{head(23.4, 29, 0)}
    {trail("M52 19Q48 30 41 29")}{head(40.6, 29, 180)}
    <Lit>{stack(32, 34, 6, 13)}</Lit>
  </g>,
  "fieldday.3":<g>
    {floor()}
    <Lit>{stack(14, 34, 7, 14)}</Lit>
    {trail("M25 20H34")}{head(34.4, 20, 0)}
    <rect x="39" y="9" width="11" height="16" rx="1.8" transform="rotate(-10 44.5 17)" />
    <rect x="46" y="10" width="11" height="16" rx="1.8" transform="rotate(10 51.5 18)" className="fd-rp-card" />
    <path d="m51.5 13.4 2.4 3.4-2.4 3.4-2.4-3.4z" {...F} />
  </g>,
  "fieldday.4":tallestCrowned,
  "betting.1":<g>
    <Faint><rect x="8" y="3.5" width="48" height="9" rx="2" /><rect x="8" y="27.5" width="48" height="9" rx="2" /></Faint>
    <Lit><rect x="8" y="15.5" width="48" height="9" rx="2" /></Lit>
    <Lit>{chip(49, 20, 3)}</Lit>
  </g>,
  "betting.2":<g>
    {bust(13, 9, 2.6)}{bust(51, 9, 2.6)}
    <Faint><path d="M32 6v16" /></Faint>
    <Lit><Num x={32} y={35} size={14}>1:1</Num></Lit>
  </g>,
  "betting.3":<g>
    {bust(9, 9, 2.2)}{bust(24, 9, 2.2)}{bust(40, 9, 2.2)}{bust(55, 9, 2.2)}
    <Lit><Num x={32} y={35} size={14}>2:1</Num></Lit>
  </g>,
  "betting.4":<g>
    <rect x="5" y="15" width="54" height="10" rx="5" />
    <Lit><rect x="5" y="15" width="27" height="10" rx="5" {...F} /></Lit>
    <path d="M32 9v22" strokeWidth="2" />
  </g>,
  "duels.1":<g>
    <rect x="7" y="4" width="21" height="31" rx="3" />
    <circle cx="17.5" cy="15" r="5" {...F} /><Faint><path d="M12 25h11M12 29h7" /></Faint>
    {trail("M31 19.5H40")}{head(40.4, 19.5, 0)}
    {bust(51, 13, 3)}
  </g>,
  "duels.2":<g>
    {floor()}
    <Lit>{stack(14, 34, 3, 14)}{stack(50, 34, 3, 14)}</Lit>
    <path d="M27 21h10M27 26h10" />
  </g>,
  "duels.3":<g>
    <rect x="21" y="3" width="22" height="34" rx="3.4" />
    <Lit><circle cx="32" cy="16" r="3.4" {...F} />
      <path d="M32 8.6V6.4M32 23.4v2.2M24.6 16h-2.2M39.4 16h2.2M26.8 10.8l-1.6-1.6M37.2 10.8l1.6-1.6M26.8 21.2l-1.6 1.6M37.2 21.2l1.6 1.6" /></Lit>
    <Faint><circle cx="32" cy="31" r="2.2" /></Faint>
  </g>,
  "duels.4":<g>
    {floor()}
    {stopwatch(15, 22, 9.5)}
    <Lit>{stack(46, 34, 6, 14)}</Lit>
    {crown(46, 9, 0.85)}
  </g>,
  /* comebacks (v3.1): the bounty, the underdog, the bye */
  "comebacks.1":<g>
    {floor()}
    <Faint>{stack(14, 34, 3, 11)}</Faint>
    <g>{stack(32, 34, 8, 11)}</g>
    <circle cx="32" cy="2.6" r="2" />
    {trail("M20 21Q24 12 27 10")}{head(27.4, 9.6, -40)}
    <Lit><Num x={51} y={22} size={12}>+200</Num></Lit>
  </g>,
  "comebacks.2":<g>
    {floor()}
    <g>{stack(14, 34, 7, 11)}</g>
    <Faint>{stack(50, 34, 2, 11)}</Faint>
    <Lit><Num x={50} y={21} size={12}>2:1</Num></Lit>
    <Faint><path d="M24 9.5h4M36 9.5h4" /></Faint>
  </g>,
  "comebacks.3":<g>
    <path d="M4 7h10v8H4M14 11h8M4 27h10" />
    <path d="M22 11v10h10" />
    <Lit><path d="M14 27H32" strokeDasharray="2 2" /><circle cx="9" cy="27" r="2.6" {...F} /></Lit>
    <path d="M32 21v6M32 24h14" />
    {crown(52, 25, 0.75)}
  </g>,
  "draws.1":<g>
    <path d="M32 7v27M24 34h16M12 11h40" />
    <path d="M12 11 7 22M12 11l5 11M52 11l-5 11M52 11l5 11" />
    <path d="M6 22a6 3 0 0 0 12 0zM46 22a6 3 0 0 0 12 0z" />
    <g {...F}><circle cx="9.6" cy="19" r="1.7" /><circle cx="14.4" cy="19" r="1.7" /><circle cx="49.6" cy="19" r="1.7" /><circle cx="54.4" cy="19" r="1.7" /></g>
  </g>,
  "draws.2":<g>
    {floor()}
    <g {...F}><rect x="7" y="28" width="7" height="6" rx="1" /><rect x="18" y="24" width="7" height="10" rx="1" />
      <rect x="29" y="19" width="7" height="15" rx="1" /><rect x="40" y="13" width="7" height="21" rx="1" /></g>
    <Lit><rect x="51" y="6" width="7" height="28" rx="1" {...F} /></Lit>
  </g>,
  "draws.3":<g>
    {bust(11, 12, 2.8)}{bust(53, 12, 2.8)}
    <Lit><circle cx="11" cy="20.6" r="1.6" {...F} /><circle cx="53" cy="20.6" r="1.6" {...F} /></Lit>
    {ball(26, 30, 2)}{ball(32, 30, 2)}{ball(38, 30, 2)}
    {trail("M24 26Q19 22 17 18")}{head(17, 18, 235)}
  </g>,
};

/* note glyphs, on the icon set's 24 grid */
export const NOTE_GLYPHS = {
  tie:<><circle cx="6" cy="12" r="2.8" {...F} /><circle cx="18" cy="12" r="2.8" {...F} /><path d="M10.4 10.2h3.2M10.4 13.8h3.2" /></>,
  tally:<path d="M6 6v12M10 6v12M14 6v12M18 6v12M4 16 20 8" />,
  height:<><path d="M5 4.5h14" strokeDasharray="1.4 2" /><path d="M12 20V8.5M8.5 12 12 8.5l3.5 3.5" /></>,
  plunk:<><path d="M5 10h10l-1.5 10h-7z" /><rect x="15" y="3" width="5" height="5" rx="1.1" transform="rotate(14 17.5 5.5)" {...F} /></>,
  timer:<><circle cx="12" cy="13.5" r="7.2" /><path d="M12 6.3V3.6M9.8 3h4.4M12 13.5l3.4-3.4" /></>,
  max:<><rect x="5" y="6" width="5.5" height="14" rx="1" {...F} /><rect x="13.5" y="6" width="5.5" height="14" rx="1" {...F} /></>,
  whistle:<><circle cx="9" cy="14.5" r="5" /><path d="M13 10.5h7v4h-5.6" /><circle cx="9" cy="14.5" r="1.4" {...F} /></>,
  half:<><rect x="3.5" y="6" width="17" height="12" rx="1" /><path d="M12 6v12" /><circle cx="12" cy="12" r="2.4" /></>,
  contact:<><circle cx="7" cy="8" r="2.3" /><path d="M3 17a4 4 0 0 1 8 0" /><circle cx="17" cy="8" r="2.3" /><path d="M13 17a4 4 0 0 1 8 0" /><path d="M4 21 20 3" /></>,
  serve:<><circle cx="6" cy="16" r="2.3" {...F} /><path d="M9 13.5Q14 5 20 9.5" /><path d="M17.2 7.4 20 9.5l-2.8 1.8" /></>,
  rotate:<><path d="M18.5 9a7 7 0 0 0-12.6.6" /><path d="M5.5 15a7 7 0 0 0 12.6-.6" /><path d="M18.9 4.8 18.5 9l-4.1-.6M5.1 19.2 5.5 15l4.1.6" /></>,
  sets:<><circle cx="5.5" cy="12" r="2.8" {...F} /><circle cx="12" cy="12" r="2.8" {...F} /><circle cx="18.5" cy="12" r="2.8" /></>,
  cap:<><path d="M4 5h16" strokeWidth="2.4" /><path d="M12 20V9.5M8.5 13 12 9.5l3.5 3.5" /></>,
  rack:<g {...F}><circle cx="12" cy="6" r="1.8" /><circle cx="9" cy="11" r="1.8" /><circle cx="15" cy="11" r="1.8" /><circle cx="6" cy="16" r="1.8" /><circle cx="12" cy="16" r="1.8" /><circle cx="18" cy="16" r="1.8" /></g>,
  swat:<><rect x="3.5" y="10" width="8" height="10.5" rx="3" /><path d="M5.2 10V6.2M7.5 10V5.2M9.8 10V6.2" /><circle cx="17" cy="8.5" r="2.6" {...F} /><path d="M14.4 14.4l-1.4 1.4M19.6 13.6l.8 1.8" /></>,
  redemption:<><path d="M18 6v5a4 4 0 0 1-4 4H6" /><path d="M9 12 6 15l3 3" /></>,
  ring:<><circle cx="12" cy="14.5" r="6" /><path d="M12 8.5 9.6 5.6 12 3l2.4 2.6z" {...F} /></>,
  home:<><path d="M4.6 11 12 4.8l7.4 6.2V19.5H4.6z" /><path d="M10.4 19.5v-4.2h3.2v4.2" /></>,
  group:<><circle cx="6" cy="9" r="2" /><path d="M2.6 16a3.4 3.4 0 0 1 6.8 0" /><circle cx="12" cy="7" r="2" /><path d="M8.6 14a3.4 3.4 0 0 1 6.8 0" /><circle cx="18" cy="9" r="2" /><path d="M14.6 16a3.4 3.4 0 0 1 6.8 0" /></>,
  photo:<><rect x="3.5" y="5.5" width="17" height="13" rx="2" /><path d="m5 16.5 4-4 3 3 2-2 4 3.5" /><circle cx="15.6" cy="9.4" r="1.4" {...F} /></>,
  sports:<><circle cx="12" cy="12" r="7.5" /><path d="M4.5 12h15M12 4.5v15" /></>,
  anywhere:<><circle cx="6" cy="12" r="2.4" {...F} /><path d="M9.5 12H19M9.5 10l8-5M9.5 14l8 5" /><path d="M17 9.8 19 12l-2 2.2" /></>,
  second:<><path d="M3 20h18M8 20V9h8v11M3 20v-7h5M16 20v-4h5" /><path d="M3.6 13.6h3.8v5.8H3.6z" {...F} /></>,
  third:<><path d="M3 20h18M8 20V9h8v11M3 20v-7h5M16 20v-4h5" /><path d="M16.6 16.6h3.8v2.8h-3.8z" {...F} /></>,
  center:<><circle cx="12" cy="12" r="7.5" /><circle cx="12" cy="12" r="3.6" {...F} /></>,
  nosip:<><rect x="8" y="4" width="8" height="16" rx="2" /><path d="M4.5 19.5 19.5 4.5" /></>,
  wait:<><path d="M7 21V3.5" /><rect x="7" y="3.5" width="12" height="9" /><g {...F}><rect x="7" y="3.5" width="3" height="3" /><rect x="13" y="3.5" width="3" height="3" /><rect x="10" y="6.5" width="3" height="3" /><rect x="16" y="6.5" width="3" height="3" /><rect x="7" y="9.5" width="3" height="3" /><rect x="13" y="9.5" width="3" height="3" /></g></>,
  total:<><rect x="8" y="4" width="8" height="16" rx="1" /><path d="M8 12h8" /><path d="M8 4h8v8H8z" {...F} /></>,
  cards:<><rect x="4" y="5" width="9" height="13" rx="1.6" transform="rotate(-10 8.5 11.5)" /><rect x="11" y="6" width="9" height="13" rx="1.6" transform="rotate(10 15.5 12.5)" className="fd-rp-card" /></>,
  order:<path d="M5 7h14M5 12h10M5 17h6" />,
  move:<><path d="M12 3.5v17M3.5 12h17" /><path d="M9.6 6 12 3.5 14.4 6M9.6 18l2.4 2.5 2.4-2.5M6 9.6 3.5 12 6 14.4M18 9.6l2.5 2.4-2.5 2.4" /></>,
  runner:<><circle cx="12" cy="7.5" r="3" /><path d="M6 19.5a6 6 0 0 1 12 0" /></>,
  shuffle:<><path d="M3.5 7h4c4 0 5 10 9 10h4M3.5 17h4c4 0 5-10 9-10h4" /><path d="M18.4 4.8 20.5 7l-2.1 2.2M18.4 14.8l2.1 2.2-2.1 2.2" /></>,
  floor:<><rect x="3" y="9" width="18" height="6" rx="3" /><path d="M3 12a3 3 0 0 1 3-3h4v6H6a3 3 0 0 1-3-3z" {...F} /><path d="M10 6v12" /></>,
  own:<><circle cx="9" cy="8" r="2.6" /><path d="M4.4 17.5a4.6 4.6 0 0 1 9.2 0" /><circle cx="17.5" cy="15" r="3.4" {...F} /></>,
  side:<><circle cx="12" cy="12" r="7.5" /><circle cx="12" cy="12" r="3" /></>,
  lock:<><rect x="6" y="11" width="12" height="9" rx="2" /><path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" /></>,
  fix:<><path d="M7 9h8a4 4 0 0 1 0 8H9" /><path d="M10 5.5 6.5 9l3.5 3.5" /></>,
  void:<><circle cx="12" cy="12" r="7.5" /><path d="M6.7 17.3 17.3 6.7" /></>,
  early:<><path d="M7 21V4" /><path d="M7 4h10l-2.6 3.5L17 11H7z" {...F} /></>,
  daily:<><rect x="4" y="5.5" width="16" height="14.5" rx="2" /><path d="M4 9.5h16M8 3.5v4M16 3.5v4" /><g {...F}><circle cx="8" cy="14.5" r="1.3" /><circle cx="12" cy="14.5" r="1.3" /><circle cx="16" cy="14.5" r="1.3" /></g></>,
  pair:<><circle cx="8" cy="8" r="2.4" /><path d="M3.8 17a4.2 4.2 0 0 1 8.4 0" /><circle cx="16" cy="8" r="2.4" /><path d="M11.8 17a4.2 4.2 0 0 1 8.4 0" /></>,
  lapse:<path d="M7.5 3.5h9l-4.5 8.5 4.5 8.5h-9l4.5-8.5z" />,
  private:<><path d="M3 12s3.4-5.6 9-5.6 9 5.6 9 5.6-3.4 5.6-9 5.6S3 12 3 12z" /><circle cx="12" cy="12" r="2.3" /><path d="M5 19 19 5" /></>,
  drink:<><path d="M6.5 5h11l-1.6 14.5H8.1z" /><path d="M7.2 10h9.6" /></>,
  na:<><path d="M3.5 7h7l-1 11h-5z" /><path d="M13.5 7h7l-1 11h-5z" {...F} /></>,
  forced:<><circle cx="9" cy="8" r="2.6" /><path d="M4.4 17.5a4.6 4.6 0 0 1 9.2 0" /><path d="m14.6 12.6 2.2 2.2 4-4.4" /></>,
  water:<path d="M12 3.5S5.6 10.8 5.6 14.4a6.4 6.4 0 0 0 12.8 0C18.4 10.8 12 3.5 12 3.5z" />,
  camera:<><circle cx="12" cy="12" r="4" /><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(-18 12 12)" /><circle cx="12" cy="12" r="1.4" {...F} /></>,
  stop:<><path d="M8.6 3.5h6.8l5 5v6.8l-5 5H8.6l-5-5V8.5z" /><path d="M8 12h8" /></>,
  semis:<path d="M3.5 5h5v6h-5M8.5 8h4M3.5 13h5v6h-5M8.5 16h4M12.5 8v8M12.5 12h8" />,
  crew:<><circle cx="12" cy="12" r="7.5" strokeDasharray="2 2.4" /><circle cx="12" cy="12" r="3" /></>,
  putt:<><path d="M12 20V4" /><path d="M12 4l7 2.6-7 2.6z" {...F} /><ellipse cx="12" cy="20" rx="5" ry="1.6" /></>,
};

export const PICTURE_KEYS = Object.freeze(Object.keys(RULE_PICTURES));
