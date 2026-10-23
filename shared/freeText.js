/* Free text a guest or the commissioner writes (a display name, an event's
   name, a ruling's reason, a Trivia question, a Where and When place),
   made safe to letter on any screen before the server keeps it:

   - control characters out (a tab or a line break becomes a space, unless
     `lines` keeps line breaks for a multi-line note)
   - invisible format marks out: direction overrides and isolates, zero
     width spaces, a byte-order mark. The joiners and the emoji tag
     characters stay, so a typed emoji keeps its shape
   - runs of spaces squeezed to one, the ends trimmed
   - at most `max` UTF-16 units (what a field's maxLength counts), cut at a
     character boundary: never inside an emoji's surrogate pair, never on a
     dangling joiner

   Used by the write paths only (worker/actions.js and the game reducers),
   never on load, so what is already stored is never rewritten. Pure. */

/* Cc and Cf, less the joiners (U+200C, U+200D) and the tag characters
   (U+E0020 to U+E007F, a subdivision flag's) */
const INVISIBLE = /(?![\p{Join_Control}\u{E0020}-\u{E007F}])[\p{Cc}\p{Cf}]/gu;
/* the line and paragraph separators */
const SEPARATORS = /[\p{Zl}\p{Zp}]/gu;
const DANGLING = /[\p{Join_Control}\p{Variation_Selector}]+$/u;

export function cleanFreeText(value, max = Infinity, { lines = false } = {}) {
  if (typeof value !== "string") return "";
  let text = value.normalize("NFC").replace(/\r\n?/g, "\n").replace(SEPARATORS, lines ? "\n" : " ");
  /* a control that spaces (a tab, a line break) leaves a space; the rest leave nothing */
  text = text.replace(INVISIBLE, ch => lines && ch === "\n" ? "\n" : /[\t\n\v\f\r]/.test(ch) ? " " : "");
  text = lines
    ? text.split("\n").map(line => line.replace(/\s+/g, " ").trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim()
    : text.replace(/\s+/g, " ").trim();
  return capText(text, max);
}

/* `text` cut to `max` UTF-16 units at a character boundary */
export function capText(text, max = Infinity) {
  const value = String(text ?? "");
  if (!(value.length > max)) return value;
  let cut = value.slice(0, Math.max(0, max));
  /* a high surrogate whose pair was cut off */
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xD800 && last <= 0xDBFF) cut = cut.slice(0, -1);
  /* a joiner or variation selector left with nothing to join */
  return cut.replace(DANGLING, "").trimEnd();
}
