/* How wide a name or a line letters, in the widths of a Latin letter: the
   unit every fit estimate multiplies by its face's advance (`.47em` and the
   like). A Latin letter, digit, space or mark of punctuation is 1; a mark
   that sits on a letter (a stacked accent) is 0; a CJK or Hangul character
   or a fullwidth form takes about an em, 2.1 letters; an emoji about 1.2em,
   2.5, counted once for a joined sequence (a skin tone, a joiner, the second
   half of a flag add nothing). So a fit sized for "Chinh & Khoa" sizes
   "Chính 🍺 & 蔣家豪" for the room it really takes. Pure. */

const MARK = /\p{M}/u;
const WIDE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\u{3000}-\u{303F}\u{FF01}-\u{FF60}\u{FFE0}-\u{FFE6}]/u;
const EMOJI = /\p{Extended_Pictographic}/u;
const SILENT = /[\p{Join_Control}\p{Variation_Selector}\p{Emoji_Modifier}\u{E0020}-\u{E007F}]/u;
const FLAG = /\p{Regional_Indicator}/u;

export const WIDE_UNITS = 2.1;
export const EMOJI_UNITS = 2.5;

export function textUnits(text) {
  let units = 0, joined = false, flagHalf = false;
  for (const ch of String(text ?? "")) {
    if (MARK.test(ch) || SILENT.test(ch)) { joined = ch === "\u{200D}"; continue; }
    if (FLAG.test(ch)) { if (!flagHalf) units += EMOJI_UNITS; flagHalf = !flagHalf; joined = false; continue; }
    flagHalf = false;
    if (EMOJI.test(ch)) { if (!joined) units += EMOJI_UNITS; joined = false; continue; }
    joined = false;
    units += WIDE.test(ch) ? WIDE_UNITS : 1;
  }
  return units;
}

/* the widest word of a name, in the same units: what a box that wraps at
   spaces must hold on one line */
export const longestWordUnits = text => Math.max(0, ...String(text ?? "").split(/\s+/).map(textUnits));
