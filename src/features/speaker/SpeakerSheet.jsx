/* The commissioner's Speaker: the Spotify account that plays the room's
   music, the speaker it plays on, whether win songs play themselves, what
   is playing now, every player's win song, and a search to play anything.
   Before Spotify is set up or connected the sheet is that one state. */
import React, { useCallback, useEffect, useState } from "react";
import { ROSTER, disp } from "../../../shared/core.js";
import {
  spotifyAuthorize, spotifyAutoWinSongs, spotifyDevice, spotifyDisconnect, spotifyPause, spotifyPlay, spotifyPlayer,
  spotifySearch,
} from "../../lib/client.js";
import { ActionButton, Sheet } from "../../ui/controls.jsx";
import { Icon } from "../../ui/Icon.jsx";
import { MenuGroup, MenuRow } from "../../ui/Menu.jsx";
import { Avatar } from "../identity/PlayerIdentity.jsx";
import { deviceLabel, speakerStage } from "./speakerModel.js";
import { refreshSpeakerStatus, setSpeakerStatus, useSpeakerStatus } from "./speakerStatus.js";
import "./speaker.css";

function Head({ icon, children }) {
  return <h3 className="fd-menu-head"><span className="fd-menu-head-glyph" aria-hidden="true"><Icon name={icon} size={18} /></span>
    <span>{children}</span></h3>;
}

/* a track's cover, else the song glyph in the same square */
function Cover({ track, size = 44 }) {
  return track?.imageUrl
    ? <img className="fd-speaker-cover" src={track.imageUrl} alt="" width={size} height={size} style={{ width:size, height:size }} />
    : <span className="fd-speaker-cover is-blank" style={{ width:size, height:size }} aria-hidden="true"><Icon name="song" size={Math.round(size / 2.2)} /></span>;
}

/* one song in a list: who or what it is, the song, and its play button */
function SongRow({ face, title, track, busy, onPlay, last }) {
  return (
    <div className={`fd-speaker-row${last ? " is-last" : ""}`}>
      {face}
      <span className="fd-speaker-row-text">
        <b data-fit={title ? undefined : "ellipsis"}>{title || track.name}</b>
        <small data-fit="ellipsis">{title ? track.name : (track.artists || []).join(", ")}</small>
      </span>
      <button type="button" className="fd-speaker-play" onClick={onPlay} disabled={busy} aria-busy={busy || undefined}
        aria-label={`Play ${track.name}`}><Icon name="play" size={18} /></button>
    </div>
  );
}

/* the app's callback, for registering it in Spotify's dashboard */
function Callback({ uri, notify }) {
  if (!uri) return null;
  return (
    <div className="fd-speaker-callback">
      <code>{uri}</code>
      <ActionButton variant="tertiary" compact onClick={() => (navigator.clipboard?.writeText ? navigator.clipboard.writeText(uri) : Promise.reject())
        .then(() => notify?.("Callback copied"), () => notify?.(uri))}>Copy</ActionButton>
    </div>
  );
}

export function SpeakerSheet({ state, onClose, onBack, notify }) {
  const status = useSpeakerStatus(false);
  const [player, setPlayer] = useState(null);
  const [deviceId, setDeviceId] = useState(() => status?.device?.id || "");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const stage = speakerStage(status);
  const saved = ROSTER.map(p => ({ player:p, track:state.profiles?.[p]?.walkoutTrack })).filter(item => item.track);

  const refreshPlayer = useCallback(async () => {
    setBusy("refresh"); setError("");
    const result = await spotifyPlayer();
    setBusy("");
    if (!result.ok) {
      setPlayer(null);
      setError(result.error || "Could not read Spotify");
      return;
    }
    setPlayer(result);
    const devices = result.devices || [];
    setDeviceId(id => devices.some(device => device.id === id)
      ? id : (devices.find(device => device.active) || devices[0])?.id || id || "");
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const result = await refreshSpeakerStatus();
      if (!active) return;
      if (result.device?.id) setDeviceId(result.device.id);
      if (!result.ok) setError(result.error || "Could not read Spotify");
      else if (result.connected) refreshPlayer();
    })();
    return () => { active = false; };
  }, [refreshPlayer]);

  /* the chosen speaker is saved on the server and every song is sent to it */
  const chooseDevice = async id => {
    setDeviceId(id);
    if (!id) return;
    const name = (player?.devices || []).find(device => device.id === id)?.name || "";
    const result = await spotifyDevice({ deviceId:id, name });
    if (!result.ok) setError(result.error || "Could not save the speaker");
    else setSpeakerStatus(current => current ? { ...current, device:result.device } : current);
  };
  const connect = async () => {
    if (busy) return;
    setBusy("connect"); setError("");
    const result = await spotifyAuthorize();
    if (!result.ok) {
      setBusy("");
      setError(result.error || "Could not open Spotify");
      return;
    }
    window.location.assign(result.authorizationUrl);
  };
  const disconnect = async () => {
    if (busy || !window.confirm("Disconnect Spotify?")) return;
    setBusy("disconnect"); setError("");
    const result = await spotifyDisconnect();
    setBusy("");
    if (!result.ok) return setError(result.error || "Disconnect failed");
    setSpeakerStatus(current => ({ ...current, connected:false, account:null, device:null }));
    setPlayer(null);
    notify("Spotify disconnected");
  };
  const runSearch = async event => {
    event?.preventDefault();
    if (busy || query.trim().length < 2) return;
    setBusy("search"); setError("");
    const result = await spotifySearch(query.trim());
    setBusy("");
    if (!result.ok) { setResults([]); setError(result.error || "Search failed"); }
    else setResults(result.tracks || []);
  };
  const playTrack = async (track, playerName = null) => {
    if (busy) return;
    setBusy(`play:${track.trackId}`); setError("");
    const result = await spotifyPlay({ uri:track.uri, deviceId, positionMs:track.startMs || 0, player:playerName,
      durationMs:track.durationMs });
    setBusy("");
    if (!result.ok) return setError(result.error || "Playback failed");
    notify(playerName ? `${disp(state, playerName)}'s song playing` : `${track.name} playing`, null, "gold", playerName);
    setTimeout(refreshPlayer, 450);
  };
  const toggleAuto = async () => {
    if (busy) return;
    const next = status.autoWinSongs === false;
    setBusy("auto"); setError("");
    const result = await spotifyAutoWinSongs(next);
    setBusy("");
    if (!result.ok) return setError(result.error || "Could not change win songs");
    setSpeakerStatus(current => ({ ...current, autoWinSongs:result.autoWinSongs }));
  };
  const playback = async kind => {
    if (busy) return;
    setBusy(kind); setError("");
    const result = kind === "pause" ? await spotifyPause({ deviceId }) : await spotifyPlay({ deviceId });
    setBusy("");
    if (!result.ok) return setError(result.error || "Playback failed");
    setTimeout(refreshPlayer, 350);
  };

  const devices = player?.devices || [];
  const nowTrack = player?.playback?.track || null;
  const playing = player?.playback?.playing === true;

  return (
    <Sheet title="Speaker" onClose={onClose} onBack={onBack} className="fd-speaker-sheet">
      {stage === "checking" && <div className="fd-speaker-wait" aria-busy="true">Checking Spotify</div>}

      {(stage === "setup" || stage === "connect") && (
        <div className="fd-speaker-state fd-glass-field fd-field-info">
          <div className="fd-speaker-state-head">
            <span className="fd-insert is-off" aria-hidden="true" />
            <strong>{stage === "setup" ? "Spotify not set up" : status.reconnect ? "Spotify signed out" : "Spotify not connected"}</strong>
          </div>
          {stage === "setup" ? <dl className="fd-speaker-facts">
            <dt>Worker secrets</dt>
            <dd><code>SPOTIFY_CLIENT_ID</code><code>SPOTIFY_CLIENT_SECRET</code></dd>
            <dt>Callback</dt>
            <dd><Callback uri={status.redirectUri} notify={notify} /></dd>
          </dl> : <>
            <ActionButton onClick={connect} pending={busy === "connect"} style={{ width:"100%" }}>
              {status.reconnect ? "Reconnect Spotify" : "Connect Spotify"}</ActionButton>
            <dl className="fd-speaker-facts">
              <dt>Callback</dt>
              <dd><Callback uri={status.redirectUri} notify={notify} /></dd>
            </dl>
          </>}
        </div>
      )}

      {stage === "connected" && <>
        <div className="fd-speaker-state fd-glass-field fd-field-info">
          <div className="fd-speaker-state-head">
            <span className="fd-insert" aria-hidden="true" />
            <span className="fd-speaker-account">
              <strong>{status.account?.displayName || "Spotify"}</strong>
              {status.premium === false && <small className="is-warn">Needs Spotify Premium</small>}
            </span>
            <ActionButton variant="destructive" compact disabled={!!busy} onClick={disconnect}>Disconnect</ActionButton>
          </div>
          <div className="fd-speaker-pick">
            <span className="fd-speaker-pick-glyph" aria-hidden="true"><Icon name="sound" size={20} /></span>
            <select value={deviceId} onChange={event => chooseDevice(event.target.value)} aria-label="Speaker">
              {!devices.length && <option value={deviceId}>{status.device?.name || (deviceId ? "Saved speaker" : "No speakers found")}</option>}
              {devices.map(device => <option key={device.id} value={device.id} disabled={device.restricted}>{deviceLabel(device)}</option>)}
            </select>
            <button type="button" className="fd-speaker-refresh" onClick={refreshPlayer} disabled={!!busy}
              aria-busy={busy === "refresh" || undefined}>Refresh</button>
          </div>
        </div>

        <MenuGroup>
          <MenuRow name="Play win songs automatically" pressed={status.autoWinSongs !== false} disabled={busy === "auto"}
            onClick={toggleAuto} />
        </MenuGroup>

        {nowTrack && (
          <section className="fd-menu-section" aria-label="Now playing">
            <Head icon="song">Now playing</Head>
            <div className="fd-speaker-now">
              <Cover track={nowTrack} size={56} />
              <span className="fd-speaker-row-text">
                <b data-fit="ellipsis">{nowTrack.name}</b>
                <small data-fit="ellipsis">{(nowTrack.artists || []).join(", ")}</small>
              </span>
              <ActionButton variant="secondary" compact pending={busy === "pause" || busy === "resume"}
                onClick={() => playback(playing ? "pause" : "resume")} className="fd-speaker-toggle">
                <Icon name={playing ? "pause" : "play"} size={16} />{playing ? "Pause" : "Play"}</ActionButton>
            </div>
          </section>
        )}

        {saved.length > 0 && (
          <section className="fd-menu-section" aria-label="Win songs">
            <Head icon="trophy">Win songs</Head>
            <div className="fd-speaker-list">
              {saved.map((item, i) => <SongRow key={item.player} track={item.track} title={disp(state, item.player)}
                face={<Avatar state={state} p={item.player} size={36} />} busy={busy === `play:${item.track.trackId}`}
                onPlay={() => playTrack(item.track, item.player)} last={i === saved.length - 1} />)}
            </div>
          </section>
        )}

        <section className="fd-menu-section" aria-label="Search">
          <Head icon="search">Search</Head>
          <form className="fd-speaker-search" onSubmit={runSearch}>
            <input value={query} onChange={event => setQuery(event.target.value)} maxLength={80} enterKeyHint="search"
              placeholder="Song or artist" aria-label="Search Spotify" />
            <ActionButton type="submit" variant="secondary" disabled={query.trim().length < 2} pending={busy === "search"}>
              Search</ActionButton>
          </form>
          {results.length > 0 && <div className="fd-speaker-list fd-speaker-results">
            {results.map((track, i) => <SongRow key={track.trackId} track={track} face={<Cover track={track} />}
              busy={busy === `play:${track.trackId}`} onPlay={() => playTrack(track)} last={i === results.length - 1} />)}
          </div>}
          <p className="fd-speaker-credit">Results and artwork from Spotify</p>
        </section>
      </>}

      {error && <div role="alert" className="fd-speaker-error">{error}</div>}
    </Sheet>
  );
}
