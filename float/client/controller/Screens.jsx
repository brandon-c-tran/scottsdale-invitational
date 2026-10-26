/* Every controller screen but the race (float/PROTOCOL.md "The Cup"):
   connecting, the lobby, the next leg (intro and grid), the cut (through,
   with the floatie swap; or out), the beach (finish your drink, then the
   balloons), the podium and the feedback card. The race and its countdown
   are RaceScreen. */
import React, { useEffect, useMemo, useRef, useState } from "react";
import Portrait from "../locker/Portrait.jsx";
import FloatieCard from "../locker/FloatieCard.jsx";
import LockerPicker from "../locker/LockerPicker.jsx";
import { FLOATIES, floatieOf } from "../../shared/floaties.js";
import { CRITTERS } from "../../shared/looks.js";
import TapButton from "./TapButton.jsx";
import { CupIcon, FlipButton } from "./RaceScreen.jsx";
import { BALLOON_MS, beachState, drinksOn, finalPlace, gridSlot, indexes, legName, ordinal, resultOf, roundShape,
  swapEndsAt } from "./controllerModel.js";

const critterName = id => CRITTERS.find(c => c.id === id)?.name || "";

function Top({ left = null, right = null }) {
  return <div className="flc-top">{left}<span className="flc-top-gap" />{right}</div>;
}

function ExitButton({ onExit }) {
  if (!onExit) return null;
  return <TapButton className="flc-exit" onPress={onExit} aria-label="Leave">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
  </TapButton>;
}

/* the four legs as one river: done, this one, still to come */
function LegTrack({ course, leg }) {
  const legs = Array.isArray(course?.legs) && course.legs.length ? course.legs : null;
  if (!legs) return null;
  return <ol className="flc-legs" aria-label="Legs">
    {legs.map((l, k) => <li key={l.id || k} className={k < leg ? "is-done" : k === leg ? "is-now" : ""}><i /><span>{l.name}</span></li>)}
  </ol>;
}

function Connecting() {
  return <section className="flc-screen flc-connecting">
    <div className="flc-ripples" aria-hidden="true"><i /><i /><i /></div>
    <p>Joining</p>
  </section>;
}

function Lobby({ game, entrant, me, groom, onReady, onLook, onExit }) {
  const [locker, setLocker] = useState(false);
  const room = game.room, idx = game.idx;
  const entrants = Array.isArray(room?.entrants) ? room.entrants : [];
  const ready = !!entrants[idx]?.ready;
  const readyCount = entrants.filter(e => e?.ready).length;
  const look = me.look;
  if (locker) {
    return <section className="flc-screen flc-locker-sheet">
      <Top left={<h2 className="flc-sheet-title">Look</h2>}
        right={<TapButton className="flc-pill is-primary" onPress={() => setLocker(false)}>Done</TapButton>} />
      <div className="flc-sheet-body"><LockerPicker look={look} onChange={onLook} groom={groom} color={entrant.color}
        photo={entrant.photo} number={entrant.number} skin={entrant.skin} /></div>
    </section>;
  }
  return <section className="flc-screen flc-lobby">
    <Top left={<ExitButton onExit={onExit} />} right={room?.code ? <span className="flc-code">{String(room.code).toUpperCase()}</span> : null} />
    <div className="flc-lobby-main">
      <div className="flc-stage">
        <Portrait entrant={entrant} size={168} />
      </div>
      <div className="flc-lobby-side">
        <h1 className="flc-name">{entrant.name}</h1>
        <p className="flc-sub">{critterName(look.critter)} · {floatieOf(look.floatie).name}</p>
        <div className="flc-lobby-actions">
          <TapButton className="flc-pill" onPress={() => setLocker(true)}>Change look</TapButton>
          <TapButton className={`flc-ready${ready ? " is-on" : ""}`} onPress={() => onReady(!ready)} aria-pressed={ready}>
            <span className="flc-ready-box" aria-hidden="true">{ready && <svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}</span>
            Ready
          </TapButton>
        </div>
      </div>
    </div>
    {entrants.length > 1 && <div className="flc-roster">
      <span className="flc-roster-count">{readyCount} of {entrants.length} ready</span>
      <ul>{entrants.map((e, k) => <li key={e.device || k} className={`${e.ready ? "is-ready" : ""}${k === idx ? " is-me" : ""}`}>
        <Portrait entrant={e} size={34} /></li>)}</ul>
    </div>}
  </section>;
}

function NextLeg({ screen, game, entrant, onFlip }) {
  const room = game.room, idx = game.idx;
  const shape = roundShape(room);
  const name = legName(game.course, Number(room?.leg) || 0);
  const slot = screen === "grid" ? gridSlot(room, idx) : null;
  const through = shape.final ? null : nextFieldSize(room);
  return <section className="flc-screen flc-next">
    <Top left={<span className="flc-kicker">{shape.final ? "Final" : `Round ${shape.round + 1} of ${shape.rounds || 4}`}</span>}
      right={<>{onFlip && <FlipButton onFlip={onFlip} />}</>} />
    <div className="flc-next-main">
      <h1 className="flc-leg">{name || "Next leg"}</h1>
      <LegTrack course={game.course} leg={Number(room?.leg) || 0} />
    </div>
    <div className="flc-next-foot">
      <span className="flc-me-chip"><Portrait entrant={entrant} size={40} />{slot ? <b>Start {ordinal(slot)}</b> : <b>{entrant.name}</b>}</span>
      <span className="flc-facts">{shape.of} racing{through ? ` · ${through} go through` : ""}</span>
      {drinksOn(room, idx) && <span className="flc-fresh"><CupIcon />Fresh drink</span>}
    </div>
  </section>;
}

/* how many go through this round, when the room says (a proposed `room.cut`, like `me.cut`) */
function nextFieldSize(room) {
  const cut = Number(room?.cut);
  return cut > 0 ? cut : null;
}

function SwapPicker({ look, endsAt, now, onLook }) {
  const left = endsAt ? Math.max(0, endsAt - now) : 0;
  const open = left > 0;
  return <div className={`flc-swap${open ? "" : " is-closed"}`}>
    <div className="flc-swap-head">
      <span>Floatie</span>
      {open && <i className="flc-swap-time" style={{ "--left":Math.min(1, left / 15000) }} aria-label={`${Math.ceil(left / 1000)} seconds`} />}
    </div>
    <div className="flc-swap-grid">
      {FLOATIES.map(f => <TapButton key={f.id} className="flc-swap-card" disabled={!open} aria-pressed={look.floatie === f.id}
        onPress={() => { if (look.floatie !== f.id) onLook({ ...look, floatie:f.id }); }}>
        <FloatieCard floatie={f} selected={look.floatie === f.id} compact />
      </TapButton>)}
    </div>
  </div>;
}

function Through({ game, me, now, onLook, onFlip }) {
  const room = game.room, idx = game.idx;
  const mine = resultOf(room, idx);
  const shape = roundShape(room);
  const nextLeg = legName(game.course, (Number(room?.leg) || 0) + 1);
  const toFinal = shape.rounds > 0 && shape.round + 1 === shape.rounds - 1;
  const noCuts = !indexes(room?.out).length && indexes(room?.field).length <= 3;
  return <section className="flc-screen flc-cut">
    <Top left={<span className="flc-kicker">{nextLeg ? `Next: ${nextLeg}` : ""}</span>} right={<>{onFlip && <FlipButton onFlip={onFlip} />}</>} />
    <div className="flc-cut-main">
      <div className="flc-verdict is-through">
        <b className="flc-stamp">{noCuts ? (mine?.place ? ordinal(mine.place) : "Done") : toFinal ? "Final" : "Through"}</b>
        {!noCuts && mine?.place && <span>{ordinal(mine.place)}</span>}
        {drinksOn(room, idx) && <span className="flc-fresh"><CupIcon />Fresh drink</span>}
      </div>
      <SwapPicker look={me.look} endsAt={swapEndsAt(room)} now={now} onLook={onLook} />
    </div>
  </section>;
}

function Balloon({ cooldown, ready }) {
  const r = 26, c = 2 * Math.PI * r;
  return <svg className={`flc-balloon${ready ? " is-ready" : ""}`} viewBox="0 0 64 64" aria-hidden="true">
    <circle className="flc-balloon-track" cx="32" cy="32" r={r} />
    <circle className="flc-balloon-ring" cx="32" cy="32" r={r} style={{ strokeDasharray:c, strokeDashoffset:c * cooldown }} />
    <path className="flc-balloon-body" d="M32 15c7 0 12 6 12 13 0 8-6 14-12 14s-12-6-12-14c0-7 5-13 12-13z" />
    <path className="flc-balloon-knot" d="M29 42h6l-3 4z" />
  </svg>;
}

function Beach({ screen, game, entrant, now, drink, onDrink, onThrow, onExit }) {
  const room = game.room, idx = game.idx;
  const [sentAt, setSentAt] = useState(null);
  const [thrown, setThrown] = useState(null);
  const memory = useMemo(() => {
    const m = { ...game.memory };
    if (sentAt !== null && (m.lastThrowAt == null || m.lastThrowAt < sentAt)) m.lastThrowAt = sentAt;
    return m;
  }, [game.memory, sentAt]);
  const beach = beachState({ room, me:game.me, idx, memory:drink === "sent" ? { ...memory, drinkRounds:[...(memory.drinkRounds || []), Number(room?.round) || 0] } : memory, now });
  const entrants = Array.isArray(room?.entrants) ? room.entrants : [];
  const mine = resultOf(room, idx);
  const place = finalPlace(room, idx);
  const throwAt = i => {
    if (!beach.ready) return;
    setSentAt(now);
    setThrown({ i, at:Date.now() });
    onThrow(i);
  };
  const nextLeg = legName(game.course, Number(room?.leg) || 0);
  return <section className="flc-screen flc-beach">
    <Top left={<span className="flc-kicker">{screen === "outcut" ? "Out" : "Beach"}</span>}
      right={<ExitButton onExit={onExit} />} />
    {beach.needsDrink ? <div className="flc-beach-drink">
      <span className="flc-out-place">{screen === "outcut" && mine?.place ? ordinal(mine.place) : place ? ordinal(place) : ""}</span>
      <h2>Finish your drink</h2>
      <TapButton className={`flc-drink is-big${drink === "sent" ? " is-sent" : ""}`} onPress={onDrink} disabled={drink === "sent"}>
        <CupIcon done={drink === "sent"} /><span>Finished my drink</span>
      </TapButton>
    </div> : <div className="flc-beach-throw">
      <div className="flc-beach-head">
        <Balloon cooldown={beach.cooldown} ready={beach.ready} />
        <div>
          <b>{beach.racing ? (beach.ready ? "Balloon ready" : `${Math.ceil(Math.max(0, beach.readyAt - now) / 1000)} s`) : nextLeg ? `Next: ${nextLeg}` : "Between rounds"}</b>
          <span>One every {BALLOON_MS / 1000} s</span>
        </div>
      </div>
      <ul className="flc-targets">
        {beach.targets.map(t => {
          const e = entrants[t.i] || {};
          return <li key={t.i}>
            <TapButton className={`flc-target${t.immune ? " is-immune" : ""}${thrown?.i === t.i && Date.now() - thrown.at < 1400 ? " is-hit" : ""}`}
              disabled={!beach.ready || t.immune} onPress={() => throwAt(t.i)} aria-label={`Throw at ${e.name || "racer"}`}>
              <Portrait entrant={e} size={56} /><span>{e.name}</span>
            </TapButton>
          </li>;
        })}
      </ul>
    </div>}
  </section>;
}

function Podium({ game, entrant, onExit }) {
  const room = game.room, idx = game.idx;
  const place = finalPlace(room, idx);
  const podium = indexes(room?.podium);
  const entrants = Array.isArray(room?.entrants) ? room.entrants : [];
  const top = place && place <= 3;
  return <section className={`flc-screen flc-podium${top ? ` is-top is-p${place}` : ""}`}>
    <Top left={<span className="flc-kicker">Cup</span>} right={<ExitButton onExit={onExit} />} />
    <div className="flc-podium-main">
      <div className="flc-stage is-podium"><Portrait entrant={entrant} size={150} /></div>
      <div className="flc-podium-place">
        <b>{place ? ordinal(place) : ""}</b>
        {place && <span>of {entrants.length}</span>}
      </div>
    </div>
    {podium.length > 0 && <ol className="flc-podium-row">
      {podium.map((i, k) => <li key={i} className={i === idx ? "is-me" : ""}><Portrait entrant={entrants[i] || {}} size={44} />
        <span>{ordinal(k + 1)}</span></li>)}
    </ol>}
  </section>;
}

function Feedback({ onFeedback, onExit }) {
  const [fun, setFun] = useState(0);
  const [again, setAgain] = useState(null);
  const [better, setBetter] = useState("");
  const [sent, setSent] = useState(false);
  if (sent) return <section className="flc-screen flc-feedback is-sent">
    <Top right={<ExitButton onExit={onExit} />} />
    <h2 className="flc-thanks">Thanks</h2>
  </section>;
  const send = () => {
    if (!fun || again === null) return;
    onFeedback({ fun, again, better:better.trim().slice(0, 200) });
    setSent(true);
  };
  return <section className="flc-screen flc-feedback">
    <Top right={<ExitButton onExit={onExit} />} />
    <form className="flc-form" onSubmit={event => { event.preventDefault(); send(); }}>
      <fieldset>
        <legend>How fun was that?</legend>
        <div className="flc-scale">{[1, 2, 3, 4, 5].map(n => <button key={n} type="button" className={fun === n ? "is-on" : ""}
          aria-pressed={fun === n} onClick={() => setFun(n)}>{n}</button>)}</div>
      </fieldset>
      <fieldset>
        <legend>Would you play this with other friends?</legend>
        <div className="flc-yesno">{[["Yes", true], ["No", false]].map(([label, value]) => <button key={label} type="button"
          className={again === value ? "is-on" : ""} aria-pressed={again === value} onClick={() => setAgain(value)}>{label}</button>)}</div>
      </fieldset>
      <label className="flc-better">
        <span>What would make it better?</span>
        <textarea value={better} maxLength={200} rows={3} onChange={event => setBetter(event.target.value)}
          autoCorrect="on" spellCheck={true} enterKeyHint="done" />
      </label>
      <button type="submit" className="flc-send" disabled={!fun || again === null}>Send</button>
    </form>
  </section>;
}

function Watch({ game, onExit }) {
  const room = game.room;
  const name = legName(game.course, Number(room?.leg) || 0);
  return <section className="flc-screen flc-watch">
    <Top right={<ExitButton onExit={onExit} />} />
    <div className="flc-watch-main"><span className="flc-kicker">Watching</span><h1 className="flc-leg">{name}</h1></div>
  </section>;
}

export default function Screens(props) {
  const { screen } = props;
  if (screen === "connecting") return <Connecting />;
  if (screen === "lobby") return <Lobby {...props} />;
  if (screen === "intro" || screen === "grid") return <NextLeg {...props} />;
  if (screen === "cut") return <Through {...props} />;
  if (screen === "outcut" || screen === "beach") return <Beach {...props} />;
  if (screen === "podium") return <Podium {...props} />;
  if (screen === "feedback") return <Feedback {...props} />;
  return <Watch {...props} />;
}
