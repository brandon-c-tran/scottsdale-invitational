/* Documented exceptions to the fit audit: a finding that matches one is
   reported but does not fail the run. Each names the view (a regex over the
   view id), the rule, the element (a regex over its selector), and why it
   is right as it is. Keep this list short; a fix beats an exception. */
export const FIT_EXCEPTIONS = Object.freeze([
  { view:"^phone-", rule:"overlap", sel:"fd-spot-hit",
    reason:"a betting spot is its own bet target, laid under its printed content (faces, %, chips), which ignores taps; the faces and stacks over it are their own targets (a card, your last chip back), as on a roulette layout" },
  { view:"^tv-(worst-)?geo", rule:"small", sel:"maplibregl-ctrl-attrib",
    reason:"the map tiles' licence notice (OpenFreeMap, OpenStreetMap), MapLibre's own control at its own size: a credit the licence requires, not text the room reads" },
  { view:"^tv-(worst-)?geo", rule:"overlap", sel:"fd-geo-marker|fd-geo-head",
    reason:"a guess's pin stands where the guess is: two people who guessed the same town share it, and that is the reveal" },
  { view:"^phone-.*geo", rule:"bounds", sel:"maplibregl-marker",
    reason:"a pin on the phone's full-bleed map is map content: panned to the screen's edge it runs off it with the map, as on any map" },
  { view:"sheet-profile$", rule:"overlap", sel:"fd-profile-save",
    reason:"the profile's Save rides the sheet's foot (sticky) so it is always in reach; the fields under the card scroll up past it" },
  { view:"sheet-profile$", rule:"overlap", sel:"fd-profile-controls",
    reason:"the same sticky Save, measured from the other side: the chip and pattern labels under it scroll up past it" },
  { view:"sheet-profile-song$", rule:"overlap", sel:"fd-song-remove",
    reason:"the same sticky Save over the Win song section's last control: with the page at its full height, where the Save rests in its own place as at the end of a scroll, Remove song stands 16px above it" },
  { view:"^tv-(felt|bracket|worst-ticker-deck|worst-bracket-pairs)", rule:"clip", sel:"^g > g > svg > text$", text:"^([A-Z]{1,2}|[一-鿿가-힣]{1})$",
    reason:"a crowded felt's (or a bracket board's bet stacks') smallest chips (32px) letter a face's initials at the TV's 24px floor: the font's line box overhangs the chip's own picture, the capitals (.72em) stand inside it, as does a CJK name's one character (.88em)" },
  { view:"^tv-showdown-draw$", rule:"overlap", sel:"tv-showdown",
    reason:"Quick Draw's flash is the whole glass lit opaque magenta with DRAW on it for its beat; the faced-off chips under it step out (visibility) for that beat and the frame shows only the flash" },
]);
