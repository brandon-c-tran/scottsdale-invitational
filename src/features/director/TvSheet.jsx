/* The commissioner's TV: what the room's TV shows now, and what he can put
   on it. The card leads (the scene, its steps as lamps, the TVs in the
   room and their sound), then the scenes as tiles, then the kiosk
   shortcut that keeps a TV's sound across reloads. Scenes need the
   showControl capability; the card, the room and the shortcut do not. */
import React, { useEffect, useState } from "react";
import { ActionButton, Sheet } from "../../ui/controls.jsx";
import { GameMark } from "../../ui/GameMark.jsx";
import { FDMark } from "../../ui/Brand.jsx";
import { Icon } from "../../ui/Icon.jsx";
import { EventName } from "../../ui/OneSafe.jsx";
import { TV_STALE_MS } from "./tvHealth.js";
import { tvAdvanceLabel, tvAmbient, tvNowCard, tvRetry, tvRoom, tvSceneTiles } from "./tvSheetModel.js";
import "./tv-sheet.css";

const ICON_OF = { opening:null, standings:"payouts", champion:"trophy", unknown:"tv" };

/* a scene's picture: the event's own mark, the FD chip for the Opening,
   else a line glyph set in the same round glass insert */
function SceneGlyph({ kind, event, size }) {
  if (event) return <GameMark id={event.game} variant={event.variant} size={size} />;
  if (kind === "opening") return <span className="fd-tv-glyph is-mark" style={{ width:size, height:size }}><FDMark size={size} /></span>;
  return <span className="fd-tv-glyph" style={{ width:size, height:size }} aria-hidden="true">
    <Icon name={ICON_OF[kind] || "tv"} size={Math.round(size * 0.5)} /></span>;
}

function useNow(active) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), Math.round(TV_STALE_MS / 4));
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

/* each TV in the room with its sound; none while the weekend is on is the
   problem worth a word */
function TvRoom({ room }) {
  if (!room) return null;
  if (room.missing) return <div className="fd-tvnow-room is-missing" role="status">
    <Icon name="tv" size={18} /><span>No TV connected</span></div>;
  return <ul className="fd-tvnow-room" aria-label="TVs">
    {room.tvs.map(tv => (
      <li key={tv.key} className={tv.sound === "off" ? "is-off" : ""}>
        <Icon name="tv" size={18} />
        {tv.sound && <Icon name={tv.sound === "off" ? "mute" : "sound"} size={16} />}
        <span>{tv.sound === "off" ? "Sound off" : tv.sound === "on" ? "Sound on" : "On"}</span>
      </li>
    ))}
  </ul>;
}

export function TvSheet({ state, events, scene, operationEvent = null, scenes = false, tvs = null, tvsAt = 0,
  onClose, onBack, onStart, onAdvance, onEnd, onRetry, onShortcut }) {
  const now = useNow(Array.isArray(tvs));
  const ambient = tvAmbient(state, events, operationEvent);
  const card = tvNowCard(scene, ambient);
  const room = tvRoom({ tvs, receivedAt:tvsAt, live:!!state.live, now });
  const tiles = scenes && !scene ? tvSceneTiles(state, events, operationEvent) : [];
  const retry = scenes ? tvRetry(state) : null;
  const sceneId = scene?.active?.id;
  const current = card.steps.find(step => step.state === "live");

  return (
    <Sheet title="TV" onClose={onClose} onBack={onBack} className="fd-tv-sheet">
      <section className="fd-menu-section" aria-label="On the TV now">
        <h3 className="fd-menu-head"><span className="fd-menu-head-glyph" aria-hidden="true"><Icon name="tv" size={18} /></span>
          <span>On the TV now</span></h3>
        <div className={`fd-tvnow fd-glass-field ${card.playing ? "fd-field-live fd-lamp is-live" : "fd-field-info"}`}>
          <div className="fd-tvnow-main">
            <SceneGlyph kind={card.kind} event={card.event} size={56} />
            <div className="fd-tvnow-text">
              <strong className="fd-show">{card.event && card.kind === "live" ? <EventName name={card.label} /> : card.label}</strong>
              {card.event && card.kind !== "live" && <span className="fd-tvnow-event">{card.event.name}</span>}
            </div>
          </div>
          {card.steps.length > 0 && (
            <ol className="fd-tvnow-steps" aria-label={current ? `${current.name}, step ${card.step + 1} of ${card.stepCount}` : undefined}>
              {card.steps.map(step => (
                <li key={step.key} className={`is-${step.state}`} aria-current={step.state === "live" ? "step" : undefined}>
                  <span className={`fd-insert${step.state === "done" ? " is-done" : step.state === "next" ? " is-off" : ""}`} aria-hidden="true" />
                  <span>{step.name}</span>
                </li>
              ))}
            </ol>
          )}
          {card.stale && <p className="fd-tvnow-stale" role="status">{card.stale}</p>}
          <TvRoom room={room} />
        </div>
      </section>

      {scenes && scene && (
        <div className="fd-tv-controls">
          <ActionButton disabled={!scene.definition} onClick={() => onAdvance(sceneId)} className="is-next">
            {tvAdvanceLabel(scene)}</ActionButton>
          <ActionButton variant="secondary" onClick={() => onEnd(sceneId, "cancelled")}>End</ActionButton>
          <ActionButton variant="tertiary" onClick={() => onEnd(sceneId, "skipped")}>Skip</ActionButton>
        </div>
      )}

      {tiles.length > 0 && (
        <section className="fd-menu-section" aria-label="Put on the TV">
          <h3 className="fd-menu-head"><span className="fd-menu-head-glyph" aria-hidden="true"><Icon name="play" size={18} /></span>
            <span>Put on the TV</span></h3>
          <div className="fd-tv-tiles">
            {tiles.map(tile => <SceneTile key={`${tile.kind}:${tile.eventId || ""}`} tile={tile}
              onStart={() => onStart({ kind:tile.kind, eventId:tile.eventId })} />)}
          </div>
          {retry && <ActionButton variant="tertiary" onClick={() => onRetry(retry.id)} className="fd-tv-retry">
            <Icon name="undo" size={16} />Retry {retry.label}</ActionButton>}
        </section>
      )}

      {onShortcut && <ActionButton variant="tertiary" onClick={onShortcut} className="fd-tv-shortcut">
        Copy TV sound shortcut</ActionButton>}
    </Sheet>
  );
}

/* one scene: its picture and its name; the event under it when it has one */
function SceneTile({ tile, onStart }) {
  const [busy, setBusy] = useState(false);
  const start = async () => {
    if (busy) return;
    setBusy(true);
    try { await onStart(); } finally { setBusy(false); }
  };
  return (
    <button type="button" className="fd-tv-tile" onClick={start} disabled={busy} aria-busy={busy || undefined}>
      <SceneGlyph kind={tile.kind} event={tile.event} size={44} />
      <span className="fd-tv-tile-text">
        <b>{tile.label}</b>
        {tile.event && <small>{tile.event.name}</small>}
      </span>
    </button>
  );
}
