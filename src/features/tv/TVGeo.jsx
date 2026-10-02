import React from "react";
import { disp } from "../../../shared/core.js";
import { Avatar } from "../identity/PlayerIdentity.jsx";
import { GeoMap } from "../geo/GeoMap.jsx";
import { geoPhotoSrc, geoView, milesLabel, offLabel, whenLabel } from "../geo/geoModel.js";
import "./tv-geo.css";

const fmt = n => (n ?? 0).toLocaleString("en-US");
const initials = (state, player) => disp(state, player).slice(0, 2).toUpperCase();
const colorOf = (state, player) => state.profiles?.[player]?.color || "#9aa39e";

/* Where and When on the TV: the photo and the clock while phones guess
   (who has locked in, never where), then the map with the answer, every
   pin and the round's scores, and at the end the final order. */
export function TVGeo({ state, now }) {
  const view = geoView(state, null, now);
  if (!view) return null;
  const head = <div className="tv-geo-head">
    <span className="tv-label">Where and When</span>
    <span className="tv-display tv-geo-count">Photo {view.n} of {view.total}</span>
  </div>;

  if (view.phase === "guess") return <div className="tv-geo">
    <div className="tv-geo-stage">
      {view.round && <img className="tv-geo-photo" src={geoPhotoSrc(view.round)} alt="" />}
    </div>
    <aside className="tv-geo-side">
      {head}
      <div className={`tv-display tv-geo-clock${view.secondsLeft <= 10 ? " is-low" : ""}`}>{view.secondsLeft}</div>
      <div className="tv-geo-status">{view.lockedIn.length} of {view.players.length} locked in</div>
      <div className="tv-geo-roster">
        {view.players.map(player => <span key={player}
          className={`tv-geo-chip${view.lockedIn.includes(player) ? " is-in" : view.drafting.includes(player) ? " is-drafting" : ""}`}>
          <Avatar state={state} p={player} size={56} /></span>)}
      </div>
      <div className="tv-geo-prompt">Where was this, and when?</div>
    </aside>
  </div>;

  if (view.done && !view.revealed) return null;
  const answer = view.round;
  if (view.done && view.last) return <div className="tv-geo is-final">
    <div className="tv-geo-final">
      <div className="tv-label">Where and When · Final</div>
      <ol>{view.standings.slice(0, 10).map(row => <li key={row.player} className={row.rank <= 3 ? "is-podium" : ""}>
        <span className="tv-display tv-geo-rank">{row.rank}</span>
        <Avatar state={state} p={row.player} size={64} />
        <span className="tv-display tv-geo-name">{disp(state, row.player)}</span>
        <span className="tv-display tv-geo-points">{fmt(row.total)}</span>
      </li>)}</ol>
    </div>
  </div>;

  return <div className="tv-geo is-reveal">
    <div className="tv-geo-stage">
      <GeoMap mode="reveal" animate interactive={false} answer={answer} className="tv-geo-map" label="The answer and every guess"
        guesses={view.results.filter(row => row.miles !== null).map(row => ({ lat:row.guess.lat, lng:row.guess.lng,
          color:colorOf(state, row.player), label:initials(state, row.player) }))} />
      <div className="tv-geo-answer">
        <span className="tv-display">{answer.place}</span>
        <span>{whenLabel(answer.when)}</span>
        {answer.caption && <em>{answer.caption}</em>}
      </div>
    </div>
    <aside className="tv-geo-side">
      {head}
      <ol className="tv-geo-results">
        {view.results.slice(0, 12).map((row, i) => <li key={row.player} style={{ "--row":i }}>
          <Avatar state={state} p={row.player} size={44} />
          <span className="tv-geo-who"><b>{disp(state, row.player)}</b>
            <small>{row.miles === null ? "No pin" : `${milesLabel(row.miles)} off`} · {row.hours === null ? "No date" : offLabel(row.hours)}</small></span>
          <span className="tv-display tv-geo-points">+{fmt(row.total)}</span>
        </li>)}
        {!view.results.length && <li className="tv-geo-none">No guesses this photo</li>}
      </ol>
    </aside>
  </div>;
}
