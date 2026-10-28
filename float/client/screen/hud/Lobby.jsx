/* The lobby (float/GROOVE.md "The screen (TV)"): the room's code and its QR
   on a card at the left, the riders popping up in the water as they join
   (drawn by the cast), and, when this screen hosts, Start, the bots that
   fill the field, and the drinking switch. A Field Day Cup shows when it
   starts instead of a code. Mouse and keyboard both work: every control is
   a real button in the tab order. */
import React, { useEffect, useMemo, useState } from "react";
import qrcode from "qrcode-generator";

function qrPath(text) {
  try {
    const qr = qrcode(0, "M");
    qr.addData(String(text || ""));
    qr.make();
    const size = qr.getModuleCount();
    let d = "";
    for (let row = 0; row < size; row++) for (let col = 0; col < size; col++) if (qr.isDark(row, col)) d += `M${col} ${row}h1v1h-1z`;
    return { size, d };
  } catch { return null; }
}

const MAX_RIDERS = 16;

/* a Field Day Cup waiting in the lobby: when it goes (room.startPlanned, on the server clock) */
function StartsIn({ at, serverNow }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick(n => n + 1), 250);
    return () => clearInterval(timer);
  }, []);
  const left = Math.max(0, Math.ceil((at - (serverNow?.() ?? Date.now())) / 1000));
  return <div className="lb-starts">
    <span className="lb-label">Starts in</span>
    <span className="lb-clock">{`${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`}</span>
  </div>;
}

export default function Lobby({ room, entrants, hosting, joinUrl, send, serverNow }) {
  const qr = useMemo(() => (joinUrl ? qrPath(joinUrl) : null), [joinUrl]);
  const people = entrants.filter(e => e && !e.bot).length;
  const already = entrants.filter(e => e && e.bot).length;
  /* how many computer riders the room ADDS on Start (float/PROTOCOL.md "As built") */
  const [extra, setExtra] = useState(null);
  const spare = Math.max(0, MAX_RIDERS - entrants.length);
  const bots = Math.min(spare, extra ?? Math.max(0, 6 - people - already));
  const [drinking, setDrinking] = useState(room?.drinking !== false);
  const code = String(room?.code || "").toUpperCase();
  const shownUrl = joinUrl ? joinUrl.replace(/^https?:\/\//, "").replace(/\?room=.*$/, "") : "";
  const roomFull = bots >= spare;
  const canStart = entrants.length + bots >= 1;
  const start = () => send?.({ t:"host", cmd:"start", bots, drinking });
  const fieldday = room?.mode === "fieldday";
  return <div className="lb">
    <div className="lb-card">
      <span className="lb-brand">Float</span>
      {Number.isFinite(room?.startPlanned) && <StartsIn at={room.startPlanned} serverNow={serverNow} />}
      {code && !fieldday && <>
        {qr && <svg className="lb-qr" viewBox={`-2 -2 ${qr.size + 4} ${qr.size + 4}`} role="img" aria-label={`Join ${code}`}>
          <rect x="-2" y="-2" width={qr.size + 4} height={qr.size + 4} rx="2" fill="#fffdf8" />
          <path d={qr.d} fill="#1d1a24" />
        </svg>}
        <span className="lb-label">Room</span>
        <span className="lb-code">{code}</span>
        {shownUrl && <span className="lb-url">{shownUrl}</span>}
      </>}
    </div>
    <div className="lb-count"><span className="lb-count-n">{people}</span><span className="lb-label">{people === 1 ? "rider" : "riders"}</span></div>
    {hosting && <div className="lb-host" data-interactive>
      <div className="lb-group">
        <span className="lb-label">Bots</span>
        <button type="button" className="fs-step" aria-label="Fewer bots" disabled={bots <= 0} onClick={() => setExtra(Math.max(0, bots - 1))}>-</button>
        <span className="lb-value">{bots}</span>
        <button type="button" className="fs-step" aria-label="More bots" disabled={roomFull} onClick={() => setExtra(Math.min(spare, bots + 1))}>+</button>
      </div>
      <div className="lb-group" role="group" aria-label="Drinking">
        <span className="lb-label">Drinking</span>
        <button type="button" className={`fs-seg${drinking ? " is-on" : ""}`} aria-pressed={drinking} onClick={() => setDrinking(true)}>On</button>
        <button type="button" className={`fs-seg${!drinking ? " is-on" : ""}`} aria-pressed={!drinking} onClick={() => setDrinking(false)}>Off</button>
      </div>
      <button type="button" className="fs-start" disabled={!canStart} onClick={start}>Start</button>
    </div>}
  </div>;
}
