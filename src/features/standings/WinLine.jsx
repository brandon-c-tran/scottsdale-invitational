import React from "react";
import "./win-line.css";

/* X8: what this side's win means for the standings, as one line under the
   side ("Win: Sahil to 1st"). Renders nothing when the win changes nothing. */
export function WinLine({ line, className = "" }) {
  if (!line?.text) return null;
  return <small className={`fd-win-line${line.kind === "rank" ? " is-rank" : ""}${className ? ` ${className}` : ""}`}>
    {line.text}</small>;
}
