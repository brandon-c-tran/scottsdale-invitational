/* Google's browser key for Where and When's map, as the newest frame gave
   it (capabilities.googleMaps + mapsKey): the transport writes it, the map
   reads it. Kept apart from client.js so a rehearsal or a test that stands
   in for the transport simply has no key, and gets MapLibre. */
let current = { capabilities:{ googleMaps:false }, mapsKey:null };
export function noteMapsKey(capabilities, mapsKey) {
  current = { capabilities:{ googleMaps:capabilities?.googleMaps === true }, mapsKey:typeof mapsKey === "string" ? mapsKey : null };
}
export const mapsKeyFrame = () => current;
