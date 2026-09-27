import React, { useState } from "react";
import { AWARDS, EDITION, GAMES, ROSTER, cleanLeg } from "../../../shared/core.js";
import { PageHeading, SectionHeading } from "../../ui/layout.jsx";
import { VenueCard, FlightPass } from "../travel/Travel.jsx";
import { InstallHint } from "../check-in/InstallHint.jsx";
import { isStandalone } from "../check-in/install.js";
import "./weekend.css";

const format = value => Number(value).toLocaleString("en-US");
const AWARD_NAMES = ["The Championship", "Fraud of the Weekend", "Sharpshooter",
  "Degenerate of the Weekend", "Media MVP", "Teammate of the Weekend"];
const SECTIONS = [["trip", "Trip"], ["rules", "Rules"], ["games", "Games"]];

function Rule({ number, title, meta, children }) {
  return <details className="fd-weekend-rule">
    <summary><span className="fd-weekend-rule-number">{number}</span>
      <span><strong>{title}</strong><small>{meta}</small></span>
      <span className="fd-weekend-rule-toggle" aria-hidden="true" /></summary>
    <div className="fd-weekend-rule-body">{children}</div>
  </details>;
}

export function Guide({ events, state, me, onProfile, section: controlledSection, onSection, GameMark, HowToSheet }) {
  const [localSection, setLocalSection] = useState("trip");
  const section = controlledSection ?? localSection;
  const setSection = next => { setLocalSection(next); onSection?.(next); };
  const [howToEv, setHowToEv] = useState(null);
  const logistics = state?.logistics || {};
  const profile = state?.profiles?.[me] || {};
  const games = Object.entries(GAMES);
  const hasIn = !!cleanLeg(profile.flightIn);
  const hasOut = !!cleanLeg(profile.flightOut);
  const changeTab = (event, index) => {
    let next;
    if (event.key === "ArrowRight") next = (index + 1) % SECTIONS.length;
    if (event.key === "ArrowLeft") next = (index + SECTIONS.length - 1) % SECTIONS.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = SECTIONS.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    setSection(SECTIONS[next][0]);
    event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[next].focus();
  };

  return <div className="fd-weekend fd-weekend-guide">
    <PageHeading kicker={EDITION.long} title="Weekend" />
    <div className="fd-weekend-tabs" role="tablist" aria-label="Weekend">
      {SECTIONS.map(([id, title], index) => <button key={id} id={`fd-weekend-tab-${id}`} type="button"
        role="tab" aria-selected={section === id} aria-controls={`fd-weekend-panel-${id}`}
        tabIndex={section === id ? 0 : -1} onClick={() => setSection(id)}
        onKeyDown={event => changeTab(event, index)}>{title}</button>)}
    </div>

    <div id="fd-weekend-panel-trip" role="tabpanel" aria-labelledby="fd-weekend-tab-trip" hidden={section !== "trip"}>
      <section className="fd-weekend-guide-section fd-weekend-trip">
        <VenueCard lg={logistics} compact />
      </section>
      {me && <section className="fd-weekend-guide-section fd-weekend-flights">
        <div className="fd-weekend-flights-heading"><h2>Your flights</h2>
          {onProfile && <button type="button" onClick={onProfile}>{hasIn || hasOut ? "Edit flights" : "Add flights"}</button>}
        </div>
        {hasIn && <FlightPass leg={profile.flightIn} dir="in" />}
        {hasOut && <FlightPass leg={profile.flightOut} dir="out" />}
        {!hasIn && !hasOut && <p className="fd-weekend-small-note">
          {profile.flightsBooked === false ? "Not booked yet" : "No flights added"}
        </p>}
        {(hasIn !== hasOut) && <p className="fd-weekend-small-note">{hasIn ? "Sunday flight not added" : "Friday flight not added"}</p>}
      </section>}
      {!isStandalone() && <details className="fd-weekend-install">
        <summary>Install Field Day</summary><InstallHint />
      </details>}
    </div>

    <div id="fd-weekend-panel-rules" role="tabpanel" aria-labelledby="fd-weekend-tab-rules" hidden={section !== "rules"}>
      <section className="fd-weekend-overview">
        <h2>How Field Day works</h2>
        <p>{ROSTER.length} players, {events.filter(event => !event.finale).length} events, one board. Teams reshuffle every event.
          {" "}Everyone starts at 1,000, and results, bets, and duels all move that same number.</p>
        <p>Whatever you have when the events end is the stack you are dealt at Championship Poker. The winner of that table is the Field Day champion.</p>
      </section>
      <section className="fd-weekend-guide-section" aria-label="Core rules">
        <div className="fd-weekend-rules">
          <Rule number="01" title="Event payouts" meta="Friday 400 · Saturday 800, 1,200, 1,600">
            <p>Friday events pay 400. Saturday morning pays 800, afternoon 1,200, and night 1,600.
              {" "}Solo events pay the podium. Team events pay every player on the placing team the full amount.</p>
            <table className="fd-weekend-payouts"><caption>Chips awarded per player</caption>
              <thead><tr><th scope="col">Session</th><th scope="col">1st</th><th scope="col">2nd</th><th scope="col">3rd</th></tr></thead>
              <tbody>{[[400, "Friday"], [800, "Sat AM"], [1200, "Sat PM"], [1600, "Sat night"]].map(([value, name]) =>
                <tr key={value}><th scope="row">{name}</th>{AWARDS[value].map((amount, index) => <td key={index}>{amount ? format(amount) : "·"}</td>)}</tr>)}</tbody>
            </table>
            <p>Ties are settled on the spot, and a championship tie is one pressure putt.</p>
          </Rule>
          <Rule number="02" title="Betting" meta="One contest at a time · 100 to 1,000 per tap">
            <p>Bet on the winner. In a tournament, it’s the current matchup. In heats, it’s the current heat.
              {" "}Bets lock before play. The winner settles the chips, then the next contest opens.
              {" "}Pick a chip, 100 to 1,000, and tap who you like. Tap your chip stack to take the last one back.</p>
            <div className="fd-weekend-odds"><div><strong>2:1</strong><span>Free-for-all winner</span></div><div><strong>1:1</strong><span>Matchup, heat<br />or final winner</span></div></div>
            <p>Playing in the matchup or heat? Back yourself or your team, or sit the bet out. No automatic bets.</p>
            <p>To limit the damage of one bad decision, only half your points can be at risk at a time.
              {" "}The limit rounds down to 100s, with a minimum of 500. You can never bet more chips than you have available.</p>
            <p>Bets settle off the official result, so correcting a result corrects the payouts. I can void any wager.</p>
          </Rule>
          <Rule number="03" title="Duels" meta="Quick Draw · equal ante · three a day">
            <p>Short on points? Challenge someone. Tap anyone on the board and name the ante, or tap yourself to challenge anyone. You both put up the same once they accept. Duels open when the weekend goes live.</p>
            <p>Once accepted, you each play Quick Draw on your own phone whenever you want: the screen flashes after a random wait, tap it.
              {" "}Fastest tap takes the pot. Tapping early is a foul. Matching times or two fouls return the chips.</p>
            <p>One challenge per pair, three a day. An unanswered challenge lapses after 10 minutes. Unplayed duels are void when the finale is dealt.</p>
          </Rule>
          <Rule number="04" title="Draws and brackets" meta="Balanced teams · live brackets, heats, and pools">
            <p>I run each draw, and it reveals on every phone at once. Teams balance from your ratings and your results
              {" "}so far, and the later the weekend, the more the results count. Ratings are never shown.</p>
            <p>Some events are captains drafting instead. Brackets, heats, and pools update here and on the TV as they are played.</p>
          </Rule>
        </div>
      </section>
      <section className="fd-weekend-awards" aria-labelledby="fd-guide-awards-title">
        <div className="fd-weekend-awards-heading"><h2 id="fd-guide-awards-title">Awards</h2><span>Voted Saturday night</span></div>
        <ul>{AWARD_NAMES.map(award => <li key={award}>{award}</li>)}</ul>
      </section>
      <section className="fd-weekend-guide-section">
        <SectionHeading title="Safety and respect" detail="The house" />
        <ul className="fd-weekend-house-rules">
          <li>Alcohol is optional everywhere. NA equivalents carry no penalty. No forced participation.</li>
          <li>Rack cups hold water. Drink from your own cup.</li>
          <li>No hard contact. Respect the property.</li>
          <li>Everyone knows when the 360 cam is rolling.</li>
          <li>I can stop anything for safety.</li>
        </ul>
      </section>
    </div>

    <div id="fd-weekend-panel-games" role="tabpanel" aria-labelledby="fd-weekend-tab-games" hidden={section !== "games"}>
      <section className="fd-weekend-guide-section">
        <div className="fd-weekend-game-directory">{games.map(([id, game]) => {
          const objective = (game.howto || game.variants?.[0]?.howto)?.objective || "";
          return <button type="button" key={id} onClick={() => setHowToEv(id)}
            aria-label={objective ? `${game.name}. ${objective}` : game.name}>
            <span className="fd-weekend-game-mark" aria-hidden="true">{GameMark && <GameMark id={id} size={34} />}</span>
            <span className="fd-weekend-game-title"><strong>{game.name}</strong>{objective && <small>{objective}</small>}</span>
            <span className="fd-weekend-game-arrow" aria-hidden="true">›</span>
          </button>;
        })}</div>
      </section>
    </div>
    {howToEv && HowToSheet && <HowToSheet gameId={howToEv} onClose={() => setHowToEv(null)} />}
  </div>;
}
