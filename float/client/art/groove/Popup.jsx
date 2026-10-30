/* The judgement over a critter (float/GROOVE.md "The popup"): the signed
   offset in seconds above the word, in chunky pixel lettering with a dark
   outline. The number is salmon; the word takes its tone (Perfect white on
   a gold plate, Nice! yellow, OK white, Early and Late salmon, Miss grey; a
   miss has no number). It pops in when it mounts: give each judgement its
   own key so a new one replaces the old. `life` also fades it out at the
   end of POPUP_MS (700 ms). `size` is the number's height in px.

   <Popup q="late" d={30} size={48} />   ->  +0.03 / Late */
import React from "react";
import { popupOf, POPUP_MS } from "../../../shared/chart.js";
import { popupStyle } from "./index.js";
import "./groove.css";

export default function Popup({ q, d, size = 48, life = false, className = "", style, ...rest }) {
  const { num, word, tone } = popupOf(q, d);
  const { plate } = popupStyle(tone);
  const cls = ["fg-popup", `fg-tone-${tone}`, `fg-q-${q || "none"}`, plate ? "fg-popup--plate" : "", life ? "fg-popup--life" : "", num ? "" : "fg-popup--word", className]
    .filter(Boolean).join(" ");
  return (
    <span className={cls} style={{ "--fg-size":`${size}px`, "--fg-life":`${POPUP_MS}ms`, ...style }} aria-label={num ? `${num} ${word}` : word} {...rest}>
      {num ? <span className="fg-popup-num">{num}</span> : null}
      <span className="fg-popup-word">{word}</span>
    </span>
  );
}
