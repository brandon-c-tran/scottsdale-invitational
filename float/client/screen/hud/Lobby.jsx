/* The lobby over the put-in: the room's code and its QR, everyone who has
   joined (ready lit), and, when this screen hosts, Start, the bots that
   fill the field, and the drinking switch. Mouse and keyboard both work:
   every control is a real button in the tab order. */
import React, { useMemo, useState } from "react";
import qrcode from "qrcode-generator";
import { Chip } from "./bits.jsx";

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

export default function Lobby({ room, entrants, hosting, joinUrl, send }) {
  const qr = useMemo(() => (joinUrl ? qrPath(joinUrl) : null), [joinUrl]);
  const humans = entrants.filter(e => e && !e.bot).length;
  /* how many computer riders join: the room fills the field up to humans + this */
  const [extra, setExtra] = useState(null);
  const bots = extra ?? Math.max(0, 6 - humans);
  const [drinking, setDrinking] = useState(room?.drinking !== false);
  const code = String(room?.code || "").toUpperCase();
  const shownUrl = joinUrl ? joinUrl.replace(/^https?:\/\//, "").replace(/\?room=.*$/, "") : "";
  const roomFull = humans + bots >= MAX_RIDERS;
  const canStart = humans >= 1;
  const start = () => send?.({ t:"host", cmd:"start", bots:humans + bots, drinking });
  return <div className="fs-lobby">
    <div className="fs-lobby-brand fs-show">Float</div>
    {code && <div className="fs-lobby-join fs-glass">
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
        {entrants.map((e, i) => e && <div key={e.device || i} className={`fs-lobby-card fs-glass${e.ready ? " is-ready" : ""}`}>
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
        <button type="button" className="fs-step" aria-label="More bots" disabled={roomFull} onClick={() => setExtra(Math.min(MAX_RIDERS - humans, bots + 1))}>+</button>
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
