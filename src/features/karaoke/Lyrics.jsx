import React, { useEffect, useRef, useState } from "react";
import { lyricCue } from "../../../shared/karaokeLyrics.js";
import "./lyrics.css";

/* Our own lyrics over an instrumental (docs/KARAOKE.md "Lyrics"): the line
   being sung, lit word by word as the song reaches it, and the next one
   dim under it. One component for the TV's lyric stage, the singer's
   teleprompter and the voter's one line.

   `clock()` is the song's own time in ms (the video's position plus the
   song's nudge): the TV reads its player, a phone the server clock. The
   component re-renders only when the line changes; between, one frame
   loop writes how far through the line the singer is (--p) on the line,
   and each word lights itself from its own share of it (--a to --b,
   lyrics.css). `at` holds a still (the fit audit, a test): no loop.
   `variant`: "tv", "prompt" (the singer's phone), "line" (a voter's: the
   line alone, no next). `sizeOf(text)` sizes the line being sung (the
   TV's), else the stylesheet does. */
export function Lyrics({ lines, clock = null, at = null, variant = "tv", sizeOf = null, className = "" }) {
  const still = Number.isFinite(at);
  const read = () => (still ? at : clock?.()) ?? null;
  const [index, setIndex] = useState(() => lyricCue(lines, read()).index);
  const line = useRef(null);
  const shown = useRef(index);
  useEffect(() => {
    if (still || typeof clock !== "function") return undefined;
    let frame = 0;
    const step = () => {
      const ms = read();
      const cue = lyricCue(lines, ms);
      if (cue.index !== shown.current) { shown.current = cue.index; setIndex(cue.index); }
      line.current?.style.setProperty("--p", cue.progress.toFixed(4));
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [lines, clock, still]); // eslint-disable-line react-hooks/exhaustive-deps
  /* the cue drawn: the frame loop's line, at the time it is drawn */
  const cue = lyricCue(lines, read());
  if (!still && cue.index !== index) shown.current = cue.index;
  const now = cue.line;
  return <div className={`fd-lyrics is-${variant}${className ? ` ${className}` : ""}`} aria-live="off">
    {now
      ? <p key={cue.index} ref={line} className="fd-lyric-now" style={{ "--p":cue.progress.toFixed(4),
          ...(sizeOf ? { fontSize:sizeOf(now.text) } : {}) }}>
        {cue.words.map((word, k) => <React.Fragment key={k}>
          {k > 0 && " "}
          <span className="fd-lyric-word" style={{ "--a":word.a.toFixed(4), "--b":Math.max(word.b, word.a + 0.0001).toFixed(4) }}>
            {word.text}</span>
        </React.Fragment>)}
      </p>
      : <p className="fd-lyric-now is-waiting" aria-label="Instrumental"><span className="fd-lyric-wait" aria-hidden="true">
        <i /><i /><i /></span></p>}
    {variant !== "line" && <p className="fd-lyric-next">{cue.next?.text || " "}</p>}
  </div>;
}
