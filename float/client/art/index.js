/* Float's art (float/GROOVE.md "The art manifest and the 2D art module"):
   the Groove version draws in 2D from generated sprites, so this module
   imports no three.js. Field Day's gate (src/features/float/floatParts.js)
   loads it for riderPortrait; the screen and the phone use the rest.

     loadGrooveArt, riderSprites, riderPortrait, sceneOf, propOf, hostSprites
     and their helpers                       groove/index.js
     RiderSprite ({ critter, color, pose, groom, size })   groove/RiderSprite.jsx
     Popup ({ q, d, size, life })                          groove/Popup.jsx
     "Float Pixel", the popups' face                        groove/groove.css

   The 3D art (index3d.js and the files it imports) is parked, unimported,
   for the fallback on branch float/proto. */
export * from "./groove/index.js";
export { default as RiderSprite, useGrooveArt, useRiderSprites } from "./groove/RiderSprite.jsx";
export { default as Popup } from "./groove/Popup.jsx";

/* The parked 3D screen (float/client/screen/world) still names these until
   the 2D screen replaces it; here they draw nothing. */
const parked = name => () => { throw new Error(`Float's 3D art is parked (${name}): the Groove screen draws in 2D`); };
export const buildRider = parked("buildRider");
export const floatEnvironment = parked("floatEnvironment");
export function disposeFloatEnvironment() {}
export function setFloatArtQuality() {}
export function disposeFloatArt() {}
