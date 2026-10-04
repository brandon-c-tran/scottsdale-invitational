/* Riso tilt: pure math for the player card lean. tx and ty are unit values
   in [-1, 1]; the card rotates rotateX(-ty * 7deg) rotateY(tx * 9deg) and
   each printed layer slides by its depth in px. Presentation only. */

export const TILT = Object.freeze({
  dragThreshold:8,     // px before a press becomes a tilt instead of a flip
  dragReach:.35,       // fraction of the card that reaches full tilt
  follow:.18,          // per-frame lerp while a pointer leads
  orientationFollow:.12,
  orientationRange:20, // degrees of phone tilt for full card tilt
  recenter:.01,        // the orientation baseline drifts toward how the phone is held
  releaseMs:520,
  openMs:700,
  flipHoldMs:650,
  open:Object.freeze({ x:.35, y:-.2 }),
  rotateX:7,
  rotateY:9,
});

export const clampUnit = value => Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;

/* A press that travels less than the threshold stays a tap (flip). */
export function dragTilt(dx, dy, width, height) {
  const dragging = Math.hypot(dx, dy) >= TILT.dragThreshold;
  if (!dragging) return { x:0, y:0, dragging:false };
  return {
    x:clampUnit(dx / Math.max(1, width * TILT.dragReach)),
    y:clampUnit(dy / Math.max(1, height * TILT.dragReach)),
    dragging:true,
  };
}

/* Desktop hover: the cursor's offset from the card's center. */
export function hoverTilt(clientX, clientY, rect) {
  if (!rect?.width || !rect?.height) return { x:0, y:0 };
  return {
    x:clampUnit((clientX - rect.left - rect.width / 2) / (rect.width / 2)),
    y:clampUnit((clientY - rect.top - rect.height / 2) / (rect.height / 2)),
  };
}

/* The first reading is the baseline, so the card starts level however the
   phone is held. */
export function orientationTilt({ gamma, beta }, base) {
  if (!Number.isFinite(gamma) || !Number.isFinite(beta) || !base) return { x:0, y:0 };
  return {
    x:clampUnit((gamma - base.gamma) / TILT.orientationRange),
    y:clampUnit((beta - base.beta) / TILT.orientationRange),
  };
}
export const recenter = (base, reading, rate = TILT.recenter) => ({
  gamma:base.gamma + (reading.gamma - base.gamma) * rate,
  beta:base.beta + (reading.beta - base.beta) * rate,
});

export function stepToward(current, target, rate) {
  const x = current.x + (target.x - current.x) * rate;
  const y = current.y + (target.y - current.y) * rate;
  const settled = Math.abs(target.x - x) < .002 && Math.abs(target.y - y) < .002;
  return settled ? { x:target.x, y:target.y, settled } : { x, y, settled };
}

/* The misregistered plate shows only while the card is off level. */
export const plateStrength = (x, y) => Math.min(1, Math.hypot(x, y) * 2.5);

export const tiltTransform = (x, y) =>
  `rotateX(${(-clampUnit(y) * TILT.rotateX).toFixed(3)}deg) rotateY(${(clampUnit(x) * TILT.rotateY).toFixed(3)}deg)`;

/* Android only, and only where no permission prompt exists. iOS 13+ gates
   DeviceOrientationEvent behind requestPermission: never ask. */
export function canFollowOrientation({ userAgent = "", platform = "", OrientationEvent } = {}) {
  if (typeof OrientationEvent !== "function") return false;
  if (typeof OrientationEvent.requestPermission === "function") return false;
  if (/iPhone|iPad|iPod/i.test(userAgent)) return false;
  return /Android/i.test(platform) || /Android/i.test(userAgent);
}
