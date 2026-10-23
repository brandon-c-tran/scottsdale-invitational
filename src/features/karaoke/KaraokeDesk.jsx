/* The commissioner's Karaoke desk (Commissioner > Games > Karaoke, and the
   Ready check's Karaoke songs row): every roster player with a lamp, cyan
   when the last check found their song's video plays, amber when a song is
   picked but not checked since it was saved (or the check found it will not
   play, its reason under the name), unlit with no song. Titles stay hidden
   until Show songs: Brandon sings too. Check videos reads every saved video
   in one call (GET /api/admin/karaoke/check); it writes nothing, so its
   answer lives here until the sheet closes. Each song says how it will
   play (KaraokeWay). The singer on now is marked, and when their song is
   sung with our lyrics it has its nudge, Earlier and Later a quarter
   second a tap (karaokeNudge), so words that run off are put right while
   the room hears them; a song nudged before says by how much.
   Loaded on first use (lazyPart). */
import React, { useRef, useState } from "react";
import { disp } from "../../../shared/core.js";
import { ActionButton } from "../../ui/controls.jsx";
import { Avatar } from "../identity/PlayerIdentity.jsx";
import { dispatch, karaokeCheck } from "../../lib/client.js";
import { tapTick } from "../../lib/haptics.js";
import { writeError } from "../../lib/writeErrors.js";
import { karaokeChecked, karaokeDeskRows, nudgeText, nudged } from "./deskModel.js";
import { KaraokeWay } from "./KaraokeWay.jsx";
import "./karaokeDesk.css";

const sendNudge = (type, payload) => dispatch(type, payload, { retry:true });

/* a song's nudge: Earlier and Later, its offset between; one write at a time */
function Nudge({ row, name, onAct }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const tap = async earlier => {
    if (busy.current || !row.trackId) return;
    tapTick();
    busy.current = true; setPending(true); setError("");
    try {
      const result = await onAct("karaokeNudge", { player:row.player, trackId:row.trackId, offsetMs:nudged(row.offset, earlier) });
      if (result?.ok !== true && !result?.uncertain) setError(writeError(result));
    } finally { busy.current = false; setPending(false); }
  };
  return <span className="fd-karaoke-nudge" role="group" aria-label={`${name}'s lyrics`}>
    <button type="button" disabled={pending} onClick={() => tap(true)}>Earlier</button>
    <output aria-live="polite">{nudgeText(row.offset)}</output>
    <button type="button" disabled={pending} onClick={() => tap(false)}>Later</button>
    {error && <span className="fd-karaoke-desk-problem" role="alert">{error}</span>}
  </span>;
}

/* the lamp's state, for a screen reader (a failed check says it in words) */
const SPOKEN = { ready:"plays", partial:"not checked", missing:"no song" };

export function KaraokeDesk({ state, check = karaokeCheck, onAct = sendNudge, initialChecks = null, initiallyShown = false }) {
  const [shown, setShown] = useState(initiallyShown);
  const [checks, setChecks] = useState(initialChecks || {});
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const rows = karaokeDeskRows(state, checks);
  const songs = rows.filter(row => row.song).length;

  const runCheck = async () => {
    /* the answer is kept against the videos it was asked about */
    const asked = state;
    setChecking(true);
    setError("");
    try {
      const answer = await check();
      if (answer?.ok) setChecks(karaokeChecked(asked, answer.results));
      else setError(answer?.error || "Couldn't check the videos. Try again.");
    } catch {
      setError("Couldn't check the videos. Try again.");
    } finally {
      setChecking(false);
    }
  };

  return <div className="fd-karaoke-desk">
    <div className="fd-karaoke-desk-head">
      <div className="fd-karaoke-desk-count" aria-label={`${songs} of ${rows.length} songs picked`}>
        <strong>{songs}</strong><span>of {rows.length}</span>
      </div>
      <div className="fd-karaoke-desk-actions">
        <ActionButton variant="secondary" compact aria-pressed={shown} onClick={() => { tapTick(); setShown(on => !on); }}>
          {shown ? "Hide songs" : "Show songs"}</ActionButton>
        <ActionButton variant="secondary" compact pending={checking} disabled={!songs} onClick={runCheck}>
          Check videos</ActionButton>
      </div>
      {error && <p className="fd-karaoke-desk-error" role="alert">{error}</p>}
    </div>
    <ul className="fd-karaoke-desk-list" aria-label="Karaoke songs">
      {rows.map(row => <li key={row.player} className={`fd-karaoke-desk-row is-${row.lamp}${row.singing ? " is-singing" : ""}`}>
        <i className="fd-insert" aria-hidden="true" />
        <span className="fd-karaoke-desk-face"><Avatar state={state} p={row.player} size={36} /></span>
        <span className="fd-karaoke-desk-who">
          <span className="fd-karaoke-desk-name">{disp(state, row.player)}
            {!row.problem && <span className="fd-sr">, {SPOKEN[row.lamp]}</span>}</span>
          {shown && row.song && <>
            <span className="fd-karaoke-desk-song">{row.song.name}</span>
            {row.song.artists && <span className="fd-karaoke-desk-artist">{row.song.artists}</span>}
          </>}
          {row.problem && <span className="fd-karaoke-desk-problem">{row.problem}</span>}
          {(row.song || row.singing) && <span className="fd-karaoke-desk-way">
            {row.singing && <span className="fd-karaoke-desk-live">Singing</span>}
            <KaraokeWay way={row.way} />
            {row.way === "lyrics" && !row.singing && row.offset !== 0 && <span className="fd-karaoke-desk-offset">{nudgeText(row.offset)}</span>}
          </span>}
          {row.way === "lyrics" && row.singing && <Nudge row={row} name={disp(state, row.player)} onAct={onAct} />}
        </span>
      </li>)}
    </ul>
  </div>;
}
