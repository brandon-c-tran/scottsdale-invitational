/* Big Shoulders Display for competition, the system face for controls. All surfaces use the
   shared warm dark palette in experience.css. */
const DISPLAY = "var(--fd-display)";
const SANS = "var(--fd-body)";
const BONE = "var(--bone)";
const GOLD_GRAD = "var(--sun)";
const EMBER_GRAD = "var(--accent)";
const CARD_BG = "var(--paper)";
const GRAIN = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E\")";
const label = { fontFamily:DISPLAY, fontWeight:700, fontSize:14, letterSpacing:"0.06em", color:"var(--muted2)", textTransform:"uppercase" };
const pStyle = { fontFamily:SANS, fontSize:14, lineHeight:1.6, color:"var(--muted2)", marginBottom:14 };

export {
  DISPLAY, SANS, BONE, GOLD_GRAD, EMBER_GRAD, CARD_BG, GRAIN, label, pStyle,
};
