/* Every controller screen but the race (float/PROTOCOL.md "The Cup"):
   connecting, the lobby, the next leg (intro and grid), the cut (through,
   with the floatie swap; or out), the beach (finish your drink, then the
   balloons), the podium and the feedback card. The race and its countdown
   are RaceScreen. */
import React, { useMemo, useState } from "react";
import Portrait from "../locker/Portrait.jsx";
import FloatieCard, { FloatieGlyph } from "../locker/FloatieCard.jsx";
import LockerPicker from "../locker/LockerPicker.jsx";
import { FLOATIES, floatieOf } from "../../shared/floaties.js";
import TapButton from "./TapButton.jsx";
import { CupIcon, FlipButton } from "./RaceScreen.jsx";
import { beachState, cupDone, drinksOn, finalPlace, gridSlot, indexes, legName, ordinal, resultOf, roundShape,
  swapView } from "./controllerModel.js";
import { tapTick } from "../../../src/lib/haptics.js";

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
    {legs.map((l, k) => <li key={l.id || k} className={k < leg ? "is-done" : k === leg ? "is-now" : ""}
      aria-current={k === leg ? "step" : undefined}><i /><span>{l.name}</span></li>)}
  </ol>;
}

/* the field as dots, the ones that go through lit, the cut line after them */
function CutLine({ of, through }) {
  if (!(of > 0)) return null;
  const dots = Array.from({ length:of }, (_, k) => k);
  return <div className="flc-cutline" role="img" aria-label={through ? `${through} of ${of} go through` : `${of} racing`}>
    {dots.map(k => <React.Fragment key={k}>
      {through && k === through && <span className="flc-cutline-bar" />}
      <i className={through && k >= through ? "is-out" : "is-in"} />
    </React.Fragment>)}
  </div>;
}

/* two thumbs pulling down in turn: how to paddle, without a word */
export function PaddleDemo() {
  return <div className="flc-demo" aria-hidden="true">
    <span className="flc-demo-side is-L"><i className="flc-demo-thumb" /><i className="flc-demo-trail" /></span>
    <span className="flc-demo-side is-R"><i className="flc-demo-thumb" /><i className="flc-demo-trail" /></span>
  </div>;
}

function Connecting() {
  return <section className="flc-screen flc-connecting">
    <div className="flc-ripples" aria-hidden="true"><i /><i /><i /></div>
    <p>Joining</p>
  </section>;
}

function ReadyButton({ ready, onReady }) {
  return <TapButton className={`flc-ready${ready ? " is-on" : ""}`} onPress={() => onReady(!ready)} aria-pressed={ready}>
    <span className="flc-ready-box" aria-hidden="true">{ready && <svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}</span>
    Ready
  </TapButton>;
}

function Lobby({ game, entrant, me, groom, onReady, onLook, onExit }) {
  const [locker, setLocker] = useState(false);
  const room = game.room, idx = game.idx;
  const entrants = Array.isArray(room?.entrants) ? room.entrants : [];
  const ready = !!entrants[idx]?.ready;
  const readyCount = entrants.filter(e => e?.ready).length;
  const party = room?.mode !== "fieldday" && idx >= 0;
  const look = entrant.look || me.look;
  const floatie = floatieOf(look.floatie);
  if (locker) {
    return <section className="flc-screen flc-locker-sheet">
      <Top left={<h2 className="flc-sheet-title">Look</h2>}
        right={<TapButton className="flc-pill is-primary" onPress={() => { tapTick(); setLocker(false); }}>Done</TapButton>} />
      <div className="flc-sheet-body"><LockerPicker look={look} onChange={onLook} groom={groom} color={entrant.color}
        name={entrant.name} photo={entrant.photo} number={entrant.number} skin={entrant.skin} /></div>
    </section>;
  }
  return <section className="flc-screen flc-lobby">
    <Top left={<ExitButton onExit={onExit} />} right={room?.code ? <span className="flc-code" aria-label="Room code">
      {String(room.code).toUpperCase()}</span> : null} />
    <div className="flc-lobby-main">
      <div className="flc-stage"><Portrait entrant={entrant} size={176} /></div>
      <div className="flc-lobby-side">
        <h1 className="flc-name">{entrant.name}</h1>
        <span className="flc-floatie-chip"><FloatieGlyph id={floatie.id} />{floatie.name}</span>
        <div className="flc-lobby-actions">
          <TapButton className="flc-pill" onPress={() => { tapTick(); setLocker(true); }}>Change look</TapButton>
          {party && <ReadyButton ready={ready} onReady={onReady} />}
        </div>
      </div>
    </div>
    {entrants.length > 1 && <div className="flc-roster">
      {party && <span className="flc-roster-count">{readyCount} of {entrants.length} ready</span>}
      <ul>{entrants.map((e, k) => <li key={e.device || k} className={`${e.ready && party ? "is-ready" : ""}${k === idx ? " is-me" : ""}${e.connected === false ? " is-away" : ""}`}>
        <Portrait entrant={e} size={36} label={e.name} /></li>)}</ul>
    </div>}
  </section>;
}

function NextLeg({ screen, game, entrant, onFlip }) {
  const room = game.room, idx = game.idx;
  const shape = roundShape(room);
  const leg = Number(room?.leg) || 0;
  const name = legName(game.course, leg);
  const slot = screen === "grid" ? gridSlot(room, idx) : null;
  return <section className="flc-screen flc-next">
    <Top left={<span className="flc-kicker">{shape.final ? "Final" : `Round ${shape.round + 1}${shape.rounds ? ` of ${shape.rounds}` : ""}`}</span>}
      right={<>{drinksOn(room, idx) && <span className="flc-fresh"><CupIcon />Fresh drink</span>}{onFlip && <FlipButton onFlip={onFlip} />}</>} />
    <div className="flc-next-main">
      <div className="flc-next-text">
        <h1 className="flc-leg" key={name}>{name || "Next leg"}</h1>
        <LegTrack course={game.course} leg={leg} />
      </div>
      <PaddleDemo />
    </div>
    <div className="flc-next-foot">
      <span className="flc-me-chip"><Portrait entrant={entrant} size={44} />
        {slot ? <b><small>Start</small>{ordinal(slot)}</b> : <b>{entrant.name}</b>}</span>
      <CutLine of={shape.of} through={shape.through} />
    </div>
  </section>;
}

function SwapPicker({ look, room, now, onLook }) {
  const swap = swapView(room, now);
  const pick = id => {
    if (!swap.open || look.floatie === id) return;
    tapTick();
    onLook({ ...look, floatie:id });
  };
  return <div className={`flc-swap${swap.open ? "" : " is-closed"}`}>
    <div className="flc-swap-head">
      <span>Floatie</span>
      {swap.open && <i className="flc-swap-time" style={{ "--left":Math.min(1, swap.left / 15000) }} role="img"
        aria-label={`${Math.ceil(swap.left / 1000)} seconds`} />}
    </div>
    <div className="flc-swap-grid">
      {FLOATIES.map(f => <TapButton key={f.id} className="flc-swap-card" disabled={!swap.open && look.floatie !== f.id}
        aria-pressed={look.floatie === f.id} onPress={() => pick(f.id)}>
        <FloatieCard floatie={f} selected={look.floatie === f.id} compact />
      </TapButton>)}
    </div>
  </div>;
}

function Through({ game, entrant, me, now, onLook, onFlip }) {
  const room = game.room, idx = game.idx;
  const mine = resultOf(room, idx);
  const shape = roundShape(room);
  const done = cupDone(room);
  const nextLeg = done ? "" : legName(game.course, (Number(room?.leg) || 0) + 1);
  const toFinal = !done && shape.rounds > 0 && shape.round + 1 === shape.rounds - 1;
  const place = done ? finalPlace(room, idx) : mine?.place;
  const stamp = done ? ordinal(place) || "In" : toFinal ? "Final" : "Through";
  return <section className={`flc-screen flc-cutscreen${done ? " is-done" : ""}${done && place && place <= 3 ? ` is-p${place}` : ""}`}>
    <Top left={<span className="flc-kicker">{nextLeg ? `Next: ${nextLeg}` : ""}</span>} right={<>{onFlip && <FlipButton onFlip={onFlip} />}</>} />
    <div className="flc-cut-main">
      <div className="flc-verdict">
        <div className="flc-verdict-me"><Portrait entrant={entrant} size={done ? 112 : 60} />
          {!done && mine?.place && <span className="flc-verdict-place">{ordinal(mine.place)}</span>}</div>
        <b className="flc-stamp" key={stamp}>{stamp}</b>
        {!done && drinksOn(room, idx) && <span className="flc-fresh"><CupIcon />Fresh drink</span>}
      </div>
      {!done && <SwapPicker look={entrant.look || me.look} room={room} now={now} onLook={onLook} />}
    </div>
  </section>;
}

function Balloon({ cooldown, ready, readyAt, now, racing }) {
  const r = 26, c = 2 * Math.PI * r;
  const left = readyAt !== null && now < readyAt ? readyAt - now : 0;
  return <svg className={`flc-balloon${ready ? " is-ready" : ""}${racing ? "" : " is-idle"}`} viewBox="0 0 64 64" aria-hidden="true">
    <circle className="flc-balloon-track" cx="32" cy="32" r={r} />
    <circle className="flc-balloon-ring" cx="32" cy="32" r={r} key={readyAt ?? "ready"}
      style={{ strokeDasharray:c, strokeDashoffset:c * cooldown, "--ring-ms":`${left}ms`, "--ring-c":c }} />
    <path className="flc-balloon-body" d="M32 15c7 0 12 6 12 13 0 8-6 14-12 14s-12-6-12-14c0-7 5-13 12-13z" />
    <path className="flc-balloon-knot" d="M29 42h6l-3 4z" />
  </svg>;
}

function Beach({ screen, game, now, onDrink, onThrow, onExit }) {
  const room = game.room, idx = game.idx;
  const [throws, setThrows] = useState(null);
  const memory = useMemo(() => {
    const m = { ...game.memory };
    if (throws && (m.lastThrowAt == null || m.lastThrowAt < throws.s)) m.lastThrowAt = throws.s;
    return m;
  }, [game.memory, throws]);
  const beach = beachState({ room, me:null, idx, memory, now });
  const entrants = Array.isArray(room?.entrants) ? room.entrants : [];
  const mine = resultOf(room, idx);
  const place = screen === "outcut" ? mine?.place : finalPlace(room, idx);
  const throwAt = i => {
    if (!beach.ready) return;
    setThrows({ i, s:now, at:Date.now() });
    onThrow(i);
  };
  /* where our last balloon landed: a hit on someone, or a miss */
  const landed = memory.landed && Number.isFinite(memory.landed.s) && now - memory.landed.s < 1600 ? memory.landed : null;
  /* between rounds the room still names the leg just raced: the next is one on */
  const upcoming = (Number(room?.leg) || 0) + (room?.phase === "cut" || room?.phase === "results" ? 1 : 0);
  const nextLeg = cupDone(room) ? "" : legName(game.course, upcoming);
  const wait = beach.readyAt !== null && now < beach.readyAt ? Math.ceil((beach.readyAt - now) / 1000) : 0;
  return <section className="flc-screen flc-beach">
    <Top left={<span className="flc-kicker is-out">Out</span>} right={<ExitButton onExit={onExit} />} />
    {beach.needsDrink ? <div className="flc-beach-drink">
      {place ? <span className="flc-out-place">{ordinal(place)}</span> : null}
      <h2>Finish your drink</h2>
      <TapButton className="flc-drink is-big is-idle" onPress={onDrink}>
        <CupIcon /><span>Finished my drink</span>
      </TapButton>
    </div> : <div className="flc-beach-throw">
      <div className={`flc-beach-head${beach.ready ? " is-ready" : ""}`}>
        <Balloon cooldown={beach.cooldown} ready={beach.ready} readyAt={beach.readyAt} now={now} racing={beach.racing} />
        <div className="flc-beach-status">
          <b>{beach.racing ? (beach.ready ? "Balloon ready" : `${wait} s`) : nextLeg ? `Next: ${nextLeg}` : "Between rounds"}</b>
          {beach.racing && !beach.ready && <span>Next balloon</span>}
        </div>
        {landed && <span className={`flc-landed${landed.j !== null ? " is-hit" : ""}`} key={landed.s}>{landed.j !== null ? "Hit" : "Miss"}</span>}
      </div>
      <ul className="flc-targets">
        {beach.targets.map(t => {
          const e = entrants[t.i] || {};
          const flying = throws?.i === t.i && Date.now() - throws.at < 1400;
          return <li key={t.i}>
            <TapButton className={`flc-target${t.immune ? " is-immune" : ""}${t.arrived ? " is-in" : ""}${flying ? " is-flying" : ""}`}
              disabled={!beach.ready || t.immune || t.arrived} onPress={() => throwAt(t.i)} aria-label={`Throw at ${e.name || "racer"}`}>
              <Portrait entrant={e} size={60} /><span>{e.name}</span>
              {t.arrived && <small>In</small>}
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
      <div className="flc-stage is-podium"><Portrait entrant={entrant} size={156} /></div>
      <div className="flc-podium-place">
        <b>{place ? ordinal(place) : ""}</b>
        {place && <span>of {entrants.length}</span>}
      </div>
    </div>
    {podium.length > 0 && <ol className="flc-podium-row">
      {podium.map((i, k) => <li key={i} className={`is-p${k + 1}${i === idx ? " is-me" : ""}`}>
        <Portrait entrant={entrants[i] || {}} size={k === 0 ? 56 : 46} label={entrants[i]?.name} />
        <span>{ordinal(k + 1)}</span></li>)}
    </ol>}
  </section>;
}

function Feedback({ onFeedback, onExit, feedbackSent }) {
  const [fun, setFun] = useState(0);
  const [again, setAgain] = useState(null);
  const [better, setBetter] = useState("");
  if (feedbackSent) return <section className="flc-screen flc-feedback is-sent">
    <Top right={<ExitButton onExit={onExit} />} />
    <h2 className="flc-thanks">Thanks</h2>
  </section>;
  const send = () => {
    if (!fun || again === null) return;
    onFeedback({ fun, again, better:better.trim().slice(0, 200) });
  };
  return <section className="flc-screen flc-feedback">
    <Top right={<ExitButton onExit={onExit} />} />
    <form className="flc-form" onSubmit={event => { event.preventDefault(); send(); }}>
      <fieldset>
        <legend>How fun was that?</legend>
        <div className="flc-scale">{[1, 2, 3, 4, 5].map(n => <button key={n} type="button" className={fun === n ? "is-on" : ""}
          aria-pressed={fun === n} onClick={() => { tapTick(); setFun(n); }}>{n}</button>)}</div>
      </fieldset>
      <fieldset>
        <legend>Would you play this with other friends?</legend>
        <div className="flc-yesno">{[["Yes", true], ["No", false]].map(([label, value]) => <button key={label} type="button"
          className={again === value ? "is-on" : ""} aria-pressed={again === value} onClick={() => { tapTick(); setAgain(value); }}>{label}</button>)}</div>
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
