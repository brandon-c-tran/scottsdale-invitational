import React, { useRef } from "react";
import { disp } from "../../../shared/core.js";
import { ChipFace } from "../identity/PlayerIdentity.jsx";
import { GameMark } from "../../ui/GameMark.jsx";
import { EventName, OneSafe } from "../../ui/OneSafe.jsx";
import { fmt, signed } from "./tvModel.js";
import { holderLayout, markSize, recordLabel, recordNameLines, recordNameSize } from "./recordsModel.js";
import "./tv-records.css";

/* Rivalries and records (Oct 10, recordsModel.js): one card a records turn
   in the TV's gap, one glass panel standing on the session's painting. Its
   label (one to three words, lilac), the people as their photo chips with
   each name under its chip, and the record as one big numeral: a head to
   head is two sides facing each other with the record between them. No
   sentences. Chips and money in amber (a loss in the clay's text ink),
   counts in bone; filament never (the TV has no "you").

   The card rises in on its turn's own server instant (--tl), so every TV
   moves together and a TV that joins late shows it standing. */

/* canvas px: the panel (it stands on the painting's floor, tv-records.css)
   and its inner width */
export const RECORD_PANEL = Object.freeze({ width:1520, pad:64 });
const INNER = RECORD_PANEL.width - 2 * RECORD_PANEL.pad;
/* a head to head: the record's column between two sides */
const SCORE_W = 400, H2H_GAP = 40, H2H_CHIP = 280;
export const H2H_SIDE_W = Math.floor((INNER - SCORE_W - 2 * H2H_GAP) / 2);
/* the hero numeral: as large as its column allows (about .52em a figure) */
export const RECORD_NUMERAL = 240;
export const numeralSize = (text, width, max = RECORD_NUMERAL) =>
  Math.max(96, Math.min(max, Math.floor(width / (Math.max(1, String(text).length) * 0.52))));
/* a solo record: the people's column, then the figure's, centered together */
const SOLO_GAP = 88, SOLO_CHIP = 280;
export const soloWidths = count => {
  const who = count <= 1 ? 440 : count === 2 ? 560 : 680;
  return { who, figure:INNER - who - SOLO_GAP };
};

/* every name on a card at one size, the size the hardest one fits in its
   own column (a long one broken at its space), so a card never reads as
   one big name and one small */
export function cardNameSize(state, groups) {
  return Math.min(...groups.flatMap(({ players, width, chip }) => {
    const layout = holderLayout(players.length, width, { chip });
    return players.map(p => recordNameSize(disp(state, p), layout.col, { max:layout.max }));
  }));
}

/* the people: a row of chips over a row of names, one column each, so
   every name stands under its own chip. `facesH`: the chips' row height,
   shared by both sides of a head to head so their names stand level */
function People({ state, players, width, chip, nameSize, facesH = null, className = "" }) {
  const layout = holderLayout(players.length, width, { chip });
  return (
    <div className={`tv-record-people${className ? ` ${className}` : ""}`}
      style={{ "--col":`${layout.col}px`, "--faces-h":`${facesH || layout.face}px` }}>
      <div className="tv-record-faces">
        {players.map(p => <span key={p} className="tv-record-face"><ChipFace p={p} size={layout.face} /></span>)}
      </div>
      <div className="tv-record-names">
        {players.map(p => {
          const lines = recordNameLines(disp(state, p), layout.col, nameSize);
          return <span key={p} className="fd-show tv-record-name" style={{ fontSize:nameSize }}>
            {lines.length > 1 ? <>{lines[0]}<br />{lines[1]}</> : lines[0]}</span>;
        })}
      </div>
    </div>
  );
}

/* two sides facing each other, the record between them: the side ahead
   lettered bone, the side behind lilac (level: both bone) */
function HeadToHead({ state, card }) {
  const [a, b] = card.sides;
  const size = numeralSize(`${a.wins}${b.wins}`, SCORE_W - 140);
  const tone = (side, other) => side.wins < other.wins ? " is-behind" : "";
  /* the chips' row is as tall as the larger side's chips, and the record
     stands level with its middle */
  const facesH = Math.max(...card.sides.map(side => holderLayout(side.players.length, H2H_SIDE_W, { chip:H2H_CHIP }).face));
  const nameSize = cardNameSize(state, card.sides.map(side => ({ players:side.players, width:H2H_SIDE_W, chip:H2H_CHIP })));
  return (
    <div className="tv-record-h2h" style={{ gridTemplateColumns:`${H2H_SIDE_W}px ${SCORE_W}px ${H2H_SIDE_W}px` }}>
      <People state={state} players={a.players} width={H2H_SIDE_W} chip={H2H_CHIP} nameSize={nameSize} facesH={facesH}
        className="is-left" />
      <div className="tv-record-score" style={{ fontSize:size, height:facesH }} aria-label={`${a.wins} to ${b.wins}`}>
        <b className={`tv-record-n${tone(a, b)}`}><OneSafe text={String(a.wins)} all /></b>
        <span className="tv-record-to">to</span>
        <b className={`tv-record-n is-second${tone(b, a)}`}><OneSafe text={String(b.wins)} all /></b>
      </div>
      <People state={state} players={b.players} width={H2H_SIDE_W} chip={H2H_CHIP} nameSize={nameSize} facesH={facesH}
        className="is-right" />
    </div>
  );
}

/* what a figure says under it: the wins it counts (each its game's mark),
   or what made a swing (the event, or the Quick Draw and who it was
   against) */
function Marks({ wins, width }) {
  const size = markSize(wins.length, width);
  return <div className="tv-record-marks" role="img" aria-label={wins.map(win => win.name).join(", ")}>
    {wins.map((win, i) => <span key={`${win.key}:${i}`} className="tv-record-mark" style={{ "--i":i }}>
      <GameMark id={win.game} variant={win.variant || undefined} size={size} /></span>)}
  </div>;
}
const CAUSE_MARK = 72;
function Cause({ cause, width }) {
  if (!cause) return null;
  const name = cause.kind === "duel" ? "Quick Draw" : cause.name;
  return <div className="tv-record-cause">
    {cause.kind === "duel" ? cause.against.map(p => <ChipFace key={p} p={p} size={CAUSE_MARK} />)
      : <GameMark id={cause.game} variant={cause.variant || undefined} size={CAUSE_MARK} />}
    <span className="fd-show tv-record-cause-name"
      style={{ fontSize:recordNameSize(name, width - CAUSE_MARK - 24, { max:56, comfort:0 }) }}>
      <EventName name={name} /></span>
  </div>;
}

/* the figure a solo card holds up, and its ink */
export function recordFigure(card) {
  if (card.kind === "swing" || card.kind === "bettor")
    return { text:signed(card.amount), tone:card.amount < 0 ? "loss" : "chip" };
  if (card.kind === "fastest") return { text:fmt(card.ms), tone:"count", unit:"ms" };
  return { text:fmt(card.count), tone:"count" };
}

function Solo({ state, card }) {
  const widths = soloWidths(card.players.length);
  const figure = recordFigure(card);
  /* a unit beside the figure takes about two figures' room */
  const size = numeralSize(figure.text + (figure.unit ? "00" : ""), widths.figure);
  const nameSize = cardNameSize(state, [{ players:card.players, width:widths.who, chip:SOLO_CHIP }]);
  return (
    <div className="tv-record-solo" style={{ gridTemplateColumns:`${widths.who}px auto`, "--figure-max":`${widths.figure}px` }}>
      <People state={state} players={card.players} width={widths.who} chip={SOLO_CHIP} nameSize={nameSize} />
      <div className="tv-record-figure">
        <div className="tv-record-line">
          <b className={`tv-record-n is-${figure.tone}`} style={{ fontSize:size }}>{figure.text}</b>
          {figure.unit && <span className="tv-record-unit">{figure.unit}</span>}
        </div>
        {card.wins?.length > 0 && <Marks wins={card.wins} width={widths.figure} />}
        {card.kind === "swing" && <Cause cause={card.cause} width={widths.figure} />}
      </div>
    </div>
  );
}

/* the card's clock: how far into its turn this TV first drew it, fixed for
   the card (the clock ticking every second never restarts it) */
function useEntrance(id, turnAt, now) {
  const ref = useRef({ id:undefined, elapsed:0 });
  if (ref.current.id !== id) ref.current = { id, elapsed:Math.max(0, Math.round(Number(now) - Number(turnAt)) || 0) };
  return ref.current.elapsed;
}

export function TVRecord({ state, card, turnAt = 0, now = 0 }) {
  const elapsed = useEntrance(`${card.id}@${turnAt}`, turnAt, now);
  const label = recordLabel(card);
  return (
    <div className="tv-pane tv-records-pane">
      <section className={`tv-record tv-glass is-${card.kind}${card.worst ? " is-worst" : ""}`} aria-label={label}
        data-record={card.kind} style={{ width:RECORD_PANEL.width, "--tl":`${-elapsed}ms` }}>
        <h2 className="tv-record-label">{label}</h2>
        {card.kind === "h2h" ? <HeadToHead state={state} card={card} /> : <Solo state={state} card={card} />}
      </section>
    </div>
  );
}
