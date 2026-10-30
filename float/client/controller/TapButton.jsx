/* A button that answers its own touch. Inside the game a thumb can rest on a
   paddle while another finger taps, and iOS may skip the click that second
   tap would make, so this fires on the touchend of a touch that started on
   it, ended on it (12 px of slack) and did not travel (a swipe that began
   on it is a paddle stroke gone astray, not a press), and on click for a
   mouse or a keyboard. The press shows on touchstart. onPress runs inside
   the touch handler, so a tapTick or a sound unlock in it counts as the
   user's tap. data-ui keeps the paddles' input off it. */
import React, { forwardRef, useRef } from "react";

const SLACK = 12;
const TRAVEL = 24;
const find = (list, id) => { for (const t of list) if (t.identifier === id) return t; return null; };
const inside = (el, t) => {
  const r = el.getBoundingClientRect();
  return t.clientX >= r.left - SLACK && t.clientX <= r.right + SLACK && t.clientY >= r.top - SLACK && t.clientY <= r.bottom + SLACK;
};

const TapButton = forwardRef(function TapButton({ onPress, disabled = false, className = "", children, ...rest }, outer) {
  const own = useRef(null);
  const touch = useRef(null);
  const lastTouch = useRef(-Infinity);
  const setRef = el => {
    own.current = el;
    if (typeof outer === "function") outer(el); else if (outer) outer.current = el;
  };
  const pressed = on => { if (on) own.current?.setAttribute("data-pressed", ""); else own.current?.removeAttribute("data-pressed"); };
  const onTouchStart = event => {
    if (disabled || touch.current) return;
    const t = event.changedTouches[0];
    touch.current = { id:t.identifier, x:t.clientX, y:t.clientY, gone:false };
    pressed(true);
  };
  const onTouchMove = event => {
    const held = touch.current;
    const t = held && find(event.changedTouches, held.id);
    if (!t || !own.current) return;
    if (Math.hypot(t.clientX - held.x, t.clientY - held.y) > TRAVEL) held.gone = true;
    pressed(!held.gone && inside(own.current, t));
  };
  const onTouchEnd = event => {
    const held = touch.current;
    const t = held && find(event.changedTouches, held.id);
    if (!t) return;
    touch.current = null;
    pressed(false);
    lastTouch.current = Date.now();
    if (event.cancelable) event.preventDefault();
    const travelled = held.gone || Math.hypot(t.clientX - held.x, t.clientY - held.y) > TRAVEL;
    if (!disabled && !travelled && own.current && inside(own.current, t)) onPress?.(event);
  };
  const onTouchCancel = event => {
    if (!touch.current || !find(event.changedTouches, touch.current.id)) return;
    touch.current = null;
    pressed(false);
  };
  const onClick = event => {
    if (Date.now() - lastTouch.current < 800) return;
    if (!disabled) onPress?.(event);
  };
  return <button ref={setRef} type="button" data-ui="" className={className} disabled={disabled} aria-disabled={disabled || undefined}
    onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchCancel} onClick={onClick}
    {...rest}>{children}</button>;
});

export default TapButton;
