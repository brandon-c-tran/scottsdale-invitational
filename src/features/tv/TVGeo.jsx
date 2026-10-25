import React, { useCallback, useEffect, useRef, useState } from "react";
import { disp } from "../../../shared/core.js";
import { ChipFace } from "../identity/PlayerIdentity.jsx";
import { GeoMap, preloadGeoMap } from "../geo/GeoMap.jsx";
import { REVEAL_SETTLE } from "../geo/mapModel.js";
import { geoPhotoSrc, geoView, milesLabel, offLabel, whenLabel } from "../geo/geoModel.js";
import "./tv-geo.css";

const fmt = n => (n ?? 0).toLocaleString("en-US");
const initials = (state, player) => disp(state, player).slice(0, 2).toUpperCase();
const colorOf = (state, player) => state.profiles?.[player]?.color || "#9aa39e";
/* The round's scores fit the side panel by count, never by a hidden
   overflow: the best three with where and when scored apart, then totals
   while they fit, and the rest folded into one "+N" line of faces (every
   score is on its player's phone, and the final order is the last turn).
   Canvas pixels: the list's room under the panel's head, and each row's. */
export const GEO_LIST = Object.freeze({ room:624, detail:158, total:68, gap:10, fold:52, details:3, thumb:2 });
export function geoRevealRows(count, L = GEO_LIST) {
  const details = Math.min(L.details, count);
  let room = L.room - details * L.detail - Math.max(0, details - 1) * L.gap;
  const rest = count - details;
  if (rest <= 0) return { details, totals:0, folded:0 };
  const all = rest * (L.total + L.gap);
  if (all <= room) return { details, totals:rest, folded:0 };
  room -= L.fold + L.gap;
  const totals = Math.max(0, Math.floor(room / (L.total + L.gap)));
  return { details, totals, folded:rest - totals };
}

/* Where and When on the TV: the photo and the clock while phones guess
   (who has locked in, never where), then the map with the answer, every
   pin and the round's scores, and at the end the final order. One map
   stands under the photo for the whole game, so it is loaded before the
   first reveal; at each reveal the photo holds until the map has drawn
   the reveal's views, then lifts as the pins start to drop. */
const NO_GUESSES = Object.freeze([]);
export function TVGeo({ state, now }) {
  const view = geoView(state, null, now);
  useEffect(() => { preloadGeoMap(); }, []);
  /* how far into this photo's reveal the TV came in, fixed when it first
     drew it: the map's beats join there */
  const joined = useRef({ key:null, since:0 });
  const revealKey = view?.revealed ? `${view.roundId}:${view.revealedAt}` : null;
  if (revealKey && joined.current.key !== revealKey)
    joined.current = { key:revealKey, since:view.revealedAt ? Math.max(0, (now ?? Date.now()) - view.revealedAt) : 0 };
  /* the reveal whose beats have begun, and how far in (the scores enter
     on the same clock); `map` false: the scores came in without it */
  const [started, setStarted] = useState(null);
  const onStart = useCallback(({ since }) => setStarted(prev => prev?.key === joined.current.key ? { ...prev, map:true }
    : { key:joined.current.key, since, map:true }), []);
  /* a map still not drawing a while after the reveal came in (loading
     cold, failing) no longer holds the scores; the photo holds for it */
  const startedKey = started?.key || null;
  useEffect(() => {
    if (!revealKey || startedKey === revealKey) return undefined;
    const timer = setTimeout(() => setStarted(prev => prev?.key === revealKey ? prev
      : { key:revealKey, since:joined.current.since + REVEAL_SETTLE.panel, map:false }), REVEAL_SETTLE.panel);
    return () => clearTimeout(timer);
  }, [revealKey, startedKey]);
  if (!view) return null;
  if (view.done && !view.revealed) return null;
  const head = <div className="tv-geo-head">
    <span className="tv-display tv-geo-count">Photo {view.n} of {view.total}</span>
    <span className="tv-label">Where and When</span>
  </div>;

  const answer = view.round;
  if (view.done && view.last) return <div className="tv-geo is-final">
    <div className="tv-geo-final">
      <div className="tv-label">Final</div>
      {/* everyone, in two columns past six, so the order fits the stage */}
      <ol className={view.standings.length > 6 ? "is-two" : ""}
        style={view.standings.length > 6 ? { gridTemplateRows:`repeat(${Math.ceil(view.standings.length / 2)}, auto)` } : undefined}>
        {view.standings.map(row => <li key={row.player} className={row.rank <= 3 ? "is-podium" : ""}>
        <span className="tv-display tv-geo-rank">{row.rank}</span>
        <ChipFace p={row.player} size={64} />
        <span className="tv-display tv-geo-name">{disp(state, row.player)}</span>
        <span className="tv-display tv-geo-points">{fmt(row.total)}<small className="tv-unit">pts</small></span>
      </li>)}</ol>
    </div>
  </div>;

  const guessing = view.phase === "guess";
  const shown = !guessing && !!revealKey && started?.key === revealKey;
  const fit = geoRevealRows(view.results.length);
  /* the answer's card stands in the top corner no pin covers (GeoMap) */
  return <div className={`tv-geo${guessing ? "" : " is-reveal"}`} style={shown ? { "--geo-since":`${started.since}ms` } : undefined}>
    <div className="tv-geo-stage">
      <GeoMap mode={guessing ? "idle" : "reveal"} settle onStart={onStart} animate interactive={false}
        answer={guessing ? null : answer} className="tv-geo-map" label="The answer and every guess"
        pad={{ top:40, bottom:40, left:48, right:48 }} since={joined.current.since}
        guesses={guessing ? NO_GUESSES : view.results.filter(row => row.miles !== null).map(row => ({ lat:row.guess.lat, lng:row.guess.lng,
          player:row.player, color:colorOf(state, row.player), label:initials(state, row.player) }))}
        card={guessing ? null : <div className="tv-geo-answer">
          <span className="fd-show tv-geo-place">{answer.place}</span>
          <span className="tv-geo-when">{whenLabel(answer.when)}</span>
          {answer.caption && <em>{answer.caption}</em>}
        </div>} />
      {/* the photo, over the map until the reveal's beats begin */}
      {view.round && <div className={`tv-geo-cover${shown && started.map ? " is-off" : ""}`}>
        <img key={view.roundId} className="tv-geo-photo" src={geoPhotoSrc(view.round)} alt="" /></div>}
    </div>
    {guessing ? <aside className="tv-geo-side">
      {head}
      <div className={`tv-display tv-geo-clock${view.secondsLeft <= 10 ? " is-low" : ""}`}>{view.secondsLeft}</div>
      <div className="tv-geo-status">{view.lockedIn.length} of {view.players.length} locked in</div>
      <div className="tv-geo-roster">
        {view.players.map(player => <span key={player}
          className={`tv-geo-chip${view.lockedIn.includes(player) ? " is-in" : view.drafting.includes(player) ? " is-drafting" : ""}`}>
          <ChipFace p={player} size={64} /></span>)}
      </div>
      <div className="tv-geo-prompt">Where was this, and when?</div>
    </aside>
    /* the round: its photo, then each guess with where and when scored
       apart, so the room sees why the order is the order. A big field
       keeps the breakdown for the top three and the totals for the rest.
       They enter on the map's clock, once its beats begin. */
    : <aside className="tv-geo-side">
      {head}
      {shown && view.results.length <= GEO_LIST.thumb && <img className="tv-geo-thumb" src={geoPhotoSrc(answer)} alt="" />}
      {shown && <ol className="tv-geo-results">
        {view.results.slice(0, fit.details + fit.totals).map((row, i) => <li key={row.player} style={{ "--row":i }}
          className={i < fit.details ? "is-detail" : "is-total"}>
          <div className="tv-geo-row">
            <ChipFace p={row.player} size={52} />
            <b className="tv-geo-who">{disp(state, row.player)}</b>
            <span className="tv-geo-points">{fmt(row.total)}<small className="tv-unit">pts</small></span>
          </div>
          <div className="tv-geo-split">
            <span><i>Where</i>{row.miles === null ? "No pin" : `${milesLabel(row.miles)} off`}<em>{fmt(row.where)}</em></span>
            <span><i>When</i>{row.hours === null ? "No date" : offLabel(row.hours)}<em>{fmt(row.when)}</em></span>
          </div>
        </li>)}
        {fit.folded > 0 && <li className="tv-geo-more" style={{ "--row":fit.details + fit.totals }}>
          <span className="tv-geo-more-faces">{view.results.slice(fit.details + fit.totals).slice(0, 8).map(row =>
            <ChipFace key={row.player} p={row.player} size={40} />)}</span>
          <b className="tv-display">+{fit.folded}</b>
        </li>}
        {!view.results.length && <li className="tv-geo-none">No guesses</li>}
      </ol>}
    </aside>}
  </div>;
}
