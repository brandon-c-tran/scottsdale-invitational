import React from "react";
import "../music/winSong.css";

/* PLACEHOLDER (the songs branch replaces this file): the karaoke song
   picker, as the phone's pick window embeds it. Props, as the contract
   names them: `value` the saved song, `enabled` the karaoke capability,
   `muted` previews play without sound (the pick window, so the room never
   hears your song), `compact` the sheet's tighter layout, `onChoose(track)`
   hands the chosen song back (the caller writes it, karaokeSong). */
export function KaraokeSongPicker({ value = null, enabled = true, muted = false, compact = false, onChoose }) {
  void value; void enabled; void muted; void onChoose;
  return <div className={`fd-song-search${compact ? " is-compact" : ""}`} data-placeholder="karaoke-song-picker">
    <div className="fd-song-field">
      <input type="search" placeholder="Song or artist" aria-label="Search Spotify" autoComplete="off" autoCorrect="off"
        spellCheck={false} disabled={!enabled} />
    </div>
  </div>;
}
