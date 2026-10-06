import React, { useEffect, useRef, useState } from "react";
import { ChipFace } from "../identity/PlayerIdentity.jsx";
import { ChipStack, HOUSE_CHIP } from "../wagers/BetStacks.jsx";
import { LampChase, ScoreReel } from "../../ui/ScoreReel.jsx";
import { serverNow } from "../../lib/serverClock.js";
import { SHOWDOWN as S, activeShowdown, showdownResult, showdownSides } from "../duels/showdown.js";
import { Takeover } from "./TVTakeover.jsx";
import "./tv-showdown.css";

const fmt = n => (Number(n) || 0).toLocaleString("en-US");
const CHIP = 300;

/* a name sized to stay on one line in its half: Big Shoulders 900 runs
   about 0.5em a letter (as the face-off sizes its sides) */
export const showdownNameSize = text =>
  Math.max(44, Math.min(88, Math.floor(700 / (Math.max(4, String(text || "").length) * 0.5))));

/* The armed duel the room watches, or null. `gap`: nothing else holds the
   TV (no event live, drawn, posting or playing a moment); outside a gap the
   result rides the ticker instead. Wakes at the scene's end. */
export function useTvShowdown(state, { gap = true, now: nowOverride } = {}) {
  const now = nowOverride ?? serverNow();
  const active = activeShowdown(state, now);
  const [, wake] = useState(0);
  const end = active?.win.end || 0;
  useEffect(() => {
    if (!end || nowOverride !== undefined) return undefined;
    const t = setTimeout(() => wake(n => n + 1), Math.max(0, end - serverNow()) + 30);
    return () => clearTimeout(t);
  }, [end, nowOverride]);
  return active && gap ? active : null;
}

/* minus the ms already gone at `anchor` when this TV joined, fixed per anchor */
function useAnchor(anchor, now) {
  const ref = useRef({ anchor:null, tl:0 });
  if (ref.current.anchor !== anchor) ref.current = { anchor, tl:anchor ? Math.round(anchor - now) : 0 };
  return ref.current.tl;
}

function Side({ side, from, result, terms }) {
  const { reel, stamp, take } = terms;
  return <div className={`tv-showdown-side is-${from}${side.won ? " is-won" : ""}${side.lost ? " is-lost" : ""}`}>
    <div className="tv-showdown-chip">
      <ChipFace p={side.p} size={CHIP} flat />
      {stamp && <span className={`fd-show tv-showdown-stamp${stamp === "Tie" ? " is-tie" : ""}`}>{stamp}</span>}
    </div>
    <div className="fd-show tv-showdown-name" style={{ fontSize:showdownNameSize(side.name) }}>{side.name}</div>
    <div className="tv-showdown-mark">
      {reel || <i className={`fd-insert tv-showdown-lamp${side.played || result ? "" : " is-pending"}`} aria-hidden="true" />}
    </div>
    {take}
  </div>;
}

/* The showdown on the TV (Backglass takeover grammar, on the server clock
   from armedAt): the chrome leaves and the glass dims, the two chips slam
   in from their edges with the antes between, three magenta lamps light,
   then dark glass until the whole glass flashes DRAW at fireAt. Each side's
   lamp lights as its run lands; when the duel settles (resultAt, the second
   run's stamp) both times roll in on reels, the winner's on the drum, WON
   stamps on the winner and the antes slide to them. Reduced motion and a
   late TV show the frame (every element rests on its end state). */
export function TVShowdown({ state, active, now: nowProp }) {
  const now = nowProp ?? serverNow();
  const { duel, win } = active;
  const tl = useAnchor(win.armedAt, now);
  const tr = useAnchor(win.resultAt, now);
  const sides = showdownSides(state, duel, duel.from);
  const result = win.resultAt ? showdownResult(duel) : null;
  if (!sides) return null;
  const at = ms => `calc(var(--tr) + ${ms}ms)`;
  const termsOf = side => {
    if (!result) return {};
    const reel = side.foul ? <b className="fd-show tv-showdown-foul" style={{ animationDelay:at(S.reel) }}>Foul</b>
      : side.ms !== null ? <span className={`tv-showdown-time${side.won ? " is-won" : ""}`}>
        <ScoreReel value={side.ms} drum={side.won} tone={side.won ? "chip" : null} label={`${side.ms} ms`}
          motion="always" from={0} at={at(S.reel + (side.won ? S.reelGap : 0))} />
        <small>ms</small></span> : null;
    /* the antes land with the winner: what they took, in the chips' amber */
    const take = side.won ? <span className="tv-showdown-take" style={{ animationDelay:at(S.slide + S.slideMs - 150) }}>
      +{fmt(duel.stake)}</span> : null;
    return { reel, stamp:side.won ? "WON" : null, take };
  };
  const slide = result && !result.push ? (result.winner === sides[0].p ? "left" : "right") : null;
  const label = result ? result.push ? `${sides[0].name} and ${sides[1].name} tie in Quick Draw`
    : `${sides.find(side => side.won)?.name} wins Quick Draw` : `Quick Draw: ${sides[0].name} vs ${sides[1].name}`;
  return (
    <Takeover kind="showdown" className="tv-showdown" label={label}
      style={{ "--tl":`${tl}ms`, "--tr":`${tr}ms`, "--fire":`${win.fireAt - win.armedAt}ms`,
        "--out":`${win.end - S.liftMs - win.armedAt}ms` }}>
      <div className="tv-showdown-glass" aria-hidden="true" />
      <LampChase tone="live" className="tv-showdown-chase" />
      <div className="fd-show tv-showdown-title">Quick Draw</div>
      <div className="tv-showdown-ring">
        <Side side={sides[0]} from="left" result={result} terms={termsOf(sides[0])} />
        <div className="tv-showdown-mid">
          <div className={`tv-showdown-antes${slide ? ` is-to-${slide}` : ""}`} style={slide ? { "--slide-at":at(S.slide) } : undefined}>
            {[0, 1].map(i => <span key={i} className="tv-showdown-ante">
              <ChipStack p={null} stake={duel.stake} size={72} chip={HOUSE_CHIP} tag={false} />
              <small>{fmt(duel.stake)}</small>
            </span>)}
          </div>
          <div className="tv-showdown-lamps" aria-hidden="true">
            {S.lamps.map((ms, i) => <i key={i} className="fd-insert tv-showdown-count"
              style={{ animationDelay:`calc(var(--tl) + ${ms}ms), calc(var(--tl) + var(--fire))` }} />)}
          </div>
        </div>
        <Side side={sides[1]} from="right" result={result} terms={termsOf(sides[1])} />
      </div>
      {result?.push && <div className="fd-show tv-showdown-tie" style={{ animationDelay:at(S.stamp) }}>Tie</div>}
      <div className="tv-showdown-flash" aria-hidden="true"><span className="fd-show">Draw</span></div>
    </Takeover>
  );
}
