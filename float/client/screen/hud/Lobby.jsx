/* The lobby over the put-in: the room's code and its QR, everyone who has
   joined (ready lit), and, when this screen hosts, Start, the bots that
   fill the field, and the drinking switch. Mouse and keyboard both work:
   every control is a real button in the tab order. */
import React, { useEffect, useMemo, useState } from "react";
import qrcode from "qrcode-generator";
import { Chip, Num } from "./bits.jsx";

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
  const text = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  return <div className="fs-lobby-starts fs-glass">
    <span className="fs-label">Starts in</span>
    <span className="fs-lobby-clock fs-show"><Num n={text} /></span>
  </div>;
}

export default function Lobby({ room, entrants, hosting, joinUrl, send, serverNow }) {
  const qr = useMemo(() => (joinUrl ? qrPath(joinUrl) : null), [joinUrl]);
  const humans = entrants.filter(e => e && !e.bot).length;
  const already = entrants.filter(e => e && e.bot).length;
  /* how many computer riders the room ADDS on Start (float/PROTOCOL.md "As built") */
  const [extra, setExtra] = useState(null);
  const spare = Math.max(0, MAX_RIDERS - entrants.length);
  const bots = Math.min(spare, extra ?? Math.max(0, 6 - humans - already));
  const [drinking, setDrinking] = useState(room?.drinking !== false);
  const code = String(room?.code || "").toUpperCase();
  const shownUrl = joinUrl ? joinUrl.replace(/^https?:\/\//, "").replace(/\?room=.*$/, "") : "";
  const roomFull = bots >= spare;
  const canStart = entrants.length + bots >= 1;
  const start = () => send?.({ t:"host", cmd:"start", bots, drinking });
  return <div className="fs-lobby">
    <div className="fs-lobby-brand fs-show">Float</div>
    {Number.isFinite(room?.startPlanned) && <StartsIn at={room.startPlanned} serverNow={serverNow} />}
    {code && room?.mode !== "fieldday" && <div className="fs-lobby-join fs-glass">
      <span className="fs-label">Room</span>
      <span className="fs-lobby-code fs-show">{code}</span>
      {qr && <svg className="fs-lobby-qr" viewBox={`-2 -2 ${qr.size + 4} ${qr.size + 4}`} role="img" aria-label={`Join ${code}`}>
        <rect x="-2" y="-2" width={qr.size + 4} height={qr.size + 4} rx="2" fill="#f4ecd8" />
        <path d={qr.d} fill="#0a0910" />
      </svg>}
      {shownUrl && <span className="fs-lobby-url">{shownUrl}</span>}
    </div>}
    <div className="fs-lobby-riders">
      <div className="fs-lobby-head">
        <span className="fs-label">Riders</span>
        <span className="fs-num">{humans}</span>
      </div>
      <div className="fs-lobby-grid">
        {/* a reserved rider whose phone is not here yet stays unlit */}
        {entrants.map((e, i) => e && <div key={e.device || e.pid || i}
          className={`fs-lobby-card fs-glass${e.ready ? " is-ready" : ""}${!e.bot && e.connected === false ? " is-away" : ""}`}>
          <Chip entrant={e} size={84} />
          <span className="fs-name">{e.name}</span>
          <span className={`fs-lamp ${e.ready ? "is-cyan" : "is-unlit"}`}>{e.ready ? "Ready" : e.bot ? "Bot" : "Joined"}</span>
        </div>)}
      </div>
    </div>
    {hosting && <div className="fs-host fs-glass" data-interactive>
      <div className="fs-host-group">
        <span className="fs-label">Bots</span>
        <button type="button" className="fs-step" aria-label="Fewer bots" disabled={bots <= 0} onClick={() => setExtra(Math.max(0, bots - 1))}>-</button>
        <span className="fs-num fs-host-value">{bots}</span>
        <button type="button" className="fs-step" aria-label="More bots" disabled={roomFull} onClick={() => setExtra(Math.min(spare, bots + 1))}>+</button>
      </div>
      <div className="fs-host-group" role="group" aria-label="Drinking">
        <span className="fs-label">Drinking</span>
        <button type="button" className={`fs-seg${drinking ? " is-on" : ""}`} aria-pressed={drinking} onClick={() => setDrinking(true)}>On</button>
        <button type="button" className={`fs-seg${!drinking ? " is-on" : ""}`} aria-pressed={!drinking} onClick={() => setDrinking(false)}>Off</button>
      </div>
      <button type="button" className="fs-start" disabled={!canStart} onClick={start}>Start</button>
    </div>}
  </div>;
}
