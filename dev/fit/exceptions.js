/* Documented exceptions to the fit audit: a finding that matches one is
   reported but does not fail the run. Each names the view (a regex over the
   view id), the rule, the element (a regex over its selector), and why it
   is right as it is. Keep this list short; a fix beats an exception. */
export const FIT_EXCEPTIONS = Object.freeze([
  { view:"^tv-geo", rule:"small", sel:"maplibregl-ctrl-attrib",
    reason:"the map tiles' licence notice (OpenFreeMap, OpenStreetMap), MapLibre's own control at its own size: a credit the licence requires, not text the room reads" },
  { view:"^tv-geo", rule:"overlap", sel:"fd-geo-marker|fd-geo-head",
    reason:"a guess's pin stands where the guess is: two people who guessed the same town share it, and that is the reveal" },
  { view:"^phone-.*geo", rule:"bounds", sel:"maplibregl-marker",
    reason:"a pin on the phone's full-bleed map is map content: panned to the screen's edge it runs off it with the map, as on any map" },
]);
