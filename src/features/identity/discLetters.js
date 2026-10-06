/* How a person disc letters itself when it has no photo. A person is never
   a bare color: the disc carries the photo, else the initials, at the
   surface's text floor (12px phone, 24px TV) or larger. Pure, so the
   render, the tests and the fit audit agree.

   Big Shoulders at 800 runs about half an em a capital and its caps stand
   about .72em, so two capitals at f px need a box about f wide and .72f
   tall, and one capital about .55f by .72f. */

/* overlapping discs smaller than this cut each other's letters: under it a
   group stands in a row (AvatarStack, the cup's plate faces) */
export const DISC_OVERLAP_MIN = 32;
/* how far an overlapped disc tucks under the next, as a share of its size:
   the next disc stops short of the letters in the middle */
export const DISC_OVERLAP = 0.2;

const letters = initials => {
  const two = String(initials || "").slice(0, 2);
  return { two, one:two.slice(0, 1) };
};

/* An Avatar is all plate (the player's color, stepped to hold 4.5:1): two
   letters at .42 of the disc, never under the floor, while they fit inside
   the ring; below that, the first letter at the floor. */
export function avatarLetters(size, floor = 12, initials = "") {
  const { two, one } = letters(initials);
  const px = Math.max(floor, Math.round(size * 0.42));
  if (two.length > 1 && size >= px * 1.5) return { text:two, px };
  return { text:one, px:floor };
}

/* A ChipFace keeps its edge (the skin) and letters a plate in the middle,
   in the chip's own 32-unit box. Large chips letter the standard plate
   (r 8.75); a chip too small for that widens the plate over the skin (r
   12.6) so the initials still reach the floor; past that, one letter, on
   the whole face if it has to. */
export const CHIP_PLATE = Object.freeze({ standard:8.75, wide:12.6, full:14.7 });
const INITIALS_UNITS = 13;
export function chipLetters(size, floor = 12, initials = "") {
  const { two, one } = letters(initials);
  if (!two) return { text:"", units:0, r:CHIP_PLATE.standard };
  /* the floor in the chip's units */
  const f = floor * 32 / Math.max(1, size);
  if (two.length > 1 && size >= floor * 2.2) return { text:two, units:Math.max(INITIALS_UNITS, f), r:CHIP_PLATE.standard };
  if (two.length > 1 && f <= 19) return { text:two, units:f, r:CHIP_PLATE.wide };
  if (f <= 26) return { text:one, units:f, r:CHIP_PLATE.wide };
  return { text:one, units:f, r:CHIP_PLATE.full };
}

/* a photo stays legible small by taking the wide plate's room */
export const PHOTO_WIDE_UNDER = 30;
export const chipPhotoRadius = size => size < PHOTO_WIDE_UNDER ? CHIP_PLATE.wide : 9.3;
