/* Every controller screen but the song (float/GROOVE.md "What the room
   sends"): joining, the lobby, the Cup's intro (the first round card), the
   cut (your percent and place, Through or Out), the crowd (out: cheer from
   the bank), the podium, the feedback card, and watching (not in this Cup).
   The song is SongScreen. */
import React, { useEffect, useRef, useState } from "react";
import Portrait from "../locker/Portrait.jsx";
import LockerPicker from "../locker/LockerPicker.jsx";
import TapButton from "./TapButton.jsx";
import { Critter } from "./art.jsx";
import { CutLine, ExitButton, Scenery, Top } from "./parts.jsx";
import { RoundCard, useBeatBob, useMove, usePose } from "./SongScreen.jsx";
import { CUT_SHOW, chartFor, cutShow, cutView, finalPlace, indexes, ordinal, pctText, roundShape, roundSong, seatView, songAtOf } from "./controllerModel.js";
import { cutBeats } from "./sound.js";
import { tapTick } from "../../../src/lib/haptics.js";

function Connecting({ onExit }) {
  return <section className="flc-screen flc-connecting">
    <Scenery scene="lobby" />
    <Top right={<ExitButton onExit={onExit} />} />
    <div className="flc-ripples" aria-hidden="true"><i /><i /><i /></div>
    <p className="flc-joining">Joining</p>
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
  if (locker) {
    return <section className="flc-screen flc-locker-sheet">
      <Top left={<h2 className="flc-sheet-title">Look</h2>}
        right={<TapButton className="flc-pill is-primary" onPress={() => { tapTick(); setLocker(false); }}>Done</TapButton>} />
      <div className="flc-sheet-body"><LockerPicker look={look} onChange={onLook} groom={groom} color={entrant.color}
        name={entrant.name} photo={entrant.photo} number={entrant.number} skin={entrant.skin} tone="light" /></div>
    </section>;
  }
  return <section className="flc-screen flc-lobby">
    <Scenery scene="lobby" horizon={0.5} />
    <Top left={<ExitButton onExit={onExit} />} right={room?.code ? <span className="flc-code" aria-label="Room code">
      {String(room.code).toUpperCase()}</span> : null} />
    <div className="flc-lobby-main">
      <div className="flc-idle-me"><Critter entrant={entrant} pose={ready ? "cheer" : "idle"} size={260} /></div>
      <h1 className="flc-name">{entrant.name}</h1>
      <div className="flc-lobby-actions">
        <TapButton className="flc-pill" onPress={() => { tapTick(); setLocker(true); }}>Change look</TapButton>
        {party && <ReadyButton ready={ready} onReady={onReady} />}
      </div>
    </div>
    {entrants.length > 1 && <div className="flc-roster">
      {party && <span className="flc-roster-count">{readyCount} of {entrants.length} ready</span>}
      <ul>{entrants.map((e, k) => <li key={e.device || k} className={`${e.ready && party ? "is-ready" : ""}${k === idx ? " is-me" : ""}${e.connected === false ? " is-away" : ""}`}>
        <Portrait entrant={e} size={40} label={e.name} /></li>)}</ul>
    </div>}
  </section>;
}

/* the Cup is about to start: the first round's card */
function Intro({ game, entrant, onExit }) {
  const room = game.room;
  const song = roundSong(room);
  const chart = chartFor({ song:song.id });
  return <section className="flc-screen flc-song is-card" data-scene={chart?.scene || "open"}>
    <Scenery scene={chart?.scene || "open"} />
    <Top right={<ExitButton onExit={onExit} />} />
    <RoundCard shape={roundShape(room)} name={song.name} seats={seatView({ room, idx:game.idx })} entrant={entrant} />
    <div className="flc-stage"><div className="flc-popup-slot" /><div className="flc-idle-me"><Critter entrant={entrant} size={300} /></div></div>
  </section>;
}

/* re-render once the room's clock reaches `at` (server ms) */
function useAt(serverNow, at) {
  const [, bump] = useState(0);
  useEffect(() => {
    if (typeof serverNow !== "function" || !Number.isFinite(at)) return undefined;
    const wait = at - serverNow();
    if (wait <= 0) return undefined;
    const id = setTimeout(() => bump(n => n + 1), wait + 4);
    return () => clearTimeout(id);
  }, [serverNow, at]);
}

/* the cut, after a song (GROOVE.md "After a song"): your grade big with the
   judge's line, then Through or Out when it is heard (the sound's beats:
   on your turn in the outs, revealed from the bottom; Through after the
   last); after the final, your place in the Cup */
const GRADE_POSE = Object.freeze({ superb:"cheer", ok:"nice", tryagain:"miss" });
function Cut({ game, entrant, serverNow, onExit }) {
  const room = game.room, idx = game.idx;
  const view = cutView({ room, me:game.me, idx });
  const song = roundSong(room);
  const chart = chartFor(room, game.chart);
  const judged = game.memory?.song && game.memory.song === game.songKey ? game.memory.judged || {} : {};
  const now = typeof serverNow === "function" ? serverNow() : Date.now();
  const show = cutShow({ room, me:game.me, idx, chart, judged, now, beats:cutBeats() || CUT_SHOW });
  useAt(serverNow, show.at);
  const place = view.final ? view.cupPlace ?? view.place : view.place;
  const stamp = view.final ? ordinal(place) || "In" : view.out ? "Out" : view.bubble ? "Chug-off!" : "Through";
  const tone = view.final ? (place && place <= 3 ? `p${place}` : "final") : view.out ? "out" : view.bubble ? "bubble" : "through";
  const told = show.told || !show.word;
  const pose = !told ? GRADE_POSE[show.grade] || "idle" : view.final ? (place && place <= 3 ? "cheer" : "idle") : view.out ? "out" : view.bubble ? "chug" : "nice";
  const of = view.final ? (room?.entrants?.length || view.of) : view.of;
  return <section className={`flc-screen flc-cut is-${tone}${told ? " is-told" : ""}`} data-scene={chart?.scene || "open"}>
    <Scenery scene={chart?.scene || "open"} />
    <Top left={<span className="flc-kicker">{song.name}</span>} right={<ExitButton onExit={onExit} />} />
    <div className="flc-cut-main">
      {show.word && <b className={`flc-grade is-${show.grade}`} key={show.grade}>{show.word}</b>}
      {show.line && <p className="flc-judge">{show.line}</p>}
      {told && <b className="flc-stamp" key={stamp}>{stamp}</b>}
      {told && <div className="flc-score">
        {view.pct !== null && <b className="flc-pct">{pctText(view.pct)}</b>}
        {place && of ? <span className="flc-place">{view.final ? `of ${of}` : `${ordinal(place)} of ${of}`}</span> : null}
      </div>}
    </div>
    <div className="flc-stage"><div className="flc-idle-me"><Critter entrant={entrant} pose={pose} size={260} /></div></div>
  </section>;
}

/* out: you're the crowd on the TV; Cheer makes your critter jump on the bank */
function Crowd({ game, entrant, serverNow, cheer, onCheer, onExit }) {
  const room = game.room;
  const song = roundSong(room);
  const chart = chartFor(room, game.chart);
  const songAt = room?.phase === "song" ? songAtOf(room) : null;
  const bobRef = useRef(null), moveRef = useRef(null);
  useBeatBob(bobRef, { songAt, serverNow, beatMs:chart?.beatMs, on:Number.isFinite(songAt) });
  useMove(moveRef, cheer);
  const pose = usePose(cheer, "idle");
  return <section className="flc-screen flc-crowd" data-scene={chart?.scene || "open"}>
    <Scenery scene={chart?.scene || "open"} />
    <Top left={<span className="flc-kicker">{song.name}</span>} right={<><span className="flc-out-tag">Out</span><ExitButton onExit={onExit} /></>} />
    <div className="flc-stage"><div className="flc-me" ref={bobRef}><div className="flc-me-move" ref={moveRef}>
      <Critter entrant={entrant} pose={pose} size={260} /></div></div></div>
    <TapButton className="flc-cheer" onPress={onCheer}>Cheer</TapButton>
  </section>;
}

/* the podium: your final place; a rider out cheers the three from the crowd (the room takes it in the podium too) */
function Podium({ game, entrant, cheer = null, onCheer, onExit }) {
  const room = game.room, idx = game.idx;
  const place = finalPlace(room, idx);
  const podium = indexes(room?.podium);
  const entrants = Array.isArray(room?.entrants) ? room.entrants : [];
  const top = place && place <= 3;
  const crowd = idx >= 0 && indexes(room?.out).includes(idx) && typeof onCheer === "function";
  const moveRef = useRef(null);
  useMove(moveRef, cheer);
  const pose = usePose(crowd ? cheer : null, top ? "cheer" : "idle");
  return <section className={`flc-screen flc-podium${top ? ` is-top is-p${place}` : ""}${crowd ? " has-cheer" : ""}`}>
    <Scenery scene="podium" />
    <Top right={<ExitButton onExit={onExit} />} />
    <div className="flc-podium-place">
      <b>{place ? ordinal(place) : ""}</b>
      {place && <span>of {entrants.length}</span>}
    </div>
    <div className="flc-stage"><div className="flc-idle-me"><div className="flc-me-move" ref={moveRef}>
      <Critter entrant={entrant} pose={pose} size={260} /></div></div></div>
    {podium.length > 0 && <ol className="flc-podium-row">
      {podium.map((i, k) => <li key={i} className={`is-p${k + 1}${i === idx ? " is-me" : ""}`}>
        <Portrait entrant={entrants[i] || {}} size={k === 0 ? 60 : 50} label={entrants[i]?.name} />
        <span>{ordinal(k + 1)}</span><b className="flc-podium-name">{i === idx ? "You" : entrants[i]?.name || ""}</b></li>)}
    </ol>}
    {crowd && <TapButton className="flc-cheer" onPress={onCheer}>Cheer</TapButton>}
  </section>;
}

/* the card, after the podium: the questions in the game's text boxes over
   the podium's scene, the answers as its chunky chips, your critter in the
   water under them where the phone has the height (cheering once you have
   rated it); Thanks sits where the podium's place did, your critter
   cheering in the water */
function Feedback({ entrant, onFeedback, onExit, feedbackSent }) {
  const [fun, setFun] = useState(0);
  const [again, setAgain] = useState(null);
  const [better, setBetter] = useState("");
  if (feedbackSent) return <section className="flc-screen flc-feedback is-sent">
    <Scenery scene="podium" />
    <Top right={<ExitButton onExit={onExit} />} />
    <div className="flc-feedback-main"><h2 className="flc-thanks">Thanks</h2></div>
    <div className="flc-stage"><div className="flc-idle-me"><Critter entrant={entrant} pose="cheer" size={260} /></div></div>
  </section>;
  const send = () => {
    if (!fun || again === null) return;
    onFeedback({ fun, again, better:better.trim().slice(0, 200) });
  };
  return <section className="flc-screen flc-feedback">
    <Scenery scene="podium" />
    <Top right={<ExitButton onExit={onExit} />} />
    <div className="flc-feedback-body">
      <form className="flc-form" onSubmit={event => { event.preventDefault(); send(); }}>
        <fieldset className="flc-ask">
          <legend><span>How fun was that?</span></legend>
          <div className="flc-scale">{[1, 2, 3, 4, 5].map(n => <button key={n} type="button" className={fun === n ? "is-on" : ""}
            aria-pressed={fun === n} onClick={() => { tapTick(); setFun(n); }}>{n}</button>)}</div>
        </fieldset>
        <fieldset className="flc-ask">
          <legend><span>Would you play this with other friends?</span></legend>
          <div className="flc-yesno">{[["Yes", true], ["No", false]].map(([label, value]) => <button key={label} type="button"
            className={again === value ? "is-on" : ""} aria-pressed={again === value} onClick={() => { tapTick(); setAgain(value); }}>{label}</button>)}</div>
        </fieldset>
        <label className="flc-better flc-ask">
          <span>What would make it better?</span>
          <textarea value={better} maxLength={200} rows={3} onChange={event => setBetter(event.target.value)}
            autoCorrect="on" spellCheck={true} enterKeyHint="done" />
        </label>
        <button type="submit" className="flc-send" disabled={!fun || again === null}>Send</button>
      </form>
      <div className="flc-feedback-me flc-idle-me"><Critter entrant={entrant} pose={fun ? "cheer" : "idle"} size={260} /></div>
    </div>
  </section>;
}

function Watch({ game, onExit }) {
  const room = game.room;
  const song = roundSong(room);
  const chart = chartFor(room, game.chart);
  return <section className="flc-screen flc-watch" data-scene={chart?.scene || "open"}>
    <Scenery scene={chart?.scene || "open"} />
    <Top right={<ExitButton onExit={onExit} />} />
    <div className="flc-watch-main"><span className="flc-kicker">Watching</span><h1 className="flc-card-title">{song.name}</h1></div>
  </section>;
}

export { CutLine };

export default function Screens(props) {
  const { screen } = props;
  if (screen === "connecting") return <Connecting onExit={props.onExit} />;
  if (screen === "lobby") return <Lobby {...props} />;
  if (screen === "intro") return <Intro {...props} />;
  if (screen === "cut") return <Cut {...props} />;
  if (screen === "crowd") return <Crowd {...props} />;
  if (screen === "podium") return <Podium {...props} />;
  if (screen === "feedback") return <Feedback {...props} />;
  return <Watch {...props} />;
}
