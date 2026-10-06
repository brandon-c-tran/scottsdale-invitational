import React from "react";
import { GameMark } from "../../ui/GameMark.jsx";
import { INTRO_TIMING as T } from "./introTiming.js";

/* The game's own set piece on the lit backglass: one painted diorama per
   game in one 1200 x 600 box whose horizon (y 450) meets the painting's,
   in plates (far, mid, near) that push in at different rates. Every scene
   plays its one move from T.play and lands its hero beat exactly at T.hit,
   where the name stamps and the room hears it. The TV shows the whole box;
   a phone shows x 200 to 1000, so everything that matters lives there, and
   after the hit nothing stands above y 180, where the name is lettered.

   Flat inks from the painting (--art-*), bone and the ink keyline; the
   lamps keep their jobs. Every animation runs from the intro's shared
   server instant (--tl, set by GameIntro) and fills both ways, so a late
   screen or reduced motion shows the finished frame. Decorative only. */

const K = "var(--ink0)";
const BONE = "var(--bone)";
const mix = (a, pct, b) => `color-mix(in srgb, ${a} ${pct}%, ${b})`;
/* one animation on the intro's clock: name, ms long, ms after the announcement */
export const run = (name, ms, at, ease = "var(--ease-out)", extra = "") => {
  const value = `${name} ${ms}ms ${ease} calc(var(--tl, 0ms) + ${at}ms) both${extra}`;
  /* --fa keeps the last frame for a still (reduced-motion) intro: intro.css */
  return { "--fa":value, animation:value };
};
const box = { transformBox:"fill-box", transformOrigin:"center" };
const GRAVITY_UP = "cubic-bezier(.33,.66,.6,1)";
const GRAVITY_DOWN = "cubic-bezier(.4,0,.75,.45)";

/* ── shared bits ── */
function Plates({ far = null, mid = null, near = null }) {
  return <>
    {far && <g className="fi-far">{far}</g>}
    {mid && <g className="fi-mid">{mid}</g>}
    {near && <g className="fi-near">{near}</g>}
  </>;
}
/* the light of the hit: a ring and rays from the point it lands */
export function Burst({ x, y, r = 70, flat = 1 }) {
  const rays = [0, 45, 90, 135, 180, 225, 270, 315];
  return <g className="fi-burst" transform={`translate(${x} ${y}) scale(1 ${flat})`} aria-hidden="true">
    <circle r={r} fill="none" stroke={BONE} strokeWidth="6" style={{ ...box, ...run("fi-ring", 620, T.hit, "cubic-bezier(.1,.7,.3,1)") }} />
    <circle r={r * .6} fill="none" stroke={BONE} strokeWidth="4" style={{ ...box, ...run("fi-ring", 520, T.hit + 110, "cubic-bezier(.1,.7,.3,1)") }} />
    {rays.map(deg => <g key={deg} transform={`rotate(${deg})`}>
      <path d={`M${r * .55} 0H${r * 1.05}`} stroke={BONE} strokeWidth="6" strokeLinecap="round"
        style={{ ...box, transformOrigin:"left center", ...run("fi-ray", 460, T.hit, "cubic-bezier(.1,.7,.3,1)") }} />
    </g>)}
  </g>;
}
/* droplets or sand thrown up where something lands */
function Spray({ x, y, color, n = 7, spread = 70, rise = 70, size = 6, at = T.hit }) {
  return <g transform={`translate(${x} ${y})`}>
    {Array.from({ length:n }, (_, i) => {
      const k = n > 1 ? i / (n - 1) : .5;
      const dx = Math.round((k - .5) * 2 * spread), dy = -Math.round(rise * (1 - Math.abs(k - .5) * 1.1));
      return <circle key={i} r={size * (i % 2 ? .8 : 1)} fill={color} stroke={K} strokeWidth="2"
        style={{ "--dx":`${dx}px`, "--dy":`${dy}px`, ...run("fi-spray", 520 + (i % 3) * 60, at, "cubic-bezier(.2,.7,.4,1)") }} />;
    })}
  </g>;
}
/* a cup seen a little from above: rim, liquid or hollow, a tapered body */
function Cup({ x, y, w = 44, h = 50, body = "var(--art-rose)", rim = BONE, inner = null, style }) {
  const r = w / 2, b = r * .78, ry = Math.max(4, w * .16);
  return <g style={style}>
    <path d={`M${x - r} ${y}L${x - b} ${y + h}Q${x} ${y + h + ry * .9} ${x + b} ${y + h}L${x + r} ${y}Z`} fill={body} stroke={K} strokeWidth="4" strokeLinejoin="round" />
    <path d={`M${x - r * .62} ${y + h * .2}L${x - b * .62} ${y + h * .88}`} stroke={BONE} strokeOpacity=".28" strokeWidth={Math.max(3, w * .08)} strokeLinecap="round" />
    <ellipse cx={x} cy={y} rx={r} ry={ry} fill={inner || mix(body, 55, K)} stroke={rim} strokeWidth={Math.max(3, w * .09)} />
  </g>;
}
/* a ballistic flight: x on one plate, y (gravity) on the next, spin and
   size on the body. Keyframes are written per object in intro.css. */
function Flight({ x, y, children, xs, ys, body = null }) {
  return <g style={xs}><g style={ys}><g transform={`translate(${x} ${y})`}><g style={{ ...box, ...body }}>{children}</g></g></g></g>;
}

/* ── Long Putt: the long green, a putt rolled the whole way, the drop ── */
function Putting() {
  const green = mix("var(--art-sage)", 62, "var(--art-turquoise)");
  return <Plates
    far={<>
      <path d="M880 470V244" stroke={K} strokeWidth="12" strokeLinecap="round" />
      <path d="M880 470V244" stroke={BONE} strokeWidth="5" strokeLinecap="round" />
      {/* the flag flies back up the green, so a phone's crop keeps it */}
      <g style={{ ...box, transformOrigin:"right center", ...run("fi-flag", 700, T.hit, "ease-in-out", " 2 alternate") }}>
        <path d="M878 246L782 270L878 296Z" fill="var(--art-rose)" stroke={K} strokeWidth="4" strokeLinejoin="round" />
      </g>
    </>}
    mid={<>
      <path d="M-300 600V560C40 520 520 482 800 462L1010 452C1052 466 1030 494 962 507C800 540 610 574 580 600Z" fill={mix(green, 70, K)} />
      <path d="M-300 600V570C40 532 540 490 806 470L1000 460C1030 470 1012 488 958 500C800 532 620 566 590 600Z" fill={green} />
      <path d="M220 590C420 530 640 494 900 470" fill="none" stroke={BONE} strokeOpacity=".14" strokeWidth="26" strokeLinecap="round" />
      <path d="M372 562Q620 500 866 474" fill="none" stroke={BONE} strokeOpacity=".4" strokeWidth="4" strokeLinecap="round"
        pathLength="100" strokeDasharray="100" style={run("fi-trail", 1050, T.play, "cubic-bezier(.2,.65,.3,1)")} />
      <ellipse cx="880" cy="472" rx="22" ry="7" fill={K} stroke={BONE} strokeOpacity=".5" strokeWidth="2" />
      <g style={{ ...box, ...run("fi-putt-roll", 1050, T.play, "cubic-bezier(.2,.65,.3,1)") }}>
        <g style={{ ...box, ...run("fi-putt-drop", 130, T.hit - 80, "cubic-bezier(.5,0,.8,.5)") }}>
          <circle cx="372" cy="560" r="15" fill={BONE} stroke={K} strokeWidth="4" />
          <circle cx="367" cy="555" r="4" fill="var(--ink0)" opacity=".12" />
        </g>
      </g>
      <Burst x={880} y={470} r={62} flat={.45} />
    </>}
    near={<g style={{ transformOrigin:"190px -60px", ...run("fi-putter", 420, T.play - 300, "cubic-bezier(.45,0,.3,1)") }}>
      {/* the club comes in from out of frame, the golfer's side */}
      <path d="M190 -60L318 548" stroke={K} strokeWidth="14" strokeLinecap="round" />
      <path d="M190 -60L318 548" stroke="var(--silver)" strokeWidth="6" strokeLinecap="round" />
      <path d="M298 546h52a7 7 0 0 1 0 16h-52z" fill="var(--silver)" stroke={K} strokeWidth="4" strokeLinejoin="round" />
      <path d="M190 -60l26 124" stroke={K} strokeWidth="20" strokeLinecap="round" />
    </g>}
  />;
}

/* ── Beer Die: the high toss, the bounce off the table, the plunk ── */
function Die() {
  const wood = mix("var(--art-umber)", 70, "var(--art-tangerine)");
  const beer = mix("var(--art-tangerine)", 40, "var(--art-cream)");
  const cup = (x, y, k) => <Cup key={k} x={x} y={y} w={46} h={48} body={mix("var(--art-cream)", 30, "var(--art-turquoise)")} inner={beer} />;
  return <Plates
    mid={<>
      <path d="M230 455H970L1030 520H170Z" fill={wood} stroke={K} strokeWidth="5" strokeLinejoin="round" />
      <path d="M170 520H1030V548H170Z" fill={mix(wood, 55, K)} stroke={K} strokeWidth="5" strokeLinejoin="round" />
      <path d="M200 548v52M978 548v52" stroke={K} strokeWidth="20" />
      <path d="M600 457V518" stroke={BONE} strokeOpacity=".45" strokeWidth="4" strokeDasharray="10 8" />
      <path d="M260 466H940" stroke={BONE} strokeOpacity=".12" strokeWidth="6" />
      {cup(270, 452, "a")}{cup(318, 470, "b")}{cup(880, 452, "c")}
      <ellipse cx="790" cy="490" rx="40" ry="8" fill="none" stroke={BONE} strokeWidth="4" style={{ ...box, ...run("fi-ring", 420, 1380) }} />
    </>}
    near={<>
      {cup(930, 470, "d")}
      <Flight x={230} y={330} xs={run("fi-die-x", 1100, T.play, "linear")} ys={run("fi-die-y", 1100, T.play, "linear")}
        body={run("fi-die-spin", 1100, T.play, "linear")}>
        <g style={{ ...box, ...run("fi-sink", 140, T.hit - 40, "cubic-bezier(.5,0,.8,.5)") }}>
          <rect x="-19" y="-19" width="38" height="38" rx="8" fill={BONE} stroke={K} strokeWidth="4" />
          {[[-8, -8], [8, -8], [0, 0], [-8, 8], [8, 8]].map(([cx, cy]) => <circle key={`${cx}${cy}`} cx={cx} cy={cy} r="3.6" fill={K} />)}
        </g>
      </Flight>
      <Spray x={930} y={468} color={beer} />
      <Burst x={930} y={470} r={60} flat={.5} />
    </>}
  />;
}

/* ── Where and When: the photo, the clock spinning back, the pin dropping ── */
function Where() {
  const paper = mix("var(--art-cream)", 82, K);
  return <Plates
    mid={<>
      <path d="M250 442H950L1080 600H120Z" fill={paper} stroke={K} strokeWidth="5" strokeLinejoin="round" />
      <path d="M610 470C710 456 830 472 870 502C910 542 826 584 706 572C626 562 566 520 610 470Z" fill={mix("var(--art-turquoise)", 80, "var(--art-cream)")} stroke={K} strokeWidth="3" />
      <path d="M170 596C380 524 520 522 700 472S930 450 1004 446" fill="none" stroke="var(--art-terracotta)" strokeWidth="7" strokeLinecap="round" />
      <path d="M330 600C390 540 420 500 470 444M760 600C740 540 760 480 820 444" fill="none" stroke={mix("var(--art-terracotta)", 60, paper)} strokeWidth="4" />
      {[476, 516, 560].map(y => <path key={y} d={`M${250 - (y - 442) * .82} ${y}H${950 + (y - 442) * .82}`} stroke={K} strokeOpacity=".12" strokeWidth="2" />)}
      <ellipse cx="520" cy="522" rx="34" ry="9" fill={K} opacity=".35" style={{ ...box, ...run("fi-shadow", 350, T.hit - 350, GRAVITY_DOWN) }} />
      {[0, 160].map(d => <ellipse key={d} cx="520" cy="522" rx="70" ry="18" fill="none" stroke="var(--art-rose)" strokeWidth="5"
        style={{ ...box, ...run("fi-ripple", 760, T.hit + d, "cubic-bezier(.1,.7,.3,1)") }} />)}
    </>}
    near={<>
      <g transform="rotate(-8 360 300)">
        <g style={{ ...box, ...run("fi-photo", 420, T.play, "var(--ease-land)") }}>
          <rect x="288" y="214" width="144" height="168" rx="5" fill={BONE} stroke={K} strokeWidth="5" />
          <rect x="300" y="226" width="120" height="118" fill={mix("var(--art-cobalt)", 70, "var(--art-indigo)")} />
          <circle cx="388" cy="262" r="16" fill="var(--art-cream)" />
          <path d="M300 344L300 312L330 296L352 316L376 300L420 326V344Z" fill="var(--art-terracotta)" />
        </g>
      </g>
      <g>
        <circle cx="846" cy="292" r="74" fill={K} />
        <circle cx="846" cy="292" r="66" fill={BONE} />
        {Array.from({ length:12 }, (_, i) => <path key={i} d="M846 232v12" stroke={K} strokeWidth={i % 3 ? 3 : 6} transform={`rotate(${i * 30} 846 292)`} />)}
        <g style={{ transformOrigin:"846px 292px", ...run("fi-hour", 1100, T.play, "cubic-bezier(.2,.7,.3,1)") }}>
          <path d="M846 292V252" stroke={K} strokeWidth="9" strokeLinecap="round" /></g>
        <g style={{ transformOrigin:"846px 292px", ...run("fi-minute", 1100, T.play, "cubic-bezier(.2,.7,.3,1)") }}>
          <path d="M846 292V240" stroke="var(--art-rose)" strokeWidth="6" strokeLinecap="round" /></g>
        <circle cx="846" cy="292" r="7" fill={K} />
      </g>
      <g style={run("fi-pin-drop", 350, T.hit - 350, GRAVITY_DOWN)}>
        <g style={{ transformBox:"fill-box", transformOrigin:"50% 100%", ...run("fi-squash", 360, T.hit, "var(--ease-land)") }}>
          <path d="M520 520C510 494 486 480 486 456A34 34 0 1 1 554 456C554 480 530 494 520 520Z" fill="var(--art-rose)" stroke={K} strokeWidth="5" strokeLinejoin="round" />
          <circle cx="520" cy="455" r="12" fill={BONE} stroke={K} strokeWidth="3" />
        </g>
      </g>
    </>}
  />;
}

/* courts share their wood */
const WOOD_COURT = mix("var(--art-tangerine)", 52, "var(--art-umber)");
function Ball({ r, fill = "var(--art-tangerine)", seams = true }) {
  return <>
    <circle r={r} fill={fill} stroke={K} strokeWidth={Math.max(3, r * .12)} />
    {seams && <path d={`M${-r} 0H${r}M0 ${-r}V${r}M${-r * .62} ${-r * .78}C${-r * .1} ${-r * .3} ${-r * .1} ${r * .3} ${-r * .62} ${r * .78}M${r * .62} ${-r * .78}C${r * .1} ${-r * .3} ${r * .1} ${r * .3} ${r * .62} ${r * .78}`}
      fill="none" stroke={K} strokeWidth={Math.max(2, r * .07)} />}
    <path d={`M${-r * .55} ${-r * .35}A${r * .7} ${r * .7} 0 0 1 ${-r * .1} ${-r * .68}`} fill="none" stroke={BONE} strokeOpacity=".45" strokeWidth={Math.max(2, r * .12)} strokeLinecap="round" />
  </>;
}
function Net({ x, y, w = 56, h = 46 }) {
  const top = x - w / 2, b = w * .32;
  return <path d={`M${top} ${y}L${x - b} ${y + h}M${top + w} ${y}L${x + b} ${y + h}M${top + w * .25} ${y}L${x - b * .4} ${y + h}M${top + w * .75} ${y}L${x + b * .4} ${y + h}M${top + 4} ${y + h * .35}H${top + w - 4}M${x - b - 2} ${y + h * .7}H${x + b + 2}`}
    fill="none" stroke={BONE} strokeOpacity=".8" strokeWidth="3" strokeLinecap="round" />;
}

/* ── 5v5 Full Court: the whole floor, the heave from the near end, swish ── */
function FullCourt() {
  return <Plates
    far={<>
      <path d="M600 456V316" stroke={K} strokeWidth="14" />
      <rect x="548" y="300" width="104" height="70" rx="4" fill={BONE} stroke={K} strokeWidth="5" />
      <rect x="582" y="334" width="36" height="28" fill="none" stroke="var(--art-rose)" strokeWidth="4" />
      <g style={{ transformBox:"fill-box", transformOrigin:"50% 0", ...run("fi-net", 420, T.hit, "var(--ease-land)") }}><Net x={600} y={390} w={54} h={40} /></g>
      <ellipse cx="600" cy="390" rx="28" ry="7" fill="none" stroke="var(--art-tangerine)" strokeWidth="6" />
    </>}
    mid={<>
      <path d="M360 455H840L1110 600H90Z" fill={WOOD_COURT} stroke={K} strokeWidth="5" strokeLinejoin="round" />
      <path d="M528 455H672L690 482H510Z" fill={mix("var(--art-rose)", 60, WOOD_COURT)} />
      <path d="M266 506H934M466 455Q600 500 734 455" fill="none" stroke={BONE} strokeOpacity=".55" strokeWidth="4" />
      <ellipse cx="600" cy="506" rx="74" ry="14" fill="none" stroke={BONE} strokeOpacity=".55" strokeWidth="4" />
      <path d="M210 600Q600 520 990 600" fill="none" stroke={BONE} strokeOpacity=".55" strokeWidth="5" />
      <path d="M470 600L500 560H700L730 600" fill={mix("var(--art-rose)", 60, WOOD_COURT)} stroke={BONE} strokeOpacity=".55" strokeWidth="4" />
    </>}
    near={<>
      {/* the near hoop, close and dark, at the edge of the frame */}
      <path d="M-70 795V270H-14V795Z" fill={K} />
      <path d="M-150 100H80V290H-150Z" fill={K} stroke={BONE} strokeOpacity=".3" strokeWidth="5" />
      <path d="M-40 190H40V270H-40Z" fill="none" stroke={BONE} strokeOpacity=".22" strokeWidth="5" />
      <ellipse cx="20" cy="300" rx="62" ry="15" fill="none" stroke={mix("var(--art-tangerine)", 55, K)} strokeWidth="9" />
      <Flight x={300} y={510} xs={run("fi-heave-x", 1100, T.play, "linear")} ys={run("fi-heave-y", 1100, T.play, "linear")}
        body={run("fi-heave-spin", 1100, T.play, "linear")}>
        <g style={{ ...box, ...run("fi-swish", 220, T.hit, "cubic-bezier(.5,0,.8,.5)") }}><Ball r={36} /></g>
      </Flight>
      <Burst x={600} y={398} r={58} />
    </>}
  />;
}

/* ── Pickleball Doubles: the paddle pops it, the dink drops in the kitchen ── */
function Pickleball() {
  const court = mix("var(--art-cobalt)", 70, "var(--art-teal)");
  return <Plates
    mid={<>
      <path d="M300 455H900L1080 600H120Z" fill={court} stroke={K} strokeWidth="5" strokeLinejoin="round" />
      <path d="M268 480H932L999 535H201Z" fill={mix("var(--art-turquoise)", 70, court)} />
      <path d="M268 480H932M201 535H999M600 535L600 600M600 455V480" fill="none" stroke={BONE} strokeWidth="4" strokeOpacity=".8" />
      <path d="M238 505V448M962 505V448" stroke={K} strokeWidth="10" strokeLinecap="round" />
      <path d="M238 460H962V503H238Z" fill={K} fillOpacity=".5" />
      <path d={Array.from({ length:24 }, (_, i) => `M${250 + i * 30} 462V503`).join("")} stroke={BONE} strokeOpacity=".22" strokeWidth="2" />
      <path d="M238 460H962" stroke={BONE} strokeWidth="6" />
      <ellipse cx="560" cy="478" rx="16" ry="4" fill={K} opacity=".4" />
      <Burst x={560} y={474} r={48} flat={.5} />
    </>}
    near={<>
      {/* the paddle comes in from below the frame, the player's hand */}
      <g style={{ transformOrigin:"930px 800px", ...run("fi-paddle", 360, T.play + 80, "cubic-bezier(.4,0,.2,1)") }}>
        <path d="M896 560L926 820" stroke={K} strokeWidth="40" strokeLinecap="round" />
        <path d="M896 560L926 820" stroke={mix(K, 70, BONE)} strokeWidth="26" strokeLinecap="round" strokeDasharray="6 16" />
        <rect x="822" y="384" width="148" height="186" rx="50" fill="var(--art-rose)" stroke={K} strokeWidth="7" />
        <path d="M852 414C880 400 920 400 942 414" stroke={BONE} strokeOpacity=".4" strokeWidth="7" fill="none" strokeLinecap="round" />
      </g>
      <Flight x={840} y={440} xs={run("fi-dink-x", 1400, T.play + 200, "linear")} ys={run("fi-dink-y", 1400, T.play + 200, "linear")}
        body={run("fi-dink-size", 1400, T.play + 200, "linear")}>
        <circle r="17" fill="var(--art-cream)" stroke={K} strokeWidth="4" />
        <g fill={K} opacity=".55"><circle cx="-6" cy="-4" r="2.6" /><circle cx="6" cy="-4" r="2.6" /><circle cx="0" cy="6" r="2.6" /></g>
      </Flight>
    </>}
  />;
}

/* ── 1v1 Basketball: two dribbles, the pull-up, the net snaps ── */
function OneOnOne() {
  return <Plates
    far={<>
      <path d="M960 600V214H900" fill="none" stroke={K} strokeWidth="18" strokeLinejoin="round" />
      <path d="M960 600V214H900" fill="none" stroke={mix("var(--art-cobalt)", 70, BONE)} strokeWidth="8" strokeLinejoin="round" />
      <rect x="886" y="196" width="14" height="128" fill={BONE} stroke={K} strokeWidth="4" />
    </>}
    mid={<>
      <path d="M-300 470H1500V795H-300Z" fill={WOOD_COURT} />
      <path d="M-300 470H1500" stroke={K} strokeWidth="5" />
      <path d="M640 470H1500V500H640Z" fill={mix("var(--art-rose)", 55, WOOD_COURT)} />
      <path d="M-300 520H1500" stroke={BONE} strokeOpacity=".1" strokeWidth="20" />
      <g style={{ transformBox:"fill-box", transformOrigin:"50% 0", ...run("fi-net", 420, T.hit, "var(--ease-land)") }}><Net x={852} y={294} w={66} h={52} /></g>
      <path d="M818 292H888" stroke="var(--art-tangerine)" strokeWidth="8" strokeLinecap="round" />
      <ellipse cx="852" cy="292" rx="35" ry="8" fill="none" stroke={K} strokeWidth="3" />
    </>}
    near={<>
      <Flight x={0} y={0} xs={run("fi-one-x", 2100, 300, "linear")} ys={run("fi-one-y", 2100, 300, "linear")}
        body={run("fi-one-spin", 2100, 300, "linear")}>
        <Ball r={30} />
      </Flight>
      <path d="M818 292H852" stroke="var(--art-tangerine)" strokeWidth="8" strokeLinecap="round" />
      <Burst x={852} y={300} r={56} />
    </>}
  />;
}

/* ── Sand Volleyball: the set, the spike, the sand ── */
function Volleyball() {
  const sand = mix("var(--art-cream)", 66, "var(--art-tangerine)");
  return <Plates
    mid={<>
      <path d="M260 455H940L1120 600H80Z" fill={sand} stroke={K} strokeWidth="5" strokeLinejoin="round" />
      {[[300, 560], [420, 520], [700, 585], [860, 540], [990, 590], [560, 470], [780, 478]].map(([x, y]) =>
        <circle key={x} cx={x} cy={y} r="4" fill={K} opacity=".14" />)}
      <path d="M198 505V330M1002 505V330" stroke={K} strokeWidth="14" strokeLinecap="round" />
      <path d="M198 505V330M1002 505V330" stroke={BONE} strokeWidth="5" strokeLinecap="round" />
      <path d="M198 340H1002V398H198Z" fill={K} fillOpacity=".45" />
      <path d={`${Array.from({ length:27 }, (_, i) => `M${212 + i * 29.5} 340V398`).join("")}M198 360H1002M198 379H1002`} stroke={BONE} strokeOpacity=".25" strokeWidth="2" />
      <path d="M198 340H1002" stroke={BONE} strokeWidth="8" />
      <ellipse cx="790" cy="494" rx="26" ry="6" fill={K} opacity=".35" />
      <Spray x={790} y={490} color={sand} n={9} spread={90} rise={60} size={7} />
      <Burst x={790} y={488} r={64} flat={.45} />
    </>}
    near={<>
      <Flight x={0} y={0} xs={run("fi-vb-x", 1450, T.play, "linear")} ys={run("fi-vb-y", 1450, T.play, "linear")}
        body={run("fi-vb-size", 1450, T.play, "linear")}>
        <circle r="30" fill={BONE} stroke={K} strokeWidth="4" />
        <path d="M-26-14C-10-20 10-16 24 0M-28 10C-8 2 14 6 26 18M-6-29C4-14 6 8 0 29" fill="none" stroke="var(--art-cobalt)" strokeWidth="4" />
      </Flight>
      <g transform="translate(500 140)"><circle r="44" fill="none" stroke={BONE} strokeWidth="5" style={{ ...box, ...run("fi-ring", 380, 1300) }} /></g>
    </>}
  />;
}

/* ── Trivia: the card turns, the lamps chase, one player rings in ── */
function Trivia() {
  const desk = mix("var(--art-violet)", 70, "var(--art-plum)");
  const lit = "var(--art-cream)", dark = mix("var(--art-cream)", 18, K);
  const desks = [300, 450, 600, 750, 900];
  const blink = (i, k) => run("fi-blink", 180, 900 + (k * 5 + i) * 110, "steps(1, end)");
  return <Plates
    mid={<>
      <g style={{ ...box, ...run("fi-card-back", 150, 900, "cubic-bezier(.5,0,.8,.5)") }}>
        <rect x="474" y="196" width="252" height="166" rx="14" fill={mix("var(--art-cobalt)", 80, K)} stroke={K} strokeWidth="6" />
        <rect x="490" y="212" width="220" height="134" rx="8" fill="none" stroke={BONE} strokeOpacity=".4" strokeWidth="3" strokeDasharray="8 8" />
      </g>
      <g style={{ ...box, ...run("fi-card-front", 200, 1050, "var(--ease-land)") }}>
        <rect x="474" y="196" width="252" height="166" rx="14" fill={BONE} stroke={K} strokeWidth="6" />
        <path d="M570 252C570 222 630 222 630 252C630 276 600 278 600 302" fill="none" stroke={K} strokeWidth="18" strokeLinecap="round" />
        <circle cx="600" cy="334" r="10" fill={K} />
      </g>
    </>}
    near={<>
      {desks.map((x, i) => <g key={x}>
        <g style={i === 3 ? { ...box, ...run("fi-buzz", 220, T.hit - 60, "var(--ease-land)") } : undefined}>
          <ellipse cx={x} cy="420" rx="28" ry="12" fill={i === 3 ? "var(--art-rose)" : mix("var(--art-rose)", 40, K)} stroke={K} strokeWidth="4" />
          <ellipse cx={x} cy="415" rx="19" ry="7" fill={BONE} opacity=".18" />
        </g>
        <path d={`M${x - 60} 428H${x + 60}V444H${x - 60}Z`} fill={BONE} stroke={K} strokeWidth="4" />
        <path d={`M${x - 52} 444H${x + 52}L${x + 45} 590H${x - 45}Z`} fill={desk} stroke={K} strokeWidth="5" strokeLinejoin="round" />
        <circle cx={x} cy="492" r="17" fill={dark} stroke={K} strokeWidth="3" />
        {[0, 1].map(k => <circle key={k} cx={x} cy="492" r="17" fill={lit} style={blink(i, k)} opacity="0" />)}
        {i === 3 && <circle cx={x} cy="492" r="17" fill={lit} style={run("fi-on", 120, T.hit, "steps(1, end)")} />}
      </g>)}
      <Burst x={750} y={418} r={60} flat={.6} />
    </>}
  />;
}

/* ── 8-Ball Doubles: the cue, the break, the eight in the corner ── */
const RACK = [[600, 490], [586, 478], [614, 478], [572, 466], [600, 466], [628, 466], [558, 454], [586, 454], [614, 454], [642, 454]];
const RACK_INK = ["var(--art-tangerine)", "var(--art-cobalt)", "var(--art-rose)", "var(--art-violet)", null,
  "var(--art-turquoise)", "var(--art-terracotta)", "var(--art-cream)", "var(--art-sage)", "var(--art-indigo)"];
const SCATTER = [[-150, 40], [-250, 10], [180, 32], [-120, 22], null, [250, 12], [-230, 6], [-60, 30], [90, 24], [230, 8]];
function EightBall() {
  const felt = mix("var(--art-sage)", 78, "var(--art-teal)");
  return <Plates
    mid={<>
      <path d="M250 410H950L1090 600H110Z" fill={mix("var(--art-umber)", 85, K)} stroke={K} strokeWidth="5" strokeLinejoin="round" />
      <path d="M286 424H914L1036 590H164Z" fill={felt} />
      <path d="M300 432H900" stroke={BONE} strokeOpacity=".1" strokeWidth="10" />
      {[[290, 428, 14], [910, 428, 14], [600, 422, 11], [170, 586, 20], [1030, 586, 20]].map(([x, y, r]) =>
        <circle key={x + y} cx={x} cy={y} r={r} fill={K} />)}
      {RACK.map(([x, y], i) => i === 4 ? null : <g key={i} style={{ "--dx":`${SCATTER[i][0]}px`, "--dy":`${SCATTER[i][1]}px`,
        ...run("fi-scatter", 620, 1250, "cubic-bezier(.15,.7,.3,1)") }}>
        <circle cx={x} cy={y} r="13" fill={RACK_INK[i]} stroke={K} strokeWidth="3" />
        <circle cx={x - 4} cy={y - 4} r="3" fill={BONE} opacity=".45" />
      </g>)}
      <g style={run("fi-eight", 550, 1250, "cubic-bezier(.2,.6,.45,1)")}>
        <g style={{ ...box, ...run("fi-sink", 110, T.hit - 30, "cubic-bezier(.5,0,.8,.5)") }}>
          <circle cx="600" cy="466" r="13" fill={K} stroke={BONE} strokeOpacity=".5" strokeWidth="2" />
          <circle cx="600" cy="466" r="6" fill={BONE} />
          <path d="M600 463.4a1.6 1.6 0 1 0 .01 0M600 466.6a2 2 0 1 0 .01 0" fill="none" stroke={K} strokeWidth="1.4" />
        </g>
      </g>
      <g style={run("fi-cueball", 700, 1050, "cubic-bezier(.2,.8,.4,1)")}>
        <circle cx="600" cy="560" r="17" fill={BONE} stroke={K} strokeWidth="4" />
      </g>
      <Burst x={910} y={428} r={50} flat={.55} />
    </>}
    near={<g style={run("fi-cue", 400, T.play, "cubic-bezier(.6,0,.2,1)")}>
      <path d="M606 584L712 900" stroke={K} strokeWidth="22" strokeLinecap="round" />
      <path d="M606 584L712 900" stroke={mix("var(--art-cream)", 70, "var(--art-umber)")} strokeWidth="12" strokeLinecap="round" />
      <path d="M606 584L612 602" stroke={BONE} strokeWidth="12" strokeLinecap="round" />
      <path d="M660 744L712 900" stroke={mix("var(--art-umber)", 80, K)} strokeWidth="14" />
    </g>}
  />;
}

/* ── Beer Pong Doubles: the arc from your end, into their rack ── */
function Pong() {
  const table = mix("var(--art-indigo)", 60, "var(--art-cobalt)");
  const cups = [[560, 438], [600, 438], [640, 438], [580, 450], [620, 450], [600, 462]];
  return <Plates
    mid={<>
      <path d="M470 440H730L1000 600H200Z" fill={table} stroke={K} strokeWidth="5" strokeLinejoin="round" />
      <path d="M486 446L232 596M714 446L968 596" stroke={BONE} strokeWidth="5" strokeOpacity=".75" />
      <path d="M600 446V596" stroke={BONE} strokeWidth="3" strokeOpacity=".35" />
      {cups.map(([x, y], i) => <Cup key={i} x={x} y={y - 22} w={36} h={24}
        style={i === 4 ? { ...box, transformOrigin:"50% 100%", ...run("fi-wobble", 520, T.hit, "ease-out") } : undefined} />)}
      <Spray x={620} y={428} color={mix("var(--art-tangerine)", 40, "var(--art-cream)")} n={6} spread={40} rise={50} size={5} />
      <Burst x={620} y={430} r={48} flat={.5} />
    </>}
    near={<>
      <Cup x={190} y={500} w={96} h={110} />
      <Cup x={1010} y={500} w={96} h={110} />
      <Flight x={440} y={470} xs={run("fi-pong-x", 1100, T.play, "linear")} ys={run("fi-pong-y", 1100, T.play, "linear")}
        body={run("fi-pong-size", 1100, T.play, "linear")}>
        <g style={{ ...box, ...run("fi-sink", 120, T.hit - 40, "cubic-bezier(.5,0,.8,.5)") }}>
          <circle r="19" fill={BONE} stroke={K} strokeWidth="4" />
          <circle cx="-6" cy="-6" r="5" fill={K} opacity=".1" />
        </g>
      </Flight>
    </>}
  />;
}

/* ── Rage Cage: the bounce, the make, and the stack ── */
function RageCage() {
  const wood = mix("var(--art-umber)", 70, "var(--art-terracotta)");
  const cage = [[520, 470], [560, 462], [600, 458], [640, 462], [680, 470], [560, 484], [600, 488], [640, 484]];
  return <Plates
    mid={<>
      <ellipse cx="600" cy="520" rx="440" ry="92" fill={mix(wood, 60, K)} />
      <ellipse cx="600" cy="506" rx="440" ry="86" fill={wood} stroke={K} strokeWidth="5" />
      <ellipse cx="600" cy="500" rx="380" ry="64" fill="none" stroke={BONE} strokeOpacity=".1" strokeWidth="10" />
      {cage.map(([x, y], i) => <Cup key={i} x={x} y={y - 20} w={34} h={26} body={mix("var(--art-rose)", 70, K)} />)}
      <ellipse cx="400" cy="556" rx="34" ry="8" fill="none" stroke={BONE} strokeWidth="4" style={{ ...box, ...run("fi-ring", 380, 1150) }} />
    </>}
    near={<>
      <Cup x={720} y={512} w={60} h={56} />
      <g style={run("fi-stack", 350, 1450, "cubic-bezier(.45,0,.3,1)")}>
        <Cup x={480} y={512} w={60} h={56} />
      </g>
      <Flight x={0} y={0} xs={run("fi-rc-x", 650, T.play, "linear")} ys={run("fi-rc-y", 650, T.play, "linear")}>
        <g style={{ ...box, ...run("fi-sink", 90, 1350, "cubic-bezier(.5,0,.8,.5)") }}>
          <circle r="13" fill={BONE} stroke={K} strokeWidth="4" />
        </g>
      </Flight>
      <Flight x={0} y={0} xs={run("fi-rc2-x", 900, T.play - 200, "linear")} ys={run("fi-rc2-y", 900, T.play - 200, "linear")}>
        <circle r="13" fill={BONE} stroke={K} strokeWidth="4" />
      </Flight>
      <Burst x={720} y={500} r={62} flat={.6} />
    </>}
  />;
}

/* ── Beerio Kart: around the bend, a drift, over the line ── */
function Kart() {
  const road = mix(K, 74, "var(--art-indigo)");
  const checker = [];
  for (let c = 0; c < 10; c++) for (let r = 0; r < 2; r++)
    if ((c + r) % 2 === 0) checker.push(<rect key={`${c}${r}`} x={392 + c * 38} y={528 + r * 10} width="38" height="10" fill={BONE} />);
  return <Plates
    mid={<>
      <path d="M232 455H312C480 470 700 540 1110 600L1560 690V800H470C446 700 426 630 408 600C376 520 320 474 232 455Z" fill={road} stroke={K} strokeWidth="5" strokeLinejoin="round" />
      <path d="M312 455C480 470 700 540 1110 600L1560 690" fill="none" stroke="var(--art-rose)" strokeWidth="12" strokeDasharray="28 28" />
      <path d="M312 455C480 470 700 540 1110 600L1560 690" fill="none" stroke={BONE} strokeWidth="12" strokeDasharray="28 28" strokeDashoffset="28" />
      <path d="M272 456C400 478 520 540 760 600L1000 800" fill="none" stroke={BONE} strokeOpacity=".5" strokeWidth="5" strokeDasharray="22 26" />
      <path d="M392 528H772V548H392Z" fill={K} />
      {checker}
      <path d="M392 528H772V548H392Z" fill={BONE} style={run("fi-flash", 420, T.hit, "ease-out")} opacity="0" />
      <path d="M430 504C470 520 520 534 566 544" fill="none" stroke={K} strokeOpacity=".7" strokeWidth="7" pathLength="100" strokeDasharray="100"
        style={run("fi-trail", 420, 1300, "linear")} />
    </>}
    near={<>
      <g style={run("fi-kart-path", 1700, T.play - 200, "linear")}>
        <g style={{ ...box, ...run("fi-kart-body", 1700, T.play - 200, "linear") }}>
          <g transform="translate(-70 -52)">
            <ellipse cx="70" cy="96" rx="66" ry="10" fill={K} opacity=".35" />
            <path d="M8 66L22 40H112L136 62L128 80H14Z" fill="var(--art-rose)" stroke={K} strokeWidth="5" strokeLinejoin="round" />
            <path d="M34 42L52 20H86L98 42Z" fill={mix("var(--art-rose)", 60, K)} stroke={K} strokeWidth="4" strokeLinejoin="round" />
            <circle cx="70" cy="18" r="16" fill={BONE} stroke={K} strokeWidth="4" />
            <path d="M58 14H84" stroke="var(--art-cobalt)" strokeWidth="6" strokeLinecap="round" />
            <rect x="108" y="28" width="16" height="26" rx="3" fill="var(--art-cream)" stroke={K} strokeWidth="3" />
            <path d="M108 34H124" stroke="var(--art-cobalt)" strokeWidth="4" />
            <circle cx="30" cy="84" r="15" fill={K} stroke={BONE} strokeOpacity=".4" strokeWidth="3" />
            <circle cx="112" cy="84" r="15" fill={K} stroke={BONE} strokeOpacity=".4" strokeWidth="3" />
          </g>
        </g>
      </g>
      <g transform="translate(520 532)">
        {[-50, -20, 10, 40, 70].map(deg => <path key={deg} d="M0 0L-38 0" transform={`rotate(${deg})`} stroke="var(--art-tangerine)" strokeWidth="5"
          strokeLinecap="round" style={{ ...box, transformOrigin:"right center", ...run("fi-ray", 320, 1420, "ease-out") }} />)}
      </g>
      <Burst x={600} y={538} r={70} flat={.45} />
    </>}
  />;
}

/* ── Championship Poker: the deal, the stacks, two aces turn ── */
function Card({ x, y, rot, suit, deal, flipAt }) {
  /* dealt off the deck: the card grows and turns as it slides to its seat */
  const spade = "M0-26C-10-14-26-4-26 8C-26 18-14 22-5 15L-9 28H9L5 15C14 22 26 18 26 8C26-4 10-14 0-26Z";
  const heart = "M0 24C-14 12-26 2-26-10C-26-20-18-26-10-26C-5-26-1-22 0-18C1-22 5-26 10-26C18-26 26-20 26-10C26 2 14 12 0 24Z";
  return <g style={{ ...box, ...deal }}><g transform={`translate(${x} ${y}) rotate(${rot})`}>
    <g style={{ ...box, ...run("fi-card-back", 80, flipAt, "cubic-bezier(.5,0,.8,.5)") }}>
      <rect x="-40" y="-56" width="80" height="112" rx="8" fill={mix("var(--art-cobalt)", 80, K)} stroke={K} strokeWidth="4" />
      <rect x="-31" y="-47" width="62" height="94" rx="4" fill="none" stroke={BONE} strokeOpacity=".45" strokeWidth="3" />
    </g>
    <g style={{ ...box, ...run("fi-card-front", 120, flipAt + 80, "var(--ease-land)") }}>
      <rect x="-40" y="-56" width="80" height="112" rx="8" fill={BONE} stroke={K} strokeWidth="4" />
      <path d={suit === "heart" ? heart : spade} fill={suit === "heart" ? "var(--art-rose)" : K} />
    </g>
  </g></g>;
}
function Stack({ x, y, ink, n, at }) {
  return <g>{Array.from({ length:n }, (_, i) => <g key={i} style={run("fi-chip", 200, at + i * 70, "var(--ease-land)")}>
    <ellipse cx={x} cy={y - i * 9} rx="30" ry="10" fill={ink} stroke={K} strokeWidth="3" />
    <path d={`M${x - 30} ${y - i * 9}v5a30 10 0 0 0 60 0v-5`} fill={mix(ink, 70, K)} stroke={K} strokeWidth="3" />
    <path d={`M${x - 14} ${y - i * 9 + 9}v4M${x + 14} ${y - i * 9 + 9}v4`} stroke={BONE} strokeWidth="4" />
  </g>)}</g>;
}
function Poker() {
  const felt = mix("var(--art-sage)", 80, K);
  return <Plates
    mid={<>
      <ellipse cx="600" cy="528" rx="490" ry="116" fill={mix("var(--art-umber)", 85, K)} stroke={K} strokeWidth="5" />
      <ellipse cx="600" cy="526" rx="452" ry="96" fill={felt} />
      <ellipse cx="600" cy="524" rx="300" ry="58" fill="none" stroke={BONE} strokeOpacity=".2" strokeWidth="4" />
      {/* the deck, at the dealer's end of the felt */}
      {[6, 3, 0].map(d => <rect key={d} x={572 + d * .5} y={434 + d} width="56" height="40" rx="5" fill={mix("var(--art-cobalt)", 80, K)} stroke={K} strokeWidth="3" />)}
      <rect x="579" y="440" width="42" height="28" rx="3" fill="none" stroke={BONE} strokeOpacity=".45" strokeWidth="2" />
      <Stack x={420} y={548} ink="var(--poker-500)" n={5} at={1000} />
      <Stack x={780} y={548} ink="var(--poker-1000)" n={6} at={1060} />
      <Stack x={700} y={574} ink="var(--poker-25)" n={3} at={1120} />
      <Stack x={500} y={576} ink="var(--poker-100)" n={3} at={1180} />
    </>}
    near={<>
      <Card x={556} y={520} rot={-9} suit="spade" deal={run("fi-deal-1", 360, T.play, "cubic-bezier(.2,.7,.3,1)")} flipAt={T.hit - 200} />
      <Card x={636} y={524} rot={7} suit="heart" deal={run("fi-deal-2", 360, T.play + 160, "cubic-bezier(.2,.7,.3,1)")} flipAt={T.hit - 120} />
      <Burst x={596} y={522} r={96} flat={.7} />
    </>}
  />;
}

/* ── any other game: its own mark drops onto a lit plinth ── */
function MarkScene({ gameId, variant }) {
  return <Plates
    mid={<>
      <ellipse cx="600" cy="536" rx="190" ry="36" fill={K} />
      <ellipse cx="600" cy="528" rx="180" ry="32" fill={mix("var(--art-cream)", 18, K)} stroke={BONE} strokeOpacity=".4" strokeWidth="4" />
      <ellipse cx="600" cy="528" rx="110" ry="18" fill={K} opacity=".4" style={{ ...box, ...run("fi-shadow", 1100, T.play, GRAVITY_DOWN) }} />
    </>}
    near={<>
      <g style={run("fi-mark-drop", 1100, T.play, GRAVITY_DOWN)}>
        <g style={{ transformBox:"fill-box", transformOrigin:"50% 100%", ...run("fi-squash", 360, T.hit, "var(--ease-land)") }}>
          <g transform="translate(480 280)"><GameMark id={gameId} variant={variant} size={240} hero /></g>
        </g>
      </g>
      <Burst x={600} y={520} r={150} flat={.3} />
    </>}
  />;
}

/* the registry: one scene per INTRO_SCENES key (introTiming.js) */
export const SCENES = Object.freeze({
  putting:Putting, die:Die, where:Where, "basketball:5v5":FullCourt, pickleball:Pickleball,
  "basketball:1v1":OneOnOne, volleyball:Volleyball, trivia:Trivia, "8ball":EightBall, pong:Pong,
  ragecage:RageCage, beerio:Kart, poker:Poker,
});
export function IntroDiorama({ scene, gameId, variant }) {
  const Scene = SCENES[scene];
  return Scene ? <Scene /> : <MarkScene gameId={gameId} variant={variant} />;
}
