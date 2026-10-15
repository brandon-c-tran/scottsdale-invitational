import React from "react";
import "./lyrics.css";

/* How a song will play, said once beside it (docs/KARAOKE.md "Lyrics"):
   "Lyrics" (an instrumental with our own words on the TV and the singer's
   phone; the info lamp lit) or "Video lyrics" (an upload with its words on
   it; the lamp unlit). Nothing for a song without a video. */
export const KARAOKE_WAY_WORDS = Object.freeze({ lyrics:"Lyrics", video:"Video lyrics" });
export function KaraokeWay({ way, className = "" }) {
  if (!KARAOKE_WAY_WORDS[way]) return null;
  return <span className={`fd-kway is-${way}${className ? ` ${className}` : ""}`}>
    <i className={`fd-insert${way === "video" ? " is-done" : ""}`} aria-hidden="true" />{KARAOKE_WAY_WORDS[way]}</span>;
}
