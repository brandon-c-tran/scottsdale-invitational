/* Scan the TV (Oct 4): the in-app scanner that checks a guest in. iPhone's
   Camera app opens a QR link in Safari, not the installed app (separate
   storage, so Safari does not know who you are); this scanner runs inside
   the app, so the claim is already there.

   Full screen: the rear camera behind the glass, a viewfinder cut in the
   middle with its corners lit cyan and a line sweeping it while it looks,
   your chip hovering over an empty seat at the foot. The decoder (jsQR) is
   loaded only when the scanner opens. The TV's code found, the seat flashes
   while the write is in flight; on the server's ack your chip drops into
   the seat, "Here" stamps, and the scanner closes itself. A refused code
   says why over the viewfinder and scanning goes on. A camera that is
   blocked or missing is said in two lines with Try again; the commissioner
   can always mark you here. Reduced motion holds the line still and shows
   the chip seated. */
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChipCoin } from "../identity/ChipCoin.jsx";
import { Icon } from "../../ui/Icon.jsx";
import { ActionButton } from "../../ui/controls.jsx";
import { tapTick } from "../../lib/haptics.js";
import { useReducedMotion } from "../../lib/motion.js";
import { writeError } from "../../lib/writeErrors.js";
import { ARRIVAL_LANDED_MS } from "./arrivalsModel.js";
import { createScanSession } from "./scanSession.js";
import "./arrivals.css";

/* a frame every 140 ms, cropped to the viewfinder's square, at most 640px:
   quick on a phone and plenty for a code across a room */
export const SCAN_EVERY_MS = 140;
const SCAN_PX = 640;

/* jsQR, loaded on first open (tests and the fit audit pass their own) */
const loadDecoder = () => import("jsqr").then(module => module.default || module);

/* why the camera did not open, as the scanner's state */
export function cameraFailure(error) {
  const name = String(error?.name || "");
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") return "denied";
  return "nocamera";
}

/* the rear camera; resolves the stream or rejects with the browser's error */
function openCamera() {
  const media = typeof navigator !== "undefined" ? navigator.mediaDevices : null;
  if (!media?.getUserMedia) return Promise.reject(Object.assign(new Error("No camera"), { name:"NotFoundError" }));
  return media.getUserMedia({ audio:false,
    video:{ facingMode:{ ideal:"environment" }, width:{ ideal:1280 }, height:{ ideal:720 } } });
}

/* the middle square of the video, as pixels */
function grabFrame(video, canvas) {
  const w = video.videoWidth, h = video.videoHeight;
  if (!w || !h) return null;
  const side = Math.min(w, h), size = Math.min(SCAN_PX, side);
  if (canvas.width !== size) { canvas.width = size; canvas.height = size; }
  const ctx = canvas.getContext("2d", { willReadFrequently:true });
  if (!ctx) return null;
  ctx.drawImage(video, (w - side) / 2, (h - side) / 2, side, side, 0, 0, size, size);
  return ctx.getImageData(0, 0, size, size);
}

export function ArriveScanner({ me, onArrive, onClose, decoder = null, camera = openCamera }) {
  const reduced = useReducedMotion();
  const videoRef = useRef(null);
  const [status, setStatus] = useState("starting");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const arriveRef = useRef(onArrive);
  arriveRef.current = onArrive;

  useEffect(() => {
    let live = true, stream = null, timer = null, session = null;
    const canvas = document.createElement("canvas");
    setStatus("starting"); setError("");
    const onChange = ({ phase, error:message }) => {
      if (!live) return;
      if (phase === "sending") setStatus("sending");
      else if (phase === "done") {
        setStatus("done");
        timer = setTimeout(() => closeRef.current?.(), ARRIVAL_LANDED_MS);
      } else if (phase === "scanning") { setStatus("scanning"); setError(message ? writeError({ error:message }) : ""); }
    };
    const loop = async () => {
      if (!live || !session || session.phase === "done" || session.phase === "stopped") return;
      const video = videoRef.current;
      if (session.phase === "scanning" && video && video.readyState >= 2) {
        const image = grabFrame(video, canvas);
        if (image) await session.frame(image);
      }
      if (live && session.phase !== "done") timer = setTimeout(loop, SCAN_EVERY_MS);
    };
    (async () => {
      try {
        const [media, decode] = await Promise.all([camera(), decoder ? Promise.resolve(decoder) : loadDecoder()]);
        if (!live) { media?.getTracks?.().forEach(track => track.stop()); return; }
        stream = media;
        const video = videoRef.current;
        if (video) {
          video.srcObject = media;
          await video.play().catch(() => {});
        }
        session = createScanSession({ decode, submit:code => arriveRef.current(code), onChange });
        setStatus("scanning");
        loop();
      } catch (failure) {
        if (live) setStatus(cameraFailure(failure));
      }
    })();
    return () => {
      live = false;
      clearTimeout(timer);
      session?.stop();
      stream?.getTracks?.().forEach(track => track.stop());
    };
  }, [attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  const blocked = status === "denied" || status === "nocamera";
  const landed = status === "done";
  const close = () => { tapTick(); onClose?.(); };
  return createPortal(<div className={`fd-scan is-${status}${reduced ? " is-still" : ""}`} role="dialog" aria-modal="true"
    aria-label="Scan the TV">
    {!blocked && <video ref={videoRef} className="fd-scan-video" muted playsInline autoPlay aria-hidden="true" />}
    <header className="fd-scan-head">
      <button type="button" className="fd-scan-close" onClick={close} aria-label="Close"><Icon name="close" size={22} /></button>
      <h2 className="fd-show">Scan the TV</h2>
    </header>
    {blocked ? <div className="fd-scan-blocked" role="alert">
      <span className="fd-scan-blocked-mark" aria-hidden="true"><Icon name="camera" size={44} /></span>
      <h3 className="fd-show">{status === "denied" ? "Camera blocked" : "No camera"}</h3>
      <p>The commissioner can mark you here.</p>
      <ActionButton variant="secondary" onClick={() => { tapTick(); setAttempt(n => n + 1); }}>Try again</ActionButton>
    </div> : <div className="fd-scan-finder" aria-hidden="true">
      <i className="fd-scan-corner is-tl" /><i className="fd-scan-corner is-tr" /><i className="fd-scan-corner is-bl" /><i className="fd-scan-corner is-br" />
      {status === "scanning" && <i className="fd-scan-line" />}
    </div>}
    {error && !blocked && <p className="fd-scan-error" role="alert">{error}</p>}
    {!blocked && <footer className="fd-scan-foot" aria-live="polite">
      <span className={`fd-scan-seat${status === "sending" ? " is-sending" : ""}${landed ? " is-landed" : ""}`} aria-hidden="true">
        <i className="fd-arrive-shadow" />
        <span className="fd-arrive-chip"><ChipCoin p={me} size={64} /></span>
      </span>
      {landed && <strong className="fd-show fd-scan-here is-stamping">Here</strong>}
      {landed && <span className="fd-sr">Checked in</span>}
    </footer>}
  </div>, document.body);
}
