import React, { useEffect, useState } from "react";
import { Btn } from "../../ui/controls.jsx";
import { Icon } from "../../ui/Icon.jsx";
import { installEvt, onInstallReady, isIOS, isStandalone } from "./install.js";
import "./install.css";

/* Adding Field Day to the Home Screen, drawn rather than told: Safari's
   own Share key, then its own "Add to Home Screen" row, the two things a
   guest actually taps, with the sequence arrow between them. A browser
   that offers its own install prompt gets the one button instead. */

/* Safari's share glyph: a tray with an arrow leaving it */
const ShareGlyph = () => <svg className="fd-install-glyph" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"
  fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
  <path d="M8.5 9.5H7a1.5 1.5 0 0 0-1.5 1.5v8A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5v-8A1.5 1.5 0 0 0 17 9.5h-1.5" />
  <path d="M12 14V3.5M8.5 7 12 3.5 15.5 7" />
</svg>;
/* the menu row's own glyph: a plus in a rounded square */
const AddGlyph = () => <svg className="fd-install-glyph" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"
  fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
  <rect x="4" y="4" width="16" height="16" rx="4" /><path d="M12 8.5v7M8.5 12h7" />
</svg>;

export function InstallSteps() {
  return <ol className="fd-install-steps" aria-label="Add to Home Screen: tap Share, then Add to Home Screen">
    <li className="fd-install-key" aria-hidden="true"><ShareGlyph /><span>Share</span></li>
    <li className="fd-install-then" aria-hidden="true"><Icon name="then" size={18} /></li>
    <li className="fd-install-row" aria-hidden="true"><span>Add to Home Screen</span><AddGlyph /></li>
  </ol>;
}

export function InstallHint() {
  const [, bump] = useState(0);
  useEffect(() => onInstallReady(() => bump(x => x + 1)), []);
  if (installEvt) return <Btn onClick={() => installEvt.prompt()} style={{ alignSelf:"flex-start" }}>Add to Home Screen</Btn>;
  if (isIOS()) return <InstallSteps />;
  return <ol className="fd-install-steps" aria-label="In your browser menu, choose Add to Home Screen">
    <li className="fd-install-key" aria-hidden="true"><Icon name="more" size={22} /><span>Menu</span></li>
    <li className="fd-install-then" aria-hidden="true"><Icon name="then" size={18} /></li>
    <li className="fd-install-row" aria-hidden="true"><span>Add to Home Screen</span><AddGlyph /></li>
  </ol>;
}

/* One Home card for a guest on an iPhone still in Safari: the two drawn
   steps and a close. Gone for good once closed or
   once opened from the Home Screen; Weekend keeps the same steps. */
export const INSTALL_CARD_KEY = "si-install-card";
const readDismissed = () => { try { return localStorage.getItem(INSTALL_CARD_KEY) === "no"; } catch { return false; } };

export function InstallCard({ me }) {
  /* decided on the device after it mounts: the browser is the one asked */
  const [show, setShow] = useState(false);
  useEffect(() => { setShow(!readDismissed() && isIOS() && !isStandalone()); }, []);
  if (!me || !show) return null;
  const close = () => {
    try { localStorage.setItem(INSTALL_CARD_KEY, "no"); } catch {}
    setShow(false);
  };
  return <section className="fd-install-card fd-glass-field fd-field-info" aria-label="Add Field Day to your Home Screen">
    <InstallSteps />
    <button type="button" className="fd-install-card-close" onClick={close} aria-label="Dismiss"><Icon name="close" size={18} /></button>
  </section>;
}
