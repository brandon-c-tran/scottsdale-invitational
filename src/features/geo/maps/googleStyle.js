/* Google's map in the Backglass world: blue-black land, teal-black water so
   every coast reads, roads as faint lines that brighten with their class,
   bone place names over a dark halo, parks a deep green. Landmarks,
   parks, schools and stadiums keep their names (they are what a guess is
   made from); shops and businesses go. A JSON style, so no Map ID. */
export const BACKGLASS_MAP_STYLE = Object.freeze([
  { elementType:"geometry", stylers:[{ color:"#151a2b" }] },
  { elementType:"labels.text.fill", stylers:[{ color:"#d9d2e3" }] },
  { elementType:"labels.text.stroke", stylers:[{ color:"#090b14" }, { weight:3 }] },
  { elementType:"labels.icon", stylers:[{ saturation:-60 }, { lightness:-15 }] },
  { featureType:"administrative", elementType:"geometry.stroke", stylers:[{ color:"#4a5274" }] },
  { featureType:"administrative.country", elementType:"labels.text.fill", stylers:[{ color:"#f4ecd8" }] },
  { featureType:"administrative.province", elementType:"geometry.stroke", stylers:[{ color:"#3a4262" }] },
  { featureType:"administrative.locality", elementType:"labels.text.fill", stylers:[{ color:"#f4ecd8" }] },
  { featureType:"administrative.neighborhood", elementType:"labels.text.fill", stylers:[{ color:"#b2abc2" }] },
  { featureType:"administrative.land_parcel", stylers:[{ visibility:"off" }] },
  { featureType:"landscape.natural", elementType:"geometry", stylers:[{ color:"#171d30" }] },
  { featureType:"landscape.man_made", elementType:"geometry", stylers:[{ color:"#1b2136" }] },
  { featureType:"poi", elementType:"geometry", stylers:[{ color:"#1b2033" }] },
  { featureType:"poi", elementType:"labels.text.fill", stylers:[{ color:"#c9c2d6" }] },
  { featureType:"poi.business", stylers:[{ visibility:"off" }] },
  { featureType:"poi.park", elementType:"geometry", stylers:[{ color:"#16291f" }] },
  { featureType:"poi.park", elementType:"labels.text.fill", stylers:[{ color:"#9fc96a" }] },
  { featureType:"road", elementType:"geometry", stylers:[{ color:"#262d45" }] },
  { featureType:"road", elementType:"geometry.stroke", stylers:[{ color:"#121626" }] },
  { featureType:"road", elementType:"labels.text.fill", stylers:[{ color:"#b2abc2" }] },
  { featureType:"road.arterial", elementType:"geometry", stylers:[{ color:"#2e3651" }] },
  { featureType:"road.highway", elementType:"geometry", stylers:[{ color:"#3b4566" }] },
  { featureType:"road.highway", elementType:"geometry.stroke", stylers:[{ color:"#151a2b" }] },
  { featureType:"road.highway", elementType:"labels.text.fill", stylers:[{ color:"#d9d2e3" }] },
  { featureType:"transit", elementType:"geometry", stylers:[{ color:"#232a40" }] },
  { featureType:"transit.station", elementType:"labels.text.fill", stylers:[{ color:"#b2abc2" }] },
  { featureType:"water", elementType:"geometry", stylers:[{ color:"#0a1d29" }] },
  { featureType:"water", elementType:"labels.text.fill", stylers:[{ color:"#5fb8d6" }] },
  { featureType:"water", elementType:"labels.text.stroke", stylers:[{ color:"#06121a" }] },
]);
/* what shows behind tiles still loading */
export const BACKGLASS_MAP_BACKGROUND = "#090b14";
