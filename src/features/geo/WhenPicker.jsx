import React, { useEffect, useMemo } from "react";
import { Wheel } from "./Wheel.jsx";
import { hourLabel } from "./geoModel.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_ITEMS = MONTHS.map((label, i) => ({ value:i + 1, label }));
const YEAR_ITEMS = Array.from({ length:2026 - 1980 + 1 }, (_, i) => ({ value:1980 + i, label:String(1980 + i) }));
const HOUR_ITEMS = Array.from({ length:24 }, (_, h) => ({ value:h, label:hourLabel(h) }));
export const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const pad = n => String(n).padStart(2, "0");

/* "YYYY-MM-DDTHH" <-> { y, m, d, h } */
export function parseWhen(when, fallback = { y:2020, m:6, d:15, h:19 }) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})$/.exec(when || "");
  return match ? { y:+match[1], m:+match[2], d:+match[3], h:+match[4] } : { ...fallback };
}
export const formatWhen = ({ y, m, d, h }) => `${y}-${pad(m)}-${pad(Math.min(d, daysIn(y, m)))}T${pad(h)}`;

/* Month, day, year and hour as four wheels under a live readout. `set`
   marks the readout as chosen (bone, the hour in sun) once someone turns
   a wheel. */
export function WhenPicker({ value, onChange, set = true }) {
  const { y, m, d, h } = value;
  const maxDay = daysIn(y, m);
  useEffect(() => { if (d > maxDay) onChange({ ...value, d:maxDay }, false); }, [maxDay]); // eslint-disable-line react-hooks/exhaustive-deps
  const dayItems = useMemo(() => Array.from({ length:maxDay }, (_, i) => ({ value:i + 1, label:String(i + 1) })), [maxDay]);
  const turn = key => next => onChange({ ...value, [key]:next }, true);
  return <div className="fd-geo-when-picker">
    <div className={`fd-geo-readout${set ? " is-set" : ""}`} aria-live="polite">
      <span className="fd-display">{MONTHS[m - 1]} {Math.min(d, maxDay)}, {y}</span><span>{hourLabel(h)}</span></div>
    <div className="fd-geo-wheels">
      <Wheel items={MONTH_ITEMS} value={m} onChange={turn("m")} label="Month" />
      <Wheel items={dayItems} value={Math.min(d, maxDay)} onChange={turn("d")} label="Day" />
      <Wheel items={YEAR_ITEMS} value={y} onChange={turn("y")} label="Year" className="is-year" />
      <Wheel items={HOUR_ITEMS} value={h} onChange={turn("h")} label="Hour" className="is-hour" />
    </div>
  </div>;
}
