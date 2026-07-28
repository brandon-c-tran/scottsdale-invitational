import React, { useCallback, useEffect, useRef, useState } from "react";

const MAX_ZOOM = 4;
const MIN_ZOOM = 1;
const ZOOM_STEP = 0.1;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function fit(view, image, diameter) {
  if (!image || !diameter) return view;
  const coverScale = Math.max(diameter / image.width, diameter / image.height);
  const scale = coverScale * view.zoom;
  const maxX = Math.max(0, (image.width * scale - diameter) / 2);
  const maxY = Math.max(0, (image.height * scale - diameter) / 2);
  return {
    zoom: clamp(view.zoom, MIN_ZOOM, MAX_ZOOM),
    x: clamp(view.x, -maxX, maxX),
    y: clamp(view.y, -maxY, maxY),
  };
}

/**
 * Interactive circular avatar crop.
 *
 * src: image data URL selected by the user
 * onConfirm(dataUrl): receives a square JPEG data URL (384px by default)
 * onCancel(): closes the editor without changing the photo
 */
export default function PhotoCropper({
  src,
  onConfirm,
  onCancel,
  outputSize = 384,
  quality = 0.84,
}) {
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);
  const stageRef = useRef(null);
  const imageRef = useRef(null);
  const dragRef = useRef(null);
  const [image, setImage] = useState(null);
  const [stageSize, setStageSize] = useState(0);
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  const diameter = Math.max(0, stageSize - 32);

  useEffect(() => {
    const node = stageRef.current;
    if (!node) return undefined;
    const measure = () => setStageSize(node.getBoundingClientRect().width);
    measure();
    const observer = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(measure)
      : null;
    observer?.observe(node);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    setStatus("loading");
    setError("");
    setImage(null);
    setView({ zoom: 1, x: 0, y: 0 });

    if (!src) {
      setStatus("error");
      setError("That photo could not be opened. Choose another image.");
      return undefined;
    }

    // Browsers decode JPEG EXIF orientation before exposing natural dimensions
    // and before drawImage(), so portrait phone photos stay upright in both the
    // preview and exported canvas.
    const nextImage = new Image();
    nextImage.decoding = "async";
    nextImage.onload = () => {
      if (disposed) return;
      if (!nextImage.naturalWidth || !nextImage.naturalHeight) {
        setStatus("error");
        setError("That photo could not be opened. Choose another image.");
        return;
      }
      imageRef.current = nextImage;
      setImage({ width: nextImage.naturalWidth, height: nextImage.naturalHeight });
      setStatus("ready");
    };
    nextImage.onerror = () => {
      if (disposed) return;
      setStatus("error");
      setError("That photo could not be opened. Choose another image.");
    };
    nextImage.src = src;

    return () => {
      disposed = true;
      nextImage.onload = null;
      nextImage.onerror = null;
    };
  }, [src]);

  useEffect(() => {
    setView(current => fit(current, image, diameter));
  }, [image, diameter]);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cancelRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, []);

  const updateZoom = useCallback((nextZoom) => {
    setView(current => {
      const zoom = clamp(Number(nextZoom), MIN_ZOOM, MAX_ZOOM);
      const ratio = zoom / current.zoom;
      return fit(
        { zoom, x: current.x * ratio, y: current.y * ratio },
        image,
        diameter,
      );
    });
  }, [image, diameter]);

  const moveBy = useCallback((dx, dy) => {
    setView(current => fit(
      { ...current, x: current.x + dx, y: current.y + dy },
      image,
      diameter,
    ));
  }, [image, diameter]);

  const onPointerDown = (event) => {
    if (status !== "ready" || dragRef.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
  };

  const onPointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    moveBy(event.clientX - drag.x, event.clientY - drag.y);
    drag.x = event.clientX;
    drag.y = event.clientY;
  };

  const endPointer = (event) => {
    if (dragRef.current?.id !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const onCropKeyDown = (event) => {
    const amount = event.shiftKey ? 20 : 7;
    const direction = {
      ArrowLeft: [amount, 0],
      ArrowRight: [-amount, 0],
      ArrowUp: [0, amount],
      ArrowDown: [0, -amount],
    }[event.key];
    if (!direction) return;
    event.preventDefault();
    moveBy(...direction);
  };

  const onDialogKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel?.();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...dialogRef.current.querySelectorAll(
      'button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])',
    )];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const confirm = () => {
    const source = imageRef.current;
    if (!source || !image || !diameter || status !== "ready") return;
    try {
      const canvas = document.createElement("canvas");
      const size = clamp(Math.round(outputSize) || 384, 128, 1024);
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d");
      const coverScale = Math.max(diameter / image.width, diameter / image.height);
      const scale = coverScale * view.zoom;
      const sourceSize = diameter / scale;
      const sourceX = image.width / 2 - view.x / scale - sourceSize / 2;
      const sourceY = image.height / 2 - view.y / scale - sourceSize / 2;

      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.fillStyle = "#241B12";
      context.fillRect(0, 0, size, size);
      context.drawImage(
        source,
        sourceX,
        sourceY,
        sourceSize,
        sourceSize,
        0,
        0,
        size,
        size,
      );
      onConfirm?.(canvas.toDataURL("image/jpeg", clamp(quality, 0.5, 0.95)));
    } catch {
      setError("We couldn't crop that photo. Please try a different image.");
    }
  };

  const coverScale = image && diameter
    ? Math.max(diameter / image.width, diameter / image.height)
    : 0;
  const renderedWidth = image ? image.width * coverScale * view.zoom : 0;
  const renderedHeight = image ? image.height * coverScale * view.zoom : 0;

  return (
    <div className="fd-crop-overlay" role="presentation">
      <style>{`
        .fd-crop-overlay {
          position: fixed;
          inset: 0;
          z-index: 10000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          background: rgba(10, 6, 3, 0.78);
          backdrop-filter: blur(7px);
          -webkit-backdrop-filter: blur(7px);
          animation: fd-crop-fade 160ms ease-out both;
        }
        .fd-crop-dialog {
          width: min(430px, 100%);
          max-height: min(720px, calc(100dvh - 24px));
          overflow-y: auto;
          overscroll-behavior: contain;
          border: 1px solid var(--line, rgba(251,243,228,0.13));
          border-radius: 18px;
          background: var(--paper, #241b12);
          color: var(--ink, #f4ead9);
          box-shadow: var(--shadow-3, 0 14px 40px rgba(10,6,3,0.7));
          font-family: 'Inter', system-ui, sans-serif;
          animation: fd-crop-rise 180ms ease-out both;
        }
        .fd-crop-header {
          display: flex;
          align-items: flex-start;
          gap: 16px;
          padding: 18px 18px 12px;
        }
        .fd-crop-title {
          margin: 0;
          font-family: 'Barlow Condensed', 'Arial Narrow', sans-serif;
          font-size: 27px;
          font-weight: 800;
          line-height: 1;
          letter-spacing: .025em;
          text-transform: uppercase;
        }
        .fd-crop-close,
        .fd-crop-zoom-button {
          display: inline-grid;
          flex: 0 0 auto;
          place-items: center;
          padding: 0;
          color: var(--ink, #f4ead9);
          border: 1px solid var(--line, rgba(251,243,228,0.13));
          background: var(--paper2, #332619);
          cursor: pointer;
        }
        .fd-crop-close {
          width: 36px;
          height: 36px;
          margin-left: auto;
          border-radius: 50%;
          font-size: 23px;
          line-height: 1;
        }
        .fd-crop-stage {
          position: relative;
          width: min(360px, calc(100% - 36px));
          aspect-ratio: 1;
          margin: 0 auto;
          overflow: hidden;
          border: 1px solid var(--line, rgba(251,243,228,0.13));
          border-radius: 14px;
          background:
            radial-gradient(circle at 50% 50%, #2d2115 0 45%, #171009 78%);
          touch-action: none;
          cursor: grab;
          user-select: none;
        }
        .fd-crop-stage:active { cursor: grabbing; }
        .fd-crop-stage:focus-visible,
        .fd-crop-dialog button:focus-visible,
        .fd-crop-dialog input:focus-visible {
          outline: 3px solid var(--sun, #f0b02f);
          outline-offset: 3px;
        }
        .fd-crop-window {
          position: absolute;
          left: 16px;
          top: 16px;
          width: calc(100% - 32px);
          height: calc(100% - 32px);
          overflow: hidden;
          border-radius: 50%;
          background: var(--paper2, #332619);
          box-shadow:
            0 0 0 2px var(--sun, #f0b02f),
            0 0 0 999px rgba(10, 6, 3, 0.58);
        }
        .fd-crop-image {
          position: absolute;
          max-width: none;
          pointer-events: none;
          -webkit-user-drag: none;
          image-orientation: from-image;
          will-change: width, height, transform;
        }
        .fd-crop-loading {
          position: absolute;
          inset: 16px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          color: var(--muted2, #c9b896);
          font-size: 13px;
          text-align: center;
        }
        .fd-crop-controls { padding: 18px; }
        .fd-crop-zoom-row {
          display: grid;
          grid-template-columns: 38px minmax(0, 1fr) 38px;
          align-items: center;
          gap: 10px;
        }
        .fd-crop-zoom-button {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          font-size: 22px;
          font-weight: 700;
        }
        .fd-crop-zoom-button:disabled { cursor: default; opacity: .4; }
        .fd-crop-range {
          width: 100%;
          height: 32px;
          margin: 0;
          accent-color: var(--sun, #f0b02f);
          cursor: pointer;
        }
        .fd-crop-error {
          margin: 10px 0 0;
          color: var(--accent2, #d97a50);
          font-size: 12px;
          line-height: 1.4;
          text-align: center;
        }
        .fd-crop-actions {
          display: grid;
          grid-template-columns: 1fr 1.35fr;
          gap: 10px;
          margin-top: 15px;
        }
        .fd-crop-action {
          min-height: 48px;
          padding: 11px 16px;
          border-radius: 11px;
          font: 700 15px/1 'Inter', system-ui, sans-serif;
          cursor: pointer;
        }
        .fd-crop-cancel {
          border: 1px solid var(--line, rgba(251,243,228,0.13));
          color: var(--ink, #f4ead9);
          background: var(--paper2, #332619);
        }
        .fd-crop-use {
          border: 1.5px solid var(--ink0, #2a2119);
          color: var(--ink0, #2a2119);
          background: var(--sun, #f0b02f);
        }
        .fd-crop-action:disabled { cursor: default; opacity: .45; }
        @keyframes fd-crop-fade { from { opacity: 0; } }
        @keyframes fd-crop-rise {
          from { opacity: 0; transform: translateY(10px) scale(.985); }
        }
        @media (max-width: 540px) {
          .fd-crop-overlay { align-items: flex-end; padding: 0; }
          .fd-crop-dialog {
            width: 100%;
            max-height: calc(100dvh - 10px);
            border-width: 1px 0 0;
            border-radius: 20px 20px 0 0;
          }
          .fd-crop-header { padding-top: 16px; }
          .fd-crop-stage { width: min(350px, calc(100% - 28px)); }
          .fd-crop-controls { padding: 15px 18px max(18px, env(safe-area-inset-bottom)); }
        }
        @media (prefers-reduced-motion: reduce) {
          .fd-crop-overlay, .fd-crop-dialog { animation: none; }
        }
      `}</style>

      <section
        ref={dialogRef}
        className="fd-crop-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fd-crop-title"
        onKeyDown={onDialogKeyDown}
      >
        <header className="fd-crop-header">
          <div>
            <h2 id="fd-crop-title" className="fd-crop-title">Frame your photo</h2>
          </div>
          <button
            ref={cancelRef}
            type="button"
            className="fd-crop-close"
            aria-label="Cancel photo crop"
            onClick={onCancel}
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <div
          ref={stageRef}
          className="fd-crop-stage"
          role="group"
          tabIndex={status === "ready" ? 0 : -1}
          aria-label="Photo crop area. Drag the photo or use arrow keys to reposition it."
          onKeyDown={onCropKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
        >
          <div className="fd-crop-window">
            {status === "ready" && (
              <img
                className="fd-crop-image"
                src={src}
                alt=""
                draggable="false"
                style={{
                  width: renderedWidth,
                  height: renderedHeight,
                  left: "50%",
                  top: "50%",
                  transform: `translate(calc(-50% + ${view.x}px), calc(-50% + ${view.y}px))`,
                }}
              />
            )}
          </div>
          {status !== "ready" && (
            <div className="fd-crop-loading" role="status">
              {status === "loading" ? "Opening photo…" : "Photo unavailable"}
            </div>
          )}
        </div>

        <div className="fd-crop-controls">
          <div className="fd-crop-zoom-row">
            <button
              type="button"
              className="fd-crop-zoom-button"
              aria-label="Zoom out"
              disabled={status !== "ready" || view.zoom <= MIN_ZOOM}
              onClick={() => updateZoom(view.zoom - ZOOM_STEP)}
            >
              <span aria-hidden="true">−</span>
            </button>
            <input
              className="fd-crop-range"
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step="0.01"
              value={view.zoom}
              disabled={status !== "ready"}
              aria-label={`Photo zoom, ${Math.round(view.zoom * 100)} percent`}
              onChange={event => updateZoom(event.target.value)}
            />
            <button
              type="button"
              className="fd-crop-zoom-button"
              aria-label="Zoom in"
              disabled={status !== "ready" || view.zoom >= MAX_ZOOM}
              onClick={() => updateZoom(view.zoom + ZOOM_STEP)}
            >
              <span aria-hidden="true">+</span>
            </button>
          </div>

          {error && <p className="fd-crop-error" role="alert">{error}</p>}

          <div className="fd-crop-actions">
            <button
              type="button"
              className="fd-crop-action fd-crop-cancel"
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              type="button"
              className="fd-crop-action fd-crop-use"
              disabled={status !== "ready"}
              onClick={confirm}
            >
              Use photo
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
